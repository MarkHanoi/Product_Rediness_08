// Contract 44 — G10: drag in plan view MUST create persisted element.move commands.
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 lines 631, 731–786.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlanCamera, PlanViewDrag, type PlanCommandBus } from '@pryzm/plugin-plan-view';

interface BusCall { type: string; payload: unknown }

function fakeCanvas(): {
  canvas: HTMLCanvasElement;
  fire: (type: string, e: Partial<PointerEvent>) => void;
} {
  const listeners = new Map<string, Set<EventListener>>();
  const captured = new Set<number>();
  const canvas: Partial<HTMLCanvasElement> = {
    addEventListener: ((type: string, fn: EventListener) => {
      let s = listeners.get(type);
      if (!s) { s = new Set(); listeners.set(type, s); }
      s.add(fn);
    }) as HTMLCanvasElement['addEventListener'],
    removeEventListener: ((type: string, fn: EventListener) => {
      listeners.get(type)?.delete(fn);
    }) as HTMLCanvasElement['removeEventListener'],
    setPointerCapture: ((id: number) => { captured.add(id); }) as HTMLCanvasElement['setPointerCapture'],
    releasePointerCapture: ((id: number) => { captured.delete(id); }) as HTMLCanvasElement['releasePointerCapture'],
    hasPointerCapture: ((id: number) => captured.has(id)) as HTMLCanvasElement['hasPointerCapture'],
  };
  return {
    canvas: canvas as HTMLCanvasElement,
    fire: (type, ev) => {
      for (const fn of listeners.get(type) ?? []) fn(ev as Event);
    },
  };
}

describe('Contract 44 — G10: plan-view drag dispatches element.move via the CommandBus', () => {
  let canvas: ReturnType<typeof fakeCanvas>;
  let calls: BusCall[];
  let drag: PlanViewDrag;

  const TARGET = 'wall-1';
  const POSITION = { x: 1.0, y: 0, z: 1.0 };

  beforeEach(() => {
    canvas = fakeCanvas();
    calls = [];
    const bus: PlanCommandBus = {
      executeCommand: async (type, payload) => { calls.push({ type, payload }); return null; },
    };
    drag = new PlanViewDrag({
      canvas: canvas.canvas,
      camera: new PlanCamera({ panX: 0, panY: 0, scale: 1 }),
      commandBus: bus,
      hitTest: () => TARGET,
      selectedIdsLookup: (id) => id === TARGET,
      elementPositionLookup: (id) => (id === TARGET ? POSITION : undefined),
      dragThresholdPx: 3,
    });
  });

  afterEach(() => drag.dispose());

  it('a click (no movement) does NOT dispatch element.move', async () => {
    canvas.fire('pointerdown', { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    canvas.fire('pointerup',   { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    await Promise.resolve();
    expect(calls).toHaveLength(0);
  });

  it('drag past threshold emits ephemeral previews and ONE persisted element.move', async () => {
    canvas.fire('pointerdown', { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    canvas.fire('pointermove', { offsetX: 110, offsetY: 100, pointerId: 1 } as PointerEvent);
    canvas.fire('pointermove', { offsetX: 130, offsetY: 100, pointerId: 1 } as PointerEvent);
    canvas.fire('pointerup',   { offsetX: 150, offsetY: 100, pointerId: 1 } as PointerEvent);
    await Promise.resolve();

    const previews = calls.filter((c) => c.type === 'element.move.preview');
    const persists = calls.filter((c) => c.type === 'element.move');
    expect(previews.length).toBeGreaterThan(0);
    expect(persists.length).toBe(1);

    // Every preview must carry ephemeral=true (handlers MUST NOT push to undo).
    for (const p of previews) {
      expect((p.payload as { ephemeral: boolean }).ephemeral).toBe(true);
    }

    // The persisted command stores both fromXYZ and toXYZ so the handler
    // can build a correct inverse patch (undo restores the original position).
    expect(persists[0]!.payload).toMatchObject({
      elementId: TARGET,
      fromX: POSITION.x,
      fromY: POSITION.y,
      fromZ: POSITION.z,
      toX: 150,
      toZ: 100,
    });
  });
});
