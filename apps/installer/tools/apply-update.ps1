#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installs a downloaded School CBT update and rolls back if the server does not
  come back healthy.

.DESCRIPTION
  Spec: docs/CBT-04-Build-Specification.md section 6.4. The exam server service
  runs as LocalService, so it cannot replace its own files under Program Files;
  this script does the swap in an elevated process:

    1. stop the service
    2. back up the database and the mutable part of the install folder
    3. run the downloaded installer silently
    4. start the service and poll /api/v1/exam/status for up to -HealthTimeoutSeconds
    5. on failure restore the backup, restart and report update_failed

  The result is written to -ResultFile, which the exam server reads back and
  reports in its next heartbeat.

.PARAMETER Package
  The downloaded installer, normally
  %ProgramData%\SchoolCBT\data\updates\SchoolCBT-Setup-<version>.exe.

.PARAMETER DataDir
  The data folder created by the installer. Defaults to %ProgramData%\SchoolCBT\data.

.PARAMETER ResultFile
  Where the JSON result is written. Defaults to <DataDir>\updates\last-result.json.

.EXAMPLE
  .\apply-update.ps1 -Package "$env:ProgramData\SchoolCBT\data\updates\SchoolCBT-Setup-1.0.4.exe"

.NOTES
  Migrations are forward-only, so a rollback restores the pre-update database
  backup rather than migrating back down.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Package,
  [string]$DataDir = (Join-Path $env:ProgramData 'SchoolCBT\data'),
  [string]$ServiceName = 'SchoolCBT',
  [int]$Port = 8080,
  [int]$HealthTimeoutSeconds = 60,
  [string]$ResultFile
)

$ErrorActionPreference = 'Stop'

if (-not $ResultFile) { $ResultFile = Join-Path $DataDir 'updates\last-result.json' }

# <install>\tools\apply-update.ps1 -> <install>
$installDir = Split-Path -Parent $PSScriptRoot
$serviceExe = Join-Path $installDir 'SchoolCBT.exe'
$appDir = Join-Path $installDir 'app'
$versionFile = Join-Path $installDir 'VERSION.txt'
$dbPath = Join-Path $DataDir 'school.db'
$dataRoot = Split-Path -Parent $DataDir
$backupRoot = Join-Path $dataRoot 'backups\pre-update'
$logPath = Join-Path $dataRoot 'logs\apply-update.log'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$appBackup = Join-Path $backupRoot "app-$stamp"
$dbBackup = Join-Path $backupRoot "uninstall-$stamp.db"

# Files an update may replace and a rollback therefore has to restore.
$mutable = @('app', 'node.exe', 'SchoolCBT.xml', 'VERSION.txt')

function Write-Log([string]$Message) {
  $line = '{0} {1}' -f (Get-Date).ToUniversalTime().ToString('o'), $Message
  Write-Host $line
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logPath) | Out-Null
    Add-Content -Path $logPath -Value $line
  } catch {
    # Logging must never break the update.
  }
}

function Get-PackageVersion {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($Package)
  $match = [regex]::Match($name, '(\d+\.\d+\.\d+(\.\d+)?)')
  if ($match.Success) { return $match.Groups[1].Value }
  return 'unknown'
}

function Write-Result([string]$Status, [string]$Version, [string]$Detail) {
  $payload = [ordered]@{
    status  = $Status
    version = $Version
    at      = (Get-Date).ToUniversalTime().ToString('o')
    detail  = $Detail
  } | ConvertTo-Json -Compress
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ResultFile) | Out-Null
  Set-Content -Path $ResultFile -Value $payload -Encoding ASCII
  Write-Log "result: $payload"
}

function Invoke-Service([string]$Action) {
  if (-not (Test-Path $serviceExe)) { return }
  & $serviceExe $Action | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Log "service $Action returned $LASTEXITCODE" }
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

function Restore-Previous {
  Write-Log 'restoring the previous install'
  foreach ($item in $mutable) {
    $target = Join-Path $installDir $item
    $source = Join-Path $appBackup $item
    if (Test-Path $target) { Remove-Item -Path $target -Recurse -Force }
    if (Test-Path $source) { Copy-Item -Path $source -Destination $target -Recurse -Force }
  }
  if (Test-Path $dbBackup) { Copy-Item -Path $dbBackup -Destination $dbPath -Force }
}

function Remove-OldBackups {
  if (-not (Test-Path $backupRoot)) { return }
  Get-ChildItem -Path $backupRoot -Directory -Filter 'app-*' |
    Sort-Object Name -Descending |
    Select-Object -Skip 2 |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $Package)) { Write-Result 'update_failed' (Get-PackageVersion) "Package not found: $Package"; exit 1 }
if (-not (Test-Path $serviceExe)) { Write-Result 'update_failed' (Get-PackageVersion) "Service wrapper not found: $serviceExe"; exit 1 }

Write-Log "starting update from $Package"

# Let the HTTP response that told the invigilator "applying" flush before the
# service goes away.
Start-Sleep -Seconds 5

Invoke-Service 'stop'

New-Item -ItemType Directory -Force -Path $appBackup | Out-Null
foreach ($item in $mutable) {
  $source = Join-Path $installDir $item
  if (Test-Path $source) {
    Copy-Item -Path $source -Destination (Join-Path $appBackup $item) -Recurse -Force
  }
}
if (Test-Path $dbPath) {
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  Copy-Item -Path $dbPath -Destination $dbBackup -Force
}
Write-Log "backed up to $appBackup"

$install = Start-Process -FilePath $Package `
  -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/TASKS=""' `
  -Wait -PassThru
Write-Log "installer exited with $($install.ExitCode)"

Invoke-Service 'start'

$version = if (Test-Path $versionFile) { (Get-Content -Path $versionFile -Raw).Trim() } else { Get-PackageVersion }

if (Test-Healthy $HealthTimeoutSeconds) {
  Remove-OldBackups
  Write-Result 'applied' $version "healthy after update"
  exit 0
}

Write-Log "server was not healthy within $HealthTimeoutSeconds seconds; rolling back"
Invoke-Service 'stop'
Restore-Previous
Invoke-Service 'start'

if (Test-Healthy $HealthTimeoutSeconds) {
  Write-Result 'update_failed' $version "rolled back to the previous version"
  exit 1
}

Write-Result 'update_failed' $version 'rolled back but the server is still unhealthy'
exit 1
