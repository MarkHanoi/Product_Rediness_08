# 01-strategy — WHY

> The strategic layer. Slow-moving. Leadership-owned. Sets direction for everything downstream.

## §1 — What lives here

Vision and architecture documents that **answer "why are we building this?"**. Changes here are quarterly+; every change has cascading impact on contracts and execution work below.

| Document | Purpose | Authority |
|---|---|---|
| [product-vision.md](./product-vision.md) | The north star — what PRYZM is, what problem it solves, who it serves. Foundation V1.0. | Highest — supersedes all others on conflict |
| [engineering-vision.md](./engineering-vision.md) | Engineering intent: P1–P8 architectural principles · D1–D13 differentiators · 17 NFTs · 5 customer archetypes | Wins over architecture.md |
| [architecture.md](./architecture.md) | System shape: 9-layer model · boundary lint matrix · composition root contract · 9 convergence booleans · CI gates | Wins over contracts |
| [architecture-breakdown.md](./architecture-breakdown.md) | Deep-dive per-package architecture map (54 packages line-by-line, 2026-05-01 audit) | Reference detail under architecture.md |
| [_pryzm3-overview-legacy.md](./_pryzm3-overview-legacy.md) | Historical PRYZM 3 overview from the pre-2026-06-01 docs structure. Kept for archeology; not load-bearing. | Historical |

## §2 — Authority order

When two strategy docs disagree:

1. `product-vision.md` (the business + product north star)
2. `engineering-vision.md` (the engineering charter)
3. `architecture.md` (the system shape)
4. `architecture-breakdown.md` (per-package detail)

When code disagrees with a strategy doc: **the code is wrong**. Raise an ADR in [02-decisions/adrs/](../02-decisions/adrs/) that supersedes the conflicting clause, or fix the code.

## §3 — Reading order for newcomers

If you've never opened the PRYZM codebase before, read in this order:

1. [product-vision.md](./product-vision.md) — 10 min — what + why
2. [engineering-vision.md](./engineering-vision.md) — 15 min — P1–P8 + D1–D13 + NFTs
3. [architecture.md](./architecture.md) — 20 min — system shape + lint gates + convergence booleans
4. [../README.md](../README.md) — top-level navigation
5. [../03-execution/plans/master-architecture-and-capabilities.md](../03-execution/plans/master-architecture-and-capabilities.md) — folder map + capability rollup (the synthesis doc)
6. [../02-decisions/contracts/README.md](../02-decisions/contracts/README.md) — contract suite C00–C30

## §4 — Cadence

Strategy docs change **rarely** (quarterly at most). When they do:

1. Open a strategy-PR with **wide review** (architecture team + leadership).
2. If a P-principle changes, audit every downstream contract for invalidation.
3. If a differentiator (D-number) changes, audit every spec and plan that references it.
4. Stamp the doc with the new date and update [`../README.md`](../README.md) §3 if the authority order shifts.

## §5 — What does NOT belong here

- **Per-decision rationale** → [02-decisions/adrs/](../02-decisions/adrs/)
- **Binding subsystem rules** → [02-decisions/contracts/](../02-decisions/contracts/)
- **Sprint plans / roadmaps** → [03-execution/plans/](../03-execution/plans/)
- **Live status snapshots** → [03-execution/status/](../03-execution/status/)
- **User-facing how-to** → [05-guides/](../05-guides/)
- **Marketing copy** → [03-execution/plans/launch/](../03-execution/plans/launch/) (drafts) or [apps/marketplace-web/](../../apps/marketplace-web/) (live)
