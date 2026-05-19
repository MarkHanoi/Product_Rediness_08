# hello-plugin

The smallest possible PRYZM plugin: registers a sidebar-right panel that
shows the active user's display name and the current selection size.

## What this example demonstrates

| Concept | Where in the source |
|---|---|
| Permission gating (only `read:project` + `register:panel` requested) | `plugin.manifest.json` |
| Single-panel contribution | `plugin.manifest.json` `contributions[0]` |
| Lifecycle hooks (`onActivate` + `onDeactivate`) | `index.ts` |
| Host-proxy subscription with cleanup | `index.ts` (storeSub + onDeactivate) |
| Activation-context consumption (`ctx.user.displayName`) | `index.ts` |

## Run locally

From the plugin-sdk package root:

```sh
pnpm --filter @pryzm/plugin-sdk install
node src/dev/cli.ts --manifest examples/hello-plugin/plugin.manifest.json --once
```

The CLI validates the manifest, prints the iframe srcdoc the editor
would mount, and exits.

For watch mode (the actual `pryzm dev` developer loop):

```sh
node src/dev/cli.ts --manifest examples/hello-plugin/plugin.manifest.json
```

## What this plugin CANNOT do

By design, with only `read:project` + `register:panel`:

- It cannot dispatch any command (`commandBus.dispatch` throws `PluginPermissionError`).
- It cannot make outbound HTTP requests (`network:fetch` not granted).
- It cannot register a tool or a command (`register:tool` / `register:command` not granted).
- It cannot read user email (`read:user` not granted; `ctx.user.email` is `null`).
