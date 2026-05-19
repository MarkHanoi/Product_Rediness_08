# @pryzm/plugin-furniture

PRYZM 2 — Furniture plugin. **S27 / ADR-0024.**

The first second-tier element family in PRYZM 2 whose producer output depends on
a runtime LOD selector. Each Furniture DTO carries up to five per-LOD
representations (`representations['0'..'4']`); the producer reads the one named
by `activeLod`, falling back through the ladder R2 → R3 → R1 → R4 → R0 →
empty-descriptor when the requested level is missing (ADR-0024 §3).

## Surface

```
@pryzm/plugin-furniture            // public barrel
@pryzm/plugin-furniture/store      // FurnitureStore
@pryzm/plugin-furniture/handlers   // 7 command handlers
@pryzm/plugin-furniture/catalogue  // FurnitureCatalogue + seed
@pryzm/plugin-furniture/tool       // FurniturePlacementTool
@pryzm/plugin-furniture/committer  // FurnitureCommitter (THREE-bound)
@pryzm/plugin-furniture/errors     // typed errors
@pryzm/plugin-furniture/intent     // pure validation helpers
```

## Handlers (per ADR-0024 §4)

| type                                | what it does                                            |
| ----------------------------------- | ------------------------------------------------------- |
| `furniture.create`                  | mint a new Furniture; carrier of `catalogId` + reps     |
| `furniture.delete`                  | remove                                                  |
| `furniture.move`                    | translate origin by Δ                                   |
| `furniture.rotate`                  | absolute rotation about Y, radians                      |
| `furniture.setScale`                | uniform scale multiplier (positive)                     |
| `furniture.setActiveLod`            | swap `activeLod` ∈ {0..4}; producer hash changes        |
| `furniture.setRepresentation`       | populate / overwrite one LOD slot                       |

Auto-LOD by camera distance is explicitly **out of scope** for S27 (ADR-0024 §4
"only the imperative `furniture.setActiveLod` command ships"). The downstream
viewer or AI agent decides when to swap.

## Catalogue

Headless. The host instantiates `FurnitureCatalogue` once, seeds it with
`SEED_FURNITURE_CATALOGUE` (chair / sofa / table) plus any project-imported
items, and exposes `list()`, `filter(query)`, `find(id)`, `select(id)` to the
DOM carousel. Carousel UI is intentionally deferred — this package only ships
the data layer.

## Tests

```
plugins/furniture/__tests__/handlers.test.ts     # 7 handler smoke + invariants
plugins/furniture/__tests__/catalogue.test.ts    # filter / find / select
packages/geometry-kernel/__tests__/produceFurniture.parity.test.ts
tests/parity/furniture/sofa-multi-rep.test.ts    # the famous "sofa at all 5 LODs"
```
