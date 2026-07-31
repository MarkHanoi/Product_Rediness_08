# Denmark (dk) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 (Denmark). Composite master roll-up (C63 §5) —
     one row per tackled city, columns = the 7 axes + overall. Every cell is cited-derived or
     `not-assessed` with a typed C62 reason; NO cell is a hand-typed or borrowed number (C63 §1.1/§1.2). -->

**National legislation/data-fill:** **~96%** digital-data / **~87%** pure-structured byzone (L-609/L-611,
live-verified 2026-07-23). ⚠ This national number currently lives in [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) — Denmark's structured legislation/data-fill rate, renamed from `RATE.md`
to `LEGISLATION-RATE.md` per the L-649 naming convention (a reconciliation banner sits atop it). It **feeds the per-city LEGISLATION axis** as the country prior; it is NOT a per-city measured fill.
See [`README.md`](./README.md) for the national data layer + [`DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`](./DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md).

> **⚑ 2026-07-30 SCOPE — "offline legislation + deferred live data" (founder ruling, mirrors Sweden).**
> **Legislation = DERIVED (L-449 SIGNED):** the PLANDATA → buildable-envelope mapping is signed against
> BR18 §168–186 (`maksbebyggelsesprocent → FAR = pct/100`, `maksbygningshojde → height`, `maxetager →
> storeys`, **densityScope** parcel/property/planning-area preserved + honoured) — see
> [`dk-PLANDATA-ENVELOPE-MAPPING.md`](./dk-PLANDATA-ENVELOPE-MAPPING.md), implemented as the DK planning
> rule pack. **Live cadastre / PLANDATA = DEFERRED:** a Datafordeler admin account cannot be bootstrapped
> (Danish **MitID** identity gate, same access class as Swedish **BankID**), so the DK parcel provider is a
> deferred stub (OSM footprint fallback). Honest scoring: Legislation axis credited on the signed mapping;
> **PARCEL + live DATA-SOURCES = access-deferred (a MitID/BankID-class access gap, NOT a code gap).** Do
> NOT claim the country is live.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — **RATIFIED (founder, 2026-07-30)**: LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is a
> scorecard-function-shaped output; `not-assessed` where unmeasured — NEVER a hand-typed or borrowed number.

## Denmark is nationally covered — cities inherit the national providers

Denmark's planning law is **national** (Plandata.dk); the whole country is served by ONE keyless zoning
provider, ONE national OSM context bake, ONE credential-gated cadastre, and ONE national DHM height/terrain
source. So "tackled DK city" is largely a **national-coverage** fact, not a per-city bake/pack:

- **Context bake:** `tools/context-bake/bake.mjs` REGIONS `denmark` — a **national** clip, bbox
  **`7.70,54.40,15.30,57.90`** (incl. Bornholm ~lon 15.2). Copenhagen's own clip was **removed** 2026-07-26 —
  it rides the national region. This bbox contains **every** Danish city (København, Aarhus, Odense, Aalborg,
  Esbjerg, Randers, Kolding, Vejle, Horsens, Roskilde, …).
- **Zoning:** `DkZoningProvider` + keyless national Plandata WFS — resolves anywhere in DK.
- **Parcel:** `parcelProviders/registry.ts` `matrikel-dk` (`isInDenmark`) — national, credential-gated.
- **Heights:** `bake.mjs` denmark `heightJoin:'dhm'` — national DHM nDSM, apikey-gated. **Denmark has measured
  heights nationally** (DHM `dhm_overflade−dhm_terraen`), a differentiator vs footprint-only jurisdictions.
- **Terrain:** `terrain.mjs` source `dk` (DHM) exists nationally, but only **one** city bbox row is
  registered: `copenhagen`.

**Tackled set scaffolded here (C63 §1.7 — scaffolded-folder criterion):** the explicitly-anchored reference
city **Copenhagen** (the only DK city with bespoke envelope/refusal code + a terrain row) plus the three
next-largest cities, one per remaining mainland region, to exercise the subdivision scheme. All are inside the
cited national bbox and inherit the national providers identically.

## Subdivision scheme (documented choice)

**Chosen:** `<cc>-<subdiv>` = **ISO 3166-2:DK region** (5 regions); `<code>` = the official **kommunekode**
(Danmarks Statistik / DAGI municipal code); `<slug>` = ASCII place name. This mirrors the Spain scheme
(`es-an` region + INE code) and Germany (`de-be` + municipal code). Rationale: DK planning is national, but the
region is the stable ISO-standard intermediate tier and the kommune is the unit that carries a `kommunekode`
join-key. (Copenhagen's slug uses the English exonym `copenhagen` to match the app's `terrain.mjs`/`bake.mjs`
`copenhagen` identifier; the others use their already-ASCII native names.) ⚠ The kommunekode + ISO region codes
are standard official administrative identifiers, not legal parameters — spot-verify at pack-authoring time
against the DAGI register per the C57 join-key rule.

| Region (ISO 3166-2:DK) | City | kommunekode | Folder |
|---|---|---|---|
| DK-84 Hovedstaden | Copenhagen / København | 0101 | `dk-84/0101-copenhagen/` |
| DK-82 Midtjylland | Aarhus | 0751 | `dk-82/0751-aarhus/` |
| DK-83 Syddanmark | Odense | 0461 | `dk-83/0461-odense/` |
| DK-81 Nordjylland | Aalborg | 0851 | `dk-81/0851-aalborg/` |

## Per-city completion matrix

| City (`code`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| Copenhagen (`0101`) | `not-assessed` | `derived-ready` † | **70%** | `not-assessed` | `not-assessed` | `not-assessed` | **56%** | **66% · partial** | [dossier](./dk-84/0101-copenhagen/RATE.md) |
| Aarhus (`0751`) | `not-assessed` | `derived-ready` † | **70%** | `not-assessed` | `not-assessed` | `not-assessed` | **56%** | **66% · partial** | [dossier](./dk-82/0751-aarhus/RATE.md) |
| Odense (`0461`) | `not-assessed` | `derived-ready` † | **70%** | `not-assessed` | `not-assessed` | `not-assessed` | **56%** | **66% · partial** | [dossier](./dk-83/0461-odense/RATE.md) |
| Aalborg (`0851`) | `not-assessed` | `derived-ready` † | **70%** | `not-assessed` | `not-assessed` | `not-assessed` | **56%** | **66% · partial** | [dossier](./dk-81/0851-aalborg/RATE.md) |

**† LEGISLATION = `derived-ready` (a `structured-national-prior`, NOT a measured per-city %).** Denmark's
legislation is **structured + signed** — the L-449 Plandata FIELD→C63 mapping is signed and machine-readable
(`bebygpct→FAR`, `maxbygnhjd→height`, `maxetager→storeys`, densityScope honoured) — see the new
[`DENMARK-LEGISLATION-EXTRACTION.md`](./DENMARK-LEGISLATION-EXTRACTION.md) (+ `.json`). So the axis is **DERIVED-ready**
off the ~96% national structured ceiling. **But no per-city % is hand-typed:** the per-city fill = *the fraction of
that city's lokalplaner/rammer with populated Plandata fields*, a **MEASUREMENT still to run** (a byzone
click-weighted fill scoped to the 0101/0751/0461/0851 bbox). Borrowing the ~96% country prior as a city cell would
be the §CONTEXT-DATA-HONESTY country-borrow trap, so the cell stays **out of the composite** until that measurement
runs and the Danish-planner sign-off lands (`sources/VERIFICATION.md`). `derived-ready` ≠ a score.

**Assessed axes (composite):** DATA-SOURCES (70%) + CONTEXT (56%) only; overall renormalised over that subset (C63
§1.5), so `partial:true` and the remaining axes are honestly named per city. **LEGISLATION is `derived-ready` but
carries no measured %, so it does NOT enter the composite** (the honest residual is the per-city Plandata-population
measurement; ~96% national ceiling). The four cities score identically because DATA-SOURCES + CONTEXT are composed
from **national** state that reaches every DK bbox equally; the only per-city difference is TERRAIN's *reason*
(Copenhagen `license-restriction` — a gated bake row exists; the others `pending-implementation` — no row), both
resolving to `not-assessed`.

<!-- More DK cities become "tackled" as they gain a terrain row / per-city pack / scaffolded folder; add a row
     then, filling cells only from the scorecard function. -->

## Dossier index — the country-level files (what each is about)

`COUNTRY-RATE.md` (this file) is the country composite master; the files below sit beside it and FEED / support it.

| File | What it is about | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this file) | the per-city 7-axis roll-up — the country composite master rate | — (rolls up all cities) |
| [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) | national structured legislation/data-fill rate (~96%) — renamed from `RATE.md` (L-649) | LEGISLATION axis |
| [`DENMARK-LEGISLATION-EXTRACTION.md`](./DENMARK-LEGISLATION-EXTRACTION.md) (+ [`.json`](./DENMARK-LEGISLATION-EXTRACTION.json)) | the signed Plandata FIELD→C63 mapping (PART A/B/C), **per-plan not per-zone** — what's `structured` vs `unknown` | LEGISLATION axis |
| [`dk-PLANDATA-ENVELOPE-MAPPING.md`](./dk-PLANDATA-ENVELOPE-MAPPING.md) | the L-449 signed rule-pack source (the mapping's legal basis) | LEGISLATION axis |
| [`DENMARK-GAP-ROADMAP.md`](./DENMARK-GAP-ROADMAP.md) | the gap-by-gap **envelope-realism** roadmap (G1–G9 + tail) — lifts ENVELOPE/LOD/CONTEXT/PARCEL, **NOT** the ~96% rate | ENVELOPE (+ HEIGHTS/LOD, CONTEXT, PARCEL) |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD axis |
| [`README.md`](./README.md) | the national data layer — what governs, granularity, the numbers | all |
| [`ENVELOPE-RULES.md`](./ENVELOPE-RULES.md) | national envelope rule shape (coverage-and-FAR / height-and-storeys) | ENVELOPE |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | the national climb toward the maximum rate | LEGISLATION (+ all) |
| [`DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md`](./DENMARK-GEOSPATIAL-REFERENCE-ARCHITECTURE.md) | the strategic end-to-end pipeline validation (L-383) | DATA-SOURCES |
| `sources/` | national per-field citations (`SOURCES.md`) + verification (`VERIFICATION.md`, 2 items PENDING) | LEGISLATION |
| `findings/` | national L-609/L-610/L-611 + Datafordeler-auth investigation records | DATA-SOURCES |
| `topics/` | the context-data layer index (LOD buildings, roads, water, parks — spike NOT STARTED) | CONTEXT |

## Honesty ledger (C63 §3.1)

- **Copenhagen** (`0101`): DOES national keyless Plandata `structured` zoning + a Copenhagen *karré* perimeter-band
  STUDY envelope (`dkPerimeterBlock`, human-gated) + credential-gated cadastral routing + baked OSM context (5/9).
  REFUSES a fabricated estimate where Plandata lacks numbers (`dkPlandataRefusal`). UNKNOWN (typed): PARCEL quality,
  per-city LEGISLATION + ENVELOPE, TERRAIN (apikey-gated), HEIGHTS histogram. · `honestyOk: true`.
- **Aarhus** (`0751`) / **Odense** (`0461`) / **Aalborg** (`0851`): DOES national keyless zoning + credential-gated
  cadastral routing + baked OSM context (5/9), inherited nationally. REFUSES a fabricated envelope/estimate. UNKNOWN
  (typed): same as Copenhagen + TERRAIN `pending-implementation` (no city row). · `honestyOk: true`.

Denmark is the **data-readiness ceiling exemplar** (~96% national) yet every per-city *completion* axis is honestly
`not-assessed` — completion and honesty are orthogonal (C63 §3.1): high national data-readiness does not launder a
per-city measurement PRYZM has not run.

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Scaffolded under audit L-649 Phase-1 (Denmark).*
