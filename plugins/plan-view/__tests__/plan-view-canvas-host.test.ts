// PlanViewCanvasHost unit tests (S29 / ADR-0028).
//
// Uses a fake canvas factory + the FrameScheduler's FakeRafAdapter so
// the test never touches the DOM or real rAF.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Wall, Slab, Door, createId } from '@pryzm/plugin-sdk';
import { FakeRafAdapter, FrameScheduler } from '@pryzm/plugin-sdk';
import { Store } from '@pryzm/plugin-sdk';
import { LevelStore } from '../src/LevelStore.js';
import { PlanViewCanvasHost } from '../src/PlanViewCanvasHost.js';

class WallStore extends Store<Wall> { constructor() { super('wall'); } }
class SlabStore extends Store<Slab> { constructor() { super('slab'); } }
class DoorStore extends Store<Door> { constructor() { super('door'); } }

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

function buildContainer(canvas: HTMLCanvasElement): HTMLElement {
  return {
    appendChild: (c: HTMLCanvasElement) => {
      (canvas as unknown as { parentElement: HTMLElement | null }).parentElement = container;
      return c;
    },
    removeChild: () => {
      (canvas as unknown as { parentElement: HTMLElement | null }).parentElement = null;
    },
  } as unknown as HTMLElement;

  // Hoist:
  // eslint-disable-next-line no-var, @typescript-eslint/no-unused-vars
  var container: HTMLElement;
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
  levels: LevelStore;
  host: PlanViewCanvasHost;
  fake: ReturnType<typeof buildFakeCanvas>;
}

function buildEnv(): Env {
  const scheduler = new FrameScheduler();
  const adapter = new FakeRafAdapter();
  scheduler.start(adapter);
  const walls = new WallStore();
  const slabs = new SlabStore();
  const doors = new DoorStore();
  const levels = new LevelStore();
  const fake = buildFakeCanvas();
  const host = new PlanViewCanvasHost({
    scheduler,
    levelStore: levels,
    wallStore: walls,
    slabStore: slabs,
    doorStore: doors,
    canvasFactory: () => fake.canvas,
  });
  return { scheduler, adapter, walls, slabs, doors, levels, host, fake };
}

function pump(env: Env): void {
  env.adapter.advanceTime(16);
  env.adapter.pump();
}

function addOneWall(env: Env, levelId: string): Wall {
  const w = Wall.parse({ id: createId('wall'), levelId, baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }] });
  env.walls.applyPatch([{ op: 'add', path: [w.id], value: w }]);
  return w;
}

describe('PlanViewCanvasHost', () => {
  let env: Env;
  beforeEach(() => { env = buildEnv(); });
  afterEach(() => { env.host.dispose(); env.scheduler.stop(); });

  it('does NOT render before mount', () => {
    expect(env.host.renderCount).toBe(0);
  });

  it('mount paints once, then idle ticks do not re-render', () => {
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addOneWall(env, 'L1');
    env.host.mount(makeContainer(env.fake.canvas));
    pump(env);
    expect(env.host.renderCount).toBe(1);
    const ticksAfterMount = env.host.tickCount;
    const beforeRender = env.host.renderCount;
    pump(env);
    pump(env);
    pump(env);
    // Ticks may or may not still arrive (scheduler stops the rAF loop when
    // there are no pending frame requests), but irrespective of how many
    // ticks the adapter pumps, the dirty flag must NOT be re-asserted.
    expect(env.host.renderCount).toBe(beforeRender);
    expect(env.host.tickCount).toBeGreaterThanOrEqual(ticksAfterMount);
  });

  it('one wall mutation = one additional render after the next tick', () => {
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    env.host.mount(makeContainer(env.fake.canvas));
    pump(env);
    const before = env.host.renderCount;
    addOneWall(env, 'L1');
    pump(env);
    expect(env.host.renderCount).toBe(before + 1);
  });

  it('switching active level triggers a re-render', () => {
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    env.levels.addLevel({ id: 'L2', name: 'F1', elevation: 3 });
    env.host.mount(makeContainer(env.fake.canvas));
    pump(env);
    const before = env.host.renderCount;
    env.levels.setActive('L2');
    pump(env);
    expect(env.host.renderCount).toBe(before + 1);
  });

  it('render strokes wall segments through the 2D context', () => {
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    addOneWall(env, 'L1');
    env.host.mount(makeContainer(env.fake.canvas));
    pump(env);
    expect(env.fake.calls.stroke).toBeGreaterThan(0);
    expect(env.fake.calls.beginPath).toBeGreaterThan(0);
    expect(env.fake.calls.clearRect).toBeGreaterThan(0);
  });

  it('dispose unsubscribes — store mutations no longer trigger renders', () => {
    env.levels.addLevel({ id: 'L1', name: 'G', elevation: 0 });
    env.host.mount(makeContainer(env.fake.canvas));
    pump(env);
    env.host.dispose();
    const before = env.host.renderCount;
    addOneWall(env, 'L1');
    pump(env);
    expect(env.host.renderCount).toBe(before);
  });

  it('renders empty scene gracefully when no active level is set', () => {
    addOneWall(env, 'L1');
    env.host.mount(makeContainer(env.fake.canvas));
    pump(env);
    // Render still runs once, but no walls are stroked because there's no active level.
    expect(env.host.renderCount).toBe(1);
    expect(env.fake.calls.clearRect).toBe(1);
  });
});
