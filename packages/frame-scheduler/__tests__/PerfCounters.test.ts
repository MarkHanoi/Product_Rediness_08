// §PRYZM-PERF — PerfCounters unit suite.
//
// The properties pinned here are the ones that make the instrument TRUSTWORTHY
// rather than merely present:
//
//   • OFF BY DEFAULT — a production frame must not accumulate anything.
//   • "NOT ARMED" ≠ "ZERO" — the single most dangerous failure mode is a founder
//     running a gesture unarmed, seeing `traverse.total = 0`, and concluding no
//     traversals happened. `armedForMs === null` is what lets the reporter say
//     "unmeasured" instead of printing a lie shaped like a measurement.
//   • max is carried alongside sum — a freeze is a TAIL problem and a mean hides it.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isPerfOn,
  armPerf,
  disarmPerf,
  bumpPerf,
  addPerfTime,
  notePerf,
  timePerf,
  perfSnapshot,
  resetPerfCounters,
  _resetPerfForTest,
} from '../src/PerfCounters.js';

beforeEach(() => {
  _resetPerfForTest();
});

describe('PerfCounters — off by default', () => {
  it('is off with no flag set', () => {
    expect(isPerfOn()).toBe(false);
  });

  it('accumulates NOTHING while disarmed', () => {
    bumpPerf('a');
    bumpPerf('a');
    addPerfTime('t', 100);
    notePerf('n', 'x');
    const s = perfSnapshot();
    expect(s.counters).toEqual({});
    expect(s.timers).toEqual({});
    expect(s.notes).toEqual({});
  });

  it('timePerf still RUNS the function when disarmed, and records no sample', () => {
    let ran = false;
    const out = timePerf('phase', () => {
      ran = true;
      return 42;
    });
    expect(ran).toBe(true);
    expect(out).toBe(42);
    expect(perfSnapshot().timers).toEqual({});
  });
});

describe('PerfCounters — "not armed" is distinguishable from "zero"', () => {
  it('reports armedForMs === null when never armed', () => {
    // This is THE guard against the reporter printing a row of noughts that reads
    // as evidence. A null here means the reporter must say "unmeasured".
    expect(perfSnapshot().armedForMs).toBeNull();
  });

  it('reports a non-null armedForMs once armed, even with zero activity', () => {
    armPerf();
    const s = perfSnapshot();
    expect(s.armedForMs).not.toBeNull();
    expect(s.on).toBe(true);
    // Armed and genuinely idle: counters empty, but the window is real.
    expect(s.counters).toEqual({});
  });

  it('stamps the arm time when the raw global is set by hand', () => {
    (globalThis as unknown as { __pryzmPerf?: boolean }).__pryzmPerf = true;
    expect(isPerfOn()).toBe(true);
    expect(perfSnapshot().armedForMs).not.toBeNull();
  });

  it('RETAINS counters after disarm so a report still works', () => {
    armPerf();
    bumpPerf('a', 3);
    disarmPerf();
    const s = perfSnapshot();
    expect(s.on).toBe(false);
    expect(s.counters.a).toBe(3);
  });
});

describe('PerfCounters — accumulation', () => {
  beforeEach(() => armPerf());

  it('sums counters', () => {
    bumpPerf('a');
    bumpPerf('a', 4);
    bumpPerf('b');
    const c = perfSnapshot().counters;
    expect(c.a).toBe(5);
    expect(c.b).toBe(1);
  });

  it('carries sum, count AND max for timers', () => {
    addPerfTime('t', 1);
    addPerfTime('t', 50);
    addPerfTime('t', 2);
    const t = perfSnapshot().timers.t;
    expect(t.count).toBe(3);
    expect(t.totalMs).toBe(53);
    // The tail is the point: mean is 17.7, but one sample cost 50.
    expect(t.maxMs).toBe(50);
  });

  it('notes are last-write-wins, not accumulated', () => {
    notePerf('mode', 'a');
    notePerf('mode', 'b');
    expect(perfSnapshot().notes.mode).toBe('b');
  });

  it('timePerf records a sample and returns the value', () => {
    const out = timePerf('phase', () => 7);
    expect(out).toBe(7);
    expect(perfSnapshot().timers.phase.count).toBe(1);
  });

  it('timePerf records a sample even when the function THROWS', () => {
    // A phase that fails is still a phase that cost time — and a batch that dies
    // mid-flight is exactly the case under investigation.
    expect(() => timePerf('phase', () => { throw new Error('boom'); })).toThrow('boom');
    expect(perfSnapshot().timers.phase.count).toBe(1);
  });

  it('snapshot is a COPY — mutating it cannot corrupt the accumulators', () => {
    bumpPerf('a');
    const s = perfSnapshot();
    s.counters.a = 999;
    s.timers.x = { totalMs: 1, count: 1, maxMs: 1 };
    expect(perfSnapshot().counters.a).toBe(1);
    expect(perfSnapshot().timers.x).toBeUndefined();
  });
});

describe('PerfCounters — reset between gestures', () => {
  it('zeroes everything but STAYS armed, re-stamping the window', () => {
    armPerf();
    bumpPerf('a', 9);
    addPerfTime('t', 5);
    resetPerfCounters();
    const s = perfSnapshot();
    expect(s.counters).toEqual({});
    expect(s.timers).toEqual({});
    expect(s.on).toBe(true);
    // Still armed ⇒ the next gesture is measured, and the window starts now.
    expect(s.armedForMs).not.toBeNull();
  });

  it('reset while DISARMED clears the arm stamp back to null', () => {
    armPerf();
    bumpPerf('a');
    disarmPerf();
    resetPerfCounters();
    expect(perfSnapshot().armedForMs).toBeNull();
  });
});
