---
title: Host API
description: The six host proxies plugins use to read project state, dispatch commands, run AI workflows, and register file formats.
---

# Host API

A plugin's `onActivate(ctx)` receives an `HostProxies` aggregate at
`ctx.hosts`. There are six proxies; each is permission-gated. Calling a
method without the required permission throws `PluginPermissionError`.

## `ctx.hosts.commandBus`

```ts
interface CommandBusProxy {
  dispatch(cmd: { kind: string; payload: unknown }): Promise<CommandResult>;
  history(): Promise<{ count: number; lastCommandId: string | null }>;
}
```

| Method | Permission | Notes |
|---|---|---|
| `dispatch` | `write:project` | Awaitable. `CommandResult` is `{ ok: true, commandId, durationMs }` or `{ ok: false, commandId, error }`. Rejections only happen for transport errors (sandbox unmounted), not business-rule failures. |
| `history` | `read:project` | Returns the historical command count. |

Example:

```ts
const result = await ctx.hosts.commandBus.dispatch({
  kind: 'wall.create',
  payload: { start: [0, 0], end: [5, 0], height: 3, thickness: 0.2 },
});
if (!result.ok) console.error(`wall.create failed: ${result.error.message}`);
```

## `ctx.hosts.stores`

```ts
interface StoresProxy {
  getElements(opts?: { kind?: string }): Promise<{ snapshot, elements: ElementRef[] }>;
  getElement(id: string): Promise<{ snapshot, element: ElementRef | null }>;
  subscribe(handler: (event: { snapshot, changedKinds: string[] }) => void): StoreSubscription;
}
```

| Method | Permission | Notes |
|---|---|---|
| `getElements` | `read:project` | Optionally filter by `kind` (e.g. `'wall'`). Snapshot-consistent. |
| `getElement` | `read:project` | Returns `null` if not found. |
| `subscribe` | `read:project` | Coalesced 250 ms (matches the editor's re-bake window per ADR-0010). |

`ElementRef`:

```ts
interface ElementRef {
  id: string;
  kind: string;          // 'wall' | 'door' | 'window' | …
  levelId: string | null;
  bbox: { min: [number, number, number]; max: [number, number, number] } | null;
}
```

## `ctx.hosts.views`

```ts
interface ViewsProxy {
  getActiveView(): Promise<ViewRef | null>;
  getViews(): Promise<ViewRef[]>;
  subscribe(handler: (event: { activeView: ViewRef | null }) => void): { unsubscribe(): void };
}
```

`ViewRef.kind` is one of `'3d' | 'plan' | 'section' | 'sheet' | 'schedule'` — the 5 v1 view kinds.

## `ctx.hosts.selection`

```ts
interface SelectionProxy {
  get(): Promise<readonly string[]>;
  subscribe(handler: (event: { selectedIds: readonly string[] }) => void): SelectionSubscription;
}
```

To **set** the selection, dispatch `{ kind: 'selection.set', payload: { ids } }`
through the command bus — that way it is undo-redo-able.

## `ctx.hosts.ai`

```ts
interface AiProxy {
  listWorkflows(): Promise<readonly AiWorkflowRef[]>;
  runWorkflow(name: string, input: unknown): Promise<AiWorkflowResult>;
}
```

| Method | Permission | Notes |
|---|---|---|
| `listWorkflows` | `read:project` | Filtered to workflows the plugin is allowed to see. |
| `runWorkflow` | `write:project` | See [Permissions §"Why no ai:invoke?"](/plugin-sdk/permissions#why-no-aiinvoke-permission). |

`AiWorkflowResult`:

```ts
| { ok: true;  workflow; runId; output; costUsd; latencyMs }
| { ok: false; workflow; runId; error: { code; message } }
```

`costUsd` is charged to the project owner per SPEC-28 §9 (Workspace
Admin AI Spend view). Budget enforcement happens host-side BEFORE the
workflow dispatches; the plugin sees the per-run cost post-fact.

## `ctx.hosts.format`

```ts
interface FormatProxy {
  registerImporter(opts: { extension; menuLabel; handler }): FormatImporterRegistration;
  registerExporter(opts: { extension; menuLabel; handler }): FormatExporterRegistration;
}
```

| Method | Permission | Notes |
|---|---|---|
| `registerImporter` | `register:command` | Adds a "Import .ext" entry to the File menu. |
| `registerExporter` | `register:command` | Adds an "Export as .ext" entry. |

Importer handlers return `{ ok: true, commands: [...] }`; the host
wraps the array in a transaction (atomic — partial-import leaves no
half-state). Exporter handlers receive the project as a serialised JSON
string and return bytes.

See `examples/format-plugin/` for a complete CSV walls importer.

## Subscription cleanup

Always store the subscription handle and call `.unsubscribe()` from
`onDeactivate`:

```ts
let storeSub: StoreSubscription | null = null;

export default definePlugin({
  async onActivate(ctx) {
    storeSub = ctx.hosts.stores.subscribe(refresh);
  },
  async onDeactivate() {
    storeSub?.unsubscribe();
    storeSub = null;
  },
});
```

The host gives `onDeactivate` 5 seconds before forcibly tearing down
the iframe (`HOOK_TIMEOUT_MS`); failure to unsubscribe is benign in
that window but leaks references in the debugger.

## See also

- [`packages/plugin-sdk/src/hosts/`](https://github.com/pryzm-com/pryzm/tree/main/packages/plugin-sdk/src/hosts) — proxy contracts.
- [Examples](/plugin-sdk/examples) — three working plugins exercising every proxy.
