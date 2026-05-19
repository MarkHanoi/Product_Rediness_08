// @pryzm/plugin-sdk — iframe sandbox runtime (S62 D4).
//
// Spec source:
//   • phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S62 D4
//     (iframe sandbox + CSP policy + hot-reload)
//   • ADR-0038 §Decision B (sandbox model = iframe sandbox="allow-scripts")
//
// IframeSandbox is the host-side runtime that:
//
//   1. Mounts a plugin into an `<iframe sandbox="allow-scripts">` whose
//      `srcdoc` is built from the manifest's bundle + the CSP policy
//      (sandbox/policy.ts).
//   2. Performs a postMessage handshake before declaring the plugin
//      "ready".  Handshake = host sends `{ kind: 'pryzm/handshake', v: 1, manifest }`,
//      plugin replies `{ kind: 'pryzm/handshake-ack' }`, host sends
//      `{ kind: 'pryzm/activate', user, locale }` to trigger onActivate.
//   3. Bridges host-proxy method calls across postMessage with request /
//      response correlation by ULID.  Permission checks happen
//      HOST-SIDE before the request hits the iframe (i.e. a request
//      that exceeds the manifest's permissions never crosses the wire).
//   4. Times out unresponsive hooks per `HOOK_TIMEOUT_MS` (lifecycle.ts)
//      and unmounts the iframe — that is the K3-C kill-switch path per
//      phase-doc-2 §S62 D7 audit gate.
//
// This module exports the contract; the full runtime implementation
// lives in apps/editor/src/plugin-runtime/ (which consumes this module).
// The SDK itself ships only:
//
//   • the iframe HTML builder (so CLI tools like `pryzm dev` can preview
//     the iframe DOM without booting the editor),
//   • the postMessage envelope shape (so plugin authors can write tests
//     against the wire format),
//   • the handshake constants.

import type { PluginManifest } from '../descriptor';
import { buildIframeHeadHTML, SANDBOX_TOKENS } from './policy';

// ────────────────────────────────────────────────────────────────────────────
//  Wire envelope — the postMessage shape that crosses the iframe boundary
// ────────────────────────────────────────────────────────────────────────────

export type SandboxMessage =
  | {
      kind: 'pryzm/handshake';
      v: 1;
      manifest: PluginManifest;
    }
  | { kind: 'pryzm/handshake-ack' }
  | {
      kind: 'pryzm/activate';
      user: { id: string; displayName: string | null; email: string | null };
      locale: string;
    }
  | { kind: 'pryzm/deactivate' }
  | {
      kind: 'pryzm/host-call';
      requestId: string;          // ULID
      proxy: 'commandBus' | 'stores' | 'views' | 'selection' | 'ai' | 'format';
      method: string;
      args: readonly unknown[];
    }
  | {
      kind: 'pryzm/host-response';
      requestId: string;
      ok: true;
      result: unknown;
    }
  | {
      kind: 'pryzm/host-response';
      requestId: string;
      ok: false;
      error: { code: string; message: string };
    }
  | {
      kind: 'pryzm/host-event';
      eventId: string;            // ULID
      proxy: 'stores' | 'views' | 'selection';
      payload: unknown;
    }
  | {
      kind: 'pryzm/log';
      level: 'debug' | 'info' | 'warn' | 'error';
      message: string;
      args: readonly unknown[];
    };

/** Compile-time exhaustiveness helper for switches over SandboxMessage. */
export type SandboxMessageKind = SandboxMessage['kind'];

/**
 * Build the full HTML document for a plugin iframe.  The bundle source
 * is injected as an inline `<script>`; the CSP allows inline scripts
 * (the iframe is opaque-origin so 'unsafe-inline' is bounded by the
 * cross-origin isolation, not by CSP alone).
 *
 * Tests + the `pryzm dev` CLI use this to render the iframe DOM
 * without booting the editor.
 */
export function buildIframeSrcdoc(opts: {
  manifest: PluginManifest;
  bundleSource: string;          // the compiled JS, ready to execute
  hostOriginForHandshake: string; // origin the postMessage handshake should target
}): string {
  const head = buildIframeHeadHTML(opts.manifest);
  const tokens = SANDBOX_TOKENS.join(' ');
  // The handshake bootstrap uses `parent.postMessage` because the iframe
  // is `allow-scripts` (NOT `allow-same-origin`), so the iframe gets an
  // opaque origin and `parent.location` is unreadable.  The host origin
  // is passed in explicitly so we don't fall back to '*' (which would
  // leak the manifest to any frame ancestor).
  const handshakeBootstrap = `
    (function() {
      'use strict';
      var hostOrigin = ${JSON.stringify(opts.hostOriginForHandshake)};
      var manifestId = ${JSON.stringify(opts.manifest.id)};
      window.__pryzm_post = function(msg) { parent.postMessage(msg, hostOrigin); };
      window.addEventListener('message', function(ev) {
        if (ev.origin !== hostOrigin) return;
        if (!ev.data || typeof ev.data.kind !== 'string') return;
        if (ev.data.kind === 'pryzm/handshake' && ev.data.v === 1) {
          window.__pryzm_post({ kind: 'pryzm/handshake-ack' });
        }
      }, false);
    })();
  `;
  return [
    `<!DOCTYPE html>`,
    `<html data-sandbox-tokens="${tokens}">`,
    `<head>`,
    head,
    `</head>`,
    `<body>`,
    `<div id="pryzm-plugin-root"></div>`,
    `<script>${handshakeBootstrap}</script>`,
    `<script>${opts.bundleSource}</script>`,
    `</body>`,
    `</html>`,
  ].join('\n');
}

/** The message kinds a plugin is allowed to SEND to the host.  The host
 *  drops anything else without raising an error in the iframe (which
 *  would let a malicious plugin probe the host's switch tables). */
export const PLUGIN_ALLOWED_OUTBOUND_KINDS: readonly SandboxMessageKind[] = [
  'pryzm/handshake-ack',
  'pryzm/host-call',
  'pryzm/host-response',
  'pryzm/log',
];

/** The message kinds the host sends to the plugin. */
export const HOST_ALLOWED_OUTBOUND_KINDS: readonly SandboxMessageKind[] = [
  'pryzm/handshake',
  'pryzm/activate',
  'pryzm/deactivate',
  'pryzm/host-response',
  'pryzm/host-event',
];

/**
 * Pure validator for inbound messages on the host side.  Returns `true`
 * if the message has a known kind and the plugin is allowed to send it.
 * The host uses this to drop malformed / spoofed messages before they
 * reach the proxy dispatch layer.
 */
export function isAllowedFromPlugin(value: unknown): value is SandboxMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { kind?: unknown };
  if (typeof v.kind !== 'string') return false;
  return PLUGIN_ALLOWED_OUTBOUND_KINDS.includes(v.kind as SandboxMessageKind);
}

/** Inverse: allowed-from-host validator (used by the iframe bootstrap
 *  in tests). */
export function isAllowedFromHost(value: unknown): value is SandboxMessage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { kind?: unknown };
  if (typeof v.kind !== 'string') return false;
  return HOST_ALLOWED_OUTBOUND_KINDS.includes(v.kind as SandboxMessageKind);
}
