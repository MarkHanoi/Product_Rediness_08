# PRYZM — API Verb Register (C69)

> ⚠ **GENERATED FILE — DO NOT EDIT BY HAND.**
> Produced by `tools/ga-gate/check-verb-register.ts`. Regenerate with
> `npx tsx tools/ga-gate/check-verb-register.ts --write`.
> `check-verb-register.ts` fails CI when this file and the code disagree, in either
> direction, so a PR that registers a new bus command and does not regenerate here
> cannot merge. Governed by [C69](../02-decisions/contracts/C69-API-VERB-REGISTER.md).

Every row is a **wire identifier**. A command type appears in `project_command_log`
and in replayed collaboration history, so renaming one is a PERSISTENCE-BREAKING
change, not a rename — see C69 §2.

## Measured at generation

| | |
|---|---|
| Handler files read | 1377 (floor 900) |
| **Verbs** | **353** (floor 250) |
| LIVE | 136 |
| REFUSES | 37 |
| SHADOWED (dead route) | 1 |
| UNKNOWN | 179 |
| — of the LIVE, credited by the §L-946 mirror channel | 12 of 12 level-change verb(s) |
| authoritative store NONE or UNKNOWN | 217 |
| sync UNDECLARED (property verbs) | 2 |
| chat UNDECLARED | 13 |

These numbers are re-derived on every run. Do not transcribe them anywhere else
(C64 §2.13) — cite this file.

## Column meanings

| Column | Derivation |
|---|---|
| **verb** | the `type` literal a handler registers. Wire identifier. |
| **owner** | workspace containing the declaring file. |
| **liveness** | `LIVE` — declared in an execution-authority root (`packages/command-registry`, `apps/editor`), or a legacy bridge, or **live via the §L-946 MIRROR CHANNEL**: a plugin handler whose patch reaches the legacy store the renderer reads, through `CommandEventBridge.emitLevelChange` → `element.level-changed` → `applyElementLevelChange` → `legacyStore.changeLevel`. That third route is only credited when all THREE of its statically-greppable conditions hold — a `LEVEL_CHANGE_VERBS` row, a `LEGACY_LEVEL_MOVERS` row for the verb's `kind`, and an `initTools` dep passing that store into `registerElementLevelChangeBridge`. `REFUSES` — the verb is registered and answers, in the open, that it will not act. TWO shapes count, and both are checked: `canExecute` can never return `{valid:true}` (§FIX-DEAD-VERB-REFUSE), **or** `execute` returns a `CapabilityRefusal` on `HandlerResult.refusal` beside an empty patch pair and mutates nothing (§REFUSAL-IS-A-VALUE, the shape C16 CA-18 prescribes — a refusal the caller reads, rather than a throw a `catch {}` can swallow). `SHADOWED` — two registration sites; the boot-order guard means the plugin one wins and the live bridge never registers. `UNKNOWN` — a lone plugin `produceCommand` handler; nobody has proven either way. |
| **authoritative store** | the `affectedStores` names when LIVE; `NONE` when the verb refuses; `UNKNOWN` otherwise. Never blank, never a favourable default. |
| **undo** | the declared shape — a forward/inverse pair and the stores `affectedStores` names, or the legacy stack, or NONE. Declared shape, not an executed proof. |
| **sync** | cited from `packages/sync-client/src/syncDisposition.ts`. `UNDECLARED` = a property-mutation verb with no disposition. |
| **chat** | cited from `ChatCapabilityRegistry` / `CHAT_UNAVAILABLE` / `ChatCommandClassification`. |

## Register

| verb | owner | liveness | authoritative store | undo | sync | chat |
|---|---|---|---|---|---|---|
| `annotation.create` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | synced via 'id' (disclose) | classified B |
| `annotation.delete` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | not-synced (reason declared) | classified B |
| `annotation.move` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | not-synced (reason declared) | classified B |
| `annotation.setColor` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | synced via 'annotationId' (disclose) | classified B |
| `annotation.setKind` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | synced via 'annotationId' (disclose) | classified B |
| `annotation.setRotation` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | synced via 'annotationId' (disclose) | classified B |
| `annotation.setText` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | synced via 'annotationId' (disclose) | classified B |
| `annotation.setTextHeight` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | synced via 'annotationId' (disclose) | classified B |
| `annotation.update` | plugins/annotations | UNKNOWN | UNKNOWN | patch-pair → annotation | synced via 'annotationId' (disclose) | classified B |
| `balcony.create` | plugins/balcony | UNKNOWN | UNKNOWN | patch-pair → balcony + slab + floor + handrail | synced via 'balconyId' (disclose) | UNDECLARED |
| `balcony.delete` | plugins/balcony | UNKNOWN | UNKNOWN | patch-pair → balcony + slab + floor + handrail | not-synced (reason declared) | UNDECLARED |
| `balcony.updateProfile` | plugins/balcony | UNKNOWN | UNKNOWN | patch-pair → balcony + slab + floor + handrail | synced via 'balconyId' (disclose) | UNDECLARED |
| `beam.batch.create` | plugins/beam | UNKNOWN | UNKNOWN | patch-pair → beam | not-synced (reason declared) | classified C |
| `beam.changeLevel` | plugins/beam | LIVE | legacy beamStore (via element.level-changed mirror) | patch-pair → beam | not-synced (reason declared) | capability: move-to-level |
| `beam.create` | plugins/beam | UNKNOWN | UNKNOWN | patch-pair → beam | synced via 'id' (disclose) | classified B |
| `beam.delete` | plugins/beam | UNKNOWN | UNKNOWN | patch-pair → beam | not-synced (reason declared) | classified D |
| `beam.move` | plugins/beam | REFUSES | NONE | patch-pair → beam | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `beam.setMaterial` | plugins/beam | REFUSES | NONE | patch-pair → beam | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `beam.setSection` | plugins/beam | UNKNOWN | UNKNOWN | patch-pair → beam | synced via 'beamId' (disclose) | classified B |
| `beam.setType` | plugins/beam | UNKNOWN | UNKNOWN | patch-pair → beam | synced via 'beamId' (disclose) | classified B |
| `beam.update` | apps/editor | LIVE | beam | UNKNOWN (declares beam) | synced via 'beamId' (disclose) | classified D |
| `boundaryLine.attach` | plugins/boundary-line | UNKNOWN | UNKNOWN | patch-pair → boundaryLine | synced via 'boundaryLineId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `boundaryLine.create` | plugins/boundary-line | UNKNOWN | UNKNOWN | patch-pair → boundaryLine | synced via 'boundaryLineId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `boundaryLine.delete` | plugins/boundary-line | UNKNOWN | UNKNOWN | patch-pair → boundaryLine | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `boundaryLine.detach` | plugins/boundary-line | UNKNOWN | UNKNOWN | patch-pair → boundaryLine | synced via 'boundaryLineId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `boundaryLine.move` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'boundaryLineId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `boundaryLine.update` | plugins/boundary-line | UNKNOWN | UNKNOWN | patch-pair → boundaryLine | synced via 'boundaryLineId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `ceiling.batch.create` | plugins/ceiling | UNKNOWN | UNKNOWN | patch-pair → ceiling | not-synced (reason declared) | classified C |
| `ceiling.changeLevel` | plugins/ceiling | LIVE | legacy ceilingStore (via element.level-changed mirror) | patch-pair → ceiling | not-synced (reason declared) | capability: move-to-level |
| `ceiling.create` | plugins/ceiling | UNKNOWN | UNKNOWN | patch-pair → ceiling | synced via 'id' (disclose) | classified B |
| `ceiling.delete` | plugins/ceiling | UNKNOWN | UNKNOWN | patch-pair → ceiling | not-synced (reason declared) | classified D |
| `ceiling.setBoundary` | plugins/ceiling | UNKNOWN | UNKNOWN | patch-pair → ceiling | synced via 'ceilingId' (disclose) | classified B |
| `ceiling.setHeight` | plugins/ceiling | UNKNOWN | UNKNOWN | patch-pair → ceiling | synced via 'ceilingId' (disclose) | classified D |
| `ceiling.setMaterial` | plugins/ceiling | REFUSES | NONE | patch-pair → ceiling | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `ceiling.update` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'ceilingId' (disclose) | capability: set-height |
| `ceiling.updateLayers` | plugins/ceiling | UNKNOWN | UNKNOWN | patch-pair → ceiling | synced via 'ceilingId' (disclose) | classified B |
| `ceiling.updateSystemTypeBatch` | plugins/ceiling | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-ceiling-type |
| `column.batch.create` | plugins/column | UNKNOWN | UNKNOWN | patch-pair → column | not-synced (reason declared) | classified C |
| `column.changeLevel` | plugins/column | LIVE | legacy columnStore (via element.level-changed mirror) | patch-pair → column | not-synced (reason declared) | capability: move-to-level |
| `column.create` | plugins/column | UNKNOWN | UNKNOWN | patch-pair → column | synced via 'id' (disclose) | classified B |
| `column.delete` | plugins/column | UNKNOWN | UNKNOWN | patch-pair → column | not-synced (reason declared) | classified D |
| `column.move` | plugins/column | REFUSES | NONE | patch-pair → column | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `column.setHeight` | plugins/column | UNKNOWN | UNKNOWN | patch-pair → column | synced via 'columnId' (disclose) | classified D |
| `column.setMaterial` | plugins/column | REFUSES | NONE | patch-pair → column | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `column.setType` | plugins/column | UNKNOWN | UNKNOWN | patch-pair → column | synced via 'columnId' (disclose) | classified B |
| `column.update` | apps/editor | LIVE | column | UNKNOWN (declares column) | synced via 'id' (disclose) | classified D |
| `copy-selection` | plugins/selection | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | classified B |
| `cube.move` | plugins/toy-cube | UNKNOWN | UNKNOWN | patch-pair → cube | not-synced (reason declared) | UNDECLARED |
| `curtain-wall.addGridLine` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | synced via 'curtainWallId' (disclose) | classified B |
| `curtain-wall.addPanel` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified B |
| `curtain-wall.batch.create` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified C |
| `curtain-wall.batch.delete` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified C |
| `curtain-wall.batch.update` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified C |
| `curtain-wall.create` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | synced via 'id' (disclose) | classified B |
| `curtain-wall.create-on-all-slabs` | plugins/curtain-wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified E |
| `curtain-wall.delete` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified D |
| `curtain-wall.move` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `curtain-wall.removeGridLine` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | synced via 'curtainWallId' (disclose) | classified B |
| `curtain-wall.removePanel` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified B |
| `curtain-wall.replacePanel` | plugins/curtain-wall | UNKNOWN | UNKNOWN | NONE (empty patch pair) | synced via 'panelId' (disclose) | classified B |
| `curtain-wall.resize` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | synced via 'curtainWallId' (disclose) | classified B |
| `curtain-wall.rotatePanel` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified B |
| `curtain-wall.setGrid` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | synced via 'curtainWallId' (disclose) | classified B |
| `curtain-wall.setMaterial` | plugins/curtain-wall | REFUSES | NONE | patch-pair → curtainwall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `curtain-wall.setMullionType` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | synced via 'curtainWallId' (disclose) | classified B |
| `curtain-wall.setOutline` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | synced via 'curtainWallId' (disclose) | classified B |
| `curtain-wall.setPanelType` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified B |
| `curtain-wall.setTransomType` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | synced via 'curtainWallId' (disclose) | classified B |
| `curtain-wall.swapPanel` | plugins/curtain-wall | UNKNOWN | UNKNOWN | patch-pair → curtainwall | not-synced (reason declared) | classified B |
| `curtainWall.changeLevel` | plugins/curtain-wall | LIVE | legacy curtainWallStore (via element.level-changed mirror) | patch-pair → curtainwall | not-synced (reason declared) | capability: move-to-level |
| `data.clearPropertyDerived` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `data.markPropertyDerived` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `data.setDerivation` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `dimension.create` | plugins/dimensions | UNKNOWN | UNKNOWN | patch-pair → dimension | synced via 'id' (disclose) | classified B |
| `dimension.createMany` | plugins/dimensions | UNKNOWN | UNKNOWN | patch-pair → dimension | not-synced (reason declared) | classified B |
| `dimension.delete` | plugins/dimensions | UNKNOWN | UNKNOWN | patch-pair → dimension | not-synced (reason declared) | classified B |
| `dimension.move` | plugins/dimensions | REFUSES | NONE | patch-pair → dimension | not-synced (reason declared) | classified B |
| `dimension.setPrecision` | plugins/dimensions | UNKNOWN | UNKNOWN | patch-pair → dimension | synced via 'dimensionId' (disclose) | classified B |
| `dimension.setText` | plugins/dimensions | UNKNOWN | UNKNOWN | patch-pair → dimension | synced via 'dimensionId' (disclose) | classified B |
| `dimension.setUnit` | plugins/dimensions | UNKNOWN | UNKNOWN | patch-pair → dimension | synced via 'dimensionId' (disclose) | classified B |
| `door.batch.create` | plugins/door | UNKNOWN | UNKNOWN | patch-pair → door | not-synced (reason declared) | classified C |
| `door.create` | plugins/door | REFUSES | NONE | patch-pair → door | synced via 'id' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `door.delete` | plugins/door | UNKNOWN | UNKNOWN | patch-pair → door | not-synced (reason declared) | classified D |
| `door.move` | plugins/door | REFUSES | NONE | patch-pair → door | synced via 'doorId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `door.setAccessibility` | plugins/door | UNKNOWN | UNKNOWN | patch-pair → door | synced via 'doorId' (disclose) | classified B |
| `door.setFireRating` | plugins/door | UNKNOWN | UNKNOWN | patch-pair → door | synced via 'doorId' (disclose) | classified B |
| `door.setFrameColor` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'doorId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `door.setHeight` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'doorId' (disclose) | classified D |
| `door.setOffset` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'doorId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `door.setSillHeight` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'doorId' (disclose) | classified D |
| `door.setSwing` | plugins/door | UNKNOWN | UNKNOWN | patch-pair → door | synced via 'doorId' (disclose) | classified B |
| `door.setType` | plugins/door | UNKNOWN | UNKNOWN | patch-pair → door | synced via 'doorId' (disclose) | classified B |
| `door.setWidth` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'doorId' (disclose) | classified D |
| `door.updateSystemTypeBatch` | plugins/door | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-door-type |
| `element.changeType` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'elementId' (disclose) | capability: set-stair-railing-type |
| `element.delete` | plugins/view | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: delete-selected |
| `element.deleteBatch` | plugins/view | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: delete-furniture-scoped |
| `element.hideInView` | plugins/view | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `element.isolateInView` | plugins/view | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `element.setGraphicOverride` | plugins/view | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `element.updateDimensionsBatch` | plugins/view | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-window-dimensions |
| `element.updateMark` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'elementId' (disclose) | classified D |
| `element.updateOpeningProfileBatch` | plugins/view | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | UNDECLARED |
| `element.updateParameters` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'elementId' (disclose) | capability: set-height |
| `elementType.create` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | classified C |
| `elementType.delete` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `elementType.duplicate` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | classified C |
| `elementType.update` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | classified C |
| `elevation.create` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `floor.changeLevel` | plugins/floor | LIVE | legacy floorStore (via element.level-changed mirror) | patch-pair → floor | not-synced (reason declared) | capability: move-to-level |
| `floor.create` | plugins/floor | UNKNOWN | UNKNOWN | UNKNOWN (declares floor) | synced via 'floorId' (disclose) | classified B |
| `floor.setFinishBatch` | plugins/floor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-floor-finish |
| `floor.setMaterial` | plugins/floor | REFUSES | NONE | patch-pair → floor | synced via 'floorId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `floor.update` | apps/editor | LIVE | floor | UNKNOWN (declares floor) | synced via 'floorId' (disclose) | classified D |
| `floor.updateLayers` | plugins/floor | UNKNOWN | UNKNOWN | patch-pair → floor | synced via 'floorId' (disclose) | classified B |
| `furniture.batch.create` | plugins/furniture | UNKNOWN | UNKNOWN | patch-pair → furniture | not-synced (reason declared) | classified C |
| `furniture.changeLevel` | plugins/furniture | LIVE | legacy furnitureStore (via element.level-changed mirror) | patch-pair → furniture | not-synced (reason declared) | capability: move-to-level |
| `furniture.create` | plugins/furniture | UNKNOWN | UNKNOWN | patch-pair → furniture | synced via 'id' (disclose) | classified B |
| `furniture.delete` | plugins/furniture | UNKNOWN | UNKNOWN | patch-pair → furniture | not-synced (reason declared) | classified D |
| `furniture.move` | plugins/furniture | REFUSES | NONE | patch-pair → furniture | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `furniture.rotate` | plugins/furniture | REFUSES | NONE | patch-pair → furniture | synced via 'furnitureId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `furniture.setActiveLod` | plugins/furniture | UNKNOWN | UNKNOWN | patch-pair → furniture | synced via 'furnitureId' (disclose) | classified C |
| `furniture.setMaterial` | plugins/furniture | REFUSES | NONE | patch-pair → furniture | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `furniture.setRepresentation` | plugins/furniture | UNKNOWN | UNKNOWN | patch-pair → furniture | synced via 'furnitureId' (disclose) | classified C |
| `furniture.setScale` | plugins/furniture | UNKNOWN | UNKNOWN | patch-pair → furniture | synced via 'furnitureId' (disclose) | classified B |
| `furniture.updateParameters` | plugins/furniture | UNKNOWN | UNKNOWN | NONE (empty patch pair) | synced via 'id' (disclose) | classified D |
| `generation.apartment` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | capability: generate-apartment-layout |
| `generation.building` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | capability: generate-building |
| `generation.finish-chain` | apps/editor | LIVE | legacy geometry store (via commandManager) | NONE (empty patch pair) | not-synced (reason declared) | capability: finish-apartment-chain |
| `generation.rooms` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | capability: generate-room-finishes |
| `generative.applyLayout` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `graph.neighbors` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | UNDECLARED |
| `graph.path` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | UNDECLARED |
| `graph.query` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | UNDECLARED |
| `grid.add` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified D |
| `grid.create` | plugins/grid | UNKNOWN | UNKNOWN | patch-pair → grid | synced via 'id' (disclose) | classified B |
| `grid.delete` | plugins/grid | UNKNOWN | UNKNOWN | patch-pair → grid | not-synced (reason declared) | classified B |
| `grid.setExtent` | plugins/grid | UNKNOWN | UNKNOWN | patch-pair → grid | synced via 'gridId' (disclose) | classified B |
| `grid.setSpacing` | plugins/grid | UNKNOWN | UNKNOWN | patch-pair → grid | synced via 'gridId' (disclose) | classified B |
| `grid.update` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'gridId' (disclose) | classified D |
| `handrail.changeLevel` | plugins/handrail | LIVE | legacy handrailStore (via element.level-changed mirror) | patch-pair → handrail | not-synced (reason declared) | capability: move-to-level |
| `handrail.create` | plugins/handrail | UNKNOWN | UNKNOWN | patch-pair → handrail | synced via 'id' (disclose) | classified B |
| `handrail.delete` | plugins/handrail | UNKNOWN | UNKNOWN | patch-pair → handrail | not-synced (reason declared) | classified D |
| `handrail.moveBaseLine` | apps/editor | LIVE | handrail | patch-pair → handrail | synced via 'id' (disclose) | classified B |
| `handrail.recompute` | plugins/handrail | UNKNOWN | UNKNOWN | patch-pair → handrail | synced via 'handrailId' (disclose) | classified C |
| `handrail.setHost` | plugins/handrail | UNKNOWN | UNKNOWN | patch-pair → handrail | synced via 'handrailId' (disclose) | classified B |
| `handrail.setMaterial` | plugins/handrail | REFUSES | NONE | patch-pair → handrail | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `handrail.setPath` | plugins/handrail | UNKNOWN | UNKNOWN | patch-pair → handrail | synced via 'handrailId' (disclose) | classified B |
| `handrail.setShape` | plugins/handrail | UNKNOWN | UNKNOWN | patch-pair → handrail | synced via 'handrailId' (disclose) | classified B |
| `handrail.updateColor` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'id' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `hierarchy.createBuilding` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `hierarchy.createLevel` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `hierarchy.createSite` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `hierarchy.createUnit` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `hierarchy.updateNode` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `level.add` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: add-level |
| `level.duplicate-floor-plan` | plugins/levels | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: duplicate-level |
| `level.update` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `lift.create` | plugins/lift | UNKNOWN | UNKNOWN | patch-pair → lift + liftPart + wall + curtainwall + door + slab | synced via 'liftId' (disclose) | UNDECLARED |
| `lift.delete` | plugins/lift | UNKNOWN | UNKNOWN | patch-pair → lift + liftPart + wall + curtainwall + door + slab | not-synced (reason declared) | UNDECLARED |
| `lighting.changeLevel` | plugins/lighting | LIVE | legacy lightingStore (via element.level-changed mirror) | patch-pair → lighting | not-synced (reason declared) | capability: move-to-level |
| `lighting.create` | plugins/lighting | UNKNOWN | UNKNOWN | patch-pair → lighting | synced via 'id' (disclose) | classified B |
| `lighting.delete` | plugins/lighting | UNKNOWN | UNKNOWN | patch-pair → lighting | not-synced (reason declared) | classified D |
| `lighting.move` | plugins/lighting | REFUSES | NONE | patch-pair → lighting | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `lighting.setEmergency` | plugins/lighting | UNKNOWN | UNKNOWN | patch-pair → lighting | synced via 'lightingId' (disclose) | classified B |
| `lighting.setIntensity` | plugins/lighting | UNKNOWN | UNKNOWN | patch-pair → lighting | synced via 'lightingId' (disclose) | classified D |
| `lighting.setMaterial` | plugins/lighting | REFUSES | NONE | patch-pair → lighting | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `opening.create` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'id' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `paste-clipboard` | plugins/selection | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | classified B |
| `plumbing.changeLevel` | plugins/plumbing | LIVE | legacy plumbingStore (via element.level-changed mirror) | patch-pair → plumbing | not-synced (reason declared) | capability: move-to-level |
| `plumbing.create` | plugins/plumbing | UNKNOWN | UNKNOWN | patch-pair → plumbing | synced via 'id' (disclose) | classified B |
| `plumbing.createFixture` | plugins/plumbing | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `plumbing.delete` | plugins/plumbing | UNKNOWN | UNKNOWN | patch-pair → plumbing | not-synced (reason declared) | classified D |
| `plumbing.move` | plugins/plumbing | REFUSES | NONE | patch-pair → plumbing | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `plumbing.moveFixture` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'id' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `plumbing.setMaterial` | plugins/plumbing | REFUSES | NONE | patch-pair → plumbing | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `plumbing.setSystem` | plugins/plumbing | UNKNOWN | UNKNOWN | patch-pair → plumbing | synced via 'plumbingId' (disclose) | classified B |
| `pool.create` | plugins/pool | UNKNOWN | UNKNOWN | patch-pair → pool + wall + slab + water | synced via 'poolId' (disclose) | classified B |
| `pool.delete` | plugins/pool | UNKNOWN | UNKNOWN | patch-pair → pool + wall + slab + water | not-synced (reason declared) | classified D |
| `projectOrigin.setPosition` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | classified C |
| `projectOrigin.setVisible` | apps/editor | LIVE | projectOrigin | patch-pair → projectOrigin | not-synced (reason declared) | classified C |
| `rhino.resetMaterial` | apps/editor | LIVE | legacy geometry store (via commandManager) | patch-pair → NONE declared | not-synced (reason declared) | capability: set-rhino-material |
| `rhino.setMaterial` | apps/editor | LIVE | legacy geometry store (via commandManager) | UNKNOWN | not-synced (reason declared) | capability: set-rhino-material |
| `roof.addSkylight` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | not-synced (reason declared) | classified B |
| `roof.changeLevel` | plugins/roof | LIVE | legacy roofStore (via element.level-changed mirror) | patch-pair → roof | not-synced (reason declared) | capability: move-to-level |
| `roof.create` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | synced via 'id' (disclose) | classified B |
| `roof.delete` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | not-synced (reason declared) | classified D |
| `roof.joinRoofs` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | not-synced (reason declared) | classified B |
| `roof.move` | plugins/roof | REFUSES | NONE | patch-pair → roof | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `roof.removeSkylight` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | not-synced (reason declared) | classified B |
| `roof.setMaterial` | plugins/roof | REFUSES | NONE | patch-pair → roof | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `roof.setOverhang` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | synced via 'roofId' (disclose) | classified D |
| `roof.setPitch` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | synced via 'roofId' (disclose) | classified D |
| `roof.setShape` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | synced via 'roofId' (disclose) | classified B |
| `roof.setThickness` | plugins/roof | UNKNOWN | UNKNOWN | patch-pair → roof | synced via 'roofId' (disclose) | classified D |
| `roof.update` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'id' (disclose) | capability: set-thickness |
| `room.create` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'id' (disclose) | classified B |
| `room.delete` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified D |
| `room.move` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `room.recomputeBoundary` | plugins/rooms | REFUSES | NONE | NONE (empty patch pair) | not-synced (reason declared) | classified C |
| `room.redetect` | plugins/rooms | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | classified C |
| `room.regenerate` | plugins/rooms | REFUSES | NONE | NONE (empty patch pair) | not-synced (reason declared) | classified E |
| `room.rename` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'roomId' (last-writer-wins) | capability: rename-room |
| `room.restoreMeaning` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | n/a (not a property verb) | UNDECLARED |
| `room.setColourMode` | plugins/rooms | UNKNOWN | UNKNOWN | NONE (empty patch pair) | UNDECLARED | UNDECLARED |
| `room.setFinish` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `room.setHeightOffset` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'roomId' (disclose) | capability: set-room-height-offset |
| `room.setMaterial` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'roomId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `room.setName` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'roomId' (last-writer-wins) | classified D |
| `room.setNumber` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'roomId' (disclose) | capability: set-room-number |
| `room.setOccupancy` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'roomId' (disclose) | capability: set-room-occupancy |
| `room.updateBoundary` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'id' (disclose) | classified C |
| `schedule.column.add` | plugins/schedules | UNKNOWN | UNKNOWN | patch-pair → schedule | not-synced (reason declared) | classified B |
| `schedule.column.remove` | plugins/schedules | UNKNOWN | UNKNOWN | patch-pair → schedule | not-synced (reason declared) | classified B |
| `schedule.create` | plugins/schedules | UNKNOWN | UNKNOWN | patch-pair → schedule | not-synced (reason declared) | classified B |
| `schedule.delete` | plugins/schedules | UNKNOWN | UNKNOWN | patch-pair → schedule | not-synced (reason declared) | classified B |
| `schedule.setFilter` | plugins/schedules | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | classified B |
| `schedule.setGroupBy` | plugins/schedules | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | classified B |
| `schedule.update` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified D |
| `section.create` | plugins/section-view | UNKNOWN | UNKNOWN | patch-pair → section | not-synced (reason declared) | classified B |
| `section.delete` | plugins/section-view | UNKNOWN | UNKNOWN | patch-pair → section | not-synced (reason declared) | classified B |
| `section.mark.create` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `section.moveLine` | plugins/section-view | REFUSES | NONE | patch-pair → section | not-synced (reason declared) | classified B |
| `section.setDepth` | plugins/section-view | UNKNOWN | UNKNOWN | patch-pair → section | not-synced (reason declared) | classified B |
| `section.setMark` | plugins/section-view | UNKNOWN | UNKNOWN | patch-pair → section | not-synced (reason declared) | classified B |
| `section.setScale` | plugins/section-view | UNKNOWN | UNKNOWN | patch-pair → section | not-synced (reason declared) | classified B |
| `selection.clear` | plugins/selection | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `selection.deselect` | plugins/selection | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `selection.select` | plugins/selection | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `sheet.addViewport` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `sheet.addWidget` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `sheet.create` | plugins/sheets | SHADOWED | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `sheet.delete` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `sheet.moveViewport` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `sheet.removeViewport` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `sheet.removeWidget` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `sheet.rename` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified F |
| `sheet.reorder` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `sheet.setSheetMetadata` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `sheet.setTitleBlock` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `sheet.setViewportScale` | plugins/sheets | UNKNOWN | UNKNOWN | patch-pair → sheet | not-synced (reason declared) | classified B |
| `slab.addHole` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | not-synced (reason declared) | classified B |
| `slab.batch.create` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | not-synced (reason declared) | classified C |
| `slab.changeLevel` | plugins/slab | LIVE | legacy slabStore (via element.level-changed mirror) | patch-pair → slab | not-synced (reason declared) | capability: move-to-level |
| `slab.create` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | synced via 'id' (disclose) | classified B |
| `slab.create-on-all-floors` | plugins/slab | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified E |
| `slab.delete` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | not-synced (reason declared) | classified D |
| `slab.move` | plugins/slab | REFUSES | NONE | patch-pair → slab | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `slab.movePolygon` | apps/editor | LIVE | slab | UNKNOWN (declares slab) | synced via 'slabId' (disclose) | classified B |
| `slab.removeHole` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | not-synced (reason declared) | classified B |
| `slab.setBaseOffset` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | synced via 'slabId' (disclose) | classified D |
| `slab.setMaterial` | plugins/slab | REFUSES | NONE | patch-pair → slab | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `slab.setThickness` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | synced via 'slabId' (disclose) | classified D |
| `slab.setType` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | synced via 'slabId' (disclose) | classified B |
| `slab.update` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | synced via 'id' (disclose) | classified D |
| `slab.updateDimensions` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'slabId' (disclose) | capability: set-thickness |
| `slab.updateLayers` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | synced via 'slabId' (disclose) | classified B |
| `slab.updatePolygon` | plugins/slab | UNKNOWN | UNKNOWN | patch-pair → slab | synced via 'slabId' (disclose) | classified B |
| `slab.updateSystemTypeBatch` | plugins/slab | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-slab-type |
| `stair.batch.create` | plugins/stair | UNKNOWN | UNKNOWN | patch-pair → stair | not-synced (reason declared) | classified C |
| `stair.create` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'id' (disclose) | classified B |
| `stair.createRailing` | plugins/stair | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `stair.delete` | plugins/stair | UNKNOWN | UNKNOWN | patch-pair → stair | not-synced (reason declared) | classified D |
| `stair.move` | plugins/stair | UNKNOWN | UNKNOWN | NONE (empty patch pair) | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `stair.rotate` | plugins/stair | REFUSES | NONE | patch-pair → stair | synced via 'stairId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `stair.setMaterial` | plugins/stair | REFUSES | NONE | patch-pair → stair | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `stair.setRiserHeight` | plugins/stair | UNKNOWN | UNKNOWN | patch-pair → stair | synced via 'stairId' (disclose) | classified D |
| `stair.setShape` | plugins/stair | UNKNOWN | UNKNOWN | patch-pair → stair | synced via 'stairId' (disclose) | classified B |
| `stair.setTreadCount` | plugins/stair | UNKNOWN | UNKNOWN | patch-pair → stair | synced via 'stairId' (disclose) | classified D |
| `stair.setType` | plugins/stair | UNKNOWN | UNKNOWN | patch-pair → stair | synced via 'stairId' (disclose) | classified B |
| `stair.setWidth` | plugins/stair | UNKNOWN | UNKNOWN | patch-pair → stair | synced via 'stairId' (disclose) | classified D |
| `stair.updateParameters` | plugins/stair | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'stairId' (disclose) | capability: set-width |
| `structural.create` | plugins/structural | UNKNOWN | UNKNOWN | patch-pair → structural | synced via 'id' (disclose) | classified B |
| `structural.delete` | plugins/structural | UNKNOWN | UNKNOWN | patch-pair → structural | not-synced (reason declared) | classified D |
| `structural.move` | plugins/structural | REFUSES | NONE | patch-pair → structural | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `structural.setBraceEndOffset` | plugins/structural | UNKNOWN | UNKNOWN | patch-pair → structural | synced via 'structuralId' (disclose) | classified B |
| `structural.setDimensions` | plugins/structural | UNKNOWN | UNKNOWN | patch-pair → structural | synced via 'structuralId' (disclose) | classified F |
| `structural.setKind` | plugins/structural | UNKNOWN | UNKNOWN | patch-pair → structural | synced via 'structuralId' (disclose) | classified B |
| `structural.setMaterial` | plugins/structural | REFUSES | NONE | patch-pair → structural | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `template.assignToNode` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `template.create` | plugins/rooms | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `template.unassign` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `vg.assignIntent` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `vg.createVisibilityIntent` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `vg.takeLatestIntentVersion` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `vg.updateVisibilityIntent` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `view.clearAllOverrides` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `view.clearOverride` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `view.create` | plugins/view | UNKNOWN | UNKNOWN | patch-pair → view | not-synced (reason declared) | classified B |
| `view.createDefinition` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `view.delete` | plugins/view | UNKNOWN | UNKNOWN | patch-pair → view | not-synced (reason declared) | classified B |
| `view.deleteDefinition` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `view.hideElement` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `view.isolateElement` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `view.rename` | plugins/view | UNKNOWN | UNKNOWN | patch-pair → view | not-synced (reason declared) | classified F |
| `view.setCategoryVisibility` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | UNDECLARED | UNDECLARED |
| `view.setCrop` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `view.setGraphicOverride` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `view.setOutput` | plugins/view | UNKNOWN | UNKNOWN | patch-pair → view | not-synced (reason declared) | classified B |
| `view.setProjection` | plugins/view | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified B |
| `view.setRange` | plugins/view | UNKNOWN | UNKNOWN | patch-pair → view | not-synced (reason declared) | classified B |
| `view.setUnderlay` | plugins/view | UNKNOWN | UNKNOWN | patch-pair → view | not-synced (reason declared) | classified B |
| `view.switch` | plugins/view | UNKNOWN | UNKNOWN | patch-pair → active-view | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `view.updateCamera` | plugins/view | UNKNOWN | UNKNOWN | patch-pair → view | not-synced (reason declared) | classified B |
| `view.updateDefinition` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `viewTemplate.create` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `viewTemplate.delete` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `viewTemplate.update` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `wall.addLayerBatch` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: add-wall-layer |
| `wall.batch.create` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | not-synced (reason declared) | classified C |
| `wall.bulkSetVisuals` | plugins/wall | REFUSES | NONE | patch-pair → wall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `wall.cascadeBaseline` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified C |
| `wall.changeLevel` | plugins/wall | LIVE | legacy wallStore (via element.level-changed mirror) | patch-pair → wall | not-synced (reason declared) | capability: move-to-level |
| `wall.create` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | synced via 'id' (disclose) | capability: create-wall |
| `wall.create-on-all-slabs` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | classified E |
| `wall.createBetweenMarks` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | synced via 'id' (disclose) | classified B |
| `wall.createFromSlab` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | not-synced (reason declared) | classified C |
| `wall.createOpening` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `wall.cut` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `wall.delete` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | not-synced (reason declared) | classified D |
| `wall.join` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `wall.move` | plugins/wall | REFUSES | NONE | UNKNOWN (declares wall) | synced via 'id' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `wall.opening.create` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `wall.setColor` | plugins/wall | REFUSES | NONE | patch-pair → wall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `wall.setDimensions` | plugins/wall | REFUSES | NONE | patch-pair → wall | not-synced (reason declared) | classified D |
| `wall.setLayers` | plugins/wall | REFUSES | NONE | patch-pair → wall | not-synced (reason declared) | classified B |
| `wall.setSideFinishBatch` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-wall-side-finish |
| `wall.setSystemType` | plugins/wall | UNKNOWN | UNKNOWN | patch-pair → wall | synced via 'id' (disclose) | classified D |
| `wall.split` | plugins/wall | UNKNOWN | UNKNOWN | UNKNOWN (declares wall) | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `wall.transform` | plugins/wall | REFUSES | NONE | patch-pair → wall | not-synced (reason declared) | deferred (CHAT_UNAVAILABLE) |
| `wall.updateBaseline` | plugins/wall | UNKNOWN | UNKNOWN | NONE (empty patch pair) | synced via 'wallId' (disclose) | classified B |
| `wall.updateColor` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'wallId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `wall.updateColorBatch` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-wall-color |
| `wall.updateCurtainWall` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'id' (disclose) | classified C |
| `wall.updateDimensions` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'wallId' (disclose) | capability: set-height |
| `wall.updateHeightBatch` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-wall-dimensions |
| `wall.updateRakeBatch` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-wall-rake |
| `wall.updateSystemType` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'wallId' (disclose) | classified D |
| `wall.updateSystemTypeBatch` | plugins/wall | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-wall-type |
| `window.batch.create` | plugins/window | UNKNOWN | UNKNOWN | patch-pair → window | not-synced (reason declared) | classified C |
| `window.create` | plugins/window | REFUSES | NONE | patch-pair → window | synced via 'id' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `window.delete` | plugins/window | UNKNOWN | UNKNOWN | patch-pair → window | not-synced (reason declared) | classified D |
| `window.move` | plugins/window | REFUSES | NONE | patch-pair → window | synced via 'windowId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `window.parametricCreate` | plugins/window | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: create-windows-parametric |
| `window.setFireRating` | plugins/window | UNKNOWN | UNKNOWN | patch-pair → window | synced via 'windowId' (disclose) | classified B |
| `window.setFrameColor` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'windowId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `window.setOffset` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'windowId' (disclose) | deferred (CHAT_UNAVAILABLE) |
| `window.setSillHeight` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'windowId' (disclose) | classified D |
| `window.setSize` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | synced via 'windowId' (disclose) | classified D |
| `window.setType` | plugins/window | UNKNOWN | UNKNOWN | patch-pair → window | synced via 'windowId' (disclose) | classified B |
| `window.updateSystemTypeBatch` | plugins/window | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: set-window-type |
| `zoom-fit` | apps/editor | LIVE | legacy geometry store (via commandManager) | NONE (empty patch pair) | not-synced (reason declared) | capability: zoom-fit |
| `zoom-selected` | apps/editor | LIVE | legacy geometry store (via commandManager) | legacy-stack (no affectedStores) | not-synced (reason declared) | capability: zoom-selected |

## Declaring sites

Verbs with more than one declaring file are SHADOWED — listed here in full because
the second site is the one nobody knew was dead.

| verb | sites |
|---|---|
| `sheet.create` | `plugins/sheets/src/handlers/CreateSheet.ts` · `apps/editor/src/engine/initBusHandlers.ts` |
