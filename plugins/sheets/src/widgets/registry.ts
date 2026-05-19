// Widget registry — the host's lookup table from widget kind →
// renderer.  External plugins can register additional kinds by
// constructing a new registry from `BUILTIN_WIDGETS` and adding their
// own classes (S39 ships the 10 built-ins below).

import type { WidgetDto } from '@pryzm/plugin-sdk';
import type { WidgetKind } from '@pryzm/plugin-sdk';
import {
  Widget,
  type WidgetCtx2D,
  type WidgetRenderEnv,
  type WidgetBounds,
} from './base.js';
import { TextWidget } from './text.js';
import { ImageWidget } from './image.js';
import { NorthArrowWidget } from './north-arrow.js';
import { ScaleBarWidget } from './scale-bar.js';
import { LegendWidget } from './legend.js';
import { RevisionsTableWidget } from './revisions-table.js';
import { ScheduleSnapshotWidget } from './schedule-snapshot.js';
import { BimTagWidget } from './bim-tag.js';
import { LineWidget } from './line.js';
import { RegionWidget } from './region.js';

export type WidgetRegistry = Readonly<Record<string, Widget>>;

export function buildBuiltinWidgetRegistry(): WidgetRegistry {
  const list: Widget[] = [
    new TextWidget(),
    new ImageWidget(),
    new NorthArrowWidget(),
    new ScaleBarWidget(),
    new LegendWidget(),
    new RevisionsTableWidget(),
    new ScheduleSnapshotWidget(),
    new BimTagWidget(),
    new LineWidget(),
    new RegionWidget(),
  ];
  const out: Record<string, Widget> = {};
  for (const w of list) out[w.type] = w;
  return Object.freeze(out);
}

/** Single shared instance of the built-in registry — cheap to share
 *  because every widget class is stateless. */
export const BUILTIN_WIDGET_REGISTRY: WidgetRegistry = buildBuiltinWidgetRegistry();

/** All built-in widget kinds (string-typed for ease of use in UI lists). */
export const BUILTIN_WIDGET_KINDS: readonly WidgetKind[] = Object.freeze(
  Object.keys(BUILTIN_WIDGET_REGISTRY) as WidgetKind[],
);

/**
 * Render `dto` into `ctx` using `registry` (default: built-in).  Returns
 * `true` on success, `false` if the kind isn't registered (the host
 * uses the return value to decide whether to draw the placeholder).
 */
export function renderWidget(
  ctx: WidgetCtx2D,
  dto: WidgetDto,
  env: WidgetRenderEnv = {},
  registry: WidgetRegistry = BUILTIN_WIDGET_REGISTRY,
): boolean {
  const w = registry[dto.kind];
  if (!w) return false;
  let payload;
  try { payload = w.parsePayload(dto.payload as Record<string, unknown>); }
  catch { return false; }
  ctx.save();
  try {
    // Cast: the parse narrows the payload to the widget's own shape.
    (w as unknown as {
      render: (c: WidgetCtx2D, d: WidgetDto, p: unknown, e: WidgetRenderEnv) => void;
    }).render(ctx, dto, payload, env);
    return true;
  } catch {
    return false;
  } finally {
    ctx.restore();
  }
}

/** Compute the on-sheet bounding box for `dto` using its widget's
 *  `getBounds` (handles widgets like BimTag whose anchor extends past
 *  the rectangle). */
export function widgetBounds(
  dto: WidgetDto,
  registry: WidgetRegistry = BUILTIN_WIDGET_REGISTRY,
): WidgetBounds {
  const w = registry[dto.kind];
  if (!w) return { x: dto.x, y: dto.y, width: dto.width, height: dto.height };
  return w.getBounds(dto);
}
