#!/usr/bin/env tsx
/**
 * GA Gate: check-project-isolation
 *
 * Wave 35 I-7 — Static analysis gate (no browser required).
 * Verifies that all four structural anchors of the C13 project-isolation
 * fix are present in the codebase.  Any missing anchor is a hard FAIL.
 *
 * Gates:
 *   1. `BatchCoordinator.forceReset` — public method exists
 *   2. `forceReset()` called from ProjectLifecycleController (C13 §4 step 1)
 *   3. `__engineTeardown` declared in global-window.d.ts
 *   4. `resetWallRebuildState()` called from ProjectLifecycleController (step 2)
 *
 * Exit 0 → all gates green.
 * Exit 1 → an anchor is genuinely missing (HARD FAIL — merge blocked).
 * Exit 2 → the gate could not establish its own subject (MISCONFIGURED).
 *
 * Contract: C13 §4, Wave 35 §3.7
 *
 * ─── 2026-08-11 · §FIX-ISOLATION-GATE-BLIND (L-827) ──────────────────────────
 *
 * WHAT WAS WRONG. This gate reported **0 hits for all four anchors** — and had
 * done so on every Windows run — while all four anchors were in fact PRESENT in
 * source (measured: 33 · 3 · 1 · 1). It was not measuring the codebase at all.
 *
 * The mechanism, reproduced and confirmed rather than assumed:
 *
 *     execSync(`grep -c "${pat}" "${file}" 2>/dev/null || echo 0`)
 *
 * `execSync` on win32 runs its command under **cmd.exe** (`process.env.ComSpec`),
 * not a POSIX shell. Under cmd.exe `2>/dev/null` is a redirect to a path that
 * does not exist, so the whole command fails with "The system cannot find the
 * path specified", `|| echo 0` fires, and the gate reads a literal `0`.
 *
 * It did not throw. That is the important part. A crash would have been honest.
 * Instead the gate returned a well-formed number that looked like a measurement,
 * and `parseInt('0') || 0` turned "I could not run" into "I looked, and found
 * nothing". MISSING PREREQUISITE and REAL VIOLATION produced the same observable
 * value — §CONTEXT-DATA-HONESTY applied to CI itself.
 *
 * WHY NOBODY NOTICED. `check-project-isolation.ts` sits on `gate-debt.json`. Its
 * permanent red was absorbed as declared debt, so the ledger asserted "C13
 * isolation is known-broken" when the truth was "C13 isolation is intact and
 * unmeasured". A ledgered gate hides its own blindness: the one state nobody
 * investigates is the one they already expect.
 *
 * This is the exact shape of L-811 (§FIX-GATE-NEEDS-RIPGREP), where P2 turned
 * out to have been clean the whole time and no one could see it. Same lesson,
 * second occurrence, different shell builtin.
 *
 * THE FIX. Three changes, each closing one part of the failure:
 *
 *   1. **No shell, ever.** `node:fs` only. A gate's prerequisites must be the
 *      same `pnpm install` everything else needs — no grep, no rg, no awk, no
 *      cmd-vs-bash difference between a developer's box and the CI runner.
 *
 *   2. **A missing subject is exit 2, not zero hits.** If an anchor's file does
 *      not exist, the gate CANNOT ESTABLISH ITS SUBJECT. That is a different
 *      fact from "the anchor was removed", and conflating them is what let this
 *      sit undetected. Exit 2 is deliberately not 1: exit 1 is absorbable as
 *      declared debt, exit 2 never is. Mirrors `lib/sourceScan.ts`'s minFiles
 *      floor and `check-no-direct-store-writes.ts`'s MIN_FILES.
 *
 *   3. **Prose is not compliance.** Counts are taken AFTER `stripComments()`, so
 *      a doc comment that merely mentions `forceReset` cannot satisfy the gate.
 *      This is the §RAF-GATE-COMMENT-BLIND lesson (2026-08-10), where four of
 *      five "rAF owners" turned out to be comment lines — three of them doc
 *      comments asserting P3 compliance. A gate that counts sentences measures
 *      documentation, not code.
 *
 * The thresholds below were NOT adjusted to make this pass. They are the
 * original minHits from the pre-2026-08-11 file; the only reason they now
 * evaluate is that the gate can finally read the source.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { stripComments } from './lib/writeRouteScan';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

interface Gate {
    readonly label:   string;
    readonly file:    string;
    /** Matched against comment-stripped source. */
    readonly pattern: RegExp;
    readonly minHits: number;
}

const GATES: readonly Gate[] = [
    {
        // P9-W4 (2026-05-10): BatchCoordinator.ts moved from
        // src/engine/subsystems/core/batch/ to packages/core-app-model/src/batch/.
        // The src/ file is now a re-export stub with no method bodies.
        // Gate checks the canonical implementation location.
        label:   'Gate 1 — BatchCoordinator.forceReset() exists',
        file:    'packages/core-app-model/src/batch/BatchCoordinator.ts',
        pattern: /\bforceReset\b/g,
        minHits: 2,
    },
    {
        // After Task 5.2 refactor the project-switch teardown was extracted
        // into ProjectLifecycleController (packages/runtime-composer/).
        // Gate 2 verifies forceReset() is called there (Step 1 of C13 §4).
        label:   'Gate 2 — ProjectLifecycleController calls forceReset() (C13 §4 step 1)',
        file:    'packages/runtime-composer/src/ProjectLifecycleController.ts',
        pattern: /\bforceReset\b/g,
        minHits: 1,
    },
    {
        label:   'Gate 3 — __engineTeardown declared in global-window.d.ts',
        file:    'src/global-window.d.ts',
        pattern: /\b__engineTeardown\b/g,
        minHits: 1,
    },
    {
        // After Task 5.2 refactor resetWallRebuildState() is called from
        // ProjectLifecycleController (Step 2 of C13 §4 teardown).
        label:   'Gate 4 — ProjectLifecycleController calls resetWallRebuildState() (C13 §4 step 2)',
        file:    'packages/runtime-composer/src/ProjectLifecycleController.ts',
        pattern: /\bresetWallRebuildState\b/g,
        minHits: 1,
    },
];

/** Count non-overlapping matches in comment-stripped source. */
function countInCode(source: string, pattern: RegExp): number {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let n = 0;
    while (re.exec(source) !== null) n++;
    return n;
}

/**
 * §R5-FLOOR (2026-08-11) — the DECLARED size of the subject.
 *
 * The existence check below is the strong half of the floor idiom and was already
 * here; the missing half was a declared count. Nothing stopped this gate from
 * shrinking to one anchor — or to none — and still printing "All anchors present
 * ✅" and exiting 0. A gate whose subject list can be emptied is a gate that can
 * be satisfied by deletion, which is how C13 coverage would silently evaporate.
 *
 * C13 §4 names FOUR anchors. Below four, this gate has stopped being the C13 gate
 * and exits 2 (MISCONFIGURED) rather than reporting a pass over a shrunken claim.
 */
const MIN_SUBJECT_ANCHORS = 4;
if (GATES.length < MIN_SUBJECT_ANCHORS) {
    console.error(
        `\n[project-isolation] MISCONFIGURED (exit 2) — ${GATES.length} anchor(s) declared; C13 §4 requires ${MIN_SUBJECT_ANCHORS}.`
        + `\n  Anchors were removed from this gate rather than satisfied in the code. A gate that can be`
        + `\n  made green by deleting its own subject measures nothing. This is NOT a pass.`,
    );
    process.exit(2);
}

// ── Subject establishment — BEFORE any judging ───────────────────────────────
// Every anchor file must exist. A gate that cannot read its subject must not be
// able to report either a pass OR an ordinary failure.
const missing = [...new Set(GATES.map(g => g.file))].filter(f => !existsSync(path.join(ROOT, f)));
if (missing.length > 0) {
    console.error(
        `\n[project-isolation] MISCONFIGURED (exit 2) — ${missing.length} anchor file(s) could not be read:\n` +
        missing.map(f => `      • ${f}`).join('\n') +
        `\n  Root: ${ROOT}\n` +
        `  This is NOT a failure of C13 and NOT a pass. The gate could not establish its\n` +
        `  subject, so it has measured nothing. If a file legitimately moved, update its\n` +
        `  path above — do NOT let a missing subject read as "the anchor is gone".`,
    );
    process.exit(2);
}

let allPassed = true;

for (const gate of GATES) {
    const abs = path.join(ROOT, gate.file);
    const raw = readFileSync(abs, 'utf8');
    const code = stripComments(raw);

    const hits     = countInCode(code, gate.pattern);
    const rawHits  = countInCode(raw,  gate.pattern);
    const inProse  = rawHits - hits;

    // Prose is reported, never counted. Surfacing the gap is what makes a future
    // "the code went away but the doc comment stayed" visible instead of silent.
    const proseNote = inProse > 0 ? `  [${inProse} further mention(s) in comments — NOT counted]` : '';

    if (hits >= gate.minHits) {
        console.log(`[project-isolation] ✅ ${gate.label} (${hits} code hit(s))${proseNote}`);
    } else {
        console.error(
            `[project-isolation] ❌ FAIL: ${gate.label} — expected ≥ ${gate.minHits} code hit(s), got ${hits}${proseNote}`,
        );
        console.error(`   File: ${gate.file}`);
        console.error(`   Pattern: ${gate.pattern}`);
        if (inProse > 0) {
            console.error(
                `   NOTE: the identifier appears ${inProse} time(s) in COMMENTS in this file. ` +
                `A doc comment asserting compliance is not compliance.`,
            );
        }
        allPassed = false;
    }
}

if (allPassed) {
    console.log('\n[project-isolation] All 4 anchors present in code. ✅');
    process.exit(0);
} else {
    console.error('\n[project-isolation] One or more anchors missing. Fix the above before merging.');
    process.exit(1);
}
