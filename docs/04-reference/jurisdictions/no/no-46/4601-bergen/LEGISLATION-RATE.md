# Data Readiness Rate — Bergen (4601)

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: ~30%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (arealformål code + %-BYA or BRA + height) without reading a
> reguleringsbestemmelser text/PDF. Methodology mirrors the cross-jurisdiction benchmark.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Trondheim | ~35% |
| Oslo | ~33% |
| Norway (national) | ~32% |
| **Bergen** | **~30%** |
| Germany (national) | ~28% |

Bergen sits at the bottom of the Norwegian study because its planregister WFS endpoint has not been located — unlike Trondheim (confirmed open) and Oslo (viewer confirmed). The underlying rate is assumed to be near-identical to Trondheim's once confirmed (same SOSI Plan schema, same national mechanisms), but until the endpoint is found and probed, Bergen's plan-existence and arealformål fields must be scored lower than Trondheim's. The national layers (parcel geometry, terrain, Kulturminnesøk.no) are identical across all three cities.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Matrikkelen Eiendomskart Teig) | ✅ Full | Single national WFS, confirmed live, free, no login. | **~95%** |
| Plan existence + boundary (reguleringsplan polygon) | ❌ Not yet located | Bergen planregister WFS endpoint not found in this pass. Mechanism known (SOSI Plan); delivery not confirmed. | **~20%** (mechanism confirmed; no access path confirmed) |
| Arealformål code | ❌ Not yet probed | National required field; no Bergen WFS to probe. | **~20%** |
| Hensynssone code (H570 etc.) | ⚠️ National mechanism confirmed | Bergen heritage guidance confirms hensynssone H570 / bevaringsområde mechanism is used in Bergen kommuneplan. Population in any Bergen WFS: TBD. | **~30%** (mechanism confirmed; population unconfirmed) |
| `BestemmelseUtnyttingsgrad` (numeric utilisation in structured field) | ❌ Confirmed stub | National SOSI Plan object-catalog entry for this type is an unfinished placeholder (confirmed 2026-07-24). Bergen will be the same. | **~5%** |
| Grad av utnytting **method** | ✅ Published | TEK17 §§5-1–5-7, H-2300 B — nationally uniform, applies to Bergen unchanged. | **100% (method only)** |
| Actual %-BYA / BRA value (parcel-level) | ❌ Text/PDF | Bestemmelser-as-prose pattern expected (confirmed nationally and in Trondheim). | **~5%** |
| Height — plan-set | ❌ Text/PDF | Same bestemmelser-as-prose pattern expected. | **~5%** |
| Height — § 29-4 national default | ✅ Shippable | gesimshøyde ≤ 8 m / mønehøyde ≤ 9 m; setback max(½H, 4 m) — national statute, same for Bergen. | **100% (for no-plan parcels only)** |
| Bergen verneverdig-building list (local heritage overlay) | ⚠️ Existence referenced; format unconfirmed | Bergen's own municipal heritage list referenced in guidance page; access/format not confirmed. | **~15%** (exists; not integrable until format confirmed) |
| Planstatus / supersession | ✅ Structured taxonomy | National kodeliste — machine-resolvable in any SOSI Plan WFS. Bergen WFS: TBD. | **~50%** |
| Building points (Matrikkelen Bygningspunkt) | ✅ Open | National, free, no login — location only. | **90%** |
| Building footprint + height (FKB-Bygning) | ⚠️ Licence-gated | Commercial use requires reseller purchase. | **~35%** |
| Terrain (NDH) | ✅ Complete, open | Nationwide, ≥2 pts/m², free, confirmed live. | **100%** |
| Heritage — Kulturminnesøk.no | ✅ Open | ~220,000 objects, free, no login, confirmed live. | **60%** |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Locate Bergen planregister WFS on Geonorge (10-minute search) | If found with arealformål attributes → Bergen rises to ~55% (same ceiling as Trondheim post-probe) | Low — 10-minute search + 1 dev-day probe |
| Confirm Bergen verneverdig-building list format and access | Resolves city-specific heritage overlay | Low |
| Resolve FKB-Bygning licence | Unlocks building footprint + height | Medium (process step) |

**Expected ceiling once endpoint confirmed:**
- If Bergen WFS carries arealformål + planstatus attributes (expected, based on national mandate): **~55%** — near-identical to Trondheim post-probe
- If Bergen WFS returns geometry + plan ID only: **~35%** — NLP pipeline required
- Bergen is expected to be a near-exact copy of Trondheim's post-probe outcome; the difference is that it has not yet been confirmed

---

*Last updated: 2026-07-24. Bergen planregister WFS endpoint not yet located. Heritage overlay mechanism confirmed from Bergen kommune guidance page. NDH and Matrikkelen parcel WFS confirmed live (national endpoints). `BestemmelseUtnyttingsgrad` national stub confirmed.*
