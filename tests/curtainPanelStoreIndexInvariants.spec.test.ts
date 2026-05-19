/**
 * §PERF-2026-Q2-CW-CREATE/F1 — CurtainPanelStore index-invariants drift guard
 *
 * Asserts that the secondary indexes added in F1 (`byWallId` / `byCellKey`)
 * stay in place and that the public lookup paths
 * (`getByCurtainWallId`, `getByCellIndex`, `removeAllForCurtainWall`)
 * never regress to the old `getAll().filter(...)` pattern that this fix
 * was specifically introduced to remove.
 *
 * No TypeScript test runner is configured in this repo today (see
 * `tests/projectIsolation.smoke.test.ts` for the precedent). The drift
 * guard is enforced at three independent levels:
 *
 *   1. **Static (TypeScript)** — `set()` / `delete()` reference the index
 *      Maps directly; their absence at compile time fails the build.
 *   2. **Runtime (dev)** — `(globalThis as any).__cwPanelStoreVerify = true`
 *      enables `__verifyInvariants` which asserts that every entry in
 *      `panels` has a matching index entry on every mutation.
 *   3. **Spec (this file)** — `runCurtainPanelStoreIndexChecks` greps the
 *      source for the canonical markers and the absence of the old
 *      filter-based fast-path. This file is the slot that a future
 *      Vitest run would activate.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const STORE_PATH = resolve(__dirname, '../src/elements/curtainwalls/CurtainPanelStore.ts');

export const CurtainPanelStoreIndexInvariantsSpec = {
    contract: '§PERF-2026-Q2-CW-CREATE/F1',
    enforcedBy: [
        'src/elements/curtainwalls/CurtainPanelStore.ts (byWallId + byCellKey maintained in set() / delete())',
        'src/elements/curtainwalls/CurtainPanelStore.ts (__verifyInvariants — runtime guard)',
        'tests/curtainPanelStoreIndexInvariants.spec.test.ts (static source grep — this file)',
    ],
    invariants: [
        'CurtainPanelStore declares `byWallId: Map<string, Set<string>>`.',
        'CurtainPanelStore declares `byCellKey: Map<string, string>`.',
        '`set(...)` writes both indexes (rewrites entries when (cwId,cellIndex) changes).',
        '`delete(...)` removes both index entries.',
        'getByCurtainWallId / getByCellIndex / removeAllForCurtainWall do NOT contain `getAll().filter(`.',
    ],
} as const;

export function runCurtainPanelStoreIndexChecks(): void {
    const src = readFileSync(STORE_PATH, 'utf8');

    const must = (needle: string, why: string) => {
        if (!src.includes(needle)) {
            throw new Error(
                `[CurtainPanelStoreIndexInvariantsSpec] Missing marker "${needle}" in CurtainPanelStore.ts — ${why}`
            );
        }
    };
    const mustNot = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (hit) {
            throw new Error(
                `[CurtainPanelStoreIndexInvariantsSpec] Forbidden pattern ${needle} present in CurtainPanelStore.ts — ${why}`
            );
        }
    };

    // 1. Index field declarations.
    must('byWallId: Map<string, Set<string>>', 'wall-id index must remain declared');
    must('byCellKey: Map<string, string>', 'cell-key index must remain declared');

    // 2. Index maintenance hooks inside the write paths.
    must('this.byWallId.set', 'set() must populate byWallId');
    must('this.byCellKey.set', 'set() must populate byCellKey');
    must('this.byWallId.get', 'getByCurtainWallId / delete must read byWallId');
    must('this.byCellKey.get', 'getByCellIndex / delete must read byCellKey');
    must('this.byCellKey.delete', 'delete() must clean up byCellKey');

    // 3. The lookup paths must NOT regress to the old filter-based approach.
    mustNot(
        /getByCurtainWallId\([^)]*\)[^]*?getAll\(\)\.filter/,
        'getByCurtainWallId must never use getAll().filter'
    );
    mustNot(
        /getByCellIndex\([^)]*\)[^]*?getAll\(\)\.find/,
        'getByCellIndex must never use getAll().find'
    );
    mustNot(
        /removeAllForCurtainWall\([^)]*\)[^]*?getAll\(\)\.filter/,
        'removeAllForCurtainWall must never use getAll().filter'
    );

    // 4. Helper presence (encodes contract vocabulary).
    must('cellKey(', 'cellKey() helper must remain present');
    must('§PERF-2026-Q2-CW-CREATE/F1', 'audit reference must remain to anchor regressions');
}

/* ─── Vitest template (uncomment once vitest is installed) ──────────────────
import { describe, it, expect } from 'vitest';

describe('§PERF-2026-Q2-CW-CREATE/F1 — CurtainPanelStore index invariants', () => {
    it('keeps byWallId / byCellKey indexes wired and free of filter regressions', () => {
        expect(() => runCurtainPanelStoreIndexChecks()).not.toThrow();
    });
});
─────────────────────────────────────────────────────────────────────────── */
