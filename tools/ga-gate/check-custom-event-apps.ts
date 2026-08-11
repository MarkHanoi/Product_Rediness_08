#!/usr/bin/env tsx
/**
 * Gate G-NEW-04: No window.dispatchEvent(new CustomEvent(...)) from apps/editor/src/.
 *
 * Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §4 Gate P0-G4
 * OI-050 (Phase F.events.2 — apps-tier migration)
 *
 * Ratchet direction: downward — hard-fail on any increase above baseline.
 * Hard ceiling: controlled via CUSTOMEVENT_APPS_CEILING env var.
 *
 * Baseline 2026-05-16: 297 sites in apps/editor/src/
 * Target trajectory (Phase F.events):
 *   F.events.0 (gate established)                     : 297 (this commit — baseline set)
 *   F.events.1 (EventBus package + runtime.events wiring) : 297 (structural — no site reduction yet)
 *   F.events.2a (first migration wave — engine/ core) : ~220
 *   F.events.2b (second wave — ui/ panels)            : ~120
 *   F.events.2c (third wave — remaining sites)        : 0
 *
 * Replacement API: runtime.events.emit(eventName, payload)
 *   Example: window.dispatchEvent(new CustomEvent('pryzm-wall-created', { detail }))
 *         →  runtime.events.emit('wall.created', detail)
 *   TypeMap: PryzmRuntimeEvents in packages/runtime-composer/src/types.ts
 *
 * NOTE: Packages-tier scan (packages/) is handled by check-custom-event-packages.ts (gate #17).
 * This gate covers apps/editor/src/ only — the highest-traffic mutation tier.
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
 * The assertion is about DISPATCHES, i.e. code. `new CustomEvent` appears in
 * migration JSDoc throughout this tier — including in this file's own header.
 * Measured on the first real run: 32 matching lines raw → **26** with comments
 * removed; the 6-line difference was documentation.
 *
 * ─── Counting unit ───────────────────────────────────────────────────────────
 * `rg -c` counted matching LINES and awk summed them per file. `distinctLines()`
 * reproduces that unit, keeping the number comparable to the recorded baseline.
 *
 * ─── Scope: RESTATED, NOT NARROWED ───────────────────────────────────────────
 * rg scanned `apps/editor/src` with `--type ts`; the port walks that same single
 * directory with the same four extensions (.ts/.tsx/.mts/.cts), skipping the same
 * node_modules/dist trees rg skipped via .gitignore.
 *
 * Exit: 0 = at/under ceiling and baseline · 1 = over either · 2 = scan misconfigured
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';

const REPO_ROOT     = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/custom-event-apps.json');
const NO_RATCHET    = process.argv.includes('--no-ratchet');
const CEILING       = parseInt(process.env.CUSTOMEVENT_APPS_CEILING ?? '300', 10);

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

/**
 * ⚠ THE HONESTY FLOOR. `apps/editor/src` holds 1,043 TS files today. 700 catches a
 * bad cwd or a vanished subject tree without tripping on ordinary churn. Below it
 * the scan exits 2 — NOT 0 and NOT 1. A MISCONFIGURATION detector, never a target.
 */
const MIN_FILES = 700;

const PATTERN = /window\.dispatchEvent|new CustomEvent/;

let SCANNED = 0;

function findMatches(): Match[] {
    const res = scanFilesStripped({
        root: REPO_ROOT,
        dirs: ['apps/editor/src'],
        pattern: PATTERN,
        minFiles: MIN_FILES,
        exts: EXTS,
        label: 'custom-event-apps',
    });
    SCANNED = res.filesScanned;
    return distinctLines(res.matches);
}

/**
 * Print every offending site. The rg version printed a bare count and told the
 * reader to re-run an rg command — useless on a machine without rg, which is
 * every machine this gate actually failed on.
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
                    'G-NEW-04: CustomEvent dispatches in apps/editor/src/. ' +
                    'Target: 0 (Phase F.events.2c). ' +
                    'Use CUSTOMEVENT_APPS_CEILING env var to step ceiling down per sprint. ' +
                    'Replace with runtime.events.emit() — see PryzmRuntimeEvents in ' +
                    'packages/runtime-composer/src/types.ts.',
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
        `[custom-event-apps] files scanned: ${SCANNED} (floor ${MIN_FILES}) · dir: apps/editor/src · ` +
        `comments stripped · unit: matching lines`,
    );

    if (current > CEILING) {
        console.error(
            `[custom-event-apps] FAIL: ${current} CustomEvent dispatches in apps/editor/src/` +
            ` exceeds CEILING ${CEILING}.`,
        );
        console.error(
            '  Fix: replace window.dispatchEvent(new CustomEvent(...)) with ' +
            'runtime.events.emit(eventName, payload) (Phase F.events.2). ' +
            'See docs/archive/pryzm3-internal/PRYZM3-MASTER-STATUS-2026-05-29-ARCHIVED.md §14 item 5.',
        );
        listSites(matches);
        return 1;
    }

    if (current > baseline) {
        console.error(
            `[custom-event-apps] FAIL (ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(`  ${current - baseline} new CustomEvent dispatch(es) introduced in apps/editor/src/.`);
        console.error('  Replace with runtime.events.emit() — see PryzmRuntimeEvents type map.');
        listSites(matches);
        return 1;
    }

    if (current < baseline) {
        if (NO_RATCHET) {
            console.log(`[custom-event-apps] OK: ${current} (would ratchet ${baseline} → ${current}; --no-ratchet).`);
        } else {
            writeBaseline(current);
            console.log(`[custom-event-apps] OK: ${current} (ratchet lowered ${baseline} → ${current}).`);
        }
    } else {
        console.log(`[custom-event-apps] OK: ${current} / ${CEILING}`);
    }
    return 0;
}

process.exit(main());
