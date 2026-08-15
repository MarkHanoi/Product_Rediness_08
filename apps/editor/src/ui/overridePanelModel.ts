/**
 * §FIX-OVERRIDE-PANEL-UNDETERMINED (GR-10, the []-means-unknown drain) —
 * the PURE half of OverridePanel's render decision.
 *
 * THE DEFECT (ledger row apps/editor/src/ui/OverridePanel.ts, ARM C):
 * `instance?.localOverrides` / `overrides?.graphicOverrides ?? []` made THREE
 * different facts render identically as "Clean / No active overrides":
 *   1. the view HAS an instance whose override layer is genuinely empty
 *      (a real, determined answer — the panel's honest "Clean");
 *   2. the view has NO ViewIntentInstance at all (unbound — `open()` dispatches
 *      `vg.assignIntent`, but when the command REFUSES because the viewId has
 *      no ViewDefinition, no instance exists and nothing was determined);
 *   3. an instance exists but its `localOverrides` layer was never written or
 *      is malformed (a persisted record from before the layer existed).
 * C75 §1.4: failure and emptiness are never the same value. C78 §1.4: an
 * absent field and a `?? []` are UNDETERMINED, never DETERMINED-unaffected.
 *
 * Vocabulary: the closed C78 §8.1 `UndeterminedReason` union, via the shared
 * `relationshipDetermination` seam — imported, never restated, never widened.
 */

import type { GraphicOverride, VisibilityOverride } from '@pryzm/core-app-model';
import {
    relationshipUndetermined,
    type RelationshipDetermination,
} from './relationshipDetermination';

/** What `determineOverrideLayer` reads — structural, so the pure module needs
 *  no store import and a test needs no store fake. */
export interface OverrideLayerSource {
    readonly localOverrides?: {
        readonly visibilityOverrides?: unknown;
        readonly graphicOverrides?: unknown;
        readonly isolateActive?: unknown;
    } | null;
}

export type OverrideLayerDetermination =
    | {
          readonly kind: 'determined';
          /** MAY be empty — an examined layer with zero overrides is the real "Clean". */
          readonly visibility: readonly VisibilityOverride[];
          readonly graphics: readonly GraphicOverride[];
          readonly isolateActive: boolean;
      }
    | Extract<RelationshipDetermination<never>, { kind: 'undetermined' }>;

/**
 * THE discriminator. Replaces the panel's `overrides?.xOverrides ?? []` pair.
 *
 * - no instance          → `undetermined` (`RELATIONSHIP_NOT_RECORDED`): the
 *   view was never bound to an intent — its overrides were not examined;
 * - layer absent         → `undetermined` (`RELATIONSHIP_NOT_RECORDED`): an
 *   instance predating the override layer — no producer wrote it;
 * - layer arrays malformed → `undetermined` (`RELATIONSHIP_NOT_READABLE`):
 *   the substrate answered something that is not an override list;
 * - otherwise            → `determined`, whatever the lengths.
 */
export function determineOverrideLayer(
    viewId: string | null,
    instance: OverrideLayerSource | null | undefined,
): OverrideLayerDetermination {
    const scope = `local overrides of view ${viewId ?? '(no view)'}`;
    if (!instance) {
        return relationshipUndetermined(
            scope,
            'RELATIONSHIP_NOT_RECORDED',
            'the view has no ViewIntentInstance — it was never bound to an intent, ' +
                'so "no overrides" was NOT determined (C75 §1.4 / C78 §1.4).',
        );
    }
    const layer = instance.localOverrides;
    if (!layer || typeof layer !== 'object') {
        return relationshipUndetermined(
            scope,
            'RELATIONSHIP_NOT_RECORDED',
            'the instance carries no localOverrides layer — no producer wrote it. ' +
                'Zero overrides was NOT determined.',
        );
    }
    if (!Array.isArray(layer.visibilityOverrides) || !Array.isArray(layer.graphicOverrides)) {
        return relationshipUndetermined(
            scope,
            'RELATIONSHIP_NOT_READABLE',
            'the localOverrides layer is present but its override lists are not arrays — ' +
                'the record is unreadable, not empty.',
        );
    }
    return {
        kind: 'determined',
        visibility: layer.visibilityOverrides as readonly VisibilityOverride[],
        graphics: layer.graphicOverrides as readonly GraphicOverride[],
        isolateActive: layer.isolateActive === true,
    };
}

/**
 * §REFUSAL-IDENTITY (C58 §1.13 arm B) — THE render for the panel's
 * undetermined state. Carries the closed reason token verbatim so the refusal
 * is attributable to its rule, never a generic shrug.
 */
export function overrideLayerRefusalText(
    d: Extract<OverrideLayerDetermination, { kind: 'undetermined' }>,
): string {
    return `⚠ Overrides cannot be determined (${d.reason}) — ${d.detail ?? d.scope}`;
}
