# scripts/tunnel-named.ps1
# Chạy Cloudflare Named Tunnel theo file config.yml
$ErrorActionPreference = "Stop"

$cloudflaredPaths = @(
    "C:\Users\AMTECH\node_modules\cloudflared\bin\cloudflared.exe",
    (Get-Command cloudflared -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
)

$bin = $null
foreach ($path in $cloudflaredPaths) {
    if ($path -and (Test-Path $path)) {
        $bin = $path
        break
    }
}

if (-not $bin) {
    Write-Host "[ERROR] Không tìm thấy cloudflared.exe!" -ForegroundColor Red
    exit 1
}

$configFile = "$PSScriptRoot\..\tunnel\config.yml"
if (-not (Test-Path $configFile)) {
    Write-Host "[WARNING] Chưa tìm thấy tunnel\config.yml!" -ForegroundColor Yellow
    Write-Host "Vui lòng copy từ tunnel\config.example.yml sang tunnel\config.yml và điền UUID tunnel của bạn." -ForegroundColor Yellow
    Write-Host "Chuyển hướng sang chạy Quick Tunnel tạm thời..." -ForegroundColor Cyan
    & $bin tunnel --url http://localhost:2567
    exit 0
}

Write-Host "[INFO] Đang chạy Cloudflare Tunnel với file cấu hình: $configFile" -ForegroundColor Green
& $bin tunnel --config $configFile run
