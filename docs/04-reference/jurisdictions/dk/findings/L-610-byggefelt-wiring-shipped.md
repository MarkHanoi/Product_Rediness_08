# L-610 — Byggefelt WIRED (dimensions + identity) + the honest Denmark ceiling

> **Status:** code SHIPPED to the provider path + tests green, 2026-07-23. This FINISHES the
> byggefelt step L-609 spec'd but did not wire (its Blocker B — base staleness — is now resolved;
> see §5). **Tier every claim; failure ≠ empty; never fabricate a dimension (§CONTEXT-DATA-HONESTY).**
> Convention line: numbers are VERIFIED-LIVE against Plandata.dk WFS 2.0 (2026-07-23) unless tagged.

---

## 0 — TL;DR (the four answers the brief asked for)

1. **Byggefelt verdict + what was wired.** `theme_pdk_byggefelt_vedtaget` exists and is well-populated
   (**57,031** features, real `MultiPolygon` footprints). It is now **WIRED as the most-specific layer**
   in the provider (`server/plandataZoningProxy.js`) and mapper (`mapPlandataToZoningRecord.ts`) — for its
   per-building-field **DIMENSIONS (height/storeys) + IDENTITY + a binding-footprint tag**, with full
   provenance. **Coverage is deliberately NOT delivered from it** (that needs the parcel + an L0 schema
   field — the ADR-gated cross-layer step, §3); emitting a coverage number from the footprint alone would
   fabricate. `maxCoverage` stays honest-null on byggefelt exactly as on every other DK layer.
2. **Click-weighted D1.** ≈ **87.3%** of **byzone** clicks get ≥1 usable dimension (L-609 live
   Monte-Carlo, N=300, seed 20260723; denominators below). Byggefelt's marginal dimensional
   contribution is ≈0 (it sits top-of-chain; lower layers cover the same clicks). Re-confirmed anchors
   this session: ramme 50,627 · lokalplan 37,974 · byggefelt 57,031 (all match L-609 to the feature).
3. **Honest maximum ceiling (dimensions, byzone):** ≈ **87%**, ~13 pp short of 100%, and that gap is
   **missing at source** (the plan omits the number) — not an access wall, not fabricatable. The
   remaining gap closes only with **plan-PDF OCR** (the same horizontal capability the Spain OCR pilot
   is building — TRIP-WIRE both ways, §4). **Do NOT claim 100%.**
4. **Footprint/coverage is a SEPARATE axis, still 0% delivered** through the ZoningRecord path; byggefelt
   makes a real footprint available at **6.0%** of byzone clicks (**23.9%** of byggefelter are binding),
   ready for the ADR-gated downstream step.

---

## 1 — THE LIVE BYGGEFELT PROBE (unfiltered counts first)

Every ratio has its denominator counted with `resultType=hits` BEFORE any filter (§CONTEXT-DATA-HONESTY,
L-422 family), so a zero can never masquerade as a fill.

| Measure (national) | Count | Share of 57,031 |
|---|---|---|
| **Total byggefelt features** | **57,031** | — |
| `bygkunifelt=true` (building ONLY within the field) | 13,805 | 24.2% |
| `bygvejledende=true` (advisory / illustrative guide) | 37,106 | 65.1% |
| **Binding footprint** (`bygkunifelt=true AND bygvejledende=false`) | **13,627** | **23.9%** |
| Publishes a dimension (`maxbygnhjd` OR `maxetager` not null) | 18,061 | 31.7% |

**Shape (one real feature — Birkerød Bymidte, LP 92, `id=1347662`):** `geometry :: MultiPolygon`
(a real footprint); `bygkunifelt=true`, `bygvejledende=false` (a BINDING cap); `maxbygnhjd=8`,
`maxetager=2` (it DOES cap height/storeys here); `eareal=null` (no floor area); **no `bebygpct`
field at all** (→ no FAR); identity via the SAME `lp_*` aliases the mapper already reads
(`lp_plannr='LP 92'`, `lp_plannavn`, `lokplan_id`, `delnr`, `doklink`).

> ⚠ **This refines L-609.** L-609 sampled only features where `bygkunifelt=false` and concluded "the
> sampled fields are NOT coverage caps." True for those — but nationally **23.9% ARE binding caps**, and
> some (like LP 92) also carry a dimension. So the `bygkunifelt && !bygvejledende` gate is real and
> load-bearing, and byggefelt IS a genuine most-specific dimensional source where it publishes one.

---

## 2 — WHAT WAS WIRED (provider + proxy + mapper + tests — no rulepack, no registry)

Denmark is **structured-from-provider**, not a rulepack: `registry.ts` / `index.ts` were confirmed
untouched (none needed). The change set:

- **Proxy** (`server/plandataZoningProxy.js`):
  - `PLANDATA_LAYERS` now leads with `{ key: 'byggefelt', typeName: 'pdk:theme_pdk_byggefelt_vedtaget' }`
    — the tightest instrument, queried most-specific.
  - New exported `isBindingFootprint(props)` = `bygkunifelt && !bygvejledende` (with a `wfsBool`
    coercer for GeoServer's `'true'`/`'false'` strings); **unknown bindingness → treated as NOT binding**
    (never assume a cap).
  - Selection rule (`fetchZoningAtPoint`): a dimensioned byggefelt WINS (existing `hasUsableDimension`
    path); a **dimensionless, non-binding** byggefelt is placement guidance only and is skipped as the
    identity fallback so it can **never shadow** a richer delområde/lokalplan below; a **binding**
    byggefelt is kept as fallback identity + carries its `bygkunifelt`/`bygvejledende` flags on the
    returned properties for the downstream coverage step (so it never re-fetches).
- **Mapper** (`mapPlandataToZoningRecord.ts`, pure):
  - `PlandataLayer` gains `'byggefelt'` (most-specific); `layerFallbackCode` gains `'DK-BYGGEFELT'`.
  - Dimensions map via the existing `maxbygnhjd`/`maxetager`; identity via the existing `lp_*` aliases;
    **`maxCoverage` stays null** (a comment names the ADR-gated reason).
  - A **binding** byggefelt adds the overlay tag **`Bindende byggefelt`** — real, cited context that a
    footprint cap exists, WITHOUT inventing its ratio.
- **Tests (grown, green):**
  - `packages/site-parcel-data` vitest: **500 → 503** (3 new mapper tests: binding byggefelt maps
    dims+identity+tag & null coverage; advisory byggefelt maps its dim but earns no tag; footprint-only
    byggefelt → null record).
  - `server/__tests__/plandataZoningProxy.test.ts`: **11 → 14** (`isBindingFootprint` unit test;
    dimensioned byggefelt wins over the whole plan; dimensionless advisory byggefelt does not shadow it).
  - No new `tsc` errors introduced (the single pre-existing `zoneRegistryAndRefusals.test.ts` error is
    on `main` already, unrelated to Denmark).

---

## 3 — WHY COVERAGE IS NOT (YET) DELIVERED — the exact remaining gap

`maxCoverage ∈ [0,1] = area(footprint ∩ parcel) / area(parcel)`. Three facts make this a **cross-layer,
ADR-gated** change, not a proxy+mapper edit — and doing it silently would be a shortcut and a governance
break:

1. **No parcel in the pure mapper.** `mapPlandataToZoningRecord` sees only WFS *attributes*; the parcel
   geometry lives downstream (C57). Coverage cannot be computed where the ratio's denominator is absent.
2. **No footprint field in the L0 schema.** `ZoningRecord.structuredFields` (`EnvelopeNumbers`) is numeric
   only — there is no place to carry a footprint ring. Adding one is a C58/ADR decision (schemas are
   contract-governed), not a provider edit.
3. **Bindingness gate is mandatory.** Only `bygkunifelt && !bygvejledende` (23.9%) footprints are caps;
   the 65.1% `bygvejledende` guides must never be read as coverage.

**Wiring spec when greenlit (unchanged from L-609 §4.1, now with the gate live):** proxy passes the
byggefelt **geometry** through when `isBindingFootprint`; L0 gains an optional footprint ring (or accepts
a pre-computed `maxCoverage`); the envelope engine (scene-committer) computes
`area(footprint ∩ parcel)/area(parcel)` where the parcel exists; the mapper keeps `maxCoverage: null`
until that step supplies it. The bindingness gate + `DK-BYGGEFELT` identity + `Bindende byggefelt` tag
shipped here are the readiness the step consumes.

---

## 4 — THE HONEST CEILING + TRIP-WIRES

| Axis | Today (byzone) | Remaining gap | Closable by us? |
|---|---|---|---|
| **Dimensions** (height/storeys/FAR) | ≈ **87%** | ~13 pp where NO layer publishes any dimension | **No** from structured fields — missing at source. Closes only via **plan-PDF OCR**. |
| **Footprint / coverage** | 0% delivered (footprint available at 6.0% of clicks) | L0 footprint field + downstream parcel-intersection + the (now-live) bindingness gate | **Partially** — ADR-gated, §3. |
| **Setbacks** (byggelinjer) | 0% | separate Plandata dataset, not on the plan feature | Future: wire the byggelinjer layer. |

**⚠ Do NOT quote a single blended "100%".** Dimensions are ≈87% and at their honest structured ceiling;
footprint/coverage and setbacks are separate axes near 0% with concrete gated next steps.

**TRIP-WIRES:**
- **OCR (both ways).** The ~13 pp dimensional gap is a plan-PDF text-extraction problem — the SAME
  horizontal capability the Spain OCR pilot (`es/.../L-590f-OCR-PIPELINE-DECISION.md`) is building.
  When that pipeline lands, Denmark's dimensionless-plan minority is a ready consumer: the `doklink`
  already gives the exact plan PDF per feature. Conversely, if Denmark stands up OCR first, Spain reuses
  it. Neither jurisdiction should build a second OCR path.
- **Footprint/coverage schema.** If ANY jurisdiction adds a footprint/coverage field to L0
  `EnvelopeNumbers`/`ZoningRecord`, wire Denmark's byggefelt at the same time (spec §3) and reuse the
  `isBindingFootprint` gate shipped here.
- **Area-weighting surprise.** Area-weighting a fill can move it the "wrong" way when the big polygons
  are the empty ones (Denmark ramme: 75.7% count → 61.5% area). Never assume large = data-rich.

---

## 5 — BASE-STALENESS (L-609 Blocker B) — RESOLVED

L-609 shipped no code because its worktree base (`9bb79b8`) predated the merged delområde work
(`a3413cd0`), so editing the proxy/mapper there would have clobbered it. This session's worktree was
**fast-forwarded to `main` (`c2a06571`)**, which contains the delområde/§USABLE-FALLBACK layer — so
byggefelt was layered cleanly ON TOP of it (byggefelt → delområde → lokalplan → ramme), no clobber.
`git merge --ff-only`; strict-ancestor, zero divergence.

---

## 6 — REPRODUCE

All counts are keyless `resultType=hits` GETs against `https://geoserver.plandata.dk/geoserver/wfs`
(`typeNames=pdk:theme_pdk_byggefelt_vedtaget`, `CQL_FILTER=` the predicate in §1). The click-weighted
87.3% is L-609's live Monte-Carlo (seed 20260723, N=300 area-weighted byzone points from
`zonekort_samlet_v`); its national anchors (ramme 50,627 · lokalplan 37,974 · byggefelt 57,031) were
independently re-confirmed this session. CRS EPSG:25832 throughout.
