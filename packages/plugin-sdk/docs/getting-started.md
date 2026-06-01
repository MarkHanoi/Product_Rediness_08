# Getting Started — `@pryzm/plugin-sdk`

This guide walks you from "no PRYZM plugin yet" to "a working plugin
running in `pryzm dev`" in about 10 minutes.

## Prerequisites

- Node.js ≥ 20 (the SDK uses `node:crypto` Ed25519 and recursive
  `fs.watch`, both of which require Node 20+).
- A code editor with TypeScript support.
- (Optional) A bundler like `tsup` or `esbuild` if you want to write
  TypeScript that ships as a single JS file for the iframe.

## Step 1 — scaffold the plugin

```sh
mkdir wall-counter && cd wall-counter
npm init -y
npm install --save-peer @pryzm/plugin-sdk@next
npm install --save-dev typescript tsup
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

## Step 2 — write the manifest

Create `plugin.manifest.json`:

```json
{
  "pryzmPlugin": "1.0",
  "id": "wall-counter",
  "version": "0.1.0",
  "displayName": "Wall Counter",
  "description": "Counts walls in the active project and shows the total in a panel.",
  "author": "You",
  "main": "dist/index.js",
  "license": "MIT",
  "permissions": ["read:project", "register:panel"],
  "allowedOrigins": [],
  "contributions": [
    {
      "kind": "panel",
      "id": "wall-counter-panel",
      "location": "sidebar-right",
      "label": "Wall Counter"
    }
  ],
  "minPRYZMVersion": "2.0.0"
}
```

Validate it:

```sh
npx pryzm dev --manifest plugin.manifest.json --once
# → ✓ wall-counter@0.1.0 (2 perms, 1 contribs) — 18.4 ms
```

If validation fails, the CLI prints the exact dot-path of the bad field
(e.g. `permissions.0: Invalid enum value`); fix and rerun.

## Step 3 — write the entry point

Create `src/index.ts`:

```ts
import { definePlugin } from '@pryzm/plugin-sdk/lifecycle';
import type { StoreSubscription } from '@pryzm/plugin-sdk/hosts';

let storeSub: StoreSubscription | null = null;
let panelEl: HTMLElement | null = null;

export default definePlugin({
  async onActivate(ctx) {
    const root = document.getElementById('pryzm-plugin-root');
    if (!root) throw new Error('host did not inject sandbox bootstrap');

    panelEl = document.createElement('div');
    panelEl.style.cssText = 'font:14px sans-serif;padding:12px';
    panelEl.innerHTML = '<h3>Wall count</h3><p id="count">…</p>';
    root.appendChild(panelEl);

    const refresh = async () => {
      const { elements } = await ctx.hosts.stores.getElements({ kind: 'wall' });
      const el = document.getElementById('count');
      if (el) el.textContent = `${elements.length} wall${elements.length === 1 ? '' : 's'}`;
    };

    await refresh();
    storeSub = ctx.hosts.stores.subscribe((event) => {
      if (event.changedKinds.includes('wall')) void refresh();
    });
  },

  async onDeactivate() {
    storeSub?.unsubscribe();
    storeSub = null;
    panelEl?.remove();
    panelEl = null;
  },
});
```

## Step 4 — build

```sh
npx tsup src/index.ts --format iife --out-dir dist --target es2022
# → dist/index.global.js
```

The plugin runs inside a sandboxed iframe with no module-loader, so
build with `--format iife` (or any format that produces a single file
with no imports).

## Step 5 — run with `pryzm dev`

```sh
npx pryzm dev \
  --manifest plugin.manifest.json \
  --bundle dist/index.global.js \
  --build-cmd "npx tsup src/index.ts --format iife --out-dir dist --target es2022"
```

`pryzm dev` watches your source tree, runs the build command on each
change, validates the manifest, and prints the iframe srcdoc that the
PRYZM editor would mount.  The hot-reload loop targets < 500 ms per
[phase-doc-1 line 1248](../../docs/archive/pryzm3-internal/reference/phases/PHASE-3/3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md).

## Step 6 — sign + publish (preview)

The marketplace launches in S64.  Today (S62/S63) you can pre-stage the
signature:

```ts
import { readFileSync } from 'node:fs';
import { generateKeyPair, makePluginSignature, sha256OfBytes } from '@pryzm/plugin-sdk/signing';

const kp = await generateKeyPair();
const manifest = JSON.parse(readFileSync('plugin.manifest.json', 'utf-8'));
const tarballBytes = readFileSync('dist/wall-counter-0.1.0.tgz');
const fileSha256 = await sha256OfBytes(tarballBytes);
const signature = await makePluginSignature({ manifest, fileSha256, publisherKey: kp });
console.log(JSON.stringify(signature, null, 2));
// store kp.privateKeyB64 in your OS keychain — the marketplace will need
// kp.publicKeyB64 at publisher-registration time
```

## Where to go next

- **Permission deep-dive**: [README.md](../README.md) §"The 7 locked permissions"
- **Sandbox model**: [README.md](../README.md) §"Sandbox model"
- **Working examples**: `examples/hello-plugin/`, `examples/format-plugin/`, `examples/ai-workflow-plugin/`
- **Schema reference**: `src/descriptor.ts` — every field is documented inline
- **Marketplace publish flow**: see S64 docs once they ship
