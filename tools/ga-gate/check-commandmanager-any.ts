#!/usr/bin/env tsx
/**
 * Gate G-NEW-04: No commandManager: any typed parameters in packages/.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §4 Gate P0-G4
 * OI-049
 *
 * `commandManager: any` is LP-03 (type erosion). Every call site that passes
 * `commandManager: any` destroys type safety. The correct type is `CommandBus`
 * from `@pryzm/command-bus`.
 *
 * Ratchet direction: downward — hard-fail on any increase above CEILING.
 * Hard ceiling: controlled via CMDMGR_ANY_CEILING env var.
 *
 * Exclusions: CommandManager.ts (the class itself uses the pattern legitimately).
 *
 * Baseline 2026-05-16: 25 sites
 * Target trajectory (Phase E.types):
 *   E.types.1 (IFC Converters — 10 sites)          : ≤ 15
 *   E.types.2 (Plans + BatchCoordinator — 4 sites) : ≤ 11
 *   E.types.3 (AI host — 1 site)                   : 0
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/commandmanager-any.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.CMDMGR_ANY_CEILING ?? '25', 10);

function count(): number {
    let out: string;
    try {
        out = execSync(
            `rg -c "commandManager:\\s*any\\b" packages --type ts --glob '!**/CommandManager.ts' | awk -F: '{s+=$2} END {print s+0}'`,
            { encoding: 'utf8', cwd: REPO_ROOT, shell: '/bin/bash' },
        );
    } catch (err: unknown) {
        const e = err as { status?: number };
        if (e.status === 1) return 0;
        throw err;
    }
    return parseInt(out.trim() || '0', 10);
}

function loadBaseline(): number {
    if (!existsSync(BASELINE_FILE)) return CEILING;
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')).count ?? CEILING;
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
                    'G-NEW-04: commandManager: any typed params in packages/. ' +
                    'Target: 0 (Phase E.types). Correct type is CommandBus from @pryzm/command-bus. ' +
                    'Use CMDMGR_ANY_CEILING env var to step ceiling down per sprint.',
            },
            null,
            2,
        ) + '\n',
    );
}

function main(): number {
    const current  = count();
    const baseline = loadBaseline();

    if (current > CEILING) {
        console.error(
            `[commandmanager-any] FAIL: ${current} commandManager: any params in packages/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: replace commandManager: any with bus: CommandBus (Phase E.types). ' +
            'See docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5',
        );
        return 1;
    }

    if (current > baseline) {
        console.error(
            `[commandmanager-any] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(`  ${current - baseline} new commandManager: any typed param(s) introduced in packages/.`);
        return 1;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(`[commandmanager-any] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
        } else {
            writeBaseline(current);
            console.log(`[commandmanager-any] OK: ${current} (ratchet lowered ${baseline} → ${current}).`);
        }
    } else {
        console.log(`[commandmanager-any] OK: ${current} / ${CEILING}`);
    }
    return 0;
}

process.exit(main());
