/**
 * Contract 45 §8.1 — Registry Guard Test
 *
 * Asserts that every singleton store imported by `ProjectSerializer`
 * also registers itself with `projectScopeRegistry`. A drift here
 * re-opens the cross-project leak documented in Contract 44.
 *
 * Implementation note
 * -------------------
 * This repository does not currently ship a TypeScript test runner
 * (no Jest/Vitest in package.json). The same invariant is enforced by
 * the static analyzer at `scripts/check-project-isolation.mjs`, which
 * runs in CI via `npm run check:isolation`. This file documents the
 * intent in TS form (importable for future Vitest adoption) and
 * delegates the live assertion to the static analyzer.
 *
 * To run the live check today:
 *   $ npm run check:isolation
 *
 * When Vitest is added, replace the body below with the Vitest version
 * (template at the bottom of this file).
 */

export const Contract45GuardSpec = {
    /** Run `node scripts/check-project-isolation.mjs` to enforce. */
    enforcedBy: 'scripts/check-project-isolation.mjs',
    npmScript: 'check:isolation',
    /** What this guard prevents. */
    invariant:
        'Every singleton store referenced in ProjectSerializer.ts MUST also ' +
        'be registered with projectScopeRegistry, otherwise switching ' +
        'projects will leak that store across project boundaries.',
    /** Symptom if invariant is broken. */
    failureSymptom:
        'IFC/DXF/PDF imports, custom system types, hierarchy, templates, ' +
        'requirements, etc. visible in projects they were not created in.',
};

/* ─── Vitest template (uncomment once vitest is installed) ──────────────────
import { describe, it, expect } from 'vitest';
import { projectScopeRegistry } from '../src/core/persistence/ProjectScopeRegistry';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Contract 45 §8.1 — ProjectScopeRegistry guard', () => {
    it('every serialized singleton is a registered scope', async () => {
        // Force-load every store module so registrations run.
        await import('../src/core/persistence/ProjectSerializer');
        const src = fs.readFileSync(
            path.resolve(__dirname, '../src/core/persistence/ProjectSerializer.ts'),
            'utf8',
        );
        const importRe = /^import\s+\{\s*([^}]+)\s*\}\s+from\s+['"][^'"]+['"]\s*;/gm;
        const expected = new Set<string>();
        for (const m of src.matchAll(importRe)) {
            for (const raw of m[1].split(',')) {
                const name = raw.trim().replace(/\s+as\s+\w+/, '');
                if (/^[a-z]/.test(name) && /(Store|Manager|Index|Engine)$/.test(name)) {
                    expected.add(name);
                }
            }
        }
        const registered = new Set(projectScopeRegistry.list().map(s => s.scopeName));
        const missing = [...expected].filter(n => !registered.has(n));
        expect(missing).toEqual([]);
    });
});
─────────────────────────────────────────────────────────────────────────── */
