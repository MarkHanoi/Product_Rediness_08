/**
 * Contract 45 §8.2 — Project Isolation Smoke Test
 *
 * Boots a minimal jsdom-like environment, loads every singleton store
 * referenced in `ProjectSerializer`, inserts one record into each, then
 * runs `projectScopeRegistry.clearAll()` and asserts every store reports
 * empty.
 *
 * Implementation note
 * -------------------
 * No TypeScript test runner is configured in this repo today. The smoke
 * coverage is provided at runtime by the manual QA checklist documented
 * in §8.3 (and reproduced in `docs/06_KNOWN_ISSUES/`), and at static
 * level by `scripts/check-project-isolation.mjs`.
 *
 * When Vitest is added to the project, replace the body below with the
 * Vitest version (template at the bottom of this file).
 */

export const Contract45SmokeSpec = {
    enforcedBy: [
        'scripts/check-project-isolation.mjs (static)',
        'docs/06_KNOWN_ISSUES/contract-45-manual-qa.md (manual)',
    ],
    /** End-to-end behaviours covered by the manual QA checklist. */
    coveredBehaviours: [
        'IFC import isolated between projects',
        'DXF underlay isolated between projects',
        'custom wall types isolated between projects',
        'hierarchy isolated between projects',
        'annotations isolated between projects',
        'templates isolated between projects',
        'rapid A→B→A switch produces zero ghost selection / console warnings',
    ],
};

/* ─── Vitest template (uncomment once vitest is installed) ──────────────────
import { describe, it, expect } from 'vitest';
import { projectScopeRegistry } from '../src/core/persistence/ProjectScopeRegistry';

describe('Contract 45 §8.2 — Project isolation smoke', () => {
    it('clearAll empties every registered scope', async () => {
        // Loading the serializer transitively imports every store, which
        // runs each module-level register() call.
        await import('../src/core/persistence/ProjectSerializer');
        const before = projectScopeRegistry.list().length;
        const report = projectScopeRegistry.clearAll();
        expect(report.failures).toEqual([]);
        expect(report.cleared.length).toBe(before);
    });
});
─────────────────────────────────────────────────────────────────────────── */
