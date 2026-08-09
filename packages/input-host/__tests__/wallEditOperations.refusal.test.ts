// @vitest-environment happy-dom
/**
 * §FIX-JOIN-SECOND-PICK-TYPE / §FIX-MIRROR-STUCK-AFTER-FAILURE (L-813)
 *
 * Behavioural pins for the wall EDIT operations reachable from the
 * ContextualEditBar. Every case here encodes the standing repo principle
 * (§CONTEXT-DATA-HONESTY): **a refusal and a success must never be the same
 * observable.** A decline must state a reason; it must not be a silent no-op and
 * it must not be a throw.
 *
 * What each group pins, and the defect it would have caught:
 *
 *   SECOND-PICK TYPE FILTER — the guard used to read
 *       `if (pickedType && pickedType !== 'wall') reject`
 *   so an UNKNOWN type (null / '' — the picked root carried neither
 *   `userData.elementType` nor `userData.type`) fell THROUGH and was accepted as
 *   wall B. That is how the founder's production log shows JOIN_WALLS submitted
 *   against a FLOOR. The command then refused with WALL_B_NOT_FOUND, so nothing
 *   was corrupted — but the user saw only "nothing happened".
 *
 *   MIRROR AFTER A FAILED COMMAND — MirrorTool used to `return` without
 *   `_complete()`, leaving the tool ACTIVE while its canvas-click listener had
 *   already been auto-removed by the consume guard: a dead armed tool.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JoinTool } from '../src/operations/JoinTool.js';
import { CutTool } from '../src/operations/CutTool.js';
import { MirrorTool } from '../src/operations/MirrorTool.js';

type Detail = { worldPoint?: unknown; elementId?: string | null; elementType?: string | null };

/** Minimal CommandManager double — records what was submitted. */
function makeCmd(result: { success: boolean; info?: string[] }) {
    const executed: unknown[] = [];
    return {
        executed,
        manager: {
            execute: (cmd: unknown) => { executed.push(cmd); return { affectedElementIds: [], ...result }; },
        } as never,
    };
}

/** Fire a canvas world-click and let the deferred listener attach first. */
async function clickCanvas(detail: Detail): Promise<void> {
    await new Promise(r => setTimeout(r, 0));   // let §OP-LISTEN-DEFER attach
    window.dispatchEvent(new CustomEvent('bim-canvas-world-click', { detail }));
}

/** Capture every instruction message the tool renders. */
function captureInstructions(): { messages: (string | null)[]; dispose(): void } {
    const messages: (string | null)[] = [];
    const h = (e: Event) => { messages.push((e as CustomEvent).detail?.msg ?? null); };
    window.addEventListener('bim-operation-instructions', h);
    return { messages, dispose: () => window.removeEventListener('bim-operation-instructions', h) };
}

let instr: ReturnType<typeof captureInstructions>;
beforeEach(() => { instr = captureInstructions(); });
afterEach(() => { instr.dispose(); vi.restoreAllMocks(); });

describe('JoinTool — second pick must POSITIVELY be a wall (§FIX-JOIN-SECOND-PICK-TYPE)', () => {
    it('refuses a FLOOR as wall B, with a reason naming the type, and submits no command', async () => {
        const { executed, manager } = makeCmd({ success: true });
        const tool = new JoinTool(manager);
        tool.activate('wall_A', 'wall');

        await clickCanvas({ elementId: 'floor_1', elementType: 'floor', worldPoint: { x: 1, y: 0, z: 1 } });

        expect(executed).toHaveLength(0);
        const last = instr.messages.at(-1) ?? '';
        expect(last).toMatch(/wall/i);
        expect(last).toMatch(/floor/i);
    });

    it('refuses an UNKNOWN element type instead of accepting it — the log\'s floor-join path', async () => {
        // The hover-anchor pick dispatches elementType:null when the resolved root
        // carries neither userData.elementType nor userData.type. Before the fix this
        // fell through the `pickedType &&` guard and JOIN_WALLS was submitted.
        const { executed, manager } = makeCmd({ success: true });
        const tool = new JoinTool(manager);
        tool.activate('wall_A', 'wall');

        await clickCanvas({ elementId: 'f01202dc-969c', elementType: null, worldPoint: { x: 1, y: 0, z: 1 } });

        expect(executed).toHaveLength(0);
        expect(instr.messages.at(-1) ?? '').toMatch(/could not identify/i);
    });

    it('accepts a genuine second WALL and submits exactly one command', async () => {
        const { executed, manager } = makeCmd({ success: true });
        const tool = new JoinTool(manager);
        tool.activate('wall_A', 'wall');

        await clickCanvas({ elementId: 'wall_B', elementType: 'wall', worldPoint: { x: 1, y: 0, z: 1 } });

        expect(executed).toHaveLength(1);
    });

    it('reports a command REFUSAL to the user rather than failing silently', async () => {
        const errors: string[] = [];
        window.addEventListener('bim-operation-error', (e: Event) => {
            errors.push((e as CustomEvent).detail?.msg);
        });
        const { manager } = makeCmd({ success: false, info: ['Walls are parallel — no intersection exists'] });
        const tool = new JoinTool(manager);
        tool.activate('wall_A', 'wall');

        await clickCanvas({ elementId: 'wall_B', elementType: 'wall', worldPoint: { x: 1, y: 0, z: 1 } });

        expect(errors).toEqual(['Walls are parallel — no intersection exists']);
    });

    it('is case-insensitive about the picked type (Wall / WALL are walls)', async () => {
        const { executed, manager } = makeCmd({ success: true });
        const tool = new JoinTool(manager);
        tool.activate('wall_A', 'wall');

        await clickCanvas({ elementId: 'wall_B', elementType: 'Wall', worldPoint: { x: 1, y: 0, z: 1 } });

        expect(executed).toHaveLength(1);
    });
});

describe('CutTool — second pick must POSITIVELY be a wall', () => {
    it('refuses an unknown-type second pick and submits no CutWallCommand', async () => {
        const { executed, manager } = makeCmd({ success: true });
        const tool = new CutTool(manager);
        tool.activate('wall_A', 'wall');

        // step0 — mark the keep side (a click anywhere is legitimate here).
        await clickCanvas({ elementId: 'wall_A', elementType: 'wall', worldPoint: { x: 0, y: 0, z: 0 } });
        // step1 — the wall to cut against; type unknown.
        window.dispatchEvent(new CustomEvent('bim-canvas-world-click', {
            detail: { elementId: 'floor_1', elementType: null, worldPoint: { x: 2, y: 0, z: 2 } },
        }));

        expect(executed).toHaveLength(0);
        expect(instr.messages.at(-1) ?? '').toMatch(/could not identify/i);
    });

    it('refuses a named non-wall type and says which type it was', async () => {
        const { executed, manager } = makeCmd({ success: true });
        const tool = new CutTool(manager);
        tool.activate('wall_A', 'wall');

        await clickCanvas({ elementId: 'wall_A', elementType: 'wall', worldPoint: { x: 0, y: 0, z: 0 } });
        window.dispatchEvent(new CustomEvent('bim-canvas-world-click', {
            detail: { elementId: 'slab_1', elementType: 'slab', worldPoint: { x: 2, y: 0, z: 2 } },
        }));

        expect(executed).toHaveLength(0);
        expect(instr.messages.at(-1) ?? '').toMatch(/slab/i);
    });

    it('accepts a genuine second wall', async () => {
        const { executed, manager } = makeCmd({ success: true });
        const tool = new CutTool(manager);
        tool.activate('wall_A', 'wall');

        await clickCanvas({ elementId: 'wall_A', elementType: 'wall', worldPoint: { x: 0, y: 0, z: 0 } });
        window.dispatchEvent(new CustomEvent('bim-canvas-world-click', {
            detail: { elementId: 'wall_B', elementType: 'wall', worldPoint: { x: 2, y: 0, z: 2 } },
        }));

        expect(executed).toHaveLength(1);
    });
});

describe('MirrorTool — a failed command must not leave the tool armed-but-deaf', () => {
    it('completes (and reports) when MirrorElementCommand refuses', async () => {
        const errors: string[] = [];
        const completions: string[] = [];
        window.addEventListener('bim-operation-error', (e: Event) => {
            errors.push((e as CustomEvent).detail?.msg);
        });
        window.addEventListener('bim-operation-completed', (e: Event) => {
            completions.push((e as CustomEvent).detail?.operationId);
        });

        const { manager } = makeCmd({ success: false, info: ['Mirror axis is degenerate'] });
        const tool = new MirrorTool(manager);
        tool.activate('wall_A', 'wall');

        await clickCanvas({ worldPoint: { x: 0, y: 0, z: 0 } });                 // P1
        window.dispatchEvent(new CustomEvent('bim-canvas-world-click', {          // P2
            detail: { worldPoint: { x: 5, y: 0, z: 0 } },
        }));

        expect(errors).toEqual(['Mirror axis is degenerate']);
        // The tool must have torn itself down — before the fix it stayed active with
        // no listener, so the Mirror button stayed lit and no click did anything.
        expect(completions).toContain('mirror');
    });
});
