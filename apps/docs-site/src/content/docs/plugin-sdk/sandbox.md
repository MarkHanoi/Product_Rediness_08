---
title: Sandbox Model
description: How PRYZM isolates plugin code with iframe sandbox + CSP, and what an audited 14-vector escape suite asserts.
---

# Sandbox Model

Every PRYZM plugin runs inside an isolated iframe with strict
Content-Security-Policy headers. This page documents what the host
enforces and what cannot happen as a result.

## The iframe

```html
<iframe sandbox="allow-scripts" srcdoc="<!DOCTYPE html>...">
```

The `sandbox` attribute carries **only** `allow-scripts`. Notably absent:

| Token | Why we don't include it |
|---|---|
| `allow-same-origin` | Would let the plugin read the host's localStorage, cookies, and DOM. |
| `allow-top-navigation` | Would let the plugin redirect the user away from PRYZM. |
| `allow-popups-to-escape-sandbox` | Would give popup windows full top-level browser context. |
| `allow-modals` | Plugins are panels, not dialogs; modals are reserved for the host. |
| `allow-storage-access-by-user-activation` | No Storage Access API — the plugin must not see cross-site cookies. |

The set is the lock-list `SANDBOX_TOKENS` in
`@pryzm/plugin-sdk/sandbox`; CI asserts it never grows.

## The CSP

The iframe document carries a strict CSP via a `<meta http-equiv>` tag
emitted as the first child of `<head>`:

```
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'none' | <allowedOrigins joined>;
frame-src 'none';
worker-src 'none';
object-src 'none';
base-uri 'self';
form-action 'none';
frame-ancestors 'self';
```

The `connect-src` directive is the only permission-sensitive one:

| Manifest | `connect-src` value |
|---|---|
| no `network:fetch` | `'none'` (every `fetch` / XHR / WS rejects) |
| `network:fetch` + `allowedOrigins: ['https://api.x.com']` | `https://api.x.com` (only that origin reachable) |
| `network:fetch` + `allowedOrigins: []` (rejected at manifest validation, but if it slipped through) | `'none'` (defence in depth) |

## Wire envelope

The plugin and host communicate over `postMessage`. The kinds are typed
in `@pryzm/plugin-sdk/sandbox` as `SandboxMessage`:

```ts
| 'pryzm/handshake'      // host → plugin (initial)
| 'pryzm/handshake-ack'  // plugin → host
| 'pryzm/activate'       // host → plugin (triggers onActivate)
| 'pryzm/deactivate'     // host → plugin
| 'pryzm/host-call'      // plugin → host (proxy method invocation)
| 'pryzm/host-response'  // either direction
| 'pryzm/host-event'     // host → plugin (subscriptions)
| 'pryzm/log'            // plugin → host
```

`isAllowedFromPlugin(msg)` and `isAllowedFromHost(msg)` are pure
direction validators. Unknown kinds are dropped silently — never
errored back — to deny attackers a probe surface against the host's
switch tables.

## The escape-vector audit suite

`@pryzm/plugin-sdk/sandbox` exports `ESCAPE_VECTORS`: a typed array of
known attack patterns. Each vector has an `assertReject(env)` that
**throws** iff the SDK FAILED to reject the escape attempt (i.e. the
plugin escaped). The vitest suite at
`packages/plugin-sdk/__tests__/escape-tests.test.ts` walks the array
and asserts each vector remains rejected.

The suite covers four categories:

| Category | Examples |
|---|---|
| `csp-bypass` | `connect-src` defaults to none; `connect-src` restricted to `allowedOrigins` when `network:fetch` granted; `frame-src` and `worker-src` locked. |
| `wire-spoof` | Plugin cannot send `pryzm/host-event`, `pryzm/activate`, `pryzm/deactivate`, or unknown kinds; spoofed handshakes rejected. |
| `sandbox-token-leak` | `SANDBOX_TOKENS` never grows to include `allow-same-origin`, `allow-top-navigation`, or `allow-popups-to-escape-sandbox`. |
| `permission-bypass` | Manifest with `network:fetch` and empty `allowedOrigins` is rejected at validation; CSP defence-in-depth even if a manifest slipped through. |

## The K3-C kill-switch

Each lifecycle hook (`onActivate` / `onDeactivate` / `onUpdate`) gets a
**5-second budget** from `HOOK_TIMEOUT_MS`. If a hook exceeds the budget
the host fires the K3-C kill-switch path: the iframe is unmounted, the
user sees a degraded-mode notice, and the event is logged for K3-C
metrics. A misbehaving plugin cannot freeze the editor.

## Why iframe + CSP rather than a Worker?

[ADR-0038](https://github.com/pryzm-com/pryzm/blob/main/docs/02-decisions/adrs/0038-s62-plugin-sdk-descriptor-schema-lock.md) §Decision B records the trade-off:

- Workers can't render UI; plugins need DOM.
- Workers' `postMessage` boundary is identical to iframes', but workers
  share the parent's origin (no isolation against XS-Leaks).
- Iframes with `sandbox="allow-scripts"` (no `allow-same-origin`) get an
  opaque cross-origin frame — the strongest in-browser isolation.

The trade-off cost is a ~50 KB-per-plugin DOM footprint, accepted as
the cheapest credible isolation primitive.

## See also

- [`packages/plugin-sdk/src/sandbox/`](https://github.com/pryzm-com/pryzm/tree/main/packages/plugin-sdk/src/sandbox) — implementation.
- [`packages/plugin-sdk/__tests__/escape-tests.test.ts`](https://github.com/pryzm-com/pryzm/blob/main/packages/plugin-sdk/__tests__/escape-tests.test.ts) — the audit-suite tests.
- [Permissions](/plugin-sdk/permissions) — the 7 locked permissions.
