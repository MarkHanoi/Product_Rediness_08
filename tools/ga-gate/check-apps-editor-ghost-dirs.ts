#!/usr/bin/env tsx
/**
 * G7-T3 — apps/editor/src/ ghost-directory guard.
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §7 (G7)
 *
 * Hard-fail if any KNOWN ghost directory exists inside `apps/editor/src/`.
 *
 * Background:
 *   Sprint AU found 70 dead ghost files in `apps/editor/src/views/` and
 *   `apps/editor/src/plantools/` — directories that were never in the root
 *   tsconfig.json `include` scope and therefore never compiled or bundled.
 *   They occupied 70 files of dead code and caused confusion during onboarding.
 *
 *   The root tsconfig.json `include` scope for apps/editor is:
 *     • `apps/editor/src/ui`
 *     • `apps/editor/src/engine`
 *     • `apps/editor/src/rendering`
 *
 *   Any directory in `apps/editor/src/` that is OUTSIDE this list AND has no
 *   verified importer within the compile scope is a ghost directory.
 *
 * Ghost directories tracked by this gate:
 *   • apps/editor/src/projectsui/  — empty; no importers (DELETED in G7 sprint)
 *
 * Directories explicitly NOT flagged (legitimate, have importers in compile scope):
 *   • apps/editor/src/toolbar/    — imported from apps/editor/src/index.ts:48
 *   • apps/editor/src/sunset/     — imported from src/main.ts:33 (in "src" include)
 *   • apps/editor/src/workers/    — geometry.worker.ts (Vite ?worker import)
 *   • apps/editor/src/featureFlags/ — plan-view-gate.ts (engine-layer import)
 *   • apps/editor/src/projects/   — active project scope module
 *
 * To add a new ghost directory to the blocklist, append its path to GHOST_DIRS below
 * and delete the directory from the repo.
 *
 * Hard-fail = 0.  Any match is an immediate CI blocker.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();

/**
 * Directories that must NOT exist.  Each was confirmed to be outside the
 * tsconfig include scope and to have zero importers in the compiled tree.
 */
const GHOST_DIRS: readonly string[] = [
    'apps/editor/src/projectsui',
    'apps/editor/src/views',
    'apps/editor/src/plantools',
];

function main(): number {
    let violations = 0;

    for (const rel of GHOST_DIRS) {
        const abs = resolve(REPO_ROOT, rel);
        if (existsSync(abs)) {
            console.error(
                `[ghost-dirs] FAIL: ghost directory still present: ${rel}`,
            );
            console.error(
                `  This directory is outside the tsconfig include scope and has no`,
            );
            console.error(
                `  verified importers in the compiled tree.  Delete it:`,
            );
            console.error(
                `    rm -rf ${rel}`,
            );
            violations++;
        }
    }

    if (violations > 0) {
        console.error(
            `[ghost-dirs] ${violations} ghost dir(s) found. Fix before merging.`,
        );
        console.error(
            `  Read: docs/03_PRYZM3/04-PLAN-FORWARD/50-PLAN-FORWARD-GAP-ANALYSIS.md §7 (G7)`,
        );
        return 1;
    }

    console.log(
        `[ghost-dirs] OK: 0 ghost directories found (checked ${GHOST_DIRS.length} known ghost paths).`,
    );
    return 0;
}

process.exit(main());
