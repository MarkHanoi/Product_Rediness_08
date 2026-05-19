/**
 * Phase 5 / T2 — Bus-fallback invariants for WindowPlanToolHandler
 *
 * Same structural pattern as T1 (DoorPlanToolHandler.fallback.spec.test.ts).
 * Contract: §P2.3 (IMPL-PLAN-2026-05-17) — window placement must be bus-only.
 *
 * Enforcement levels:
 *   1. Static (this file) — source-grep invariants
 *   2. TypeScript — build gate
 *   3. Runtime (future) — vitest integration test (template below)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const HANDLER_PATH = resolve(
    __dirname,
    '../apps/editor/src/engine/views/plantools/WindowPlanToolHandler.ts',
);

export const WindowPlanToolHandlerFallbackSpec = {
    contract: '§P2.3 / T2 (IMPL-PLAN-2026-05-17)',
    enforcedBy: [
        'apps/editor/src/engine/views/plantools/WindowPlanToolHandler.ts (bus-only path)',
        'tests/WindowPlanToolHandler.fallback.spec.test.ts (static source-grep — this file)',
    ],
    invariants: [
        'WindowPlanToolHandler MUST NOT reference getCommandManagerBridge (deleted P4.4).',
        'WindowPlanToolHandler dispatches via runtime?.bus?.executeCommand (bus-only).',
        'WindowPlanToolHandler carries the §P2.3 audit annotation.',
        'WindowPlanToolHandler warns when wallStore is absent.',
        'WindowPlanToolHandler dispatches the command type wall.opening.create.',
        'openingData.type must be "window" (not "door").',
    ],
} as const;

export function runWindowPlanToolHandlerFallbackChecks(): void {
    const src = readFileSync(HANDLER_PATH, 'utf8');

    const must = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (!hit) {
            throw new Error(
                `[WindowPlanToolHandlerFallbackSpec] Missing "${needle}" in WindowPlanToolHandler.ts — ${why}`,
            );
        }
    };

    const mustNot = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (hit) {
            throw new Error(
                `[WindowPlanToolHandlerFallbackSpec] Forbidden "${needle}" found in WindowPlanToolHandler.ts — ${why}`,
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
        'window placement must dispatch wall.opening.create via the command bus',
    );

    must(
        /runtime\?\.bus\?\.executeCommand/,
        'optional-chain dispatch (runtime?.bus?.executeCommand) is the PRYZM3 bus-only path',
    );

    must(
        'wallStore not present in PlanToolDrawContext',
        'graceful fallback warn must fire when wallStore is absent (T2 acceptance §A)',
    );

    must(
        "type:         'window'",
        'openingData must set type to "window" — not "door" — so WallOpeningLegacyAdapterHandler routes correctly',
    );
}

/* ─── Vitest template (uncomment when vitest is wired for apps/editor) ──────

import { describe, it, expect, vi } from 'vitest';

describe('§P2.3 / T2 — WindowPlanToolHandler bus-only dispatch', () => {
    it('passes all static source invariants', () => {
        expect(() => runWindowPlanToolHandlerFallbackChecks()).not.toThrow();
    });

    it('warns and returns early when wallStore is absent', async () => {
        const { WindowPlanToolHandler } = await import(
            '../apps/editor/src/engine/views/plantools/WindowPlanToolHandler'
        );
        const handler = new WindowPlanToolHandler();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        handler.activate({ wallStore: undefined } as any);
        handler.onClick({ worldX: 0, worldZ: 0 } as any);

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[WindowPlanToolHandler] wallStore not present'),
        );
        warnSpy.mockRestore();
    });

    it('dispatches wall.opening.create with type=window', async () => {
        const { WindowPlanToolHandler } = await import(
            '../apps/editor/src/engine/views/plantools/WindowPlanToolHandler'
        );
        const executeMock = vi.fn().mockReturnValue(Promise.resolve());
        const handler = new WindowPlanToolHandler();

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
                lineWidth: 0, fillStyle: '', rect: vi.fn(),
            },
            dpr: 1,
            viewPlane: { isVertical: false, hWorldAxis: 'x' },
            viewDef: { spatial: { levelId: 'l1' } },
            activeOpeningTool: { systemTypeId: 'wt-casement' },
            runtime: { bus: { executeCommand: executeMock } },
        };

        handler.activate(ctx as any);
        handler.onClick({ worldX: 2.5, worldZ: 0.1 } as any);

        expect(executeMock).toHaveBeenCalledWith(
            'wall.opening.create',
            expect.objectContaining({
                wallId: 'w1',
                openingData: expect.objectContaining({ type: 'window' }),
            }),
        );
    });
});

──────────────────────────────────────────────────────────────────────────── */
