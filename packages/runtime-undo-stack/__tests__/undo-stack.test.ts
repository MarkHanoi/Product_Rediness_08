// @pryzm/runtime-undo-stack — contract tests (Wave 13 zero-test drive).
//
// Covers:
//   1. State snapshot: canUndo/canRedo reflect the backend state correctly.
//   2. Subscribe + notify: subscribers receive state updates on undo/redo.
//   3. Dispose: dispose() clears subscriptions and is idempotent.

import { describe, expect, it, vi } from 'vitest';
import { UndoStack, type UndoStackBackend } from '../src/UndoStack.js';

function makeBackend(initialStack: string[] = ['cmd1', 'cmd2', 'cmd3']): {
  backend: UndoStackBackend;
  notify: () => void;
} {
  let stack = [...initialStack];
  let redoStack: string[] = [];
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const l of listeners) l();
  };

  const backend: UndoStackBackend = {
    undo(): void {
      const cmd = stack.pop();
      if (cmd) { redoStack.push(cmd); notify(); }
    },
    redo(): void {
      const cmd = redoStack.pop();
      if (cmd) { stack.push(cmd); notify(); }
    },
    canUndo(): boolean { return stack.length > 0; },
    canRedo(): boolean { return redoStack.length > 0; },
    undoCount(): number { return stack.length; },
    redoCount(): number { return redoStack.length; },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return { dispose: (): void => { listeners.delete(listener); } };
    },
  };

  return { backend, notify };
}

describe('@pryzm/runtime-undo-stack — state snapshot', () => {
  it('initial state reflects backend undo/redo counts', () => {
    const { backend } = makeBackend(['a', 'b', 'c']);
    const stack = new UndoStack(backend);

    expect(stack.state.canUndo).toBe(true);
    expect(stack.state.canRedo).toBe(false);
    expect(stack.state.undoCount).toBe(3);
    expect(stack.state.redoCount).toBe(0);

    stack.dispose();
  });

  it('undo() moves one command from undo to redo stack', () => {
    const { backend } = makeBackend(['a', 'b']);
    const stack = new UndoStack(backend);

    expect(stack.state.undoCount).toBe(2);
    stack.undo();
    expect(stack.state.undoCount).toBe(1);
    expect(stack.state.canRedo).toBe(true);

    stack.dispose();
  });
});

describe('@pryzm/runtime-undo-stack — subscribe + notify', () => {
  it('subscribe() fires immediately with current state then again on changes', () => {
    const { backend } = makeBackend(['x', 'y']);
    const stack = new UndoStack(backend);

    const received: Array<{ canUndo: boolean }> = [];
    const sub = stack.subscribe((s) => received.push({ canUndo: s.canUndo }));

    // Immediate notification on subscribe.
    expect(received.length).toBe(1);
    expect(received[0]?.canUndo).toBe(true);

    stack.undo();
    expect(received.length).toBe(2);

    sub.dispose();
    stack.dispose();
  });
});

describe('@pryzm/runtime-undo-stack — dispose', () => {
  it('dispose() stops further subscriber notifications and is idempotent', () => {
    const { backend } = makeBackend(['p', 'q']);
    const stack = new UndoStack(backend);

    const spy = vi.fn();
    stack.subscribe(spy);
    spy.mockClear(); // clear the immediate call

    stack.dispose();
    stack.undo(); // Should not fire spy (disposed)
    expect(spy).not.toHaveBeenCalled();

    // Second dispose must not throw.
    expect(() => stack.dispose()).not.toThrow();
  });
});
