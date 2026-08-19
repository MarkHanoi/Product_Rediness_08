/**
 * zLayers — the SINGLE SOURCE OF TRUTH for UI stacking order (z-index).
 *
 * Contract: C06 §7 — UI Layering & Overlap (see
 * `docs/02-decisions/contracts/C06-UI-SHELL-AND-TOOLS.md`).
 *
 * WHY THIS EXISTS (L-149, §FIX-UI-LAYERING-ZINDEX-CONTRACT)
 * ─────────────────────────────────────────────────────────
 * Before this module there were ~325 hardcoded `z-index` literals across
 * `apps/editor/src/ui` with no ordering discipline (values ranged from `2` to
 * `2147483000`). Arbitrary literals produced unpredictable stacking and visible
 * overlaps — most visibly the always-on GIS launcher rail ("◉ 3D Site / Globe",
 * "▦ Plan + Site") which was `position:absolute` inside `#container` at
 * `z-index:20` and therefore lost the stacking race to every piece of root-level
 * chrome (top toolbar `9000`, left nav rail `9999`), rendering BELOW them.
 *
 * THE SCALE (ascending — larger paints on top)
 * ─────────────────────────────────────────────
 * A NAMED, ORDERED token set. Numeric values are calibrated to the app's
 * pre-existing convention (thousands / hundred-thousands) so a PHASED migration
 * is monotonic: a migrated element keeps working against not-yet-migrated
 * neighbours. The ORDER is the contract; the exact numbers are an implementation
 * detail that MAY be re-based once every site is migrated.
 *
 *   canvas          — the 3D canvases (#container, WebGPU/WebGL, Cesium globe)
 *   underlay        — scene / plan-canvas underlays beneath authored geometry
 *   viewportHud     — canvas-space overlays (snap, structural, ambient indicators)
 *   panel           — docks, side panels, browsers, inspectors
 *   rail            — persistent nav / tool rails (left nav, tools rail)
 *   toolbar         — top platform toolbar / ribbon / workspace-mode bars
 *   contextualBar   — selection-driven contextual edit bars + view toggles
 *   launcher        — ALWAYS-ON floating launchers / rails (GIS + graph pills)
 *   popover         — menus, dropdowns, tooltips, mode-pickers
 *   drawer          — side drawers (sync-state, data)
 *   modal           — blocking dialogs (import mode, conflict, IFC overlays)
 *   toast           — transient notifications
 *   loadingOverlay  — engine boot spinner / blocking progress overlays
 *   critical        — last-resort escape hatch (renderer backend toggle, reload notice)
 *
 * MIGRATION RULE (CI-intent, enforced by review until a lint rule lands):
 *   New or edited UI-chrome code MUST NOT introduce a raw `z-index` literal.
 *   Always use `Z_LAYERS` / `zCss()` (TS) or the matching `--z-*` custom property
 *   (CSS, declared in `apps/editor/src/ui/styles/layout.css`). Both derive from
 *   the SAME scale documented here — keep them in lock-step.
 */

export const Z_LAYERS = {
    canvas:         0,
    underlay:       100,
    viewportHud:    900,
    panel:          1000,
    rail:           2000,
    toolbar:        9000,
    contextualBar:  9100,
    launcher:       10000,
    popover:        20000,
    drawer:         40000,
    modal:          200000,
    toast:          300000,
    loadingOverlay: 900000,
    critical:       2147483000,
} as const;

export type ZLayer = keyof typeof Z_LAYERS;

/** Numeric z-index for a named layer. */
export function zIndexOf(layer: ZLayer): number {
    return Z_LAYERS[layer];
}

/** z-index for a named layer as a CSS string (for inline `style.zIndex`). */
export function zCss(layer: ZLayer): string {
    return String(Z_LAYERS[layer]);
}

/**
 * The `:root { --z-* }` custom-property block, derived from the SAME scale, so
 * CSS-authored chrome can reference `var(--z-launcher)` etc. This string is the
 * canonical CSS mirror; it is duplicated (kept in lock-step) inside
 * `apps/editor/src/ui/styles/layout.css` so the vars are available even before
 * any JS runs. Exposed here for a future single-injection wiring / tests.
 */
export function zLayerCssVars(): string {
    const lines = (Object.keys(Z_LAYERS) as ZLayer[])
        .map((k) => `  --z-${kebab(k)}: ${Z_LAYERS[k]};`)
        .join('\n');
    return `:root {\n${lines}\n}`;
}

function kebab(s: string): string {
    return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// No-overlap layout policy — the always-on launcher rail
// ─────────────────────────────────────────────────────────────────────────────
//
// C06 §7.2 — chrome elements that share a screen region MUST declare that region
// and MUST NOT occlude peers. The always-on launcher pills (GIS "3D Site" +
// "Plan + Site", plus the "Graph" + "Living Graph" overlays) all live in the
// bottom-LEFT corner. Historically two independent code paths placed pills there
// with hand-picked `bottom:` offsets (GIS at 48/86, graph at 64/104) that
// INTERLEAVED and physically overlapped. This helper makes the corner a single,
// declared, collision-free vertical stack: each launcher owns a fixed SLOT.
//
// The stack is `position:fixed` (escapes the `#container` stacking trap that
// buried the GIS pills) at the `launcher` layer, left-anchored, stacking upward
// from just above the bottom-left renderer-backend toggle (`critical` layer,
// bottom:10px, ~30px tall).
//
// §FIX-LAUNCHER-COVERS-SPLITVIEW (L-159) — the Split View toggle button (mounted
// in `initUI.ts`) ALSO lives in this corner. It is a peer chrome control, so it
// MUST be part of the SAME slot accounting or the launcher column re-occludes it
// (which it did: the re-slotted "Graph" pill landed exactly on the split-view
// button at bottom:144). It is therefore slot 0 (the bottom of the column, just
// above the GPU toggle); the launchers stack ABOVE it. Every occupant of this
// corner is now a named slot — nothing hand-picks a `bottom:`/`z-index` (C06 §7.2).

export const LAUNCHER_RAIL = {
    /** Left inset for the whole corner column (px). */
    left: 12,
    /** Bottom offset of slot 0 (px) — clears the GPU backend toggle at bottom:10. */
    bottomBase: 54,
    /** Vertical pitch between slots (px) — pill ≈ 30px tall + ~14px gap. */
    slotStep: 44,
} as const;

/**
 * Ordered slots in the bottom-left launcher rail (0 = lowest, nearest the GPU
 * toggle). `splitView` is the non-launcher Split View toggle folded into the same
 * accounting so it can never be re-occluded (L-159).
 */
export type LauncherSlot =
    | 'splitView' | 'siteView' | 'planGis' | 'graph' | 'livingGraph'
    // §L-621b — re-open pills for the two 3D-Site chrome panels (Site Analysis + the
    // Buildable-Envelope card). Appended ABOVE the existing occupants so the collision-
    // free column stays monotonic — no existing slot index moves (C06 §7.2).
    | 'siteAnalysis' | 'envelopeCard'
    // §UX1-PANEL-DEFAULTS — `Reset panel layout`. It belongs in THIS column because the
    // column is the panel-reopen surface: the control that restores the declared defaults
    // sits with the controls that departed from them. Appended (slot 7) so no existing
    // index moves — the C06 §7.2 monotonic rule.
    | 'resetLayout';

export const LAUNCHER_SLOT_INDEX: Record<LauncherSlot, number> = {
    splitView:    0,
    siteView:     1,
    planGis:      2,
    graph:        3,
    livingGraph:  4,
    siteAnalysis: 5,
    envelopeCard: 6,
    resetLayout:  7,
};

/**
 * The collision-free `position:fixed` anchoring + `launcher`-layer z-index for a
 * launcher pill's declared slot. Spread onto the element's inline style; the
 * caller still owns cosmetic styling (padding, colour, shadow).
 */
export function launcherRailStyle(slot: LauncherSlot): Partial<CSSStyleDeclaration> {
    const i = LAUNCHER_SLOT_INDEX[slot];
    return {
        position: 'fixed',
        left: `${LAUNCHER_RAIL.left}px`,
        bottom: `${LAUNCHER_RAIL.bottomBase + i * LAUNCHER_RAIL.slotStep}px`,
        zIndex: zCss('launcher'),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// §UX1-PANEL-CHROME — the launcher rail's shared cosmetics
// ─────────────────────────────────────────────────────────────────────────────
//
// `launcherRailStyle` above places a pill; this places how it LOOKS. The two are
// deliberately separate functions but they belong in the same file: the rail is a
// declared screen region (C06 §7.2) and, since the panels it re-opens now start
// CLOSED (§UX1-PANEL-DEFAULTS), it is the surface a user's eye lands on. Five code
// paths across three files each carried their own copy of `padding: 7px 12px;
// border-radius: 9px; border: 1px solid #6600FF; font: 600 12px; box-shadow: 0 3px
// 12px rgba(20,10,60,.16)` — the same policy in several places, drifting.
//
// The values themselves are the founder's "smaller, more discreet": a tinted
// #6600FF border instead of a full-saturation outline on white, half the shadow
// blur at ~60% of its alpha, and one step down in type. They come from the
// `--pryzm-pill-*` tokens in `styles/tokens.ts` (C06 §6), whose target-size values
// are fenced out of the §UI-DENSITY-SCALE transform so the pills stay ≥24px —
// these controls are the ONLY route back to the closed panels (C82 §1.1), so
// C43 / WCAG 2.2 AA SC 2.5.8 is a floor here, not a preference.

/** The resting border colour for an unpressed launcher pill (brand purple, tinted). */
export const LAUNCHER_PILL_BORDER = '#dcccff';

/**
 * Cosmetic half of a launcher pill. Spread AFTER {@link launcherRailStyle} — this
 * object deliberately sets no `position`/`left`/`bottom`/`z-index`, so it can never
 * fight the rail's collision-free slotting.
 */
export const LAUNCHER_PILL_COSMETICS: Partial<CSSStyleDeclaration> = {
    appearance: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 'var(--pryzm-pill-min-height)',
    padding: 'var(--pryzm-pill-pad)',
    borderRadius: 'var(--pryzm-pill-radius)',
    border: `1px solid ${LAUNCHER_PILL_BORDER}`,
    font: '600 var(--pryzm-pill-font-size)/1 system-ui, sans-serif',
    boxShadow: 'var(--pryzm-pill-shadow)',
};
