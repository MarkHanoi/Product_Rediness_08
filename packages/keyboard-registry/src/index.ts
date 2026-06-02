// A.33.a (Phase A · Sprint 2) — @pryzm/keyboard-registry public surface.
//
// Per [C43 §1.3] this is the single source of truth for every keyboard
// shortcut the editor exposes. The L5 cheat-sheet modal (A.33.b),
// the per-tool docs (A.33.c), and CI's "every tool has a shortcut"
// guard all read from here.
//
// Strategic context:
//   - docs/02-decisions/contracts/C43-ACCESSIBILITY.md
//   - docs/03-execution/plans/master-execution-tracker.md A.33

export {
    KEYBOARD_REGISTRY,
    CATEGORY_ORDER,
    CATEGORY_LABEL,
    findShortcut,
    shortcutsInCategory,
    validateRegistry,
} from './registry.js';

export {
    formatKey,
    formatKeyCombo,
    type Platform,
} from './format.js';

export {
    buildCheatSheetData,
    type CheatSheetData,
    type CheatSheetSection,
    type CheatSheetRow,
} from './cheatSheet.js';

export type {
    KeyboardShortcut,
    KeyCombo,
    ShortcutCategory,
} from './types.js';
