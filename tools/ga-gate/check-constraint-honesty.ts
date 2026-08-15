#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-constraint-honesty.ts
 *
 * C74 §3.1/§3.2/§3.5 · C70 **G-INV-1** + **G-INV-2** · BIM30-READINESS-GATES
 * §3.12 — **no adapter reports a solve it did not perform, and every constraint
 * family's declared strength has executable evidence AT THAT STRENGTH.**
 *
 * ─── RESIDENCY (BIM30-READINESS-GATES §2.1a), justified rather than assumed ──
 * `tools/ga-gate/`, registered in `run-all.ts`. The boundary test is one
 * question: *does this gate need something that does not exist until something
 * runs?* **No.** Both arms establish their subject by reading the tree at HEAD:
 * G-INV-1 by scanning adapter classes and their delegation targets, G-INV-2 by
 * parsing the rule registrations out of `ConstraintEngine.ts` source and
 * cross-referencing every executable-evidence site in the repo.
 *
 * The tempting alternative — import `constraintEngine` and drive it — is worse
 * on both counts. It is EXECUTED (a DOM shim, because the engine touches
 * `window` at module scope: `ConstraintEngine.ts:110`, and three composition
 * files in `apps/editor/src/engine/consequence/` say so in their headers), so
 * it would belong in `certification/gates/`; and it would answer the WRONG
 * question. G-INV-2 asks *does executable evidence exist for this family at its
 * declared strength* — that is a property of the repository, not of one run. A
 * gate that ran the engine itself would BE the evidence, which is the
 * self-certifying shape C70 §5.6 forbids: the instrument cannot also be the
 * subject's only witness.
 *
 * ─── HOW THIS IS SCOPED AWAY FROM `check-solver-is-real` ────────────────────
 * They share a package and share nothing else. `check-solver-is-real` (C74
 * §3.3/§3.7) asks two EXTERNAL questions — *is the named engine a declared
 * dependency of some manifest* (R1), and *does a selector conflate
 * not-configured with configured-but-failed* (R2), plus dead capability (R3).
 * Every one of those is answered against `package.json` and control flow.
 *
 * This gate asks two INTERNAL questions that no manifest can answer:
 *   • **H1/H2** — is a class's DELEGATION consistent with its DECLARED identity,
 *     and does a stand-in signal itself at its own boundary at CALL TIME? A
 *     dependency can be perfectly declared and the adapter still delegate 100 %
 *     of its work to a `Mock*`. `check-solver-is-real` would call that clean.
 *   • **H3** — the constraint-FAMILY half. `check-solver-is-real` has no notion
 *     of a rule family at all; it never opens `ConstraintEngine.ts`.
 * Concretely: no file, no symbol and no arm key is shared. `check-solver-is-real`
 * keys are `R1|R2|R3::…`; these are `H1|H2|H3|H5::…`. If both fire on the
 * same file they are reporting different defects in it.
 *
 * **`loadRelay` (`packages/ai-host/src/AnthropicRelay.ts:187`) is NOT in this
 * gate's subject, and that is a decision, not an oversight.** It is on
 * `check-solver-is-real`'s R2 ledger, where it belongs: R2's subject is *any
 * selector that conflates emptiness with failure*, which is a §CONTEXT-DATA-
 * HONESTY property of control flow and is engine-agnostic. This gate's subject
 * is CONSTRAINT work — the four kinds of C74 §1.1 — and an LLM relay performs
 * none of them. Pulling it in here would mean this gate must also own every
 * fetch client and every storage driver, at which point "constraint honesty" is
 * just "honesty" and the two gates have merged. The argument the other way is
 * real and is recorded rather than suppressed: H2 (a stand-in must announce
 * itself) IS engine-agnostic, and `MockAnthropicRelay` is a stand-in. It is
 * declined because a finding reported by two gates is a finding whose fix
 * strikes one ledger and leaves the other stale — exit 3 from the gate that did
 * not get the memo. One defect, one owner.
 *
 * ─── THE TWO HALVES, which are genuinely different questions ────────────────
 *
 * **G-INV-1 — no adapter reports a solve it did not perform.**
 *   H1  A class whose public methods delegate to a `Mock*`/`Stub*`/`Fake*` type
 *       may not declare a non-mock `kind`. This is the `kind = 'planegcs'`
 *       defect, in one arm.
 *   H2  Every mock-backed adapter emits a NON-SUPPRESSIBLE first-call signal —
 *       a `console.warn`, a span attribute, or a distinguished result field.
 *       A file-header comment is not detection (C74 §0: a header that was
 *       accurate and ignored for months).
 *
 * **This arm reads CLEAN against production today** — `PlanegcsAdapter` was made
 * honest earlier this session (`kind` now reports the actual underlying,
 * `intendedEngine` carries intent). **A clean arm with no control is worthless**,
 * which is why `selfTest()` runs a PLANTED tree on every invocation and exits 2
 * if H1/H2 fail to fire on it. A checker that has never been watched failing has
 * not been shown to work, and its silence is not coverage.
 *
 * **G-INV-2 — every family's declared strength has executable evidence AT THAT
 * STRENGTH.** The harder and more valuable half.
 *   H3  Enumerate every family the engine registers, with its declared strength,
 *       and require executable evidence at that strength. A family with no
 *       evidence is a FINDING, never a blank row (C70 §2.2: UNPROVEN is not a
 *       pass, and a status document may not render it as an inherited green).
 *
 *       "Executable evidence at that strength" is defined, not gestured at:
 *         • a `.test.ts`/`.spec.ts`/`.cert.ts` file, or an executed certification
 *           gate, that names the family's rule id, AND
 *         • REFERENCES THE MODULE THAT OWNS THE FAMILY, in code — otherwise the
 *           id is a string in a file that never went near the rule, AND
 *         • is not merely re-declaring the id inside a HAND-BUILT STAND-IN of
 *           the rule. §1.1 RULE 1(6) — *a test that never exercised the real
 *           path* — is one of the six reasons a gate may not pass, and it is the
 *           reason the room-area evidence needed reading rather than counting.
 *       A non-REAL reading is reported as one of THREE distinct kinds —
 *       **STAND-IN** (the rule re-implemented inline), **UNBOUND** (the id named
 *       by a file that never references its owner) and **NONE** (nothing names
 *       it at all) — because three different facts are three different facts,
 *       and collapsing them would repeat §CONTEXT-DATA-HONESTY inside the gate
 *       that exists to enforce it. UNBOUND was added on 2026-08-13 after this
 *       arm certified a free-text string as REAL and a ledger row was struck as
 *       PAID on the strength of it; see `findEvidence`.
 *
 *   H5  *(finding)* The same authority in two copies, production importing one
 *       (C74 §2.2 — `StairValidationAuthority`).
 *
 * **H4 IS NOT IMPLEMENTED HERE, AND THAT IS A DECISION.** BIM30-READINESS-GATES
 * §3.12 lists H4 — *a suite substituting a double states which production
 * configuration is thereby not covered* (C74 §3.5). It was built, it fired, and
 * it was **removed**, because `check-no-hidden-mock`'s **M-C arm already owns
 * that exact defect** and owns it better: M-C keys per INJECTION SITE
 * (`M-C::…/PlanegcsAdapter.test.ts:121:underlying` and `:150:` — both PAID
 * 2026-08-14 under CO-03 by deleting the `underlying` seam itself; the arm
 * remains the owner for any future injection site), inventories the
 * docstring-forbidden fields it is checking, and prints its exclusions by name.
 * A duplicated finding is a finding whose fix strikes one ledger and leaves the
 * other **stale — exit 3 from the gate that did not get the memo**, which is the
 * precise failure `contract.ts`'s stale-entry rule exists to raise. This is the
 * same "one defect, one owner" argument used above to decline `loadRelay`, and
 * applying it in one direction and not the other would be special pleading.
 * H4 is therefore **covered, elsewhere, and named here rather than silently
 * dropped** — a spec row this gate does not implement is a fact a reader is
 * entitled to, not an omission.
 *
 * ─── CONTROLS, BOTH DIRECTIONS, EXECUTED ON EVERY RUN (C74 §6.2) ────────────
 * A PLANTED tree (dishonest adapter + unsignalled stand-in + a family declared
 * `error` with no evidence anywhere) must be FLAGGED on H1, H2 and H3. A CLEAN
 * tree (honest `kind`, first-call warn, a family whose rule id appears in a real
 * test) must read **0**. Both are printed every run. Either failing exits 2 as a
 * BLIND COMPARATOR — never 0.
 *
 * ─── HONESTY FLOORS (exit 2, NEVER absorbable) ──────────────────────────────
 *   • adapters discovered            > 0   — C70 §7's own named floor
 *   • constraint families enumerated > 0   — an empty walk is not a verdict
 *   • source files scanned         ≥ 500
 *   • evidence files scanned       ≥ 100
 *   • both controls passed
 *
 * ─── WHAT THIS GATE CANNOT SEE (stated so it is never read as full coverage) ─
 *   • **runtime substitution** — a double injected through DI is invisible to a
 *     source scan;
 *   • **semantic correctness** — an honest rule computing the wrong answer
 *     passes every arm. C74 governs IDENTITY, not ACCURACY;
 *   • **whether a family truly needs SOLVING** — C74 §4.2 is a written
 *     judgement, not a machine-checkable property. This gate reads the strength
 *     a family DECLARES; it cannot rule on whether the declaration is right;
 *   • **whether the evidence PASSES** — it asserts that an executable witness
 *     exists and binds the real rule, not that it is green today. A red test is
 *     evidence; a missing one is not;
 *   • **families outside a `register({ id, tier, severity })` shape** — other
 *     validators (`StairValidationAuthority`, `WallOccupancyStore.canPlace`,
 *     `annotationConstraints`) are enumerated from a NAMED register below, not
 *     discovered, and that register is a maintained list that can rot. It is
 *     printed in full every run so the rot is visible.
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED · 3 ledger
 * exceeded or stale. 2 and 3 are never absorbable as declared debt.
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-constraint-honesty';

/** Where adapters and rule registries live. */
const SRC_DIRS = ['packages', 'plugins', 'apps', 'src'] as const;
/** Where executable evidence may live. Certification gates ARE executable evidence. */
const EVIDENCE_DIRS = ['packages', 'plugins', 'apps', 'src', 'tests', 'tools/rac-conformance'] as const;

const STANDIN_TYPE = /^(?:Mock|Stub|Fake|Dummy|Noop|NoOp)[A-Z0-9_]/;
const HONEST_KINDS = new Set([
  'mock', 'stub', 'fake', 'dummy', 'noop', 'none', 'null', 'test',
  'scaffold', 'sim', 'simulated', 'in-memory', 'memory',
]);

/**
 * Rule-registry sources. A file here is parsed for `register({ id, tier,
 * severity })` families. NAMED rather than discovered: a pattern loose enough to
 * find every registry in the estate also finds every `register()` in the command
 * bus, and an over-eager matcher is how a gate acquires a suppression list.
 * The floor below (`families > 0`) is what catches this list going stale to
 * empty; a family DROPPING OUT is caught by the ledger's stale-entry rule.
 */
const RULE_REGISTRIES: readonly string[] = [
  'packages/constraint-solver/src/ConstraintEngine.ts',
];

/**
 * Constraint families that do NOT come from a `register()` call — the four real
 * components C74 §2 enumerates. Declared strength is from C74 §2's own table, so
 * this gate is transcribing the contract, not inventing a classification.
 * Each names the evidence PATTERN that would witness it at that strength.
 */
interface NamedFamily {
  readonly id: string;
  readonly strength: 'VALIDATION' | 'ENFORCEMENT' | 'ADVISORY' | 'SOLVING';
  readonly site: string;
  /** A regex that an executable evidence file must match to witness this family. */
  readonly witness: RegExp;
  /**
   * A regex identifying the MODULE THAT OWNS the family. An evidence file that
   * names the family but never references its owner witnesses the STRING, not
   * the rule — see `findEvidence`'s UNBOUND arm.
   */
  readonly binder: RegExp;
  readonly note: string;
}

const NAMED_FAMILIES: readonly NamedFamily[] = [
  {
    id: 'WallOccupancyStore.canPlace',
    strength: 'ENFORCEMENT',
    site: 'packages/geometry-wall/src/WallOccupancyStore.ts',
    witness: /\bcanPlace\s*\(/,
    binder: /\bWallOccupancyStore\b/i,
    note: 'C74 §2 — a real refusal on a real mutation path (opening commit). THE POSITIVE CONTROL for H3: ' +
      'if this family reads NO EVIDENCE the arm is broken, not the estate.',
  },
  {
    id: 'StairValidationAuthority',
    strength: 'VALIDATION',
    site: 'packages/geometry-stair/src/StairValidationAuthority.ts',
    witness: /StairValidationAuthority|validateStair/,
    binder: /\bStairValidationAuthority\b/i,
    note: 'C74 §2.2 — single owner since 2026-08-13 (the constraint-solver duplicate was deleted); production imports this geometry-stair copy.',
  },
  {
    id: 'annotationConstraints',
    strength: 'VALIDATION',
    site: 'packages/schemas',
    witness: /annotationConstraints/,
    // The family IS the symbol; naming it in code IS referencing its owner.
    binder: /\bannotationConstraints\b/,
    note: 'C74 §2 — the one PERSISTED constraint family: written to the snapshot, read back, checked.',
  },
];

// ─── The named ledger. SHRINK-ONLY, checked in BOTH directions. ──────────────
/**
 * `arm::key`. Fix a finding → strike its line in the SAME commit; a stale entry
 * exits 3. Do NOT add a line to quiet the gate — a new finding is exit 3.
 *
 * Pinned at the FIRST HONEST READING, 2026-08-12. Every entry below is a defect
 * that PREDATES this gate: the instrument arrived, nothing got worse
 * (BIM30-READINESS-GATES §2.4).
 */
const LEDGER: readonly string[] = [
  // ── H3 · G-INV-2 — ALL 17 registered rule families now have REAL executable
  // evidence binding the rule registry. What remains is 1 of the 3 C74 §2
  // named families.
  //
  // THE DECLARED LEVEL HAS MOVED 20 → 16 → 15 → 14 → 3 → 2 → 1, AND ONE OF THOSE
  // STEPS WAS NOT A PAYMENT. 20 at the first honest reading; 16 on four earned
  // strikes (34664b30); 15 on ONE UNEARNED strike (96939dd4 —
  // FIRE_COMPARTMENT_AREA, see the ELEVEN STRUCK block below); 14 on two
  // earned strikes plus that row's RESTORATION; 3 on eleven earned strikes;
  // 2 on the H5 dedup (the duplicate deleted, not extended); 1 on
  // StairValidationAuthority earning an at-strength suite (CO-09, 2026-08-15 —
  // four planted violations watched failing; see the STRUCK block below).
  // A ledger that only ever counts down cannot distinguish debt being paid from
  // debt being lost, and both look like progress in the number alone. The
  // reasons are therefore written beside every move. Net for 2026-08-13:
  // −2 earned, +1 restored, then −11 earned in a second pass the same day.
  //
  // AT THE FIRST HONEST READING (2026-08-12) THIS WAS ALL 17. At that point
  // `packages/constraint-solver/` contained exactly two test files —
  // `engine.test.ts` and `PlanegcsAdapter.test.ts` — and BOTH bound the
  // MockSolver/adapter layer; NEITHER opened `ConstraintEngine.ts`. The
  // component performing the repo's only real ADVISORY constraint work, 17
  // families deep and wired to a live event bus at
  // `apps/editor/src/engine/initDataPlatform.ts:298`, had no suite at all.
  //
  // FOUR WERE STRUCK FIRST — ROOM_MIN_AREA, ROOM_NEEDS_DOOR,
  // HABITABLE_NEEDS_WINDOW and STAIR_HEADROOM — witnessed by
  // `packages/constraint-solver/__tests__/ConstraintEngine.rules.test.ts`, which
  // calls the REAL `constraintEngine.validateAll(ctx)` and asserts, per family:
  // that it fires at its DECLARED severity with the engine's own message and
  // numbers; that it goes SILENT on satisfied input; and that it turns over at
  // its threshold. Both substitutions that suite makes (the store handles, and
  // a build-cost alias for `@pryzm/core-app-model`) are disclosed in its header
  // per C74 §3.5, and neither sits on any rule's evaluation path.
  //
  // ROOM_MIN_AREA was the row that mattered most. Before that suite it was the
  // only family any executable file named, and all THREE files that named it
  // built the violation by hand rather than calling the engine (see
  // `findEvidence`'s header) — so every `below minimum` figure quoted from it in
  // review was produced by something other than this engine. "The rule with
  // evidence" and "the rule with a string that matches its name" are different
  // facts, and until now this was the second.
  //
  // That suite also PINNED two defects it deliberately did not fix, so they are
  // findings on the record rather than silent repairs: the room-area message
  // contradicts itself at the boundary (`.toFixed(1)` rounds the shown area up
  // to equal the minimum it is being reported as below), and STAIR_HEADROOM's
  // own defaults fire `error` on a standard 3.0 m residential storey.
  // TWO MORE STRUCK 2026-08-13 — DOOR_WIDTH_vs_CIRCULATION and ACCESSIBLE_ROUTE,
  // witnessed by `packages/constraint-solver/__tests__/wallRoomAdjacencyDetermination
  // .test.ts`, which imports `constraintEngine` from `../src/ConstraintEngine.js`
  // and asserts through `constraintEngine.validateAll(ctx)` — at severity, on the
  // message, and with a negative control that a readable store never refuses.
  //
  // NEITHER WAS PAID BY THIS GATE'S OWN WORK, and that is the interesting part.
  // That suite was written by the C78 U-INV-4 lane (d4061563) to close a
  // different defect: `roomStore.getRoomsAdjacentToWall?.(wallId) ?? []` made
  // ACCESSIBLE_ROUTE print "widest door is 0mm" — a measurement of a door it
  // never read — against valid models. Fixing an ABSENCE-BECOMES-A-CLAIM defect
  // requires exercising the real rule, which is the same act H3 asks for. The
  // ledger went stale because the fixing lane had no reason to know this gate
  // existed. That is the ordinary way a shrink-only ledger goes stale, and
  // §5.4's exit 3 is what makes it visible instead of silently absorbed.
  //
  // ELEVEN STRUCK 2026-08-13 (second pass) — every remaining registered
  // family, witnessed by two suites that import the singleton from
  // `packages/constraint-solver/src/ConstraintEngine.ts` and assert through
  // the REAL `constraintEngine.validateAll(ctx)`:
  //   • `ConstraintEngine.spatial.test.ts` — ROOM_MAX_TRAVEL_DISTANCE,
  //     FIRE_COMPARTMENT_AREA, MEANS_OF_ESCAPE_COUNT, CORRIDOR_WIDTH,
  //     LIFT_ADJACENT_LOBBY, PLUMBING_ZONE. Per family: fires at the DECLARED
  //     severity with the engine's own message and numbers; silent on
  //     satisfied input; threshold turnover at the boundary; and the
  //     absence-reads-as-compliance guard paths PINNED as measured, not
  //     endorsed (a store without `getTotalAreaForLevel` reads every level as
  //     0 m²; a level with no exits is skipped, not reported; `getByLevel`
  //     absent → the floor is exempt).
  //   • `ConstraintEngine.physics.test.ts` — ACOUSTIC_RT60_HOSPITAL,
  //     ACOUSTIC_RT60_SCHOOL, ACOUSTIC_RT60_COURT, DAYLIGHT_HABITABLE,
  //     THERMAL_GLAZING_OVERHEATING. These five read
  //     `window.physicsEngine.cache` + `window.roomStore`, NOT the
  //     ConstraintContext — proven by driving them on the all-null context.
  //     Two defects pinned, not fixed: D3 — all three acoustic rules compare
  //     `>=` while the sentence says "exceeds", so a room AT the limit is
  //     shown a self-refuting message (the D1 shape again); and the COURT
  //     rule's ≥500 m³ clause is DEAD — a large non-court room can never fire.
  //
  //   FIRE_COMPARTMENT_AREA deserves its own sentence, because its row was
  //   struck once before (96939dd4) on this gate's own false REAL — a
  //   free-text mention in `packages/command-bus/__tests__/refusal-vocabulary
  //   .test.ts:303`, a file that never references `ConstraintEngine` — and
  //   RESTORED with the UNBOUND arm. This strike is the earned one: the
  //   witness imports the registry module and asserts the rule fires `error`
  //   at 2001 m², is silent at 2000 m², and reads a method-less store as
  //   0 m² (pinned). The UNBOUND detector now classifies the command-bus
  //   mention correctly, and the SPECTRE control keeps it that way.
  //
  //   C70 §5.6 was EXECUTED for every family, not asserted: each rule's
  //   property was deliberately broken in the engine (threshold or filter
  //   mutation, one family at a time), the suite WATCHED GO RED (1–4 failing
  //   tests per family), the engine restored byte-identical (git diff empty),
  //   and the suite watched green again (139/139). Both runs are recorded in
  //   the commit message that carries this strike.
  //
  // ── H3 · ONE of the three C74 §2 named families still has no executable
  // witness. `annotationConstraints` is the one PERSISTED constraint family in
  // the system — written to the snapshot, read back and checked — and nothing
  // executable names it. It lives in `packages/schemas` (L0) and is NOT this
  // gate's lane to pay; it is named here so the row is owned, not orphaned.
  //
  // The third, `WallOccupancyStore.canPlace`, reads REAL and is THE POSITIVE
  // CONTROL for this arm: if it ever joins this list the arm is broken, not the
  // estate, and the fix is the gate.
  //
  // ── H3::StairValidationAuthority STRUCK 2026-08-15 (CO-09) ────────────────
  // Witnessed by `packages/geometry-stair/src/__tests__/StairValidationAuthority
  // .spec.ts` — 19 cases importing the REAL authority from `../StairValidation
  // Authority` and calling `StairValidationAuthority.validate()`. NO substitution
  // sits on the evaluated path: the authority is a pure static function over
  // plain data, `Level` is built as the real five-field record, and the optional
  // `typeStore` context field is left absent.
  //
  // STRUCK AT THE DECLARED STRENGTH, which is the only thing that earns a strike
  // on a VALIDATION row. The suite does not assert that `validate()` is callable
  // — that would pass against a gutted validator, and is the exact C74 §1.1
  // defect this row measures. It asserts the two things VALIDATION means:
  //   • a code-compliant stair is ACCEPTED — zero errors, zero advisories. A
  //     validator that refused everything would satisfy every negative case, so
  //     the accept arm is load-bearing, not decoration.
  //   • each illegal stair is REFUSED WITH ITS IDENTITY — the rule's own code,
  //     its own sentence and BOTH numbers (measured value and breached limit),
  //     asserted by exact equality. Nine refusal families are covered:
  //     RISER-TOO-HIGH / -TOO-LOW, TREAD-TOO-SHALLOW, WIDTH-TOO-NARROW,
  //     ACCESSIBLE-WIDTH-TOO-NARROW, SAME-LEVEL, INVALID-BASE/TOP-LEVEL,
  //     HEIGHT-MISMATCH, ZERO-DIRECTION, TOO-FEW-RISERS.
  //   • three thresholds are probed AT THE EDGE (riser max, width min, height
  //     tolerance), because a limit nobody probed at the boundary could be `>=`
  //     where its sentence says "exceeds" and nothing would notice.
  //   • the region set is shown LIVE rather than decorative: the same 200 mm
  //     rise is refused under the default code and accepted under `IBC-USA`.
  //
  // C70 §5.6 EXECUTED, not asserted — the arm was WATCHED FAILING on four
  // separately planted violations, the authority restored byte-identical after
  // each (`git diff` empty), and the suite watched green again (19/19, and
  // 225/225 for the package):
  //   M1 rule DELETED  (riser-max branch disabled)      → 4 failed / 15 passed
  //   M2 WRONG IDENTITY (`STAIR-WIDTH-TOO-NARROW` →
  //      `STAIR-TOO-NARROW`, the rival engine's code)   → 2 failed / 17 passed
  //   M3 region resolution disabled                     → 1 failed / 18 passed
  //   M4 OFF-BY-ONE at the width minimum (`<` → `<=`)   → 1 failed / 18 passed
  // M2 and M4 are the pair that matter: both leave `validate()` callable and
  // still returning a refusal, and only an at-strength assertion catches them.
  //
  // TWO DEFECTS ARE PINNED AS MEASURED, NOT ENDORSED — for this authority
  // MISSING and COMPLIANT are the same value (§CONTEXT-DATA-HONESTY): a stair
  // with NO dimensions at all validates `isValid: true` (every dimensional rule
  // is guarded by `!== undefined`), and the storey-height rule is nested inside
  // the flights branch, so a riser height that cannot reach the top level is
  // not refused while the flights array is absent.
  //
  // ⚠ A RIVAL VALIDATION SURFACE SURVIVES UNDER A DIFFERENT NAME, and this
  // gate's H5 arm cannot see it — H5 stats two hard-coded paths both named
  // `StairValidationAuthority.ts`, so a rival called something else is invisible.
  // `StairConstraintEngine` (`packages/constraint-solver/src/stair-constraint-
  // engine.ts:63`) hand-inlines its OWN copy of the `STAIR_CONSTRAINTS` table
  // (:7-19) and is live on a production mutation path —
  // `command-registry/src/stair/UpdateStairFlightsCommand.ts:78` calls
  // `validateQuick`, and `ChangeStairShapeCommand` / `StairCommandPlan` call
  // `computeOptimalParameters`. It does NOT route through the authority, and the
  // two have ALREADY DRIFTED on refusal identity: the same defect is
  // `STAIR-WIDTH-TOO-NARROW` here and `STAIR-TOO-NARROW` there,
  // `STAIR-ACCESSIBLE-WIDTH-TOO-NARROW` here and `STAIR-ACCESSIBLE-TOO-NARROW`
  // there, and the region override is keyed `region`/`IBC-USA`/200 mm here
  // against `buildingCode`/`UK_ADM`/220 mm there. The authority's own header
  // claims `StairConstraintEngine` "consults the same rules"; it does not.
  // This is NOT struck and NOT paid — consolidating it is solver work, which
  // C74 §4.5 forbids until a family proves it needs solving. Recorded so the
  // next reader does not mistake a REAL row for a single owner.
  'H3::annotationConstraints (VALIDATION)',
  // ── H4 is deliberately absent: `check-no-hidden-mock`'s M-C arm owns it, at
  // finer resolution (per injection site). See the header. ONE DEFECT, ONE OWNER.
  // ── H5 STRUCK 2026-08-13 — the constraint-solver copy was DELETED, not
  // extended (C74 §2.2's required order). The two copies were verified
  // byte-near identical first (import specifiers + one non-null assertion),
  // zero importers of the deleted copy outside its own barrel, and production
  // untouched on the geometry-stair copy. The arm STAYS ARMED: a reappearing
  // second copy fires H5 as NOT ON THE LEDGER → exit 3.
];

// ─── Model ───────────────────────────────────────────────────────────────────

interface AdapterDecl {
  readonly file: string;
  readonly line: number;
  readonly className: string;
  readonly kind: string;
  /** Stand-in types this class constructs or stores. */
  readonly delegatesTo: readonly string[];
  /** Does the class emit a first-call signal? */
  readonly signals: boolean;
}

interface Family {
  readonly id: string;
  readonly strength: string;
  readonly site: string;
  /** The registry module that owns this family — see `findEvidence`'s UNBOUND arm. */
  readonly binder: RegExp;
  readonly note: string;
}

interface Evidence {
  /** file:line of the witness, or undefined. */
  readonly at?: string;
  readonly kind: 'REAL' | 'STAND-IN' | 'UNBOUND' | 'NONE';
  readonly detail: string;
}

/** The word used for a non-REAL reading in a finding sentence. */
function evidenceWord(kind: Evidence['kind']): string {
  return kind === 'STAND-IN' ? 'only STAND-IN' : kind === 'UNBOUND' ? 'only UNBOUND' : 'NO';
}

interface Finding { readonly arm: 'H1' | 'H2' | 'H3' | 'H5'; readonly key: string; readonly detail: string }

// ─── Discovery ───────────────────────────────────────────────────────────────

/**
 * Adapter classes with a declared `kind`, plus what they delegate to and whether
 * they signal. Comment-stripped FIRST — this suite has counted prose as
 * violations before, and every `kind = 'planegcs'` inside a JSDoc block (there
 * are several in `PlanegcsAdapter.ts`, describing the defect that was fixed) is
 * exactly that trap.
 */
function collectAdapters(root: string, dirs: readonly string[]): { adapters: AdapterDecl[]; filesScanned: number } {
  const adapters: AdapterDecl[] = [];
  let filesScanned = 0;
  const CLASS = /\bclass\s+([A-Za-z_$][\w$]*)/;
  const KIND = /^\s*(?:public\s+|private\s+|protected\s+|declare\s+)?(?:readonly\s+)?kind\s*(?::\s*[\w'"|. <>[\]]+\s*)?=\s*['"]([\w.-]+)['"]/;
  const NEW_STANDIN = /\bnew\s+([A-Za-z_$][\w$]*)\s*\(/g;
  // A non-suppressible first-call signal: a warn/error on the console, a span
  // attribute, or a distinguished field. NOT a comment — comments are stripped.
  const SIGNAL = /console\.(?:warn|error)\s*\(|setAttribute\s*\(\s*['"][\w.]*(?:mock|stand[-_]?in|scaffold)|\bisStandIn\b|\bstandIn\s*:/i;

  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench|cert)\.tsx?$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      if (!/\bkind\s*(?::[^=\n]*)?=\s*['"]/.test(src)) continue;
      const lines = stripCommentsToLines(src);

      // Class body extents, so delegation and signal are attributed to the class
      // that owns them rather than to the file.
      const classStarts: Array<{ name: string; line: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        const c = CLASS.exec(lines[i]!);
        if (c) classStarts.push({ name: c[1]!, line: i });
      }
      for (let ci = 0; ci < classStarts.length; ci++) {
        const start = classStarts[ci]!.line;
        const end = ci + 1 < classStarts.length ? classStarts[ci + 1]!.line : lines.length;
        let kind: string | undefined; let kindLine = start;
        const delegates = new Set<string>();
        let signals = false;
        for (let j = start; j < end; j++) {
          const k = KIND.exec(lines[j]!);
          if (k && !kind) { kind = k[1]!; kindLine = j; }
          NEW_STANDIN.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = NEW_STANDIN.exec(lines[j]!)) !== null) {
            // SELF-construction is not delegation. `MockSolver` constructing a
            // `MockSolver` (a clone, a reset, a static factory) is a mock being
            // a mock — the behaviour C74 §0 calls CORRECT and this gate exists
            // to protect. Counting it made all three honest mocks in the estate
            // fire H2 on the first run, which would have demanded they announce
            // themselves as stand-ins FOR THEMSELVES. The subject of H1/H2 is a
            // class standing in for SOMETHING ELSE.
            if (STANDIN_TYPE.test(m[1]!) && m[1]! !== classStarts[ci]!.name) delegates.add(m[1]!);
          }
          if (SIGNAL.test(lines[j]!)) signals = true;
        }
        if (kind !== undefined) {
          adapters.push({
            file: rel, line: kindLine + 1, className: classStarts[ci]!.name,
            kind, delegatesTo: [...delegates].sort(), signals,
          });
        }
      }
    }
  }
  return { adapters, filesScanned };
}

/** `register({ id: 'X', tier: N, severity: 'error' })` families. */
function collectRegisteredFamilies(root: string, registries: readonly string[]): Family[] {
  const out: Family[] = [];
  for (const rel of registries) {
    let src: string; try { src = readFileSync(join(root, rel), 'utf8'); } catch { continue; }
    const lines = stripCommentsToLines(src);
    // The OWNER of every family in this registry is the registry module itself.
    // `ConstraintEngine.ts` → /\bConstraintEngine\b/i, which matches both the
    // module specifier and the `constraintEngine` singleton it exports.
    const owner = rel.split('/').pop()!.replace(/\.tsx?$/, '');
    const binder = new RegExp(`\\b${owner.replace(/[^\w]/g, '\\$&')}\\b`, 'i');
    for (let i = 0; i < lines.length; i++) {
      const m = /\bid\s*:\s*['"]([A-Z][\w]*)['"]\s*,\s*tier\s*:\s*([12])\s*,\s*severity\s*:\s*['"](error|warning|info)['"]/.exec(lines[i]!);
      if (!m) continue;
      out.push({
        id: m[1]!,
        binder,
        // C74 §1.1: the `./compliance` registry is ADVISORY by construction — it
        // is debounced, off the critical path, and blocks nothing. `severity` is
        // the strength the family DECLARES to the user WITHIN that advisory, and
        // it is the number a claim of enforcement would be made in, so it is what
        // the evidence must be found at.
        strength: `ADVISORY/${m[3]!}`,
        site: `${rel}:${i + 1}`,
        note: `tier ${m[2]!}`,
      });
    }
  }
  return out;
}

/**
 * Every executable-evidence file: tests, specs, and certification gates.
 *
 * BOTH views are kept. `lines` is comment-stripped, for matching CODE. `raw` is
 * the source as written, because C74 §3.5's disclosure ("this suite covers X and
 * NOT Y") is PROSE, and a stripped view of a test can never read a test's own
 * honesty statement. Carrying both is why the ROOM_MIN_AREA stand-in is caught.
 */
function collectEvidenceFiles(root: string, dirs: readonly string[]): Array<{ rel: string; lines: string[]; raw: string[] }> {
  const out: Array<{ rel: string; lines: string[]; raw: string[] }> = [];
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      const isTest = /(^|\/)__tests__\//.test(rel) || /\.(test|spec|cert)\.tsx?$/.test(rel);
      const isCertGate = /^tools\/rac-conformance\/certification\/gates\/check-.*\.ts$/.test(rel);
      if (!isTest && !isCertGate) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      out.push({ rel, lines: stripCommentsToLines(src), raw: src.split('\n') });
    }
  }
  return out;
}

/**
 * Does executable evidence bind this family — and does it bind the REAL rule?
 *
 * The STAND-IN discrimination is the load-bearing part. A test may name a rule
 * id while re-implementing the rule inline; that witnesses the id STRING, not
 * the family. §1.1 RULE 1(6).
 *
 * ⚠ THE WINDOW IS THE ENCLOSING DECLARATION, NOT A FIXED LINE COUNT — and the
 * first cut of this gate got that wrong in the one place it mattered. With a
 * 12-line lookback, `ROOM_MIN_AREA` read **REAL** at
 * `apps/editor/__tests__/WallMoveRoomAreaPrediction.test.ts:56`. The line above
 * that declaration says, verbatim, *"A minimal stand-in for the real
 * ROOM_MIN_AREA rule"* — at line 40, sixteen lines up, just outside the window.
 * The arm built to catch a hand-built stand-in certified one as real evidence.
 * That is §0's mechanism reproduced INSIDE the gate written to stop it, and it
 * is recorded here rather than quietly fixed because the near-miss is the point:
 * a green cell is the most expensive thing this suite can print.
 *
 * **Widening the window was not the fix, and trying it is instructive.** A
 * region-scoped window (previous column-0 declaration → next one) STILL read
 * that file REAL: the disclosure doc block ends at line 45, line 46 is
 * `const MIN_AREA_M2 = …` — non-blank CODE — and the naming hit at line 56 lives
 * in the `const roomMinAreaValidator` region starting at 47. The sentence and
 * the symbol it describes are two declarations apart. Any window tuned to
 * include them includes half the file, at which point it is not a window.
 *
 * The window was the wrong instrument. **A stand-in disclosure is a FILE-LEVEL
 * property**, and C74 §3.5 says so in as many words: a suite substituting a
 * double *"states which production configuration is thereby not covered"*, and
 * *"both facts must be visible from the test file"* — the FILE, not the line.
 * So the discrimination is: does this file declare a hand-built stand-in for
 * this family ANYWHERE in it? Scoping is by the family's own id, so a file may
 * stand in for rule A and be real evidence for rule B.
 *
 * The cost is stated: a file that both stands in for a family AND separately
 * exercises the real one is reported STAND-IN, which understates it. That
 * direction is the safe one — this gate's failure mode must be calling real
 * evidence a stand-in, never calling a stand-in real.
 *
 * ─── UNBOUND — ADDED 2026-08-13, AFTER THIS ARM CERTIFIED A COMMENT ──────────
 * The stand-in discrimination above catches a file that RE-IMPLEMENTS a rule.
 * It does not catch the weaker and commoner thing: a file that merely CONTAINS
 * THE ID AS A STRING while never going near the rule at all.
 *
 * That is not hypothetical. `H3::FIRE_COMPARTMENT_AREA (error)` was struck from
 * the ledger below on 2026-08-13 (96939dd4) as PAID, on the strength of this
 * arm reporting it REAL at `packages/command-bus/__tests__/refusal-vocabulary
 * .test.ts:303`. That file imports `../src/index.js` and nothing else. Its line
 * 303 reads:
 *
 *     undeterminedOutcome('AGGREGATE_SCOPE_UNSUPPORTED',
 *                         'FIRE_COMPARTMENT_AREA takes the level as subject')
 *
 * — free text in a `detail` string, in a suite about the C78 §8 reason union.
 * It never imports `ConstraintEngine`, never calls `validateAll`, and asserts
 * nothing whatever about whether that family fires at `error`. The strike was
 * made in good faith against a detector that was wrong, and the row is RESTORED
 * below. **A row struck on a false REAL is worse than a row never struck**: the
 * ledger records the debt as paid, so the family is now UNPROVEN with nothing
 * left pointing at it. Striking it also removed the only thing that would have
 * exited 3 when the reading changed.
 *
 * So a witness must also BIND THE OWNER: the evidence file must reference the
 * module the family lives in (the rule registry for a registered family; the
 * declaring module for a named one), in CODE, comment-stripped. This is exactly
 * the discrimination C74 §1.1 RULE 1(6) already required — *a test that never
 * exercised the real path* — applied one level weaker than the stand-in arm,
 * which needed the file to go to the trouble of re-implementing something.
 *
 * Reported as **UNBOUND**, distinctly from NONE and from STAND-IN, because
 * three different facts are three different facts (the same reason STAND-IN was
 * split out) — a mention is not an absence, and it is not a re-implementation.
 *
 * WHAT THIS STILL CANNOT SEE, stated rather than implied: a file that imports
 * the owner for an unrelated reason and separately names the family in a string
 * reads REAL. Binding is necessary, not sufficient. The self-test's planted
 * SPECTRE_MIN_AREA control is the guard against this arm silently going blind.
 */
function findEvidence(
  familyId: string, witness: RegExp,
  evidence: ReadonlyArray<{ rel: string; lines: string[]; raw: string[] }>,
  declaringFile: string,
  binder: RegExp,
): Evidence {
  /**
   * A FILE-LEVEL stand-in disclosure, scoped to THIS family by requiring the
   * family's own name within ~3 lines of the stand-in word — so "we mock the
   * store" does not disqualify a file that really exercises the rule.
   *
   * Read against the RAW source, not the stripped one. Stripping is what hid the
   * disclosure: "A minimal stand-in for the real ROOM_MIN_AREA rule" lives in a
   * JSDoc block, and a comment-stripped view of a test can never read that test's
   * own honesty statement. C74 §3.5 makes that prose load-bearing, and this is
   * the one arm where reading prose is correct rather than the trap.
   */
  /**
   * The vocabulary. `scripted` and `verbatim … shape` are here because the THIRD
   * ROOM_MIN_AREA candidate found by this gate was
   * `certification/gates/check-approval-binding.ts:386`, which hand-writes
   * `{ ruleId: 'ROOM_MIN_AREA', …, message: 'Kitchen — area 6.4m² is below
   * minimum 7m²' }` into a SCRIPTED validator and says so at :379 — *"Whether
   * the REAL engine fires ROOM_MIN_AREA on a wall move is … the planner suite's
   * subject."* It is an honest gate about a different subject (does the rule's
   * sentence reach the user unaltered), and it is emphatically not evidence that
   * the rule fires. Three separate files name this rule id; all three synthesise
   * the violation; none calls `ConstraintEngine`.
   */
  const STANDIN_WORD = /\bstand[-_ ]?in\b|\bminimal (?:stand|fake|mock)|\bfake\b|\bmock\b|\bstub\b|\bre-?implement|\bdouble\b|\bscripted\b|\bverbatim\b|\bthe shape\b|\bsynthesi[sz]e/i;
  let standInHit: string | undefined;
  let unboundHit: string | undefined;

  for (const f of evidence) {
    if (f.rel === declaringFile) continue;   // the declaration is not its own witness
    // Does this file declare a hand-built stand-in FOR THIS FAMILY?
    let declaresStandIn = false;
    for (let i = 0; i < f.raw.length && !declaresStandIn; i++) {
      if (!STANDIN_WORD.test(f.raw[i]!)) continue;
      const lo = Math.max(0, i - 3), hi = Math.min(f.raw.length, i + 4);
      if (witness.test(f.raw.slice(lo, hi).join('\n'))) declaresStandIn = true;
    }
    // Does it reference the module that OWNS the family — in CODE? Computed
    // once per file, and only when the file turns out to name the family.
    let bindsOwner: boolean | undefined;
    for (let i = 0; i < f.lines.length; i++) {
      if (!witness.test(f.lines[i]!)) continue;
      if (declaresStandIn) { standInHit ??= `${f.rel}:${i + 1}`; break; }
      bindsOwner ??= f.lines.some((l) => binder.test(l));
      if (!bindsOwner) { unboundHit ??= `${f.rel}:${i + 1}`; break; }
      return { at: `${f.rel}:${i + 1}`, kind: 'REAL', detail: `witnessed by ${f.rel}:${i + 1}` };
    }
  }
  if (standInHit) {
    return {
      at: standInHit, kind: 'STAND-IN',
      detail: `the ONLY witness is a HAND-BUILT STAND-IN at ${standInHit} — it names \`${familyId}\` while ` +
        're-implementing the rule inline, so it exercises the id STRING and never the real path (§1.1 RULE 1(6)). ' +
        'Reported distinctly from NONE: a stand-in and an absence are different facts.',
    };
  }
  if (unboundHit) {
    return {
      at: unboundHit, kind: 'UNBOUND',
      detail: `the ONLY witness is UNBOUND at ${unboundHit} — that file NAMES \`${familyId}\` but never ` +
        `references the module that owns it (${binder}), so nothing there can have exercised the rule. ` +
        'A mention in a string literal is evidence of a string (§1.1 RULE 1(6)). Reported distinctly from ' +
        'NONE and from STAND-IN: a mention, a re-implementation and an absence are three different facts.',
    };
  }
  return { kind: 'NONE', detail: `NO executable evidence names \`${familyId}\` anywhere in the repo` };
}

// ─── The analyser, over any root ─────────────────────────────────────────────

interface Analysis {
  readonly findings: Finding[];
  readonly adapters: AdapterDecl[];
  readonly families: Array<{ f: Family | NamedFamily; strength: string; ev: Evidence }>;
  readonly filesScanned: number;
  readonly evidenceFiles: number;
}

function analyse(
  root: string,
  opts: {
    srcDirs: readonly string[];
    evidenceDirs: readonly string[];
    registries: readonly string[];
    named: readonly NamedFamily[];
    /** H5's subject is a NAMED production fact; the synthetic control trees skip it. */
    productionArms: boolean;
  },
): Analysis {
  const findings: Finding[] = [];
  const { adapters, filesScanned } = collectAdapters(root, opts.srcDirs);
  const evidence = collectEvidenceFiles(root, opts.evidenceDirs);

  // ── G-INV-1 · H1 + H2 ────────────────────────────────────────────────────
  for (const a of adapters) {
    if (a.delegatesTo.length === 0) continue;          // not mock-backed
    const honest = HONEST_KINDS.has(a.kind.toLowerCase());
    if (!honest) {
      findings.push({
        arm: 'H1',
        key: `H1::${a.file}:${a.className}`,
        detail: `${a.file}:${a.line} — class ${a.className} declares kind='${a.kind}' while delegating to ` +
          `[${a.delegatesTo.join(', ')}]. A stand-in wearing the identity of the thing it stands in for: ` +
          'every caller branching on `kind` is told a fact that is not true (C74 §3.1, §5.a).',
      });
    }
    if (!a.signals) {
      findings.push({
        arm: 'H2',
        key: `H2::${a.file}:${a.className}`,
        detail: `${a.file}:${a.line} — class ${a.className} is backed by [${a.delegatesTo.join(', ')}] and emits ` +
          'NO non-suppressible first-call signal (no console.warn/error, no mock span attribute, no ' +
          'distinguished result field). "It is documented in the file header" is not detection — C74 §0 ' +
          'shows a header that was accurate and ignored for months (C74 §3.2).',
      });
    }
  }

  // ── G-INV-2 · H3 ─────────────────────────────────────────────────────────
  const families: Analysis['families'] = [];
  for (const f of collectRegisteredFamilies(root, opts.registries)) {
    const declFile = f.site.split(':')[0]!;
    const ev = findEvidence(f.id, new RegExp(`\\b${f.id.replace(/[$]/g, '\\$')}\\b`), evidence, declFile, f.binder);
    families.push({ f, strength: f.strength, ev });
    if (ev.kind !== 'REAL') {
      const sev = f.strength.split('/')[1] ?? f.strength;
      findings.push({
        arm: 'H3',
        key: `H3::${f.id} (${sev})`,
        detail: `${f.site} — family \`${f.id}\` declares strength ${f.strength} and has ${evidenceWord(ev.kind)} ` +
          `executable evidence at that strength: ${ev.detail}. A declared strength with no executable witness ` +
          'is UNPROVEN, and UNPROVEN is neither a pass nor a fail — it is *nobody looked* (C70 §2.2, G-INV-2).',
      });
    }
  }
  for (const nf of opts.named) {
    const ev = findEvidence(nf.id, nf.witness, evidence, nf.site, nf.binder);
    families.push({ f: nf, strength: nf.strength, ev });
    if (ev.kind !== 'REAL') {
      findings.push({
        arm: 'H3',
        key: `H3::${nf.id} (${nf.strength})`,
        detail: `${nf.site} — family \`${nf.id}\` declares strength ${nf.strength} and has ${evidenceWord(ev.kind)} ` +
          `executable evidence at that strength: ${ev.detail}. ${nf.note}`,
      });
    }
  }

  if (opts.productionArms) {
    findings.push(...productionOnlyArms(root));
  }

  return { findings, adapters, families, filesScanned, evidenceFiles: evidence.length };
}

/**
 * H5 — an arm whose subject is a NAMED production fact rather than a pattern, so
 * it is asserted against the production tree only and is stated as such rather
 * than being made to look discovered.
 */
function productionOnlyArms(root: string): Finding[] {
  const out: Finding[] = [];

  // H5 — the same authority in two copies (C74 §2.2). Named, not discovered:
  // a generic duplicate-class scan over this estate returns dozens of legitimate
  // same-named types, and the defect is specifically "production imports one and
  // the tests may bind the other".
  const DUP = 'StairValidationAuthority';
  const copies = ['packages/geometry-stair/src', 'packages/constraint-solver/src']
    .map((d) => `${d}/${DUP}.ts`)
    .filter((p) => { try { readFileSync(join(root, p), 'utf8'); return true; } catch { return false; } });
  if (copies.length > 1) {
    out.push({
      arm: 'H5',
      key: `H5::${DUP}`,
      detail: `${DUP} exists in ${copies.length} copies — ${copies.join(' AND ')}. Production imports the ` +
        'geometry-stair copy; the constraint-solver copy has ZERO production importers. Whichever copy the ' +
        'tests bind to, one of them is a rule set that can drift from shipped behaviour with a green suite ' +
        '(C74 §2.2, §5.e). Neither may be cited as "the stair rules" without naming which one.',
    });
  }

  return out;
}

// ─── Controls, BOTH directions, EXECUTED every run (C74 §6.2) ───────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const PLANTED_REGISTRY = 'packages/x/src/Rules.ts';

const PLANTED: Record<string, string> = {
  // H1 — dishonest kind over a mock delegation. H2 — no first-call signal.
  'packages/x/src/GhostSolver.ts': [
    "import { MockSolver } from './MockSolver.js';",
    'export class GhostSolver {',
    "  readonly kind = 'ghostgcs' as const;",
    '  private readonly underlying = new MockSolver();',
    '  solve() { return this.underlying.solve(); }',
    '}',
  ].join('\n'),
  'packages/x/src/MockSolver.ts': [
    'export class MockSolver {',
    "  readonly kind = 'mock' as const;",
    '  solve() { return null; }',
    '}',
  ].join('\n'),
  // H3 — three families declaring `error`, one per way a witness can be absent.
  // GHOST_MIN_AREA has NO evidence at all; PHANTOM_MIN_AREA has a test that
  // NAMES it while hand-rolling the rule, and must be caught as STAND-IN rather
  // than certified REAL; SPECTRE_MIN_AREA is NAMED IN A STRING by a file that
  // never touches the registry, and must be caught as UNBOUND. The second is the
  // control for the near-miss recorded in `findEvidence`'s header; the third is
  // the control for the FIRE_COMPARTMENT_AREA false REAL that got a ledger row
  // struck. The ONLY reason either defect is not still shipping is that a
  // control exists for it.
  [PLANTED_REGISTRY]: [
    'export function build(r: { register(x: unknown): void }) {',
    "  r.register({ id: 'GHOST_MIN_AREA', tier: 1, severity: 'error', check: () => [] });",
    "  r.register({ id: 'PHANTOM_MIN_AREA', tier: 1, severity: 'error', check: () => [] });",
    "  r.register({ id: 'SPECTRE_MIN_AREA', tier: 1, severity: 'error', check: () => [] });",
    '}',
  ].join('\n'),
  'packages/x/__tests__/standin.test.ts': [
    '/**',
    ' * A minimal stand-in for the real PHANTOM_MIN_AREA rule (the engine touches',
    ' * window at module scope). It reads exactly what the real rule reads.',
    ' *',
    ' * Sixteen lines of doc block sit between this disclosure and the id below —',
    ' * a fixed 12-line lookback certified the real-tree equivalent of this file as',
    ' * REAL evidence. That is what this control exists to keep impossible.',
    ' */',
    'const phantomValidator = {',
    '  validateAll: (ctx) => {',
    '    const out = [];',
    '    for (const r of ctx.roomStore.getAll()) {',
    '      if (r.area < 10) {',
    "        out.push({ ruleId: 'PHANTOM_MIN_AREA', elementId: r.id });",
    '      }',
    '    }',
    '    return out;',
    '  },',
    '};',
    "it('fires', () => { expect(phantomValidator.validateAll(ctx)).toHaveLength(1); });",
  ].join('\n'),
  // THE UNBOUND CONTROL — the exact shape of the false REAL that got
  // H3::FIRE_COMPARTMENT_AREA struck from the ledger: a suite about a DIFFERENT
  // subject that happens to carry the rule id inside a free-text string. It
  // imports nothing from the registry, asserts nothing about the rule, and uses
  // no stand-in vocabulary — so neither the STAND-IN arm nor a NONE reading
  // catches it. If this file is ever classified REAL, the arm is blind again.
  'packages/x/__tests__/unrelated.test.ts': [
    "it('does something else', () => { expect(1).toBe(1); });",
    "it('carries a reason string', () => {",
    "  expect(outcome.detail).toBe('SPECTRE_MIN_AREA takes the level as subject');",
    '});',
  ].join('\n'),
};

const CLEAN: Record<string, string> = {
  // H1 clean — honest kind. H2 clean — first-call console.warn.
  'packages/y/src/HonestAdapter.ts': [
    "import { MockSolver } from './MockSolver.js';",
    'export class HonestAdapter {',
    "  readonly kind = 'mock' as const;",
    '  private warned = false;',
    '  private readonly underlying = new MockSolver();',
    '  solve() {',
    "    if (!this.warned) { this.warned = true; console.warn('[y] HonestAdapter is a SCAFFOLD'); }",
    '    return this.underlying.solve();',
    '  }',
    '}',
  ].join('\n'),
  'packages/y/src/MockSolver.ts': [
    'export class MockSolver {',
    "  readonly kind = 'mock' as const;",
    '  solve() { return null; }',
    '}',
  ].join('\n'),
  // H3 clean — a family whose rule id is named by a REAL test (no stand-in
  // language anywhere near the naming line).
  [PLANTED_REGISTRY.replace('/x/', '/y/')]: [
    'export function build(r: { register(x: unknown): void }) {',
    "  r.register({ id: 'GHOST_MIN_AREA', tier: 1, severity: 'error', check: () => [] });",
    '}',
  ].join('\n'),
  'packages/y/__tests__/rules.test.ts': [
    "import { constraintEngine } from '../src/Rules.js';",
    "it('fires GHOST_MIN_AREA below the minimum', () => {",
    "  const out = constraintEngine.validateAll(ctx);",
    "  expect(out.map((v) => v.ruleId)).toContain('GHOST_MIN_AREA');",
    '});',
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const common = { srcDirs: ['packages'], evidenceDirs: ['packages'], named: [] as NamedFamily[], productionArms: false };
    const bad = analyse(join(base, 'planted'), { ...common, registries: [PLANTED_REGISTRY] });
    const good = analyse(join(base, 'clean'), { ...common, registries: [PLANTED_REGISTRY.replace('/x/', '/y/')] });

    const fired = new Set(bad.findings.map((f) => f.arm));
    lines.push(`NEGATIVE control (planted dishonest tree): ${bad.findings.length} finding(s), arms fired = [${[...fired].sort().join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} FIRED — ${f.key}`);
    lines.push(`POSITIVE control (clean honest tree):      ${good.findings.length} finding(s) — must be 0`);
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key} :: ${f.detail}`);

    for (const arm of ['H1', 'H2', 'H3'] as const) {
      if (!fired.has(arm)) {
        ok = false;
        lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a DELIBERATELY PLANTED violation. ` +
          'A checker that cannot fail has not been shown to work, and its silence is not coverage.');
      }
    }
    if (good.findings.length > 0) { ok = false; lines.push('    ✗ BLIND COMPARATOR — the clean tree was called dirty.'); }

    // The STAND-IN discrimination, asserted separately — it is the arm that
    // silently mis-certified ROOM_MIN_AREA on this gate's first run, so "H3
    // fired" is not enough. It must fire for the RIGHT REASON.
    const phantom = bad.families.find((x) => x.f.id === 'PHANTOM_MIN_AREA');
    if (!phantom) {
      ok = false;
      lines.push('    ✗ BLIND COMPARATOR — the planted stand-in family was never enumerated.');
    } else if (phantom.ev.kind !== 'STAND-IN') {
      ok = false;
      lines.push(`    ✗ BLIND COMPARATOR — a HAND-BUILT STAND-IN was classified '${phantom.ev.kind}', not STAND-IN. ` +
        'A test that names a rule id while re-implementing the rule inline is not evidence of the rule ' +
        '(§1.1 RULE 1(6)) — and certifying one as REAL is this gate reproducing the defect it was written for.');
    } else {
      lines.push(`    ✓ STAND-IN discrimination — planted hand-built stand-in correctly classified STAND-IN (${phantom.ev.at}), not REAL.`);
    }

    // The UNBOUND discrimination, asserted separately for the same reason: this
    // is the arm that certified a free-text string in an unrelated suite as REAL
    // evidence, and a ledger row was struck as PAID on the strength of it.
    const spectre = bad.families.find((x) => x.f.id === 'SPECTRE_MIN_AREA');
    if (!spectre) {
      ok = false;
      lines.push('    ✗ BLIND COMPARATOR — the planted UNBOUND family was never enumerated.');
    } else if (spectre.ev.kind !== 'UNBOUND') {
      ok = false;
      lines.push(`    ✗ BLIND COMPARATOR — a family named ONLY in a free-text string, by a file that never ` +
        `references its registry, was classified '${spectre.ev.kind}'. It must be UNBOUND. Certifying a ` +
        'mention as REAL is how H3::FIRE_COMPARTMENT_AREA was struck from the ledger while UNPROVEN.');
    } else {
      lines.push(`    ✓ UNBOUND discrimination — planted string-only mention correctly classified UNBOUND (${spectre.ev.at}), not REAL.`);
    }
    if (bad.families.length === 0 || good.families.length === 0) {
      ok = false; lines.push('    ✗ BLIND COMPARATOR — a control tree enumerated ZERO families; H3 was never exercised.');
    }
  } catch (e) {
    ok = false;
    lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] EXECUTED CONTROLS (C74 §6.2 — an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, {
  srcDirs: SRC_DIRS,
  evidenceDirs: EVIDENCE_DIRS,
  registries: RULE_REGISTRIES,
  named: NAMED_FAMILIES,
  productionArms: true,
});

const lines: string[] = [];

lines.push('');
lines.push(`── G-INV-1 · adapters discovered: ${a.adapters.length} (source files scanned: ${a.filesScanned})`);
for (const ad of a.adapters) {
  const backed = ad.delegatesTo.length > 0;
  const honest = HONEST_KINDS.has(ad.kind.toLowerCase());
  lines.push(
    `  ${backed ? (honest ? 'H1 ✓ honest ' : 'H1 ✗ DISHONEST') : 'not stand-in-backed'} · ` +
    `${backed ? (ad.signals ? 'H2 ✓ signals ' : 'H2 ✗ SILENT  ') : '                   '} · ` +
    `${ad.className} kind='${ad.kind}'` +
    (backed ? ` → [${ad.delegatesTo.join(', ')}]` : '') +
    `  ${ad.file}:${ad.line}`,
  );
}
if (!a.adapters.some((x) => x.delegatesTo.length > 0 && !HONEST_KINDS.has(x.kind.toLowerCase()))) {
  lines.push('  G-INV-1 reads CLEAN against production. That is a verdict ONLY because the negative control');
  lines.push('  above was watched firing on a planted dishonest adapter in the same run — a clean arm with no');
  lines.push('  control is worthless, and this gate refuses to report one.');
}

lines.push('');
lines.push(`── G-INV-2 · constraint families enumerated: ${a.families.length} (evidence files read: ${a.evidenceFiles})`);
lines.push('  FAMILY                              DECLARED STRENGTH     EXECUTABLE EVIDENCE AT THAT STRENGTH');
for (const { f, strength, ev } of a.families) {
  const mark = ev.kind === 'REAL' ? '✓' : '✗';
  lines.push(
    `  ${mark} ${f.id.padEnd(34)}${strength.padEnd(22)}${
      ev.kind === 'REAL' ? `REAL — ${ev.at}`
        : ev.kind === 'STAND-IN' ? `STAND-IN ONLY — ${ev.at}`
        : ev.kind === 'UNBOUND' ? `UNBOUND MENTION ONLY — ${ev.at}`
        : 'NONE'}`,
  );
}

lines.push('');
for (const f of a.findings) lines.push(`FINDING ${f.arm} — ${f.detail}`);

const measured = new Set(a.findings.map((f) => f.key));
const declared = new Set(LEDGER);
const stale = [...declared].filter((k) => !measured.has(k));
const unexpected = [...measured].filter((k) => !declared.has(k));
if (unexpected.length > 0) {
  lines.push('');
  for (const u of unexpected) lines.push(`⚠ NOT ON THE LEDGER — ${u}`);
}

const floors: Floor[] = [
  { what: 'adapters discovered (C70 §7 floor)', measured: a.adapters.length, min: 1 },
  { what: 'constraint families enumerated', measured: a.families.length, min: 1 },
  { what: 'source files scanned', measured: a.filesScanned, min: 500 },
  { what: 'executable-evidence files read', measured: a.evidenceFiles, min: 100 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  // Compared by NAME in both directions: a finding not on the ledger must raise
  // the code even when the totals happen to match.
  findings: a.findings.length + (unexpected.length > 0 ? LEDGER.length + 1 : 0),
  declared: LEDGER.length,
  findingNames: [...measured].sort(),
  stale,
};

process.exit(reportGate(result));
