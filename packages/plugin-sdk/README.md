# `@pryzm/plugin-sdk` — PRYZM Plugin SDK 1.0

> Build plugins for PRYZM 2: panels, tools, commands, file formats, and AI workflows.

[![npm version (next tag)](https://img.shields.io/badge/npm-1.0.0--rc.1-blue)]()
[![spec](https://img.shields.io/badge/spec-PHASE--3C--Q3-orange)]()
[![ADR](https://img.shields.io/badge/schema--lock-ADR--0038-green)]()

## Install

```sh
npm install @pryzm/plugin-sdk@next   # tracks 1.0.0-rc.x while K3-C audit is in flight
```

The package is published under the `next` dist-tag until the K3-C
sandbox-audit gate closes (per [ADR-0038](../../docs/architecture/adr/0038-s62-plugin-sdk-descriptor-schema-lock.md)
§Decision D).  After that gate clears, the version flips to `1.0.0` on
the `latest` tag and the schema is locked under
[semver](https://semver.org/) for one year minimum.

## Quick start

```sh
mkdir my-plugin && cd my-plugin
cat > plugin.manifest.json <<'JSON'
{
  "pryzmPlugin": "1.0",
  "id": "my-plugin",
  "version": "0.1.0",
  "displayName": "My Plugin",
  "description": "Does a thing.",
  "author": "Me",
  "main": "index.js",
  "license": "MIT",
  "permissions": ["read:project", "register:panel"],
  "allowedOrigins": [],
  "contributions": [
    { "kind": "panel", "id": "my-panel", "location": "sidebar-right", "label": "My Panel" }
  ],
  "minPRYZMVersion": "2.0.0"
}
JSON

cat > index.ts <<'TS'
import { definePlugin } from '@pryzm/plugin-sdk/lifecycle';

export default definePlugin({
  async onActivate(ctx) {
    const root = document.getElementById('pryzm-plugin-root')!;
    root.innerHTML = `<h2>Hello ${ctx.user.displayName ?? 'PRYZM'}</h2>`;
  },
});
TS

npx pryzm dev --once       # validate + print iframe srcdoc
npx pryzm dev              # watch mode (re-validates on every save)
```

## What's in the SDK

| Subpath | What it gives you |
|---|---|
| `@pryzm/plugin-sdk` | Re-exports everything below. |
| `@pryzm/plugin-sdk/descriptor` | `validateManifest()` + `PluginManifestSchema` + `PluginManifest` type. |
| `@pryzm/plugin-sdk/lifecycle` | `definePlugin()` + `PluginLifecycle` + `PluginActivationContext`. |
| `@pryzm/plugin-sdk/hosts` | Host-proxy contracts (`CommandBusProxy`, `StoresProxy`, `ViewsProxy`, `SelectionProxy`, `AiProxy`, `FormatProxy`) + `PluginPermissionError`. |
| `@pryzm/plugin-sdk/sandbox` | CSP builder, iframe srcdoc builder, wire-direction validators, escape-vector audit suite. |
| `@pryzm/plugin-sdk/signing` | Ed25519 sign/verify, `makePluginSignature`, `verifyPluginSignature`, `RevocationList`. |
| `@pryzm/plugin-sdk/dev` | The `pryzm dev` CLI (also installed as the `pryzm` bin entry). |

## The 7 locked permissions

Per [ADR-0038](../../docs/architecture/adr/0038-s62-plugin-sdk-descriptor-schema-lock.md) §Decision A, the v1 permission set is locked:

| Permission | Grants |
|---|---|
| `read:project` | Read element / view / selection state from the host's stores. |
| `write:project` | Dispatch commands via `commandBus.dispatch` AND invoke AI workflows via `ai.runWorkflow`. |
| `read:user` | Read `displayName` + `email` from `ctx.user` (otherwise `null`). |
| `network:fetch` | Make outbound `fetch` calls (CSP-restricted to `allowedOrigins`). |
| `register:tool` | Contribute a viewport tool via the `tool` contribution kind. |
| `register:panel` | Contribute a panel via the `panel` contribution kind. |
| `register:command` | Contribute a command via the `command` kind, OR a file-format importer/exporter via `FormatProxy`. |

Adding a new permission is an additive `1.x` change.  Removing or
narrowing one requires `2.0.0` (the schema is locked for one year).

## The 5 locked contribution kinds

Same lock policy as permissions:

| `kind` | Anchored at |
|---|---|
| `tool` | Toolbar slot (`left` / `right` / `top` / `floating`). |
| `panel` | Panel slot (`properties` / `sidebar-left` / `sidebar-right` / `bottom`). |
| `command` | The command palette + optional keybinding. |
| `element-type` | Adds a new element kind backed by a `.pryzm-family` file. |
| `view-template` | Adds a new view template (e.g. "ground-floor plan with door tags only"). |

File-format plugins use the `command` kind to contribute their menu
entry, then call `FormatProxy.registerImporter` / `registerExporter`
at runtime from inside `onActivate`.

## Sandbox model

Every plugin runs inside an `<iframe sandbox="allow-scripts">` (NO
`allow-same-origin`), so the plugin gets an opaque cross-origin frame.
The iframe document carries a strict CSP whose `connect-src` directive
is gated by the manifest's `permissions` + `allowedOrigins`:

- No `network:fetch` granted → `connect-src 'none'`.
- `network:fetch` + `allowedOrigins: ['https://api.example.com']` → `connect-src https://api.example.com`.

The escape-vector audit suite (`@pryzm/plugin-sdk/sandbox` →
`ESCAPE_VECTORS`) is the regression contract: 14+ vectors covering
csp-bypass, wire-spoof, sandbox-token-leak, and permission-bypass
categories.  Run with `pnpm --filter @pryzm/plugin-sdk test`.

## Signing + revocation (1.0 publish gate)

Plugins published to the marketplace ship with an Ed25519 signature
over `(manifest, sha256(tarball))`.  The marketplace verifies at upload;
the editor re-verifies at install AND every activation, plus checks the
revocation list.

```ts
import { generateKeyPair, makePluginSignature, sha256OfBytes } from '@pryzm/plugin-sdk/signing';

const kp = await generateKeyPair();                      // store kp.privateKeyB64 in OS keychain
const tarballBytes = ...;
const fileSha256 = await sha256OfBytes(tarballBytes);
const signature = await makePluginSignature({
  manifest,
  fileSha256,
  publisherKey: kp,
});
// publish manifest + tarball + signature to the marketplace
```

## Lifecycle hooks (5-second budget per hook)

```ts
import { definePlugin } from '@pryzm/plugin-sdk/lifecycle';

export default definePlugin({
  async onActivate(ctx) { /* mount UI, subscribe to stores */ },
  async onDeactivate() { /* cleanup — host gives 5s before force-unmount */ },
  async onUpdate(prev, next) { /* migrate persisted plugin state */ },
});
```

If a hook exceeds the 5-second budget, the host fires the K3-C
kill-switch path: the iframe is unmounted and the user sees a
degraded-mode notice for that plugin.

## Reference

- Spec: [`phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md`](../../docs/03_PRYZM3/reference/phases/PHASE-3/3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md) §2
- Spec (rev): [`phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md`](../../docs/03_PRYZM3/reference/phases/PHASE-3/3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md) §S62
- Schema lock: [ADR-0038](../../docs/architecture/adr/0038-s62-plugin-sdk-descriptor-schema-lock.md)
- Examples: `examples/hello-plugin/`, `examples/format-plugin/`, `examples/ai-workflow-plugin/`

## License

MIT.
