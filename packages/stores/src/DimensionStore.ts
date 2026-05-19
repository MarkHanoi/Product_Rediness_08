// DimensionStore — manually-placed DimensionStrings + per-view auto-dim
// settings + user-pinned overrides.
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md`
//     — "DimensionStore additions" block (line 830) called out for S31 in the
//     supplement; backfilled at S35 alongside the live host wiring per the
//     S34 supplement note in `PROCESS-TRACKER.md`.
//
// SHAPE
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors the supplement's `DimensionState` definition:
//
//   * dimensions  : Map<DimensionId, DimensionString>  — manually-placed dims
//                   (S39+ live rendering hook; S35 only consumes the auto-dim
//                   pipeline, so this map exists but is intentionally untouched
//                   by the host's auto-dim seam).
//   * overrides   : Map<DimensionId, number>           — user-pinned values
//                   that override the geometric value at evaluation time.
//   * viewSettings: Map<ViewId, DimensionViewSettings> — per-view auto-dim
//                   mode + offset + showOverall flag.  The
//                   `PlanViewCanvasHost.commitAutoDimensions` seam reads this
//                   per frame to decide which auto-dim modes to fire.
//
// DIRTY-EVENT SEMANTICS
// ─────────────────────────────────────────────────────────────────────────────
// `dimensions` reuses the inherited `Store<DimensionString>.subscribeDirty`
// (Immer-patch driven, set-diff payload).  `overrides` and `viewSettings`
// each have their own listener bus exposed via
// `subscribeOverridesDirty` and `subscribeViewSettingsDirty` — the host
// subscribes to the latter so a mode switch invalidates the canvas.
// Listener payloads are intentionally minimal (`Set<id>`) — consumers reach
// back via the getters for the latest snapshot.

import { Store } from './Store.js';
import type { Disposer } from './types.js';
import type {
  DimensionString,
  DimensionAutoMode,
} from '@pryzm/schemas/annotation/dimension';

// ── Per-view auto-dim settings ─────────────────────────────────────────────
//
// The supplement's `DimensionViewSettings` block uses `'off'` as a sentinel
// for "auto-dim disabled for this view"; we union it with the
// `DimensionAutoMode` enum here so the host can switch on a single value.

/** Auto-dim mode value INCLUDING the `'off'` sentinel for a disabled view. */
export type DimensionAutoModeOrOff = DimensionAutoMode | 'off';

/**
 * Per-view auto-dim settings — read by `PlanViewCanvasHost.commitAutoDimensions`
 * each frame.  All fields except `autoDimensionMode` have sensible defaults.
 */
export interface DimensionViewSettings {
  /** Which auto-dim mode to run for this view; `'off'` skips the pipeline. */
  readonly autoDimensionMode: DimensionAutoModeOrOff;
  /** When true, also emit overall (chain-spanning) dimensions.  Default false. */
  readonly showOverallDimensions?: boolean;
  /** Offset (mm) from geometry to dim line — overrides the producer's mode default. */
  readonly autoDimensionOffset?: number;
}

// ── Shared id type ─────────────────────────────────────────────────────────

export type DimensionId = DimensionString['id'];

// ── Internal listener bus shapes ───────────────────────────────────────────

type IdSetListener = (changed: ReadonlySet<string>) => void;
type ViewSettingsListener = (changed: ReadonlySet<string>) => void;

const EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());

// ── Store ──────────────────────────────────────────────────────────────────

export class DimensionStore extends Store<DimensionString> {
  // Side maps (the supplement's `DimensionState` bundles them; we keep them
  // adjacent here so a single store handle owns all dimension-related state).
  private readonly _overrides: Map<string, number> = new Map();
  private readonly _viewSettings: Map<string, DimensionViewSettings> = new Map();

  private readonly _overrideListeners: Set<IdSetListener> = new Set();
  private readonly _viewSettingsListeners: Set<ViewSettingsListener> = new Set();

  constructor() { super('dimension'); }

  // ── overrides API ────────────────────────────────────────────────────────

  /** Returns the user-pinned override (mm) for a dimension, or `undefined`. */
  getOverride(id: DimensionId): number | undefined {
    return this._overrides.get(id as string);
  }

  /**
   * Pin a dimension to a numeric value (mm).  Notifies override listeners
   * only if the new value differs from the existing one (or no entry existed).
   */
  setOverride(id: DimensionId, valueMm: number): void {
    if (!Number.isFinite(valueMm)) {
      throw new Error('[DimensionStore] override value must be a finite number (mm)');
    }
    const key = id as string;
    if (this._overrides.get(key) === valueMm) return;
    this._overrides.set(key, valueMm);
    this._notifyOverrides(new Set([key]));
  }

  /** Remove a pin.  No-op if the id wasn't pinned. */
  clearOverride(id: DimensionId): void {
    const key = id as string;
    if (!this._overrides.has(key)) return;
    this._overrides.delete(key);
    this._notifyOverrides(new Set([key]));
  }

  /** Read-only snapshot of the overrides map.  Identity stable across calls. */
  getOverrides(): ReadonlyMap<string, number> { return this._overrides; }

  /** Subscribe to override mutations.  Returns a Disposer. */
  subscribeOverridesDirty(listener: IdSetListener): Disposer {
    this._overrideListeners.add(listener);
    return () => { this._overrideListeners.delete(listener); };
  }

  // ── view-settings API ────────────────────────────────────────────────────

  /** Read the per-view auto-dim settings, or `undefined` if none stored. */
  getViewSettings(viewId: string): DimensionViewSettings | undefined {
    return this._viewSettings.get(viewId);
  }

  /**
   * Set per-view settings.  Notifies subscribers only when at least one
   * field actually changed (cheap shallow compare — `DimensionViewSettings`
   * is a flat object).
   */
  setViewSettings(viewId: string, settings: DimensionViewSettings): void {
    if (typeof viewId !== 'string' || viewId.length === 0) {
      throw new Error('[DimensionStore] viewId must be a non-empty string');
    }
    const prev = this._viewSettings.get(viewId);
    if (prev && shallowEqualViewSettings(prev, settings)) return;
    // Freeze so consumers don't mutate the stored object.
    this._viewSettings.set(viewId, Object.freeze({ ...settings }));
    this._notifyViewSettings(new Set([viewId]));
  }

  /** Drop the per-view settings entry.  No-op if absent. */
  clearViewSettings(viewId: string): void {
    if (!this._viewSettings.has(viewId)) return;
    this._viewSettings.delete(viewId);
    this._notifyViewSettings(new Set([viewId]));
  }

  /** Read-only snapshot of the per-view settings map. */
  getAllViewSettings(): ReadonlyMap<string, DimensionViewSettings> {
    return this._viewSettings;
  }

  /** Subscribe to view-settings mutations.  Returns a Disposer. */
  subscribeViewSettingsDirty(listener: ViewSettingsListener): Disposer {
    this._viewSettingsListeners.add(listener);
    return () => { this._viewSettingsListeners.delete(listener); };
  }

  // ── inherited clear() override ───────────────────────────────────────────
  //
  // The base `Store.clear()` only wipes the dimensions map.  We extend it so
  // a wholesale reset (test bootstrap, project close) zeroes the side maps
  // too — and emits a single notification per affected listener bus.

  override clear(): void {
    super.clear();
    if (this._overrides.size > 0) {
      const ids = new Set(this._overrides.keys());
      this._overrides.clear();
      this._notifyOverrides(ids);
    }
    if (this._viewSettings.size > 0) {
      const ids = new Set(this._viewSettings.keys());
      this._viewSettings.clear();
      this._notifyViewSettings(ids);
    }
  }

  // ── Internal notify helpers ──────────────────────────────────────────────

  private _notifyOverrides(changed: ReadonlySet<string>): void {
    if (changed.size === 0) return;
    for (const l of [...this._overrideListeners]) l(changed);
  }

  private _notifyViewSettings(changed: ReadonlySet<string>): void {
    if (changed.size === 0) return;
    for (const l of [...this._viewSettingsListeners]) l(changed);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function shallowEqualViewSettings(
  a: DimensionViewSettings,
  b: DimensionViewSettings,
): boolean {
  return (
    a.autoDimensionMode === b.autoDimensionMode &&
    (a.showOverallDimensions ?? false) === (b.showOverallDimensions ?? false) &&
    (a.autoDimensionOffset ?? null) === (b.autoDimensionOffset ?? null)
  );
}

// Re-export the empty sentinel for tests / debugging callers that want to
// distinguish "no listeners fired" from "fired with no payload".
export const DIMENSION_STORE_EMPTY_SET = EMPTY_SET;
