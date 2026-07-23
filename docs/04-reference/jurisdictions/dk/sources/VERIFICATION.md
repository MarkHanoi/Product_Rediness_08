# VERIFICATION — Denmark national zoning (Plandata.dk)

> The L-449 human-verification gate. Draft → published is a human act. This file records who
> checked what, when, against which data version, and **what could NOT be confirmed.**

## Machine-verified (agent, live probe 2026-07-23)

| Claim | How verified | Status |
|---|---|---|
| Plandata WFS is keyless/open | 200 responses to unauthenticated GetCapabilities + GetFeature | ✅ VERIFIED-LIVE |
| Layer type names + fields | GetCapabilities + DescribeFeatureType (JSON) | ✅ VERIFIED-LIVE |
| National feature counts | `resultType=hits` per layer (unfiltered count run BEFORE any ratio — §CONTEXT-DATA-HONESTY) | ✅ VERIFIED-LIVE |
| Area-weighted ramme dim-fill = 61.5% | full national geometry pass (50,627 features), shoelace area in EPSG:25832 | ✅ VERIFIED-LIVE |
| Byzone click-weighted fill | Monte-Carlo, 300 area-weighted points inside byzone (`zonekort_samlet_v`), full selection rule queried live | ✅ VERIFIED-LIVE (binomial CI stated in findings) |
| Byggefelt carries real footprint polygons | sampled features + shoelace areas (4303/749/288 m²) | ✅ VERIFIED-LIVE |

## NOT confirmed (needs a human / Danish planner)

| Open item | Why it needs a human |
|---|---|
| **§USABLE-FALLBACK precedence** (a dimensionless local plan is shadowed by the richer kommuneplanramme beneath it) | This is a *legal* precedence claim about which instrument governs when the more-specific one is silent-on-a-number. A Danish planner must confirm the ramme legitimately governs the omitted dimension. Inherited-open from L-608. |
| **Byggefelt bindingness semantics** (`bygvejledende` = advisory, `bygkunifelt` = building only in field, `iomfangreg` = extent regulated) | Whether a given byggefelt polygon is a *hard* footprint cap or an *illustrative* placement guide depends on these flags + the plan text. Must be confirmed before any byggefelt→coverage feature treats a footprint as a maximum. |
| Whether byzone is the right click denominator vs. all-planned-land | Product decision: the 87% headline uses **byzone** (where a user actually draws a plot). The all-ramme-land number is 61.5%. Founder to confirm which is the "official" D1. |

## Sign-off

- **Agent draft:** 2026-07-23 (L-609). Measurements reproducible from `SOURCES.md` queries.
- **Human published:** ⬜ PENDING — a Danish-planner sign-off on the two legal items above is
  required before the DK path may claim anything beyond `confidence: 'structured'` on the
  individual published numbers (which are already directly cited to `doklink`).
