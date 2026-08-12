#!/usr/bin/env tsx
/**
 * Gate G-NEW-05: structuredClone undo snapshots in packages/command-registry/
 * must not increase above the baseline.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §4 Gate P0-G5
 * OI-050
 *
 * New commands MUST use `produceWithPatches` (Immer) for undo, NOT `structuredClone`.
 * The existing 144 uses are all in the legacy CommandManager.ts path; they are
 * eliminated one-by-one as Phase E.undo migrates each command class to a handler.
 *
 * Ratchet direction: downward — hard-fail on any increase above CEILING.
 * The gate specifically guards against NEW commands being written with structuredClone.
 *
 * Exclusions: CommandManager.ts (contains the existing legacy snapshot implementations).
 *
 * Baseline 2026-05-16: 144 sites (excluding CommandManager.ts)
 * Target: 0 (Phase E.undo completes)
 *
 * IMPORTANT: If you are writing a new command handler, use produceWithPatches:
 *   const [, patches, inverse] = produceWithPatches(store.getAll(), draft => { ... });
 *   ctx.undoStack.push({ forward: patches, inverse, affectedStores: ['xStore'] });
 *
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ─────────────────────────────
 * This gate used to shell out to `rg … | awk …` under `shell: '/bin/bash'` —
 * three binaries absent from a stock Windows box. Measured BEFORE this port:
 *
 *     Error: spawnSync /bin/bash ENOENT   → exit 1
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries).
 *
 * ─── ⚠ COMMENT STRIPPING FLIPS THIS GATE'S VERDICT — READ THIS ───────────────
 * This is the one gate in the L-811 wave where removing comments changes PASS/FAIL,
 * so the choice is documented rather than buried, and the gate PRINTS BOTH NUMBERS
 * on every run.
 *
 *   mentions of `structuredClone` on any line : 188   ← would EXCEED ceiling 157
 *   uses in code, comments removed            : 119   ← under ceiling 157
 *
 * The 69-line difference is documentation: this subsystem's handlers carry JSDoc
 * that says, in so many words, "use produceWithPatches, NOT structuredClone".
 * The gate's own header does it three times.
 *
 * The assertion — "new commands MUST use produceWithPatches for undo, NOT
 * structuredClone" — is about CODE. A comment instructing the reader not to call
 * structuredClone is not a call to structuredClone. Counting it as one measured
 * documentation and would have made the gate fail HARDER the more thoroughly the
 * migration was explained. Stripping is therefore the CORRECT measurement, not a
 * weakening of the assertion to reach green.
 *
 * That said, 188 mentions against a 157 ceiling is a real signal about how large
 * this backlog still is, so the mention count is reported on every run and must
 * not be deleted from the output.
 *
 * ─── The `CommandManager.ts` exclusion is DEAD ───────────────────────────────
 * rg passed `--glob` excluding any file named CommandManager.ts. Measured
 * 2026-08-11: that file does not exist anywhere under packages/, plugins/, apps/
 * or src/ — the legacy class is gone. The exclusion is reproduced below anyway
 * (it costs nothing and removing it would be a silent scope CHANGE), but it
 * currently excludes zero files, and the header's "the existing 144 uses are all
 * in the legacy CommandManager.ts path" is stale.
 *
 * ─── Counting unit ───────────────────────────────────────────────────────────
 * `rg -c` counted matching LINES, summed by awk. `distinctLines()` reproduces it.
 *
 * ─── Scope: RESTATED, NOT NARROWED ───────────────────────────────────────────
 * rg scanned `packages/command-registry/src` with `--type ts`. The port walks that
 * same single directory with the same four extensions (.ts/.tsx/.mts/.cts).
 *
 * Exit: 0 = at/under ceiling and baseline · 1 = over either · 2 = scan misconfigured
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanFiles, scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/structuredclone-commands.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.STRUCTUREDCLONE_CEILING ?? '157', 10);

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/**
 * ⚠ THE HONESTY FLOOR. `packages/command-registry/src` holds 309 TS files today.
 * 200 catches a bad cwd or a vanished/renamed subject package without tripping on
 * ordinary churn. Below it the scan exits 2 — NOT 0 and NOT 1. This is the floor
 * that matters most for THIS gate: its subject is a single package directory, so a
 * rename would otherwise silently produce a perfect "0 uses" green.
 */
const MIN_FILES = 200;

const PATTERN = /structuredClone/;

// Reproduces rg's negated glob for a file named CommandManager.ts at any depth.
// Currently matches nothing — see "The CommandManager.ts exclusion is DEAD" above.
function excluded(rel: string): boolean {
    return rel === 'CommandManager.ts' || rel.endsWith('/CommandManager.ts');
}

const DIRS = ['packages/command-registry/src'];

let SCANNED = 0;

/** Code-only uses — the number the ceiling and ratchet are evaluated against. */
function findMatches(): Match[] {
    const res = scanFilesStripped({
        root: REPO_ROOT, dirs: DIRS, pattern: PATTERN, minFiles: MIN_FILES,
        exclude: excluded, exts: EXTS, label: 'structuredclone-commands',
    });
    SCANNED = res.filesScanned;
    return distinctLines(res.matches);
}

/** Every mention, comments INCLUDED. Reported for context, never enforced on. */
function countMentions(): number {
    const res = scanFiles({
        root: REPO_ROOT, dirs: DIRS, pattern: PATTERN, minFiles: MIN_FILES,
        exclude: excluded, exts: EXTS, label: 'structuredclone-commands/mentions',
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
                    'G-NEW-05: structuredClone uses in packages/command-registry/ (excl CommandManager.ts). ' +
                    'Target: 0 (Phase E.undo). ' +
                    'New commands must use produceWithPatches — structuredClone undo PROHIBITED for new code. ' +
                    'Use STRUCTUREDCLONE_CEILING env var to step ceiling down per sprint.',
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
    // but it must stay visible: it is 69 lines higher than the enforced number, and
    // a reader who sees only "119" cannot tell that stripping is load-bearing here.
    console.log(
        `[structuredclone-commands] files scanned: ${SCANNED} (floor ${MIN_FILES}) · ` +
        `dir: ${DIRS[0]} · unit: matching lines`,
    );
    console.log(
        `[structuredclone-commands] uses in CODE: ${current} (enforced) · ` +
        `mentions incl. comments: ${mentions} (context only, ceiling ${CEILING})`,
    );

    if (current > CEILING) {
        console.error(
            `[structuredclone-commands] FAIL: ${current} structuredClone uses in command-registry/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: new commands must use produceWithPatches (Immer) for undo snapshots. ' +
            'See docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5 Phase E.undo',
        );
        listSites(matches);
        // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — a shrink-only ceiling/baseline
        // was exceeded, so this is exit 3, not 1. Exit 1 is the code gate-debt.json may
        // absorb; a ledger entry declares that a gate FAILS, never that its count may GROW.
        return 3;
    }

    if (current > baseline) {
        console.error(
            `[structuredclone-commands] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(
            `  ${current - baseline} new structuredClone use(s) added to command-registry/ — PROHIBITED.`,
        );
        console.error(
            '  New command handlers must use produceWithPatches, not structuredClone.',
        );
        listSites(matches);
        // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — a shrink-only ceiling/baseline
        // was exceeded, so this is exit 3, not 1. Exit 1 is the code gate-debt.json may
        // absorb; a ledger entry declares that a gate FAILS, never that its count may GROW.
        return 3;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(`[structuredclone-commands] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
        } else {
            writeBaseline(current);
            console.log(`[structuredclone-commands] OK: ${current} (ratchet lowered ${baseline} → ${current}).`);
        }
    } else {
        console.log(`[structuredclone-commands] OK: ${current} / ${CEILING}`);
    }
    return 0;
}

process.exit(main());
