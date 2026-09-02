# LANE K1 — THE TWO KERNEL PRIMITIVES: polygon difference A∖B (holes first-class) + piecewise-planar inclined tops

**Date:** 2026-09-02 · **Subject:** VALIDATION-MATRIX §A (the two genuinely-required kernel
additions; IMPLEMENT-NOW #2) + lane-b-graph-kernel-oss.md Q2 §2.5 gap list items (1)(2)(3) ·
**Disposition:** BOTH SHIPPED, oracle-pinned, direction-of-error stated and falsified ·
**Commit:** none (per lane brief — orchestrator owns the commit).

## What was built (both in `packages/site-parcel-data/src/geometry/` — the envelope kernel)

### 1. §K1-POLY-DIFFERENCE — `polygonDifference.ts`

The kernel boolean's own header said it: *"DIFFERENCE (A \ B) IS NOT DELIVERED. It falls out of
this body with a third keep-rule and a reversal of B's kept sub-edges … Do not add it without the
same oracle table the two delivered ops carry."* This module is that third keep-rule, delivered
WITH the oracle table. Same arrangement + midpoint-classification + shared-edges-by-endpoint-
identity architecture as §C73-POLY-BOOLEAN (every predicate body imported from the kernel — zero
new epsilons, zero new predicate families); the difference keep-rule:

- A-edge shared same-direction → drop · shared opposite-direction → keep from A
- A-edge unshared → keep iff midpoint OUTSIDE B
- B-edge unshared → keep REVERSED iff midpoint INSIDE A (a strictly-interior subtrahend chains
  into a NEGATIVE loop — **holes are first-class in the result**, returned as `{outer, holes}`
  parts, the shape `explicitArea.ts` §MULTI-PART already speaks)

**Direction-of-error contract (the lane-B §2.2 sentence, written and enforced):** three regimes —
(1) exact to float away from the COINCIDENT_M band, with the kernel's symmetric resolution bound
COINCIDENT_M × (P_A+P_B)/2 pinned by a differential arm; (2) unresolvable topology → TYPED
REFUSAL, never a repaired ring; (3) representation-forced error (a hole a single ring cannot
carry) → `carveHolesToSimpleRings` bridges the hole to the boundary through a
`CARVE_SLIT_WIDTH_M` (4 × COINCIDENT_M = 4 mm) slit whose corridor is **SUBTRACTED** — every
departure from the exact difference LOSES area (the L-581 inward-bias doctrine applied to
booleans), the loss reported in `slitAreaLostM2` and guarded in-op (a bridged answer larger than
the exact one refuses rather than over-grant).

**Oracle table** (`__tests__/polygonDifference.test.ts`, 28 tests, 4 independent arms):
hand-computed case table (disjoint / identical / contained / corner / notch / splitter / annulus /
BOTH collinear-shared-edge orientations / hole-touching-boundary / concave-U / winding
independence / typed refusals) · independent half-plane oracle (convex subtrahends decomposed into
disjoint `A ∩ H₁…H_{i−1} ∩ ¬H_i` pieces by an in-test S-H clipper sharing no code, 60-trial seeded
concave×convex corpus, ≥45 compared) · the partition identity |A| = |A∩B| + |A∖B| against the
kernel's PROVEN intersection (hand fixtures + 80-trial concave×concave corpus ≥60 resolved +
near-tolerance sliver) · a 40×40 grid point-membership oracle (>1,000 points per fixture,
boundary band excluded) · §K1-CARVE bias contract (never gains; loses exactly the slit; no carved
point inside a hole on a 60×60 grid; boundary-reaching holes exact with zero slit; splitting holes
→ both pieces; two sequential courtyards; malformed hole → typed refusal).

### 2. §K1-INCLINED-TOP — `inclinedTop.ts`

`h(p) = max(0, min(flatCap, min_i plane_i(p)))` over an envelope footprint — the five-country
construction (DK *det skrå højdegrænseplan* 1.4×d · DE §6 0.4×H · Paris couronnement · ES
coronación · NL dakhelling). **Representation stays 2.5D; no 3D CSG** (matrix §D honoured).

- **The caller passes RESOLVED plane specs** (`InclinedPlaneSpec`: origin line, base height at the
  line, slope per metre of signed distance) — no rule kind is invented here; the kinds belong to
  the parallel SEATS lane's schema seats, exactly as the brief ordered.
- `solveInclinedTop` — the LEGAL numbers, EXACT: the lower envelope of affine planes decomposes
  the footprint into per-plane cells (every `{h_i ≤ h_j}` is a half-plane), and ∫∫ affine dA has
  a closed form (shoelace first moments). Float-only error, no discretisation term.
- `inclinedTopToTiers` — the DRAWN solid, emitted as **`EnvelopeTier` slices the existing render
  path consumes unchanged** (`envelopeToMassing` draws one prism per tier — the seam the brief
  named, no new render path, `packages/schemas` untouched). Slice k carries {p : h(p) ≥ top_k} —
  INSCRIBED by construction: the terraced stack UNDER-states, never overstates, and converges to
  the exact volume from below (asserted at 8/32/64-nested slices… measured 8→32→128).
- `planesFromBoundaryEdges` — the common DK/DE construction (one plane per boundary edge,
  interior-positive), with its exactness class stated: exact on convex boundaries, UNDER-stating
  on concave ones (the permitted direction), never hidden.

**Oracle table** (`__tests__/inclinedTop.test.ts`, 14 tests): the DK fixture — 20 × 30 m
footprint, slope 1.4 from all four boundaries, 8.5 m cap — against the closed form DERIVED IN THE
TEST: capped-tent volume `V = s·[W²(3L−W) − W′²(3L′−W′)]/12` (W′ = W−2H/s) = **2,937.4149659864 m³**,
matched to 1e-6; the uncapped tent `s·W²(3L−W)/12 = 3,266.667 m³` with the 14 m ridge; an
independent Riemann grid double-pin (1 %); a DE-shaped single-plane wedge (h ≤ 2.5·d → exactly
2,500 m³); pointwise field values; tier inscribedness per-vertex (`h(v) ≥ tier top`), stack ≤
exact, monotone slice areas, below-convergence; typed refusals (`no-vertical-limit`,
`invalid-plane`, `degenerate-footprint`, `invalid-footprint-geometry`) and the below-ground plane
granting ZERO volume, never negative credit.

## The first consumer wired — the NL courtyard exact carve (upgrade of L-12896's interim refusal)

`explicitArea.ts` `solveExplicitArea`: the hole-bites branch no longer refuses. Holes PROVEN to
bite (the existing exact hole ∩ parcel test, unchanged) are now **carved exactly** from the
clipped regions via `carveHolesToSimpleRings`; `hole-intersects-parcel` survives **only as the
fallback** for the carve's own refusal cases (unprovable bite, malformed hole, unresolvable
topology) — exactly the shape the brief ordered. The ok-result gains `holesCarved` +
`carveSlitAreaM2` (the reported inward bias); a part with a carved hole never claims
`footprintCoversParcel`. `ZoningRulesEngine.ts` UNTOUCHED — its ok-branch consumes the carved
ring as-is and its refusal branch remains the fallback text.

On the NL courtyard fixture (100×100 outer − 30×30 courtyard, parcel containing both): the carve
yields **9,099.86 m²** against the 9,100 m² honest ceiling — the 0.14 m² short-fall is the 4 mm ×
~35 m bridge slit, inward-only, reported. `nlBouwvlakHoles.test.ts` ARM B flipped from
refusal-accepting to carve-exact (`ok` + area ∈ [9,099, 9,100]); the
`explicitAreaMultiPart.test.ts` §HOLES-DECIDED-ON-PARCEL biting case flipped from
`hole-intersects-parcel` to the exact 5,500 m² carve (6,400 clip − 900 hole), with
`areaM2 + carveSlitAreaM2 = 5,500` to 1e-6.

## The gate-arm flip

`tools/ga-gate/check-envelope-never-overstates.ts` section 2b (the arm the NL-holes lane wrote to
accept a future carve): now **REQUIRES** the carve — the overstate finding is kept verbatim
(area > 9,100 + ε still mints the L-616 finding), and a refusal or an under-carve beyond the 1 m²
slit budget reads **UNPROVEN** (exit 2, `checkerBlind`) as a regression from the shipped
behaviour, not silently re-accepted. The arm's pre-fix outer-only teeth are unchanged.

## Acceptance evidence (executed)

- Baseline (BEFORE any change): full `packages/site-parcel-data` suite `npx vitest run` →
  **172 files passed · 3,749 passed | 3 skipped**, RC=0. Never-overstate gate →
  `[never-overstate] OK: 0 overstatement(s) across 182 zone-solve(s) in 6 jurisdiction(s) +
  estimated-default + the planted self-test pack.` **RC=0**.
- `polygonDifference.test.ts` → **28/28** · `inclinedTop.test.ts` → **14/14** ·
  `explicitAreaMultiPart.test.ts` → **23/23** (all three run 2026-09-02 on the working tree).
- **AFTER (real tree, once the parallel SEATS lane's registry landed):**
  - Full suite `npx vitest run` → **178 files passed · 3,833 passed | 3 skipped**, RC=0
    (the +6 files over baseline: this lane's 2 new oracle suites + the SEATS lane's 4).
  - Flipped gate `npx tsx tools/ga-gate/check-envelope-never-overstates.ts` → **RC=0**, terminal
    line verbatim: `[never-overstate] OK: 0 overstatement(s) across 189 zone-solve(s) in 6
    jurisdiction(s) + estimated-default + the recorded live-route arms (Paris · Denmark · Madrid
    NZ-1) + the planted self-test pack.` (182 → 189 is lane G1's live-route arms landing in the
    same file; the 2b courtyard arm SOLVED under the flipped carve-required expectation — a
    refusal or a >1 m² under-carve would have exited 2.)
  - `nlBouwvlakHoles.test.ts` → **6/6** with ARM B now REQUIRING the carve.
  - Scoped tsc (`packages/site-parcel-data`) → **RC=0** · root tsc
    (`NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.json --noEmit`) → **RC=0, 0
    errors**. (A plain `npx tsc` at root exits 134 — v8 OOM — the memory-hungry-build note in
    CLAUDE.md applies to root tsc too; the 6 GB heap is required, not optional.)
- **The exact NL carve, probed through `solveExplicitArea` on the shipped tree:**
  `{"areaM2":9099.86,"holesCarved":1,"carveSlitAreaM2":0.13999999999941792,"ringVerts":12}` —
  9,099.86 + 0.14 = **9,100.00 m² exactly** (the 0.14 m² is the 35 m corridor × 4 mm slit,
  inward-only, reported).

## The two falsifications (executed, restored byte-identical)

1. **Bias direction flipped** (scratch patch of `polygonDifference.ts`: the carve subtracted a
   2 %-shrunken hole — removes LESS than the published exclusion — and the in-op over-grant guard
   disabled, i.e. both halves of the bias inverted). Result — the under-coverage assertions went
   red NAMING THE GAINED AREA:
   - `AssertionError: carve GAINED 35.498800 m² over the exact 9100 m² — the forbidden direction
     (C58 §1.4 / L-616): expected 35.49879999999939 to be less than or equal to 1e-9`
   - `AssertionError: two-hole carve GAINED 51.158000 m²: expected 51.15799999999945 to be less
     than or equal to 1e-9`
   - consumer level: `expected 5535.5588000000025 to be less than or equal to 5500.000001`
   (3 failed | 48 passed across the two files.) Restored: sha256
   `065d8c0b14feafe058458aa226b3df685bd72f3ccfb87f892e45481a49c487c5` **identical before and
   after**; 28/28 green again.
2. **Plane evaluation severed** (scratch patch of `inclinedTop.ts`: plane candidates dropped
   after validation — the field falls back to the flat cap). Result — the volume assertion named
   the excess exactly as designed:
   - `AssertionError: inclined-top volume 5100.000 m³ deviates from the closed form 2937.415 m³
     by 2162.585 m³ (a positive delta is OVERSTATED volume; the flat-cap fallback would overstate
     by +2162.585 m³)`
   (5 failed | 9 passed — the tier-inscribed per-vertex arm also went red naming the poke-out.)
   Restored: sha256 `a7a87ab9bb18ca950e532f22ecff4ef8c165bd879eb4edd43ec6d45ad1956f89`
   **identical before and after**; 14/14 green again.

## Shared-tree note (multi-agent collision doctrine honoured)

Two parallel lanes were landing in the same tree during this lane's run: the SEATS lane
(`packages/schemas` + `ZoningRulesEngine.ts` → `GEOMETRIC_RULE_KIND_REGISTRY`, mid-flight and
transiently breaking every engine-path test with a TypeError at `ZoningRulesEngine.ts:1155` —
verified NOT this lane's doing: the symbol existed nowhere in `packages/schemas` at the time) and
lane G1 (adding live-route arms 2c/2d/2e to the same never-overstate gate this lane's 2b flip
lives in — both edits applied cleanly side by side). This lane touched NONE of their files beyond
the 2b block and the two append-only `index.ts` export blocks. While waiting for the SEATS
registry, the engine-path claim was pre-proven in ISOLATION with a scratchpad-only vitest alias
shim (re-exporting the real schemas + the one missing symbol with the engine comment's stated
semantics): `nlBouwvlakHoles` 6/6 and 177/178 files (the single failing file being the SEATS
lane's own in-flight evaluator test). The registry then landed (`GeometricRule.ts:608`,
star-exported), the shim was retired, and every AFTER number above is from the REAL tree.

## Scope discipline

`packages/schemas/**` untouched (tiers are emitted as existing `EnvelopeTier` objects; plane
specs are a kernel API, not a rule kind) · `apps/editor` untouched · `ZoningRulesEngine.ts`
untouched (the carve lands entirely inside `solveExplicitArea`, whose ok/refusal contract the
engine already consumes; no tier-top engine seam was needed — the SEATS lane's kinds will call
`solveInclinedTop`/`inclinedTopToTiers` through the package exports) · no new render path · no
3D CSG · no third-party geometry dependency.

## Files touched

- `packages/site-parcel-data/src/geometry/polygonDifference.ts` — NEW: §K1-POLY-DIFFERENCE.
- `packages/site-parcel-data/src/geometry/inclinedTop.ts` — NEW: §K1-INCLINED-TOP.
- `packages/site-parcel-data/src/geometry/explicitArea.ts` — §K1-CARVE: hole-bites branch carves
  exactly; refusal doc + ok-result fields (`holesCarved`, `carveSlitAreaM2`).
- `packages/site-parcel-data/src/index.ts` — two append-only export blocks (the kernel API seam).
- `packages/site-parcel-data/__tests__/polygonDifference.test.ts` — NEW: the oracle table.
- `packages/site-parcel-data/__tests__/inclinedTop.test.ts` — NEW: the closed-form + tier table.
- `packages/site-parcel-data/__tests__/explicitAreaMultiPart.test.ts` — biting-hole case flipped
  refusal → exact carve.
- `packages/site-parcel-data/__tests__/nlBouwvlakHoles.test.ts` — ARM B flipped to carve-exact;
  header updated.
- `tools/ga-gate/check-envelope-never-overstates.ts` — section 2b flipped to REQUIRE the carve
  (finding kept for overstate; refusal/under-carve → UNPROVEN).

## Residuals (named)

1. The bridge slit is a REPRESENTATION cost (single-ring envelope). If `BuildableEnvelope` ever
   grows a multi-ring footprint (frozen-schema decision, not this lane's), the carve's exact
   `{outer, holes}` parts are already computed and the bridge simply stops being called.
2. `inclinedTopToTiers` on a CONCAVE footprint can emit slice rings with zero-width S-H bridge
   edges where a slice is disconnected — area/volume-neutral, stated in the module; a
   multi-part-aware tier splitter is a follow-up if a concave consumer materialises.
3. `planesFromBoundaryEdges` understates on concave boundaries (stated in its doc) — exact
   per-edge nearest-segment planes for concave parcels ride the SEATS lane's rule resolution.
4. The inclined-top engine seam (a rule kind → `solveInclinedTop` call inside the envelope
   pipeline) is deliberately NOT built here — the kinds are the SEATS lane's; the kernel API is
   exported and waiting.
