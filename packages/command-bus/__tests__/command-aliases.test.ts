// §FIX-COMMAND-NAMESPACE (L-796) — deprecated command aliases.
//
// WHY THE MECHANISM EXISTS
// ------------------------
// A command type is a WIRE IDENTIFIER, not an internal symbol. It appears in
// call sites, in the CRDT payload routed to the Y.Doc, in the persisted
// `project_command_log`, and therefore in replayed history. Renaming one is a
// protocol change, not a refactor: a flag-day rename breaks every unmigrated
// caller and every command already written to disk.
//
// The curtain-wall family is the case that forced it. It carries two prefixes
// for one concept — `curtainwall.create` / `curtainwall.move` alongside
// `curtain-wall.batch.create` / `curtain-wall.create-on-all-slabs` — across ~25
// types and 25 files including benches and tests. (Note this is NOT the
// "duplicate command" the audit first reported: the two spellings name DIFFERENT
// operations. The defect is one inconsistent family, which is less alarming and
// more tedious.) Aliases make that migration incremental instead of a flag day.
//
// The tests below pin the two properties that make the mechanism safe to put in
// the most important class in the codebase: an alias resolves to the SAME
// handler with no second dispatch path, and an alias can NEVER shadow a real
// command.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { CommandBus } from '../src/CommandBus.js';
import type { CommandHandler } from '../src/types.js';

const AUDIT = { actorId: 'test', projectId: 'p1', clientId: 'c1' } as const;

function makeBus() {
  return new CommandBus({ audit: AUDIT, storesProvider: () => ({ demo: {} }) });
}

/** Minimal handler that records how many times it ran. */
function makeHandler(
  type: string,
  aliases?: readonly string[],
): CommandHandler<{ n: number }> & { calls: number } {
  const h = {
    type,
    ...(aliases ? { aliases } : {}),
    affectedStores: ['demo'] as const,
    calls: 0,
    canExecute: () => ({ valid: true as const }),
    execute: () => {
      h.calls++;
      return { forward: [], inverse: [] };
    },
  };
  return h as unknown as CommandHandler<{ n: number }> & { calls: number };
}

afterEach(() => vi.restoreAllMocks());

describe('§FIX-COMMAND-NAMESPACE (L-796) — alias resolution', () => {
  it('dispatches an alias to the canonical handler', async () => {
    const bus = makeBus();
    const h = makeHandler('curtain-wall.create', ['curtainwall.create']);
    bus.register(h);

    await bus.executeCommand('curtainwall.create', { n: 1 });
    expect(h.calls).toBe(1);
  });

  it('reports the CANONICAL type on the EventRecord, whichever name was used', async () => {
    // The record is what reaches the CRDT applier, the undo stacks and the
    // event log. If an alias leaked into it, history would be written under two
    // different names for one command and replay would have to know both —
    // which would make the alias permanent rather than transitional.
    const bus = makeBus();
    bus.register(makeHandler('curtain-wall.create', ['curtainwall.create']));

    const viaAlias = await bus.executeCommand('curtainwall.create', { n: 1 });
    const viaCanonical = await bus.executeCommand('curtain-wall.create', { n: 2 });
    expect(viaAlias.type).toBe('curtain-wall.create');
    expect(viaCanonical.type).toBe('curtain-wall.create');
  });

  it('has() answers true for an alias, so registry.has() guards keep working', async () => {
    // Several call sites guard with `registry.has('curtain-wall.batch.create')`
    // and SILENTLY SKIP when it is false — that guard is the one place a
    // mis-spelled type does not throw. An alias must therefore be visible to it.
    const bus = makeBus();
    bus.register(makeHandler('curtain-wall.batch.update', ['curtainwall.batch.update']));
    expect(bus.has('curtainwall.batch.update')).toBe(true);
    expect(bus.has('curtain-wall.batch.update')).toBe(true);
  });

  it('canonicalTypeFor distinguishes an alias from a real type', () => {
    const bus = makeBus();
    bus.register(makeHandler('curtain-wall.create', ['curtainwall.create']));
    expect(bus.canonicalTypeFor('curtainwall.create')).toBe('curtain-wall.create');
    expect(bus.canonicalTypeFor('curtain-wall.create')).toBeNull();
    expect(bus.canonicalTypeFor('nope')).toBeNull();
  });
});

describe('§FIX-COMMAND-NAMESPACE (L-796) — an alias can never shadow a real command', () => {
  it('throws when an alias collides with an already-registered type', () => {
    const bus = makeBus();
    bus.register(makeHandler('wall.create'));
    expect(() =>
      bus.register(makeHandler('curtain-wall.create', ['wall.create'])),
    ).toThrow(/collides/i);
  });

  it('throws when a later handler registers a type an alias already occupies', () => {
    // The reverse order matters just as much, and is the easier one to get
    // wrong: registration order is boot order, which nobody controls precisely.
    const bus = makeBus();
    bus.register(makeHandler('curtain-wall.create', ['curtainwall.create']));
    expect(() => bus.register(makeHandler('curtainwall.create'))).toThrow(
      /already registered/i,
    );
  });

  it('rejects an alias equal to its own canonical type', () => {
    const bus = makeBus();
    expect(() =>
      bus.register(makeHandler('curtain-wall.create', ['curtain-wall.create'])),
    ).toThrow(/must differ/i);
  });

  it('fails at REGISTRATION, not at dispatch', () => {
    // Registration is boot-time. A collision surfacing at dispatch would route a
    // caller to the wrong handler and write patches against the wrong store —
    // a data defect nearly impossible to trace back to registration order.
    const bus = makeBus();
    bus.register(makeHandler('a.create'));
    expect(() => bus.register(makeHandler('b.create', ['a.create']))).toThrow();
    // …and the victim is untouched.
    expect(bus.registry.get('a.create')!.type).toBe('a.create');
  });
});

describe('§FIX-COMMAND-NAMESPACE (L-796) — deprecation is visible but not noisy', () => {
  it('warns once per alias, not once per dispatch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = makeBus();
    bus.register(makeHandler('curtain-wall.create', ['curtainwall.create']));

    await bus.executeCommand('curtainwall.create', { n: 1 });
    await bus.executeCommand('curtainwall.create', { n: 2 });
    await bus.executeCommand('curtainwall.create', { n: 3 });

    const hits = warn.mock.calls.filter(c => String(c[0]).includes('DEPRECATED alias'));
    expect(hits).toHaveLength(1);
    expect(String(hits[0]![0])).toContain('curtain-wall.create');
  });

  it('does not warn for the canonical name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = makeBus();
    bus.register(makeHandler('curtain-wall.create', ['curtainwall.create']));
    await bus.executeCommand('curtain-wall.create', { n: 1 });
    expect(
      warn.mock.calls.filter(c => String(c[0]).includes('DEPRECATED alias')),
    ).toHaveLength(0);
  });
});

describe('§FIX-COMMAND-NAMESPACE (L-796) — unregister does not strand alias keys', () => {
  it('removing the canonical type removes its aliases too', () => {
    const bus = makeBus();
    bus.register(makeHandler('curtain-wall.create', ['curtainwall.create']));
    expect(bus.unregister('curtain-wall.create')).toBe(true);
    // A stranded alias would make has() answer true for a command that is gone,
    // and dispatch would reach a handler the caller believes is unregistered.
    expect(bus.has('curtainwall.create')).toBe(false);
    expect(bus.canonicalTypeFor('curtainwall.create')).toBeNull();
  });

  it('removing an alias leaves the canonical type working', () => {
    const bus = makeBus();
    bus.register(makeHandler('curtain-wall.create', ['curtainwall.create']));
    expect(bus.unregister('curtainwall.create')).toBe(true);
    expect(bus.has('curtain-wall.create')).toBe(true);
    expect(bus.has('curtainwall.create')).toBe(false);
  });
});

describe('§FIX-COMMAND-NAMESPACE (L-796) — handlers without aliases are unaffected', () => {
  it('registers, dispatches and unregisters exactly as before', async () => {
    const bus = makeBus();
    const h = makeHandler('wall.create');
    bus.register(h);
    await bus.executeCommand('wall.create', { n: 1 });
    expect(h.calls).toBe(1);
    expect(bus.canonicalTypeFor('wall.create')).toBeNull();
    expect(bus.unregister('wall.create')).toBe(true);
    expect(bus.has('wall.create')).toBe(false);
  });
});
