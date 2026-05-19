# @pryzm/sdk — CHANGELOG

> Published as `@pryzm/sdk` on npm (internal workspace name: `@pryzm/plugin-sdk`).  
> Schema lock: ADR-0038. Breaking changes require v2.0.0 + 1-year deprecation cycle.

---

## [1.0.0] — 2026-05-03 (Wave A20 / Phase F)

### Summary
K3-C gate closed. All three pre-publish audits pass:
- Gate #1: `k3c-sandbox-audit.ts` → 46/46 plugins signed ✅
- Gate #2: `k3c-plugin-parity-check.ts` → 22/22 proxy+lifecycle+sandbox checks ✅  
- Gate #3: `k3c-api-surface-diff.ts` → 26/26 locked symbols, 0 breaking changes ✅

This release closes **convergence boolean #7** (`plugin_sdk_published == true`).

### What is `@pryzm/sdk`?
`@pryzm/sdk` is the curated public facade of PRYZM's plugin architecture. Plugin authors use it
to build browser-native BIM plugins that run inside the PRYZM editor sandbox.

### Stable public API (v1 — locked per ADR-0038)

#### Descriptor schema (`@pryzm/sdk/descriptor`)
- `PluginManifest` / `PluginDescriptor` — zod-validated plugin manifest
- `PluginPermission` — 7 permission types (read:project, write:project, read:user, network:fetch, register:tool, register:panel, register:command)
- `PluginContribution` — 5 contribution kinds (tool, panel, command, menu-item, keyboard-shortcut)
- `validateManifest(raw)` — runtime validator

#### Host proxies (`@pryzm/sdk/hosts`)
- `CommandProxy` — `dispatch(command)` — the only write path into the PRYZM runtime
- `StoreProxy` — read-only subscriptions to ElementStore, ProjectStore, ViewStore
- `ViewProxy` — register / unregister panels and toolbar items
- `FileProxy` — open / save auxiliary files
- `AIProxy` — submit AI requests; receive intent deltas
- `NetworkProxy` — fetch from CSP-allowlisted external endpoints

#### Sandbox (`@pryzm/sdk/sandbox`)
- `buildPluginCSP(manifest)` — Content-Security-Policy header for plugin iframe
- `buildIframeHeadHTML(manifest)` — iframe `<head>` with correct CSP meta tag
- `buildIframeSrcdoc(manifest, entrypointUrl)` — full srcdoc for sandboxed plugin iframe

#### Ed25519 signing (`@pryzm/sdk/signing`)
- `signPlugin(bundle, privateKey)` — sign a plugin bundle with Ed25519
- `verifyPluginSignature(bundle, signature, publicKey)` — verify before install

#### Lifecycle hooks (`@pryzm/sdk/lifecycle`)
- `onActivate(fn)` / `onDeactivate(fn)` / `onProjectOpen(fn)` / `onProjectClose(fn)`
- `createPlugin(descriptor, setup)` — main plugin factory

#### Dev CLI (`@pryzm/sdk/dev`)
- `pryzm dev` — starts a local plugin dev server with hot reload
- `pryzm build` — bundles the plugin to a distributable
- `pryzm publish` — signs and submits to the PRYZM marketplace

### Upgrade guide (rc.1 → 1.0.0)
No breaking changes from `1.0.0-rc.1`. All symbols present in rc.1 are present in 1.0.0
with identical signatures (verified by `k3c-api-surface-diff.ts`). Simply update your
dependency from `"@pryzm/plugin-sdk": "workspace:*"` to `"@pryzm/sdk": "^1.0.0"`.

---

## [1.0.0-rc.1] — 2026-05-02 (Wave A19 pre-publish prep)

Initial release candidate. K3-C gate scripts created and verified passing.
SDK is workspace-only in this release; npm publish is Phase F (Wave A20).

### Added
- Full descriptor schema with zod validation (ADR-0038 §Schema)
- 6 host proxies: Command, Store, View, File, AI, Network
- Ed25519 signing + iframe sandbox (CSP level 3)
- `pryzm dev` CLI scaffolded
- 46-plugin parity check passes
- 22/22 proxy+lifecycle+sandbox API surface checks pass
