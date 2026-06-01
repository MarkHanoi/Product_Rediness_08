# ADR-036 — Stakeholder Reviewer Pricing: Free Per Project (Unlimited)

| Field | Value |
|---|---|
| Status | Accepted |
| Date | 2026-04-27 |
| Phase | 4 (M37–M42) |
| Deciders | Founder, Product lead |
| Related | SPEC-33, SPEC-58 (outcome pricing) |

## Context

The "Figma-of-BIM" wedge (Motif's thesis) requires every stakeholder (clients, contractors, planning officers, engineers) to access the model. Two pricing models:

1. **Free unlimited reviewer seats per project** — cost absorbed; offset by Pro/Enterprise tiers.
2. **Metered reviewer seats** — per-reviewer fee.

## Decision

**Free unlimited** reviewer seats per project. Reviewers can read, redline, comment, vote — without a paid seat. Anti-fraud: rate-limit 50 new reviewers/project/day; > 50 triggers human review.

## Consequences

**Positive**
- Network effect: every PRYZM project pulls 5–20 stakeholders into PRYZM (vs Motif lock-in or PDF round-trip).
- Removes the "I need to email a PDF" friction permanently.
- Sales motion: project owner buys Pro; their 20 stakeholders see PRYZM daily; conversion follows.
- Beats Motif on price (Motif charges all stakeholders).

**Negative**
- Direct revenue per reviewer = 0; need higher Pro/Enterprise pricing to compensate.
- Hosting cost for reviewer sessions is real.

**Risks**
- Abuse (fake reviewers as cheap viewer seats). Mitigated by anti-fraud rate-limit + invite-only flow.

## Alternatives considered

- **Metered** — rejected: defeats the wedge.
- **Free with cap (e.g. 10/project)** — rejected as insufficient for typical project (avg 15–20 stakeholders).
