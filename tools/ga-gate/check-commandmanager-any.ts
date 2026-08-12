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
 * ─── Comment stripping: applied, and it changes NOTHING here ─────────────────
 * Comments are stripped for consistency with the rest of this wave, but the first
 * real run measured 25 matching lines BOTH with and without stripping. Unlike
 * `new CustomEvent`, the token `commandManager:\s*any` is a type annotation that
 * prose does not naturally reproduce. Recorded so a future reader does not assume
 * the stripping is what moved a number here — it did not.
 *
 * ─── Counting unit ───────────────────────────────────────────────────────────
 * `rg -c` counted matching LINES, summed by awk. `distinctLines()` reproduces
 * that unit exactly (occurrences also happen to be 25 — one per line).
 *
 * ─── Scope: RESTATED, NOT NARROWED ───────────────────────────────────────────
 * rg scanned `packages` with `--type ts` minus one negated glob for any file named
 * CommandManager.ts at any depth. The port walks the same single `packages`
 * directory with the same four extensions, and reproduces that one glob as the
 * `excluded()` predicate below.
 *
 * Exit: 0 = at/under ceiling and baseline · 1 = over either · 2 = scan misconfigured
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/commandmanager-any.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.CMDMGR_ANY_CEILING ?? '25', 10);

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/**
 * ⚠ THE HONESTY FLOOR. `packages/` holds 3,711 TS files today; 2,500 catches a bad
 * cwd or a vanished subject tree without tripping on churn. Below it the scan
 * exits 2 — NOT 0 and NOT 1. A MISCONFIGURATION detector, never a target.
 */
const MIN_FILES = 2500;

const PATTERN = /commandManager:\s*any\b/;

// Reproduces rg's negated glob for a file named CommandManager.ts at any depth.
// (Written as a line comment, not JSDoc: the glob's literal text contains the
// block-comment terminator, which silently truncated this file's header once.)
function excluded(rel: string): boolean {
    return rel === 'CommandManager.ts' || rel.endsWith('/CommandManager.ts');
}

let SCANNED = 0;

function findMatches(): Match[] {
    const res = scanFilesStripped({
        root: REPO_ROOT,
        dirs: ['packages'],
        pattern: PATTERN,
        minFiles: MIN_FILES,
        exclude: excluded,
        exts: EXTS,
        label: 'commandmanager-any',
    });
    SCANNED = res.filesScanned;
    return distinctLines(res.matches);
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
    const matches  = findMatches();
    const current  = matches.length;
    const baseline = loadBaseline();

    // State the subject size, not just the verdict — a gate that reports only its
    // verdict cannot be distinguished from a gate that walked nothing.
    console.log(
        `[commandmanager-any] files scanned: ${SCANNED} (floor ${MIN_FILES}) · dir: packages · ` +
        `comments stripped · unit: matching lines`,
    );

    if (current > CEILING) {
        console.error(
            `[commandmanager-any] FAIL: ${current} commandManager: any params in packages/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: replace commandManager: any with bus: CommandBus (Phase E.types). ' +
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
            `[commandmanager-any] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(`  ${current - baseline} new commandManager: any typed param(s) introduced in packages/.`);
        listSites(matches);
        // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — a shrink-only ceiling/baseline
        // was exceeded, so this is exit 3, not 1. Exit 1 is the code gate-debt.json may
        // absorb; a ledger entry declares that a gate FAILS, never that its count may GROW.
        return 3;
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
