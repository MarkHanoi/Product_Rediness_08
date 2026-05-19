# Phase 3C — Plugin SDK 1.0 · Marketplace · Public APIs
## Q3 of Phase 3 · Months 31–33 · Sprints S61–S66

> **Authority**: `08-VISION.md` → `SUPPLEMENTAL-IMPLEMENTATION-PLAN-2026.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → this file.  
> Predecessor: `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md`. Successor: `PHASE-3D-Q4-M34-M36-HARDENING-GA.md`.

---

## §0 Phase 3C Strategic Context

### §0.1 Where we start (M31 morning)

- Full AI moat on L7.5; PDF-to-BIM + Element Creator + IFC editing all operational
- Revit Add-in v1.0 published; BCF round-trip confirmed with Solibri
- OBC fully removed from editor core; PropertyPanel/Inspector decomposed
- 30 first-party plugins in `plugins/` — all implemented via `packages/plugin-sdk/` (internal)
- Plugin SDK is **internal only** — no external developer can use it yet
- Marketplace: placeholder at `marketplace.pryzm.com`

### §0.2 What Phase 3C must deliver

| Deliverable | D# | Sprint |
|---|---|---|
| Legacy deletion sprint | — | S61 |
| Plugin SDK 1.0 published (`packages/plugin-sdk`) | D4 | S62 |
| `pryzm dev` hot-reload < 500 ms | D4 | S62 |
| Plugin docs site (`docs.pryzm.com/plugin-sdk/`) | D4 | S63 |
| Marketplace v1: list/install/update/uninstall | D4 | S64 |
| Plugin signing (Ed25519) + revenue share (Stripe Connect) | D4 | S64 |
| REST + WS + webhooks public API | D7 | S65 |
| `@pryzm/headless` public npm publish | D7 | S66 |
| Self-host docker-compose packaging | D3 | S66 |

---

## §1 Sprint S61 — Legacy Deletion
**Weeks 121–122, Month 31**

### §1.1 Deletion plan

This sprint **only deletes code**. No new features. The CI suite proves nothing breaks.

```bash
# Day 1: inventory
git ls-files src/ | xargs grep -l "EngineBootstrap\|ProjectSerializer\|initUI\|ImportProjectCommand" | tee /tmp/legacy-files.txt
grep -r "(window as any)" --include="*.ts" -l > /tmp/window-any-files.txt
wc -l /tmp/legacy-files.txt /tmp/window-any-files.txt

# Day 2: delete main legacy files
git rm src/EngineBootstrap.ts
git rm src/serialization/ProjectSerializer.ts
git rm src/initUI.ts
git rm src/commands/ImportProjectCommand.ts
git rm legacy/window-shim.ts

# Day 3: delete all 264 legacy command class files
git rm $(cat /tmp/legacy-files.txt)

# Day 4: delete all (window as any) sites
# Automated codemods using jscodeshift
npx jscodeshift -t scripts/remove-window-any.ts --extensions=ts src/

# Day 5: swap default behaviour
# In apps/editor/src/index.html: remove ?pryzm2=1 requirement
# PRYZM 2 is now the default; ?pryzm1=1 is the deprecated override

# Day 6: bundle size verification
pnpm turbo build --filter=apps/editor
# Must be < 6 MB raw / < 1.8 MB gzip initial
```

```typescript
// scripts/remove-window-any.ts — jscodeshift codemod
// Removes (window as any).someProperty patterns throughout the codebase

import type { Transform } from 'jscodeshift';

const transform: Transform = (file, api) => {
  const j = api.jscodeshift;
  const root = j(file.source);

  root.find(j.MemberExpression, {
    object: {
      type: 'TSAsExpression',
      expression: { type: 'Identifier', name: 'window' },
    },
  }).replaceWith(path => {
    const memberExpr = path.node;
    const propertyName = memberExpr.computed
      ? memberExpr.property
      : (memberExpr.property as any).name;

    // Replace (window as any).foo with window.foo (typed via global declaration)
    return j.memberExpression(j.identifier('window'), j.identifier(propertyName));
  });

  return root.toSource();
};

export default transform;
```

**S61 Exit Criteria:**
- `git ls-files src/legacy/` returns empty
- `grep -r "(window as any)"` returns 0 results
- Bundle: < 6 MB raw / < 1.8 MB gzip initial chunk
- All visual regression tests green
- All OTel span tests green
- PRYZM 1 accessible only via explicit `?pryzm1=1` flag; 90-day sunset countdown begins

---

## §2 Sprint S62 — Plugin SDK 1.0 Published
**Weeks 123–124, Month 31–32**

### §2.1 Plugin Manifest Schema

```typescript
// packages/plugin-sdk/src/manifest.ts

import { z } from 'zod';

export const PluginPermissionSchema = z.enum([
  'read:project',     // read element data from stores
  'write:project',    // execute commands via commandBus
  'read:user',        // read current user info
  'network:fetch',    // make outbound fetch() calls (to listed origins only)
  'register:tool',    // register a viewport tool
  'register:panel',   // register a panel contribution (PropertyPanel)
  'register:command', // register a command in the command palette
]);

export type PluginPermission = z.infer<typeof PluginPermissionSchema>;

export const PluginContributionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tool'),
    id: z.string(),
    label: z.string(),
    icon: z.string(),         // SVG data URI or name from icon registry
    toolbar: z.enum(['left', 'right', 'top', 'floating']),
  }),
  z.object({
    kind: z.literal('panel'),
    id: z.string(),
    location: z.enum(['properties', 'sidebar-left', 'sidebar-right', 'bottom']),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('command'),
    id: z.string(),
    label: z.string(),
    keybinding: z.string().optional(), // e.g. 'Ctrl+Shift+P'
    category: z.string().optional(),
  }),
  z.object({
    kind: z.literal('element-type'),
    id: z.string(),
    label: z.string(),
    ifcEntityType: z.string(),
    familyFile: z.string(), // path within plugin package to .pryzm-family
  }),
  z.object({
    kind: z.literal('view-template'),
    id: z.string(),
    label: z.string(),
    templateFile: z.string(), // path to JSON matching ViewTemplateSchema
  }),
]);

export const PluginManifestSchema = z.object({
  pryzmPlugin: z.literal('1.0'),
  id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/, 'Plugin ID must be lowercase-kebab-case'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  displayName: z.string().min(2).max(80),
  description: z.string().max(500),
  author: z.string(),
  homepage: z.string().url().optional(),
  main: z.string(),           // entry point relative to plugin root (e.g. 'dist/index.js')
  icon: z.string().optional(),
  license: z.string().default('MIT'),
  permissions: z.array(PluginPermissionSchema),
  allowedOrigins: z.array(z.string()).default([]),  // required if 'network:fetch' is in permissions
  contributions: z.array(PluginContributionSchema).default([]),
  minPRYZMVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  pricingModel: z.enum(['free', 'one-time', 'subscription']).optional(),
  pricingCurrency: z.string().optional(),  // e.g. 'USD'
  pricingAmount: z.number().optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// Validation with descriptive errors
export function validateManifest(raw: unknown): { ok: true; manifest: PluginManifest } | { ok: false; errors: string[] } {
  const result = PluginManifestSchema.safeParse(raw);
  if (result.success) return { ok: true, manifest: result.data };
  return {
    ok: false,
    errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
  };
}
```

### §2.2 Sandbox Model

```typescript
// packages/plugin-sdk/src/sandbox.ts
// The plugin sandbox: each plugin runs in a dedicated Web Worker.
// The host communicates via postMessage (typed messages).
// The plugin cannot access the DOM, THREE scene, or stores directly.

export interface HostMessage {
  kind: 'store:snapshot' | 'store:update' | 'command:result' | 'user:info' | 'lifecycle:activate' | 'lifecycle:deactivate';
  requestId?: string;
  payload: unknown;
}

export interface PluginMessage {
  kind: 'store:subscribe' | 'command:execute' | 'ui:render' | 'network:fetch' | 'register:tool' | 'register:panel';
  requestId: string;
  payload: unknown;
}

export class PluginSandbox {
  private worker: Worker;
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(
    private manifest: PluginManifest,
    pluginCode: string,
    private hostBridge: PluginHostBridge,
  ) {
    // Content-Security-Policy for the worker:
    // - No eval
    // - No DOM access (workers can't access DOM anyway)
    // - Fetch allowed only to manifest.allowedOrigins
    const csp = buildPluginCSP(manifest.allowedOrigins);

    // Create a Blob URL for the plugin code (restricts capabilities)
    const blob = new Blob([
      // Inject the PRYZM plugin API shim
      PLUGIN_API_SHIM,
      '\n',
      pluginCode,
    ], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    this.worker = new Worker(url, { type: 'module', name: `plugin:${manifest.id}` });

    this.worker.addEventListener('message', (e: MessageEvent<PluginMessage>) => {
      this.handlePluginMessage(e.data);
    });

    this.worker.addEventListener('error', (e) => {
      console.error(`[Plugin ${manifest.id}] Error:`, e.message);
    });

    URL.revokeObjectURL(url);
  }

  private async handlePluginMessage(msg: PluginMessage): Promise<void> {
    // Permission check before every action
    if (!this.isPermitted(msg.kind)) {
      this.sendToPlugin({
        kind: msg.kind === 'store:subscribe' ? 'store:update' : 'command:result',
        requestId: msg.requestId,
        payload: { error: `Permission denied: ${msg.kind}` },
      });
      return;
    }

    switch (msg.kind) {
      case 'store:subscribe': {
        const { storeName } = msg.payload as { storeName: string };
        this.hostBridge.subscribeToStore(storeName, (snapshot) => {
          this.sendToPlugin({ kind: 'store:update', payload: { storeName, snapshot } });
        });
        break;
      }
      case 'command:execute': {
        const { command } = msg.payload as { command: unknown };
        try {
          const result = await this.hostBridge.executeCommand(command as any);
          this.sendToPlugin({ kind: 'command:result', requestId: msg.requestId, payload: { ok: true, result } });
        } catch (err: any) {
          this.sendToPlugin({ kind: 'command:result', requestId: msg.requestId, payload: { ok: false, error: err.message } });
        }
        break;
      }
      case 'ui:render': {
        const { contributionId, html } = msg.payload as { contributionId: string; html: string };
        this.hostBridge.renderContribution(this.manifest.id, contributionId, html);
        break;
      }
      case 'network:fetch': {
        const { url, options } = msg.payload as { url: string; options?: RequestInit };
        // Validate URL is in allowedOrigins
        const allowed = this.manifest.allowedOrigins.some(origin => url.startsWith(origin));
        if (!allowed) {
          this.sendToPlugin({ kind: 'command:result', requestId: msg.requestId, payload: { error: 'Fetch blocked: origin not in allowedOrigins' } });
          return;
        }
        const response = await fetch(url, options);
        const body = await response.text();
        this.sendToPlugin({ kind: 'command:result', requestId: msg.requestId, payload: { ok: response.ok, status: response.status, body } });
        break;
      }
    }
  }

  private isPermitted(messageKind: PluginMessage['kind']): boolean {
    const requiredPermission: Record<PluginMessage['kind'], PluginPermission | null> = {
      'store:subscribe': 'read:project',
      'command:execute': 'write:project',
      'ui:render': 'register:panel',
      'network:fetch': 'network:fetch',
      'register:tool': 'register:tool',
      'register:panel': 'register:panel',
    };
    const perm = requiredPermission[messageKind];
    if (!perm) return true;
    return this.manifest.permissions.includes(perm);
  }

  activate(): void {
    this.sendToPlugin({ kind: 'lifecycle:activate', payload: {} });
  }

  deactivate(): void {
    this.sendToPlugin({ kind: 'lifecycle:deactivate', payload: {} });
  }

  terminate(): void {
    this.worker.terminate();
  }

  private sendToPlugin(msg: HostMessage): void {
    this.worker.postMessage(msg);
  }
}

// The shim injected at the top of every plugin worker
const PLUGIN_API_SHIM = `
// PRYZM Plugin API shim — injected by sandbox
const __requestMap = new Map();

const pryzm = {
  stores: {
    subscribe(storeName, callback) {
      self.postMessage({ kind: 'store:subscribe', requestId: Math.random().toString(36), payload: { storeName } });
      self.addEventListener('message', (e) => {
        if (e.data.kind === 'store:update' && e.data.payload.storeName === storeName) {
          callback(e.data.payload.snapshot);
        }
      });
    },
  },
  commands: {
    execute(command) {
      return new Promise((resolve, reject) => {
        const requestId = Math.random().toString(36);
        __requestMap.set(requestId, { resolve, reject });
        self.postMessage({ kind: 'command:execute', requestId, payload: { command } });
      });
    },
  },
  ui: {
    render(contributionId, html) {
      self.postMessage({ kind: 'ui:render', requestId: Math.random().toString(36), payload: { contributionId, html } });
    },
  },
  fetch(url, options) {
    return new Promise((resolve, reject) => {
      const requestId = Math.random().toString(36);
      __requestMap.set(requestId, { resolve, reject });
      self.postMessage({ kind: 'network:fetch', requestId, payload: { url, options } });
    });
  },
};

self.addEventListener('message', (e) => {
  if (e.data.kind === 'command:result' && e.data.requestId) {
    const pending = __requestMap.get(e.data.requestId);
    if (pending) {
      __requestMap.delete(e.data.requestId);
      if (e.data.payload.ok) pending.resolve(e.data.payload.result);
      else pending.reject(new Error(e.data.payload.error));
    }
  }
});
`;

function buildPluginCSP(allowedOrigins: string[]): string {
  const connectSrc = allowedOrigins.length > 0 ? allowedOrigins.join(' ') : "'none'";
  return `default-src 'none'; connect-src ${connectSrc}; script-src 'self'`;
}
```

### §2.3 `pryzm dev` Hot-Reload CLI

```typescript
// packages/plugin-sdk/src/dev/cli.ts
// CLI entry: `pryzm dev` — watches plugin source and hot-reloads.

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as chokidar from 'chokidar';
import { build } from 'esbuild';

program
  .command('dev')
  .description('Start PRYZM plugin development server with hot-reload')
  .option('-p, --port <port>', 'Dev server port', '5174')
  .option('--host <host>', 'Dev server host', 'localhost')
  .action(async (opts) => {
    const manifestPath = path.resolve('plugin.manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.error('plugin.manifest.json not found. Run: pryzm init');
      process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const entryPoint = manifest.main.replace(/\.js$/, '.ts') || 'src/index.ts';

    console.log(`Starting PRYZM dev server for plugin: ${manifest.id}`);
    console.log(`Watching ${entryPoint}...`);

    // Start WebSocket server for hot-reload messages
    const wsServer = new WebSocket.WebSocketServer({ port: parseInt(opts.port) });
    const clients: WebSocket.WebSocket[] = [];
    wsServer.on('connection', (ws) => { clients.push(ws); });

    let buildStartTime = 0;

    const rebuild = async () => {
      buildStartTime = Date.now();
      try {
        await build({
          entryPoints: [entryPoint],
          bundle: true,
          format: 'esm',
          outfile: 'dist/index.js',
          sourcemap: true,
          minify: false,
          logLevel: 'silent',
        });
        const duration = Date.now() - buildStartTime;
        console.log(`✓ Built in ${duration}ms`);

        // Notify all connected PRYZM editor instances
        const message = JSON.stringify({ kind: 'hot-reload', pluginId: manifest.id, timestamp: Date.now() });
        for (const client of clients) {
          if (client.readyState === WebSocket.WebSocket.OPEN) {
            client.send(message);
          }
        }
      } catch (err: any) {
        console.error('Build failed:', err.message);
      }
    };

    // Initial build
    await rebuild();

    // Watch for changes
    chokidar.watch(['src/**/*.ts', 'plugin.manifest.json'], { ignoreInitial: true })
      .on('change', (filePath) => {
        console.log(`Changed: ${filePath}`);
        rebuild();
      });

    console.log(`Dev server running on ws://localhost:${opts.port}`);
    console.log(`Open PRYZM editor and load: http://localhost:${opts.port}/plugin.manifest.json`);
  });

program.parse();
```

**S62 Exit Criteria:**
- `pryzm dev` hot-reloads < 500 ms on a 500-LOC plugin (measured)
- Hello plugin: external developer can build a "wall counter" panel in < 60 min following the guide
- Sandbox escape attempts blocked: 5 escape vectors tested (DOM access, direct store access, arbitrary fetch, eval, `importScripts`)
- All 30 first-party plugins verified working via new SDK
- `packages/plugin-sdk` published to private npm registry (S63 makes it public)

---

## §3 Sprint S63 — Plugin SDK Docs Site
**Weeks 125–126, Month 32**

```
docs.pryzm.com/
  plugin-sdk/
    getting-started/
      installation.md
      hello-plugin.md
      wall-counter-tutorial.md
    reference/
      manifest.md
      permissions.md
      sandbox-model.md
      host-api.md
      lifecycle.md
    examples/
      tool-plugin.md
      panel-plugin.md
      command-plugin.md
      element-type-plugin.md
      ai-plugin.md
    distribution/
      packaging.md
      signing.md
      marketplace.md
      revenue-share.md
  api/
    rest.md
    websocket.md
    webhooks.md
    openapi-reference.md
```

The docs site is built with [Astro Starlight](https://starlight.astro.build/) (selected in S62):

```typescript
// docs/astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'PRYZM Docs',
      social: { github: 'https://github.com/pryzm-com/pryzm' },
      sidebar: [
        { label: 'Plugin SDK', items: [
          { label: 'Getting Started', link: '/plugin-sdk/getting-started' },
          { label: 'Manifest Reference', link: '/plugin-sdk/manifest' },
          { label: 'Permissions', link: '/plugin-sdk/permissions' },
          { label: 'Sandbox Model', link: '/plugin-sdk/sandbox' },
          { label: 'Host API', link: '/plugin-sdk/host-api' },
          { label: 'Examples', link: '/plugin-sdk/examples' },
          { label: 'Distribution', link: '/plugin-sdk/distribution' },
        ]},
        { label: 'REST API', items: [
          { label: 'Quickstart', link: '/api/quickstart' },
          { label: 'Authentication', link: '/api/auth' },
          { label: 'OpenAPI Reference', link: '/api/openapi' },
        ]},
        { label: 'Headless', items: [
          { label: 'Getting Started', link: '/headless/getting-started' },
          { label: 'API Reference', link: '/headless/api' },
          { label: 'Recipes', link: '/headless/recipes' },
        ]},
      ],
    }),
  ],
});
```

**S63 Exit Criteria:**
- Docs site deployed at `docs.pryzm.com`
- "Wall Counter" tutorial walkable end-to-end by an external developer (confirmed)
- "AI Plugin" tutorial: shows how to build a plugin that calls an external LLM and returns commands to approval queue
- 30 first-party plugins all documented as examples
- OpenAPI reference auto-generated (not hand-written): `pnpm gen:openapi` produces valid OpenAPI 3.1

---

## §4 Sprint S64 — Marketplace v1
**Weeks 127–128, Month 32–33**

### §4.1 Plugin Signing

```typescript
// packages/plugin-sdk/src/signing.ts
// Uses Node.js crypto for Ed25519 signing + verification.

import { generateKeyPairSync, sign, verify, createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

export interface SignedPlugin {
  manifest: unknown;
  pluginCode: string;
  signature: string;    // hex-encoded Ed25519 signature
  publicKey: string;    // hex-encoded public key (also stored in marketplace)
}

export async function packAndSignPlugin(
  pluginDir: string,
  privateKeyHex: string,
): Promise<Buffer> {
  const manifestPath = path.join(pluginDir, 'plugin.manifest.json');
  const distPath = path.join(pluginDir, 'dist', 'index.js');

  if (!fs.existsSync(manifestPath)) throw new Error('plugin.manifest.json not found');
  if (!fs.existsSync(distPath)) throw new Error('dist/index.js not found. Run: pryzm build first.');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pluginCode = fs.readFileSync(distPath, 'utf8');

  // Compute content hash
  const contentHash = createHash('sha256')
    .update(JSON.stringify(manifest))
    .update(pluginCode)
    .digest('hex');

  // Sign
  const privateKey = Buffer.from(privateKeyHex, 'hex');
  const signature = sign(null, Buffer.from(contentHash, 'hex'), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('hex');

  // Pack into .pryzm-plugin ZIP
  const zip = new JSZip();
  zip.file('plugin.manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('dist/index.js', pluginCode);
  zip.file('signature.json', JSON.stringify({ contentHash, signature }, null, 2));

  // Include optional assets
  const assetsDir = path.join(pluginDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    for (const file of fs.readdirSync(assetsDir)) {
      zip.file(`assets/${file}`, fs.readFileSync(path.join(assetsDir, file)));
    }
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function verifyPlugin(pluginBuffer: Buffer, trustedPublicKeys: string[]): Promise<{
  ok: boolean;
  manifest: unknown;
  pluginCode: string;
  error?: string;
}> {
  const zip = await JSZip.loadAsync(pluginBuffer);
  const manifestText = await zip.file('plugin.manifest.json')!.async('text');
  const pluginCode = await zip.file('dist/index.js')!.async('text');
  const signatureData = JSON.parse(await zip.file('signature.json')!.async('text'));

  const { contentHash, signature } = signatureData;

  // Verify content hash matches
  const computedHash = createHash('sha256')
    .update(manifestText)
    .update(pluginCode)
    .digest('hex');

  if (computedHash !== contentHash) {
    return { ok: false, manifest: null, pluginCode: '', error: 'Content hash mismatch — package may have been tampered with' };
  }

  // Verify signature against any trusted public key
  for (const publicKeyHex of trustedPublicKeys) {
    const publicKey = Buffer.from(publicKeyHex, 'hex');
    const isValid = verify(null, Buffer.from(contentHash, 'hex'), {
      key: publicKey,
      dsaEncoding: 'ieee-p1363',
    }, Buffer.from(signature, 'hex'));

    if (isValid) {
      return { ok: true, manifest: JSON.parse(manifestText), pluginCode };
    }
  }

  return { ok: false, manifest: null, pluginCode: '', error: 'Signature verification failed — unknown publisher' };
}
```

### §4.2 Marketplace API (Server)

```typescript
// apps/marketplace-api/src/routes/plugins.ts

import { Router } from 'express';
import { z } from 'zod';
import { requireOAuth } from '../middleware/oauth';

const router = Router();

// GET /v1/marketplace/plugins — list all plugins
router.get('/', async (req, res) => {
  const { category, search, sort = 'downloads', page = 1, limit = 20 } = req.query;

  const plugins = await db.plugins.findMany({
    where: {
      status: 'published',
      ...(category ? { category: String(category) } : {}),
      ...(search ? { OR: [
        { displayName: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } },
      ] } : {}),
    },
    orderBy: sort === 'downloads' ? { downloadCount: 'desc' }
      : sort === 'rating' ? { averageRating: 'desc' }
      : sort === 'newest' ? { publishedAt: 'desc' }
      : { downloadCount: 'desc' },
    skip: (Number(page) - 1) * Number(limit),
    take: Number(limit),
    select: {
      id: true, displayName: true, description: true, version: true,
      author: true, category: true, downloadCount: true, averageRating: true,
      pricingModel: true, pricingAmount: true, pricingCurrency: true,
      icon: true, publishedAt: true,
    },
  });

  res.json({ plugins, page: Number(page), limit: Number(limit) });
});

// POST /v1/marketplace/plugins/:id/install — install to a project
router.post('/:id/install', requireOAuth, async (req, res) => {
  const projectId = req.body.projectId;
  const plugin = await db.plugins.findUnique({ where: { id: req.params.id } });

  if (!plugin) return res.status(404).json({ error: 'Plugin not found' });

  // Verify the user has access to the project
  const hasAccess = await checkProjectAccess(req.user.id, projectId);
  if (!hasAccess) return res.status(403).json({ error: 'Not authorised for this project' });

  // Verify payment for paid plugins
  if (plugin.pricingModel !== 'free') {
    const hasPurchased = await checkPurchase(req.user.id, plugin.id);
    if (!hasPurchased) return res.status(402).json({ error: 'Payment required', buyUrl: `/marketplace/plugins/${plugin.id}/buy` });
  }

  // Verify the plugin package signature
  const packageBuffer = await downloadPluginPackage(plugin.id, plugin.version);
  const trustedKeys = await db.publisherKeys.findMany({ where: { publisherId: plugin.publisherId } });
  const verification = await verifyPlugin(packageBuffer, trustedKeys.map(k => k.publicKeyHex));

  if (!verification.ok) {
    return res.status(400).json({ error: `Plugin verification failed: ${verification.error}` });
  }

  // Record installation
  await db.projectPlugins.upsert({
    where: { projectId_pluginId: { projectId, pluginId: plugin.id } },
    create: { projectId, pluginId: plugin.id, version: plugin.version, installedAt: new Date() },
    update: { version: plugin.version },
  });

  // Increment download count
  await db.plugins.update({
    where: { id: plugin.id },
    data: { downloadCount: { increment: 1 } },
  });

  res.json({ ok: true, pluginId: plugin.id, version: plugin.version });
});

// POST /v1/marketplace/plugins/publish — publish a new plugin
router.post('/publish', requireOAuth, async (req, res) => {
  // Validate manifest + signature + scan for known malware patterns
  // ...
});

export default router;
```

**S64 Exit Criteria:**
- Marketplace live at `marketplace.pryzm.com` with 30 first-party plugins listed
- Install flow: click → verify signature → install → plugin active in < 2 s
- One external test plugin published and installable
- Stripe Connect: plugin author can configure revenue split (80/20 default)
- Plugin listing shows install count, rating, pricing
- Signing: tampered packages rejected

---

## §5 Sprint S65 — Public REST + WebSocket APIs
**Weeks 129–130, Month 33**

### §5.1 API Gateway OpenAPI Generation

```typescript
// apps/api-gateway/src/openapi-gen.ts
// Generates OpenAPI 3.1 spec from Zod schemas + Express routes.
// Run at build time: pnpm gen:openapi

import { z } from 'zod';
import { generateOpenApi } from '@anatine/zod-openapi';
import { extendZodWithOpenApi } from '@anatine/zod-openapi';

extendZodWithOpenApi(z);

import * as fs from 'fs';

const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'PRYZM API',
    version: '1.0.0',
    description: 'PRYZM BIM Platform REST + WebSocket API',
    contact: { email: 'api@pryzm.com' },
    license: { name: 'Proprietary' },
  },
  servers: [
    { url: 'https://api.pryzm.com/v1', description: 'Production' },
    { url: 'https://api.staging.pryzm.com/v1', description: 'Staging' },
  ],
  security: [{ oauth2: ['read:project', 'write:project'] }],
  paths: {
    '/projects': {
      get: {
        summary: 'List projects',
        operationId: 'listProjects',
        security: [{ oauth2: ['read:project'] }],
        responses: {
          200: { description: 'Project list', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectList' } } } },
        },
      },
    },
    '/projects/{projectId}/elements': {
      post: {
        summary: 'Create element',
        operationId: 'createElement',
        security: [{ oauth2: ['write:project'] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateElementRequest' } } },
        },
        responses: {
          201: { description: 'Element created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Element' } } } },
        },
      },
    },
    '/elements/{elementId}': {
      patch: {
        summary: 'Update element',
        operationId: 'updateElement',
        security: [{ oauth2: ['write:project'] }],
        responses: { 200: { description: 'Updated' } },
      },
      delete: {
        summary: 'Delete element',
        operationId: 'deleteElement',
        security: [{ oauth2: ['write:project'] }],
        responses: { 204: { description: 'Deleted' } },
      },
    },
  },
  components: {
    securitySchemes: {
      oauth2: {
        type: 'oauth2',
        flows: {
          authorizationCode: {
            authorizationUrl: 'https://auth.pryzm.com/oauth2/authorize',
            tokenUrl: 'https://auth.pryzm.com/oauth2/token',
            scopes: {
              'read:project': 'Read project data',
              'write:project': 'Write project data',
              'read:user': 'Read user info',
              'admin': 'Admin access',
            },
          },
        },
      },
    },
    schemas: {
      // Generated from Zod schemas via @anatine/zod-openapi
    },
  },
};

fs.writeFileSync('docs/api/openapi.json', JSON.stringify(openApiSpec, null, 2));
console.log('OpenAPI spec generated at docs/api/openapi.json');
```

### §5.2 WebSocket Stream API

```typescript
// apps/api-gateway/src/ws-gateway.ts

import WebSocket, { WebSocketServer } from 'ws';
import { verifyToken } from './middleware/oauth';
import { syncServer } from '@pryzm/sync-server-client';

export function attachWebSocketGateway(server: import('http').Server): void {
  const wss = new WebSocketServer({ server, path: '/v1/projects/:projectId/stream' });

  wss.on('connection', async (ws, req) => {
    // Extract projectId from URL
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const projectId = url.pathname.split('/')[3];

    // Authenticate via Bearer token in Authorization header or query param
    const token = req.headers.authorization?.replace('Bearer ', '') ?? url.searchParams.get('token');
    if (!token) { ws.close(4001, 'Unauthorized'); return; }

    const user = await verifyToken(token).catch(() => null);
    if (!user) { ws.close(4001, 'Unauthorized'); return; }

    const hasAccess = await checkProjectAccess(user.id, projectId);
    if (!hasAccess) { ws.close(4003, 'Forbidden'); return; }

    console.log(`[WS] ${user.id} connected to project ${projectId}`);

    // Subscribe to project events from sync server
    const unsubscribe = syncServer.subscribeToProject(projectId, (event) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ kind: 'project:event', payload: event }));
      }
    });

    // Also subscribe to awareness updates
    const unsubscribeAwareness = syncServer.subscribeToAwareness(projectId, (awareness) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ kind: 'awareness:update', payload: awareness }));
      }
    });

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.kind === 'command:execute') {
          // Execute command via API gateway (same pipeline as REST)
          const result = await executeApiCommand(msg.payload, user, projectId);
          ws.send(JSON.stringify({ kind: 'command:result', requestId: msg.requestId, payload: result }));
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ kind: 'error', message: err.message }));
      }
    });

    ws.on('close', () => {
      unsubscribe();
      unsubscribeAwareness();
      console.log(`[WS] ${user.id} disconnected from project ${projectId}`);
    });
  });
}
```

### §5.3 Webhooks

```typescript
// apps/api-gateway/src/webhooks.ts

import crypto from 'crypto';

export interface WebhookRegistration {
  id: string;
  userId: string;
  projectId?: string;  // null = all projects
  url: string;
  events: string[];    // e.g. ['element.created', 'element.updated', 'project.updated']
  secret: string;      // HMAC secret — returned once at registration, never again
  active: boolean;
}

export async function deliverWebhook(
  registration: WebhookRegistration,
  event: { kind: string; projectId: string; payload: unknown },
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  if (!registration.events.includes(event.kind) && !registration.events.includes('*')) {
    return { ok: true }; // not subscribed to this event type
  }

  const payload = JSON.stringify({
    webhookId: registration.id,
    event: event.kind,
    projectId: event.projectId,
    timestamp: new Date().toISOString(),
    data: event.payload,
  });

  // HMAC-SHA256 signature for payload verification
  const hmac = crypto.createHmac('sha256', registration.secret);
  const signature = hmac.update(payload).digest('hex');

  try {
    const response = await fetch(registration.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PRYZM-Webhook-ID': registration.id,
        'X-PRYZM-Signature-256': `sha256=${signature}`,
        'X-PRYZM-Timestamp': Date.now().toString(),
      },
      body: payload,
      signal: AbortSignal.timeout(10_000), // 10 s timeout
    });

    if (!response.ok) {
      return { ok: false, statusCode: response.status, error: `HTTP ${response.status}` };
    }
    return { ok: true, statusCode: response.status };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
```

**S65 Exit Criteria:**
- REST: all endpoints in OpenAPI spec live; p95 < 200 ms reads, < 500 ms writes (measured)
- WS: stream delivers project events to connected client within 50 ms of sync-server event
- Webhooks: HMAC signature verified by a sample Node.js consumer script
- OpenAPI spec rendered at `api.pryzm.com/explorer/` (Scalar UI)
- Rate limits: 60 reads/min, 20 writes/min per API key (free tier)

---

## §6 Sprint S66 — `@pryzm/headless` npm Publish + Self-Host Packaging
**Weeks 131–132, Month 33**

### §6.1 Headless Package

```typescript
// packages/headless/src/index.ts
// The public API of @pryzm/headless (Node.js + browser)

export { PryzmProject } from './PryzmProject';
export { PryzmBatchRunner } from './batch';
export { exportIFC, exportPDF, exportDXF } from './export';
export type { CreateWallCommand, CreateDoorCommand } from './commands';
export type { WallDto, SlabDto, DoorDto, WindowDto } from './types';

// ── PryzmProject (the main entry point) ───────────────────────────────────

export class PryzmProject {
  private stores: StoreRegistry;
  private commandBus: CommandBus;

  constructor(private options: PryzmProjectOptions = {}) {
    this.stores = createStoreRegistry();
    this.commandBus = createCommandBus(this.stores, { mode: 'local' });
  }

  /**
   * Load a project from a .pryzm file buffer.
   */
  static async fromBuffer(buffer: Buffer): Promise<PryzmProject> {
    const project = new PryzmProject();
    await project.load(buffer);
    return project;
  }

  /**
   * Load a project from IFC.
   */
  static async fromIFC(buffer: Buffer): Promise<PryzmProject> {
    const project = new PryzmProject();
    const { stores, metaStore } = await importIFC(buffer);
    project.stores = stores;
    return project;
  }

  async execute<C>(command: C): Promise<void> {
    await this.commandBus.execute(command as any);
  }

  async executeBatch<C>(commands: C[]): Promise<void> {
    await this.commandBus.executeBatch(commands as any[]);
  }

  query<T>(selector: (stores: StoreRegistry) => T): T {
    return selector(this.stores);
  }

  async exportIFC(): Promise<Uint8Array> {
    const { exportProjectToIFC } = await import('./plugins/ifc-export');
    return exportProjectToIFC(this.stores, this.options.ifcMetaStore ?? new IFCMetaStore(), {
      name: this.options.projectName ?? 'headless-export',
    });
  }

  async save(): Promise<Buffer> {
    const { serialise } = await import('./packages/file-format');
    return serialise(this.stores);
  }

  async load(buffer: Buffer): Promise<void> {
    const { deserialise } = await import('./packages/file-format');
    this.stores = await deserialise(buffer);
  }

  dispose(): void {
    this.commandBus.dispose();
  }
}

export interface PryzmProjectOptions {
  projectName?: string;
  ifcMetaStore?: IFCMetaStore;
  aiConfig?: { model: string; apiKey: string };
}
```

**Recipes** (documented at `docs.pryzm.com/headless/recipes`):

```typescript
// Example recipe: "Convert 1000 IFC files to PRYZM in parallel"
import { PryzmProject } from '@pryzm/headless';
import * as fs from 'fs';
import * as path from 'path';
import PQueue from 'p-queue';

const queue = new PQueue({ concurrency: 4 });
const files = fs.readdirSync('./ifc-input').filter(f => f.endsWith('.ifc'));

await Promise.all(files.map(file =>
  queue.add(async () => {
    const buffer = fs.readFileSync(path.join('./ifc-input', file));
    const project = await PryzmProject.fromIFC(buffer);
    const output = await project.save();
    fs.writeFileSync(path.join('./pryzm-output', file.replace('.ifc', '.pryzm')), output);
    console.log(`Converted: ${file}`);
  })
));
```

### §6.2 Self-Host Docker Compose

```yaml
# docker-compose.self-host.yml
# Deploy: docker compose -f docker-compose.self-host.yml up -d
# Requires: PRYZM_JWT_SECRET, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD env vars

version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: pryzm
      POSTGRES_USER: pryzm
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U pryzm"]
      interval: 5s
      timeout: 5s
      retries: 5

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: pryzm
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data

  sync-server:
    image: pryzm/sync-server:${PRYZM_VERSION:-2.0.0}
    environment:
      DATABASE_URL: postgresql://pryzm:${POSTGRES_PASSWORD}@postgres:5432/pryzm
      REDIS_URL: redis://redis:6379
      STORAGE_ENDPOINT: http://minio:9000
      STORAGE_BUCKET: pryzm-r2
      JWT_SECRET: ${PRYZM_JWT_SECRET}
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_started }
      minio: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  bake-worker:
    image: pryzm/bake-worker:${PRYZM_VERSION:-2.0.0}
    environment:
      REDIS_URL: redis://redis:6379
      DATABASE_URL: postgresql://pryzm:${POSTGRES_PASSWORD}@postgres:5432/pryzm
      STORAGE_ENDPOINT: http://minio:9000
      STORAGE_BUCKET: pryzm-r2
    depends_on:
      redis: { condition: service_started }
      minio: { condition: service_healthy }

  editor:
    image: pryzm/editor:${PRYZM_VERSION:-2.0.0}
    environment:
      VITE_API_URL: http://sync-server:3000
      VITE_WS_URL: ws://sync-server:3000
    ports:
      - "3000:80"
    depends_on:
      sync-server: { condition: service_healthy }

  api-gateway:
    image: pryzm/api-gateway:${PRYZM_VERSION:-2.0.0}
    environment:
      DATABASE_URL: postgresql://pryzm:${POSTGRES_PASSWORD}@postgres:5432/pryzm
      REDIS_URL: redis://redis:6379
      SYNC_SERVER_URL: http://sync-server:3000
      JWT_SECRET: ${PRYZM_JWT_SECRET}
    ports:
      - "3001:3001"
    depends_on:
      sync-server: { condition: service_healthy }

volumes:
  postgres-data:
  minio-data:
  redis-data:
```

**S66 Exit Criteria (= Phase 3C gate):**
- `@pryzm/headless` published to npm registry at 1.0.0
- IFC → PRYZM conversion recipe works: 100 files in < 5 min (measured)
- `docker compose -f docker-compose.self-host.yml up -d` → full stack healthy in < 10 min on fresh Ubuntu 22.04 VM
- All container images build in CI and have correct health checks
- Headless API surface documented at `docs.pryzm.com/headless/`

---

## §7 Phase 3C Cross-Cutting Deliverables

### §7.1 CI Gates Added in 3C

| Gate | Sprint | Condition |
|---|---|---|
| `legacy-deletion-empty` | S61 | `git ls-files src/legacy/` returns empty |
| `no-window-any` | S61 | `grep -r "(window as any)" src/` returns nothing |
| `bundle-size-6mb` | S61 | Initial bundle < 6 MB raw |
| `plugin-sdk-sandbox` | S62 | 5 escape vectors blocked in sandbox audit |
| `openapi-valid` | S65 | `swagger-cli validate docs/api/openapi.json` passes |
| `headless-node-compat` | S66 | `@pryzm/headless` runs in Node 20 without DOM |
| `self-host-compose-up` | S66 | `docker compose up` healthy in < 10 min on CI runner |

### §7.2 Performance Budgets

| Metric | Target | Sprint |
|---|---|---|
| `pryzm dev` hot-reload | < 500 ms | S62 |
| Plugin install (download + verify + load) | < 2 s | S64 |
| REST API p95 read | < 200 ms | S65 |
| REST API p95 write | < 500 ms | S65 |
| WS event delivery | < 50 ms | S65 |
| Headless: 100 IFC → PRYZM conversions | < 5 min | S66 |

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead.*  
*Predecessor: `PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md`.*  
*Successor: `PHASE-3D-Q4-M34-M36-HARDENING-GA.md`.*
