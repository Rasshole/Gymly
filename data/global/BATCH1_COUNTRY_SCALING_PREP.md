# MULTI-COUNTRY BATCH 1 SCALING PREP

**Date:** 2026-08-22  
**Countries:** Ireland · Czechia · Hungary · Greece  
**Scope:** Architecture preparation only — **no discovery, no merge, no `centers.json` changes**

---

## CURRENT PRODUCTION

| Metric | Value |
|--------|------:|
| Total centers | **10,772** |
| Ireland | 0 |
| Czechia | 0 |
| Hungary | 0 |
| Greece | 0 |

Existing country counts (unchanged):

| Country | Count |
|---------|------:|
| DK | 354 |
| SE | 639 |
| NO | 535 |
| DE | 1424 |
| UK | 1474 |
| FI | 429 |
| NL | 600 |
| FR | 1712 |
| ES | 976 |
| IT | 588 |
| BE | 363 |
| PL | 621 |
| AT | 335 |
| CH | 475 |
| PT | 247 |
| **SUM** | **10772** |

---

## COUNTRY SUPPORT

| Country | Stored name | ID prefix | Orphan region | Invented coords |
|---------|-------------|-----------|---------------|-----------------|
| Ireland | `Ireland` | `ie_` | Ireland | **forbidden** |
| Czechia | `Czechia` | `cz_` | Czechia | **forbidden** |
| Hungary | `Hungary` | `hu_` | Hungary | **forbidden** |
| Greece | `Greece` | `gr_` | Greece | **forbidden** |

Wired into: `gymIds`, `gymCountry`, `gymCountryLabel`, i18n (en/da/sv/nb), `danishGyms`, `centerRegistry`, `gymDisplay`, `gymSearchIndex`, `gymSearchNormalize`.

---

## IRELAND SUPPORT

- **Labels:** EN Ireland · DA/SV/NB Irland  
- **Northern Ireland:** remains United Kingdom (`isUnitedKingdomCountry`); **never** `isIrelandCountry`  
- **Postcode:** Eircode as **string** — `D02 X285` (space optional for search; compact 7-char)  
- **Charset:** official Eircode alphabet (no O/I/B/etc. in Unique Identifier)  
- **Geo:** Republic bbox with Northern Ireland exclusion (Belfast / Derry pockets rejected)  
- **Cities (search aliases):** Dublin, Cork, Limerick, Galway, Waterford, Drogheda, Kilkenny, Sligo, Athlone, Dundalk (+ Irish-language forms where useful)

---

## CZECHIA SUPPORT

- **Labels:** EN Czechia · DA Tjekkiet · SV Tjeckien · NB Tsjekkia  
- **Postcode:** PSČ `NNN NN` as string (e.g. `110 00`); compact `11000` for search  
- **Canonical stored form:** space required (`^[1-7]\d{2} \d{2}$`) — first digit 1–7 (Czech lands; avoids SK 8xx)  
- **Geo:** mainland bbox rejecting Berlin / Vienna / Bratislava / Warsaw cores  
- **Diacritics:** NFD folding (á č ď é ě í ň ó ř š ť ú ů ý ž) — display unchanged  
- **Cities:** Praha↔Prague, Plzeň↔Plzen, České Budějovice↔Ceske Budejovice, + Brno, Ostrava, Liberec, Olomouc, Hradec Králové, Pardubice, Zlín

---

## HUNGARY SUPPORT

- **Labels:** EN Hungary · DA/NB Ungarn · SV Ungern  
- **Postcode:** `NNNN` as string (e.g. `1051`)  
- **Geo:** mainland bbox + NW Vienna/Bratislava corridor exclusion  
- **Diacritics:** NFD folding including ő/ű — display unchanged  
- **Cities:** Budapest, Debrecen, Szeged, Miskolc, Pécs↔Pecs, Győr↔Gyor, Nyíregyháza, Kecskemét, Székesfehérvár, Szombathely

---

## GREECE SUPPORT

- **Labels:** EN Greece · DA Grækenland · SV Grekland · NB Hellas  
- **Postcode:** `NNN NN` as string (e.g. `105 58`); compact `10558`  
- **Greek script:** search-only transliteration map (digraphs + letters) in `gymSearchNormalize` — **stored Greek text untouched**  
- **Aliases (preferred for multi-Latin forms):** Αθήνα↔Athens/Athina, Θεσσαλονίκη↔Thessaloniki, Πάτρα↔Patra, Ηράκλειο↔Heraklion/Iraklio, + Larissa, Volos, Ioannina, Chania, Rhodes, Kalamata  
- **Geo:** mainland + Crete + Rhodes/Kos + Corfu + Lesbos/Chios; Albania (Tirana) / Skopje / Sofia / Istanbul rejected

---

## POSTCODE VALIDATION

| Country | Official format | Stored RE | Compact search | Collision note |
|---------|-----------------|-----------|----------------|----------------|
| Ireland | Eircode 7-char | `IRELAND_EIRCODE_RE` | strip space | Unique vs numeric EU formats |
| Czechia | NNN NN | `CZECHIA_POSTAL_RE` | yes | Same shape as SK/SE/GR — **country context required** |
| Hungary | NNNN | `HUNGARY_POSTAL_RE` | n/a | Same shape as AT/BE/CH — **country context required** |
| Greece | NNN NN | `GREECE_POSTAL_RE` | yes | Same shape as CZ/SK/SE — **country context required** |

Assumptions verified against Eircode / EU postal references before implementation.

---

## SEARCH / CHARACTER NORMALIZATION

- Latin diacritics (IE/CZ/HU): existing NFD path  
- Greek: explicit search-only transliteration + city aliases (no broad Latin-country regression)  
- Display/stored names: **never mutated**

---

## BORDER SAFETY

| Pair | Guard |
|------|-------|
| Ireland ↔ NI/UK | country alias + NI coordinate exclusion |
| Czechia ↔ DE/PL/AT/SK | bbox rejects neighbor capitals |
| Hungary ↔ AT/SK/RO/HR/RS/SI/UA | bbox + NW corridor exclusion |
| Greece ↔ AL/MK/BG/TR | island-aware multipolygon + Albania west exclusion |

---

## SCALE BENCHMARK

Synthetic clones of the live catalog (does not write production). Key sizes for this batch:

| Size | Parse ms | Cold index ms | Cached | Typical (3q) | Worst (2q) | Nearest | Map build | Viewport |
|-----:|---------:|--------------:|-------:|-------------:|-----------:|--------:|----------:|---------:|
| 10772 (live) | 13 | 2099 | 0 | 1095 | 169 | 27 | 33 | 3 |
| 11000 | 12 | 1143 | 0 | 654 | 150 | 25 | 31 | 3 |
| 11500 | 14 | 2675 | 0 | 823 | 187 | 30 | 36 | 4 |
| 12000 | 14 | 1283 | 0 | 684 | 173 | 27 | 33 | 4 |
| 12500 | 13 | 1320 | 0 | 710 | 183 | 29 | 34 | 4 |
| 13000 | 13 | 1409 | 0 | 754 | 185 | 31 | 37 | 5 |
| 15000 | 17 | 1526 | 0 | 834 | 192 | 34 | 41 | 4 |
| 20000 | 22 | 2086 | 0 | 1209 | 291 | 46 | 53 | 7 |
| 25000 | 27 | 2635 | 0 | 1477 | 346 | 55 | 58 | 8 |

Cold-index spikes on first sizes reflect one-time module/index warmup; steady sizes 12k–15k remain ~1.1–1.5s index / &lt;1s typical search in this harness.

**Assessment:** Adding all four Batch 1 countries under a projected ~12–13k catalog remains **inside the existing client-side envelope**. No architecture migration required for Phase 1.

Artifact: `data/global/BATCH1_SCALE_BENCHMARK.json`

---

## GLOBAL QA CHECKPOINT

Previous Global 10K+ Stress QA passed at **10,050**. Current production **10,772**. Switzerland QA passed at 10,525; Portugal QA passed at 10,772.

**Chosen Batch 1 checkpoint (before Phase 1):**

| Rule | Value |
|------|-------|
| Do **not** rerun Global Stress after every country merge | — |
| Rerun Global Stress QA when catalog first exceeds **12,500** **or** any merge/QA shows material regression (index cold &gt; 2.5s, typical search &gt; 1.5s on device-class hardware, or architecture change) | **12,500** |
| Absolute soft review at **15,000** regardless | review only |
| Architecture change | always triggers Global Stress |

Rationale: ~16% growth from 10,772→12,500 is material; 25k still workable but Batch 1 projected finishes well below that.

---

## ARCHITECTURE DECISION

**KEEP CLIENT-SIDE**

- No spatial-index migration  
- No server search cutover  
- Missing coords → NaN / unavailable (existing pattern)  
- Merges remain **sequential**: Country A merge → A QA → next country  
- Phase 1 discovery **may** run in parallel with isolated `data/{ireland,czechia,hungary,greece}/` trees

---

## PHASE 1 ISOLATION

Prepared empty isolation roots:

- `data/ireland/`
- `data/czechia/`
- `data/hungary/`
- `data/greece/`

Each has a README stating no cross-country writes.

---

## MERGE POLICY

Discovery: parallel OK  
Production merge: **sequential only**  
Order: decide after Phase 1/2 data quality (not fixed in this prep)

---

## TESTS

| Suite | Result |
|-------|--------|
| `__tests__/batch1CatalogScalingPrep.test.ts` | **13 passed** |
| `portugalMergeSafety` (regression smoke) | **passed** |

---

## BUGS FOUND

None in production data (untouched). Prep-time geo/postcode test fixtures tightened during implementation (Eircode charset, Hungary NW bbox, Greece Albania/Kos).

## BUGS FIXED

N/A (prep only).

---

## FILES CHANGED

- `src/data/gymIds.ts`
- `src/utils/gymCountry.ts`
- `src/utils/gymCountryLabel.ts`
- `src/utils/gymDisplay.ts`
- `src/data/danishGyms.ts`
- `src/data/centerRegistry.ts`
- `src/services/gymSearch/gymSearchNormalize.ts`
- `src/services/gymSearch/gymSearchIndex.ts`
- `src/i18n/translations/{en,da,sv,nb}.ts`
- `scripts/benchmark-gym-catalog-scale.test.ts`
- `__tests__/batch1CatalogScalingPrep.test.ts`
- `data/ireland/README.md`
- `data/czechia/README.md`
- `data/hungary/README.md`
- `data/greece/README.md`
- `data/global/BATCH1_COUNTRY_SCALING_PREP.md`
- `data/global/BATCH1_SCALE_BENCHMARK.json`

**Not changed:** `src/data/centers.json`

---

## FINAL VERDICT

**READY FOR BATCH 1 PHASE 1**
