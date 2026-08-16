// WallBatchCreateConsequencePlanner — the SEVENTH composed family (C78 §19.3b, bar 3).
//
// `wall.batch.create` was the family C78 §19.3b NAMES as next, and it names it on the
// selection rule the three landed families established: CHEAPEST REUSE OF PROVEN SUBSTRATE,
// never verb popularity. This planner reuses `WallCreateConsequencePlanner`'s seams
// (`resolveJunctionsWithRecords`, the occupancy refit seed, the constraint core), its
// deterministic hashing, and its four exported geometry helpers — it mints no new discovery
// machinery at all.
//
// ════════════════════════════════════════════════════════════════════════════════════════
// THE OPEN QUESTION C78 §19.3b LEFT FOR THIS COMMIT: ONE PLAN, OR N?
// ════════════════════════════════════════════════════════════════════════════════════════
// SETTLED: **ONE.** The contract forces it three times over, and — the part that matters more
// — N would be WRONG, not merely inconvenient. Both halves are recorded, because a decision
// justified only by contract citation is one a later author will "optimise" away.
//
// ── (i) The contract requires one ────────────────────────────────────────────────────────
//   • §1.2(c) / §10.1 / U-INV-8: "the plan the user approved and the plan the execution binds
//     to are ONE ARTEFACT". Execution binds to *the* plan it was given (singular). N plans for
//     one dispatch gives the executor N candidates for one binding and no rule to choose.
//   • §12.1 / U-INV-9: "one user gesture ... is ONE UNDO UNIT". Measured in this repo:
//     `CreateWallBatchHandler.execute` wraps the whole set in ONE `produceCommand`, yielding
//     one forward/inverse PatchPair and ONE ring entry (`batchNestingUndo.test.ts` I-N3:
//     "ONE `wall.batch.create` dispatch → ONE undo entry"). N plans against one undo unit
//     means N−1 plans bind to nothing.
//   • §9.1: a plan is identified by a hash over its content AND its pre-state. N plans share
//     one pre-state, so N planHashes would carry N−1 approvals nothing can invalidate
//     independently.
//   Structurally the entry point already says so: `ConsequencePreviewService.preview` returns
//   `Promise<ConsequencePlan | null>` — singular. Returning N would require a SERVICE edit,
//   which is exactly what §PLANNER-REGISTRY-GENERIC (consequencePreviewServiceComposition.ts)
//   records that a family row must NOT need.
//
// ── (ii) N is UNSOUND — the load-bearing half ────────────────────────────────────────────
// A batch is not N singles, and the difference is not stylistic. The consequence question a
// create asks is a DIFF: "which existing walls' corners change between (level) and
// (level + newcomer)?" Decomposing a batch into N such diffs admits a false
// DETERMINED-unaffected, which is precisely the inference §1.4 forbids:
//
//   • LEAVE-ONE-OUT (each candidate planned against existing ∪ siblings) reports wall A
//     unaffected in candidate 1's plan (because sibling 2 already re-cut A's mitre) AND
//     unaffected in candidate 2's plan (because sibling 1 already did). A is jointly affected
//     and individually "unnecessary" — so the union of the N plans MISSES it.
//   • ONE-AT-A-TIME (each candidate planned against existing alone) misses every
//     candidate↔candidate junction outright: no sub-plan can see a sibling that, in its
//     world, does not exist. Generator batches are *mostly* candidate↔candidate junctions —
//     a room ring is four walls that join each other and nothing else — so this decomposition
//     loses the majority of the answer.
//
// Neither decomposition is a superset of the whole-batch diff. The junction question is
// therefore posed ONCE per level over the WHOLE candidate set, and that is why this file
// exists at all rather than being a loop over the single-wall planner.
//
// ── WHAT THAT DOES NOT CHANGE ────────────────────────────────────────────────────────────
// Either way `wall.batch.create` counts as ONE consequential verb in the U-INV-1 denominator
// (§19.3b says so explicitly). The gate's `opClassOf` classes it `batch` because `batch` is a
// SEGMENT of the verb; it is one of the 12 batch verbs among the 100.
//
// ════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE LIVES IN apps/editor/src/engine — identical to the single-create planner's
// reason, restated so it is not inferred: the consequence CONTRACT is `@pryzm/command-bus`
// (L1), but this planner must reach `@pryzm/geometry-wall` (L2) and `@pryzm/constraint-solver`
// (L2). A planner at L1 importing those is the UPWARD edge check-layer-boundaries exits 3 on.
// apps/editor is L7, so every edge here is DOWNWARD. Every package import is `import type`
// (erased at runtime) and every heavyweight collaborator is INJECTED, so this planner
// constructs and runs in a plain node env with no `window.*` and no singleton at import.
//
// THE PURITY INVARIANT (ADR-0322 §2): no authoritative state is mutated. Every read is over
// the caller-supplied read-only `PlanningContext` or over CLONES; candidates are FRESH objects
// appended to COPIES. G-REASON-01 (purity) and G-REASON-02 (determinism) are the gates.

import type {
  ConsequencePlan,
  ConsequencePlanner,
  PlanningContext,
  ImpactDetermination,
  UndeterminedImpact,
  ConsequenceRefusal,
  ViolationRef,
  ElementId,
} from '@pryzm/command-bus';

// Type-only — erased at runtime, so importing them couples nothing and touches no window.
import type { WallData, WallBaseline, OpeningRefitPlan } from '@pryzm/geometry-wall';
import type {
  WallInput,
  WallJunctionRecord,
  WallMiter,
} from '@pryzm/geometry-wall';
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';

// The ONE stable serialisation, shared with the move and single-create planners so all three
// hash with the same algorithm (ADR-0322 §6's one-algorithm rule applied to hashing).
import { stableStringify } from './WallMoveConsequencePlanner.js';

// §BATCH-REUSES-THESE — imported, never re-derived. See the note at their definition site:
// `segmentsProperlyCross` is already one restatement of a `@pryzm/room-topology` private, and
// a second fork would let the single-wall and batch planners disagree about whether a wall is
// driven THROUGH a room. The injected-collaborator TYPES are shared for the same reason: the
// batch family is composed from the SAME three production singletons as the single family
// (wallCreatePlannerComposition.ts), so a divergent seam type would be a lie about that.
import {
  fnv1a,
  sortedUnique,
  determined,
  segmentsProperlyCross,
  miterSignature,
  type Pt,
  type JunctionResolver,
  type OpeningRefitReader,
  type ViolationValidator,
} from './WallCreateConsequencePlanner.js';

// ─── The command this planner answers for ────────────────────────────────────────────

/**
 * One entry of the batch — `CreateWallPayload` as `CreateWallBatchHandler` consumes it
 * (plugins/wall/src/handlers/CreateWallBatch.ts), narrowed to the fields a consequence
 * question depends on plus the three `canExecute` reads mirrored below.
 *
 * Every field is optional because `CreateWallPayload`'s are: `Wall.parse({})` is a valid
 * wall. Narrowing here would reject dispatches the handler accepts.
 */
export interface WallBatchCreateEntry {
  readonly id?: string;
  readonly levelId?: string;
  readonly baseLine?: WallBaseline;
  readonly thickness?: number;
  readonly height?: number;
  readonly systemTypeId?: string;
  /** Present ⇒ curved. The junction resolver is chord-based without tangents; see below. */
  readonly curve?: unknown;
}

/**
 * `wall.batch.create` as a SEMANTIC operation. The payload mirrors `CreateWallBatchPayload`
 * exactly: a `walls` list plus an OPTIONAL batch-level `levelId` default applied to any entry
 * that omits its own (`w.levelId ?? defaultLevelId`, handler `:132`).
 *
 * `walls` is typed OPTIONAL even though the handler's interface marks it required, because
 * the handler's own `canExecute` begins `if (!Array.isArray(cmd.walls) ...)` — i.e. it
 * expects to receive payloads where it is absent or not an array, and REFUSES them with a
 * sentence. Typing it required here would make that refusal branch unreachable from a
 * well-typed call site, and a refusal nobody can reach is a refusal nobody has tested.
 */
export interface WallBatchCreateCommand {
  readonly type: 'wall.batch.create';
  readonly payload: {
    readonly walls?: readonly WallBatchCreateEntry[];
    readonly levelId?: string;
  };
}

// ─── Injected collaborators ──────────────────────────────────────────────────────────

/**
 * The wall-type catalogue, as `CreateWallBatchHandler` holds it — `WallSystemTypeStore.has`.
 *
 * MIRRORED AS OPTIONAL BECAUSE IT IS OPTIONAL THERE. The handler's constructor takes
 * `systemTypeStore?` and every `systemTypeId` check is guarded by
 * `this.systemTypeStore !== undefined` (`:86`, `:110`): with no catalogue wired the handler
 * performs NO type validation at all and accepts any `systemTypeId`. So an absent catalogue
 * here is not a planner deficiency to paper over — it is the handler's own documented S07
 * behaviour, and the branch below reproduces it rather than inventing a refusal the commit
 * path would not raise. What the planner CANNOT know is which of the two the runtime is in,
 * and that uncertainty is declared, not guessed.
 */
export interface SystemTypeCatalogue {
  has(id: string): boolean;
}

/**
 * Everything the planner needs beyond the read-only `PlanningContext`. ALL OPTIONAL: an
 * ABSENT collaborator is the honest `ENGINE_NOT_AVAILABLE` case, declared as `undetermined`,
 * NOT silently skipped. The planner constructs and runs with `{}`.
 */
export interface WallBatchCreatePlannerDeps {
  readonly resolveJunctions?: JunctionResolver;
  readonly occupancy?: OpeningRefitReader;
  readonly validator?: ViolationValidator;
  readonly systemTypes?: SystemTypeCatalogue;
}

// ─── Internal shapes ─────────────────────────────────────────────────────────────────

/** A batch entry that survived `canExecute`, materialised as the wall it would become. */
interface Candidate {
  /** Index in the ORIGINAL `walls` array — the coordinate every refusal sentence uses. */
  readonly index: number;
  readonly id: string;
  /** True when the entry carried no `id` and the planner minted a stable placeholder. */
  readonly idIsPlaceholder: boolean;
  readonly wall: WallData;
}

/** The mirrored `canExecute` verdict: the FIRST failing entry, or nothing. */
interface CanExecuteVerdict {
  /** Absent ⇒ the batch passes `canExecute`. */
  readonly refusal?: ConsequenceRefusal;
  /** Entries the real `canExecute` never reached, because it returns at the first failure. */
  readonly uncheckedFrom?: number;
}

// ─── The planner ─────────────────────────────────────────────────────────────────────

export class WallBatchCreateConsequencePlanner
  implements ConsequencePlanner<WallBatchCreateCommand>
{
  constructor(private readonly deps: WallBatchCreatePlannerDeps = {}) {}

  async plan(
    command: WallBatchCreateCommand,
    context: PlanningContext,
  ): Promise<ConsequencePlan> {
    const payload = command.payload;
    const entries = payload.walls;

    const wallView = context.getStore('wall');
    const allWalls = wallView ? ([...wallView.getAll()] as WallData[]) : [];

    // State hash — over exactly the authoritative state the plan is computed from, so a stale
    // approval (R6) is detectable. Deterministic (stableStringify) by construction, and the
    // SAME shape as the single-create planner's so the two rows hash comparably.
    const stateHash = fnv1a(stableStringify({ batchCreate: payload, walls: allWalls }));

    const undetermined: UndeterminedImpact[] = [];
    const refused: ConsequenceRefusal[] = [];
    const changed: string[] = [];
    const topologyAdded: string[] = [];
    const topologyModified: string[] = [];

    // ── canExecute, MIRRORED VERBATIM — refuse, never refit ───────────────────────────
    // A batch `canExecute` failure declines the WHOLE batch: the bus never calls `execute`,
    // so NOT ONE wall is created. The plan must say that. Reporting the N−1 valid entries as
    // `topology.added` would be a plan for an execution that will not happen — §1.2(c)'s
    // "never execute a different algorithm from the one previewed", inverted.
    const verdict = this.canExecuteMirror(entries);
    if (verdict.refusal) {
      refused.push(verdict.refusal);
      if (verdict.uncheckedFrom !== undefined && entries) {
        undetermined.push({
          scope: `the validity of walls[${verdict.uncheckedFrom}..${entries.length - 1}] of this batch`,
          reason: 'INVALID_REQUEST',
          detail:
            `CreateWallBatchHandler.canExecute RETURNS AT THE FIRST failing entry, so entries ` +
            `${verdict.uncheckedFrom}..${entries.length - 1} are never evaluated by the commit ` +
            'path at all. This plan mirrors that precedence verbatim rather than evaluating them ' +
            'itself: reporting them as valid would state a verdict the handler never reaches, and ' +
            'reporting them as invalid would invent one. They are UNCHECKED.',
        });
      }
      undetermined.push({
        scope: 'every consequence of this batch',
        reason: 'INVALID_REQUEST',
        detail:
          'the batch fails CreateWallBatchHandler.canExecute, so the bus will not call execute ' +
          'and NO wall in this batch comes into existence. There is no partial batch: the ' +
          'handler commits the whole set in ONE produceCommand or none of it. Nothing downstream ' +
          'is therefore predicted — not because the questions are unanswerable, but because the ' +
          'operation that would raise them is declined.',
      });
      return this.assemble({
        command,
        stateHash,
        direct: {
          kind: 'undetermined',
          scope: 'the walls this batch would create',
          reason: 'INVALID_REQUEST',
          detail: verdict.refusal.reason,
        },
        indirect: {
          kind: 'undetermined',
          scope: 'indirect impact of this batch',
          reason: 'INVALID_REQUEST',
          detail: 'the batch is refused; there is no create to reason from',
        },
        changed: [],
        excluded: [],
        topologyAdded: [],
        topologyModified: [],
        refused,
        undetermined,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    }

    // Past `canExecute`, `entries` is a non-empty array — the mirror proved it.
    const list = entries as readonly WallBatchCreateEntry[];

    // ── The unknowable-catalogue declaration (see SystemTypeCatalogue) ────────────────
    const namedTypes = list.some((w) => typeof w.systemTypeId === 'string');
    if (namedTypes && !this.deps.systemTypes) {
      undetermined.push({
        scope: `whether the commit path refuses this batch over an unknown systemTypeId`,
        reason: 'ENGINE_NOT_AVAILABLE',
        detail:
          'entries in this batch name a systemTypeId, but no wall-type catalogue is composed in ' +
          'this runtime, so `WallSystemTypeStore.has` cannot be consulted. The commit path is ' +
          'CONDITIONAL on exactly this: with a catalogue wired it refuses the whole batch with ' +
          '`walls[i]: unknown systemTypeId: <id>`; without one it validates nothing and accepts ' +
          'any id (CreateWallBatch.ts :84-93, guarded by `this.systemTypeStore !== undefined`). ' +
          'Which of the two the executing runtime is in is NOT knowable here, so neither outcome ' +
          'is asserted. Note this is ALSO re-checked inside execute (:108-114) and throws there, ' +
          'so a catalogue mutation between canExecute and execute aborts the batch mid-flight.',
      });
    }

    // ── Materialise the candidates ───────────────────────────────────────────────────
    const defaultLevelId = payload.levelId ?? '';
    const candidates: Candidate[] = [];
    const noBaseline: number[] = [];

    for (let i = 0; i < list.length; i++) {
      const w = list[i]!;
      // The newcomer's name. When the entry omits an id the live handler mints a ULID
      // (`w.id ?? createId('wall')`, :116) — a RANDOM source a planner must not touch
      // (G-REASON-02). The plan names it by a placeholder DERIVED from the entry AND its
      // index: index is included because two IDENTICAL entries in one batch are legal and
      // would otherwise collide onto one placeholder, silently merging two walls into one.
      const idIsPlaceholder = w.id === undefined;
      const id = w.id ?? `wall-pending-${fnv1a(stableStringify({ i, w }))}`;

      if (!w.baseLine || w.baseLine.length < 2 || !w.baseLine[0] || !w.baseLine[1]) {
        // Not a refusal: `Wall.parse({})` is valid and the handler will apply the schema
        // default. But every geometric branch reasons about a centreline, and there is none
        // to reason about — so this entry is EXCLUDED FROM THE SOLVE and declared, rather
        // than fed to the resolver as a degenerate segment that would fabricate junctions.
        noBaseline.push(i);
        topologyAdded.push(id);
        changed.push(id);
        continue;
      }

      candidates.push({
        index: i,
        id,
        idIsPlaceholder,
        wall: {
          id,
          type: 'wall',
          levelId: w.levelId ?? defaultLevelId,
          baseLine: w.baseLine,
          height: w.height ?? 0,
          thickness: w.thickness ?? 0,
          openings: [],
          ...(w.systemTypeId !== undefined ? { systemTypeId: w.systemTypeId } : {}),
          ...(w.curve !== undefined ? { curve: w.curve } : {}),
        } as unknown as WallData,
      });
      topologyAdded.push(id);
      changed.push(id);
    }

    if (noBaseline.length > 0) {
      undetermined.push({
        scope: `junction / room-partition / clash impact of walls[${noBaseline.join(', ')}] of this batch`,
        reason: 'STALE_DERIVED_STATE',
        detail:
          `${noBaseline.length} entr${noBaseline.length === 1 ? 'y' : 'ies'} in this batch carry no ` +
          'explicit baseLine; the handler will apply the Wall schema default, which is not knowable ' +
          'to this planner without duplicating the schema. Those entries are held OUT of the ' +
          'junction solve — feeding a degenerate segment to the resolver would fabricate junctions ' +
          'that the real, defaulted geometry does not have — so no geometric branch is evaluated ' +
          'for them. They still enter topology.added: they ARE created.',
      });
    }

    const placeholders = candidates.filter((c) => c.idIsPlaceholder);
    if (placeholders.length > 0) {
      undetermined.push({
        scope: `the identities of ${placeholders.length} wall(s) created by this batch`,
        reason: 'STALE_DERIVED_STATE',
        detail:
          `walls[${placeholders.map((c) => c.index).join(', ')}] carry no id, so the live handler ` +
          "will mint fresh ULIDs at execute time (CreateWallBatch.ts: w.id ?? createId('wall')). " +
          'The plan names them by stable, entry-and-index-derived placeholders ' +
          `(${placeholders.map((c) => c.id).join(', ')}); their REAL ids are unknowable before ` +
          'execution, so predicted-vs-actual must not score these identities as divergences.',
      });
    }

    // ── Batch-only hazard 1: two entries claiming ONE id ──────────────────────────────
    // `execute` writes `for (const w of fresh) draft[w.id] = w;` (:169). Two entries with the
    // same id do NOT both exist afterwards — the LATER one wins and the earlier one is
    // silently discarded. `canExecute` does not test for it (it validates each entry in
    // isolation), so nothing in the commit path reports it. This is the §1.2(a) shape — a
    // dependency known the moment a field names it — and it is BATCH-ONLY: a single create
    // has no sibling to collide with.
    const byId = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const seen = byId.get(c.id);
      if (seen) seen.push(c);
      else byId.set(c.id, [c]);
    }
    const collidingIds = [...byId.entries()].filter(([, cs]) => cs.length > 1);
    if (collidingIds.length > 0) {
      const detail = collidingIds
        .map(([id, cs]) => `${id} claimed by walls[${cs.map((c) => c.index).join(', ')}]`)
        .sort()
        .join('; ');
      undetermined.push({
        scope: `which entry wins for ${collidingIds.length} duplicated id(s) in this batch`,
        reason: 'INVALID_REQUEST',
        detail:
          `${detail}. CreateWallBatchHandler.execute writes \`draft[w.id] = w\` per entry, so for a ` +
          'duplicated id the LAST entry in array order wins and the earlier one never comes into ' +
          'existence — silently: canExecute validates each entry in isolation and has no ' +
          'cross-entry uniqueness check. The winner is determinate (array order), but WHICH ' +
          "geometry each caller intended is not, and the discarded entries' geometry is NOT in " +
          'the solve below. topology.added names each id ONCE, never twice.',
      });
    }

    // ── Batch-only hazard 2: an entry claiming an EXISTING wall's id ──────────────────
    // Same write, different collision: `draft[existingId] = freshWall` REPLACES the live
    // wall wholesale — its openings, its layers and its baseline are gone. That is a
    // DETERMINED consequence for an existing element, so the wall enters `changed`; what is
    // NOT determined is the fate of everything hosted on it.
    const existingIds = new Set(allWalls.map((w) => w.id));
    const replacing = candidates.filter((c) => existingIds.has(c.id));
    if (replacing.length > 0) {
      for (const c of replacing) {
        changed.push(c.id);
        topologyModified.push(c.id);
      }
      undetermined.push({
        scope: `elements hosted on the ${replacing.length} existing wall(s) this batch overwrites`,
        reason: 'RELATIONSHIP_NOT_READABLE',
        detail:
          `walls[${replacing.map((c) => c.index).join(', ')}] carry ids that ALREADY EXIST ` +
          `(${replacing.map((c) => c.id).sort().join(', ')}). CreateWallBatchHandler.execute writes ` +
          '`draft[w.id] = w` with a wall built fresh from Wall.parse and `openings: []`, so the ' +
          'existing wall is REPLACED, not merged: its hosted openings, resolved layers and ' +
          'baseline are overwritten in one assignment. The walls are reported as changed. What ' +
          'becomes of the doors and windows hosted on them is NOT determined here — the host↔hosted ' +
          'edge has no typed reverse reader on this path, and no commit-path branch relocates or ' +
          'refuses them.',
      });
    }

    // ── Branch 1: junction — the WHOLE-BATCH before/after diff, PER LEVEL ─────────────
    const junction = this.junctionBranch(allWalls, candidates);
    if (junction.membership.kind === 'determined') {
      for (const wid of junction.membership.elements) changed.push(wid);
      for (const wid of junction.topologyModified) topologyModified.push(wid);
    } else {
      undetermined.push(junction.membership);
    }
    for (const u of junction.declared) undetermined.push(u);

    // ── Branch 2: opening-refit — per candidate, a DETERMINED-EMPTY positive answer ───
    // A newly created wall has no openings: `CreateWallPayload` has no `openings` field and
    // the handler writes `Wall.parse({...})` without one. `planOpeningRefit` short-circuits
    // on an empty opening set. So this branch is TRIVIALLY DETERMINED — "there are no hosted
    // openings to refit" is a real, positive answer, not a blind spot — and the seed is still
    // CALLED per candidate when composed, so if that invariant ever changes the plan tracks it
    // instead of asserting a stale truth.
    for (const c of candidates) {
      const refit = this.openingBranch(c.wall);
      for (const r of refit.relocations) changed.push(r.opening.elementId ?? r.opening.id);
      for (const ref of refit.refusals) {
        refused.push({ elementId: ref.elementId ?? ref.openingId, reason: ref.reason });
      }
    }

    // ── Branch 3: room partition — the union over candidates ─────────────────────────
    const rooms = this.roomPartitionBranch(context, candidates);
    if (rooms.membership.kind === 'determined') {
      for (const rid of rooms.membership.elements) changed.push(rid);
    } else {
      undetermined.push(rooms.membership);
    }
    for (const u of rooms.perRoom) undetermined.push(u);

    // ── Branch 4: wall-vs-wall solid clash — a DECLARED blind spot ───────────────────
    // Restated from the single-create planner verbatim, and it is why `excluded` stays EMPTY
    // in this plan: while solid overlap is unchecked for the whole level, no level wall can be
    // reported as CHECKED-and-unaffected without contradicting this entry in the same plan.
    // The single-create planner makes the same choice for the same reason.
    const levels = sortedUnique(candidates.map((c) => c.wall.levelId));
    undetermined.push({
      scope: `solid clash between the ${candidates.length} new wall(s) and existing walls on level(s) ${levels.join(', ') || '(none)'}`,
      reason: 'ENGINE_NOT_AVAILABLE',
      detail:
        'no wall-vs-wall footprint collision check is reachable. WallOccupancyStore.canPlace answers ' +
        'wall↔OPENING overlap only, and the nearest wall↔wall facility ' +
        '(WallJoinResolver §FIX-WALL-FACE-TRIM-NO-CLASH) is DEFAULT-OFF behind the ' +
        '`globalThis.__pryzmWallFaceTrimNoClash` flag and carries a documented open design gap. ' +
        'Whether the new walls overlap the solid of an existing one — or of EACH OTHER, which a ' +
        'batch makes possible in a way a single create does not — is therefore NOT checked, and ' +
        'not "checked and clear". This is why `excluded` is empty: nothing on these levels can be ' +
        'called CHECKED-and-unaffected while this question is open.',
    });

    // ── Branch 5: violations — clone, add ALL candidates, diff ───────────────────────
    const violation = this.violationsBranch(context, candidates);
    if (violation.kind === 'undetermined') undetermined.push(violation.undetermined);

    // ── Branch 6: regeneration — a declared blind spot ───────────────────────────────
    undetermined.push(this.regenerationUndetermined(candidates.length + noBaseline.length));

    // ── indirect impact ──────────────────────────────────────────────────────────────
    // Everything reached NOT via the payload's own subjects. If any indirect branch is
    // undetermined the indirect reach is incomplete, so `indirect` is undetermined (honest)
    // rather than a partial determined set — the single-create planner's rule, unchanged.
    const indirect: ImpactDetermination =
      junction.membership.kind === 'undetermined'
        ? {
            kind: 'undetermined',
            scope: 'indirect impact (junction + room-partition) of this batch create',
            reason: junction.membership.reason,
            detail: junction.membership.detail,
          }
        : rooms.membership.kind === 'undetermined'
          ? {
              kind: 'undetermined',
              scope: 'indirect impact (junction + room-partition) of this batch create',
              reason: rooms.membership.reason,
              detail: rooms.membership.detail,
            }
          : determined([...junction.membership.elements, ...rooms.membership.elements]);

    return this.assemble({
      command,
      stateHash,
      direct: determined(topologyAdded),
      indirect,
      changed,
      excluded: [],
      topologyAdded,
      topologyModified,
      refused,
      undetermined,
      validation: violation.validation,
    });
  }

  // ── canExecute mirror ──────────────────────────────────────────────────────────────

  /**
   * `CreateWallBatchHandler.canExecute`, MIRRORED VERBATIM — same order, same sentences.
   *
   * REFUSE, NEVER REFIT (the discipline the hosted-opening CREATE family established): the
   * planner does not invent a refusal the commit path would not raise, and does not soften
   * one it would. The four entry checks below are transcribed from CreateWallBatch.ts :70-94
   * INCLUDING their order, because the handler returns at the FIRST failure and the sentence
   * a user sees is that one. The `systemTypeId` check is deliberately NOT here: it is
   * conditional on an injected catalogue and is handled at the call site, where its
   * conditionality can be declared rather than resolved by guesswork.
   */
  private canExecuteMirror(
    entries: readonly WallBatchCreateEntry[] | undefined,
  ): CanExecuteVerdict {
    if (!Array.isArray(entries) || entries.length === 0) {
      // No `elementId`: ConsequenceRefusal documents the field as "absent when the refusal is
      // about the command as a whole", and a batch with no entries names no element at all.
      return { refusal: { reason: 'walls must be a non-empty array' } };
    }
    for (let i = 0; i < entries.length; i++) {
      const w = entries[i]!;
      if (w.height !== undefined && (!Number.isFinite(w.height) || w.height <= 0)) {
        return { refusal: { reason: `walls[${i}].height must be > 0` }, uncheckedFrom: i + 1 };
      }
      if (w.thickness !== undefined && (!Number.isFinite(w.thickness) || w.thickness < 0.05)) {
        return {
          refusal: { reason: `walls[${i}].thickness must be ≥ 0.05 m` },
          uncheckedFrom: i + 1,
        };
      }
      if (w.id !== undefined && (typeof w.id !== 'string' || w.id.length === 0)) {
        return {
          refusal: { reason: `walls[${i}].id must be a non-empty string when provided` },
          uncheckedFrom: i + 1,
        };
      }
      if (
        w.systemTypeId !== undefined &&
        this.deps.systemTypes !== undefined &&
        !this.deps.systemTypes.has(w.systemTypeId)
      ) {
        return {
          refusal: { reason: `walls[${i}]: unknown systemTypeId: ${w.systemTypeId}` },
          uncheckedFrom: i + 1,
        };
      }
    }
    return {};
  }

  // ── Branch helpers ─────────────────────────────────────────────────────────────────

  /**
   * Which EXISTING walls will the batch join, and whose corners will it re-cut?
   *
   * THE ONE DIFF, PER LEVEL — the decision this file's header argues at length:
   *
   *   before = resolveJunctionsWithRecords(level walls, candidates EXCLUDED)
   *   after  = resolveJunctionsWithRecords(level walls + EVERY candidate on that level)
   *
   *   joined-with        every distinct EXISTING wall sharing a junction record with any
   *                      candidate (candidate↔candidate records are real too, but both ends
   *                      are already in topology.added, so they add nothing to `changed`)
   *   topology-modified  every existing wall whose MITER SIGNATURE differs across the diff
   *
   * PER LEVEL because the resolver is documented as "all junctions for a set of walls on ONE
   * level": a batch may legally span levels (each entry may override the batch default), and
   * feeding a cross-level set would fabricate junctions between walls at different
   * elevations. A single create could not raise this question — it has exactly one level.
   *
   * Existing walls whose ids a candidate REPLACES are held OUT of the `before` set: after
   * execute they are the candidate, not their old selves, so leaving the old geometry in
   * `before` would diff the new wall against a wall that no longer exists and report its own
   * replacement as a corner change on a third party.
   *
   * Both sets are DETERMINED — including empty ("these walls touch nothing existing", a real
   * answer). Absent resolver ⇒ `ENGINE_NOT_AVAILABLE`, never an empty claim.
   */
  private junctionBranch(
    allWalls: readonly WallData[],
    candidates: readonly Candidate[],
  ): {
    membership: ImpactDetermination;
    topologyModified: readonly string[];
    declared: readonly UndeterminedImpact[];
  } {
    const declared: UndeterminedImpact[] = [];

    if (candidates.length === 0) {
      // Every entry lacked a baseline; that is already declared at the call site. There is no
      // geometry to solve, and saying "joins nothing" would be the failure-as-emptiness defect.
      return {
        membership: {
          kind: 'undetermined',
          scope: 'junction impact of this batch',
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no entry in this batch carries a baseLine, so there is no candidate geometry to solve ' +
            'against the level. Which existing walls are joined or re-cut is not determined.',
        },
        topologyModified: [],
        declared,
      };
    }

    if (!this.deps.resolveJunctions) {
      return {
        membership: {
          kind: 'undetermined',
          scope: `junction impact of the ${candidates.length} new wall(s) in this batch`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no junction resolver is composed in this runtime; which existing walls the batch joins, ' +
            'and whose corners it re-cuts, cannot be predicted',
        },
        topologyModified: [],
        declared,
      };
    }

    // A curved newcomer: the resolver derives heading from the CHORD unless per-endpoint
    // tangents are supplied, and `curve → tangent` derivation lives in WallPipelineV2. So the
    // branch still answers WHICH walls are touched (cluster proximity is chord-endpoint based
    // and correct) but declares the CORNER GEOMETRY unpredicted — for the whole batch, since
    // one curved member perturbs the solve every other member is diffed inside.
    const curved = candidates.filter((c) => (c.wall as { curve?: unknown }).curve !== undefined);
    if (curved.length > 0) {
      declared.push({
        scope: `mitre geometry at the junctions of ${curved.length} CURVED wall(s) in this batch (${curved
          .map((c) => c.id)
          .sort()
          .join(', ')})`,
        reason: 'ENGINE_NOT_AVAILABLE',
        detail:
          'those entries carry a curve descriptor, but the per-endpoint TANGENTS the resolver needs ' +
          '(WallInput.startDir/endDir) are derived by WallPipelineV2 from the Bézier control point ' +
          'and are not available to this planner. The resolver would fall back to the CHORD heading, ' +
          'which is the §FIX-WALL-ARC-LINEAR-MITRE defect (chord and tangent differ by up to tens of ' +
          'degrees). Which walls are touched is still reported; the resulting corner geometry is NOT ' +
          'predicted — and in a BATCH that is wider than in a single create, because the curved ' +
          "member sits inside the same solve every straight member's mitre is diffed within.",
      });
    }

    const toInput = (w: WallData): WallInput => ({
      id: w.id,
      start: { x: w.baseLine[0].x, z: w.baseLine[0].z },
      end: { x: w.baseLine[1].x, z: w.baseLine[1].z },
      thickness: typeof w.thickness === 'number' ? w.thickness : 0,
      ...(w.systemTypeId !== undefined ? { systemTypeId: w.systemTypeId } : {}),
    });

    const candidateIds = new Set(candidates.map((c) => c.id));

    // Group candidates by level, in DETERMINISTIC level order.
    const byLevel = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const bucket = byLevel.get(c.wall.levelId);
      if (bucket) bucket.push(c);
      else byLevel.set(c.wall.levelId, [c]);
    }
    const levelIds = [...byLevel.keys()].sort();

    const joined: string[] = [];
    const cornerChanged: string[] = [];
    const crossed: string[] = [];

    for (const levelId of levelIds) {
      const levelCandidates = byLevel
        .get(levelId)!
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));

      const levelWalls = allWalls.filter(
        (w) => w.levelId === levelId && !candidateIds.has(w.id),
      );

      // Stable ordering: the resolver's clustering is documented as input-order dependent, so
      // the input MUST be ordered deterministically or the plan is not reproducible. Existing
      // walls sorted by id, then the candidates sorted by id appended at a fixed position.
      const beforeInputs = levelWalls
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(toInput);
      const afterInputs = [...beforeInputs, ...levelCandidates.map((c) => toInput(c.wall))];

      let before: { miters: WallMiter[]; junctions: WallJunctionRecord[] };
      let after: { miters: WallMiter[]; junctions: WallJunctionRecord[] };
      try {
        before = this.deps.resolveJunctions(beforeInputs);
        after = this.deps.resolveJunctions(afterInputs);
      } catch {
        // A resolver that threw is not "joins nothing" — it is a solve that could not run.
        // ONE level failing makes the WHOLE membership undetermined: a partial determined set
        // assembled from the levels that did solve would read as complete.
        return {
          membership: {
            kind: 'undetermined',
            scope: `junction impact of the ${candidates.length} new wall(s) in this batch`,
            reason: 'ENGINE_NOT_AVAILABLE',
            detail: `the junction resolver threw while solving the proposed level ${levelId}`,
          },
          topologyModified: [],
          declared,
        };
      }

      // Joined-with: every wall sharing a junction record with any candidate. Candidate ends
      // are filtered out — they are already in topology.added, and an added element must never
      // also be claimed as modified.
      for (const rec of after.junctions) {
        if (!rec.wallIds.some((wid) => candidateIds.has(wid))) continue;
        for (const wid of rec.wallIds) if (!candidateIds.has(wid)) joined.push(wid);
      }

      // Corner-changed: every EXISTING wall whose miter signature the batch altered. This is
      // the set that no per-candidate decomposition can reproduce (see the file header).
      const beforeSig = new Map<string, string>();
      for (const m of before.miters) beforeSig.set(m.id, miterSignature(m));
      for (const m of after.miters) {
        if (candidateIds.has(m.id)) continue;
        const prev = beforeSig.get(m.id);
        if (prev === undefined) continue; // not in the before-solve — cannot be a change
        if (miterSignature(m) !== prev) cornerChanged.push(m.id);
      }

      // §CREATE-BODY-CROSS, batch form. The resolver clusters ENDPOINTS and projects ENDPOINTS
      // onto bodies: a wall whose BODY crosses another's BODY is invisible to it (measured, on
      // the single-create row). So an empty junction result has two meanings that must not
      // print the same value — "touches nothing" and "drives THROUGH". The planner tests for
      // body-crossing itself, with the same pure predicate the room branch uses.
      //
      // A batch adds a SECOND crossing population the single row cannot have: candidate ×
      // candidate. Two walls in one generator batch can cross each other, and neither exists
      // for the other to be checked against anywhere else in the system.
      for (const c of levelCandidates) {
        const ca: Pt = { x: c.wall.baseLine[0].x, z: c.wall.baseLine[0].z };
        const cb: Pt = { x: c.wall.baseLine[1].x, z: c.wall.baseLine[1].z };
        for (const w of levelWalls) {
          if (!w.baseLine || !w.baseLine[0] || !w.baseLine[1]) continue;
          const qa: Pt = { x: w.baseLine[0].x, z: w.baseLine[0].z };
          const qb: Pt = { x: w.baseLine[1].x, z: w.baseLine[1].z };
          if (segmentsProperlyCross(ca, cb, qa, qb)) crossed.push(w.id);
        }
        for (const o of levelCandidates) {
          if (o.id === c.id || o.id.localeCompare(c.id) < 0) continue; // each pair once
          const qa: Pt = { x: o.wall.baseLine[0].x, z: o.wall.baseLine[0].z };
          const qb: Pt = { x: o.wall.baseLine[1].x, z: o.wall.baseLine[1].z };
          if (segmentsProperlyCross(ca, cb, qa, qb)) crossed.push(o.id);
        }
      }
    }

    // Crossed EXISTING walls are affected — the new walls pass through their solids — so they
    // are reported. Crossed CANDIDATES are already added; they contribute to the declaration
    // but never to `changed` as a modification.
    const crossedExisting = sortedUnique(crossed.filter((id) => !candidateIds.has(id)));
    const crossedCandidates = sortedUnique(crossed.filter((id) => candidateIds.has(id)));

    if (crossedExisting.length > 0 || crossedCandidates.length > 0) {
      const parts: string[] = [];
      if (crossedExisting.length > 0) {
        parts.push(`${crossedExisting.length} existing wall(s) (${crossedExisting.join(', ')})`);
      }
      if (crossedCandidates.length > 0) {
        parts.push(
          `${crossedCandidates.length} other member(s) of this same batch (${crossedCandidates.join(', ')})`,
        );
      }
      declared.push({
        scope: `junction geometry where walls created by this batch cross the BODY of ${parts.join(' and ')}`,
        reason: 'ENGINE_NOT_AVAILABLE',
        detail:
          `a centreline of this batch properly crosses ${parts.join(' and ')} away from their ` +
          'endpoints. No engine in this runtime resolves a body×body wall crossing: ' +
          'JunctionResolverV2 clusters ENDPOINTS and projects ENDPOINTS onto bodies, so it returns ' +
          'NO junction for an X crossing (measured). Whether these walls should be split at the ' +
          'intersection, mitred, or left overlapping is NOT determined — and this branch must not ' +
          "report the resolver's empty result as \"the new walls touch nothing\". The " +
          'batch-internal crossings are the case NO other check in the system can catch: neither ' +
          'wall exists yet, so no occupancy, join or clash pass has ever seen the pair.',
      });
    }

    return {
      membership: determined([...joined, ...cornerChanged, ...crossedExisting]),
      topologyModified: sortedUnique([...joined, ...cornerChanged, ...crossedExisting]),
      declared,
    };
  }

  /**
   * Hosted-opening refit for one candidate. A create carries no openings, so this is a
   * DETERMINED-EMPTY positive answer, not a blind spot; the seed is still invoked when
   * composed so the answer tracks the seed rather than asserting a remembered truth.
   */
  private openingBranch(candidate: WallData): OpeningRefitPlan {
    if (!this.deps.occupancy) return { ok: true, refusals: [], relocations: [] };
    try {
      return this.deps.occupancy.planOpeningRefit(candidate);
    } catch {
      return { ok: true, refusals: [], relocations: [] };
    }
  }

  /**
   * Which existing rooms does the BATCH partition?
   *
   * The single-create branch's rationale is unchanged and is not restated: answering "what
   * rooms exist after these walls are added" is ROOM DETECTION, and `RoomDetectionEngine` is
   * PROTECTED and is a mutating, level-wide, store-writing pass a planner may not run.
   *
   * The batch shape is a UNION, and a union is the one composition that IS sound here: a room
   * crossed by ANY candidate is declared UNDETERMINED, and adding more candidates can only add
   * rooms to that set. There is no cancellation, so no false DETERMINED-unaffected can arise —
   * which is exactly the property the JUNCTION branch lacks, and why that one had to be posed
   * whole while this one may be accumulated.
   *
   * A room set with no wall linkage at all is UNDETERMINED for the whole branch: without
   * membership there are no boundary segments to test, so the crossing question cannot be
   * posed (the overstatement-on-partial-data defect if answered as "nothing crosses").
   */
  private roomPartitionBranch(
    context: PlanningContext,
    candidates: readonly Candidate[],
  ): { membership: ImpactDetermination; perRoom: readonly UndeterminedImpact[] } {
    const roomView = context.getStore('room');
    if (!roomView) {
      return {
        membership: {
          kind: 'undetermined',
          scope: 'room-partition impact of this batch create',
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no room store view is available; whether the new walls subdivide an existing room ' +
            'cannot be read here',
        },
        perRoom: [],
      };
    }

    const wallView = context.getStore('wall');
    if (!wallView) {
      return {
        membership: {
          kind: 'undetermined',
          scope: 'room-partition impact of this batch create',
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no wall store view is available; room boundary segments cannot be resolved from ' +
            'declared membership, so the partition test cannot be posed',
        },
        perRoom: [],
      };
    }

    if (candidates.length === 0) {
      return {
        membership: {
          kind: 'undetermined',
          scope: 'room-partition impact of this batch create',
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no entry in this batch carries a baseLine, so no centreline can be tested against a ' +
            'room boundary',
        },
        perRoom: [],
      };
    }

    const wallById = new Map<string, WallData>();
    for (const w of wallView.getAll() as WallData[]) wallById.set(w.id, w);

    const rooms = roomView.getAll() as {
      id?: string;
      boundingWallIds?: unknown;
      boundaryWallIds?: unknown;
      wallIds?: unknown;
      sourceWallIds?: unknown;
    }[];

    let anyStructuralLink = false;
    const crossed: string[] = [];
    const perRoom: UndeterminedImpact[] = [];

    // Deterministic room order — the store's iteration order is not contractually stable.
    const ordered = rooms
      .filter((r) => typeof r.id === 'string')
      .slice()
      .sort((x, y) => String(x.id).localeCompare(String(y.id)));

    for (const room of ordered) {
      // `boundingWallIds` FIRST — it is the canonical persisted field (RoomDataSchema,
      // required). The other three are tolerated aliases carried by import/detection DTOs.
      const lists = [room.boundingWallIds, room.boundaryWallIds, room.wallIds, room.sourceWallIds];
      let ids: readonly string[] | null = null;
      for (const list of lists) {
        if (Array.isArray(list)) {
          anyStructuralLink = true;
          if (ids === null) ids = list as readonly string[];
        }
      }
      if (ids === null) continue;

      // Which MEMBERS of the batch cross this room — named individually, because "this room is
      // split" and "these three walls are what split it" are different facts and a generator
      // debugging a bad layout needs the second.
      const by: Candidate[] = [];
      for (const c of candidates) {
        const a: Pt = { x: c.wall.baseLine[0].x, z: c.wall.baseLine[0].z };
        const b: Pt = { x: c.wall.baseLine[1].x, z: c.wall.baseLine[1].z };
        for (const wid of ids) {
          const w = wallById.get(wid);
          if (!w || !w.baseLine || !w.baseLine[0] || !w.baseLine[1]) continue;
          const q: Pt = { x: w.baseLine[0].x, z: w.baseLine[0].z };
          const q2: Pt = { x: w.baseLine[1].x, z: w.baseLine[1].z };
          if (segmentsProperlyCross(a, b, q, q2)) {
            by.push(c);
            break;
          }
        }
      }
      if (by.length === 0) continue;

      const rid = String(room.id);
      crossed.push(rid);
      const names = by
        .map((c) => c.id)
        .sort()
        .join(', ');
      perRoom.push({
        scope: `the post-create identity, polygon and area of room ${rid}`,
        reason: 'NO_DEPENDENCY_INDEX',
        detail:
          `${by.length} wall(s) created by this batch (${names}) are driven THROUGH room ${rid} ` +
          '(their centrelines properly cross a boundary wall of that room), so the room is likely ' +
          'to be SPLIT. Only re-running room detection — a mutating, level-wide, store-writing pass ' +
          'a planner must not perform (RoomDetectionEngine, PROTECTED) — can resolve the resulting ' +
          'partition. The room is reported as affected; its resulting geometry, area and even its ' +
          'continued existence as a single room are NOT predicted. With several walls crossing at ' +
          'once the result is not even bounded to two rooms, which is the batch-specific part: a ' +
          'single create can split a room in two, a batch can shatter it.',
      });
    }

    if (!anyStructuralLink) {
      return {
        membership: {
          kind: 'undetermined',
          scope: 'room-partition impact of this batch create',
          reason: 'STALE_DERIVED_STATE',
          detail:
            'rooms carry no explicit wall linkage, so they expose no boundary segments; whether the ' +
            'new walls subdivide one cannot be tested. Boundary membership is derived by ' +
            'RoomTopologyObserver detection, which a structural wall add invalidates and which is ' +
            'suppressed on graph-authoritative levels (ADR-0069).',
        },
        perRoom: [],
      };
    }

    return { membership: determined(crossed), perRoom };
  }

  /**
   * The before/after violation diff for the batch ADD: clone stores → APPEND EVERY candidate
   * to the clone → validateAll before/after → diff.
   *
   * ONE diff, not N. Rules are evaluated over a WORLD, and constraint families are frequently
   * level-global (§5.5's five aggregate families) — a per-candidate diff would count a
   * level-wide violation once per member, or resolve it N−1 times over. The whole-batch diff
   * is the only one that yields the delta the execution will actually produce.
   *
   * Deliberately NO predicted room geometry is folded into the after-clone, exactly as on the
   * single-create row: there is no create-side room predictor, so the after-clone carries
   * rooms UNCHANGED and area-based rules evaluate identically on both sides. That is why
   * every crossed room gets its own UNDETERMINED entry above — an unpredicted room must never
   * read as "no violation".
   */
  private violationsBranch(
    context: PlanningContext,
    candidates: readonly Candidate[],
  ):
    | {
        kind: 'determined';
        validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
      }
    | {
        kind: 'undetermined';
        undetermined: UndeterminedImpact;
        validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
      } {
    const empty = {
      violationsCreated: [] as ViolationRef[],
      violationsResolved: [] as ViolationRef[],
    };
    if (!this.deps.validator) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `constraint validation of creating ${candidates.length} wall(s) in one batch`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no constraint validator is composed in this runtime; the violation delta of the batch ' +
            'cannot be computed',
        },
        validation: empty,
      };
    }

    // Snapshot the stores as PLAIN CLONES — no references to the live views (purity).
    const clone = (storeId: string): Record<string, unknown>[] => {
      const view = context.getStore(storeId);
      if (!view) return [];
      return view.getAll().map((item) => ({ ...(item as Record<string, unknown>) }));
    };
    const beforeWalls = clone('wall');
    // The ADD, applied to the CLONE only. An entry REPLACING an existing id replaces it in the
    // clone too — the same last-write-wins the handler's `draft[w.id] = w` performs — so the
    // after-world is the world execute will actually produce, not a world with both.
    const afterById = new Map<string, Record<string, unknown>>();
    for (const w of beforeWalls) afterById.set(String(w.id), w);
    for (const c of candidates) {
      afterById.set(c.id, { ...(c.wall as unknown as Record<string, unknown>) });
    }
    const afterWalls = [...afterById.values()];

    const rooms = clone('room');
    const doors = clone('door');
    const windows = clone('window');
    const stairs = clone('stair');

    const makeStore = (items: Record<string, unknown>[]) => ({
      getAll: () => items,
      getById: (eid: string) => items.find((i) => i.id === eid) ?? null,
      filter: (fn: (x: unknown) => boolean) => items.filter(fn),
    });

    const baseCtx = {
      roomStore: makeStore(rooms),
      doorStore: makeStore(doors),
      windowStore: makeStore(windows),
      stairStore: makeStore(stairs),
      bimManager: undefined,
    };
    const beforeCtx = {
      ...baseCtx,
      wallStore: makeStore(beforeWalls),
    } as unknown as ConstraintContext;
    const afterCtx = {
      ...baseCtx,
      wallStore: makeStore(afterWalls),
    } as unknown as ConstraintContext;

    let beforeResults: ValidationResult[] = [];
    let afterResults: ValidationResult[] = [];
    try {
      beforeResults = this.deps.validator.validateAll(beforeCtx);
      afterResults = this.deps.validator.validateAll(afterCtx);
    } catch {
      // A validator that threw is not an empty delta — it is a read that could not run.
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `constraint validation of creating ${candidates.length} wall(s) in one batch`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the constraint validator threw while diffing the batch create',
        },
        validation: empty,
      };
    }

    const key = (r: ValidationResult): string => `${r.ruleId}:${r.elementId}`;
    const beforeKeys = new Set(beforeResults.map(key));
    const afterKeys = new Set(afterResults.map(key));
    const toRef = (r: ValidationResult): ViolationRef => ({
      ruleId: r.ruleId,
      elementId: r.elementId,
      message: r.message,
    });
    const byKey = (x: ViolationRef, y: ViolationRef): number =>
      `${x.ruleId}:${x.elementId}`.localeCompare(`${y.ruleId}:${y.elementId}`);

    const violationsCreated = afterResults
      .filter((r) => !beforeKeys.has(key(r)))
      .map(toRef)
      .sort(byKey);
    const violationsResolved = beforeResults
      .filter((r) => !afterKeys.has(key(r)))
      .map(toRef)
      .sort(byKey);
    return { kind: 'determined', validation: { violationsCreated, violationsResolved } };
  }

  /**
   * Regeneration is a declared blind spot, for the single-create planner's reasons verbatim:
   * `DependencyResolver.getAffected` EXISTS and would appear to answer, and using it would be
   * wrong twice over — its non-delete branch returns `determined` unconditionally (so for
   * walls that do not exist yet it reports a confident EMPTY set, failure-as-emptiness), and
   * it WRITES `_captured` on every query, which a planner may not do (ADR-0322 §2).
   */
  private regenerationUndetermined(count: number): UndeterminedImpact {
    return {
      scope: `regeneration of elements dependent on the ${count} wall(s) created by this batch`,
      reason: 'NO_DEPENDENCY_INDEX',
      detail:
        'the dependency index (roadmap Phase 5) that would resolve regeneration impact is not wired ' +
        'for creates. DependencyResolver.getAffected is NOT consulted: its non-delete branch returns ' +
        'a DETERMINED result unconditionally, so for walls that do not exist yet it would report a ' +
        'confident EMPTY set (failure-as-emptiness, ADR-0322 §5), and it mutates its own capture map ' +
        'on every query, which a planner may not do (ADR-0322 §2).',
    };
  }

  // ── Assembly + hashing ───────────────────────────────────────────────────────────────

  private assemble(input: {
    command: WallBatchCreateCommand;
    stateHash: string;
    direct: ImpactDetermination;
    indirect: ImpactDetermination;
    changed: string[];
    excluded: string[];
    topologyAdded: string[];
    topologyModified: string[];
    refused: ConsequenceRefusal[];
    undetermined: UndeterminedImpact[];
    validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
  }): ConsequencePlan {
    const changed = sortedUnique(input.changed);
    // An element that CHANGES is never also "considered unchanged".
    const changedSet = new Set(changed);
    const excluded = sortedUnique(input.excluded.filter((e) => !changedSet.has(e)));
    const topologyAdded = sortedUnique(input.topologyAdded);
    // A newcomer is ADDED, never also MODIFIED — the two arms must not both claim it. This
    // matters more here than on the single row: an entry whose id REPLACES an existing wall is
    // legitimately both "the wall that arrives" and "the wall that changes", and without this
    // filter it would appear in both arms of one plan.
    const addedSet = new Set(topologyAdded);
    const topologyModified = sortedUnique(input.topologyModified.filter((t) => !addedSet.has(t)));

    const body = {
      command: { type: input.command.type, payload: input.command.payload },
      direct: input.direct,
      indirect: input.indirect,
      changed,
      excluded,
      topology: { added: topologyAdded, removed: [] as ElementId[], modified: topologyModified },
      validation: input.validation,
      regeneration: {
        required: [] as ElementId[],
        skipped: [] as { id: ElementId; reason: string }[],
      },
      refused: input.refused,
      undetermined: input.undetermined,
    };

    const planHash = fnv1a(stableStringify({ ...body, stateHash: input.stateHash }));
    // Deterministic planId — derived from content so two plans over the same state are
    // byte-identical (G-REASON-02). A random id would be the only differing byte.
    const planId = `plan-wall.batch.create-${planHash}`;

    return {
      planId,
      planHash,
      stateHash: input.stateHash,
      ...body,
    };
  }
}
