# Headless Architecture

> Phase: 1C · Sprint S18 · ADR: `docs/02-decisions/adrs/0017-headless-package-surface.md`

## Purpose

`@pryzm/headless` (`apps/headless/`) proves K1-B: *the geometry kernel runs in Node
end-to-end without DOM / THREE dependencies*. It is also the foundation for 1D S22
server-side bake workers and CI fixture generation.

## Package surface

```
apps/headless/
  src/
    index.ts                  — HeadlessRuntime factory + re-exports
    cli.ts                    — pryzm-headless bin entry
    commands/
      newProject.ts           — runNewProject()
      addWall.ts              — runAddWall()
      addSlab.ts              — runAddSlab()
      exportPryzm.ts          — runExportPryzm()
  __tests__/
    headless-s18.test.ts      — K2-A purity / smoke (5 tests)
    headless-node.test.ts     — K1-B full pipeline verification (3 tests)
    cli-parsers.test.ts       — argv parser unit tests (8 tests)
    strict-mode.test.ts       — strictKernelMode DOM guard (2 tests)
  .dependency-cruiser.cjs     — static import guard (CI-enforced)
```

## HeadlessRuntime

```ts
interface HeadlessRuntime {
  readonly commandBus:   CommandBus;
  readonly eventLog:     EventLog;
  readonly stores:       StoreRegistry;
  shutdown(): Promise<void>;
}
```

Created via `createHeadlessRuntime(opts)`. Uses `InMemoryBackend` for the event log.
No browser globals, no `requestAnimationFrame`, no `document`.

## Allowed / Forbidden imports

| Allowed | Forbidden |
|---|---|
| `@pryzm/protocol` | `three` |
| `@pryzm/command-bus` | `@pryzm/renderer` |
| `@pryzm/stores` | `@pryzm/render-runtime` |
| `@pryzm/geometry-kernel` | `@pryzm/ui-vanilla` |
| `@pryzm/persistence-client` | anything touching `document` / `window` / `navigator` |
| `@pryzm/view-state` | |
| `@pryzm/cascade` | |

Enforced statically by `.dependency-cruiser.cjs` (CI fails on any FORBIDDEN import).
Enforced dynamically by `headless-node.test.ts` (K1-B runtime verification).

## CLI usage

```sh
node apps/headless/dist/cli.js new-project my-project
node apps/headless/dist/cli.js add-wall --sx 0 --sy 0 --ex 5 --ey 0
node apps/headless/dist/cli.js add-slab --level-id L1 --thickness 0.25
node apps/headless/dist/cli.js export-pryzm --project-id my-project
```

## K1-B kill-switch (K1C-2)

If `apps/headless/__tests__/headless-node.test.ts` fails on any CI run, **entry to 1D
is blocked**. The central architectural claim (kernel purity) is broken. Remediation:
audit producer / persistence packages for THREE / DOM leaks and remove them.

## OTel spans

| Span | Parent | Key attributes |
|---|---|---|
| `pryzm.headless.boot` | root | `headless.cli.command`, `headless.k1b.verified`, `headless.duration_ms` |
| `pryzm.headless.cli.command` | boot | `cli.name`, `cli.argv.count`, `cli.duration_ms`, `cli.ok` |
| `pryzm.headless.export` | cli.command | `export.bytes`, `export.elementCount`, `export.duration_ms` |

## Bench target

`headless-node.test.ts` full pipeline (new-project + add-wall + add-slab + export)
must complete in < 3 s p95 (hard-fail 5 s) — tracked by `apps/bench/dashboard/`.

## 1D extensions

- File-system persistence adapter (`InMemoryBackend` → `FsBackend`).
- `bake-worker.ts` — Node Worker that runs the kernel for server-side geometry baking.
- Additional CLI commands: `add-door`, `add-window`, `add-stair`.
