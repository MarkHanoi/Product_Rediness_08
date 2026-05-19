// Widget base class + shared types (S39 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S39 lines
// 449–522.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Each widget extends `Widget`, exposes a unique `type` matching the
//   discriminator in `widget-payloads.ts`, and implements `render()` +
//   `getBounds()`.
// • `render()` receives a Canvas2D context already in paper-mm space
//   with Y-up (i.e. the same transform the host uses for everything
//   else on the sheet).  It MUST NOT mutate the transform outside its
//   own `save()/restore()` pair.
// • The widget reads its shape from `dto.payload` after parsing it
//   through the matching Zod schema in `widget-payloads.ts`.  Render
//   methods that fail to parse should `throw` — the host catches and
//   degrades to the unwired-kind placeholder.
// • Renderers receive an optional `WidgetRenderEnv` with data the host
//   pulls from sibling stores (legend entries, schedule snapshots, the
//   list of viewports on the same sheet for scale-bar binding, …).

import type { WidgetDto } from '@pryzm/plugin-sdk';
import type {
  LegendEntry,
  WidgetKind,
  WidgetPayload,
} from '@pryzm/plugin-sdk';

/** Soft env passed to every widget render() call.  All fields are
 *  optional — widgets that need data they didn't get render an
 *  empty/skeleton state and never throw. */
export interface WidgetRenderEnv {
  /** Element-type list for `LegendWidget` auto mode.  Each entry is a
   *  colour swatch + label. */
  readonly legendEntries?: ReadonlyArray<LegendEntry>;
  /** Schedule snapshot rows keyed by scheduleId.  Each schedule is an
   *  array of `{ columnKey: cellValue }` rows. */
  readonly schedules?: Readonly<Record<string, ReadonlyArray<Record<string, string>>>>;
  /** Viewport scale lookup for `ScaleBarWidget` viewportId binding.
   *  Map from viewportId → drawing scale denominator. */
  readonly viewportScales?: Readonly<Record<string, number>>;
}

export interface WidgetBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Minimal Canvas2D-like surface so headless (node-canvas) and DOM
 *  contexts both satisfy the renderer without us depending on lib.dom
 *  in the widget signature. */
export type WidgetCtx2D = CanvasRenderingContext2D;

export abstract class Widget<P extends WidgetPayload = WidgetPayload> {
  /** Discriminator value matching `WidgetPayload['kind']`. */
  abstract readonly type: WidgetKind;
  /** Parse the wire-format payload into the widget's shaped payload.
   *  Each subclass binds this to its own Zod schema. */
  abstract parsePayload(raw: Record<string, unknown>): P;
  /** Paint the widget into `ctx` (paper-mm space, Y-up). */
  abstract render(ctx: WidgetCtx2D, dto: WidgetDto, payload: P, env: WidgetRenderEnv): void;
  /** The widget's screen-space bounds on the sheet (mm).  Most widgets
   *  just return `{x, y, width, height}` from the dto; widgets that
   *  draw beyond their declared bounds (BimTag's leader line) override. */
  getBounds(dto: WidgetDto): WidgetBounds {
    return { x: dto.x, y: dto.y, width: dto.width, height: dto.height };
  }
}

// ── Drawing helpers shared by every widget ─────────────────────────────────
//
// The host renders sheets with a Y-up paper-mm transform.  Canvas2D
// `fillText` always paints in the current local coordinate system, so
// text drawn directly would render upside-down.  These helpers wrap
// the counter-flip in a `save()/restore()` pair.

export function withUprightText(
  ctx: WidgetCtx2D,
  cb: (ctx: WidgetCtx2D) => void,
): void {
  ctx.save();
  ctx.scale(1, -1);
  try { cb(ctx); }
  finally { ctx.restore(); }
}

/** Fill `text` upright at paper-mm point (x, y) with `sizeMm` height. */
export function drawUprightText(
  ctx: WidgetCtx2D,
  text: string,
  x: number,
  y: number,
  sizeMm: number,
  color: string,
  align: 'left' | 'center' | 'right' = 'left',
  weight: 'normal' | 'bold' = 'normal',
  baseline: CanvasTextBaseline = 'alphabetic',
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, -1);
  ctx.fillStyle = color;
  ctx.font = `${weight} ${sizeMm}px sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** Wrap `text` to lines no wider than `maxWidthMm` at the given font
 *  size.  Pure: doesn't touch ctx state besides reading `measureText`. */
export function wrapText(
  ctx: WidgetCtx2D,
  text: string,
  maxWidthMm: number,
  sizeMm: number,
  weight: 'normal' | 'bold' = 'normal',
): string[] {
  if (!text) return [];
  ctx.save();
  ctx.font = `${weight} ${sizeMm}px sans-serif`;
  const lines: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para) { lines.push(''); continue; }
    const words = para.split(/\s+/);
    let current = '';
    for (const w of words) {
      const trial = current ? `${current} ${w}` : w;
      if (ctx.measureText(trial).width <= maxWidthMm || !current) {
        current = trial;
      } else {
        lines.push(current);
        current = w;
      }
    }
    if (current) lines.push(current);
  }
  ctx.restore();
  return lines;
}
