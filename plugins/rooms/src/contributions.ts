// @pryzm/plugin-rooms — event-driven room redetection subscriptions.
//
// Task 1.3 (C11 §6.3) — Room boundaries MUST be recomputed after wall / curtain-wall
// mutations.  The trigger MUST be event-driven (typed domain events via
// `runtime.events`), not an imperative `commandManager.execute()` call.
//
// Canonical pattern (C11 §6.3):
//   runtime.events.on('wall.created', async ({ levelId }) => {
//     await runtime.bus.executeCommand('room.redetect', { levelId });
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

/** §GEN-SINGLE-REDETECT (L-377, 2026-07-17) — true while a resi/office/house generation is in
 *  flight (`globalThis.__pryzmBuildingGenActive`, set by buildingGenerationLifecycle at the true
 *  start and cleared on release()).
 *
 *  WHY this gate: `wall.batch.create` fans out ONE `wall.created` per wall via CommandEventBridge.
 *  Each one dispatched `room.redetect` below → `pryzm-bus-rooms-redetect` → a SYNCHRONOUS
 *  `ReDetectRoomsCommand` re-running the FULL RoomDetectionEngine on the level. For a generation
 *  that lands N walls that is O(N) full redetects (each itself O(rooms)) — the dominant
 *  "finishing up" latency (rooms recomputed 1→2→…→N per wall). This is a SEPARATE trigger from
 *  the RoomTopologyObserver, which L-369 already gates on the same flag; this bus subscription was
 *  the un-gated twin.
 *
 *  WHY it is safe to suppress during generation (correctness-first): the executors create
 *  GRAPH-AUTHORITATIVE rooms directly (BatchCreateRoomsCommand / ADR-0069), and
 *  `buildingGenerationLifecycle.release()` fires ONE final `scheduleRedetectAllLevels()` sweep at
 *  the true end of the generation — graph-authoritative levels stay suppressed there (rooms already
 *  own their identity), and any non-graph level recovers its single detection in that one sweep. So
 *  the per-wall redetect during generation is pure redundant work.
 *
 *  Read via `globalThis` (no import) — the same flag seam RoomTopologyObserver uses, keeping
 *  plugin-rooms (L4) free of any lifecycle-module coupling. A live user edit (flag cleared) still
 *  redetects normally on every `wall.created`. */
function __pryzmBuildingGenActive(): boolean {
  return (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive === true;
}

/**
 * Subscribe to typed domain events and dispatch `room.redetect` for each
 * affected level.  Implements the C11 §6.3 event-driven room redetection
 * contract.
 *
 * Covered triggers:
 *   - `wall.created`         — fired by CommandEventBridge after `wall.create`
 *                              or `wall.batch.create` succeeds.
 *   - `curtain-wall.created` — fired by CommandEventBridge after
 *                              `curtain-wall.create` or `curtain-wall.batch.create`.
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
      // §GEN-SINGLE-REDETECT (L-377) — suppress the per-wall redetect storm during a building
      // generation; the graph-authoritative rooms + the one release() sweep own the final state.
      if (__pryzmBuildingGenActive()) return;
      try {
        await runtime.bus.executeCommand('room.redetect', {
          levelId,
          elevation: DEFAULT_ELEVATION,
          height:    DEFAULT_HEIGHT,
        });
      } catch (err) {
        console.error('[rooms/contributions] room.redetect failed (wall.created):', err);
      }
    }),
  );

  disposers.push(
    runtime.events.on('curtain-wall.created', async (payload) => {
      const levelId = typeof payload.levelId === 'string' ? payload.levelId : '';
      if (!levelId) return;
      // §GEN-SINGLE-REDETECT (L-377) — same gate as wall.created: a generation's curtain-wall
      // batch fans out one event per element; the release() sweep owns the final redetect.
      if (__pryzmBuildingGenActive()) return;
      try {
        await runtime.bus.executeCommand('room.redetect', {
          levelId,
          elevation: DEFAULT_ELEVATION,
          height:    DEFAULT_HEIGHT,
        });
      } catch (err) {
        console.error(
          '[rooms/contributions] room.redetect failed (curtain-wall.created):',
          err,
        );
      }
    }),
  );

  return () => {
    for (const d of disposers) d.dispose();
  };
}
