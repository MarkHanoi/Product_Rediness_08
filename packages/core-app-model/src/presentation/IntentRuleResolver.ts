import type { PenStyle, PenZone } from '../drawing/PenWeightTable';
import type {
    AppearancePatch,
    ElementGraphicsRules,
    ElementState,
    ElementStateAppearance,
    GraphicOverride,
    OverrideTargetKind,
    ThreeDimensionalAppearance,
    ViewIntentInstance,
    ViewSeed,
    VisibilityIntent,
    VisibilityOverride,
} from './VisibilityIntentTypes';
import type {
    ViewCropSettings,
    ViewDefinition,
    ViewOutputSettings,
    ViewRangeSettings,
    ViewUnderlaySettings,
} from '../views/ViewDefinitionTypes';
import { defaultRulesForElementType } from './VisibilityIntentDefaults';

const ZONE_TO_STATE: Record<PenZone, ElementState> = {
    CUT: 'cut',
    PROJECTION: 'projection',
    BEYOND: 'beyond',
    HIDDEN: 'hidden',
};

const LINE_STYLE_TO_DASH: Record<ElementStateAppearance['line']['style'], number[] | null> = {
    solid: null,
    dashed: [4, 3],
    dotted: [2, 2],
    chain: [8, 4, 2, 4],
};

export interface IntentResolveTarget {
    elementId?: string;
    elementType: string;
    category?: string;
}

function cloneAppearance(value: ElementStateAppearance): ElementStateAppearance {
    return JSON.parse(JSON.stringify(value));
}

function applyStateTransform(
    appearance: ElementStateAppearance,
    transform: NonNullable<VisibilityIntent['viewTypeModifiers'][number]['stateTransform']>[ElementState] | undefined,
    rule: ElementGraphicsRules,
): ElementStateAppearance {
    if (!transform) return appearance;
    let next = transform.sourceState ? cloneAppearance(rule[transform.sourceState]) : appearance;
    if (typeof transform.lineWeightMultiplier === 'number' && Number.isFinite(transform.lineWeightMultiplier)) {
        next = mergeAppearance(next, {
            line: {
                weight: next.line.weight * transform.lineWeightMultiplier,
            },
        });
    }
    return next;
}

function mergeAppearance(base: ElementStateAppearance, patch?: AppearancePatch): ElementStateAppearance {
    if (!patch) return base;
    return {
        ...base,
        ...(patch.visible !== undefined ? { visible: patch.visible } : {}),
        ...(patch.ghostStyle !== undefined ? { ghostStyle: patch.ghostStyle } : {}),
        ...(patch.ghostOpacity !== undefined ? { ghostOpacity: patch.ghostOpacity } : {}),
        ...(patch.symbolicRule !== undefined ? { symbolicRule: patch.symbolicRule } : {}),
        line: { ...base.line, ...(patch.line ?? {}) },
        fill: { ...base.fill, ...(patch.fill ?? {}) },
    };
}

function targetMatches(kind: OverrideTargetKind, targetId: string, target: IntentResolveTarget): boolean {
    if (kind === 'element') return !!target.elementId && target.elementId === targetId;
    if (kind === 'elementType') return target.elementType === targetId;
    return target.category === targetId || target.elementType === targetId;
}

function graphicOverrideMatches(override: GraphicOverride, state: ElementState, target: IntentResolveTarget): boolean {
    return override.state === state && targetMatches(override.targetKind, override.targetId, target);
}

function visibilityOverrideMatches(override: VisibilityOverride, target: IntentResolveTarget): boolean {
    return targetMatches(override.targetKind, override.targetId, target);
}

function rulesFor(intent: VisibilityIntent, elementType: string): ElementGraphicsRules {
    const isIfc = elementType.startsWith('ifc-');
    const exact = intent.elementRules[elementType];
    if (exact) return exact;

    const structuralStripped = intent.elementRules[elementType.replace(/^structural-/, '')];
    if (structuralStripped && !isIfc) return structuralStripped;

    if (isIfc) {
        const ifcUmbrella = intent.elementRules['ifc-element'];
        if (ifcUmbrella) return ifcUmbrella;
    }

    return intent.elementRules[elementType.split('-').at(-1) ?? elementType]
        ?? intent.elementRules.__default__
        ?? defaultRulesForElementType(elementType);
}

export function stateFromPenZone(zone: PenZone): ElementState {
    return ZONE_TO_STATE[zone];
}

export function isElementTypeFullyHidden(
    intent: VisibilityIntent,
    elementType: string,
): boolean {
    const rule = rulesFor(intent, elementType);
    return !rule.cut.visible
        && !rule.projection.visible
        && !rule.beyond.visible
        && !rule.hidden.visible;
}

export function normaliseIfcUserDataType(rawType: string | undefined): string {
    if (!rawType) return 'ifc-element';
    const lower = rawType.toLowerCase().replace(/^ifc/, '').trim();
    if (lower === '' || lower === 'element') return 'ifc-element';
    return `ifc-${lower}`;
}

export function appearanceToPenStyle(appearance: ElementStateAppearance): Partial<PenStyle> {
    if (!appearance.visible) {
        return {
            widthMm: 0,
            opacity: 0,
        };
    }
    return {
        widthMm: appearance.line.weight,
        color: appearance.line.colour,
        opacity: appearance.line.opacity,
        dashPx: LINE_STYLE_TO_DASH[appearance.line.style],
    };
}

export function resolveIntentStyle(
    intentInstance: ViewIntentInstance,
    intent: VisibilityIntent,
    elementType: string,
    state: ElementState,
    viewType: string,
    target: Partial<IntentResolveTarget> = {},
    viewPurpose?: string,
): ElementStateAppearance {
    const resolvedTarget: IntentResolveTarget = {
        elementId: target.elementId,
        elementType,
        category: target.category ?? elementType,
    };
    const rule = rulesFor(intent, elementType);
    let appearance = cloneAppearance(rule[state]);

    const profile = intent.viewTypeProfiles?.[viewType];
    const isIfcElement = elementType.startsWith('ifc-');
    const profileRule = profile?.elementRules?.[elementType]
        ?? (isIfcElement ? undefined : profile?.elementRules?.[elementType.replace(/^structural-/, '')])
        ?? (isIfcElement ? profile?.elementRules?.['ifc-element'] : undefined)
        ?? profile?.elementRules?.[elementType.split('-').at(-1) ?? elementType]
        ?? profile?.elementRules?.__default__;
    if (profileRule) {
        if (profileRule.visible === false) {
            return mergeAppearance(appearance, { visible: false, line: { opacity: 0, weight: 0 } });
        }
        const profileStatePatch = profileRule[state];
        if (profileStatePatch) {
            appearance = mergeAppearance(appearance, profileStatePatch);
        }
    } else if (rule.visible === false) {
        return mergeAppearance(appearance, { visible: false, line: { opacity: 0, weight: 0 } });
    }

    for (const modifier of intent.viewTypeModifiers) {
        if (modifier.viewType !== viewType) continue;
        if (modifier.elementType && modifier.elementType !== elementType) continue;
        appearance = applyStateTransform(appearance, modifier.stateTransform?.[state], rule);
        appearance = mergeAppearance(appearance, modifier.statePatch[state]);
    }

    if (viewPurpose && intent.purposeModifiers) {
        for (const modifier of intent.purposeModifiers) {
            if (modifier.purpose !== viewPurpose) continue;
            if (modifier.elementType && modifier.elementType !== elementType) continue;
            appearance = mergeAppearance(appearance, modifier.statePatch[state]);
        }
    }

    const overrides = intentInstance.localOverrides;
    const isolateTargets = overrides.visibilityOverrides.filter(o => o.action === 'isolate');
    if (overrides.isolateActive && !isolateTargets.some(o => visibilityOverrideMatches(o, resolvedTarget))) {
        return mergeAppearance(appearance, { visible: false, line: { opacity: 0, weight: 0 } });
    }

    for (const override of overrides.visibilityOverrides) {
        if (!visibilityOverrideMatches(override, resolvedTarget)) continue;
        if (override.action === 'hide') {
            return mergeAppearance(appearance, { visible: false, line: { opacity: 0, weight: 0 } });
        }
        if (override.action === 'ghost') {
            appearance = mergeAppearance(appearance, {
                line: {
                    opacity: appearance.ghostOpacity ?? 0.35,
                    style: override.ghostStyle === 'dash' ? 'dashed' : appearance.line.style,
                },
                fill: { opacity: 0 },
            });
        }
    }

    for (const override of overrides.graphicOverrides) {
        if (graphicOverrideMatches(override, state, resolvedTarget)) {
            appearance = mergeAppearance(appearance, override.patch);
        }
    }

    return appearance;
}

export function resolveSurface3D(
    intentInstance: ViewIntentInstance,
    intent: VisibilityIntent,
    elementType: string,
    state: ElementState = 'projection',
    target: Partial<IntentResolveTarget> = {},
    viewPurpose?: string,
): ThreeDimensionalAppearance {
    const appearance = resolveIntentStyle(intentInstance, intent, elementType, state, '3d', target, viewPurpose);
    if (appearance.surface3D) return { ...appearance.surface3D };
    return {
        colour:    appearance.fill?.colour ?? appearance.line?.colour ?? '#cccccc',
        opacity:   appearance.fill?.opacity ?? 1,
        edges:     true,
        material:  'flat',
    };
}

export function resolveSurface3DExplicit(
    intentInstance: ViewIntentInstance,
    intent: VisibilityIntent,
    elementType: string,
    state: ElementState = 'projection',
    target: Partial<IntentResolveTarget> = {},
    viewPurpose?: string,
): ThreeDimensionalAppearance | null {
    const appearance = resolveIntentStyle(intentInstance, intent, elementType, state, '3d', target, viewPurpose);
    if (!appearance.surface3D) return null;
    return { ...appearance.surface3D };
}

export interface InheritanceContext {
    getParentViewId(viewId: string): string | null;
    getInstance(viewId: string): ViewIntentInstance | null;
    getIntent(intentId: string): VisibilityIntent | null;
}

export function resolveWithInheritance(
    viewId: string,
    ctx: InheritanceContext,
): { instance: ViewIntentInstance; intent: VisibilityIntent } | null {
    const seen = new Set<string>();
    let current: string | null = viewId;
    let leafInstance: ViewIntentInstance | null = null;
    while (current && !seen.has(current)) {
        seen.add(current);
        const instance = ctx.getInstance(current);
        if (instance) {
            const intent = ctx.getIntent(instance.intentId);
            if (intent) {
                if (!leafInstance) leafInstance = instance;
                return { instance: leafInstance, intent };
            }
        }
        current = ctx.getParentViewId(current);
    }
    return null;
}

export function resolveIntentPenStyle(
    intentInstance: ViewIntentInstance,
    intent: VisibilityIntent,
    elementType: string,
    zone: PenZone,
    viewType: string,
    target: Partial<IntentResolveTarget> = {},
): Partial<PenStyle> {
    return appearanceToPenStyle(
        resolveIntentStyle(intentInstance, intent, elementType, stateFromPenZone(zone), viewType, target),
    );
}

export type IntentFieldSource = 'system-default' | 'intent' | 'profile' | 'override';

export interface ResolvedField<T> {
    value:  T;
    source: IntentFieldSource;
}

export interface SourceContribution {
    origin: IntentFieldSource;
    value:  ElementStateAppearance;
}

export function resolveViewSeed(intent: VisibilityIntent): ViewSeed | undefined {
    return intent.viewSeed;
}

export function resolveViewRange(
    intent: VisibilityIntent,
    def: ViewDefinition,
    viewType: string,
    systemDefault: () => ViewRangeSettings,
): ResolvedField<ViewRangeSettings> {
    if (def.viewRange) {
        return { value: def.viewRange, source: 'override' };
    }
    const profile = intent.viewTypeProfiles?.[viewType]?.viewRange;
    if (profile && Object.keys(profile).length > 0) {
        return {
            value:  { ...systemDefault(), ...profile } as ViewRangeSettings,
            source: 'profile',
        };
    }
    if (intent.planViewRange) {
        const base = systemDefault();
        const belowDepth = viewType === 'structural-plan'
            ? (intent.planViewRange.structuralPlanBelowLevelDepth ?? intent.planViewRange.belowLevelDepth)
            : intent.planViewRange.belowLevelDepth;
        if (typeof belowDepth === 'number' && belowDepth > 0) {
            return {
                value: {
                    ...base,
                    depth: { ...base.depth, offset: -belowDepth },
                },
                source: 'intent',
            };
        }
    }
    return { value: systemDefault(), source: 'system-default' };
}

export function resolveCrop(
    intent: VisibilityIntent,
    def: ViewDefinition,
    viewType: string,
    systemDefault: () => ViewCropSettings,
): ResolvedField<ViewCropSettings> {
    if (def.crop) {
        return { value: def.crop, source: 'override' };
    }
    const profile = intent.viewTypeProfiles?.[viewType]?.crop;
    if (profile && Object.keys(profile).length > 0) {
        return {
            value:  { ...systemDefault(), ...profile } as ViewCropSettings,
            source: 'profile',
        };
    }
    return { value: systemDefault(), source: 'system-default' };
}

export function resolveUnderlay(
    intent: VisibilityIntent,
    def: ViewDefinition,
    viewType: string,
    systemDefault: () => ViewUnderlaySettings,
): ResolvedField<ViewUnderlaySettings> {
    if (def.underlay) {
        return { value: def.underlay, source: 'override' };
    }
    const profile = intent.viewTypeProfiles?.[viewType]?.underlay;
    if (profile && Object.keys(profile).length > 0) {
        return {
            value:  { ...systemDefault(), ...profile } as ViewUnderlaySettings,
            source: 'profile',
        };
    }
    return { value: systemDefault(), source: 'system-default' };
}

export function resolveOutput(
    intent: VisibilityIntent,
    def: ViewDefinition,
    viewType: string,
    systemDefault: () => ViewOutputSettings,
): ResolvedField<ViewOutputSettings> {
    if (def.output) {
        return { value: def.output, source: 'override' };
    }
    const profile = intent.viewTypeProfiles?.[viewType]?.output;
    if (profile && Object.keys(profile).length > 0) {
        return {
            value:  { ...systemDefault(), ...profile } as ViewOutputSettings,
            source: 'profile',
        };
    }
    return { value: systemDefault(), source: 'system-default' };
}

export function resolveWithSourceChain(
    intentInstance: ViewIntentInstance,
    intent: VisibilityIntent,
    elementType: string,
    state: ElementState,
    viewType: string,
    target: Partial<IntentResolveTarget> = {},
    viewPurpose?: string,
): { value: ElementStateAppearance; chain: SourceContribution[] } {
    const chain: SourceContribution[] = [];

    const systemRule = defaultRulesForElementType(elementType);
    const systemAppearance = cloneAppearance(systemRule[state]);
    chain.push({ origin: 'system-default', value: systemAppearance });

    const intentRule = rulesFor(intent, elementType);
    if (intentRule !== systemRule) {
        chain.push({ origin: 'intent', value: cloneAppearance(intentRule[state]) });
    }

    const profile = intent.viewTypeProfiles?.[viewType];
    const profileRule = profile?.elementRules?.[elementType]
        ?? profile?.elementRules?.[elementType.replace(/^structural-/, '')]
        ?? profile?.elementRules?.__default__;
    if (profileRule?.[state]) {
        const merged = mergeAppearance(cloneAppearance(intentRule[state]), profileRule[state]);
        chain.push({ origin: 'profile', value: merged });
    }

    const finalValue = resolveIntentStyle(intentInstance, intent, elementType, state, viewType, target, viewPurpose);

    const layer = intentInstance.localOverrides;
    const hasOverride = layer.isolateActive
        || layer.visibilityOverrides.length > 0
        || layer.graphicOverrides.length > 0;
    if (hasOverride) {
        chain.push({ origin: 'override', value: finalValue });
    } else {
        const last = chain[chain.length - 1];
        if (last && last.value !== finalValue) {
            chain[chain.length - 1] = { origin: last.origin, value: finalValue };
        }
    }

    return { value: finalValue, chain };
}
