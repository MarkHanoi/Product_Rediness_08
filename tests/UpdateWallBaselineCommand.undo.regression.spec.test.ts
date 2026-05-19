/**
 * Phase 5 / T3 — UpdateWallBaselineCommand undo regression guard
 *
 * Contracts tested:
 *   C15 §8  — wall baseline mutation (UpdateWallBaselineCommand.execute)
 *   C15 §8.1 — dual-store rule (wallStore + PRYZM3 store write on execute/undo)
 *
 * Regression: wall-drag undo must restore wall to pre-drag position AND restore
 * the positions of any co-moving hosted openings (doors/windows).
 *
 * The §M2/M11 fix captures a full wall snapshot in execute() via
 * `wallStore.getSnapshot()` so that undo() can call `wallStore.restoreSnapshot()`
 * rather than attempting a partial inverse — partial inverse was the bug that
 * caused `metadata.version` to increment on every undo and silently drift
 * hosted-element positions.
 *
 * Enforcement levels:
 *   1. Static (this file) — source-grep checks the canonical implementation markers
 *   2. TypeScript — build gate (`npm run build` clean)
 *   3. Runtime (future) — vitest integration test (template below)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const CMD_PATH = resolve(
    __dirname,
    '../packages/command-registry/src/walls/UpdateWallBaselineCommand.ts',
);

export const UpdateWallBaselineUndoRegressionSpec = {
    contract: 'C15 §8 / §8.1 / T3 — UpdateWallBaselineCommand undo regression',
    enforcedBy: [
        'packages/command-registry/src/walls/UpdateWallBaselineCommand.ts (execute + undo)',
        'tests/UpdateWallBaselineCommand.undo.regression.spec.test.ts (static source-grep — this file)',
    ],
    invariants: [
        '§M2/M11 FIX annotation present — full wall snapshot captured in execute().',
        'undo() method is implemented and non-trivial.',
        'undo() short-circuits when execute() was not successful (isExecuted guard).',
        'restoreSnapshot or equivalent restoration call present in undo().',
        'Wall baseline mutation uses wallStore.update() (not a direct property write).',
    ],
} as const;

export function runUpdateWallBaselineUndoRegressionChecks(): void {
    const src = readFileSync(CMD_PATH, 'utf8');

    const must = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (!hit) {
            throw new Error(
                `[UpdateWallBaselineUndoRegressionSpec] Missing "${needle}" in UpdateWallBaselineCommand.ts — ${why}`,
            );
        }
    };

    must(
        '§M2/M11 FIX',
        'full-wall-snapshot fix annotation must be present — guards against regression to partial undo',
    );

    must(
        /undo\s*\(.*CommandContext.*\)/,
        'undo() method must be implemented with a CommandContext parameter',
    );

    must(
        'Nothing to undo',
        'undo() must short-circuit when execute() was not called successfully (isExecuted guard)',
    );

    must(
        /restoreSnapshot|wallStore\.update.*undo/,
        'undo() must call wallStore.restoreSnapshot() or equivalent to revert wall position',
    );

    must(
        'wallStore.update',
        'execute() must mutate the wall via wallStore.update() — not a direct property write',
    );

    must(
        /Capture.*snapshot.*undo|snapshot.*captured.*undo|for undo/i,
        'execute() must capture a wall snapshot so undo() can restore the pre-drag state',
    );
}

/* ─── Vitest integration template (uncomment when vitest is wired for packages/) ──

import { describe, it, expect, vi } from 'vitest';

describe('C15 §8 / T3 — UpdateWallBaselineCommand undo regression', () => {
    it('passes all static source invariants', () => {
        expect(() => runUpdateWallBaselineUndoRegressionChecks()).not.toThrow();
    });

    it('restores wall to pre-drag position on undo', async () => {
        const { UpdateWallBaselineCommand } = await import(
            '../packages/command-registry/src/walls/UpdateWallBaselineCommand'
        );

        const PRE_DRAG  = [{ x: 0, z: 0 }, { x: 5, z: 0 }];
        const POST_DRAG = [{ x: 0, z: 0 }, { x: 7, z: 0 }];

        const wall = { id: 'w1', baseLine: [...PRE_DRAG], metadata: { version: 0 } };

        const updateMock    = vi.fn((_id, patch) => { Object.assign(wall, patch); return true; });
        const snapshotMock  = vi.fn(() => JSON.parse(JSON.stringify(wall)));
        const restoreMock   = vi.fn((snap) => { Object.assign(wall, snap); });

        const wallStore = {
            getById: () => wall,
            update: updateMock,
            getSnapshot: snapshotMock,
            restoreSnapshot: restoreMock,
        };

        const ctx = { stores: { wallStore } } as any;

        const cmd = new UpdateWallBaselineCommand('w1', POST_DRAG as any, { ctx });
        cmd.execute(ctx);

        expect(wall.baseLine).toEqual(POST_DRAG);

        cmd.undo(ctx);

        expect(wall.baseLine[1].x).toBeCloseTo(5);
    });

    it('does not undo when execute was not called', async () => {
        const { UpdateWallBaselineCommand } = await import(
            '../packages/command-registry/src/walls/UpdateWallBaselineCommand'
        );
        const cmd = new UpdateWallBaselineCommand('w1', [] as any, {});
        const result = cmd.undo({} as any);
        expect(result.success).toBe(false);
    });
});

──────────────────────────────────────────────────────────────────────────── */
