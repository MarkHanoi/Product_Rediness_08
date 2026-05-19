// MapViewRegistry coverage (S40).

import { describe, it, expect, vi } from 'vitest';
import { MapViewRegistry } from '../src/view-renderer/view-registry.js';

const noop = () => undefined;

describe('MapViewRegistry', () => {
  it('round-trips a registered entry', () => {
    const r = new MapViewRegistry();
    r.set('view-1', { kind: 'plan', source: noop, label: 'L1 Plan' });
    expect(r.get('view-1')?.kind).toBe('plan');
    expect(r.get('view-1')?.label).toBe('L1 Plan');
    expect(r.list()).toEqual(['view-1']);
  });

  it('returns undefined for unknown viewIds', () => {
    const r = new MapViewRegistry();
    expect(r.get('nope')).toBeUndefined();
  });

  it('rejects empty viewId', () => {
    const r = new MapViewRegistry();
    expect(() => r.set('', { kind: 'plan', source: noop })).toThrow();
  });

  it('replacing an entry fires a dirty signal', () => {
    const r = new MapViewRegistry();
    const listener = vi.fn();
    r.subscribe(listener);
    r.set('v1', { kind: 'plan', source: noop });
    r.set('v1', { kind: 'plan', source: noop, label: 'replaced' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith('v1');
  });

  it('remove() fires a dirty signal once and returns undefined thereafter', () => {
    const r = new MapViewRegistry();
    const listener = vi.fn();
    r.set('v1', { kind: 'plan', source: noop });
    r.subscribe(listener);
    r.remove('v1');
    r.remove('v1'); // no-op — no second fire.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(r.get('v1')).toBeUndefined();
  });

  it('markDirty() fires the listener without changing the entry', () => {
    const r = new MapViewRegistry();
    r.set('v1', { kind: 'plan', source: noop });
    const listener = vi.fn();
    r.subscribe(listener);
    r.markDirty('v1');
    expect(listener).toHaveBeenCalledWith('v1');
    expect(r.get('v1')).toBeDefined();
  });

  it('subscribe disposer stops further notifications', () => {
    const r = new MapViewRegistry();
    const listener = vi.fn();
    const dispose = r.subscribe(listener);
    dispose();
    r.set('v1', { kind: 'plan', source: noop });
    expect(listener).not.toHaveBeenCalled();
  });

  it('a throwing listener does not break the dirty fan-out', () => {
    const r = new MapViewRegistry();
    const good = vi.fn();
    r.subscribe(() => { throw new Error('bad'); });
    r.subscribe(good);
    r.set('v1', { kind: 'plan', source: noop });
    expect(good).toHaveBeenCalledWith('v1');
  });
});
