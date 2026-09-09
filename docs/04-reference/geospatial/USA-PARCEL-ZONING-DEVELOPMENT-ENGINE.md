<!--
  PRYZM USA — cadastre → zoning → development envelope. The founder's research, 2026-09-09.
  Captured per the standing rule that founder research lands in the repo the same turn it arrives.

  ⛔ RESEARCH, NOT A DETERMINATION. Nothing here is verified by PRYZM or implemented. The section
  "WHAT PRYZM ALREADY HAS" is measured; where it disagrees with the research, the measurement wins.
-->

# PRYZM USA — the parcel → zoning → development-envelope layer

**Founder, 2026-09-09, alongside the Delaware / Sussex County demo:**

> *"cadastral data required for envelope creation … this is the missing layer if PRYZM is supposed
> to answer not just 'what exists here?' but **'what could legally be built here?'** … And the
> important point is: cadastral geometry alone is not enough."*

He then extended it from Delaware to the whole USA.

---

## ⭐⭐ READ THIS FIRST — PRYZM ALREADY HAS THE ENGINE HE IS DESCRIBING

His proposed architecture is, almost line for line, **what `packages/site-parcel-data` already does
for Europe**. That is the single most important fact for planning this work, and it changes the job
from "build a development engine" to "add US regulatory packages to the one that exists".

| His proposal | PRYZM today |
|---|---|
| "PRYZM Planning Engine as a separate subsystem" | `packages/site-parcel-data` — **136,809 LOC**, 430 files, **124 rule-pack files**, ~30 registered jurisdictions |
| parcel → setback inset → buildable polygon | the C58 envelope solver; `geometry-space-envelope` |
| a rules engine over ordinance text | `packages/ordinance-extraction` — 8,722 LOC |
| "each jurisdiction becomes a regulatory package plugged into the same engine" | **ADR-0279**, the 5-slot per-city onboarding standard |
| confidence as a first-class field | **C62** — `ValueProvenance`, `ElementConfidence`, 32/32 element kinds, hard-0 gate |
| *"Show source / Why?"* on every figure | already shipped — the envelope card's chips and the PGM Art. 242.2 citation line |
| *"don't say 'you can legally build X'"* | already the rule — §CONTEXT-DATA-HONESTY, and the card says *"a STUDY, not a permit"* |

⛔ **So the work is NOT the engine. It is the REGULATORY PACKAGE for a US jurisdiction, plus a US
parcel provider.** Building a second engine would be this repo's dominant defect — one rule, two
implementations — at the largest scale it has ever been attempted.

⚠ **And the honest scale check:** that European engine, at 136,809 LOC and years of work, answers
for **five measured cities**. Barcelona's envelope axis scores **36.5%**; Madrid and Córdoba score
**0%**. A US jurisdiction is not cheaper than a Spanish one.

---

## HIS TARGET OUTPUT — the per-parcel object

```
PARCEL
├── parcel_id · geometry · area · frontage · ownership/address
├── ZONING      district · permitted/conditional uses · density · min lot area
│                lot width/depth · max height · max lot coverage · FAR
│                front/side/rear setback
├── OVERLAYS    coastal · wetlands · floodplain · historic · environmental · special districts
└── DEVELOPMENT buildable_polygon · max_footprint · max_height · max_floors
                max_GFA · max_units · theoretical_building_envelope · constraints/reasons
```

### ⭐ His strongest technical point — FAR alone is nonsense

```
parcel 20,000 ft² · FAR 1.5        →  "30,000 ft²"
setbacks leave 7,000 ft², 4 floors →   28,000 ft²   ← the real ceiling
then parking, wetlands, unit caps  →   less again
```
**Compute the envelope geometrically; never display someone else's `max_buildable_sqft`.**

### ⭐ And his three-capacity output, which is the honest shape
```
ZONING CAPACITY      what the dimensional rules allow
PHYSICAL CAPACITY    what fits after spatial constraints
CONSTRAINED CAPACITY what survives parking, access, environment, infrastructure
```
⛔ *"Don't call it 'what you can legally build'. Call it 'estimated development envelope'"* — because
US zoning carries conditional uses, variances, overlays, historic districts, utility availability and
discretionary review. **This matches §CONTEXT-DATA-HONESTY exactly and should be adopted verbatim.**

---

## SUSSEX COUNTY, DELAWARE — the concrete first package

| Thing | Where |
|---|---|
| Zoning polygons (ArcGIS FeatureServer) | `https://map.sussexcountyde.gov/server/rest/services/Hosted/Zoning_View/FeatureServer/1` |
| Parcels | `https://map.sussexcountyde.gov/trdserver/rest/services/Geographic_Information_Office/Parcels_PIN/MapServer` |
| Ordinance | Sussex County Code **Chapter 115**; the GIS zoning map is legally incorporated into it |
| Enabling law | Delaware Code Title 9 Ch. 69 — counties may regulate height, bulk, coverage, yards, density, use |

**AR-1 / AR-2 (Agricultural Residential) — his figures, from ecode360:**
- max height **42 ft**
- front **40 ft** · side **15 ft** · rear **20 ft**
- min lot **32,670 ft²** on-site wastewater · **20,000 ft²** with central sewer
- cluster options reduce minimum lot size under conditions

⚠ **UNVERIFIED BY PRYZM.** Quoted from his research, not read from the ordinance by us. Before a
single number reaches the UI it must be read from the primary source and cited — that is what the
Barcelona pack does with PGM Art. 242.2, and it is the whole basis of the card's credibility.
⚠ He also flags: *"don't hard-code these globally — Sussex has different districts and overlays, and
the ordinance has exceptions."*

---

## NATIONAL SOURCES — his ranking

| Dataset | Coverage | Parcels | Zoning | Setbacks/height/FAR | Capacity |
|---|---|---|---|---|---|
| **Regrid** | national | ✅ 160.9M, 3,229 counties | ✅ ~14,000 municipalities | ✅ | limited |
| **National Zoning Atlas** | 11,000+ jurisdictions published | — | ✅ 102,000 districts | **200+ attributes each** | partial |
| **Cotality** | top 50 metros | ✅ 50M+ | ✅ | ✅ | **✅ max buildable sqft + units** |
| County/city GIS | local | ✅ | ✅ | ✅ | sometimes |

⛔ **There is no authoritative free national parcel or zoning database.** Zoning is city/county/township.

**Constraint layers, all federal and public:**
FEMA National Flood Hazard Layer · USFWS National Wetlands Inventory (refreshed May/Oct) ·
USGS PAD-US 4.1 (protected land, 2025) · USDA NRCS SSURGO (soils — **carries building-site and
engineering interpretations**, which matters enormously for rural septic-limited parcels).

### ⭐⭐ The finding that most shapes PRYZM's AI posture
The National Zoning Atlas — who have logged 102,000 districts by hand — **tried ML on ordinance
reading and concluded it is not reliable**. So the architecture must be:
```
AI extraction → structured candidate rule → SOURCE CITATION → validation → human verification → production rule
```
never `LLM reads ordinance → trust answer`. ⭐ This independently corroborates the Astra audit's
verdict and PRYZM's existing human-gated rule-pack process.

---

## WHAT HE SAYS NOT TO DO
- ✗ build a national parcel dataset from scratch — years of reproducing aggregation
- ✗ treat Regrid as legal authority — it is an aggregator
- ✗ compute buildable area from FAR alone — nonsense on irregular parcels
- ✗ ignore overlays — *"one of the largest sources of false results"*
- ✗ assign ONE zoning code per parcel — base district **+** overlays, with precedence
- ✗ claim "you can build X"

⛔ **And a subtlety worth its own line:** an environmental polygon does not always mean "subtract".
It can mean prohibited / permit-required / buffer-required / mitigable. Constraints need an
**effect**, not just a geometry.

⭐ **Never discard the originating jurisdiction's parcel ID.** A user verifying against the county
record needs it, and an aggregator's id cannot do that job.

---

## HIS SEQUENCING — and it matches what he said for Delaware
> *"I would NOT start nationwide. Build one extremely complete 10 × 10 km golden tile … then test it
> against 100 real parcels and manually verify PRYZM's prediction against the municipal zoning /
> planner / permit record. Once the engine works, the national problem becomes primarily a
> data-ingestion problem."*

⭐ The 100-parcel verification is the part to keep. It is the only proposal here that produces a
NUMBER for how right the engine is — and per the Astra audit, PRYZM's chronic gap is measurement,
not capability.

---

## ⚠ FOR THE DEMO, THE HONEST SEQUENCING IS THE OPPOSITE OF THE AMBITION
The home-builder demo is days away. This document describes **months** of work.

| | |
|---|---|
| **Demo-critical** | context tiles (a bake), a Sussex **parcel** provider (days) |
| **Demo-optional** | the zoning rule pack — §ENVELOPE-NOT-A-GATE (C58 §1.20) means massing, BIM and the 3D site all work without a solved envelope; the card renders an honest absence arm |
| **Post-demo** | the AR-1 package, overlays, FEMA/NWI/PAD-US/SSURGO constraints, the three-capacity output |

⛔ Shipping a **wrong** AR-1 envelope to a home builder is far worse than showing "no determination
held for Sussex County". They will know their own setbacks.
