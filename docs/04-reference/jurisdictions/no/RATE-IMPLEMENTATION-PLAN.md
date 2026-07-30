# Rate Implementation Plan — Norway (`no`) national

**Current national legislation/data-fill:** ~32% (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) —
the structured-fill metric, renamed from `RATE.md` per the L-649 migration) · **Current bake-covered composite:** ~66% `partial` (Oslo, DATA-SOURCES + TERRAIN +
CONTEXT only — see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic ceiling (PROJECTED, CONTINGENT on the Phase-A/B/C probes landing):** ~40–50% national ·
~55–65% for a well-sourced Oslo · **Ceiling model — Denmark (~96%)** · **Pilot model — Barcelona
(~48%)** · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the
> national legislation number stays ~32% and the Oslo composite stays ~66% `partial` until the probes
> below actually run and wire. The ROI ordering rests on facts already in the tree (Matrikkelen parcel
> WFS `live`-wired + keyless via `isInNorway`; Kartverket NHM DTM terrain `live`; NDH nDSM
> `documented`) — but a *wired provider* is not a *measured axis*. Axis 1 (PARCEL) stays `not-assessed`
> until `computeParcelConfidence` actually runs a sample; the raised ceiling is a *projection
> contingent on Phase A/B/C landing*, not a measured gain. **Ship the probe before the fix.**

> **Why Norway's ROI ordering differs from Portugal's.** Portugal's Phase A had to *discover and wire*
> a whole geospatial platform (the DGT OGC API) before any parcel/height/terrain slot could fill.
> Norway is already past that: the geospatial half is **wired and keyless today** — one national
> Matrikkelen parcel WFS (no per-region fragmentation, unlike Germany's ALKIS or Portugal's ~174/308
> no-cadastre municípios), a nationally-complete NDH LiDAR DTM/DSM, and an Oslo OSM+terrain bake that
> already scores DATA-SOURCES **80%** (`COUNTRY-RATE.md` — the highest of the Nordic set). So Norway's
> Phase A is not *wire the platform*, it is the cheaper **measure the platform we already wired**
> (`computeParcelConfidence` over the live Matrikkelen). The *binding* cap therefore sits almost
> entirely on the LEGISLATION + ENVELOPE axes (45% of the C63 weight) — the numeric utilisation values
> live in `reguleringsbestemmelser` prose because the national `BestemmelseUtnyttingsgrad` SOSI object
> is an unfilled stub (confirmed on Geonorge's own register 2026-07-24). See §1.4 and the Phase-3
> roadmap. Full national data layer: [`README.md`](./README.md) · resume queue:
> [`NEXT.md`](./NEXT.md) · study: [`findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md`](./findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md).

---

## 1 — The ceiling: what "maximum" means here

Norway is **prose-bound** for its numeric planning values, in a very specific way: it has a genuinely
national plan **data model** — SOSI Plan, legally mandated since forskrift 2009 nr. 861, *older and
more binding than Germany's XPlanung* — with national code lists for `arealformål`, `hensynssone`, and
`planstatus`. What it lacks is a **populated** numeric slot: the SOSI Plan object type designed to
carry the utilisation figure, `BestemmelseUtnyttingsgrad`, is an **unfinished stub in the authoritative
Geonorge object register itself** (its own documentation reads *"Her burde det vært en forklaring…"* —
"there should have been an explanation here", confirmed live 2026-07-24). So the actual `%-BYA` / `BRA`
/ height values remain in numbered `reguleringsbestemmelser` prose paragraphs, exactly like a German
B-Plan Satzung or a French règlement écrit. This places Norway in the **Scenario B** structural
position: **the LEGISLATION and ENVELOPE axes are capped** until an NLP / rule-extraction pipeline and
the L-449 human-verification gate are built. **The geospatial half of the ceiling is already relieved**
by Norway's national feeds — see §1.4.

**Ceiling model — Denmark (~96%):** Denmark's national Plandata delivers zone code, numeric density,
and height as machine-readable structured fields. That is the proof ~96% is reachable when a country
fully digitises its planning *values* (not just its planning *schema*). Norway has the schema and the
legal mandate — older than Denmark's — but never required the numbers into structured fields, so it
sits far below Denmark on the *legal* axis. The Denmark ceiling is not achievable for Norway without a
structural change in how kommuner publish `bestemmelser` (structured numeric fields, or a filled
`BestemmelseUtnyttingsgrad`) — outside PRYZM's control.

**Pilot model — Barcelona (~48%):** Barcelona demonstrates the phased climb — registry, per-zone rule
packs, block-derived construction envelopes, refusal vocabulary. Norway should mirror this **shape**,
not the numbers: start with the most tractable city, source one zone category, build the extraction
infrastructure generically on the SOSI Plan schema, then scale to more categories and kommuner.

**Norway's structural facts (what bounds the ceiling):**
1. **Numeric values are prose-only** — the `BestemmelseUtnyttingsgrad` SOSI slot is an unfilled stub;
   `%-BYA` / `BRA` / height live in `reguleringsbestemmelser` text. NLP/rule-extraction pipeline +
   L-449 gate required before any numeric field serves at `confidence: structured`. *(The surviving
   cap — see §1.4/§3a.)*
2. **Per-kommune delivery, no national aggregator** — ~357 kommuner each publish (or don't) their own
   planregister WFS on the shared SOSI Plan schema; no single national feature layer resolves "which
   plan covers parcel X" (`NEXT.md §7` dead-end). Schema is uniform (an advantage over Germany), but
   coverage is a **per-kommune measurement problem**, not a legal-regime problem. *(Relieved by schema
   uniformity; see §3c.)*
3. **Parcel geometry is NOT a gap** — unlike Portugal (fragmented cadastre) or Germany (per-Land
   ALKIS), Norway has one national Matrikkelen Eiendomskart Teig WFS, `live` + keyless + daily-update
   (`RATE.md` scores it ~95%). This is a Norway **strength**, not a ceiling constraint — the only open
   question is the *measured quality distribution* (Phase A), never fragmentation. *(See §3b.)*

### 1.4 — Mapping the state onto the seven C63 axes (CONTINGENT)

Mapping the already-wired Norwegian feeds onto the seven C63 axes and their ratified weights (C63 §4).
Every "post-probe" cell is a **projection contingent on Phase A/B/C landing** — **no RATE cell moves on
it**:

| C63 axis | Weight | Current premise (measured / assessed) | Post-probe (once run + wired) |
|---|---:|---|---|
| **DATA-SOURCES** | 15% | **80% assessed** — cadastre-parcel `live`, terrain DEM `live`, context-OSM `live`; zone-GIS + nDSM `documented` | **Rises** to ~0.9 once the Oslo zone-GIS WFS confirms `live` and NDH nDSM bakes (both `documented`→`live`) |
| **PARCEL** | 15% | `not-assessed` — provider `live`+keyless, but no `computeParcelConfidence` sample drawn | **Rises high** — national Matrikkelen has no fragmentation cap; a sample should resolve mostly `high` (Phase A, the cheapest measurement) |
| **CONTEXT** | 5% | **56% assessed** — 5/9 layers baked (buildings·roads·water·parks·landuse) | **Rises** as rail/trees (L-642) bake lands + the coastal sea/Oslofjord layer is independently probed |
| **HEIGHTS/LOD** | 10% | `not-assessed` (cap) — NDH nDSM `documented`, measured-CAPABLE, unbaked | **Rises** once the shared nDSM = DSM−DTM module bakes NDH/`høydedata.no` inputs for the Oslo bbox |
| **TERRAIN** | 10% | **50% assessed** — Kartverket NHM DTM baked but unverified (rung 50) | **Rises to 100** on a `terrain.verify.mjs` decoder round-trip (NDH is nationally complete) |
| **LEGISLATION** | 25% | ~32% coarse structured-fill prior; per-clau count `not-assessed` | **Largely unchanged** — the surviving cap; numeric values are prose-only (§1/§3a) |
| **ENVELOPE** | 20% | `not-assessed` — no NO rule pack registered | **Unchanged** — depends on LEGISLATION + the C58 solver |

The five geospatial axes (55% of the weight) are **already fillable** — Norway's national feeds move
them from *assumed-blocked* to *measure-and-bake*. A back-of-envelope projection for a **well-sourced
Oslo**: PARCEL ~0.8, DATA-SOURCES ~0.85, CONTEXT ~0.65, HEIGHTS ~0.6, TERRAIN ~1.0, LEGISLATION ~0.25,
ENVELOPE ~0.2 → **~54% weighted**. So the *well-sourced city* ceiling projects to **~55–65%** and the
*national* ceiling to **~40–50%** — bounded now by the LEGISLATION + ENVELOPE prose-extraction cost
(45% of the weight) and by per-kommune WFS coverage, **not** by parcel geometry. **All post-probe cells
are contingent on Phase A/B/C actually landing.** No RATE cell moves on it.

---

## 2 — Phase tracker

Three ordered phases. **A** measures the geospatial platform Norway already wired (the cheapest,
highest-ROI win — a *measurement*, not a build); **B** derives heights via the shared nDSM module +
verifies the already-baked terrain; **C** is the `reguleringsbestemmelser` NLP / rule-extraction
pipeline that is the surviving cap on the LEGISLATION/ENVELOPE axes. Each row lists
**goal · unlocks · axis · effort · dependency · blocker**. Every "to" cell is a PROJECTION until the
named probe runs; the probe queue lives in [`NEXT.md`](./NEXT.md). **No RATE cell is changed by this
tracker.**

| Phase | Goal | Unlocks | Axis | Rate: from→to (projected) | Effort | Dependency | Blocker | Status |
|---|---|---|---|---|---|---|---|---|
| **A** | Run `computeParcelConfidence` over an N-parcel sample in the Oslo bbox against the already-`live` national Matrikkelen (`isInNorway`→`matrikkel-no`, keyless) | PARCEL comes off `not-assessed`; the assessed subset gains its heaviest cheap axis; national parcel-quality distribution measured | PARCEL (Axis 1) | PARCEL `not-assessed` → measured (proj. `high`-dominant) | **Low** (a measurement, not a wiring) | Matrikkelen provider already wired + LIVE (`registry.ts`) | None hard — provider is keyless-live; only the sample has never been drawn | NOT STARTED |
| **B** | Bake NDH nDSM (DSM−DTM) for the Oslo bbox via the **shared ES/FR/PT nDSM module** (Norway feeds `høydedata.no` inputs per the geo-sourcing map) + run `terrain.verify.mjs --tileset` on the already-baked Kartverket NHM DTM (rung 50→100) | HEIGHTS/LOD off `not-assessed`(cap) → `tagged`; TERRAIN 50→100 verified | HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5) | HEIGHTS `not-assessed`(cap) → measured · TERRAIN 50% → 100% | **Medium** (module is SHARED; terrain is one verify run) | Phase A + shared ES/FR/PT nDSM module; terrain row already present (`terrain.mjs` `oslo` source `no`) | NDH RMSE-Z tier assignment; FKB-Bygning footprint licence-gated (Bygningspunkt point-only is the free fallback) | NOT STARTED |
| **C** | Wire the per-kommune SOSI Plan **zone-GIS WFS** (Oslo planregister probe) + build the `reguleringsbestemmelser` NLP / rule-extraction pipeline (grad av utnytting + plan-set height + §29-4 default) → cite `sources/SOURCES.md` → sign L-449 → author the `no-0301-oslo` C58 rule pack | LEGISLATION (structured, L-449-hardened) + ENVELOPE (C58 solver runs on sourced numerics) — the surviving cap, Oslo first | LEGISLATION (Axis 2) · ENVELOPE (Axis 4) | LEGISLATION ~32% prior → per-clau measured · ENVELOPE `not-assessed` → measured | **High** (the "whole cost" — human-gated legal SOURCING) | L-449 gate; ADR-0269 curate-then-serve; Phase A (parcel to attach rules to); C58 pack authoring | `BestemmelseUtnyttingsgrad` national stub (numeric values in prose); Oslo planregister WFS unconfirmed (Planinnsyn is a click-viewer); no national aggregator WFS | NOT STARTED |

---

## Phase-3 — the ordered roadmap (goal · unlocks · axis · effort · dependency · blocker)

### Phase A — Measure the parcel platform Norway already wired

- **Goal.** Run `computeParcelConfidence` + `computeParcelMetrics` (`parcelConfidence.ts`, C63 Axis 1
  input) over a representative N-parcel sample in the Oslo bbox (`10.66,59.88,10.83,59.96`) against the
  **already-`live`, keyless** national Matrikkelen Eiendomskart Teig WFS
  (`parcelProviders/registry.ts` `isInNorway`→`matrikkel-no`;
  `wfs.geonorge.no …matrikkelen-eiendomskart-teig app:Teig` — HTTP 200 GML 3.2.1, real teig polygon
  `0301/208/644` confirmed). Record the `high|medium|low` match distribution + click-inside-ring
  containment (`pointToParcelM`).
- **Unlocks.** **PARCEL** comes off `not-assessed` — the heaviest of the *cheap* axes (15%). Because
  Matrikkelen is a **single national WFS with no fragmentation** (§3b), the sample should resolve
  mostly `high` — this is Norway's fastest weighted-completion gain and it is a *measurement*, not a
  build.
- **Axis.** PARCEL (Axis 1).
- **Effort.** **Low.** The provider is wired and live; only the sample has never been drawn. No new
  ingestion, no key, no reseller. This is the single highest-ROI move on the whole plan.
- **Dependency.** None hard — Matrikkelen is keyless-live today. (Optional: reuse the same sample-draw
  harness Barcelona/Madrid used, so the distribution is directly comparable.)
- **Blocker.** None structural. The only reason PARCEL reads `not-assessed` is that no
  `computeParcelConfidence` run has executed for the bbox (C63 §8, honest sentinel — a wired provider
  is not a measured axis).

### Phase B — Derive heights (shared nDSM module) + verify terrain

- **Goal.** Feed Norway's **NDH / `høydedata.no`** national LiDAR (DTM + DSM, ≥2 pts/m², confirmed
  complete nationwide, keyless, WMS/WFS/WCS on Geonorge) into the **shared nDSM = DSM − DTM
  building-height module** for the Oslo bbox and bake per-building `heightProvenance`; and run
  `terrain.verify.mjs --tileset` on the already-baked Kartverket NHM DTM terrain (`terrain.mjs` `oslo`,
  source `no` = `wcs.geonorge.no …hoyde-dtm-nhm-25833`, keyless HTTP-200) to lift its rung from
  **50 (baked-but-unverified)** to **100 (decoder round-trip pass + lit-and-correct)**.
- **Unlocks.** **HEIGHTS/LOD** (moves `ndh_no` from `documented`/unbaked to `tagged` measured heights
  once baked) and **TERRAIN** (50→100 — the axis is already baked; it just needs the independent
  decoder verify, and NDH's national completeness means no white-mask relief gap to fear).
- **Axis.** HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5).
- **Effort.** **Medium.** The nDSM module is **shared** — the SAME module as Spain (L-511c) and France
  (L-512b); Norway feeds different inputs (NDH via `høydedata.no`) **per the geo-sourcing map**
  ([`GEO-DATA-SOURCING-MASTER.md`](../GEO-DATA-SOURCING-MASTER.md), ADR-0277 derived-heights). Do NOT
  one-off it per country. The terrain lift is a single `terrain.verify.mjs` run (row already present).
- **Dependency.** Phase A (a measured parcel to attach massing to) + the shared ES/FR/PT nDSM module.
  Terrain verify depends only on the existing `oslo` terrain bake.
- **Blocker.** **NDH RMSE-Z tier** — assign a C62 confidence tier to the derived heights (NDH accuracy
  is published per campaign; confirm before stamping). **FKB-Bygning** (footprint + roof-height, the
  richer 2.5D source) is **licence-gated** — free only for Norge digitalt parties; commercial use
  needs a Geodata/Norkart reseller or a direct Kartverket agreement (`NEXT.md §3.5`). The free fallback
  is Matrikkelen **Bygningspunkt** (building point, location-only, no footprint) — usable for presence,
  not massing. nDSM derivation does not need FKB-Bygning.

### Phase C — The zone-GIS + `reguleringsbestemmelser` NLP pipeline (the surviving cap) — Oslo first

- **Goal.** (1) Wire the per-kommune **SOSI Plan zone-GIS WFS** — probe for an Oslo planregister WFS
  (Geonorge kartkatalog / `data.oslo.kommune.no`) that serves reguleringsplan geometry + `arealformål`
  / `hensynssone` / `planstatus` attributes, moving the DATA-SOURCES zone-GIS slot `documented`→`live`;
  (2) build the **`reguleringsbestemmelser` NLP / rule-extraction pipeline** that reads the numeric
  planning values (**grad av utnytting: `%-BYA` / `BYA` / `BRA` / `%-BRA` / MUA**, plan-set
  **gesims-/mønehøyde**, byggegrense) that are **prose-only** in every plan document, plus the
  **pbl. § 29-4 numeric default** for the no-plan regime; (3) pass every extracted value through the
  **L-449 human-verification gate** before it serves at `confidence: structured`; (4) author the
  `no-0301-oslo` C58 rule pack. **Start with Oslo** (bake-covered), but build the SOSI Plan reader +
  the NLP extractor **generically** on the national schema.
- **Unlocks.** **LEGISLATION** (structured dimensional fill, L-449-hardened) and **ENVELOPE** (the C58
  solver can only run on sourced numeric parameters). These two axes (45% of the weight) are the
  surviving cap after Phases A/B — Norway's national feeds do **not** touch them.
- **Axis.** LEGISLATION (Axis 2) · ENVELOPE (Axis 4).
- **Effort.** **High.** This is the "whole cost" — human-gated legal SOURCING, the most expensive axis.
  But the SOSI Plan reader is reusable across **all ~357 kommuner** (uniform national schema —
  `NEXT.md §4.1`) and the `reguleringsbestemmelser` NLP extractor is reusable across all Norwegian
  cities (nationally standardised `bestemmelser` format — `NEXT.md §4.2`); the numeric-prose problem is
  shared with the ES/FR/PT/UK OCR/NLP investment. Build it generically (parameterised endpoint +
  glossary), never Oslo-specific. Oslo zone-category sourcing itself: high, human-gated.
- **Dependency.** L-449 gate mandatory before any extracted number serves `structured`. ADR-0269
  (curate-then-serve): no value serves without a citable governing article (pbl. / TEK17 §§5-1–5-7 /
  H-2300 B / Rundskriv H-8/15) in `SOURCES.md`. Phase A (a measured parcel to attach the extracted rule
  to). C58 pack authoring for the `no-0301-oslo` pack (grad av utnytting + plan-set height + §29-4
  default).
- **Blocker.** **`BestemmelseUtnyttingsgrad` national stub** — the SOSI slot for the numeric value is
  an unfilled placeholder (confirmed 2026-07-24), so the NLP must extract from prose, not read a field
  (re-check if Geonorge updated it — `NEXT.md §4.4` trip-wire). **Oslo planregister WFS unconfirmed** —
  Planinnsyn (`od2.pbe.oslo.kommune.no`) is a click-viewer; a machine-readable per-parcel WFS or a
  faktaark-automation layer is not confirmed (`NEXT.md §3.3` — the standing #1 Oslo blocker).
  **No national aggregator WFS** — per-kommune endpoints must be confirmed individually (`NEXT.md §7`).

---

## 3 — The gap to Denmark (~96%)

Three structural facts separate Norway from the 96% Denmark ceiling. Norway's profile **differs from
Portugal's**: its parcel axis is a strength, not a gap.

**(a) Numeric values are prose-only — the primary structural gap (the binding cap).** Denmark's
national Plandata delivers zone code, density, and height as typed, queryable fields. Norway has the
*schema* (SOSI Plan) and the legal mandate — older and more binding than Germany's XPlanung — but the
`BestemmelseUtnyttingsgrad` slot meant to carry the number is an **unfilled stub in Geonorge's own
register**, so `%-BYA` / `BRA` / height live in `reguleringsbestemmelser` prose. Closing this requires
the **Phase C** NLP / rule-extraction pipeline + the L-449 gate. Until it exists, the **LEGISLATION +
ENVELOPE** axes (45% of the weight) cannot rise regardless of how well the geospatial layers are wired.
**This is the binding cap on Norway's ceiling.**

**(b) Parcel geometry is NOT a gap — Norway is already ahead here.** France and Germany have complete
national parcel geometry (PCI-Express and per-Land ALKIS); Portugal is fragmented (~174/308 no-cadastre
municípios). Norway has **one national Matrikkelen Eiendomskart Teig WFS**, `live` + keyless +
daily-update (`RATE.md` scores it ~95% — cleaner than Germany's per-Land ALKIS variability). The only
open item is the **measured quality distribution** (Phase A), never fragmentation. This fact **removes**
a gap that binds Portugal and Germany — do not import their parcel-fragmentation framing into Norway.

**(c) Per-kommune delivery with no national aggregator — relieved by schema uniformity.** Norway has
~357 kommuner, each publishing (or not) its own planregister WFS; no single national feature layer
resolves "which reguleringsplan covers parcel X" (`NEXT.md §7` dead-end — the Geonorge "Plan2"
catalogue is an index, not a merged layer). But — unlike Germany's per-Land B-Plan variation or
Portugal's per-PDM formula variation — the **schema is nationally uniform** (SOSI Plan, one produkt-
spesifikasjon, one code list set). So a **single generic SOSI Plan reader** covers every kommune once
its endpoint is confirmed (`NEXT.md §4.1`); the gap is **coverage measurement** (which kommuner publish
a live attribute-carrying WFS), not schema variation. This is a materially *easier* gap than Portugal's
per-PDM formula variation. Trondheim is the only confirmed-open planregister WFS today; Oslo and Bergen
endpoints are unconfirmed (`NEXT.md §3.3/§3.4`).

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **Phase A (parcel measurement) gates Phase C** — a numeric rule must attach to a measured parcel;
  draw the Matrikkelen sample before authoring any pack.
- **L-449 (human-verification gate)** is mandatory for any value extracted via the Phase C NLP pipeline
  before it serves at `confidence: structured`. No extracted number may bypass this gate.
- **ADR-0269 (curate-then-serve):** do not serve any planning value that has not been verified against
  a citable governing article (pbl. / TEK17 §§5-1–5-7 / veileder H-2300 B / Rundskriv H-8/15) in
  `sources/SOURCES.md`.
- **C58 pack authoring** (`no-0301-oslo`) is required before ENVELOPE can score; it depends on Phase C
  numerics (grad av utnytting + plan-set height + §29-4 default).
- **Oslo planregister WFS confirmation (Phase C)** gates the DATA-SOURCES zone-GIS slot moving
  `documented`→`live` and gates any programmatic per-parcel plan lookup for Oslo.

**Current blockers:**
- **`BestemmelseUtnyttingsgrad` national stub** — the numeric-value SOSI slot is an unfilled
  placeholder (confirmed live on Geonorge 2026-07-24). Do not attempt to read a numeric utilisation
  value from this field in a generic WFS query; probe each kommune's feed individually
  (`NEXT.md §3.2/§7`). Re-check if Geonorge later specifies it (`NEXT.md §4.4` trip-wire).
- **Oslo planregister WFS unconfirmed** — Planinnsyn is a click-viewer; a machine-readable WFS /
  faktaark-automation path is not confirmed (`NEXT.md §3.3` — the standing #1 Oslo blocker). Zone-GIS
  slot stays `documented` until this lands.
- **No national aggregator WFS** — per-kommune endpoints (Oslo, Bergen, …) must each be located and
  probed; the shared schema does not imply a shared endpoint (`NEXT.md §7` dead-end).
- **FKB-Bygning licence gate** — footprint + roof-height is free only for Norge digitalt parties;
  commercial use needs a Geodata/Norkart reseller or a direct Kartverket agreement (`NEXT.md §3.5`).
  Not required for nDSM derivation (Phase B), but blocks the richer 2.5D footprint source.
- **NDH RMSE-Z tier** — assign a C62 confidence tier to derived heights before stamping (Phase B).

**Cross-jurisdiction reuse:**
- The **SOSI Plan zone-GIS reader (Phase C)** is reusable across **all ~357 Norwegian kommuner** — one
  generic reader parameterised on the endpoint, never a city-specific reader (`NEXT.md §4.1` —
  schema-reuse is Norway's key structural advantage).
- The **`reguleringsbestemmelser` NLP / rule-extraction pipeline (Phase C)** is a **shared ES / FR / PT
  / UK / NO investment** — all are prose/PDF-bound for their numeric planning values. Build it
  generically (per-country glossary: category names, article-numbering patterns, unit terms), portable
  across jurisdictions and reusable for every Norwegian kommune (`NEXT.md §4.2`). Do NOT build it
  Oslo-specific.
- The **nDSM height module (Phase B)** — DSM − DTM, per-footprint — is the SAME shared module as Spain
  (L-511c) and France (L-512b). Norway feeds NDH / `høydedata.no` inputs per the geo-sourcing map
  ([`GEO-DATA-SOURCING-MASTER.md`](../GEO-DATA-SOURCING-MASTER.md), ADR-0277). Do NOT one-off it.
- **Matrikkelen national routing** is already the trivial case — one national WFS keyed by
  `isInNorway`, no per-region lookup (contrast Germany's AGS / France's INSEE / Portugal's DICOFRE
  per-region routing). Reuse the parcel-confidence sample harness from Barcelona/Madrid for a
  comparable distribution (Phase A).
- **Terrain** — one `terrain.mjs` `oslo` row already present; the verify path is the same
  `terrain.verify.mjs` decoder round-trip used everywhere. Bergen/Trondheim need only a REGIONS +
  terrain row to become bake-covered (`COUNTRY-RATE.md §C`).
- **Heritage** — Kulturminnesøk.no (open, ~220,000 objects) is the practical national heritage reader;
  Askeladden (full register) is professional-login-gated (`NEXT.md §7` dead-end). Build one national
  heritage reader, not per-city instances.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance), **ADR-0269**
(curate-then-serve), **L-449** (human-verification gate), **C63 §3/§4** (the seven axes + ratified
weighting), **ADR-0277** (geo-data-sourcing map / derived heights). Data layer:
[`README.md`](./README.md) · [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city composite) ·
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (structured-fill ~32%; renamed from `RATE.md`, L-649) · [`NEXT.md`](./NEXT.md) (resume queue) ·
[`findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md`](./findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md). This is
a PLAN — it changes no RATE cell; ship the probe before the fix.*
