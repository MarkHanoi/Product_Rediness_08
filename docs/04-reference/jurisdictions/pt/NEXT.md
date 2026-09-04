# NEXT — Portugal (`pt`)

> **What this file is.** The single place recording where we stopped on Portugal, exactly why, and
> precisely what to do to go further the moment it becomes possible — so a source or technique found
> while working on ANY other jurisdiction can be brought straight back here.
> **Last updated:** **2026-09-04** (lane ENVELOPE-IBERIA — see §0.0, which SUPERSEDES parts of §0.1) · previously 2026-07-31 (live-probe pass) · **Maintainer:** UNASSIGNED
> **Status:** RESEARCH COMPLETE + **LIVE-PROBED** + **NATIONALLY REGISTERED** (2026-09-04). Legal
> structure characterised; zoning geometry and cadastre endpoints VERIFIED; **Porto AND LISBOA**
> numeric rules primary-sourced; **no envelope-drawing rule pack implemented — and for Porto, none
> CAN be (§0.0 item 2).** The national registration stops the fabricated triple everywhere.

---

---

## 0.0 — ⭐ LANE ENVELOPE-IBERIA, 2026-09-04 — READ THIS BEFORE §0.1

Three things changed today, and one of them REVERSES a plan §0.1 below still describes.

### ⭐ 1 — Portugal was FABRICATING an envelope on every parcel. Fixed.

**MEASURED, not feared.** Portugal appeared in **no row** of `rulepacks/registry.ts`
`REGISTRATIONS`, so the §L-663 chokepoint in `applyEstimatedZoning` read
`resolveRegisteredJurisdictionAt → 'none'` — *"genuinely uncovered land, the estimate is honest
here"* — and **published the generic estimated triple (3,0 / 1,5 / 3,0 m, FAR 2,00, coverage 50 %)
on land PRYZM has read no article about**, across the whole Continente.

```
npx tsx tools/envelope-slot-coverage/measurePt.ts --frame both --n 120 --seed 20260903
```
**BEFORE:** `'none'` on **120 / 120** probed points, including **120 / 120** drawn over REAL
Lisboa + Porto building fabric by the proven two-stage sampler.
**AFTER (`§PT-NATIONAL-REGISTRATION`, `rulepacks/ptNationalRegistration.ts`):** **120 / 120** fabric
points resolve to `pt-pdm` and receive a CITED coverage refusal naming the PDM regime.

⭐ **It is the first registration whose `contains` is a REAL NATIONAL POLYGON, not its bbox** —
`PORTUGAL_BBOX` claims Badajoz, Mérida, Cáceres, Huelva, Ciudad Rodrigo, Verín and Puebla de
Sanabria, and the §L-663 guard runs BEFORE §ES-SIU-GUARD, so a bbox registration would have
SUPPRESSED Spain's own land-class guard over Extremadura. `resolveNationalJurisdiction()`
(lane BOUNDARY-WAVE, 26 countries, PRT = 17 rings, sha256-pinned) closes it by DATA.
⚠ Two limitations pinned in `ptNationalRegistration.test.ts` rather than papered over: the ~1,5 km
border tolerance band still reaches the estimate (unchanged behaviour, a strip traded for a
country), and `extent` is NOT `PORTUGAL_BBOX` — §EXTENT-CLAIM-TOTALITY forbids advertising more
land than you claim, so the declared box is the largest rectangle found INSIDE the polygon and the
globe under-draws (it misses Lisboa and Porto, which `contains` still claims).

### ⛔ 2 — PORTO IS CATEGORY C, NOT CATEGORY A. Do not plan an envelope-drawing Porto pack.

§0.1 step 5 and the §PORTO-SIGN-OFF record left the impression that Porto needed only a schema
amendment and a signature. **A whole-document read of the Regulamento (164 articles indexed,
dual-engine, sha256-pinned) says otherwise:**

> **For NO Porto subcategory does the Regulamento supply footprint + height + intensity with
> nothing missing and nothing inferred.** `afastamento` occurs **once** in 100 pages;
> `cércea máxima` **once**; `índice de ocupação` **never**; `pé-direito` **once and with no value**,
> and its external referent is never named (`RGEU` = **0 occurrences**) — so **"3 pisos" cannot be
> converted to metres from this document**. Art. 164.º sends omissions to OTHER legislation.

⇒ Under the founder's 2026-08-03 publication authorization, whose disqualifiers name *"missing
height rule"* explicitly, **Porto is a LEGAL-DATA blocker (category C). No signature opens it.**
Full evidence, with the four articles §A.0.3 did not carry: [`sources/SOURCES.md` §A.0.3b](./sources/SOURCES.md).

### ⭐ 3 — §0.1 step 3 is CLOSED: Lisboa's numeric tables are extracted.

[`sources/LISBOA-RPDML-PARAMETERS.md`](./sources/LISBOA-RPDML-PARAMETERS.md) — the RPDML
*republicação integral* (Decl. Retif. 703/2020), every parameter with its artigo, verbatim sentence
and PDF page, plus CML's own 18-row zone→article map.

**The finding is that there is largely NO índice or cércea TO source.** Traçados A and B state no
índice at all and their height is a **TRIMMED MEAN of the neighbours' façade heights** (Art. 4.º d):
same side of the street, between two transversais, tallest and shortest discarded. Traçado C SPLITS
BY TYPOLOGY (25 m scalar for isolated buildings; fabric-derived for *banda*). Only Traçado D is
scalar (Ie 1,0 / 0,7 area-stepped). **Lisboa is not representable as scalars.**

⭐ **And the ArcGIS token wall was about the ANONYMOUS ROOT, not the service** (§bulk-vs-query
again): layer 18's schema — `NOME · COD_SIG · INFOPDM · ART_RPDM`, **not one numeric field** — now
proves FROM THE SCHEMA what the repo had only inferred. ⚠ Also: **`WebFetch` gets 403 from
`lisboa.pt` and `dre.pt` where `curl` gets 200 — a UA filter, not an auth wall.** Earlier passes
that recorded those sources as dead were reading a UA block.

### What this lane BUILT (code, all green)

| Artefact | What it is |
|---|---|
| `packages/site-parcel-data/src/rulepacks/ptNationalRegistration.ts` | The national registration + its cited coverage refusal (`legallyGrounded: false`). |
| `packages/site-parcel-data/src/countryAdapters/pt/ptConceptLexicon.ts` | ⭐ **The doctrine's §12 step 7** — the DR 5/2019 dictionary as a TYPE-CHECKER, the §2.6 version boundary that REFUSES on an absent procedural start date, and the §9 traps (`COS` ≠ Spanish coverage; `cércea` = `H` not `Hf`; `Iimp` ≠ coverage; `Pm` ≠ `maxFloors`; `Alt` never collapsed into `H`). |
| `tools/envelope-slot-coverage/` | The F1/F2 slot-coverage harness (repaired — the ES arm was left unparseable by a dead lane). |

### The next five steps, REPLACING the ones below where they conflict

1. **Do NOT build a Porto envelope pack.** See item 2. If Porto is to be answered, the missing
   numbers must come from an instrument the Regulamento defers to (Art. 164.º) — that is a NEW
   sourcing question, not a signature.
2. **Lisboa needs `ContextAggregateRule.aggregate: 'trimmed-mean'` and a same-side street-segment
   contextSet scope.** ADR-0379 shipped `mode` over the block frontage for Porto; Lisboa is a
   different aggregate over a different member set. **That is a `packages/schemas/**` change and
   belongs to whichever lane owns `GeometricRule`.**
3. **Resolve the PDMP's PROCEDURAL START DATE** (SSAIGT/SNIT *dinâmica* feed). It decides
   `concept_dictionary_version` and it is the ONLY thing that settles
   `PT_CERCEA_LOCAL_DEFINITION_CONFLICT` — Porto's Art. 3.º g) defines *cércea* as a FAÇADE-TOP
   measurement (`Hf`-shaped) where the national dictionary makes it `H`.
4. **The six remaining Lisboa sub-gaps** — `LISBOA-RPDML-PARAMETERS.md` §6 (Svp quadro cells,
   Anexos I–XII, the `QUALIFICACAO.mpk` 7z unpack, DRE alterações 2020→2026, `INFOPDM` contents,
   zone 7's município).
5. **Email `snit.web@dgterritorio.pt`** — unchanged from step 1 below, and now doubly useful: the
   same message can ask for the `IDDEPOSITO` history for DICOFRE 1106 **and** the PDMP procedural
   start date for 1312.

## 0 — ⚠ READ FIRST: this file's §3 blockers were written before any endpoint was probed

The 2026-07-31 live pass **invalidated several resume steps below.** Corrections:

| §  | Prescribed step | Status after live probe |
|---|---|---|
| **3.1** | *"Cadastral-regime confirmation is the #1 blocker; query DGT/SNIC coverage"* | **ANSWERED.** Open INSPIRE WFS `snicws.dgterritorio.gov.pt/geoserver/inspire/ows` (`numberMatched=1789404`, no auth). **Measured: Porto 0 · Braga 0 · Lisboa 1,747 (0 in core)** vs Loulé 63,834 · Penafiel 23,906 · Tavira 11,015. The blocker is **resolved as a question and confirmed as a problem.** |
| **3.2** | *"probe `snit-mais.dgterritorio.gov.pt/geoserver/wfs`"* | **CANNOT SUCCEED.** That host returns **401** and is not a GeoServer. **The real vector route is CRUS**: `servicos.dgterritorio.pt/SDISNITWFSCRUS_<DICOFRE>_1/WFService.aspx` — VERIFIED for 1106 + 1312. Its 11 fields are **categorical only**; the question *"structured attribute or PDF link?"* is answered: **PDF.** Lisboa's schema even carries `ART_RPDM`, a pointer to an article. |
| — | TERRAIN treated as blocked | **REFUTED** — see `COUNTRY-RATE.md` §D. |

**Full evidence:** [`findings/PORTUGAL-DATA-RECON.md`](./findings/PORTUGAL-DATA-RECON.md).

## 0.1 — The next five steps, in priority order

1. **Email `snit.web@dgterritorio.pt`** for the `IDESTADO` / `VALIDADE` codelists and the
   `IDDEPOSITO` grammar. Cheapest high-value item in the whole PT file. **Do not hard-code
   `IDESTADO=2` = "in force" until it lands.**
2. **Sweep municipal portals for a vector PDM with NUMERIC attributes.** Porto's ArcGIS is open but
   categorical; if *any* município publishes numerics, it reorders every target. Do not assume none
   does — only 2 municipalities were checked in depth.
3. ~~**Retrieve the Lisboa RPDML regulamento**~~ **✅ CLOSED 2026-09-04 — see §0.0 item 3.** (was: extract it —
   text PDF, 319,459 chars). Lisboa's numeric tables are entirely UNKNOWN.
4. **Scope Loulé** (63,834 parcels — the best cadastre sampled): pull its PDM regulamento and CRUS.
5. **Write the C58 amendments** — `fabricDerivedHeight` (Porto's *moda da cércea*) and
   `transferableRights` (Lisboa's *créditos de construção*, with two alíneas suspended).

**Use long timeouts.** `servicos.dgterritorio.pt` took **148 s** for a GetCapabilities and returned a
**502** at 204 s. A 30 s timeout will report it dead when it is merely slow.

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
- **4.5 — ◐ DONE (as a WFS) 2026-07-31 — the parcel adapter exists.** The Cadastro Predial layer went
  live not as an OGC API but as the **SNIC INSPIRE WFS** (`inspire:cadastralparcel`). The
  `dgtParcelProvider` adapter is created (`packages/site-parcel-data/src/parcelProviders/dgtParcelProvider.ts`,
  `wired-pending-probe`). What still collapses the §34-equivalent gate is **per-município coverage
  confirmation** for the target-city cores (§3.1), not the endpoint — that is now live.
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
| **DGT OGC API** `ogcapi.dgterritorio.gov.pt` | CAOP `municipios`/`freguesias` (DICOFRE=`dtmnfr`), COS, 30 cm ortho; storageCrs EPSG:3763 | **`VERIFIED-LIVE` (2026-07-31)** | `/collections` enumerated live. **No parcel collection here** (parcels are on the SNIC WFS). |
| **Cadastro Predial WFS** `snicws.dgterritorio.gov.pt/geoserver/inspire/ows` | `inspire:cadastralparcel` — geometry + NIC + `areavalue` + `administrativeunit`; 1,789,404 features; CC BY 4.0 | **`VERIFIED-LIVE` (2026-07-31)** | DefaultCRS 3763; `srsName=EPSG:4326` returns real WGS84 GeoJSON. Wired as `dgtParcelProvider` (`wired-pending-probe`). Coverage mainland-only, cores unconfirmed. |

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

---

## 9 — GEOSPATIAL PROBE QUEUE (DGT OGC API platform — 2026-07-30 review)

> **Source.** Founder-supplied *Portugal Geospatial Infrastructure Review* (2026-07-30), folded into
> `../PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md` + `findings/PORTUGAL-GEOSPATIAL-INFRASTRUCTURE-REVIEW.md`.
> **Confidence: `CONVERGENT-SECONDARY`** (expert review, NOT live-probed). The review reports a
> coherent **DGT OGC API platform** (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`), CC BY 4.0
> platform-wide, plus a modern **LNEG OGC API** for geology and **Copernicus DEM** as a terrain
> fallback. It **upgrades many prior `VERIFIED-LEAD` entries to `CONVERGENT-SECONDARY`** but moves
> **no** rate cell — a corroborated source is not a wired/probed source (§CONTEXT-DATA-HONESTY).
> These probes are what would, once PROBED + WIRED, become Phase-3 PLAN items.

- **9.1 — ✅ DONE 2026-07-31 — DGT OGC API base URL.** `https://ogcapi.dgterritorio.gov.pt/` (OGC API
  Features); `/collections` lists CAOP/COS/ortho. Anchor confirmed.
- **9.2 — ✅ DONE 2026-07-31 — CAOP OGC API.** `municipios` + `freguesias` live; DICOFRE join attribute
  is **`dtmnfr`** (Trip-wire 4.2 satisfied). Reviewer's "easiest win" confirmed.
- **9.3 — Probe CRUS collection.** Confirm the CRUS collection exists, returns territorial-
  classification polygons, and record the classification attribute schema.
- **9.4 — Probe LNEG OGC API.** Confirm the LNEG (geology) OGC API endpoint is live and distinct from
  any LNEC (civil-eng) service; record base URL + one collection. Do NOT conflate the two labs.
- **9.5 — Confirm COS + 30 cm ortho as OGC API + CC BY 4.0.** Verify COS is served via OGC API (not
  only WMS/WFS) and that the DGT platform licence is genuinely CC BY 4.0 platform-wide (read the
  licence field, don't infer).
- **9.6 — ◐ PARTIAL 2026-07-31 — Cadastro Predial endpoint + coverage.** Endpoint DONE: it is a **WFS,
  NOT the OGC API** — `snicws.dgterritorio.gov.pt/geoserver/inspire/ows`, `inspire:cadastralparcel`,
  CC BY 4.0, geometry + NIC + área, WGS84 reprojection working; wired as `dgtParcelProvider`
  (`wired-pending-probe`). **STILL OPEN (the standing #1 blocker §3.1):** the CGPR/SiNErGIC per-município
  coverage for Lisboa (1106) / Porto (1315) / Braga (0303) — the WFS answers where covered but does not
  publish the coverage list.
- **9.7 — Confirm Copernicus DEM fallback boundary.** Record which NW-mainland municipalities fall in
  the ~10% DGT-LiDAR gap that Copernicus GLO-30 backfills (terrain only, NOT height).

**Honesty gate:** each item stays `CONVERGENT-SECONDARY` until live-probed; do NOT bump any
DATA-SOURCES / TERRAIN / LOD-RATE cell on these unprobed claims. Ship the probe before the fix.
