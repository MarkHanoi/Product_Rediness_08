#!/usr/bin/env tsx
/**
 * Task 2.2 — WorkspaceMountBridge elimination (D.4 closure) ratchet (hard gate).
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/46-IMPLEMENTATION-PLAN-2026-05-08.md §4 Task 2.2
 * Contract: C02 §3 — "The runtime handle MUST flow through function arguments or React
 *           context. It MUST NOT be stored on `window`."
 *           C02 §2 Stage 1 — "After Phase D complete: no `WorkspaceMountBridge`".
 *
 * Hard-fail if the class name `WorkspaceMountBridge` reappears anywhere in
 * src/, packages/, or apps/.  HARD_CEILING = 0 — any reintroduction is an
 * immediate merge blocker.
 *
 * Baseline file: .ga-gate/baselines/no-workspacemountbridge.json
 *
 * --no-ratchet  : skip the auto-lower write (CI mode).
 *
 * Count methodology:
 *   rg "WorkspaceMountBridge" src packages apps --type ts | wc -l
 *
 * D.4 closure history:
 *   Wave 7 (2026-05-01) — class deleted from composeRuntime.ts + buildPersistence.ts.
 *   Task 2.2 (2026-05-09) — all 18 stale comment references scrubbed; gate added.
 *   HARD_CEILING = 0 (permanent).
 */
import { execSync }                                from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve }                        from 'node:path';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/no-workspacemountbridge.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');

/**
 * Hard ceiling — PERMANENT zero.  The workspace bridge (D.4) was deleted in
 * Wave 7 (2026-05-01).  It must NEVER reappear.
 */
const HARD_CEILING = 0;

function count(): number {
    let out: string;
    try {
        out = execSync(
            `rg "WorkspaceMountBridge" src packages apps --type ts | wc -l`,
            { encoding: 'utf8', cwd: REPO_ROOT, shell: '/bin/bash' },
        );
    } catch (err: unknown) {
        const e = err as { status?: number; stdout?: string };
        if (e.status === 1) return 0;
        throw err;
    }
    return parseInt(out.trim() || '0', 10);
}

function loadBaseline(): number {
    if (!existsSync(BASELINE_FILE)) return HARD_CEILING;
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).count;
}

function writeBaseline(n: number): void {
    mkdirSync(dirname(BASELINE_FILE), { recursive: true });
    writeFileSync(
        BASELINE_FILE,
        JSON.stringify(
            {
                count: n,
                ratchedAt: new Date().toISOString(),
                comment:
                    'Auto-ratcheted by tools/ga-gate/check-no-workspacemountbridge.ts.' +
                    ' Task 2.2 (C02 §3 / D.4 closure). HARD_CEILING = 0 — permanent.',
            },
            null,
            2,
        ) + '\n',
    );
}

function main(): number {
    const current  = count();
    const baseline = loadBaseline();

    if (current > HARD_CEILING) {
        console.error(
            `[no-workspacemountbridge] FAIL: WorkspaceMountBridge reference count = ${current}` +
            ` exceeds HARD_CEILING ${HARD_CEILING}.`,
        );
        console.error(
            `  ${current} occurrence(s) found — the workspace bridge (D.4) was deleted in Wave 7.`,
        );
        console.error(
            '  Fix: the class must not be re-introduced. Use runtime.workspace.surface' +
            ' (C02 §3) for all workspace lifecycle calls.',
        );
        return 1;
    }

    if (current > baseline) {
        console.error(
            `[no-workspacemountbridge] FAIL: count = ${current} > ratchet baseline ${baseline}.`,
        );
        console.error('  The bridge class name was re-introduced. Revert or migrate to runtime.workspace.surface.');
        return 1;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(
                `[no-workspacemountbridge] OK: ${current}` +
                ` (would ratchet ${baseline} → ${current}; --no-ratchet active).`,
            );
        } else {
            writeBaseline(current);
            console.log(
                `[no-workspacemountbridge] OK: ${current}` +
                ` (ratchet lowered ${baseline} → ${current}).`,
            );
        }
    } else {
        console.log(`[no-workspacemountbridge] OK: ${current} = baseline ${baseline} = HARD_CEILING. ✅`);
    }
    return 0;
}

process.exit(main());
