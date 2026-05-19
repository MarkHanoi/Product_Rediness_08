// buildWorkspaceModeController — the typed adapter behind
// `runtime.workspaceMode`.  Wave 4 Track A (PR 4.A.3) per
// `04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §2` table row 4.A.3.
//
// Lives in its own subdirectory (`workspace/`) per the doc spec
// ("`packages/runtime-composer/src/workspace/WorkspaceModeController.ts`
// (new)") — distinct from `buildViewRegistrySlot.ts` /
// `buildCameraControllerSlot.ts` / `ImportExportSlots.ts` which sit
// flat in `src/`, this slot has its own folder so D.12 proper can add
// the workspace-surface mount sequence next to it without polluting
// the top-level adapter list.
//
// Why a tiny standalone controller instead of inlining in
// composeRuntime: matches the convention established by 4.A.1 / 4.A.2
// (one slot adapter per file, unit-testable in isolation, zero
// `unknown` / zero `as` casts).  The unit test in
// `__tests__/workspaceMode.slot.test.ts` drives this builder directly
// without standing up a full `composeRuntime()`.

import type { EventBus } from '../EventBus.js';
import type { WorkspaceMode, WorkspaceModeController } from '../types.js';

/** Construction options.  Most callers use the defaults; the test
 *  harness uses `initial` to verify both the default and a non-default
 *  starting point. */
export interface BuildWorkspaceModeControllerOptions {
  /** Initial mode.  Defaults to `'3d'` — the BIM-canonical opening
   *  mode for the workspace surface (matches what `RenderEverythingRuntime`
   *  produces today). */
  readonly initial?: WorkspaceMode;
}

/** Build the typed `workspaceMode` slot.
 *
 *  Behaviour:
 *    * `mode`        — current `WorkspaceMode` (defaults to `'3d'`).
 *    * `set(mode)`   — synchronous switch.  Mutates `mode`, fans out
 *                      to per-slot subscribers, and emits the typed
 *                      `'workspace.modeChanged'` event with both the
 *                      new mode and the `previous` mode.  No-op when
 *                      the mode is unchanged — neither subscribers
 *                      nor the event are re-fired (matches the
 *                      existing `WorkspaceSlot.setMode` contract).
 *    * `subscribe()` — listener fires on every successful mutation;
 *                      disposer removes the listener.  Loud-fail-soft:
 *                      a thrown listener is logged and skipped without
 *                      breaking siblings, matching the same convention
 *                      `buildViewRegistrySlot` / `buildWorkspaceStub`
 *                      already use. */
export function buildWorkspaceModeController(
  events: EventBus,
  opts: BuildWorkspaceModeControllerOptions = {},
): WorkspaceModeController {
  let mode: WorkspaceMode = opts.initial ?? '3d';
  const subs = new Set<(m: WorkspaceMode) => void>();

  return {
    get mode(): WorkspaceMode {
      return mode;
    },

    set(next: WorkspaceMode): void {
      if (mode === next) return;
      const previous = mode;
      mode = next;

      // Per-slot subscriber fan-out — loud-fail-soft so a single
      // misbehaving panel cannot block siblings or the event emit.
      for (const s of subs) {
        try {
          s(mode);
        } catch (err) {
          console.error(
            '[runtime-composer/workspaceMode] subscriber threw:',
            err,
          );
        }
      }

      // Typed emit — `'workspace.modeChanged'` is a member of
      // `RuntimeEvents` per PR 4.A.3.  No `as` cast needed.
      try {
        events.emit('workspace.modeChanged', { mode, previous });
      } catch (err) {
        console.error(
          '[runtime-composer/workspaceMode] events emit threw:',
          err,
        );
      }
    },

    subscribe(listener: (mode: WorkspaceMode) => void) {
      subs.add(listener);
      return {
        dispose: (): void => void subs.delete(listener),
      };
    },
  };
}
