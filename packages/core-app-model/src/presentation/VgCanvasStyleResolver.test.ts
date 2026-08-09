/**
 * §FIX-VISIBILITY-INTENT-AUTHORITY (L-776) — DOES THE INTENT REACH THE LINE?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SUITE ASSERTS ON THE COMPOSED STROKE AND NOT ON THE INTENT RECORD
 * ─────────────────────────────────────────────────────────────────────────────
 * The bug is a REACHABILITY bug (see VgCanvasStyleResolver's header): the intent
 * chain resolved a perfectly correct pen and the canvas then overwrote its colour
 * and scaled its width with the legacy VG cascade's BUILT-IN TEMPLATE — a default,
 * not a user decision. A guard asserting `intent.elementRules.wall.cut.line.colour
 * === '#ff00ff'` scores 1.000 on the BROKEN build. That is not a guard.
 *
 * So every assertion below ends at the two expressions `PlanViewCanvas.render()`
 * actually evaluates per line:
 *
 *     ctx.strokeStyle = vgEdge ?? _pen.color;
 *     ctx.lineWidth   = max(hairline, _pen.widthMm * PX_PER_MM * vgFactor);
 *
 * composed here from the SAME two producers the canvas uses — `resolveVgCanvasStyle`
 * (the injected `styleResolver`, now shared by PlanViewManager + SplitViewManager)
 * and `graphicsRulesEngine.resolveStyle` (Contract-23 §7.1). If either producer
 * regresses, this breaks.
 *
 * THE POSITIVE CONTROL (brief, mandatory): every "intent governs" claim is proved by
 * PLANTING A DELIBERATELY EXTREME RULE — 5 mm magenta walls — and showing the composed
 * stroke moves to it. A test that only shows "the numbers are equal" cannot tell a live
 * path from a dead one that happens to agree.
 *
 * Contracts: C09 §4.1 (all visibility derives from intent), §4.3 (precedence),
 * §4.5 (intents REPLACE view templates), Contract-23 §7.1 (one style entry point).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveVgCanvasStyle } from './VgCanvasStyleResolver';
import { vgGovernanceStore } from './VGGovernanceStore';
import { visibilityIntentStore } from './VisibilityIntentStore';
import { viewIntentInstanceStore } from './ViewIntentInstanceStore';
import { cloneSystemIntents, SYSTEM_INTENT_IDS } from './SystemIntents';
import { graphicsRulesEngine } from '../drawing/GraphicsRulesEngine';
import { SCREEN_PX_PER_MM } from '../drawing/DrawingConstants';
import type { PenZone } from '../drawing/PenWeightTable';
import type { VisibilityIntent } from './VisibilityIntentTypes';

const EXTREME_COLOUR = '#ff00ff';
const EXTREME_WEIGHT_MM = 5;

/** EXACTLY the composition `PlanViewCanvas.render()` performs, per line. */
function composeStroke(
    category: string,
    layerTag: string,
    zone: PenZone,
    viewId: string,
    viewType: string,
): { colour: string; widthPx: number } {
    const vg  = resolveVgCanvasStyle(category, layerTag, viewId);
    const pen = graphicsRulesEngine.resolveStyle(zone, category, { viewId, viewType });
    const vgFactor = (vg.lineWeight !== null && vg.lineWeight !== undefined && vg.lineWeight > 0)
        ? vg.lineWeight / 1   // VG_BASE_LINE_WEIGHT
        : 1;
    return {
        colour:  vg.edgeColor ?? pen.color,
        widthPx: pen.widthMm * SCREEN_PX_PER_MM * vgFactor,
    };
}

/** A user intent that paints CUT walls 5 mm magenta and leaves everything else alone. */
function extremeWallIntent(id: string): VisibilityIntent {
    const base = cloneSystemIntents()
        .find(i => i.id === SYSTEM_INTENT_IDS.architecturalDocumentation)!;
    const rules = JSON.parse(JSON.stringify(base.elementRules));
    for (const state of ['cut', 'projection', 'beyond', 'hidden'] as const) {
        rules.wall[state].line.colour = EXTREME_COLOUR;
        rules.wall[state].line.weight = EXTREME_WEIGHT_MM;
    }
    return { ...JSON.parse(JSON.stringify(base)), id, name: id, isSystem: false, elementRules: rules };
}

describe('§FIX-VISIBILITY-INTENT-AUTHORITY — the bound intent governs the drawn line', () => {
    beforeEach(() => {
        vgGovernanceStore.ensureModel('model-default', 'Model');
    });

    it('AS-IS PROBE: the built-in VG template really does carry a colour and a weight for wall', () => {
        // If this ever stops being true the defect this suite guards has changed shape,
        // and the guard below would go vacuous without anyone noticing.
        const { style } = vgGovernanceStore.resolveStyle('model-default', 'wall', undefined);
        expect(style.edgeColor).toBeTruthy();
        expect(style.lineWeight).toBeGreaterThan(0);
    });

    it('VG contributes NOTHING when no human overrode it — so the pen survives', () => {
        for (const [cat, tag] of [
            ['wall',   'A-WALL:cut'],
            ['door',   'A-DOOR:proj'],
            ['window', 'A-GLAZ:proj'],
            ['slab',   'A-FLOR:beyond'],
        ] as const) {
            const vg = resolveVgCanvasStyle(cat, tag, 'vd-no-override');
            expect(vg.edgeColor,  `${cat} edgeColor must not be seeded by a template`).toBeNull();
            expect(vg.lineWeight, `${cat} lineWeight must not be seeded by a template`).toBeNull();
        }
    });

    // The expected multiplier is the INTENT'S OWN `viewTypeModifiers.stateTransform.cut
    // .lineWeightMultiplier` (SystemIntents.ts: ELEVATION_MODIFIERS / SECTION_AND_DETAIL_
    // MODIFIERS both set 1.5 for wall). Asserting the exact per-view-type number is what
    // makes this a REACHABILITY guard for all three families at once: if the viewType tier
    // stopped running for section or elevation, plan would still pass and these would not.
    it.each([['plan', 1], ['section', 1.5], ['elevation', 1.5]] as const)(
        'POSITIVE CONTROL (%s): planting a 5 mm magenta wall rule visibly moves the stroke',
        (viewType, viewTypeMultiplier) => {
            const viewId   = `vd-extreme-${viewType}`;
            const intentId = `user-extreme-${viewType}`;
            visibilityIntentStore.create(extremeWallIntent(intentId));
            expect(viewIntentInstanceStore.assign(viewId, intentId)).not.toBeNull();

            // The VG cascade must contribute NO weight factor — otherwise the number below
            // would be the template's, not the intent's, and the equality would be a
            // coincidence rather than a proof.
            expect(resolveVgCanvasStyle('wall', 'A-WALL:cut', viewId).lineWeight).toBeNull();

            const { colour, widthPx } = composeStroke('wall', 'A-WALL:cut', 'CUT', viewId, viewType);
            expect(colour.toLowerCase()).toBe(EXTREME_COLOUR);
            expect(widthPx).toBeCloseTo(EXTREME_WEIGHT_MM * viewTypeMultiplier * SCREEN_PX_PER_MM, 5);
        },
    );

    it('an EXPLICIT VG per-view override still wins — the local-override layer is intact (C09 §4.3)', () => {
        const viewId = 'vd-vg-override';
        vgGovernanceStore.ensureView(viewId, 'Overridden', 'model-default');
        vgGovernanceStore.setViewCategoryOverride(viewId, "wall", { edgeColor: "#00ff00" });

        const vg = resolveVgCanvasStyle('wall', 'A-WALL:cut', viewId);
        expect(vg.edgeColor?.toLowerCase()).toBe('#00ff00');
    });
});
