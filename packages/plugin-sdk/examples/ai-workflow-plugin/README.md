# ai-workflow-plugin-example

Plugs the L7.5 `critic.view` workflow into a sidebar command + panel.
Press <kbd>Ctrl+Shift+K</kbd> to run the critic on the active view; the
result is rendered as JSON in a bottom panel.

## What this example demonstrates

| Concept | Where in the source |
|---|---|
| AI workflow invocation via `AiProxy.runWorkflow` | `index.ts` |
| Composing two contribution kinds (command + panel) | `plugin.manifest.json` |
| Permission gating — AI is gated by `write:project` (no ai:invoke perm) | `plugin.manifest.json` |
| Cost + latency surfacing per SPEC-28 §9 | `index.ts` (result.costUsd / result.latencyMs) |
| Per-run idempotency token (runId) | `index.ts` (result.runId in footer) |

## Why no `ai:invoke` permission?

The plugin permission set is locked at 7 (per ADR-0038 §A): no `ai:invoke`.
AI workflows are gated by `write:project` because every AI workflow
either mutates project state or reads enough of it to be equivalent to a
read of write-impactful provenance.  The OAuth2 `ai:invoke` scope (in
`packages/api-spec/openapi.yaml`) is a public-API namespace — unrelated
to plugin permissions.

## Cost accounting

`result.costUsd` is charged to the project owner per SPEC-28 §9
(Workspace Admin AI Spend view).  The plugin sees the per-run cost
post-fact; budget enforcement happens host-side before the workflow
dispatches.

## Run locally

```sh
node ../../src/dev/cli.ts --manifest plugin.manifest.json --once
```
