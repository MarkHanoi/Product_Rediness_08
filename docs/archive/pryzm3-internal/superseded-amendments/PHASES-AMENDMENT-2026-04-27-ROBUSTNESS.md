# Phases Amendment — 2026-04-27 — Robustness Insertions for SPEC-31

> **Purpose**: instruct implementation agents on the precise insertions required to land SPEC-31 (`specs/SPEC-31-LOAD-BENCH-AND-BACKPRESSURE.md`) into the existing phase docs. Each insertion is specified by file, sprint, and exact action. Conflict order remains: **SPEC > ADR > MASTER PLAN > CRITICAL-REVIEW > 05-IMPLEMENTATION-PLAN > phase docs**.
>
> **Authority**: SPEC-31 is the canonical contract. This amendment only ports SPEC-31's deliverables into the per-sprint phase docs so they are picked up by the sprint planning workflow.
>
> **Status**: Active. Land before S07 D1.

---

## §1 The three robustness amendments

| # | Amendment | SPEC-31 §ref | Where it lands |
|---|---|---|---|
| A1 | End-to-end batch-creation bench (`batch-create-e2e.bench.ts`) with founder 180-element workload at < 3 s p95 | §2 | Phase 1B (S07–S08), Phase 1C (S12), Phase 1D (S21–S22), Phase 2A (S30), Phase 2D (S43), Phase 3A (S50), Phase 3D (S69) |
| A2 | AI-batch back-pressure curve (4-step: full / soft-pause / hard-pause / reject + hysteresis) specified BEFORE S43 | §3 | Phase 2D (S43), Phase 3A (S47–S50) |
| A3 | 10K-wall × 50-level fixture moved earlier — three checkpoints at S22, S43, S50 (warn-only) instead of single-shot at S69 | §4 | Phase 1D (S22), Phase 2D (S43), Phase 3A (S50), Phase 3D (S69) |

---

## §2 Insertions per phase doc

### §2.1 PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md

**Insertion at S07 D5** (after Track B item "wall handler smoke tests"):

```
### S07-T11 — Batch-create end-to-end bench skeleton (per SPEC-31 §2)
- **Owner**: Track B.
- **Deliverable**: `apps/bench/src/benches/batch-create-e2e.bench.ts` with `tiny` (12 events) and `founder` (180 events, 12 walls × 15 levels) workloads.
- **Exit gate**: warn-only on Replit; error on calibrated CI from S08 D9.
- **Telemetry**: per-span budget instrumentation per SPEC-31 §2.2.
- **Note**: workload `founder` is the canonical "12 walls × 15 levels" pain point from PRYZM 1; gate < 3 s p95.
```

**Insertion at S08 exit criteria**:

> Add bullet: `[ ] SPEC-31 §2 tiny + founder workloads flip to error on calibrated CI.`

### §2.2 PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md

**Insertion at S12 D9 joint deliverables**:

```
| `apps/bench/src/benches/batch-create-e2e.bench.ts` — `small` workload (60 events) green per SPEC-31 §2 | S12 D9 |
```

### §2.3 PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md

**Insertion at S21 D9 joint deliverables**:

```
| `apps/bench/src/benches/batch-create-e2e.bench.ts` — `medium` workload (600 events) green; bake worker round-trip measured per SPEC-31 §2 | S21 D9 |
```

**Insertion at S22 — new D5 deliverable** (per SPEC-31 §4.2 M12 checkpoint):

```
### S22-T12 — Largest-fixture M12 checkpoint (per SPEC-31 §4)
- **Owner**: Track A.
- **Deliverable**:
  1. `apps/bench/scripts/generate-largest-fixture.ts` — deterministic generator from committed seed.
  2. `tests/fixtures/largest.pryzm` produced in CI (not committed).
  3. Bake-worker only run: re-bake entire 10K-wall × 50-level fixture from single seed event.
  4. Report filed at `apps/bench/reports/M12-1D-largest.md`.
- **Exit gate**: WARN-ONLY at M12. Targets: `bake.chunk` p95 < 1.5 s, total bake < 60 s, server RSS < 4 GiB. Failure does not block PR but MUST file a sprint-scoped ADR explaining the regression and a remediation plan before S25 starts.
- **Purpose**: catch quadratics in the bake worker before AI lands at S50.
```

**Insertion at S22 exit criteria**:

> Add bullet: `[ ] SPEC-31 §4.2 M12 largest-fixture checkpoint report filed (warn-only; per ADR-018 NOT a cut candidate).`

### §2.4 PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md

**Insertion at S30 D9 joint deliverables**:

```
| `apps/bench/src/benches/batch-create-e2e.bench.ts` — all five SPEC-31 §2 tiers green; multi-family `mixed` workload (rooms + walls + columns) added | S30 D9 |
```

**Insertion at §2 (Sprint Detail) S30 exit criteria**:

> Add bullet: `[ ] SPEC-31 §2 mixed workload (rooms + walls + columns batch creation) green on calibrated CI; per-span report shows no phase exceeds budget by > 10%.`

### §2.5 PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md

**Insertion at §1 Track A allocation** (after the existing `apps/bake-worker debounce window pinned at 250 ms` row):

```
| `packages/ai-host/AiHost.ts` back-pressure curve scaffold per SPEC-31 §3 (interface + thresholds; no AI yet — host is empty) | S43 |
| §4 M24 largest-fixture checkpoint — full pipeline + 5-peer chaos | S43 |
```

**Insertion at §1 Track B allocation** (after `packages/sync-client/causal-test/ chaos harness`):

```
| `apps/bench/src/benches/ai-batch-emission.bench.ts` — synthetic AI emission at 1/10/100/1000 events/s | S43 |
| `apps/bench/src/benches/ai-batch-coexistence.bench.ts` — AI emission concurrent with human edit | S43 |
```

**Insertion at §1 Joint deliverables**:

```
| SPEC-31 §3 back-pressure curve thresholds (20 / 50 / 100, hysteresis 30) ratified or amended via sprint-scoped ADR | S43 D9 |
| `apps/bench/reports/M24-2D-largest.md` — M24 largest-fixture checkpoint report filed | S43 D9 |
```

**Insertion at §2 S43 exit criteria** (the new sprint-detail bullets):

> - `[ ] SPEC-31 §3 back-pressure thresholds wired in `AiHost.ts` (interface only; AI host stays empty per ADR-014 lazy bootstrap).`
> - `[ ] SPEC-31 §3 OTel spans (`pryzm.ai.emission.policy-transition`, `pryzm.bake.queue.depth`) emitted under `ai-batch-emission.bench.ts`.`
> - `[ ] SPEC-31 §4 M24 largest-fixture checkpoint report filed (warn-only; full pipeline + chaos harness; per ADR-018 NOT a cut candidate).`

### §2.6 PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md

**Insertion at S47 (AI host lazy bootstrap) deliverables**:

```
- AI host bootstrap composes with SPEC-31 §3 back-pressure curve. End-to-end span trace verified in Honeycomb (or equivalent per ADR-007).
```

**Insertion at S50 (AI floor-plan import) deliverables**:

```
- SPEC-31 §4 M27.5 largest-fixture checkpoint: AI floor-plan import on a PDF that produces ~10K walls. End-to-end measurement (PDF upload → last chunk rendered) filed at `apps/bench/reports/M27-3A-largest.md`. Warn-only.
- SPEC-31 §3 threshold re-tune: if M27.5 measurements show oscillation or starvation, file sprint-scoped ADR `docs/02-decisions/adrs/NNNN-ai-backpressure-tune.md` with new thresholds.
```

### §2.7 PHASE-3D-Q4-M34-M36-HARDENING-GA.md

**Insertion at S69 §3 deliverables list** (after the existing `10K wall × 50 level fixture` row):

```
| SPEC-31 §4 M35 hard-fail checkpoint: all three SPEC-31 §4 gates flip to error; > 5% regression vs M24 baseline (per `apps/bench/reports/M24-2D-largest.md`) halts forward 3D work per K3-F. | S69 |
| SPEC-31 §2 batch-create-e2e re-bench on 10K-wall × 50-level fixture (large workload). All five tiers must remain within their gates with founder 180-element workload < 3 s p95 unchanged. | S69 |
| SPEC-31 §3 ai-batch-emission re-bench under steady-state production AI load (10 concurrent AI batches across 10 projects). Soft-pause must NOT trigger on workloads ≤ 1,250 walls per batch. | S69 |
```

---

## §3 PROCESS-TRACKER updates

### §3.1 Add SPEC-31 to the SPEC index (PROCESS-TRACKER §4 cross-cutting layers, after the existing SPEC list reference)

```
| SPEC-31 — End-to-end batch bench + AI back-pressure + production-scale fixture schedule | All bench-instrumented sprints | [~] | S07 (skeleton) |
```

### §3.2 Add three new W-3 (post-2026-04-27) ledger items under §"W-3 Robustness Worklist"

```
- [ ] **W-3-1** SPEC-31 §2 `batch-create-e2e.bench.ts` skeleton lands at S07 D5; `tiny` + `founder` workloads warn-only. Owner: Track B.
- [ ] **W-3-2** SPEC-31 §3 back-pressure curve interface in `packages/ai-host/AiHost.ts` lands at S43 D5 (AI host stays empty per ADR-014). Owner: Track A.
- [ ] **W-3-3** SPEC-31 §4 `tests/fixtures/largest.pryzm` generator lands at S22 D1; M12 checkpoint report filed at S22 D9. Owner: Track A.
```

---

## §4 ADR cross-cuts

### §4.1 ADR-005 (worker-pool policy) — annotate

> Add cross-reference at ADR-005 §39 (first-paint priority): `See SPEC-31 §2 for the end-to-end bench that validates first-paint priority composes with the committer + bake worker.`

### §4.2 ADR-010 (bake debounce) — annotate

> Add cross-reference at ADR-010 §46 (1500 ms hard cap): `See SPEC-31 §3 for the AI emission curve that prevents the hard cap from firing on every batch boundary.`

> Add cross-reference at ADR-010 §111 (S43 AI batch boundary integration): `Composes with SPEC-31 §3 four-step back-pressure curve (full / soft-pause / hard-pause / reject + hysteresis at 30).`

### §4.3 ADR-013 (persistence operational) — annotate

> Add cross-reference at ADR-013 §75 (per-project queue concurrency = 1): `SPEC-31 §3 hard-pause threshold (depth 51–100) is the upstream gate that prevents per-project concurrency = 1 from producing 30 s+ tails under AI batch load.`

### §4.4 ADR-018 (capacity cut list) — clarify

> Add explicit row to ADR-018 cut-list table: `SPEC-31 §4 M12 + M24 + M27.5 checkpoints are NOT cut candidates. They may be deferred from "error" to "warn-only" but MAY NOT be skipped or removed. The fixture run + report file is mandatory.`

---

## §5 Validation

After applying all §2–§4 edits, the agent runs:

```bash
pnpm spec:audit-cross-refs   # ensures every SPEC-31 reference resolves
pnpm phases:audit-amendments # ensures every §2 insertion lands at the right sprint
```

Both must pass before this amendment is considered landed. Any drift between SPEC-31 and the phase docs is a SPEC-wins resolution per the conflict order.
