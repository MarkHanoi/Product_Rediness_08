# 01-strategy — WHY

> The strategic layer. Slow-moving. Leadership-owned. Sets direction for everything downstream.

## §1 — What lives here

Vision, brand, market positioning, platform thesis, operating principles — the documents that **answer "why are we building this and how do we work?"**. Changes here are quarterly+; every change has cascading impact on contracts and execution work below.

### §1.1 — Foundational (the why)

| Document | Purpose | Authority |
|---|---|---|
| [STR-01-manifesto.md](./STR-01-manifesto.md) | Founding intent · brand voice · why-now · who we are not | Highest — the cultural + brand-voice north star |
| [STR-02-product-vision.md](./STR-02-product-vision.md) | The product north star — what PRYZM is, what problem it solves, who it serves, the user journey | Highest on product details |
| [STR-03-engineering-vision.md](./STR-03-engineering-vision.md) | Engineering intent: P1–P8 architectural principles · D1–D13 differentiators · NFTs · customer archetypes | Wins over STR-04-architecture.md |
| [STR-04-architecture.md](./STR-04-architecture.md) | System shape: layered model · boundary lint matrix · composition root · convergence booleans · CI gates | Wins over contracts |
| [STR-05-architecture-breakdown.md](./STR-05-architecture-breakdown.md) | Deep-dive per-package architecture map | Reference detail under STR-04-architecture.md |

### §1.2 — Market + customer (the who and how)

| Document | Purpose |
|---|---|
| [STR-07-positioning.md](./STR-07-positioning.md) | Competitive landscape · differentiation thesis · moats · category definition |
| [STR-09-personas.md](./STR-09-personas.md) | The 5 customer archetypes (C1–C5) with day-in-the-life detail |
| [STR-08-go-to-market.md](./STR-08-go-to-market.md) | Channels · geographies · sales motion · pricing strategy · growth loops · retention |

### §1.3 — Platform + substrate (the strategic bets)

| Document | Purpose |
|---|---|
| [STR-10-platform-strategy.md](./STR-10-platform-strategy.md) | The three pillars (Plugin SDK · Family Platform · Marketplace) · the two-sided flywheel |
| [STR-12-site-and-cognition-strategy.md](./STR-12-site-and-cognition-strategy.md) | The two substrates that distinguish PRYZM: site/geospatial + 7-layer cognition stack |

### §1.4 — Team + risk (the how-we-work and what-could-break)

| Document | Purpose |
|---|---|
| [STR-06-operating-principles.md](./STR-06-operating-principles.md) | How PRYZM the company works · O1–O10 principles · hiring bar · cadence · compensation |
| [STR-15-risks-and-assumptions.md](./STR-15-risks-and-assumptions.md) | Named bets · risk register · mitigation plans · monitoring cadence |

### §1.5 — Historical

The pre-2026-06-01 "PRYZM 3 overview" root doc was moved to [`../archive/pryzm3-internal/pryzm3-overview-legacy.md`](../archive/pryzm3-internal/pryzm3-overview-legacy.md) on 2026-07-16 (legacy archeology, not load-bearing). Every current strategy doc now carries an `STR-NN` code (§1.1–§1.4).

## §2 — Authority order

When two strategy docs disagree:

1. **`STR-01-manifesto.md`** — founding intent + brand voice (foundational)
2. **`STR-02-product-vision.md`** — product north star + user journey
3. **`STR-07-positioning.md`** — competitive + category boundary
4. **`STR-03-engineering-vision.md`** — P1–P8 principles + D1–D13 differentiators
5. **`STR-04-architecture.md`** — system shape
6. **`STR-10-platform-strategy.md`** — platform thesis
7. **`STR-12-site-and-cognition-strategy.md`** — substrate thesis
8. **`STR-09-personas.md`** — customer archetypes
9. **`STR-08-go-to-market.md`** — channel + pricing strategy
10. **`STR-06-operating-principles.md`** — team + culture
11. **`STR-15-risks-and-assumptions.md`** — bets + monitoring
12. **`STR-05-architecture-breakdown.md`** — per-package detail

When code disagrees with a strategy doc: **the code is wrong**. Raise an ADR in [02-decisions/adrs/](../02-decisions/adrs/) that supersedes the conflicting clause, or fix the code. **EXCEPT** when the strategy doc itself is stale — then update the strategy doc.

## §3 — Reading order for newcomers

If you've never opened the PRYZM codebase or context before, read in this order:

1. [STR-01-manifesto.md](./STR-01-manifesto.md) — 10 min — who we are, why we exist
2. [STR-02-product-vision.md](./STR-02-product-vision.md) — 15 min — what we build + user journey
3. [STR-07-positioning.md](./STR-07-positioning.md) — 15 min — competitive landscape
4. [STR-09-personas.md](./STR-09-personas.md) — 15 min — who we serve
5. [STR-03-engineering-vision.md](./STR-03-engineering-vision.md) — 15 min — engineering principles + differentiators
6. [STR-04-architecture.md](./STR-04-architecture.md) — 20 min — system shape
7. [STR-10-platform-strategy.md](./STR-10-platform-strategy.md) — 10 min — the platform thesis
8. [STR-12-site-and-cognition-strategy.md](./STR-12-site-and-cognition-strategy.md) — 10 min — the substrate moats
9. [STR-08-go-to-market.md](./STR-08-go-to-market.md) — 10 min — how we sell
10. [STR-06-operating-principles.md](./STR-06-operating-principles.md) — 10 min — how we work
11. [STR-15-risks-and-assumptions.md](./STR-15-risks-and-assumptions.md) — 10 min — what could break
12. [../README.md](../README.md) — top-level navigation
13. [../02-decisions/contracts/README.md](../02-decisions/contracts/README.md) — C00–C49 contract suite

Total reading time: ~150 minutes. Necessary to internalise the company.

## §4 — Cadence

Strategy docs change **rarely** (quarterly at most). When they do:

1. Open a strategy-PR with **wide review** (architecture team + leadership).
2. If a P-principle changes, audit every downstream contract for invalidation.
3. If a differentiator (D-number) changes, audit every spec and plan that references it.
4. If a brand-voice rule changes, schedule a content sweep.
5. Stamp the doc with the new date and update [`../README.md`](../README.md) §3 if the authority order shifts.

## §5 — What does NOT belong here

- **Per-decision rationale** → [02-decisions/adrs/](../02-decisions/adrs/)
- **Binding subsystem rules** → [02-decisions/contracts/](../02-decisions/contracts/)
- **Sprint plans / roadmaps** → [03-execution/plans/](../03-execution/plans/)
- **Live status snapshots** → [03-execution/status/](../03-execution/status/)
- **User-facing how-to** → [05-guides/](../05-guides/)
- **Marketing copy (live)** → [apps/docs-site/](../../apps/docs-site/) and [apps/marketplace-web/](../../apps/marketplace-web/)
