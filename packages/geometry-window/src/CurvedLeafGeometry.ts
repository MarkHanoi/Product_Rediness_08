/**
 * CurvedLeafGeometry — §FEAT-CURVED-WINDOW-LEAF (L-957) — RE-EXPORT SHIM.
 *
 * THE IMPLEMENTATION MOVED TO `@pryzm/geometry-door/CurvedLeafGeometry`, UNCHANGED.
 *
 * ── Why it moved, and why this file still exists ─────────────────────────────
 * The door half of L-957 needs the SAME curved leaf: the founder asked for curved
 * windows, then for doors to get the same treatment. A door leaf swept on its own
 * copy of this maths would be the C84 EI-9 defect one level up — two derivations
 * of one arc — and a second copy of `sweptBoxGeometry` is exactly what EI-10 and
 * `check-predicate-canonical` exist to stop.
 *
 * It could not move UP into the door package's caller and it did not need to move
 * into `geometry-wall`: `@pryzm/geometry-window` ALREADY depends on
 * `@pryzm/geometry-door` (`WindowSection` imports `injectDwStyles` from it — "dw"
 * = doors/windows, the established home for shared door↔window code). That edge
 * points window → door, so the door cannot import the window, and the shared
 * module has to sit in the door package for both to reach it. No new dependency
 * edge was created, no new package, and `geometry-wall` was not touched —
 * `hostedElementFrame` was already exported from `WallArcParam`.
 *
 * This file stays a shim rather than being deleted so that `WindowBuilder`'s
 * import, this package's barrel, and the four shipped window test files keep
 * resolving `./CurvedLeafGeometry` exactly as before. Nothing about the window's
 * public API or its built geometry changes.
 *
 * The ONE difference is `curvedLeafRefusal`: the shared implementation takes the
 * element noun so the message can say "window" or "door", while the CONDITION
 * stays one predicate for both. The wrapper below binds `'window'`, so this
 * package's exported signature and its message text are byte-for-byte what they
 * were. A door and a window that disagreed about whether a raked curved host is
 * buildable would be an EI-1 defect; one predicate, two nouns, cannot.
 */

export {
    leafArc,
    sweptBoxGeometry,
    arcSeat,
    type LeafArc,
} from '@pryzm/geometry-door';

import { curvedLeafRefusal as _curvedLeafRefusal } from '@pryzm/geometry-door';

/**
 * The one combination a curved WINDOW leaf cannot carry — `curved × raked` —
 * named so the property panel can IMPORT the gate the builder obeys instead of
 * restating its condition.
 *
 * Delegates to the shared predicate; only the noun in the message is bound here.
 * See `@pryzm/geometry-door/CurvedLeafGeometry` for why the list is this short
 * (curved × layered is already BUILT; curved × raked is already refused at the
 * model, so this is a DEFENCE against an upstream guard failing, not a second
 * policy).
 */
export function curvedLeafRefusal(wall: unknown): string | null {
    return _curvedLeafRefusal(wall, 'window');
}
