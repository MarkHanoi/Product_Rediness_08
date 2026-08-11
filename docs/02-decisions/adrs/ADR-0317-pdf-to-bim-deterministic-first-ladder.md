# ADR-0317 — PDF-to-BIM is a deterministic-first ladder, not an AI pipeline

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-08-11 |
| Supersedes | `ADR-0229-pdf-to-bim-scope.md` (Accepted 2026-04-27) |
| Closes | The ADR-level authority gap: the SHIPPED ladder had none, and the ADR of record described a product we do not run |
| Owner | Architecture lead + Product |
| Implementation | `apps/ai-worker/src/pdf-to-bim/`; `apps/editor/src/ui/ai/floorplan-import/` |
| Related | `C11` element-creation pipeline; `C15` hosted elements; ADR-0296 (absence is a claim about our search) |
| Tags | `§PDF-BIM-TIER-LADDER`, `§VEC-REJECT-TALLY`, `§PDF-BIM-HONEST-TIER`, `§CONTEXT-DATA-HONESTY` |

---

## Context

**ADR-0229 describes a wholly AI-dependent pipeline. The product does not work that way, and has not for some time.**

ADR-0229 Part A scopes PDF-to-BIM as: *"AI labels each page… AI reads scale bar and drawing notes… hidden-line de-projection + AI symbol recognition for cut walls."* Part C sets a **$10 per-extraction hard cap** with a pre-flight estimate and chunked user approval. Part G explicitly **rejects** "pure rule-based vector extraction (no AI)" as *"too brittle on real-world PDFs"*, and Part F files that same approach as a **Tier-3 capacity cut** entailing *"major moat dilution; only if absolutely necessary."*

What actually ships is a three-rung ladder whose **first two rungs make zero model calls**:

1. **Tier 1 — vector extraction.** Decode the PDF's own pdf.js operator list into vector primitives; classify wall pairs, door-swing arcs and window glazing in millimetre space; adapt to the shared `FloorPlanAnalysis`. Exact — it is the drawing's own geometry, not an estimate of it. `apps/ai-worker/src/pdf-to-bim/{stage1-vectorise,stage2-walls,stage2-openings,adapter-floorplan}.ts`.
2. **Tier 2 — raster CV.** Classical computer vision over the page raster the wizard already rendered: binarize → despeckle → boundary → Hough → **the same stage-2 wall classifier tier 1 uses** → gap/arc/glazing opening classification. Approximate, and says so. `raster-cv.ts`.
3. **Tier 3 — AI vision.** Claude vision, reached only when a relay is configured **and** either (a) the user asked for furniture/plumbing, which no deterministic tier classifies, or (b) both deterministic tiers found nothing.

Each rung terminates: it either produces a `FloorPlanAnalysis` or declines with a computed reason, and the ladder moves on. `FloorPlanCommandBatcher` and the four `§PDF-*` placement fixes run unchanged downstream of all three, because all three emit the same intermediate representation.

The consequence Part G called impossible is the one that matters commercially: **walls, doors, windows and the floor slab never depend on an API key.** The production deploy carries neither `CF_WORKER_URL` nor `ANTHROPIC_API_KEY`. Under ADR-0229 the feature is dead on that deploy. Under the shipped ladder it works, and the "Analyse Floor Plan" button is never disabled.

Leaving ADR-0229 as the sole authority had three costs: the deterministic ladder had **no ADR-level authority** and could be "corrected" back toward AI by anyone reading the corpus in precedence order; two substantial code paths written to serve ADR-0229 sit dead in the tree; and the cost cap ADR-0229 mandates is **not implemented on the path that actually spends money**.

## Decision

### Part A — the ladder is the architecture, and deterministic-first is normative

**Deterministic tiers run first and must never be replaced by, or supplemented with, a model call for work they already do.** Specifically:

- A tier-1 or tier-2 operation may not become an AI call. If a classifier is uncertain, it **refuses and says why** (Part C); it does not ask a model.
- **AI may PROPOSE geometry; deterministic code must VALIDATE it before it becomes authoritative.** An AI guess is never stamped as authored truth. Tier 3 output flows through the same `FloorPlanAnalysis` → `FloorPlanCommandBatcher` validation as the other two.
- Tier 3's *legitimate* scope is (a) furniture and plumbing, which genuinely have no deterministic classifier, and (b) last-resort structure when both deterministic tiers decline.

This reverses ADR-0229 Part G's rejection of rule-based extraction and retires Part F's framing of it as a degradation. Rule-based extraction is not a capacity cut; **it is the primary path**, and the AI path is the fallback.

**CI proof, not assertion.** `apps/editor/src/ui/ai/__tests__/PdfToBimZeroToken.spec.ts` spies `aiService.query` and asserts **zero calls** across every tier-1 and tier-2 outcome — success, fall-through and refusal alike. Before this ADR the zero-token property was an unproven claim in a comment.

### Part B — no rung may report failure and emptiness as the same value

`§CONTEXT-DATA-HONESTY` applies to this pipeline in a specific, testable form:

1. **The layer that knows must be the layer that reports.** A rung returns its decline as a discriminated result (`TierAttempt`), carrying a code and a sentence computed *at the failure site*. Callers forward it. A caller may not substitute a constant.
2. **A capability description is not a failure reason.** The pre-analysis tier PLAN ("this tier does not produce furniture") lives in its own field and may never be rendered as why an import failed.
3. **Rejections are counted and categorised** (`§VEC-REJECT-TALLY`, `rejections.ts`). "0 doors found" and "12 door arcs rejected because the scale makes each one 90 mm wide" must produce different text. Tier 2 already did this via `RasterDiagnostics.gapsRejected`; tier 1 now does it the same way, on purpose, so the two read alike.
4. **A diagnostic never reports a number it did not measure.** Where the schema forces a zero, a sibling field states whether the zero is a measurement.
5. **"It ran and found nothing" ≠ "it never ran" ≠ "it failed."** Three facts, three messages.

### Part C — what is DEAD, and what happens to it

Two bodies of code were written to serve ADR-0229 and are unreachable from any shipping path.

**1. `apps/ai-worker/src/pdf-to-bim/preview-gate.ts` — DEAD. Decision: RETAIN, unwired, and wire it at GA.**

It computes the ADR-0229 Part E "PDF-to-BIM (preview)" release label from five accuracy thresholds. Referenced only by its own barrel entry and its own test; **no editor surface, marketing page or worker job reads `PDF_TO_BIM_RELEASE_LABEL` or calls `evaluatePreviewGate`.** The label ADR-0229 Part E requires us to render is therefore rendered nowhere.

It is retained rather than deleted because the *obligation* survives this supersession — we still owe users an honest accuracy label — and the function is pure, tested and correct. What is missing is the measurement and the wiring. Deleting it would delete the only executable statement of the accuracy bar.

**Two consequences are recorded as open debt, not resolved here:**
- The thresholds in Part E were written for an AI pipeline. Recall and precision for *vector extraction* are a different measurement (a vector PDF's line-work is exact; the question is classification, not detection). The threshold table needs re-derivation per tier.
- Until it is wired, PRYZM ships PDF-to-BIM with **no accuracy label at all**, which is weaker than the "preview" label ADR-0229 mandated. That is a live honesty gap.

**2. `apps/ai-worker/src/cv/**` — DEAD on the client path. Decision: RETAIN as the server-side seam; do not extend.**

The CV pipeline (`handler.ts`, `page-classification.ts`, `floorplan-segmentation.ts`, `runtime.ts`, `storage.ts`) implements ADR-0229's page classification and segmentation as a **queued server-side worker job**, with a `PDF_TO_BIM_PER_PAGE_CEILING_USD = 0.05` pre-call budget check via `CostMeter`. It is reachable only from `apps/ai-worker`'s own barrel and a bench. **The editor's import wizard never touches it** — the wizard's tier 3 calls `/api/anthropic/v1/messages` directly from `FloorPlanAIFactory`.

It is retained because it is the only implementation of the *pre-call budget check* pattern this feature will need if multi-page extraction is ever built (Part D), and because deleting a worker seam is easier than re-deriving it. It is frozen: no new work lands there while the client-side ladder is the product.

> **The strategic point, stated plainly:** the per-page cost ceiling ADR-0229 designed **exists, is tested, and is in the dead half of the codebase.** The half that actually spends money has no ceiling. That is the state Part D addresses.

### Part D — cost cap on the live AI path: OPEN, requires a founder decision

**Current state, measured:**
- The live tier-3 call is `FloorPlanAIFactory.callClaude` → `POST /api/anthropic/v1/messages` (raw `fetch`, `packages/ai-host/src/FloorPlanAIFactory.ts`).
- That route's guards are: `aiLimiter` (20 requests / 15 min / IP), `authMiddleware`, a forced model, a clamped `max_tokens`, and a request-body byte cap.
- **There is no per-extraction USD cap, no pre-flight estimate, and no chunked user approval on this path.** It does not pass through `AiPlane`, `CostMeter` or `@pryzm/ai-spend`, so the call is not even *recorded* against a project budget — `/api/ai/spend/summary` cannot see it.
- ADR-0229 Part C's **$10 per-extraction hard cap is therefore unimplemented** wherever it would bind.

The exposure is materially smaller than ADR-0229 assumed — the deterministic tiers absorb the common case, so the *typical* extraction costs $0 — but it is unbounded per authenticated user within the rate limit, and it is invisible to spend reporting.

**This ADR does not pick a policy.** The options, with what each costs:

- **(i) Route tier 3 through `AiPlane` / `CostMeter` and enforce a per-extraction cap.** Restores ADR-0229 Part C's intent, makes the spend visible in the existing dashboard, and reuses machinery that already exists. Costs: the wizard's direct-`fetch` path must be replaced with the host-mediated one, and a cap breach becomes a user-visible refusal the wizard must render.
- **(ii) Enforce the cap at the BFF route instead** (`/api/anthropic/v1/messages`), covering every caller rather than this one. Broadest coverage, no client change; but the route is generic, so a per-*extraction* cap has to be reconstructed from per-*call* accounting.
- **(iii) Accept the rate limit as the only bound and record the spend for visibility only.** Cheapest; defensible while tier 3 is a rarely-reached fallback. Leaves ADR-0229 Part C formally unmet and gives no protection if a future feature makes tier 3 common.
- **(iv) Remove the paid tier-3 structure fallback entirely** and let tier 3 serve only furniture/plumbing enrichment. Reduces the surface to a genuinely optional feature. Costs a real capability on drawings both deterministic tiers decline.

**Whichever is chosen, one thing is not optional and is decided here: the tier-3 call MUST be recorded against project spend.** An AI call the spend dashboard cannot see is a reporting defect regardless of which cap policy wins. Un-metered *and* un-recorded is the only combination this ADR rules out.

### Part E — what carries over from ADR-0229 unchanged

- Part B's out-of-scope list (MEP, annotations, schedules, multi-PDF reconciliation, photogrammetry) stands.
- Part A's **element scope** — walls, doors, windows, slabs, at LOD 200 — stands. It is now produced deterministically rather than by vision.
- Confidence tagging stands, and is strengthened: deterministic confidence is derived from measured geometry (thickness match, overlap length, arc span) rather than from a model's self-report.
- The SPEC-45 pointer (Part D) stands, and now owes a per-tier accuracy section.

## Consequences

**Positive:**
- The shipped architecture finally has authority. "Deterministic first" is a decision of record, not an implementation accident, so the next contributor cannot restore an AI call on a rule-based path and cite ADR-0229 as licence.
- The moat is *stronger* than ADR-0229 assumed: the feature works with no AI configured at all, which no vision-only competitor can match on an air-gapped or key-less deploy.
- Typical extraction cost is $0.
- Failure reporting is diagnosable rather than merely polite. A user whose scale is miscalibrated is told so, with counts.

**Negative:**
- Two dead code paths are retained rather than deleted, so the tree carries known-unreachable code with a stated reason. Retention without a wiring date decays into rot; Part C's obligations need owners.
- **PDF-to-BIM currently ships with no accuracy label**, weaker than ADR-0229 Part E required, until `preview-gate.ts` is wired and per-tier thresholds are derived.
- **The live AI path is uncapped and unrecorded** until Part D is settled.
- Deterministic extraction genuinely is more brittle on poor scans than vision — ADR-0229 Part G was not wrong about that, only about the conclusion. Tier 2 mitigates it; tier 3 covers the remainder when configured. On a key-less deploy, a bad scan simply fails, and must say so honestly.

## Follow-ups (not closed by this ADR)

1. Wire `evaluatePreviewGate` to a real measurement and render a per-tier accuracy label in the import wizard.
2. Re-derive Part E's thresholds per tier (vector / raster / AI are three different accuracy questions).
3. Settle Part D. Record tier-3 spend regardless of which cap option wins.
4. Decide the fate of `apps/ai-worker/src/cv/**` once multi-page extraction is either scheduled or dropped.
