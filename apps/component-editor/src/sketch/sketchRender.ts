// sketchRender — pure-ish canvas drawing helpers (S52 D1).
//
// Split out of `SketchCanvas.ts` to keep that file under the §13
// `family-editor-300-loc-cap` gate.  Each function takes the
// `CanvasRenderingContext2D` plus the data it needs — no module
// state.  No THREE, no DOM beyond the 2D context, no rAF.

import type { SketchDocSnapshot } from '../stores/sketchDocStore.js';
import type { SnapHit } from './snap.js';
import type { ToolPreview } from './tools/types.js';
import { canvasToWorld, worldToCanvas, type ViewState } from './transform.js';

const GRID_MINOR_COLOR = '#1a1a30';
const GRID_MAJOR_COLOR = '#2a2a4a';
const ORIGIN_COLOR = '#444466';
const ENTITY_LINE_COLOR = '#e8e8f0';
const ENTITY_POINT_COLOR = '#ffaa00';
const PREVIEW_COLOR = '#6600ff';
const SNAP_GRID_COLOR = '#666688';
const SNAP_OBJECT_COLOR = '#00ffaa';
const BG_COLOR = '#0a0a18';

export function drawBackground(ctx: CanvasRenderingContext2D, view: ViewState): void {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, view.canvasW, view.canvasH);
}

export function drawGrid(ctx: CanvasRenderingContext2D, view: ViewState, gridSizeMm: number): void {
  if (view.zoom <= 0 || gridSizeMm <= 0) return;
  const tlWorld = canvasToWorld({ px: 0, py: 0 }, view);
  const brWorld = canvasToWorld({ px: view.canvasW, py: view.canvasH }, view);
  ctx.lineWidth = 1;
  drawGridLines(ctx, tlWorld, brWorld, gridSizeMm, GRID_MINOR_COLOR, view);
  drawGridLines(ctx, tlWorld, brWorld, gridSizeMm * 10, GRID_MAJOR_COLOR, view);
  ctx.strokeStyle = ORIGIN_COLOR;
  const o = worldToCanvas({ x: 0, z: 0 }, view);
  ctx.beginPath();
  ctx.moveTo(0, o.py);
  ctx.lineTo(view.canvasW, o.py);
  ctx.moveTo(o.px, 0);
  ctx.lineTo(o.px, view.canvasH);
  ctx.stroke();
}

function drawGridLines(
  ctx: CanvasRenderingContext2D,
  tl: { x: number; z: number },
  br: { x: number; z: number },
  step: number,
  color: string,
  view: ViewState,
): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  const x0 = Math.floor(tl.x / step) * step;
  const x1 = Math.ceil(br.x / step) * step;
  for (let x = x0; x <= x1; x += step) {
    const c = worldToCanvas({ x, z: tl.z }, view);
    ctx.moveTo(c.px, 0);
    ctx.lineTo(c.px, view.canvasH);
  }
  const z0 = Math.floor(tl.z / step) * step;
  const z1 = Math.ceil(br.z / step) * step;
  for (let z = z0; z <= z1; z += step) {
    const c = worldToCanvas({ x: tl.x, z }, view);
    ctx.moveTo(0, c.py);
    ctx.lineTo(view.canvasW, c.py);
  }
  ctx.stroke();
}

export function drawEntities(
  ctx: CanvasRenderingContext2D,
  snap: SketchDocSnapshot,
  view: ViewState,
  selectedIds: ReadonlySet<string> = EMPTY_SET,
): void {
  ctx.lineWidth = 1.5;
  for (const ln of Object.values(snap.lineById)) {
    const a = snap.pointById[ln.p1];
    const b = snap.pointById[ln.p2];
    if (!a || !b) continue;
    const ca = worldToCanvas({ x: a.x, z: a.z }, view);
    const cb = worldToCanvas({ x: b.x, z: b.z }, view);
    ctx.strokeStyle = selectedIds.has(ln.id) ? SELECTION_COLOR : ENTITY_LINE_COLOR;
    ctx.beginPath();
    ctx.moveTo(ca.px, ca.py);
    ctx.lineTo(cb.px, cb.py);
    ctx.stroke();
  }
  for (const c of Object.values(snap.circleById)) {
    const centre = snap.pointById[c.center];
    if (!centre) continue;
    const cc = worldToCanvas({ x: centre.x, z: centre.z }, view);
    const rPx = c.radius * view.zoom;
    if (rPx < 0.5) continue;
    ctx.strokeStyle = selectedIds.has(c.id) ? SELECTION_COLOR : ENTITY_LINE_COLOR;
    ctx.beginPath();
    ctx.arc(cc.px, cc.py, rPx, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const a of Object.values(snap.arcById)) {
    const centre = snap.pointById[a.center];
    if (!centre) continue;
    const cc = worldToCanvas({ x: centre.x, z: centre.z }, view);
    const rPx = a.radius * view.zoom;
    if (rPx < 0.5) continue;
    ctx.strokeStyle = selectedIds.has(a.id) ? SELECTION_COLOR : ENTITY_LINE_COLOR;
    ctx.beginPath();
    ctx.arc(cc.px, cc.py, rPx, a.startAngle, a.endAngle, false);
    ctx.stroke();
  }
  for (const p of Object.values(snap.pointById)) {
    const c = worldToCanvas({ x: p.x, z: p.z }, view);
    ctx.fillStyle = selectedIds.has(p.id) ? SELECTION_COLOR : ENTITY_POINT_COLOR;
    ctx.beginPath();
    ctx.arc(c.px, c.py, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawPreview(ctx: CanvasRenderingContext2D, preview: ToolPreview, view: ViewState): void {
  ctx.strokeStyle = PREVIEW_COLOR;
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.5;
  for (const ln of preview.previewLines) {
    const a = worldToCanvas({ x: ln.x1, z: ln.z1 }, view);
    const b = worldToCanvas({ x: ln.x2, z: ln.z2 }, view);
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
  }
  for (const c of preview.previewCircles ?? []) {
    const cc = worldToCanvas({ x: c.cx, z: c.cz }, view);
    const rPx = c.radius * view.zoom;
    if (rPx < 0.5) continue;
    ctx.beginPath();
    ctx.arc(cc.px, cc.py, rPx, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const a of preview.previewArcs ?? []) {
    const cc = worldToCanvas({ x: a.cx, z: a.cz }, view);
    const rPx = a.radius * view.zoom;
    if (rPx < 0.5) continue;
    ctx.beginPath();
    ctx.arc(cc.px, cc.py, rPx, a.startAngle, a.endAngle, false);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

const EMPTY_SET: ReadonlySet<string> = new Set();
const SELECTION_COLOR = '#00aaff';

export function drawSnapIndicator(ctx: CanvasRenderingContext2D, snap: SnapHit, view: ViewState): void {
  if (snap.kind === 'none') return;
  const c = worldToCanvas({ x: snap.x, z: snap.z }, view);
  ctx.strokeStyle = snap.kind === 'grid' ? SNAP_GRID_COLOR : SNAP_OBJECT_COLOR;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(c.px - 5, c.py - 5, 10, 10);
}
