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
     * §MAT-CW-GLAZING (#53) — optional glazing/panel colour resolved from the
     * system type / material assignment, mirroring `mullionColor`. When absent the
     * builder uses a realistic architectural-glass default (aligned with the CW
     * plugin material-bridge). Forward-compatible with the #105 materials
     * repository, which will populate this from a per-element material choice.
     */
    glazingColor?: string;
    /**
     * §MAT-CW-MATERIAL (#53 / M-H1-Part-2, 2026-05-24) — optional material-library
     * IDs for the mullion (frame metal) and glazing (glass) slots. When set AND the
     * builder has the STANDARD_MATERIAL_LIBRARY map injected, the builder resolves
     * each to a real PBR material (e.g. anodised-aluminium mullions, tempered-glass
     * glazing) instead of a flat colour — mirroring `wall.materialId` /
     * `roof.materialId` (DAILY-USE-AUDIT §M-H1). When absent the builder falls back
     * to `mullionColor` / `glazingColor`. Forward-compatible with the #105 materials
     * repository, which will populate these from a per-element material choice.
     */
    mullionMaterialId?: string;
    glazingMaterialId?: string;
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
