// UndoStack — runtime.undoStack slot.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phases
// C.6.02 (undo) and C.6.03 (redo).
//
// Phase-C initial impl wraps the existing PRYZM-1
// `(window as any).commandManager.{undo,redo}` so platform UI can flip
// its imports to `runtime.undoStack.{undo,redo}` today without waiting
// for the full Immer reverse-apply machinery.
//
// Phase D will swap `LegacyCommandManagerAdapter` for a real backend
// driven by `runtime.persistence.eventLog`'s per-event inverse patches
// + the L2 CommandBus's transactional grouping, retiring the
// `(window as any).commandManager` global entirely.

export interface UndoStackState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoCount: number;
  readonly redoCount: number;
}

export interface UndoStackSubscription {
  dispose(): void;
}

export interface UndoStackBackend {
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  undoCount(): number;
  redoCount(): number;
  subscribe(listener: () => void): UndoStackSubscription;
}

export class UndoStack {
  private readonly backend: UndoStackBackend;
  private readonly subs = new Set<(state: UndoStackState) => void>();
  private backendDispose: UndoStackSubscription | null = null;
  private currentState: UndoStackState;

  constructor(backend: UndoStackBackend) {
    this.backend = backend;
    this.currentState = this.snapshot();
    this.backendDispose = backend.subscribe(() => {
      this.currentState = this.snapshot();
      for (const s of this.subs) {
        try { s(this.currentState); }
        catch (err) { console.error('[runtime-undo-stack] subscriber threw:', err); }
      }
    });
  }

  get state(): UndoStackState { return this.currentState; }

  canUndo(): boolean { return this.backend.canUndo(); }
  canRedo(): boolean { return this.backend.canRedo(); }

  undo(): void { if (this.backend.canUndo()) this.backend.undo(); }
  redo(): void { if (this.backend.canRedo()) this.backend.redo(); }

  subscribe(listener: (state: UndoStackState) => void): UndoStackSubscription {
    this.subs.add(listener);
    listener(this.currentState);
    return {
      dispose: (): void => {
        this.subs.delete(listener);
      },
    };
  }

  /** Idempotent — disposes the backend subscription and clears listeners. */
  dispose(): void {
    this.backendDispose?.dispose();
    this.backendDispose = null;
    this.subs.clear();
  }

  private snapshot(): UndoStackState {
    return Object.freeze({
      canUndo: this.backend.canUndo(),
      canRedo: this.backend.canRedo(),
      undoCount: this.backend.undoCount(),
      redoCount: this.backend.redoCount(),
    });
  }
}

// ── Backends ───────────────────────────────────────────────────────────────

/** No-op backend (Phase A boot before any command manager exists). */
export class NullUndoStackBackend implements UndoStackBackend {
  undo(): void { /* no-op */ }
  redo(): void { /* no-op */ }
  canUndo(): boolean { return false; }
  canRedo(): boolean { return false; }
  undoCount(): number { return 0; }
  redoCount(): number { return 0; }
  subscribe(_listener: () => void): UndoStackSubscription {
    return { dispose: (): void => { /* no-op */ } };
  }
}

/**
 * Loose shape for the legacy PRYZM-1 `commandManager` global.  Every
 * field is optional because different vintages of the legacy code
 * exposed slightly different surfaces — the adapter degrades gracefully
 * when a method is missing.
 */
export interface LegacyCommandManagerLike {
  undo?(): void;
  redo?(): void;
  canUndo?(): boolean;
  canRedo?(): boolean;
  undoStack?: { length?: number };
  redoStack?: { length?: number };
  on?(event: string, handler: () => void): void;
  off?(event: string, handler: () => void): void;
}

/**
 * LegacyCommandManagerAdapter — wraps the legacy `commandManager` so
 * Phase-C panels can call `runtime.undoStack.undo()` while the real
 * Immer reverse-apply implementation is built in Phase D.
 *
 * Subscriptions piggy-back on either:
 *   • `commandManager.on('change', …)` if the legacy API offers one, or
 *   • the existing `window` `'bim-store-mutated'` event (broadcast by
 *     every L2 command commit per S43-LEGACY-BRIDGE).
 */
export class LegacyCommandManagerAdapter implements UndoStackBackend {
  constructor(private readonly mgr: LegacyCommandManagerLike) {}

  undo(): void { this.mgr.undo?.(); }
  redo(): void { this.mgr.redo?.(); }

  canUndo(): boolean {
    if (typeof this.mgr.canUndo === 'function') return this.mgr.canUndo();
    return (this.mgr.undoStack?.length ?? 0) > 0;
  }
  canRedo(): boolean {
    if (typeof this.mgr.canRedo === 'function') return this.mgr.canRedo();
    return (this.mgr.redoStack?.length ?? 0) > 0;
  }
  undoCount(): number { return this.mgr.undoStack?.length ?? 0; }
  redoCount(): number { return this.mgr.redoStack?.length ?? 0; }

  subscribe(listener: () => void): UndoStackSubscription {
    const handler = (): void => listener();
    if (this.mgr.on && this.mgr.off) {
      this.mgr.on('change', handler);
      const off = this.mgr.off.bind(this.mgr);
      return { dispose: (): void => off('change', handler) };
    }
    if (typeof window !== 'undefined') {
      // F.events.15 — prefer runtime.events.on; fall back to DOM listener when runtime not yet wired.
      const unsub = (window as any).runtime?.events?.on('bim-store-mutated', handler as () => void);
      if (unsub) {
        return { dispose: unsub };
      }
      const target = window as unknown as EventTarget;
      target.addEventListener('bim-store-mutated', handler as EventListener);
      return {
        dispose: (): void => {
          target.removeEventListener('bim-store-mutated', handler as EventListener);
        },
      };
    }
    return { dispose: (): void => { /* no-op */ } };
  }
}
