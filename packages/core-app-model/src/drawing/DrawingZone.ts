/**
 * DrawingZone — §FEAT-REVIT-LINE-TYPE-SEMANTICS (L-277)
 *
 * THE ONE ENCODING OF C09 §4.6 — THE SOLIDITY RULE.
 *
 * Every projected segment in a technical drawing belongs to exactly ONE zone, and the
 * zone — not the view type, not the element type, and NEVER the distance to the viewer —
 * decides its pen:
 *
 *   ┌──────────────┬───────────────────────────────────────────┬───────────────────────┐
 *   │ zone         │ what it MEANS                             │ how it DRAWS          │
 *   ├──────────────┼───────────────────────────────────────────┼───────────────────────┤
 *   │ 'cut'        │ the solid ∩ the view's cut plane          │ SOLID · heaviest · fill│
 *   │ 'projection' │ directly VISIBLE, not cut                 │ SOLID · thinner       │
 *   │ 'beyond'     │ past the cut plane, DELIBERATELY shown    │ SOLID · lighter       │
 *   │ 'hidden'     │ OCCLUDED by a solid, shown as hidden-line │ DASHED · thin · no fill│
 *   └──────────────┴───────────────────────────────────────────┴───────────────────────┘
 *
 * **ONLY `hidden` DASHES.** (C09 §4.6.4, founder L-277, verbatim: *"Dashed lines should be
 * reserved ONLY for true hidden edges."*)
 *
 * ═══ THE BUG THIS TYPE EXISTS TO KILL ═══
 *
 * Before L-277 the drawing layer had no zone TYPE at all. It reasoned in ad-hoc booleans
 * (`isCut`, `isBeyond`), layer-name suffixes (`:cut` / `:proj` / `:beyond`) and a private
 * `VRZone` string union re-declared inside the worker. Four consequences, all shipped:
 *
 *   1. `'hidden'` WAS NEVER PRODUCED. `penZoneFromFlags(isCut, isBeyond)` cannot return it;
 *      the worker's stage-4 extractor DROPPED it; the pen table's `HIDDEN` entry was `{}`.
 *      A zone that cannot be named cannot be styled — so occlusion had nowhere to go.
 *   2. …and so OCCLUSION WAS DUMPED INTO `'beyond'`. `reclassifyOccludedElevationLines()`
 *      moved genuinely-occluded segments onto the element's `:beyond` layer, because that
 *      was the only layer with a dashed pen.
 *   3. …and `'beyond'` IS A DISTANCE ZONE. `classifyByProjectionDepth()` also routes
 *      everything farther than `projectionDepth` (≈12 m) to `:beyond`. So DISTANCE and
 *      OCCLUSION landed in the SAME bucket…
 *   4. …and the bucket was DASHED (`BEYOND: pen(0.13, grey, [4,3], 0.55)`).
 *
 * **Far ⇒ :beyond ⇒ dashed.** That is the founder's bug, stated as a chain of four facts.
 * It is not a styling defect: it is a MISSING TYPE. `'far'` and `'behind something'` are
 * different questions, and with only three producible zones the drawing layer had no way
 * to hold two different answers.
 *
 * The fix is this file: name all four zones, give the dashed pen to `hidden` and ONLY to
 * `hidden`, and make occlusion — never depth — the sole producer of `hidden`.
 *
 * ═══ P8 / span exemption ═══
 * Pure, deterministic, allocation-free classifiers on the per-segment hot path. Same
 * precedent as `ViewScope.resolveViewScope` and `PenWeightTable.categoryFromFlags`, both of
 * which cite it: instrumenting a per-segment classifier would flood traces and blow the
 * C10 perf budget. Every SIDE-EFFECTING export in this lane (`applyOcclusion`) is observable
 * (it reports its occluder count, disposition and clipped/demoted totals on every pass).
 *
 * Contract compliance:
 *   C09 §4.6      — the Solidity Rule (this file is its type)
 *   Contract-23 §8 — the zone × category pen table consumes `PenZone`
 *   P5/§05        — pure data classifier: no DOM, no THREE, no I/O, no store reads
 *   P7            — the zone→pen map and the occlusion disposition are VIEW INTENT
 *
 * @module DrawingZone
 */

// ─── The four zones ───────────────────────────────────────────────────────────

/**
 * The four — and only four — zones a projected segment can occupy.
 *
 * Lower-case is the DOMAIN spelling (it is what `ElementState` in the visibility-intent
 * layer already used, so intent and drawing now share ONE union rather than two that drift).
 * `PenZone` below is the same set in the pen table's upper-case spelling; `penZoneOf()` /
 * `drawingZoneOf()` are the ONLY sanctioned bridge between them.
 */
export type DrawingZone = 'cut' | 'projection' | 'beyond' | 'hidden';

/** Iteration order for exhaustive tables and guards. */
export const DRAWING_ZONES: readonly DrawingZone[] = Object.freeze([
    'cut', 'projection', 'beyond', 'hidden',
] as const);

/**
 * Pen-table key spelling of {@link DrawingZone} (Contract-23 §8).
 *
 * Kept as a distinct alias only because the locked Contract-23 table is keyed upper-case
 * and is consumed by DXF/PDF exporters that serialise the key. It is DERIVED from
 * `DrawingZone`, never independently declared — the worker's private `VRZone` union
 * (which silently omitted nothing but re-typed everything) is deleted in favour of this.
 */
export type PenZone = 'CUT' | 'PROJECTION' | 'BEYOND' | 'HIDDEN';

const _ZONE_TO_PEN: Readonly<Record<DrawingZone, PenZone>> = Object.freeze({
    cut:        'CUT',
    projection: 'PROJECTION',
    beyond:     'BEYOND',
    hidden:     'HIDDEN',
});

const _PEN_TO_ZONE: Readonly<Record<PenZone, DrawingZone>> = Object.freeze({
    CUT:        'cut',
    PROJECTION: 'projection',
    BEYOND:     'beyond',
    HIDDEN:     'hidden',
});

/** Domain zone → pen-table key. */
export function penZoneOf(zone: DrawingZone): PenZone {
    return _ZONE_TO_PEN[zone];
}

/** Pen-table key → domain zone. */
export function drawingZoneOf(zone: PenZone): DrawingZone {
    return _PEN_TO_ZONE[zone];
}

// ─── Zone ⇄ ISO sub-layer name ────────────────────────────────────────────────

/**
 * The sub-layer suffix each zone is written to by `EdgeProjectorService`.
 *
 * NOTE `projection` → `proj` (not `projection`): that abbreviation is baked into every
 * drawing already persisted, into `ViewTechnicalDrawingCache`, and into the DXF layer
 * names the founder exports. It is data, not a preference.
 */
export const ZONE_LAYER_SUFFIX: Readonly<Record<DrawingZone, string>> = Object.freeze({
    cut:        'cut',
    projection: 'proj',
    beyond:     'beyond',
    hidden:     'hidden',
});

/** `('A-WALL', 'beyond') → 'A-WALL:beyond'`. */
export function layerForZone(baseLayer: string, zone: DrawingZone): string {
    return `${baseLayer}:${ZONE_LAYER_SUFFIX[zone]}`;
}

/**
 * Rewrite a zoned sub-layer name onto a DIFFERENT zone, preserving the base layer and the
 * separator convention already in use.
 *
 * The drawing carries TWO legitimate sub-layer conventions, both live in the founder's
 * drawings — the projector's colon form (`A-WALL:proj`) and the symbol builders' hyphen
 * form (`A-DOOR-PROJ`). This preserves whichever the caller had, so a demoted door-frame
 * segment lands on `A-DOOR-HIDDEN`, not on a foreign `A-DOOR-PROJ:hidden`.
 *
 * Returns `null` when the tag carries no zone at all (`A-GRID`, `projection-visible`) —
 * a zone-less layer must NOT be coerced into one.
 */
export function siblingZoneLayer(layerTag: string, zone: DrawingZone): string | null {
    const m = /^(.*?)([:-])(cut|proj|projection|beyond|hidden)\b(.*)$/i.exec(layerTag);
    if (!m) return null;
    const [, base, sep, , tail] = m;
    const suffix = ZONE_LAYER_SUFFIX[zone];
    // Preserve the case convention of the original: `A-DOOR-PROJ` → `A-DOOR-HIDDEN`.
    const cased = sep === '-' ? suffix.toUpperCase() : suffix;
    return `${base}${sep}${cased}${tail}`;
}

/**
 * THE canonical layer-name → zone classifier. Every consumer that must decide
 * "is this linework CUT, PROJECTION, BEYOND or HIDDEN?" resolves it HERE.
 *
 * Accepts both sub-layer conventions (see {@link siblingZoneLayer}). Layers with no zone
 * suffix (`A-WALL`, `A-GRID`, the `projection-visible` / `projection-hidden` IFC fallback)
 * return `null` — they carry no zone and must not be coerced into one.
 *
 * Ordering matters: `hidden` is tested before `proj` because the IFC fallback layer
 * `projection-hidden` contains BOTH tokens and is genuinely hidden linework.
 */
export function drawingZoneFromLayerName(layerTag: string): DrawingZone | null {
    if (!layerTag) return null;
    if (/[:-]cut\b/i.test(layerTag))    return 'cut';
    if (/[:-]hidden\b/i.test(layerTag)) return 'hidden';
    if (/[:-]beyond\b/i.test(layerTag)) return 'beyond';
    if (/[:-]proj\b/i.test(layerTag))   return 'projection';
    return null;
}

// ─── The dash rule (C09 §4.6.4) ───────────────────────────────────────────────

/**
 * **THE RULE, AS A PREDICATE.** A drawing zone dashes by default if and ONLY if it is
 * `hidden`. Guarded by `PenWeightTable`'s merge-blocking ladder test; a builder or a table
 * entry that dashes a `cut`, `projection` or `beyond` segment is in breach of C09 §4.6.4.
 *
 * A USER may still override a zone's pen to dashed through the intent chain
 * (`GraphicsRulesEngine`) — that is the founder's explicit *"unless the user explicitly
 * overrides"*. What is forbidden is a dash arriving by DEFAULT, from a code branch.
 */
export function zoneDashesByDefault(zone: DrawingZone): boolean {
    return zone === 'hidden';
}

// ─── The two dashes, and why they must differ (C09 §4.6.4d) ──────────────────

/**
 * §FEAT-BEYOND-DASH-IN-ELEVATION (L-290) — **THE TWO DE-EMPHASIS ZONES MUST BE TELLABLE APART.**
 *
 * The founder has asked for `beyond` to draw DASHED in elevation and section (plan keeps it
 * solid). That is legitimate — it is the override clause his own spec carries (*"never dashed,
 * **unless explicitly overridden**"*), expressed as per-view-type INTENT (`ViewScope`) rather
 * than as an `if (isElevation)` in a builder. It does **not** re-open L-277: that bug was
 * dashing by DISTANCE — far-but-VISIBLE geometry dashed because depth and occlusion shared one
 * bucket — and it stays fixed.
 *
 * *** BUT: `BEYOND` AND `HIDDEN` CARRY THE SAME WIDTH (0.09 mm). THEY DIFFER BY *DASH*, NOT BY
 * *WEIGHT*. *** So the naive `dash = true` on beyond ships a drawing that **GAINED A DASH AND
 * LOST A DISTINCTION**: a stair's lower run (beyond) would read identically to a pipe behind a
 * wall (hidden), in exactly the views he asked for. They must be separated BEFORE beyond dashes.
 *
 * ═══ THE AXIS IS THE DASH PATTERN. IT IS NOT THE WEIGHT. ═══
 *
 * WEIGHT WAS THE OBVIOUS CHOICE AND IT IS **PROVABLY INVISIBLE** — measured, not guessed, in
 * §FIX-PLAN-CANVAS-HAIRLINE-FLOOR (L-288): both pens sit at 0.09 mm ≈ 0.34 CSS px, which is
 * **one device pixel** at the canvas's backing scale — i.e. exactly ON the raster floor. Any
 * width difference between them is *sub-pixel by construction*: the eye cannot receive it, and
 * making `hidden` thinner would additionally force `MIN_LEGIBLE_BACKING_SCALE` from 3 to 4
 * (it is derived from the thinnest pen), i.e. pay a 16/9× fill-rate cost for a difference nobody
 * can see. A distinction the raster destroys is not a distinction.
 *
 * THE DASH PERIOD IS MULTI-PIXEL AND SURVIVES EVERYTHING. `[8,4]` vs `[4,3]` is 12 CSS px of
 * period against 7 — visible at 1×, visible on a projector, and exact in print. It is also the
 * standard drafting distinction (ISO 128-24: a LONG dash for a member behind the plane; a fine
 * SHORT dash for hidden detail), which is why every draughtsman already reads it correctly.
 */
export const BEYOND_DASH_PX: readonly number[] = Object.freeze([8, 4]);

/** The hidden-line dash (ISO 128-24 type F). Short, fine — deliberately NOT {@link BEYOND_DASH_PX}. */
export const HIDDEN_DASH_PX: readonly number[] = Object.freeze([4, 3]);

/**
 * The two de-emphasis dashes are DIFFERENT — asserted here as a type-level fact so the guard
 * cannot be satisfied by a coincidence. If someone "tidies" one of them into the other, a
 * stair's lower run and a pipe behind a wall become the same line, and the merge-blocking L-290
 * guard goes red.
 */
export function beyondAndHiddenAreDistinguishable(): boolean {
    return BEYOND_DASH_PX.length !== HIDDEN_DASH_PX.length
        || BEYOND_DASH_PX.some((v, i) => v !== HIDDEN_DASH_PX[i]);
}

/**
 * How a view draws the `beyond` zone. **A per-view-type default carried as DATA on `ViewScope`**
 * (the `occlusionDisposition` precedent, L-279), overridable per view (P7) — never a `viewType
 * ===` branch inside a renderer.
 *
 *   • `'solid'`  — PLAN. The founder's stair: its lower run is DELIBERATELY SHOWN, and it is not
 *     behind anything. Unchanged by L-290, and asserted explicitly, because a fix here that
 *     silently dashed plan would re-open the exact bug L-277 closed.
 *   • `'dashed'` — ELEVATION and SECTION, drawn with {@link BEYOND_DASH_PX} (the LONG dash), so
 *     it stays distinct from `hidden`'s short dash.
 */
export type BeyondLineStyle = 'solid' | 'dashed';

/**
 * DATUM categories — grids, levels and annotation.
 *
 * These are NOT solids. They have no cut, no projection and no occlusion; they are drafting
 * DATUMS, and their chain/centre-line dash (ISO 128-24 type G/H) is a category convention,
 * not a hidden-line reading. They are therefore the ONE sanctioned exemption from
 * {@link zoneDashesByDefault}, and the pen-ladder guard skips them explicitly rather than
 * silently. Every other category — every actual piece of building fabric — obeys the rule.
 */
export const DATUM_CATEGORIES: ReadonlySet<string> = Object.freeze(
    // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7950, C105 §5) — `boundary-line` JOINS the
    // datums, and it belongs here more literally than the other three: it IS a
    // construction line. An architect draws it to set a scheme out, exactly as a grid
    // or a level line is drawn, and its dash is an ISO 128-24 category convention
    // rather than a hidden-line reading.
    //
    // ⚠ THE EXEMPTION IS NARROW AND CONDITIONAL, AND THAT IS WORTH SAYING OUT LOUD. A
    // boundary line with `hasVolume: true` DOES have building fabric — a real extruded
    // solid — and that solid's own edges obey the ladder like anything else. What is
    // exempted is the CENTRELINE, which is drafting notation whether or not a solid
    // stands on it. The two are different pieces of geometry from the same record; only
    // the first is a datum.
    new Set<string>(['grid', 'level', 'annotation', 'boundary-line']),
) as ReadonlySet<string>;

// ─── Occlusion disposition (C09 §4.6.5) — INTENT, not a code branch ───────────

/**
 * What a view does with a span it has proved to be OCCLUDED.
 *
 * - `'remove'` — the occluded span is not drawn at all. The plan / section convention:
 *   the slab does not show through the wall.
 * - `'demote'` — the occluded span is re-classified to `hidden` and drawn on the dashed
 *   hidden-line pen. The elevation convention (L-190), and the mode a user turns on when
 *   they want to SEE what is behind the wall.
 *
 * Both are legitimate drafting conventions. C09 §4.6.5: **which one applies is a property
 * of the view's INTENT** (carried on `ViewScope`), never a `viewType ===` branch inside an
 * occluder. What is NOT legitimate is a view type having no occlusion at all, or having its
 * own private occluder.
 */
export type OcclusionDisposition = 'remove' | 'demote';
