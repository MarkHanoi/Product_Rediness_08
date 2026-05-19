/**
 * @file FurnitureCarousel.ts
 *
 * Phase F3 — Orbital Carousel UI Component.
 * UI Amendment 2026-03-19 — 3D Coverflow Redesign.
 *
 * Renders the 3D coverflow furniture browser at the bottom of the canvas.
 * Cards are arranged in a perspective arc (Cover Flow style):
 *   - Center card: full scale, facing camera, glowing border
 *   - Side cards: rotated on Y-axis, scaled down, faded
 *   - Further cards: progressively more rotation and fade
 *
 * Architecture rules (contracts enforced):
 *  - Pure UI layer — NO store writes, NO command dispatch (01-BIM §1.1).
 *  - No @thatopen/ui (bim-*) elements (05-BIM-UI §7.8).
 *  - No new server endpoints (07-BIM-SECURITY §7.2).
 *  - All CSS via var(--fc-*) / var(--app-*) tokens registered in AppTheme.ts.
 *
 * Public API:
 *   mount(containerEl)  — insert DOM into containerEl (call once)
 *   unmount()           — remove DOM, clean up listeners
 *   setVisible(bool)    — slide carousel in / out (CSS transition)
 *   setCategory(cat)    — programmatically switch active category tab
 */

import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { FurnitureCategory } from '@pryzm/geometry-furniture';
import {
    getCategories,
    getItemsForCategory,
    FurnitureCategoryDescriptor,
    FurnitureTypeDescriptor,
} from './FurnitureCategoryRegistry';
import { FurnitureThumbnailService } from './FurnitureThumbnailService';
import * as PryzmIcons from '../icons/PryzmIcons';

// Map from category id → custom isometric icon (16 px)
const CATEGORY_ICONS: Record<string, string> = {
    sofas:           PryzmIcons.sized(PryzmIcons.sofa,    16),
    chairs:          PryzmIcons.sized(PryzmIcons.chair,   16),
    tables:          PryzmIcons.sized(PryzmIcons.table,   16),
    bedroom:         PryzmIcons.sized(PryzmIcons.bed,     16),
    outdoor:         PryzmIcons.sized(PryzmIcons.plant,   16),
    decor:           PryzmIcons.sized(PryzmIcons.lamp,    16),
    soft_furnishings:PryzmIcons.sized(PryzmIcons.carpet,  16),
    lighting:        PryzmIcons.sized(PryzmIcons.lamp,    16),
};

// ─── Coverflow constants ──────────────────────────────────────────────────────

const HALF_WINDOW     = 4;     // cards visible on each side of centre (total 9)
const STEP_X_PX       = 160;   // horizontal spread between card centres (px)
const ROT_Y_DEG       = 42;    // Y-axis rotation per step (degrees)
const ARC_Z_COEFF     = 14;    // Z-depth coefficient: offset² × this (px) — creates arc curve
const PERSPECTIVE_PX  = 880;   // per-card perspective value (px)
const PIXELS_PER_STEP = 90;    // pixels of drag needed to advance one item

// ─── Carousel state ──────────────────────────────────────────────────────────

interface CarouselState {
    items:          readonly FurnitureTypeDescriptor[];
    focusedIndex:   number;
    isDragging:     boolean;
    dragStartX:     number;
    dragAccum:      number;   // accumulated px since pointerdown
    dragVelocity:   number;   // px/frame at last pointermove
    lastDragX:      number;
}

// Modular wrap for circular list
function wrapIndex(index: number, len: number): number {
    return ((index % len) + len) % len;
}

// ── Smooth scale / opacity from virtual (float) offset ───────────────────────

function coverflowScale(dist: number): number {
    return Math.max(0.48, 1.0 - Math.abs(dist) * 0.115);
}

function coverflowOpacity(dist: number): number {
    return Math.max(0.12, 1.0 - Math.abs(dist) * 0.19);
}

// ─── FurnitureCarousel ───────────────────────────────────────────────────────

export class FurnitureCarousel {

    private container:    HTMLElement | null = null;
    private root:         HTMLElement | null = null;
    private tabBar:       HTMLElement | null = null;
    private trackWrapper: HTMLElement | null = null;
    private track:        HTMLElement | null = null;

    private categories:      readonly FurnitureCategoryDescriptor[] = [];
    private activeCategory:  FurnitureCategory = 'sofas';
    private thumbnailService: FurnitureThumbnailService;
    private isVisible:       boolean = false;

    private state: CarouselState = {
        items:        [],
        focusedIndex: 0,
        isDragging:   false,
        dragStartX:   0,
        dragAccum:    0,
        dragVelocity: 0,
        lastDragX:    0,
    };

    // Bound handlers for cleanup
    private _onPointerDown: (e: PointerEvent) => void;
    private _onPointerMove: (e: PointerEvent) => void;
    private _onPointerUp:   (e: PointerEvent) => void;
    private _onKeyDown:     (e: KeyboardEvent) => void;
    private _onWheel:       (e: WheelEvent) => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.thumbnailService = FurnitureThumbnailService.getInstance();
        this.categories = getCategories();

        this._onPointerDown = this._handlePointerDown.bind(this);
        this._onPointerMove = this._handlePointerMove.bind(this);
        this._onPointerUp   = this._handlePointerUp.bind(this);
        this._onKeyDown     = this._handleKeyDown.bind(this);
        this._onWheel       = this._handleWheel.bind(this);
    }

    // ── Public API ──────────────────────────────────────────────────────────

    mount(containerEl: HTMLElement): void {
        if (this.root) return;
        this.container = containerEl;
        this._buildDOM();
        this._setActiveCategory(this.activeCategory, false);
        this._attachGlobalListeners();
    }

    unmount(): void {
        this._detachGlobalListeners();
        if (this.root && this.container) {
            this.container.removeChild(this.root);
        }
        this.root         = null;
        this.tabBar       = null;
        this.trackWrapper = null;
        this.track        = null;
        this.container    = null;
    }

    setVisible(visible: boolean): void {
        this.isVisible = visible;
        if (!this.root) return;
        this.root.classList.toggle('fc-visible', visible);
        if (!visible) {
            setTimeout(() => window.runtime?.events?.emit('furniture-carousel-hidden', {}), 0); // F.events.12
        }
    }

    setCategory(cat: FurnitureCategory): void {
        this._setActiveCategory(cat, true);
    }

    // ── DOM construction ────────────────────────────────────────────────────

    private _buildDOM(): void {
        const root = document.createElement('div');
        root.className = 'fc-container';
        root.setAttribute('role', 'complementary');
        root.setAttribute('aria-label', 'Furniture palette');
        root.setAttribute('aria-live', 'polite');

        // ── Tab bar ──
        const tabBar = document.createElement('div');
        tabBar.className = 'fc-tab-bar';
        tabBar.setAttribute('role', 'tablist');
        tabBar.setAttribute('aria-label', 'Furniture categories');

        for (const cat of this.categories) {
            const tab = document.createElement('button');
            tab.className = 'fc-tab';
            tab.id = `fc-tab-${cat.id}`;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', 'false');
            tab.setAttribute('aria-controls', `fc-panel-${cat.id}`);
            const iconHtml = CATEGORY_ICONS[cat.id] ?? '';
            tab.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;pointer-events:none">${iconHtml}<span>${cat.label}</span></span>`;
            tab.addEventListener('click', () => this._setActiveCategory(cat.id, true));
            tabBar.appendChild(tab);
        }

        // ── Track wrapper (3D perspective host) ──
        const trackWrapper = document.createElement('div');
        trackWrapper.className = 'fc-track-wrapper';
        trackWrapper.setAttribute('role', 'tabpanel');
        trackWrapper.id = `fc-panel-${this.activeCategory}`;
        trackWrapper.setAttribute('aria-labelledby', `fc-tab-${this.activeCategory}`);

        // ── Track (event target; cards are absolutely positioned inside) ──
        const track = document.createElement('div');
        track.className = 'fc-track';
        track.setAttribute('role', 'listbox');
        track.setAttribute('aria-label', 'Available furniture');

        // ── Arrow left ──
        const arrowLeft = document.createElement('button');
        arrowLeft.className = 'fc-arrow fc-arrow-left';
        arrowLeft.setAttribute('aria-label', 'Previous');
        arrowLeft.innerHTML = '&#9664;';
        arrowLeft.addEventListener('click', () => this._navigate(-1));

        // ── Arrow right ──
        const arrowRight = document.createElement('button');
        arrowRight.className = 'fc-arrow fc-arrow-right';
        arrowRight.setAttribute('aria-label', 'Next');
        arrowRight.innerHTML = '&#9654;';
        arrowRight.addEventListener('click', () => this._navigate(1));

        // ── Close button ──
        const closeBtn = document.createElement('button');
        closeBtn.className = 'fc-close';
        closeBtn.setAttribute('aria-label', 'Close furniture palette');
        closeBtn.innerHTML = '&#10005;';
        closeBtn.addEventListener('click', () => this.setVisible(false));

        trackWrapper.appendChild(track);
        trackWrapper.appendChild(arrowLeft);
        trackWrapper.appendChild(arrowRight);
        trackWrapper.appendChild(closeBtn);

        root.appendChild(tabBar);
        root.appendChild(trackWrapper);

        this.container!.appendChild(root);

        this.root         = root;
        this.tabBar       = tabBar;
        this.trackWrapper = trackWrapper;
        this.track        = track;

        // Drag + wheel on the wrapper (it has dimensions; track is 0×0)
        trackWrapper.addEventListener('pointerdown', this._onPointerDown);
        trackWrapper.addEventListener('wheel', this._onWheel, { passive: false });
    }

    // ── Category switching ───────────────────────────────────────────────────

    private _setActiveCategory(cat: FurnitureCategory, animate: boolean): void {
        this.activeCategory = cat;

        if (this.tabBar) {
            const tabs = this.tabBar.querySelectorAll<HTMLButtonElement>('.fc-tab');
            tabs.forEach(t => {
                const isActive = t.id === `fc-tab-${cat}`;
                t.classList.toggle('fc-tab-active', isActive);
                t.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
        }

        if (this.trackWrapper) {
            this.trackWrapper.id = `fc-panel-${cat}`;
            this.trackWrapper.setAttribute('aria-labelledby', `fc-tab-${cat}`);
        }

        const items = getItemsForCategory(cat);
        this.state.items        = items;
        this.state.focusedIndex = 0;

        this._renderCards(animate);

        // Only preload parametric items through the ThumbnailService —
        // Kave GLB items use static thumbnailPath and skip this service entirely.
        const parametricItems = items.filter(i => !i.glbPath);
        if (parametricItems.length > 0) {
            this.thumbnailService
                .preloadCategory(parametricItems.map(i => i.type as import('@pryzm/geometry-furniture').FurnitureType))
                .then(() => this._refreshThumbnails())
                .catch(() => { /* non-fatal */ });
        }
    }

    // ── 3D Coverflow card rendering ──────────────────────────────────────────

    /**
     * Compute the full CSS transform + opacity + z-index for a card at a given
     * virtual (possibly float) offset from the focused centre.
     *
     * The transform creates a genuine 3D arc:
     *   - translateX:  horizontal spread across the screen
     *   - translateZ:  Z-recession for side items (arc depth), via per-element perspective()
     *   - rotateY:     cards angle away from camera as they recede
     *   - scale:       compound size reduction for depth cueing
     *
     * perspective() is applied per-element so each card has its own vanishing
     * point — this prevents the "shared origin" distortion you get with parent
     * perspective when items are far from the centre.
     */
    private _coverflowStyle(virtualOffset: number): { transform: string; opacity: string; zIndex: string } {
        const dist = Math.abs(virtualOffset);
        const x    = virtualOffset * STEP_X_PX;
        // Arc: side items recede in Z (negative = further from camera).
        // We embed the perspective in the transform itself so Z-depth is visible.
        const z    = -(dist * dist) * ARC_Z_COEFF;
        const ry   = -virtualOffset * ROT_Y_DEG;
        const s    = coverflowScale(virtualOffset);
        const op   = coverflowOpacity(virtualOffset);
        const zi   = Math.round(100 - dist * 9);
        return {
            transform: `translate(-50%, -50%) perspective(${PERSPECTIVE_PX}px) translateX(${x.toFixed(1)}px) translateZ(${z.toFixed(1)}px) rotateY(${ry.toFixed(1)}deg) scale(${s.toFixed(4)})`,
            opacity:   op.toFixed(4),
            zIndex:    String(Math.max(1, zi)),
        };
    }

    private _renderCards(animate: boolean): void {
        if (!this.track) return;

        while (this.track.firstChild) {
            this.track.removeChild(this.track.firstChild);
        }

        const { items, focusedIndex } = this.state;

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'fc-empty';
            empty.textContent = 'Coming soon — no items in this category yet.';
            this.track.appendChild(empty);
            return;
        }

        for (let offset = -HALF_WINDOW; offset <= HALF_WINDOW; offset++) {
            const idx  = wrapIndex(focusedIndex + offset, items.length);
            const card = this._buildCard(items[idx], offset, animate);
            this.track.appendChild(card);
        }
    }

    private _buildCard(
        descriptor: FurnitureTypeDescriptor,
        offset:     number,
        animate:    boolean,
    ): HTMLElement {
        const isFocused = offset === 0;

        const card = document.createElement('div');
        card.className = `fc-card${isFocused ? ' fc-card-focused' : ''}`;
        if (animate) card.classList.add('fc-card-entering');
        card.setAttribute('role', 'option');
        card.setAttribute('aria-selected', isFocused ? 'true' : 'false');
        card.setAttribute('aria-label', `${descriptor.label} — drag to place`);
        card.setAttribute('tabindex', isFocused ? '0' : '-1');
        card.setAttribute('draggable', 'true');
        card.dataset['furnitureType'] = descriptor.type;
        card.dataset['offset']        = String(offset);

        // Apply 3D coverflow position
        const style = this._coverflowStyle(offset);
        card.style.transform = style.transform;
        card.style.opacity   = style.opacity;
        card.style.zIndex    = style.zIndex;

        // Thumbnail
        const thumb = document.createElement('img');
        thumb.className = 'fc-card-thumb fc-thumb-loading';
        thumb.alt    = descriptor.label;
        thumb.width  = 144;
        thumb.height = 128;

        if (descriptor.thumbnailPath) {
            // Kave catalog item — use the pre-rendered static WebP thumbnail
            thumb.src = descriptor.thumbnailPath;
            thumb.classList.remove('fc-thumb-loading');
            thumb.onerror = () => { thumb.classList.add('fc-thumb-loading'); };
        } else {
            this.thumbnailService.requestThumbnail(descriptor.type as import('@pryzm/geometry-furniture').FurnitureType)
                .then(dataUrl => {
                    if (!document.contains(thumb)) return;
                    thumb.src = dataUrl;
                    thumb.classList.remove('fc-thumb-loading');
                })
                .catch(() => { thumb.classList.remove('fc-thumb-loading'); });
        }

        // Label
        const label = document.createElement('div');
        label.className  = 'fc-card-label';
        label.textContent = descriptor.label;
        label.title       = descriptor.label;

        card.appendChild(thumb);
        card.appendChild(label);

        if (animate) {
            card.addEventListener('animationend', () => {
                card.classList.remove('fc-card-entering');
            }, { once: true });
        }

        // Click to focus
        card.addEventListener('click', () => {
            if (offset === 0) return;
            this._navigate(offset > 0 ? 1 : -1);
        });

        // Drag-to-scene (Phase F4 contract)
        // For Kave GLB items, the drag payload is the glbPath (/items/…/model.glb).
        // FurnitureDragDropHandler detects the leading '/' to route to addFurniture().
        card.addEventListener('dragstart', (e: DragEvent) => {
            if (!e.dataTransfer) return;
            const dragPayload = descriptor.glbPath ?? descriptor.type;
            e.dataTransfer.setData('text/plain', dragPayload);
            e.dataTransfer.effectAllowed = 'copy';

            const rect = card.getBoundingClientRect();
            e.dataTransfer.setDragImage(card, rect.width / 2, rect.height / 2);

            window.runtime?.events?.emit('fc-drag-start', { furnitureType: dragPayload }); // F.events.12
        });

        card.addEventListener('dragend', () => {
            window.runtime?.events?.emit('fc-drag-end', {}); // F.events.12
        });

        return card;
    }

    // ── Update existing card transforms (used during live drag / momentum) ───

    private _updateCardTransforms(continuousOffset: number): void {
        if (!this.track) return;
        const cards = this.track.querySelectorAll<HTMLElement>('.fc-card');
        cards.forEach(card => {
            const base = Number(card.dataset['offset']);
            const v    = base + continuousOffset;
            const s    = this._coverflowStyle(v);
            card.style.transform = s.transform;
            card.style.opacity   = s.opacity;
            card.style.zIndex    = s.zIndex;
        });
    }

    // ── Navigation ───────────────────────────────────────────────────────────

    private _navigate(direction: -1 | 1): void {
        const { items } = this.state;
        if (items.length === 0) return;
        this.state.focusedIndex = wrapIndex(this.state.focusedIndex + direction, items.length);
        this._renderCards(false);
    }

    // ── Thumbnail refresh ────────────────────────────────────────────────────

    private _refreshThumbnails(): void {
        if (!this.track) return;
        const cards = this.track.querySelectorAll<HTMLElement>('.fc-card');
        cards.forEach(card => {
            const type  = card.dataset['furnitureType'];
            if (!type) return;
            const thumb = card.querySelector<HTMLImageElement>('.fc-card-thumb');
            if (!thumb || !thumb.classList.contains('fc-thumb-loading')) return;
            this.thumbnailService.requestThumbnail(
                type as import('@pryzm/geometry-furniture').FurnitureType
            ).then(dataUrl => {
                if (!document.contains(thumb)) return;
                thumb.src = dataUrl;
                thumb.classList.remove('fc-thumb-loading');
            }).catch(() => { thumb.classList.remove('fc-thumb-loading'); });
        });
    }

    // ── Pointer drag (3D coverflow) ──────────────────────────────────────────

    private _handlePointerDown(e: PointerEvent): void {
        if (e.button !== 0) return;

        this.state.isDragging   = true;
        this.state.dragStartX   = e.clientX;
        this.state.lastDragX    = e.clientX;
        this.state.dragAccum    = 0;
        this.state.dragVelocity = 0;

        this.trackWrapper?.classList.add('fc-dragging');

        this.trackWrapper?.setPointerCapture(e.pointerId);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup',   this._onPointerUp);
    }

    private _handlePointerMove(e: PointerEvent): void {
        if (!this.state.isDragging) return;

        const dx = e.clientX - this.state.lastDragX;
        this.state.dragVelocity = dx;
        this.state.lastDragX    = e.clientX;
        this.state.dragAccum    = e.clientX - this.state.dragStartX;

        // Continuous visual feedback: shift all cards by fractional step
        // +dragAccum = dragged right → focus moves left → continuous offset is negative
        this._updateCardTransforms(-(this.state.dragAccum / PIXELS_PER_STEP));
    }

    private _handlePointerUp(_e: PointerEvent): void {
        if (!this.state.isDragging) return;
        this.state.isDragging = false;
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup',   this._onPointerUp);
        // Keep fc-dragging (no transitions) through momentum phase
        this._startMomentum();
    }

    private _startMomentum(): void {
        let velocity    = this.state.dragVelocity;
        const friction  = 0.88;
        let accumulated = this.state.dragAccum;

        // D.7.5 batch #4: continuous inertia tick driven by FrameScheduler
        // instead of a self-rescheduling rAF. The tick self-disposes once
        // velocity falls below the snap threshold (preserves existing
        // termination semantics — the original `return` before the inner
        // re-arm call was the natural stop condition).
        let disposer: TickListenerDisposer | null = null;
        const tick = () => {
            velocity   *= friction;
            accumulated += velocity;

            if (Math.abs(velocity) < 0.5) {
                // Re-enable CSS transitions then snap
                this.trackWrapper?.classList.remove('fc-dragging');
                this._snapAfterDrag(accumulated);
                if (disposer) { disposer(); disposer = null; }
                return;
            }

            this._updateCardTransforms(-(accumulated / PIXELS_PER_STEP));
        };

        disposer = getFrameScheduler().addTickListener(
            'furniture-carousel-inertia',
            tick,
            'overlay',
        );
    }

    private _snapAfterDrag(totalDeltaPx: number): void {
        const steps = Math.round(-totalDeltaPx / PIXELS_PER_STEP);
        const { items } = this.state;
        if (steps !== 0 && items.length > 0) {
            this.state.focusedIndex = wrapIndex(this.state.focusedIndex + steps, items.length);
        }
        this._renderCards(false);
    }

    // ── Wheel ────────────────────────────────────────────────────────────────

    private _handleWheel(e: WheelEvent): void {
        e.preventDefault();
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
        if (Math.abs(delta) < 5) return;
        this._navigate(delta > 0 ? 1 : -1);
    }

    // ── Keyboard ─────────────────────────────────────────────────────────────

    private _handleKeyDown(e: KeyboardEvent): void {
        if (!this.isVisible) return;

        if (e.key === 'Escape') {
            this.setVisible(false);
            return;
        }

        if (!this.root?.contains(document.activeElement)) return;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            this._navigate(1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this._navigate(-1);
        }
    }

    // ── Global listeners ─────────────────────────────────────────────────────

    private _attachGlobalListeners(): void {
        window.addEventListener('keydown', this._onKeyDown);
    }

    private _detachGlobalListeners(): void {
        window.removeEventListener('keydown',      this._onKeyDown);
        window.removeEventListener('pointermove',  this._onPointerMove);
        window.removeEventListener('pointerup',    this._onPointerUp);
    }
}
