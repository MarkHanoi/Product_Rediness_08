# ADR-041 — Portfolio Aggregate Placement

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-04-29 (S73-WIRE D2) |
| Closes | `phases/audits/PRYZM2-WIREUP-PLAN-S72/24-pryzm1-src-coverage-audit.md` §24.4 (line 183); `PROCESS-TRACKER.md` §1 open decision row 1 |
| Required by | Sub-phase **G.17** — `DELETE src/portfolio/` (S84) |
| Owner | Architecture lead |
| Default if not ratified | Stay in `apps/headless` (per PROCESS-TRACKER §1) |

---

## Context

`src/portfolio/` contains a single file, `PortfolioSemanticGraph.ts` (~200 LOC), that builds a multi-project semantic graph used by the ProjectHub portfolio overview. Chunk 24 §24.4 records that the `src/` cross-audit found no obvious owner for this file in the new architecture — it does not belong to any element-family plugin, it is not a stores aggregate, and it is not a renderer concern.

Three placements were considered:

| Option | Location | Rationale | Cost |
|---|---|---|---|
| **A** | `apps/headless` | Headless app already owns multi-project portfolio analytics; one file co-located with its consumers | Headless app grows by one module |
| **B** | `packages/stores.portfolio` (new package) | First-class portfolio aggregate package; usable by hub, headless, and marketplace-api alike | New 1-file package; pnpm workspace bloat |
| **C** | `apps/marketplace-api` | Marketplace already aggregates across projects | Co-locates portfolio semantics with marketplace concerns; tight coupling |

The PROCESS-TRACKER default is **A** (`apps/headless`). Chunk 24 §24.4 leaned toward **B** (`packages/stores.portfolio`).

---

## Decision (proposed)

**Option A — co-locate with `apps/headless`.** Move `src/portfolio/PortfolioSemanticGraph.ts` to `apps/headless/src/portfolio/PortfolioSemanticGraph.ts`. The hub consumes it through a typed adapter on `runtime.persistence.portfolio`. No new package is created.

**Rationale**: Adding a 1-file `packages/stores.portfolio` violates the "no single-file packages" convention used throughout the rebuild (cf. `PACKAGE-CLASSIFICATION-2026-04-28.md`). The headless app already aggregates across projects for analytics and is the natural home for cross-project semantic queries. A future split into `packages/portfolio` is reversible if portfolio analytics grow beyond what one module can hold.

---

## Consequences

- **Sub-phase G.17** (S84) deletes `src/portfolio/` after moving the one file.
- The hub's portfolio overview reaches portfolio data through `runtime.persistence.portfolio` (typed slot to be added in Phase B alongside other persistence singletons).
- If portfolio analytics grow > 5 files, this ADR is reopened and re-decided in favour of Option B.

---

## Status transitions

| Date | Status | Note |
|---|---|---|
| 2026-04-29 | Proposed | Authored as Phase A entry-gate stub (PROCESS-TRACKER §4) |
| TBD | Accepted | Founder + Architecture lead ratification |
