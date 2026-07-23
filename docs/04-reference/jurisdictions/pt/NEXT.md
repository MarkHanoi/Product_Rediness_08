# NEXT — Portugal (`pt`)

> **What this file is.** The single place recording where we stopped on Portugal, exactly why, and
> precisely what to do to go further the moment it becomes possible — so a source or technique found
> while working on ANY other jurisdiction can be brought straight back here.
> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED
> **Status:** RESEARCH COMPLETE — legal structure fully characterised; cadastral-regime confirmation
> gates every city; no rule pack implemented; no live endpoints probed.

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The **legal/zoning structure is now fully characterised** in `findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md`
(the Portugal analogue of the Germany and France studies, same method). The national instrument
hierarchy (RJIGT/DL 80/2015 → DR 15/2015 → PDM/PU/PP; RJUE/DL 555/99 as reformed by DL 10/2024;
RGEU 1951; DL 72/2023 unified cadastre; Lei 107/2001 + DL 309/2009 heritage) is documented. Three
cities have been characterised at depth: Lisboa, Porto, and Braga. The 3D context-data layer spike
is documented in `PORTUGAL-CONTEXT-DEEP-DIVE.md` (endpoints not live-probed). **The single
prerequisite gate blocking every subsequent task is the cadastral-regime confirmation** — Portugal's
parcel geometry layer is an open question for 174 of its 308 municípios (including, possibly, the
largest cities), and no rule pack, no pipeline design, and no dev-day estimate can be validated
until that confirmation is in hand for any specific candidate city.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why exactly that)

**Zoning full-envelope resolution: 0% (not started).**

**Context-data coverage: 0% (endpoints identified in research, none live-probed).**

**Denominator for envelope:** any Portuguese parcel for which (a) the Carta Cadastral confirms CGPR
or SiNErGIC coverage providing a queryable geometry, and (b) the covering PDM/PP has numeric
parameters (índice de utilização + cércea + afastamentos) in a structured or PDF-parseable form.
Currently zero parcels classified, therefore zero resolved.

The honest denominators to measure once cadastral confirmation exists:
- Of target-city land: what % has confirmed Carta Cadastral parcel geometry?
- Of that geometry: what % is covered by a PDM categoria with numeric parameters?
- Of that: what % has SNIT WFS queryable zone polygon?

---

## 3 — BLOCKERS (each: what · why it blocks · what would unblock · the EXACT resume step)

### 3.1 — Cadastral-regime confirmation not done for any candidate city (the #1 blocker)

- **What it is.** Whether Lisboa, Porto, Braga (or any other candidate) fall inside CGPR, SiNErGIC,
  or no-cadastre coverage. This is a spatial check against DGT's coverage map, not a parcel fetch.
- **Why it blocks.** Without geometry we cannot build any pipeline for the parcel layer. A beautifully-
  sourced PDM rule pack is useless if there is no polygon to apply it to. This is structurally worse
  than Germany's §34 fraction question (which asks "how many parcels have no numeric rule") —
  Portugal's question is "how many parcels have no geometry at all."
- **What would unblock it.** Query DGT/SNIC for the confirmed coverage list per município. DGT
  publishes the CGPR (127 munis) and SiNErGIC (7 munis) coverage, but the specific confirmed
  municipality list should be verified against the current SNIC portal.
- **THE EXACT RESUME STEP:**
  1. Navigate to `snit-mais.dgterritorio.gov.pt` → confirm cadastral coverage layer availability.
  2. Alternatively, query `snig.gov.pt` for the INSPIRE Cadastral Parcels dataset extent per município.
  3. Check specifically: does Braga (DICOFRE 0303) appear in CGPR or SiNErGIC coverage?
  4. Check: does Lisboa (DICOFRE 1106) appear in CGPR or SiNErGIC coverage?
  5. Record: which regime, what year the cadastre was produced, whether urban parcels are included.
  6. If Braga is confirmed → Braga becomes the first-mover city (Tier 1 candidate).

### 3.2 — SNIT WFS live probe not done

- **What it is.** The SNIT geoportal (`snit-mais.dgterritorio.gov.pt`) is stated as the queryable
  national PDM layer, but its WFS structure, field names, and structured-data completeness are not
  verified.
- **Why it blocks.** Cannot design a SNIT ingestion pipeline without knowing what attributes the WFS
  returns. Specifically: does it return the PDM "categoria de espaço" as a structured attribute, or
  only a polygon ID and a PDF link?
- **What would unblock it.** A GetCapabilities probe followed by a GetFeature for one known Braga
  parcel.
- **THE EXACT RESUME STEP:**
  ```bash
  # SNIT WFS GetCapabilities
  curl "https://snit-mais.dgterritorio.gov.pt/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
    | grep -E 'FeatureType|Name'

  # GetFeature for a point in Braga (approx centroid: lon -8.426, lat 41.545)
  curl "https://snit-mais.dgterritorio.gov.pt/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0\
  &REQUEST=GetFeature&OUTPUTFORMAT=application/json\
  &BBOX=-8.436,41.535,-8.416,41.555,EPSG:4326&COUNT=3" \
    | python3 -m json.tool | head -100
  # Record: field names returned, whether categoria/índice/cércea appear as attributes or just PDF link
  ```
  Also try `apicarto.ign.fr`-style endpoint if SNIT exposes an APIcarto-equivalent.

### 3.3 — DGT LiDAR endpoints not live-probed

- **What it is.** `cdd.dgterritorio.gov.pt` is the claimed LiDAR distribution portal but has not
  been fetched.
- **Why it blocks.** Cannot confirm tile index format, download method, or coverage status (the ~90%
  figure is from the founder deep-dive, not a live measurement).
- **What would unblock it.** Browse `cdd.dgterritorio.gov.pt`, download one tile over a test area,
  confirm LAZ + DTM/DSM products, record EPSG, check class codes.
- **THE EXACT RESUME STEP:** Navigate to `cdd.dgterritorio.gov.pt` → confirm tile index (WMS or
  tile grid), download smallest available DTM tile for Braga area, run `lasinfo` or `pdal info`,
  record class code list vs ASPRS standard.

### 3.4 — Lisbon CML 3D model licence unverified (Lisbon-specific hard blocker)

- **What it is.** The CML council-wide 3D model is richer than any Spain municipal source, but
  its redistribution licence is unknown.
- **Why it blocks.** If the licence does not permit redistribution inside a commercial product, the
  Lisbon special-case pipeline cannot be built.
- **THE EXACT RESUME STEP.** Navigate to `geodados-cml.hub.arcgis.com`, click the "Modelo
  Tridimensional" dataset, read the licence/terms tab. Record: CC-BY? CC-BY-SA? Proprietary?
  Commercial-use permitted? Attribution required? If terms require email confirmation, send a
  formal enquiry to CML data team.

### 3.5 — Braga PDM numeric values partially sourced but not fully structured

- **What it is.** The research pass found índice de utilização máximo 1.20 (0.80 above cota de
  soleira) and cércea máxima 7.5 m for "espaços residenciais" — but only for one category, one
  source, and not yet with a SOURCES.md row.
- **Why it blocks.** `SOURCES.md` requires a citation row for every value before any pack can ship
  `confidence: structured`.
- **THE EXACT RESUME STEP.** Read Braga's PDM regulamento (available from SNIT) — specifically:
  (a) Art. 14 or equivalent for afastamentos/recuos; (b) the article defining índice de utilização
  and what counts toward "área de edificação" (the formula, not just the number); (c) all remaining
  categories of espaço beyond "espaços residenciais". Add a row to `pt-03/0303-braga/sources/SOURCES.md`
  for each value with the governing article + document date + URL.

### 3.6 — Moda da cércea requires a new GeometricRule kind (Porto-specific)

- **What it is.** Porto's PDMP defines a fabric-derived height rule (the cércea value with greatest
  linear extent on the urban front). This is not configurable on any existing C58 §2.2 rule kind.
- **Why it blocks.** A Porto pack cannot be authored until the rule kind exists in the engine.
- **THE EXACT RESUME STEP.** Raise a C58 amendment decision: add `fabricDerivedHeight` as a new
  `GeometricRule` kind in C58 §2.2, parallel to the `blockDerivedAlignment` kind added for
  Barcelona Art. 242. Write the ADR before implementing.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If the nDSM height module is built or confirmed for ES or FR** → Portugal feeds the SAME
  module (`DSM−DTM`, 90th-pctile), different DGT inputs. Do NOT one-off it. Update this note with
  the module name + confirmation date; then the PT height pipeline is a new tile source, not a new
  pipeline.
- **4.2 — If a DICOFRE-keyed municipality register is confirmed** → it is the join key for all PT
  municipality folder names. Verify and update any folder names that were created with approximate
  DICOFRE codes (Lisboa 1106, Porto 1315, Braga 0303 — all marked "verify" in this session).
- **4.3 — If France's apicarto.ign.fr pattern is confirmed to be reusable** → check whether SNIT
  uses a compatible query pattern. France uses `apicarto.ign.fr/api/gpu`; SNIT may expose a similar
  endpoint. The adapter logic may port.
- **4.4 — If any Portuguese município's PDM is confirmed to publish structured numeric data** (not
  just a PDF) → flag it here. This would be a structural breakthrough equivalent to Denmark's
  Plandata.dk — rare but possible, given the EU HVD mandate pressure.
- **4.5 — If the Carta Cadastral OGC API (planned 2025) goes live** → Portugal's parcel layer
  becomes fully analogous to France's API Carto. Update §3.1 and create a `PtParcelProvider`
  adapter immediately. This would collapse the §34-equivalent gate entirely.
- **4.6 — If any CGPR coverage list per município is published as an open dataset** → use it to
  pre-classify all 308 municípios into Tier 0/1/2/3 (per the study §C) without per-city manual
  checks. Update the municipality coverage table in `README.md §4`.
- **4.7 — If Lisbon's créditos de construção schema becomes machine-queryable** → this would be the
  first tradeable-floor-area mechanism in the engine, with no France/Germany analogue. Raise a C58
  amendment to add a `transferableRights` overlay type.
- **4.8 — If the moda da cércea GeometricRule kind is added to C58** (see Blocker 3.6) → Porto pack
  authoring is unblocked. Add a TRIP-WIRE back to the C58 ADR in the Porto NEXT.md.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- **Legal structure characterisation** — `findings/PORTUGAL-MASTER-DATA-SOURCE-STUDY.md` (this
  session, 2026-07-23). Complete for national baseline: RJIGT, DR 15/2015, RJUE, RGEU, DL 72/2023,
  Lei 107/2001 + DL 309/2009, SNIT, DGT LiDAR, BUPi (confirmed NOT a parcel source).
- **3D context-data spike** — `PORTUGAL-CONTEXT-DEEP-DIVE.md` (L-514); per-layer badging matrix;
  Lisbon municipal exception documented.
- **National data-source catalogue** — `sources/SOURCES.md` (this session).
- **Municipality stubs** — `pt-11/1106-lisboa/`, `pt-13/1315-porto/`, `pt-03/0303-braga/` with
  README + NEXT + SOURCES/VERIFICATION stubs.
- **National vocabulary table** — `README.md §1.4`: cércea, índice de utilização, moda da cércea,
  colmatação, créditos de construção, ZGP/ZEP — do NOT re-derive or rename these terms.
- **BauNVO analogy mapping** — confirmed that DR 15/2015 is the taxonomy analogue, not the numeric
  analogue (no national ceiling table exists; this is the France pattern, not the Germany pattern).

---

## 6 — VERIFIED SOURCES (endpoint · answers · confidence tier · the exact query)

| Source | Answers | Tier | Note |
|---|---|---|---|
| RJIGT (DL 80/2015, consolidated) | IGT hierarchy; national structure of PDM/PU/PP; Art. 74(4) uniform criteria mandate | `published` | `dre.pt` — search "DL 80/2015" |
| DR 15/2015 | National solo classification criteria (urbano/rústico); abolition of solo urbanizável | `published` | `dre.pt` — "Decreto Regulamentar 15/2015" |
| RJUE (DL 555/99, reformed by DL 10/2024) | Comunicação prévia vs licenciamento prévio trigger; "precise parameters" as the switch | `published` | `dre.pt` — "DL 555/99" + "DL 10/2024" |
| DL 72/2023 | Unified cadastro predial regime; NIC identifier per prédio; rebuttable-presumption framing | `published` | `dre.pt` — "DL 72/2023" — in force 21 Nov 2023 |
| Lei 107/2001 + DL 309/2009 | Heritage classification; ZGP (50 m auto) + ZEP (custom radius) + ZNA | `published` | `dre.pt` |
| RGEU (1951, partially in force) | Habitability minimums; NOT a setback formula | `published` | — |
| SNIT geoportal | All mainland PDMs since Jan 2008; zone polygons; PDF links | `VERIFIED-LEAD` (endpoint stated, not live-probed) | `snit-mais.dgterritorio.gov.pt` |
| DGT CDD (LiDAR) | LAZ + DTM 50 cm + DSM 2 m; ~90% continental; open | `VERIFIED-LEAD` (not live-probed) | `cdd.dgterritorio.gov.pt` |
| Braga PDM — índice and cércea for "espaços residenciais" | índice de utilização máximo 1.20 (0.80 above cota de soleira); cércea máxima 7.5 m | `CONVERGENT-SECONDARY` — cited in research pass but governing article not independently verified | Read Braga PDM regulamento directly to upgrade to `published` |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **BUPi as a parcel-geometry source:** BUPi is a rural/mixed ownership registration initiative —
  citizen-submitted, voluntary graphic representation, NOT authoritative parcel geometry. Confirmed
  and stated in the research. Do not re-evaluate; do not wire BUPi for any pipeline.
- **Assuming Lisbon / Porto city centres have Carta Cadastral coverage:** the CGPR regime was built
  for rural (rústico) land, predominantly south of the Tagus. Built-up urban cores were NOT its
  primary scope. Do not assume urban coverage without direct DGT confirmation.
- **Assuming a single national numeric ceiling (BauNVO-style) exists in Portugal:** DR 15/2015
  provides a category taxonomy, not numeric ceilings. The research confirmed this explicitly. Do not
  search for a national GRZ/GFZ equivalent — it does not exist in Portuguese law.
- **Assuming solo urbanizável still exists in PDMs:** abolished nationwide by the 2015 reform.
  Older PDMs may still reference it; treat as a signal that the PDM needs amendment, not as a
  valid category to source against.
- **Deriving afastamentos from a national formula:** RGEU does not set a height-proportional
  setback formula. Do not write a national setback rule — only per-PDM values are valid.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the cadastral-regime confirmation for Braga + the SNIT WFS probe. Estimated: 0.5 dev-days.**

```bash
# Step 1: SNIT WFS GetCapabilities
curl "https://snit-mais.dgterritorio.gov.pt/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
  | grep -iE 'FeatureType|Name|Title' | head -40

# Step 2: GetFeature for a point in Braga municipal area (approx lon -8.426, lat 41.545)
curl "https://snit-mais.dgterritorio.gov.pt/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0\
&REQUEST=GetFeature&OUTPUTFORMAT=application/json\
&BBOX=-8.436,41.535,-8.416,41.555,EPSG:4326&COUNT=3" \
  | python3 -m json.tool

# Step 3: Try apicarto-style if SNIT exposes one
curl "https://snit-mais.dgterritorio.gov.pt/api/pdm?lon=-8.426&lat=41.545"

# Step 4: Cadastral coverage check
# Navigate: https://snig.dgterritorio.gov.pt → "Carta Cadastral" → coverage per municipality
# OR: https://snic.dgterritorio.gov.pt → confirm Braga is listed as CGPR covered
```

**What each outcome implies:**
- SNIT WFS returns categoria + índice/cércea attributes → SNIT is a structured data source (rare /
  unlikely, but confirm); Braga can be sourced directly via WFS.
- SNIT WFS returns zona polygon + PDF link only → sourcing pattern is: SNIT → PDF → OCR/manual
  transcription for all Portuguese cities (~8–12 d per city estimate holds).
- Braga confirmed as CGPR-covered → Braga becomes Tier 1 candidate; start Braga pack next.
- Braga not confirmed → Braga drops to Tier 0/2; check Porto/Lisboa before committing.
