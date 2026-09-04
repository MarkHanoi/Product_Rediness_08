# ES — SIPU ↔ PRYZM parameter cross-map, FIELD BY FIELD (2026-09-04)

<!-- Lane ENVELOPE-IBERIA, deliverable 3. Answers the founder's instruction in
     ES-FOUNDER-FIELD-LEVEL-PASS.md: "Cross-map STR-ENVELOPE-PARAMETER-REFERENCE.md against the
     SIPU schema FIELD BY FIELD before building any new extractor. If this mapping works, we don't
     need to invent a new semantic representation for these regions."
     ⛔ EVERY ROW IS BACKED BY A REPO FILE + LINE. The founder's 14-field list is the founder's
     claim; this document says which of those fields the REPO has actually SEEN, in what, and how
     often it is populated. -->

> ## ⭐ THE VERDICT
>
> **The founder is right that the repo has SEEN all 14 field names — every one is in a committed
> census — but "SIPU already contains almost the entire PRYZM parameter vocabulary" does not
> survive the field-by-field test, in two specific ways.**
>
> 1. **Only 6 of the 14 map EXACTly onto an existing C58 seat** (`SepMinFr/Ps/Lt → setbacks`,
>    `PMaxOcup → maxCoverage`, `EdifMax → plotRatioFAR`, `AltMaxPl → maxFloors`). **Six have no
>    seat anywhere in PRYZM's canonical model** (`SupMin`, `LongMin`, `CircInsc`, `SepMnVol`,
>    `SupOcMax`, `SupEdMax`), one is AMBIGUOUS (`FondoMax`) and one is LOSSY (`AltMaxMt`).
> 2. ⭐ **The 14-field list is not one table — it is the UNION OF TWO DIFFERENT SIPU SCHEMAS, and
>    it happens to omit every column that carries the urban geometric grammar while including the
>    region's worst height column.** Measured over the committed 135-table census: **9 of the 14
>    appear in 102 tables** (the shared core), **4 appear in exactly 70** (`FondoMax · SepMnVol ·
>    SupOcMax · AltMaxMt` — the RUS / rural-settlement family), and 1 in 66. **102 = 32 + 70.** The
>    **EDIF-only urban set of 32 tables** — `DispObl · DispOblm · FonMaxEd · FonMaxEdm · SepMnEdf ·
>    FonMin · AltMaxMV · AltMaxMP · ParcVInc` — **is absent from the list entirely, and it is
>    precisely the set that already maps onto PRYZM's shipped `GeometricRule` alignment engine.**
>
> **So: no new semantic representation is needed for the six that map; four more seats must be
> minted; and the ADR-0377 datum union needs a member SIPU already publishes.**
>
> ⚠ **And the mapping being right changes NOTHING about publication.** `CANARIAS_ENVELOPE_VERIFIED`
> is `false` with `signature: null`, so all 88 municipalities refuse today regardless.

---

## §1 — The evidence base (what the repo has actually opened)

**The authority is `tools/depth-lexeme-reprobe/out/c3-canarias-frugal.json`** — **45 SIPU archives
downloaded, 135 `.mdb` tables opened, 103 125 rows read, 166 distinct columns, 295 distinct table
names**; `skippedTooBig: 22`, `decodeFail: 1` (holes NAMED, never counted as zeros). Its harvester
(`c3-canarias-frugal-harvest.py`) *"dumps the full field/term union FIRST and only then
classifies"*, so a column under an unguessed name is still visible.

**All 14 founder fields are SEEN. Table counts (of 135):**

| group | columns | tables |
|---|---|---:|
| **shared core** (both families) | `SupMin · ObsSMP · LongMin · CircInsc · ObsCirc · SepMinFr · SepMinPs · SepMinLt · ObsFonMx · PMaxOcup · EdifMax · ObsEdfMx · AltMaxPl · ObsAMP` | **102** |
| **RUS / rural family** | `FondoMax · SepMnVol · SupOcMax · AltMaxMt · OCFinca · OCDispos · OCIntens · Relacion · Obs*` | **70** |
| | `SupEdMax` | **66** |
| ⛔ **EDIF-only (urban) — NOT in the founder's list** | `ParcVInc · FonMin · DispObl · DispOblm · FonMaxEd · FonMaxEdm · SepMnEdf · AltMaxMV · AltMaxMP · Definic · GradPorm` + 13 `Obs*` | **32** |
| bespoke (San Cristóbal de La Laguna only) | `AltMaxCornis · AltMaxCoron · AltMaxBRas · AltMinSRas` | **1** |

✅ **The founder's "each with its own observations field" is CONFIRMED** — all 14 have an `Obs*`
companion in the census.
✅ `esCanariasSipu.ts:218-221` independently confirms the split: *"`AltMaxMt` DOES NOT EXIST IN
`EDIF.mdb` AT ALL — 0 of 73 readable EDIF tables. It lives in `RUS.mdb`, table `SRAR`."*

**What the ADAPTER can actually see** (`providers/canariasSipuProvider.ts:39-66`, `SipuEdifRecord`):
`Etiqueta · Nombre · SupMin · SepMinFr · SepMinPs · SepMinLt · DispObl · DispOblm · FonMaxEd ·
FonMaxEdm · PMaxOcup · EdifMax · AltMaxPl · AltMaxMV · AltMaxMP · AltMaxMt · AltMaxCornis ·
AltMaxCoron` + an index signature for `Obs*`. ⛔ **`LongMin`, `CircInsc`, `FonMin`, `SepMnEdf`,
`SepMnVol`, `SupOcMax`, `SupEdMax`, `FondoMax` and `ParcVInc` are NOT in the typed record — the
adapter cannot see them.**

**Populated-ness, where the repo measured it** (`esCanariasSipu.ts`): corpus 73 archives / 10 052
zone rows / 636,1 km² — **15,6 % any-drawable columns-only, 24,2 % land-weighted, COMPLETE rule only
3,2 %** (`:39-48`). Height: **74,4 % publish none · `AltMaxPl` floors-only 14,9 % · `AltMaxMV`
(street) 6,3 % · `AltMaxMP` (parcel) 2,2 % · memo-metres-no-datum 2,0 % · both explicit 0,2 %**
(`:180-186`). Depth: `FonMaxEd` **3,75 % non-sentinel and every non-sentinel value is TEXT**;
**`FondoMax` has 1 non-sentinel cell in 8 415 rows and that cell is the string `"IDEM"` — ZERO
numeric values.** `AltMaxMt` in RUS/SRAR: **45 / 8 719 = 0,5 % valid.**

⛔ **No repo artefact measures validity for `SupMin`, `LongMin`, `CircInsc`, `SepMnVol`, `SupOcMax`
or `SupEdMax` in EDIF.** They are in the probes' PARAMS dicts but no percentage is published. Say
**unmeasured**, never *absent*.

⛔ **And no numeric SIPU parameter is COMMITTED anywhere in the repo.** `providers/data/teldeEdif.json`
(2 643 records) and `providers/data/elSauzalZuso.json` (529) carry **`etiqueta` + `rings` ONLY**.
Every number lives in the hand-transcribed pack `rulepacks/esTeldePgo2003.ts` (**15 zones of 46 EDIF
rows**). ⚠ `containers/sipuShapefile.ts:18-24` records that a grep-based field-name guess would have
reported `A10`/`A12`/`A17`/`A2_1` as columns — they are DATA VALUES inside `ETIPLAN`/`TXTPLAN`, found
only by a byte-level DBF header parse (§grep-silence-has-three-causes).

---

## §2 — The cross-map: the founder's 14

`C58 slot` = a seat in `ZoningRule`/`GeometricRule`, or `no slot exists`.

| # | SIPU field | Meaning | PRYZM param | C58 slot | Verdict |
|---|---|---|---|---|---|
| 1 | `SupMin` | superficie mínima de parcela (m²) | — | **none** | **NO SEAT.** Real loss: El Sauzal Art. 10.25's *400 m²* and Telde B1/B2's *SupMin 100 m²* survive only as prose inside `ordinanceRef`. A pack-local rival already exists — `minParcel_m2` (`bcn20aSubzones.ts:113`). |
| 2 | `LongMin` | longitud mínima de fachada | — ⚠ **A4 is the STREET's right-of-way width, NOT the parcel's frontage — do not conflate** | **none** | **NO SEAT.** `esBarcelona20aAillada.ts:468`: *"Art. 343.1 also requires a façana of at least 10 m, **which PRYZM does not measure**."* Second source: Madrid `NM_FRTE_MIN` → pack-local `minFrontage_m`. |
| 3 | `CircInsc` | diámetro del círculo inscribible mínimo | — | **none** | **NO SEAT.** No rival anywhere. |
| 4 | `SepMinFr` | separación mínima al frente | C5 | `setbacks.front_m` | **EXACT.** `0` is a RULE, not a null. |
| 5 | `SepMinPs` | separación mínima posterior | C5 | `setbacks.rear_m` | **EXACT.** |
| 6 | `SepMinLt` | separación mínima lateral | C5 | `setbacks.side_m` | **EXACT** against SIPU. ⚠ The system loss is UPSTREAM: **A3 (per-edge frontage classification) has no seat in `ZoningRule` at all**, so neither side can be differentiated. |
| 7 | `FondoMax` | fondo máximo (m) | C4 (depth) | `geometricRule.alignment.buildableDepth_m` | **AMBIGUOUS.** The seat exists, but (a) it is a **RURAL-family column, in 0 EDIF tables**; (b) **1 non-sentinel cell in 8 415 rows, and it is the string `"IDEM"`**; (c) the seat needs an alignment datum edge, else `depth-without-datum` refuses. The URBAN depth columns are `FonMaxEd`/`FonMaxEdm`, which the list omits. |
| 8 | `SepMnVol` | separación mínima entre volúmenes | **C5 NAMES IT** — *"includes distance-between-buildings on the same plot"* | **none** — `setbacks` is a front/side/rear triple | **NO SEAT.** ⭐ Named in the ratified REFERENCE, absent from the schema. Its EDIF twin `SepMnEdf` is range-gated in the probes but `readSipuZone` never reads it. |
| 9 | `PMaxOcup` | ocupación máxima (%) | C4 (ratio) | `maxCoverage` | **EXACT** (÷100), with a SUSPECT-NEVER-VALID guard rejecting 100 % alongside a published setback. |
| 10 | `SupOcMax` | superficie ocupable máxima, **absolute m²** | C4 | **none** — C58's seat is `z.number().max(1)`, a RATIO ONLY | **NO SEAT** for the absolute form. Same defect class `esBalearsMuib.ts:175-176` already guards: *"a 300 m² ceiling read as a FAR of 300 would be catastrophic"*. |
| 11 | `EdifMax` | edificabilidad máxima (m²/m²) | D1 | `plotRatioFAR` | **EXACT.** Range 0,01–20 with *"⛔ > 20 is m² or m³/m², not a FAR"*. |
| 12 | `SupEdMax` | superficie edificable máxima, **absolute m²** | D1 — the reference itself says *"ratio **or** absolute m²"* | **none** — the schema seat is a ratio | **NO SEAT.** ⭐ The REFERENCE has the absolute form and the SCHEMA does not. |
| 13 | `AltMaxPl` | altura máxima en nº de plantas | C3 | `maxFloors` | **EXACT**, with a `"7,5"`-in-a-storeys-column guard (*"a ~2.5× overstatement"*). |
| 14 | `AltMaxMt` | altura máxima en metros, **datum unstated** | C2 + A2 | `maxHeight_m` + `heightDatum` | **LOSSY.** The metre seat is exact; the DATUM is not — `SIPU_HEIGHT_DATUM` maps it to `'unspecified'` and **ADR-0377's union has no `unspecified` member**; the honest map is `unknown`, which REFUSES. And it is 0/73 EDIF tables, 0,5 % valid in RUS. |

### §2.1 — The columns the founder's list OMITS — the ones that already fit PRYZM's engine

| SIPU field | Meaning | C58 slot | Verdict |
|---|---|---|---|
| `DispObl` (32) | disposición obligatoria — `AV`/`GRF`/`F` | **C1** → `geometricRule.kind` + `alignTo` | **EXACT** |
| `DispOblm` (32) | metric mandatory façade line | `alignment.alignmentOffset_m` | **EXACT** — *"precisely what `alignmentOffset_m` is documented for, so no new field and no new engine"* |
| `FonMaxEd` / `FonMaxEdm` (32) | fondo máximo edificable (coded / metric) | `alignment.buildableDepth_m` | **EXACT SEAT**, populated at 0,0 % / ~3 %. `T`/`TP`/`TS` tokens are a SECOND alignment grammar. |
| `AltMaxMV` (32) | altura máxima from the **STREET rasante** | `maxHeight_m` + `heightDatum: 'street-level'` | **LOSSY** — the member exists but the resolver returns `no-resolver-wired`, so it still refuses. |
| `AltMaxMP` (32) | altura máxima from the **PARCEL** | ⛔ **no union member** | **NO SEAT for the datum** (see §3) |
| `AltMaxCornis` / `AltMaxCoron` (1) | altura de **cornisa** / **coronación** | ⛔ a **different AXIS** | **NO SEAT** (see §3) |
| `FonMin` · `SepMnEdf` · `ParcVInc` (32) | min parcel depth · separation between buildings · (unrated) | — | **NO SEAT** |
| `Obs*` ×14 | per-parameter observations/conditions | ⛔ collapsed to ONE boolean `conditional` | **LOSSY — 14 strings → 1 bit.** 12,9 % of routable rows are `Obs*`-conditioned. |
| `UsoGlobal` · `detUso` · `CondUsos` · `otrasDet` | uses + the memo channel | `permittedUse` | ⛔ **NOT READ AT ALL.** Telde's `permittedUse` is human-derived from the `Nombre` label. The memo channel is worth **+2,2 pt zone-weighted / +6,6 pt LAND-weighted**, unread. |

---

## §3 — ⭐ The datum question: ADR-0377 vs SIPU

`packages/schemas/src/site/HeightDatum.ts:78-86` — the union is **7 members**: `facade-rasant` ·
`street-level` · `mean-ground-at-facade` · `absolute-national(NGF|NHN|EH2000)` · `terrain-highest` ·
`terrain-lowest` · `unknown`, compile-closed by `HEIGHT_DATUM_KIND_REGISTRY`. **ADR-0377 never
mentions Canarias or SIPU.** `SipuHeightDatum` is a DIFFERENT 7: `street · parcel · cornice · crown ·
unspecified · floors-only · unknown`.

| SIPU datum | column | ADR-0377 member | Status |
|---|---|---|---|
| `street` | `AltMaxMV` | `street-level` | ✅ exists — ⚠ but `no-resolver-wired`, so it refuses anyway |
| `parcel` | `AltMaxMP` | — | ⛔ **MISSING.** `terrain-highest`/`terrain-lowest` are natural-terrain extrema; `mean-ground-at-facade` is a façade-line quantity. **A new member must be minted by ADR citing `AltMaxMP` / ITPU-SIPU.** ⚠ The spelling is NOT invented here — the repo names no candidate. |
| `cornice` | `AltMaxCornis` | — | ⛔ **MISSING, AND ON A DIFFERENT AXIS.** The union names only the LOWER reference plane; *cornisa* vs *coronación* is the **UPPER measurement point** (`esCanariasSipu.ts:198-199`: *"THESE ARE NOT SYNONYMS — THEY ARE DIFFERENT HEIGHTS ON THE SAME BUILDING"*). **No member count fixes this; it needs a second axis (`heightMeasuredTo`).** |
| `crown` | `AltMaxCoron` | — | ⛔ same |
| `unspecified` | `AltMaxMt` | → `unknown` | ⚠ honest but lossy — *"the source does not resolve its datum"* ≠ *"the schema states metres and names no datum"*. Both refuse, so it is SAFE. |
| `floors-only` | `AltMaxPl` | n/a | correct — a storey count is not a datum |

⛔ **A RIVAL VOCABULARY ALREADY EXISTS, AND ADR-0377 EXISTS TO PREVENT EXACTLY IT.**
`rulepacks/esMadridPgoum97.ts:223` declares its own pack-local
`readonly heightDatum: 'cornisa' | 'coronación'`, used at `:234, 248, 263, 277, 291`.
⛔ **And NO Spanish pack sets the RATIFIED seat at all** — `grep heightDatum` over
`esTeldePgo2003.ts` / `esElSauzal.ts` / `esBalearsMuib.ts` → **zero hits**. Telde's datums survive
only as free text (`maxHeight_m: 7.5, // AltMaxMP — datum: PARCEL`). Under `heightDatumOf` every one
reads as `unknown` and refuses.

---

## §4 — The amendment surface, named

**Six parameter seats** (+4 from the omitted set): minimum plot area (`SupMin`) · minimum frontage
length (`LongMin`, distinct from A4) · minimum inscribed-circle diameter (`CircInsc`) · separation
between volumes on the same plot (`SepMnVol`/`SepMnEdf`) · maximum occupiable AREA in absolute m²
(`SupOcMax`) · maximum buildable floor AREA in absolute m² (`SupEdMax`) · minimum parcel depth
(`FonMin`) · per-parameter condition TEXT (`Obs*`) · cornice/crown measurement point · parcel height
datum.

⭐ **These are not speculative.** Two independent regions already publish minimum frontage (Canarias
`LongMin`, Madrid `NM_FRTE_MIN`) and two packs already carry pack-local rivals for minimum plot area.
The corresponding `EnvelopeParameterKey` members (`packages/schemas/src/site/zoning/RuleState.ts:171-202`,
25 members keyed A1–E5) are likewise absent.

**C58 slots SIPU CANNOT fill:** `permittedUse` (no use column is read — SIPU's structural ceiling is
therefore **7/8** of the measured slots) · the datums above · **five of the eight `GeometricRule`
kinds** (SIPU names three grammars: `setback`, `alignment-depth`, `occupation`) · A2 / A4 / A6.

---

## §5 — What blocks a FIP/SIPU → canonical compiler

**LEGAL.** `CANARIAS_ENVELOPE_VERIFIED = false`, `signature: null`, governing Telde **plus all 87
other municipalities**. `EL_SAUZAL_ENVELOPE_VERIFIED = false` (pack `packMap()`-EMPTY while shut).
⛔ **`CANARIAS_MULTI_INSTRUMENT_BLOCKER` — and NO SIGNATURE FIXES IT.** `tools/canarias-catalogue-probe`
upgrades this from asserted to **PROVEN**: *"zero CKAN relationships across all 174 packages; no
`replaces`/`replacedBy`; no `vigente` flag"*, **43 of 88 municipalities hold >1 non-modification base
instrument**, and ⭐ **phase cannot break the tie — 93,4 % of all SIPU share the single value
*Aprobación Definitiva***. *"'Current' is not derivable"* is recorded as **proven**. **11
municipalities have ZERO non-modification base instrument.** ⚠ Two in-repo counts of the same fact
disagree — `esCanariasSipu.ts:356` says **46**, the catalogue probe says **43**. **Run the probe;
do not pick.** Above all of it, **PLANES INSULARES are UNMEASURED and can only OVER-grant**, so every
Canarias envelope must render OPEN-TOP.

**DATA.** ⭐ **`EDIF_L`, the companion LINE shapefile, is never fetched** — when `DispObl = GRF` the
manual says *"su trazado estará recogido en un shape"*: **structured GIS geometry shipped in the same
package**, not a scanned sheet. The *Normas Urbanísticas* PDF ships INSIDE every SIPU package,
UNREAD. El Sauzal's *fichero de ordenación anexo* is not in the 340-page PDF. **22 archives over the
12 MB cap were never sampled + 1 decode failure.**

**ENGINEERING.** The 6–10 missing seats. No `parcel` datum member; no cornice/crown axis;
`street-level` has no resolver — and in the Telde corpus `AltMaxMV` + `AltMaxMP` together are **8,5 %
of rows, both currently unresolvable through the ratified path**. `SipuEdifRecord` cannot see 9
observed columns. The memo channel is unread. `sipuShapefile.ts:179-186` refuses non-polygon
shapefiles, so `EDIF_L` needs a NEW READER, not a config flag. The `access_parser` variable-length
defect blocks San Cristóbal de La Laguna's entire archive and produces garbage cells corpus-wide.
⚠ **A possible mis-pairing, flagged as inference not measurement:** the adapter maps
`AltMaxMP → ObsAMP`, but `ObsAMP` is in **102** tables while `AltMaxMP` is in only **32** — in the 70
rural tables `ObsAMP` has no `AltMaxMP` to annotate, so a rural-family read using this map would
attach the WRONG observation.

### §5.1 — ⛔ FIP: 526 archives counted, ZERO opened

`tools/canarias-catalogue-probe` (11 sum checks, all passing) censuses **174 packages · 4 697
resources · 1 169 SIPU · 88 of 88 municipalities carry ≥1 SIPU, zero empty**, and counts
**`FIP: 526`** catalogue-wide (**430 municipal**), with a real committed URL
(`opendata.sitcan.es/upload/planeamiento/fip/350120_….zip`).

⛔ **`FIP` returns ZERO matches across `packages/`, and its only three `tools/` references are a
URL-prefix regex.** The repo has counted 526 FIP archives, verified their URLs resolve, proven their
municipality key unreliable — **and has never opened one.** No parser, no fixture, no schema seat,
no test.
⚠ **`fip-code-unreliable`, a named blocker that would bite a compiler immediately:** the FIP URL's
municipality code is 6-digit on 416 records and 5-digit on 5, and **two municipalities carry a
CORRUPTED PROVINCE DIGIT** — Puerto de la Cruz has `280282` (province 28 = Madrid) alongside `380282`;
Valverde has `370488` (province 37 = Salamanca). *"The FIP prefix is not a stable municipality key.
The reliable key is the CKAN package."*

**Three more facts a compiler must respect.** The precedence chain is already COUNTED —
PGO/PGOU 375 · Plan Parcial 202 · NNSS 150 · Plan Especial 104 · Estudio de Detalle 98 · …
**Modificación with the BASE INSTRUMENT NOT NAMED: 24**. **Vintage is a trap:** 97,8 % carry a date
but **90,4 % is a BOC PUBLICATION date and only 6,6 % an APPROVAL date**, so a naive `ORDER BY date`
supersession resolver is wrong on nine records in ten. And **`format` contradicts `mimetype` on 1 164
resources** (labelled PDF, served `text/html` — idecanarias index pages): *"populated is not present."*

✅ **Founder claim §3.2 (Urbanismo en Red) CORROBORATED from repo data** — the Mogán package's own
CKAN metadata: *"…financiación del Ministerio de Fomento, a través del **Programa Urbanismo en Red**
ejecutado por **Red.es**, 2010-2015. Los trabajos de normalización … por **GRAFCAN**."*

⚠ **Reuse `tools/canarias-catalogue-probe/out/SAMPLE-FRAME.json`, do not rebuild it** — 28 SIPU ZIPs,
`seed 20260802`, stratified, every row HEAD-verified 200 with exact size agreement. Its `VALIDITY`
block: **valid** for ZIP-interior schema/field-coverage questions; ⛔ **NOT valid for area or parcel
shares** (a Valencia run stratified by POPULATION to estimate LAND AREA overstated it ~2×).

---

## §6 — The other four Phase-1 regions, from repo evidence

**BALEARS / MUIB — the best `P` in Spain, live-resolved, zero packed zones by design.**
`rulepacks/esBalearsMuib.ts`. `R` (identify the land) **97,1 %**; `P` (state a rule) **74,1 % of
private developable land any-drawable, 61,4 % COMPLETE + 12,7 % PARTIAL — the best `P` measured
anywhere in Spain.** The source is a per-zone normative **fitxa at a stable URL the zoning layer
itself publishes** (**5 273 distinct fitxes**), read LIVE PER PARCEL — so `zones` is empty by
construction, the Denmark/Paris/NL shape. Codes: `E` edificabilitat → `plotRatioFAR` **ratio form
only**; `HR`/`HT` → `maxHeight_m`; `NP` → `maxFloors`; `RA`/`RM`/`RF` → front/side/rear.
⭐ **The "AT lesson": `HR`/`HT`, NEVER `AR`/`AT` — `AT` is *Allotjament turístic*, a USE CLASS. A
guessed dictionary reported metric height as 0/80 ABSENT when it is 49/80.** Twin: `RL` = *Religiós*,
and the setback family is ***Reculada***, not *Retranqueig* — searching the Castilian term reports a
real setback absent. Blockers: gate false + `signature: null`; **only 2,0 % of fitxes cite an
article**; PTI island-tier supersession unmodelled.

**MADRID — a region/capital SPLIT, and the region's schema is the richest structured source in Spain
outside Canarias.** The REGION (178 non-capital municipalities) reads `sitcm:VPLA_V_ORDENANZA`:
`NM_ALTURA` · `NM_N_PLTA` · `NM_OCP_MX` · **`NM_FDO_MX_ED`** (buildable depth) · `NM_RTR_FRNT`/
`NM_RTR_LATL`/`NM_RTR_POST` · **`NM_C_ED_ORD`** (FAR per ORDINANCE) vs **`NM_C_ED_MAZ`** (FAR per
MANZANA — *"NOT interchangeable … a block-granularity figure"*) · **`NM_FRTE_MIN`**.
⭐ **`NM_ALTURA` is the repo's canonical example of the datum defect** — *"`altura de cornisa` ≠
`altura total`"*, *"the `NM_ALTURA` ambiguity that makes Madrid legally uninterpretable"*. The
CAPITAL is separate and must never be folded in: a census of **41 folders · 447 services · 3 591
layers · 24 718 fields** returned **`depth: 0`, `setback: 0`**, so the proving municipality fell back
to Boadilla del Monte. `CM_SPACM_ENVELOPE_VERIFIED` false.

**MURCIA — the only one here that is SIGNED, and it still cannot publish on two-thirds of its land.**
Live municipal GeoServer. **`Murcia:pgou_alineaciones` is MISLEADINGLY NAMED** — a POLYGON layer
carrying the *calificación* (`calificacion · descripcion · uso_global · sector · url` → the ficha
PDF · `f_inicial`/`f_fin`). ⭐ **`f_inicial`/`f_fin` ARE the legal-status attribute** — a validity
INTERVAL where Denmark uses booleans; in-force records carry `f_fin = 2999-12-30`, and *"reading the
attribute without the interval would silently quote a repealed rule"*. `MURCIA_ENVELOPE_VERIFIED` is
**SIGNED** (founder, 2026-08-01). ⛔ **The cap is LEGAL, not coverage:** on **67,0 % of the 75,145 km²
of private buildable land the PGOU DELEGATES** to a prior separately-approved instrument (Arts.
6.6.1.1 / 6.6.2 / 5.24.5.1) whose *expediente* number is the digits after `TA-`. *"No signature
changes that."*

**EUSKADI — DOCUMENTED, ZERO CODE. Measured, not assumed.** ⛔ A ripgrep for
`euskadi|udalplan|bizkaia|gipuzkoa|es-pv|Donostia|Vitoria-Gasteiz` across `packages/` returns **NO
FILES**. No rulepack, no provider, no bbox, no registration, no fixture, no field name. What exists
is documentation: `docs/04-reference/jurisdictions/es/es-pv/` with Bilbao, San Sebastián and
Vitoria-Gasteiz folders, each stating **"NO PACK — `not-assessed` (`pending-implementation`)"** and
all five ADR-0279 slots empty, with **S1 parcel provider ⚠ foral-blocked (Basque/Navarra own
cadastre)**. ⚠ **That is a PARCEL-layer blocker that PRECEDES any planning question** — Euskadi and
Navarra are the two places the national Catastro path does not reach. UDALPLAN, Bizkaia's WFS and
Gipuzkoa's planning-register API appear in the repo **only inside the founder transmissions**: they
are research leads, not measurements.

---

## §7 — Build order this evidence implies

1. **Mint the missing DATUM members FIRST.** `AltMaxMP` (parcel) has no member; cornice/crown need a
   **second axis** (`heightMeasuredTo`), not more members on the existing one — and Madrid already
   minted a rival vocabulary (`esMadridPgoum97.ts:223`), so the ADR should absorb it in the same
   commit. Then wire a resolver for `street-level`, which is representable and still refuses.
2. **Mint the six parameter seats** + the corresponding `EnvelopeParameterKey` members.
3. **Then the compiler — SPLIT IN TWO.** The **SIPU half** has a 103 125-row parsed corpus behind it
   and its first real wins are the unread MEMO channel (+2,2 pt zone / **+6,6 pt LAND**) and `EDIF_L`
   for the `GRF` rows. The **FIP half** has a catalogue entry and nothing else — **opening ONE FIP
   archive is a day's work and the cheapest available test of the founder's "biggest shortcut"
   claim.**
4. ⛔ **Do NOT spend engineering on the 43–46 multi-instrument municipalities.** The blocker is legal
   and structural — no vigencia field exists in any SIPU family — and only the Gobierno de Canarias
   can close it.
