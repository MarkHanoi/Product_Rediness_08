# NSW DATA-GAP AUDIT — the founder's build prompt vs PRYZM's shipped stack

> Lane NSW-ENVELOPE · 2026-09-03 · Audits `NSW-ENVELOPE-BUILD-PROMPT.md` (founder-forwarded,
> v1.0) against the repo as of HEAD. Phase 0 (M1/M2/M3) was **RUN live this session** — measured
> numbers and raw transcripts in `phase0-transcripts/` (see `phase0-transcripts/PHASE0-REPORT.md`).
> No production code was changed in this lane.

---

## 1 — What exists today (measured, not assumed)

- **AU-NSW parcel leg: LIVE and wired.**
  `packages/site-parcel-data/src/countryAdapters/au/auStateCadastre.ts` — DCS Spatial Services
  `NSW_Land_Parcel_Property_Theme/FeatureServer/8`, keyless, CC Attribution, real legal id
  (`lotidstring 100//DP1048011` at Sydney Town Hall; re-verified this session at Surry Hills →
  `//SP63634`, a strata plan — note the empty-lot-number shape a strata lot produces). Registry
  row + `REGION_BBOX` + 31 recorded-fixture tests (lane-au-open). The **server proxy leg
  `/api/parcel/au-nsw` exists** in `server/jurisdiction/euCadastreProxy.js` (one of the 13 proxy
  legs pushed 2026-09-03 — **undeployed at last handover**, session-close 2026-09-03).
- **ePlanning consumption today: NONE.** `grep mapprod3|Planning_Portal|EPI_Primary` across
  `packages/` → **zero hits**. Everything we know about the ePlanning layers came from the
  2026-09-02 sweep's probes (`audit/geo-expansion/2026-09-02/au-sweep.md` §1.2) — and those
  probes hit a **DIFFERENT service** than the founder's inventory:
  `Planning/EPI_Primary_Planning_Layers/MapServer` (layers 1 FSR / 5 HOB), not
  `ePlanning/Planning_Portal_Principal_Planning/MapServer` (layers 11 FSR / 14 HOB). **Both are
  live on the same host — two rival services carrying the same controls.** This session's M1 ran
  against the founder's `Planning_Portal_*` family; the build must pick one family and record
  why (the Portal family is what the Portal itself consumes and is the one with the Local
  Provisions + SEPP siblings — the sweep's `Planning/EPI_*` family has no ~190-layer local
  provisions sibling).
- **Envelope engine:** scalar tiers (`EnvelopeTier` = polygon × [base, max]) + explicit-geometry
  rules already shipped; `inclinedTop.ts` (§K1) gives exact inclined-plane solves + inscribed
  tier emission; `HeightDatum.ts` (ADR-0377) types the datum question; refusal-first doctrine
  (typed refusals, never-overstate, partial-over-blank) is contract-level
  (C58/C63-family + the never-overstate gate).
- **Gap-master already ranks NSW**: `docs/01-strategy/envelope-gap-master/region-beyond-europe.md`
  — "NO COVERAGE YET (undrawn); HOB + FSR served as data; consume-the-served-parameters is the
  highest-leverage next step in the region."
- **What the sweep did NOT know and Phase 0 now establishes** (details in PHASE0-REPORT):
  the ~190-layer Local Provisions long tail serves **CADID + LEGIS_REF_CLAUSE + LEGIS_REF_VALUE
  on 198/199 layers**; the Building Setback Map's renderer classes really are literal metres
  (5/10/`Building Setback`); Floor Height Restriction classes really are absolute levels
  (40.6…78.1); Building Height Plane really is classes A–E. The founder's §4 layer IDs matched
  the live service **exactly** (every cited id present under group 590).

## 2 — Convergences (the prompt lands on machinery we already have)

| Prompt § | Founder requirement | Shipped counterpart | Fit |
|---|---|---|---|
| §5 | BASE / CONDITIONAL / OVERRIDE / CAP; never min(); conditional uplift NEVER silently applied; unresolvable conflict = status D | The never-overstate doctrine + conditional-refusal pattern (refusing-half-needs-its-escape-hatch, L-616 "UNKNOWN drawn as zero/unbounded = overstatement") | **Doctrine-identical.** What's missing is the *engine*: no precedence classifier exists for multi-instrument stacks. Today's packs assume one governing control per parameter. |
| §1.3 "never take the minimum" | — | ⚠ Our multi-rule packs DO intersect constraints (hard_caps ∩). That is correct for CAPs, and wrong for BASE-vs-BASE — the founder's distinction. The precedence engine must be a NEW stage BEFORE constraint intersection, not a tweak inside it. | **Partial** |
| §6 | `m` vs `m(RL)` vs `NA` as distinct types | `HeightDatum.ts` (ADR-0377): `absolute-national` member with `comparableToRelativeHeight: false`; `unknown` refuses; consumers refuse on unknown — the EXACT m(RL) discipline, already minted for Paris NGF / DE NHN / EE EH2000 | **Seat exists; ONE gap:** `AbsoluteVerticalFrameSchema = z.enum(['NGF','NHN','EH2000'])` — **AHD is not a member**. Append `'AHD'` (append-only + ADR per the file's own discipline) and `MAX_B_H_RL` / Floor Height Restriction values seat cleanly. `NA` maps to the existing typed-refusal path. |
| §8 | `plane(origin_line, angle, height_at_origin)` → half-space; shared solver, not NSW adapter | `packages/site-parcel-data/src/geometry/inclinedTop.ts` (§K1): `InclinedPlaneSpec {anchorA, anchorB, baseHeight_m, slopePerMeter}` → exact ∫∫ solve + inscribed tiers; explicitly "caller resolves ordinance → planes; this module knows nothing about rule kinds" | **The shared primitive the founder demands ALREADY EXISTS** and is line-anchored exactly as §8 specifies. What NSW adds on top: (a) **class→parameters resolution** (Height Plane classes A–E → angle/origin per clause — the one-time signed extraction), (b) sun-plane time-window geometry (solar altitude at 21 June windows → plane parameters) — a resolver, not a new kernel. Unresolvable class → status C = the existing refusal path. |
| §2 | Measure before building | probe-before-fix / context-data-honesty doctrine (memory family) | Identical — and Phase 0 is now DONE (this lane). |
| §11 | F1 (gap) ≠ F2 (law says none) | "failure vs empty are the SAME VALUE" root-cause family — the exact defect class the taxonomy prevents | Identical doctrine; needs the A–F2 vocabulary minted as a typed enum in the NSW pack. |
| §10 | 10.7 certificates + DA/CDC feeds as CI oracles | The never-overstate gate pattern (drive real corpus through the engine, count silent losses) | Same shape; new data sources. |
| §3 | GDA94 EPSG:4283 | `auStateCadastre.ts` CRS-honesty guard; GDA94≈WGS84 at BIM scale (same treatment as GDA2020 in VIC leg) | Fine. |
| §7 | Terrain = existing ground level; ELVIS LiDAR; per-city datum lift | `terrain.mjs` datum rule (L-584/C12 §1.4); AHD (EPSG:5711) + AUSGeoid2020 per-city constants already recorded (au-sweep §9.2; NSW lift +22.36 m per gap-master) | Channel known; the ELVIS **licence verify** is an owed read (the founder flags it too). |

## 3 — The gaps (what does NOT exist), ranked build list

1. **The precedence engine (§5) — the product.** No shipped machinery classifies competing
   controls by legal role (BASE/CONDITIONAL/OVERRIDE/CAP) from `LEGIS_REF_CLAUSE`. This is a new
   stage: collect → resolve clause → classify → emit base + unapplied uplifts + caps. M3
   (measured this session) says how often it fires — see PHASE0-REPORT §M3: multi-layer vertical
   stacks are real but minoritarian; single-BASE parcels dominate, so the engine's common path is
   cheap and the classifier earns its keep on the CBD/centre minority.
2. **The Planning_Portal consumer** (§12 step 3): typed HOB/FSR/Lot Size/Zoning readers with
   units typing (§6) + `LEGIS_REF_CLAUSE` threading into provenance. Near-pure consume — same
   class as the SA TNV pack the gap-master already ranks "days".
3. **`'AHD'` frame member** on `AbsoluteVerticalFrameSchema` + m(RL) fixtures (§13). Small,
   ADR-gated, append-only.
4. **DIRECT Local Provisions consumers** (431 setbacks — literal metres in `LAY_CLASS`;
   496 landscape %; lot-size/density family). Uses existing setback-inset + coverage machinery.
5. **Class→parameter clause extraction registry** (Height Plane A–E, Sun Plane windows,
   469 absolute levels) feeding `inclinedTopToTiers` / absolute caps — signed, stored, versioned
   (§8). Refusal C for unresolved classes.
6. **SEPP overlay resolution** (§12 step 6) — M1 measured the SEPP service: 288 feature layers,
   63 with CADID; the Precincts SEPPs carry their own HOB/FSR/**Reduced Level** layers that
   OVERRIDE LEP values — the "LEP-only engine is wrong" case is concrete and probed.
7. **CADID key-join** — per M2 (PHASE0-REPORT §M2): fill is high on the biggest DIRECT layers,
   so the key join is viable as the primary strategy with spatial intersection as the fallback —
   but see the M2 caveats (a CADID names A cadastral object, and parcels split by a control
   polygon still need geometry).
8. **as_of_date via ePlanningHistoric** + `returnUpdates=true` change detection (§12 step 8).
9. **Validation harness** (10.7 certs + DA/CDC feeds) (§10).
10. **Council digital DCPs** (City of Sydney FeatureServer, Newcastle, Port Stephens) — §9A/B;
    per-provision effective dates (Randwick warning).
11. **Data broker email** (day one, §3) — zero-cost unlock of uncapped shapefile packages;
    FOUNDER-channel action.

## 4 — Verdict (one page)

**The prompt is buildable on the shipped stack, and it is mostly a CONSUMER + a CLASSIFIER, not
a new kernel.** The three hard primitives it demands — inclined-plane half-space solver (§8),
absolute-vs-relative height typing (§6), typed refusal vocabulary (§11) — all exist in the repo
today (`inclinedTop.ts`, `HeightDatum.ts`, the refusal doctrine), each needing only a small,
already-disciplined extension (class→parameter resolver; `'AHD'` frame member; A–F2 enum). The
parcel leg and server proxy exist. The genuinely NEW build is the **§5 precedence engine**, and
that is exactly what the founder says the product is.

Phase 0 (run live this session, full numbers in `phase0-transcripts/PHASE0-REPORT.md`):
- **M1**: the ">80% machine-readable" estimate is REPLACED by fact — Local Provisions serves
  CADID + clause + value fields on **198/199** layers; classification counts in the report.
- **M2**: CADID fill is **very high (≈99–100%) on nearly every DIRECT/GEOMETRIC Local
  Provisions layer** → the key join is the primary strategy (with the stated caveats).
- **M3** (reduced, 44 points, CBD-weighted — bias stated): multi-vertical-control parcels are
  concentrated exactly where the founder said (CBD/centres); distribution in the report; the
  full 2,000-parcel census is specced there.

Two honest cautions. (1) The sweep's coverage finding stands: suburban points can carry zoning
with NO HOB/FSR polygon — F1-vs-F2 discipline is needed from day one, not later. (2) Two rival
service families (`Planning/EPI_*` vs `ePlanning/Planning_Portal_*`) serve the same principal
controls; pick the Portal family (it alone has the Local Provisions + SEPP siblings) and record
the decision, or two future lanes will probe two different truths.
