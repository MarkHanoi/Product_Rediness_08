import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  CommandBusError,
  type CommandHandler,
  type HandlerContext,
  type ValidationResult,
} from '../src/index.js';

const baseAudit = { actorId: 'u', projectId: 'p', clientId: 'c' };

class NoopHandler implements CommandHandler<{ n: number }> {
  readonly type = 'noop.run';
  readonly affectedStores = ['noop'] as const;
  canExecute(): ValidationResult {
    return { valid: true };
  }
  execute() {
    return { forward: [], inverse: [] };
  }
}

describe('CommandBus registry', () => {
  it('register / has / unregister / registeredTypes', () => {
    const bus = new CommandBus({ audit: baseAudit });
    expect(bus.has('noop.run')).toBe(false);
    bus.register(new NoopHandler());
    expect(bus.has('noop.run')).toBe(true);
    expect(bus.registeredTypes).toContain('noop.run');
    expect(bus.unregister('noop.run')).toBe(true);
    expect(bus.has('noop.run')).toBe(false);
    expect(bus.unregister('noop.run')).toBe(false);
  });

  it('throws on duplicate registration', () => {
    const bus = new CommandBus({ audit: baseAudit });
    bus.register(new NoopHandler());
    expect(() => bus.register(new NoopHandler())).toThrowError(CommandBusError);
  });

  it('throws when affectedStores is not an array', () => {
    const bus = new CommandBus({ audit: baseAudit });
    const bad = {
      type: 'bad',
      affectedStores: 'wall' as unknown as readonly string[],
      canExecute: () => ({ valid: true as const }),
      execute: () => ({ forward: [], inverse: [] }),
    };
    expect(() => bus.register(bad)).toThrowError(/affectedStores/);
  });

  it('throws when canExecute is missing', () => {
    const bus = new CommandBus({ audit: baseAudit });
    const bad = {
      type: 'bad2',
      affectedStores: ['x'] as const,
      execute: () => ({ forward: [], inverse: [] }),
    } as unknown as CommandHandler<unknown>;
    expect(() => bus.register(bad)).toThrowError(/canExecute/);
  });

  it('emits an event with the handler.affectedStores propagated', async () => {
    const bus = new CommandBus({
      audit: baseAudit,
      storesProvider: () => ({ noop: {} }),
    });
    bus.register(new NoopHandler());
    const evt = await bus.executeCommand('noop.run', { n: 1 });
    expect(evt.affectedStores).toEqual(['noop']);
    expect(evt.payload).toEqual({ n: 1 });
    expect(evt.patches).toHaveLength(1);
    expect(evt.patches[0]!.storeKey).toBe('noop');
  });

  it('throws SYNCHRONOUSLY (CommandBusError) when a required store is missing from ctx.stores', async () => {
    // R1A-16 / ADR-002 §3 — no `(window as any)` fallback.
    const bus = new CommandBus({
      audit: baseAudit,
      storesProvider: () => ({}), // <- 'noop' is missing
    });
    bus.register(new NoopHandler());
    await expect(bus.executeCommand('noop.run', { n: 1 })).rejects.toThrowError(
      /required store 'noop' is missing/,
    );
  });

  it('aborts cleanly (no undo push) when canExecute returns { valid: false }', async () => {
    class Picky implements CommandHandler<{ ok: boolean }> {
      readonly type = 'picky.run';
      readonly affectedStores = ['picky'] as const;
      canExecute(_ctx: HandlerContext, cmd: { ok: boolean }): ValidationResult {
        return cmd.ok ? { valid: true } : { valid: false, reason: 'not ok' };
      }
      execute() {
        return { forward: [], inverse: [] };
      }
    }
    const bus = new CommandBus({
      audit: baseAudit,
      storesProvider: () => ({ picky: {} }),
    });
    bus.register(new Picky());
    await expect(bus.executeCommand('picky.run', { ok: false })).rejects.toThrowError(
      /canExecute rejected — not ok/,
    );
    expect(bus.undo.size).toBe(0);
  });
});
