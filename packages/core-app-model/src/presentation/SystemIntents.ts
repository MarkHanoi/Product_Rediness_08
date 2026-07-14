import type { DocumentationIntent, PlanViewRangeDefaults, PurposeModifier, VisibilityIntent } from './VisibilityIntentTypes';
import { cloneDefaultElementGraphicsRules } from './VisibilityIntentDefaults';
// §FEAT-WALL-POCHE-FILL-BY-INTENT (L-261) — the DENSE poché is an INTENT (the
// construction-docs purpose), not the system default. The system default is the light
// grey seeded from the pen/graphics table (see VisibilityIntentDefaults.fillFor).
import { POCHE_CONSTRUCTION_DOCS_FILL } from '../drawing/PocheFillTable';

export const SYSTEM_INTENT_IDS = {
    architecturalDocumentation: 'system-architectural-documentation',
    cleanPresentation: 'system-clean-presentation',
    structuralCoordination: 'system-structural-coordination',
    // §GHOST-FIX (founder 2026-06-09) — a plan intent that does NOT project the
    // storey BELOW the cut plane (belowLevelDepth 0). Auto-assigned to generated
    // per-storey + roof plan views so ground-floor walls stop ghosting through the
    // first-floor plan. Same pen/symbol conventions as the default doc intent.
    architecturalPlanCurrentLevel: 'system-architectural-plan-current-level',
    // §FEAT-SET-OUT-INTENT (L-289) — the DOCUMENTATION intent. The other four are
    // VISIBILITY intents (which categories, which pen); none of them documents the
    // drawing. See SET_OUT_DOCUMENTATION below.
    setOut: 'system-set-out',
} as const;

function now(): string {
    return '2026-01-01T00:00:00.000Z';
}

function makeIntent(params: {
    id: string;
    name: string;
    description: string;
    rules?: (rules: Record<string, any>) => Record<string, any>;
    modifiers?: VisibilityIntent['viewTypeModifiers'];
    purposeModifiers?: PurposeModifier[];
    planViewRange?: PlanViewRangeDefaults;
    /**
     * §FEAT-SET-OUT-INTENT (L-289) — OPTIONAL and ADDITIVE. An intent that omits it is
     * appearance-only and seeds NO documentation state onto the view it is bound to, so the
     * four pre-existing system intents resolve byte-for-byte as they did before.
     */
    documentation?: DocumentationIntent;
}): VisibilityIntent {
    const baseRules = cloneDefaultElementGraphicsRules();
    const intent: VisibilityIntent = {
        id: params.id,
        name: params.name,
        description: params.description,
        version: 1,
        isSystem: true,
        createdAt: now(),
        updatedAt: now(),
        elementRules: params.rules ? params.rules(baseRules) : baseRules,
        viewTypeModifiers: params.modifiers ?? [],
        purposeModifiers: params.purposeModifiers ?? [],
        planViewRange: params.planViewRange,
    };
    // Assigned conditionally so an appearance-only intent has NO `documentation` key at all —
    // `cloneSystemIntents()` round-trips through JSON, and an explicit `undefined` would be
    // dropped there anyway; keeping the key absent makes the byte-compare guard honest.
    if (params.documentation) intent.documentation = params.documentation;
    return intent;
}

const BUILT_IN_PURPOSE_MODIFIERS: PurposeModifier[] = [
    {
        purpose: 'construction-docs',
        elementType: 'wall',
        statePatch: {
            cut: { fill: { style: 'poche', colour: POCHE_CONSTRUCTION_DOCS_FILL, opacity: 1.0 } },
        },
    },
    {
        purpose: 'construction-docs',
        elementType: 'slab',
        statePatch: {
            cut: { fill: { style: 'poche', colour: POCHE_CONSTRUCTION_DOCS_FILL, opacity: 1.0 } },
        },
    },
    {
        purpose: 'construction-docs',
        elementType: 'column',
        statePatch: {
            cut: { fill: { style: 'poche', colour: POCHE_CONSTRUCTION_DOCS_FILL, opacity: 1.0 } },
        },
    },
    {
        purpose: 'design-review',
        statePatch: {
            projection: { line: { opacity: 0.75 }, fill: { style: 'solid', colour: '#e8f0fe', opacity: 0.55 } },
            beyond:     { line: { opacity: 0.25 } },
        },
    },
    {
        purpose: 'coordination',
        elementType: 'wall',
        statePatch: {
            cut:        { line: { colour: '#1a3a6b', weight: 0.5 } },
            projection: { line: { colour: '#2455a4', opacity: 0.7 } },
        },
    },
    {
        purpose: 'presentation',
        statePatch: {
            projection: { line: { opacity: 0.55 } },
            beyond:     { line: { opacity: 0.15 }, fill: { opacity: 0 } },
        },
    },
];

const DETAIL_LINE_WEIGHT_SCALE = 2;

/**
 * §ELEV-LINEWEIGHT (L-182) — elevation line-weight hierarchy.
 *
 * An elevation is a pure orthographic projection of a façade (ViewScope:
 * `cut:false, poche:false, depthProjected:true`). EdgeProjectorService already
 * classifies every element along view depth into cut / projection / beyond bands;
 * PenWeightTable already supplies the base ladder (projection 0.25 / beyond
 * 0.13-dashed-55% / hidden not drawn). What was missing was (a) any elevation
 * entry in the seed — so the Visibility Intents panel's Elevation tab showed
 * "No modifiers defined for this view type" (parity gap with Plan) — and (b)
 * emphasis on the `cut` band so a wall the elevation plane is drawn THROUGH reads
 * as the heaviest line (the building outline). These modifiers close both:
 *
 *   • wall / slab / roof / column — `cut` band ×1.5 (mirrors the section cut
 *     emphasis) → cut is the thickest tier when the plane passes through solid.
 *   • door / window — explicit `projection` pen (0.18 mm) so façade openings read
 *     as secondary linework and the two rows appear in the Elevation tab exactly
 *     like the Plan door/window pattern.
 *
 * projection / beyond / hidden otherwise inherit the base PenWeightTable ladder,
 * yielding: cut (0.75–1.05) > projection (0.25) > beyond (0.13 dashed) > hidden
 * (not drawn). Scoped strictly to `viewType: 'elevation'` — plan / section /
 * ceiling-plan behaviour is untouched.
 */
const ELEVATION_MODIFIERS: VisibilityIntent['viewTypeModifiers'] = [
    {
        viewType: 'elevation',
        elementType: 'wall',
        statePatch: {},
        stateTransform: { cut: { lineWeightMultiplier: 1.5 } },
    },
    {
        viewType: 'elevation',
        elementType: 'slab',
        statePatch: {},
        stateTransform: { cut: { lineWeightMultiplier: 1.5 } },
    },
    {
        viewType: 'elevation',
        elementType: 'roof',
        statePatch: {},
        stateTransform: { cut: { lineWeightMultiplier: 1.5 } },
    },
    {
        viewType: 'elevation',
        elementType: 'column',
        statePatch: {},
        stateTransform: { cut: { lineWeightMultiplier: 1.5 } },
    },
    {
        viewType: 'elevation',
        elementType: 'door',
        statePatch: { projection: { line: { weight: 0.18 } } },
    },
    {
        viewType: 'elevation',
        elementType: 'window',
        statePatch: { projection: { line: { weight: 0.18 } } },
    },
];

const SECTION_AND_DETAIL_MODIFIERS: VisibilityIntent['viewTypeModifiers'] = [
    {
        viewType: 'section',
        elementType: 'wall',
        statePatch: {},
        stateTransform: { cut: { lineWeightMultiplier: 1.5 } },
    },
    {
        viewType: 'section',
        elementType: 'slab',
        statePatch: {},
        stateTransform: { cut: { lineWeightMultiplier: 1.5 } },
    },
    {
        viewType: 'ceiling-plan',
        elementType: 'ceiling',
        statePatch: {},
        stateTransform: {
            projection: { sourceState: 'cut' },
            beyond: { sourceState: 'cut' },
        },
    },
    {
        viewType: 'ceiling-plan',
        elementType: 'slab',
        statePatch: {},
        stateTransform: {
            cut: { sourceState: 'beyond' },
            projection: { sourceState: 'beyond' },
        },
    },
    {
        viewType: 'ceiling-plan',
        elementType: 'wall',
        statePatch: {},
        stateTransform: {
            cut: { sourceState: 'projection' },
        },
    },
    {
        viewType: 'detail',
        statePatch: {},
        stateTransform: {
            cut: { lineWeightMultiplier: DETAIL_LINE_WEIGHT_SCALE },
            projection: { lineWeightMultiplier: DETAIL_LINE_WEIGHT_SCALE },
            beyond: { lineWeightMultiplier: DETAIL_LINE_WEIGHT_SCALE },
            hidden: { lineWeightMultiplier: DETAIL_LINE_WEIGHT_SCALE },
        },
    },
];

/**
 * The modifier set shared by every DOCUMENTATION intent (the two architectural ones and
 * §FEAT-SET-OUT-INTENT's Set Out). Extracted verbatim from the two intents that already
 * declared it inline — same entries, same order, so their resolved output is unchanged.
 *
 * It carries PLAN (door swing + cased window symbolic rules), 3D, ELEVATION and SECTION
 * modifiers together. A documentation intent that shipped plan-only would be the sixth
 * instance of the plan-first disease ADR-121 §1 was written about.
 */
const DOCUMENTATION_MODIFIERS: VisibilityIntent['viewTypeModifiers'] = [
    {
        viewType: 'plan',
        elementType: 'door',
        statePatch: { projection: { symbolicRule: 'plan-door-swing' } },
    },
    {
        viewType: 'plan',
        elementType: 'window',
        statePatch: { projection: { symbolicRule: 'plan-window-cased' } },
    },
    {
        viewType: '3d',
        elementType: 'wall',
        statePatch: { projection: { fill: { style: 'solid', colour: '#ffffff', opacity: 1 } } },
    },
    ...ELEVATION_MODIFIERS,
    ...SECTION_AND_DETAIL_MODIFIERS,
];

/**
 * §FEAT-SET-OUT-INTENT (L-289) — what "Set Out" MEANS, as data.
 *
 * The founder's demo is: draw walls → doors → windows → auto-dimension → elevations →
 * auto-tag → Set Out. Until now the last step had no door: `setOut.live` was a bare boolean
 * on the ViewDefinition that no UI wrote. This is the one knob that means all of it.
 *
 *   detailLevel: 'fine'  — a set-out drawing is the DETAILED one. It is also, concretely, what
 *                          makes the door rebate/lever and the window mullion appear: those are
 *                          the LOD-300 branches of the symbol builders (L-241 / L-278), gated on
 *                          exactly this enum. A set-out drawing at 'medium' is missing the very
 *                          construction detail it exists to set out.
 *   setOutLive: true     — the view re-derives its TAGS and its DIMENSIONS on every model change
 *                          (`registerSetOut` → `reconcileSetOutView`, plan AND elevation).
 *                          Idempotent by construction, so "live" is safe (L-286).
 */
const SET_OUT_DOCUMENTATION: DocumentationIntent = Object.freeze({
    detailLevel: 'fine',
    setOutLive:  true,
});

export const SYSTEM_VISIBILITY_INTENTS: readonly VisibilityIntent[] = Object.freeze([
    makeIntent({
        id: SYSTEM_INTENT_IDS.architecturalDocumentation,
        name: 'Architectural Documentation (Auto)',
        description: 'Default documentation intent using PRYZM pen-weight table conventions.',
        purposeModifiers: BUILT_IN_PURPOSE_MODIFIERS,
        planViewRange: { belowLevelDepth: 1.20, structuralPlanBelowLevelDepth: 1.20 },
        modifiers: DOCUMENTATION_MODIFIERS,
    }),
    makeIntent({
        // §GHOST-FIX — identical to the default documentation intent EXCEPT
        // belowLevelDepth 0: the plan does not project the storey below the cut.
        id: SYSTEM_INTENT_IDS.architecturalPlanCurrentLevel,
        name: 'Architectural Plan — Current Level Only',
        description: 'Documentation plan intent that does NOT show the storey below (belowLevelDepth 0).',
        purposeModifiers: BUILT_IN_PURPOSE_MODIFIERS,
        planViewRange: { belowLevelDepth: 0, structuralPlanBelowLevelDepth: 0 },
        modifiers: DOCUMENTATION_MODIFIERS,
    }),
    makeIntent({
        // §FEAT-SET-OUT-INTENT (L-289) — THE LIVE-DOCUMENTATION INTENT.
        //
        // Graphically it IS the architectural documentation intent (same pens, same symbolic
        // rules, same poché purposes, same below-level depth) — a set-out drawing is a
        // documentation drawing. What it adds is the `documentation` block: the view is
        // DOCUMENTED (tags + dimensions) and STAYS documented as the model changes, at LOD-300.
        //
        // ONE choice, not a checkbox soup: picking this from the intent dropdown is the whole
        // feature. That is the product promise of L-286 — "the user should never think about
        // regenerating tags or dimensions".
        id: SYSTEM_INTENT_IDS.setOut,
        name: 'Set Out — Live Documentation',
        description:
            'Documentation intent that keeps the drawing TRUE: tags and dimensions are re-derived ' +
            'on every model change, at LOD-300 (Fine). Plan and elevation.',
        purposeModifiers: BUILT_IN_PURPOSE_MODIFIERS,
        planViewRange: { belowLevelDepth: 1.20, structuralPlanBelowLevelDepth: 1.20 },
        modifiers: DOCUMENTATION_MODIFIERS,
        documentation: SET_OUT_DOCUMENTATION,
    }),
    makeIntent({
        id: SYSTEM_INTENT_IDS.cleanPresentation,
        name: 'Clean Presentation',
        description: 'Simplified presentation intent with lighter projected linework and reduced beyond visibility.',
        rules: rules => {
            for (const rule of Object.values(rules)) {
                rule.projection.line.weight = Math.min(rule.projection.line.weight, 0.18);
                rule.beyond.line.opacity = Math.min(rule.beyond.line.opacity, 0.3);
                rule.beyond.fill.opacity = 0;
            }
            return rules;
        },
    }),
    makeIntent({
        id: SYSTEM_INTENT_IDS.structuralCoordination,
        name: 'Structural Coordination',
        description: 'Coordination intent that emphasizes structural elements and ghosts non-structural projection geometry.',
        planViewRange: { belowLevelDepth: 1.20, structuralPlanBelowLevelDepth: 1.20 },
        rules: rules => {
            for (const [elementType, rule] of Object.entries(rules)) {
                const structural = ['column', 'beam', 'structural', 'slab'].includes(elementType);
                if (structural) {
                    rule.cut.line.weight = Math.max(rule.cut.line.weight, 0.7);
                    rule.projection.line.weight = Math.max(rule.projection.line.weight, 0.35);
                    rule.projection.line.colour = '#111827';
                } else if (elementType !== '__default__') {
                    rule.projection.line.opacity = 0.35;
                    rule.beyond.line.opacity = 0.2;
                    rule.projection.ghostStyle = 'fade';
                    rule.projection.ghostOpacity = 0.25;
                }
            }
            return rules;
        },
    }),
]);

export function getDefaultSystemIntentId(): string {
    return SYSTEM_INTENT_IDS.architecturalDocumentation;
}

export function cloneSystemIntents(): VisibilityIntent[] {
    return JSON.parse(JSON.stringify(SYSTEM_VISIBILITY_INTENTS));
}
