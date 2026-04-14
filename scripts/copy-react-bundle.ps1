<#
    Build the React WebView bundle and copy it into the WPF project's
    wwwroot folder so that WebView2 can load shell.html + pages.js at runtime.

    Run this after changing any React code before you rebuild the WPF project.

    Usage (from repo root):
        pwsh ./scripts/copy-react-bundle.ps1
#>

$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$reactDir   = Join-Path $repoRoot 'react-app'
$wpfWwwRoot = Join-Path $repoRoot 'wpf-host/WpfReactHost/wwwroot'

Write-Host "[1/3] Installing React dependencies..." -ForegroundColor Cyan
Push-Location $reactDir
try {
    if (-not (Test-Path 'node_modules')) {
        npm install
    }

    Write-Host "[2/3] Building WebView bundle..." -ForegroundColor Cyan
    npm run build:webview
}
finally {
    Pop-Location
}

Write-Host "[3/3] Copying bundle into WPF wwwroot..." -ForegroundColor Cyan
if (Test-Path $wpfWwwRoot) {
    Remove-Item -Recurse -Force $wpfWwwRoot
}
New-Item -ItemType Directory -Path $wpfWwwRoot | Out-Null

# dist-webview contains pages.js; shell.html lives in public/ and is copied by Vite
Copy-Item (Join-Path $reactDir 'dist-webview/*') $wpfWwwRoot -Recurse
Copy-Item (Join-Path $reactDir 'public/shell.html') $wpfWwwRoot

Write-Host "Done. wwwroot contents:" -ForegroundColor Green
Get-ChildItem $wpfWwwRoot | Format-Table Name, Length
