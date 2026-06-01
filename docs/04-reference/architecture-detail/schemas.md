# PRYZM 2 — Schemas (S01 deliverable)

> Sprint **S01** of `docs/03-execution/plans/legacy/phases/PHASE-1/1-FOUNDATION-M1-M12.md`.

The `@pryzm/schemas` package is the runtime schema layer for PRYZM 2. The
`@pryzm/protocol` package is the public DTO surface that re-exports it.
Everything else in PRYZM 2 (L1 stores, sync, AI, plugins, IFC import/export)
must depend on `@pryzm/protocol`, never on `@pryzm/schemas` directly — this
is the contract that lets us evolve the implementation without breaking
consumers.

## Layout

```
packages/
  schemas/
    src/
      types/Id.ts            ← branded ID types for the 20 element families
      factory/createId.ts    ← createId / isId / parseId / unbrand
      base/
        primitives.ts        ← Vec2, Vec3, ColorRgb, Aabb, Metadata, IfcData
        refs.ts              ← idRef(prefix), elementType(literal)
        BaseNode.ts          ← defineElement(type, ext) helper
      elements/              ← 20 element schemas (Wall, Slab, …, Project)
      registry.ts            ← SCHEMA_REGISTRY: { wall: Wall, … }
      index.ts               ← public surface
    __tests__/
      round-trip.test.ts     ← parse({}) → JSON → parse byte-equality
      typed-id.test.ts       ← runtime + // @ts-expect-error compile-time guards
  protocol/
    src/index.ts             ← re-exports from @pryzm/schemas
```

## The 20 element families

Wall, Slab, Door, Window, Roof, CurtainWall, Grid, Column, Beam, Stair,
Handrail, Ceiling, Room, Furniture, Annotation, Dimension, Sheet, Schedule,
View, Project.

Every element is built with `defineElement(type, ext)`, which provides the
shared base shape (`id`, `type`, `parentId`, `childrenIds`, `metadata`,
`ifcData?`) and lets each element add its own extension fields.

## Typed IDs

```ts
import { createId, type WallId, type SlabId } from '@pryzm/protocol';

const w: WallId = createId('wall');           // ✅ "wall_01H8X…"
const s: SlabId = createId('slab');           // ✅ "slab_01H8X…"
const bad: WallId = s;                        // ❌ TS error
const bad2: WallId = 'wall_01H8X…';           // ❌ TS error (no brand)
```

ID format: `<prefix>_<26-char Crockford-base32 ULID>`. The prefix is the
element-type discriminator (one of the 20 above). The ULID is monotonic-ish
and URL-safe.

## Defaults & round-trip contract

Every schema's `parse({})` returns a fully-populated, valid instance with a
freshly-minted typed ID:

```ts
import { Wall } from '@pryzm/protocol';

const w = Wall.parse({});
JSON.stringify(Wall.parse(JSON.parse(JSON.stringify(w)))) === JSON.stringify(w);
// ↑ byte-identical round-trip is enforced by the test suite
```

This is non-trivial under zod v4 because `.default(value)` does not re-parse
the supplied default — so any nested-object default must already be fully
populated. The base `BaseNode` helper takes care of this for `metadata`; do
the same with `.default(() => Inner.parse({}))` inside any element that has
nested object defaults (see `Project`, `View`).

## Refinements (per-element invariants)

| Schema      | Refinement                                                         |
| ----------- | ------------------------------------------------------------------ |
| `Wall`      | (1) `baseLine` endpoints must be ≥ 0.05 m apart; (2) both endpoints must share the same `y`; (3) `childrenIds` must be a superset of `openings[*].elementId` |
| `Grid`      | every `arc` line must define a positive `radius`                   |
| `Sheet`     | `size === 'CUSTOM'` requires `customSize` (mm)                     |
| `Dimension` | linear ≥ 2 points; angular ≥ 3 points; spot ≥ 1 point              |
| `Project`   | `levels[].id` must be unique                                       |
| `Roof`      | `pitch` must be in `[0, π/2)` (numeric range, no extra refinement) |
| `Furniture` | `scale > 0` (numeric range, no extra refinement)                   |

The three Wall refinements are lifted directly from PRYZM 1's
`WallDataSchema` so the new Zod schemas can never accept a wall that
PRYZM 1 would reject.

## Tests

```bash
npm test --workspace=@pryzm/schemas
# 81 tests across round-trip + typed-id specs (71 + 10)
# coverage: 100 % statements / 100 % branches / 100 % functions / 100 % lines
```

`tests/fixtures/pryzm-1-snapshots/<element>/` holds representative
fixtures that prove the schemas accept real PRYZM 1 element shapes — one
folder per element type, with at least one fixture for every type
(Wall, Slab, Door, Window, Roof, CurtainWall, Grid, Column, Beam,
Stair, Handrail, Ceiling, Room, Furniture, Annotation, Dimension,
Sheet, Schedule, View, Project — 20 / 20). New fixtures dropped into
`<element>/` are auto-discovered by `round-trip.test.ts`.

## Bundle budget

| Target                  | Budget   | Actual    |
| ----------------------- | -------- | --------- |
| `@pryzm/protocol` raw   | < 50 KB  | 23.4 KB   |
| `@pryzm/protocol` gzip  | < 15 KB  | 6.5 KB    |

Sizes exclude `zod` and `ulid` (peer/consumer-shipped). Measured with
`esbuild --bundle --format=esm --target=es2022 --tree-shaking=true`.
