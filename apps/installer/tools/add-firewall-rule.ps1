<#
.SYNOPSIS
  Adds the inbound firewall rule for the exam server, scoped to the local subnet.

.DESCRIPTION
  Spec: CBT-04 section 6.3 step 5. Only PCs on the same subnet may reach the
  server; a PC on a different subnet cannot (acceptance test, section M12).
  Equivalent to:
    netsh advfirewall firewall add rule name="SchoolCBT" dir=in action=allow `
      protocol=TCP localport=8080 remoteip=LocalSubnet profile=any
  Idempotent: an existing rule with the same name is replaced.
#>
[CmdletBinding()]
param(
  [int]$Port = 8080,
  [string]$RuleName = 'SchoolCBT'
)

$ErrorActionPreference = 'Stop'

if (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName $RuleName
}

New-NetFirewallRule `
  -DisplayName $RuleName `
  -Description 'School CBT exam server (local subnet only)' `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -RemoteAddress LocalSubnet `
  -Profile Any | Out-Null

Write-Host "Firewall rule '$RuleName' added: allow TCP $Port from LocalSubnet."
