# Rate Implementation Plan — Brussels (`21004`) city

**Current LEGISLATION rate:** ~5–10% (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md); composite master
[`RATE.md`](./RATE.md), overall **44 %** on the assessed subset) · **Realistic ceiling:** ~25–35% ·
**Gap to Denmark (~96%):** ~61–91 pts · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Brussels' realistic legislation ceiling is **~25–35%** — the highest of Belgium's three regions, but far
below Denmark (~96%) or even Paris (~35% with headroom to ~55–60%). The ceiling is set not by data access
but by **legal design**: RRU Titre I is a context-relative formula-in-PDF subordinate to the discretionary
*bon aménagement des lieux* test, and no Belgian region publishes a provision-code semantic catalogue. The
composite RATE has more headroom than the legislation rate, because the cheap axes (TERRAIN, HEIGHTS) can be
unblocked with engineering (a DTM route + a building-height probe), independent of the legal ceiling.

## 2 — Phase tracker (composite RATE — all 7 axes)

| Phase | Goal | Axis unlocked | Effort | Status |
|---|---|---|---|---|
| **0** | C63 Phase-1 audit — cheap axes cited; dossier scaffolded | DATA-SRC 40 · CONTEXT 56 → overall 44 % | Complete | ✅ this pass |
| **1** | Belgian-IP probe path; live-verify PRAS + federal CADMAP; add CADMAP parcel provider to `registry.ts` | DATA-SRC (cadastre → `live`); PARCEL sample-ready | Low–Medium | NOT STARTED |
| **2** | Probe federal CADMAP building sublayer (+ UrbIS) for a height attribute | HEIGHTS (unblock if positive) | Low | NOT STARTED |
| **3** | Pin the Bruxelles-Environnement/CIRB DTM route; add a `terrain.mjs` REGIONS row; bake + verify | TERRAIN 0 → 50 → 100 | Medium | NOT STARTED |
| **4** | Run `computeParcelConfidence` over a Brussels sample | PARCEL | Low | NOT STARTED (needs Phase 1) |
| **5** | Read RRU Titre I verbatim; record clause citations; sign `VERIFICATION.md` | LEGISLATION (L-449 gate) | Medium | NOT STARTED |
| **6** | Build the reference-formula gabarit KIND + PRAS/RRU/RRUZ/PPAS precedence resolver + CBS+/TOTEM gates | ENVELOPE | High (~20–25 dev-days) | NOT STARTED |

## 3 — The gap to Denmark (~96%)

- **(a) Legal-design ceiling.** Belgium's structured-fill is capped by the absence of a provision-code
  catalogue and the pervasive discretionary test — a **policy** gap, not a data-engineering one
  (`../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md` PART D).
- **(b) The RRU KIND is the gating item for ENVELOPE.** Without the reference-formula gabarit KIND, the
  RRU Titre I formulas cannot produce parcel-level numbers.
- **(c) TERRAIN + HEIGHTS are engineering-unblockable** independent of the legal ceiling — a DTM route + a
  CADMAP/UrbIS height probe move both from `not-assessed` without touching the law.

## 4 — Dependencies + cross-jurisdiction reuse

- Phase 1 (Belgian-IP access) gates Phases 2/4/5 live work.
- The Phase-6 gabarit KIND is architecturally the **same family** as Paris's ADR-0274 reference-surface +
  gabarit resolver and Porto's *moda da cércea* — build one, reuse the resolver pattern (a shared BE/FR/PT
  investment).
- The federal CADMAP parcel ingestion, once built, serves **all three Belgian regions** identically (the one
  genuine cross-region efficiency — `../../findings/ PART C`).

**Governing documents:** C58 · C63 · ADR-0279 · L-449 · CoBAT · PRAS · RRU Titre I · special laws 8 Aug 1980
+ 12 Jan 1989.

*Last updated: 2026-07-30. Maintainer: UNASSIGNED.*
