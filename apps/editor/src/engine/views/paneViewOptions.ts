// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412 / L-405, C59 Phase 2) — the PURE decision layer
// behind the per-pane view PICKER.
//
// WHAT THIS ANSWERS: "for THIS pane, what may the user choose, what happens if they
// choose it, and — when they may NOT — WHY not?" C59 §4 Phase 2 requires the picker to
// DISABLE-OR-EXPLAIN rather than accept an invalid choice and blow up at mount time; a
// greyed option with no reason is explicitly a bad answer. So every option carries a
// `state` and, whenever it is anything other than plainly available, a human `reason`.
//
// WHY PURE (no DOM / no Cesium / no THREE / no I/O): identical rationale to
// `paneViewModel.ts` — the founder-visible behaviour ("every view, in either pane, with
// an honest explanation when it can't") must be unit-testable WITHOUT a live viewer.
// Pure decisions are P8 span-exempt (see `globePlacementDecisions.ts` header).
//
// This module NEVER mutates a layout: it only DESCRIBES what the reducer
// (`assignViewToPane`) would do, and validates the hypothetical result with
// `validatePaneLayout` — the same guard the live host asserts. That is what makes the
// picker's enablement provably consistent with the mount-time invariant (C59 §2.1).

import {
    VIEW_TYPE_REGISTRY,
    assignViewToPane,
    listPaneViewTypes,
    validatePaneLayout,
    type PaneId,
    type PaneLayout,
    type RendererKind,
    type ViewType,
    type ViewTypeDescriptor,
} from './paneViewModel';

/**
 * What choosing this option would do.
 *  • `current`         — already shown in this pane (selecting it is a no-op).
 *  • `available`       — assigns cleanly.
 *  • `moves-singleton` — allowed: the ONE heavyweight instance MOVES here (C59 §1.2), and
 *                        this pane's current view goes back to the pane it came from — a
 *                        SWAP. Must be explained BEFORE the click, never discovered after.
 *  • `unavailable`     — not selectable; `reason` says why.
 *
 * ⚠ §SWAP-NOT-VACATE (L-12999, 2026-09-06) — the `moves-singleton` bullet above read *"the
 * other pane is VACATED … never discovered after the other pane goes blank"*. That copy was
 * accurate about the old reducer and is now the exact opposite of what happens: the
 * displaced view is handed back, so nothing goes blank. The consequence is still stated
 * before the click; only the consequence changed.
 */
export type PaneViewOptionState = 'current' | 'available' | 'moves-singleton' | 'unavailable';

export interface PaneViewOption {
    readonly viewType: ViewType;
    readonly label: string;
    readonly glyph?: string;
    readonly rendererKind: RendererKind;
    readonly state: PaneViewOptionState;
    /** Selectable? `false` ⇒ the picker must render it disabled AND show `reason`. */
    readonly enabled: boolean;
    /** Human explanation. Always present unless the option is plainly `available`. */
    readonly reason?: string;
    /** For `moves-singleton`: the pane the singleton would move OUT of. */
    readonly movesFromPane?: PaneId;
    /**
     * §SWAP-NOT-VACATE — for `moves-singleton`: the view THIS pane would hand back to
     * `movesFromPane`. Absent ⇒ this pane is empty, so there is nothing to hand back and
     * `movesFromPane` really does end up empty (the honest remainder of the old behaviour).
     */
    readonly swapsWith?: ViewType;
}

export interface PaneViewOptionsInput {
    readonly layout: PaneLayout;
    readonly paneId: PaneId;
    readonly registry?: Readonly<Record<ViewType, ViewTypeDescriptor>>;
    /**
     * The renderer kinds that actually have a mounter registered in THIS workspace
     * (`MultiPaneController.registeredKinds()`). A view whose renderer has no mounter
     * here is unavailable WITH A REASON — this is the runtime half of availability;
     * `descriptor.paneHostable` is the static half (C59 Phase 3 work).
     * `null`/undefined ⇒ skip the runtime check (used by pure tests of the static half).
     */
    readonly mountableKinds?: ReadonlySet<RendererKind> | null;
    /**
     * §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720) — `store.pinnedViews()`: views a
     * caller has declared LOAD-BEARING for what the user is doing right now, mapped to
     * the reason to show them. Rule 4b below refuses any choice that would VACATE one.
     *
     * ⭐ This picker is the SECOND of the three surfaces that can move a view (the
     * quick-toggle bar and a programmatic caller are the others), and the founder's
     * dead end proved they must not disagree: the store refuses all three, and each
     * one that has a UI disables-and-explains rather than declining on click.
     */
    readonly pinnedViews?: ReadonlyMap<ViewType, string> | null;
}

/** Pretty pane name for reasons ("the right pane"). Pure string shaping. */
export function describePaneName(paneId: PaneId): string {
    if (paneId === 'left') return 'the left pane';
    if (paneId === 'right') return 'the right pane';
    return `pane "${paneId}"`;
}

/**
 * Describe EVERY registry view for `paneId` — the picker's whole content, derived from
 * `VIEW_TYPE_REGISTRY` and never from a hardcoded list (C59 §2 invariant 6: a new view
 * type is a registry entry + a mounter, nothing else).
 *
 * Order of adjudication (first match wins), so the most specific explanation is shown:
 *   1. already in this pane                 → `current`
 *   2. `paneHostable === false`             → `unavailable` + the contract's reason
 *   3. no mounter registered for its kind   → `unavailable` + a wiring reason
 *   4. hypothetical layout fails validation → `unavailable` + the conflict (defensive:
 *      the reducer maintains the invariant, so this should be unreachable — but the
 *      picker must never be able to offer a choice the mount-time assert would reject)
 *   5. singleton live in another pane       → `moves-singleton` + what the two panes
 *      exchange (§SWAP-NOT-VACATE; this line read "which pane empties")
 *   6. otherwise                            → `available`
 */
export function describePaneViewOptions(input: PaneViewOptionsInput): PaneViewOption[] {
    const registry = input.registry ?? VIEW_TYPE_REGISTRY;
    const { layout, paneId } = input;
    const mountable = input.mountableKinds ?? null;
    const pinned = input.pinnedViews ?? null;

    return listPaneViewTypes(registry).map((viewType): PaneViewOption => {
        const d = registry[viewType];
        const base = {
            viewType,
            label: d.label,
            glyph: d.glyph,
            rendererKind: d.rendererKind,
        } as const;

        if (layout[paneId] === viewType) {
            return { ...base, state: 'current', enabled: true, reason: 'Already shown in this pane.' };
        }

        if (!d.paneHostable) {
            return {
                ...base,
                state: 'unavailable',
                enabled: false,
                reason: d.unavailableReason ?? 'This view cannot be hosted in a pane yet.',
            };
        }

        if (mountable && !mountable.has(d.rendererKind)) {
            return {
                ...base,
                state: 'unavailable',
                enabled: false,
                reason:
                    `No ${d.rendererKind} renderer is wired into this workspace, so this pane ` +
                    `has nothing to mount. (Open the workspace that owns it, or wire its mounter.)`,
            };
        }

        const hypothetical = assignViewToPane(layout, paneId, viewType, registry);
        const check = validatePaneLayout(hypothetical, registry);
        if (!check.ok) {
            const c = check.conflicts[0]!;
            return {
                ...base,
                state: 'unavailable',
                enabled: false,
                reason:
                    `Choosing this would put two ${c.rendererKind} views in ` +
                    `${c.panes.map(describePaneName).join(' and ')} — there is only one ` +
                    `${c.rendererKind} instance app-wide.`,
            };
        }

        // 4b. §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720) — would this choice VACATE a
        //     pinned view? Asked of the SAME `hypothetical` layout rule 4 just built, so
        //     the singleton MOVE semantics are already folded in: choosing `site-3d` for
        //     the pane that holds the pinned 2D map evicts the map (refused), while
        //     choosing the pinned map ITSELF for the other pane merely moves it (allowed).
        if (pinned && pinned.size > 0) {
            for (const [pinnedView, reason] of pinned) {
                const hostedNow = Object.values(layout).includes(pinnedView);
                if (!hostedNow) continue;
                if (Object.values(hypothetical).includes(pinnedView)) continue;
                return { ...base, state: 'unavailable', enabled: false, reason };
            }
        }

        const otherPane = findOtherPaneShowing(layout, viewType, paneId);
        if (otherPane != null && d.singleton) {
            // §SWAP-NOT-VACATE (L-12999 clause 4) — say what the reducer will ACTUALLY do.
            // `assignViewToPane` hands this pane's current view back to `otherPane` when
            // there is one, and empties `otherPane` only when this pane has nothing to give.
            // Both sentences are derived from `layout[paneId]`, so the copy cannot drift
            // from the reducer the way the old flat "…empties." sentence just did.
            const displaced = layout[paneId] ?? null;
            const displacedLabel = displaced != null ? registry[displaced]?.label : null;
            return {
                ...base,
                state: 'moves-singleton',
                enabled: true,
                movesFromPane: otherPane,
                ...(displaced != null ? { swapsWith: displaced } : {}),
                reason:
                    displacedLabel != null
                        ? `Currently open in ${describePaneName(otherPane)}. There is only one ` +
                          `${d.rendererKind} instance, so the two panes SWAP: it moves here and ` +
                          `${displacedLabel} moves to ${describePaneName(otherPane)}.`
                        : `Currently open in ${describePaneName(otherPane)}. There is only one ` +
                          `${d.rendererKind} instance, so it MOVES here. This pane holds nothing ` +
                          `to give back, so ${describePaneName(otherPane)} empties.`,
            };
        }

        if (otherPane != null) {
            // Non-singleton duplicate (e.g. a second Canvas2D plan). Allowed by the model,
            // but say so — the user should know they are about to show it twice.
            return {
                ...base,
                state: 'available',
                enabled: true,
                reason: `Also open in ${describePaneName(otherPane)}.`,
            };
        }

        return { ...base, state: 'available', enabled: true };
    });
}

/** The pane (other than `exclude`) currently showing `viewType`, or null. */
function findOtherPaneShowing(
    layout: PaneLayout,
    viewType: ViewType,
    exclude: PaneId,
): PaneId | null {
    for (const paneId of Object.keys(layout)) {
        if (paneId !== exclude && layout[paneId] === viewType) return paneId;
    }
    return null;
}

// ── Layout actions (the picker's non-view commands) ──────────────────────────

export interface PaneLayoutActionDescriptor {
    readonly kind: 'swap' | 'solo' | 'restore-split';
    readonly label: string;
    readonly enabled: boolean;
    readonly reason?: string;
}

/**
 * The layout actions offered alongside the view list in `paneId`'s picker:
 * swap the two panes, take this pane FULL SCREEN (every other pane vacated), or come
 * back to the split. Pure — the picker only renders what this returns, and dispatches
 * the matching intent (never a DOM toggle, C59 §2 invariant 3).
 */
export function describePaneLayoutActions(
    layout: PaneLayout,
    paneId: PaneId,
    canRestoreSplit: boolean,
): PaneLayoutActionDescriptor[] {
    const paneIds = Object.keys(layout);
    const others = paneIds.filter((p) => p !== paneId);
    const occupiedOthers = others.filter((p) => layout[p] != null);
    const isSolo = occupiedOthers.length === 0;

    return [
        {
            kind: 'swap',
            label: '⇄ Swap panes',
            enabled: paneIds.length === 2 && !isSolo,
            reason:
                paneIds.length !== 2
                    ? 'Swap needs exactly two panes.'
                    : isSolo
                      ? 'Nothing to swap with — the other pane is empty.'
                      : undefined,
        },
        {
            kind: 'solo',
            label: '⛶ Full screen',
            enabled: !isSolo && layout[paneId] != null,
            reason: isSolo
                ? 'Already full screen.'
                : layout[paneId] == null
                  ? 'This pane is empty — choose a view first.'
                  : undefined,
        },
        {
            kind: 'restore-split',
            label: '◧ Back to split',
            enabled: isSolo && canRestoreSplit,
            reason: !isSolo
                ? 'Already split.'
                : canRestoreSplit
                  ? undefined
                  : 'No previous split to restore — choose a view for the other pane.',
        },
    ];
}
