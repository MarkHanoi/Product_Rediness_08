# NFT-1 Cold-Boot Baseline (headless proxy)

> **Sprint**: 2026-04-30 closeout-rectification (audit follow-up)
> **Captured**: 2026-04-30
> **Hardware**: Replit Linux container ; Node v20.20.0 ; shared CPU
> **Bench harness**: `apps/bench/src/benches/cold-boot.bench.ts` (vitest run)
> **Source spec (canonical)**: `01-VISION.md §5` row 1 — NFT 1: "Cold-boot to first paint < 2.5 s on M1 / Chrome | `apps/bench/cold-boot.ts`".
> **Source spec (anchor)**: `02-ARCHITECTURE.md §6` line 130 — three-stage boot pipeline (Stage 0 App-Shell paint / Stage 1 runtime composition / Stage 2 engine init on project open) confirms NFT-1 budget.
> **Source spec (per-step refinement)**: `chunks/22 §22.1` step 1.1 — "LCP < 600 ms" sub-budget for the landing paint, served by the in-browser `bench/ui/landing-paint.bench.ts` (Wave 13 — `apps/editor-bench/`, NOT this file).
> **Replaces**: `flow-1-landing-first-paint-baseline.md` (deleted) — the earlier file used the distilled-doc name; per conflict-resolution order 01-VISION wins on canonical bench naming.

---

## bench: cold-boot
- **sprint**: 2026-04-30 closeout-rectification
- **timestamp**: 2026-04-30T11:55:00Z
- **hardware**: linux x64 ; node v20.20.0 ; shared CPU
- **samples**: 20 (after 3 warmups)
- **p50**: 0.59 ms
- **p95**: 4.00 ms
- **p99**: 4.00 ms
- **target**: ≤ 50 ms warn / ≤ 100 ms budget (headless proxy — see notes)
- **status**: green
- **notes**: Cold `composeRuntime({ canvas: null, audit, pluginContributions: [] })`. This is Stage 1 of the three-stage boot pipeline only (`02-ARCHITECTURE §6`); Stage 0 (App-Shell paint < 100 ms HTML-parse-only) is browser-side and Stage 2 (engine init on project open) is deferred to `runtime.persistence.openProject(id)`. Wall-clock NFT-1 ("< 2.5 s on M1 / Chrome", `01-VISION §5`) and the per-step LCP sub-budget ("< 600 ms", `chunks/22 §22.1` step 1.1) are measured in-browser by `apps/editor-bench/` (Wave 13). Sanity assertions in this bench file additionally verify the canonical `runtime.scene` shape (4 readonly fields per `chunks/02 §2.2`) and the canonical `runtime.persistence.openProject` surface (per `02-ARCHITECTURE §6 Stage 2`) — these are the shape invariants any future `composeRuntime` refactor must preserve for Flow 1 / Flow 2 to remain wireable.
