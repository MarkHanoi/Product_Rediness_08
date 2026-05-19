// @pryzm/ai-host — PlanCritique types (S51 D2 + D4).
//
// Spec source:
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S51
//     lines 322-403 ("AI Plan-View Critique Surface").
//   • SPEC-07 §3 — visibility-state schema.
//   • SPEC-28 §3 — per-call cost ceiling ($0.18).
//
// PURE types. The `PlanViewSnapshot` + `VisibilityState` are
// duck-typed minimal subsets so the ai-host package doesn't have
// to drag the full @pryzm/stores / @pryzm/scene-graph types into
// its public surface. The editor passes a subset that satisfies
// these shapes; the workflow impl never reaches into anything not
// listed here.

/** A single visible element observed in the snapshot. The full
 *  scene-graph node has hundreds of fields — for plan critique we
 *  only need the geometry + identity, plus optionally semantic tags
 *  the AI can reason about (e.g. "wall", "door", "shelf"). */
export interface SnapshotElement {
  readonly id: string;
  /** Semantic kind — 'wall' | 'door' | 'window' | 'column' | 'shelf'
   *  | 'fixture' | 'note' | 'other'. Free-form here so plugin-defined
   *  types pass through. */
  readonly kind: string;
  /** AABB in millimetres, plan-projected. `[minX, minY, maxX, maxY]`. */
  readonly bbox: readonly [number, number, number, number];
  /** Optional centroid — speeds up "show in plan" jump action. */
  readonly centroid?: readonly [number, number];
  /** Optional human-readable label/tag for the LLM context. */
  readonly label?: string;
  /** Optional plan-attribute payload (door-swing-direction, wall
   *  thickness, etc.). The LLM is told to treat these as informative
   *  but not authoritative. */
  readonly attrs?: Readonly<Record<string, unknown>>;
}

/** Snapshot of a single plan view, as captured by `WorkflowCtx`
 *  per spec line 349. Currently the snapshot is built editor-side
 *  and shipped through the workflow input — the AiPlane never reaches
 *  back into the L7 scene graph. */
export interface PlanViewSnapshot {
  readonly viewId: string;
  /** Plan viewport in mm: `[minX, minY, maxX, maxY]`. */
  readonly viewportBounds: readonly [number, number, number, number];
  /** Pixel size at viewport — useful for the LLM to reason about
   *  drawing scale. */
  readonly pixelSize: Readonly<{ width: number; height: number }>;
  /** Visible elements at the time of capture. */
  readonly elements: readonly SnapshotElement[];
  /** Capture clock (ms since epoch). */
  readonly capturedAt: number;
}

/** Visibility-state subset per SPEC-07 §3. Each entry carries the
 *  visibility decision the editor applied to the matching tag, so
 *  the LLM can reason about *why* an element was shown. */
export interface VisibilityState {
  /** Tag → visible flag mapping (e.g. `{ "wall": true, "shelf": true }`). */
  readonly tags: Readonly<Record<string, boolean>>;
  /** The active visibility-intent at capture time — `'design'` |
   *  `'review'` | `'export'` | (free-form). */
  readonly intent: string;
}

/** A single critique surfaced by the LLM. The shape is verbatim
 *  the public schema — the parser drops anything that doesn't
 *  fit. */
export type CritiqueSeverity = 'info' | 'warning' | 'error';

export type CritiqueLocationRef =
  | Readonly<{ kind: 'element'; elementId: string }>
  | Readonly<{ kind: 'point'; x: number; y: number }>;

export interface CritiqueItem {
  readonly id: string;
  readonly severity: CritiqueSeverity;
  /** Free-form category tag — `'door-clearance'`, `'corridor-width'`,
   *  `'visibility'`, etc. The approval-queue UI uses this for
   *  grouping. */
  readonly category: string;
  /** One-sentence human-readable description. */
  readonly message: string;
  /** Where the item is anchored in plan space — used by the
   *  "show in plan" jump action per spec line 389. */
  readonly locationRef: CritiqueLocationRef;
  /** Confidence in the critique [0, 1]. The UI renders this as a
   *  badge ("low confidence — review carefully"). */
  readonly confidence: number;
}

/** Workflow result. Mirrors the spec line 348 return type. */
export type CritiqueResult =
  | Readonly<{ status: 'ok'; itemCount: number; items: readonly CritiqueItem[] }>
  | Readonly<{ status: 'rejected'; reason: string }>;

/** Per-call cost cap for plan-critique. Lower than the global
 *  per-call ceiling ($0.18) per phase doc line 343 (descriptor
 *  estimate $0.05) and exit-criteria line 402 (≤ $0.06 measured). */
export const PLAN_CRITIQUE_COST_USD_ESTIMATE = 0.05;

/** Maximum critique items the parser will accept per call — guards
 *  against a runaway model emitting hundreds. Approval-queue UI is
 *  designed for ≤ 20 items per workflow run. */
export const PLAN_CRITIQUE_MAX_ITEMS = 20;
