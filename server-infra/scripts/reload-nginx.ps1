# Nginx에 갱신된 PEM을 다시 읽힌다. win-acme 후처리 또는 renew-certs.ps1에서 호출.
# nginx는 성공 메시지도 stderr로 내므로 native stderr를 종료 오류로 취급하지 않는다.
$ErrorActionPreference = 'Continue'

$nginxDir = 'C:\Nginx\nginx-1.28.0'
$nginxExe = Join-Path $nginxDir 'nginx.exe'

if (-not (Test-Path $nginxExe)) {
    throw "nginx.exe not found: $nginxExe"
}

$testOut = & $nginxExe -p "$nginxDir/" -t 2>&1 | ForEach-Object { "$_" }
$testExit = $LASTEXITCODE
Write-Host ($testOut -join "`n")
if ($testExit -ne 0) {
    throw "nginx config test failed (exit $testExit)"
}

$reloadOut = & $nginxExe -p "$nginxDir/" -s reload 2>&1 | ForEach-Object { "$_" }
$reloadExit = $LASTEXITCODE
Write-Host ($reloadOut -join "`n")
if ($reloadExit -ne 0) {
    throw "nginx reload failed (exit $reloadExit)"
}

Write-Host "nginx reloaded"
