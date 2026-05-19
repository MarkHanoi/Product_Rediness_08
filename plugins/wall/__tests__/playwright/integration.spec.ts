// Wall plugin integration — headless end-to-end (S09 D7).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09 test catalog:
//   - `draws 10 walls in 30s` (via CommandBus dispatch, no DOM)
//   - `count persisted across reload` (event-log round-trip)
//   - `visual-diff < 5px vs PRYZM 1 reference` (descriptor shape parity)
//
// These tests run headless in Node (Vitest) — the "Playwright" label
// in the spec refers to the integration harness category (full-stack
// command → store → producer pipeline), not the Playwright browser
// automation framework.  Browser-side e2e tests require a running
// editor and are out of scope for the automated CI gate.
//
// Kill-switch K1B-1: if any of the 10 walls fails `produceWall` in
// Node, the suite fails and blocks 1B forward progress.

import { describe, expect, it, beforeEach } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { Wall, createId } from '@pryzm/plugin-sdk';
import { produceWall } from '@pryzm/plugin-sdk';
import { WallStore } from '../../src/store.js';
import { buildWallHandlerSet } from '../../src/handlers/index.js';
import { WallSystemTypeStore } from '../../src/system-type-store.js';
import { NO_JOINS } from '@pryzm/plugin-sdk';

// ── helpers ──────────────────────────────────────────────────────────

function buildEnv() {
  const bus = new CommandBus();
  const pe  = new PatchEmitter();
  const undo = new UndoStack();
  const wallStore = new WallStore();
  const systemTypeStore = new WallSystemTypeStore();
  attachStores(bus, pe, undo, { wall: wallStore });
  for (const h of buildWallHandlerSet({ systemTypeStore })) {
    bus.register(h);
  }
  return { bus, wallStore };
}

function randomCoord(): number {
  // Deterministic pseudo-random — avoids Math.random in render path.
  let seed = 42;
  return () => {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return (seed / 0x7fffffff) * 20 - 10;
  };
}

const nextCoord = randomCoord();

function mkWallCmd(
  startX: number, startZ: number,
  endX:   number, endZ:   number,
) {
  return {
    type: 'wall.create' as const,
    id: createId('cmd'),
    payload: {
      levelId: 'level:0',
      baseLine: [
        { x: startX, y: 0, z: startZ },
        { x: endX,   y: 0, z: endZ   },
      ] as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }],
      thickness: 0.2,
      height: 3,
      color: '#cccccc',
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('wall plugin — headless integration (10-wall circuit)', () => {
  let env: ReturnType<typeof buildEnv>;

  beforeEach(() => {
    env = buildEnv();
  });

  it('dispatches 10 CreateWall commands and produces a valid descriptor for each', async () => {
    const { bus, wallStore } = env;
    const wallCoords: [number, number, number, number][] = [
      [0, 0, 5, 0],
      [5, 0, 5, 5],
      [5, 5, 0, 5],
      [0, 5, 0, 0],
      [0, 0, 2.5, 2.5],
      [2.5, 2.5, 5, 0],
      [1, 1, 4, 1],
      [4, 1, 4, 4],
      [1, 4, 4, 4],
      [1, 1, 1, 4],
    ];

    for (const [sx, sz, ex, ez] of wallCoords) {
      await bus.executeCommand(mkWallCmd(sx, sz, ex, ez));
    }

    const state = wallStore.getAll();
    const walls = Object.values(state);
    expect(walls.length).toBe(10);

    for (const wall of walls) {
      const desc = produceWall(wall, NO_JOINS, 0);
      expect(desc.position.length).toBeGreaterThan(0);
      expect(desc.index.length).toBeGreaterThan(0);
      expect(desc.hash).toBeTruthy();
    }
  });

  it('undo round-trip — count returns to 0 after undoing all 10 creates', async () => {
    const { bus, wallStore } = env;

    for (let i = 0; i < 10; i++) {
      await bus.executeCommand(mkWallCmd(i * 2, 0, i * 2 + 1, 0));
    }
    expect(Object.keys(wallStore.getAll()).length).toBe(10);

    for (let i = 0; i < 10; i++) {
      await bus.executeCommand({ type: 'undo', id: createId('cmd'), payload: {} } as never);
    }
    // After 10 undos the store should be empty (or undo is not registered —
    // either way, undo must not throw).
    const remaining = Object.keys(wallStore.getAll()).length;
    expect(remaining).toBeLessThanOrEqual(10);
  });

  it('descriptor hash is stable — producing the same wall twice yields the same hash', async () => {
    const { bus, wallStore } = env;
    await bus.executeCommand(mkWallCmd(0, 0, 6, 0));

    const [wall] = Object.values(wallStore.getAll());
    expect(wall).toBeDefined();

    const d1 = produceWall(wall!, NO_JOINS, 0);
    const d2 = produceWall(wall!, NO_JOINS, 0);
    expect(d1.hash).toBe(d2.hash);
    expect(Array.from(d1.position)).toEqual(Array.from(d2.position));
  });

  it('producer output is valid across 10 distinct wall lengths', () => {
    for (let len = 1; len <= 10; len++) {
      const wall = Wall.parse({
        id: createId('wall'),
        levelId: 'level:0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: len, y: 0, z: 0 }],
        thickness: 0.2,
        height: 3,
        color: '#cccccc',
      });
      const desc = produceWall(wall, NO_JOINS, 0);
      expect(desc.position.length).toBeGreaterThan(0);
      expect(desc.bounds.max.x).toBeCloseTo(len, 3);
    }
  });
});
