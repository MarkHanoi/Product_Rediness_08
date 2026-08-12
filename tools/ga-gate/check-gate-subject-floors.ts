#!/usr/bin/env tsx
/**
 * RATCHET R5 — every gate must have a SUBJECT FLOOR.
 *
 * Anchor: docs/01-strategy/STR-03-engineering-vision.md (§CONTEXT-DATA-HONESTY)
 * Kin:    tools/ga-gate/lib/sourceScan.ts §FIX-GATE-NEEDS-RIPGREP (L-811)
 *         tools/ga-gate/lib/xssSinkWalk.ts MIN_SCANNED_FILES
 *         tools/ga-gate/check-no-direct-store-writes.ts MIN_FILES (the first one)
 *
 * ─── What this gate is for ───────────────────────────────────────────────────
 * A META-GATE. Its subject is the other gates.
 *
 * This repository has now been bitten four separate times by the SAME defect
 * shape, and every time the symptom was a gate reporting a clean number over a
 * tree it had never read:
 *
 *   L-774  `spawnSync('npx', …)` without `shell: true` cannot execute `npx.cmd`
 *          on win32. All 25 gates returned status 1 with NO output; the runner
 *          faithfully reported 25 FAILED, including gates that passed seconds
 *          earlier in isolation.
 *   L-809  `eslint-plugin-boundaries` had no `import/resolver`, so it could not
 *          resolve `@pryzm/*` — which is how essentially every cross-package
 *          import in this repo is written. The rule was set to 'error' and
 *          silently checked almost nothing.
 *   L-811  Fourteen gates shelled out to `rg`, which is not a declared
 *          dependency and which `ci.yml` never installed. They died with
 *          `spawnSync rg ENOENT` — and because they were ALSO on
 *          `gate-debt.json`, the permanent red was absorbed as "known debt"
 *          while the gate measured nothing. When check-three-imports was finally
 *          ported, P2 turned out to have been CLEAN the whole time.
 *   (batch-9) check-xss-guards resolved its root to `/C:/…` via
 *          `new URL(...).pathname`, every readdir threw, the error was
 *          swallowed, and it printed "✅ 0 violations" over an unscanned tree.
 *
 * In all four the observable state was identical to success. That is the
 * §CONTEXT-DATA-HONESTY law — FAILURE AND EMPTINESS ARE NEVER THE SAME VALUE —
 * violated inside the very machinery that is supposed to enforce it.
 *
 * A SUBJECT FLOOR is the cheapest possible insurance. It is one constant and one
 * comparison: assert that the walk reached at least N files (or routes, or
 * subjects) before believing any number it produces, and if it did not, exit 2 —
 * MISCONFIGURED — which is a different fact from exit 1, FAILED, and from exit 0,
 * PASSED. Three states, three exit codes, no aliasing.
 *
 * ─── What counts as floored ──────────────────────────────────────────────────
 * A gate is FLOORED when, across its own source and the transitive closure of the
 * `./lib/*` modules it imports:
 *
 *   (a) a floor is DECLARED — a `minFiles:` argument at a scan call-site, or a
 *       `MIN_…FILES` / `MIN_…ROUTES` / `MIN_…SUBJECTS` constant; and
 *   (b) `process.exit(2)` is reachable — the misconfiguration exit.
 *
 * Comments are stripped before matching, so a gate cannot become "floored" by
 * merely writing the word MIN_FILES in its header. That matters: check-raf-count
 * mentions "MIN_FILES floor" in a comment and keeps the actual floor in
 * lib/rafOwners.ts — it is floored, but for the transitive reason, not the
 * textual one.
 *
 * The generic SCAN ENGINES (lib/sourceScan.ts, lib/xssSinkWalk.ts) are excluded
 * as a SOURCE OF THE DECLARATION, though they still supply (b). The floor VALUE
 * is a per-gate judgement about a per-gate subject; importing an engine that
 * *supports* floors is not the same as having chosen one. Gate-specific libs
 * (lib/rafOwners.ts, lib/writeRouteScan.ts, …) DO supply the declaration,
 * because that is where those gates legitimately keep it.
 *
 * ─── §R5-BASELINE — dated justification ──────────────────────────────────────
 * MEASURED 2026-08-11 on branch `main`.
 *
 * The Rev-2 engineering audit recorded "31 of 32 gates lack a MIN_FILES subject
 * floor — only check-no-direct-store-writes.ts:136 has one". That number is
 * already historical: the L-811 remediation pass is live and several gates
 * acquired floors as they were ported off ripgrep (check-three-imports,
 * check-raf-count, check-cast-count, check-single-compose, check-domain-purity,
 * check-visibility-intent-not-ui, check-xss-guards, check-write-route-auth,
 * check-otel-spans, check-zoning-fidelity-label, and this pass's
 * check-scene-graph and check-geometry-ceiling).
 *
 * The baseline below is therefore NOT the audit's 31. It is what this gate
 * actually measures today, recorded honestly rather than inherited. Restating a
 * stale number as if it were a measurement is the same error class this whole
 * ratchet exists to prevent.
 *
 * MEASURED: 32 gates inspected · 13 floored · **19 UNFLOORED** ← the baseline.
 * Two of the 19 (check-l7-boundary, check-project-isolation) have an exit-2 path
 * for a missing baseline file or a resolution failure but declare no floor over
 * their SUBJECT, which is the weaker half of the idiom and worth naming
 * separately rather than folding into "no floor at all".
 *
 * The 19 are dominated by the gates that still shell out to `rg`/`grep`/`awk`/
 * `wc` through execSync — a gate that never reads a file has nothing to floor,
 * so R5 and the L-811 ripgrep port shrink together and must not be double-counted
 * as separate work.
 *
 * The ratchet is SHRINK-ONLY: the count may fall, never rise. A NEW gate arrives
 * floored or it does not arrive. The target is 0 — at which point this gate
 * becomes a hard-fail-at-zero invariant and the baseline constant is deleted.
 *
 * Set PRYZM_R5_MAX_UNFLOORED to lower the ceiling as gates are fixed.
 *
 * Exit: 0 = at or under baseline · 1 = over baseline · 2 = meta-scan misconfigured
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const GATE_DIR = join(REPO_ROOT, 'tools', 'ga-gate');
const LIB_DIR = join(GATE_DIR, 'lib');
const LABEL = 'gate-subject-floors';

/**
 * §R5-BASELINE — see the dated paragraph above. Shrink-only.
 *
 * ─── 19 → 10 (2026-08-11, same session that set 19) ──────────────────────────
 * Lowered to the measured value, NOT because anything got harder, but because
 * leaving it at 19 was nine gates of slack — and slack in a shrink-only ratchet
 * is the exact defect this suite spent the day removing.
 *
 * 19 was measured before the L-811 port landed. That port gave subject floors to
 * nine gates in one stroke (custom-event-packages/-apps, commandmanager-any,
 * structuredclone-new-commands, window-store-in-packages, no-workspacemountbridge,
 * no-commandmanager, l7-boundary, motion-gate-coverage), so the reading is now
 * 10 unfloored of 36 inspected — and R5 and the ripgrep port shrink together, as
 * the gate's own header says, because a gate that never reads a file has nothing
 * to floor.
 *
 * Had 19 been left in place, nine gates could have LOST their floors again with
 * the gate still printing green. That is precisely `check-otel-spans`' old
 * HARD_FLOOR of 213 against a measured 255: 42 files of headroom in which a
 * regression was invisible. A ceiling above the measurement is not a safety
 * margin — it is a blind spot with a number on it.
 *
 * Lowering a shrink-only ceiling to its measured value is always safe and is
 * never the thing the doctrine forbids. The forbidden move is RAISING one.
 */
/**
 * 10 → 9 (2026-08-11, later the same day). The R4 report-payload-discard gate and
 * the refusal-identity gate both landed WITH subject floors, so the measurement
 * moved and the ceiling follows it down. Leaving 10 would have banked a gate of
 * slack — and slack is what let check-otel-spans sit 42 files above its floor.
 * Lowering a shrink-only ceiling to its measured value is always safe; the
 * forbidden move is raising one.
 */
/**
 * ─── 9 → 0 (2026-08-11, C9 "the gate suite is honest") ───────────────────────
 * THE RATCHET IS AT ZERO. All 40 gates declare a subject floor and can reach
 * exit 2. The reading arrived there three ways, and the split matters because
 * two of them were defects in THIS gate rather than in the gates it accused:
 *
 *   • EIGHT gates were genuinely unfloored and were floored in this pass —
 *     apps-editor-ghost-dirs, ctrl-z-wired, declared-project-scopes,
 *     engine-bootstrap-loc, height-fidelity, layer-boundaries,
 *     per-package-compile, project-isolation, chat-capability-coverage.
 *   • TWO were FALSE ACCUSATIONS by this meta-gate: check-verb-liveness
 *     (MIN_VERBS/MIN_LEDGER_ROWS/MIN_CENSUS, all compared, exit 2 via a
 *     `die(2, …)` helper) and check-collab-graph-integrity (floors imported from
 *     its harness outside tools/ga-gate). Both were floored the whole time. See
 *     FLOOR_DECL_RE / EXIT2_RE / EXT_IMPORT_RE for the widenings — a meta-gate
 *     that judges where a floor is SPELLED measures spelling, and a gate that
 *     accuses an innocent is the same defect as one that misses a guilty party
 *     (§FIX-ZONING-GATE-MISSLICE).
 *
 * The constant stays at 0 rather than being deleted, so a NEW gate that arrives
 * unfloored exits 3 (RATCHET EXCEEDED) with the offender named, instead of this
 * file needing to be re-derived from scratch. Zero is now an invariant, not a
 * ceiling: it can never be raised.
 */
const MAX_UNFLOORED = Number(process.env.PRYZM_R5_MAX_UNFLOORED ?? 0);

/**
 * ⚠ THIS GATE'S OWN SUBJECT FLOOR. It would be an exquisite irony to ship a
 * meta-gate about subject floors that reported "0 unfloored gates" because it
 * failed to find any gates at all. 32 gate files exist today; 20 tolerates
 * consolidation without tolerating a broken path.
 */
const MIN_GATES = 20;

/**
 * Generic scan engines. They provide the exit-2 machinery but NOT the floor
 * value — see the header for why that distinction is deliberate.
 */
const ENGINE_LIBS = new Set(['sourceScan.ts', 'xssSinkWalk.ts']);

/** Strip line and block comments so a header mention cannot fake a floor. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * A floor DECLARED. Three accepted forms:
 *   • `minFiles:` at a scan call-site (the sourceScan idiom),
 *   • a MIN_… constant whose NAME names a subject (FILES/ROUTES/SUBJECTS/…),
 *   • ANY `MIN_…` constant that is actually COMPARED against a measurement
 *     (`x.length < MIN_VERBS`, `if (rows.length < MIN_LEDGER_ROWS)`).
 *
 * ⚠ THE THIRD FORM WAS ADDED 2026-08-11 BECAUSE THIS GATE WAS ACCUSING AN
 * INNOCENT (§FIX-ZONING-GATE-MISSLICE, the same class). `check-verb-liveness.ts`
 * declares MIN_VERBS / MIN_LEDGER_ROWS / MIN_CENSUS, compares all three, and exits
 * 2 below any of them — a textbook subject floor — and this meta-gate reported it
 * as "no floor constant AND no exit-2 path", because the names did not end in one
 * of five approved nouns and the exit went through a `die(2, …)` helper.
 *
 * A meta-gate that judges FLOOR NAMING rather than FLOOR BEHAVIOUR measures
 * spelling. Keyed on the comparison and on any exit-2 path, it measures the thing
 * it claims to. Note the third form still requires a comparison — declaring an
 * unused MIN_ constant does not buy a pass.
 */
const FLOOR_DECL_RE = /\bminFiles\s*:|\bMIN_[A-Z0-9_]*(?:FILES|ROUTES|SUBJECTS?|SCANNED|OWNERS)[A-Z0-9_]*\b|[<>]=?\s*MIN_[A-Z0-9_]+\b|\bMIN_[A-Z0-9_]+\s*[<>]/;

/**
 * The misconfiguration exit. Without it a floor is a wish, not a gate.
 * `die(2, …)` / `exit(2)` helpers count: what matters is that exit code 2 — the
 * never-absorbable one — is reachable, not that the call is spelled inline.
 */
const EXIT2_RE = /process\.exit\(2\)|\bdie\(\s*2\b|\bexit\(\s*2\b/;

/**
 * Local lib imports, resolved back to `lib/<name>.ts`. Two shapes, because a
 * gate reaches its libs as `./lib/x.js` while a lib reaches its siblings as
 * `./x.js` — missing the second form silently truncated the closure at depth 1
 * and mis-reported check-raf-count (whose floor is in lib/rafOwners.ts and whose
 * exit-2 is one hop further, in lib/sourceScan.ts) as unfloored.
 */
const LIB_IMPORT_RE = /from\s+['"]\.(?:\/lib)?\/([A-Za-z0-9_-]+)\.js['"]/g;

/**
 * Relative imports that leave `tools/ga-gate/` entirely — e.g.
 * `../../apps/sync-server/src/collab-gate/collabGraphIntegrity.js`.
 *
 * ⚠ ADDED 2026-08-11, second false accusation of the day. A gate may legitimately
 * keep its harness — and therefore its floor constants — in the workspace whose
 * dependencies it needs; `check-collab-graph-integrity.ts` imports
 * MIN_COMPARED_ELEMENTS / MIN_COMPARED_RELATIONSHIPS from exactly such a module.
 * With the closure truncated at `./lib/*`, this meta-gate reported it as
 * unfloored. Same defect as the `die(2, …)` miss below: judging where a floor is
 * WRITTEN rather than whether one is ENFORCED. One hop, resolved on disk, and only
 * files that exist are read — an unresolvable specifier contributes nothing rather
 * than being assumed benign.
 */
const EXT_IMPORT_RE = /from\s+['"](\.\.[^'"]*)\.js['"]/g;

interface Closure {
  /** Text that may DECLARE a floor: gate + gate-specific libs, no engines. */
  readonly declText: string;
  /** Text that may supply process.exit(2): everything, engines included. */
  readonly allText: string;
  readonly libs: string[];
}

function buildClosure(gateFile: string): Closure {
  const seen = new Set<string>();
  let declText = '';
  let allText = '';
  const libs: string[] = [];

  const root = stripComments(readFileSync(gateFile, 'utf8'));
  declText += root;
  allText += root;

  const queue: string[] = [];
  for (const m of root.matchAll(LIB_IMPORT_RE)) queue.push(`${m[1]}.ts`);

  // One hop OUTSIDE tools/ga-gate — a harness module may hold the floor.
  for (const m of root.matchAll(EXT_IMPORT_RE)) {
    const p = join(GATE_DIR, `${m[1]}.ts`);
    if (!existsSync(p)) continue;
    const text = stripComments(readFileSync(p, 'utf8'));
    declText += '\n' + text;
    allText += '\n' + text;
    libs.push(m[1]!);
  }

  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const p = join(LIB_DIR, name);
    if (!existsSync(p)) continue;
    libs.push(name);
    const text = stripComments(readFileSync(p, 'utf8'));
    allText += '\n' + text;
    if (!ENGINE_LIBS.has(name)) declText += '\n' + text;
    for (const m of text.matchAll(LIB_IMPORT_RE)) queue.push(`${m[1]}.ts`);
  }

  return { declText, allText, libs };
}

// ── Walk the gates ───────────────────────────────────────────────────────────
if (!existsSync(GATE_DIR)) {
  console.error(
    `\n[${LABEL}] MISCONFIGURED (exit 2) — gate directory not found: ${GATE_DIR}\n` +
    `  Root: ${REPO_ROOT}\n` +
    `  This is NOT a pass.`,
  );
  process.exit(2);
}

const gateFiles = readdirSync(GATE_DIR)
  .filter((f) => /^check-.*\.ts$/.test(f))
  .filter((f) => f !== basename(import.meta.filename ?? 'check-gate-subject-floors.ts'))
  .sort();

if (gateFiles.length < MIN_GATES) {
  console.error(
    `\n[${LABEL}] MISCONFIGURED (exit 2) — found only ${gateFiles.length} gate file(s); floor is ${MIN_GATES}.\n` +
    `  Dir: ${GATE_DIR}\n` +
    `  A meta-gate that found no gates has measured nothing. This is NOT a pass.`,
  );
  process.exit(2);
}

const unfloored: Array<{ file: string; why: string }> = [];
const floored: string[] = [];

for (const f of gateFiles) {
  const { declText, allText } = buildClosure(join(GATE_DIR, f));
  const hasDecl = FLOOR_DECL_RE.test(declText);
  const hasExit2 = EXIT2_RE.test(allText);
  if (hasDecl && hasExit2) { floored.push(f); continue; }
  unfloored.push({
    file: f,
    why: !hasDecl && !hasExit2 ? 'no floor constant AND no exit-2 path'
      : !hasDecl ? 'has an exit-2 path but declares no subject floor'
      : 'declares a floor but has no reachable process.exit(2)',
  });
}

console.log(
  `[${LABEL}] gates inspected: ${gateFiles.length} · floored: ${floored.length} · ` +
  `unfloored: ${unfloored.length} · ceiling: ${MAX_UNFLOORED}`,
);

if (unfloored.length > MAX_UNFLOORED) {
  console.error(
    `\n[${LABEL}] FAIL: ${unfloored.length} gate(s) lack a subject floor; the shrink-only ceiling is ${MAX_UNFLOORED}.`,
  );
  for (const u of unfloored) console.error(`      ${u.file}  — ${u.why}`);
  console.error(
    `\n  A gate without a subject floor cannot tell "0 violations" from "walked nothing".\n` +
    `  Add a MIN_… constant and exit 2 below it — see tools/ga-gate/lib/sourceScan.ts\n` +
    `  (scanFiles' minFiles) or check-no-direct-store-writes.ts:137 for the idiom.\n` +
    `  The ceiling is SHRINK-ONLY: it never rises. A new gate arrives floored.`,
  );
  // §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7, L-836) — exit 3, not 1. MAX_UNFLOORED is
  // a shrink-only ratchet; exit 1 is the code gate-debt.json is allowed to absorb.
  // Being ledgered would declare "this gate fails", never "more blind gates are
  // acceptable than yesterday". This gate in particular must not be absorbable:
  // it is the one that detects the blindness the ledger has twice hidden.
  process.exit(3);
}

if (unfloored.length > 0) {
  console.log(`[${LABEL}] ${unfloored.length} gate(s) still unfloored (at or under the ${MAX_UNFLOORED} ceiling):`);
  for (const u of unfloored) console.log(`      ${u.file}  — ${u.why}`);
  console.log(`[${LABEL}] OK: at or under the shrink-only ceiling. Target is 0.`);
} else {
  console.log(`[${LABEL}] OK: every one of the ${gateFiles.length} gates declares a subject floor. Ratchet reached 0 — retire MAX_UNFLOORED.`);
}
