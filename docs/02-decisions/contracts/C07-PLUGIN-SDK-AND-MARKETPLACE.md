# C07 — Plugin SDK & Marketplace

> **Stamp**: 2026-05-02 · **Refreshed**: 2026-06-01 (counts) · **Status**: CANONICAL  
> **Scope**: `packages/plugin-sdk/` (L8, the public facade), `plugins/*` (L9, **47 plugins**), the plugin sandbox, Ed25519 signing, and `marketplace.pryzm.app`.  
> **References**: [ADR-009] plugin sandbox, [SPEC-09] marketplace, [ADR-001] Pascal architecture.  
> **Phase gate**: Phase F cannot start until ≥ 6/9 convergence booleans are true (C01 §4).

---

## §1 — Layer 8: The SDK Facade

### §1.1 — Purpose

`packages/plugin-sdk/` is a **curated re-export of L0–L7** that defines the stable public contract for plugin authors. It MUST:
- Re-export only the types and functions that are safe to expose externally.
- NOT expose internal implementation details that are subject to change.
- Version independently using semantic versioning.

**Current state (verified 2026-06-01)**: `@pryzm/plugin-sdk` version **`1.0.0`** in `packages/plugin-sdk/package.json` with `publishConfig.name = "@pryzm/sdk"`. 2,067+ LOC, workspace package locally complete; iframe sandbox + Ed25519 signing + 6 host proxies + `pryzm dev` CLI + bSDD lookup client all shipped. **Manual step pending**: `pnpm --filter @pryzm/plugin-sdk publish --access public` (OI-011 — boolean #7 closure).

### §1.2 — What the SDK exposes (the 6 host proxies)

| Host proxy | Provides to plugins |
|---|---|
| `CommandProxy` | `dispatch(command)` — the only write path |
| `StoreProxy` | Read-only subscriptions to `ElementStore`, `ProjectStore`, `ViewStore` |
| `ViewProxy` | Register / unregister panels and toolbar items |
| `FileProxy` | Open / save auxiliary files (assets, configuration) |
| `AIProxy` | Submit AI requests; receive intent deltas |
| `NetworkProxy` | Fetch from allowed external endpoints (via CSP allowlist) |

Plugins MUST NOT call any method not on these proxies. Any call outside the proxy surface is a P1 security violation.

### §1.3 — What the SDK does NOT expose

- The THREE scene graph (P2).
- Direct store writes (P6).
- `requestAnimationFrame` (P3).
- The full `PryzmRuntime` handle (only the typed proxies above).
- Any internal package not in the explicit re-export list.

**CI gate**: `no-direct-pryzm-in-plugins` ESLint rule — hard-fail.

---

## §2 — Layer 7: Plugin Structure

Every plugin in `plugins/` MUST follow the canonical recipe:

```
plugins/<name>/
  package.json        — { "name": "@pryzm/plugin-<name>", "exports": { ".": "./src/index.ts" } }
  src/
    index.ts          — barrel: re-exports all public symbols
    descriptor.ts     — PluginDescriptor (id, name, version, permissions)
    store.ts          — plugin-local Zustand slice (if any)
    handlers/
      index.ts        — command handler registration
      <CommandName>.ts
    tool.ts           — Tool implementation (if any)
    intent.ts         — VisibilityIntent contribution (if any)
    contributions.ts  — what the plugin registers into the runtime
  __tests__/
    *.test.ts         — ≥ 1 test; CI must pass
  vitest.config.ts
```

**Non-stub plugins**: 30 of 30 are recipe-complete as of Wave 12 ✅.
**Intentional stubs** (16): ai-floorplan, ai-generative, ai-query, ai-rules, ai-voice, dxf, export-pdf, floor, geospatial, levels, navigate, render, visibility-intent, ifc-import, ifc-inspector, rhino-import — Phase F or later.

### §2.1 — Plugin invariants

- A plugin MUST NOT import from `@pryzm/*` packages directly (only via `@pryzm/plugin-sdk`).
- A plugin MUST declare all permissions it needs in its `descriptor.ts`.
- A plugin MUST have at least one passing test in CI.
- A plugin MUST be disposable: calling `plugin.dispose()` MUST unregister all contributions and subscriptions.

---

## §3 — Plugin Sandbox

Third-party plugins (not in the official `plugins/` directory) MUST run in an iframe sandbox. The sandbox contract:

- Each plugin runs in a dedicated `<iframe sandbox="allow-scripts">`.
- Communication uses a structured-clone-compatible message protocol (no shared memory).
- The host proxies (§1.2) are the only communication surface: the plugin posts typed messages; the host validates and executes them.
- Plugins MUST be signed with an Ed25519 key. The signing workflow is part of the `pryzm dev` CLI.
- An unsigned or signature-mismatch plugin MUST be rejected at install time with a clear user error.
- Sandbox CPU overhead MUST be < 5% vs a native function call (NFT 17, `plugin-sandbox-overhead.bench.ts`).

### §3.1 — Permission model

Permissions are declared in `descriptor.ts` and shown to the user at install time:

| Permission | What it grants |
|---|---|
| `elements.read` | StoreProxy access to ElementStore |
| `elements.write` | CommandProxy dispatch for element mutations |
| `views.panel` | Register a docked panel |
| `ai.submit` | AIProxy submit requests |
| `network.<hostname>` | NetworkProxy fetch to the declared host |

Permissions MUST be minimally scoped. A plugin requesting `elements.write` but only using `elements.read` fails the marketplace review.

---

## §4 — Marketplace

`marketplace.pryzm.app` is the distribution channel for third-party plugins (Differentiator D4). Revenue share: **30/70** (PRYZM 30%, developer 70%).

### §4.1 — Publish contract

1. Developer runs `pryzm publish` via the CLI.
2. CLI bundles the plugin, signs with Ed25519, submits to the marketplace API.
3. Marketplace review checks: valid signature, declared permissions match actual SDK calls, ≥ 1 passing test, bundle < 5 MB.
4. On approval, the plugin is available to install from the in-app marketplace panel.

### §4.2 — Install contract

1. User installs from the marketplace panel.
2. The host downloads the signed bundle, verifies the Ed25519 signature against the developer's registered public key.
3. The bundle is stored in `IndexedDB` for offline use.
4. The plugin is activated in its sandbox on next project open.

**Phase gate**: Marketplace is a Phase F deliverable (convergence boolean #9).

---

## §5 — First-party plugins

The 47 plugins in `plugins/` are first-party (developed by the PRYZM team). They MAY import from `@pryzm/plugin-sdk` or, during the transitional period, from lower layers directly — tracked by `eslint-plugin-pryzm` boundary rule (target: 0 ✅ achieved Wave 12). With the SDK now at v1.0.0, even first-party plugins MUST use only the SDK surface.

---

## §6 — Iframe embed mode (Wave A20-T11)

PRYZM 3 supports embedding the editor in a third-party webpage or document management system via a frameable `GET /embed` route.

### §6.1 — Embed endpoint

- **Route**: `GET /embed?projectId=<id>&token=<jwt>`
- **Auth**: Bearer token OR `?token=` query param (same JWT as REST API)
- **Response**: Minimal HTML shell that bootstraps the editor with the project pre-loaded
- **Frame policy**: `X-Frame-Options: ALLOWALL` (production: `ALLOW-FROM <trusted-origin>`)
- **CSP**: `default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' wss: ws:`

### §6.2 — Embed constraints

1. The embed shell omits the top navigation bar and project hub (editor workspace only).
2. Plugins MAY run inside the embed, subject to the same sandbox CSP as in the full editor.
3. Collaborative presence (multiplayer) works inside the embed frame.
4. The `data-embed="1"` attribute on `#pryzm-embed-root` lets plugins detect the embed context.

### §6.3 — Phase gate

Embed mode is a Phase F deliverable (Wave A20-T11). The `/embed` route returns HTTP 200 with a valid HTML shell as of Wave A20.

---

## §7 — PWA (Progressive Web App) requirements (Wave A20-T16–T19)

PRYZM 3 must be installable as a Progressive Web App on all major platforms (Chrome, Edge, Safari, Firefox Android).

### §7.1 — Manifest requirements

File: `public/manifest.json`

| Field | Required value |
|---|---|
| `name` | `"PRYZM 3 — BIM Editor"` |
| `short_name` | `"PRYZM"` |
| `start_url` | `"/"` |
| `display` | `"standalone"` |
| `theme_color` | `"#1e3a5f"` |
| `icons` | 192×192 + 512×512 PNG, purpose `"any maskable"` |

### §7.2 — Service worker requirements

File: `public/sw.js`

| Route pattern | Strategy |
|---|---|
| `/` · `/index.html` · `/manifest.json` | Cache-first (app shell) |
| `/api/*` · `/v1/*` | Network-first, offline returns `{error: 'offline', code: 'OFFLINE_MODE'}` |
| `/assets/*` (Vite-hashed) | Cache-first (immutable) |
| Everything else | Network-first, cache on success; navigate falls back to `/` |

Background sync tag: `pryzm-pending-commands` → flushes queued commands via `SW_FLUSH_PENDING_COMMANDS` postMessage.

### §7.3 — Registration requirements

- SW registered in `src/main.ts` via `navigator.serviceWorker.register('/sw.js', { scope: '/' })`
- Registration is **skipped in development** (`import.meta.env.DEV`) unless `?sw=1` query param is present
- SW scope must be `/` (top-level, same-origin)
- Update notifications must be surfaced when a new SW version installs

### §7.4 — HTML manifest link

`index.html` must include:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1e3a5f" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

### §7.5 — Phase gate

PWA requirements are Phase F deliverables (Wave A20-T16–T20). Verified by E2E test 12 (`tests/e2e/pwa-install.spec.ts`). Closes gap **G11** (Mobile/PWA) from `00-PROCESS-TRACKER.md`.
