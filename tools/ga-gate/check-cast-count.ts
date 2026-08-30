#!/usr/bin/env tsx
/**
 * Wave 1 task 2 — `(window as any)` cast-count tripwire (monotonic ratchet).
 *
 * Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/02-WAVE-1-TRIPWIRES.md §3
 * Anchor: docs/01-strategy/STR-03-engineering-vision.md (P4 — No `(window as any)`);
 *         docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/09-WAVE-5-CAST-DELETION.md
 *
 * Hard-fail if reach count across src/ rises above the baseline.
 * Auto-ratchets the baseline DOWN when count drops (one-way ratchet).
 * Baseline file: .ga-gate/baselines/cast-count.json
 *
 * --ratchet     : OPT IN to auto-lowering the baseline on a drop. Without it the
 *                 gate only ever READS the baseline file. See §FIX-RATCHET-IS-
 *                 OPT-IN below for why the default was inverted.
 * --no-ratchet  : accepted and now redundant (no-write is the default). Kept so
 *                 existing invocations keep working; it hard-overrides --ratchet.
 */
// ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-09 ─────────────────────────────
// This gate used to run `rg -c … | awk -F: '{s+=$2}'` through execSync. TWO
// failures stacked:
//   • `rg` is not a declared dependency and CI never installed it, so the gate
//     died with `Error: spawnSync rg ENOENT` and P4 was enforced by nothing.
//   • `awk` does not exist outside a POSIX shell, so even WITH ripgrep the
//     pipeline returned garbage on win32.
// Because the gate was also listed in `gate-debt.json`, the crash was absorbed as
// "known failing" — MISSING PREREQUISITE and REGRESSION looked identical.
// Rewritten on `lib/sourceScan.ts`: Node only, no external binaries.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { scanFiles, scanFilesStripped, tallyBy } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const BASELINE_FILE = resolve(REPO_ROOT, '.ga-gate/baselines/cast-count.json');
/**
 * §FIX-RATCHET-IS-OPT-IN (W3a, 2026-08-30) — THE DEFAULT WAS INVERTED.
 *
 * This gate WRITES a git-tracked file (`.ga-gate/baselines/cast-count.json`)
 * whenever `current < baseline`, and it did so by DEFAULT — `--no-ratchet` was
 * the opt-OUT. So any developer who ran the gate to *read* a number moved a
 * ceiling as a side effect, and the move landed in their working tree to be
 * swept up by the next `git add -A`. A measurement instrument that mutates the
 * thing it measures unless you remember a flag is not an instrument.
 *
 * Two concrete ways that bites, both of them silent:
 *   • a scan that under-reports (a `minFiles` floor is a floor, not a proof)
 *     ratchets the ceiling DOWN to the wrong number, and the next honest run
 *     then reports a REGRESSION that never happened;
 *   • the baseline file carries a long hand-written `comment` recording WHAT
 *     PAID the last ratchet. The auto-writer overwrites it with boilerplate, so
 *     an incidental local run destroys the provenance of the ceiling.
 *
 * Inverted: writing is now OPT-IN via `--ratchet`. This CANNOT raise a ceiling —
 * the writer is only ever reached on the `current < baseline` path, and that path
 * is unchanged. It removes a way to LOWER one by accident.
 *
 * `--no-ratchet` is kept and still wins, so no existing caller changes behaviour
 * (run-all.ts passes neither; `spawnGate` forwards no argv at all).
 */
const RATCHET =
  process.argv.includes('--ratchet') && !process.argv.includes('--no-ratchet');
const LABEL = 'cast-tripwire';

/**
 * §MISCONFIG-IS-NEVER-DEBT — exit 2 means "could not evaluate". Distinct from 1
 * (failed at declared level) and 3 (shrink-only ratchet exceeded); `run-all.ts`
 * refuses to absorb it as ledgered debt.
 */
export const EXIT_MISCONFIGURED = 2;

/**
 * `(window as any)` occurrences.
 *
 * Scan targets:
 *   src/                     — root SPA shell (Wave 7 target: 0). Measures 0 today.
 *   apps/editor/src/engine/  — WIDENED 2026-08-09 from the single file
 *     `window-shim.ts` to the whole engine directory. The shim is cast-free since
 *     OI-024, but its NEIGHBOURS are not: the widening surfaced 20 casts the
 *     one-file scope could never see. Declared here rather than quietly folded in.
 *
 * See MAX_REPO_WIDE below for the second, wider counter — the strict scope alone
 * covers a fraction of what P4 actually claims.
 */
function count(): number {
  const dirs = ['src', 'apps/editor/src/engine'].filter((d) => existsSync(resolve(REPO_ROOT, d)));
  // §FIX-CAST-STRICT-COUNTS-PROSE (L-844, 2026-08-11) — scanFilesStripped, not
  // scanFiles. The strict arm was counting COMMENTS: of the 20 matches it read
  // against a baseline of 0, SIXTEEN were prose — and almost every one was a
  // comment ASSERTING P4 COMPLIANCE, e.g. postFxRouting.ts:37:
  //     "P4 — no `(window as any)`; all deps arrive as narrow typed interfaces."
  // A gate that fails on documentation of the rule it enforces teaches people to
  // delete the documentation — the exact inversion of what a gate is for. Same
  // precision fix as check-no-commandmanager's codeLines/mentionLines split, and
  // the same one check-raf-count needed when 4 of its 5 "owners" were comments.
  // The pattern is unchanged; only prose stops counting.
  const res = scanFilesStripped({
    root: REPO_ROOT,
    dirs,
    pattern: /\(\s*window\s+as\s+any\s*\)/,
    // src/ + apps/editor/src/engine is ~250 files. Below 100 the scan is broken,
    // and a broken scan must not be able to print "OK: 0".
    minFiles: 100,
    exclude: (rel) => rel.endsWith('.d.ts'),
    label: LABEL,
  });
  console.log(`[${LABEL}] files scanned: ${res.filesScanned} · dirs: ${dirs.join(', ')}`);
  if (res.matches.length) {
    console.log('  By file:');
    for (const [f, n] of tallyBy(res.matches, (m) => m.file)) console.log(`      ${String(n).padStart(4)}  ${f}`);
  }
  return res.matches.length;
}

/**
 * §FIX-MISSING-BASELINE-IS-NOT-A-PASS (W3a, 2026-08-30)
 *
 * ⚠ This function used to `return Number.MAX_SAFE_INTEGER` when the baseline
 * file was absent. Read what that does to the caller: `current > baseline` is
 * then false FOR EVERY POSSIBLE current, so the strict arm COULD NOT FAIL. And
 * on the `current < baseline` path the gate would then WRITE a brand-new
 * baseline at whatever it happened to measure — inventing a ceiling out of the
 * reading it was supposed to be judged against.
 *
 * So a MISSING PREREQUISITE and a CLEAN MEASUREMENT printed the same result
 * (`OK: N`) and returned the same exit code (0). That is precisely the defect
 * §FIX-GATE-NEEDS-RIPGREP (L-811) is named after, in its quiet direction — and
 * the L-716 shape besides: a threshold that can never be crossed is not a gate.
 *
 * A baseline that is missing, unparseable, or does not carry a finite
 * non-negative `count` is now MISCONFIGURED (exit 2), never a pass. Exit 2 is
 * explicitly non-absorbable by `gate-debt.json`, so it cannot be re-hidden.
 *
 * Returns `null` for "cannot evaluate"; the reason is printed by the caller.
 */
function loadBaseline(): { count: number } | { error: string } {
  if (!existsSync(BASELINE_FILE)) {
    return { error: `baseline file not found: ${BASELINE_FILE}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  } catch (e) {
    return { error: `baseline file is not valid JSON: ${(e as Error).message}` };
  }
  const count = (parsed as { count?: unknown } | null)?.count;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
    return { error: `baseline file has no finite non-negative "count" (got ${JSON.stringify(count)})` };
  }
  return { count };
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
          'Auto-ratcheted by tools/ga-gate/check-cast-count.ts. Wave 5 target: 670. Wave 7 target: 0.',
      },
      null,
      2,
    ) + '\n',
  );
}

/**
 * §FIX-P4-SCOPE-DRIFT (L-811b, 2026-08-09) — the SECOND counter, repo-wide.
 *
 * P4 as written in C01 §1 says `(window as any)` is "forbidden EVERYWHERE except
 * the allowlisted shim". The strict counter above scans `src/` plus the editor
 * engine — which was the whole client when the gate was written in Wave 1. It no
 * longer is. The client moved into `apps/editor`, `packages/*` and `plugins/*`,
 * and the gate's scope did not follow it: **`src/` today contains ZERO casts, so
 * the original gate would have printed "OK: 0" while 215 casts sat outside its
 * field of view.**
 *
 * That is coverage drift, and it is the quiet twin of the ripgrep bug — one gate
 * crashed loudly, this one would have passed loudly, and both told you nothing.
 * So the real scope is now measured and ratcheted too.
 *
 * ⚠ SHRINK-ONLY. Frozen 2026-08-09 at the first honest measurement: **215**
 * production sites (tests and fixtures excluded; they add a further 176; this
 * gate file itself is excluded, or its own prose would move the number).
 *
 *      65  apps/editor              40  packages/room-topology
 *      21  packages/core-app-model  20  apps/component-editor
 *      18  packages/runtime-composer 14  packages/ai-host
 *      11  packages/input-host
 *       … and a 24-package tail of 1–4 apiece
 *
 * This is NOT a raised baseline. The strict counter's ceiling is untouched at 0.
 * This is a new, wider counter frozen at what it actually found on its first run.
 *
 * ─── §FIX-P4-REPOWIDE-COUNTS-PROSE (H4/L-845b, 2026-08-16) ───────────────────
 * ⚠ THE 215 ABOVE WAS NEVER 215 CASTS. It was 215 LINES, and MORE THAN HALF OF
 * THEM WERE COMMENTS.
 *
 * L-844 fixed exactly this defect — on the STRICT arm only. `count()` above was
 * moved to `scanFilesStripped` on 2026-08-11 because 16 of its 20 matches were
 * prose, and almost every one was a comment ASSERTING P4 COMPLIANCE. The repo-wide
 * arm forty lines below was left on raw `scanFiles` and nobody re-measured it.
 *
 * Measured 2026-08-16 with the arm's own config, run both ways:
 *
 *      RAW (what this arm counted)        209
 *      STRIPPED (actual casts in code)    100
 *      PROSE counted as code              109      ← 52% of the ceiling
 *
 * The 109 are lines like:
 *      apps/component-editor/src/sketch/hitTest.ts:5   "no `(window as any)`."
 *      apps/editor/src/engine/postFxRouting.ts:37     "P4 — no `(window as any)`"
 *      apps/editor/src/PluginRegistry.ts:207          "Still NOT `(window as any)`"
 *
 * i.e. a gate that fails on the DOCUMENTATION of the rule it enforces — the exact
 * inversion L-844 names, and the reason the self-exclusion of this very file had
 * to be hand-written below. Three consequences, all of them bad:
 *   • every doc edit moved the enforcement number (this fix's own two explanatory
 *     comments moved it 207 → 209 before the arm was corrected);
 *   • the P4 figure quoted repo-wide — CLAUDE.md P4, STR-03 §2 — was overstated by
 *     ~2×; and
 *   • 115 lines of illusory headroom sat above the real count, so a genuine
 *     regression could add a hundred casts and still print OK.
 *
 * FIXED AT THE INSTRUMENT, and the ceiling RE-PINNED DOWNWARD, 215 → 100:
 * old 215 (lines, half prose) → new 100 (casts, measured), reason: the instrument
 * got honest. This is a TIGHTENING, not a relaxation — R6/§RATCHET-EXCEEDED-IS-
 * NEVER-DEBT forbids RAISING a threshold, and the arm goes from 6 lines of slack
 * to ZERO. Every one of the 100 is a real cast that P4 forbids, and the next one
 * added trips the gate immediately.
 *
 * The raw count is still COMPUTED and PRINTED beside the enforced one, so the
 * contamination stays visible and cannot silently return. It is never enforced.
 */
const MAX_REPO_WIDE = Number(process.env.PRYZM_P4_MAX_REPO_WIDE ?? 100);

/** The repo-wide arm's scan config — shared verbatim by the enforced (stripped)
 *  count and the reported-only raw count, so the two can never drift apart and
 *  make the prose delta meaningless. */
function repoWideScanConfig() {
  const dirs = ['src', 'apps', 'packages', 'plugins', 'server', 'tools']
    .filter((d) => existsSync(resolve(REPO_ROOT, d)));
  return {
    root: REPO_ROOT,
    dirs,
    pattern: /\(\s*window\s+as\s+any\s*\)/,
    minFiles: 3000,
    exclude: (rel: string) =>
      rel.endsWith('.d.ts')
      || /(^|\/)(__tests__|__fixtures__|__mocks__)\//.test(rel)
      || /\.(spec|test)\.tsx?$/.test(rel)
      // This gate file — the pattern literal and the prose both live here. Kept
      // even though comment-stripping now handles the prose case, because the
      // exclusion is free and a future edit could put the literal in live code.
      || rel === 'tools/ga-gate/check-cast-count.ts',
    label: `${LABEL}/repo-wide`,
  };
}

function countRepoWide(): number {
  const cfg = repoWideScanConfig();
  // ENFORCED: comment-stripped. A comment is not a cast; P4's verb is about the
  // CAST, not the word. §FIX-P4-REPOWIDE-COUNTS-PROSE above.
  const res = scanFilesStripped(cfg);
  // REPORTED ONLY: the raw line count this arm used to enforce. Printed so the
  // prose contamination stays a visible, drift-proof number instead of a story
  // in a comment that nobody re-measures.
  const raw = scanFiles(cfg);
  const prose = raw.matches.length - res.matches.length;
  console.log(`[${LABEL}] repo-wide scope: ${res.filesScanned} files · ${res.matches.length}/${MAX_REPO_WIDE} cast(s) (tests excluded)`);
  console.log(`[${LABEL}] repo-wide prose check: ${raw.matches.length} raw line(s) − ${res.matches.length} cast(s) = ${prose} comment(s) NOT counted (L-845b; enforcement is the stripped number)`);
  if (res.matches.length > MAX_REPO_WIDE) {
    console.error(`\n  Repo-wide casts by package:`);
    for (const [k, n] of tallyBy(res.matches, (m) => m.file.split('/').slice(0, 2).join('/'))) {
      console.error(`      ${String(n).padStart(4)}  ${k}`);
    }
  }
  return res.matches.length;
}

/**
 * §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836, 2026-08-11)
 *
 * ─── The hole this closes ────────────────────────────────────────────────────
 * ⚠ CORRECTED 2026-08-16 (H4). The sentence below read "This gate is on
 * `gate-debt.json`" in the present tense. IT IS NOT, and has not been since
 * §FIX-CAST-STRICT-BASELINE (L-844) struck it from the ledger on 2026-08-11 —
 * the same day R7 was written, hours apart. `gate-debt.json.failing` today holds
 * exactly `check-no-commandmanager.ts` and `check-custom-event-apps.ts`; verify
 * with `node -e "console.log(require('./tools/ga-gate/gate-debt.json').failing)"`
 * rather than trusting this comment. A gate file asserting an enforcement
 * relationship that does not exist is the L-809/L-812 defect in miniature, so it
 * is corrected in place rather than left to be read literally.
 *
 * The correction does NOT weaken R7 — it strengthens the case for it. `run-all.ts`
 * classifies exit 3 at line ~866, BEFORE the ledger is consulted at all, so exit 3
 * is hard-red whether or not a gate is listed. What follows is the ORIGINAL
 * rationale, true of this gate in the days before it was struck and true of every
 * gate still on the ledger:
 *
 * `run-all.ts` treats ANY non-zero exit from a ledgered gate as 🟡 KNOWN-DEBT and
 * keeps going. So once a gate is ledgered, it is licensed not merely to FAIL but
 * to GET WORSE — and nobody sees it, because "declared debt" and "declared debt,
 * now worse" print identically.
 *
 * That is exactly what happened: the repo-wide `(window as any)` count went
 * 215 → 217 while sitting on this ledger, and no run ever said so. A shrink-only
 * ratchet that can be exceeded without a signal is not a ratchet.
 *
 * ─── Why a distinct exit code, and not just louder text ─────────────────────
 * The ledger is keyed on the gate NAME, so run-all cannot distinguish "failing at
 * its declared level" from "failing worse" by name alone — only the gate knows
 * its own baseline. So the gate must SAY which of the two it is, and the only
 * channel run-all reads is the exit code.
 *
 * This mirrors §MISCONFIG-IS-NEVER-DEBT exactly: exit 2 already means "could not
 * evaluate", is already never absorbable, and exists for the same reason — a
 * distinct FACT deserves a distinct code rather than being aliased onto 1.
 *
 *   exit 0 — clean, or at/below baseline
 *   exit 1 — failed at its DECLARED level (absorbable as ledgered debt)
 *   exit 2 — MISCONFIGURED, could not evaluate (never absorbable)
 *   exit 3 — a SHRINK-ONLY RATCHET WAS EXCEEDED (never absorbable)  ← new
 *
 * The correct response to a 3 is to remove the new casts. It is NOT to raise the
 * threshold: doing so converts a measurement into a permission, which is the
 * failure this whole file exists to prevent.
 */
export const EXIT_RATCHET_EXCEEDED = 3;

const RATCHET_EXCEEDED_NOTE =
  '§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7): exiting 3, not 1 — being on gate-debt.json '
  + 'declares that this gate FAILS, never that it may get WORSE. Fix the new casts; '
  + 'do NOT raise the threshold.';

function main(): number {
  const current = count();
  const loaded = loadBaseline();
  const repoWide = countRepoWide();

  if ('error' in loaded) {
    console.error(`\n[${LABEL}] MISCONFIGURED (exit ${EXIT_MISCONFIGURED}): ${loaded.error}`);
    // The repo-wide arm IS evaluable and was measured above; say where it stands
    // so a real breach is never hidden behind the arm that could not run.
    console.error(
      `  (repo-wide arm did evaluate: ${repoWide}/${MAX_REPO_WIDE} — `
      + `${repoWide > MAX_REPO_WIDE ? 'ALSO OVER CEILING, fix it too' : 'within ceiling'}.)`,
    );
    console.error(`  The strict arm has NOTHING to compare ${current} against, so it cannot`);
    console.error(`  pass and must not pretend to. §FIX-MISSING-BASELINE-IS-NOT-A-PASS.`);
    console.error(`  Restore the file from git (it is tracked), or write it deliberately:`);
    console.error(`      echo '{"count": ${current}, "comment": "…what paid this…"}' > ${BASELINE_FILE}`);
    return EXIT_MISCONFIGURED;
  }
  const baseline = loaded.count;

  if (repoWide > MAX_REPO_WIDE) {
    console.error(`\n[${LABEL}] FAIL (repo-wide): ${repoWide} (window as any) cast(s) > baseline ${MAX_REPO_WIDE}.`);
    console.error(`  P4 forbids the cast everywhere but the allowlisted shim. Use runtime.<service>,`);
    console.error(`  or a typed global declaration. Do NOT raise this threshold — it is shrink-only.`);
    console.error(`  ${RATCHET_EXCEEDED_NOTE}`);
    return EXIT_RATCHET_EXCEEDED;
  }

  if (current > baseline) {
    console.error(`[cast-tripwire] FAIL: (window as any) count = ${current} > baseline ${baseline}.`);
    console.error(`  A regression added ${current - baseline} new cast(s).`);
    console.error(`  Read: docs/archive/pryzm3-internal/04-PLAN-FORWARD/archive/09-WAVE-5-CAST-DELETION.md §3`);
    console.error(`  To fix: replace (window as any).<service> with runtime.<service>;`);
    console.error(`          if genuinely a browser global, allowlist in src/engine/subsystems/legacy/window-shim.ts.`);
    console.error(`  ${RATCHET_EXCEEDED_NOTE}`);
    return EXIT_RATCHET_EXCEEDED;
  }

  if (current < baseline) {
    if (RATCHET) {
      writeBaseline(current);
      console.log(`[cast-tripwire] OK: ${current} (ratchet lowered from ${baseline}; --ratchet).`);
    } else {
      console.log(
        `[cast-tripwire] OK: ${current} (would ratchet ${baseline} → ${current}; `
        + `re-run with --ratchet to write it — §FIX-RATCHET-IS-OPT-IN).`,
      );
    }
  } else {
    console.log(`[cast-tripwire] OK: ${current} = baseline.`);
  }
  return 0;
}

process.exit(main());
