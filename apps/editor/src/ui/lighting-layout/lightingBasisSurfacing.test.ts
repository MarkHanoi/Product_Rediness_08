// §FURNISH-DROP-SURFACING (editor half) — LightingLayoutExecutor READS the
// furnish outcome and SURFACES the basis to the user.
//
// The engine half (L-SURFACE, 4e8046cb) gave `buildLightingCommands` a 4th arg
// (`FurnishStageOutcome`) and stamped `basis`/`basisDisclosure` on the command
// set. A payload nobody renders is another §10.2 instance — this suite demands
// the editor half:
//   1. the executor passes `furnishOutcome` (off the `lighting.layout-execute`
//      payload, carried by the trigger since commit 2) as that 4th arg;
//   2. the emitted `lighting.layout-executed` payload carries
//      `basis`/`basisDisclosure`;
//   3. on basis 'unfurnished' the success toast is DEMOTED to a WARN carrying
//      the disclosure ("computed WITHOUT furniture: <reason>") — the
//      user-visible half is the whole point.
//
// The basis strings are produced by the REAL ai-host `resolveLightingBasis`
// (imported actual inside the mock) — the fixtures never feed the value under
// test (C74 §3.4). Written RED-FIRST (C70 §5.6).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
    const state = {
        rooms: [] as unknown[],
        /** Fixtures the mocked lightRoom places per room. */
        lightsPerRoom: 1,
    };
    return { state };
});

vi.mock('@pryzm/core-app-model', () => ({
    batchCoordinator: {
        isBatching: false,
        runBatch: (fn: () => unknown) => fn(),
        onNextSettle: (_cb: () => void) => { /* unused */ },
    },
    storeRegistry: {
        getStoreForType: (t: string) =>
            t === 'room' ? { getAll: () => h.state.rooms } : undefined,
    },
}));

vi.mock('@pryzm/schemas', () => ({
    createId: (prefix: string) => `${prefix}-id`,
}));

// The pure engine: lightRoom is stubbed; buildLightingCommands delegates its
// basis stamping to the REAL lightingBasis module so these tests exercise the
// genuine three-outcomes vocabulary, not a re-implementation.
vi.mock('@pryzm/ai-host', async () => {
    const { resolveLightingBasis } = await vi.importActual<
        typeof import('../../../../../packages/ai-host/src/workflows/lightingLayout/lightingBasis.js')
    >('../../../../../packages/ai-host/src/workflows/lightingLayout/lightingBasis.js');
    return {
        lightRoom: () =>
            Array.from({ length: h.state.lightsPerRoom }, (_, i) => ({
                kind: 'downlight', origin: { x: i, y: 2.4, z: 0 },
            })),
        buildLightingCommands: (
            placed: unknown[], levelId: string, _mint: unknown, furnishOutcome?: unknown,
        ) => {
            const b = resolveLightingBasis(
                furnishOutcome as Parameters<typeof resolveLightingBasis>[0],
            );
            return {
                levelId,
                commands: (placed as unknown[]).map((_p, i) => ({
                    command: 'lighting.create', payload: { id: `lighting-${i}` },
                })),
                ids: (placed as unknown[]).map((_p, i) => `lighting-${i}`),
                totalElementCount: (placed as unknown[]).length,
                warnings: [] as string[],
                basis: b.basis,
                basisDisclosure: b.disclosure,
            };
        },
    };
});

vi.mock('../apartment-layout/activeLevel.js', () => ({
    resolveActiveLevel: () => ({ id: 'L1', elevation: 0, height: 2.7 }),
}));

import { LightingLayoutExecutor } from './LightingLayoutExecutor.js';

interface ExecutedPayload {
    placedCount?: number;
    roomCount?: number;
    basis?: 'furnished' | 'unfurnished';
    basisDisclosure?: string | null;
}
interface Toast { message: string; severity: string }

function makeRuntime() {
    const handlers = new Map<string, Set<(p: unknown) => void>>();
    const executed: ExecutedPayload[] = [];
    const toasts: Toast[] = [];
    const events = {
        on(k: string, fn: (p: unknown) => void): () => void {
            if (!handlers.has(k)) handlers.set(k, new Set());
            handlers.get(k)!.add(fn);
            return () => handlers.get(k)?.delete(fn);
        },
        emit(k: string, payload: unknown): void {
            if (k === 'lighting.layout-executed') executed.push(payload as ExecutedPayload);
            if (k === 'pryzm:toast') toasts.push(payload as Toast);
            for (const fn of [...(handlers.get(k) ?? [])]) fn(payload);
        },
    };
    const bus = { executeCommand: (_c: string, _p: unknown): unknown => undefined };
    const runtime = { events, bus } as unknown as Parameters<LightingLayoutExecutor['attach']>[0];
    return { runtime, events, executed, toasts };
}

const ROOMS = [
    { id: 'R1', levelId: 'L1', occupancyType: 'living-room', boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] } },
    { id: 'R2', levelId: 'L1', occupancyType: 'bedroom', boundary: { polygon: [{ x: 5, z: 0 }, { x: 9, z: 0 }, { x: 9, z: 3 }, { x: 5, z: 3 }] } },
];

describe('LightingLayoutExecutor — basis surfacing (§FURNISH-DROP-SURFACING editor half)', () => {
    beforeEach(() => {
        h.state.rooms = [...ROOMS];
        h.state.lightsPerRoom = 1;
        vi.spyOn(console, 'log').mockImplementation(() => { /* quiet */ });
        vi.spyOn(console, 'warn').mockImplementation(() => { /* quiet */ });
    });

    it('completed furnish → basis "furnished", null disclosure, SUCCESS toast (unchanged happy path)', () => {
        const { runtime, events, executed, toasts } = makeRuntime();
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);
        events.emit('lighting.layout-execute', {
            furnishOutcome: { state: 'completed', placedCount: 24, roomCount: 6 },
        });

        expect(executed.length).toBe(1);
        expect(executed[0]!.basis).toBe('furnished');
        expect(executed[0]!.basisDisclosure).toBe(null);
        const success = toasts.filter(t => t.severity === 'success');
        expect(success.length).toBe(1);
        expect(success[0]!.message).toMatch(/Lit 2\/2 rooms/);
        expect(toasts.some(t => t.severity === 'warn')).toBe(false);
        exec.detach();
    });

    it('DROPPED furnish → basis "unfurnished" on the payload AND the toast is a WARN carrying the disclosure', () => {
        const { runtime, events, executed, toasts } = makeRuntime();
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);
        events.emit('lighting.layout-execute', {
            furnishOutcome: {
                state: 'dropped',
                reason: 'no furnish.layout-executed within 12000 ms (§CHAIN-TIMEOUT fallback fired)',
            },
        });

        expect(executed.length).toBe(1);
        expect(executed[0]!.basis).toBe('unfurnished');
        expect(executed[0]!.basisDisclosure).toMatch(/§CHAIN-TIMEOUT|within 12000 ms/);
        // The user-visible half: WARN, names the unfurnished computation + reason.
        const warns = toasts.filter(t => t.severity === 'warn');
        expect(warns.length).toBe(1);
        expect(warns[0]!.message).toMatch(/Lit 2\/2 rooms/);
        expect(warns[0]!.message).toMatch(/WITHOUT furniture/i);
        expect(warns[0]!.message).toMatch(/§CHAIN-TIMEOUT|within 12000 ms/);
        // The old unconditional success toast must be GONE on this path.
        expect(toasts.some(t => t.severity === 'success')).toBe(false);
        exec.detach();
    });

    it('NO outcome on the payload (manual pryzmLightAllRooms) → unfurnished-with-reason, never a silent pass (C70 §2.2)', () => {
        const { runtime, events, executed, toasts } = makeRuntime();
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);
        events.emit('lighting.layout-execute', {});

        expect(executed.length).toBe(1);
        expect(executed[0]!.basis).toBe('unfurnished');
        expect(executed[0]!.basisDisclosure).toMatch(/unknown|no furnish/i);
        expect(toasts.some(t => t.severity === 'warn')).toBe(true);
        exec.detach();
    });

    it('furnished-but-ZERO-items → basis "furnished" with the zero disclosed on payload and toast (C75 §1.2)', () => {
        const { runtime, events, executed, toasts } = makeRuntime();
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);
        events.emit('lighting.layout-execute', {
            furnishOutcome: { state: 'completed', placedCount: 0, roomCount: 3 },
        });

        expect(executed.length).toBe(1);
        expect(executed[0]!.basis).toBe('furnished');
        expect(executed[0]!.basisDisclosure).toMatch(/0 item/);
        // Still a success (furnish ANSWERED zero) — but the zero travels with it.
        const success = toasts.filter(t => t.severity === 'success');
        expect(success.length).toBe(1);
        expect(success[0]!.message).toMatch(/0 item/);
        exec.detach();
    });

    it('zero-fixtures early path ALSO carries the basis stamp (no path renders unstamped)', () => {
        const { runtime, events, executed } = makeRuntime();
        h.state.lightsPerRoom = 0; // no room matches an archetype
        const exec = new LightingLayoutExecutor();
        exec.attach(runtime);
        events.emit('lighting.layout-execute', {
            furnishOutcome: { state: 'dropped', reason: 'furnish execute failed: boom' },
        });

        expect(executed.length).toBe(1);
        expect(executed[0]!.placedCount).toBe(0);
        expect(executed[0]!.basis).toBe('unfurnished');
        expect(executed[0]!.basisDisclosure).toMatch(/boom|furnish/i);
        exec.detach();
    });
});
