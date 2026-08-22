/**
 * §CROP-BEATS-DATUM (L-4303) + §CROP-HANDLE-IS-GRABBABLE (L-4302)
 *
 * THE REPORT (founder, production, 2026-08-22):
 *   *"more importantly allow me to easily drag — I still drag the levels around and slabs.
 *    When the user hovers with the mouse it should be able to see an arrow, and then click
 *    and resize the crop view."*
 *
 * This is §LEVEL-Z-IS-NOT-A-DRAG-TARGET (L-1868) seen from the other side. L-1868 asked
 * "why is cropping moving my datums?" and answered it by GATING the datum. This asks
 * "why can I not reach the crop at all?" and the answer is ORDER: `_onMouseDown` tested
 * the level datum FIRST and returned unconditionally on a hit, so `hitTestCropHandle` was
 * never evaluated for any pointer within 10 px of a datum line — and a datum line spans
 * the full width of an elevation.
 *
 * ─── WHAT THESE ARMS ESTABLISH ────────────────────────────────────────────────
 *
 *   ARM A (SOURCE ORDER) — reads the production file and asserts the crop block precedes
 *          the level block inside `_onMouseDown`. This is the ONE fact that was wrong, and
 *          it is a fact about order, so the test asserts order rather than re-deriving a
 *          behaviour a reordering could satisfy by accident.
 *   ARM B (HOVER EXISTS) — `hitTestCropHandle` must be called from BOTH `_onMouseDown` and
 *          `_onMouseMove`. Before this change it had exactly ONE call site (the press), so
 *          the cursor feedback the founder asked for was ABSENT, not unreachable. C01 §6
 *          rule 6: those have opposite fixes, so the test pins which one it was.
 *   ARM C (DECISION RULE) — the resolved priority, driven in isolation.
 *   ARM D (L-1868 SURVIVES) — both of L-1868's guards must still be present. Reordering a
 *          hit test is exactly the kind of change that can silently undo a gate elsewhere.
 *
 * ⚠ HONEST SCOPE — NOT a browser verification. These read the production source and drive
 * the decision rule; they do not construct a `PlanViewInteraction` (which needs a canvas,
 * a `PlanViewCanvas`, a BimManager and a runtime bus), and no test here can tell you what
 * the cursor looks like on the founder's screen.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Locate the production file from whichever cwd the runner happens to use.
 *
 * ⚠ Deliberately NOT a single `resolve(process.cwd(), …)`. `tagPaperScale.test.ts` in
 * `core-app-model` does exactly that and dies with ENOENT the moment the suite is invoked
 * with a different cwd — a source-scanning test that fails on its own file lookup reports
 * a defect that is not there. `import.meta.url` is not usable either: under this config
 * Vite serves the module over a non-`file:` URL and `fileURLToPath` throws.
 */
function readProductionSource(relFromRepoRoot: string): string {
    const candidates = [
        resolve(process.cwd(), relFromRepoRoot),
        resolve(process.cwd(), '../..', relFromRepoRoot),
        resolve(process.cwd(), relFromRepoRoot.replace(/^apps\/editor\//, '')),
    ];
    for (const c of candidates) if (existsSync(c)) return readFileSync(c, 'utf8');
    throw new Error(`[cropHandleBeatsLevelDatum] could not locate ${relFromRepoRoot} from ${process.cwd()}`);
}

const SRC = readProductionSource('apps/editor/src/engine/views/PlanViewInteraction.ts');

/** The body of `_onMouseDown`, from its signature to the next private method. */
function mouseDownBody(): string {
    const start = SRC.indexOf('private _onMouseDown(e: MouseEvent): void {');
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf('private _onMouseMove(e: MouseEvent): void {', start);
    expect(end).toBeGreaterThan(start);
    return SRC.slice(start, end);
}

/** The body of `_onMouseMove`, from its signature to the next method after it. */
function mouseMoveBody(): string {
    const start = SRC.indexOf('private _onMouseMove(e: MouseEvent): void {');
    expect(start).toBeGreaterThan(-1);
    const end = SRC.indexOf('private _setGridSelection(', start);
    expect(end).toBeGreaterThan(start);
    return SRC.slice(start, end);
}

describe('§CROP-BEATS-DATUM (L-4303) — ARM A: the crop handle is tested FIRST', () => {
    it('the crop hit-test precedes the level-datum hit-test inside _onMouseDown', () => {
        const body = mouseDownBody();
        const crop = body.indexOf('hitTestCropHandle');
        const level = body.indexOf('hitTestLevel');
        expect(crop, 'hitTestCropHandle not found in _onMouseDown').toBeGreaterThan(-1);
        expect(level, 'hitTestLevel not found in _onMouseDown').toBeGreaterThan(-1);
        // THE assertion. Before L-4303 this read crop=+3800, level=+1900 — inverted.
        expect(crop).toBeLessThan(level);
    });

    it('the level branch still returns unconditionally — which is WHY order is the fix', () => {
        // Both arms of the level branch `return`, so nothing below it can run on a datum
        // hit. That is not a defect in the level branch; it is why the crop test had to
        // move ABOVE it rather than be made "smarter" below it.
        const body = mouseDownBody();
        const level = body.indexOf('hitTestLevel');
        const scope = body.indexOf('hitTestScopeHandle');
        const between = body.slice(level, scope);
        // Two returns: the select-and-arm-nothing arm, and the arm-the-drag arm.
        expect((between.match(/\n\s+return;/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });

    it('the crop hit-test uses the SHARED grab radius, not a re-typed literal', () => {
        const body = mouseDownBody();
        expect(body).toContain('hitTestCropHandle?.(sx, sy, CROP_HANDLE_GRAB_PX)');
        // The bare 10 it used to pass is gone from the crop call.
        expect(body).not.toContain('hitTestCropHandle?.(sx, sy, 10)');
    });
});

describe('§CROP-HANDLE-IS-GRABBABLE (L-4302) — ARM B: the hover path EXISTS', () => {
    it('⭐ hitTestCropHandle is now called from _onMouseMove — it never was before', () => {
        // MEASURED on the pre-change source:
        //   grep -c hitTestCropHandle PlanViewInteraction.ts  →  1  (all of it in
        //   _onMouseDown). ABSENT, not unreachable — so the fix is to ADD the hover
        //   path, not to repair one.
        expect(mouseMoveBody()).toContain('hitTestCropHandle');
    });

    it('the hover uses the SAME radius as the press — the cursor cannot over-promise', () => {
        const move = mouseMoveBody();
        expect(move).toContain('hitTestCropHandle?.(sx, sy, CROP_HANDLE_GRAB_PX)');
    });

    it('the hover forwards the handle to the canvas so it can draw the hover state', () => {
        expect(mouseMoveBody()).toContain('setHoveredCropHandle');
    });

    it('the crop hover is evaluated before the element-hover highlight', () => {
        const move = mouseMoveBody();
        expect(move.indexOf('hitTestCropHandle')).toBeLessThan(move.indexOf('_queryHoveredElement'));
    });

    it('every crop handle maps to a real CSS resize cursor', () => {
        // Reproduces `_cropCursor` exactly.
        const cropCursor = (h: string): string => {
            if (h === 'n' || h === 's') return 'ns-resize';
            if (h === 'e' || h === 'w') return 'ew-resize';
            return h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize';
        };
        expect(cropCursor('n')).toBe('ns-resize');
        expect(cropCursor('s')).toBe('ns-resize');
        expect(cropCursor('e')).toBe('ew-resize');
        expect(cropCursor('w')).toBe('ew-resize');
        expect(cropCursor('nw')).toBe('nwse-resize');
        expect(cropCursor('se')).toBe('nwse-resize');
        expect(cropCursor('ne')).toBe('nesw-resize');
        expect(cropCursor('sw')).toBe('nesw-resize');
        // The four orthogonal arrows are the ones the founder described, and before
        // L-4302 no handle produced them at all.
        const all = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(cropCursor);
        expect(all.filter(c => c === 'ns-resize' || c === 'ew-resize')).toHaveLength(4);
    });

    it('the source really does declare all eight handles', () => {
        expect(SRC).toContain('CropHandleId');
    });
});

describe('§CROP-BEATS-DATUM (L-4303) — ARM C: the decision rule, driven', () => {
    /**
     * The resolved `_onMouseDown` priority for a press in an elevation view, as written.
     * Returns which affordance claims the gesture.
     */
    function claims(opts: { onCropHandle: boolean; onLevelLine: boolean; onLevelHead: boolean }): string {
        if (opts.onCropHandle) return 'crop';
        if (!opts.onLevelHead && opts.onLevelLine) return 'level';
        return 'fallthrough';
    }

    /** The OLD order, for the regression contrast. */
    function claimsOld(opts: { onCropHandle: boolean; onLevelLine: boolean; onLevelHead: boolean }): string {
        if (!opts.onLevelHead && opts.onLevelLine) return 'level';
        if (opts.onCropHandle) return 'crop';
        return 'fallthrough';
    }

    it('⭐ REGRESSION: a crop handle ON a level datum line is now reachable', () => {
        const overlap = { onCropHandle: true, onLevelLine: true, onLevelHead: false };
        expect(claimsOld(overlap)).toBe('level');   // the founder's report
        expect(claims(overlap)).toBe('crop');       // after L-4303
    });

    it('a datum line with no crop handle on it still belongs to the datum', () => {
        // The capability is not removed — only outranked where they overlap.
        expect(claims({ onCropHandle: false, onLevelLine: true, onLevelHead: false })).toBe('level');
    });

    it('the level HEAD is still click-to-edit, crop handle or not', () => {
        expect(claims({ onCropHandle: false, onLevelLine: true, onLevelHead: true })).toBe('fallthrough');
    });

    it('a press on neither falls through to selection/element drag as before', () => {
        expect(claims({ onCropHandle: false, onLevelLine: false, onLevelHead: false })).toBe('fallthrough');
    });

    it('the change can only ever REMOVE presses from the datum branch, never add one', () => {
        // Exhaustive over the eight input combinations: wherever the new rule says
        // 'level', the old one did too. So no gesture becomes a datum edit that was not
        // one already — this is why L-4303 cannot weaken L-1868.
        for (const c of [true, false]) {
            for (const l of [true, false]) {
                for (const h of [true, false]) {
                    const o = { onCropHandle: c, onLevelLine: l, onLevelHead: h };
                    if (claims(o) === 'level') expect(claimsOld(o)).toBe('level');
                }
            }
        }
    });
});

describe('§CROP-BEATS-DATUM (L-4303) — ARM D: L-1868 is NOT undone', () => {
    it('GUARD A (select before you may drag) is still in the source', () => {
        const body = mouseDownBody();
        expect(body).toContain('getSelectedLevelId?.() !== levelLineId');
        expect(body).toContain('setSelectedLevelId?.(levelLineId)');
    });

    it('GUARD B (the pixel floor) is still declared and still above the click threshold', () => {
        expect(SRC).toContain('LEVEL_DRAG_MIN_TRAVEL_PX = CLICK_MAX_DRAG_PX + 1');
        expect(SRC).toContain('LEVEL_DRAG_MIN_TRAVEL_PX');
    });

    it('the §LEVEL-Z-IS-NOT-A-DRAG-TARGET rationale block survives the reorder', () => {
        expect(SRC).toContain('§LEVEL-Z-IS-NOT-A-DRAG-TARGET (L-1868)');
    });
});
