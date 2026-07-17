# 02 — Evidence map: the job spec → your code

Every requirement in the ad, mapped to something you can **point at**. All file paths verified in this repo.

> **Rule:** never say "I have experience with X." Say "I did X — it's in `file.ts`, and here's the number."

---

## Requirement 1 — Three.js & WebGL: scene management, geometry interaction, camera controls, rendering optimisation for complex 3D models

**Verdict: you exceed this comfortably. This is your strongest requirement.**

| Sub-requirement | Your evidence | Where |
|---|---|---|
| Scene management | Single-THREE-owner rule; `import * as THREE` legal in **one** package, CI-enforced | `packages/renderer-three/`, `check-three-imports.ts` |
| | Scene-graph layer bitmask: `BIM_LAYER=0`, `EDITOR_LAYER=1` (helpers excluded from print), `ANNOTATION_LAYER=2` (plan cameras disable it) | `packages/scene-committer/src/SceneLayers.ts` |
| | A scene-committer owns THREE object lifecycle (registry, classifier, material pool, LOD, coalescer) | `packages/scene-committer/src/` |
| Geometry interaction | **GPU colour-ID picking**, 1,599 LOC: parallel pick scene, `encodeIndexToRGBA(slot)`, 1×1 render target, `readPixels`, decode → element id. Rect-pick widens to N×N for marquee | `packages/picking/src/gpu-pick.ts` |
| | **Depth readback** via `packDepthToRGBA` + `unpackRGBAToDepth`, NDC → world | same file |
| | **Driver-health probe**: renders a known id and asserts the readback decodes to it (catches a Mesa silent-zero bug), else falls back to BVH picking | `PickStrategyResolver.ts` |
| | CPU fallback: `three-mesh-bvh`, `acceleratedRaycast` patched onto `Mesh.prototype.raycast`, per-element BVH cached by hash, **headless-capable** | `packages/picking/src/bvh-pick.ts` |
| | Snapping: 11 providers with typed priorities | `packages/snapping/src/SnapManager.ts` |
| | Gizmos + constrained drag controllers | `packages/input-host/src/gizmo/` |
| Camera controls | **Hand-rolled** spherical orbit camera (yaw/pitch/distance), pitch clamped so it can't invert; deliberately *not* `OrbitControls` — to hold a 1.8 MB bundle ceiling | `packages/renderer/src/CameraController.ts` |
| | Ortho **plan lock** — rotation disabled, `up` vector saved/restored, re-locked on projection switch so a plan can't be tumbled | `OrthoPlanCameraLockController.ts` |
| | Camera interpolation on plain `Vec3Like` poses so view-state never imports THREE | `packages/view-state/src/ViewController.ts` |
| Rendering optimisation | **See [03-THREEJS-WEBGL-PLAYBOOK](./03-THREEJS-WEBGL-PLAYBOOK.md)** — instancing, coalescing, culling, LOD, quality tiers, shadow budgets, chunking, dirty-checking | many |

---

## Requirement 2 — LLM orchestration + LLM APIs, context engineering, production-grade AI features

**Verdict: strong on *production AI systems*, zero on *the named frameworks*. Handle deliberately.**

| Sub-requirement | Reality | Where |
|---|---|---|
| LLM API integration | ✅ **Anthropic Claude** (haiku + sonnet), server-proxied so the client never holds a key | `server.js:888`, `packages/ai-host/src/CfWorkerRelay.ts` |
| | ✅ **Multimodal**: base64 image blocks — floor-plan raster → BIM | `AIElementFactory.ts:415-442` |
| Orchestration | ✅ **Hand-rolled and rigorous**: `AiPlane` (bus, cost meter, workflow registry, approval queue, response cache) | `packages/ai-host/src/AiPlane.ts` |
| | ✅ Hexagonal **port/adapter** for the relay + a `MockAnthropicRelay` double, so the whole AI path is testable offline | `AnthropicRelay.ts` |
| | ❌ **No LangChain. No LlamaIndex.** | — |
| Context engineering | ✅ **Self-healing retry**: validate → on failure feed the *specific violations* back into the next prompt (`PREVIOUS ATTEMPT FAILED — fix these: …`), ≤3 attempts, then score + rank | `workflows/apartmentLayout/generate.ts:109` |
| | ✅ **Fan-out**: 3 style-tagged prompts (Minimal/Efficient/Generous) in parallel, costs summed | `Generate3Options.ts` |
| | ✅ **Output coercion by prompt contract**: *"STRICT JSON ONLY (no prose)"* + a **JSON repairer** that bracket-stack-completes `max_tokens`-truncated objects | `JSONRepair.ts` |
| | ❌ No tool-use / function-calling, no streaming, no RAG/embeddings | — |
| Production-grade | ✅ **Cost governance**: token→USD meter, per-plan budgets, **hard $0.18 per-call ceiling enforced at workflow-registration time**, refunds, OTel counters, an append-only spend ledger | `packages/ai-cost/src/CostMeter.ts`, `packages/ai-spend/` |
| | ✅ **Response cache** keyed by SHA-256 of `{workflow, input}` — a cache hit skips budget, call, and cost recording | `AiPlane.ts:115-158` |
| | ✅ **Human-in-the-loop is architectural**: proposals ride an AI bus, *never* the command bus, and land in an approval queue; only on approval do they commit — as **one batch = one undo entry** | `AiPlane.ts:29-31`, `aiHostBridge.ts` |
| | ✅ Server hardening: forced model id (client can't pick a premium snapshot), token clamp, byte cap, auth, quota → 429 | `server.js:880-921` |

---

## Requirement 3 — Python + Flask/FastAPI, REST APIs

**Verdict: this is your gap. Zero Python in the repo. See [06](./06-PYTHON-FASTAPI-CADQUERY.md).**

| Sub-requirement | Reality |
|---|---|
| Python | ❌ **Zero.** No `.py`, no `requirements.txt`, no `pyproject.toml`. Do **not** claim it. |
| FastAPI / Flask | ❌ None. |
| **REST APIs** | ✅ **Yes, genuinely** — a versioned REST surface (`server/api/v1/routes.js`), auth middleware, RBAC, rate limiting, **OpenAPI generation** (`pnpm run gen:openapi`), Postgres data layer. |
| The bridge | ✅ **Schema-first request validation with Zod** — which is *exactly* Pydantic's role in FastAPI. Say this. |

---

## Requirement 4 — DevOps: Git, Docker, CI/CD

**Verdict: solid, with real depth.**

| Sub-requirement | Evidence | Where |
|---|---|---|
| Docker | Multi-stage (`builder` → `runtime`) on `node:20-bookworm-slim`, pinned pnpm, `--prod` install, **non-root user**, HEALTHCHECK, a `LOWMEM` build arg for memory-starved runners | `Dockerfile` |
| CD | **Fly.io, blue-green deploy**, `min_machines_running = 1` (no cold starts), OTel service name | `fly.toml` |
| CI | GitHub Actions: `lint`, `isolation`, `command-manager`, `test-server`, **`ga-gate` (P1–P8 + perf budgets)**, `build`, `apex-gates`, `a11y` (axe-core WCAG 2.2 AA), and a **`docker-image` job that builds the Fly image and boot-smokes it** for parity | `.github/workflows/ci.yml` |
| Architecture as CI | **`eslint-plugin-boundaries`** enforces the L0→L7 import DAG; a custom in-repo `eslint-plugin-pryzm`; a lint rule banning `requestAnimationFrame` outside the scheduler | `eslint.config.js` |
| Testing | Vitest (200+ spec files in `ai-host` alone) + Playwright E2E + a browser matrix | `playwright.config.ts` |

**The line worth saying:** *"I enforce architecture in CI, not in code review. The layer graph, the single-THREE rule, the single-rAF rule — they're lint rules that fail the build. Convention that isn't enforced is just folklore."*

---

## Requirement 5 (nice-to-have) — CAD kernels, 3D modelling

**Verdict: you have this — but state it precisely. See [05](./05-GEOMETRY-CAD-KERNELS.md).**

- ✅ **`manifold-3d` (WASM)** — union/subtract/intersect, lazily imported (~600 KB). `packages/geometry-kernel/src/csg/KernelCSG.ts`
- ✅ **Kernel producers**: extrude, revolve, sweep, loft, boolean, section-cut, hidden-line — all THREE-free and worker-runnable. `packages/geometry-kernel/src/producers/`
- ✅ **A robustness contract** (ADR-0220): typed `Result.err(KernelError.NonManifold)` instead of crashes, and **property tests** — two walls at θ ∈ [1°,179°], t ∈ [50,600] mm must be manifold with area within 1% of analytic — **as a merge gate**.
- ✅ **Interop**: IFC4X3 export + import, DXF, glTF/GLB, PDF→BIM.
- ⚠️ **OpenCASCADE**: a *documented reserved swap path* for NURBS/B-rep. **No dependency exists. Never claim it.**

---

## The five things you must never claim

1. ❌ OpenCASCADE experience → say *"manifold-3d; OCC.js is our documented swap path if we need NURBS."*
2. ❌ Zod-validated LLM output → it's `JSONRepair` + bespoke validators.
3. ❌ Tool-calling / streaming / RAG → none. Say what you'd do instead (native structured output).
4. ❌ LangChain / LlamaIndex → hand-rolled, deliberately.
5. ❌ Python → zero.
