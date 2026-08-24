/**
 * @file apps/editor/src/ui/property-panel/__tests__/StairSecondRunWidget.spec.ts
 *
 * §STAIR-SECOND-RUN-DIRECTION (L-10270) — the founder's "modify, afterwards, via
 * the UI properties panel, the DIRECTION OF THE SECOND RUN", proved AT THE CONTROL.
 *
 * ⛔ REACHABILITY, NOT EXISTENCE. That `turnDirection` / `secondRunSide` are on the
 * record, read by the geometry and registered as rebuild params was TRUE for a long
 * time and reached nobody — the DEFINITION PROPERTIES sheet in the founder's
 * screenshot has no turn control on it at all. The pure derivation and mirror are
 * pinned by `packages/geometry-stair/src/__tests__/StairSecondRunDirection.spec.ts`.
 * This suite builds the REAL widget, clicks the REAL buttons, and asserts the BUS
 * VERB and PAYLOAD that leave it (§COMMITTED-IS-NOT-REACHABLE).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildStairSecondRunSection } from '../StairSecondRunWidget';

interface Dispatch { type: string; payload: Record<string, unknown> }

const PROPS = {
    riserVisible: true, nosingType: 'standard', nosingDepth: 0.025,
    stringerType: 'none', handrailLeft: true, handrailRight: true, handrailHeight: 1.05,
};

function stairRecord(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'stair-1', type: 'stair', levelId: 'L0', baseLevelId: 'L0', topLevelId: 'L1',
        baseOffset: 0, topOffset: 0, shape: 'L',
        startPosition: { x: 0, y: 0, z: 0 },
        width: 1.2, riserHeight: 0.175, treadDepth: 0.28, riserCount: 17,
        turnDirection: 'left',
        flights: [
            { direction: { x: 0, y: 0, z: 1 }, riserCount: 9 },
            { direction: { x: -1, y: 0, z: 0 }, riserCount: 8 },   // cross > 0 ⇒ LEFT
        ],
        landings: [{ depth: 1.2 }],
        properties: PROPS, parameters: {},
        metadata: { createdAt: 'x', modifiedAt: 'x', version: 0, source: 'user' },
        ...over,
    };
}

function install(stair: Record<string, unknown> | null, opts: { commit?: boolean } = {}):
    { dispatches: Dispatch[] } {
    const dispatches: Dispatch[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.stairStore = {
        getById: (id: string) => (stair && stair.id === id ? stair : undefined),
        get:     (id: string) => (stair && stair.id === id ? stair : undefined),
    };
    w.runtime = {
        bus: {
            executeCommand: (type: string, payload: Record<string, unknown>) => {
                dispatches.push({ type, payload });
                // The handler swallows the CommandResult, so a RESOLVED promise is
                // not evidence of a change. `commit: false` models a REFUSAL that
                // still resolves — the case the widget must not report as success.
                if (opts.commit && stair) {
                    const updates = payload.updates as Record<string, string>;
                    const want = updates.turnDirection ?? updates.secondRunSide;
                    // Mirror run 2 the way UpdateStairParametersCommand does.
                    const fl = (stair.flights as Array<Record<string, unknown>>);
                    fl[1] = { ...fl[1], direction: want === 'right' ? { x: 1, y: 0, z: 0 } : { x: -1, y: 0, z: 0 } };
                    if (updates.turnDirection) stair.turnDirection = want;
                    if (updates.secondRunSide) stair.secondRunSide = want;
                }
                return Promise.resolve();
            },
        },
    };
    return { dispatches };
}

const el = (root: HTMLElement, id: string): HTMLElement | null =>
    root.querySelector(`[data-testid="${id}"]`);

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.stairStore; delete w.runtime;
});

describe('the control appears ONLY where a second run exists', () => {
    it('⛔ renders NOTHING for a straight stair — no control, no placeholder', () => {
        install(stairRecord({ shape: 'I', flights: [{ direction: { x: 0, y: 0, z: 1 }, riserCount: 17 }], landings: [] }));
        expect(buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })).toBeNull();
    });

    it('renders nothing for a non-stair element', () => {
        install(stairRecord());
        expect(buildStairSecondRunSection({ id: 'w-1', type: 'wall' })).toBeNull();
    });

    it('renders the control for an L stair, and for a U stair', () => {
        install(stairRecord());
        const l = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        expect(l).not.toBeNull();
        expect(el(l, 'stair-second-run-left')).not.toBeNull();
        expect(el(l, 'stair-second-run-right')).not.toBeNull();
        expect(l.textContent).toContain('Second Run Turn');

        install(stairRecord({
            shape: 'U', secondRunSide: 'left', turnDirection: undefined,
            flights: [
                { direction: { x: 0, y: 0, z: 1 }, riserCount: 9 },
                { direction: { x: 0, y: 0, z: -1 }, riserCount: 8, startOverride: { x: -1.2, y: 0, z: 3 } },
            ],
        }));
        const u = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        expect(u.textContent).toContain('Second Run Side');
        expect(el(u, 'stair-second-run-right')).not.toBeNull();
    });

    it('⭐ an L-SHAPED but un-turnable stair gets the engine’s OWN reason, not silence', () => {
        // A curved stair persists as shape 'L' with many arc runs.
        install(stairRecord({
            flights: Array.from({ length: 5 }, (_, i) => ({
                direction: { x: Math.sin(i * 0.2), y: 0, z: Math.cos(i * 0.2) }, riserCount: 3,
            })),
        }));
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        expect(root).not.toBeNull();
        expect(el(root, 'stair-second-run-left')).toBeNull();      // no buttons offered
        expect(root.textContent).toContain('5 runs');
        expect(root.textContent).toMatch(/not decided yet|withheld rather than guessing/i);
    });
});

describe('what it DISPLAYS is the geometry, not the stamped flag', () => {
    it('⭐ selects RIGHT on a stair stamped "left" that is BUILT turning right, and says so', () => {
        // The StairPlanToolHandler:209 drift, at the control.
        install(stairRecord({ turnDirection: 'left', flights: [
            { direction: { x: 0, y: 0, z: 1 }, riserCount: 9 },
            { direction: { x: 1, y: 0, z: 0 }, riserCount: 8 },   // cross < 0 ⇒ RIGHT
        ] }));
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        expect(el(root, 'stair-second-run-right')!.getAttribute('data-selected')).toBe('true');
        expect(el(root, 'stair-second-run-left')!.getAttribute('data-selected')).toBe('false');
        expect(root.textContent).toContain('BUILT turning right');
    });

    it('⛔ says the side cannot be read rather than defaulting to Left', () => {
        install(stairRecord({
            shape: 'U', secondRunSide: 'left', turnDirection: undefined,
            flights: [
                { direction: { x: 0, y: 0, z: 1 }, riserCount: 9 },
                { direction: { x: 0, y: 0, z: -1 }, riserCount: 8 },   // no startOverride
            ],
        }));
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        expect(root.textContent).toContain('cannot be read');
        expect(el(root, 'stair-second-run-left')!.getAttribute('data-selected')).toBe('false');
        expect(el(root, 'stair-second-run-right')!.getAttribute('data-selected')).toBe('false');
    });

    it('states the undecided axis — no clearance check — rather than implying one', () => {
        install(stairRecord());
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        expect(root.textContent).toContain('The first run does not move');
        expect(root.textContent).toContain('no clearance check');
    });
});

describe('⭐ the dispatch — the STAIR verb, the OWNING field, and a real read-back', () => {
    it('dispatches stair.updateParameters with turnDirection for an L', async () => {
        const { dispatches } = install(stairRecord(), { commit: true });
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        (el(root, 'stair-second-run-right') as HTMLButtonElement).click();
        await Promise.resolve(); await Promise.resolve();

        expect(dispatches).toHaveLength(1);
        // ⛔ NOT `element.updateParameters` — the generic route writes the raw flag
        // and is a dead control on a path-authored stair.
        expect(dispatches[0].type).toBe('stair.updateParameters');
        expect(dispatches[0].payload).toEqual({ stairId: 'stair-1', updates: { turnDirection: 'right' } });
    });

    it('dispatches secondRunSide for a U — never turnDirection', async () => {
        const { dispatches } = install(stairRecord({
            shape: 'U', secondRunSide: 'left', turnDirection: undefined,
            flights: [
                { direction: { x: 0, y: 0, z: 1 }, riserCount: 9 },
                { direction: { x: 0, y: 0, z: -1 }, riserCount: 8, startOverride: { x: -1.2, y: 0, z: 3 } },
            ],
        }), { commit: true });
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        (el(root, 'stair-second-run-right') as HTMLButtonElement).click();
        await Promise.resolve(); await Promise.resolve();
        expect(dispatches[0].payload.updates).toEqual({ secondRunSide: 'right' });
    });

    it('does not dispatch when the stair already faces that way', async () => {
        const { dispatches } = install(stairRecord());
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        (el(root, 'stair-second-run-left') as HTMLButtonElement).click();
        await Promise.resolve();
        expect(dispatches).toHaveLength(0);
    });

    it('⭐⭐ a RESOLVED promise that changed nothing is reported as a FAILURE (C16 CA-21)', async () => {
        // The handler returns {forward:[],inverse:[]} and swallows the CommandResult,
        // so resolution is not evidence. `commit: false` leaves the store untouched.
        const { dispatches } = install(stairRecord(), { commit: false });
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        (el(root, 'stair-second-run-right') as HTMLButtonElement).click();
        await Promise.resolve(); await Promise.resolve();

        expect(dispatches).toHaveLength(1);                       // it WAS dispatched
        const verdict = el(root, 'stair-second-run-verdict')!;
        expect(verdict.textContent).toContain('was not turned');  // and it did NOT lie about the outcome
        expect(verdict.textContent).toContain('still goes left');
    });

    it('clears the verdict and moves the selection when the store really changed', async () => {
        install(stairRecord(), { commit: true });
        const root = buildStairSecondRunSection({ id: 'stair-1', type: 'stair' })!;
        (el(root, 'stair-second-run-right') as HTMLButtonElement).click();
        await Promise.resolve(); await Promise.resolve();

        expect(el(root, 'stair-second-run-verdict')!.textContent).toBe('');
        expect(el(root, 'stair-second-run-right')!.getAttribute('data-selected')).toBe('true');
        expect(el(root, 'stair-second-run-left')!.getAttribute('data-selected')).toBe('false');
    });
});
