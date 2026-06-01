# SPEC — Materials Repository (central, user-managed, element-fed)

> **Status**: PLAN / proposed spec — promote normative parts into a new
> **C16-MATERIALS-CONTRACT** (or C03/C04 amendments) when implemented.
> **Created**: 2026-05-22.
> **Trigger**: architect — "timber windows render white/grey, not wood. Do a deep
> review of how materials are handled. We need a materials repository: all
> materials gathered somewhere; the user can create/upload/remove; a tab in the
> Data section (Author/Inspect/Data) like a schedule; all elements feed their
> materiality from there; assigned materials must be visible and accessible.
> Check, analyse, document in the contracts, implement."
> **Governs**: `packages/core-app-model/materialLibrary.ts`, geometry-* builders,
> system-type stores, `apps/editor/.../dataworkbench/`, `plugins/ifc-export`.

## 0. Foundation landed 2026-05-22 (Round 47) — build on this

The colour-RESOLUTION plumbing for hosted/glazed elements is now in place, so the
repository UI only needs to POPULATE it (per-element material choice → colour):

- **Windows + doors** (#119) — `plugins/{window,door}/src/committer/material-bridge.ts`
  now infer a colour from the material/system-type KEYWORDS (timber/wood/oak/…,
  aluminium/steel, bronze/brass, anthracite/black, upvc/white, grey) when the key
  carries no explicit colour, instead of falling back to grey/white. Fixes
  "timber windows render grey". Kept inline (L7→L6 boundary).
- **Curtain walls** (#53) — `CurtainWallTypes.ts` gained `glazingColor?` (mirrors
  `mullionColor`); `CurtainWallBuilder._getFallbackPanelMaterial(glazingColor?)`
  resolves it (realistic `#9bc8e4` default), removing the last hard-coded
  `0x88ccff`. Population of `glazingColor` is THIS feature's job.

Remaining for the repository proper: user create/upload/remove materials (store +
schema + persistence), texture population (the `textures` field is still unused),
and PER-ELEMENT (not just per-type) assignment surfaced in `MaterialsBucket.ts`.

## 1. What already exists (build ON, don't rebuild)

- **Central library** — `STANDARD_MATERIAL_LIBRARY` (~140 entries, 17 categories
  incl. Wood/Timber) and `RENDER_MATERIAL_LIBRARY` (~18 PBR) in
  `core-app-model/src/materialLibrary.ts`. Each is `{ id, label, category,
  MeshStandardMaterialParameters, textures? }` — **textures field exists but is
  never populated** (everything is flat colour).
- **MaterialKey + MaterialPool** — content-addressed `MaterialKey`
  (`wall|systemTypeId|materialId|color|layer`) + ref-counted `MaterialPool` GPU
  cache. Dedup infra is complete.
- **System types carry colour** — `WindowSystemTypeStore`/`DoorSystemTypeStore`/
  `WallSystemTypeStore` finish layers hold `materialColor` (hex) + optional
  `materialId`. NO texture, NO hard library link by default.
- **Data → MATERIALS bucket already exists** — `dataworkbench/buckets/MaterialsBucket.ts`
  renders the BIM library, render library, and Element-Types editor with
  material-picker dropdowns that update a *type's* finish (`materialId` +
  `materialColor`). Emits `pryzm-material-selected`.
- **Builders** — `WindowBuilder`/`DoorBuilder` build `MeshStandardMaterial` from
  `frameColor`/`leafColor` (flat colour, roughness/metalness only).

## 2. The "timber window renders white/grey" diagnosis

Two distinct problems combine:

- **(P1) Grey fallback.** `CreateWallOpeningCommand` only stamps `frameColor`
  from the system type *inside* `...(winSysType ? {…} : {})`. If `systemTypeId`
  is absent OR resolves to undefined (deleted/renamed type, or loaded from an
  older project), nothing is stamped and `frameColor` falls to the schema
  default **`#e8e8e8` (grey)** (`WindowTypes.ts`). → window looks grey/white.
  *Fix:* resolve a fallback timber/library colour when the type is missing;
  backfill `frameColor` from `systemTypeId` on load.
- **(P2) No "wood" — flat colour only.** Even with a timber type, the frame is a
  flat tan `#d4aa70` (or white-painted `#f0ece4`) `MeshStandardMaterial` with no
  grain **texture**. An architect reads "wood" as a wood-grained PBR material,
  not a beige fill. PRYZM has **zero texture loading** today. → never looks like
  wood. *Fix:* real texture/PBR support (this spec's core).

## 3. Target architecture (TO-BE)

### §3.1 MaterialsStore (NORMATIVE)
A first-class, persisted store (like wallStore/doorStore) — the single
repository every element feeds from.
- `MaterialDefinition = { id, label, category, baseColor, roughness, metalness,
  opacity, maps?: { albedo?, normal?, roughness?, metalness?, ao? }, source:
  'builtin' | 'user', metadata }`.
- Seeded from `STANDARD_MATERIAL_LIBRARY`; user materials added on top.
- CRUD + subscriptions; persisted in the `.pryzm` project (textures embedded as
  data-URIs or asset refs). Built-ins are read-only; user materials are
  create/edit/delete (delete warns if in use).

### §3.2 Texture / PBR support (NORMATIVE — fixes P2)
- Lazy `THREE.TextureLoader` in a shared `MaterialResolver` (one place, cached
  via MaterialPool keyed by MaterialKey incl. map URLs).
- Builders (Window/Door/Wall/…) resolve their `MeshStandardMaterial` through the
  resolver: colour + `map`/`normalMap`/`roughnessMap` from the MaterialDefinition.
- Texture assets: user-uploaded (embedded) or bundled in `public/textures/`.

### §3.3 Assignment — type AND per-element (NORMATIVE)
- **Per type** — already in MaterialsBucket (extend to reference MaterialsStore ids).
- **Per element** — a Material picker in the Property Panel (`AssignMaterialCommand`)
  so a single window/door/wall can override its material independent of the type.
  Resolution order at build: element override → system-type finish → default.
- Assigned material MUST be **visible** (swatch/label in the property panel and
  in the Data schedule) and **accessible** (one click to the picker).

### §3.4 Data → Materials tab + schedule (mostly exists)
- Keep the MATERIALS bucket; fill the empty `mountMaterialSchedule()` with a
  usage table: `id | label | category | preview | roughness | metalness | usage
  count | locations`, with "create / upload / duplicate / delete-if-unused".

### §3.5 IFC material export
- Emit `IfcMaterial` + `IfcMaterialLayerSet` (walls) and `IfcSurfaceStyle` with
  PBR (not just RGB) so materiality survives export.

## 4. Phased plan

1. **Quick win (P1)** — fallback colour when `systemTypeId` missing/unresolved in
   `CreateWallOpeningCommand`; backfill `frameColor` from type on project load.
2. **MaterialsStore** (§3.1) seeded from the library + persistence.
3. **MaterialResolver + textures** (§3.2) — wire builders through it; ship a
   small bundled wood/metal/concrete PBR set so "timber" looks like wood.
4. **Per-element assignment** (§3.3) — property-panel picker + `AssignMaterialCommand`.
5. **Schedule + CRUD UI** (§3.4) — fill the material schedule; upload/remove.
6. **IFC materials** (§3.5).
7. **Promote** §3.1-§3.3 into a new **C16-MATERIALS-CONTRACT**.

## 5. Verification gate

```
1. Place a timber window. MUST: frame renders a wood tone immediately (not grey),
   and (after §3.2) a wood-grained material.
2. Data → Materials: create/upload a material, see it listed; assign to a window
   type AND to a single window; both render it; swatch shows in the property panel.
3. Delete an unused user material → removed; deleting an in-use one → warned.
4. Export IFC → material survives as IfcMaterial/IfcSurfaceStyle.
```
