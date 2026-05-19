import * as THREE from '@pryzm/renderer-three/three';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { CoreElement } from '@pryzm/core-app-model';
import { CurtainGridSystem } from './CurtainGridSystem';
import { Point3D } from '@pryzm/core-app-model';

/**
 * Drawing mode for CurtainWallTool.
 *
 * SINGLE   — one segment at a time; shows Finish/Continue UI after each segment (legacy default).
 * POLYLINE — continuous straight segments; end point becomes next start automatically; ESC to stop.
 * ORTHO    — same as POLYLINE but endpoints are constrained to the nearest 90° cardinal axis.
 * CURVED   — three-point arc: click start, click a through-point, click end; tool generates N
 *            straight approximating segments along the circular arc.
 */
export type CurtainWallDrawingMode = 'SINGLE' | 'POLYLINE' | 'ORTHO' | 'CURVED';

export interface CurtainWallData extends CoreElement {
    type: 'curtain-wall';
    levelId: string;
    /**
     * P0.3 DTO Migration — plain serialisable points; no THREE class instances.
     * Contract §01 §3.4 v2.0: store holds Immer-compatible data only.
     * Builder reconstructs THREE.Vector3 from these at projection time.
     */
    baseLine: [Point3D, Point3D];
    height: number;
    baseOffset: number;
    /** Legacy uniform spacing — kept for backward compatibility. */
    gridXSpacing: number;
    /** Legacy uniform spacing — kept for backward compatibility. */
    gridYSpacing: number;
    mullionSize: number;
    panelThickness: number;
    mullionColor?: string;
    /**
     * Phase 1+ Addressable Grid System.
     *
     * When present, this fully describes the U/V grid topology (non-uniform spacing
     * is supported). When absent, the builder migrates from the legacy scalar
     * gridXSpacing / gridYSpacing values for full backward compatibility.
     */
    gridSystem?: CurtainGridSystem;
}

export interface CurtainWallToolCallbacks {
    applyHighlight: (obj: THREE.Object3D) => void;
    updateInspector: (obj: THREE.Object3D) => void;
    zoomToAll: () => Promise<void>;
    getHdriTexture: () => Promise<THREE.Texture | null>;
    getCurrentVisualStyle: () => VisualStyle;
    onCancel?: () => void;
}
