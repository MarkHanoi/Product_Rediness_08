---
title: Headless API Reference
description: Reference for all @pryzm/headless exports and the PryzmRuntime sub-surfaces.
---

## Exports

```ts
import {
  composeHeadlessRuntime,  // main factory
  headlessRuntime,         // lower-level factory (audit required)
} from '@pryzm/headless';

import type {
  HeadlessRuntime,         // = PryzmRuntime — the composed object
  HeadlessRuntimeOptions,  // options for headlessRuntime()
} from '@pryzm/headless';
```

---

## `composeHeadlessRuntime(opts?)`

Convenience wrapper — equivalent to `headlessRuntime` with sensible CI
defaults applied when fields are omitted.

```ts
function composeHeadlessRuntime(
  opts?: Partial<HeadlessRuntimeOptions>
): Promise<PryzmRuntime>
```

`opts.audit` defaults to:
```ts
{ actorId: 'headless-ci', projectId: 'headless-default', clientId: `headless-${Date.now()}` }
```

---

## `headlessRuntime(opts)`

Lower-level factory.  `opts.audit` is required.

```ts
function headlessRuntime(opts: HeadlessRuntimeOptions): Promise<PryzmRuntime>

interface HeadlessRuntimeOptions {
  audit: {
    actorId:   string; // logged in every CommandEvent (required)
    projectId: string; // default project context
    clientId:  string; // unique per session
  };
}
```

---

## `runtime.ifc`

IFC 4.3 import and export.

### `importFile(path)`

```ts
runtime.ifc.importFile(path: string): Promise<{ id: string; name: string }>
```

Reads the IFC file at `path`, parses it with the IFC Web Worker
(`IFCParseWorker`), and loads the elements into the runtime's stores.

Returns `{ id, name }` — the new project identifier.

Throws if the file is not valid IFC 4.3 or the path does not exist.

### `exportFile(projectId, path)`

```ts
runtime.ifc.exportFile(projectId: string, path: string): Promise<void>
```

Exports the project identified by `projectId` as an IFC 4.3 file at
`path`.  Uses `IFC4X3Exporter` under the hood.

---

## `runtime.stores`

Read element and project state.

### `getElements(opts?)`

```ts
runtime.stores.getElements(opts?: { kind?: string }):
  Promise<{ snapshot: string; elements: ElementRef[] }>
```

Optionally filter by `kind` (e.g. `'wall'`).  Snapshot-consistent per
the same 250 ms coalesce window as the in-editor stores proxy.

### `getElement(id)`

```ts
runtime.stores.getElement(id: string):
  Promise<{ snapshot: string; element: ElementRef | null }>
```

Returns `null` if the element does not exist.

### `subscribe(handler)`

```ts
runtime.stores.subscribe(
  handler: (event: { snapshot: string; changedKinds: string[] }) => void
): { unsubscribe(): void }
```

Fires after each command that modifies the store.  Returns a handle.
Always call `.unsubscribe()` before `runtime.dispose()`.

---

## `runtime.commandBus`

### `dispatch(cmd)`

```ts
runtime.commandBus.dispatch(cmd: {
  kind: string;
  payload: unknown;
}): Promise<{ ok: boolean; commandId: string; durationMs: number; error?: Error }>
```

Dispatches a command into the runtime's event bus and waits for
settlement.  Headless commands are appended to the in-memory event log
(and optionally to Postgres when `PRYZM_DB_URL` is set).

### `history()`

```ts
runtime.commandBus.history():
  Promise<{ count: number; lastCommandId: string | null }>
```

Returns the number of commands dispatched in this session.

---

## `runtime.marketplace`

Install and manage plugins in a headless session.

### `install(pluginId)`

```ts
runtime.marketplace.install(pluginId: string): Promise<InstalledPlugin>
```

Downloads the plugin from the marketplace API, verifies the Ed25519
signature, and activates it in the headless sandbox.

### `list()`

```ts
runtime.marketplace.list(): InstalledPlugin[]
```

Returns currently active plugins in this runtime session.

---

## `runtime.dispose()`

```ts
runtime.dispose(): Promise<void>
```

Gracefully tears down the runtime: deactivates all installed plugins
(fires `onDeactivate` with a 5-second timeout each), flushes the
command log, and closes any open DB connections.

**Always call `dispose()`** at the end of a headless script.  Forgetting
it leaves dangling async tasks that prevent the Node.js process from
exiting cleanly.

---

## TypeScript types

```ts
interface ElementRef {
  id:      string;
  kind:    string;             // 'wall' | 'door' | 'window' | …
  levelId: string | null;
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
}

interface InstalledPlugin {
  pluginId:    string;
  version:     string;
  activatedAt: string;         // ISO 8601
}
```
