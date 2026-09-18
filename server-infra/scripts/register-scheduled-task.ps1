# 매일 09:00에 인증서 갱신을 돌리는 Windows 작업을 등록한다.
# 암호화된 win-acme 설정은 발급 계정(DPAPI)에 묶이므로 현재 사용자로 실행해야 한다.
$ErrorActionPreference = 'Stop'

$taskName = 'win-acme-renew'
$script = Join-Path $PSScriptRoot 'renew-certs.ps1'
if (-not (Test-Path $script)) {
    throw "renew script not found: $script"
}

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""

$trigger = New-ScheduledTaskTrigger -Daily -At 9:00AM

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description 'win-acme로 Let''s Encrypt 인증서를 갱신하고 Nginx를 reload한다.' `
    -Force | Out-Null

Write-Host "scheduled task registered: $taskName"
Get-ScheduledTask -TaskName $taskName | Format-List TaskName, State, TaskPath
