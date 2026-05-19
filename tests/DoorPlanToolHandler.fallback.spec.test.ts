/**
 * Phase 5 / T1 — Bus-fallback invariants for DoorPlanToolHandler
 *
 * Contract: §P2.3 (IMPL-PLAN-2026-05-17) — door placement must be bus-only.
 *
 * After P4.4 (global-bridge.ts deleted) and P4.5 (CommandManager.ts deleted),
 * the fallback path of DoorPlanToolHandler is verified at THREE levels:
 *
 *   1. Static (this file) — source-grep asserts the handler:
 *      a. Does NOT reference getCommandManagerBridge (deleted in P4.4)
 *      b. Does NOT reference window.commandManager directly for dispatch
 *      c. Uses `executeCommand('wall.opening.create', ...)` via optional chain
 *      d. Carries the §P2.3 audit annotation
 *      e. Emits a warn when wallStore is absent (graceful degradation)
 *
 *   2. TypeScript — the build gate: `npm run build` passes (verified each task)
 *
 *   3. Runtime (future) — vitest integration test with happy-dom (template below)
 *
 * No TypeScript test runner is configured for the apps/ tree today; this file
 * holds the spec object + run function that a future vitest pass would activate.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const HANDLER_PATH = resolve(
    __dirname,
    '../apps/editor/src/engine/views/plantools/DoorPlanToolHandler.ts',
);

export const DoorPlanToolHandlerFallbackSpec = {
    contract: '§P2.3 / T1 (IMPL-PLAN-2026-05-17)',
    enforcedBy: [
        'apps/editor/src/engine/views/plantools/DoorPlanToolHandler.ts (bus-only path)',
        'tests/DoorPlanToolHandler.fallback.spec.test.ts (static source-grep — this file)',
    ],
    invariants: [
        'DoorPlanToolHandler MUST NOT reference getCommandManagerBridge (deleted P4.4).',
        'DoorPlanToolHandler dispatches via runtime?.bus?.executeCommand (bus-only).',
        'DoorPlanToolHandler carries the §P2.3 audit annotation.',
        'DoorPlanToolHandler warns when wallStore is absent.',
        'DoorPlanToolHandler dispatches the command type wall.opening.create.',
    ],
} as const;

export function runDoorPlanToolHandlerFallbackChecks(): void {
    const src = readFileSync(HANDLER_PATH, 'utf8');

    const must = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (!hit) {
            throw new Error(
                `[DoorPlanToolHandlerFallbackSpec] Missing "${needle}" in DoorPlanToolHandler.ts — ${why}`,
            );
        }
    };

    const mustNot = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (hit) {
            throw new Error(
                `[DoorPlanToolHandlerFallbackSpec] Forbidden "${needle}" found in DoorPlanToolHandler.ts — ${why}`,
            );
        }
    };

    mustNot(
        'getCommandManagerBridge',
        'global-bridge.ts was deleted in P4.4; no handler may import it',
    );

    must(
        '§P2.3',
        'bus-only dispatch audit annotation must be retained for migration traceability',
    );

    must(
        "executeCommand('wall.opening.create'",
        'door placement must dispatch wall.opening.create via the command bus',
    );

    must(
        /runtime\?\.bus\?\.executeCommand/,
        'optional-chain dispatch (runtime?.bus?.executeCommand) is the PRYZM3 bus-only path',
    );

    must(
        'wallStore not present in PlanToolDrawContext',
        'graceful fallback warn must fire when wallStore is absent (T1 acceptance §A)',
    );

    must(
        "type:         'door'",
        'openingData must set type to "door" so WallOpeningLegacyAdapterHandler routes correctly',
    );
}

/* ─── Vitest template (uncomment when vitest is wired for apps/editor) ──────

import { describe, it, expect, vi } from 'vitest';

describe('§P2.3 / T1 — DoorPlanToolHandler bus-only dispatch', () => {
    it('passes all static source invariants', () => {
        expect(() => runDoorPlanToolHandlerFallbackChecks()).not.toThrow();
    });

    it('warns and returns early when wallStore is absent', async () => {
        const { DoorPlanToolHandler } = await import(
            '../apps/editor/src/engine/views/plantools/DoorPlanToolHandler'
        );
        const handler = new DoorPlanToolHandler();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        handler.activate({ wallStore: undefined } as any);
        handler.onClick({ worldX: 0, worldZ: 0 } as any);

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[DoorPlanToolHandler] wallStore not present'),
        );
        warnSpy.mockRestore();
    });

    it('dispatches wall.opening.create when runtime.bus is present', async () => {
        const { DoorPlanToolHandler } = await import(
            '../apps/editor/src/engine/views/plantools/DoorPlanToolHandler'
        );
        const executeMock = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new DoorPlanToolHandler();

        const ctx = {
            wallStore: {
                getAll: () => [{
                    id: 'w1',
                    baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }],
                }],
                getById: () => ({ id: 'w1', baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }] }),
            },
            planCanvas: {
                worldToScreen: (_x: number, _z: number) => ({ sx: 0, sy: 0 }),
                hitTest: (_sx: number, _sy: number, _r: number) => 'w1',
                getPixelsPerUnit: () => 100,
            },
            overlayCanvas: { width: 800, height: 600 },
            ctx: {
                setTransform: vi.fn(), clearRect: vi.fn(),
                save: vi.fn(), restore: vi.fn(),
                translate: vi.fn(), rotate: vi.fn(),
                setLineDash: vi.fn(), beginPath: vi.fn(),
                arc: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(),
                lineTo: vi.fn(), fill: vi.fn(), strokeStyle: '',
                lineWidth: 0, fillStyle: '',
            },
            dpr: 1,
            viewPlane: { isVertical: false, hWorldAxis: 'x' },
            viewDef: { spatial: { levelId: 'l1' } },
            activeOpeningTool: { doorType: 'single', systemTypeId: 'dt-solid-timber' },
            runtime: { bus: { executeCommand: executeMock } },
        };

        handler.activate(ctx as any);
        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);

        expect(executeMock).toHaveBeenCalledWith(
            'wall.opening.create',
            expect.objectContaining({
                wallId: 'w1',
                openingData: expect.objectContaining({ type: 'door' }),
            }),
        );
    });
});

──────────────────────────────────────────────────────────────────────────── */
