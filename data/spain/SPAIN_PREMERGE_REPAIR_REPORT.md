# Spain Pre-Merge Repair Report

Generated: 2026-08-21T07:20:01.141Z

## START (978 / 922 / 56)

| Metric | Count |
|--------|------:|
| Phase-4 READY candidates | 978 |
| Previously passed merge validators | 922 |
| Withheld | 56 |
| — missing postal_code | 42 |
| — numeric/invalid city | 9 |
| — same-brand <100m proximity | 5 |

## POSTCODES (41 repaired / 0 unresolved; BeOne 0 withheld / 25 repaired / 0 unresolved)

- **41 / 42** missing-postcode rows repaired with verified 5-digit string postcodes (leading zeros preserved).
- **1 excluded (not repaired into Spain ready):** `es_42caeb0614` Forus Porto — address/city/coords are **Portugal** → `NEEDS_REVIEW`, removed from READY.
- **BeOne dedicated sub-pass (25/25):** every BeOne received a **facility-level** postcode via Nominatim reverse geocode of official JSON-LD coordinates (municipal pools / named BeOne POIs). Cities normalized where the listing used a barrio name (e.g. A Malata→Ferrol, Campolongo→Pontevedra, Santa Teresa→Colmenar Viejo, Monterreal→Baiona, As Lagoas→Ourense).
- Sources used in order: club page / JSON-LD coords → reverse geocode → street search confirmation. No corporate HQ postcodes used.

## CITY VALUES (9 repaired / 0 unresolved; root cause)

**Root cause:** Synergym homepage scrape parked the **house number in `city`** (e.g. city=`"33"` for Girona Devesa). Geocoding with street+number and empty/wrong city then attached **wrong-province** postals/coords on several rows.

**Repairs:** city recovered from club name; house number appended to address; postal+coords re-geocoded with city context (9/9).

**Mapping bug fix (future imports):** `scripts/spain-phase4-recovery.py` — `repair_synergym_row` moves numeric `city` onto `address`; `clean_city` recovers city from the Synergym name. Unrelated rows untouched.

## PROXIMITY CASES (5)

### Case 1
- **IDs:** es_3a032e0de9 ↔ es_e8f9e6e586
- **Brand:** Synergym
- **Names:** Synergym Burgos Gamonal / Synergym Murcia Río Segura
- **Addresses:** C. Francisco Grandmontagne, 6, Burgos 09007 / Avenida Río Segura, 8, Murcia 30002
- **Distance before:** 19 m
- **Classification:** C — data corruption / wrong geocode on Murcia (Burgos coords)
- **Action:** KEEP BOTH — repaired Murcia postal/coords from Wellhub+Nominatim; Burgos confirmed

### Case 2
- **IDs:** es_9dd04fac6d ↔ es_32f3b204b3
- **Brand:** Synergym
- **Names:** Synergym Xirivella / Synergym Lorca Juan Carlos I
- **Addresses:** Pl. Federico García Lorca, Xirivella 46950 / Av. Juan Carlos I, 22, Lorca 30800
- **Distance before:** 12 m
- **Classification:** C — data corruption / wrong geocode on Lorca (Xirivella coords)
- **Action:** KEEP BOTH — repaired Lorca postal 30800 + Lorca street geocode

### Case 3
- **IDs:** es_733bd33bcc ↔ es_ffba6bd99d
- **Brand:** Synergym
- **Names:** Synergym Santiago Ensanche / Synergym Albacete Universidad
- **Addresses:** Rúa de Fernando III o Santo, 12, Santiago 15701 / C. Hellín, 12, Albacete 02002
- **Distance before:** 3 m
- **Classification:** C — data corruption / wrong geocode on Albacete (Santiago coords)
- **Action:** KEEP BOTH — repaired Albacete postal/coords

### Case 4
- **IDs:** es_3420f2dbe6 ↔ es_e13a21a4c1
- **Brand:** Synergym
- **Names:** Synergym Siete Palmas / Synergym Las Palmas Mesa y López
- **Addresses:** C. Lomo San Lázaro, 2011, Las Palmas 35019 / C. Juan Millares Carlo, 10 (preapertura)
- **Distance before:** 0 m
- **Classification:** E — separate concepts; Mesa y López official APERTURA PROXIMAMENTE
- **Action:** KEEP Siete Palmas; REMOVE Mesa y López → COMING_SOON (cleared copied coords)

### Case 5
- **IDs:** es_2eb363e64d ↔ es_2a735fbb94
- **Brand:** Fitness Park
- **Names:** Fitness Park Cartagena - Plaza Juan XXIII / Fitness Park Cartagena - Espacio Mediterraneo
- **Addresses:** Plaza Juan XXIII, 2, Cartagena 30201 / CC Espacio Mediterráneo, Cartagena 30353
- **Distance before:** 60 m
- **Classification:** D — genuinely separate clubs; Espacio had Plaza Juan XXIII coords
- **Action:** KEEP BOTH — moved Espacio Mediterráneo to mall geocode (~3.5 km apart)


### Proximity summary
- 4 pairs → keep both after correcting corrupted geocodes
- 1 pair → Mesa y López → COMING_SOON; Siete Palmas kept
- Additional clear-inconsistency fixes on previously-passed Synergym rows that shared copied coords: Fuenlabrada, Estepona, San Fernando Junquera

## FINAL SAFE DATASET

| Metric | Count |
|--------|------:|
| READY file after exclusions | 976 |
| Still withheld (field/proximity) | 0 |
| **SPAIN_FINAL_SAFE_TO_MERGE** | **976** |

Still withheld / excluded from ready (not in SAFE set):
1. `es_e13a21a4c1` Synergym Las Palmas Mesa y López — COMING_SOON (official preapertura)
2. `es_42caeb0614` Forus Porto — foreign Portugal

## EXPECTED PRODUCTION

`7167 + 976 = 8143`

## 10K CHECKPOINT

- Live if merged: **8143**
- Headroom to 10k: **1857**
- Stress QA: **NO**

## RECOMMENDATION

**READY TO RE-RUN SPAIN MERGE**

`scripts/import-spain-merge.mjs` `EXPECTED_INSERT` updated to **976**.

## FILES

- `data/spain/SPAIN_PREMERGE_REPAIR_REPORT.md`
- `data/spain/SPAIN_PREMERGE_REPAIR_REPORT.json` (full audit_log)
- `data/spain/SPAIN_FINAL_SAFE_TO_MERGE.json` (976)
- `data/spain/SPAIN_PHASE4_READY_TO_IMPORT.json` (976)
- `data/spain/SPAIN_APPROVED_FOR_MERGE.json`
- `data/spain/spain_centers_staging.json`
- `scripts/import-spain-merge.mjs` (EXPECTED_INSERT=976)
- `scripts/spain-phase4-recovery.py` (numeric-city mapping fix)

## Audit log size

314 field-level change records in JSON report.
