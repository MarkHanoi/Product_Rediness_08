// @pryzm/ai-worker — PDF-to-BIM Stage 2 types (S51 Track B).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §3.2
//     (lines 848-1093) — Wall + Column Classification.
//   • SPEC-45 §2.3 — vectorisation stage that feeds Stage 2.
//   • ADR-029 Part A — 7-kind page taxonomy + per-stage cost
//     allocations.
//
// Pure types — DOM/Three/native-dep free so they can be imported
// from the bake worker, the cost meter, the AI host, and the
// editor's L7.5 surface alike.

/** A single vector primitive extracted from a PDF page during
 *  Stage 1 (vectorisation). Coordinates are in PDF points (1/72
 *  inch) until Stage 2 multiplies them by `scaleFactor` to land
 *  in millimetres. */
export interface VectorElement {
  readonly kind: 'line' | 'polyline' | 'polygon' | 'arc' | 'circle';
  /** Control points in PDF points — `[x, y]` pairs. For `'line'` the
   *  array has length 2; for `'polyline'` / `'polygon'` it has the
   *  vertices in draw order; for `'circle'` / `'arc'` it has
   *  `[center, edgePoint]` (and for arc, an `endPoint` after that). */
  readonly points: ReadonlyArray<readonly [number, number]>;
  /** True iff the primitive forms a closed shape (last point joins
   *  the first). Lines are never closed; polygons always are. */
  readonly closed?: boolean;
  /** Optional PDF stroke width in points — used by Stage 1 to filter
   *  hatching / shading lines that don't survive into Stage 2. */
  readonly strokeWidth?: number;
}

/** Per-page decomposition output from Stage 1 (SPEC-45 §2.2 +
 *  §2.3). Stage 2 consumes this. */
export interface PageDecomposition {
  readonly pageId: string;
  /** Page width in PDF points. */
  readonly pageWidthPt: number;
  /** Page height in PDF points. */
  readonly pageHeightPt: number;
  /** All vector primitives on the page. */
  readonly vectors: readonly VectorElement[];
  /** Optional pre-classified text annotations (door tags, room
   *  labels). Stage 2 uses these as evidence for confidence
   *  scoring; Stage 3 (S55) uses them more heavily. */
  readonly textAnnotations?: ReadonlyArray<{
    readonly text: string;
    readonly bbox: readonly [number, number, number, number]; // PDF pt
  }>;
}

/** A wall candidate — the parallel-pair of source lines + the
 *  derived centerline + thickness. Per spec lines 1080-1086. */
export interface WallCandidate {
  /** Centerline polyline in millimetres. For the parallel-pair
   *  detector this is always 2 points (start, end). Future
   *  stitch-pass at S55 may produce > 2 points. */
  readonly centerLine: ReadonlyArray<readonly [number, number]>;
  /** Wall thickness in millimetres (perpendicular spacing of the
   *  source pair). Range: 50–600 mm per spec line 917. */
  readonly thickness: number;
  /** Confidence [0, 1] from `computeWallConfidence`. */
  readonly confidence: number;
  /** Source line 1 (the side closer to the page origin along the
   *  perpendicular axis). Useful for debug overlays. */
  readonly pairLine1: ClassifiedLine;
  /** Source line 2 (the far side). */
  readonly pairLine2: ClassifiedLine;
}

/** A column candidate — the closed-rectangle source + derived
 *  position + size. Per spec lines 1088-1093. */
export interface ColumnCandidate {
  /** Centroid position in millimetres. */
  readonly position: readonly [number, number];
  /** Width along x in millimetres. */
  readonly width: number;
  /** Depth along y in millimetres. */
  readonly depth: number;
  /** Confidence [0, 1] from `computeColumnConfidence`. */
  readonly confidence: number;
}

/** A classified line, internal to the Stage 2 algorithm but
 *  exposed for unit tests + debug overlays. */
export interface ClassifiedLine {
  readonly p1: readonly [number, number]; // mm from page origin
  readonly p2: readonly [number, number];
  readonly angle: number;                  // radians, normalised 0–π
  readonly length: number;                 // mm
}

/** Aggregate output of all Stage 2 classifications for a single
 *  page. SPEC-45 §2 lists this as the input to Stage 3 (door /
 *  window matching, S58) and Stage 4 (review queue, S60). */
export interface ClassifiedLayer {
  readonly pageId: string;
  readonly walls: readonly WallCandidate[];
  readonly columns: readonly ColumnCandidate[];
  /** Per-class precision/recall estimates from the classifier's
   *  internal model — populated only when the algorithm has access
   *  to ground truth (test fixtures). In production these are
   *  derived from the cumulative `pryzm.pdf.stage2.*` telemetry. */
  readonly metrics?: Readonly<{
    wallsCount: number;
    columnsCount: number;
    avgWallConfidence: number;
    avgColumnConfidence: number;
  }>;
}

/** Telemetry attribute namespace per VI-AI-ELEMENT-CREATOR §3 line
 *  2217 + the OTel exit criterion at line 1102. Exported as a const
 *  so the bench + handler share one source of truth. */
export const STAGE2_OTEL_NAMESPACE = 'pryzm.pdf.stage2' as const;

// ─── S52 §4.2 — Door / window symbol matching types ───────────────────────

/** Opening subtype string union — door / window flavours the
 *  default symbol library produces. Free-form-extended so plugin
 *  libraries can add subtypes (e.g. `'sliding-3-panel'`) without
 *  an ai-worker change. */
export type OpeningSubtype = string;

/** A single opening (door or window) detected in the page's vector
 *  data per spec lines 1475-1482. */
export interface OpeningCandidate {
  readonly kind: 'door' | 'window';
  /** Free-form subtype (e.g. `'single-swing-90'`, `'casement-2-pane'`). */
  readonly subtype: OpeningSubtype;
  /** Position in millimetres (door: arc center; window: midpoint
   *  between the two glazing lines). */
  readonly position: readonly [number, number];
  /** Opening width in millimetres (door: arc radius = panel
   *  length; window: glazing-line overlap length). */
  readonly openingWidthMm: number;
  /** The host wall's centerline — same shape as
   *  `WallCandidate.centerLine`. */
  readonly hostWallCenterLine: ReadonlyArray<readonly [number, number]>;
  /** Confidence [0, 1] from `matchDoorTemplate` /
   *  `detectWindowBreaks`. */
  readonly confidence: number;
}

/** Internal arc descriptor used by `findArcs` + `matchDoorTemplate`
 *  per spec lines 1467-1473. */
export interface ArcDescriptor {
  /** Arc center in PDF points (1/72 inch). */
  readonly center: readonly [number, number];
  /** Arc radius in PDF points. */
  readonly radius: number;
  /** Start angle in radians (atan2). */
  readonly startAngle: number;
  /** End angle in radians (atan2). */
  readonly endAngle: number;
  /** The source `VectorElement` so caller can correlate back. */
  readonly rawVector: VectorElement;
}

/** A normalised feature inside a `SymbolTemplate` per spec lines
 *  1313-1323. Coordinates are in 0..1 normalised space. */
export interface SymbolFeature {
  readonly kind: 'arc' | 'line' | 'rectangle';
  readonly center?: readonly [number, number];
  readonly radius?: number;
  readonly startAngle?: number;
  readonly endAngle?: number;
  readonly p1?: readonly [number, number];
  readonly p2?: readonly [number, number];
}

/** A door / window symbol template per spec lines 1303-1311. */
export interface SymbolTemplate {
  readonly id: string;
  readonly kind: 'door' | 'window';
  readonly subtype: OpeningSubtype;
  /** Normalised features (0..1 space). */
  readonly features: readonly SymbolFeature[];
  /** Anchor point in normalised space (door: hinge; window: center). */
  readonly anchor: readonly [number, number];
  /** Which normalised axis carries the opening width. */
  readonly openingWidthAxis: 'x' | 'y';
  /** Optional canonical opening width in millimetres — when set,
   *  `matchDoorTemplate` boosts confidence when the arc radius
   *  matches the hint within 10%. */
  readonly openingWidthMmHint?: number;
}
