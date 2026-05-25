#!/usr/bin/env bash
# Bygger deploy-bundle/ til manuel FTP-upload (samme som GitHub Actions).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
rm -rf deploy-bundle
mkdir -p deploy-bundle
cp -a website/. deploy-bundle/
mkdir -p deploy-bundle/auth/callback deploy-bundle/.well-known deploy-bundle/confirm
cp -f web/auth/callback/index.html deploy-bundle/auth/callback/
cp -f web/.well-known/apple-app-site-association deploy-bundle/.well-known/
cp -f web/.well-known/assetlinks.json deploy-bundle/.well-known/
cp -f web/confirm/index.html deploy-bundle/confirm/
echo "OK: $ROOT/deploy-bundle"
find deploy-bundle/auth deploy-bundle/.well-known deploy-bundle/confirm -type f | sort
