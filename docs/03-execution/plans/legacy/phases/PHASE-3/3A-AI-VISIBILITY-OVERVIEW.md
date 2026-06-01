# Phase 3A — AI Subsystem Decomposition + Visibility-Intent Completion + PDF-to-BIM
## Q1 of Phase 3 · Months 25–27 · Sprints S49–S54

> **Authority note (added 2026-04-27).** This sub-phase doc is subordinate to the SPEC and ADR series. Conflict precedence: `docs/03_PRYZM3/reference/specs/SPEC-*` → `docs/03_PRYZM3/reference/adrs/ADR-*` (cited as `[strategic ADR-NNN]`) → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → `CRITICAL-REVIEW-2026-04-27.md` → `05-IMPLEMENTATION-PLAN.md` → this phase doc. Sprint-scoped ADRs in `docs/architecture/adr/NNNN-slug.md` are cited as `[ADR NNNN-slug]` and govern *implementation choices inside* a sprint, not strategy.
>
> **Strategic anchor**: `08-VISION.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` §6 → `phases/PHASE-3-COMPLETION-GA-M25-M36.md` §2 → this file.
>
> **Coalescing-window invariant**: every reference to bake/event coalescing in this doc means **250 ms** per `[strategic ADR-010]`.

---

## Executive Summary

**Sub-phase goal**: complete the AI subsystem decomposition (the 31-file moat finishes its move from PRYZM 1 to L7.5), finish the Visibility-Intent system (waves 6–11), open beta-feedback fix lanes, ratify the PDF-to-BIM scope and pipeline, and stand up the full AI workflow surface (plan-view critique + generate-3-options) with cost guardrails enforced at $0.18/call ceiling per SPEC-28 §3.

**Why 3A is the most narrative-heavy quarter of Phase 3**: of the seven D1–D7 differentiators, three (D2 multi-user, D5 AI workflows, D7 visibility) are simultaneously alive in this quarter for the first time. Beta users see the AI proposal queue light up with real CV pipeline output, the voice command surface comes online, and the visibility system gets the discretion-side primitives that make complex projects manageable. PDF-to-BIM (per `[strategic ADR-029]` ratified S49) starts its long road to public preview at S70.

**The four hardest problems in 3A**:

1. **AI workflow correctness on real beta data** (S50–S52) — beta users feeding the CV pipeline real floor plans expose corner cases no synthetic fixture caught. The approval queue must surface these gracefully, never silently mutate state.
2. **Visibility-Intent waves 6–11 — the user-discretion side** (S53) — overrides, isolation, hide-element, view-state save/restore. These are the waves where users *expect* state to follow them across views; getting the cross-view propagation right while respecting `[ADR 0025-multi-view-sync]` is subtle.
3. **L7.5 architectural promotion** (S49) — the AI host moves from "lazy-loaded module in `apps/editor`" to "first-class L7.5 plane with its own bus" per SPEC-07 + SPEC-28. This unblocks public AI APIs in S53 and the third-party AI plugins in 3B.
4. **PDF-to-BIM pipeline ratification** (S49–S52) — `[strategic ADR-029]` Part A ships PDF parsing + page classification (S50) → wall extraction (S55) → door/window symbol matching (S58) → confidence model + review queue (S60). 3A only opens the road; the public preview is S70.

**Cost-guardrail discipline**: per SPEC-28 §3 every AI workflow has a $0.18/call ceiling and a per-project monthly budget. Pre-call rejection is the gate; post-call telemetry is the audit trail. No workflow ships in 3A without both.

---

## §0 Reading Conventions

**ADR citation format**: `[strategic ADR-NNN]` for strategic series; `[ADR NNNN-slug]` for sprint-scoped.

**SPEC citation format**: `SPEC-NN §X.Y` is canonical. Every binding line traces to a SPEC or ADR.

**Visibility-Intent invariant**: every wave is a **pure function** of `(ctx) => result` per the canonical pattern from S46. Wave order is fixed; the first wave to return `{ visible: false }` short-circuits.

**AI invariant**: every workflow that mutates state goes through the approval queue. The queue is the single integration point with the command bus per `[strategic ADR-014]`. There is no "auto-apply" path in 3A; auto-apply is a v2 backlog item.

**PDF-to-BIM invariant**: per `[strategic ADR-029]` the pipeline emits **proposals**, not commits. Every door, window, and wall extracted from a PDF lands in the AI approval queue with a confidence score; user accepts/edits/rejects.

---

## §1 Track Allocation for 3A

### Track A — AI L7.5 promotion, CV pipeline, generative workflows (Agent A)

| Item | Sprint |
|---|---|
| Full L7.5 architectural promotion per SPEC-07 + SPEC-28 | S49 |
| Cost telemetry → Honeycomb live | S49 |
| `[strategic ADR-029]` (PDF-to-BIM Scope) ratified | S49 |
| `apps/ai-worker/cv/floorplan-segmentation.ts` (CV pipeline core) | S50 |
| `apps/ai-worker/cv/page-classification.ts` per ADR-029 Part A | S50 |
| SPEC-31 (PDF-to-BIM Pipeline) outline drafted + published | S50 |
| AI plan-view critique surface lit per SPEC-28 §3 + SPEC-07 §3 | S51 |
| AI generate-3-options surface lit per SPEC-28 §3 | S52 |
| Cost guardrails verified at $0.18/call ceiling | S52 |
| Voice command surface (lazy-loaded) per `[strategic ADR-014]` | S52 |

### Track B — Visibility-Intent waves 6–11, beta bug-fix, AI UI (Agent B)

| Item | Sprint |
|---|---|
| 4-week beta bug-fix lane (P0/P1 from S48) | S49–S52 |
| `plugins/visibility-intent/waves/{w06..w11}.ts` literal preservation | S53 |
| Visibility-Intent migration retro per SPEC-30 §6 | S53 |
| `featureFlags.legacy_vi_fallback` becomes opt-in only | S53 |
| Approval queue UI rich-state (preview thumbnails, cost line items) | S51–S52 |
| Component editor (D10 loadable families) — **deferred per `[strategic ADR-018]` T2.2** | S54 |
| `apps/bench/ai-cost.ts` and `apps/bench/visibility-correctness.ts` | S54 |

### Joint Deliverables

| Item | Sprint |
|---|---|
| Sprint-scoped `[ADR 0014-traa-ssgi-idle-budget]` (refresh) for AI idle budget | S49 D1 |
| `[strategic ADR-018]` Tier-1 checkpoint (T1.7 + T1.8 added per gap review) | S49 D9 |
| 3A demo recording (10-min screencast) | S54 D9 |
| `apps/bench/reports/M27-3A.md` | S54 D9 |

---

## §2 Sprint-by-Sprint Detail

---

### S49 — AI L7.5 Promotion + Cost Telemetry + ADR-029 Ratification + Beta Bug-Fix Buffer Opens
**Weeks 97–98 (Month 25)**

---

#### Context and Why This Matters

S49 is the second-order kickoff sprint of Phase 3. The lazy-loaded AI host from S47 graduates to a **first-class L7.5 architectural plane** with its own bus, its own observability prefix, and its own descriptor schema for plugin discovery. Per SPEC-07 §3 the AI host gains a public contract that the public AI API in S53 will surface as REST/WS.

`[strategic ADR-029]` (PDF-to-BIM Scope) is **ratified** this sprint — the founder + architect signature is the gate that unlocks SPEC-31 drafting (S50). The decision to scope PDF-to-BIM to "wall extraction + door/window symbol matching + manual review queue" (vs. "full IFC reconstruction") is the discipline test of Phase 3A.

The 4-week beta bug-fix lane runs S49–S52: every P0/P1 from the M24 beta gets a fix-first treatment.

---

#### Implementation Detail — L7.5 Promotion

```typescript
// packages/ai-host/AiPlane.ts (new — promotes AiHost.ts to first-class plane)

export class AiPlane {
  readonly bus: AiBus;                     // independent of command-bus
  readonly approvalQueue: AiApprovalQueueStore;
  readonly costMeter: CostMeter;           // SPEC-28 §3 enforcement
  readonly workflowRegistry: WorkflowRegistry;

  constructor(deps: AiPlaneDeps) {
    this.bus = new AiBus({ otelPrefix: 'pryzm.ai' });
    this.approvalQueue = deps.approvalQueueStore;
    this.costMeter = new CostMeter({
      perCallCeilingUsd: 0.18,             // SPEC-28 §3
      perProjectMonthlyBudget: deps.budgetResolver,
      preCallRejection: true,
      onLimitExceeded: deps.notifyAdmin,
    });
    this.workflowRegistry = new WorkflowRegistry();
  }

  // Workflows register themselves; the registry exposes them to:
  //  - the editor's command palette (L7)
  //  - the public AI API (S53) at L7.5/api boundary
  //  - third-party plugins (3B) via the descriptor schema
  registerWorkflow(descriptor: WorkflowDescriptor, impl: WorkflowImpl) {
    this.workflowRegistry.register(descriptor, impl);
  }
}
```

**The L7.5 layer** sits above L7 (editor shell) and below L8 (the user). Per SPEC-07 §3 + ADR-014, the plane has its own message bus so AI workflows do not pollute the command bus's event log with intermediate proposals — only **approved** workflow outputs commit through the command bus.

---

#### Implementation Detail — Cost telemetry

```typescript
// packages/ai-host/CostMeter.ts

export class CostMeter {
  async recordCall(workflow: string, projectId: string, costUsd: number, latencyMs: number) {
    // Honeycomb metric: pryzm.ai.cost.usd
    metric('pryzm.ai.cost.usd').record(costUsd, {
      workflow, project_id: projectId, latency_ms: latencyMs,
    });
    // Persist to ai_usage table per SPEC-24 §1.5
    await this.db.insert('ai_usage', {
      workflow, project_id: projectId, cost_usd: costUsd,
      latency_ms: latencyMs, ts: new Date(),
    });
  }

  async preCheckBudget(projectId: string, estimatedCostUsd: number): Promise<{ ok: boolean; reason?: string }> {
    if (estimatedCostUsd > 0.18) {
      return { ok: false, reason: 'Per-call ceiling exceeded ($0.18 max)' };
    }
    const monthlyTotal = await this.monthlyTotalFor(projectId);
    const budget = await this.budgetResolver(projectId);
    if (monthlyTotal + estimatedCostUsd > budget) {
      return { ok: false, reason: `Monthly budget exceeded ($${budget.toFixed(2)})` };
    }
    return { ok: true };
  }
}
```

---

#### `[strategic ADR-029]` Ratification — PDF-to-BIM Scope

Founder + architect sign off the following scope decisions on S49 D7:

1. **Input**: PDFs (single-page or multi-page) of building floor plans. No CAD-vector PDFs, no scanned hand-drawings (v2 backlog).
2. **Output**: proposed walls (polylines) + proposed doors + proposed windows, all landed in the AI approval queue with a confidence score.
3. **Out of scope**: stairs, MEP, dimensions, annotations (v2 backlog).
4. **Public preview**: S70 (Phase 3D). Public preview gating per ADR-029 Part E (accuracy bar).
5. **Cost ceiling**: per-page cost at $0.05 max (well under the $0.18 per-call ceiling).
6. **Confidence model** (S60): per-element confidence in [0, 1]; review queue surfaces all elements with confidence < 0.85.

---

#### Beta Bug-Fix Lane (4 weeks, S49–S52)

The lane is a parallel track running alongside the main Phase 3A work:

- Every P0/P1 bug from M24 beta gets a fix in this lane, not deferred.
- The lane has its own daily standup with the founder.
- Bugs that are P2/P3 are triaged into Phase 3B/3C as appropriate.
- The lane's exit criterion at end of S52 is: zero open P0/P1 from beta.

---

#### Daily Plan

- **D1**: AiPlane skeleton + CostMeter + Honeycomb metric setup.
- **D2**: workflow registry + descriptor schema + first workflow (placeholder) registered.
- **D3**: pre-call budget check + per-project budget resolver.
- **D4**: ai_usage table + insert path + nightly aggregation.
- **D5**: lazy-load verification re-run (no AI bytes in editor first paint).
- **D6**: ADR-029 draft circulated.
- **D7**: ADR-029 ratification meeting + signature.
- **D8**: lint + perf bench (`apps/bench/ai-cost.ts`).
- **D9**: cut-list checkpoint + retro.
- **D10**: buffer + beta bug-fix lane standup launch.

---

#### Exit Criteria for S49

- AiPlane is the only path AI workflows take to the command bus.
- CostMeter rejects pre-call when budget exceeded; rejection is surfaced in approval queue.
- Honeycomb shows `pryzm.ai.cost.usd` metric live.
- `[strategic ADR-029]` ratified + committed.
- Beta bug-fix lane open with daily standup.

---

### S50 — CV Pipeline Core + SPEC-31 Published + PDF Page Classification
**Weeks 99–100 (Month 25)**

---

#### Context and Why This Matters

S50 puts real CV pipeline output in front of beta users for the first time. The CV pipeline (`apps/ai-worker/cv/`) is a heavy compute path that runs on a separate worker pool (BullMQ + GPU workers if available, CPU fallback otherwise per SPEC-15 §2.4). The first workflow to use it is **floorplan segmentation** — given a PDF page of a floor plan, identify regions corresponding to walls.

SPEC-31 (PDF-to-BIM Pipeline) is **published** this sprint as the engineering counterpart to ADR-029. Where ADR-029 sets scope and accuracy bar, SPEC-31 sets the pipeline stages: page classification → segmentation → vectorization → element extraction → confidence scoring → review queue.

---

#### Implementation Detail — `floorplan-segmentation.ts`

```typescript
// apps/ai-worker/cv/floorplan-segmentation.ts

import { Job } from 'bullmq';
import { runSegmentationModel } from './model-runner';
import { uploadResultToR2 } from '../storage';

export async function processFloorplanSegmentation(job: Job<FloorplanSegJob>) {
  const { projectId, pdfPageUrl, costBudget } = job.data;

  const pdfPage = await fetchPdfPage(pdfPageUrl);
  const start = performance.now();

  // Page classification: is this a floor plan vs elevation vs section vs detail?
  // ADR-029 Part A: only floor-plan pages enter the wall-extraction stage.
  const cls = await classifyPage(pdfPage);
  if (cls.kind !== 'floor-plan' || cls.confidence < 0.7) {
    return { status: 'skipped', reason: `page classified ${cls.kind} @ ${cls.confidence}` };
  }

  // Segmentation: produce binary mask of "wall" pixels.
  const mask = await runSegmentationModel(pdfPage);
  const elapsed = performance.now() - start;

  // Cost is metered before this point (pre-call); record actual.
  await recordCallActual(projectId, 'floorplan-segmentation', elapsed, costBudget);

  // Upload mask + raw output for the next pipeline stage (vectorization in S55).
  const maskUrl = await uploadResultToR2(projectId, mask);
  return { status: 'ok', maskUrl, classification: cls };
}
```

**GPU vs CPU path**: the segmentation model has two compiled forms — ONNX-CUDA for GPU workers, ONNX-CPU for CPU workers. The job dispatcher routes based on worker availability per SPEC-15 §2.4.

---

#### SPEC-31 Outline

```text
SPEC-31 — PDF-to-BIM Pipeline (publishes S50 D5)

§1 Goals & non-goals (refer ADR-029)
§2 Pipeline stages
   §2.1 Page classification         (S50)
   §2.2 Floor-plan segmentation     (S50)
   §2.3 Wall vectorization          (S55)
   §2.4 Door/window symbol matching (S58)
   §2.5 Confidence scoring          (S60)
   §2.6 Review queue surfacing      (S60)
§3 Cost model — per-page ≤ $0.05
§4 Worker placement — GPU preferred, CPU fallback
§5 Persistence — ai_usage rows; pdf_jobs table per SPEC-24 §1.5
§6 Approval queue integration
§7 Public-preview gating per ADR-029 Part E
§8 Telemetry (`pryzm.ai.pdf.{stage}`)
```

---

#### Daily Plan

- **D1**: ai-worker CV scaffolding + ONNX runtime + GPU/CPU detection.
- **D2**: page classification model integration.
- **D3**: floorplan segmentation model integration.
- **D4**: BullMQ job wiring + R2 upload of intermediate artifacts.
- **D5**: SPEC-31 outline drafted + published.
- **D6**: cost recording integration (pre-call + actual).
- **D7**: e2e smoke (PDF in → mask URL out → approval queue placeholder).
- **D8**: lint + perf bench.
- **D9**: demo (real PDF from beta cohort).
- **D10**: buffer + beta bug-fix lane standup.

---

#### Exit Criteria for S50

- CV pipeline core lit; segmentation produces masks for at least 5 beta-supplied PDFs.
- Page classification routes only floor-plan pages forward.
- SPEC-31 published.
- Per-call cost meters accurate within ±10% of actual.
- ai_usage rows inserted for every segmentation call.

---

### S51 — AI Plan-View Critique Surface
**Weeks 101–102 (Month 26)**

---

#### Context and Why This Matters

The AI plan-view critique is the workflow that makes "AI as design partner" visible. A user clicks a button in plan view; the AI examines the plan (current visible elements + intent context), produces a list of critique items ("door swing conflicts with shelf at A-12", "corridor narrower than 1200 mm at B-05"), each item lands as a proposal in the approval queue with a one-click "show in plan" action.

Per SPEC-28 §3 + SPEC-07 §3 the critique workflow uses the LLM relay (CF Worker → Anthropic) with a system prompt that includes visible elements as JSON + an architect's domain prompt. Cost target: ~$0.05/call.

---

#### Implementation Detail — Critique Workflow

```typescript
// packages/ai-host/workflows/PlanCritique.ts

export const planCritiqueDescriptor: WorkflowDescriptor = {
  id: 'plan-critique',
  displayName: 'Critique this plan',
  estimatedCostUsd: 0.05,
  inputs: ['view-snapshot', 'visibility-state'],
  outputs: ['critique-items[]'],
};

export async function planCritique(ctx: WorkflowCtx): Promise<CritiqueResult> {
  const snapshot = await ctx.captureViewSnapshot();
  const visibility = await ctx.captureVisibilityState();

  const preCheck = await ctx.costMeter.preCheckBudget(ctx.projectId, 0.05);
  if (!preCheck.ok) {
    return { status: 'rejected', reason: preCheck.reason };
  }

  const llmRequest = buildCritiquePrompt(snapshot, visibility);
  const start = performance.now();
  const llmResponse = await ctx.anthropicRelay(llmRequest);
  const elapsed = performance.now() - start;

  const items = parseCritiqueItems(llmResponse);
  await ctx.costMeter.recordCall('plan-critique', ctx.projectId, llmResponse.costUsd, elapsed);

  // Each critique item becomes a proposal in the approval queue;
  // accepting it does NOT mutate state — it surfaces the issue location.
  for (const item of items) {
    await ctx.approvalQueue.enqueue({
      workflow: 'plan-critique',
      proposedCommands: [],          // critique is read-only
      preview: { kind: 'json', data: item },
      estimatedCostUsd: 0,
    });
  }
  return { status: 'ok', itemCount: items.length };
}
```

**Why critique items are zero-command proposals**: critique is **diagnostic**, not corrective. The "fix" is a separate generate-3-options workflow (S52). This separation prevents accidental auto-apply.

---

#### Daily Plan

- **D1**: PlanCritique descriptor + workflow registration.
- **D2**: view snapshot capture (visible elements + visibility state to JSON).
- **D3**: prompt template + LLM relay integration.
- **D4**: response parsing + critique item schema.
- **D5**: approval queue UI: critique-item card + "show in plan" jump action.
- **D6**: per-call cost recording verification.
- **D7**: e2e smoke (real beta plan → critique → 5 items in queue).
- **D8**: lint + perf bench.
- **D9**: demo.
- **D10**: buffer + beta bug-fix lane standup.

---

#### Exit Criteria for S51

- Plan critique workflow registered and discoverable in command palette.
- 10 beta plans produce non-trivial critique items (≥ 3 per plan average).
- Per-call cost ≤ $0.06 measured.
- Critique items surface in approval queue with jump-to-element action.

---

### S52 — AI Generate-3-Options Surface + Voice Command Surface + Cost Guardrail Verification
**Weeks 103–104 (Month 26)**

---

#### Context and Why This Matters

Generate-3-options is the workflow that turns AI from "advisor" into "co-author". User selects a region in plan view; AI proposes three alternative arrangements (e.g., three different bathroom layouts); user picks one to commit. Per SPEC-28 §3 the workflow caps at $0.18/call (the per-call ceiling) — three options at ~$0.05 each plus orchestration overhead.

Voice command surface (lazy-loaded per `[strategic ADR-014]`) opens a thin command-bus integration: voice → Whisper transcription → command-palette match → execute. No state mutation without confirmation.

Cost guardrails are **verified end-to-end** this sprint: pre-call rejection works, monthly budget enforcement works, per-call ceiling enforcement works, and the AI Spend dashboard reflects live `ai_usage` rows.

---

#### Implementation Detail — Generate-3-Options

```typescript
// packages/ai-host/workflows/Generate3Options.ts

export async function generate3Options(ctx: WorkflowCtx, region: PlanRegion): Promise<Gen3Result> {
  const preCheck = await ctx.costMeter.preCheckBudget(ctx.projectId, 0.18);
  if (!preCheck.ok) return { status: 'rejected', reason: preCheck.reason };

  const start = performance.now();

  // Fan out three parallel calls; each option capped at $0.05.
  const [optA, optB, optC] = await Promise.all([
    ctx.anthropicRelay(buildOptionPrompt(region, 'minimal')),
    ctx.anthropicRelay(buildOptionPrompt(region, 'efficient')),
    ctx.anthropicRelay(buildOptionPrompt(region, 'generous')),
  ]);

  const elapsed = performance.now() - start;
  const totalCost = optA.costUsd + optB.costUsd + optC.costUsd;

  // Hard verification: at this point we MUST be ≤ $0.18 or we refund and reject.
  if (totalCost > 0.18) {
    await ctx.costMeter.refund(ctx.projectId, totalCost);
    return { status: 'rejected', reason: 'Cost ceiling exceeded post-fan-out' };
  }

  await ctx.costMeter.recordCall('generate-3-options', ctx.projectId, totalCost, elapsed);

  // Each option becomes its own proposal — user picks one or none.
  // Picking commits a transactional batch via command-bus.
  for (const [label, opt] of [['Minimal', optA], ['Efficient', optB], ['Generous', optC]] as const) {
    await ctx.approvalQueue.enqueue({
      workflow: 'generate-3-options',
      proposedCommands: parseCommands(opt.text, region),
      preview: { kind: 'image', url: await renderPreview(opt) },
      estimatedCostUsd: opt.costUsd,
    });
  }

  return { status: 'ok' };
}
```

---

#### Implementation Detail — Voice command surface

```typescript
// packages/ai-host/workflows/VoiceCommand.ts (lazy-loaded)

let _voiceModule: Promise<typeof import('./VoiceCommand.impl')> | null = null;

export async function getVoiceCommand() {
  if (!_voiceModule) _voiceModule = import('./VoiceCommand.impl');
  return _voiceModule;
}

// VoiceCommand.impl.ts handles:
//   1. mic-stream capture
//   2. Whisper-tiny on-device for first-pass intent (low cost)
//   3. fallback to LLM intent classification on failure
//   4. command-palette match → confirm dialog → execute
```

Per K3-A the voice module must remain a separate chunk; its presence in the editor's first-paint bundle is a kill-switch trigger.

---

#### Daily Plan

- **D1**: generate-3-options descriptor + parallel fan-out.
- **D2**: option preview rendering.
- **D3**: cost verification path + refund on overshoot.
- **D4**: approval queue rich card (3 image previews side-by-side).
- **D5**: voice command surface (lazy chunk).
- **D6**: AI Spend dashboard wiring (`pryzm.ai.cost.usd` aggregation).
- **D7**: e2e smoke (region selected → 3 options → pick one → commit).
- **D8**: cost-guardrail verification suite (manufactured overshoot scenarios).
- **D9**: demo.
- **D10**: buffer + beta bug-fix lane standup (last week).

---

#### Exit Criteria for S52

- Generate-3-options workflow lit; 10 beta projects produce options.
- Voice command surface lit + verified to remain a separate chunk.
- AI Spend dashboard reflects live `ai_usage` rows.
- Cost-guardrail verification suite green (overshoot rejected, refund issued, monthly budget respected).
- Beta bug-fix lane closed with zero open P0/P1.

---

### S53 — Visibility-Intent Migration Waves 6–11 + Public AI API Draft
**Weeks 105–106 (Month 27)**

---

#### Context and Why This Matters

Waves 6–11 are the user-discretion side of Visibility-Intent: filter overrides, temporary isolation, hide-element, view-state save/restore, view-template inheritance overrides, and the "ghost layer" for under-construction-while-others-edit workflows. Per SPEC-30 §6 these waves get the same literal-preservation treatment as waves 1–5; per `featureFlags.legacy_vi_fallback` becoming opt-in only this sprint, the legacy 11-wave path is no longer the primary code path.

The retro per SPEC-30 §6 is binding: it confirms the new `plugins/visibility-intent/` is the source of truth, and any divergence from PRYZM 1 behaviour is a logged bug, not a "design decision".

---

#### Implementation Detail — Wave 8 (canonical for the discretion side)

```typescript
// plugins/visibility-intent/waves/w08-temporary-isolation.ts

export function w08TemporaryIsolation(ctx: VisibilityWaveContext): VisibilityResult {
  const { activeView, element, isolation } = ctx;
  if (!isolation.active) return { visible: true }; // not isolating
  // PRYZM 1 verbatim: when isolation is active, only elements in the
  // isolation set are visible; isolation is per-view, not per-project.
  return { visible: isolation.set.has(element.id) };
}
```

---

#### Implementation Detail — Visibility-Intent retro (SPEC-30 §6)

```text
Retro questions (S53 D9):
  1. Are all 11 waves parity-tested vs PRYZM 1 with < 1 px visual diff?
  2. Does `featureFlags.legacy_vi_fallback` default to OFF for all new projects?
  3. Are any beta projects still using legacy_vi_fallback? If so, why?
  4. Are there any wave-ordering bugs discovered in 6–11 that should
     trigger a re-check of waves 1–5?
  5. Are the per-wave OTel spans visible in production?

Sign-off requires Y to all 5.
```

---

#### Daily Plan

- **D1**: wave 6 — view-template inheritance overrides.
- **D2**: wave 7 — filter overrides.
- **D3**: wave 8 — temporary isolation.
- **D4**: wave 9 — hide-element.
- **D5**: wave 10 — view-state save/restore.
- **D6**: wave 11 — ghost layer.
- **D7**: parity tests for waves 6–11; retro per SPEC-30 §6.
- **D8**: `featureFlags.legacy_vi_fallback` flipped to opt-in only.
- **D9**: demo.
- **D10**: public AI API draft (S55+ formalises into REST/WS at S65).

---

#### Exit Criteria for S53

- Waves 6–11 parity-tested with < 1 px visual diff.
- `legacy_vi_fallback` opt-in only.
- Retro signed off.
- Public AI API draft circulated.

---

### S54 — Component Editor Cut + 3A Demo + Bench
**Weeks 107–108 (Month 27)**

---

#### Context and Why This Matters

S54 is the sub-phase 3A wrap. Per `[strategic ADR-018]` T2.2, the component editor (D10 loadable families) is **deferred** from Phase 3A — confirmed dropped per gap review and moved to v2 backlog. The decision is recorded in `apps/bench/reports/M27-3A.md`.

The remainder of S54 is dedicated to the comprehensive bench run, the 3A demo, and the founder-rest gate before S55.

---

#### Daily Plan

- **D1**: component editor formal deferral entered into v2 backlog with rationale.
- **D2**: 3A bench suite assembly (`apps/bench/ai-cost.ts`, `apps/bench/visibility-correctness.ts`).
- **D3**: bench run on baseline + production-scale fixtures.
- **D4**: bench analysis + perf doc updates.
- **D5**: 10-min 3A demo screencast.
- **D6**: `apps/bench/reports/M27-3A.md` published.
- **D7**: lint + cleanup.
- **D8**: demo to beta cohort + feedback collection.
- **D9**: 3A retro.
- **D10**: founder rest day before S55.

---

#### Exit Criteria for S54 (and Sub-phase 3A)

- AI subsystem fully L7.5; cost guardrails verified in production.
- Visibility-Intent waves 1–11 all parity-tested; legacy fallback opt-in only.
- PDF-to-BIM pipeline at "wall extraction next" milestone (S55).
- Beta bug-fix lane closed; zero open P0/P1.
- Component editor formally deferred to v2 with documented rationale.
- `apps/bench/reports/M27-3A.md` published.
- All M24 numbers still green (regression bench).

---

## §3 Phase 3A Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Touch sprint |
|---|---|---|---|---|---|
| R3A-01 | AI host accidentally loaded eagerly during L7.5 promotion | Medium | High | S49 D5 verification re-run; K3-A kill-switch | S49 |
| R3A-02 | CV pipeline cost overshoots $0.05/page | Medium | Medium | Pre-call ceiling + refund path; S50 cost recording calibration | S50 |
| R3A-03 | Generate-3-options exceeds $0.18 ceiling on fan-out | Medium | High | Post-fan-out verification + refund per S52 D3 | S52 |
| R3A-04 | Visibility-Intent wave-ordering bug surfaces in waves 6–11 | Medium | Medium | Per-wave parity tests; retro question 4 in S53 D9 | S53 |
| R3A-05 | Beta bug-fix lane runs over 4 weeks | Medium | High | Daily standup; if not closing by S52 D5, escalate to founder + cut features from S54 | S49–S52 |
| R3A-06 | PDF-to-BIM accuracy unacceptable on real-beta data | High | Medium | Confidence model + review queue (S60); preview gating per ADR-029 Part E (S70) | S50, S60 |
| R3A-07 | Voice command surface bloats first-paint bundle | Low | High | K3-A kill-switch; build-report verification at S52 D5 | S52 |
| R3A-08 | Public AI API draft surfaces design issue requiring rework | Medium | Medium | Draft only; formalisation at S65; 3A draft is non-committal | S53 |
| R3A-09 | Component editor deferral creates user-visible gap | Medium | Medium | Communication plan with beta cohort at S54 D8 | S54 |
| R3A-10 | LLM-relay costs exceed projection at beta scale | Medium | High | Per-project budget enforcement from S43; AI Spend dashboard from S52 | All |

---

## §4 Phase 3A Kill-Switches

- **K3A-A** (= K3-A) — If at end of S54 (M27) AI host has > 5% boot impact, halt 3B. Lazy load is non-negotiable.
- **K3A-B** — If at end of S52 the cost-guardrail verification suite reveals any path that bypasses the per-call ceiling, halt forward 3A work; root-cause + fix; re-verify.
- **K3A-C** — If at end of S53 the Visibility-Intent retro finds any wave-ordering regression vs PRYZM 1, halt forward 3A work; the new module must be parity with the legacy 11-wave engine before flag flip.
- **K3A-D** — If at end of S54 the beta bug-fix lane has any open P0, halt entry to 3B; defer S55 by one week.

---

## §5 Gap-Closure Subphase — Phase 3A (binding; consolidated from `GAP-REVIEW-2026-04-27.md`)

| Sprint | Gap-closure deliverable | Closes |
|---|---|---|
| **S49** | Full L7.5 architectural promotion per SPEC-07 + SPEC-28; cost telemetry → Honeycomb live; `[strategic ADR-029]` (PDF-to-BIM Scope) ratified; SPEC-31 (PDF-to-BIM Pipeline) outline drafted; fixture corpus collection begins. Capacity-cut Tier-1 checkpoint per `[strategic ADR-018]` (T1.7 + T1.8 added per gap review). | SPEC-07, SPEC-28, `[strategic ADR-029]` |
| **S50** | SPEC-31 published; PDF parsing + page classification lit per `[strategic ADR-029]` Part A. | `[strategic ADR-029]` |
| **S51** | AI plan-view critique surface lit per SPEC-28 §3 + SPEC-07 §3 (proposal queue with full UI). | SPEC-07, SPEC-28 |
| **S52** | AI generate-3-options surface lit; cost guardrails verified at $0.18/call ceiling per SPEC-28 §3. Voice command surface lit, verified separate chunk. | SPEC-28 |
| **S53** | Visibility-Intent migration retro per SPEC-30 §6 — confirm legacy 11-wave is no longer the primary path; only `featureFlags.legacy_vi_fallback` retains it. Public AI API draft. | SPEC-30 §6 |
| **S54** | Component editor (D10 loadable families) **deferred per `[strategic ADR-018]` T2.2** — confirmed dropped from Phase 3A; v2 backlog item. | `[strategic ADR-018]` T2.2 |

---

## §6 What Phase 3A Explicitly Did NOT Do

- IFC, DXF, Rhino plugins (Phase 3B).
- Component editor migration (deferred per `[strategic ADR-018]` T2.2 — v2 backlog).
- BCF round-trip (Phase 3B).
- PropertyPanel + PropertyInspector decomposition (Phase 3B).
- Plugin SDK 1.0 publish (Phase 3C).
- Public REST + WS APIs (Phase 3C).
- Marketplace (Phase 3C).
- Headless npm publish (Phase 3C).
- Self-host packaging (Phase 3D).
- PDF-to-BIM public preview (S70, Phase 3D).
- Multi-region sync replication (cut per `[strategic ADR-018]` T1.7).

---

## §7 Phase 3A → 3B Handoff Checklist

- [ ] All M27 3A criteria signed off.
- [ ] `apps/bench/reports/M27-3A.md` published.
- [ ] Beta cohort feedback synthesised.
- [ ] One full week of buffer (founder rest week).
- [ ] No P0/P1 bugs open from beta.
- [ ] AI cost telemetry has 12 weeks of operational data informing budget defaults.
- [ ] Cut-list T1.7 + T1.8 still in effect; T2.2 (component editor) confirmed deferred.
- [ ] `phases/PHASE-3B-Q2-M28-M30-PLUGINS-IFC-DXF-RHINO.md` re-read.

---

*Last updated: 2026-04-27. Owner: Founder + Architecture lead. Conflicts? See Authority note at top. The most narrative-heavy quarter of Phase 3 — three differentiators alive simultaneously for the first time. The most catastrophic failure mode is AI cost overshoot at scale; the most technically subtle is wave-ordering regression in Visibility-Intent waves 6–11.*
