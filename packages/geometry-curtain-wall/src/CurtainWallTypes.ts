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
     * §FEAT-CURTAIN-WALL-TYPE-CATALOGUE (L-958) — the published type this wall was
     * last assigned, or absent for a wall drawn before / outside the catalogue.
     *
     * A REFERENCE, not a substitute: the type's dimensions are ALSO materialised
     * into `gridXSpacing` / `mullionSize` / … because those are what the builder
     * reads, and a builder forced to resolve a catalogue id would couple geometry
     * to a store it has no business knowing. This id exists so the property panel
     * can answer "which type is this?" from the RECORD rather than by guessing back
     * from dimensions — `ElementTypeCatalogRegistry.currentTypeId()` reads exactly
     * this field, and §FEAT-ELEMENT-TYPE-PICKER-REGISTRY requires a current type to
     * be read, never inferred.
     *
     * Named `systemTypeId` to match `Wall`, `Slab`, `Pool` and `Water`
     * (`packages/schemas/src/elements/*.ts`) — C84 EI-8, one vocabulary per concept.
     *
     * ⚠ A wall whose dimensions are later hand-edited KEEPS this id, and that is
     * correct: it records what the user chose. The panel preselects it; it is not a
     * claim that the geometry still matches the type verbatim.
     */
    systemTypeId?: string;
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
