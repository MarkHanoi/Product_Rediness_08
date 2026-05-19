# Flow 1 — Landing First Paint Baseline

> **Sprint**: Wave 4 closeout (Flow 1 wires-in-place, 2026-04-30)
> **Captured**: 2026-04-30
> **Hardware**: Replit Linux container ; Node v20.20.0 ; shared CPU
> **Bench harness**: `apps/bench/src/benches/landing-first-paint.bench.ts` (vitest run)
> **Source spec**: `docs/03_PRYZM3/04-PLAN-FORWARD/04-END-TO-END-FLOWS-AND-COVERAGE.md` §1 Flow 1 (NFT-1 verifier).
> **Companion**: in-browser wall-clock harness ships with `apps/editor-bench/` (Wave 13); the entry below is the headless proxy.

---

## bench: landing-first-paint
- **sprint**: Wave 4 — Flow 1 closeout
- **timestamp**: 2026-04-30T11:50:00Z
- **hardware**: linux x64 ; node v20.20.0 ; shared CPU
- **samples**: 20
- **p50**: 0.59 ms
- **p95**: 4.00 ms
- **p99**: 4.00 ms
- **target**: ≤ 50 ms warn / ≤ 100 ms budget (headless proxy, see notes)
- **status**: green
- **notes**: Cold `composeRuntime({ canvas: null })` — the JS-bundle-mount leg of the four-stage landing flow (HTML parse → skeleton paint → JS bundle mount → first runtime tick). Wall-clock NFT-1 ("≤ 2.5 s on M1/Chrome 130/throttled fast 4G") is measured in-browser by `apps/editor-bench/` (Wave 13); this Vitest harness gates the headless decomposition that the in-browser tool cannot isolate. Warn-only in `baseline.json` until Wave 13 lands.
