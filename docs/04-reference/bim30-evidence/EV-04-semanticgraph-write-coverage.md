# EV-04 — SemanticGraph per-kind edge WRITE coverage

> **Stamp**: 2026-08-11 · READ-ONLY evidence appendix · settles the row
> [`BIM30-EVOLUTION-AUDIT.md`](../BIM30-EVOLUTION-AUDIT.md) §2 marked
> *"per-kind write coverage UNPROVEN"* and §4's *"persisted SemanticGraph edges whose per-kind
> write coverage is UNPROVEN"*.
>
> Evidence grades: **[EXEC]** a scan was run and its output read · **[READ]** source read at HEAD.
> Two claims below were re-verified independently by the coordinator against source before this
> file was committed; one of them is **corrected downward** — see §5.

## 1. Headline

`RelationshipType` declares **25** relationship types
(`packages/core-app-model/src/SemanticGraph.ts:44-75`). **Effective write coverage is 11 of 25.**

- **12 types have ZERO writers anywhere**: `unitOf`, `levelOf`, `servesZone`, `precededBy`,
  `supersedes`, `branchedFrom`, `causedFailureOf`, `wasMitigatedBy`, `exceededBenchmark`,
  `replacedBy`, `maintainedBy`, `decommissionedBefore`. [EXEC — per-type literal grep; the only
  matches are the declaration lines themselves]
- **`contains`** has no first-party writer — it is reachable only through the IFC import type
  union (`packages/file-format/src/import/ifc/IfcImporter.ts:100`). [READ]
- **`measuredAt`** has a writer, and the writer is broken (§5). [READ, verified]

`precededBy` / `supersedes` / `branchedFrom` *do* appear in `packages/building-graph/src/types.ts`
— but that is the **UBG, a different graph**. Their presence there is not SemanticGraph coverage.
This is the §8 lesson again in miniature: a name found by grep is not a wired capability.

## 2. Per-kind coverage

| Kind | Edges actually WRITTEN | Gap |
|---|---|---|
| **wall** | `hosts` (CreateWallOpeningCommand.ts:232) · `supports` source for beams · `boundedBy` target | **`CreateWallCommand.ts` makes ZERO graph calls** [EXEC]. `sitsOn` (wall→slab) — the doc-comment exemplar at SemanticGraph.ts:52 — is **never written for walls** |
| **door** | `hosts`/`hostedBy` via CreateWallOpeningCommand.ts:232/238 | `command-registry/src/doors/` — zero writes [EXEC] |
| **window** | same as door | `command-registry/src/windows/` — zero writes [EXEC] |
| **room** | `boundedBy`, `adjacentTo`, `connectedTo` (DetectAllRooms / ReDetectRooms / GenerativeDesignApply) | `contains` no first-party writer; `partOf` only via loader rebuild; `servesZone` never |
| **slab** | `sitsOn` → level | `supports` (slab→wall) never written — `supports` is used **exclusively** for beam supports |
| **ceiling** | none | zero writes [EXEC]; DeleteElementCommand restores a ceiling with no edge, unlike beam/furniture |
| **roof / stair / column / beam / furniture / handrail / lighting / plumbing / lift** | `sitsOn` → level (+ `connectedByStair`/`connectedByLift`, `supports` for beams) | — |
| **level** | target of all `sitsOn`; source+target of stair/lift links | **`levelOf` (level→building) never written**; `unitOf` never written |
| **building / site / material / annotation / curtain-wall** | none | no writers; site has no declared type at all |
| **opening (slab)** | none | `CreateOpeningCommand` / `DeleteOpeningCommand` — zero graph calls [EXEC] |

47 real write statements across 24 non-test files, all through
`semanticGraphManager.addRelationship`. There is no `addEdge`/`setEdge`/`link` on this class. [EXEC]

## 3. Persistence — YES, and the rebuild is narrower than the vocabulary

Persisted as `ProjectSnapshot.semanticGraph` (schema v3):
`ProjectSerializer.ts:782` → `semanticGraphManager.serialize()` (every edge verbatim, no
filtering); loaded at `ProjectLoader.ts:1134-1140`, else `clear()`.

`_rebuildSemanticGraph` exists in **two byte-identical copies**
(`packages/persistence-client/src/loader/ProjectLoader.ts:1438-1492` and
`apps/editor/src/engine/persistence/ProjectLoader.ts:2375-2429`) and fires only when
`semanticGraphManager.size === 0`. It regenerates **5 types**: `hosts`, `hostedBy`, `boundedBy`,
`adjacentTo`, `partOf`.

**Consequence, stated plainly:** a project loaded from a pre-graph snapshot **permanently loses
all `sitsOn` level-hosting and all `supports` structural topology** until those elements are
re-created or copied. The rebuild is not a reconstruction of the graph; it is a reconstruction of
the room/opening slice of the graph. This is a *persist-or-lose* class — the same class §17 of
the audit found when the regenerability exceptions grew from 2 to 6.

## 4. `deserialize` silently drops malformed edges

`SemanticGraph.ts:324-334` discards any relationship missing `id`/`type`/`sourceId`/`targetId`.
That is defensible on load — but it means malformed edges are written and saved without
complaint, and vanish on the next load. **A defect that self-erases on reload is a defect nobody
can reproduce.** It is also why §5's bug never surfaced as a user report.

## 5. Two defects found, both verified — one severity CORRECTED

**(a) `packages/physics-host/src/PhysicsEngine.ts:380` calls the wrong signature.** [verified]

`addRelationship(rel: Omit<Relationship,'id'|'createdAt'>)` takes **one object**
(`SemanticGraph.ts:129`). PhysicsEngine calls it **positionally** with four arguments:
`sgm.addRelationship(roomId, nodeId, 'measuredAt', {...})`. `window.semanticGraphManager` is typed
`any` (`src/global-window.d.ts:193`), so TypeScript cannot catch it — a `(window as any)`-class
hole doing exactly the damage P4 exists to prevent.

Effect: `rel` is bound to the `roomId` **string**, so `rel.sourceId`/`rel.targetId`/`rel.type` are
all `undefined`, and `{...rel}` spreads the string's characters into numeric index keys.
**`measuredAt` is never written correctly.**

> **CORRECTION to the reporting agent's claim.** It stated "every physics run pushes a junk edge
> into the serialized graph." That overstates it: `_findExact(undefined, undefined, undefined)`
> matches the first junk edge, so the **idempotency guard returns early** on every subsequent
> call. **One** junk edge accumulates per session, not one per run. The bug is real and
> `measuredAt` is genuinely dead; the blast radius is not. Recorded because a severity claim that
> cannot be reproduced discredits the finding that *is* true.

**(b) `packages/speculative-engine/src/SpeculativeEngine.ts:100, :111` guard on a method that does
not exist.** [verified — `getEdges` appears nowhere in `SemanticGraph.ts`]

Both functions read `if (!sgm?.getEdges) return []`. `SemanticGraphManager` exposes
`getAll`/`getRelationships`/`getTargets`/`getSources` — never `getEdges`. **Both guards are
permanently true**, so `getSemanticRelationships()` and `getAffectedByDeletion()` return `[]`
unconditionally. The speculative engine's semantic-relationship reads are dead code.

This is the session's signature defect in its purest form: **"this element has no relationships"
and "the method I called does not exist" are the same value `[]`.** The correct shape is the one
the doctrine has demanded all session — refuse with a named reason, do not return emptiness.

## 6. Smallest fixes (no architecture change)

1. `PhysicsEngine.ts:380` — pass the object literal. One line.
2. `SpeculativeEngine.ts:100/111` — call `getTargets`/`getRelationships`; make the missing-method
   branch a typed refusal, not `[]`. Two call sites.
3. Type `window.semanticGraphManager` (`src/global-window.d.ts:193`) instead of `any` — this is
   what would have made (a) a compile error. Highest leverage of the three.
4. `CreateWallCommand` writes no edges: the loader rebuild is currently the only source of a
   wall's graph presence. Wiring it is a `sitsOn` write beside the existing store write.

## Not verified

The 25-type union and 47 write statements were established by the reporting agent's greps and
spot-checked, not exhaustively re-derived by the coordinator. Whether `WallOccupancyStore` state
is serialized is NOT settled here (still UNPROVEN, audit §4). No runtime probe was executed
against a live graph — every claim above is source-level. The two `_rebuildSemanticGraph` copies
were confirmed to exist at the cited lines but were not diffed byte-for-byte.
