import { describe, expect, it } from 'vitest';
import { ViewSyncBus, type SyncEvent } from '../src/view-sync.js';

describe('ViewSyncBus', () => {
  it('a view does NOT receive its own published events', () => {
    const bus = new ViewSyncBus();
    let received = 0;
    bus.subscribe('view-A', ['selection'], () => { received++; });
    bus.publish({ topic: 'selection', sourceViewId: 'view-A', payload: { ids: ['x'] } });
    expect(received).toBe(0);
  });

  it('routes events to subscribers of matching topic on other views', () => {
    const bus = new ViewSyncBus();
    let received = 0;
    bus.subscribe('view-B', ['selection'], () => { received++; });
    bus.subscribe('view-C', ['viewport'], () => { received++; });
    bus.publish({ topic: 'selection', sourceViewId: 'view-A', payload: null });
    expect(received).toBe(1);
  });

  it('disposer removes the listener', () => {
    const bus = new ViewSyncBus();
    let received = 0;
    const off = bus.subscribe('view-B', ['selection'], () => { received++; });
    bus.publish({ topic: 'selection', sourceViewId: 'view-A', payload: null });
    off();
    bus.publish({ topic: 'selection', sourceViewId: 'view-A', payload: null });
    expect(received).toBe(1);
  });

  it('listener errors do not crash other listeners', () => {
    const bus = new ViewSyncBus();
    let received = 0;
    bus.subscribe('view-B', ['selection'], () => { throw new Error('boom'); });
    bus.subscribe('view-C', ['selection'], () => { received++; });
    bus.publish({ topic: 'selection', sourceViewId: 'view-A', payload: null });
    expect(received).toBe(1);
  });

  it('re-entrant publish is safe (events queue + drain)', () => {
    const bus = new ViewSyncBus();
    const seen: SyncEvent[] = [];
    bus.subscribe('view-B', ['selection'], (ev) => {
      seen.push(ev);
      if (seen.length === 1) {
        bus.publish({ topic: 'selection', sourceViewId: 'view-D', payload: 're-entry' });
      }
    });
    bus.publish({ topic: 'selection', sourceViewId: 'view-A', payload: 'first' });
    expect(seen).toHaveLength(2);
    expect(seen[0]?.payload).toBe('first');
    expect(seen[1]?.payload).toBe('re-entry');
  });
});
