# Data Readiness Rate — Brussels-Capital Region (`be-bru-brussels`) city

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: ~5–10%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> Brussels' open-data reputation.

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
| **Brussels-Capital Region** | **~5–10%** |

Brussels is **Belgium's highest-scoring region** — and still sits below France (~22%). It is the
one Belgian region with something resembling a region-wide numeric-leaning gabarit text (RRU Titre
I: H = P + 3.00 + D), which prevents its score from collapsing to Wallonia's near-zero. The small
non-zero credit (~5–10%) reflects:
- structured GIS layers that DO exist as confirmed queryable attributes (PRAS land-use affectation
  zones; accessibility A/B/C zones under RRU Titre VIII; office-quota "soldes de bureaux admissibles"
  zones under PRAS); and
- the RRU Titre I formula itself, which is computable from geometric inputs (rue width P, parcel
  depth D) — the only such computable formula in any Belgian region.

What prevents Brussels from scoring higher is that **the RRU Titre I formula lives in a PDF
regulation, not a queryable API attribute**; the instrument-priority check (PPAS/RRUZ/PAD > RRU
Titre I) must run per parcel before any formula can be applied; and the origin server for the PRAS
WFS (`gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows`) is bot-blocked from non-Belgian IPs —
making live access to the PRAS and PPAS/RRUZ layers the prerequisite gate for all pack work.

**Why Brussels differs from the national average (~10–14%):**
Brussels scores at or below the national average — not above it, despite being the "best" Belgian
region — because the national blend benefits from near-universal zone-boundary hit across all three
regions (which Brussels shares), while the structured-numeric-fill credit from the RRU Titre I is
bounded by its formula-in-PDF nature and the unresolved bot-detection access problem.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Federal cadastre | CADMAP/CadGIS WFS (AGDP/SPF Finances); CC-equivalent open; VERIFIED LIVE 2026-07-24 | ~90% |
| PRAS zone / land-use affectation | ✅ Structured layer | `PERSPECTIVE_FR:Affectations` on urban.brussels GeoServer; confirmed via cache — direct fetch bot-blocked | ~85% (confirmed by cache; live reachability blocked) |
| Instrument-priority check (PPAS / RRUZ / PAD > RRU) | ⚠️ Partial | PPAS and RRUZ as separate GeoServer layers (cached); what fraction of Brussels parcels fall under a PPAS/RRUZ override vs. the RRU default is unknown — not probed | ~30% (instrument-priority check unrun; which instrument governs is undetermined for each parcel) |
| Height — RRU Titre I formula (H = P + 3.00 + D) | ⚠️ Computable-in-principle; access blocked | Formula confirmed from secondary sources (RRU Titre I Art. 4); canonical primary-text read not completed; live PRAS/RRU WFS access blocked; rue-width (P) source (UrbIS) unconfirmed | ~5% (formula identified; no live computation path confirmed) |
| Setbacks / implantation / profondeur de bâti (RRU Titre I) | ⚠️ Prose formula; access blocked | RRU Titre I Art. 6 — context-relative, same access prerequisite as height | ~5% |
| FAR / floor-area ratio | ❌ Not a primary RRU metric | Brussels uses land-use affectation + gabarit (H = P + 3.00 + D) rather than a FAR ratio; office-quota "soldes de bureaux admissibles" zones are structured but are a quota, not a FAR for residential development | ~0% |
| PPAS numeric provisions (instrument-priority path) | ❔ Exists, not probed | PPAS layers confirmed in cached capabilities; whether any PPAS feature carries a populated numeric height/gabarit attribute is the key open question — not confirmed present, not exhaustively confirmed absent | ~0% (not yet probed) |
| Heritage overlay | ⚠️ Register exists; GIS unconfirmed | Direction du Patrimoine culturel / urban.brussels; queryable geographic layer not independently confirmed live | ~50% |
| CBS+ (Coefficient de Biotope par Surface) | ⚠️ Structured GIS layer (adjacent constraint) | Confirmed as a structured layer in Brussels — a permitting gate, not a height/FAR metric | ~60% (structured but not a fill metric) |
| Existing building footprints / heights | ❔ UrbIS; not independently probed | UrbIS WMS/WFS (`geoservices-urbis.irisnet.be`) confirmed as base map; building-height attribute and LiDAR programme not confirmed | ~30% |
| Terrain / LiDAR | ❔ Unconfirmed standing programme | No standalone Brussels LiDAR programme identified in this pass; UrbIS is not confirmed as a LiDAR-derived building-height product | ~15% |

---

## The structural gap

Brussels' gap from Denmark (~96%) and Spain/Madrid has two components, not one:

**1. The PDF formula barrier.** Brussels' RRU Titre I is the most structured gabarit text in any
Belgian region — but "structured" here means "a formula written in a PDF regulation," not "a
queryable numeric field." H = P + 3.00 + D cannot be looked up from an API; it must be computed
from geometric inputs (rue width P from the UrbIS road layer, parcel depth D from the CADMAP
boundary). Whether the UrbIS road layer carries a queryable `largeur_rue` attribute is unconfirmed.
If it does not, P must be derived geometrically — a different and more complex implementation path.
Until this computation path is confirmed, the formula produces zero structured fills.

**2. The instrument-priority check.** The RRU Titre I is a regional default — it applies only
where a PPAS (commune-level detailed plan), a RRUZ (zoned regional override), or a PAD (Plan
d'Aménagement Directeur) does not provide otherwise. The fraction of Brussels parcels governed by
a PPAS/RRUZ rather than the RRU default is unknown. A grid-sample probe (same method as Germany's
§34-fraction probe) is the prerequisite before any rate estimate can be tightened. In addition,
high-rise construction (> a threshold to be confirmed) requires a per-project RRU derogation with a
*bon-aménagement-des-lieux* justification — a structured numeric answer is unavailable for those
parcels regardless of the formula path.

The consequence is that Brussels' ~5–10% rate is driven almost entirely by the PRAS zone layer
(a boundary + affectation label, not a height/FAR number) and the adjacent structured-but-non-
dimensional CBS+/office-quota GIS layers — not by the RRU Titre I formula, which is confirmed in
theory but unconfirmable in practice until the bot-detection block is resolved and the computation
inputs are verified.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Resolve bot-detection block on `gis.urban.brussels` (Belgian-IP deployment or alternative access) | Unblocks PRAS zone query + PPAS/RRUZ layer access — prerequisite for all further Brussels work; rate unchanged until Phase 2 | Low–Medium |
| Probe UrbIS road layer for a `largeur_rue` / `width` attribute | If confirmed: rue-width (P) is directly queryable; enables the RRU Titre I formula computation for parcels under the RRU default | Low (one GetFeature call once bot-block resolved) |
| Run instrument-priority probe: what fraction of Brussels parcels are governed by a PPAS/RRUZ vs. RRU Titre I default? | Converts the PPAS/RRUZ coverage from unknown to a measured fraction; sets the denominator for the formula-computation path | Medium (grid-sample against PPAS/RRUZ layer once access confirmed) |
| Build the RRU Titre I formula encoder as a new rule KIND (context-relative H = P + 3.00 + D) | For every parcel under the RRU Titre I default with queryable P and D: converts from 0% fill to a computable cited envelope; could raise Brussels from ~5–10% to ~20–30% | High (new rule KIND; requires all prerequisites above) |
| Confirm Brussels heritage overlay as a live, queryable GIS layer | Converts heritage from "register confirmed" to a correctly-refused overlay for protected parcels — raises trust, not fill rate | Medium |

---

*Last updated: 2026-07-24. PRAS/RRUZ layers confirmed via cache only — direct fetch bot-blocked.
RRU Titre I formula identified from secondary sources; primary text not read; no live computation
path confirmed. Federal cadastre VERIFIED LIVE. UrbIS building-height and LiDAR programme
unconfirmed. CBS+ confirmed as structured Brussels GIS layer — adjacent constraint, not a height/FAR
fill metric. Maintainer: UNASSIGNED.*
