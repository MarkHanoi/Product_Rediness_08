/**
 * clashCapability — GE-06: ONE clash verb DETECTS; the other eleven REFUSE BY NAME.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────────────────────────────────────────────────────────────
 * `commands.ts` declares TWELVE `clash-*` command ids (§392–409,
 * `ClashDetectionToolbarCommands`). Until PR-10 not one had a handler anywhere
 * in this repository. A declared id with no handler is, from outside,
 * INDISTINGUISHABLE from a working feature that found nothing — this
 * repository's defining defect class (ADR-0322 §5, "'found nothing' and 'could
 * not look' are never the same value"), and the state C70 L-INV-1 names as the
 * worst a capability can be in. A user who clicks "Run clash detection", sees
 * no clashes, and ships the model has been lied to by silence.
 *
 * PR-10 made all twelve REFUSE, which removed the silence without adding a
 * capability. §GE-06-ROOF-WALL-WIRE then converted exactly ONE of them from
 * "refuses honestly" to "detects truthfully":
 *
 *   `clash-run` → the `roof×wall` pair, over the oracle-tested detector in
 *   `packages/geometry-roof/src/pure/roofWallClash.ts`, injected through the
 *   {@link ClashRunner} port (§7) and registered by `engineLauncher`.
 *
 * WHAT THIS FILE DOES
 *   • Enumerates the twelve ids ONCE, with a compile-time bijection against the
 *     registry type, so the list cannot drift from `commands.ts` (C69's
 *     rival-list rule: never a hand-maintained parallel list).
 *   • Gives every id with no implementation a real `CommandHandler` whose
 *     `execute()` returns a typed {@link CapabilityRefusal} on the
 *     `HandlerResult.refusal` channel — the channel C80 §1.4 built for this.
 *   • Gives `clash-run` a real handler that returns a `CapabilityRunReport` on
 *     the `HandlerResult.report` channel, whose `checked` list scopes its
 *     `findings` — so `findings: []` means "zero clashes in roof×wall", never
 *     "zero clashes" and never "nothing ran".
 *   • Carries the GE-06 §1 pair-coverage manifest as CODE, so every sentence
 *     NAMES the pairs nothing has looked at, rather than waving at them.
 *
 * WHAT THIS FILE DOES **NOT** CLAIM — stated so nobody reads it as a close:
 *   • **GE-06 REMAINS OPEN.** ONE pair of six is checked; five are NOT_BUILT,
 *     and eleven of twelve verbs still have no implementation. A run that
 *     reports no findings has established nothing about `wall×wall`,
 *     `column×slab`, `stair×slab`, `furniture×clearance` or `opening×wall`,
 *     and says so in its own `unchecked` list.
 *   • It does not stub anything to return `[]`. `[]` from an engine that
 *     checked nothing is the `[]`-means-unknown defect at engine scale.
 *   • It says nothing about the ClashDetectionToolbar, which declares a
 *     DIFFERENT twelve ids (only three overlap: `clash-run`,
 *     `clash-filter-new`, `clash-report-export`) and whose fate is the
 *     founder's mount-or-delete call. The verb seam is the surface; the
 *     toolbar is not. **Nine of its twelve buttons dispatch ids the registry
 *     does not declare, so they cannot reach any verb, refusing or otherwise.**
 *
 * WHY `canExecute()` RETURNS VALID
 * A refusal routed through `canExecute({valid:false})` becomes a THROWN
 * `CommandBusError` (`CommandBus.ts:426–432`), and a throw is swallowable by
 * the `catch {}` C80 §10.f names as the fire-and-forget defect. A refusal the
 * caller can drop on the floor is an exception, not a refusal. So the command
 * is accepted and answers with a VALUE the caller reads.
 *
 * Authority: C73 (tolerance/canonical predicates) · C78 §8 (the closed refusal
 * vocabulary) · C80 §1.4 (a refusal carries both numbers and what it protects)
 * · C70 L-INV-1 · ADR-0322 §5 · `docs/03-execution/plans/GE-06-CLASH-ENGINE-DECOMPOSITION.md`.
 */

import {
  capabilityRan,
  capabilityRefused,
  type CapabilityFindingRecord,
  type CapabilityRefusal,
  type UndeterminedReason,
} from './consequence.js';
import type { ClashDetectionToolbarCommands, EmptyPayload } from './commands.js';
import type { CommandHandler, HandlerResult, ValidationResult } from './types.js';

// ─── 1 · The twelve ids, enumerated FROM the registry (C69) ──────────────────

/** A declared clash verb — the key union of the registry entry in `commands.ts`. */
export type ClashCommandId = keyof ClashDetectionToolbarCommands;

/**
 * The twelve declared clash verbs.
 *
 * This is a runtime value because a TypeScript key union cannot be iterated at
 * runtime — but it is NOT a rival list. The two proofs below make it a
 * BIJECTION with `keyof ClashDetectionToolbarCommands`, so it cannot silently
 * drift from `commands.ts` in either direction:
 *
 *   • `satisfies readonly ClashCommandId[]` — every id here IS a registry key,
 *     so no invented verb can appear.
 *   • `_noClashIdOmitted` below — every registry key IS here, so a thirteenth
 *     `clash-*` id added to `commands.ts` FAILS COMPILATION until it is listed
 *     (and therefore until it refuses).
 *
 * That is the C69 rival-list rule satisfied by construction rather than by
 * discipline: there is one authority (`commands.ts`) and this list is pinned to
 * it by the compiler.
 */
export const CLASH_COMMAND_IDS = [
  'clash-run',
  'clash-run-all',
  'clash-select',
  'clash-resolve',
  'clash-group',
  'clash-assign',
  'clash-filter-new',
  'clash-filter-hard',
  'clash-filter-soft',
  'clash-filter-clearance',
  'clash-report-export',
  'clash-settings',
] as const satisfies readonly ClashCommandId[];

/**
 * Compile-time proof that NO registry key is missing from the list above.
 * If `commands.ts` gains a thirteenth clash id, `_Missing` stops being `never`
 * and this assignment is a type error. Runtime-free; erased by the compiler.
 */
type _MissingClashId = Exclude<ClashCommandId, (typeof CLASH_COMMAND_IDS)[number]>;
const _noClashIdOmitted: [_MissingClashId] extends [never] ? true : never = true;
void _noClashIdOmitted;

/** Narrowing guard — is this string one of the twelve declared clash verbs? */
export function isClashCommandId(type: string): type is ClashCommandId {
  return (CLASH_COMMAND_IDS as readonly string[]).includes(type);
}

// ─── 2 · The pair-coverage manifest (GE-06 §1.1 — code, never prose) ─────────

/**
 * How far along a given element-pair detector is.
 *
 * `EXISTS_BUT_UNWIRED` is a deliberate third state rather than being folded
 * into `REGISTERED`. `packages/geometry-roof/src/pure/roofWallClash.ts` is a
 * real, oracle-tested roof-vs-walls-beneath detector (13 tests, commit
 * `83c82c02`) — but nothing routes `clash-run` to it. Reporting it as covered
 * because the code exists would be the "authored-but-unwired" mistake: a pair
 * is CHECKED only when a run actually evaluates it.
 */
export type ClashDetectorState = 'REGISTERED' | 'EXISTS_BUT_UNWIRED' | 'NOT_BUILT';

export interface ClashPairCoverage {
  /** The element pair, e.g. `'roof×wall'`. */
  readonly pair: string;
  readonly state: ClashDetectorState;
  /** What is missing, or where the unwired detector lives. */
  readonly note: string;
}

/**
 * The closed list of element pairs a clash run would have to evaluate, and the
 * honest state of each. Ordered as GE-06 §2 orders them — by measured pain, not
 * symmetry.
 *
 * This manifest is a GROW-ONLY ledger in the direction of coverage: a pair
 * leaves `NOT_BUILT` only by gaining an oracle-tested detector, and leaves
 * `EXISTS_BUT_UNWIRED` only by being wired to a run that actually calls it.
 */
export const CLASH_PAIR_COVERAGE: readonly ClashPairCoverage[] = [
  {
    pair: 'roof×wall',
    state: 'REGISTERED',
    note:
      'detector: packages/geometry-roof/src/pure/roofWallClash.ts (13 oracle tests); ' +
      'runner: pure/roofWallClashRunner.ts; registered via registerClashRun() in ' +
      'apps/editor/src/engine/engineLauncher.ts; reached through the bus in ' +
      'apps/editor/__tests__/RoofWallClashVerbReach.test.ts (§GE-06-ROOF-WALL-WIRE)',
  },
  {
    pair: 'wall×wall',
    state: 'NOT_BUILT',
    note: 'overlap/doubling — needs baseline-segment proximity + thickness-band overlap',
  },
  {
    pair: 'column×slab',
    state: 'NOT_BUILT',
    note: 'penetration — needs vertical interval overlap + canonical point-in-polygon against the slab ring',
  },
  {
    pair: 'stair×slab',
    state: 'NOT_BUILT',
    note: 'stairwell void — needs stair run footprint vs slab ring minus declared void',
  },
  {
    pair: 'furniture×clearance',
    state: 'NOT_BUILT',
    note: 'advisory severity — needs plan AABB overlap + clearance radii from the programme rules',
  },
  {
    pair: 'opening×wall',
    state: 'NOT_BUILT',
    note: 'mostly exposure — WallOccupancyStore.canPlace() already refuses at commit; findings not re-emitted',
  },
] as const;

/**
 * Pairs for which THIS REPOSITORY has a detector wired to a verb — one, today
 * (`roof×wall`, §GE-06-ROOF-WALL-WIRE).
 *
 * ⚠ THIS IS NOT "what the running build checks", and it is never used as one.
 * Registration happens in a composition root, and a build that skipped it
 * checks nothing however much code sits in the tree — the authored-but-unwired
 * mistake, restated as a variable. Every sentence about coverage takes its
 * `checkedPairs` from {@link registerClashRun}'s RETURN VALUE, which is a fact
 * about the live bus, and defaults to EMPTY when a caller does not supply it.
 */
export const REGISTERED_CLASH_PAIRS: readonly string[] = CLASH_PAIR_COVERAGE.filter(
  (p) => p.state === 'REGISTERED',
).map((p) => p.pair);

/**
 * The default `checkedPairs` for every refusal sentence: EMPTY.
 *
 * A build that has not told us what it registered must claim NOTHING. Defaulting
 * to {@link REGISTERED_CLASH_PAIRS} would make an un-wired build print "this
 * build checks roof×wall" because the code exists somewhere in the repo — the
 * precise lie GE-06 was opened to remove, wearing the opposite sign.
 */
const NO_PAIRS_CHECKED: readonly string[] = [];

/** Pairs NOTHING would look at. Named in every refusal, never merely counted. */
export const UNCHECKED_CLASH_PAIRS: readonly string[] = CLASH_PAIR_COVERAGE.filter(
  (p) => p.state !== 'REGISTERED',
).map((p) => p.pair);

// ─── 3 · Which ids are implemented (today: ONE of twelve) ────────────────────

/**
 * Clash verbs backed by a REAL implementation.
 *
 * **ONE of the twelve: `clash-run`** (§GE-06-ROOF-WALL-WIRE), and only for the
 * `roof×wall` pair, which its report names explicitly. An id is added here only
 * together with a handler that does the work, the oracle tests that prove the
 * algorithm, AND a test that reaches it through a dispatch — the last of those
 * is the one this repository keeps skipping, and a green unit test on a pure
 * function is not it (`apps/editor/__tests__/RoofWallClashVerbReach.test.ts`).
 *
 * ⚠ This list is a CENSUS, not a registration input. `registerClashRefusalHandlers`
 * deliberately does not read it — see the note there.
 */
export const IMPLEMENTED_CLASH_COMMAND_IDS: readonly ClashCommandId[] = ['clash-run'];

/** Ids with no implementation — eleven of twelve. */
export const UNIMPLEMENTED_CLASH_COMMAND_IDS: readonly ClashCommandId[] =
  CLASH_COMMAND_IDS.filter((id) => !IMPLEMENTED_CLASH_COMMAND_IDS.includes(id));

export function clashCommandStatus(id: ClashCommandId): 'implemented' | 'unimplemented' {
  return IMPLEMENTED_CLASH_COMMAND_IDS.includes(id) ? 'implemented' : 'unimplemented';
}

// ─── 4 · What each id would need — data, so ONE renderer writes the prose ────

/**
 * The missing capability behind each verb, as a noun phrase.
 *
 * Twelve hand-written refusal sentences would be twelve places for the wording
 * to rot. One renderer over structured data means every refusal names its own
 * verb, its own missing machinery, and the same pair ledger — and a new verb
 * cannot get a vague sentence by default, because `Record<ClashCommandId, …>`
 * will not compile until it has an entry.
 */
const CLASH_MISSING_CAPABILITY: Readonly<Record<ClashCommandId, string>> = {
  'clash-run': 'a clash detector for any element pair',
  'clash-run-all': 'a clash detector for any element pair',
  'clash-select': 'a clash-result store to select a finding from',
  'clash-resolve': 'a clash-result store in which a finding could be marked resolved',
  'clash-group': 'clash findings to group, and a grouping predicate',
  'clash-assign': 'clash findings, and an assignee model to attach one to',
  'clash-filter-new': 'a clash-result set for a filter to apply to',
  'clash-filter-hard': 'a clash-result set, and the hard/soft severity classification',
  'clash-filter-soft': 'a clash-result set, and the hard/soft severity classification',
  'clash-filter-clearance': 'a clash-result set, and clearance-class findings to filter to',
  'clash-report-export': 'clash results to report, and a report serialiser',
  'clash-settings': 'a persisted clash-tolerance model (C73 owns the tolerance vocabulary)',
};

/**
 * THE ONE renderer. Every clash refusal sentence in the product comes from
 * here, so there is a single place to read what the user is told and a single
 * place to fix it.
 *
 * The sentence must survive being shown alone, with no surrounding UI: it names
 * the verb, what is missing, what was NOT looked at, and that this is a refusal
 * rather than a clean result.
 */
export function clashRefusalText(
  commandType: ClashCommandId,
  /**
   * Pairs THIS BUILD actually evaluates, because a composed runner was
   * registered (see {@link registerClashRun}). Defaults to the static
   * manifest's REGISTERED set — i.e. none.
   *
   * ⚠ This is a PARAMETER rather than a module constant on purpose. Whether
   * `roof×wall` is checked is a property of the COMPOSED BUILD, not of the
   * source tree: `packages/geometry-roof`'s detector exists either way, and a
   * build that never registers the runner must not inherit a sentence claiming
   * coverage it does not have. Reading it from a mutable module-level global
   * would make the claim depend on import order — the C69 rival-list defect
   * wearing a different hat.
   */
  checkedPairs: readonly string[] = NO_PAIRS_CHECKED,
): string {
  const missing = CLASH_MISSING_CAPABILITY[commandType];
  const total = CLASH_PAIR_COVERAGE.length;
  const unchecked = CLASH_PAIR_COVERAGE.map((p) => p.pair).filter(
    (p) => !checkedPairs.includes(p),
  );
  const engine =
    checkedPairs.length === 0
      ? 'this build has no clash engine'
      : `this build checks only ${checkedPairs.join(', ')}`;
  return (
    `"${commandType}" is declared but NOT IMPLEMENTED — ${engine}. ` +
    `It requires ${missing}. ` +
    `${checkedPairs.length} of ${total} element pairs have a registered detector; ` +
    `NOT CHECKED: ${unchecked.join(', ')}. ` +
    `This is a REFUSAL, not a clean result — nothing was inspected, so no absence of ` +
    `clashes has been established. Tracked as GE-06 (OPEN); see ` +
    `docs/03-execution/plans/GE-06-CLASH-ENGINE-DECOMPOSITION.md.`
  );
}

// ─── 5 · The refusal itself — reusing capabilityRefused(), not minting one ───

/**
 * The typed refusal for a declared-but-unimplemented clash verb.
 *
 * Built with {@link capabilityRefused} and reason `ENGINE_NOT_AVAILABLE` from
 * the closed eleven-member C78 §8.1 union. NO new refusal type and NO new
 * sub-reason is minted here — a twelfth vocabulary for "the clash engine does
 * not exist" would be the C69 rival-list defect, and the existing vocabulary
 * says it exactly.
 *
 * `asked` and `unaccountedFor` are `undefined`, and that is the CORRECT value
 * rather than a gap: C80 §1.4 permits `undefined` only when the ask names no
 * element set at all, and these verbs take `EmptyPayload` — the user asked
 * about the whole model without naming a set. They are emphatically NOT `0`,
 * which would assert "nothing was in the way" about a model nothing examined.
 */
export function clashCapabilityRefusal(
  commandType: ClashCommandId,
  /** Pairs THIS BUILD checks — see {@link clashRefusalText}. */
  checkedPairs: readonly string[] = NO_PAIRS_CHECKED,
): CapabilityRefusal {
  return capabilityRefused({
    commandType,
    reason: 'ENGINE_NOT_AVAILABLE',
    asked: undefined,
    unaccountedFor: undefined,
    protects:
      "the reader's ability to tell 'no clashes were found' from 'nothing looked for clashes' — " +
      'a model shipped on an unearned clean report',
    detail: clashRefusalText(commandType, checkedPairs),
  });
}

// ─── 6 · The shape a REAL run returns — the differentiator ───────────────────
//
// ⚠ HISTORY, so the deletion is not re-done as an addition. This section used
// to declare `ClashFinding` / `ClashRunReport` / `ClashRunOutcome` locally,
// with `checkedPairs` / `uncheckedPairs`. Wiring a real runner (§8) needed the
// same shape to cross the bus, and TWO structurally-identical report types —
// one clash-local, one on `HandlerResult` — is the C69 rival-list defect this
// very file argues against three sections up. There is now ONE vocabulary,
// `CapabilityRunReport` in `consequence.ts`, and clash uses it unrenamed:
//
//   ClashFinding    → CapabilityFindingRecord   (gained `scope`, `detail`)
//   ClashRunReport  → CapabilityRunReport       (checkedPairs → checked)
//   ClashRunOutcome → CapabilityRunOutcome
//
// The union property that made the old types the deliverable is UNCHANGED and
// now enforced for every capability, not just clash: the arms discriminate on
// `kind`, the refusal arm has NO `findings` key, and `capabilityRan()` refuses
// to construct a report whose `checked` is empty — so "could not look" and
// "looked, found nothing" cannot collapse into one value.

/** The clash pair a finding's `scope` names when the roof→wall runner fires. */
export const ROOF_WALL_PAIR = 'roof×wall';

// ─── 7 · The REAL run — an injected detector, because L1 cannot import L2 ────

/**
 * The port a composed build supplies to make `clash-run` genuinely detect.
 *
 * ⚠ WHY A PORT AND NOT A DIRECT CALL. `command-bus` is L1; every clash
 * detector lives at L2 or above (`geometry-roof`, `geometry-wall`, …).
 * Importing one here would be an upward layer violation
 * (`tools/ga-gate/check-layer-boundaries.ts`). So the geometry stays where it
 * belongs and the composition root injects it — the P1 single-composition-root
 * rule applied to a capability rather than to a runtime.
 */
export interface ClashRunner {
  /**
   * The pairs this runner ACTUALLY evaluates. Must be non-empty and drawn from
   * {@link CLASH_PAIR_COVERAGE}; `registerClashRun` rejects anything else, so a
   * runner cannot claim coverage of a pair the manifest does not know about.
   */
  readonly pairs: readonly string[];
  /**
   * Run the detection.
   *
   * ⚠ THE CONTRACT THAT MATTERS: return `kind: 'ran'` ONLY when the model was
   * genuinely readable. If any input needed to reach a verdict is missing,
   * return `kind: 'unavailable'` — NEVER an empty findings array. An empty
   * array from a runner that could not read the model is the
   * `[]`-means-unknown defect at its most dangerous, because it is green.
   */
  run(): ClashRunnerOutcome;
}

/**
 * What a {@link ClashRunner} hands back: findings it stands behind, or a
 * statement that it could not look.
 *
 * ⚠ WHY THE SECOND ARM IS PLAIN DATA AND NOT A `CapabilityRefusal`. Every
 * clash detector lives at L2+ (`geometry-roof`, `geometry-wall`, …) and this
 * package is L1. If a runner had to CONSTRUCT a `CapabilityRefusal`, every
 * detector package would need a dependency on `@pryzm/command-bus` purely to
 * call `capabilityRefused()` — a new upward-facing edge per detector, bought
 * for a constructor call. So the runner states the FACT (`reason` + `detail`)
 * in plain data and {@link createClashRunHandler} renders the bus vocabulary.
 * The closed C78 §8.1 reason union stays owned here, where the contract is.
 */
export type ClashRunnerOutcome =
  | { readonly kind: 'ran'; readonly findings: readonly CapabilityFindingRecord[] }
  | {
      readonly kind: 'unavailable';
      /**
       * WHY the model could not be read, in the closed §8.1 vocabulary — the
       * runner picks the member, so a detector cannot invent a twelfth reason.
       */
      readonly reason: UndeterminedReason;
      /** The human sentence. The handler appends the coverage clause. */
      readonly detail: string;
    };

/**
 * The REAL `clash-run` handler, built over an injected {@link ClashRunner}.
 *
 * `unchecked` is computed HERE, from the manifest, rather than trusted from
 * the runner: the runner knows what it looked at, but only the manifest knows
 * the full set it was supposed to. That asymmetry is deliberate — a runner
 * cannot shrink the unchecked list by forgetting to mention a pair.
 *
 * `affectedStores` is empty and both patch arrays stay empty because a clash
 * run is a QUERY: it mutates nothing, so it must not land on the undo stack.
 * The answer rides `HandlerResult.report` instead (see types.ts).
 */
export function createClashRunHandler(runner: ClashRunner): CommandHandler<EmptyPayload> {
  const allPairs = CLASH_PAIR_COVERAGE.map((p) => p.pair);
  const unchecked = allPairs.filter((p) => !runner.pairs.includes(p));
  return {
    type: 'clash-run',
    affectedStores: [],
    canExecute(): ValidationResult {
      return { valid: true };
    },
    execute(): Promise<HandlerResult> {
      let outcome: ClashRunnerOutcome;
      try {
        outcome = runner.run();
      } catch (err) {
        // A THROWN detector must not surface as "no clashes". Convert it into
        // the refusal channel so the failure keeps its identity (C78 §0.e —
        // the silent-catch defect) instead of being swallowed into a clean
        // report by the `catch {}` this repo keeps paying for.
        return Promise.resolve({
          forward: [],
          inverse: [],
          refusal: capabilityRefused({
            commandType: 'clash-run',
            reason: 'PLANNER_THREW',
            asked: undefined,
            unaccountedFor: undefined,
            protects:
              "the reader's ability to tell 'no clashes were found' from 'the detector crashed' — " +
              'a model shipped on an unearned clean report',
            detail:
              `"clash-run" invoked the ${runner.pairs.join(', ')} detector and it THREW: ` +
              `${err instanceof Error ? err.message : String(err)}. ` +
              `This is a REFUSAL, not a clean result — no absence of clashes has been established. ` +
              `NOT CHECKED: ${allPairs.join(', ')}.`,
          }),
        });
      }
      if (outcome.kind === 'unavailable') {
        // The runner LOOKED and could not read the model. This must reach the
        // caller as a REFUSAL, never as `findings: []` — the two are the same
        // bytes to a UI that only counts results (C70 L-INV-1).
        return Promise.resolve({
          forward: [],
          inverse: [],
          refusal: capabilityRefused({
            commandType: 'clash-run',
            reason: outcome.reason,
            asked: undefined,
            unaccountedFor: undefined,
            protects:
              "the reader's ability to tell 'no clashes were found' from 'the model could not " +
              "be read' — a model shipped on an unearned clean report",
            detail:
              `"clash-run" could not run the ${runner.pairs.join(', ')} detector: ${outcome.detail} ` +
              `This is a REFUSAL, not a clean result — no absence of clashes has been established. ` +
              `NOT CHECKED: ${allPairs.join(', ')}.`,
          }),
        });
      }
      return Promise.resolve({
        forward: [],
        inverse: [],
        report: capabilityRan({
          commandType: 'clash-run',
          checked: runner.pairs,
          unchecked,
          findings: outcome.findings,
        }),
      });
    },
  };
}

/**
 * Register the REAL `clash-run`. Call this BEFORE
 * {@link registerClashRefusalHandlers}, which then skips the id by its own
 * defer-to-a-real-implementation rule.
 *
 * Returns the pairs now genuinely checked, so the caller can pass them to
 * {@link registerClashRefusalHandlers} and the remaining eleven verbs refuse
 * with an accurate coverage sentence rather than a stale "no clash engine".
 *
 * @throws if the runner declares no pairs, or a pair outside the manifest —
 * both are authoring defects that would make the report over-claim.
 */
export function registerClashRun(
  bus: ClashHandlerRegistrar,
  runner: ClashRunner,
): readonly string[] {
  if (runner.pairs.length === 0) {
    throw new Error(
      'registerClashRun: the runner declares NO pairs. A run that checks nothing ' +
      'must not be registered — leave clash-run refusing instead.',
    );
  }
  const known = new Set(CLASH_PAIR_COVERAGE.map((p) => p.pair));
  for (const p of runner.pairs) {
    if (!known.has(p)) {
      throw new Error(
        `registerClashRun: runner claims pair "${p}", which is not in ` +
        `CLASH_PAIR_COVERAGE [${[...known].join(', ')}]. Add it to the manifest first.`,
      );
    }
  }
  if (bus.has('clash-run')) return runner.pairs;
  bus.register(createClashRunHandler(runner));
  return runner.pairs;
}

// ─── 8 · The refusing handlers, and their registration ──────────────────────

/**
 * The minimal registrar surface — structural, so this module never imports
 * `CommandBus` and no import cycle is created inside the package.
 */
export interface ClashHandlerRegistrar {
  register(handler: CommandHandler<EmptyPayload>): void;
  has(type: string): boolean;
}

/**
 * A handler that accepts the command and answers with a refusal.
 *
 * `forward`/`inverse` are empty — but they are empty ALONGSIDE a populated
 * `refusal`, which is what makes this a determined refusal rather than the
 * C16 CA-18(b) silent no-op it would otherwise be indistinguishable from.
 * `affectedStores` is empty because a refusal mutates nothing.
 */
export function createClashRefusalHandler(
  commandType: ClashCommandId,
  /** Pairs THIS BUILD checks — see {@link clashRefusalText}. */
  checkedPairs: readonly string[] = NO_PAIRS_CHECKED,
): CommandHandler<EmptyPayload> {
  const refusal = clashCapabilityRefusal(commandType, checkedPairs);
  return {
    type: commandType,
    affectedStores: [],
    // Deliberately VALID — see the header: refusing here would THROW, and a
    // throw is swallowable. The refusal must be a value the caller reads.
    canExecute(): ValidationResult {
      return { valid: true };
    },
    execute(): Promise<HandlerResult> {
      return Promise.resolve({ forward: [], inverse: [], refusal });
    },
  };
}

/**
 * Register a refusing handler for every clash verb that has no implementation.
 *
 * Idempotent and deferential: an id already registered is SKIPPED, so the day a
 * lane lands a real `clash-run` detector it simply wins — registering first
 * beats this, and no one has to remember to delete anything. Returns the ids
 * that were actually given a refusal handler, so a caller can log the true
 * number instead of assuming twelve.
 *
 * ⚠ PASS `checkedPairs` — the value {@link registerClashRun} returned. A build
 * that genuinely checks `roof×wall` must not tell the remaining eleven verbs to
 * say "this build has no clash engine": that is the SAME defect as the one this
 * module removed, pointing the other way. The default is the static manifest's
 * REGISTERED set (empty), which is correct only for a build that wired nothing.
 */
export function registerClashRefusalHandlers(
  bus: ClashHandlerRegistrar,
  checkedPairs: readonly string[] = NO_PAIRS_CHECKED,
): readonly ClashCommandId[] {
  const registered: ClashCommandId[] = [];
  // ⚠ ITERATES ALL TWELVE, and skips on `bus.has()` — NOT on the
  // UNIMPLEMENTED census. The two answer different questions, and keying
  // registration on the census re-opens a hole: `clash-run` is implemented, so
  // a census-driven loop skips it unconditionally — including in a build where
  // `registerClashRun` THREW. That build would ship `clash-run` with NO handler
  // at all, back to the thrown "no handler registered for: clash-run" this
  // module was written to retire. Asking the BUS what it actually has is the
  // only question whose answer is a fact about this process.
  for (const id of CLASH_COMMAND_IDS) {
    if (bus.has(id)) continue;
    bus.register(createClashRefusalHandler(id, checkedPairs));
    registered.push(id);
  }
  return registered;
}
