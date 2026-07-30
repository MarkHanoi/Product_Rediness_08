# Data Readiness Rate — Dammam (`sa-dmm-dammam`)

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: ~55%**

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
| **Dammam** | **~55%** |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |

Dammam scores **exactly at the Saudi national average (~55%)** — it is the **cleanest** of the three cities
because it carries *no* city-specific downward pressure. Unlike Jeddah (the Al-Balad UNESCO overlay removes
central parcels from the national-footprint denominator, −2 pts) and Riyadh (the pervasive RCRC/ROSHN
development-authority density zones are the R1 trap surface), Dammam's only local layer is the ordinary Amanat
Eastern Province approved plan for the exact vertical value — the same geo-fenced municipal value every Saudi
city has. So Dammam's rate *is* the national rate: the exact published footprint rule (4 of 6 fields) lifts it
above Barcelona; the geo-fenced exact vertical and geo-fenced live parcel path hold it well below Madrid.

**Failure and empty are not the same value:** Dammam's geo-fenced fields are scored as reachable-in-principle,
not-reachable-from-here — never as absent.

---

## Field-by-field breakdown (identical to national)

| Field | Structured? | Source | Score |
|---|---|---|---|
| Classification | ✅ National taxonomy | §3-1..§3-4; per-parcel assignment geo-fenced (demo = user-picked) | ~70% |
| Ground coverage | ✅ Exact national constant | villa 0.75 §4-1 cl. 1 / apt 0.65 §4-2 cl. 1 | ~95% |
| Front / side / rear setback | ✅ Exact national formula | `max(w/5, {3,2,2})` §4-1/§4-2 cl. 4 | ~75% each |
| Max height — national CEILING | 🟡 Ceiling published; exact geo-fenced | villa ≤14 m §5-1-5 cl. 3 / apt ≤23 m §3-2; exact = Amanat Eastern Province (§4 cl. 1), geo-fenced | ~20% blended |
| Max floors — national CEILING | 🟡 Ceiling published; exact geo-fenced | villa ≤ G+1+annex §3-1; exact geo-fenced | ~20% blended |
| Residential FAR | ❌ Genuine absence | 0 hits; excluded from denominator | N/A |
| Parcel geometry | 🟡 Exists, geo-fenced | Balady `MapServer/28`; demo = user-drawn | ~15% |
| Context buildings / terrain | ⚠️ Global fallback | Microsoft/Google ML footprints; Copernicus GLO-30 | ~45–70% |
| **Heritage overlay** | **✅ None identified** | **No UNESCO-scale conservation district — no refusal surface subtracted (contrast Jeddah's Al-Balad)** | **N/A (no penalty)** |

---

## Why ~55% (= national) and not lower

Dammam has **no city-specific carve-out** that removes parcels from the national-footprint denominator. Jeddah
loses ~2 points to Al-Balad; Dammam loses nothing to heritage. The remaining geo-fence pressures (exact
vertical, live parcel path) are national and apply equally everywhere, so Dammam lands exactly on the national
number. It is the **most defensible ordinary-fabric demo** — the national footprint applies with the fewest
local exceptions.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| In-SA egress / Balady data agreement | Geometry + classification + `NOOFFLOORS` (exact floors) live per parcel → toward Madrid's band | High (business/legal) |
| Amanat Eastern Province per-zone height table (in-SA) | Converts the exact vertical from refusal to cited | Medium (in-SA read) |
| Human `VERIFICATION.md` sign-off on the footprint clauses | Lifts the footprint pack from `estimated-ruleset` to `structured` | Low |
| Confirm Microsoft/Google ML footprint completeness for Dammam | Firms the context building layer from "covered" to a measured fraction | Low (one bbox extract) |

---

*Last updated: 2026-07-24. National footprint identical to Riyadh/Jeddah; no city-specific heritage or density
carve-out, so Dammam's rate equals the national ~55%. Exact vertical + live parcel path geo-fenced nationally.
Context data via global ML fallbacks.*
