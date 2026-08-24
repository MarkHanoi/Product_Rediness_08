/**
 * §TITLE-BLOCK-IS-BLOCK-LOCAL (L-10688) — portrait title blocks exist, and the
 * three that already shipped did not move.
 *
 * ─── WHAT THIS ASSERTS, AND WHY IT IS MILLIMETRES ──────────────────────────
 * The founder asked for a *"landscape / vertical (portrait) title block"* and
 * the earlier note recorded *"portrait title block doesn't exist"*. It did not:
 * `TitleBlockStore` held exactly three templates, all landscape.
 *
 * ⛔ A test that asserted "a portrait template is returned" would pass on any
 * object with an id. Every assertion below is a MEASURED MILLIMETRE — a paper
 * dimension, a field's x/y, a field's right edge against the strip's left edge.
 * That is the only form in which "the title block is on the paper" is checkable.
 *
 * ─── THE HALF THAT PROTECTS HIS EXISTING SHEETS ────────────────────────────
 * `TB-4` pins A0/A1/A3 field coordinates as literals. Those three are what every
 * already-authored sheet references (`titleBlock: 'a1-standard'`), so this suite
 * fails if a later lane regenerates them through the new builder — which would
 * silently move fields on drawings that already exist. Additive means additive.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import { titleBlockStore } from '../TitleBlockStore';
import type { TitleBlockTemplate } from '../TitleBlockTypes';

const PORTRAIT_IDS = ['a0-portrait', 'a1-portrait', 'a2-portrait', 'a3-portrait', 'a4-portrait'] as const;
const LEGACY_IDS   = ['a0-standard', 'a1-standard', 'a3-standard'] as const;
const NEW_LANDSCAPE_IDS = ['a2-standard', 'a4-standard'] as const;

/** ISO 216 portrait dimensions in mm — the answer this suite is checking against
 *  comes from the standard, not from the store. */
const ISO_PORTRAIT_MM: Record<string, { w: number; h: number }> = {
    'a0-portrait': { w: 841, h: 1189 },
    'a1-portrait': { w: 594, h: 841  },
    'a2-portrait': { w: 420, h: 594  },
    'a3-portrait': { w: 297, h: 420  },
    'a4-portrait': { w: 210, h: 297  },
};

const ISO_NEW_LANDSCAPE_MM: Record<string, { w: number; h: number }> = {
    'a2-standard': { w: 594, h: 420 },
    'a4-standard': { w: 297, h: 210 },
};

function get(id: string): TitleBlockTemplate {
    const t = titleBlockStore.get(id);
    expect(t, `template '${id}' must exist in TitleBlockStore`).toBeDefined();
    return t as TitleBlockTemplate;
}

describe('TB-1 — portrait title blocks exist, in ISO 216 millimetres', () => {
    for (const id of PORTRAIT_IDS) {
        it(`${id} is ${ISO_PORTRAIT_MM[id]!.w}×${ISO_PORTRAIT_MM[id]!.h} mm and TALLER than it is wide`, () => {
            const t = get(id);
            expect(t.paperWidth).toBe(ISO_PORTRAIT_MM[id]!.w);
            expect(t.paperHeight).toBe(ISO_PORTRAIT_MM[id]!.h);
            // The whole point of the row: portrait means height > width. On today's
            // HEAD there is no template for which this can even be evaluated.
            expect(t.paperHeight).toBeGreaterThan(t.paperWidth);
        });
    }

    it('the store previously offered NO portrait template at all — it now offers five', () => {
        const portraits = titleBlockStore.getAll().filter(t => t.paperHeight > t.paperWidth);
        expect(portraits.map(t => t.id).sort()).toEqual([...PORTRAIT_IDS].sort());
    });
});

describe('TB-2 — the A2 / A4 landscape gap is closed', () => {
    for (const id of NEW_LANDSCAPE_IDS) {
        it(`${id} is ${ISO_NEW_LANDSCAPE_MM[id]!.w}×${ISO_NEW_LANDSCAPE_MM[id]!.h} mm`, () => {
            const t = get(id);
            expect(t.paperWidth).toBe(ISO_NEW_LANDSCAPE_MM[id]!.w);
            expect(t.paperHeight).toBe(ISO_NEW_LANDSCAPE_MM[id]!.h);
            expect(t.paperWidth).toBeGreaterThan(t.paperHeight);
        });
    }

    it('every paper size the Paper dropdown offers (A0–A4) now has a title block in BOTH orientations', () => {
        const ids = new Set(titleBlockStore.getAll().map(t => t.id));
        for (const n of ['a0', 'a1', 'a2', 'a3', 'a4']) {
            expect(ids.has(`${n}-standard`), `${n}-standard missing`).toBe(true);
            expect(ids.has(`${n}-portrait`), `${n}-portrait missing`).toBe(true);
        }
    });
});

describe('TB-3 — every field of every NEW template lands ON the strip, in mm', () => {
    const newIds = [...PORTRAIT_IDS, ...NEW_LANDSCAPE_IDS];

    for (const id of newIds) {
        it(`${id}: all 11 fields sit inside the ${'strip'} and inside the paper`, () => {
            const t = get(id);
            const stripLeftMm = t.paperWidth - t.borderWidth;

            expect(t.fields).toHaveLength(11);

            for (const f of t.fields) {
                // Left edge is at or right of the strip's left edge.
                expect(f.x, `${id}/${f.key} x`).toBeGreaterThanOrEqual(stripLeftMm);
                // Right edge does not overhang the paper's right edge.
                expect(f.x + f.width, `${id}/${f.key} right edge`).toBeLessThanOrEqual(t.paperWidth + 0.05);
                // Vertically on the paper.
                expect(f.y, `${id}/${f.key} y`).toBeGreaterThanOrEqual(0);
                expect(f.y + f.height, `${id}/${f.key} top edge`).toBeLessThanOrEqual(t.paperHeight);
                // A zero-height or zero-width zone renders nothing.
                expect(f.width, `${id}/${f.key} width`).toBeGreaterThan(0);
                expect(f.height, `${id}/${f.key} height`).toBeGreaterThan(0);
            }
        });

        it(`${id}: carries the 11 canonical keys and a revision zone on the strip`, () => {
            const t = get(id);
            expect(t.fields.map(f => f.key).sort()).toEqual([
                'approvedBy', 'checkedBy', 'contractNo', 'date', 'drawnBy',
                'projectAddress', 'projectName', 'revision', 'scale',
                'sheetName', 'sheetNumber',
            ]);
            expect(t.revisionZone).toBeDefined();
            const rz = t.revisionZone!;
            expect(rz.x).toBeGreaterThanOrEqual(t.paperWidth - t.borderWidth);
            expect(rz.x + rz.width).toBeLessThanOrEqual(t.paperWidth + 0.05);
            expect(rz.y + rz.rowHeight * rz.maxRows).toBeLessThanOrEqual(t.paperHeight);
        });
    }

    it('a3-portrait leaves a usable drawing area of 187 mm × 420 mm', () => {
        const t = get('a3-portrait');
        expect(t.paperWidth - t.borderWidth).toBe(187);
        expect(t.paperHeight).toBe(420);
    });
});

describe('TB-4 — ⛔ REGRESSION PIN: the three shipped templates did not move', () => {
    it('a3-standard field coordinates are byte-identical to what already-authored sheets render', () => {
        const t = get('a3-standard');
        expect([t.paperWidth, t.paperHeight, t.borderWidth]).toEqual([420, 297, 120]);
        const byKey = Object.fromEntries(t.fields.map(f => [f.key, f]));
        expect([byKey['projectName']!.x, byKey['projectName']!.y]).toEqual([305, 100]);
        expect([byKey['sheetNumber']!.x, byKey['sheetNumber']!.y]).toEqual([305, 50]);
        expect([byKey['revision']!.x, byKey['revision']!.y]).toEqual([361, 50]);
        expect([byKey['date']!.x, byKey['date']!.y]).toEqual([355, 22]);
        // A3 deliberately has TEN fields, not eleven — it has never carried
        // `contractNo`. Pinned so nobody "completes" it and reflows the strip.
        expect(t.fields).toHaveLength(10);
    });

    it('a1-standard (the default, and what his existing sheets reference) did not move', () => {
        const t = get('a1-standard');
        expect([t.paperWidth, t.paperHeight, t.borderWidth]).toEqual([841, 594, 160]);
        const byKey = Object.fromEntries(t.fields.map(f => [f.key, f]));
        expect([byKey['projectName']!.x, byKey['projectName']!.y]).toEqual([687, 160]);
        expect([byKey['sheetNumber']!.x, byKey['sheetNumber']!.y]).toEqual([687, 80]);
        expect([byKey['contractNo']!.x, byKey['contractNo']!.y]).toEqual([687, 12]);
        expect(t.fields).toHaveLength(11);
    });

    it('a0-standard did not move', () => {
        const t = get('a0-standard');
        expect([t.paperWidth, t.paperHeight, t.borderWidth]).toEqual([1189, 841, 180]);
        const byKey = Object.fromEntries(t.fields.map(f => [f.key, f]));
        expect([byKey['projectName']!.x, byKey['projectName']!.y]).toEqual([1015, 220]);
        expect([byKey['revision']!.x, byKey['revision']!.y]).toEqual([1155, 100]);
        expect(t.fields).toHaveLength(11);
    });

    it('getDefault() is still A1 Standard, and the original three still list FIRST', () => {
        expect(titleBlockStore.getDefault().id).toBe('a1-standard');
        expect(titleBlockStore.getAll().slice(0, 3).map(t => t.id)).toEqual([...LEGACY_IDS]);
    });
});
