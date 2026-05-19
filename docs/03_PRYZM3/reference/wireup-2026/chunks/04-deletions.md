# §5  What gets deleted (the precise list)

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 588–614.

---

## §5 What gets deleted (the precise list)

| Path | LOC est. | Replacement |
|---|---|---|
| `src/engine/EngineBootstrap.ts` + `src/engine/subsystems/init*.ts` (8 files) | ~12,000 | `composeRuntime()` + `bootstrap.render.everything.ts` + `runtime.scene` |
| `src/engine/inspect/`, `src/engine/elementSelection/` | ~1,500 | `runtime.visibility` + `runtime.selection` |
| `src/elements/` (12 family directories) | ~140 files | `plugins/<family>/` (already shipping) |
| `src/commands/` (per-family + project commands) | ~265 files | `plugins/<family>/handlers` + `plugins/view/handlers` |
| `src/ai/` | ~37 files | `runtime.ai` (`packages/ai-host` + `apps/ai-worker`) |
| `src/core/persistence/`, `src/core/rendering/`, `src/core/views/`, `src/core/navigation/`, `src/core/schedules/`, most of `src/core/` | ~76,000 LOC | `packages/<peer>/` |
| `src/services/` (legacy services) | ~50 files | per-package equivalents on the runtime |
| `src/ui/platform/ProjectRepository.ts` + `SaveOrchestrator.ts` + `ServerSyncQueue.ts` | ~1,900 | `runtime.persistence.*` + `runtime.sync.*` |
| `src/ui/property-inspector/family-panels/` (per-family forms) | ~24 files | `plugins/<family>/contributions.ts` (Phase F) |
| `src/ui/<family>ModePicker.ts` + `<family>DrawingHUD.ts` | ~24 files | per-plugin contributions |
| `apps/editor/src/projects/` (dark hub, dark modal, dark card) | ~610 | n/a — the white hub is the only hub |
| `apps/editor/src/main.ts` minimum-chrome toolbar inside `mountEditor` | ~150 | n/a — the white toolbar is the only toolbar |
| `apps/editor/src/sunset/Pryzm1SunsetBanner.ts` | ~120 | n/a — no second engine to sunset |
| `apps/editor/src/router.ts` (parseRoute used only by the dark hub) | ~80 | n/a — single-route app |
| `packages/engine-router/` | ~150 | n/a — single engine path |
| `src/main.ts:55–386` (kill-switch) | ~330 | gone in Phase A |
| `src/main.ts:27–35` (sunset banner opt-in) | ~10 | gone in Phase A |
| `server.js` legacy `POST /api/projects/:id/versions` | ~80 | event-log POST under `/api/v1/projects/:id/events` |

**Total deletion at end of Phase G:** ~150,000 LOC of legacy + ~1,300 LOC of dark UI + ~700 LOC of kill-switch infrastructure. **Total addition under `packages/runtime-composer/`:** ~3,000 LOC. **Net SLOC delta on the user-visible surface:** ≤ 0.

---

> **⚠️ Audit amendment — see [`24-pryzm1-src-coverage-audit.md`](./24-pryzm1-src-coverage-audit.md).** The list above covers only 6 of the 23 legacy `src/` directories that `src/ui/` imports from today. Audit §24 adds **31 new sub-phases** (B.6–B.10, C.14, E.6.0, E.15–E.17, G.10–G.31) for the remaining 17 directories (`tools/`, `monetization/`, `import/`, `generative/`, `rendering/`, `cde/`, `export/`, `portfolio/`, `physics/`, `geospatial/`, `api/`, `persistence/`, `snapping/`, `spatial/`, `topology/`, `structural/`, `migration/`, `collaboration/`, `constraints/`, `render/`, `visibility/`, `furniture/` shim, `features/` shim). Revised Phase G deletion total: **~172,880 LOC**.

---

