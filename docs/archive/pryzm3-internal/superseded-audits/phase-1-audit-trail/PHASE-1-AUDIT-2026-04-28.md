# PHASE 1 — CODE-vs-SPEC AUDIT (2026-04-28)

**Scope.** Independent audit of Pryzm Phase 1 (M1 → M12) against the
2026-04 architecture set in `docs/00_NEW_ARCHITECTURE/`. Read sources:
README, 01-TARGET-ARCHITECTURE, 02-ORCHESTRATION, 04-PRODUCTION-PARITY,
05-IMPLEMENTATION-PLAN, 06-IDENTITY, 08-VISION, 09-AS-IS-VS-TO-BE,
10-MASTER-IMPLEMENTATION-PLAN-36M, 11-FILE-STRUCTURE, CONFLICT-ANALYSIS,
Context, GAP-REVIEW-2026-04-27, PACKAGE-CLASSIFICATION-2026-04-28; the
five Phase-1 phase docs (PHASE-1, 1A, 1B, 1C, 1D); both 2026-04-27
amendment docs; existing audit `PHASE-1-DRIFT-CLOSEOUT-IMPLEMENTATION`;
ADRs 001/002/004/005/006/010/013/016/020/022/023/024/025/026/028; and
SPECs 01/02/03/04/05/06/10/11/12/21/24/26/29/30/31/48.

This document is intentionally evidence-based — every finding cites a
file path or grep result you can reproduce.

---

## 0. Headline verdict

| Dimension                                  | Grade | One-line evidence |
| ------------------------------------------ | ----- | ----------------- |
| Package surface (does the planned monorepo exist?) | **A**  | 91 workspace packages present; every Phase-1 package referenced in 11-FILE-STRUCTURE is on disk. |
| Architectural invariants P1–P6             | **B+** | Lint rules wired as `error`; kernel pure; one P3 false-positive cleared; P6 (`window as any`) not yet retired (~50+ live sites). |
| Element families (M4–M9)                   | **A−** | All 12 Phase-1 plugins exist with handlers + committers + tools; SPEC-21 `canonical.json` fixtures **missing**. |
| Persistence + file format (M10, M12)       | **A−** | `packages/file-format` ships pack/unpack + deterministic ZIP; msgpack codec present; chunked GLB pipeline present. |
| Bake / sync (M11)                          | **B**  | `apps/bake-worker` and `apps/sync-server` exist; not provably wired into the live `Start application` workflow (legacy PRYZM-1 server runs by default). |
| Headless alpha (M9)                        | **A−** | `apps/headless` has CLI with `addWall`, `addSlab`, `exportPryzm`, `newProject`, plus 6 test files. |
| ADR-025 (three.js pin)                     | **D**  | Three pinned to **^0.183.2** at root; lock contains **0.173, 0.176, 0.183** simultaneously. ADR mandates exact pin, no caret. |
| ADR-026 (React-free editor)                | **B**  | `apps/editor` (the PRYZM-2 surface) is React-free in source and deps. The legacy root `src/` still uses React (2 files) — only acceptable while PRYZM-1 is the default served bundle. |
| ADR-028 (no `service_role` in app code)    | **A**  | Only 2 hits, both in `apps/bench`/`reports`. No production code leak. |
| Validation / CI hygiene                    | **C**  | 3 of 14 declared validation workflows fail because of stale path references / missing fallbacks. `bake-worker-test-geometry` workflow points at `packages/bake-worker` which **does not exist** (it's `apps/bake-worker`); the failure is masked by `|| echo`. |
| Strangler-fig honesty                      | **C+** | The default `npm run dev` still serves PRYZM-1 (`server.js` + root `vite.config.ts` + root `src/`). The Phase-2 surface lives behind `apps/editor/vite.pryzm2.config.ts` and the `?pryzm2=1` route — fine by design, but the alpha gate has not been demonstrated against the live workflow. |

**Bottom line.** Phase 1 is **substantively built** — far more than a
skeleton — but the cap-stone artefacts that prove it (`canonical.json`
per family, three.js exact pin, alpha-gate recording, retired
`(window as any)` sites) are not yet in place. The build is one
focused sprint away from a defensible "M12 alpha gate green".

---

## 1. Phase 1 milestone audit (M1 → M12)

Acceptance criteria are the consolidated set from
`PHASE-1-FOUNDATION-M1-M12.md`, the four sub-phase docs, and the
2026-04-27 robustness amendment, deduplicated.

### M1 — Schemas, IDs, Command Bus

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `packages/schemas/` exists with Zod DTOs | ✅ | present; declared as `@pryzm/schemas` workspace dep at root. |
| `packages/protocol/` typed-ID system | ✅ | present; `@pryzm/protocol` referenced by editor. |
| `packages/command-bus/` with Immer patches | ✅ | present; `@pryzm/command-bus` is editor dep. |
| Round-trip schema test, branch coverage | ⚠ | tests exist (`__tests__/`); branch-coverage gate not enforced in any wired workflow. |
| Command-execute < 1 ms p95 bench | ⚠ | `apps/bench` exists but `cmd-execute-latency.bench.ts` not seen in run config. |

**Verdict: pass on existence, soft on enforcement.**

### M2 — Frame Scheduler + Persistence v0

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `packages/frame-scheduler/` single owner | ✅ | present, P3 ESLint rule `pryzm/no-raf: error` in `eslint.config.js:214`. |
| Idle-zero-fps test | ⚠ | rule present, test name not seen — verify `__tests__/idle-zero-fps.test.ts`. |
| `packages/persistence-client/` event log | ✅ | present; `@pryzm/persistence-client` is editor dep; codecs present (`MsgpackCodec`, `MsgpackAliasedCodec`). |
| IndexedDB + in-memory backends | ✅ (likely) | `packages/storage-driver` exists. |

**Verdict: pass.** Single-owner rAF rule is wired as `error`.

### M3 — Renderer Spine

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `packages/scene-committer/` (only THREE seat) | ✅ | present; ESLint `pryzm/no-three-outside-committer: error`. |
| `packages/renderer/` dual-mode WebGPU/GL2 | ✅ | present; a separate `packages/render-runtime` also exists (worth a layer-boundary check). |
| `apps/editor/src/bootstrap.ts` start-up | ✅ | `bootstrap.ts`, `bootstrap.data.ts`, `bootstrap.render.ts`, `bootstrap.everything.ts` all exported from package. |
| `?pryzm2=1` cube demo end-to-end | ⚠ | `vite.pryzm2.config.ts` exists but the **default served bundle is PRYZM-1** (root `vite.config.ts` + `server.js`); no live evidence the M3 demo renders in the deployed dev workflow. |
| Bundle ≤ 1.8 MiB gzip | ❌ unproven | no bundle-budget gate seen in CI. |

### M4 — Wall stack + Pure Producer

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `plugins/wall/` (store, intent, tool, handlers, committer, errors) | ✅ | `intent.ts`, `store.ts`, `tool.ts`, `errors.ts`, `occupancy.ts`, `system-type-store.ts`, `handlers/index.ts`, `committer/wall-committer.ts` all present. |
| `packages/geometry-kernel/producers/wall.ts` THREE-free | ✅ | kernel `src/index.ts` has zero THREE/DOM imports; the only "window" hit is `producers/window.ts` (the BIM element), not the DOM. |
| Node ↔ browser byte-identical buffers | ⚠ | infrastructure to check it (`apps/headless` + bench) exists; no published parity recording found. |

### M5 — Wall tooling, miter, material pool

| Check | Status |
| ----- | ------ |
| Pointer-state-machine tool | ✅ `plugins/wall/tool.ts` |
| Material pooling | ⚠ verify in `committer/`; no dedicated `material-pool.test.ts` seen. |
| Parity snapshot vs PRYZM-1 | ❌ no `tests/parity/wall*.snap` discovered. |

### M6 — Nine core primitives

| Family | Plugin folder | Handlers | Committer | Tool |
| ------ | ------------- | -------- | --------- | ---- |
| Slab          | `plugins/slab`           | ✅ | ✅ | ✅ |
| Door          | `plugins/door`           | ✅ | ✅ | ✅ |
| Window        | `plugins/window`         | ✅ | ✅ | ✅ |
| Roof          | `plugins/roof`           | ✅ | ✅ | ✅ |
| Curtain Wall  | `plugins/curtain-wall`   | ✅ | ✅ | ✅ |
| Grid          | `plugins/grid`           | ✅ | ✅ | ✅ |
| Column        | `plugins/column`         | ✅ | ✅ | ✅ |
| Beam          | `plugins/beam`           | ✅ | ✅ | ✅ |
| (+ Wall, M4)  | `plugins/wall`           | ✅ | ✅ | ✅ |

**Cold-load < 800 ms small fixture: not benchmarked in a wired workflow.**

### M7 — Element completion + cascades

| Check | Status |
| ----- | ------ |
| `plugins/stair`           | ✅ |
| `plugins/handrail`        | ✅ |
| `plugins/ceiling`         | ✅ |
| Cascade runner in `command-bus` | ⚠ verify `cascade.ts` / `CascadeRunner` |
| Stair–handrail coupling test | ⚠ no `stair-coupling.test.ts` found in audit grep. |

### M8 — Renderer hardening

| Check | Status |
| ----- | ------ |
| `packages/renderer/passes/` post-FX | ⚠ verify; package present but pass list not enumerated here. |
| `packages/picking/` GPU + BVH | ✅ present. |
| 55+ FPS orbit bench with full FX | ❌ not wired. |

### M9 — Headless alpha + view state

| Check | Status |
| ----- | ------ |
| `apps/headless/` Node CLI | ✅ `cli.ts`, `commands/{addWall,addSlab,exportPryzm,newProject}.ts`. |
| `packages/view-state/` | ✅ present. |
| `headless-e2e.test.ts` produces `.pryzm` | ✅ adjacent: `headless-s18.test.ts`, `headless-node.test.ts`, `node-compat.test.ts`, `strict-mode.test.ts`. |

**Strongest milestone of Phase 1.** Headless is real, has tests, and
the `exportPryzm` command path exists.

### M10 — Binary persistence (chunks, Draco/Meshopt, manifest)

| Check | Status |
| ----- | ------ |
| `packages/persistence-client/codecs/` (msgpack family) | ✅ `MsgpackCodec.ts`, `MsgpackAliasedCodec.ts`. |
| Draco/Meshopt round-trip test | ⚠ verify `__tests__/draco-roundtrip.test.ts` — not surfaced in any wired workflow. |
| Content-addressed chunk SHA-256 | ⚠ implied by ADR-013; verify file naming under `chunks/<projectId>/<elementId>/<hash>.glb` in code. |

### M11 — Server bake + sync linearisation

| Check | Status |
| ----- | ------ |
| `apps/bake-worker/` | ✅ present. |
| `apps/sync-server/` | ✅ present. |
| 250 ms coalesce window (ADR-010) | ⚠ verify in `apps/bake-worker/src/` — not grep-confirmed in this audit. |
| Round-trip < 50 ms bench | ❌ not wired. |
| Validation workflow `bake-worker-test-geometry` | ❌ **broken**: `.replit:114` runs `cd packages/bake-worker` — that path does not exist (the package is `apps/bake-worker`). The `|| echo "deferred"` swallows the error. |

### M12 — `.pryzm` ZIP, tier-streamed loader, alpha gate

| Check | Status |
| ----- | ------ |
| `packages/file-format/src/` | ✅ `pack.ts`, `unpack.ts`, `family-pack.ts`, `family-unpack.ts`, `zip-deterministic.ts`, `family-migrations/`, `migrations/`, `canonical-json.ts`. |
| Tier loader in persistence-client | ⚠ exists but not benchmarked here. |
| **M12 alpha-gate recording** | ❌ not produced — no artefact under `apps/bench/recordings/M12-alpha-gate.*`. |

---

## 2. Architectural-invariant compliance (P1–P6)

| Invariant | Status | Evidence / Gap |
| --------- | ------ | -------------- |
| **P1 — Pure geometry kernel** (no THREE / DOM / React) | ✅ | `rg "from ['\"]three['\"]\|document\\.\|window\\."` in `packages/geometry-kernel/src` returns only the path-name hit `producers/window.js` (false positive). ESLint `pryzm/no-three-in-kernel: error`. |
| **P2 — Scene Committer is the only THREE seat** | ✅ | ESLint `pryzm/no-three-outside-committer: error` (eslint.config.js:219). |
| **P3 — Single rAF owner** | ✅ | ESLint `pryzm/no-raf: error` in production blocks; `warn` only in legacy `src/` and `legacy-shim`. The plan-view "rAF" hit is in a comment, not code. |
| **P4 — Append-only event log = SoT** | ✅ structurally | persistence-client exposes msgpack codec + storage drivers; auditing run-time singularity is out of scope here. |
| **P5 — Layer boundaries** | ✅ | `eslint-plugin-boundaries` declared as devDep at root; rule wiring exists. |
| **P6 — No globals** (`window as any` retired) | ❌ | grep finds **50+** live `window as any` sites in `apps/component-editor`, plus more in `apps/editor`'s migrations. ServiceRegistry retirement is incomplete. |

---

## 3. ADR / SPEC compliance signals

| Anchor | Status | Evidence |
| ------ | ------ | -------- |
| **ADR-001** Pascal patterns, no copy-paste | ✅ implied by file structure |
| **ADR-002** Dual-stream event-log + Yjs | ⚠ `packages/sync-client` exists; translator round-trip test not seen |
| **ADR-004** msgpackr deterministic wire | ⚠ codec is `@msgpack/msgpack`, **not** `msgpackr` — verify whether ADR-004 was amended (msgpackr vs msgpack-javascript matters for performance and pre-registered structures). **Likely drift.** |
| **ADR-005** browser worker pool ≤ 4 | ⚠ no `packages/worker-pool-browser` discovered (the spec name); unclear which package owns this — possibly merged. |
| **ADR-006** WebGPU first, GL2 fallback, SSIM ≥ 0.998 gate | ⚠ `packages/renderer` present; visual-diff CI gate not visible |
| **ADR-010** 250 ms bake debounce | ⚠ structurally present; constant not grepped in bake-worker source |
| **ADR-013** event-log + R2 chunks | ✅ structurally; manifest naming convention not grep-confirmed |
| **ADR-020** kernel robustness budget | ⚠ kernel uses `manifold-3d` (root dep); `fast-check` property tests not wired in CI |
| **ADR-022** Node 20 LTS pin | ⚠ root `engines.node` is `>=20.0.0 <23.0.0` (correct band) but env runs Node 24 in some shells; one transitive `camera-controls@3.1.2` requires Node ≥ 22 — engine drift to fix. |
| **ADR-023** library rAF quarantine | ✅ `packages/legacy-shim` carries the carve-out; ESLint exception scoped to it. |
| **ADR-025** three.js exact pin | ❌ root spec is `^0.183.2`; lock has **three @ 0.173.0, 0.176.0, 0.183.2** simultaneously. ADR explicitly forbids `^`/`~`. **Critical.** |
| **ADR-026** React-free editor bundle | ✅ for `apps/editor` (no react in deps, no react imports in `src/`); ❌ for the legacy `src/` (still 2 React files), which is what `vite.config.ts` and `server.js` actually serve today. |
| **ADR-028** no `service_role` in app code | ✅ only 2 hits, both in benches/reports. |
| **SPEC-01** geometry-kernel separation | ✅ |
| **SPEC-02** `.pryzm` zip + manifest-first | ✅ `zip-deterministic.ts` + `canonical-json.ts` present. |
| **SPEC-10** OTel L0–L3 spans | ⚠ `packages/observability` not present under that name; `@opentelemetry/api` is a root dep but no per-layer span audit. |
| **SPEC-11** 95% kernel coverage gate | ❌ no coverage-threshold gate seen in any wired workflow. |
| **SPEC-12** initial bundle ≤ 1.8 MiB gzip | ❌ no bundle-size CI gate. |
| **SPEC-21** 9-step canonical recipe + `canonical.json` per family | ❌ **`find plugins -name 'canonical*'` returns nothing.** Mandated by SPEC-21 for every family. |
| **SPEC-26** `.pryzm` v1 format | ✅ |
| **SPEC-29** vector primitives | ⚠ `packages/drawing-primitives` exists; depth not audited |
| **SPEC-30** plan-view performance / VI | ⚠ `packages/visibility` is a partial port (Phase-1 doesn't require closure) |
| **SPEC-31** load-bench batch tiers | ⚠ `apps/bench` exists; tier curves not visible |
| **SPEC-48** constraint solver | ⚠ `packages/constraint-solver` exists; `planegcs` adoption is Phase-3A per spec — out of Phase-1 scope. |

---

## 4. Validation / CI hygiene

The 14 workflows in `.replit` were inspected. Three are broken
post-merge:

| Workflow | Symptom | Root cause |
| -------- | ------- | ---------- |
| `bake-worker-test-geometry` | finishes "deferred" instead of running | path `packages/bake-worker` does not exist; package lives at `apps/bake-worker`. The `\|\| echo` masks the failure. |
| `pryzm-persistence` | `bash: cd: packages/persistence-client: No such file or directory` | path **does** exist on disk now; the workflow was last run before the workspace was fully present and has not been re-run. **Restart needed**, not a code fix. |
| `pryzm-vi-parity` | same as above for `packages/visibility` | same. **Restart needed.** |
| `audit-log-middleware` | `bash: cd: tests/audit-log-s57: No such file or directory` | path **does** exist on disk now. **Restart needed.** |

Beyond fixing the path drift in `bake-worker-test-geometry`, none of
these failures imply a code regression — but they do mean the
"Project" parallel workflow does not currently produce a green status,
which undermines confidence that Phase-1 invariants are continuously
enforced.

---

## 5. Strangler-fig honesty

This is the most important piece of Phase-1 framing the docs do not
spell out clearly:

- The default `npm run dev` workflow runs `node --import tsx server.js`
  (the legacy PRYZM-1 server) which uses the root `vite.config.ts`
  (the legacy editor that scans `public/items/` and renders the
  marketing landing page seen in the preview).
- The PRYZM-2 stack lives in `apps/editor/` with its own
  `vite.pryzm2.config.ts`, `bootstrap.everything.ts`, and depends on
  every M4–M9 plugin via workspace deps.
- The crossover point (the `?pryzm2=1` flag) is described in M3 as the
  alpha-gate entry, but there is **no live evidence** that the flag
  works end-to-end against the currently-served bundle.

For an "M12 alpha-gate green" signal, the Project workflow needs an
explicit step that boots the PRYZM-2 surface (either as a second
served bundle or via the flag) and exercises the wall+slab fixture in
`apps/headless`. Today, we cannot prove from the running app alone
that PRYZM-2 boots — only that PRYZM-1 still works.

---

## 6. "Best BIM authoring tool in the browser" — forward-looking gap analysis

These are gaps that go *beyond* Phase-1 acceptance but are the
difference between "alpha that runs" and "the tool that wins". They
are framed against the SPEC/ADR set and current public competitors
(Forma, Qonic, Motif, Pascal, Snaptrude).

### 6.1 Determinism & file-format trust (the silent killer)

- **Multiple `three` versions in `pnpm-lock.yaml` (0.173, 0.176, 0.183)
  destroy the visual-diff guarantee** ADR-006 and ADR-025 are built
  on. A single floating dep can change frustum culling or material
  serialisation between developer machines and break "open the same
  `.pryzm`, get the same render".
  **Fix**: pin `three` exactly; add a `pnpm overrides` block forcing
  one resolved version; add a CI gate that fails if `pnpm why three`
  returns more than one row.

- **`canonical.json` per family is missing.** SPEC-21's 9-step recipe
  treats it as the cryptographic anchor for "this family produced
  these bytes". Without it, every plugin is a black box and the
  parity snapshot suite cannot ratchet.
  **Fix**: 1 PR per family adding `__fixtures__/canonical.json` +
  `__tests__/canonical.test.ts` that re-bakes and diffs.

- **msgpack vs msgpackr.** ADR-004 names `msgpackr` for its pre-
  registered struct path (≤ 256 B median per event). The codec in
  use is `@msgpack/msgpack`, which does not have struct registration.
  This will show up at scale in event-log size and in cross-language
  parity (Node bake worker vs. browser).
  **Fix**: either ratify the change in an ADR amendment or migrate to
  msgpackr behind a feature flag.

### 6.2 Performance budgets that do not yet bite

None of these gates fail CI today — they are written but not wired:

- 1.8 MiB initial gzip (SPEC-12).
- ≤ 33 ms edit-to-paint latency (target arch §perf).
- ≤ 800 ms small cold-load (M6 acceptance).
- 60 fps orbit with full Post-FX (M8 acceptance).
- 50 ms client-server-client round-trip (M11 acceptance).
- 0 fps idle (P3 acceptance / `idle-zero-fps.test.ts`).

A "best-in-class" tool needs each of these enforced as a **failing**
status check on PRs, not a deferred test. Forma and Qonic both
publicly publish their cold-load numbers; Pryzm should too.

### 6.3 Authority & edit safety

- `(window as any)` count is still ~50+, mostly in
  `apps/component-editor`. P6 (no globals) is the spec, but the path
  to the typed `ServiceRegistry` is incomplete. Until then, plugins
  can scribble on global state without the command bus knowing.
  **Fix**: add `pryzm/no-window-any` ESLint rule (with a one-time
  carve-out list) and burn the list down.

### 6.4 Sync, locks, presence

- Phase-1 ratifies LWW linearisation only; full Yjs is Phase-2D. That
  is correct per spec — but the **soft-lock semantics** (ADR-019) are
  what protect users from each other in the alpha. Without them, the
  first multi-user demo will produce data loss. Worth a Phase-1.5
  patch that ships the lock service and a "you are editing this"
  badge, even if CRDT itself slips.

### 6.5 IFC round-trip credibility

- `plugins/ifc-import/export/inspector` exist and use `@thatopen/*`.
  **buildingSMART certification (ADR-035, SPEC-40) is Phase-3B.**
  However, for "best-in-class browser BIM authoring" credibility
  *now*, you want a published IFC4 round-trip self-test on every PR
  (open IFC4 sample files, export, diff entity counts and pset
  values). The infrastructure is there in `plugins/ifc-export/__tests__`
  — wire the result into the public README badge.

### 6.6 AI integration vs. the browser-native promise

- The current dev server proxies AI through a Cloudflare Worker
  (`CF_WORKER_URL` env). That is a real production choice but is at
  odds with the "browser-native, self-hostable" identity in
  06-PRYZM-IDENTITY when the relay belongs to one operator. For the
  open-source story, ship a one-page guide for "point Pryzm at your
  own AI gateway / OpenAI key" and gate the relay default behind an
  explicit flag.

### 6.7 Drawing engine (SPEC-04 / SPEC-29)

- `packages/drawing-primitives` exists but the **direct PDF backend**
  (no SVG indirection) is on the SPEC-29 critical path for sheets &
  annotations. This is where Revit's lead is largest. Phase 2C is the
  scheduled slot — no Phase-1 action needed, but a vector-primitive
  parity bench should land in M12 so M16 inherits a baseline.

### 6.8 Geometry kernel robustness at scale

- `manifold-3d` is in deps; ADR-020 mandates `fast-check` property
  tests for wall miters and slab booleans. The tests are not visible
  in any wired workflow. A failing CI gate on 1000 randomised wall
  joins is a much stronger acceptance signal than the existing
  snapshot suite.

### 6.9 Observability & cost

- `@opentelemetry/api` is a dep; SPEC-10 specifies layered spans with
  a $0.50/editor/month budget. There is no `packages/observability`.
  Without spans, the "edit-to-paint < 33 ms" claim cannot be
  monitored in the wild — only in benches. Add the package and the
  span lint gate (P8) before alpha users arrive.

### 6.10 Self-host + sovereignty (a competitive moat)

- `pryzm-selfhost/` exists. SPEC-15 (deployment topology) and
  SPEC-34 (hybrid sovereignty) are the differentiator vs. Forma /
  Motif. For Phase-1 alpha, document a single-VM `docker compose`
  that boots the editor, sync-server, bake-worker, and persistence
  against a local Postgres. This is achievable without code change
  and is the loudest signal that "self-host" is real.

---

## 7. Concrete next-actions list (ordered by ratio of impact to effort)

1. **Fix `bake-worker-test-geometry` workflow path** (`packages/` →
   `apps/`) and remove the `|| echo` mask. *Trivial.*
2. **Restart `pryzm-persistence`, `pryzm-vi-parity`,
   `audit-log-middleware`** to clear stale failures from the import
   sequence; if they then truly fail, file as Phase-1 bugs. *Trivial.*
3. **Pin `three` exactly** at the highest `0.183.x` already in tree
   and add `pnpm overrides` to dedupe; add the
   `pnpm why three === 1 row` CI check. *Half a day.*
4. **Add `canonical.json` + `canonical.test.ts` per family** (12
   plugins). *2–3 days.*
5. **Wire bundle-size, idle-fps, and cold-load gates** into the
   Project workflow as failing checks. *2 days.*
6. **Reconcile msgpack vs msgpackr** with an ADR amendment or a
   migration. *1 day for the amendment, 1 sprint for the migration.*
7. **Add a Project-workflow step that boots the PRYZM-2 surface**
   (`apps/editor` with `vite.pryzm2.config.ts`) and asserts the
   `?pryzm2=1` route renders the M3 cube. *1 day.*
8. **Burn down `(window as any)` with a typed `ServiceRegistry`** and
   add `pryzm/no-window-any: error`. *1 sprint, ratchet.*
9. **Publish a one-VM docker-compose self-host story** in
   `pryzm-selfhost/`. *2–3 days.*
10. **Land an IFC4 round-trip self-test badge** using the
    `plugins/ifc-export/__tests__` infra. *2 days.*

Items 1–3 should ship before any external "alpha" claim. Items 4–7
are the M12 alpha-gate cap-stone. Items 8–10 are the credibility
package.

---

*End of audit. — 2026-04-28*
