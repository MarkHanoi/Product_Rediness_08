import { describe, it, expect } from 'vitest';
import { PluginPermissionError } from '../src/hosts/index';
import type {
  CommandBusProxy,
  StoresProxy,
  ViewsProxy,
  SelectionProxy,
  AiProxy,
  FormatProxy,
  HostProxies,
  ElementRef,
  ViewRef,
} from '../src/hosts/index';

// ────────────────────────────────────────────────────────────────────────────
//  In-memory fakes for each proxy.  Tests exercise the contracts without
//  spinning up the iframe sandbox.
// ────────────────────────────────────────────────────────────────────────────

class FakeCommandBus implements CommandBusProxy {
  public readonly dispatched: { kind: string; payload: unknown }[] = [];
  constructor(private readonly granted: readonly string[]) {}
  async dispatch(command: { kind: string; payload: unknown }) {
    if (!this.granted.includes('write:project')) {
      throw new PluginPermissionError('write:project', this.granted);
    }
    this.dispatched.push(command);
    return { ok: true as const, commandId: `cmd_${this.dispatched.length}`, durationMs: 1 };
  }
  async history() {
    return { count: this.dispatched.length, lastCommandId: this.dispatched.length > 0 ? `cmd_${this.dispatched.length}` : null };
  }
}

class FakeStores implements StoresProxy {
  private readonly listeners = new Set<(e: { snapshot: { version: number; takenAt: string }; changedKinds: readonly string[] }) => void>();
  constructor(
    private readonly granted: readonly string[],
    private readonly elements: readonly ElementRef[] = [],
  ) {}
  async getElements(opts?: { kind?: string }) {
    if (!this.granted.includes('read:project')) {
      throw new PluginPermissionError('read:project', this.granted);
    }
    const filtered = opts?.kind ? this.elements.filter((e) => e.kind === opts.kind) : this.elements;
    return { snapshot: { version: 1, takenAt: '2026-04-28T00:00:00Z' }, elements: filtered };
  }
  async getElement(id: string) {
    if (!this.granted.includes('read:project')) {
      throw new PluginPermissionError('read:project', this.granted);
    }
    return {
      snapshot: { version: 1, takenAt: '2026-04-28T00:00:00Z' },
      element: this.elements.find((e) => e.id === id) ?? null,
    };
  }
  subscribe(handler: (e: { snapshot: { version: number; takenAt: string }; changedKinds: readonly string[] }) => void) {
    this.listeners.add(handler);
    return { unsubscribe: () => { this.listeners.delete(handler); } };
  }
  emit(changedKinds: readonly string[]) {
    for (const h of this.listeners) h({ snapshot: { version: 2, takenAt: '2026-04-28T00:00:01Z' }, changedKinds });
  }
}

class FakeViews implements ViewsProxy {
  private readonly listeners = new Set<(e: { activeView: ViewRef | null }) => void>();
  constructor(private active: ViewRef | null = null, private readonly all: readonly ViewRef[] = []) {}
  async getActiveView() { return this.active; }
  async getViews() { return this.all; }
  subscribe(handler: (e: { activeView: ViewRef | null }) => void) {
    this.listeners.add(handler);
    return { unsubscribe: () => { this.listeners.delete(handler); } };
  }
  setActive(v: ViewRef | null) {
    this.active = v;
    for (const h of this.listeners) h({ activeView: v });
  }
}

class FakeSelection implements SelectionProxy {
  private readonly listeners = new Set<(e: { selectedIds: readonly string[] }) => void>();
  constructor(private ids: readonly string[] = []) {}
  async get() { return this.ids; }
  subscribe(handler: (e: { selectedIds: readonly string[] }) => void) {
    this.listeners.add(handler);
    return { unsubscribe: () => { this.listeners.delete(handler); } };
  }
  set(ids: readonly string[]) {
    this.ids = ids;
    for (const h of this.listeners) h({ selectedIds: ids });
  }
}

class FakeAi implements AiProxy {
  constructor(private readonly granted: readonly string[]) {}
  async listWorkflows() {
    return [{ name: 'critic.view', description: 'critique a view', inputSchema: { $ref: '#/components/schemas/CriticInput' } }];
  }
  async runWorkflow(name: string, _input: unknown) {
    if (!this.granted.includes('write:project')) {
      throw new PluginPermissionError('write:project', this.granted);
    }
    return { ok: true as const, workflow: name, runId: 'r_1', output: { ok: true }, costUsd: 0.01, latencyMs: 100 };
  }
}

class FakeFormat implements FormatProxy {
  public readonly importers: { extension: string; menuLabel: string }[] = [];
  public readonly exporters: { extension: string; menuLabel: string }[] = [];
  constructor(private readonly granted: readonly string[]) {}
  registerImporter(opts: { extension: string; menuLabel: string; handler: unknown }) {
    if (!this.granted.includes('register:command')) {
      throw new PluginPermissionError('register:command', this.granted);
    }
    void opts.handler;
    this.importers.push({ extension: opts.extension, menuLabel: opts.menuLabel });
    return { extension: opts.extension, menuLabel: opts.menuLabel, dispose: () => undefined };
  }
  registerExporter(opts: { extension: string; menuLabel: string; handler: unknown }) {
    if (!this.granted.includes('register:command')) {
      throw new PluginPermissionError('register:command', this.granted);
    }
    void opts.handler;
    this.exporters.push({ extension: opts.extension, menuLabel: opts.menuLabel });
    return { extension: opts.extension, menuLabel: opts.menuLabel, dispose: () => undefined };
  }
}

function makeHosts(granted: readonly string[]): HostProxies {
  return {
    commandBus: new FakeCommandBus(granted),
    stores: new FakeStores(granted),
    views: new FakeViews(),
    selection: new FakeSelection(),
    ai: new FakeAi(granted),
    format: new FakeFormat(granted),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Tests
// ────────────────────────────────────────────────────────────────────────────

describe('PluginPermissionError', () => {
  it('carries the required permission and the granted list', () => {
    const err = new PluginPermissionError('write:project', ['read:project']);
    expect(err.required).toBe('write:project');
    expect(err.granted).toEqual(['read:project']);
    expect(err.name).toBe('PluginPermissionError');
    expect(err.message).toContain('write:project');
    expect(err.message).toContain('read:project');
  });

  it('renders (none) for empty granted permissions', () => {
    const err = new PluginPermissionError('write:project', []);
    expect(err.message).toContain('(none)');
  });
});

describe('CommandBusProxy contract', () => {
  it('dispatch resolves to ok:true with a commandId when write:project is granted', async () => {
    const hosts = makeHosts(['write:project']);
    const result = await hosts.commandBus.dispatch({ kind: 'wall.create', payload: {} });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.commandId).toBe('cmd_1');
  });

  it('throws PluginPermissionError when write:project is absent', async () => {
    const hosts = makeHosts(['read:project']);
    await expect(hosts.commandBus.dispatch({ kind: 'wall.create', payload: {} })).rejects.toBeInstanceOf(PluginPermissionError);
  });

  it('history reports zero commands when no dispatches yet', async () => {
    const hosts = makeHosts(['write:project']);
    expect(await hosts.commandBus.history()).toEqual({ count: 0, lastCommandId: null });
  });
});

describe('StoresProxy contract', () => {
  it('getElements returns a snapshot with frozen-in-time version', async () => {
    const hosts = makeHosts(['read:project']);
    const result = await hosts.stores.getElements();
    expect(result.snapshot.version).toBe(1);
    expect(result.snapshot.takenAt).toMatch(/2026-04-28/);
    expect(result.elements).toEqual([]);
  });

  it('throws PluginPermissionError when read:project is absent', async () => {
    const hosts = makeHosts([]);
    await expect(hosts.stores.getElements()).rejects.toBeInstanceOf(PluginPermissionError);
  });

  it('subscribe receives changed-kind events', () => {
    const hosts = makeHosts(['read:project']);
    const events: { changedKinds: readonly string[] }[] = [];
    const sub = hosts.stores.subscribe((e) => events.push({ changedKinds: e.changedKinds }));
    (hosts.stores as FakeStores).emit(['wall', 'door']);
    expect(events).toHaveLength(1);
    expect(events[0]?.changedKinds).toEqual(['wall', 'door']);
    sub.unsubscribe();
    (hosts.stores as FakeStores).emit(['ignored']);
    expect(events).toHaveLength(1);
  });
});

describe('ViewsProxy contract', () => {
  it('getActiveView returns null when no view is open', async () => {
    const hosts = makeHosts(['read:project']);
    expect(await hosts.views.getActiveView()).toBeNull();
  });

  it('subscribe fires on view activation', () => {
    const hosts = makeHosts(['read:project']);
    const events: (ViewRef | null)[] = [];
    hosts.views.subscribe((e) => events.push(e.activeView));
    (hosts.views as FakeViews).setActive({ id: 'v_1', kind: '3d', label: '3D', levelId: null });
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('3d');
  });
});

describe('SelectionProxy contract', () => {
  it('get returns the current selection', async () => {
    const hosts = makeHosts(['read:project']);
    expect(await hosts.selection.get()).toEqual([]);
  });

  it('subscribe fires on selection change', () => {
    const hosts = makeHosts(['read:project']);
    const events: readonly string[][] = [];
    const sub = hosts.selection.subscribe((e) => { (events as string[][]).push([...e.selectedIds]); });
    (hosts.selection as FakeSelection).set(['e_1', 'e_2']);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(['e_1', 'e_2']);
    sub.unsubscribe();
  });
});

describe('AiProxy contract', () => {
  it('runWorkflow throws PluginPermissionError without write:project', async () => {
    const hosts = makeHosts(['read:project']);
    await expect(hosts.ai.runWorkflow('critic.view', {})).rejects.toBeInstanceOf(PluginPermissionError);
  });

  it('runWorkflow surfaces costUsd + latencyMs + runId on success', async () => {
    const hosts = makeHosts(['write:project']);
    const result = await hosts.ai.runWorkflow('critic.view', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.costUsd).toBeGreaterThan(0);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.runId).toMatch(/^r_/);
    }
  });
});

describe('FormatProxy contract', () => {
  it('registerImporter requires register:command', () => {
    const hosts = makeHosts(['write:project']);
    expect(() =>
      hosts.format.registerImporter({ extension: '.csv', menuLabel: 'Import CSV', handler: async () => ({ ok: true, commands: [] }) }),
    ).toThrow(PluginPermissionError);
  });

  it('registerImporter records the importer when permission granted', () => {
    const hosts = makeHosts(['register:command']);
    const reg = hosts.format.registerImporter({ extension: '.csv', menuLabel: 'Import CSV', handler: async () => ({ ok: true, commands: [] }) });
    expect(reg.extension).toBe('.csv');
    expect((hosts.format as FakeFormat).importers).toHaveLength(1);
  });
});
