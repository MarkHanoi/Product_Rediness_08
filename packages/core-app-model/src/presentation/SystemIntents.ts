import type { PlanViewRangeDefaults, PurposeModifier, VisibilityIntent } from './VisibilityIntentTypes';
import { cloneDefaultElementGraphicsRules } from './VisibilityIntentDefaults';

export const SYSTEM_INTENT_IDS = {
    architecturalDocumentation: 'system-architectural-documentation',
    cleanPresentation: 'system-clean-presentation',
    structuralCoordination: 'system-structural-coordination',
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
}): VisibilityIntent {
    const baseRules = cloneDefaultElementGraphicsRules();
    return {
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
}

const BUILT_IN_PURPOSE_MODIFIERS: PurposeModifier[] = [
    {
        purpose: 'construction-docs',
        elementType: 'wall',
        statePatch: {
            cut: { fill: { style: 'poche', colour: '#1a1a1a', opacity: 1.0 } },
        },
    },
    {
        purpose: 'construction-docs',
        elementType: 'slab',
        statePatch: {
            cut: { fill: { style: 'poche', colour: '#1a1a1a', opacity: 1.0 } },
        },
    },
    {
        purpose: 'construction-docs',
        elementType: 'column',
        statePatch: {
            cut: { fill: { style: 'poche', colour: '#1a1a1a', opacity: 1.0 } },
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

export const SYSTEM_VISIBILITY_INTENTS: readonly VisibilityIntent[] = Object.freeze([
    makeIntent({
        id: SYSTEM_INTENT_IDS.architecturalDocumentation,
        name: 'Architectural Documentation (Auto)',
        description: 'Default documentation intent using PRYZM pen-weight table conventions.',
        purposeModifiers: BUILT_IN_PURPOSE_MODIFIERS,
        planViewRange: { belowLevelDepth: 1.20, structuralPlanBelowLevelDepth: 1.20 },
        modifiers: [
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
            ...SECTION_AND_DETAIL_MODIFIERS,
        ],
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
