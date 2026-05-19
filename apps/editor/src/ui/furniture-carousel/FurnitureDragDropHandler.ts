/**
 * @file FurnitureDragDropHandler.ts
 *
 * Phase F4 — Drag & Drop Bridge (HTML Carousel → Three.js Scene).
 *
 * Listens to HTML5 drag events on the Three.js canvas element.
 * When a furniture card is dragged from the Orbital Carousel and dropped
 * onto the canvas, this handler:
 *   1. Raycasts the drop coordinates onto the floor plane (slab hit first,
 *      then Y=0 plane as fallback — identical pattern to FurnitureTool).
 *   2. Shows a green ring indicator while hovering so the user knows where
 *      the element will be placed.
 *   3. Dispatches `CreateFurnitureCommand` with descriptor defaults from
 *      `FurnitureCategoryRegistry` — the ONLY write path (01-BIM §1.1).
 *
 * Architecture rules (contracts enforced):
 *  - Does NOT write to any store directly (01-BIM §1.1).
 *  - Only dispatches `CreateFurnitureCommand` — the existing validated command.
 *  - No `any` types except necessary window access that matches existing
 *    codebase patterns (window.projectContext, identical to FurnitureTool).
 *  - No @thatopen/ui (bim-*) elements (05-BIM-UI §7.8).
 *  - No new server endpoints (07-BIM-SECURITY §7.2).
 *  - Drop indicator tagged `userData.isPreview = true` (CurtainWall §4.2).
 *  - `detach()` cleans up ALL listeners and removes indicator from scene.
 *  - Does NOT modify FurnitureTool — parallel, independent system.
 *
 * Integration (Phase Integration):
 *   const dnd = new FurnitureDragDropHandler();
 *   dnd.attach(renderer.three.domElement, world, commandManager);
 *   // later:
 *   dnd.detach();
 *
 * See docs/furniture/04-PROGRESS-TRACKER.md §F4 for phase scope.
 * See docs/furniture/02-ORBITAL-CAROUSEL-UI-SPEC.md §5 for D&D spec.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CommandManager } from '@pryzm/command-registry';
import { FurnitureType } from '@pryzm/geometry-furniture';
import { getDescriptorForType } from './FurnitureCategoryRegistry';

// ─── Drop preview geometry ───────────────────────────────────────────────────
//
// CONTRACT (docs/01_ELEMENTS/10_Furniture_Contract/furniture/
//           02-ORBITAL-CAROUSEL-UI-SPEC.md §5):
// All INTERIORS items dragged from the library MUST display a translucent
// purple 3D preview that follows the cursor on the floor plane while the
// drag is in flight. The preview is created from the descriptor's
// `defaultDimensions` (parametric items) or a generic 1×1×1 m block (GLB
// catalog items). Mirrors the behaviour of PlumbingTool (toilet/sink/shower)
// which uses the same PRYZM_PURPLE = 0x8B5CF6 brand colour at opacity 0.55.
// ─────────────────────────────────────────────────────────────────────────────

const PRYZM_PURPLE   = 0x8B5CF6;
const PREVIEW_OPACITY = 0.55;

// Fallback footprint for GLB catalog items (no descriptor available).
const GLB_FALLBACK_DIMS = { width: 1.0, length: 1.0, height: 1.0, baseOffset: 0.0 };

// Floor ring overlay drawn beneath the preview for grounding feedback.
const RING_INNER = 0.35;
const RING_OUTER = 0.50;
const RING_SEGMENTS = 32;

interface PreviewDims {
    width:      number;
    length:     number;
    height:     number;
    baseOffset: number;
}

// ─── FurnitureDragDropHandler ─────────────────────────────────────────────────

export class FurnitureDragDropHandler {

    private world:          OBC.World | null = null;
    private commandManager: CommandManager | null = null;
    private canvasEl:       HTMLElement | null = null;

    // Drop preview group (purple translucent box + grounding ring)
    private preview:      THREE.Group | null = null;
    private previewDims:  PreviewDims | null = null;
    private indicatorScene: THREE.Object3D | null = null;

    // Currently dragged type/path (set by fc-drag-start)
    private activeDragType: string | null = null;
    private activePlacementGlbPath: string | null = null;
    private activePlacementLabel: string | null = null;

    // Bound handlers — stored for cleanup
    private _onDragOver:  (e: DragEvent) => void;
    private _onDrop:      (e: DragEvent) => void;
    private _onDragLeave: (e: DragEvent) => void;
    private _onFcDragStart: (p: { furnitureType: string }) => void;
    private _onFcDragEnd:   (p: Record<string, never>) => void;
    private _onFcPlaceGlbStart: (p: { path: string; label?: string }) => void;
    private _unsubFcDragStart:    (() => void) | null = null;
    private _unsubFcDragEnd:      (() => void) | null = null;
    private _unsubFcPlaceGlbStart: (() => void) | null = null;
    private _onPointerMovePlacement: (e: PointerEvent) => void;
    private _onPointerDownPlacement: (e: PointerEvent) => void;
    private _onKeyDownPlacement: (e: KeyboardEvent) => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._onDragOver    = this._handleDragOver.bind(this);
        this._onDrop        = this._handleDrop.bind(this);
        this._onDragLeave   = this._handleDragLeave.bind(this);
        this._onFcDragStart = this._handleFcDragStart.bind(this);
        this._onFcDragEnd   = this._handleFcDragEnd.bind(this);
        this._onFcPlaceGlbStart = this._handleFcPlaceGlbStart.bind(this);
        this._onPointerMovePlacement = this._handlePointerMovePlacement.bind(this);
        this._onPointerDownPlacement = this._handlePointerDownPlacement.bind(this);
        this._onKeyDownPlacement = this._handleKeyDownPlacement.bind(this);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    /**
     * Register drag-and-drop listeners on the Three.js canvas element.
     * Call once after the world is ready.
     */
    attach(
        canvasEl:       HTMLElement,
        world:          OBC.World,
        commandManager: CommandManager,
    ): void {
        if (this.canvasEl) {
            // Already attached — detach first to avoid double-registration
            this.detach();
        }

        this.canvasEl       = canvasEl;
        this.world          = world;
        this.commandManager = commandManager;
        this.indicatorScene = world.scene.three;

        // HTML5 drag events on the canvas
        canvasEl.addEventListener('dragover',  this._onDragOver);
        canvasEl.addEventListener('drop',      this._onDrop);
        canvasEl.addEventListener('dragleave', this._onDragLeave);

        // Custom events dispatched by FurnitureCarousel (Phase F3 contract) — F.events.12
        this._unsubFcDragStart     = window.runtime?.events?.on('fc-drag-start',     this._onFcDragStart)    ?? null;
        this._unsubFcDragEnd       = window.runtime?.events?.on('fc-drag-end',       this._onFcDragEnd)      ?? null;
        this._unsubFcPlaceGlbStart = window.runtime?.events?.on('fc-place-glb-start', this._onFcPlaceGlbStart) ?? null;

        console.log('[FurnitureDragDropHandler] Attached to canvas');
    }

    /**
     * Remove all listeners and dispose the drop indicator mesh from the scene.
     */
    detach(): void {
        if (this.canvasEl) {
            this.canvasEl.removeEventListener('dragover',  this._onDragOver);
            this.canvasEl.removeEventListener('drop',      this._onDrop);
            this.canvasEl.removeEventListener('dragleave', this._onDragLeave);
        }

        this._unsubFcDragStart?.();    this._unsubFcDragStart    = null; // F.events.12
        this._unsubFcDragEnd?.();      this._unsubFcDragEnd      = null; // F.events.12
        this._unsubFcPlaceGlbStart?.(); this._unsubFcPlaceGlbStart = null; // F.events.12
        this._cancelGlbPlacement();

        this._removePreview();

        this.canvasEl       = null;
        this.world          = null;
        this.commandManager = null;
        this.indicatorScene = null;
        this.activeDragType = null;
        this.activePlacementGlbPath = null;
        this.activePlacementLabel = null;
        this.previewDims    = null;

        console.log('[FurnitureDragDropHandler] Detached');
    }

    // ── Custom event handlers (fc-drag-start / fc-drag-end) ─────────────────

    private _handleFcDragStart(p: { furnitureType: string }): void { // F.events.12
        const type = p.furnitureType;
        if (!type) return;
        this.activeDragType = type;
        this.previewDims = this._resolvePreviewDims(type);
    }

    private _handleFcDragEnd(_p: Record<string, never>): void { // F.events.12
        // Drag ended without a drop — clean up preview
        this.activeDragType = null;
        this.previewDims = null;
        this._removePreview();
    }

    private _handleFcPlaceGlbStart(p: { path: string; label?: string }): void { // F.events.12
        if (!p.path) {
            console.error('[FurnitureDragDropHandler] GLB placement start: missing path');
            return;
        }
        if (!this.canvasEl || !this.world) {
            console.error('[FurnitureDragDropHandler] GLB placement start: handler not attached');
            return;
        }

        this._cancelGlbPlacement();
        this.activePlacementGlbPath = p.path;
        this.activePlacementLabel = p.label ?? null;
        this.previewDims = { ...GLB_FALLBACK_DIMS };
        this.canvasEl.style.cursor = 'crosshair';
        this.canvasEl.addEventListener('pointermove', this._onPointerMovePlacement, true);
        this.canvasEl.addEventListener('pointerdown', this._onPointerDownPlacement, true);
        document.addEventListener('keydown', this._onKeyDownPlacement, true);
        console.log(`[FurnitureDragDropHandler] GLB placement armed: ${p.path}`);
    }

    private _handlePointerMovePlacement(e: PointerEvent): void {
        if (!this.activePlacementGlbPath) return;
        const worldPoint = this._raycastClientPoint(e.clientX, e.clientY);
        if (worldPoint) this._showPreview(worldPoint);
        else this._removePreview();
    }

    private _handlePointerDownPlacement(e: PointerEvent): void {
        if (!this.activePlacementGlbPath || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();

        const worldPoint = this._raycastClientPoint(e.clientX, e.clientY);
        if (!worldPoint) {
            console.warn('[FurnitureDragDropHandler] GLB placement: no valid floor point');
            return;
        }

        const path = this.activePlacementGlbPath!; // guarded non-null by line 229
        const label = this.activePlacementLabel ?? undefined;
        this._cancelGlbPlacement();
        window.runtime?.events?.emit('fc-add-glb', { // F.events.12
            path,
            label,
            position: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
        });
        console.log(`[FurnitureDragDropHandler] GLB click placement: ${path}`);
    }

    private _handleKeyDownPlacement(e: KeyboardEvent): void {
        if (e.key !== 'Escape') return;
        this._cancelGlbPlacement();
    }

    private _cancelGlbPlacement(): void {
        if (this.canvasEl) {
            this.canvasEl.removeEventListener('pointermove', this._onPointerMovePlacement, true);
            this.canvasEl.removeEventListener('pointerdown', this._onPointerDownPlacement, true);
            this.canvasEl.style.cursor = '';
        }
        document.removeEventListener('keydown', this._onKeyDownPlacement, true);
        this.activePlacementGlbPath = null;
        this.activePlacementLabel = null;
        this.previewDims = null;
        this._removePreview();
    }

    // ── HTML5 drag event handlers ────────────────────────────────────────────

    private _handleDragOver(e: DragEvent): void {
        // Must preventDefault to allow the drop event to fire
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

        // Late-resolve preview dims if dragstart fired in another window/iframe
        // and we never received the fc-drag-start payload. Falls back to GLB
        // generic block when the type isn't in the registry.
        if (!this.previewDims) {
            const fallbackType = this.activeDragType ?? '';
            this.previewDims = this._resolvePreviewDims(fallbackType);
        }

        const worldPoint = this._raycastFloor(e);
        if (worldPoint) {
            this._showPreview(worldPoint);
        } else {
            this._removePreview();
        }
    }

    private _handleDrop(e: DragEvent): void {
        e.preventDefault();
        this._removePreview();
        this.previewDims = null;

        if (!this.commandManager || !this.world) {
            console.error('[FurnitureDragDropHandler] Not attached — no commandManager or world');
            return;
        }

        // Resolve furniture type from dataTransfer
        const rawType = e.dataTransfer?.getData('text/plain') ?? '';
        const furnitureType = rawType || this.activeDragType;
        this.activeDragType = null;

        if (!furnitureType) {
            console.warn('[FurnitureDragDropHandler] Drop: no furniture type in dataTransfer');
            return;
        }

        // ── GLB catalog item branch (Kave Home) ─────────────────────────────
        // Drag payloads that start with '/' are file paths (e.g. /items/sofa/model.glb).
        // These are placed via addFurniture() in Layout.ts — NOT via CreateFurnitureCommand.
        if (furnitureType.startsWith('/')) {
            const worldPoint = this._raycastFloor(e);
            if (!worldPoint) {
                console.warn('[FurnitureDragDropHandler] GLB drop: raycast found no floor surface');
                return;
            }
            window.runtime?.events?.emit('fc-add-glb', { // F.events.12
                path: furnitureType,
                position: { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
            });
            console.log(`[FurnitureDragDropHandler] GLB drop: dispatching fc-add-glb for ${furnitureType}`);
            return;
        }
        // ── /GLB catalog item branch ─────────────────────────────────────────

        // ── Plumbing-sentinel branch (Services consolidation) ───────────────
        // Drag payloads of the form `"plumbing:<family>:<variant>"` are routed
        // through CreatePlumbingFixtureCommand so the same carousel can populate
        // both the Furniture and the Plumbing pipelines. See
        // FurnitureCategoryRegistry bathroom items.
        if (furnitureType.startsWith('plumbing:')) {
            const parts = furnitureType.split(':');
            if (parts.length !== 3) {
                console.error(`[FurnitureDragDropHandler] Plumbing drop: malformed sentinel "${furnitureType}"`);
                return;
            }
            const [, family, variant] = parts;
            const worldPoint = this._raycastFloor(e);
            if (!worldPoint) {
                console.warn('[FurnitureDragDropHandler] Plumbing drop: raycast found no floor surface');
                return;
            }
            const projectContextP = (window as { projectContext?: { activeLevelId?: string } }).projectContext;
            const levelIdP = projectContextP?.activeLevelId;
            if (!levelIdP) {
                console.error('[FurnitureDragDropHandler] Plumbing drop: no active level — cannot place fixture');
                return;
            }
            const descriptorP = getDescriptorForType(furnitureType);
            const dimP = descriptorP?.defaultDimensions;

            // Validate the family is one accepted by CreatePlumbingFixtureCommand —
            // the carousel only emits sentinels for the bathroom-relevant
            // families (toilet/sink/bath/shower/accessory). Hard-fail for
            // anything else (07-BIM §7.2).
            type CarouselPlumbingFamily = 'toilet' | 'sink' | 'bath' | 'shower' | 'accessory';
            const validFamilies: ReadonlySet<string> = new Set(['toilet', 'sink', 'bath', 'shower', 'accessory']);
            if (!validFamilies.has(family)) {
                console.error(`[FurnitureDragDropHandler] Plumbing drop: unsupported family "${family}"`);
                return;
            }
            const familyTyped = family as CarouselPlumbingFamily;
            // [F-1.3] Bus-primary: commandManager exfiltrated to CreatePlumbingFixtureHandler (plugins/plumbing).
            window.runtime?.bus?.executeCommand('plumbing.createFixture', {
                fixtureType:      familyTyped,
                toiletVariant:    family === 'toilet'    ? (variant as any) : undefined,
                showerVariant:    family === 'shower'    ? (variant as any) : undefined,
                accessoryVariant: family === 'accessory' ? (variant as any) : undefined,
                position:    { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
                rotation:    { x: 0, y: 0, z: 0 },
                levelId:     levelIdP,
                baseOffset:  dimP?.baseOffset ?? 0,
                width:       dimP?.width,
                length:      dimP?.length,
                height:      dimP?.height,
            } as any)
            .then(() => console.log(
                `[FurnitureDragDropHandler] Placed plumbing ${family}/${variant} at` +
                ` (${worldPoint.x.toFixed(2)}, ${worldPoint.z.toFixed(2)})`,
            ))
            .catch((e: Error) => console.error('[FurnitureDragDropHandler] plumbing.createFixture failed:', e));
            const rendererP = this.world.renderer as unknown as { mode?: string; needsUpdate?: boolean };
            if (rendererP?.mode === 'manual' && 'needsUpdate' in rendererP) {
                rendererP.needsUpdate = true;
            }
            return;
        }
        // ── /Plumbing-sentinel branch ────────────────────────────────────────

        // Validate the type against the registry — 07-BIM §7.2 (hard failure on unknown)
        const descriptor = getDescriptorForType(furnitureType);
        if (!descriptor) {
            console.error(
                `[FurnitureDragDropHandler] Drop: unknown FurnitureType "${furnitureType}" — ` +
                'update FurnitureCategoryRegistry before using this type via drag-and-drop'
            );
            return;
        }

        // Resolve drop world position
        const worldPoint = this._raycastFloor(e);
        if (!worldPoint) {
            console.warn('[FurnitureDragDropHandler] Drop: raycast found no floor surface');
            return;
        }

        // Resolve active level — 07-BIM §7.2: fail explicitly with no silent fallback
        const projectContext = (window as { projectContext?: { activeLevelId?: string } }).projectContext;
        const levelId = projectContext?.activeLevelId;
        if (!levelId) {
            console.error('[FurnitureDragDropHandler] Drop: no active level — cannot place furniture');
            return;
        }

        const dim = descriptor.defaultDimensions;

        // [F-1.3] Bus-primary: commandManager exfiltrated to CreateFurnitureHandler (plugins/furniture).
        window.runtime?.bus?.executeCommand('furniture.create', {
            furnitureType: furnitureType as FurnitureType,
            position:    { x: worldPoint.x, y: worldPoint.y, z: worldPoint.z },
            rotation:    { x: 0, y: 0, z: 0 },
            levelId,
            baseOffset:  dim.baseOffset,
            width:       dim.width,
            length:      dim.length,
            height:      dim.height,
            material:    descriptor.defaultMaterial,
            color:       descriptor.defaultColor,
            metadata:    descriptor.defaultProperties
                ? { ...descriptor.defaultProperties }
                : undefined,
        } as any)
        .then(() => console.log(
            `[FurnitureDragDropHandler] Placed ${furnitureType} at` +
            ` (${worldPoint.x.toFixed(2)}, ${worldPoint.z.toFixed(2)})`,
        ))
        .catch((e: Error) => console.error('[FurnitureDragDropHandler] furniture.create failed:', e));

        // Trigger renderer update for MANUAL mode renderers
        const renderer = this.world.renderer as unknown as { mode?: string; needsUpdate?: boolean };
        if (renderer?.mode === 'manual' && 'needsUpdate' in renderer) {
            renderer.needsUpdate = true;
        }
    }

    private _handleDragLeave(_e: DragEvent): void {
        // Carousel deprecated — no drop indicator to remove.
    }

    // ── Raycast ──────────────────────────────────────────────────────────────

    /**
     * Cast a ray from the pointer position into the scene.
     * Prefers slab meshes (tagged `elementType: 'Slab'`) — identical pattern
     * to FurnitureTool.getWorldPoint(). Falls back to the Y=0 horizontal plane.
     */
    private _raycastFloor(e: DragEvent): THREE.Vector3 | null {
        return this._raycastClientPoint(e.clientX, e.clientY);
    }

    private _raycastClientPoint(clientX: number, clientY: number): THREE.Vector3 | null {
        if (!this.world?.renderer || !this.world.camera) return null;

        const canvas   = this.canvasEl!;
        const rect     = canvas.getBoundingClientRect();
        const mouse    = new THREE.Vector2(
            ((clientX - rect.left) / rect.width)  *  2 - 1,
            ((clientY - rect.top)  / rect.height) * -2 + 1,
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);

        // 1. Try slabs first
        const slabs = this.world.scene.three.children.filter(
            (c): c is THREE.Object3D => c.userData['elementType'] === 'Slab'
        );
        if (slabs.length > 0) {
            const hits = raycaster.intersectObjects(slabs, true);
            if (hits.length > 0) return hits[0].point;
        }

        // 2. Fallback: Y=0 plane
        const plane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const result = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, result) ? result : null;
    }

    // ── Drop preview (purple translucent 3D box + grounding ring) ────────────

    /**
     * Resolve a footprint for the dragged item from the registry. GLB catalog
     * items (path-based) and unknown types fall back to a 1×1×1 m block —
     * the 3D preview is always shown so the user sees something on the scene.
     */
    private _resolvePreviewDims(type: string): PreviewDims {
        if (!type || type.startsWith('/')) return { ...GLB_FALLBACK_DIMS };
        const desc = getDescriptorForType(type);
        if (!desc) return { ...GLB_FALLBACK_DIMS };
        const d = desc.defaultDimensions;
        return {
            width:      d.width,
            length:     d.length,
            height:     d.height,
            baseOffset: d.baseOffset,
        };
    }

    /**
     * Show (or move) the translucent purple 3D preview at the given world
     * position. Mirrors PlumbingTool's preview look (PRYZM_PURPLE @ 0.55).
     * The group is tagged `userData.isPreview = true` per the curtain-wall
     * preview convention (05-CURTAIN-WALL-TOOL-CONTRACT §4.2).
     */
    private _showPreview(position: THREE.Vector3): void {
        if (!this.indicatorScene || !this.previewDims) return;

        if (!this.preview) {
            const dims = this.previewDims;
            const group = new THREE.Group();
            group.userData['isPreview'] = true;
            group.userData['source']    = 'FurnitureDragDropHandler';

            // Translucent purple body
            const bodyMat = new THREE.MeshStandardMaterial({
                color:       PRYZM_PURPLE,
                transparent: true,
                opacity:     PREVIEW_OPACITY,
                depthWrite:  false,
            });
            const bodyGeo = new THREE.BoxGeometry(dims.width, dims.height, dims.length);
            const body = new THREE.Mesh(bodyGeo, bodyMat);
            body.position.y = dims.baseOffset + dims.height / 2;
            body.userData['isPreview'] = true;
            group.add(body);

            // Bold purple wireframe so the silhouette reads against any background
            const edgesGeo = new THREE.EdgesGeometry(bodyGeo);
            const edgesMat = new THREE.LineBasicMaterial({
                color:       PRYZM_PURPLE,
                transparent: true,
                opacity:     0.9,
            });
            const edges = new THREE.LineSegments(edgesGeo, edgesMat);
            edges.position.copy(body.position);
            edges.userData['isPreview'] = true;
            group.add(edges);

            // Floor grounding ring
            const ringGeo = new THREE.RingGeometry(RING_INNER, RING_OUTER, RING_SEGMENTS);
            const ringMat = new THREE.MeshBasicMaterial({
                color:       PRYZM_PURPLE,
                transparent: true,
                opacity:     0.75,
                side:        THREE.DoubleSide,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.005;
            ring.userData['isPreview'] = true;
            group.add(ring);

            this.preview = group;
            this.indicatorScene.add(this.preview);
        }

        this.preview.position.copy(position);
        this.preview.visible = true;

        // Signal renderer to update in MANUAL mode
        const renderer = this.world?.renderer as unknown as { mode?: string; needsUpdate?: boolean };
        if (renderer?.mode === 'manual' && 'needsUpdate' in renderer) {
            renderer.needsUpdate = true;
        }
    }

    /**
     * Hide and remove the preview group from the scene. Disposes geometry +
     * materials to avoid memory leaks (01-BIM §4.5).
     */
    private _removePreview(): void {
        if (!this.preview) return;

        if (this.indicatorScene) {
            this.indicatorScene.remove(this.preview);
        }

        this.preview.traverse(obj => {
            const mesh = obj as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
            if (mesh.geometry) mesh.geometry.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach(m => m.dispose());
            else if (mat) (mat as THREE.Material).dispose();
        });

        this.preview = null;

        // Signal renderer to update in MANUAL mode
        const renderer = this.world?.renderer as unknown as { mode?: string; needsUpdate?: boolean };
        if (renderer?.mode === 'manual' && 'needsUpdate' in renderer) {
            renderer.needsUpdate = true;
        }
    }
}
