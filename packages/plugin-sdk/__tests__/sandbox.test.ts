import { describe, it, expect } from 'vitest';
import {
  buildPluginCSP,
  buildIframeHeadHTML,
  SANDBOX_TOKENS,
} from '../src/sandbox/policy';
import {
  buildIframeSrcdoc,
  isAllowedFromPlugin,
  isAllowedFromHost,
  PLUGIN_ALLOWED_OUTBOUND_KINDS,
  HOST_ALLOWED_OUTBOUND_KINDS,
} from '../src/sandbox/iframe-sandbox';
import type { PluginManifest } from '../src/descriptor';

const BASE: PluginManifest = {
  pryzmPlugin: '1.0',
  id: 'sandbox-test',
  version: '1.0.0',
  displayName: 'Sandbox Test',
  description: 'fixture',
  author: 'tests',
  main: 'index.js',
  license: 'MIT',
  permissions: [],
  allowedOrigins: [],
  contributions: [],
  minPRYZMVersion: '2.0.0',
};

describe('SANDBOX_TOKENS — locked sandbox attribute set', () => {
  it('contains exactly allow-scripts, no other tokens', () => {
    expect(SANDBOX_TOKENS).toEqual(['allow-scripts']);
  });

  it('does NOT contain allow-same-origin (would defeat cross-origin isolation)', () => {
    expect(SANDBOX_TOKENS).not.toContain('allow-same-origin');
  });

  it('does NOT contain allow-top-navigation (would let plugin navigate user away)', () => {
    expect(SANDBOX_TOKENS).not.toContain('allow-top-navigation');
  });
});

describe('buildPluginCSP — permission-driven CSP', () => {
  it('default-src none for permission-less manifest', () => {
    expect(buildPluginCSP(BASE)).toContain(`default-src 'none'`);
  });

  it('connect-src none when network:fetch is absent', () => {
    expect(buildPluginCSP(BASE)).toContain(`connect-src 'none'`);
  });

  it('connect-src restricted to allowedOrigins when network:fetch is granted', () => {
    const m: PluginManifest = {
      ...BASE,
      permissions: ['network:fetch'],
      allowedOrigins: ['https://api.example.com', 'https://cdn.example.com'],
    };
    const csp = buildPluginCSP(m);
    expect(csp).toContain(`connect-src https://api.example.com https://cdn.example.com`);
  });

  it('connect-src defaults to none if allowedOrigins is empty even with network:fetch (defence in depth)', () => {
    const m: PluginManifest = { ...BASE, permissions: ['network:fetch'], allowedOrigins: [] };
    expect(buildPluginCSP(m)).toContain(`connect-src 'none'`);
  });

  it('frame-src and worker-src are locked to none', () => {
    const csp = buildPluginCSP(BASE);
    expect(csp).toContain(`frame-src 'none'`);
    expect(csp).toContain(`worker-src 'none'`);
  });

  it('object-src none + base-uri self pinned', () => {
    const csp = buildPluginCSP(BASE);
    expect(csp).toContain(`object-src 'none'`);
    expect(csp).toContain(`base-uri 'self'`);
  });

  it('frame-ancestors self prevents clickjacking', () => {
    expect(buildPluginCSP(BASE)).toContain(`frame-ancestors 'self'`);
  });
});

describe('buildIframeHeadHTML — meta tag composition', () => {
  it('puts CSP meta tag immediately after charset (must apply to all subsequent tags)', () => {
    const head = buildIframeHeadHTML(BASE);
    const charsetIdx = head.indexOf('<meta charset');
    const cspIdx = head.indexOf('http-equiv="Content-Security-Policy"');
    expect(charsetIdx).toBeGreaterThanOrEqual(0);
    expect(cspIdx).toBeGreaterThan(charsetIdx);
  });

  it('escapes the manifest displayName', () => {
    const head = buildIframeHeadHTML({ ...BASE, displayName: 'Hello <script>alert(1)</script>' });
    expect(head).not.toContain('<script>alert(1)</script>');
    expect(head).toContain('&lt;script&gt;');
  });
});

describe('buildIframeSrcdoc — full document', () => {
  it('includes the sandbox tokens as a data attribute', () => {
    const html = buildIframeSrcdoc({
      manifest: BASE,
      bundleSource: 'console.log(1)',
      hostOriginForHandshake: 'https://app.pryzm.com',
    });
    expect(html).toContain(`data-sandbox-tokens="allow-scripts"`);
  });

  it('inlines the bundle source', () => {
    const html = buildIframeSrcdoc({
      manifest: BASE,
      bundleSource: 'console.log("test-bundle-source-marker")',
      hostOriginForHandshake: 'https://app.pryzm.com',
    });
    expect(html).toContain('test-bundle-source-marker');
  });

  it('passes hostOrigin to the handshake bootstrap (no wildcard)', () => {
    const html = buildIframeSrcdoc({
      manifest: BASE,
      bundleSource: '',
      hostOriginForHandshake: 'https://app.pryzm.com',
    });
    expect(html).toContain('"https://app.pryzm.com"');
    // The bootstrap must NEVER use '*' as the postMessage targetOrigin —
    // that would leak the manifest to any frame ancestor.
    expect(html).not.toMatch(/postMessage\([^,]+,\s*['"]\*['"]\)/);
  });

  it('contains the plugin-root mount point', () => {
    const html = buildIframeSrcdoc({
      manifest: BASE,
      bundleSource: '',
      hostOriginForHandshake: 'https://app.pryzm.com',
    });
    expect(html).toContain('id="pryzm-plugin-root"');
  });
});

describe('isAllowedFromPlugin / isAllowedFromHost — wire-direction validators', () => {
  it('plugin can send handshake-ack', () => {
    expect(isAllowedFromPlugin({ kind: 'pryzm/handshake-ack' })).toBe(true);
  });

  it('plugin can send host-call', () => {
    expect(
      isAllowedFromPlugin({
        kind: 'pryzm/host-call',
        requestId: 'r_x',
        proxy: 'commandBus',
        method: 'dispatch',
        args: [],
      }),
    ).toBe(true);
  });

  it('plugin CANNOT send host-event', () => {
    expect(isAllowedFromPlugin({ kind: 'pryzm/host-event', eventId: 'e', proxy: 'stores', payload: {} })).toBe(false);
  });

  it('plugin CANNOT send activate or deactivate', () => {
    expect(isAllowedFromPlugin({ kind: 'pryzm/activate', user: { id: 'x', displayName: null, email: null }, locale: 'en-US' })).toBe(false);
    expect(isAllowedFromPlugin({ kind: 'pryzm/deactivate' })).toBe(false);
  });

  it('plugin CANNOT send unknown kinds', () => {
    expect(isAllowedFromPlugin({ kind: 'pryzm/admin-elevate' })).toBe(false);
    expect(isAllowedFromPlugin({})).toBe(false);
    expect(isAllowedFromPlugin(null)).toBe(false);
  });

  it('host can send activate, deactivate, host-event, handshake', () => {
    expect(isAllowedFromHost({ kind: 'pryzm/handshake', v: 1, manifest: BASE })).toBe(true);
    expect(isAllowedFromHost({ kind: 'pryzm/activate', user: { id: 'x', displayName: null, email: null }, locale: 'en-US' })).toBe(true);
    expect(isAllowedFromHost({ kind: 'pryzm/deactivate' })).toBe(true);
    expect(isAllowedFromHost({ kind: 'pryzm/host-event', eventId: 'e', proxy: 'stores', payload: {} })).toBe(true);
  });

  it('host CANNOT send host-call (host invokes proxies host-side directly)', () => {
    expect(isAllowedFromHost({ kind: 'pryzm/host-call', requestId: 'r', proxy: 'commandBus', method: 'dispatch', args: [] })).toBe(false);
  });
});

describe('exported allowed-kind lists are non-empty', () => {
  it('plugin-outbound list non-empty', () => {
    expect(PLUGIN_ALLOWED_OUTBOUND_KINDS.length).toBeGreaterThan(0);
  });
  it('host-outbound list non-empty', () => {
    expect(HOST_ALLOWED_OUTBOUND_KINDS.length).toBeGreaterThan(0);
  });
  it('the two lists are disjoint EXCEPT for response/log shared shapes', () => {
    const overlap = PLUGIN_ALLOWED_OUTBOUND_KINDS.filter((k) => HOST_ALLOWED_OUTBOUND_KINDS.includes(k));
    // host-response is the ONLY shared kind: both sides can produce a
    // response message (host responds to host-call; plugin responds to
    // host-event-with-reply patterns).
    expect(overlap).toEqual(['pryzm/host-response']);
  });
});
