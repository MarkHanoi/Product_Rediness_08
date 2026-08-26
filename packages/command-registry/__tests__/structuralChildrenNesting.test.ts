/**
 * §GRAPH115 / ADR-0374 — structural children NEST, and undo/redo must walk the tree.
 *
 * THE DEFECT, MEASURED BEFORE THE FIX: `CommandManager.undo()` iterated
 * `entry.structuralChildren` one level deep and called `child.command.undo()`.
 * A STRUCTURAL_CASCADE dispatched from INSIDE another cascade's execute() —
 * a fixture following a wall that `CascadeWallBaselineCommand` moved, a finish
 * following that same neighbour — attaches to the INNER frame, so it sat at
 * depth 2 and was neither undone nor redone. Nothing printed. One Ctrl+Z left
 * the grandchild's write standing: C84 EI-7's write-set ⊋ restore-set
 * inequality, inside the mechanism built to close it.
 *
 * DIFFERENTIATING: against the pre-fix walker the depth-2 assertions below
 * FAIL (the grandchild's `undone` counter stays 0). The flat case is asserted
 * too so the recursion cannot regress the §L-874 order.
 */
import { describe, it, expect } from 'vitest';
import { WallStore } from '@pryzm/geometry-wall';
import { ProjectContext } from '@pryzm/core-app-model';
import { CommandManager } from '../src/CommandManagerImpl';
import type { Command, CommandContext, CommandResult } from '../src/types';

interface Probe { executed: number; undone: number; log: string[] }

/** A command that, during execute(), dispatches `spawn` as a STRUCTURAL_CASCADE through the SAME manager. */
function cascading(name: string, probe: Probe, cmRef: { current?: CommandManager }, spawn?: () => Command): Command {
    return {
        // A declared scope, not `[]`: an empty scope engages the manager's all-stores
        // snapshot fallback, which reads every store key — including absent ones.
        id: name, type: name as never, timestamp: 0, targetIds: [name], affectedStores: ['wall'],
        canExecute: () => ({ ok: true }),
        execute: (): CommandResult => {
            probe.executed++;
            probe.log.push(`exec:${name}`);
            // Real trackers are SILENT behind the revert latch (§L-943): a redo replays the
            // RECORDED children, it does not re-derive them. The fake obeys the same rule.
            if (spawn && !cmRef.current!.isReverting()) cmRef.current!.execute(spawn(), { source: 'STRUCTURAL_CASCADE' } as never);
            return { success: true, affectedElementIds: [name] };
        },
        undo: (): CommandResult => {
            probe.undone++;
            probe.log.push(`undo:${name}`);
            return { success: true, affectedElementIds: [name] };
        },
        serialize: () => ({ type: name as never, payload: {}, targetIds: [name], timestamp: 0, version: 1 }),
    } as unknown as Command;
}

function makeCm(): { cm: CommandManager; ref: { current?: CommandManager } } {
    // The manager's execute path reads the wall store (snapshot / target census), so
    // the harness carries the REAL one — the same shape every sibling test uses.
    const level = { id: 'L0', name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    const wallStore = new WallStore(
        new ProjectContext(),
        { getLevelById: (id: string) => (id === 'L0' ? { ...level } : undefined), getLevels: () => [{ ...level }] } as unknown as ConstructorParameters<typeof WallStore>[1],
    );
    const ctx = { stores: { wallStore }, bimManager: { getLevels: () => [level], getLevelById: () => level, registerElement: () => {}, unregisterElement: () => {} } } as unknown as CommandContext;
    const cm = new CommandManager(ctx);
    return { cm, ref: { current: cm } };
}

describe('§GRAPH115 — nested structural children are undone and redone with the gesture', () => {
    it('a depth-2 cascade (child of a child) is undone by ONE Ctrl+Z and replayed by ONE redo', () => {
        const { cm, ref } = makeCm();
        const gesture = { executed: 0, undone: 0, log: [] as string[] };
        const child = { executed: 0, undone: 0, log: [] as string[] };
        const grandchild = { executed: 0, undone: 0, log: [] as string[] };
        const shared: string[] = [];
        for (const p of [gesture, child, grandchild]) p.log = shared;

        const root = cascading('gesture', gesture, ref, () =>
            cascading('child', child, ref, () => cascading('grandchild', grandchild, ref)),
        );
        cm.execute(root);

        // One history entry — the two cascades composed into the gesture (§L-874).
        expect(cm.getHistory().length).toBe(1);
        expect(cm.getHistory()[0]!.structuralChildren?.length).toBe(1);
        expect(cm.getHistory()[0]!.structuralChildren![0]!.structuralChildren?.length).toBe(1);
        expect([gesture.executed, child.executed, grandchild.executed]).toEqual([1, 1, 1]);

        cm.undo();
        // THE DIFFERENTIATING LINE — pre-fix this read 0.
        expect(grandchild.undone).toBe(1);
        expect(child.undone).toBe(1);
        expect(gesture.undone).toBe(1);
        // §L-874 order at every depth: innermost first, then its parent, then the gesture.
        expect(shared.slice(3)).toEqual(['undo:grandchild', 'undo:child', 'undo:gesture']);

        cm.redo();
        expect([gesture.executed, child.executed, grandchild.executed]).toEqual([2, 2, 2]);
        // Redo replays outer → inner at every depth.
        expect(shared.slice(6)).toEqual(['exec:gesture', 'exec:child', 'exec:grandchild']);
        expect(cm.getHistory().length).toBe(1);
    });

    it('a flat entry (no nesting) takes exactly the path it always took', () => {
        const { cm, ref } = makeCm();
        const g = { executed: 0, undone: 0, log: [] as string[] };
        const c = { executed: 0, undone: 0, log: [] as string[] };
        c.log = g.log;
        cm.execute(cascading('g', g, ref, () => cascading('c', c, ref)));
        cm.undo();
        expect(g.log).toEqual(['exec:g', 'exec:c', 'undo:c', 'undo:g']);
        expect([g.undone, c.undone]).toEqual([1, 1]);
    });
});
