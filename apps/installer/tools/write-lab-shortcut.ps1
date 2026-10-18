<#
.SYNOPSIS
  Writes the lab PC shortcut files for the exam server.

.DESCRIPTION
  Spec: CBT-04 section 6.6. Produces two files in -OutputDirectory that can be
  copied to every lab PC:
    SchoolCBT-Exam.url   a plain shortcut to the login screen
    SchoolCBT-Exam.bat   opens Chrome/Edge in kiosk mode with the seat label
                         taken from %COMPUTERNAME% so one file works everywhere

  If -ServerAddress is omitted the server's LAN IPv4 address is detected.

.EXAMPLE
  .\write-lab-shortcut.ps1
  .\write-lab-shortcut.ps1 -ServerAddress http://192.168.1.10:8080
#>
[CmdletBinding()]
param(
  [string]$ServerAddress,
  [int]$Port = 8080,
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\lab')
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ServerAddress)) {
  $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -First 1 -ExpandProperty IPAddress
  if (-not $ip) { $ip = '127.0.0.1' }
  $ServerAddress = "http://${ip}:$Port"
}

# Tolerate a trailing slash in the address.
$server = $ServerAddress.TrimEnd('/')
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output | Out-Null

$urlPath = Join-Path $output 'SchoolCBT-Exam.url'
@"
[InternetShortcut]
URL=$server/
"@ | Set-Content -Path $urlPath -Encoding ASCII

$batPath = Join-Path $output 'SchoolCBT-Exam.bat'
@"
@echo off
rem School CBT exam client. Seat label comes from the PC name.
setlocal
set "SERVER=$server"
set "SEAT=%COMPUTERNAME%"
set "PROFILE=%LOCALAPPDATA%\SchoolCBT\browser"

set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
  echo Could not find Chrome or Edge. Opening the default browser instead.
  start "" "%SERVER%/?seat=%SEAT%"
  exit /b 0
)

"%BROWSER%" --kiosk --disable-pinch --overscroll-history-navigation=0 --user-data-dir="%PROFILE%" "%SERVER%/?seat=%SEAT%"
"@ | Set-Content -Path $batPath -Encoding ASCII

Write-Host "Wrote $urlPath"
Write-Host "Wrote $batPath"
