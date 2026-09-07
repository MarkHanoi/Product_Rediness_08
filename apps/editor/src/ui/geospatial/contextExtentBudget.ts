// contextExtentBudget.ts — §CTX-EXTENT-BUDGET (L-13058, founder 2026-09-06: "ON PROJECT START-UP —
// AND ALWAYS ON 3D SITE VIEW — TRY TO EXTEND THE RADIUS / DIAMETER TO DOUBLE SCOPE — JUST WANT TO
// TEST IF PERFORMANCE IS GOOD — I WOULD LIKE TO HAVE MORE EXTENT — STILL KEEPING MAXIMUM SPEED AND
// PERFORMANCE.")
//
// ⭐ THE ONE PLACE EVERY 3D-SITE CONTEXT RADIUS AND CAP IS TUNED. Before this file there were nine
// of them in five modules, and the founder could not experiment without a code search. Every
// downstream constant (`CONTEXT_BBOX_FAR_HALF_DEG`, `CONTEXT_TOTAL_MAX_BUILDINGS`,
// `STREET_LIFE_MAX_PEOPLE`, …) keeps its existing exported NAME and now DERIVES from a row here, so
// no call site or test moved and there is still exactly one number per fact.
//
// ⛔ LEAF MODULE — IT IMPORTS NOTHING, BY DESIGN. `contextBuildings`, `contextExtents`,
// `contextTiles`, `contextStreetLife*`, `contextCanopySynth` and `CesiumViewport` all read it, and
// several of those already import each other. A leaf cannot close a cycle (memory
// `scc-no-barrel-access-at-module-load`: a circular barrel resolves to `undefined` at module load
// and white-screens the app). Keep it that way — numbers only, no types from siblings.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ⛔ THE RULE THAT DECIDES EVERY ROW: EVERY TIER IS NEAREST-FIRST, **THEN** CAPPED.
//
// So where the CAP binds, raising the RADIUS changes NOTHING — the nearest N are the same N. And
// where the RADIUS binds, raising the cap changes nothing. "Double the scope" is therefore a
// DIFFERENT edit per layer, and a blanket radius multiply would have shipped almost no visible
// change. The founder's own console (L-13058), read against that rule:
//
//   layer                              radius     cap           available    BOUND BY
//   ────────────────────────────────────────────────────────────────────────────────────────────
//   near shadow ring                   600 m      1600          5440 kept    CAP  (expensive)
//   far footprint READ                 1225 m     900           9902         CAP  ← 9,002 DROPPED
//   far instanced tier                 1225 m     4000          1509 drawn   its INPUT (above)
//   trees                              891 m      1500          2462 baked   CAP
//   street-life people                 890 m      800           3844         CAP  ← 3,044 dropped
//   street-life lamps                  890 m      1200          1018         RADIUS + spacing
//
// ⭐ THE ONE CORRECTION TO L-13058, AND IT IS THE WHOLE HEADLINE. That row read the far tier as
// RADIUS-bound because 1509 drawn sat under a 4000 instance cap. It is not. The instance cap was
// not biting because its INPUT had already been cut from 9,902 to 900 by
// `CONTEXT_TOTAL_MAX_BUILDINGS = 6000`: the near ring spent 5,440 of the 6,000-footprint whole-scene
// budget, `resolveFarRingCap` returned the 900 FLOOR, and 9,002 already-downloaded footprints were
// thrown away. The far tier is CAP-bound, harder than any other layer in the scene — and the
// footprints it was discarding were already fetched, already parsed, and already in memory.
//
// ⚠ AND THE LOG SAID `(cap 900)` WHILE THE EFFECTIVE CAP WAS ALSO 900 BY COINCIDENCE — it printed
// the FLOOR parameter, not the resolved budget, which is exactly how this got read as radius-bound.
// Both call sites now print the EFFECTIVE cap and the number dropped (see `contextBuildings.ts`).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE COST MODEL, WHICH IS WHAT MAKES THESE NUMBERS CHOOSABLE RATHER THAN GUESSED:
//
//   CHEAP — instanced tiers. Trees are ONE shadowless shared-material primitive, street life TWO,
//     the far building tier ONE. Adding instances to an existing primitive adds vertices to a
//     buffer that is combined off-thread (`asynchronous: true`) and drawn in ONE call. 8,000
//     extruded low-poly footprints is ~0.5 M flat-shaded triangles with no shadow pass — small.
//
//   CHEAP — ground sampling, PROVIDED the coalescer is not broken. §GROUND-SAMPLE-TILE-ATTRIBUTION
//     (L-12952) proved the round-trip is billed in TERRAIN TILES, not points: Cesium's `doSampling`
//     issues ONE `requestTileGeometry` per DISTINCT tile and interpolates every point inside it for
//     free. The founder's run resolved 9,397 heights in ONE flight. So MORE FEATURES IN THE SAME
//     BBOX COST NOTHING, and a modestly wider bbox costs a handful of extra tiles at level ~14
//     (0.011° → 0.016° is roughly 4 → 9 tiles) — which `landuse` at `CONTEXT_WIDE_HALF_DEG`
//     (0.072°, ~8 km) has usually already downloaded into the shared cache anyway.
//     ⛔ `GroundSampleBatcher` serialises flights with a FIFO mutex, so nothing here can add a
//     second concurrent flight — `maxConcurrentFlights` MUST stay 1 and this file cannot move it.
//
//   EXPENSIVE — the 600 m SHADOW-CASTING ring. Shadow casters are the costliest tier by
//     construction; that is why they are separately capped at 1,600 and everything else is
//     "demoted to shadowless". ⛔ NOT RAISED HERE. Not one metre, not one caster.
//
//   EXPENSIVE — the tile READ, because it is O(AREA) at a fixed zoom. This is the constraint that
//     stopped a literal 2× radius, and it deserves to be stated plainly: the buildings read is what
//     the first paint gates on, and doubling its radius QUADRUPLES it (Barcelona 36 → 144 z16 range
//     requests, ~9,900 → ~40,000 footprints parsed on the main thread). The alternative — letting
//     `zoomForExtent` step the read down to z15 — is WORSE THAN IT LOOKS: the bake runs
//     `tippecanoe -Z12 -z16 --drop-densest-as-needed`, so below z16 dense cores lose geometry
//     detail AND LOSE WHOLE FOOTPRINTS. That is the L-579 "many buildings are not rendering"
//     defect, re-introduced silently, in exchange for distant blocks. Refused.
//
// ⭐ SO THE SHAPE IS: raise the CAPS generously (they bound the cheap, already-downloaded,
// instanced, shadowless half), raise the far RADIUS to the largest value that keeps the read at
// z16 inside a defensible fan-out, and DO NOT TOUCH THE SHADOW RING. Most of the extra context the
// founder will see comes from the caps, not the radius — because the scene was already throwing
// away 9,002 of 9,902 footprints it had in hand.
//
// P8 — stated plainly rather than claimed: the exported helpers here carry NO OTel span, matching
// every pure sibling in this directory (contextCanopySynth, contextStreetLife, contextExtents,
// groundFeatureSeat all export pure functions with no tracer). They are per-feature arithmetic on
// the render hot path — `farTierRadiusM` is called inside a filter over thousands of footprints —
// so a span per call would be a measurable cost in a lane whose entire subject is frame budget.
// Instrumentation belongs on the LOADERS that call them, which already have it (CesiumViewport,
// contextLayerWarm, groundSampleBatcher).

// ── THE SCOPE ─ ONE value every radial limit derives from ───────────────────────────────────

/**
 * ⭐ §CTX-SITE-SCOPE (L-13058 × L-645) — THE SINGLE RADIAL INPUT FOR THE WHOLE 3D-SITE CONTEXT LOAD.
 *
 * Before this type there were FIVE independent radial literals (near shadow ring, near solid tier,
 * far tier, trees, street life) plus two bbox half-extents, and "make the view bigger" meant editing
 * five numbers that were free to drift apart. They are now all `f(scope)`: ONE value moves, every
 * layer follows, and the per-layer CAPS stay as the performance bound. That is what makes a
 * user-driven scope slider (L-645, the cityweft-style floating slab) a UI change rather than a
 * seventh copy of the same arithmetic.
 *
 * ⚠ THIS TYPE DOES NOT CROP ANYTHING. It says how far the context LOADS and RENDERS. Clipping the
 * scene to a hard-edged slab — the visible "floating disc/rectangle" — is a separate mechanism and a
 * separate lane (SCOPE-SLAB); §CTX-EARTH-SLAB (L-645) records why the previous attempt failed
 * (`scene.globe.clippingPolygons` can only clip the GLOBE SURFACE, and the visible outside terrain
 * in Forma is a stack of flat ENTITY polygons a globe clip provably cannot touch). Nothing here
 * assumes that problem is solved.
 *
 * `rectangle` carries half-extents rather than a radius because the founder asked for "circular OR
 * rectangular". Every radial limit below reduces it to its CIRCUMSCRIBING radius, so a rectangular
 * scope LOADS a superset of what it will show — which is the only safe direction: a shape that
 * loads less than it draws has holes, and a shape that loads more just spends cache.
 */
export interface SiteContextScope {
    readonly shape: 'circle' | 'rectangle';
    /** Circle only — the disc radius in metres. */
    readonly radiusM?: number;
    /** Rectangle only — half-extents in metres (E–W, N–S). */
    readonly halfWidthM?: number;
    readonly halfDepthM?: number;
}

/** Metres per degree of latitude — the SAME literal the render radii already used, so nothing shifts. */
export const METRES_PER_DEG_LAT = 111_320;

/**
 * ⛔ THE SLIDER'S RANGE, AND IT IS MEASURED, NOT TASTE.
 *
 * MAX 1781 m = 0.016°, the largest extent whose buildings tile read still fits z16 inside
 * `CTX_BUILDINGS_MAX_TILES_PER_FETCH` in every one of the founder's test cities (Barcelona/Madrid
 * 81 tiles, Córdoba/Lisbon 72, against a 112 cap). Past it `zoomForExtent` steps the read to z15,
 * and because the bake runs `--drop-densest-as-needed` that does not coarsen dense cores, IT DELETES
 * FOOTPRINTS from them — the L-579 "many buildings are not rendering" defect arriving through a zoom
 * step nobody asked for. So the ceiling is where the DATA stops being complete, not where the frame
 * rate is guessed to fall over.
 *
 * MIN 150 m so the slab can be tight around a plot without the scene emptying to nothing.
 *
 * ⚠ RAISING THE MAX IS NOT A ONE-LINE CHANGE. It requires re-measuring the tile fan-out (see
 * `CTX_BUILDINGS_MAX_TILES_PER_FETCH`) and accepting a read that grows with the AREA — 2× the radius
 * is 4× the first-paint read on the layer the reveal gates on.
 */
export const CTX_SCOPE_MIN_RADIUS_M = 150;
export const CTX_SCOPE_MAX_RADIUS_M = 1781;

/**
 * §CTX-EXTENT-BUDGET — the shipped default scope: a **1781 m** disc, up from the 1225 m the far tier
 * effectively had before this lane (+45 % radius, ×2.1 area). This is the number the founder's
 * "double scope" ask lands on; `CTX_FAR_HALF_DEG` below records why it is 0.016° and not the literal
 * 2× (0.022°), with the per-city tile arithmetic that decided it.
 */
export const DEFAULT_SITE_CONTEXT_SCOPE: SiteContextScope = { shape: 'circle', radiusM: 1781 };

/**
 * The scope's CIRCUMSCRIBING radius in metres, clamped to the measured slider range. PURE.
 *
 * Every per-layer radius below is a function of THIS — which is the property that makes the five
 * old literals impossible to reintroduce: there is one place to change and one place to test.
 * A malformed scope falls back to the default rather than to 0; "no scope" must never render as
 * "no context", which is the §CONTEXT-DATA-HONESTY failure shape.
 */
export function scopeOuterRadiusM(scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE): number {
    let r: number;
    if (scope?.shape === 'rectangle') {
        const w = Number.isFinite(scope.halfWidthM) ? (scope.halfWidthM as number) : NaN;
        const d = Number.isFinite(scope.halfDepthM) ? (scope.halfDepthM as number) : NaN;
        r = (Number.isFinite(w) && Number.isFinite(d)) ? Math.hypot(w, d) : NaN;
    } else {
        r = Number.isFinite(scope?.radiusM) ? (scope.radiusM as number) : NaN;
    }
    if (!Number.isFinite(r) || r <= 0) r = DEFAULT_SITE_CONTEXT_SCOPE.radiusM as number;
    return Math.min(CTX_SCOPE_MAX_RADIUS_M, Math.max(CTX_SCOPE_MIN_RADIUS_M, r));
}

// ── per-layer radii ─ each is f(scope), and the DIFFERENCES between them are the whole design ──

/**
 * ⛔ CEILING ON THE SHADOW-CASTING RING — 600 m, AND IT DOES NOT RISE WITH THE SCOPE.
 *
 * Two independent reasons, either decisive on its own:
 *   1. IT IS NOT A TASTE VALUE. It is Cesium's own shadow-map `maximumDistance` (`CesiumViewport.ts`
 *      §FORMA-GRAZING-BANDING-FIX, `sm.maximumDistance = 600`). Beyond it Cesium does not render the
 *      shadow AT ALL, so a caster out there pays the full cost and contributes nothing visible.
 *      Raising this alone buys pure waste; raising both buys a bigger shadow map. Either way it is a
 *      SHADOW change, not an EXTENT change, and it belongs to a different decision.
 *   2. Shadow casters are the most expensive tier in the scene by construction, which is why
 *      everything past them is "demoted to shadowless". The founder's constraint was explicit:
 *      more extent, "still keeping maximum speed and performance". Extent is bought in the
 *      instanced shadowless tier or it is not bought.
 *
 * ⚠ COUPLED CONSTANT — if `sm.maximumDistance` changes, change this with it.
 */
export const CTX_SHADOW_RADIUS_CEILING_M = 600;

/** Ceiling on the SOLID (per-entity, true-height) near tier — the 0.008° near bbox on-axis. It does
 *  not rise with the scope: these are individual Cesium entities, the second-most expensive thing in
 *  the scene, and 0.008° is also the fetch extent shared with roads/parks/rail/trees/furniture. */
export const CTX_NEAR_SOLID_RADIUS_CEILING_M = 891;

/** Ceiling on the instanced TREE canopies — bbox-bound; see `CTX_TREES_MAX_INSTANCES` for why a
 *  wider tree disc is a follow-up with its own tile arithmetic and not a constant bump. */
export const CTX_TREES_RADIUS_CEILING_M = 891;

/** Ceiling on street life (lamps + people) — bbox-bound on the same shared 0.008° read. */
export const CTX_STREET_LIFE_RADIUS_CEILING_M = 890;

/**
 * ⭐ THE FAR TIER IS THE ONLY LAYER WHOSE RADIUS *IS* THE SCOPE. It is ONE batched, shadowless,
 * single-shared-material primitive combined off-thread — the cheapest geometry in the scene — so it
 * is the one tier that can afford to follow the slider all the way out. Everything else is
 * `min(scope, ceiling)`.
 *
 * ⚠ READ THE `min` IN BOTH DIRECTIONS, because the second one is the point of the whole refactor:
 *   • slider UP   → only this tier grows. The expensive tiers hold at their ceilings.
 *   • slider DOWN → EVERY tier shrinks with it, shadow ring included. A 300 m scope must not still
 *     be drawing 891 m of trees and 890 m of pedestrians outside the slab. Five doubled literals
 *     could never have done that; five `min(scope, ceiling)` functions do it for free.
 */
export function farTierRadiusM(scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE): number {
    return scopeOuterRadiusM(scope);
}
/** The SOLID near tier's radial cull — the founder's "circle, not square". `min(scope, ceiling)`. */
export function nearSolidRadiusM(scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE): number {
    return Math.min(scopeOuterRadiusM(scope), CTX_NEAR_SOLID_RADIUS_CEILING_M);
}
/** The shadow-casting ring. `min(scope, 600)` — it can only ever SHRINK below 600, never grow past. */
export function shadowRadiusM(scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE): number {
    return Math.min(scopeOuterRadiusM(scope), CTX_SHADOW_RADIUS_CEILING_M);
}
/** Instanced tree canopies. `min(scope, ceiling)`. */
export function treesRadiusM(scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE): number {
    return Math.min(scopeOuterRadiusM(scope), CTX_TREES_RADIUS_CEILING_M);
}
/** Street lamps + pedestrians. `min(scope, ceiling)`. */
export function streetLifeRadiusM(scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE): number {
    return Math.min(scopeOuterRadiusM(scope), CTX_STREET_LIFE_RADIUS_CEILING_M);
}

/**
 * The FAR FETCH half-extent (degrees of latitude) the scope needs — the bbox that must cover the far
 * tier's disc. Never narrower than the near read, because near is selected out of the same single
 * fetch (§PERF-CTX-SINGLE-FETCH) and a far box inside the near box would partition to nothing.
 */
export function farFetchHalfDeg(scope: SiteContextScope = DEFAULT_SITE_CONTEXT_SCOPE): number {
    return Math.max(CTX_NEAR_HALF_DEG, farTierRadiusM(scope) / METRES_PER_DEG_LAT);
}

// ── fetch half-extents (degrees of latitude) ────────────────────────────────────────────────

/**
 * The NEAR half-extent — the EXPENSIVE tier's own bbox (~891 m on-axis, ~1,259 m at the corners).
 *
 * ⛔ UNCHANGED AT 0.008°, AND IT MUST STAY THAT WAY IN THIS LANE. Widening it does not "add
 * context": it multiplies the number of footprints rendered as INDIVIDUAL Cesium entities with true
 * height (5,440 on the founder's run, of which 1,600 also cast shadows), and it is simultaneously
 * the fetch extent for roads, parks, rail, trees, furniture and canopy — every one of which would
 * grow with it. It is also the bbox the 2D map reads (`SiteBoundaryMap2D` → `fetchContextBuildings`
 * with the default half-extent), so a change here leaves the 3D-Site path entirely and lands on the
 * 2D pane. Extent belongs in the FAR tier, which is instanced and shadowless. That is the whole
 * design of §FEAT-FORMA-CONTEXT-EXTENT-LOD.
 *
 * ⚠ A SHRINKING SCOPE DOES NOT SHRINK THIS. The fetch stays a SUPERSET and the radial culls above do
 * the cropping — the tile read is bbox-cached and shared with six other layers, so narrowing it
 * would buy nothing and would invalidate their cache keys.
 */
export const CTX_NEAR_HALF_DEG = 0.008;

/** §A.21.D54 — the narrow last-resort extent when the primary read comes back EMPTY. Untouched. */
export const CTX_NEAR_FALLBACK_HALF_DEG = 0.005;

/**
 * §CTX-EXTENT-BUDGET — the FAR half-extent AT THE DEFAULT SCOPE: **0.011° → 0.016°** (1,225 m →
 * 1,781 m on-axis). Derived, not typed: `farFetchHalfDeg(DEFAULT_SITE_CONTEXT_SCOPE)`.
 *
 * +45 % RADIUS, ×2.1 AREA — "double the scope" read as area, which is the quantity the founder can
 * actually see and the quantity the cost scales with.
 *
 * ⚠ WHY NOT 0.022° (A LITERAL 2× RADIUS). Measured, not asserted — `tileCountCovering` over the
 * real lattice bbox (`contextFetchBbox`, which grows the box by 0.55 × the 0.001° snap):
 *
 *   half-extent   Barcelona   Madrid   Córdoba   Lisbon      verdict at the buildings cap (112)
 *   ──────────────────────────────────────────────────────────────────────────────────────────
 *   0.011° (was)     36 t      42 t     42 t      36 t       z16 ✔ (the pre-lane behaviour)
 *   0.014°           64 t      64 t     56 t      64 t       z16 ✔ but ZERO margin at the old 64 cap
 *   0.016° (this)    81 t      81 t     72 t      72 t       z16 ✔ with 28 % headroom  ← CHOSEN
 *   0.018°          100 t     100 t     90 t     100 t       z16, 90 % of the cap
 *   0.022° (2× r)   144 t     144 t    132 t     132 t       z16 only at a 4× read of the gating layer
 *
 * At 0.022° the layer that gates first paint pays FOUR TIMES its current network fan-out and parses
 * ~40,000 footprints. The founder asked for more extent *"still keeping maximum speed and
 * performance"*; buying a further 0.006° of radius with a 4× first-paint read fails the second half
 * of his sentence. 0.016° is the largest extent that keeps every one of his test cities on the
 * FULL-DETAIL z16 tiles at a fan-out that is 2.25× today, not 4×.
 *
 * ⚠ HIGH LATITUDE, MEASURED AND PREVIOUSLY UNRECORDED: Mercator tiles get shorter in ground metres
 * as latitude rises, so Oslo already needs 90 tiles and Reykjavík 121 for the OLD 0.011° extent —
 * i.e. those cities have ALWAYS been silently reading buildings at z15, and the comment in
 * `contextTiles.ts` claiming the near path is "byte-for-byte unchanged" at z16 has never been true
 * above ~55°N. This lane does not regress them (they stay at z15 and simply see further); naming it
 * is owed, and it is a separate defect from this one.
 */
export const CTX_FAR_HALF_DEG = farFetchHalfDeg(DEFAULT_SITE_CONTEXT_SCOPE);

/** §FORMA-CTX-WIDE-EXTENT — the land-use ground wash, as a multiple of the near extent. Unchanged:
 *  it is already ~8 km, it is a handful of flat polygons, and it is read at a coarse zoom. */
export const CTX_WIDE_HALF_DEG_MULTIPLE = 9;

/** §FORMA-CTX-SEA-EXTENT — the sea mask, as a multiple of the near extent. Unchanged (~11 km). */
export const CTX_SEA_HALF_DEG_MULTIPLE = 12.5;

// ── the expensive tier — DELIBERATELY NOT RAISED ────────────────────────────────────────────

/**
 * ⛔ THE SHADOW RING, HELD AT 600 m. Two independent reasons, either of which alone is decisive:
 *
 *   1. IT IS NOT A TASTE VALUE — it is Cesium's own shadow-map `maximumDistance`
 *      (`CesiumViewport.ts` §FORMA-GRAZING-BANDING-FIX, `sm.maximumDistance = 600`). Beyond it
 *      Cesium does not render the shadow AT ALL, so a caster out there pays the full cost and
 *      contributes nothing visible. Raising this constant alone would buy pure waste; raising both
 *      would buy a bigger shadow map. Either way it is a shadow change, not an extent change.
 *   2. Shadow casters are the most expensive thing in the scene, and the founder's constraint was
 *      explicit. "More extent" is bought in the shadowless instanced tier or it is not bought.
 *
 * ⚠ COUPLED CONSTANT — if `sm.maximumDistance` ever changes, change this with it.
 */
export const CTX_NEAR_SHADOW_RADIUS_M = 600;

/** ⛔ Backstop on the shadow-casting tier. HELD AT 1600 for the same two reasons. Cap-bound on the
 *  founder's run (1,600 of 5,440 kept) — and that is the cap doing its job, not a limit to lift. */
export const CTX_NEAR_MAX_SHADOW_CASTERS = 1600;

// ── the cheap tiers — this is where the extent is actually bought ────────────────────────────

/**
 * §L-579 — FLOOR on the far ring (never a maximum since L-579). Unchanged at 900: it exists so the
 * far ring can never draw LESS than it did before the whole-scene budget replaced it, and with the
 * budget below it is now dominated in every real scene rather than binding in dense ones.
 */
export const CTX_FAR_MIN_BUILDINGS = 900;

/**
 * §CTX-EXTENT-BUDGET — TOTAL drawn context footprints, near + far: **6000 → 14000.**
 *
 * ⭐ THE SINGLE HIGHEST-VALUE NUMBER IN THIS FILE, AND THE CHEAPEST. On the founder's run the near
 * ring spent 5,440 of the 6,000 budget, so `resolveFarRingCap` fell through to the 900 floor and
 * the far ring drew 900 OF 9,902 CANDIDATES — 9,002 footprints that had already been downloaded,
 * decoded and centroided were discarded. Lifting the budget spends nothing but instances in the ONE
 * shadowless far-tier primitive: no extra network (they are the same tiles), no extra terrain
 * round-trip (the same points land in the same tiles, which are free per
 * §GROUND-SAMPLE-TILE-ATTRIBUTION), and no extra shadow caster (the near tiers are untouched).
 *
 * 14,000 is chosen from the parts, not picked: ≤1,600 shadow casters + ~3,840 demoted true-height
 * near entities (both unchanged) + up to 8,000 in the instanced far tier ≈ 13,440, so the budget
 * sits just above the sum of the tiers it governs rather than being an independent guess.
 *
 * ⚠ HONESTY NOTE, inherited from the constant this replaces and still true: this is NOT a measured
 * frame-time budget. No GPU capture was taken. It is derived from the tier caps and from the
 * founder's own footprint counts. Re-derive it from profiler evidence before calling it tuned.
 */
export const CTX_TOTAL_MAX_BUILDINGS = 14000;

/**
 * §CTX-EXTENT-BUDGET — runaway guard on the instanced far tier: **4000 → 8000.**
 *
 * Raised in step with the budget above, because otherwise it silently becomes the new binding
 * constraint and the founder's radius experiment would measure THIS NUMBER instead of the radius.
 * A count cap over a widened disc does not shrink the disc uniformly — it is nearest-first, so it
 * re-imposes a smaller effective radius in exactly the dense fabric where the extra extent is most
 * visible. The honest bound on extent is `CTX_FAR_HALF_DEG`; this is a guard, and a guard must sit
 * above the expected fill.
 *
 * ⭐ IF FRAME TIME DEGRADES, THIS IS THE FIRST NUMBER TO BRING DOWN. The far-tier log prints both
 * the drawn count and this cap, so the console says which one bound.
 */
export const CTX_FAR_TIER_MAX_INSTANCES = 8000;

/**
 * §CTX-EXTENT-BUDGET — mapped tree canopies in the ONE instanced tree primitive: **1500 → 3000.**
 *
 * Purely a CAP fix, and the cleanest one in the file: the founder's run drew 1,500 OF 2,462 BAKED
 * TREES inside the 891 m disc. Every one of the missing 962 was already read from the tiles. 3,000
 * draws the complete baked set at every real site while keeping a runaway guard for a
 * pathologically tree-dense bbox.
 *
 * ⚠ THE TREE RADIUS IS NOT RAISED, AND THE REASON IS NOT LAZINESS. Trees are fetched over
 * `CTX_NEAR_HALF_DEG` — the same bbox as the expensive solid near building tier — so widening
 * "the tree disc" as written today would widen the most expensive tier in the scene. Giving trees
 * their own extent is a real change (`contextTrees`, `contextCanopyBaked`, `contextParks` for the
 * woods-fill synthesis, and `contextLayerWarm` so the warm-up keeps hitting the same cache key),
 * and it has a trap: `trees` is a POINT layer baked z14–16 with `--drop-densest-as-needed`, so any
 * extent that pushes the read below z16 does not coarsen trees, IT DELETES THEM. That is a
 * follow-up with its own tile-cap arithmetic, not a constant bump.
 */
export const CTX_TREES_MAX_INSTANCES = 3000;

/** §VEG-CANOPY-FROM-WOODS — synthesised canopies filling real wood/forest rings. Unchanged: the
 *  founder's run did not report this cap biting, so raising it would buy nothing measurable. */
export const CTX_CANOPIES_MAX_SYNTHESISED = 6000;

/**
 * §CTX-EXTENT-BUDGET — street-life pedestrians: **800 → 1600.** Exactly double, which is what the
 * founder asked for and what the data supports: his run reported *"3044 person(s) dropped by the
 * nearest-first cap"*, i.e. 800 kept of 3,844 eligible positions ALREADY COMPUTED inside the same
 * 890 m disc. This is a pure cap bite with nothing else limiting it.
 *
 * ⚠ ONE NUMBER, TWO CONSTANTS. `PEDESTRIAN_CAP` (the pure builder) and `STREET_LIFE_MAX_PEOPLE`
 * (the renderer's slice) both derive from this row. If they ever diverge the smaller wins silently
 * and the larger becomes a lie in the log line.
 *
 * Cost: people are TWO shadowless shared-material primitives (body + head) — 1,600 people is 3,200
 * instances across two draw calls, which is the cheapest geometry in the scene after the trees.
 */
export const CTX_STREET_LIFE_MAX_PEOPLE = 1600;

/**
 * §CTX-EXTENT-BUDGET — street lamps: **1200 → 2400**, and this row is DIFFERENT IN KIND from the
 * one above, which is why it is written out rather than folded in.
 *
 * ⚠ LAMPS ARE NOT CAP-BOUND TODAY. The founder's run drew 2,036 lamp INSTANCES = 1,018 lamps
 * (pole + head, two instances each) against a 1,200 cap that never bit, and reported zero
 * synthesised lamps dropped. They are bound by the 890 m render radius and by
 * `LAMP_SPACING_M`/`LAMP_MAPPED_EXCLUSION_M`. So raising this cap changes NOTHING TODAY — it is
 * raised only so the cap cannot become the binding constraint if the street-life disc is widened
 * later, and it is recorded as such so nobody reports it as a win it did not deliver.
 */
export const CTX_STREET_LIFE_MAX_LAMPS = 2400;

/** §CTX-EXTENT-BUDGET — synthesised lamps along unlit roads, raised in step with the render cap
 *  above and with the same caveat: not biting today, so not a win today. */
export const CTX_LAMP_SYNTHETIC_CAP = 3000;

// ── the tile read ───────────────────────────────────────────────────────────────────────────

/**
 * §CTX-EXTENT-BUDGET — the per-fetch tile fan-out cap FOR `buildings` ONLY: **64 → 112.**
 *
 * ⛔ WHY THIS IS PER-LAYER AND NOT A RAISE OF THE GLOBAL `MAX_TILES_PER_FETCH`. Measured, and it
 * reverses the obvious fix: `zoomForExtent` picks the FINEST zoom that fits the cap, so raising the
 * global cap makes the WIDE layers read FINER for no visual gain at all. At cap 64 `landuse`
 * (0.072°) resolves to z13 / 30 tiles; at cap 144 it resolves to z14 / 100 tiles — 3.3× the range
 * requests to tint the same 8 km of ground, on a layer nobody looks at closely. The sea behaves the
 * same way. The cap is doing real work for those layers and must keep its value.
 *
 * `buildings` is the one layer whose extent this lane widens and the one layer where full z16
 * detail is load-bearing (below z16 `--drop-densest-as-needed` removes footprints, not just
 * vertices), so it gets its own ceiling and every other layer is untouched.
 *
 * 112 is sized from the measured fan-out at 0.016° — Barcelona/Madrid 81, Córdoba/Lisbon 72,
 * Sydney 64, Singapore 49 — leaving ~28 % headroom so a city at an unlucky latitude cannot tip one
 * tile over and silently lose z16. Oslo (169) and Reykjavík (225) still fall to z15, exactly as
 * they already do today at 0.011°; they gain extent without changing zoom.
 */
export const CTX_BUILDINGS_MAX_TILES_PER_FETCH = 112;

/**
 * §CTX-EXTENT-BUDGET — bound on the decoded-tile cache: **512 → 768.**
 *
 * The old value was justified as "≈ 14 far-extent reads' worth of distinct tiles". At 81 tiles per
 * buildings read that justification no longer holds: ONE site now needs ~330 distinct tiles across
 * all ten layers, so 512 leaves less than one further site before eviction and a pan starts
 * re-reading tiles it had. 768 restores the two-site headroom the number was chosen for. It stays
 * BOUNDED, which is the property that matters (§L-273).
 */
export const CTX_MAX_CACHED_TILES = 768;
