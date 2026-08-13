// ─── GATE · check-generation-is-consequential  (C80 §7, GEN-GAP-1) ───────────
//
// C80 §7's gate table names this gate and, at C80's stamp, marked it
// **UNBUILT — NAMED GAP, UNPROVEN**. This is it. C80's own words for what it
// must assert and when it exits:
//
//   "§1. At least one generation runs as a bus verb over a plan object;
//    execute consumes the previewed plan; no destructive dispatch is
//    fire-and-forget (§1.5)"
//   exit: "≥ 1 generation verb discovered (a run reading 0 is MISCONFIGURED,
//          not passing), and 0 `void bus.executeCommand` sites inside
//          generator clear loops"
//
// ── THE TWO ARMS ─────────────────────────────────────────────────────────────
//
//   (a) DISCOVERY — at least one generation-family verb is REGISTERED on the
//       bus. C80 §7's exit condition is emphatic that a reading of 0 is
//       MISCONFIGURED rather than passing, and the reason is the §7.1 /
//       C69 §3.5 subject-floor rule: this gate's headline is an ABSENCE
//       ("no generation verb dispatches fire-and-forget"), and an absence
//       computed over an empty subject is a perfect score over an unread
//       world. So arm (a) is a FLOOR, not a finding — a run that discovers no
//       verb exits 2, never 0 and never 1.
//
//       ⚠ It is a floor for a second reason, specific to THIS gate. If verb
//       discovery breaks — a renamed handler, a moved glob, a regex that stops
//       matching — the detector for arm (b) has nothing to inspect, and arm
//       (b) would then report "0 violations" because it looked at nothing.
//       Exit 2 is the only honest verdict for a broken detector.
//
//   (b) SHAPE — every discovered generation verb routes through
//       PLAN-OR-TYPED-REFUSAL and never fire-and-forget mutation. Statically:
//       the handler's `execute` must produce a typed refusal
//       (`capabilityRefused` / a `refusal:` field) or a `ConsequencePlan`, and
//       the file must contain no direct store write and no `void`-dispatched
//       command. C80 §10.f names the prohibited shape by name:
//       `void bus.executeCommand(...)` + `catch {}`.
//
// ── WHY THE CHECK IS STATIC, SAID PLAINLY ────────────────────────────────────
//
// C16 CA-21 is the standing rule that liveness is proven by an EXECUTED
// read-back, never declared, and this gate's arm (b) is a SOURCE check. That
// is a real limitation and it is stated rather than hidden:
//
//   arm (b) proves the handler CONTAINS no mutation site. It does not prove
//   that dispatching it mutates nothing.
//
// The executed half of that proof lives where it can be executed — in
// `plugins/rooms/__tests__/roomRegenerate.test.ts`, which dispatches
// `room.regenerate` through a REAL CommandBus over a REAL RoomStore and reads
// the store back byte-for-byte (C80 §1.5). This gate cites that suite rather
// than duplicating it, because a certification gate that re-implements a
// package's own test certifies its copy. What the STATIC arm adds that the
// test cannot is COVERAGE: the test knows about one verb, and this arm sweeps
// every generation-family verb that will ever be registered, including ones
// nobody wrote a test for. The two are complementary, and neither is
// sufficient alone.
//
// ── WHAT THIS GATE CANNOT SEE (stated so the table is never read as coverage)
//
//   (i)  The NINE UI-controller generators (C80 §0.1(1)) are NOT bus verbs, so
//        they are invisible to a bus-verb sweep — including
//        `HouseLayoutExecutor.ts:1757-1766`, the exact §GRAPH-CLEAR-FIRST loop
//        that was MEASURED destroying a hand-drawn room. This gate going green
//        says NOTHING about them. That is reported as a finding on every run,
//        not as a silence.
//   (ii) C80 §1.1's full seven-step loop — plan · validate · preview ·
//        approve-or-blind · execute-the-same-plan · reconcile · undo — is not
//        asserted here. A verb that REFUSES exercises none of the middle five,
//        by construction. Plan/execution binding is C78 §9/§10's and is gated
//        by `check-approval-binding` / `check-execution-plan-agreement`.
//   (iii) Every arm is single-client (C80 §7.3(c)).
//
// ── NEGATIVE-TESTED (C80 §7.2 — "an untested gate is worse than no gate") ────
//
// ⚠ AN EARLIER DRAFT OF THIS HEADER CLAIMED THIS SECTION'S WORK WAS DONE. It
// was not, and the claim is corrected here rather than deleted, because a gate
// that describes negative tests it never ran is the precise defect C80 §7.2
// exists to prevent — an unknown converted into a false green by prose.
//
// Every detector was driven with a planted violation, and TWO FAILED TO FIRE
// and had to be widened before they could be trusted. The failures are recorded
// next to the patterns they fixed (see FORBIDDEN_SHAPES) because they are the
// same class of defect twice: a detector anchored to ONE SPELLING of its
// subject reports the absence of that spelling, not the absence of the thing.
//
// ⭐ RE-DRIVEN INDEPENDENTLY 2026-08-13, by a second author, after the session
// that first wrote this section was killed mid-sentence. That re-run is the
// reason the claims below may be relied on: a negative-test claim inherited
// from a session nobody watched finish is exactly the unverified assertion C74
// §6.2 calls UNPROVEN. Every plant was re-applied to a pristine copy, the exact
// exit code recorded, and the file restored and md5-verified byte-identical
// (869678a2…) afterwards. All five reproduced; none was found false.
//
//   arm (a) DISCOVERY — `readonly type` renamed 'room.regenerate' →
//     'room.rebuildXYZ' ⇒ 0 verbs discovered ⇒ exit 2 MISCONFIGURED. ✔ fired
//     (it drops BOTH floors — discovery 0<1 AND routes-proven 0<1 — because a
//     discovery that found nothing leaves arm (b) inspecting nothing.)
//   arm (b) POSITIVE HALF — the `refusal:` field and the `capabilityRefused(`
//     call removed ⇒ "NO plan-or-refusal route", proven-routes floor 0 < 1 ⇒
//     exit 2 MISCONFIGURED. ✔ fired
//   arm (b) STORE WRITE — `void (_ctx as any).stores.room.set('planted', {})`
//     ⇒ ✘ DID NOT FIRE (run byte-identical to the clean one). The pattern
//     required the literal identifier `ctx`; the handler's parameter is
//     `_ctx`. Widened, re-planted ⇒ exit 3. ✔ fires
//   arm (b) FIRE-AND-FORGET — `try { void (_ctx as any).bus.executeCommand(…) }
//     catch {}` ⇒ the empty-`catch {}` half fired, the `void`-dispatch half
//     ✘ DID NOT (the cast's parentheses broke the identifier chain). Widened,
//     re-planted ⇒ both halves fire (2 findings) ⇒ exit 3. ✔ fires
//   arm (b) IMMER MUTATION — `const _p = produceCommand(_ctx, 'room', () => {})`
//     ⇒ exit 3. ✔ fires
//     ⚠ THIS ROW WAS MISSING until the 2026-08-13 re-drive, and its absence is
//     the one real defect that audit found. The section above said "every ARM
//     was driven", which was true — but `produceCommand` is a fourth
//     FORBIDDEN_SHAPE inside arm (b), and an arm-grain claim silently covered a
//     detector nobody had ever watched fail. Per C74 §6.2 that made it
//     UNPROVEN while reading as tested. It has now been driven; the row exists
//     so the next reader counts FIVE plants against four shapes plus discovery,
//     and notices immediately if a sixth shape is added without one.
//
// The two ✘ misses above are themselves reproducible rather than merely
// asserted: the superseded narrow patterns (`\bctx\s*\.stores…` and
// `\bvoid\s+[\w.$]*\bexecuteCommand\s*\(`) were re-tested against the exact
// planted strings on 2026-08-13 and both return false where the widened ones
// return true. A recorded miss that cannot be re-demonstrated is a story; this
// one is a measurement.
//
// Every plant was reverted and the handler verified byte-identical to its
// pre-plant copy afterwards.
//
// ── ALSO VERIFIED (cwd-independence, the REPO_ROOT fix below) ────────────────
// Run from `tools/rac-conformance/certification` AND from the repository root
// on 2026-08-13: both read 290 handler files and 1 verb. The anchoring fix
// recorded at REPO_ROOT is therefore load-bearing and still holds.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const harnessErrors: string[] = [];

/**
 * The handler files a bus verb can be declared in — the SAME globs
 * `tools/ga-gate/check-chat-capability-coverage.ts` uses, deliberately, so the
 * two gates cannot disagree about which files declare commands.
 */
const HANDLER_GLOBS = [
  'plugins/*/src/handlers/*.ts',
  'apps/editor/src/engine/initBusHandlers.ts',
  'apps/editor/src/engine/engineLauncher.ts',
];

/**
 * WHAT COUNTS AS A GENERATION-FAMILY VERB. C80 §9 explicitly declines to fix
 * the verb SHAPE ("`house.regenerate` vs `level.regenerate` vs a generic
 * `generation.run` is a C16/C69 decision, made when the first one is
 * written"), so this pattern matches the FAMILY rather than one spelling:
 * any verb whose action segment is `regenerate` or `generate`.
 *
 * ⚠ TWO EXISTING VERBS ARE DELIBERATELY EXCLUDED, and C80 §0.1(1) names both
 * with the reason: `GENERATE_STAIR_GEOMETRY` and `ai.floorplan.generate` are
 * "the only generate-shaped verbs … neither of which regenerates an area".
 * `GENERATE_STAIR_GEOMETRY` is a legacy SCREAMING_SNAKE CommandType, not a
 * dot-namespaced bus verb, so the pattern below misses it by construction.
 * `ai.floorplan.generate` IS dot-namespaced and would match — it is excluded
 * by name below, with its reason, rather than by a pattern that happens to
 * skip it. An exclusion nobody can see is an exclusion nobody can review.
 */
const GENERATION_VERB_RE = /^[a-z][\w-]*(?:\.[\w-]+)*\.(?:re)?generate(?:[A-Z][\w-]*)?$/;

const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'ai.floorplan.generate',
    'C80 §0.1(1) — a floorplan PROPOSAL service, not a pass that regenerates an existing area over mixed provenance. It replaces nothing, so the authority question does not arise.',
  ],
]);

const HANDLER_TYPE_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:public\s+|readonly\s+|static\s+)*type\s*` +
    String.raw`(?::\s*'([a-z][\w-]*(?:\.[\w-]+)*)'|(?::\s*[^=\n;]+)?=\s*'([a-z][\w-]*(?:\.[\w-]+)*)')`,
  'g',
);

/**
 * ⭐ THE GATE MUST ANCHOR TO THE REPO ROOT, NOT TO ITS CWD. Caught on this
 * gate's own first honest run, and recorded rather than quietly patched.
 *
 * `HANDLER_GLOBS` are repo-relative, and `git ls-files` resolves pathspecs
 * relative to the CURRENT DIRECTORY — but this gate's documented invocation is
 * `cd tools/rac-conformance/certification && npx tsx gates/…`, exactly as
 * `check-authored-state-protection` is run in C80 §0. From there the globs
 * matched **0 files**, and the gate reported:
 *
 *   floor  handler files swept …: measured 0, min 150 ❌
 *   → [2] MISCONFIGURED
 *
 * ⭐ That is the §7.1 subject floor doing precisely the job it exists for: the
 * arms would otherwise have reported "0 violations" over a world they never
 * read — a perfect score from a detector pointed at nothing. The floor is the
 * reason this defect surfaced as an exit 2 instead of a false green, and it is
 * why the floor is not softened here. Instead the SUBJECT is fixed: every path
 * is resolved from the repository root, so the gate reads the same files from
 * any cwd. `readFileSync` is anchored for the same reason.
 */
const REPO_ROOT = (() => {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    console.error(
      '\n[check-generation-is-consequential] MISCONFIGURED (exit 2) — not inside a git work tree, ' +
        'so the repository root could not be resolved and the subject cannot be anchored.',
    );
    process.exit(2);
  }
})();

/**
 * §GIT-CRASH-IS-MISCONFIG (L-811) — `git ls-files` throwing propagates as node
 * exit 1, the same code a real violation produces and therefore absorbable as
 * debt. A gate that cannot list its subject has judged nothing: exit 2.
 */
function gitLsFiles(): string[] {
  try {
    return execSync(
      `git ls-files --cached --others --exclude-standard -- ${HANDLER_GLOBS.map((g) => `"${g}"`).join(' ')}`,
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: REPO_ROOT },
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !f.includes('__tests__'));
  } catch (err) {
    console.error(
      '\n[check-generation-is-consequential] MISCONFIGURED (exit 2) — git ls-files failed, so the subject could not be listed.' +
        `\n  cwd: ${process.cwd()}` +
        `\n  ${(err as Error).message.split('\n')[0]}` +
        '\n  A gate that cannot enumerate its files has not judged them. This is NOT a pass.',
    );
    process.exit(2);
  }
}

/**
 * The `check-chat-capability-coverage` floor idiom: the handler sweep must have
 * REACHED its subject before any count computed over it means anything.
 * Measured on this tree 2026-08-12: 294 handler files. Set well below so
 * routine additions and deletions do not trip it, and well above zero so a
 * broken glob or a wrong cwd does.
 */
const MIN_HANDLER_FILES = 150;

// ── The mutation / fire-and-forget shapes arm (b) forbids ────────────────────
//
// Each carries the C80 clause it enforces, so a failure text can name the rule
// rather than a regex.
const FORBIDDEN_SHAPES: readonly { re: RegExp; what: string; clause: string }[] = [
  {
    // ⭐ WIDENED BY THE SAME NEGATIVE TEST THAT WIDENED THE STORE-WRITE SHAPE
    // BELOW. The first version was `\bvoid\s+[\w.$]*\bexecuteCommand\s*\(`,
    // which requires an unbroken identifier/dot chain between `void` and the
    // call. A planted `void (_ctx as any).bus.executeCommand('room.delete',{})`
    // did NOT match — the parentheses of the cast end the chain — so the exact
    // C80 §10.f shape, wearing a cast, walked past the detector that exists to
    // catch it. The empty `catch {}` on the same planted line DID fire, which
    // is how the miss was noticed: one half of a two-part defect reported.
    //
    // Anchored now on the CALL rather than on the receiver's spelling: any
    // `executeCommand(` whose result is discarded by a preceding `void`,
    // however the receiver is written.
    re: /\bvoid\s+[^;\n]*?\bexecuteCommand\s*\(/,
    what: 'a `void`-dispatched bus command (the outcome is never read)',
    clause: 'C80 §1.5 / §10.f — "a destruction whose outcome the caller never reads is not an operation; it is a hope"',
  },
  {
    re: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\s*|\/\*[\s\S]*?\*\/\s*)*\}/,
    what: 'an empty `catch {}` (the failure path is swallowed)',
    clause: 'C80 §10.f — the fire-and-forget half that makes a failed destruction invisible',
  },
  {
    // ⭐ WIDENED BY A NEGATIVE TEST THAT FAILED TO FIRE. The first version of
    // this pattern was anchored to the literal identifier `ctx`. A planted
    // `void (_ctx as any).stores.room.set('planted', {})` inside
    // `RegenerateRooms.execute()` produced a run IDENTICAL to the clean one —
    // no finding, exit 1 at the declared level. The handler's parameter is
    // named `_ctx` (it is deliberately unused), and a cast breaks the chain
    // besides, so the detector could not see a real mutation planted in the
    // one file this gate exists to police.
    //
    // A detector matching one spelling of its subject is a detector that
    // reports the ABSENCE of that spelling, not the absence of the mutation.
    // The context parameter can be named anything and may be cast on the way
    // to `.stores`, so the anchor is `.stores.<store>.<mutator>(` — the shape
    // that is actually forbidden — with any receiver expression before it.
    re: /[\w)\]]\s*\.stores\s*\.\s*[\w$]+\s*\.\s*(?:set|add|remove|delete|update|clear)\s*\(/,
    what: 'a direct write to a store off the handler context (`….stores.<store>.<mutator>(…)`)',
    clause: 'C80 §1.5 — a generation pass that cannot proceed safely performs NO mutation; a verb that refuses and also writes has refused nothing',
  },
  {
    re: /\bproduceCommand\s*\(/,
    what: 'a produceCommand() Immer mutation',
    clause: 'C80 §1.5 — same rule: a refusal accompanied by patches is not a refusal',
  },
];

/** The shapes that PROVE the plan-or-typed-refusal route (arm (b) positive half). */
const PLAN_OR_REFUSAL_SHAPES: readonly { re: RegExp; what: string }[] = [
  { re: /\bcapabilityRefused\s*\(/, what: 'the capabilityRefused() constructor' },
  { re: /\brefusal\s*:/, what: 'a `refusal:` field on the HandlerResult' },
  { re: /\bConsequencePlan\b/, what: 'a ConsequencePlan return' },
  { re: /\bplannedOutcome\s*\(/, what: 'the plannedOutcome() constructor' },
];

/**
 * ⭐ STRIP COMMENTS BEFORE SHAPE-MATCHING. Caught by this gate's own first run,
 * and recorded because the failure was instructive rather than embarrassing:
 * the run reported `room.regenerate` containing "an empty `catch {}`" — and it
 * did, **inside a prose header quoting the forbidden shape in order to explain
 * why it is forbidden.** A gate that reads documentation as code punishes the
 * files that document themselves best and rewards the ones that say nothing.
 *
 * The same defect ran in the other direction on the positive half: the header's
 * sentence about returning "a ConsequencePlan" was counted as PROOF that the
 * handler returns one. It does not. **A detector that credits a file for
 * describing a behaviour it does not have is worse than one that misses it** —
 * it manufactures a green.
 *
 * Both arms therefore run over CODE ONLY. Deliberately conservative: this is a
 * lexical strip, not a parser, and a `//` inside a string literal would take a
 * line with it. That direction of error is safe here — it can only HIDE a
 * violation from arm (b), never invent one, and arm (b)'s findings are the
 * side that must not be fabricated. The negative tests plant real code, so a
 * strip that over-reached would be caught by them going quiet.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/([^:'"`\\])\/\/.*$/gm, '$1');
}

interface DiscoveredVerb {
  readonly verb: string;
  readonly file: string;
  /** COMMENTS STRIPPED — see {@link stripComments} for why this is not raw. */
  readonly source: string;
}

function run(): GateResult {
  const files = gitLsFiles();
  floors.push({
    what: 'handler files swept (a sweep that reached no file has judged nothing)',
    measured: files.length,
    min: MIN_HANDLER_FILES,
  });

  // ══ ARM (a) — DISCOVERY ════════════════════════════════════════════════════
  const discovered: DiscoveredVerb[] = [];
  const excludedSeen: string[] = [];

  for (const file of files) {
    let source: string;
    try {
      // Comments stripped for BOTH arms: a `readonly type = 'x.regenerate'`
      // quoted inside a header must not register a verb that does not exist,
      // any more than a quoted `catch {}` may register a violation.
      // Anchored at REPO_ROOT for the same reason `git ls-files` is: the
      // listed paths are repo-relative and this gate is run from its own
      // directory.
      source = stripComments(readFileSync(join(REPO_ROOT, file), 'utf8'));
    } catch (e) {
      harnessErrors.push(`could not read ${file}: ${String(e).slice(0, 160)}`);
      continue;
    }
    HANDLER_TYPE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HANDLER_TYPE_RE.exec(source)) !== null) {
      const verb = m[1] ?? m[2];
      if (!verb) continue;
      if (!GENERATION_VERB_RE.test(verb)) continue;
      if (EXCLUDED.has(verb)) {
        excludedSeen.push(verb);
        continue;
      }
      discovered.push({ verb, file, source });
    }
  }

  lines.push(
    `(a) DISCOVERY — ${files.length} handler file(s) swept; ` +
      `${discovered.length} generation-family bus verb(s) registered: ` +
      (discovered.length > 0 ? discovered.map((d) => `'${d.verb}'`).join(' · ') : '(none)'),
  );
  for (const v of excludedSeen) {
    lines.push(`(a) excluded by name — '${v}': ${EXCLUDED.get(v)}`);
  }

  // C80 §7's exit condition, verbatim: "a run reading 0 is MISCONFIGURED, not
  // passing". This is a FLOOR, so 0 short-circuits to exit 2 before arm (b)'s
  // absence can be mistaken for a clean bill of health.
  floors.push({
    what:
      'generation-family bus verbs discovered (C80 §7: "a run reading 0 is MISCONFIGURED, not passing" — ' +
      'and a discovery that found nothing leaves arm (b) inspecting nothing)',
    measured: discovered.length,
    min: 1,
  });

  // ══ ARM (b) — PLAN-OR-TYPED-REFUSAL, NEVER FIRE-AND-FORGET ═════════════════
  let routesProven = 0;
  for (const d of discovered) {
    const proofs = PLAN_OR_REFUSAL_SHAPES.filter((s) => s.re.test(d.source));
    if (proofs.length === 0) {
      findingNames.push(
        `(b) '${d.verb}' (${d.file}) routes through NEITHER a typed refusal NOR a ConsequencePlan. ` +
          'C80 §1.1: a generation is a consequential operation, and the two legal outcomes (C78 §1.1) ' +
          'are a plan or a typed statement of why no plan. A third outcome — mutate and report nothing — ' +
          'is the shape C16 CA-18 prohibits and C80 §0 measured destroying a hand-drawn room.',
      );
      lines.push(`(b) '${d.verb}' → NO plan-or-refusal route ❌`);
    } else {
      routesProven += 1;
      lines.push(`(b) '${d.verb}' → routes via ${proofs.map((p) => p.what).join(' + ')} ✓`);
    }

    for (const shape of FORBIDDEN_SHAPES) {
      if (shape.re.test(d.source)) {
        findingNames.push(
          `(b) '${d.verb}' (${d.file}) contains ${shape.what}. ${shape.clause}.`,
        );
        lines.push(`(b) '${d.verb}' → FORBIDDEN SHAPE: ${shape.what} ❌`);
      }
    }
  }

  // The positive half is a FLOOR as well as a finding source. A detector that
  // proved zero routes over a non-empty discovery set is a detector that stopped
  // matching — the same class of silent failure as arm (a) reading 0.
  floors.push({
    what: 'generation verbs whose plan-or-typed-refusal route was PROVEN (a prover that proves none has stopped matching)',
    measured: routesProven,
    min: 1,
  });

  // ══ THE STANDING FINDING — what a green run here does NOT cover ════════════
  //
  // C80 §7.3's rule, applied to this gate: the table is never read as coverage.
  // This is a FINDING rather than a comment because a comment does not appear
  // in the exit code, and the whole defect C80 §0 measured lives in the files
  // this arm cannot see.
  findingNames.push(
    '(c) THE NINE UI-CONTROLLER GENERATORS ARE OUT OF REACH — house, apartment, office, residential, ceiling, ' +
      'furnish and lighting layout executors plus two ai-host services are NOT bus verbs (C80 §0.1(1)), so a ' +
      'bus-verb sweep cannot see them. That includes HouseLayoutExecutor.ts:1757-1766, the §GRAPH-CLEAR-FIRST ' +
      'loop MEASURED destroying a human-drawn room on 2026-08-12 (check-authored-state-protection clause (b): ' +
      'seeded=2 · remaining=0 · the authored room survived=false). A green run on this gate says NOTHING about ' +
      'them. Exit: each executor either dispatches a generation bus verb, or the store-side protection route ' +
      '(C80 §9 / 0B OPEN QUESTION 8) is chosen in writing.',
  );
  lines.push(
    '(c) SCOPE: this gate certifies BUS VERBS. The nine UI-controller generators are outside it and are ' +
      'reported as a standing finding above, never as a silence.',
  );
  lines.push(
    '(c) The EXECUTED half of arm (b) — zero store mutation measured through a real bus over a real store — ' +
      'lives in plugins/rooms/__tests__/roomRegenerate.test.ts (C16 CA-21). This arm is STATIC and proves ' +
      'containment, not runtime behaviour; it is cited rather than duplicated.',
  );

  for (const err of harnessErrors) {
    lines.push('harness error: ' + err);
    findingNames.push('harness error (never merged with "no change"): ' + err.slice(0, 160));
  }

  return {
    gate: 'check-generation-is-consequential',
    floors,
    lines,
    findings: findingNames.length,
    // NEWLY MEASURED. C80 §7's table marked this gate UNBUILT/UNPROVEN, and
    // C70 §7.1's rule is that a gate lands before its implementation and lands
    // RED. MEASURED 2026-08-12 = 1: the nine UI-controller generators, which a
    // bus-verb sweep structurally cannot reach. Its exit condition is stated in
    // the finding itself. C80 §8.1 governs the way down: this level drops in the
    // commit that adds the real arm, never by reclassification.
    declared: 1,
    findingNames,
  };
}

try {
  process.exit(reportGate(run()));
} catch (e) {
  console.error('check-generation-is-consequential: harness threw — MISCONFIGURED\n', e);
  process.exit(2);
}
