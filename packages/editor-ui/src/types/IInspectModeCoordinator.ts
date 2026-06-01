/**
 * IInspectModeCoordinator — public interface for the engine-side inspect-mode
 * coordinator that bridges workspace / lens / delta events to the diagnostic
 * material system and level-explode controller.
 *
 * Sprint F-2.4 (2026-05-15).
 * Concrete implementation: `apps/editor/src/engine/inspect/InspectModeCoordinator.ts`
 * Reference: docs/archive/pryzm3-internal/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 *
 * ## Design rules
 * - `scene` is typed `unknown` here to keep this contracts package free of a
 *   hard dependency on Three.js. The concrete implementation casts internally
 *   to `THREE.Scene`.  This will be narrowed in Sprint F-2.5 when THREE is
 *   added as a peer dependency of `@pryzm/editor-ui`.
 * - `IInspectModeCoordinator` is intentionally narrow: only `init()` and
 *   `dispose()` are public.  All event wiring is an internal implementation
 *   detail; callers never need to trigger lens changes or room-focus directly —
 *   those travel through `CustomEvent` (`pryzm-set-inspect-lens`, etc.).
 *
 * ## Consumer pattern
 * ```ts
 * import type { IInspectModeCoordinator } from '@pryzm/editor-ui';
 *
 * function initInspect(ctx: IEngineContext, coord: IInspectModeCoordinator) {
 *     coord.init(ctx.scene);
 *     onDispose(() => coord.dispose());
 * }
 * ```
 */
export interface IInspectModeCoordinator {
  /**
   * Wire all `CustomEvent` listeners and inject the Three.js scene.
   * Must be called once after the OBC World and scene are ready.
   *
   * @param scene — A `THREE.Scene` instance.  Typed `unknown` at F-2.4;
   *   narrowed to `THREE.Scene` in Sprint F-2.5.
   */
  init(scene: unknown): void;

  /**
   * Remove all `CustomEvent` listeners and release held references.
   * Must be called on engine shutdown or project close.
   */
  dispose(): void;
}
