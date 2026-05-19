// WallCreationTool tests (S09-T3 — 5 cases).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09-T3 (line 694).
//
// Vanilla-TS tool — no DOM, no THREE.  Tests use a stub CommandBus
// that captures the dispatched payloads, plus a deterministic
// screen-to-world that maps `clientX/clientY` to world `x/z`.
//
// What we cover:
//   1. strict-injection: missing commandBus throws (mirrors WallTool.ts:144).
//   2. state machine: IDLE → AWAITING_END → IDLE on two clicks.
//   3. dispatch: second click executes `wall.create` with both endpoints.
//   4. cancel: Escape resets state without dispatching.
//   5. Tab calls the snap-cycle hook when supplied.

import { describe, expect, it } from 'vitest';
import {
  WallCreationTool,
  type ScreenToWorld,
} from '../src/tool.js';

interface CapturedCommand {
  type: string;
  payload: unknown;
}

function makeBus(captured: CapturedCommand[]): {
  executeCommand(type: string, payload: unknown): Promise<unknown>;
} {
  return {
    async executeCommand(type: string, payload: unknown): Promise<unknown> {
      captured.push({ type, payload });
      return { ok: true };
    },
  };
}

const screenToWorld: ScreenToWorld = (ev) => ({
  x: ev.clientX,
  y: 0,
  z: ev.clientY,
});

describe('WallCreationTool (S09-T3)', () => {
  it('throws on construction when commandBus is missing (strict-injection)', () => {
    expect(
      () =>
        new WallCreationTool({
          // intentionally omitting commandBus
          screenToWorld,
        } as unknown as ConstructorParameters<typeof WallCreationTool>[0]),
    ).toThrow(/strict-injection.*commandBus/);
  });

  it('throws on construction when screenToWorld is missing (strict-injection)', () => {
    const captured: CapturedCommand[] = [];
    const bus = makeBus(captured);
    expect(
      () =>
        new WallCreationTool({
          commandBus: bus as never,
        } as unknown as ConstructorParameters<typeof WallCreationTool>[0]),
    ).toThrow(/strict-injection.*screenToWorld/);
  });

  it('drives IDLE → AWAITING_END → IDLE on two pointer-down events', () => {
    const captured: CapturedCommand[] = [];
    const tool = new WallCreationTool({
      commandBus: makeBus(captured) as never,
      screenToWorld,
    });
    expect(tool.getState()).toBe('IDLE');
    tool.onPointerDown({ clientX: 1, clientY: 2, pointerId: 1 });
    expect(tool.getState()).toBe('AWAITING_END');
    expect(tool.getStartPoint()).toEqual({ x: 1, y: 0, z: 2 });
    tool.onPointerDown({ clientX: 5, clientY: 8, pointerId: 1 });
    expect(tool.getState()).toBe('IDLE');
    expect(tool.getStartPoint()).toBeNull();
  });

  it('dispatches `wall.create` with both endpoints on the second click', async () => {
    const captured: CapturedCommand[] = [];
    const tool = new WallCreationTool({
      commandBus: makeBus(captured) as never,
      screenToWorld,
      levelId: 'level_test',
    });
    tool.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1 });
    tool.onPointerDown({ clientX: 6, clientY: 0, pointerId: 1 });

    // dispatch is async — let microtasks settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(captured.length).toBe(1);
    expect(captured[0].type).toBe('wall.create');
    const payload = captured[0].payload as {
      levelId: string;
      baseLine: ReadonlyArray<{ x: number; y: number; z: number }>;
    };
    expect(payload.levelId).toBe('level_test');
    expect(payload.baseLine).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 6, y: 0, z: 0 },
    ]);
  });

  it('Escape cancels AWAITING_END without dispatching', async () => {
    const captured: CapturedCommand[] = [];
    const tool = new WallCreationTool({
      commandBus: makeBus(captured) as never,
      screenToWorld,
    });
    tool.onPointerDown({ clientX: 0, clientY: 0, pointerId: 1 });
    expect(tool.getState()).toBe('AWAITING_END');
    tool.onKeyDown({ key: 'Escape' });
    expect(tool.getState()).toBe('IDLE');
    await Promise.resolve();
    expect(captured.length).toBe(0);
  });

  it('Tab invokes the snap-cycle hook when supplied (no-op when absent)', () => {
    const captured: CapturedCommand[] = [];
    let cycles = 0;
    const tool = new WallCreationTool({
      commandBus: makeBus(captured) as never,
      screenToWorld,
      snapCycle: () => {
        cycles += 1;
      },
    });
    tool.onKeyDown({ key: 'Tab' });
    tool.onKeyDown({ key: 'Tab' });
    expect(cycles).toBe(2);

    // No snapCycle hook → no-op (no throw).
    const tool2 = new WallCreationTool({
      commandBus: makeBus(captured) as never,
      screenToWorld,
    });
    expect(() => tool2.onKeyDown({ key: 'Tab' })).not.toThrow();
  });
});
