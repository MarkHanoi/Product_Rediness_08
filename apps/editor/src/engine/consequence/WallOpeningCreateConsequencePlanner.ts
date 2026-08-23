// WallOpeningCreateConsequencePlanner — the FOURTH composed family: create a hosted
// opening (door/window) on a host wall.
//
// ── THE FAMILY, AND WHY IT IS ONE FAMILY (C78 §19.1) ─────────────────────────────────
// The C69 register carries THREE consequential create-class verbs for wall-hosted
// openings, plus one unclassified spelling, and all four name the SAME atomic operation:
//
//   `wall.opening.create`  (plugins/wall CreateWallOpeningLegacyAdapter — the live
//                           PRYZM3 adapter; payload { wallId, openingData })
//   `wall.createOpening`   (plugins/wall CreateWallOpeningHandler — the AUTHORITATIVE
//                           path both refusals below cite; payload { wallId, opening })
//   `door.create`          (REFUSES — §FIX-CREATE-LIVENESS-LIE: it wrote the detached
//                           plugin door store; the refusal names wall.createOpening
//                           with `{ wallId, opening: { id, type: 'door', offset, width,
//                           height, sillHeight, elementId } }` as the commit path)
//   `window.create`        (REFUSES — the window twin, same refusal shape)
//
// A refused-but-semantic verb is still a QUESTION the consequence surface must answer —
// the `wall.move` precedent (L-49), applied to this family exactly as it was applied to
// `door.move`/`window.move` (the e34d2543 landing). The refusal text is what fixes the
// SEMANTICS: a door "is created by ONE atomic command", so every spelling here maps onto
// one create question. The old two-step choreography (`wall.createOpening` then
// `door.create { openingId }`) lives only in unregistered plugin tools; the register's
// own documentation of the family is the one-command form, and this planner answers for
// that form.
//
// ── WHY REFUSE-NOT-REFIT — the commit path decides, not the move row's clamp ─────────
// The move row (OpeningMoveConsequencePlanner) has a REFIT branch, because the offset
// handlers clamp (C15 §5). The CREATE commit path does NOT clamp: `CreateWallOpening`'s
// canExecute/execute run `wallOccupancyStore.canPlace` and REFUSE on every invalid arm —
// bounds and overlap alike — and reject a duplicate opening id before that. A planner
// that predicted a clamped landing for a create would promise an offset the handler will
// never write (the G-REASON-03 divergence class, manufactured at the planner). So this
// planner mirrors the commit rule exactly: `canPlace` is the ONE occupancy authority,
// its verdict is refuse-or-proceed, and there is no clamp seam at all.
//
// ── THE C78 §6.4 DISPOSITIONS, ASSIGNED (create phase of the same relationships) ─────
//   host wall (`hostedBy`)     → (ii) re-evaluated and MAY REFUSE — the span must fit
//                                inside the host and beside its siblings. This is the
//                                branch that refuses, with both numbers.
//   sibling openings           → (ii) re-evaluated — the collision question. A sibling
//                                checked and clear is `excluded`, never omitted.
//   host wall STRUCTURE        → (ii) re-evaluated via the violation diff (clone →
//                                append the opening to the CLONE → validate → diff).
//   rooms bounded by the host  → (iii) UNAFFECTED BY CONSTRUCTION — a room ring traces
//                                wall CENTRELINES; an opening is a void in the solid
//                                (C15 §2). Declared, with its reason.
//   the DOOR/WINDOW store row  → (iv) UNDETERMINED — C15 §8.1's dual-store rule: the
//                                standalone record is written by the HANDLER (the
//                                authoritative path writes it, the PRYZM3 adapter does
//                                not), which is not state this planner can read.
//   regeneration               → declared blind spot (NO_DEPENDENCY_INDEX), as on all
//                                three composed rows and for the same source-verified
//                                reasons.
//
// ── C70 F-INV-3, third clause, structural ────────────────────────────────────────────
// No branch of this planner emits a `topology.removed` entry, ever: `removed` is a
// literal `[]` in `assemble` with no parameter that could populate it. A create that
// collides is REFUSED naming both spans — the sibling is never moved aside and never
// deleted to make room.
//
// ── WHY THIS FILE LIVES IN apps/editor/src/engine (the composition layer) ────────────
// Identical to the other three planners' reason: the consequence CONTRACT is
// `@pryzm/command-bus` (L1), but this planner must reach `@pryzm/geometry-wall` (L2, the
// occupancy authority) and `@pryzm/constraint-solver` (L2). apps/editor is L7, so every
// edge is DOWNWARD. Every heavyweight collaborator is INJECTED and every package import
// here is `import type` (erased), so the planner constructs and runs dependency-free in
// a plain node env.
//
// ── THE INVARIANT (ADR-0322 §2) ──────────────────────────────────────────────────────
// `plan()` MUST NOT mutate authoritative state. Every read is over the caller-supplied
// read-only `PlanningContext` views or over CLONES; the proposed opening is appended to
// a FRESH clone of the host's opening list, never to the live record. G-REASON-01
// (purity) and G-REASON-02 (determinism) are the gates.

import type {
  ConsequencePlan,
  ConsequencePlanner,
  PlanningContext,
  ImpactDetermination,
  UndeterminedImpact,
  ConsequenceRefusal,
  ViolationRef,
  ElementId,
  MetricTransition,
} from '@pryzm/command-bus';

// Type-only — erased at runtime.
import type { WallData, CanPlaceRefusalCode } from '@pryzm/geometry-wall';
import type { ValidationResult, ConstraintContext } from '@pryzm/constraint-solver/compliance';

// The ONE stable serialisation, shared with the other three planners so all four hash
// with the same algorithm (ADR-0322 §6's one-algorithm rule applied to hashing).
import { stableStringify } from './WallMoveConsequencePlanner.js';

// ─── The command this planner answers for ────────────────────────────────────────────

/**
 * `wall.opening.create` as a SEMANTIC operation — create a hosted element (door/window)
 * on host wall `wallId`, occupying the span `[offset, offset + width]` along the host
 * baseline (C15 §1: `offset` is the LEFT edge, metres).
 *
 * `wallId` is REQUIRED, unlike the move row's optional host: every spelling of this
 * family carries it (a create cannot be resolved by reverse scan — there is nothing on
 * any wall to find yet), so a missing host is a malformed request, not a missing index.
 *
 * `id` is the hosted ELEMENT id (`Opening.elementId`) — the identity the bus speaks.
 * `openingId` is the wall-side opening record id when the caller pre-generated one (the
 * adapter and legacy spellings do; the plan tools mint both ids before dispatch). The
 * planner never mints an id: a payload with no stable identity is refused by the
 * normaliser, because a plan whose subject id changed between two runs could not be
 * byte-deterministic (G-REASON-02) and could not bind an approval.
 */
export interface WallOpeningCreateCommand {
  readonly type: 'wall.opening.create';
  readonly payload: {
    /** The hosted element id (`Opening.elementId`) — the identity the plan names. */
    readonly id: string;
    /** The host wall. REQUIRED — every spelling carries it. */
    readonly wallId: string;
    /** The wall-side opening record id, when the caller pre-generated one. */
    readonly openingId?: string;
    /** 'door' | 'window' — carried for the refusal sentences; absent is spoken as 'opening'. */
    readonly openingType?: 'door' | 'window';
    /** The proposed LEFT-EDGE offset along the host baseline, metres. */
    readonly offset: number;
    /** The opening's authored width, metres. */
    readonly width: number;
    readonly height?: number;
    readonly sillHeight?: number;
  };
}

// ─── Injected collaborators (the substrate, supplied by the composition root) ─────────

/**
 * The OCCUPANCY authority — `WallOccupancyStore.canPlace`, the SAME function the commit
 * path (`CreateWallOpening.canExecute` AND its race-defensive `execute` re-check) calls.
 * One rule, one epsilon, one answer: a planner verdict and a handler verdict that
 * disagreed about the same span on the same wall would be two rival implementations of
 * C15 §5's occupancy — the copy-drift defect. Its invalid arms carry the closed
 * `CanPlaceRefusalCode`, which the refusals below carry outward (§REFUSAL-IDENTITY).
 */
export interface OpeningCreateOccupancyReader {
  canPlace(
    wall: WallData,
    offsetM: number,
    widthM: number,
    excludeId?: string,
    /**
     * §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — the VOID's shape and its VERTICAL
     * extent. Widened here rather than left at four parameters because a narrowed seam that
     * cannot express the question the real validator asks is not a narrowing, it is a
     * DIFFERENT validator — and this interface's own doc says why that matters: *"two
     * implementations that disagreed about the same span on the same wall would be two rival
     * implementations of C15 §5's occupancy."* On a host carrying an authored elevation
     * outline, `WallOccupancyStore.canPlace` refuses a placement whose sill and height are
     * unstated, so a preview that could not state them would refuse every opening on a
     * profiled wall and report it as the model's verdict.
     */
    profile?: { openingProfile?: unknown; heightM?: number; sillHeightM?: number },
  ): { valid: boolean; conflictIds: string[]; code?: CanPlaceRefusalCode; reason?: string };
}

/** The mined violation core — `constraintEngine.validateAll` (clone → apply → diff). */
export interface ViolationValidator {
  validateAll(ctx: ConstraintContext): ValidationResult[];
}

/**
 * Everything the planner needs beyond the read-only `PlanningContext`. ALL OPTIONAL: an
 * ABSENT collaborator is the honest `ENGINE_NOT_AVAILABLE` case, declared as
 * `undetermined`, NOT silently skipped. The planner constructs and runs with `{}`.
 */
export interface WallOpeningCreatePlannerDeps {
  readonly occupancy?: OpeningCreateOccupancyReader;
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
 *  exactly as the move planner reads it: a missing field never becomes a `?? 0`. */
interface OpeningRecord {
  readonly id?: string;
  readonly elementId?: string;
  readonly type?: 'window' | 'door';
  readonly offset?: number;
  readonly width?: number;
}

/** Is `v` a finite number? Rejects NaN/Infinity. */
function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The element id an opening is known by on the bus — `elementId` first, `id` fallback. */
function openingElementId(o: OpeningRecord): string | undefined {
  return o.elementId ?? o.id;
}

// ─── The planner ──────────────────────────────────────────────────────────────────────

export class WallOpeningCreateConsequencePlanner
  implements ConsequencePlanner<WallOpeningCreateCommand>
{
  constructor(private readonly deps: WallOpeningCreatePlannerDeps = {}) {}

  async plan(
    command: WallOpeningCreateCommand,
    context: PlanningContext,
  ): Promise<ConsequencePlan> {
    const { id, wallId, offset, width } = command.payload;
    const kindWord = command.payload.openingType ?? 'opening';

    const wallView = context.getStore('wall');
    const allWalls = wallView ? ([...wallView.getAll()] as WallData[]) : [];

    // State hash — over exactly the authoritative state the plan is computed from, so a
    // stale approval (R6) is detectable. The WHOLE wall list is hashed, not just the
    // host, for the same reason the other three planners hash it: a sibling opening
    // added by another actor changes the collision answer, and an approval must not
    // survive that.
    const stateHash = fnv1a(
      stableStringify({ wallOpeningCreate: command.payload, walls: allWalls }),
    );

    const undetermined: UndeterminedImpact[] = [];
    const refused: ConsequenceRefusal[] = [];
    const changed: string[] = [];
    const excluded: string[] = [];
    const topologyAdded: string[] = [];
    const topologyModified: string[] = [];
    const metrics: MetricTransition[] = [];

    // The element to be created is always the DIRECT subject. Whether it lands in
    // `changed` (and `topology.added`) depends on the branches below — a REFUSED create
    // creates nothing, and saying otherwise would make predicted-vs-actual (R4) score a
    // divergence the plan itself caused.
    const direct = determined([id]);

    const bail = (
      reason: UndeterminedImpact['reason'],
      detail: string,
      scope: string,
    ): ConsequencePlan => {
      undetermined.push({ scope, reason, detail });
      undetermined.push(this.roomsUnaffected(id));
      undetermined.push(this.dualStoreUndetermined(id, kindWord));
      undetermined.push(this.regenerationUndetermined(id));
      return this.assemble({
        command,
        stateHash,
        direct,
        indirect: {
          kind: 'undetermined',
          scope: `indirect impact (host wall + sibling openings) of creating ${kindWord} ${id}`,
          reason,
          detail,
        },
        changed,
        excluded,
        topologyAdded,
        topologyModified,
        refused,
        undetermined,
        metrics,
        validation: { violationsCreated: [], violationsResolved: [] },
      });
    };

    // ── Branch 0: resolve the host — DIRECT, never a scan ─────────────────────────────
    // A create names its host in every spelling; there is no reverse-traversal case.
    if (!wallView) {
      return bail(
        'STALE_DERIVED_STATE',
        'no wall store view is available; a hosted element has no independent world ' +
          'position (C15 §2), so with no host record there is nothing to reason about at all.',
        `the host wall ${wallId} for the new ${kindWord} ${id}`,
      );
    }
    const wall = wallView.getById(wallId) as WallData | null | undefined;
    if (!wall) {
      return bail(
        'STALE_DERIVED_STATE',
        `the payload names host wall ${wallId}, which the wall store view does not hold. ` +
          'The create cannot be planned against a host this planner cannot read — and ' +
          '"host absent from the view" is NOT "host does not exist"; which of those it is, ' +
          'is not determined here.',
        `the host wall ${wallId} for the new ${kindWord} ${id}`,
      );
    }

    // ── Branch 0b: the request's own numbers must be usable ───────────────────────────
    // The normaliser requires finite numbers, but this planner is callable directly, and
    // a zero/negative width span would trivially collide with nothing — a PASS invented
    // from a malformed ask. `INVALID_REQUEST` is the member minted for exactly this.
    if (!num(offset) || !num(width) || width <= 0) {
      return bail(
        'INVALID_REQUEST',
        `the requested span cannot be formed: offset=${String(offset)}, width=${String(width)}. ` +
          'A create with no well-formed span is a malformed request, not a gap in what the ' +
          'system can answer.',
        `the requested span for the new ${kindWord} ${id}`,
      );
    }

    const openings: readonly OpeningRecord[] = Array.isArray(
      (wall as { openings?: unknown }).openings,
    )
      ? ((wall as unknown as { openings: OpeningRecord[] }).openings)
      : [];

    // ── Branch 1: DUPLICATE IDENTITY — the commit path's first rejection, mirrored ────
    // `CreateWallOpening.canExecute` rejects an opening id already present on the wall
    // BEFORE the occupancy check, "so the reason surfaces the right cause". The same
    // ordering here, extended to the element id: a duplicate elementId would violate the
    // Wall schema's childrenIds ⊇ openings[*].elementId refine with two claimants.
    const wallSideId = command.payload.openingId;
    const duplicate = openings.find(
      (o) =>
        (wallSideId !== undefined && o.id === wallSideId) ||
        openingElementId(o) === id,
    );
    if (duplicate) {
      const dupKey =
        wallSideId !== undefined && duplicate.id === wallSideId
          ? `opening id ${wallSideId}`
          : `element id ${id}`;
      refused.push({
        elementId: id,
        reason:
          `C15 §1 identity: wall ${wallId} already carries an opening with ${dupKey} ` +
          `(${duplicate.type ?? 'opening'} at ${num(duplicate.offset) ? duplicate.offset.toFixed(3) : '?'} m). ` +
          'The create is REFUSED — committing it would mint a duplicate identity on the host ' +
          '(the same rejection CreateWallOpening.canExecute makes, surfaced before the ' +
          'occupancy question so the reason names the right cause). The existing opening is ' +
          'not touched.',
      });
    }

    // ── Branch 2: OCCUPANCY — the ONE commit rule (bounds AND overlap), mirrored ──────
    // Runs only when identity did not already refuse: a duplicate has no meaningful
    // occupancy question, and two refusals for one cause would double-count.
    if (!duplicate) {
      const occ = this.occupancyBranch(
        wall, openings, offset, width, id, wallId, kindWord,
        // §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — both are already on the payload.
        command.payload.height, command.payload.sillHeight,
      );
      if (occ.kind === 'undetermined') {
        undetermined.push(occ.undetermined);
      } else {
        for (const r of occ.refusals) refused.push(r);
        for (const sid of occ.clear) excluded.push(sid);
      }
    }

    // Does the create PROCEED? Only if nothing refused it.
    const proceeds = refused.length === 0;

    if (proceeds) {
      changed.push(id);
      // The HOST changes too: `wall.openings[]` and `childrenIds` are fields of the WALL
      // record (C15 §1/§6) — the commit appends to both in one atomic draft.
      changed.push(wallId);
      topologyAdded.push(id);
      topologyModified.push(wallId);

      // The typed BEFORE→AFTER lines (R5). `before` is `undefined` on both — a
      // DETERMINED absence: the element does not exist yet, which is a different fact
      // from "could not read the prior value" (the UNDETERMINED entries above).
      metrics.push({ elementId: id, metric: 'offset', before: undefined, after: offset, unit: 'm' });
      metrics.push({ elementId: id, metric: 'width', before: undefined, after: width, unit: 'm' });
    }

    // ── Branch 3: HOST STRUCTURE — the violation diff over the proposed host ──────────
    // Runs even when the create is refused (before === after then): it proves the
    // validator was reachable, and `violationsResolved` stays honestly empty.
    const violation = this.violationsBranch(context, wallId, command.payload, proceeds);
    if (violation.kind === 'undetermined') undetermined.push(violation.undetermined);

    // ── Branches 4–6: the declared dispositions ───────────────────────────────────────
    undetermined.push(this.roomsUnaffected(id));
    undetermined.push(this.dualStoreUndetermined(id, kindWord));
    undetermined.push(this.regenerationUndetermined(id));

    // ── indirect impact — the host, read from the ONE record already resolved ─────────
    const indirect: ImpactDetermination = proceeds ? determined([wallId]) : determined([]);

    return this.assemble({
      command,
      stateHash,
      direct,
      indirect,
      changed,
      excluded,
      topologyAdded,
      topologyModified,
      refused,
      undetermined,
      metrics,
      validation: violation.validation,
    });
  }

  // ── Branch helpers ─────────────────────────────────────────────────────────────────

  /**
   * OCCUPANCY — does the proposed span fit the host and clear every sibling? Delegated
   * to the ONE `canPlace`, with NO `excludeId`: unlike the move row (§MOVE-EXCLUDE-SELF),
   * a create has no pre-existing slot of its own to exclude — every opening already on
   * the host is a genuine sibling.
   *
   * Two refusal shapes, both the store's own:
   *   bounds  — `valid:false` with NO conflict ids (offset before the wall start, span
   *             past the end, degenerate host). Carried VERBATIM with its closed
   *             `CanPlaceRefusalCode`, never reworded (§REFUSAL-IDENTITY, C58 §1.13).
   *   overlap — one refusal PER colliding sibling, naming BOTH spans (C70 F-INV-3 /
   *             G-INV-4: both numbers, and the sibling is neither moved nor removed).
   *
   * `clear` — siblings CHECKED and found not to collide — is the positive half of the
   * verdict (ADR-0322 §6: considered-and-determined-unchanged, distinct from not
   * visited).
   */
  private occupancyBranch(
    wall: WallData,
    siblings: readonly OpeningRecord[],
    offset: number,
    width: number,
    elementId: string,
    wallId: string,
    kindWord: string,
    /** §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — the vertical extent, when stated. */
    heightM?: number,
    sillHeightM?: number,
  ):
    | { kind: 'determined'; refusals: readonly ConsequenceRefusal[]; clear: readonly string[] }
    | { kind: 'undetermined'; undetermined: UndeterminedImpact } {
    if (!this.deps.occupancy) {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `occupancy of the span [${offset}, ${offset + width}] for new ${kindWord} ${elementId} on wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            'no occupancy reader is composed in this runtime (WallOccupancyStore.canPlace — ' +
            'the SAME rule CreateWallOpening commits by). Whether the proposed span fits the ' +
            'host and clears its siblings is NOT checked — not "checked and clear".',
        },
      };
    }

    let result: {
      valid: boolean;
      conflictIds: string[];
      code?: CanPlaceRefusalCode;
      reason?: string;
    };
    try {
      result = this.deps.occupancy.canPlace(wall, offset, width, undefined, { heightM, sillHeightM });
    } catch {
      return {
        kind: 'undetermined',
        undetermined: {
          scope: `occupancy of the span [${offset}, ${offset + width}] for new ${kindWord} ${elementId} on wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the occupancy reader threw while evaluating the proposed span',
        },
      };
    }

    // Conflicts as the plan names them: `canPlace` reports `Opening.id`; the plan speaks
    // ELEMENT ids, mapped back through the sibling list. An unmappable conflict is
    // carried under its raw id rather than dropped.
    const byOpeningId = new Map<string, OpeningRecord>();
    for (const s of siblings) if (s.id !== undefined) byOpeningId.set(s.id, s);

    const conflictElementIds = sortedUnique(
      result.conflictIds.map((cid) => {
        const s = byOpeningId.get(cid);
        return (s ? openingElementId(s) : undefined) ?? cid;
      }),
    );
    const conflictSet = new Set(conflictElementIds);

    if (!result.valid) {
      const proposedEnd = offset + width;
      const refusals: ConsequenceRefusal[] = [];

      if (conflictElementIds.length === 0) {
        // The BOUNDS arm — verbatim, code-carrying, never reworded.
        refusals.push({
          elementId,
          reason:
            `C15 §5 occupancy (C70 F-INV-3, code ${result.code ?? '(none stated by the occupancy reader)'}): ` +
            `${kindWord} ${elementId} cannot occupy [${offset.toFixed(3)} m, ` +
            `${proposedEnd.toFixed(3)} m] on wall ${wallId}.` +
            `${result.reason ? ` ${result.reason}` : ''}`,
        });
      } else {
        for (const cid of conflictElementIds) {
          const s = siblings.find((x) => openingElementId(x) === cid || x.id === cid);
          const sOff = s && num(s.offset) ? s.offset : undefined;
          const sW = s && num(s.width) ? s.width : undefined;
          const occupied =
            sOff !== undefined && sW !== undefined
              ? `[${sOff.toFixed(3)} m, ${(sOff + sW).toFixed(3)} m]`
              : 'a span this planner could not read from the sibling record';
          refusals.push({
            elementId,
            reason:
              `C15 §5 occupancy (C70 F-INV-3): creating ${kindWord} ${elementId} would ` +
              `occupy [${offset.toFixed(3)} m, ${proposedEnd.toFixed(3)} m] on wall ${wallId}, ` +
              `which overlaps ${s?.type ?? 'opening'} ${cid} at ${occupied}. The create is ` +
              'REFUSED — the sibling is neither moved aside nor removed to make room.',
          });
        }
      }

      const clear = sortedUnique(
        siblings
          .map((s) => openingElementId(s))
          .filter((sid): sid is string => sid !== undefined && !conflictSet.has(sid)),
      );
      return { kind: 'determined', refusals, clear };
    }

    const clear = sortedUnique(
      siblings.map((s) => openingElementId(s)).filter((sid): sid is string => sid !== undefined),
    );
    return { kind: 'determined', refusals: [], clear };
  }

  /**
   * The before/after violation diff: clone stores → APPEND the proposed opening to the
   * CLONED host's openings array → validateAll before/after → diff. `apply` is FALSE
   * when the create is refused — a refused create mutates nothing, so an after-clone
   * carrying the new opening would diff a future that will not happen. The branch still
   * RUNS then (before === after): it proves the validator was reachable.
   */
  private violationsBranch(
    context: PlanningContext,
    wallId: string,
    payload: WallOpeningCreateCommand['payload'],
    apply: boolean,
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
          scope: `constraint validation of creating ${payload.openingType ?? 'opening'} ${payload.id} on wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail:
            "no constraint validator is composed in this runtime; whether the host wall's " +
            'remaining structure stays valid cannot be computed',
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

    // The AFTER clone: the host with a FRESH openings array carrying the proposed
    // record appended. The wall-side id is `openingId` when pre-generated, else the
    // element id — a deterministic reuse of a payload identity, never a minted one.
    const proposed: Record<string, unknown> = {
      id: payload.openingId ?? payload.id,
      elementId: payload.id,
      type: payload.openingType ?? 'door',
      offset: payload.offset,
      width: payload.width,
      ...(num(payload.height) ? { height: payload.height } : {}),
      ...(num(payload.sillHeight) ? { sillHeight: payload.sillHeight } : {}),
    };
    const afterWalls = apply
      ? beforeWalls.map((w) => {
          if (String(w.id) !== wallId) return w;
          const list = Array.isArray(w.openings) ? (w.openings as OpeningRecord[]) : [];
          return { ...w, openings: [...list.map((o) => ({ ...o })), proposed] };
        })
      : beforeWalls;

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
          scope: `constraint validation of creating ${payload.openingType ?? 'opening'} ${payload.id} on wall ${wallId}`,
          reason: 'ENGINE_NOT_AVAILABLE',
          detail: 'the constraint validator threw while diffing the opening create',
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

  /** C78 §6.4 disposition (iii) — rooms UNAFFECTED BY CONSTRUCTION, declared (see the
   *  move planner's identical entry for why a determined fact travels in `undetermined`:
   *  the alternative — emitting nothing — is C70 L-INV-1's silence-equals-empty defect). */
  private roomsUnaffected(elementId: string): UndeterminedImpact {
    return {
      scope: `room boundaries and areas under the creation of opening ${elementId}`,
      reason: 'AGGREGATE_SCOPE_UNSUPPORTED',
      detail:
        'DISPOSITION (iii), C78 §6.4 — UNAFFECTED BY CONSTRUCTION, and stated rather than left ' +
        'as an absence. A room ring is traced from wall CENTRELINES; a hosted opening is a void ' +
        'cut into the wall SOLID (C15 §2) and contributes no boundary segment. Creating one ' +
        'therefore cannot move any room polygon, area or perimeter. No room-geometry predictor ' +
        'is consulted, deliberately.',
    };
  }

  /** C78 §6.4 disposition (iv) — the C15 §8.1 dual-store row, UNDETERMINED with reason. */
  private dualStoreUndetermined(elementId: string, kindWord: string): UndeterminedImpact {
    return {
      scope: `the standalone door/window store row for ${elementId} (the C15 §8.1 dual-write)`,
      reason: 'RELATIONSHIP_NOT_READABLE',
      detail:
        `DISPOSITION (iv), C78 §6.4. A committed ${kindWord} create writes TWO places: ` +
        'wall.openings[] (the void geometry) and the standalone doorStore/windowStore row (the ' +
        'frame mesh). Which of them the dispatched handler actually writes differs BY SPELLING ' +
        '— the authoritative wall.createOpening path writes both; the PRYZM3 adapter writes the ' +
        'wall only; door.create/window.create wrote a detached store and now REFUSE ' +
        '(§FIX-CREATE-LIVENESS-LIE). That is a property of the handler, not of readable state, ' +
        'so it is NOT predicted here. The R4 independent read-back can measure it; this entry ' +
        'is the declaration of where to look.',
    };
  }

  /** Regeneration — declared blind spot, as on all three composed rows (same two
   *  source-verified reasons: getAffected answers determined unconditionally, and it
   *  writes its capture map on every query, which a planner may not do — ADR-0322 §2). */
  private regenerationUndetermined(elementId: string): UndeterminedImpact {
    return {
      scope: `regeneration of elements dependent on opening ${elementId}`,
      reason: 'NO_DEPENDENCY_INDEX',
      detail:
        'the dependency index (roadmap Phase 5) that would resolve regeneration impact is not ' +
        'wired. DependencyResolver.getAffected is NOT consulted: its non-delete branch returns a ' +
        'DETERMINED result unconditionally, and it mutates its own capture map on every query, ' +
        'which a planner may not do (ADR-0322 §2). KNOWN and NOT element-grained: the opening ' +
        'void bakes into the host mesh and the frame mesh derives from the standalone row ' +
        '(C78 §6.4 disposition (i), C15 §2/§3 — WallRebuildCoordinator → WallFragmentBuilder). ' +
        'Those are render artefacts with no element id, so they are named here rather than ' +
        'invented as regeneration entries.',
    };
  }

  // ── Assembly + hashing ───────────────────────────────────────────────────────────────

  private assemble(input: {
    command: WallOpeningCreateCommand;
    stateHash: string;
    direct: ImpactDetermination;
    indirect: ImpactDetermination;
    changed: string[];
    excluded: string[];
    topologyAdded: string[];
    topologyModified: string[];
    refused: ConsequenceRefusal[];
    undetermined: UndeterminedImpact[];
    metrics: MetricTransition[];
    validation: { violationsCreated: ViolationRef[]; violationsResolved: ViolationRef[] };
  }): ConsequencePlan {
    const changed = sortedUnique(input.changed);
    const changedSet = new Set(changed);
    const excluded = sortedUnique(input.excluded.filter((e) => !changedSet.has(e)));
    const topologyAdded = sortedUnique(input.topologyAdded);
    const topologyModified = sortedUnique(input.topologyModified);
    const metrics = input.metrics
      .slice()
      .sort((a, b) => a.elementId.localeCompare(b.elementId) || a.metric.localeCompare(b.metric));

    const body = {
      command: { type: input.command.type, payload: input.command.payload },
      direct: input.direct,
      indirect: input.indirect,
      changed,
      excluded,
      topology: {
        added: topologyAdded,
        // C70 F-INV-3 clause 3, structural: `removed` is a literal `[]` with NO
        // parameter that could populate it. This planner physically cannot plan the
        // deletion of a sibling to make room.
        removed: [] as ElementId[],
        modified: topologyModified,
      },
      validation: input.validation,
      regeneration: {
        required: [] as ElementId[],
        skipped: [] as { id: ElementId; reason: string }[],
      },
      ...(metrics.length > 0 ? { metrics } : {}),
      refused: input.refused,
      undetermined: input.undetermined,
    };

    const planHash = fnv1a(stableStringify({ ...body, stateHash: input.stateHash }));
    const planId = `plan-wall.opening.create-${planHash}`;

    return {
      planId,
      planHash,
      stateHash: input.stateHash,
      ...body,
    };
  }
}
