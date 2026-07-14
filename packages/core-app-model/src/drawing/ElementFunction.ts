/**
 * ElementFunction — §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285)
 *
 * THE THIRD AXIS OF THE PEN TABLE (C09 §4.6.6 / Contract-23 §8).
 *
 * L-277 shipped `pen = f(ZONE, CATEGORY)`. That is enough to say "a cut wall is heavier
 * than a projected wall". It is NOT enough to say **which wall is the building**.
 *
 * The founder, verbatim: *"Please make interior wall thickness lines slightly less thick
 * than the perimeter exterior wall thickness lines in plan view — but also in elevation."*
 * Today a 100 mm partition and a 300 mm shell draw with the SAME pen, so the eye cannot
 * find the envelope. This file adds the axis that fixes that:
 *
 *     pen = f(ZONE, CATEGORY, FUNCTION)
 *
 * ═══ THE TRAP: FUNCTION IS NOT THICKNESS ═══
 *
 * The obvious implementation — key the pen off `wall.thickness` — is WRONG, and it is
 * wrong in a way that would have looked right on the founder's own model for weeks:
 *
 *   • a 300 mm ACOUSTIC or PARTY wall is INTERIOR, and would have drawn as heavy as the
 *     shell — the envelope would still be unreadable, in exactly the buildings (flats,
 *     hotels) where it matters most;
 *   • a thin EXTERIOR infill / rainscreen panel would have VANISHED into the partitions.
 *
 * Thickness is a coincidence of construction. **FUNCTION is the drawing fact** — which is
 * precisely why ISO 13567 gives it a sub-categorisation field and why Revit puts "Function"
 * on the wall TYPE (not the instance, and never on its thickness). We read the fact the
 * model already holds (`WallSystemType.function`, resolved by `@pryzm/geometry-wall`'s
 * `resolveWallFunction`) and never infer it from geometry.
 *
 * ═══ THE ZONE LADDER IS SACRED (C09 §4.6.4) ═══
 *
 * FUNCTION **modulates within a zone**; it NEVER reorders zones:
 *
 *     weight(CUT, ·, interior)  <  weight(CUT, ·, exterior)          ← the new fact
 *     weight(CUT, ·, ANY fn)    >  weight(PROJECTION, ·, ANY fn)     ← STILL TRUE, strictly
 *
 * An interior CUT wall is a touch lighter than an exterior CUT wall — and STILL HEAVIER
 * THAN ANY PROJECTION LINE. Both halves are asserted, together, in `DrawingZone.test.ts`.
 * Asserting only the modulation would silently undo L-277.
 *
 * ═══ UNKNOWN FUNCTION IS NOT A GUESS ═══
 *
 * `functionWeightScale(null | undefined) === 1`. An element whose function the model does
 * not know draws with EXACTLY the pen it draws with today. There is no default-guess branch:
 * a wall the user drew with the Monolithic (Default) type declares no function, so it keeps
 * the L-277 pen rather than being silently promoted to "envelope" or demoted to "partition".
 * The founder's default drawing is therefore bit-identical until he picks a type — and the
 * moment he does, the drawing tells him which wall is the building.
 *
 * ═══ P8 / span exemption ═══
 * Pure, deterministic, allocation-free classifiers on the per-segment hot path — the same
 * precedent `DrawingZone.ts`, `ViewScope.resolveViewScope` and `PenWeightTable.
 * categoryFromFlags` cite. Instrumenting a per-segment classifier would flood traces and
 * blow the C10 perf budget.
 *
 * Contract compliance:
 *   C09 §4.6.6     — the Function axis (this file is its type)
 *   Contract-23 §8 — `resolvePen(zone, category, function?)` consumes `ElementFunction`
 *   P5/§05         — pure data classifier: no DOM, no THREE, no I/O, no store reads
 *   P7             — the function→weight scale is VIEW INTENT, overridable through the
 *                    GraphicsRules chain, never a hardcode in a builder
 *
 * @module ElementFunction
 */

// ─── The functions ────────────────────────────────────────────────────────────

/**
 * What a piece of building fabric DOES — the ISO 13567 / IFC / Revit "function" of the
 * element's TYPE, not a property of its geometry.
 *
 * - `'exterior'` — it is part of the building ENVELOPE. It separates inside from outside.
 * - `'interior'` — it subdivides the inside. A partition, however thick.
 *
 * Deliberately only two members. IFC's `IfcWallTypeEnum` and Revit's Function enum also
 * carry FOUNDATION / RETAINING / SOFFIT / CORE-SHAFT; PRYZM's model cannot currently answer
 * those questions honestly, and a union member nothing can produce is a member that cannot
 * be styled — that is the exact defect L-277 spent itself killing (`'hidden'` was in no
 * union, so occlusion had nowhere to go). Add a member the day the model can produce it.
 */
export type ElementFunction = 'exterior' | 'interior';

/** Iteration order for exhaustive tables and guards. */
export const ELEMENT_FUNCTIONS: readonly ElementFunction[] = Object.freeze([
    'exterior', 'interior',
] as const);

// ─── The modulation (C09 §4.6.6) ──────────────────────────────────────────────

/**
 * The weight multiplier each function applies to its (zone × category) pen.
 *
 * `exterior` is 1.0 — the ENVELOPE IS THE DATUM. The locked Contract-23 §8 table values were
 * always drawn (and reviewed, and printed) as "the heavy line", so making the exterior the
 * unmodulated case means L-285 does not silently re-weight every drawing the founder has
 * already approved: it makes the INTERIOR lighter rather than making the exterior heavier.
 *
 * `interior` is 0.70 — the founder's word is *"slightly less thick"*. 0.70 is the ISO 128-20
 * line-group ratio (each ISO group steps by ~√2 ≈ 0.71: 0.50 → 0.35 → 0.25 → 0.18 → 0.13),
 * so an interior CUT wall lands on 0.50 × 0.70 = **0.35 mm — an EXISTING pen in the locked
 * table** (it is the door/window CUT weight), not an invented in-between width. The whole
 * table stays inside the ISO line group it was authored in, which is what makes it print.
 */
export const FUNCTION_WEIGHT_SCALE: Readonly<Record<ElementFunction, number>> = Object.freeze({
    exterior: 1.00,
    interior: 0.70,
});

/**
 * The multiplier for a function that may be unknown.
 *
 * **Unknown ⇒ 1.0 ⇒ today's pen, exactly.** See the module header: an element whose function
 * the model cannot state is not guessed at.
 */
export function functionWeightScale(fn: ElementFunction | null | undefined): number {
    return fn ? FUNCTION_WEIGHT_SCALE[fn] : 1;
}

// ─── WHICH ZONES THE FUNCTION MODULATES (C09 §4.6.6) ──────────────────────────

/**
 * **THE FUNCTION MODULATES `CUT` AND `PROJECTION`. IT DOES NOT TOUCH `BEYOND` OR `HIDDEN`.**
 *
 * This is not a carve-out to make a test pass — it is what the two halves of the ladder MEAN,
 * and the merge-blocking ladder guard is what forced it into the open:
 *
 *   • `CUT` and `PROJECTION` are **HIERARCHY** zones. Their weight says *how important is this
 *     line* — which is exactly the question the founder is asking ("I cannot find the
 *     envelope"), and exactly what a function differentiates. A plan cuts its walls (CUT); an
 *     elevation projects them (PROJECTION). His ask — *"in plan view — but also in elevation"* —
 *     is precisely these two zones and no others.
 *
 *   • `BEYOND` and `HIDDEN` are **DE-EMPHASIS** zones. Their pen does not say "how important";
 *     it says *"this is background — read past it"*. Whether a faint grey background line is
 *     envelope or partition is not a question the drawing is asking, and answering it would be
 *     drawing noise: both zones sit at 0.09 mm, already BELOW the thinnest ISO 128-20 line
 *     group (0.13 mm), so a 30 % modulation there is not a hierarchy — it is 0.063 mm, a width
 *     no plotter will honour and no eye will resolve.
 *
 * AND IT IS A LADDER INVARIANT, NOT A PREFERENCE. `BEYOND` and `HIDDEN` carry the SAME base
 * width (0.09 mm) in every category — deliberately, since L-277: they differ by DASH, not by
 * weight. Two zones with equal weights cannot BOTH be modulated independently and still satisfy
 * `weight(BEYOND) >= weight(HIDDEN)`: scaling an interior BEYOND to 0.063 puts it UNDER an
 * exterior HIDDEN at 0.09 and INVERTS the bottom of the C09 §4.6.4 ladder. The guard in
 * `PenWeightByFunction.test.ts` caught exactly that on the first run of this feature. Modulating
 * only the hierarchy zones is the fix that is also the correct drafting semantics.
 */
export const FUNCTION_MODULATED_ZONES: ReadonlySet<string> = Object.freeze(
    new Set<string>(['CUT', 'PROJECTION']),
) as ReadonlySet<string>;

/**
 * The scale to apply to a (zone × category) pen's width for an element of this function.
 *
 * **THE ONE PLACE the modulation is decided.** `resolvePen()` and `GraphicsRulesEngine.
 * resolveStyle()` both call it — with the zone — so the "hierarchy zones only" rule above
 * cannot be half-applied by one of them.
 */
export function penWidthScale(
    zone: string,
    fn: ElementFunction | null | undefined,
): number {
    return FUNCTION_MODULATED_ZONES.has(zone) ? functionWeightScale(fn) : 1;
}

/**
 * Narrow an untrusted value (a `userData` stamp travelling from the projector through the
 * TechnicalDrawing to the canvas) to an `ElementFunction`, or `null`.
 *
 * The drawing carries the function as a plain string on `LineSegments.userData` — the same
 * transport `elementUUID` and `VIEW_DEPTH_KEY` already use — so it survives `toDrawingSpace`,
 * the projection cache and the DXF/PDF exporters without a new channel. This is the ONE place
 * that decides whether such a stamp is a function; nothing else may `as ElementFunction` it.
 */
export function elementFunctionFrom(raw: unknown): ElementFunction | null {
    return raw === 'exterior' || raw === 'interior' ? raw : null;
}

/**
 * The `userData` key the projector stamps and the canvas reads.
 *
 * Named, not typed inline, for the same reason `VIEW_DEPTH_KEY` is: an unstamped element is
 * silently unmodulated, so a typo in the key is a defect that has NO error and NO visual —
 * it just quietly restores the pre-L-285 drawing. One constant, two call sites.
 */
export const ELEMENT_FUNCTION_KEY = 'elementFunction';
