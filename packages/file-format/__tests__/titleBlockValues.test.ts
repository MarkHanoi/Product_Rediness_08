// §SHEET-TITLE-BLOCK-HAS-A-SOURCE (L-3806) + §SHEET-CHROME-IS-NOT-THE-DRAWING (L-3804)
//
// The founder, 2026-08-21, with a screenshot: *"the title block is empty and
// must be sound — PROJECT and ADDRESS are blank; only `Sheet 01`, `A001` and
// the date are filled."*
//
// ⛔ THE RULE UNDER TEST IS A SAFETY RULE, NOT A FORMATTING ONE:
//
//   "A field with no source must render EMPTY, never a placeholder that looks
//    like data — an invented address on a drawing is worse than a blank one."
//
// A drawing is a legal instrument. A blank "Checked" box says NOBODY CHECKED
// THIS, which is true and useful. A box holding a plausible name says a named
// person checked it — a fabricated attribution. So the assertions below are
// mostly assertions that fields are EMPTY, and that is the point of them: the
// easy way to make this suite "pass" would be to fill the fields in, which is
// the defect.

import { describe, it, expect } from 'vitest';
import {
    resolveTitleBlockValues,
    resolveSheetScaleLabel,
} from '../src/export/sheets/TitleBlockValues';
import { chromeFor } from '../src/export/sheets/SheetRenderTarget';

const SHEET = {
    sheetNumber: 'A001',
    name:        'Sheet 01',
    revision:    'B',
    issueDate:   '2026-08-21',
    viewports:   [{ scale: 50 }, { scale: 50 }],
};

describe('§SHEET-TITLE-BLOCK-HAS-A-SOURCE (L-3806) — the founder’s two blank fields', () => {
    it('fills PROJECT and ADDRESS when the context supplies them', () => {
        // The exact defect: these two rendered blank because NOTHING read them.
        const v = resolveTitleBlockValues(SHEET, {
            projectName:    'Casa Perello',
            projectAddress: 'CL PERELLO 60 BARCELONA',
        });
        expect(v.projectName).toBe('Casa Perello');
        expect(v.projectAddress).toBe('CL PERELLO 60 BARCELONA');
    });

    it('leaves PROJECT and ADDRESS EMPTY when there is no source — never a placeholder', () => {
        const v = resolveTitleBlockValues(SHEET);
        expect(v.projectName).toBe('');
        expect(v.projectAddress).toBe('');
        // And specifically not any of the plausible-looking stand-ins.
        for (const bad of ['—', '-', 'N/A', 'TBC', 'Untitled Project', 'Unknown']) {
            expect(v.projectName).not.toBe(bad);
            expect(v.projectAddress).not.toBe(bad);
        }
    });

    it('treats whitespace-only input as absent', () => {
        // Three spaces look like a filled field to a reader and carry nothing.
        const v = resolveTitleBlockValues(SHEET, { projectName: '   ', projectAddress: '\t\n' });
        expect(v.projectName).toBe('');
        expect(v.projectAddress).toBe('');
    });

    it('leaves DRAWN / CHECKED / APPROVED / CONTRACT empty — no model source (L-3807)', () => {
        // ⛔ These MUST stay empty until the sheet model records them. The
        // near-miss worth pinning: `sheet.issuedBy` exists and was the obvious
        // candidate for `drawnBy`. Issuing and drawing are different acts, and
        // printing a real name against work they may not have done is a
        // fabricated attribution. This test is the guard on that temptation.
        const v = resolveTitleBlockValues({ ...SHEET, issuedBy: 'A. Architect' } as never);
        expect(v.drawnBy).toBe('');
        expect(v.checkedBy).toBe('');
        expect(v.approvedBy).toBe('');
        expect(v.contractNo).toBe('');
    });

    it('carries the sheet’s own fields verbatim', () => {
        const v = resolveTitleBlockValues(SHEET);
        expect(v.sheetNumber).toBe('A001');
        expect(v.sheetName).toBe('Sheet 01');
        expect(v.revision).toBe('B');
        expect(v.date).toBe('2026-08-21');
    });

    it('renders an absent revision EMPTY, not as a dash', () => {
        // The old map wrote `sheet.revision || '—'`. A dash is a mark a reader
        // can mistake for a revision code.
        const v = resolveTitleBlockValues({ ...SHEET, revision: undefined });
        expect(v.revision).toBe('');
    });

    it('emits every template key, so a field is never silently missing', () => {
        // The template declares eleven fields. A resolver that omits a key
        // renders identically to one that returns '' — but the omission is a
        // BUG and the empty string is a DECISION, and this pins which is which.
        const v = resolveTitleBlockValues(SHEET);
        for (const key of [
            'projectName', 'projectAddress', 'sheetNumber', 'sheetName', 'scale',
            'date', 'drawnBy', 'checkedBy', 'approvedBy', 'contractNo', 'revision',
        ]) {
            expect(v, `missing template key: ${key}`).toHaveProperty(key);
        }
    });

    it('no longer emits the dead `issuedBy` key', () => {
        // `issuedBy` was in the old five-key map and matched NO template field
        // key. It was dead on arrival in all four copies.
        expect(resolveTitleBlockValues(SHEET)).not.toHaveProperty('issuedBy');
    });
});

describe('§SHEET-TITLE-BLOCK-SCALE-IS-DERIVED — one scale, many, or none', () => {
    it('reports the single scale when every viewport agrees', () => {
        expect(resolveSheetScaleLabel([{ scale: 50 }, { scale: 50 }])).toBe('1:50');
    });

    it('reports "As indicated" when viewports differ — the drafting convention', () => {
        expect(resolveSheetScaleLabel([{ scale: 50 }, { scale: 100 }])).toBe('As indicated');
    });

    it('reports EMPTY for a sheet with no viewports', () => {
        // A sheet showing nothing has no scale. `1:100` would be a claim about
        // a drawing that is not there.
        expect(resolveSheetScaleLabel([])).toBe('');
        expect(resolveSheetScaleLabel(undefined)).toBe('');
    });

    it('ignores non-finite and non-positive scales rather than printing them', () => {
        expect(resolveSheetScaleLabel([{ scale: Number.NaN }, { scale: 0 }])).toBe('');
        expect(resolveSheetScaleLabel([{ scale: -50 }, { scale: 100 }])).toBe('1:100');
    });

    it('reaches the title block as the `scale` field', () => {
        expect(resolveTitleBlockValues(SHEET).scale).toBe('1:50');
        expect(resolveTitleBlockValues({ ...SHEET, viewports: [{ scale: 50 }, { scale: 20 }] }).scale)
            .toBe('As indicated');
    });
});

describe('§SHEET-CHROME-IS-NOT-THE-DRAWING (L-3804) — screen vs print', () => {
    it('draws editing affordances on SCREEN', () => {
        const c = chromeFor('screen');
        expect(c.frame).toBe(true);
        expect(c.scaleLabel).toBe(true);
        expect(c.titleBar).toBe(true);
        expect(c.editControls).toBe(true);
    });

    it('draws NONE of them in PRINT', () => {
        // The founder: "the blue viewport border and the {3D} … 1:50 label bar
        // are on-screen editing affordances. They must not print." A blue
        // rectangle on an issued drawing is indistinguishable from a section
        // box or a match line — real annotation that means something.
        const c = chromeFor('print');
        for (const [k, v] of Object.entries(c)) {
            expect(v, `print chrome '${k}' must be false`).toBe(false);
        }
    });

    it('is a total function over the target, with no shared mutable state', () => {
        // Guards the shape of the policy: two reads of the same target must
        // agree, and reading one target must not affect the other.
        expect(chromeFor('print')).toEqual(chromeFor('print'));
        expect(chromeFor('screen')).toEqual(chromeFor('screen'));
        expect(chromeFor('print')).not.toEqual(chromeFor('screen'));
    });
});
