// View registry — the lookup the CompositeViewRenderer hits per frame
// (S40 / Phase 2C).
//
// Implementations are owned by the orchestrator.  This module ships
// `MapViewRegistry`, an in-memory ref impl that's enough for the editor
// + tests; the export worker can use the same impl seeded from the
// project store.

import type { ViewKind, ViewSource } from './view-source.js';

export interface ViewRegistryEntry {
  readonly kind: ViewKind;
  readonly source: ViewSource;
  /** Optional human label — the host paints it in the loading skeleton
   *  when the source is missing. */
  readonly label?: string;
}

export interface ViewRegistry {
  /** Lookup the entry for a viewId.  Returns undefined when the view
   *  has been deleted or is still loading. */
  get(viewId: string): ViewRegistryEntry | undefined;
  /** All registered view ids — used by the orchestrator to populate
   *  the "drag a view onto the sheet" palette. */
  list(): readonly string[];
  /** Subscribe to dirty signals.  The listener is fired with the
   *  affected viewId whenever (a) a view is added/removed/replaced,
   *  or (b) the underlying model the view depends on changes.
   *  Returns a disposer. */
  subscribe(listener: (viewId: string) => void): () => void;
}

/** Reference in-memory ViewRegistry — used by the editor wiring + every
 *  test.  Thread-safe within a single JS realm (single-threaded). */
export class MapViewRegistry implements ViewRegistry {
  private readonly entries = new Map<string, ViewRegistryEntry>();
  private readonly listeners = new Set<(viewId: string) => void>();

  get(viewId: string): ViewRegistryEntry | undefined {
    return this.entries.get(viewId);
  }

  list(): readonly string[] {
    return Array.from(this.entries.keys());
  }

  /** Register or replace a source for a viewId.  Fires dirty(viewId). */
  set(viewId: string, entry: ViewRegistryEntry): void {
    if (typeof viewId !== 'string' || viewId.length === 0) {
      throw new Error('[MapViewRegistry] viewId must be a non-empty string');
    }
    this.entries.set(viewId, entry);
    this.fire(viewId);
  }

  /** Remove a source.  Fires dirty(viewId). */
  remove(viewId: string): void {
    if (this.entries.delete(viewId)) this.fire(viewId);
  }

  /** Mark a viewId as model-dirty without changing its source.  The
   *  orchestrator wires its model stores' dirty signals to this. */
  markDirty(viewId: string): void {
    this.fire(viewId);
  }

  subscribe(listener: (viewId: string) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private fire(viewId: string): void {
    for (const l of this.listeners) {
      try { l(viewId); }
      catch (err) {
        // Listener errors must not break the dirty-fan-out for other
        // listeners (e.g. multiple sheet hosts open).
        // eslint-disable-next-line no-console
        console.warn('[MapViewRegistry] listener threw', err);
      }
    }
  }
}
