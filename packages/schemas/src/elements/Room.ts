import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

/**
 * Room / space — extended in S25 to honour SPEC-06 §4.1
 * (Rooms / Levels / Spatial hierarchy).
 *
 *   • `boundaryMode` — `'wallBound'` (boundary derived from enclosing
 *     walls via the half-edge flood-fill in `produceRoom`, see
 *     `code-level ADR docs/02-decisions/adrs/0022-room-boundary-detection.md`)
 *     vs `'sketched'` (PRYZM 1's manually-sketched polygon path,
 *     unchanged from M1A and used as the back-compat default for the
 *     existing 2A test fixtures).
 *   • `seedPoint` — required for `wallBound` mode; the user-clicked
 *     point known to be inside the room, fed straight to the producer.
 *   • `multiLevelSpan` — Phase 2A v1 ships `null` ONLY (single-level
 *     rooms).  Phase 3A (S49) opens the discriminated union per
 *     SPEC-06 §4.4.  We keep the field with a literal-`null` shape so
 *     the round-trip test pins the contract to single-level for now.
 *   • `occupancy`, `heightOffset` — schedule subsystem (S37) reads
 *     `occupancy`; the room committer reads `heightOffset` to lift the
 *     boundary outline above the floor for visibility.
 *   • `boundingElementIds` — cache populated by the producer with the
 *     wall ids that contributed boundary edges.  The cross-element
 *     rule (`plugins/cross/wall-room.ts`, lands S26) uses it to avoid
 *     full-graph recomputes when an unrelated wall edits.
 *
 * The legacy `boundary`, `area`, `volume`, `boundingWallIds` fields
 * are kept for back-compat: existing M1A round-trip + `Room.parse({})`
 * sites do not break.  S26 begins the migration to read `area` /
 * `volume` from producer output rather than the schema.
 *
 * IFC mapping: this schema's `ifcData` slot (inherited from
 * `BaseNodeShape`) is the canonical attachment point for the
 * `IfcSpace` mapping per SPEC-05 §5; the actual export wire-up lands
 * in Phase 3B (S55+) — for now the schema simply reserves the slot.
 */
export const Room = defineElement('room', {
  levelId: z.string().default(''),
  name: z.string().default('Room'),
  number: z.string().optional(),

  // ── SPEC-06 §4.1 boundary discriminator (back-compat: when the
  //    legacy `boundary` polygon is present and the producer is not
  //    yet wired, the committer falls back to the sketched path).
  boundaryMode: z.enum(['wallBound', 'sketched']).default('sketched'),

  /** Seed point in world-XZ coords (`y` is ignored).  REQUIRED at
   *  the boundary-detection level when `boundaryMode === 'wallBound'`;
   *  the producer throws `DescriptorInvariantError` when missing.
   *  Stored as `Vec3` for parity with the rest of the schema's point
   *  types. */
  seedPoint: Vec3.nullable().default(null),

  /** Vertical lift of the floor-fill mesh above the level base, m.
   *  Default 0; the committer adds a tiny render-order offset on top
   *  to keep the fill above the slab in the depth buffer. */
  heightOffset: z.number().default(0),

  /** Optional program tag, also written to IfcSpace's `LongName` on
   *  Phase 3B export.  *Examples:* `'Office'`, `'Bathroom'`,
   *  `'Atrium'`. */
  occupancy: z.string().optional(),

  /** Phase 2A v1 placeholder — multi-level rooms land in Phase 3A
   *  (S49) per SPEC-06 §4.4.  Keep the literal-`null` shape so the
   *  round-trip test pins the contract for now. */
  multiLevelSpan: z.null().default(null),

  // ── Producer cache.  Populated when the room is rebuilt; cleared
  //    by handlers that affect the boundary inputs.  Listed here so
  //    the L1 store carries it (the producer is pure but its inputs
  //    are queried via this cache for performance). ──
  boundingElementIds: z.array(z.string()).default([]),

  // ── Legacy / sketched fallback (back-compat with M1A fixtures).
  /** Sketched-mode boundary polygon (XZ plane).  Unused when
   *  `boundaryMode === 'wallBound'` — the producer derives the
   *  polygon from the wall graph and stores it back into the
   *  store via the patch returned by the cascade. */
  boundary: z.array(Vec3).min(3).default([
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ]),

  /** Floor area in m².  Cached by the producer; consumed by
   *  schedules (S37) and the room label committer (S26 visual
   *  pass).  S26 migrates to producer-derived only. */
  area: z.number().nonnegative().default(0),
  /** Volume in m³ — cached, see `area`. */
  volume: z.number().nonnegative().default(0),
  /** Floor-plan perimeter in metres.  Cached by the producer in
   *  lockstep with `area`; consumed by the schedules pipeline
   *  (`ScheduleExtractor`/`ScheduleRegistry`), the property
   *  inspector, the room-type inference engine, and the physics
   *  fallback heuristic.  Mirrors `area` — keep them in sync. */
  perimeter: z.number().nonnegative().default(0),

  /** Legacy alias of `boundingElementIds` retained for the round-trip
   *  test only — populated by the producer in lockstep with the new
   *  field and dropped at the M15 schema-cleanup pass.  Both lists
   *  must remain unique. */
  boundingWallIds: z.array(z.string()).default([]),

  /** Optional floor-fill colour.  Default is supplied by the
   *  committer (`#b3d8ff` at 12% opacity per the phase-doc spec). */
  materialColor: z.string().optional(),
  materialId: z.string().optional(),
})
  .refine(
    (r) => new Set(r.boundingWallIds).size === r.boundingWallIds.length,
    { message: 'Room boundingWallIds must be unique (do not list a wall twice).' },
  )
  .refine(
    (r) => new Set(r.boundingElementIds).size === r.boundingElementIds.length,
    {
      message: 'Room boundingElementIds must be unique (the producer cache must not duplicate ids).',
    },
  )
  .refine(
    (r) => r.boundaryMode === 'sketched' || r.seedPoint !== null,
    {
      message:
        'Room.seedPoint is required when boundaryMode === "wallBound" (producer cannot flood-fill without a seed).',
    },
  )
  .refine(
    (r) => r.heightOffset >= -10 && r.heightOffset <= 10,
    {
      message: 'Room.heightOffset must lie in [-10, 10] m (defensive bound).',
    },
  );

export type Room = z.infer<typeof Room>;
