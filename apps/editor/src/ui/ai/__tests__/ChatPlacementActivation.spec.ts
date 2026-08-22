// §FEAT-CHAT-TOOL-ACTIVATION (L-906, founder-urgent) — the EXECUTOR half.
// =============================================================================
//
// The founder's ask, verbatim: chat "Create a bed" should behave *"like if the
// user clicks via UI in Bed element — it could then go with the mouse and see
// preview of the element and set it via UI, in the canvas. ENABLE THIS FOR ALL
// ELEMENTS."* The ratified shape (BIM30-NEXT-SESSION-BRIEF §16.4 L-906 row):
// chat → TOOL ACTIVATION, never chat → creation (C83 §4.3 — no position is
// ever guessed; nothing mutates until the user clicks); ONE generic capability
// resolving against the element-creation matrix + the C17 furniture catalogue
// via the ONE resolveCatalogueRef ladder (C69 — never a hand-written list);
// ambiguity ASKS; a no-match names the nearest items instead of dead-ending.
//
// This suite drives the REAL resolver (`resolveUtterance` from @pryzm/ai-host)
// through the REAL bridge (`runZeroTokenResolution`) into the REAL enumeration
// (live ELEMENT_CREATION_MATRIX + live FurnitureCategoryRegistry) — only the
// window-side tool handles are stubs, because activating a real tool needs a
// real canvas.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveUtterance, type ResolverContext } from '@pryzm/ai-host';
import { runZeroTokenResolution, type ZeroTokenUiHooks } from '../ZeroTokenChatBridge';
import {
    activatePlacementFromChat,
    enumeratePlaceables,
    resolvePlacement,
    nearestPlaceables,
} from '../chatPlacementActivation';
import {
    ELEMENT_CREATION_MATRIX,
    type ElementCreationCapability,
} from '../../../engine/views/plantools/elementCreationMatrix';
import { getCategories } from '../../furniture-carousel/FurnitureCategoryRegistry';

// ─── Stub window handles (the only stubs — everything else is live) ──────────

type AnyWindow = Record<string, unknown>;
const w = (): AnyWindow => window as unknown as AnyWindow;

function stubWorld() {
    const furnitureActivations: string[] = [];
    const toolActivations: { tool: string; mode?: string }[] = [];
    w()['toolManager'] = {
        activateFurniture: (type: string) => { furnitureActivations.push(type); },
    };
    w()['runtime'] = {
        tools: { activate: (tool: string, mode?: string) => { toolActivations.push({ tool, mode }); } },
        events: { emit: vi.fn() },
    };
    return { furnitureActivations, toolActivations };
}

function hooks() {
    const said: string[] = [];
    const h: ZeroTokenUiHooks = {
        say: (t) => { said.push(t); },
        confirm: async () => true,
    };
    return { said, h };
}

const baseCtx = (): ResolverContext => ({
    selection: [],
    levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
    activeLevelId: 'L0',
    mintId: () => 'placement-spec',
});

let world: ReturnType<typeof stubWorld>;
beforeEach(() => { world = stubWorld(); });
afterEach(() => {
    delete w()['toolManager'];
    delete w()['runtime'];
    delete w()['_pryzmActiveFurnitureType'];
});

// ─── End to end: utterance → resolver → bridge → activation ──────────────────

describe('chat "create a bed" activates the palette path end to end', () => {
    it('"create a bed" activates furniture placement with the catalogue ref, and says so', async () => {
        const { said, h } = hooks();
        const ctx = baseCtx();
        const r = resolveUtterance('create a bed', ctx);
        expect(r.kind).toBe('local');
        await runZeroTokenResolution(r, ctx, h);
        // The SAME call FurnitureSidePanel's card click makes.
        expect(world.furnitureActivations).toEqual(['bed']);
        expect(said.length).toBe(1);
        expect(said[0]).toContain('Bed placement is active');
        expect(said[0]).toContain('nothing is created until you click');
    });

    it('"create slab" activates the slab tool through runtime.tools — the palette seam', async () => {
        const { said, h } = hooks();
        const ctx = baseCtx();
        const r = resolveUtterance('create slab', ctx);
        expect(r.kind).toBe('local');
        await runZeroTokenResolution(r, ctx, h);
        expect(world.toolActivations).toEqual([{ tool: 'slab', mode: undefined }]);
        expect(said[0]).toContain('Slab tool is active');
    });

    it('activation is NOT creation: no furniture/tool call carries a position, and nothing is dispatched (C83 §4.3)', async () => {
        const { h } = hooks();
        const ctx = baseCtx();
        const r = resolveUtterance('create a bed', ctx);
        await runZeroTokenResolution(r, ctx, h);
        // The activation payload is the catalogue ref ONLY — no coordinates,
        // no level, no store write. The user's click supplies the position.
        expect(world.furnitureActivations).toEqual(['bed']);
        expect(world.toolActivations).toEqual([]);
    });
});

// ─── Ambiguity ASKS; no-match names the nearest items ────────────────────────

describe('ambiguity and no-match are honest, never dead ends', () => {
    it('an ambiguous reference ASKS, naming the real candidates, and activates NOTHING', () => {
        // Derive a genuinely ambiguous token from the LIVE enumeration so the
        // test survives catalogue edits: a meaningful word shared by >= 2
        // distinctly-named entries that is not itself an id or full name.
        const entries = enumeratePlaceables();
        const byWord = new Map<string, Set<string>>();
        for (const e of entries) {
            for (const word of e.name.toLowerCase().split(/[^a-z0-9]+/)) {
                if (word.length < 4) continue;
                // words resolveCatalogueRef's GENERIC_NOISE strips can never be ambiguous
                if (word === 'type' || word === 'default') continue;
                if (entries.some((x) => x.id === word || x.name.toLowerCase() === word)) continue;
                byWord.set(word, (byWord.get(word) ?? new Set()).add(e.name));
            }
        }
        const ambiguous = [...byWord.entries()].find(([, names]) => names.size >= 2);
        expect(ambiguous).toBeDefined();
        const [token] = ambiguous!;

        const res = resolvePlacement(token, entries);
        expect(res.outcome).toBe('ask');

        const reply = activatePlacementFromChat(token);
        expect(reply).toContain('Which one?');
        expect(reply).toContain('Nothing was activated');
        expect(world.furnitureActivations).toEqual([]);
        expect(world.toolActivations).toEqual([]);
    });

    it('a no-match names the nearest real items instead of dead-ending, and activates NOTHING', () => {
        const reply = activatePlacementFromChat('zeppelin');
        expect(reply).toContain('There is no placeable item or creation tool called "zeppelin"');
        expect(reply).toContain('nothing was activated');
        expect(reply).toContain('Nearest matches:');
        expect(world.furnitureActivations).toEqual([]);
        expect(world.toolActivations).toEqual([]);
    });

    it('"bedroom" (a room concept, not a placeable) is refused with real neighbours named', () => {
        const nearest = nearestPlaceables('bedroom', enumeratePlaceables());
        expect(nearest.length).toBeGreaterThan(0);
        const reply = activatePlacementFromChat('bedroom');
        expect(reply).toContain('nothing was activated');
        expect(reply).toContain('Nearest matches:');
    });
});

// ─── Enumeration provably derives from the two declared sources ──────────────

describe('enumeration derives from the matrix + catalogue — no hand-written rival list (C69)', () => {
    it('EVERY element-creation-matrix tool resolves to itself by its registry key', () => {
        const entries = enumeratePlaceables();
        for (const cap of ELEMENT_CREATION_MATRIX) {
            const res = resolvePlacement(cap.tool, entries);
            expect(res.outcome, `matrix tool "${cap.tool}" must resolve`).toBe('resolved');
            expect(res.outcome === 'resolved' && res.entry.kind === 'tool' && res.entry.tool).toBe(cap.tool);
        }
    });

    it('EVERY furniture catalogue item is enumerated by type and label', () => {
        const entries = enumeratePlaceables();
        for (const cat of getCategories()) {
            for (const item of cat.items) {
                expect(
                    entries.some((e) => e.kind === 'furniture' && e.id === String(item.type) && e.name === item.label),
                    `catalogue item "${item.label}" (${String(item.type)}) must be enumerated`,
                ).toBe(true);
            }
        }
    });

    it('a kind ADDED to the matrix is automatically resolvable — the anti-rival-list proof', () => {
        const synthetic: ElementCreationCapability = {
            tool: 'teleporter',
            label: 'Teleporter pad',
            views: ['plan', '3d'],
            modes: [],
            autoIn: [],
            modeSource: 'n/a',
        };
        const entries = enumeratePlaceables([...ELEMENT_CREATION_MATRIX, synthetic], getCategories());
        const byKey = resolvePlacement('teleporter', entries);
        expect(byKey.outcome).toBe('resolved');
        const byLabel = resolvePlacement('teleporter pad', entries);
        expect(byLabel.outcome).toBe('resolved');
    });
});

// ─── Honesty when the runtime is not ready; view-restriction disclosure ──────

describe('activation never overclaims', () => {
    it('a single-view tool discloses its view restriction', () => {
        const lift = ELEMENT_CREATION_MATRIX.find((c) => c.tool === 'lift');
        expect(lift?.views).toEqual(['3d']); // guard: if lift gains plan view, update this test
        const reply = activatePlacementFromChat('lift');
        expect(reply).toContain('3d view only');
        expect(world.toolActivations).toEqual([{ tool: 'lift', mode: undefined }]);
    });

    it('tool runtime not ready → says NOTHING was activated, points at the palette', () => {
        delete w()['runtime'];
        const reply = activatePlacementFromChat('slab');
        expect(reply).toContain('nothing was activated');
        expect(reply).toContain('Create palette');
    });

    it('furniture bridges not ready → says NOTHING was activated', () => {
        delete w()['toolManager'];
        delete w()['runtime'];
        const reply = activatePlacementFromChat('bed');
        expect(reply).toContain('nothing was activated');
        expect(world.furnitureActivations).toEqual([]);
    });
});

// ─── §FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN (L-4600) ────────────────
//
// The founder typed "Create Stair" and was told "Stair tool is active — … click
// to place". Nothing was created and no panel appeared.
//
// The mechanism: `runtime.tools.activate()` returned `void` and recorded the
// active-tool id whether or not an activator existed, so this bridge reached the
// success sentence for SIX declared families that arm nothing (measured
// 2026-08-22: furniture, grid, lift, lighting, railing, stair-path — the set
// difference between ELEMENT_CREATION_MATRIX tool ids and the ids passed to
// runtime.tools.register in ToolsAreaLayout).
//
// ⛔ THE FIX IS NOT A VAGUER SENTENCE. The reply asserted below is MORE
// specific than the one it replaces.

describe('§FIX-ACTIVATE-REPORTS-WHETHER-ANYTHING-RAN — chat must not claim an activation that did not happen', () => {
    it('⭐ activate() returns FALSE → the reply says NOTHING was activated and names the family', () => {
        // The real slot returns false when no activator is registered.
        w()['runtime'] = {
            tools: { activate: () => false },
            events: { emit: vi.fn() },
        };
        const reply = activatePlacementFromChat('stair');

        // It must NOT make the old claim …
        expect(reply).not.toContain('tool is active');
        expect(reply).not.toContain('nothing is created until you click');
        // … and it must say what actually happened, naming the family so the
        // reader can act on it.
        expect(reply).toContain('nothing was activated');
        expect(reply).toContain('NO ACTIVATOR');
        expect(reply).toContain('stair');
    });

    it('activate() returns TRUE → the ordinary success sentence is unchanged', () => {
        w()['runtime'] = {
            tools: { activate: () => true },
            events: { emit: vi.fn() },
        };
        const reply = activatePlacementFromChat('slab');
        expect(reply).toContain('Slab tool is active');
        expect(reply).toContain('nothing is created until you click');
    });

    it('⚠ a slot that returns VOID is treated as success — deliberate, and this pins it', () => {
        // Only an EXPLICIT `false` triggers the refusal (`armed === false`).
        // Every pre-existing caller and stub returns undefined, and widening the
        // test to `!armed` would have turned all of them into false refusals —
        // a "fix" that reports failure on success is the same defect inverted.
        w()['runtime'] = {
            tools: { activate: () => undefined },
            events: { emit: vi.fn() },
        };
        const reply = activatePlacementFromChat('slab');
        expect(reply).toContain('Slab tool is active');
    });
});
