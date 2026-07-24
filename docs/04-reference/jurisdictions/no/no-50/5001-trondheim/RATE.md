# Data Readiness Rate — Trondheim (5001)

**Headline rate: ~35%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (arealformål code + %-BYA or BRA + height) without reading a
> reguleringsbestemmelser text/PDF. Methodology mirrors the cross-jurisdiction benchmark.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| **Trondheim** | **~35%** |
| Norway (national) | ~32% |
| Germany (national) | ~28% |

Trondheim scores slightly above the Norwegian national average because it is the **only studied Norwegian city with a confirmed-open planregister WFS** — which raises confidence on the plan-existence and arealformål-code fields relative to Bergen (not found) and Oslo (viewer-only confirmed). The rate is still held below 40% because (a) `BestemmelseUtnyttingsgrad` is a confirmed unfinished stub in the national SOSI Plan object catalog, and (b) no live GetFeature probe has been run to confirm whether arealformål/hensynssone codes are actually returned as attributes.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Matrikkelen Eiendomskart Teig) | ✅ Full | Single national WFS, confirmed live, free, no login. | **~95%** |
| Plan existence + boundary (reguleringsplan polygon) | ✅ Confirmed open | Geonorge kartkatalog — "Planregister Trondheim kommune" confirmed open, UUID `21c83653-b9c2-4931-bad0-a67e4c0f6be6`. Live WFS endpoint URL not yet fetched; access terms confirmed. | **~70%** (access confirmed; live attribute schema not yet probed) |
| Arealformål code | ⚠️ Expected, not yet probed | SOSI Plan national required field on all plans; confirmed in national produktspesifikasjon. Whether Trondheim's WFS actually returns it as an attribute: TBD from B2 probe. | **~55%** (national requirement; local population unconfirmed) |
| Hensynssone code (H570 etc.) | ⚠️ Expected, not yet probed | Same as arealformål — national kodeliste, national requirement, local population unconfirmed. | **~40%** |
| `BestemmelseUtnyttingsgrad` (numeric utilisation in structured field) | ❌ Confirmed stub | National object-catalog entry for this type is an unfinished placeholder (confirmed 2026-07-24). Do not expect a structured attribute for %-BYA or BRA from any standard WFS call. | **~5%** |
| Grad av utnytting **method** (BYA/%-BYA/BRA/%-BRA) | ✅ Published | TEK17 §§5-1–5-7, H-2300 B — nationally uniform. | **100% (method only; not the parcel-level value)** |
| Actual %-BYA / BRA value (parcel-level) | ❌ Text/PDF | Confirmed for Trondheim example (Brannkvartalet, 2004): prose paragraphs (§1 Avgrensning, §2 Formålet, …). No WFS attribute carrying a numeric value found. | **~5%** |
| Height — plan-set (mønehøyde/gesimshøyde) | ❌ Text/PDF | Same bestemmelser-as-prose pattern. Expression type (relative/kotehøyde) not yet confirmed for Trondheim specifically. | **~5%** |
| Height — § 29-4 national default | ✅ Shippable | gesimshøyde ≤ 8 m / mønehøyde ≤ 9 m; setback max(½H, 4 m). Applies where no plan governs. Confirmed from primary statute. | **100% (for no-plan parcels only)** |
| Setback — § 29-4 fallback | ✅ Shippable | max(½H, 4 m) from neighbour boundary — national, citable. | **100% (for no-plan parcels only)** |
| Reguleringsbestemmelser text access | ✅ HTML/text (1 plan confirmed) | Brannkvartalet (2004) published as parseable HTML — marginally better than Hamburg's PDF-only. Not surveyed broadly. | **~75%** (access; NLP/parsing still required) |
| Planstatus / supersession | ✅ Structured taxonomy | National kodeliste — machine-resolvable. Population in Trondheim WFS: TBD. | **70%** |
| Building points (Matrikkelen Bygningspunkt) | ✅ Open | National, free, no login — location only, no footprint. | **90%** |
| Building footprint + height (FKB-Bygning) | ⚠️ Licence-gated | Free for Norge digitalt parties; commercial use requires reseller purchase. | **~35%** |
| Terrain (NDH) | ✅ Complete, open | nationwide, ≥2 pts/m², free, confirmed live. | **100%** |
| Heritage — Kulturminnesøk.no | ✅ Open | ~220,000 objects, free, no login, confirmed live. | **60%** |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Run B1+B2 probe (fetch WFS endpoint + GetFeature for Trondheim parcel) | If arealformål/hensynssone attributes are present → raises "plan existence + arealformål" fields to ~85%. If geometry only → confirms NLP-pipeline path | Low — 1 dev-day |
| Read one 2020+ Trondheim reguleringsbestemmelser | Confirms whether newer plans have a more structured format than the 2004 Brannkvartalet example | Low |
| Resolve FKB-Bygning licence | Unlocks building footprint + height for the massing engine | Medium (process step, not engineering) |

**Realistic ceiling after WFS probe:**
- If WFS carries arealformål + planstatus attributes: **~55–60%** (zone code structured; numeric values still text)
- If WFS returns geometry + plan ID only: **~35%** (plan boundary confirmed; all numeric values require NLP pipeline)

---

*Last updated: 2026-07-24. Planregister access terms confirmed open; WFS endpoint URL not yet fetched; no GetFeature probe run. `BestemmelseUtnyttingsgrad` national stub confirmed. NDH and Matrikkelen parcel WFS confirmed live.*
