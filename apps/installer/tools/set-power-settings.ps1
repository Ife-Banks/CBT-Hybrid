<#
.SYNOPSIS
  Disables sleep and hibernate so the lab PC stays reachable during exams.

.DESCRIPTION
  Spec: CBT-04 section 6.3 step 6. Applies to AC power only and deliberately
  leaves the monitor timeout untouched.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
powercfg /hibernate off

Write-Host 'Power settings applied: sleep, hibernate and disk sleep disabled on AC.'
