# ADR-029 — PDF-to-BIM Scope (the moat)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `GAP-REVIEW-2026-04-27.md §21.5 (PDF-to-BIM listed as the moat but no SPEC), §29 #25` |
| Required by | Sprint S52 (Phase 3A — full L7.5 promotion) — pre-emptive scope ratification |
| Owner | Architecture lead + Product + AI lead |
| Implementation | `apps/ai-worker/src/pdf-to-bim/`; `plugins/pdf-import/` |
| Spec dependency | `SPEC-07` AI Layer; `SPEC-26` file format §2 (`imports/`); `SPEC-28` cost model §3 |

---

## Context

`08-VISION.md` D2 commits to AI-native operations. The single feature most often cited as PRYZM's moat — across customer interviews and internal strategy — is **PDF → BIM extraction**: a contractor uploads a 2D PDF set, PRYZM produces a partial 3D BIM model the contractor edits.

Despite that, the corpus has **no SPEC for PDF-to-BIM**. It is referenced as "the moat" but never scoped. This ADR ratifies what we ship at GA, what we don't, and where the SPEC lands.

---

## Decision

### Part A — what GA ships (v1, the moat)

A **single-flow extraction**: contractor uploads a PDF set → PRYZM identifies plans / sections / elevations → produces a draft 3D model with walls + doors + windows + slabs (5 element families) at LOD 200 + a confidence-tagged review queue.

**In scope:**
- PDF parsing: PyMuPDF / pdf.js extraction of vector + raster + text streams.
- Page classification: AI labels each page as `plan | section | elevation | detail | schedule | titleblock | other` (Vision model — Sonnet + Vision per SPEC-28 §3).
- Scale / origin recognition: AI reads scale bar + drawing notes.
- Wall extraction: hidden-line de-projection + AI symbol recognition for cut walls.
- Door / window: symbol matching against the symbol library (per SPEC-29 §3.5).
- Slab inference: floor outline from plan boundary.
- **Confidence tagging**: every produced element carries `confidence: 0..1` and review status (`approved | pending | rejected`).
- **Review queue**: contractor walks element-by-element; approve / edit / reject flows feed back to the AI for fine-tuning hints.

**Output**: a `.pryzm` archive with `imports/source.pdf.zst` preserved + a draft project that the contractor edits.

### Part B — what's NOT in scope at GA

- **MEP extraction** (lighting / plumbing / electrical / mechanical). Post-GA.
- **Annotation extraction** (dimensions, tags, notes). Post-GA.
- **Schedule import**. Post-GA.
- **Multi-PDF reconciliation** (when plans + sections describe the same model with conflicts). Post-GA; v1 trusts the plan and uses sections only for height clues.
- **Photogrammetry / scan-to-BIM**. Out of scope; never a v1 surface.
- **Free-tier access**. Free plan is excluded; Personal+ only (per SPEC-28 §2).

### Part C — cost ceiling (per SPEC-28)

PDF-to-BIM is **expensive** by AI cost standards:
- Per-page Vision call: ~$0.05–$0.15.
- Per-page Sonnet refinement: ~$0.05.
- Avg drawing set (15 pages): ~$1.50–$3.00.

Ceilings:
- Per-extraction hard cap: **$10** (Personal/Team) or workspace-configured (Enterprise).
- Pre-flight estimate based on page count + classification.
- Above cap: extraction is split into chunks; user approves each chunk to avoid surprise bills.

### Part D — the SPEC pointer

The full per-step SPEC lands at S50 as **SPEC-45 PDF-to-BIM Pipeline** (this ADR's normative companion).

> **Numbering note (2026-04-28, S50 D5):** the original S50 phase doc + early drafts of this ADR called the companion SPEC "SPEC-31". That number was claimed first by `SPEC-31-LOAD-BENCH-AND-BACKPRESSURE.md` (2026-04-27 founder robustness amendment). To avoid renumbering the load-bench SPEC mid-cycle, the PDF-to-BIM pipeline publishes as **SPEC-45**; see `docs/03-execution/specs/SPEC-45-PDF-TO-BIM-PIPELINE.md` §0 for the full numbering rationale. All other phase doc references to "SPEC-31 PDF-to-BIM" should be read as SPEC-45.

SPEC-45 will define:
- The page-classification prompt (with Sonnet + Vision).
- The wall-symbol matcher.
- The door/window template library.
- The confidence model.
- The review queue UI.
- The fixture corpus (≥50 real PDF sets for parity testing).
- The per-page benches.

### Part E — accuracy bar

GA accuracy bar (measured on the SPEC-31 fixture corpus):
- **Page classification**: ≥ 90% top-1 accuracy.
- **Scale recognition**: ≥ 95% within 5% of true scale.
- **Wall extraction**: precision ≥ 0.85, recall ≥ 0.75 (a "true wall" is one the contractor accepts in review).
- **Door / window**: precision ≥ 0.80 (with confidence tagging, contractor's review burden ≤ 10% of the elements).

If any miss, the feature ships behind a **"PDF-to-BIM (preview)"** label and the marketing positioning reflects it.

### Part F — capacity-cut alignment (per ADR-018)

If velocity slips, PDF-to-BIM has a **graceful degradation** path:
- Tier-1 cut: drop slab inference; ship walls + doors + windows only. Saves ~1 sprint.
- Tier-2 cut: drop door/window symbol library; ship walls + slabs. Saves ~3 sprints.
- Tier-3 cut: drop Vision; pure vector extraction without classification (works only on well-tagged PDFs). Saves ~5 sprints. Major moat dilution; only if absolutely necessary.

These cuts mirror ADR-018's discipline.

### Part G — alternatives evaluated and rejected

- **Pure rule-based vector extraction** (no AI) — too brittle on real-world PDFs.
- **Train our own model** — out of scope for v1; we use foundation models (Anthropic Sonnet + Vision).
- **Outsource to a 3rd-party API (e.g. Hypar)** — partner dependency on the moat is not acceptable.

---

## Consequences

**Positive:**
- The moat is scoped on paper.
- Customer comms can be honest ("walls + doors + windows + slabs at GA, more in v2").
- Cost ceiling protects users + protects PRYZM from runaway bills.
- The deferral path is real (Part F).

**Negative:**
- AI cost is non-trivial (per-extraction $1–$3); pricing tier needs to absorb it.
- Accuracy bar is a release gate; if we miss, "preview" label and sales messaging shift.
- Vision model availability/pricing changes are an external risk; mitigated by SPEC-31 abstracting the model behind a porter.

---

## Phase rollout

- S49 (Phase 3A start) — ADR-029 land; SPEC-31 outline drafted; fixture corpus collection begins.
- S52 — SPEC-31 published; PDF parsing + page classification lit.
- S55 — wall extraction lit.
- S58 — door/window symbol matching lit.
- S60 — confidence model + review queue UI.
- S62 — fixture corpus parity testing; accuracy bar measurement.
- S65 — pricing finalised; cost ceilings enforced.
- S70 — public preview launch.
- S72 (M36 GA) — feature ships under "preview" or full label per Part E gate.
