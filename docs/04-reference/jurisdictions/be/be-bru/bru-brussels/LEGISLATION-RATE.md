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
one Belgian region with a region-wide gabarit chapter (RRU Titre I) to anchor a rule pack against,
which prevents its score from collapsing to Wallonia's near-zero. The small non-zero credit (~5–10%)
reflects:
- structured GIS layers that DO exist as confirmed queryable attributes (PRAS land-use affectation
  zones; accessibility A/B/C zones under RRU Titre VIII; office-quota "soldes de bureaux admissibles"
  zones under PRAS); and
- the RRU Titre I **Art. 4 buildable-depth rule** (`depthLimit = min(0.75·parcelDepth, neighbourRule())`),
  now read verbatim and computable from geometric inputs — a genuine, citable envelope constraint (the
  first for any Belgian region).

What prevents Brussels from scoring higher (queryable-attribute rate) is that **the RRU Titre I rules
are computed, not stored as API attributes**; HEIGHT in particular is contextual — there is no per-zone
height table, and the widely-cited `H = P + 3 + D` formula is **NOT located in the official text**
(UNCONFIRMED; height is instead geometry-derived from UrbIS-3D CityGML). The instrument-priority check
(PPAS/RRUZ/PAD > RRU Titre I) must also run per parcel before any rule applies; live PRAS/PPAS/RRUZ
access (the origin `gis.urban.brussels` GeoServer is bot-blocked from non-Belgian IPs, though multiple
official open-data surfaces exist) remains an honest blocker.

**Why Brussels differs from the national average (~10–14%):**
Brussels scores at or below the national average — not above it, despite being the "best" Belgian
region — because the national blend benefits from near-universal zone-boundary hit across all three
regions (which Brussels shares), while the structured-numeric-fill credit from the RRU Titre I is
bounded by its formula-in-PDF nature and the unresolved bot-detection access problem.

---

## Field-by-field breakdown

> **⚠ Founder primary-source dig (2026-07-31) — materially revised.** RRU Titre I is now read from the
> official text (`urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf`, corroborated on etaamb). Two honest
> corrections vs the prior pass: (a) **the widely-cited `H = P + 3.00 + D` height formula is NOT located
> in the official RRU Titre I — it is recorded UNCONFIRMED and MUST NOT be encoded as a rule**; Brussels
> height is contextual, with no per-zone table, and is instead geometry-DERIVABLE from the official
> UrbIS-3D CityGML product (`height = maxRoofZ − minGroundZ`). (b) **buildable DEPTH is fully confirmed
> and encodable from RRU Titre I Art. 4** — the real win. See the revised rows below.

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Federal cadastre (UrbIS combined product) | CADMAP/CadGIS as geometry authority (VERIFIED LIVE 2026-07-24), republished in the official UrbIS "Parcels and buildings" product (parcels + buildings + BeSt addresses; stable `INSPIRE_ID`, `CAPA_ID`/`CAPAKEY` parcel link, `BL_ID` block id) — multi-surface: datastore.brussels GPKG ⭐ · data.gov.be mirror ⭐ · OGC API Features (data.mobility.brussels) · Opendatasoft (opendata.brussels.be) · Urban GeoServer WFS (fallback) | ~90% |
| PRAS zone / land-use affectation | ✅ Structured layer | `PERSPECTIVE_FR:Affectations` on urban.brussels GeoServer; confirmed via cache — direct fetch bot-blocked (multiple official surfaces exist; pick the best live path per the parcel note) | ~85% (confirmed by cache; live reachability blocked) |
| Instrument-priority check (PPAS / RRUZ / PAD > RRU) | ⚠️ Partial — HONEST BLOCKER | PPAS and RRUZ as separate GeoServer layers (cached); what fraction of Brussels parcels fall under a PPAS/RRUZ/PAD override vs. the RRU default is unknown — the instrument-priority chain is an empirical question needing live/Belgian-IP access, not probed | ~30% (instrument-priority chain unrun; which instrument governs is undetermined per parcel) |
| **Buildable DEPTH — RRU Titre I Art. 4** | ✅ **CONFIRMED + ENCODABLE (resolver)** | Art. 4 §1(1): depth ≤ **¾ of parcel depth** (measured excluding the front-setback area, along the parcel median axis). With BOTH neighbours built: ≤ the deeper neighbouring profile **and** ≤ shallower neighbour **+3 m** unless a **≥3 m lateral setback** is provided. One neighbour: neighbour depth **+3 m** unless a 3 m side setback. No neighbours: only the ¾ rule. → `depthLimit = min(0.75·parcelDepth, neighbourRule())` — a **resolver, never a stored number**; needs parcel geometry + neighbour footprints (via `BL_ID` block) from the UrbIS combined product. | ~40% (rule confirmed + encodable; fill pending the resolver + neighbour-footprint join being built) |
| **Implantation — RRU Titre I Art. 3** | ✅ Confirmed (categorical, not metric) | Front façade sits at the **alignment / building line** (an alignment reference, NOT a numeric metre value); construction on/against the shared lateral boundary permitted. Encode front setback = **"alignment"**, not a metre value. | ~30% (categorical rule confirmed; no numeric field) |
| **Height / gabarit** | ⚠️ Contextual — NO per-zone table; formula UNCONFIRMED; geometry-derivable | Brussels height is **contextual**: there is **no per-zone height table**, and the widely-cited `H = P + 3 + D` formula is **NOT located in the official RRU Titre I → UNCONFIRMED; do NOT encode.** Height is instead **geometry-DERIVED** from the official **UrbIS-3D CityGML** product (`height = maxRoofZ − minGroundZ` from RoofSurface/GroundSurface Z) — a reusable CityGML parser, not a stored HEIGHT field. Base UrbIS Buildings has NO height attribute. | ~10% (no legal per-zone number; a geometric-derivation path exists but its schema/CRS/LoD is unprobed) |
| FAR / floor-area ratio | ❌ **Genuinely absent** | Brussels regulates by PRAS use-affectation + gabarit, **not** FAR — there is no Brussels FAR-equivalent. Record `unknown` / `n-a`, **NEVER 0**. (Office-quota "soldes de bureaux admissibles" zones are structured but are a quota, not a residential FAR.) | `n-a` (genuine absence, not a zero fill) |
| Street width P (façade-to-façade) | ✅ Geometrically computable | P is **COMPUTABLE geometrically** (road-polygon median cross-section / street-section layer / façade-to-façade) — NOT blocked on a `largeur_rue` attribute. NB: with the `H = P + 3 + D` formula unconfirmed, P is not currently needed for any confirmed height rule; recorded as available. | ~50% (computable path exists) |
| PPAS numeric provisions (instrument-priority path) | ❔ Exists, not probed — HONEST BLOCKER | PPAS layers confirmed in cached capabilities; whether any PPAS feature carries a populated numeric height/gabarit attribute, and the PPAS coverage fraction, are open — need live access | ~0% (not yet probed) |
| Heritage overlay | ⚠️ Register exists; GIS liveness unconfirmed — HONEST BLOCKER | Direction du Patrimoine culturel / urban.brussels; queryable geographic layer not independently confirmed live | ~50% |
| CBS+ (Coefficient de Biotope par Surface) | ⚠️ Structured GIS layer (adjacent constraint) | Confirmed as a structured layer in Brussels — a permitting gate, not a height/FAR metric | ~60% (structured but not a fill metric) |
| Existing building footprints / heights | ✅ Footprints (UrbIS combined); height via UrbIS-3D | Footprints in the UrbIS "Parcels and buildings" product; **height not in base Buildings** — it is derived from the UrbIS-3D CityGML product (DSM−DTM building-height fields remain an HONEST BLOCKER: schema/field names unconfirmed) | ~40% |
| Terrain / LiDAR | ❔ Unconfirmed standing programme — HONEST BLOCKER | No standalone Brussels LiDAR programme identified; UrbIS-3D CityGML is the candidate elevation surface but its LoD/CRS/coverage is unprobed | ~15% |

---

## The structural gap

Brussels' gap from Denmark (~96%) and Spain/Madrid has two components, not one:

**1. Height is contextual, not tabular — and legally underspecified.** RRU Titre I sets NO per-zone
height table, and the widely-cited `H = P + 3 + D` formula is **not in the official text** (UNCONFIRMED —
not encoded). So there is no *legal* structured height number to look up at all. The tractable path is a
**geometric derivation** from the official UrbIS-3D CityGML product (`height = maxRoofZ − minGroundZ`) — a
reusable CityGML parser, not a stored field — which measures the EXISTING building, not the permitted
gabarit. Its schema/CRS/LoD is unprobed (an honest blocker).

**2. Depth is the confirmed win.** RRU Titre I **Art. 4** IS fully readable and encodable: `depthLimit =
min(0.75·parcelDepth, neighbourRule())`. This is a genuine, citable, computable envelope constraint — the
first for any Belgian region — needing only parcel geometry + neighbour footprints (both in the UrbIS
combined product via `BL_ID`). It is a resolver, not a stored number, so it does not raise the "queryable
attribute" fill rate directly, but it materially raises the realistic ENVELOPE ceiling once built.

**3. The instrument-priority check (unchanged honest blocker).** RRU Titre I is a regional default — it
applies only where a PPAS (commune-level detailed plan), a RRUZ (zoned regional override), or a PAD
(Plan d'Aménagement Directeur) does not provide otherwise. The fraction of Brussels parcels governed by a
PPAS/RRUZ/PAD rather than the RRU default is unknown; the instrument-priority chain is an empirical
question needing live/Belgian-IP access. High-rise construction still requires a per-project derogation
with a *bon-aménagement-des-lieux* justification — no structured answer for those parcels.

The consequence is that Brussels' headline ~5–10% (queryable-attribute) rate is still driven mainly by the
PRAS zone layer and the adjacent CBS+/office-quota GIS layers. What HAS changed is the honest ceiling: the
Art. 4 depth resolver + the UrbIS-3D geometric height give Brussels a real, citable envelope path that did
not exist in the prior pass — provided the remaining live-access blockers (PPAS chain, UrbIS-3D schema) are
resolved. **No headline rate cell is moved here** pending the resolver being built + a live probe.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Build the **RRU Titre I Art. 4 depth resolver** (`depthLimit = min(0.75·parcelDepth, neighbourRule())`) as a new rule KIND, using parcel geometry + neighbour footprints (`BL_ID`) from the UrbIS combined product | The confirmed win — a real citable ENVELOPE constraint for every Brussels parcel; raises the realistic envelope ceiling (resolver, not a queryable-attribute fill) | Medium–High (new resolver KIND; Art. 4 already read) |
| Build the **UrbIS-3D CityGML height parser** (`height = maxRoofZ − minGroundZ`) — a reusable CityGML parser | Gives a geometry-derived EXISTING-building height (not permitted gabarit); reusable across CityGML jurisdictions | Medium (schema/CRS/LoD probe first — honest blocker) |
| Encode **Art. 3 implantation** as front setback = "alignment" (categorical), construction on/against shared boundary | Correct categorical implantation answer (not a fabricated metre value) | Low (rule read) |
| Sync the UrbIS "Parcels and buildings" product nightly (datastore.brussels GPKG ⭐ → PostGIS); use live WFS only as fallback | Removes the bot-block from the critical path; makes parcel + neighbour + footprint queries reliable | Low–Medium |
| Run the **instrument-priority probe** (PPAS/RRUZ/PAD vs RRU-default coverage fraction) | Converts the PPAS/RRUZ/PAD chain from unknown to a measured fraction — the surviving honest blocker | Medium (needs live/Belgian-IP access) |
| Confirm Brussels heritage overlay as a live, queryable GIS layer | Converts heritage from "register confirmed" to a correctly-refused overlay — raises trust, not fill rate | Medium |

> **New rule KIND flagged (not built here).** Brussels needs a **context-relative computed-envelope** KIND
> — the Art. 4 depth resolver above, plus a geometry-derived height from UrbIS-3D. This agent records the
> legislation findings + the parcel provider only; the rule pack is future Phase-C work.

---

*Last updated: 2026-07-31. Founder primary-source dig: RRU Titre I read from the official text
(`urbanisme.irisnet.be/pdf/RRU_Titre_1_FR.pdf` + etaamb). Art. 4 depth = ≤¾ parcel depth + neighbour rule
(CONFIRMED, encodable). Art. 3 implantation = alignment (categorical). Height is CONTEXTUAL — no per-zone
table; `H = P + 3 + D` is UNCONFIRMED from primary text (NOT encoded); height is geometry-derivable from
UrbIS-3D CityGML. FAR genuinely absent (record `n-a`, never 0). Federal cadastre VERIFIED LIVE; UrbIS
"Parcels and buildings" is the combined official surface. HONEST remaining blockers: PPAS/PAD/RRUZ
instrument-priority chain, UrbIS-3D schema/CRS/LoD, PPAS coverage fraction, current PRAS WFS schema,
heritage GIS liveness, building-height (DSM−DTM) fields. Maintainer: UNASSIGNED.*
