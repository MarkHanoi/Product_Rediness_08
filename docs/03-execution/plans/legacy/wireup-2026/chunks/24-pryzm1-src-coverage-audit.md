# §24  Pryzm 1 `src/` coverage audit — every legacy folder accounted for

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). New deliverable — not in the source monolith.
>
> **Scope of this audit**: walk every top-level folder under `src/` (Pryzm 1, the live monolith), determine what new-architecture artefact replaces it, and assert that the wireup plan ([§4](./03-phases-overview.md), [§5 deletions](./04-deletions.md), [§16 sub-phases](./14-subphases-A-D.md)) actually closes the gap so `src/ui/` can lift its imports off the legacy directories.
>
> **Why this matters**: §5 of the original plan lists ~150K LOC of deletions, but `src/ui/` files import from **23 distinct legacy folders** today — and the §5 list only addresses 6 of them (`engine`, `elements`, `commands`, `core`, `ai`, `services`). The other 17 folders are unaddressed. Until they are, Phase G ("delete legacy") cannot land cleanly because UI compile errors will block PRs.

> **Status updates since this chunk was authored** (per [Chunk 26 §26.11](./26-plan-self-corrections.md#§2611--amendment-k--chunks-24--25-status-updates-from-on-disk-reality)):
> 1. **ADR-041, 042, 043** — were proposed by §24.4 and listed as pending; **all three are now ratified on disk**. The §24.4 "default if no ADR" rows can be dropped — the ratified decisions stand.
> 2. **Top-level `src/` count**: §24.0 says "36 folders"; the §24.1 Tier A+B+C+D table sums to **35** (correct). Disk today is **35**. The "36" is a doc-only typo.
> 3. **Tier D `ui/` row** says 221 files; live count is **220** (one file removed since chunk authoring). Will be made parametric per [Chunk 26 §26.3](./26-plan-self-corrections.md#§263--amendment-c--hard-coded-numbers-go-parametric).
> 4. **G-prefix additions in §24.5** are now folded into [chunk 19's banner](./19-subphases-G-H-catchall.md) per [Chunk 26 §26.4](./26-plan-self-corrections.md#§264--amendment-d--32-new-sub-phases-are-orphaned-from-their-phase-chunks) (Option (b)).
> 5. **G.33** added (delete `src/persistence/` after C.14 lands) — see [Chunk 26 §26.8](./26-plan-self-corrections.md#§268--amendment-h--missing-deletion-ids-and-unspecified-checklists).

---

## §24.0  Method

For each top-level directory under `src/`, this audit records:
- **Files** — `.ts/.tsx` count.
- **UI imports** — number of times files in `src/ui/` import from this directory (data from §23.11 pre-flight scan).
- **New-architecture target** — which package/plugin/app absorbs it.
- **Status** — one of:
  - **`covered-S72`** — already in the §5 deletion list and §16 sub-phase queue.
  - **`covered-implicit`** — covered transitively by another row (e.g. `src/elements/walls/` is covered by `src/elements/` row).
  - **`stays`** — keep as-is (utility, types, CSS, dev-only).
  - **`GAP`** — **not addressed by the plan as written; this audit adds a sub-phase ID to close it**.
- **Sub-phase** — existing or new ID that lands the wireup + deletion.

Run the live count yourself any time:

```bash
rg "from ['\"]\.\." src/ui/ -g '*.ts' --no-line-number 2>/dev/null \
  | grep -oE "from ['\"][^'\"]+['\"]" \
  | sed -E "s|from ['\"]||; s|['\"]||" \
  | grep -E "^\.\." \
  | sed -E 's|^(\.\./)+||' \
  | awk -F/ '{print $1}' | sort | uniq -c | sort -rn
```

Snapshot at S72 D0 — UI imports per legacy directory (top 25):

| Rank | Legacy dir | UI import refs |
|---|---|---|
| 1 | `core` | 139 |
| 2 | `commands` | 122 |
| 3 | `elements` | 76 |
| 4 | `tools` | 21 |
| 5 | `ai` | 18 |
| 6 | `monetization` | 9 |
| 7 | `import` | 8 |
| 8 | `generative` | 5 |
| 9 | `rendering` | 4 |
| 10 | `cde` | 4 |
| 11 | `export` | 3 |
| 12 | `api` | 10 |
| 13 | `services` | 2 |
| 14 | `portfolio` | 2 |
| 15 | `physics` | 2 |
| 16 | `geospatial` | 1 |
| — | `utils`, `types`, `styles` | (kept as-is) |

(The remainder are intra-`src/ui/` paths: `PanelManager`, `icons`, `RailPanelController`, etc.)

---

## §24.1  Per-folder coverage table

### Tier A — Already covered by the plan (6 folders, ~94% of LOC)

| `src/<dir>` | Files | UI refs | New target | Sub-phase | Status |
|---|---:|---:|---|---|---|
| `engine/` | 13 | (indirect) | `composeRuntime()` + `runtime.scene` | A.1, D.* | covered-S72 |
| `elements/` | 300 | 76 | `plugins/<family>/` (12+ plugins) | E.1–E.14 | covered-S72 (mostly — see §24.2 sub-folders gap) |
| `commands/` | 265 | 122 | `plugins/<family>/handlers` + `packages/command-bus` | E.*, B.* | covered-S72 |
| `core/` | 228 (~76K LOC) | 139 | `packages/<peer>/` (geometry-kernel, stores, schemas, view-state, persistence-client, render-runtime, …) | A.1, B.*, C.*, D.*, E.* | covered-S72 |
| `ai/` | 37 | 18 | `runtime.ai` (`packages/ai-host` + `apps/ai-worker`) + 5 AI plugins | F.7.* | covered-S72 |
| `services/` | 8 | 2 | per-package equivalents on `runtime` | B.* | covered-S72 |

Together these account for ~150,000 LOC — the figure §5 cites. **But they are 6 of 23 UI-imported legacy directories.** The remaining 17 are below.

### Tier B — UI-cited but **GAP** in the §5 deletion list (12 folders)

These directories are imported by `src/ui/` files today but no §5 row deletes them and no §16 sub-phase wires them. **This audit adds new sub-phase IDs** (`B.6`, `G.10–G.20`) to close each one.

| `src/<dir>` | Files | UI refs | New target | **NEW sub-phase** | Notes |
|---|---:|---:|---|---|---|
| `tools/` | 31 | 21 | `runtime.tools` (orchestrator on `composeRuntime()`) + `packages/drawing-primitives` (already exists) | **B.6** (widen) + **G.10** (delete) | Legacy `ToolManager`/`ToolRegistry`/`SelectionManager` overlap with `packages/drawing-primitives` and `plugins/selection`. Per-family `*Tool.ts` (BeamTool etc) overlap with `plugins/beam/tool.ts`. Phase B.6 widens `runtime.tools` typed handle; F.1.* contributions consume it; G.10 deletes legacy. |
| `monetization/` | 3 | 9 | `runtime.entitlements` proxy to `packages/ai-spend` + `packages/api-rbac` | **B.7** + **G.11** | `AIUsageTracker`, `EntitlementStore`, `PlanConfig`. UI surfaces (OwnerSettingsPanel, AIPanel cost pill, paywall HUDs) currently import these directly. Wireup: expose as `runtime.entitlements.{tracker, store, plan}` in B.7; rewrite the 9 import sites; delete in G.11. |
| `import/` | 34 | 8 | `runtime.{ifc,dxf,rhino}.import` proxies to plugins | **B.8** + **G.12** | `src/import/dxf/`, `src/import/ifc/`, `src/import/rhino/` are the legacy parsers. `plugins/ifc-import`, `plugins/rhino-import` shipped; DXF lives across `plugins/annotations` + `packages/pdf-to-bim`. Wireup: import-manager UI panel binds to `runtime.ifc.import`/`runtime.dxf.import`/`runtime.rhino.import` (B.8); delete legacy parsers in G.12. |
| `generative/` | 2 | 5 | `runtime.ai.generative` proxy to `plugins/ai-generative` | **G.13** | `LayoutGenerator.ts` + `types/`. UI imports via AICreatePanel + BriefInputPanel + VariantBrowserPanel. Already covered by F.7.07 sub-phase wireup; just needs explicit §5 deletion row. |
| `rendering/` | 10 | 4 | `runtime.scene.renderer` (`packages/renderer`) + `plugins/lighting` | **B.9** + **G.14** | Includes RealSun, render presets, render queue. Mostly absorbed by `packages/renderer` and `packages/render-runtime`. UI consumers: RenderPanel, RealSunControl, RenderGalleryPanel. Wireup: expose preset registry via `runtime.scene.renderer.presets` (B.9); delete in G.14. |
| `cde/` | 1 | 4 | `runtime.cde.structuredName` proxy to `packages/api-spec` | **G.15** | Single file `StructuredName.ts` (BS 1192 / ISO 19650 naming codec). UI refs via SheetEditor + ProjectBrowser. Move into `packages/api-spec` (or `packages/file-format`) under SPEC-32 (CDE module); delete in G.15. |
| `export/` | 35 | 3 | per-format plugin (`plugins/ifc-export` + GLB/PDF/CSV exporters in `apps/bake-worker` worker) | **B.10** + **G.16** | Subdirs: `glb/`, `ifc/`, `sheets/`, `RationaleExporter.ts`. `plugins/ifc-export` covers IFC. GLB/sheets/rationale need new homes (probably `packages/file-format` + `apps/bake-worker`). Wireup: `runtime.export.{ifc,glb,pdf,csv,rationale}` (B.10); delete in G.16. |
| `portfolio/` | 1 | 2 | (decision needed) — likely move to `packages/stores` as a portfolio aggregate, or to `apps/marketplace-api` | **G.17** | Single file `PortfolioSemanticGraph.ts`. Multi-project semantic graph. Used by ProjectHub portfolio overview. Decision recorded in §24.4 below. |
| `physics/` | 2 | 2 | `runtime.physics` (no current package — see §24.4 ADR pending) | **G.18** | `PhysicsEngine.ts` + `types/`. Used by `src/render/PhysicsOverlayRenderer.ts` and a debug overlay. Vision §08-VISION D7 ("headless") explicitly excludes runtime physics; this is dev-only debug. Either keep in `src/dev/` or ship as a separate dev-only `packages/physics-overlay` (out-of-bundle in production). |
| `geospatial/` | 1 | 1 | `runtime.geospatial` proxy to a future `packages/geospatial` (Cesium bridge) | **G.19** | Single file `CesiumThreeBridge.ts`. Used only by GeospatialPanel under tools-panel. Wireup: keep file but move under `packages/geospatial`; delete `src/geospatial/`. |
| `api/` | 1 | 10 | `runtime.persistence.client.fetch` (built on `packages/api-spec`) | **G.20** | `apiFetch.ts` is a thin fetch wrapper. UI imports it 10 times (probably for marketplace API + auth). Replace UI imports with `runtime.persistence.client` typed methods; delete `src/api/`. |
| `persistence/` | 1 | (indirect) | `runtime.persistence.underlay` on `packages/persistence-client` | **C.14** (extend) | Single file `UnderlayPersistence.ts`. Move into persistence-client as a sub-namespace. Already in scope of Phase C — add explicit C.14 ID. |

### Tier C — Not UI-imported but still legacy (5 folders)

These don't show in the UI-imports scoreboard (UI doesn't import them) but they are still legacy code under `src/`. They are deleted by Phase G as well.

| `src/<dir>` | Files | New target | **NEW sub-phase** | Notes |
|---|---:|---|---|---|
| `snapping/` | 17 | `packages/picking` (already exists) | **G.21** | `SnapManager`, `SnapVisualizer`, `SpatialGrid`, providers. Picking package already absorbs the role. Wireup is engine-internal, not UI. UI sees snap indicators via `runtime.scene` overlays. |
| `spatial/` | 5 | `packages/geometry-kernel` + `packages/picking.spatialIndex` | **G.22** | Spatial index + acceleration structures. |
| `topology/` | 2 | `packages/geometry-kernel.topology` | **G.23** | Topology layer + spatial index. |
| `structural/` | 2 | `plugins/structural` (already exists) + `packages/geometry-kernel` | **G.24** | `LoadPathGraph.ts` + `index.ts`. |
| `migration/` | 2 | `packages/legacy-shim` (already exists) | **G.25** | `VGToIntentMigration.ts`, `ViewTemplateToIntentMigration.ts`. One-time data migrators — fold into legacy-shim then delete. |
| `collaboration/` | 2 | `packages/sync-client` + `plugins/multiplayer` | **G.26** | `CommandRegistry.ts` + `RemoteCommandDispatcher.ts`. Already covered by Phase C.10–C.13 wireup; just needs explicit deletion ID. |
| `constraints/` | 2 | `packages/constraint-solver` (already exists) | **G.27** | `ConstraintEngine.ts` + `StairConstraintEngine.ts`. Covered by SPEC-48 + ADR-024. |
| `history/` | 1 | `packages/persistence-client.eventLog.undoRedo` | covered by Phase C deletion of `UndoManager.ts` (already in §5) | covered-S72 |
| `render/` | 1 | `packages/render-runtime` (already exists) | **G.28** | `PhysicsOverlayRenderer.ts` only. Move with `physics/` decision (G.18). |
| `visibility/` | 1 | `packages/visibility` (already exists) | **G.29** | `VGGovernanceStore.ts` only. Already covered by Phase F.8 wireup; needs explicit deletion ID. |
| `furniture/` | 1 | `plugins/furniture` (already exists) | **G.30** | `wardrobe/` directory only (already migrated to plugin); the legacy stub stays in `src/` as a compat shim until Phase G. |
| `features/` | 1 | `plugins/furniture` (already exists) | **G.31** | `features/furniture/` only. Same shim story as above. |

### Tier D — Stays as-is (5 folders)

These do not move and are not deleted.

| `src/<dir>` | Files | Why it stays |
|---|---:|---|
| `styles/` | 44 (CSS) | The white UI's CSS — Vision §6 explicitly preserves it. Untouched in any phase. |
| `utils/` | 7 | Generic helpers (`ActiveLevelGuard`, `centeredWindows`, `cesiumLoader`, `debugOverlay`, `ImageToImportConverter`, `JSONRepair`, `PDFToImageConverter`). Either UI-only (kept in `src/utils/`) or moved into a new `packages/utils` (decision deferred — low priority, no UI breakage either way). |
| `types/` | 1 | `three-addons.d.ts` — TypeScript ambient declarations. Stays. |
| `dev/` | 1 | `WallPerfBench.ts` — dev-only. Either stays or moves to `apps/bench/`. |
| `ui/` | 221 | The white UI — the entire point of the wireup is to preserve it. |

---

## §24.2  `src/elements/` — sub-folder gap (4 unaddressed sub-dirs)

`src/elements/` has **24 subdirectories**, not 12. The plan migrates 12 family plugins (Phase E.1–E.13) but does not name these four:

| `src/elements/<dir>` | What it contains | Where it goes | **NEW sub-phase** |
|---|---|---|---|
| `openings/` | Generic opening primitives shared by door + window + curtain-wall | Already absorbed by `plugins/door` + `plugins/window` + `plugins/curtain-wall`. Add migration row. | **E.15** (generic-openings absorption) |
| `preview/` | UI preview helpers — used by `src/ui/property-inspector/family-panels` (which §5 already deletes) | Move to `plugins/<family>/inspector/preview-helpers.ts` per family | **E.16** (preview helpers split) |
| `roomBoundingLines/` | Supplemental geometry for `plugins/rooms` | Fold into `plugins/rooms` | **E.17** (rooms supplements absorption) |
| `structural/` | Cross-family aggregator (uses beam/column/slab/wall) | `plugins/structural` (already exists; Tier C row G.24 deletes the `src/elements/structural/` mirror) | covered by G.24 |

**Also: the plan claims plugins for all 12 families but `plugins/floor` does not exist on disk yet** (Phase E.6 target). New sub-phase **E.6.0** (create plugin scaffolding) prepended.

---

## §24.3  Updated total deletion count

The original §5 cited ~150K LOC. With the additional Tier B + Tier C sub-phases, the realistic deletion at end of Phase G is:

| Source | LOC est. | Notes |
|---|---:|---|
| Original §5 list (engine/elements/commands/core/ai/services + UI shims) | ~150,000 | unchanged |
| `src/tools/` (G.10) | ~5,000 | tool registry, gizmos, transform controllers |
| `src/monetization/` (G.11) | ~400 | three small files |
| `src/import/` (G.12) | ~6,000 | dxf+ifc+rhino legacy parsers (most of the heavy lifting already moved into plugins) |
| `src/generative/` (G.13) | ~300 | absorbed by `plugins/ai-generative` |
| `src/rendering/` (G.14) | ~2,000 | preset/queue helpers absorbed by `packages/render-runtime` |
| `src/cde/` (G.15) | ~150 | one file |
| `src/export/` (G.16) | ~4,000 | glb+ifc+sheets exporters |
| `src/portfolio/` (G.17) | ~200 | one file |
| `src/physics/` + `src/render/` (G.18 + G.28) | ~600 | dev-only physics overlay |
| `src/geospatial/` (G.19) | ~250 | Cesium bridge |
| `src/api/` (G.20) | ~80 | thin fetch wrapper |
| `src/snapping/` (G.21) | ~1,500 | overlap with `packages/picking` |
| `src/spatial/` (G.22) | ~600 | overlap with `packages/picking` |
| `src/topology/` (G.23) | ~400 | overlap with `packages/geometry-kernel` |
| `src/structural/` (G.24) | ~250 | overlap with `plugins/structural` |
| `src/migration/` (G.25) | ~200 | folded into `packages/legacy-shim` |
| `src/collaboration/` (G.26) | ~300 | overlap with `packages/sync-client` + `plugins/multiplayer` |
| `src/constraints/` (G.27) | ~400 | overlap with `packages/constraint-solver` |
| `src/visibility/` (G.29) | ~150 | overlap with `packages/visibility` |
| `src/furniture/` + `src/features/` (G.30 + G.31) | ~100 | one file each (shim) |
| **Tier B + C added by this audit** | **~22,880** | net ~15% increase over §5 |
| **Revised Phase G deletion total** | **~172,880 LOC** | replacing the §5 figure |

The replacement footprint under `packages/` + `plugins/` does not grow — these are deletions of duplicated code that the new packages already implement.

---

## §24.4  Decisions deferred (need ADR before sub-phase ships)

Three rows in §24.1 require explicit decisions before their sub-phase can ship. Track them as new ADRs (numbered following ADR-040):

| Decision | Owner | Default if no ADR | New ADR ID |
|---|---|---|---|
| Where `src/portfolio/PortfolioSemanticGraph.ts` lives long-term — `packages/stores` as a portfolio aggregate, or `apps/marketplace-api`, or new `packages/portfolio` | Architecture | `packages/stores.portfolio` aggregate | **ADR-041** |
| Whether `src/physics/` ships as a runtime artefact or stays dev-only (Vision D7 says headless excludes physics; this is debug-only today) | Architecture | dev-only `apps/bench/physics-overlay/`; not in production bundle | **ADR-042** |
| Whether `src/utils/*` is migrated to a new `packages/utils` or kept inline in the consumers (most are tiny) | Architecture | keep inline; do not create `packages/utils` | **ADR-043** |

---

## §24.5  New sub-phases summary (what to add to §16)

| ID | Phase | Description | Sprint window |
|---|---|---|---|
| **B.6** | B (constructor widening) | Widen `runtime.tools` typed handle; expose ToolRegistry + SelectionManager via composer | S74 |
| **B.7** | B | Widen `runtime.entitlements` (AIUsageTracker, EntitlementStore, PlanConfig) | S74 |
| **B.8** | B | Widen `runtime.{ifc,dxf,rhino}.import` typed handles | S75 |
| **B.9** | B | Widen `runtime.scene.renderer.presets` + queue | S75 |
| **B.10** | B | Widen `runtime.export.{ifc,glb,pdf,csv,rationale}` | S75 |
| **C.14** | C (persistence rewire) | Move `UnderlayPersistence` into `packages/persistence-client` as `runtime.persistence.underlay` | S76 |
| **E.6.0** | E (families) | Create `plugins/floor/` plugin scaffolding (currently missing) | S76 |
| **E.15** | E | `src/elements/openings/` absorption into door + window + curtain-wall plugins | S78 |
| **E.16** | E | `src/elements/preview/` helpers split per family | S78 |
| **E.17** | E | `src/elements/roomBoundingLines/` absorption into `plugins/rooms` | S78 |
| **G.10** | G (deletions) | Delete `src/tools/` | S82 |
| **G.11** | G | Delete `src/monetization/` | S82 |
| **G.12** | G | Delete `src/import/` (dxf + ifc + rhino legacy parsers) | S83 |
| **G.13** | G | Delete `src/generative/` | S83 |
| **G.14** | G | Delete `src/rendering/` | S83 |
| **G.15** | G | Delete `src/cde/` | S83 |
| **G.16** | G | Delete `src/export/` (glb + ifc + sheets exporters) | S83 |
| **G.17** | G | Delete `src/portfolio/` (per ADR-041) | S84 |
| **G.18** | G | Delete `src/physics/` (per ADR-042) | S84 |
| **G.19** | G | Delete `src/geospatial/` (move to `packages/geospatial`) | S84 |
| **G.20** | G | Delete `src/api/` (rewrite UI imports) | S84 |
| **G.21** | G | Delete `src/snapping/` | S84 |
| **G.22** | G | Delete `src/spatial/` | S84 |
| **G.23** | G | Delete `src/topology/` | S84 |
| **G.24** | G | Delete `src/structural/` and `src/elements/structural/` | S84 |
| **G.25** | G | Delete `src/migration/` (after legacy-shim absorbs) | S84 |
| **G.26** | G | Delete `src/collaboration/` | S84 |
| **G.27** | G | Delete `src/constraints/` | S84 |
| **G.28** | G | Delete `src/render/` | S84 |
| **G.29** | G | Delete `src/visibility/` | S84 |
| **G.30** | G | Delete `src/furniture/` shim | S84 |
| **G.31** | G | Delete `src/features/` shim | S84 |

**Net addition to plan**: 31 new sub-phase IDs (5 in Phase B, 1 in Phase C, 4 in Phase E, 21 in Phase G). The Phase E + B additions extend the constructor-widening + family-migration windows by ~1.5 sprints; the Phase G additions slot into the existing S82–S84 deletion window.

**Updated cadence**: ~386 + 31 = **~417 sub-phases** across S73–S87.

---

## §24.6  Updated Phase G entry/exit gates

[`19-subphases-G-H-catchall.md`](./19-subphases-G-H-catchall.md) defines G.1–G.9. Append the new IDs from §24.5; **G entry gate** stays "Phase F complete (every UI gesture has a typed runtime call site)"; **G exit gate** is amended to:

> Every legacy `src/` directory listed in §24.1 Tier A + Tier B + Tier C is removed from disk. The only `src/` directories remaining are: `ui/`, `styles/`, `utils/` (per ADR-043), `types/`, `dev/`, `main.ts`, `browser-entry.tsx`, `browser.css`, `familyCreatorPlaceholder.ts`. Total `find src -name '*.ts' -o -name '*.tsx' | wc -l` drops from 1,287 (S72 D0) to ≈ 230 (UI-only + utils + types).

---

## §24.7  Updated Phase H verification (added to [§23](./23-verification-scripts.md))

Add to `pnpm ga-gate`:

```bash
# §23.x — Legacy-folder deletion check (new)
ALLOWED_DIRS="ui styles utils types dev"
ALLOWED_FILES="main.ts browser-entry.tsx browser.css familyCreatorPlaceholder.ts"

for d in src/*/; do
  name=$(basename "$d")
  case " $ALLOWED_DIRS " in
    *" $name "*) continue ;;
    *) echo "FAIL: legacy directory $d still present"; exit 1 ;;
  esac
done

for f in src/*.ts src/*.tsx src/*.css; do
  [ -e "$f" ] || continue
  base=$(basename "$f")
  case " $ALLOWED_FILES " in
    *" $base "*) continue ;;
    *) echo "FAIL: legacy file $f still present"; exit 1 ;;
  esac
done

echo "OK: src/ contains only the allowlisted UI surface"
```

This is the GA-cut-blocker check that proves Phase G actually completed — not just for the §5 list but for the full Tier B + Tier C set surfaced by this audit.

---

## §24.8  TL;DR

The original §5 deletion list covers the 6 biggest legacy directories (≈ 150K LOC) — **but `src/ui/` imports from 23 distinct legacy directories**, so 17 were unaddressed. This audit:

1. Inventories every one of the 36 top-level `src/` folders.
2. Maps each to its new-architecture target.
3. Adds **31 new sub-phases** (B.6–B.10, C.14, E.6.0, E.15–E.17, G.10–G.31) to close the gap.
4. Bumps the realistic Phase G deletion total from ~150K LOC to ~173K LOC.
5. Pins three pending decisions to new ADRs (041–043).
6. Adds a final Phase H gate that asserts only the allowlisted UI surface remains under `src/`.

After these additions, Phase G can land cleanly without leaving any `src/<dir>/*` orphaned imports in `src/ui/`.
