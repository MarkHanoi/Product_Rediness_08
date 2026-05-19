/**
 * §ANN-A4 — 2D Annotation Render Layer (paper-space canvas overlay)
 *
 * A <canvas> element absolutely positioned over the 3D viewport.
 * Renders all annotations owned by the currently active view using 2D canvas
 * drawing calls, projecting model-space points through the live camera.
 *
 * Coordinate transform chain:
 *   World (model metres) → NDC (via camera.project) → Screen pixels
 *
 * Text sizing is paper-space aware: when a viewScale is set (e.g. 1:100),
 * text heights are computed in paper mm and mapped to screen pixels so the
 * annotation looks correct at any zoom level.
 *
 * Contract compliance:
 *   §05 §7.8  — No bim-* / @thatopen/ui elements
 *   §01 §5    — All CSS through AppTheme (ann- prefix); no inline style blocks
 */

import * as THREE from '@pryzm/renderer-three/three';
import { AnnotationStore } from './subsystem/AnnotationStore';
import { AnnotationElement, AnnotationStyle, DEFAULT_ANNOTATION_STYLE } from './subsystem/AnnotationTypes';
import type { LinearDimSegment } from './subsystem/AnnotationTypes';
import { AnnotationVisibilityStore } from './subsystem/AnnotationVisibilityStore';
import { ConstraintStore } from './subsystem/ConstraintStore';
import { WallDimensionRenderer } from './subsystem/WallDimensionRenderer';
import { formatDimension } from './subsystem/DimensionFormatter';
import { unifiedFrameLoop } from '@pryzm/core-app-model';
// DOC-2.7 — ViewLinkResolver for section/elevation mark sheet+detail numbers
import { viewLinkResolver } from './subsystem/ViewLinkResolver';
// DOC-2.5k — VG annotation style cascade
import { vgGovernanceStore, AnnotationStyleRecord } from '@pryzm/core-app-model';

// ── Constraint overlay colours — §VII-2 / §VII-3 ──────────────────────────────
// Applied to linear-dim annotations based on locked/violation state.
const CONSTRAINT_VIOLATED_COLOR  = '#cc2222'; // §VII-3 — violation red (spec exact value)
const CONSTRAINT_SATISFIED_COLOR = '#16a34a'; // satisfied green (kept for visual clarity)
const CONSTRAINT_LOCKED_COLOR    = '#2244aa'; // §VII-2 — locked-but-OK blue tint

// ─────────────────────────────────────────────────────────────────────────────
// §DIM-V-1/V-2 — Hover hint from LinearDimensionAnnotationTool
//
// The tool updates this object on every mousemove. The render layer reads it
// in _render() to draw:
//   V-1: Semi-transparent blue fill on the projected face quad (hover highlight)
//   V-2: Filled reference dots at locked Point A and Point B positions
//
// Plain-object positions avoid importing THREE.Vector3 into the tool's callback
// signature, keeping the tool↔renderLayer coupling type-only.
// ─────────────────────────────────────────────────────────────────────────────

/** Hint payload produced by LinearDimensionAnnotationTool on each hover frame. */
export interface DimHoverHint {
    /** Four corners of the highlighted face quad in world space.
     *  Null when the cursor is not hovering a detectable wall face. */
    faceQuad: {
        bl: { x: number; y: number; z: number };
        br: { x: number; y: number; z: number };
        tr: { x: number; y: number; z: number };
        tl: { x: number; y: number; z: number };
    } | null;
    /** Locked Point A world position — shown as filled dot after first click. */
    lockedA: { x: number; y: number; z: number } | null;
    /** Locked Point B world position — shown as filled dot after second click. */
    lockedB: { x: number; y: number; z: number } | null;
}

/** §DIM-V-1 — Blue tint for the face-quad fill */
const HOVER_FILL_COLOR   = 'rgba(68, 153, 255, 0.22)';
/** §DIM-V-1 — Blue outline for the face-quad border */
const HOVER_STROKE_COLOR = 'rgba(68, 153, 255, 0.85)';
/** §DIM-V-2 — Reference dot fill colour (matches default dimension line colour) */
const REF_DOT_COLOR      = '#1a2035';
/** §DIM-V-2 — Reference dot radius in screen pixels */
const REF_DOT_RADIUS_PX  = 4.5;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mergeStyle(partial: Partial<AnnotationStyle>): AnnotationStyle {
    return { ...DEFAULT_ANNOTATION_STYLE, ...partial };
}

/** Project a world-space point to canvas pixel coordinates */
function worldToCanvas(
    worldPt: THREE.Vector3,
    camera: THREE.Camera,
    canvasWidth: number,
    canvasHeight: number
): { x: number; y: number; visible: boolean } {
    const ndc = worldPt.clone().project(camera);
    const x = (ndc.x * 0.5 + 0.5) * canvasWidth;
    const y = (1.0 - (ndc.y * 0.5 + 0.5)) * canvasHeight;
    return { x, y, visible: ndc.z < 1.0 };
}

/** Paper-space mm → screen pixels (approximate) */
function mmToPx(mm: number, dpi = 96): number {
    return (mm / 25.4) * dpi;
}

// Arrow head drawing
function drawArrow(
    ctx: CanvasRenderingContext2D,
    tip: { x: number; y: number },
    dir: { x: number; y: number },
    sizePx: number,
    style: 'filled' | 'open' | 'dot' | 'none'
): void {
    if (style === 'none') return;

    if (style === 'dot') {
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, sizePx * 0.4, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    const angle = Math.atan2(dir.y, dir.x);
    const a = Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(
        tip.x - sizePx * Math.cos(angle - a),
        tip.y - sizePx * Math.sin(angle - a)
    );
    if (style === 'filled') {
        ctx.lineTo(
            tip.x - sizePx * Math.cos(angle + a),
            tip.y - sizePx * Math.sin(angle + a)
        );
        ctx.closePath();
        ctx.fill();
    } else {
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(
            tip.x - sizePx * Math.cos(angle + a),
            tip.y - sizePx * Math.sin(angle + a)
        );
        ctx.stroke();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AnnotationRenderLayer
// ─────────────────────────────────────────────────────────────────────────────

export class AnnotationRenderLayer {
    private _canvas: HTMLCanvasElement;
    private _ctx: CanvasRenderingContext2D;
    private _activeViewId: string | null = null;
    private _camera: THREE.Camera | null = null;
    /** Phase 3 — unsubscribe handle for the UnifiedFrameLoop tick listener. */
    private _unregisterTick: (() => void) | null = null;
    private _needsRender = true;
    /**
     * DOC-1.5g — Tracks the Three.js `matrixWorldVersion` of the active camera.
     * The frame-loop callback compares against this value each tick; when it
     * differs (zoom, pan, any camera mutation) `_needsRender` is set `true` so
     * annotations reproject through the updated camera matrix.
     *
     * Initialised to -1 so the very first tick is always treated as dirty.
     * Falls back to `NaN` when `matrixWorldVersion` is unavailable (pre-r147
     * Three.js builds), which keeps `NaN !== NaN` always true — i.e. renders
     * every frame, matching the spec's "EVERY FRAME" contract.
     */
    private _cameraMatrixVersion: number = -1;
    private _resizeObserver: ResizeObserver | null = null;
    private _visibilityStore: AnnotationVisibilityStore | null = null;
    /** §C3 — ConstraintStore reference for per-annotation violation overlay */
    private _constraintStore: ConstraintStore | null = null;
    /**
     * DOC-2.5k — Active model ID for VG annotation-style resolution.
     * When set, `_renderAnnotation()` resolves the template's AnnotationStyleRecord
     * and uses it as the base style beneath per-annotation overrides.
     * Null = no VG cascade (keeps pre-DOC-2.5k behaviour).
     */
    private _vgModelId: string | null = null;
    /** §DIM-V-1/V-2 — Hover hint updated by LinearDimensionAnnotationTool each frame */
    private _dimHoverHint: DimHoverHint | null = null;
    /** §ANN-WALL-SEL — BIM element ID of the currently selected element (wall, etc.).
     *  Linear-dim annotations that reference this element are drawn with a highlight. */
    private _selectedElementId: string | null = null;
    /**
     * §ANN-SEL — Screen-space dim line segments tracked per render frame.
     * Cleared at the start of each render pass and rebuilt as each linear-dim
     * annotation is drawn. Used by getAnnotationAtPoint() for click hit-testing
     * so the user can select placed dimensions without a separate 3D raycast.
     */
    private _dimHitSegments: Array<{
        annId: string;
        x1: number; y1: number;
        x2: number; y2: number;
    }> = [];

    constructor(
        private _store: AnnotationStore,
        private _container: HTMLElement
    ) {
        this._canvas = document.createElement('canvas');
        this._canvas.id = 'ann-render-layer';
        this._canvas.className = 'ann-render-layer';
        this._container.style.position = 'relative';
        this._container.appendChild(this._canvas);

        const ctx = this._canvas.getContext('2d');
        if (!ctx) throw new Error('[AnnotationRenderLayer] Cannot get 2D context');
        this._ctx = ctx;

        this._store.onChange(() => { this._needsRender = true; });

        this._setupResize();
        this._registerWithFrameLoop();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    setActiveView(viewId: string | null): void {
        this._activeViewId = viewId;
        this._needsRender = true;
    }

    setCamera(camera: THREE.Camera): void {
        this._camera = camera;
        this._cameraMatrixVersion = -1; // DOC-1.5g: force reproject on first tick with new camera
        this._needsRender = true;
    }

    requestRender(): void {
        this._needsRender = true;
    }

    /** Wire in the visibility store so per-category overrides suppress rendering. */
    setVisibilityStore(store: AnnotationVisibilityStore): void {
        this._visibilityStore = store;
        store.onChange(() => { this._needsRender = true; });
    }

    /**
     * DOC-2.5k — Set the active model ID used to resolve the VG annotation style.
     * Call this whenever the active model changes (same moment ViewController
     * wires in a new camera / view).  Pass null to disable the VG cascade.
     */
    setVGModelId(modelId: string | null): void {
        this._vgModelId = modelId;
        this._needsRender = true;
    }

    /**
     * §C3 — Wire in the ConstraintStore so the render layer can apply
     * violation / satisfied colour overlays on locked linear-dim annotations.
     * Subscribes to store changes to request a re-render whenever solver results update.
     */
    setConstraintStore(store: ConstraintStore): void {
        this._constraintStore = store;
        store.subscribe(() => { this._needsRender = true; });
    }

    /**
     * §DIM-V-1/V-2 — Called by LinearDimensionAnnotationTool on every mousemove.
     * Null clears all hover overlays (tool deactivated or no wall under cursor).
     * Setting a hint always triggers a re-render so the overlay stays in sync with
     * the tool cursor without waiting for the next annotation-store change.
     */
    setDimHoverHint(hint: DimHoverHint | null): void {
        this._dimHoverHint = hint;
        this._needsRender = true;
    }

    /**
     * §ANN-WALL-SEL — Set the currently selected BIM element ID.
     * When set, any linear-dim annotation that references this element is drawn
     * with a Revit-style selection highlight (cyan/violet glow) to signal that
     * clicking it will open the "drive dimension" editor in the property panel.
     * Pass null to clear the highlight (element deselected).
     */
    setSelectedElementId(id: string | null): void {
        this._selectedElementId = id;
        this._needsRender = true;
    }

    dispose(): void {
        this._unregisterTick?.();
        this._unregisterTick = null;
        this._resizeObserver?.disconnect();
        if (this._canvas.parentElement) this._canvas.parentElement.removeChild(this._canvas);
    }

    /**
     * §ANN-SEL — Return the AnnotationElement whose rendered dim line is closest to the
     * given screen point (in CSS pixels relative to the viewport container), or null if
     * no dimension is within the hit threshold.
     *
     * The candidate list (`_dimHitSegments`) is rebuilt on every render pass, so it is
     * always in sync with what the user sees — even after zoom or pan.
     *
     * @param x  CSS pixel X coordinate (from a MouseEvent clientX minus container left)
     * @param y  CSS pixel Y coordinate (from a MouseEvent clientY minus container top)
     * @param threshold  Maximum distance in CSS pixels to count as a hit (default 8)
     */
    getAnnotationAtPoint(x: number, y: number, threshold = 8): AnnotationElement | null {
        for (const seg of this._dimHitSegments) {
            const dist = this._pointToSegmentDist(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
            if (dist <= threshold) {
                return this._store.getById(seg.annId) ?? null;
            }
        }
        return null;
    }

    /**
     * Minimum distance from point (px, py) to line segment (x1,y1)→(x2,y2), in CSS pixels.
     * Used by getAnnotationAtPoint() for click proximity testing.
     */
    private _pointToSegmentDist(
        px: number, py: number,
        x1: number, y1: number,
        x2: number, y2: number
    ): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.001) return Math.hypot(px - x1, py - y1);
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    // ── Frame loop registration (Phase 3) ────────────────────────────────────

    /**
     * Phase 3 — Register an `overlay` priority tick listener with UnifiedFrameLoop.
     *
     * The callback fires every rAF tick (at the end of the frame, after OBC +
     * PASCAL passes).  It is guarded by `_needsRender` (dirty flag) and by
     * `unifiedFrameLoop.isSwitching` (view-switch safety per Contract 02 §4.1).
     * The listener is cleaned up via `_unregisterTick` in `dispose()`.
     */
    private _registerWithFrameLoop(): void {
        this._unregisterTick = unifiedFrameLoop.addTickListener({
            id:       'annotation-render-layer',
            priority: 'overlay',
            callback: (_deltaMs, _timestamp) => {
                // Skip during view switch — scene may be in mid-flight mutation.
                if (unifiedFrameLoop.isSwitching) return;

                // DOC-1.5g — Camera-matrix change detection.
                // Three.js increments `matrixWorldVersion` on every Object3D
                // update that mutates matrixWorld (camera pan, zoom, rotate).
                // Comparing against our stored version detects those mutations
                // without cloning or fingerprinting the full matrix each frame.
                // If `matrixWorldVersion` is absent (pre-r147 build), the cast
                // returns `undefined`, which coerces to `NaN`; since
                // `NaN !== NaN` is always true the layer always rerenders —
                // correct per the spec "EVERY FRAME" contract.
                if (this._camera) {
                    const v: number = (this._camera as any).matrixWorldVersion ?? NaN;
                    if (v !== this._cameraMatrixVersion) {
                        this._cameraMatrixVersion = v;
                        this._needsRender = true;
                    }
                }

                if (!this._needsRender) return;
                this._needsRender = false;
                this._render();
            },
        });
    }

    private _setupResize(): void {
        this._fitToContainer();
        this._resizeObserver = new ResizeObserver(() => {
            this._fitToContainer();
            this._needsRender = true;
        });
        this._resizeObserver.observe(this._container);
    }

    private _fitToContainer(): void {
        const w = this._container.clientWidth;
        const h = this._container.clientHeight;
        if (w === 0 || h === 0) return;
        this._canvas.width = w;
        this._canvas.height = h;
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    private _render(): void {
        const ctx = this._ctx;
        const w = this._canvas.width;
        const h = this._canvas.height;
        ctx.clearRect(0, 0, w, h);

        // §ANN-SEL: rebuild hit-test table on every frame so it stays in sync with the camera
        this._dimHitSegments = [];

        if (!this._activeViewId || !this._camera) return;

        const annotations = this._store.getByView(this._activeViewId);

        annotations.forEach(ann => {
            try {
                this._renderAnnotation(ann, ctx, w, h);
            } catch (e) {
                console.error('[AnnotationRenderLayer] render error for', ann.id, e);
            }
        });

        // §DIM-V-1/V-2 — Draw dim-tool hover overlay on top of all annotations.
        // Called unconditionally (even when there are no placed annotations) so the
        // face-quad highlight and reference dots are visible from the first click.
        this._renderDimHoverHint(ctx, w, h);
    }

    private _renderAnnotation(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number
    ): void {
        // §ANN-B7 — Check per-view category visibility
        if (this._activeViewId && this._visibilityStore) {
            if (!this._visibilityStore.isVisible(this._activeViewId, ann.type)) return;
        }

        // DOC-2.5k — Resolve VG annotation style as the base layer beneath
        // per-annotation overrides.  ann.style always wins over the VG template;
        // the VG template wins over DEFAULT_ANNOTATION_STYLE.
        //
        // Priority (highest to lowest):
        //   ann.style property (explicit placement-time override)
        //   → VG template AnnotationStyleRecord
        //   → DEFAULT_ANNOTATION_STYLE (mergeStyle fallback)
        //
        // Constraint-state colours (CONSTRAINT_VIOLATED_COLOR, etc.) are applied
        // INSIDE each _render*() method via a local `effectiveStyle` spread and
        // therefore still override everything here. ✓
        let vgAnnot: AnnotationStyleRecord | null = null;
        if (this._vgModelId) {
            vgAnnot = vgGovernanceStore.getAnnotationStyle(
                this._vgModelId,
                this._activeViewId ?? undefined,
            );
        }

        // Build the VG base as a Partial<AnnotationStyle> keyed by annotation type.
        // Only fill in properties that ann.style does NOT already override so the
        // per-annotation explicit values always dominate.
        const vgBase: Partial<AnnotationStyle> = {};
        if (vgAnnot) {
            const isSectionMark = ann.type === 'section-mark';
            const isElevMark    = ann.type === 'elevation-mark';
            const isTag         = ann.type === 'tag'
                               || ann.type === 'door-tag'
                               || ann.type === 'window-tag'
                               || ann.type === 'room-tag';
            const isGrid        = ann.type === 'grid-bubble'
                               || ann.type === 'section-grid-line';

            if (!ann.style.lineColor) {
                vgBase.lineColor = isSectionMark || isElevMark
                    ? vgAnnot.sectionMarkColor
                    : isTag
                        ? vgAnnot.tagLeaderColor
                        : isGrid
                            ? vgAnnot.gridBubbleColor
                            : vgAnnot.dimensionLineColor;
            }
            if (!ann.style.textColor) {
                vgBase.textColor = isTag
                    ? vgAnnot.tagTextColor
                    : isGrid
                        ? vgAnnot.gridBubbleColor
                        : vgAnnot.dimensionTextColor;
            }
            if (!ann.style.textSizeMm) {
                vgBase.textSizeMm = isTag ? vgAnnot.tagTextSize : vgAnnot.dimensionTextSize;
            }
        }

        const style = mergeStyle({ ...vgBase, ...ann.style });

        switch (ann.type) {
            case 'linear-dim':     this._renderLinearDim(ann, ctx, w, h, style);     break;
            case 'angular-dim':    this._renderAngularDim(ann, ctx, w, h, style);    break;
            case 'text-note':      this._renderTextNote(ann, ctx, w, h, style);      break;
            case 'tag':            this._renderTag(ann, ctx, w, h, style);            break;
            case 'detail-line':    this._renderDetailLine(ann, ctx, w, h, style);    break;
            case 'spot-elevation': this._renderSpotElevation(ann, ctx, w, h, style); break;
            case 'keynote':        this._renderKeynote(ann, ctx, w, h, style);        break;
            // DOC-2.4 — New dimension types
            case 'radius-dim':     this._renderRadiusDim(ann, ctx, w, h, style);     break;
            case 'diameter-dim':   this._renderDiameterDim(ann, ctx, w, h, style);   break;
            case 'slope-dim':      this._renderSlopeDim(ann, ctx, w, h, style);      break;
            // DOC-2.5 — Specialised tags
            case 'door-tag':       this._renderDoorTag(ann, ctx, w, h, style);       break;
            case 'window-tag':     this._renderWindowTag(ann, ctx, w, h, style);     break;
            case 'level-tag':      this._renderLevelTag(ann, ctx, w, h, style);      break;
            case 'grid-bubble':    this._renderGridBubble(ann, ctx, w, h, style);    break;
            // DOC-2.7 — Section mark + elevation mark
            case 'section-mark':   this._renderSectionMark(ann, ctx, w, h, style);   break;
            case 'elevation-mark': this._renderElevationMark(ann, ctx, w, h, style); break;
            // DOC-2.8 — Callout detail + revision cloud
            case 'callout-detail': this._renderCalloutDetail(ann, ctx, w, h, style); break;
            case 'revision-cloud': this._renderRevisionCloud(ann, ctx, w, h, style); break;
            // DOC-2.5b — Room tags suppressed in overlay; canonical label is the
            // 3D sprite produced by RoomLabelRenderer (white bg, dark profile).
            case 'room-tag':  /* suppressed — RoomLabelRenderer is the single source */  break;
            case 'room-fill': /* TODO DOC-2.5b room polygon fill */         break;
            // DOC-2.5d — Level datum line label (elevation label in section/elevation)
            case 'level-datum-line': this._renderLevelDatumLine(ann, ctx, w, h, style); break;
            // DOC-2.5e — Grid bubble at the top of a vertical grid line in section/elevation
            case 'section-grid-line': this._renderSectionGridLine(ann, ctx, w, h, style); break;
            // DOC-2.5f — Roof slope ratio label at centroid of roof face in plan view
            case 'roof-slope-arrow': this._renderRoofSlopeArrow(ann, ctx, w, h, style); break;
        }

        // §ANN-C2 — Render semantic badge if semantics are present
        if (ann.semantics && this._camera) {
            this._renderSemanticBadge(ann, ctx, w, h);
        }
    }

    // ── §ANN-C2 Semantic badge ─────────────────────────────────────────────────

    private _renderSemanticBadge(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number
    ): void {
        const camera = this._camera!;
        const semantics = ann.semantics!;

        // Pick the first reference point as the badge anchor
        const refPt = ann.references[0]?.cachedPosition
            ?? ann.geometry2D.modelPoints?.[0];
        if (!refPt) return;

        const sp = worldToCanvas(
            new THREE.Vector3(refPt.x, refPt.y, refPt.z),
            camera, w, h
        );
        if (!sp.visible) return;

        // Severity → badge colour
        const severity = semantics.severity ?? 'info';
        const colours: Record<string, { bg: string; border: string; text: string }> = {
            info:     { bg: 'rgba(59,130,246,0.92)',  border: '#2563eb', text: '#fff' },
            warning:  { bg: 'rgba(245,158,11,0.92)', border: '#d97706', text: '#1a1a1a' },
            critical: { bg: 'rgba(220,38,38,0.92)',  border: '#b91c1c', text: '#fff' },
        };
        const c = colours[severity] ?? { bg: 'rgba(59,130,246,0.92)', border: '#2563eb', text: '#fff' };

        // Build label — first non-empty semantic field wins
        const label = (semantics.intent ?? semantics.regulation ?? semantics.performanceCriteria ?? '').slice(0, 60);
        if (!label) return;

        const fontSize = 9;
        const pad = 4;
        ctx.save();
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const metrics = ctx.measureText(label);
        const bw = metrics.width + pad * 2;
        const bh = fontSize + pad * 2;

        // Badge position: 12px below the anchor point
        const bx = sp.x - bw * 0.5;
        const by = sp.y + 12;

        // Background pill
        ctx.fillStyle = c.bg;
        ctx.strokeStyle = c.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        const r = bh * 0.5;
        if (ctx.roundRect) {
            ctx.roundRect(bx, by, bw, bh, r);
        } else {
            ctx.rect(bx, by, bw, bh);
        }
        ctx.fill();
        ctx.stroke();

        // Text
        ctx.fillStyle = c.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + bw * 0.5, by + bh * 0.5);

        // Severity icon dot
        ctx.fillStyle = c.border;
        ctx.beginPath();
        ctx.arc(bx + 5, by + bh * 0.5, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ── §DIM-V-1/V-2 — Hover hint overlay ────────────────────────────────────

    /**
     * Draws the two-part dim-tool hover overlay:
     *
     *   V-1: Semi-transparent blue filled quad on the wall face the cursor is
     *        hovering (matches Revit's blue face-highlight appearance).
     *
     *   V-2: Filled reference dots at locked Point A and Point B positions, so
     *        the user can see exactly which face was captured after clicking.
     *
     * Called last in _render() so it is always drawn on top of placed annotations.
     * No-op when _dimHoverHint is null (tool inactive or no wall under cursor).
     */
    private _renderDimHoverHint(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        const hint = this._dimHoverHint;
        if (!hint || !this._camera) return;
        const camera = this._camera;

        // ── V-1: Face quad fill ───────────────────────────────────────────────
        if (hint.faceQuad) {
            const { bl, br, tr, tl } = hint.faceQuad;
            const sBL = worldToCanvas(new THREE.Vector3(bl.x, bl.y, bl.z), camera, w, h);
            const sBR = worldToCanvas(new THREE.Vector3(br.x, br.y, br.z), camera, w, h);
            const sTR = worldToCanvas(new THREE.Vector3(tr.x, tr.y, tr.z), camera, w, h);
            const sTL = worldToCanvas(new THREE.Vector3(tl.x, tl.y, tl.z), camera, w, h);

            if (sBL.visible || sBR.visible || sTR.visible || sTL.visible) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(sBL.x, sBL.y);
                ctx.lineTo(sBR.x, sBR.y);
                ctx.lineTo(sTR.x, sTR.y);
                ctx.lineTo(sTL.x, sTL.y);
                ctx.closePath();
                ctx.fillStyle = HOVER_FILL_COLOR;
                ctx.fill();
                ctx.strokeStyle = HOVER_STROKE_COLOR;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([]);
                ctx.stroke();
                ctx.restore();
            }
        }

        // ── V-2: Reference dots ───────────────────────────────────────────────
        const drawDot = (pos: { x: number; y: number; z: number }): void => {
            const sp = worldToCanvas(new THREE.Vector3(pos.x, pos.y, pos.z), camera, w, h);
            if (!sp.visible) return;
            ctx.save();
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, REF_DOT_RADIUS_PX, 0, Math.PI * 2);
            ctx.fillStyle = REF_DOT_COLOR;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        };

        if (hint.lockedA) drawDot(hint.lockedA);
        if (hint.lockedB) drawDot(hint.lockedB);
    }

    // ── Linear dimension ──────────────────────────────────────────────────────

    private _renderLinearDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const refs   = ann.references;
        if (refs.length < 2) return;

        // §DIM-VI-3 — String (chain) dimensions use a dedicated render path
        if (ann.parameters.isString === true) {
            this._renderStringDim(ann, ctx, w, h, style);
            return;
        }

        // Use cachedPosition (live-resolved, updated by DependencyGraph when walls move).
        // Fall back to geometry2D.modelPoints only when cachedPosition is absent.
        const mpA = refs[0]!.cachedPosition ?? ann.geometry2D.modelPoints?.[0];
        const mpB = refs[1]!.cachedPosition ?? ann.geometry2D.modelPoints?.[1];
        if (!mpA || !mpB) return;

        // ── Reference points (wall face snap positions) ───────────────────────
        const worldRefA = new THREE.Vector3(mpA.x, mpA.y, mpA.z);
        const worldRefB = new THREE.Vector3(mpB.x, mpB.y, mpB.z);

        // ── §DIM-ORTHO: Determine measurement direction ───────────────────────
        // When measurementNormal is stored (parallel-wall dimension placed via the
        // annotation tool), use it as the axis so the dimension line is always
        // perpendicular to the walls regardless of where along each wall the user
        // clicked. Without it, fall back to the raw A→B direction (legacy path).
        const up = new THREE.Vector3(0, 1, 0);
        const mn = ann.geometry2D.measurementNormal;
        let measureDir: THREE.Vector3;
        let worldRefB_proj: THREE.Vector3; // B projected onto measurement axis through A
        let rawDist: number;

        if (mn && (Math.abs(mn.x) > 0.001 || Math.abs(mn.z) > 0.001)) {
            // §DIM-ORTHO path: use stored wall normal as measurement axis
            measureDir = new THREE.Vector3(mn.x, 0, mn.z).normalize();
            // Project B onto the measurement axis through A:
            //   B_proj = A + dir * (B − A)·dir
            const measuredDist = new THREE.Vector3().subVectors(worldRefB, worldRefA).dot(measureDir);
            worldRefB_proj = worldRefA.clone().addScaledVector(measureDir, measuredDist);
            // True perpendicular distance between the two wall faces
            rawDist = Math.abs(measuredDist);
        } else {
            // Legacy path: derive direction from A→B (may be diagonal for non-parallel walls)
            measureDir = new THREE.Vector3().subVectors(worldRefB, worldRefA);
            measureDir.y = 0;
            const len = measureDir.length();
            if (len < 0.001) return;
            measureDir.normalize();
            worldRefB_proj = worldRefB.clone();
            rawDist = worldRefA.distanceTo(worldRefB);
        }

        // ── Dimension line positions (reference points offset perpendicularly) ─
        // side = wall-direction vector (perpendicular to measurement axis in XZ plane)
        // dimA/dimB are the dim-line endpoints at the stored perpendicular offset.
        const side  = new THREE.Vector3().crossVectors(measureDir, up).normalize();
        const offset = ann.geometry2D.offset;

        const worldDimA = worldRefA.clone().addScaledVector(side, offset);
        const worldDimB = worldRefB_proj.clone().addScaledVector(side, offset);

        // ── Project all four points to screen pixels ───────────────────────────
        const sRefA = worldToCanvas(worldRefA, camera, w, h);
        const sRefB = worldToCanvas(worldRefB, camera, w, h);
        const sDimA = worldToCanvas(worldDimA, camera, w, h);
        const sDimB = worldToCanvas(worldDimB, camera, w, h);

        if (!sDimA.visible && !sDimB.visible) return;

        // ── Format the measurement label ──────────────────────────────────────
        let label     = formatDimension(
            rawDist,
            ann.parameters.unit ?? 'mm',
            ann.parameters.prefix,
            ann.parameters.suffix,
            ann.parameters.override
        );

        // ── §VII-2/VII-3: Constraint colour overlay and violation label ────────
        // §VII-2: locked (not violated) → blue tint #2244aa
        // §VII-3: violated → red #cc2222 + "≠ {constraintValue} mm" appended to label
        // green: satisfied (visual clarity; not explicitly in spec but kept)
        let effectiveStyle = style;
        if (this._constraintStore && ann.parameters.isLocked) {
            const constraint = this._constraintStore.getByAnnotationId(ann.id);
            if (constraint && constraint.lastResult === 'violated') {
                // §VII-3 — violated: red line/text + violation indicator in label
                effectiveStyle = {
                    ...style,
                    lineColor: CONSTRAINT_VIOLATED_COLOR,
                    textColor: CONSTRAINT_VIOLATED_COLOR,
                };
                const constraintMm = (constraint.valueMetres * 1000).toFixed(0);
                label = `${label} ≠ ${constraintMm} mm`;
            } else {
                // §VII-2 — locked (satisfied or unknown): blue tint
                effectiveStyle = {
                    ...style,
                    lineColor: constraint?.lastResult === 'satisfied'
                        ? CONSTRAINT_SATISFIED_COLOR
                        : CONSTRAINT_LOCKED_COLOR,
                    textColor: constraint?.lastResult === 'satisfied'
                        ? CONSTRAINT_SATISFIED_COLOR
                        : CONSTRAINT_LOCKED_COLOR,
                };
            }
        }

        // ── §ANN-WALL-SEL: Highlight dimensions that reference the selected wall ──
        // When a wall (or other element) is selected, any dimension that references it
        // gets a Revit-style cyan-violet glow so the user knows it is interactive.
        let isWallSelectionHighlight = false;
        if (this._selectedElementId) {
            const referencesSelected = ann.references.some(
                r => r.elementId === this._selectedElementId
            );
            if (referencesSelected) {
                isWallSelectionHighlight = true;
                // Draw a faint glow halo behind the dimension line first
                const midX = (sDimA.x + sDimB.x) * 0.5;
                const midY = (sDimA.y + sDimB.y) * 0.5;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(sDimA.x, sDimA.y);
                ctx.lineTo(sDimB.x, sDimB.y);
                ctx.strokeStyle = 'rgba(139,92,246,0.22)';
                ctx.lineWidth = 12;
                ctx.setLineDash([]);
                ctx.stroke();
                ctx.restore();
                // Override style to violet-tinted highlight
                effectiveStyle = {
                    ...effectiveStyle,
                    lineColor: '#7C3AED',
                    textColor: '#5B21B6',
                };
                void midX; void midY;
            }
        }

        // ── Delegate all drawing to WallDimensionRenderer ─────────────────────
        WallDimensionRenderer.draw(ctx, {
            refA:      sRefA,
            refB:      sRefB,
            dimA:      sDimA,
            dimB:      sDimB,
            label,
            style:     effectiveStyle,
            hasOffset: Math.abs(offset) > 0.001,
        });

        // §ANN-WALL-SEL: Draw an interactive cursor hint on highlighted dims
        if (isWallSelectionHighlight && (sDimA.visible || sDimB.visible)) {
            const midX = (sDimA.x + sDimB.x) * 0.5;
            const midY = (sDimA.y + sDimB.y) * 0.5 - 14;
            ctx.save();
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const hint = 'click to edit';
            const mw = ctx.measureText(hint).width + 8;
            ctx.fillStyle = 'rgba(139,92,246,0.85)';
            if (ctx.roundRect) {
                ctx.roundRect(midX - mw * 0.5, midY - 7, mw, 13, 4);
            } else {
                ctx.rect(midX - mw * 0.5, midY - 7, mw, 13);
            }
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(hint, midX, midY);
            ctx.restore();
        }

        // §ANN-SEL: record the rendered dim-line segment for click hit-testing
        if (sDimA.visible || sDimB.visible) {
            this._dimHitSegments.push({
                annId: ann.id,
                x1: sDimA.x, y1: sDimA.y,
                x2: sDimB.x, y2: sDimB.y,
            });
        }

        // ── §C3: Padlock icon badge on locked dimensions ───────────────────────
        // Renders a small padlock glyph at the midpoint of the dimension line so
        // the user can see at a glance which dimensions are constraint-locked.
        // The glyph colour matches the violation/satisfied state.
        if (ann.parameters.isLocked && (sDimA.visible || sDimB.visible)) {
            const midX = (sDimA.x + sDimB.x) * 0.5;
            const midY = (sDimA.y + sDimB.y) * 0.5;
            const constraint = this._constraintStore?.getByAnnotationId(ann.id);

            let lockColor = '#6b7280'; // grey = unknown / no record yet
            let lockGlyph = '\uD83D\uDD13'; // 🔓 open — unlocked/unknown
            if (constraint) {
                if (constraint.lastResult === 'violated') {
                    lockColor = CONSTRAINT_VIOLATED_COLOR;
                    lockGlyph = '\uD83D\uDD12'; // 🔒 locked-violated
                } else if (constraint.lastResult === 'satisfied') {
                    lockColor = CONSTRAINT_SATISFIED_COLOR;
                    lockGlyph = '\uD83D\uDD12'; // 🔒 locked-satisfied
                } else {
                    lockGlyph = '\uD83D\uDD12'; // 🔒 locked-unknown (pending eval)
                }
            }

            ctx.save();
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Slight background pill for readability
            const metrics = ctx.measureText(lockGlyph);
            const bw = metrics.width + 4;
            const bh = 13;
            ctx.fillStyle = 'rgba(255,255,255,0.82)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(midX - bw * 0.5, midY - bh * 0.5, bw, bh, 4);
            } else {
                ctx.rect(midX - bw * 0.5, midY - bh * 0.5, bw, bh);
            }
            ctx.fill();
            // Draw the padlock glyph
            ctx.fillStyle = lockColor;
            ctx.fillText(lockGlyph, midX, midY);
            ctx.restore();
        }
    }

    // ── §DIM-VI-3 — String dimension renderer ────────────────────────────────

    /**
     * Render a multi-segment (string) linear-dim annotation.
     *
     * All N references project to screen; per-segment labels are computed
     * pairwise.  §DIM-VI-4 EQ logic: when `showEQ` is true and all segments
     * differ by ≤ 1 mm, every label is replaced with "EQ".
     */
    private _renderStringDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const refs   = ann.references;
        if (refs.length < 2) return;

        // ── Resolve world positions for all refs ──────────────────────────────
        const worldRefs: THREE.Vector3[] = [];
        for (let i = 0; i < refs.length; i++) {
            const mp = refs[i]!.cachedPosition ?? ann.geometry2D.modelPoints?.[i];
            if (!mp) return;           // bail if any ref is unresolved
            worldRefs.push(new THREE.Vector3(mp.x, mp.y, mp.z));
        }

        // ── Compute offset direction from first → last ref ────────────────────
        const offset  = ann.geometry2D.offset;
        const worldDims: THREE.Vector3[] = worldRefs.map(r => r.clone());

        if (Math.abs(offset) > 0.001 && worldRefs.length >= 2) {
            const dir  = new THREE.Vector3().subVectors(worldRefs[worldRefs.length - 1]!, worldRefs[0]!);
            dir.y = 0;
            dir.normalize();
            const up   = new THREE.Vector3(0, 1, 0);
            const side = new THREE.Vector3().crossVectors(dir, up).normalize();
            if (side.lengthSq() > 0.001) {
                for (const wd of worldDims) wd.addScaledVector(side, offset);
            }
        }

        // ── Project all points to screen ──────────────────────────────────────
        const sRefs = worldRefs.map(r => worldToCanvas(r, camera, w, h));
        const sDims = worldDims.map(d => worldToCanvas(d, camera, w, h));

        if (!sDims.some(d => d.visible)) return;

        // ── Per-segment distances ──────────────────────────────────────────────
        const unit     = (ann.parameters.unit ?? 'mm') as string;
        const segDists = worldRefs.slice(1).map((r, i) => worldRefs[i]!.distanceTo(r));

        // ── §DIM-VI-4 EQ logic ────────────────────────────────────────────────
        const showEQ  = ann.parameters.showEQ === true;
        let useEQ = false;
        if (showEQ && segDists.length > 1) {
            const first = segDists[0]!;
            useEQ = segDists.every(d => Math.abs(d - first) <= 0.001);  // 1 mm tolerance
        }

        // Per-segment segment descriptors (optional override labels)
        const segs: LinearDimSegment[] = ann.parameters.segments ?? [];

        const labels: string[] = segDists.map((dist, i) => {
            // Explicit per-segment override wins
            const segOverride = segs[i]?.label;
            if (segOverride) return segOverride;
            // EQ mode wins if all segments equal
            if (useEQ) return 'EQ';
            // Default: formatted distance
            return formatDimension(dist, unit as any);
        });

        // ── §VII-2/VII-3: Constraint colour override (string dims) ───────────
        let effectiveStyle = style;
        if (this._constraintStore && ann.parameters.isLocked) {
            const constraint = this._constraintStore.getByAnnotationId(ann.id);
            if (constraint && constraint.lastResult === 'violated') {
                // §VII-3: violated → red
                effectiveStyle = { ...style, lineColor: CONSTRAINT_VIOLATED_COLOR, textColor: CONSTRAINT_VIOLATED_COLOR };
            } else {
                // §VII-2: locked (satisfied or unknown) → blue tint
                effectiveStyle = {
                    ...style,
                    lineColor: constraint?.lastResult === 'satisfied'
                        ? CONSTRAINT_SATISFIED_COLOR
                        : CONSTRAINT_LOCKED_COLOR,
                    textColor: constraint?.lastResult === 'satisfied'
                        ? CONSTRAINT_SATISFIED_COLOR
                        : CONSTRAINT_LOCKED_COLOR,
                };
            }
        }

        // ── Delegate to WallDimensionRenderer.drawString() ───────────────────
        WallDimensionRenderer.drawString(ctx, {
            refs:      sRefs,
            dims:      sDims,
            labels,
            style:     effectiveStyle,
            hasOffset: Math.abs(offset) > 0.001,
        });

        // §ANN-SEL: record the overall dim-line span (first → last dim point) for
        // click hit-testing. This covers the full string chain as a single segment.
        const firstDim = sDims[0];
        const lastDim  = sDims[sDims.length - 1];
        if (firstDim && lastDim && (firstDim.visible || lastDim.visible)) {
            this._dimHitSegments.push({
                annId: ann.id,
                x1: firstDim.x, y1: firstDim.y,
                x2: lastDim.x,  y2: lastDim.y,
            });
        }
    }

    // ── Text note ─────────────────────────────────────────────────────────────

    private _renderTextNote(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const text = (ann.parameters.text as string) ?? '';
        if (!text) return;

        let screenX: number;
        let screenY: number;

        if (ann.geometry2D.screenOverride) {
            screenX = ann.geometry2D.screenOverride.x;
            screenY = ann.geometry2D.screenOverride.y;
        } else if (ann.references[0]?.cachedPosition) {
            const p = ann.references[0].cachedPosition;
            const sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
            if (!sp.visible) return;
            screenX = sp.x;
            screenY = sp.y;
        } else {
            return;
        }

        const textSizePx = mmToPx(style.textSizeMm);
        const bold   = ann.parameters.bold   ? 'bold '   : '';
        const italic = ann.parameters.italic ? 'italic ' : '';

        ctx.save();
        ctx.font         = `${bold}${italic}${textSizePx}px ${style.fontFamily}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'top';

        const lines   = text.split('\n');
        const lineH   = textSizePx * 1.4;
        const maxW    = Math.max(...lines.map(l => ctx.measureText(l).width));
        const pad     = 5;
        const boxH    = lines.length * lineH + pad * 2;

        // Background
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.roundRect?.(screenX, screenY - pad, maxW + pad * 2, boxH, 4) ??
            ctx.rect(screenX, screenY - pad, maxW + pad * 2, boxH);
        ctx.fill();
        ctx.stroke();

        // Text lines
        ctx.fillStyle = style.textColor;
        lines.forEach((line, i) => {
            ctx.fillText(line, screenX + pad, screenY + i * lineH);
        });

        ctx.restore();
    }

    // ── Element tag ───────────────────────────────────────────────────────────

    private _renderTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const label  = (ann.parameters.cachedLabel as string) ?? '';

        let screenX: number;
        let screenY: number;

        if (ann.geometry2D.screenOverride) {
            screenX = ann.geometry2D.screenOverride.x;
            screenY = ann.geometry2D.screenOverride.y;
        } else if (ann.references[0]?.cachedPosition) {
            const p = ann.references[0].cachedPosition;
            const sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
            if (!sp.visible) return;
            screenX = sp.x;
            screenY = sp.y;
        } else {
            return;
        }

        const textSizePx = mmToPx(style.textSizeMm);
        const pad        = 4;

        ctx.save();
        ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(label);
        const boxW    = metrics.width + pad * 3;
        const boxH    = textSizePx + pad * 2;

        // Leader line from element to tag position
        if (ann.parameters.showLeader && ann.references[0]?.cachedPosition) {
            const origin = ann.references[0].cachedPosition;
            const sp = worldToCanvas(new THREE.Vector3(origin.x, origin.y, origin.z), camera, w, h);
            if (sp.visible) {
                ctx.strokeStyle = style.lineColor;
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(screenX, screenY);
                ctx.stroke();
                // Leader dot at element point
                ctx.fillStyle = style.lineColor;
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Tag bubble
        ctx.fillStyle   = '#fff';
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect?.(screenX - boxW * 0.5, screenY - boxH * 0.5, boxW, boxH, 3) ??
            ctx.rect(screenX - boxW * 0.5, screenY - boxH * 0.5, boxW, boxH);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = style.textColor;
        ctx.fillText(label, screenX, screenY);

        ctx.restore();
    }

    // ── Detail line ───────────────────────────────────────────────────────────

    private _renderDetailLine(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const pts = ann.references
            .filter(r => r.cachedPosition)
            .map(r => worldToCanvas(
                new THREE.Vector3(r.cachedPosition!.x, r.cachedPosition!.y, r.cachedPosition!.z),
                camera, w, h
            ))
            .filter(p => p.visible);

        if (pts.length < 2) return;

        ctx.save();
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = Math.max(0.5, mmToPx(style.lineWeight));
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
        ctx.stroke();
        ctx.restore();
    }

    // ── Spot elevation ────────────────────────────────────────────────────────

    private _renderSpotElevation(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const ref = ann.references[0];
        if (!ref?.cachedPosition) return;

        const sp = worldToCanvas(
            new THREE.Vector3(ref.cachedPosition.x, ref.cachedPosition.y, ref.cachedPosition.z),
            camera, w, h
        );
        if (!sp.visible) return;

        const unit     = (ann.parameters.unit ?? 'm') as string;
        const elevation = ref.cachedPosition.y;
        const elText   = unit === 'mm'
            ? `${(elevation * 1000).toFixed(0)} mm`
            : `${elevation.toFixed(3)} m`;

        const textSizePx = mmToPx(style.textSizeMm);
        const pad = 4;

        ctx.save();
        ctx.font = `${textSizePx}px ${style.fontFamily}`;
        const metrics = ctx.measureText(elText);

        // Diamond marker
        ctx.strokeStyle = style.lineColor;
        ctx.fillStyle   = '#fff';
        ctx.lineWidth   = 1;
        const d = 5;
        ctx.beginPath();
        ctx.moveTo(sp.x,     sp.y - d);
        ctx.lineTo(sp.x + d, sp.y    );
        ctx.lineTo(sp.x,     sp.y + d);
        ctx.lineTo(sp.x - d, sp.y    );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Leader line
        ctx.beginPath();
        ctx.moveTo(sp.x + d, sp.y);
        ctx.lineTo(sp.x + d + 20, sp.y);
        ctx.stroke();

        // Label
        ctx.fillStyle   = 'rgba(255,255,255,0.9)';
        ctx.fillRect(sp.x + d + 20, sp.y - textSizePx * 0.5 - pad, metrics.width + pad * 2, textSizePx + pad * 2);
        ctx.fillStyle   = style.textColor;
        ctx.textAlign   = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(elText, sp.x + d + 20 + pad, sp.y);

        ctx.restore();
    }

    // ── §ANN-B2 Angular dimension ──────────────────────────────────────────────

    private _renderAngularDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;

        // modelPoints[0] = vertex, [1] = endA, [2] = endB
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 3) return;

        const sVertex = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        const sA      = worldToCanvas(new THREE.Vector3(pts[1]!.x, pts[1]!.y, pts[1]!.z), camera, w, h);
        const sB      = worldToCanvas(new THREE.Vector3(pts[2]!.x, pts[2]!.y, pts[2]!.z), camera, w, h);

        if (!sVertex.visible) return;

        const lw          = Math.max(0.5, mmToPx(style.lineWeight));
        const arrowSizePx = mmToPx(style.arrowSizeMm);
        const textSizePx  = mmToPx(style.textSizeMm);

        ctx.save();
        ctx.strokeStyle = style.lineColor;
        ctx.fillStyle   = style.lineColor;
        ctx.lineWidth   = lw;

        // Ray lines from vertex to A and vertex to B
        ctx.beginPath();
        ctx.moveTo(sVertex.x, sVertex.y);
        ctx.lineTo(sA.x, sA.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sVertex.x, sVertex.y);
        ctx.lineTo(sB.x, sB.y);
        ctx.stroke();

        // Arc between the two rays at a fixed screen radius
        const arcRadius = Math.min(
            40,
            Math.hypot(sA.x - sVertex.x, sA.y - sVertex.y) * 0.5,
            Math.hypot(sB.x - sVertex.x, sB.y - sVertex.y) * 0.5
        );

        const angleA = Math.atan2(sA.y - sVertex.y, sA.x - sVertex.x);
        const angleB = Math.atan2(sB.y - sVertex.y, sB.x - sVertex.x);

        // Determine the shorter arc
        let startAngle = angleA;
        let endAngle   = angleB;
        let diff = endAngle - startAngle;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        while (diff >  Math.PI) diff -= 2 * Math.PI;
        const counterClockwise = diff < 0;

        ctx.beginPath();
        ctx.arc(sVertex.x, sVertex.y, arcRadius, startAngle, endAngle, counterClockwise);
        ctx.stroke();

        // Arrow head at end of arc (at angleB point on the arc)
        const arrowTip = {
            x: sVertex.x + arcRadius * Math.cos(endAngle),
            y: sVertex.y + arcRadius * Math.sin(endAngle),
        };
        const tangentDir = counterClockwise
            ? { x: -Math.sin(endAngle), y:  Math.cos(endAngle) }
            : { x:  Math.sin(endAngle), y: -Math.cos(endAngle) };
        drawArrow(ctx, arrowTip, tangentDir, arrowSizePx, style.arrowStyle);

        // Angle label at midpoint of arc
        const midAngle = startAngle + (counterClockwise ? -1 : 1) * Math.abs(diff) * 0.5;
        const labelRadius = arcRadius + 14;
        const lx = sVertex.x + labelRadius * Math.cos(midAngle);
        const ly = sVertex.y + labelRadius * Math.sin(midAngle);

        const angleDeg  = ann.parameters.angleValue as number ?? 0;
        const labelText = `${angleDeg.toFixed(1)}°`;

        ctx.font = `${textSizePx}px ${style.fontFamily}`;
        const tm  = ctx.measureText(labelText);
        const pad = 3;

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(lx - tm.width * 0.5 - pad, ly - textSizePx * 0.5 - pad, tm.width + pad * 2, textSizePx + pad * 2);
        ctx.fillStyle    = style.textColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, lx, ly);

        ctx.restore();
    }

    // ── §ANN-B6 Keynote ───────────────────────────────────────────────────────

    private _renderKeynote(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const keynoteKey  = (ann.parameters.keynoteKey  as string) ?? '?';
        const keynoteText = (ann.parameters.keynoteText as string) ?? '';

        let screenX: number;
        let screenY: number;

        if (ann.geometry2D.screenOverride) {
            screenX = ann.geometry2D.screenOverride.x;
            screenY = ann.geometry2D.screenOverride.y;
        } else if (ann.references[0]?.cachedPosition) {
            const p  = ann.references[0].cachedPosition;
            const sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
            if (!sp.visible) return;
            screenX = sp.x;
            screenY = sp.y;
        } else {
            return;
        }

        const textSizePx     = mmToPx(style.textSizeMm);
        const keyFontSizePx  = textSizePx * 0.9;
        const bubbleRadius   = Math.max(12, keyFontSizePx * 1.2);

        ctx.save();

        // Leader line to element world position
        if (ann.parameters.showLeader && ann.references[0]?.cachedPosition) {
            const origin = ann.references[0].cachedPosition;
            const sp     = worldToCanvas(new THREE.Vector3(origin.x, origin.y, origin.z), camera, w, h);
            if (sp.visible) {
                ctx.strokeStyle = style.lineColor;
                ctx.lineWidth   = 0.8;
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(screenX, screenY);
                ctx.stroke();
                ctx.fillStyle = style.lineColor;
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Hexagonal keynote bubble (approximated as a circle with a dark fill)
        ctx.fillStyle   = '#1a2035';
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        // Draw hexagon
        for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6;
            const px = screenX + bubbleRadius * Math.cos(a);
            const py = screenY + bubbleRadius * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Keynote key text (white inside the bubble)
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `bold ${keyFontSizePx}px ${style.fontFamily}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(keynoteKey.length > 6 ? keynoteKey.slice(0, 6) : keynoteKey, screenX, screenY);

        // Description text to the right (if present)
        if (keynoteText) {
            const descX   = screenX + bubbleRadius + 6;
            const descY   = screenY;
            const descFont = `${textSizePx * 0.85}px ${style.fontFamily}`;
            ctx.font = descFont;
            const tm  = ctx.measureText(keynoteText);
            const pad = 3;

            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillRect(descX - pad, descY - textSizePx * 0.5 - pad, tm.width + pad * 2, textSizePx + pad * 2);

            ctx.fillStyle    = style.textColor;
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(keynoteText, descX, descY);
        }

        ctx.restore();
    }

    // ── DOC-2.4 Radius dimension ───────────────────────────────────────────────

    private _renderRadiusDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sCenter = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        const sArc    = worldToCanvas(new THREE.Vector3(pts[1]!.x, pts[1]!.y, pts[1]!.z), camera, w, h);
        if (!sCenter.visible && !sArc.visible) return;

        const lw          = Math.max(0.5, mmToPx(style.lineWeight));
        const arrowSizePx = mmToPx(style.arrowSizeMm);
        const textSizePx  = mmToPx(style.textSizeMm);

        const radiusMetres = typeof ann.parameters.radiusMetres === 'number' ? ann.parameters.radiusMetres : 0;
        const unit = (ann.parameters.unit as string) ?? 'mm';
        const label = unit === 'm'
            ? `R ${radiusMetres.toFixed(3)} m`
            : `R ${(radiusMetres * 1000).toFixed(0)} mm`;

        ctx.save();
        ctx.strokeStyle = style.lineColor;
        ctx.fillStyle   = style.lineColor;
        ctx.lineWidth   = lw;

        ctx.beginPath();
        ctx.moveTo(sCenter.x, sCenter.y);
        ctx.lineTo(sArc.x, sArc.y);
        ctx.stroke();

        const dx = sArc.x - sCenter.x;
        const dy = sArc.y - sCenter.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        ctx.beginPath();
        ctx.moveTo(sArc.x, sArc.y);
        ctx.lineTo(
            sArc.x - ux * arrowSizePx - uy * arrowSizePx * 0.4,
            sArc.y - uy * arrowSizePx + ux * arrowSizePx * 0.4
        );
        ctx.lineTo(
            sArc.x - ux * arrowSizePx + uy * arrowSizePx * 0.4,
            sArc.y - uy * arrowSizePx - ux * arrowSizePx * 0.4
        );
        ctx.closePath();
        ctx.fill();

        const midX = (sCenter.x + sArc.x) * 0.5 - uy * 14;
        const midY = (sCenter.y + sArc.y) * 0.5 + ux * 14;

        ctx.font      = `${textSizePx}px ${style.fontFamily}`;
        const tm      = ctx.measureText(label);
        const pad     = 3;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(midX - tm.width * 0.5 - pad, midY - textSizePx * 0.5 - pad, tm.width + pad * 2, textSizePx + pad * 2);
        ctx.fillStyle    = style.textColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);

        ctx.restore();
    }

    // ── DOC-2.4 Diameter dimension ─────────────────────────────────────────────

    private _renderDiameterDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sA = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        const sB = worldToCanvas(new THREE.Vector3(pts[1]!.x, pts[1]!.y, pts[1]!.z), camera, w, h);
        if (!sA.visible && !sB.visible) return;

        const lw          = Math.max(0.5, mmToPx(style.lineWeight));
        const arrowSizePx = mmToPx(style.arrowSizeMm);
        const textSizePx  = mmToPx(style.textSizeMm);

        const diamMetres = typeof ann.parameters.diameterMetres === 'number' ? ann.parameters.diameterMetres : 0;
        const unit = (ann.parameters.unit as string) ?? 'mm';
        const label = unit === 'm'
            ? `\u00D8 ${diamMetres.toFixed(3)} m`
            : `\u00D8 ${(diamMetres * 1000).toFixed(0)} mm`;

        ctx.save();
        ctx.strokeStyle = style.lineColor;
        ctx.fillStyle   = style.lineColor;
        ctx.lineWidth   = lw;

        ctx.beginPath();
        ctx.moveTo(sA.x, sA.y);
        ctx.lineTo(sB.x, sB.y);
        ctx.stroke();

        const dx = sB.x - sA.x;
        const dy = sB.y - sA.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        const _drawArrowHead = (tipX: number, tipY: number, dirX: number, dirY: number): void => {
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - dirX * arrowSizePx - dirY * arrowSizePx * 0.4, tipY - dirY * arrowSizePx + dirX * arrowSizePx * 0.4);
            ctx.lineTo(tipX - dirX * arrowSizePx + dirY * arrowSizePx * 0.4, tipY - dirY * arrowSizePx - dirX * arrowSizePx * 0.4);
            ctx.closePath();
            ctx.fill();
        };

        _drawArrowHead(sA.x, sA.y, -ux, -uy);
        _drawArrowHead(sB.x, sB.y,  ux,  uy);

        const midX = (sA.x + sB.x) * 0.5 - uy * 14;
        const midY = (sA.y + sB.y) * 0.5 + ux * 14;

        ctx.font      = `${textSizePx}px ${style.fontFamily}`;
        const tm      = ctx.measureText(label);
        const pad     = 3;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(midX - tm.width * 0.5 - pad, midY - textSizePx * 0.5 - pad, tm.width + pad * 2, textSizePx + pad * 2);
        ctx.fillStyle    = style.textColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);

        ctx.restore();
    }

    // ── DOC-2.5 Door tag ──────────────────────────────────────────────────────

    private _renderDoorTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        this._renderElementTag(ann, ctx, w, h, style, '#1a2035', '#ffffff');
    }

    // ── DOC-2.5 Window tag ────────────────────────────────────────────────────

    private _renderWindowTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        this._renderElementTag(ann, ctx, w, h, style, '#2c5282', '#ffffff');
    }

    /**
     * Shared renderer for door-tag and window-tag.
     * Renders a rounded rectangular tag with bold cachedLabel text + optional leader.
     */
    private _renderElementTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle,
        bgColor: string,
        textColor: string
    ): void {
        const camera = this._camera!;
        const label  = (ann.parameters.cachedLabel as string) ?? '';

        let screenX: number;
        let screenY: number;

        if (ann.geometry2D.screenOverride) {
            screenX = ann.geometry2D.screenOverride.x;
            screenY = ann.geometry2D.screenOverride.y;
        } else if (ann.geometry2D.modelPoints?.[0]) {
            const p  = ann.geometry2D.modelPoints[0];
            const sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
            if (!sp.visible) return;
            screenX = sp.x + 18;
            screenY = sp.y - 18;
        } else if (ann.references[0]?.cachedPosition) {
            const p  = ann.references[0].cachedPosition;
            const sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
            if (!sp.visible) return;
            screenX = sp.x + 18;
            screenY = sp.y - 18;
        } else {
            return;
        }

        const textSizePx = mmToPx(style.textSizeMm);
        const pad        = 4;

        ctx.save();
        ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(label);
        const boxW    = metrics.width + pad * 3;
        const boxH    = textSizePx + pad * 2;

        // Leader line from element reference to tag box
        if (ann.references[0]?.cachedPosition) {
            const p  = ann.references[0].cachedPosition;
            const sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
            if (sp.visible) {
                ctx.strokeStyle = bgColor;
                ctx.lineWidth   = 1;
                ctx.beginPath();
                ctx.moveTo(sp.x, sp.y);
                ctx.lineTo(screenX, screenY);
                ctx.stroke();
                ctx.fillStyle = bgColor;
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Tag box
        ctx.fillStyle   = bgColor;
        ctx.strokeStyle = bgColor;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect?.(screenX - boxW * 0.5, screenY - boxH * 0.5, boxW, boxH, 3) ??
            ctx.rect(screenX - boxW * 0.5, screenY - boxH * 0.5, boxW, boxH);
        ctx.fill();

        ctx.fillStyle = textColor;
        ctx.fillText(label, screenX, screenY);

        ctx.restore();
    }

    // ── DOC-2.5 Level tag ─────────────────────────────────────────────────────

    /**
     * Renders a standard AEC level elevation marker.
     * Visual: inverted triangle (▽) with horizontal tick + elevation label.
     * Elevation sourced from ann.parameters.elevationM (set at tool placement time).
     */
    private _renderLevelTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const pts = ann.geometry2D.modelPoints;
        let sp: { x: number; y: number; visible: boolean };

        if (ann.geometry2D.screenOverride) {
            sp = { x: ann.geometry2D.screenOverride.x, y: ann.geometry2D.screenOverride.y, visible: true };
        } else if (pts?.[0]) {
            sp = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        } else if (ann.references[0]?.cachedPosition) {
            const p = ann.references[0].cachedPosition;
            sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
        } else {
            return;
        }

        if (!sp.visible) return;

        const elevationM  = typeof ann.parameters.elevationM === 'number' ? ann.parameters.elevationM : 0;
        const levelName   = (ann.parameters.levelName as string) ?? '';
        const sign        = elevationM >= 0 ? '+' : '';
        const labelText   = `${levelName}  ${sign}${elevationM.toFixed(3)}m`;

        const textSizePx  = mmToPx(style.textSizeMm);
        const lw          = Math.max(0.5, mmToPx(style.lineWeight));
        const triangleH   = 10;
        const triangleHW  = 6;
        const tickLen     = 40;
        const pad         = 3;

        ctx.save();
        ctx.strokeStyle = style.lineColor;
        ctx.fillStyle   = style.lineColor;
        ctx.lineWidth   = lw;

        // Inverted triangle (▽) pointing downward at the placement point
        ctx.beginPath();
        ctx.moveTo(sp.x - triangleHW, sp.y - triangleH);
        ctx.lineTo(sp.x + triangleHW, sp.y - triangleH);
        ctx.lineTo(sp.x, sp.y);
        ctx.closePath();
        ctx.stroke();

        // Horizontal tick extending to the right from triangle top-right corner
        ctx.beginPath();
        ctx.moveTo(sp.x + triangleHW, sp.y - triangleH);
        ctx.lineTo(sp.x + triangleHW + tickLen, sp.y - triangleH);
        ctx.stroke();

        // Elevation label to the right of the tick
        ctx.font         = `${textSizePx}px ${style.fontFamily}`;
        const tm         = ctx.measureText(labelText);
        const labelX     = sp.x + triangleHW + 4;
        const labelY     = sp.y - triangleH - textSizePx * 0.5 - pad;

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(labelX - 2, labelY - pad, tm.width + 4, textSizePx + pad * 2);
        ctx.fillStyle    = style.textColor;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, labelX, sp.y - triangleH - textSizePx * 0.5);

        ctx.restore();
    }

    // ── DOC-2.5 Grid bubble ───────────────────────────────────────────────────

    /**
     * Renders a grid bubble: circle with alphanumeric label centred inside.
     * Appears at the endpoint of a grid line.
     */
    private _renderGridBubble(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const pts = ann.geometry2D.modelPoints;
        let sp: { x: number; y: number; visible: boolean };

        if (ann.geometry2D.screenOverride) {
            sp = { x: ann.geometry2D.screenOverride.x, y: ann.geometry2D.screenOverride.y, visible: true };
        } else if (pts?.[0]) {
            sp = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        } else if (ann.references[0]?.cachedPosition) {
            const p = ann.references[0].cachedPosition;
            sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
        } else {
            return;
        }

        if (!sp.visible) return;

        const label      = (ann.parameters.cachedLabel as string) ?? (ann.parameters.gridName as string) ?? '?';
        const textSizePx = mmToPx(style.textSizeMm);
        const bubbleR    = Math.max(10, textSizePx * 0.9);
        const lw         = Math.max(0.5, mmToPx(style.lineWeight));

        ctx.save();

        // Circle
        ctx.strokeStyle = style.lineColor;
        ctx.fillStyle   = '#ffffff';
        ctx.lineWidth   = lw;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, bubbleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Label inside
        const shortLabel = label.length > 4 ? label.slice(0, 4) : label;
        ctx.fillStyle    = style.textColor;
        ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shortLabel, sp.x, sp.y);

        ctx.restore();
    }

    // ── DOC-2.4 Slope dimension ────────────────────────────────────────────────

    private _renderSlopeDim(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const sA = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        const sB = worldToCanvas(new THREE.Vector3(pts[1]!.x, pts[1]!.y, pts[1]!.z), camera, w, h);
        if (!sA.visible && !sB.visible) return;

        const lw         = Math.max(0.5, mmToPx(style.lineWeight));
        const textSizePx = mmToPx(style.textSizeMm);

        const slopePercent = typeof ann.parameters.slopePercent === 'number' ? ann.parameters.slopePercent : 0;
        const slopeRatio   = typeof ann.parameters.slopeRatio   === 'number' ? ann.parameters.slopeRatio   : 0;
        const label = slopePercent !== 0
            ? `${slopePercent.toFixed(1)}%`
            : slopeRatio !== 0
                ? `1:${(1 / slopeRatio).toFixed(1)}`
                : '0%';

        ctx.save();
        ctx.strokeStyle = style.lineColor;
        ctx.fillStyle   = style.lineColor;
        ctx.lineWidth   = lw;

        ctx.beginPath();
        ctx.moveTo(sA.x, sA.y);
        ctx.lineTo(sB.x, sB.y);
        ctx.stroke();

        const dx = sB.x - sA.x;
        const dy = sB.y - sA.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        const arrowSizePx = mmToPx(style.arrowSizeMm);
        ctx.beginPath();
        ctx.moveTo(sB.x, sB.y);
        ctx.lineTo(sB.x - ux * arrowSizePx - uy * arrowSizePx * 0.4, sB.y - uy * arrowSizePx + ux * arrowSizePx * 0.4);
        ctx.lineTo(sB.x - ux * arrowSizePx + uy * arrowSizePx * 0.4, sB.y - uy * arrowSizePx - ux * arrowSizePx * 0.4);
        ctx.closePath();
        ctx.fill();

        const runLen = Math.min(30, len * 0.4);
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = Math.max(0.5, lw * 0.7);
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sA.x, sA.y);
        ctx.lineTo(sA.x + runLen, sA.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sA.x + runLen, sA.y);
        ctx.lineTo(sA.x + runLen, sA.y - runLen * slopeRatio);
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = (sA.x + sB.x) * 0.5 - uy * 16;
        const midY = (sA.y + sB.y) * 0.5 + ux * 16;

        ctx.font      = `${textSizePx}px ${style.fontFamily}`;
        const tm      = ctx.measureText(label);
        const pad     = 3;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(midX - tm.width * 0.5 - pad, midY - textSizePx * 0.5 - pad, tm.width + pad * 2, textSizePx + pad * 2);
        ctx.fillStyle    = style.textColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);

        ctx.restore();
    }

    // ── DOC-2.7 — Section Mark ────────────────────────────────────────────────

    /**
     * Section mark renderer:
     *   - Heavy dashed cut line between cutPointA and cutPointB
     *   - Circle heads at both ends with sheet/detail number
     *   - Direction arrows on each head indicating which way the section looks
     */
    private _renderSectionMark(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const ptA = pts[0]!;
        const ptB = pts[1]!;
        const camera = this._camera;
        if (!camera) return;

        ctx.save();

        const projectPt = (p: { x: number; y: number; z: number }) => {
            const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
            return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
        };

        const sA = projectPt(ptA);
        const sB = projectPt(ptB);

        // Resolve sheet + detail from ViewLinkResolver
        const linkedViewId = ann.parameters.linkedViewId as string | undefined;
        const linkInfo = linkedViewId ? viewLinkResolver.resolve(linkedViewId) : null;
        const detailNo = linkInfo?.detailNumber ?? '—';
        const sheetNo  = linkInfo?.sheetNumber  ?? '—';
        const labelTop = detailNo;
        const labelBot = sheetNo;

        const lineW = Math.max(2, style.lineWeight * 3);
        const r     = 16; // bubble radius in screen pixels
        const textSizePx = Math.max(9, (style.textSizeMm / 25.4) * 96 * 0.6);

        // ── Cut line (heavy dashed) ────────────────────────────────────────────
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = lineW;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(sA.x, sA.y);
        ctx.lineTo(sB.x, sB.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // ── Helper: draw head bubble at a screen point ─────────────────────────
        const drawHead = (sx: number, sy: number) => {
            // White fill circle
            ctx.fillStyle = 'white';
            ctx.strokeStyle = style.lineColor;
            ctx.lineWidth = lineW;
            ctx.beginPath();
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Divider line (horizontal through centre)
            ctx.beginPath();
            ctx.moveTo(sx - r, sy);
            ctx.lineTo(sx + r, sy);
            ctx.stroke();

            // Detail number (top half)
            ctx.fillStyle   = style.textColor;
            ctx.font        = `bold ${textSizePx}px ${style.fontFamily}`;
            ctx.textAlign   = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelTop, sx, sy - r * 0.35);

            // Sheet number (bottom half)
            ctx.font = `${textSizePx * 0.85}px ${style.fontFamily}`;
            ctx.fillText(labelBot, sx, sy + r * 0.45);
        };

        // ── Direction arrow at each end ────────────────────────────────────────
        // Arrow direction is the tail direction from parameters
        const td = ann.parameters.tailDirection as { x: number; z: number } | undefined;
        let arrowDx = sB.x - sA.x;
        let arrowDy = sB.y - sA.y;
        const arrowLen = Math.sqrt(arrowDx * arrowDx + arrowDy * arrowDy) || 1;
        arrowDx /= arrowLen;
        arrowDy /= arrowLen;

        // Place direction tick at each head
        const drawArrow = (sx: number, sy: number, dx: number, dy: number) => {
            const tipX = sx + dx * (r + 8);
            const tipY = sy + dy * (r + 8);
            const baseX = sx + dx * r;
            const baseY = sy + dy * r;
            ctx.strokeStyle = style.lineColor;
            ctx.lineWidth = lineW;
            ctx.beginPath();
            ctx.moveTo(baseX, baseY);
            ctx.lineTo(tipX, tipY);
            // small arrowhead
            const perpX = -dy * 4, perpY = dx * 4;
            ctx.lineTo(tipX - dx * 6 + perpX, tipY - dy * 6 + perpY);
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(tipX - dx * 6 - perpX, tipY - dy * 6 - perpY);
            ctx.stroke();
        };

        void td; // stored in params for future use
        drawHead(sA.x, sA.y);
        drawHead(sB.x, sB.y);
        drawArrow(sA.x, sA.y, -arrowDx, -arrowDy);
        drawArrow(sB.x, sB.y, arrowDx, arrowDy);

        ctx.restore();
    }

    // ── DOC-2.7 — Elevation Mark ──────────────────────────────────────────────

    /**
     * Elevation mark renderer:
     *   - Circle with sheet/detail number divided by horizontal line
     *   - Direction arrow inside circle pointing toward the elevation face
     */
    private _renderElevationMark(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 1) return;

        const camera = this._camera;
        if (!camera) return;

        ctx.save();

        const v = new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z).project(camera);
        const sx = (v.x * 0.5 + 0.5) * w;
        const sy = (-v.y * 0.5 + 0.5) * h;

        // Resolve sheet + detail
        const linkedViewId = ann.parameters.linkedViewId as string | undefined;
        const linkInfo = linkedViewId ? viewLinkResolver.resolve(linkedViewId) : null;
        const detailNo = linkInfo?.detailNumber ?? '—';
        const sheetNo  = linkInfo?.sheetNumber  ?? '—';

        const r          = 18;
        const lineW      = Math.max(2, style.lineWeight * 3);
        const textSizePx = Math.max(9, (style.textSizeMm / 25.4) * 96 * 0.6);

        // ── Outer circle ──────────────────────────────────────────────────────
        ctx.fillStyle   = 'white';
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = lineW;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // ── Horizontal divider ────────────────────────────────────────────────
        ctx.beginPath();
        ctx.moveTo(sx - r, sy);
        ctx.lineTo(sx + r, sy);
        ctx.stroke();

        // ── Labels ────────────────────────────────────────────────────────────
        ctx.fillStyle    = style.textColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
        ctx.fillText(detailNo, sx, sy - r * 0.35);
        ctx.font = `${textSizePx * 0.85}px ${style.fontFamily}`;
        ctx.fillText(sheetNo, sx, sy + r * 0.45);

        // ── Direction arrow (facing direction in screen space) ─────────────────
        const fd = ann.parameters.facingDirection as { x: number; z: number } | undefined;
        if (fd) {
            // fd is XZ world; map to screen: x→screen-x, z→screen-y (inverted)
            const fLen = Math.sqrt(fd.x * fd.x + fd.z * fd.z) || 1;
            const fdx = fd.x / fLen;
            const fdy = -fd.z / fLen;

            const arrowStartX = sx + fdx * r;
            const arrowStartY = sy + fdy * r;
            const arrowTipX   = sx + fdx * (r + 10);
            const arrowTipY   = sy + fdy * (r + 10);

            ctx.strokeStyle = style.lineColor;
            ctx.lineWidth   = lineW;
            ctx.beginPath();
            ctx.moveTo(arrowStartX, arrowStartY);
            ctx.lineTo(arrowTipX, arrowTipY);
            const perpX = -fdy * 4, perpY = fdx * 4;
            ctx.lineTo(arrowTipX - fdx * 6 + perpX, arrowTipY - fdy * 6 + perpY);
            ctx.moveTo(arrowTipX, arrowTipY);
            ctx.lineTo(arrowTipX - fdx * 6 - perpX, arrowTipY - fdy * 6 - perpY);
            ctx.stroke();
        }

        ctx.restore();
    }

    // ── DOC-2.8 — Callout Detail ──────────────────────────────────────────────

    /**
     * Callout detail renderer:
     *   - Dashed rectangular crop region
     *   - Leader elbow line to a small label bubble with detail + sheet ref
     *   - "D" label in bubble (matching Revit's callout head style)
     */
    private _renderCalloutDetail(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 2) return;

        const camera = this._camera;
        if (!camera) return;

        ctx.save();

        const toScreen = (p: { x: number; y: number; z: number }) => {
            const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
            return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
        };

        const cropPts  = ann.parameters.cropPoints as { x: number; y: number; z: number }[];
        if (!cropPts || cropPts.length < 2) { ctx.restore(); return; }

        // Screen-space bounding box from crop points
        const screenCropPts = cropPts.map(toScreen);
        const minX = Math.min(...screenCropPts.map(p => p.x));
        const maxX = Math.max(...screenCropPts.map(p => p.x));
        const minY = Math.min(...screenCropPts.map(p => p.y));
        const maxY = Math.max(...screenCropPts.map(p => p.y));

        const lineW = Math.max(1.5, style.lineWeight * 2);

        // ── Dashed crop region rectangle ──────────────────────────────────────
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = lineW;
        ctx.setLineDash([6, 3]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);

        // ── Leader + bubble ───────────────────────────────────────────────────
        const bubbleX = maxX + 20;
        const bubbleY = minY + (maxY - minY) * 0.5;
        const r       = 14;
        const textSizePx = Math.max(8, (style.textSizeMm / 25.4) * 96 * 0.55);

        // Resolve sheet + detail ref
        const linkedViewId = ann.parameters.linkedViewId as string | undefined;
        const linkInfo = linkedViewId ? viewLinkResolver.resolve(linkedViewId) : null;
        const detailNo = linkInfo?.detailNumber ?? 'D';
        const sheetNo  = linkInfo?.sheetNumber  ?? '—';

        // Leader line
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = lineW;
        ctx.beginPath();
        ctx.moveTo(maxX, bubbleY);
        ctx.lineTo(bubbleX - r, bubbleY);
        ctx.stroke();

        // Bubble
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(bubbleX, bubbleY, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = style.lineColor;
        ctx.stroke();

        // Horizontal divider
        ctx.beginPath();
        ctx.moveTo(bubbleX - r, bubbleY);
        ctx.lineTo(bubbleX + r, bubbleY);
        ctx.stroke();

        // Detail number (top)
        ctx.fillStyle    = style.textColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
        ctx.fillText(detailNo, bubbleX, bubbleY - r * 0.35);

        // Sheet number (bottom)
        ctx.font = `${textSizePx * 0.85}px ${style.fontFamily}`;
        ctx.fillText(sheetNo, bubbleX, bubbleY + r * 0.45);

        ctx.restore();
    }

    // ── DOC-2.8 — Revision Cloud ──────────────────────────────────────────────

    /**
     * Revision cloud renderer:
     *   - Polygon of outward-bulging arc segments (standard AEC revision cloud)
     *   - Arcs drawn between consecutive vertex pairs; cloud is always closed
     *   - Optional revision code label at polygon centroid
     */
    private _renderRevisionCloud(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const pts = ann.geometry2D.modelPoints;
        if (!pts || pts.length < 3) return;

        const camera = this._camera;
        if (!camera) return;

        ctx.save();

        const toScreen = (p: { x: number; y: number; z: number }) => {
            const v = new THREE.Vector3(p.x, p.y, p.z).project(camera);
            return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
        };

        const screenPts = pts.map(toScreen);
        const lineW     = Math.max(1.5, style.lineWeight * 2);
        const textSizePx = Math.max(8, (style.textSizeMm / 25.4) * 96 * 0.6);

        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = lineW;
        ctx.beginPath();

        // Draw arc segments between each pair of consecutive vertices (closed polygon)
        const n = screenPts.length;
        for (let i = 0; i < n; i++) {
            const a = screenPts[i]!;
            const b = screenPts[(i + 1) % n]!;

            const mx = (a.x + b.x) * 0.5;
            const my = (a.y + b.y) * 0.5;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;

            // Arc radius = half the segment length
            const r = len * 0.5;

            // Outward normal (left-perpendicular)
            const nx = -dy / len;
            const ny =  dx / len;

            // Centre of the arc sits at the segment midpoint + a small outward push
            const push  = r * 0.35;
            const cx    = mx + nx * push;
            const cy    = my + ny * push;

            // Arc from a to b curving outward
            const startAngle = Math.atan2(a.y - cy, a.x - cx);
            const endAngle   = Math.atan2(b.y - cy, b.x - cx);

            // Determine direction: the arc should bulge outward (counterclockwise in canvas coords)
            ctx.arc(cx, cy, r, startAngle, endAngle, false);
        }

        ctx.closePath();
        ctx.stroke();

        // ── Revision code label at centroid ───────────────────────────────────
        const revCode = ann.parameters.revisionCode as string | undefined;
        if (revCode) {
            const cx = screenPts.reduce((s, p) => s + p.x, 0) / n;
            const cy = screenPts.reduce((s, p) => s + p.y, 0) / n;

            const tm  = ctx.measureText(revCode);
            const pad = 3;
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(cx - tm.width * 0.5 - pad, cy - textSizePx * 0.5 - pad, tm.width + pad * 2, textSizePx + pad * 2);
            ctx.fillStyle    = style.textColor;
            ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(revCode, cx, cy);
        }

        ctx.restore();
    }

    // ── DOC-2.5b Room tag ─────────────────────────────────────────────────────

    /**
     * Renders an architectural room tag at the room's centroid.
     *
     * Layout (centred on the projected centroid):
     *   ┌──────────────────────┐
     *   │  ROOM NAME           │  ← bold, normal text size
     *   │  101  •  23.5 m²    │  ← room number + area, smaller
     *   └──────────────────────┘
     *
     * Uses a semi-transparent white background with a thin border so the tag
     * is legible over plan fills and hatch patterns.
     */
    // @ts-ignore — reserved for future room-tag rendering; kept for upcoming phase
    private _renderRoomTag(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle
    ): void {
        const camera = this._camera!;

        // Resolve screen position — centroid stored in modelPoints[0]
        let screenX: number;
        let screenY: number;

        if (ann.geometry2D.screenOverride) {
            screenX = ann.geometry2D.screenOverride.x;
            screenY = ann.geometry2D.screenOverride.y;
        } else if (ann.geometry2D.modelPoints?.[0]) {
            const p  = ann.geometry2D.modelPoints[0];
            const sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
            if (!sp.visible) return;
            screenX = sp.x;
            screenY = sp.y;
        } else if (ann.references[0]?.cachedPosition) {
            const p  = ann.references[0].cachedPosition;
            const sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
            if (!sp.visible) return;
            screenX = sp.x;
            screenY = sp.y;
        } else {
            return;
        }

        const roomName   = (ann.parameters.roomName   as string) ?? '';
        const roomNumber = (ann.parameters.roomNumber as string) ?? '';
        const area       = typeof ann.parameters.area === 'number' ? ann.parameters.area : 0;
        const areaLabel  = `${area.toFixed(1)} m²`;

        // Build sub-label: "101 • 23.5 m²" (omit number if empty)
        const subLabel = roomNumber
            ? `${roomNumber}  •  ${areaLabel}`
            : areaLabel;

        const nameSizePx = mmToPx(style.textSizeMm);
        const subSizePx  = Math.max(8, nameSizePx * 0.78);
        const pad        = 6;
        const lineGap    = 3;

        ctx.save();

        // Measure widths to determine box size
        ctx.font = `bold ${nameSizePx}px ${style.fontFamily}`;
        const nameW = roomName ? ctx.measureText(roomName).width : 0;

        ctx.font = `${subSizePx}px ${style.fontFamily}`;
        const subW  = ctx.measureText(subLabel).width;

        const hasName = roomName.length > 0;
        const contentW = Math.max(nameW, subW);
        const contentH = hasName
            ? nameSizePx + lineGap + subSizePx
            : subSizePx;

        const boxW = contentW + pad * 2;
        const boxH = contentH + pad * 2;
        const boxX = screenX - boxW * 0.5;
        const boxY = screenY - boxH * 0.5;

        // Background — semi-transparent white
        ctx.fillStyle   = 'rgba(255,255,255,0.82)';
        ctx.strokeStyle = style.lineColor;
        ctx.lineWidth   = Math.max(0.5, mmToPx(style.lineWeight));

        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(boxX, boxY, boxW, boxH, 3);
        } else {
            ctx.rect(boxX, boxY, boxW, boxH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';

        if (hasName) {
            // Line 1 — room name (bold)
            ctx.font      = `bold ${nameSizePx}px ${style.fontFamily}`;
            ctx.fillStyle = style.textColor;
            ctx.fillText(roomName, screenX, boxY + pad + nameSizePx);

            // Line 2 — number + area (normal weight, slightly smaller)
            ctx.font      = `${subSizePx}px ${style.fontFamily}`;
            ctx.fillStyle = style.lineColor;
            ctx.fillText(subLabel, screenX, boxY + pad + nameSizePx + lineGap + subSizePx);
        } else {
            // No name — just show sub-label centred
            ctx.font      = `${subSizePx}px ${style.fontFamily}`;
            ctx.fillStyle = style.textColor;
            ctx.fillText(subLabel, screenX, boxY + pad + subSizePx);
        }

        ctx.restore();
    }

    // ── DOC-2.5f: Roof slope arrow label ──────────────────────────────────────

    /**
     * DOC-2.5f — Roof slope ratio label renderer.
     *
     * Renders the "rise:run" slope label (e.g. "1:4") at the screen projection
     * of the world-space centroid of the roof element. The slope arrow linework
     * is already in the TechnicalDrawing (vector overlay); this renderer only
     * draws the text label with a white background for legibility.
     */
    private _renderRoofSlopeArrow(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle,
    ): void {
        const camera = this._camera;
        if (!camera) return;

        const pts = ann.geometry2D.modelPoints;
        let sp: { x: number; y: number; visible: boolean };

        if (pts?.[0]) {
            sp = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        } else if (ann.references[0]?.cachedPosition) {
            const p = ann.references[0].cachedPosition;
            sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
        } else {
            return;
        }

        if (!sp.visible) return;

        const label      = (ann.parameters.slopeLabel as string) ?? '';
        const textSizePx = mmToPx(style.textSizeMm);
        const lw         = Math.max(0.5, mmToPx(style.lineWeight));

        ctx.save();

        ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // White background box for legibility over roof hatching.
        const tm   = ctx.measureText(label);
        const padX = 3;
        const padY = 2;
        const boxW = tm.width + padX * 2;
        const boxH = textSizePx + padY * 2;

        ctx.fillStyle    = 'rgba(255,255,255,0.88)';
        ctx.strokeStyle  = style.lineColor;
        ctx.lineWidth    = lw;
        ctx.fillRect(sp.x - boxW * 0.5, sp.y - boxH * 0.5, boxW, boxH);
        ctx.strokeRect(sp.x - boxW * 0.5, sp.y - boxH * 0.5, boxW, boxH);

        ctx.fillStyle    = style.textColor;
        ctx.fillText(label, sp.x, sp.y);

        ctx.restore();
    }

    // ── DOC-2.5e: Grid bubble in section/elevation ────────────────────────────

    /**
     * DOC-2.5e — Grid bubble renderer.
     *
     * Renders a circle with the alphanumeric grid label inside it at the screen
     * projection of the world-space top of the vertical grid line.
     *
     * Appearance matches standard AEC grid bubble convention:
     *   ○ circle (~10 px radius) with centred label (A, B, 1, 2, …)
     */
    private _renderSectionGridLine(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle,
    ): void {
        const camera = this._camera;
        if (!camera) return;

        const pts = ann.geometry2D.modelPoints;
        let sp: { x: number; y: number; visible: boolean };

        if (pts?.[0]) {
            sp = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        } else if (ann.references[0]?.cachedPosition) {
            const p = ann.references[0].cachedPosition;
            sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
        } else {
            return;
        }

        if (!sp.visible) return;

        const label      = (ann.parameters.gridLabel as string) ?? '';
        const bubbleR    = 10; // circle radius in px
        const lw         = Math.max(0.5, mmToPx(style.lineWeight));
        const textSizePx = Math.min(bubbleR * 1.2, mmToPx(style.textSizeMm));

        ctx.save();
        ctx.strokeStyle = style.lineColor;
        ctx.fillStyle   = 'rgba(255,255,255,0.92)';
        ctx.lineWidth   = lw;

        // White-filled circle bubble.
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, bubbleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Centred label inside the bubble.
        ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = style.textColor;
        ctx.fillText(label, sp.x, sp.y);

        ctx.restore();
    }

    // ── DOC-2.5d: Level datum line label ──────────────────────────────────────

    /**
     * DOC-2.5d — Level datum line label renderer.
     *
     * Renders an elevation label for a level datum line annotation.
     * The horizontal datum line itself is part of the TechnicalDrawing (vector overlay).
     * This renderer draws the elevation text label at the left end of the line.
     *
     * Visual: small filled diamond ◆ + elevation text (e.g. "+3.500")
     * Positioned at the screen projection of the world-space reference point.
     */
    private _renderLevelDatumLine(
        ann: AnnotationElement,
        ctx: CanvasRenderingContext2D,
        w: number,
        h: number,
        style: AnnotationStyle,
    ): void {
        const camera = this._camera;
        if (!camera) return;

        const pts = ann.geometry2D.modelPoints;
        let sp: { x: number; y: number; visible: boolean };

        if (pts?.[0]) {
            sp = worldToCanvas(new THREE.Vector3(pts[0]!.x, pts[0]!.y, pts[0]!.z), camera, w, h);
        } else if (ann.references[0]?.cachedPosition) {
            const p = ann.references[0].cachedPosition;
            sp = worldToCanvas(new THREE.Vector3(p.x, p.y, p.z), camera, w, h);
        } else {
            return;
        }

        if (!sp.visible) return;

        const label      = (ann.parameters.elevationLabel as string) ?? '±0.000';
        const textSizePx = mmToPx(style.textSizeMm);
        const lw         = Math.max(0.5, mmToPx(style.lineWeight));
        const diamondR   = 5; // half-size of datum diamond marker in px
        const gap        = 4; // px between diamond and text

        ctx.save();
        ctx.strokeStyle  = style.lineColor;
        ctx.fillStyle    = style.lineColor;
        ctx.lineWidth    = lw;

        // Small diamond ◆ marker at the datum line left end.
        ctx.beginPath();
        ctx.moveTo(sp.x,            sp.y - diamondR);
        ctx.lineTo(sp.x + diamondR, sp.y);
        ctx.lineTo(sp.x,            sp.y + diamondR);
        ctx.lineTo(sp.x - diamondR, sp.y);
        ctx.closePath();
        ctx.fill();

        // Elevation label to the right of the diamond.
        ctx.font         = `bold ${textSizePx}px ${style.fontFamily}`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = style.textColor;

        // White background box for legibility over linework.
        const tm     = ctx.measureText(label);
        const padX   = 2;
        const padY   = 1;
        const boxX   = sp.x + diamondR + gap - padX;
        const boxY   = sp.y - textSizePx * 0.5 - padY;
        const boxW   = tm.width + padX * 2;
        const boxH   = textSizePx + padY * 2;

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(boxX, boxY, boxW, boxH);

        ctx.fillStyle = style.textColor;
        ctx.fillText(label, sp.x + diamondR + gap, sp.y);

        ctx.restore();
    }
}
