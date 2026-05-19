import { describe, expect, it } from 'vitest';
import {
  FrameScheduler,
  isPriority,
  isTickPriority,
  PRIORITIES,
  TICK_PRIORITIES,
} from '../src/index.js';

describe('FrameScheduler — dirty flag set', () => {
  it('mark / clear / isDirty', () => {
    const s = new FrameScheduler();
    expect(s.isDirty()).toBe(false);
    s.markDirty('camera');
    expect(s.isDirty('camera')).toBe(true);
    expect(s.isDirty('walls')).toBe(false);
    expect(s.isDirty()).toBe(true);
    s.clearDirty('camera');
    expect(s.isDirty()).toBe(false);
  });

  it('snapshot returns a sorted, stable array', () => {
    const s = new FrameScheduler();
    s.markDirty('z');
    s.markDirty('a');
    s.markDirty('m');
    expect(s.dirtyFlagsSnapshot()).toEqual(['a', 'm', 'z']);
  });
});

describe('FrameScheduler — priority queue', () => {
  it('drains in priority order regardless of insertion order', () => {
    const s = new FrameScheduler();
    s.requestFrame('bg', 'background');
    s.requestFrame('inter', 'interaction');
    s.requestFrame('idle', 'idle');
    const result = s.drainSync();
    expect(result.drained.map(r => r.priority)).toEqual([
      'interaction',
      'idle',
      'background',
    ]);
    expect(result.remaining).toBe(0);
    expect(s.getPending()).toHaveLength(0);
  });

  it('drainSync(maxLanes) only drains the allowed lanes; others remain', () => {
    const s = new FrameScheduler();
    s.requestFrame('a', 'interaction');
    s.requestFrame('b', 'idle');
    s.requestFrame('c', 'background');
    const result = s.drainSync(['interaction', 'background']);
    expect(result.drained.map(r => r.reason).sort()).toEqual(['a', 'c']);
    expect(result.remaining).toBe(1);
    expect(s.getPending()[0]!.reason).toBe('b');
  });

  it('pendingByPriority counts each lane', () => {
    const s = new FrameScheduler();
    s.requestFrame('a', 'idle');
    s.requestFrame('b', 'idle');
    s.requestFrame('c', 'background');
    expect(s.pendingByPriority()).toEqual({
      interaction: 0,
      idle: 2,
      background: 1,
    });
  });

  it('reset clears everything', () => {
    const s = new FrameScheduler();
    s.markDirty('x');
    s.requestFrame('y', 'idle');
    s.reset();
    expect(s.isDirty()).toBe(false);
    expect(s.getPending()).toHaveLength(0);
  });

  it('uses the injected clock for enqueuedAt', () => {
    let now = 1000;
    const s = new FrameScheduler(() => now);
    s.requestFrame('a', 'idle');
    now = 2000;
    s.requestFrame('b', 'idle');
    const result = s.drainSync();
    expect(result.drained.map(r => r.enqueuedAt)).toEqual([1000, 2000]);
  });
});

describe('FrameScheduler — Priority guard', () => {
  it('isPriority validates the 3-lane enum (interaction | idle | background)', () => {
    expect(PRIORITIES).toEqual(['interaction', 'idle', 'background']);
    for (const p of PRIORITIES) expect(isPriority(p)).toBe(true);
    expect(isPriority('animation')).toBe(false);
    expect(isPriority('low')).toBe(false);
    expect(isPriority(42)).toBe(false);
    expect(isPriority(null)).toBe(false);
  });
});

describe('FrameScheduler — TickPriority enum (S02-T7 / UnifiedFrameLoop.ts:95-98)', () => {
  it('exports the 4 render-phase tick priorities', () => {
    expect(TICK_PRIORITIES).toEqual(['pre-render', 'render', 'post-render', 'overlay']);
    for (const p of TICK_PRIORITIES) expect(isTickPriority(p)).toBe(true);
    expect(isTickPriority('interaction')).toBe(false);
    expect(isTickPriority('idle')).toBe(false);
  });
});
