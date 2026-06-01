# §7–§9  Risk register, issues, decision log

> Part of [PRYZM2-WIREUP-PLAN-S72](./00-INDEX.md). Source slice of [PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md](../00-PLAN.md) lines 628–688.

---

## §7 Risk register (revised)

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | Phase B cast-codemod misses a non-cast read (e.g. `(globalThis as any).wallStore`, `eval('wallStore')`). | Medium | High | Phase B D1 lands a stricter scanner: `rg "(window\|globalThis\|self\|top|parent)" --pcre2 src/ui/` reviewed manually + an AST-based scanner in `scripts/scan-engine-globals.mjs`. |
| **R2** | A `src/ui/` panel reads engine state synchronously at a moment the new runtime hasn't constructed it (init-order skew). | Medium | High | `composeRuntime()` constructs every singleton synchronously; only `Renderer.init()` is async. Panels that need the renderer subscribe via `runtime.events.on('scene.ready')` instead of reading on construct. |
| **R3** | Phase E (delete `src/elements/`) breaks a test workflow whose fixture references a legacy type (`WallData`, `SlabBaseline`). | High | Medium | Phase E D1 — type-only re-exports under `packages/legacy-shim` for tests, with a 1-sprint deletion clock. Tests rewritten in their own PRs. |
| **R4** | The 769 cast sites contain hidden behaviour (e.g. `(window as any).wallStore?.getById(id) ?? legacyFallback()` — silent fallbacks that mask bugs). | High | Medium | Phase B's lint rule starts as **warn** for one sprint to surface every site; promoted to **error** at S74 D-final. Each silent fallback is rewritten as an explicit error-throw so loud-fail-soft applies (`08` §11). |
| **R5** | Visual-diff baseline (Phase H) drifts during Phase A–G because the WebGL2 backend in Renderer renders walls slightly differently from the legacy postproduction pipeline. | High | Critical | Phase A D1 captures the baseline from a frozen **pre-S72** build. Every Phase A–G PR diffs against that baseline. Renderer parity work (if needed) is a hard prerequisite for Phase D — done in `packages/renderer/` with its own bench. |
| **R6** | Performance regresses during the wireup (more event subscribers, more allocations per frame). | Medium | Critical | `apps/bench/perf/` runs on every PR with informational alerts pre-GA, hard fail at GA. The per-frame allocation cap (`08` §6.4 NFT) is checked with the V8 sampler. |
| **R7** | Localstorage migrator (Phase C) fails for a user with corrupted `bim-projects-index` (truncated JSON, schema drift). | Medium | High (data loss for that user) | Migrator runs in two passes: (1) read-only scan that surfaces every parse error to the white toast and writes a backup blob to `pryzm-migration-backup-<ts>` localStorage key; (2) only when the user clicks "OK, migrate" does the actual write/delete happen. The legacy keys are NOT deleted until the server confirms 2xx on every event-log POST. |
| **R8** | The Phase D renderer mount into `#container` breaks pre-existing CSS layout assumptions (overflow, z-index of toolbar floating over canvas, retina DPR). | Medium | Medium | Phase D D1 builds a pure-CSS test harness in `apps/bench/visual-diff/layout/` that mounts the renderer inside the same flexbox / grid that PRYZM 1 uses. Visual-diff catches drift before merge. |
| **R9** | Cross-package import hygiene breaks: a `src/ui/` panel needs a runtime-only type (e.g. `WallDto`) and the lint rule blocks the import. | High | Low | `@pryzm/runtime-composer/types` re-exports every DTO type from every plugin (`WallDto`, `SlabDto`, …), so the lint rule's single allowed import covers all type needs. Type-only imports preferred (`import type`). |
| **R10** | Multi-tab sync introduces a CRDT-style conflict the legacy single-tab UI never expected (e.g. user A renames a wall while user B deletes it). | Medium | High | The conflict policy is specified in `08-VISION.md` §3.4 (last-write-wins on simple props; merge-by-fragment on geometry). Phase F lands a conflict UI in `runtime.events.on('sync.conflict', …)` that the white UI surfaces via toast + opt-in resolve modal. |
| **R11** | Phase G's mass deletion breaks the development workflow (tests fail to find legacy fixtures, autoreload crashes, stale dist files). | High | Low | Phase G is split into 4 PRs by zone (engine, elements/commands, ai, core). Each PR runs the full test workflows (the 9 vitest workflows + visual-diff + perf bench) and must be green before the next. |
| **R12** | A native plugin (BCF, IFC) calls into `(window as any).OBC` — the @thatopen/components namespace global — which has no replacement in the new architecture. | Medium | Medium | Phase F D1 inventories every OBC dependency. Most are replaceable with `three`-direct calls (the new renderer doesn't use OBC). The BCF viewpoint serialiser is the one tricky case — already partially ported in `plugins/bcf`. Remaining OBC usage is encapsulated in `plugins/<family>/legacy-obc.ts` with a 90-day removal clock. |
| **R13** | The runtime composer becomes a god object — 30+ subsystems on one handle, hard to test, hard to reason about. | Low | Medium | Each subsystem is a separate package with its own tests; the composer is < 500 LOC of pure wiring. Sub-handles (`runtime.persistence`, `runtime.scene`, `runtime.plugins`) are typed namespaces. Tests construct partial runtimes via `composeRuntime({ subset: ['persistence'] })`. |
| **R14** | A perf gate fails at GA after a green dogfood week (bug surfaced only in the 100-tab telemetry stream). | Low | Critical | Pre-GA: 2-week soak test on a staging deployment with synthetic load (50 simulated users, 5 K elements per project). Telemetry collected via the OTel root span `pryzm.boot` + per-frame `pryzm.frame.*` spans (already wired in `bootstrap.everything.ts`). |
| **R15** | The whole plan slips because two engineers in parallel produces merge-conflict storms. | Medium | High | Per-sprint PR cadence is 2 small per engineer per day, not 1 monster per week. Phase B's panel-cluster split keeps engineers in disjoint files. Phases that touch the same files (D + E composition root) are serialised. |

---

## §8 Issues register (open as of S72 D0 — revised)

| ID | Issue | Source | Action in this plan |
|---|---|---|---|
| **I1** | "I cannot see logs when project creation fails" | operator, 2026-04-29 | Phase C — the white hub uses `AppToast` + `AuthModal` for every persistence error. The dark error overlay is gone with the dark hub in Phase G. |
| **I2** | "I see a dark PRYZM 2 landing / hub I never asked for" | operator, 2026-04-29 | Phase A removes `?pryzm2=1` and the kill-switch entirely. Phase G deletes `apps/editor/src/projects/`. |
| **I3** | "Even the project page becomes dark when I click Open Project" | operator, 2026-04-29 | Phase A removes the `location.assign` redirect; Phase D mounts the renderer into `#container` so the white toolbar overlays the same canvas in-place. |
| **I4** | "No patches" | operator, 2026-04-29 | The `@pryzm/legacy-bridge` package from v1 is retracted. The runtime composer is the only new wiring. Every legacy zone is deleted, not adapted. |
| **I5** | `ProjectListClient` 401 on every call | S71 W3 | Adopted unchanged; hard prerequisite for Phase C. |
| **I6** | `ANTHROPIC_MODEL_ID` 404 | S71 W5-a | Adopted unchanged; required for Phase F (AI). |
| **I7** | `SUPABASE_SERVICE_ROLE_KEY` not set | S71 W5-b | Adopted unchanged; required for Phase C production rollout. |
| **I8** | `pryzm-vi-parity`, `pryzm-persistence`, `audit-log-middleware` workflows red | S71 W5-c | Adopted unchanged; must close before GA gate at end of Phase H. |
| **I9** | `apps/editor/migrations/sunset-pryzm1.md` lists `src/styles/` for S65 deletion | document conflict | Amended in Phase G to mark `src/styles/` and `src/ui/` as KEEP. |
| **I10** | `ADR-026 §4.3` mandates `src/styles/` migration into `packages/ui/` | ADR conflict | Phase H lands ADR-026-A "UI preservation override". |
| **I11** | `src/engine/EngineBootstrap.ts` and `src/engine/subsystems/` still wire ~250 `(window as any)` writes | architecture audit | Deleted in Phase D. |
| **I12** | The bundle currently ships ~150K LOC of legacy `src/elements/`, `src/commands/`, `src/core/` | architecture audit | Deleted in Phases E + G. |
| **I13** | `src/ui/platform/ProjectRepository.ts` writes to localStorage in parallel with the new event log → divergence | architecture audit | Deleted in Phase C; one-shot migrator imports any local-only state. |
| **I14** | Multiple `requestAnimationFrame` callsites compete for the main thread | `08` §6.3 violation | Phase D enforces single-rAF via `runtime.scene.scheduler` + lint rule. |

---

## §9 Decision log

| # | Decision | Rationale |
|---|---|---|
| **D-S72-1** | UI is not on the migration boundary. | Operator intent; consistent with `08` §7 NG7. |
| **D-S72-2** | The kill-switch is retired in Phase A, not generalised. | No second UI to opt into. |
| **D-S72-3** | No bridge package. The white UI imports `@pryzm/runtime-composer/types` directly and reads from `runtime.<path>`. | A bridge is a permanent translation layer. The runtime composer is a one-shot wire-up. |
| **D-S72-4** | Constructor injection of `runtime`, never `(window as any)`. | Typed contract; lint-enforceable; no runtime surprises. |
| **D-S72-5** | All legacy zones (`src/engine/`, `src/elements/`, `src/commands/`, `src/ai/`, most of `src/core/`) are deleted, not dual-tracked. | Two engines forever is the patch we're avoiding. |
| **D-S72-6** | The renderer mounts into the existing `#container`, not a new fullscreen canvas. | Same pixels as PRYZM 1; same DOM contract. |
| **D-S72-7** | Persistence is event-log-first; localStorage migrator runs once. | One source of truth for project state. |
| **D-S72-8** | Single rAF, owned by `frame-scheduler`. | Required by `08` §6.3 (idle 0 fps, scrub 120 fps). |
| **D-S72-9** | Plugin contributions render into typed mount points exposed by the white panel hosts. | No global registries, no DOM-event glue. |
| **D-S72-10** | Visual-diff CI is a hard gate from Phase B onward. | Operator intent is enforceable only via gate. |
| **D-S72-11** | Perf gates from `08` §6 are hard at GA, informational pre-GA. | "Best browser BIM app" needs the floor. |

---

