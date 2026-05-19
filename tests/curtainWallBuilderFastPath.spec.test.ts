/**
 * §PERF-2026-Q2-CW-CREATE/F2 — CurtainWallBuilder interactive fast-path guard
 *
 * Asserts that `CurtainWallBuilder.updateCurtainWall(...)` retains the
 * fast-path that bypasses the rAF queue when (a) the queue is empty, (b)
 * no rAF handle is in flight, and (c) the BatchCoordinator is NOT batching.
 *
 * Without this fast-path every interactive curtain-wall placement pays
 * ≥16 ms of needless latency before the builder runs. The audit ranks F2
 * P1 specifically because the rAF detour was masquerading as throttling
 * when it was really just a queue meant for AI batches.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const BUILDER_PATH = resolve(__dirname, '../src/elements/curtainwalls/CurtainWallBuilder.ts');

export const CurtainWallBuilderFastPathSpec = {
    contract: '§PERF-2026-Q2-CW-CREATE/F2',
    enforcedBy: [
        'src/elements/curtainwalls/CurtainWallBuilder.ts (updateCurtainWall fast-path branch)',
        'tests/curtainWallBuilderFastPath.spec.test.ts (static source grep — this file)',
    ],
    invariants: [
        '`updateCurtainWall` checks `_pendingBuilds.length === 0`.',
        '`updateCurtainWall` checks `_rafHandle === null`.',
        '`updateCurtainWall` checks `!batchCoordinator.isBatching` before falling into rAF.',
        '`updateCurtainWall` calls `this.build(cw)` synchronously when all three conditions hold.',
    ],
} as const;

export function runCurtainWallBuilderFastPathChecks(): void {
    const src = readFileSync(BUILDER_PATH, 'utf8');

    const must = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (!hit) {
            throw new Error(
                `[CurtainWallBuilderFastPathSpec] Missing marker ${needle} in CurtainWallBuilder.ts — ${why}`
            );
        }
    };

    // 1. The three-condition guard at the head of updateCurtainWall.
    must(
        /updateCurtainWall\(cw: CurtainWallData\): void \{[^]*?this\._pendingBuilds\.length === 0[^]*?this\._rafHandle === null[^]*?!batchCoordinator\.isBatching/,
        'updateCurtainWall must short-circuit before the rAF queue when nothing is in flight'
    );

    // 2. The fast-path must invoke `this.build(cw)` directly.
    must(
        /updateCurtainWall\(cw: CurtainWallData\): void \{[^]*?this\.build\(cw\)/,
        'updateCurtainWall fast-path must call this.build(cw) inline'
    );

    // 3. Audit anchor — keeps the rationale discoverable.
    must('§PERF-2026-Q2-CW-CREATE/F2', 'audit reference must remain to anchor regressions');
}

/* ─── Vitest template (uncomment once vitest is installed) ──────────────────
import { describe, it, expect } from 'vitest';

describe('§PERF-2026-Q2-CW-CREATE/F2 — CurtainWallBuilder fast-path', () => {
    it('keeps the rAF-bypass fast-path on updateCurtainWall', () => {
        expect(() => runCurtainWallBuilderFastPathChecks()).not.toThrow();
    });
});
─────────────────────────────────────────────────────────────────────────── */
