// W3-2 — the PROJECTION half of visibility intent (P7 / C01 §1 P7).
//
// WHY THIS FILE EXISTS
// ─────────────────────────────────────────────────────────────────────────────
// `ViewVisibilityIntentStore` is now the authoritative record of "what did the
// user ask to be hidden". That answers WHAT. Something still has to answer HOW —
// i.e. actually darken the scene node — and P7 is explicit that the UI is not
// allowed to be that something:
//
//     "packages/visibility describes WHAT should be visible; the renderer and
//      committers decide HOW."   — tools/ga-gate/check-visibility-intent-not-ui.ts
//
// Before this file, `apps/editor/src/ui/SpatialTree.ts` did BOTH: an eye-toggle
// click walked the scene and wrote `obj.visible = false` with no record kept
// anywhere. The visibility state of the model lived in five `let visible = true`
// closures inside DOM button handlers. Nothing could read it, persist it, undo it
// or replicate it, and it did not survive a tree refresh — `refreshTreeNow()`
// rebuilds every button with `visible = true` while the scene stays hidden, so
// the eye icon and the model disagreed.
//
// So: the UI writes an INTENT, then asks the runtime to project it. The `.visible`
// assignment happens here, in the composition layer, exactly once.
//
// WHAT THIS DELIBERATELY DOES **NOT** DO
// ─────────────────────────────────────────────────────────────────────────────
// It does not run the full 11-wave chain. The waves need `VisibilityElement`
// metadata (category, levelId) that a bare scene node does not reliably carry,
// and a partial reconstruction of that metadata would produce a DIFFERENT answer
// from `visibility.resolve()` while looking authoritative. Two rival evaluators
// disagreeing is worse than one narrow one.
//
// It therefore projects INTENT ONLY — waves 8 (`temporaryIsolation`) and 9
// (`hiddenElementIds`), which are precisely the two fields the intent store owns.
// Level scoping, category scoping and view templates are resolved elsewhere and
// are NOT reasserted here: this function only ever touches nodes whose id the
// caller named, so it cannot stomp a decision another system made about a node
// it was not asked about. That containment is the whole reason it takes an
// explicit id list instead of sweeping the graph.
//
// NO THREE (P2). The node type is structural — `{ visible, userData, traverse }`
// — which is all a `THREE.Object3D` needs to satisfy. This file imports nothing
// from `three` and must not start.

import type { ViewVisibilityIntentStore } from '@pryzm/visibility';

/**
 * §P7-IMPLICIT-MODEL-VIEW — the view id intent is recorded against when nobody
 * has ever called `viewRegistry.activate()`.
 *
 * This is not a fabrication and not a default-to-hide-the-problem. `activate()`
 * has zero production callers (it is a documented D.11-prep stub), so the editor
 * today has exactly ONE view: the model. That view existed all along and simply
 * had no name. Naming it means visibility intent recorded before D.11 lands is
 * still per-view state keyed by a stable id — so D.11 can migrate it, instead of
 * finding an undifferentiated global blob it has to guess at.
 *
 * The alternative — keying on `null` — would have made every gesture in the
 * shipping app take the "no active view, intent discarded" branch forever.
 */
export const IMPLICIT_MODEL_VIEW_ID = 'view:model' as const;

/** The minimum a scene node must expose. Structurally satisfied by
 *  `THREE.Object3D`; deliberately NOT typed as one (P2 — single THREE owner). */
export interface VisibilitySceneNode {
  visible: boolean;
  readonly userData?: Record<string, unknown> | undefined;
  traverse?(callback: (node: VisibilitySceneNode) => void): void;
}

/** Outcome of a projection. `matched === 0` with a non-empty `elementIds` means
 *  the ids named nothing in this scene — a real, reportable condition that must
 *  not be confused with "nothing was hidden". Failure and emptiness are not the
 *  same value, so the caller gets both numbers. */
export interface VisibilityProjectionResult {
  /** Nodes whose `userData.id` was in `elementIds` and were written. */
  readonly matched: number;
  /** Of those, how many were set to `visible = false`. */
  readonly hidden: number;
}

/**
 * Project the recorded intent for `viewId` onto the named elements of `root`.
 *
 * An element is invisible when EITHER
 *   • it is in the view's wave-9 `hiddenElementIds`, or
 *   • an isolation is active on the view and the element is outside it (wave-8).
 * Otherwise it is visible.
 *
 * `viewId === null` is a no-op returning zeroes: with no active view there is no
 * intent to project, and guessing a view would write the user's gesture onto the
 * wrong one. Same rule the command handlers use.
 */
export function applyVisibilityIntentToScene(
  store: ViewVisibilityIntentStore,
  root: VisibilitySceneNode | null | undefined,
  viewId: string | null,
  elementIds: readonly string[],
): VisibilityProjectionResult {
  if (!root || typeof root.traverse !== 'function') return { matched: 0, hidden: 0 };
  if (viewId === null || viewId === '') return { matched: 0, hidden: 0 };
  if (elementIds.length === 0) return { matched: 0, hidden: 0 };

  const wanted = new Set(elementIds.map(String));
  const intent = store.get(viewId);
  const iso = intent.temporaryIsolation;

  let matched = 0;
  let hidden = 0;

  root.traverse((node) => {
    const raw = node.userData?.['id'];
    if (raw === undefined || raw === null) return;
    const id = String(raw);
    if (!wanted.has(id)) return;

    // Wave-9 first: an explicit hide beats an isolation that would have shown it.
    const visible = !intent.hiddenElementIds.has(id)
      && (iso === null || !iso.active || iso.elementIds.has(id));

    node.visible = visible;
    matched += 1;
    if (!visible) hidden += 1;
  });

  return { matched, hidden };
}
