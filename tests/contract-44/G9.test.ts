// Contract 44 — G9: selection in plan view MUST update the SelectionStore via the CommandBus.
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 lines 630, 680–727.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PlanCamera,
  PlanViewSelection,
  type PlanCommandBus,
} from '@pryzm/plugin-plan-view';

interface BusCall { type: string; payload: unknown }

function fakeCanvas(): {
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
      for (const fn of listeners.get(type) ?? []) fn(ev as Event);
    },
  };
}

describe('Contract 44 — G9: plan-view selection drives SelectionStore', () => {
  let canvas: ReturnType<typeof fakeCanvas>;
  let calls: BusCall[];
  let sel: PlanViewSelection;

  beforeEach(() => {
    canvas = fakeCanvas();
    calls = [];
    const bus: PlanCommandBus = {
      executeCommand: async (type, payload) => { calls.push({ type, payload }); return null; },
    };
    sel = new PlanViewSelection({
      canvas: canvas.canvas,
      camera: new PlanCamera({ panX: 0, panY: 0, scale: 1 }),
      scheduler: { requestFrame: () => {} },
      commandBus: bus,
      hitTest: (x, z) => (Math.abs(x - 5) < 0.5 && Math.abs(z - 5) < 0.5 ? 'wall-XYZ' : null),
      elementKindLookup: (id) => (id === 'wall-XYZ' ? 'wall' : undefined),
    });
  });

  afterEach(() => sel.dispose());

  it('click on wall dispatches selection.select with mode=replace', async () => {
    canvas.fire('click', { offsetX: 5, offsetY: 5, shiftKey: false } as MouseEvent);
    await Promise.resolve();
    expect(calls).toEqual([
      {
        type: 'selection.select',
        payload: { targets: [{ id: 'wall-XYZ', kind: 'wall' }], mode: 'replace' },
      },
    ]);
  });

  it('shift-click switches mode to add (multi-select)', async () => {
    canvas.fire('click', { offsetX: 5, offsetY: 5, shiftKey: true } as MouseEvent);
    await Promise.resolve();
    expect(calls[0]!.payload).toMatchObject({ mode: 'add' });
  });

  it('click on empty space dispatches selection.clear', async () => {
    canvas.fire('click', { offsetX: 100, offsetY: 100 } as MouseEvent);
    await Promise.resolve();
    expect(calls).toEqual([{ type: 'selection.clear', payload: {} }]);
  });
});
