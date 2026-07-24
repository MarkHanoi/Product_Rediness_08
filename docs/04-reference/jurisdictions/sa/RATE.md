# Data Readiness Rate — Saudi Arabia (`sa`) national

**Headline rate: ~55%**

**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a
> complete, machine-readable answer (classification + coverage/FAR + setbacks + height) without reading a
> prose text/PDF document. Methodology mirrors the cross-jurisdiction benchmark (same definition used for
> the Denmark/Madrid/Barcelona/Norway/Germany/France scores). Direct source/endpoint checks — the number
> is reasoned out below, not assumed from Saudi Arabia's Vision-2030 digital-government reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| **Saudi Arabia (national)** | **~55%** |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |

Saudi Arabia sits **between Barcelona (48%) and Madrid (68%)** — an unusual profile that needs explaining,
because it scores high for a reason no other jurisdiction on the list does, and is capped for a reason
that is also unique. **The footprint half of the envelope (4 of 6 governing fields — the three setbacks
plus ground coverage) is published in the primary national ordinance as EXACT, closed-form values** — a
`max(streetWidth/5, floor)` setback formula and a flat coverage constant per class (villa 0.75 §4-1 cl. 1
/ apartment 0.65 §4-2 cl. 1). That is a genuinely *stronger* structured answer than any jurisdiction below
it on the table: Barcelona's *edificabilitat* is an un-reducible envelope (no per-parcel number exists at
all), and Norway's numeric values live in reguleringsbestemmelser prose with the `BestemmelseUtnyttingsgrad`
schema slot confirmed as an unfinished stub. **Saudi's footprint rule is not in prose and not an envelope
— it is an arithmetic function of two inputs, already published, already exact.**

It is held **well below Madrid**, and not higher, for two structural reasons, both measured and both honest:

1. **The vertical extent's EXACT value is geo-fenced.** Height and floors (2 of 6 fields) carry a cited
   national *ceiling* (villa ≤ 14 m §5-1-5 cl. 3 & ≤ ground+1+annex §3-1; apartment ≤ 23 m §3-2), but the
   *exact* permitted value beneath that ceiling defers to the municipal approved plan (المخطط المعتمد, §4
   cl. 1) and is overridden by development-authority regulations on conflict (§1 cl. 3). Every reachable
   per-zone source (Balady `MapServer/28` `NOOFFLOORS`; the RCRC/ADA design-guide volumes) is WAF /
   geo-fenced from outside Saudi Arabia — a **measured negative on shape, not proof of absence**.

2. **The entire live per-parcel data path is geo-fenced.** The footprint *rule* is exact, but to execute
   it for a real parcel you need parcel geometry, classification (`MAINLANDUSE`), and street width — all of
   which live inside the same geo-fenced Balady service (`SAUDI-UMAPS-API-ENUMERATION.md`). From outside SA
   there is **no reachable live feed** that returns any of these per parcel. The demo path substitutes a
   **user-drawn plot + user-picked class + user-supplied street width**, which is legitimate but is not a
   *machine-readable answer fetched from an endpoint*.

So the number is a **rule-completeness measure lifted by a genuinely exact published footprint formula, and
capped by a geo-fence that prevents live per-parcel confirmation of anything** — footprint inputs and the
exact vertical value alike. **Failure and empty are not the same value:** the data provably exists
(enumerated, well-structured), it is provably geo-fenced, and it is scored as reachable-in-principle,
not-reachable-from-here — never as absent.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Classification (villa / apartment / apt-commercial / apt-administrative) | ✅ National taxonomy | 4-class national taxonomy defined in the 2024 MOMRAH decision §3-1..§3-4 — not a per-parcel portal field. Per-parcel assignment (`MAINLANDUSE` on Balady `MapServer/28`) is geo-fenced; the *taxonomy* is national and citable. | **~70%** (taxonomy fully national; live per-parcel assignment geo-fenced, demo = user-picked) |
| Ground coverage (نسبة البناء) | ✅ Exact national constant | villa 0.75 §4-1 cl. 1 / apartment 0.65 §4-2 cl. 1 / annex 0.70 of floor beneath. A flat published constant per class — the single cleanest field in the whole regime. | **~95%** (exact, national, published; the strongest field Saudi has) |
| Front setback | ✅ Exact national formula | `max(streetWidth/5, 3 m)`, ≥6 m at street ≥30 m (villa §4-1 cl. 4–5). Closed-form; needs one input (street width). | **~75%** (rule exact and published; input geo-fenced/user-supplied) |
| Side setback | ✅ Exact national formula | `max(streetWidth/5, 2 m)` §4-1 / §4-2 cl. 4. | **~75%** |
| Rear setback | ✅ Exact national formula | `max(streetWidth/5, 2 m)` §4-1 / §4-2 cl. 4. | **~75%** |
| Max height — national CEILING | 🟡 Ceiling published; exact geo-fenced | villa ≤ 14 m §5-1-5 cl. 3; apartment ≤ 23 m §3-2. The cap is national and cited; the *exact* value beneath it is municipal (§4 cl. 1) + authority-overridable (§1 cl. 3), and every per-zone source is geo-fenced. | **~20% blended** (100% as a cited *bounded* ceiling; ~0% for the exact value from outside SA) |
| Max floors — national CEILING | 🟡 Ceiling published; exact geo-fenced | villa ≤ ground+1+annex §3-1; exact per §4 cl. 1. Same split as height. | **~20% blended** |
| Residential FAR (معامل البناء) | ❌ Does not exist — genuine absence | 0 hits in the 42-page residential decision. Not a parameter of the regime; the "FAR 3" figure belongs to the commercial/hotel document. **Excluded from the envelope denominator** — a definitively-answered absence, not an unknown. | **N/A** (excluded) |
| Parcel geometry | 🟡 Exists, geo-fenced | Balady `MapServer/28` carries the deed boundary (`NORTH/SOUTH/EAST/WESTLIMITLENGTH`) + geometry per parcel; NXDOMAIN on the ArcGIS host + WAF on the proxy from outside SA. Demo = user-drawn. | **~15%** (exists and is rich; not reachable — demo-substituted) |
| Building footprints + height (context) | ⚠️ Global-fallback only | No confirmed open national footprint product; GEOSA National Geoportal is licence-gated. Global fallbacks: Microsoft Global ML Building Footprints (KSA covered, +2.5M then +590k edits) and Google Open Buildings. | **~45%** (usable via global ML fallback; no national LoD2) |
| Terrain / DEM (context) | ✅ Global open | Copernicus DEM GLO-30 (free, global, KSA covered), ALOS AW3D30, SRTM. No confirmed open *national* high-res LiDAR product from GEOSA (licence-gated). | **~70%** (30 m global open; national high-res gated) |

---

## The Saudi structural profile — why it is not Barcelona and not Madrid

Saudi Arabia is the **inverse of Barcelona**. Barcelona has *free, live, structured parcel + zone data*
(Catastro WFS + MUC WMS) but the *rule* it needs — the buildable envelope — cannot be reduced to a
per-parcel number (it is a derived-planning envelope on 62.8% of the city). **Saudi has the opposite
problem: the rule is published and exact, but the live per-parcel data is geo-fenced.** One jurisdiction
has the data and not the rule; the other has the rule and not the (reachable) data.

- **Where Saudi pulls ahead of Barcelona (and Norway, Germany, France):** the footprint is a **published
  closed-form**, not an envelope and not prose. `plot ⊖ max(w/5, {3,2,2})`, capped by `coverage × plotArea`,
  is fully determined by two inputs, both nationally defined. No block dissolve, no Art. 242-style depth
  construction, no NLP transcription of a bestemmelser paragraph. This is why 4 of 6 fields score 70–95%.
- **Where Saudi is held below Madrid:** Madrid returns *structured per-parcel answers from a reachable
  feed* for a large fraction of clicks. Saudi returns an exact *rule* but **no reachable per-parcel feed at
  all** from outside SA — geometry, class, width, and the exact height are all behind the same geo-fence —
  so live confirmation is impossible and the vertical exact value is unheld.

---

## The two-part honest split (rule completeness vs. live reachability)

| Axis | Score | Why |
|---|---|---|
| **Footprint RULE completeness** | **~90%** | Setbacks + coverage are exact, published, national, closed-form. The best-in-class published footprint rule on the benchmark. |
| **Live per-parcel REACHABILITY (outside SA)** | **~0%** | Parcel geometry, classification, street width, and exact floors/height all live behind the Balady/RCRC geo-fence. Nothing is fetchable from here. |
| **Vertical EXACT value** | **~0% (outside SA); 100% as a bounded national ceiling** | Exact = municipal + authority-overridable, geo-fenced. Ceiling = national, cited (villa 14 m / apt 23 m). |
| **Blended dimensional fill rate** | **~55%** | The exact published footprint rule lifts the number above Barcelona; the geo-fenced live path and geo-fenced exact vertical hold it well below Madrid. |

Arithmetic sanity check on the 6-field envelope (footprint fields discounted for geo-fenced inputs, vertical
fields scored as a bounded ceiling): `(0.95 + 0.75 + 0.75 + 0.75 + 0.20 + 0.20) / 6 = 3.60 / 6 ≈ 60%`, then
discounted ~5 points for the fact that **no field can be live-confirmed per parcel from outside SA** (the
footprint inputs are user-supplied, not fetched) → **~55%**.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| An in-SA egress (partner / VPN / demo box in-region) that reaches Balady `MapServer/28` | Converts parcel geometry + classification + `NOOFFLOORS` (exact floors) + resolved setbacks from geo-fenced to live-structured; could lift Saudi toward Madrid's band (~68–75%) in one step — the service already carries setbacks + use + floors **resolved per parcel** | High (business/legal: a MOMRAH/Balady data agreement or a Saudi-resident egress — not engineering) |
| A GEOSA National Geoportal data agreement | Would resolve whether GEOSA publishes an open/licensed national building + terrain + parcel product with WMS/WFS; currently the access model is confirmed *licensed*, not open | Medium–High (licence process) |
| Read one RCRC/ADA per-zone height table from in-SA | Converts the exact vertical value from geo-fenced refusal to a cited number for development-authority zones (the R1 trap surface) | Medium (in-SA read + assert on content, not HTTP 200) |
| Human `VERIFICATION.md` sign-off on the transcribed footprint clauses | Lifts the footprint pack from `estimated-ruleset` to `structured` — the machine transcription (L-606) is done; only the human gate remains | Low (a person confirming the transcription) |
| Confirm Microsoft Global ML / Google Open Buildings coverage completeness for a target city | Firms the context building layer from "covered" to a measured completeness fraction | Low (one bbox extract) |

---

*Last updated: 2026-07-24. The footprint rule (setbacks + coverage) is `published` and exact from the
primary MOMRAH decision, read live on two government hosts. The exact vertical value and the entire live
per-parcel data path (geometry, classification, street width, `NOOFFLOORS`) are geo-fenced from outside SA
— measured negatives on shape, not proof of absence. The national vertical CEILING (villa 14 m / apt 23 m)
is cited, not open. GEOSA National Geoportal access model confirmed licensed, not open. Global DEM (Copernicus
GLO-30) and global ML building footprints (Microsoft/Google) are the reachable context-data fallbacks.*
