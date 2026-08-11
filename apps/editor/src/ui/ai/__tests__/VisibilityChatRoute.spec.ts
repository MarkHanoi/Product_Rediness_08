// §GATE-VIS-INTENT / §GATE-QUERYENGINE-READ-ONLY (VIS-CLASS, 2026-08-11)
// =============================================================================
//
// The EXECUTOR half of the visibility capability class — the bridge side that
// `packages/ai-host/__tests__/visibility-capability.test.ts` (the resolver
// half) cannot see:
//
//   • 'applyVisibilityIntent' dispatches EXACTLY the declared compose-root bus
//     command through runtime.bus, then projects the intent onto the scene via
//     runtime.visibility.applyToScene (the SpatialTree write-then-project
//     gesture — the bus handlers only write the store);
//   • 'answer' (the READ-ONLY class) dispatches NOTHING — the mutation-
//     impossibility proof at the executor level. Together with
//     composeRuntime.visibilityIntent.test.ts (bus → store is the ONLY write
//     path) this is the "the read-only question mutates no store state" claim,
//     made checkable end to end;
//   • a bus rejection reports failure honestly and never says the summary;
//   • no visibility reply ever claims "undo with Ctrl+Z" — the handlers
//     declare `affectedStores: []`, so there is no undo entry to offer.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveUtterance, type ResolverContext, type ZeroTokenResolution } from '@pryzm/ai-host';
import {
    buildZeroTokenContext,
    runZeroTokenResolution,
    type ZeroTokenUiHooks,
} from '../ZeroTokenChatBridge';

// ─── Stub runtime + scene ────────────────────────────────────────────────────

interface Dispatched { type: string; payload: unknown }

function makeWorld(intentState?: {
    hiddenElementIds: ReadonlySet<string>;
    temporaryIsolation: { active: boolean; elementIds: ReadonlySet<string> } | null;
} | 'unreadable') {
    const dispatched: Dispatched[] = [];
    const projected: { ids: readonly string[] }[] = [];
    const restoreEvents: unknown[] = [];
    const sceneNodes = [
        { userData: { id: 'w1' } },
        { userData: { id: 'w2' } },
        { userData: { id: 'edge-1', role: 'edges' } },
        { userData: {} }, // no id — never projected
    ];
    const scene = {
        userData: {},
        traverse(fn: (n: unknown) => void) { for (const n of sceneNodes) fn(n); },
    };
    const w = window as unknown as Record<string, unknown>;
    w['runtime'] = {
        bus: {
            executeCommand: vi.fn(async (type: string, payload: unknown) => {
                dispatched.push({ type, payload });
                return {};
            }),
        },
        visibility: {
            applyToScene: vi.fn((_root: unknown, ids: readonly string[]) => {
                projected.push({ ids });
                return { matched: ids.length, hidden: 0 };
            }),
            // 'unreadable' drops the intent slot entirely — the real "the
            // store cannot be read" runtime state, which must NOT read as
            // "nothing is hidden" (§CONTEXT-DATA-HONESTY).
            ...(intentState === 'unreadable' ? {} : {
                intent: {
                    get: () => intentState ?? {
                        hiddenElementIds: new Set<string>(),
                        temporaryIsolation: null,
                    },
                },
            }),
        },
        viewRegistry: { activeViewId: null },
    };
    w['selectionManager'] = { world: { scene: { three: scene } } };
    const onRestore = (e: Event) => restoreEvents.push((e as CustomEvent).detail);
    window.addEventListener('pryzm-visibility-command', onRestore);
    return {
        dispatched, projected, restoreEvents,
        dispose() {
            window.removeEventListener('pryzm-visibility-command', onRestore);
            delete w['runtime'];
            delete w['selectionManager'];
        },
    };
}

function hooks() {
    const said: string[] = [];
    const h: ZeroTokenUiHooks = {
        say: (t) => { said.push(t); },
        confirm: async () => true,
    };
    return { said, h };
}

const ctxOf = (selection: ResolverContext['selection']): ResolverContext => ({
    selection,
    levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
    activeLevelId: 'L0',
    mintId: () => 'vis-route',
});

let world: ReturnType<typeof makeWorld>;
beforeEach(() => { world = makeWorld(); });
afterEach(() => { world.dispose(); });

async function runUtterance(utterance: string, ctx: ResolverContext, said: string[], h: ZeroTokenUiHooks): Promise<ZeroTokenResolution> {
    const r = resolveUtterance(utterance, ctx);
    await runZeroTokenResolution(r, ctx, h);
    expect(said.length).toBeGreaterThan(0);
    return r;
}

// ─── The mutating three: dispatch + project ──────────────────────────────────

describe('§GATE-VIS-INTENT — the bridge dispatches the compose-root verbs and projects', () => {
    it('"hide this wall" → visibility.hide.selection, projected onto exactly the hidden ids', async () => {
        const { said, h } = hooks();
        await runUtterance('hide this wall', ctxOf([{ elementId: 'w1', elementType: 'wall' }]), said, h);
        expect(world.dispatched).toEqual([
            { type: 'visibility.hide.selection', payload: { elementIds: ['w1'] } },
        ]);
        expect(world.projected).toEqual([{ ids: ['w1'] }]);
        // HONESTY — never "undo with Ctrl+Z" for a patch-less intent.
        expect(said.join(' ')).not.toMatch(/undo with ctrl\+z/i);
        expect(said.join(' ')).toMatch(/not undoable/);
    });

    it('"isolate the selection" → visibility.isolate.selection, projected over EVERY scene id', async () => {
        const { said, h } = hooks();
        await runUtterance('isolate the selection', ctxOf([{ elementId: 'w2', elementType: 'wall' }]), said, h);
        expect(world.dispatched).toEqual([
            { type: 'visibility.isolate.selection', payload: { elementIds: ['w2'] } },
        ]);
        // Everything that carries an id is re-projected (non-isolated hides).
        expect([...world.projected[0]!.ids].sort()).toEqual(['edge-1', 'w1', 'w2']);
    });

    it('"reveal all" → visibility.reveal.all {}, projects all non-edge ids and resets the panel', async () => {
        const { said, h } = hooks();
        await runUtterance('reveal all', ctxOf([]), said, h);
        expect(world.dispatched).toEqual([{ type: 'visibility.reveal.all', payload: {} }]);
        // The legacy restore excludes `role: 'edges'` nodes — mirrored here.
        expect([...world.projected[0]!.ids].sort()).toEqual(['w1', 'w2']);
        // The ViewBrowser checkbox state resets through the same event the
        // legacy restore handler used.
        expect(world.restoreEvents).toEqual([{ action: 'restore', target: 'all', value: '' }]);
    });

    it('a bus rejection is reported as failure — the summary is never spoken', async () => {
        const w = window as unknown as { runtime?: { bus?: { executeCommand: unknown } } };
        w.runtime!.bus!.executeCommand = vi.fn(async () => { throw new Error('no handler'); });
        const { said, h } = hooks();
        await runUtterance('hide this wall', ctxOf([{ elementId: 'w1', elementType: 'wall' }]), said, h);
        expect(said[0]).toContain('did not complete');
        expect(said[0]).toContain('Nothing was changed');
        expect(world.projected).toEqual([]);
    });
});

// ─── The read-only class: the executor dispatches NOTHING ────────────────────

describe('§GATE-QUERYENGINE-READ-ONLY — the answer action mutates nothing', () => {
    it.each([
        'what is hidden',
        'list the hidden elements',
        'what levels are visible',
        'am I in isolation mode?',
    ])('"%s" answers without touching the bus or the scene', async (u) => {
        const { said, h } = hooks();
        const ctx: ResolverContext = {
            ...ctxOf([]),
            visibility: { hiddenCount: 1, isolationActive: false, isolationCount: 0 },
        };
        const r = await runUtterance(u, ctx, said, h);
        expect(r.kind).toBe('local');
        if (r.kind === 'local') expect(r.action).toBe('answer');
        // THE PROOF: zero dispatches, zero projections — there is no write
        // path left (composeRuntime.visibilityIntent.test.ts pins that the
        // ONLY production write path into ViewVisibilityIntentStore is the bus
        // commands this executor did not call).
        expect(world.dispatched).toEqual([]);
        expect(world.projected).toEqual([]);
        expect(said).toHaveLength(1);
    });
});

// ─── THE WIRING IS LIVE, not merely present ──────────────────────────────────
//
// A test that the class EXISTS is not proof it is REACHED. These drive
// `buildZeroTokenContext()` — the production context builder the chat panel
// calls on every message (ZeroTokenChatBridge.ts, the `visibility` field at the
// return object) — and assert the read-only answer is SPECIFIC: it names the
// real numbers read off the runtime's own store, and it distinguishes
// "unreadable" from "empty" rather than collapsing both into a generic reply.

describe('§GATE-VIS-READONLY — the injection point is live and the answer is specific', () => {
    it('buildZeroTokenContext() carries the runtime store snapshot into the resolver', async () => {
        world.dispose();
        world = makeWorld({
            hiddenElementIds: new Set(['w1', 'w2', 'w3']),
            temporaryIsolation: { active: true, elementIds: new Set(['w9']) },
        });
        const ctx = await buildZeroTokenContext();
        // THE INJECTION: production context building, not a hand-made object.
        expect(ctx.visibility).toEqual({
            hiddenCount: 3, isolationActive: true, isolationCount: 1,
        });

        const { said, h } = hooks();
        await runZeroTokenResolution(resolveUtterance('what is hidden', ctx), ctx, h);
        // SPECIFIC, not generic: the reply names WHICH subject (this view's
        // hidden set and its isolation) and the REAL counts read off the
        // runtime's store — a generic "nothing to report" would pass a mere
        // existence test and fail this one.
        expect(said[0]).toContain('3 elements are explicitly hidden');
        expect(said[0]).toContain('isolation over 1 element is active');
        expect(world.dispatched).toEqual([]);
    });

    it('UNREADABLE and EMPTY are different answers through the SAME production path', async () => {
        // EMPTY — the store answers, and it holds nothing.
        const empty = await buildZeroTokenContext();
        expect(empty.visibility).toEqual({ hiddenCount: 0, isolationActive: false, isolationCount: 0 });
        const a = hooks();
        await runZeroTokenResolution(resolveUtterance('what is hidden', empty), empty, a.h);
        expect(a.said[0]).toContain('Nothing is hidden in this view');

        // UNREADABLE — no intent slot on the runtime at all.
        world.dispose();
        world = makeWorld('unreadable');
        const unreadable = await buildZeroTokenContext();
        expect(unreadable.visibility).toBeUndefined();
        const b = hooks();
        await runZeroTokenResolution(resolveUtterance('what is hidden', unreadable), unreadable, b.h);
        expect(b.said[0]).toContain('cannot read the visibility state');
        expect(b.said[0]).not.toContain('Nothing is hidden');

        // The two answers are not the same value — the whole point.
        expect(a.said[0]).not.toEqual(b.said[0]);
    });

    it('the per-element unhide REFUSAL names the gap and offers the live ability', async () => {
        const ctx = await buildZeroTokenContext();
        const { said, h } = hooks();
        const sel: ResolverContext = { ...ctx, selection: [{ elementId: 'w1', elementType: 'wall' }] };
        await runZeroTokenResolution(resolveUtterance('unhide this wall', sel), sel, h);
        // Not empty, not generic: it says WHAT is missing (per-element unhide),
        // that nothing changed, and WHICH capability does exist.
        expect(said[0]).toContain('per-element unhide is not connected to chat yet');
        expect(said[0]).toContain('Nothing was changed');
        expect(said[0]).toContain('"reveal all"');
        expect(world.dispatched).toEqual([]);
    });
});
