# ADRs — Architecture Decision Records

> ~55 ADRs covering per-decision rationale that supports the [contracts](../contracts/).
>
> Follows [Michael Nygard's template](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## §1 — What an ADR is

A single architectural decision, recorded once, never edited. If the decision changes, a NEW ADR supersedes the old one. The old one stays in place forever — historical archeology + traceability for code reviews.

## §2 — Numbering — two co-existing series

This folder consolidates ADRs from two former locations:

| Series | Origin | Format | Range | Era |
|---|---|---|---|---|
| **Strategic ADRs** | `docs/03_PRYZM3/reference/adrs/` (legacy) | `ADR-NNN` (3-digit) | 001–099 | 2025–2026 strategic decisions |
| **Code-level ADRs** | `docs/architecture/adr/` (legacy) | `NNNN-<slug>.md` (4-digit) | 0001–0099 | 2024–2026 sprint-scoped decisions |

Going forward (2026-06-01+), new ADRs use the **4-digit format** (`ADR-NNNN`) starting at the next free number above both series. To disambiguate in body text when both series could match: write `[strategic ADR-NNN]` or `[code-level ADR-NNNN]` explicitly.

## §3 — Lifecycle

```
PROPOSED  →  ACCEPTED  →  (optionally) SUPERSEDED by ADR-NNNN
                     ↘
                       REJECTED  (kept as record of rejected option)
```

A SUPERSEDED ADR is left in place forever. The superseding ADR cites it.

## §4 — When to write an ADR vs a contract

| Situation | What to write |
|---|---|
| "We considered options A, B, C and chose B because…" | **ADR** |
| "Every downstream package MUST follow this rule" | **Contract** ([../contracts/](../contracts/)) |
| "Here is why C03 §2.4 says you can't bypass the command bus" | **ADR** (cited from the contract) |
| "Here is HOW the command bus encodes patches" | **Spec** ([../../03-execution/specs/](../../03-execution/specs/)) |

A contract may cite an ADR. An ADR may cite a contract. An ADR may NOT contradict a contract — if it would, raise a contract revision PR in the same change.

## §5 — Anatomy of an ADR

```markdown
# <NNNN-slug>  OR  ADR-NNN — <Title>

**Status**: PROPOSED | ACCEPTED | REJECTED | SUPERSEDED by …
**Date**: YYYY-MM-DD
**Deciders**: <names or "architecture team">
**Supersedes**: (if applicable) ADR-…
**Related contracts**: (if applicable) C03, C11

## Context
What problem are we solving? What forces are at play?

## Decision
What we chose.

## Consequences
What follows — good, bad, trade-offs.

## Alternatives considered
Other options + why we rejected each.
```

## §6 — Indexes

### Code-level ADRs (4-digit `NNNN-*.md`)

| ID | Title | Status | Sprint | Date |
|---|---|---|---|---|
| 0001 | [Typed-ID brand strategy](./0001-typed-id-brand-strategy.md) | Accepted | S01 | 2026-04-26 |
| 0002 | [Command handler signature](./0002-command-handler-signature.md) | Accepted | S02 | 2026-04-26 |
| 0003 | [Frame scheduler priority vs deadline](./0003-frame-scheduler-priority-vs-deadline.md) | Accepted | S03 | 2026-04-26 |
| 0004 | [MessagePack codec choice](./0004-messagepack-codec-choice.md) | Accepted | S04 | 2026-04-27 |
| 0005 | [Primitive committer interface](./0005-primitive-committer-interface.md) | Accepted | S05 | 2026-04-27 |
| 0006 | [Idle continuation budget](./0006-idle-continuation-budget.md) | Accepted | S07 | 2026-04-27 |
| 0007 | [WebGPU/WebGL2 dual mode](./0007-webgpu-webgl2-dual-mode.md) | Accepted | S07 | 2026-04-27 |
| 0008 | [Wall handler triage](./0008-wall-handler-triage.md) | Accepted | — | — |
| 0009 | [Producer pure function signature](./0009-producer-pure-function-signature.md) | Accepted | — | — |
| 0010 + | (full list — see `ls 00*.md`) | | | |
| 0058 | [Unified Building Graph](./0058-unified-building-graph.md) | Accepted | — | 2026-06-03 |
| 0060 | [Living Design Parameters bind to substrate](./0060-living-design-parameters.md) | Accepted | — | 2026-06-06 |
| 0061 | [Building graph is a bidirectional edit substrate](./0061-building-graph-bidirectional-edit-substrate.md) | PROPOSED | — | 2026-06-08 |
| 0062 | [Layout engine: deterministic combinatorial expansion + rectangular dual-graph solver](./0062-layout-engine-deterministic-graph-solver.md) | Accepted | — | 2026-06-08 |
| 0063 | [House generative-layout doctrine: per-storey apartment pipeline + multi-storey spine only](./0063-house-generative-layout-doctrine.md) | Accepted | — | 2026-06-09 |
| 0064 | [Wind CFD runs client-side on WebGPU + Lattice-Boltzmann (not cloud, not nothing)](./0064-in-browser-wind-cfd-webgpu-lbm.md) | PROPOSED | — | 2026-06-09 |
| 0065 | [Geodata analytical layers are a first-class pluggable-provider subsystem draped on Forma/Cesium](./0065-geodata-analytical-layers-pluggable-provider.md) | PROPOSED | — | 2026-06-09 |

### Strategic ADRs (3-digit `ADR-NNN-*.md`)

| ID | Title | Status |
|---|---|---|
| 001 | Pascal-style adoption | Accepted |
| 002 | CRDT event-log bridge | Accepted |
| 003 | Object storage | Accepted |
| 004 | Wire format | Accepted |
| 005 | Worker pool policy | Accepted |
| 006 | Default render mode | Accepted |
| 007 | Telemetry backend | Accepted |
| 008 | IFC scope | Accepted |
| 009 | Plugin SDK + marketplace | Accepted |
| 010+ | (full list — see `ls ADR-*.md`) | |

The most-cited ADRs in the 2026-05 work:

| ID | Used by |
|---|---|
| ADR-014 | L7.5 promotion (ai-host lazy load) — referenced from [../../01-strategy/architecture.md](../../01-strategy/architecture.md), C09 |
| ADR-029 | drawing-primitives multi-backend + PDF stub — referenced from C24, C29 |
| ADR-031 | Sheets PRYZM 2 S37 substrate — referenced from C24 |
| ADR-032 | Schedules PRYZM 2 S41 substrate — referenced from C28 |
| ADR-033 | Yjs ⇄ Immer EventBridge — referenced from C08 |
| ADR-038 | Plugin SDK manifest — referenced from C07 |
| ADR-039 | IFC Tier 1 round-trip — referenced from C25 |
| ADR-051 | Single-store undo (Zundo) — referenced from C03 |
| ADR-0055 | Wall junction Pascal-style | + ADR-0055A (layered + openings sub-decision) |

## §7 — Update / supersession rule

You don't edit an ACCEPTED ADR. To change a decision:

1. Write a new ADR that explicitly supersedes the old one (cite the number).
2. Mark the old one `Status: SUPERSEDED by …` (this is the ONLY edit ever allowed to a sealed ADR body).
3. Update any contracts that cited the superseded ADR.

CI gate (planned): `tools/ga-gate/check-adr-immutability.ts` — fails any PR that edits an ACCEPTED ADR body except the Status-line annotation.
