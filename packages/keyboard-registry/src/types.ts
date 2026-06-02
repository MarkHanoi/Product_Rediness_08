// A.33.a — keyboard shortcut types.
//
// Per [C43 §1.3] every interactive tool MUST register its keyboard
// surface. The registry below is the single source of truth — the
// cheat-sheet UI reads from it, and CI validates that no tool ships
// without an entry.

/**
 * A single key combination, modelled in PLATFORM-NEUTRAL terms.
 *
 *   - `key` is the physical key — using `KeyboardEvent.code` semantics
 *     (e.g. 'KeyS', 'Slash', 'Escape', 'F1', 'ArrowUp'). NOT the
 *     printed glyph; physical-key matching avoids QWERTY/AZERTY drift.
 *   - `mod` is the platform-neutral primary modifier: 'cmd-or-ctrl'
 *     normalises ⌘ on macOS and Ctrl on Windows/Linux. Use 'meta' or
 *     'ctrl' literally when you specifically want one platform's behaviour
 *     (rare — almost always you want 'cmd-or-ctrl').
 *   - `alt` / `shift` are platform-uniform additional modifiers.
 */
export interface KeyCombo {
    readonly key: string;
    readonly mod?: 'cmd-or-ctrl' | 'meta' | 'ctrl' | 'none';
    readonly alt?: boolean;
    readonly shift?: boolean;
}

/**
 * The 7 categories the cheat-sheet groups shortcuts under. The order
 * here is the order in which categories appear on the cheat-sheet.
 */
export type ShortcutCategory =
    | 'global'        // app-wide: Save, Undo, Open, Search
    | 'view'          // pan/zoom/cycle camera/view-cube
    | 'select'        // selection model
    | 'create'        // tool activation: Wall, Door, Window, Stair
    | 'edit'          // transform: move/rotate/scale/copy/delete
    | 'navigate'      // panels/layouts/sheets/UI navigation
    | 'inspect';      // properties/inspect/help/cheat-sheet itself

/**
 * One entry in the registry. Append-only per [C43 §1.3] — keys appear
 * in user-visible help; renaming an id breaks the keyboard-tool-reference
 * link from `docs/05-guides/accessibility/`.
 */
export interface KeyboardShortcut {
    /** Stable id — used by the command dispatcher + the docs cross-ref. */
    readonly id: string;
    /** Short human label (shown in the cheat-sheet table). */
    readonly label: string;
    /** 1-sentence what-this-does (shown on hover or in extended help). */
    readonly description: string;
    readonly category: ShortcutCategory;
    /** Primary combo. */
    readonly combo: KeyCombo;
    /** Optional secondary combos (e.g. legacy bindings during migration). */
    readonly aliases?: readonly KeyCombo[];
    /** When set, the combo only fires while the named context is active. */
    readonly context?: 'editor' | 'modal' | 'panel' | 'global';
    /** Tag for incomplete entries — the registry tolerates these but CI flags them. */
    readonly experimental?: boolean;
}
