import { describe, it, expect, vi } from 'vitest';
import {
  bootstrapInput,
  bootstrapInputIdle,
  type InputBootstrapResult,
} from '../src/bootstrap.js';
import {
  bootstrapSelection,
  bootstrapSelectionIdle,
} from '../src/SelectionBootstrap.js';
import {
  bootstrapToolBindings,
  createNullToolBindings,
  type ToolRegistration,
  type ToolsSlotShape,
} from '../src/ToolBindings.js';

// ── helpers ───────────────────────────────────────────────────────────────────

const AUDIT = { actorId: 'test-actor', projectId: 'test-project', clientId: 'test-client' };

function makeMockToolsSlot(): ToolsSlotShape & { _registrations: ToolRegistration[] } {
  const registrations: ToolRegistration[] = [];
  let activeId: string | null = null;
  const subs = new Set<(id: string | null) => void>();
  return {
    get activeId() { return activeId; },
    get _registrations() { return registrations; },
    register(entry: ToolRegistration): void { registrations.push(entry); },
    activate(id: string): void { activeId = id; subs.forEach(s => s(id)); },
    deactivate(): void { activeId = null; subs.forEach(s => s(null)); },
    subscribe(l: (id: string | null) => void): { dispose(): void } {
      subs.add(l);
      return { dispose: (): void => void subs.delete(l) };
    },
  };
}

// ── bootstrapInputIdle ────────────────────────────────────────────────────────

describe('bootstrapInputIdle()', () => {
  it('returns a result with the correct shape', () => {
    const result: InputBootstrapResult = bootstrapInputIdle();
    expect(result).toHaveProperty('inputHost');
    expect(result).toHaveProperty('inputError');
    expect(result).toHaveProperty('selection');
    expect(result).toHaveProperty('toolBindings');
    expect(result).toHaveProperty('ready');
    expect(result).toHaveProperty('tearDown');
  });

  it('inputHost.isReady() is false on the idle path', () => {
    expect(bootstrapInputIdle().inputHost.isReady()).toBe(false);
  });

  it('inputError is null on the idle path', () => {
    expect(bootstrapInputIdle().inputError).toBeNull();
  });

  it('ready is false on the idle path (no DOM source)', () => {
    expect(bootstrapInputIdle().ready).toBe(false);
  });

  it('tearDown is idempotent', () => {
    const { tearDown } = bootstrapInputIdle();
    expect(() => { tearDown(); tearDown(); }).not.toThrow();
  });

  it('toolBindings.registrationCount is 0 on idle', () => {
    expect(bootstrapInputIdle().toolBindings.registrationCount).toBe(0);
  });
});

// ── bootstrapInput (async) ────────────────────────────────────────────────────

describe('bootstrapInput()', () => {
  it('returns a result on the no-loader path', async () => {
    const result = await bootstrapInput({ audit: AUDIT });
    expect(result.inputHost.isReady()).toBe(false);
    expect(result.inputError).toBeNull();
    expect(result.selection.selectionError).toBeNull();
  });

  it('calls loadEngineInput and returns the result', async () => {
    const mockHost = { isReady: () => true, getModifiers: () => ({ shift: false, ctrl: false, alt: false, meta: false }), subscribe: vi.fn(() => ({ dispose: vi.fn() })), dispose: vi.fn() };
    const result = await bootstrapInput({
      audit: AUDIT,
      loadEngineInput: async () => () => mockHost,
    });
    expect(result.inputHost.isReady()).toBe(true);
    expect(result.inputError).toBeNull();
    expect(result.ready).toBe(true);
  });

  it('soft-fails when loadEngineInput throws', async () => {
    const result = await bootstrapInput({
      audit: AUDIT,
      loadEngineInput: async () => { throw new Error('pump-load-failure'); },
    });
    expect(result.inputError).toBeInstanceOf(Error);
    expect(result.inputError!.message).toBe('pump-load-failure');
    expect(result.inputHost.isReady()).toBe(false);
    expect(result.ready).toBe(false);
  });

  it('tearDown disposes the inputHost', async () => {
    const disposeSpy = vi.fn();
    const mockHost = { isReady: () => true, getModifiers: () => ({ shift: false, ctrl: false, alt: false, meta: false }), subscribe: vi.fn(() => ({ dispose: vi.fn() })), dispose: disposeSpy };
    const result = await bootstrapInput({
      audit: AUDIT,
      loadEngineInput: async () => () => mockHost,
    });
    result.tearDown();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('tearDown is idempotent (does not throw)', async () => {
    const result = await bootstrapInput({ audit: AUDIT });
    expect(() => { result.tearDown(); result.tearDown(); }).not.toThrow();
  });
});

// ── SelectionBootstrap ────────────────────────────────────────────────────────

describe('bootstrapSelectionIdle()', () => {
  it('returns a SelectionBootstrapResult with the correct shape', () => {
    const result = bootstrapSelectionIdle();
    expect(result).toHaveProperty('selection');
    expect(result).toHaveProperty('selectionError');
    expect(result).toHaveProperty('tearDown');
  });

  it('selectionError is null', () => {
    expect(bootstrapSelectionIdle().selectionError).toBeNull();
  });

  it('selection.ids is empty', () => {
    expect(bootstrapSelectionIdle().selection.ids).toEqual([]);
  });

  it('selection.add/remove/clear/set mutate ids', () => {
    const { selection } = bootstrapSelectionIdle();
    selection.add('a');
    expect(selection.ids).toContain('a');
    selection.remove('a');
    expect(selection.ids).not.toContain('a');
    selection.set(['x', 'y']);
    expect([...selection.ids]).toEqual(['x', 'y']);
    selection.clear();
    expect(selection.ids).toHaveLength(0);
  });

  it('subscribe + dispose does not leak', () => {
    const { selection } = bootstrapSelectionIdle();
    const cb = vi.fn();
    const sub = selection.subscribe(cb);
    selection.add('z');
    expect(cb).toHaveBeenCalledTimes(1);
    sub.dispose();
    selection.add('w');
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('bootstrapSelection() async', () => {
  it('calls loadEngineSelection and returns the result', async () => {
    const fakeSelection = {
      ids: [] as string[],
      add: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      set: vi.fn(),
      subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const result = await bootstrapSelection({
      audit: AUDIT,
      loadEngineSelection: async () => () => ({ selection: fakeSelection }),
      engineParams: {},
    });
    expect(result.selectionError).toBeNull();
    expect(result.selection).toBe(fakeSelection);
  });

  it('soft-fails when loadEngineSelection throws', async () => {
    const result = await bootstrapSelection({
      audit: AUDIT,
      loadEngineSelection: async () => { throw new Error('sel-fail'); },
      engineParams: {},
    });
    expect(result.selectionError).toBeInstanceOf(Error);
    expect(result.selectionError!.message).toBe('sel-fail');
    expect(result.selection.ids).toEqual([]);
  });
});

// ── ToolBindings ──────────────────────────────────────────────────────────────

describe('createNullToolBindings()', () => {
  it('returns a frozen empty array', () => {
    const table = createNullToolBindings();
    expect(Array.isArray(table)).toBe(true);
    expect(table).toHaveLength(0);
    expect(Object.isFrozen(table)).toBe(true);
  });
});

describe('bootstrapToolBindings()', () => {
  it('registers all entries and counts correctly', () => {
    const slot = makeMockToolsSlot();
    const registrations: ToolRegistration[] = [
      { id: 'select', kind: 'select', label: 'Select', construct: () => ({}) },
      { id: 'wall', kind: 'structure', label: 'Wall', construct: () => ({}) },
    ];
    const result = bootstrapToolBindings({ toolsSlot: slot, registrations });
    expect(result.registrationCount).toBe(2);
    expect(result.toolsError).toBeNull();
    expect(slot._registrations).toHaveLength(2);
  });

  it('soft-fails on a bad registration and captures the error', () => {
    const slot = makeMockToolsSlot();
    (slot as any).register = (entry: ToolRegistration): void => {
      if (entry.id === 'bad') throw new Error('bad-tool');
    };
    const registrations: ToolRegistration[] = [
      { id: 'bad', kind: 'select', label: 'Bad', construct: () => ({}) },
      { id: 'wall', kind: 'structure', label: 'Wall', construct: () => ({}) },
    ];
    const result = bootstrapToolBindings({ toolsSlot: slot, registrations });
    expect(result.toolsError).toBeInstanceOf(Error);
    expect(result.toolsError!.message).toBe('bad-tool');
    expect(result.registrationCount).toBe(1);
  });

  it('tearDown is idempotent', () => {
    const slot = makeMockToolsSlot();
    const result = bootstrapToolBindings({ toolsSlot: slot, registrations: [] });
    expect(() => { result.tearDown(); result.tearDown(); }).not.toThrow();
  });

  it('works with an empty registrations array', () => {
    const slot = makeMockToolsSlot();
    const result = bootstrapToolBindings({ toolsSlot: slot, registrations: [] });
    expect(result.registrationCount).toBe(0);
    expect(result.toolsError).toBeNull();
  });
});
