/**
 * §PERF-2026-Q2-CW-CREATE/F3 — CurtainWallTool static-import guard
 *
 * Asserts that `CurtainWallTool` imports the curtain-wall create commands
 * statically at module load — not via per-click `await import(...)` /
 * `import(...).then(...)` calls. The dynamic-import detour was adding a
 * microtask hop on every click and triggering a cold-fetch on the first
 * click of every session.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const TOOL_PATH = resolve(__dirname, '../src/elements/curtainwalls/CurtainWallTool.ts');

export const CurtainWallToolStaticImportSpec = {
    contract: '§PERF-2026-Q2-CW-CREATE/F3',
    enforcedBy: [
        'src/elements/curtainwalls/CurtainWallTool.ts (static `import { CreateCurtainWallCommand } …`)',
        'src/elements/curtainwalls/CurtainWallTool.ts (static `import { CreateCurtainWallsFromSlabCommand } …`)',
        'tests/curtainWallToolStaticImport.spec.test.ts (static source grep — this file)',
    ],
    invariants: [
        'A top-level static import of CreateCurtainWallCommand exists.',
        'A top-level static import of CreateCurtainWallsFromSlabCommand exists.',
        'No `await import(.../CreateCurtainWallCommand...)` remains anywhere in the file.',
        'No `import(.../CreateCurtainWallsFromSlabCommand...).then(` remains anywhere in the file.',
        '`_createSegment` is declared synchronously (no `async` keyword and no `Promise<void>` return).',
    ],
} as const;

export function runCurtainWallToolStaticImportChecks(): void {
    const src = readFileSync(TOOL_PATH, 'utf8');

    const must = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (!hit) {
            throw new Error(
                `[CurtainWallToolStaticImportSpec] Missing marker ${needle} in CurtainWallTool.ts — ${why}`
            );
        }
    };
    const mustNot = (needle: string | RegExp, why: string) => {
        const hit = typeof needle === 'string' ? src.includes(needle) : needle.test(src);
        if (hit) {
            throw new Error(
                `[CurtainWallToolStaticImportSpec] Forbidden pattern ${needle} present in CurtainWallTool.ts — ${why}`
            );
        }
    };

    // 1. Static imports — exact module-spec strings must be present.
    must(
        /import\s*\{\s*CreateCurtainWallCommand\s*\}\s*from\s*['"][^'"]*CreateCurtainWallCommand['"]/,
        'CreateCurtainWallCommand must be imported statically at module load'
    );
    must(
        /import\s*\{\s*CreateCurtainWallsFromSlabCommand\s*\}\s*from\s*['"][^'"]*CreateCurtainWallsFromSlabCommand['"]/,
        'CreateCurtainWallsFromSlabCommand must be imported statically at module load'
    );

    // 2. No dynamic import of either command may remain.
    mustNot(
        /await\s+import\(\s*['"][^'"]*CreateCurtainWallCommand['"]/,
        'CreateCurtainWallCommand must never be dynamically imported per-click'
    );
    mustNot(
        /import\(\s*['"][^'"]*CreateCurtainWallsFromSlabCommand['"]\s*\)\.then/,
        'CreateCurtainWallsFromSlabCommand must never be dynamically imported per-click'
    );

    // 3. _createSegment must be synchronous.
    mustNot(
        /private\s+async\s+_createSegment\s*\(/,
        '_createSegment must not be `async` anymore (F3 made it sync)'
    );
    must(
        /private\s+_createSegment\s*\([^)]*\):\s*void/,
        '_createSegment must declare a `void` return (sync)'
    );

    // 4. Audit anchor.
    must('§PERF-2026-Q2-CW-CREATE/F3', 'audit reference must remain to anchor regressions');
}

/* ─── Vitest template (uncomment once vitest is installed) ──────────────────
import { describe, it, expect } from 'vitest';

describe('§PERF-2026-Q2-CW-CREATE/F3 — CurtainWallTool static import guard', () => {
    it('keeps create commands statically imported and _createSegment sync', () => {
        expect(() => runCurtainWallToolStaticImportChecks()).not.toThrow();
    });
});
─────────────────────────────────────────────────────────────────────────── */
