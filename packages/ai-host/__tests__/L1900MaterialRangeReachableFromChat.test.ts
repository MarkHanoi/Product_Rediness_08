// §MICROCEMENT-PAINT-AND-TILE-RANGE (L-1900..L-1903, lane MAT2, 2026-08-21).
//
// THE ASK, verbatim: *"It works but I need way more: I need 20 microcement
// colours — from red, blue, green, dark grey… many greys, all possible colours
// like: 'make all walls on level 2 interior finish ambar microcement' / 'make all
// walls on level 2 interior finish Blue pastel paint' (also 30 different colour
// paints). I want also 30+ types of tiles for kitchen and toilets — with
// different sizes, colours, shine finishes, etc…"*
//
// ⭐ EVERY SENTENCE BELOW DRIVES THE REAL LADDER — `resolveCompoundUtterance` →
// `resolveUtterance` (tier 0/1) → `resolveNaturalLanguage` — and asserts THE
// RESOLVED ROW ID, never merely that something resolved. A test that asserts
// "not null" would pass while the founder's amber microcement silently answered
// with warm grey, which is the §L960-WOOD-IS-A-SURFACE defect and the one this
// range is most likely to reintroduce. Production has no AI upstream, so a
// capability that resolves only through the LLM planner does not exist for him.
//
// MEASURED before the rows landed (real resolver, base 408a6c5e):
//   resolveFinishRef('ambar microcement')   -> null
//   resolveFinishRef('amber microcement')   -> null
//   resolveFinishRef('blue pastel paint')   -> null
//   resolveFinishRef('navy gloss')          -> null
//   resolveFinishRef('bone matt')           -> null

import { describe, it, expect } from 'vitest';
import {
    resolveUtterance,
    type ResolverContext,
    type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import {
    resolveFinishRef,
    finishRefCandidates,
    finishRefIntegrityErrors,
    catalogueFinishCount,
} from '../src/intents/finishRef.js';
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import type { ScopeDescriptor, ScopeResult } from '../src/intents/ScopeDescriptor.js';

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
    return {
        selection: [],
        levels: [
            { id: 'L0', name: 'Ground', elevation: 0 },
            { id: 'L1', name: 'Level 1', elevation: 3 },
            { id: 'L2', name: 'Level 2', elevation: 6 },
        ],
        activeLevelId: 'L0',
        mintId: () => `mat2-${++seq}`,
        resolveScope: ((): ScopeResult => ({
            ids: ['w-0', 'w-1', 'w-2'],
            kindCounts: {},
            skipped: [],
            diagnostics: ['Level 2'],
        })) as unknown as (d: ScopeDescriptor) => ScopeResult,
        ...overrides,
    } as ResolverContext;
}

/** THE REAL LADDER the chat bridge uses. Nothing here shortcuts to an arm. */
function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
    const plan = resolveCompoundUtterance(utterance, ctx);
    if (plan !== null) return plan;
    const tier01 = resolveUtterance(utterance, ctx);
    if (tier01.kind !== 'miss') return tier01;
    const nl = resolveNaturalLanguage(utterance, ctx);
    if (nl.kind === 'resolved') return nl.resolution;
    return { kind: 'miss' };
}

/** The `materialId` a whole SENTENCE puts on the wall, through the real ladder. */
function sentenceResolvesTo(utterance: string): { intent: string; materialId: string | null; side: string | null } {
    const r = resolveFull(utterance, ctxOf());
    if (r.kind !== 'commands') {
        return { intent: r.kind === 'refusal' ? `refusal:${r.reason}` : r.kind, materialId: null, side: null };
    }
    const cmd = r.commands[0]!;
    const p = cmd.payload as Record<string, unknown>;
    const finish = p['finish'] as Record<string, unknown> | undefined;
    return {
        intent: cmd.type,
        materialId: (finish?.['materialId'] as string | undefined) ?? null,
        side: (p['side'] as string | undefined) ?? null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("THE FOUNDER'S TWO SENTENCES, verbatim, through the REAL ladder", () => {
    // ⭐ HIS SPELLING IS PRESERVED. "ambar" is not a typo to be tidied out of the
    //    test — it is the input, and a test that silently corrects it proves
    //    nothing about the sentence he will actually type (§FIX-AMBAR-IS-AMBER).
    it('"make all walls on level 2 interior finish ambar microcement" → Microcement Amber', () => {
        const got = sentenceResolvesTo('make all walls on level 2 interior finish ambar microcement');
        expect(got.intent).toBe('wall.setSideFinishBatch');
        expect(got.side).toBe('interior');
        // THE ROW ID, not "something non-null". Warm Grey passing here would be
        // the whole defect this file exists to catch.
        expect(got.materialId).toBe('coating-microcement-amber');
    });

    it('"make all walls on level 2 interior finish Blue pastel paint" → Paint · Pastel Blue', () => {
        const got = sentenceResolvesTo('make all walls on level 2 interior finish Blue pastel paint');
        expect(got.intent).toBe('wall.setSideFinishBatch');
        expect(got.side).toBe('interior');
        expect(got.materialId).toBe('paint-pastel-blue');
    });
});

describe('A REPRESENTATIVE SAMPLE OF ALL THREE FAMILIES, as whole sentences', () => {
    const CASES: ReadonlyArray<readonly [string, string, string]> = [
        // sentence                                                        expected id                        side
        ['make all walls on level 2 interior finish anthracite microcement', 'coating-microcement-anthracite', 'interior'],
        ['change all walls interior finish to petrol blue microcement', 'coating-microcement-petrol-blue', 'interior'],
        ['make all outer finishes walls to terracotta microcement', 'coating-microcement-terracotta', 'exterior'],
        ['set all walls interior finish to sage green paint', 'paint-sage-green', 'interior'],
        ['make all walls interior finish deep navy paint', 'paint-deep-navy', 'interior'],
        ['change all walls interior finish to burnt orange paint', 'paint-burnt-orange', 'interior'],
        ['make all walls interior finish emerald gloss', 'tile-gloss-emerald', 'interior'],
        ['change all walls interior finish to bone matt', 'tile-matt-bone', 'interior'],
        ['set all walls interior finish to duck egg satin', 'tile-satin-duck-egg', 'interior'],
    ];
    for (const [sentence, id, side] of CASES) {
        it(`"${sentence}" → ${id}`, () => {
            const got = sentenceResolvesTo(sentence);
            expect(got.intent).toBe('wall.setSideFinishBatch');
            expect(got.side).toBe(side);
            expect(got.materialId).toBe(id);
        });
    }
});

describe('THE VALUE STAGE — resolveFinishRef, on the words a person types', () => {
    const CASES: ReadonlyArray<readonly [string, string]> = [
        // The founder's spelling, and the English he might use next time.
        ['ambar microcement', 'coating-microcement-amber'],
        ['amber microcement', 'coating-microcement-amber'],
        ['microcement amber', 'coating-microcement-amber'],
        // §FIX-AMBAR-IS-AMBER — the Spanish/Catalan bridge, applied at WORD level,
        // so it works for material words too and not only for "ambar".
        ['microcemento ambar', 'coating-microcement-amber'],
        ['pintura azul pastel', 'paint-pastel-blue'],
        ['gris pastel', 'paint-pastel-grey'],
        // Word order is irrelevant — the matcher is a token SUBSET, not a prefix.
        ['blue pastel paint', 'paint-pastel-blue'],
        ['pastel blue paint', 'paint-pastel-blue'],
        ['pastel blue', 'paint-pastel-blue'],
        // en-US spelling of a colour the catalogue spells en-GB.
        ['pastel gray', 'paint-pastel-grey'],
        ['slate gray paint', 'paint-slate-grey'],
        // The three sheen bands, which are the axis he asked for by name.
        ['navy gloss', 'tile-gloss-navy'],
        ['gloss cobalt', 'tile-gloss-cobalt'],
        ['obsidian gloss', 'tile-gloss-obsidian'],
        ['taupe satin', 'tile-satin-taupe'],
        ['anthracite matt', 'tile-matt-anthracite'],
        ['rust matt', 'tile-matt-rust'],
        // ⭐ "matt white" MISSED before L-1903: the master spells one sheen two
        //    ways ("Paint · Matte White" and "Ceramic Tile · Grey Matt").
        ['matt white', 'paint-matte-white'],
        ['matte white', 'paint-matte-white'],
    ];
    for (const [phrase, id] of CASES) {
        it(`"${phrase}" → ${id}`, () => {
            const got = resolveFinishRef(phrase);
            expect(got, `"${phrase}" did not resolve at all`).not.toBeNull();
            expect(got!.materialId).toBe(id);
        });
    }

    it('the canonical nicknames still win outright — the alias arm runs FIRST', () => {
        // 21 rows now carry the token "microcement", so the CATALOGUE arm would
        // correctly call the bare word ambiguous. The alias arm is what keeps the
        // shipped sentence "change the inner finish of all walls to microcement"
        // deterministic, and it must stay ahead of the range.
        expect(resolveFinishRef('microcement')!.materialId).toBe('paint-microcement-warm-grey');
        expect(resolveFinishRef('plaster')!.materialId).toBe('gypsum-skim');
        expect(resolveFinishRef('white paint')!.materialId).toBe('paint-matte-white');
        expect(resolveFinishRef('venetian plaster')!.materialId).toBe('gypsum-venetian');
        expect(resolveFinishRef('wood')!.materialId).toBe('wood-oak');
    });

    it('§FIX-PLASTER-WHITE-IS-A-SERIAL-NUMBER (L-1904) — a canonical nickname is not outvoted by row count', () => {
        // Measured RED at 408a6c5e, i.e. BEFORE this lane: `Plaster · Rough White
        // 003` (added by b58500d7) is the first master label carrying both words,
        // so the two-word span started matching and beat the one-word span
        // "plaster". The founder asking for white plaster got a rough external
        // render with a texture-pack serial in its name, reported as success.
        expect(resolveFinishRef('plaster white')!.materialId).toBe('gypsum-skim');
        expect(resolveFinishRef('white plaster')!.materialId).toBe('gypsum-skim');
        // ⚠ and the serialised row is NOT withdrawn — it is a real, map-bearing
        //   product and stays nameable by its own full label.
        expect(resolveFinishRef('plaster rough white 003')!.materialId).toBe('plaster-rough-white-003');
    });

    it('an ambiguous colour is a QUESTION, never a pick', () => {
        // Two greens and two blues in the microcement range. Refusing and naming
        // both is the ruling the file already carries; a tie-break here would be
        // a coin-flip with a rationale attached.
        expect(resolveFinishRef('green microcement')).toBeNull();
        expect(finishRefCandidates('green microcement').map((c) => c.materialId).sort()).toEqual([
            'coating-microcement-forest-green',
            'coating-microcement-sage-green',
        ]);
    });
});

describe('THE CATALOGUE ITSELF — the invariant, not a transcribed count', () => {
    it('every alias still names a real master row', () => {
        expect(finishRefIntegrityErrors()).toEqual([]);
    });

    it('the three families are at or above what the founder asked for', () => {
        const n = (pred: (m: { id: string }) => boolean) => MATERIAL_CATALOG.filter(pred).length;
        expect(n((m) => m.id.startsWith('coating-microcement-'))).toBeGreaterThanOrEqual(20);
        expect(n((m) => m.id.startsWith('paint-'))).toBeGreaterThanOrEqual(30);
        expect(n((m) => m.id.startsWith('tile-'))).toBeGreaterThanOrEqual(30);
        expect(catalogueFinishCount()).toBe(MATERIAL_CATALOG.length);
    });

    it('EVERY master row is uniquely nameable by its own label — all of them', () => {
        // ⭐ THE REACHABILITY INVARIANT, stated over the whole master rather than
        //    over the rows this lane happened to add. It is what makes "add a row
        //    and it is chat-nameable" true rather than hoped for, and it is the
        //    property a future range must not quietly break: two rows whose labels
        //    tokenise identically make BOTH unreachable, not one.
        const unreachable: string[] = [];
        for (const m of MATERIAL_CATALOG) {
            const hits = finishRefCandidates(m.label);
            if (hits.length !== 1 || hits[0]!.materialId !== m.id) {
                unreachable.push(`${m.id} ("${m.label}") -> [${hits.map((h) => h.materialId).join(', ')}]`);
            }
        }
        expect(unreachable).toEqual([]);
    });

    it('ids and labels are unique across the whole master', () => {
        const ids = MATERIAL_CATALOG.map((m) => m.id);
        const labels = MATERIAL_CATALOG.map((m) => m.label);
        expect(ids.filter((v, i) => ids.indexOf(v) !== i)).toEqual([]);
        expect(labels.filter((v, i) => labels.indexOf(v) !== i)).toEqual([]);
    });
});

describe('⛔ THE HONESTY PIN — a name may not describe what the wall cannot draw', () => {
    // `WallFragmentBuilder.ts` calls `applyMaterialMaps(params, matDef,
    // uvSpaceOfGeometry(null))` — literally `null` — so every wall resolves
    // UV_NONE and `resolveMaterialTextures` returns `state: 'no-uvs'`: no map is
    // attached and the wall paints its flat base colour. A row whose NAME claims
    // a size, a bond or a grout joint is therefore a lie on every wall in the
    // product. C100 §10.11.
    //
    // ⚠ SCOPED TO THIS LANE'S ROWS ON PURPOSE. Thirteen earlier rows DO carry a
    // size in their label (`Tile · Porcelain 600 × 600, stack bond, 3 mm grout`),
    // they are map-bearing, and they render that size correctly on a SLAB, whose
    // builder passes `UV_METRES`. Failing them here would assert a falsehood
    // about the slab in order to state a truth about the wall.
    const MINE = MATERIAL_CATALOG.filter(
        (m) => m.id.startsWith('coating-microcement-') || m.id.startsWith('paint-') || /^tile-(gloss|satin|matt)-/.test(m.id),
    );

    it('none of this lane\'s rows names a size, a bond, a grout joint or a RAL code', () => {
        const FORBIDDEN = /\d|×|\bbond\b|\bgrout\b|\bral\b|\bncs\b|herringbone|chevron|basket|mosaic|subway|metro|hexagon|chequer/i;
        const offenders = MINE.filter((m) => FORBIDDEN.test(m.label)).map((m) => m.label);
        expect(offenders).toEqual([]);
    });

    it('none of this lane\'s rows carries maps, because no wall body can bind one', () => {
        // A map here would be authored, shipped, fetched and then refused by the
        // adapter — cost with no pixel. When the wall body gains metre UVs these
        // rows gain maps in the same commit, not before.
        const withMaps = MINE.filter((m) => m.maps !== undefined).map((m) => m.id);
        expect(withMaps).toEqual([]);
    });

    it('the sheen a name claims IS the roughness the row carries', () => {
        // Gloss/satin/matt are the ONE visual axis beyond colour that these rows
        // assert, so the assertion is pinned to the data rather than trusted.
        for (const m of MINE) {
            if (/\bgloss\b/i.test(m.label)) expect(m.roughness, m.label).toBeLessThan(0.2);
            else if (/\bsatin\b/i.test(m.label)) expect(m.roughness, m.label).toBeGreaterThanOrEqual(0.2);
        }
        // and matt is the rough end
        for (const m of MINE) {
            if (/\bmatt\b/i.test(m.label)) expect(m.roughness, m.label).toBeGreaterThanOrEqual(0.6);
        }
    });
});
