#!/usr/bin/env bash
#
# Build the React WebView bundle and copy it into the WPF project's
# wwwroot folder so that WebView2 can load shell.html + pages.js at runtime.
#
# Run this after changing any React code before you rebuild the WPF project.
#
# Usage (from repo root):
#     ./scripts/copy-react-bundle.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
react_dir="$repo_root/react-app"
wpf_wwwroot="$repo_root/wpf-host/WpfReactHost/wwwroot"

echo "[1/3] Installing React dependencies..."
cd "$react_dir"
if [ ! -d node_modules ]; then
    npm install
fi

echo "[2/3] Building WebView bundle..."
npm run build:webview

echo "[3/3] Copying bundle into WPF wwwroot..."
rm -rf "$wpf_wwwroot"
mkdir -p "$wpf_wwwroot"

cp -R "$react_dir/dist-webview/." "$wpf_wwwroot/"
cp    "$react_dir/public/shell.html" "$wpf_wwwroot/"

echo "Done. wwwroot contents:"
ls -la "$wpf_wwwroot"
