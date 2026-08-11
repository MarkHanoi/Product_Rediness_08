// ─── The certification WORLD — production topology, headless ────────────────
//
// Reproduces, with REAL classes (zero fakes on the measured path), the exact
// production wiring the API-VERB-REGISTER's LIVE rows describe:
//
//   bus verb → initBusHandlers bridge / plugin bridge handler
//            → window.commandManager (REAL CommandManager)
//            → REAL legacy command (@pryzm/command-registry)
//            → REAL legacy geometry store (the instances ProjectSerializer reads)
//
// STUB LEDGER (declared loudly, per doctrine):
//   • CommandBus storesProvider hands out detached plugin-DTO record objects —
//     EXACTLY what production does (bootstrap.ts storesAsRecordView over fresh
//     PluginRegistry stores). They are write-only sinks by construction; nothing
//     in this harness reads a verdict from them.
//   • The ring buffer is a recording stand-in ({push}); the undo harness
//     certifies the LEGACY commandManager stack (the declared undo owner of
//     every verb under test — register column `undo: legacy-stack`). The
//     unified performUndoRedo path (ring-first + 250 ms cross-stack window) is
//     NOT certified here and is said so in the report.
//   • BimManager receives a real THREE.Scene from the sanctioned facade
//     (@pryzm/renderer-three/three) — geometry MESHES are still never built
//     (no fragment builders are registered), so the Geometry chain link stays
//     UNPROVEN in every row this harness emits.

import { CommandBus } from '@pryzm/command-bus';
import { CommandManager } from '@pryzm/command-registry';
import type { CommandContext } from '@pryzm/command-registry';
import * as THREE from '@pryzm/renderer-three/three';
import { BimManager, ProjectContext } from '@pryzm/core-app-model';
import {
  BeamStore, HandrailStore, OpeningStore, GridStore, CeilingStore, FloorStore,
} from '@pryzm/core-app-model';
import { WallStore } from '@pryzm/geometry-wall';
import { SlabStore } from '@pryzm/geometry-slab';
import { ColumnStore } from '@pryzm/geometry-column';
import { StairStore } from '@pryzm/geometry-stair';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { RoofStore } from '@pryzm/geometry-roof';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import { FurnitureStore } from '@pryzm/geometry-furniture';
import { RoomStore } from '@pryzm/room-topology';
// The two module singletons ProjectSerializer + CommandManager import directly —
// the accidental-but-real authoritative stores for doors/windows (audit §17.0.1).
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

export interface RingEntry {
  forward: { ops?: unknown[] } | unknown;
  inverse: { ops?: unknown[] } | unknown;
  affectedStores: readonly string[];
}

export interface World {
  bus: CommandBus;
  cm: CommandManager;
  ctx: CommandContext;
  bimManager: BimManager;
  projectContext: ProjectContext;
  stores: Record<string, any>;
  ringPushes: RingEntry[];
  /** verbs whose plugin-handler registration failed, with the reason. */
  registrationFailures: Array<{ verb: string; reason: string }>;
  /** structured dispatch — a THROW is never merged with "no change". */
  dispatch(type: string, payload: unknown): Promise<{ ok: boolean; err: string }>;
}

/** Register, on the bus, whichever export of `mod` declares handler `verb`.
 *  Classes are instantiated; const handlers registered as-is. */
function registerVerbFromModule(
  bus: CommandBus,
  mod: Record<string, unknown>,
  verb: string,
  failures: Array<{ verb: string; reason: string }>,
): void {
  try {
    for (const value of Object.values(mod)) {
      let candidate: { type?: string } | undefined;
      if (value && typeof value === 'object') {
        candidate = value as { type?: string };
      } else if (typeof value === 'function') {
        try { candidate = new (value as new () => { type?: string })(); } catch { candidate = undefined; }
      }
      if (candidate && candidate.type === verb) {
        bus.register(candidate as never);
        return;
      }
    }
    failures.push({ verb, reason: `no export in module declares type '${verb}'` });
  } catch (e) {
    failures.push({ verb, reason: String(e).slice(0, 300) });
  }
}

/**
 * STUB LEDGER entry: happy-dom's canvas.getContext('2d') returns null, which
 * crashes LevelVisualizer._makeLevelHead (it draws the level-head SPRITE
 * texture — pure presentation; no authoritative state passes through it).
 * Patch getContext to hand back an inert recording 2D context ONLY when the
 * environment returns null. Nothing measured by either harness reads pixels.
 */
function shimCanvas2D(): void {
  const proto = (globalThis as { HTMLCanvasElement?: { prototype: { getContext: (...a: unknown[]) => unknown } } }).HTMLCanvasElement?.prototype;
  if (!proto) return;
  const original = proto.getContext;
  proto.getContext = function (...args: unknown[]) {
    const real = original.apply(this, args as never);
    if (real) return real;
    const noop = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'measureText') return () => ({ width: 0 });
        if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        if (prop === 'canvas') return this;
        return () => undefined;
      },
      set: () => true,
    });
    return noop;
  };
}

export async function buildWorld(): Promise<World> {
  shimCanvas2D();
  const w = window as unknown as Record<string, unknown>;
  w.__pryzmInitComplete = true;

  // STUB LEDGER entry: report the document as HIDDEN. ProjectLoader's chunked
  // driver yields via `yieldForProgress`, which for a VISIBLE document parks on
  // the P3 frame bus — a bus that never ticks headlessly (no rAF loop exists in
  // Node), so the load awaits a frame that can never arrive (the L-716
  // unsatisfiable-gate shape; the smoke run measured exactly this: a 600 s
  // hang). `document.hidden === true` routes the SAME production code through
  // its own hidden-tab macrotask branch (progressScheduler.ts:184-186) — a real
  // path every background-tab load takes, not a harness fork.
  try {
    Object.defineProperty((globalThis as { document?: object }).document ?? {}, 'hidden', {
      get: () => true, configurable: true,
    });
  } catch { /* if the property resists, the loader hang will surface loudly in the run */ }

  const projectContext = new ProjectContext();
  const bimManager = new BimManager(new THREE.Scene(), undefined);
  w.projectContext = projectContext;
  w.bimManager = bimManager;

  // Store construction mirrors apps/editor/src/engine/initBuilders.ts arg-for-arg.
  const wallStore = new WallStore(projectContext, bimManager);
  const slabStore = new SlabStore(projectContext as never);
  const columnStore = new ColumnStore(projectContext as never);
  const gridStore = new GridStore(projectContext as never);
  const stairStore = new StairStore(projectContext as never);
  const beamStore = new BeamStore(projectContext as never);
  const curtainWallStore = new CurtainWallStore();
  const roofStore = new RoofStore(projectContext as never);
  const plumbingStore = new PlumbingStore();
  const furnitureStore = new FurnitureStore();
  const handrailStore = new HandrailStore(projectContext as never);
  const openingStore = new OpeningStore(projectContext as never);
  const ceilingStore = new CeilingStore();
  const floorStore = new FloorStore();
  const roomStore = new RoomStore(projectContext as never, bimManager as never);

  bimManager.setRoofStore(roofStore as never);
  bimManager.setGridStore(gridStore as never);

  const stores: Record<string, any> = {
    wallStore, slabStore, columnStore, gridStore, stairStore, beamStore,
    curtainWallStore, roofStore, plumbingStore, furnitureStore, handrailStore,
    openingStore, ceilingStore, floorStore, roomStore,
  };
  // The legacy world reads window.<x>Store — same instances, one authority.
  for (const [k, v] of Object.entries(stores)) w[k] = v;

  const ctx = {
    bimManager, projectContext, stores,
    commandManager: undefined as unknown,
  } as unknown as CommandContext;
  const cm = new CommandManager(ctx);
  (ctx as { commandManager?: unknown }).commandManager = cm;
  w.commandManager = cm;

  // Detached plugin-DTO record objects — production's storesAsRecordView shape.
  const dtoStores: Record<string, Record<string, unknown>> = {};
  for (const key of [
    'wall', 'slab', 'door', 'window', 'roof', 'room', 'rooms', 'ceiling', 'floor',
    'beam', 'column', 'stair', 'curtainwall', 'furniture', 'plumbing', 'handrail',
    'grid', 'level', 'opening', 'annotation', 'dimension',
  ]) dtoStores[key] = {};

  const bus = new CommandBus({
    audit: { actorId: 'cert-harness', projectId: 'bim20-cert', clientId: 'node' },
    storesProvider: () => dtoStores as never,
  } as never);
  const ringPushes: RingEntry[] = [];
  (bus as unknown as { setRingBuffer(rb: unknown): void }).setRingBuffer({
    push: (p: RingEntry) => { ringPushes.push(p); },
  });

  const registrationFailures: Array<{ verb: string; reason: string }> = [];

  // The REAL apps/editor bridge registrations (roof.update, wall.updateDimensions,
  // element.updateParameters, door/window offset + colour bridges, …).
  const { initBusHandlers } = await import('../../../apps/editor/src/engine/initBusHandlers');
  initBusHandlers({ bus } as never);

  // Plugin bridge handlers for the LIVE plugin-owned rows under certification.
  const pluginVerbModules: Array<[string, () => Promise<Record<string, unknown>>]> = [
    ['wall.updateBaseline',          () => import('../../../plugins/wall/src/handlers/UpdateWallBaseline')],
    ['wall.updateSystemTypeBatch',   () => import('../../../plugins/wall/src/handlers/UpdateWallsSystemTypeBatch')],
    ['wall.updateColorBatch',        () => import('../../../plugins/wall/src/handlers/UpdateWallsColorBatch')],
    ['room.setMaterial',             () => import('../../../plugins/rooms/src/handlers/SetRoomMaterial')],
    ['room.setName',                 () => import('../../../plugins/rooms/src/handlers/SetRoomName')],
    ['room.setNumber',               () => import('../../../plugins/rooms/src/handlers/SetRoomNumber')],
    ['door.updateSystemTypeBatch',   () => import('../../../plugins/door/src/handlers/UpdateDoorsSystemTypeBatch')],
    ['window.updateSystemTypeBatch', () => import('../../../plugins/window/src/handlers/UpdateWindowsSystemTypeBatch')],
    ['slab.updateSystemTypeBatch',   () => import('../../../plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch')],
  ];
  for (const [verb, load] of pluginVerbModules) {
    try {
      const mod = await load();
      if ((bus.registry as Map<string, unknown>).has?.(verb)) continue;
      registerVerbFromModule(bus, mod, verb, registrationFailures);
    } catch (e) {
      registrationFailures.push({ verb, reason: 'import failed: ' + String(e).slice(0, 300) });
    }
  }

  w.runtime = { bus };

  async function dispatch(type: string, payload: unknown): Promise<{ ok: boolean; err: string }> {
    try { await bus.executeCommand(type as never, payload as never); return { ok: true, err: '' }; }
    catch (e) { return { ok: false, err: String(e).slice(0, 400) }; }
  }

  return {
    bus, cm, ctx, bimManager, projectContext, stores,
    ringPushes, registrationFailures, dispatch,
  };
}

export { doorStore, windowStore };
