# SPEC — Party-Wall Awareness (blind façades against neighbouring buildings)

**Status:** PW.1 mechanism SHIPPED (engine-side suppression seam + editor seam, no
neighbour detection yet). PW.2 / PW.3 are follow-ups.
**Date:** 2026-06-09
**Owner:** generative-layout / apartment + house pipeline
**Ties to:** C19 Site · C55 geodata layers · the building-graph · ADR-0061 (deterministic
generation) · SPEC-PARTY (this doc).

---

## 1. The founder's request

> "Windows and doors should be sensible to NEARBY buildings. In this case we clearly
> snapped to an existing building, and on THAT façade we should NOT have windows or doors
> (it's a party/blind wall). Are we considering this? If not, add it to the pipeline — and
> document it."

A drawn parcel had **one edge sitting hard against an existing neighbour building**. On that
façade the generator still placed windows (and would place the entrance there if it fronted
the hall). Architecturally that edge is a **party wall** (or a wall within a small setback of
a neighbour): it must be a **BLIND wall** — no windows, no doors, no entrance, no glazing.

## 2. The rule

> **A shell/perimeter façade that abuts a neighbouring building within the setback is BLIND:
> it carries NO windows, NO doors, NO entrance, and NO glazing.**

A "blind façade" is identified by the **shell wall id** it corresponds to. Concretely:

- **Party wall** — the parcel edge IS the shared boundary with the neighbour (zero gap).
- **Within setback** — the parcel edge is closer to a neighbour footprint edge than the
  configured minimum setback (a near-blind wall — no point glazing onto a wall a metre away,
  and most codes forbid openings within X m of a boundary).

## 3. AUDIT — are we considering it today? (NO)

Established by reading the live code (file:line):

- **Context buildings are VISUAL-ONLY.** `apps/editor/src/ui/geospatial/contextBuildings.ts`
  fetches neighbour OSM footprints via Overpass (`fetchContextBuildings`,
  `contextBuildings.ts:282`). Its ONLY consumers are the GIS viewports:
  `CesiumViewport.ts:2793` (3D extruded massing) and `SiteBoundaryMap2D.ts:625` (2D map
  fill). **Neither feeds the layout pipeline.**
- **The layout payload carries NO neighbour/adjacency data.**
  `apps/editor/src/ui/apartment-layout/gatherLayoutPayload.ts:62` builds the generate payload
  from the wall store + facade flags + the brief only — there is no neighbour field anywhere
  in `ApartmentGenerateLayoutPayload`.
- **Window emission considers only THIS building's own walls.**
  `windowEmission/emitWindows.ts:349` (`emitWindowsForRoom`) and the shell-host matcher
  `windowEmission/shellWallMatch.ts:561` (`resolveAllShellWindows`) place a window on the
  longest viable external wall with no notion of what is on the OTHER side of it.
- **The entrance resolver picks any hall-fronting shell wall.**
  `entranceDoor/entranceDoor.ts:198` (`resolveEntranceDoor`) chooses the shell wall the hall
  fronts, again with no neighbour awareness.

**Verdict: the pipeline did NOT consider neighbours.** Windows and the entrance could land on
a façade hard against a neighbour building.

## 4. Data needed

| Datum | Source today | Status |
|---|---|---|
| Neighbour building footprints | OSM/Overpass via `contextBuildings.ts` (lon/lat polygons) | EXISTS, visual-only |
| Site origin (lon/lat → world ENU) | `getCurrentSiteOrigin()` / C19 `SiteModelStore` (pinned LTP-ENU origin) | EXISTS |
| Per-storey shell walls (world XZ) | `gatherShellWalls(levelId)` in both executors | EXISTS |
| Setback distance | config (PW.3) | NOT YET — hard-coded threshold in PW.2 |
| Cadastral party-wall boundaries | local-authority / cadastral GIS | NOT YET (PW.3) |

The detection needs neighbour footprints **projected into the editor's world-XZ frame** (via
the C19 site origin) so each shell wall can be tested against neighbour edges. That projection
+ a neighbour-footprint store reachable from the executor is the PW.2 work.

## 5. Detection (per shell wall)

For each shell (perimeter) wall, mark it **blind** when its segment (use the **midpoint**, and
optionally sample along the segment) lies **within `setbackM`** of any neighbour-footprint
edge:

```
blind(shellWall) = ∃ neighbourEdge :
    perpendicularDistance(midpoint(shellWall), neighbourEdge) ≤ setbackM
    AND the projection overlaps the neighbour edge span
```

`setbackM = 0` ⇒ pure party wall (touching). A small positive `setbackM` (PW.3 config)
captures "too close to glaze". Deterministic + pure (ADR-0061): the same parcel + neighbours
always yields the same blind set.

## 6. The suppression seam (SHIPPED — PW.1)

The blind set is a **set of shell wall ids** (`ReadonlySet<string> | readonly string[]`)
threaded as an **additive, optional** input. Empty/absent ⇒ **byte-identical** to today
(apartment + house unaffected), deterministic per ADR-0061.

### 6.1 Engine — window suppression
`resolveAllShellWindows(windows, optionWalls, shellWalls, planToWorld, blindFacadeWallIds?)`
(`windowEmission/shellWallMatch.ts`): after each window resolves to a shell wall id, if that id
is in the blind set the window is **suppressed** (not counted as an unmatched/tolerance
failure — tallied separately as a deliberate party-wall suppression). The
**§WINDOW-MANDATORY-RESCUE** pass also skips blind walls, so a mandatory room is never rescued
onto a party wall (it stays windowless, surfaced in the log, rather than glazing a blind wall).

### 6.2 Engine — entrance suppression
`resolveEntranceDoor(option, shellWalls, planToWorld?, occupiedSpansByWall?, blindFacadeWallIds?)`
(`entranceDoor/entranceDoor.ts`): blind walls are **removed from the candidate pool up front**,
so the entrance lands on the next-best NON-blind hall-fronting wall. If EVERY shell wall is
blind, it returns `null` (no entrance forced onto a party wall — surfaced to the caller).

### 6.3 Threading
`LayoutExecuteOptions.blindFacadeWallIds?` (`executePlan.ts`) → `buildLayoutCommands` →
`resolveAllShellWindows`. The house executor additionally passes it to `resolveEntranceDoor`.

### 6.4 Editor seam (producer)
`apps/editor/src/ui/apartment-layout/resolveBlindFacades.ts` —
`resolveBlindFacades(shellWalls): ReadonlySet<string>`. Called by both
`ApartmentLayoutExecutor.ts` and `HouseLayoutExecutor.ts` per storey. **Today it returns an
empty set** (no behaviour change) UNLESS a manual override
`window.__pryzmBlindFacadeWallIds = ['shellWallId', …]` is supplied (the deterministic
injection point for testing/demos). **PW.2 computes the set here** from neighbour footprints.

### 6.5 Diagnostics — §DIAG-PARTY-WALL
- `windowEmission/shellWallMatch.ts`: logs `§DIAG-PARTY-WALL blindFacades=N [ids] windowsSuppressed=K`
  (only when a blind set is supplied).
- `entranceDoor/entranceDoor.ts`: logs how many blind façades were excluded from the entrance
  candidate set, or that ALL walls are blind → no entrance.
- `resolveBlindFacades.ts`: logs the override blind set when one is injected.

## 7. Phased plan

| Phase | Scope | Status |
|---|---|---|
| **PW.1** | The suppression mechanism: thread `blindFacadeWallIds` through the payload → windowEmission + shell matcher + entrance resolver; suppress windows + entrance on blind walls; additive/deterministic; §DIAG-PARTY-WALL; editor seam (`resolveBlindFacades`) with manual override; tests. | **DONE** |
| **PW.2** | Neighbour-footprint DETECTION: a neighbour-footprint store reachable from the executor (projected lon/lat → world ENU via the C19 site origin); per-shell-wall proximity test (§5); `resolveBlindFacades` returns the computed set. | TODO |
| **PW.3** | Setback CONFIG + cadastral party-wall data: a user/typology-configurable `setbackM`; ingest explicit shared-boundary (party-wall) data from cadastral GIS to override the proximity heuristic; per-jurisdiction opening rules. | TODO |

## 8. How it ties in

- **C19 Site** — the neighbour-footprint store + the lon/lat → world-ENU projection (PW.2) are
  C19 site-context concerns; the pinned site origin (`getCurrentSiteOrigin`) is already C19.
- **C55 geodata layers** — neighbour footprints are a geodata layer (today the Overpass
  context-buildings layer); PW.2 promotes that layer from VISUAL-only to a layout INPUT.
- **Building-graph** — a blind façade is a topological fact about the building's relation to
  its neighbours; once detected it can be surfaced as a graph property on the shell wall node
  (e.g. `façade:blind`) so other consumers (schedules, energy, the inspect surface) see it.

## 9. Cited existing code

- Window placement: `packages/ai-host/src/workflows/apartmentLayout/windowEmission/emitWindows.ts:349`
- Shell-window host + suppression: `…/windowEmission/shellWallMatch.ts:561` (`resolveAllShellWindows`)
- Entrance resolver: `…/entranceDoor/entranceDoor.ts:198` (`resolveEntranceDoor`)
- Threading: `…/executePlan.ts` (`LayoutExecuteOptions.blindFacadeWallIds`, the `resolveAllShellWindows` call)
- Editor producers: `apps/editor/src/ui/apartment-layout/resolveBlindFacades.ts`,
  `ApartmentLayoutExecutor.ts`, `apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts`
- Visual-only neighbour data (the PW.2 source): `apps/editor/src/ui/geospatial/contextBuildings.ts:282`
- Payload (no neighbour data today): `apps/editor/src/ui/apartment-layout/gatherLayoutPayload.ts:62`
