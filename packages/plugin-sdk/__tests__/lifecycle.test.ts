import { describe, it, expect } from 'vitest';
import { definePlugin, HOOK_TIMEOUT_MS } from '../src/lifecycle';
import type { PluginActivationContext, PluginLifecycle } from '../src/lifecycle';

describe('definePlugin — type-safe lifecycle helper', () => {
  it('returns the same object reference (no runtime cost)', () => {
    const plugin: PluginLifecycle = {};
    const out = definePlugin(plugin);
    expect(out).toBe(plugin);
  });

  it('preserves caller fields through the generic', () => {
    const plugin = definePlugin({
      onActivate: async () => 'ignored',
      onDeactivate: () => undefined,
      onUpdate: async (a: string, b: string) => `${a}->${b}`,
    });
    expect(typeof plugin.onActivate).toBe('function');
    expect(typeof plugin.onDeactivate).toBe('function');
    expect(typeof plugin.onUpdate).toBe('function');
  });

  it('an empty lifecycle is valid (declarative-only plugins are allowed)', () => {
    const plugin = definePlugin({});
    expect(plugin).toEqual({});
  });
});

describe('HOOK_TIMEOUT_MS — kill-switch budget', () => {
  it('matches the K3-C audit gate (5000 ms per phase-doc-2 §S62 D7)', () => {
    expect(HOOK_TIMEOUT_MS).toBe(5_000);
  });
});

describe('PluginActivationContext — narrow user-context shape', () => {
  it('user fields default to null when read:user is not granted', () => {
    // Compile-time check: PluginUserContext must accept null for displayName/email.
    const ctx: PluginActivationContext = {
      manifest: {
        pryzmPlugin: '1.0',
        id: 'test-plugin',
        version: '1.0.0',
        displayName: 'Test',
        description: '',
        author: 'tests',
        main: 'index.js',
        license: 'MIT',
        permissions: [],
        allowedOrigins: [],
        contributions: [],
        minPRYZMVersion: '2.0.0',
      },
      user: { id: 'u_x', displayName: null, email: null },
      hosts: undefined as unknown as PluginActivationContext['hosts'],
      locale: 'en-US',
    };
    expect(ctx.user.displayName).toBeNull();
    expect(ctx.user.email).toBeNull();
    expect(ctx.user.id).toBe('u_x');
  });
});
