/**
 * §LEVEL-HEIGHT-INPUT-REACHES-THE-COMMAND — L-11045 (lane LEVELHEIGHT61).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * The founder's report — *"why the level 4 height changes is not recognise and
 * goes to 3 meters?"* — had four plausible causes, and the LEAD hypothesis in the
 * lane brief was the first one:
 *
 *   *"The panel is not calling `SetLevelHeightCommand` at all for this edit — or
 *    is calling it and then ALSO calling `UpdateLevelCommand({height})`, which
 *    writes without dispatching."*
 *
 * ⭐ **That hypothesis is FALSE, and this file is the measurement that says so.**
 * The panel dispatches exactly one command, of the right type, with the typed
 * number — and it always did. The real defects were downstream (L-11040: the plan
 * far plane was a literal 3.0; L-11041: nothing dirtied the view).
 *
 * But *"the join is fine"* is worth exactly as much as its evidence, and the join
 * between a control and its handler is the part this repo breaks most often
 * ([[authored-but-unwired-is-the-bottleneck]], and the third arm of
 * `facadePanelReachability.spec.ts`). So it is pinned here rather than concluded
 * from a reading, and pinned at the layer the founder touches: a REAL
 * `LevelManagerPanel`, a REAL `<input>`, a REAL `blur` event.
 *
 * ⚠ WHAT THIS DOES NOT ASSERT. It does not run the command — the command manager
 * is a recorder. `setLevelHeightCascade.test.ts` owns the command's behaviour
 * (21/21) and `levelDatumDirtiesItsViews.test.ts` owns its view invalidation.
 * This file owns ONE question: does the number the founder types arrive?
 *
 * Governance: C03 §2.1 (one mutation path) · ADR-0345 · L-7201 (height became an
 * input) · C84 §EI-PROP.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SetLevelHeightCommand, UpdateLevelCommand } from '@pryzm/command-registry';
import { LevelManagerPanel } from '../levels/LevelManagerPanel';

interface StubLevel {
    id: string;
    name: string;
    elevation: number;
    height: number;
    isVisible: boolean;
    order: number;
    color?: string;
    childrenIds: string[];
}

function lvl(id: string, name: string, elevation: number, height: number): StubLevel {
    return { id, name, elevation, height, isVisible: true, order: elevation, childrenIds: [] };
}

/** The founder's stack: Ground 0.000 at 3.0 m, Level 1 at 3.000. */
function founderStack(): StubLevel[] {
    return [lvl('L0', 'Ground', 0, 3.0), lvl('L1', 'Level 1', 3.0, 3.0)];
}

function mountPanel(levels: StubLevel[]) {
    const byId = new Map(levels.map((l) => [l.id, { ...l }]));
    const subscribers: Array<(t: string) => void> = [];

    const bimManager = {
        getLevels: () => Array.from(byId.values()),
        getLevelById: (id: string) => byId.get(id),
        updateLevel: (id: string, updates: Partial<StubLevel>) => {
            const cur = byId.get(id);
            if (!cur) return;
            byId.set(id, { ...cur, ...updates });
            subscribers.forEach((cb) => cb('levelUpdated'));
        },
        subscribe: (cb: (t: string) => void) => { subscribers.push(cb); return () => { /* noop */ }; },
    };

    /** Records what was dispatched; executes nothing. */
    const dispatched: any[] = [];
    const commandManager = {
        execute: (cmd: any) => { dispatched.push(cmd); return { success: true, affectedElementIds: [], info: [] }; },
    };

    const mountTarget = document.createElement('div');
    document.body.appendChild(mountTarget);

    const panel = new LevelManagerPanel({
        bimManager: bimManager as any,
        projectContext: { activeLevelId: 'L0', subscribe: () => () => { /* noop */ } } as any,
        getCommandManager: () => commandManager,
        mountTarget,
    });

    return { panel, mountTarget, dispatched, byId };
}

/** The height cell of the row whose name input carries `name`. */
function heightInputFor(mountTarget: HTMLElement, name: string): HTMLInputElement {
    const rows = Array.from(mountTarget.querySelectorAll('.lm-row'));
    for (const row of rows) {
        const nameInput = row.querySelector('.lm-name-input') as HTMLInputElement | null;
        if (nameInput?.value === name) {
            const h = row.querySelector('.lm-height-input') as HTMLInputElement | null;
            if (h) return h;
        }
    }
    throw new Error(`no height input for level "${name}" — rows: ${rows.length}`);
}

function elevInputFor(mountTarget: HTMLElement, name: string): HTMLInputElement {
    const rows = Array.from(mountTarget.querySelectorAll('.lm-row'));
    for (const row of rows) {
        const nameInput = row.querySelector('.lm-name-input') as HTMLInputElement | null;
        if (nameInput?.value === name) {
            const e = row.querySelector('.lm-elev-input') as HTMLInputElement | null;
            if (e) return e;
        }
    }
    throw new Error(`no elevation input for level "${name}"`);
}

let mounted: ReturnType<typeof mountPanel> | null = null;
beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { mounted?.panel.dispose(); mounted = null; document.body.innerHTML = ''; });

// ─────────────────────────────────────────────────────────────────────────────

describe('L-11045 — the Levels & Grids height input reaches SetLevelHeightCommand', () => {
    it("THE FOUNDER'S GESTURE — typing 4 into Ground's height dispatches exactly one SET_LEVEL_HEIGHT", () => {
        mounted = mountPanel(founderStack());
        const input = heightInputFor(mounted.mountTarget, 'Ground');

        // The row renders the CURRENT datum, so the founder sees 3.00 before he types.
        expect(input.value).toBe('3.00');

        input.value = '4';
        input.dispatchEvent(new Event('blur'));

        // ⭐ ONE command, the right class, the right payload. Falsifies the brief's
        // lead hypothesis in both directions: not zero commands, and not two.
        expect(mounted.dispatched.length).toBe(1);
        const cmd = mounted.dispatched[0];
        expect(cmd).toBeInstanceOf(SetLevelHeightCommand);
        expect(cmd).not.toBeInstanceOf(UpdateLevelCommand);
        expect(cmd.serialize().payload).toEqual({ levelId: 'L0', height: 4 });
    });

    it('the height and elevation cells dispatch DIFFERENT commands — they were split at L-7201 and are still split', () => {
        mounted = mountPanel(founderStack());

        heightInputFor(mounted.mountTarget, 'Ground').value = '4';
        heightInputFor(mounted.mountTarget, 'Ground').dispatchEvent(new Event('blur'));
        elevInputFor(mounted.mountTarget, 'Level 1').value = '4.5';
        elevInputFor(mounted.mountTarget, 'Level 1').dispatchEvent(new Event('blur'));

        expect(mounted.dispatched.map((c) => c.constructor.name))
            .toEqual(['SetLevelHeightCommand', 'UpdateLevelCommand']);
        // Editing HEIGHT must never write an elevation, and vice versa — merging the
        // two cells is the defect ADR-0345 exists to prevent.
        expect(mounted.dispatched[0].serialize().payload).toEqual({ levelId: 'L0', height: 4 });
        expect(mounted.dispatched[1].serialize().payload.updates).toEqual({ elevation: 4.5 });
    });

    it('a blur that changed NOTHING dispatches nothing — no empty undo entry to Ctrl+Z through', () => {
        mounted = mountPanel(founderStack());
        const input = heightInputFor(mounted.mountTarget, 'Ground');

        input.dispatchEvent(new Event('blur'));                 // untouched
        input.value = '3.00'; input.dispatchEvent(new Event('blur'));   // same number, retyped

        expect(mounted.dispatched.length).toBe(0);
    });

    it('a non-numeric entry dispatches nothing and the cell snaps back to the datum', () => {
        mounted = mountPanel(founderStack());
        const input = heightInputFor(mounted.mountTarget, 'Ground');

        input.value = 'four';
        input.dispatchEvent(new Event('blur'));

        expect(mounted.dispatched.length).toBe(0);
        expect(input.value).toBe('3.00');
    });

    it('a REFUSED edit snaps the cell back — the row must never show a number the model did not accept', () => {
        mounted = mountPanel(founderStack());
        // Re-point the recorder at a refusing manager for this one gesture.
        const refusing = { execute: () => ({ success: false, affectedElementIds: [], error: 'nope' }) };
        (mounted.panel as unknown as { props: { getCommandManager: () => unknown } })
            .props.getCommandManager = () => refusing;

        const input = heightInputFor(mounted.mountTarget, 'Ground');
        input.value = '4';
        input.dispatchEvent(new Event('blur'));

        expect(input.value).toBe('3.00');
    });

    it('every level row carries its own height cell, showing its own datum', () => {
        mounted = mountPanel([lvl('L0', 'Ground', 0, 4.0), lvl('L1', 'Level 1', 4.0, 2.5)]);
        expect(heightInputFor(mounted.mountTarget, 'Ground').value).toBe('4.00');
        expect(heightInputFor(mounted.mountTarget, 'Level 1').value).toBe('2.50');
    });
});
