/**
 * §TITLE-BLOCK-TEXT-HAS-ONE-UNIT (L-10689) — one `fontSize` was read in FOUR
 * units by four surfaces drawing the same sheet. They now agree, in millimetres
 * of cap height, and none of them is below L-10680's floor.
 *
 * ─── WHY THIS IS THE FOUNDER'S ASK #1, ONE SURFACE FURTHER ON ──────────────
 * He reported *"the text of the rooms — labels — is not readable"*. L-10680
 * fixed the DRAWING text. The TITLE BLOCK on the same page was still emitting
 * 1.010 mm of cap height for every label — below the 1.8 mm ISO 3098 floor that
 * fix established. A sheet whose drawing is legible and whose title block is not
 * answers the complaint with half a fix.
 *
 * ─── WHAT WAS MEASURED, BEFORE ────────────────────────────────────────────
 * `TitleBlockFieldZone.fontSize` declares itself "Font size in points".
 *
 *   surface        | how it read the number      | a1-standard "Drawn" (6 pt)
 *   ---------------|-----------------------------|---------------------------
 *   PDF            | POINTS  (honours the decl.) | 1.516 mm cap  <- below floor
 *   SVG            | MILLIMETRES (1 unit = 1 mm) | 4.296 mm cap  <- 2.8x the PDF
 *   editor         | max(6, n*0.6*sf) CSS px     | 3.725 mm cap  <- window-dependent
 *   print layer    | {n}px in a 100vh layer      | unrelated to the paper
 *
 * NOT ONE OF THE FOUR WAS CORRECT. The coordinator's read was "at most one is
 * right"; the measurement says ZERO are. The PDF was CLOSEST — it is the only
 * one that honoured the declared unit — and it was still below the floor on 4 of
 * `a1-standard`'s 11 values and on every label.
 *
 * AND THE EDITOR HAD NO HIERARCHY AT ALL ON A3: the screen-pixel floor swallowed
 * every declared difference, so project name, sheet number and "Drawn" all
 * rendered at 3.580 mm.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { titleBlockStore } from '@pryzm/core-app-model/views';
import {
    CAP_HEIGHT_RATIO,
    MIN_PAPER_TEXT_HEIGHT_MM,
    PT_TO_MM,
    EDITOR_MIN_TEXT_PX,
    titleBlockValueCapMm,
    titleBlockLabelCapMm,
    capMmToPdfPt,
    capMmToSvgUnits,
    capMmToEditorPx,
    capMmToPrintVh,
} from '../src/export/sheets/PaperTextStandard';

/** Each surface's number, converted BACK to paper millimetres of cap height.
 *  Asserting the round trip is the only way to compare four different units. */
const backFromPdf   = (pt: number) => pt * PT_TO_MM * CAP_HEIGHT_RATIO;
const backFromSvg   = (u: number)  => u * CAP_HEIGHT_RATIO;
const backFromPrint = (vh: number, paperHmm: number) => (vh / 100) * paperHmm * CAP_HEIGHT_RATIO;
const backFromPx    = (px: number, pxPerMm: number)  => (px / pxPerMm) * CAP_HEIGHT_RATIO;

const TEMPLATES = titleBlockStore.getAll();

describe('TU-1 — every title-block field clears L-10680 floor on every PAPER surface', () => {
    it('there is something to check — the built-in templates are present', () => {
        expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
        expect(TEMPLATES.flatMap(t => t.fields).length).toBeGreaterThan(100);
    });

    for (const surface of ['pdf', 'svg', 'print'] as const) {
        it(`${surface}: no VALUE renders below ${MIN_PAPER_TEXT_HEIGHT_MM} mm of cap height`, () => {
            for (const t of TEMPLATES) {
                for (const f of t.fields) {
                    const cap = titleBlockValueCapMm(f.fontSize);
                    const rendered =
                        surface === 'pdf' ? backFromPdf(capMmToPdfPt(cap))
                      : surface === 'svg' ? backFromSvg(capMmToSvgUnits(cap))
                      :                     backFromPrint(capMmToPrintVh(cap, t.paperHeight), t.paperHeight);
                    expect(rendered, `${t.id}/${f.key} on ${surface}`)
                        .toBeGreaterThanOrEqual(MIN_PAPER_TEXT_HEIGHT_MM - 1e-9);
                }
            }
        });
    }

    it('no LABEL renders below the floor either — the 4 pt fixed size was 1.010 mm', () => {
        // The number the old code emitted, kept as a literal so the size of the
        // defect stays on the record.
        expect(4 * PT_TO_MM * CAP_HEIGHT_RATIO).toBeCloseTo(1.010, 3);
        expect(backFromPdf(capMmToPdfPt(titleBlockLabelCapMm()))).toBeCloseTo(MIN_PAPER_TEXT_HEIGHT_MM, 9);
    });

    it('the floor is L-10680 own, not a second one invented here', () => {
        expect(titleBlockLabelCapMm()).toBe(MIN_PAPER_TEXT_HEIGHT_MM);
        expect(titleBlockValueCapMm(1)).toBe(MIN_PAPER_TEXT_HEIGHT_MM);
        expect(titleBlockValueCapMm(undefined)).toBeGreaterThanOrEqual(MIN_PAPER_TEXT_HEIGHT_MM);
    });
});

describe('TU-2 — the three PAPER surfaces now agree, field for field, in mm', () => {
    it('PDF, SVG and print resolve the SAME cap height for the same field', () => {
        for (const t of TEMPLATES) {
            for (const f of t.fields) {
                const cap   = titleBlockValueCapMm(f.fontSize);
                const pdf   = backFromPdf(capMmToPdfPt(cap));
                const svg   = backFromSvg(capMmToSvgUnits(cap));
                const print = backFromPrint(capMmToPrintVh(cap, t.paperHeight), t.paperHeight);
                expect(svg,   `${t.id}/${f.key} svg vs pdf`).toBeCloseTo(pdf, 9);
                expect(print, `${t.id}/${f.key} print vs pdf`).toBeCloseTo(pdf, 9);
            }
        }
    });

    it('the SVG used to be 2.8x the PDF for the identical field — that ratio is now 1', () => {
        const t = titleBlockStore.get('a1-standard')!;
        const drawn = t.fields.find(f => f.key === 'drawnBy')!;
        // BEFORE, as measured on HEAD: SVG wrote the point number as millimetres.
        const oldSvgCap = drawn.fontSize! * CAP_HEIGHT_RATIO;              // 4.296 mm
        const oldPdfCap = drawn.fontSize! * PT_TO_MM * CAP_HEIGHT_RATIO;   // 1.516 mm
        expect(oldSvgCap).toBeCloseTo(4.296, 3);
        expect(oldPdfCap).toBeCloseTo(1.516, 3);
        expect(oldSvgCap / oldPdfCap).toBeCloseTo(1 / PT_TO_MM, 6);        // exactly 72/25.4 = 2.835

        // AFTER: one value, one unit.
        const cap = titleBlockValueCapMm(drawn.fontSize);
        expect(cap).toBeCloseTo(MIN_PAPER_TEXT_HEIGHT_MM, 9);              // 1.516 was below the floor
        expect(backFromSvg(capMmToSvgUnits(cap)) / backFromPdf(capMmToPdfPt(cap))).toBeCloseTo(1, 9);
    });
});

describe('TU-3 — the editor keeps a SCREEN floor, deliberately, and its paper term is now real', () => {
    const FIT_PX_PER_MM = 1.153;   // A1 fit-to-window at 1600x900

    it('at fit-to-window the screen floor governs — 1.8 mm of paper is 2.07 px, unreadable', () => {
        expect(capMmToSvgUnits(MIN_PAPER_TEXT_HEIGHT_MM) * FIT_PX_PER_MM).toBeLessThan(EDITOR_MIN_TEXT_PX);
        expect(capMmToEditorPx(MIN_PAPER_TEXT_HEIGHT_MM, FIT_PX_PER_MM)).toBe(EDITOR_MIN_TEXT_PX);
        // Never BELOW the paper floor once converted back — the screen floor can
        // only ever make text larger.
        expect(backFromPx(capMmToEditorPx(MIN_PAPER_TEXT_HEIGHT_MM, FIT_PX_PER_MM), FIT_PX_PER_MM))
            .toBeGreaterThanOrEqual(MIN_PAPER_TEXT_HEIGHT_MM);
    });

    it('at a readable scale the editor CONVERGES on the PDF instead of on a different drawing', () => {
        const zoomed = 8;   // px per paper mm
        for (const t of TEMPLATES) {
            for (const f of t.fields) {
                const cap = titleBlockValueCapMm(f.fontSize);
                expect(backFromPx(capMmToEditorPx(cap, zoomed), zoomed), `${t.id}/${f.key}`)
                    .toBeCloseTo(backFromPdf(capMmToPdfPt(cap)), 9);
            }
        }
    });

    it('the old A3 reading had NO hierarchy: three declared sizes, one rendered size', () => {
        const t = titleBlockStore.get('a3-standard')!;
        const sf = 1.2;   // A3 fit-to-window, clamped at the 1.2 cap
        const old = (n: number) => backFromPx(Math.max(6, n * 0.6 * sf), sf);
        const project = t.fields.find(f => f.key === 'projectName')!.fontSize!;   // 7
        const number  = t.fields.find(f => f.key === 'sheetNumber')!.fontSize!;   // 8
        const drawn   = t.fields.find(f => f.key === 'drawnBy')!.fontSize!;       // 5
        expect([project, number, drawn]).toEqual([7, 8, 5]);
        expect(old(project)).toBeCloseTo(3.580, 3);
        expect(old(number)).toBeCloseTo(3.580, 3);
        expect(old(drawn)).toBeCloseTo(3.580, 3);   // three declared sizes, one output

        // Now the sheet number is genuinely bigger than "Drawn".
        expect(titleBlockValueCapMm(number)).toBeGreaterThan(titleBlockValueCapMm(drawn));
    });
});

describe('TU-4 — REACHABILITY: all surfaces go through the one producer', () => {
    const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const SURFACES: Array<[string, string[]]> = [
        ['packages/file-format/src/export/sheets/PdfExportService.ts',   ['capMmToPdfPt(', 'titleBlockValueCapMm(', '_ellipsise(']],
        ['packages/file-format/src/export/sheets/SheetExportService.ts', ['capMmToSvgUnits(', 'capMmToPrintVh(']],
        ['apps/editor/src/ui/SheetEditor/SheetEditorPanel.ts',           ['capMmToEditorPx(', 'titleBlockLabelCapMm(']],
    ];

    for (const [rel, needles] of SURFACES) {
        it(`${rel} routes its lettering through PaperTextStandard`, () => {
            const src = readFileSync(resolve(REPO, rel), 'utf8');
            for (const n of needles) expect(src, n).toContain(n);
        });

        it(`${rel} no longer sizes title-block text from the raw fontSize`, () => {
            const code = readFileSync(resolve(REPO, rel), 'utf8')
                .split('\n')
                .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
                .join('\n');
            // The four shapes measured on HEAD.
            expect(code).not.toMatch(/setFontSize\(\s*4\s*\)/);
            expect(code).not.toMatch(/font-size',\s*`\$\{field\.fontSize/);
            expect(code).not.toMatch(/font-size:\$\{field\.fontSize[^}]*\}px/);
            expect(code).not.toMatch(/field\.fontSize \?\? \d+\) \* 0\.[46]/);
        });
    }
});
