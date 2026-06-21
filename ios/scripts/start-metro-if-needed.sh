#!/bin/bash
# Start Metro if nothing listens on 8081 (Debug builds load JS from Metro).
# Used by: Xcode GymlyFresh scheme pre-action, Xcode build phase, npm preios.
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

METRO_STATUS_URL="http://127.0.0.1:8081/status"
LOG_FILE="/tmp/rn-metro-gymly.log"
MAX_WAIT_SEC="${METRO_WAIT_SEC:-45}"

metro_ready() {
  curl -sf "$METRO_STATUS_URL" >/dev/null 2>&1
}

wait_for_metro() {
  local elapsed=0
  while [ "$elapsed" -lt "$MAX_WAIT_SEC" ]; do
    if metro_ready; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

if metro_ready; then
  echo "[Metro] Already running on port 8081."
  exit 0
fi

echo "[Metro] Starting bundler (log: $LOG_FILE)..."
nohup npx react-native start >> "$LOG_FILE" 2>&1 &

if wait_for_metro; then
  echo "[Metro] Ready on http://127.0.0.1:8081"
  exit 0
fi

echo "[Metro] ERROR: Bundler did not become ready within ${MAX_WAIT_SEC}s."
echo "[Metro] Check log: tail -f $LOG_FILE"
exit 1
