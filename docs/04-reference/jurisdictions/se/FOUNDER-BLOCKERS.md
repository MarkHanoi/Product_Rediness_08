# 🇸🇪 Sweden — Founder Blockers (offline actions to advance the RATE)
> Living doc · orchestrator-maintained · reflects [MASTER-ROI-TRACKER](../../../03-execution/plans/MASTER-ROI-TRACKER.md) §0.5/§1. Lists ONLY what the FOUNDER can do offline. Code-only moves noted as "no founder action needed."

**Status:** 🟡 founder-can-act-now

## Founder action items
| # | Blocker | Type | Status | Exact action | Where / link | Unblocks (axis → effect) |
|---|---|---|---|---|---|---|
| 1 | National cadastre (Lantmäteriet Fastighetsindelning) + Höjddata elevation are gated behind Swedish eID / BankID — the same identity gate as DK. | api-key(eID-gated) | open | **Email Lantmäteriet** asking whether a **FOREIGN company** can obtain the **INSPIRE Cadastral Parcels Atom download** (Fastighetsindelning) **without** Swedish eID — via an org account, eIDAS, or manual delivery. Ask the **same question for Höjddata** (elevation). | [RATE plan Phase A](./RATE-IMPLEMENTATION-PLAN.md) · tracker §1 (row 8) | PARCEL → cadastral adapter can wire · TERRAIN/HEIGHTS → Höjddata DEM + LiDAR nDSM |
| 2 | Whether SE ships on authoritative cadastre or on an open-data baseline is a founder call. | decision | open | **Confirm SE ships at the OPEN tier**: OSM / Microsoft buildings + Copernicus DEM + municipal-planning crawl now; algorithmic parcel reconstruction later. | tracker §0.5 (locked decisions) | DATA-SOURCES / CONTEXT → open-tier baseline proceeds without eID |

## Code-only moves (no founder action — for reference)
- `isInSweden` predicate + Fastighetsindelning parcel adapter in `parcelProviders/registry.ts` (proven ES/FR/NO/DK pattern) — **once access from action #1 lands**.
- Shared nDSM (DSM−DTM) bake for `lidar_se` over the Stockholm bbox → `tagged` heights; `terrain.verify.mjs` round-trip 50→100.
- NGP land-area fill-rate probe needs an **SE-resident proxy** (Fly `arn`) to defeat the non-SE-IP 403 — a deployment/orchestrator task, not a founder action.

## Locked decisions (this session)
- SE = **offline-legislation + deferred-live-data** — the national cadastre is BankID identity-gated and un-clearable by a foreign founder → **open-tier reframe** (founder, 2026-07-30, tracker §0.5).
