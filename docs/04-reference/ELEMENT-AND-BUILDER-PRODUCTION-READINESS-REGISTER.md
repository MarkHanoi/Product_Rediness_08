# ELEMENT & BUILDER PRODUCTION-READINESS REGISTER

- **Status**: MEASURED REGISTER — lane AUD-1, read-only audit pass, 2026-08-21
- **Scope**: every element family and every builder — `packages/geometry-*` (geometry) ×
  `plugins/*` (tool/commands/UI) × `packages/schemas/src/elements/*`
- **Method**: **the CODE was read, not the docs.** Every cell below is `SOUND` (with
  evidence), `DEFECT` (with `file:line` + the user-visible failure) or `UNMEASURED` (an
  honest blank — I did not check it). No cell reads "probably", "likely" or "appears to".
- **Governed by**: [C84](../02-decisions/contracts/C84-ELEMENT-INTEGRITY.md) and the
  per-element block C85–C99. **C84 was used as a HYPOTHESIS SET, not as evidence** — where
  this register agrees with it, it agrees because the code was re-read; where it disagrees,
  the disagreement is recorded with the command that produced it.
- **Issue rows**: L-2300 … L-2319 in [ISSUE-LOG](ISSUE-LOG.md)
- **⛔ This document changed no source code.** It is the audit half of
  document → plan → review → **audit** → document → implement.

---

## 0. Denominators, measured — never transcribed

Every count below was produced by a command run against the tree at HEAD on 2026-08-21.
Re-run them rather than trusting the number.

| Quantity | Command | Reading |
|---|---|---|
| element geometry packages | `ls packages/ \| grep '^geometry'` minus `geometry-kernel` | **15** |
| element plugins | `ls plugins/` (element families only) | **17** |
| L0 element schemas | `ls packages/schemas/src/elements/*.ts` | **31 files, 29 calling `defineElement`** |
| per-element contracts | `ls docs/02-decisions/contracts/ \| grep -E '^C(8[4-9]\|9[0-9])'` | **C84 + C85–C99 = 16** |
| builder files repo-wide | `find … -iname '*Builder*.ts'` minus tests | **106** |
| material catalogue rows | probe over `materialCatalog.ts` | **329 builtin rows** |

**Two families are on disk and live in production but have NO per-element contract:**
`ls docs/02-decisions/contracts/ | grep -iE "pool|lift|vertical"` → **zero output**.
`geometry-lift` is constructed at `apps/editor/src/engine/initBuilders.ts:985`;
`plugins/pool/src/handlers/` holds `CreatePool.ts` and `DeletePool.ts`. C84 §6 enumerates
**15** families; the filesystem carries **17**. The two unenumerated ones are precisely the
two that scored worst on the builder axis below — which is what "ordered by nothing" costs.

---

## 1. THE MATRIX — family × axis

`S` = SOUND · `D` = DEFECT · `U` = UNMEASURED. Every `D` is expanded in §2 with `file:line`.

| Family | 1 Schema | 2 Builder | 3 Cache key | 4 Instancing | 5 Hosting | 6 Creation paths | 7 Perf shape |
|---|---|---|---|---|---|---|---|
| **wall** | D (L-2306) | S | **S** | D (L-2311) | S | D (L-2315) | D (L-2309) |
| **wall.opening — door** | D (L-2306) | **D (L-2301)** | n/a¹ | n/a² | **S** | D (L-2315) | D (L-2308) |
| **wall.opening — window** | D (L-2306) | S | n/a¹ | D (L-2311) | **S** | D (L-2315) | D (L-2308) |
| **curtain-wall** | D (L-2306) | S | **D (L-2305)** | D (L-2311) | U | D (L-2315) | D (L-2309) |
| **ceiling** | D (L-2306) | S | D (L-2304) | n/a² | U | D (L-2315) | D (L-2308) |
| **floor** | **D (L-2307)** | **D (L-2301)** | D (L-2304) | n/a² | U | **D (L-2303)** | D (L-2308) |
| **roof** | D (L-2306) | S | D (L-2304) | n/a² | U | D (L-2315) | **D (L-2305)** |
| **column** | D (L-2306) | **D (L-2302)** | D (L-2304) | S (OFF) | n/a | D (L-2315) | D (L-2308) |
| **slab** | D (L-2306) | S | D (L-2304) | n/a² | U | D (L-2315) | D (L-2309) |
| **beam** | D (L-2306) | **D (L-2302)** | D (L-2304) | S (OFF) | U | D (L-2315) | D (L-2308) |
| **room / space** | **D (L-2307)** | U | U | n/a² | U | D (L-2319) | U |
| **handrail** | D (L-2306) | S | D (L-2304) | **D (L-2310)** | U | **D (L-2316)** | D (L-2308) |
| **lighting** | D (L-2306) | **D (L-2300)** | D (L-2304) | n/a² | U | **D (L-2316)** | **D (L-2312)** |
| **furniture** | D (L-2306) | S | D (L-2304) | S (OFF) | U | D (L-2317) | D (L-2308) |
| **stair** | D (L-2306) | S | D (L-2304) | **D (L-2310)** | U | D (L-2317) | D (L-2308) |
| **plumbing** | D (L-2306) | **D (L-2300)** | D (L-2304) | n/a² | U | **D (L-2316)** | **D (L-2300)** |
| **lift** *(no contract)* | U | **D (L-2301)** | D (L-2304) | n/a² | U | U | D (L-2308) |
| **pool** *(no contract)* | U | S (no THREE)³ | n/a | n/a² | U | U | n/a |

¹ Door/window geometry is keyed by the **host wall's** key, not their own.
² Family has no instancing path at all — see §2.4 for the census.
³ `packages/geometry-pool/src/` is 3 files; `PoolDimensions.ts` has **0** `THREE` references
and `PoolAssembly.ts` has **1**. There is no fragment builder to audit.

### Totals per axis

| Axis | SOUND | DEFECT | UNMEASURED | n/a |
|---|---|---|---|---|
| 1 — Schema completeness | 0 | 16 | 2 | 0 |
| 2 — Builder soundness | 10 | 6 | 2 | 0 |
| 3 — Cache-key correctness | **1** | **14** | 1 | 2 |
| 4 — Instancing | 3 | 4 | 0 | 11 |
| 5 — Hosting | 3 | 0 | **15** | 0 |
| 6 — Creation paths | 0 | **16** | 2 | 0 |
| 7 — Performance shape | 0 | 15 | 2 | 1 |

**Axis 5 is mostly UNMEASURED and that is the most important line in this table.** I traced
hosting end-to-end for exactly three families (wall→door, wall→window, and the published wall
datum they both read). Fifteen hosting cells are honest blanks, not passes. See §4.

**Axis 6 is the worst-scoring axis that IS measured: 16 DEFECT, 0 SOUND.** 76 creation paths
were enumerated across 15 families and **no family agrees across all three of** (which store
is written) × (bus or direct) × (which registry is minted). Axis 3's single SOUND cell and
axis 6's zero are the two numbers to read first.

---

## 2. THE DEFECTS — evidence and user-visible consequence

### 2.1 Axis 2 — builder soundness (GPU lifetime, ADR-0297)

ADR-0297 states two invariants (`docs/02-decisions/adrs/ADR-0297-gpu-resource-lifetime-invariant.md:47-52`):
**L1 ownership** — a cached resource is owned by the cache and ownership is recorded *on the
resource*, never inferred from a per-builder membership test; **L2 ordering** — a resource may
be released only after every `Object3D` referencing it is detached AND the frame that last
referenced it has finished. The ADR states at `:69` that `safeDispose*` does **not** satisfy
this. The only legal funnel is `scheduleGpuRelease` / `detachAndReleaseChildren`.

Measured across **18 builder files covering 14 families that have a builder**: **11 compliant,
6 violating, 1 (plumbing) releasing nothing at all.**

**L-2300 — `PlumbingFragmentBuilder` releases nothing, and rebuilds on every edit.**

```
grep -c "dispose|scheduleGpuRelease|detachAndRelease" packages/geometry-plumbing/src/PlumbingFragmentBuilder.ts
→ 0
grep -cE "new THREE\.[A-Za-z]*Geometry\(" packages/geometry-plumbing/src/PlumbingFragmentBuilder.ts
→ 13
```

`PlumbingFragmentBuilder.ts:47` — `root.clear();` discards every child on each
`updateFixture()`. `:319-326` `removeFixture()` calls `this.scene.remove(root)` and nothing
else. `clearProjectGeometry():333` loops `removeFixture`, so **the project-switch sweep
orphans every fixture's geometry too.** The builder is live: constructed at
`apps/editor/src/engine/initBuilders.ts:636`, driven per-edit at `:665` and `:670`.

*User-visible:* unbounded VRAM growth — 13 geometry allocations per fixture per edit, never
freed, and never freed at project switch either. This is the accumulating half of the
device-loss class already recorded in `render-reconstruction-boundary-gpu-reset`.

**L-2301 — three builders release BEFORE they detach (the exact inversion ADR-0297 forbids).**

`packages/geometry-lift/src/LiftMeshBuilder.ts:180-192` — verbatim:

```ts
    removeLift(liftId: string, _isPreview = false): void {
        const group = this.liftRoots.get(liftId);
        if (!group) return;
        group.traverse((obj) => {                                    // :183  DISPOSE …
            const mesh = obj as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();               // :185
            const mat = (mesh as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());  // :187
            else if (mat) mat.dispose();                              // :188
        });
        if (this.scene) this.scene.remove(group);                     // :190  … THEN DETACH
        this.liftRoots.delete(liftId);
    }
```

`:190` runs after `:183`. And `updateLift():101` calls `removeLift` **on every mutation**, so
the inversion is on the hot path, not just teardown. `mat.dispose()` at `:187-188` is
unguarded — no ownership check — which is the L1 half as well.

Same shape, two more sites:
- `packages/geometry-door/src/DoorBuilder.ts:1372` disposes, `:1374` detaches. Reached from
  `rebuild():512` on every door mutation.
- `packages/geometry-slab/src/floor/FloorPanelBuilder.ts:170` disposes, `:171` detaches.

**The sibling comparison is the proof this is a defect and not a house style.**
`CeilingPanelBuilder.ts:121` detaches then `:124` `scheduleGpuRelease(root)` — same package,
same shape, opposite compliance. `FloorPanelBuilder` imports no funnel at all.

*User-visible:* destroying a live `GPUBuffer` while the subtree is still parented is the
mechanism ADR-0297 traces to device loss / a white viewport on WebGPU.

**L-2302 — `BeamFragmentBuilder` uses the per-builder membership test ADR-0297 L1 names by title.**

`packages/geometry-beam/src/BeamFragmentBuilder.ts:618-633`:

```ts
                m.geometry?.dispose();                                            // :622
                    m.material.forEach(mat => {
                        if (mat && !_SHARED_MATERIALS.has(mat)) mat.dispose();     // :625
```

`_SHARED_MATERIALS` is a module-local `WeakSet` (`:62`). ADR-0297 `:48-49` rejects exactly
this: *"It is not in MY cache" is not evidence of exclusive ownership — it is only evidence
of ignorance about the other caches.* Ordering is correct here; the release is immediate
rather than at a frame boundary (L2(b)), and it runs on every rebuild (`build():230-236`).
`ColumnFragmentBuilder` shares the pattern's blast radius via the same shared-material set.

**L-2300b — `LightingFragmentBuilder` disposes geometry and NEVER material.**

`packages/geometry-lighting/src/LightingFragmentBuilder.ts:448-458` traverses and calls
`mesh.geometry.dispose()` at `:456`. There is **no `material` branch in the function.**
`update():476` is `this.remove(data.id); this.add(data);` — a full teardown per edit. Most
materials are pooled (`_matCache:99`, `_lensMatCache:207`) so the asymmetry is mostly benign
— **except** `:699-704`, one uncached `MeshStandardMaterial` per pendant, created inside
`_buildPendant()` which `_buildFixture():492` dispatches per fixture. That one leaks per
pendant per edit, forever. The file's own comment at `:1460` claims *"twenty new families add
ZERO per-instance materials"*; `:699` contradicts it.

**The existing ratchet does not see four of these.**
`packages/renderer-three/__tests__/casterReleaseChokepoint.test.ts:251` detects with
`/\.(geometry|materials?)\.dispose\(\)/g`. That regex misses `m.geometry?.dispose()`
(optional chaining, `BeamFragmentBuilder:622`), bare `mat.dispose()` on a local
(`:625,:629`, `LiftMeshBuilder:187,188`), and every `safeDisposeGeometry(...)` wrapper call
(`DoorBuilder:1372`, `FloorPanelBuilder:448`). Plumbing passes it **trivially, by disposing
nothing.** The sweep also only walks `/(Builder|Manager)\.ts$/` (`:236`), so
`CurtainPanelFactory.ts` is out of scope by construction.

### 2.2 Axis 3 — cache-key correctness

**L-2304 — ONE of 15 element-geometry packages has a rebuild skip-key.**

```
for d in packages/geometry-*; do grep -rlE "_lastBuilt|_composeCacheKey|_geomVersionKey" $d/src ; done
→ geometry-wall: 4 files.  Every other package: 0.
```

This is a two-sided reading and both sides matter:

- **The good side.** Fourteen families cannot have a *stale-cache* defect, because they hold
  no cache. The ⭐ repeat defect class the brief names — a key that omits a term the build
  consumes — has exactly **one** possible host in this repo, and it is the wall.
- **The bad side.** Fourteen families rebuild unconditionally on every mutation. That is
  axis 7, and it is why L-2308 below covers so many rows.

**Wall's key is now complete, and I verified it rather than trusting the comment.**
`WallFragmentBuilder.ts:208-213`:

```ts
        return `${wall._renderVersion}|${jh}|${slabTag}|${this._levelDatumTag(wall)}|${this._rakeTag(wall)}${this._openingProfileTag(wall)}`;
```

`_buildWallInternal` seats every wall at `worldY = level.elevation + slabBaseOffset +
wall.baseOffset`. All three terms are folded — `slabBaseOffset` directly, `wall.baseOffset`
via `_renderVersion`, and `level.elevation` via `_levelDatumTag` (`:258-261`, the L-2050 fix).
Rake and neighbour-rake are folded (`_rakeTag:305-323`), as is opening profile
(`_openingProfileTag:277-286`). **Verdict: SOUND.**

⚠ **One hypothesis I formed and then FALSIFIED, recorded because the retraction is the
finding.** `_versionForBuild()` (`:376-393`) — the plan-view projection token — folds
`_renderVersion | joinHash | worldY | rakeTag` and does **not** fold `_openingProfileTag`. I
expected that to mean an opening-profile flip rebuilds 3D but serves a stale plan projection.
It does not: `WallStore.updateOpening():1334` bumps `_renderVersion` on every opening write,
so both keys move together. **Not a defect. Do not log it.**

**L-2305 — the material caches key on the material id and ignore the per-element colour, and
the colour branch that was supposed to save them is DEAD CODE.**

Four sites, four families, one shape:

```
grep -rn "params.color === undefined" packages plugins src apps
packages/geometry-curtain-wall/src/CurtainWallBuilder.ts:2181:  if (cw.mullionColor && params.color === undefined) params.color = cw.mullionColor;
packages/geometry-curtain-wall/src/CurtainWallBuilder.ts:2234:  if (cw?.glazingColor && params.color === undefined) params.color = cw.glazingColor;
packages/geometry-roof/src/RoofFragmentBuilder.ts:198:          if (data.materialColor && params.color === undefined) {
packages/geometry-wall/src/WallFragmentBuilder.ts:4811:        } else if (wall?.materialColor && params.color === undefined) {
```

**All four guards are unreachable.** `params` is spread from `matDef.params`, and every
`matDef` is produced by `project()` at `packages/core-app-model/src/materialLibrary.ts:76-79`,
which sets `color` unconditionally:

```ts
    const params: THREE.MeshStandardMaterialParameters = {
        color: new THREE.Color(m.color),
```

`MaterialRecord.color` is a required non-optional field
(`packages/schemas/src/materials/materialRecord.ts:63`: `readonly color: string;`), and a
probe over the catalogue confirms it empirically:

```
MATERIAL_CATALOG builtin rows total = 329
rows WITH color = 329 | rows WITHOUT color = 0
```

All three material maps handed to builders are built directly from
`STANDARD_MATERIAL_LIBRARY` — `initUI.ts:2293` (curtain wall), `initBuilders.ts:596` (slab),
`WallTool.ts:281` (wall) — so no producer can supply a colourless def.

**The comment at `WallFragmentBuilder.ts:4808-4810` asserts the opposite of what the code
does**, verbatim: *"Honour the per-wall materialColor as a tint when set — lets the architect
re-colour a 'concrete-smooth' PBR wall to red."* It cannot. The `else if` never fires.

*User-visible:* set a colour on a curtain wall's mullions or glazing, a roof, or a wall that
carries a `materialId`, and **the model does not change.** For curtain walls this is
reachable from chat — `packages/ai-host/src/AIService.ts:123` dispatches
`UpdateAllCurtainWallsCommand({ mullionColor: val })` — so the assistant reports success over
an unchanged render. Wall has an escape hatch (an authored side finish overrides
unconditionally at `:4810`); curtain-wall and roof have none. Slab is the honest fifth case:
`SlabFragmentBuilder.ts:1673-1692` does not pretend — it ignores `materialColor` outright when
`materialId` resolves.

Additionally, the caches at `CurtainWallBuilder.ts:2166` and `:2216` are keyed `mat:${matId}`
and are never invalidated. Even if the tint branch were made live, a colour change would hit
the cache and return the previously-built material.

### 2.3 Axis 1 — schema completeness

**L-2306 — 16 of 16 element schemas are Zod default-`strip`, from ONE declaration.**

`packages/schemas/src/base/BaseNode.ts:45` returns a bare `z.object({...})`. And:

```
grep -rn "\.strict()|\.passthrough()|\.catchall(|z\.strictObject|z\.looseObject" packages/schemas/src
→ 0 matches
```

**29** files call `defineElement`. So for every element family, an unknown key is **deleted
in transit while `parse()` returns success.** Two schema headers already record the
consequence in their own words — `Roof.ts:91-94` (*"it was DISCARDED … Zod's default strip
mode deleted it in transit while parse() reported success"*) and `Beam.ts:63-66`.

Per-family field deltas against C85–C99 are enumerated in the raw sweep; the largest are
floor (17 contract-required fields absent), lighting (13 `*Params` blocks plus 7 more),
handrail (11), furniture (11), stair (8) and roof (8).

**L-2307 — two families never validate at all.**

```
for f in wall door window curtain-wall ceiling floor roof column slab beam rooms handrail lighting furniture stair plumbing;
  do grep -rhoE "\b[A-Z][A-Za-z]*\.parse\(" plugins/$f/src | wc -l; done

floor: 0 .parse( calls
rooms: 0 .parse( calls        (every other family: 1–7)
```

`plugins/floor/src/handlers/CreateFloor.ts:155` lands the record with
`} as unknown as FloorData;` — a double cast onto the **legacy** `FloorData` from
`@pryzm/core-app-model`, not the L0 infer. `plugins/floor/src/store.ts:17,20` confirms the
store is keyed on the legacy type — the only one of sixteen that is.
`plugins/rooms/src/handlers/CreateRoom.ts:104` closes its payload with
`readonly [k: string]: unknown;` — an index signature that admits any key without a cast, so
no gate that counts casts can see it.

*User-visible:* floor and room are the two families where a malformed or partial payload
reaches the store with no schema boundary between the UI and persistence.

### 2.4 Axis 4 — instancing

Census: **8 of 15** element-geometry families have an instancing path; **5 of 15** are
instanced by default (`_FAMILY_DEFAULTS`, `ElementInstanceBridge.ts:332-338`:
`window:true, column:false, beam:false, handrail:true, stairRailing:true`, plus wall which
has no flag and curtain-wall which has its own manager).

**L-2310 — handrail and stair-railing instanced picks resolve a synthetic id that is not an
element. Both default ON.**

`packages/geometry-handrail/src/HandrailFragmentBuilder.ts:534` —
`const instId = \`${handrail.id}#bal-${i}\`;` — passed as the `elementId` argument.
Same at `:575` for posts (`#post-`). `packages/geometry-stair/src/StairRailingBuilder.ts:225`
— `const instId = \`${railingId}#m-${this._instanceSeq++}\`;`.

`ElementInstanceBridge.register()` (`:128-135`) has **no `pickId` parameter at all** and
forwards the id verbatim at `:149`. `InstancedElementRenderer` then defaults
`pickId: pickId ?? elementId` (`:363`). For column and beam the storage key *is* the element
id so this is invisible; for handrail and stair-railing it is not.

The downstream consequence — which I traced myself:
`packages/input-host/src/MarqueeSelectionTool.ts:295-302` does
`const memberId = ud.getInstanceElementId(slot); … hits.add(memberId);` and `:321` returns
`Array.from(hits)`. The same read happens in `SelectionManager.ts:514-521`, which maps each
`memberId` into `idToObj`.

*User-visible:* rubber-band-select across a balustrade or a stair and the selection is
populated with one entry per baluster/member, each keyed `hr-<id>#bal-3` — a string that
`elementRegistry.registerRoot(handrail.id, root)` (`HandrailFragmentBuilder.ts:357`) never
registered. The handrail itself is not in the selection. Stair railings additionally register
no hit-proxy.

**L-2311 — `castShadow` is folded by no instancing key, and is hard-forced true.**

`packages/core-app-model/src/rendering/InstanceGroup.ts:87-88`:

```ts
        this.mesh.castShadow    = true;
        this.mesh.receiveShadow = true;
```

Unconditional, in the constructor. No group key folds shadow state
(`InstancedElementRenderer._hashGeometry:818` folds
`elementType_levelId_idxCt_vtxCt_x0_y0_z0_material.uuid` and nothing else).
`InstancedMeshCoalescer.ts:328` copies the flag from `sources[0]` across a merged group that
may mix flags.

*User-visible:* an element with shadows turned off still casts one the moment it qualifies
for instancing, and turning shadows off on one element in a coalesced group silently changes
another.

**Also measured, not separately logged:** `_hashGeometry` rounds the geometry term to
`.toFixed(3)` on the first vertex only (`:815-817`). For the bridges that pass unit
primitives this is harmless — dimensions live in the matrix — but `FurnitureInstanceBridge`
and `WindowBuilder` pass real baked geometry, where a 1 mm agreement on vertex 0 plus equal
vertex/index counts is the entire collision guard.

### 2.5 Axis 6 — creation paths

**Census: 76 creation paths across 15 families. ZERO families agree across all three of
(store written) × (bus vs direct) × (registry minted).** Per-family path counts: wall 12,
wall.opening 9, room 9, curtain-wall 6, furniture 6, roof 5, column 5, slab 5, ceiling 4,
floor 4, beam 4, handrail 4, lighting 3, stair 3, plumbing 3.

**L-2315 — the bus→legacy mirror writes 28 store records and mints ONE registry entry.**

```
grep -n "elementRegistry\." apps/editor/src/engine/initTools.ts
2345:  try { elementRegistry.registerSemanticOrReplace(ev.id, 'furniture'); } catch { /* non-fatal */ }
2727:  // + elementRegistry.unregisterRoot() + geometry/material disposal.     ← a comment
```

**One call, and it is furniture.** The same file carries **28** store `.add(` sites — wall
`:1232`, door `:1459`, window `:1503`, curtain-wall `:1586`, ceiling `:1668`, roof `:1745`,
column `:1793`, slab `:1858`, beam `:1931`, floor `:1978`, handrail `:2121`, lighting `:2212`,
furniture `:2289`. Twelve of the thirteen families mirrored through this file enter the
authoritative store with **no `elementRegistry` entry**, so `elementRegistry.getStoreType(id)`
returns `undefined` for every one of them. The file concedes the gap for floor in its own
words at `:1957-1959`: *"…and bimManager/elementRegistry registration is moved into the
handler."*

**L-2303 — floor's two creation paths disagree on step ③ of an order the code calls MANDATORY,
and it is the readable instance of L-2315.**

`packages/command-registry/src/floors/CreateFloorCommand.ts:5-9` declares:

```
 * Spatial registration order (MANDATORY):
 * ① floorStore.add()
 * ② bimManager.registerElement()
 * ③ elementRegistry.registerSemantic()
```

and honours it at `:367`, `:368`, `:370`.

The **bus** path does not. `apps/editor/src/engine/initTools.ts:1961-2043` subscribes to
`floor.created`, reconstructs a `FloorData`, calls `(floorStore as any).add({…})` at `:1978`,
then `viewDependencyTracker.registerElement(...)` and
`bimManager.registerElement(...)` at `:2034-2035`. **`elementRegistry.registerSemantic` is
never called on this path.** (The host references themselves *are* carried — `hostSlabId` and
`hostRoomId` are written at `:2009-2010` — so the specific historical defect named in the
brief is closed on this path; the registration step is the surviving divergence.)

What step ③ gates, measured by grepping its consumers:

- `apps/editor/src/engine/RemoteCommandDispatcher.ts:195` —
  `return ids.every((id) => elementRegistry.getStoreType(String(id)) !== undefined);` — the
  at-most-once collaborative catch-up guard. A bus-created floor has no store type, so the
  guard never fires and the create **always replays**. The only thing preventing a duplicate
  is a second dedup guard inside the mirror (`initTools.ts:1966`,
  `if (floorStore.getById(ev.floorId)) return;`). Two guards in series, one of which is
  documented as the authority and is blind.
- `packages/ai-host/src/WorldModelAdapter.ts:537` — returns `'unknown'` for the floor, so the
  assistant cannot classify an element the user just drew.
- `apps/editor/src/engine/initRemoteElementSync.ts:116` and `engineLauncher.ts:455` — same
  read, same blindness.

**L-2316 — handrail, lighting and plumbing never mint a semantic registry entry on ANY create
path.**

```
grep -c elementRegistry packages/command-registry/src/handrails/CreateHandrailCommand.ts      → 0
grep -c elementRegistry packages/command-registry/src/lighting/CreateLightingCommand.ts       → 0
grep -c elementRegistry packages/command-registry/src/plumbing/CreatePlumbingFixtureCommand.ts → 0
```

Registration is deferred to **mesh-build time**: `HandrailFragmentBuilder.ts:353`
(`registerSemantic`), `LightingFragmentBuilder.ts:421` and `PlumbingFragmentBuilder.ts:45`
(`registerRoot` only — **neither ever calls `registerSemantic` at all**).

*User-visible:* an element that never meshes — because it is on a hidden level, because the
build threw, or because it was created headlessly — is invisible to every registry consumer.
For lighting and plumbing `getStoreType()` returns `undefined` **permanently**, on every
path, so `WorldModelAdapter.ts:537` reports the fixture as `'unknown'` and the assistant
cannot name an element the user just placed. The only site that ever registers a plumbing
fixture semantically is the delete-undo path (`DeleteElementCommand.ts:1021`).

**L-2317 — 4 of 46 plugin `Create*` handlers refuse when they cannot reach authoritative
state. The other 42 report success over a detached store.**

```
grep -rln "_UNREACHABLE" plugins/*/src/handlers/Create*.ts
plugins/door/src/handlers/CreateDoor.ts
plugins/slab/src/handlers/CreateSlab.ts
plugins/wall/src/handlers/CreateWall.ts
plugins/window/src/handlers/CreateWindow.ts

ls plugins/*/src/handlers/Create*.ts | wc -l    → 46
```

The four that refuse are the correct shape (`CreateDoor.ts:149-155` returns
`{ valid: false, reason: DOOR_CREATE_UNREACHABLE }` from `canExecute`, with the comment
*"§FIX-CREATE-LIVENESS-LIE — the payload is well-formed, and it STILL cannot reach
authoritative state. Say so; never report success."*). The pattern exists, is documented, and
was applied to **four verbs**. Every `*.batch.create` twin is unguarded, including the batch
twins of the four guarded verbs.

**L-2318 — the two `ProjectLoader` implementations disagree about lighting.**

```
grep -c CreateLightingCommand packages/persistence-client/src/loader/ProjectLoader.ts  → 0
grep -c CreateLightingCommand apps/editor/src/engine/persistence/ProjectLoader.ts      → 3
```

*User-visible:* a project saved with lighting and reloaded through the persistence-client
loader comes back with none. This is the **same defect shape** C84 §1.2 recorded for the
serializer — *"the LOAD half exists and the SAVE half does not"* — one layer out: here **one
of two load halves** exists. C84's correction fixed the citation; it did not measure that
there are two loaders.

**L-2319 — `packages/stores/src/aggregate-commands/roomCreate.ts:108` writes a different room
store and registers nothing.**

`roomStore.add(room)` at `:108`; `grep -c "elementRegistry|registerElement"` over the file →
**0**. It writes `AggregateRoomStore`, not the `room-topology` `RoomStore` that the other
eight room paths write. It is exported publicly at `packages/stores/src/index.ts:190`. I
found **no in-repo consumer** beyond the re-exports — which makes it an unreached second
answer to a question already answered, not a live defect today.

> ### ⛔ RETRACTION — recorded because the retraction is worth more than the claim
>
> This audit initially recorded that `CopyElementCommand`, `MirrorElementCommand` and
> `OffsetElementCommand` mint `elementRegistry` but **not** `bimManager.registerElement`,
> leaving copied walls out of `level.childrenIds` and defeating the level-delete guard.
>
> **That is FALSE, and the way it became false is the finding.** It rested on
> `grep -c "bimManager\.registerElement"` → 0. The receiver is a local alias:
>
> ```
> CopyElementCommand.ts:132    const bimMgr = ctx.bimManager ?? window.bimManager;
> CopyElementCommand.ts:133    bimMgr?.registerElement?.(this.input.newId, source.levelId);
> MirrorElementCommand.ts:123  bimMgr?.registerElement?.(this.input.newId, source.levelId);
> OffsetElementCommand.ts:122  bimMgr?.registerElement?.(this.input.newId, source.levelId);
> ```
>
> All three register. **This is the name-based-census failure C84 §6 warns about, reproduced
> live inside the audit that was written to find it** — the same shape as the guard that
> passed against three copies because it grepped `SYNC_COLOURS` and missed `SYNC_COLORS`.
> It is the second such false positive this lane produced (the first was the
> `_openingProfileTag` hypothesis in §2.2). **Grep the receiver, not the name.**
>
> **The residue, which IS true and is much smaller:** the wall arms write no `sitsOn` edge —
> only the furniture arm does (`CopyElementCommand.ts:175-182`). `DeleteLevelCommand`'s
> second guard arm reads `sitsOn` (`:184`). But `rebuildSemanticGraph.ts:203` derives
> `sitsOn` from each element's authoritative `levelId` on every load, and `childrenIds` IS
> populated in-session, so **both guard arms are covered and there is no reachable failure.**
> Not logged as a defect.

⚠ **Coverage note.** This axis moved from 1/17 measured to 15/17. Still **UNMEASURED**:
`packages/scene-committer` and the 15 `plugins/*/src/committer/*` directories (do any admit
records to a store?); sync/multiplayer remote-apply as a creation surface; `family-instance` /
`family-runtime` / `family-loader`; `apps/cli`, `apps/headless`; `revit-addin/`.

### 2.6 Axis 7 — performance shape

**L-2308 — fourteen of fifteen families do a full teardown-and-rebuild on every property
change.**

`LightingFragmentBuilder.update():476` is `this.remove(data.id); this.add(data);`.
`LiftMeshBuilder.updateLift():101` calls `removeLift`. `BeamFragmentBuilder.build():230-236`
removes and re-disposes. `PlumbingFragmentBuilder:47` calls `root.clear()`. Only
`WallFragmentBuilder` short-circuits (`:815` against `_lastBuiltVersion`).

*User-visible:* dragging a slider on any non-wall element re-allocates that element's entire
geometry and material set per input event. Combined with L-2300/L-2301 the same edits also
leak or free-early, so the three findings compound rather than sitting side by side.

**L-2309 — per-element unique materials.** `new THREE.Mesh*Material(` site counts per package,
with the count of files carrying any shared-material cache as the denominator context:

```
geometry-furniture   110 sites   6 cache files
geometry-wall         28 sites   1 cache file
geometry-slab         26 sites   0 cache files
geometry-curtain-wall 19 sites   4 cache files
geometry-stair        14 sites   0 cache files
geometry-plumbing     11 sites   0 cache files
geometry-handrail      9 sites   1 cache file
geometry-roof          8 sites   0 cache files
geometry-lighting      5 sites   1 cache file
geometry-beam / door / window  4 sites each   0 cache files
geometry-column        3 sites   0 cache files
geometry-lift          2 sites   0 cache files
```

`SlabFragmentBuilder.ts:1693` and `RoofFragmentBuilder.ts:202` both construct a fresh
`MeshStandardMaterial` per element on the resolved-`materialId` path with no cache at all.
`WallFragmentBuilder.createWallMaterial()` (`:4790+`) likewise returns a new material on every
call and is invoked once per wall — `updateAllMaterials():5015-5021` calls it in a loop over
every fragment.

*User-visible:* one draw call per element rather than per material — the instancing defeat
already recorded in `webgpu-heavy-scene-crash-and-instancing`, here measured per family.

**L-2312 — `LightingFragmentBuilder` has 80 geometry-construction sites and no material
disposal**; see L-2300b. Called out separately because 80 is the largest single-file
allocation surface among the builders and it sits on the per-edit teardown path.

### 2.7 Two smaller findings, recorded so they are not lost

**L-2313 — `clearWallBaseY()` has zero production call sites.**
`packages/geometry-wall/src/WallVerticalDatum.ts:190`. Its own doc comment names it a
*"Test/project-teardown hook"*; `grep -rn clearWallBaseY` over `packages plugins src apps
tests` returns **7 references, all inside `__tests__`**, plus the definition. The
project-teardown half does not exist. `_baseY` is a module-scope `Map` cleared only by
`forgetWallBaseY` per removed wall (`WallFragmentBuilder.ts:935`), so it grows for the life
of the browser session across project switches. `WallFragmentBuilder.dispose():5023` does not
clear it either.

*Severity, honestly:* the map is keyed by `crypto.randomUUID()` wall ids
(`CreateWallCommand.ts:60,197`), so a cross-project stale read requires an id collision I did
not find a way to produce. The measured harm is unbounded growth plus a declared affordance
with no implementation — the class C84 §1 governs, at low user-visible severity.

**L-2314 — `WallStore.update()` silently drops `openings` behind a `console.warn`.**
`packages/geometry-wall/src/WallStore.ts:786-789`:

```ts
        if (safeUpdates.openings !== undefined) {
            console.warn("Direct opening update detected. Use addOpening/updateOpening/removeOpening instead.");
            delete safeUpdates.openings;
        }
```

The dedicated API *does* exist and *is* the right route, so this is a guard rather than a
hole. It is logged because a `console.warn` is not a refusal: the caller receives no signal,
`update()` returns normally, and no gate reads the console. The `updateWall()` whitelist
(`:940-1000`) and the `restoreSnapshot()` whitelist (`:1022-1072`) also differ —
`_sourceBaseLine` is in the restore set and not the forward set — which is the EI-7a
write-set/restore-set inequality with a named field attached.

---

## 3. PRIORITISED RISK LIST — highest user-visible risk first

| # | Finding | User-visible failure | Cheapest credible fix | Blast radius |
|---|---|---|---|---|
| **1** | **L-2301** dispose-before-detach in lift / door / floor-panel | Device loss → white viewport on WebGPU, on ordinary edits (a door move, a lift resize) | Reorder three functions: detach first, then `scheduleGpuRelease(root)`. `CeilingPanelBuilder.ts:121-124` is the exact shape to copy | 3 files, ~10 lines. No API change. Contained |
| **2** | **L-2305** the dead colour-tint branch | Setting a colour on curtain-wall mullions / glazing / roof does nothing; chat reports success over an unchanged model | Delete the unreachable `params.color === undefined` guard and decide the precedence explicitly (element colour overrides library colour, as wall's finish arm already does at `:4810`); add the colour to the two `mat:${matId}` cache keys | 4 files. **Changes rendered output** for any element carrying both a `materialId` and a colour — needs a founder call on precedence before it ships |
| **3** | **L-2300** plumbing releases nothing | Unbounded VRAM growth per fixture edit and across project switches; the accumulating half of device loss | Add `detachAndReleaseChildren(root)` before `root.clear()` and `scheduleGpuRelease(root)` in `removeFixture` | 1 file, 2 lines. Isolated |
| **4** | **L-2310** handrail / stair-railing instanced pick ids | Marquee-selecting a balustrade or stair selects nothing usable; both families are ON by default | Add a `pickId` parameter to `ElementInstanceBridge.register()` and pass the real element id from both builders | 3 files. The covering test bypasses the builders, so a real builder-driven test is part of the fix |
| **5** | **L-2307** floor and room never call `.parse()` | The two families with no schema boundary between UI and persistence | Route `CreateFloor`/`CreateRoom` through their L0 schema, or **declare the refusal** in C89/C94 with the reason | 2 handlers + 2 contracts. Likely surfaces real field mismatches on first run |
| **6** | **L-2315 / L-2303** the bus→legacy mirror mints ONE registry entry across 28 store writes | Twelve families enter the store with `getStoreType() === undefined`: collaborative catch-up replays their creates, the assistant reports them as `unknown` | One `elementRegistry.registerSemanticOrReplace(ev.id, '<family>')` per subscriber — the furniture subscriber at `initTools.ts:2345` is the shape to copy | 13 call sites in ONE file. Mechanical, low risk, high coverage. **Do this one first among the axis-6 items** |
| **7** | **L-2317** 42 of 46 plugin create handlers report success over a detached store | "Done" over a model nothing touched — the failure mode C84 §1 calls the worst in a BIM system | Apply the existing `CreateDoor.ts:149-155` refusal shape to the unguarded 42, or bridge them | 42 handlers. Large but each is ~6 lines and the pattern is already written and tested |
| **8** | **L-2306** repo-wide Zod `strip` | Silent field loss at every hop, in every family | Not a per-family fix — one decision at `BaseNode.ts:45` (`.strict()` and fix the fallout, vs `.passthrough()` and gate the bridge). This is C84 §7's generated field map | Repo-wide. Highest total value, highest cost. Belongs in a plan, not a patch |
| **9** | **L-2308 / L-2309** rebuild-per-edit + per-element materials | Slider drags re-allocate; draw calls scale with element count not material count | Per family, add the wall's `_lastBuiltVersion` shape. Do not start until 1–4 land — the leaks compound with the rebuild frequency | Large. Sequence after the GPU-lifetime fixes |
| **10** | **L-2302** WeakSet ownership test | Latent: a shared material freed by the wrong owner | Replace `_SHARED_MATERIALS.has(mat)` with `isSharedGpuResource(mat)` | 2 files |
| **11** | **L-2311** `castShadow` forced true | Shadow toggles ignored on instanced elements | Fold shadow flags into the group key, or refuse instancing for elements with non-default flags | Renderer-level; touches every instanced family |
| **12** | **L-2316** handrail / lighting / plumbing register only at mesh-build; lighting + plumbing never `registerSemantic` at all | An element that never meshes is invisible to every registry consumer; lighting and plumbing are `unknown` to the assistant permanently | Move `registerSemantic` into the three create commands, alongside the existing `bimManager.registerElement` | 3 commands. Contained |
| **13** | **L-2318** lighting absent from one of two `ProjectLoader`s | A project saved with lighting reloads with none, through that loader | Add the `CreateLightingCommand` arm to `packages/persistence-client/src/loader/ProjectLoader.ts` | 1 file. **First establish which loader ships** — two loaders is the real defect |
| **14** | **L-2313 / L-2314 / L-2319** | Low. Unbounded map growth; a warn that is not a refusal; an unreached second room-create | Call `clearWallBaseY()` from `projectScopedBuilderTeardown`; make the openings guard return a result; delete or wire `roomCreate.ts` | 3 files |

**The ratchet blind spot is not on this list because it is not a defect in a family — it is a
defect in the instrument.** `casterReleaseChokepoint.test.ts:251`'s regex misses four of the
six violations above, and plumbing passes it by disposing nothing. Whatever lane fixes 1–3
must widen that detector in the same slice, or the next regression will be invisible again.

---

## 4. WHAT I DID NOT REACH — the honest register

Stated explicitly per C84 EI-1b, because a blank reads as "fine".

- **Axis 5 (hosting), 15 of 18 rows.** I traced `wall → door` and `wall → window` end to end
  and read the published-datum module they share. Both are **DERIVED, not remembered** —
  `WindowBuilder.positionGroup():1107-1225` derives centre from
  `hostedElementFrame(wallData, offset, width)`, Y from `resolveWallBaseYOrLevel` +
  `hostedLeafCentreY`, rotation from the same frame, and refuses loudly with
  `SpatialAuthorityError` rather than defaulting to Y=0 (`:1131-1146`). `DoorBuilder:714-720`
  matches. I did **not** trace ceiling→room, floor→slab, floor→room, curtain-wall→slab,
  furniture→room, lighting→room/host, plumbing→room, handrail→stair, or any `anchor` field
  consumer beyond `WallFragmentBuilder:3947` and `:4129`.
- **Axis 6 (creation paths), 2 of 17 rows** — lift and pool. The other fifteen were
  enumerated (76 paths); the residual blanks inside them are named at the end of §2.5.
- **Axis 2 for room/space** — `packages/room-topology` and `RoomBoundaryBuilder.ts` were not
  read.
- **`geometry-furniture`'s ~40 sub-builders** under `src/builders/**` — only
  `FurnitureFragmentBuilder.ts`, the family's lifecycle owner, was audited. The 110
  material-construction sites in that package are a raw count, not a per-file verdict.
- **`*Tool.ts` files** (`SlabTool.ts` 26 dispose sites, `WallTool.ts` 16, `CeilingTool.ts`
  16, `FloorTool.ts` 13, `OpeningTool.ts` 6) — excluded, matching the existing ratchet's own
  scope decision.
- **`WallJunctionInfillManager.ts`** — 3 in-place disposes on the existing baseline,
  unaudited.
- **Runtime confirmation of any leak.** Every finding here is a static read of the cited
  lines. Nothing was observed in a running browser.
- **Whether non-plugin callers** (`apps/**`, `packages/ai-host/**`,
  `packages/command-registry/**`) dispatch fields the 16 schemas strip. C97 §5.2 names six
  such sites for furniture alone; the repo-wide denominator is unknown.
- **Stack B** (`geometry-kernel/producers`) — out of scope for this lane; C84 §4D records the
  open founder question about what it is for.

## 5. IN OTHER LANES' DOMAINS — recorded, not claimed

- **`packages/geometry-roof/node_modules/@pryzm/.ignored_geometry-kernel/`** is a full second
  copy of `geometry-kernel`'s producer sources inside another package's `node_modules`. It
  matches every repo-wide `grep` that does not exclude it, which is how an audit sweep
  silently doubles its counts. → **plugins/API or build lane.**
- **`setMaterial` handlers across families are DECLARED REFUSALS**, not dead verbs —
  `plugins/beam/src/handlers/SetBeamMaterial.ts:100-119` refuses in `canExecute` with a named
  reason. That is the correct shape and is recorded here as a **clean negative** so no lane
  re-reports it as a gap. → **commands/stores lane** owns whether the bridge should be built.
- **Contract line-citation drift**: C87 §5, C96 §5.4 and C93 §5/§9 cite line numbers and
  field absences that no longer match the schemas (`Beam.ts:75,:83,:98` now declare all three
  fields C93 calls missing). → **contracts lane.**
