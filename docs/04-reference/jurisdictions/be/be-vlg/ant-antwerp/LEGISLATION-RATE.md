# Data Readiness Rate — Antwerp (`be-vlg-antwerp`) city

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: ~0–5%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> Flanders' open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| Belgium (national, blended) | ~10–14% |
| Brussels-Capital Region | ~5–10% |
| **Antwerp (Flanders / VCRO)** | **~0–5%** |

Antwerp sits at the bottom of this benchmark — lower than France (~22%) and below Belgium's
national average — despite being in a region with modern, detailed, free zoning data. The reason
is architectural, not accidental: **Flanders' VCRO deliberately treats the exact height and density
number as something to be determined per permit rather than published per zone**, through two
parallel mechanisms that together eliminate most of the fill potential:

1. **"Vrij" height:** RUPs (ruimtelijke uitvoeringsplannen) frequently leave maximum height
   explicitly "vrij" (free), delegating the numeric question entirely to the *goede ruimtelijke
   ordening* (VCRO Art. 4.3.1) discretionary test. This is a legally correct and common outcome —
   not a data gap, not a field we failed to find. The correct output for such a parcel is an
   explicit refusal: "no numeric ceiling — discretionary review applies."
2. **Art. 7.4.2/2 "clichering":** all percentage-based objectives and provisions in RUPs adopted
   after 1 September 2009 are statutorily void. A significant fraction of potentially-structured
   numeric RUP provisions may be legally non-existent for this reason regardless of what the plan
   text says.

The small non-zero credit (~0–5%) reflects that some RUPs do state explicit numeric height ceilings
(e.g., "maximale bouwhoogte: 12 m"), and the gewestplan + RUP zone boundary layer is confirmed as a
rich, free, structured dataset (via cached capabilities — direct fetch robots-blocked). The ceiling
for the fill rate is bounded by how many Antwerp RUPs actually state a numeric provision that
survives the Art. 7.4.2/2 check — a fraction that is **unknown until the DSI WFS is probed live**.

**Why Antwerp scores lower than Brussels (~5–10%):** Brussels has a region-wide gabarit formula
(RRU Titre I: H = P + 3.00 + D) as a default for every parcel not covered by a PPAS/RRUZ — a
computable non-zero baseline. Flanders has no such region-wide numeric baseline; every parcel routes
through whichever RUP governs it, and many of those RUPs explicitly choose not to state a number.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Federal cadastre | CADMAP/CadGIS WFS (AGDP/SPF Finances); VERIFIED LIVE 2026-07-24 | ~90% |
| Gewestplan / RUP zone boundary hit | ✅ Structured (cached) | Digitaal Vlaanderen DSI WFS (`lu:lu_si_gv`, `lu:lu_gewrup_*`, `lu:lu_prorup_*`); free ("kosteloos"); cached capabilities — direct fetch robots-blocked | ~85–90% (zone boundary confirmed; direct access blocked) |
| RUP determination (does a RUP supersede the gewestplan for this parcel?) | ⚠️ Spatial classification needed | Requires live DSI `lu:lu_si_gv` GetFeature to intersect parcel centroid with RUP polygons | ~0% (classification not run; robots-block unresolved) |
| RUP numeric height provision (where a RUP governs) | ⚠️ Exists in some RUPs; text-PDF access | Where a RUP states "maximale bouwhoogte: X m" or "maximaal N bouwlagen": a structured number exists, but in the voorschriften PDF linked from the DSI feature — not as a queryable numeric API attribute | ~0–5% (a fraction of RUPs state numeric provisions; fraction unknown; access blocked) |
| Height "vrij" (no numeric ceiling by design) | ✅ Correct refusal — no fill | Where a RUP explicitly states height "vrij" (free): the correct output is a *goede ruimtelijke ordening* refusal — not a gap, not a fill | 0% fill (correct behaviour — structured data confirms "no number") |
| Art. 7.4.2/2 nullification (% provisions in post-2009 RUPs) | ✅ Tracked via `lu_hov_*` layer | Flanders DSI includes `lu:lu_hov_*` ("houdingsvlak") layers that track which older provisions have been statutorily nullified — confirmed in cached capabilities | ~0% fill (nullified provisions are void; `lu_hov_*` can flag them automatically once live) |
| Ground coverage (GVR — grondvlakratio) | ⚠️ Exists in some RUPs; possibly void | Some RUPs state a GVR (grondvlakratio, %-based coverage); post-2009 percentage-based provisions subject to Art. 7.4.2/2 nullification | ~0% (post-2009 GVR may be void; pre-2009 GVR fraction unknown) |
| FAR / plot ratio | ❌ No regional standard | Flanders has no region-wide FAR metric; coverage (GVR) is the closest, where stated at all | ~0% |
| Setbacks | ❌ Per-RUP, often discretionary | Set per-zone inside each RUP's voorschriften where stated; otherwise folded into the *goede ruimtelijke ordening* test | ~0% |
| Heritage overlay | ✅ VERIFIED LIVE | `geo.onroerenderfgoed.be/geoserver/wfs`; `bes_monument`, `bes_sd_gezicht`, `bes_arch_site`, `bes_landschap`, `bes_overgangszone` — HTTP 200 confirmed 2026-07-24 | ~90% (confirmed; GetFeature for Antwerp parcel not yet run) |
| GRB LOD1 building heights (DHMV II) | ✅ Free, full coverage expected | `3D GRB — Gebouw LOD1 DHMV II` — block model with reference height; Antwerp NOT in DHMV I gap list (13 named centrumsteden); direct WFS robots-blocked but existence confirmed | ~75% (Antwerp expected full-coverage; direct access blocked) |
| Terrain / LiDAR (DHMV II) | ✅ Free, full-coverage | DHMV II: ~8 pts/m² per strip, ~16 pts/m² average; full Flanders coverage | ~80% |
| Gemeentelijke stedenbouwkundige verordening | ❔ Unknown | Whether Antwerp has adopted a municipal building ordinance with additional numeric provisions is not confirmed in this pass | ~0% (research task — not yet queried) |

---

## The structural gap

Antwerp's near-zero structured fill for height/FAR is not a missing-data problem — Flanders' zoning
data is rich, free, detailed, and (by European standards) modern. The gap is that **Flanders' own
law treats "no numeric ceiling" as a legitimate, frequent, deliberate answer**:

- **VCRO Art. 4.3.1 (*goede ruimtelijke ordening*)** applies to every permit, including inside a
  fully adopted RUP with numeric provisions. Even where a RUP states a maximum height in metres, a
  permit authority may override it under the discretionary compatibility test. A sourced numeric
  value is legally subordinate to this judgment in a non-negligible share of real cases.
- **"Vrij" height** in RUP voorschriften: plans that explicitly leave height "vrij" are not
  drafting failures — they are a conscious legal choice to delegate the numeric question to the
  discretionary test. These parcels cannot be filled by better data engineering.
- **VCRO Art. 7.4.2/2 ("clichering")**: post-1 September 2009 percentage-based provisions in RUPs
  are statutorily void. This blanket nullification means a structured number visible in a plan text
  may be legally non-existent without any case-specific challenge. The `lu_hov_*` tracking layer
  (confirmed in cached DSI capabilities) is the only automated route to flagging these provisions.

The result is that even if the DSI WFS robots-block is resolved and every Antwerp RUP's
voorschriften is read, a significant fraction of Antwerp parcels will correctly produce a "no
numeric ceiling" refusal, not a fill. The fill rate is bounded by the fraction of RUPs that (a)
state a numeric provision and (b) state it as a pre-2009 absolute (not percentage-based) value.
That fraction is **unknown until the DSI WFS is probed live**.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Resolve Flanders DSI/GRB robots-block (probe `mercator.vlaanderen.be` or alternative Flanders WFS endpoint) | Enables live gewestplan/RUP determination per parcel — the prerequisite for all Antwerp fill work; rate unchanged until Phase 2 | Low–Medium |
| Grid-sample probe: what fraction of Antwerp parcels are under a superseding RUP vs. still-active gewestplan? | Converts the RUP/gewestplan split from unknown to a measurement — required before committing a dev-day budget | Medium (grid-sample method; requires DSI access) |
| Grid-sample probe: what fraction of Antwerp RUPs state an explicit numeric height provision (vs. "vrij")? | Establishes the Flanders analogue of Germany's XPlanGML structured-field completeness question; sets the ceiling for numeric fills | Medium (grid-sample; requires RUP voorschriften PDF access) |
| Confirm whether Antwerp has adopted a gemeentelijke stedenbouwkundige verordening with numeric provisions | May add a municipal numeric layer on top of RUP provisions — a city-specific fill path not available in all Flemish municipalities | Low (municipal document search) |
| Build the Art. 7.4.2/2 nullification check against the `lu_hov_*` layer | Automatically flags post-2009 percentage-based provisions as legally void before shipping them as values — prevents a category of wrong fills | Low (once DSI access resolved — `lu_hov_*` is already in the confirmed capabilities) |

---

*Last updated: 2026-07-24. Gewestplan/RUP zone layer and GRB/DHMV-II building heights confirmed via
cache — direct Flanders DSI WFS fetch robots-blocked; `mercator.vlaanderen.be` is the priority
alternative. Flanders heritage WFS (Onroerend Erfgoed) VERIFIED LIVE — HTTP 200. Federal cadastre
VERIFIED LIVE. Antwerp is NOT in the DHMV I centrumsteden gap list — full DHMV-II coverage
expected but not directly confirmed. RUP "vrij" height fraction and Art. 7.4.2/2 nullification
fraction unknown — require live DSI GetFeature probing. Maintainer: UNASSIGNED.*
