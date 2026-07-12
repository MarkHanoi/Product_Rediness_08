/**
 * DetailLevelResolver — §FEAT-DOOR-PLAN-SYMBOL-DETAIL-LEVEL (L-241) P2
 *
 * SHARED DRAWING INFRASTRUCTURE. The ONE place that answers:
 *
 *     "at what Detail Level must element E be drawn in view V?"
 *
 * WHY IT IS SHARED (and not inside DoorPlanSymbolBuilder)
 * ─────────────────────────────────────────────────────────────────────────────
 * Doors are merely the FIRST consumer. Windows, stairs, plumbing (L-221),
 * furniture and columns all have plan symbols and all need the same answer. If
 * this precedence lived inside the door builder it would become the fourth
 * per-element-type if-ladder in the codebase (cf. the L-215 rebuild ladder, the
 * L-229 drag branches, the L-233 explode allowlist). Every new symbol builder
 * calls THIS function and switches on its return value — nothing else.
 *
 * PRECEDENCE (highest wins) — ONE authority, defined order
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. C09 per-ELEMENT graphic override    (GraphicOverride targetKind 'element')
 *   2. C09 per-ELEMENT-TYPE override       (GraphicOverride targetKind 'elementType')
 *   3. C09 per-CATEGORY override           (GraphicOverride targetKind 'category')
 *   4. The VIEW's own setting              (ViewDefinition.output.detailLevel —
 *                                           the LIVE properties-panel dropdown)
 *   5. DEFAULT_DETAIL_LEVEL ('medium')
 *
 * Tiers 1–3 are the founder's "also through the visibility intent" knob; tier 4
 * is his "in the properties panel the user can choose" knob. Both knobs, ONE
 * authority — deliberately NOT a second per-element `lod` field on the element
 * record (that is the two-authorities-over-one-pixel collision behind L-223).
 *
 * P7 — Detail Level is visibility INTENT (a domain concept), not UI state: it is
 * stored on the ViewDefinition / the C09 override layer, never in a panel.
 *
 * Contract compliance:
 *   C09     — visibility intent is the override authority (GraphicOverride.patch)
 *   C03/P5  — the enum itself is owned by L0 `@pryzm/schemas`
 *   §01 §5  — pure read; no store mutation
 *   §05     — no DOM, no THREE
 *   P8      — the exported resolver emits one span
 */

import { trace, SpanStatusCode, type Tracer } from '@opentelemetry/api';
import type { DetailLevel } from '@pryzm/schemas/view/detail-level';
import { viewDefinitionStore } from '../views/ViewDefinitionStore.js';
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore.js';
import type { GraphicOverride, OverrideTargetKind } from '../presentation/VisibilityIntentTypes.js';

/** Canonical fallback when nothing in the precedence chain says otherwise. */
export const DEFAULT_DETAIL_LEVEL: DetailLevel = 'medium';

const _VALID: readonly string[] = ['coarse', 'medium', 'fine'];

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/core-app-model/drawing', '0.1.0');
    return _cachedTracer;
}

/** Narrow an unknown value to a canonical DetailLevel (lower-cases legacy input). */
function _asDetailLevel(v: unknown): DetailLevel | undefined {
    if (typeof v !== 'string') return undefined;
    const lower = v.toLowerCase();
    return _VALID.includes(lower) ? (lower as DetailLevel) : undefined;
}

export interface DetailLevelTargets {
    /**
     * The element's type string as used by the C09 intent system — e.g. 'door',
     * 'window', 'stair'. Matched against `GraphicOverride.targetKind = 'elementType'`.
     */
    elementType?: string;
    /**
     * The element's category as used by the VG / pen tables — e.g. 'door'.
     * Matched against `GraphicOverride.targetKind = 'category'`.
     */
    category?: string;
}

/**
 * Find the first graphic override that targets `kind`/`id` and carries a
 * `detailLevel` patch. State is intentionally ignored: Detail Level is a
 * PROPERTY OF THE SYMBOL, not of a cut/projection state — a door cannot be
 * Fine in its cut lines and Coarse in its swing arc.
 */
function _overrideDetailLevel(
    overrides: readonly GraphicOverride[],
    kind: OverrideTargetKind,
    id: string | undefined,
): DetailLevel | undefined {
    if (!id) return undefined;
    for (const o of overrides) {
        if (o.targetKind !== kind) continue;
        if (o.targetId !== id) continue;
        const dl = _asDetailLevel((o.patch as { detailLevel?: unknown } | undefined)?.detailLevel);
        if (dl) return dl;
    }
    return undefined;
}

/**
 * Resolve the effective Detail Level for one element in one view.
 *
 * Pure read — safe to call once per element per projection. Never throws: any
 * missing store / view / intent instance degrades to the next precedence tier
 * and ultimately to `DEFAULT_DETAIL_LEVEL`, so a symbol builder always draws.
 *
 * @param elementId  The element's stable UUID (a door id, window id, …).
 * @param viewId     The ViewDefinition id currently being projected.
 * @param targets    Optional elementType / category used for the broader
 *                   (all-doors / whole-category) intent overrides.
 */
export function resolveEffectiveDetailLevel(
    elementId: string | undefined,
    viewId: string | undefined,
    targets: DetailLevelTargets = {},
): DetailLevel {
    const span = _tracer().startSpan('pryzm.drawing.resolve-detail-level');
    try {
        let level: DetailLevel = DEFAULT_DETAIL_LEVEL;
        let source = 'default';

        // ── Tiers 1–3: C09 visibility-intent overrides on this view's instance ──
        const instance = viewId ? viewIntentInstanceStore.get(viewId) : undefined;
        const overrides = instance?.localOverrides?.graphicOverrides ?? [];

        const perElement = _overrideDetailLevel(overrides, 'element', elementId);
        const perType    = perElement ? undefined : _overrideDetailLevel(overrides, 'elementType', targets.elementType);
        const perCat     = (perElement || perType) ? undefined : _overrideDetailLevel(overrides, 'category', targets.category);

        if (perElement) {
            level = perElement; source = 'override:element';
        } else if (perType) {
            level = perType; source = 'override:elementType';
        } else if (perCat) {
            level = perCat; source = 'override:category';
        } else {
            // ── Tier 4: the VIEW's own Detail Level (the live panel dropdown) ──
            const view = viewId ? viewDefinitionStore.get(viewId) : undefined;
            const fromView = _asDetailLevel(view?.output?.detailLevel);
            if (fromView) { level = fromView; source = 'view'; }
        }

        span.setAttribute('pryzm.detail_level', level);
        span.setAttribute('pryzm.detail_level.source', source);
        span.setStatus({ code: SpanStatusCode.OK });
        return level;
    } catch (err) {
        span.recordException(err as Error);
        return DEFAULT_DETAIL_LEVEL;
    } finally {
        span.end();
    }
}
