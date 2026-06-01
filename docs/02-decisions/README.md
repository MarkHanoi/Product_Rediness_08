# 02-decisions — WHAT BINDS

> The decision layer. Numbered. Timestamped. Immutable once merged.
>
> **Supersede by writing a NEW record — never edit a sealed contract or ADR.**

## §1 — What lives here

Every binding architectural decision in PRYZM. Once a contract or ADR is merged, it is immutable — changes require a new numbered record that explicitly supersedes the old one.

| Folder | Owns | Numbering |
|---|---|---|
| [contracts/](./contracts/) | The 30 binding contracts — C00–C30. The "law of the land." | `CNN` (zero-padded) |
| [adrs/](./adrs/) | ~55 Architecture Decision Records. Per-decision rationale that supports the contracts. | `ADR-NNNN` (4-digit, zero-padded) — strategic ADRs are `ADR-NNN` (3-digit) and live in this folder too |
| [principles/](./principles/) | P1–P8 expansions — one file per principle (placeholder; principles are defined in [../01-strategy/engineering-vision.md §2](../01-strategy/engineering-vision.md) for now). | `P-N` |

## §2 — Authority order

1. **Contracts (C-numbered)** — binding rules. Code that disagrees is wrong.
2. **ADRs (ADR-numbered)** — rationale + decision history. A contract may cite an ADR as its justification; if the ADR is superseded, the contract clause should be updated in the next contract revision.
3. **Principles (P-numbered)** — the P1–P8 engineering charter from [01-strategy/engineering-vision.md](../01-strategy/engineering-vision.md). Wins over contracts on conflict.

## §3 — Lifecycle

```
DRAFT  →  RATIFIED  →  (optionally) SUPERSEDED
  ↑          ↑                ↑
  open PR    merged           new record cites this one
             (immutable)      and marks it superseded
```

- **DRAFT** = under discussion. May be edited freely.
- **RATIFIED** = merged. Becomes immutable. Stamped with date + authority statement.
- **SUPERSEDED** = a newer numbered record points to this one and says "use that instead." This file is left in place forever — never delete.

CI gate: any edit to a RATIFIED file fails unless the diff is a `Status: SUPERSEDED by CNN/ADR-NNNN` annotation.

## §4 — Numbering rules

- **Contracts (CNN)**: monotonic. Skipping numbers is allowed when work was abandoned (e.g. C18 was renumbered from `41-*`; C19–C23 are reserved/skipped).
- **ADRs (ADR-NNNN)**: monotonic 4-digit. The first 3 digits identify the ADR; the 4th absorbs sub-versions if needed.
  - Older ADRs use 3-digit format `ADR-NNN` (1–999). New ADRs from 2026-05+ use 4-digit format `ADR-NNNN`.
- **Principles (PN)**: fixed at 8 (P1–P8). New principles are very rare and require leadership sign-off.

## §5 — When to write each type

| Decision shape | What to write | Where |
|---|---|---|
| A binding rule that everyone downstream must obey | **Contract (CNN)** | [contracts/](./contracts/) |
| Why a specific clause in a contract is what it is | **ADR (ADR-NNNN)** | [adrs/](./adrs/) |
| A trade-off you considered and rejected | **ADR** (Status: REJECTED) | [adrs/](./adrs/) |
| A binding architectural commitment (lint-gateable) | **Principle (PN)** — only with leadership approval | [01-strategy/engineering-vision.md](../01-strategy/engineering-vision.md) |
| A specific implementation choice that supports a contract | **Spec (SPEC-NN)** — not here; goes to [03-execution/specs/](../03-execution/specs/) | execution/specs |

## §6 — Indexes

- Contracts index: [contracts/README.md](./contracts/README.md) (C00-INDEX) — conflict order, suite table.
- ADRs index: [adrs/README.md](./adrs/README.md) — chronological + by-topic.

## §7 — What does NOT belong here

- Implementation specs → [03-execution/specs/](../03-execution/specs/)
- Sprint plans → [03-execution/plans/](../03-execution/plans/)
- Live status → [03-execution/status/](../03-execution/status/)
- User-facing guides → [05-guides/](../05-guides/)
- Vision documents → [01-strategy/](../01-strategy/)
