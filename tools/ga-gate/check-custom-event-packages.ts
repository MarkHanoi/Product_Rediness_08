#!/usr/bin/env tsx
/**
 * Gate G-NEW-03: No window.dispatchEvent(new CustomEvent(...)) from packages/ or plugins/.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §4 Gate P0-G3
 * OI-048
 *
 * Ratchet direction: downward — hard-fail on any increase above CEILING.
 * Hard ceiling: controlled via CUSTOMEVENT_CEILING env var.
 *
 * Baseline 2026-05-16 (corrected): 337 sites in packages/ (original estimate of 330 was low)
 * CEILING corrected from 333 → 340 (actual 337 + buffer 3) to reflect true baseline.
 * Target trajectory (Phase F.events):
 *   F.events.1 (EventBus package + injection points) : 337 (structural — no site reduction yet)
 *   F.events.2 (apps/editor/src/ migration)          : 337 (packages not yet migrated)
 *   F.events.3 (packages/ migration)                 : 0
 *
 * NOTE: Apps-tier scan (apps/editor/src/) is separate — handled by a higher-level check.
 * This gate covers packages/ only (the tier most vulnerable to regressions).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/custom-event-packages.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.CUSTOMEVENT_CEILING ?? '340', 10);

function count(): number {
    let out: string;
    try {
        out = execSync(
            `rg -c "window\\.dispatchEvent|new CustomEvent" packages --type ts | awk -F: '{s+=$2} END {print s+0}'`,
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
                    'G-NEW-03: CustomEvent dispatches in packages/. ' +
                    'Target: 0 (Phase F.events.3). ' +
                    'Use CUSTOMEVENT_CEILING env var to step ceiling down per sprint.',
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
            `[custom-event-packages] FAIL: ${current} CustomEvent dispatches in packages/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: replace window.dispatchEvent(new CustomEvent(...)) with ' +
            'runtime.events.emit() (Phase F.events). ' +
            'See docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5',
        );
        return 1;
    }

    if (current > baseline) {
        console.error(
            `[custom-event-packages] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(`  ${current - baseline} new CustomEvent dispatch(es) introduced in packages/.`);
        return 1;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(`[custom-event-packages] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
        } else {
            writeBaseline(current);
            console.log(`[custom-event-packages] OK: ${current} (ratchet lowered ${baseline} → ${current}).`);
        }
    } else {
        console.log(`[custom-event-packages] OK: ${current} / ${CEILING}`);
    }
    return 0;
}

process.exit(main());
