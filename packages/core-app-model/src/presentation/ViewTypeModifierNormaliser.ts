/**
 * ViewTypeModifierNormaliser — §VIEW-MODIFIER-KEY-IS-UNIQUE (L-1602)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ONE ROW PER (viewType, elementType). THE PANEL EDITS THE ROW THAT APPLIES.
 * ═══════════════════════════════════════════════════════════════════════════════
 * The founder, with a screenshot of TWO IDENTICAL `elevation / slab` rows carrying
 * DIFFERENT cut fills: *"i changed the CUT fill colour for slab and walls — and
 * nothing changed."*
 *
 * MEASURED MECHANISM — `IntentRuleResolver.resolveIntentStyle()`:
 *
 *     for (const modifier of intent.viewTypeModifiers) {
 *         if (modifier.viewType !== viewType) continue;
 *         if (modifier.elementType && modifier.elementType !== elementType) continue;
 *         appearance = mergeAppearance(appearance, modifier.statePatch[state]);
 *     }
 *
 * `viewTypeModifiers` is a plain ARRAY with no uniqueness constraint. Every matching
 * entry is merged, in array order, so the LAST one silently wins. Meanwhile
 * `VisibilityIntentPanel.renderModifiers()` renders every entry as its own editable
 * row and `updateModifier()` addresses them BY INDEX. So a user presented with two
 * rows for the same key has a 50% chance of editing the one that loses — and the
 * product gives them no way to tell which is which. "Nothing changed" is the honest
 * outcome of an ambiguity the UI created and never disclosed.
 *
 * There was no dedup and no precedence rule anywhere. That absence IS the defect.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE: COLLAPSE, DO NOT DROP
 * ─────────────────────────────────────────────────────────────────────────────
 * Entries sharing a key are merged into the FIRST one's position, later entries
 * winning per-field — which is exactly the precedence the resolver already applied,
 * so no drawing changes appearance as a result of normalising. Nothing a user
 * authored is discarded: a field set only on the earlier row survives, and a field
 * set on both resolves to the later value, as it already did.
 *
 * Merging rather than "keep the last" matters. Two rows that each set a DIFFERENT
 * state (one `cut`, one `projection`) are not rivals at all — dropping either would
 * destroy real work while claiming to tidy up.
 *
 * ⚠ `elementType: undefined` means "ALL element types for this view type" and is a
 * DISTINCT key from any named type — the resolver treats it that way (`if
 * (modifier.elementType && …)`). It is keyed here as `*` and must never be folded
 * into a named row.
 */
import type { ViewTypeModifier, AppearancePatch } from './VisibilityIntentTypes';

/** `elementType: undefined` — "all element types". A distinct key, never folded. */
const ALL_ELEMENT_TYPES = '*';

function keyOf(m: ViewTypeModifier): string {
    return `${m.viewType}\u0000${m.elementType ?? ALL_ELEMENT_TYPES}`;
}

/**
 * Deep-merges `next` over `base` for the shallow-nested shape an `AppearancePatch`
 * actually has: scalar fields at the top, plus `line` / `fill` / `surface3D`
 * sub-objects. Mirrors `mergeAppearance`'s per-field precedence so normalising
 * cannot change what the resolver would have produced.
 */
function mergePatch(base: AppearancePatch, next: AppearancePatch): AppearancePatch {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(next)) {
        if (v === undefined) continue;
        const prev = out[k];
        if (v && typeof v === 'object' && !Array.isArray(v)
            && prev && typeof prev === 'object' && !Array.isArray(prev)) {
            out[k] = { ...(prev as object), ...(v as object) };
        } else {
            out[k] = v;
        }
    }
    return out as AppearancePatch;
}

/**
 * Collapse `viewTypeModifiers` so at most ONE entry exists per
 * (viewType, elementType). Order of first appearance is preserved, so the panel's
 * rows do not jump around under the user's cursor when a duplicate is merged away.
 *
 * Returns a NEW array; the input is not mutated.
 */
export function normaliseViewTypeModifiers(
    modifiers: ReadonlyArray<ViewTypeModifier> | undefined,
): ViewTypeModifier[] {
    if (!modifiers || modifiers.length === 0) return [];

    const order: string[] = [];
    const byKey = new Map<string, ViewTypeModifier>();

    for (const modifier of modifiers) {
        const key = keyOf(modifier);
        const existing = byKey.get(key);
        if (!existing) {
            order.push(key);
            byKey.set(key, {
                ...modifier,
                statePatch: { ...(modifier.statePatch ?? {}) },
                ...(modifier.stateTransform ? { stateTransform: { ...modifier.stateTransform } } : {}),
            });
            continue;
        }

        // Merge per state, later entry winning per-field — the resolver's own order.
        const mergedStatePatch: Record<string, AppearancePatch> = {
            ...(existing.statePatch as Record<string, AppearancePatch>),
        };
        for (const [state, patch] of Object.entries(modifier.statePatch ?? {})) {
            if (!patch) continue;
            const prev = mergedStatePatch[state];
            mergedStatePatch[state] = prev ? mergePatch(prev, patch) : { ...patch };
        }

        byKey.set(key, {
            ...existing,
            ...modifier,
            statePatch: mergedStatePatch as ViewTypeModifier['statePatch'],
            stateTransform: (modifier.stateTransform || existing.stateTransform)
                ? { ...(existing.stateTransform ?? {}), ...(modifier.stateTransform ?? {}) }
                : undefined,
        });
    }

    return order.map(k => byKey.get(k)!);
}

/**
 * Does a modifier for this exact key already exist? Used by the panel's "Add
 * Modifier" so it can reveal the existing row instead of minting a rival for it —
 * the cheapest possible way to stop the duplicate being created in the first place.
 */
export function findViewTypeModifierIndex(
    modifiers: ReadonlyArray<ViewTypeModifier> | undefined,
    viewType: string,
    elementType?: string,
): number {
    if (!modifiers) return -1;
    const wanted = `${viewType}\u0000${elementType ?? ALL_ELEMENT_TYPES}`;
    return modifiers.findIndex(m => keyOf(m) === wanted);
}
