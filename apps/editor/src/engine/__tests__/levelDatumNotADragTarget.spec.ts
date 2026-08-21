/**
 * §LEVEL-Z-IS-NOT-A-DRAG-TARGET (L-1868)
 *
 * THE REPORT (founder, production, 2026-08-21):
 *   *"In elevation view — the crop view is sound, works great — but I often move the level
 *    or the floor finish. First floor finish and slabs are meant to be hosted — they are
 *    level-based — so they should NOT move in the Z axis unless the user changes the base
 *    offset."*
 *
 * His console, logged WHILE HE WAS CROPPING the South Elevation:
 *
 *     [CommandManager] EXECUTE: UPDATE_LEVEL
 *     Level elevation updated: L1787150975010 3.079
 *     Level elevation updated: L1787150975010 2.875
 *     Level elevation updated: L1787150975010 4.182
 *     Level elevation updated: L0 0.023          ← the GROUND DATUM, nudged off zero
 *     Level elevation updated: L5-1787153736228 19.718
 *
 * followed by repeated Ctrl+Z (`UNDO: UPDATE_LEVEL … history remaining: 23`). A 23 mm move
 * of L0 is a SILENT STRUCTURAL CHANGE made while the user believed he was cropping.
 *
 * ─── THE TWO GUARDS THIS PINS ──────────────────────────────────────────────────
 * `PlanViewInteraction._onMouseDown` armed a level drag on ANY mousedown within 10 px of a
 * datum line — and a datum line spans the FULL WIDTH of an elevation. Two independent
 * floors now stand between a crop gesture and a structural edit:
 *
 *   A. SELECTION GATE — the first press on an unselected line SELECTS it and arms nothing.
 *      Only a press on the ALREADY-SELECTED line arms the drag. This is the convention the
 *      file already uses for `_hitTestMarkOrigin` (L-305) and the hosted-element handle,
 *      and `PlanViewCanvas` already stored + rendered `_selectedLevelId`; it simply never
 *      gated the drag.
 *   B. PIXEL FLOOR — the commit test was `> 0.001 m` ALONE, which commits on a one-pixel
 *      slip. It now also requires `LEVEL_DRAG_MIN_TRAVEL_PX` of vertical travel.
 *
 * ⚠ HONEST SCOPE: these drive the two DECISION RULES in isolation, reproduced from the
 * production source. They do NOT construct a `PlanViewInteraction` (which needs a canvas,
 * a `PlanViewCanvas`, a BimManager and a runtime bus), and this is NOT a browser
 * verification. Part (b) of the founder's request — double-click to edit the boundary in
 * isolation — is NOT implemented; see L-1869.
 */

import { describe, it, expect } from 'vitest';

/** Mirrors the production constant: CLICK_MAX_DRAG_PX (5) + 1. */
const LEVEL_DRAG_MIN_TRAVEL_PX = 6;

/** GUARD A, as written in `_onMouseDown`. */
function armsLevelDrag(hitLevelId: string | null, selectedLevelId: string | null): boolean {
    if (!hitLevelId) return false;
    return selectedLevelId === hitLevelId;
}

/** GUARD B, as written in the pointerup commit. */
function commitsElevation(startSy: number, endSy: number, startElevation: number, newElevation: number): boolean {
    const rounded = Math.round(newElevation * 1000) / 1000;
    const travelPx = Math.abs(endSy - startSy);
    return travelPx >= LEVEL_DRAG_MIN_TRAVEL_PX && Math.abs(rounded - startElevation) > 0.001;
}

describe('§LEVEL-Z-IS-NOT-A-DRAG-TARGET (L-1868) — GUARD A: select before you may drag', () => {
    it('a press on an UNSELECTED datum line arms NO drag — the founder\'s crop gesture', () => {
        expect(armsLevelDrag('L0', null)).toBe(false);
        expect(armsLevelDrag('L0', 'L1')).toBe(false);
    });

    it('a press on the ALREADY-SELECTED line arms the drag — the capability is kept, not removed', () => {
        expect(armsLevelDrag('L0', 'L0')).toBe(true);
    });

    it('a press on no line at all arms nothing, selected or not', () => {
        expect(armsLevelDrag(null, 'L0')).toBe(false);
        expect(armsLevelDrag(null, null)).toBe(false);
    });

    it('⭐ REGRESSION: the OLD rule armed on every hit regardless of selection', () => {
        const oldRule = (hitLevelId: string | null) => hitLevelId !== null;
        // Same input, two verdicts — this is precisely the behaviour change.
        expect(oldRule('L0')).toBe(true);
        expect(armsLevelDrag('L0', null)).toBe(false);
    });
});

describe('§LEVEL-Z-IS-NOT-A-DRAG-TARGET (L-1868) — GUARD B: a slip is not a datum edit', () => {
    it('⭐ REGRESSION: 2 px of slip producing 23 mm no longer commits — this IS L0 → 0.023', () => {
        // The founder's ground datum, moved 23 mm by a couple of pixels of jitter.
        expect(commitsElevation(400, 402, 0, 0.023)).toBe(false);
        // …whereas the old metre-only test would have committed it.
        expect(Math.abs(0.023 - 0) > 0.001).toBe(true);
    });

    it('a deliberate drag past the pixel floor still commits', () => {
        expect(commitsElevation(400, 430, 3.0, 3.079)).toBe(true);
    });

    it('exactly at the pixel floor commits; one pixel below does not', () => {
        expect(commitsElevation(400, 400 + LEVEL_DRAG_MIN_TRAVEL_PX, 3.0, 3.05)).toBe(true);
        expect(commitsElevation(400, 400 + LEVEL_DRAG_MIN_TRAVEL_PX - 1, 3.0, 3.05)).toBe(false);
    });

    it('BOTH floors are required — a long drag that lands back where it started does not commit', () => {
        expect(commitsElevation(400, 480, 3.0, 3.0)).toBe(false);
    });

    it('the pixel floor is at least the file\'s own click threshold — a CLICK cannot be a datum edit', () => {
        const CLICK_MAX_DRAG_PX = 5;
        expect(LEVEL_DRAG_MIN_TRAVEL_PX).toBeGreaterThan(CLICK_MAX_DRAG_PX);
    });

    it('direction is irrelevant — an upward slip is rejected exactly like a downward one', () => {
        expect(commitsElevation(400, 398, 0, 0.023)).toBe(false);
        expect(commitsElevation(400, 370, 3.0, 3.079)).toBe(true);
    });
});
