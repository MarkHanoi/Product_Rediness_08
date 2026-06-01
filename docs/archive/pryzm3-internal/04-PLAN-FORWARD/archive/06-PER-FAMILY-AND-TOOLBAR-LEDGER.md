# 06 — Per-Family and Toolbar Ledger

> **Position**: After `05-UI-INVENTORY-AND-CLICK-TRAILS.md`. Distilled from `reference/wireup-2026/chunks/15-subphases-E-families.md`, `chunks/16-subphases-F1-toolbars.md`, `chunks/17-subphases-F2-F5.md`, and `chunks/18-subphases-F6-F12.md`.
>
> **Why this is plan-forward, not reference**: this file is the **landing schedule** for Phase E (12 family plugins migrated from `src/elements/`) and Phase F (12 toolbar / inspector / panel sub-phases that wire each family's UI into `runtime.<family>.*`). Every row below is a sub-phase ID with an owner, a sprint window, and an exit verifier. Reference chunks describe the *plan*; this file is the *table you execute against*.
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).

---

## §1 — Phase E ledger (family plugin migrations)

Phase E migrates the 12 family directories under `src/elements/` to `plugins/<family>/`, plus 4 supplemental migrations (E.6.0, E.15, E.16, E.17) added by `chunks/24-pryzm1-src-coverage-audit.md §24.2`.

| Sub-phase | Family / scope | `src/` source | `plugins/` target | Sprint | Exit verifier |
|---|---|---|---|---|---|
| **E.1** | Wall | `src/elements/walls/` | `plugins/wall/` | S78-WIRE | wall-create + wall-split + wall-merge round-trip vitest green |
| **E.2** | Door | `src/elements/doors/` | `plugins/door/` | S78-WIRE | door-create + swap-handed vitest green |
| **E.3** | Window | `src/elements/windows/` | `plugins/window/` | S78-WIRE | window-create + sizes round-trip vitest green |
| **E.4** | Beam | `src/elements/beams/` | `plugins/beam/` | S79-WIRE | beam-profile + split round-trip green |
| **E.5** | Column | `src/elements/columns/` | `plugins/column/` | S79-WIRE | column-create + profile-set green |
| **E.6** | Slab | `src/elements/slabs/` | `plugins/slab/` | S79-WIRE | slab-cut-hole + layer-set green |
| **E.6.0** | **Floor scaffold** (`plugins/floor/` does not exist on disk yet) | `src/elements/floors/` | `plugins/floor/` (new) | S76-WIRE | plugin loads in PluginRegistry; vitest skeleton green |
| **E.7** | Floor | `src/elements/floors/` | `plugins/floor/` | S79-WIRE | floor-create + setLevel green |
| **E.8** | Roof | `src/elements/roofs/` | `plugins/roof/` | S79-WIRE | roof-pitch round-trip green |
| **E.9** | Curtain wall | `src/elements/curtainWalls/` | `plugins/curtain-wall/` | S80-WIRE | mullion-grid set+query green |
| **E.10** | Stair | `src/elements/stairs/` | `plugins/stair/` | S80-WIRE | run-rise green |
| **E.11** | Rooms | `src/elements/rooms/` | `plugins/rooms/` | S80-WIRE | room-create + tag-auto green |
| **E.12** | Furniture | `src/elements/furniture/` | `plugins/furniture/` (already exists) | S80-WIRE | furniture-create + drag-drop green |
| **E.13** | Reserved (cross-family aggregator — covered by `plugins/structural`, G.24) | — | — | — | n/a |
| **E.14** | Reserved (multi-family openings — see E.15) | — | — | — | n/a |
| **E.15** | Generic openings absorption | `src/elements/openings/` | `plugins/door` + `plugins/window` + `plugins/curtain-wall` | S78-WIRE | three-way absorption verifier; deletion gate for `src/elements/openings/` |
| **E.16** | Inspector preview helpers split | `src/elements/preview/` | `plugins/<family>/inspector/preview-helpers.ts` (12 splits) | S78-WIRE | each family's inspector preview renders the same pixel as before split |
| **E.17** | Rooms supplements absorption | `src/elements/roomBoundingLines/` | `plugins/rooms/` | S80-WIRE | room-bounding-lines round-trip green |

**Phase E exit gate**: `find src/elements -type d -mindepth 1 -maxdepth 1 | wc -l` drops from 24 to ≤ 4 (only generic shared types remain — deleted by G.4 in Phase G).

---

## §2 — Phase F.1 ledger (left-rail tool buttons)

Phase F.1 wires each family's left-rail tool button to `runtime.tools.activate('<family>')`. Source: `chunks/16-subphases-F1-toolbars.md`.

| Sub-phase | Tool | UI surface | `runtime.*` call | Sprint | Exit verifier |
|---|---|---|---|---|---|
| **F.1.1** | Wall | `LeftRail.WallButton` | `runtime.tools.activate('wall')` | S81-WIRE | CT-04 click-trail green; tool gizmo subscribes to `runtime.input.pointer` |
| **F.1.2** | Door | `LeftRail.DoorButton` | `runtime.tools.activate('door')` | S81-WIRE | door-place click-trail green |
| **F.1.3** | Window | `LeftRail.WindowButton` | `runtime.tools.activate('window')` | S81-WIRE | window-place click-trail green |
| **F.1.4** | Beam | `LeftRail.BeamButton` | `runtime.tools.activate('beam')` | S81-WIRE | beam-place click-trail green |
| **F.1.5** | Column | `LeftRail.ColumnButton` | `runtime.tools.activate('column')` | S81-WIRE | column-place green |
| **F.1.6** | Slab | `LeftRail.SlabButton` | `runtime.tools.activate('slab')` | S81-WIRE | slab-place green |
| **F.1.7** | Floor | `LeftRail.FloorButton` | `runtime.tools.activate('floor')` | S81-WIRE | floor-place green |
| **F.1.8** | Roof | `LeftRail.RoofButton` | `runtime.tools.activate('roof')` | S81-WIRE | roof-place green |
| **F.1.9** | Curtain wall | `LeftRail.CurtainWallButton` | `runtime.tools.activate('curtain-wall')` | S82-WIRE | curtain-wall-place green |
| **F.1.10** | Stair | `LeftRail.StairButton` | `runtime.tools.activate('stair')` | S82-WIRE | stair-place green |
| **F.1.11** | Room | `LeftRail.RoomButton` | `runtime.tools.activate('room')` | S82-WIRE | room-place green |
| **F.1.12** | Furniture | `LeftRail.FurnitureButton` | `runtime.tools.activate('furniture')` (drag-drop variant) | S82-WIRE | CT-11 click-trail green |

**F.1 exit gate**: every entry in `LeftRail/` resolves a `runtime.tools.activate(...)` call; cast-count in `LeftRail/` = 0.

---

## §3 — Phase F.2 ledger (right-rail inspectors)

Phase F.2 wires each family's inspector panel to `runtime.bus.executeCommand({ type:'<family>.set-*', ... })` and to `runtime.stores.elements.subscribe`. Source: `chunks/17-subphases-F2-F5.md`.

| Sub-phase | Inspector | UI surface | Bus calls | Sprint |
|---|---|---|---|---|
| **F.2.1** | Wall | `WallInspector` + `WallLayerSection` | `wall.set-name`, `wall.set-height`, `wall.add-layer`, `wall.remove-layer`, `wall.set-base-level`, `wall.set-top-level`, `wall.set-justification` | S82-WIRE |
| **F.2.2** | Door | `DoorInspector` | `door.swap`, `door.set-swing-hand`, `door.set-frame-style` | S82-WIRE |
| **F.2.3** | Window | `WindowInspector` | `window.swap-type`, `window.set-sizes`, `window.set-sill-height` | S82-WIRE |
| **F.2.4** | Beam | `BeamInspector` | `beam.set-profile`, `beam.set-material`, `beam.split-at` | S82-WIRE |
| **F.2.5** | Column | `ColumnInspector` | `column.set-profile`, `column.set-material` | S82-WIRE |
| **F.2.6** | Slab | `SlabInspector` | `slab.cut-hole`, `slab.set-layers`, `slab.set-thickness` | S82-WIRE |
| **F.2.7** | Floor | `FloorInspector` | `floor.set-level`, `floor.set-edge-offset` | S82-WIRE |
| **F.2.8** | Roof | `RoofInspector` | `roof.set-pitch`, `roof.set-overhang` | S82-WIRE |
| **F.2.9** | Curtain wall | `CurtainWallInspector` | `curtain-wall.set-mullion-grid`, `curtain-wall.set-panel-types` | S82-WIRE |
| **F.2.10** | Stair | `StairInspector` | `stair.set-run-rise`, `stair.set-railing` | S82-WIRE |
| **F.2.11** | Room | `RoomPropertySection` (1,142 LOC — Wave-8 decomposition target) | `room.set-name`, `room.set-occupancy`, `room.tag-auto` | S82-WIRE |
| **F.2.12** | Furniture | `FurnitureInspector` | `furniture.swap`, `furniture.set-transform` | S82-WIRE |

**F.2 exit gate**: every inspector-section file invokes `runtime.bus.executeCommand` (zero `commandManager.execute` reaches in `src/ui/property-inspector/`); CT-06 click-trail green for all 12 families.

---

## §4 — Phase F.3 — Browsers (Project / Sheets / Views / Family / Catalog)

Source: `chunks/17-subphases-F2-F5.md`. Wires the 5 browser surfaces from Category H to `runtime.persistence.client` + `runtime.stores.elements.byKind`.

| Sub-phase | Browser | Sprint | Exit verifier |
|---|---|---|---|
| **F.3.1** | ProjectBrowser | S83-WIRE | `runtime.persistence.client.listProjects` + open-project click-trail green |
| **F.3.2** | SheetsBrowser | S83-WIRE | `runtime.bus.executeCommand({ type:'sheet.*' })` for create/rename/delete |
| **F.3.3** | ViewBrowser (incl. `panels/SheetsRailPanel.ts`) | S83-WIRE | view-create + view-switch round-trip |
| **F.3.4** | FamilyBrowser | S83-WIRE | family-load + family-instance round-trip (uses `@pryzm/file-format` via runtime) |
| **F.3.5** | CatalogBrowser | S83-WIRE | catalog-search + drag-into-scene round-trip |

---

## §5 — Phase F.4 — Bottom bar + status surfaces

Source: `chunks/17 §17.4`. Wires Category F (9 files) to `runtime.stores.viewState` + `runtime.scene.snap` + `runtime.scene.renderer`.

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.4.1** | LayerSwitcher | `runtime.stores.viewState.activeLayer$` | S83-WIRE |
| **F.4.2** | LevelSelector | `runtime.stores.viewState.activeLevel$` (CT-12) | S83-WIRE |
| **F.4.3** | SnapModeIndicator | `runtime.scene.snap.mode$` | S83-WIRE |
| **F.4.4** | UnitDisplay | `runtime.stores.project.units$` | S83-WIRE |
| **F.4.5** | ZoomControl | `runtime.stores.viewState.zoom$` + `runtime.scene.renderer.frame()` on change | S83-WIRE |

---

## §6 — Phase F.5 — Center canvas + overlays

Source: `chunks/17 §17.5`. Wires Category G (16 files) to `runtime.scene.*` + `runtime.input`.

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.5.1** | SceneCanvas mount | `runtime.scene.mount($el)` | S83-WIRE |
| **F.5.2** | OrbitController | `runtime.input.pointer` + `runtime.stores.viewState.setCamera` (CT-07) | S83-WIRE |
| **F.5.3** | SelectionRect | `runtime.scene.selection.set([])` for marquee | S83-WIRE |
| **F.5.4** | ContextMenuOverlay | `runtime.shortcuts.dispatch(<contextual cmd>)` | S83-WIRE |
| **F.5.5** | MeasurementOverlay | `runtime.scene.snap` + ad-hoc inspector | S83-WIRE |
| **F.5.6** | SnapIndicatorOverlay | `runtime.scene.snap.candidate$` | S83-WIRE |
| **F.5.7** | DebugOverlay | `runtime.debug.metrics$` | S83-WIRE |

---

## §7 — Phase F.6 — Top bar + global chrome + auth

Source: `chunks/18-subphases-F6-F12.md §18.1`. Wires Categories B + C (22 files).

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.6.1** | AuthModal | `runtime.auth.signIn`, `runtime.auth.signUp` (Flow 2) | S84-WIRE |
| **F.6.2** | ProjectHub + OnboardingFlow | `runtime.persistence.client.{listProjects, createProject, openProject}` (Flows 1, 2, 3; CT-01, CT-02) | S84-WIRE |
| **F.6.3** | Global shortcuts router | `runtime.shortcuts.dispatch` (CT-03, CT-09) | S84-WIRE |
| **F.6.4** | Toast layer | `runtime.toast.{success, error, info}` | S84-WIRE |
| **F.6.5** | TopBar (BreadcrumbNav, ProjectTitleEditor, UserAvatarMenu, NotificationBell, SearchPalette) | `runtime.persistence.client.project$`, `runtime.search.run(query)` | S84-WIRE |

---

## §8 — Phase F.7 — Generative + AI panels

Source: `chunks/18 §18.2`. Wires Category I (22 files).

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.7.1** | AIPanel mount | `runtime.ai.dispatch`, `runtime.ai.usage`, `runtime.entitlements` | S85-WIRE |
| **F.7.2** | AICreatePanel | `runtime.ai.dispatch({ tool:'generative.layout', ... })` | S85-WIRE |
| **F.7.3** | BriefInputPanel | `runtime.ai.dispatch` (CT-10) | S85-WIRE |
| **F.7.4** | VariantBrowserPanel | `runtime.ai.dispatch` (stream subscription) + commit-variant via `runtime.bus` | S85-WIRE |
| **F.7.5** | AI cost-pill | `runtime.ai.usage.tracker$` | S85-WIRE |
| **F.7.6** | RoomAIAssistant | `runtime.ai.dispatch` (with AI-specific guardrails per `chunks/28`) | S85-WIRE |
| **F.7.07** | Generative absorption (covers `src/generative/` deletion in G.13) | wired through F.7.1–F.7.6 | S85-WIRE |

---

## §9 — Phase F.8 — Visibility

Source: `chunks/18 §18.3`. Single sub-phase, but high-leverage: wires the visibility-graph UI to the `visibility` package.

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.8.1** | VisibilityGraphPanel + Browser eye-icons + Hide/Isolate context menu | `runtime.bus.executeCommand({ type:'visibility.set-rule', ... })` (CT-08); `runtime.scene.visibility.subscribe` for read | S85-WIRE |

**F.8 exit gate**: `pryzm-vi-parity` workflow green; CT-08 click-trail green; cast-count in `src/ui/visibility/` = 0.

---

## §10 — Phase F.9 — Multiplayer surfaces

Source: `chunks/18 §18.4`. Wires Category K (11 files).

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.9.1** | PresenceCursorLayer | `runtime.sync.awareness.cursors$` | S85-WIRE |
| **F.9.2** | AwarenessSelectionLayer | `runtime.sync.awareness.selections$` | S85-WIRE |
| **F.9.3** | CommentThreadPanel | `runtime.sync.client.threads$` + comment.* commands (CT-13) | S85-WIRE |
| **F.9.4** | SyncStatusIndicator | `runtime.sync.client.status$` | S85-WIRE |

---

## §11 — Phase F.10 — Render + Export + Import

Source: `chunks/18 §18.5–18.7`. Wires Category J + ImportManager + ExportPanel + GeospatialPanel.

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.10.1** | RenderPanel + RealSunControl + RenderGalleryPanel | `runtime.scene.renderer.presets`, `runtime.scene.renderer.queue` | S86-WIRE |
| **F.10.2** | ExportPanel | `runtime.export.{ifc, glb, pdf, csv, rationale}` (CT-14) | S86-WIRE |
| **F.10.3** | ImportManager | `runtime.{ifc, dxf, rhino}.import` | S86-WIRE |

---

## §12 — Phase F.11 — Settings + admin + CDE

Source: `chunks/18 §18.8–18.10`. Wires Category L (23 files).

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.11.1** | OwnerSettingsPanel + BillingPanel + EntitlementsPanel | `runtime.entitlements`, `runtime.ai.usage`, `runtime.persistence.client.members` | S86-WIRE |
| **F.11.2** | IntegrationsPanel + MembersPanel | `runtime.persistence.client.{integrations, members}` | S86-WIRE |
| **F.11.3** | SheetEditor + ProjectBrowser CDE strip | `runtime.cde.structuredName` | S86-WIRE |
| **F.11.4** | GeospatialPanel | `runtime.geospatial` | S86-WIRE |
| **F.11.5** | BCFPanel | `runtime.bcf.*` | S86-WIRE |

---

## §13 — Phase F.12 — Cross-cutting tail (the residue)

Source: `chunks/18 §18.11–18.12`. Catches the remaining UI surfaces not covered by F.1–F.11 (mostly small dialogs, modals, and dev-only debug panels).

| Sub-phase | Surface | `runtime.*` | Sprint |
|---|---|---|---|
| **F.12.1** | Modal dialogs (confirm-delete, name-input, choose-template, etc.) | `runtime.bus.executeCommand` per modal action | S87-WIRE |
| **F.12.2** | Dev-only PhysicsOverlayRenderer (dev-only per ADR-042) | `runtime.physics` (dev build only) | S87-WIRE (dev build) |
| **F.12.3** | Cross-family aggregator surfaces (structural load-path overlay) | `runtime.structural.loadPath$` (from `plugins/structural`) | S87-WIRE |

---

## §14 — Wave-rollup gates

Phase E (S78–S80-WIRE) closes when:
- Every E.* row above ships its plugin and the corresponding `src/elements/<dir>/` is empty (deleted by G.* in Phase G).
- `find src/elements -type d -mindepth 1 -maxdepth 1 | wc -l` ≤ 4.

Phase F (S81–S87-WIRE) closes when:
- Every F.* row's exit verifier is green.
- Every click-trail in `05-UI-INVENTORY-AND-CLICK-TRAILS.md §3` is green (CT-01 … CT-14).
- `(window as any)` reaches in `src/ui/` = 0 (the cast-count tripwire).
- `commandManager.execute(` reaches in `src/ui/` = 0 (the Wave 16 codemod has run for the UI subset; full deletion of the `commandManager` shim awaits Wave 16 close per `15-PACKAGE-POPULATION-GAP.md §16`).
- `runtime` matrix in `04-END-TO-END-FLOWS-AND-COVERAGE.md §2` is 100% green.
