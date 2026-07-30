# Rate Implementation Plan — USA (`us`) national

**Current national legislation/data-fill:** `~12 % (free sources)` / `~55 % (with commercial APIs)`
(see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) — the structured-fill metric, renamed from `RATE.md`
per the L-649 migration) ·
**Current bake-covered composite:** ~53 % `partial` (New York City + San Francisco, DATA-SOURCES +
TERRAIN + CONTEXT only — see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic ceiling (PROJECTED, per well-sourced city, CONTINGENT on the Phase-A/B/C probes
landing):** ~55–60 % for NYC (MapPLUTO populated) · ~50–55 % for San Francisco (height-and-bulk
wired) · **there is NO single national ceiling** — the US aggregate grows city-by-city (§1) ·
**Ceiling model — Denmark (~96 %)** · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the
> national legislation number stays `~12 % free / ~55 % commercial` and the NYC/SF composite stays
> ~53 % until the probes below actually run and wire. Every source claim that raises the *projected*
> per-city ceiling is **`CONVERGENT-SECONDARY`** (founder-supplied US geospatial review, 2026-07-30
> — cited authorities, **NOT live-probed**; the 2026-07-24 probe pass confirmed routing + MapPLUTO
> fill but did **not** wire a provider). A doc claiming a source is available is **not** a wired or
> probed source. **Failure and empty are the same value** — a city marked "unprobed" is not "has no
> data." **Ship the probe before the fix.**

> **Why the framing is city-by-city (2026-07-30): the US is the INVERSE of Germany.** In Germany the
> **Land** owns the technical geodata (ALKIS, one schema per Land) and the municipality owns planning;
> PRYZM onboards per-Land. In the US the **county/city owns parcel + zoning DIRECTLY** and there is
> **no national cadastre** (no ALKIS/Catastro equivalent) and **no national zone taxonomy** (~33,000
> authorities each invent their own codes). See [`USA.md`](./USA.md) §1. The consequence for this plan:
> **there is no `USParcelProvider` to wire and no single national ceiling to climb.** PRYZM documents
> and wires the US **city by city** as `CityParcelProvider` / `CityZoningProvider` / `CityEnvelopeProvider`
> (`NYCParcelProvider`, `SFParcelProvider`, …), and the "national rate" is a weighted average over the
> cities actually tackled. The national datasets in [`DATASETS/`](./DATASETS/) (TIGER, USGS 3DEP, NHD,
> FEMA) are **fallbacks / context only** — they never carry the parcel + zoning + envelope payload.
> That payload is per-city and is the whole cost.

---

## 1 — The ceiling: what "maximum" means here

The US has **no national numeric zoning API** and **no national cadastre**, and none is expected from
government sources (no federal digitisation mandate). This is the mirror image of the Portugal
Scenario-B position: Portugal is *nationally uniform but PDF-bound*; the US is *machine-readable in the
best cities but structurally fragmented across ~33,000 jurisdictions*. The binding cap on the US is
therefore **not** a single national number — it is the **per-city onboarding cost times the number of
cities served**. The national aggregate rises roughly linearly as Tier-1 cities are wired; it does not
converge on a Denmark-style national ceiling because no national layer exists to converge on.

**Ceiling model — Denmark (~96 %):** Denmark's national Plandata delivers zone code, numeric density,
and height as machine-readable structured fields for every municipality. That is the proof that ~96 %
is reachable when a country fully digitises its planning rules. **The US cannot reach this nationally
without either a federal digitisation mandate (does not exist) or a reliable automated ordinance-reading
pipeline across ~33,000 jurisdictions (not yet reliable).** The Denmark ceiling is not a US national
target; it is the yardstick for what a *single fully-wired US city* can approach.

**Pilot models — Berlin (NYC) + Barcelona (San Francisco):** NYC is the Berlin analogue — richest data,
highest complexity; **MapPLUTO is the closest thing in the US to a complete PRYZM dataset in one layer**
(tax-lot polygon + zoning district + building footprint + FAR + land-use + lot area, keyed by BBL). San
Francisco is the Barcelona analogue — accurate assessor parcels (APN) + explicit zoning + a **distinct
height-and-bulk district** (numeric height stated, not derived from FAR) over steep LiDAR terrain. Mirror
the phase **shape** of Barcelona's climb (registry → per-district packs → block-derived envelopes →
refusal vocabulary), not its numbers.

**What raises a US city's ceiling** is the rare cases where *physical and legal come together in one
open dataset*. NYC MapPLUTO is exactly that — parcels **and** zoning **and** FAR **and** footprints in a
single BBL-keyed layer, which is why it anchors Wave 1 and why Phase A wires it first. Most other US
cities require **joining** parcel-GIS + assessor + zoning-GIS + zoning-text + footprints + LiDAR per
city — more integration work than NYC's single MapPLUTO (see [`CITIES/README.md`](./CITIES/README.md)
engineering note). A high 9.0–9.5 readiness score reflects *data availability*, not *integration ease*.

### 1.4 — Mapping the city-federation onto the seven C63 axes (per well-sourced city, CONTINGENT)

Mapping the US review onto the seven C63 axes and their **ratified weights** (LEGISLATION 25 · ENVELOPE
20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 — C63 §4). The column is a
back-of-envelope projection **for a well-sourced Tier-1 city (NYC)**, not a national number:

| C63 axis | Weight | Current (NYC/SF, assessed) | Post Phase-A/B/C (once probed + wired, per city) |
|---|---:|---|---|
| **DATA-SOURCES** | 15 % | **50 %** — no keyless national cadastre wired; only terrain + context `live`, heights `documented` | **Jumps** — NYC MapPLUTO wires cadastre-parcel **and** zone-GIS slots at once; SF DataSF wires assessor + zoning + height-and-bulk. Up to 4–5/5 slots `live`/`documented` |
| **PARCEL** | 15 % | `—` (footprint-fallback; `registry.ts` has no US entry) | **Rises where a `City*Provider` is wired** — NYC BBL / SF APN reverse lookup. Strictly per-city; there is no national parcel fabric |
| **CONTEXT** | 5 % | **67 %** (6/9; coastal → sea present) | **Rises** as rail/trees/pedestrian bakes land (L-642); OSM extract already baked |
| **HEIGHTS/LOD** | 10 % | `—`(cap) — Overture height + USGS 3DEP nDSM `documented`, unbaked | **Rises** — NYC 3D Building Model carries a real height field (rare for US); 3DEP nDSM = DSM−DTM backfills. Bakes via the shared ES/FR nDSM module |
| **TERRAIN** | 10 % | **50 %** — USGS 3DEP 1 m DEM baked, unverified | **Rises to 100** once `terrain.verify.mjs` round-trips the baked tileset |
| **LEGISLATION** | 25 % | `—` (`pending-implementation`) | **Partial free head-start (NYC-unique)** — MapPLUTO `MaxAllwFAR`/`ResidFAR`/`CommFAR` give a cited FAR floor; but SPD (80+), TDR/air-rights, and zoning-text OCR are the **surviving cap** (§3a). SF gets a MODERATE start from published zoning + height-and-bulk |
| **ENVELOPE** | 20 % | `—` (`pending-implementation`) | **Partial** — FAR-extrusion (NYC) / height-and-bulk extrusion (SF) is automatable; Sky-Exposure-Plane, special/area plans, and Discretionary Review gate the rest. Depends on LEGISLATION + C58 solver |

A back-of-envelope projection for **NYC** (MapPLUTO populated): DATA-SOURCES ~0.8, PARCEL ~0.8, CONTEXT
~0.7, HEIGHTS ~0.6, TERRAIN ~0.7, LEGISLATION ~0.35, ENVELOPE ~0.3 → **~55 % weighted** — matching the
NYC dossier's independent "~55–60 % free, MapPLUTO populated" estimate. SF (no citywide FAR; explicit
height-and-bulk) lands a little lower on LEGISLATION but comparable overall (~50–55 %). **All of this is
`CONVERGENT-SECONDARY` and contingent on Phase A/B/C actually landing. No RATE cell moves on it.**

---

## 2 — Phase tracker (existing — retained)

The original national Phase 0–6 tracker (the dataset-aggregation + commercial-triad + institution-
compilation path) is retained unchanged below as the **commercial/aggregation climb**. The city-
federation ROI sequence is folded in as the **Phase-3 roadmap (§Phase-3)** that follows, which re-frames
the fastest, highest-fidelity wins as probed-and-wired phases A/B/C keyed on the flagship cities.
Cross-reference the two: Phases 0–6 are the *national free/commercial coverage* climb; Phases A/B/C are
the *per-city C63-axis* climb the founder's US review prioritises. **Neither changes a RATE cell.**

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — probe Chicago zoning portal + Overture height + NRHP + Census TIGER routing; write RATE.md | Honest free-source baseline; routing confirmed free | — → `~12%` | 1–2 dev-days | VERIFIED (research + 2026-07-24 probes) | UNASSIGNED |
| **1a** | Ingest Microsoft Building Footprints for pilot cities + join Overture/USGS heights | Building context LOD1 with height | `~12%` → `~20%` | 2–3 dev-days | NOT STARTED | UNASSIGNED |
| **1b** | Harvest city open-data zoning layers (Chicago, LA, NYC) — zone codes + free numeric attrs | Free zoning coverage for pilot cities | `~20%` → `~22%` | 2–3 dev-days | NOT STARTED | UNASSIGNED |
| **1c** | Ingest NRHP ArcGIS feature service + NRIS join | Heritage overlay for all US parcels | `~22%` → `~25%` | 1–2 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Contract + integrate Zoneomics for Chicago/LA/NYC (then expand) | Numeric FAR + height + use code, covered cities | `~25%` → `~55%` | 3–5 dev-days; cost TBD | NOT STARTED | UNASSIGNED |
| **3** | Contract + integrate Regrid parcel API — jurisdiction routing + parcel context | Parcel routing for all US queries | `~55%` → `~65%` | 3–4 dev-days; cost TBD | NOT STARTED | UNASSIGNED |
| **4** | 3DEP nDSM pipeline — derive heights from USGS LiDAR where Overture lacks | Height coverage climbs 15% → toward 50% | `~65%` → `~70%` | 5–7 dev-days | NOT STARTED | UNASSIGNED |
| **5** | Expand Zoneomics + Regrid to national coverage | Raises coverage toward commercial ceiling | `~70%` → `~75%` (commercial ceiling) | Ongoing | NOT STARTED | UNASSIGNED |
| **6a–6f** | Institution compilation — crawl/normalise ~5,000–8,000 municipal ArcGIS zoning endpoints + federal overlay graph | Durable free institutional graph (alternative to §2–5) | `~12%` → `~62–65%` (free) | High | NOT STARTED | UNASSIGNED |

> Full Phase-6 institution-compilation detail (architecture, falsification probes, Planning IR) is
> retained in the prior revision and in `findings/USA-VISION-SHIFT-2026-07-24.md` +
> `findings/USA-INSTITUTIONAL-GRAPH-ANALYSIS.md`. Phase-6 is an **alternative free path**, not a
> replacement for the per-city climb below.

---

## Phase-3 — City-federation ROI roadmap (NEW, 2026-07-30)

The founder's US review decomposes the highest-ROI climb into three ordered phases keyed on the
flagship cities. **A** wires the flagship parcel providers (the highest-leverage, cheapest win — and
uniquely, NYC's MapPLUTO carries the *legal* payload alongside the physical one); **B** derives heights
+ verifies terrain from city LiDAR / USGS 3DEP; **C** is the per-city zoning ordinance packs that are
the surviving cap on the LEGISLATION/ENVELOPE axes, then scales to the remaining Tier-1 cities. Each
phase lists **goal · unlocks · axis · effort · dependency · blocker**. Every row is `CONVERGENT-SECONDARY`
until the named probe runs — the probe queue lives in the per-city dossiers' `NEXT.md` and each
[`CITIES/`](./CITIES/) doc's pending-probe checklist. **This is a city-by-city model — there is no
national scale to "finish."**

### Phase A — Wire the flagship city parcel providers (`NYCParcelProvider` + `SFParcelProvider`)

> **STATUS (2026-07-30, L-650 Phase-4): NYC PARCEL + LEGISLATION → `wired-pending-probe`.** The
> `NycPlutoParcelProvider` is now BUILT and merged — `packages/site-parcel-data/src/parcelProviders/nycPlutoParcelProvider.ts`:
> `isInNYC` 5-borough bbox predicate + `fetchParcelAtPoint` (injected-fetch, never throws, OTel span)
> parsing a MapPLUTO lot feature (ArcGIS Esri-JSON **or** Socrata `64uk-42ks`) → **BBL + borough +
> LotArea + ZoneDist1..4/overlays/SPDist + ResidFAR/CommFAR/FacilFAR/MaxAllwFAR/BuiltFAR**, with a
> derived `farRatio` = the governing as-of-right FAR (max of resid/comm/facil), cited to the NYC
> Zoning Resolution as PLUTO's *allowable-FAR attribute per DCP* — **not** a re-derivation. `MaxAllwFAR`
> is carried raw but deliberately NOT folded into `farRatio` (its bonus-vs-base semantics stay the #1
> unprobed trap). CRS guard refuses a State-Plane ring rather than mis-plot; confidence HIGH on
> BBL + point-in-lot. Verified: `@pryzm/site-parcel-data` typecheck clean · 30 new unit tests green
> (1028/1028 package suite) · `check:isolation` intact. **Still pending:** (1) the orchestrator
> registers `isInNYC→nyc-pluto` in `parcelProviders/registry.ts` (a `// TODO(orchestrator)` note is
> left in-file; this provider does not edit the registry); (2) a live probe of the MapPLUTO ArcGIS
> FeatureServer path + `MaxAllwFAR` semantics (the Socrata FAR fill was probed 2026-07-24; the
> FeatureServer path carries a `// PROBE:` marker). **This moves NO RATE % cell** — `wired-pending-probe`
> is not `baked`; the number stays put until the endpoint is live-probed and the registry is wired.

- **Goal.** Probe live and wire the two flagship datasets as `City*Provider`s in
  `parcelProviders/registry.ts` (today: **no US entry → footprint-fallback**):
  **(1) `NYCParcelProvider` (MapPLUTO, BBL)** — tax-lot polygons + zoning district + building footprint +
  FAR + land-use + lot area in **one BBL-keyed layer** (NYC Dept. of Finance + City Planning, ArcGIS REST
  + Socrata + bulk), with coord→BBL reverse lookup; and **(2) `SFParcelProvider` (APN)** — DataSF assessor
  block-lot parcels + area (Socrata + ArcGIS REST), with coord→APN reverse lookup. **Probe MapPLUTO
  `MaxAllwFAR` semantics + SPD fraction before trusting the FAR** (the single most important US probe —
  NYC dossier Phase 0). Read the licence/field schema directly; do not infer.
- **Unlocks.** A **PARCEL + DATA-SOURCES jump for NYC/SF at once**, and — uniquely for NYC — a **partial
  LEGISLATION + ENVELOPE head-start in the same wiring**, because MapPLUTO carries FAR + zoning district
  alongside the parcel geometry. **NYC is a rare city where the physical and legal payloads come together
  in one open layer** — most US cities need 4–6 datasets joined. This is the phase that materially raises
  the flagship-city ceiling (§1.4).
- **Axis.** PARCEL (Axis 1) · DATA-SOURCES (Axis 3) · partial LEGISLATION (Axis 2) + ENVELOPE (Axis 4) for NYC.
- **Effort.** Low–Medium. `NYCParcelProvider` + `SFParcelProvider` registry wiring + reverse lookup:
  ~2–4 dev-days each once the REST endpoint + field names + `MaxAllwFAR` semantics are confirmed live.
- **Dependency.** Confirm each city's ArcGIS REST / Socrata endpoint + routing-key semantics first
  (BBL for NYC, APN for SF) — these anchor every downstream row. Census TIGER geocoder already answers
  coord→place routing free (2026-07-24 probe), so no commercial router (Regrid) is a prerequisite.
- **Blocker.** All source claims are `CONVERGENT-SECONDARY` (unprobed as *wired providers*; the
  2026-07-24 pass confirmed MapPLUTO fill + routing but wired nothing). **`MaxAllwFAR` may fold in bonus
  potential or only base FAR** — the ~30 pt NYC ceiling swing turns on it. **SPD coverage fraction**
  (80+ Special Purpose Districts, heavy in Manhattan) makes the base-zone answer wrong for SPD lots.
  There is **no national cadastre** to fall back on — each city must be wired individually.

### Phase B — Derive heights (city LiDAR / USGS 3DEP nDSM) + verify terrain

- **Goal.** Feed **city LiDAR → USGS 3DEP** (national 1 m LAZ/GeoTIFF fallback) into the **shared
  nDSM = DSM − DTM building-height module**, stamping `tagged` measured heights on the baked context
  buildings; for NYC prefer the **NYC 3D Building Model / Building Footprints height field** (a real
  measured height, which few US cities carry). Separately, **run `terrain.verify.mjs`** on the already-
  baked USGS 3DEP 1 m terrain tilesets for NYC + SF to move TERRAIN from the `50` rung (baked/unverified)
  to `100` (independent-decoder round-trip pass).
- **Unlocks.** **HEIGHTS/LOD** (moves NYC/SF from `documented`/unbaked `(cap)` to measured `tagged`
  once baked) and **TERRAIN** (50 → 100 on verify — both cities are already baked at 50).
- **Axis.** HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5).
- **Effort.** Medium. The nDSM module is **shared** — it is the SAME module as Spain (L-511c) and France
  (L-512b); the US feeds different inputs (3DEP LAZ / city LiDAR / NYC 3D model). **Do NOT one-off it per
  city.** Terrain verify is one `terrain.verify.mjs` run per already-baked city.
- **Dependency.** Phase A (provider wired for the bbox) and the shared ES/FR nDSM module. Terrain verify
  depends only on the existing baked 3DEP tilesets (present for `newyork` + `sanfrancisco` REGIONS).
- **Blocker.** USGS 3DEP tile availability/quality varies by region (probe TNM for the boroughs / SF
  blocks). No national floor-count attribute exists for the nDSM to sanity-check against. NYC 3D model
  currency + licence unconfirmed as wired. All `CONVERGENT-SECONDARY` until the height stamp + verify run.

### Phase C — Per-city zoning ordinance packs (NYC ZR, SF Planning Code) — the surviving cap

- **Goal.** Build the **per-city zoning rule packs** that lift LEGISLATION + ENVELOPE beyond the
  MapPLUTO FAR head-start: **NYC Zoning Resolution** (base FAR + Sky-Exposure-Plane + height-factor/
  contextual districts + the 80+ Special Purpose Districts, with cited **refusals** for TDR/air-rights
  and SPD overrides) and the **SF Planning Code** (zoning district + **height-and-bulk district** →
  height-capped extrusion + rear-yard, with refusals for Discretionary Review + area/specific plans).
  Each extracted numeric value passes the **L-449 human-verification gate** before it serves at
  `confidence: structured` (ADR-0269 curate-then-serve). **Then scale the same shape to the remaining
  Tier-1 cities:** Seattle · Denver · Washington DC · Portland (9.5) then Boston · Austin · Chicago ·
  Philadelphia (9.0) — most requiring a per-city **JOIN** of parcel-GIS + assessor + zoning-GIS +
  zoning-text + footprints + LiDAR (more integration than NYC's single MapPLUTO).
- **Unlocks.** **LEGISLATION** (structured, cited, L-449-hardened fill beyond the FAR floor) and
  **ENVELOPE** (the C58 solver runs on sourced parameters). These two axes (45 % of the C63 weight) are
  the surviving cap after Phases A/B — the parcel/height/terrain wiring does **not** touch them.
- **Axis.** LEGISLATION (Axis 2) · ENVELOPE (Axis 4).
- **Effort.** High — the "whole cost" (human-gated legal SOURCING, PRYZM's differentiator). But build the
  ordinance-reading pipeline **generically** (per-city configuration: zone-code vocabulary, article
  patterns, overlay handling), reusable across the ~33,000-jurisdiction long tail and portable to the
  ES/FR/PT/UK PDF-bound jurisdictions — **never** NYC-specific or SF-specific. NYC pack is the deepest
  (SPD + TDR complexity); SF is cleaner (one consolidated city-county code + explicit height-and-bulk).
- **Dependency.** L-449 (human-verification gate) is mandatory before any extracted number serves at
  `confidence: structured`. ADR-0269 (curate-then-serve): no value serves without a citable governing
  article in the city `sources/SOURCES.md`. Phase A (parcel wired) gates attaching any rule to a lot.
  C58 §2.2 rule KINDs: NYC = FAR + Sky-Exposure-Plane; SF = **tiered-occupation + explicit height**
  (ADR-0270 — **do NOT force a FAR KIND onto SF**).
- **Blocker.** **Per-jurisdiction taxonomy variation** — no national zone taxonomy, so the pipeline must
  handle code-vocabulary variation, not just value variation, and there is **no national numeric
  sanity-check** (unlike Germany's BauNVO §17) to catch extraction errors — which makes the L-449 gate
  even more critical here. **NYC:** SPD/TDR/air-rights are not deterministic from the zone code alone
  (a lot that bought air-rights has more FAR than MapPLUTO shows). **SF:** Discretionary Review + area
  plans (Eastern Neighborhoods, Central SoMa) overlay the base district. All `CONVERGENT-SECONDARY`.

---

## 3 — The gap to Denmark (~96 %)

Three structural facts separate the US from the 96 % Denmark ceiling — and unlike Portugal, the binding
one is *fragmentation*, not PDF-encoding. **Phase A relieves (b) for wired cities; (a) and (c) are the
surviving cap.**

**(a) No national zoning digitisation mandate — the primary structural gap (UNCHANGED).** Denmark's
Plandata delivers zone + numeric density + height as typed national fields for every municipality. The
US has no equivalent and no federal legislation to create one. ~33,000 jurisdictions, each with its own
ordinance and its own invented zone codes, mean a Plandata-equivalent would require ~33,000 separate
ingestions or one commercial aggregator (Zoneomics) that still covers only a fraction. Closing this
requires the **Phase C** per-city ordinance packs + the L-449 gate, done city by city. **This is the
binding cap on the US aggregate.**

**(b) No national cadastre / parcel fabric — RELIEVED per-city by flagship open data.** France and
Germany have complete national parcel geometry (PCI-Express, ALKIS). The US has none — county/city owns
it directly. The pre-city-federation plan treated this as a hard national cap. Phase A shows it is
instead a **per-city coverage question**: NYC MapPLUTO (BBL) and SF DataSF (APN) are complete, open,
reverse-lookup-able parcel fabrics **for those cities**. It is **not** closed nationally — every city's
parcel layer must be wired individually, and the long-tail counties need per-city ArcGIS Hub crawls
(Phase 6d / Regrid). Wiring a flagship provider (Phase A) is the single highest-leverage move.

**(c) ~33,000 fragmented jurisdictions + non-conforming uses — no national numeric sanity-check
(UNCHANGED).** Germany's BauNVO §17 provides national ceiling GRZ/GFZ values a municipality cannot
exceed — a backstop for cross-jurisdiction sanity-checking. The US has no such anchor; each city's zone
code, FAR definition, and overlay machinery is its own. NYC's SPD/TDR system and unzoned/non-conforming
lots have no deterministic numeric answer at all — the equivalent of Germany's §34 floor: a structured
**refusal**, not a data gap. OCR extraction (Phase C) must handle taxonomy variation, and the L-449 gate
becomes even more critical than in jurisdictions with a national numeric anchor.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **Flagship endpoint + routing-key confirmation (Phase A)** anchors every downstream city row. Confirm
  the MapPLUTO ArcGIS REST endpoint + `MaxAllwFAR` semantics (NYC) and the DataSF assessor + zoning +
  height-and-bulk layers (SF) before designing any ingestion. Do not wire a provider off documentation.
- **Per-city provider wiring gates ALL parcel-level pipeline work** — there is no national cadastre to
  fall back on. `registry.ts` has no US entry today (footprint-fallback); each `City*Provider` is added
  individually. Do not design a national `USParcelProvider` (the anti-pattern in `USA.md` §2).
- L-449 (human-verification gate) is mandatory for any value extracted via the Phase-C ordinance pipeline
  before it can serve at `confidence: structured`. No extracted number may bypass this gate.
- ADR-0269 (curate-then-serve): do not serve any zoning value not verified against a citable governing
  article in the city's `sources/SOURCES.md`.
- C58 §2.2 rule KINDs must match the city: NYC = FAR + Sky-Exposure-Plane; **SF = tiered-occupation +
  explicit height-and-bulk (ADR-0270), never a citywide FAR.**

**Current blockers:**
- **All flagship source claims are `CONVERGENT-SECONDARY`** — MapPLUTO/APN endpoints, `MaxAllwFAR`
  semantics, and the height-and-bulk schema are reported (and MapPLUTO fill was probed 2026-07-24) but
  **no provider is wired**. None may raise a RATE cell until wired + baked.
- **NYC `MaxAllwFAR` swing** — populated → NYC free ceiling ~55–60 %; null/unreliable → ~28 %. The
  0.5-dev-day probe resolves the ~30 pt range and is the prerequisite for the NYC climb.
- **SPD/TDR/air-rights (NYC)** and **Discretionary Review / area plans (SF)** are not derivable from the
  base zone code — Phase C must emit cited refusals, not fabricated numbers.
- USGS 3DEP tile quality varies by region; NYC 3D Building Model currency + licence unconfirmed as wired.
- **No national numeric zoning anchor** (no BauNVO §17 equivalent) — extraction errors have no national
  sanity-check; L-449 is the only backstop.

**Cross-jurisdiction reuse:**
- The **nDSM height module (Phase B)** — DSM−DTM, 90th-percentile per footprint — is the SAME shared
  module as Spain (L-511c) and France (L-512b). The US feeds different inputs (USGS 3DEP LAZ / city LiDAR /
  NYC 3D model). **Do NOT one-off it per city.** France's LiDAR HD / Denmark's DHM pipeline are
  structurally identical — reuse the adapter, swap the tile source.
- The **per-city zoning ordinance pipeline (Phase C)** is a **shared US / ES / FR / PT / UK investment** —
  all are text/PDF-bound for their numeric planning values below the best-digitised layer. Build it
  generically (per-city/per-jurisdiction configuration: zone-code vocabulary, article patterns, overlay
  handling), portable across the US long tail and the other jurisdictions. **Do NOT build it NYC-specific.**
- **Census TIGER geocoder** answers coord→place/county routing free (2026-07-24 probe) — the US analogue
  of Germany's AGS / France's INSEE lookup. One national reader for all city folders; removes Regrid as a
  routing prerequisite.
- **An SF height-and-bulk pack** is a template for other CA charter cities that publish height districts;
  **a NYC FAR + Sky-Exposure-Plane pack** is a template for other FAR-governed East-Coast cities. Author
  each pack so the *shape* ports even though the numbers do not.
- The **federal overlay graph** (FEMA NFHL flood, NRHP heritage, USFWS NWI wetlands, USGS 3DEP terrain) is
  near-national and free — build one adapter per federal agency, reused by every city (Phase 6c parallel).

---

*Model references: **Denmark** `../dk/` (ceiling, ~96 %) · **Berlin** (NYC analogue — richest data) ·
**Barcelona** `../es/es-ct/08019-barcelona/` (SF analogue — pilot climb). Governing: **C58**
(fidelity/provenance), **ADR-0269** (curate-then-serve), **ADR-0270** (SF height-and-bulk KIND),
**L-449** (human-verification gate), **C63 §3/§4** (the seven axes + ratified weighting). Data layer:
[`USA.md`](./USA.md) (national architecture — INVERSE-of-Germany city-federation) ·
[`CITIES/`](./CITIES/) (the primary atlas — `NEW_YORK_CITY.md` + `SAN_FRANCISCO.md` FULL) ·
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city composite — NYC/SF 53 % `partial`) ·
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (structured-fill; renamed from `RATE.md`, L-649) · [`NEXT.md`](./NEXT.md) (probe queue). All flagship findings are
`CONVERGENT-SECONDARY` until wired — ship the probe before the fix.*
