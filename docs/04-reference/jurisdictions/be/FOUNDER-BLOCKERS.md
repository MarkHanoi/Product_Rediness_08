# 🇧🇪 Belgium — Founder Blockers (offline actions to advance the RATE)
> Living doc · orchestrator-maintained · reflects [MASTER-ROI-TRACKER](../../../03-execution/plans/MASTER-ROI-TRACKER.md) §0.5/§1. Lists ONLY what the FOUNDER can do offline. Code-only moves noted as "no founder action needed."

**Status:** 🟡 founder-can-act-now (one region decision)

## Founder action items
| # | Blocker | Type | Status | Exact action | Where / link | Unblocks (axis → effect) |
|---|---|---|---|---|---|---|
| 1 | Flanders GRB provider landed; the next region is a founder call (BE is constitutionally region-split). | decision | open | **Confirm Wallonia vs Brussels as the next region** after Flanders. If undecided, code proceeds **Flanders-only**. | [RATE plan](./RATE-IMPLEMENTATION-PLAN.md) · tracker §0.5 (BE row) / §1 (row 12) | PARCEL + DATA-SOURCES → next regional provider behind one `isInBelgium` |

## Code-only moves (no founder action — for reference)
- `FlandersGrbParcelProvider` (GRB Adp, keyless, 18 tests) **LANDED `2da5371c`** — pending the batch `registry.ts` row + `/api/parcel/be-vlg` proxy.
- Wallonia / Brussels next providers wire behind one `isInBelgium` once decision #1 lands.

## Locked decisions (this session)
- BE = **Flanders first** (founder, 2026-07-30, tracker §0.5). National ceiling is capped by the constitutional region-split — a structural fact, not a defect.
