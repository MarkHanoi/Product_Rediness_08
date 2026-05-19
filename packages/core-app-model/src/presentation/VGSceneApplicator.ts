/**
 * VGSceneApplicator — Phase 1+2+4 Rendering Integration
 *
 * Bridges VGGovernanceStore (data) to the Three.js scene (rendering).
 * Applies per-category fill colour, transparency, visibility, halftone,
 * edge colour, and line weight to scene meshes based on userData.elementType.
 *
 * Phase 2 additions (additive, non-breaking):
 *   - activeViewId tracking for view-level override propagation
 *   - applyAll(viewId?) — view-aware traversal
 *   - Multi-model scene isolation: objects with userData.modelId set are only
 *     processed when their modelId matches this applicator's modelId.
 *     Objects without userData.modelId are treated as belonging to 'model-default'
 *     for full backward compatibility with existing builders.
 *   - Subscribes to vg:view-style-set, vg:view-style-reset, view-selected, view-closed
 *
 * Phase 4 additions (P4.3 + P4.4):
 *   P4.3 — Edge overlay colour via LineBasicMaterial (Doc 20 migration):
 *     - WallEdges and SlabEdges categories mapped so edge overlays respond to VG changes
 *     - Previously used LineSegments2 + LineMaterial (GLSL); replaced with THREE.LineSegments
 *       + THREE.LineBasicMaterial (WebGPU-compatible). applyToLine() handles colour updates.
 *     - isLineMaterial2 detection and applyToLineMaterial2() removed (Doc 20 migration).
 *   P4.4 — True halftone shader:
 *     - Replaces the Phase 1 opacity proxy (opacity cap at 0.55)
 *     - Uses a custom THREE.ShaderMaterial with a GLSL dot-grid fragment shader
 *     - World-space XZ coordinates drive the dot grid, so no UV mapping required
 *     - ShaderMaterial cached per mesh; uniforms updated on style change without material swap
 *
 * Design principles (§01, §05, §09, §10):
 *   - Non-destructive: originals stored in userData.vgOriginalMaterial (not
 *     userData.originalMaterial, which belongs to GraphicHierarchyRenderer).
 *   - Additive: does not replace or wrap GraphicHierarchyRenderer; both coexist.
 *   - Event-driven: listens to VG store events and presentation-mode-changed.
 *   - Material cloning: shared materials are cloned before mutation.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { setUD } from './userDataSafe';
import { vgGovernanceStore, VGCategoryStyle } from './VGGovernanceStore';
import { threeDAppearanceResolver } from '@pryzm/core-app-model';
/**
 * @deprecated Contract 25b — back-end implementation surface for 3D mesh
 * visibility. Will be replaced by `IntentSceneApplicator` (driven by
 * IntentRuleResolver) in a follow-up release. Do not add new importers.
 */
import { vgInstanceOverrideStore } from './VGInstanceOverrideStore';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { viewTechnicalDrawingCache } from '../views/ViewTechnicalDrawingCache';
import { storeRegistry } from '../StoreRegistry';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { phaseFilterStore } from '@pryzm/core-app-model';
import { BUILT_IN_PHASE_FILTER_IDS, type PhaseDisplayStatus } from '@pryzm/core-app-model';

type VGCategory =
    | 'wall' | 'slab' | 'column' | 'beam'
    | 'door' | 'window' | 'curtain-wall' | 'curtain-panel'
    | 'roof' | 'stair' | 'handrail' | 'furniture'
    | 'ceiling'
    | 'plumbing' | 'grid' | 'level' | 'opening';

/**
 * DOC-1.13 — VG category → ISO 13567 DXF layer name.
 *
 * Must stay in sync with ELEMENT_TYPE_TO_PROJECTION_LAYER in
 * EdgeProjectorService.ts — the service creates layers with these names;
 * applyToProjectionLayers() targets the same names.
 *
 * Categories not listed here (e.g. grid, level, opening) project to the
 * generic 'projection-visible' layer and are controlled through that layer's
 * overall visibility rather than individually.
 */
const CATEGORY_TO_DXF_LAYER: Readonly<Record<string, string>> = {
    wall:           'A-WALL',
    slab:           'A-FLOR',
    column:         'A-COLS',
    beam:           'A-BEAM',
    door:           'A-DOOR',
    window:         'A-GLAZ',
    'curtain-wall': 'A-WALL',
    'curtain-panel':'A-GLAZ',
    stair:          'A-STRS',
    handrail:       'A-STRS',
    roof:           'A-ROOF',
    furniture:      'A-FURN',
    plumbing:       'A-PLMB',
    ceiling:        'A-CEIL',
} as const;

/** Converts a CSS hex string (#rrggbb) to an integer understood by THREE Color API. */
function cssHexToInt(cssHex: string): number {
    return parseInt(cssHex.replace('#', ''), 16);
}

const ELEMENT_TYPE_TO_VG_CATEGORY: Record<string, VGCategory> = {
    'Wall':          'wall',    'WallPart':      'wall',    'LayeredWall':   'wall',    'WallLayer':    'wall',
    // P4.3: WallEdges (plural — from WallEdgeOverlayBuilder, userData.elementType = 'WallEdges')
    // inherits the wall category so edge colour and lineWeight respond to VG wall style changes.
    'WallEdges':     'wall',
    'Slab':          'slab',    'SlabPart':      'slab',    'SlabLayer':     'slab',
    // P4.3: SlabEdges now mapped (removed from NULL_TYPES) so slab edge overlays respond to VG.
    'SlabEdges':     'slab',
    'Column':        'column',
    'Beam':          'beam',
    'Door':          'door',    'DoorFrame':     'door',    'DoorLeaf':      'door',    'DoorPanel':    'door',
    'Window':        'window',  'WindowFrame':   'window',  'WindowGlass':   'window',
    'CurtainWall':   'curtain-wall',
    'CurtainPanel':  'curtain-panel', 'CurtainPanelFill': 'curtain-panel',
    'Roof':          'roof',    'RoofMesh':      'roof',    'RoofPart':      'roof',
    'Stair':         'stair',   'StairMesh':     'stair',   'StairStep':     'stair',   'StairLanding': 'stair',   'stairs': 'stair',
    'Handrail':      'handrail','HandrailPart':  'handrail',
    'Furniture':     'furniture','FurniturePart': 'furniture','GenericComponent': 'furniture',
    'PlumbingFixture':'plumbing',
    'floor':         'slab',    'Floor':       'slab',    'FloorPart':   'slab',
    'ceiling':       'ceiling', 'Ceiling':     'ceiling', 'CeilingPart': 'ceiling',
    'Grid':          'grid',    'GridLine':      'grid',    'BimGrid':      'grid',
    'Level':         'level',   'LevelLine':     'level',   'BimLevel':     'level',
    'Opening':       'opening',
};

// NULL_TYPES: element types that should always be skipped by the VG applicator.
// Note: 'WallEdge' (singular) is a legacy type distinct from 'WallEdges' (plural, P4.3).
// 'SlabEdges' was in this set before Phase 4 — it is now mapped to 'slab' above.
const NULL_TYPES = new Set([
    'Preview', 'Snap', 'EdgeOverlay', 'Dimension', 'SelectionBox',
    'WallEdge', 'TransformHelper',
]);

function getVGCategory(elementType: string | undefined): VGCategory | null {
    if (!elementType) return null;
    if (NULL_TYPES.has(elementType)) return null;
    return ELEMENT_TYPE_TO_VG_CATEGORY[elementType] ?? null;
}

function getLineWeightOffset(lineWeight: number): { factor: number; units: number } {
    if (lineWeight >= 10) return { factor: -3, units: -3 };
    if (lineWeight >= 6)  return { factor: -2, units: -2 };
    if (lineWeight >= 3)  return { factor: -1, units: -1 };
    return { factor: 0, units: 0 };
}

function normalizePhaseToken(value: string | undefined | null): string | null {
    if (!value) return null;
    const token = value.trim().toLowerCase().replace(/^phase[:=\s-]*/, '').replace(/[_\s]+/g, '-');
    if (!token) return null;
    if (token === 'existing' || token === 'exist') return 'Existing';
    if (token === 'demolition' || token === 'demolished' || token === 'demo') return 'Demolition';
    if (token === 'new' || token === 'new-work' || token === 'new-construction' || token === 'newconstruction') return 'New Construction';
    if (token === 'future') return 'Future';
    return value.trim();
}

function extractPhaseFromTags(tags: unknown): string | null {
    if (!Array.isArray(tags)) return null;
    const known = new Set(['Existing', 'Demolition', 'New Construction', 'Future']);
    for (const tag of tags) {
        if (typeof tag !== 'string') continue;
        const normalized = normalizePhaseToken(tag);
        if (normalized && known.has(normalized)) return normalized;
    }
    return null;
}

function readElementFromStore(elementId: string): any | null {
    const store = storeRegistry.getStoreForElement(elementId);
    if (!store) return null;
    if (typeof store.getById === 'function') return store.getById(elementId) ?? null;
    if (typeof store.get === 'function') return store.get(elementId) ?? null;
    return null;
}

// ── P4.4 Halftone ShaderMaterial ─────────────────────────────────────────────
// World-space XZ dot grid. No UV mapping required — works on any geometry.
// Dot spacing of 0.15 m and dot size ratio of 0.40 produce a readable halftone
// at architectural scale. Both are exposed as uniforms for future extension.
const HALFTONE_VERTEX_SHADER = `
varying vec3 vWorldPos;
void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HALFTONE_FRAGMENT_SHADER = `
uniform vec3  u_fillColor;
uniform float u_dotSpacing;
uniform float u_dotSize;
varying vec3  vWorldPos;

void main() {
    vec2 coord = fract(vWorldPos.xz / u_dotSpacing);
    float dist = length(coord - 0.5);
    if (dist > u_dotSize * 0.5) discard;
    gl_FragColor = vec4(u_fillColor, 1.0);
}
`;

function createHalftoneMaterial(fillColorHex: string): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            u_fillColor:   { value: new THREE.Color(fillColorHex) },
            u_dotSpacing:  { value: 0.15 },
            u_dotSize:     { value: 0.40 },
        },
        vertexShader:   HALFTONE_VERTEX_SHADER,
        fragmentShader: HALFTONE_FRAGMENT_SHADER,
        transparent:    false,
        side:           THREE.DoubleSide,
    });
}

export class VGSceneApplicator {
    private listeners: Array<() => void> = [];
    private readonly MODEL_KEY  = 'vgOriginalMaterial';
    private readonly CLONED_KEY = 'vgClonedMaterial';

    /** Phase 2: tracks the currently active view for view-level overrides */
    private activeViewId: string | null = null;

    /**
     * DOC-4.7: The BimManager level ID whose elements should be rendered as a
     * halftoned underlay reference within the current plan view.
     * Set by ViewController on plan activation; cleared when returning to 3D.
     * When non-null, any object whose userData.levelId matches this value has
     * style.halftone forced to true so the existing P4.4 ShaderMaterial path
     * renders a dot-grid ghost for that element.
     */
    private _underlayLevelId: string | null = null;

    constructor(
        private scene: THREE.Scene,
        private store: ReturnType<typeof Object.create> & typeof vgGovernanceStore,
        private modelId: string,
    ) {
        this.subscribeToEvents();
        this.setupResizeHandler();
    }

    private subscribeToEvents() {
        const listen = (event: string, handler: (e: Event) => void) => {
            window.addEventListener(event, handler);
            this.listeners.push(() => window.removeEventListener(event, handler));
        };

        listen('vg:category-style-set', (e) => {
            const { modelId, category } = (e as CustomEvent).detail;
            if (modelId === this.modelId) {
                this.applyCategory(category, this.activeViewId ?? undefined);
                // DOC-1.13: Propagate VG change to the active view's projection layers.
                if (this.activeViewId) {
                    const drawing = viewTechnicalDrawingCache.get(this.activeViewId);
                    if (drawing) this.applyToProjectionLayers(drawing, this.activeViewId);
                }
            }
        });
        listen('vg:category-style-reset', (e) => {
            const { modelId, category } = (e as CustomEvent).detail;
            if (modelId === this.modelId) {
                this.applyCategory(category, this.activeViewId ?? undefined);
                // DOC-1.13: Propagate VG reset to the active view's projection layers.
                if (this.activeViewId) {
                    const drawing = viewTechnicalDrawingCache.get(this.activeViewId);
                    if (drawing) this.applyToProjectionLayers(drawing, this.activeViewId);
                }
            }
        });
        listen('vg:model-template-assigned', (e) => {
            const { modelId } = (e as CustomEvent).detail;
            if (modelId === this.modelId) this.applyAll(this.activeViewId ?? undefined);
        });
        listen('vg:template-updated', () => {
            this.applyAll(this.activeViewId ?? undefined);
        });
        listen('presentation-mode-changed', () => {
            this.applyAll(this.activeViewId ?? undefined);
        });

        listen('pf:filter-created', () => {
            this.applyAll(this.activeViewId ?? undefined);
        });
        listen('pf:filter-updated', () => {
            this.applyAll(this.activeViewId ?? undefined);
        });
        listen('pf:filter-deleted', () => {
            this.applyAll(this.activeViewId ?? undefined);
        });
        listen('pf:store-loaded', () => {
            this.applyAll(this.activeViewId ?? undefined);
        });
        listen('pf:store-reset', () => {
            this.applyAll(this.activeViewId ?? undefined);
        });
        listen('vd:view-updated', (e) => {
            const { viewId } = (e as CustomEvent).detail ?? {};
            if (viewId === this.activeViewId) {
                // DOC-4.7: Re-read underlay settings when the active view's definition
                // is updated (e.g. user changes underlay level in ViewPropertiesPanel).
                const updatedDef = viewDefinitionStore.get(viewId as string);
                const newUnderlayLevelId = updatedDef?.underlay?.baseLevelId ?? null;
                if (this._underlayLevelId !== newUnderlayLevelId) {
                    this._underlayLevelId = newUnderlayLevelId;
                    console.log(
                        `[VGSceneApplicator] DOC-4.7 vd:view-updated → underlayLevelId=${newUnderlayLevelId ?? 'null'}`
                    );
                }
                this.applyAll(this.activeViewId ?? undefined);
            }
        });

        // Phase 2: View-level override events
        listen('vg:view-style-set', (e) => {
            const { viewId, modelId, category } = (e as CustomEvent).detail;
            if (modelId === this.modelId && viewId === this.activeViewId) {
                this.applyCategory(category, this.activeViewId ?? undefined);
                // DOC-1.13: Propagate view-level VG override to projection layers.
                const drawing = viewTechnicalDrawingCache.get(viewId as string);
                if (drawing) this.applyToProjectionLayers(drawing, viewId as string);
            }
        });
        listen('vg:view-style-reset', (e) => {
            const { viewId, modelId, category } = (e as CustomEvent).detail;
            if (modelId === this.modelId && viewId === this.activeViewId) {
                this.applyCategory(category, this.activeViewId ?? undefined);
                // DOC-1.13: Propagate view-level VG reset to projection layers.
                const drawing = viewTechnicalDrawingCache.get(viewId as string);
                if (drawing) this.applyToProjectionLayers(drawing, viewId as string);
            }
        });

        // DOC-4.1: Instance override events — re-apply the full scene so the
        // affected element updates immediately without a full VG re-apply.
        listen('vg:instance-override-set', (e) => {
            const { viewId } = (e as CustomEvent).detail;
            if (viewId === this.activeViewId) {
                this.applyAll(this.activeViewId ?? undefined);
            }
        });
        listen('vg:instance-override-cleared', (e) => {
            const { viewId } = (e as CustomEvent).detail;
            if (!viewId || viewId === this.activeViewId) {
                this.applyAll(this.activeViewId ?? undefined);
            }
        });

        // Phase 2: React to view activation/deactivation
        listen('view-selected', (e) => {
            const detail = (e as CustomEvent).detail;
            const viewId = detail?.viewId ?? detail?.view?.id ?? null;
            if (viewId) {
                this.activeViewId = viewId as string;
                this.applyAll(this.activeViewId);
            }
        });
        listen('view-closed', () => {
            this.activeViewId = null;
            this.applyAll();
        });
    }

    /**
     * Doc 20 migration: LineMaterial resize handler removed.
     * LineBasicMaterial has no resolution uniform and needs no resize handling.
     * The window.addEventListener call that was here is no longer needed.
     */
    private setupResizeHandler(): void {
        // No-op after Doc 20 migration (LineMaterial → LineBasicMaterial).
        // Kept as a named method so any subclass or future phase can extend it
        // without touching the constructor call site.
    }

    /**
     * Re-applies all VG styles to the scene.
     * Phase 2: accepts an optional viewId for the 4-tier cascade.
     */
    applyAll(viewId?: string): void {
        this.scene.traverse((obj) => this.processObject(obj, null, viewId));
    }

    /**
     * Optimised partial re-apply — only touches meshes of the given category.
     * Phase 2: accepts an optional viewId.
     */
    applyCategory(category: VGCategory | string, viewId?: string): void {
        this.scene.traverse((obj) => this.processObject(obj, category, viewId));
    }

    /**
     * DOC-4.7 — Underlay level control.
     *
     * Sets the BimManager level ID whose elements will be forced into halftone
     * (dot-grid ghost) style during the next `applyAll()` traversal.
     *
     * Call this from ViewController on plan view activation with the underlay's
     * `baseLevelId`.  Call with `null` when returning to 3D or when no underlay
     * is configured, so underlay elements revert to their normal VG style.
     *
     * Contract:
     *   - Only elements that explicitly carry `userData.levelId` matching this
     *     value are halftoned by this path.  Elements without a `userData.levelId`
     *     (e.g. IFC-imported fragments) continue to be handled by
     *     `UnderlayRenderService` via the Z-band intersection pass.
     *   - This method calls `applyAll()` immediately so the scene updates without
     *     waiting for the next VG event.
     *   - Follows the same additive, non-destructive principle as all other VG
     *     applicator operations (§01 §5, §03 §1.1).
     */
    setUnderlayLevelId(levelId: string | null): void {
        if (this._underlayLevelId === levelId) return; // no-op when unchanged
        this._underlayLevelId = levelId;
        console.log(`[VGSceneApplicator] DOC-4.7 underlayLevelId=${levelId ?? 'null'}`);
        this.applyAll(this.activeViewId ?? undefined);
    }

    private getPhaseFilterIdForView(viewId?: string): string | null {
        if (!viewId) return null;
        const view = viewDefinitionStore.get(viewId);
        const temporal = view?.temporal;
        if (!temporal) return null;
        if (temporal.phaseFilterId) return temporal.phaseFilterId;

        const token = normalizePhaseToken(temporal.phase ?? temporal.phaseFilter);
        if (token === 'Existing') return BUILT_IN_PHASE_FILTER_IDS.EXISTING_ONLY;
        if (token === 'Demolition') return BUILT_IN_PHASE_FILTER_IDS.DEMOLITION_PLAN;
        if (token === 'New Construction') return BUILT_IN_PHASE_FILTER_IDS.NEW_CONSTRUCTION_ONLY;
        return null;
    }

    private getElementPhase(obj: THREE.Object3D, elementId?: string): string | null {
        const userData = obj.userData ?? {};
        const directPhase =
            normalizePhaseToken(userData.phase) ??
            normalizePhaseToken(userData.properties?.phase) ??
            normalizePhaseToken(userData.metadata?.phase);
        if (directPhase) return directPhase;

        const userDataTagPhase =
            extractPhaseFromTags(userData.tags) ??
            extractPhaseFromTags(userData.metadata?.tags);
        if (userDataTagPhase) return userDataTagPhase;

        if (!elementId) return null;
        const element = readElementFromStore(elementId);
        if (!element) return null;

        return (
            normalizePhaseToken(element.phase) ??
            normalizePhaseToken(element.properties?.phase) ??
            normalizePhaseToken(element.metadata?.phase) ??
            extractPhaseFromTags(element.tags) ??
            extractPhaseFromTags(element.metadata?.tags)
        );
    }

    private resolvePhaseStatusForElement(
        obj: THREE.Object3D,
        elementId: string | undefined,
        viewId?: string,
    ): PhaseDisplayStatus | null {
        const filterId = this.getPhaseFilterIdForView(viewId);
        if (!filterId) return null;
        const elementPhase = this.getElementPhase(obj, elementId);
        if (!elementPhase) return null;
        return phaseFilterStore.resolvePhaseStatus(filterId, elementPhase);
    }

    private applyPhaseStatus(style: VGCategoryStyle, status: PhaseDisplayStatus | null): void {
        if (!status || status === 'show') return;
        if (status === 'hide') {
            style.visible = false;
            return;
        }
        if (status === 'halftone') {
            style.visible = true;
            style.halftone = true;
        }
    }

    /**
     * DOC-1.13 — Apply VG category styles (color, visibility, opacity) to the
     * named projection layers on a TechnicalDrawing.
     *
     * This method is the 2D counterpart of `applyAll()` / `applyCategory()`:
     * instead of mutating Three.js mesh materials in the 3D scene it targets
     * the DrawingLayer objects that live inside the TechnicalDrawing.
     *
     * How it works:
     *   For every VG category that has a DXF layer name (CATEGORY_TO_DXF_LAYER):
     *     1. Resolve the full 4-tier VG cascade via `resolveStyle()`.
     *     2. Call `drawing.layers.setVisibility(layerName, style.visible)`.
     *     3. Call `drawing.layers.setColor(layerName, edgeColor as hex int)`.
     *     4. If transparency > 0, also set `layer.material.opacity` directly.
     *     5. DOC-2.5i (VQ-01): Set `layer.material.linewidth = style.lineWeight` so the
     *        DXF/SVG export pipeline can read per-category stroke widths without a
     *        full re-projection. WebGL hardware cap is 1 px — rendering is unaffected.
     *   Both OBC methods are no-ops when the named layer doesn't exist — this is
     *   safe because the layer map covers only native-element categories (created
     *   by EdgeProjectorService DOC-1.8/1.13); IFC projection lines live on
     *   'projection-visible' / 'projection-hidden' which are not in this map.
     *
     * Acceptance gates (§DOC-1.13 + §DOC-2.5i):
     *   - Hiding 'wall' VG category → A-WALL layer invisible → wall lines hidden.
     *   - Changing wall VG edgeColor → A-WALL layer material color updated.
     *   - Changing wall VG lineWeight → A-WALL layer material.linewidth updated → DXF export thicker.
     *   - Existing 3D VG scene application is completely unaffected.
     *
     * Contract compliance:
     *   §01 §5 — TechnicalDrawing obtained from rendering-only cache, not a store.
     *   §01 §2 — Reads styles from VGGovernanceStore; never mutates the store.
     *   §02 §6.2 — No camera created or registered here.
     *   §05 §4  — No DOM, no UI components touched.
     *
     * @param drawing   — The TechnicalDrawing whose layers will be updated.
     * @param viewDefId — The ViewDefinition ID used for the 4-tier VG cascade.
     */
    applyToProjectionLayers(drawing: OBC.TechnicalDrawing, viewDefId: string): void {
        let appliedCount = 0;

        for (const [category, layerName] of Object.entries(CATEGORY_TO_DXF_LAYER)) {
            // Resolve the full 4-tier cascade (template → model override → view override).
            // Uses this.modelId (the model this applicator owns).
            const resolved = this.store.resolveStyle(this.modelId, category, viewDefId);
            const style    = resolved.style;

            // ── Visibility ──────────────────────────────────────────────────
            // DrawingLayers.setVisibility() is a no-op when the layer doesn't exist.
            drawing.layers.setVisibility(layerName, style.visible);

            // ── Color (edge color drives line color in 2D projection) ────────
            // DrawingLayers.setColor() is a no-op when the layer doesn't exist.
            drawing.layers.setColor(layerName, cssHexToInt(style.edgeColor));

            // ── Opacity + lineWeight (require direct material access) ─────────
            // setColor/setVisibility don't handle opacity or lineWidth — mutate material directly.
            const layer = drawing.layers.get(layerName);
            if (layer) {
                const transparent = style.transparency > 0;
                if (transparent) {
                    layer.material.transparent = true;
                    layer.material.opacity      = 1 - style.transparency / 100;
                } else {
                    layer.material.transparent = false;
                    layer.material.opacity      = 1;
                }

                // DOC-2.5i (VQ-01): Propagate VG lineWeight to the drawing layer material.
                // WebGL hardware cap is 1px — this value is stored on the material so that
                // the DXF/SVG export pipeline can read it for correct stroke-width output.
                // Maps PRYZM lineWeight (1–6 integer) directly; export pipeline scales to mm.
                (layer.material as any).linewidth = style.lineWeight;

                layer.material.needsUpdate = true;
                appliedCount++;
            }

            // DOC-4.2 — Apply cut/projection/beyond sub-layers created by EdgeProjectorService.
            // `:cut`  — segments at the section plane elevation (heavier weight).
            // `:proj` — segments above the cut plane (lighter weight).
            // `:beyond` — depth-cued segments beyond the primary projection depth.
            const effectiveCutWeight  = (style as any).cutLineWeight        ?? style.lineWeight;
            const effectiveProjWeight = (style as any).projectionLineWeight ?? style.lineWeight;
            const effectiveBeyondWeight = (style as any).beyondLineWeight ?? Math.max(1, style.lineWeight - 1);
            const effectiveBeyondColor = (style as any).beyondEdgeColor ?? '#9ca3af';
            const effectiveBeyondVisible = ((style as any).beyondVisible ?? true) && style.visible;

            const cutLayerName  = `${layerName}:cut`;
            const projLayerName = `${layerName}:proj`;
            const beyondLayerName = `${layerName}:beyond`;

            const cutLayer  = drawing.layers.get(cutLayerName);
            const projLayer = drawing.layers.get(projLayerName);
            const beyondLayer = drawing.layers.get(beyondLayerName);

            if (cutLayer) {
                drawing.layers.setVisibility(cutLayerName, style.visible);
                drawing.layers.setColor(cutLayerName, cssHexToInt(style.edgeColor));
                (cutLayer.material as any).linewidth = effectiveCutWeight;
                cutLayer.material.needsUpdate = true;
                appliedCount++;
            }
            if (projLayer) {
                drawing.layers.setVisibility(projLayerName, style.visible);
                drawing.layers.setColor(projLayerName, cssHexToInt(style.edgeColor));
                (projLayer.material as any).linewidth = effectiveProjWeight;
                projLayer.material.needsUpdate = true;
                appliedCount++;
            }
            if (beyondLayer) {
                drawing.layers.setVisibility(beyondLayerName, effectiveBeyondVisible);
                drawing.layers.setColor(beyondLayerName, cssHexToInt(effectiveBeyondColor));
                (beyondLayer.material as any).linewidth = effectiveBeyondWeight;
                beyondLayer.material.transparent = true;
                beyondLayer.material.opacity = 0.55;
                beyondLayer.material.needsUpdate = true;
                appliedCount++;
            }
        }

        console.log(
            `[VGSceneApplicator] DOC-1.13 applyToProjectionLayers() — ` +
            `viewDefId=${viewDefId} modelId=${this.modelId} ` +
            `applied=${appliedCount}/${Object.keys(CATEGORY_TO_DXF_LAYER).length} layers`,
        );
    }

    private processObject(obj: THREE.Object3D, filterCategory: string | null, viewId?: string): void {
        // Phase 2: Multi-model isolation.
        const objModelId = obj.userData?.modelId as string | undefined;
        if (objModelId !== undefined && objModelId !== this.modelId) return;

        const elementType = obj.userData?.elementType as string | undefined;
        const cat = getVGCategory(elementType);
        if (!cat) return;
        if (filterCategory !== null && cat !== filterCategory) return;

        const resolved = this.store.resolveStyle(this.modelId, cat, viewId);
        const style = { ...resolved.style } as VGCategoryStyle;

        const elementId = (obj.userData?.elementId ?? obj.userData?.id ?? obj.userData?.parentId) as string | undefined;

        // DOC-4.1 — Tier 4.5: Per-instance VG override.
        // Applied after the 4-tier cascade (template → model → view) but before
        // VisibilityRuleEngine so rules can still override instance overrides when needed.
        if (elementId && viewId) {
            const instanceOverride = vgInstanceOverrideStore.get(elementId, viewId);
            if (instanceOverride) {
                Object.assign(style, instanceOverride);
            }
        }

        // Phase C — Visibility Rule evaluation (additive; returns null when no rules match).
        if (elementId) {
            const ruleEffect = visibilityRuleEngine.resolveForElement(elementId, this.modelId, viewId);
            if (ruleEffect) {
                Object.assign(style, ruleEffect);
            }
        }

        this.applyPhaseStatus(style, this.resolvePhaseStatusForElement(obj, elementId, viewId));

        // DOC-4.7: Underlay level halftone.
        // If an underlay level is active and this object's userData.levelId
        // matches it, force halftone on — reuses the P4.4 dot-grid ShaderMaterial.
        // style.visible is also forced true so elements hidden by ViewRangeFilterService
        // (they are outside the main view range) are still rendered as ghost geometry.
        // Objects without userData.levelId (e.g. IFC fragments) are handled
        // separately by UnderlayRenderService via its Z-band intersection pass.
        if (this._underlayLevelId) {
            const objLevelId = obj.userData?.levelId as string | undefined;
            if (objLevelId && objLevelId === this._underlayLevelId) {
                style.halftone = true;
                style.visible  = true;
            }
        }

        // §VG-3D-FIX: Determine the view type so applyToMesh() can distinguish
        // 3D perspective views (where wall surface colour comes from materialColor/
        // intent system) from plan/section views (where VG fillColor drives poche).
        const viewType = viewId ? viewDefinitionStore.get(viewId)?.viewType : undefined;

        if (obj instanceof THREE.Mesh) {
            // Doc 20: isLineMaterial2 branch removed. Edge overlays are now
            // THREE.LineSegments (not THREE.Mesh), so they reach applyToLine() below.
            this.applyToMesh(obj, style, viewType);
        } else if (obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
            this.applyToLine(obj, style);
        } else {
            obj.visible = style.visible;
        }
    }

    private cloneMaterial(mesh: THREE.Mesh): void {
        if (!mesh.userData[this.MODEL_KEY]) {
            setUD(mesh, this.MODEL_KEY, mesh.material);
        }
        const current = mesh.material;
        if (!mesh.userData[this.CLONED_KEY]) {
            mesh.material = (Array.isArray(current) ? current[0] : current).clone();
            setUD(mesh, this.CLONED_KEY, true);
        }
    }

    /**
     * §VG-3D-FIX: Wall body element types that receive materialColor from buildWall().
     * In 3D perspective views these meshes should retain that colour — VG fillColor
     * is a 2D concept (plan cut poche / hatch) and must not override 3D surfaces.
     * Edge overlay types (WallEdges) are excluded — they use applyToLine(), not here.
     */
    private static readonly WALL_BODY_3D_TYPES = new Set([
        'Wall', 'WallPart', 'WallLayer', 'LayeredWall',
    ]);

    private applyToMesh(mesh: THREE.Mesh, style: VGCategoryStyle, viewType?: string): void {
        mesh.visible = style.visible;
        if (!style.visible) return;

        // Store original material once so we can always restore it.
        if (!mesh.userData[this.MODEL_KEY]) {
            setUD(mesh, this.MODEL_KEY, mesh.material);
        }

        // §VG-3D-FIX: In 3D perspective views, wall body meshes (WallPart / WallLayer /
        // Wall / LayeredWall) must keep the architect-specified materialColor that was
        // baked in by WallFragmentBuilder.buildWall() (via wall.materialColor or the
        // intent system's _resolveIntent3DColour()).  Applying the VG template's
        // fillColor (e.g. '#1a1a1a' — the default plan poche colour) to these meshes
        // turns them black every time a view-selected event triggers applyAll().
        //
        // Contract 25 §3 states that 3D views carry NO styling data — appearance in
        // 3D is governed by the intent system's 'projection' state rules, not VG fillColor.
        // This guard bridges that gap until the intent engine fully supersedes VGGovernanceStore.
        //
        // We do still apply visibility / transparency so VG hide/isolate commands
        // work correctly in 3D, and we restore the original material so that any
        // dark colour written by a prior plan-view applyAll() is undone on re-entry.
        if (viewType === '3d' && VGSceneApplicator.WALL_BODY_3D_TYPES.has(mesh.userData?.elementType ?? '')) {
            // Undo any halftone shader that may have been applied (e.g. underlay mode).
            if (mesh.userData.vgHalftone) {
                mesh.material = mesh.userData[this.MODEL_KEY];
                delete mesh.userData.vgHalftone;
                delete mesh.userData[this.CLONED_KEY];
            }
            // Undo any plan-view colour override by restoring the original material
            // (which holds the correct materialColor from buildWall).
            if (mesh.userData[this.CLONED_KEY]) {
                mesh.material = mesh.userData[this.MODEL_KEY];
                delete mesh.userData[this.CLONED_KEY];
            }
            // Apply transparency / depth settings (these ARE valid in 3D — e.g. ghost).
            const mat3d = mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
            if (mat3d && typeof mat3d.color !== 'undefined') {
                const opacity3d    = 1 - style.transparency / 100;
                const transparent3d = style.transparency > 0;
                mat3d.transparent = transparent3d;
                mat3d.opacity     = opacity3d;
                mat3d.depthWrite  = !transparent3d;
                mat3d.needsUpdate = true;
            }
            // Wave 8 / Stage S5 — 3D surface descriptor authored on the bound
            // intent overrides the wall's baked-in materialColor. The resolver
            // returns null when no `surface3D` block is set on the intent's
            // appearance rule for this element type, so the existing
            // materialColor path is fully behaviour-preserving in that case.
            //
            // We snapshot the original colour hex into userData on first
            // override so that removing the surface3D block (or rebinding to
            // an intent without one) restores the wall's authored colour
            // rather than leaving the override in place forever.
            if (mat3d && this.activeViewId && (mat3d as any).color?.getHex) {
                const elementType = mesh.userData?.elementType as string | undefined;
                if (elementType) {
                    const descriptor = threeDAppearanceResolver.resolveForView(
                        this.activeViewId, elementType, 'projection',
                    );
                    if (descriptor) {
                        if (mesh.userData.vgIntent3DOriginalColor === undefined) {
                            mesh.userData.vgIntent3DOriginalColor = (mat3d as any).color.getHex();
                        }
                        threeDAppearanceResolver.applyToMaterial(mat3d, descriptor);
                    } else if (mesh.userData.vgIntent3DOriginalColor !== undefined) {
                        // No explicit surface3D anymore — restore the snapshot.
                        (mat3d as any).color.setHex(mesh.userData.vgIntent3DOriginalColor);
                        mat3d.needsUpdate = true;
                        delete mesh.userData.vgIntent3DOriginalColor;
                    }
                }
            }
            return;
        }

        if (style.halftone) {
            // P4.4: True halftone — swap in/update a GLSL ShaderMaterial.
            // Cache the ShaderMaterial in userData.vgHalftone so we avoid
            // recreating it on every applyAll traversal (expensive).
            const cached: THREE.ShaderMaterial | undefined = mesh.userData.vgHalftone;
            if (cached) {
                cached.uniforms.u_fillColor.value.set(style.fillColor);
            } else {
                // First time entering halftone for this mesh: create ShaderMaterial.
                const mat = createHalftoneMaterial(style.fillColor);
                mesh.material = mat;
                setUD(mesh, 'vgHalftone', mat);
                setUD(mesh, this.CLONED_KEY, true);
            }
        } else {
            // Transitioning from halftone → no halftone: restore original and clear cache.
            if (mesh.userData.vgHalftone) {
                mesh.material = mesh.userData[this.MODEL_KEY];
                delete mesh.userData.vgHalftone;
                delete mesh.userData[this.CLONED_KEY];
            }

            // Normal clone-on-write path.
            this.cloneMaterial(mesh);

            const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
            if (!mat || typeof mat.color === 'undefined') return;

            mat.color.set(style.fillColor);

            const opacity    = 1 - style.transparency / 100;
            const transparent = style.transparency > 0;

            mat.transparent = transparent;
            mat.opacity     = opacity;
            mat.depthWrite  = !transparent;
            mat.needsUpdate = true;

            const lw = getLineWeightOffset(style.lineWeight);
            mat.polygonOffset       = lw.factor !== 0 || lw.units !== 0;
            mat.polygonOffsetFactor = lw.factor;
            mat.polygonOffsetUnits  = lw.units;
        }
    }

    private applyToLine(line: THREE.Line | THREE.LineSegments, style: VGCategoryStyle): void {
        line.visible = style.visible;
        if (!style.visible) return;
        const mat = line.material as THREE.LineBasicMaterial;
        if (mat && mat.color) {
            if (!line.userData[this.MODEL_KEY]) {
                setUD(line, this.MODEL_KEY, line.material);
                line.material = mat.clone();
                setUD(line, this.CLONED_KEY, true);
            }
            (line.material as THREE.LineBasicMaterial).color.set(style.edgeColor);
        }
    }

    resetAll(): void {
        this.scene.traverse((obj) => {
            if (obj.userData[this.MODEL_KEY]) {
                if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
                    obj.material = obj.userData[this.MODEL_KEY];
                }
                delete obj.userData[this.MODEL_KEY];
                delete obj.userData[this.CLONED_KEY];
            }
            if (obj.userData.vgHalftone) {
                delete obj.userData.vgHalftone;
            }
            obj.visible = true;
        });
    }

    dispose(): void {
        for (const unsub of this.listeners) unsub();
        this.listeners = [];
        this.resetAll();
    }
}
