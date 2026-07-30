# LEGISLATION-RATE — Riyadh (`sa-ruh-riyadh`) — THE DEMO CITY

> **Renamed 2026-07-30 (C63 §8.1 / L-649):** this file was `RATE.md`. Under the naming convention
> (`../../../_TEMPLATE/NAMING-CONVENTION.md`) `RATE.md` is now the composite 7-axis master scorecard;
> this structured legislation/data-fill number is the **LEGISLATION sub-rate** and FEEDS C63 Axis 2 of
> the composite [`RATE.md`](./RATE.md). The C58/L-449 semantics below are UNCHANGED — only the filename moved.

**Headline rate: ~54%** (structured dimensional fill — legislation axis input, NOT the composite completion)

**Last updated:** 2026-07-24 (content) · 2026-07-30 (renamed) · **Maintainer:** UNASSIGNED

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
| **Riyadh** | **~54%** |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |

Riyadh is the **Saudi demo city** — the home of the authored national-footprint pack
(`packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts`, L-606). Its national footprint is
**byte-identical** to the national picture: the same exact closed-form setback formula
(`max(streetWidth/5, {3,2,2})`, villa §4-1 cl. 4 / apt §4-2 cl. 4), the same flat per-class ground
coverage (villa 0.75 §4-1 cl. 1 / apt 0.65 §4-2 cl. 1), the same national vertical CEILING (villa
≤ 14 m §5-1-5 cl. 3 / apt ≤ 23 m §3-2), and the same geo-fenced Balady `MapServer/28` live parcel path.

Riyadh sits **~1 point below the clean national ~55%** for one city-specific reason: the **pervasiveness
of the RCRC / ROSHN / ADA development-authority density zones**. Riyadh is the Kingdom's densest
concentration of §1 cl. 3 development-authority land (Royal Commission for Riyadh City, ROSHN
mega-communities, King Salman Park, Diriyah Gate, Qiddiya-adjacent corridors) — where the
development-authority regulations *prevail on any conflict* with the national decision, and can override
not only the vertical but, in principle, the footprint itself (§1 cl. 3). A larger fraction of Riyadh
parcels therefore fall on land where the national footprint is not the governing answer than in Dammam
(no giga-project density authority) — a modest downward pressure (**−1 pt vs the clean national
baseline**), smaller than Jeddah's −2 pt Al-Balad heritage *removal* because a development-authority
override typically still yields a *different footprint*, not a pure conservation refusal. On strictly
**ordinary residential fabric** (the demo denominator — development-authority master-plan zones excluded,
Riyadh README §4), Riyadh equals the national ~55%.

**Failure and empty are not the same value:** the geo-fenced fields (parcel geometry, classification,
street width, exact floors/height) are scored as reachable-in-principle, not-reachable-from-here — never
as absent. The Balady service provably carries them, resolved per parcel; it is provably geo-fenced (the
`R1` trap surface for the exact vertical is RCRC/ADA corridor tables, measured on shape as geo-fenced,
not proven absent — L-606 §4).

---

## Field-by-field breakdown (deltas from national in **bold**)

| Field | Structured? | Source | Score |
|---|---|---|---|
| Classification | ✅ National taxonomy | §3-1..§3-4; per-parcel assignment (`MAINLANDUSE` on Balady `MapServer/28`) geo-fenced (demo = user-picked) | ~70% |
| Ground coverage | ✅ Exact national constant | villa 0.75 §4-1 cl. 1 / apt 0.65 §4-2 cl. 1 — the single cleanest field | ~95% |
| Front / side / rear setback | ✅ Exact national formula | `max(w/5, {3,2,2})` §4-1/§4-2 cl. 4; resolved by `resolveSaudiSetbacks` (L-606 §2) | ~75% each |
| Max height — national CEILING | 🟡 Ceiling published; exact geo-fenced | villa ≤14 m §5-1-5 cl. 3 / apt ≤23 m §3-2; exact = Amanat Riyadh approved plan (§4 cl. 1) + RCRC/ADA override (§1 cl. 3), geo-fenced | ~20% blended |
| Max floors — national CEILING | 🟡 Ceiling published; exact geo-fenced | villa ≤ G+1+annex §3-1; exact geo-fenced (`NOOFFLOORS` behind the Balady WAF) | ~20% blended |
| **RCRC / ROSHN / ADA development-authority zones** | **🟠 Refuse/override — not held** | **§1 cl. 3 authorities prevail on conflict; per-corridor FAR/height in PDF design-guide volumes (`rcrc.gov.sa` WAF-rejected, `trc.alriyadh.gov.sa` ECONNREFUSED — L-606 §4). A parcel inside → override, not the national footprint.** | **~15% (the R1 trap surface; excluded from the ordinary-fabric denominator)** |
| Residential FAR | ❌ Genuine absence | 0 hits in the 42-page decision; the "FAR" figures for Riyadh corridors are high-rise/commercial (>23 m, out of scope). Excluded from denominator | N/A |
| Parcel geometry | 🟡 Exists, geo-fenced | Balady `MapServer/28` (deed boundary + geometry); NXDOMAIN on the ArcGIS host + WAF on the proxy from outside SA; demo = user-drawn | ~15% |
| Context buildings / terrain | ⚠️ Global fallback | Microsoft/Google ML footprints (KSA covered); Copernicus GLO-30 DEM. No confirmed open national LoD2/LiDAR (GEOSA licensed) | ~45–70% |

---

## Why ~54% and not ~55%

The national footprint and vertical fields are **identical** to the national score. The ~1-point
reduction is the **RCRC/ROSHN/ADA development-authority pervasiveness**: Riyadh carries the Kingdom's
largest share of §1 cl. 3 land, so a non-trivial fraction of demo-worthy central/northern parcels fall
where a development authority — not the national decision — governs. This is the same *kind* of downward
pressure as Jeddah's Al-Balad, but a **densification/override** surface rather than a **conservation
removal**, and quantified smaller (−1 vs −2) because an override still generally produces a footprint,
whereas Al-Balad removes the parcel from the national-footprint denominator entirely. Dammam, with no
giga-project density authority, has neither pressure and lands exactly on the national ~55% — which is why
Dammam is the cleanest of the three and Riyadh sits just below it.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Wire + human `VERIFICATION.md` sign-off on the authored footprint pack (`saRiyadhDemo.ts`) | Realises Riyadh's ~54% as a **certified structured** footprint answer (lifts the pack `estimated-ruleset` → `structured`); does not raise the number (already credited) but converts it to a shippable product — Riyadh is the furthest-along of the three cities (pack authored, L-606) | Low (wiring TODO + one human sign-off) |
| In-SA egress / Balady data agreement (Riyadh bbox) | Converts parcel geometry + `MAINLANDUSE` + resolved setbacks + `NOOFFLOORS` (exact floors) from geo-fenced to live-structured → toward Madrid's band (~68–75%) | High (business/legal, not engineering) |
| Read RCRC/ADA per-corridor height tables from in-SA | Converts the exact vertical + the R1 development-authority surface from a refusal/override to a cited number for the giga-project corridors | Medium (in-SA read; assert on content, not HTTP 200) |
| Open RCRC/ROSHN master-plan boundary wired as an override/flag overlay | Converts the R1 zones from a silent wrong-footprint risk to a correct, cited override refusal (raises *trust*, not fill) | Medium (boundary sourcing) |

---

*Last updated: 2026-07-24. National footprint identical to Dammam/Jeddah; the Riyadh-specific delta is the
pervasive RCRC/ROSHN/ADA §1 cl. 3 development-authority surface (a −1 pt override pressure vs the clean
national baseline). Exact vertical + live parcel path geo-fenced nationally (measured on shape, L-606 §4).
Footprint pack authored (`saRiyadhDemo.ts`), NOT wired, `estimated-ruleset` pending `VERIFICATION.md`.
Context data via global ML fallbacks. The phased climb: [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md).*
