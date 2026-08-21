/**
 * ViewportPreviewRenderer — Phase SC-1 (Next-Gen Sheet Composition Engine)
 * packages/core-app-model/src/presentation/ViewportPreviewRenderer.ts
 *
 * Renders a live 2D preview of a ViewDefinition's content onto an HTMLCanvasElement.
 *
 * Contract compliance:
 *   §01 §2   — Read-only; no store writes, no Command calls
 *   §05 §7   — No DOM except the canvas passed in
 *   §06      — No platform-layer imports
 *   §07      — No server routes; fully client-side
 */

import { getFrameScheduler } from '@pryzm/frame-scheduler';
import type { ViewDefinition } from '../views/ViewDefinitionTypes.js';

interface _WallBasePt { x: number; z: number }
interface _Wall {
    levelId?: string;
    baseLine?: [_WallBasePt, _WallBasePt] | any[];
    thickness?: number;
    materialColor?: string;
    curve?: { control: { x: number; y: number; z: number }; segments?: number };
}

interface _SlabPolygonPt { x: number; y: number }
interface _Slab {
    levelId?: string;
    position?: { x: number; y: number; z: number };
    polygon?: _SlabPolygonPt[];
    width?: number;
    depth?: number;
}

interface _Column {
    levelId?: string;
    position?: { x: number; y?: number; z: number };
    width?: number;
    depth?: number;
}

interface _Room {
    levelId?: string;
    name?: string;
    label?: string;
    polygon?: Array<{ x: number; z: number } | { x: number; y: number }>;
    centroid?: { x: number; z?: number; y?: number };
    position?: { x: number; z?: number; y?: number };
}

const PLAN_VIEW_TYPES = new Set(['plan', 'ceiling-plan', 'structural-plan']);
const VIEW_3D_TYPES   = new Set(['3d', 'walkthrough', 'render']);

const PREVIEW_PADDING = 10;

/**
 * §SHEET-3D-CAPTURE-IS-NOT-A-DRAWING (L-1843) — does this RGBA buffer carry any
 * actual COLOUR?
 *
 * Exported as a pure function purely so the defect it replaces can be pinned by
 * a test without a working canvas backend. The bug: the original walked every
 * byte and accepted on `data[i] > 0`, which INCLUDED the alpha channel. An
 * opaque black frame is `(0,0,0,255)` repeated — alpha 255 everywhere — so it
 * was accepted as content. The predicate could only ever have rejected a fully
 * TRANSPARENT surface, which is not what "the renderer drew nothing" looks like
 * on a WebGL canvas with a cleared framebuffer.
 *
 * @param data      RGBA bytes, 4 per pixel.
 * @param threshold per-channel value above which a pixel counts as coloured;
 *                  small non-zero to tolerate codec/compression noise.
 */
export function rgbaHasColour(data: Uint8ClampedArray | number[], threshold = 8): boolean {
    for (let i = 0; i < data.length; i++) {
        if (i % 4 === 3) continue;                    // skip alpha
        if ((data[i] ?? 0) > threshold) return true;
    }
    return false;
}

const FALLBACK_WALL_EDGE    = '#1a1a2e';
const FALLBACK_SLAB_FILL    = '#e4e8ef';
const FALLBACK_SLAB_EDGE    = '#a0a8b8';
const FALLBACK_COLUMN_FILL  = '#4a5068';
const FALLBACK_ROOM_TEXT    = '#2d4070';
const FALLBACK_ROOM_FILL    = 'rgba(220,228,245,0.18)';

class ViewportPreviewRenderer {
    private readonly _registry = new Map<string, Set<HTMLCanvasElement>>();
    private readonly _viewDefs = new Map<string, ViewDefinition>();
    private _3dRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    /**
     * §SHEET-3D-CAPTURE-IS-NOT-A-DRAWING (L-1843) — last frame captured while
     * the live 3D surface genuinely had content. Used while that surface is
     * hidden (sheet editor open ⇒ container `display:none` ⇒ the render pass is
     * refused, L-1470). Downscaled to ≤512px wide; one shared canvas, since
     * every 3D viewport captures the same renderer.
     */
    private _last3dCapture: HTMLCanvasElement | null = null;

    /**
     * §SHEET-3D-SNAPSHOT-IS-DATED (L-1868) — when `_last3dCapture` was taken,
     * as `Date.now()`. `null` when there has never been one.
     *
     * The founder, 2026-08-21: *"the 3d is not sound — it is not exactly what I
     * have in the 3d view."*
     *
     * L-1843 made a hidden 3D viewport fall back to the last frame captured
     * while the view was genuinely visible, which fixed a near-black box. But
     * the fallback SAYS NOTHING, so a frame captured from a camera the user has
     * since orbited away from presents exactly like a live one. "This is your 3D
     * view" and "this is a picture of your 3D view from some earlier moment" are
     * different facts, and the surface rendered them identically — the same
     * defect shape as the alpha-counting blank detector L-1843 removed, one
     * level up [context-data-honesty].
     *
     * A capture cannot be made live from here (see `_render3DCapture` — P2 keeps
     * THREE out of L2 and re-rendering costs a frame per viewport), so the
     * honest move is not to hide the staleness but to DATE it.
     */
    private _last3dCaptureAt: number | null = null;

    constructor() {
        this._bindEvents();
    }

    attach(viewDef: ViewDefinition, canvas: HTMLCanvasElement): void {
        this._viewDefs.set(viewDef.id, viewDef);
        const existing = this._registry.get(viewDef.id) ?? new Set();
        existing.add(canvas);
        this._registry.set(viewDef.id, existing);

        getFrameScheduler().scheduleOnce('viewport-preview-attach', () => {
            this._renderToCanvas(viewDef, canvas);
        });
    }

    detach(viewId: string, canvas: HTMLCanvasElement): void {
        const set = this._registry.get(viewId);
        if (!set) return;
        set.delete(canvas);
        if (set.size === 0) {
            this._registry.delete(viewId);
            this._viewDefs.delete(viewId);
        }
    }

    invalidate(viewId?: string): void {
        if (viewId) {
            this._rerenderView(viewId);
        } else {
            this._rerenderAll();
        }
    }

    private _bindEvents(): void {
        window.addEventListener('vd:view-updated', (e: Event) => {
            const id = (e as CustomEvent).detail?.viewId;
            this.invalidate(id ?? undefined);
        });
        window.addEventListener('vd:view-range-changed', (e: Event) => {
            const id = (e as CustomEvent).detail?.viewId;
            this.invalidate(id ?? undefined);
        });

        window.addEventListener('vg:template-updated',    () => this._rerenderAll());
        window.addEventListener('vg:category-style-set',  () => this._rerenderAll());

        const planInvalidators = [
            'store:wall-created',    'store:wall-updated',
            'store:slab-created',    'store:slab-updated',
            'store:column-created',  'store:column-updated',
            'store:room-created',    'store:room-updated',
            'bim-wall-added',   'bim-wall-updated',   'bim-wall-removed',
            'bim-slab-added',   'bim-slab-updated',   'bim-slab-removed',
            'bim-room-added',   'bim-room-updated',   'bim-room-removed',
        ];
        for (const evName of planInvalidators) {
            window.addEventListener(evName, () => this._rerenderPlanViews());
        }

        const schedule3DRefresh = () => {
            if (this._3dRefreshTimer) return;
            this._3dRefreshTimer = setTimeout(() => {
                this._3dRefreshTimer = null;
                this._rerender3DViews();
            }, 2000);
        };

        const scene3DInvalidators = [
            'bim-wall-added',   'bim-wall-updated',   'bim-wall-removed',
            'bim-slab-added',   'bim-slab-updated',   'bim-slab-removed',
            'bim-element-added', 'bim-element-updated', 'bim-element-removed',
            'pryzm:frame-rendered',
            'view:3d-scene-changed',
        ];
        for (const evName of scene3DInvalidators) {
            window.addEventListener(evName, schedule3DRefresh);
        }
    }

    private _rerenderView(viewId: string): void {
        const viewDef = this._viewDefs.get(viewId);
        if (!viewDef) return;
        const canvases = this._registry.get(viewId);
        if (!canvases) return;
        canvases.forEach(canvas => this._renderToCanvas(viewDef, canvas));
    }

    private _rerenderAll(): void {
        this._viewDefs.forEach((viewDef, viewId) => {
            const canvases = this._registry.get(viewId);
            if (canvases) {
                canvases.forEach(canvas => this._renderToCanvas(viewDef, canvas));
            }
        });
    }

    private _rerenderPlanViews(): void {
        this._viewDefs.forEach((viewDef, viewId) => {
            if (!PLAN_VIEW_TYPES.has(viewDef.viewType)) return;
            const canvases = this._registry.get(viewId);
            if (canvases) {
                canvases.forEach(canvas => this._renderToCanvas(viewDef, canvas));
            }
        });
    }

    private _rerender3DViews(): void {
        this._viewDefs.forEach((viewDef, viewId) => {
            if (!VIEW_3D_TYPES.has(viewDef.viewType)) return;
            const canvases = this._registry.get(viewId);
            if (canvases) {
                canvases.forEach(canvas => this._renderToCanvas(viewDef, canvas));
            }
        });
    }

    private _renderToCanvas(viewDef: ViewDefinition, canvas: HTMLCanvasElement): void {
        const w = canvas.offsetWidth  || canvas.width;
        const h = canvas.offsetHeight || canvas.height;
        if (w < 1 || h < 1) return;

        if (canvas.width !== w)  canvas.width  = w;
        if (canvas.height !== h) canvas.height = h;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, w, h);

        if (PLAN_VIEW_TYPES.has(viewDef.viewType)) {
            this._renderPlanView(ctx, viewDef, w, h);
        } else if (VIEW_3D_TYPES.has(viewDef.viewType)) {
            this._render3DCapture(ctx, viewDef, w, h);
        } else {
            this._renderPlaceholder(ctx, viewDef, w, h);
        }
    }

    /**
     * §SHEET-3D-CAPTURE-IS-NOT-A-DRAWING (L-1843) — a 3D viewport on a sheet is
     * a RASTER capture of the live renderer, and it is the only viewport kind
     * that is. Plan / elevation / section resolve to real vector linework via
     * the TechnicalDrawing + `ViewportSvgComposer` path; there is no edge
     * projection for `3d` / `render` / `walkthrough` (`SheetProjectionOrchestrator`
     * excludes them by design), so this method cannot produce, and must not
     * imply, drawing parity with the plan.
     *
     * ⚠ THE FOUNDER'S NEAR-BLACK NAVY BOX. Two faults compounded:
     *
     *  1. **The blank-detector counted ALPHA.** The probe walked the raw RGBA
     *     bytes and accepted the frame on `data[i] > 0` for ANY index —
     *     including every 4th byte, the alpha channel. A fully opaque BLACK
     *     canvas has alpha 255 in every pixel, so `hasContent` was `true` for an
     *     image with no content whatsoever. It could only ever have returned
     *     false for a fully TRANSPARENT surface. That is
     *     [context-data-honesty] in its purest form: "the renderer drew
     *     nothing" and "the renderer drew something" had the same value.
     *  2. **`#0f1520` is the navy.** Having accepted the blank frame, the code
     *     filled the viewport with `#0f1520` and drew the empty capture over
     *     it. The founder was looking at this literal constant.
     *
     * The upstream cause of the blankness is real and already diagnosed:
     * while the sheet editor is open the 3D container is `display:none`, so
     * `renderer-three` refuses the pass (§SURFACE-WITH-NO-AREA-REFUSES-THE-PASS,
     * L-1470) and the framebuffer is incomplete. Note the CANVAS ELEMENT keeps
     * its non-zero `width`/`height` backing store — only the drawing surface is
     * unusable — which is exactly why the `src.width > 0` guard above did not
     * catch it either.
     *
     * WHY A CACHED CAPTURE, and not an offscreen re-render: re-rendering the
     * scene into a correctly-sized offscreen target from HERE would require a
     * renderer handle and a render pass from L2 `core-app-model`, which owns
     * neither — P2 keeps THREE inside `@pryzm/renderer-three`, and this module
     * is a read-only presenter (C01 §2). Re-rendering also costs a full frame
     * per viewport per refresh, on a surface the user is not looking at. So we
     * keep the LAST CAPTURE TAKEN WHILE THE 3D VIEW WAS GENUINELY VISIBLE and
     * present that: it is by construction "what you get once you open the view
     * itself", because it is literally a frame from when the view was open.
     *
     * And when there is no such frame — the user has never opened the 3D view
     * this session — we say so, in words. A black rectangle presented as the
     * view is the same lie as a bitmap presented as a drawing.
     */
    private _render3DCapture(
        ctx:     CanvasRenderingContext2D,
        viewDef: ViewDefinition,
        w:       number,
        h:       number,
    ): void {
        const pryzmCanvas     = (window as any).pryzmCanvas     as HTMLCanvasElement | undefined;
        const obcCanvas       = (window as any).obcRendererCanvas as HTMLCanvasElement | undefined;
        const src: HTMLCanvasElement | undefined = pryzmCanvas ?? obcCanvas;

        if (src && src.width > 0 && src.height > 0 && this._surfaceHasContent(src)) {
            this._remember3DCapture(src);
            this._paint3DCapture(ctx, viewDef, src, w, h, null);
            return;
        }

        // The live surface is unusable or blank. Fall back to the most recent
        // frame captured while it WAS usable, if we have one — and SAY that it
        // is a snapshot, with its age. §SHEET-3D-SNAPSHOT-IS-DATED (L-1868).
        const cached = this._last3dCapture;
        if (cached && cached.width > 0 && cached.height > 0) {
            this._paint3DCapture(ctx, viewDef, cached, w, h, this._last3dCaptureAt);
            return;
        }

        this._render3DUnavailable(ctx, viewDef, w, h);
    }

    /**
     * True only if the surface carries actual COLOUR.
     *
     * Alpha is deliberately skipped (`i % 4 === 3`): an opaque black frame has
     * alpha 255 everywhere and would otherwise pass as content — the bug this
     * replaces. A cross-origin/tainted surface throws on `getImageData`; we
     * treat that as content, because refusing to show a frame we merely cannot
     * INSPECT would be its own false negative.
     */
    private _surfaceHasContent(src: HTMLCanvasElement): boolean {
        try {
            const sw = Math.min(32, src.width);
            const sh = Math.min(32, src.height);
            const sx = Math.max(0, Math.floor((src.width  - sw) / 2));
            const sy = Math.max(0, Math.floor((src.height - sh) / 2));
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width  = sw;
            tmpCanvas.height = sh;
            const tmpCtx = tmpCanvas.getContext('2d');
            if (!tmpCtx) return true;
            tmpCtx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
            const { data } = tmpCtx.getImageData(0, 0, sw, sh);
            return rgbaHasColour(data);
        } catch {
            return true;
        }
    }

    /** Keep a downscaled copy of a known-good frame for use while 3D is hidden. */
    private _remember3DCapture(src: HTMLCanvasElement): void {
        try {
            const maxW  = 512;
            const scale = Math.min(1, maxW / src.width);
            const cw    = Math.max(1, Math.round(src.width  * scale));
            const ch    = Math.max(1, Math.round(src.height * scale));
            const store = this._last3dCapture ?? document.createElement('canvas');
            if (store.width !== cw)  store.width  = cw;
            if (store.height !== ch) store.height = ch;
            const sctx = store.getContext('2d');
            if (!sctx) return;
            sctx.clearRect(0, 0, cw, ch);
            sctx.drawImage(src, 0, 0, cw, ch);
            this._last3dCapture   = store;
            this._last3dCaptureAt = Date.now();
        } catch {
            /* a failed remember must never break the paint */
        }
    }

    /**
     * Aspect-preserving letterbox blit of `src` into the viewport.
     *
     * `capturedAt` is `null` when `src` is the LIVE surface and a timestamp when
     * it is a remembered frame. It is a required parameter rather than an
     * optional one on purpose: every caller must state which of the two it is
     * handing over, so a future third call site cannot default its way into
     * presenting a snapshot as live.
     */
    private _paint3DCapture(
        ctx:        CanvasRenderingContext2D,
        viewDef:    ViewDefinition,
        src:        HTMLCanvasElement,
        w:          number,
        h:          number,
        capturedAt: number | null,
    ): void {
        ctx.fillStyle = '#0f1520';
        ctx.fillRect(0, 0, w, h);

        const srcAspect = src.width / src.height;
        const dstAspect = w / h;
        let dw = w, dh = h, dx = 0, dy = 0;
        if (srcAspect > dstAspect) {
            dh = w / srcAspect;
            dy = (h - dh) / 2;
        } else {
            dw = h * srcAspect;
            dx = (w - dw) / 2;
        }

        ctx.drawImage(src, dx, dy, dw, dh);
        if (capturedAt !== null) this._drawSnapshotBadge(ctx, capturedAt, w, h);
        this._drawViewTypeBadge(ctx, viewDef.viewType, w, h);
    }

    /**
     * §SHEET-3D-SNAPSHOT-IS-DATED (L-1868) — stamp the frame as a snapshot and
     * say how old it is.
     *
     * Age, not a wall-clock time, because the question the founder is actually
     * asking is *"is this what my 3D view looks like NOW?"*, and "4 min ago"
     * answers that without him having to work out what time it was when he last
     * opened the view.
     *
     * Drawn INTO the raster rather than as sibling DOM so it survives every
     * consumer of this canvas — the sheet viewport, the view picker thumbnail
     * and any future one — instead of being a decoration one surface remembers
     * to add and the others do not.
     */
    private _drawSnapshotBadge(
        ctx:        CanvasRenderingContext2D,
        capturedAt: number,
        w:          number,
        h:          number,
    ): void {
        const label = `snapshot · ${formatAge(Date.now() - capturedAt)}`;
        const fontPx = Math.max(7, Math.min(11, Math.round(h * 0.09)));
        ctx.font         = `${fontPx}px sans-serif`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';

        const padX = 4;
        const textW = ctx.measureText(label).width;
        const boxW  = Math.min(w - 4, textW + padX * 2);
        const boxH  = fontPx + 6;

        ctx.fillStyle = 'rgba(180, 83, 9, 0.88)';
        ctx.fillRect(2, 2, boxW, boxH);
        ctx.fillStyle = '#fffaf2';
        ctx.fillText(label, 2 + padX, 2 + boxH / 2);
    }

    /**
     * Honest empty state for a 3D viewport with no frame available.
     *
     * Deliberately LIGHT, not the `#0f1520` navy: the whole defect was a dark
     * rectangle that looked like a rendered scene. This must not be mistakable
     * for one.
     */
    private _render3DUnavailable(
        ctx:     CanvasRenderingContext2D,
        viewDef: ViewDefinition,
        w:       number,
        h:       number,
    ): void {
        ctx.fillStyle = '#f4f7fb';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#d5dce8';
        ctx.lineWidth   = 0.5;
        for (let x = -h; x < w + h; x += 16) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + h, h);
            ctx.stroke();
        }

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        ctx.font      = `${Math.round(h * 0.26)}px sans-serif`;
        ctx.fillStyle = '#b0bdc8';
        ctx.fillText('⬢', w / 2, h * 0.40);

        ctx.font      = `${Math.max(9, Math.round(h * 0.1))}px sans-serif`;
        ctx.fillStyle = '#8898aa';
        ctx.fillText('Open the 3D view to capture it', w / 2, h * 0.66);

        this._drawViewTypeBadge(ctx, viewDef.viewType, w, h);
    }

    private _drawViewTypeBadge(
        ctx:   CanvasRenderingContext2D,
        vType: string,
        w:     number,
        _h:    number,
    ): void {
        const label    = vType.toUpperCase();
        const fontSize = Math.max(7, Math.min(9, w * 0.07));
        const pad      = 3;

        ctx.save();
        ctx.font         = `600 ${fontSize}px -apple-system, sans-serif`;
        ctx.textBaseline = 'top';
        ctx.textAlign    = 'left';
        const tw = ctx.measureText(label).width;

        const bx = w - tw - pad * 2 - 2;
        const by = 2;
        const bw = tw + pad * 2;
        const bh = fontSize + pad * 2;

        ctx.fillStyle   = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(bx, by, bw, bh, 2);
        } else {
            ctx.rect(bx, by, bw, bh);
        }
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.70)';
        ctx.fillText(label, bx + pad, by + pad);
        ctx.restore();
    }

    private _renderPlanView(
        ctx:     CanvasRenderingContext2D,
        viewDef: ViewDefinition,
        w:       number,
        h:       number,
    ): void {
        const win = window as any;
        const wallStore   = win.wallStore;
        const slabStore   = win.slabStore;
        const columnStore = win.columnStore;
        const roomStore   = win.roomStore;

        const levelId = viewDef.spatial?.levelId;

        const allWalls: _Wall[]   = wallStore
            ? (wallStore.getAll() as _Wall[]).filter((el: _Wall) => !levelId || el.levelId === levelId)
            : [];
        const allSlabs: _Slab[]   = slabStore
            ? (slabStore.getAll() as _Slab[]).filter((el: _Slab) => !levelId || el.levelId === levelId)
            : [];
        const allColumns: _Column[] = columnStore
            ? (columnStore.getAll() as _Column[]).filter((el: _Column) => !levelId || el.levelId === levelId)
            : [];
        const allRooms: _Room[] = roomStore
            ? (roomStore.getAll() as _Room[]).filter((r: _Room) => !levelId || r.levelId === levelId)
            : [];

        const isEmpty = allWalls.length === 0 && allSlabs.length === 0 && allColumns.length === 0;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);

        if (isEmpty) {
            ctx.fillStyle = '#adb5bd';
            ctx.font = `${Math.max(9, Math.min(11, w * 0.09))}px -apple-system, sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No elements', w / 2, h / 2);
            return;
        }

        const bounds = this._computeBounds(allWalls, allSlabs, allColumns, allRooms);

        const pad    = PREVIEW_PADDING;
        const worldW = Math.max(0.01, bounds.maxX - bounds.minX);
        const worldH = Math.max(0.01, bounds.maxZ - bounds.minZ);
        const scaleX = (w - pad * 2) / worldW;
        const scaleZ = (h - pad * 2) / worldH;
        const scale  = Math.min(scaleX, scaleZ);

        const offsetX = pad + (w - pad * 2 - worldW * scale) / 2;
        const offsetZ = pad + (h - pad * 2 - worldH * scale) / 2;

        const toX = (wx: number) => offsetX + (wx - bounds.minX) * scale;
        const toY = (wz: number) => offsetZ + (wz - bounds.minZ) * scale;

        if (allRooms.length > 0) {
            ctx.fillStyle   = FALLBACK_ROOM_FILL;
            ctx.strokeStyle = 'rgba(45,64,112,0.12)';
            ctx.lineWidth   = 0.5;
            for (const room of allRooms) {
                if (!room.polygon || room.polygon.length < 3) continue;
                ctx.beginPath();
                const pts = room.polygon;
                const p0x = typeof (pts[0] as any).x === 'number' ? (pts[0] as any).x : 0;
                const p0z = typeof (pts[0] as any).z === 'number' ? (pts[0] as any).z
                           : typeof (pts[0] as any).y === 'number' ? (pts[0] as any).y : 0;
                ctx.moveTo(toX(p0x), toY(p0z));
                for (let i = 1; i < pts.length; i++) {
                    const px = typeof (pts[i] as any).x === 'number' ? (pts[i] as any).x : 0;
                    const pz = typeof (pts[i] as any).z === 'number' ? (pts[i] as any).z
                              : typeof (pts[i] as any).y === 'number' ? (pts[i] as any).y : 0;
                    ctx.lineTo(toX(px), toY(pz));
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }

        ctx.fillStyle   = FALLBACK_SLAB_FILL;
        ctx.strokeStyle = FALLBACK_SLAB_EDGE;
        ctx.lineWidth   = 0.5;

        for (const slab of allSlabs) {
            if (slab.polygon && slab.polygon.length >= 3) {
                ctx.beginPath();
                ctx.moveTo(toX(slab.polygon[0]!.x), toY(slab.polygon[0]!.y));
                for (let i = 1; i < slab.polygon.length; i++) {
                    ctx.lineTo(toX(slab.polygon[i]!.x), toY(slab.polygon[i]!.y));
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else if (slab.position) {
                const hw = (slab.width  ?? 5) / 2;
                const hd = (slab.depth  ?? 5) / 2;
                const x  = slab.position.x ?? 0;
                const z  = slab.position.z ?? 0;
                const sx = toX(x - hw);
                const sy = toY(z - hd);
                const sw = (slab.width ?? 5) * scale;
                const sd = (slab.depth ?? 5) * scale;
                ctx.fillRect(sx, sy, sw, sd);
                ctx.strokeRect(sx, sy, sw, sd);
            }
        }

        for (const wall of allWalls) {
            const bl = wall.baseLine;
            if (!bl || bl.length < 2) continue;

            const p0 = bl[0];
            const p1 = bl[1];
            if (p0 == null || p1 == null) continue;

            const sx = toX(p0.x ?? 0);
            const sy = toY(p0.z ?? 0);
            const ex = toX(p1.x ?? 0);
            const ey = toY(p1.z ?? 0);

            const thickness = Math.max(1.5, (wall.thickness ?? 0.2) * scale);

            ctx.strokeStyle = wall.materialColor ?? FALLBACK_WALL_EDGE;
            ctx.lineWidth   = thickness;
            ctx.lineCap     = 'square';

            if (wall.curve?.control) {
                const cx = toX(wall.curve.control.x);
                const cy = toY(wall.curve.control.z);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.quadraticCurveTo(cx, cy, ex, ey);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
        }

        ctx.fillStyle   = FALLBACK_COLUMN_FILL;
        ctx.strokeStyle = FALLBACK_WALL_EDGE;
        ctx.lineWidth   = 0.5;
        for (const col of allColumns) {
            if (!col.position) continue;
            const hw = Math.max(2, ((col.width ?? 0.3) / 2) * scale);
            const hd = Math.max(2, ((col.depth ?? 0.3) / 2) * scale);
            const cx = toX(col.position.x ?? 0);
            const cy = toY(col.position.z ?? 0);
            ctx.fillRect(cx - hw, cy - hd, hw * 2, hd * 2);
            ctx.strokeRect(cx - hw, cy - hd, hw * 2, hd * 2);
        }

        if (allRooms.length > 0) {
            ctx.fillStyle    = FALLBACK_ROOM_TEXT;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `${Math.max(6, Math.min(9, scale * 0.4))}px -apple-system, sans-serif`;

            for (const room of allRooms) {
                const label = room.name ?? room.label ?? '';
                if (!label) continue;

                let cx: number, cy: number;
                if (room.centroid) {
                    cx = toX(room.centroid.x ?? 0);
                    cy = toY((room.centroid.z ?? room.centroid.y) ?? 0);
                } else if (room.position) {
                    cx = toX(room.position.x ?? 0);
                    cy = toY((room.position.z ?? room.position.y) ?? 0);
                } else if (room.polygon && room.polygon.length > 0) {
                    let sumX = 0, sumZ = 0;
                    for (const pt of room.polygon) {
                        sumX += (pt as any).x ?? 0;
                        sumZ += ((pt as any).z ?? (pt as any).y) ?? 0;
                    }
                    cx = toX(sumX / room.polygon.length);
                    cy = toY(sumZ / room.polygon.length);
                } else {
                    continue;
                }

                ctx.fillText(label, cx, cy);
            }
        }

        this._drawViewTypeBadge(ctx, viewDef.viewType, w, h);
    }

    private _renderPlaceholder(
        ctx:     CanvasRenderingContext2D,
        viewDef: ViewDefinition,
        w:       number,
        h:       number,
    ): void {
        const BG     = '#1e2635';
        const ACCENT = '#2a3654';
        const TEXT   = 'rgba(255,255,255,0.55)';
        const TYPE   = 'rgba(255,255,255,0.25)';

        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = ACCENT;
        ctx.lineWidth   = 1;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

        const fontSize   = Math.max(8, Math.min(11, w * 0.09));
        const typeFontSz = Math.max(7, Math.min(9, w * 0.07));

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        const name = viewDef.name ?? 'View';
        ctx.fillStyle = TEXT;
        ctx.font      = `500 ${fontSize}px -apple-system, sans-serif`;
        ctx.fillText(name, w / 2, h / 2 - typeFontSz * 0.8);

        ctx.fillStyle = TYPE;
        ctx.font      = `400 ${typeFontSz}px -apple-system, sans-serif`;
        ctx.fillText(viewDef.viewType.toUpperCase(), w / 2, h / 2 + fontSize * 0.8);
    }

    private _computeBounds(
        walls:   _Wall[],
        slabs:   _Slab[],
        columns: _Column[],
        rooms:   _Room[],
    ): { minX: number; maxX: number; minZ: number; maxZ: number } {
        let minX =  Infinity, maxX = -Infinity;
        let minZ =  Infinity, maxZ = -Infinity;

        const expandXZ = (x: number, z: number) => {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
        };

        for (const wall of walls) {
            if (wall.baseLine && wall.baseLine.length >= 2) {
                const p0 = wall.baseLine[0];
                const p1 = wall.baseLine[1];
                if (p0) expandXZ(p0.x ?? 0, p0.z ?? 0);
                if (p1) expandXZ(p1.x ?? 0, p1.z ?? 0);
            }
        }

        for (const slab of slabs) {
            if (slab.polygon) {
                for (const pt of slab.polygon) {
                    expandXZ(pt.x, pt.y);
                }
            } else if (slab.position) {
                const hw = (slab.width ?? 5) / 2;
                const hd = (slab.depth ?? 5) / 2;
                expandXZ(slab.position.x - hw, slab.position.z - hd);
                expandXZ(slab.position.x + hw, slab.position.z + hd);
            }
        }

        for (const col of columns) {
            if (col.position) {
                expandXZ(col.position.x ?? 0, col.position.z ?? 0);
            }
        }

        for (const room of rooms) {
            if (room.polygon) {
                for (const pt of room.polygon) {
                    expandXZ((pt as any).x ?? 0, ((pt as any).z ?? (pt as any).y) ?? 0);
                }
            }
        }

        if (!isFinite(minX)) { minX = -5; maxX = 5; minZ = -5; maxZ = 5; }

        const padW = Math.max(0.5, (maxX - minX) * 0.05);
        const padH = Math.max(0.5, (maxZ - minZ) * 0.05);
        return { minX: minX - padW, maxX: maxX + padW, minZ: minZ - padH, maxZ: maxZ + padH };
    }
}

export const viewportPreviewRenderer = (typeof window !== 'undefined')
    ? new ViewportPreviewRenderer()
    : null as unknown as ViewportPreviewRenderer;
export type { ViewportPreviewRenderer };

/**
 * Human-readable age of a capture. Coarse ON PURPOSE — the reader needs to know
 * whether a snapshot is seconds or hours old, not that it is 187 seconds old,
 * and a precise number invites the false impression that the frame is tracking
 * something.
 */
function formatAge(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return 'age unknown';
    const sec = Math.floor(ms / 1000);
    if (sec < 10) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    return `${hr} h ago`;
}
