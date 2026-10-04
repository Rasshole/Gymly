#!/usr/bin/env bash
# Make RCTThirdPartyComponentsProvider nil-safe so missing Fabric classes
# (NSClassFromString → nil) cannot abort app startup.
# Safe to run repeatedly; no-ops when already patched.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

patch_one() {
  local TARGET="$1"
  if [[ ! -f "$TARGET" ]]; then
    return 0
  fi
  if grep -q 'Gymly: skip nil NSClassFromString' "$TARGET"; then
    echo "note: already nil-safe: $TARGET"
    return 0
  fi
  # Only rewrite dictionary-literal codegen form.
  if ! grep -q 'NSClassFromString' "$TARGET"; then
    return 0
  fi
  python3 - "$TARGET" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
text = path.read_text()
pairs = re.findall(
    r'@\"([^\"]+)\":\s*NSClassFromString\(@\"([^\"]+)\"\)\s*,\s*//([^\n]*)',
    text,
)
if not pairs:
    raise SystemExit(f"no NSClassFromString entries in {path}")

add_lines = "\n".join(
    f'    add(@"{name}", @"{cls}"); //{comment.rstrip()}'
    for name, cls, comment in pairs
)

path.write_text(
    f"""/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Gymly: skip nil NSClassFromString results. Without this, a missing native
 * Fabric class (e.g. RNGoogleSignInButtonComponentView when RNGoogleSignin
 * is not linked) aborts startup via NSInvalidArgumentException in
 * +[NSDictionary dictionaryWithObjects:forKeys:count:].
 */


#import <Foundation/Foundation.h>

#import "RCTThirdPartyComponentsProvider.h"
#import <React/RCTComponentViewProtocol.h>

@implementation RCTThirdPartyComponentsProvider

+ (NSDictionary<NSString *, Class<RCTComponentViewProtocol>> *)thirdPartyFabricComponents
{{
  static NSDictionary<NSString *, Class<RCTComponentViewProtocol>> *components = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{{
    NSMutableDictionary<NSString *, Class<RCTComponentViewProtocol>> *dict =
        [NSMutableDictionary new];
    void (^add)(NSString *, NSString *) = ^(NSString *name, NSString *clsName) {{
      Class cls = NSClassFromString(clsName);
      if (cls != Nil) {{
        dict[name] = cls;
      }}
    }};
{add_lines}
    components = [dict copy];
  }});
  return components;
}}

@end
"""
)
print(f"patched {path} ({len(pairs)} components)")
PY
}

# Always patch the canonical codegen output under ios/build.
patch_one "$ROOT/build/generated/ios/RCTThirdPartyComponentsProvider.mm"

# Extra paths (DerivedData copies, explicit args).
for extra in "$@"; do
  patch_one "$extra"
done

# During an Xcode build, also patch any regenerated copies under DERIVED_FILE_DIR / OBJROOT.
for base in "${DERIVED_FILE_DIR:-}" "${OBJROOT:-}" "${TEMP_DIR:-}"; do
  if [[ -n "$base" && -d "$base" ]]; then
    while IFS= read -r f; do
      patch_one "$f"
    done < <(find "$base" -name 'RCTThirdPartyComponentsProvider.mm' 2>/dev/null || true)
  fi
done
