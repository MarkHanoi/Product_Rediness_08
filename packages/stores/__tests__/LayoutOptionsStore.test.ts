// LayoutOptionsStore — tests (SPEC-APARTMENT-LAYOUT-GENERATOR §13, A5).

import { describe, expect, it, vi } from 'vitest';
import { LayoutOptionsStore } from '../src/LayoutOptionsStore.js';
import type { ScoredLayoutOption } from '@pryzm/ai-host/types';

function opt(summary: string, overall = 80): ScoredLayoutOption {
  return {
    summary, rooms: [], walls: [], doors: [], corridorWidthMin: 1000,
    score: { overall, breakdown: { naturalLight: 0.8, privacy: 0.8, kitchenWorkflow: 0.8, corridorEfficiency: 0.8 } },
  };
}

describe('LayoutOptionsStore — pending run', () => {
  it('starts empty', () => {
    const s = new LayoutOptionsStore();
    expect(s.current()).toBeNull();
    expect(s.currentRunId()).toBeNull();
    expect(s.options()).toEqual([]);
    expect(s.count()).toBe(0);
    expect(s.optionAt(0)).toBeNull();
    expect(s.storeKey).toBe('aiLayoutOptions');
  });

  it('setLayouts stores the run + options, keyed by runId', () => {
    const s = new LayoutOptionsStore();
    s.setLayouts('run-1', [opt('A', 90), opt('B', 70)]);
    expect(s.currentRunId()).toBe('run-1');
    expect(s.count()).toBe(2);
    expect(s.optionAt(0)!.summary).toBe('A');
    expect(s.optionAt(1)!.summary).toBe('B');
    expect(s.optionAt(2)).toBeNull();      // bounds-checked
    expect(s.optionAt(-1)).toBeNull();
  });

  it('a new run supersedes the prior (only the latest is pending)', () => {
    const s = new LayoutOptionsStore();
    s.setLayouts('run-1', [opt('A')]);
    s.setLayouts('run-2', [opt('X'), opt('Y')]);
    expect(s.currentRunId()).toBe('run-2');
    expect(s.count()).toBe(2);
    expect(s.optionAt(0)!.summary).toBe('X');
  });

  it('freezes stored options (defensive copy)', () => {
    const s = new LayoutOptionsStore();
    const src = [opt('A')];
    s.setLayouts('run-1', src);
    src.push(opt('B'));                     // mutating the source must not leak in
    expect(s.count()).toBe(1);
    expect(Object.isFrozen(s.options())).toBe(true);
  });

  it('clear empties the run (idempotent)', () => {
    const s = new LayoutOptionsStore();
    s.setLayouts('run-1', [opt('A')]);
    s.clear();
    expect(s.current()).toBeNull();
    expect(s.count()).toBe(0);
    expect(() => s.clear()).not.toThrow();  // idempotent on empty
  });

  it('notifies subscribers on set + clear, and stops after dispose', () => {
    const s = new LayoutOptionsStore();
    const listener = vi.fn();
    const dispose = s.subscribe(listener);
    s.setLayouts('run-1', [opt('A')]);
    s.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    dispose();
    s.setLayouts('run-2', [opt('B')]);
    expect(listener).toHaveBeenCalledTimes(2);  // no further calls after dispose
  });

  it('clear on an already-empty store does NOT notify', () => {
    const s = new LayoutOptionsStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('a throwing subscriber does not break notification of others', () => {
    const s = new LayoutOptionsStore();
    const good = vi.fn();
    s.subscribe(() => { throw new Error('boom'); });
    s.subscribe(good);
    expect(() => s.setLayouts('run-1', [opt('A')])).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });
});
