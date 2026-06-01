# PRYZM 2 — Element Family Recipe (v1)

> **Audience:** the next agent landing a new element family (door, window,
> slab, roof, curtain-wall, …) in `plugins/<family>/`.
>
> **Source:** `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S07-T7 +
> the wall plugin shipped this sprint (the canonical worked example).
>
> **Version:** v1 (S07). Updated whenever a new element family lifts a
> rule out of the wall recipe (currently nothing — wall is the template).

This document walks an agent through landing a new element family
end-to-end. The wall plugin (`plugins/wall/`) is the worked example
referenced throughout. Every section is **mandatory** unless explicitly
marked **optional**.

---

## 0. Pre-flight

Before writing a single file, confirm:

1. The element's **Zod schema** exists in `packages/schemas/src/elements/<Family>.ts`
   and is re-exported from `packages/schemas/src/elements/index.ts`
   (true for all 20 families since S01).
2. The element's **typed-id brand** exists — `IdFor<'door'>`, `IdFor<'slab'>`,
   etc. — in `packages/schemas/src/types/Id.ts`.
3. The triage **ADR** for this family is **Accepted** (`adr/0008-wall-handler-triage.md`
   for wall, `0010` for door, `0011` for curtain-wall). The ADR pins the
   command-handler triage (e.g. wall: 22 → 14, in three waves). No code
   lands until the ADR is Accepted.
4. The element's family is listed in the Sub-phase 1B (`PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md`)
   sprint matrix or its analog — the recipe is for **planned** families,
   not opportunistic ports.

---

## 1. Plugin scaffold

Create `plugins/<family>/` with this layout (file-for-file from
`plugins/wall/`):

```
plugins/<family>/
├── package.json              # @pryzm/plugin-<family>
├── tsconfig.json             # extends ../../tsconfig.base.json
├── vitest.config.ts
├── src/
│   ├── index.ts              # public surface (the only export consumers reach)
│   ├── store.ts              # <Family>Store extends Store<<Family>Data>
│   ├── system-type-store.ts  # OPTIONAL — only for elements with a type catalogue (wall, door, window)
│   ├── errors.ts             # <Family>SystemError hierarchy
│   └── handlers/
│       ├── index.ts          # registerHandlers() helper + WALL_HANDLER_TYPES
│       ├── Create<Family>.ts
│       ├── Delete<Family>.ts
│       ├── … (5 simplest, per the family's triage ADR)
│       └── …
└── __tests__/
    ├── store.test.ts
    ├── system-type-store.test.ts        # only if system-type-store.ts exists
    ├── handlers.test.ts                 # 5+ round-trip tests — one per handler
    └── baseline-fixtures.test.ts        # parity input fixtures
```

The wall plugin's `package.json` is the template — copy it, rename
`@pryzm/plugin-wall` → `@pryzm/plugin-<family>`, and adjust the
description.

### Layer matrix

`plugins/**` is **L7-plugin** in `eslint.config.js`. L7 may import from
every layer below — no boundary errors will fire.

---

## 2. Store

The store is `~50–100 LOC`. It extends `Store<T extends object>` from
`@pryzm/stores`, and exposes optional convenience reads (`byLevel`,
`byParent`, `ids`, `get`).

```ts
import { Store } from '@pryzm/stores';
import type { <Family> as <Family>SchemaInfer } from '@pryzm/schemas';

export type <Family>Data = <Family>SchemaInfer;
export type <Family>sState = Record<string, <Family>Data>;

export class <Family>Store extends Store<<Family>Data> {
  constructor() { super('<family>'); }
  // convenience readers — keep this layer thin
}
```

**Rules:**

* `storeKey` is the family name in `kebab-case` lowercase (`'wall'`,
  `'door'`, `'curtainWall'` → use `'curtainWall'` literal as the bus
  uses it as a property key).
* The store applies patches **verbatim** — no validation. Validation
  belongs at the **handler** boundary (handlers call `<Family>.parse(input)`
  before producing patches).
* Convenience readers are O(N) — fine for S07-era stores. Add an L1
  secondary index only when a bench shows > 100 µs on a 1000-row store.

---

## 3. Errors

`errors.ts` defines the typed error hierarchy. One base class so callers
can `instanceof <Family>SystemError` test the entire family. Each
subclass has a stable `name` for log filtering. **Do not** dispatch a
DOM event from the constructor — error fan-out belongs to L7 (DOM-free
per ADR-002 §3).

Mandatory subclasses:

* `<Family>NotFoundError` — store lookup miss
* `<Family>SchemaError` — Zod validation failure (carries `cause`)
* `<Family>DimensionsError` — geometry-input out of bounds

Plus a runtime predicate:

```ts
export function is<Family>SystemError(err: unknown): err is <Family>SystemError {
  return err instanceof <Family>SystemError;
}
```

---

## 4. Handlers — the 5-handler wave-1 floor

Every plugin must ship at minimum these 5 handler shapes (the wave-1
set in the triage ADR). They exercise every `Store<T>` mutation
primitive — add, replace, nested-replace, remove — so the L2 ↔ L1
wiring is proven before any producer / committer code lands.

| Handler | Patch primitive |
|---|---|
| `Create<Family>`        | `add` at `[id]` |
| `Delete<Family>`        | `remove` at `[id]` |
| `Move<Family>`          | `replace` at `[id, 'baseLine']` (or equivalent geometric anchor) |
| `Set<Family>Dimensions` | `replace` at `[id, '<scalar>']` × N (atomic) |
| `Set<Family>Color`      | `replace` at `[id, 'materialColor']` + `[id, 'materialId']` (atomic, with `null` clearing) |

### Handler skeleton

Every handler follows this exact shape (mirror `plugins/wall/src/handlers/Create<Family>.ts`):

```ts
import {
  produceCommand,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/command-bus';

export interface Create<Family>Payload { /* … */ }

type <Family>HandlerStores = Readonly<{ <family>: <Family>sState } & Record<string, unknown>>;

export class Create<Family>Handler
  implements CommandHandler<Create<Family>Payload, <Family>HandlerStores>
{
  readonly type = '<family>.create';
  readonly affectedStores = ['<family>'] as const;
  canExecute(ctx, cmd) { /* pure pre-flight; return {valid:false,reason} on bad input */ }
  execute(ctx, cmd) {
    const [next, forward, inverse] = produceCommand<<Family>sState>(
      ctx.stores.<family>,
      draft => { /* mutate */ },
    );
    return { forward, inverse, nextStates: { <family>: next } };
  }
}
```

**Rules:**

* `affectedStores` is `['<family>'] as const` for every wave-1 handler
  (single-store branch in `CommandBus.executeCommand`). Multi-store
  handlers (`['wall', 'level']` etc.) currently mis-route patches —
  the bus's per-store filter expects path-prefixed patches but Immer
  produces non-prefixed paths. Cross-store handlers wait for the bus's
  `produceWithPatchesPerStore` upgrade in S10 / 1C.
* Patch paths start with the entity id: `[<id>]`, `[<id>, 'height']`, …
  — **not** the store key.
* `canExecute` is pure — no side effects, no async. Returning
  `{ valid: false, reason }` aborts the command **without** pushing to
  the undo stack.
* `execute` may throw a typed `<Family>SystemError` — the bus surfaces
  it as `CommandBusError` and DOES NOT push the partial event.
* Audit metadata + ULID id are owned by the bus — never mint these in
  the handler.
* OTel span — the bus's `pryzm.command.execute` already wraps the entire
  pipeline. Add a nested span only when a handler invokes the L4
  producer (S08+).

### Atomic batch handlers

`Set<Family>Dimensions` is the canonical 3 → 1 collapse — every PRYZM 1
"set this one scalar" command becomes a single payload-optional
handler. Validation: `at least one of <fieldA> / <fieldB> / … is required`.

---

## 5. Handler index

`src/handlers/index.ts` exports two helpers and a stable list of
command-type strings:

```ts
export const <FAMILY>_HANDLER_TYPES = ['<family>.create', '<family>.delete', /* … */] as const;
export function buildHandlerSet(): readonly CommandHandler<unknown>[] { /* … */ }
export function register<Family>Handlers(bus: CommandBus): readonly string[] { /* … */ }
```

`bootstrap.ts` calls `register<Family>Handlers(bus)` once per plugin —
that's the only line of editor code the new family adds.

---

## 6. System-type store (optional)

For element families with a **type catalogue** (wall, door, window,
floor, ceiling), add `system-type-store.ts`. The catalogue:

* Is **NOT** part of the undo/redo history — types are project-level
  configuration, not element mutations.
* Is **read** by handlers (to validate `systemTypeId` references) but
  never **written** to by them. Type management is a separate UI concern
  that lands in 1C.
* Seeds with N built-in types (8 for wall, ~6 for door, ~4 for window)
  and accepts user-scoped `add()` calls with duplicate-id rejection.
* Lives in the same plugin as the data store so handlers can access it
  via plain object reference (no global lookup).

---

## 7. Tests

Each plugin ships **four** test files (mirror `plugins/wall/__tests__/`):

| File | Purpose |
|---|---|
| `store.test.ts`               | Patch-application correctness, dirty-diff fan-out, frozen snapshots |
| `system-type-store.test.ts`   | Built-in count, totalThickness math, duplicate-id rejection (only if system-type-store.ts exists) |
| `handlers.test.ts`            | Round-trip: forward → assert → undo → assert prior snapshot byte-equal — one block per handler |
| `baseline-fixtures.test.ts`   | Loads each PRYZM 1 input fixture, asserts shape + canExecute → execute resolves |

The handlers test uses `attachStores(emitter, { <family>: store })` to
prove the bus → store wiring end-to-end. Round-trip equality uses
`JSON.stringify(JSON.parse(...))` as the snapshot comparator.

---

## 8. Baseline parity fixtures

Five PRYZM 1 input fixtures live under `tests/fixtures/pryzm-1/<family>/{create,
delete, move, dimensions, color}.json`. Each fixture has this shape:

```jsonc
{
  "meta": {
    "source": "src/commands/<family>/<Pryzm1Command>.ts",
    "capturedAt": "2026-04-26T18:30:00Z",
    "description": "…",
    "deviationsFromPryzm1": ["…"]
  },
  "setup": { "<family>s": [/* prerequisite rows; absent for create */] },
  "command": { "type": "<family>.create", "payload": { /* … */ } },
  "expect":  { "valid": true, "<key>After": /* … */, "undoRestores…": true }
}
```

Pin ids to deterministic ULIDs (`wall_01HYY00000000000000000FX01`) so
parity comparisons across runs are stable. The output side (post-execute
snapshot + geometry) is captured in S08 once the producer lands.

---

## 9. Bench

Add `apps/bench/src/benches/<family>-handlers.bench.ts` with one
`measure()` block per wave-1 handler. Budget: **`warnMs: 0.5`,
`budgetMs: 1.0`** (same envelope as `move-cube` and `wall-handlers`).
The hard-fail flip is owned by `scripts/check-regression.mjs`; the
test asserts `sample.p95 > 0` only.

---

## 10. Bootstrap wiring

The editor bootstrap (`apps/editor/src/bootstrap.ts`) is the only
non-plugin file the new family touches. The wiring is one line per
plugin:

```ts
import { <Family>Store, register<Family>Handlers, buildHandlerSet } from '@pryzm/plugin-<family>';

const stores = { <family>: new <Family>Store(), /* … */ };
const handlers = [...buildHandlerSet(), /* … */];
const runtime = bootstrap({ audit, stores, handlers });
```

`bootstrap.ts` already routes patches via `attachStores(emitter, stores)`
and snapshots `Object.fromEntries(store.getState())` per command via
`storesProvider`. No further wiring is needed for the data half.

---

## 11. Producer & committer (lands in S08 / S09)

S08 lifts the family's producer to `packages/geometry-kernel/producers/<family>.ts`
(pure function, no THREE — `pryzm/no-three-in-kernel` enforces this).
S09 lifts the family's committer to `plugins/<family>/src/committer.ts`
(THREE-side, the only place a plugin may import THREE per
`pryzm/no-three-outside-committer`). Neither file exists at the wave-1
landing point — the recipe is intentionally headless-only at S07.

---

## 12. Process-tracker

After landing, append a row to `docs/03_PRYZM3/reference/status-detail/01-PROCESS-TRACKER.md`
under the appropriate sprint section. Mark `[x]` only when:

1. `npm run build` is green from a clean checkout.
2. The plugin's vitest suite is green.
3. The bench file's vitest suite is green and a baseline row has
   landed in `apps/bench/baseline.json`.
4. Lint is green — the new plugin's files comply with the boundaries
   matrix and (where relevant) `pryzm/affected-stores-required` and
   `pryzm/no-three-in-kernel`.

The PRYZM 1 mirror under `src/elements/<family>/**` and
`src/commands/<family>/**` MUST stay byte-for-byte unchanged until the
1B demo flips kill-switch K1B-4 in S12 D9.

---

## Appendix A — wall plugin file cross-reference

The full v1 worked example, file-by-file:

* `plugins/wall/package.json` — package shape (deps: command-bus, schemas,
  stores, protocol, immer, ulid)
* `plugins/wall/src/store.ts` — `WallStore extends Store<WallData>`
* `plugins/wall/src/system-type-store.ts` — 8 built-ins, side-system
* `plugins/wall/src/errors.ts` — `WallSystemError` hierarchy
* `plugins/wall/src/handlers/{CreateWall,DeleteWall,MoveWall,SetWallDimensions,SetWallColor}.ts` — 5 wave-1 handlers
* `plugins/wall/src/handlers/index.ts` — `registerWallHandlers(bus)`
* `plugins/wall/__tests__/{store,system-type-store,handlers,baseline-fixtures}.test.ts`
* `tests/fixtures/pryzm-1/wall/{create,delete,move,dimensions,color}.json`
* `apps/bench/src/benches/wall-handlers.bench.ts`
* `docs/architecture/adr/0008-wall-handler-triage.md`

---

## Appendix B — porting a producer (added S08, ADR-009)

S08 landed the **first** kernel producer (`produceWall`).  This appendix
captures the porting recipe so the next family-agent (door, window,
slab, …) can reproduce the same shape without re-deriving the rules.

### B.1 Producer signature (frozen by ADR-009)

```ts
export type Producer<TDto> = (
  dto:      Readonly<TDto>,
  joinData: Readonly<JoinData>,
  worldY:   number,
) => BufferGeometryDescriptor;
```

* The producer is **pure** — no clocks, no `Math.random`, no globals,
  no `THREE` imports.  A producer that violates purity will fail the
  Node ↔ in-process byte-equality gate (`tests/parity/<element>/
  <element>-headless-node.test.ts`).
* `joinData` is the **only** way neighbour information enters the
  producer.  It is resolved upstream by the wall (or door, slab, …)
  store from a topology query.  Producers MUST NOT read other DTOs.
* `worldY` is the level-floor world Y; the producer ignores
  `dto.baseLine[*].y` (PRYZM 1 stored level elevation there for
  legacy reasons).

### B.2 Lifting helpers from PRYZM 1

PRYZM 1 builders under `src/elements/<family>/**` are the source of
truth for geometry mathematics.  S08 lifted seven helpers verbatim
(or with the minimal `THREE.Vector3 → Point3D` adapter) into
`packages/geometry-kernel/src/producers/_internal/`:

| PRYZM 1 source                     | Kernel target                              | Adaptation                  |
|---|---|---|
| `WallPathBuilder`                  | `_internal/WallPath.ts`                    | none (was already plain math) |
| `MiterPrismBuilder`                | `_internal/buildMiterPrism.ts`             | THREE → tuples              |
| `composeWallGeometryHash`          | `_internal/composeWallGeometryHash.ts`     | adds `WALL_HASH_SCHEMA_VERSION=1` to defeat cross-version collisions |
| `LayeredWallOpeningBuilder`        | `_internal/buildLayeredOpenings.ts`        | THREE → typed-array; `pushQuad` formulae verbatim |
| `WallOpeningPositionResolver`      | `_internal/computeOpeningWorldPos.ts`      | THREE → `Point3D`           |
| `CurvedWallLayerBuilder`           | `_internal/buildCurvedLayer.ts`            | THREE → tuples              |
| `CurvedWallCapMiter`               | `_internal/projectCapVertex.ts`            | THREE → tuples              |

Rule: **never edit the PRYZM 1 source under `src/elements/<family>/**`
or `src/commands/<family>/**` while porting**.  Kill-switch K1B-4 must
hold until the family's S12-equivalent demo flip.

### B.3 Determinism checklist

The kernel's byte-equality gate (`wall-headless-node.test.ts`) catches
non-determinism.  When porting a new producer, scrub the following:

1. No `Map` iteration unless the keys are sorted before iteration.
2. No `Object.entries` over user-controlled keys without
   `.sort((a, b) => a[0].localeCompare(b[0]))`.
3. All `-0` values are pinned to `+0` by `serializeDescriptor`.
4. Hashing uses **stable** JSON: `JSON.stringify` keys are sorted.
5. Material keys are de-duplicated across groups (see
   `serializeDescriptor` for the canonical implementation).

### B.4 Parity-fixture authoring

* Add fixtures to
  `packages/geometry-kernel/__tests__/__configs__/<family>.ts`.
* Write a per-family snapshot test under
  `tests/parity/<family>/<family>-snapshot.test.ts` (use
  `tests/parity/wall/wall-snapshot.test.ts` as a template — it is
  ~80 LOC).
* Mirror the headless-node parity test under
  `tests/parity/<family>/<family>-headless-node.test.ts`.
* See `docs/architecture/parity-fixtures.md` for the full fixture
  format and PRYZM 1 cross-engine capture procedure.

### B.5 Bench requirements

Every producer adds three rows to `apps/bench/src/benches/produce-
<family>.bench.ts`: a simplest-fixture row, a layered/decorated row,
and a heaviest realistic row (e.g. wall + openings).  All three rows
ship a baseline in `apps/bench/reports/produce-<family>-baseline.md`
and contribute their p95 to the relevant `08-VISION.md §6` contract.
