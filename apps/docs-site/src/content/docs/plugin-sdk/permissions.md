---
title: Permissions
description: The 7 locked plugin permissions, what each grants, and how to choose the minimum set.
---

# Permissions

PRYZM plugins declare permissions in their manifest. The set is **locked at 7** for v1 per [ADR-0038](https://github.com/pryzm-com/pryzm/blob/main/docs/02-decisions/adrs/0038-s62-plugin-sdk-descriptor-schema-lock.md) §Decision A. Adding a permission is an additive `1.x` change; removing or narrowing one requires `2.0`.

## The 7 permissions

| Permission | Grants | Without it |
|---|---|---|
| `read:project` | Read elements/views/selection from `host.stores` / `host.views` / `host.selection`. | All proxy reads throw `PluginPermissionError`. |
| `write:project` | Dispatch commands via `host.commandBus.dispatch()` AND invoke AI workflows via `host.ai.runWorkflow()`. | Dispatches and AI runs throw `PluginPermissionError`. |
| `read:user` | Read `displayName` + `email` from `ctx.user`. | `ctx.user.displayName` and `ctx.user.email` are `null` (a stable per-(plugin × user) `id` is always present). |
| `network:fetch` | Make outbound `fetch` calls. **Requires non-empty `allowedOrigins`.** CSP `connect-src` is restricted to those origins. | CSP sets `connect-src 'none'` — every `fetch` rejects. |
| `register:tool` | Contribute a `tool` (viewport entry). | The host strips `tool` contributions from the manifest at install. |
| `register:panel` | Contribute a `panel` (docked surface). | Panels stripped at install. |
| `register:command` | Contribute a `command` (palette entry) AND register file-format importers/exporters via `host.format`. | Commands stripped + format proxy throws on register. |

## Why no `ai:invoke` permission?

The set is locked at 7. AI workflows are gated by `write:project`
because every workflow either mutates project state or reads enough
that it is equivalent to a write impact (provenance + cost accounting
attaches to the project owner per SPEC-28 §9).

The OAuth2 `ai:invoke` scope (declared in
`packages/api-spec/openapi.yaml`) is a public-API namespace — unrelated
to plugin permissions. The two are distinct concepts that share the
same word.

## Choosing the minimum set

The host enforces permissions at every proxy call. The user-visible
"install" dialog lists permissions verbatim, so requesting more than
you need is also a UX cost (users decline "wants to read all your
data" plugins).

Heuristic:

| What your plugin does | Minimum permissions |
|---|---|
| Sidebar widget showing project stats | `read:project` + `register:panel` |
| Command that creates walls from a CSV | `read:project` + `write:project` + `register:command` |
| Tool that selects+colors elements | `read:project` + `write:project` + `register:tool` |
| Panel that calls an AI workflow | `read:project` + `write:project` + `register:panel` |
| Format plugin (`.dxf` ↔ project) | `read:project` + `write:project` + `register:command` |
| Plugin that calls an external API | the above + `network:fetch` + `allowedOrigins: [...]` |
| Plugin that personalizes by user identity | the above + `read:user` |

## What the host enforces, end to end

```
plugin code
   │
   │  ctx.hosts.commandBus.dispatch({ kind: 'wall.create', ... })
   ▼
postMessage → iframe sandbox bridge
   │
   │  ① validate: is this kind allowed for the plugin direction?  (sandbox/iframe-sandbox.ts)
   ▼
host runtime (apps/editor/src/plugin-runtime/)
   │
   │  ② validate: does the manifest grant 'write:project'?  (descriptor.ts permissions)
   │     → if no: PluginPermissionError back across the bridge
   ▼
command bus (packages/command-bus/)
```

Both checks happen host-side. A malicious plugin cannot bypass either:
the iframe sandbox is `<iframe sandbox="allow-scripts">` (no
`allow-same-origin`), so no shared globals; the postMessage envelope is
the only ingress and is type-narrowed at the boundary.

See [Sandbox Model](/plugin-sdk/sandbox) for the rest of the story.
