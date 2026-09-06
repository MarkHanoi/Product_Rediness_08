/**
 * roomEnvelopePlan — the solved layout becomes a `spaceEnvelope.batch.create` payload.
 * This module builds the payload; it dispatches nothing.
 *
 * Layer Affected:  UI — room programme (L7). PURE: no store, no bus, no DOM, no clock,
 *                  no RNG (ids are minted by the CALLER — C16 CA-2). Never throws.
 * File:            apps/editor/src/ui/room-programme/roomEnvelopePlan.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §10 · §25.5
 * Contracts:       C114 §6 / §6a (the batch verb is the create path even for one) ·
 *                  C114 §12 (room ⊂ level) · C16 CA-2 · C83 §1.2 (refuse with reasons)
 *
 * ⭐ MODELLED ON `apps/editor/src/ui/site/adoptProposalAsEnvelope.ts`, DELIBERATELY.
 * That module is the only production builder of this verb's payload today, and it
 * establishes the shape this one copies: the spec type is spelled locally so no import
 * crosses from the app into the plugin (the BUS is the boundary), the derived metrics
 * `footprintAreaM2` / `volumeM3` are NOT supplied (C114 §5 — a payload that supplies
 * them is not believed), and `role: 'maximumBuildable'` is never passed.
 *
 * ⛔ ONE BATCH, ONE UNDO. Every room in the plan rides in a single
 * `spaceEnvelope.batch.create`, which is why C114 §6a declines to offer a singular
 * create verb at all: `batchCoordinator.runBatch` is undo-NEUTRAL, so N single creates
 * would spend the user's Ctrl+Z N times on one gesture.
 *
 * ⚠ AND THE GAP THIS CANNOT CLOSE, NAMED: there is no `spaceEnvelope.batch.delete`.
 * The verb roster is create(batch) · delete · move · moveFace · setFootprint ·
 * setParameter · setWithin. So REPLACING an existing set of N room envelopes costs N
 * deletes plus one create — N+1 undo entries for one gesture. `describeReplacement`
 * below says that to the user in advance rather than letting them discover it by
 * pressing Ctrl+Z and watching one room come back.
 */

import type { EnvelopePoint } from '@pryzm/geometry-space-envelope';
import type { ProgrammeLayout } from './programmeToEnvelopes';

/** The LEVEL envelope the rooms will be declared within. Read from the store by the caller. */
export interface HostLevelEnvelope {
  /** The level ENVELOPE's element id — becomes each room's `withinId`. */
  readonly id: string;
  /** The STOREY id the envelope is seated on — becomes each room's `levelId`. */
  readonly levelId: string;
  readonly name: string;
  readonly baseOffset: number;
  readonly height: number;
  readonly footprint: readonly EnvelopePoint[];
}

/**
 * The `spaceEnvelope.batch.create` spec shape (C114 §6), spelled locally so this module
 * needs no import from the plugin it speaks to.
 */
export interface RoomEnvelopeSpec {
  readonly spaceEnvelopeId: string;
  readonly levelId: string;
  readonly footprint: readonly { readonly x: number; readonly y: 0; readonly z: number }[];
  readonly baseOffset: number;
  readonly height: number;
  readonly role: 'room';
  readonly withinId: string;
  readonly name: string;
  readonly occupancy?: string;
}

export interface RoomEnvelopePlan {
  readonly ok: true;
  readonly command: 'spaceEnvelope.batch.create';
  readonly payload: { readonly envelopes: readonly RoomEnvelopeSpec[] };
  /** Ids of room envelopes ALREADY inside this level that this plan would duplicate. */
  readonly supersedes: readonly string[];
  /** Plain language: what will be created, inside what, at what height. */
  readonly statement: string;
}

export type RoomEnvelopePlanRefusalCode = 'no-level-envelope' | 'no-cells' | 'id-collision';

export interface RoomEnvelopePlanRefusal {
  readonly ok: false;
  readonly code: RoomEnvelopePlanRefusalCode;
  readonly statement: string;
}

export type RoomEnvelopePlanResult = RoomEnvelopePlan | RoomEnvelopePlanRefusal;

/** The minimum a space-envelope record must expose for this module to read it. */
export interface SpaceEnvelopeRecordLike {
  readonly id: string;
  readonly role: string;
  readonly levelId: string;
  readonly name?: string;
  readonly baseOffset?: number;
  readonly height?: number;
  readonly withinId?: string | null;
  readonly footprint?: readonly EnvelopePoint[];
}

export type LevelEnvelopePick =
  | { readonly ok: true; readonly level: HostLevelEnvelope }
  | { readonly ok: false; readonly code: 'none' | 'ambiguous'; readonly statement: string };

/**
 * The ONE level envelope on `levelId`, or a refusal that names which of the two honest
 * failures happened.
 *
 * ⛔ AMBIGUITY IS REFUSED, NOT RESOLVED BY PICKING THE BIGGEST. Two level envelopes on
 * one storey is a real state a user can author, and choosing between them here would
 * silently decide which of the two the rooms belong to — a decision with no symptom.
 */
export function pickLevelEnvelope(
  records: readonly SpaceEnvelopeRecordLike[],
  levelId: string,
): LevelEnvelopePick {
  return resolveFrom(records.filter((r) => isUsableLevel(r) && r.levelId === levelId));
}

function isUsableLevel(r: SpaceEnvelopeRecordLike): boolean {
  return r.role === 'level' && Array.isArray(r.footprint) && (r.footprint?.length ?? 0) >= 3;
}

/** The ONE place the three outcomes are written, so no caller can invent a fourth. */
function resolveFrom(levels: readonly SpaceEnvelopeRecordLike[]): LevelEnvelopePick {
  if (levels.length === 0) {
    return {
      ok: false,
      code: 'none',
      statement:
        'There is no level envelope yet, so there is nothing for the rooms to sit inside. '
        + 'Create one first: on the buildable-envelope card, type the ground-floor area you want '
        + 'and use "Fit this on the ground floor" — that turns the target plate into a level '
        + 'envelope. Rooms are then placed within it and stay within it.',
    };
  }
  if (levels.length > 1) {
    const names = levels.map((l) => l.name?.trim() || l.id).join(', ');
    return {
      ok: false,
      code: 'ambiguous',
      statement:
        `${levels.length} level envelopes are candidates (${names}), so PRYZM cannot tell which `
        + 'one the rooms belong inside. Make the storey you want active, or delete the one you do '
        + 'not want, then solve again. PRYZM will not choose for you: the choice decides which '
        + 'envelope every room is constrained to, and a wrong guess would look exactly like a '
        + 'right one.',
    };
  }
  const l = levels[0]!;
  return {
    ok: true,
    level: {
      id: l.id,
      levelId: l.levelId,
      name: l.name?.trim() || l.id,
      baseOffset: Number.isFinite(l.baseOffset) ? (l.baseOffset as number) : 0,
      height: Number.isFinite(l.height) && (l.height as number) > 0 ? (l.height as number) : 3,
      footprint: l.footprint ?? [],
    },
  };
}

/**
 * The level envelope to host the rooms, resolved WITHOUT requiring the user to have the
 * right storey active.
 *
 * The ladder, and every rung is stated because the alternative is a panel that says
 * "no level envelope" while one is plainly on screen:
 *   1. exactly ONE level envelope in the whole project ⇒ that one, whatever storey it
 *      is on. This is the overwhelmingly common case at this stage of the design.
 *   2. more than one ⇒ narrow to the ACTIVE storey, and take it if that leaves exactly
 *      one.
 *   3. otherwise ⇒ refuse and NAME them. See `pickLevelEnvelope` for why ambiguity is
 *      never resolved by picking the biggest.
 */
export function pickHostLevelEnvelope(
  records: readonly SpaceEnvelopeRecordLike[],
  activeLevelId: string | null,
): LevelEnvelopePick {
  const levels = records.filter(isUsableLevel);
  if (levels.length === 1) return resolveFrom(levels);
  if (levels.length > 1 && activeLevelId) {
    const onActive = levels.filter((l) => l.levelId === activeLevelId);
    if (onActive.length === 1) return resolveFrom(onActive);
  }
  // 0, or still ambiguous after narrowing — `resolveFrom` writes both sentences, and it
  // reports the FULL candidate set rather than a narrowed one, so the user is told what
  // PRYZM actually saw.
  return resolveFrom(levels);
}

/** Room envelopes already declared inside `level`. The set a re-solve would supersede. */
export function roomEnvelopesWithin(
  records: readonly SpaceEnvelopeRecordLike[],
  levelEnvelopeId: string,
): readonly string[] {
  return records.filter((r) => r.role === 'room' && r.withinId === levelEnvelopeId).map((r) => r.id);
}

/**
 * Build the batch payload. Pure; total; never throws.
 *
 * ⭐ EVERY ROOM TAKES THE LEVEL'S OWN `baseOffset` AND `height`. That is not a
 * simplification — it is what makes C114 §12's vertical containment hold BY
 * CONSTRUCTION rather than by luck, so the only way this plan can be refused by the
 * containment gate is a genuine PLAN excursion, which the solver has already clipped
 * against the same ring.
 */
export function buildRoomEnvelopePlan(
  layout: ProgrammeLayout,
  level: HostLevelEnvelope,
  mintId: (roomId: string, index: number) => string,
  existingRoomIds: readonly string[] = [],
): RoomEnvelopePlanResult {
  if (layout.cells.length === 0) {
    return {
      ok: false,
      code: 'no-cells',
      statement: 'The solved layout has no rooms in it, so there is nothing to create.',
    };
  }
  const envelopes: RoomEnvelopeSpec[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < layout.cells.length; i += 1) {
    const c = layout.cells[i]!;
    const id = mintId(c.roomId, i);
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) {
      return {
        ok: false,
        code: 'id-collision',
        statement:
          'PRYZM could not mint a distinct id for every room envelope, so nothing was created. '
          + 'This is a wiring fault in the panel, not a problem with your programme.',
      };
    }
    seen.add(id);
    envelopes.push({
      spaceEnvelopeId: id,
      levelId: level.levelId,
      footprint: c.ring.map((p) => ({ x: p.x, y: 0 as const, z: p.z })),
      baseOffset: level.baseOffset,
      height: level.height,
      role: 'room',
      withinId: level.id,
      name: c.name,
      // ⛔ `undefined` is passed through, never coerced to 'unclassified' — see
      // `occupancyTagFor`'s header. An absent tag says no classification was made.
      ...(c.occupancy ? { occupancy: c.occupancy } : {}),
    });
  }
  const total = layout.cells.reduce((s, c) => s + c.areaM2, 0);
  return {
    ok: true,
    command: 'spaceEnvelope.batch.create',
    payload: { envelopes },
    supersedes: existingRoomIds,
    statement:
      `${envelopes.length} room envelope${envelopes.length === 1 ? '' : 's'} totalling `
      + `${total.toFixed(2)} m², inside ${level.name} (${layout.levelAreaM2.toFixed(2)} m²), each `
      + `${level.height.toFixed(2)} m tall from the storey datum. Spaces only — no walls, floors `
      + 'or slabs are created at this stage.',
  };
}

/**
 * The sentence shown before a REPLACE, naming the undo cost. See the header: the family
 * has no batch delete, so this is N+1 entries and the user is told so first.
 */
export function describeReplacement(existingRoomIds: readonly string[]): string | null {
  const n = existingRoomIds.length;
  if (n === 0) return null;
  return (
    `This level already holds ${n} room envelope${n === 1 ? '' : 's'}. Placing this layout removes `
    + `${n === 1 ? 'it' : 'them'} first. ⚠ That costs ${n + 1} undo steps, not one — the space-`
    + 'envelope family has a batch CREATE verb but no batch DELETE, so each removal is its own '
    + 'command. Nothing is removed until you confirm.'
  );
}
