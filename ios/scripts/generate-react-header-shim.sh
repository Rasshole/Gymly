#!/bin/bash
# Flat React header shim for use_frameworks! :linkage => :static.
# React pod headers are imported as <React/Foo.h> but live under React/Base/ etc.
# until React-Core.framework is built. This shim makes clean app-target builds work.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RN_DIR="$ROOT/node_modules/react-native"
SHIM_DIR="$IOS_DIR/.react-header-shim"

rm -rf "$SHIM_DIR"
mkdir -p "$SHIM_DIR/React" "$SHIM_DIR/RCTDeprecation"

link_flat() {
  local src_root="$1"
  local dest_subdir="$2"
  local dest_dir="$SHIM_DIR/$dest_subdir"
  mkdir -p "$dest_dir"
  find "$src_root" -name '*.h' -print0 | while IFS= read -r -d '' header; do
    local base
    base="$(basename "$header")"
    local dest="$dest_dir/$base"
    if [ -e "$dest" ] && [ ! -L "$dest" ]; then
      echo "[react-header-shim] skip duplicate: $base" >&2
      continue
    fi
    ln -sf "$header" "$dest"
  done
}

link_flat "$RN_DIR/React" "React"
link_flat "$RN_DIR/Libraries/AppDelegate" "React"
link_flat "$RN_DIR/ReactApple/Libraries/RCTFoundation/RCTDeprecation/Exported" "RCTDeprecation"

# RN 0.77+ generates RCTThirdPartyComponentsProvider under ios/build/generated.
# Older tooling / stale includes still look for RCTThirdPartyFabricComponentsProvider.h.
LEGACY_FABRIC_PROVIDER="$SHIM_DIR/React/RCTThirdPartyFabricComponentsProvider.h"
if [ ! -e "$LEGACY_FABRIC_PROVIDER" ]; then
  GENERATED_PROVIDER="$IOS_DIR/build/generated/ios/RCTThirdPartyComponentsProvider.h"
  if [ -f "$GENERATED_PROVIDER" ]; then
    ln -sf "$GENERATED_PROVIDER" "$LEGACY_FABRIC_PROVIDER"
  else
    cat > "$LEGACY_FABRIC_PROVIDER" <<'EOF'
/**
 * Compatibility stub for RN 0.77+ (legacy RCTThirdPartyFabricComponentsProvider name).
 * Real provider lives at ios/build/generated/ios/RCTThirdPartyComponentsProvider.h.
 */
#pragma once
EOF
  fi
fi

mkdir -p "$SHIM_DIR/yoga"
find "$RN_DIR/ReactCommon/yoga/yoga" -name '*.h' -print0 | while IFS= read -r -d '' header; do
  ln -sf "$header" "$SHIM_DIR/yoga/$(basename "$header")"
done

echo "[react-header-shim] wrote $(find "$SHIM_DIR" \( -type l -o -type f \) | wc -l | tr -d ' ') entries under $SHIM_DIR"
