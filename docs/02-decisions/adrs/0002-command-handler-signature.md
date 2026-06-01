# ADR-002 — Command handler signature

| Field | Value |
|---|---|
| Status | **Accepted** (S02 D1, 2026-04-26 — revised in the S02 audit pass) |
| Decision owner | F (sign-off) |
| Drafters | Agent A (Track A) |
| Affects layers | L2 (command-bus), L1 (stores), L7 (plugins) |
| Supersedes | — |

## Context

Phase 1A locks the L2 command-bus contract before any of the 20 element
families ship handlers (S07–S12 alone will add ~140 handlers).  Two design
questions were on the table at S02 D1:

1. **Handler shape** — class-with-fields, function-with-metadata, or
   discriminated-union object?
2. **Async vs sync execution** — should every handler return a `Promise`?
3. **Validation gate** — should every handler expose a separate `canExecute`?
4. **Store typing** — should `HandlerContext.stores` be generic?

We need a shape that:

- Is statically introspectable (so `pryzm/affected-stores-required` can
  walk the AST without a type-checker pass).
- Carries the `affectedStores` declaration so the bus can scope notifications.
- Tolerates handlers that call into producers that may go async (S08
  geometry kernel, S22 sync, S50 AI).
- Is trivial to register/unregister at runtime (plugin host, S61).
- Surfaces "this command is invalid right now" without going through the
  exception path (so the UI can grey out a button).

## Decision

Each command handler is a **class** with these required surface members
(per `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md §S02-T1`, line 293):

```ts
interface CommandHandler<TPayload, TStores extends AnyStores = AnyStores> {
  readonly type: string;
  readonly affectedStores: readonly (keyof TStores & string)[];
  canExecute(
    ctx: HandlerContext<TStores>,
    cmd: TPayload,
  ): ValidationResult;
  execute(
    ctx: HandlerContext<TStores>,
    cmd: TPayload,
  ): Promise<HandlerResult> | HandlerResult;
}

type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: string };
```

### Argument order: `(ctx, cmd)`

Context first.  This matches the common functional middleware idiom (Express,
Koa, AWS Lambda) and lets handlers destructure `ctx.stores` / `ctx.audit`
once before reaching the payload.

### Why class

- The `pryzm/affected-stores-required` lint rule walks `ClassDeclaration`
  AST nodes and checks for a `PropertyDefinition` named `affectedStores`.
  No type-checker pass needed → fast lint, no IDE-blocking type-info dance.
- Classes survive minification with stable identity (vs functions that
  fold under cross-module inlining).
- Future plugin SDK (S61) can subclass `BaseCommandHandler` for shared
  audit/perm boilerplate without breaking the contract.

### Why `Promise<T> | T`

- 80% of element handlers are pure-synchronous Immer recipes; forcing
  them through `async` would add ~10× call-stack overhead per command,
  which puts the < 1 ms p95 bench out of reach.
- Geometry-kernel-touching handlers (wall.create, slab.create) must be
  async because the producer may yield to the scheduler.
- The bus always `await`s the result — sync handlers `await`-resolve
  in the same microtask.

### Why `canExecute` as a separate method

- Permits the UI to grey out a disabled toolbar button without throwing
  inside a render frame (R1A-16 mitigation).
- Pure pre-flight check — runs BEFORE `execute`.  Failure does NOT touch
  the undo stack, does NOT call the emitter, does NOT generate patches.
- Failure surfaces as a `CommandBusError("canExecute rejected — <reason>")`
  the calling layer (typically L7) catches and renders to the user.

### Why generic `HandlerContext<TStores>` (R1A-16)

The `HandlerContext.stores` field is generic over the actual stores the
handler declares (per the `affectedStores` field), not a fixed interface.
The bus throws **synchronously** (`CommandBusError`) if any required store
key is missing from the materialised `stores` map.

This explicitly outlaws the PRYZM 1 antipattern:

```ts
// PRYZM 1 — bad.  Silently falls back to globals.
const wallStore = (window as any).__wallStore ?? ctx.stores.wall;
```

In PRYZM 2 the bus's `buildContext()` walks `handler.affectedStores` and
calls `Object.prototype.hasOwnProperty(stores, key)` for each one; the
first missing key throws `CommandBusError("required store '<k>' is
missing from HandlerContext.stores")`.

### `HandlerResult` shape

```ts
interface HandlerResult {
  readonly forward: readonly Patch[];      // Immer JSON patches
  readonly inverse: readonly Patch[];      // for undo
  readonly nextStates?: Readonly<Record<string, unknown>>; // optional snapshots
}
```

`forward + inverse` are the contract; `nextStates` is an optimisation —
the bus may use it to skip re-applying patches when the handler already
produced the next state via `produceCommand(...)`.

### `EventRecord` wire shape (S02-T2 line 294)

```ts
interface PatchSnapshotEntry {
  readonly storeKey: StoreId;
  readonly forwardPatches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
  readonly capturedAt: string;
}

interface EventRecord {
  readonly id: string;            // ULID per ADR-001
  readonly type: string;
  readonly payload: unknown;
  readonly affectedStores: readonly StoreId[];
  readonly patches: readonly PatchSnapshotEntry[]; // grouped per store
  readonly forward: readonly Patch[];              // flat, all stores
  readonly inverse: readonly Patch[];              // flat, all stores
  readonly audit: AuditMetadata;
}
```

The `PatchSnapshotEntry` shape is copied verbatim from PRYZM 1's
`src/commands/PatchSnapshot.ts` per spec §1.2.

### Audit metadata

Every command produces an `EventRecord` with:

- `id` — ULID (per ADR-001)
- `audit.actorId` — user id, or one of the reserved values `'system'`,
  `'ai-floorplan'`, `'ai-generative'`, `'sync-replay'`
- `audit.projectId` — project the event belongs to
- `audit.clientId` — per-tab id (so two tabs of the same user are distinct)
- `audit.timestamp` — ISO-8601 captured at `executeCommand` start

These are **server-trusted** in the bake worker (S21) — clients submit them
but the worker overwrites `actorId`/`projectId` from the JWT.

### OTel naming convention (also locked S02 D1)

Span names follow `pryzm.<layer>.<verb>`:

| Layer | Verb | Span |
|---|---|---|
| L2 command-bus       | `execute` | `pryzm.command.execute` |
| L1 store             | `apply`   | `pryzm.store.apply` |
| L4 geometry kernel   | `produce` | `pryzm.kernel.produce` |
| L5 frame-scheduler   | `tick`    | `pryzm.frame.tick` |
| L5 scene-committer   | `commit`  | `pryzm.committer.commit` |
| L5 renderer          | `render`  | `pryzm.renderer.render` |

Attributes on `pryzm.command.execute`:
- `pryzm.command.type` (e.g. `wall.create`)
- `pryzm.command.affected_stores` (comma-joined)

## Consequences

**Good**

- Lint rule stays AST-only, < 1 ms / file.
- Bench `cmd-execute-latency` < 1 ms p95 is achievable (toy handler measured
  ~0.04 ms p95 at S02).
- Plugin SDK can publish `BaseCommandHandler` without contract changes.
- `canExecute` lets the UI render disabled state without exception flow.
- Generic `HandlerContext<TStores>` makes "missing required store" a
  TypeScript error at the call site AND a sync runtime error at
  `executeCommand` — defence in depth.

**Bad**

- Every handler is two more LOC than a function-style equivalent.
- Subclassing for shared boilerplate is tempting and may bloat plugin
  bundles — we will revisit if any plugin exceeds its 80 KB ceiling.
- `canExecute` discipline must be taught — handlers that mutate state
  inside `canExecute` (which is forbidden) will be caught by the S03 lint
  rule `pryzm/canExecute-pure`.

## Alternatives considered

- **Function-with-metadata** — lost: harder to lint without typecheck.
- **Discriminated union object** — lost: forces a single megaswitch in
  the bus and prevents per-handler unit testing.
- **Always-async** — lost: blew the 1 ms bench by 6×.
- **Throw-from-execute for invalid input** — lost: the undo stack would
  need a "last-op-was-thrown" sentinel and the UI would need exception
  flow to render disabled buttons.  `canExecute` is cleaner.
- **Non-generic `HandlerContext`** — lost: re-introduces the
  `(window as any)` fallback antipattern (R1A-16).

## References

- `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S02 (T1, T2, T6) and §5 R1A-16
- `08-VISION.md` §6 (bench contract)
- `tools/eslint-plugin-pryzm/src/rules/affected-stores-required.js`
- `packages/command-bus/src/{CommandBus,types,produceCommand,PatchEmitter,UndoStack}.ts`
