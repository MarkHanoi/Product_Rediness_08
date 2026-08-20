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
    // §FEAT-STAIR-CREATION-MODES (L-1452) — `Stair (C)` has been rendered by
    // `CreateRailPanel._buildSections` since 59d3422f (2026-08-06, the creation-matrix
    // commit) and has had NO entry here for the whole of that time. The panel stamps
    // `tool.shortcut` from this map and the tooltip is composed from the SAME field,
    // so the button advertised a shortcut it could not fire — C84 EI-3, in the
    // smallest possible form.
    //
    // ⚠ MEASURED, because the obvious guess is wrong: this is NOT tonight's landscape
    // commit. `git log -S"Stair (C)" -- CreateRailPanel.ts` names 59d3422f; the
    // completeness test has therefore been RED for two weeks. It went unseen because
    // the ROOT `vitest.config.ts` does not include `apps/editor/__tests__/**`, so this
    // suite only runs from inside `apps/editor`.
    //
    // ⛔ NOT bound to a bare `C`. Every combo in this map is Alt-prefixed by design
    // (Contract 11 — creation shortcuts stay off the contextual single-letter layer),
    // and the `C` in the LABEL is the stair SHAPE (curved), a different axis entirely.
    // `Alt+Shift+Ctrl+T` continues the I → L → U → C escalation the other three stairs
    // already use, mirroring Roof's four-deep `O` ladder. Verified free by
    // `assertNoShortcutCollisions()`, which runs at import time.
    'Stair (C)':            'Alt+Shift+Ctrl+T',
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
    // LANDSCAPE-CATALOGUE (L-1380) - 'Plants' split into two tools, because
    // ground-planted trees and container plantings are not one family.
    // 'Trees' keeps Alt+Shift+P (the muscle memory the old single tool had);
    // potted plants take Alt+Shift+W, the nearest free letter.
    'Trees':                'Alt+Shift+P',
    'Potted Plants':        'Alt+Shift+W',
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
