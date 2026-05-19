// @pryzm/plugin-rooms — event-driven room redetection subscriptions.
//
// Task 1.3 (C11 §6.3) — Room boundaries MUST be recomputed after wall / curtain-wall
// mutations.  The trigger MUST be event-driven (typed domain events via
// `runtime.events`), not an imperative `commandManager.execute()` call.
//
// Canonical pattern (C11 §6.3):
//   runtime.events.on('wall.created', async ({ levelId }) => {
//     await runtime.bus.executeCommand('rooms.redetect', { levelId });
//   });
//
// Architecture note — no runtime-composer import.
//   plugin-rooms (L4) must NOT take a static dep on the runtime-composer
//   package (L2) — that would create a workspace-package cycle
//   (runtime-composer → editor → plugin-rooms).  Instead this file declares
//   a locally-scoped minimal structural interface that is assignable from
//   PryzmRuntime; compatibility is enforced at the call site in
//   apps/editor/src/PluginRegistry.ts.
//
// Disposer contract:
//   `wireRoomEventSubscriptions(runtime)` returns a no-arg disposer.  Call it
//   during runtime tear-down to unsubscribe all listeners (prevents memory
//   leaks in hot-reload / test environments).

/** Minimal runtime surface needed for room event-subscription wiring.
 *  Structurally compatible with PryzmRuntime (runtime-composer package).
 *
 *  Design note — `any` in events.on:
 *    TypedEventEmitter<RuntimeEvents>.on is generic with a `keyof RuntimeEvents`
 *    constraint, so TypeScript's structural assignability rules prevent a plain
 *    `on(event: string, handler: ...) => void` signature from matching.  Using
 *    `any` here is the approved L4→L2 adapter shim pattern (same as the
 *    wall-contribution's minimal-runtime approach): the wider shim type is
 *    intentionally permissive; actual type safety is enforced inside
 *    `wireRoomEventSubscriptions` where the event names are string literals. */

/** Minimal disposable returned by `events.on()`.
 *  Mirrors the Disposable interface from the runtime-composer types module
 *  without importing that package (avoids the cycle described above). */
export interface RoomEventDisposable {
  dispose(): void;
}

export interface RoomEventRuntime {
  readonly events: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: any, handler: (payload: any) => void | Promise<void>): RoomEventDisposable;
  };
  readonly bus: {
    executeCommand(type: string, payload: unknown): unknown;
  };
}

/** Default level elevation (m) used when not supplied by the event payload. */
const DEFAULT_ELEVATION = 0;

/** Default level height (m) — matches the Project schema ground-floor default. */
const DEFAULT_HEIGHT = 3;

/**
 * Subscribe to typed domain events and dispatch `rooms.redetect` for each
 * affected level.  Implements the C11 §6.3 event-driven room redetection
 * contract.
 *
 * Covered triggers:
 *   - `wall.created`         — fired by CommandEventBridge after `wall.create`
 *                              or `wall.batch.create` succeeds.
 *   - `curtain-wall.created` — fired by CommandEventBridge after
 *                              `curtainwall.create` or `curtain-wall.batch.create`.
 *
 * Returns a disposer — call in `runtime.tearDown()` to unsubscribe all
 * listeners and prevent memory leaks.
 */
export function wireRoomEventSubscriptions(runtime: RoomEventRuntime): () => void {
  const disposers: RoomEventDisposable[] = [];

  disposers.push(
    runtime.events.on('wall.created', async (payload) => {
      const levelId = typeof payload.levelId === 'string' ? payload.levelId : '';
      if (!levelId) return;
      try {
        await runtime.bus.executeCommand('rooms.redetect', {
          levelId,
          elevation: DEFAULT_ELEVATION,
          height:    DEFAULT_HEIGHT,
        });
      } catch (err) {
        console.error('[rooms/contributions] rooms.redetect failed (wall.created):', err);
      }
    }),
  );

  disposers.push(
    runtime.events.on('curtain-wall.created', async (payload) => {
      const levelId = typeof payload.levelId === 'string' ? payload.levelId : '';
      if (!levelId) return;
      try {
        await runtime.bus.executeCommand('rooms.redetect', {
          levelId,
          elevation: DEFAULT_ELEVATION,
          height:    DEFAULT_HEIGHT,
        });
      } catch (err) {
        console.error(
          '[rooms/contributions] rooms.redetect failed (curtain-wall.created):',
          err,
        );
      }
    }),
  );

  return () => {
    for (const d of disposers) d.dispose();
  };
}
