/**
 * §CW-3 / C87 §13.5 — THE CURTAIN-WALL DOOR PROJECTION.
 *
 * ─── WHY THIS FILE EXISTS, AND IT IS THE PRICE OF THE C15 DECISION ───────────
 *
 * C87 §13.5 CW-Door-1 asked whether a curtain-wall door is (a) a C15 hosted
 * opening or (b) a panel KIND that replaces a grid cell. **The decision taken
 * 2026-08-19 is (b)** — the reasoning and its citations live in C87 §13.5 and are
 * NOT restated here, because a decision restated in two places is a decision that
 * will diverge.
 *
 * (b) has one cost, and this module is it. C87 §13.5 states it plainly:
 *
 *   > "(b) means a curtain-wall door is not a `door` for C86's purposes, and every
 *   >  consumer that enumerates doors (schedules, IFC, the door property panel)
 *   >  must be told which answer holds."
 *
 * The wrong way to pay that is for each consumer to learn the rule
 * (`panelType === 'SystemPanel_Door'`) and re-derive it. That is how a repo ends
 * up with three rival vocabularies for one concept — §9 measured exactly that for
 * `PanelType`/`PanelKind`, and C84 EI-9 forbids the second answer. So there is ONE
 * enumerator, here, and a consumer asking "what doors exist in this model" gets one
 * list assembled from two HOMES rather than two rival lists.
 *
 * ─── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *
 * It does NOT synthesise `DoorData` records. A curtain-wall door has no `offset`
 * along a baseline, no `openings[]` entry and no void cut — inventing a `DoorData`
 * for it would require fabricating an offset, and a fabricated coordinate that
 * looks real is worse than an absent one. `CurtainWallDoorRef` is a DISTINCT shape,
 * and its distinctness is the point: a consumer that cannot handle it must fail to
 * compile rather than silently mis-place a door.
 *
 * ⚠ **DECLARED ABSENCE (C84 EI-6, C87 CW-Door-2): IFC EXPORT DOES NOT CONSUME THIS
 * YET.** `CurtainWallReader.ts` reads the wall store only, so a curtain-wall door is
 * invisible to IFC today. That was measured and stated in C87 §13.5 before this
 * module was written; it is repeated here so a reader of the code — not only a
 * reader of the contract — knows the projection exists and who has not yet called
 * it. Wiring it is a `packages/interop` change and is NOT this lane's.
 */

import type { CurtainPanelData, CurtainPanelHostedDoor } from './CurtainPanelTypes';
import { DEFAULT_HOSTED_DOOR } from './CurtainPanelTypes';

/**
 * One curtain-wall door, as seen by a consumer that enumerates doors.
 *
 * The address is `(curtainWallId, cellIndex)` — NOT a world coordinate and NOT an
 * offset — because that is the only address the model actually holds. Resolving it
 * to world space needs the parent wall's `baseLine` + `gridSystem`, which is the
 * caller's business and is exactly the coupling this shape refuses to hide.
 */
export interface CurtainWallDoorRef {
    /** The panel record that IS the door. There is no separate door element. */
    readonly panelId: string;
    readonly curtainWallId: string;
    /** `[column, row]` in the parent's `CurtainGridSystem`. */
    readonly cellIndex: readonly [number, number];
    /** The authored config, with defaults filled in — never partial. */
    readonly door: CurtainPanelHostedDoor;
    /**
     * TRUE when the panel is typed as a door but carries no authored `hostedDoor`
     * record, so `door` above is entirely defaults.
     *
     * ⭐ THIS FLAG IS THE FINDING, NOT A CONVENIENCE. `buildDoorObject` spreads
     * `DEFAULT_HOSTED_DOOR` at BUILD time, so such a panel RENDERS as a correct
     * door while storing nothing — and `isAuthoredPanel` therefore persists only
     * its `panelType`. A schedule that reported the defaults as authored values
     * would be reporting a number nobody chose. `ReplacePanelTypeCommand` now
     * materialises the defaults at authoring time so new doors are never in this
     * state; the flag exists for the ones created before that, and for any future
     * path that types a cell without going through the command.
     */
    readonly usingDefaults: boolean;
}

/** The one place the rule "which panel type is a door" is written. */
export function isCurtainWallDoorPanel(panel: Pick<CurtainPanelData, 'panelType'>): boolean {
    return panel.panelType === 'SystemPanel_Door';
}

/**
 * Enumerate every curtain-wall door among `panels`.
 *
 * Deterministic order — by `curtainWallId`, then column, then row — so a schedule
 * or an export produces the same rows twice for the same model (C73 §1.1 applied to
 * identity, the same reasoning C87 CW-Sel-1 gives for the TAB ring). Iteration
 * order of a store's map is NOT a contract and must never be the source of a row
 * order the user sees.
 */
export function collectCurtainWallDoors(
    panels: Iterable<CurtainPanelData>,
): CurtainWallDoorRef[] {
    const out: CurtainWallDoorRef[] = [];
    for (const p of panels) {
        if (!isCurtainWallDoorPanel(p)) continue;
        const authored = p.hostedDoor;
        out.push({
            panelId: p.id,
            curtainWallId: p.curtainWallId,
            cellIndex: [p.cellIndex[0], p.cellIndex[1]],
            door: { ...DEFAULT_HOSTED_DOOR, ...(authored ?? {}) },
            usingDefaults: authored === undefined,
        });
    }
    out.sort((a, b) =>
        a.curtainWallId < b.curtainWallId ? -1 :
        a.curtainWallId > b.curtainWallId ? 1 :
        a.cellIndex[0] - b.cellIndex[0] ||
        a.cellIndex[1] - b.cellIndex[1]);
    return out;
}

/**
 * How many doors a given curtain wall carries.
 *
 * Exists so a caller that only wants the count does not have to build the full
 * list and does not have to re-implement the predicate — the second of which is
 * the thing this module is here to prevent.
 */
export function countCurtainWallDoors(
    panels: Iterable<CurtainPanelData>,
    curtainWallId?: string,
): number {
    let n = 0;
    for (const p of panels) {
        if (!isCurtainWallDoorPanel(p)) continue;
        if (curtainWallId !== undefined && p.curtainWallId !== curtainWallId) continue;
        n++;
    }
    return n;
}
