# PowerShell Batch Asset Generator
$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path client/public/models/landmarks, client/public/models/hqs | Out-Null

Write-Host "===> Generating 10 Landmarks..." -ForegroundColor Cyan
blender --background --python scripts/generators/landmarks/build_all_landmarks.py

Write-Host "===> Generating 10 School HQs..." -ForegroundColor Cyan
blender --background --python scripts/generators/hqs/build_all_hqs.py

Write-Host "===> Generating Manifest files..." -ForegroundColor Cyan
python scripts/create_manifests.py

Write-Host "===> Asset Pipeline Completed Successfully!" -ForegroundColor Green
