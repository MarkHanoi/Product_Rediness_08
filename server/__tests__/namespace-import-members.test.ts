/**
 * server/__tests__/namespace-import-members.test.ts
 * ============================================================================
 * §NAMESPACE-MEMBER-EXISTS (L-779) — every `pgProjectStore.X` server.js calls
 * must actually be exported by `server/projectStore.js`.
 *
 * ── WHY THIS GUARD EXISTS ────────────────────────────────────────────────────
 * Production threw, on EVERY project open that reached the Postgres path:
 *
 *     TypeError: pgProjectStore.getVersion is not a function
 *
 * The export is `getVersionById`. The call was also passing arguments in the
 * wrong order — but the wrong NAME is what turned it into a 500.
 *
 * ⚠ NOTHING IN THE EXISTING TOOLCHAIN COULD HAVE CAUGHT IT:
 *   • `import * as pgProjectStore` yields a namespace object. A missing member is
 *     `undefined` at import time and only explodes when CALLED — there is no
 *     module-resolution error to notice.
 *   • `server.js` is JavaScript, so `tsc` never type-checks these call sites.
 *   • The route's only test coverage exercises the SUPABASE branch, which returns
 *     early — the Postgres branch had never been executed by a test.
 *   • It is not a syntax error, so `node --check` passes.
 *
 * So the first thing that noticed was a founder reporting their saved project
 * opening blank. This test closes that gap for the whole namespace, not just the
 * one member that failed.
 *
 * ⚠ IT MUST MATCH `export const` AS WELL AS `export function`. A first pass
 * matching only `export function` reported `imProjectsMapAdapter` as missing — it
 * is `export const imProjectsMapAdapter = {…}`. A guard that cries wolf gets
 * switched off, which is exactly how the ga-gate suite ended up unreachable.
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverJs = readFileSync(resolve(repoRoot, 'server.js'), 'utf8');
const storeJs = readFileSync(resolve(repoRoot, 'server', 'projectStore.js'), 'utf8');

/** Strip line and block comments so prose mentioning a member is not read as a call. */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Every `export function foo` / `export async function foo` / `export const foo`. */
function exportedMembers(src: string): Set<string> {
    const out = new Set<string>();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
    for (const m of src.matchAll(/^export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
    return out;
}

describe('§1 pgProjectStore namespace members all exist', () => {
    const exported = exportedMembers(storeJs);
    const code = stripComments(serverJs);
    const used = new Set(
        [...code.matchAll(/pgProjectStore\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
    );

    it('T1.1 — the parse found real exports (guards the guard)', () => {
        // A positive control. If the regex silently matched nothing, every
        // assertion below would pass vacuously and this file would be decoration.
        expect(exported.size).toBeGreaterThan(5);
        expect(exported.has('getVersionById')).toBe(true);
        expect(exported.has('imProjectsMapAdapter')).toBe(true);
    });

    it('T1.2 — the parse found real call sites (guards the guard)', () => {
        expect(used.size).toBeGreaterThan(3);
    });

    it('T1.3 — every member server.js calls is exported by projectStore.js', () => {
        const missing = [...used].filter((name) => !exported.has(name)).sort();
        expect(
            missing,
            'server.js calls pgProjectStore members that do NOT exist. Each is a runtime '
            + 'TypeError the moment that branch is reached — invisible to tsc (server.js is JS) '
            + 'and to `node --check`. Missing: ' + missing.join(', '),
        ).toEqual([]);
    });

    it('T1.4 — the specific regression: getVersion is gone, getVersionById is used', () => {
        expect(used.has('getVersion')).toBe(false);
        expect(used.has('getVersionById')).toBe(true);
    });
});

describe('§2 the latest-version route calls it with the documented argument order', () => {
    it('T2.1 — getVersionById(projectId, versionId, userId), not (versionId, projectId, …)', () => {
        // Both ids are TEXT, so a swapped pair returns null SILENTLY rather than
        // throwing — the project would open empty with no error at all. The name
        // fix alone would not have been enough.
        const sig = /export async function getVersionById\(\s*projectId\s*,\s*versionId\s*,\s*userId\s*\)/;
        expect(sig.test(storeJs), 'getVersionById signature changed — re-check the call site').toBe(true);

        const call = /getVersionById\(\s*id\s*,\s*latest\.id\s*,\s*userId\s*\)/;
        expect(call.test(serverJs), 'latest-version passes (projectId, versionId, userId)').toBe(true);
    });
});
