// @pryzm/plugin-sdk — Stores proxy contract (S62 D3).
//
// Plugins read project state through `stores.*`.  Reads are permission-
// gated by `read:project`.  All reads are snapshot-consistent — the host
// returns a frozen view that does not change underneath the caller; to
// observe changes, callers `subscribe()`.
//
// The element model exposed here is intentionally minimal — it is the
// SHAPE the marketplace SDK promises, not the full L4 element family
// schema.  Plugins that need richer per-family typing import the
// per-family `@pryzm/family-<x>` package.

/** Lightweight reference to an element; sufficient for most plugin use. */
export interface ElementRef {
  readonly id: string;
  /** `wall`, `door`, `window`, `slab`, … (per ADR-0017 §7 element catalog). */
  readonly kind: string;
  /** ULID of the level the element is hosted on, if applicable. */
  readonly levelId: string | null;
  /** Family-specific bounding-box / position fields (opaque to the SDK). */
  readonly bbox: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } | null;
}

/** A snapshot returned by `getElements()` / `getElement()`. */
export interface StoreSnapshot {
  /** Monotonic snapshot version; identical inputs return identical outputs. */
  readonly version: number;
  /** ISO timestamp the snapshot was taken at. */
  readonly takenAt: string;
}

/** Subscription handle returned by `subscribe()`. */
export interface StoreSubscription {
  /** Idempotent. */
  unsubscribe(): void;
}

/**
 * Permission-gated read access to project stores.  Every read is
 * snapshot-consistent within the call but the proxy is not a live ORM;
 * cross-store invariants must be observed across snapshots.
 *
 * Permission: `read:project` required for every method.
 */
export interface StoresProxy {
  /** Get all elements in the project; optionally filter by kind. */
  getElements(opts?: { kind?: string }): Promise<{
    readonly snapshot: StoreSnapshot;
    readonly elements: readonly ElementRef[];
  }>;

  /** Get a single element by id, or `null` if not present. */
  getElement(id: string): Promise<{
    readonly snapshot: StoreSnapshot;
    readonly element: ElementRef | null;
  }>;

  /**
   * Subscribe to store-change events.  Handler is invoked AT MOST once
   * per event-log batch (host coalesces 250 ms per the same window the
   * editor uses for re-bake — see ADR-0010).
   */
  subscribe(handler: (event: { snapshot: StoreSnapshot; changedKinds: readonly string[] }) => void): StoreSubscription;
}
