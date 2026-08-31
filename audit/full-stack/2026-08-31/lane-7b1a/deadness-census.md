# LANE 7B1a — deadness re-proof at HEAD 4318c2f0e8a171f19882590a7417b81b3c99fcda (2026-08-31)

## Census commands (all scoped to plugins packages apps src, node_modules excluded)
1. Class names:   grep -rn --include="*.ts" --include="*.tsx" -E "\b(<16 class names>)\b" plugins packages apps src
2. Module paths:  grep -rn -E "from ['\"][^'\"]*/tool(\.js)?['\"]" plugins packages apps src
3. TOOL_IDs:      grep -rn -E "\b(<14 *_TOOL_ID consts>)\b" plugins packages apps src
4. Exported types: grep -rn -E "\b(<44 type names>)\b" plugins packages apps src
5. Dynamic imports: grep -rn -E "import\(['\"][^'\"]*tool" — 0 hits on our modules
6. Root sweep:    same class-name grep over tests tools scripts server — 0 hits
7. plugin-sdk:    export * only from @pryzm/schemas subpaths; zero mentions of the 16 plugin pkgs

## Verdict per tool — ALL 16 DEAD (references found: own barrel row + own-package tests + comments only)
| tool | file | barrel row | own tests | external refs |
|---|---|---|---|---|
| BeamPlacementTool | plugins/beam/src/tool.ts | index.ts export block | none | none |
| CeilingPlacementTool | plugins/ceiling/src/tool.ts | index.ts export block | none | none |
| ColumnPlacementTool | plugins/column/src/tool.ts | index.ts export block | none | none |
| CurtainWallPlacementTool | plugins/curtain-wall/src/tool.ts | index.ts export block | none | none |
| DimensionTool | plugins/dimensions/src/tool.ts | NO barrel row (fully orphaned) | none | comments only (PluginRegistry.ts:63-64,1121,1147 — comments state it was never imported/armed) |
| DoorPlacementTool | plugins/door/src/tool.ts | index.ts export block | __tests__/tool.test.ts (dead-only) | none |
| FurniturePlacementTool | plugins/furniture/src/tool.ts | index.ts export block | none | comments + a warn STRING in PluginRegistry.ts:1164; the code path uses window.furnitureTool = L2 FurnitureTool |
| HandrailPlacementTool | plugins/handrail/src/tool.ts | index.ts export block | none | none |
| PlumbingPlacementTool | plugins/plumbing/src/tool.ts | index.ts export block | none | none |
| RoofPlacementTool | plugins/roof/src/tool.ts | index.ts export block | __tests__/tool.test.ts (dead-only) | none |
| RoomSeedTool | plugins/rooms/src/tool.ts | index.ts export block | none | comment only (PluginRegistry.ts:1272) |
| SectionTool | plugins/section-view/src/tool.ts | NO barrel row (fully orphaned) | none | comments only (ISectionViewService.ts:51, ViewController.ts:501, SectionViewService.ts:25,47,134, PluginRegistry.ts:1297-1298) |
| SlabPlacementTool | plugins/slab/src/tool.ts | index.ts export block | none | none |
| StairPlacementTool | plugins/stair/src/tool.ts | index.ts export block | none | none |
| WallCreationTool | plugins/wall/src/tool.ts | index.ts export block | tool.test.ts, tool-arc.spec.ts, tool-polyline.spec.ts (dead-only) | comments only (ToolRegistry.ts:7,28,34; door/src/tool.ts:8 — itself deleted) |
| WindowPlacementTool | plugins/window/src/tool.ts | index.ts export block | __tests__/tool.test.ts (dead-only) | none |

Notes:
- Every tool.ts also exports a *_TOOL_ID const + Deps/ScreenToWorld/Point3D types. Census 3+4: ZERO
  references outside the owning tool.ts, its barrel row, and its own-package tests. The
  WallToolState hits in packages/geometry-wall/src/WallTool.ts are a DIFFERENT symbol (enum from
  ./WallTypes, L2). The PreviewLine hits in apps/component-editor are a local type (./types).
- 15 plugin package.jsons declare an unused "./tool" exports subpath (section-view has none). No
  importer anywhere uses @pryzm/plugin-<these-16>/tool (census 2: only annotations, bcf, cross,
  grid, lighting, structural, toy-cube /tool subpaths are imported — none of the 16). Rows removed
  with the files so the exports maps don't dangle.

## 17th: packages/geometry-wall/src/OpeningTool.ts — DEAD, but NO LONGER a byte-duplicate
- cmp vs packages/input-host/src/OpeningTool.ts: differ at line 30 (Wave A added a §OBC-SEAM
  comment to the geometry-wall copy; input-host's copy separately has SAFER null-guards:
  `renderer?.three?.domElement` + `if (!canvas) return null` where the dead copy uses `three!`).
  The Wave A scout's "byte-duplicate" claim is stale; the DEADNESS claim holds:
- Zero importers (grep census: only input-host/src/ToolManager.ts:10 imports './OpeningTool.js' —
  the input-host copy; initTools.ts:141 imports OpeningTool from '@pryzm/input-host').
- Not in packages/geometry-wall/src/index.ts barrel; no exports-map subpath; no tests reference it.
- WallMoveReweldService.ts:322 mention is a doc comment.

## Live capability path per family (initTools.ts, apps/editor/src/engine/initTools.ts) — RIVALS deleted, not capability
- wall → WallTool (@pryzm/geometry-wall) constructed :879
- slab → SlabTool (@pryzm/geometry-slab) :590
- ceiling → CeilingTool (@pryzm/geometry-slab) :607
- plumbing → PlumbingTool (@pryzm/geometry-plumbing) :685
- furniture → FurnitureTool (@pryzm/geometry-furniture) :689 (PluginRegistry 'furniture' registration drives window.furnitureTool = this instance)
- roof → RoofTool :739
- handrail → HandrailTool (@pryzm/geometry-handrail) :752
- window → WindowTool (@pryzm/geometry-window) :1109
- door → DoorTool (@pryzm/geometry-door) :1110
- curtain-wall → CurtainWallTool (@pryzm/geometry-curtain-wall) :1119
- column → ColumnTool (@pryzm/geometry-column) :1125
- beam → BeamTool (@pryzm/input-host) :3509
- stair → StairTool (@pryzm/geometry-stair) :3510
- rooms → RoomTool (@pryzm/room-topology) :3456
- opening → OpeningTool (@pryzm/input-host) :3685
- dimensions → live path is AnnotationRail/toolManager.activateLinearDimAnnotation() → CreateAnnotationCommand('linear-dim') → annotationStore (PluginRegistry.ts:1140-1152 documents this and why arming plugins/dimensions' DimensionTool would be a RIVAL writing a store nothing reads)
- section-view → ViewController → SectionViewService path (SectionViewService.ts:25,47 — SectionTool named there only as the hypothetical bypass path; never constructed)

## Execution record (2026-08-31, working tree only — NOT committed, orchestrator owns commits)
- Deleted 17 files: 16 plugins/*/src/tool.ts + packages/geometry-wall/src/OpeningTool.ts.
- Deleted 6 dead-only test files (door/roof/window tool.test.ts; wall tool.test.ts,
  tool-arc.spec.ts, tool-polyline.spec.ts) per CA-21.
- Removed 14 barrel export-from-'./tool.js' blocks (dimensions + section-view had none).
- Removed 15 unused "./tool" exports-map rows from plugin package.jsons (section-view had none).
  No dependency changes — lockfile untouched.
- Cleaned 2 orphaned comment seams (plugins/wall/src/index.ts "S09 — Tool surface" line;
  plugins/door/src/index.ts header 'tool,' mention).
- Root tsc after deletions: NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
  → RC=0 (tsc-after-delete.txt: only the npm "package-manager-strict" config warning, zero errors).
- FALSIFICATION CONTROL: BeamPlacementTool census = 0 hits deleted → `git checkout --
  plugins/beam/src/tool.ts` → census = 4 hits (tool.ts:1,26,35,36) → rm → 0 hits → root tsc
  re-run RC=0 (tsc-final.txt). The census instrument detects presence; the 0 readings are live.
- Refused deletions: NONE — all 17 proved dead at HEAD 4318c2f0.
- No ceiling raised, no gate touched, no gate-debt entry, no rival built.
