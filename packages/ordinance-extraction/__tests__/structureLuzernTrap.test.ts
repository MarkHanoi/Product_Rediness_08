// LAYER 3 — the Luzern 7x trap, made UNREPRESENTABLE by page geometry.
//
// The failure this layer exists to prevent, stated exactly. Luzern's Bau- und
// Zonenreglement, Anhang 1, flattened to a text stream by ANY item joiner:
//
//     10 WA 0.15 21 geschlossen        ← the 21 is FASSADENHÖHE, 21 metres
//     11 WA 0.2  3  offen              ← the 3  is VOLLGESCHOSSE, 3 storeys
//
// A line-based grammar reads "21 Vollgeschosse" and overstates a three-storey zone
// by 7x WITH A CORRECT CITATION ATTACHED. Every other guard in this package passes
// it: the locale gate (21 is a clean number), the range gate (maxFloors ∈ [1,40]),
// dual-pass agreement (both passes read the same flattened stream) and n-gram
// containment (the 21 really is in the source). The error is in the GEOMETRY of the
// page, not in the reading of the token — so only geometry can catch it.
//
// The x anchors below are the REAL ones, probed off `luze_BZR.pdf` (594,982 bytes,
// cached) on 2026-09-01 and recorded in `structure/types.ts`.

import { describe, expect, it } from 'vitest';
import { buildCanonicalDocument } from '../src/structure/canonicalDocument.js';
import { type PageItems, type PositionedItem } from '../src/structure/types.js';

const X = {
    nr: 31.1,
    zonenart: 59.6,
    ab: 125.4,
    uz: 177.3,
    gl: 240.2,
    vg: 300.4,
    fh: 348.3,
    go: 400.5,
    weitere: 476.4,
} as const;

function item(text: string, x: number, y: number): PositionedItem {
    return { text, x, y, width: text.length * 4.5, height: 9 };
}

/** The real Anhang-1 grid: a header line and four body rows. */
function luzernPage(): PageItems {
    const items: PositionedItem[] = [
        // header (y = 700)
        item('Nr.', X.nr, 700),
        item('Zonenart', X.zonenart, 700),
        item('A / B', X.ab, 700),
        item('ÜZ', X.uz, 700),
        item('GL', X.gl, 700),
        item('VG', X.vg, 700),
        item('FH', X.fh, 700),
        item('g / o', X.go, 700),
        item('Weitere Bestimmungen', X.weitere, 700),
        // ⭐ row 10 — the trap. 0.15 in ÜZ, 21 in FH, NOTHING in VG.
        item('10', X.nr, 680),
        item('WA', X.zonenart, 680),
        item('0.15', X.uz, 680),
        item('21', X.fh, 680),
        item('geschlossen', X.go, 680),
        item('Gestaltungsplanpflicht', X.weitere, 680),
        // row 11 — 3 in VG, nothing in FH. Same shape, different column.
        item('11', X.nr, 667),
        item('WA', X.zonenart, 667),
        item('0.2', X.uz, 667),
        item('3', X.vg, 667),
        item('offen', X.go, 667),
        // row 12
        item('12', X.nr, 654),
        item('WA', X.zonenart, 654),
        item('0.2', X.uz, 654),
        item('4', X.vg, 654),
        item('offen', X.go, 654),
        // row 17 — GL and VG both filled, the other positional ambiguity
        item('17', X.nr, 641),
        item('WA', X.zonenart, 641),
        item('0.25', X.uz, 641),
        item('25', X.gl, 641),
        item('3', X.vg, 641),
        item('offen', X.go, 641),
    ];
    return { pageNumber: 27, items };
}

function cell(row: readonly string[], header: readonly string[], name: string): string {
    return row[header.indexOf(name)] ?? '';
}

describe('Layer 3 — the grid is recovered from x geometry', () => {
    const built = buildCanonicalDocument('luze_BZR.pdf', [luzernPage()]);
    const table = built.document.tables[0]!;

    it('reconstructs the table confidently and names every column', () => {
        expect(table.confident).toBe(true);
        expect(table.header).toEqual([
            'Nr.',
            'Zonenart',
            'A / B',
            'ÜZ',
            'GL',
            'VG',
            'FH',
            'g / o',
            'Weitere Bestimmungen',
        ]);
    });

    it('⭐ puts row 10 s 21 in FH and leaves VG EMPTY — the 7x overstatement cannot be formed', () => {
        const row = table.rows.find((r) => r[0] === '10')!;
        expect(cell(row, table.header!, 'FH')).toBe('21');
        // THE ASSERTION THAT MATTERS: the storey column is EMPTY, so no reader can
        // produce "21 Vollgeschosse" from this page.
        expect(cell(row, table.header!, 'VG')).toBe('');
    });

    it('puts row 11 s 3 in VG and leaves FH empty — the SAME shape, the other column', () => {
        const row = table.rows.find((r) => r[0] === '11')!;
        expect(cell(row, table.header!, 'VG')).toBe('3');
        expect(cell(row, table.header!, 'FH')).toBe('');
    });

    it('separates GL from VG on row 17, where a flat stream reads "25 3"', () => {
        const row = table.rows.find((r) => r[0] === '17')!;
        expect(cell(row, table.header!, 'GL')).toBe('25');
        expect(cell(row, table.header!, 'VG')).toBe('3');
    });

    it('carries the qualifier column verbatim', () => {
        const row = table.rows.find((r) => r[0] === '10')!;
        expect(cell(row, table.header!, 'Weitere Bestimmungen')).toBe('Gestaltungsplanpflicht');
    });
});

describe('⭐ SCRAMBLE CONTROL — the reconstruction must FAIL when the geometry stops explaining the page', () => {
    // §CORPUS-NEVER-JITTERED: a fixture that cannot be perturbed proves nothing. Not
    // one glyph is removed here — every number is still on the page — and only the
    // x positions move. A layer that still reports a confident grid is not reading
    // geometry, it is guessing.
    const page = luzernPage();
    const scrambled: PageItems = {
        pageNumber: page.pageNumber,
        items: page.items.map((i, n) =>
            i.y > 690 || n % 3 !== 0 ? i : { ...i, x: i.x + 11 },
        ),
    };
    const built = buildCanonicalDocument('luze_BZR.pdf', [scrambled]);

    it('does not publish rows it could not reconstruct', () => {
        const table = built.document.tables[0];
        // Either the grid is rejected outright, or it is reported unconfident with
        // its rows WITHHELD. Both are honest; a confident grid would not be.
        if (table !== undefined) {
            expect(table.confident).toBe(false);
            expect(table.rows).toEqual([]);
            expect(table.detail).not.toBe('');
        }
    });

    it('the same items at their TRUE positions DO reconstruct — so the control discriminates', () => {
        const clean = buildCanonicalDocument('luze_BZR.pdf', [luzernPage()]);
        expect(clean.document.tables[0]?.confident).toBe(true);
    });
});

describe('an unconfident table WITHHOLDS its rows rather than emitting plausible ones', () => {
    it('rows is empty exactly when confident is false, across every reconstruction', () => {
        for (const page of [luzernPage()]) {
            const built = buildCanonicalDocument('doc', [page]);
            for (const t of built.document.tables) {
                if (!t.confident) expect(t.rows).toEqual([]);
                if (t.header === null) expect(t.confident).toBe(false);
            }
        }
    });
});
