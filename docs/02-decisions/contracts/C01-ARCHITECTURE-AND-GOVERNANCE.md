# C01 — Architecture & Governance

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Authority**: `01-VISION.md` and `02-ARCHITECTURE.md` supersede this contract on any conflict.  
> **Scope**: the 8-layer model, the 8 architectural principles, the cross-cutting CI gates, and the 9 convergence booleans that define when PRYZM 3 exists.

---

## §1 — The 8 Architectural Principles (P1–P8)

Each principle is a **merge-blocking contract**. Soft-fail counters become hard-fail at the stated phase exit.

| # | Principle | Binding rule | CI gate | Status |
|---|---|---|---|---|
| **P1** | Single composition root | ONE `composeRuntime()` in production. No second runtime wiring, no parallel composition. | `tools/ga-gate/check-single-compose.ts` | soft-fail → hard at Phase D exit |
| **P2** | Single THREE owner | `import * as THREE` allowed **only** in `packages/renderer-three/`. All other THREE uses are a CI failure. | `eslint-plugin-boundaries` (hard-fail) | hard-fail |
| **P3** | Single rAF | `requestAnimationFrame()` called **only** in `packages/frame-scheduler/src/RafAdapter.ts` (called by `FrameScheduler.ts`). Every other animation MUST subscribe to the frame bus. | `tools/ga-gate/check-raf-count.ts` (ratchet = 1) | hard-fail |
| **P4** | No `(window as any)` | Forbidden everywhere except the allowlisted shim `apps/editor/src/engine/window-shim.ts`. The allowlist is one file; adding to it requires an ADR. | `tools/ga-gate/check-cast-count.ts` (ratchet = 0 non-shim) | hard-fail (non-shim = 0 achieved; Wave 5) |
| **P5** | Schemas are pure | `packages/schemas/` MUST have zero I/O imports, zero THREE, zero DOM. | `scripts/ci-check-domain-purity.ts` | hard-fail |
| **P6** | Commands are the only mutation path | UI MUST dispatch commands through `commandBus`. No direct store writes from UI code. | `scripts/ci-check-no-direct-store-writes.ts` | hard-fail |
| **P7** | Visibility intent ≠ UI state | `packages/visibility/` is a first-class domain concept. Plugins and AI express intent without owning UI. | `packages/visibility/__tests__/intent-not-ui.test.ts` | hard-fail |
| **P8** | Sync conflicts explicit + spans required | CRDT merges that lose data surface as user-resolvable conflicts (never silent). Every new exported function MUST add ≥ 1 OpenTelemetry span. | per-PR span check (`scripts/ci-check-spans.ts`) | hard-fail |

---

## §2 — The 8-Layer Model

The dependency rule is absolute: **a layer MAY import from any lower layer; it MUST NOT import from a higher layer.** L7.5 is the only permitted exception and MUST monotonically shrink toward zero.

```
L7.5  src/ (7 transitional files, 0 subdirs) — TRANSITIONAL; shrinks toward zero
L9    plugins/*         (47 plugins)   — imports L8 only
L8    packages/plugin-sdk/             — curated SDK facade (@pryzm/sdk v1.0.0)
L7    apps/*             (13 apps)     — per-app surfaces
L4    packages/renderer/  packages/render-runtime/  packages/persistence-client/
      packages/scene-committer/        — scene dispatch + persistence
L3    packages/runtime-composer/  packages/ui-base/
      packages/stores/  packages/view-state/  packages/file-format/
      packages/sync-client/  packages/frame-scheduler/  — state + composition
L2    packages/geometry-kernel/  packages/ai-host/
      packages/drawing-primitives/  packages/constraint-solver/  — domain logic
L1    packages/command-bus/  packages/picking/  packages/visibility/
      packages/snapping/  packages/ai-cost/  packages/runtime-undo-stack/
      packages/input-host/  packages/physics-host/  packages/renderer-three/
      packages/spatial-index/  packages/ui/  — leaf infrastructure
L0    packages/schemas/                — Zod schemas; foundation for all layers
```

### Import matrix (CI-enforced via `eslint-plugin-boundaries`)

| From ↓ / To → | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| L0 | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L1 | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L2 | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| L3 | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| L4 | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ |
| L5 | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ |
| L6 | subset | subset | subset | subset | subset | ❌ | — | ❌ |
| L7 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | — |

**"subset"** means the SDK re-exports a curated subset. Plugins get only the subset — never direct lower-layer access. This is what makes the SDK a stable public contract that survives internal refactors.

---

## §3 — Package Ownership

| Layer | Canonical packages | LOC (2026-05-01) |
|---|---|---:|
| L0 | `schemas` | 3,016 |
| L1 | `command-bus`, `frame-scheduler`, `picking`, `visibility`, `ai-cost`, `sync-client`, `runtime-undo-stack`, `ui`, `input-host`, `physics-host`, `renderer-three`, `snapping`, `spatial-index` | ~14,000 |
| L1½ | `protocol` → schemas; `drawing-primitives` → schemas | 1,110 |
| L2 | `geometry-kernel`, `ai-host`, `types-builtin`, `constraint-solver` | ~14,000 |
| L3 | `stores`, `runtime-composer`, `ui-base`, `view-state`, `file-format`, `sync-client`, `frame-scheduler` | ~10,000 |
| L4 | `scene-committer`, `persistence-client`, `renderer`, `render-runtime` | 9,878 |
| L5 | `file-format`, `view-state` | 4,493 |
| L6 | `plugin-sdk` v1.0.0-rc.1 | 2,067 |
| L7 | 46 plugins | 58,424 |

**54 packages, 12 apps, 46 plugins.** The per-file inventory is the canonical source of truth: `reference/architecture-detail/02-FILE-STRUCTURE.md`.

---

## §4 — The 9 Convergence Booleans

PRYZM 3 exists at the git SHA when **all 9 are simultaneously true**.

```
#1  legacy_src_folders == 1            (only src/ui/ remains)
#2  window_any_in_src_ui == 0          (P4 hard-fail in src/ui/)
#3  raf_owners_outside_frame_scheduler == 0
#4  default_runtime == composeRuntime()
#5  EngineBootstrap_LOC == 0           ✅ achieved Wave 7 / S87-WIRE
#6  all_workflows_green == workflows_total
#7  plugin_sdk_published == true        (Phase F)
#8  headless_published == true          (Phase F)
#9  marketplace_live == true            (Phase F)
```

**State today (post-Wave-12, 2026-05-01)**: 5/9 true (#2 ✅ #3 ✅ #4 ✅ #5 ✅ #6 ✅). Live table: `03-CURRENT-STATE.md §8`.

**Phase F (booleans #7, #8, #9) MUST NOT start until ≥ 6/9 booleans are true** (Rule 4 of `01-VISION.md §8`).

---

## §5 — CI Gate Inventory

All CI gates MUST pass before a PR merges. A passing trunk MUST imply all gates are green.

| Gate | Script / Rule | Principle | Failure mode |
|---|---|---|---|
| Layer boundary violations | `eslint-plugin-boundaries` | P2, L0–L7 matrix | Hard-fail |
| Schemas purity | `scripts/ci-check-domain-purity.ts` | P5 | Hard-fail |
| Direct store writes from UI | `scripts/ci-check-no-direct-store-writes.ts` | P6 | Hard-fail |
| Visibility intent purity | `packages/visibility/__tests__/intent-not-ui.test.ts` | P7 | Hard-fail |
| OpenTelemetry span coverage | `scripts/ci-check-spans.ts` | P8 | Hard-fail |
| L7 boundary (no direct pryzm in plugins) | `no-direct-pryzm-in-plugins` ESLint rule | L6/L7 | Hard-fail |
| No EngineBootstrap shim | `pryzm/no-engine-bootstrap-shim` ESLint rule | P1 | Hard-fail |
| rAF owners | `tools/ga-gate/check-raf-count.ts` (ratchet = 1) | P3 | Hard-fail |
| `(window as any)` non-shim | `tools/ga-gate/check-cast-count.ts` (ratchet = 0) | P4 | Hard-fail |
| Single composition root | `tools/ga-gate/check-single-compose.ts` | P1 | Soft → hard at Phase D |
| THREE isolation (P2 Class A) | `tools/ga-gate/check-three-imports.ts` (exit 0 = 0 violations outside renderer-three) | P2 | Hard-fail |
| GitHub Actions CI | `.github/workflows/ci.yml` — PR-blocking gate on `main` + `develop`; runs all GA gate scripts, typecheck, tests, `npm audit --audit-level=high` | P1, P8 | **Hard-fail** — no PR merges without CI green (Wave A14 S118, 2026-05-03) |
| Dependency CVE audit | `npm audit --audit-level=high` (run in CI step) | P8 | Hard-fail — any high/critical CVE introduced by a PR fails the merge gate |

---

## §6 — Discipline Rules

These five rules are merge-blocking non-negotiables (from `01-VISION.md §8`):

1. **Edit canonical docs; do not write audit derivatives.** When a discrepancy surfaces, edit the relevant `C0N-*.md` or `02-ARCHITECTURE.md`. Writing a new `*-AUDIT-2026-MM-DD.md` is prohibited.
2. **A sub-phase is done when runtime behaviour matches the spec**, not when documentation says so.
3. **The live verifiers in `03-CURRENT-STATE.md §1` are re-run every sprint close.** Any positive delta on a tripwired metric is an incident.
4. **Phase F cannot start until ≥ 6/9 convergence booleans are true** (`§4` above).
5. **Every PR adding a new exported function adds ≥ 1 OpenTelemetry span** (P8). No span = no merge.
