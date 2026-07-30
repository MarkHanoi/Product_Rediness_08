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

## 🇫🇮 = 🇩🇰-lite milestone — "the second fully-automated country"

Finland is the **second country after Denmark to be fully automated**, and the ONLY one whose sole founder
friction is a **self-service key** (create-it-yourself at `omatili.maanmittauslaitos.fi` — no eID, no
contract, no email approval; unlike Denmark's MitID wall or Sweden's BankID wall). The MML parcel provider
is **already built and verified ahead of the key** (`packages/site-parcel-data/src/parcelProviders/mmlParcelProvider.ts`,
25 tests green) — it goes live the instant `MML_API_KEY` is pasted and the `/api/parcel/fi` proxy is wired.

**Success criteria — ALL must go green for the milestone to close:**

| # | Criterion | Owner | Status |
|---|---|---|---|
| 1 | ✅ **MML API key generated** (self-service — the ONLY founder friction) | founder | ⬜ pending key |
| 2 | ✅ **MML parcel lookup operational** — a Helsinki click resolves a real `kiinteistötunnus` via `/api/parcel/fi` | code (proxy wire) | ⬜ provider built; proxy + key pending |
| 3 | ✅ **MML DEM operational** — same key unblocks the MML WCS terrain bake; `terrain.verify.mjs` round-trip | code | ⬜ pending key |
| 4 | ✅ **Ryhti exposes `tehokkuusluku`** (FAR) — confirmed present in the `_ix_` item `properties` | code (probe) | ⬜ UNPROBED (the second-Denmark gate) |
| 5 | ✅ **Ryhti exposes `kerrosluku`** (height/storeys) — confirmed present in the `_ix_` item `properties` | code (probe) | ⬜ UNPROBED |
| 6 | ✅ **Helsinki `computeParcelConfidence` ≥95%** — the cadastre reads off the footprint fallback | code | ⬜ pending key + sample |

> **Founder friction = ONE self-service key.** Criteria 1/3 are gated on the founder's MML key (row 1
> above); criteria 4/5 are the code-only Ryhti `_ix_` probe (no founder action). The parcel provider itself
> is done. Ship the probe before the fix — criteria 4/5 stay ⬜ until the open no-auth GET actually runs
> (`RYHTI_IX_PROBE_URL` in the provider file / [RATE plan Phase A](./RATE-IMPLEMENTATION-PLAN.md)).

## Locked decisions (this session)
- FI = **only self-service unblock** — the MML API key is create-it-yourself; the one easy full-country win, pending the founder's key (founder, 2026-07-30, tracker §0.5).
- FI = **"Denmark-lite", the second fully-automated country** — MML parcel provider built + verified ahead of the key; goes live the instant `MML_API_KEY` lands (2026-07-30).
