# Rhino (.3dm) Import Pipeline — what a Rhino object becomes in PRYZM

> Reference doc, evidence-based (2026-08-10). Contract: `C33-RHINO-INTERCHANGE.md`.
> Code authority: `packages/file-format/src/import/rhino/RhinoImporter.ts`,
> `apps/editor/src/engine/initUI.ts` (§RHINO import + Import Manager bridges),
> `apps/editor/src/engine/initBusHandlers.ts` (§FEAT-RHINO-CHAT-MATERIAL).

## What a Rhino object becomes

A Rhino import is **reference content, not BIM elements**. The file is parsed by
three's `Rhino3dmLoader` (rhino3dm WASM, lazy-loaded from `/libs/rhino3dm/`);
the result is one `THREE.Group` named `rhino__<file>` added directly to the
scene root (`initUI.ts`), with a `-90°` X rotation on the root group only
(§RHINO-ZUP-YUP, L-816: Rhino is Z-up, PRYZM/three are Y-up; children keep raw
Rhino transforms so a future re-export can recover original coordinates).

Rhino objects are **NOT** in `wallStore` / `slabStore` / any geometry store, are
not commands-addressable per element, and therefore:

- **excluded** from room detection, wall joins, and every store-driven pipeline
  (NativeElementMeshExporter is `Level.childrenIds`-driven and never sees them);
- **excluded** from IFC export (store-driven) and from persistence — a Rhino
  import is **session-local**: it does not survive project reload and is not
  synced to collaborators;
- **excluded** from camera fit bounds pass 1 (`computeBimFitBounds`
  §PLAN-FIT-BIM-ONLY L-814 — `elementType: 'rhino'` is deliberately not in the
  BIM allow-list);
- **excluded** from undo/redo except the chat recolour (below), which is one
  `commandManager` entry.

### Per-object stamps (import time)

Each mesh gets `userData`: `id` (`<modelId>:<n>`), `elementType: 'rhino'`,
`source: 'rhino-import'`, `isRhinoProxy: true`, `selectable: true`, `modelId`,
plus the loader's own `attributes` (object `name`, `layerIndex`, …). The root
group carries `isRhinoImport`, `fileName`, `modelId`, `importedAt`,
`source: 'rhino-import'`, and the raw `.3dm` layer table at `userData.layers`.

## What survives

- **Layers** — full table incl. nested `Parent::Child` paths and authored
  visibility; per-layer show/hide in the Import Manager (§RHINO-LAYER-CONTROL).
- **Object names** — `userData.attributes.name`; shown in the properties panel.
- **Materials/colours** — loader materials, then deduplicated at import by
  colour × opacity × transparency × texture (§PERF-RHINO: e.g. hundreds of
  per-object materials collapse to the distinct set; log line
  `[§PERF-RHINO] <file>: N meshes; materials A → B after dedup`).
- **Geometry** — meshes; NURBS surfaces/breps/extrusions arrive as the render
  meshes baked in the file; curves arrive as line objects.

## What is lost

- **Annotations/dimensions** — `ObjectType_Annotation` is skipped by the loader
  (console warning; surfaced in the fidelity report `issues`).
- **Objects with no render mesh** (unmeshed breps saved without render meshes),
  blocks/instance definitions beyond what the loader expands, and any
  Grasshopper/plug-in data.
- **BIM semantics** — nothing becomes a wall/slab/door; no cut semantics.
- **Persistence** — see above: reference content is not saved with the project.

## Feature surfaces (2026-08-10)

| Surface | Behaviour |
|---|---|
| **Selection** (§RHINO-SELECT) | Click-selectable in 3D (GPU pick registry keyed by per-mesh `id`). Properties panel shows a read-only Rhino panel: object name/type, layer (+path), material, source file, model id, import time. |
| **Chat** (§FEAT-RHINO-CHAT-MATERIAL) | "change all elements of the rhino model to white" / "paint the rhino model \<colour\>" / "reset the rhino model materials" — zero-token; ONE shared override material for the whole model; ONE Ctrl+Z entry; honest report incl. "no Rhino model is imported". Colour vocabulary = `packages/ai-host/src/intents/colorRef.ts`. |
| **Plan / Section / Elevation** (§RHINO-PLAN) | Projected via the edge-projector's Source C lane on layer `A-FURN` — **projected-only linework**: no fabricated cut fills or heavy CUT pen (no cut semantics exist to draw). Visibility toggles with the furniture VG category and the Import Manager's per-model/per-layer show-hide. Limits: the 3D-mounted elevation activation and sheet-thumbnail background projections (`ViewController.ts`, 3-arg `project()` calls) do not yet pass scene groups; Source C is uncached/unchunked, so very large models lengthen full reprojections. |
| **Shadows / perf** (§PERF-RHINO) | `castShadow/receiveShadow` off at import; `PascalSceneLighting` skips `isRhinoProxy` so the full-scene shadow pass can never re-promote them. Geometry is deliberately **not merged** — per-object identity is required for selection/properties. Meshes still count toward SceneQualityTier's mesh budget (honest tier). |
| **3D Site / 3D Globe** | Partially wired. These Cesium views render a **GLB bake** of the scene (`exportFragmentsToGLB` → `selectElementsForExport`, keyed on `userData.elementType`), and Rhino meshes now carry `elementType` so they are included in the bake with their world transform (root rotation baked by `cloneWithBakedWorldTransform`, so no re-anchoring and no double axis conversion). **Not yet done** (lives in `GISAreaLayout.ts`, owned by the Earth workstream at the time of writing): the `hasAuthoredBuilding` gate and the `computeBuildingSignature` re-export cache only count native stores + IFC meshes, so a **Rhino-only** project still reads "no authored building", and importing/removing a Rhino model does not invalidate an already-placed GLB. Fix shape = generalise `countIfcSceneMeshes()` to any `userData.source` import tag and fold the count into the signature. The REAL-GLB triangle budget (1.5 M) applies; an over-budget model honestly keeps the massing study. |

## Removal / visibility

Import Manager (§32): per-model remove / show-hide / lock, per-layer show-hide.
The chat bridge reads the same live registry (`window.__pryzmRhinoImports`,
published by `initUI`), so a removed model can never be recoloured.
