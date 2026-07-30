# Saudi Arabia — MASTER DATA-SOURCE & RULE-MECHANISM STUDY for the buildable-envelope engine

**Companion to the Norway, France and Germany master studies, same method.** One demo city studied in
depth (**Riyadh**), two more scaffolded in this pass (**Jeddah**, **Dammam**). Every legal source below
was read directly (the primary ministerial decision PDF, on two government hosts) rather than assumed;
every data endpoint was either reached or its geo-fence was measured on shape (content-type / body
inspection), never inferred from an HTTP status alone. Flagged inline where a source still needs an in-SA
read before you can build against it.

**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** national law read
(`VERIFIED-LIVE` primary); context-data layers researched; no rule pack wired.

> **This file synthesises** `SAUDI-ARABIA-ENTRY-ASSESSMENT.md` (the market-entry effort assessment),
> `SAUDI-PRIMARY-DECISION-EXTRACT.md` (the primary law, page-cited), and `SAUDI-UMAPS-API-ENUMERATION.md`
> (the parcel backend, enumerated) into one master study, and extends them with the context-data-layer
> research (buildings / terrain / roads / water / heritage). It does not supersede those three files —
> they remain the citations of record for their respective findings.

---

**Headline finding:** Saudi Arabia is the **structural inverse of Barcelona**, and that is the whole story.
Barcelona has free, live, structured parcel + zone data but a rule (*edificabilitat*) that cannot be
reduced to a per-parcel number. **Saudi has the opposite: a rule that is published as an exact closed-form
national function, and per-parcel data that is fully structured but geo-fenced.** The buildable FOOTPRINT
(three setbacks + ground coverage — 4 of the 6 envelope fields) is a pure national function of
`street width + plot class`, read directly from the 2024 MOMRAH residential decision, needing no zone
portal. The VERTICAL extent (height + floors — the other 2 fields) carries a cited national *ceiling*
(villa ≤ 14 m, apartment ≤ 23 m) but its *exact* value defers to the municipal approved plan and is
overridden by region/city development authorities — the "local plan silently governs" trap, written into
the primary law itself. **No envelope field is a total unknown: 4 are pinned nationally and exactly, 2 are
nationally bounded.** The one thing that stops this from being a Denmark-class score is that **the live
per-parcel data path — geometry, classification, street width, and the exact floors/height — all sit behind
one geo-fence**, reachable only from inside Saudi Arabia or under a data agreement.

---

## PART A — THE NATIONAL COMMON BASELINE (the legal layer)

### A.1 The governing instrument — the 2024 MOMRAH residential decision

**National baseline:** residential building rules in Saudi Arabia are set by a single national ministerial
decision, read live in this pass and now the citation of record:

| | |
|---|---|
| Title | **اشتراطات إنشاء المباني السكنية** (Requirements for the construction of residential buildings) |
| Instrument | **قرار وزاري رقم 1/4500943139** — 1446 H (ministerial decision) |
| Issuer | **وزارة الشؤون البلدية والقروية والإسكان** (Ministry of Municipal, Rural Affairs & Housing — MOMRAH) |
| Issued | **15 / 01 / 1446 H** ≈ 21 July 2024 |
| Length | **42 pages**, machine-extractable Arabic (PyPDF; glyphs reversed on extraction, digits transliterated) |
| Host 1 | `momah.gov.sa/sites/default/files/2024-07/…alqrar.pdf` — HTTP 200, `application/pdf`, 5,084,557 B, `%PDF-1.7` |
| Host 2 (identical decision) | `balady.gov.sa/sites/default/files/2024-12/…` |
| Legal basis (p2) | نظام البلديات والقرى (Royal Decree م/5, 21/2/1397 H) art. 5; نظام تطبيق كود البناء السعودي (م/43, 26/4/1438 H) |

**Two independent government hosts (momah + balady) serve the identical decision** — a primary-source
*corroboration*, not the "four news articles descended from one source" trap. Unlike Norway (357 kommuner
each holding their own plan) or Germany (16 Länder), the residential *rule* here is **one national document,
one issuer, kingdom-wide** — Section 1 binds **all Amanas of the Kingdom**. Full page-cited extract:
[`../SAUDI-PRIMARY-DECISION-EXTRACT.md`](../SAUDI-PRIMARY-DECISION-EXTRACT.md).

### A.2 Classification — a national 4-class taxonomy (not a municipal plan field)

The decision applies to **four residential classes** (Chapter 3, pp. 12–15), each mapped to a Saudi
Building Code (SBC) occupancy group. **High-rise (> 23 m) is explicitly OUT of scope (§1-1 / §4).**

| # | Class (AR) | Class (EN) | SBC group | Definition read |
|---|---|---|---|---|
| 3-1 | الفلل السكنية | **Villas** | R3 | ground + 1 upper floor + upper annex (*ملحق علوي*) + external annexes + basement; sub-types **detached / semi-detached / attached** |
| 3-2 | العمائر السكنية | **Residential apartments** | R2 | > 2 floors, total height **≤ 23 m above ground**, **≥ 3 units** |
| 3-3 | العمائر السكنية التجارية | **Residential-commercial** | R2 / M / A2 | as 3-2, ground-floor commercial shops, ≥ 2 residential units |
| 3-4 | العمائر السكنية الإدارية | **Residential-administrative** | R2 / B | as 3-2, plus office units |

**Structural advantage over Barcelona/Norway:** the class *taxonomy* is national and lives in this decision,
not in a per-parcel portal. The municipal plan sets *which* class a parcel may host (§4.1), but the four
definitions and the numeric rules attached to them are national. In a demo, class is a **user-picked
dropdown**, not a fetched field — removing the single most expensive Barcelona step (parcel→zone resolution)
from the footprint critical path.

### A.3 The footprint — coverage + setbacks, an exact national closed-form

**National baseline — the strongest structured answer of any jurisdiction studied.** Unlike Norway (numeric
values in reguleringsbestemmelser prose; `BestemmelseUtnyttingsgrad` schema slot an unfinished stub) or
Barcelona (*edificabilitat* an un-reducible envelope), Saudi's footprint is a **published arithmetic
function**.

**Coverage — `نسبة البناء` (a ground-coverage ratio, NOT a FAR; pp. 18, 22, 23):**

| Class | Ground floor | 1st + repeated floors | Upper annex (*ملحق علوي*) |
|---|---|---|---|
| **Villa** (4-1) | **≤ 75%** (§4-1 cl. 1) | ≤ 75% (cl. 2) | ≤ 70% of floor beneath, incl. stairs & lifts (cl. 3) |
| **Apartment** (4-2) | **≤ 65%** (§4-2 cl. 1) | ≤ 75% (cl. 2) | ≤ 70% of floor beneath (cl. 3) |
| **Residential-commercial** (4-2) | **≤ 65%** | ≤ 75% | ≤ 70% |
| **Residential-administrative** (4-3) | **≤ 65%** | ≤ 75% | ≤ 70% |

**Setbacks — `الارتدادات`, a pure function of `(streetWidth, class)` (pp. 18, 22, 23):**

| Setback | Villa (4-1 cl. 4) | Apartment / comm / admin (4-2 / 4-3 cl. 4) |
|---|---|---|
| **Front** | `max(streetWidth / 5, 3 m)` | `max(streetWidth / 5, 3 m)` |
| **Side & rear** | `max(streetWidth / 5, 2 m)` | `max(streetWidth / 5, 2 m)` |
| **Neighbour side** | ≥ 1.5 m | ≥ 3 m if > 5 floors; ≥ 2 m if ≤ 5 floors |
| **Streets ≥ 30 m** | front ≥ **6 m** (§4-1 cl. 5) | subsumed: `max(w/5, 3) ≥ 6 ⟺ w ≥ 30` |

⇒ **The buildable footprint = `plot ⊖ max(streetWidth/5, {3,2,2})`, capped by `coverage × plotArea`, is
fully determined by street width + class.** This is C58 §2.2's simplest geometricRule kind (`setback`) plus
a `maxCoverage` — no block dissolve, no depth construction, no FAR. Additional perimeter rules: ground-floor
build-in-setback ≤ 70% of plot perimeter, ≤ 4.5 m high (§4-1 cl. 8); boundary walls ≤ 4.5 m; parking villa
1/2 spaces (≤/> 400 m²), apartment 1.5/dwelling (§4-1 cl. 14 / §4-2 cl. 6).

### A.4 The vertical extent — a national CEILING, exact value municipal

**National baseline — a genuine numeric ceiling, distinct from the exact value:** the decision caps the
vertical extent per class, and the cap is national and cited (this corrects the first pass, which recorded
23 m as "only a class boundary" and floors/height as "not national at all" — both understated; retraction
kept visible per playbook §3.6):

| Class | National vertical cap | Clause | Verbatim |
|---|---|---|---|
| **Villa** | height **≤ 14 m** | **§5-1-5 cl. 3** | «الحد الأقصى لارتفاع الفلل السكنية 14 متر … إلى منسوب سطح الملحق العلوي» |
| **Villa** | floors **≤ ground + 1 + upper annex** | **§3-1** | «بحد أقصى دورين وملحق علوي … وقبو» |
| **Apartment / comm / admin** | height **≤ 23 m** | **§3-2 / §3-3 / §3-4** | «لا يزيد ارتفاعها الكلي عن 23م أعلى سطح الأرض» |
| (boundary) | > 23 m ⇒ high-rise, OUT of scope | **§2 def + §1-1** | «الأبراج عالية الارتفاع: المباني التي يزيد ارتفاعها الكلي عن 23م» |

**`الارتفاع الكلي للمبنى` (total height)** is measured *"from the pavement level in front of the main
entrance to the top of the upper-annex roof slab"* (§2) — **measured from the rasant at the façade**,
structurally the same measurement basis as Barcelona's L-584 terrain/rasant issue. The **exact** permitted
value *beneath* the cap is `المخطط المعتمد` (approved plan, §4 cl. 1), overridden by development authorities
(§1 cl. 3). So the ceiling is national; the exact value is not, and every reachable per-zone source is
geo-fenced (§C). The villa is thereby nationally *maximised* (footprint + 14 m + G+1+annex — the municipal
plan can only reduce), so its national-maximum envelope is effectively complete; the apartment is
national-footprint + a 23 m cap with the exact floor count municipal.

### A.5 Residential FAR does not exist — a definitively-answered national absence

**`معامل البناء` (FAR / plot ratio) does not appear anywhere in the 42-page residential decision** (full-text
grep: 0 hits). The seed's "Max FAR — e.g. hotel 3" is real but belongs to a *different document* (the
commercial/hotel requirements), not the residential regime. ⇒ **Residential buildability is governed by
GROUND COVERAGE + setbacks + floor count, not FAR.** This is a *simpler* model that maps cleanly onto C58's
`maxCoverage` + `setback` — and it is a genuine national absence (a definitively-closed question), never a
gap or an unknown. FAR is therefore **excluded from the 6-field envelope denominator**.

### A.6 The precedence chain — layered, with explicit override (the Barcelona trap, in the primary law)

The decision defines its own precedence (Chapter 1 §1, p7; Chapter 4 §4.1, p18):

```
2024 MOMRAH national residential decision  — MINIMUM requirements, binding on all Amanas (§1)
  └── EXCEPT parking, commercial-street setbacks, special-area building ratios — Amana-set (§1 cl. 2)
  └── المخطط المعتمد (municipal approved plan, per planning zone) — overrides permitted uses,
        building ratios per floor, setbacks, number of floors, max height (§4.1 cl. 1)
  └── هيئات تطوير المناطق والمدن (region/city development authorities) — regulations PREVAIL on any
        conflict (§1 cl. 3): RCRC (Royal Commission for Riyadh City), ROSHN, NEOM, Diriyah Gate,
        King Salman Park, Qiddiya, Jeddah Central / Jeddah Development Authority, …
        (subject to the Saudi Building Code)
```

⇒ **The trap is real and written into the primary law**, but it bites a *smaller, better-bounded surface*
than Barcelona's. In Barcelona the derived instrument sets the *entire* envelope on 62.8% of the city; in
Saudi the national decision sets the **footprint** as an enforceable nationwide floor, and the override
surface is **height + floors + special-area ratios**. **The trap costs the vertical extent, not the
footprint** — a genuinely better position, but *not flat*, and presenting it as flat would be the trap.

---

## PART B — THE PER-PARCEL DATA BACKEND (Balady U-Maps — exists, geo-fenced)

**National baseline:** the Balady U-Maps parcel/zoning backend was fully enumerated in this pass
([`../SAUDI-UMAPS-API-ENUMERATION.md`](../SAUDI-UMAPS-API-ENUMERATION.md)). It is a standard Esri ArcGIS
Server service, and it **already publishes the resolved compliance fields per parcel** — a materially better
upstream than Barcelona's Catastro+MUC (where every number is constructed):

`https://umapsudp.momrah.gov.sa/server/rest/services/Umaps/Umaps_Identify_Satatistics/MapServer/28`
(`cpSubDivisionParcelS`) carries, per parcel: `MAINLANDUSE` (classification), `MEASUREDAREA` (plot area),
`FRONTDEFECTION` / `REARDEFECTION` / `SIDEDEFECTION` (**resolved setbacks**), `NOOFFLOORS` (**number of
floors**), `BUILDINGCONDITION`, `IN_PARCELID` (real-estate ID join key), `SUBDIVISIONPLAN_ID`, plus a full
deed schema (`DEEDNO`, `NORTH/SOUTH/EAST/WESTLIMITLENGTH`, `OWNERNAME`).

**§B.D Deviation — two independent geo-fence walls, both measured on shape (not HTTP status):**

| Test | Result | Read |
|---|---|---|
| DNS `umapsudp.momrah.gov.sa` | **NXDOMAIN** (while `umaps.balady.gov.sa`, `balady.gov.sa`, `momrah.gov.sa` all resolve) | ArcGIS Server host not in public DNS — split-horizon / geo-fenced |
| `proxy.ashx?…/query?where=1=1` | **HTTP 200, `text/html`, 3,396 B** — MOMRAH "service unavailability" apology page | **The §CONTEXT-DATA-HONESTY case: a 200 whose body is NOT the answer.** Asserting on content-type + the Arabic apology string is what distinguishes "blocked" from "answered" |
| `proxy.ashx?…arcgisonline.com…` (benign target) | same HTML notice | IP/geo WAF on the proxy, not a per-service permission |

⇒ **`COULD NOT VERIFY` that the service returns data, and the reason is a measured geo/WAF block, not a
missing endpoint.** The endpoint provably exists, is provably well-structured, and is provably gated to
Saudi IPs + a browser-minted token. This is the single most important architectural finding: **if reachable,
PRYZM would *read* the Saudi envelope (setbacks + use + floors, `granularity: parcel`,
`confidence: authoritative`) rather than construct it** — better than Barcelona. It is unreachable from
outside SA; the demo path is a user-drawn plot.

---

## PART C — THE CONTEXT-DATA LAYERS (buildings / terrain / roads / water / heritage)

Full inventories with endpoints and confidence tiers are in [`../topics/`](../topics/). Summary of the
national picture and the one recurring structural fact — **GEOSA governs but gates**:

**GEOSA (General Authority for Survey & Geospatial Information)** is the national mapping agency and the
custodian of the National Spatial Data Infrastructure (NSDI) and the **National Geoportal (geoportal.sa)**,
governed by the National Geospatial Committee (NGC). The GEOSA landing page was reachable and confirms the
geoportal serves 78+ government agencies, 52+ private beneficiaries, 18+ academic institutions — but under a
**"defined publishing policy that protects rights and enhances data security"** and a launched **Geospatial
Licensing and Permitting System** (`geo-licensing.geosa.gov.sa`). ⇒ **The national access model is
LICENSED, not open** — structurally the same gate as Norway's FKB-Bygning (free for Norge digitalt parties,
purchase for commercial), except here it covers the whole national product line, not just building
footprints. `my.gov.sa/en/content/gis` returned **HTTP 403** from outside SA — another measured geo-fence.

| Layer | National source | Access | Reachable global fallback | Confidence |
|---|---|---|---|---|
| **Parcel geometry + resolved rules** | Balady `MapServer/28` | **geo-fenced** (§B) | user-drawn plot (demo) | `geo-fenced` |
| **Building footprints** | GEOSA National Geoportal | **licensed** (not open) | **Microsoft Global ML Building Footprints** (KSA covered: +2.5M then +590k Maxar/Vexcel edits) · **Google Open Buildings** · OSM | `published` (global fallback) |
| **Terrain / DEM** | GEOSA topographic / high-res | **licensed** | **Copernicus DEM GLO-30** (free, global, KSA covered) · ALOS AW3D30 · SRTM | `published` (global fallback) |
| **Roads / pedestrian** | Roads General Authority (RGA); Balady `MapServer/26` (street) | RGA regulatory (not an open feed); Balady geo-fenced | **OSM Saudi** (HDX `hotosm_sau_roads`, good urban coverage) | `published` (OSM) |
| **Water / flood** | No confirmed open national flood product | — | Copernicus DEM-derived + academic Jeddah flood studies; OSM hydrography | `TBD` / research-grade |
| **Heritage** | **Heritage Commission** (Ministry of Culture); **Jeddah Historic District Program** GIS (651 buildings assessed 2021–22) | JHD GIS internal; not a confirmed open feed | UNESCO WHC boundary (Historic Jeddah, inscribed 2014); OSM | `published` (UNESCO boundary); `TBD` (national register feed) |

**Saudi vs Norway on context data:** Norway has one national parcel + terrain product that is *free* (open)
for the geometry/terrain layers. Saudi has a national custodian (GEOSA) whose products are *licensed*, and a
per-parcel backend (Balady) that is *geo-fenced* — so for a commercial engine outside SA, the reachable
context layers are almost entirely **global fallbacks** (Copernicus DEM, Microsoft/Google building
footprints, OSM), exactly the fallback stack you would use for any country with a gated national NSDI.

---

## PART D — PER-CITY DEEP DIVE

### D.1 Riyadh (region SA-01, UN/LOCODE RUH) — the demo city, pack authored

**Confirmed and authored.** The national footprint is encoded as a rule pack
(`packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts`) with two zones (`sa-villa` 0.75, `sa-apartment`
0.65 ground coverage), the setback formula as a pure resolver (`resolveSaudiSetbacks`), and height/floors as
a **field-level bounded cited-null refusal** (C58 §1.13) so the footprint stays intact. **Not wired**
(registry + index + bbox + L5 dispatcher = the WIRING TODO). The override surface here is **RCRC (Royal
Commission for Riyadh City) + ADA** design-guide volumes, which publish per-corridor FAR/height and override
the national decision — and are geo-fenced (`trc.alriyadh.gov.sa` ECONNREFUSED; `rcrc.gov.sa` WAF-rejected).
Full record: [`../sa-01/ruh-riyadh/`](../sa-01/ruh-riyadh/README.md) and its `findings/L-606-*`.

### D.2 Jeddah (region SA-02 Makkah, UN/LOCODE JED) — scaffolded this pass

**Same national footprint; two extra local layers.** Jeddah's Amana (Amanat Jeddah / Jeddah Municipality,
permits via the Etmam system, `etmam.momrah.gov.sa`) holds the approved plan; the **Jeddah Development
Authority** (regulatory arrangements approved Sept 2023) is a §1 cl. 3 development-authority override for its
footprint. The distinctive Jeddah layer is the **Al-Balad heritage overlay** — Historic Jeddah, inscribed on
the UNESCO World Heritage List in 2014, managed by the Jeddah Historic District Program (Ministry of Culture)
with a dedicated GIS assessing 651 historic buildings (2021–22). A parcel inside the Al-Balad property or its
buffer zone is governed by a conservation regime the national residential decision does not contain. Full
record: [`../sa-02/jed-jeddah/`](../sa-02/jed-jeddah/README.md).

### D.3 Dammam (region SA-04 Eastern Province, UN/LOCODE DMM) — scaffolded this pass

**Same national footprint; Eastern Province Amana holds the approved plan.** No UNESCO-scale heritage overlay
identified; the override surface is the ordinary municipal `المخطط المعتمد` plus any Eastern-Province
development-authority zones. Structurally the cleanest of the three (national footprint + a single municipal
vertical layer). Full record: [`../sa-04/dmm-dammam/`](../sa-04/dmm-dammam/README.md).

### D.4 Cross-city comparison — the actual finding

| | Riyadh | Jeddah | Dammam |
|---|---|---|---|
| National footprint (setbacks + coverage) | **identical** — one national formula | **identical** | **identical** |
| Amana (approved-plan holder) | Amanat Riyadh | Amanat Jeddah (Etmam) | Amanat Eastern Province |
| Development-authority override | RCRC + ADA (giga-project dense) | Jeddah Development Authority + Jeddah Central | (ordinary municipal + any EP zones) |
| Heritage overlay | (none city-scale identified) | **Al-Balad — UNESCO WHS + JHD GIS** | (none identified) |
| Exact height/floors reachability | geo-fenced | geo-fenced | geo-fenced |
| Pack status | authored, not wired | scaffold | scaffold |

**The finding that should drive sequencing:** unlike Norway (357 different plan-holders on one schema) or
Barcelona (different height mechanisms), **all three Saudi cities are the same national footprint plus a
per-city vertical override** — not different software problems. The engineering risk in Saudi is not "will
this city need a new rule kind" (no — `setback` + `maxCoverage` serves all three) but **"can the exact
vertical value and the live parcel feed be reached"** — a geo-fence problem, not a legal-regime problem.

---

## PART E — WHAT THIS MEANS FOR SCALE, AND THE HONEST PROJECT SHAPE

**The residential rule is ONE national document, kingdom-wide** — a far stronger structural position than
Norway's 357 kommuner or Germany's 16 Länder. The footprint math is national, exact, and reuses
`streetWidth.ts` conceptually (Saudi عرض الشارع = frontage-to-frontage, verified). Three things temper that:

1. **The exact vertical value is per-zone municipal + authority-overridable, and geo-fenced.** The national
   ceiling ships as a bounded refusal; the exact value needs an in-SA read or a Balady data agreement.
2. **The live per-parcel path is one geo-fence.** Geometry, classification, street width, and `NOOFFLOORS`
   all sit behind the same Balady WAF. A demo substitutes user input; a production product needs a MOMRAH/
   Balady data agreement or a Saudi-resident egress — a business/legal timeline, not an engineering one.
3. **The national NSDI (GEOSA) is licensed, not open.** For context data (buildings, terrain), the reachable
   stack outside SA is global fallbacks (Copernicus DEM, Microsoft/Google building footprints, OSM).

**Recommended framing, mirroring the Norway tiering:**

- **Tier 1 — the national footprint on ordinary residential fabric:** demo-ready cheaply on any of the three
  cities, with a user-drawn plot + class dropdown + street-width entry. Footprint real and cited; height a
  bounded refusal. The cheapest honest demo PRYZM could ship — a fraction of Barcelona's cost.
- **Tier 2 — the exact vertical value:** blocked on the geo-fence. Unblocked only by an in-SA read (RCRC/ADA
  tables) or a Balady data agreement (`NOOFFLOORS`).
- **Tier 3 — full live per-parcel envelope:** blocked on the same geo-fence; a data agreement flips Saudi
  from "demo footprint" to a *read* (not constructed) envelope — a better data position than Barcelona.

**Single highest-value next task:** secure an in-SA egress or a MOMRAH/Balady data agreement — it unblocks
geometry, classification, street width, *and* the exact floors in one step, because Balady `MapServer/28`
carries all of them resolved per parcel.

---

**Cross-refs:** [`../SAUDI-ARABIA-ENTRY-ASSESSMENT.md`](../SAUDI-ARABIA-ENTRY-ASSESSMENT.md) ·
[`../SAUDI-PRIMARY-DECISION-EXTRACT.md`](../SAUDI-PRIMARY-DECISION-EXTRACT.md) ·
[`../SAUDI-UMAPS-API-ENUMERATION.md`](../SAUDI-UMAPS-API-ENUMERATION.md) ·
[`../LEGISLATION-RATE.md`](../LEGISLATION-RATE.md) · [`../regions/README.md`](../regions/README.md) · [`../topics/`](../topics/) ·
`no/findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md` (the parallel study, same method) ·
`es/es-ct/08019-barcelona/L-590c-PLA-PARCIAL-REGIME-RESOLVED.md` (the trap, in Barcelona). Key legal
sources: قرار وزاري 1/4500943139 (1446 H); نظام البلديات والقرى (م/5); نظام تطبيق كود البناء السعودي (م/43);
GEOSA NSDI / National Geoportal; Balady U-Maps; Copernicus DEM GLO-30; Microsoft/Google building footprints.
