---
title: Examples
description: Three working plugins shipped with the SDK — hello, format, and AI workflow.
---

# Examples

The `@pryzm/plugin-sdk` package ships three end-to-end working plugins
under [`packages/plugin-sdk/examples/`](https://github.com/pryzm-com/pryzm/tree/main/packages/plugin-sdk/examples).
Each demonstrates a different cross-section of the SDK surface.

| Example | Permissions | Demonstrates |
|---|---|---|
| [hello-plugin](#hello-plugin) | `read:project`, `register:panel` | Minimum viable plugin: panel + stores subscription + cleanup. |
| [format-plugin](#format-plugin) | `read:project`, `write:project`, `register:command` | File-format plugin: `FormatProxy.registerImporter` + transactional command-array atomicity. |
| [ai-workflow-plugin](#ai-workflow-plugin) | `read:project`, `write:project`, `register:command`, `register:panel` | AI workflow runner with cost + latency surfacing. |

---

## hello-plugin

The smallest possible plugin: registers a sidebar-right panel that
shows the active user's display name and the current selection size.

**Manifest** ([`plugin.manifest.json`](https://github.com/pryzm-com/pryzm/blob/main/packages/plugin-sdk/examples/hello-plugin/plugin.manifest.json)):

```json
{
  "pryzmPlugin": "1.0",
  "id": "hello-plugin",
  "version": "1.0.0",
  "permissions": ["read:project", "register:panel"],
  "contributions": [
    { "kind": "panel", "id": "hello-panel", "location": "sidebar-right", "label": "Hello" }
  ]
}
```

**Entry point** ([`index.ts`](https://github.com/pryzm-com/pryzm/blob/main/packages/plugin-sdk/examples/hello-plugin/index.ts)):

```ts
import { definePlugin } from '@pryzm/plugin-sdk/lifecycle';
import type { StoreSubscription } from '@pryzm/plugin-sdk/hosts';

let storeSub: StoreSubscription | null = null;

export default definePlugin({
  async onActivate(ctx) {
    // mount panel into #pryzm-plugin-root
    storeSub = ctx.hosts.stores.subscribe((event) => {
      // update the displayed selection size
    });
  },
  async onDeactivate() {
    storeSub?.unsubscribe();
    storeSub = null;
  },
});
```

**What this plugin CANNOT do:**
- Dispatch any command (`commandBus.dispatch` throws `PluginPermissionError`).
- Make outbound HTTP requests (`network:fetch` not granted).
- Register a tool or a command.
- Read user email (`ctx.user.email` is `null`).

---

## format-plugin

Registers a `.csv` importer that turns CSV rows into `wall.create`
commands. Each row is `x1, y1, x2, y2, height, thickness`.

**Manifest** ([`plugin.manifest.json`](https://github.com/pryzm-com/pryzm/blob/main/packages/plugin-sdk/examples/format-plugin/plugin.manifest.json)):

```json
{
  "permissions": ["read:project", "write:project", "register:command"],
  "contributions": [
    {
      "kind": "command",
      "id": "format-plugin.import-csv",
      "label": "Import walls from CSV",
      "category": "File / Import"
    }
  ]
}
```

**Entry point** ([`index.ts`](https://github.com/pryzm-com/pryzm/blob/main/packages/plugin-sdk/examples/format-plugin/index.ts)):

```ts
ctx.hosts.format.registerImporter({
  extension: '.csv',
  menuLabel: 'Import walls from CSV',
  handler: async (input) => {
    const text = new TextDecoder('utf-8').decode(input.bytes);
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const commands = [];
    for (const line of lines) {
      const [x1, y1, x2, y2, height, thickness] = line.split(',').map(Number);
      // validation … if any row is invalid, return { ok: false, error }
      commands.push({ kind: 'wall.create', payload: { start: [x1, y1], end: [x2, y2], height, thickness } });
    }
    return { ok: true, commands };
  },
});
```

**Atomicity guarantee:** the host wraps the entire `commands[]` array
in a transaction. If ANY row fails parsing, NO walls are created — the
importer returns `{ ok: false, ... }` and the user sees a precise
line-number error. Validate every row BEFORE pushing into `commands`.

**Why three permissions:**
- `register:command` — adds the "Import walls from CSV" entry to File menu.
- `write:project` — wall-create commands mutate project state.
- `read:project` — required for the host to dispatch into the project at all.

---

## ai-workflow-plugin

Plugs the L7.5 `critic.view` workflow into a command + panel. Press
<kbd>Ctrl+Shift+K</kbd> to run the critic on the active view; the
result renders as JSON in a bottom panel with cost + latency in the
footer.

**Manifest** ([`plugin.manifest.json`](https://github.com/pryzm-com/pryzm/blob/main/packages/plugin-sdk/examples/ai-workflow-plugin/plugin.manifest.json)):

```json
{
  "permissions": ["read:project", "write:project", "register:command", "register:panel"],
  "contributions": [
    {
      "kind": "command",
      "id": "ai-workflow.critique-view",
      "label": "Critique active view (AI)",
      "keybinding": "Ctrl+Shift+K",
      "category": "AI"
    },
    {
      "kind": "panel",
      "id": "ai-workflow.critique-output",
      "location": "bottom",
      "label": "AI Critique"
    }
  ]
}
```

**Workflow invocation:**

```ts
const result = await ctx.hosts.ai.runWorkflow('critic.view', {
  viewId: (await ctx.hosts.views.getActiveView())?.id ?? null,
});

if (result.ok) {
  console.log(`Cost: $${result.costUsd}, latency: ${result.latencyMs}ms`);
  // render result.output
} else {
  console.error(`AI workflow failed: ${result.error.message} [${result.error.code}]`);
}
```

**Why no `ai:invoke` permission?** The plugin permission set is locked
at 7 (per [ADR-0038](https://github.com/pryzm-com/pryzm/blob/main/docs/architecture/adr/0038-s62-plugin-sdk-descriptor-schema-lock.md) §A): no `ai:invoke`. AI workflows are gated by
`write:project` because every workflow either mutates project state or
reads enough that it is equivalent to a write impact.

The OAuth2 `ai:invoke` scope (in `packages/api-spec/openapi.yaml`) is a
public-API namespace — unrelated to plugin permissions.

**Cost accounting:** `result.costUsd` is charged to the project owner
per SPEC-28 §9 (Workspace Admin AI Spend view). Budget enforcement
happens host-side before the workflow dispatches.

---

## Run any example locally

From the `packages/plugin-sdk/` directory:

```sh
node src/dev/cli.ts --manifest examples/hello-plugin/plugin.manifest.json --once
node src/dev/cli.ts --manifest examples/format-plugin/plugin.manifest.json --once
node src/dev/cli.ts --manifest examples/ai-workflow-plugin/plugin.manifest.json --once
```

Each invocation validates the manifest, prints the iframe srcdoc the
editor would mount, and exits.
