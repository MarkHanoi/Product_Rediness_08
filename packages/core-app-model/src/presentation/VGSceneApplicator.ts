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
import { setUD, deleteUD } from './userDataSafe';
import { vgGovernanceStore, VGCategoryStyle } from './VGGovernanceStore';
// §SCC-NO-SELF-BARREL — relative imports, NOT the package barrel (see
// presentation/ViewRangeIntentResolver.ts for the measurement).
import { threeDAppearanceResolver } from './ThreeDAppearanceResolver';
/**
 * @deprecated Contract 25b — back-end implementation surface for 3D mesh
 * visibility. Will be replaced by `IntentSceneApplicator` (driven by
 * IntentRuleResolver) in a follow-up release. Do not add new importers.
 */
import { vgInstanceOverrideStore } from './VGInstanceOverrideStore';
import { visibilityRuleEngine } from './VisibilityRuleEngine';
import { viewTechnicalDrawingCache } from '../views/ViewTechnicalDrawingCache';
import { storeRegistry } from '../StoreRegistry';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { phaseFilterStore } from '../views/PhaseFilterStore';
import { BUILT_IN_PHASE_FILTER_IDS, type PhaseDisplayStatus } from '../views/PhaseFilterTypes';

type VGCategory =
    | 'wall' | 'slab' | 'column' | 'beam'
    | 'door' | 'window' | 'curtain-wall' | 'curtain-panel'
    | 'roof' | 'stair' | 'handrail' | 'furniture'
    | 'ceiling'
    | 'plumbing' | 'grid' | 'level' | 'opening'
    // §ROOM-VG-CATEGORY (L-1610, lane ROOM1) -- rooms are FILLED REGIONS, not
    // projected line-work. See applyToMesh()'s `fillGovernedElsewhere` arm.
    | 'room'
    // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7953, C106 §5) — the AUTHORED setting-out
    // line. It is a DATUM in the drafting sense (`DATUM_CATEGORIES` in DrawingZone.ts),
    // which is why it needs a category of its own rather than borrowing `grid`'s: a user
    // who hides grids has not asked to hide the line their building is set out against,
    // and the founder asked for this family to have a category "there too — everywhere".
    //
    // ⛔ NOT the cadastral parcel boundary (C19 §1.4), which is site data and has no
    // scene node in this map at all.
    | 'boundary-line';

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
    // §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7953, C106 §5) — the scene-node name → VG
    // category map. Without a row here a boundary-line node is UNCLASSIFIED and the
    // per-view category toggle silently does nothing to it, which is the "control
    // appears in one panel and does nothing in the next" defect the four-site rule
    // exists to prevent. Both the centreline node and the extruded solid map to the
    // same category, because the user hides "boundary lines", not "boundary-line
    // centrelines".
    'BoundaryLine':  'boundary-line', 'BoundaryLineSolid': 'boundary-line',
    'Opening':       'opening',
    // §ROOM-VG-CATEGORY (L-1610, lane ROOM1) -- RoomBoundaryBuilder stamps
    // userData.elementType = 'room' on both the floor fill and the room volume.
    'room':          'room',    'Room':          'room',    'RoomVolume':   'room',
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

/**
 * A mesh's material slot may hold one material or an array of them. Multi-slot
 * meshes are styled from slot 0 — the same choice `cloneMaterial()` has always
 * made. Written as a total function so an empty array yields `undefined` rather
 * than an unchecked index (`noUncheckedIndexedAccess` flags the inline form).
 */
function firstMaterial(m: THREE.Material | THREE.Material[] | undefined): THREE.Material | undefined {
    if (m === undefined) return undefined;
    return Array.isArray(m) ? m[0] : m;
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

        // ── §3D-MODE-IS-THE-AUTHORITY (L-1561) ───────────────────────────────
        // `view-activated` fires on EVERY successful activation and always carries
        // `mode` ('3D' | 'Top' | 'Front' | 'Section' | …). `view-selected`, which
        // fires immediately after it, carries a ViewDefinition id that is NULL for
        // the 3D view on every activation path that did not go through the View
        // Browser rail (ViewCube, BottomActionMenu, the `activate('3D')` error
        // fallback) — runtime-composer/src/types.ts documents the null in the
        // event's own contract.
        //
        // The old handler below was `if (viewId) { … }`, so on those paths NOTHING
        // ran: `activeViewId` stayed pinned to the PLAN view the user had just left
        // and the plan poche was simply left on the 3D screen — measured at
        // `WallPart #1a1a1a`, i.e. the near-black that reads as "all materials
        // gone". Recording the mode here gives `isNonStyledView()` an authority
        // that does not depend on an id the emitter is contractually allowed to
        // omit, and re-applying on this event is what actually restores the model.
        listen('view-activated', (e) => {
            const detail = (e as CustomEvent).detail;
            const is3D = detail?.mode === '3D' || detail?.mode === 'Render';
            this._activeViewModeIs3D = is3D;
            if (is3D) {
                // A 3D activation may be about to hand us `viewId: null`, in which
                // case the `view-selected` handler below does nothing at all.
                // Restore here instead. When the rail DID supply an id, the
                // `view-selected` that follows re-applies with it — idempotently,
                // because the 3D leg is a restore, not an accumulate.
                this.activeViewId = null;
                this.applyAll();
            }
            // Leaving 3D needs nothing here: `view-selected` follows with a real
            // ViewDefinition id and re-applies the 2D styling.
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
    /**
     * §VG-VIEW-IDENTITY-IS-A-CALL (L-1563) — tell the applicator which view is
     * active, by DIRECT CALL.
     *
     * ⚠ WHY THIS EXISTS, MEASURED — the event path this class was built on does
     * not reach it. `ViewController` announces every switch with
     * `window.runtime.events.emit('view-selected' | 'view-activated', …)`, and
     * `runtime.events` is `runtime-composer/src/EventBus.ts`: a `Map` of handler
     * sets whose `emit()` iterates that map and returns. It never calls
     * `window.dispatchEvent`. This class subscribes with
     * `window.addEventListener`. They are two different channels, so
     * `view-selected` has never been delivered here — the `if (viewId)` handler
     * and the `view-activated` handler below are both DARK on this wiring.
     *
     * What IS reachable is the direct-call idiom `ViewController` already uses
     * four times over: `window.vgSceneApplicator?.setUnderlayLevelId(...)`,
     * `applyToProjectionLayers(...)`. This method joins it. A direct call cannot
     * be silently dropped by a bus mismatch, which is the whole point.
     *
     * @param viewId   the active ViewDefinition id, or null (the 3D view is
     *                 allowed to have none — see runtime-composer types.ts).
     * @param viewType the active view's `viewType` ('3d' | 'plan' | 'section' | …),
     *                 or '3d' when the caller knows the mode but has no definition.
     */
    setActiveView(viewId: string | null, viewType: string | null): void {
        this.activeViewId = viewId;
        this._activeViewModeIs3D = viewType === '3d' || viewType === 'render';
        console.log(
            `[VGSceneApplicator] §VG-VIEW-IDENTITY-IS-A-CALL viewId=${viewId ?? 'null'} ` +
            `viewType=${viewType ?? 'null'} is3D=${this._activeViewModeIs3D}`,
        );
        this.applyAll(viewId ?? undefined);
    }

    setUnderlayLevelId(levelId: string | null): void {
        if (this._underlayLevelId === levelId) return; // no-op when unchanged
        this._underlayLevelId = levelId;
        console.log(`[VGSceneApplicator] DOC-4.7 underlayLevelId=${levelId ?? 'null'}`);
        // §VG-VIEW-IDENTITY-IS-A-CALL (L-1563) — this is a REACHABLE applyAll (it is
        // driven by a direct call from `ViewController._activate3DView` /
        // `_activateFloorPlanView`, not by the window bus), so it must respect the
        // view identity. Before L-1563 it ran with `activeViewId` permanently null —
        // the `view-selected` that was supposed to set it never arrived — which made
        // `viewType` undefined and sent every mesh down the 2D poche path, in 3D.
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

        // §DIAG-VG-APPLIED-UNITS (L-706) — `applied=18/14 layers` was NOT a bug, it was a
        // UNITS MISMATCH in this one string, and it cost a founder-escalation to establish
        // that. The numerator counts LAYER OBJECTS styled; the denominator counted VG
        // CATEGORIES. Each of the 14 categories can contribute up to FOUR concrete layers
        // — the base layer plus the `:cut` / `:proj` / `:beyond` sub-layers that
        // EdgeProjectorService creates (DOC-4.2) — so the numerator legitimately ranges
        // 0..56 and exceeding 14 means the drawing has sub-layers, not that anything was
        // over-applied. Report both counts in their own units so the line can never again
        // read as "applied more layers than exist".
        const categoryCount = Object.keys(CATEGORY_TO_DXF_LAYER).length;
        console.log(
            `[VGSceneApplicator] DOC-1.13 applyToProjectionLayers() — ` +
            `viewDefId=${viewDefId} modelId=${this.modelId} ` +
            `styledLayers=${appliedCount} (base + :cut/:proj/:beyond sub-layers) ` +
            `across ${categoryCount} VG categories (max ${categoryCount * 4} layers)`,
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
            // §ROOM-VG-CATEGORY (L-1613, lane ROOM1) -- VG's `visible` is a MASK over a
            // room mesh's own visibility, never a replacement for it. Room volumes are
            // shown/hidden by the 'showRoomVolumeColour' preference; VG's default
            // `visible: true` would otherwise force every hidden volume back on at
            // every view switch.
            if (cat === 'room' && style.visible && obj.userData?.vgBaseVisible === false) {
                obj.visible = false;
                return;
            }
            // Doc 20: isLineMaterial2 branch removed. Edge overlays are now
            // THREE.LineSegments (not THREE.Mesh), so they reach applyToLine() below.
            this.applyToMesh(obj, style, viewType, cat === 'room');
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
        const current = firstMaterial(mesh.material);
        if (!mesh.userData[this.CLONED_KEY] && current !== undefined) {
            const clone = current.clone();
            mesh.material = clone;
            setUD(mesh, this.CLONED_KEY, true);
            // §AUTHORED-SNAPSHOT-IS-SELF-CORRECTING (L-1562) — record the clone by
            // IDENTITY, not just by a boolean. Ownership has to be decidable by
            // reference comparison; a flag cannot tell "VG's clone" from "a material
            // someone assigned while the flag happened to be set".
            setUD(mesh, 'vg2dClone', clone);
        }
    }

    /**
     * §AUTHORED-SNAPSHOT-IS-SELF-CORRECTING (L-1562) — is the material currently on
     * this mesh one VG installed?
     *
     * Decided by reference identity against the four materials VG can install: the
     * authored snapshot itself, the 2D clone-on-write, the 3D transparency clone,
     * and the P4.4 halftone shader.
     */
    private isVgOwnedMaterial(mesh: THREE.Mesh): boolean {
        const m = mesh.material;
        return m === mesh.userData[this.MODEL_KEY]
            || m === mesh.userData.vg2dClone
            || m === mesh.userData.vg3dClone
            || m === mesh.userData.vgHalftone;
    }

    /**
     * §AUTHORED-SNAPSHOT-IS-SELF-CORRECTING (L-1562).
     *
     * `vgOriginalMaterial` is a SNAPSHOT, and every snapshot in this codebase has
     * eventually been written back over something newer — that is the exact shape of
     * the defect this lane was opened for. When the live material is one nobody in VG
     * installed, something else is now the authority (a rebuild after an §H2 proxy-
     * cache eviction, a catalogue material applied in place, a per-element resolver
     * handing over a fresh instance). Re-take the snapshot and drop every derived
     * artefact rather than carrying a reference to a material the user has replaced.
     */
    private syncAuthoredSnapshot(mesh: THREE.Mesh): void {
        // ⚠ This runs for EVERY mesh on EVERY apply, so the early return matters and
        // so does `deleteUD`. `@thatopen/fragments` hands back objects whose
        // `userData` is non-extensible / sealed; a bare `delete` on one of those
        // THROWS in strict mode and aborts the entire `scene.traverse()`, taking VG,
        // view-range zoning, underlay and crop filtering down with it for every
        // element after the first sealed fragment. See userDataSafe.ts.
        if (mesh.userData[this.MODEL_KEY] !== undefined && this.isVgOwnedMaterial(mesh)) return;
        setUD(mesh, this.MODEL_KEY, mesh.material);
        deleteUD(mesh, this.CLONED_KEY);
        deleteUD(mesh, 'vg2dClone');
        deleteUD(mesh, 'vg3dClone');
        deleteUD(mesh, 'vgHalftone');
        deleteUD(mesh, 'vgIntent3DOriginalColor');
    }

    /**
     * ⚠ §VG-3D-FIX's allowlist was DELETED 2026-08-20 — see §3D-CARRIES-NO-VG-FILL
     * (L-1560) below. It read:
     *
     *     private static readonly WALL_BODY_3D_TYPES = new Set([
     *         'Wall', 'WallPart', 'WallLayer', 'LayeredWall',
     *     ]);
     *
     * Its stated rationale — "VG fillColor is a 2D concept (plan cut poche /
     * hatch) and must not override 3D surfaces" — is a statement about the VIEW,
     * not about walls. Encoding it as a per-element-type allowlist meant the rule
     * held for FOUR type strings and failed for the ELEVEN other families the 3D
     * builders actually stamp. The gate is now the view, which is what the rule
     * was always about.
     */

    /**
     * §3D-CARRIES-NO-VG-FILL (L-1560) — is this a view in which VG fillColor is
     * meaningless?
     *
     * `viewType` comes from the ViewDefinition. `_activeViewModeIs3D` is the
     * fallback authority for the activation paths that hand us NO view id at all
     * (ViewCube / BottomActionMenu / the `activate('3D')` error fallback all reach
     * `view-selected { viewId: null }` — see runtime-composer types.ts, which
     * documents the null as "or `null` for the 3D view"). `view-activated` fires on
     * EVERY activation and always carries `mode`, so it can answer when the id
     * cannot.
     */
    private _activeViewModeIs3D = false;

    private isNonStyledView(viewType?: string): boolean {
        if (viewType === '3d' || viewType === 'render') return true;
        // No ViewDefinition to ask (viewId was null) — fall back to the mode.
        if (viewType === undefined) return this._activeViewModeIs3D;
        return false;
    }

    private applyToMesh(
        mesh: THREE.Mesh,
        style: VGCategoryStyle,
        viewType?: string,
        /**
         * §ROOM-VG-CATEGORY (L-1610, lane ROOM1) -- the category governs whether and
         * how strongly this mesh is seen, but NOT its colour, because the colour is a
         * determination something else owns. Rooms are the case: their fill states the
         * room's TYPE, SIZE or the user's own choice (RoomColourSystem, driven by the
         * category's `roomColourMode`), so stamping a single category-wide `fillColor`
         * over it would erase the very information the wash exists to carry -- except
         * in `uniform` mode, where RoomColourSystem reads that same `fillColor` itself.
         * `applyToMesh3D()` is reused verbatim: it is already the "visible +
         * transparency, never fillColor" leg (§3D-CARRIES-NO-VG-FILL, L-1560).
         */
        fillGovernedElsewhere = false,
    ): void {
        mesh.visible = style.visible;
        if (!style.visible) return;

        if (fillGovernedElsewhere) {
            this.syncAuthoredSnapshot(mesh);
            this.applyToMesh3D(mesh, style);
            return;
        }

        // §AUTHORED-SNAPSHOT-IS-SELF-CORRECTING (L-1562) — take (or RE-take) the
        // authored snapshot. This used to be `if (!MODEL_KEY) { … }`, i.e. once and
        // never again, which pinned VG to whatever material the mesh happened to
        // carry the first time VG ever saw it.
        this.syncAuthoredSnapshot(mesh);

        // ── §3D-CARRIES-NO-VG-FILL (L-1560) ──────────────────────────────────
        // ⭐ THIS IS "MATERIALES GOES OFF WHEN SWAPPING VIEWS".
        //
        // Contract 25 §3: 3D views carry NO styling data — appearance in 3D is
        // governed by the builder's authored material plus the intent system's
        // `surface3D` rules, never by VG `fillColor`, which is the PLAN CUT POCHE
        // colour. `applyAll()` runs on every `view-selected`, so every view switch
        // wrote the poche colour onto the live 3D material of every category that
        // was not on a four-entry wall allowlist.
        //
        // Measured 2026-08-20, one plan→3D round trip, default `pryzm-default`
        // template, authored colours vs. what the user was left looking at:
        //     SlabPart  → #e8e8e8   Column    → #111111   Stair    → #c8c8c8
        //     Handrail  → #888888   Furniture → #ececec   Door     → #8b6914
        //     Window    → #a8d8f0   CurtPanel → #c8e4f8   Plumbing → #4488cc
        //     ceiling   → #cccccc   floor     → #e8e8e8
        // Eleven of the twelve families the 3D builders stamp; only `WallPart`
        // survived, which is exactly why the symptom read as arbitrary.
        //
        // C84 EI-8 — colour/material is ONE vocabulary. The fix removes the SECOND
        // producer of 3D surface colour rather than adding another type to an
        // allowlist that would rot again with the next element family.
        if (this.isNonStyledView(viewType)) {
            this.applyToMesh3D(mesh, style);
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
                deleteUD(mesh, 'vgHalftone');
                deleteUD(mesh, this.CLONED_KEY);
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

    /**
     * §3D-CARRIES-NO-VG-FILL (L-1560) — the 3D leg of `applyToMesh()`.
     *
     * ONE producer of 3D surface colour: the material the builder authored
     * (`this.MODEL_KEY`), patched only by the intent system's `surface3D`.
     * `style.fillColor` is never read here — it is a 2D poche colour.
     *
     * The VG semantics that ARE meaningful in 3D are kept:
     *   - `visible`      — hide / isolate (applied by the caller before we run).
     *   - `transparency` — ghost, phase-filter dimming, glazing.
     *
     * ⚠ Transparency is written onto a VG-OWNED CLONE (`vg3dClone`), never onto
     * the authored material. Element builders share materials aggressively — the
     * `_sharedFrameMats` idiom caches one material per (levelId, colour) — so
     * mutating `opacity` in place would silently re-ghost every other element
     * holding the same reference, and would overwrite an authored glass opacity
     * with the template's. The clone is created once per mesh and reused; its
     * colour is re-synced from the authored material on every pass so a poche
     * colour written while the mesh was in a plan view can never leak forward.
     */
    private applyToMesh3D(mesh: THREE.Mesh, style: VGCategoryStyle): void {
        const authored = mesh.userData[this.MODEL_KEY] as THREE.Material | THREE.Material[];

        // Halftone is a plan-poche device (P4.4 dot-grid shader) and an underlay
        // device (DOC-4.7). It has no meaning in 3D. Take the mesh OFF it before
        // dropping the reference — clearing the key first would make
        // `isVgOwnedMaterial()` disown a shader VG is still wearing, and the mesh
        // would stay dot-gridded in 3D forever.
        if (mesh.userData.vgHalftone) {
            if (mesh.material === mesh.userData.vgHalftone && authored !== undefined) {
                mesh.material = authored;
            }
            deleteUD(mesh, 'vgHalftone');
            deleteUD(mesh, this.CLONED_KEY);
        }

        const wantsTransparency = style.transparency > 0;

        if (!wantsTransparency) {
            // Nothing 3D-valid to say — the authored material IS the answer.
            //
            // ⚠ Restore ONLY from a material VG itself installed. `vgOriginalMaterial`
            // is a snapshot, and a snapshot goes stale the moment something else
            // re-assigns `mesh.material` (a rebuild after an §H2 cache eviction, a
            // catalogue material applied in place). Blindly writing the snapshot back
            // would turn this restore into the very defect it exists to undo — an
            // authored material silently reverted on a view switch. If the live
            // material is not ours, it is the current authority and we leave it.
            const vgInstalled = this.isVgOwnedMaterial(mesh);
            if (vgInstalled && authored !== undefined && mesh.material !== authored) {
                mesh.material = authored;
            }
            deleteUD(mesh, this.CLONED_KEY);
        } else {
            // Same staleness rule: clone from whatever the live authority is when the
            // snapshot is gone or has been superseded.
            const base = firstMaterial(authored ?? mesh.material);
            if (!base) return;
            let clone = mesh.userData.vg3dClone as THREE.Material | undefined;
            if (!clone) {
                clone = base.clone();
                setUD(mesh, 'vg3dClone', clone);
            }
            // Re-sync from the authored material so a plan-view poche colour, or a
            // later material re-assignment, cannot survive on the clone.
            const bAny = base as unknown as { color?: { getHex(): number } };
            const cAny = clone as unknown as { color?: { setHex(h: number): void } };
            if (bAny.color && cAny.color) cAny.color.setHex(bAny.color.getHex());

            clone.transparent = true;
            clone.opacity     = 1 - style.transparency / 100;
            clone.depthWrite  = false;
            clone.needsUpdate = true;
            mesh.material = clone;
            setUD(mesh, this.CLONED_KEY, true);
        }

        // Wave 8 / Stage S5 — the intent system's `surface3D` block is the ONE
        // sanctioned override of the authored 3D appearance. `resolveForView`
        // returns null when the bound intent declares no `surface3D` for this
        // element type, so the authored material is fully behaviour-preserving.
        const live = mesh.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
        if (!live || typeof (live as { color?: unknown }).color === 'undefined') return;
        if (!this.activeViewId) return;
        const elementType = mesh.userData?.elementType as string | undefined;
        if (!elementType) return;

        const descriptor = threeDAppearanceResolver.resolveForView(
            this.activeViewId, elementType, 'projection',
        );
        if (descriptor) {
            if (mesh.userData.vgIntent3DOriginalColor === undefined) {
                // setUD, not a bare assignment: sealed `userData` throws on a new key
                // in strict mode and would abort the whole `scene.traverse()`.
                setUD(mesh, 'vgIntent3DOriginalColor', (live as any).color.getHex());
            }
            // ⚠ KNOWN, PRE-EXISTING, WIDENED HERE: on the opaque path `live` IS the
            // authored material, which builders share per (levelId, colour). An intent
            // `surface3D` override therefore repaints every element holding that same
            // reference. It fires only when a view has a bound intent that explicitly
            // declares `surface3D` for this element type, so it is an authored choice
            // rather than a default — but it wants the same clone treatment the
            // transparency path above already gets. Reported, not silently widened.
            threeDAppearanceResolver.applyToMaterial(live, descriptor);
        } else if (mesh.userData.vgIntent3DOriginalColor !== undefined) {
            // No explicit surface3D anymore — restore the snapshot.
            (live as any).color.setHex(mesh.userData.vgIntent3DOriginalColor);
            live.needsUpdate = true;
            deleteUD(mesh, 'vgIntent3DOriginalColor');
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
                deleteUD(obj, this.MODEL_KEY);
                deleteUD(obj, this.CLONED_KEY);
            }
            if (obj.userData.vgHalftone) {
                deleteUD(obj, 'vgHalftone');
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
