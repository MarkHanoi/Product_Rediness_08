/**
 * VgCanvasStyleResolver — §FIX-VISIBILITY-INTENT-AUTHORITY (L-776)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THE ONE PLACE THE LEGACY VG CASCADE IS ALLOWED TO SPEAK TO THE 2D CANVAS.
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHAT WAS WRONG (the founder, 2026-08-08: *"the Visibility Intent should govern each
 * view's visibility… at the moment it is not working"*).
 *
 * `PlanViewCanvas.render()` resolves a pen through the sanctioned chain —
 * `graphicsRulesEngine.resolveStyle()` (Contract-23 §7.1), which layers the bound
 * VISIBILITY INTENT (priority 1000) under the view (9000) and element (10000) tiers.
 * It then threw part of that answer away:
 *
 * ```
 * ctx.strokeStyle = vgEdge ?? _pen.color;                    // PlanViewCanvas.ts
 * ctx.lineWidth   = max(hairline, _penPx * (vgLineWeight/1));
 * ```
 *
 * `vgEdge` / `vgLineWeight` came from `vgGovernanceStore.resolveStyle()`, which
 * **never returns nothing**: `ensureModel()` stamps every model with
 * `templateId: 'pryzm-default'` (VGGovernanceStore.ts) and that built-in template
 * hard-codes an `edgeColor` and a `lineWeight` for wall, slab, column, beam, door,
 * window, roof, stair, furniture, plumbing, grid… So for EVERY element in EVERY
 * plan, section and elevation:
 *
 *   • the intent's **LINE COLOUR was unconditionally discarded** — the drawing was
 *     painted in the built-in template's colours (wall `#000000`, door `#5a4010`,
 *     window `#336699`), whatever the panel said;
 *   • the intent's **LINE WEIGHT was multiplied** by the template's relative weight
 *     (wall / column / beam = 2 ⇒ every one of those lines drew at DOUBLE the
 *     authored width, in all four zones).
 *
 * A *default* is not an *override*. C09 §4.3 puts `LocalViewOverrides` LAST in the
 * precedence chain — it does not put a legacy template's built-in seed AHEAD of the
 * master intent, and C09 §4.5 is explicit that intents REPLACE Revit-style view
 * templates. **The code disagreed with the contract, so the code was wrong.**
 *
 * (The divergence was already MEASURED and never closed: `IntentAuthorityOracle.test.ts`
 * is the "B0 oracle" written to size exactly this change — "change the AUTHORITY, not
 * the PIXELS". B2a, the change itself, was never landed. Authored-but-unwired.)
 *
 * WHAT THIS MODULE DOES.
 *
 * It reports a VG contribution **only where VG genuinely OVERRIDES** — i.e. where the
 * user (or a command) explicitly set the property at the model or view tier, which
 * `VGResolvedStyle.overriddenProps` already records. Where VG is merely repeating a
 * built-in default or a template seed, `edgeColor` and `lineWeight` come back `null`,
 * and `vgEdge ?? _pen.color` / the weight factor become no-ops **by construction**.
 * Intent authority is restored without deleting the user's ability to override a view.
 *
 * `visible`, `fillColor`, `fillPattern` and `transparency` are passed through
 * unchanged: the poché path already gives the intent precedence over them
 * (`intentFillColour ?? resolved?.fillColor ?? …`), so their authority is not at issue.
 *
 * WHY IT LIVES HERE AND NOT IN THE TWO CALLERS.
 *
 * It was a hand-copied closure in `PlanViewManager._buildContext()` AND in
 * `SplitViewManager._setupContext()` — two copies of a 15-line zone-suffix parser that
 * had already drifted once (`VIEW-SYSTEM-AUDIT-2026 F13`: one of them passed the viewId
 * as the modelId). Divergent copies are how this repo's drift starts. There is now ONE.
 */

import { vgGovernanceStore } from './VGGovernanceStore';

/**
 * Structurally identical to `PlanViewCanvasStyle` (views/PlanViewCanvas.ts). Declared
 * here rather than imported so this L3 presentation module does not pull the canvas —
 * and therefore THREE (P2) — into a resolver that is pure data.
 */
export interface VgCanvasStyle {
    visible:       boolean;
    edgeColor?:    string | null;
    fillColor?:    string | null;
    fillPattern?:  string | null;
    lineWeight?:   number | null;
    transparency?: number | null;
}

/** The three zone suffixes the projector stamps onto an ISO layer tag. */
function zoneOfLayer(layerTag: string): 'cut' | 'beyond' | 'projection' {
    if (/:cut$/i.test(layerTag))    return 'cut';
    if (/:beyond$/i.test(layerTag)) return 'beyond';
    return 'projection';
}

/**
 * Resolve the VG contribution for one (category × layer) in one view.
 *
 * @param category  the VG category ('wall', 'door', …)
 * @param layerTag  the projected ISO layer tag, carrying the zone suffix
 * @param viewId    the view being drawn (may be undefined for a not-yet-registered pane)
 * @param modelId   the VG model — always `'model-default'` in production
 */
export function resolveVgCanvasStyle(
    category: string,
    layerTag: string,
    viewId?:  string,
    modelId = 'model-default',
): VgCanvasStyle {
    const { style, overriddenProps } = vgGovernanceStore.resolveStyle(modelId, category, viewId);
    const zone = zoneOfLayer(layerTag);
    const s = style as Record<string, unknown>;

    // §FIX-VISIBILITY-INTENT-AUTHORITY — THE WHOLE FIX IS THESE TWO PREDICATES.
    //
    // `overriddenProps` is VG's OWN record of "a human decided this", maintained by
    // `SetVGCategoryStyleCommand` / `SetVGViewCategoryStyleCommand` through
    // `overrideFlags`. A property absent from it is a DEFAULT or a TEMPLATE SEED, and a
    // seed must never outrank the master intent (C09 §4.1, §4.5).
    //
    // The zone-specific keys (`beyondEdgeColor`, `cutLineWeight`, …) are only reachable
    // through an explicit `lineWeight` / `edgeColor` override or a per-view style write,
    // so they ride the same flags: if the base property was not overridden, neither was
    // its zone refinement.
    const colourOverridden = overriddenProps.includes('edgeColor')
        || (zone === 'beyond' && overriddenProps.includes('beyondEdgeColor'));
    const weightOverridden = overriddenProps.includes('lineWeight')
        || (zone === 'cut'    && overriddenProps.includes('cutLineWeight'))
        || (zone === 'beyond' && overriddenProps.includes('beyondLineWeight'))
        || (zone === 'projection' && overriddenProps.includes('projectionLineWeight'));

    const edgeColor = colourOverridden
        ? (zone === 'beyond' ? ((s.beyondEdgeColor as string | undefined) ?? style.edgeColor) : style.edgeColor)
        : null;

    const lineWeight = weightOverridden
        ? (zone === 'cut'
            ? ((s.cutLineWeight as number | undefined) ?? style.lineWeight)
            : zone === 'beyond'
                ? ((s.beyondLineWeight as number | undefined) ?? Math.max(1, style.lineWeight - 1))
                : ((s.projectionLineWeight as number | undefined) ?? style.lineWeight))
        : null;

    return {
        visible: zone === 'beyond'
            ? ((s.beyondVisible as boolean | undefined) ?? style.visible)
            : style.visible,
        edgeColor,
        fillColor:    style.fillColor,
        fillPattern:  s.fillPattern as string | undefined ?? null,
        transparency: style.transparency,
        lineWeight,
    };
}
