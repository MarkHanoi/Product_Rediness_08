# Data Readiness Rate — Belgium (`be`) national

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured national legislation / data-fill rate** (the C58/L-449 cross-jurisdiction ruler), which
> [`NAMING-CONVENTION`](../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It feeds the
> country composite master [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) as **Axis 2 (LEGISLATION)**. Content
> below is unchanged — only the filename moved (§CONTEXT-DATA-HONESTY: no rate value was altered).

**Headline rate: ~10–14%**
*(blended across 3 independent regional systems; see §2 for the per-region breakdown — the
per-region number is the load-bearing figure; the national blend is a weighted average, not a
single measurement)*

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> Belgium's open-data reputation.

<!-- The cross-jurisdiction benchmark. This table is kept IDENTICAL in every RATE.md — it is the
     shared ruler. Belgium is inserted at its honest position. -->
| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Belgium (national, blended)** | **~10–14%** |

Belgium's position on this list is **deceptive if read as a single number.** Its zone-boundary
coverage (does a zoning plan / parcel intersection resolve at all) is arguably the best of any
country in this benchmark — Wallonia's plan de secteur and Brussels' PRAS give 100% legal
territorial coverage since the 1970s–80s, with no Germany-§34-style "no plan exists here" gap
and no France-RNU-style qualitative fallback zone. What collapses Belgium's rate is the next step:
none of the three regions expose a Sweden-style Planbestämmelsekatalog or a Denmark-style
structured-dimension-in-plan-feature model. The height/FAR/setback number, where one exists at
all, sits in a PDF or is deliberately left to a discretionary test — not in a queryable API field,
in any of the three regions, for any of the layers probed in this pass.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (federal cadastre) | ✅ Full | AGDP/AAPD "CADMAP" via SPF Finances; INSPIRE WFS; CC-equivalent open licence, no key | ~90% |
| Zone/plan boundary hit — Wallonia (plan de secteur) | ✅ Structured, INSPIRE-conformant | SPW Géoportail `inspire_lu` WMS + OGC API Features; 23 plans, 1977–1987, still 100% in force | ~95% |
| Zone/plan boundary hit — Brussels (PRAS) | ✅ Structured | urban.brussels GeoServer, layer `PERSPECTIVE_FR:Affectations` | ~90% |
| Zone/plan boundary hit — Flanders (gewestplan + RUP) | ✅ Structured | Digitaal Vlaanderen DSI platform; WFS namespace `lu:` (`lu_gewrup_*`, `lu_prorup_*`, `lu_si_gv`, etc.) | ~85–90% |
| Height / max floors — structured field, any region | ❌ Not found | None of the three regional systems expose height/gabarit as a queryable numeric API attribute; Brussels RRU Titre I is a PDF regulation with context-relative formulas; Flanders RUP voorschriften linked as text/PDF; Wallonia plan de secteur carries only broad affectation | ~0–3% |
| FAR / plot ratio — structured field, any region | ❌ Not found | No Belgian region exposes a FAR-equivalent as a queryable attribute | ~0% |
| Setbacks | ❌ Not structured, often discretionary | Brussels RRU Titre I formulas (H = P + 3.00 + D) require geometric computation; Flanders/Wallonia setbacks live inside RUP voorschriften text or are folded into the discretionary test | ~0% |
| Provision-code semantic catalogue | ❌ Does not exist | No Belgian region publishes a catalogue mapping plan-provision codes to numeric meaning | 0% |
| Heritage overlay — Flanders (Onroerend Erfgoed) | ✅ Full | `geo.onroerenderfgoed.be/geoserver` WFS — `bes_monument`, `bes_sd_gezicht`, `bes_arch_site`, `bes_landschap`, `bes_overgangszone` | ~90% |
| Heritage overlay — Wallonia (AWaP) | ✅ Full | SPW Géoportail "Patrimoine — biens classés et zones de protection," CC-BY 4.0 | ~85% |
| Heritage overlay — Brussels | ⚠️ Register exists; live GIS layer unconfirmed | Direction du Patrimoine culturel / urban.brussels; register confirmed, queryable GIS layer not independently verified | ~50% |
| Terrain / LiDAR — Flanders | ✅ Full, free | DHMV I + II (Informatie Vlaanderen/AGIV); ~8 pts/m² per strip; DHMV II full-coverage | ~80% |
| Terrain / LiDAR — Wallonia | ⚠️ Exists, not independently confirmed | PICC + Wallonia LiDAR products via Géoportail de Wallonie | ~40% |
| Terrain / LiDAR — Brussels | ❔ Unconfirmed | No standalone Brussels LiDAR programme identified | ~15% |
| Existing building footprints (federal CADMAP sublayer) | ✅ Structured | "buildings managed by AGDP" ships inside the same federal WFS; height/storey attribute **not yet probed** | ~70% |
| Existing building footprints — Flanders (GRB) | ✅ Structured | GRB WFS; `3D GRB — Gebouw LOD1 DHMV II` block model with reference height | ~75% |
| Existing building footprints — Wallonia (PICC) / Brussels (UrbIS) | ⚠️ Exist, not independently probed | Named services confirmed via aggregator; not directly fetched | ~50% |
| Existing building heights (LOD1/LOD2) | ⚠️ Partial, fragmented | Flanders: `3D GRB — Gebouw LOD1 DHMV II` (block model, free); Wallonia/Brussels: no equivalent confirmed | ~20% |

---

## The structural gap

Belgium's low rate is not a coverage-completeness problem — it is a **legal-design problem**. In all
three regions, spatial planning was devolved in 1980/1989, and each Region drafted its own planning
code (VCRO / CoDT / CoBAT) independently. No Belgian region shares a zone taxonomy, a
numeric-envelope mechanism, or a data-exchange schema. **The operative test for whether a specific
building envelope is permittable in all three regions is a mandatory discretionary compatibility
judgment** — *goede ruimtelijke ordening* (Flanders) or *bon aménagement des lieux* (Wallonia,
Brussels) — layered on top of every permit, including inside fully adopted, numerically-specified
plans. Unlike Germany's §34 (discretion only where no B-Plan exists), this test is not a fallback
— it is the primary mechanism for most envelope questions in two of the three regions.

**Flanders** (VCRO): the *goede ruimtelijke ordening* test applies to every permit. Some RUPs
explicitly leave height "vrij" (free), delegating the numeric question entirely to discretion. An
additional statutory trap — VCRO Art. 7.4.2/2 ("clichering") — nullifies all post-2009
percentage-based RUP provisions, voiding an entire category of potentially-structured numbers.

**Wallonia** (CoDT): the plan de secteur carries only broad land-use affectation (no height/FAR
dimension). The GRU is explicitly indicative. *Bon aménagement des lieux* is close to the
load-bearing mechanism for most specific envelope questions, not a rare derogation safety valve.

**Brussels** (CoBAT/RRU): the only region with a region-wide numeric-leaning text (RRU Titre I),
but its formulas are context-relative (H = P + 3.00 + D — rue width plus parcel depth) and reside
in a PDF regulation, not a queryable API field. A PPAS/RRUZ/PAD instrument-priority check must
run before any RRU rule can be applied.

**The single starkest gap vs. Sweden:** no Belgian region publishes a provision-code semantic
catalogue (Sweden's Planbestämmelsekatalog maps ~3,700 code → numeric meaning). Raising Belgium's
rate durably would require a policy change, not just better data engineering.

### Per-region structured fill estimate

| Region | Zone-boundary hit | Structured numeric fill | Why |
|---|---|---|---|
| **Wallonia** | ~95% (VERIFIED LIVE) | ~0–2% | Plan de secteur: affectation only, no height/FAR. GRU indicative only. Operative answer = *bon aménagement des lieux*. |
| **Brussels-Capital** | ~90% (cached, not live) | ~5–10% | RRU Titre I exists as a formula-in-PDF baseline; some structured GIS layers (CBS+, office-quota zones) contribute the small non-zero credit |
| **Flanders** | ~85–90% (cached, not live) | ~0–5% | RUP-by-RUP; "vrij" frequent by design; Art. 7.4.2/2 may void post-2009 % provisions |

**Weighted blend** (Flanders ~57%, Wallonia ~32%, Brussels ~11% of Belgium's ~11.8M population):
→ **~10–14% nationally.**

### Live probe record (2026-07-24)

| Endpoint | Result |
|---|---|
| Federal cadastre (AGDP WFS) | ✅ VERIFIED LIVE — HTTP 200, application/xml |
| Wallonia plan de secteur WMS + OGC API Features | ✅ VERIFIED LIVE — HTTP 200, full capabilities |
| Flanders heritage (Onroerend Erfgoed WFS) | ✅ VERIFIED LIVE — HTTP 200, application/xml |
| Brussels PRAS (urban.brussels GeoServer) | ⚠️ CACHED — bot-blocked on direct fetch |
| Flanders DSI/GRB WFS | ⚠️ CACHED — robots.txt-blocked on direct fetch |
| Wallonia/Brussels LiDAR + building parity | ❔ UNVERIFIED — referenced in metadata; not independently probed |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Probe whether any RUP/PPAS/BPA feature carries a populated numeric height/FAR attribute via WFS GetFeature (sample several Flemish RUPs and Brussels PPAS) | If positive: discovers a structured path not yet confirmed; if negative: conclusively closes the largest remaining unknown | Medium — requires resolving robots.txt/bot-detection blocks |
| Resolve Brussels bot-detection block (Belgian-IP or EU-based deployment) | Unblocks independent verification of PRAS/RRU/RRUZ layers and licence terms — prerequisite for all Brussels pack work | Low–Medium |
| Confirm whether federal CADMAP building sublayer carries a height/storey-count attribute | If yes: free, nationally-consistent building-height source — raises existing-building-height score materially | Low — one GetFeature call on the already-verified federal WFS |
| Check Wallonia/Brussels LiDAR and building footprint products directly | Resolves the largest unconfirmed context-data gap | Low |
| Query the Flemish `lu_hov_*` layer for Art. 7.4.2/2 voidance tracking | Confirms whether nullified provisions can be flagged automatically | Low |
| A policy change: adoption of a provision-code semantic catalogue in any Belgian region | The single intervention that could structurally raise the rate above ~20–30% | Political/administrative — not a near-term trajectory |

---

*Last updated: 2026-07-24. Federal cadastre VERIFIED LIVE. Wallonia plan de secteur WMS + OGC API
Features VERIFIED LIVE. Flanders heritage WFS VERIFIED LIVE. Brussels PRAS/RRU confirmed via cache
only — direct fetch bot-blocked. Flanders DSI/GRB confirmed via cache only — robots-disallowed.
Wallonia/Brussels LiDAR parity and building-footprint parity not independently probed. Height/FAR
structured field confirmed absent from all three regional systems from available probe results.
Maintainer: UNASSIGNED.*
