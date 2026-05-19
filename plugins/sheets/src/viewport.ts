// ViewportManager — drag-and-drop + world-bounds helpers for sheet
// viewports (S38 / Phase 2C / ADR-0031).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S38 lines
// 293–339 ("Implementation Detail — Viewport Rendering at Scale"):
//   • `handleDropView()` — dispatch `sheet.addViewport` from a drag-drop
//     gesture; the dropX / dropY arguments are in sheet-mm space (the
//     editor host converts pointer pixels via `SheetCamera.screenToPaper`).
//   • `getViewportWorldBounds()` — given a viewport, return the world-
//     space rectangle visible inside it.  Used by the bake-worker (S40)
//     to stream the right slice of each view at print resolution.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure module — no DOM, no THREE.  The only side effect is the
//   `commandBus.execute(...)` call in `handleDropView()`.
// • Coordinate convention (matches `paper-size.ts`):
//     - Sheet space: millimetres from sheet bottom-left.
//     - World space: same units the source view emits (mm for plan
//       views, abstract units for elevation/section).  The conversion
//       factor `1mm-on-sheet ↔ scale-mm-in-world` is ENCAPSULATED by
//       the viewport's `scale` denominator.
// • The scale parity contract enforced by `__tests__/viewport.test.ts`:
//     vp.width = 100 mm, vp.scale = 50  ⇒  worldWidth = 5000 mm
//     vp.width = 100 mm, vp.scale = 100 ⇒  worldWidth = 10 000 mm
//     vp.width = 100 mm, vp.scale = 200 ⇒  worldWidth = 20 000 mm
//     vp.width = 100 mm, vp.scale = 500 ⇒  worldWidth = 50 000 mm
//     vp.width = 100 mm, vp.scale = 1000 ⇒ worldWidth = 100 000 mm
//   These five sample scales are the S38 D9 demo scales — every plan
//   view shipped in 2C must round-trip them bit-exact.

import type { CommandBus } from '@pryzm/plugin-sdk';
import type { ViewportDto } from '@pryzm/plugin-sdk';
import type { AddViewportPayload } from './handlers/AddViewport.js';

/** Default viewport size in millimetres when the user drops a view
 *  without dragging out a target rectangle.  120 × 90 mm is the
 *  conventional size of a "default" viewport on an A1 sheet — the user
 *  can resize after the fact via `SetViewportScale`. */
export const DEFAULT_VIEWPORT_WIDTH_MM = 120;
export const DEFAULT_VIEWPORT_HEIGHT_MM = 90;

/** Default scale denominator when the drop gesture does not specify one.
 *  Matches the architectural-plan default in PRYZM 1. */
export const DEFAULT_VIEWPORT_SCALE = 100;

export interface DropViewOptions {
  readonly viewId: string;
  /** Drop position on the sheet (mm from sheet bottom-left).  The host
   *  converts pointer pixels via `SheetCamera.screenToPaper` before
   *  calling. */
  readonly dropX: number;
  readonly dropY: number;
  /** Optional explicit size (mm).  Falls back to the DEFAULT_* constants. */
  readonly width?: number;
  readonly height?: number;
  /** Optional explicit scale.  Falls back to `DEFAULT_VIEWPORT_SCALE`. */
  readonly scale?: number;
  /** Optional anchor — `'topleft'` (default) places the viewport with
   *  its bottom-left corner at (dropX, dropY); `'center'` centres the
   *  viewport on the drop point.  Sheet editors typically use `'center'`
   *  for drag-and-drop UX so the cursor lands inside the new viewport. */
  readonly anchor?: 'topleft' | 'center';
  /** Optional explicit id — when omitted the AddViewport handler mints
   *  one via `createId('view')`. */
  readonly id?: string;
}

export interface WorldBounds {
  /** World-space x of the viewport's bottom-left corner (in the source
   *  view's native units — typically mm for plan views). */
  readonly worldX: number;
  readonly worldY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
}

export class ViewportManager {
  constructor(private readonly bus: CommandBus, private readonly sheetId: string) {
    if (typeof sheetId !== 'string' || sheetId.length === 0) {
      throw new Error('[ViewportManager] sheetId must be a non-empty string');
    }
  }

  /** Dispatch `sheet.addViewport` for a drag-dropped view.  Returns a
   *  promise resolving to the payload that was sent (handy for tests
   *  that want to await the dispatch). */
  async handleDropView(opts: DropViewOptions): Promise<AddViewportPayload> {
    const payload = this.buildDropPayload(opts);
    await this.bus.executeCommand('sheet.addViewport', payload);
    return payload;
  }

  /** Pure: build the payload a `handleDropView()` call would dispatch.
   *  Exposed so callers (and tests) can dry-run the drop computation
   *  without touching the bus. */
  buildDropPayload(opts: DropViewOptions): AddViewportPayload {
    const width = opts.width ?? DEFAULT_VIEWPORT_WIDTH_MM;
    const height = opts.height ?? DEFAULT_VIEWPORT_HEIGHT_MM;
    const scale = opts.scale ?? DEFAULT_VIEWPORT_SCALE;
    const anchor = opts.anchor ?? 'topleft';

    const x = anchor === 'center' ? opts.dropX - width / 2 : opts.dropX;
    const y = anchor === 'center' ? opts.dropY - height / 2 : opts.dropY;

    return {
      sheetId: this.sheetId,
      viewId: opts.viewId,
      x,
      y,
      width,
      height,
      scale,
      ...(opts.id ? { id: opts.id } : {}),
    };
  }

  /** Pure: compute the world-space rectangle visible inside a viewport.
   *  STATIC equivalent below for callers that don't have a manager
   *  instance handy (the sheet-editor-host needs this from inside its
   *  per-frame render loop and shouldn't allocate a manager per frame). */
  getViewportWorldBounds(viewport: ViewportDto): WorldBounds {
    return ViewportManager.computeWorldBounds(viewport);
  }

  /** Static form — see instance method docstring.
   *
   *  The conversion is the inverse of "1 mm on sheet = scale mm in
   *  world": world units = sheet units × scale.  For an L0 (pure)
   *  function this needs no store access — it's a 4-line arithmetic. */
  static computeWorldBounds(viewport: ViewportDto): WorldBounds {
    if (!Number.isFinite(viewport.scale) || viewport.scale <= 0) {
      throw new Error(`[ViewportManager] viewport "${viewport.id}" has invalid scale ${viewport.scale}`);
    }
    if (viewport.clippingBox) {
      // Clipping box defines the WORLD-SPACE crop directly (mm in world
      // coords).  This matches the editor UX: the user draws the crop in
      // the source view's coordinate system, not on the sheet.
      return Object.freeze({
        worldX: viewport.clippingBox.x,
        worldY: viewport.clippingBox.y,
        worldWidth: viewport.clippingBox.width,
        worldHeight: viewport.clippingBox.height,
      });
    }
    return Object.freeze({
      worldX: 0,
      worldY: 0,
      worldWidth: viewport.width * viewport.scale,
      worldHeight: viewport.height * viewport.scale,
    });
  }

  /** True iff a sheet-space point (mm from sheet bottom-left) is inside
   *  the viewport rectangle.  Used by the editor for hit-testing on
   *  click-to-select. */
  static containsPoint(viewport: ViewportDto, sheetX: number, sheetY: number): boolean {
    return sheetX >= viewport.x
      && sheetX <= viewport.x + viewport.width
      && sheetY >= viewport.y
      && sheetY <= viewport.y + viewport.height;
  }
}
