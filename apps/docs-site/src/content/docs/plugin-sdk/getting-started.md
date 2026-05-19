---
title: Getting Started
description: From install to a working "Wall Counter" plugin in 10 minutes.
---

# Getting Started

This guide walks you through building a complete PRYZM plugin —
the **Wall Counter**, which adds a sidebar panel that displays the
number of walls in the active project and updates live as walls are
created or deleted.

## Prerequisites

- Node.js ≥ 20.
- A code editor with TypeScript support.
- (Optional) A bundler — we use `tsup` below; `esbuild`, `vite`, or any
  IIFE-format bundler also works.

## 1. Scaffold the plugin

```sh
mkdir wall-counter && cd wall-counter
npm init -y
npm install --save-peer @pryzm/plugin-sdk@next
npm install --save-dev typescript tsup
```

`tsconfig.json`:

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

## 2. Write the manifest

`plugin.manifest.json`:

```json
{
  "pryzmPlugin": "1.0",
  "id": "wall-counter",
  "version": "0.1.0",
  "displayName": "Wall Counter",
  "description": "Counts walls in the active project and shows the total in a panel.",
  "author": "You",
  "main": "dist/index.global.js",
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

Validate it before going further:

```sh
npx pryzm dev --manifest plugin.manifest.json --once
# → ✓ wall-counter@0.1.0 (2 perms, 1 contribs) — 18.4 ms
```

If validation fails, the CLI prints the exact dot-path of the bad field.

## 3. Write the entry point

`src/index.ts`:

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

## 4. Build

```sh
npx tsup src/index.ts --format iife --out-dir dist --target es2022
# → dist/index.global.js
```

The plugin runs inside a sandboxed iframe with no module-loader, so
build with `--format iife` (or any format that produces a single file
with no imports).

## 5. Run with `pryzm dev`

```sh
npx pryzm dev \
  --manifest plugin.manifest.json \
  --bundle dist/index.global.js \
  --build-cmd "npx tsup src/index.ts --format iife --out-dir dist --target es2022"
```

`pryzm dev` watches your source tree, runs the build command on each
change, validates the manifest, and prints the iframe srcdoc that the
PRYZM editor would mount. The hot-reload loop targets **< 500 ms**.

Try it: edit `src/index.ts` to change the panel `<h3>` to "Wall counter
(live)" and save. The CLI re-validates and re-bundles within ms.

## 6. Test inside PRYZM

Open the editor, go to **Settings → Developer → Local plugins**, and
add the plugin folder. The panel appears in the right sidebar.

Open a project with some walls — the count appears immediately. Add or
delete a wall and watch the count update live.

## 7. Sign + publish (preview)

The marketplace launches in S64. Today you can pre-stage the signature:

```ts
import { readFileSync } from 'node:fs';
import { generateKeyPair, makePluginSignature, sha256OfBytes } from '@pryzm/plugin-sdk/signing';

const kp = await generateKeyPair();
const manifest = JSON.parse(readFileSync('plugin.manifest.json', 'utf-8'));
const tarballBytes = readFileSync('dist/wall-counter-0.1.0.tgz');
const fileSha256 = await sha256OfBytes(tarballBytes);

const signature = await makePluginSignature({
  manifest,
  fileSha256,
  publisherKey: kp,
});
console.log(JSON.stringify(signature, null, 2));
// store kp.privateKeyB64 in your OS keychain
// the marketplace will need kp.publicKeyB64 at publisher-registration time
```

## Where to go next

- **AI Plugin tutorial**: see [Examples → ai-workflow-plugin](/plugin-sdk/examples) for the full walkthrough of a plugin that runs an AI workflow.
- **Manifest reference**: full schema docs at [Manifest](/plugin-sdk/manifest).
- **Permissions deep-dive**: [Permissions](/plugin-sdk/permissions).
- **Sandbox model**: [Sandbox Model](/plugin-sdk/sandbox).
- **Distribution**: [Distribution](/plugin-sdk/distribution) — signing, publishing, revocation.
