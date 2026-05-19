import { CoreElement } from '@pryzm/core-app-model';
import { Point3D } from '@pryzm/core-app-model';

export interface ColumnData extends CoreElement {
    type: 'column';
    /**
     * World-space position of the column base.
     * Plain Point3D DTO — NOT THREE.Vector3.
     * ColumnFragmentBuilder reconstructs mesh.position from x, y, z at render time.
     * Contract: 01-BIM §3.4 v2.0, DTO-MIGRATION-IMPLEMENTATION-PLAN Phase D
     */
    position: Point3D;
    height: number;
    rotation: number;
    /**
     * 'rectangular' | 'circular' = concrete/generic profiles.
     * 'UC' | 'UB' = steel I/H section (parametric from SteelProfileLibrary).
     */
    profile: 'rectangular' | 'circular' | 'UC' | 'UB';
    width: number; // or diameter — used for concrete/circular profiles
    depth: number; // used for concrete rectangular profile
    baseOffset: number;
    materialId?: string;
    materialColor?: string;
    /**
     * Steel profile name (e.g. "203x203x46") — used when profile is 'UC' or 'UB'.
     * Must match a name in SteelProfileLibrary.
     */
    steelProfileName?: string;
}
