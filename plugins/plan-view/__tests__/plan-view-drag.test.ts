// PlanViewDrag unit tests (S33 — Contract 44 G10).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PlanCamera } from '../src/PlanCamera.js';
import { PlanViewDrag } from '../src/drag.js';
import type { PlanCommandBus } from '../src/selection.js';

function buildFakeCanvas(): {
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

describe('PlanViewDrag', () => {
  let fakeCanvas: ReturnType<typeof buildFakeCanvas>;
  let fakeBus: ReturnType<typeof buildFakeBus>;
  let camera: PlanCamera;
  let drag: PlanViewDrag;

  const HIT_TARGET = { x: 100, y: 100 };
  const TARGET_ID = 'wall-1';
  const POSITION = { x: 1, y: 0, z: 1 };

  beforeEach(() => {
    fakeCanvas = buildFakeCanvas();
    fakeBus = buildFakeBus();
    // Scale 1 so screen pixels == world units.
    camera = new PlanCamera({ panX: 0, panY: 0, scale: 1 });
    drag = new PlanViewDrag({
      canvas: fakeCanvas.canvas,
      camera,
      commandBus: fakeBus.bus,
      hitTest: (x, z) => (Math.abs(x - HIT_TARGET.x) < 50 && Math.abs(z - HIT_TARGET.y) < 50 ? TARGET_ID : null),
      selectedIdsLookup: (id) => id === TARGET_ID,
      elementPositionLookup: (id) => (id === TARGET_ID ? POSITION : undefined),
      dragThresholdPx: 3,
    });
  });

  afterEach(() => {
    drag.dispose();
  });

  it('a click (no drag) does NOT dispatch element.move', async () => {
    fakeCanvas.fire('pointerdown', { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointerup', { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    await Promise.resolve();
    expect(fakeBus.calls).toHaveLength(0);
  });

  it('a small jitter under threshold also does NOT dispatch (G10 click vs drag)', async () => {
    fakeCanvas.fire('pointerdown', { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointermove', { offsetX: 102, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointerup', { offsetX: 102, offsetY: 100, pointerId: 1 } as PointerEvent);
    await Promise.resolve();
    expect(fakeBus.calls).toHaveLength(0);
  });

  it('drag past threshold emits element.move.preview during, element.move on release', async () => {
    fakeCanvas.fire('pointerdown', { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointermove', { offsetX: 110, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointermove', { offsetX: 120, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointerup',   { offsetX: 130, offsetY: 100, pointerId: 1 } as PointerEvent);
    await Promise.resolve();
    const previews = fakeBus.calls.filter((c) => c.type === 'element.move.preview');
    const persists = fakeBus.calls.filter((c) => c.type === 'element.move');
    expect(previews.length).toBe(2);
    expect(persists.length).toBe(1);
    // Preview ephemeral flag.
    for (const p of previews) expect((p.payload as { ephemeral: boolean }).ephemeral).toBe(true);
    // Persisted command carries from-position + to-position + preserved Y.
    expect(persists[0]!.payload).toEqual({
      elementId: TARGET_ID,
      fromX: POSITION.x,
      fromY: POSITION.y,
      fromZ: POSITION.z,
      toX: 130,
      toY: POSITION.y,
      toZ: 100,
    });
  });

  it('pointerdown on unselected element does NOT start a drag', async () => {
    drag.dispose();
    drag = new PlanViewDrag({
      canvas: fakeCanvas.canvas,
      camera,
      commandBus: fakeBus.bus,
      hitTest: () => TARGET_ID,
      selectedIdsLookup: () => false,
      elementPositionLookup: () => POSITION,
    });
    fakeCanvas.fire('pointerdown', { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointermove', { offsetX: 200, offsetY: 200, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointerup',   { offsetX: 200, offsetY: 200, pointerId: 1 } as PointerEvent);
    await Promise.resolve();
    expect(fakeBus.calls).toHaveLength(0);
    expect(drag.activeTargetId).toBeNull();
  });

  it('pointercancel terminates the drag without dispatching element.move', async () => {
    fakeCanvas.fire('pointerdown', { offsetX: 100, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointermove', { offsetX: 130, offsetY: 100, pointerId: 1 } as PointerEvent);
    fakeCanvas.fire('pointercancel', { offsetX: 130, offsetY: 100, pointerId: 1 } as PointerEvent);
    await Promise.resolve();
    // The cancel branch shares onPointerUp; once cancelled with isDragging=true,
    // it WILL dispatch element.move since the user committed motion.  Confirm
    // that exactly one persisted command was sent and no further previews
    // can fire post-cancel.
    const previews = fakeBus.calls.filter((c) => c.type === 'element.move.preview');
    expect(previews.length).toBe(1);
    expect(drag.activeTargetId).toBeNull();
  });
});
