import * as THREE from '@pryzm/renderer-three/three';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { CoreElement } from '@pryzm/core-app-model';
import { SlabSketch } from './SketchTypes';
// §FEAT-BOUNDARY-SHAPE-DESCRIPTOR (L-1323) — the shape-intent record.
import type { BoundaryShapeDescriptor } from './boundaryLoops';

export interface SlabCreatorCallbacks {
    applyHighlight: (obj: THREE.Object3D) => void;
    updateInspector: (obj: THREE.Object3D) => void;
    zoomToAll: () => Promise<void>;
    getHdriTexture: () => Promise<THREE.Texture | null>;
    getCurrentVisualStyle: () => VisualStyle;
}

// §FEAT-PLATE-SHAPE-MODES / L-1324 — the two closed-loop gestures join the 3-D
// tool's own mode union. ⭐ C92 SL-Voc-2 recorded this union as declared THREE
// times (here, `SlabTool.ts:164` and `:331`); those two copies now REFERENCE
// this one, so the union has a single declaration and adding a mode is one edit.
export type SlabToolMode =
    | 'NONE' | 'FLOOR_SKETCH' | 'REGION_SLAB' | 'POLYLINE_SLAB' | 'HOLLOW_SLAB'
    | 'CIRCULAR_SLAB' | 'ELLIPTICAL_SLAB';

/**
 * §03-1.3: Layer function describes the role each material layer plays in the
 * slab assembly — used for BIM semantics, scheduling, and future rule checks.
 */
export type SlabLayerFunction =
    | 'finish-surface'
    | 'screed'
    | 'insulation'
    | 'structure'
    | 'substrate'
    | 'waterproofing'
    // ── §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — four LANDSCAPE build-up roles ────
    //
    // ⚠ WHY A LANDSCAPE LAYER MUST NOT REUSE 'finish-surface'.
    // `RoomFinishResolver.ts:147` resolves a room's floor finish by finding the
    // layer whose `function === 'finish-surface'` on ANY slab on the level. A
    // garden's turf tagged that way would be reported as an interior ROOM'S
    // FLOOR FINISH — a silent cross-element corruption wearing the costume of a
    // convenient reuse, and one the founder would meet as "why is my bedroom
    // floor grass?". These four roles keep a landscape build-up legible to
    // scheduling without ever answering a question about an interior room.
    | 'growing-medium'
    | 'sub-base'
    | 'drainage'
    | 'geotextile'
    // 'surfacing' — the WEARING COURSE of a landscape build-up: artificial turf
    // pile, the top dressing of a gravel bed, a sand bed, bark mulch, a compacted
    // decomposed-granite path. None of these is a growing medium (nothing grows in
    // them), none is a sub-base (they are the surface you stand on), and the one
    // pre-existing role that fits — 'finish-surface' — is the poisonous one named
    // above. Modelling them as anything else would put a lie in the layer record
    // and in every schedule that reads it.
    | 'surfacing';

/**
 * §SLABTYPES117 — how a layer is ARTICULATED in 3D when it is not a solid poché.
 *
 * A plain layer is the outline extruded to the layer's thickness. The founder's
 * *"glass structural slab with metal beams"* needs one layer that is a GRID of beams,
 * and two of the fancy rows need a layer that is only a perimeter BAND. Both are
 * still layers — a name, a thickness, a function, a master material — and this
 * field says only what the record does not already say. In particular:
 *
 *   · beam DEPTH is the layer's `thickness` (one number, one vocabulary);
 *   · beam COLOUR is the layer's `materialId` (C84 EI-9 — there is deliberately no
 *     `beamColor`; the Layers editor and the §SLAB116 restyle path already own it).
 *
 * ADDITIVE and OPTIONAL (C47): every pre-existing layer has none and is a solid.
 * Drawn by `CompositeSlabBuilder`; the count of beams is DERIVED from the span at a
 * constant beam size, so a wider slab gets more beams, never fatter ones.
 */
export type SlabLayerArticulation =
    | {
        kind: 'beam-grid';
        /** Beam width in metres — constant; never derived from the span. */
        beamWidth: number;
        /** Centre-to-centre ceiling in metres: bays = ceil(span / maxSpacing). */
        maxSpacing: number;
        /** `'both'` (default) is an orthogonal grid; `'x'` / `'z'` are one-way joists. */
        direction?: 'x' | 'z' | 'both';
        /** A ring beam at the outline and a trimmer around every opening (default true). */
        perimeter?: boolean;
      }
    | {
        kind: 'perimeter-band';
        /** Band width in metres, measured inward from the outline (and outward from a hole). */
        bandWidth: number;
      };

/**
 * §03-1.3: A single material layer within a slab system type.
 * Thickness is in metres. materialColor is a CSS hex string.
 */
export interface SlabLayer {
    name: string;
    thickness: number;
    function: SlabLayerFunction;
    materialColor?: string;
    /**
     * §FEAT-LANDSCAPE-SLAB-TYPES (L-963) / C100 §2 — a MASTER catalogue id
     * (`MATERIAL_CATALOG` in `@pryzm/schemas/materials`), REFERENCED not copied.
     *
     * This is the SAME spelling `SlabData.materialId` already uses — deliberately
     * not a sixth vocabulary (C84 EI-8). Before this field a layer could only
     * carry `materialColor`, a hex, so publishing a lawn type meant writing
     * `#436f2c` into the store: a materialised COPY of `landscape-grass-lawn`'s
     * colour, which is precisely the defect C100 §0.2 was written about. The
     * builder resolves this id to a colour at render time, so editing the master
     * row moves every slab that names it.
     *
     * `materialColor` remains the fallback for layers that name no material, and
     * every pre-existing layer is exactly that — so this field is additive.
     */
    materialId?: string;
    /**
     * §SLABTYPES117 — see {@link SlabLayerArticulation}. Absent ⇒ a solid layer,
     * which is every layer authored before this field existed.
     */
    articulation?: SlabLayerArticulation;
}

export interface SlabData extends CoreElement {
    type: 'slab';
    width: number;
    depth: number;
    thickness: number;
    /**
     * Slab origin in world XZ space.
     * Stored as a plain { x, y, z } object — NOT a THREE.Vector3 instance.
     * structuredClone() in SlabStore strips class methods, so callers must not
     * call Vector3 methods on this field. The builder reads only .x and .z;
     * .y is always 0 (world Y is resolved at projection time from BimManager).
     */
    position: { x: number; y: number; z: number };
    polygon?: { x: number; y: number }[];
    holes?: { x: number; y: number }[][];
    materialColor?: string;
    materialId?: string;
    phase?: string;
    /**
     * Optional parametric sketch.
     * When present, the builder resolves this sketch to a polygon at projection
     * time using WallFaceResolver. HostReferenceEdges automatically follow wall
     * geometry changes via SlabDependencyTracker.
     * When absent, the static `polygon` field is used directly (backward compat).
     */
    sketch?: SlabSketch;
    /**
     * §FEAT-BOUNDARY-SHAPE-DESCRIPTOR (L-1323) — the shape's INTENT, alongside the ring.
     *
     * ⭐ `polygon` REMAINS the geometry and the single source of truth: every builder,
     * exporter and take-off reads it and NONE of them reads this. What this adds is the
     * one thing tessellation destroys — "this ring is a circle of radius r centred here"
     * — so a re-edit can offer a RADIUS instead of 48 handles (C81, intent preservation).
     *
     * ⚠ ABSENT ⇒ A FREE POLYGON. Every slab authored before this field existed simply
     * has none, which is the correct statement about it. Nothing migrates.
     *
     * ⛔ It MUST be dropped by any edit that moves, adds or removes a vertex — see
     * `resolveBoundaryShapeAfterEdit`. A descriptor that outlived its geometry would
     * claim a circle the slab no longer is.
     */
    boundaryShape?: BoundaryShapeDescriptor;
    /**
     * §03 Semantic anchor: the slab is positioned so its TOP face aligns
     * with the level datum (Finished Floor Level).
     * Default: 'LEVEL'.
     */
    topReference?: 'LEVEL';
    /**
     * §03 Vertical offset (metres) applied to the top face above the level
     * elevation. Positive = above, negative = below. Defaults to 0.
     */
    baseOffset?: number;

    /**
     * §03-1.3: Optional reference to the SlabSystemType that was applied to
     * this slab. Null means no type / plain slab.
     * When present, `layers` contains a snapshot of the type's layers at the
     * time the type was applied (edit-type semantics — immune to later type edits).
     */
    systemTypeId?: string | null;

    /**
     * §03-1.3: Layer stack snapshot. Ordered top-to-bottom.
     * Present only when a SlabSystemType has been applied.
     * The builder uses the sum of layer thicknesses as the rendered thickness.
     */
    layers?: SlabLayer[];
}
