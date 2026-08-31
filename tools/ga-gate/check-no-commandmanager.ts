#!/usr/bin/env tsx
/**
 * Phase 2 Task 2.1 — commandManager.execute() + alias ratchet (monotonic gate).
 *
 * Spec:   docs/03_PRYZM3/04-PLAN-FORWARD/46-IMPLEMENTATION-PLAN-2026-05-08.md §4
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/23-PHASE-E-COMMAND-BUS-MIGRATION.md §E.5
 * OI-046 complete 2026-05-16 — all three alias loopholes closed.
 *
 * Hard-fail if ANY of the three counters rises above its ceiling:
 *
 *   A) LITERAL  — commandManager.execute() anywhere in apps/editor/src/
 *      Ceiling: 0 (hard-fail — already migrated).  Any value > 0 = regression.
 *
 *   B) WINDOW   — cmdMgr.execute + window.commandManager references
 *      in apps/editor/src/ (excludes initBusHandlers.ts which is the
 *      intentional bridge between the typed bus and the legacy cmdMgr).
 *      Ceiling: CMDMGR_WINDOW_CEILING (env-override; ratchets down).
 *      2026-05-16 post-E.5.4 actual: 2 (both context-reads, not executes).
 *
 *   C) CM_EXEC  — cm.execute() calls in apps/editor/src/ that escape the
 *      window.commandManager scan — the most common alias pattern.
 *      Excludes initBusHandlers.ts (the sole authorised bridge file).
 *      Ceiling: CMDMGR_CM_EXEC_CEILING (env-override; ratchets down).
 *      2026-05-16 post-E.5.4 actual: 49 (migration backlog for E.5.5+).
 *
 * Baseline file: .ga-gate/baselines/no-commandmanager.json
 * --no-ratchet  : skip the auto-lower write (CI mode).
 *
 * Count methodology:
 *   Literal:  rg "commandManager\.execute" apps/editor/src --type ts
 *             | grep -v "//" | wc -l
 *   Window:   rg "cmdMgr\.execute\b|window\.commandManager\b" apps/editor/src
 *             --type ts --glob '!path-to-initBusHandlers' | grep -v "//" | wc -l
 *             (initBusHandlers.ts excluded — authorised bridge)
 *   CmExec:   rg "\bcm\.execute\b" apps/editor/src --type ts
 *             --glob '!path-to-initBusHandlers' | grep -v "//" | wc -l
 *             (initBusHandlers.ts excluded — authorised bridge)
 *
 * Trajectory (WINDOW + CM_EXEC combined — Phase E.5.x):
 *   2026-05-16 baseline E.5.2     :  111  (cmdMgr.execute + window.commandManager only;
 *                                          cm.execute was not yet tracked → loophole)
 *   OI-046 fix 2026-05-16         :  WINDOW=2, CM_EXEC=49
 *                                    (both tracked separately after E.5.4 plantools migration)
 *   E.5.5 (UI panels batch 1)     :  CM_EXEC ≤ 30  (OverridePanel, ViewsRailPanel, RadialMenu,
 *                                                    HeaderIntentPicker, SpineOverrideList)
 *   E.5.6 (UI panels batch 2)     :  CM_EXEC ≤ 15  (DataWorkbench tree + HierarchyTree actions)
 *   E.5.7 (remaining UI + plantools): CM_EXEC ≤ 5  (ViewPropertiesPanel, SheetEditor,
 *                                                    WindowPlanToolHandler, DoorPlanToolHandler)
 *   E.5.8 (final cleanup)         :  CM_EXEC = 0
 *   WINDOW target                 :  0  (2 context-read-only refs — migrate when stores typed)
 */
/**
 * ─── §FIX-GATE-NEEDS-RIPGREP (L-811), 2026-08-11 ────────────────────────
 * All three counters used to shell out to `rg ... | grep -v "//" | wc -l` under
 * `shell: '/bin/bash'` — four binaries absent from a stock Windows box. Measured
 * BEFORE this port:
 *
 *     Error: spawnSync /bin/bash ENOENT   → exit 1
 *
 * Rewritten on `lib/sourceScan.ts` (Node only, zero external binaries).
 *
 * ─── The `grep -v` step was never a comment filter ──────────────────────
 * The rg pipeline dropped every line CONTAINING a double slash anywhere. That is
 * wrong in both directions at once:
 *
 *   • it DROPPED real calls carrying a trailing comment or a URL
 *     (`cm.execute(cmd);  // TODO migrate` — a genuine call site, uncounted)
 *   • it KEPT JSDoc body lines, which start with a star and contain no double
 *     slash at all (` * Fix: replace commandManager.execute() with ...` — prose,
 *     counted as a call)
 *
 * The port uses the repo's real comment lexer via `scanFilesStripped`, which is the
 * faithful implementation of what the `grep -v` step was REACHING for. Both numbers
 * are printed on every run so the difference is never invisible again. Measured
 * 2026-08-11 — literal 47 raw / 14 in code; window 96 / 62; cm.execute 67 / 62.
 *
 * ─── Counting unit ─────────────────────────────────────────────
 * The `wc -l` step counted matching LINES. `distinctLines()` reproduces that unit.
 *
 * ─── Scope: RESTATED, NOT NARROWED ──────────────────────────────
 * All three counters scanned `apps/editor/src` with `--type ts`; the port walks that
 * same single directory with the same four extensions. Counters B and C excluded
 * initBusHandlers.ts (the authorised legacy bridge) and globals.d.ts (a declaration
 * file); both exclusions are reproduced exactly in `bridgeExcluded()` below.
 *
 * ─── §CONVERGE-CM-COUNTERS-CALLER (2026-08-31) — THE CALLER HALF ─────────────
 *
 * The paragraph that stood here said only that `scripts/check/ci-check-no-commandmanager.mjs`
 * is "a DIFFERENT gate … not a duplicate", and left it there. That was true about
 * SCOPE and wrong about METHOD, and the method is what mattered:
 *
 *     THAT gate    packages/ + plugins/     3 arms, alias-resolving, 25 controls
 *     THIS gate    apps/editor/src          3 fixed-name regexes, 0 controls
 *
 * They were never scope rivals. They were METHOD rivals over ONE concept — "a call
 * site reaching the legacy command manager" — and the WEAKER detector owned a scope.
 * A name-enumerating counter can be satisfied by RENAMING the receiver, and because
 * counters B/C here auto-ratchet DOWNWARD on improvement, a pure rename BANKED a
 * permanent fake improvement. A ratchet paying out for an evasion is worse than no
 * ratchet.
 *
 * `§CONVERGE-CM-COUNTERS` exported the detector for this file to call. That export
 * was UNUSABLE as shipped — the .mjs ran its whole scan at module load and called
 * `process.exit`, so importing it killed the importer — which is why the caller half
 * never landed. The entrypoint guard there and this import are the two halves.
 *
 * ── What changed here, counter by counter ──
 *
 *   A) LITERAL   — UNCHANGED pattern, UNCHANGED hard ceiling 0, UNCHANGED ledger 11.
 *   B) WINDOW    — UNCHANGED. It is a DIFFERENT CONCEPT: `window.commandManager`
 *                  is a reach-through to the global singleton (`…?.context?.stores?
 *                  .gridStore` is a STORE READ, not a call). Kept as-is, ceiling 2.
 *   C) CM_EXEC   — RETIRED as an enforced ceiling and REPLACED by (D). `\bcm\.execute\b`
 *                  is the name-blind spelling this whole note is about. It is NOT
 *                  deleted: it is demoted to a runtime SUPERSET CONTROL on (D).
 *   D) CONVERGED — NEW. The authority's arms (literal + alias + indirect) over THIS
 *                  scope, with this gate's own bridge exclusions. Pinned at its first
 *                  honest reading; shrink-only; exit 3 on growth.
 *
 * ── Why (D) is not (C)'s ceiling raised ──
 * (D) is a different, strictly LARGER measurement of a superset, pinned at first
 * reading — not a re-pin of (C). The proof that it is a superset runs on every
 * invocation: every line (C) matches must appear in (D) or be a `typeof …execute`
 * capability guard, which is a feature test and never a call. Measured 2026-08-31:
 * (C) = 62 lines, of which 60 are in (D) and 2 are capability guards; residual 0.
 * (C)'s number keeps being PRINTED so nothing became invisible.
 *
 * Exit: 0 = all at/under ceiling and baseline · 1 = any over · 2 = misconfigured
 *       (including: the retired detector found something the authority missed)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve }                        from 'node:path';
import { pathToFileURL }                           from 'node:url';
import { scanFiles, scanFilesStripped, distinctLines, type Match } from './lib/sourceScan.js';
import { blankStringLiterals }                     from './lib/writeRouteScan.js';

const REPO_ROOT      = process.env.GA_GATE_REPO_ROOT ?? process.cwd();

// ─── The authority detector ───────────────────────────────────────────────────
//
// §CONVERGE-CM-COUNTERS-CALLER. One definition of "a call site reaching the legacy
// command manager" in this repo, and it lives in the .mjs (3 arms, 25 negative and
// positive controls, `--self-test`). Imported by URL because the module is outside
// any tsconfig rootDir; the shape is declared locally rather than inferred, so a
// change to the export signature surfaces here as a type error instead of `any`.

interface AuthorityHit {
    file:   string;
    lineNo: number;
    kind:   'literal' | 'alias' | 'indirect';
    alias:  string;
    text:   string;
}
interface AuthorityStats {
    files: number; testDoubles: number; helpers: string[];
    literal: number; alias: number; indirect: number;
}
interface AuthorityModule {
    scanLegacyManagerCallSites(
        scanDirs: readonly string[],
        minFiles: number,
    ): { violations: AuthorityHit[]; stats: AuthorityStats };
}

const AUTHORITY_PATH = resolve(REPO_ROOT, 'scripts/check/ci-check-no-commandmanager.mjs');
const authority = (await import(pathToFileURL(AUTHORITY_PATH).href)) as unknown as AuthorityModule;
const BASELINE_FILE  = resolve(REPO_ROOT, '.ga-gate/baselines/no-commandmanager.json');
const NO_RATCHET     = process.argv.includes('--no-ratchet');

/**
 * Hard ceiling for commandManager.execute() LITERAL calls.
 * Already migrated to 0. Any regression = hard-fail; ceiling NEVER raised.
 */
const LITERAL_CEILING = 0;

/**
 * Ceiling for WINDOW alias patterns (cmdMgr.execute + window.commandManager).
 * Excludes initBusHandlers.ts (intentional bridge, not a migration target).
 * Post-E.5.4 actual: 2 (context-reads; target: 0 when stores are typed).
 */
const WINDOW_CEILING = parseInt(process.env.CMDMGR_WINDOW_CEILING ?? '2', 10);

/**
 * ⚠ RETIRED AS AN ENFORCED CEILING (§CONVERGE-CM-COUNTERS-CALLER, 2026-08-31).
 *
 * `\bcm\.execute\b` is the name-blind spelling. Enforcing a ratchet on it paid out
 * for renames: bind the manager to `mgr` instead of `cm` and the counter FELL, the
 * ratchet wrote the lower number, and the improvement was permanent and fake.
 *
 * The pattern is still MEASURED and PRINTED on every run, and it now has a job it
 * can actually do: it is the SUPERSET CONTROL on the converged counter (D). Kept as
 * a constant so the historical value is not lost from the file.
 */
const CM_EXEC_CEILING_RETIRED = 49;

/**
 * (D) CONVERGED — the authority's own arms over this gate's scope and exclusions.
 *
 * ⚠ PINNED AT FIRST HONEST READING, 2026-08-31. This is a NEW counter, not a re-pin
 * of the retired (C): it measures a strict SUPERSET by a stronger method, so the two
 * numbers are not comparable and 111 is not "49 raised".
 *
 *     literal 12 · alias 99 · indirect 0 · bridge-excluded 6 · = 111
 *
 * Note literal = 12 here against counter (A)'s 11: the twelfth is
 * `apps/editor/src/ui/layout/CreatePanelLayout.ts:275`,
 * `window.commandManager?.execute(new DeleteRoomCommand(r.id))` — a real literal
 * call that (A)'s `commandManager\.execute\b` never saw because of the `?.`. It was
 * always there. (A)'s pattern, ceiling and ledger are DELIBERATELY LEFT ALONE; the
 * site is counted here instead of quietly re-pinning a hard-0 counter's ledger.
 *
 * ⚠ SHRINK-ONLY. Above this the exit is 3, which no ledger absorbs. The way down is
 * migrating call sites to `runtime.bus.executeCommand()` — never editing this line.
 */
const CONVERGED_CEILING = parseInt(process.env.CMDMGR_CONVERGED_CEILING ?? '111', 10);

/** The extensions rg's `--type ts` covered. Never narrower than the rg version. */
const EXTS = ['.ts', '.tsx', '.mts', '.cts'] as const;

const DIRS = ['apps/editor/src'];

/**
 * ⚠ THE HONESTY FLOOR. `apps/editor/src` holds 1,043 TS files today. 700 catches a
 * bad cwd or a vanished subject tree without tripping on ordinary churn. Below it
 * the scan exits 2 — NOT 0 and NOT 1. Load-bearing here: counter A's passing value
 * is 0, so "walked nothing" and "fully migrated" are otherwise identical readings.
 */
const MIN_FILES = 700;

/** Reproduces both negated globs counters B and C passed to rg. */
function bridgeExcluded(rel: string): boolean {
    return rel.endsWith('/initBusHandlers.ts') || rel === 'initBusHandlers.ts'
        || rel.endsWith('/globals.d.ts')       || rel === 'globals.d.ts';
}

let SCANNED = 0;

/** Code-only matching lines — the number every ceiling is evaluated against. */
function codeLines(pattern: RegExp, label: string, exclude?: (r: string) => boolean): Match[] {
    const res = scanFilesStripped({
        root: REPO_ROOT, dirs: DIRS, pattern, minFiles: MIN_FILES,
        exclude, exts: EXTS, label: `no-commandmanager/${label}`,
    });
    SCANNED = res.filesScanned;
    // §FIX-GATE-COUNTS-STRINGS (L-835) — scanFilesStripped removes COMMENTS but
    // deliberately preserves string bodies. Drop any match that survives only
    // inside a string literal: a console.error REPORTING that the legacy path
    // failed is not a USE of the legacy path. Re-tested per line, so a match is
    // kept only if it still matches once string bodies are blanked.
    const inCodeOnly = distinctLines(res.matches).filter(
        m => new RegExp(pattern.source, pattern.flags.replace('g', '')).test(blankStringLiterals(m.text)),
    );
    return inCodeOnly;
}

/** Every matching line, comments INCLUDED. Reported for context, never enforced. */
function mentionLines(pattern: RegExp, label: string, exclude?: (r: string) => boolean): number {
    const res = scanFiles({
        root: REPO_ROOT, dirs: DIRS, pattern, minFiles: MIN_FILES,
        exclude, exts: EXTS, label: `no-commandmanager/${label}-mentions`,
    });
    return distinctLines(res.matches).length;
}

/**
 * §FIX-P6-GATE-PRECISION (L-835, 2026-08-11) — two over-matches, both corrected.
 * Neither is a relaxation: the ceiling stays 0 and the gate still FAILS. They
 * make the number MEAN what the gate says it means.
 *
 *  1. The trailing `\b` excludes `commandManager.executeChunked(...)`.
 *     `executeChunked` is a DIFFERENT method — declared only on
 *     CommandManagerImpl (packages/command-registry/src/CommandManagerImpl.ts
 *     :316), it awaits the command's own chunked implementation and yields a
 *     frame between batches so a 1,300-element project open does not block the
 *     main thread. THE BUS HAS NO CHUNKED-DISPATCH API, so this site is not
 *     migratable in principle, and counting it against a P6 ceiling asserted a
 *     violation that has no available fix. Without the `\b`, a regex written for
 *     `execute` claimed a method whose name merely starts the same way.
 *
 *  2. Counting is now done over stripCommentsAndStrings, so the gate no longer
 *     counts its own subject appearing inside a DIAGNOSTIC ABOUT it:
 *         console.error('…: commandManager.execute failed:', err)
 *         console.warn('… commandManager.execute not available — skipping …')
 *     Both are the codebase REPORTING that the legacy path failed. Counting the
 *     report as a use is the same defect as counting a comment.
 *
 * Honest reading: 14 -> 11. The remaining 11 were each verified by hand and are
 * documented in ISSUE-LOG §8; every one of them regresses if migrated today.
 */
const LITERAL_PATTERN = /commandManager\.execute\b/;
const WINDOW_PATTERN  = /cmdMgr\.execute\b|window\.commandManager\b/;
const CM_EXEC_PATTERN = /\bcm\.execute\b/;

/** Print every offending site — the rg version printed only a bare count. */
function listSites(matches: readonly Match[], limit = 40): void {
    for (const m of matches.slice(0, limit)) {
        console.error(`      ${m.file}:${m.line}  ${m.text.slice(0, 120)}`);
    }
    if (matches.length > limit) console.error(`      … and ${matches.length - limit} more.`);
}

interface Baseline {
    windowCount:    number;
    cmExecuteCount: number;
}

function loadBaseline(): Baseline {
    if (!existsSync(BASELINE_FILE)) {
        return { windowCount: WINDOW_CEILING, cmExecuteCount: CM_EXEC_CEILING };
    }
    const data = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    return {
        windowCount:    data.windowCount    ?? data.aliasCount ?? WINDOW_CEILING,
        cmExecuteCount: data.cmExecuteCount ?? CM_EXEC_CEILING_RETIRED,
    };
}

/**
 * (D) — call sites in THIS gate's scope, measured by THE authority detector.
 * Bridge exclusions are this gate's, applied to the authority's output so the two
 * gates share a detector without sharing a scope or a ceiling.
 */
function convergedCallSites(): AuthorityHit[] {
    const { violations } = authority.scanLegacyManagerCallSites(DIRS, MIN_FILES);
    return violations.filter(v => !bridgeExcluded(v.file));
}

/**
 * THE SUPERSET CONTROL — the retired name detector, run as a check ON the authority.
 *
 * ⚠ THIS IS THE PART THAT MAKES THE RETIREMENT SAFE. Folding a detector away on the
 * assertion that the replacement covers it is exactly how coverage goes missing; so
 * the assertion is EXECUTED, every run. Every line `\bcm\.execute\b` matches must be
 * either a converged hit or a `typeof …execute` capability guard (a feature test is
 * not a call — the authority excludes them by the same rule, and so did this gate).
 * Anything else means the authority has a hole the weak detector could see, and the
 * honest response is exit 2 (MISCONFIGURED), not a quietly smaller number.
 */
const TYPEOF_GUARD = /typeof\s+[\w.$[\]'"?!]*\s*\.\s*execute/;

function supersetResiduals(cmExecuteM: readonly Match[], converged: readonly AuthorityHit[]): Match[] {
    const covered = new Set(converged.map(v => `${v.file}:${v.lineNo}`));
    return cmExecuteM.filter(
        m => !covered.has(`${m.file}:${m.line}`) && !TYPEOF_GUARD.test(m.text),
    );
}

function writeBaseline(windowCount: number, cmExecuteCount: number): void {
    mkdirSync(dirname(BASELINE_FILE), { recursive: true });
    writeFileSync(
        BASELINE_FILE,
        JSON.stringify(
            {
                windowCount,
                cmExecuteCount,
                ratchedAt: new Date().toISOString(),
                comment:
                    'OI-046 complete 2026-05-16. Three-counter gate: (A) literal=0 hard-fail, ' +
                    '(B) window alias (cmdMgr.execute+window.commandManager excl. bridge) ratchet, ' +
                    '(C) cm.execute excl. initBusHandlers.ts ratchet. ' +
                    'Trajectory: WINDOW 2→0, CM_EXEC 49→30→15→5→0 per Phase E.5.5–E.5.8.',
            },
            null,
            2,
        ) + '\n',
    );
}

function checkCounter(
    label:   string,
    current: number,
    ceiling: number,
    baseline: number,
    failed:  boolean,
): boolean {
    if (current > ceiling) {
        console.error(
            `[no-commandmanager] FAIL (${label}): ${current} exceeds CEILING ${ceiling}.`,
        );
        console.error(
            `  Fix: migrate to window.runtime?.bus?.executeCommand() per` +
            ` docs/03_PRYZM3/04-PLAN-FORWARD/23-PHASE-E-COMMAND-BUS-MIGRATION.md §E.5`,
        );
        return true;
    }
    if (current > baseline) {
        console.error(
            `[no-commandmanager] FAIL (${label} ratchet): ${current} > baseline ${baseline}.`,
        );
        console.error(
            `  ${current - baseline} new ${label} call(s) introduced — ratchet regression.`,
        );
        return true;
    }
    return false;
}

function main(): number {
    const literalM   = codeLines(LITERAL_PATTERN, 'literal');
    const windowM    = codeLines(WINDOW_PATTERN,  'window',     bridgeExcluded);
    const cmExecuteM = codeLines(CM_EXEC_PATTERN, 'cm.execute', bridgeExcluded);
    const literal    = literalM.length;
    const window_    = windowM.length;
    const cmExecute  = cmExecuteM.length;
    const convergedM = convergedCallSites();
    const converged  = convergedM.length;
    const baseline   = loadBaseline();
    let failed = false;

    // State the subject size and BOTH units. A gate that reports only its verdict
    // cannot be distinguished from a gate that walked nothing.
    console.log(
        `[no-commandmanager] files scanned: ${SCANNED} (floor ${MIN_FILES}) · ` +
        `dir: apps/editor/src · unit: matching lines`,
    );
    console.log(
        `[no-commandmanager] code-only (ENFORCED) literal=${literal} window=${window_}` +
        `  ·  incl. comments literal=${mentionLines(LITERAL_PATTERN, 'literal')}` +
        ` window=${mentionLines(WINDOW_PATTERN, 'window', bridgeExcluded)}` +
        ` cm.execute=${mentionLines(CM_EXEC_PATTERN, 'cm.execute', bridgeExcluded)}`,
    );
    console.log(
        `[no-commandmanager] converged (ENFORCED, authority detector): ${converged}` +
        `  ·  retired name counter cm.execute=${cmExecute} (ceiling ${CM_EXEC_CEILING_RETIRED}, NOT enforced)`,
    );

    // ── THE SUPERSET CONTROL, before any verdict ────────────────────────────
    // If the retired weak detector can see a call the authority cannot, the
    // authority has a hole and every number below it is understated. That is a
    // MISCONFIGURED detector, not a passing gate and not a failing one.
    const residuals = supersetResiduals(cmExecuteM, convergedM);
    if (residuals.length > 0) {
        console.error(
            `[no-commandmanager] MISCONFIGURED (exit 2): the RETIRED name detector found` +
            ` ${residuals.length} call site(s) the authority missed. The authority is not a` +
            ` superset, so retiring the name counter would DROP coverage.`,
        );
        console.error(
            `  Fix the detector in scripts/check/ci-check-no-commandmanager.mjs (add an arm +` +
            ` a self-test control). Do NOT narrow this control.`,
        );
        listSites(residuals);
        return 2;
    }
    console.log(
        `[no-commandmanager] superset control OK: all ${cmExecute} cm.execute line(s) are` +
        ` converged hits or typeof capability guards (residual 0).`,
    );

    // A) Literal — hard-fail
    if (literal > LITERAL_CEILING) {
        console.error(
            `[no-commandmanager] FAIL (literal): commandManager.execute = ${literal}` +
            ` exceeds LITERAL_CEILING ${LITERAL_CEILING} — hard regression.`,
        );
        console.error(
            '  Fix: migrate to runtime.bus.executeCommand() per' +
            ' docs/03_PRYZM3/04-PLAN-FORWARD/54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5',
        );
        listSites(literalM);
        failed = true;
    } else {
        console.log(`[no-commandmanager] OK (literal): ${literal} / ${LITERAL_CEILING}`);
    }

    // B) Window alias ratchet
    const windowFailed = checkCounter('window', window_, WINDOW_CEILING, baseline.windowCount, failed);
    if (windowFailed) listSites(windowM);
    if (!windowFailed) {
        if (window_ < baseline.windowCount) {
            if (NO_RATCHET) {
                console.log(
                    `[no-commandmanager] OK (window): ${window_}` +
                    ` (would ratchet ${baseline.windowCount} → ${window_}; --no-ratchet active).`,
                );
            } else {
                console.log(
                    `[no-commandmanager] OK (window): ${window_}` +
                    ` (ratchet lowered ${baseline.windowCount} → ${window_}).`,
                );
            }
        } else {
            console.log(`[no-commandmanager] OK (window): ${window_} / ${WINDOW_CEILING}`);
        }
    }
    failed = failed || windowFailed;

    // D) CONVERGED call sites — replaces the retired (C) name ratchet.
    //
    // ⚠ NO AUTO-RATCHET HERE, DELIBERATELY. The auto-ratchet is what made a rename
    // pay: it wrote the improved number to disk the moment the count dipped, for any
    // reason. This counter is compared to a constant, so a real migration lowers the
    // number visibly and someone edits the constant on purpose, with the diff to
    // point at. Nothing lowers it silently.
    if (converged > CONVERGED_CEILING) {
        console.error(
            `[no-commandmanager] FAIL (converged): ${converged} call sites reaching the legacy` +
            ` command manager exceeds CEILING ${CONVERGED_CEILING}.`,
        );
        console.error(
            '  Fix: migrate to runtime.bus.executeCommand(). Do NOT raise CONVERGED_CEILING.',
        );
        listSites(convergedM.map((v): Match => ({
            file: v.file, line: v.lineNo, groups: [],
            text: `(${v.kind}:${v.alias}) ${v.text}`,
        })));
        failed = true;
    } else if (converged < CONVERGED_CEILING) {
        console.log(
            `[no-commandmanager] OK (converged): ${converged} / ${CONVERGED_CEILING}` +
            ` — ${CONVERGED_CEILING - converged} site(s) migrated; lower CONVERGED_CEILING to lock it in.`,
        );
    } else {
        console.log(`[no-commandmanager] OK (converged): ${converged} / ${CONVERGED_CEILING}`);
    }

    // Write unified baseline if the window ratchet improved and we're not in
    // --no-ratchet mode. `cmExecuteCount` is carried through verbatim: the counter
    // it belonged to is retired, and rewriting a retired counter's baseline would
    // be inventing history.
    if (!failed && !NO_RATCHET) {
        if (window_ < baseline.windowCount) {
            writeBaseline(window_, baseline.cmExecuteCount);
        }
    }

    if (!failed) return 0;

    /**
     * §LEDGERED-LEVEL (2026-08-11, C9). This gate is on `gate-debt.json`, and that
     * entry says exactly one thing: THIS GATE FAILS. It has never been able to say
     * how badly, because every reading above every threshold exited 1 and the
     * runner absorbed all of them identically. A ledgered gate could therefore go
     * 11 → 40 literal `commandManager.execute` call sites — the P6 breach itself,
     * growing — and no run would have said a word. That is the R7 defect
     * (§RATCHET-EXCEEDED-IS-NEVER-DEBT) one level in: the ledger declares a
     * FAILURE, never a licence to worsen.
     *
     * MEASURED 2026-08-11 on this tree, comments stripped:
     *     literal = 11 · window = 62 · cm.execute = 62
     * The ledger's own note recorded literal = 14 when the entry was written, so
     * the declared level FALLS to 11 in the same breath it starts being enforced.
     * These are a RECORD OF TODAY'S DEBT, not three more ceilings to spend: above
     * any of them the exit is 3, which no ledger absorbs.
     *
     * §CONVERGE-CM-COUNTERS-CALLER (2026-08-31): LEDGERED_CM_EXEC is GONE, not
     * raised — its counter is retired (see (C) above), and a ledgered level for a
     * counter nobody enforces is a number that can only mislead. LEDGERED_CONVERGED
     * replaces it at the converged counter's first honest reading. LEDGERED_LITERAL
     * and LEDGERED_WINDOW are UNTOUCHED at 11 and 62.
     */
    const LEDGERED_LITERAL = 11;
    const LEDGERED_WINDOW = 62;
    const LEDGERED_CONVERGED = 111;
    const worse: string[] = [];
    if (literal > LEDGERED_LITERAL) worse.push(`literal ${literal} > ${LEDGERED_LITERAL}`);
    if (window_ > LEDGERED_WINDOW) worse.push(`window ${window_} > ${LEDGERED_WINDOW}`);
    if (converged > LEDGERED_CONVERGED) worse.push(`converged ${converged} > ${LEDGERED_CONVERGED}`);

    if (worse.length > 0) {
        console.error(
            `\n[no-commandmanager] ❌ WORSE THAN DECLARED (exit 3): ${worse.join(' · ')}.`
            + `\n  gate-debt.json declares that this gate FAILS. It does not declare that P6 may be`
            + `\n  bypassed in more places than yesterday. Exit 3 is never absorbed by the ledger.`
            + `\n  Remove the new call site(s) — do NOT raise a LEDGERED_ constant.`,
        );
        return 3;
    }
    console.error(
        `\n[no-commandmanager] failing at its DECLARED level`
        + ` (literal ${literal}/${LEDGERED_LITERAL} · window ${window_}/${LEDGERED_WINDOW}`
        + ` · converged ${converged}/${LEDGERED_CONVERGED}); absorbable via gate-debt.json.`,
    );
    return 1;
}

process.exit(main());
