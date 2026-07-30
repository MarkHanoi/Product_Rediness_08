# Data Readiness Rate — Liège (`be-wal-liege`) city

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: ~0–2%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> Wallonia's open-data reputation.

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
| Antwerp (Flanders / VCRO) | ~0–5% |
| **Liège (Wallonia / CoDT)** | **~0–2%** |

Liège sits at the lowest point of this benchmark. The rate is near-zero not because Wallonia's
zoning data is poor — the plan de secteur WFS is **VERIFIED LIVE, fully open, and modern** (OGC
API Features + WMS, no key required) — but because **the plan de secteur supplies only a broad
land-use affectation and no height, FAR, or setback dimension whatsoever**. What fills the zone-
boundary hit is structurally decoupled from what fills the height/FAR question.

The operative standard for most specific envelope questions in Wallonia is **CoDT Art. D.IV.13**
(*bon aménagement des lieux*) — a mandatory discretionary compatibility test that is close to the
load-bearing mechanism for most real-world permit answers. Unlike Germany's §34 (which applies only
where no B-Plan exists), *bon aménagement des lieux* is layered on top of every permit, including
on zoned parcels. The plan de secteur's coarseness (23 broad-category polygons for all of Wallonia,
adopted 1977–1987) means it does not supply the number; the Guide régional d'urbanisme (GRU) is
explicitly indicative only; and **whether Liège has adopted a Guide communal d'urbanisme (GCU) with
real numeric content is a research task that has not yet been completed**.

The small non-zero credit (~0–2%) reflects the VERIFIED LIVE zone-boundary hit (the plan de secteur
affectation category is a structured, queryable result — a correct zoning label, if not a numeric
envelope answer) and the remote possibility that a GCU, if confirmed adopted, adds isolated numeric
provisions for some zones.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Federal cadastre | CADMAP/CadGIS WFS (AGDP/SPF Finances); VERIFIED LIVE 2026-07-24 | ~90% |
| Plan de secteur zone / affectation | ✅ VERIFIED LIVE | SPW Géoportail `geoservices.wallonie.be/geoserver/inspire_lu/ows`; layers `LU.ZoningElement_pds`, `LU.SpatialPlan_pds`, `LU.SupplementaryRegulation_pds`; full OGC API Features also live; HTTP 200 confirmed 2026-07-24; free, no key | ~95% (zone boundary fully queryable; affectation label = zone d'habitat / activité économique / etc. — no numeric envelope dimension) |
| Height / max floors — structured field | ❌ Not present in plan de secteur | The plan de secteur carries no height or FAR dimension. The GRU is explicitly indicative (non-binding). *Bon aménagement des lieux* (CoDT Art. D.IV.13) is the operative standard — not a lookup table | ~0% |
| FAR / plot ratio | ❌ Not present | No Wallonia-wide FAR metric; plan de secteur does not carry one | ~0% |
| Setbacks | ❌ Discretionary | Folded entirely into the *bon aménagement des lieux* judgment; no structured setback formula confirmed in any Wallonia-wide instrument | ~0% |
| Guide communal d'urbanisme (GCU) — numeric provisions | ❔ NOT YET ASSESSED | Whether Liège has adopted a GCU with real numeric content is unconfirmed. A GCU could add numeric height/coverage provisions for specific zones — or it could be primarily qualitative (design guidance). **This is the highest-value remaining research action for Liège.** | ~0% until GCU status confirmed |
| Schéma de développement communal (SDC) / schéma d'orientation local (SOL) | ⚠️ Strategic, not binding | Confirmed as layers in the Wallonia WMS capabilities (`LU.SpatialPlan_sdc`, `LU.SpatialPlan_sol`); strategic orientation tools — not binding numeric instruments | ~0% fill (orientation guidance, not a numeric envelope) |
| Heritage overlay (AWaP) | ✅ Confirmed (stated) | SPW Géoportail "Patrimoine — biens classés et zones de protection," CC-BY 4.0; existence and licence confirmed; GetCapabilities + GetFeature not independently re-fetched this pass | ~85% (stated — not independently re-probed) |
| Existing building footprints (PICC) | ⚠️ Exists, not probed | PICC (Projet Informatique de Cartographie Continue) — confirmed as a named service via aggregator; field schema and licence not independently fetched | ~40% |
| Terrain / LiDAR | ⚠️ Exists, not independently confirmed | Wallonia LiDAR-derived terrain products via SPW Géoportail; coverage/density parity with Flanders DHMV II not probed | ~40% |

---

## The structural gap

Liège's near-zero fill is a **legal-design gap, not a data-access gap**. The plan de secteur WFS
is the best-confirmed live endpoint in the whole Belgian study — fully open, modern (OGC API
Features), not geo-blocked, not bot-blocked. The rate is near-zero because **the plan de secteur
was designed in 1977–1987 to record broad land-use affectation (zone type), not building envelopes
(height, FAR, setbacks)**. There is no height field in the layer; there is no FAR field; there
never was. This is not a schema gap to be filled — it is a deliberate instrument-design choice from
a generation of planning legislation that predates the idea of machine-readable dimensional data.

The GRU (Guide régional d'urbanisme) was introduced to supply some gabarit guidance but was drafted
as explicitly indicative and non-binding — so even if its provisions were queryable (they are not;
they are a PDF document), shipping them as values would misrepresent their legal weight.

*Bon aménagement des lieux* (CoDT Art. D.IV.13) is therefore not a fallback for a small set of
hard cases — it is the **primary operative mechanism** for most specific envelope questions in
Liège. The correct output for most clicks on a Liège parcel is a reasoned refusal: "zone d'habitat
— no numeric ceiling published; *bon aménagement des lieux* applies as the operative standard." A
system that fills a number here without a GCU or a confirmed municipal instrument is mis-stating the
law.

**The GCU is the one realistic path to improving Liège's rate without a regional policy change.**
If Liège has adopted a GCU with numeric height or coverage provisions for some zones, those
provisions would be the only structured numeric fills available. Without confirming the GCU, no
honest rate estimate above ~0–2% is possible.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Confirm whether Liège has adopted a Guide communal d'urbanisme (GCU); if yes, obtain the text and extract any numeric provisions | The single highest-value research action — determines whether Liège's ceiling is ~5–10% (GCU with content) or stays at ~0–2% (no GCU or qualitative-only GCU) | Low (municipal document search + legal read) |
| Run WFS GetFeature against `LU.ZoningElement_pds` for a known Liège parcel | Confirms the live zone-affectation query path end-to-end; closes the "endpoint live but GetFeature untested" gap | Low (endpoint already VERIFIED LIVE) |
| Fetch AWaP heritage layer (SPW Géoportail) GetCapabilities + GetFeature for Liège area | Confirms heritage overlay schema and coverage; converts "stated" to "VERIFIED LIVE" | Low |
| Probe Wallonia PICC building-footprint WFS and LiDAR terrain product for field schema + coverage | Confirms context-data layer parity with Flanders; required before any Liège context-data dev-day estimate | Low–Medium |
| Regional policy change: Wallonia adopts a provision-code catalogue or a binding numeric GRU | The structural intervention — if the GRU were binding and its provisions numeric, Wallonia's rate could approach ~20–30%; if a Planbestämmelsekatalog equivalent were adopted, higher still | Political/administrative — not currently underway |

---

*Last updated: 2026-07-24. Plan de secteur WMS + OGC API Features VERIFIED LIVE — HTTP 200,
full capabilities returned; GetFeature for a specific Liège parcel not yet run. Federal cadastre
VERIFIED LIVE. AWaP heritage layer existence + CC-BY 4.0 licence stated — not independently
re-fetched. PICC building footprints and Wallonia LiDAR terrain product confirmed by name via
aggregator — not independently probed. Whether Liège has adopted a GCU is NOT YET ASSESSED —
the rate cannot be revised above ~0–2% until this is confirmed. Maintainer: UNASSIGNED.*
