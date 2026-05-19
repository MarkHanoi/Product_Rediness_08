// SketchCanvas — HTML5 canvas mount for the Family Creator sketcher (S52 D1 / S53 D1).
//
// Orchestrates: store ↔ tool ↔ pointer events ↔ paint cycle. Pure
// rendering helpers live in `sketchRender.ts`; the toolbar lives in
// `SketchToolbar.ts`. This file owns the DOM scaffold + event wiring
// so the §13 300-LoC cap holds even with seven tools registered.
//
// Rules enforced here:
//  - No `(window as any)` (rule P6).
//  - No `requestAnimationFrame` — paints flushed via `queueMicrotask`
//    until the global frame-scheduler lands at S55 (rule P3).
//  - No THREE import (rule P2).

import {
  createSketchDocStore,
  type SketchDocStore,
} from '../stores/sketchDocStore.js';
import type { SelectionStore } from '../stores/selectionStore.js';
import type { EntityId } from './entities.js';
import { snapCursor, type SnapHit } from './snap.js';
import { canvasToWorld, defaultView, type ViewState } from './transform.js';
import {
  drawBackground,
  drawEntities,
  drawGrid,
  drawPreview,
  drawSnapIndicator,
} from './sketchRender.js';
import { mountSketchToolbar, type SketchToolbarMount } from './SketchToolbar.js';
import { createArcTool } from './tools/ArcTool.js';
import { createCircleTool } from './tools/CircleTool.js';
import { createFilletTool } from './tools/FilletTool.js';
import { createLineTool } from './tools/LineTool.js';
import { createRectangleTool } from './tools/RectangleTool.js';
import { createSelectTool } from './tools/SelectTool.js';
import { createTrimTool } from './tools/TrimTool.js';
import {
  EMPTY_PREVIEW,
  type SketchTool,
  type ToolDeps,
  type ToolName,
  type ToolPreview,
} from './tools/types.js';

const GRID_SIZE_MM = 100;
const SNAP_RADIUS_PX = 12;
const PICK_RADIUS_PX = 8;

export interface SketchCanvasMount {
  readonly element: HTMLElement;
  unmount(): void;
  readonly store: SketchDocStore;
  readonly selectionStore: SelectionStore | null;
  setActiveTool(name: ToolName): void;
  getActiveToolName(): ToolName;
}

export interface SketchCanvasOptions {
  readonly store?: SketchDocStore;
  readonly selectionStore?: SelectionStore;
  /** Defaults to `() => prompt('Fillet radius (mm)', '10')`. */
  readonly filletRadiusProvider?: () => number;
}

export function mountSketchCanvas(
  host: HTMLElement,
  opts: SketchCanvasOptions = {},
): SketchCanvasMount {
  const docStore = opts.store ?? createSketchDocStore();
  const selectionStore = opts.selectionStore ?? null;
  let shiftHeld = false;

  const root = document.createElement('div');
  root.dataset.role = 'sketch-canvas-root';
  root.style.cssText = 'display:flex;flex-direction:column;height:100%;background:#0a0a18';

  let activeName: ToolName = 'select';
  const toolbar: SketchToolbarMount = mountSketchToolbar({
    initialActive: activeName,
    onSelect: (name) => switchTool(name),
  });

  const canvasWrap = document.createElement('div');
  canvasWrap.style.cssText = 'flex:1;position:relative;overflow:hidden';
  const canvas = document.createElement('canvas');
  canvas.dataset.role = 'sketch-canvas';
  canvas.tabIndex = 0;
  canvas.style.cssText = 'width:100%;height:100%;display:block;cursor:crosshair;outline:none';
  canvasWrap.appendChild(canvas);

  const hud = document.createElement('div');
  hud.dataset.role = 'sketch-hud';
  hud.style.cssText =
    'position:absolute;left:8px;bottom:8px;color:#a8a8c0;font:12px/1.4 monospace;pointer-events:none;text-shadow:0 0 4px #000;white-space:pre';
  canvasWrap.appendChild(hud);

  root.append(toolbar.element, canvasWrap);
  host.appendChild(root);

  let view: ViewState = defaultView(800, 600);
  let cursorWorld: { x: number; z: number } | null = null;
  let lastSnap: SnapHit | null = null;
  let preview: ToolPreview = EMPTY_PREVIEW;

  const sharedDeps: ToolDeps = {
    commitLine: (l) => docStore.addLineByCoords(l.x1, l.z1, l.x2, l.z2) as string,
    commitCircle: (c) => docStore.addCircleByCoords(c.cx, c.cz, c.radius) as string,
    commitArc: (a) => {
      const center = docStore.addPoint(a.cx, a.cz);
      return docStore.addArc(center, a.radius, a.startAngle, a.endAngle) as string;
    },
    trimLine: (id, keep, cutX, cutZ) => {
      const snap = docStore.get();
      const line = snap.lineById[id as EntityId];
      if (!line) return;
      const keepEndpoint = keep === 'start' ? line.p1 : line.p2;
      const replaceEndpoint = keep === 'start' ? line.p2 : line.p1;
      docStore.removeEntity(line.id);
      const newPt = docStore.addPoint(cutX, cutZ);
      docStore.addLineByPoints(keepEndpoint, newPt);
      docStore.removeEntity(replaceEndpoint);
    },
    removeEntity: (id) => docStore.removeEntity(id as EntityId),
  };

  const toolFactory: Readonly<Record<ToolName, () => SketchTool>> = Object.freeze({
    select: () => createSelectTool(
      {
        entitiesNow: () => docStore.get().entities,
        replaceWith: (id) => selectionStore?.set([id]),
        toggle: (id) => selectionStore?.toggle(id),
        clear: () => selectionStore?.clear(),
        defaultTolMm: () => PICK_RADIUS_PX / view.zoom,
      },
      { isAdditive: () => shiftHeld },
    ),
    line: () => createLineTool(sharedDeps),
    rectangle: () => createRectangleTool(sharedDeps),
    circle: () => createCircleTool(sharedDeps),
    arc: () => createArcTool(sharedDeps),
    fillet: () => createFilletTool({
      ...sharedDeps,
      entitiesNow: () => docStore.get().entities,
      defaultTolMm: () => PICK_RADIUS_PX / view.zoom,
      radiusMm: opts.filletRadiusProvider ?? (() => promptRadius()),
    }),
    trim: () => createTrimTool({
      ...sharedDeps,
      entitiesNow: () => docStore.get().entities,
      defaultTolMm: () => PICK_RADIUS_PX / view.zoom,
    }),
  });

  let activeTool: SketchTool = toolFactory[activeName]();

  function switchTool(name: ToolName): void {
    activeTool.reset();
    activeName = name;
    activeTool = toolFactory[name]();
    preview = EMPTY_PREVIEW;
    toolbar.setActive(name);
    schedulePaint();
  }

  function paint(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const snap = docStore.get();
    drawBackground(ctx, view);
    drawGrid(ctx, view, GRID_SIZE_MM);
    const selSet = selectionStore
      ? new Set<string>(selectionStore.get().ids as readonly string[])
      : new Set<string>();
    drawEntities(ctx, snap, view, selSet);
    drawPreview(ctx, preview, view);
    if (lastSnap) drawSnapIndicator(ctx, lastSnap, view);
    paintHud(hud, cursorWorld, lastSnap, preview, activeName);
  }

  let painting = false;
  function schedulePaint(): void {
    if (painting) return;
    painting = true;
    queueMicrotask(() => {
      painting = false;
      paint();
    });
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || 800));
    const h = Math.max(1, Math.floor(rect.height || 600));
    canvas.width = w;
    canvas.height = h;
    view = { ...view, canvasW: w, canvasH: h };
    schedulePaint();
  }

  function dispatch(kind: 'pointer-move' | 'pointer-down', e: PointerEvent): void {
    const rect = canvas.getBoundingClientRect();
    const world = canvasToWorld({ px: e.clientX - rect.left, py: e.clientY - rect.top }, view);
    const snap = snapCursor({
      cursorX: world.x,
      cursorZ: world.z,
      entities: docStore.get().entities,
      snapRadiusMm: SNAP_RADIUS_PX / view.zoom,
      gridSizeMm: GRID_SIZE_MM,
    });
    cursorWorld = { x: snap.x, z: snap.z };
    lastSnap = snap;
    preview = activeTool.handle({ kind, worldX: snap.x, worldZ: snap.z, snap });
    schedulePaint();
  }

  const onMove = (e: PointerEvent): void => dispatch('pointer-move', e);
  const onDown = (e: PointerEvent): void => {
    canvas.focus();
    shiftHeld = e.shiftKey;
    dispatch('pointer-down', e);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') shiftHeld = true;
    if (e.key === 'Escape') {
      preview = activeTool.reset();
      schedulePaint();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Shift') shiftHeld = false;
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);

  const unsubscribeStore = docStore.subscribe(() => schedulePaint());
  const unsubscribeSelection = selectionStore?.subscribe(() => schedulePaint()) ?? (() => undefined);
  resize();

  return {
    element: root,
    store: docStore,
    selectionStore,
    setActiveTool: switchTool,
    getActiveToolName: () => activeName,
    unmount() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      unsubscribeStore();
      unsubscribeSelection();
      toolbar.destroy();
      host.removeChild(root);
    },
  };
}

function promptRadius(): number {
  const raw = typeof prompt === 'function' ? prompt('Fillet radius (mm)', '10') : '10';
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid fillet radius.');
  return n;
}

function paintHud(
  hud: HTMLElement,
  cursor: { x: number; z: number } | null,
  snap: SnapHit | null,
  preview: ToolPreview,
  tool: ToolName,
): void {
  const lines: string[] = [`Tool: ${tool}`];
  if (cursor) lines.push(`X: ${cursor.x.toFixed(1)}   Z: ${cursor.z.toFixed(1)} mm`);
  if (snap && snap.kind !== 'none') lines.push(`Snap: ${snap.kind}`);
  if (preview.hint) lines.push(preview.hint);
  hud.textContent = lines.join('\n');
}
