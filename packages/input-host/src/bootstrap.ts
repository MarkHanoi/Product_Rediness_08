// bootstrap — D.4.4 input-host bootstrap surface.
//
// Anchored to:
//   * `docs/03_PRYZM3/04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §2`
//     Days 5-7 — "Move lines 1011-1260 (keyboard + pointer + selection
//     wiring) into bootstrapInput()."  Per the Option A precedent
//     established by D.4.1-D.4.3: the engine-layer body lives in
//     `src/engine/subsystems/initTools.ts` (Phase F-1 extraction);
//     this file owns the TYPED CONTRACT + OTel span that will wrap it
//     once L7 dep factoring enables full relocation (Wave 4).
//
//   * `packages/physics-host/src/bootstrap.ts` (D.4.3) — identical
//     pattern: `bootstrapX()` async + `bootstrapXIdle()` sync + single
//     OTel span + dep-injected `loadEngineX` callback + soft-fail.
//
// Span: `pryzm.bootstrap.input`
//   Attribute                  Value
//   ─────────────────────────  ─────────────────────────────────────────
//   `pryzm.package`            `@pryzm/input-host`
//   `pryzm.engine.path`        `src/engine/subsystems/initTools.ts`
//   `pryzm.host.ready`         `true` / `false` (soft-fail)
//   `pryzm.input.ready`        `true` / `false`
//   `pryzm.selection.ready`    `true` / `false`
//   `pryzm.toolBindings.count` count of registered tools
//
// PURE: no DOM, no THREE, no RAF calls, no Node globals.

import { withSpan } from './otel.js';
import {
  bootstrapSelection,
  bootstrapSelectionIdle,
  type SelectionBootstrapInput,
  type SelectionBootstrapResult,
} from './SelectionBootstrap.js';
import {
  bootstrapToolBindings,
  type ToolBindingsInput,
  type ToolBindingsResult,
} from './ToolBindings.js';
import {
  type InputHost,
  createNullInputHost,
} from './index.js';

// ── Public types ──────────────────────────────────────────────────────────────

/** Audit triple — mirrors `RuntimeAudit` without taking a static dep on L2. */
export interface InputBootstrapAudit {
  readonly actorId: string;
  readonly projectId: string;
  readonly clientId: string;
}

/** Input the caller (`composeRuntime.ts`) hands to `bootstrapInput()`.
 *
 *  Every callback is dep-injected so this L3 file takes no static dep on
 *  L4-L7 (engine/BIM element packages) — consistent with the
 *  `loadEnginePhysics` pattern in `@pryzm/physics-host`. */
export interface InputBootstrapInput {
  readonly audit: InputBootstrapAudit;

  /** Lazy loader for the DOM-listener pump.  Injected so this file takes
   *  no static dep on `DomInputHost` (Phase 1B) or any other DOM global.
   *  On the idle path this callback is never invoked. */
  readonly loadEngineInput?: () => Promise<() => InputHost>;

  /** Optional selection-half params (forwarded to `bootstrapSelection`). */
  readonly selectionInput?: Omit<SelectionBootstrapInput, 'audit'>;

  /** Optional tool-binding params (forwarded to `bootstrapToolBindings`). */
  readonly toolBindingsInput?: Omit<ToolBindingsInput, never>;
}

/** Full result of `bootstrapInput()`. */
export interface InputBootstrapResult {
  /** The wired input host.  On the idle / soft-fail path this is a
   *  `NullInputHost`.  Phase 1B's `DomInputHost` is wired here. */
  readonly inputHost: InputHost;
  /** Captured error from the input-pump loader.  `null` on happy path. */
  readonly inputError: Error | null;
  /** Wired selection surface + its own soft-fail error. */
  readonly selection: SelectionBootstrapResult;
  /** Tool-binding result + registration count. */
  readonly toolBindings: ToolBindingsResult;
  /** Composite ready flag — all three sub-surfaces initialised without error. */
  readonly ready: boolean;
  /** Idempotent teardown.  `composeRuntime.tearDown()` calls this last. */
  readonly tearDown: () => void;
}

// ── bootstrapInputIdle ────────────────────────────────────────────────────────

/** Synchronous "idle" path — no DOM loader supplied.  Returns a null-shell
 *  `InputBootstrapResult` with `NullInputHost`, null-shell selection, and
 *  an empty tool-bindings table.  No span — there is no boundary crossing
 *  to trace in the idle/test-harness path.
 *
 *  `composeRuntime.ts` calls this on every start until Phase 1B. */
export function bootstrapInputIdle(): InputBootstrapResult {
  const selection = bootstrapSelectionIdle();
  return {
    inputHost: createNullInputHost(),
    inputError: null,
    selection,
    toolBindings: {
      registrationCount: 0,
      toolsError: null,
      tearDown: NOOP_TEARDOWN,
    },
    ready: false,
    tearDown: NOOP_TEARDOWN,
  };
}

// ── bootstrapInput ────────────────────────────────────────────────────────────

/** Async path — loads the engine-layer input pump + selection + tool
 *  bindings, emitting an OTel span `pryzm.bootstrap.input` that spans
 *  the full boundary crossing.  Soft-fail: any sub-loader error is
 *  captured and a null-shell is returned for that sub-surface; the span
 *  is marked ERROR but the caller receives a result (not a thrown error)
 *  so `composeRuntime` can still mount. */
export async function bootstrapInput(
  input: InputBootstrapInput,
): Promise<InputBootstrapResult> {
  return withSpan(
    'pryzm.bootstrap.input',
    {
      'pryzm.package': '@pryzm/input-host',
      'pryzm.engine.path': 'src/engine/subsystems/initTools.ts',
      'pryzm.actor.id': input.audit.actorId,
      'pryzm.project.id': input.audit.projectId,
      'pryzm.client.id': input.audit.clientId,
    },
    async (span) => {
      // ── 1. Input pump ────────────────────────────────────────────────
      let inputHost: InputHost = createNullInputHost();
      let inputError: Error | null = null;
      if (input.loadEngineInput) {
        try {
          const createInputHost = await input.loadEngineInput();
          inputHost = createInputHost();
        } catch (err) {
          inputError = err instanceof Error ? err : new Error(String(err));
        }
      }

      // ── 2. Selection bootstrap ───────────────────────────────────────
      let selection: SelectionBootstrapResult;
      if (input.selectionInput) {
        selection = await bootstrapSelection({
          audit: input.audit,
          ...input.selectionInput,
        });
      } else {
        selection = bootstrapSelectionIdle();
      }

      // ── 3. Tool bindings ─────────────────────────────────────────────
      let toolBindings: ToolBindingsResult;
      if (input.toolBindingsInput) {
        toolBindings = bootstrapToolBindings(input.toolBindingsInput);
      } else {
        toolBindings = {
          registrationCount: 0,
          toolsError: null,
          tearDown: NOOP_TEARDOWN,
        };
      }

      // ── 4. Stamp span attributes ─────────────────────────────────────
      const ready =
        inputError === null &&
        selection.selectionError === null &&
        toolBindings.toolsError === null;

      span.setAttributes({
        'pryzm.host.ready': ready,
        'pryzm.input.ready': inputError === null,
        'pryzm.selection.ready': selection.selectionError === null,
        'pryzm.toolBindings.count': toolBindings.registrationCount,
      });

      if (!ready) {
        const firstError = inputError ?? selection.selectionError ?? toolBindings.toolsError;
        span.recordException(firstError!);
      }

      // ── 5. Compose tearDown ──────────────────────────────────────────
      const tearDown = (): void => {
        try { inputHost.dispose(); } catch { /* never propagate */ }
        try { selection.tearDown(); } catch { /* never propagate */ }
        try { toolBindings.tearDown(); } catch { /* never propagate */ }
      };

      return {
        inputHost,
        inputError,
        selection,
        toolBindings,
        ready,
        tearDown,
      };
    },
  );
}

const NOOP_TEARDOWN = (): void => { /* idle / soft-fail */ };
