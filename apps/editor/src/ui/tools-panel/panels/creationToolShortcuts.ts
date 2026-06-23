/**
 * creationToolShortcuts — single source of truth for the CREATE-rail
 * (discipline accordion) keyboard shortcuts + hover-tooltip text.
 *
 * §CREATE-SHORTCUT-SSOT (2026-06-23)
 *
 * The founder asked for two guarantees on the left ARCHITECTURE / discipline
 * creation palette:
 *   1. EVERY creation tool has a keyboard shortcut (no tool left without one,
 *      no two tools share the same combo).
 *   2. On hover the tooltip shows the element NAME and the shortcut in
 *      brackets — e.g. "Wall (Alt+W)".
 *
 * To make (1) and (2) impossible to drift apart, both the key handler
 * (`CreateRailPanel._tryFireShortcut`) and the tooltip (`_buildSingleSection`)
 * read the shortcut from the SAME `tool.shortcut` field, and that field is
 * sourced from `CREATION_TOOL_SHORTCUTS` below — a single label→combo map.
 * The completeness unit test asserts every tool label the panel renders has
 * an entry here, so a new tool can never ship without a shortcut.
 *
 * Shortcut spec format: `{Alt}[+{Shift}][+{Ctrl}]+{LETTER}` — Alt is mandatory
 * so creation shortcuts never collide with the contextual single-letter layer
 * (Contract 11). Matched in `CreateRailPanel._matchShortcut` against `e.code`.
 *
 * Pure module: no DOM, no THREE, no runtime — safe to unit-test directly.
 */

/**
 * Canonical label → shortcut-spec map for every CREATE-rail tool.
 *
 * Keyed by the exact `tool.label` string the panel renders, so the tooltip
 * and the key handler resolve the identical combo. Editing a label here AND
 * in `_buildSections()` is enforced by the completeness test.
 *
 * No two values share a combo — verified by `assertNoShortcutCollisions()`
 * and the unit test.
 */
export const CREATION_TOOL_SHORTCUTS: Readonly<Record<string, string>> = {
    // ── Architecture ──────────────────────────────────────────────
    'Wall':                 'Alt+W',
    'Curtain Wall':         'Alt+Q',
    'Door':                 'Alt+D',
    'Window':               'Alt+I',
    'Stair (I)':            'Alt+T',
    'Stair (L)':            'Alt+Shift+T',
    'Stair (U)':            'Alt+Ctrl+T',
    'Handrail':             'Alt+H',
    'Ramp':                 'Alt+P',
    'Ceiling':              'Alt+C',
    'Auto Ceiling':         'Alt+Shift+C',
    'Floor':                'Alt+F',
    'Auto Floor':           'Alt+Shift+F',
    'Room':                 'Alt+R',
    'Room (level)':         'Alt+Shift+R',
    'Room Bounding':        'Alt+B',

    // ── Structure ─────────────────────────────────────────────────
    'Column':               'Alt+K',
    'Beam':                 'Alt+E',
    'Slab':                 'Alt+S',
    'Roof (2pt)':           'Alt+O',
    'Roof (poly)':          'Alt+Shift+O',
    'Roof (region)':        'Alt+Ctrl+O',
    'Roof (single slope)':  'Alt+Shift+Ctrl+O',
    'Slab Opening':         'Alt+N',

    // ── Services ──────────────────────────────────────────────────
    'Bath':                 'Alt+J',
    'Toilet':               'Alt+L',
    'Sink':                 'Alt+Y',
    'Shower':               'Alt+G',

    // ── Interiors (furniture categories) ──────────────────────────
    'Sofas':                'Alt+A',
    'Chairs':               'Alt+M',
    'Tables':               'Alt+U',
    'Beds':                 'Alt+V',
    'Wardrobes':            'Alt+X',
    'Outdoor':              'Alt+Z',
    'Kitchen':              'Alt+Shift+K',
    'Decor':                'Alt+Shift+D',
    'Soft Furnishings':     'Alt+Shift+S',
    'Bathroom':             'Alt+Shift+B',
    'Storage':              'Alt+Shift+G',
    'Kids':                 'Alt+Shift+I',
    'Teens':                'Alt+Shift+E',
    'Lighting':             'Alt+Shift+L',
    'Component':            'Alt+Shift+M',

    // ── Landscape ─────────────────────────────────────────────────
    'Plants':               'Alt+Shift+P',
};

/**
 * Resolve the canonical shortcut for a tool label, or `undefined` if the
 * label is not in the map. `CreateRailPanel._buildSections()` calls this
 * to stamp `tool.shortcut`, so the map is the single source.
 */
export function shortcutForTool(label: string): string | undefined {
    return CREATION_TOOL_SHORTCUTS[label];
}

/**
 * Compose a hover tooltip from a tool name + its shortcut.
 *
 *   formatTooltip('Wall', 'Alt+W')  → 'Wall (Alt+W)'
 *   formatTooltip('Wall', undefined) → 'Wall'      (no empty brackets)
 *   formatTooltip('Wall', '')        → 'Wall'
 *
 * Pure + total: never throws, trims a blank shortcut to just the name.
 */
export function formatTooltip(name: string, shortcut?: string | null): string {
    const sc = (shortcut ?? '').trim();
    return sc ? `${name} (${sc})` : name;
}

/**
 * Boot/test guard: throws if any two labels share an identical shortcut
 * combo (case-insensitive, modifier-order-insensitive). Mirrors the
 * keyboard-registry collision policy for the CREATE rail.
 */
export function assertNoShortcutCollisions(
    map: Readonly<Record<string, string>> = CREATION_TOOL_SHORTCUTS,
): void {
    const seen = new Map<string, string>();
    for (const [label, spec] of Object.entries(map)) {
        const fingerprint = normalizeSpec(spec);
        const prior = seen.get(fingerprint);
        if (prior) {
            throw new Error(
                `creationToolShortcuts: combo collision between "${prior}" and ` +
                `"${label}" (${fingerprint})`,
            );
        }
        seen.set(fingerprint, label);
    }
}

/** Order-insensitive fingerprint of a spec like 'Alt+Shift+T' → 'alt+shift|t'. */
function normalizeSpec(spec: string): string {
    const parts = spec.split('+').map((p) => p.trim().toLowerCase());
    const key = parts[parts.length - 1];
    const mods = parts.slice(0, -1).sort();
    return `${mods.join('+')}|${key}`;
}

// Fail fast at import time if the canonical map ever develops a collision.
assertNoShortcutCollisions();
