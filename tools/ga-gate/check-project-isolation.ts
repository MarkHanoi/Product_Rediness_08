#!/usr/bin/env tsx
/**
 * GA Gate: check-project-isolation
 *
 * Wave 35 I-7 — Static analysis gate (no browser required).
 * Verifies that all four structural anchors of the C13 project-isolation
 * fix are present in the codebase.  Any missing anchor is a hard FAIL.
 *
 * Gates:
 *   1. `BatchCoordinator.forceReset` — public method exists
 *   2. `batchCoordinator.forceReset` call in engineLauncher.ts
 *      (project-switch listener step 1)
 *   3. `__engineTeardown` declared in global-window.d.ts
 *   4. `resetWallRebuildState` call in engineLauncher.ts
 *      (project-switch listener step 2)
 *
 * Exit 0 → all gates green.
 * Exit 1 → one or more gates failed (HARD FAIL — merge blocked).
 *
 * Contract: C13 §4, Wave 35 §3.7
 */

import { execSync } from 'child_process';
import * as path from 'path';

const ROOT = path.resolve(process.cwd());

interface Gate {
    label:   string;
    file:    string;
    pattern: string;
    minHits: number;
}

const GATES: Gate[] = [
    {
        // P9-W4 (2026-05-10): BatchCoordinator.ts moved from
        // src/engine/subsystems/core/batch/ to packages/core-app-model/src/batch/.
        // The src/ file is now a re-export stub with no method bodies.
        // Gate checks the canonical implementation location.
        label:   'Gate 1 — BatchCoordinator.forceReset() exists',
        file:    'packages/core-app-model/src/batch/BatchCoordinator.ts',
        pattern: 'forceReset',
        minHits: 2,
    },
    {
        // After Task 5.2 refactor the project-switch teardown was extracted
        // into ProjectLifecycleController (packages/runtime-composer/).
        // Gate 2 verifies forceReset() is called there (Step 1 of C13 §4).
        label:   'Gate 2 — ProjectLifecycleController calls forceReset() (C13 §4 step 1)',
        file:    'packages/runtime-composer/src/ProjectLifecycleController.ts',
        pattern: 'forceReset',
        minHits: 1,
    },
    {
        label:   'Gate 3 — __engineTeardown declared in global-window.d.ts',
        file:    'src/global-window.d.ts',
        pattern: '__engineTeardown',
        minHits: 1,
    },
    {
        // After Task 5.2 refactor resetWallRebuildState() is called from
        // ProjectLifecycleController (Step 2 of C13 §4 teardown).
        label:   'Gate 4 — ProjectLifecycleController calls resetWallRebuildState() (C13 §4 step 2)',
        file:    'packages/runtime-composer/src/ProjectLifecycleController.ts',
        pattern: 'resetWallRebuildState',
        minHits: 1,
    },
];

let allPassed = true;

for (const gate of GATES) {
    const filePath = path.join(ROOT, gate.file);
    let hits = 0;
    try {
        const out = execSync(
            `grep -c "${gate.pattern}" "${filePath}" 2>/dev/null || echo 0`,
            { encoding: 'utf8' },
        ).trim();
        hits = parseInt(out, 10) || 0;
    } catch {
        hits = 0;
    }

    if (hits >= gate.minHits) {
        console.log(`[project-isolation] ✅ ${gate.label} (${hits} hit(s))`);
    } else {
        console.error(`[project-isolation] ❌ FAIL: ${gate.label} — expected ≥ ${gate.minHits} hit(s), got ${hits}`);
        console.error(`   File: ${gate.file}`);
        console.error(`   Pattern: "${gate.pattern}"`);
        allPassed = false;
    }
}

if (allPassed) {
    console.log('\n[project-isolation] All 4 gates green. ✅');
    process.exit(0);
} else {
    console.error('\n[project-isolation] One or more gates failed. Fix the above before merging.');
    process.exit(1);
}
