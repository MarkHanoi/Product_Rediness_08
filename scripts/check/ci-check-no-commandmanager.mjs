#!/usr/bin/env node
/**
 * scripts/ci-check-no-commandmanager.mjs
 *
 * Phase 3 exit-gate — CI ratchet for commandManager.execute() calls.
 *
 * Contract reference: §P3 (IMPL-PLAN-2026-05-17 §6)
 * Architecture authority: C14 §3 (legacy elimination milestone), P6 (commands
 * are the ONLY mutation path — migrated to typed bus handlers, not direct
 * commandManager calls from packages/ or plugins/).
 *
 * ─── What this gate enforces ────────────────────────────────────────────────
 *
 * After Phase 3 complete, commandManager.execute() must not appear as an
 * ACTUAL CALL (non-comment, non-JSDoc line) in:
 *   packages/   (shared libraries — L1/L2 layer)
 *   plugins/    (feature plugins — L7 layer)
 *
 * These layers must drive mutations exclusively through the typed command bus
 * (runtime.bus.executeCommand / commandBus.dispatch). Direct commandManager
 * calls are only permitted in:
 *   apps/editor/src/engine/initBusHandlers.ts  — legacy bridge scaffolding
 *   (apps/ is L5; excluded from this gate's scan paths)
 *
 * ─── Comment exclusion ───────────────────────────────────────────────────────
 *
 * Lines that match the pattern but are pure comments or JSDoc are excluded.
 * Specifically, lines where the first non-whitespace characters are:
 *   '//'   C-style comment
 *   '*'    JSDoc block interior line
 *
 * Additionally, lines where the pattern appears only after a '//' inline
 * comment are excluded (e.g. "someCode(); // commandManager.execute() docs").
 *
 * ─── Ratchet ────────────────────────────────────────────────────────────────
 *
 * The gate is a ratchet: it fails if the non-comment count exceeds the
 * threshold.  Lower the threshold at each Phase 3 batch completion:
 *
 *   Phase 3 Batches 3.1-3.6 first pass (2026-05-18): baseline = 56
 *   Batch 3.1 re-pass  => threshold <= 46  (walls, slabs, doors, windows)
 *   Batch 3.2 complete => threshold <= 36  (floors, ceilings, roofs)
 *   Batch 3.3 complete => threshold <= 24  (stairs/handrails/columns/beams)
 *   Batch 3.4 complete => threshold <= 14  (grids/openings)
 *   Batch 3.5 complete => threshold <=  5  (furniture/plumbing)
 *   Batch 3.6 complete => threshold =   0  (hard-fail — zero tolerance)
 *
 * ─── Usage ──────────────────────────────────────────────────────────────────
 *
 *   node scripts/ci-check-no-commandmanager.mjs
 *   CM_EXECUTE_THRESHOLD=46 node scripts/ci-check-no-commandmanager.mjs
 *   npm run check:commandmanager
 *
 * Exit codes:
 *   0 — OK (count <= threshold)
 *   1 — REGRESSION (count > threshold)
 *   2 — Internal error (grep unavailable, scan failed)
 */

import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Ratchet ceiling.  Lower this at each Phase 3 batch completion.
 * Default 55 = actual non-comment call count after §TASK-07-PHASE-B:
 *   UpdateWallDimensionsHandler migrated from commandManager bridge to produceCommand
 *   (2026-05-18). Prior value: 56.
 */
const THRESHOLD = parseInt(process.env.CM_EXECUTE_THRESHOLD ?? '55', 10);

/**
 * Directories to scan.  Intentionally excludes apps/ because
 * initBusHandlers.ts bridge scaffolding in apps/ is permitted transitional code.
 */
const SCAN_DIRS = ['packages', 'plugins'];

// ─── Scan ─────────────────────────────────────────────────────────────────────

/**
 * Returns all non-comment TypeScript source lines in SCAN_DIRS that contain
 * the literal text 'commandManager.execute'.
 *
 * A line is a comment if, after stripping leading whitespace, it begins
 * with '//' or '*'.  Lines where the pattern appears only after an inline
 * '//' comment are also excluded.
 *
 * @returns {{ file: string, lineNo: number, text: string }[]}
 */
function findViolations() {
    const violations = [];

    for (const dir of SCAN_DIRS) {
        const absDir = resolve(ROOT, dir);
        if (!existsSync(absDir)) continue;

        // Build grep argument list — no shell interpolation needed.
        const grepArgs = [
            '-rn',
            '--include=*.ts',
            '--include=*.tsx',
            '--exclude=*.d.ts',
            '--exclude-dir=dist',
            '--exclude-dir=node_modules',
            'commandManager\\.execute',
            absDir,
        ];

        const result = spawnSync('grep', grepArgs, {
            encoding: 'utf8',
            maxBuffer: 32 * 1024 * 1024,
            cwd: ROOT,
        });

        if (result.error) {
            if (result.error.code === 'ENOENT') {
                console.error('[ci-check-no-commandmanager] FATAL — grep not found in PATH');
                process.exit(2);
            }
            throw result.error;
        }

        // grep exits 1 when there are no matches — that is not an error.
        if (result.status !== 0 && result.status !== 1) {
            console.error('[ci-check-no-commandmanager] grep failed:', result.stderr);
            process.exit(2);
        }

        const rawOutput = result.stdout || '';

        for (const rawLine of rawOutput.split('\n')) {
            if (!rawLine) continue;

            // grep -n format: /path/to/file.ts:42:    code here
            // Find first two colons to split path : lineNo : text.
            const firstColon = rawLine.indexOf(':');
            if (firstColon < 0) continue;
            const secondColon = rawLine.indexOf(':', firstColon + 1);
            if (secondColon < 0) continue;

            const filePath = rawLine.slice(0, firstColon);
            const lineNo   = parseInt(rawLine.slice(firstColon + 1, secondColon), 10);
            const text     = rawLine.slice(secondColon + 1);

            // Exclude pure-comment lines (first non-whitespace is '//' or '*').
            const trimmed = text.trimStart();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

            // Exclude lines where the pattern appears only after an inline comment.
            const inlineCommentIdx = text.indexOf('//');
            const codeSection = inlineCommentIdx >= 0
                ? text.slice(0, inlineCommentIdx)
                : text;
            if (!codeSection.includes('commandManager.execute')) continue;

            const relPath = relative(ROOT, filePath);
            violations.push({ file: relPath, lineNo, text });
        }
    }

    return violations;
}

// ─── Group by file ────────────────────────────────────────────────────────────

function groupByFile(violations) {
    const map = new Map();
    for (const v of violations) {
        if (!map.has(v.file)) map.set(v.file, []);
        map.get(v.file).push(v);
    }
    return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const BANNER = '-'.repeat(66);

console.log('');
console.log(BANNER);
console.log('  CI gate: commandManager.execute() -- Phase 3 exit ratchet');
console.log('  Contract: P3 / C14 s3 / IMPL-PLAN-2026-05-17 s6');
console.log(BANNER);
console.log('  Scanning: ' + SCAN_DIRS.join(', '));
console.log('  Threshold (CM_EXECUTE_THRESHOLD): ' + THRESHOLD);
console.log('');

let violations;
try {
    violations = findViolations();
} catch (err) {
    console.error('[ci-check-no-commandmanager] FATAL -- scan failed:', err);
    process.exit(2);
}

const byFile = groupByFile(violations);
const count  = violations.length;

// Print violation list, sorted by per-file count descending.
if (byFile.size > 0) {
    console.log('  commandManager.execute() call sites (non-comment):');
    console.log('');
    const sorted = [...byFile.entries()].sort(([, a], [, b]) => b.length - a.length);
    for (const [file, lines] of sorted) {
        console.log('    [' + lines.length + ']  ' + file);
        for (const { lineNo, text } of lines) {
            const snippet = text.trim().slice(0, 90);
            console.log('         L' + lineNo + ': ' + snippet);
        }
    }
    console.log('');
}

console.log(BANNER);
console.log('  Non-comment call count:  ' + count);
console.log('  Threshold:               ' + THRESHOLD);

if (count <= THRESHOLD) {
    const delta = THRESHOLD - count;
    console.log('');
    console.log('  PASS -- count ' + count + ' <= threshold ' + THRESHOLD);
    if (count === 0) {
        console.log('  Phase 3 exit condition FULLY MET (C14 s3 / zero violations).');
    } else {
        console.log('  ' + delta + ' headroom remaining.');
        console.log('  Lower CM_EXECUTE_THRESHOLD to lock in further progress.');
    }
    console.log(BANNER);
    console.log('');
    process.exit(0);
} else {
    const excess = count - THRESHOLD;
    console.log('');
    console.log('  FAIL -- count ' + count + ' exceeds threshold ' + THRESHOLD + ' (+' + excess + ')');
    console.log('');
    console.log('  To resolve:');
    console.log('    1. Migrate each violating call to runtime.bus.executeCommand(...).');
    console.log('    2. Do NOT raise the threshold -- only lower it.');
    console.log('');
    console.log('  Reference: IMPL-PLAN-2026-05-17.md s6 / C14 s3 / P6');
    console.log(BANNER);
    console.log('');
    process.exit(1);
}
