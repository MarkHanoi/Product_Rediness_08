// Grid handler smoke suite (S12-T4).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { GridStore, type GridData, type GridsState } from '../src/store.js';
import {
  buildGridHandlerSet,
  registerGridHandlers,
  GRID_HANDLER_TYPES,
} from '../src/handlers/index.js';
import { generateRectGridLines } from '../src/intent.js';

function buildEnv() {
  const grid = new GridStore();
  const stores = { grid: grid as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({ grid: Object.fromEntries(grid.getState()) as GridsState }),
  });
  for (const h of buildGridHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { grid, bus, detach };
}

function snap(s: GridStore): Record<string, GridData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}
function undoLast(s: GridStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

describe('grid handler registration', () => {
  it('registers all 4 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ grid: {} }),
    });
    const types = registerGridHandlers(bus);
    expect([...types].sort()).toEqual([...GRID_HANDLER_TYPES].sort());
    env.detach();
  });
});

describe('grid.create / delete / setSpacing / setExtent', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates with caller-provided lines and inverts', async () => {
    env = buildEnv();
    const id = createId('grid');
    const lines = generateRectGridLines({
      spacingX: 5, spacingZ: 5, countX: 3, countZ: 2, extent: 15,
    });
    const before = snap(env.grid);
    const ev = await env.bus.executeCommand('grid.create', { id, lines });
    expect(env.grid.get(id)?.lines.length).toBe(5);
    undoLast(env.grid, ev);
    expect(snap(env.grid)).toEqual(before);
  });

  it('rejects duplicate line ids', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('grid.create', {
        lines: [
          { id: 'x-1', label: '1', kind: 'linear',
            start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 0, z: 5 } },
          { id: 'x-1', label: '1', kind: 'linear',
            start: { x: 5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 5 } },
        ],
      }),
    ).rejects.toThrow();
  });

  it('rejects arc without radius', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('grid.create', {
        lines: [
          { id: 'a-1', label: 'A', kind: 'arc',
            start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } },
        ],
      }),
    ).rejects.toThrow();
  });

  it('setSpacing regenerates lines from spec', async () => {
    env = buildEnv();
    const id = createId('grid');
    await env.bus.executeCommand('grid.create', { id });
    await env.bus.executeCommand('grid.setSpacing', {
      gridId: id, spacingX: 6, spacingZ: 6, countX: 4, countZ: 3, extent: 18,
    });
    expect(env.grid.get(id)?.lines.length).toBe(7);
  });

  it('setSpacing rejects non-positive spacing', async () => {
    env = buildEnv();
    const id = createId('grid');
    await env.bus.executeCommand('grid.create', { id });
    await expect(
      env.bus.executeCommand('grid.setSpacing', {
        gridId: id, spacingX: 0, spacingZ: 6, countX: 4, countZ: 3, extent: 18,
      }),
    ).rejects.toThrow();
  });

  it('setExtent rescales linear line lengths', async () => {
    env = buildEnv();
    const id = createId('grid');
    const lines = generateRectGridLines({
      spacingX: 5, spacingZ: 5, countX: 2, countZ: 2, extent: 10,
    });
    await env.bus.executeCommand('grid.create', { id, lines });
    await env.bus.executeCommand('grid.setExtent', { gridId: id, extent: 20 });
    const ln = env.grid.get(id)!.lines[0]!;
    const len = Math.hypot(ln.end.x - ln.start.x, ln.end.y - ln.start.y, ln.end.z - ln.start.z);
    expect(len).toBeCloseTo(20, 6);
  });
});
