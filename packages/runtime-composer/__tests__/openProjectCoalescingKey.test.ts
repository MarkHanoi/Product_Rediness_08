/**
 * openProjectCoalescingKey — §FIX-OPEN-COALESCE-KEYED-ON-NOTHING
 *
 * ─── THE DEFECT ─────────────────────────────────────────────────────────────
 *
 * `buildPersistence.ts` de-duplicated concurrent project opens with:
 *
 *     if (openProjectInflight !== null) return openProjectInflight;
 *
 * That guard **ignores `projectId`**. The async body closes over the FIRST
 * call's id, so a second open requested while the first was still running was
 * handed the first one's promise — and `projectContext.set(...)`, the
 * stream-load and `setProjectContext(...)` all ran for project A while the
 * caller believed it had opened B. The promise then RESOLVED, reporting success.
 *
 * ⭐ Could B's open EVER win? No — not once, not by racing, not by timing.
 * During the in-flight window B was unsatisfiable BY CONSTRUCTION. And the
 * window is a network refresh plus an engine boot, so it is seconds wide on a
 * real hub: clicking a second card during a slow load silently opened the first.
 *
 * ─── STUB LEDGER (read before trusting any green below) ─────────────────────
 *
 * The subject is the REAL `buildPersistenceSlot` and its REAL `openProject`.
 * Nothing about the coalescing decision is substituted.
 *
 * TWO declared inputs, both using seams the module documents for exactly this:
 *   • `opts.client` — the module's own "caller-supplied client (escape hatch)".
 *     Its `list()` returns a promise THIS TEST resolves by hand, which is what
 *     creates a deterministic in-flight window instead of a sleep race.
 *   • `attachEngineBootstrap` / `attachWorkspaceSurface` are deliberately NOT
 *     attached. The module states the contract: "Tests and headless callers omit
 *     both; openProject() degrades gracefully (data path runs, no scene loads,
 *     no surface flip)." The data path — which is where the defect lives — runs
 *     unmodified.
 *
 * `hint.isNewProject` is passed so step 3 skips `tier.streamLoad`, whose only
 * job is a network fetch. That is the module's own documented branch for a
 * project with no saved versions, not a bypass of the code under test.
 */

import { describe, expect, it } from 'vitest';
import { buildPersistenceSlot } from '../src/buildPersistence.js';

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c' } as const;

const summary = (id: string, name: string) => ({
    id,
    name,
    lastModifiedAt: '2026-01-01T00:00:00.000Z',
    thumbnailUrl: null,
    ownerName: '',
    collaboratorCount: 0,
    schemaVersion: 1,
});

/** A minimal EventBus — emit/on only, which is all persistence uses. */
function makeEvents() {
    const handlers = new Map<string, Array<(p: unknown) => void>>();
    return {
        emit: (k: string, p: unknown) => {
            (handlers.get(k) ?? []).forEach((h) => h(p));
        },
        on: (k: string, h: (p: unknown) => void) => {
            const arr = handlers.get(k) ?? [];
            arr.push(h);
            handlers.set(k, arr);
            return { dispose: () => undefined };
        },
    };
}

/** Records every projectContext.set — the observable this test asserts on. */
function makeProjectContext() {
    const sets: Array<{ projectId: string; projectName: string }> = [];
    return {
        sets,
        set: (v: { projectId: string; projectName: string }) => {
            sets.push(v);
        },
        clear: () => undefined,
        get: () => sets[sets.length - 1] ?? null,
    };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function fakeClient(list: () => Promise<unknown>): any {
    return {
        list,
        create: async () => summary('X', 'X'),
        delete: async () => undefined,
        rename: async () => summary('A', 'A'),
        patch: async () => summary('A', 'A'),
        duplicate: async () => summary('A', 'A'),
        signOut: async () => undefined,
        getAuthToken: () => null,
        members: {} as any,
        auth: {} as any,
    };
}

async function buildSlot() {
    const ctx = makeProjectContext();
    // The gate: `list()` does not settle until the test says so, which is what
    // holds the first open in flight while the second is issued. No sleeps, no
    // timing race — the window is opened and closed explicitly.
    let releaseList!: () => void;
    const listGate = new Promise<void>((res) => {
        releaseList = res;
    });

    const slot = await buildPersistenceSlot({
        audit: AUDIT as any,
        events: makeEvents() as any,
        projectContext: ctx as any,
        client: fakeClient(async () => {
            await listGate;
            return [summary('A', 'Project A'), summary('B', 'Project B')];
        }),
    });
    return { slot, ctx, releaseList };
}

describe('§FIX-OPEN-COALESCE-KEYED-ON-NOTHING — an open resolves for the project that was ASKED FOR', () => {
    it('⭐ opening B while A is in flight OPENS B — it does not silently resolve with A', async () => {
        const { slot, ctx, releaseList } = await buildSlot();

        // A starts and parks inside `controller.refresh()`.
        const openA = slot.openProject('A', { name: 'Project A', isNewProject: true });
        // B is requested while A is unmistakably still in flight.
        const openB = slot.openProject('B', { name: 'Project B', isNewProject: true });

        releaseList();
        await Promise.all([openA, openB]);

        // BEFORE THE FIX this array was ['A'] only: B's promise WAS A's promise,
        // B's id was never read, and the caller that asked for B was told it had
        // succeeded. The user clicked B and landed in A.
        const opened = ctx.sets.map((s) => s.projectId);
        expect(opened).toContain('B');
        // And B must be the project the session ENDS on — it was clicked last.
        expect(opened[opened.length - 1]).toBe('B');
    });

    it('a genuine DUPLICATE (same id) still coalesces to ONE open', async () => {
        // The property L-1282 depends on: same-id de-duplication must survive the
        // fix, or every duplicate call becomes a second full engine load.
        const { slot, ctx, releaseList } = await buildSlot();

        const a1 = slot.openProject('A', { name: 'Project A', isNewProject: true });
        const a2 = slot.openProject('A', { name: 'Project A', isNewProject: true });
        expect(a1).toBe(a2); // literally the same promise — not merely equivalent

        releaseList();
        await Promise.all([a1, a2]);

        expect(ctx.sets.filter((s) => s.projectId === 'A')).toHaveLength(1);
    });

    it('a FAILED open of A must not prevent B from opening', async () => {
        // The escape hatch. Without the `.catch()` on the superseded promise, a
        // user whose project A fails to open could not click their way out of it:
        // B would reject with A's error and the only recovery would be a reload.
        const ctx = makeProjectContext();
        let releaseList!: () => void;
        let failFirst = true;
        const gate = new Promise<void>((res) => {
            releaseList = res;
        });

        const slot = await buildPersistenceSlot({
            audit: AUDIT as any,
            events: makeEvents() as any,
            projectContext: ctx as any,
            client: fakeClient(async () => {
                await gate;
                if (failFirst) {
                    failFirst = false;
                    throw new Error('network down');
                }
                return [summary('A', 'Project A'), summary('B', 'Project B')];
            }),
        });

        const openA = slot.openProject('A', { name: 'Project A', isNewProject: true });
        const openB = slot.openProject('B', { name: 'Project B', isNewProject: true });
        releaseList();

        await openA.catch(() => undefined);
        await openB;

        expect(ctx.sets.map((s) => s.projectId)).toContain('B');
    });
});
