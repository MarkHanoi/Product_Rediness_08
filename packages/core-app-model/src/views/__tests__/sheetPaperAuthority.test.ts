/**
 * §SHEET-PAPER-IS-THE-SHEETS (L-10684) — the Paper dropdown is the authority,
 * and moving it did NOT move a single field on a sheet that already existed.
 *
 * ─── THE DEFECT ────────────────────────────────────────────────────────────
 * The founder set `Paper: A0` with `Title Block: A3 Standard` and PRYZM exported
 * a 420 × 297 mm page. `SheetDefinition.paperSize` was write-dead (the editor
 * patched a key `SheetStore.update()` did not handle, behind an `as any`) and
 * read-dead (a dropdown's selected state and an info label).
 *
 * ─── THE HALF THAT MATTERS MOST ────────────────────────────────────────────
 * ⛔ `PA-1` is the MIGRATION PROOF. Every sheet the founder has already authored
 * references `a1-standard` and carries no `paperSize`. This suite asserts, FIELD
 * BY FIELD IN MILLIMETRES, that such a sheet resolves to the same paper and the
 * same eleven x coordinates it did before the authority moved. If that ever goes
 * red, a migration has damaged drawings that already exist, and the right move
 * is to stop — not to update the expectations.
 *
 * @vitest-environment happy-dom
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { titleBlockStore } from '../TitleBlockStore';
import { sheetStore } from '../SheetStore';
import {
    resolveSheetPaper,
    placeSheetOnPaper,
    titleBlockFieldsOnPaper,
    titleBlockContentTopMm,
    titleBlockFitsPaper,
} from '../SheetPaperResolution';

const A1 = () => titleBlockStore.get('a1-standard')!;
const A3 = () => titleBlockStore.get('a3-standard')!;
const A0 = () => titleBlockStore.get('a0-standard')!;
const A3P = () => titleBlockStore.get('a3-portrait')!;

describe('PA-1 — ⛔ MIGRATION PROOF: an already-authored sheet does not move', () => {
    it('a sheet with NO paperSize resolves to the title block’s own paper, exactly', () => {
        const p = resolveSheetPaper({}, A1());
        expect([p.widthMm, p.heightMm]).toEqual([841, 594]);
        expect(p.source).toBe('template');
        expect(p.refusal).toBeUndefined();
    });

    it('all ELEVEN a1-standard field x coordinates are unchanged, mm by mm', () => {
        const t = A1();
        const before = t.fields.map(f => ({ key: f.key, x: f.x, y: f.y }));
        const after  = titleBlockFieldsOnPaper(t, resolveSheetPaper({}, t).widthMm)
            .map(f => ({ key: f.key, x: f.x, y: f.y }));
        expect(after).toEqual(before);
        // And specifically the ones a reader would notice first.
        const byKey = Object.fromEntries(after.map(f => [f.key, f]));
        expect([byKey['projectName']!.x, byKey['projectName']!.y]).toEqual([687, 160]);
        expect([byKey['sheetNumber']!.x, byKey['sheetNumber']!.y]).toEqual([687, 80]);
        expect([byKey['revision']!.x,    byKey['revision']!.y]).toEqual([807, 80]);
    });

    it('a sheet whose Paper AGREES with its title block is also the identity', () => {
        const t = A1();
        const p = resolveSheetPaper({ paperSize: 'A1' }, t);
        expect([p.widthMm, p.heightMm]).toEqual([841, 594]);
        expect(titleBlockFieldsOnPaper(t, p.widthMm)).toEqual(t.fields);
    });

    it('the same holds for a3-standard — the other template on disk', () => {
        const t = A3();
        expect(titleBlockFieldsOnPaper(t, resolveSheetPaper({}, t).widthMm)).toEqual(t.fields);
        expect(titleBlockFieldsOnPaper(t, resolveSheetPaper({ paperSize: 'A3' }, t).widthMm)).toEqual(t.fields);
    });
});

describe('PA-2 — ⭐ THE FOUNDER’S CASE: Paper A0 + Title Block A3 Standard', () => {
    it('exports an A0 page — 1189 × 841 mm — not the title block’s 420 × 297', () => {
        const p = resolveSheetPaper({ paperSize: 'A0' }, A3());
        expect([p.widthMm, p.heightMm]).toEqual([1189, 841]);
        expect(p.source).toBe('sheet');
        expect(p.refusal).toBeUndefined();
    });

    it('the title block rides the RIGHT edge of the bigger page, fields intact within it', () => {
        const t = A3();
        const pl = placeSheetOnPaper({ paperSize: 'A0' }, t);

        // Strip is flush right: 1189 − 120 = 1069 mm.
        expect(pl.stripLeftMm).toBe(1069);

        // Every field shifted by exactly (1189 − 420) = 769 mm …
        const byKey = Object.fromEntries(pl.fields.map(f => [f.key, f]));
        expect(byKey['projectName']!.x).toBe(305 + 769);   // 1074 mm
        expect(byKey['revision']!.x).toBe(361 + 769);      // 1130 mm

        // … which means every field's offset INSIDE the strip is unchanged,
        // which is the whole reason the re-anchoring is safe.
        for (const f of pl.fields) {
            const authored = t.fields.find(a => a.key === f.key)!;
            expect(f.x - pl.stripLeftMm).toBeCloseTo(authored.x - (t.paperWidth - t.borderWidth), 6);
        }

        // Nothing hangs off the right edge of the A0 page.
        for (const f of pl.fields) expect(f.x + f.width).toBeLessThanOrEqual(1189);
        // The revision zone came along.
        expect(pl.revisionZone!.x).toBe(305 + 769);
    });

    it('the drawing area GREW — which is what he was actually asking for', () => {
        const t = A3();
        const before = t.paperWidth - t.borderWidth;                              // 300 mm
        const after  = placeSheetOnPaper({ paperSize: 'A0' }, t).stripLeftMm;     // 1069 mm
        expect(after).toBeGreaterThan(before);
        expect(after - before).toBe(769);
    });
});

describe('PA-3 — size from the SHEET, orientation from the TITLE BLOCK', () => {
    it('Paper A1 + a portrait title block gives a PORTRAIT A1: 594 × 841 mm', () => {
        const p = resolveSheetPaper({ paperSize: 'A1' }, A3P());
        expect([p.widthMm, p.heightMm]).toEqual([594, 841]);
        expect(p.heightMm).toBeGreaterThan(p.widthMm);
        expect(p.source).toBe('sheet');
    });

    it('Paper A1 + a landscape title block stays LANDSCAPE: 841 × 594 mm', () => {
        const p = resolveSheetPaper({ paperSize: 'A1' }, A3());
        expect([p.widthMm, p.heightMm]).toEqual([841, 594]);
    });

    it('the ANSI sizes the Paper dropdown offers now resolve to real millimetres', () => {
        expect(resolveSheetPaper({ paperSize: 'ANSI-D' }, A3()).widthMm).toBeCloseTo(863.6, 3);
        expect(resolveSheetPaper({ paperSize: 'ANSI-D' }, A3()).heightMm).toBeCloseTo(558.8, 3);
    });
});

describe('PA-4 — a paper the block cannot fit on is REFUSED BY NAME, not drawn wrong', () => {
    it('a0-standard content reaches 372 mm, so it cannot go on a 210 mm-tall A4', () => {
        const t = A0();
        expect(titleBlockContentTopMm(t)).toBe(372);          // revisionZone 260 + 14×8
        expect(titleBlockFitsPaper(t, 297, 210)).toBe(false);

        const p = resolveSheetPaper({ paperSize: 'A4' }, t);
        expect([p.widthMm, p.heightMm]).toEqual([1189, 841]);  // the block's own paper
        expect(p.source).toBe('template');
        expect(p.refusal).toContain('A4');
        expect(p.refusal).toContain('372');
        expect(p.refusal).toContain('1189');
    });

    it("'custom' names no dimensions, so it falls through silently to the template", () => {
        const p = resolveSheetPaper({ paperSize: 'custom' }, A3());
        expect([p.widthMm, p.heightMm]).toEqual([420, 297]);
        expect(p.source).toBe('template');
        expect(p.refusal).toBeUndefined();
    });
});

describe('PA-5 — ⛔ the WRITE that never happened: SheetStore.update ignored paperSize', () => {
    beforeEach(() => sheetStore.reset());

    it('patching { paperSize } through update() now persists it', () => {
        sheetStore.create({ id: 'sh-1', sheetNumber: 'A101', name: 'Plan', titleBlock: 'a3-standard' });
        expect(sheetStore.get('sh-1')!.paperSize).toBeUndefined();

        expect(sheetStore.update('sh-1', { paperSize: 'A0' })).toBe(true);
        // This is the assertion that fails on today's HEAD: `update()` did not
        // declare the key, so the write silently evaporated behind an `as any`.
        expect(sheetStore.get('sh-1')!.paperSize).toBe('A0');
    });

    it('and the sheet then exports at A0 — the two halves joined up', () => {
        sheetStore.create({ id: 'sh-2', sheetNumber: 'A102', name: 'Plan', titleBlock: 'a3-standard' });
        sheetStore.update('sh-2', { paperSize: 'A0' });
        const sheet = sheetStore.get('sh-2')!;
        const p = resolveSheetPaper(sheet, A3());
        expect([p.widthMm, p.heightMm]).toEqual([1189, 841]);
    });

    it('changing the paper does not disturb any other field on the sheet', () => {
        sheetStore.create({ id: 'sh-3', sheetNumber: 'A103', name: 'Sections', titleBlock: 'a1-standard', revision: 'B' });
        sheetStore.update('sh-3', { paperSize: 'A2' });
        const s = sheetStore.get('sh-3')!;
        expect([s.sheetNumber, s.name, s.revision, s.titleBlock]).toEqual(['A103', 'Sections', 'B', 'a1-standard']);
    });
});

describe('PA-6 — ⛔ REACHABILITY: all FOUR drawing surfaces go through the one authority', () => {
    // A resolver nothing calls is the authored-but-unreachable shape, and this
    // repo's most recurrent defect. The four surfaces that draw a sheet each
    // used to open with `const pW = template.paperWidth`, which IS the defect:
    // the Paper dropdown was ornamental because every consumer read past it.
    //
    // ⚠ This is a SOURCE pin, and it is honest about being one — it proves the
    // call exists, not that the pixels moved. It is here because the alternative
    // (booting jsPDF and the sheet editor in a unit test) proves less per second
    // than it costs, and because the regression it guards is textual: someone
    // re-introducing the direct read.
    const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

    const SURFACES = [
        'apps/editor/src/ui/SheetEditor/SheetEditorPanel.ts',
        'packages/file-format/src/export/sheets/PdfExportService.ts',
        'packages/file-format/src/export/sheets/SheetExportService.ts',
        'packages/file-format/src/export/sheets/DxfExportService.ts',
    ];

    for (const rel of SURFACES) {
        it(`${rel} calls placeSheetOnPaper`, () => {
            const src = readFileSync(resolve(REPO, rel), 'utf8');
            expect(src).toContain('placeSheetOnPaper(');
        });

        it(`${rel} does NOT take the page size straight off the template`, () => {
            const src = readFileSync(resolve(REPO, rel), 'utf8');
            // Assignments of the form `const pW = template.paperWidth` — the
            // exact shape all four carried. Comments explaining the history are
            // stripped first so the prose above each call site does not trip it.
            const code = src
                .split('\n')
                .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
                .join('\n');
            expect(code).not.toMatch(/=\s*template\.paperWidth\b/);
            expect(code).not.toMatch(/=\s*template\.paperHeight\b/);
        });
    }
});
