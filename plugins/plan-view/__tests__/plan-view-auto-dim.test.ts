// PlanViewCanvasHost — S35 supplement Auto-Dim wiring tests.
//
// Verifies that the host's `commitAutoDimensions` seam runs the
// DimensionProducer → DimensionEvaluator → Canvas2D DimensionCommitter
// pipeline end-to-end against the per-frame element snapshot, gated on
// the per-view `DimensionViewSettings.autoDimensionMode`.
//
// PATTERN
// ─────────────────────────────────────────────────────────────────────
// Mirrors the fake-canvas + FakeRafAdapter pattern from
// `plan-view-canvas-host.test.ts`.  We compare the canvas-primitive
// counts after a render with auto-dim ON vs OFF — the auto-dim pipeline
// emits witness-line moveTo/lineTo pairs and a dim-text fillText call,
// so a positive delta proves the seam reached the committer.
//
// We deliberately do NOT assert exact pixel coords — those belong to
// the kernel evaluator's own unit tests (committed at S33/S34).  The
// host's responsibility is wiring + coord-system bridging only.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Wall, Slab, Door, Window, createId } from '@pryzm/plugin-sdk';
import { FakeRafAdapter, FrameScheduler } from '@pryzm/plugin-sdk';
import { Store, type DimensionViewSettings } from '@pryzm/plugin-sdk';
import { LevelStore } from '../src/LevelStore.js';
import {
  PlanViewCanvasHost,
  type PlanViewRoomLike,
} from '../src/PlanViewCanvasHost.js';

class WallStore extends Store<Wall> { constructor() { super('wall'); } }
class SlabStore extends Store<Slab> { constructor() { super('slab'); } }
class DoorStore extends Store<Door> { constructor() { super('door'); } }
class WindowStore extends Store<Window> { constructor() { super('window'); } }
class RoomStore extends Store<PlanViewRoomLike> { constructor() { super('room'); } }

interface FakeCtxCalls {
  setTransform: number;
  clearRect: number;
  fillRect: number;
  beginPath: number;
  moveTo: number;
  lineTo: number;
  closePath: number;
  stroke: number;
  fill: number;
  save: number;
  restore: number;
  translate: number;
  scale: number;
  rotate: number;
  fillText: number;
}

function buildFakeCanvas(): { canvas: HTMLCanvasElement; calls: FakeCtxCalls } {
  const calls: FakeCtxCalls = {
    setTransform: 0, clearRect: 0, fillRect: 0, beginPath: 0, moveTo: 0,
    lineTo: 0, closePath: 0, stroke: 0, fill: 0,
    save: 0, restore: 0, translate: 0, scale: 0, rotate: 0, fillText: 0,
  };
  const ctx = {
    setTransform: () => { calls.setTransform++; },
    clearRect: () => { calls.clearRect++; },
    fillRect: () => { calls.fillRect++; },
    beginPath: () => { calls.beginPath++; },
    moveTo: () => { calls.moveTo++; },
    lineTo: () => { calls.lineTo++; },
    closePath: () => { calls.closePath++; },
    stroke: () => { calls.stroke++; },
    fill: () => { calls.fill++; },
    save: () => { calls.save++; },
    restore: () => { calls.restore++; },
    translate: () => { calls.translate++; },
    scale: () => { calls.scale++; },
    rotate: () => { calls.rotate++; },
    fillText: () => { calls.fillText++; },
    measureText: (_t: string) => ({ width: 10 }),
    // The dim committer toggles dashed witness lines; fake the API so
    // the call is a no-op rather than throwing.
    setLineDash: (_pattern: number[]) => { /* no-op */ },
    getLineDash: () => [] as number[],
    lineWidth: 0,
    strokeStyle: '#000',
    fillStyle: '#000',
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
  const canvas = {
    width: 800,
    height: 600,
    parentElement: null as HTMLElement | null,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

function makeContainer(canvas: HTMLCanvasElement): HTMLElement {
  const c: HTMLElement = {
    appendChild: ((child: HTMLCanvasElement) => {
      Object.defineProperty(canvas, 'parentElement', { value: c, configurable: true });
      return child;
    }) as unknown as HTMLElement['appendChild'],
    removeChild: ((_child: HTMLCanvasElement) => {
      Object.defineProperty(canvas, 'parentElement', { value: null, configurable: true });
      return _child;
    }) as unknown as HTMLElement['removeChild'],
  } as unknown as HTMLElement;
  return c;
}

interface Env {
  scheduler: FrameScheduler;
  adapter: FakeRafAdapter;
  walls: WallStore;
  slabs: SlabStore;
  doors: DoorStore;
  windows: WindowStore;
  rooms: RoomStore;
  levels: LevelStore;
  fake: ReturnType<typeof buildFakeCanvas>;
}

function buildEnvBase(): Omit<Env, never> {
  const scheduler = new FrameScheduler();
  const adapter = new FakeRafAdapter();
  scheduler.start(adapter);
  return {
    scheduler,
    adapter,
    walls: new WallStore(),
    slabs: new SlabStore(),
    doors: new DoorStore(),
    windows: new WindowStore(),
    rooms: new RoomStore(),
    levels: new LevelStore(),
    fake: buildFakeCanvas(),
  };
}

interface BuildHostOpts {
  autoDimensionSettings?: DimensionViewSettings;
}

function buildHost(env: Env, opts: BuildHostOpts = {}): PlanViewCanvasHost {
  return new PlanViewCanvasHost({
    scheduler: env.scheduler,
    levelStore: env.levels,
    wallStore: env.walls,
    slabStore: env.slabs,
    doorStore: env.doors,
    windowStore: env.windows,
    roomStore: env.rooms,
    canvasFactory: () => env.fake.canvas,
    ...(opts.autoDimensionSettings
      ? { autoDimensionSettings: opts.autoDimensionSettings }
      : {}),
    // Deterministic id factory so a re-render produces stable ids — keeps
    // any future snapshot diffs sane.
    dimensionIdFactory: ((): (() => string) => {
      let n = 0;
      return () => `dim-test-${(++n).toString().padStart(4, '0')}`;
    })(),
  });
}

function pump(env: Env): void {
  env.adapter.advanceTime(16);
  env.adapter.pump();
}

function addWall(env: Env, levelId: string): Wall {
  const w = Wall.parse({
    id: createId('wall'),
    levelId,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
  });
  env.walls.applyPatch([{ op: 'add', path: [w.id], value: w }]);
  return w;
}

function addRoom(env: Env, levelId: string): PlanViewRoomLike {
  const r: PlanViewRoomLike = {
    id: createId('room'),
    levelId,
    polygon: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 },
    ],
  };
  env.rooms.applyPatch([{ op: 'add', path: [r.id], value: r }]);
  return r;
}

describe('PlanViewCanvasHost — S35 Auto-Dim wiring', () => {
  let env: Env;
  beforeEach(() => { env = buildEnvBase(); });
  afterEach(() => { env.scheduler.stop(); });

  it('no `autoDimensionSettings` → host renders without invoking dim pipeline', () => {
    const host = buildHost(env);
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addWall(env, 'L1');
    host.mount(makeContainer(env.fake.canvas));
    pump(env);
    // The renderer fills text for room labels only when the room store is
    // empty + the renderer doesn't draw any text — wall-only render with
    // no annotations + no dims should leave fillText untouched.
    expect(env.fake.calls.fillText).toBe(0);
    host.dispose();
  });

  it('`autoDimensionMode: "off"` → pipeline skipped (zero fillText)', () => {
    const host = buildHost(env, {
      autoDimensionSettings: { autoDimensionMode: 'off' },
    });
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addWall(env, 'L1');
    host.mount(makeContainer(env.fake.canvas));
    pump(env);
    expect(env.fake.calls.fillText).toBe(0);
    host.dispose();
  });

  it('`per-element` with one wall → committer paints witness + dim text', () => {
    // Baseline: same scene with auto-dim OFF — capture the wall-stroke
    // primitive counts.
    const ctlEnv = buildEnvBase();
    const ctlHost = buildHost(ctlEnv);
    ctlEnv.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addWall(ctlEnv, 'L1');
    ctlHost.mount(makeContainer(ctlEnv.fake.canvas));
    pump(ctlEnv);
    const baselineMoveTo = ctlEnv.fake.calls.moveTo;
    const baselineFillText = ctlEnv.fake.calls.fillText;
    ctlHost.dispose();
    ctlEnv.scheduler.stop();

    // Live: identical scene with auto-dim ON.
    const host = buildHost(env, {
      autoDimensionSettings: { autoDimensionMode: 'per-element' },
    });
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addWall(env, 'L1');
    host.mount(makeContainer(env.fake.canvas));
    pump(env);

    // The committer emits at least 2 moveTo per dim (witness lines + dim
    // line) and 1 fillText for the value text.
    expect(env.fake.calls.moveTo).toBeGreaterThan(baselineMoveTo);
    expect(env.fake.calls.fillText).toBeGreaterThan(baselineFillText);
    host.dispose();
  });

  it('`room-bounding` with one room → committer paints both extent dims', () => {
    // Baseline: same scene without auto-dim.
    const ctlEnv = buildEnvBase();
    const ctlHost = buildHost(ctlEnv);
    ctlEnv.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addRoom(ctlEnv, 'L1');
    ctlHost.mount(makeContainer(ctlEnv.fake.canvas));
    pump(ctlEnv);
    const baselineMoveTo = ctlEnv.fake.calls.moveTo;
    const baselineFillText = ctlEnv.fake.calls.fillText;
    ctlHost.dispose();
    ctlEnv.scheduler.stop();

    // Live: room-bounding mode → producer yields 2 dims per room (X + Y
    // extents), so the committer must paint TWO value-text labels.
    const host = buildHost(env, {
      autoDimensionSettings: { autoDimensionMode: 'room-bounding' },
    });
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addRoom(env, 'L1');
    host.mount(makeContainer(env.fake.canvas));
    pump(env);

    expect(env.fake.calls.moveTo).toBeGreaterThan(baselineMoveTo);
    // 2 dims × 1 fillText each = at least baseline + 2.
    expect(env.fake.calls.fillText).toBeGreaterThanOrEqual(baselineFillText + 2);
    host.dispose();
  });

  it('settings callback resolved per-frame — switching `off` → `per-element` re-engages pipeline', () => {
    let mode: DimensionViewSettings['autoDimensionMode'] = 'off';
    const host = new PlanViewCanvasHost({
      scheduler: env.scheduler,
      levelStore: env.levels,
      wallStore: env.walls,
      slabStore: env.slabs,
      doorStore: env.doors,
      canvasFactory: () => env.fake.canvas,
      autoDimensionSettings: () => ({ autoDimensionMode: mode }),
    });
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addWall(env, 'L1');
    host.mount(makeContainer(env.fake.canvas));
    pump(env);
    const beforeFillText = env.fake.calls.fillText;
    expect(beforeFillText).toBe(0);

    // Flip the mode AND nudge the wall store so the dirty path triggers
    // a new render.
    mode = 'per-element';
    addWall(env, 'L1');
    pump(env);
    expect(env.fake.calls.fillText).toBeGreaterThan(beforeFillText);
    host.dispose();
  });
});
