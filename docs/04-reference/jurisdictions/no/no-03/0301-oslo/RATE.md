# Data Readiness Rate — Oslo (0301)

**Headline rate: ~33%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (arealformål code + %-BYA or BRA + height) without reading a
> reguleringsbestemmelser text/PDF. Methodology mirrors the cross-jurisdiction benchmark.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Trondheim | ~35% |
| **Oslo** | **~33%** |
| Norway (national) | ~32% |
| Germany (national) | ~28% |

Oslo sits just above the national average despite having the richest tooling (per-parcel grad av utnytting faktaark, nightly plan updates, Planinnsyn) because **the machine-readable WFS status is unconfirmed** — the entire plan data layer is confirmed only as a click-in-map viewer, not a programmatic WFS. If a WFS exists behind Planinnsyn, Oslo's ceiling rises substantially; if not, it remains viewer-only and requires an automation layer. Oslo's faktaark advantage (resolving historical calculation-method era) is real but not yet automatable until its access model is confirmed.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Matrikkelen Eiendomskart Teig) | ✅ Full | Single national WFS, confirmed live, free, no login. | **~95%** |
| Plan existence + boundary (reguleringsplan polygon) | ⚠️ Click-viewer only (WFS TBD) | Planinnsyn confirmed as interactive viewer (nightly updates). Standalone WFS for programmatic query: not confirmed. | **~40%** (plan data clearly exists; machine-readable access not yet confirmed) |
| Arealformål code | ⚠️ Not yet probed | National required field; whether returned by any Oslo WFS is unconfirmed. | **~40%** |
| Hensynssone code (H570 etc.) | ⚠️ Partial | `H570` hensynssone mechanism confirmed applicable in Oslo kommuneplan. Population in any Oslo WFS: TBD. | **~35%** |
| `BestemmelseUtnyttingsgrad` (numeric utilisation in structured field) | ❌ Confirmed stub | National SOSI Plan object-catalog entry for this type is an unfinished placeholder (confirmed 2026-07-24). | **~5%** |
| Grad av utnytting **method** (including historical-method era) | ✅ Partially resolved | TEK17 §§5-1–5-7 + H-2300 B (national method). Oslo's faktaark resolves which historical era applies per parcel — unique to Oslo among studied cities. | **~80% (method and era identification; not the parcel-level value)** |
| Actual %-BYA / BRA value (parcel-level) | ❌ Text/PDF | Bestemmelser-as-prose pattern confirmed nationally; Oslo factaark does not ship the numeric value itself (confirms the applicable method/era only). | **~5%** |
| Height — plan-set (mønehøyde/gesimshøyde) | ❌ Text/PDF | Same bestemmelser-as-prose pattern. Oslo Planinnsyn confirms bestemmelser text is accessible on click; not structured in a WFS attribute. | **~5%** |
| Height — § 29-4 national default | ✅ Shippable | gesimshøyde ≤ 8 m / mønehøyde ≤ 9 m; setback max(½H, 4 m). | **100% (for no-plan parcels only)** |
| Oslo Gul liste (local heritage overlay) | ⚠️ Existence confirmed; format unconfirmed | Oslo Byantikvaren maintains the Gul liste separately from Askeladden. Format/access not confirmed. | **~20%** (exists; not integrable until format confirmed) |
| Reguleringsbestemmelser text access | ✅ Via viewer | Planinnsyn confirms bestemmelser text is accessible per plan on click — access path confirmed, automation feasibility not yet assessed. | **~65%** |
| Planstatus / supersession | ✅ Structured taxonomy | National kodeliste — machine-resolvable in any SOSI Plan-compliant WFS. | **60%** (taxonomy national; Oslo WFS existence TBD) |
| Building points (Matrikkelen Bygningspunkt) | ✅ Open | National, free, no login — location only. | **90%** |
| Building footprint + height (FKB-Bygning) | ⚠️ Licence-gated | Commercial use requires reseller purchase or Kartverket agreement. | **~35%** |
| Terrain (NDH) | ✅ Complete, open | Nationwide, ≥2 pts/m², free, confirmed live. | **100%** |
| Heritage — Kulturminnesøk.no | ✅ Open | ~220,000 objects, free, no login, confirmed live. | **60%** |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Confirm Oslo planregister WFS exists (Geonorge / data.oslo.kommune.no search) | If WFS found with attributes → Oslo rises to ~55–60% (same ceiling as Trondheim post-probe) | Low — 20-minute search |
| Confirm Oslo faktaark is per-parcel dynamic (not static page) | If automatable → Oslo has a unique engine advantage; raises grad-av-utnytting era resolution from "known method" to "automatable per parcel" | Low — inspect URL parameters |
| Confirm Oslo Gul liste format and access | Resolves city-specific heritage overlay gap | Low |
| Resolve FKB-Bygning licence | Unlocks building footprint + height | Medium (process step) |

**Realistic ceiling:**
- If planregister WFS confirmed with arealformål attributes AND faktaark is automatable: **~65–70%** (Oslo would be the highest-rate Norwegian city — matching Madrid's range)
- If WFS confirmed but no structured attributes (geometry + plan ID only): **~40%** (plan boundary access; NLP pipeline for numeric values)
- If no WFS confirmed (viewer only): **~33%** (current estimate; scraping layer adds cost and fragility)

---

*Last updated: 2026-07-24. Planinnsyn viewer and grad av utnytting faktaark confirmed live. Standalone planregister WFS not yet confirmed. `BestemmelseUtnyttingsgrad` national stub confirmed. NDH and Matrikkelen parcel WFS confirmed live.*
