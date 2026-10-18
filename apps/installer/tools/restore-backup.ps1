#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Restores a School CBT database backup and rolls back if the server does not
  come back healthy.

.DESCRIPTION
  Spec: docs/CBT-04-Build-Specification.md section 6.6, US-15.5. The exam server
  service runs as LocalService, so it cannot safely replace its own database
  file; this script does it in an elevated process:

    1. check the backup is a SQLite database
    2. stop the service
    3. copy the current database to <DataDir>\..\backups\pre-restore
    4. remove the WAL files and copy the backup over school.db
    5. start the service and poll /api/v1/exam/status for up to -HealthTimeoutSeconds
    6. on failure put the safety copy back, restart and report restore_failed

  The result is written to -ResultFile, which the exam server reads back and
  reports on the console.

.PARAMETER Backup
  The database file to restore, normally one of the files listed by
  `GET /api/v1/console/restore`.

.PARAMETER DataDir
  The data folder created by the installer. Defaults to %ProgramData%\SchoolCBT\data.

.PARAMETER ResultFile
  Where the JSON result is written. Defaults to <DataDir>\..\backups\last-restore.json.

.EXAMPLE
  .\restore-backup.ps1 -Backup 'C:\ProgramData\SchoolCBT\backups\school-20261018-221530.db'

.NOTES
  Only run this outside exam hours: the service stops and every connected exam
  client is disconnected. The console refuses to start a restore while a sitting
  is open or starts within two hours.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Backup,
  [string]$DataDir = (Join-Path $env:ProgramData 'SchoolCBT\data'),
  [string]$ServiceName = 'SchoolCBT',
  [int]$Port = 8080,
  [int]$HealthTimeoutSeconds = 60,
  [string]$ResultFile
)

$ErrorActionPreference = 'Stop'

$dataRoot = Split-Path -Parent $DataDir
$backupRoot = Join-Path $dataRoot 'backups'
if (-not $ResultFile) { $ResultFile = Join-Path $backupRoot 'last-restore.json' }

$serviceExe = Join-Path (Split-Path -Parent $PSScriptRoot) 'SchoolCBT.exe'
$dbPath = Join-Path $DataDir 'school.db'
$safetyDir = Join-Path $backupRoot 'pre-restore'
$logPath = Join-Path $dataRoot 'logs\restore-backup.log'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$safetyCopy = Join-Path $safetyDir "school-$stamp.db"

function Write-Log([string]$Message) {
  $line = '{0} {1}' -f (Get-Date).ToUniversalTime().ToString('o'), $Message
  Write-Host $line
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logPath) | Out-Null
    Add-Content -Path $logPath -Value $line
  } catch {
    # Logging must never break the restore.
  }
}

function Write-Result([string]$Status, [string]$Detail) {
  $safety = $null
  if (Test-Path $safetyCopy) { $safety = $safetyCopy }
  $payload = [ordered]@{
    status      = $Status
    source      = $Backup
    at          = (Get-Date).ToUniversalTime().ToString('o')
    safety_copy = $safety
    detail      = $Detail
  } | ConvertTo-Json -Compress
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ResultFile) | Out-Null
  Set-Content -Path $ResultFile -Value $payload -Encoding ASCII
  Write-Log "result: $payload"
}

function Test-Sqlite([string]$Path) {
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    try {
      $buffer = New-Object byte[] 16
      $read = $stream.Read($buffer, 0, 16)
      if ($read -lt 16) { return $false }
      $header = [System.Text.Encoding]::ASCII.GetString($buffer)
      return $header -eq "SQLite format 3$([char]0)"
    } finally {
      $stream.Dispose()
    }
  } catch {
    return $false
  }
}

function Invoke-Service([string]$Action) {
  if (-not (Test-Path $serviceExe)) { return }
  & $serviceExe $Action | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Log "service $Action returned $LASTEXITCODE" }
}

function Remove-Sidecars {
  Remove-Item -Path "$dbPath-wal" -Force -ErrorAction SilentlyContinue
  Remove-Item -Path "$dbPath-shm" -Force -ErrorAction SilentlyContinue
}

function Test-Healthy([int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $url = "http://127.0.0.1:$Port/api/v1/exam/status"
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5
      if ($response.StatusCode -eq 200) { return $true }
    } catch {
      # Not up yet.
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Remove-OldSafetyCopies {
  if (-not (Test-Path $safetyDir)) { return }
  Get-ChildItem -Path $safetyDir -Filter 'school-*.db' |
    Sort-Object Name -Descending |
    Select-Object -Skip 3 |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $Backup)) { Write-Result 'restore_failed' "Backup not found: $Backup"; exit 1 }
if (-not (Test-Path $serviceExe)) { Write-Result 'restore_failed' "Service wrapper not found: $serviceExe"; exit 1 }
if (-not (Test-Sqlite $Backup)) { Write-Result 'restore_failed' "Not a SQLite database: $Backup"; exit 1 }

Write-Log "starting restore from $Backup"

# Let the HTTP response that told the invigilator "restoring" flush before the
# service goes away.
Start-Sleep -Seconds 5

$hadDatabase = Test-Path $dbPath

Invoke-Service 'stop'

if ($hadDatabase) {
  New-Item -ItemType Directory -Force -Path $safetyDir | Out-Null
  Copy-Item -Path $dbPath -Destination $safetyCopy -Force
  Write-Log "safety copy written to $safetyCopy"
}

Remove-Sidecars
Copy-Item -Path $Backup -Destination $dbPath -Force
Write-Log "copied $Backup over $dbPath"

Invoke-Service 'start'

if (Test-Healthy $HealthTimeoutSeconds) {
  Remove-OldSafetyCopies
  Write-Result 'restored' 'healthy after restore'
  exit 0
}

Write-Log "server was not healthy within $HealthTimeoutSeconds seconds; rolling back"
Invoke-Service 'stop'

if (Test-Path $safetyCopy) {
  Remove-Sidecars
  Copy-Item -Path $safetyCopy -Destination $dbPath -Force
  Write-Log 'put the previous database back'
}

Invoke-Service 'start'

if (Test-Healthy $HealthTimeoutSeconds) {
  Write-Result 'restore_failed' 'rolled back to the previous database'
  exit 1
}

Write-Result 'restore_failed' 'rolled back but the server is still unhealthy'
exit 1
