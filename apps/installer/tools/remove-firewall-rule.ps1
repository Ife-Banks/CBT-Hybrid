<#
.SYNOPSIS
  Removes the exam server firewall rule created by add-firewall-rule.ps1.
#>
[CmdletBinding()]
param(
  [string]$RuleName = 'SchoolCBT'
)

$ErrorActionPreference = 'Stop'

if (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName $RuleName
  Write-Host "Firewall rule '$RuleName' removed."
} else {
  Write-Host "No firewall rule named '$RuleName'; nothing to do."
}
