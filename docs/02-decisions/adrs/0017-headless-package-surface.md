# ADR-0017 — Headless package public surface (S18)

**Status:** Accepted  
**Sprint:** S18 (PHASE-1C Q3 M8)  
**Authors:** PRYZM Architecture team  
**Date:** 2026-04-27  
**Cross-references:**
- Spec: `docs/03_PRYZM3/reference/phases/PHASE-1/1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S18 (lines 937–1060).
- Strategic ADR-002 — events-first / patches-second.
- Strategic ADR-020 — headless determinism.
- Code-level ADR-0016 — view state command-driven (view.switch headless reachability).

---

## Context

S15 created the `apps/headless` skeleton: a `createHeadlessRuntime()` function
that wires the L0–L4 stack (CommandBus, PatchEmitter, EventLog) with no THREE,
no DOM, no `requestAnimationFrame`.  The K1-B kernel-purity test confirms that
`require.cache` contains no `three` entries after boot.

S18 elevates the skeleton into a genuine alpha:

1. **CLI subcommands** (`new-project`, `add-wall`, `add-slab`, `export-pryzm`)
   enable CI smoke tests and the "create project from CLI, open in browser" demo.
2. **Frozen public surface** — callers depend only on `@pryzm/headless`, never
   on individual `@pryzm/command-bus` / `@pryzm/persistence-client` internals.
3. **K2-A purity gate** — vitest tests assert the module graph remains clean
   after each CLI subcommand runs.

The architectural question this ADR answers is: **what is the stable public
surface of `@pryzm/headless`?**

---

## Decision

### 1 — Public exports (frozen S18)

```ts
// apps/headless/src/index.ts

export { createHeadlessRuntime }        // factory
export type { HeadlessRuntime }         // interface — not a class
export type { HeadlessRuntimeOptions }  // factory input
export type { CommandBus }              // re-exported from @pryzm/command-bus
export type { PatchEmitter }            // re-exported from @pryzm/command-bus
export type { EventLog }                // re-exported from @pryzm/persistence-client
```

Callers MUST NOT import from `@pryzm/command-bus` or `@pryzm/persistence-client`
directly in headless contexts.  The indirection lets us swap implementations
(e.g. a WAL-backed `EventLog` in S19) without breaking consumers.

### 2 — CLI subcommands

| Subcommand       | Entry module                              | Purpose                                      |
|------------------|-------------------------------------------|----------------------------------------------|
| `new-project`    | `src/commands/newProject.ts`              | Create runtime; print registered handlers   |
| `add-wall`       | `src/commands/addWall.ts`                 | Issue `wall.create`; print event id         |
| `add-slab`       | `src/commands/addSlab.ts`                 | Issue `slab.create`; print event id         |
| `export-pryzm`   | `src/commands/exportPryzm.ts`             | Serialise full event log to JSON envelope   |

Each subcommand:
- Accepts a `quiet: boolean` flag to suppress stdout (used by tests).
- Returns a typed result object (never `void`) so programmatic callers don't
  need to parse stdout.
- Receives a `HeadlessRuntime` (injected) rather than creating one internally —
  the CLI entry (`cli.ts`) owns runtime creation and shutdown.

### 3 — Export envelope format (`.pryzm` v1)

```ts
interface PryzmExportEnvelope {
  formatVersion: 1;
  exportedAt: string;      // ISO-8601
  projectId: string;
  eventCount: number;
  events: PersistedEvent[];
}
```

`formatVersion` is a literal `1` — a future breaking change bumps to `2`.
The import path (S19+) validates `formatVersion` before attempting replay.

### 4 — K2-A purity gate

The S18 vitest suite (`__tests__/headless-s18.test.ts`) asserts:

- K2-A-1: `createHeadlessRuntime()` boots without error.
- K2-A-2: No `three` module in `require.cache` after boot.
- K2-A-3: `runNewProject()` returns a `NewProjectResult` with the correct `projectId`.
- K2-A-4: `runExportPryzm()` on a fresh runtime returns `eventCount: 0`.
- K2-A-5: `commandBus.registeredTypes` is an array on a bare runtime.

These gates run in CI on every push and are the source of truth for the
"kernel purity verified" label on S18's K2-A acceptance criterion.

---

## Consequences

### Positive

- ✅ Headless callers have a stable, versionable public API (`@pryzm/headless`).
- ✅ CLI enables the "CLI-first project creation" demo for S18 milestone reviews.
- ✅ K2-A purity tests run in CI — any accidental THREE import is caught before merge.
- ✅ The export envelope format is versioned from day 1, removing a class of
  future migration debt.

### Negative

- ⚠️ The CLI is not yet wired to an installable npm binary — that lands in S19
  once the file-system backend ships.  For now it runs via `tsx apps/headless/src/cli.ts`.
- ⚠️ `add-wall` / `add-slab` require the respective plugin handlers to be
  registered against the bus before dispatch — the CLI stub currently creates
  a bare runtime without plugin wiring, so those subcommands will throw on an
  unregistered `wall.create` type.  Wiring the plugin registry is a S18 follow-up
  tracked in the session plan.

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| CLI stdout format changes break scripts. | `PryzmExportEnvelope.formatVersion` is a versioned literal. Consumers check it before parsing. |
| `require.cache` check is CJS-only; ESM has no equivalent. | K2-A-2 is explicitly a CJS check (Node.js < v22). For ESM the purity check migrates to import-graph analysis via the isolation lint in S19. |
| Bare runtime + `add-wall` throws on unregistered handler. | Documented as a known limitation in S18; plugin-wiring CLI flag (`--plugins all`) is the S19 follow-up. |
