// Beam handler smoke suite (S12-T3).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { BeamStore, type BeamData, type BeamsState } from '../src/store.js';
import {
  buildBeamHandlerSet,
  registerBeamHandlers,
  BEAM_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const beam = new BeamStore();
  const stores = { beam: beam as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({ beam: Object.fromEntries(beam.getState()) as BeamsState }),
  });
  for (const h of buildBeamHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { beam, bus, detach };
}

function snap(s: BeamStore): Record<string, BeamData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}
function undoLast(s: BeamStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

const A = { x: 0, y: 0, z: 0 };
const B = { x: 4, y: 0, z: 0 };

describe('beam handler registration', () => {
  it('registers all 5 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ beam: {} }),
    });
    const types = registerBeamHandlers(bus);
    expect([...types].sort()).toEqual([...BEAM_HANDLER_TYPES].sort());
    env.detach();
  });
});

describe('beam.create / delete / move', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates with caller id and inverts', async () => {
    env = buildEnv();
    const id = createId('beam');
    const before = snap(env.beam);
    const ev = await env.bus.executeCommand('beam.create', { id, baseLine: [A, B] });
    expect(env.beam.size()).toBe(1);
    undoLast(env.beam, ev);
    expect(snap(env.beam)).toEqual(before);
  });

  it('rejects coincident endpoints', async () => {
    env = buildEnv();
    await expect(
      env.bus.executeCommand('beam.create', { baseLine: [A, A] }),
    ).rejects.toThrow();
  });

  it('move translates both endpoints', async () => {
    env = buildEnv();
    const id = createId('beam');
    await env.bus.executeCommand('beam.create', { id, baseLine: [A, B] });
    const before = snap(env.beam);
    const ev = await env.bus.executeCommand('beam.move', {
      beamId: id, delta: { x: 1, y: 0, z: 1 },
    });
    expect(env.beam.get(id)?.baseLine[0]).toEqual({ x: 1, y: 0, z: 1 });
    expect(env.beam.get(id)?.baseLine[1]).toEqual({ x: 5, y: 0, z: 1 });
    undoLast(env.beam, ev);
    expect(snap(env.beam)).toEqual(before);
  });
});

describe('beam.setSection + setType', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('setSection updates shape + dims', async () => {
    env = buildEnv();
    const id = createId('beam');
    await env.bus.executeCommand('beam.create', { id, baseLine: [A, B] });
    await env.bus.executeCommand('beam.setSection', {
      beamId: id, shape: 'i-section', width: 0.3, depth: 0.6,
    });
    const b = env.beam.get(id)!;
    expect(b.shape).toBe('i-section');
    expect(b.width).toBe(0.3);
    expect(b.depth).toBe(0.6);
  });

  it('setSection rejects non-positive dims', async () => {
    env = buildEnv();
    const id = createId('beam');
    await env.bus.executeCommand('beam.create', { id, baseLine: [A, B] });
    await expect(
      env.bus.executeCommand('beam.setSection', { beamId: id, width: 0 }),
    ).rejects.toThrow();
  });

  it('setType records the systemTypeId on materialId', async () => {
    env = buildEnv();
    const id = createId('beam');
    await env.bus.executeCommand('beam.create', { id, baseLine: [A, B] });
    await env.bus.executeCommand('beam.setType', {
      beamId: id, systemTypeId: 'beam.steel.W12x26',
    });
    expect(env.beam.get(id)?.materialId).toBe('beam.steel.W12x26');
  });
});
