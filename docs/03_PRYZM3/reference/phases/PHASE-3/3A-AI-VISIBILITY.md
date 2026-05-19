# Phase 3A — Visibility-Intent Complete · AI Subsystem · Element Creator · PDF-to-BIM
## Q1 of Phase 3 · Months 25–27 · Sprints S49–S54

> **Authority**: `08-VISION.md` → `SUPPLEMENTAL-IMPLEMENTATION-PLAN-2026.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → this file.  
> Where this file conflicts with the supplemental plan, the supplemental plan wins.  
> Predecessor: `PHASE-2-MIGRATION-MULTIUSER-M13-M24.md`. Successor: `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md`.

> **Bake-worker test (mandatory before every new function):**  
> *"Would this code run in `apps/bake-worker/` (Node, no DOM, no THREE, no React)?"*

---

## §0 Phase 3A Strategic Context

### §0.1 Where we start (M25 morning)

- All 18 element families operational in PRYZM 2; beta cohort of 25 users active
- Full documentation pipeline: plan view, section view, sheets, schedules, PDF export
- Multi-user via Yjs CRDT with awareness + soft locks
- Visibility-Intent waves 1–5 migrated; waves 6–11 remain in PRYZM 1 adapter
- AI host lazy-loaded, approval queue UI present — no real AI workflows yet
- Auto-dimensions live in plan view (from Phase 2B supplement)
- 12 view templates live (from Phase 2B supplement)
- `apps/component-editor/` scaffolded (sprint S49 starts work)

### §0.2 What Phase 3A must deliver

| Deliverable | D# | Sprint |
|---|---|---|
| Visibility-Intent waves 6–11 migrated | D1 moat | S49 |
| AI floor-plan import (CV pipeline, 3-stage) | D2 | S50 |
| AI generative + rule engine + semantic query | D2 | S51 |
| Voice spatial interface as plugin | D2 | S52 |
| Element Creator — sketcher (lines, arcs, constraints) | D10 | S49–S51 |
| Element Creator — constraint solver integration (planegcs) | D10 | S52 |
| Element Creator — 3D preview + parameter table | D10 | S53 |
| Element Creator — IFC mapping panel + `.pryzm-family` format | D10 | S54 |
| PDF-to-BIM: Stage 1 (decomposition) + Stage 2 (classification) | D2 | S50–S52 |
| PDF-to-BIM: Stage 3 (element generation) + review queue UI | D2 | S53–S54 |
| AI public API endpoints (4 endpoints, OAuth2, rate-limited) | D2+D7 | S53 |
| AI batch undo + audit trail | D2 | S54 |

### §0.3 The "no surprises" principle

By Phase 3 the architecture is proven and stable. If any Phase 3A sprint requires changing layer boundaries or ADRs, **stop**: that is a Phase 1/2 issue surfacing late. Reopen the relevant ADR before proceeding.

---

## §1 Sprint S49 — Visibility-Intent Waves 6–11 + Element Creator Scaffold
**Weeks 97–98, Month 25**

### §1.1 Why S49 has two major threads

The Visibility-Intent (VI) migration is not postponable — it is the foundation for correct view template resolution in Phase 3A+. The Element Creator scaffold is non-blocking on other sprints if limited to the app skeleton. Both can run in parallel: **Track A** completes the VI migration; **Track C** (Element Creator) starts the app.

---

### §1.2 Track A — Visibility-Intent Waves 6–11

**Context**: waves 1–5 were migrated in Phase 2B (S32–S34). Waves 6–11 are the remaining six behavioural stages:

| Wave # | Name (PRYZM 1) | Behaviour |
|---|---|---|
| W6 | Material Override Resolution | Per-view material substitution (e.g. override wall fill in a phase plan) |
| W7 | Phase Filter Application | Show/hide elements by construction phase |
| W8 | Design Option Merge | Merge multiple design options into a single view |
| W9 | Linked Model Visibility | Show/hide elements from linked PRYZM models |
| W10 | Transparency Flatten | Flatten transparency stacks before compositing |
| W11 | Final Poche + Symbol Injection | Inject cut-fill hatches and 2D symbols at the end |

**Implementation rule**: waves 6–11 are ported **verbatim** as pure L4 functions — no new interpretation, no "improvements". Verbatim = same input → same output as PRYZM 1, verified by parity tests against PRYZM 1's wave outputs.

```typescript
// packages/geometry-kernel/visibility-intent/wave-06-material-override.ts
// Pure L4. Bake-worker safe.

import type { ElementRenderInstruction } from './resolver';
import type { MaterialOverrideStore } from '@pryzm/schemas/view/material-override';

/**
 * Wave 6: substitutes material references in ElementRenderInstruction[]
 * with any view-local overrides set by the user.
 *
 * Input:  resolved instructions from view-template resolver
 * Output: instructions with modified fill.color where overrides exist
 */
export function applyMaterialOverrides(
  instructions: ElementRenderInstruction[],
  overrides: MaterialOverrideStore,
  viewId: string,
): ElementRenderInstruction[] {
  const viewOverrides = overrides.byView(viewId);
  if (!viewOverrides.size) return instructions; // hot path: no overrides

  return instructions.map(inst => {
    const override = viewOverrides.get(inst.elementId);
    if (!override || !inst.fill) return inst;
    return {
      ...inst,
      fill: {
        ...inst.fill,
        color: override.color ?? inst.fill.color,
        hatch: override.hatch ?? inst.fill.hatch,
      },
    };
  });
}
```

```typescript
// packages/geometry-kernel/visibility-intent/wave-07-phase-filter.ts

export type PhaseFilter = 'New Construction' | 'Existing' | 'Demolished' | 'Temporary';

export interface ElementPhaseData {
  elementId: string;
  createdInPhase: string;
  demolishedInPhase?: string;
}

export function applyPhaseFilter(
  instructions: ElementRenderInstruction[],
  elementPhases: Map<string, ElementPhaseData>,
  activePhase: string,
  phaseFilter: PhaseFilter,
): ElementRenderInstruction[] {
  return instructions.map(inst => {
    const phase = elementPhases.get(inst.elementId);
    if (!phase) return inst;

    const isExisting = phase.createdInPhase < activePhase && !phase.demolishedInPhase;
    const isDemolished = phase.demolishedInPhase === activePhase;
    const isNew = phase.createdInPhase === activePhase;

    let visible = inst.visible;
    switch (phaseFilter) {
      case 'New Construction': visible = isNew;                         break;
      case 'Existing':         visible = isExisting;                    break;
      case 'Demolished':       visible = isDemolished;                  break;
      case 'Temporary':        visible = isNew || isDemolished;         break;
    }

    return { ...inst, visible };
  });
}
```

```typescript
// packages/geometry-kernel/visibility-intent/wave-11-poche-symbol-injection.ts
// Wave 11: the final wave. Injects 2D cut-fill hatches and plan symbols
// into the instruction set. These are the "visual" outputs that feed the
// drawing-primitive layer (Canvas2D committer).

import type { ElementRenderInstruction } from './resolver';
import type { DrawingPrimitive } from '@pryzm/drawing-primitives';

export interface InjectionResult {
  instructions: ElementRenderInstruction[];
  additionalPrimitives: DrawingPrimitive[]; // hatch + symbol primitives
}

export function injectPocheAndSymbols(
  instructions: ElementRenderInstruction[],
  symbolProducers: Map<string, (inst: ElementRenderInstruction) => DrawingPrimitive[]>,
): InjectionResult {
  const additionalPrimitives: DrawingPrimitive[] = [];

  const updated = instructions.map(inst => {
    const producer = symbolProducers.get(inst.category);
    if (producer && inst.visible && inst.classification === 'cut') {
      const prims = producer(inst);
      additionalPrimitives.push(...prims);
    }
    return inst;
  });

  return { instructions: updated, additionalPrimitives };
}
```

**VI Wave orchestration pipeline** (updated with all 11 waves):

```typescript
// packages/geometry-kernel/visibility-intent/pipeline.ts

import { resolveElementInstructions } from './resolver';
import { applyMaterialOverrides } from './wave-06-material-override';
import { applyPhaseFilter } from './wave-07-phase-filter';
import { applyDesignOptionMerge } from './wave-08-design-option';
import { applyLinkedModelVisibility } from './wave-09-linked-model';
import { flattenTransparency } from './wave-10-transparency';
import { injectPocheAndSymbols } from './wave-11-poche-symbol-injection';
// waves 1–5 imported from Phase 2B

export function runVisibilityIntentPipeline(input: VIPipelineInput): VIPipelineOutput {
  // Wave 1–5: already shipped in Phase 2B
  let instructions = resolveElementInstructions(
    input.elements, input.template, input.viewRange, input.elementOverrides,
  );
  instructions = applyWave1FilterOverrides(instructions, input.filterOverrides);
  instructions = applyWave2CategoryVisibility(instructions, input.template);
  instructions = applyWave3SubcategoryVisibility(instructions, input.template);
  instructions = applyWave4ElementOverrides(instructions, input.elementOverrides);
  instructions = applyWave5ViewPhaseDefaults(instructions, input.viewPhase);

  // Wave 6–11: new in Phase 3A
  instructions = applyMaterialOverrides(instructions, input.materialOverrides, input.viewId);
  instructions = applyPhaseFilter(instructions, input.elementPhases, input.activePhase, input.phaseFilter);
  instructions = applyDesignOptionMerge(instructions, input.designOptions);
  instructions = applyLinkedModelVisibility(instructions, input.linkedModelSettings);
  instructions = flattenTransparency(instructions);
  const { instructions: final, additionalPrimitives } = injectPocheAndSymbols(
    instructions, input.symbolProducers,
  );

  return { instructions: final, additionalPrimitives };
}
```

**Exit criteria (S49 — VI thread):**
- All 11 waves migrated; parity tests pass vs PRYZM 1 on 30-case fixture
- Visual diff < 1 px on plan view with all 11 waves active
- `VIPipelineInput`/`VIPipelineOutput` typed and documented
- OTel: `pryzm.vi.wave-{n}` spans visible for all 11 waves

---

### §1.3 Track C — Element Creator App Scaffold

```
apps/component-editor/
  index.html
  src/
    main.ts          // app entry, vanilla TS, no framework
    app.ts           // root component (panel layout)
    router.ts        // hash-based routing: /new, /edit/:id, /preview/:id
    panels/
      sidebar.ts     // family library (existing .pryzm-family files)
      sketcher.ts    // 2D canvas sketcher (S51 full impl)
      parameters.ts  // parameter table (S55 full impl)
      preview.ts     // 3D preview (S54 full impl)
      ifc-mapping.ts // IFC mapping panel (S56 full impl)
    tools/
      line-tool.ts   // line drawing tool (S51)
      arc-tool.ts    // arc drawing tool (S51)
      rect-tool.ts   // rectangle shortcut (S51)
      constraint-tool.ts // constraint placement (S52)
    style/
      editor.css
  vite.config.ts
```

**S49 deliverable**: the shell only — `main.ts` loads, routing works, panel layout renders, 3D preview pane is a placeholder `<canvas>` with a "Preview will appear here" label. No sketcher. No constraints.

**Deep-link from main editor**:
```
apps/editor → "New Component" → window.open(`/component-editor/#/new?returnTo=${projectId}`, '_blank')
apps/editor → "Edit Component" → window.open(`/component-editor/#/edit/${familyId}?returnTo=${projectId}`, '_blank')
```

---

## §2 Sprint S50 — AI Floor-Plan Import: Stage 1 (PDF Decomposition)
**Weeks 99–100, Month 25–26**

### §2.1 The 3-stage PDF-to-BIM pipeline starts here

Stage 1 runs entirely in `apps/ai-worker/` (Node, no DOM). This is the correct placement — bake-worker test: **yes**.

```typescript
// apps/ai-worker/src/pdf-to-bim/stage1-decompose.ts
// Node only. Uses pdf.js headless (pdfjs-dist/legacy).

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import type { PageDecomposition, PageSet } from './types';

export async function decomposePDF(pdfBuffer: Buffer): Promise<PageSet> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const pages: PageDecomposition[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const decomposed = await decomposePage(page, pageNum);
    pages.push(decomposed);
  }

  return { pageCount: doc.numPages, pages };
}

async function decomposePage(page: any, pageNum: number): Promise<PageDecomposition> {
  const viewport = page.getViewport({ scale: 1.0 });
  const operators = await page.getOperatorList();
  const textContent = await page.getTextContent();

  // Extract vector streams
  const vectors = extractVectorStreams(operators, viewport);

  // Extract text with bounding boxes
  const textItems = extractTextWithBounds(textContent, viewport);

  return {
    pageNumber: pageNum,
    widthPt: viewport.width,
    heightPt: viewport.height,
    vectors,
    textItems,
    classification: null, // filled in Stage 2
    scaleInfo: null,       // filled in Stage 2
  };
}

function extractVectorStreams(operators: any, viewport: any): VectorElement[] {
  const elements: VectorElement[] = [];
  const OPS = pdfjs.OPS;

  let currentPath: Point[] = [];
  let currentX = 0, currentY = 0;

  for (let i = 0; i < operators.fnArray.length; i++) {
    const fn = operators.fnArray[i];
    const args = operators.argsArray[i];

    switch (fn) {
      case OPS.moveTo: {
        const [x, y] = transformPoint(args[0], args[1], viewport);
        currentPath = [[x, y]];
        currentX = x; currentY = y;
        break;
      }
      case OPS.lineTo: {
        const [x, y] = transformPoint(args[0], args[1], viewport);
        currentPath.push([x, y]);
        currentX = x; currentY = y;
        break;
      }
      case OPS.curveTo: {
        // Cubic Bezier — approximate as 10 line segments for now
        const segments = approximateBezier(
          [currentX, currentY],
          transformPoint(args[0], args[1], viewport),
          transformPoint(args[2], args[3], viewport),
          transformPoint(args[4], args[5], viewport),
          10,
        );
        currentPath.push(...segments);
        [currentX, currentY] = segments[segments.length - 1];
        break;
      }
      case OPS.closePath: {
        if (currentPath.length > 1) {
          elements.push({ kind: 'polyline', points: [...currentPath], closed: true });
        }
        currentPath = [];
        break;
      }
      case OPS.stroke:
      case OPS.fill: {
        if (currentPath.length >= 2) {
          elements.push({
            kind: currentPath.length === 2 ? 'line' : 'polyline',
            points: [...currentPath],
            closed: fn === OPS.fill,
          });
        }
        currentPath = [];
        break;
      }
    }
  }

  return elements;
}

function transformPoint(x: number, y: number, viewport: any): Point {
  // PDF coordinate origin is bottom-left; flip Y for canvas-space (top-left origin)
  return [x, viewport.height - y];
}

function approximateBezier(p0: Point, p1: Point, p2: Point, p3: Point, steps: number): Point[] {
  const pts: Point[] = [];
  for (let t = 0; t <= 1; t += 1 / steps) {
    const u = 1 - t;
    pts.push([
      u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
      u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
    ]);
  }
  return pts;
}

function extractTextWithBounds(textContent: any, viewport: any): TextItem[] {
  return textContent.items.map((item: any) => ({
    text: item.str,
    x: item.transform[4],
    y: viewport.height - item.transform[5],
    width: item.width,
    height: item.height,
    fontSize: Math.abs(item.transform[0]),
    fontName: item.fontName,
  }));
}
```

### §2.2 Page Classification (AI call — Stage 1b)

```typescript
// apps/ai-worker/src/pdf-to-bim/stage1-classify.ts
// Node only. Uses Anthropic SDK.

import Anthropic from '@anthropic-ai/sdk';
import type { PageDecomposition } from './types';

const client = new Anthropic();

export type PageClassification =
  | 'plan'
  | 'section'
  | 'elevation'
  | 'detail'
  | 'schedule'
  | 'titleblock'
  | 'site'
  | 'other';

/**
 * Classifies each page by sending a thumbnail + text summary to Claude.
 * Runs classification for all pages in parallel (bounded by Anthropic rate limits).
 */
export async function classifyPages(
  pages: PageDecomposition[],
  pdfThumbnails: Map<number, string>, // pageNum → base64 thumbnail
): Promise<Map<number, { classification: PageClassification; confidence: number; scaleText?: string }>> {
  const results = new Map<number, { classification: PageClassification; confidence: number; scaleText?: string }>();

  // Process in batches of 4 (rate limit awareness)
  for (let i = 0; i < pages.length; i += 4) {
    const batch = pages.slice(i, i + 4);
    await Promise.all(batch.map(async page => {
      const result = await classifyOnePage(page, pdfThumbnails.get(page.pageNumber));
      results.set(page.pageNumber, result);
    }));
  }

  return results;
}

async function classifyOnePage(
  page: PageDecomposition,
  thumbnail?: string,
): Promise<{ classification: PageClassification; confidence: number; scaleText?: string }> {
  const textSummary = page.textItems
    .filter(t => t.fontSize > 6)
    .map(t => t.text)
    .slice(0, 50)
    .join(', ');

  const content: Anthropic.MessageParam['content'] = [];

  if (thumbnail) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: thumbnail },
    });
  }

  content.push({
    type: 'text',
    text: `Classify this architectural drawing page. Text found: "${textSummary}".
The page has ${page.vectors.length} vector elements and ${page.textItems.length} text items.

Respond with JSON only:
{
  "classification": "plan" | "section" | "elevation" | "detail" | "schedule" | "titleblock" | "site" | "other",
  "confidence": 0.0-1.0,
  "scaleText": "1:100" | null  // extracted from drawing if visible
}`,
  });

  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 100,
    messages: [{ role: 'user', content }],
  });

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
    return {
      classification: parsed.classification ?? 'other',
      confidence: parsed.confidence ?? 0.5,
      scaleText: parsed.scaleText ?? undefined,
    };
  } catch {
    return { classification: 'other', confidence: 0.2 };
  }
}
```

### §2.3 Scale Recognition (Stage 1c)

```typescript
// apps/ai-worker/src/pdf-to-bim/stage1-scale.ts

/**
 * Extracts drawing scale from text items and scale bar graphics.
 * Returns scale factor: world_mm_per_PDF_pt.
 */
export function extractScale(
  page: PageDecomposition,
  classificationResult: { scaleText?: string },
): { scaleFactor: number; confidence: number; method: 'text' | 'scalebar' | 'default' } {

  // Method 1: parse scale from classification result ("1:100" etc.)
  if (classificationResult.scaleText) {
    const factor = parseScaleText(classificationResult.scaleText);
    if (factor) return { scaleFactor: factor, confidence: 0.95, method: 'text' };
  }

  // Method 2: scan text items for scale notation
  for (const item of page.textItems) {
    const factor = parseScaleText(item.text);
    if (factor) return { scaleFactor: factor, confidence: 0.85, method: 'text' };
  }

  // Method 3: detect scale bar graphic (line with regular divisions and numeric labels)
  const scalebar = detectScaleBar(page);
  if (scalebar) return { scaleFactor: scalebar.factor, confidence: 0.80, method: 'scalebar' };

  // Method 4: default to 1:100 (most common architectural scale)
  return { scaleFactor: 100, confidence: 0.30, method: 'default' };
}

function parseScaleText(text: string): number | null {
  // Match patterns: "1:100", "1:50", "1/100", "SCALE 1:200", "NTS" (no scale)
  const match = text.match(/1\s*[:/]\s*(\d+)/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

function detectScaleBar(page: PageDecomposition): { factor: number } | null {
  // Find horizontal lines of similar length with numeric labels beneath them
  // Heuristic: a scale bar is a short (< 200pt) horizontal line with "0" and another number nearby
  const shortHorizontalLines = page.vectors.filter(v => {
    if (v.kind !== 'line') return false;
    const dx = Math.abs(v.points[1][0] - v.points[0][0]);
    const dy = Math.abs(v.points[1][1] - v.points[0][1]);
    return dy < 5 && dx > 20 && dx < 300; // nearly horizontal, short
  });

  for (const line of shortHorizontalLines) {
    const nearbyText = page.textItems.filter(t =>
      Math.abs(t.y - line.points[0][1]) < 20 &&
      t.x >= line.points[0][0] - 10 &&
      t.x <= line.points[1][0] + 10,
    );

    const numbers = nearbyText
      .map(t => parseFloat(t.text))
      .filter(n => !isNaN(n) && n > 0);

    if (numbers.length >= 2) {
      const worldLength = Math.max(...numbers) * 1000; // m → mm
      const pdfLength = Math.abs(line.points[1][0] - line.points[0][0]);
      const factor = worldLength / (pdfLength * (25.4 / 72)); // pt → mm
      if (factor > 5 && factor < 5000) return { factor };
    }
  }

  return null;
}
```

**S50 Exit Criteria:**
- Stage 1 complete: `decomposePDF` + `classifyPages` + `extractScale` operational
- Page classification accuracy ≥ 90% on 10-page sample fixture (measured)
- Scale recognition accuracy ≥ 95% on 10-page sample (measured)
- BullMQ job: `PdfFloorplanJob` dequeues + runs Stage 1 in < 30s for a 20-page PDF
- OTel: `pryzm.pdf.decompose`, `pryzm.pdf.classify`, `pryzm.pdf.scale` spans visible

---

## §3 Sprint S51 — Element Creator: 2D Sketcher + PDF Stage 2 (Wall/Column)
**Weeks 101–102, Month 26**

### §3.1 Track C — 2D Sketcher Canvas

```typescript
// apps/component-editor/src/panels/sketcher.ts
// Canvas2D sketcher. L7 (DOM, Canvas2D). NO THREE.

export interface SketchEntity {
  id: string;
  kind: 'line' | 'arc' | 'circle' | 'rectangle' | 'refplane';
  points: [number, number][];    // control points in sketch space (mm)
  constraints?: string[];        // IDs of constraints involving this entity
}

export interface SketchState {
  entities: Map<string, SketchEntity>;
  constraints: Map<string, SketchConstraint>;  // see §4 (S52)
  solvedPositions: Map<string, [number, number]>; // entityId → solved position
  dof: number;   // remaining degrees of freedom (0 = well-constrained)
  status: 'under-constrained' | 'well-constrained' | 'over-constrained';
}

export class Sketcher {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: SketchState;
  private activeTool: SketchTool | null = null;
  private camera: SketchCamera;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;cursor:crosshair;';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.camera = new SketchCamera(this.canvas);
    this.state = { entities: new Map(), constraints: new Map(), solvedPositions: new Map(), dof: 0, status: 'under-constrained' };
    this.setupPointerHandlers();
  }

  setTool(tool: SketchTool): void {
    this.activeTool?.deactivate?.();
    this.activeTool = tool;
    tool.activate?.(this);
    this.canvas.style.cursor = tool.cursor ?? 'crosshair';
  }

  render(): void {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#F8F8F8';
    ctx.fillRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

    // Grid
    this.drawGrid();

    ctx.save();
    this.camera.apply(ctx);

    // Reference planes (dashed blue)
    for (const [, entity] of this.state.entities) {
      if (entity.kind === 'refplane') {
        this.drawRefPlane(entity);
      }
    }

    // Entities
    for (const [id, entity] of this.state.entities) {
      const isSelected = this.selectedEntityIds.has(id);
      const color = this.getEntityColor(id, entity);
      this.drawEntity(entity, color, isSelected);
    }

    // Active tool preview
    this.activeTool?.renderPreview?.(ctx, this.camera);

    // Constraint decorations
    this.drawConstraintDecorations();

    ctx.restore();

    // DOF indicator
    this.drawDOFIndicator();
  }

  private getEntityColor(id: string, entity: SketchEntity): string {
    switch (this.state.status) {
      case 'under-constrained': return '#4488FF'; // blue = free
      case 'well-constrained':  return '#000000'; // black = locked
      case 'over-constrained':  return '#FF4444'; // red = conflict
    }
  }

  private drawEntity(entity: SketchEntity, color: string, selected: boolean): void {
    const { ctx } = this;
    ctx.strokeStyle = selected ? '#FF8800' : color;
    ctx.lineWidth = selected ? 2 : 1.5;

    switch (entity.kind) {
      case 'line': {
        const [p1, p2] = entity.points;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
        // Draw endpoints
        this.drawPoint(p1, selected);
        this.drawPoint(p2, selected);
        break;
      }
      case 'arc': {
        const [center, start, end] = entity.points;
        const r = Math.hypot(start[0] - center[0], start[1] - center[1]);
        const startAngle = Math.atan2(start[1] - center[1], start[0] - center[0]);
        const endAngle = Math.atan2(end[1] - center[1], end[0] - center[0]);
        ctx.beginPath();
        ctx.arc(center[0], center[1], r, startAngle, endAngle);
        ctx.stroke();
        break;
      }
      case 'circle': {
        const [center, edge] = entity.points;
        const r = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
        ctx.beginPath();
        ctx.arc(center[0], center[1], r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
  }

  private drawPoint(p: [number, number], selected: boolean): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.fillStyle = selected ? '#FF8800' : '#444444';
    ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGrid(): void {
    const { ctx } = this;
    const spacing = 50; // 50mm grid in sketch space
    // ... grid drawing with camera transform
  }

  private drawDOFIndicator(): void {
    const { ctx } = this;
    const label = this.state.dof === 0
      ? 'Fully constrained'
      : `${this.state.dof} DOF remaining`;
    const color = this.state.status === 'over-constrained' ? '#FF4444'
      : this.state.status === 'well-constrained' ? '#007700'
      : '#4488FF';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(label, 8, 20);
  }

  private drawConstraintDecorations(): void {
    // Draw small visual indicators for each constraint (parallel lines = equal, cross = perpendicular, etc.)
    for (const [, constraint] of this.state.constraints) {
      this.drawConstraintSymbol(constraint);
    }
  }

  private drawConstraintSymbol(c: any): void {
    // Implementation: small icons near constrained points
  }

  private selectedEntityIds = new Set<string>();
  private drawRefPlane(entity: SketchEntity): void { /* dashed blue horizontal/vertical line */ }
  private drawConstraintDecorations_(): void { /* decorations per constraint type */ }

  private setupPointerHandlers(): void {
    this.canvas.addEventListener('pointerdown', e => this.activeTool?.onPointerDown?.(e, this));
    this.canvas.addEventListener('pointermove', e => { this.activeTool?.onPointerMove?.(e, this); this.render(); });
    this.canvas.addEventListener('pointerup', e => this.activeTool?.onPointerUp?.(e, this));
  }

  addEntity(entity: SketchEntity): void {
    this.state.entities.set(entity.id, entity);
    this.solveConstraints();
    this.render();
  }

  removeEntity(entityId: string): void {
    this.state.entities.delete(entityId);
    // Remove constraints referencing this entity
    for (const [cId, c] of this.state.constraints) {
      if (c.entityRefs.includes(entityId)) this.state.constraints.delete(cId);
    }
    this.solveConstraints();
    this.render();
  }

  private async solveConstraints(): Promise<void> {
    // Placeholder until S52 when constraint solver is integrated
    this.state.dof = this.computeNaiveDOF();
    this.state.status = this.state.dof === 0 ? 'well-constrained' : 'under-constrained';
  }

  private computeNaiveDOF(): number {
    let dof = 0;
    for (const [, e] of this.state.entities) {
      dof += e.kind === 'line' ? 4 : e.kind === 'arc' ? 5 : e.kind === 'circle' ? 3 : 2;
    }
    for (const [, c] of this.state.constraints) {
      dof -= constraintDOFReduction(c.kind);
    }
    return Math.max(0, dof);
  }
}

// ── Sketch tools ─────────────────────────────────────────────────────────

export interface SketchTool {
  cursor?: string;
  activate?(sketcher: Sketcher): void;
  deactivate?(): void;
  renderPreview?(ctx: CanvasRenderingContext2D, camera: SketchCamera): void;
  onPointerDown?(e: PointerEvent, sketcher: Sketcher): void;
  onPointerMove?(e: PointerEvent, sketcher: Sketcher): void;
  onPointerUp?(e: PointerEvent, sketcher: Sketcher): void;
}

export class LineTool implements SketchTool {
  cursor = 'crosshair';
  private startPoint: [number, number] | null = null;
  private currentPoint: [number, number] = [0, 0];

  onPointerDown(e: PointerEvent, sketcher: Sketcher): void {
    const pt = sketcher['camera'].screenToWorld([e.offsetX, e.offsetY]);
    const snapped = sketcher['snapPoint'](pt);
    if (!this.startPoint) {
      this.startPoint = snapped;
    } else {
      const id = `entity-${Date.now()}`;
      sketcher.addEntity({ id, kind: 'line', points: [this.startPoint, snapped] });
      this.startPoint = snapped; // chain lines
    }
  }

  onPointerMove(e: PointerEvent, sketcher: Sketcher): void {
    this.currentPoint = sketcher['camera'].screenToWorld([e.offsetX, e.offsetY]);
  }

  renderPreview(ctx: CanvasRenderingContext2D): void {
    if (!this.startPoint) return;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,100,255,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.moveTo(this.startPoint[0], this.startPoint[1]);
    ctx.lineTo(this.currentPoint[0], this.currentPoint[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
```

### §3.2 Track B — PDF Stage 2: Wall + Column Classification

```typescript
// apps/ai-worker/src/pdf-to-bim/stage2-walls.ts
// Node only. Pure geometry + AI for ambiguous cases.

import type { PageDecomposition, VectorElement, ClassifiedLayer } from './types';

/**
 * Classifies vector elements as walls, columns, or other.
 * Uses the parallel-line pair heuristic for walls.
 * Uses closed-rectangle-at-grid-intersections for columns.
 */
export function classifyWallsAndColumns(
  page: PageDecomposition,
  scaleFactor: number, // PDF pt → mm
): Pick<ClassifiedLayer, 'walls' | 'columns'> {

  const lines = extractLines(page.vectors, scaleFactor);
  const walls = detectWallPairs(lines);
  const columns = detectColumns(page.vectors, scaleFactor);

  return { walls, columns };
}

interface ClassifiedLine {
  p1: [number, number]; // mm from page origin
  p2: [number, number];
  angle: number;         // radians, normalised 0–π
  length: number;        // mm
}

function extractLines(vectors: VectorElement[], scale: number): ClassifiedLine[] {
  const lines: ClassifiedLine[] = [];

  for (const v of vectors) {
    if (v.kind === 'line' && v.points.length === 2) {
      const [p1, p2] = v.points.map(p => [p[0] * scale, p[1] * scale] as [number, number]);
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const length = Math.hypot(dx, dy);
      if (length < 100) continue; // skip tiny lines (< 100mm = likely hatching or detail lines)

      const angle = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI; // normalise to 0–π
      lines.push({ p1, p2, angle, length });
    }
  }

  return lines;
}

function detectWallPairs(lines: ClassifiedLine[]): WallCandidate[] {
  const walls: WallCandidate[] = [];
  const used = new Set<number>();

  // Group lines by angle (within 5°)
  const angleGroups = groupByAngle(lines, 5 * Math.PI / 180);

  for (const group of angleGroups) {
    // Within each angle group, find parallel pairs at a consistent spacing
    for (let i = 0; i < group.length; i++) {
      if (used.has(i)) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (used.has(j)) continue;

        const li = group[i], lj = group[j];
        const spacing = perpendicularDistance(li, lj);

        // Wall thickness range: 50mm (partition) to 600mm (external wall)
        if (spacing < 50 || spacing > 600) continue;

        // Must have meaningful overlap (at least 500mm)
        const overlap = computeOverlap(li, lj);
        if (overlap < 500) continue;

        // This is a wall pair
        const centerLine = computeCenterline(li, lj);
        walls.push({
          centerLine,
          thickness: spacing,
          confidence: computeWallConfidence(li, lj, spacing, overlap),
          pairLine1: li,
          pairLine2: lj,
        });
        used.add(i);
        used.add(j);
        break; // li already consumed
      }
    }
  }

  return walls;
}

function computeWallConfidence(l1: ClassifiedLine, l2: ClassifiedLine, spacing: number, overlap: number): number {
  let score = 0.5;
  // Longer lines → more confident
  if (Math.min(l1.length, l2.length) > 2000) score += 0.15;
  else if (Math.min(l1.length, l2.length) > 1000) score += 0.10;
  // Common wall thicknesses → more confident
  const commonThicknesses = [100, 140, 175, 200, 215, 250, 300, 350];
  const nearest = commonThicknesses.reduce((a, b) => Math.abs(a - spacing) < Math.abs(b - spacing) ? a : b);
  if (Math.abs(nearest - spacing) < 10) score += 0.20;
  // Good overlap → more confident
  if (overlap > 3000) score += 0.15;
  return Math.min(1.0, score);
}

function detectColumns(vectors: VectorElement[], scale: number): ColumnCandidate[] {
  const columns: ColumnCandidate[] = [];
  const closedPolygons = vectors.filter(v => v.closed && v.points.length >= 4 && v.points.length <= 8);

  for (const poly of closedPolygons) {
    const pts = poly.points.map(p => [p[0] * scale, p[1] * scale] as [number, number]);
    if (!isApproximateRectangle(pts)) continue;

    const bounds = getBounds(pts);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;

    // Column size range: 100mm × 100mm to 800mm × 800mm
    if (w < 100 || w > 800 || h < 100 || h > 800) continue;

    // Aspect ratio: columns are roughly square (or have known structural sections)
    const aspect = Math.max(w, h) / Math.min(w, h);
    if (aspect > 4) continue; // too elongated → probably not a column

    columns.push({
      position: [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
      width: w,
      depth: h,
      confidence: computeColumnConfidence(w, h, aspect),
    });
  }

  return columns;
}

function computeColumnConfidence(w: number, h: number, aspect: number): number {
  let score = 0.5;
  const commonSizes = [200, 250, 300, 350, 400, 450, 500];
  const nearestW = commonSizes.reduce((a, b) => Math.abs(a - w) < Math.abs(b - w) ? a : b);
  if (Math.abs(nearestW - w) < 15) score += 0.25;
  if (aspect < 1.2) score += 0.15; // nearly square
  return Math.min(1.0, score);
}

// ── Utilities ─────────────────────────────────────────────────────────────

function groupByAngle(lines: ClassifiedLine[], tolerance: number): ClassifiedLine[][] {
  const groups: ClassifiedLine[][] = [];
  const grouped = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (grouped.has(i)) continue;
    const group = [lines[i]];
    grouped.add(i);
    for (let j = i + 1; j < lines.length; j++) {
      if (grouped.has(j)) continue;
      const angleDiff = Math.abs(lines[i].angle - lines[j].angle);
      if (angleDiff < tolerance || Math.abs(angleDiff - Math.PI) < tolerance) {
        group.push(lines[j]);
        grouped.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
}

function perpendicularDistance(l1: ClassifiedLine, l2: ClassifiedLine): number {
  // Distance from l1's midpoint to l2's line
  const mid1: [number, number] = [(l1.p1[0] + l1.p2[0]) / 2, (l1.p1[1] + l1.p2[1]) / 2];
  const dx = l2.p2[0] - l2.p1[0];
  const dy = l2.p2[1] - l2.p1[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Infinity;
  return Math.abs((mid1[0] - l2.p1[0]) * dy - (mid1[1] - l2.p1[1]) * dx) / len;
}

function computeOverlap(l1: ClassifiedLine, l2: ClassifiedLine): number {
  // Project both lines onto the shared axis and compute overlap length
  const dx = l1.p2[0] - l1.p1[0];
  const dy = l1.p2[1] - l1.p1[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;

  const proj = (p: [number, number]) => p[0] * ux + p[1] * uy;
  const l1min = Math.min(proj(l1.p1), proj(l1.p2));
  const l1max = Math.max(proj(l1.p1), proj(l1.p2));
  const l2min = Math.min(proj(l2.p1), proj(l2.p2));
  const l2max = Math.max(proj(l2.p1), proj(l2.p2));

  return Math.max(0, Math.min(l1max, l2max) - Math.max(l1min, l2min));
}

function computeCenterline(l1: ClassifiedLine, l2: ClassifiedLine): [number, number][] {
  // Average the two lines' points to get the centerline
  return [
    [(l1.p1[0] + l2.p1[0]) / 2, (l1.p1[1] + l2.p1[1]) / 2],
    [(l1.p2[0] + l2.p2[0]) / 2, (l1.p2[1] + l2.p2[1]) / 2],
  ];
}

function isApproximateRectangle(pts: [number, number][]): boolean {
  if (pts.length !== 4) return false;
  // Check that all interior angles are close to 90°
  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4];
    const curr = pts[i];
    const next = pts[(i + 1) % 4];
    const v1: [number, number] = [curr[0] - prev[0], curr[1] - prev[1]];
    const v2: [number, number] = [next[0] - curr[0], next[1] - curr[1]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    const angle = Math.atan2(Math.abs(cross), dot);
    if (Math.abs(angle - Math.PI / 2) > 0.2) return false; // more than ~11° off 90°
  }
  return true;
}

function getBounds(pts: [number, number][]): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(...pts.map(p => p[0])),
    maxX: Math.max(...pts.map(p => p[0])),
    minY: Math.min(...pts.map(p => p[1])),
    maxY: Math.max(...pts.map(p => p[1])),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────

interface WallCandidate {
  centerLine: [number, number][];
  thickness: number;
  confidence: number;
  pairLine1: ClassifiedLine;
  pairLine2: ClassifiedLine;
}

interface ColumnCandidate {
  position: [number, number];
  width: number;
  depth: number;
  confidence: number;
}
```

**S51 Exit Criteria:**
- Sketcher renders in Element Creator app; line + arc + rectangle tools functional
- Click to place lines; endpoints snap to existing entity points (1mm snap tolerance)
- DOF counter updates correctly after each entity placement
- Stage 2 wall classification: wall precision ≥ 0.78, recall ≥ 0.68 on 10-page sample
- Stage 2 column detection: precision ≥ 0.80 on 10-page sample
- OTel: `pryzm.pdf.stage2.walls`, `pryzm.pdf.stage2.columns` spans visible

---

## §4 Sprint S52 — Constraint Solver Integration + Door/Window Symbol Matching
**Weeks 103–104, Month 26**

### §4.1 Constraint Solver Integration (Element Creator)

The `planegcs` WASM is integrated into the Element Creator's sketcher. The solver runs in a **dedicated Web Worker** so the UI thread is free.

```typescript
// packages/constraint-solver/src/engine.ts

import type { ConstraintSet, SolveResult, SolveHints } from './types';

// planegcs WASM loaded lazily
let planegcsModule: any = null;

async function getPlanegcs(): Promise<any> {
  if (!planegcsModule) {
    const { default: init } = await import('../wasm/planegcs.js');
    planegcsModule = await init();
  }
  return planegcsModule;
}

export async function solve(set: ConstraintSet, hints?: SolveHints): Promise<SolveResult> {
  const gcs = await getPlanegcs();

  // Map PRYZM constraint types to planegcs calls
  const sys = new gcs.System();

  // Add all variable IDs
  for (const [varId, initialValue] of Object.entries(set.variables)) {
    sys.addVariable(varId, initialValue);
  }

  // Add all constraints
  for (const c of set.constraints) {
    switch (c.kind) {
      case 'distance-pp':
        sys.addDistancePP(c.p1, c.p2, resolveExpr(c.value, set.parameterValues));
        break;
      case 'parallel':
        sys.addParallel(c.l1, c.l2);
        break;
      case 'perpendicular':
        sys.addPerpendicular(c.l1, c.l2);
        break;
      case 'coincident-pp':
        sys.addCoincidentPP(c.p1, c.p2);
        break;
      case 'tangent-la':
        sys.addTangentLA(c.l, c.a);
        break;
      case 'fixed':
        sys.addFixed(c.p, c.x, c.y);
        break;
      case 'equal-length':
        sys.addEqualLength(c.l1, c.l2);
        break;
      case 'angle':
        sys.addAngle(c.l1, c.l2, resolveExpr(c.value, set.parameterValues));
        break;
      case 'symmetric-pl':
        sys.addSymmetric(c.p1, c.p2, c.axis);
        break;
    }
  }

  const startTime = performance.now();
  const result = sys.solve();
  const durationMs = performance.now() - startTime;

  if (result.converged) {
    const values: Record<string, number> = {};
    for (const varId of Object.keys(set.variables)) {
      values[varId] = sys.getVariable(varId);
    }
    return {
      ok: true,
      values,
      status: result.dof === 0 ? 'well-constrained'
        : result.dof > 0 ? 'under-constrained'
        : 'over-constrained',
      dof: result.dof,
      durationMs,
    };
  } else {
    return { ok: false, error: { code: 'Singular', message: result.errorMessage }, durationMs };
  }
}

function resolveExpr(value: number | string, parameterValues: Record<string, number>): number {
  if (typeof value === 'number') return value;
  // value is a parameter name — look it up
  return parameterValues[value] ?? 0;
}

export async function diagnose(set: ConstraintSet): Promise<{ redundant: string[]; freeDOF: number }> {
  // Returns which constraints are redundant (over-constrained) and remaining DOF
  const gcs = await getPlanegcs();
  const sys = new gcs.System();
  // ... same setup as solve() ...
  return { redundant: sys.getRedundantConstraints(), freeDOF: sys.getDOF() };
}
```

**Solver Web Worker** (`packages/constraint-solver/src/worker.ts`):

```typescript
// Runs in dedicated Web Worker. Receives ConstraintSet, sends SolveResult.

import { solve, diagnose } from './engine';

self.addEventListener('message', async (e: MessageEvent) => {
  const { id, kind, payload } = e.data;
  try {
    if (kind === 'solve') {
      const result = await solve(payload.set, payload.hints);
      self.postMessage({ id, result });
    } else if (kind === 'diagnose') {
      const result = await diagnose(payload.set);
      self.postMessage({ id, result });
    }
  } catch (err: any) {
    self.postMessage({ id, error: err.message });
  }
});
```

**Sketcher integration** (S52: replace `solveConstraints` placeholder):

```typescript
// Inside Sketcher class:
private solverWorker = new Worker(new URL('@pryzm/constraint-solver/worker', import.meta.url), { type: 'module' });
private pendingSolve: { id: string; resolve: (r: SolveResult) => void } | null = null;

constructor(container: HTMLElement) {
  // ... existing setup ...
  this.solverWorker.addEventListener('message', (e: MessageEvent) => {
    const { id, result } = e.data;
    if (this.pendingSolve?.id === id) {
      this.pendingSolve.resolve(result);
      this.pendingSolve = null;
    }
  });
}

private async solveConstraints(): Promise<void> {
  const constraintSet = this.buildConstraintSet();
  const id = `solve-${Date.now()}`;

  const result = await new Promise<SolveResult>(resolve => {
    this.pendingSolve = { id, resolve };
    this.solverWorker.postMessage({ id, kind: 'solve', payload: { set: constraintSet } });
  });

  if (result.ok) {
    // Apply solved positions to entities
    for (const [varId, value] of Object.entries(result.values)) {
      this.applyVariableUpdate(varId, value);
    }
    this.state.dof = result.dof;
    this.state.status = result.status;
  } else {
    this.state.status = 'over-constrained';
  }

  this.render();
}

private buildConstraintSet(): ConstraintSet {
  const variables: Record<string, number> = {};
  const constraints: SketchConstraint[] = [];

  // Map each entity endpoint to solver variables
  for (const [id, entity] of this.state.entities) {
    for (let i = 0; i < entity.points.length; i++) {
      variables[`${id}-x${i}`] = entity.points[i][0];
      variables[`${id}-y${i}`] = entity.points[i][1];
    }
  }

  // Map sketch constraints to solver constraints
  for (const [, c] of this.state.constraints) {
    constraints.push(mapSketchConstraintToSolverConstraint(c));
  }

  return { variables, constraints, parameterValues: this.getParameterValues() };
}
```

### §4.2 Door/Window Symbol Matching (PDF Stage 2)

```typescript
// apps/ai-worker/src/pdf-to-bim/stage2-openings.ts

import type { PageDecomposition, VectorElement, WallCandidate } from './types';

interface SymbolTemplate {
  id: string;
  kind: 'door' | 'window';
  subtype: string;  // 'single-swing-left', 'sliding-2-panel', etc.
  // Template defined as a normalised (0..1 space) set of geometric features
  features: SymbolFeature[];
  anchor: [number, number]; // normalised anchor point (hinge for doors, center for windows)
  openingWidthAxis: 'x' | 'y'; // which normalised axis is the opening width
}

interface SymbolFeature {
  kind: 'arc' | 'line' | 'rectangle';
  // For arc: center, radius, startAngle, endAngle (all normalised)
  center?: [number, number];
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  // For line: start, end (normalised)
  p1?: [number, number];
  p2?: [number, number];
}

/**
 * Matches door and window symbols in the page's vector data.
 * Uses template matching with fuzzy score.
 */
export async function matchOpeningSymbols(
  page: PageDecomposition,
  walls: WallCandidate[],
  scaleFactor: number,
  symbolLibrary: SymbolTemplate[],
): Promise<OpeningCandidate[]> {
  const openings: OpeningCandidate[] = [];

  // Find arc elements (door swings are arcs + an adjacent rectangle)
  const arcs = findArcs(page.vectors);

  for (const arc of arcs) {
    // Find adjacent straight lines (the door panel)
    const adjacentLines = findAdjacentLines(page.vectors, arc, 5 * scaleFactor);
    if (!adjacentLines.length) continue;

    // Try to match against each door template
    let bestMatch: { template: SymbolTemplate; score: number } | null = null;
    for (const template of symbolLibrary.filter(t => t.kind === 'door')) {
      const score = matchDoorTemplate(arc, adjacentLines, template, scaleFactor);
      if (score > 0.60 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { template, score };
      }
    }

    if (bestMatch) {
      // Snap to nearest wall
      const nearestWall = snapToNearestWall(arc, walls, scaleFactor);
      if (nearestWall) {
        openings.push({
          kind: 'door',
          subtype: bestMatch.template.subtype,
          position: arcCenter(arc, scaleFactor),
          openingWidthMm: estimateOpeningWidth(arc, bestMatch.template, scaleFactor),
          hostWallCenterLine: nearestWall.centerLine,
          confidence: bestMatch.score,
        });
      }
    }
  }

  // Window detection: look for double parallel lines (window break) or glazing hatches
  const windowCandidates = detectWindowBreaks(page.vectors, walls, scaleFactor, symbolLibrary);
  openings.push(...windowCandidates);

  return openings;
}

function findArcs(vectors: VectorElement[]): ArcDescriptor[] {
  const arcs: ArcDescriptor[] = [];
  for (const v of vectors) {
    if (v.kind === 'arc') {
      arcs.push({ center: v.center!, radius: v.radius!, startAngle: v.startAngle!, endAngle: v.endAngle!, rawVector: v });
    }
  }
  return arcs;
}

function matchDoorTemplate(
  arc: ArcDescriptor,
  lines: VectorElement[],
  template: SymbolTemplate,
  scale: number,
): number {
  // Match: door swing arc should span 90° ± 5° and have a panel line of similar length to the radius
  const arcSpan = Math.abs(arc.endAngle - arc.startAngle);
  let score = 0;

  if (Math.abs(arcSpan - Math.PI / 2) < 0.1) score += 0.35; // 90° swing
  else if (Math.abs(arcSpan - Math.PI / 2) < 0.2) score += 0.20;

  // Panel line should be tangent to arc at one end and equal length to radius
  const panelLine = lines.find(l => {
    const len = lineLength(l) * scale;
    return Math.abs(len - arc.radius * scale) / (arc.radius * scale) < 0.15;
  });
  if (panelLine) score += 0.35;

  // Proximity: panel line starts at arc center
  const panelStart = panelLine?.points[0];
  if (panelStart && distancePt(panelStart, [arc.center[0], arc.center[1]]) * scale < 20) {
    score += 0.15;
  }

  return Math.min(1.0, score);
}

function detectWindowBreaks(
  vectors: VectorElement[],
  walls: WallCandidate[],
  scale: number,
  library: SymbolTemplate[],
): OpeningCandidate[] {
  const windows: OpeningCandidate[] = [];

  // Window break: two parallel lines close together (glazing lines) perpendicular to wall
  // Typically within a wall pair gap
  for (const wall of walls) {
    const wallNormal = computeNormalDirection(wall.centerLine);
    const wallThick = wall.thickness;

    const potentialGlazing = vectors.filter(v => {
      if (v.kind !== 'line') return false;
      const len = lineLength(v) * scale;
      if (len < 200 || len > 6000) return false;
      // Line roughly perpendicular to wall normal (i.e., parallel to wall)
      const angle = lineAngle(v);
      const wallAngle = Math.atan2(wall.centerLine[1][1] - wall.centerLine[0][1], wall.centerLine[1][0] - wall.centerLine[0][0]);
      const diff = Math.abs((angle - wallAngle) % Math.PI);
      return diff < 0.15 || Math.abs(diff - Math.PI) < 0.15;
    });

    // Pair glazing lines
    for (let i = 0; i < potentialGlazing.length; i++) {
      for (let j = i + 1; j < potentialGlazing.length; j++) {
        const g1 = potentialGlazing[i], g2 = potentialGlazing[j];
        const separation = perpendicularSeparation(g1, g2) * scale;
        if (separation < 20 || separation > wallThick + 50) continue;
        const overlap = lineOverlap(g1, g2) * scale;
        if (overlap < 200) continue;

        windows.push({
          kind: 'window',
          subtype: 'casement-2-pane',
          position: midpoint(g1, g2),
          openingWidthMm: overlap,
          hostWallCenterLine: wall.centerLine,
          confidence: 0.65 + (overlap > 1000 ? 0.10 : 0),
        });
      }
    }
  }

  return windows;
}

// (utility functions: lineLength, lineAngle, distancePt, etc. — standard 2D geometry)

interface ArcDescriptor {
  center: [number, number];
  radius: number;
  startAngle: number;
  endAngle: number;
  rawVector: VectorElement;
}

interface OpeningCandidate {
  kind: 'door' | 'window';
  subtype: string;
  position: [number, number];
  openingWidthMm: number;
  hostWallCenterLine: [number, number][];
  confidence: number;
}
```

**S52 Exit Criteria:**
- Constraint solver: all 5 first constraint types (distance-pp, parallel, perpendicular, coincident-pp, fixed) working in sketcher
- Snapshot tests: 20 canonical sketches all within 0.01mm of expected solution
- Solver performance: 50-constraint sketch solves in < 16 ms (measured)
- PDF door matching: precision ≥ 0.75 on 10-page sample
- PDF window matching: precision ≥ 0.70 on 10-page sample

---

## §5 Sprint S53 — Element Creator: 3D Preview + AI Public API
**Weeks 105–106, Month 27**

### §5.1 Element Creator — 3D Preview

The 3D preview in the Element Creator uses the **same L4 kernel** and **same scene committer** as the main editor. This is mandatory — it proves the family geometry is bake-worker safe before shipping.

```typescript
// apps/component-editor/src/panels/preview.ts

import { FrameScheduler } from '@pryzm/frame-scheduler';
import { SceneCommitter } from '@pryzm/scene-committer';
import { produceGeometry } from '@pryzm/geometry-kernel';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class ComponentPreview {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private scheduler: FrameScheduler;
  private committer: SceneCommitter;
  private isDirty = true;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.offsetWidth, container.offsetHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xF0F0F0);

    this.camera = new THREE.PerspectiveCamera(45, container.offsetWidth / container.offsetHeight, 0.01, 1000);
    this.camera.position.set(2, 1.5, 2);

    // Lighting (same as main editor — ensures visual parity)
    const ambient = new THREE.AmbientLight(0xFFFFFF, 0.4);
    const dir = new THREE.DirectionalLight(0xFFFFFF, 0.8);
    dir.position.set(1, 2, 1);
    this.scene.add(ambient, dir);

    // Grid helper
    this.scene.add(new THREE.GridHelper(4, 20, 0xCCCCCC, 0xEEEEEE));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener('change', () => {
      this.isDirty = true;
      this.scheduler.requestFrame('component-preview-orbit');
    });

    // CRITICAL: FrameScheduler owns the render loop — not a free-running rAF.
    // This satisfies ADR-023 (library rAF quarantine).
    this.scheduler = new FrameScheduler();
    this.scheduler.onFrame('component-preview', this.render.bind(this), 'interactive');

    this.committer = new SceneCommitter(this.scene);
  }

  /**
   * Called when the sketch + parameters change.
   * Runs the geometry kernel to produce a BufferGeometryDescriptor,
   * then commits it to the THREE scene.
   *
   * The kernel is the SAME code that runs in apps/bake-worker.
   * This is the proof that the family geometry is bake-worker safe.
   */
  updateGeometry(sketchState: SketchState, parameterValues: Record<string, number>): void {
    try {
      // 1. Convert sketch to geometry IR (L4 kernel — pure)
      const geometryIR = sketchToGeometry(sketchState, parameterValues);

      // 2. Produce display geometry (L4 kernel — pure)
      const { display } = produceGeometry(geometryIR);

      // 3. Commit to THREE scene (L5 committer)
      this.committer.updateComponent('preview-component', display);
      this.isDirty = true;
      this.scheduler.requestFrame('component-preview-geometry');
    } catch (err: any) {
      console.error('[ComponentPreview] Geometry error:', err.message);
      // Show error indicator in preview — never crash
    }
  }

  private render(): void {
    if (!this.isDirty) return;
    this.isDirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
    this.scheduler.destroy();
  }
}

/**
 * Convert sketch geometry + parameter values to a GeometryIR
 * for the kernel to process. Pure function — runs in bake-worker.
 */
function sketchToGeometry(sketch: SketchState, params: Record<string, number>): GeometryIR {
  // Extrude the sketch profile along Z by params.height (or default 0.1m)
  const height = params['Height'] ?? 100; // mm
  const profilePoints = extractProfile(sketch);

  return {
    kind: 'extrusion',
    profile: profilePoints,
    axis: [0, 1, 0],  // Y-up (THREE.js convention)
    distance: height / 1000, // mm → m
  };
}

function extractProfile(sketch: SketchState): [number, number][] {
  // Find closed loop of lines in sketch
  const lines = Array.from(sketch.entities.values()).filter(e => e.kind === 'line');
  if (!lines.length) return [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1]]; // fallback square

  // Use solved positions to get accurate endpoint coordinates
  return lines.map(l => [
    l.points[0][0] / 1000, // mm → m
    l.points[0][1] / 1000,
  ]);
}
```

### §5.2 AI Public API Endpoints

```typescript
// apps/api-gateway/routes/ai/floorplan.ts

import { Router } from 'express';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { requireOAuth } from '../middleware/oauth';
import { rateLimitByKey } from '../middleware/rate-limit';

const router = Router();

const FloorplanRequestSchema = z.object({
  projectId: z.string(),
  pageNumbers: z.array(z.number()).optional(), // which pages to extract (default: all)
  autoapproveThreshold: z.number().min(0).max(1).default(0.85),
});

const pdfQueue = new Queue('pdf-to-bim', {
  connection: { url: process.env.REDIS_URL! },
});

/**
 * POST /v1/ai/floorplan-import
 *
 * Accept: multipart/form-data { pdf: File, options: JSON }
 * Returns: { jobId, estimatedCostUsd, estimatedDurationSec }
 *
 * Rate limit: 10 requests/minute per API key
 */
router.post('/', requireOAuth, rateLimitByKey({ windowMs: 60_000, max: 10 }), async (req, res) => {
  try {
    const opts = FloorplanRequestSchema.parse(JSON.parse(req.body.options ?? '{}'));
    const pdfFile = req.file;

    if (!pdfFile) {
      return res.status(400).json({ error: 'PDF file required' });
    }

    // Cost estimate: ~$0.10 per page
    const estimatedCostUsd = (pdfFile.buffer.byteLength / 50_000) * 0.10; // rough page estimate
    const hardCapUsd = req.user.tier === 'enterprise'
      ? (req.user.aiCostCapUsd ?? 50)
      : 10;

    if (estimatedCostUsd > hardCapUsd) {
      return res.status(402).json({
        error: 'Estimated cost exceeds limit',
        estimatedCostUsd,
        capUsd: hardCapUsd,
      });
    }

    // Enqueue the job
    const job = await pdfQueue.add('pdf-to-bim', {
      projectId: opts.projectId,
      pdfData: pdfFile.buffer.toString('base64'),
      options: opts,
      userId: req.user.id,
      costCapUsd: hardCapUsd,
    }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
    });

    res.json({
      jobId: job.id,
      estimatedCostUsd,
      estimatedDurationSec: 30, // rough estimate
      statusUrl: `/v1/jobs/${job.id}`,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /v1/jobs/:jobId
 * Returns job status and results.
 */
router.get('/:jobId/status', requireOAuth, async (req, res) => {
  const queue = new Queue('pdf-to-bim', { connection: { url: process.env.REDIS_URL! } });
  const job = await queue.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const state = await job.getState();
  const result = job.returnvalue;

  res.json({
    jobId: job.id,
    status: state,
    progress: job.progress,
    result: state === 'completed' ? result : null,
    failedReason: state === 'failed' ? job.failedReason : null,
  });
});

export default router;
```

**S53 Exit Criteria:**
- Element Creator 3D preview renders a parametric profile within 500ms of sketch change
- Geometry kernel is the same code as bake-worker (verified: no separate geometry path)
- 4 AI API endpoints live: `/v1/ai/floorplan-import`, `/v1/ai/query`, `/v1/ai/generate`, `/v1/ai/validate`
- Rate limits enforced: 10 req/min for floorplan-import
- OpenAPI 3.1 generated from Zod schemas at build time
- Sample cURL requests documented in `docs/api/quickstart.md`

---

## §6 Sprint S54 — Element Creator: IFC Mapping + PDF Stage 3 + AI Batch Undo
**Weeks 107–108, Month 27**

### §6.1 IFC Mapping Panel

```typescript
// apps/component-editor/src/panels/ifc-mapping.ts

export interface IFCMappingState {
  ifcEntityType: string;      // e.g. 'IfcDoor', 'IfcFurniture'
  predefinedType?: string;    // e.g. 'SINGLE_SWING_LEFT'
  psets: IFCPsetDefinition[];
  quantities: IFCQuantityDefinition[];
  materialMappings: MaterialMapping[];
}

export interface IFCPsetDefinition {
  psetName: string;           // e.g. 'Pset_DoorCommon'
  properties: Array<{
    name: string;             // e.g. 'FireRating'
    type: 'text' | 'number' | 'boolean';
    mappedParameterId?: string;  // maps to a FamilyParameter.id
    defaultValue?: string | number | boolean;
  }>;
}

const IFC4_ENTITY_TYPES = [
  'IfcDoor', 'IfcWindow', 'IfcFurniture', 'IfcFurnishingElement',
  'IfcBuildingElementProxy', 'IfcPlate', 'IfcMember',
  'IfcDistributionElement', 'IfcFlowTerminal', 'IfcLightFixture',
  'IfcSanitaryTerminal',
] as const;

// Auto-populate predefined Psets based on selected IFC entity type
const IFC_DEFAULT_PSETS: Record<string, IFCPsetDefinition[]> = {
  IfcDoor: [
    {
      psetName: 'Pset_DoorCommon',
      properties: [
        { name: 'FireRating', type: 'text', defaultValue: 'None' },
        { name: 'AcousticRating', type: 'text' },
        { name: 'HandicapAccessible', type: 'boolean', defaultValue: false },
        { name: 'SecurityRating', type: 'text' },
      ],
    },
  ],
  IfcWindow: [
    {
      psetName: 'Pset_WindowCommon',
      properties: [
        { name: 'FireRating', type: 'text', defaultValue: 'None' },
        { name: 'AcousticRating', type: 'text' },
        { name: 'ThermalTransmittance', type: 'number' },
      ],
    },
  ],
};
```

### §6.2 `.pryzm-family` File Format

```typescript
// packages/file-format/src/pryzm-family.ts

import JSZip from 'jszip';
import { z } from 'zod';

export const FamilyManifestSchema = z.object({
  formatVersion: z.literal('1.0'),
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  author: z.string(),
  description: z.string().optional(),
  ifcEntityType: z.string(),
  category: z.enum(['Door', 'Window', 'Furniture', 'Casework', 'Fixture', 'Generic']),
  thumbnail: z.string().optional(), // base64 or relative path within ZIP
  tags: z.array(z.string()).default([]),
  minPRYZMVersion: z.string().default('2.0.0'),
});

export type FamilyManifest = z.infer<typeof FamilyManifestSchema>;

export async function packFamily(
  manifest: FamilyManifest,
  sketchJson: unknown,
  parametersJson: unknown,
  ifcMappingJson: unknown,
  thumbnailWebp?: Buffer,
  iconSvg?: string,
): Promise<Buffer> {
  const zip = new JSZip();

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('sketch.json', JSON.stringify(sketchJson, null, 2));
  zip.file('parameters.json', JSON.stringify(parametersJson, null, 2));
  zip.file('ifc-mapping.json', JSON.stringify(ifcMappingJson, null, 2));

  if (thumbnailWebp) zip.file('thumbnail.webp', thumbnailWebp);
  if (iconSvg) zip.file('icon.svg', iconSvg);

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

export async function unpackFamily(buffer: Buffer): Promise<{
  manifest: FamilyManifest;
  sketch: unknown;
  parameters: unknown;
  ifcMapping: unknown;
}> {
  const zip = await JSZip.loadAsync(buffer);

  const manifest = FamilyManifestSchema.parse(
    JSON.parse(await zip.file('manifest.json')!.async('text')),
  );
  const sketch = JSON.parse(await zip.file('sketch.json')!.async('text'));
  const parameters = JSON.parse(await zip.file('parameters.json')!.async('text'));
  const ifcMapping = JSON.parse(await zip.file('ifc-mapping.json')!.async('text'));

  return { manifest, sketch, parameters, ifcMapping };
}
```

### §6.3 PDF Stage 3 — PRYZM Element Generation

```typescript
// apps/ai-worker/src/pdf-to-bim/stage3-generate.ts
// Pure. Runs in bake-worker (Node).

import type { ClassifiedLayer, WallCandidate, ColumnCandidate, OpeningCandidate } from './types';
import type { CreateWallCommand, CreateDoorCommand, CreateWindowCommand, CreateColumnCommand } from '@pryzm/schemas/commands';
import { ulid } from 'ulid';

export interface GenerationResult {
  commands: Array<CreateWallCommand | CreateDoorCommand | CreateWindowCommand | CreateColumnCommand>;
  confidence: Map<string, number>;  // elementId → confidence score
}

/**
 * Stage 3: Convert classified geometry into PRYZM CreateCommands.
 * Pure function — runs in bake-worker.
 */
export function generateElements(
  layer: ClassifiedLayer,
  levelId: string,
  projectOriginMm: [number, number],
): GenerationResult {
  const commands: GenerationResult['commands'] = [];
  const confidence = new Map<string, number>();

  // Step 1: Wall join resolution — cluster endpoints within 100mm
  const joinedWalls = resolveWallJoins(layer.walls, 100);

  // Step 2: Generate CreateWallCommand for each wall
  for (const wall of joinedWalls) {
    const wallId = ulid();
    const cmd: CreateWallCommand = {
      kind: 'wall.create',
      id: wallId,
      typeId: 'Generic-200mm',  // default type; user can change in review
      baseLevelId: levelId,
      baseOffset: 0,
      topReference: { kind: 'unconnected', height: 3000 }, // default 3m height
      centerline: wall.centerLine.map(([x, y]) => [
        (x - projectOriginMm[0]) / 1000, // mm → m, origin-relative
        0,
        (y - projectOriginMm[1]) / 1000, // PDF Y → world Z (note: PDF Y is already flipped)
      ]) as [[number, number, number], [number, number, number]],
    };
    commands.push(cmd);
    confidence.set(wallId, wall.confidence);
  }

  // Step 3: Generate CreateColumnCommand
  for (const col of layer.columns) {
    const colId = ulid();
    const cmd: CreateColumnCommand = {
      kind: 'column.create',
      id: colId,
      typeId: 'Generic-Column-300x300',
      baseLevelId: levelId,
      topLevelId: levelId,
      position: [
        (col.position[0] - projectOriginMm[0]) / 1000,
        0,
        (col.position[1] - projectOriginMm[1]) / 1000,
      ],
      width: col.width / 1000,
      depth: col.depth / 1000,
    };
    commands.push(cmd);
    confidence.set(colId, col.confidence);
  }

  // Step 4: Generate door/window commands
  for (const opening of layer.openings) {
    const openingId = ulid();
    const hostWall = findHostWall(opening, joinedWalls);
    if (!hostWall) continue;

    if (opening.kind === 'door') {
      const cmd: CreateDoorCommand = {
        kind: 'door.create',
        id: openingId,
        typeId: 'Generic-Door-900x2100',
        hostWallId: hostWall.id!,
        offsetFromStart: computeOffsetOnWall(opening.position, hostWall),
        width: opening.openingWidthMm / 1000,
        height: 2.1,
        baseLevelId: levelId,
        sillHeight: 0,
      };
      commands.push(cmd);
      confidence.set(openingId, opening.confidence);
    } else {
      const cmd: CreateWindowCommand = {
        kind: 'window.create',
        id: openingId,
        typeId: 'Generic-Window-1200x1200',
        hostWallId: hostWall.id!,
        offsetFromStart: computeOffsetOnWall(opening.position, hostWall),
        width: opening.openingWidthMm / 1000,
        height: 1.2,
        sillHeight: 0.9,
        baseLevelId: levelId,
      };
      commands.push(cmd);
      confidence.set(openingId, opening.confidence);
    }
  }

  return { commands, confidence };
}

/**
 * Wall join resolution: cluster wall endpoints within tolerance,
 * trim/extend walls to meet at the cluster centroid.
 */
function resolveWallJoins(
  walls: (WallCandidate & { id?: string })[],
  toleranceMm: number,
): (WallCandidate & { id: string })[] {
  // Assign IDs
  const withIds = walls.map(w => ({ ...w, id: w.id ?? ulid() }));

  // Collect all endpoints with references
  const endpoints: { point: [number, number]; wallId: string; side: 'start' | 'end' }[] = [];
  for (const wall of withIds) {
    endpoints.push({ point: wall.centerLine[0], wallId: wall.id, side: 'start' });
    endpoints.push({ point: wall.centerLine[wall.centerLine.length - 1], wallId: wall.id, side: 'end' });
  }

  // Cluster endpoints within tolerance
  const clusters: { points: typeof endpoints; centroid: [number, number] }[] = [];
  for (const ep of endpoints) {
    let assigned = false;
    for (const cluster of clusters) {
      if (distancePt2(ep.point, cluster.centroid) < toleranceMm) {
        cluster.points.push(ep);
        cluster.centroid = computeCentroid(cluster.points.map(p => p.point));
        assigned = true;
        break;
      }
    }
    if (!assigned) clusters.push({ points: [ep], centroid: [...ep.point] as [number, number] });
  }

  // Apply clusters: move wall endpoints to cluster centroids
  for (const cluster of clusters) {
    if (cluster.points.length < 2) continue; // isolated endpoint — no join
    for (const ep of cluster.points) {
      const wall = withIds.find(w => w.id === ep.wallId)!;
      if (ep.side === 'start') wall.centerLine[0] = cluster.centroid;
      else wall.centerLine[wall.centerLine.length - 1] = cluster.centroid;
    }
  }

  return withIds;
}

function findHostWall(
  opening: OpeningCandidate,
  walls: (WallCandidate & { id: string })[],
): (WallCandidate & { id: string }) | null {
  let best: (WallCandidate & { id: string }) | null = null;
  let bestDist = Infinity;

  for (const wall of walls) {
    const dist = distancePointToPolyline(opening.position, wall.centerLine);
    if (dist < bestDist && dist < 500) { // within 500mm of wall centerline
      best = wall;
      bestDist = dist;
    }
  }
  return best;
}

function computeOffsetOnWall(point: [number, number], wall: WallCandidate): number {
  return projectPointOntoPolyline(point, wall.centerLine);
}

// Utility: distance from point to polyline
function distancePointToPolyline(pt: [number, number], poly: [number, number][]): number {
  let minDist = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const d = distancePointToSegment(pt, poly[i], poly[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function distancePointToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distancePt2(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distancePt2(p, [a[0] + t * dx, a[1] + t * dy]);
}

function projectPointOntoPolyline(pt: [number, number], poly: [number, number][]): number {
  let totalLen = 0;
  let bestOffset = 0;
  let bestDist = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const segLen = distancePt2(poly[i], poly[i + 1]);
    const dx = poly[i+1][0] - poly[i][0], dy = poly[i+1][1] - poly[i][1];
    const t = Math.max(0, Math.min(1, ((pt[0] - poly[i][0]) * dx + (pt[1] - poly[i][1]) * dy) / (segLen * segLen || 1)));
    const d = distancePt2(pt, [poly[i][0] + t * dx, poly[i][1] + t * dy]);
    if (d < bestDist) { bestDist = d; bestOffset = totalLen + t * segLen; }
    totalLen += segLen;
  }
  return bestOffset;
}

function distancePt2(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function computeCentroid(pts: [number, number][]): [number, number] {
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}
```

### §6.4 Review Queue UI

```typescript
// apps/editor/src/plugins/pdf-review/review-queue.ts
// L7 — DOM. Shows pending extractions for user approval/rejection.

export class ReviewQueue {
  private panel: HTMLElement;

  constructor(container: HTMLElement, private commandBus: CommandBus) {
    this.panel = document.createElement('div');
    this.panel.className = 'review-queue-panel';
    container.appendChild(this.panel);
  }

  mount(result: GenerationResult, threshold: number): void {
    const items = Array.from(result.confidence.entries());
    const autoApproved = items.filter(([, score]) => score >= threshold);
    const pending = items.filter(([, score]) => score < threshold && score >= 0.30);
    const uncertain = items.filter(([, score]) => score < 0.30);

    this.panel.innerHTML = `
      <div class="review-header">
        <h3>${result.commands.length} elements extracted</h3>
        <div class="review-summary">
          <span class="auto">${autoApproved.length} auto-approved</span>
          <span class="pending">${pending.length} pending review</span>
          <span class="uncertain">${uncertain.length} uncertain</span>
        </div>
        <div class="review-actions">
          <button class="accept-all">Accept all pending</button>
          <button class="reject-all">Reject all pending</button>
          <label>Threshold: <input type="range" min="0.30" max="0.95" step="0.05" value="${threshold}"></label>
        </div>
      </div>
      <div class="review-items">
        ${pending.map(([id, score]) => this.renderItem(id, score, result)).join('')}
      </div>
    `;

    this.panel.querySelector('.accept-all')!.addEventListener('click', () => {
      for (const [id] of pending) {
        this.approveElement(id, result);
      }
    });

    this.panel.querySelectorAll('.review-item-approve').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        this.approveElement(id, result);
      });
    });

    this.panel.querySelectorAll('.review-item-reject').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.currentTarget as HTMLElement).dataset.id!;
        this.rejectElement(id, result);
      });
    });
  }

  private renderItem(elementId: string, score: number, result: GenerationResult): string {
    const command = result.commands.find(c => c.id === elementId);
    if (!command) return '';
    const scoreColor = score >= 0.75 ? '#007700' : score >= 0.60 ? '#CC8800' : '#CC4400';
    return `
      <div class="review-item" data-id="${elementId}">
        <div class="review-item-info">
          <span class="element-kind">${command.kind.split('.')[0]}</span>
          <span class="confidence" style="color:${scoreColor}">confidence: ${(score * 100).toFixed(0)}%</span>
        </div>
        <div class="review-item-actions">
          <button class="review-item-approve" data-id="${elementId}">✓ Approve</button>
          <button class="review-item-reject" data-id="${elementId}">✗ Reject</button>
          <button class="review-item-edit" data-id="${elementId}">✏ Edit</button>
        </div>
      </div>
    `;
  }

  private approveElement(elementId: string, result: GenerationResult): void {
    const command = result.commands.find(c => c.id === elementId);
    if (!command) return;
    this.commandBus.execute(command);
    this.removeItem(elementId);
  }

  private rejectElement(elementId: string, _result: GenerationResult): void {
    this.removeItem(elementId);
    // No command executed — element simply not created
  }

  private removeItem(elementId: string): void {
    this.panel.querySelector(`[data-id="${elementId}"]`)?.remove();
  }

  dispose(): void { this.panel.remove(); }
}
```

**S54 Exit Criteria (= Phase 3A gate):**
- Element Creator: IFC mapping panel functional; `.pryzm-family` saves and loads correctly
- `.pryzm-family` round-trip: author → save → reload → render → matches original
- PDF Stage 3: `generateElements` runs in Node (bake-worker test: passes)
- Wall join resolution: T-joins and L-joins resolve correctly on 10 adversarial cases
- Review queue: approve/reject updates project correctly; undo-as-one works
- Fixture corpus collection started: 10 of 50 PDF sets collected and labelled
- All 11 VI waves parity-tested; AI moat fully on L7.5; AI batch undo works
- OTel: all new spans visible in Honeycomb dashboard

---

## §7 Phase 3A Cross-Cutting Deliverables

### §7.1 CI Gates Added in 3A

| Gate | Sprint | Condition |
|---|---|---|
| `pryzm-vi-parity` | S49 | All 11 waves: visual diff < 1 px vs PRYZM 1 on 30-case fixture |
| `constraint-solver-snapshot` | S52 | 20 canonical sketches match SHA-pinned output |
| `constraint-solver-perf` | S52 | 50-constraint sketch < 16 ms, 200-constraint < 100 ms |
| `family-round-trip` | S54 | `.pryzm-family` pack → unpack → geometry render matches |
| `pdf-classification-accuracy` | S54 | ≥ 90% on 10-page sample |
| `bake-worker-test-geometry` | S53 | `sketchToGeometry` runs in Node (no DOM/THREE) |
| `pdf-stage3-pure` | S54 | `generateElements` runs in Node |

### §7.2 OTel Spans Added

| Span | Description | Sprint |
|---|---|---|
| `pryzm.vi.wave-{n}` (6–11) | Each visibility-intent wave execution | S49 |
| `pryzm.pdf.decompose` | Stage 1 decomposition | S50 |
| `pryzm.pdf.classify` | AI page classification | S50 |
| `pryzm.pdf.scale` | Scale recognition | S50 |
| `pryzm.pdf.walls` | Wall classification | S51 |
| `pryzm.pdf.openings` | Door/window matching | S52 |
| `pryzm.pdf.generate` | Stage 3 command generation | S54 |
| `pryzm.solver.solve` | Constraint solver invocation | S52 |
| `pryzm.solver.diagnose` | Constraint diagnostic | S52 |
| `pryzm.component.preview-update` | 3D preview geometry update | S53 |
| `pryzm.family.pack` | `.pryzm-family` pack | S54 |
| `pryzm.ai.batch-execute` | AI batch command execution | S54 |

### §7.3 Performance Budgets

| Metric | Target | Sprint |
|---|---|---|
| VI 11-wave pipeline | < 5 ms for 5,000 elements | S49 |
| PDF decomposition (20-page) | < 30 s | S50 |
| Solver: 50-constraint sketch | < 16 ms | S52 |
| Solver: 200-constraint sketch | < 100 ms | S52 |
| Family .pryzm-family pack/unpack | < 500 ms | S54 |
| PDF stage 3 element generation | < 1 s for 200 elements | S54 |

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead.*  
*Predecessor: `PHASE-2-MIGRATION-MULTIUSER-M13-M24.md`.*  
*Successor: `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md`.*
