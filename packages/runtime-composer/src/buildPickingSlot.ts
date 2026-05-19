// PR 4.A.5 (Wave 4 Track A) — `buildPickingSlot`.
//
// Anchor: `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2` table row 4.A.5.
//
// Why this module exists:
//
//   The legacy `buildPickingStub()` in `composeRuntime.ts` returned a
//   one-liner stub whose `pickAt` always returned `null`.  That was
//   sufficient while `@pryzm/picking` didn't exist; now that the package
//   ships `GpuPickStrategy`, `BvhPickStrategy`, and `PickStrategyResolver`,
//   the runtime needs a typed adapter that:
//
//     (a) Exposes the full `PickingSlot` contract — `pickAt(x, y)` AND
//         `pickInRect(rect)` — so downstream callers see a stable surface.
//     (b) Delegates to a real `PickerDelegate` once the scene-canvas has
//         been mounted (D.6 proper wires this; today the thunk returns
//         `null` — "D.6-prep posture" — and the slot warns once on first
//         call instead of throwing silently).
//     (c) Lives in its own file so it can be unit-tested in isolation
//         (see `__tests__/picking.slot.test.ts`), matching the pattern
//         established by `buildViewRegistrySlot`, `buildCameraControllerSlot`,
//         and `buildWorkspaceModeController`.
//
// Dependency notes:
//   * This file does NOT import from `@pryzm/picking` — the `PickerDelegate`
//     interface below is defined locally using primitive types so
//     `runtime-composer` keeps its dep surface clean.  The actual
//     `@pryzm/picking` wiring (constructing `PickStrategyResolver` with a
//     real `PickContext`) is a D.6 concern that lives in `apps/editor/`.
//   * The `PickingSlot` type import comes from `./types.js` (same package).

import type { PickingSlot } from './types.js';

// ---------------------------------------------------------------------------
//                         PickerDelegate — local delegate interface
// ---------------------------------------------------------------------------

/** Minimal interface that any real picker must satisfy to back a
 *  `PickingSlot`.  Defined locally (not imported from `@pryzm/picking`) so
 *  `runtime-composer` stays free of the L5 picking dependency until D.6.
 *
 *  Structural match to `PickStrategyResolver`'s pick surface as of S16
 *  `@pryzm/picking` (the resolver exposes both methods once a strategy is
 *  resolved). */
export interface PickerDelegate {
  /** Pick the topmost element under canvas pixel `(x, y)`.
   *  Returns `null` when no element occupies the pixel. */
  pickAt(x: number, y: number): string | null;
  /** Pick all elements intersecting the canvas rectangle.
   *  Returns an empty array when nothing intersects. */
  pickInRect(rect: { x: number; y: number; w: number; h: number }): string[];
}

// ---------------------------------------------------------------------------
//                         buildPickingSlot
// ---------------------------------------------------------------------------

/** Build a `PickingSlot` backed by a lazy `PickerDelegate` thunk.
 *
 *  @param getDelegate  Thunk invoked on every `pickAt` / `pickInRect` call.
 *    Return a real `PickerDelegate` once the scene-canvas has been mounted
 *    (D.6 proper); return `null` during the D.6-prep posture.  The slot
 *    emits a single `console.warn` on the first call that finds `null`
 *    (breadcrumb) rather than throwing, so call sites that fire before the
 *    scene is ready do not crash.
 *
 *  **D.6-prep usage in `composeRuntime.ts`:**
 *  ```ts
 *  const picking = buildPickingSlot(() => null);
 *  ```
 *  **D.6 proper usage** (after `runtime.scene.mount(canvas)` resolves):
 *  ```ts
 *  let delegate: PickerDelegate | null = null;
 *  runtime.scene.mount(canvas).then(({ picking: p }) => { delegate = p; });
 *  const picking = buildPickingSlot(() => delegate);
 *  ``` */
export function buildPickingSlot(
  getDelegate: () => PickerDelegate | null,
): PickingSlot {
  let warnedOnce = false;

  const warnOnce = (method: string): void => {
    if (warnedOnce) return;
    warnedOnce = true;
    console.warn(
      `[runtime-composer/picking] D.6-prep stub: ${method}() called before ` +
      'D.6 wires the real PickStrategyResolver / scene-canvas. ' +
      'Returning null/[] until then.',
    );
  };

  return {
    pickAt(x: number, y: number): string | null {
      const delegate = getDelegate();
      if (delegate === null) {
        warnOnce('pickAt');
        return null;
      }
      return delegate.pickAt(x, y);
    },
    pickInRect(rect: { x: number; y: number; w: number; h: number }): string[] {
      const delegate = getDelegate();
      if (delegate === null) {
        warnOnce('pickInRect');
        return [];
      }
      return delegate.pickInRect(rect);
    },
  };
}
