# Data Readiness Rate — Jeddah (`sa-jed-jeddah`)

**Headline rate: ~53%**

**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi Arabia (national) | ~55% |
| **Jeddah** | **~53%** |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |

Jeddah scores **marginally below the Saudi national average (~55%)** for one city-specific reason: the
**Al-Balad (Historic Jeddah) heritage overlay**. Everything else is identical to the national picture — the
footprint rule (setbacks + coverage) is the same exact national closed-form, the exact vertical value is the
same geo-fenced municipal/authority value, and the live parcel path is the same geo-fenced Balady service. But
Jeddah carries an **extra structured refusal surface**: parcels inside the UNESCO property + buffer are
governed by a conservation regime the national footprint does not contain, and that overlay's detailed GIS
(JHD, 651 buildings) is not confirmed open. So a fraction of Jeddah clicks (the Al-Balad parcels) return a
*correct refusal* rather than the national footprint — which lowers the fill rate slightly relative to a city
with no heritage overlay (Dammam), exactly as it should.

**Failure and empty are not the same value:** the Al-Balad overlay reduces the *rate* honestly (a refusal is
not a fill), but the refusal is a *correct* answer, not a blank — the parcel is heritage-governed and the
national footprint would over-state.

---

## Field-by-field breakdown (deltas from national in **bold**)

| Field | Structured? | Source | Score |
|---|---|---|---|
| Classification | ✅ National taxonomy | §3-1..§3-4; per-parcel assignment geo-fenced (demo = user-picked) | ~70% |
| Ground coverage | ✅ Exact national constant | villa 0.75 §4-1 cl. 1 / apt 0.65 §4-2 cl. 1 | ~95% |
| Front / side / rear setback | ✅ Exact national formula | `max(w/5, {3,2,2})` §4-1/§4-2 cl. 4 | ~75% each |
| Max height — national CEILING | 🟡 Ceiling published; exact geo-fenced | villa ≤14 m §5-1-5 cl. 3 / apt ≤23 m §3-2; exact = Amanat Jeddah + Jeddah Development Authority (§4 cl. 1 / §1 cl. 3), geo-fenced | ~20% blended |
| Max floors — national CEILING | 🟡 Ceiling published; exact geo-fenced | villa ≤ G+1+annex §3-1; exact geo-fenced | ~20% blended |
| **Al-Balad heritage overlay** | **🟠 Refuse/flag — not held** | **UNESCO WHC boundary public (inscribed 2014); JHD 651-building GIS not confirmed open. A parcel inside → correct refusal, not a fill.** | **~30% (public boundary as a flag; detailed regime unheld)** |
| Residential FAR | ❌ Genuine absence | 0 hits; excluded from denominator | N/A |
| Parcel geometry | 🟡 Exists, geo-fenced | Balady `MapServer/28`; demo = user-drawn | ~15% |
| Context buildings / terrain | ⚠️ Global fallback | Microsoft/Google ML footprints; Copernicus GLO-30 | ~45–70% |

---

## Why ~53% and not ~55%

The national footprint and vertical fields are **identical** to the national score. The ~2-point reduction is
the **Al-Balad refusal surface**: a non-trivial fraction of central Jeddah's most demo-worthy parcels sit
inside the historic district, where the honest answer is a heritage refusal, not the national footprint. This
is the same downward pressure the RCRC/ROSHN development-authority zones exert on Riyadh (the R1 trap), except
Al-Balad is a *conservation* overlay rather than a *densification* one — it removes parcels from the
national-footprint denominator rather than raising their permitted envelope.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Open Al-Balad property/buffer boundary wired as a refuse/flag overlay | Converts Al-Balad parcels from a silent wrong-footprint risk to a correct, cited heritage refusal (raises *trust*, not fill) | Low (UNESCO WHC boundary is public) |
| JHD 651-building GIS data agreement | Would give a building-level conservation answer inside Al-Balad — a *fill*, not just a refusal | Medium (data agreement) |
| In-SA egress / Balady data agreement | Same national lever: geometry + classification + `NOOFFLOORS` (exact floors) live per parcel → toward Madrid's band | High (business/legal) |
| Amanat Jeddah / Jeddah Development Authority per-zone height table (in-SA) | Converts the exact vertical from refusal to cited | Medium (in-SA read) |
| Human `VERIFICATION.md` sign-off on the footprint clauses | Lifts the footprint pack from `estimated-ruleset` to `structured` | Low |

---

*Last updated: 2026-07-24. National footprint identical to Riyadh; the Jeddah-specific delta is the Al-Balad
UNESCO heritage overlay (a correct refusal surface, not a blank). Exact vertical + live parcel path geo-fenced
nationally. Context data via global ML fallbacks.*
