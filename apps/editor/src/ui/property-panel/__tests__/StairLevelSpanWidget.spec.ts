/**
 * @file apps/editor/src/ui/property-panel/__tests__/StairLevelSpanWidget.spec.ts
 *
 * §STAIR-LEVEL-SPAN-CHANGE (L-1533) — the founder's item 0.2, "be able to change
 * stair Base level + top level", proved AT THE CONTROL.
 *
 * ⛔ REACHABILITY, NOT EXISTENCE. `UpdateStairParametersCommand` accepting a
 * `baseLevelId` / `topLevelId` is pinned by
 * `packages/command-registry/__tests__/stairLevelSpanChange.test.ts`. That proves
 * the command works; it proves NOTHING about whether the founder can reach it.
 * A command that exists but is not reachable from the UI is not shipped
 * (§COMMITTED-IS-NOT-REACHABLE). So this suite builds the real widget, reads the
 * real `<select>` elements, clicks the real button, and asserts the BUS VERB and
 * PAYLOAD that leave it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildStairLevelSpanSection } from '../StairLevelSpanWidget';

const LEVELS = [
    { id: 'L0', name: 'Ground',  elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6 },
];

interface Dispatch { type: string; payload: Record<string, unknown> }

function installGlobals(opts: {
    levels?: typeof LEVELS;
    stair?: Record<string, unknown> | null;
    /** When set, drives the pre-flight verdict the widget reads from the command. */
    withCommandContext?: boolean;
} = {}): { dispatches: Dispatch[]; stair: Record<string, unknown> } {
    const levels = opts.levels ?? LEVELS;
    const stair = opts.stair === null
        ? null
        : (opts.stair ?? {
            id: 'stair-1', type: 'stair', levelId: 'L0',
            baseLevelId: 'L0', topLevelId: 'L1',
            shape: 'I', riserHeight: 0.15, treadDepth: 0.28, width: 1.0, riserCount: 20,
            flights: [
                { direction: { x: 1, y: 0, z: 0 }, riserCount: 10 },
                { direction: { x: 1, y: 0, z: 0 }, riserCount: 10 },
            ],
            landings: [], startPosition: { x: 0, y: 0, z: 0 },
            accessibilityType: 'standard', properties: {}, parameters: {},
        });

    const w = window as unknown as Record<string, unknown>;
    w.wallStore = { getLevels: () => levels };
    w.stairStore = {
        getById: (id: string) => (stair && stair.id === id ? stair : undefined),
        get:     (id: string) => (stair && stair.id === id ? stair : undefined),
        update:  (id: string, patch: Record<string, unknown>) => {
            if (stair && stair.id === id) Object.assign(stair, patch);
        },
        restoreSnapshot: () => {},
        getStairConnectingLevels: () => undefined,
        getAll: () => (stair ? [stair] : []),
        add: () => {}, remove: () => {},
    };
    if (opts.withCommandContext !== false) {
        w.commandContext = {
            stores: {
                stairStore: w.stairStore,
                wallStore: w.wallStore,
                // §L-1437 — the widget threads this into the command's own canExecute.
                stairTypeStore: undefined,
                openingStore: undefined,
                slabStore: undefined,
            },
            bimManager: { registerElement: () => {}, unregisterElement: () => {} },
            projectContext: { activeLevelId: 'L0' },
        };
    }

    const dispatches: Dispatch[] = [];
    w.runtime = {
        bus: {
            executeCommand: (type: string, payload: Record<string, unknown>) => {
                dispatches.push({ type, payload });
                return Promise.resolve();
            },
        },
    };
    return { dispatches, stair: stair as Record<string, unknown> };
}

const stairEl = (over: Record<string, unknown> = {}) => ({
    id: 'stair-1', elementType: 'stair', baseLevelId: 'L0', topLevelId: 'L1', ...over,
});

const sel = (root: HTMLElement, testid: string) =>
    root.querySelector(`[data-testid="${testid}"]`);

afterEach(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.wallStore; delete w.stairStore; delete w.commandContext; delete w.runtime;
});

describe('§STAIR-LEVEL-SPAN-CHANGE — the control exists and is a PICKER', () => {
    beforeEach(() => { installGlobals(); });

    it('renders Base and Top as <select>s over the REAL level table', () => {
        const root = buildStairLevelSpanSection(stairEl())!;
        expect(root, 'no level-span section was built for a stair').toBeTruthy();

        const base = sel(root, 'stair-base-level') as HTMLSelectElement;
        const top  = sel(root, 'stair-top-level')  as HTMLSelectElement;
        expect(base.tagName, 'Base level is not a picker').toBe('SELECT');
        expect(top.tagName,  'Top level is not a picker').toBe('SELECT');

        // Driven by the level table, not free text — an id that names no level
        // cannot be offered (the §FIX-STAIR-TYPEID-TWO-CONTROLS defect).
        expect([...base.options].map(o => o.value)).toEqual(['L0', 'L1', 'L2']);
        expect([...top.options].map(o => o.value)).toEqual(['L0', 'L1', 'L2']);
        // Labels carry the elevation, because "Level 1" alone does not tell an
        // architect how far the stair will have to climb.
        expect(base.options[1]!.textContent).toContain('3.00 m');
    });

    it('preselects the stair’s CURRENT span, read from the live store', () => {
        const root = buildStairLevelSpanSection(stairEl())!;
        expect((sel(root, 'stair-base-level') as HTMLSelectElement).value).toBe('L0');
        expect((sel(root, 'stair-top-level')  as HTMLSelectElement).value).toBe('L1');
    });

    it('returns null for every other element family', () => {
        expect(buildStairLevelSpanSection({ id: 'w1', elementType: 'wall' })).toBeNull();
        expect(buildStairLevelSpanSection({ id: 'd1', elementType: 'door' })).toBeNull();
    });

    it('a one-level project gets an honest sentence, not an empty control', () => {
        installGlobals({ levels: [LEVELS[0]!] });
        const root = buildStairLevelSpanSection(stairEl())!;
        expect(sel(root, 'stair-base-level'), 'offered a picker that can only refuse').toBeNull();
        expect(root.textContent).toMatch(/needs a level above its base/i);
    });
});

describe('§STAIR-LEVEL-SPAN-CHANGE — Apply dispatches the STAIR command, not the generic one', () => {
    it('⭐ clicking Apply dispatches `stair.updateParameters` with both level ids', () => {
        const { dispatches } = installGlobals();
        const root = buildStairLevelSpanSection(stairEl())!;
        const top = sel(root, 'stair-top-level') as HTMLSelectElement;
        top.value = 'L2';
        top.dispatchEvent(new Event('change'));
        (sel(root, 'stair-level-span-apply') as HTMLButtonElement).click();

        expect(dispatches.length, 'Apply dispatched nothing — the control is dead').toBe(1);
        // ⛔ NOT 'element.updateParameters'. The generic route writes the raw field
        // and consults no stair rule, leaving riserHeight x riserCount at the OLD
        // rise — a stair that fails its own validator.
        expect(dispatches[0]!.type).toBe('stair.updateParameters');
        expect(dispatches[0]!.payload).toEqual({
            stairId: 'stair-1',
            updates: { baseLevelId: 'L0', topLevelId: 'L2' },
        });
    });

    it('a Base level change dispatches too', () => {
        const { dispatches } = installGlobals();
        const root = buildStairLevelSpanSection(stairEl())!;
        const base = sel(root, 'stair-base-level') as HTMLSelectElement;
        const top  = sel(root, 'stair-top-level')  as HTMLSelectElement;
        base.value = 'L1'; base.dispatchEvent(new Event('change'));
        top.value  = 'L2'; top.dispatchEvent(new Event('change'));
        (sel(root, 'stair-level-span-apply') as HTMLButtonElement).click();
        expect(dispatches[0]!.payload.updates).toEqual({ baseLevelId: 'L1', topLevelId: 'L2' });
    });
});

describe('§STAIR-LEVEL-SPAN-CHANGE — the panel reports the COMMAND’s refusal, and never invents one', () => {
    it('⭐ base === top is greyed out with the command’s own sentence', () => {
        installGlobals();
        const root = buildStairLevelSpanSection(stairEl())!;
        const top = sel(root, 'stair-top-level') as HTMLSelectElement;
        top.value = 'L0';                       // same as base
        top.dispatchEvent(new Event('change'));

        const apply = sel(root, 'stair-level-span-apply') as HTMLButtonElement;
        expect(apply.disabled, 'an unbuildable span was still offered').toBe(true);
        expect(sel(root, 'stair-level-span-verdict')!.textContent)
            .toMatch(/different levels/i);
    });

    it('⭐ a top level BELOW the base is refused NAMING BOTH ELEVATIONS', () => {
        installGlobals({
            stair: {
                id: 'stair-1', type: 'stair', levelId: 'L0',
                baseLevelId: 'L0', topLevelId: 'L2',
                shape: 'I', riserHeight: 0.15, treadDepth: 0.28, width: 1.0, riserCount: 40,
                flights: [
                    { direction: { x: 1, y: 0, z: 0 }, riserCount: 20 },
                    { direction: { x: 1, y: 0, z: 0 }, riserCount: 20 },
                ],
                landings: [], startPosition: { x: 0, y: 0, z: 0 },
                accessibilityType: 'standard', properties: {}, parameters: {},
            },
        });
        const root = buildStairLevelSpanSection(stairEl({ topLevelId: 'L2' }))!;
        const base = sel(root, 'stair-base-level') as HTMLSelectElement;
        base.value = 'L2';                      // base at 6 m, top at 6 m -> same level
        base.dispatchEvent(new Event('change'));
        const verdict = sel(root, 'stair-level-span-verdict')!.textContent ?? '';
        expect((sel(root, 'stair-level-span-apply') as HTMLButtonElement).disabled).toBe(true);
        expect(verdict.length, 'refused with no reason').toBeGreaterThan(0);
    });

    it('a VALID span leaves Apply enabled with no scare text', () => {
        installGlobals();
        const root = buildStairLevelSpanSection(stairEl())!;
        const top = sel(root, 'stair-top-level') as HTMLSelectElement;
        top.value = 'L2';
        top.dispatchEvent(new Event('change'));
        expect((sel(root, 'stair-level-span-apply') as HTMLButtonElement).disabled).toBe(false);
        expect(sel(root, 'stair-level-span-verdict')!.textContent).toBe('');
    });

    it('⭐ with NO live CommandContext the panel does NOT pre-refuse (§L-1437)', () => {
        // Two of five built-in stair types are LOOSER than STAIR_CONSTRAINTS. A panel
        // that fell back to a local, type-blind check would refuse spans the model
        // permits — a false refusal in the voice of a validator, which this repo
        // records as worse than no check at all. Absence of an opinion must read as
        // "ask the command", never as "no".
        installGlobals({ withCommandContext: false });
        delete (window as unknown as Record<string, unknown>).commandContext;
        const root = buildStairLevelSpanSection(stairEl())!;
        const top = sel(root, 'stair-top-level') as HTMLSelectElement;
        top.value = 'L0';                       // would be refused if it COULD ask
        top.dispatchEvent(new Event('change'));
        expect(
            (sel(root, 'stair-level-span-apply') as HTMLButtonElement).disabled,
            'the panel invented a refusal it had no authority to make',
        ).toBe(false);
    });
});

describe('§STAIR-LEVEL-SPAN-CHANGE — the outcome is READ BACK, not assumed', () => {
    it('⭐ a resolved dispatch that did NOT change the stair is reported as a failure', async () => {
        // `UpdateStairParametersHandler.execute` swallows the CommandResult and
        // returns {forward:[],inverse:[]}, so the bus promise RESOLVES even when the
        // command refused. A resolved promise is therefore not evidence of anything.
        const { dispatches } = installGlobals();      // the fake bus never mutates the store
        const root = buildStairLevelSpanSection(stairEl())!;
        const top = sel(root, 'stair-top-level') as HTMLSelectElement;
        top.value = 'L2';
        top.dispatchEvent(new Event('change'));
        (sel(root, 'stair-level-span-apply') as HTMLButtonElement).click();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

        expect(dispatches.length).toBe(1);
        const verdict = sel(root, 'stair-level-span-verdict')!.textContent ?? '';
        expect(verdict, 'a refusal and a success rendered identically').toMatch(/not changed/i);
        expect((sel(root, 'stair-level-span-apply') as HTMLButtonElement).textContent).toBe('Apply');
    });

    it('a dispatch that DID change the stair reports success', async () => {
        const { stair } = installGlobals();
        const w = window as unknown as Record<string, unknown>;
        (w.runtime as { bus: { executeCommand: unknown } }).bus.executeCommand =
            (_t: string, p: { updates: Record<string, string> }) => {
                Object.assign(stair, p.updates);   // stand in for the real command
                return Promise.resolve();
            };
        const root = buildStairLevelSpanSection(stairEl())!;
        const top = sel(root, 'stair-top-level') as HTMLSelectElement;
        top.value = 'L2';
        top.dispatchEvent(new Event('change'));
        (sel(root, 'stair-level-span-apply') as HTMLButtonElement).click();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

        expect(sel(root, 'stair-level-span-verdict')!.textContent).toBe('');
        expect((sel(root, 'stair-level-span-apply') as HTMLButtonElement).textContent).toContain('Applied');
    });
});
