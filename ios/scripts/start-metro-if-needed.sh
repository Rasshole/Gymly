#!/bin/bash
# Start Metro if nothing listens on 8081 (Debug builds load JS from Metro).
# Invoked from the GymlyFresh Xcode scheme Run pre-action.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT"

if [ -f "$ROOT/ios/.xcode.env" ]; then
  # shellcheck source=/dev/null
  source "$ROOT/ios/.xcode.env"
fi
if [ -f "$ROOT/ios/.xcode.env.local" ]; then
  # shellcheck source=/dev/null
  source "$ROOT/ios/.xcode.env.local"
fi

if [ -n "${NODE_BINARY:-}" ] && [ -x "${NODE_BINARY}" ]; then
  export PATH="$(dirname "${NODE_BINARY}"):${PATH}"
fi

if curl -sf "http://127.0.0.1:8081/status" >/dev/null 2>&1; then
  echo "[Metro] Already running on port 8081."
  exit 0
fi

echo "[Metro] Starting bundler (log: /tmp/rn-metro-gymly.log)..."
nohup npx react-native start >> /tmp/rn-metro-gymly.log 2>&1 &
# Brief wait so the first launch after a cold start can connect
sleep 2
echo "[Metro] Tip: Hvis appen stadig viser gammel UI: stop Metro, kør \"npm run start:clean\", og i Xcode: Product → Clean Build Folder, derefter Run (Debug)."
