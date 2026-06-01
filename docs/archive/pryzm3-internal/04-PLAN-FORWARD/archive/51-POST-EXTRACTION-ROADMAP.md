# 51 — Post-Extraction Roadmap: What Comes After Sprint AU

> **Stamp**: 2026-05-16 · **Status**: 🟢 ACTIVE PLAN — superseded for legacy-elimination detail by doc 54  
> **Authority**: This document closes G5 from `50-PLAN-FORWARD-GAP-ANALYSIS.md`.  
> **Context**: Sprint AU completed the `apps/editor/src/` extraction sequence. This document covers the post-extraction roadmap phases. For the complete, sprint-by-sprint legacy elimination plan (all 30 sprints, all 1,800+ call sites, all 5 new gates), see **[`54-COMPLETE-LEGACY-ELIMINATION-PLAN.md`](./54-COMPLETE-LEGACY-ELIMINATION-PLAN.md)**.

---

## §1 — Where We Are (Sprint AU Close)

The extraction sequence moved all engine and UI code out of the root `src/` directory
into `apps/editor/src/{engine,ui,rendering}`.  The root `src/` is now a thin SPA shell
with no logic.

**Convergence booleans at Sprint AU close (9/9 TRUE):**

| # | Boolean | State |
|---|---|---|
| 1 | `legacy_src_folders ≤ 1` | ✅ 0 folders in `src/` |
| 2 | `window_any_in_src_ui == 0` | ✅ 0 casts |
| 3 | `raf_owners_outside_frame_scheduler == 0` | ✅ 0 owners |
| 4 | `default_runtime == composeRuntime()` | ✅ single root |
| 5 | `EngineBootstrap_LOC == 0` | ✅ deleted |
| 6 | `all_workflows_green == workflows_total` | ✅ 15/15 gates |
| 7 | `plugin_sdk_published` | ⚠ code-ready, npm pending |
| 8 | `headless_published` | ⚠ code-ready, npm pending |
| 9 | `marketplace_live` | ⚠ code-ready, DNS pending |

**Open technical debt at Sprint AU close (updated 2026-05-16 deep audit):**

| Pattern | Baseline (2026-05-16) | Zero-legacy target |
|---|---:|---|
| `cmdMgr.execute()` aliased — `apps/editor/src/` | **154** | Phase E.5.x |
| `window.commandManager` literal — `apps/editor/src/` | **68** | Phase E.5.x |
| `commandManager.execute()` — `packages/` | **~50** | Phase E.5.6 |
| `window.xStore` writes (registration) — init files | **91** | Phase E.stores.1 |
| `window.xStore` reads — `apps/editor/src/` | **230** | Phase E.stores |
| `window.xStore` reads — `packages/` | **~280** | Phase E.stores.5 |
| `window.dispatchEvent` / `CustomEvent` — `apps/editor/src/` | **501** | Phase F.events |
| `window.dispatchEvent` / `CustomEvent` — `packages/` | **447** | Phase F.events |
| `structuredClone` undo snapshots — `command-registry` | **165** | Phase E.undo |
| `commandManager: any` typed params — `packages/` | **14** | Phase E.types |
| GA gates (5 gaps not yet covered) | **15/20** | Phase 0 (gate sprint) |

Full sprint-by-sprint plan: **[`54-COMPLETE-LEGACY-ELIMINATION-PLAN.md`](./54-COMPLETE-LEGACY-ELIMINATION-PLAN.md)**  
Legacy pattern catalogue + per-package classification: **[C14](../../02-decisions/contracts/C14-LEGACY-ELIMINATION-AND-PRYZM3-ENFORCEMENT.md)**

---

## §2 — Roadmap Phases

### Phase F-1 / E.5.x — Command Bus Full Migration

**Goal:** Drive all `commandManager.execute()` / `cmdMgr.execute()` calls to 0 across the entire codebase (apps, packages, plugins).

> **See [`54-COMPLETE-LEGACY-ELIMINATION-PLAN.md §5 Phase E.5.x`](./54-COMPLETE-LEGACY-ELIMINATION-PLAN.md)** for the full sprint-by-sprint breakdown with exact file targets, handler registration recipes, and per-sprint gate ceilings.

| Doc-54 sprint | Target ceiling | Primary files |
|---|---|---|
| E.5.1 | ≤ 206 | `PropertyInspectorApply.ts` — 16 sites |
| E.5.2 | ≤ 178 | `MovePlanToolHandler.ts`, `AlignPlanToolHandler.ts`, `CopyPlanToolHandler.ts` |
| E.5.3 | ≤ 163 | `PropertyPanelTypeSelector.ts`, `PropertyPanel.ts`, `PropertyPanelAnnotations.ts` |
| E.5.4 | ≤ 155 | `registerTransformDragHandler.ts` — gizmo drag-end (C06 §4.3) |
| E.5.5 | ≤ 95 | 25 remaining plan-tool handler files + PlanViewInteraction, overlays |
| E.5.6 | **0** | `@pryzm/ai-host`, `@pryzm/core-app-model`, `@pryzm/command-registry`, `plugins/annotations` |


**Gate progression:** `check-no-commandmanager.ts` ceiling lowers each sprint.
**Closes:** OI-023.

---

### Phase F-2 — apps/editor/src/ → packages/ Promotion (4–6 sprints)

**Goal:** Promote `apps/editor/src/engine/` and `apps/editor/src/ui/` to first-class
`@pryzm/*` packages, making the plugin ecosystem fully self-contained.

| Sprint | Work | Status |
|---|---|---|
| F2.1 | Audit `apps/editor/src/engine/` public API surface; define `@pryzm/engine` interface | ✅ Done 2026-05-15 |
| F2.2 | Tighten `EngineBootstrapFn` runtime type; add `IEngineContext` contract to `@pryzm/engine` | ✅ Done 2026-05-15 |
| F2.3 | Extract `apps/editor/src/engine/views/` → `@pryzm/views`; add `implements` to `PlanViewManager`, `SectionViewService`, `SplitViewManager` | ✅ Done 2026-05-15 |
| F2.4 | Extract `apps/editor/src/ui/` → `@pryzm/editor-ui` | ✅ Done 2026-05-15 |
| F2.5 | Update all import paths; delete `apps/editor/src/` root once empty | ✅ Done 2026-05-15 |
| F2.6 | Per-package compile gate passes for all new packages | ✅ Done 2026-05-15 |

**Closes:** OI-016 (Phase F-2 is the actual src → packages migration, not extraction).
**Precondition:** Phase F-1 (bus migration) must be complete; no commandManager deps.

---

### Phase F-3 — GA Certification Items (human-action sprint)

**Goal:** Complete the 5 infra-pending human-action items that block GA certification.
These are listed in `52-PHASE-F-EXECUTION-CHECKLIST.md` with step-by-step instructions.

| Item | Blocker |
|---|---|
| npm publish `@pryzm/plugin-sdk` | OI-011/OI-017 |
| npm publish `@pryzm/headless` | OI-012/OI-018 |
| DNS + TLS for `marketplace.pryzm.app` | OI-013/OI-019 |
| GitHub Actions CI workflow | OI-026 |
| OTel OTLP export target | OI-022 |

**Closes:** OI-011, OI-012, OI-013, OI-017, OI-018, OI-019, OI-022, OI-026.

---

### Phase F-4 — Marketplace SPA (3–4 sprints)

**Goal:** Build the full marketplace SPA in `apps/marketplace/src/`.

| Sprint | Deliverable |
|---|---|
| F4.1 ✅ | Browse + Search pages; plugin card component; `api/client.ts` camelCase normalizer; category filter; GET /versions endpoint |
| F4.2 ✅ | Plugin detail + Install flow; `AuthModal` (sign-in/sign-up); `InstallPanel` (free/paid/purchase-required); nav auth widget; auth-gated SubmitPage; `/api` proxy |
| F4.3 ✅ | Review system — `plugin_reviews` DB table; GET/POST review endpoints; `Stars`, `StarPicker`, `ReviewsSection` components; upsert by user+plugin; masked reviewer labels |
| F4.4 | Admin dashboard; moderation queue |

**Precondition:** Phase F-3 (DNS/TLS live).  **Closes:** OI-025.

---

### Phase F-5 — Quality + Compliance (parallel with F-3/F-4)

| Item | Sprint | Gate |
|---|---|---|
| WCAG 2.1 AA external audit | F-3 window | — |
| buildingSMART IFC4X3 certification | F-3 window | — |
| OTel spans for all Phase F handlers | F4.x | `check-otel-spans.ts` ceiling |
| `window-shim.ts` cast elimination | F2.5 | `check-cast-count.ts` ceiling |

**Closes:** OI-020, OI-021, OI-024.

---

## §3 — Milestone Summary

```
Sprint AU close (now)   ────────── 9/9 booleans TRUE; 15 gates green
Phase F-1 complete      ────────── 0 commandManager.execute() sites
Phase F-2 complete      ────────── apps/editor/src/ promoted to packages/
Phase F-3 complete      ────────── npm published; DNS live; GA certified
Phase F-4 complete      ────────── Marketplace SPA live
PRYZM 3 SHIPPED         ────────── All booleans live in production
```

---

## §4 — Sprint Entry Points

| Phase | Entry doc |
|---|---|
| F-1 (bus migration) | `33-PHASE-E5X-COMMANDMANAGER-FULL-MIGRATION.md` + `36-PHASE-D-CTRL-Z.md §4.3` |
| F-2 (package promotion) | `15-PACKAGE-POPULATION-GAP.md` + `16-PACKAGE-DEPENDENCY-MAP.md` |
| F-3 (human actions) | `52-PHASE-F-EXECUTION-CHECKLIST.md` |
| F-4 (marketplace) | `30-WAVE-A20-PHASE-F-SDK-MARKETPLACE.md` |
| F-5 (compliance) | `28-WAVE-A18-QUALITY-GATES-LOD-A11Y.md` |
