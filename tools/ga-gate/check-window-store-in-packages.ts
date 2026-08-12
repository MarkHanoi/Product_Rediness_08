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
 *
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ─────────────────────────────
 * This gate used to shell out to `rg … | awk …` under `shell: '/bin/bash'` —
 * three binaries absent from a stock Windows box. Measured BEFORE this port:
 *
 *     Error: spawnSync /bin/bash ENOENT   → exit 1
 *
 * See check-custom-event-packages.ts for the full write-up. Rewritten on
 * `lib/sourceScan.ts` (Node only, zero external binaries).
 *
 * ─── Comment stripping: REQUIRED here ────────────────────────────────────────
 * The assertion is about READS of window.xStore, i.e. code. Phase E.stores JSDoc
 * names the very globals it is telling the reader to stop reading. Measured on the
 * first real run: 256 matching lines raw → **221** with comments removed; the
 * 35-line difference was documentation. Note both numbers sit near the 246 ceiling
 * on opposite sides — the raw count would have read as a FAIL, so the honest unit
 * matters here, and the 221 is reported alongside a mention count on every run.
 *
 * ─── Counting unit ───────────────────────────────────────────────────────────
 * `rg -c` counted matching LINES, summed by awk. `distinctLines()` reproduces it.
 *
 * ─── Scope: RESTATED, NOT NARROWED ───────────────────────────────────────────
 * rg scanned `packages` with `--type ts` minus four negated globs. The port walks
 * the same single `packages` directory with the same four extensions, and
 * reproduces all four globs in `excluded()` below — none is dropped or widened.
 * Measured 2026-08-11: those globs exclude 2 files (the two global-bridge files);
 * CommandManager.ts no longer exists anywhere in the repo, so that fourth glob is
 * DEAD but is kept, because removing it would be a silent scope change.
 *
 * Exit: 0 = at/under ceiling and baseline · 1 = over either · 2 = scan misconfigured
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanFiles, scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/window-store-packages.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.WSTORE_PKG_CEILING ?? '246', 10);

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/**
 * ⚠ THE HONESTY FLOOR. `packages/` holds 3,711 TS files today; 2,500 catches a bad
 * cwd or a vanished subject tree without tripping on churn. Below it the scan
 * exits 2 — NOT 0 and NOT 1. A MISCONFIGURATION detector, never a target.
 */
const MIN_FILES = 2500;

const PATTERN = /window\.\w*Store\b/;

const DIRS = ['packages'];

/**
 * Reproduces, one-for-one, the four negated globs the rg version passed:
 *   global-bridge.ts · global-bridge/ directory · *window-augment* · CommandManager.ts
 * These are the permitted transitional bridge files; every other file must inject
 * its stores via constructor rather than read them off `window`.
 */
function excluded(rel: string): boolean {
    if (rel === 'global-bridge.ts' || rel.endsWith('/global-bridge.ts')) return true;
    if (rel.includes('/global-bridge/') || rel.startsWith('global-bridge/')) return true;
    if (rel.includes('window-augment')) return true;
    if (rel === 'CommandManager.ts' || rel.endsWith('/CommandManager.ts')) return true;
    return false;
}

let SCANNED  = 0;
let EXCLUDED = 0;

/** Code-only reads — the number the ceiling and ratchet are evaluated against. */
function findMatches(): Match[] {
    const res = scanFilesStripped({
        root: REPO_ROOT, dirs: DIRS, pattern: PATTERN, minFiles: MIN_FILES,
        exclude: excluded, exts: EXTS, label: 'window-store-packages',
    });
    SCANNED  = res.filesScanned;
    EXCLUDED = res.filesExcluded;
    return distinctLines(res.matches);
}

/** Every mention, comments INCLUDED. Reported for context, never enforced on. */
function countMentions(): number {
    const res = scanFiles({
        root: REPO_ROOT, dirs: DIRS, pattern: PATTERN, minFiles: MIN_FILES,
        exclude: excluded, exts: EXTS, label: 'window-store-packages/mentions',
    });
    return distinctLines(res.matches).length;
}

/**
 * Print every offending site. The rg version printed a bare count and told the
 * reader to re-run an rg command — useless on a machine without rg.
 */
function listSites(matches: readonly Match[], limit = 40): void {
    for (const m of matches.slice(0, limit)) {
        console.error(`      ${m.file}:${m.line}  ${m.text.slice(0, 120)}`);
    }
    if (matches.length > limit) {
        console.error(`      … and ${matches.length - limit} more.`);
    }
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
    const matches  = findMatches();
    const current  = matches.length;
    const mentions = countMentions();
    const baseline = loadBaseline();

    // State the subject size AND both counts. The mention count is not enforced on,
    // but it must stay visible: raw and stripped straddle the ceiling here.
    console.log(
        `[window-store-packages] files scanned: ${SCANNED} (excluded ${EXCLUDED}, floor ${MIN_FILES}) · ` +
        `dir: packages · unit: matching lines`,
    );
    console.log(
        `[window-store-packages] reads in CODE: ${current} (enforced) · ` +
        `mentions incl. comments: ${mentions} (context only, ceiling ${CEILING})`,
    );

    if (current > CEILING) {
        console.error(
            `[window-store-packages] FAIL: ${current} window.xStore reads in packages/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: inject stores via constructor (Phase E.stores). ' +
            '  See docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5',
        );
        listSites(matches);
        // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — a shrink-only ceiling/baseline
        // was exceeded, so this is exit 3, not 1. Exit 1 is the code gate-debt.json may
        // absorb; a ledger entry declares that a gate FAILS, never that its count may GROW.
        return 3;
    }

    if (current > baseline) {
        console.error(
            `[window-store-packages] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(`  ${current - baseline} new window.xStore read(s) introduced in packages/.`);
        listSites(matches);
        // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — a shrink-only ceiling/baseline
        // was exceeded, so this is exit 3, not 1. Exit 1 is the code gate-debt.json may
        // absorb; a ledger entry declares that a gate FAILS, never that its count may GROW.
        return 3;
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
