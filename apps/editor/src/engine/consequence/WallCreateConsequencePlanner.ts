// WallCreateConsequencePlanner — Phase 6c of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md.
//
// The SECOND row of the golden-operation matrix. The matrix (plan doc, "The golden-operation
// matrix", the table under `| Operation | Planner | Preview | Confirm | Execute | Report |
// AI parity |`) lists the backlog IN ORDER:
//
//     | **wall.move**        | R2 | R3 | R6 | R4 | R5 | R7 |
//     | wall.create          | —  | —  | —  | —  | —  | —  |     ← THIS FILE
//     | opening.move         | —  | —  | —  | —  | —  | —  |
//     | room.regenerate      | —  | —  | —  | —  | —  | —  |
//     | furniture.generate   | —  | —  | —  | —  | —  | —  |
//
// `wall.create` is the row immediately after `wall.move`, so it is the operation this phase
// takes. (It is neither a wall DELETE nor a hosted-element move; those are not rows of this
// matrix at all. The order is the doc's, not the author's.)
//
// ── WHAT MAKES CREATE A DIFFERENT SHAPE OF QUESTION FROM MOVE ────────────────────────
// `wall.move` reasons about an element that EXISTS: every index keyed by its id can be asked.
// `wall.create` reasons about an element that does NOT yet exist, and that asymmetry
// invalidates three of the move planner's four collaborators outright. Each is handled by
// substituting a PURE, PROPOSED-WORLD computation, or by declaring the blind spot:
//
//   • the joinedTo index (`SemanticGraphManager.getJoinedWalls`) is populated only by a
//     FLUSH, so for an unminted id it returns `{ok:false,'wall-unknown-to-joinedTo-writer'}`
//     — an honest refusal, but a USELESS one: it refuses for every create, forever, so it
//     would make the junction branch a permanent blind spot rather than a prediction. It is
//     therefore NOT used here. Instead the branch runs the PURE resolver
//     (`resolveJunctionsWithRecords`, @pryzm/geometry-wall) over the level's walls TWICE —
//     without and with the candidate appended — and DIFFS. That is a real answer for a wall
//     that does not exist yet, and it is the same solve that will actually build the
//     geometry, so the prediction cannot drift from the production mitre.
//   • `predictRoomGeometry` (the Phase 6b move predictor) is structurally unable to answer
//     for a create: it iterates rooms and `continue`s past any room whose `boundingWallIds`
//     does not already include the subject wall (predictRoomGeometry.ts, the
//     `if (!ids.includes(move.wallId)) continue;` line). A brand-new wall is in NO room's
//     membership, so it would return a DETERMINED-EMPTY room set for every create — the
//     failure-as-emptiness defect ADR-0322 §5 exists to forbid, arriving from the very
//     function built to prevent it. It is deliberately NOT a dependency of this planner.
//   • `DependencyResolver.getAffected(id,'create')` is not called, for TWO independent
//     reasons, both from source (DependencyResolver.ts): (a) its `operation !== 'delete'`
//     branch returns `{status:'determined',tasks}` UNCONDITIONALLY, so for an unminted id it
//     yields a confident empty answer about an element with no graph edges — again
//     failure-as-emptiness; and (b) it WRITES (`this._captured.set(elementId, tasks)`) on
//     every non-delete query, which a planner may not do (ADR-0322 §2, and
//     `check-preview-purity` is the gate). Regeneration therefore stays a declared blind
//     spot, exactly as in the move planner, and the reason is recorded rather than guessed.
//
// ── WHY THIS FILE LIVES IN apps/editor/src/engine (the composition layer) ────────────
// Identical to WallMoveConsequencePlanner.ts's reason, restated so it is not inferred: the
// consequence CONTRACT is `@pryzm/command-bus` (L1) so anything may implement it, but this
// PLANNER must reach `@pryzm/geometry-wall` (L2, the junction resolver + occupancy seed) and
// `@pryzm/constraint-solver` (L2, the violation core). A planner in command-bus (L1)
// importing those would be an UPWARD import — the exact violation
// `tools/ga-gate/check-layer-boundaries.ts` exits 3 on. apps/editor is L7 (the top), so every
// edge is DOWNWARD and this placement adds zero layer violations. Every heavyweight
// collaborator is INJECTED, and every package import in this file is `import type` (erased at
// runtime), so the planner constructs and runs with no deps at all, in a plain node env, with
// no `window.*` and no singletons at import.
//
// ── THE INVARIANT THIS FILE MUST PROVE (ADR-0322 §2, restated) ───────────────────────
// A `ConsequencePlanner` MUST NOT mutate authoritative state. Every read is over the
// caller-supplied read-only `PlanningContext` views or over CLONES; the candidate wall is a
// FRESH object appended to a COPY of the wall list, never inserted into the live one.
// G-REASON-01 (purity) and G-REASON-02 (determinism) are the gates; see
// apps/editor/__tests__/WallCreateConsequencePlanner.test.ts.

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
  ResolveOptions,
} from '@pryzm/geometry-wall';
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';

// The ONE stable serialisation, shared with the move planner so both planners hash with the
// same algorithm and the execution service's read-back fingerprint means the same thing on
// both rows of the matrix (ADR-0322 §6's one-algorithm rule applied to hashing).
import { stableStringify } from './WallMoveConsequencePlanner.js';

// ─── The command this planner answers for ────────────────────────────────────────────

/**
 * `wall.create` as a SEMANTIC operation — bring a wall into existence on `levelId` with the
 * given centreline. The fields mirror `CreateWallPayload` (plugins/wall/src/handlers/
 * CreateWall.ts), narrowed to what a consequence question actually depends on.
 *
 * `id` is OPTIONAL because the live handler mints a ULID when the caller omits one
 * (`cmd.id ?? createId('wall')`). A planner cannot mint an id — minting is a side effect with
 * a random source, which would break determinism (G-REASON-02) — so when `id` is absent the
 * planner reasons about the wall under a STABLE PLACEHOLDER id derived from the payload, and
 * says so. The consequence question ("what does adding THIS geometry do to the level?") does
 * not depend on the identity of the newcomer; only the newcomer's own name in `direct` does.
 */
export interface WallCreateCommand {
  readonly type: 'wall.create';
  readonly payload: {
    /** Absent ⇒ the live handler mints one; the plan uses a deterministic placeholder. */
    readonly id?: string;
    readonly levelId?: string;
    readonly baseLine?: WallBaseline;
    readonly thickness?: number;
    readonly height?: number;
    readonly systemTypeId?: string;
    /** Present ⇒ curved. The junction resolver is chord-based without tangents; see below. */
    readonly curve?: unknown;
  };
}

// ─── Injected collaborators (the substrate, supplied by the composition root) ─────────

/**
 * The PURE junction solve — `resolveJunctionsWithRecords` from `@pryzm/geometry-wall`.
 *
 * This is the create-side substitute for the move planner's `JoinedWallsReader`. It is a pure
 * function of a wall list (no stores, no window, no clock; the only ambient read is the
 * `globalThis.__pryzmWallV2JunctionBandM` diagnostic escape hatch, which is undefined in
 * production and in tests). Running it over `existing` and over `existing + candidate` and
 * diffing is what lets this planner answer "which walls will the new wall join?" for a wall
 * that has no id in any index yet.
 */
export type JunctionResolver = (
  walls: readonly WallInput[],
  opts?: ResolveOptions,
) => { miters: WallMiter[]; junctions: WallJunctionRecord[] };

/** The opening-refit seed — `WallOccupancyStore.planOpeningRefit`, wrapped, never rewritten. */
export interface OpeningRefitReader {
  planOpeningRefit(candidate: WallData): OpeningRefitPlan;
}

/** The mined violation core — `constraintEngine.validateAll` (clone → add → diff). */
export interface ViolationValidator {
  validateAll(ctx: ConstraintContext): ValidationResult[];
}

/**
 * Everything the planner needs beyond the read-only `PlanningContext`. ALL OPTIONAL: an
 * ABSENT collaborator is the honest `ENGINE_NOT_AVAILABLE` case, declared as `undetermined`,
 * NOT silently skipped. The planner constructs and runs with `{}`.
 */
export interface WallCreatePlannerDeps {
  readonly resolveJunctions?: JunctionResolver;
  readonly occupancy?: OpeningRefitReader;
  readonly validator?: ViolationValidator;
}

// ─── Deterministic hashing (G-REASON-02) ──────────────────────────────────────────────

/** FNV-1a 32-bit → 8-hex-char string. Deterministic, dependency-free. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Unique + sorted — the ONLY way element sets enter the plan, so ordering is stable. */
function sortedUnique(ids: readonly string[]): ElementId[] {
  return Array.from(new Set(ids)).sort();
}

const determined = (elements: readonly string[]): ImpactDetermination => ({
  kind: 'determined',
  elements: sortedUnique(elements),
});

// ─── Geometry helpers (pure, local, no epsilon of their own beyond the stated ones) ───

interface Pt {
  readonly x: number;
  readonly z: number;
}

/**
 * Do segments p→p2 and q→q2 PROPERLY cross (a true interior intersection)?
 *
 * Strict sign change on BOTH cross-product pairs, so a segment that merely TOUCHES another at
 * an endpoint — which is what a wall that BOUNDS a room does — is NOT a crossing; only a wall
 * driven THROUGH the interior is. This is the same predicate, and the same rationale, as the
 * private `segmentsProperlyCross` inside `@pryzm/room-topology/predictRoomGeometry.ts`.
 *
 * It is RESTATED here rather than imported because that symbol is module-private and
 * `packages/room-topology/` is outside this phase's territory — exporting it would be an edit
 * to another owner's package. The duplication is 6 lines of sign comparison with no tuning
 * constants; if room-topology later exports it, this should be deleted in favour of the
 * import. Recorded so the duplication is a known, closeable debt rather than a silent fork.
 */
function segmentsProperlyCross(p: Pt, p2: Pt, q: Pt, q2: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt): number => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const E = 1e-9;
  const d1 = d(p, p2, q);
  const d2 = d(p, p2, q2);
  const d3 = d(q, q2, p);
  const d4 = d(q, q2, p2);
  return (
    ((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E))
  );
}

/** Signature of one wall's miter — the comparable fingerprint for "did this corner change?". */
function miterSignature(m: WallMiter | undefined): string {
  if (!m) return 'none';
  return stableStringify({
    startLeft: m.startLeft ?? null,
    startRight: m.startRight ?? null,
    endLeft: m.endLeft ?? null,
    endRight: m.endRight ?? null,
    startPivot: m.startPivot ?? null,
    endPivot: m.endPivot ?? null,
    invalid: m.invalid ?? false,
  });
}

// ─── The planner ──────────────────────────────────────────────────────────────────────

export class WallCreateConsequencePlanner implements ConsequencePlanner<WallCreateCommand> {
  constructor(private readonly deps: WallCreatePlannerDeps = {}) {}

  async plan(command: WallCreateCommand, context: PlanningContext): Promise<ConsequencePlan> {
    const payload = command.payload;
    const baseLine = payload.baseLine;

    // The newcomer's name. When the caller omitted an id the live handler mints a ULID
    // (`createId('wall')`) — a RANDOM source a planner must not touch (G-REASON-02). So the
    // plan names the wall by a placeholder DERIVED from the payload: stable across two
    // planning runs over the same command, and visibly not a real id.
    const id = payload.id ?? `wall-pending-${fnv1a(stableStringify(payload))}`;
    const idIsPlaceholder = payload.id === undefined;

    const wallView = context.getStore('wall');
    const allWalls = wallView ? ([...wallView.getAll()] as WallData[]) : [];

    // State hash — over exactly the authoritative state the plan is computed from, so a stale
    // approval (R6) is detectable. Deterministic (stableStringify) by construction.
    const stateHash = fnv1a(stableStringify({ create: payload, walls: allWalls }));

    const undetermined: UndeterminedImpact[] = [];
    const refused: ConsequenceRefusal[] = [];
    const changed: string[] = [];
    const excluded: string[] = [];
    const topologyModified: string[] = [];

    // The wall being created is itself the one ADDED element — the create counterpart of the
    // move planner's "the moved wall always changes". `topology.added` is where a newcomer
    // belongs; `changed` carries it too, because a consumer diffing predicted-vs-actual reads
    // `changed` (ConsequencePlan.changed is the executor's comparison set).
    const topologyAdded: string[] = [id];
    changed.push(id);

    if (idIsPlaceholder) {
      undetermined.push({
        scope: `the identity of the wall created by this command`,
        reason: 'STALE_DERIVED_STATE',
        detail:
          'the payload carries no id, so the live handler will mint a fresh ULID at execute time ' +
          `(CreateWall.ts: cmd.id ?? createId('wall')). The plan names the newcomer by the stable ` +
          `placeholder ${id}; its REAL id is unknowable before execution, so predicted-vs-actual ` +
          'must not score the newcomer\'s identity as a divergence.',
      });
    }

    // Guard: a create with no geometry. `Wall.parse({})` is a valid wall (schema defaults), so
    // this is not a refusal — but every branch below reasons about a centreline, and there is
    // none to reason about. Declare it rather than computing over a default nobody supplied.
    if (!baseLine || baseLine.length < 2 || !baseLine[0] || !baseLine[1]) {
      undetermined.push({
        scope: `junction / room-partition / clash impact of the new wall ${id}`,
        reason: 'STALE_DERIVED_STATE',
        detail:
          'the payload carries no explicit baseLine; the handler will apply the Wall schema default, ' +
          'which is not knowable to this planner without duplicating the schema. No geometric branch ' +
          'can be evaluated against a centreline that has not been supplied.',
      });
      undetermined.push(this.regenerationUndetermined(id));
      return this.assemble({
        command,
        stateHash,
        direct: determined([id]),
        indirect: {
          kind: 'undetermined',
          scope: `indirect impact of creating wall ${id}`,
          reason: 'STALE_DERIVED_STATE',
          detail: 'no baseLine supplied',
        },
        changed,
        excluded,
        topologyAdded,
        topologyModified,
        refused,
        undetermined,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    }

    // The candidate — the wall AS IT WOULD BE. A FRESH object; nothing live is touched.
    const candidate: WallData = {
      id,
      type: 'wall',
      levelId: payload.levelId ?? '',
      baseLine,
      height: payload.height ?? 0,
      thickness: payload.thickness ?? 0,
      openings: [],
      ...(payload.systemTypeId !== undefined ? { systemTypeId: payload.systemTypeId } : {}),
      ...(payload.curve !== undefined ? { curve: payload.curve } : {}),
    } as unknown as WallData;

    // ── Branch 1: junction (the PURE before/after resolver diff) ─────────────────────
    const junction = this.junctionBranch(allWalls, candidate);
    if (junction.membership.kind === 'determined') {
      for (const wid of junction.membership.elements) changed.push(wid);
      for (const wid of junction.topologyModified) topologyModified.push(wid);
    } else {
      undetermined.push(junction.membership);
    }
    if (junction.curveUndetermined) undetermined.push(junction.curveUndetermined);
    // §CREATE-BODY-CROSS — the resolver cannot see a body×body crossing, so an empty junction
    // result there is a blind spot, not an answer. See the branch for the measurement.
    if (junction.crossingUndetermined) undetermined.push(junction.crossingUndetermined);

    // ── Branch 2: opening-refit (a DETERMINED-EMPTY positive answer, not a blind spot) ─
    // A newly created wall has no openings — `CreateWallPayload` has no `openings` field and
    // the handler never writes one. `planOpeningRefit` short-circuits on an empty opening set
    // (`if (openings.length === 0) return {ok:true,refusals:[],relocations:[]}`). So this
    // branch is TRIVIALLY DETERMINED, and it is stated as such rather than declared a blind
    // spot: "there are no hosted openings to refit" is a real, positive answer. The seed is
    // still CALLED when composed, so if that invariant ever changes the planner tracks it
    // instead of asserting a stale truth.
    const refit = this.openingBranch(candidate);
    for (const r of refit.relocations) {
      const eid = r.opening.elementId ?? r.opening.id;
      changed.push(eid);
    }
    for (const ref of refit.refusals) {
      refused.push({ elementId: ref.elementId ?? ref.openingId, reason: ref.reason });
    }

    // ── Branch 3: room partition (the create-specific question move cannot ask) ──────
    const rooms = this.roomPartitionBranch(context, id, candidate.levelId, baseLine);
    if (rooms.membership.kind === 'determined') {
      for (const rid of rooms.membership.elements) changed.push(rid);
    } else {
      undetermined.push(rooms.membership);
    }
    for (const u of rooms.perRoom) undetermined.push(u);

    // ── Branch 4: wall-vs-wall clash (a DECLARED blind spot — no substrate exists) ───
    undetermined.push({
      scope: `solid clash between the new wall ${id} and existing walls on level ${candidate.levelId}`,
      reason: 'ENGINE_NOT_AVAILABLE',
      detail:
        'no wall-vs-wall footprint collision check is reachable. WallOccupancyStore.canPlace answers ' +
        'wall↔OPENING overlap only, and the nearest wall↔wall facility ' +
        '(WallJoinResolver §FIX-WALL-FACE-TRIM-NO-CLASH) is DEFAULT-OFF behind the ' +
        '`globalThis.__pryzmWallFaceTrimNoClash` flag and carries a documented open design gap ' +
        '(no priority rule; it destroys committed mitres). Whether the new wall overlaps the solid ' +
        'of an existing one is therefore NOT checked — not "checked and clear".',
    });

    // ── Branch 5: violations (the mined SpeculativeEngine core, add-shaped) ──────────
    const violation = this.violationsBranch(context, candidate);
    if (violation.kind === 'undetermined') undetermined.push(violation.undetermined);

    // ── Branch 6: regeneration (declared blind spot; see the header for WHY not getAffected)
    undetermined.push(this.regenerationUndetermined(id));

    // ── indirect impact ──────────────────────────────────────────────────────────────
    // Everything reached NOT via the payload's own subject. If any indirect branch is
    // undetermined the indirect reach is incomplete, so `indirect` is undetermined (honest)
    // rather than a partial determined set — the move planner's rule, unchanged.
    const indirect: ImpactDetermination =
      junction.membership.kind === 'undetermined'
        ? {
            kind: 'undetermined',
            scope: `indirect impact (junction + room-partition) of creating wall ${id}`,
            reason: junction.membership.reason,
            detail: junction.membership.detail,
          }
        : rooms.membership.kind === 'undetermined'
          ? {
              kind: 'undetermined',
              scope: `indirect impact (junction + room-partition) of creating wall ${id}`,
              reason: rooms.membership.reason,
              detail: rooms.membership.detail,
            }
          : determined([...junction.membership.elements, ...rooms.membership.elements]);

    return this.assemble({
      command,
      stateHash,
      direct: determined([id]),
      indirect,
      changed,
      excluded,
      topologyAdded,
      topologyModified,
      refused,
      undetermined,
      validation: violation.validation,
    });
  }

  // ── Branch helpers ─────────────────────────────────────────────────────────────────

  /**
   * Which EXISTING walls will the newcomer join, and whose corners will change?
   *
   * The move planner reads a RETAINED index keyed by an existing wall id. That is impossible
   * here (see the header), so this branch computes the answer from the geometry itself:
   *
   *   before = resolveJunctionsWithRecords(levelWalls)
   *   after  = resolveJunctionsWithRecords(levelWalls + candidate)
   *
   *   joined-with        = every distinct wall sharing a junction record with the candidate
   *   topology-modified  = every existing wall whose MITER SIGNATURE differs between the two
   *
   * The second set is strictly the more useful one and it is not available from the joinedTo
   * index at all: a wall can have its corner re-cut by a newcomer arriving at a junction it
   * already participated in. Diffing the solve that will ACTUALLY build the geometry is what
   * makes the prediction non-drifting.
   *
   * Both sets are DETERMINED — including empty ("the new wall touches nothing", a real
   * answer). Absent resolver ⇒ `ENGINE_NOT_AVAILABLE`, never an empty claim.
   */
  private junctionBranch(
    allWalls: readonly WallData[],
    candidate: WallData,
  ): {
    membership: ImpactDetermination;
    topologyModified: readonly string[];
    curveUndetermined?: UndeterminedImpact;
    crossingUndetermined?: UndeterminedImpact;
  } {
    if (!this.deps.resolveJunctions) {
      return {
        membership: {
          kind: 'undetermined',
          scope: `junction impact of the new wall ${candidate.id}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no junction resolver is composed in this runtime; which existing walls the new wall ' +
            'joins, and whose corners it re-cuts, cannot be predicted',
        },
        topologyModified: [],
      };
    }

    // Level scope. A wall only ever joins walls on its OWN level — the resolver is documented
    // as "all junctions for a set of walls on ONE level", so feeding it a cross-level set
    // would fabricate junctions between walls at different elevations.
    const levelWalls = allWalls.filter(
      (w) => w.levelId === candidate.levelId && w.id !== candidate.id,
    );

    // A curved newcomer: the resolver derives heading from the CHORD unless per-endpoint
    // tangents are supplied, and `curve → tangent` derivation lives in WallPipelineV2, not
    // here. Predicting an arc's mitre from its chord is the §FIX-WALL-ARC-LINEAR-MITRE defect
    // by construction, so the branch still answers WHICH walls are touched (cluster proximity
    // is chord-endpoint based and correct) but declares the CORNER GEOMETRY unpredicted.
    const curveUndetermined: UndeterminedImpact | undefined = candidate.curve
      ? {
          scope: `mitre geometry at the junctions of the new CURVED wall ${candidate.id}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'the new wall carries a curve descriptor, but the per-endpoint TANGENTS the resolver ' +
            'needs (WallInput.startDir/endDir) are derived by WallPipelineV2 from the Bézier control ' +
            'point and are not available to this planner. The resolver would fall back to the CHORD ' +
            'heading, which is the §FIX-WALL-ARC-LINEAR-MITRE defect (chord and tangent differ by up ' +
            'to tens of degrees). Which walls are touched is still reported; the resulting corner ' +
            'geometry is NOT predicted.',
        }
      : undefined;

    const toInput = (w: WallData): WallInput => ({
      id: w.id,
      start: { x: w.baseLine[0].x, z: w.baseLine[0].z },
      end: { x: w.baseLine[1].x, z: w.baseLine[1].z },
      thickness: typeof w.thickness === 'number' ? w.thickness : 0,
      ...(w.systemTypeId !== undefined ? { systemTypeId: w.systemTypeId } : {}),
    });

    // Stable ordering: the resolver's clustering is documented as input-order dependent, so
    // the input MUST be ordered deterministically or the plan is not reproducible. Sort by id
    // and append the candidate LAST (a fixed position), so two runs feed byte-identical input.
    const beforeInputs = levelWalls
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(toInput);
    const afterInputs = [...beforeInputs, toInput(candidate)];

    let before: { miters: WallMiter[]; junctions: WallJunctionRecord[] };
    let after: { miters: WallMiter[]; junctions: WallJunctionRecord[] };
    try {
      before = this.deps.resolveJunctions(beforeInputs);
      after = this.deps.resolveJunctions(afterInputs);
    } catch {
      // A resolver that threw is not "joins nothing" — it is a solve that could not run.
      return {
        membership: {
          kind: 'undetermined',
          scope: `junction impact of the new wall ${candidate.id}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the junction resolver threw while solving the proposed level',
        },
        topologyModified: [],
        ...(curveUndetermined ? { curveUndetermined } : {}),
      };
    }

    // Joined-with: every OTHER wall sharing a junction record with the candidate.
    const joined: string[] = [];
    for (const rec of after.junctions) {
      if (!rec.wallIds.includes(candidate.id)) continue;
      for (const wid of rec.wallIds) if (wid !== candidate.id) joined.push(wid);
    }

    // Corner-changed: every existing wall whose miter signature the newcomer altered.
    const beforeSig = new Map<string, string>();
    for (const m of before.miters) beforeSig.set(m.id, miterSignature(m));
    const cornerChanged: string[] = [];
    for (const m of after.miters) {
      if (m.id === candidate.id) continue;
      const prev = beforeSig.get(m.id);
      if (prev === undefined) continue; // not in the before-solve — cannot be a change
      if (miterSignature(m) !== prev) cornerChanged.push(m.id);
    }

    // ── §CREATE-BODY-CROSS — the resolver's REACH, and why `[]` cannot be trusted here ──
    //
    // MEASURED (probe, `resolveJunctionsWithRecords` called directly):
    //
    //   two walls crossing body×body at a perfect X   →  junctions: []      ← NO detection
    //   one wall's ENDPOINT landing on another's body →  junctions: [T]     ← detected
    //   a partition with endpoints ON the room walls  →  junctions: [T, T]  ← detected
    //   the same partition OVERSHOOTING past them     →  junctions: []      ← NO detection
    //
    // The resolver clusters ENDPOINTS and projects ENDPOINTS onto bodies. A wall whose BODY
    // crosses another wall's BODY is invisible to it. That is correct for its own purpose —
    // it computes MITRES, and two walls crossing in an X have no mitre to cut — but it means
    // an empty junction result has TWO possible meanings that must not print the same value:
    //
    //   (a) "the new wall genuinely touches nothing"      — a real, determined answer
    //   (b) "the new wall drives THROUGH existing walls"   — a real interaction the resolver
    //                                                        structurally cannot see
    //
    // Reporting (b) as `determined([])` is the failure-as-emptiness defect (ADR-0322 §5), and
    // it is worse than usual here because it makes ONE PLAN CONTRADICT ITSELF: the room branch
    // reports the wall splitting a room while the junction branch reports it touching nothing.
    //
    // So the planner tests for body-crossing ITSELF — the same pure predicate the room branch
    // uses, which needs no engine — and where a crossing exists, DECLARES the blind spot
    // instead of claiming emptiness. The RESOLVER IS NOT MODIFIED: widening its endpoint
    // clustering to body-crossing would change what corners the whole product mitres, which is
    // a geometry change with its own blast radius and is not this phase's territory. The
    // limitation is NAMED, not patched.
    const crossed: string[] = [];
    const ca: Pt = { x: candidate.baseLine[0].x, z: candidate.baseLine[0].z };
    const cb: Pt = { x: candidate.baseLine[1].x, z: candidate.baseLine[1].z };
    for (const w of levelWalls) {
      if (!w.baseLine || !w.baseLine[0] || !w.baseLine[1]) continue;
      const qa: Pt = { x: w.baseLine[0].x, z: w.baseLine[0].z };
      const qb: Pt = { x: w.baseLine[1].x, z: w.baseLine[1].z };
      if (segmentsProperlyCross(ca, cb, qa, qb)) crossed.push(w.id);
    }

    if (crossed.length > 0) {
      const ids = sortedUnique(crossed);
      return {
        // The crossed walls ARE affected — the new wall passes through their solids — so they
        // are reported, not omitted. What cannot be stated is the resulting corner geometry.
        membership: determined([...joined, ...cornerChanged, ...ids]),
        topologyModified: sortedUnique([...joined, ...cornerChanged, ...ids]),
        ...(curveUndetermined ? { curveUndetermined } : {}),
        crossingUndetermined: {
          scope: `junction geometry where the new wall ${candidate.id} crosses the BODY of ${ids.join(', ')}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            `the new wall's centreline properly crosses the centreline of ${ids.length} existing ` +
            `wall(s) (${ids.join(', ')}) away from their endpoints. No engine in this runtime resolves ` +
            'a body×body wall crossing: JunctionResolverV2 clusters ENDPOINTS and projects ENDPOINTS ' +
            'onto bodies, so it returns NO junction for an X crossing (measured). Whether these walls ' +
            'should be split at the intersection, mitred, or left overlapping is therefore NOT ' +
            'determined — and this branch must not report the resolver\'s empty result as ' +
            '"the new wall touches nothing".',
        },
      };
    }

    return {
      membership: determined([...joined, ...cornerChanged]),
      topologyModified: sortedUnique([...joined, ...cornerChanged]),
      ...(curveUndetermined ? { curveUndetermined } : {}),
    };
  }

  /**
   * Hosted-opening refit for the newcomer. See the call site: this is a DETERMINED-EMPTY
   * positive answer for a create, and the seed is still invoked when composed so the answer
   * tracks the seed rather than asserting a remembered truth. With no seed composed the
   * answer is the same trivially-empty plan — NOT a blind spot — because a newly created
   * wall provably carries no openings (there is no payload field that could add one).
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
   * Which existing rooms does the new wall PARTITION?
   *
   * This is the branch with no reusable machinery, and the reason is structural rather than
   * incidental: answering "what rooms exist after this wall is added" is ROOM DETECTION, and
   * `RoomDetectionEngine` is both PROTECTED (docs/04-reference/BIM30-DO-NOT-REBUILD.md) and a
   * MUTATING, level-wide, store-writing pass a planner may not run (ADR-0322 §2).
   * `predictRoomGeometry` cannot substitute for it (see the file header).
   *
   * So this branch does the ONE thing it can do honestly: it detects the CONDITION under
   * which the answer is unknowable, and names the specific rooms it is unknowable for. A new
   * wall whose centreline properly crosses a boundary segment of room R is being driven
   * THROUGH R — R is very likely about to become two rooms, and only re-detection can say. R
   * is declared UNDETERMINED individually, so it can never read as "no change to R".
   *
   * A wall that crosses nothing is DETERMINED to partition no room — a real, positive answer.
   * A room set with no wall linkage at all is UNDETERMINED for the whole branch: without
   * membership there are no boundary segments to test, so the crossing question cannot even
   * be posed (the overstatement-on-partial-data defect if answered as "nothing crosses").
   */
  private roomPartitionBranch(
    context: PlanningContext,
    wallId: string,
    levelId: string,
    baseLine: WallBaseline,
  ): { membership: ImpactDetermination; perRoom: readonly UndeterminedImpact[] } {
    const roomView = context.getStore('room');
    if (!roomView) {
      return {
        membership: {
          kind: 'undetermined',
          scope: `room-partition impact of the new wall ${wallId} on level ${levelId}`,
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no room store view is available; whether the new wall subdivides an existing room ' +
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
          scope: `room-partition impact of the new wall ${wallId} on level ${levelId}`,
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no wall store view is available; room boundary segments cannot be resolved from ' +
            'declared membership, so the partition test cannot be posed',
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

    const a: Pt = { x: baseLine[0].x, z: baseLine[0].z };
    const b: Pt = { x: baseLine[1].x, z: baseLine[1].z };

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

      let crosses = false;
      for (const wid of ids) {
        const w = wallById.get(wid);
        if (!w || !w.baseLine || !w.baseLine[0] || !w.baseLine[1]) continue;
        const q: Pt = { x: w.baseLine[0].x, z: w.baseLine[0].z };
        const q2: Pt = { x: w.baseLine[1].x, z: w.baseLine[1].z };
        if (segmentsProperlyCross(a, b, q, q2)) {
          crosses = true;
          break;
        }
      }
      if (!crosses) continue;

      const rid = String(room.id);
      crossed.push(rid);
      perRoom.push({
        scope: `the post-create identity, polygon and area of room ${rid}`,
        reason: 'NO_DEPENDENCY_INDEX',
        detail:
          `the new wall ${wallId} is driven THROUGH room ${rid} (its centreline properly crosses a ` +
          'boundary wall of that room), so the room is likely to be SPLIT. Only re-running room ' +
          'detection — a mutating, level-wide, store-writing pass a planner must not perform ' +
          '(RoomDetectionEngine, PROTECTED) — can resolve the resulting partition. The room is ' +
          'reported as affected; its resulting geometry, area and even its continued existence as a ' +
          'single room are NOT predicted.',
      });
    }

    if (!anyStructuralLink) {
      return {
        membership: {
          kind: 'undetermined',
          scope: `room-partition impact of the new wall ${wallId} on level ${levelId}`,
          reason: 'STALE_DERIVED_STATE',
          detail:
            'rooms carry no explicit wall linkage, so they expose no boundary segments; whether the ' +
            'new wall subdivides one cannot be tested. Boundary membership is derived by ' +
            'RoomTopologyObserver detection, which a structural wall add invalidates and which is ' +
            'suppressed on graph-authoritative levels (ADR-0069).',
        },
        perRoom: [],
      };
    }

    return { membership: determined(crossed), perRoom };
  }

  /**
   * The before/after violation diff for an ADD: clone stores → APPEND the candidate to the
   * clone → validateAll before/after → diff. Structurally the move planner's branch with a
   * push instead of a substitution.
   *
   * Deliberately NO predicted room geometry is folded into the after-clone. For a MOVE, the
   * Phase 6b predictor could recompute a known room's area under a new baseline. For a CREATE
   * there is no such predictor (the header explains why), so the after-clone carries rooms
   * UNCHANGED. That means area-based rules (ROOM_MIN_AREA) evaluate identically on both sides
   * and can never fire for a create — which is exactly why every room the wall crosses gets
   * its own UNDETERMINED entry in the room branch. An unpredicted room must never read as
   * "no violation"; the refusal is what prevents it.
   */
  private violationsBranch(
    context: PlanningContext,
    candidate: WallData,
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
          scope: `constraint validation of creating wall ${candidate.id}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no constraint validator is composed in this runtime; the violation delta of the new ' +
            'wall cannot be computed',
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
    // The ADD, applied to the CLONE only. `candidate` is itself a fresh object built in
    // `plan()`; spreading again keeps the clone list free of any shared reference.
    const afterWalls = [...beforeWalls, { ...(candidate as unknown as Record<string, unknown>) }];
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
    const beforeCtx = { ...baseCtx, wallStore: makeStore(beforeWalls) } as unknown as ConstraintContext;
    const afterCtx = { ...baseCtx, wallStore: makeStore(afterWalls) } as unknown as ConstraintContext;

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
          scope: `constraint validation of creating wall ${candidate.id}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the constraint validator threw while diffing the create',
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
   * Regeneration is a declared blind spot — as in the move planner, but for an ADDITIONAL
   * create-specific reason worth stating in the plan itself: `DependencyResolver.getAffected`
   * EXISTS and would appear to answer, and using it here would be wrong twice over. Its
   * non-delete branch returns `determined` unconditionally (so an unminted id yields a
   * confident EMPTY task set), and it writes `_captured` on every query (so calling it from a
   * planner breaks purity). The honest answer is that the substrate does not yet answer this
   * question for a create.
   */
  private regenerationUndetermined(id: string): UndeterminedImpact {
    return {
      scope: `regeneration of elements dependent on the new wall ${id}`,
      reason: 'NO_DEPENDENCY_INDEX',
      detail:
        'the dependency index (roadmap Phase 5) that would resolve regeneration impact is not wired ' +
        'for creates. DependencyResolver.getAffected is NOT consulted: its non-delete branch returns ' +
        'a DETERMINED result unconditionally, so for a wall that does not exist yet it would report a ' +
        'confident EMPTY set (failure-as-emptiness, ADR-0322 §5), and it mutates its own capture map ' +
        'on every query, which a planner may not do (ADR-0322 §2).',
    };
  }

  // ── Assembly + hashing ───────────────────────────────────────────────────────────────

  private assemble(input: {
    command: WallCreateCommand;
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
    // The newcomer is ADDED, never also MODIFIED — the two arms must not both claim it.
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
    const planId = `plan-wall.create-${planHash}`;

    return {
      planId,
      planHash,
      stateHash: input.stateHash,
      ...body,
    };
  }
}
