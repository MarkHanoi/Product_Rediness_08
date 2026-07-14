// clipboard.ts — §FIX-COPY-PASTE (V1-LAUNCH-READINESS-AUDIT L-84).
//
// A tiny, THREE-free, DOM-free clipboard for the selection plugin plus the
// port through which `paste-clipboard` re-creates the copied element(s).
//
// Why a port (dependency injection) instead of the handler reaching into an
// element store directly:
//   • The bus `HandlerContext` only exposes the stores a handler declares in
//     `affectedStores`; copy/paste is element-type-agnostic, so it cannot
//     statically declare every element store. Re-creation therefore has to be
//     delegated to a collaborator supplied at registration time.
//   • Keeping the actual re-creation behind an interface leaves the plugin
//     (L7) depending on nothing heavier than `@pryzm/plugin-sdk` (L6) and
//     makes the handlers unit-testable with a fake port.
//   • P6 — the concrete port (wired in `apps/editor`) performs the mutation
//     through a registered command (never a direct UI store write), so paste
//     is undoable.
//
// Contract compliance:
//   • P6 — paste re-creation goes through a registered command via the port.
//   • C20 §3 — copy itself is NOT undoable (it only fills this clipboard).

/** A single copied element — the minimum needed to re-create it by source. */
export interface ClipboardEntry {
  /** Id of the source element that was copied. */
  readonly sourceId: string;
  /** Element kind (`'wall'`, `'furniture'`, …) — drives port routing. */
  readonly kind: string;
}

/** World-space translation applied to a pasted copy. */
export interface PasteOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Outcome of re-creating one clipboard entry. */
export interface PasteResult {
  /** Id of the freshly-created copy. */
  readonly newId: string;
}

/**
 * The collaborator that knows how to re-create a copied element.
 *
 * Supplied by `registerSelectionHandlers(bus, { pastePort })` — the concrete
 * implementation lives in the app composition root, so the plugin stays free
 * of element-package dependencies.
 */
export interface SelectionPastePort {
  /** Can an element of this kind be copy/pasted? (Phase 1: wall + furniture.) */
  canCopy(kind: string): boolean;
  /**
   * Re-create `entry` as a new element with `opts.newId`, translated by
   * `opts.offset`, on the SAME level as the source. MUST route the mutation
   * through a registered command so the paste is undoable (P6). Returns the
   * created id, or `null` when re-creation failed (source vanished, etc.).
   */
  paste(
    entry: ClipboardEntry,
    opts: { readonly newId: string; readonly offset: PasteOffset },
  ): PasteResult | null;
}

/** In-memory clipboard — one instance is shared by the copy + paste handlers. */
export class SelectionClipboard {
  private _entries: readonly ClipboardEntry[] = [];

  /** Replace the clipboard contents with `entries`. */
  set(entries: readonly ClipboardEntry[]): void {
    this._entries = [...entries];
  }

  /** Current clipboard contents (never mutated by callers). */
  get(): readonly ClipboardEntry[] {
    return this._entries;
  }

  /** Number of copied elements currently held. */
  get size(): number {
    return this._entries.length;
  }

  /** Empty the clipboard. */
  clear(): void {
    this._entries = [];
  }
}

/**
 * Module-level singleton clipboard. Copy fills it; paste drains it. Persisting
 * it at module scope means a Copy followed later by a Paste (or several pastes)
 * share the same buffer without threading it through the UI.
 */
export const selectionClipboard = new SelectionClipboard();

/**
 * Small default paste displacement (metres). A keyboard / toolbar paste has no
 * cursor target, so the copy is nudged a short distance in plan (X/Z) to stay
 * visible and not perfectly overlap the source.
 */
export const DEFAULT_PASTE_OFFSET: PasteOffset = { x: 0.5, y: 0, z: 0.5 };
