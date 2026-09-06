# Spain Phase 4 Readiness Report

Generated: 2026-08-20 18:46 UTC

**Status: PHASE 4 DONE — READY FOR SPAIN MERGE.**

`src/data/centers.json` was not modified.

## Phase 3 baseline

- READY_TO_IMPORT: 954
- NEEDS_COORDINATES: 120
- NEEDS_REVIEW: 2
- COMING_SOON: 4
- DUPLICATE: 60
- unique_excl_dup: 1080

## Synergym recovery

- recovered_to_READY (net): 17
- coming_soon: 0
- closed: 0
- duplicates: 27
- still_unresolved: 51
- final READY: 143 (was 126)
- coverage: 143/194 active discovered
- verdict: NEAR-COMPLETE

## Fitness Park recovery

- recovered_to_READY (net): 7
- coming_soon: 0
- closed: 0
- duplicates: 14
- still_unresolved: 35
- final READY: 114 (was 107)
- coverage: 114/149 active discovered
- verdict: NEAR-COMPLETE

## Coordinate sources (Phase 4 new READY)

- OFFICIAL_COORDINATE: 0
- OFFICIAL_MAP_PIN: 0
- NAMED_GYM_POI: 1
- STRICT_ADDRESS_GEOCODE: 23

## Overall

| Metric | Count |
|---|---:|
| unique_staged_excl_duplicates | 1076 |
| READY_TO_IMPORT | 978 |
| NEEDS_COORDINATES | 92 |
| NEEDS_REVIEW | 2 |
| COMING_SOON | 4 |
| CLOSED | 0 |
| DUPLICATE | 64 |

## READY by brand

| Brand | READY |
|---|---:|
| VivaGym | 246 |
| Basic-Fit | 238 |
| Synergym | 143 |
| Fitness Park | 114 |
| Anytime Fitness | 57 |
| Forus | 48 |
| BeOne | 25 |
| DIR | 22 |
| Holiday Gym | 22 |
| Dreamfit | 20 |
| Enjoy! | 18 |
| GO fit | 13 |
| Altafit | 5 |
| Eurofitness | 3 |
| Metropolitan | 3 |
| O2 Centro Wellness | 1 |

## Data quality

- missing_addresses: 6
- missing_postal_codes: 101
- missing_cities: 0
- missing_coordinates: 94
- Spanish postcodes preserved as 5-digit strings.
- No city/postcode/country centroid fallbacks used.
- All 954 Phase 3 READY rows preserved.

## Remaining gaps

### Synergym (51 unresolved)

Official synergym.es club locator remains Incapsula-blocked; recovery used Overpass named POIs + strict Nominatim address geocoding with Av./C./P.º variants. Leftovers lack unique OSM house-level hits, have ambiguous long-avenue matches without house numbers, or still have malformed homepage-parsed addresses.

- Synergym Vecindario El Doctoral | Av. de las Tirajanas, 225 | Vecindario | NEEDS_COORDINATES
- Synergym Castellón | Av. de Valencia, 108 | Castellón de la Plana | NEEDS_COORDINATES
- Synergym A Coruña Matadero | Avenida de Pedro Barrié de la Maza, 3 | La Coruña | NEEDS_COORDINATES
- Synergym Ourense Progreso | Rúa do Progreso, 125 | Ourense | NEEDS_COORDINATES
- Synergym Logroño ConservatorioMarques de Murrieta, 62, Logroño, La Rioja |  | Logroño | NEEDS_REVIEW
- Synergym Murcia | Calle Sta. Teresa | Murcia | NEEDS_COORDINATES
- Synergym Murcia Ranero | Calle Cisne, 4 | Murcia | NEEDS_COORDINATES
- Synergym Pamplona Buztintxuri | Av. de Guipúzcoa, 20 | Pamplona | NEEDS_COORDINATES
- Synergym Bilbao IndautxuEgia Generaleran | Callea, 38 | Bilbao | NEEDS_COORDINATES
- Synergym Algeciras | Av. Virgen del Carmen, 4 | Algeciras | NEEDS_COORDINATES
- Synergym Zaragoza Las Fuentes | C. de Florentino Ballesteros, 21 | Zaragoza | NEEDS_COORDINATES
- Synergym Barcelona el Clot | C/ de Mallorca, 673 | Barcelona | NEEDS_COORDINATES
- Synergym Logroño Las Gaunas | Calle Huesca, 17 | Logroño | NEEDS_COORDINATES
- Synergym Guadalajara Las Cañas | Boulevard Clara Campoamor, 22 | Guadalajara | NEEDS_COORDINATES
- Synergym Zaragoza Aljafería | Av. de Madrid 21 | Zaragoza | NEEDS_COORDINATES
- Synergym Motril Sur | Av. Doctor Norman Bethune | 230 Motril-Granada | NEEDS_COORDINATES
- Synergym Puerto del Rosario | Av. Juan de Bethencourt, 41 | Puerto del Rosario | NEEDS_COORDINATES
- Synergym Alcàsser | Av. Cortes Valencianas, 50 | Alcàsser | NEEDS_COORDINATES
- Synergym Segovia Santo Tomás | C. Santo Tomás | Segovia | NEEDS_COORDINATES
- Synergym Pamplona Olite | Calle de Olite, 40 | Pamplona | NEEDS_COORDINATES
- Synergym Gandía | C. Nou d’octubre, 17 | Gandía | NEEDS_COORDINATES
- Synergym Bilbao Sarriko | C. Islas Canarias, 4 | Bilbao | NEEDS_COORDINATES
- Synergym Zaragoza Rosales | C. de Ludwig van Beethoven, 66 | Zaragoza | NEEDS_COORDINATES
- Synergym Zaragoza Cuéllar | P.º de Cuéllar, 37 | Zaragoza | NEEDS_COORDINATES
- Synergym Ourense Norte | Calle Río Sil | Ourense | NEEDS_COORDINATES
- Synergym Yecla | Calle Ctra. de Villena | Yecla | NEEDS_COORDINATES
- Synergym Zaragoza Valdespartera | Av. de Casablanca | Zaragoza | NEEDS_COORDINATES
- Synergym Ontinyent | Carrer de l'Ereta, 7 | Ontinyent | NEEDS_COORDINATES
- Synergym Plasencia | Av. la Salle, 23 | Plasencia | NEEDS_COORDINATES
- Synergym Torrent El Molí | C. Picaña, 36 | Torrent | NEEDS_COORDINATES
- Synergym Cartagena Nueva Peral | C. Batalla de Zama, 50 | Cartagena | NEEDS_COORDINATES
- Synergym Factory Dos Hermanas | Ctra. Sevilla-Cádiz, km.553.8 | Dos Hermanas | NEEDS_COORDINATES
- Synergym Alzira Naranjo | C. Naranjo, 105 | Alzira | NEEDS_COORDINATES
- Synergym Almería Los Molinos | C. Pintor Zabaleta, 61A | Local 1 | NEEDS_COORDINATES
- Synergym Linares | Av. Julio Burrel 43-45 | Linares | NEEDS_COORDINATES
- Synergym Lepe | Av. de Andalucía, 5 | Lepe | NEEDS_COORDINATES
- Synergym UtreraUtrera - | Ctra. Madrid - Cádiz N IV, 30 | 41710 Utrera | NEEDS_COORDINATES
- Synergym Lleida La Bordeta | C/Sebastià Gràcia | Lleida | NEEDS_COORDINATES
- Synergym Arroyo de la Encomienda | Av. de José Luis Lasa, 114 | Arroyo de la Encomienda | NEEDS_COORDINATES
- Synergym Vall d’Uixó | Ctra. Nules, 6 | Vall de Uxó | NEEDS_COORDINATES
- Synergym Antequera | Calle Cdad. De Salamanca | s/n | NEEDS_COORDINATES
- Synergym Esplugues | Carrer Verge de Guadalupe, 30 | 08950 Esplugues de Llobregat | NEEDS_COORDINATES
- Synergym Rota | Parque Comercial Portalejos. C. Valverde de la Vega, s/n | Rota | NEEDS_COORDINATES
- Synergym Castellón Capuchinos | Av. de Capuchinos, 55 | Castellón de la Plana | NEEDS_COORDINATES
- Synergym Villanueva de la Serena | Calle Hernán Cortes | 4. Planta 1º. Villanueva de la Serena | NEEDS_COORDINATES
- Synergym Arrecife Triana | C. Triana 78 | Arrecife | NEEDS_COORDINATES
- Synergym Cáceres El Rodeo | C. María Auxiliadora, 10 | Centro-Casco Antiguo | NEEDS_COORDINATES
- Synergym  | CC PontiñasRúa Carballeira da Botica, 5 | Lalín | NEEDS_COORDINATES
- Synergym Galdakao | C. Zubiaurretarren, 23 | Galdácano | NEEDS_COORDINATES
- Synergym Tabernes Blanques | C. de Mariano Benlliure, 20 | Tabernes Blanques | NEEDS_COORDINATES
- Synergym Cartaya | Av. San Bartolomé-Diseminados, 787 | Cartaya | NEEDS_COORDINATES

### Fitness Park (35 unresolved)

Official club pages provide addresses but rarely coordinates; OSM has few named Fitness Park Spain POIs. Leftovers are mostly shopping-center / highway-km / s/n addresses without a unique building or named-gym POI. Not using shopping-center centroids.

- Fitness Park Alfafar - Mn4 | Calle Alcalde de José Puertes | Alfafar | NEEDS_COORDINATES
- Fitness Park Alhaurín de la Torre | Calle Ur1 Retamar II, 62-73 | Alhaurín de la Torre | NEEDS_COORDINATES
- Fitness Park Mairena del Aljarafe - MetroMar | Av. de los Descubrimientos, S / N | Mairena del Aljarafe | NEEDS_COORDINATES
- Fitness Park Badajoz-Carretera-Olivenza | calle Arturo Barea, esquina Avenida Príncipe de Asturias | Badajoz | NEEDS_COORDINATES
- Fitness Park Benidorm - La Estación | Carrer Francisco Llorca Antón | Benidorm | NEEDS_COORDINATES
- Fitness Park Caceres - Ruta de la Plata | Parque de Medianas APE 27.01 Ruta de la Plata | Cáceres | NEEDS_COORDINATES
- Fitness Park Carcaixent | Av. Bressol de la Taronja, 25 | Carcaixent | NEEDS_COORDINATES
- Fitness Park Ceuta - Marina de Hércules | Puerto deportivo, Av. Juan Pablo II, s/n | Ceuta | NEEDS_COORDINATES
- Fitness Park Chiclana - Puerta Chiclana | CC Puerta de Chiclana - Av. del Mueble, 44 | Chiclana de la Frontera | NEEDS_COORDINATES
- Fitness Park Dos Hermanas - Entrenasas | CC entrenasas | Dos Hermanas | NEEDS_COORDINATES
- Fitness Park Gandia - MYO | Polígon Sector Beneito Valencia | Gandia | NEEDS_COORDINATES
- Fitness Park Vecindario | Calle de Velázquez, 37 | Vecindario | NEEDS_COORDINATES
- Fitness Park Granada - AV Juan Pablo II | Carretera de Jaén S/N, Nacional 323 Km 127 | Granada | NEEDS_COORDINATES
- Fitness Park Illescas - Señorio Plaza | C. Juan Carlos Onetti, 1 | Illescas | NEEDS_COORDINATES
- Fitness Park Jerez de la Frontera - Luz Shopping | CC Luz Shopping Rda. Aurora Boreal | Jerez de la Frontera | NEEDS_COORDINATES
- Fitness Park La Línea - La Alcaidesa | Av Príncipe de Asturias s/n, Torre de Control | La Línea de la Concepción | NEEDS_COORDINATES
- Fitness Park Lorca - Parque Almenara | Camino Enmedio s/n 30813 Lorca Murcia | Lorca | NEEDS_COORDINATES
- Fitness Park Melilla | Carretera Regimiento de la Corona, s/n | Melilla | NEEDS_COORDINATES
- Fitness Park Murcia - Nueva Condomina | A-7, Km. 760, Autovía del Mediterráneo | Churra | NEEDS_COORDINATES
- Fitness Park Nigran Nasas | Parque empresarial Porto do Molle, Rúa das Pontes, 2 | Nigrán | NEEDS_COORDINATES
- Fitness Park Pontevedra - Vilanova Shopping | PO-530, Vilanova de Arousa | Pontevedra | NEEDS_COORDINATES
- Fitness Park Puerto de Santa María - El Paseo | N-IV, Km 653 Local L01 | El Puerto de Santa María | NEEDS_COORDINATES
- Fitness Park Roquetas - Gran Plaza | Ctra. de Alicun, s/n | Roquetas de Mar | NEEDS_COORDINATES
- Fitness Park San Juan de Aznalfarache - Parque Comercial Alavera | Parque Comercial Alavera, de San Juan | Sevilla | NEEDS_COORDINATES
- Fitness Park Sanlúcar - Las Dunas | Sanlúcar Las Dunas Shopping Planta Baja. Nº del local 83 | Sanlúcar | NEEDS_COORDINATES
- Fitness Park Telde - Las Terrazas | GC-1, 5, Planta 1 - Local A6 | Telde | NEEDS_COORDINATES
- Fitness Park Tenerife - La Cuesta | Carr. Gral. la Cuesta, 28 | La Laguna | NEEDS_COORDINATES
- Fitness Park Tenerife - La Gran Manzana | Av. Lucio Diaz Flores Feo, S/N | San Miguel de Abona | NEEDS_COORDINATES
- Fitness Park Terrassa - Universitat | Avenida Barcelona 110 Terrassa | Barcelona | NEEDS_COORDINATES
- Fitness Park Tudela - Puente de la Ribera | Carr. Zaragoza, s/n | Tudela | NEEDS_COORDINATES
- Fitness Park Valencia - Bonaire | Autovía del Este, Km. 345 | Valencia | NEEDS_COORDINATES
- Fitness Park Valencia - Colón | Calle Grabador Esteve, nº 10, Bajo | Valencia | NEEDS_COORDINATES
- Fitness Park Valencia - Paiporta | Calle dels Fuster 36 | Paiporta | NEEDS_COORDINATES
- Fitness Park Vinarós - Parque Mediterraneo | Avenida Dauradors, 16, local 8 | Vinaròs | NEEDS_COORDINATES
- Fitness Park Zamora - Vista Alegre | C. Poeta Alfonso de Peñalosa, N-122, Km. 62,3 | Zamora | NEEDS_COORDINATES

## Phase 5?

**NO** — remaining gaps need official map pins / Incapsula bypass, not another Nominatim pass. Phase 5 not worthwhile by default.

## Proposed SAFE merge

**978** READY_TO_IMPORT rows from Phase 4 staging.

Expected catalog after merge: **7167 + 978 = 8145**.

## 10K checkpoint: NO (headroom 1855)

## RECOMMENDATION: READY FOR SPAIN MERGE

