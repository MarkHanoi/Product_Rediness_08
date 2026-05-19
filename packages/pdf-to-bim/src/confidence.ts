/**
 * PDF-to-BIM extraction confidence model.
 *
 * Phase 3-B Sprint S60 Track A
 * (PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md §S60 lines 510-536)
 * per `[strategic ADR-029]` Part A.
 *
 * The model produces a single scalar in `[0, 1]` from three orthogonal factors:
 *   - **geometricFit**       — how cleanly the proposal matches expected geometry
 *                              (wall pair-spacing within COMMON_WALL_THICKNESSES_MM,
 *                               column aspect-ratio close to 1.0, door/window arc
 *                               radius matches opening width, …).
 *   - **symbolClarity**      — how unambiguously the source symbol was recognised
 *                              (door swing arc clean vs occluded by a furnishing,
 *                               column hatching pattern recognised, …).
 *   - **contextualPlausibility** — does the proposal make sense given its
 *                              neighbours (door is hosted by a wall pair of
 *                              compatible thickness; column sits on a grid
 *                              intersection; window aligns with a wall
 *                              reference plane).
 *
 * Aggregation is a **weighted geometric mean** so a single weak factor cannot
 * be hidden by two strong ones (geometric mean punishes outliers harder than
 * arithmetic mean). Weights — 0.5 / 0.3 / 0.2 — were taken verbatim from the
 * spec and confirmed against ADR-029 Part A.
 *
 * `shouldReview(c)` returns the boolean the review-queue UI checks: anything
 * below 0.85 is sent to the human reviewer; preview-gate at S70 requires
 * ≤ 30 % review rate so this threshold is the lever the team will tune
 * against the beta corpus during S60 D3.
 */

export type PdfBimElementKind = 'wall' | 'door' | 'window' | 'column';

export interface ConfidenceFactors {
  /** [0, 1] — geometric fit against canonical thickness / size / shape tables. */
  readonly geometricFit: number;
  /** [0, 1] — clarity of the source symbol (vector cleanness, occlusion). */
  readonly symbolClarity: number;
  /** [0, 1] — plausibility given the surrounding extracted elements. */
  readonly contextualPlausibility: number;
}

export interface ConfidencedElement<TProposal = unknown> {
  readonly kind: PdfBimElementKind;
  readonly proposal: TProposal;
  /** Aggregated confidence in `[0, 1]`. */
  readonly confidence: number;
  readonly factors: ConfidenceFactors;
}

/** Per-factor weights — must sum to 1.0. */
export const CONFIDENCE_WEIGHTS: Readonly<Record<keyof ConfidenceFactors, number>> = Object.freeze({
  geometricFit: 0.5,
  symbolClarity: 0.3,
  contextualPlausibility: 0.2,
});

/** Anything strictly below this threshold is sent to the review queue. */
export const REVIEW_THRESHOLD = 0.85;

/**
 * Bundle the three factors into a single weighted geometric mean.
 * The result is clamped to `[0, 1]` defensively in case a caller passes
 * an out-of-range input — the model is symmetric to noise but not to
 * NaN, so any non-finite factor short-circuits to `0` (fail-closed).
 */
export function aggregateConfidence(factors: ConfidenceFactors): number {
  const g = factors.geometricFit;
  const s = factors.symbolClarity;
  const c = factors.contextualPlausibility;
  if (!isFinite(g) || !isFinite(s) || !isFinite(c)) return 0;
  // Clamp inputs first so out-of-range values never produce NaN via Math.pow.
  const cg = clamp01(g);
  const cs = clamp01(s);
  const cc = clamp01(c);
  // Weighted geometric mean. `Math.pow(0, 0)` is 1, but a zero factor with
  // a non-zero weight still drives the product to zero — desired behaviour.
  const product =
    Math.pow(cg, CONFIDENCE_WEIGHTS.geometricFit) *
    Math.pow(cs, CONFIDENCE_WEIGHTS.symbolClarity) *
    Math.pow(cc, CONFIDENCE_WEIGHTS.contextualPlausibility);
  return clamp01(product);
}

/** Construct a `ConfidencedElement` from raw factors + a kind + the underlying proposal. */
export function makeConfidenced<T>(
  kind: PdfBimElementKind,
  proposal: T,
  factors: ConfidenceFactors,
): ConfidencedElement<T> {
  return { kind, proposal, confidence: aggregateConfidence(factors), factors };
}

/** Review-queue gate — `true` means a human must look before commit. */
export function shouldReview(confidence: number): boolean {
  return confidence < REVIEW_THRESHOLD;
}

/**
 * Bucket an element list into auto-accept vs review-queue partitions.
 * The auto-accept bucket is what the importer commits silently;
 * the review bucket feeds the S60 D2 review-queue UI.
 */
export interface PartitionedElements<T> {
  readonly autoAccept: ConfidencedElement<T>[];
  readonly review: ConfidencedElement<T>[];
}

export function partitionByConfidence<T>(
  elements: readonly ConfidencedElement<T>[],
): PartitionedElements<T> {
  const autoAccept: ConfidencedElement<T>[] = [];
  const review: ConfidencedElement<T>[] = [];
  for (const el of elements) {
    if (shouldReview(el.confidence)) review.push(el);
    else autoAccept.push(el);
  }
  return { autoAccept, review };
}

/**
 * Diagnostic statistics for the S60 D3 threshold-tuning loop.
 * `meanConfidence` and per-bucket counts feed the bench report tables.
 */
export interface ConfidenceStats {
  readonly count: number;
  readonly autoAcceptCount: number;
  readonly reviewCount: number;
  /** Fraction of input that ends up in the review queue — the K3B-D kill-switch metric. */
  readonly reviewRate: number;
  readonly meanConfidence: number;
  /** Per-kind histogram so we can spot which extractor is the worst offender. */
  readonly perKind: Readonly<Record<PdfBimElementKind, { count: number; reviewCount: number }>>;
}

export function summariseConfidence<T>(
  elements: readonly ConfidencedElement<T>[],
): ConfidenceStats {
  const perKind: Record<PdfBimElementKind, { count: number; reviewCount: number }> = {
    wall: { count: 0, reviewCount: 0 },
    door: { count: 0, reviewCount: 0 },
    window: { count: 0, reviewCount: 0 },
    column: { count: 0, reviewCount: 0 },
  };
  let total = 0;
  let autoAccept = 0;
  let review = 0;
  for (const el of elements) {
    const bucket = perKind[el.kind];
    bucket.count += 1;
    if (shouldReview(el.confidence)) {
      bucket.reviewCount += 1;
      review += 1;
    } else {
      autoAccept += 1;
    }
    total += el.confidence;
  }
  const count = elements.length;
  return {
    count,
    autoAcceptCount: autoAccept,
    reviewCount: review,
    reviewRate: count === 0 ? 0 : review / count,
    meanConfidence: count === 0 ? 0 : total / count,
    perKind,
  };
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
