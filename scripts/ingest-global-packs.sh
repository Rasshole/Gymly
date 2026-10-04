#!/usr/bin/env bash
# Ingest completed global flat JSONs: build → wire → coverage → promote (skip ar/he ready).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p scripts/out/global/logs

LOCALE_IDS=(fi cs ro hu el tr uk ja ko zh-Hans zh-Hant hi id ms vi th ar he)
EN_KEYS=$(python3 -c "import json; print(len(json.load(open('scripts/out/batch1/en.flat.json'))))")

for loc in "${LOCALE_IDS[@]}"; do
  flat="scripts/out/global/${loc}.flat.json"
  if [[ ! -f "$flat" ]]; then
    echo "SKIP $loc (no flat)"
    continue
  fi
  keys=$(python3 -c "import json; print(len(json.load(open('$flat'))))")
  if [[ "$keys" != "$EN_KEYS" ]]; then
    echo "SKIP $loc (keys $keys != $EN_KEYS)"
    continue
  fi
  # Skip if already wired and ready (except re-check)
  if [[ -f "src/i18n/translations/${loc}.ts" ]] && rg -q "id: '${loc}'," src/i18n/localeRegistry.ts && rg -q "id: '${loc}',[\s\S]*?status: 'ready'" src/i18n/localeRegistry.ts; then
    echo "OK $loc already ready"
    continue
  fi

  echo "INGEST $loc"
  npx tsx scripts/build-locale-from-flat.mts "$loc" scripts/out/global
  npx tsx scripts/wire-locale-module.mts "$loc"

  if [[ "$loc" == "ar" || "$loc" == "he" ]]; then
    echo "RTL $loc: pack wired, NOT promoting"
    continue
  fi

  # Token fix pass on flat (optional rebuild)
  python3 - <<PY
import json,re
from pathlib import Path
en=json.load(open('scripts/out/batch1/en.flat.json'))
loc='$loc'
p=Path(f'scripts/out/global/{loc}.flat.json')
d=json.loads(p.read_text())
def toks(s): return re.findall(r'\{\{(\w+)\}\}', s)
fixed=0
for k,ev in en.items():
  lv=d.get(k,ev)
  if toks(lv)!=toks(ev):
    ms=list(re.finditer(r'\{\{[^}]+\}\}', lv))
    et=toks(ev)
    if len(ms)==len(et):
      out=lv
      for m,t in zip(reversed(ms), reversed(et)):
        out=out[:m.start()]+'{{'+t+'}}'+out[m.end():]
      d[k]=out; fixed+=1
    else:
      d[k]=ev; fixed+=1
p.write_text(json.dumps({k:d[k] for k in en}, ensure_ascii=False, indent=2)+'\n')
print('token fixes', fixed)
PY
  npx tsx scripts/build-locale-from-flat.mts "$loc" scripts/out/global

  npx tsx scripts/promote-locale-if-ready.mts "$loc" || echo "PROMOTE_FAIL $loc"
done

echo "Picker:" 
npx tsx -e "import {listVisiblePickerLocaleIds} from './src/i18n/selectableLocales.ts'; console.log(listVisiblePickerLocaleIds())"
