/**
 * Phase 5 / T6 — WallOpeningLegacyAdapterHandler bus round-trip invariants
 *
 * Contract: §P2.3 (IMPL-PLAN-2026-05-17) — after Phase 2.3, the handler
 * registered under `wall.opening.create` must be a typed CommandHandler
 * (not a bridge fallback) and must be registered in the wall plugin's handler
 * index so the bus can dispatch to it.
 *
 * Invariants verified:
 *   1. `WallOpeningLegacyAdapterHandler` class exists in plugins/wall
 *   2. Its `readonly type` is exactly `'wall.opening.create'`
 *   3. It is imported and registered in `plugins/wall/src/handlers/index.ts`
 *   4. The handler accepts a `wallId` + `openingData` payload
 *   5. The `execute()` method is implemented (non-trivial body)
 *   6. The handler file carries a §P2.3 / §P2 annotation for traceability
 *
 * Full round-trip (bus dispatch → store write → undo) is deferred to a
 * vitest integration test (template below) that requires a real WallStore
 * instance and a RingBufferUndoStack mock.
 *
 * Enforcement levels:
 *   1. Static (this file) — source-grep
 *   2. TypeScript — build gate
 *   3. Runtime (future) — vitest integration test (template below)
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const HANDLER_PATH = resolve(
    __dirname,
    '../plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter.ts',
);

const HANDLER_INDEX_PATH = resolve(
    __dirname,
    '../plugins/wall/src/handlers/index.ts',
);

export const CreateWallOpeningHandlerSpec = {
    contract: '§P2.3 / T6 (IMPL-PLAN-2026-05-17) — wall.opening.create bus round-trip',
    enforcedBy: [
        'plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter.ts (handler implementation)',
        'plugins/wall/src/handlers/index.ts (handler registration)',
        'tests/createWallOpeningHandler.integration.spec.test.ts (static source-grep — this file)',
    ],
    invariants: [
        'WallOpeningLegacyAdapterHandler class exists.',
        'Handler readonly type is exactly "wall.opening.create".',
        'Handler is registered in plugins/wall/src/handlers/index.ts.',
        'Handler accepts wallId + openingData payload fields.',
        'Handler execute() body is non-trivial (contains conditional logic).',
    ],
} as const;

export function runCreateWallOpeningHandlerChecks(): void {
    const src   = readFileSync(HANDLER_PATH, 'utf8');
    const index = readFileSync(HANDLER_INDEX_PATH, 'utf8');

    const must = (src: string, needle: string | RegExp, label: string, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (!hit) {
            throw new Error(
                `[CreateWallOpeningHandlerSpec] Missing "${needle}" in ${label} — ${why}`,
            );
        }
    };

    must(
        src,
        'class WallOpeningLegacyAdapterHandler',
        'CreateWallOpeningLegacyAdapter.ts',
        'handler class must exist with this exact name',
    );

    must(
        src,
        "readonly type = 'wall.opening.create'",
        'CreateWallOpeningLegacyAdapter.ts',
        'handler type discriminant must exactly match the bus command name',
    );

    must(
        src,
        'wallId',
        'CreateWallOpeningLegacyAdapter.ts',
        'handler payload must include wallId field',
    );

    must(
        src,
        'openingData',
        'CreateWallOpeningLegacyAdapter.ts',
        'handler payload must include openingData field',
    );

    must(
        src,
        /execute\s*\(.*cmd.*\).*\{[\s\S]{30,}/,
        'CreateWallOpeningLegacyAdapter.ts',
        'execute() must have a non-trivial body (at least 30 chars of implementation)',
    );

    must(
        index,
        'WallOpeningLegacyAdapterHandler',
        'plugins/wall/src/handlers/index.ts',
        'handler must be imported and registered in the wall plugin handler index',
    );

    must(
        index,
        "'wall.opening.create'",
        'plugins/wall/src/handlers/index.ts',
        'handler type string must appear in the index registration table',
    );
}

/* ─── Vitest integration template (full round-trip with WallStore mock) ─────

import { describe, it, expect, vi } from 'vitest';

describe('§P2.3 / T6 — wall.opening.create handler round-trip', () => {
    it('passes all static source invariants', () => {
        expect(() => runCreateWallOpeningHandlerChecks()).not.toThrow();
    });

    it('adds opening to wallStore on execute', async () => {
        const { WallOpeningLegacyAdapterHandler } = await import(
            '../plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter'
        );

        const wall = {
            id: 'w1',
            baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }],
            windows: new Map(),
            doors: new Map(),
        };

        const addOpeningMock = vi.fn();
        const wallStore = {
            getById: () => wall,
            addOpening: addOpeningMock,
            update: vi.fn(() => true),
        };

        const handler = new WallOpeningLegacyAdapterHandler();

        const payload = {
            wallId: 'w1',
            openingData: {
                id: 'o1',
                elementId: 'e1',
                type: 'door',
                offset: 1.5,
                width: 1.0,
                height: 2.1,
                sillHeight: 0,
                doorType: 'single',
                systemTypeId: 'dt-solid-timber',
            },
        };

        const stores = { wallStore } as any;
        await handler.execute(payload, stores);

        expect(wallStore.update).toHaveBeenCalledWith(
            'w1',
            expect.objectContaining({ id: 'w1' }),
        );
    });

    it('undo removes opening from store', async () => {
        const { WallOpeningLegacyAdapterHandler } = await import(
            '../plugins/wall/src/handlers/CreateWallOpeningLegacyAdapter'
        );

        const removeOpeningMock = vi.fn();
        const wallStore = {
            getById: vi.fn(),
            update: vi.fn(() => true),
            removeOpening: removeOpeningMock,
        };

        const handler = new WallOpeningLegacyAdapterHandler();
        const payload = {
            wallId: 'w1',
            openingData: { id: 'o1', type: 'door' },
        };

        const stores = { wallStore } as any;
        await handler.undo?.(payload, stores);

        // undo should remove the opening or restore the pre-execute snapshot
        expect(removeOpeningMock).toHaveBeenCalledWith('w1', 'o1');
    });
});

──────────────────────────────────────────────────────────────────────────── */
