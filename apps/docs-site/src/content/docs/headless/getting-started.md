---
title: Headless — Getting Started
description: Run PRYZM as a CLI for batch authoring, validation, and format conversion.
---

## What is headless mode?

`@pryzm/headless` lets you run the PRYZM engine outside a browser — in Node.js
CI scripts, bake workers, format-conversion pipelines, and test harnesses.
It exposes the same `PryzmRuntime` surface as the in-editor engine, so code
written for headless works in-editor and vice-versa.

## Install

```sh
npm install @pryzm/headless
```

The package is published under the `next` dist-tag alongside `@pryzm/sdk`.
After the Phase F K3-C audit closes, both flip to `latest` at v1.0.0.

## Quick start

```ts
import { composeHeadlessRuntime } from '@pryzm/headless';

const runtime = await composeHeadlessRuntime({});

// Load a .pryzm archive from disk
const project = await runtime.ifc.importFile('./site.ifc');

// Query elements
const walls = await runtime.stores.getElements({ kind: 'wall' });
console.log(`${walls.elements.length} walls imported`);

// Export back as IFC
await runtime.ifc.exportFile(project.id, './site-round-tripped.ifc');

await runtime.dispose();
```

## `composeHeadlessRuntime(opts)`

The main entry point.  It composes a full `PryzmRuntime` suitable for
non-browser contexts.

```ts
import type { HeadlessRuntimeOptions } from '@pryzm/headless';

const opts: Partial<HeadlessRuntimeOptions> = {
  audit: {
    actorId:   'ci-bot',      // logged in the command-event audit trail
    projectId: 'proj-abc123', // optional; defaults to 'headless-default'
    clientId:  `ci-${Date.now()}`,
  },
};

const runtime = await composeHeadlessRuntime(opts);
```

If `opts` is omitted or `audit` is not provided, sensible CI defaults are
used (`actorId: 'headless-ci'`).

## The `HeadlessRuntime` surface

`composeHeadlessRuntime` returns a `PryzmRuntime` — the same type used by
the editor. The key sub-surfaces:

| Sub-surface | Description |
|---|---|
| `runtime.ifc` | IFC import/export — `importFile(path)`, `exportFile(projectId, path)` |
| `runtime.stores` | Read element state — `getElements(opts?)`, `getElement(id)` |
| `runtime.commandBus` | Dispatch commands — `dispatch({ kind, payload })` |
| `runtime.marketplace` | Install plugins — `install(pluginId)`, `list()` |

## Running as a CLI script

The headless API works naturally in Node.js scripts launched by pnpm:

```json
// package.json
{
  "scripts": {
    "validate": "tsx scripts/validate.ts",
    "convert":  "tsx scripts/convert.ts"
  }
}
```

```ts
// scripts/validate.ts
import { composeHeadlessRuntime } from '@pryzm/headless';
import { readFileSync } from 'node:fs';

const [,, ifcPath] = process.argv;
if (!ifcPath) { console.error('Usage: validate <file.ifc>'); process.exit(1); }

const runtime = await composeHeadlessRuntime({});
try {
  const project = await runtime.ifc.importFile(ifcPath);
  const { elements } = await runtime.stores.getElements();
  console.log(`✔  ${ifcPath} — ${elements.length} elements`);
} catch (err) {
  console.error(`✘  ${ifcPath}: ${(err as Error).message}`);
  process.exit(1);
} finally {
  await runtime.dispose();
}
```

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `PRYZM_DB_URL` | `postgres://localhost:5432/pryzm` | Postgres connection string. Not required for read-only IFC work. |
| `PRYZM_AI_KEY` | unset | Enable AI workflows via the headless runtime. |
| `PRYZM_LOG_LEVEL` | `warn` | `debug` / `info` / `warn` / `error`. |

## Next steps

- [Headless API Reference](/headless/api) — full method signatures.
- [Headless Recipes](/headless/recipes) — CI validation, batch export, scripted authoring.
- [Plugin SDK — Getting Started](/plugin-sdk/getting-started) — writing plugins
  that run in the same `PryzmRuntime` as the headless engine.
