# Rate Implementation Plan — United Kingdom (`gb`) national · 4-jurisdiction federation

**Current national legislation/data-fill:** `NOT YET ASSESSED` (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) —
GB planning is **discretionary**, so the structured-fill ceiling is structurally low; the numbers are not
published as fields anywhere) · **Current bake-covered composite:** **51% `partial`** (Greater London,
DATA-SOURCES + TERRAIN + CONTEXT only — see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic ceiling (PROJECTED, post-OS-wiring, CONTINGENT on the Phase-A/B/C/D probes landing):**
~45–55% for a well-sourced **English** city (Greater London) · ~35–45% national (devolved fragmentation +
the discretionary-planning cap) · **Ceiling model — Denmark (~96%)** · **Last updated:** 2026-07-30 ·
**Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the national
> legislation number stays `NOT YET ASSESSED` and the Greater London composite stays **51%** until the probes
> below actually run and wire. Every OS / AddressBase / EA-DSM / INSPIRE / RoS / LPS / planning-OCR finding
> that raises the *projected* ceiling is **`CONVERGENT-SECONDARY`** (founder-supplied expert review L-516–519,
> 2026-07-30 — cited authorities, **NOT live-probed in PRYZM**). The **one** VERIFIED-LIVE anchor is the EA
> **LIDAR Composite DTM 1 m** terrain probe on the London bake (HTTP 200 keyless, 2026-07-25). A doc claiming a
> source is available is **not** a wired or probed source. The raised ceiling is a *projection contingent on
> Phase A/B/C/D landing*, not a measured gain. **Failure and empty are the same value — ship the probe before
> the fix.**

> **⚠ HMLR ≠ cadastre — the single most important discipline in the whole GB atlas.** HM Land Registry title
> polygons, INSPIRE Index Polygons, the Registers of Scotland Cadastral Map, and LPS property extents are all
> **OWNERSHIP recorded with GENERAL boundaries** (England/Wales: s.60 Land Registration Act 2002). They are
> **NOT a survey-grade / engineering cadastre** (unlike France PCI, Spain Catastro, Denmark Matriklen) and must
> **never** be described as survey-precise or a legal parcel edge. Consequence for this plan: **PARCEL
> confidence is capped MEDIUM** (Phase C), by construction, for every UK jurisdiction — permanently.

> **Why the ROI sequence (the reframe).** The UK is the **inverse** of the Portugal / Germany problem. Its
> topographic mapping — **Ordnance Survey** — is arguably the **best national mapping in the world** (buildings,
> roads, water, greenspace, all national + continuous), and it has a **world-class national address/property
> spine** (**AddressBase / UPRN**). Both are **just unwired in PRYZM** (the Phase-1 audit scored `gb` ≈ 51% on
> the three cheap axes alone). So the highest-leverage, cheapest wins are the **geospatial** phases (A + B),
> which fill DATA-SOURCES + CONTEXT + BUILDINGS + HEIGHTS + TERRAIN — **55% of the C63 weight** — largely from
> OGL-open sources that already exist. The *binding* cap is not fragmentation and not parcels; it is the
> **discretionary-planning** legal half (LEGISLATION 25 + ENVELOPE 20 = **45% of the weight**), which is
> **harder than any PDF-transcription jurisdiction** because the numbers **do not exist as data at all** (§1.4,
> §3). That is why Phase D is last and why the national ceiling stays modest even after A/B/C land. Full
> per-layer inventory: [`GEOSPATIAL-DATA-INVENTORY.md`](./GEOSPATIAL-DATA-INVENTORY.md); federation
> architecture: [`UNITED-KINGDOM.md`](./UNITED-KINGDOM.md).

---

## 1 — The ceiling: what "maximum" means here

The UK is **DISCRETIONARY-BOUND** for its planning envelope. There is **no codified numeric zoning envelope**
(no FAR table, no by-right height limit) equivalent to Spain's ordenanzas, Germany's BauNVO §17, or Denmark's
Plandata. Development is decided **case-by-case** by the Local Planning Authority against a Local Plan (policy
TEXT + a Policies Map), material considerations, and the constituent-country framework (England NPPF · Scotland
NPF4 · Wales PPW · NI SPPS). This places the UK **below** even the Scenario-B PDF jurisdictions: Portugal at
least has a *written numeric rule* locked in a PDF that OCR can transcribe; a UK discretionary determination has
**no numeric rule to transcribe**. The narrow as-of-right exception is **Permitted Development Rights** (GPDO).

**Ceiling model — Denmark (~96%):** Denmark's national Plandata delivers zone code, numeric density, and height
as machine-readable structured fields — proof that ~96% is reachable when a country fully digitises its planning
rules. The UK is **structurally further from this than any PDF jurisdiction** on the *legal* axis, because its
numbers are not published as fields anywhere — they are outcomes of discretion. The Denmark ceiling is **not
achievable** for the UK on LEGISLATION/ENVELOPE without a structural change to how the UK grants permission,
which is outside PRYZM's control.

**Pilot model — Barcelona (~48%) / Portugal (the mirrored plan shape):** Portugal's Phase-A/B/C climb (wire the
national geospatial platform first, OCR the PDF rules last) is the **shape** to mirror here. The UK differs in
two ways: (1) its geospatial platform (OS) is *stronger* than Portugal's DGT, so Phase A/B fill *more* of the
weight; (2) its legal half is *weaker* (discretionary, not PDF-numeric), so Phase D's ceiling is *lower*. Mirror
the **shape**, not the numbers.

**The UK's pre-wiring baseline (51%, the honest floor):** the current composite is bounded by three facts:
1. **OS + AddressBase not wired** — the world-class topographic + address layers exist but are absent from the
   PRYZM pipeline; only EA terrain + OSM context are baked. *(Relieved by Phase A — the cheapest, highest-leverage win.)*
2. **No national survey cadastre** — HMLR/INSPIRE/RoS/LPS are ownership, general boundaries;
   `parcelProviders/registry.ts` has no GB entry → footprint-fallback. *(Partially relieved by Phase C; PARCEL
   confidence stays capped MEDIUM — never survey-grade.)*
3. **Discretionary planning** — no national numeric envelope exists as data. *(The surviving cap — Phase D; §3.)*

### 1.4 — Wiring OS + AddressBase raises the geospatial ceiling (CONTINGENT)

Mapping the L-516–519 reviews onto the seven C63 axes and their **RATIFIED** weights (LEGISLATION 25 · ENVELOPE
20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 — C63 §4):

| C63 axis | Weight | Pre-wiring premise (today) | Post-wiring (once probed + wired) |
|---|---:|---|---|
| **DATA-SOURCES** | 15% | 50% — only EA terrain `live` + OSM context; no OS, no cadastre wired | **Jumps** — OS Open Buildings/Roads/Greenspace/Rivers + AddressBase/UPRN spine + EA DTM/DSM + INSPIRE routing: up to 4–5/5 slots `live`/`documented` |
| **PARCEL** | 15% | `—` not-assessed; footprint-fallback (no GB registry entry) | **Rises off the floor** where INSPIRE/RoS/LPS ownership polygons wire — but **capped MEDIUM** (ownership, general boundaries, NOT survey cadastre) |
| **CONTEXT** | 5% | 56% — OSM only (5/9 layers) | **Rises** — OS Open Greenspace (world-class) + OS Open Rivers + OS Highways + LA tree inventories add authoritative layers |
| **HEIGHTS/LOD** | 10% | `—`(der) — nDSM `documented`, unwired; `heightSources.mjs london → no-source` | **Rises** once EA DSM−DTM nDSM bakes onto OS/OSM footprints (P90 per footprint) |
| **TERRAIN** | 10% | 50% — EA DTM baked-but-**unverified** | **Rises to verified** on the `terrain.verify.mjs` round-trip (the DTM is the ONE verified-live keyless source) |
| **LEGISLATION** | 25% | `NOT YET ASSESSED` — discretionary, no numeric field | **Structurally capped** — the surviving cap (§1/§3); only PD rights + boundary overlays are by-right |
| **ENVELOPE** | 20% | `—` not-assessed — no rule pack; discretionary | **Structurally capped** — depends on LEGISLATION + the C58 solver; no as-of-right numeric envelope to solve |

The five geospatial axes (55% of the weight) move from *assumed-unwired* to *fillable-from-OGL-open-data*. A
back-of-envelope projection for a **well-sourced English city** (Greater London): DATA-SOURCES ~0.85, PARCEL
~0.5 (capped), CONTEXT ~0.9, HEIGHTS ~0.7, TERRAIN ~1.0, LEGISLATION ~0.15, ENVELOPE ~0.10 → **~47% weighted**.
So the *individual well-sourced English-city* ceiling rises to **~45–55%** and the *national* ceiling to
**~35–45%** — bounded now by the **discretionary-planning** LEGISLATION + ENVELOPE cost (45% of the weight) and
by the 4-jurisdiction devolved fragmentation, **not** by mapping or address data. **All of this is
`CONVERGENT-SECONDARY` and contingent on Phase A/B/C/D actually landing.** No RATE cell moves on it.

---

## 2 — Phase tracker (existing — retained)

The original Phase 0–4 tracker is retained. The ROI sequence below is folded in as the **Phase-3 roadmap
(§Phase-3)**, which expands and re-frames the old "Phase 1/2/3/4" into probed-and-wired phases **A/B/C/D**.
Cross-reference: Phase 0 established the honest baseline; Phases A/B are the geospatial-axis climb (the cheap,
high-leverage wins); Phase D is the discretionary-planning legal climb (the surviving cap).

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | AUDIT — scaffold `gb/` + Greater London dossier; cite the three cheap axes from `bake.mjs`/`terrain.mjs`/`heightSources.mjs` | the honest 51% baseline | — → 51% cited | done | SHIPPED | this pass |
| **1** | Verify + bake London terrain (`terrain.verify.mjs` round-trip) | TERRAIN 50→verified | — | low | NOT STARTED (folded into §Phase-B) | UNASSIGNED |
| **2** | Wire EA DSM−DTM nDSM stamp onto London footprints + re-bake | HEIGHTS not-assessed→measured | — | medium | NOT STARTED (folded into §Phase-B) | UNASSIGNED |
| **3** | Land the rail/trees/sea context re-bake + OS Greenspace/Rivers | CONTEXT 56→higher | — | low | NOT STARTED (folded into §Phase-A) | UNASSIGNED |
| **4** | Model Permitted Development Rights + per-LPA Local Plan OCR | small LEGISLATION/ENVELOPE | — | high | NOT STARTED (folded into §Phase-D) | UNASSIGNED |

---

## Phase-3 — ROI roadmap (NEW, 2026-07-30, 4-jurisdiction)

The UK climb decomposes into four ordered phases by **return on effort**. **A** is the geospatial-platform
wiring (highest-leverage, cheapest win — OS is world-class, just unwired); **B** derives heights + verifies
terrain from EA LiDAR (the DTM is the one verified-live anchor); **C** wires the ownership polygons (PARCEL,
capped MEDIUM — never survey cadastre); **D** is the per-LPA planning OCR that is the surviving cap on
LEGISLATION/ENVELOPE. **Sequence England (Greater London) first, then the devolved jurisdictions** — each of the
four constituent countries needs its own registry adapter (HMLR / RoS / LPS) and planning framework (NPPF / NPF4
/ PPW / SPPS); see §4. Each phase lists **goal · unlocks · axis · effort · dependency · blocker**. Every row is
`CONVERGENT-SECONDARY` until the named probe runs — the probe queue lives in [`NEXT.md`](./NEXT.md) and the
per-layer probe list in [`GEOSPATIAL-DATA-INVENTORY.md`](./GEOSPATIAL-DATA-INVENTORY.md).

### Phase A — Wire OS + AddressBase/UPRN → BUILDINGS + CONTEXT + DATA-SOURCES (England / Greater London first)

- **Goal.** Confirm the **OS Data Hub / OS NGD** API surface (OGC Features / Vector Tiles / Downloads), then
  probe and wire the **OPEN** OS products — **OS Open Buildings** (national footprints), **OS Open Roads**,
  **OS Open Greenspace** (world-class — parks/gardens/playing-fields/sports/cemeteries/allotments), **OS Open
  Rivers** — plus the **AddressBase / UPRN** property spine (the national join key, the UK analogue of Germany's
  AGS / France's INSEE / Portugal's DICOFRE). Read each licence field directly (don't infer): the **OS *Open*
  products are OGL**; **OS MasterMap is licensed** and is the redistribution **trap** — never the free path.
  Start with **Greater London** (`E12000007`, England).
- **Unlocks.** A **DATA-SOURCES + CONTEXT + BUILDINGS jump** — this is the phase that materially raises the UK's
  ceiling (§1.4). OS Open Buildings replaces the OSM footprint fallback with authoritative national polygons
  (and provides the footprints Phase B stamps heights onto); OS Open Greenspace/Rivers/Roads fill CONTEXT;
  UPRN wires the national property-routing spine for every UK city folder.
- **Axis.** DATA-SOURCES (Axis, 15%) · CONTEXT (Axis, 5%). (Buildings underpin the HEIGHTS footprints in Phase B.)
- **Effort.** **Low–Medium.** OS is world-class and the open products already exist — this is *wiring*, not
  sourcing. UPRN routing is a small win (~1–2 dev-days). OS Open Buildings/Roads/Greenspace/Rivers wiring:
  ~3–5 dev-days once the OS Data Hub base URL + collection schemas + OGL redistribution terms are confirmed.
- **Dependency.** Confirm the OS Data Hub / OS NGD API surface + product schemas + **OGL redistribution** first
  (it anchors every OS row). OS Open Buildings **before** Phase B (heights need footprints). For Northern
  Ireland substitute **OSNI** (a *separate* mapping agency — a common trap) and the Irish Grid (EPSG:29903/2157).
- **Blocker.** All claims are `CONVERGENT-SECONDARY` (OS not wired; audit `gb` ≈ 51%). **OS MasterMap +
  OS Building Heights are commercial** — deliberately skipped; use only the OPEN products. AddressBase licence
  **tier** (AddressBase / Plus / Premium) redistribution terms unconfirmed. OS is a *catalogue* discovery until
  the `/collections` landing, feature schemas, and OGL string are read live.

### Phase B — EA LiDAR nDSM heights (DTM verified-live; DSM to probe) + terrain verify → HEIGHTS + TERRAIN

- **Goal.** Live-probe the **EA LIDAR Composite DSM 1 m** GetCoverage (the DSM sibling of the **already
  VERIFIED-LIVE DTM**), feed **DSM − DTM** into the **shared nDSM building-height module** (per-footprint **90th
  percentile** — not max; keep max + point count + confidence), stamp it onto the London OS/OSM footprints, and
  re-bake. Separately, run the **`terrain.verify.mjs`** round-trip to move TERRAIN from *baked-but-unverified*
  (50%) to verified against the wired EA DTM.
- **Unlocks.** **HEIGHTS/LOD** (moves `london` from `no-source`/`—`(der) to measured heights once baked — the
  +10% weight enters the composite) and **TERRAIN** (50 → verified; the DTM is the ONE verified-live keyless
  source, so the verify is cheap).
- **Axis.** HEIGHTS/LOD (Axis, 10%) · TERRAIN (Axis, 10%).
- **Effort.** **Medium.** The nDSM module is **shared** — the SAME engine as Denmark (DHM), Spain (MDS), France,
  and Portugal (DGT LiDAR); the UK feeds EA inputs. **Do NOT one-off it per country.** The terrain verify is a
  round-trip; the height bake is a stamp + re-bake per city.
- **Dependency.** Phase A (footprints to stamp) + the shared DK/ES/FR/PT nDSM module. Terrain verify depends on
  the already-wired EA DTM (`terrain.mjs` `gb`, live-probed 2026-07-25).
- **Blocker.** The **EA DSM route is not live-probed** — it may 401 keyless, in which case heights stay the
  honest 9 m carpet (the smallest next step in `NEXT.md §8`). **RMSE-Z is unmeasured** — do NOT quote a height
  accuracy or assign a confidence tier until measured against surveyed buildings. LiDAR is **multi-agency /
  project-based** (EA + Historic England + LAs + National Parks) → varying resolution / year / density → every
  source carries acquisition metadata; do NOT assume ASPRS class codes. **EA LiDAR is ENGLAND-ONLY** — Scotland
  (Scottish Remote Sensing Portal), Wales (Natural Resources Wales), and NI (DAERA) are **separate portals**,
  each needing its own `terrain.mjs` row before a devolved city's cheap axes are computable.

### Phase C — PARCEL: HMLR / INSPIRE ownership polygons (confidence capped MEDIUM — never survey cadastre)

> **STATUS (2026-07-30) — England PARCEL axis: `wired-pending-probe`.** The England provider
> `packages/site-parcel-data/src/parcelProviders/gbOsInspireParcelProvider.ts` is BUILT — `isInEngland`
> + `ENGLAND_BBOX` routing predicate, `fetchParcelAtPoint(point, deps)` → HMLR INSPIRE Index Polygons via
> the same-origin proxy `/api/parcel/gb`, EPSG:27700→WGS84 with a `crs-unhandled` refusal (never
> fabricated lat/lon), typed refusal union, never-throws, OTel span, unit-tested (fixture parse + the
> honesty cap + CRS guard). **THE HONESTY INVARIANT IS ENCODED:** every resolved parcel carries
> `generalBoundary: true` + a cited caveat (`GB_GENERAL_BOUNDARY_CAVEAT`, s.60 LRA 2002), and confidence
> is **CAPPED MEDIUM by construction** — the `GbParcelMatchTier` union has NO `high` member, so England
> can never be scored survey-grade like ES/IT/CH. **This moves NO RATE % cell.** It stays
> `wired-pending-probe` until (1) the orchestrator registers `isInEngland→gb-os-inspire` in
> `parcelProviders/registry.ts` (the ready-to-paste row is in the provider header + the Phase-4 report),
> and (2) a LIVE probe of the INSPIRE download endpoint + OGL-v3 redistribution runs (both
> `CONVERGENT-SECONDARY` today — the per-LPA ATOM/GML endpoint and the proxy point-query aggregation are
> NOT yet live-probed). Scotland (RoS) / Wales (HMLR-Wales) / NI (LPS) are the same pattern, later.

- **Goal.** Probe + wire the **HM Land Registry INSPIRE Index Polygons** (OGL, freehold ownership **index**
  extents) as a parcel-routing / footprint-fallback-plus source for England, and add a GB entry to
  `parcelProviders/registry.ts`. For the devolved jurisdictions, wire the corresponding **ownership** registry:
  **Registers of Scotland** (RoS Cadastral Map — a registration *index*, not survey geometry), **HM Land
  Registry (Wales)**, and **Land & Property Services (LPS)** for Northern Ireland (property extents; the LPS
  property identifier is NI's principal join key).
- **Unlocks.** **PARCEL** (Axis, 15%) rises **off the footprint-fallback floor** where an ownership polygon
  wires — but **confidence is capped MEDIUM by construction**. **Honesty caveat (mandatory, every time):**
  HMLR / INSPIRE / RoS / LPS are **OWNERSHIP recorded with GENERAL boundaries** (England/Wales: s.60 LRA 2002),
  **NOT** survey-grade cadastre. They may **never** be described as survey-precise or a legal parcel edge, and
  PARCEL can **never** reach the FR (PCI) / ES (Catastro) / DK (Matriklen) tier.
- **Axis.** PARCEL (Axis, 15%).
- **Effort.** **Medium.** INSPIRE is OGL + downloadable per-LPA; wiring it as a routing / footprint-fallback
  source is engineering (not sourcing). But the **4-jurisdiction split means 4 registry adapters** (HMLR / RoS /
  LPS + HMLR-Wales), each a separate probe.
- **Dependency.** Phase A (the OS base map that ownership extents are drawn on). C57 §L-640 footprint-fallback
  rules; the PARCEL construction-cap for footprint-fallback jurisdictions.
- **Blocker.** The UK has **NO national survey cadastre** — the immutable honesty cap; this is not a data defect
  but the deliberate **general-boundaries rule** (policy). INSPIRE covers **freehold index** extents only (not
  the full register, not ownership *identity*). RoS *registered* land ≠ the whole landscape (Sasine-register
  legacy still migrating). Each of the four registries is a separate `CONVERGENT-SECONDARY` probe (endpoints /
  format / OGL redistribution / joinability to a click-point all unconfirmed).

### Phase D — Per-LPA planning OCR (NPPF / Local Plans PDF) + L-449 → LEGISLATION + ENVELOPE (the ~65%-effort shared OCR core)

- **Goal.** Build the **per-LPA planning OCR / rule-extraction pipeline** that reads the numeric envelope
  indicators (height limits, density, setbacks, PD-right thresholds) from **Local Plan PDFs + Policies Maps**,
  passes each extracted value through the **L-449 human-verification gate** before it serves at
  `confidence: structured`, and ingests the machine-readable **boundary** overlays already aggregating on
  **planning.data.gov.uk** (Conservation Areas, Article 4 Directions, Listed Buildings). Model **Permitted
  Development Rights (GPDO)** as the genuine **by-right slice**. Run the four devolved frameworks —
  **NPPF** (England) · **NPF4** (Scotland) · **PPW** (Wales) · **SPPS** (NI) — each over its own Local
  Development Plans. **Start with England (Greater London).**
- **Unlocks.** **LEGISLATION** (structured/by-right fill, hardened by L-449) and **ENVELOPE** (the C58 solver
  can only run on sourced numeric parameters). These two axes (45% of the weight) are the surviving cap after
  Phases A/B/C — OS/EA/INSPIRE wiring does **not** touch them.
- **Axis.** LEGISLATION (Axis, 25%) · ENVELOPE (Axis, 20%).
- **Effort.** **High — ~65% of the total effort.** This is the "whole cost": human-gated legal SOURCING across
  **~330 English LPAs** (plus the Scottish/Welsh/NI LDPs). It is a **shared ES / FR / PT / UK OCR investment** —
  all four jurisdictions are PDF-bound for their numeric planning values, so the pipeline must be built
  **generically** (per-LPA / per-framework configuration: policy-numbering patterns, glossary terms, category
  names), **never** as a London-specific or England-specific tool.
- **Dependency.** L-449 (human-verification gate) is mandatory before any OCR-extracted number serves at
  `confidence: structured`. ADR-0269 (curate-then-serve): no envelope value serves without a citable governing
  policy in `sources/SOURCES.md`. Phase C (an ownership parcel to attach an extracted rule to). C58 solver
  amendments as new GeometricRule / overlay kinds are needed for discretionary constructs.
- **Blocker.** **DISCRETIONARY PLANNING — the deepest cap of any jurisdiction in the atlas.** Unlike Portugal
  (which has a *written numeric rule* in a PDF that OCR can transcribe), the UK majority is **discretionary — the
  numeric envelope does not exist as data at all**; only Permitted Development Rights + boundary overlays are
  by-right. There is **no national numeric anchor** (unlike BauNVO §17) to sanity-check extraction. Per-LPA
  variation across ~330 English LPAs + **4 devolved frameworks**. `planning.data.gov.uk` coverage and a sample
  LPA Local Plan's machine-readability are unconfirmed.

---

## 3 — The gap to Denmark (~96%)

Three structural facts separate the UK from the 96% Denmark ceiling. **Phase A relieves (a); Phase C partly
relieves (b) but only to MEDIUM; (c) is the immutable surviving cap.**

**(a) OS + AddressBase are unwired — the cheapest, highest-leverage gap (RELIEVED by Phase A).** Denmark's
national datasets are wired and structured. The UK's world-class OS mapping + UPRN address spine are equally
national — they are simply **absent from the PRYZM pipeline** today. Phase A closes this with OGL-open OS
products; it is *wiring*, not sourcing, and is the reason the geospatial 55% of the weight can fill.

**(b) No national survey cadastre — PARTLY relieved by Phase C, capped MEDIUM.** France (PCI) and Denmark
(Matriklen) fuse a surveyed edge with ownership. The UK deliberately does not: HMLR/INSPIRE/RoS/LPS are
**ownership, general boundaries** (policy, not defect). Phase C wires these as routing/footprint-fallback
sources — which lifts PARCEL **off the floor** but **never** to the survey-grade tier. The gap here is
permanent, not a work item.

**(c) Planning is discretionary — the numbers do not exist as data (the immutable surviving cap, UNCHANGED).**
Denmark's Plandata delivers density and height as typed queryable fields. The UK grants permission by
**discretion**, case-by-case, so there is **no structured density/height field to ingest at any scale**. This is
a **harder** ceiling than any PDF-transcription jurisdiction (Portugal, France) because transcription
presupposes a written numeric rule, which a discretionary determination does not have. Until (and unless) the UK
codifies numeric envelopes, the **LEGISLATION + ENVELOPE** axes (45% of the weight) stay structurally capped
regardless of how well OS/EA/INSPIRE are wired. **This is the binding cap on the UK's ceiling.**

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**The 4-jurisdiction federation (the UK-specific structure).** A GB implementation builds **one** OS /
AddressBase / EA pipeline (national plumbing) and **four** planning/registry adapters (devolved rules + ownership
edge). Sequence **England (Greater London) first**, then the devolved jurisdictions:

| Jurisdiction | Registry (ownership, general bdy) | Planning framework | LiDAR programme | Mapping | Sequence |
|---|---|---|---|---|---|
| **England** | HM Land Registry (+ INSPIRE) | **NPPF** + per-LPA Local Plans | Environment Agency (verified-live DTM) | OS (GB) | **1st (Greater London)** |
| **Scotland** | **Registers of Scotland** | **NPF4** + LDPs | Scottish Remote Sensing Portal | OS (GB) | 2nd |
| **Wales** | HM Land Registry (Wales) | **PPW** + LDPs | **Natural Resources Wales** | OS (GB) | 3rd |
| **Northern Ireland** | **Land & Property Services (LPS)** | **SPPS** + LDPs | **DAERA** | **OSNI** (separate agency; Irish Grid) | 4th |

**Hard dependencies (must resolve in order):**
- **OS Data Hub / OS NGD API confirmation (Phase A)** anchors every OS row (Buildings, Roads, Greenspace,
  Rivers). Confirm the `/collections` landing + OGL redistribution before designing any ingestion.
- OS Open Buildings (Phase A) gates the HEIGHTS stamp (Phase B) — heights need footprints.
- The **EA DSM GetCoverage live-probe (Phase B)** gates the nDSM height derive; if it 401s keyless, HEIGHTS stays
  the 9 m carpet. The DTM is verified-live; the DSM sibling is the single highest-leverage probe (`NEXT.md §8`).
- L-449 (human-verification gate) is mandatory for any value extracted via the OCR pipeline (Phase D) before it
  serves at `confidence: structured`. No OCR-extracted number may bypass this gate.
- ADR-0269 (curate-then-serve): do not serve any envelope value without a citable governing policy in
  `sources/SOURCES.md`.

**Current blockers:**
- **OS + AddressBase + INSPIRE are all `CONVERGENT-SECONDARY`** — endpoints, schemas, and the OGL redistribution
  strings are reported, not live-probed. None may raise a RATE cell until probed.
- **EA DSM route not live-probed; RMSE-Z unmeasured** — cannot assign a height confidence tier until measured
  vs surveyed buildings; do NOT assume LiDAR class codes.
- **EA LiDAR is England-only** — a Scottish/Welsh/NI city needs its own terrain row (SRSP / NRW / DAERA) before
  its cheap axes are computable (`NEXT.md` trip-wire 4.1).
- **No national survey cadastre** — PARCEL confidence permanently capped MEDIUM (HMLR/RoS/LPS = ownership,
  general boundaries).
- **Discretionary planning** — no national numeric envelope exists as data; `planning.data.gov.uk` coverage +
  sample LPA machine-readability unconfirmed.

**Cross-jurisdiction reuse (never fork):**
- The **planning OCR / rule-extraction pipeline (Phase D)** is a **shared ES / FR / PT / UK investment** — all
  four are PDF-bound for their numeric planning values. Build it generically (per-LPA / per-framework config:
  policy-numbering patterns, glossary, category names), portable across all ~330 English LPAs, the devolved
  LDPs, and the other three jurisdictions. Do NOT build it London-specific.
- The **nDSM height module (Phase B)** — DSM−DTM, 90th-percentile per footprint — is the SAME shared module as
  Denmark (DHM), Spain (MDS/L-511c), France (L-512b), and Portugal (DGT LiDAR). The UK feeds EA inputs. Do NOT
  one-off it per country.
- The **CHM tree module**, the **buffered-road + terrain-drape module**, and the **ortho-sidewalk module** are
  likewise shared across ES/FR/PT/UK — reuse, never fork per jurisdiction.
- **UPRN / AddressBase routing** is the UK analogue of Germany's AGS, France's INSEE, and Portugal's CAOP
  DICOFRE — one national property-spine reader keyed on UPRN for all UK city folders.
- The registry adapters (HMLR / RoS / LPS) share **one** honesty invariant — **ownership, general boundaries,
  NEVER survey-grade cadastre** — build one ownership-polygon reader interface, four data-source implementations.
- Historic England / HES / Cadw / HED heritage overlays and the EA/SEPA/NRW/DAERA flood overlays are
  per-jurisdiction refusal layers — build one overlay reader interface, four sources.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%, structured data) · **Portugal** `../pt/` (the mirrored
Phase-A/B/C plan shape + the shared PDF-OCR core) · **Barcelona** `../es/es-ct/08019-barcelona/` (pilot climb).
Governing: **C58** (fidelity/provenance), **ADR-0269** (curate-then-serve), **L-449** (human-verification gate),
**C63 §3/§4** (the seven axes + ratified weighting). Data layer:
[`GEOSPATIAL-DATA-INVENTORY.md`](./GEOSPATIAL-DATA-INVENTORY.md) (per-layer inventory, all
`CONVERGENT-SECONDARY`) · [`UNITED-KINGDOM.md`](./UNITED-KINGDOM.md) (federation architecture) ·
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city composite) · [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)
(national structured-fill — NOT YET ASSESSED) · [`NEXT.md`](./NEXT.md) (probe queue). The ONE verified-live
anchor is the EA LIDAR Composite DTM 1 m terrain probe (2026-07-25); everything else is `CONVERGENT-SECONDARY`
until live-probed — ship the probe before the fix.*
