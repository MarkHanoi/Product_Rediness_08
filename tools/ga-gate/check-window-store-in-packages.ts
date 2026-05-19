#!/usr/bin/env tsx
/**
 * Gate G-NEW-02: No window.xStore access from packages/ (LP-01).
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §4 Gate P0-G2
 * OI-047
 *
 * Ratchet direction: downward — hard-fail on any increase above CEILING.
 * Hard ceiling: controlled via WSTORE_PKG_CEILING env var.
 *
 * Exclusions: global-bridge.ts, window-augment.d.ts, CommandManager.ts
 * (these are the permitted transitional bridge files; all others must inject
 * via constructor — not read from window.*).
 *
 * Baseline 2026-05-16: 239 sites
 * Target trajectory (Phase E.stores):
 *   E.stores.1 (init files — stop writing)       : still 239 (readers not yet migrated)
 *   E.stores.2 (BrowserDataHelpers + SpatialTree) : ≤ 197
 *   E.stores.3 (initUI.ts reads)                  : ≤ 166
 *   E.stores.4 (Plan Tool Handlers)               : ≤ 114
 *   E.stores.5 (packages/)                        : ≤ 0
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/window-store-packages.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.WSTORE_PKG_CEILING ?? '246', 10);

const EXCLUDED_GLOBS = [
    '!**/global-bridge.ts',
    '!**/global-bridge/**',
    '!**/*window-augment*',
    '!**/CommandManager.ts',
];

function count(): number {
    let out: string;
    try {
        const globArgs = EXCLUDED_GLOBS.map(g => `--glob '${g}'`).join(' ');
        out = execSync(
            `rg -c "window\\.\\w*Store\\b" packages --type ts ${globArgs} | awk -F: '{s+=$2} END {print s+0}'`,
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
                    'G-NEW-02: window.xStore reads in packages/. ' +
                    'Target: 0 (Phase E.stores.5). ' +
                    'Use WSTORE_PKG_CEILING env var to step ceiling down per sprint.',
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
            `[window-store-packages] FAIL: ${current} window.xStore reads in packages/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: inject stores via constructor (Phase E.stores). ' +
            '  See docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5',
        );
        return 1;
    }

    if (current > baseline) {
        console.error(
            `[window-store-packages] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(`  ${current - baseline} new window.xStore read(s) introduced in packages/.`);
        return 1;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(`[window-store-packages] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
        } else {
            writeBaseline(current);
            console.log(`[window-store-packages] OK: ${current} (ratchet lowered ${baseline} → ${current}).`);
        }
    } else {
        console.log(`[window-store-packages] OK: ${current} / ${CEILING}`);
    }
    return 0;
}

process.exit(main());
