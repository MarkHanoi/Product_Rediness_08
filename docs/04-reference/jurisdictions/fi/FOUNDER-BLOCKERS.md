# 🇫🇮 Finland — Founder Blockers (offline actions to advance the RATE)
> Living doc · orchestrator-maintained · reflects [MASTER-ROI-TRACKER](../../../03-execution/plans/MASTER-ROI-TRACKER.md) §0.5/§1. Lists ONLY what the FOUNDER can do offline. Code-only moves noted as "no founder action needed."

**Status:** 🟡 founder-can-act-now — **the EASIEST full-country unblock** (self-service, no eID)

## Founder action items
| # | Blocker | Type | Status | Exact action | Where / link | Unblocks (axis → effect) |
|---|---|---|---|---|---|---|
| 1 | The MML (Maanmittauslaitos) cadastre + WCS terrain are `documented`/key-gated — no `MML_API_KEY` set. But the key is **create-it-yourself online, no email, no eID**. | api-key(self-service) | open | **Self-create an MML API key** at `omatili.maanmittauslaitos.fi`, then hand it over as a repo secret. | [RATE plan Phase B](./RATE-IMPLEMENTATION-PLAN.md) · tracker §1 (row 9) / §2 (rank 10) | PARCEL → MML Kiinteistörekisteri OGC cadastre · TERRAIN → MML WCS DEM (50→100) · DATA-SOURCES cadastre+height slots `documented`→`live` |
| 2 | Ryhti national planning platform is public/no-auth at the plan layer, but any richer org tier is unconfirmed. | credential | open | **Confirm any Ryhti org access** you can obtain (light-touch — the `_ix_` plan probe itself needs no auth). | [RATE plan Phase A](./RATE-IMPLEMENTATION-PLAN.md) | LEGISLATION → hardens the Ryhti attribute path if an org tier helps |

## Code-only moves (no founder action — for reference)
- The **rate-defining `_ix_` probe** — one open, no-auth GET (`pub_valid_ld_plan_ix_gs/items?limit=1`) reading `properties` for `tehokkuusluku`/`kerrosluku`/`kayttotarkoitus` — decides FI's "second-Denmark" ceiling. Orchestrator/code, no founder action.
- `isInFinland` predicate + `MmlParcelProvider` in `registry.ts`; `computeParcelConfidence` Helsinki sample — **once key #1 lands**.
- Shared nDSM module fed KMTK / open-LoD2 inputs → `tagged` heights.

## Locked decisions (this session)
- FI = **only self-service unblock** — the MML API key is create-it-yourself; the one easy full-country win, pending the founder's key (founder, 2026-07-30, tracker §0.5).
