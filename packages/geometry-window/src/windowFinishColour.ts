/**
 * windowFinishColour — the window's C100 §2.1 resolution ladder, in ONE pure function.
 *
 * ─── ⛔ THE DEFECT THIS CLOSES, measured 2026-08-19 (C100 §9.1 / S17) ────────
 *
 * C100 §9.1 lists `window` beside `door` under *"no `materialId` EXISTS to lose"*.
 * True of the **L0 schema**; false of the **runtime record**, which has carried
 * `frameFinish.materialId` (`WindowTypes.ts`) for months, written by the property
 * panel out of the master library and persisted whole by `ProjectSerializer`.
 *
 * ⭐ **The window's defect is one rung subtler than the door's, and worth naming
 * precisely.** `WindowBuilder._resolveFrameColor` DOES read `frameFinish` — but only
 * `frameFinish.materialColor`, the **hex the dropdown cached beside the id**. So the
 * window has always rendered a TRANSCRIPTION of the master, never the master. C100
 * §2.1 is explicit that this is the wrong way round:
 *
 *   > A resolved colour is a CACHE, never an authority.
 *
 * The consequence is §2.2's promise failing silently: *"editing a master row changes
 * every element that references it"* — a window keeps its stale copy, forever, and
 * nothing anywhere says so. That is a quieter failure than the door's (where nothing
 * happened at all) and a longer-lived one, because it looks right on the day it is
 * authored.
 *
 * ─── The ladder, and why it is ADDITIVE rather than a re-ordering ───────────
 *
 * ⚠ This function deliberately preserves `_resolveFrameColor`'s EXISTING precedence
 * — the finish outranks the flat `frameColor`, and the system type outranks the
 * sentinel — and inserts master resolution ABOVE the cached hex at each level.
 * Every rung that could fire before still fires, with the same answer, EXCEPT where a
 * `materialId` is present; and a `materialId` did nothing at all before today.
 * **So no window in any existing project can change colour unless it names a master
 * material**, which is C100 §9.6.b's constraint met by construction rather than by
 * hope.
 *
 *   1. the record's `frameFinish.materialId`, resolved through `resolveMaterialColour`
 *      (T2 → T1) → the MASTER's colour (§2.1 step 2).
 *   2. that id names nothing → a NAMED UNRESOLVED state, painted MAGENTA (§5).
 *   3. `frameFinish.materialColor ?? frameColor`, when ≠ the sentinel — the existing
 *      rung 1, unchanged.
 *   4. the system TYPE's `frameFinish.materialId` → the MASTER's colour.
 *   5. the system TYPE's `frameFinish.materialColor` — the existing rung 2, unchanged.
 *   6. the explicit-or-sentinel colour — the existing rung 3, unchanged.
 *
 * ⚠ **On the sentinel**, `_resolveFrameColor`'s own header is retained and it is not
 * a curiosity: `#e8e8e8` means "no colour was authored", AND it is the LEGITIMATE
 * colour of the `wt-single-pane` aluminium type. Treating it as the sentinel is safe
 * because that type resolves back to the same value. An id now resolves ahead of it,
 * so a future editor must not read the hex as meaningless.
 *
 * ⚠ **NO SECOND LADDER IS WRITTEN HERE.** Rungs 1 and 4 delegate to
 * `resolveMaterialColour` — C100 §9.6.a's single authority — exactly as
 * `HandrailFragmentBuilder.resolveColour` and `resolveDoorFinishColour` do.
 *
 * CONTRACTS: C100 §2.1, §2.2, §5, §9.6.a, §9.6.b · C15 (hosted elements).
 */

import { resolveMaterialColour } from '@pryzm/core-app-model';
import type { WindowOpening, WindowFinishLayerData } from './WindowTypes';

/**
 * `WindowOpeningSchema`'s own default for `frameColor`, and
 * `WindowFinishLayerSchema`'s for `materialColor`. See the header: it means "not
 * authored", and it is also a real aluminium colour, which is why it resolves back
 * to itself rather than being treated as absent everywhere.
 */
export const WINDOW_COLOR_SENTINEL = '#e8e8e8';

/**
 * Painted when a window names a material that resolves to nothing. The same magenta
 * the kernel and every S16/S17 bridge use — C100 §5: visibly wrong on purpose.
 */
export const WINDOW_UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

export type WindowFinishColourState =
    | 'resolved'    // rung 1 or 4 — the master's colour, via a materialId
    | 'unresolved'  // rung 2 — an id that names nothing (magenta)
    | 'explicit'    // rung 3 — the record's authored finish or frame colour
    | 'type'        // rung 5 — the system type's cached finish colour
    | 'default';    // rung 6 — nothing was ever named

export interface WindowFinishColour {
    readonly hex: string;
    readonly state: WindowFinishColourState;
    readonly materialId?: string;
    /** Why, when the state is `unresolved`. Never a colour. */
    readonly reason?: string;
}

const norm = (c: string | undefined): string => (c ?? '').trim().toLowerCase();

/**
 * Resolve a window's frame colour by C100 §2.1's ladder.
 *
 * Pure: no store reads, no THREE, no DOM — so a headless test can drive it with a
 * plain record and assert the MASTER's hex, which is what C100 §9.6.c step 3
 * requires of every family this slice touches.
 *
 * @param typeFinish the system TYPE's frame finish, when the caller has resolved the
 *   type (rungs 4–5). Passed in rather than read here so this function stays
 *   store-free; `WindowBuilder` already holds the resolved type.
 */
export function resolveWindowFrameColour(
    win: Pick<WindowOpening, 'frameColor' | 'frameFinish'>,
    typeFinish?: Pick<WindowFinishLayerData, 'materialId' | 'materialColor'>,
): WindowFinishColour {
    // ── 1/2. The material the window REFERENCES (C100 §2.1 step 2, then §5) ──
    const recordId = win.frameFinish?.materialId?.trim() || undefined;
    if (recordId) {
        // ⚠ ONE ladder. Not re-implemented: C100 §9.6.a.
        const r = resolveMaterialColour(recordId, undefined);
        if (r.state !== 'unresolved') {
            return { hex: r.hex.toLowerCase(), state: 'resolved', materialId: recordId };
        }
        return {
            hex: WINDOW_UNRESOLVED_MATERIAL_COLOR,
            state: 'unresolved',
            materialId: recordId,
            reason: r.reason,
        };
    }

    // ── 3. `_resolveFrameColor`'s rung 1, byte-for-byte ──────────────────────
    const explicit = norm(win.frameFinish?.materialColor ?? win.frameColor);
    if (explicit && explicit !== WINDOW_COLOR_SENTINEL) {
        return { hex: explicit, state: 'explicit' };
    }

    // ── 4. The TYPE's id — the same rung, one level up ───────────────────────
    const typeId = typeFinish?.materialId?.trim() || undefined;
    if (typeId) {
        const r = resolveMaterialColour(typeId, undefined);
        if (r.state !== 'unresolved') {
            return { hex: r.hex.toLowerCase(), state: 'resolved', materialId: typeId };
        }
        // ⚠ A TYPE naming a dead material is NOT painted magenta: the window itself
        // named nothing, and every window of that type would go magenta at once for
        // a defect in the catalogue rather than in the model. It falls through to
        // the type's own cached colour below, which is exactly today's behaviour.
    }

    // ── 5. `_resolveFrameColor`'s rung 2, unchanged ──────────────────────────
    const fromType = norm(typeFinish?.materialColor);
    if (fromType) return { hex: fromType, state: 'type' };

    // ── 6. `_resolveFrameColor`'s rung 3, unchanged ──────────────────────────
    return { hex: explicit || WINDOW_COLOR_SENTINEL, state: 'default' };
}
