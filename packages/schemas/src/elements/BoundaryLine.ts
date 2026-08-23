import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

/**
 * BoundaryLine — the AUTHORED construction / setting-out line.
 * §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7900..L-7906) · **C105** · ADR-0348.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ THREE DIFFERENT LINES EXIST IN THIS REPOSITORY. THIS IS THE THIRD.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * | line | who owns it | mutable? | hosts anything? |
 * |---|---|---|---|
 * | `Parcel.boundary` (C19 §1.4) | the SITE subsystem, from cadastre/survey | ⛔ **NO — one-shot immutable; there is no `site.editParcelBoundary`** | no |
 * | `RoomBoundingLine` (`core-app-model`) | room DETECTION | yes | no — it is an invisible splitter |
 * | **`BoundaryLine` (this file)** | the ARCHITECT, by drawing it | ✅ yes | ✅ **yes — it is a HOST (C105 §3)** |
 *
 * ⛔ **Do not reuse, extend, or write through the parcel boundary.** It is a legal
 * title outline; C19 §1.4 makes it immutable for the lifetime of the Site precisely
 * so an ordinary edit gesture can never rewrite a surveyed polygon. A reader who
 * conflates the two will corrupt legally-sourced data. That is why this is its own
 * family, its own brand (`boundaryLine`) and its own store.
 *
 * ─── WHAT IT IS FOR ─────────────────────────────────────────────────────────
 * Early-stage design. The architect draws the envelope of a scheme as a LINE — with
 * the same modes the wall offers (linear, ortho, curved, rectangular, circular,
 * elliptical) — and then populates it: by hand, or by asking RAC *"create a
 * 3-bedroom apartment on this boundary line"*. Because the line is a HOST, moving it
 * later carries whatever was built on it (C105 §3, the per-family table).
 *
 * ─── ONE POLYLINE, AND NOTHING DERIVED IS STORED ────────────────────────────
 * `vertices` is the SINGLE source of truth for where the line is. Length, segment
 * count, centroid, the extruded solid and every attachment's world pose are all
 * COMPUTED from it (`@pryzm/geometry-boundary-line`). C84 §8.i — a derived value
 * stored is a value that goes stale on the first vertex drag.
 *
 * ⭐ `closed` is AUTHORED, not derived, and the two must not be confused. A
 * rectangle drawn with the `rectangular` mode is a CLOSED loop of 4 vertices with no
 * repeated closing vertex — exactly the Slab / Pool / Balcony convention — and an
 * open run drawn with `linear` is the same array with `closed: false`. Repeating the
 * first vertex at the end to signal closure would make "is this closed?" a geometry
 * question with a floating-point answer.
 *
 * ─── DIMENSIONS ARE NOT STORED AS LITERALS (L-127) ──────────────────────────
 * Every dimensional field is OPTIONAL. "Unset" means *resolve me* — the chain
 * `record → systemType → documented default` lives in exactly ONE place,
 * `resolveBoundaryLineDimensions()` in `@pryzm/geometry-boundary-line`.
 */

/**
 * The line's vertices in WORLD coordinates. Two is the minimum: one point is not a
 * line. When `closed` is true the array is an OPEN loop — do NOT repeat the closing
 * vertex (the Slab / Pool / Balcony convention, so a ring handed to any of them
 * needs no re-normalisation).
 */
const BoundaryLineVertices = z.array(Vec3).min(2);

/**
 * How a dependent element is anchored to the line, so the anchor survives a move.
 *
 * ⭐ THE ANCHOR IS PARAMETRIC, NOT ABSOLUTE, AND THAT IS THE WHOLE MECHANISM.
 * Storing the dependent's world position would make a boundary-line move a no-op
 * (the stored pose would still be the old one). Storing `(segmentIndex, t, offset)`
 * means the dependent's world pose is a FUNCTION of the line, so re-evaluating the
 * function after the move IS the propagation. C105 §3.2.
 *
 * ⚠ `elementKind` is carried because the verdict table (C105 §3.3) is keyed by
 * FAMILY, and reading the family back out of the id prefix would be a second
 * vocabulary for the same fact (C84 EI-8) — element ids in this repo do not all
 * carry their family in the prefix (`section-<ts36>` does not).
 */
export const BoundaryLineAttachmentSchema = z.object({
  /** The dependent element's id, in ITS OWN family's id space. */
  elementId: z.string().min(1),
  /**
   * The dependent's family, spelled exactly as `normaliseMoveType()` spells it
   * (lower-case, no spaces) so the verdict table and the move table agree.
   */
  elementKind: z.string().min(1),
  /** Which segment of the line the dependent is anchored to. 0-based. */
  segmentIndex: z.number().int().nonnegative(),
  /** Normalised position ALONG that segment. 0 = segment start, 1 = segment end. */
  t: z.number().min(0).max(1),
  /**
   * Perpendicular offset from the segment, in metres, measured in the segment's
   * left-normal direction. Zero means "on the line".
   *
   * ⚠ This is what lets a wall drawn 150 mm inside the boundary STAY 150 mm inside
   * it after the line moves, instead of snapping onto the line.
   */
  offset: z.number().default(0),
  /**
   * For LINE-shaped dependents (wall, beam, handrail, curtain wall) the anchor above
   * locates the START; this locates the END. Absent for point- and area-shaped
   * dependents, and absence is meaningful — it is how the propagator knows whether
   * to translate a point or re-seat a span.
   */
  end: z
    .object({
      segmentIndex: z.number().int().nonnegative(),
      t: z.number().min(0).max(1),
      offset: z.number().default(0),
    })
    .optional(),
});
export type BoundaryLineAttachment = z.infer<typeof BoundaryLineAttachmentSchema>;

export const BoundaryLine = defineElement('boundaryLine', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from. Spelled out at the
   * point of use rather than spread from a shared constant, because
   * `check-provenance-coverage` measures the file that declares
   * `defineElement('<kind>')` and an indirection hides the field from its C3
   * retrofit-safety arm.
   */
  provenance: RetrofittedProvenanceSchema,
  /** PV-06 / C75 §1.3 — how much these values can be TRUSTED. A separate axis. */
  confidence: RetrofittedConfidenceSchema,

  /** Owning level. A boundary line is drawn ON a storey, like every plan element. */
  levelId: z.string().default(''),

  /** The polyline itself, in WORLD coordinates. See the note above. */
  vertices: BoundaryLineVertices.default([
    { x: 0, y: 0, z: 0 },
    { x: 5, y: 0, z: 0 },
  ]),

  /** AUTHORED, never derived. `true` = the last vertex joins the first. */
  closed: z.boolean().default(false),

  /**
   * The drawing mode the line was authored with, kept so the property panel can say
   * what the user drew and so a re-solve knows whether the ring is a generated
   * circle (dense) or hand-placed vertices (sparse).
   *
   * ⚠ The vocabulary is `@pryzm/geometry-slab`'s two unions spelled as strings here,
   * because L0 may not import L2. `BOUNDARY_LINE_DRAW_MODES` in
   * `@pryzm/geometry-boundary-line` is the guard that keeps them equal, and its test
   * asserts the two lists are identical rather than merely similar.
   */
  drawMode: z
    .enum(['linear', 'ortho', 'curved', 'rectangular', 'circular', 'elliptical'])
    .default('linear'),

  /**
   * ⭐ THE FOUNDER'S VOLUME BOOL — *"the line could have volume also"*.
   *
   * `false` (the default) → the line is LINEWORK: a 2-D setting-out line, drawn in
   * plan, carrying no solid and no material. `true` → it is EXTRUDED into a solid of
   * `height` × `thickness`, which is what makes an early-stage massing edge.
   *
   * ⚠ THIS FIELD IS THE ELEMENT'S OWN INTENT, AND IT IS **NOT** THE ONLY AUTHORITY.
   * The founder asked for the switch to live *"via a bool setting on Visibility
   * Intent"*, and it does: `ElementGraphicsRules.solid` (C09 / P7). The rule is
   * stated once, in C105 §5, and implemented once, in `resolveBoundaryLineSolidity()`:
   * **the VIEW's intent wins where it expresses an opinion, and this field is the
   * fallback.** Two authorities over one pixel is the defect C84 EI-9 names; naming
   * the precedence is what makes this two INPUTS to one answer instead.
   */
  hasVolume: z.boolean().default(false),

  /**
   * Dependents anchored to this line. See `BoundaryLineAttachmentSchema`.
   *
   * ⭐ THE EDGE LIVES ON THE HOST, DELIBERATELY. C84 EI-PROP-d says a propagation
   * channel is not a substitute for a relationship and that the record must hold an
   * edge to walk. It does — here. The alternative, a `boundaryLineId` field on Wall,
   * Slab, Column, Beam, Roof, Stair, Furniture and Plumbing, would be EIGHT schema
   * amendments across C85–C99 for one host, and would leave the host unable to
   * answer "what is on me?" without scanning every store.
   *
   * ⚠ It is also NOT a `RelationshipType` graph edge. C71 §2.6 requires a new member
   * to land with a writer, a typed reader, a rebuild disposition and a delete
   * behaviour in ONE PR, and — more decisively — C71 §2.5 forbids a writer-first
   * addition. An element-record reference field is the mechanism `Pool.hostSlabId`,
   * `Balcony.childrenIds` and `Lift.servedLevels` already use, and it is governed by
   * this contract rather than by the graph vocabulary.
   */
  attachments: z.array(BoundaryLineAttachmentSchema).default([]),

  // ── Parametric overrides. ALL OPTIONAL — unset means "resolve from the
  //    systemType, then from the documented default". A `.default()` here would
  //    BAKE A LITERAL into L0 and destroy the systemType tier (the L-127 disease).

  /** Solid height in metres when `hasVolume`. Ignored entirely when it is false. */
  height: z.number().positive().optional(),
  /** Solid thickness in metres when `hasVolume`, centred on the line. */
  thickness: z.number().positive().optional(),
  /** Vertical offset of the solid's base from the level's FFL, in metres. */
  baseOffset: z.number().optional(),

  /** Boundary-line system type — tier 2 of the dimension-resolution chain. */
  systemTypeId: z.string().optional(),
  /**
   * ⚠ C100 — an element that renders a SOLID must name a REAL material. A boundary
   * line with `hasVolume: false` renders no surface and legitimately names none;
   * `resolveBoundaryLineMaterial()` is the one place that decides, and it refuses to
   * return an unnamed colour for a solid. `HandrailFragmentBuilder`'s standing
   * *"3 handrails have NO RESOLVABLE MATERIAL"* is the defect this exists not to
   * repeat.
   */
  materialId: z.string().optional(),
  materialColor: z.string().optional(),

  /** Free-text name shown in the browser and the property panel. */
  name: z.string().optional(),
})
  // (1) A boundary line with zero length is not a line. Mirrors the Wall and Slab
  //     non-degeneracy refines: a zero-length run would produce an undefined
  //     direction, so every attachment anchored to it would have an undefined
  //     normal and the propagator could not place anything.
  .refine(
    (b) => {
      let longest = 0;
      const n = b.closed ? b.vertices.length : b.vertices.length - 1;
      for (let i = 0; i < n; i++) {
        const a = b.vertices[i]!;
        const c = b.vertices[(i + 1) % b.vertices.length]!;
        longest = Math.max(longest, Math.hypot(c.x - a.x, c.z - a.z));
      }
      return longest >= 0.001;
    },
    { message: 'Boundary line must have at least one segment 1 mm or longer.' },
  )
  // (2) A CLOSED line needs three vertices to enclose anything. Two closed vertices
  //     are a degenerate back-and-forth, not a loop, and every downstream ring
  //     consumer (earcut, walls-from-ring, the solid extruder) would refuse it later
  //     and less legibly.
  .refine((b) => !b.closed || b.vertices.length >= 3, {
    message: 'A closed boundary line needs at least 3 vertices.',
  })
  // (3) OPEN-LOOP convention, identical to Slab / Pool / Balcony — so a ring handed
  //     from this family to any of them needs no re-normalisation.
  .refine(
    (b) => {
      if (!b.closed || b.vertices.length < 2) return true;
      const first = b.vertices[0]!;
      const last = b.vertices[b.vertices.length - 1]!;
      return first.x !== last.x || first.y !== last.y || first.z !== last.z;
    },
    { message: 'A closed boundary line must be an OPEN loop (do not duplicate the closing vertex).' },
  )
  // (4) An attachment must name a segment that EXISTS. A dangling segment index is
  //     the shape that turns a propagation into a silent skip: the propagator would
  //     find no segment, have nothing to compute, and — without this — say nothing.
  //     Refusing at parse time means the record can never hold one.
  .refine(
    (b) => {
      const segCount = b.closed ? b.vertices.length : b.vertices.length - 1;
      return b.attachments.every(
        (a) =>
          a.segmentIndex < segCount &&
          (a.end === undefined || a.end.segmentIndex < segCount),
      );
    },
    { message: 'Every attachment must name a segment index that exists on this line.' },
  );

export type BoundaryLine = z.infer<typeof BoundaryLine>;
