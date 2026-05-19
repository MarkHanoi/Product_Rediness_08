# SPRINT S## AUDIT — &lt;sprint title&gt; — &lt;YYYY-MM-DD&gt;

> **Date**: YYYY-MM-DD
> **Author**: &lt;agent | founder&gt;
> **Scope**: Sprint S##; covers commits in range `<from>..<to>`.
> **Spec source**: `docs/00_NEW_ARCHITECTURE/phases/<phase>.md` §S##

---

## §0 Scoring Summary

The two-column shape (introduced by W-17 of `PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`)
disambiguates "we shipped what was planned" from "the planned thing is closed
end-to-end (no red tests, no deferred bindings, no audit deltas)".

| Sprint | Raw % (planned ⇒ shipped) | Closure % (shipped ⇒ closed) | Red tests | Verdict |
|---|---|---|---|---|
| S## | 0/100 | 0/100 | 0 | DRAFT |

**Definitions**

| Field | What it counts |
|---|---|
| **Raw %** | Of the deliverables enumerated in the spec, how many landed in code. A deliverable is "shipped" when its acceptance criterion can be satisfied by inspecting the repo. |
| **Closure %** | Of the *shipped* deliverables, how many are CLOSED — green tests + no `it.todo` / `xit` / `it.skip` markers + no open follow-up TODOs in the relevant source files. |
| **Red tests** | Number of tests in the affected packages currently red (failing or skipped for cause). Cite each by `package · file · test name`. |
| **Verdict** | One of: DRAFT, OPEN, PARTIAL-RATIFIED, RATIFIED, REGRESSED. |

**Anti-pattern**: scoring 100/100 PARTIAL-RATIFIED. If anything is PARTIAL,
the closure column drops below 100 — by construction.

---

## §1 Verdict

One paragraph. State the verdict and the single sentence that justifies it.
If the verdict is PARTIAL-RATIFIED, name the deferred binding(s) explicitly
(e.g. *"S43 D9 — Supabase cutover gates the M24 §2 restore-verify checkbox;
binding deferred until founder provisioning + 14-day burn-in"*).

---

## §2 Per-exit-criterion

For each numbered exit criterion in the spec, fill one row:

| # | Exit criterion | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | <verbatim from spec> | ✅ / ⚠ / ❌ | `path/to/file.ts:NN` or test name | … |

`✅` = SHIPPED + GREEN. `⚠` = SHIPPED but a deferred binding / partial.
`❌` = NOT SHIPPED. Use the same icons in the per-deliverable table below.

### §2.1 Per-deliverable (D1, D2, …)

| D# | Deliverable | Status | Evidence | Notes |
|---|---|---|---|---|

---

## §3 Deferred bindings

Any item with `⚠` status above MUST appear here with:

| Item | Why deferred | Bound to | Re-audit at |
|---|---|---|---|

The "bound to" column points at a future sprint or W-item. The "re-audit at"
column states when this audit row should flip from `⚠` to `✅` or `❌`.

---

## §4 Cross-references

| Type | Reference | Why it matters |
|---|---|---|
| ADR | `docs/architecture/adr/00XX-*.md` | … |
| Spec | `docs/00_NEW_ARCHITECTURE/specs/SPEC-NN-*.md` §… | … |
| Bench | `apps/bench/reports/<name>-baseline.md` | … |
| Sibling audit | `phases/audits/PHASE-XX-S##-AUDIT-…md` | … |

---

## §5 Red-tests register (W-17 column)

If the affected packages have any red tests, list each with:

| Package | Test file | Test name | Cause | Owner | Closure plan |
|---|---|---|---|---|---|

When this register is empty, write *"No red tests in affected packages."* as
a single line under the heading. Do **not** delete the heading — its
presence is the contract.

---

## §6 Diff-since-last-audit

If a prior audit covered this sprint, list the deltas:

| Audit | Date | Score | Delta from this audit |
|---|---|---|---|

---

## §7 Recommendations

Bullet list. Each bullet is one of:
- `KEEP` — current shape is correct; carry forward.
- `AMEND-ADR` — an ADR needs an amendment block; cite the ADR + the
  paragraph to add.
- `OPEN-W-ITEM` — a new work item is warranted; sketch the file paths +
  effort estimate so the next planning pass can adopt it.

---

## §8 Score derivation

Show the math:

```
Raw %     = <shipped deliverables> / <planned deliverables> × 100
Closure % = <closed (shipped+green)> / <shipped> × 100
```

This section is mandatory so the score is reproducible by the next auditor.

---

*Template version: 2026-04-28 (introduced by W-17 of the Phase-2 close plan).*
