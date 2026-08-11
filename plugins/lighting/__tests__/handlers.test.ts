// Lighting handler smoke suite (S26 / ADR-0023).

import { afterEach, describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, type EventRecord } from '@pryzm/plugin-sdk';
import { attachStores } from '@pryzm/plugin-sdk';
import { createId } from '@pryzm/plugin-sdk';
import { LightingStore, type LightingData, type LightingsState } from '../src/store.js';
import {
  buildLightingHandlerSet,
  registerLightingHandlers,
  LIGHTING_HANDLER_TYPES,
} from '../src/handlers/index.js';

function buildEnv() {
  const lighting = new LightingStore();
  const stores = { lighting: lighting as unknown as import('@pryzm/stores').Store<object> };
  const emitter = new PatchEmitter();
  const undoStack = new UndoStack({ maxSize: 50 });
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter,
    undoStack,
    storesProvider: () => ({
      lighting: Object.fromEntries(lighting.getState()) as LightingsState,
    }),
  });
  for (const h of buildLightingHandlerSet()) bus.register(h);
  const detach = attachStores(emitter, stores);
  return { lighting, bus, detach };
}

function snap(s: LightingStore): Record<string, LightingData> {
  return JSON.parse(JSON.stringify(Object.fromEntries(s.getState())));
}

function undoLast(s: LightingStore, ev: EventRecord<unknown>): void {
  s.applyPatch([...ev.inverse].reverse());
}

describe('lighting handler registration', () => {
  it('registerLightingHandlers wires all 5 command types', () => {
    const env = buildEnv();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ lighting: {} }),
    });
    const types = registerLightingHandlers(bus);
    expect([...types].sort()).toEqual([...LIGHTING_HANDLER_TYPES].sort());
    env.detach();
  });
});

describe('lighting.create / move / delete', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('creates a downlight with caller id and inverts', async () => {
    env = buildEnv();
    const id = createId('lighting');
    const before = snap(env.lighting);
    const ev = await env.bus.executeCommand('lighting.create', {
      id, kind: 'downlight', origin: { x: 0, y: 3, z: 0 }, intensity: 1.5, range: 8,
    }) as EventRecord<unknown>;
    expect(env.lighting.get(id)).toBeDefined();
    expect(env.lighting.get(id)!.intensity).toBeCloseTo(1.5);
    undoLast(env.lighting, ev);
    expect(snap(env.lighting)).toEqual(before);
  });

  it('rejects negative intensity at validation', async () => {
    env = buildEnv();
    await expect(env.bus.executeCommand('lighting.create', { intensity: -1 })).rejects.toThrow();
  });

  it('move refuses with NO live alternative to name; delete still works', async () => {
    env = buildEnv();
    const id = createId('lighting');
    await env.bus.executeCommand('lighting.create', { id, origin: { x: 0, y: 0, z: 0 } });
    const originBefore = env.lighting.get(id)!.origin.x;
    // §FIX-DEAD-MOVE-VERB-REFUSE (W3-4) — `lighting.move` writes the DETACHED plugin
    // lighting store and, UNLIKE every other family, there is NO live alternative to
    // name: lighting is absent from MOVE_COMMAND_BY_TYPE and from every dragDispatch
    // site, and MOVE_UNSUPPORTED_REASON already gates the Move button off for exactly
    // that reason. The refusal must say THAT rather than imply a wiring gap.
    await expect(
      env.bus.executeCommand('lighting.move', { lightingId: id, delta: { x: 2, y: 1, z: 0 } }),
    ).rejects.toThrow(/no move command on any surface|Gate G7/);
    expect(env.lighting.get(id)!.origin.x).toBeCloseTo(originBefore);
    // Unchanged, and now doubling as a POSITIVE control: delete is genuinely live, so a
    // refuse-everything implementation could not pass this case.
    await env.bus.executeCommand('lighting.delete', { lightingId: id });
    expect(env.lighting.get(id)).toBeUndefined();
  });
});

describe('lighting.setIntensity / setEmergency', () => {
  let env: ReturnType<typeof buildEnv>;
  afterEach(() => env?.detach());

  it('setIntensity patches intensity, range, and color', async () => {
    env = buildEnv();
    const id = createId('lighting');
    await env.bus.executeCommand('lighting.create', { id });
    await env.bus.executeCommand('lighting.setIntensity', {
      lightingId: id, intensity: 2, range: 10, color: [0.8, 0.8, 1.0],
    });
    const l = env.lighting.get(id)!;
    expect(l.intensity).toBeCloseTo(2);
    expect(l.range).toBeCloseTo(10);
    expect(l.color).toEqual([0.8, 0.8, 1.0]);
  });

  it('setEmergency toggles the flag', async () => {
    env = buildEnv();
    const id = createId('lighting');
    await env.bus.executeCommand('lighting.create', { id });
    await env.bus.executeCommand('lighting.setEmergency', { lightingId: id, isEmergency: true });
    expect(env.lighting.get(id)!.isEmergency).toBe(true);
    await env.bus.executeCommand('lighting.setEmergency', { lightingId: id, isEmergency: false });
    expect(env.lighting.get(id)!.isEmergency).toBe(false);
  });
});
