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
 * ─── Detector fidelity (2026-07-22) ─────────────────────────────────────────
 *
 * This gate had been RED on `main` since the CI gate in `deploy-fly.yml` started
 * reading it (§L-540-CI-GATE): raw count 64 vs threshold 55, i.e. every deploy
 * had to go out through `bypass_ci_gate`.  Bisecting the 64 against the tree the
 * threshold was set on gives an EXACT answer — 12 new matched lines, of which:
 *
 *   • 8  are `env.commandManager.execute(...)` inside
 *        `plugins/annotations/__tests__/persist-annotation.test.ts`, where
 *        `commandManager` is a LOCAL TEST DOUBLE — an object literal built by the
 *        test's own `makeEnv()` that runs canExecute/execute/undo.  It is not the
 *        legacy singleton and it is not a production mutation path.  Test files
 *        are excluded from the scan for exactly the reason `eslint.config.js`
 *        already exempts the `__tests__` globs from `boundaries/element-types` and
 *        `no-restricted-imports`: the layering contract governs production code.
 *
 *   • 4  are REAL, UNFIXED production regressions in
 *        `packages/room-topology/src/RoomTagAutoPopulator.ts` (room-tag create /
 *        update / delete).  ⚠ THESE ARE NOT EXCUSED BY ANY EXCLUSION BELOW — they
 *        are counted, and they are the reason the new threshold is 52 and not 48.
 *        They could NOT be migrated in this pass: the bus handler
 *        `annotation.create` writes the anchor-keyed Zustand `AnnotationsState`
 *        (id/viewId/kind/anchor/text), NOT the subsystem `annotationStore` that
 *        `AnnotationRenderLayer` reads and `ProjectSerializer` persists, and it
 *        has no field for the room tag's `parameters` (roomName / roomNumber /
 *        area / cachedLabel / areaLabel) or `modelPoints`.  Routing them through
 *        the bus today would re-open §G9-PERSIST — annotations computed, logged,
 *        then silently dropped.  The migration is BLOCKED on unifying those two
 *        annotation stores; do that first, then delete these four call sites.
 *
 * A second exclusion covers `typeof commandManager.execute !== 'function'`
 * CAPABILITY GUARDS (4 sites: IfcConversionContext, DetailViewTool,
 * LevelDatumLineBuilder, SectionGridLineBuilder).  Per this file's own definition
 * the subject is an "ACTUAL CALL"; a `typeof` test is not one, and counting it is
 * the same class of false positive as counting a comment.
 *
 * ─── §FIX-GATE-DEFEATABLE-BY-ALIASING (LANE G1, 2026-08-16) ─────────────────
 *
 * The hole recorded in the paragraph that used to stand here is CLOSED.  It read:
 *
 *   "⚠ KNOWN, DELIBERATE HOLE … it greps for the literal identifier, so aliasing
 *    the receiver defeats it.  Two sites in the tree already do exactly that and
 *    are invisible here … A text ratchet cannot close that; an AST/type-aware
 *    check would."
 *
 * Both halves of that were true, and the second half was the reason nothing
 * happened for a month.  What the hole actually cost, measured:
 *
 *     the gate's number   51
 *     the TRUE number    136
 *     the gap             85   —  62% of the real subject was invisible
 *
 * 85 production calls reached the legacy manager under a name the grep did not
 * know.  That is not a rounding error on a ratchet; it is most of the ratchet.
 *
 * ⚠ THE GAP WAS NOT MOSTLY THE TWO KNOWN SITES.  The old note named two.  The
 * census found EIGHTY-FIVE, and the largest single class was not an evasion at
 * all — it is ~40 bus handlers under `plugins/<pkg>/src/handlers/` that open with
 * (glob spelled out: a `*` followed by `/` would close this comment block)
 *
 *     const cm = window.commandManager as { execute(…): … } | undefined;
 *     …
 *     cm.execute(new SomeCommand(…));
 *
 * i.e. the bus handlers themselves fall back to the legacy manager, in the exact
 * layer (`plugins/`, L6) this gate exists to keep clean.  A gate that reported 51
 * while 136 were live was not *slightly* optimistic — it was reporting a different
 * subject and calling it P6 compliance.
 *
 * ── Two self-documented evasions, both now counted ──
 *
 *   packages/command-registry/src/annotations/AnnotateViewCommand.ts:199-203
 *     "Renamed from `commandManager` → `_cmdMgr` to satisfy CI gate (P3 / C14 §3
 *      ratchet) … Using an alias preserves identical runtime behaviour while
 *      keeping the ratchet count at threshold."
 *
 *   apps/editor/src/engine/views/PlanViewToolOverlay.ts:782-786 (scanned by the
 *   SIBLING gate, tools/ga-gate/check-no-commandmanager.ts, not this one)
 *     "bracket notation avoids `window.commandManager` GA gate pattern;
 *      functionally identical".
 *
 * A comment that states dodging the gate as its rationale is the defect the gate
 * was built to prevent, written down. Both spellings are detected now.
 *
 * ─── How the alias arms work (and why this is not an AST parser) ─────────────
 *
 * The old note said only an AST/type-aware check could close this. It is closable
 * without one, because the evasion has a *shape*: the manager must be BOUND to a
 * name before it can be called under that name. So:
 *
 *   ARM 1  LITERAL   — `commandManager.execute(` (what this gate always did).
 *   ARM 2  ALIAS     — bind any identifier whose initialiser RESOLVES to a command
 *                      manager, then count `<name>.execute(` inside that binding's
 *                      own block.  Covers `const cm = window.commandManager`,
 *                      `(window as any)['commandManager']`, `ws('commandManager')`,
 *                      `this.commandManagerRef.current`, `this._getCommandManager()`,
 *                      a `: CommandManager` constructor field (`this._cmd.execute`),
 *                      and a `: CommandManager` parameter.
 *   ARM 3  INDIRECT  — a function that TAKES a command manager and whose body
 *                      contains an arm-1/arm-2 hit IS the manager wearing a
 *                      function name; its call sites are counted.  One level of
 *                      closure, computed from the tree — not a hardcoded list.
 *                      Today that discovers exactly `executeHumanDirect` (14 IFC
 *                      converter call sites).
 *
 * RESOLVES is the load-bearing word and it is deliberately narrow: the initialiser
 * must END in a manager accessor. `new IfcStoreyLevelMapper(this.context.commandManager)`
 * MENTIONS the manager and is NOT a binding of it — injection is not aliasing, and
 * counting it would be exactly the "regress to noise" failure.
 *
 * ─── BOTH ORIGINAL EXCLUSIONS ARE PRESERVED, and now apply to every arm ──────
 *
 *   • test files (`__tests__/`, `*.test.ts`, `*.spec.ts`) — locally-constructed
 *     test doubles are not the legacy singleton.  Still 8 sites, still excluded.
 *   • `typeof …execute` CAPABILITY GUARDS — a feature test is not a call.  The
 *     alias arms require a literal `(` after `.execute`, so `typeof cm.execute
 *     !== 'function'` cannot match in the first place; the explicit filter is
 *     retained anyway.
 *
 * ─── Negative controls (run them; a gate you cannot see fail is UNPROVEN) ────
 *
 *   node scripts/check/ci-check-no-commandmanager.mjs --self-test
 *
 * asserts, on synthetic fixtures, that each evasion spelling IS caught and that a
 * test double / an injection / a capability guard is NOT.  It exits non-zero if
 * any control fails, so the arms cannot silently rot into either noise or zero.
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

import { resolve, relative, join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
// A.U.20 — script lives at scripts/check/; ROOT is two levels up.
const ROOT = resolve(__dirname, '..', '..');

// ─── Configuration ────────────────────────────────────────────────────────────

/**
 * Ratchet ceiling.  Lower this at each Phase 3 batch completion.
 *
 * 55 = actual non-comment call count after §TASK-07-PHASE-B:
 *   UpdateWallDimensionsHandler migrated from commandManager bridge to produceCommand
 *   (2026-05-18). Prior value: 56.
 *
 * 52 (2026-07-22) = the count under the two DETECTOR-FIDELITY exclusions added
 *   below (test doubles, `typeof …execute` capability guards).  It is NOT a raised
 *   ceiling: it is the true count of production call sites on the same tree that
 *   the raw grep scored as 64.  See "Detector fidelity" below for the arithmetic
 *   and for the one real regression this pass did NOT fix.
 *
 * 136 (2026-08-16, LANE G1) — ⚠ THE NUMBER WENT UP AND THAT IS THE GATE BECOMING
 *   HONEST, NOT A REGRESSION AND NOT A ROUTINE RE-PIN.  Read this before you
 *   quote either number.
 *
 *     old threshold   52   · old reading  51  (PASS, "1 headroom remaining")
 *     new threshold  136   · new reading 136  (literal 51 · alias 71 · indirect 14)
 *
 *   NOT ONE CALL SITE WAS ADDED.  52 was measured by a detector that could only
 *   see the un-aliased spelling `commandManager.execute`; 136 is measured by one
 *   that follows the manager through whatever name it travels under.  The old
 *   number was FALSE — it described `commandManager.execute` while the gate's own
 *   title claimed to enforce "no legacy commandManager.execute() sites", and 85
 *   such sites were live and uncounted.  The subject did not grow; the detector
 *   stopped lying about it.
 *
 *   The arm-1 count is 51 both before and after, which is the evidence that this
 *   is pure ADDITION rather than a re-definition chosen because it is bigger.
 *
 *   ⚠ A CEILING TO SHRINK, NOT A BUDGET TO SPEND.  85 of these were being spent
 *   invisibly; they are now visible and they are all still debt.  The next move
 *   on this constant must be DOWNWARD.  The largest single class — ~40 bus
 *   handlers under `plugins/<pkg>/src/handlers/` that fall back to
 *   `window.commandManager` — is also the most migratable, since those files
 *   already sit on the bus.
 *
 * 134 (2026-09-04, §P6-BUS-IS-THE-PATH) — THE FIRST DOWNWARD MOVE, and it is the
 *   move the paragraph directly above asked for.  Between the 08-16 pin and this
 *   one the reading drifted UP to 152 (lanes added 48 sites and removed 26), so
 *   this job was RED at +16 and every deploy needed `bypass_ci_gate`.
 *
 *     reading before   152   (literal 52 · alias 86 · indirect 14)   FAIL +16
 *     reading after    134   (literal 39 · alias 81 · indirect 14)   PASS
 *
 *   EIGHTEEN CALL SITES ARE GONE, NOT RENAMED — that distinction is the whole
 *   point of the alias arms, and this file's own header records the two evasions
 *   that made them necessary.  ONE OF THOSE TWO IS NOW CLOSED FOR REAL:
 *   `AnnotateViewCommand.ts` no longer binds `_cmdMgr`; it dispatches
 *   `annotation.create` on the bus, which is the migration its own TODO asked for.
 *
 *   All eighteen are the ANNOTATION WRITE PATH, one coherent subsystem.  They were
 *   migratable only because §ANN-ONE-STORE landed: the "Detector fidelity" note
 *   above records four of them (RoomTagAutoPopulator) as BLOCKED because
 *   `annotation.create` wrote a lossy ledger "NOT the subsystem `annotationStore`
 *   that `AnnotationRenderLayer` reads and `ProjectSerializer` persists".  That
 *   handler now takes a FULL `AnnotationElement` verbatim through
 *   `canonicalAnnotationSink`, so the blocker named in this file no longer exists.
 *   Three of those four moved; the fourth (`CreateManyAnnotationsCommand`) stays
 *   ON PURPOSE — it is ONE undo entry for N room tags (§ROOMTAG-ONE-COMMAND /
 *   L-1396) and there is no `annotation.createMany` verb, so splitting it would
 *   restore the twenty-four-Ctrl+Z defect that ticket removed.
 *
 *   ⚠ STILL A CEILING TO SHRINK.  134 is not a budget.  The largest remaining
 *   class is unchanged: the bus handlers under `plugins/<pkg>/src/handlers/` that
 *   fall back to `window.commandManager`.  The next move is DOWNWARD again.
 */
const THRESHOLD = parseInt(process.env.CM_EXECUTE_THRESHOLD ?? '134', 10);

/**
 * Directories to scan.  Intentionally excludes apps/ because
 * initBusHandlers.ts bridge scaffolding in apps/ is permitted transitional code.
 */
const SCAN_DIRS = ['packages', 'plugins'];

/**
 * ⚠ THE HONESTY FLOOR.  `packages/` + `plugins/` hold ~4,800 source files today.
 * 3,000 catches a bad cwd or a vanished subject tree without tripping on churn.
 * Below it the scan exits 2 — NOT 0 and NOT 1 — because a ratchet that PASSES on
 * an empty walk is the empty-seed lie: "0 findings" is meaningless without
 * "N examined".  A misconfiguration detector, never a target.
 */
const MIN_FILES = 3000;

/** Populated by findViolations(); printed so the subject size is never invisible. */
let SCAN_STATS = { files: 0, testDoubles: 0, helpers: [], literal: 0, alias: 0, indirect: 0 };

// ─── Scan ─────────────────────────────────────────────────────────────────────
//
// ⚠ THE `grep` SUBPROCESS IS GONE, and with it a whole defect class.  The old
// implementation shelled out to `grep -rn` and then re-parsed `path:line:text`
// out of stdout.  On Windows the `C:\…` drive letter WAS the first colon, so
// `lineNo` parsed as NaN and `text` held part of the PATH — the comment filter
// then inspected a path, matched nothing, and excluded no comments at all,
// inflating the local count to 128 against a true 64 while looking authoritative
// (fixed 2026-07-21; it had already caused one mis-diagnosed deploy blocker).
// Nothing below spawns a process or re-parses a string back into a location, so
// that class cannot recur — and the scan no longer needs `grep` on PATH at all.

/** Source extensions to walk. `.d.ts` is excluded (declarations, never calls). */
const EXTS = ['.ts', '.tsx'];

function walkDir(dir, out) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
            walkDir(p, out);
        } else if (EXTS.some(x => e.name.endsWith(x)) && !e.name.endsWith('.d.ts')) {
            out.push(p);
        }
    }
    return out;
}

/**
 * Replace every comment with spaces, preserving newlines AND byte offsets.
 *
 * Offset preservation is what lets every match below report a real line number
 * without re-parsing anything.  String bodies are deliberately KEPT: a service
 * locator reads `ws('commandManager')`, and blanking that would hide the alias.
 */
function stripComments(src) {
    const out = src.split('');
    const n = src.length;
    let i = 0;
    let mode = 0; // 0 code · 1 line comment · 2 block comment · 3 '' · 4 "" · 5 ``
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (mode === 0) {
            if (c === '/' && d === '/') { mode = 1; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            if (c === '/' && d === '*') { mode = 2; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
            if (c === "'")  { mode = 3; i++; continue; }
            if (c === '"')  { mode = 4; i++; continue; }
            if (c === '`')  { mode = 5; i++; continue; }
            i++; continue;
        }
        if (mode === 1) { if (c === '\n') { mode = 0; i++; continue; } out[i] = ' '; i++; continue; }
        if (mode === 2) {
            if (c === '*' && d === '/') { out[i] = ' '; out[i + 1] = ' '; mode = 0; i += 2; continue; }
            if (c !== '\n') out[i] = ' ';
            i++; continue;
        }
        if (c === '\\') { i += 2; continue; }
        if ((mode === 3 && c === "'") || (mode === 4 && c === '"') || (mode === 5 && c === '`')) { mode = 0; i++; continue; }
        i++;
    }
    return out.join('');
}

/** Blank string BODIES (keep the quotes) so quoted braces cannot skew depth counting. */
function blankStringBodies(src) {
    return src
        .replace(/'(?:[^'\\\n]|\\.)*'/g, m => "'" + ' '.repeat(Math.max(0, m.length - 2)) + "'")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, m => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
}

const lineAt = (src, idx) => {
    let n = 1;
    for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') n++;
    return n;
};

/**
 * Does an initialiser RESOLVE to a command manager?
 *
 * ⚠ THE ANTI-NOISE PREDICATE.  "Mentions the manager" is NOT the test — that is
 * how a counting gate turns into a wall of false positives nobody reads.  The
 * initialiser must END in a manager accessor.  Concretely:
 *
 *   const cm = window.commandManager              → YES, cm IS the manager
 *   const m  = new IfcStoreyLevelMapper(cm, …)    → NO,  injection, not aliasing
 *
 * Both mention `commandManager`; only the first can then be `.execute`d.
 */
function resolvesToManager(initialiser) {
    let rhs = initialiser.replace(/\s+/g, ' ');

    // Collapse balanced `{ … }` groups FIRST — an inline type literal
    // (`as { execute(c): { success: boolean } } | undefined`) otherwise leaves
    // cast debris that defeats every operand test below.  This is not cosmetic:
    // it alone was hiding a real call site in plugins/ceiling/.
    for (let i = 0; i < 12; i++) {
        const next = rhs.replace(/\{[^{}]*\}/g, ' ');
        if (next === rhs) break;
        rhs = next;
    }
    rhs = rhs
        .replace(/\bas\s+(unknown\s+as\s+)?[^,;)]*/g, '')  // drop `as X` casts
        .replace(/\?\./g, '.')                             // ?. → .  BEFORE ternary split
        .replace(/\s+/g, ' ')
        .trim();

    // `a ?? b`, `a || b`, `c ? a : b` — any operand resolving is enough, because
    // any of them may be the value that ends up bound to the name.
    for (let op of rhs.split(/\?\?|\|\||\?|:/)) {
        op = op.trim().replace(/[;,{]\s*$/, '').replace(/!\s*$/, '').trim();
        if (!op) continue;
        if (/\bnew\s+/.test(op)) continue;                                    // construction ≠ the manager
        if (/^[\w$.[\]'"]*\bcommandManager\b\s*\]?$/.test(op))       return true; // …commandManager / win['commandManager']
        // §FIX-PARENTHESISED-CAST-RECEIVER (2026-08-31) — the rule above anchors at
        // the START of the operand, so it fails the moment the receiver is wrapped:
        //     const cm = (window as unknown as { commandManager?: … }).commandManager;
        // leaves `(window ) .commandManager` after cast-stripping, which begins with
        // `(` and matches nothing. That spelling holds 2 of the executors in
        // apps/editor/src. ENDING in `.commandManager` is the same anti-noise test
        // ("must END in a manager accessor") without the start anchor; `new …` is
        // already excluded above, so an injection still cannot reach here.
        if (/\.\s*commandManager\s*$/.test(op))                       return true;
        if (/\[\s*['"]commandManager['"]\s*\]\s*$/.test(op))          return true; // (window as any)['commandManager']
        if (/\b_commandManager\s*$/.test(op))                         return true;
        if (/commandManagerRef\s*\.\s*current\s*$/.test(op))          return true;
        if (/getCommandManager\s*\([^)]*\)\s*$/.test(op))             return true; // this._getCommandManager()
        if (/\([^)]*['"]commandManager['"][^)]*\)\s*$/.test(op))      return true; // ws('commandManager')
    }
    return false;
}

/**
 * §FIX-OPTIONAL-CALL-INVISIBLE (2026-08-31) — the call tail, shared by every arm.
 *
 * ⚠ THIS CLOSED A HOLE THAT WAS ABOUT TO BE INHERITED. Every arm used to require a
 * literal `(` immediately after `.execute`, so the OPTIONAL-CALL spelling
 *
 *     cm.execute?.(new CreateRoofCommand({ … }))
 *
 * matched nothing — not arm 1, not arm 2, not arm 3. It is a call. It reaches the
 * legacy manager. It was invisible.
 *
 * Measured, by spelling, before the fix:
 *
 *     `.execute?.(`   apps/editor/src  64 lines   ·  packages/ + plugins/  1 (a test)
 *     `?.execute(`    apps/editor/src   1 line    ·  packages/ + plugins/  1
 *
 * The asymmetry is the whole point and it is WHY THIS HAD TO BE FIXED BEFORE THE
 * CONVERGENCE, not after. `packages/`+`plugins/` barely use the spelling, so this
 * detector looked complete on its own scope. `apps/editor/src` — the scope
 * `tools/ga-gate/check-no-commandmanager.ts` is about to hand over — uses it 64
 * times, and the WEAKER name-enumerating gate it replaces caught them (its
 * `\bcm\.execute\b` has no call-paren requirement at all). Converging first and
 * fixing later would have DROPPED ~60 live call sites out of measurement while
 * calling it a convergence: a narrowed gate wearing a stronger gate's name.
 *
 * `\s*\??\s*\.` also admits an optional RECEIVER (`ctx?.commandManager.execute(`),
 * the same syntax on the other side of the member access. `!` covers the non-null
 * ASSERTION call `cm.execute!(…)` (3 sites in HouseLayoutExecutor.ts) — three ways
 * to spell "call it if it is there", all of which call it.
 *
 * ⚠ The tail still ENDS at the call paren, so `executeChunked(` cannot match — that
 * method has no bus equivalent and counting it asserts a violation with no available
 * fix. There is a negative control for exactly that below.
 */
const CALL_TAIL = String.raw`\s*\??\s*\.\s*execute\s*(?:\?\.|!)?\s*\(`;

/** ARM 1 — the spelling this gate has always counted, plus both optional forms. */
const LITERAL_RE = new RegExp(`commandManager${CALL_TAIL}`, 'g');

/**
 * CAPABILITY-GUARD filter — PRESERVED from the original detector and now applied
 * to every arm.  `typeof x.execute !== 'function'` is a feature test, not a call;
 * counting it is the same false-positive class as counting a comment.
 */
const TYPEOF_GUARD_RE = /typeof\s+[\w.$[\]'"?!]*\s*\.\s*execute/;

/**
 * §FIX-MANAGER-TYPE-SUFFIXES (2026-08-31) — the type-name arm enumerated THREE
 * spellings and the tree uses NINE. Measured, as type annotations:
 *
 *   apps/editor/src        CommandManagerLike 38 · CommandManager 12 ·
 *                          CommandManagerReadable 2 · CommandManagerImpl 1
 *   packages/ + plugins/   CommandManager 61 · CommandManagerRef 7 ·
 *                          ICommandManagerLite 2 · ICommandManager 2 ·
 *                          CommandManagerLike 1 · CommandManagerImpl 1
 *
 * `CommandManagerLike` — the DOMINANT spelling in apps/editor/src, and the one the
 * old list did not have — is what every `_createSlab(cm: CommandManagerLike, …)` in
 * the layout executors is typed as. Enumerating type names is the same defect as
 * enumerating receiver names, one level up, so this matches the FAMILY.
 *
 * ⚠ Widening the TYPE pattern cannot manufacture a false positive on its own: an
 * alias only ever contributes a hit if `<name>.execute(` actually appears inside its
 * scope. A parameter typed `CommandManagerReadable` that is never `.execute`d still
 * counts zero.
 */
const MGR_TYPE = String.raw`I?CommandManager[A-Za-z]*`;

const BIND_RE       = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]*)?=\s*/g;
const CTOR_FIELD_RE = new RegExp(String.raw`\b(?:private|protected|public)\s+(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*:\s*${MGR_TYPE}\b`, 'g');
const PARAM_RE      = new RegExp(String.raw`(?:^|[(,])\s*([A-Za-z_$][\w$]*)\s*\??\s*:\s*${MGR_TYPE}\b`, 'g');
const FN_DECL_RE    = /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
const MGR_PARAM_RE  = /\b(?:commandManager|cmdMgr|cmdManager|cm|_cmd)\s*\??\s*:/;

/** End of the block ENCLOSING `from` — depth falls below 0. Used for `const` scope. */
function enclosingBlockEnd(braced, from) {
    let depth = 0;
    for (let i = from; i < braced.length; i++) {
        const c = braced[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth < 0) return i; }
    }
    return braced.length;
}

/**
 * [open, close] of the body block opened at/after `from` — for a function or a
 * parameter list.  `enclosingBlockEnd` is WRONG here: it starts at depth 0 and a
 * body's own braces never take it below 0, so it ran to EOF and made every
 * function inherit the next function's contents.  (Caught by this gate's own
 * self-test, which is why the self-test exists.)
 */
function bodyBlock(braced, from) {
    const open = braced.indexOf('{', from);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < braced.length; i++) {
        const c = braced[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return [open, i]; }
    }
    return [open, braced.length];
}

/**
 * §FIX-PARAM-SCOPE-IS-A-TYPE-LITERAL (2026-08-31) — body block of the function whose
 * PARAMETER LIST contains `from`.
 *
 * ⚠ `bodyBlock` is wrong for a parameter match and it failed SILENTLY, in the worst
 * direction: it takes the first `{` after the match, and in
 *
 *     private _createSlab(cm: CommandManagerLike, poly: ReadonlyArray<{ x: number }>): void {
 *
 * that `{` is the INLINE TYPE LITERAL still inside the parameter list. The alias
 * `cm` was therefore scoped to `{ x: number }` — nine characters — and every
 * `cm.execute(…)` in the real body fell outside it. The arm did not error; it just
 * quietly found nothing, which is the shape of every defect in this file's history.
 * That single mis-scope hid 16 live call sites across the three layout executors.
 *
 * The parameter list closes at the `)` that takes paren depth to -1 from the match.
 * After it a RETURN TYPE may itself be an object literal (`): { ok: boolean } {`), so
 * a block immediately followed by another `{` is a return type, not a body — walk
 * past at most three of those.
 */
function paramBodyBlock(braced, from) {
    let p = 0, close = -1;
    for (let i = from; i < braced.length; i++) {
        const c = braced[i];
        if (c === '(') p++;
        else if (c === ')') { if (--p < 0) { close = i; break; } }
    }
    if (close < 0) return null;
    let cursor = close + 1;
    for (let attempt = 0; attempt < 3; attempt++) {
        const blk = bodyBlock(braced, cursor);
        if (!blk) return null;
        const after = braced.slice(blk[1] + 1, blk[1] + 40).replace(/\s+/g, '');
        if (after.startsWith('{')) { cursor = blk[1] + 1; continue; }  // that was a return type
        return blk;
    }
    return null;
}

/**
 * End of the initialiser starting at `from`.
 *
 * A plain `[^;]+` capture is WRONG and hid real call sites: an inline type
 * literal contains its OWN semicolons (`{ success: boolean; info?: string[] }`),
 * so the capture stopped mid-cast and the operand tests then failed on debris.
 * Terminate on `;` at BRACKET DEPTH 0, or on a depth-0 newline that is not
 * followed by a continuation operator (so multi-line `?? …` chains still parse).
 */
function initialiserEnd(braced, from) {
    let depth = 0;
    for (let i = from; i < braced.length; i++) {
        const c = braced[i];
        if (c === '{' || c === '(' || c === '[') depth++;
        else if (c === '}' || c === ')' || c === ']') { if (--depth < 0) return i; }
        else if (c === ';' && depth === 0) return i;
        else if (c === '\n' && depth === 0) {
            if (!/^\s*(\?\?|\|\||&&|\?\.|[?:.|+])/.test(braced.slice(i + 1, i + 200))) return i;
        }
    }
    return braced.length;
}

const isTestPath = p =>
    /(^|\/)__tests__\//.test(p) || /\.(test|spec)\.tsx?$/.test(p);

/**
 * ARMS 1 + 2 for a single source. Returns { hits, isTest }.
 * `hits` are de-duplicated per line: one line is one call site, matching the
 * `wc -l` counting unit this ratchet has always used.
 *
 * EXPORTED as of §CONVERGE-CM-COUNTERS — see the "one detector" note in the header.
 * `tools/ga-gate/check-no-commandmanager.ts` calls it (via `scanLegacyManagerCallSites`)
 * so its own scope is measured by THIS detector rather than by a second, weaker,
 * name-enumerating one. Do not fork it.
 */
export function analyseSource(raw, relPath) {
    const code   = stripComments(raw);
    const braced = blankStringBodies(code);
    const lines  = raw.split('\n');
    const textOf = ln => (lines[ln - 1] ?? '').trim();
    const codeTextOf = ln => (code.split('\n')[ln - 1] ?? '');

    const hits = [];
    const seen = new Set();
    const add = (ln, kind, alias) => {
        if (seen.has(ln)) return;
        if (TYPEOF_GUARD_RE.test(codeTextOf(ln))) return;   // capability guard, not a call
        seen.add(ln);
        hits.push({ file: relPath, lineNo: ln, kind, alias, text: textOf(ln) });
    };

    // ARM 1 — literal
    for (const m of code.matchAll(LITERAL_RE)) add(lineAt(code, m.index), 'literal', 'commandManager');

    // ARM 2 — aliases
    const aliases = [];
    for (const m of braced.matchAll(BIND_RE)) {
        const name = m[1];
        if (name === 'commandManager') continue;             // arm 1 already owns it
        const s = m.index + m[0].length;
        const e = initialiserEnd(braced, s);
        if (!resolvesToManager(code.slice(s, e))) continue;
        aliases.push({ name, start: e, end: enclosingBlockEnd(braced, e), viaThis: false });
    }
    for (const m of braced.matchAll(CTOR_FIELD_RE)) {
        aliases.push({ name: m[1], start: 0, end: braced.length, viaThis: true });
    }
    for (const m of braced.matchAll(PARAM_RE)) {
        if (m[1] === 'commandManager') continue;
        const body = paramBodyBlock(braced, m.index + m[0].length);
        if (body) aliases.push({ name: m[1], start: body[0], end: body[1], viaThis: false });
    }

    for (const a of aliases) {
        const re = a.viaThis
            ? new RegExp(`this\\s*\\??\\s*\\.\\s*${a.name}${CALL_TAIL}`, 'g')
            : new RegExp(`(?<![\\w$.])${a.name}${CALL_TAIL}`, 'g');
        for (const m of code.slice(a.start, a.end).matchAll(re)) {
            add(lineAt(code, a.start + m.index), 'alias', a.name);
        }
    }

    return { hits, isTest: isTestPath(relPath) };
}

/**
 * Returns every PRODUCTION call site that reaches the legacy command manager,
 * under any spelling, across SCAN_DIRS.
 *
 * @returns {{ file: string, lineNo: number, kind: string, alias: string, text: string }[]}
 */
function findViolations(scanDirs = SCAN_DIRS, minFiles = MIN_FILES) {
    const files = [];
    for (const dir of scanDirs) {
        const absDir = resolve(ROOT, dir);
        if (existsSync(absDir)) walkDir(absDir, files);
    }

    // ⚠ HONESTY FLOOR. Counter arms pass at LOW numbers, so "walked nothing" and
    // "fully migrated" are otherwise the same reading. Below this the scan is
    // MISCONFIGURED (exit 2) — never a pass, never a fail.
    if (files.length < minFiles) {
        console.error(
            `[ci-check-no-commandmanager] FATAL -- only ${files.length} source files under ` +
            `${scanDirs.join(', ')} (floor ${minFiles}). Wrong cwd, or the subject tree vanished.`,
        );
        process.exit(2);
    }

    const parsed = files.map(f => {
        const raw = readFileSync(f, 'utf8');
        const rel = relative(ROOT, f).replace(/\\/g, '/');
        return { f, raw, rel, ...analyseSource(raw, rel) };
    });

    const production = [];
    let testDoubles = 0;
    for (const p of parsed) {
        if (p.isTest) { testDoubles += p.hits.length; continue; }
        production.push(...p.hits);
    }

    // ARM 3 — INDIRECT. A function that TAKES a command manager and whose body
    // contains an arm-1/arm-2 hit IS the manager wearing a function name. Its
    // call sites reach `commandManager.execute` just as surely as `cm.execute`
    // does. Discovered from the tree, never hardcoded, and one level deep only.
    const helpers = new Set();
    for (const p of parsed) {
        if (p.isTest || p.hits.length === 0) continue;
        const braced = blankStringBodies(stripComments(p.raw));
        const code   = stripComments(p.raw);
        for (const m of braced.matchAll(FN_DECL_RE)) {
            if (!MGR_PARAM_RE.test(m[2]) && !/:\s*(CommandManager|ICommandManager)\b/.test(m[2])) continue;
            const body = bodyBlock(braced, m.index + m[0].length);
            if (!body) continue;
            const from = lineAt(code, body[0]), to = lineAt(code, body[1]);
            if (p.hits.some(h => h.lineNo >= from && h.lineNo <= to)) helpers.add(m[1]);
        }
    }

    for (const p of parsed) {
        if (p.isTest) continue;
        const code  = stripComments(p.raw);
        const lines = p.raw.split('\n');
        for (const h of helpers) {
            for (const m of code.matchAll(new RegExp(`(?<![\\w$.])${h}\\s*\\(`, 'g'))) {
                const ln = lineAt(code, m.index);
                const text = (lines[ln - 1] ?? '').trim();
                if (/\bfunction\s+/.test(text)) continue;                       // the declaration itself
                if (production.some(v => v.file === p.rel && v.lineNo === ln)) continue;
                production.push({ file: p.rel, lineNo: ln, kind: 'indirect', alias: h, text });
            }
        }
    }

    production.sort((a, b) => a.file.localeCompare(b.file) || a.lineNo - b.lineNo);
    SCAN_STATS = {
        files: files.length,
        testDoubles,
        helpers: [...helpers],
        literal:  production.filter(v => v.kind === 'literal').length,
        alias:    production.filter(v => v.kind === 'alias').length,
        indirect: production.filter(v => v.kind === 'indirect').length,
    };
    return production;
}

/**
 * §CONVERGE-CM-COUNTERS (WAVE 2 LANE B, 2026-08-30) — THE SINGLE DETECTOR.
 *
 * The repo carried TWO call-site counters for one concept, over disjoint scopes:
 *
 *   THIS gate                              packages/ + plugins/   3 arms, 14 controls
 *   tools/ga-gate/check-no-commandmanager  apps/editor/src        3 fixed-name regexes
 *
 * They were never scope rivals — each header says so. They were METHOD rivals, and
 * the WEAKER detector owned a scope. `check-no-commandmanager.ts` enumerates the
 * NAMES `commandManager.execute`, `cmdMgr.execute`, `window.commandManager` and
 * `cm.execute`; it therefore reports a LOWER number the moment a receiver is bound
 * to any fifth name — the exact evasion this file's §FIX-GATE-DEFEATABLE-BY-ALIASING
 * section measured at 85 invisible sites, and the exact defect CLAUDE.md records as
 * "THIS GATE CLASSIFIES BY NAME, so it can be satisfied by RENAMING".
 *
 * Worse than under-counting: a rename LOWERS that gate's `cm.execute` counter, and
 * its counters auto-ratchet DOWNWARD on improvement. A pure rename therefore banked
 * a permanent, fake improvement. That is a ratchet paying out for an evasion.
 *
 * This export is the convergence. `check-no-commandmanager.ts` now measures its own
 * scope with the arms below, so there is ONE definition of "a call site reaching the
 * legacy command manager" in the repo. The two gates keep separate scopes and
 * separate ceilings — deliberately, because that gate's LITERAL ceiling is a hard 0
 * that is currently BREACHED, and folding a breached hard-0 into this file's soft
 * threshold would launder it.
 *
 * @param {string[]} scanDirs  repo-relative directories to walk
 * @param {number}   minFiles  honesty floor; below it the scan exits 2, never 0
 */
export function scanLegacyManagerCallSites(scanDirs, minFiles) {
    const violations = findViolations(scanDirs, minFiles);
    return { violations, stats: { ...SCAN_STATS } };
}

// ─── Negative controls (`--self-test`) ────────────────────────────────────────
//
// ⚠ A GATE YOU CANNOT SEE FAIL IS UNPROVEN.  Reading the regex is not evidence
// that it catches anything, and a detector that quietly stops matching reports a
// beautiful 0.  These fixtures assert BOTH directions on every arm:
//
//   POSITIVE — each evasion spelling IS counted.  If one stops being caught, the
//              gate has re-opened the hole it was built to close.
//   NEGATIVE — a locally-built test double, an INJECTION (`new Foo(cm)`), and a
//              `typeof …execute` capability guard are NOT counted.  If one starts
//              being caught, the gate has regressed to noise, which is the other
//              way to make it useless.
//
// Both lists are load-bearing. Run: node scripts/check/ci-check-no-commandmanager.mjs --self-test

const SELF_TESTS = [
    // ── POSITIVE: must be CAUGHT ────────────────────────────────────────────
    ['literal — the original spelling', 1, `
        function f(ctx) { ctx.commandManager.execute(new CreateWallCommand()); }`],

    ['alias — const cm = window.commandManager', 1, `
        function f() {
            const cm = window.commandManager;
            cm.execute(new CreateWallCommand());
        }`],

    ['alias — bracket notation, the PlanViewToolOverlay evasion', 1, `
        function f() {
            const _lvl = (window as any)['commandManager'] as { execute(c: unknown): void } | undefined;
            if (_lvl) { _lvl.execute(new AddLevelCommand({})); }
        }`],

    ['alias — rename to _cmdMgr, the AnnotateViewCommand evasion', 1, `
        function f(ctx) {
            const _cmdMgr = ctx?.commandManager ?? (typeof window !== 'undefined' ? window.commandManager : null);
            _cmdMgr.execute(cmd);
        }`],

    ['alias — multi-line inline type literal with its own semicolons', 1, `
        function f() {
            const cm = window.commandManager as
              | {
                  execute(
                    cmd: unknown,
                    options?: unknown,
                  ): { success: boolean; affectedElementIds: string[]; info?: string[] };
                }
              | undefined;
            if (cm) { cm.execute(batch); }
        }`],

    ['alias — service locator by string key', 1, `
        function f() {
            const cm = ws<any>('commandManager');
            if (!cm) return;
            cm.execute(new RemoveGridCommand({}));
        }`],

    ['alias — ref.current', 1, `
        function f() {
            const cm = this.commandManagerRef.current;
            cm.execute(cmd);
        }`],

    ['alias — constructor field typed CommandManager', 1, `
        class CopyPasteTool {
            constructor(private readonly _cmd: CommandManager) {}
            paste() { const result = this._cmd.execute(cmd); return result; }
        }`],

    ['alias — ternary initialiser', 1, `
        function f() {
            const cm = typeof window !== 'undefined' ? window.commandManager : undefined;
            if (!cm || typeof cm.execute !== 'function') return;
            cm.execute(new CreateAnnotationCommand(element));
        }`],

    // §FIX-OPTIONAL-CALL-INVISIBLE — the spelling that dominates apps/editor/src
    // (64 lines) and that EVERY arm used to miss. Verified by mutation: revert
    // CALL_TAIL to `\s*\.\s*execute\s*\(` and these three score 0.
    ['alias — OPTIONAL CALL, the OfficeBuildingExecutor spelling', 1, `
        function f() {
            const cm = window.commandManager as { execute?(c: unknown): void } | undefined;
            cm.execute?.(new CreateRoofCommand({}));
        }`],

    ['alias — optional receiver AND optional call', 1, `
        function f() {
            const cm = window.commandManager;
            cm?.execute?.(new CreateFloorCommand({}));
        }`],

    ['literal — optional call on the literal receiver', 1, `
        function f(ctx) { ctx.commandManager.execute?.(new CreateWallCommand()); }`],

    ['alias — non-null ASSERTION call, the HouseLayoutExecutor spelling', 1, `
        function f() {
            const cm = window.commandManager;
            cm.execute!(new CreateWallOpeningsBatchCommand(mapped));
        }`],

    // §FIX-MANAGER-TYPE-SUFFIXES — CommandManagerLike is the DOMINANT annotation in
    // apps/editor/src (38 sites) and the old three-name list did not have it.
    ['alias — parameter typed CommandManagerLike', 1, `
        class OfficeBuildingExecutor {
            private _createRoof(cm: CommandManagerLike, levelId: string): void {
                cm.execute?.(new CreateRoofCommand(createId('roof'), {}));
            }
        }`],

    // §FIX-PARAM-SCOPE-IS-A-TYPE-LITERAL — an inline type literal LATER in the same
    // parameter list used to become the alias's whole scope. Verified by mutation:
    // swap paramBodyBlock back to bodyBlock and this fixture scores 0.
    ['alias — param scope survives an inline type literal in the same param list', 1, `
        class ResidentialBuildingExecutor {
            private _createSlab(cm: CommandManagerLike, poly: ReadonlyArray<{ x: number; z: number }>): void {
                cm.execute?.(new CreateSlabCommand({}));
            }
        }`],

    ['alias — param scope survives an object RETURN TYPE', 1, `
        class E {
            private _mk(cm: CommandManagerLike, id: string): { ok: boolean } {
                cm.execute(new CreateStairCommand({}));
                return { ok: true };
            }
        }`],

    // ⚠ NEGATIVE for the same fix: the widened scope must stop at the body's close,
    // not leak into the NEXT method. Without a bound, one manager-typed parameter
    // would claim every `.execute(` in the rest of the file.
    ['NEGATIVE — param alias does not leak into the next method', 1, `
        class E {
            private _a(cm: CommandManagerLike): void { cm.execute(new A()); }
            private _b(cm2: SomethingElse): void { cm.execute(new B()); }
        }`],

    // §FIX-PARENTHESISED-CAST-RECEIVER — the ApartmentLayoutExecutor spelling.
    ['alias — parenthesised cast receiver', 1, `
        function f() {
            const cm = (window as unknown as { commandManager?: { execute(c: unknown): void } }).commandManager;
            if (cm) { cm.execute(new BatchCreateRoomsCommand(graphRooms)); }
        }`],

    // ── NEGATIVE: must NOT be caught ────────────────────────────────────────

    // ⚠ THE ANTI-NOISE CONTROL FOR CALL_TAIL. `executeChunked` is a DIFFERENT
    // method (CommandManagerImpl only) with no bus equivalent, so counting it
    // asserts a violation that has no available fix — the sibling gate's
    // §FIX-P6-GATE-PRECISION records the same correction. Widening the tail to
    // admit `?.` must not widen it to admit a longer method name.
    ['NEGATIVE — executeChunked is a different method, not execute', 0, `
        function f() {
            const cm = window.commandManager;
            cm.executeChunked(cmds);
        }`],

    ['NEGATIVE — injection, not aliasing (new Foo(commandManager))', 0, `
        function f(ctx) {
            const mapper = new IfcStoreyLevelMapper(ctx.commandManager, ctx.bimManager, []);
            mapper.execute(step);
        }`],

    // ⚠ THIS ONE DISCRIMINATES and the one above does not — keep both.
    // Verified by mutation: deleting the \`new\` exclusion in resolvesToManager()
    // makes THIS fixture score 1, because the service-locator rule matches a
    // quoted 'commandManager' argument regardless of what is being constructed.
    // \`new AuditTrail('commandManager')\` is an audit object TAGGED with the
    // manager's name, not the manager — counting its .execute() is exactly the
    // "regress to noise" failure. The IfcStoreyLevelMapper fixture above is a
    // realistic shape but is over-determined (no rule matches it either way),
    // so it pins intent without proving the guard.
    ['NEGATIVE — constructed-with-a-name is not the manager', 0, `
        function f() {
            const audit = new AuditTrail('commandManager');
            audit.execute(step);
        }`],

    // ⚠ HONEST NOTE, verified by mutation: this fixture does NOT prove the
    // TYPEOF_GUARD_RE filter. Every arm now requires a literal '(' after
    // .execute, and a typeof test has none — so the guard is already excluded
    // structurally and deleting the filter changes nothing here. The filter is
    // retained as defence-in-depth (it WAS load-bearing for the old substring
    // detector, which matched 'commandManager.execute' with no call paren), and
    // this fixture is kept as a regression pin. Do not cite it as proof.
    ['NEGATIVE — capability guard is a feature test, not a call', 0, `
        function f() {
            const cm = window.commandManager;
            if (!cm || typeof cm.execute !== 'function') { return { success: false }; }
            return { success: true };
        }`],

    ['NEGATIVE — locally-built object literal that merely has .execute', 0, `
        function makeEnv() {
            const fake = { execute: (c) => ({ success: true }), undo: () => {} };
            fake.execute(cmd);
            return fake;
        }`],

    ['NEGATIVE — the bus path, which is the whole point of migrating', 0, `
        async function f(cmd) {
            await window.runtime?.bus?.executeCommand('level.add', { levelId: cmd.id });
        }`],

    ['NEGATIVE — comments and JSDoc describing the legacy path', 0, `
        /**
         * Migrate commandManager.execute() to the bus.
         * const cm = window.commandManager; cm.execute(x);
         */
        function f() { /* cm.execute(y) — historical note */ }`],
];

function runSelfTest() {
    console.log('');
    console.log(BANNER);
    console.log('  NEGATIVE CONTROLS -- alias-aware detector');
    console.log(BANNER);
    let failures = 0;
    for (const [name, expected, src] of SELF_TESTS) {
        const { hits } = analyseSource(src, 'fixture/Sample.ts');
        const got = hits.length;
        const ok  = got === expected;
        if (!ok) failures++;
        console.log(
            `  ${ok ? 'PASS' : 'FAIL'}  expected ${expected}, got ${got}  --  ${name}`,
        );
        if (!ok) for (const h of hits) console.log(`          L${h.lineNo} (${h.kind}:${h.alias}) ${h.text.slice(0, 80)}`);
    }
    console.log(BANNER);
    if (failures > 0) {
        console.log(`  ${failures} CONTROL(S) FAILED -- the detector is not doing what this file claims.`);
        console.log(BANNER);
        console.log('');
        return 1;
    }
    console.log(`  All ${SELF_TESTS.length} controls pass (${SELF_TESTS.filter(t => t[1] > 0).length} positive, ${SELF_TESTS.filter(t => t[1] === 0).length} negative).`);
    console.log(BANNER);
    console.log('');
    return 0;
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

/**
 * §CONVERGE-CM-COUNTERS-CALLER (2026-08-31) — THE ENTRYPOINT GUARD, and it is the
 * half of the convergence that was MISSING, not a tidy-up.
 *
 * §CONVERGE-CM-COUNTERS exported `analyseSource` / `scanLegacyManagerCallSites` so
 * `tools/ga-gate/check-no-commandmanager.ts` could measure ITS scope with THIS
 * detector. That export was UNUSABLE as shipped, and the failure was silent-adjacent
 * rather than obvious: every statement below used to sit at module top level, so
 *
 *     import { analyseSource } from '.../ci-check-no-commandmanager.mjs'
 *
 * ran the whole packages/+plugins/ scan as an import side effect and then called
 * `process.exit(1)` — the importer's own code never got a turn. Measured before this
 * guard: a probe that did nothing but import the module and print the export names
 * exited 1 having printed this gate's FAIL banner, and never printed the names.
 *
 * That is why "the caller half never landed": there was nothing callable to land.
 *
 * `import.meta.url` vs the resolved `argv[1]` is the standard ESM main test, and it
 * is exact here — `pathToFileURL(resolve(entry))` normalises the Windows drive letter
 * and separators that a raw string compare would get wrong.
 */
const IS_DIRECT_RUN = (() => {
    const entry = process.argv[1];
    if (!entry) return false;
    try { return import.meta.url === pathToFileURL(resolve(entry)).href; }
    catch { return false; }
})();

function runGate() {
    if (process.argv.includes('--self-test')) process.exit(runSelfTest());

    console.log('');
    console.log(BANNER);
    console.log('  CI gate: legacy commandManager.execute() -- Phase 3 exit ratchet');
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
        console.log('  Call sites reaching the legacy command manager (non-comment):');
        console.log('');
        const sorted = [...byFile.entries()].sort(([, a], [, b]) => b.length - a.length);
        for (const [file, lines] of sorted) {
            console.log('    [' + lines.length + ']  ' + file);
            for (const { lineNo, text, kind, alias } of lines) {
                const snippet = text.trim().slice(0, 82);
                console.log('         L' + lineNo + ' (' + kind + ':' + alias + '): ' + snippet);
            }
        }
        console.log('');
    }

    // State the subject size and the per-arm split. A gate that prints only its
    // verdict cannot be told apart from a gate that walked nothing — and this gate
    // spent a month printing 51 while 136 were live.
    console.log(BANNER);
    console.log('  Files scanned:           ' + SCAN_STATS.files + '  (floor ' + MIN_FILES + ')');
    console.log('  Arms:                    literal ' + SCAN_STATS.literal +
                '  ·  alias ' + SCAN_STATS.alias +
                '  ·  indirect ' + SCAN_STATS.indirect);
    console.log('  Executor helpers:        ' + (SCAN_STATS.helpers.join(', ') || '(none)'));
    console.log('  Excluded test doubles:   ' + SCAN_STATS.testDoubles);
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
}

if (IS_DIRECT_RUN) runGate();
