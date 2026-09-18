# Let's Encrypt 인증서 갱신 + Nginx 재로드
# Windows 작업 스케줄러가 매일 이 파일을 실행한다.
param(
    [switch]$Force
)

$ErrorActionPreference = 'Continue'

$wacs = 'C:\win-acme\wacs.exe'
$reloadScript = Join-Path $PSScriptRoot 'reload-nginx.ps1'
$logDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'logs'
$logFile = Join-Path $logDir ("renew-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$Message) {
    $line = "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $Message
    $line | Tee-Object -FilePath $logFile -Append
}

if (-not (Test-Path $wacs)) {
    Write-Log "ERROR: wacs.exe not found: $wacs"
    exit 1
}

Write-Log "start renew Force=$Force"
Set-Location 'C:\win-acme'

$wacsArgs = @('--renew')
if ($Force) { $wacsArgs += '--force' }

& $wacs @wacsArgs *>&1 | ForEach-Object {
    Write-Log ($_ | Out-String).TrimEnd()
}
$renewExit = $LASTEXITCODE
Write-Log "wacs exit=$renewExit"

try {
    $reloadOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $reloadScript 2>&1 | ForEach-Object { "$_" }
    $reloadExit = $LASTEXITCODE
    foreach ($line in $reloadOutput) { Write-Log $line }
    if ($reloadExit -ne 0) {
        Write-Log "ERROR: nginx reload exit=$reloadExit"
        exit $reloadExit
    }
}
catch {
    Write-Log "ERROR: nginx reload failed: $_"
    exit 1
}

Write-Log "done"
exit $renewExit
