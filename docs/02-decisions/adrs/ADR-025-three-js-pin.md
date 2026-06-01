# ADR-025 — Three.js Version Pin & WebGPU Path

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `GAP-REVIEW-2026-04-27.md §29 #16` (THREE r140+ pin not declared; WebGPURenderer maturity unknown) |
| Required by | Sprint S31 (Phase 2B start — renderer-package boundary lock; Phase 2A holds no gap-closure work per 2026-04-27 directive) |
| Owner | Architecture lead |
| Implementation | `packages/renderer/three.ts`; `pnpm-lock.yaml` |
| Spec dependency | `[strategic ADR-006]` (default render mode); SPEC-12 |

---

## Context

`[strategic ADR-006]` decided **WebGPU when available, WebGL2 fallback**. Behind both is `three`, the workhorse renderer. `three`'s WebGPU support has been **experimental → preview → production-ready** across r152..r172 and the API has shifted (e.g. `WebGPURenderer` exports moved between `three/examples/jsm/` and the core, `nodeMaterial` added). Without a pinned version, our renderer code can break on any `pnpm update`.

The legacy code uses `three@0.169.0` and works. Phase 2 needs a pin that:
- Keeps WebGL2 stable (the fallback path).
- Has WebGPU production-ready or near-production-ready (the default path on capable browsers).
- Doesn't churn between sprints.

---

## Decision

### Part A — pin

```json
"three": "0.169.0"
```

(matches the version that survived the Phase 1 audit unchanged). Pin via exact version — **no `^` or `~`**.

CI gate `pnpm spec:dep-pin three` asserts the pin is exact in every workspace package. This is a release-gate check at S31 onward.

### Part B — upgrade cadence

`three` is upgraded **only** at quarterly review boundaries:
- S31 → S37 → S49 → S61 → S72.
- An upgrade requires:
  - Visual-diff CI matrix green (per SPEC-11).
  - Bench regressions ≤ 5% on `apps/bench/render-*.ts`.
  - WebGPU smoke E2E green on Chromium + Firefox + Safari.
- A failed upgrade reverts; the prior pin holds for the quarter.

### Part C — WebGPU adoption gate

WebGPU is the default render mode **only when** the bench `webgpu-feature-readiness.ts` passes for the candidate `three` version. The bench checks:
- Compute shader support (for plan-view BVH classifier; per SPEC-30 §3.2).
- MSAA availability.
- Fragment-shader uniform buffer alignment.
- Texture-format compatibility for KTX2.

If any check fails, the default falls back to WebGL2 for that release; WebGPU remains opt-in via `?webgpu=1`.

### Part D — `three/examples/jsm/` discipline

`three/examples/jsm/` is **not API-stable** between minor versions. Every `from 'three/examples/jsm/...'` import lives in `packages/renderer/three.ts` and is re-exported behind a stable PRYZM-owned interface. Other packages import from `packages/renderer/`, never directly from `three/examples/jsm/`.

ESLint rule `pryzm/no-direct-three-examples` lit at S31 (warning), S32 (error).

### Part E — WebGPU compute uses

The plan-view classifier (per SPEC-30) is a candidate for compute-shader acceleration. The decision: **WebGL2 implementation ships at S35; WebGPU compute version is post-GA**. Reason: cross-browser WebGPU compute is not uniformly mature in 2026; we ship the safe path and add the compute path later as a perf optimisation.

---

## Consequences

**Positive:**
- Renderer package is insulated from `three` API churn.
- Visual-diff matrix gates upgrades; no surprise regressions.
- WebGPU adoption is data-driven (bench-gated), not vibe-driven.
- The `three/examples/jsm/` boundary is a single file; refactors are localised.

**Negative:**
- Slower to pick up new `three` features; we trade novelty for stability.
- Pinning means we manually evaluate security advisories on `three` (low risk; `three` has no auth/network surface).

---

## Alternatives considered

### A1 — Pin to latest minor (e.g. `^0.169`)
Rejected: `three` minor bumps have broken `WebGPURenderer` imports historically. Exact pin only.

### A2 — Vendor `three` into `packages/renderer/three-vendor/`
Rejected: vendoring `three` is ~3 MiB; not worth it for a quarterly pin discipline.

### A3 — Switch to Babylon.js
Rejected: legacy is `three`; switching renderer mid-flight = months of work for no Phase-2 benefit.

---

## Phase rollout

- S31 — pin asserted (Phase 2B start; Phase 2A holds no gap-closure); ESLint rule warning level; visual-diff baseline captured at `three@0.169.0`.
- S32 — direct-`three/examples/jsm` imports rule promoted to error.
- S37 (Phase 2C end) — first quarterly upgrade window; candidate version tested.
- S49 (Phase 3A) — WebGPU readiness re-evaluated; default toggle re-decided.
- S55 — OBC removed → `three` shared deps simpler; upgrade window.
- S65 — WebGPU compute investigation for post-GA SPEC-30 acceleration.
- S72 (M36 GA) — `three` pin + render mode default both reviewed.
