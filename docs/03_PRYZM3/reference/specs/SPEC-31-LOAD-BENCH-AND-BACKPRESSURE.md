# SPEC-31 — End-to-End Batch-Creation Bench, AI-Batch Back-Pressure, and Production-Scale Fixture Schedule

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead + Bake-worker lead + AI-host lead |
| Closes | Founder robustness amendment 2026-04-27: (a) the missing end-to-end batch-creation bench; (b) under-specified AI-batch back-pressure curve; (c) too-late production-scale fixture validation (S69) |
| Phases | 1B (originating bench scaffold), 1D (bake worker), 2A (rooms/structural batch creates), 2B (plan-view bench coupling), 2C (sheet/schedule), 2D (AI host + back-pressure), 3A (full AI), 3D (largest-fixture re-validation) |
| Replaces / extends | SPEC-30 §2 (plan-view perf budget); ADR-005 §39 (worker-pool first-paint priority); ADR-010 (bake debounce) — none replaced; this SPEC adds end-to-end and back-pressure bindings on top |

> The 250 ms coalescing window (`[strategic ADR-010]`), the worker-pool policy (`[strategic ADR-005]`), and the persistence-operational ADR (`[strategic ADR-013]`) define the *mechanism* by which batch creation, project open, and AI commit avoid main-thread freeze. This SPEC is the *binding contract* that proves they actually do, with three deliverables: an end-to-end batch-creation bench (§2), a back-pressure curve for AI emission into the bake queue (§3), and a phased schedule for the 10K-wall × 50-level fixture (§4) so quadratic regressions cannot hide for six months.

---

## §1 Why this SPEC exists

The 2026-04-27 founder review of GAP-REVIEW §243 + the "180-element batch creation freezes screen" pain point in PRYZM 1 surfaced three robustness gaps in the existing SPEC/ADR set:

1. **No end-to-end bench** measures wall-clock from "user pointer-up that emits N events" to "last bake chunk on screen." `produce-wall.bench.ts` covers per-element kernel cost. `bake-incremental.bench.ts` covers a single edit. `commit-100-cubes` covers the committer. `idle-cpu` covers the renderer. **Nothing covers the composition.** A regression that adds 100 ms per element through the committer→coalesce→bake→upload chain would pass every existing bench and still produce a 30-second freeze on the user's 12 × 15 wall array.

2. **AI-batch back-pressure is implicit, not contractual.** ADR-010 §46 says "hard cap 1500 ms prevents indefinite starvation during sustained AI batches." ADR-005 §44 caps server worker_threads at `min(8, max(2, cpus-1))`. BullMQ has built-in back-pressure on queue depth. None of these compose into a documented, testable, version-pinned contract: "if the bake queue depth exceeds N, the AI host pauses emission for M ms." Without that contract, the AI floor-plan import path (S50) and the AI generative path (S51) can each, independently, blow the queue.

3. **Production-scale fixture only at S69.** `08-VISION.md §6` and PHASE-3D `§S69` validate the 10K-wall × 50-level largest fixture only at month 35, six months after the AI layer ships at S50–S54 and four months after the marketplace opens at S62. A quadratic regression introduced at S43 (CRDT bridge) or S50 (AI batching) will not be caught by the existing fixtures (5K elements / "torture" tier in SPEC-30 is 4× smaller than production scale on the wall axis and 10× smaller on the level axis). This is six months of compounded risk.

This SPEC closes all three gaps with binding contracts, bench wiring, and a sprint schedule that lands each as soon as the substrate exists to test it.

---

## §2 End-to-end batch-creation bench (`apps/bench/src/benches/batch-create-e2e.bench.ts`)

### §2.1 The contract

A single bench that measures **wall-clock time from `tool.commit()` (pointer-up that emits N events) to `committer.lastChunkUploaded` event for the last affected chunk**, on a freshly-loaded project.

| Workload | N events | Description | Hard-fail gate |
|---|---|---|---|
| Tiny | 12 | 12 walls × 1 level (single-room boundary) | < 600 ms p95 |
| Small | 60 | 12 walls × 5 levels (small office floor stack) | < 1.5 s p95 |
| **Founder pain-point** | **180** | **12 walls × 15 levels (mid-rise array, the user's PRYZM 1 freeze case)** | **< 3 s p95** |
| Medium | 600 | 60 walls × 10 levels (full floor with internal walls) | < 6 s p95 |
| Large | 6,000 | 60 walls × 100 levels (high-rise array; AI floor-plan stress proxy) | < 30 s p95 |

### §2.2 What the bench measures (instrumented spans)

The bench records each phase as a separate OTel span and asserts the per-phase budget:

| Span | Phase | Per-phase budget at the **180-element** workload |
|---|---|---|
| `pryzm.tool.commit-batch` | Tool emits N events | < 50 ms |
| `pryzm.command-bus.execute-batch` | N command-bus dispatches (per-tick batched per `[strategic ADR-010]` §44) | < 200 ms |
| `pryzm.kernel.produce-batch` | Worker pool produces N geometries (4 workers in parallel) | < 1.5 s |
| `pryzm.committer.commit-batch` | Per-tick committer publishes to scene-cache | < 200 ms (across 2–3 ticks, ≤ 8 ms per tick per `commit-100-cubes` gate) |
| `pryzm.bake.coalesce` | 250 ms trailing-edge debounce + chunk dirty-set union | exactly 250 ms (debounce) + < 10 ms (union compute) |
| `pryzm.bake.chunk` | Bake worker re-bakes K chunks (typically K ∈ [1, 4] for contiguous arrays) | < 600 ms p95 per chunk in parallel |
| `pryzm.persistence.chunk.write` | R2 write per chunk | < 200 ms p95 |
| `pryzm.loader.chunk.fetch` | Loader retrieves chunks (in-memory cache hit on local) | < 50 ms |
| `pryzm.renderer.upload-chunk` | Time-sliced upload, max 1/frame per ADR-010 §64 | < K * 16.67 ms |

**Sum check**: Σ(phases) ≤ workload gate; if any phase exceeds its share, `apps/bench/scripts/check-regression.mjs` reports the offending span explicitly.

### §2.3 Bench wiring

```ts
// apps/bench/src/benches/batch-create-e2e.bench.ts (skeleton — full impl S07-T11)
import { bench, beforeAll } from "vitest";
import { runBatchCreateScenario } from "../scenarios/batch-create-walls.js";
import { BATCH_CREATE_GATES } from "../gates/batch-create.js";

for (const tier of ["tiny", "small", "founder", "medium", "large"] as const) {
  bench(`batch-create-${tier}`, async () => {
    const result = await runBatchCreateScenario(tier);
    expect(result.totalMs).toBeLessThan(BATCH_CREATE_GATES[tier].totalMs);
    for (const span of result.spans) {
      expect(span.durationMs).toBeLessThan(BATCH_CREATE_GATES[tier].perSpan[span.name]);
    }
  });
}
```

### §2.4 Where the bench runs and gates

- **Browser tier** — runs in headless Chromium (Playwright). Hard-fails CI if any tier exceeds its gate by > 10% on calibrated CI hardware (ADR-007 §3 calibration tier).
- **Node tier** — runs the same scenario through `@pryzm/headless` against the in-process bake worker. Hard-fails CI on the same gates. The Node and browser p95 must agree within 30%; divergence > 30% indicates one path lost a worker hop or a transferable.
- **Replit-dev tier** — runs warn-only (Replit hardware is uncalibrated; gates flip to error only on calibrated CI per ADR-007 §3).

### §2.5 Activation schedule (warn → error)

| Sprint | Workload | Activation |
|---|---|---|
| S07 D5 | tiny + founder | warn-only (skeleton lands at first wall producer) |
| S08 D9 | tiny + founder | error on calibrated CI |
| S12 D9 | + small | error on calibrated CI |
| S21 D9 | + medium (bake worker shipped) | error on calibrated CI |
| S30 D9 | all five tiers (rooms + structural + lighting + plumbing + furniture in scope) | error on calibrated CI |
| S43 D9 | re-bench with CRDT bridge live (mp + Yjs op contention) | error on calibrated CI |
| S50 D9 | re-bench under AI-emission load per §3 | error on calibrated CI |
| S69 D7 | re-bench on 10K-wall × 50-level fixture per §4 | error on calibrated CI |

### §2.6 Anti-patterns this bench forbids

- Running only the per-element bench and asserting the composition is fine. (The gap that produced this SPEC.)
- Mocking the worker pool. The bench MUST drive a real `Worker` (browser) or `worker_threads` (Node).
- Mocking R2. The bench MUST hit MinIO (local) or a real R2 test bucket.
- Skipping the per-phase span check. Total time hiding a regressed phase is an anti-pattern.

---

## §3 AI-batch back-pressure curve

### §3.1 The contract

The AI host (`packages/ai-host/AiHost.ts`, S47) emits commands into the command bus. The command bus issues bake jobs to the bake worker via the coalescer (`apps/bake-worker/src/coalescing/CoalesceWindow.ts`, S21). Without back-pressure, an AI floor-plan import producing 1,000 wall events can:

- Saturate the bake queue (BullMQ default max-jobs = 1024; depth > 200 produces R2 write tail of 30 s+).
- Starve human-edit jobs (which share the same queue under per-project concurrency = 1 per `[strategic ADR-013]` §75).
- Trigger the 1500 ms hard cap on every batch boundary, defeating the 250 ms coalesce.

This SPEC pins a **stepped emission curve** between the AI host and the bake queue.

### §3.2 The four-step back-pressure curve

| Bake queue depth (per project) | AI host emission policy | Telemetry |
|---|---|---|
| 0 ≤ depth ≤ 20 | **Full speed**: emit as fast as the model returns commands. | `pryzm.ai.emission.full` |
| 21 ≤ depth ≤ 50 | **Soft pause**: emit at most 5 commands per 100 ms tick. | `pryzm.ai.emission.soft-pause` (counter + gauge) |
| 51 ≤ depth ≤ 100 | **Hard pause**: stop emission. Resume when depth ≤ 30 (hysteresis). | `pryzm.ai.emission.hard-pause` (gauge), span event `pryzm.ai.emission.paused` |
| depth > 100 | **Reject**: AI host returns 429 to the L7.5 caller; the AI batch is partially-applied with a documented `ai.batch.partial` event in the log. The user sees the approval queue with the partial batch + a "queue saturated, retry" affordance. | `pryzm.ai.emission.rejected` (counter), `pryzm.bake.queue.saturated` (gauge) |

Hysteresis matters: emission resumes at depth ≤ 30 (not ≤ 50) to avoid oscillation.

### §3.3 Composition with the 250 ms coalesce

The coalescer windows incoming events at 250 ms per chunk per `[strategic ADR-010]`. The back-pressure curve operates on the *bake queue* (post-coalesce). A 1,000-wall AI batch typically coalesces into ~40–80 chunk jobs (assuming ~15–25 walls per spatial chunk per ADR-010 §58). The "soft pause" threshold (50 jobs) is therefore reached on AI batches > ~1,250 walls — which is where the user-visible queue tail starts to matter. The threshold is tunable per the §3.5 calibration sprint.

### §3.4 The AI-batch boundary (composes with ADR-010 §48)

The AI host wraps every model invocation in a **batch envelope**:

```ts
interface AiBatch {
  batchId: ULID;
  parentEventId: ULID | null;
  emittedCount: number;
  expectedCount: number;          // model's declared event count
  policy: AiEmissionPolicy;       // current §3.2 step
  startedAt: number;
  completedAt: number | null;
}
```

The committer waits for `batchId` close + 250 ms before scheduling the affected chunks (ADR-010 §48). Combined with §3.2: the queue depth never crosses the soft-pause line during normal floor-plan import; only adversarial or massive-batch cases hit the hard pause.

### §3.5 Calibration

The thresholds (20 / 50 / 100, hysteresis at 30) are **defaults**. They are pinned by:

- `apps/bench/src/benches/ai-batch-emission.bench.ts` — synthetic AI emission at 1, 10, 100, 1,000 events/s into a real bake worker; measures end-to-end p95 vs queue depth.
- `apps/bench/src/benches/ai-batch-coexistence.bench.ts` — AI emission concurrent with human edit; measures human-edit p95 (must remain < 80 ms p95 per SPEC-30 §2 medium tier).
- Re-tune at S50 D5 once the AI floor-plan import lands. Threshold changes require a sprint-scoped ADR (`docs/architecture/adr/NNNN-ai-backpressure-tune.md`).

### §3.6 Anti-patterns this SPEC forbids

- Relying on BullMQ's built-in back-pressure (which is per-Node-process, not per-project).
- Throwing 429 from the bake worker to the AI host. The AI host is the gate; the bake worker is the consumer.
- Pausing emission without a hysteresis band. (Causes oscillation under sustained load.)
- Allowing the AI host to bypass the curve "for floor-plan import only." Every AI invocation goes through the same curve.
- Allowing per-project concurrency > 1 in the bake queue to "absorb" AI bursts. Per-project concurrency stays at 1 per `[strategic ADR-013]` §75.

---

## §4 Production-scale fixture schedule

### §4.1 The contract

The 10K-wall × 50-level fixture (`tests/fixtures/largest.pryzm`) MUST be exercised on the bake worker, the loader, and the end-to-end batch bench at **three checkpoints, not one**: M12 (Phase 1 close), M24 (Phase 2 beta), and M35 (S69, GA hardening). The M12 and M24 runs are warn-only; the M35 run is hard-fail.

### §4.2 The three checkpoints

| Sprint | Fixture run | Gates | Purpose |
|---|---|---|---|
| **S22 D9** (Phase 1D close) | Bake-worker only — re-bake the entire 10K-wall × 50-level fixture from a single seed event, measure per-chunk p95 and total wall-clock. | `bake.chunk` p95 < 1.5 s, total bake < 60 s, peak server RSS < 4 GiB. **Warn-only** at this checkpoint. | Catch quadratics in the bake worker before the AI layer lands (S50). |
| **S43 D5** (Phase 2D mid) | Full pipeline — load fixture, run §2 batch-create-large bench, run multi-user chaos harness with 5 simulated peers editing concurrently. | §2 large gate (< 30 s p95), CRDT chaos convergence < 5 s, peak browser tab RSS < 1.5 GiB. **Warn-only** at this checkpoint. | Catch quadratics in the CRDT bridge before AI ships (S50). |
| **S50 D5** (Phase 3A AI floor-plan import) | AI floor-plan import on a PDF that produces ~10K walls. End-to-end measurement from PDF upload to last chunk rendered. | AI batch emission stays within §3 curve, end-to-end < 90 s p95, no event dropped, approval queue UI usable. **Warn-only** at this checkpoint. | Catch quadratics in AI emission + back-pressure before the marketplace opens (S62). |
| **S69 D7** (Phase 3D GA hardening) | All three above runs + the existing PHASE-3D §S69 NFT bench suite + 4-hour memory-leak run. | All gates **error**; > 5% regression vs M24 baseline halts forward 3D work per K3-F. | GA gate. |

### §4.3 What the fixture is

`tests/fixtures/largest.pryzm` ships at S22 D1 with this composition:

- 10,000 walls (60% straight, 30% curved, 10% slanted).
- 50 levels (3.5 m typical, with 5 mezzanine-style half-levels at 1.75 m).
- 1,500 doors, 2,000 windows.
- 500 columns, 200 beams.
- 50 grids.
- 10 representative material assignments (concrete, drywall, glass, steel, wood, brick, plaster, stone, aluminium, composite).
- 1 grid alignment, 3 reference levels, 1 site context envelope.
- Realistic naming and parameter variance (not a uniform extrusion).
- Total `.pryzm` ZIP size budget: < 15 MiB compressed.

The fixture is generated by `apps/bench/scripts/generate-largest-fixture.ts` from a deterministic seed; regenerable on demand. The seed is committed to the repo. The output is not (it is built in CI from the seed).

### §4.4 The three gates the fixture defends

| Gate | What it catches |
|---|---|
| `bake.chunk` p95 < 1.5 s on 10K walls | Quadratic in the bake worker (e.g. O(n²) BVH rebuild on chunk re-bake) |
| `loader.cold-load.large` < 3 s | Quadratic in the tier-streamed loader (e.g. O(n²) chunk-manifest validation) |
| `idle-cpu` < 2% on a fully-loaded 10K-wall scene | Quadratic in the renderer (e.g. O(n²) frustum culling, missing BVH) |

### §4.5 Anti-patterns this SPEC forbids

- Substituting a smaller fixture and extrapolating. (The fixture must be physically run; extrapolation hides log-log curves.)
- Skipping the M12 / M24 checkpoints because they're warn-only. Warn-only means "does not block PR merge"; it does NOT mean "may be skipped." The bench must run and the report must be filed in `apps/bench/reports/M{N}-{phase}-largest.md`.
- Running the fixture only on the founder's M-class hardware. The CI calibration tier per ADR-007 §3 is the binding measurement.

---

## §5 OTel spans this SPEC adds (per `[strategic ADR-007]`)

- `pryzm.bench.batch-create-e2e` — input `(tier, eventCount)`; output `(totalMs, perSpanMs[], gateResult)`.
- `pryzm.ai.emission.policy-transition` — input `(fromPolicy, toPolicy, queueDepth)`; output `(durationMs)`.
- `pryzm.bake.queue.depth` — gauge (per project, per host).
- `pryzm.bench.largest-fixture-checkpoint` — input `(checkpoint, fixtureHash)`; output `(passed, gateMs[])`.

Every span carries the standard PRYZM 2 attributes per SPEC-10: `pryzm.project.id`, `pryzm.actor.id`, `pryzm.host.role` (browser / bake-worker / sync-server / ai-worker).

---

## §6 Cross-references

- `[strategic ADR-005]` worker-pool policy — defines the parallelism budget that §2 measures.
- `[strategic ADR-007]` telemetry backend — defines the calibration tier that §2.5 references.
- `[strategic ADR-010]` bake debounce — defines the 250 ms coalescing window that §2 and §3 sit on top of.
- `[strategic ADR-013]` persistence operational — defines per-project concurrency = 1 that §3 respects.
- `[strategic ADR-014]` AI L7.5 operational — defines the AI host that §3 binds.
- `[strategic ADR-018]` capacity cut list — §4.2 M12 / M24 checkpoints are NOT cut candidates (they are deferred to warn-only, not removed).
- `SPEC-02` persistence — §6.4 tier-streamed bake; §7 `.pryzm` ZIP format that §4.3 uses.
- `SPEC-07` AI layer — §X AI host emission contract that §3 extends.
- `SPEC-10` observability — span naming that §5 follows.
- `SPEC-11` testing — bench harness conventions that §2 follows.
- `SPEC-30` plan-view perf — overlapping budgets at the medium / torture tiers; §2 founder workload (180 walls) sits below SPEC-30 medium (500 elements).

---

## §7 Phase rollout

| Sprint | Deliverable | Owner |
|---|---|---|
| **S07 D5** | `apps/bench/src/benches/batch-create-e2e.bench.ts` skeleton + `tiny` + `founder` workloads (warn-only). `apps/bench/scripts/check-regression.mjs` extended to report per-span budget breaches. | Track B |
| **S08 D9** | `tiny` + `founder` flip to error on calibrated CI. | Track B |
| **S12 D9** | `small` workload added (5-level fixture). Error on calibrated CI. | Track B |
| **S21 D9** | `medium` workload added once bake worker ships. Error on calibrated CI. **§4 M12 checkpoint defers to S22**. | Track A + B |
| **S22 D9** | §4 M12 checkpoint: 10K-wall × 50-level fixture generated, bake-worker run, report filed. Warn-only. | Track A |
| **S30 D9** | All §2 tiers green; multi-family batch (rooms + walls + columns) added as `mixed` workload. | Track B |
| **S43 D5** | §3 back-pressure curve scaffolded in `packages/ai-host/AiHost.ts` (interface + thresholds, no AI yet). §4 M24 checkpoint runs. | Track A |
| **S43 D9** | `apps/bench/src/benches/ai-batch-emission.bench.ts` + `ai-batch-coexistence.bench.ts` land with synthetic AI emission. | Track B |
| **S47 D9** | AI host lazy bootstrap composes with §3 curve. End-to-end span trace verified in Honeycomb. | Track A |
| **S50 D5** | §4 M27.5 checkpoint runs (AI floor-plan on 10K-wall PDF). Re-tune §3 thresholds if needed via sprint-scoped ADR. | Track A + B |
| **S69 D7** | All gates flip to error on calibrated CI. M35 checkpoint per PHASE-3D §S69. | Track A + B |

---

## §8 Definition of done (binding)

This SPEC is **done** when:

1. `pnpm bench:batch-create-e2e` runs all five tiers and produces a per-span report.
2. `pnpm bench:ai-batch-emission` and `pnpm bench:ai-batch-coexistence` run and produce stepped-curve telemetry.
3. `tests/fixtures/largest.pryzm` exists and is rebuildable from `apps/bench/scripts/generate-largest-fixture.ts` from a committed seed.
4. The three §4 checkpoints (S22 / S43 / S50) have filed reports under `apps/bench/reports/M{N}-{phase}-largest.md`.
5. CI gates for all of the above are wired in `.github/workflows/ci.yml` per the §2.5 schedule.
6. The S69 hardening run produces a green M35 baseline that subsequent regressions must beat by ≤ 5%.

If any of the above is not met by S69 D7, GA tag is blocked per K3-F (PHASE-3D §S69 K3-F gate).
