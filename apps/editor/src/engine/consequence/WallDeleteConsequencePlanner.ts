// WallDeleteConsequencePlanner — the SIXTH composed family: delete a WALL, the HOST.
//
// ── THE FAMILY, AND WHY IT IS ONE VERB (C78 §19.1, C69's rival-list rule) ────────────
// ENUMERATED, never hand-listed. The denominator is the GENERATED register
// `docs/04-reference/API-VERB-REGISTER.md` — the same file
// `check-relationship-determination` parses with
// `/^\|\s*`([a-z][\w.-]*)`\s*\|/` (its `parseRegisterVerbs`), and which
// `tools/ga-gate/check-verb-register.ts` regenerates by statically walking
// `plugins/`, `apps/editor/src/engine/` and `packages/command-registry/src/`. Filtered by
// the gate's own `opClassOf` (last segment ∈ create|delete|move|update|batch), the verbs
// that can remove a WALL are exactly three, and only ONE of them is this family:
//
//   `wall.delete`         (register row 339 · plugins/wall DeleteWall.ts · payload `{ id }`)
//                         ← THIS FAMILY. One verb, one planner key.
//   `element.delete`      (row 129 · plugins/view DeleteElement.ts) — the generic
//                         TYPE-DISPATCHING legacy verb. It resolves a kind at runtime and
//                         bridges to `window.commandManager`; handing it to this planner
//                         would plan a wall delete for a beam. EXCLUDED for the same
//                         reason the hosted-opening family excluded it (9e780581).
//   `element.deleteBatch` (row 130) — batch, generic, and NOT EVEN IN THE GATE'S
//                         DENOMINATOR: `opClassOf('element.deleteBatch')` returns null
//                         (the last segment is `deleteBatch`, and no segment is `batch`),
//                         so it is a wall-deleting verb the U-INV-1 cell count does not
//                         measure at all. Named here so that gap is on the record rather
//                         than silently inherited; closing it is a register/gate change,
//                         not a planner change.
//
// MEASURED ABSENT, so nobody re-adds them from memory: `wall.batch.delete`,
// `wall.deleteBatch`, `walls.delete` and `wall.remove` DO NOT EXIST anywhere in the tree.
// The wall family has `wall.batch.create` (row 329) with NO batch-delete counterpart;
// `element.deleteBatch` is the only batch route to a wall. `curtain-wall.delete` /
// `curtain-wall.batch.delete` are a DIFFERENT element kind with their own family.
//
// ── WHY THIS IS NOT THE HOSTED-OPENING DELETE FAMILY (9e780581) ──────────────────────
// That family deletes a hosted CHILD and its relationship set is the hosted side: one
// host record, the sibling openings, one graph purge. This family deletes the HOST, and
// its relationship set is disjoint from it in three directions at once — the wall's own
// CHILDREN (every door and window it hosts), its JOINED walls (whose mitres re-resolve
// without it), and the ROOMS it bounds (whose rings may no longer close). None of those
// questions exists on the hosted-delete row, and none of that row's machinery answers
// them. Two planners, deliberately, and the split was named by the planner of that
// commit's own header before this one existed.
//
// ── THE PAYLOAD KEY IS NOT SETTLED IN-TREE, AND THAT IS MEASURED, NOT ASSUMED ────────
// `DeleteWallHandler` reads `cmd.id` (plugins/wall/src/handlers/DeleteWall.ts). But the
// cross-plugin cascade rule `plugins/cross/src/wall-room.ts:87-96` — the rule that
// synthesises `room.recomputeBoundary` off this very verb — reads `payload.wallId` FIRST
// and falls back to `payload.id`. Two live readers of one verb's payload, two key orders.
// The normaliser therefore mirrors the CASCADE RULE's precedence verbatim (`wallId` then
// `id`) rather than inventing a third: the planner and the wall→room cascade must name
// the SAME wall, or one situation gets two explanations. `payload.targetId`
// (packages/sync-client __tests__/_chaos/RandomEditGenerator.ts) is a CHAOS-TEST fixture
// spelling with no production dispatcher behind it and is deliberately NOT accepted —
// normalising a test-only shape would make this family answer for a dispatch nobody emits.
//
// ── canExecute IS MIRRORED VERBATIM: REFUSE, DO NOT REFIT ────────────────────────────
// Unlike the hosted-opening delete row — where `refused` is a literal [] because no commit
// path declines — BOTH commit paths here carry real refusals, and this planner reproduces
// their sentences rather than paraphrasing them:
//
//   plugins/wall DeleteWall.ts canExecute:
//     `cmd.id must be a non-empty string`      (typeof/length guard)
//     `wall not found: ${cmd.id}`              (the store membership guard)
//   packages/command-registry DeleteElementCommand.canExecute (the WALL arm, lines 169-171
//   + 199): existence-only across wallStore.getById / getWindow / getDoor, refusing
//     `Element ${id} not found in any store`
//
// REFUSE-NOT-REFIT is the whole point: when the named wall is not in the store, this
// planner does NOT scan for a similar one, does NOT fall through to an empty determined
// plan, and does NOT report a no-op. It refuses with the commit path's own words, and the
// plan claims NOTHING removed. Measured and stated: there is NO guard anywhere that
// declines a wall delete because it hosts openings, is joined to other walls, or bounds a
// room. Those are consequences the command PERFORMS (or, for rooms, silently omits) —
// never grounds for refusal — so this planner must not invent a refusal for them either.
//
// ── THE TWO COMMIT PATHS DISAGREE ABOUT THE ENTIRE CASCADE (disposition (iv)) ────────
// Sharper here than on any earlier row, and source-verified:
//
//   `wall.delete` on the BUS → plugins/wall DeleteWall.ts. `affectedStores = ['wall']`,
//   and `execute` is one Immer `delete draft[cmd.id]`. Its own file header says it:
//   "does NOT cascade to door/window/opening stores". Every door and window the wall
//   hosted is left as an orphan row.
//
//   `DeleteElementCommand` (reached via `element.delete` → window.commandManager) — the
//   authoritative legacy path. Its wall branch DOES cascade: it reads
//   `wall.childrenIds ?? []`, unregisters each child from elementRegistry and BimManager,
//   purges each child's graph edges, removes each from the standalone doorStore/windowStore,
//   then `wallStore.remove(id)` and purges the wall's own edges
//   (§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES, 3ee632f6), all captured verbatim for undo.
//
// And the ROOM cascade inverts the asymmetry: `plugins/cross/src/wall-room.ts` fires on the
// BUS verb `wall.delete` and synthesises `room.recomputeBoundary` — but `element.delete`
// declares `affectedStores: []` and bridges to the command manager WITHOUT dispatching the
// bus verb, so the wall→room cascade never fires on the authoritative path. So one path
// cascades children and not rooms; the other cascades rooms and not children. WHICH path
// ran is a property of the DISPATCHER, not of readable state, so this planner does not
// predict it: it states the SEMANTIC consequence and DECLARES the divergence, so R4's
// independent read-back can measure which one actually happened.
//
// ── DISCOVERY IS FROM RECORDED RELATIONSHIPS ONLY (C78 §5.1) ─────────────────────────
// Four records, all read, none re-derived from geometry:
//
//   1. `wall.childrenIds` — the record the COMMIT PATH itself reads to decide the child
//      cascade, plus `wall.openings[]`, the C15 §1 host-side record of the same `hosts`
//      edge. They are TWO RECORDS OF ONE RELATIONSHIP and they can disagree. This planner
//      does NOT silently union them: the agreed set (and anything childrenIds alone
//      carries, because that is what the cascade reads) is DETERMINED-removed, and an
//      opening recorded in `openings[]` but ABSENT from `childrenIds` is a typed
//      UNDETERMINED naming the exact ids — because the cascade will not reach it and it
//      will be orphaned, which is a different fact from "it is deleted".
//   2. `getJoinedWalls(id)` — the REFUSAL-BEARING junction reader (ADR-0321,
//      JoinedWallsQuery). `{ok:true, joinedWallIds:[]}` is a POSITIVE answer ("covered,
//      joins nothing"); `{ok:false}` is NO ANSWER and names why. Conflating them converts
//      absent evidence into a pass (C71 §4.4) — the exact inference C78 §1.4 forbids.
//   3. `getBoundingWalls(roomId)` — the REFUSAL-BEARING `boundedBy` reader
//      (§GR12-BOUNDARY-INVALIDATION). Used in preference to any `boundingWallIds` field
//      scan because it is the ONE surface that can say it does not know, and because the
//      commit path's own §GR12-DELETE-INVALIDATION writer marks exactly the rooms this
//      reader will then refuse for. There is no legitimate empty success on it.
//   4. `getRelationships(id)` — the recorded edge index DeleteElementCommand captures
//      verbatim before purging and restores verbatim on undo. ABSENT reader =
//      NO_DEPENDENCY_INDEX; EMPTY answer = RELATIONSHIP_NOT_RECORDED; THREW = declared.
//
// Reverse `boundedBy` deserves its own sentence, because the obvious implementation is the
// wrong one. `semanticGraphManager.getSources(wallId, 'boundedBy')` answers "which rooms
// name this wall" in one call — and it is the BARE reader, which returns [] for both "no
// rooms" and "the boundary writers never covered this". That is the same-value defect the
// determination gate itself flags under `relationship:*/cannot-refuse`. So this planner
// walks the ROOM store and asks the refusal-bearing reader per room instead, which costs a
// loop and buys the ability to distinguish a room CHECKED-and-unaffected from a room whose
// boundary nobody can currently answer for.
//
// ── WHY ROOM GEOMETRY IS NOT PREDICTED (and predictRoomGeometry is NOT wired) ────────
// `predictRoomGeometry` types a `ProposedWallMove`. A delete is not a move with a special
// baseline: removing a boundary wall can leave the ring OPEN, merge two rooms, or stop the
// region being a room at all. The graph's own delete-invalidation writer says exactly this
// — "whether the room still closes at all — and whether it is still a room — is unknown
// until re-derivation (room detection) runs". `TOPOLOGY_CHANGE_POSSIBLE` is the C78 §8.1
// member for precisely that, so it is declared, and a pure geometric predictor is NOT
// dragged in to produce a confident polygon for a ring that may not exist.
//
// ── WHY THIS FILE LIVES IN apps/editor/src/engine (the composition layer) ────────────
// Identical to the other five planners' reason: the consequence CONTRACT is
// `@pryzm/command-bus` (L1), but this planner must reach `@pryzm/constraint-solver` (L2)
// and `@pryzm/core-app-model` types. apps/editor is L7, so every edge is DOWNWARD. Every
// heavyweight collaborator is INJECTED and every package import here is `import type`
// (erased), so the planner constructs and runs dependency-free in a plain node env.
//
// ── THE INVARIANT (ADR-0322 §2) ──────────────────────────────────────────────────────
// `plan()` MUST NOT mutate authoritative state. Every read is over the caller-supplied
// read-only `PlanningContext` views or over CLONES; the wall is removed from a FRESH clone
// of the wall list, never from the live store. G-REASON-01 (purity) and G-REASON-02
// (determinism) are the gates.

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

// Type-only — erased at runtime.
import type { WallData } from '@pryzm/geometry-wall';
import type { JoinedWallsQuery } from '@pryzm/core-app-model';

/**
 * `BoundingWallsQuery`, MIRRORED STRUCTURALLY — and the mirror is a declared workaround,
 * not a preference.
 *
 * The real union is `export type BoundingWallsQuery` in
 * `packages/core-app-model/src/SemanticGraph.ts`, but it is NOT on the package's public
 * surface: `src/index.ts` re-exports its sibling `JoinedWallsQuery` explicitly (line 609)
 * and never re-exports this one, no `export *` covers `SemanticGraph.js`, and no
 * `exports` subpath in that package's manifest reaches the module. So the type is real,
 * exported from its own file, and unreachable from `@pryzm/core-app-model`. Importing it
 * is what a first draft of this planner did, and root tsc rejected it:
 *   `TS2305: Module '"@pryzm/core-app-model"' has no exported member 'BoundingWallsQuery'`.
 *
 * The RIGHT fix is one line in that barrel — and it is OUT OF THIS LANE'S SCOPE
 * (packages/core-app-model belongs to another lane this session), so it is NAMED here as
 * owed rather than reached for. This declaration mirrors the union VERBATIM, including
 * both refusal reasons; nothing is widened, and `reason` is NOT loosened to `string`,
 * because `roomBranch` discriminates on the exact literal
 * `'room-unknown-to-boundedBy-writer'` and a widened reason would silently stop
 * discriminating. Structural typing keeps the composition site assignable to the real
 * manager with no cast (U-INV-5): if the real union ever changes shape, the composition
 * root — not this file — is where tsc reports it.
 */
type BoundaryUndeterminedReason =
  | 'boundary-undetermined-after-element-move'
  | 'boundary-undetermined-after-element-delete';

type BoundingWallsQuery =
  | { readonly ok: true; readonly roomId: string; readonly boundingWallIds: readonly string[] }
  | {
      readonly ok: false;
      readonly roomId: string;
      readonly reason: BoundaryUndeterminedReason | 'room-unknown-to-boundedBy-writer';
      readonly detail: string;
    };
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';

// The ONE stable serialisation, shared with the other five planners so all six hash with
// the same algorithm (ADR-0322 §6's one-algorithm rule applied to hashing).
import { stableStringify } from './WallMoveConsequencePlanner.js';

// ─── The command this planner answers for ────────────────────────────────────────────

/**
 * `wall.delete` — remove a wall and whatever its removal cascades to.
 *
 * `id` is the ONLY field. The register verb's handler payload is `{ id }`; the normaliser
 * accepts the cross-cascade rule's `wallId` spelling too and renames it here, so the
 * planner sees exactly one key (see the header for why a third spelling is refused).
 */
export interface WallDeleteCommand {
  readonly type: 'wall.delete';
  readonly payload: {
    /** The wall id the command names. */
    readonly id: string;
  };
}

// ─── Injected collaborators (the substrate, supplied by the composition root) ─────────

/**
 * The RECORDED relationship reader — `semanticGraphManager.getRelationships`, the SAME
 * index `DeleteElementCommand` captures verbatim before purging and restores verbatim on
 * undo (3ee632f6). Read-only: this planner calls `getRelationships` and nothing else.
 */
export interface RecordedRelationshipReader {
  getRelationships(elementId: string): readonly {
    readonly type?: string;
    readonly sourceId?: string;
    readonly targetId?: string;
  }[];
}

/**
 * The retained junction index reader — `SemanticGraphManager.getJoinedWalls` (ADR-0321).
 * Structurally identical to `WallMoveConsequencePlanner.JoinedWallsReader` and declared
 * separately only so this planner keeps its own dependency surface; the SEMANTICS are the
 * same one because it is the same edge, read the same way, by both rows.
 */
export interface JoinedWallsReader {
  getJoinedWalls(wallId: string): JoinedWallsQuery;
}

/**
 * The refusal-bearing `boundedBy` reader — `SemanticGraphManager.getBoundingWalls`
 * (§GR12-BOUNDARY-INVALIDATION). It answers "which walls bound room R?", and it can REFUSE
 * — which is the entire reason it is preferred over any `boundingWallIds` field scan.
 */
export interface BoundingWallsReader {
  getBoundingWalls(roomId: string): BoundingWallsQuery;
}

/** The mined violation core — `constraintEngine.validateAll` (clone → apply → diff). */
export interface ViolationValidator {
  validateAll(ctx: ConstraintContext): ValidationResult[];
}

/**
 * Everything the planner needs beyond the read-only `PlanningContext`. ALL OPTIONAL: an
 * ABSENT collaborator is the honest `NO_DEPENDENCY_INDEX` / `ENGINE_NOT_AVAILABLE` case,
 * declared as `undetermined`, NOT silently skipped. The planner constructs and runs
 * with `{}`.
 */
export interface WallDeletePlannerDeps {
  readonly relationships?: RecordedRelationshipReader;
  readonly joinedWalls?: JoinedWallsReader;
  readonly boundingWalls?: BoundingWallsReader;
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

// ─── The records, as this planner reads them ─────────────────────────────────────────

/** The shape of `wall.openings[i]` this planner depends on (C15 §1) — read defensively,
 *  exactly as the hosted-element planners read it: a missing field never becomes a `?? 0`,
 *  because a fabricated zero would print as a measured value. */
interface OpeningRecord {
  readonly id?: string;
  readonly elementId?: string;
  readonly type?: 'window' | 'door';
}

/** The element id an opening is known by on the bus — `elementId` first, `id` fallback. */
function openingElementId(o: OpeningRecord): string | undefined {
  return o.elementId ?? o.id;
}

/** The two host-side child records, read defensively off whatever the store view holds. */
function childrenIdsOf(w: unknown): readonly string[] {
  const list = (w as { childrenIds?: unknown }).childrenIds;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

function openingsOf(w: unknown): readonly OpeningRecord[] {
  const list = (w as { openings?: unknown }).openings;
  return Array.isArray(list) ? (list as OpeningRecord[]) : [];
}

// ─── The planner ──────────────────────────────────────────────────────────────────────

export class WallDeleteConsequencePlanner implements ConsequencePlanner<WallDeleteCommand> {
  constructor(private readonly deps: WallDeletePlannerDeps = {}) {}

  async plan(command: WallDeleteCommand, context: PlanningContext): Promise<ConsequencePlan> {
    const { id } = command.payload;

    const wallView = context.getStore('wall');
    const allWalls = wallView ? ([...wallView.getAll()] as WallData[]) : [];

    // State hash — over exactly the authoritative state the plan is computed from, so a
    // stale approval (R6) is detectable. The WHOLE wall list is hashed: the level-sibling
    // verdict below is computed over it, so a wall added or removed elsewhere changes the
    // answer and an approval must not survive that.
    const stateHash = fnv1a(stableStringify({ wallDelete: command.payload, walls: allWalls }));

    const undetermined: UndeterminedImpact[] = [];
    const refused: ConsequenceRefusal[] = [];
    const changed: string[] = [];
    const excluded: string[] = [];
    const topologyRemoved: string[] = [];
    const topologyModified: string[] = [];

    // The wall named by the command is the DIRECT subject on every branch, including the
    // refusal branches: a refused delete is still a statement ABOUT that wall.
    const direct = determined([id]);

    /** The terminal shape shared by both refusal branches and the store-missing bail:
     *  NOTHING is claimed removed, `indirect` is undetermined, and the plan still carries
     *  its declarations rather than going silent. */
    const terminal = (
      indirect: ImpactDetermination,
      extra: readonly UndeterminedImpact[],
    ): ConsequencePlan => {
      for (const u of extra) undetermined.push(u);
      undetermined.push(this.metricsUnexpressible(id));
      undetermined.push(this.dualPathUndetermined(id));
      undetermined.push(this.regenerationUndetermined(id));
      return this.assemble({
        command,
        stateHash,
        direct,
        indirect,
        changed,
        excluded,
        topologyRemoved,
        topologyModified,
        refused,
        undetermined,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    };

    // ── Branch 0a: canExecute, MIRRORED VERBATIM — the shape guard ────────────────────
    // plugins/wall DeleteWall.ts: `cmd.id must be a non-empty string`.
    if (typeof id !== 'string' || id.length === 0) {
      refused.push({
        reason:
          'cmd.id must be a non-empty string — the refusal sentence plugins/wall ' +
          'DeleteWall.ts canExecute returns verbatim. No wall is named, so nothing is ' +
          'planned: this is a REFUSAL, not a delete of an inferred subject.',
      });
      return terminal(
        {
          kind: 'undetermined',
          scope: 'indirect impact of a wall delete that names no wall',
          reason: 'INVALID_REQUEST',
          detail:
            'the command carries no non-empty id, so there is no subject whose children, ' +
            'joined walls or bounded rooms could be read. Nothing is inferred from the ' +
            'absence (C78 §1.4).',
        },
        [],
      );
    }

    // ── Branch 0b: canExecute, MIRRORED VERBATIM — the store membership guard ─────────
    if (!wallView) {
      return terminal(
        {
          kind: 'undetermined',
          scope: `indirect impact of deleting wall ${id}`,
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no wall store view is available; the subject cannot be located, and both ' +
            'commit paths decide their entire cascade by reading the wall RECORD. With no ' +
            'record there is nothing to reason about — and this is NOT the "wall not found" ' +
            'refusal, because the store itself was unreadable rather than the wall absent.',
        },
        [],
      );
    }

    const wall = wallView.getById(id) as WallData | null | undefined;
    if (!wall) {
      // BOTH commit paths refuse, in their own words. REFUSE, DO NOT REFIT: no fallback
      // scan for a similar wall, no empty determined plan, no reported no-op.
      refused.push({
        elementId: id,
        reason:
          `wall not found: ${id} — plugins/wall DeleteWall.ts canExecute refuses with that ` +
          `sentence, and packages/command-registry DeleteElementCommand.canExecute refuses ` +
          `the same id with "Element ${id} not found in any store" after checking ` +
          `wallStore.getById / getWindow / getDoor. Both refusals are EXISTENCE-only: no ` +
          `commit path declines a wall delete because the wall hosts openings, is joined to ` +
          `other walls or bounds a room, so no such refusal is invented here either.`,
      });
      return terminal(
        {
          kind: 'undetermined',
          scope: `indirect impact of deleting wall ${id}`,
          reason: 'RELATIONSHIP_NOT_READABLE',
          detail:
            `the wall store view does not hold ${id}. The wall may already be deleted, may ` +
            'live on a level not loaded in this view, or may never have existed — and those ' +
            'are the SAME empty answer here, which is exactly why this is a refusal plus an ' +
            'UNDETERMINED and not a determined no-op. No search for a similar wall is ' +
            'performed: deleting whichever wall happens to resemble the named one would ' +
            'remove a wall the caller never named.',
        },
        [],
      );
    }

    const levelId = typeof (wall as { levelId?: unknown }).levelId === 'string'
      ? String((wall as { levelId?: unknown }).levelId)
      : undefined;

    // ── Branch 1: the REMOVAL itself — DETERMINED on both commit paths ────────────────
    topologyRemoved.push(id);
    changed.push(id);

    // ── Branch 2: CHILDREN — the two records of the `hosts` edge, NOT silently unioned ─
    const children = this.childrenBranch(wall, id);
    for (const cid of children.removed) {
      topologyRemoved.push(cid);
      changed.push(cid);
    }
    if (children.undetermined) undetermined.push(children.undetermined);

    // ── Branch 3: JOINED WALLS — the refusal-bearing junction index ──────────────────
    const junction = this.junctionBranch(id);
    if (junction.kind === 'determined') {
      for (const jid of junction.elements) {
        changed.push(jid);
        topologyModified.push(jid);
      }
    } else {
      undetermined.push(junction);
    }

    // ── Branch 3b: LEVEL SIBLINGS — the overstatement this row is most likely to make ─
    // DeleteElementCommand snapshots EVERY wall on the level (`w.levelId === wall.levelId`)
    // for undo. That is an UNDO SCOPE, not a change claim, and a planner that transcribed
    // it would report every wall on the floor as affected. The walls on this level that the
    // junction index says are NOT joined to the subject are CHECKED-and-unaffected
    // (disposition (ii)) — a positive verdict, recorded in `excluded`, never omitted.
    if (junction.kind === 'determined' && levelId !== undefined) {
      const joined = new Set(junction.elements);
      for (const w of allWalls) {
        const wid = typeof (w as { id?: unknown }).id === 'string' ? String(w.id) : undefined;
        if (wid === undefined || wid === id || joined.has(wid)) continue;
        if (String((w as { levelId?: unknown }).levelId) !== levelId) continue;
        excluded.push(wid);
      }
      undetermined.push(this.levelSnapshotDeclaration(id, levelId));
    }

    // ── Branch 4: ROOMS the wall bounds — per room, refusal-bearing ──────────────────
    const rooms = this.roomBranch(context, id);
    if (rooms.membership.kind === 'determined') {
      for (const rid of rooms.membership.elements) {
        changed.push(rid);
        topologyModified.push(rid);
      }
    } else {
      undetermined.push(rooms.membership);
    }
    for (const rid of rooms.unaffected) excluded.push(rid);
    for (const u of rooms.perRoom) undetermined.push(u);

    // ── Branch 5: RECORDED graph relationships (C78 §5.1) ───────────────────────────
    const rel = this.relationshipsBranch(id);
    if (rel.kind === 'determined') for (const cid of rel.counterparts) changed.push(cid);
    else undetermined.push(rel.undetermined);

    // ── Branch 6: VIOLATIONS — the diff over the wall list WITHOUT this wall ────────
    const violation = this.violationsBranch(context, id);
    if (violation.kind === 'undetermined') undetermined.push(violation.undetermined);

    // ── Branches 7–9: the declared dispositions ─────────────────────────────────────
    undetermined.push(this.metricsUnexpressible(id));
    undetermined.push(this.dualPathUndetermined(id));
    undetermined.push(this.regenerationUndetermined(id));

    // ── indirect impact ─────────────────────────────────────────────────────────────
    // The move/create rule, unchanged: if ANY indirect branch is undetermined the indirect
    // reach is incomplete, so `indirect` is undetermined (honest) rather than a partial
    // determined set that would read as a complete one.
    const indirect: ImpactDetermination =
      junction.kind === 'undetermined'
        ? {
            kind: 'undetermined',
            scope: `indirect impact (children + joined walls + bounded rooms) of deleting wall ${id}`,
            reason: junction.reason,
            detail: junction.detail,
          }
        : rooms.membership.kind === 'undetermined'
          ? {
              kind: 'undetermined',
              scope: `indirect impact (children + joined walls + bounded rooms) of deleting wall ${id}`,
              reason: rooms.membership.reason,
              detail: rooms.membership.detail,
            }
          : determined([...children.removed, ...junction.elements, ...rooms.membership.elements]);

    return this.assemble({
      command,
      stateHash,
      direct,
      indirect,
      changed,
      excluded,
      topologyRemoved,
      topologyModified,
      refused,
      undetermined,
      validation: violation.validation,
    });
  }

  // ── Branch helpers ─────────────────────────────────────────────────────────────────

  /**
   * The CHILD cascade, read from the TWO host-side records of the one `hosts` edge.
   *
   * `wall.childrenIds` is the record the COMMIT PATH reads (`DeleteElementCommand`:
   * `const childrenIds: string[] = wall.childrenIds ?? []`, then per child: unregister,
   * purge graph edges, `doorStore.remove` / `windowStore.remove`). `wall.openings[]` is the
   * C15 §1 host-side record of the same relationship.
   *
   * They can DISAGREE, and the disagreement is not cosmetic: an opening recorded in
   * `openings[]` but absent from `childrenIds` is one the cascade does not reach, so its
   * standalone row and its graph edges survive the delete of its host. Reporting it as
   * removed would be a prediction the commit path contradicts; omitting it would be
   * silence. It is declared, by id.
   *
   * The other direction needs no declaration: a `childrenIds` member with no `openings[]`
   * record is still cascaded verbatim by the commit path, so it IS removed.
   */
  private childrenBranch(
    wall: WallData,
    wallId: string,
  ): { removed: readonly string[]; undetermined?: UndeterminedImpact } {
    const childIds = childrenIdsOf(wall);
    const openingIds = openingsOf(wall)
      .map(openingElementId)
      .filter((x): x is string => typeof x === 'string' && x.length > 0);

    const childSet = new Set(childIds);
    const orphaned = sortedUnique(openingIds.filter((o) => !childSet.has(o)));
    const removed = sortedUnique(childIds);

    if (orphaned.length === 0) return { removed };

    return {
      removed,
      undetermined: {
        scope: `the fate of ${orphaned.length} opening(s) recorded on wall ${wallId} but absent from its childrenIds (${orphaned.join(', ')})`,
        reason: 'RELATIONSHIP_NOT_RECORDED',
        detail:
          `wall ${wallId} carries these ids in its C15 §1 openings[] record but NOT in ` +
          '`childrenIds`, and `childrenIds` is the record the commit path reads to decide ' +
          'the child cascade (DeleteElementCommand: `wall.childrenIds ?? []`). Two records ' +
          'of one `hosts` edge disagree, so whether these elements are deleted, orphaned as ' +
          'standalone door/window rows with live graph edges, or were never really hosted ' +
          'here is NOT determined by readable state. They are NOT reported as removed (the ' +
          'cascade would not reach them) and NOT reported as unaffected (the wall carrying ' +
          'their void is going away) — the disagreement itself is the answer, and it is ' +
          'named by id so it can be checked rather than believed.',
      },
    };
  }

  /**
   * The JUNCTION branch — `getJoinedWalls`, the refusal-bearing reader (ADR-0321).
   *
   * `{ok:true, joinedWallIds:[]}` is a POSITIVE answer: the joinedTo writer has covered this
   * wall and it joins nothing. `{ok:false}` means the graph cannot answer for this id and
   * names why (no flush has run over its level since load). Collapsing the second into the
   * first converts absent evidence into a pass (C71 §4.4) — so the refusal is forwarded
   * with the probe's OWN detail, never re-worded.
   *
   * Deliberately the SAME reader, the same query and the same typed answers as
   * `WallMoveConsequencePlanner.junctionBranch`, because it is the SAME edge: two planners
   * resolving one relationship by two rules is how a wall gets one answer about its
   * neighbours from the move row and a different one from the delete row.
   */
  private junctionBranch(id: string): ImpactDetermination {
    const scope = `junction / mitre re-resolution of the walls joined to ${id}`;
    if (!this.deps.joinedWalls) {
      return {
        kind: 'undetermined',
        scope,
        reason: 'ENGINE_NOT_AVAILABLE',
        detail:
          'no joinedTo index reader is composed in this runtime; WHICH walls re-mitre when ' +
          'this one is removed cannot be read. That is not "it joins nothing" (C78 §1.4).',
      };
    }
    let probe: JoinedWallsQuery;
    try {
      probe = this.deps.joinedWalls.getJoinedWalls(id);
    } catch {
      return {
        kind: 'undetermined',
        scope,
        reason: 'ENGINE_NOT_AVAILABLE',
        detail: 'the joinedTo index reader threw while enumerating this wall\'s junctions',
      };
    }
    if (probe.ok) {
      // A positive answer — including an empty one ("covered, joins nothing"). Every wall
      // named here re-mitres: the delete performs no junction edit itself (the commit path
      // touches no mitre store), the resolver simply re-runs over a cluster this wall has
      // left, which is a change to the neighbour's resolved end condition.
      return determined(probe.joinedWallIds);
    }
    return {
      kind: 'undetermined',
      scope,
      reason: 'ENGINE_NOT_AVAILABLE',
      detail: probe.detail,
    };
  }

  /**
   * The declaration that keeps the level-wide UNDO SNAPSHOT from being read as a cascade.
   * Emitted only when the junction index answered, i.e. only when the `excluded` verdict
   * above actually rests on a positive reading.
   */
  private levelSnapshotDeclaration(id: string, levelId: string): UndeterminedImpact {
    return {
      scope: `the baseline of every OTHER wall on level ${levelId} under the delete of ${id}`,
      reason: 'AGGREGATE_SCOPE_UNSUPPORTED',
      detail:
        'DECLARED so the undo snapshot is not mistaken for a cascade. ' +
        'DeleteElementCommand captures `wallStore.getAll().filter(w => w.levelId === ' +
        'wall.levelId)` — EVERY wall on the level, with its baseLine and _sourceBaseLine — ' +
        'before removing this one. That is the scope UNDO must be able to restore, because ' +
        'the join resolver may rewrite any of them when it re-runs; it is NOT a claim that ' +
        'each of them changes. The walls this level carries that the junction index reports ' +
        'as NOT joined to the subject are recorded in `excluded` — CHECKED and determined ' +
        'unchanged — and the ones it does report are in `changed`. If the junction index ' +
        'could not answer, no level-sibling verdict is offered at all rather than a guess.',
    };
  }

  /**
   * The ROOM branch — per room, through the REFUSAL-BEARING `boundedBy` reader.
   *
   * Why not `getSources(wallId, 'boundedBy')`, which answers the whole question in one
   * call: it is the BARE reader and returns `[]` for both "no rooms name this wall" and
   * "the boundary writers never covered it". That is the same-value defect the
   * determination gate itself flags (`relationship:<r>/cannot-refuse` — spelled with the
   * ledger's own `<r>` placeholder, NOT a glob: a `*` here would close this JSDoc block),
   * and inheriting it
   * would make every room cell on this row silently unanswerable. `getBoundingWalls(roomId)`
   * is the surface that can say it does not know, so the loop is worth its cost.
   *
   * Three per-room outcomes, and the third is the point:
   *   ok:true  + wall present  → DETERMINED-affected. The ring loses a member.
   *   ok:true  + wall absent   → DETERMINED-UNAFFECTED (`excluded`) — a positive verdict.
   *   ok:false                 → typed UNDETERMINED, per room, with the reader's own
   *                              reason mapped to its C78 §8.1 member. Never inferred
   *                              unaffected, and never quietly dropped.
   *
   * GEOMETRY is deliberately NOT predicted for the affected rooms; see the file header.
   */
  private roomBranch(
    context: PlanningContext,
    wallId: string,
  ): {
    membership: ImpactDetermination;
    unaffected: readonly string[];
    perRoom: readonly UndeterminedImpact[];
  } {
    const scope = `the rooms bounded by wall ${wallId}`;
    const roomView = context.getStore('room');
    if (!roomView) {
      return {
        membership: {
          kind: 'undetermined',
          scope,
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no room store view is available; which rooms this wall bounds cannot be read ' +
            'here. That is not "it bounds none".',
        },
        unaffected: [],
        perRoom: [],
      };
    }
    if (!this.deps.boundingWalls) {
      return {
        membership: {
          kind: 'undetermined',
          scope,
          reason: 'NO_DEPENDENCY_INDEX',
          detail:
            'no refusal-bearing boundedBy reader (semanticGraphManager.getBoundingWalls) is ' +
            'composed in this runtime. WHICH rooms this wall bounds is NOT read — that is ' +
            'not "there are none" (C78 §1.4). A `boundingWallIds` field scan is deliberately ' +
            'NOT used as a substitute: it cannot distinguish a room whose boundary was ' +
            'never derived from one bounded by nothing, which is the whole distinction this ' +
            'branch exists to preserve.',
        },
        unaffected: [],
        perRoom: [],
      };
    }

    // Sorted by id, so the order questions are asked — and therefore the order refusals are
    // reported — is deterministic (G-REASON-02). Store iteration order is not contractual.
    const roomIds = sortedUnique(
      [...roomView.getAll()]
        .map((r) => (r as { id?: unknown }).id)
        .filter((x): x is string => typeof x === 'string' && x.length > 0),
    );

    const affected: string[] = [];
    const unaffected: string[] = [];
    const perRoom: UndeterminedImpact[] = [];

    for (const roomId of roomIds) {
      let q: BoundingWallsQuery;
      try {
        q = this.deps.boundingWalls.getBoundingWalls(roomId);
      } catch {
        perRoom.push({
          scope: `the boundary of room ${roomId} under the delete of wall ${wallId}`,
          reason: 'NO_DEPENDENCY_INDEX',
          detail: `the boundedBy reader threw while answering for room ${roomId}`,
        });
        continue;
      }
      if (q.ok) {
        if (q.boundingWallIds.includes(wallId)) {
          affected.push(roomId);
          // The affected room's GEOMETRY, declared rather than predicted.
          perRoom.push({
            scope: `the polygon, area and roomhood of room ${roomId} after wall ${wallId} is deleted`,
            reason: 'TOPOLOGY_CHANGE_POSSIBLE',
            detail:
              `room ${roomId} is bounded by ${wallId} (recorded boundedBy edge), so its ` +
              'boundary is DETERMINED to change — but WHAT it becomes is not predicted, ' +
              'deliberately. Removing a bounding wall can leave the ring open, merge this ' +
              'room with a neighbour, or stop the region being a room at all; ' +
              'predictRoomGeometry types a ProposedWallMove and cannot express any of those, ' +
              'so it is not wired here. The commit path agrees: its §GR12-DELETE-INVALIDATION ' +
              'writer MARKS this room boundary-undetermined rather than recomputing it, and ' +
              'getBoundingWalls will then refuse for it until room detection re-runs.',
          });
        } else {
          // The positive verdict: the reader answered, and this wall is not in the answer.
          unaffected.push(roomId);
        }
        continue;
      }
      // A refusal, forwarded with its own cause mapped to the closed union. The
      // `…-after-element-move` / `…-after-element-delete` members both mean the derived
      // state is known out of date; `room-unknown-to-boundedBy-writer` means no edge and no
      // mark were ever written.
      perRoom.push({
        scope: `whether room ${roomId} is bounded by wall ${wallId}`,
        reason:
          q.reason === 'room-unknown-to-boundedBy-writer'
            ? 'RELATIONSHIP_NOT_RECORDED'
            : 'STALE_DERIVED_STATE',
        detail: q.detail,
      });
    }

    return { membership: determined(affected), unaffected: sortedUnique(unaffected), perRoom };
  }

  /**
   * The RECORDED-relationship branch (C78 §5.1). Four outcomes, and the difference between
   * the middle two is C78 §1.4 exactly:
   *
   *   reader ABSENT  → `NO_DEPENDENCY_INDEX`. Not "there are none".
   *   reader EMPTY   → `RELATIONSHIP_NOT_RECORDED`. A wall in a detected model carries
   *                    `hosts` / `boundedBy` / `sitsOn` edges by construction, so an empty
   *                    answer is more likely an unwritten index than a genuinely unrelated
   *                    wall — and an empty index reported as "unaffected" is the
   *                    silence-equals-empty defect.
   *   reader THREW   → `NO_DEPENDENCY_INDEX` with the throw named, never a silent skip.
   *   reader ANSWERS → the counterparts are DETERMINED-affected: every one of those edges
   *                    is purged on commit (§FIX-WALL-DELETE-LEAVES-GRAPH-EDGES) and
   *                    restored verbatim on undo, so an element on the other end of one is
   *                    an element whose recorded topology changes.
   */
  private relationshipsBranch(
    wallId: string,
  ):
    | { kind: 'determined'; counterparts: readonly string[] }
    | { kind: 'undetermined'; undetermined: UndeterminedImpact } {
    const scope = `the recorded graph relationships of wall ${wallId} (purged on delete, restored verbatim on undo)`;
    if (!this.deps.relationships) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope,
          reason: 'NO_DEPENDENCY_INDEX',
          detail:
            'no recorded-relationship reader is composed in this runtime ' +
            '(semanticGraphManager.getRelationships — the SAME index DeleteElementCommand ' +
            'captures verbatim before purging). WHICH elements hold an edge to this wall is ' +
            'NOT read — that is not "there are none" (C78 §1.4). The children, junction and ' +
            'room branches read three OTHER records and do not cover supports, sitsOn or ' +
            'any further edge the graph may hold.',
        },
      };
    }
    let records: readonly { type?: string; sourceId?: string; targetId?: string }[];
    try {
      records = this.deps.relationships.getRelationships(wallId);
    } catch {
      return {
        kind: 'undetermined',
        undetermined: {
          scope,
          reason: 'NO_DEPENDENCY_INDEX',
          detail: 'the recorded-relationship reader threw while enumerating this wall\'s edges',
        },
      };
    }
    if (!Array.isArray(records) || records.length === 0) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope,
          reason: 'RELATIONSHIP_NOT_RECORDED',
          detail:
            `the relationship index holds NO edge for wall ${wallId}. A wall in a detected ` +
            'model carries hosts / boundedBy / sitsOn edges by construction, so an EMPTY ' +
            'answer is more likely an index that was never written than a wall genuinely ' +
            'related to nothing. An empty index is UNDETERMINED, never "unaffected" ' +
            '(C78 §1.4) — the delete will still purge whatever the graph does hold at ' +
            'commit time, and §GR12-DELETE-INVALIDATION will still mark whatever rooms it ' +
            'finds.',
        },
      };
    }
    const counterparts = records
      .flatMap((r) => [r.sourceId, r.targetId])
      .filter((x): x is string => typeof x === 'string' && x.length > 0 && x !== wallId);
    return { kind: 'determined', counterparts };
  }

  /**
   * The before/after violation diff: clone stores → REMOVE the wall from the CLONED wall
   * list → validateAll before/after → diff.
   *
   * BOTH halves are reported. `violationsResolved` is the flattering one (a wall that
   * clashed with something stops clashing when it is gone); `violationsCreated` is the one
   * that matters (a room left without an egress wall, a slab left unsupported), and a
   * planner that reported only the first would be a planner that never talks the user out
   * of a delete.
   */
  private violationsBranch(
    context: PlanningContext,
    wallId: string,
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
          scope: `constraint validation of deleting wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no constraint validator is composed in this runtime; which violations the ' +
            'removal RESOLVES — and, more importantly, which it CREATES — cannot be computed',
        },
        validation: empty,
      };
    }

    const clone = (storeId: string): Record<string, unknown>[] => {
      const view = context.getStore(storeId);
      if (!view) return [];
      return view.getAll().map((item) => ({ ...(item as Record<string, unknown>) }));
    };
    const beforeWalls = clone('wall');
    // The AFTER clone: the same list WITHOUT this wall. A fresh array; nothing live is
    // touched (ADR-0322 §2).
    const afterWalls = beforeWalls.filter((w) => String(w.id) !== wallId);

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
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `constraint validation of deleting wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the constraint validator threw while diffing the wall delete',
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

    const violationsCreated = afterResults.filter((r) => !beforeKeys.has(key(r))).map(toRef).sort(byKey);
    const violationsResolved = beforeResults.filter((r) => !afterKeys.has(key(r))).map(toRef).sort(byKey);
    return { kind: 'determined', validation: { violationsCreated, violationsResolved } };
  }

  /**
   * The R5 metric lines this row cannot carry — DECLARED (C78 §1.4). Identical in cause to
   * the hosted-opening delete row and stated again rather than cross-referenced, because a
   * consumer reads ONE plan: `MetricTransition.after` is `number`, NON-optional
   * (packages/command-bus consequence.ts). The type can say "no prior value"
   * (`before: number | undefined` — the create row's shape) but has no way to say a
   * determined ABSENCE after the operation.
   */
  private metricsUnexpressible(wallId: string): UndeterminedImpact {
    return {
      scope: `the length / area BEFORE→AFTER metric lines of deleting wall ${wallId}`,
      reason: 'AGGREGATE_SCOPE_UNSUPPORTED',
      detail:
        'the plan carries NO MetricTransition lines for this delete, deliberately: the ' +
        'contract type MetricTransition.after is a non-optional number (packages/command-bus ' +
        'consequence.ts), built for "no prior value" (before: number | undefined) and unable ' +
        'to express a determined absence (after: undefined — the wall ceases to exist, which ' +
        'is a different fact from "could not read the resulting value"). A fabricated ' +
        'after: 0 would print as a measured metric claiming the wall becomes zero-length; a ' +
        'cast would lie to the type system (U-INV-5). The removal itself is carried in ' +
        'topology.removed; widening MetricTransition is an L1 contract change that belongs to ' +
        'command-bus. The affected ROOM areas are a second casualty of the same seam — and ' +
        'they would be untypeable anyway, since whether those rooms still exist is exactly ' +
        'what the topology declaration above says is unknown.',
    };
  }

  /**
   * C78 §6.4 disposition (iv) — the two commit paths, which on THIS row disagree about the
   * ENTIRE cascade in opposite directions. Declared, never predicted: which one ran is a
   * property of the dispatcher, not of readable state.
   */
  private dualPathUndetermined(wallId: string): UndeterminedImpact {
    return {
      scope: `which cascade the dispatched handler actually performs when deleting wall ${wallId}`,
      reason: 'RELATIONSHIP_NOT_READABLE',
      detail:
        'DISPOSITION (iv), C78 §6.4. TWO commit paths delete a wall and they cascade ' +
        'DIFFERENT things, in opposite directions. (a) The BUS verb `wall.delete` reaches ' +
        "plugins/wall DeleteWall.ts, whose affectedStores is ['wall'] and whose execute is a " +
        'single `delete draft[cmd.id]`; its own file header states it does NOT cascade to the ' +
        'door/window/opening stores, so every opening the wall hosted is left as an orphan ' +
        'row — but the cross-plugin rule plugins/cross/src/wall-room.ts DOES fire on this ' +
        'verb and synthesises room.recomputeBoundary. (b) `element.delete` declares ' +
        'affectedStores: [] and bridges to window.commandManager → DeleteElementCommand, ' +
        'whose wall branch DOES cascade the children (unregister, purge edges, remove the ' +
        'standalone rows) and DOES purge the wall\'s own graph edges — but, because it never ' +
        'dispatches the bus verb, the wall→room cascade never fires and the rooms\' ' +
        'boundingWallIds are left stale while their boundedBy edges are purged. So one path ' +
        'cascades children and not rooms, the other cascades rooms and not children, and ' +
        'neither does both. The plan above states the SEMANTIC consequence of removing this ' +
        'wall; this entry names the divergence so the R4 independent read-back can measure ' +
        'which path actually ran instead of scoring the difference as a wrong prediction.',
    };
  }

  /** Regeneration — declared blind spot, as on all five earlier composed rows (same two
   *  source-verified reasons: getAffected answers determined unconditionally on its
   *  non-delete branch, and it writes its capture map on every query, which a planner may
   *  not do — ADR-0322 §2). */
  private regenerationUndetermined(wallId: string): UndeterminedImpact {
    return {
      scope: `regeneration of elements dependent on wall ${wallId}`,
      reason: 'NO_DEPENDENCY_INDEX',
      detail:
        'the dependency index (roadmap Phase 5) that would resolve regeneration impact is ' +
        'not wired. DependencyResolver.getAffected is NOT consulted: it mutates its own ' +
        'capture map on every query, which a planner may not do (ADR-0322 §2). KNOWN and NOT ' +
        'element-grained: removing the wall drops its own fragments and every opening void ' +
        'baked into them, and re-runs the join resolver over the cluster it leaves ' +
        '(WallRebuildCoordinator → WallFragmentBuilder). Those are render artefacts with no ' +
        'element id, so they are named here rather than invented as regeneration entries.',
    };
  }

  // ── Assembly + hashing ───────────────────────────────────────────────────────────────

  private assemble(input: {
    command: WallDeleteCommand;
    stateHash: string;
    direct: ImpactDetermination;
    indirect: ImpactDetermination;
    changed: string[];
    excluded: string[];
    topologyRemoved: string[];
    topologyModified: string[];
    refused: ConsequenceRefusal[];
    undetermined: UndeterminedImpact[];
    validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
  }): ConsequencePlan {
    const changed = sortedUnique(input.changed);
    const changedSet = new Set(changed);
    const excluded = sortedUnique(input.excluded.filter((e) => !changedSet.has(e)));
    const topologyRemoved = sortedUnique(input.topologyRemoved);
    const topologyModified = sortedUnique(
      input.topologyModified.filter((t) => !topologyRemoved.includes(t)),
    );

    const body = {
      command: { type: input.command.type, payload: input.command.payload },
      direct: input.direct,
      indirect: input.indirect,
      changed,
      excluded,
      topology: {
        // `added` is the literal [] — a delete creates nothing. C70 F-INV-2 (a delete never
        // answers with an empty cascade) is STRUCTURAL here: every branch that resolves the
        // subject pushes it into `removed`, and every branch that does not returns a REFUSAL
        // or an UNDETERMINED plan rather than an empty determined one.
        added: [] as ElementId[],
        removed: topologyRemoved,
        modified: topologyModified,
      },
      validation: input.validation,
      regeneration: {
        required: [] as ElementId[],
        skipped: [] as { id: ElementId; reason: string }[],
      },
      // NO `metrics` key, structurally: MetricTransition cannot type a delete's determined
      // absence (see `metricsUnexpressible`), so no parameter exists that could put one on
      // this plan.
      //
      // `refused` is NOT structurally empty on this row — unlike the hosted-opening delete
      // family. It carries the two canExecute refusals both commit paths really return, in
      // their own words. What it never carries is a refusal on dependency grounds: measured,
      // no commit path declines a wall delete because it hosts openings, is joined, or
      // bounds a room.
      refused: input.refused,
      undetermined: input.undetermined,
    };

    const planHash = fnv1a(stableStringify({ ...body, stateHash: input.stateHash }));
    const planId = `plan-wall.delete-${planHash}`;

    return {
      planId,
      planHash,
      stateHash: input.stateHash,
      ...body,
    };
  }
}
