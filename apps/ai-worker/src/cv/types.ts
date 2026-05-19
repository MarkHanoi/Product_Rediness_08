// @pryzm/ai-worker — CV pipeline types (S50 D1).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S50 lines 222-320. Companion to ADR-029 Part A and SPEC-45
// (PDF-to-BIM Pipeline).
//
// All types are pure (no DOM / Three / native deps) so:
//   • the bake worker can import them,
//   • the cost meter can attach them to ai_usage rows,
//   • the public AI API (S53) can serialise them to plugin authors.

/** Page kinds per ADR-029 Part A. The classifier produces one of
 *  these labels for every page in the input PDF set. Only `'plan'`
 *  pages are routed onward to the segmentation stage at S50; the
 *  other kinds are deferred to S55+ (sections / elevations) and
 *  S58+ (schedules / titleblocks). */
export type PageKind =
  | 'plan'
  | 'section'
  | 'elevation'
  | 'detail'
  | 'schedule'
  | 'titleblock'
  | 'other';

/** Minimal page representation handed to the CV pipeline. The page
 *  is opaque to most of the pipeline — only the model adapters
 *  (page-classification + floorplan-segmentation) interpret the
 *  pixel buffer. The `meta` block carries the labels the mock
 *  classifier reads while the real Vision call is still deferred to
 *  S52 per ADR-029 phase rollout. */
export interface PdfPage {
  readonly id: string;
  readonly projectId: string;
  /** 1-indexed page number inside the source PDF. */
  readonly pageNumber: number;
  /** Page raster size in pixels at extraction DPI (200 default per
   *  SPEC-45 §2.1). */
  readonly width: number;
  readonly height: number;
  /** Optional raster bytes — present in production, omitted in tests
   *  that drive the deterministic mock path. */
  readonly pixels?: Uint8Array;
  /** Optional metadata used by the deterministic mock classifier.
   *  Real PDFs carry these labels in the title block; the Vision
   *  model reads them at S52. */
  readonly meta?: {
    readonly title?: string;
    readonly drawingType?: string;
    readonly scale?: string;
  };
}

/** Result of `classifyPage`. Confidence is in `[0, 1]`; the handler
 *  applies the SPEC-45 §2.1 threshold (0.7) before routing the page
 *  to segmentation. */
export interface PageClassification {
  readonly kind: PageKind;
  readonly confidence: number;
  /** Optional rationale string for the review queue. */
  readonly rationale?: string;
}

/** A binary mask produced by the segmentation stage. `data[i]` is
 *  `1` for "wall pixel" and `0` for "background"; the mask is row-
 *  major in `(width * height)` shape. The next pipeline stage
 *  (vectorization at S55) walks this mask to recover wall polylines. */
export interface BinaryMask {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Output of the segmentation model. */
export interface SegmentationResult {
  readonly mask: BinaryMask;
  /** Approximate "wall pixel" coverage as a sanity ratio for the
   *  cost auditor — typical floor plans land between 0.05 and 0.25. */
  readonly wallCoverage: number;
  /** Inference wall-clock in ms (the handler combines this with
   *  classifier time + storage upload time for `recordCall`). */
  readonly inferenceMs: number;
}

/** Runtime selection per SPEC-15 §2.4: GPU preferred, CPU fallback. */
export type ModelRuntimeKind = 'gpu' | 'cpu';

/** Adapter interface every model implementation satisfies. The
 *  classifier and segmentation modules each consume this — keeping
 *  the porter pattern lets us swap ONNX-CUDA / ONNX-CPU / a remote
 *  Sonnet+Vision relay without touching the handler. */
export interface ModelRuntime {
  readonly kind: ModelRuntimeKind;
  readonly version: string;
  /** True if the runtime is the deterministic mock used in tests +
   *  the S50 dev path. The real ONNX adapter sets this to `false`. */
  readonly mock: boolean;
}

/** Storage porter for intermediate CV artifacts (raster pages,
 *  masks). R2 in production; in-memory in dev/test. The porter is
 *  selected by env per `apps/ai-worker/src/cv/storage.ts`. */
export interface StoragePorter {
  /** Upload a payload to project-scoped storage. Returns a stable
   *  URL the next pipeline stage can fetch. */
  upload(opts: {
    readonly projectId: string;
    readonly key: string;
    readonly contentType: string;
    readonly bytes: Uint8Array;
  }): Promise<string>;

  /** Fetch a previously-uploaded payload. */
  fetch(url: string): Promise<Uint8Array>;

  /** True if the porter is the in-memory dev fallback. */
  readonly inMemory: boolean;
}

/** Env shape for the CV runtime + storage selectors. */
export interface CvEnv {
  /** Force a specific runtime; defaults to auto-detect. */
  readonly PRYZM_AI_CV_RUNTIME?: 'gpu' | 'cpu' | 'mock' | undefined;
  /** Set to a non-empty value to use the GPU adapter. */
  readonly CUDA_VISIBLE_DEVICES?: string | undefined;
  /** Set to a non-empty value to enable the R2 storage adapter. */
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

/** Job payload routed through the BullMQ queue for one PDF page. */
export interface FloorplanSegJob {
  readonly projectId: string;
  readonly pdfPageUrl: string;
  /** SPEC-45 §3 per-page hard cap (default $0.05). */
  readonly costBudget: number;
  /** Optional explicit page metadata (when the page raster is
   *  supplied separately). */
  readonly page?: PdfPage;
}

/** Outcome of one floorplan-segmentation handler invocation. */
export type FloorplanSegOutcome =
  | {
      readonly status: 'ok';
      readonly maskUrl: string;
      readonly classification: PageClassification;
      readonly costUsd: number;
      readonly durationMs: number;
      readonly wallCoverage: number;
    }
  | {
      readonly status: 'skipped';
      readonly reason: string;
      readonly classification: PageClassification;
    }
  | {
      readonly status: 'rejected';
      readonly reason: string;
    };
