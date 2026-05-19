# SPEC-45 — PDF-to-BIM Pipeline

| Field | Value |
|---|---|
| Status | **Active — outline (S50 D5); full normative content lands incrementally per §2 stage schedule** |
| Version | 0.1 |
| Date | 2026-04-28 |
| Owner | AI-host lead + Architecture lead + Product (PDF-to-BIM moat) |
| Closes | ADR-029 §Part D (the SPEC pointer) — publishes the engineering counterpart to ADR-029's scope ratification |
| Phases | 3A (S50 outline + page classification + floorplan segmentation), 3A (S55 wall vectorization), 3A (S58 door/window matching), 3A (S60 confidence model + review queue) |
| Replaces / extends | None — net-new SPEC. Companion to `SPEC-07` (AI Layer), `SPEC-26 §2` (file format `imports/`), `SPEC-28 §3` (cost model), `SPEC-29 §3.5` (vector primitives — symbol library) |

---

## §0 Numbering note

ADR-029 §Part D and `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S50 line 277 both refer to this SPEC as **"SPEC-31 PDF-to-BIM Pipeline"**. The number SPEC-31 was claimed first by `SPEC-31-LOAD-BENCH-AND-BACKPRESSURE.md` (2026-04-27 founder robustness amendment) before this document was drafted; rather than renumber the load-bench SPEC mid-cycle, the PDF-to-BIM pipeline publishes as **SPEC-45**. ADR-029 §Part D is updated in parallel to point at this number. All other phase doc references to "SPEC-31 PDF-to-BIM" should be read as SPEC-45.

---

## §1 Goals & non-goals

Refer ADR-029 (Accepted, 2026-04-27) for the full scope ratification. In summary:

**Goals (v1, GA):**
- A single-flow extraction: contractor uploads a PDF set → PRYZM produces a draft 3D model with walls + doors + windows + slabs at LOD 200 + a confidence-tagged review queue.
- 5 element families (wall, door, window, slab — plus the implicit "page" classification family).
- Per-element confidence tagging + reviewer-driven approve / edit / reject.
- Cost: per-page ≤ $0.05 (this SPEC §3); per-extraction hard cap $10 (Personal/Team) per ADR-029 §Part C.

**Non-goals at GA (per ADR-029 §Part B):**
- MEP, annotation, schedule, multi-PDF reconciliation, photogrammetry — all post-GA.
- Free-tier access — Personal+ only.

---

## §2 Pipeline stages

The pipeline is **monotonic** — each stage consumes the previous stage's output and writes its own to R2 (per §4). A failed stage parks the job in `pdf_jobs` with `status = 'error'` and surfaces in the review queue.

### §2.1 Page classification — **S50 (this sprint)**

Input: one rasterised PDF page (200 DPI default) + optional title-block metadata.
Output: `{ kind: 'plan' | 'section' | 'elevation' | 'detail' | 'schedule' | 'titleblock' | 'other', confidence: 0..1, rationale? }`.
Threshold: only pages classified `plan` with `confidence ≥ 0.7` enter §2.2 at S50; the threshold is an SPEC-45 §2.1 parameter and may relax once the confidence model lands at §2.5.
Implementation: `apps/ai-worker/src/cv/page-classification.ts` (mock at S50 — deterministic from page metadata; live Vision call lands at S52 per ADR-029 phase rollout).
Accuracy bar (per ADR-029 §Part E): ≥ 90% top-1 accuracy on the SPEC-45 fixture corpus.

### §2.2 Floor-plan segmentation — **S50 (this sprint)**

Input: one `plan`-kind page raster.
Output: `BinaryMask { width, height, data: Uint8Array }` where `data[i] === 1` denotes a "wall pixel".
Implementation: `apps/ai-worker/src/cv/floorplan-segmentation.ts` (mock at S50; ONNX-CUDA / ONNX-CPU adapters at S52 per §4).
Output is uploaded to R2 (per §4) at `cv/masks/<pageId>-<token>.bin`; URL is the next stage's input.

### §2.3 Wall vectorization — **S55**

Input: `BinaryMask`.
Output: ordered polylines per ADR-029 Part A "wall extraction" — hidden-line de-projection + AI symbol recognition for cut walls.
Acceptance bar (per ADR-029 §Part E): precision ≥ 0.85, recall ≥ 0.75.

### §2.4 Door / window symbol matching — **S58**

Input: `BinaryMask` + a vector polyline set from §2.3 + the symbol library per `SPEC-29 §3.5`.
Output: `Door` and `Window` element instances at LOD 200 with a host wall reference.
Acceptance bar (per ADR-029 §Part E): precision ≥ 0.80.

### §2.5 Confidence scoring — **S60**

Input: every element produced by §2.3 + §2.4.
Output: per-element `confidence: 0..1` + `reviewStatus: 'approved' | 'pending' | 'rejected'`.

### §2.6 Review queue surfacing — **S60**

Input: confidence-tagged elements.
Output: AI approval-queue entries per `AiPendingAction`, one per element batch; `preview.kind = 'image'` carrying the page raster + element overlay.

---

## §3 Cost model — per-page ≤ $0.05

Per ADR-029 §Part C the average drawing set is 15 pages at $1.50–$3.00 (≈$0.10–$0.20 per page). SPEC-45 tightens that to **per-page ≤ $0.05** for the S50 segmentation surface, with the per-extraction hard cap of $10 (Personal/Team) layered on top via the workspace cost ceiling per `SPEC-28 §3`.

Cost composition per page (S50):
- Page classification: ~$0.02 (Vision call deferred to S52; mock $0.0).
- Floor-plan segmentation: ~$0.025 (ONNX-CPU inference; deferred to S52; mock $0.0).
- Storage upload: negligible (R2 PUT ≈ $0.000005).
- Cost meter overhead: nil.

Per-call gate (per `SPEC-28 §3`): `costMeter.preCheckBudget(projectId, 0.05)` runs before every `processFloorplanSegmentation` invocation; rejection enqueues a `status: 'rejected'` `AiPendingAction` so the reviewer sees the budget reason without losing the job.

Per-call recording (per `SPEC-28 §5.1`): `costMeter.recordCall('cv-floorplan-segmentation', projectId, costUsd, durationMs, extras)` writes one `ai_usage` row + emits `pryzm.ai.cost.usd` (counter) + `pryzm.ai.cost.usd.per_call` (histogram).

---

## §4 Worker placement — GPU preferred, CPU fallback

Per `SPEC-15 §2.4`:

- **GPU workers**: `cv` jobs route to GPU workers when at least one is available. Detected via `CUDA_VISIBLE_DEVICES` non-empty in the worker pod env.
- **CPU fallback**: any worker can claim a `cv` job; ONNX-CPU is the fallback runtime.
- **Mock runtime** (S50 default): every worker is "CPU mock" until the real ONNX adapter lands at S52. The mock is deterministic and the handler / queue / storage code paths are identical to production.

The runtime selector lives at `apps/ai-worker/src/cv/runtime.ts`; the storage selector lives at `apps/ai-worker/src/cv/storage.ts`. Both follow the `createQueue({env})` pattern from `apps/ai-worker/src/queue.ts` — explicit env override wins; otherwise auto-detect; otherwise the in-memory / mock fallback.

---

## §5 Persistence

Two tables back the pipeline:

1. **`ai_usage`** (per `SPEC-28 §5.1`, landed S49) — one row per CV call, regardless of stage. The `surface` column carries the stage label (e.g. `'cv-floorplan-segmentation'`).
2. **`pdf_jobs`** (per `SPEC-24 §1.5`, landed S50) — one row per uploaded PDF page; tracks the per-stage status, current stage, mask URL, classification JSON, and accumulated cost. Schema:
   ```
   id              TEXT PRIMARY KEY
   project_id      TEXT NOT NULL
   actor_id        TEXT NOT NULL
   source_pdf_url  TEXT NOT NULL
   page_number     INTEGER NOT NULL
   page_count      INTEGER NOT NULL DEFAULT 1
   status          TEXT NOT NULL DEFAULT 'pending'  -- pending|running|ok|skipped|rejected|error
   current_stage   TEXT NOT NULL DEFAULT 'classify' -- classify|segment|vectorize|match|score|review
   classification  JSONB
   mask_url        TEXT
   cost_usd        NUMERIC(10,6) NOT NULL DEFAULT 0
   error_message   TEXT
   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
   ```
   Indexes: `(project_id, created_at DESC)` for the per-project review queue list; `(project_id, status)` for "show me everything still pending".

---

## §6 Approval queue integration

Each stage that mutates project state (§2.3 wall vectorization onward) emits one `AiPendingAction` per produced element batch. The S50 surfaces (§2.1 + §2.2) are diagnostic only — they emit a `status: 'rejected'` action when the budget is hit, but otherwise simply update the `pdf_jobs` row and let the next stage pick up. Per `SPEC-07 §3` the pipeline is **diagnostic until §2.3 lands** so accidental auto-apply is impossible.

---

## §7 Public-preview gating per ADR-029 Part E

If the v1 accuracy bar is missed on the SPEC-45 fixture corpus, the feature ships behind a `"PDF-to-BIM (preview)"` label per ADR-029 §Part E. The feature flag `pdf_to_bim_preview` (added to `packages/feature-flags`) governs:
- Command-palette visibility of `ai.pdf-to-bim.import`.
- Marketing copy ("Preview" badge in the workspace header when the flag is on).
- Per-project upload limits (5 sets / month while in preview).

---

## §8 Telemetry

Per-stage OTel surfaces under the `pryzm.ai.pdf` namespace:

- `pryzm.ai.pdf.classify.duration_ms`        — histogram, tagged `kind`, `confidence_bucket`.
- `pryzm.ai.pdf.classify.confidence`         — histogram, tagged `predicted_kind`.
- `pryzm.ai.pdf.segment.duration_ms`         — histogram, tagged `runtime_kind` (gpu|cpu|mock).
- `pryzm.ai.pdf.segment.wall_coverage`       — histogram (sanity ratio per page).
- `pryzm.ai.pdf.stage.transitions`           — counter, tagged `from`, `to`.
- `pryzm.ai.pdf.skipped`                     — counter, tagged `reason`.
- `pryzm.ai.cost.usd` + `pryzm.ai.cost.usd.per_call` — already lit via `SPEC-28` (cost meter); CV calls land here with `surface = 'cv-floorplan-segmentation'` etc.

---

## §9 Cross-references

- ADR-029 — PDF-to-BIM Scope (the moat).
- SPEC-07 — AI Layer (§3 — AI plane vs command bus).
- SPEC-15 — Deployment Topology (§2.4 — worker pool placement).
- SPEC-24 — Data Store Map (§1.5 — `pdf_jobs` table).
- SPEC-26 — `.pryzm` File Format (§2 — `imports/` archive).
- SPEC-28 — AI Cost Model (§3 ceiling, §5.1 `ai_usage`).
- SPEC-29 — Vector Primitives (§3.5 symbol library).
