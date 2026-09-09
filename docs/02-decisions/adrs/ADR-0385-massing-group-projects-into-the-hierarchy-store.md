# ADR-0385 — A massing group PROJECTS into the hierarchy store; it is not a second containment axis

**Status:** ACCEPTED · **Date:** 2026-09-09
**Amends:** ADR-0383 (massing groups) · **Applies:** ADR-0328 (`partOf` is a derived projection)
**Amends:** C25 §1.3 (IFC spatial hierarchy — cardinality)
**Related:** C84 EI-9 · C114 · L-8501 · L-8560 · L-8333

---

## 1 · THE QUESTION, AND WHY IT COULD NOT BE ANSWERED BY THE LANE THAT FOUND IT

The founder, 2026-09-09: *"each building should be considered as a different building entity for
the IFC schema and the inspect tree etc… as per IFC standards."*

ADR-0383 gave `SpaceEnvelope` a third identity axis, `group: {id,label} | null`, so a parcel can
hold several independent blocks. The obvious next step is to map **group → `IfcBuilding`**.

⛔ **The audit that preceded this ADR found that the obvious step commits this repository's
dominant defect against an already-accepted ruling.** There are **four** records that could answer
*"which building is this element in"*:

| # | Record | State |
|---|---|---|
| 1 | `IntermediateModel.building` (`packages/file-format/.../IntermediateModel.ts:105`) | **singular field**, hard-coded `{id:'building-1', name:'Default Building'}` — the shipping exporter |
| 2 | **`hierarchyStore.BuildingData`** (`packages/core-app-model/src/hierarchy/`) | live, persisted, **143 non-test reference sites across 30 files** |
| 3 | `plugins/ifc-export/src/hierarchy.ts:340` | richer, 263 green tests, **ZERO production callers** (L-8333) |
| 4 | `SpaceEnvelope.group` | ADR-0383 D1, minted today |

**ADR-0328 already ruled on exactly this shape, and its words are unambiguous:**

> *"`hierarchyStore` + `parentId` remains the SOLE hierarchy source of truth … Do not create a
> second independent hierarchy source of truth. Graph projection should be DERIVED FROM the
> hierarchy store rather than maintained independently."*

And `HierarchyTypes.ts` states its own IFC alignment in its header — `Site → IfcSite`,
**`Building → IfcBuilding`**, `Level → IfcBuildingStorey [bridges via bimLevelId]`,
`Unit → IfcZone`. **`LevelData` already carries `buildingId` AND `bimLevelId`: the group↔storey
join this work needs is already modelled and already typed.**

---

## 2 · THE RULING

⭐ **`hierarchyStore` is the AUTHORITY for spatial containment. `SpaceEnvelope.group` is the
MASSING-STAGE AUTHORING axis, and it PROJECTS into that authority — exactly as `partOf` does
(`PartOfProjection.ts`): re-derived at read, reconciled by diff, never accumulated.**

Concretely:
1. Committing a massing group creates or updates **one `BuildingData`** under the project's site.
2. Each of that group's storeys resolves to a `LevelData` carrying that `buildingId` and the
   PRYZM `bimLevelId`.
3. ⛔ **Nothing downstream reads `SpaceEnvelope.group` for containment.** The IFC exporter, the
   PRYZM tree and the IFC tree all ask **one** resolver, and that resolver reads `hierarchyStore`.

### Why not the other way round
`SpaceEnvelope.group` is the right home for *authoring intent* — it is where the user's "these five
storeys are Block B" decision lands, one store, one `produceCommand`, one Ctrl+Z (ADR-0383 D1).
It is the wrong home for *containment truth*, for three measured reasons:
- **Envelopes are not the building.** `grep -rni "spaceenvelope" packages/file-format/src
  plugins/ifc-export/src plugins/ifc-import/src plugins/ifc-inspector/src` → **0 hits**, and
  `Wall`/`Slab` carry **no group axis**. Containment must answer for walls, slabs, doors and rooms —
  things `group` says nothing about.
- **An envelope can be deleted while the building persists.** ADR-0383 D2 makes an empty group
  *unrepresentable by design*. A building whose massing has been superseded still contains its
  walls.
- **ADR-0328 forbids the second source, and a test would not catch the violation.** A gate measuring
  `group` stays green while `hierarchyStore` says something else — the failure has no symptom.

⚠ **ADR-0383 D1 rejected "a second store" for massing groups and that reasoning stands.** What it
did **not** consider is that `hierarchyStore` **already exists and already models N buildings**.
This ADR does not re-open D1; it adds the projection edge D1 had no reason to name.

---

## 3 · CONSEQUENCES

**One resolver, one place.** `resolveElementBuilding(elementId) → { kind: 'carried' | 'derived' |
'unknown', buildingId, name, why }`. Three-valued: *"this element is in no building"* and *"the
store could not be read"* must never share a value (§CONTEXT-DATA-HONESTY, L-581/L-616). One
implementation, consumed by the exporter and **both** trees — that is the C84 EI-9 half of the
founder's ask: the IFC file and the inspect tree must agree because they call the same function.

**C25 §1.3 gains a cardinality clause** it never stated: one `IfcSite`, **N** `IfcBuilding`, each
owning its **own** `IfcBuildingStorey` set. Block A "Level 1" and Block B "Level 1" are one PRYZM
`levelId` and **two** `IfcBuildingStorey` entities.

⛔ **THE BACK-COMPATIBILITY PIN, AND IT IS LOAD-BEARING.** `storeyKey(level.id)` seeds
`ifcGlobalId`. Re-keying storeys by `(buildingId, levelId)` without preserving the **default /
ungrouped** building's seed **byte-identically** re-churns every storey GlobalId in every existing
project — the exact defect L-8501 fixed, guarded by the passing test *"GlobalId churned between
exports"*. The existing arms asserting `IFCRELAGGREGATES === 4` (the arithmetic of exactly one site
and one building) are **preserved verbatim as the ungrouped arm**, never edited to accommodate the
change; editing them would silently retire ADR-0383 D3's guarantee.

**Work lands in `packages/file-format/src/export/ifc/`, not `plugins/ifc-export/`.** The latter is
richer, better tested and reaches no user (L-8333). It is the attractive place to work and the
wrong one.

---

## 4 · ⚠ WHAT THIS DOES **NOT** DELIVER, STATED BEFORE IT IS BUILT

**Mapping group → `IfcBuilding`, done alone, produces N buildings with nothing inside them.**
`FragmentReader` runs 15 readers and none reads `SpaceEnvelope`; `Wall` and `Slab` have no group
axis. Until the join from a massing group to the walls and slabs authored inside it exists, the
export gains correct *containers* and no *contents*.

⛔ That gap is named here rather than discovered in a demo. Shipping N empty buildings and calling
the founder's ask done would be [[fake-more-capable-than-real]]. The containers are still worth
building first: they are the part the IFC schema and the inspect tree need, and the contents join
is a separate, larger piece of work.
