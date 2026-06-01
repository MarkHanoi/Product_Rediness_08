# PRYZM 3 — Documentation Root

> **Stamp**: 2026-04-30 (initial consolidation) · **Last verified**: 2026-05-04 (post-Wave-A20 + Wave 36) — 178 markdown files consolidated to 5 canonical documents + reference + archive.
> **Discipline**: when something drifts, **edit one of the 5 docs below**. Do not write `*-AUDIT-2026-MM-DD.md`. Do not create a new plan with a new sprint label. The reason this folder exploded to 178 files in 6 months is that we kept doing both.

PRYZM 3 is the BIM/AEC editor we are building. This folder answers four questions, one per document. Read in order.

---

## The 5 canonical documents

| # | File | Answers | Length |
|---|---|---|---|
| 1 | **[`01-VISION.md`](./01-VISION.md)** | **Where we want to be.** The 8 principles (P1–P8), the 8 layers (L0–L7.5), the 10 differentiators (D1–D10), the 17 non-functional contracts, the 5 customer archetypes, the non-goals, the discipline rules. | ~12 min |
| 2 | **[`02-ARCHITECTURE.md`](./02-ARCHITECTURE.md)** | **The target shape.** The layered model with the boundary lint matrix, the `composeRuntime()` contract, the production startup flow today vs target, the 9 convergence booleans that define when PRYZM 3 exists. | ~10 min |
| 3 | **[`03-CURRENT-STATE.md`](./03-CURRENT-STATE.md)** | **Where we are today.** Live verifier numbers (cast count, EngineBootstrap LOC, rAF owners, etc.), what was done in Phases 1/2/3, what was done in wireup A→H, the 3 confirmed S72 shortcuts, the rolling weekly delta log. | ~15 min |
| 4 | **[`04-PLAN-FORWARD/`](./04-PLAN-FORWARD/)** (folder) | **How we get from #3 to #1.** Wave execution plans (Waves 1–20 + A14–A20 + Wave 35 + Wave 36), discipline rules with PR templates and CI lint, risk register, verifier catalog. **Start at `04-PLAN-FORWARD/README.md`.** | ~5 min (overview) — 2 hr (full) |
| 5 | **[`07-OPEN-ITEMS.md`](./07-OPEN-ITEMS.md)** | **Every open item, warning, and known gap.** GA gate regressions (all fixed), boot warnings, performance issues, external infra deferred, convergence gaps, post-GA certification, technical debt. The single authoritative punch-list. | ~5 min |

**Reading order, by audience**:

- **Founder (new to project)**: README → 01 → 03 (skim) → 04 (skim §0–§3 + §10).
- **Engineer (sprint kickoff)**: 04 §10 (calendar) → 04 §3 (this sprint's wave) → 03 §1 (today's verifiers).
- **New hire (onboarding)**: 01 → 02 → 03 in full. Then go to `reference/` for the depth.
- **Architect / reviewer**: 02 in full → 04 §1 + §4 (the slice schedule).

---

## Conflict order (when docs disagree)

1. **`01-VISION.md`** wins on intent and principles.
2. **`02-ARCHITECTURE.md`** wins on shape and contracts.
3. **`03-CURRENT-STATE.md`** wins on what is actually true today.
4. **`04-PLAN-FORWARD.md`** wins on what we are doing about it.

If `04` proposes something that contradicts `01`, **`01` wins and `04` must change**. If `03` shows something that contradicts `02`, **`03` wins and either the code or `02` must change** (usually the code).

---

## Where everything else lives

- **[`reference/adrs/`](./reference/adrs/)** — 45 architectural decision records (ADR-001 … ADR-044 + the M28 IFC pipeline). Each is a single decision with rationale. **Cite an ADR; never duplicate one.**
- **[`reference/specs/`](./reference/specs/)** — 40 normative specs (SPEC-01 geometry kernel … SPEC-48 constraint solver, plus SPEC-FAMILY-EDITOR). Each defines a contract the code must meet.
- **[`reference/phases/`](./reference/phases/)** — the original per-phase plan documents (PHASE-1 4 quarters, PHASE-2 5 quarters, PHASE-3 8 plans incl. overviews, PHASE-4 post-GA closure). Used for historical sprint scope reference; superseded as a *plan* by `04-PLAN-FORWARD.md`.
- **[`reference/wireup-2026/`](./reference/wireup-2026/)** — the 30 chunks + 8 reconciliation audits from the S72 wireup. The fine-grained PR enumeration of phases A–H. Used as a worklist; superseded as a *plan* by `04-PLAN-FORWARD.md`.
- **[`reference/architecture-detail/`](./reference/architecture-detail/)** — the per-file architectural map (`02-FILE-STRUCTURE.md`, `03-FINAL-MAP.md`) and the Pascal-editor prior-art lens (`04-PASCAL-REFERENCE.md`). Cited from `02-ARCHITECTURE.md §5`.
- **[`reference/plan-detail/`](./reference/plan-detail/)** — the original 36-month master plan (`01-MASTER-36M.md`), the fine-grained per-PR enumeration (`04-LINEAR-EXECUTION.md`), the post-GA roadmap (`05-POST-GA-ROADMAP.md`), and the AEC wishlist (`06-AEC-WISHLIST.md`). Used for back-reference; the operative plan is `04-PLAN-FORWARD.md`.
- **[`reference/status-detail/`](./reference/status-detail/)** — the live process tracker (`01-PROCESS-TRACKER.md`) and the 2,220-LOC missing-items deep dive (`02-LATEST-PHASES-AUDIT.md`). The first is the daily ledger; the second is the deep evidence file behind `03-CURRENT-STATE.md §5`.
- **[`reference/runbooks/`](./reference/runbooks/)** — operational runbooks (currently: DR drill).
- **[`archive/superseded-2026-04-30/`](./archive/superseded-2026-04-30/)** — the docs collapsed by the 2026-04-30 consolidation. Preserved for git history reasons but not authoritative.
- **[`archive/`](./archive/)** other subfolders — older audit trails, duplicates, and amendments superseded before the 2026-04-30 consolidation.

---

## Sibling docs (outside `archive/pryzm3-internal/`)

- **[`docs/02_PRYZM2/`](../02_PRYZM2/)** — PRYZM 2 architecture material (the strangler-fig generation that PRYZM 3 collapses).
- **[`docs/03-execution/plans/PRYZM-4-NEXT-GEN-PLAN.md`](../04_PRYZM4/PRYZM-4-NEXT-GEN-PLAN.md)** — what comes after PRYZM 3. Builds on six months of PRYZM 3 production validation. Calendar target: ~M77.
- **[`docs/02-decisions/contracts/`](../02-decisions/contracts/)** — cross-product contracts that span PRYZM 1→2→3→4.

---

**Numbers in this README last verified 2026-05-04 (post-Wave-A20 + Wave 36). Re-verified every sprint close. If today is significantly later and numbers are stale, see `04-PLAN-FORWARD/12-DISCIPLINE-AND-DOD.md §1` (discipline rules) — recovering the weekly cadence is the highest-priority chore.**
