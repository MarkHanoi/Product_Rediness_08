/**
 * @file legacyGovernanceStore.ts
 * @migration S88-WIRE (2026-05-01) — moved from `src/visibility/VGGovernanceStore.ts`
 *   to `packages/visibility/src/legacyGovernanceStore.ts` (L3).  The `src/visibility/`
 *   directory is deleted by this migration.  Four structural importers in element
 *   builders have been updated to `@pryzm/visibility`.
 *
 * @deprecated Contract 25b — slated for removal in a follow-up release.
 *
 * This is a builder-time consultation surface kept ONLY because four element
 * builders (Door / Window) still call `getEffectiveStyle()` synchronously during
 * geometry generation. New code MUST go through `viewIntentInstanceStore` +
 * `IntentRuleResolver` (the Visibility Intent system, Contract 25). This file
 * will become a thin shim that reads through the resolver in a follow-up.
 *
 * Do NOT add new importers. Do NOT add new methods.
 *
 * VGGovernanceStore — §25 Visibility & Governance (LEGACY)
 *
 * Single source of truth for runtime VG style overrides applied to elements
 * during builder projection. Builders consult this store to obtain the
 * "effective style" for an element / category before instantiating materials,
 * so per-view overrides can recolour or hide elements without rebuilding the
 * underlying store data.
 *
 * §DOOR-AUDIT-2026 / §WIN-AUDIT-2026 W5 (WIN-VG-BYPASS):
 *   Both `DoorBuilder` and `WindowBuilder` consult this store. The store
 *   currently returns no overrides by default — it is a contract surface that
 *   the VG command layer (`src/commands/vg/*`) writes to as templates, view
 *   intents, and instance overrides are applied. Builders that go through this
 *   API are forward-compatible with all VG governance work without churn.
 *
 * Contract:
 *  - §01 §3 store immutability: every returned VGStyle is frozen.
 *  - §07: no `(window as any)` access; pure module singleton.
 *  - §25: per-view overrides take precedence over per-instance, which take
 *         precedence over per-category, which take precedence over defaults.
 *
 * PURE: no DOM, no THREE, no Node-only globals.
 */

export interface VGStyle {
    /** Hex / CSS colour to override the builder's default frame/leaf colour. */
    colorOverride?: string;
    /** Multiplicative opacity factor applied on top of the builder's base value. */
    opacityFactor?: number;
    /** When true, the builder must not project this element at all. */
    hidden?: boolean;
}

const FROZEN_EMPTY: VGStyle = Object.freeze({});

/** Lookup key for instance-level overrides. */
function instanceKey(category: string, elementId: string, viewId?: string): string {
    return viewId ? `${viewId}::${category}::${elementId}` : `*::${category}::${elementId}`;
}
/** Lookup key for category-level overrides. */
function categoryKey(category: string, viewId?: string): string {
    return viewId ? `${viewId}::${category}` : `*::${category}`;
}

class VGGovernanceStoreImpl {
    private _instance: Map<string, VGStyle> = new Map();
    private _category: Map<string, VGStyle> = new Map();

    /**
     * Resolve the effective VG style for an element.
     * Lookup precedence (highest → lowest):
     *   1. view + instance override
     *   2. global instance override
     *   3. view + category override
     *   4. global category override
     *   5. empty (frozen)
     */
    getEffectiveStyle(category: string, elementId: string, viewId?: string): VGStyle {
        if (viewId) {
            const v = this._instance.get(instanceKey(category, elementId, viewId));
            if (v) return v;
        }
        const i = this._instance.get(instanceKey(category, elementId));
        if (i) return i;
        if (viewId) {
            const c = this._category.get(categoryKey(category, viewId));
            if (c) return c;
        }
        const cAll = this._category.get(categoryKey(category));
        if (cAll) return cAll;
        return FROZEN_EMPTY;
    }

    setInstanceOverride(category: string, elementId: string, style: VGStyle, viewId?: string): void {
        this._instance.set(instanceKey(category, elementId, viewId), Object.freeze({ ...style }));
    }

    clearInstanceOverride(category: string, elementId: string, viewId?: string): void {
        this._instance.delete(instanceKey(category, elementId, viewId));
    }

    setCategoryStyle(category: string, style: VGStyle, viewId?: string): void {
        this._category.set(categoryKey(category, viewId), Object.freeze({ ...style }));
    }

    clearCategoryStyle(category: string, viewId?: string): void {
        this._category.delete(categoryKey(category, viewId));
    }

    /** Wipes all overrides. Used by project clear / project load. */
    clearAll(): void {
        this._instance.clear();
        this._category.clear();
    }
}

export const vgGovernanceStore = new VGGovernanceStoreImpl();
