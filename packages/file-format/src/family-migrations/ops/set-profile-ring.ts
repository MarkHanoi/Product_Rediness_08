// Op #17: set-profile-ring (lane CE-MAKE-IT-REACHABLE · §PROFILE-RING-IS-AUTHORABLE).
//
// ═══════════════════════════════════════════════════════════════════════════
// ⭐⭐ WHAT THIS CLOSES — the last link between "a sketch surface is mounted"
//     and "a user can DRAW a shape and have it survive a reload".
//
//     `update-profile` (op #14) moves the points a profile ALREADY has. Its
//     own refusal names what it cannot do, verbatim:
//
//       "committing it would have to mint or delete entity ids, orphaning any
//        constraint that references them — move vertices without inserting or
//        deleting, or add the point through an op that owns id minting"
//
//     ⭐ THIS IS THAT OP. It is the reason a component author can now draw an
//     L-shaped profile over a seeded rectangle and have the extrusion come
//     back L-shaped after Save → reload → bake, instead of being able only to
//     nudge four corners of a box.
//
//     Measured before it was written (so the gap is a fact, not a story):
//     `ls packages/file-format/src/family-migrations/ops/*.ts | grep -v '\.d\.ts'`
//     → 16 ops, and `grep -rn "entities: \[" ops/` shows exactly ONE that
//     writes a `ProfileEntity` array — `box-solid.ts`, which writes a
//     rectangle and nothing else. Nothing in the format could produce a
//     five-sided profile.
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── ⛔ IT DOES NOT MINT IDS. THE CALLER DOES, AND THIS OP PROVES THEM. ──────
// `add-box-solid` already established the convention: the op takes `entityIds`
// from the caller, because id minting belongs to the surface that owns the ONE
// id factory (`@pryzm/schemas`'s `createId`), not to a pure document transform
// inside a package that has no id generator. L-666 records that "id minting is
// uncontracted"; this op does not resolve that ledger entry and does not
// pretend to — it takes the ids it is given and REFUSES any that is not a
// 26-character Crockford-base32 ULID, which is the only thing
// `ProfileEntitySchema.id` actually requires. A caller that hand-rolled an id
// is refused here rather than at pack time.
//
// ─── ⛔ THE CONSTRAINT RULE, AND WHY IT IS THIS SHAPE ────────────────────────
// C111 §1.3-b is normative: *"a consumer MUST NOT infer an object kind from a
// bare ULID … a reference that cannot be resolved to a declared entity fails
// closed."* A ring whose vertex COUNT changed cannot prove which surviving
// entity each constraint still names — the surface that produced it carries
// ring indices, not entity identity (`OutlineConstraintGlyph.vertexIndices`
// says so in its own type). Re-anchoring by index would move a constraint onto
// a different vertex SILENTLY, which is the defect class this repository is
// named for.
//
//   ⭐ So: **an id-set change is admitted only on a profile carrying ZERO
//      constraints.** A pure move (identical id set) leaves every constraint
//      anchored exactly where it was and is always admitted.
//
// ⚠ Today that refusal cannot fire from the product: C111 §9.3 measured
//   `ProfileConstraintSchema` at **zero writers and zero readers** — the
//   persisted constraint array has no producer. The guard is written anyway,
//   because the FIRST producer must not silently break the invariant, and a
//   guard added after the producer is a guard added after the loss.
//
// ─── ⛔ IT REFUSES A PROFILE THAT IS NOT ALREADY A RING ──────────────────────
// An `arc` / `circle` / `spline` / `line` entity flattens to many ring vertices
// (or consumes other entities by reference), so a ring index does not
// correspond to an entity and writing a flattened ring over one would replace
// authored curvature with its own tessellation. `profileWriteBackDisposition`
// says the same thing at the panel; `update-profile` says it at the model; this
// op says it a third time, because the ring path now has TWO model entrances
// and a guard that lives on only one of them is not a guard.
//
// ─── ⛔ IT REFUSES TO FREEZE A FORMULA INTO A LITERAL ────────────────────────
// A RETAINED point whose stored `x`/`z` is a STRING is an expression-valued
// coordinate — the entire mechanism behind the §64 demo. Overwriting it with
// the number it happened to produce is `update-profile`'s named refusal and is
// this op's too.
//
// ─── WHAT SURVIVES A REWRITE, BY CONSTRUCTION ───────────────────────────────
// A RETAINED entity is OVERLAID (`{...e, data: {...e.data, x, z}}`), so every
// other key the document carries on it survives even though the caller sent
// only a coordinate pair. A NEW entity is minted as a bare
// `{id, kind: 'point', data: {x, z}}` — the shape `profileToPolygon` reads
// without a scope.
//
// ⚠ ENTITY ARRAY ORDER IS RING ORDER. `profileToPolygon` iterates
//   `profile.entities` in order and emits one vertex per `point`, so this op
//   writes the entities in the order the caller sent the points. Sorting them
//   would silently re-wind the polygon.

import type { FamilyDocument, Profile } from '../../family-schema.js';
import type { Migrator, RawFamily } from '../types.js';

/** The ULID shape `ProfileEntitySchema.id` requires (26 Crockford base32). */
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/**
 * A profile needs three vertices to bound an area. The same floor
 * `profileToPolygon` enforces (`MIN_POINTS`) and the same one the authoring
 * surface refuses a delete at — stated here so a document can never reach the
 * evaluator in a state the evaluator will reject.
 */
const MIN_RING_POINTS = 3;

/** One vertex of the new ring, in the profile's own plane coordinates. */
export interface ProfileRingPoint {
  /** An EXISTING entity id (the vertex is retained) or a freshly minted ULID. */
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export interface SetProfileRingParams {
  readonly profileId: string;
  /**
   * The COMPLETE new ring, in ring order. Ids present on the profile are
   * retained (and overlaid); ids absent from it are minted as new `point`
   * entities; profile entities absent from this list are DELETED.
   */
  readonly points: readonly ProfileRingPoint[];
}

export function makeSetProfileRingMigrator(
  from: string,
  to: string,
  params: SetProfileRingParams,
): Migrator {
  return {
    id: `set-profile-ring:${params.profileId}`,
    from,
    to,
    description: `re-ring profile ${params.profileId} to ${params.points.length} point(s)`,
    apply(input: RawFamily): RawFamily {
      const doc = input.document;
      const profiles = doc.profiles as readonly Profile[];
      const profile = profiles.find((pr) => pr.id === params.profileId);
      if (!profile) throw new Error(`profile ${params.profileId} not found`);

      if (params.points.length < MIN_RING_POINTS) {
        throw new Error(
          `profile '${profile.name}' was given ${params.points.length} point(s); a profile needs at ` +
            `least ${MIN_RING_POINTS} to bound an area, and one that cannot be evaluated is not a ` +
            'profile — draw at least three vertices before committing',
        );
      }

      // ── the incoming id set, proven well-formed and unique ────────────────
      const incoming = new Set<string>();
      for (const p of params.points) {
        if (!ULID_RE.test(p.id)) {
          throw new Error(
            `profile point id ${JSON.stringify(p.id)} is not a 26-character Crockford-base32 ULID, ` +
              'which is the only id shape `ProfileEntitySchema` admits; mint it through the ' +
              'application id factory rather than by hand',
          );
        }
        if (incoming.has(p.id)) {
          throw new Error(
            `point ${p.id} is listed twice; a profile point has one position, and two would make ` +
              'the last writer the winner silently',
          );
        }
        incoming.add(p.id);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
          throw new Error(
            `point ${p.id} was given a non-finite coordinate (x=${String(p.x)}, z=${String(p.z)}); ` +
              'a profile that cannot be evaluated is not a profile',
          );
        }
      }

      // ── the profile must already BE a ring ────────────────────────────────
      const byExistingId = new Map<string, Profile['entities'][number]>();
      for (const e of profile.entities) {
        if (e.kind !== 'point') {
          throw new Error(
            `profile '${profile.name}' entity ${e.id} is a '${e.kind}'; writing a flattened ring over ` +
              'it would replace authored curvature with its own tessellation — edit the entity ' +
              'through its own parameters instead, or draw on a profile whose entities are all points',
          );
        }
        byExistingId.set(e.id, e);
      }

      // ── did the ID SET change? ────────────────────────────────────────────
      const removed = profile.entities.filter((e) => !incoming.has(e.id)).map((e) => e.id);
      const added = params.points.filter((p) => !byExistingId.has(p.id)).map((p) => p.id);
      const idSetChanged = removed.length > 0 || added.length > 0;

      if (idSetChanged && profile.constraints.length > 0) {
        // ⛔ C111 §1.3-b — FAIL CLOSED. See the header: a re-ringed profile
        //    cannot prove which entity each constraint still names.
        throw new Error(
          `profile '${profile.name}' carries ${profile.constraints.length} constraint(s) and this ` +
            `commit adds ${added.length} and removes ${removed.length} point(s); re-anchoring a ` +
            'constraint by ring index would move it onto a different vertex without saying so ' +
            '(C111 §1.3-b: a reference that cannot be resolved fails closed) — move vertices ' +
            'without inserting or deleting, or remove the constraints first',
        );
      }

      // ⛔ A MINTED id must not collide with a constraint id. C111 §1.3 is
      //    explicit that entity ids, constraint ids and event ids share ONE
      //    unprefixed ULID space and nothing distinguishes them; a collision
      //    would make `entityIds` resolve to the wrong object kind.
      if (added.length > 0) {
        const constraintIds = new Set(profile.constraints.map((c) => c.id));
        for (const id of added) {
          if (constraintIds.has(id)) {
            throw new Error(
              `minted point id ${id} is already a constraint id on profile '${profile.name}'; ` +
                'entity and constraint ids share one unprefixed ULID space (C111 §1.3) and a ' +
                'collision would make a reference resolve to the wrong object — mint another id',
            );
          }
        }
      }

      // ── build the new entity array, IN RING ORDER ─────────────────────────
      const entities = params.points.map((p) => {
        const existing = byExistingId.get(p.id);
        if (!existing) {
          // A NEW vertex. Minted as the bare shape `profileToPolygon` reads
          // with no scope; nothing is invented beyond the two coordinates.
          return { id: p.id, kind: 'point' as const, data: { x: p.x, z: p.z } };
        }
        if (typeof existing.data['x'] !== 'number' || typeof existing.data['z'] !== 'number') {
          throw new Error(
            `profile '${profile.name}' point ${existing.id} has an expression-valued coordinate; ` +
              'writing a drawn literal over it would freeze the formula into the number it happened ' +
              'to produce — change the parameter the expression reads, or clear the expression first',
          );
        }
        // ⭐ Overlay, never replace: every other `data` key the document carries
        //    survives because the caller never had the chance to drop it.
        return { ...existing, data: { ...existing.data, x: p.x, z: p.z } };
      });

      const updated: Profile = { ...profile, entities };
      return {
        manifest: { ...input.manifest },
        document: {
          ...doc,
          formatVersion: to,
          profiles: profiles.map((pr) => (pr.id === params.profileId ? updated : pr)),
        } as FamilyDocument,
        ifcMapping: input.ifcMapping,
        events: input.events,
      };
    },
  };
}
