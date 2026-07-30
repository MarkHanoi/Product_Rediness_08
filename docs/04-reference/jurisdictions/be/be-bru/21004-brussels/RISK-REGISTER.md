# RISK-REGISTER — Brussels (NIS 21004)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another city's / another region's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value. Belgian rules are region-specific (VCRO ≠ CoDT ≠ CoBAT) — never cross-borrow (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset (DATA-SRC + CONTEXT) + flagged `partial`. |
| R3 | Treating the ~5–10 % structured-fill prior as the Axis-2 score | The `LEGISLATION-RATE.md` prior is COARSE; Axis 2 needs an L-449-verified per-clau count + a signed `VERIFICATION.md` (OPEN). |
| R4 | Reporting a Brussels building height | HEIGHTS `not-assessed` (`adapter-limitation`) — GRB LiDAR is Flanders-only, UrbIS unprobed; buildings render OSM `assumed`, never a fabricated metre value. |
| R5 | Claiming TERRAIN exists | `not-assessed` (`pending-implementation`) — no `terrain.mjs` row, `be` verdict `blocked`; no Brussels-Capital DTM route located. Not 0 %. |
| R6 | Shipping an RRU number without its caveats | Any RRU Titre I value is legally subordinate to the discretionary *bon aménagement des lieux* test AND to a PPAS/RRUZ/PAD precedence check — both MUST be surfaced; absent the gabarit KIND, ENVELOPE refuses rather than guesses. |
| R7 | Over-claiming a data feed as `live` | Federal CADMAP + PRAS rated `documented` (0.5) in DATA-SOURCES — CADMAP verified-live but not wired; PRAS bot-blocked + cache-confirmed. Not `live`. |
| R8 | Missing the CBS+ / TOTEM gates | Any demolition/rebuild scenario > 1,000 m² is gated by TOTEM; CBS+ ecological coefficient can gate permittability — track as adjacent layers, never folded silently into FAR. |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns), `../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`.*
