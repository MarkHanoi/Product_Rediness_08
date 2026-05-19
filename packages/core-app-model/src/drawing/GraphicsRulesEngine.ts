/**
 * GraphicsRulesEngine — Contract 23 §7
 *
 * Priority-based style resolver for the PRYZM drawing engine.
 * Layers GraphicsRule overrides on top of the locked SYSTEM_PEN_TABLE values
 * from PenWeightTable.ts.
 *
 * Priority tiers (Contract 23 §1.4 — locked):
 *   0        — system rules (PenWeightTable fallback)
 *   100–1000 — category-level rules
 *   9000     — view-level overrides
 *   10000    — element-level overrides
 *
 * Contract compliance:
 *   Contract 23 §7.1 — resolveStyle() is the ONLY style entry point for renders
 *   Contract 23 §7.3 — cache key: styleResolverCacheKey(elementId, viewId, zone:category)
 *   Contract 23 §7.4 — higher-priority rules win per-property (NOT whole-object)
 *   Contract 23 §8   — system defaults always come from PenWeightTable.resolvePen()
 */

import { type PenStyle, type PenZone, resolvePen } from './PenWeightTable';
import { styleResolverCacheKey } from './DrawingConstants';
import { resolveIntentPenStyle } from '../presentation/IntentRuleResolver';
import { visibilityIntentStore } from '../presentation/VisibilityIntentStore';
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';
import { getDefaultSystemIntentId } from '../presentation/SystemIntents';

export const RULE_PRIORITY_SYSTEM   =     0;
export const RULE_PRIORITY_CATEGORY =   100;
export const RULE_PRIORITY_INTENT   =  1000;
export const RULE_PRIORITY_VIEW_TYPE_MODIFIER = 5000;
export const RULE_PRIORITY_VIEW     =  9000;
export const RULE_PRIORITY_ELEMENT  = 10000;
export const RULE_PRIORITY_GRAPHIC_OVERRIDE = 50000;

export interface StyleResolverContext {
    viewId?: string;
    elementId?: string;
    intentInstanceId?: string;
    viewType?: string;
}

export interface GraphicsRule {
    priority: number;
    zone?: PenZone;
    category?: string;
    viewId?: string;
    elementId?: string;
    style: Partial<PenStyle>;
}

const CACHE_MAX_SIZE = 8_000;

export class GraphicsRulesEngine {

    private readonly _rules: GraphicsRule[] = [];
    private readonly _cache = new Map<string, PenStyle>();

    constructor() {
        if (typeof window !== 'undefined') {
            const clear = () => this._cache.clear();
            window.addEventListener('vi:instance-updated', clear);
            window.addEventListener('vi:overrides-cleared', clear);
            window.addEventListener('vi:intent-updated', clear);
            window.addEventListener('vi:intent-deleted', clear);
            window.addEventListener('vi:intent-store-loaded', clear);
            window.addEventListener('vi:instance-store-loaded', clear);
        }
    }

    addRule(rule: GraphicsRule): void {
        this._rules.push(rule);
        this._cache.clear();
    }

    addViewOverride(
        viewId:   string,
        zone:     PenZone,
        category: string,
        style:    Partial<PenStyle>,
    ): void {
        const idx = this._rules.findIndex(
            r => r.priority === RULE_PRIORITY_VIEW &&
                 r.viewId   === viewId             &&
                 r.zone     === zone               &&
                 r.category === category,
        );
        const rule: GraphicsRule = { priority: RULE_PRIORITY_VIEW, viewId, zone, category, style };
        if (idx >= 0) this._rules[idx] = rule;
        else           this._rules.push(rule);
        this._cache.clear();
    }

    addElementOverride(
        elementId: string,
        zone:      PenZone,
        category:  string,
        style:     Partial<PenStyle>,
    ): void {
        const idx = this._rules.findIndex(
            r => r.priority  === RULE_PRIORITY_ELEMENT &&
                 r.elementId === elementId             &&
                 r.zone      === zone                  &&
                 r.category  === category,
        );
        const rule: GraphicsRule = { priority: RULE_PRIORITY_ELEMENT, elementId, zone, category, style };
        if (idx >= 0) this._rules[idx] = rule;
        else           this._rules.push(rule);
        this._cache.clear();
    }

    removeViewOverrides(viewId: string): void {
        const before = this._rules.length;
        this._rules.splice(0, this._rules.length,
            ...this._rules.filter(r => r.viewId !== viewId),
        );
        if (this._rules.length !== before) this._cache.clear();
    }

    removeElementOverrides(elementId: string): void {
        const before = this._rules.length;
        this._rules.splice(0, this._rules.length,
            ...this._rules.filter(r => r.elementId !== elementId),
        );
        if (this._rules.length !== before) this._cache.clear();
    }

    resolveStyle(
        zone:     PenZone,
        category: string,
        ctx:      StyleResolverContext = {},
    ): PenStyle {
        const cacheKey = styleResolverCacheKey(
            ctx.elementId ?? '',
            ctx.viewId    ?? '',
            `${zone}:${category}:${ctx.intentInstanceId ?? ''}:${ctx.viewType ?? ''}`,
        );

        const cached = this._cache.get(cacheKey);
        if (cached) return cached;

        const matching = [
            ...this._intentRules(zone, category, ctx),
            ...this._rules.filter(r => this._matches(r, zone, category, ctx)),
        ];

        if (matching.length === 0) {
            const base = resolvePen(zone, category);
            this._cacheSet(cacheKey, base);
            return base;
        }

        matching.sort((a, b) => a.priority - b.priority);

        const resolved: PenStyle = { ...resolvePen(zone, category) };
        for (const rule of matching) {
            const s = rule.style;
            if (s.widthMm !== undefined) resolved.widthMm = s.widthMm;
            if (s.color   !== undefined) resolved.color   = s.color;
            if (s.dashPx  !== undefined) resolved.dashPx  = s.dashPx;
            if (s.opacity !== undefined) resolved.opacity  = s.opacity;
        }

        this._cacheSet(cacheKey, resolved);
        return resolved;
    }

    getRules(): GraphicsRule[] {
        return [...this._rules];
    }

    private _matches(
        rule:     GraphicsRule,
        zone:     PenZone,
        category: string,
        ctx:      StyleResolverContext,
    ): boolean {
        if (rule.zone     && rule.zone     !== zone)          return false;
        if (rule.category && rule.category !== category)      return false;
        if (rule.viewId   && rule.viewId   !== ctx.viewId)    return false;
        if (rule.elementId && rule.elementId !== ctx.elementId) return false;
        if (rule.priority === RULE_PRIORITY_VIEW    && !ctx.viewId)    return false;
        if (rule.priority === RULE_PRIORITY_ELEMENT && !ctx.elementId) return false;
        return true;
    }

    private _intentRules(zone: PenZone, category: string, ctx: StyleResolverContext): GraphicsRule[] {
        const viewId = ctx.viewId ?? ctx.intentInstanceId;
        const instance = viewId ? viewIntentInstanceStore.get(viewId) : undefined;
        const intentId = instance?.intentId ?? getDefaultSystemIntentId();
        const intent = visibilityIntentStore.get(intentId);
        if (!intent) return [];
        const virtualInstance = instance ?? {
            id: ctx.intentInstanceId ?? `default-${viewId ?? 'global'}`,
            viewId: viewId ?? '',
            intentId,
            localOverrides: {
                visibilityOverrides: [],
                graphicOverrides: [],
                isolateActive: false,
            },
            createdAt: '',
            updatedAt: '',
        };
        const style = resolveIntentPenStyle(
            virtualInstance,
            intent,
            category,
            zone,
            ctx.viewType ?? 'plan',
            {
                elementId: ctx.elementId,
                elementType: category,
                category,
            },
        );
        return [{ priority: RULE_PRIORITY_INTENT, zone, category, style }];
    }

    private _cacheSet(key: string, style: PenStyle): void {
        if (this._cache.size >= CACHE_MAX_SIZE) this._cache.clear();
        this._cache.set(key, style);
    }
}

export const graphicsRulesEngine = new GraphicsRulesEngine();
