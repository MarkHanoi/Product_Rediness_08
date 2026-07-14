/**
 * WallFunction — §FEAT-PEN-WEIGHT-BY-WALL-FUNCTION (L-285)
 *
 * **THE WALL-DOMAIN HALF OF THE PEN'S THIRD AXIS.** The FUNCTION of a wall is a wall fact —
 * geometry-wall owns it. The PEN that function earns is a drawing fact — `core-app-model`'s
 * `ElementFunction` / `PenWeightTable` own that. This file is the boundary, and it is the whole
 * of geometry-wall's involvement in L-285: it answers ONE question — *is this wall part of the
 * envelope?* — and knows nothing about millimetres, zones or canvases.
 *
 * ═══ WHY THIS IS NOT `wall.thickness` ═══
 *
 * The founder asked for interior wall lines to draw lighter than the perimeter exterior ones.
 * The obvious implementation keys off thickness. It is WRONG:
 *
 *   • `wt-exposed-precast-hipster-concrete` is 290 mm and EXTERIOR.
 *   • A 300 mm ACOUSTIC or PARTY wall is 300 mm and INTERIOR — and would have drawn as heavy
 *     as the shell, leaving the envelope exactly as unreadable as it is today, in precisely
 *     the buildings (flats, hotels) where finding it matters most.
 *   • A thin exterior infill / rainscreen panel is EXTERIOR and would have VANISHED.
 *
 * Thickness is a coincidence of construction. FUNCTION is the drawing fact — which is why
 * ISO 13567 gives it a sub-categorisation field, IFC gives it `IfcWallTypeEnum`, and Revit puts
 * "Function" on the wall TYPE. We put it there too.
 *
 * ═══ WHY IT IS NOT DERIVED FROM THE LAYER STACK EITHER ═══
 *
 * `WallLayer.function` already exists — but it is a LAYER function (`'finish-exterior'`,
 * `'structure'`, …), not a WALL function, and it CANNOT answer this question: the built-in
 * `wt-interior-partition` has a layer whose function is literally `'finish-exterior'` (its
 * "Plaster (Outer)" face). Sniffing for a `finish-exterior` layer would classify the founder's
 * 100 mm partition as part of the building envelope — the exact defect this ticket exists to
 * fix, reintroduced by the fix. The function is DECLARED on the type, by whoever authored the
 * type, and never inferred.
 *
 * ═══ AN UNDECLARED TYPE IS UNKNOWN, NOT "INTERIOR" ═══
 *
 * `resolveWallFunction` returns `null` for a type that declares nothing — including
 * `wt-monolithic` ("Monolithic (Default)"), which is what the founder draws with until he picks
 * a type. `null` means UNMODULATED: the pen table gives such a wall exactly the weight it has
 * today (`functionWeightScale(null) === 1`). There is no guess and no default-to-partition
 * branch, so no existing drawing silently re-weights, and no wall is silently promoted to
 * "envelope" because a heuristic liked its thickness.
 *
 * Contract compliance:
 *   C09 §4.6.4a     — the Function axis of the pen table (drawing half: `ElementFunction.ts`)
 *   Contract §03-1.3 — WallSystemType is the project-level wall TYPE resource; this is a
 *                      property OF THE TYPE, exactly as IFC and Revit model it
 *   P8             — pure, deterministic, allocation-free store read on the projection path;
 *                    same span exemption `DrawingZone.ts` / `ViewScope` cite and for the same
 *                    reason (per-element, per-projection — instrumenting it would flood traces)
 *
 * @module WallFunction
 */

import type { ElementFunction } from '@pryzm/core-app-model';
import type { WallSystemType } from './WallSystemTypeStore';

/**
 * The ISO 13567 / IFC / Revit function of a wall TYPE.
 *
 * An ALIAS of the drawing layer's `ElementFunction`, deliberately — so that "exterior" means
 * exactly one thing across the codebase and a wall function can never drift out of step with
 * the pen axis that consumes it. (Two independently-declared unions that must agree is the
 * shape of the `VRZone`-vs-`DrawingZone` bug L-277 spent itself deleting.)
 */
export type WallFunction = ElementFunction;

/** The wall a wall type describes, as far as this module is concerned. */
type FunctionBearingType = Pick<WallSystemType, 'function'> | undefined | null;

/**
 * The declared function of a wall type, or `null` when the type declares none.
 *
 * `null` ⇒ the drawing does not modulate this wall's pen (see the module header). Callers MUST
 * NOT substitute a default.
 */
export function resolveWallFunction(systemType: FunctionBearingType): WallFunction | null {
    return systemType?.function ?? null;
}

/**
 * The declared function of the wall type a wall was drawn with, resolved through a type store.
 *
 * The store is passed in rather than imported so this stays a pure function of its inputs (the
 * projector already holds a store handle, and `geometry-wall`'s singleton is not reachable from
 * every caller — notably the drawing worker).
 *
 * @param systemTypeId  `WallData.systemTypeId` — the type selected at creation time.
 * @param lookup        `(id) => WallSystemType | undefined`, e.g. `wallSystemTypeStore.get`.
 */
export function resolveWallFunctionById(
    systemTypeId: string | undefined | null,
    lookup: (id: string) => FunctionBearingType,
): WallFunction | null {
    if (!systemTypeId) return null;
    return resolveWallFunction(lookup(systemTypeId));
}
