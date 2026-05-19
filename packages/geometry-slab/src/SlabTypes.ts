import * as THREE from '@pryzm/renderer-three/three';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { CoreElement } from '@pryzm/core-app-model';
import { SlabSketch } from './SketchTypes';

export interface SlabCreatorCallbacks {
    applyHighlight: (obj: THREE.Object3D) => void;
    updateInspector: (obj: THREE.Object3D) => void;
    zoomToAll: () => Promise<void>;
    getHdriTexture: () => Promise<THREE.Texture | null>;
    getCurrentVisualStyle: () => VisualStyle;
}

export type SlabToolMode = 'NONE' | 'FLOOR_SKETCH' | 'REGION_SLAB' | 'POLYLINE_SLAB' | 'HOLLOW_SLAB';

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
    | 'waterproofing';

/**
 * §03-1.3: A single material layer within a slab system type.
 * Thickness is in metres. materialColor is a CSS hex string.
 */
export interface SlabLayer {
    name: string;
    thickness: number;
    function: SlabLayerFunction;
    materialColor?: string;
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
