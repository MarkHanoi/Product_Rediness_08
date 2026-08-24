/**
 * §PRESETS-MUST-PLACE (L-10686) — the six layout-preset buttons now MOVE
 * viewports, and every assertion below is a position in MILLIMETRES.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 * The founder clicked all six presets — Single View Centred · Plan + Two
 * Sections · Plan + Detail Column · Four Up · Schedule Sheet · Detail Sheet —
 * and nothing on the page moved.
 *
 * Measured: `ApplySheetLayoutPresetCommand.execute()` wrote `sheet.layoutRules`
 * and stopped. `layoutEngine.resolve()` had ZERO production callers and
 * `ResolvedPosition` zero consumers, so no rule was ever turned into a
 * `SheetViewport.position`. The buttons stored intent and moved nothing —
 * the same family as the scale dropdown that displayed one value and dispatched
 * nothing (L-10682), which he also reported as a bug.
 *
 * ─── WHY MILLIMETRES, NOT "IT RAN" ─────────────────────────────────────────
 * ⛔ A test asserting `result.success === true` PASSES ON TODAY'S HEAD — the
 * command has always returned success, because writing the rules always worked.
 * A test asserting "layoutRules.length > 0" passes too. The ONLY assertion that
 * separates the defect from the fix is where the viewport ENDED UP, in paper
 * millimetres. Every `expect` below is one of those.
 *
 * ─── TWO PRESETS WERE ALSO WRONG ON THEIR OWN TERMS ────────────────────────
 * `plan-two-sections` anchored BOTH sections to `edge:'bottom'`, and every
 * `bottom` anchor resolves to the same horizontally-centred x — so the two
 * sections landed on the IDENTICAL point, one hidden under the other, against a
 * description reading "bottom-left" and "bottom-right". `plan-detail-column`
 * pushed its second rule at `details[0]` instead of `details[1]`, so details
 * 2..n received no rule at all. Both are asserted below: six buttons that place
 * viewports WRONGLY would just be the same complaint in a new form.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sheetStore } from '@pryzm/core-app-model';
import type { LayoutPresetKey } from '@pryzm/core-app-model';
import { ApplySheetLayoutPresetCommand } from '../src/views/ApplySheetLayoutPresetCommand';
import type { LayoutBlockSizeMm } from '../src/views/ApplySheetLayoutPresetCommand';
import type { CommandContext } from '../src/types';

// A1 landscape minus the 160 mm title-block strip — the numbers the sheet
// editor now passes (`template.paperWidth - template.borderWidth`).
const PAPER_W = 841 - 160;   // 681 mm usable
const PAPER_H = 594;         // mm
const MARGIN  = 10;          // mm

const CTX = {} as CommandContext;

/** Every viewport is 200 × 150 mm so the expected millimetres below are
 *  arithmetic anyone can check by hand, not a snapshot. */
const VP_W = 200;
const VP_H = 150;

let sheetId: string;

function makeSheet(viewportCount: number): string {
    const id = 'sheet-preset-test';
    sheetStore.create({
        id,
        sheetNumber: 'A101',
        name:        'Preset Test Sheet',
        titleBlock:  'a1-standard',
    });
    for (let i = 0; i < viewportCount; i++) {
        sheetStore.addViewport(id, {
            id:       `vp-${i}`,
            viewId:   `view-${i}`,
            // A deliberately silly starting position: every assertion below
            // therefore proves the preset MOVED it, not that it happened to
            // agree with where it already was.
            position: { x: 5 + i, y: 7 + i },
            scale:    100,
        });
    }
    return id;
}

function sizes(n: number): LayoutBlockSizeMm[] {
    return Array.from({ length: n }, (_, i) => ({ id: `vp-${i}`, w: VP_W, h: VP_H }));
}

function apply(presetKey: LayoutPresetKey, n: number) {
    const cmd = new ApplySheetLayoutPresetCommand({
        sheetId,
        presetKey,
        paperW:   PAPER_W,
        paperH:   PAPER_H,
        marginMm: MARGIN,
        blockSizes: sizes(n),
    });
    expect(cmd.canExecute(CTX).ok).toBe(true);
    const res = cmd.execute(CTX);
    expect(res.success).toBe(true);
    return cmd;
}

function posOf(id: string): { x: number; y: number } {
    const sheet = sheetStore.get(sheetId)!;
    const vp = sheet.viewports.find(v => v.id === id);
    expect(vp, `viewport '${id}' must exist`).toBeDefined();
    return vp!.position;
}

beforeEach(() => {
    sheetStore.reset();
});

describe('LP-1 — single-centred actually centres, in millimetres', () => {
    it('places the one viewport at the centre of the USABLE paper', () => {
        sheetId = makeSheet(1);
        expect(posOf('vp-0')).toEqual({ x: 5, y: 7 });   // pre-condition

        apply('single-centred', 1);

        // centre = (usableW/2 − w/2, paperH/2 − h/2)
        expect(posOf('vp-0')).toEqual({
            x: PAPER_W / 2 - VP_W / 2,   // 340.5 − 100 = 240.5 mm
            y: PAPER_H / 2 - VP_H / 2,   // 297   −  75 = 222   mm
        });
    });

    it('the viewport is no longer where it started — the button MOVES the page', () => {
        sheetId = makeSheet(1);
        const before = { ...posOf('vp-0') };
        apply('single-centred', 1);
        expect(posOf('vp-0')).not.toEqual(before);
    });
});

describe('LP-2 — plan-two-sections puts the two sections in DIFFERENT corners', () => {
    it('plan top-centre, section A bottom-LEFT, section B bottom-RIGHT', () => {
        sheetId = makeSheet(3);
        apply('plan-two-sections', 3);

        const plan = posOf('vp-0');
        const a    = posOf('vp-1');
        const b    = posOf('vp-2');

        // Plan: horizontally centred, top edge one margin + 10 mm offset down.
        expect(plan).toEqual({
            x: PAPER_W / 2 - VP_W / 2,              // 240.5 mm
            y: PAPER_H - MARGIN - 10 - VP_H,        // 594 − 10 − 10 − 150 = 424 mm
        });

        // Section A — bottom-left corner.
        expect(a).toEqual({ x: MARGIN + 10, y: MARGIN + 10 });          // (20, 20) mm
        // Section B — bottom-right corner.
        expect(b).toEqual({ x: PAPER_W - MARGIN - 10 - VP_W, y: 20 });  // (461, 20) mm
    });

    it('⛔ the two sections do NOT land on the same point (the old rules gave both the same x,y)', () => {
        sheetId = makeSheet(3);
        apply('plan-two-sections', 3);
        expect(posOf('vp-1')).not.toEqual(posOf('vp-2'));
        // And they are far apart, not merely un-equal.
        expect(Math.abs(posOf('vp-2').x - posOf('vp-1').x)).toBeGreaterThan(400);
    });
});

describe('LP-3 — plan-detail-column arranges EVERY detail, not just the first', () => {
    it('the plan goes left; details 1, 2 and 3 stack DOWNWARD in the right-hand column', () => {
        sheetId = makeSheet(4);
        apply('plan-detail-column', 4);

        const plan = posOf('vp-0');
        expect(plan.x).toBe(MARGIN + MARGIN);                       // anchored left, offset = marginMm

        const colX = PAPER_W - MARGIN - MARGIN - VP_W;              // 681 − 10 − 10 − 200 = 461 mm
        const topY = PAPER_H - MARGIN - MARGIN - VP_H;              // 594 − 10 − 10 − 150 = 424 mm

        expect(posOf('vp-1')).toEqual({ x: colX, y: topY });                  // (461, 424) mm
        expect(posOf('vp-2')).toEqual({ x: colX, y: topY - (VP_H + 10) });    // (461, 264) mm
        expect(posOf('vp-3')).toEqual({ x: colX, y: topY - (VP_H + 10) * 2 }); // (461, 104) mm
    });

    it('⛔ details 2 and 3 moved at all — the old build() targeted details[0] twice and left them behind', () => {
        sheetId = makeSheet(4);
        apply('plan-detail-column', 4);
        expect(posOf('vp-2')).not.toEqual({ x: 7, y: 9 });
        expect(posOf('vp-3')).not.toEqual({ x: 8, y: 10 });
        // All three details share one column x.
        expect(posOf('vp-1').x).toBe(posOf('vp-2').x);
        expect(posOf('vp-2').x).toBe(posOf('vp-3').x);
        // And are strictly descending down the page.
        expect(posOf('vp-1').y).toBeGreaterThan(posOf('vp-2').y);
        expect(posOf('vp-2').y).toBeGreaterThan(posOf('vp-3').y);
    });
});

describe('LP-4 — four-up is a real 2×2 grid, measured', () => {
    it('four distinct cells, evenly pitched, all inside the usable paper', () => {
        sheetId = makeSheet(4);
        apply('four-up', 4);

        const usableW = PAPER_W - MARGIN * 2;   // 661
        const usableH = PAPER_H - MARGIN * 2;   // 574
        const cellW   = (usableW - 10) / 2;     // cellPadding 10 → 325.5
        const cellH   = (usableH - 10) / 2;     // 282

        expect(posOf('vp-0')).toEqual({ x: MARGIN,                   y: MARGIN });
        expect(posOf('vp-1')).toEqual({ x: MARGIN + cellW + 10,      y: MARGIN });
        expect(posOf('vp-2')).toEqual({ x: MARGIN,                   y: MARGIN + cellH + 10 });
        expect(posOf('vp-3')).toEqual({ x: MARGIN + cellW + 10,      y: MARGIN + cellH + 10 });

        const all = ['vp-0', 'vp-1', 'vp-2', 'vp-3'].map(posOf);
        expect(new Set(all.map(p => `${p.x},${p.y}`)).size).toBe(4);
        for (const p of all) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThanOrEqual(PAPER_W);
            expect(p.y).toBeLessThanOrEqual(PAPER_H);
        }
    });
});

describe('LP-5 — schedule-sheet and detail-sheet place too', () => {
    it('schedule-sheet: one at the top, one at the bottom, different y', () => {
        sheetId = makeSheet(2);
        apply('schedule-sheet', 2);
        expect(posOf('vp-0').y).toBe(PAPER_H - MARGIN - MARGIN - VP_H);   // 424
        expect(posOf('vp-1').y).toBe(MARGIN + MARGIN);                    // 20
        expect(posOf('vp-0').y).toBeGreaterThan(posOf('vp-1').y);
    });

    it('detail-sheet: nine viewports land on the nine 3×3 cell origins, in mm', () => {
        sheetId = makeSheet(9);
        apply('detail-sheet', 9);

        // usable 661 × 574, cellPadding 8 → cell 215 × 186, pitch 223 × 194.
        const cellW = (PAPER_W - MARGIN * 2 - 8 * 2) / 3;   // 215
        const cellH = (PAPER_H - MARGIN * 2 - 8 * 2) / 3;   // 186
        for (let i = 0; i < 9; i++) {
            expect(posOf(`vp-${i}`), `vp-${i}`).toEqual({
                x: MARGIN + (i % 3) * (cellW + 8),
                y: MARGIN + Math.floor(i / 3) * (cellH + 8),
            });
        }
        // ⛔ Distinctness alone would PASS on today's HEAD, because the nine
        // viewports start at nine distinct positions and none of them move.
        const keys = Array.from({ length: 9 }, (_, i) => posOf(`vp-${i}`)).map(p => `${p.x},${p.y}`);
        expect(new Set(keys).size).toBe(9);
    });
});

describe('LP-6 — undo restores the arrangement the user had', () => {
    it('every viewport returns to the exact millimetre it started at', () => {
        sheetId = makeSheet(4);
        const before = ['vp-0', 'vp-1', 'vp-2', 'vp-3'].map(id => ({ id, ...posOf(id) }));

        const cmd = apply('four-up', 4);
        // Sanity: they really moved.
        for (const b of before) expect(posOf(b.id)).not.toEqual({ x: b.x, y: b.y });

        expect(cmd.undo(CTX).success).toBe(true);
        for (const b of before) expect(posOf(b.id)).toEqual({ x: b.x, y: b.y });
    });

    it('undo also restores the previous layoutRules', () => {
        sheetId = makeSheet(2);
        expect(sheetStore.get(sheetId)!.layoutRules ?? []).toEqual([]);
        const cmd = apply('single-centred', 2);
        expect((sheetStore.get(sheetId)!.layoutRules ?? []).length).toBeGreaterThan(0);
        cmd.undo(CTX);
        expect(sheetStore.get(sheetId)!.layoutRules ?? []).toEqual([]);
    });
});

describe('LP-7 — a viewport whose size could not be measured is still ARRANGED', () => {
    it('falls back to 40 % of the usable area rather than leaving the block where it was', () => {
        sheetId = makeSheet(1);
        const before = { ...posOf('vp-0') };
        const cmd = new ApplySheetLayoutPresetCommand({
            sheetId, presetKey: 'single-centred',
            paperW: PAPER_W, paperH: PAPER_H, marginMm: MARGIN,
            // No blockSizes at all — the unresolvable-view case.
        });
        expect(cmd.execute(CTX).success).toBe(true);
        expect(posOf('vp-0')).not.toEqual(before);
        const fallbackW = (PAPER_W - MARGIN * 2) * 0.4;
        const fallbackH = (PAPER_H - MARGIN * 2) * 0.4;
        expect(posOf('vp-0')).toEqual({
            x: PAPER_W / 2 - fallbackW / 2,
            y: PAPER_H / 2 - fallbackH / 2,
        });
    });
});
