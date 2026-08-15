/**
 * clashCapability — GE-06 / PR-10: the clash verbs REFUSE BY NAME.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────────────────────────────────────────────────────────────
 * `commands.ts` declares TWELVE `clash-*` command ids (§392–409,
 * `ClashDetectionToolbarCommands`). **Not one of them has a handler anywhere in
 * this repository.** There is no clash engine. GE-06 in the BIM30 gap register
 * is a MISSING ALGORITHM, not missing wiring, and this file does not build it.
 *
 * What this file fixes is narrower and, per the GE-06 recount, the cheapest
 * HONEST step available:
 *
 *   > "make `clash-run` REFUSE EXPLICITLY instead of being a registered id with
 *   >  no handler — converts a silent capability lie into a declared refusal."
 *
 * A declared id with no handler is, from outside, INDISTINGUISHABLE from a
 * working feature that found nothing. That is this repository's defining defect
 * class — ADR-0322 §5, "'found nothing' and 'could not look' are never the same
 * value" — and C70 L-INV-1 names a registered id that silently does nothing as
 * the worst state a capability can be in. A user who clicks "Run clash
 * detection", sees no clashes, and ships the model has been lied to by silence.
 *
 * WHAT THIS FILE DOES
 *   • Enumerates the twelve ids ONCE, with a compile-time bijection against the
 *     registry type, so the list cannot drift from `commands.ts` (C69's
 *     rival-list rule: never a hand-maintained parallel list).
 *   • Gives every UNIMPLEMENTED id a real `CommandHandler` whose `execute()`
 *     returns a typed {@link CapabilityRefusal} on the `HandlerResult.refusal`
 *     channel — the channel C80 §1.4 built for exactly this.
 *   • Carries the GE-06 §1 pair-coverage manifest as CODE, so the refusal text
 *     NAMES the pairs nothing has looked at, rather than waving at them.
 *
 * WHAT THIS FILE DOES **NOT** CLAIM — stated so nobody reads it as a close:
 *   • **GE-06 REMAINS OPEN.** Zero clash detectors are registered here. A
 *     refusal is not a detector; it is an honest answer while there is none.
 *   • It does not make any clash verb work, and deliberately does not stub one
 *     to return `[]`. `[]` from an engine that checked nothing is the
 *     `[]`-means-unknown defect at engine scale — the very lie being removed.
 *   • It says nothing about the ClashDetectionToolbar, which declares a
 *     DIFFERENT twelve ids (only three overlap) and whose fate is the founder's
 *     mount-or-delete call. The verb seam is the surface; the toolbar is not.
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

import { capabilityRefused, type CapabilityRefusal } from './consequence.js';
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
    state: 'EXISTS_BUT_UNWIRED',
    note: 'pure detector exists (packages/geometry-roof/src/pure/roofWallClash.ts, 13 oracle tests) but no clash run calls it',
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

/** Pairs a run would actually evaluate today. Empty — that is the point. */
export const REGISTERED_CLASH_PAIRS: readonly string[] = CLASH_PAIR_COVERAGE.filter(
  (p) => p.state === 'REGISTERED',
).map((p) => p.pair);

/** Pairs NOTHING would look at. Named in every refusal, never merely counted. */
export const UNCHECKED_CLASH_PAIRS: readonly string[] = CLASH_PAIR_COVERAGE.filter(
  (p) => p.state !== 'REGISTERED',
).map((p) => p.pair);

// ─── 3 · Which ids are implemented (today: none) ─────────────────────────────

/**
 * Clash verbs backed by a REAL implementation.
 *
 * **Currently empty: zero of the twelve are implemented.** An id is added here
 * only together with a handler that does the work and the oracle tests that
 * prove it. Adding an id here without one would restore precisely the silent
 * lie this module exists to remove, so `__tests__/clash-capability.test.ts`
 * pins the count and forces this comment to be re-read.
 */
export const IMPLEMENTED_CLASH_COMMAND_IDS: readonly ClashCommandId[] = [];

/** Ids with no implementation — every id, today. */
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
export function clashRefusalText(commandType: ClashCommandId): string {
  const missing = CLASH_MISSING_CAPABILITY[commandType];
  const checked = REGISTERED_CLASH_PAIRS.length;
  const total = CLASH_PAIR_COVERAGE.length;
  return (
    `"${commandType}" is declared but NOT IMPLEMENTED — this build has no clash engine. ` +
    `It requires ${missing}. ` +
    `${checked} of ${total} element pairs have a registered detector; ` +
    `NOT CHECKED: ${UNCHECKED_CLASH_PAIRS.join(', ')}. ` +
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
export function clashCapabilityRefusal(commandType: ClashCommandId): CapabilityRefusal {
  return capabilityRefused({
    commandType,
    reason: 'ENGINE_NOT_AVAILABLE',
    asked: undefined,
    unaccountedFor: undefined,
    protects:
      "the reader's ability to tell 'no clashes were found' from 'nothing looked for clashes' — " +
      'a model shipped on an unearned clean report',
    detail: clashRefusalText(commandType),
  });
}

// ─── 6 · The shape a REAL run would return — the differentiator ──────────────

/**
 * One clash finding. Present so the success shape is written down and the two
 * outcomes can be compared; nothing constructs one yet.
 */
export interface ClashFinding {
  readonly aId: string;
  readonly bId: string;
  readonly pair: string;
  readonly kind: 'PENETRATES' | 'CLEARANCE' | 'DUPLICATE';
  readonly magnitudeM: number;
}

/**
 * What a clash run that ACTUALLY RAN returns (GE-06 §1.2). Note `findings` is
 * reported ALONGSIDE `checkedPairs`/`uncheckedPairs`: findings only ever claim
 * the pairs in `checkedPairs`, so an empty `findings` is scoped to what was
 * genuinely evaluated and never over-claims silence.
 */
export interface ClashRunReport {
  readonly kind: 'ran';
  readonly findings: readonly ClashFinding[];
  readonly checkedPairs: readonly string[];
  readonly uncheckedPairs: readonly string[];
}

/**
 * The two — and only two — legal answers to a clash run.
 *
 * **This union IS the deliverable.** The arms are discriminated on `kind`
 * (`'ran'` vs `'refused'`), and the refusal arm has NO `findings` field at all.
 * So "refused because unimplemented" cannot be read as "ran and found nothing"
 * even by accident: there is no empty array to mistake for an answer, and the
 * compiler rejects reading `.findings` without first narrowing on `kind`.
 * Failure and emptiness stop being the same value.
 */
export type ClashRunOutcome = ClashRunReport | CapabilityRefusal;

// ─── 7 · The handlers, and their registration ───────────────────────────────

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
): CommandHandler<EmptyPayload> {
  const refusal = clashCapabilityRefusal(commandType);
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
 */
export function registerClashRefusalHandlers(
  bus: ClashHandlerRegistrar,
): readonly ClashCommandId[] {
  const registered: ClashCommandId[] = [];
  for (const id of UNIMPLEMENTED_CLASH_COMMAND_IDS) {
    if (bus.has(id)) continue;
    bus.register(createClashRefusalHandler(id));
    registered.push(id);
  }
  return registered;
}
