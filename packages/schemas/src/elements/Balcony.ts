import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Balcony — the PARENT record of a balcony COMPOUND (§FEAT-BALCONY-COMPOUND, L-5600).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A BALCONY IS A COMPOUND, NOT A PRIMITIVE. See C103 and ADR-0333.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The balcony record carries NO geometry of its own beyond ONE polygon. It is the
 * identity, the parametric intent, and the OWNER of three kinds of member:
 *
 *   1. the cantilever SLAB   — a real `slab` record (structural plate, IfcSlab)
 *   2. the FLOOR FINISH      — a real `floor` record (IfcCovering / FLOORING)
 *   3. the RAILING           — N real `handrail` records, one per FREE edge
 *
 * All three are REAL element records because they must be schedulable (C28),
 * IFC-exportable (C25), material-editable and — the founder's explicit
 * requirement — INDIVIDUALLY SELECTABLE AND EDITABLE after creation. They are
 * linked to this record by the L0 `parentId` / `childrenIds` fields of
 * `BaseNodeShape`, the SAME mechanism the pool uses (ADR-0124 §3) and the same one
 * a host wall uses for its hosted doors/windows (C15). This is not a new compound
 * pattern; it is the blessed one.
 *
 * ─── ⭐ ONE POLYGON, THREE MEMBERS (C103 §4 — derived, never mirrored) ───────
 * `boundary` is the SINGLE source of truth. The slab outline, the finish outline
 * and the railing runs are all COMPUTED from it by `buildBalconyAssembly()` in
 * `@pryzm/geometry-balcony`. There is no second polygon anywhere in the compound,
 * which is why the founder's *"the floor finish and railings should adapt"* is a
 * property of the model rather than a synchronisation someone must remember.
 *
 * ─── ⚠ WHY THERE IS NO `hostEdgeIndex` FIELD ────────────────────────────────
 * The first draft stored WHICH boundary edge lies against the host wall, so the
 * railing could skip it. That field is a DERIVED VALUE STORED, and a vertex drag
 * renumbers edges — so the index would name the wrong edge the moment the profile
 * was edited, and the railing would appear across the doorway. C84 §8.i exists for
 * exactly that failure. The host edges are therefore MEASURED against the host
 * wall's centreline every time the assembly is built (`resolveFreeEdges()` in
 * `@pryzm/geometry-balcony`), and nothing about them is stored. A balcony with no
 * host wall has no host edge and is railed all round.
 *
 * DIMENSIONS ARE NOT STORED AS LITERALS (L-127). Every dimensional field below is
 * OPTIONAL. "Unset" is a first-class state meaning *resolve me* — the chain
 * `record → systemType → documented default` lives in exactly ONE place,
 * `resolveBalconyDimensions()` in `@pryzm/geometry-balcony`.
 */

/** Plan outline of the balcony: an OPEN loop (do not repeat the closing vertex). */
const BalconyLoop = z.array(Vec3).min(3);

export const Balcony = defineElement('balcony', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from: one of the five
   * (`ValueOrigin.ts`, which owns the vocabulary and is never restated here), or an
   * explicit unknown carrying its reason.
   *
   * ⚠ `RetrofittedProvenanceSchema`, spelled out here rather than spread from a
   * shared constant or folded into `BaseNodeShape`, and that is deliberate twice
   * over. C75 §2.5 requires optional-with-an-UNKNOWN-default so a snapshot written
   * before this field existed parses unchanged and lands on `predates-provenance`
   * — never on a member of the five. And `check-provenance-coverage` measures the
   * file that declares `defineElement('<kind>')`: an indirection hides the field
   * from the C3 retrofit-safety arm.
   */
  provenance: RetrofittedProvenanceSchema,
  /**
   * PV-06 / C75 §1.3 — how much this element's values can be TRUSTED. A separate
   * axis from `provenance`, and C75 §1.2 forbids merging axes. The vocabulary is
   * C62's (ADR-0280), REUSED not reinvented.
   */
  confidence: RetrofittedConfidenceSchema,

  /** Owning level — the level whose datum is the balcony slab's TOP face. */
  levelId: z.string().default(''),

  /**
   * The wall this balcony is HOSTED ON, if any.
   *
   * ⭐ HOSTED ≠ CUTTING. ADR-0333 §3: the balcony ATTACHES to the façade and does
   * NOT punch an opening in it. The founder's *"hosted as you host a door on a
   * wall"* describes the placement GESTURE (snap to a wall, live preview of the
   * occupied space, offset along the wall) — not an opening. The door onto the
   * balcony is a separate element the user places with the existing door tool.
   *
   * Deliberately a plain `z.string()` and NOT `idRef('wall')`: `undefined` is a
   * first-class state (a free-standing / roof-terrace balcony hosts on nothing),
   * and `idRef` mints a DEFAULT wall id, which would fabricate a host that does not
   * exist. An absent host must read as absent.
   */
  hostWallId: z.string().optional(),

  /**
   * Arc length along the host wall's centreline of the balcony's LEFT edge, in
   * metres — the §OPENING-OFFSET-LEFTEDGE-UNIFY convention doors and windows use,
   * adopted verbatim so a balcony and a door on the same wall measure the same way.
   * Meaningless (and unset) when `hostWallId` is absent.
   */
  hostOffset: z.number().optional(),

  /**
   * The balcony's plan outline in WORLD coordinates, as an OPEN loop.
   *
   * THE single source of truth. It is the slab outline, the floor-finish outline and
   * the ring the railing runs are cut from. One polygon — so the members cannot
   * drift apart, and an "edit profile" on the slab re-derives all three.
   *
   * The default is the founder's 1.00 m × 0.50 m rectangle at the origin, with the
   * HOST edge first (z = 0) and the outer edge at z = projection.
   */
  boundary: BalconyLoop.default([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 0.5 },
    { x: 0, y: 0, z: 0.5 },
  ]),

  // ── Parametric overrides. ALL OPTIONAL — unset means "resolve from the
  //    systemType, then from the documented default" (L-127). A `.default()` here
  //    would BAKE A LITERAL into L0 and destroy the systemType tier of the chain.

  /** Clear span along the host wall, in metres. Founder default 1.0 m. */
  width: z.number().positive().optional(),
  /** Projection (depth) away from the host wall, in metres. Founder default 0.5 m. */
  projection: z.number().positive().optional(),
  /** Railing height above the FINISHED floor level, in metres. Founder default 1.0 m. */
  railingHeight: z.number().positive().optional(),
  /** Cantilever slab thickness, in metres. */
  slabThickness: z.number().positive().optional(),
  /** Floor-finish assembly thickness, in metres. */
  finishThickness: z.number().positive().optional(),

  /** Balcony system type — tier 2 of the dimension-resolution chain. */
  systemTypeId: z.string().optional(),
  /** Handrail catalogue type for the railing members (C95 §15.16). */
  railingTypeId: z.string().optional(),
  /** Floor-finish catalogue type for the finish member. */
  finishTypeId: z.string().optional(),
  materialId: z.string().optional(),
  materialColor: z.string().optional(),
})
  // (1) A balcony with a degenerate outline is not a balcony. The same 0.01 m² floor
  //     `UpdateSlabPolygonCommand.canExecute` applies to a slab profile edit, so a
  //     ring THAT command accepts is a ring THIS schema accepts — which matters,
  //     because a profile edit is re-validated here on its way back in.
  .refine(
    (b) => {
      let a2 = 0;
      for (let i = 0; i < b.boundary.length; i++) {
        const c = b.boundary[i]!;
        const n = b.boundary[(i + 1) % b.boundary.length]!;
        a2 += c.x * n.z - n.x * c.z;
      }
      return Math.abs(a2 / 2) >= 0.01;
    },
    { message: 'Balcony boundary must enclose a non-degenerate area (>= 0.01 m2).' },
  )
  // (2) OPEN loop — identical convention to Slab and Pool, so the polygon this
  //     balcony hands its slab member needs no re-normalisation.
  .refine(
    (b) => {
      const first = b.boundary[0]!;
      const last = b.boundary[b.boundary.length - 1]!;
      return first.x !== last.x || first.y !== last.y || first.z !== last.z;
    },
    { message: 'Balcony boundary must be open (do not duplicate the closing vertex).' },
  )
  // (3) An offset along a wall that is not named is not measurable. Refusing the pair
  //     rather than silently ignoring `hostOffset` keeps "attached at 2.4 m along
  //     nothing" unrepresentable (C84 EI-2 — a field the pipeline drops is a defect).
  .refine(
    (b) => b.hostOffset === undefined || b.hostWallId !== undefined,
    { message: 'Balcony hostOffset is measured along hostWallId, which is not set.' },
  );

export type Balcony = z.infer<typeof Balcony>;
