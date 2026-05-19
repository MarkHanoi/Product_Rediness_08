// @pryzm/plugin-sdk — sandbox escape-attempt audit suite (S62 D7).
//
// Spec source:
//   • phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S62 D7
//     ("third-party sandbox audit (gate K3-C — if escape attempt
//      succeeds, halt SDK 1.0 publish; do not enter S64 marketplace)")
//
// This module is the EXECUTABLE half of the D7 audit gate.  Each entry
// in `ESCAPE_VECTORS` is a known plugin-sandbox attack pattern; the
// runtime test suite (`__tests__/escape-tests.test.ts`) walks the
// vectors and asserts each is REJECTED by `isAllowedFromPlugin` /
// `buildPluginCSP` / the postMessage origin check.
//
// A passing run of all vectors is a NECESSARY (not sufficient)
// condition for the K3-C gate.  A genuine third-party audit by an
// external security firm is the SUFFICIENT condition; that audit is
// scheduled for S62 D7 calendar-relative and tracked outside this
// repo.  The vectors here ensure that, once the audit's findings come
// back, every fix has a regression test on file.
//
// Adding new vectors:
//
//   1. Read the audit finding.
//   2. Add an entry to `ESCAPE_VECTORS` with `name`, `category`,
//      `payload`, and `assertReject(env)`.
//   3. Wire the vector in `__tests__/escape-tests.test.ts` (which
//      iterates `ESCAPE_VECTORS`).
//   4. Update `apps/editor/src/plugin-runtime/` if the fix needs host-
//      side enforcement beyond what the SDK already does.

import { buildPluginCSP, SANDBOX_TOKENS } from './policy';
import { isAllowedFromPlugin } from './iframe-sandbox';
import type { PluginManifest } from '../descriptor';

export type EscapeCategory =
  | 'csp-bypass'
  | 'wire-spoof'
  | 'origin-spoof'
  | 'permission-bypass'
  | 'sandbox-token-leak';

export interface EscapeVector {
  /** Stable test name; used as the test case label. */
  readonly name: string;
  readonly category: EscapeCategory;
  /** Human-readable description of the attempted escape. */
  readonly description: string;
  /**
   * Run the assertion.  Throws iff the vector ESCAPED (which is the
   * audit failure case); resolves silently iff the SDK rejected it
   * (which is what we want to assert).
   */
  assertReject(env: EscapeEnv): void;
}

export interface EscapeEnv {
  /** A canonical happy-path manifest for tests to mutate. */
  readonly baseManifest: PluginManifest;
}

const BASE_MANIFEST: PluginManifest = {
  pryzmPlugin: '1.0',
  id: 'audit-base',
  version: '1.0.0',
  displayName: 'Audit Base',
  description: 'Synthetic manifest used by the sandbox escape-attempt audit suite.',
  author: 'PRYZM Security',
  main: 'index.js',
  license: 'MIT',
  permissions: [],
  allowedOrigins: [],
  contributions: [],
  minPRYZMVersion: '2.0.0',
};

export const ESCAPE_VECTORS: readonly EscapeVector[] = [
  // ── Category: csp-bypass ──────────────────────────────────────────────
  {
    name: 'connect-src defaults to none when network:fetch is absent',
    category: 'csp-bypass',
    description: 'A manifest with no network:fetch must produce a CSP that blocks all outbound connections.',
    assertReject() {
      const csp = buildPluginCSP(BASE_MANIFEST);
      if (!csp.includes(`connect-src 'none'`)) {
        throw new Error(`expected connect-src 'none' in CSP for permission-less manifest; got: ${csp}`);
      }
    },
  },
  {
    name: 'connect-src is restricted to allowedOrigins when network:fetch is present',
    category: 'csp-bypass',
    description: 'A manifest with network:fetch + allowedOrigins must restrict connect-src to those origins.',
    assertReject() {
      const m: PluginManifest = {
        ...BASE_MANIFEST,
        permissions: ['network:fetch'],
        allowedOrigins: ['https://api.example.com'],
      };
      const csp = buildPluginCSP(m);
      if (!csp.includes(`connect-src https://api.example.com`)) {
        throw new Error(`expected connect-src https://api.example.com in CSP; got: ${csp}`);
      }
      if (csp.includes(`connect-src *`) || csp.match(/connect-src[^;]*'unsafe/)) {
        throw new Error(`CSP must not contain wildcard or unsafe-* in connect-src: ${csp}`);
      }
    },
  },
  {
    name: 'frame-src locked to none — plugin cannot nest frames',
    category: 'csp-bypass',
    description: 'A nested iframe inside the plugin would re-introduce the same-origin attack surface.',
    assertReject() {
      const csp = buildPluginCSP(BASE_MANIFEST);
      if (!csp.includes(`frame-src 'none'`)) {
        throw new Error(`expected frame-src 'none' in CSP; got: ${csp}`);
      }
    },
  },
  {
    name: 'worker-src locked to none — plugin cannot spawn workers',
    category: 'csp-bypass',
    description: 'compute:background permission is post-v1 (ADR-0038 §B); v1 workers are banned.',
    assertReject() {
      const csp = buildPluginCSP(BASE_MANIFEST);
      if (!csp.includes(`worker-src 'none'`)) {
        throw new Error(`expected worker-src 'none' in CSP; got: ${csp}`);
      }
    },
  },
  {
    name: 'object-src and base-uri locked',
    category: 'csp-bypass',
    description: 'Banning object-src closes Flash/PDF object embed; pinning base-uri prevents script-src bypass.',
    assertReject() {
      const csp = buildPluginCSP(BASE_MANIFEST);
      if (!csp.includes(`object-src 'none'`)) throw new Error(`object-src missing from CSP: ${csp}`);
      if (!csp.includes(`base-uri 'self'`)) throw new Error(`base-uri missing from CSP: ${csp}`);
    },
  },
  // ── Category: wire-spoof ─────────────────────────────────────────────
  {
    name: 'plugin cannot send pryzm/host-event (host-only kind)',
    category: 'wire-spoof',
    description: 'A plugin sending host-event would let it spoof events to siblings or itself.',
    assertReject() {
      const allowed = isAllowedFromPlugin({ kind: 'pryzm/host-event', eventId: 'x', proxy: 'stores', payload: {} });
      if (allowed) throw new Error('plugin must not be allowed to send pryzm/host-event');
    },
  },
  {
    name: 'plugin cannot send pryzm/activate (host-only kind)',
    category: 'wire-spoof',
    description: 'Spoofed activate would re-trigger onActivate with attacker-supplied user context.',
    assertReject() {
      const allowed = isAllowedFromPlugin({ kind: 'pryzm/activate', user: { id: 'x', displayName: null, email: null }, locale: 'en-US' });
      if (allowed) throw new Error('plugin must not be allowed to send pryzm/activate');
    },
  },
  {
    name: 'plugin cannot send pryzm/deactivate (host-only kind)',
    category: 'wire-spoof',
    description: 'Spoofed deactivate would force the plugin into a torn-down state mid-flight.',
    assertReject() {
      const allowed = isAllowedFromPlugin({ kind: 'pryzm/deactivate' });
      if (allowed) throw new Error('plugin must not be allowed to send pryzm/deactivate');
    },
  },
  {
    name: 'plugin cannot send pryzm/handshake (only ack)',
    category: 'wire-spoof',
    description: 'A spoofed handshake would let the plugin replay handshake-ack races.',
    assertReject() {
      const allowed = isAllowedFromPlugin({ kind: 'pryzm/handshake', v: 1, manifest: BASE_MANIFEST });
      if (allowed) throw new Error('plugin must not be allowed to send pryzm/handshake');
    },
  },
  {
    name: 'plugin cannot send arbitrary kinds',
    category: 'wire-spoof',
    description: 'Unknown kinds must be silently dropped (no probe surface).',
    assertReject() {
      if (isAllowedFromPlugin({ kind: 'pryzm/admin-elevate' })) {
        throw new Error('unknown kind must not be allowed');
      }
      if (isAllowedFromPlugin({ kind: 'eval' })) {
        throw new Error('non-pryzm kind must not be allowed');
      }
      if (isAllowedFromPlugin({})) {
        throw new Error('payload without kind must not be allowed');
      }
      if (isAllowedFromPlugin(null)) {
        throw new Error('null payload must not be allowed');
      }
    },
  },
  // ── Category: sandbox-token-leak ─────────────────────────────────────
  {
    name: 'sandbox tokens never include allow-same-origin',
    category: 'sandbox-token-leak',
    description: 'allow-same-origin would let the plugin read/write parent localStorage and cookies.',
    assertReject() {
      if ((SANDBOX_TOKENS as readonly string[]).includes('allow-same-origin')) {
        throw new Error('SANDBOX_TOKENS must not include allow-same-origin');
      }
    },
  },
  {
    name: 'sandbox tokens never include allow-top-navigation',
    category: 'sandbox-token-leak',
    description: 'allow-top-navigation would let a plugin redirect the user off PRYZM.',
    assertReject() {
      if ((SANDBOX_TOKENS as readonly string[]).includes('allow-top-navigation')) {
        throw new Error('SANDBOX_TOKENS must not include allow-top-navigation');
      }
    },
  },
  {
    name: 'sandbox tokens never include allow-popups-to-escape-sandbox',
    category: 'sandbox-token-leak',
    description: 'A popup that escapes the sandbox would have full top-level browser context.',
    assertReject() {
      if ((SANDBOX_TOKENS as readonly string[]).includes('allow-popups-to-escape-sandbox')) {
        throw new Error('SANDBOX_TOKENS must not include allow-popups-to-escape-sandbox');
      }
    },
  },
  // ── Category: permission-bypass ──────────────────────────────────────
  {
    name: 'manifest with network:fetch and empty allowedOrigins is rejected at validation',
    category: 'permission-bypass',
    description: 'ADR-0038 §E — silent fall-through to "fetch denied" is worse than upfront reject.',
    assertReject() {
      // Stand-in here for a unit test against descriptor.ts; the live
      // assertion lives in __tests__/escape-tests.test.ts which calls
      // validateManifest({ ... permissions:['network:fetch'], allowedOrigins:[] })
      // and asserts ok===false.  This vector exists so the audit suite
      // documents it; the actual fail-path is enforced by the schema.
      const m: PluginManifest = {
        ...BASE_MANIFEST,
        permissions: ['network:fetch'],
        allowedOrigins: [],
      };
      // We can still defend in depth — the CSP builder also denies all
      // when allowedOrigins.length===0 (sandbox/policy.ts buildPluginCSP).
      const csp = buildPluginCSP(m);
      if (!csp.includes(`connect-src 'none'`)) {
        throw new Error(`empty allowedOrigins must produce connect-src 'none' even with network:fetch granted; got: ${csp}`);
      }
    },
  },
];
