// ST.1 / ST.2 / ST.3 / ST.5 — Interior Style System CORE tests.
// SPEC: docs/03-execution/specs/SPEC-INTERIOR-STYLE-SYSTEM.md (§2–§6).
//
// Covers:
//   ST.1 — StyleRegistry: all 6 styles resolve a descriptor; aliases; default.
//   ST.2 — floorFinish to 6 styles (lock-step normaliseFloorStyle).
//   ST.3 — furniture finish to 6 styles (back-compat 4/aliases byte-identical).
//   ST.5 — glazing bias multiplies window size, in-bounds + head-capped, and
//          default/absent bias is BYTE-IDENTICAL to the legacy emission.

import { describe, expect, it } from 'vitest';
import {
    STYLE_REGISTRY,
    STYLE_IDS,
    DEFAULT_STYLE_ID,
    resolveStyle,
    resolveStyleId,
    glazingBiasFor,
    type StyleId,
} from '../src/workflows/furnishLayout/style/StyleRegistry.js';
import {
    styleFinishFor,
    styleAccentsFor,
} from '../src/workflows/furnishLayout/styleFinish.js';
import {
    floorFinishFor,
    normaliseFloorStyle,
} from '../../command-registry/src/floors/floorFinish.js';
import {
    emitWindowsForRoom,
} from '../src/workflows/apartmentLayout/windowEmission/emitWindows.js';
import {
    WINDOW_SPECS,
    MAX_WINDOW_HEAD_MM,
    type ExternalWallSegment,
} from '../src/workflows/apartmentLayout/windowEmission/types.js';

const ALL_6: readonly StyleId[] = ['nordic', 'mediterranean', 'classic', 'farmhouse', 'japanese', 'industrial'];

const HEX = /^#[0-9A-Fa-f]{6}$/;

// ── ST.1 — StyleRegistry ──────────────────────────────────────────────────────

describe('ST.1 — StyleRegistry (6 founder styles)', () => {
    it('exposes exactly the six founder ids', () => {
        expect([...STYLE_IDS].sort()).toEqual([...ALL_6].sort());
        expect([...STYLE_IDS].sort()).toEqual(Object.keys(STYLE_REGISTRY).sort());
    });

    it('every style resolves a complete descriptor with valid hexes + a glazingBias', () => {
        for (const id of ALL_6) {
            const d = STYLE_REGISTRY[id];
            expect(d.id).toBe(id);
            expect(d.label.length).toBeGreaterThan(0);
            // furniture slots all valid hex
            for (const cat of ['upholstery', 'wood', 'table', 'metal', 'soft', 'neutral', 'mirror'] as const) {
                expect(d.furniture[cat].color, `${id}.${cat}`).toMatch(HEX);
            }
            expect(d.wallPaint).toMatch(HEX);
            expect(d.wallAccent).toMatch(HEX);
            expect(d.floorColor).toMatch(HEX);
            expect(d.doorFinish.frameColor).toMatch(HEX);
            expect(d.doorFinish.leafColor).toMatch(HEX);
            expect(d.windowFinish.frameColor).toMatch(HEX);
            expect(d.lighting.toneKelvin).toBeGreaterThan(1000);
            expect(d.lighting.fixtures.length).toBeGreaterThan(0);
            expect(Number.isFinite(d.glazingBias)).toBe(true);
            expect(d.glazingBias).toBeGreaterThan(0);
        }
    });

    it('founder glazing biases match the SPEC §3 table', () => {
        expect(STYLE_REGISTRY.mediterranean.glazingBias).toBeCloseTo(1.25);
        expect(STYLE_REGISTRY.nordic.glazingBias).toBeCloseTo(1.20);
        expect(STYLE_REGISTRY.classic.glazingBias).toBeCloseTo(1.05);
        expect(STYLE_REGISTRY.farmhouse.glazingBias).toBeCloseTo(1.05);
        expect(STYLE_REGISTRY.japanese.glazingBias).toBeCloseTo(1.0);
        expect(STYLE_REGISTRY.industrial.glazingBias).toBeCloseTo(0.95);
        // Mediterranean is the biggest; Industrial the smallest.
        const biases = ALL_6.map(glazingBiasFor);
        expect(Math.max(...biases)).toBe(STYLE_REGISTRY.mediterranean.glazingBias);
        expect(Math.min(...biases)).toBe(STYLE_REGISTRY.industrial.glazingBias);
    });

    describe('alias resolution (legacy maps absorbed)', () => {
        const cases: Array<[unknown, StyleId]> = [
            // canonical
            ['nordic', 'nordic'], ['mediterranean', 'mediterranean'], ['classic', 'classic'],
            ['farmhouse', 'farmhouse'], ['japanese', 'japanese'], ['industrial', 'industrial'],
            // legacy styleFinish chips → SPEC §4 folds
            ['modern', 'japanese'], ['minimal', 'japanese'], ['minimalist', 'japanese'],
            ['contemporary', 'japanese'],
            ['warm', 'mediterranean'], ['cozy', 'mediterranean'], ['cosy', 'mediterranean'],
            // floor synonyms
            ['scandinavian', 'nordic'], ['scandi', 'nordic'], ['traditional', 'classic'],
            ['rustic', 'farmhouse'], ['countryside', 'farmhouse'],
            ['warehouse', 'industrial'], ['loft', 'industrial'], ['zen', 'japanese'],
            // case + whitespace insensitive
            ['  Mediterranean ', 'mediterranean'], ['NORDIC', 'nordic'],
            // unknown / absent → default
            ['nonsense', DEFAULT_STYLE_ID], [undefined, DEFAULT_STYLE_ID],
            [null, DEFAULT_STYLE_ID], [42, DEFAULT_STYLE_ID],
        ];
        for (const [input, expected] of cases) {
            it(`${JSON.stringify(input)} → ${expected}`, () => {
                expect(resolveStyleId(input)).toBe(expected);
                expect(resolveStyle(input).id).toBe(expected);
            });
        }
        it('default is nordic (byte-identical absent-style anchor)', () => {
            expect(DEFAULT_STYLE_ID).toBe('nordic');
        });
    });
});

// ── ST.2 — floors to 6 styles ─────────────────────────────────────────────────

describe('ST.2 — floorFinish to 6 styles', () => {
    it('timber/wet/dry rooms resolve a finish for ALL 6 styles', () => {
        for (const s of ALL_6) {
            expect(floorFinishFor('living-room', s), `${s} timber`).not.toBeNull();
            expect(floorFinishFor('bathroom', s), `${s} wet`).not.toBeNull();
            expect(floorFinishFor('kitchen', s), `${s} dry`).not.toBeNull();
            expect(floorFinishFor('living-room', s)!.finishColor).toMatch(HEX);
        }
    });

    it('the 3 new styles have sensible spot-check finishes', () => {
        expect(floorFinishFor('living-room', 'industrial')!.finishPattern).toBe('seamless');
        expect(floorFinishFor('living-room', 'farmhouse')!.materialName).toMatch(/Plank/i);
        expect(floorFinishFor('living-room', 'japanese')!.materialName).toMatch(/Oak|Tatami/i);
    });

    it('normaliseFloorStyle is LOCK-STEP with resolveStyleId for every alias', () => {
        const aliases = [
            'nordic', 'mediterranean', 'classic', 'farmhouse', 'japanese', 'industrial',
            'modern', 'minimal', 'minimalist', 'contemporary', 'warm', 'cozy', 'cosy',
            'scandinavian', 'scandi', 'traditional', 'rustic', 'countryside', 'country',
            'warehouse', 'loft', 'zen', '???', '',
        ];
        for (const a of aliases) {
            // floorFinish has a legacy 'minimalist' key; resolveStyleId folds that to
            // 'japanese'. The lock-step contract is: they agree EXCEPT the floor module
            // may still answer 'minimalist' only if the registry also routes to a
            // minimalist read — which it never does (folded to japanese), so they MUST
            // agree for every alias here.
            expect(normaliseFloorStyle(a), `floor(${a})`).toBe(resolveStyleId(a));
        }
    });

    it('legacy DEFAULT (nordic) floor finish is byte-identical', () => {
        // absent style → nordic in BOTH the legacy and the extended path.
        expect(floorFinishFor('living-room', undefined)).toEqual(floorFinishFor('living-room', 'nordic'));
    });
});

// ── ST.3 — furniture finish to 6 styles + back-compat ─────────────────────────

describe('ST.3 — furniture finish to 6 styles', () => {
    it('every style resolves a furniture finish for each category kind', () => {
        const kinds = ['sofa', 'wardrobe', 'dining_table', 'fridge'];
        for (const s of ALL_6) {
            for (const k of kinds) {
                const f = styleFinishFor(s, k);
                expect(f.color, `${s}.${k}`).toMatch(HEX);
                expect(['fabric', 'wood', 'metal', 'glass', 'mirror']).toContain(f.material);
            }
        }
    });

    it('the 6 styles give distinct sofa upholstery colours', () => {
        const colours = ALL_6.map((s) => styleFinishFor(s, 'sofa').color);
        expect(new Set(colours).size).toBe(6);
    });

    it('category → material doctrine holds for the new styles', () => {
        for (const s of ['farmhouse', 'japanese', 'industrial'] as const) {
            expect(styleFinishFor(s, 'sofa').material).toBe('fabric');     // upholstery
            expect(styleFinishFor(s, 'wardrobe').material).toBe('wood');   // case-goods
        }
    });

    it('new-style finish == StyleRegistry slot (single source of truth)', () => {
        expect(styleFinishFor('industrial', 'sofa').color).toBe(STYLE_REGISTRY.industrial.furniture.upholstery.color);
        expect(styleFinishFor('japanese', 'wardrobe').color).toBe(STYLE_REGISTRY.japanese.furniture.wood.color);
        expect(styleFinishFor('farmhouse', 'dining_table').color).toBe(STYLE_REGISTRY.farmhouse.furniture.table.color);
    });

    describe('BACK-COMPAT — legacy 4 styles + aliases byte-identical', () => {
        // The legacy PALETTE_TABLE values (hard-coded so a regression here is loud).
        it('nordic wardrobe stays pale ash', () => {
            expect(styleFinishFor('nordic', 'wardrobe').color).toBe('#E2D6BE');
        });
        it('classic sofa stays deep burgundy', () => {
            expect(styleFinishFor('classic', 'sofa').color).toBe('#6E2230');
        });
        it('mediterranean fridge stays terracotta', () => {
            expect(styleFinishFor('mediterranean', 'fridge').color).toBe('#C97B4A');
        });
        it('legacy minimalist still resolves its OWN palette (mid-grey sofa)', () => {
            // 'minimalist' as a FURNITURE input still hits the legacy PALETTE_TABLE
            // (back-compat); only the floor/window pipeline re-points it to japanese.
            expect(styleFinishFor('minimalist', 'sofa').color).toBe('#C9C9C9');
        });
        it('legacy aliases (warm/modern/minimal) resolve to their ORIGINAL furniture target', () => {
            // warm → mediterranean (unchanged)
            expect(styleFinishFor('warm', 'sofa')).toEqual(styleFinishFor('mediterranean', 'sofa'));
            // modern/minimal → minimalist FURNITURE palette (byte-identical legacy)
            expect(styleFinishFor('modern', 'wardrobe')).toEqual(styleFinishFor('minimalist', 'wardrobe'));
            expect(styleFinishFor('minimal', 'sofa')).toEqual(styleFinishFor('minimalist', 'sofa'));
        });
        it('styleAccentsFor: legacy 4 unchanged + 3 new resolve from registry', () => {
            expect(styleAccentsFor('nordic').floorColor).toBe('#E2D6BE');
            expect(styleAccentsFor('industrial').wallAccent).toBe(STYLE_REGISTRY.industrial.wallAccent);
        });
    });
});

// ── ST.5 — glazing bias on window emission ────────────────────────────────────

// A long horizontal external wall from the origin (no doors, no junctions).
const wall = (lenMm: number, wallIndex = 0): ExternalWallSegment => ({
    start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex,
});

describe('ST.5 — glazing-size bias', () => {
    it('absent / 1 bias is BYTE-IDENTICAL to the legacy emission', () => {
        const walls = [wall(6000)];
        const base = emitWindowsForRoom('bedroom', walls, 'Bed', []);
        const explicit1 = emitWindowsForRoom('bedroom', walls, 'Bed', [], null, [], null, 1);
        expect(explicit1).toEqual(base);
        // non-finite / non-positive bias is treated as 1 (no surprise resizing).
        expect(emitWindowsForRoom('bedroom', walls, 'Bed', [], null, [], null, NaN)).toEqual(base);
        expect(emitWindowsForRoom('bedroom', walls, 'Bed', [], null, [], null, 0)).toEqual(base);
        expect(emitWindowsForRoom('bedroom', walls, 'Bed', [], null, [], null, -2)).toEqual(base);
    });

    it('bias > 1 makes the window WIDER (Mediterranean ~1.25), bias < 1 SMALLER', () => {
        const walls = [wall(8000)]; // long enough that a 1.25× bedroom window still fits
        const baseW = emitWindowsForRoom('bedroom', walls, 'Bed', [])[0]!.widthMm;
        const bigW = emitWindowsForRoom('bedroom', walls, 'Bed', [], null, [], null, 1.25)[0]!.widthMm;
        const smallW = emitWindowsForRoom('bedroom', walls, 'Bed', [], null, [], null, 0.95)[0]!.widthMm;
        expect(bigW).toBeGreaterThan(baseW);
        expect(smallW).toBeLessThan(baseW);
        // ~proportional to the bias (allowing the integer round).
        expect(bigW).toBeCloseTo(WINDOW_SPECS.bedroom.widthMm * 1.25, -1);
    });

    it('biased height also scales, and stays under the head cap', () => {
        const walls = [wall(8000)];
        const big = emitWindowsForRoom('bedroom', walls, 'Bed', [], null, [], null, 1.25)[0]!;
        expect(big.heightMm).toBeGreaterThan(WINDOW_SPECS.bedroom.heightMm);
        expect(big.sillMm + big.heightMm).toBeLessThanOrEqual(MAX_WINDOW_HEAD_MM);
    });

    it('a big bias still CLAMPS in-bounds (§WINDOW-SPAN-FIT) — never overflows the wall', () => {
        // A wall only just long enough for the base window: the 1.25× biased width must
        // be clamped to host within the band (corner piers) — offset + width ≤ wallLen.
        const lenMm = WINDOW_SPECS.bedroom.widthMm + 700; // tight wall
        const walls = [wall(lenMm)];
        const big = emitWindowsForRoom('bedroom', walls, 'Bed', [], null, [], null, 1.25)[0];
        if (big) {
            expect(big.offsetMm).toBeGreaterThanOrEqual(0);
            expect(big.offsetMm + big.widthMm).toBeLessThanOrEqual(lenMm + 1e-6);
        }
        // Either way it never produces an out-of-bounds span.
    });

    it('the LIVING patio head never exceeds the cap even at the biggest bias', () => {
        // living head is already 2200; a 1.25 bias would push height to ~2738 → must be
        // capped so head ≤ MAX_WINDOW_HEAD_MM.
        const walls = [wall(12000)];
        const w = emitWindowsForRoom('living', walls, 'Living', [], null, [], null, 1.25)[0];
        if (w) expect(w.sillMm + w.heightMm).toBeLessThanOrEqual(MAX_WINDOW_HEAD_MM);
    });
});
