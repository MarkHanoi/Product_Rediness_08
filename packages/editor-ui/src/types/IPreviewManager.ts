/**
 * IPreviewManager — public interface for the AI Ghost Preview Layer.
 *
 * Sprint F-2.4 (2026-05-15).
 * Concrete implementation: `apps/editor/src/engine/preview/PreviewManager.ts`
 * Reference: docs/03_PRYZM3/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 *
 * ## Design rules
 * - `ElementSchema` is exported from this module so callers can construct
 *   proposals without importing from the concrete implementation file.
 * - `showFromAIElements` takes `ReadonlyArray<unknown>` because `AIElement`
 *   lives in `@pryzm/ai-host` (L3) — adding that dep here would violate the
 *   contracts-only design of this package.  The concrete class casts internally.
 *   This will be narrowed to `ReadonlyArray<AIElement>` in Sprint F-2.5.
 * - Ghost meshes never enter any ElementStore; they exist only in a dedicated
 *   Three.js group in the scene root (contract §01 of Phase 3 §3.1).
 *
 * ## Consumer pattern
 * ```ts
 * import type { IPreviewManager, ElementSchema } from '@pryzm/editor-ui';
 *
 * function onAiSuggest(pm: IPreviewManager, elems: ElementSchema[]) {
 *     pm.showProposal(elems);
 * }
 * ```
 */

/**
 * Minimal element descriptor used by the AI Ghost Preview Layer.
 * Matches the subset of `@pryzm/ai-host` `AIElement` that `PreviewManager`
 * reads to build ghost geometry.
 */
export interface ElementSchema {
  /** Stable element ID (UUID). */
  readonly id: string;
  /** Element type string (e.g. `'wall'`, `'slab'`, `'door'`). */
  readonly type: string;
  /** Level ID that determines the Y-elevation baseline of the ghost mesh. */
  readonly levelId: string;
  /** Placement dimensions and position in world-space metres. */
  readonly placement?: {
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
    readonly width?: number;
    readonly height?: number;
    readonly depth?: number;
    readonly length?: number;
    readonly thickness?: number;
    readonly startX?: number;
    readonly startZ?: number;
    readonly endX?: number;
    readonly endZ?: number;
  };
  /** Arbitrary element-type-specific parameters. */
  readonly parameters?: Readonly<Record<string, unknown>>;
  /** Arbitrary metadata forwarded from the AI response. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * IPreviewManager — manages the transient AI ghost preview layer.
 *
 * Lifecycle:
 * ```
 * showProposal(elems)   // ghost meshes appear, pulsing
 *   └─ accept()         // dispatch bus commands → clear ghosts
 *   └─ decline()        // clear ghosts, no store mutations
 *   └─ clear()          // explicit clear (no events)
 * ```
 *
 * Events dispatched (via `window.dispatchEvent`):
 * - `pvw-proposal-shown`    — after `showProposal()` or `showFromAIElements()`
 * - `pvw-proposals-accepted`— after `accept()`
 * - `pvw-proposals-declined`— after `decline()`
 */
export interface IPreviewManager {
  /**
   * Display ghost meshes for the given proposed elements.
   * Clears any existing ghost meshes before showing the new set.
   */
  showProposal(elements: ReadonlyArray<ElementSchema>): void;

  /**
   * Accept `AIElement[]` from a QueryResult and show them as ghost meshes.
   * Converts the `AIElement` shape to `ElementSchema` internally.
   *
   * @param elements — An `AIElement[]` array. Typed as `ReadonlyArray<unknown>`
   *   at F-2.4 to avoid a hard dep on `@pryzm/ai-host`. Narrowed in F-2.5.
   */
  showFromAIElements(elements: ReadonlyArray<unknown>): void;

  /**
   * Dispatch a bus command for each proposed element, then clear ghosts.
   * Idempotent — ignores concurrent calls until the first resolves.
   */
  accept(): Promise<void>;

  /**
   * Remove all ghost meshes without dispatching any bus commands.
   * Fires `pvw-proposals-declined` for telemetry listeners.
   */
  decline(): void;

  /**
   * Remove all ghost meshes silently. Does not fire `pvw-proposals-declined`.
   * Use when the engine is shutting down or the project is closing.
   */
  clear(): void;

  /** Number of ghost elements currently displayed. */
  readonly proposedCount: number;

  /** `true` when at least one ghost element is currently displayed. */
  readonly hasProposal: boolean;
}
