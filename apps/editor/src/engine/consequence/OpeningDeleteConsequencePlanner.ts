// OpeningDeleteConsequencePlanner — the FIFTH composed family: delete a hosted
// opening (door/window) from its host wall.
//
// ── THE FAMILY, AND WHY IT IS ONE FAMILY (C78 §19.1) ─────────────────────────────────
// The C69 register carries TWO consequential delete-class verbs for wall-hosted openings,
// and both name the SAME atomic operation:
//
//   `door.delete`    (plugins/door DeleteDoorHandler — payload `{ doorId }`)
//   `window.delete`  (plugins/window DeleteWindowHandler — payload `{ windowId }`)
//
// They differ in exactly one thing: which standalone store C15 §8.1's dual-write also
// touches. Planning them as two families would mean two planners that must be kept
// identical by hand, and the moment they drifted a door and a window on the same wall
// would get different answers to "what does removing this do?". One semantic verb
// (`opening.delete`), two rules — the same shape the move row already uses for
// `door.setOffset` / `window.setOffset` (e34d2543) and the create row for its four
// spellings (78394be2). A third rule accepts the SEMANTIC spelling directly, because the
// AI/parity surfaces and the certification harnesses dispatch it (the `opening.move` and
// `wall.create` precedent).
//
// NOT in this family, and deliberately so:
//   `wall.delete`      — deletes the HOST. Its cascade is the host's children, its joined
//                        walls' miters and its bounding rooms; a different relationship
//                        set, a different planner, and the next family on the list.
//   `element.delete`   — the generic type-dispatching verb (plugins/view, legacy stack).
//                        It resolves to a kind at runtime; giving it to this planner would
//                        plan a hosted-opening delete for a beam.
//   `wall.removeOpening` — DOES NOT EXIST. Grepped: no such bus verb is registered
//                        anywhere. The wall-side removal happens inside
//                        DeleteElementCommand's window/door branches, not under its own
//                        verb, which is exactly why the divergence declared below is real.
//
// ── THE TWO COMMIT PATHS, AND WHY THE HOST-SIDE WRITE IS DECLARED, NOT PREDICTED ─────
// Source-verified, because this is the fact that shapes the whole plan:
//
//   packages/command-registry/src/walls/DeleteElementCommand.ts — the AUTHORITATIVE path
//   (the legacy commandManager one, ~1046 LOC). Its window/door branches find the opening
//   on the host (`wall.openings.find(op => op.elementId === id)`), remove it from the
//   host, purge the element's graph edges
//   (`semanticGraphManager.removeAllRelationshipsForElement`) and restore them VERBATIM on
//   undo — the §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES shape landed in 3ee632f6.
//
//   plugins/door DeleteDoorHandler / plugins/window DeleteWindowHandler — what the BUS
//   verbs `door.delete` / `window.delete` actually dispatch. `affectedStores = ['door']`
//   / `['window']`, and `execute` is a single `delete draft[cmd.doorId]`. The host wall is
//   never touched and the graph is never purged.
//
// So a dispatched `door.delete` deletes the standalone row and leaves the opening RECORD
// (and therefore the void in the host mesh) in place. That is the same detached-plugin-
// store shape §FIX-CREATE-LIVENESS-LIE and §FIX-DEAD-MOVE-VERB-REFUSE fixed for
// `door.create` / `door.move` by making those verbs REFUSE and name the live path — and
// the delete pair is the one instance of it that has NOT been fixed. This planner does not
// fix it either (that is a handler change in plugins/, not a reasoning change), but it
// REFUSES TO HIDE IT: the host-side write is declared as a typed UNDETERMINED naming both
// paths, which is C78 §6.4 disposition (iv) applied to the same dual-store rule the create
// row declares in the other direction.
//
// ── THE C78 §6.4 DISPOSITIONS, ASSIGNED ──────────────────────────────────────────────
//   the opening itself           → (i) DETERMINED-affected. `topology.removed = [id]` on
//                                  every branch that resolves a host. C70 F-INV-2: a
//                                  delete never answers with an empty cascade, and the
//                                  removal of the subject is the floor of that cascade.
//   host wall (`hostedBy`)       → (i) DETERMINED-affected SEMANTICALLY — an opening
//                                  record LIVES on the wall (C15 §1), so deleting the
//                                  element necessarily voids a member of `openings[]` and
//                                  `childrenIds`. Which HANDLER performs that write is the
//                                  (iv) declaration above.
//   sibling openings             → (ii) re-evaluated and DETERMINED-UNAFFECTED. Removing
//                                  an opening only FREES span: no sibling's 1-D occupancy
//                                  interval moves, and no commit path relocates a sibling
//                                  on delete. They are `excluded` — CHECKED and unchanged —
//                                  never omitted (ADR-0322 §6, C78 §1.4). This is also why
//                                  there is NO occupancy seam on this row at all (see
//                                  below).
//   host wall STRUCTURE          → (ii) re-evaluated via the violation diff (clone →
//                                  REMOVE the opening from the CLONE → validate → diff).
//                                  On this row `violationsResolved` is the interesting
//                                  half — the exact mirror of the create row's
//                                  `violationsCreated`. Both are reported.
//   rooms bounded by the host    → (iii) UNAFFECTED BY CONSTRUCTION — a room ring traces
//                                  wall CENTRELINES; an opening is a void in the solid
//                                  (C15 §2). Declared, with its reason.
//   RECORDED graph relationships → (i)/(iv) via the `relationships` seam — see below.
//   regeneration                 → declared blind spot (NO_DEPENDENCY_INDEX), as on all
//                                  four composed rows and for the same source-verified
//                                  reasons.
//
// ── WHY THERE IS NO OCCUPANCY SEAM (the create row had exactly one; this row has none) ─
// The create row injects `canPlace` because a create can COLLIDE and the commit path
// refuses on that. A delete cannot collide with anything: the operation strictly removes
// an interval from the host's occupancy. Declaring an occupancy seam here would advertise
// a question this family does not ask, and — worse — would leave a production injection
// point that the composition would have to fill with a reader whose verdict is never
// consulted. The `refused` array is a literal `[]` in `assemble` with NO parameter that
// could populate it, and that is a CHECKABLE CLAIM, not an omission: no branch of this
// planner refuses, because no commit path declines a hosted-opening delete on geometric
// grounds. "Cannot be found" is an UNDETERMINED, not a refusal.
//
// ── DISCOVERY IS FROM RECORDED RELATIONSHIPS ONLY (C78 §5.1) ─────────────────────────
// Two records, both read, neither re-derived:
//
//   1. `wall.openings[]` — the C15 §1 host-side record of the `hostedBy` edge. It is the
//      record, not a geometric re-derivation: the planner never re-computes which wall an
//      element "should" belong to from coordinates. When the payload names no host (and
//      neither live verb carries one — `DeleteDoorPayload` is `{ doorId }`), the reverse
//      direction has NO INDEX, so the planner performs a LINEAR SCAN OF THAT RECORD as the
//      honest substitute and declares `RELATIONSHIP_NOT_READABLE` when it cannot answer —
//      the resolution shape OpeningMoveConsequencePlanner already established for this
//      exact edge (C78 §4.2–§4.3), including the AMBIGUOUS case, which is declared rather
//      than resolved by picking the first hit.
//   2. `relationships.getRelationships(id)` — the semantic graph's recorded edges, the
//      ones DeleteElementCommand purges and restores verbatim. INJECTED and OPTIONAL.
//      ⚠ An ABSENT reader is `NO_DEPENDENCY_INDEX` and an EMPTY answer is
//      `RELATIONSHIP_NOT_RECORDED` — NEITHER is "there are no related elements" (C78 §1.4:
//      an empty index is UNDETERMINED, never unaffected). That distinction is the whole
//      reason this seam exists rather than the planner simply reporting the host.
//
// ── WHY THIS FILE LIVES IN apps/editor/src/engine (the composition layer) ────────────
// Identical to the other four planners' reason: the consequence CONTRACT is
// `@pryzm/command-bus` (L1), but this planner must reach `@pryzm/constraint-solver` (L2).
// apps/editor is L7, so every edge is DOWNWARD. Every heavyweight collaborator is INJECTED
// and every package import here is `import type` (erased), so the planner constructs and
// runs dependency-free in a plain node env.
//
// ── THE INVARIANT (ADR-0322 §2) ──────────────────────────────────────────────────────
// `plan()` MUST NOT mutate authoritative state. Every read is over the caller-supplied
// read-only `PlanningContext` views or over CLONES; the opening is removed from a FRESH
// clone of the host's opening list, never from the live record. G-REASON-01 (purity) and
// G-REASON-02 (determinism) are the gates.

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
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';

// The ONE stable serialisation, shared with the other four planners so all five hash with
// the same algorithm (ADR-0322 §6's one-algorithm rule applied to hashing).
import { stableStringify } from './WallMoveConsequencePlanner.js';

// ─── The command this planner answers for ────────────────────────────────────────────

/**
 * `opening.delete` as a SEMANTIC operation — remove hosted element `id` from whichever
 * wall records it in `openings[]`.
 *
 * `wallId` is OPTIONAL and, in practice, ABSENT: neither live verb carries a host
 * (`DeleteDoorPayload` is `{ doorId }`, `DeleteWindowPayload` is `{ windowId }`), so the
 * REVERSE-SCAN branch is the production path. Forwarded when a caller does supply it —
 * inventing one would move a real refusal path out of reach and replace it with a guess.
 *
 * `openingType` is carried for the declaration sentences only ('door' | 'window'); absent
 * is spoken as 'opening'. It is never used to decide anything geometric.
 */
export interface OpeningDeleteCommand {
  readonly type: 'opening.delete';
  readonly payload: {
    /** The hosted element id (`Opening.elementId`) — the identity the plan names. */
    readonly id: string;
    /** The host wall, when the caller knows it. Absent ⇒ resolved by reverse scan. */
    readonly wallId?: string;
    /** 'door' | 'window' — for the sentences; absent is spoken as 'opening'. */
    readonly openingType?: 'door' | 'window';
  };
}

// ─── Injected collaborators (the substrate, supplied by the composition root) ─────────

/**
 * The RECORDED relationship reader — `semanticGraphManager.getRelationships`, the SAME
 * index `DeleteElementCommand` captures verbatim before purging and restores verbatim on
 * undo (3ee632f6). Read-only: this planner calls `getRelationships` and nothing else, so
 * it cannot reach the capture map or any write surface.
 */
export interface RecordedRelationshipReader {
  getRelationships(elementId: string): readonly {
    readonly type?: string;
    readonly sourceId?: string;
    readonly targetId?: string;
  }[];
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
export interface OpeningDeletePlannerDeps {
  readonly relationships?: RecordedRelationshipReader;
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

// ─── The opening record, as this planner reads it ─────────────────────────────────────

/** The shape of `wall.openings[i]` this planner depends on (C15 §1) — read defensively,
 *  exactly as the other hosted-element planners read it: a missing field never becomes a
 *  `?? 0`, because a fabricated zero would print as a measured metric. */
interface OpeningRecord {
  readonly id?: string;
  readonly elementId?: string;
  readonly type?: 'window' | 'door';
  readonly offset?: number;
  readonly width?: number;
}

/** The element id an opening is known by on the bus — `elementId` first, `id` fallback. */
function openingElementId(o: OpeningRecord): string | undefined {
  return o.elementId ?? o.id;
}

// ─── The planner ──────────────────────────────────────────────────────────────────────

export class OpeningDeleteConsequencePlanner
  implements ConsequencePlanner<OpeningDeleteCommand>
{
  constructor(private readonly deps: OpeningDeletePlannerDeps = {}) {}

  async plan(
    command: OpeningDeleteCommand,
    context: PlanningContext,
  ): Promise<ConsequencePlan> {
    const { id } = command.payload;
    const kindWord = command.payload.openingType ?? 'opening';

    const wallView = context.getStore('wall');
    const allWalls = wallView ? ([...wallView.getAll()] as WallData[]) : [];

    // State hash — over exactly the authoritative state the plan is computed from, so a
    // stale approval (R6) is detectable. The WHOLE wall list is hashed, not just the host,
    // for the same reason the other four planners hash it: the host resolution itself is a
    // scan over that list, so a wall added or removed elsewhere changes the answer, and an
    // approval must not survive that.
    const stateHash = fnv1a(
      stableStringify({ openingDelete: command.payload, walls: allWalls }),
    );

    const undetermined: UndeterminedImpact[] = [];
    const changed: string[] = [];
    const excluded: string[] = [];
    const topologyRemoved: string[] = [];
    const topologyModified: string[] = [];

    // The element to be deleted is always the DIRECT subject. Unlike the create row, it is
    // the subject WHETHER OR NOT the host resolves: a delete of an element that cannot be
    // located is still a delete of that element, and the plan must name it.
    const direct = determined([id]);

    const bail = (
      reason: UndeterminedImpact['reason'],
      detail: string,
      scope: string,
    ): ConsequencePlan => {
      undetermined.push({ scope, reason, detail });
      undetermined.push(this.roomsUnaffected(id));
      undetermined.push(this.dualStoreUndetermined(id, kindWord));
      undetermined.push(this.relationshipsBranchWhenHostUnknown(id));
      undetermined.push(this.regenerationUndetermined(id));
      return this.assemble({
        command,
        stateHash,
        direct,
        indirect: {
          kind: 'undetermined',
          scope: `indirect impact (host wall + sibling openings) of deleting ${kindWord} ${id}`,
          reason,
          detail,
        },
        changed,
        excluded,
        topologyRemoved,
        topologyModified,
        undetermined,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    };

    // ── Branch 0: resolve the host from the RECORDED edge (C78 §5.1) ──────────────────
    const host = this.resolveHost(wallView, allWalls, command.payload.wallId, id);
    if (host.kind === 'undetermined') {
      return bail(host.undetermined.reason, host.undetermined.detail, host.undetermined.scope);
    }
    const { wall, siblings } = host;
    const wallId = String(wall.id);

    // ── Branch 1: the REMOVAL itself — DETERMINED on both commit paths ────────────────
    topologyRemoved.push(id);
    changed.push(id);
    // The HOST changes too: the opening record LIVES on the wall (C15 §1/§6), so deleting
    // the element necessarily voids a member of `openings[]` and `childrenIds`. WHICH
    // handler performs that write is the dual-store declaration below — a property of the
    // handler, not of readable state.
    changed.push(wallId);
    topologyModified.push(wallId);

    // The typed BEFORE→AFTER lines (R5) this row CANNOT carry — declared, not smuggled.
    // The natural mirror of the create row's metrics would be `before: <recorded value>,
    // after: undefined` — a DETERMINED absence: the element ceases to exist, which is a
    // different fact from "could not read the resulting value". But `MetricTransition.after`
    // is `number`, NON-optional (packages/command-bus consequence.ts — the type was built
    // for "no prior value", `before: number | undefined`, and never for a determined
    // absence). The honest options were a fabricated `after: 0` (which would print as a
    // measured metric claiming the offset BECOMES zero), a lying cast (U-INV-5), or NO
    // metric line plus the typed declaration below. The removal itself already travels in
    // `topology.removed`; widening MetricTransition is an L1 contract change that belongs
    // to command-bus, raised by name here rather than worked around.

    // ── Branch 2: SIBLINGS — considered, and DETERMINED UNAFFECTED ───────────────────
    // The positive half of the verdict (ADR-0322 §6): considered-and-determined-unchanged,
    // which is a different answer from not visited. A delete strictly REMOVES an interval
    // from the host's occupancy, so no sibling's [offset, offset+width] moves and no commit
    // path relocates one. There is no occupancy question to ask, so none is asked — and
    // saying that out loud is the point of this branch existing at all.
    for (const s of siblings) {
      const sid = openingElementId(s);
      if (sid !== undefined) excluded.push(sid);
    }

    // ── Branch 3: RECORDED graph relationships (C78 §5.1) ────────────────────────────
    const rel = this.relationshipsBranch(id, wallId);
    if (rel.kind === 'undetermined') undetermined.push(rel.undetermined);
    else for (const cid of rel.counterparts) changed.push(cid);

    // ── Branch 4: HOST STRUCTURE — the violation diff over the proposed host ─────────
    const violation = this.violationsBranch(context, wallId, id, kindWord);
    if (violation.kind === 'undetermined') undetermined.push(violation.undetermined);

    // ── Branches 5–8: the declared dispositions ──────────────────────────────────────
    undetermined.push(this.metricsUnexpressible(id, kindWord));
    undetermined.push(this.roomsUnaffected(id));
    undetermined.push(this.dualStoreUndetermined(id, kindWord));
    undetermined.push(this.regenerationUndetermined(id));

    return this.assemble({
      command,
      stateHash,
      direct,
      indirect: determined([wallId]),
      changed,
      excluded,
      topologyRemoved,
      topologyModified,
      undetermined,
      validation: violation.validation,
    });
  }

  // ── Branch helpers ─────────────────────────────────────────────────────────────────

  /**
   * Resolve the HOST wall and the doomed opening's record from the C15 §1 RECORD.
   *
   * Deliberately the SAME two paths, the same order and the same typed answers as
   * `OpeningMoveConsequencePlanner.resolveHost`, because it is the SAME EDGE. Two planners
   * that resolved one relationship by two different rules would be the copy-drift defect
   * this subsystem keeps naming — a door would get one answer from the move row and
   * another from the delete row about which wall hosts it.
   *
   *   • `wallId` SUPPLIED — a direct `getById`, still fallible: the wall may be absent from
   *     the view, or may not host this element at all. A named-but-wrong host is
   *     `RELATIONSHIP_NOT_RECORDED` and does NOT fall back to a scan — a fallback would let
   *     a wrong `wallId` produce a confident plan about a different wall's opening.
   *   • `wallId` ABSENT (the production case) — the REVERSE traversal, which has NO INDEX.
   *     A linear scan of the record, ordered by id so the answer is deterministic, with the
   *     AMBIGUOUS case declared rather than resolved by taking the first hit.
   */
  private resolveHost(
    wallView: ReturnType<PlanningContext['getStore']>,
    allWalls: readonly WallData[],
    wallId: string | undefined,
    elementId: string,
  ):
    | {
        kind: 'determined';
        wall: WallData;
        opening: OpeningRecord;
        siblings: readonly OpeningRecord[];
      }
    // `detail` narrowed to REQUIRED: every bail this resolver produces carries its full
    // sentence, and `bail` forwards it into the indirect arm, whose `detail` is
    // non-optional — the wider `detail?: string` would force a fabricated fallback there.
    | { kind: 'undetermined'; undetermined: UndeterminedImpact & { readonly detail: string } } {
    if (!wallView) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `the host wall of opening ${elementId}`,
          reason: 'STALE_DERIVED_STATE',
          detail:
            'no wall store view is available; the opening RECORD lives on its host (C15 §1), ' +
            'so with no host record there is nothing to delete and nothing to reason about.',
        },
      };
    }

    const openingsOf = (w: WallData): readonly OpeningRecord[] =>
      Array.isArray((w as { openings?: unknown }).openings)
        ? ((w as unknown as { openings: OpeningRecord[] }).openings)
        : [];

    const find = (w: WallData): OpeningRecord | undefined =>
      openingsOf(w).find((o) => openingElementId(o) === elementId);

    if (wallId !== undefined) {
      const w = wallView.getById(wallId) as WallData | null | undefined;
      if (!w) {
        return {
          kind: 'undetermined',
          undetermined: {
            scope: `the host wall ${wallId} of opening ${elementId}`,
            reason: 'STALE_DERIVED_STATE',
            detail: `the payload names host wall ${wallId}, which the wall store view does not hold`,
          },
        };
      }
      const o = find(w);
      if (!o) {
        return {
          kind: 'undetermined',
          undetermined: {
            scope: `the hosting of opening ${elementId} by wall ${wallId}`,
            reason: 'RELATIONSHIP_NOT_RECORDED',
            detail:
              `the payload names wall ${wallId} as the host of ${elementId}, but that wall's ` +
              "openings[] does not contain it. The hostedBy edge the command asserts is not " +
              'recorded on the host, so the delete cannot be planned against it. No fallback ' +
              'search is performed: silently deleting the opening from whichever OTHER wall ' +
              'does contain it would remove a void the caller never named.',
          },
        };
      }
      return {
        kind: 'determined',
        wall: w,
        opening: o,
        siblings: openingsOf(w).filter((x) => openingElementId(x) !== elementId),
      };
    }

    // ── The reverse traversal, with no index (C78 §4.2–§4.3) ────────────────────────
    // Sorted by id first, so the scan order — and therefore which ambiguity is reported
    // first — is deterministic (G-REASON-02). The store's iteration order is not
    // contractually stable, and the determinism gate drives exactly this with the wall
    // list presented in both orders.
    const ordered = allWalls
      .filter((w) => typeof (w as { id?: unknown }).id === 'string')
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const hits: { wall: WallData; opening: OpeningRecord }[] = [];
    for (const w of ordered) {
      const o = find(w);
      if (o) hits.push({ wall: w, opening: o });
    }

    if (hits.length === 0) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `the host wall of opening ${elementId}`,
          reason: 'RELATIONSHIP_NOT_READABLE',
          detail:
            `no wall in the store view carries ${elementId} in its openings[]. The hostedBy ` +
            'edge is written host-side only (C15 §1) and has no reverse index (C78 §4.2–§4.3), ' +
            'so this planner performed a linear scan of the RECORD — the honest substitute for ' +
            'the missing index — and found no host. The element may already be deleted, may be ' +
            'hosted on a level not loaded in this view, or the edge may never have been ' +
            'written. Which of those it is, is NOT determined — and note that "already gone" ' +
            'and "cannot be seen from here" are the same empty answer, which is precisely why ' +
            'this is UNDETERMINED and not a determined no-op.',
        },
      };
    }

    if (hits.length > 1) {
      const ids = sortedUnique(hits.map((h) => String(h.wall.id)));
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `the host wall of opening ${elementId}`,
          reason: 'RELATIONSHIP_NOT_READABLE',
          detail:
            `${ids.length} walls (${ids.join(', ')}) each carry ${elementId} in their openings[]. ` +
            'A hosted element has exactly ONE host by contract (C15 §1), so this is a corrupt ' +
            'hostedBy edge. The planner does NOT pick one: deleting the record from an ' +
            'arbitrarily-chosen host would leave the other void in place and report a ' +
            'confident plan for a cleanup that is a coin flip.',
        },
      };
    }

    const hit = hits[0]!;
    return {
      kind: 'determined',
      wall: hit.wall,
      opening: hit.opening,
      siblings: openingsOf(hit.wall).filter((x) => openingElementId(x) !== elementId),
    };
  }

  /**
   * The RECORDED-relationship branch (C78 §5.1). Three outcomes, and the difference
   * between the last two is C78 §1.4 exactly:
   *
   *   reader ABSENT  → `NO_DEPENDENCY_INDEX`. Which edges reference this element is NOT
   *                    read. That is not "there are none".
   *   reader EMPTY   → `RELATIONSHIP_NOT_RECORDED`. C15 §1 requires a hostedBy edge for
   *                    every hosted opening, so an empty answer is more likely an unwritten
   *                    edge than a genuinely unrelated element — and an empty index reported
   *                    as "unaffected" is the silence-equals-empty defect (C70 L-INV-1).
   *   reader THREW   → `NO_DEPENDENCY_INDEX` with the throw named, never a silent skip.
   *   reader ANSWERS → the counterparts are DETERMINED-affected: every one of those edges
   *                    is purged on commit (and restored verbatim on undo — the 3ee632f6
   *                    shape), so an element on the other end of one is an element whose
   *                    recorded topology changes. The HOST is normally among them; the
   *                    plan's own `sortedUnique` dedupes it against `changed`.
   */
  private relationshipsBranch(
    elementId: string,
    wallId: string,
  ):
    | { kind: 'determined'; counterparts: readonly string[] }
    | { kind: 'undetermined'; undetermined: UndeterminedImpact } {
    const scope = `the recorded graph relationships of ${elementId} (purged on delete, restored verbatim on undo)`;
    if (!this.deps.relationships) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope,
          reason: 'NO_DEPENDENCY_INDEX',
          detail:
            'no recorded-relationship reader is composed in this runtime ' +
            '(semanticGraphManager.getRelationships — the SAME index DeleteElementCommand ' +
            'captures verbatim before purging). WHICH elements hold an edge to this one is ' +
            'NOT read — that is not "there are none" (C78 §1.4). The host below is reported ' +
            'from the C15 §1 openings[] record instead, which is a different record and does ' +
            'not cover boundedBy, supports or any other edge the graph may hold.',
        },
      };
    }

    let records: readonly { type?: string; sourceId?: string; targetId?: string }[];
    try {
      records = this.deps.relationships.getRelationships(elementId);
    } catch {
      return {
        kind: 'undetermined',
        undetermined: {
          scope,
          reason: 'NO_DEPENDENCY_INDEX',
          detail: 'the recorded-relationship reader threw while enumerating this element\'s edges',
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
            `the relationship index holds NO edge for ${elementId}. C15 §1 gives every hosted ` +
            `opening a hostedBy edge to its host (here ${wallId}), so an EMPTY answer is more ` +
            'likely an edge that was never written than an element genuinely related to ' +
            'nothing. An empty index is UNDETERMINED, never "unaffected" (C78 §1.4) — the ' +
            'delete will still purge whatever the graph does hold at commit time.',
        },
      };
    }

    const counterparts = records
      .flatMap((r) => [r.sourceId, r.targetId])
      .filter((x): x is string => typeof x === 'string' && x.length > 0 && x !== elementId);
    return { kind: 'determined', counterparts };
  }

  /** The relationships declaration used on the BAIL paths, where no host was resolved and
   *  therefore no `getRelationships` call is meaningful to make. Kept as its own entry
   *  rather than reusing the branch above, because the reason differs: it is not that the
   *  index is missing, it is that the SUBJECT could not be located to query it about. */
  private relationshipsBranchWhenHostUnknown(elementId: string): UndeterminedImpact {
    return {
      scope: `the recorded graph relationships of ${elementId}`,
      reason: 'NO_DEPENDENCY_INDEX',
      detail:
        'the host could not be resolved (see the entry above), so the recorded-relationship ' +
        'index was NOT queried. Reporting an empty edge set here would state as a measured ' +
        'fact something no reader was asked (C78 §1.4).',
    };
  }

  /**
   * The before/after violation diff: clone stores → REMOVE the opening from the CLONED
   * host's openings array → validateAll before/after → diff.
   *
   * On the delete row `violationsResolved` is the half that normally carries bytes — the
   * exact mirror of the create row's `violationsCreated` — and BOTH are reported, because
   * a delete can also CREATE a violation (removing the only egress opening from a room is
   * the standing example).
   */
  private violationsBranch(
    context: PlanningContext,
    wallId: string,
    elementId: string,
    kindWord: string,
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
          scope: `constraint validation of deleting ${kindWord} ${elementId} from wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            "no constraint validator is composed in this runtime; whether the host wall's " +
            'remaining structure stays valid — and which violations the removal RESOLVES — ' +
            'cannot be computed',
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

    // The AFTER clone: the host with a FRESH openings array that omits the doomed record.
    const afterWalls = beforeWalls.map((w) => {
      if (String(w.id) !== wallId) return w;
      const list = Array.isArray(w.openings) ? (w.openings as OpeningRecord[]) : [];
      return {
        ...w,
        openings: list.filter((o) => openingElementId(o) !== elementId).map((o) => ({ ...o })),
      };
    });

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
          scope: `constraint validation of deleting ${kindWord} ${elementId} from wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the constraint validator threw while diffing the opening delete',
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
   * The R5 metric lines this row cannot carry — DECLARED (C78 §1.4: what was not stated
   * must be distinguishable from what was measured). `MetricTransition.after` is `number`,
   * NON-optional (packages/command-bus consequence.ts): the type expresses "no prior
   * value" (`before: number | undefined` — the create row's shape) but has no way to say
   * a determined ABSENCE after the operation. Emitting `after: 0` would print as a
   * measured claim that the offset becomes zero; a cast would be U-INV-5. So the recorded
   * offset/width travel in NO metric line, and this entry says so, naming the contract
   * seam that would have to widen (an L1 command-bus change, outside this family).
   */
  private metricsUnexpressible(elementId: string, kindWord: string): UndeterminedImpact {
    return {
      scope: `the offset/width BEFORE→AFTER metric lines of deleting ${kindWord} ${elementId}`,
      reason: 'AGGREGATE_SCOPE_UNSUPPORTED',
      detail:
        'the plan carries NO MetricTransition lines for this delete, deliberately: the ' +
        'contract type MetricTransition.after is a non-optional number (packages/command-bus ' +
        "consequence.ts), built for \"no prior value\" (before: number | undefined) and unable " +
        'to express a determined absence (after: undefined — the element ceases to exist, ' +
        'which is a different fact from "could not read the resulting value"). A fabricated ' +
        'after: 0 would print as a measured metric; a cast would lie to the type system ' +
        '(U-INV-5). The removal itself is carried in topology.removed; widening ' +
        'MetricTransition is an L1 contract change that belongs to command-bus.',
    };
  }

  /** C78 §6.4 disposition (iii) — rooms UNAFFECTED BY CONSTRUCTION, declared (see the move
   *  planner's identical entry for why a determined fact travels in `undetermined`: the
   *  alternative — emitting nothing — is C70 L-INV-1's silence-equals-empty defect). */
  private roomsUnaffected(elementId: string): UndeterminedImpact {
    return {
      scope: `room boundaries and areas under the deletion of opening ${elementId}`,
      reason: 'AGGREGATE_SCOPE_UNSUPPORTED',
      detail:
        'DISPOSITION (iii), C78 §6.4 — UNAFFECTED BY CONSTRUCTION, and stated rather than left ' +
        'as an absence. A room ring is traced from wall CENTRELINES; a hosted opening is a void ' +
        'cut into the wall SOLID (C15 §2) and contributes no boundary segment. Removing one ' +
        'therefore cannot move any room polygon, area or perimeter. No room-geometry predictor ' +
        'is consulted, deliberately. (Room OCCUPANCY rules that count egress openings are a ' +
        'VALIDATION question, and they are answered by the violation diff above, not here.)',
    };
  }

  /**
   * C78 §6.4 disposition (iv) — the C15 §8.1 dual-store row, UNDETERMINED with reason, and
   * on THIS row it is the sharpest entry in the plan: the two commit paths disagree about
   * the HOST-side write, not merely about the standalone one.
   */
  private dualStoreUndetermined(elementId: string, kindWord: string): UndeterminedImpact {
    return {
      scope: `which stores the dispatched handler actually writes when deleting ${elementId} (the C15 §8.1 dual-write)`,
      reason: 'RELATIONSHIP_NOT_READABLE',
      detail:
        `DISPOSITION (iv), C78 §6.4. A committed ${kindWord} delete must write TWO places: the ` +
        'host wall.openings[] entry (the void geometry, plus the childrenIds member) and the ' +
        'standalone doorStore/windowStore row (the frame mesh). The two commit paths DISAGREE ' +
        'about the first: packages/command-registry DeleteElementCommand — the authoritative ' +
        'path — removes the opening from the host AND purges the graph edges AND restores them ' +
        'verbatim on undo, while the dispatched bus handlers (plugins/door DeleteDoorHandler, ' +
        "plugins/window DeleteWindowHandler) declare affectedStores ['door'] / ['window'] and " +
        'delete ONLY the standalone row, leaving the opening record — and therefore the void in ' +
        'the host mesh — in place. That is a property of the HANDLER, not of readable state, so ' +
        'it is NOT predicted here: the plan above states the SEMANTIC consequence (the record ' +
        'lives on the wall, so the wall changes), and this entry names the divergence so the R4 ' +
        'independent read-back can measure which path actually ran. It is the same detached- ' +
        'plugin-store shape §FIX-CREATE-LIVENESS-LIE and §FIX-DEAD-MOVE-VERB-REFUSE closed for ' +
        'door.create / door.move, still open on the delete pair.',
    };
  }

  /** Regeneration — declared blind spot, as on all four earlier composed rows (same two
   *  source-verified reasons: getAffected answers determined unconditionally on its
   *  non-delete branch, and it writes its capture map on every query, which a planner may
   *  not do — ADR-0322 §2). */
  private regenerationUndetermined(elementId: string): UndeterminedImpact {
    return {
      scope: `regeneration of elements dependent on opening ${elementId}`,
      reason: 'NO_DEPENDENCY_INDEX',
      detail:
        'the dependency index (roadmap Phase 5) that would resolve regeneration impact is not ' +
        'wired. DependencyResolver.getAffected is NOT consulted: it mutates its own capture map ' +
        'on every query, which a planner may not do (ADR-0322 §2). KNOWN and NOT element- ' +
        'grained: removing the opening un-bakes the void from the host mesh and drops the frame ' +
        'mesh derived from the standalone row (C78 §6.4 disposition (i), C15 §2/§3 — ' +
        'WallRebuildCoordinator → WallFragmentBuilder). Those are render artefacts with no ' +
        'element id, so they are named here rather than invented as regeneration entries.',
    };
  }

  // ── Assembly + hashing ───────────────────────────────────────────────────────────────

  private assemble(input: {
    command: OpeningDeleteCommand;
    stateHash: string;
    direct: ImpactDetermination;
    indirect: ImpactDetermination;
    changed: string[];
    excluded: string[];
    topologyRemoved: string[];
    topologyModified: string[];
    undetermined: UndeterminedImpact[];
    validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
  }): ConsequencePlan {
    const changed = sortedUnique(input.changed);
    const changedSet = new Set(changed);
    const excluded = sortedUnique(input.excluded.filter((e) => !changedSet.has(e)));
    const topologyRemoved = sortedUnique(input.topologyRemoved);
    const topologyModified = sortedUnique(input.topologyModified.filter((t) => !topologyRemoved.includes(t)));

    const body = {
      command: { type: input.command.type, payload: input.command.payload },
      direct: input.direct,
      indirect: input.indirect,
      changed,
      excluded,
      topology: {
        // C70 F-INV-3 clause 3 does NOT apply to this row and must not be transcribed here:
        // `added` is the literal [] (a delete creates nothing), and `removed` is the one
        // section this family exists to populate. C70 F-INV-2 is the invariant that DOES
        // apply — a delete never answers with an empty cascade — and it is structural:
        // every branch that resolves a host pushes the subject into `removed`, and every
        // branch that does not returns an UNDETERMINED plan rather than an empty determined
        // one.
        added: [] as ElementId[],
        removed: topologyRemoved,
        modified: topologyModified,
      },
      validation: input.validation,
      regeneration: {
        required: [] as ElementId[],
        skipped: [] as { id: ElementId; reason: string }[],
      },
      // NO `metrics` key, structurally: MetricTransition cannot type a delete's
      // determined absence (see the branch-1 comment and `metricsUnexpressible`),
      // so no parameter exists that could put one on this plan.
      // A literal [] with NO parameter that could populate it — see the header: no branch
      // of this planner refuses, because no commit path declines a hosted-opening delete on
      // geometric grounds. "Cannot be found" is an UNDETERMINED, not a refusal.
      refused: [] as ConsequenceRefusal[],
      undetermined: input.undetermined,
    };

    const planHash = fnv1a(stableStringify({ ...body, stateHash: input.stateHash }));
    const planId = `plan-opening.delete-${planHash}`;

    return {
      planId,
      planHash,
      stateHash: input.stateHash,
      ...body,
    };
  }
}
