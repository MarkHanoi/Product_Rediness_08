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
 *
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ─────────────────────────────
 * This gate used to shell out to:
 *
 *     rg -c "…" packages --type ts | awk -F: '{s+=$2} END {print s+0}'
 *     execSync(…, { shell: '/bin/bash' })
 *
 * THREE separate binaries that a stock Windows box does not have: `rg`, `awk`,
 * and `/bin/bash`. Measured BEFORE this port on the founder's Windows 11 machine:
 *
 *     Error: spawnSync /bin/bash ENOENT   → exit 1
 *
 * `count()` caught only `status === 1` (rg's "no matches") and rethrew otherwise —
 * but note how close this came to the WORSE failure: had the spawn produced status
 * 1 instead of a null status, this gate would have returned **0** and reported
 * "OK: 0 / 340", a perfect green from a scan that read nothing. That is exactly
 * what happened to check-motion-gate-coverage in this same wave.
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries).
 *
 * ─── Comment stripping: REQUIRED here ────────────────────────────────────────
 * `new CustomEvent` is a name this repo's migration JSDoc repeats constantly —
 * including in this very file's header. The rg version counted those mentions as
 * dispatch sites. The assertion is about DISPATCHES, i.e. code, so comments are
 * stripped via `scanFilesStripped`. Measured delta on the first real run:
 * 143 matching lines raw → **128** with comments removed. The 15-line difference
 * was pure documentation.
 *
 * ─── Counting unit ───────────────────────────────────────────────────────────
 * `rg -c` counts matching LINES, not occurrences, and awk summed those per-file
 * line counts. `distinctLines()` reproduces that unit exactly, so the number
 * remains comparable to the recorded baseline rather than silently switching to
 * an occurrence count (which would read 251, not 128, and trip the ratchet).
 *
 * ─── Scope: RESTATED, NOT NARROWED ───────────────────────────────────────────
 * rg scanned `packages` with `--type ts`. The port walks the same single `packages`
 * directory with the same four extensions rg's `ts` type covers
 * (.ts/.tsx/.mts/.cts). rg additionally honoured .gitignore, skipping node_modules
 * and dist; `DEFAULT_SKIP_DIRS` skips the same. No tree that rg read is unread here.
 *
 * Exit: 0 = at/under ceiling and baseline · 1 = over either · 2 = scan misconfigured
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/custom-event-packages.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.CUSTOMEVENT_CEILING ?? '340', 10);

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/**
 * ⚠ THE HONESTY FLOOR. `packages/` holds 3,711 TS files today. 2,500 catches a bad
 * cwd, a broken GA_GATE_REPO_ROOT or a vanished subject tree without being tripped
 * by ordinary churn. Below it `scanFilesStripped` exits 2 — NOT 0 and NOT 1. This
 * is a MISCONFIGURATION detector, never a coverage target: do not raise it to make
 * the gate green.
 */
const MIN_FILES = 2500;

const PATTERN = /window\.dispatchEvent|new CustomEvent/;

let SCANNED = 0;

function findMatches(): Match[] {
    const res = scanFilesStripped({
        root: REPO_ROOT,
        dirs: ['packages'],
        pattern: PATTERN,
        minFiles: MIN_FILES,
        exts: EXTS,
        label: 'custom-event-packages',
    });
    SCANNED = res.filesScanned;
    return distinctLines(res.matches);
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

/**
 * Print every offending site. The rg version printed a bare count and told the
 * reader to "run this rg yourself" — useless advice on a machine without rg, which
 * is every machine this gate actually failed on.
 */
function listSites(matches: readonly Match[], limit = 40): void {
    for (const m of matches.slice(0, limit)) {
        console.error(`      ${m.file}:${m.line}  ${m.text.slice(0, 120)}`);
    }
    if (matches.length > limit) {
        console.error(`      … and ${matches.length - limit} more.`);
    }
}

function main(): number {
    const matches  = findMatches();
    const current  = matches.length;
    const baseline = loadBaseline();

    // State the subject size, not just the verdict — a gate that reports only its
    // verdict cannot be distinguished from a gate that walked nothing.
    console.log(
        `[custom-event-packages] files scanned: ${SCANNED} (floor ${MIN_FILES}) · dir: packages · ` +
        `comments stripped · unit: matching lines`,
    );

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
        listSites(matches);
        // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — a shrink-only ceiling/baseline
        // was exceeded, so this is exit 3, not 1. Exit 1 is the code gate-debt.json may
        // absorb; a ledger entry declares that a gate FAILS, never that its count may GROW.
        return 3;
    }

    if (current > baseline) {
        console.error(
            `[custom-event-packages] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(`  ${current - baseline} new CustomEvent dispatch(es) introduced in packages/.`);
        listSites(matches);
        // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — a shrink-only ceiling/baseline
        // was exceeded, so this is exit 3, not 1. Exit 1 is the code gate-debt.json may
        // absorb; a ledger entry declares that a gate FAILS, never that its count may GROW.
        return 3;
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
