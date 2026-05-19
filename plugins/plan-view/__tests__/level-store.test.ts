// LevelStore unit tests (S29 / ADR-0028).

import { describe, expect, it } from 'vitest';
import { LevelStore } from '../src/LevelStore.js';

describe('LevelStore', () => {
  it('is marked ephemeral', () => {
    expect(LevelStore.ephemeral).toBe(true);
  });

  it('first added level becomes active automatically', () => {
    const s = new LevelStore();
    s.addLevel({ id: 'L1', name: 'Ground', elevation: 0 });
    expect(s.getActiveLevel()?.id).toBe('L1');
  });

  it('second added level does NOT auto-activate', () => {
    const s = new LevelStore();
    s.addLevel({ id: 'L1', name: 'Ground', elevation: 0 });
    s.addLevel({ id: 'L2', name: 'First', elevation: 3 });
    expect(s.getActiveLevel()?.id).toBe('L1');
    expect(s.list()).toHaveLength(2);
  });

  it('setActive switches the active flag exclusively', () => {
    const s = new LevelStore();
    s.addLevel({ id: 'L1', name: 'Ground', elevation: 0 });
    s.addLevel({ id: 'L2', name: 'First', elevation: 3 });
    s.setActive('L2');
    expect(s.getActiveLevel()?.id).toBe('L2');
    expect(s.getState().get('L1')!.isActive).toBe(false);
    expect(s.getState().get('L2')!.isActive).toBe(true);
  });

  it('setActive on the already-active level emits no patches', () => {
    const s = new LevelStore();
    s.addLevel({ id: 'L1', name: 'Ground', elevation: 0 });
    let dirtyCalls = 0;
    s.subscribeDirty(() => { dirtyCalls++; });
    s.setActive('L1');
    expect(dirtyCalls).toBe(0);
  });

  it('setActive on an unknown id throws', () => {
    const s = new LevelStore();
    expect(() => s.setActive('phantom')).toThrow();
  });

  it('list is sorted by elevation ascending', () => {
    const s = new LevelStore();
    s.addLevel({ id: 'L2', name: 'First', elevation: 3 });
    s.addLevel({ id: 'L0', name: 'Basement', elevation: -3 });
    s.addLevel({ id: 'L1', name: 'Ground', elevation: 0 });
    expect(s.list().map((l) => l.id)).toEqual(['L0', 'L1', 'L2']);
  });

  it('subscribeDirty fires on addLevel and setActive', () => {
    const s = new LevelStore();
    let dirtyCalls = 0;
    s.subscribeDirty(() => { dirtyCalls++; });
    s.addLevel({ id: 'L1', name: 'Ground', elevation: 0 });
    s.addLevel({ id: 'L2', name: 'First', elevation: 3 });
    s.setActive('L2');
    expect(dirtyCalls).toBeGreaterThanOrEqual(3);
  });
});
