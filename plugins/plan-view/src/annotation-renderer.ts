// Plan-view annotation layout — pure (S32).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`
//     §S32 (lines 396 – 599).
//   • Code-level ADR `docs/02-decisions/adrs/0024-plan-view-annotation-pipeline.md`
//     §2 (layout/committer split) and §3 (overlap-resolution algorithm).
//   • Subordinate to `[strategic ADR-016]` (drawing engine architecture).
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • PURE function — no DOM, no Canvas, no `requestAnimationFrame`, no `Date.now`.
//   Runs unmodified in Node (bake worker test, S40 PDF export pre-pass) and
//   in the browser; identical input yields identical output (deterministic).
// • Input: an array of `AnnotationDto` (renderer-friendly DTO; the host adapts
//   the schema-level `Annotation` element into this shape) and a `LayoutCamera`
//   that exposes a single projection callback `worldToCanvas`.
// • Output: an array of `AnnotationLayout` whose every coordinate is in
//   **canvas CSS pixels at identity transform**.  The committer (`AnnotationCommitter`)
//   draws these directly with `setTransform(1,0,0,1,0,0)`; this is what gives
//   text its "sheet-stable" property under camera zoom (PRYZM 1 parity).
// • Z-flip: NONE.  The Z-flip is the renderer's responsibility and lives in
//   `worldToCanvas`.  Layout sees CSS-pixel coords already (positive-Y down).
// • Overlap resolution: greedy nudge — deterministic, O(N²) in number of
//   text labels (N is small in practice; force-directed placement is a
//   Phase 3 enhancement per ADR-0024 §3.2).
//
// WHY A PURE FUNCTION RATHER THAN A CLASS?
// ─────────────────────────────────────────────────────────────────────────────
// The committer is stateful (it owns the canvas context and the font family).
// The layout is not — passing it `(annotations, camera, w, h)` is enough.
// Keeping the layout pure keeps the bake-worker eligibility check trivial:
// "does this file import any DOM/THREE/React symbol?" → no.

// ── Coordinate type ─────────────────────────────────────────────────────────

/** 2D point as a tuple — chosen over `{x, y}` for hot-path (avoids object
 *  allocation in the loop bodies; ~25 % faster for 1 000-label scenes). */
export type Vec2 = readonly [number, number];

// ── Renderer-facing DTO ─────────────────────────────────────────────────────

/**
 * Renderer DTO for a single plan-view annotation.  This is intentionally a
 * *flat* discriminated record (rather than four sub-types) so the host
 * adapter can build it inline from the schema-level `Annotation` element
 * without a switch-on-type wrapper.  Non-applicable fields are simply
 * `undefined`.
 *
 * Coordinate convention: every world-space field carries WORLD XZ where the
 * `[1]` (`y`) component is world-Z (matches the kernel's projection output).
 * The layout converts these to CSS-pixel canvas coords before returning.
 */
export interface AnnotationDto {
  readonly id: string;
  readonly type: 'text' | 'leader' | 'callout' | 'region';

  /** Free text (text/leader/callout body). */
  readonly text?: string;

  // ── text/tag ──────────────────────────────────────────────────────────────
  /** Anchor in WORLD XZ.  For text/tag this is the baseline-left position. */
  readonly anchor?: Vec2;
  /** Rotation in radians.  Applied around `anchor`. */
  readonly rotation?: number;
  /** Pre-resolved CSS-pixel font size (the host converts mm-on-sheet → px
   *  using the current camera scale).  Default: 11. */
  readonly fontSize?: number;
  readonly fontWeight?: 'normal' | 'bold';

  // ── leader ────────────────────────────────────────────────────────────────
  /** Leader waypoints in WORLD XZ.  Minimum 2 entries.  Last entry is the
   *  arrowhead position (touches the element); first entry is where the
   *  label sits. */
  readonly leaderPoints?: readonly Vec2[];

  // ── callout ───────────────────────────────────────────────────────────────
  /** Where the leader from the callout box terminates on the element
   *  (WORLD XZ). */
  readonly leaderPoint?: Vec2;
  /** Callout box dimensions in CSS px (sheet-stable). */
  readonly calloutBoxWidth?: number;
  readonly calloutBoxHeight?: number;

  // ── region ────────────────────────────────────────────────────────────────
  /** Polygon vertices in WORLD XZ; outer chain only (no holes). */
  readonly polygon?: readonly Vec2[];
  readonly fillColor?: string;
  readonly fillOpacity?: number;
  readonly strokeColor?: string;
}

// ── Layout output ───────────────────────────────────────────────────────────

/** A laid-out annotation.  All coordinates are in canvas CSS pixels (identity
 *  transform).  Discriminated by `type`; the matching sub-record is populated. */
export interface AnnotationLayout {
  readonly id: string;
  readonly type: 'text' | 'leader' | 'callout' | 'region';
  text?: {
    content: string;
    /** Mutable so the overlap-resolver can nudge.  Anchor is BASELINE-left in
     *  CSS-pixel canvas space. */
    anchor: [number, number];
    angle: number;
    fontSize: number;
    fontWeight: 'normal' | 'bold';
  };
  leader?: {
    points: Array<[number, number]>;
    arrowHead: [number, number];
    labelAnchor: [number, number];
    labelText: string;
  };
  callout?: {
    boxCorner: [number, number];
    boxWidth: number;
    boxHeight: number;
    text: string;
    leaderPoint: [number, number];
  };
  region?: {
    polygon: Array<[number, number]>;
    fillColor: string;
    fillOpacity: number;
    strokeColor: string;
  };
}

// ── Camera surface ──────────────────────────────────────────────────────────

/** Minimal projection surface required by the layout.  The host adapts a
 *  `PlanCamera` into this with a single closure — no coupling on the camera
 *  class itself (ADR-0024 §2 keeps the renderer-camera coupling at L4-pure). */
export interface LayoutCamera {
  /** Map a world-XZ point to canvas CSS-pixel coords (positive-Y down,
   *  the Z-flip is folded into this callback by the host). */
  readonly worldToCanvas: (worldXZ: Vec2) => Vec2;
}

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_FONT_SIZE = 11;
const DEFAULT_FONT_WEIGHT: 'normal' | 'bold' = 'normal';
const DEFAULT_CALLOUT_W = 80;
const DEFAULT_CALLOUT_H = 28;
const DEFAULT_FILL_COLOR = 'rgba(255, 220, 80, 0.18)';
const DEFAULT_STROKE_COLOR = '#a07a00';
const DEFAULT_FILL_OPACITY = 0.18;

/** Approximate glyph-width-to-fontSize ratio used by the overlap detector.
 *  Inter's typical "average advance width" is ~0.52 em; we round up slightly
 *  so the hit-test is conservative (it's better to nudge a label that wouldn't
 *  have collided than miss a real collision). */
const GLYPH_WIDTH_RATIO = 0.55;

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Compute the layout of every annotation in canvas CSS-pixel coords.
 *
 * Algorithm:
 *   1. Walk `annotations` once, dispatch on `type`, project world points
 *      through `camera.worldToCanvas`.
 *   2. Run a deterministic greedy overlap-resolution pass on text labels:
 *      for each text layout `i`, walk earlier text layouts `j < i`; if AABBs
 *      intersect, nudge `i.anchor.y` down by one line-height.  Repeat until
 *      no nudge is needed (max passes capped at `MAX_OVERLAP_PASSES` to
 *      prevent O(N³) worst-case if labels chain).
 *
 * Determinism: input order is preserved; no `Math.random()`, no `Date.now()`,
 * no Map/Set iteration (which is insertion-ordered but fragile to refactors).
 */
export function layoutAnnotations(
  annotations: readonly AnnotationDto[],
  camera: LayoutCamera,
  canvasWidth: number,
  canvasHeight: number,
): AnnotationLayout[] {
  const out: AnnotationLayout[] = [];
  for (const ann of annotations) {
    switch (ann.type) {
      case 'text':
        out.push(layoutText(ann, camera));
        break;
      case 'leader':
        out.push(layoutLeader(ann, camera));
        break;
      case 'callout':
        out.push(layoutCallout(ann, camera, canvasWidth, canvasHeight));
        break;
      case 'region':
        out.push(layoutRegion(ann, camera));
        break;
    }
  }
  resolveOverlaps(out, canvasWidth, canvasHeight);
  return out;
}

// ── Per-type layout primitives ──────────────────────────────────────────────

function layoutText(ann: AnnotationDto, camera: LayoutCamera): AnnotationLayout {
  const anchorWorld: Vec2 = ann.anchor ?? [0, 0];
  const [sx, sy] = camera.worldToCanvas(anchorWorld);
  return {
    id: ann.id,
    type: 'text',
    text: {
      content: ann.text ?? '',
      anchor: [sx, sy],
      angle: ann.rotation ?? 0,
      fontSize: ann.fontSize ?? DEFAULT_FONT_SIZE,
      fontWeight: ann.fontWeight ?? DEFAULT_FONT_WEIGHT,
    },
  };
}

function layoutLeader(ann: AnnotationDto, camera: LayoutCamera): AnnotationLayout {
  const worldPts = ann.leaderPoints ?? [];
  const projected: Array<[number, number]> = worldPts.map((p) => {
    const [x, y] = camera.worldToCanvas(p);
    return [x, y];
  });
  // Empty / single-point leaders degrade gracefully — produce an empty
  // layout entry rather than throwing.  Visual diff considers them missing
  // (which is the correct behaviour: an authoring pipeline that emits a
  // 1-point leader has a bug we should NOT mask in the renderer).
  const arrowHead: [number, number] = projected.length > 0
    ? projected[projected.length - 1]!
    : [0, 0];
  const labelAnchor: [number, number] = projected.length > 0
    ? projected[0]!
    : [0, 0];
  return {
    id: ann.id,
    type: 'leader',
    leader: {
      points: projected,
      arrowHead,
      labelAnchor,
      labelText: ann.text ?? '',
    },
  };
}

function layoutCallout(
  ann: AnnotationDto,
  camera: LayoutCamera,
  canvasWidth: number,
  canvasHeight: number,
): AnnotationLayout {
  const leaderWorld: Vec2 = ann.leaderPoint ?? ann.anchor ?? [0, 0];
  const [lx, ly] = camera.worldToCanvas(leaderWorld);
  const w = ann.calloutBoxWidth ?? DEFAULT_CALLOUT_W;
  const h = ann.calloutBoxHeight ?? DEFAULT_CALLOUT_H;
  // Default box position: 24 px above-left of the leader terminator,
  // clamped to the canvas so a callout near the right/top edge doesn't
  // render off-screen.
  const anchorWorld: Vec2 = ann.anchor ?? leaderWorld;
  const [ax, ay] = camera.worldToCanvas(anchorWorld);
  let bx = ax;
  let by = ay - h - 24;
  if (bx + w > canvasWidth)  bx = Math.max(0, canvasWidth - w);
  if (by < 0)                by = Math.min(canvasHeight - h, ay + 24);
  return {
    id: ann.id,
    type: 'callout',
    callout: {
      boxCorner: [bx, by],
      boxWidth: w,
      boxHeight: h,
      text: ann.text ?? '',
      leaderPoint: [lx, ly],
    },
  };
}

function layoutRegion(ann: AnnotationDto, camera: LayoutCamera): AnnotationLayout {
  const worldPoly = ann.polygon ?? [];
  const polygon: Array<[number, number]> = worldPoly.map((p) => {
    const [x, y] = camera.worldToCanvas(p);
    return [x, y];
  });
  return {
    id: ann.id,
    type: 'region',
    region: {
      polygon,
      fillColor: ann.fillColor ?? DEFAULT_FILL_COLOR,
      fillOpacity: ann.fillOpacity ?? DEFAULT_FILL_OPACITY,
      strokeColor: ann.strokeColor ?? DEFAULT_STROKE_COLOR,
    },
  };
}

// ── Overlap resolution (text labels only) ────────────────────────────────

const MAX_OVERLAP_PASSES = 6;

interface AABB {
  x0: number; y0: number;
  x1: number; y1: number;
}

function textAabb(text: NonNullable<AnnotationLayout['text']>): AABB {
  const w = Math.max(1, text.content.length) * text.fontSize * GLYPH_WIDTH_RATIO;
  const h = text.fontSize;
  // anchor is baseline-left; AABB extends upward by h.
  const [x, y] = text.anchor;
  return { x0: x, y0: y - h, x1: x + w, y1: y };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/**
 * Greedy O(P · N²) overlap resolver.  Mutates `layouts` in place (we own
 * the freshly-built array; callers do not retain references to mid-layout
 * AnnotationLayout objects).  Caps iterations at `MAX_OVERLAP_PASSES` so a
 * pathological all-overlapping cluster doesn't loop forever; the 6-pass
 * cap is enough for ~30 colliding labels in practice (each pass shifts at
 * least one label by 1.2× line-height, breaking the worst-case chain).
 */
function resolveOverlaps(
  layouts: AnnotationLayout[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  // Filter to text layouts only — leader/callout/region don't currently
  // participate in overlap resolution (deferred to S35 per the visual-diff
  // baseline; geometry-edge cases are out-of-scope for S32).
  const texts: NonNullable<AnnotationLayout['text']>[] = [];
  for (const l of layouts) {
    if (l.type === 'text' && l.text) texts.push(l.text);
  }
  if (texts.length < 2) return;

  for (let pass = 0; pass < MAX_OVERLAP_PASSES; pass++) {
    let nudged = false;
    for (let i = 1; i < texts.length; i++) {
      const ai = textAabb(texts[i]!);
      for (let j = 0; j < i; j++) {
        const aj = textAabb(texts[j]!);
        if (aabbOverlap(ai, aj)) {
          // Nudge i down by line-height.  Clamp to canvas so the label
          // doesn't drift off the bottom.
          const lineHeight = texts[i]!.fontSize * 1.2;
          const nextY = Math.min(canvasHeight, texts[i]!.anchor[1] + lineHeight);
          texts[i]!.anchor = [texts[i]!.anchor[0], nextY];
          nudged = true;
          break;
        }
      }
      // Lightweight clamp: if a wide label runs off the right edge, leave
      // it (clipping is the renderer's job; nudging horizontally would
      // mask text-overflow bugs at authoring time).
      void canvasWidth;
    }
    if (!nudged) return;
  }
}

// ── Test-only helpers (re-exported behind explicit names) ───────────────────

/** Exposed for unit tests so the AABB heuristic can be exercised directly
 *  without re-implementing the glyph-width ratio. */
export const __testHooks = Object.freeze({
  textAabb,
  aabbOverlap,
  GLYPH_WIDTH_RATIO,
});
