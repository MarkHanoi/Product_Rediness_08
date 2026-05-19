// ToolBindings — D.4.4 typed contract for tool registration wiring.
//
// Anchored to:
//   * `docs/03_PRYZM3/04-PLAN-FORWARD/03-WAVE-2-3-D4-EXECUTION.md §2`
//     Day-6 — "Move the 20 `runtime.tools.register(...)` calls from
//     `src/ui/Layout.ts` into `packages/input-host/src/ToolBindings.ts`."
//     Per Option A: the implementation body lives in
//     `src/engine/subsystems/initTools.ts` (the ToolManager / tool
//     construction logic Phase F-1 extracted); this file owns the TYPED
//     CONTRACT so `composeRuntime.ts` can accept the result without adapter.
//
// Why this file is a wrapper today:
//   * `initTools.ts` constructs all 20 BIM tools (WallTool, SlabTool,
//     CurtainWallTool, etc.) with deep dependencies on THREE,
//     @thatopen/components, and every BIM element domain package.  Those
//     L4-L7 deps cannot cross into L3 in Wave 3.
//   * The `ToolsSlot` shape on `runtime.tools` is defined in
//     `@pryzm/runtime-composer` (L2).  This file mirrors the minimal
//     sub-set needed by the input-host bootstrap (no static dep on L2).
//   * This table is the contract the host-layer will hold.  Phase 1C's
//     plugin manifests will extend it; this file doesn't change shape.
//
// PURE: no DOM, no THREE, no RAF calls, no @thatopen/components.

/** The known canonical tool IDs.  Matches `ToolManager.toolId` values
 *  in `src/tools/ToolManager.ts`.  Widened to `string` so plugins can
 *  register additional IDs without a compile-time break. */
export type ToolId =
  | 'select'
  | 'wall'
  | 'slab'
  | 'ceiling'
  | 'floor'
  | 'plumbing'
  | 'furniture'
  | 'lighting'
  | 'kitchen-cabinet'
  | 'wardrobe-cabinet'
  | 'roof'
  | 'handrail'
  | 'window'
  | 'door'
  | 'curtain-wall'
  | 'column'
  | 'beam'
  | 'stair'
  | 'opening'
  | 'room'
  | 'annotation'
  | (string & {}); // plugin extension point

/** Categorisation used by the toolbar renderer and RadialMenu to group
 *  tools into sections.  Mirrors the `kind` discriminator in Layout.tsx. */
export type ToolKind =
  | 'select'
  | 'structure'
  | 'envelope'
  | 'interior'
  | 'services'
  | 'annotation'
  | 'view'
  | (string & {}); // plugin extension point

/** Keyboard shortcut — optional.  Format: `"Shift+W"`, `"Escape"`, etc.
 *  The input-host's `DomInputHost` (Phase 1B) will own dispatch. */
export interface ToolShortcut {
  readonly key: string;
  readonly shift?: boolean;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
}

/** A single tool registration entry — the "one row" of the 20-entry
 *  table that maps to each `runtime.tools.register(...)` call. */
export interface ToolRegistration {
  readonly id: ToolId;
  readonly kind: ToolKind;
  readonly label: string;
  readonly shortcut?: ToolShortcut;
  /** Deferred constructor called when the tool is first activated.
   *  Returns the tool instance (opaque; ToolManager casts to its own
   *  `Tool` interface via duck-typing). */
  readonly construct: () => unknown;
  /** `true` if this tool should be the default tool on session start. */
  readonly isDefault?: boolean;
}

/** The full binding table.  Frozen on construction so callers can
 *  safely spread it into React state / plugin manifests. */
export type ToolBindingsTable = readonly ToolRegistration[];

/** The minimal `tools` slot shape the binding table is applied to.
 *  Structurally isomorphic to `ToolsSlot` in `@pryzm/runtime-composer`
 *  so the result drops in without an adapter. */
export interface ToolsSlotShape {
  readonly activeId: string | null;
  register(entry: ToolRegistration): void;
  activate(id: ToolId): void;
  deactivate(): void;
  subscribe(listener: (id: string | null) => void): { dispose(): void };
}

/** Input the caller passes to `bootstrapToolBindings()`. */
export interface ToolBindingsInput {
  /** The target slot instance to register tools into. */
  readonly toolsSlot: ToolsSlotShape;
  /** The binding table produced by the engine-layer init (initTools.ts).
   *  Typed `unknown[]` so this L3 file takes no static dep on BIM
   *  element packages; the shape is duck-checked at runtime by ToolManager. */
  readonly registrations: readonly unknown[];
}

/** Result of `bootstrapToolBindings()`. */
export interface ToolBindingsResult {
  readonly registrationCount: number;
  readonly toolsError: Error | null;
  readonly tearDown: () => void;
}

/** Apply a binding table to a live `ToolsSlot`.  Soft-fail: any
 *  registration that throws is captured in `toolsError`; already
 *  registered tools remain active. */
export function bootstrapToolBindings(
  input: ToolBindingsInput,
): ToolBindingsResult {
  let toolsError: Error | null = null;
  let registrationCount = 0;
  for (const reg of input.registrations) {
    try {
      input.toolsSlot.register(reg as ToolRegistration);
      registrationCount++;
    } catch (err) {
      toolsError ??= err instanceof Error ? err : new Error(String(err));
    }
  }
  return {
    registrationCount,
    toolsError,
    tearDown: NOOP_TEARDOWN,
  };
}

/** An empty no-op binding table.  Used by `bootstrapInputIdle()` and
 *  the null backend so callers always receive the same result shape. */
export function createNullToolBindings(): ToolBindingsTable {
  return Object.freeze([]);
}

const NOOP_TEARDOWN = (): void => { /* idle / soft-fail */ };
