/**
 * doorFinishColour — the door's C100 §2.1 resolution ladder, in ONE pure function.
 *
 * ─── ⛔ THE DEFECT THIS CLOSES, measured 2026-08-19 (C100 §9.1 / S17) ────────
 *
 * C100 §9.1 records `door` under *"no `materialId` EXISTS to lose"*. That is true
 * of the **L0 schema** (`packages/schemas/src/elements/Door.ts` carries `frameColor`
 * + `leafColor` and no id) and it is the wrong half of the story. The **runtime**
 * record has carried a real master id for months:
 *
 *   · `DoorTypes.ts` — `DoorFinishLayerSchema { name, materialColor, materialId? }`,
 *     stamped onto `frameFinish` / `leafFinish`.
 *   · `DoorSection.ts` — the "Frame Finish" and "Leaf Finish" dropdowns are
 *     populated **from `STANDARD_MATERIAL_LIBRARY`**, i.e. from the master's own
 *     projection, and write `{ name, materialId, materialColor }` through
 *     `UpdateDoorParameterCommand` — a live `command-registry` route.
 *   · `ProjectSerializer` copies the whole record (`{ ...d }`) and `ProjectLoader`
 *     calls `doorStore.add(d)`, so the id **survives save and reload**.
 *
 * ⭐ **Every link in that chain worked except the last one.** `DoorBuilder` read
 * `door.frameColor` / `door.leafColor` and nothing else — `frameFinish` appears in
 * the file exactly once, inside `_PROPERTY_ONLY_FIELDS`, which routes a finish
 * change to `_applyPropertyOnly()`, whose entire effect is
 * `frameMat.color.set(door.frameColor)` — **re-applying the colour that did not
 * change.** So picking *"Frame Finish → Oak"* wrote a correct master id to a
 * correctly persisted record and the door on screen did not move, then or ever.
 * §COMMITTED-IS-NOT-REACHABLE, with four of five links green.
 *
 * ─── The ladder, and why each rung is where it is ───────────────────────────
 *
 * C100 §2.1 is normative: *"An element REFERENCES a material by `materialId`. A
 * resolved colour is a CACHE, never an authority. A stored hex is legal in exactly
 * ONE role — an explicit, user-authored OVERRIDE — and it MUST be distinguishable
 * from a colour that was resolved from the master."*
 *
 * ⚠ **Distinguishing them is the whole difficulty here, and it is not a guess.**
 * `DoorTypes.ts` states the relationship in its own words: the finish layers *"are
 * the primary BIM finish records; frameColor / leafColor are **derived** from these
 * for the 3-D renderer"*, and `DoorOpeningFactory.ts:221` performs that derivation
 * (`record.frameColor = sysType.frameFinish.materialColor`). **A derived field that
 * no longer equals what it was derived from has been overwritten by hand** — that,
 * and not a timestamp or a new boolean, is what tells an override apart from a
 * stale cache. Hence rung 1.
 *
 *   1. `frameColor` present, ≠ the schema sentinel, and **≠ the finish's own
 *      `materialColor`** → an explicit user OVERRIDE (§2.1 step 1). The Frame
 *      Colour picker's result, preserved exactly as today.
 *   2. else the finish's `materialId`, resolved through `resolveMaterialColour`
 *      (T2 → T1) → the MASTER's colour (§2.1 step 2). **This is the rung that was
 *      missing**, and the one that makes a master edit reach a placed door (§2.2).
 *   3. else that id names nothing → a NAMED UNRESOLVED state, painted MAGENTA
 *      (§5). Never a plausible timber: *"your material was lost"* must not look
 *      like *"this door is oak"*.
 *   4. else the finish's `materialColor` with no id — a cached hex that has
 *      irreversibly lost its name (§2.1's MUST NOT, on records written before the
 *      dropdowns carried ids). Used, and reported as a cache, not as a resolution.
 *   5. else `frameColor` ≠ sentinel — the pre-S17 flat field, so a door authored
 *      by any older path renders exactly as it did.
 *   6. else the system TYPE's finish colour — `WindowBuilder._resolveFrameColor`'s
 *      step 2, mirrored, for a door placed by the plan tool with no baked colour.
 *   7. else `familyDefault`.
 *
 * ⭐ **Rungs 5–7 exist so that nothing repaints.** C100 §9.6.b names repainting the
 * product as the thing that would rightly get this convergence reverted, so the
 * door's sentinel (`#f2f0ed`, `DoorOpeningSchema`'s own default for both colour
 * fields) is passed straight through as the family default. Every door that has no
 * finish id renders the byte-identical colour it rendered before this file existed;
 * the ONLY behaviour that changes is a door that names a master material.
 *
 * ⚠ **NO SECOND LADDER IS WRITTEN HERE.** Rung 2 delegates to
 * `resolveMaterialColour` — C100 §9.6.a's single authority — exactly as
 * `HandrailFragmentBuilder.resolveColour` does. C100 §1.1 traces four of the eight
 * rival material vocabularies to someone chaining `userMaterialStore.get()` and
 * `materialHex()` privately; this file must never become the fifth.
 *
 * CONTRACTS: C100 §2.1 (the ladder), §2.2 (a master edit reaches placed elements),
 * §5 (no silent fallback), §9.6.a (one resolution authority), §9.6.b (converge the
 * value, not the format) · C15 (hosted elements) · C11 §5.4 (a domain rule resolves
 * upstream of the builder).
 */

import { resolveMaterialColour } from '@pryzm/core-app-model';
import type { DoorOpening, DoorFinishLayerData } from './DoorTypes';

/**
 * `DoorOpeningSchema`'s own default for BOTH `frameColor` and `leafColor`.
 *
 * ⚠ Imported meaning, not a new constant: a door sitting on this value has never
 * had a colour authored onto it, because nothing but the schema default produces
 * it. That is what makes rung 1's "≠ sentinel" test a statement about AUTHORSHIP
 * rather than about hue. `WindowBuilder._resolveFrameColor` reasons identically
 * with its own sentinel (`#e8e8e8`) and says so.
 */
export const DOOR_COLOR_SENTINEL = '#f2f0ed';

/**
 * Painted when a door names a material that resolves to nothing.
 *
 * Magenta, on purpose, and the same magenta the kernel's
 * `UNRESOLVED_MATERIAL_COLOR` and every S16 bridge use. C100 §5: the failure has
 * to be visible in the viewport, not buried in a console nobody reads — and it
 * MUST NOT be mistakable for a building material.
 */
export const DOOR_UNRESOLVED_MATERIAL_COLOR = '#ff00ff';

/** Which of the door's two material surfaces is being resolved. */
export type DoorFinishSlot = 'frame' | 'leaf';

/**
 * How the colour was arrived at. Carried out of the function rather than
 * collapsed to a hex, because C100 §6.1 requires the UI to be able to MARK an
 * override as an override, and §5 requires an unresolved reference to be NAMED —
 * neither is expressible in a bare string.
 */
export type DoorFinishColourState =
    | 'override'    // rung 1 — an explicit user colour
    | 'resolved'    // rung 2 — the master's colour, via materialId
    | 'unresolved'  // rung 3 — an id that names nothing (magenta)
    | 'cached'      // rung 4 — a finish hex with no id: the name is already lost
    | 'legacy'      // rung 5 — the flat pre-S17 field
    | 'type'        // rung 6 — the system type's finish colour
    | 'default';    // rung 7 — nothing was ever named

export interface DoorFinishColour {
    readonly hex: string;
    readonly state: DoorFinishColourState;
    /** The id involved, when there was one — for the diagnostic and for the panel. */
    readonly materialId?: string;
    /** Why, when the state is `unresolved`. Never a colour. */
    readonly reason?: string;
}

/** The finish layer and flat colour field this slot reads. */
function slotFields(
    door: Pick<DoorOpening, 'frameColor' | 'leafColor' | 'frameFinish' | 'leafFinish'>,
    slot: DoorFinishSlot,
): { finish: DoorFinishLayerData | undefined; flat: string | undefined } {
    return slot === 'frame'
        ? { finish: door.frameFinish, flat: door.frameColor }
        : { finish: door.leafFinish, flat: door.leafColor };
}

const norm = (c: string | undefined): string => (c ?? '').trim().toLowerCase();

/**
 * Resolve one of a door's two material surfaces to a hex, by C100 §2.1's ladder.
 *
 * Pure: no store reads, no THREE, no DOM — so a headless test can drive it with a
 * plain record and assert the MASTER's hex, which is what C100 §9.6.c step 3
 * requires of every family this slice touches.
 *
 * @param typeFinishColor the system TYPE's finish colour for this slot, when the
 *   caller has resolved the type (rung 6). Passed in rather than read here so this
 *   function stays store-free; `DoorBuilder` already holds the resolved type.
 */
export function resolveDoorFinishColour(
    door: Pick<DoorOpening, 'frameColor' | 'leafColor' | 'frameFinish' | 'leafFinish'>,
    slot: DoorFinishSlot,
    familyDefault: string = DOOR_COLOR_SENTINEL,
    typeFinishColor?: string,
): DoorFinishColour {
    const { finish, flat } = slotFields(door, slot);
    const finishHex = norm(finish?.materialColor);
    const flatHex = norm(flat);
    const materialId = finish?.materialId?.trim() || undefined;

    // ── 1. An explicit user OVERRIDE (C100 §2.1 step 1) ──────────────────────
    // The flat field disagrees with the finish it is DERIVED from (DoorTypes.ts's
    // own word), and is not the untouched schema default. Only a hand edit — the
    // Frame/Leaf Colour picker — produces that state.
    if (flatHex && flatHex !== DOOR_COLOR_SENTINEL && flatHex !== finishHex) {
        return { hex: flatHex, state: 'override', ...(materialId ? { materialId } : {}) };
    }

    // ── 2/3. The material the door REFERENCES (C100 §2.1 step 2, then §5) ────
    if (materialId) {
        // ⚠ ONE ladder. Not re-implemented: C100 §9.6.a, and C100 §1.1's finding
        // that a private T2+T1 chain is how the next rival vocabulary gets written.
        const r = resolveMaterialColour(materialId, undefined);
        if (r.state !== 'unresolved') {
            return { hex: r.hex.toLowerCase(), state: 'resolved', materialId };
        }
        return {
            hex: DOOR_UNRESOLVED_MATERIAL_COLOR,
            state: 'unresolved',
            materialId,
            reason: r.reason,
        };
    }

    // ── 4. A finish hex with NO id — the name is already irrecoverably lost ──
    if (finishHex) return { hex: finishHex, state: 'cached' };

    // ── 5. The flat pre-S17 field, so older doors render byte-identically ────
    if (flatHex && flatHex !== DOOR_COLOR_SENTINEL) return { hex: flatHex, state: 'legacy' };

    // ── 6. The system TYPE's finish (WindowBuilder._resolveFrameColor step 2) ─
    const typeHex = norm(typeFinishColor);
    if (typeHex) return { hex: typeHex, state: 'type' };

    // ── 7. Nothing was ever named ────────────────────────────────────────────
    return { hex: norm(familyDefault) || DOOR_COLOR_SENTINEL, state: 'default' };
}
