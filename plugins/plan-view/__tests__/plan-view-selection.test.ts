// PlanViewSelection unit tests (S33 — Contract 44 G9).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanCamera } from '../src/PlanCamera.js';
import { PlanViewSelection, type PlanCommandBus } from '../src/selection.js';
import type { PlanFrameScheduler } from '../src/drag.js';

// Minimal fake canvas — supports only addEventListener / removeEventListener.
function buildFakeCanvas(): {
  canvas: HTMLCanvasElement;
  fire: (type: string, e: Partial<MouseEvent>) => void;
} {
  const listeners = new Map<string, Set<EventListener>>();
  const canvas: Partial<HTMLCanvasElement> = {
    addEventListener: ((type: string, fn: EventListener) => {
      let s = listeners.get(type);
      if (!s) { s = new Set(); listeners.set(type, s); }
      s.add(fn);
    }) as HTMLCanvasElement['addEventListener'],
    removeEventListener: ((type: string, fn: EventListener) => {
      listeners.get(type)?.delete(fn);
    }) as HTMLCanvasElement['removeEventListener'],
  };
  return {
    canvas: canvas as HTMLCanvasElement,
    fire: (type, ev) => {
      const s = listeners.get(type);
      if (!s) return;
      for (const fn of s) fn(ev as Event);
    },
  };
}

interface BusCall { type: string; payload: unknown }

function buildFakeBus(): { bus: PlanCommandBus; calls: BusCall[] } {
  const calls: BusCall[] = [];
  return {
    calls,
    bus: {
      executeCommand: async (type, payload) => {
        calls.push({ type, payload });
        return { ok: true };
      },
    },
  };
}

function buildFakeScheduler(): { sched: PlanFrameScheduler; reasons: string[] } {
  const reasons: string[] = [];
  return {
    reasons,
    sched: { requestFrame: (r) => reasons.push(r) },
  };
}

describe('PlanViewSelection', () => {
  let fakeCanvas: ReturnType<typeof buildFakeCanvas>;
  let fakeBus: ReturnType<typeof buildFakeBus>;
  let fakeSched: ReturnType<typeof buildFakeScheduler>;
  let camera: PlanCamera;
  let sel: PlanViewSelection;

  beforeEach(() => {
    fakeCanvas = buildFakeCanvas();
    fakeBus = buildFakeBus();
    fakeSched = buildFakeScheduler();
    camera = new PlanCamera({ panX: 0, panY: 0, scale: 1 });
    sel = new PlanViewSelection({
      canvas: fakeCanvas.canvas,
      camera,
      scheduler: fakeSched.sched,
      commandBus: fakeBus.bus,
      hitTest: (x, z) => (Math.abs(x - 5) < 0.5 && Math.abs(z - 5) < 0.5 ? 'wall-1' : null),
      elementKindLookup: (id) => (id === 'wall-1' ? 'wall' : undefined),
    });
  });

  afterEach(() => {
    sel.dispose();
  });

  it('click on element dispatches selection.select with mode=replace', async () => {
    fakeCanvas.fire('click', { offsetX: 5, offsetY: 5, shiftKey: false } as MouseEvent);
    await Promise.resolve();
    expect(fakeBus.calls).toHaveLength(1);
    expect(fakeBus.calls[0]!.type).toBe('selection.select');
    expect(fakeBus.calls[0]!.payload).toEqual({
      targets: [{ id: 'wall-1', kind: 'wall' }],
      mode: 'replace',
    });
  });

  it('shift-click switches mode to add (G9)', async () => {
    fakeCanvas.fire('click', { offsetX: 5, offsetY: 5, shiftKey: true } as MouseEvent);
    await Promise.resolve();
    expect(fakeBus.calls[0]!.payload).toMatchObject({ mode: 'add' });
  });

  it('click on empty world dispatches selection.clear', async () => {
    fakeCanvas.fire('click', { offsetX: 100, offsetY: 100, shiftKey: false } as MouseEvent);
    await Promise.resolve();
    expect(fakeBus.calls[0]!.type).toBe('selection.clear');
    expect(fakeBus.calls[0]!.payload).toEqual({});
  });

  it('hover change requests a frame; same hover does NOT', () => {
    fakeCanvas.fire('pointermove', { offsetX: 5, offsetY: 5 } as MouseEvent);
    expect(fakeSched.reasons).toEqual(['plan-hover-change']);
    fakeCanvas.fire('pointermove', { offsetX: 5, offsetY: 5 } as MouseEvent);
    expect(fakeSched.reasons).toHaveLength(1);
    fakeCanvas.fire('pointermove', { offsetX: 100, offsetY: 100 } as MouseEvent);
    expect(fakeSched.reasons).toHaveLength(2);
  });

  it('click on element with unknown kind drops silently (no command)', async () => {
    sel.dispose();
    sel = new PlanViewSelection({
      canvas: fakeCanvas.canvas,
      camera,
      scheduler: fakeSched.sched,
      commandBus: fakeBus.bus,
      hitTest: () => 'mystery-id',
      elementKindLookup: () => undefined,
    });
    fakeCanvas.fire('click', { offsetX: 5, offsetY: 5, shiftKey: false } as MouseEvent);
    await Promise.resolve();
    expect(fakeBus.calls).toHaveLength(0);
  });

  it('dispose removes listeners', () => {
    sel.dispose();
    fakeCanvas.fire('click', { offsetX: 5, offsetY: 5, shiftKey: false } as MouseEvent);
    expect(fakeBus.calls).toHaveLength(0);
  });

  it('async dispatch error funnels to onError', async () => {
    const onError = vi.fn();
    const failingBus: PlanCommandBus = {
      executeCommand: async () => { throw new Error('boom'); },
    };
    sel.dispose();
    sel = new PlanViewSelection({
      canvas: fakeCanvas.canvas,
      camera,
      scheduler: fakeSched.sched,
      commandBus: failingBus,
      hitTest: () => 'wall-1',
      elementKindLookup: () => 'wall',
      onError,
    });
    fakeCanvas.fire('click', { offsetX: 5, offsetY: 5 } as MouseEvent);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalled();
  });
});
