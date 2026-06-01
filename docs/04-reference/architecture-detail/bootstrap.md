# Editor bootstrap — single source of truth

> **Status**: Authoritative for PRYZM 2 Phase 1 closeout (W-15,
> `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`).

## TL;DR

There is **one** way to bootstrap the PRYZM 2 editor runtime:

```ts
import { bootstrapWithEverything } from '@pryzm/editor';

const runtime = bootstrapWithEverything({
  audit: { actorId, projectId, clientId: 'editor-web' },
  // optional: production wires this so `pryzm.boot` ends on first commit
  onFirstFrame: (cb) => frameScheduler.onceFirstCommit(cb),
});
```

Every other entry point that previously existed (`bootstrap.render.data.ts`,
`bootstrap.ts` direct calls from app code, ad-hoc render-stub setups
in tests) has either been deleted or made internal.  This page exists
so that future contributors do not re-introduce a parallel bootstrap.

## What `bootstrapWithEverything` guarantees

1. **All 13 plugins wired.**  The `ALL_PLUGINS` list in
   `apps/editor/src/PluginRegistry.ts` is the single registration
   point.  Adding a 14th element family in PRYZM 2A is a one-line
   addition; no edit to `bootstrap.everything.ts` is needed.
2. **Stores keyed deterministically.**  `runtime.stores[storeKey]` is
   populated by walking the registry; `registeredStoreKeys` is
   exported on the runtime so dev tools / tests can iterate without
   hard-coding key strings.
3. **Handlers registered in registry order.**  Last-write-wins on
   conflict; caller-supplied overrides via `BootstrapOptions.handlers`
   are appended after the registry pass.
4. **`pryzm.boot` OTel root span.**  W-08 wraps the entire wire-up in
   `tracer.startSpan('pryzm.boot')` with attributes
   `boot.module_count`, `boot.handler_count`, `boot.store_count`,
   plus `boot.first_frame_ms` (when `onFirstFrame` is supplied) or
   `boot.synchronous_ms` (when not).  Errors are recorded with
   `SpanStatusCode.ERROR` and re-thrown.

## The bootstraps that no longer exist

### `bootstrap.render.data.ts` — DELETED in W-15

This file used to set up a renderer-only mini-runtime for the data
layer used by the headless render snapshot tests.  It

* duplicated the plugin-wiring loop from `bootstrap.everything.ts`,
* hard-coded the wall plugin instead of walking `ALL_PLUGINS`,
* exported a parallel `bootstrapRenderWithWalls()` symbol that drifted
  silently when the everything-runtime gained new options.

The G-3 audit row in `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`
flagged this as "two bootstraps, one of them rotting" — it was the
single largest contributor to the Phase 1 hand-rolled-test risk.

#### Replacement

The contract is now enforced by
`apps/editor/__tests__/bootstrap-shape.test.ts` (W-15 deliverable).
That test asserts:

1. `bootstrap.render.data.ts` does not exist on disk.
2. `apps/editor/src/index.ts` does not export
   `bootstrapRenderWithWalls`.
3. `bootstrapWithEverything` returns a runtime with at least 13
   stores and 12 element-family plugins worth of handlers.

If any of those guarantees regresses, the test fails and a PR cannot
land — this is the lockout that prevents a second bootstrap from
re-emerging.

### Direct calls into `bootstrap.ts`

The lower-level `bootstrap()` in `apps/editor/src/bootstrap.ts` is
**internal** and consumed only by `bootstrap.everything.ts`.  App
code, tests, and external entry points must call
`bootstrapWithEverything()` instead.

`apps/editor/package.json` deliberately does NOT export
`./bootstrap` — only `./bootstrap.everything` and the package
entry point are public.  Test the export shape via the W-15 contract
test rather than re-introducing a deep import.

## Adding a new entry point

Don't.  Add a thin wrapper around `bootstrapWithEverything` instead.
The wrapper may

* pre-populate `audit` from a session/auth source,
* call `runtime.commandBus.dispatch(...)` to seed a default project
  state,
* register additional handlers via `BootstrapOptions.handlers`,

but it must NOT re-walk `ALL_PLUGINS` or instantiate any committers /
stores by hand.  All such logic belongs inside the registry.

## Cross-references

* `apps/editor/src/bootstrap.everything.ts` — the implementation.
* `apps/editor/src/PluginRegistry.ts` — `ALL_PLUGINS` source of truth.
* `apps/editor/__tests__/bootstrap-shape.test.ts` — W-15 contract test.
* `docs/03-execution/plans/legacy/phases/audits/PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`
  §G-3 / W-15 — audit context.
* `docs/04-reference/architecture-detail/boundaries.md` — overall layering rules
  (W-16 deliverable; bootstrap rules cross-link from there).
