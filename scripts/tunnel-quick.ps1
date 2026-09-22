# scripts/tunnel-quick.ps1
# Chạy Cloudflare Quick Tunnel thông thẳng game ra Internet với link *.trycloudflare.com miễn phí
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
    Write-Host "Vui lòng cài đặt: npm i -g cloudflared hoặc tải từ https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  KHỞI ĐỘNG CLOUDFLARE QUICK TUNNEL (LAND RUSH)         " -ForegroundColor Cyan
Write-Host "  Port mục tiêu: http://localhost:2567                  " -ForegroundColor Yellow
Write-Host "  (Phục vụ cả Web 3D Client và Colyseus WebSocket)      " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Đang kết nối tới Cloudflare Edge, vui lòng đợi link *.trycloudflare.com..." -ForegroundColor Green

& $bin tunnel --url http://localhost:2567
