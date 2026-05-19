// @pryzm/ai-host — AiBus tests (S49 D8).
//
// Spec source: PHASE-3A §S49 lines 102-135 — independent message bus
// for the AI plane with otelPrefix `'pryzm.ai'`.

import { describe, expect, it, vi } from 'vitest';
import { AiBus, type AiBusEvent } from '../src/AiBus.js';

describe('AiBus — pub/sub primitives', () => {
  it('emits events stamped with the injected clock', () => {
    const bus = new AiBus({ now: () => 1_700_000_000_000 });
    const seen: AiBusEvent[] = [];
    bus.onAny((e) => seen.push(e));

    bus.emit({
      kind: 'workflow.start',
      workflow: 'ai.floorplan.draft',
      projectId: 'P-1',
      runId: 'run-1',
      payload: { ok: true },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.atMs).toBe(1_700_000_000_000);
    expect(seen[0]!.kind).toBe('workflow.start');
  });

  it('dispatches to per-kind listeners only for matching kinds', () => {
    const bus = new AiBus();
    const onStart = vi.fn();
    const onCommit = vi.fn();
    bus.on('workflow.start', onStart);
    bus.on('workflow.commit', onCommit);

    bus.emit({ kind: 'workflow.start', workflow: 'wf', projectId: 'p', runId: 'r', payload: {} });
    bus.emit({ kind: 'workflow.commit', workflow: 'wf', projectId: 'p', runId: 'r', payload: {} });

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('disposer removes listener', () => {
    const bus = new AiBus();
    const fn = vi.fn();
    const off = bus.on('workflow.propose', fn);
    bus.emit({ kind: 'workflow.propose', workflow: 'wf', projectId: 'p', runId: 'r', payload: {} });
    off();
    bus.emit({ kind: 'workflow.propose', workflow: 'wf', projectId: 'p', runId: 'r', payload: {} });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not abort dispatch when one listener throws', () => {
    const bus = new AiBus();
    const a = vi.fn(() => { throw new Error('boom'); });
    const b = vi.fn();
    bus.on('workflow.error', a);
    bus.on('workflow.error', b);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    bus.emit({ kind: 'workflow.error', workflow: 'wf', projectId: 'p', runId: 'r', payload: {} });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('uses pryzm.ai otelPrefix by default', () => {
    const bus = new AiBus();
    expect(bus.otelPrefix).toBe('pryzm.ai');
  });

  it('honours custom otelPrefix override', () => {
    const bus = new AiBus({ otelPrefix: 'pryzm.ai.test' });
    expect(bus.otelPrefix).toBe('pryzm.ai.test');
  });

  it('listenerCount tracks both per-kind and any listeners', () => {
    const bus = new AiBus();
    expect(bus.listenerCount()).toBe(0);
    bus.on('workflow.start', () => undefined);
    bus.onAny(() => undefined);
    expect(bus.listenerCount()).toBe(2);
    bus._clear();
    expect(bus.listenerCount()).toBe(0);
  });
});
