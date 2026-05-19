# Phase B continuation — `commandManager.execute(...)` → `runtime.bus.executeCommand(...)` migration

**Status**: OPEN — tracking only, not yet scheduled.
**Companion to**: Phase B (S72 §17 — initial swap of explicit `commandManager.execute(...)` callers → `runtime.bus.executeCommand(...)` adapters in command-handler entry points).
**Created**: 2026-04-29 (S72)

---

## What this is

The original Phase B pass swapped the *handler-side* of the command bus over to `runtime.bus.executeCommand(...)`.  The *caller-side* — UI tools, AI assistants, persistence code, etc. that synchronously invoke `commandManager.execute(typeOrPayload)` — was deliberately scoped out as "next pass."

Counted reaches as of **2026-04-29 12:58 UTC** (after Phase B's handler swap landed but before any caller-side migration):

```
TOTAL REACHES: 195
TOTAL FILES:   121
```

(See §3 for the per-file breakdown, top offenders first.)

These calls all go through the *legacy* `CommandManager` singleton, not through the new `runtime.bus`.  As long as `CommandManager` continues to forward `execute()` into the bus, behavior is preserved — but every reach is a place that:

1. assumes a global mutable singleton exists (defeats `runtime.bus` lifetime / project-scoping);
2. cannot easily be intercepted by middleware (the bus's whole point);
3. cannot participate in the `Result<T, E>` discipline (legacy `execute()` throws or returns `void`);
4. blocks the eventual deletion of the `commandManager` re-export shim.

---

## Why this is its own pass (not Phase B's continuation in-place)

Phase B's handler-side swap was mechanical: change the *registration* of each handler from `commandManager.register(type, fn)` to `runtime.bus.registerHandler(type, fn)`.  No call-site reasoning required.

The caller-side swap is *invasive* because:

- callers have varying access to `runtime` — some are in tools that already receive `runtime` via constructor injection; many UI components reach into the global `commandManager` from inside event handlers without any DI plumbing;
- a number of call-sites pass *partially-built* command payloads and rely on `CommandManager` to fill in defaults (project id, viewer id, transaction id) — those defaults must move to the call-site or a thin adapter;
- some call-sites are inside loops where the `void`-returning `execute()` is fine, but `runtime.bus.executeCommand(...)` returns `Result<T, E>` — every call becomes an `if (result.kind === 'err')` check or a deliberate `.unwrap()`;
- AI assistants in `src/ai/**` call into `commandManager.execute()` via reflection from generated tool-call JSON — the migration has to keep the reflective entry alive *somewhere* (probably a thin runtime-aware adapter in `apps/headless` or `src/ai/AiToolDispatcher.ts`), not delete the dispatch surface entirely.

For these reasons it deserves its own scoped pass with its own design notes (this file).

---

## Top offenders (per-file)

These are where the work concentrates.  Counts include all `commandManager.execute(` lexical matches in `*.ts` / `*.tsx` under `src/` and `apps/`.

| Reaches | File |
|---------|------|
| 17 | `src/ui/PropertyInspector.ts` |
| 11 | `src/ui/property-inspector/RoomPropertySection.ts` |
| 5  | `src/ui/ViewPropertiesPanel.ts` |
| 5  | `src/engine/subsystems/initUI.ts` |
| 5  | `src/elements/rooms/RoomTool.ts` |
| 4  | `src/spatial/RoomAutoOrganiser.ts` |
| 4  | `src/elements/slabs/SlabTool.ts` |
| 4  | `src/ai/rooms/RoomAIAssistant.ts` |
| 3  | `src/ui/data/buckets/StrategizeBucket.ts` |
| 3  | `src/elements/rooms/RoomTagAutoPopulator.ts` |
| 3  | `src/elements/preview/PreviewManager.ts` |
| 3  | `src/elements/furniture/FurnitureTool.ts` |
| 3  | `src/core/persistence/ProjectLoader.ts` |
| 2  | `src/ui/ViewBrowser/panels/SheetsRailPanel.ts` |
| 2  | `src/ui/property-inspector/WallLayerSection.ts` |
| 2  | `src/ui/generative/BriefInputPanel.ts` |
| 2  | `src/ui/furniture-carousel/FurnitureDragDropHandler.ts` |
| 2  | `src/tools/SelectionManager.ts` |
| 2  | `src/tools/HostedElementDragController.ts` |
| 2  | `src/services/SlabDependencyTracker.ts` |
| ... | (101 more files at 1 reach each) |

To regenerate this table:

```sh
rg -c "commandManager\.execute\(" --glob '*.ts' --glob '*.tsx' src apps \
  | sort -t: -k2 -n -r
```

---

## Proposed migration shape

Three call-site patterns are emerging from a quick scan of the top 5 offenders:

### Pattern A — Tool / element class with `runtime` already injected

Examples: `RoomTool`, `SlabTool`, `FurnitureTool`, `SelectionManager`.

```ts
// Before
commandManager.execute({ type: 'room.set-name', payload: { id, name } });

// After
const result = runtime.bus.executeCommand({ type: 'room.set-name', payload: { id, name } });
if (result.kind === 'err') runtime.toast.error(result.error.message);
```

These are mechanical — the tool already holds `runtime`, just rewrite each reach.

### Pattern B — UI panel reaching into `commandManager` from a click handler

Examples: `PropertyInspector` (17 reaches), `RoomPropertySection` (11 reaches), `ViewPropertiesPanel` (5 reaches).

These panels typically receive `runtime` via prop / context but currently bypass it for legacy reasons.  The migration is mechanical *once* the panel's constructor / props gain a `runtime` reference — but we need to make sure the same panel instance always sees the same `runtime` (don't take the global).

### Pattern C — AI assistant dispatching from generated JSON

Examples: `src/ai/rooms/RoomAIAssistant.ts` (4 reaches), `src/ai/AiToolDispatcher.ts`.

The reflective entry (`commandManager.execute({ type: rawType, payload: rawPayload })`) needs to keep working.  Two viable replacements:

- thin adapter `runtime.ai.dispatch(rawType, rawPayload)` that forwards to `runtime.bus.executeCommand(...)` *and* applies the AI-specific guardrails (allow-list, payload re-validation, audit log);
- keep `commandManager` as a deprecated shim that internally does `runtime.bus.executeCommand(...)` and tag every reach with `// TODO(B-cont): replace with runtime.ai.dispatch`.

Recommend: build the `runtime.ai.dispatch` adapter, migrate the AI files first (only 4 + dispatcher = ~8 reaches), then proceed with Patterns A and B.

---

## Suggested batching

If/when this pass is scheduled, batch by the patterns above to keep each PR reviewable:

1. **B-cont.1** — Pattern C (`src/ai/**` — ~8 reaches).  Smallest, most isolated, sets up the `runtime.ai.dispatch` shim.
2. **B-cont.2** — Pattern A (tools / element classes — ~30 reaches across `src/elements/**`, `src/tools/**`, `src/spatial/**`).  Mechanical.
3. **B-cont.3** — Pattern B (UI panels — ~80 reaches, dominated by `PropertyInspector` + `RoomPropertySection`).  Largest; may need a panel-base-class refactor first to thread `runtime` through.
4. **B-cont.4** — Persistence + everything else (`src/core/persistence/**`, `src/services/**`, long-tail single-reach files).
5. **B-cont.5** — Delete the `commandManager` re-export shim. Validate via `rg "commandManager\.execute\("` returns zero hits.

---

## Risk notes

- **Result discipline**: every call-site flip from `void` → `Result<T, E>` is a new error-handling decision. Default rule: if the legacy code did nothing on failure (most click handlers), preserve that with `if (result.kind === 'err') runtime.toast.error(result.error.message)`. Don't silently `.unwrap()`.
- **AI dispatcher allow-list**: the AI today can call any command. The new `runtime.ai.dispatch` adapter is the right place to add the allow-list — do *not* backport the allow-list into `runtime.bus.executeCommand` itself.
- **Hot paths**: a few `commandManager.execute()` reaches are inside drag loops (`HostedElementDragController` — 2 reaches per frame). The `Result<T, E>` allocation cost is tiny (single object) but worth profiling once at the end of B-cont.2.
- **Undo/redo coupling**: `CommandManager` today owns the undo stack. The bus has its own transaction model. Verify before B-cont.5 that nothing reaches into `commandManager.undoStack` directly — `rg "commandManager\.(undoStack|history|stack)"` should be empty.

---

## How to update this file

After each B-cont batch lands, append a "## Progress" section with:

- batch label + commit hash,
- before/after reach count,
- any unexpected discoveries,
- the next planned batch.
