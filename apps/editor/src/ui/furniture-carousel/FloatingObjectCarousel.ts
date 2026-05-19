/**
 * @file FloatingObjectCarousel.ts
 *
 * True-3D furniture carousel rendered in its own separate Three.js WebGL scene.
 * Completely replaces the CSS-card FurnitureCarousel as the visible UI, while
 * preserving the identical public API so EngineBootstrap wiring is a one-line
 * swap with zero changes to any other system.
 *
 * Architecture rules (contracts enforced):
 *  - Pure UI overlay module — no store writes, no command dispatch (01-BIM §1.1).
 *  - All placement logic delegated to FurnitureDragDropHandler via HTML5 DragEvent
 *    bridge and the existing `fc-drag-start` / `fc-drag-end` CustomEvent contract.
 *  - No @thatopen/ui (bim-*) elements (05-BIM-UI §7.8).
 *  - No new server endpoints (07-BIM-SECURITY §7.2).
 *  - Uses its own THREE.WebGLRenderer (alpha:true, transparent) — does NOT share
 *    or mutate the engine renderer or scene.
 *  - Fires `furniture-carousel-hidden` (asynchronously via setTimeout 0) to avoid
 *    re-entrant layout pop (same convention as FurnitureCarousel).
 *
 * Drag-to-scene bridge
 * ────────────────────
 * FurnitureDragDropHandler relies on HTML5 dragover / drop events fired on the
 * main Three.js canvas element, plus `fc-drag-start` on window to set the active
 * furniture type.  When the user pointer-drags a model upward out of this canvas:
 *   1. `canvas.style.pointerEvents` is set to 'none' so the pointer hits the main
 *      scene canvas through the DOM.
 *   2. `fc-drag-start` is dispatched on window (sets activeDragType in handler).
 *   3. Synthetic `DragEvent('dragover')` is dispatched on the element found via
 *      `document.elementFromPoint(x, y)` — this shows the placement indicator.
 *   4. On pointer-up, a synthetic `DragEvent('drop')` is dispatched, causing
 *      FurnitureDragDropHandler to raycast the floor and place the furniture.
 *   5. `fc-drag-end` is dispatched on window for handler cleanup.
 *   6. carousel canvas pointer-events are restored.
 *
 * Public API (identical to FurnitureCarousel):
 *   mount(containerEl: HTMLElement): void
 *   setVisible(visible: boolean): void
 *   setCategory(category: FurnitureCategory): void
 *   destroy(): void
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { GLTFLoader } from '@pryzm/renderer-three';
import { FurnitureCategory, FurnitureType } from '@pryzm/geometry-furniture';
import {
    getCategories,
    getItemsForCategory,
    FurnitureTypeDescriptor,
} from './FurnitureCategoryRegistry';
import {
    buildFurnitureGeometry,
} from './FurnitureGeometryFactory';

// ─── Layout constants ─────────────────────────────────────────────────────────

const HALF_WIN      = 3;          // items visible on each side of centre
const STEP_ANGLE    = 0.30;       // arc angle per item (radians, ~17°)
const ARC_RADIUS    = 5.20;       // metres — wider arc projects items further L/R
const MODEL_SCALE   = 1.1;        // world-unit height of normalised models
const FLOAT_Y       = 0.010;      // ground offset
const PX_PER_STEP   = 90;         // drag pixels to advance one item

// Camera — reframed for 140 px container height
const CAM_POS  = new THREE.Vector3(0, 1.20, 6.20);
const CAM_AT   = new THREE.Vector3(0, 0.28, 0);
const CAM_FOV  = 38;

// Animation
const SNAP_STIFFNESS = 0.14;  // lerp factor per frame (60 fps target)
const INERTIA_DECAY  = 0.78;  // velocity decay per frame

// Label vertical offset below model base projected to screen (px below the
// lowest visible point of the model, estimated)
const LABEL_OFFSET_PX = 12;

// ─── CarouselItem ─────────────────────────────────────────────────────────────

interface CarouselItem {
    descriptor: FurnitureTypeDescriptor;
    group:      THREE.Group;
    labelEl:    HTMLElement;
}

// ─── FloatingObjectCarousel ───────────────────────────────────────────────────

export class FloatingObjectCarousel {

    // ── DOM ────────────────────────────────────────────────────────────────────
    private root:       HTMLElement | null = null;
    private chipBar:    HTMLElement | null = null;
    private canvas:     HTMLCanvasElement | null = null;
    private labelLayer: HTMLElement | null = null;
    private closeBtn:   HTMLElement | null = null;
    private arrowLeft:  HTMLElement | null = null;
    private arrowRight: HTMLElement | null = null;

    // ── Three.js ───────────────────────────────────────────────────────────────
    private renderer: THREE.WebGLRenderer | null = null;
    private scene:    THREE.Scene | null = null;
    private camera:   THREE.PerspectiveCamera | null = null;
    private ground:   THREE.Mesh | null = null;
    private dirLight: THREE.DirectionalLight | null = null;

    // ── Carousel state ────────────────────────────────────────────────────────
    private items:         CarouselItem[] = [];
    private activeCategory: FurnitureCategory = 'sofas';
    private scrollOffset:  number = 0;  // continuous (may be fractional)
    private targetOffset:  number = 0;  // snapped to nearest integer
    private velocity:      number = 0;
    private isVisible:     boolean = false;
    // D.7.5 batch #4: rAF handle replaced by FrameScheduler disposer.
    private rafId: TickListenerDisposer | null = null;

    // ── Pointer / drag ────────────────────────────────────────────────────────
    private ptrDown:       boolean = false;
    private ptrDragStart:  boolean = false;
    private ptrStartX:     number = 0;
    private ptrLastX:      number = 0;
    private ptrOffsetAtDown: number = 0;
    private dragFurnitureType: FurnitureType | string | null = null;
    private dragGhost:     HTMLElement | null = null;
    private fcDragStarted: boolean = false;
    private canvasBounds:  DOMRect | null = null;

    // Bound listeners for cleanup
    private _onPtrDown:   (e: PointerEvent) => void;
    private _onPtrMove:   (e: PointerEvent) => void;
    private _onPtrUp:     (e: PointerEvent) => void;
    private _onKeyDown:   (e: KeyboardEvent) => void;
    private _onResize:    () => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this._onPtrDown = this._handlePointerDown.bind(this);
        this._onPtrMove = this._handlePointerMove.bind(this);
        this._onPtrUp   = this._handlePointerUp.bind(this);
        this._onKeyDown = this._handleKeyDown.bind(this);
        this._onResize  = this._handleResize.bind(this);
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    mount(containerEl: HTMLElement): void {
        this._buildDOM(containerEl);
        this._buildThreeScene();
        this._loadCategory(this.activeCategory);
        // Do NOT start the render loop here — it will begin on first setVisible(true).
        // This keeps the carousel fully dormant until the user opens the furniture tool.
        window.addEventListener('resize', this._onResize);
        window.addEventListener('keydown', this._onKeyDown);
        console.log('[FloatingObjectCarousel] Mounted (hidden, render loop deferred)');
    }

    setVisible(visible: boolean): void {
        if (this.isVisible === visible) return;
        this.isVisible = visible;

        if (this.root) {
            if (visible) {
                this.root.classList.add('foc-visible');
            } else {
                this.root.classList.remove('foc-visible');
                setTimeout(() => {
                    window.runtime?.events?.emit('furniture-carousel-hidden', {}); // F.events.12
                }, 0);
            }
        }

        if (visible) {
            this._startRenderLoop();
        } else {
            this._stopRenderLoop();
        }
    }

    setCategory(category: FurnitureCategory): void {
        if (this.activeCategory === category) return;
        this.activeCategory = category;
        this._updateChipBar();
        this._loadCategory(category);
    }

    destroy(): void {
        this._stopRenderLoop();
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('keydown', this._onKeyDown);
        if (this.canvas) {
            this.canvas.removeEventListener('pointerdown', this._onPtrDown);
        }
        window.removeEventListener('pointermove', this._onPtrMove);
        window.removeEventListener('pointerup',   this._onPtrUp);

        this._clearItems();
        this.renderer?.dispose();
        this.root?.remove();
    }

    // ── DOM construction ───────────────────────────────────────────────────────

    private _buildDOM(containerEl: HTMLElement): void {
        // Outer shell (transparent, pointer-events:none except children)
        this.root = document.createElement('div');
        this.root.className = 'foc-container';

        // Category chip bar
        this.chipBar = document.createElement('div');
        this.chipBar.className = 'foc-chip-bar';
        this.root.appendChild(this.chipBar);

        // Nav arrows
        this.arrowLeft = document.createElement('button');
        this.arrowLeft.className = 'foc-arrow foc-arrow-left';
        this.arrowLeft.innerHTML = '‹';
        this.arrowLeft.setAttribute('aria-label', 'Previous');
        this.arrowLeft.addEventListener('click', () => this._stepBy(-1));
        this.root.appendChild(this.arrowLeft);

        this.arrowRight = document.createElement('button');
        this.arrowRight.className = 'foc-arrow foc-arrow-right';
        this.arrowRight.innerHTML = '›';
        this.arrowRight.setAttribute('aria-label', 'Next');
        this.arrowRight.addEventListener('click', () => this._stepBy(1));
        this.root.appendChild(this.arrowRight);

        // Three.js canvas
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'foc-canvas';
        this.root.appendChild(this.canvas);

        // Label overlay (2D text labels positioned via 3D projection)
        this.labelLayer = document.createElement('div');
        this.labelLayer.className = 'foc-label-layer';
        this.root.appendChild(this.labelLayer);

        // Close button
        this.closeBtn = document.createElement('button');
        this.closeBtn.className = 'foc-close-btn';
        this.closeBtn.innerHTML = '✕';
        this.closeBtn.setAttribute('aria-label', 'Close furniture panel');
        this.closeBtn.addEventListener('click', () => this.setVisible(false));
        this.root.appendChild(this.closeBtn);

        containerEl.appendChild(this.root);

        // Pointer events on canvas
        this.canvas.addEventListener('pointerdown', this._onPtrDown);
        window.addEventListener('pointermove', this._onPtrMove);
        window.addEventListener('pointerup',   this._onPtrUp);

        // Build chip bar content
        this._buildChipBar();
    }

    private _buildChipBar(): void {
        if (!this.chipBar) return;
        this.chipBar.innerHTML = '';
        getCategories().forEach(catDesc => {
            const chip = document.createElement('button');
            chip.className = 'foc-chip' + (catDesc.id === this.activeCategory ? ' foc-chip-active' : '');
            chip.textContent = catDesc.label;
            chip.dataset['cat'] = catDesc.id;
            chip.addEventListener('click', () => this.setCategory(catDesc.id));
            this.chipBar!.appendChild(chip);
        });
    }

    private _updateChipBar(): void {
        if (!this.chipBar) return;
        this.chipBar.querySelectorAll<HTMLElement>('.foc-chip').forEach(chip => {
            chip.classList.toggle('foc-chip-active', chip.dataset['cat'] === this.activeCategory);
        });
    }

    // ── Three.js scene construction ────────────────────────────────────────────

    private _buildThreeScene(): void {
        if (!this.canvas) return;

        // Renderer — transparent background, soft shadows
        this.renderer = new THREE.WebGLRenderer({
            canvas:    this.canvas,
            alpha:     true,
            antialias: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

        // Scene — no fog, no background
        this.scene = new THREE.Scene();

        // Camera
        const w = this.canvas.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || 210;
        this.camera = new THREE.PerspectiveCamera(CAM_FOV, w / h, 0.1, 60);
        this.camera.position.copy(CAM_POS);
        this.camera.lookAt(CAM_AT);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 1.4);
        this.scene.add(ambient);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 2.6);
        this.dirLight.position.set(4, 9, 5);
        this.dirLight.castShadow                   = true;
        this.dirLight.shadow.mapSize.width          = 1024;
        this.dirLight.shadow.mapSize.height         = 1024;
        this.dirLight.shadow.radius                 = 6;
        this.dirLight.shadow.camera.near            = 0.5;
        this.dirLight.shadow.camera.far             = 30;
        this.dirLight.shadow.camera.left            = -8;
        this.dirLight.shadow.camera.right           = 8;
        this.dirLight.shadow.camera.top             = 8;
        this.dirLight.shadow.camera.bottom          = -8;
        this.scene.add(this.dirLight);

        // Hemisphere light for sky/ground colour gradient
        const hemi = new THREE.HemisphereLight(0xfff8f0, 0x202830, 0.55);
        this.scene.add(hemi);

        // Ground plane — ShadowMaterial shows only shadow, everything else clear
        const groundGeo = new THREE.PlaneGeometry(40, 40);
        const groundMat = new THREE.ShadowMaterial({ opacity: 0.14, color: 0x000000 });
        this.ground = new THREE.Mesh(groundGeo, groundMat);
        this.ground.rotation.x   = -Math.PI / 2;
        this.ground.position.y   = -0.002;
        this.ground.receiveShadow = true;
        this.ground.castShadow    = false;
        this.scene.add(this.ground);

        this._syncRendererSize();
    }

    private _syncRendererSize(): void {
        if (!this.renderer || !this.canvas || !this.camera) return;
        const w = this.canvas.clientWidth  || window.innerWidth;
        const h = this.canvas.clientHeight || 210;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.canvasBounds = this.canvas.getBoundingClientRect();
    }

    // ── Item management ────────────────────────────────────────────────────────

    private _loadCategory(category: FurnitureCategory): void {
        this._clearItems();

        const descriptors = getItemsForCategory(category);
        const loader = new GLTFLoader();

        descriptors.forEach(descriptor => {
            // Each item gets a plain group; content is added sync (parametric) or async (GLB)
            const group = new THREE.Group();
            group.position.y = FLOAT_Y;
            if (this.scene) this.scene.add(group);

            const labelEl = document.createElement('span');
            labelEl.className   = 'foc-item-label';
            labelEl.textContent = descriptor.label;
            if (this.labelLayer) this.labelLayer.appendChild(labelEl);

            const item = { descriptor, group, labelEl };
            this.items.push(item);

            if (descriptor.glbPath) {
                // Async: load real GLB and normalise its height to 1 world-unit so
                // _arrangeItems can apply MODEL_SCALE uniformly for all item types.
                loader.load(
                    descriptor.glbPath,
                    (gltf) => {
                        // Guard: item may have been cleared while loading
                        if (!this.items.includes(item)) return;
                        const model = gltf.scene;
                        const box = new THREE.Box3().setFromObject(model);
                        const size = box.getSize(new THREE.Vector3());
                        const maxDim = Math.max(size.x, size.y, size.z);
                        if (maxDim > 0) model.scale.setScalar(1.0 / maxDim);
                        group.add(model);
                    },
                    undefined,
                    (err) => {
                        if (!this.items.includes(item)) return;
                        console.warn(`[Carousel] GLB load failed for ${descriptor.glbPath}:`, err);
                        // Fallback: grey box so the slot is never empty
                        const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                        const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
                        const mesh = new THREE.Mesh(geo, mat);
                        mesh.scale.setScalar(1.0 / 0.8); // normalise to 1 unit
                        group.add(mesh);
                    },
                );
            } else {
                // Sync: use the existing procedural geometry factory and normalise.
                // Forward per-descriptor colour hints so duplicate-type entries
                // (e.g. multiple sofa palettes) render distinct thumbnails.
                const parseHex = (s?: string): number | undefined =>
                    s ? parseInt(s.replace('#', '0x')) : undefined;
                const propsRaw = descriptor.defaultProperties;
                const frameRaw = propsRaw && typeof propsRaw['frameColor'] === 'string'
                    ? (propsRaw['frameColor'] as string) : undefined;
                const parametric = buildFurnitureGeometry(
                    descriptor.type as FurnitureType,
                    {
                        fabricHex: parseHex(descriptor.defaultColor),
                        frameHex:  parseHex(frameRaw),
                    },
                );
                const box = new THREE.Box3().setFromObject(parametric);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                if (maxDim > 0) parametric.scale.setScalar(1.0 / maxDim);
                group.add(parametric);
            }
        });

        this.scrollOffset = 0;
        this.targetOffset = 0;
        this.velocity     = 0;
        this._arrangeItems(0);
    }

    private _clearItems(): void {
        this.items.forEach(item => {
            // Traverse and dispose all mesh children (handles both GLB scenes and
            // procedural groups — safe replacement for disposeFurnitureGeometry).
            item.group.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    const mats = Array.isArray(child.material)
                        ? child.material
                        : [child.material as THREE.Material];
                    mats.forEach(m => m.dispose());
                }
            });
            this.scene?.remove(item.group);
            item.labelEl.remove();
        });
        this.items = [];
    }

    // ── Layout ─────────────────────────────────────────────────────────────────

    /**
     * Position, rotate, and scale every item group based on the continuous
     * scroll offset.  Items outside ±HALF_WIN are hidden.
     */
    private _arrangeItems(offset: number): void {
        if (!this.camera) return;

        const focusedIdx = Math.round(offset);

        this.items.forEach((item, i) => {
            const virtualOffset = i - offset;
            const absOff        = Math.abs(virtualOffset);

            if (absOff > HALF_WIN + 1) {
                item.group.visible   = false;
                item.labelEl.style.display = 'none';
                return;
            }

            item.group.visible = true;

            // Arc position
            const angle = virtualOffset * STEP_ANGLE;
            item.group.position.x = ARC_RADIUS * Math.sin(angle);
            item.group.position.z = ARC_RADIUS * (Math.cos(angle) - 1);
            item.group.position.y = FLOAT_Y;

            // Face toward camera (partial rotation)
            item.group.rotation.y = -angle * 0.55;

            // Scale depth cue + 25 % centre-item boost (smoothstep, §2.3)
            const rawFactor   = Math.max(0.48, 1.0 - absOff * 0.12);
            const t           = Math.max(0, 1 - absOff / 0.5);          // 1 at centre, 0 at ±0.5
            const smooth      = t * t * (3 - 2 * t);                    // smoothstep
            const centreBoost = 1.0 + 0.25 * smooth;                    // 1.25 at centre, 1.0 at edges
            item.group.scale.setScalar(MODEL_SCALE * rawFactor * centreBoost);

            // Label — project 3D base position to 2D screen
            this._updateLabel(item, i === focusedIdx);
        });
    }

    private _updateLabel(item: CarouselItem, isFocused: boolean): void {
        if (!isFocused) {
            item.labelEl.style.display = 'none';
            return;
        }

        if (!this.camera || !this.canvasBounds) return;

        // Project the model's ground position to screen space
        const worldPos = new THREE.Vector3();
        item.group.getWorldPosition(worldPos);
        worldPos.y = item.group.position.y; // use base y

        const projected = worldPos.clone().project(this.camera);

        const screenX = ((projected.x + 1) / 2) * this.canvasBounds.width;
        const screenY = ((-projected.y + 1) / 2) * this.canvasBounds.height;

        item.labelEl.style.display    = 'block';
        item.labelEl.style.left       = `${screenX.toFixed(1)}px`;
        item.labelEl.style.top        = `${(screenY + LABEL_OFFSET_PX).toFixed(1)}px`;
        item.labelEl.style.opacity    = '0.75';
        item.labelEl.style.fontWeight = '500';
    }

    // ── Render loop ────────────────────────────────────────────────────────────

    private _startRenderLoop(): void {
        if (this.rafId !== null) return;
        // D.7.5 batch #4: continuous tick driven by FrameScheduler.
        // The scheduler re-invokes the callback every frame; no manual reschedule.
        this.rafId = getFrameScheduler().addTickListener(
            'floating-object-carousel-loop',
            () => this._tick(),
            'overlay',
        );
    }

    private _stopRenderLoop(): void {
        // D.7.5 batch #4: dispose the FrameScheduler tick listener.
        if (this.rafId !== null) {
            this.rafId();
            this.rafId = null;
        }
    }

    private _tick(): void {
        // Spring-snap toward target
        const delta = this.targetOffset - this.scrollOffset;
        this.scrollOffset += delta * SNAP_STIFFNESS;

        // Friction for inertia after pointer release
        this.velocity *= INERTIA_DECAY;
        if (!this.ptrDown) {
            this.scrollOffset += this.velocity;
        }

        this._arrangeItems(this.scrollOffset);

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    // ── Pointer interaction ────────────────────────────────────────────────────

    private _handlePointerDown(e: PointerEvent): void {
        this.ptrDown         = true;
        this.ptrDragStart    = false;
        this.ptrStartX       = e.clientX;
        this.ptrLastX        = e.clientX;
        this.ptrOffsetAtDown = this.scrollOffset;
        this.velocity        = 0;
        this.canvasBounds    = this.canvas?.getBoundingClientRect() ?? null;

        // Determine which item was hit (closest to centre of canvas).
        // For Kave GLB items use glbPath as the drag payload so FurnitureDragDropHandler
        // routes it through the fc-add-glb path (startsWith('/') check in _handleDrop).
        const focusedIdx = Math.round(this.scrollOffset);
        const focusedItem = this.items[focusedIdx];
        this.dragFurnitureType = (focusedItem?.descriptor.glbPath ?? focusedItem?.descriptor.type) ?? null;
    }

    private _handlePointerMove(e: PointerEvent): void {
        if (!this.ptrDown) return;

        const dx = e.clientX - this.ptrLastX;
        this.ptrLastX = e.clientX;
        this.velocity = -dx / PX_PER_STEP;

        const totalDx     = e.clientX - this.ptrStartX;
        const rawOffset   = this.ptrOffsetAtDown - totalDx / PX_PER_STEP;
        const maxOffset   = Math.max(0, this.items.length - 1);
        this.scrollOffset = Math.max(0, Math.min(maxOffset, rawOffset));
        this.targetOffset = Math.round(this.scrollOffset);

        // Mark as drag (not tap) after 6px threshold
        if (!this.ptrDragStart && Math.abs(totalDx) > 6) {
            this.ptrDragStart = true;
        }

        // ── Drag-to-scene bridge ──────────────────────────────────────────────
        // When the pointer exits the carousel canvas upward (into the BIM scene),
        // bridge to HTML5 DragEvents that FurnitureDragDropHandler understands.
        if (this.ptrDragStart && this.canvasBounds && this.canvas) {
            const aboveCanvas = e.clientY < this.canvasBounds.top;

            if (aboveCanvas && this.dragFurnitureType) {
                // Make our canvas transparent to hit-testing so the main canvas
                // receives subsequent pointer/drag events
                this.canvas.style.pointerEvents = 'none';

                if (!this.fcDragStarted) {
                    this.fcDragStarted = true;
                    window.runtime?.events?.emit('fc-drag-start', { furnitureType: this.dragFurnitureType }); // F.events.12
                    this._showDragGhost(e.clientX, e.clientY, this.dragFurnitureType);
                }

                this._moveDragGhost(e.clientX, e.clientY);

                // Fire synthetic dragover on whatever element is below the cursor
                const target = document.elementFromPoint(e.clientX, e.clientY);
                if (target && target !== this.canvas) {
                    target.dispatchEvent(new DragEvent('dragover', {
                        bubbles:    true,
                        cancelable: true,
                        clientX:    e.clientX,
                        clientY:    e.clientY,
                    }));
                }
            } else if (!aboveCanvas && this.fcDragStarted) {
                // Pointer came back into carousel area — restore events
                this.canvas.style.pointerEvents = 'auto';
                this._hideDragGhost();
                // Signal drag-leave to the main canvas
                const target = document.elementFromPoint(e.clientX, e.clientY);
                target?.dispatchEvent(new DragEvent('dragleave', {
                    bubbles: true,
                    cancelable: true,
                    clientX: e.clientX,
                    clientY: e.clientY,
                }));
            }
        }
    }

    private _handlePointerUp(e: PointerEvent): void {
        if (!this.ptrDown) return;
        this.ptrDown = false;

        if (this.fcDragStarted && this.dragFurnitureType && this.canvas) {
            // Fire drop on the element under the cursor
            const target = document.elementFromPoint(e.clientX, e.clientY);
            if (target && target !== this.canvas) {
                target.dispatchEvent(new DragEvent('drop', {
                    bubbles:    true,
                    cancelable: true,
                    clientX:    e.clientX,
                    clientY:    e.clientY,
                }));
            }
            // Clean up
            window.runtime?.events?.emit('fc-drag-end', {}); // F.events.12
            this.fcDragStarted = false;
            this.canvas.style.pointerEvents = 'auto';
            this._hideDragGhost();
        } else if (!this.ptrDragStart) {
            // Tap (no drag) — navigate to the item closest to the tap X
            this._handleTap(e.clientX);
        }

        this.dragFurnitureType = null;
    }

    /** On a tap, navigate to the item nearest the tap position. */
    private _handleTap(clientX: number): void {
        if (!this.canvasBounds) return;
        const canvasCx = this.canvasBounds.left + this.canvasBounds.width * 0.5;
        const tapOffset = (clientX - canvasCx) / PX_PER_STEP;
        const newTarget = Math.round(this.scrollOffset + tapOffset);
        const maxOff    = Math.max(0, this.items.length - 1);
        this.targetOffset = Math.max(0, Math.min(maxOff, newTarget));
    }

    // ── Drag ghost (visual feedback during drag-to-scene) ─────────────────────

    private _showDragGhost(x: number, y: number, type: string): void {
        if (this.dragGhost) this._hideDragGhost();
        const ghost = document.createElement('div');
        ghost.className = 'foc-drag-ghost';
        ghost.textContent = type.replace(/_/g, ' ');
        ghost.style.left = `${x}px`;
        ghost.style.top  = `${y}px`;
        document.body.appendChild(ghost);
        this.dragGhost = ghost;
    }

    private _moveDragGhost(x: number, y: number): void {
        if (!this.dragGhost) return;
        this.dragGhost.style.left = `${x}px`;
        this.dragGhost.style.top  = `${y}px`;
    }

    private _hideDragGhost(): void {
        this.dragGhost?.remove();
        this.dragGhost = null;
    }

    // ── Navigation ─────────────────────────────────────────────────────────────

    private _stepBy(delta: number): void {
        const maxOff      = Math.max(0, this.items.length - 1);
        this.targetOffset = Math.max(0, Math.min(maxOff, this.targetOffset + delta));
    }

    private _handleKeyDown(e: KeyboardEvent): void {
        if (!this.isVisible) return;
        if (e.key === 'ArrowLeft')  { e.preventDefault(); this._stepBy(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); this._stepBy(1);  }
        if (e.key === 'Escape')     { this.setVisible(false); }
    }

    // ── Resize ─────────────────────────────────────────────────────────────────

    private _handleResize(): void {
        this._syncRendererSize();
    }
}
