// bootstrap.render.everything — joins the DATA+PLUGINS half (`bootstrapWithEverything`)
// with the RENDER half (`bootstrap.render.ts`), and wires the four
// most user-visible committers (wall, slab, door, window) to the
// shared CommitterHost.
//
// Why this file exists: prior to this, `mountEditor()` called
// `bootstrapWithEverything()` only, which produces a runtime whose
// `runtime.start()` is a documented no-op (per `bootstrap.ts` lines
// 129-133).  No renderer was attached to the canvas, no scene
// reconciler, no committers — so even though all 12 plugin command
// handlers landed on the bus, dispatching a `wall.create` produced
// data in `WallStore` but **zero pixels on the canvas**.  This module
// closes the gap by joining the two halves with an explicit committer
// wireup (the registry-side `PluginDescriptor` has no `buildCommitter`
// hook — that's a separate piece of work — so the four committers are
// imported by name here).
//
// Lifecycle:
//   1. `bootstrapWithEverything(opts)` — bus + 13 stores + handlers + auxiliaries.
//   2. Construct shared `MaterialPool` (every committer borrows from
//      the same pool so identical materials are de-duplicated).
//   3. Construct + register `WallCommitter`, `SlabCommitter`,
//      `DoorCommitter`, `WindowCommitter` on `runtime.host`.
//   4. `bindStore(store, primitiveType, host)` for each — subscribes
//      the host to per-store dirty diffs so patches → committer dispatch.
//   5. `await Renderer.init(canvas, mode)` — WebGPU/WebGL2 dual-mode.
//   6. `installSceneReconciler(host, renderer, scheduler)` — make
//      `renderer.scene` membership track `host.registry`.
//   7. `new CameraController(renderer.camera, canvas, scheduler)` —
//      orbit / pan / wheel inputs flag `'camera'` dirty per frame.
//   8. `renderer.attachTo(scheduler)` — `render()` runs at the
//      'render' priority on every dirty frame.
//   9. `scheduler.markDirty('camera')` — paint a first frame so the
//      canvas is not blank before the user clicks anything.
//
// The returned `RenderEverythingRuntime` is `EverythingRuntime` (so
// callers can still reach `bus`, `stores`, `wallSystemTypes`,
// `viewRegistry`, …) plus the renderer / scheduler / camera handles
// and a `tearDown()` that disposes everything in reverse order.

import * as THREE from '@pryzm/renderer-three/three';
import {
  CommitterHost,
  MaterialPool,
  bindStore,
  type BindStoreHandle,
  type PrimitiveCommitter,
} from '@pryzm/scene-committer';
import { FrameScheduler } from '@pryzm/frame-scheduler';
import {
  Renderer,
  CameraController,
  type RendererMode,
  type ResolvedRendererMode,
} from '@pryzm/renderer';
import type { Store } from '@pryzm/stores';

// L4 plugin committer subpath imports (declared in each plugin's
// `package.json` `exports["./committer"]`).  These pull the THREE
// touching surface — the rest of each plugin stays THREE-free.
import { WallCommitter } from '@pryzm/plugin-wall/committer';
import { SlabCommitter } from '@pryzm/plugin-slab/committer';
import { DoorCommitter } from '@pryzm/plugin-door/committer';
import { WindowCommitter } from '@pryzm/plugin-window/committer';

import type { WallsState } from '@pryzm/plugin-wall';

import {
  bootstrapWithEverything,
  type BootstrapEverythingOptions,
  type EverythingRuntime,
} from './bootstrap.everything.js';

export interface RenderEverythingOptions extends BootstrapEverythingOptions {
  /** The canvas the renderer renders into.  REQUIRED. */
  readonly canvas: HTMLCanvasElement;
  /** Renderer mode — see ADR-007.  Defaults to 'auto'. */
  readonly mode?: RendererMode;
  /** Optional pre-built FrameScheduler — bench/test fixtures inject
   *  one to verify the dirty-tick wiring without spinning up rAF. */
  readonly scheduler?: FrameScheduler;
}

export interface RenderEverythingRuntime extends EverythingRuntime {
  /** `null` when `Renderer.init()` rejected (e.g. headless browsers
   *  with no WebGL2 context).  The bus + stores half is still fully
   *  wired and dispatching commands still mutates state — only the
   *  pixel-paint half is missing.  Inspect `rendererError` for the
   *  underlying failure. */
  readonly renderer: Renderer | null;
  readonly scheduler: FrameScheduler;
  readonly camera: CameraController | null;
  readonly rendererMode: ResolvedRendererMode | 'unavailable';
  readonly rendererError: Error | null;
  readonly materialPool: MaterialPool;
  /** Idempotent.  Disposes (in order):  renderer-attachment →
   *  reconciler → camera → store-bindings → renderer → inner runtime.
   *  Skips disposers whose construction was skipped due to renderer
   *  init failure. */
  tearDown(): void;
}

export async function bootstrapRenderEverything(
  opts: RenderEverythingOptions,
): Promise<RenderEverythingRuntime> {
  // --- 1. Data + plugins (no committers passed; we wire them after). ---
  // `bootstrapWithEverything` is async (batch-yields between plugins per NFT-4).
  const inner = await bootstrapWithEverything(opts);

  // --- 2. Shared MaterialPool. ---
  const materialPool = new MaterialPool();

  // --- 3. Build the four most-visible committers. ---
  // Door + window committers need a `wallsSnapshot` callback so they
  // can resolve `dto.wallId` to the host wall's geometry.  We close
  // over `inner.stores.wall` — the wall plugin contributes its store
  // under the key `'wall'` per `PluginRegistry.ts` line 87.
  const wallStore = inner.stores.wall as Store<{ id: string; [k: string]: unknown }> | undefined;
  if (wallStore === undefined) {
    throw new Error(
      '[bootstrap.render.everything] expected a wall store on `runtime.stores.wall` ' +
        'but found none — check that the wall plugin is in `ALL_PLUGINS`.',
    );
  }
  const wallsSnapshot = (): WallsState => {
    // `Store<T>` exposes its current state via `getState()` (a
    // ReadonlyMap).  We materialise it as a plain object so the
    // committer can do `state[wallId]` without learning about Maps.
    const state = wallStore.getState() as ReadonlyMap<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [id, dto] of state) out[id] = dto;
    return out as WallsState;
  };

  const wallCommitter = new WallCommitter(materialPool);
  const slabCommitter = new SlabCommitter({
    materialPool,
    worldY: () => 0,
  });
  const doorCommitter = new DoorCommitter({
    materialPool,
    wallsSnapshot,
  });
  const windowCommitter = new WindowCommitter({
    materialPool,
    wallsSnapshot,
  });

  // --- 4. Register committers + bind stores → host. ---
  // `inner.host` is the CommitterHost constructed by the L0→L5 base
  // bootstrap; `register()` takes a PrimitiveCommitter and dedups by
  // `primitiveType`.  `bindStore()` subscribes the host to the
  // store's dirty-diff stream so per-tick batched patches are
  // dispatched to `committer.onAdd / onUpdate / onRemove`.
  inner.host.register(wallCommitter as unknown as PrimitiveCommitter);
  inner.host.register(slabCommitter as unknown as PrimitiveCommitter);
  inner.host.register(doorCommitter as unknown as PrimitiveCommitter);
  inner.host.register(windowCommitter as unknown as PrimitiveCommitter);

  const bindings: BindStoreHandle[] = [];
  const bindOne = (storeKey: string, primitiveType: string): void => {
    const store = inner.stores[storeKey] as Store<object> | undefined;
    if (store === undefined) return;
    bindings.push(bindStore(store, primitiveType, inner.host));
  };
  bindOne('wall', 'wall');
  bindOne('slab', 'slab');
  bindOne('door', 'door');
  bindOne('window', 'window');

  // --- 5. Renderer + scheduler. ---
  // The renderer init is allowed to fail soft.  Headless browsers
  // (Replit's screenshot tool, some CI runners) don't expose a
  // WebGL2 context, and we don't want a missing GPU to brick the
  // command bus + store half — chrome and command dispatch should
  // still work, the user just won't see pixels.  The failure is
  // surfaced via `rendererError` so the host UI can paint a banner.
  const scheduler = opts.scheduler ?? new FrameScheduler();
  let renderer: Renderer | null = null;
  let rendererError: Error | null = null;
  let detachRenderer: (() => void) | null = null;
  let detachReconciler: (() => void) | null = null;
  let camera: CameraController | null = null;
  try {
    renderer = await Renderer.init(opts.canvas, { mode: opts.mode ?? 'auto' });
    detachReconciler = installSceneReconciler(inner.host, renderer, scheduler);
    camera = new CameraController(renderer.camera, opts.canvas, scheduler);
    detachRenderer = renderer.attachTo(scheduler, 'renderer.draw');
    scheduler.markDirty('camera');
  } catch (err) {
    rendererError = err instanceof Error ? err : new Error(String(err));
    console.warn(
      '[bootstrap.render.everything] renderer init failed — continuing in ' +
        'headless/data-only mode.  Bus + stores still work, no pixels will paint:',
      rendererError,
    );
  }

  // Honor the inner runtime's start() contract (no-op today, may
  // become non-trivial in a future S06-D5-style upgrade).
  inner.start();

  let torn = false;
  return {
    ...inner,
    renderer,
    scheduler,
    camera,
    rendererMode: renderer?.mode ?? 'unavailable',
    rendererError,
    materialPool,
    tearDown(): void {
      if (torn) return;
      torn = true;
      if (detachRenderer !== null) {
        try { detachRenderer(); } catch { /* ignore */ }
      }
      if (detachReconciler !== null) {
        try { detachReconciler(); } catch { /* ignore */ }
      }
      if (camera !== null) {
        try { camera.dispose(); } catch { /* ignore */ }
      }
      for (const b of bindings) {
        try { b.dispose(); } catch { /* ignore */ }
      }
      if (renderer !== null) {
        try { renderer.dispose(); } catch { /* ignore */ }
      }
      try { inner.tearDown(); } catch { /* ignore */ }
    },
  };
}

/** Reconcile `renderer.scene` membership with `host.registry`.
 *
 *  Verbatim port of the `installSceneReconciler` helper in
 *  `bootstrap.render.ts` — duplicated here (rather than imported) so
 *  changing the render-only bootstrap doesn't accidentally change
 *  this one.  Returns a disposer that unregisters the listener and
 *  clears the tracked set. */
function installSceneReconciler(
  host: CommitterHost,
  renderer: Renderer,
  scheduler: FrameScheduler,
): () => void {
  const tracked = new Set<unknown>();
  const dispose = scheduler.addTickListener(
    'renderer.scene-reconcile',
    (): void => {
      const live = new Set<unknown>();
      for (const obj of host.registry.values()) {
        live.add(obj);
        if (!tracked.has(obj)) {
          tracked.add(obj);
          renderer.scene.add(obj as THREE.Object3D);
        }
      }
      if (tracked.size > live.size) {
        for (const obj of tracked) {
          if (!live.has(obj)) {
            tracked.delete(obj);
            renderer.scene.remove(obj as THREE.Object3D);
          }
        }
      }
    },
    'pre-render',
  );
  return () => {
    dispose();
    tracked.clear();
  };
}
