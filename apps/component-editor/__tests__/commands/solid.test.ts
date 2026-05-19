// Solid command tests (S53 D6).
//
// Coverage:
//   • solid.add → returns id, default LOD applied, undo removes it.
//   • solid.remove → undo restores with id + LOD preserved.
//   • solid.setLodBitmask → mutation + undo of every bit pattern.
//   • Each command emits exactly one OTel span via the bus.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCommandBus, type CommandBus } from '../../src/app/commandBus.js';
import {
  clearSpanSinks,
  installSpanSink,
  type SpanRecord,
} from '../../src/app/otel.js';
import {
  ADD_SOLID_VERB,
  REMOVE_SOLID_VERB,
  SET_SOLID_LOD_BITMASK_VERB,
  registerSolidCommands,
  type AddSolidArgs,
  type RemoveSolidArgs,
  type SetSolidLodBitmaskArgs,
} from '../../src/commands/solid/index.js';
import {
  DEFAULT_LOD_BITMASK,
  createSolidStore,
  type SolidId,
  type SolidStore,
} from '../../src/stores/solidStore.js';

let bus: CommandBus;
let store: SolidStore;
let spans: SpanRecord[];
let uninstall: (() => void) | null;

beforeEach(() => {
  bus = createCommandBus();
  store = createSolidStore();
  registerSolidCommands(bus, { store });
  spans = [];
  uninstall = installSpanSink((r) => {
    spans.push(r);
  });
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  clearSpanSinks();
});

describe('solid.add', () => {
  it('adds a solid with the §12.2 default LOD bitmask', async () => {
    const id = await bus.execute<AddSolidArgs, SolidId>(ADD_SOLID_VERB, {
      name: 'Frame',
      kind: 'extrude',
    });
    expect(typeof id).toBe('string');
    const s = store.get().byId[id]!;
    expect(s.lod).toEqual(DEFAULT_LOD_BITMASK);
    expect(s.kind).toBe('extrude');
  });

  it('emits a pryzm.family.command.solid.add span', async () => {
    await bus.execute<AddSolidArgs, SolidId>(ADD_SOLID_VERB, {
      name: 'Frame',
      kind: 'extrude',
    });
    const matched = spans.filter((s) => s.name === `pryzm.family.command.${ADD_SOLID_VERB}`);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.status).toBe('ok');
    expect(matched[0]!.attributes['pryzm.family.command.category']).toBe('solid');
  });

  it('undo removes the solid', async () => {
    const id = await bus.execute<AddSolidArgs, SolidId>(ADD_SOLID_VERB, {
      name: 'Frame',
      kind: 'extrude',
    });
    expect(store.get().solids).toHaveLength(1);
    await bus.undo();
    expect(store.get().solids).toHaveLength(0);
    expect(store.get().byId[id]).toBeUndefined();
  });

  it('respects a caller-supplied LOD bitmask', async () => {
    const id = await bus.execute<AddSolidArgs, SolidId>(ADD_SOLID_VERB, {
      name: 'Trim',
      kind: 'sweep',
      lod: { coarse: true, medium: false, fine: true },
    });
    const s = store.get().byId[id]!;
    expect(s.lod.coarse).toBe(true);
    expect(s.lod.medium).toBe(false);
    expect(s.lod.fine).toBe(true);
  });
});

describe('solid.remove', () => {
  it('removes the solid and undo re-adds with id + LOD preserved', async () => {
    const id = await bus.execute<AddSolidArgs, SolidId>(ADD_SOLID_VERB, {
      name: 'Frame',
      kind: 'extrude',
      lod: { coarse: true, medium: true, fine: false },
    });
    await bus.execute<RemoveSolidArgs, SolidId>(REMOVE_SOLID_VERB, { id });
    expect(store.get().solids).toHaveLength(0);
    await bus.undo();
    const restored = store.get().byId[id]!;
    expect(restored).toBeDefined();
    expect(restored.lod).toEqual({ coarse: true, medium: true, fine: false });
    expect(restored.name).toBe('Frame');
  });

  it('rejects an unknown id', async () => {
    await expect(
      bus.execute<RemoveSolidArgs, SolidId>(REMOVE_SOLID_VERB, {
        id: 's-missing' as SolidId,
      }),
    ).rejects.toThrow(/unknown id/);
  });
});

describe('solid.setLodBitmask', () => {
  it('updates the bitmask and undo restores the original', async () => {
    const id = await bus.execute<AddSolidArgs, SolidId>(ADD_SOLID_VERB, {
      name: 'Frame',
      kind: 'extrude',
    });
    expect(store.get().byId[id]!.lod).toEqual(DEFAULT_LOD_BITMASK);
    await bus.execute<SetSolidLodBitmaskArgs, SolidId>(SET_SOLID_LOD_BITMASK_VERB, {
      id,
      lod: { coarse: true, medium: false, fine: true },
    });
    expect(store.get().byId[id]!.lod).toEqual({ coarse: true, medium: false, fine: true });
    await bus.undo();
    expect(store.get().byId[id]!.lod).toEqual(DEFAULT_LOD_BITMASK);
  });

  it('emits a pryzm.family.command.solid.setLodBitmask span', async () => {
    const id = await bus.execute<AddSolidArgs, SolidId>(ADD_SOLID_VERB, {
      name: 'Frame',
      kind: 'extrude',
    });
    spans.length = 0;
    await bus.execute<SetSolidLodBitmaskArgs, SolidId>(SET_SOLID_LOD_BITMASK_VERB, {
      id,
      lod: { coarse: true, medium: true, fine: true },
    });
    const matched = spans.filter(
      (s) => s.name === `pryzm.family.command.${SET_SOLID_LOD_BITMASK_VERB}`,
    );
    expect(matched).toHaveLength(1);
  });

  it('rejects an unknown id', async () => {
    await expect(
      bus.execute<SetSolidLodBitmaskArgs, SolidId>(SET_SOLID_LOD_BITMASK_VERB, {
        id: 's-missing' as SolidId,
        lod: DEFAULT_LOD_BITMASK,
      }),
    ).rejects.toThrow(/unknown id/);
  });

  it('round-trips every bit pattern correctly', async () => {
    const id = await bus.execute<AddSolidArgs, SolidId>(ADD_SOLID_VERB, {
      name: 'Frame',
      kind: 'extrude',
    });
    const patterns = [
      { coarse: false, medium: false, fine: false },
      { coarse: true,  medium: false, fine: false },
      { coarse: false, medium: true,  fine: false },
      { coarse: false, medium: false, fine: true  },
      { coarse: true,  medium: true,  fine: false },
      { coarse: true,  medium: false, fine: true  },
      { coarse: false, medium: true,  fine: true  },
      { coarse: true,  medium: true,  fine: true  },
    ];
    for (const p of patterns) {
      await bus.execute<SetSolidLodBitmaskArgs, SolidId>(SET_SOLID_LOD_BITMASK_VERB, {
        id,
        lod: p,
      });
      expect(store.get().byId[id]!.lod).toEqual(p);
    }
  });
});
