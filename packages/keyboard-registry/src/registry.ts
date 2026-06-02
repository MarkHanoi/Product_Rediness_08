// A.33.a — keyboard shortcut registry.
//
// Append-only. The cheat-sheet + per-tool docs both read from this
// list — collisions are a hard CI fail (see `validateRegistry()`).

import type { KeyboardShortcut, ShortcutCategory } from './types.js';

/**
 * The canonical registry. Order within a category is the order rows
 * appear in the cheat-sheet — keep "most used" near the top.
 *
 * Append-only per [C43 §1.3]:
 *   - to retire a shortcut, mark `experimental: true` first, then drop
 *     in the next release notes window
 *   - NEVER rename `id` — it's a stable cross-ref to docs
 */
export const KEYBOARD_REGISTRY: readonly KeyboardShortcut[] = [
    // ── Global ────────────────────────────────────────────────────────
    {
        id: 'global.save',
        label: 'Save',
        description: 'Save the current project',
        category: 'global',
        combo: { key: 'KeyS', mod: 'cmd-or-ctrl' },
        context: 'global',
    },
    {
        id: 'global.undo',
        label: 'Undo',
        description: 'Undo the last command per ADR-051 ring-buffer',
        category: 'global',
        combo: { key: 'KeyZ', mod: 'cmd-or-ctrl' },
        context: 'global',
    },
    {
        id: 'global.redo',
        label: 'Redo',
        description: 'Redo the last undone command',
        category: 'global',
        combo: { key: 'KeyZ', mod: 'cmd-or-ctrl', shift: true },
        aliases: [{ key: 'KeyY', mod: 'cmd-or-ctrl' }],
        context: 'global',
    },
    {
        id: 'global.search',
        label: 'Command palette',
        description: 'Open the command palette / fuzzy-search',
        category: 'global',
        combo: { key: 'KeyK', mod: 'cmd-or-ctrl' },
        context: 'global',
    },
    {
        id: 'global.cheat-sheet',
        label: 'Keyboard cheat-sheet',
        description: 'Show the full keyboard shortcut overlay',
        category: 'global',
        combo: { key: 'Slash', mod: 'none', shift: true },
        aliases: [{ key: 'F1', mod: 'none' }],
        context: 'global',
    },

    // ── View ──────────────────────────────────────────────────────────
    {
        id: 'view.zoom-in',
        label: 'Zoom in',
        description: 'Zoom in around the cursor',
        category: 'view',
        combo: { key: 'Equal', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },
    {
        id: 'view.zoom-out',
        label: 'Zoom out',
        description: 'Zoom out around the cursor',
        category: 'view',
        combo: { key: 'Minus', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },
    {
        id: 'view.zoom-fit',
        label: 'Zoom to fit',
        description: 'Frame the entire model in the viewport',
        category: 'view',
        combo: { key: 'KeyF', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'view.toggle-3d',
        label: 'Toggle 2D / 3D',
        description: 'Switch between plan view and 3D camera',
        category: 'view',
        combo: { key: 'Digit3', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'view.toggle-split',
        label: 'Toggle split-view',
        description: 'Toggle the 2-pane (plan + 3D) split layout',
        category: 'view',
        combo: { key: 'Backslash', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },

    // ── Select ────────────────────────────────────────────────────────
    {
        id: 'select.all',
        label: 'Select all',
        description: 'Select every element on the active level',
        category: 'select',
        combo: { key: 'KeyA', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },
    {
        id: 'select.none',
        label: 'Deselect',
        description: 'Clear the current selection',
        category: 'select',
        combo: { key: 'Escape', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'select.invert',
        label: 'Invert selection',
        description: 'Select everything currently NOT selected',
        category: 'select',
        combo: { key: 'KeyI', mod: 'cmd-or-ctrl', shift: true },
        context: 'editor',
    },
    {
        id: 'select.isolate',
        label: 'Isolate selection',
        description: 'Hide every non-selected element on the active level',
        category: 'select',
        combo: { key: 'KeyH', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },

    // ── Create (tool activation) ──────────────────────────────────────
    {
        id: 'create.wall',
        label: 'Wall tool',
        description: 'Activate the wall drawing tool',
        category: 'create',
        combo: { key: 'KeyW', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'create.door',
        label: 'Door tool',
        description: 'Activate the door insertion tool (hosts on a wall)',
        category: 'create',
        combo: { key: 'KeyD', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'create.window',
        label: 'Window tool',
        description: 'Activate the window insertion tool (hosts on a wall)',
        category: 'create',
        combo: { key: 'KeyN', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'create.slab',
        label: 'Slab tool',
        description: 'Activate the slab drawing tool',
        category: 'create',
        combo: { key: 'KeyB', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'create.roof',
        label: 'Roof tool',
        description: 'Activate the roof drawing tool',
        category: 'create',
        combo: { key: 'KeyR', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'create.stair',
        label: 'Stair tool',
        description: 'Activate the stair drawing tool',
        category: 'create',
        combo: { key: 'KeyT', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'create.column',
        label: 'Column tool',
        description: 'Activate the column insertion tool',
        category: 'create',
        combo: { key: 'KeyC', mod: 'none' },
        context: 'editor',
    },

    // ── Edit ──────────────────────────────────────────────────────────
    {
        id: 'edit.move',
        label: 'Move',
        description: 'Move the current selection',
        category: 'edit',
        combo: { key: 'KeyM', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'edit.rotate',
        label: 'Rotate',
        description: 'Rotate the current selection',
        category: 'edit',
        combo: { key: 'KeyR', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },
    {
        id: 'edit.copy',
        label: 'Copy',
        description: 'Copy the current selection to the clipboard',
        category: 'edit',
        combo: { key: 'KeyC', mod: 'cmd-or-ctrl' },
        context: 'global',
    },
    {
        id: 'edit.paste',
        label: 'Paste',
        description: 'Paste from the clipboard at the cursor',
        category: 'edit',
        combo: { key: 'KeyV', mod: 'cmd-or-ctrl' },
        context: 'global',
    },
    {
        id: 'edit.duplicate',
        label: 'Duplicate',
        description: 'Duplicate the current selection in-place + offset',
        category: 'edit',
        combo: { key: 'KeyD', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },
    {
        id: 'edit.delete',
        label: 'Delete',
        description: 'Delete the current selection',
        category: 'edit',
        combo: { key: 'Delete', mod: 'none' },
        aliases: [{ key: 'Backspace', mod: 'none' }],
        context: 'editor',
    },
    {
        id: 'edit.group',
        label: 'Group',
        description: 'Group the current selection',
        category: 'edit',
        combo: { key: 'KeyG', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },
    {
        id: 'edit.ungroup',
        label: 'Ungroup',
        description: 'Ungroup the current selection',
        category: 'edit',
        combo: { key: 'KeyG', mod: 'cmd-or-ctrl', shift: true },
        context: 'editor',
    },

    // ── Navigate ──────────────────────────────────────────────────────
    {
        id: 'navigate.level-up',
        label: 'Next level up',
        description: 'Activate the level above the current one',
        category: 'navigate',
        combo: { key: 'PageUp', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'navigate.level-down',
        label: 'Next level down',
        description: 'Activate the level below the current one',
        category: 'navigate',
        combo: { key: 'PageDown', mod: 'none' },
        context: 'editor',
    },
    {
        id: 'navigate.toggle-properties',
        label: 'Toggle Properties panel',
        description: 'Show/hide the properties panel',
        category: 'navigate',
        combo: { key: 'KeyP', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },
    {
        id: 'navigate.toggle-inspect',
        label: 'Toggle Inspect tree',
        description: 'Show/hide the inspect-tree panel',
        category: 'navigate',
        combo: { key: 'KeyI', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },
    {
        id: 'navigate.toggle-layers',
        label: 'Toggle Layers panel',
        description: 'Show/hide the layer/visibility panel',
        category: 'navigate',
        combo: { key: 'KeyL', mod: 'cmd-or-ctrl' },
        context: 'editor',
    },

    // ── Inspect / help ────────────────────────────────────────────────
    {
        id: 'inspect.context-help',
        label: 'Context help',
        description: 'Open help for the currently-active tool / panel',
        category: 'inspect',
        combo: { key: 'F1', mod: 'none', shift: true },
        context: 'global',
    },
    {
        id: 'inspect.toggle-stats',
        label: 'Toggle frame stats',
        description: 'Show/hide the FPS + scheduler overlay',
        category: 'inspect',
        combo: { key: 'Backquote', mod: 'cmd-or-ctrl', shift: true },
        context: 'editor',
        experimental: true,
    },
];

/**
 * Indexed-by-id lookup map. O(1) `findShortcut()`.
 */
const REGISTRY_INDEX: ReadonlyMap<string, KeyboardShortcut> = new Map(
    KEYBOARD_REGISTRY.map((s) => [s.id, s]),
);

/** O(1) lookup by id. Returns undefined for unknown ids. */
export function findShortcut(id: string): KeyboardShortcut | undefined {
    return REGISTRY_INDEX.get(id);
}

/** Get every shortcut in a single category, preserving registry order. */
export function shortcutsInCategory(
    category: ShortcutCategory,
): readonly KeyboardShortcut[] {
    return KEYBOARD_REGISTRY.filter((s) => s.category === category);
}

/**
 * Section order shown on the cheat-sheet. The order matters — it's the
 * tab-order users skim.
 */
export const CATEGORY_ORDER: readonly ShortcutCategory[] = [
    'global',
    'view',
    'select',
    'create',
    'edit',
    'navigate',
    'inspect',
];

/**
 * Human-readable category names for the cheat-sheet headings.
 */
export const CATEGORY_LABEL: Readonly<Record<ShortcutCategory, string>> = {
    global: 'Global',
    view: 'View + camera',
    select: 'Selection',
    create: 'Create',
    edit: 'Edit',
    navigate: 'Navigate',
    inspect: 'Inspect + help',
};

/**
 * Boot-time sanity check: no duplicate ids, no two non-experimental
 * shortcuts share the same combo in the same context.
 *
 * Throws on collision — this is intentional: an unresolved collision
 * means one of the two shortcuts is dead. CI runs this on the registry
 * file directly.
 */
export function validateRegistry(
    registry: readonly KeyboardShortcut[] = KEYBOARD_REGISTRY,
): void {
    const ids = new Set<string>();
    for (const s of registry) {
        if (ids.has(s.id)) {
            throw new Error(
                `keyboard-registry: duplicate id "${s.id}"`,
            );
        }
        ids.add(s.id);
    }

    const seen = new Map<string, string>();
    for (const s of registry) {
        if (s.experimental) continue;
        const ctx = s.context ?? 'global';
        const allCombos = [s.combo, ...(s.aliases ?? [])];
        for (const combo of allCombos) {
            const fingerprint = comboFingerprint(combo, ctx);
            const prior = seen.get(fingerprint);
            if (prior) {
                throw new Error(
                    `keyboard-registry: combo collision between "${prior}" and "${s.id}" ` +
                        `(${fingerprint})`,
                );
            }
            seen.set(fingerprint, s.id);
        }
    }
}

function comboFingerprint(
    combo: { key: string; mod?: string; alt?: boolean; shift?: boolean },
    context: string,
): string {
    const parts: string[] = [context, combo.mod ?? 'none', combo.key];
    if (combo.alt) parts.push('alt');
    if (combo.shift) parts.push('shift');
    return parts.join('|');
}

// Boot-time validation — see [C43 §1.3]. If this throws the registry
// is broken and CI fails.
validateRegistry();
