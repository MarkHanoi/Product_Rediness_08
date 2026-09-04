# NL — the founder's deep audit: parcel → buildable envelope (transmission 3, 2026-09-04)

> **PROVENANCE.** Founder-forwarded research, third NL transmission of the day. Captured per the
> standing rule. Predecessors: [`NL-FOUNDER-BLOCKER-REVIEW.md`](NL-FOUNDER-BLOCKER-REVIEW.md) (the
> ranking inversion) and [`NL-ENVELOPE-COMPLETION.md`](NL-ENVELOPE-COMPLETION.md) (the measured M1–M6).
>
> **What this one does.** It goes below datasets into **the actual Dutch machine-readable stack and the
> legal mechanics**, and answers the real question — *can we take an arbitrary BRK parcel and derive
> the maximum legally permissible building volume from machine-readable evidence?* — with a
> reclassification and **eight hidden gaps**, most of which are algorithms, not data.
>
> ⚠ Every citation is the founder's (Ontwikkelaarsportaal, PDOK, IPLO); **not re-verified by PRYZM**.

---

## §0 — The reclassification

| Layer | Verdict |
|---|---|
| **Physical data** | 🟢 **VERY STRONG** |
| **Legal source data** | 🟢 **VERY STRONG** |
| **Legal-to-geometric interpretation** | 🟠 **HARD** |
| **Individual legal entitlement / exceptions** | 🔴 **NOT fully machine-deterministic** |

> **"The raw legal corpus is NOT your primary missing dataset."**

The DSO is far richer than a zoning GIS: **Presenteren v8** is object-oriented, exposes Omgevingswet
documents with annotations (activities, locations, gebiedsaanwijzingen), and covers **Rijk, provinces,
municipalities and water authorities**. The **Download API** delivers the actual legal text, GIOs and
OW objects per regulation version — **so PDFs are not the primary source.**

⛔ **Change the wording of the NL gap.** Not *"we are missing lots of data"* but:

> **"We have access to most of the authoritative physical and legal source data; we are missing a
> nationwide deterministic COMPILER that resolves applicability, temporal precedence, legal
> definitions, reference geometry and individual exceptions into a 3D constraint graph."**

---

## §1 — Master inventory (compressed; every row 🟢 nationwide unless marked)

**HAVE:** BRK parcel/area/id · BAG buildings/ids/status/addresses · BGT topography · AHN terrain ·
3D Basisvoorziening · RCE/PDOK heritage · PDOK Natura 2000 · WKPB public-law restrictions.
**HAVE SOURCE (in DSO/IMOW/IMRO):** municipal omgevingsplan · legacy bestemmingsplan (⚠ *"a small
portion is not available for technical reasons"* per the RP API itself) · provincial
omgevingsverordening · waterschapsverordening · national rules (Bkl/Bbl/Bal) · rule geometries (GIO) ·
rule values/norms · activities · area designations · legal definitions · historical versions ·
draft/future documents.
**DERIVE:** building orientation/front (from BGT/BAG).
**PARTIAL:** existing legal permit/decision.
**GAP (source exists, NOT normalised):** legal `peil` · setback · `bouwdiepte` · roof pitch/type/ridge
· coverage denominator · max floors · max volume (*unknown — audit*).
**MAJOR GAP:** individual permit conditions — no consistent national API.
**TRUE GAP:** BOPA outcome — not deterministic.

---

## §2 — The DSO is the central database, not one dataset among four

```
                    DSO
       ┌─────────────┼─────────────┐
   municipality   province     waterschap
       └─────────────┼─────────────┘
                 Rijk rules
                     ↓
              applicable rules
```

⭐ The geometry API is **not meaningful on its own** — PDOK states the geometry tiles carry essentially
the geometry identifier and **must be combined with Presenteren** to know what a geometry legally means.

**Two different things are needed from the DSO:**
- **A. Spatial rule discovery** — *which legal objects intersect this parcel?* (locations, GIOs,
  activities, gebiedsaanwijzingen)
- **B. Legal rule interpretation** — *what does the rule say?* (juridical text, annotations, norm
  values, units, relationships, definitions, applicability)

```
BRK parcel → spatial intersection → DSO locations → applicable OW objects → juridical rules
           → legal text + annotations → canonical constraint → 3D geometry
```

---

## §3 — The eight hidden gaps

### Gap 1 — Applicability is more than intersection
⛔ `parcel intersects rule geometry → rule applies` is **wrong**. Resolve **location + activity +
subject + rule scope + authority + effective date + exceptions**. A rule may apply only to a certain
activity, building type, use, area or object category. ⭐ The DSO's **Toepasbaar Opvragen** API exposes
activities and locations specifically for determining applicable rules — incorporate it.

### Gap 2 — Activity is PART of the envelope
Not *"what may I build?"* but **"what activity am I performing?"** — new construction / extension /
replacement / renovation / associated building / dwelling / commercial / agricultural. The DSO's
**Uitvoeren** service returns questions and conclusions for permit checks from **activity + location**.
```
Parcel + Proposed activity + Building type → Applicable legal rules → Envelope
```

### Gap 3 — The Bruidsschat is not optional, and it is PROCEDURAL
For *bijbehorende bouwwerken* the official rules involve rear-yard geometry, distance from
publicly-accessible area, max height, distance from the ORIGINAL main building, roof pitch, ridge,
parcel-boundary distance, max area — **and these are conditional formulas, not constants**:
```
distance ≤ 4 m from original main building → one height regime
distance > 4 m → roof required → pitch ≤ 55° → ridge ≤ 5 m → ridge FORMULA in distance-to-boundary
+ an AREA formula over `bebouwingsgebied`
```
> ⭐ **The engine needs PROCEDURAL geometry, not just parameters.**

### Gap 4 — `bebouwingsgebied` is a DERIVED geometry — an algorithm, not a dataset
IPLO: `bebouwingsgebied` = *achtererfgebied* + land beneath the main building, **excluding** land
beneath the ORIGINAL main building. And *achtererfgebied* derives from the front of the main building,
a **1 m offset**, publicly-accessible area, building orientation and the parcel boundary.
```
BAG hoofdgebouw + BGT openbaar toegankelijk gebied + BRK parcel
  → front of building → 1 m offset → achtererfgebied → bebouwingsgebied → max associated-building area
```
> *"This is exactly the kind of deterministic geometric intelligence PRYZM should own."*

### Gap 5 — Existing-building LEGAL status matters
You cannot simply subtract the BAG footprint. Distinguish: **original hoofdgebouw · existing legal
extension · existing associated building · illegal building · permitted building · temporary
building**. The official procedure requires determining the ORIGINAL main building. **BAG gives
physical registration, not legal history.** A real gap → resolve from BAG history + published
permits/decisions + planning history + municipal evidence, **with confidence levels**.

### Gap 6 — Permits matter more than first credited
⭐ The current PDOK Omgevingswet geometry dataset contains geometries from **both omgevingsdocumenten
AND vergunningen**. A parcel may carry an individually permitted building the generic rule would not
generate. **Permit geometry = available. Complete permit-derived entitlement = not guaranteed.** A
separate confidence class.

### Gap 7 — BOPA is not the only exception
Also **maatwerkvoorschrift** (specifies/supplements general rules for one situation) and
**vergunningvoorschrift** (permit conditions can alter what applies). The real hierarchy:
```
GENERAL LEGAL RULE → LOCAL RULE → INDIVIDUAL DECISION → INDIVIDUAL CONDITIONS
```
> *"This is why a perfect nationwide 'one envelope number' is impossible from generic zoning data
> alone."*

### Gap 8 — Do NOT blindly fold Bbl technical rules into the envelope
IPLO separates the **technical building activity** (Bbl) from the **spatial** omgevingsplan activity.
**A. Spatial envelope** — *where / how much?* **B. Technical feasibility** — *can it satisfy fire,
structure, energy, accessibility, ventilation, daylight?* The latter constrain a design; they do **not**
define the maximum permissible outer solid.

---

## §4 — Peil, setbacks, depth, coverage, roof: NOT missing — needing COMPILATION

### `peil` is deeper than a missing elevation
Needs **the legal definition AND its physical implementation**. *"peil = hoogte van de weg ter plaatse
van de hoofdtoegang"* → identify road → identify main access → exact measurement point → road/terrain
elevation → legal datum → apply height. Derivable from BAG + BGT + AHN **only after the definition is
known**. Source exists: often. Normalised nationally: no. Directly machine-readable: no. **Deterministically
derivable when the definition is explicit and the physical reference exists: yes** → a
`deterministic-inference` pathway, **not `missing`**.

### Setbacks — reference-aware compilation
*"minimum distance to side boundary = 3 m"* compiles to `parcel − buffer(parcel_boundary, 3m)`. The
missing capability is **reference-aware legal geometry compilation**, not a setback dataset.

### `bouwdiepte` — needs a reference and a direction
```json
{ "type":"maximum_depth", "value":12, "unit":"m", "reference":"front_building_line",
  "direction":"parcel_interior", "subject":"main_building" }
```

### Coverage — a FORMULA AST, not a number
`bebouwingspercentage = 50%` is incomplete: **percentage of WHAT?** (parcel / bouwvlak / bouwperceel /
bebouwingsgebied / other) — and does existing building count, do associated buildings, does
underground, does temporary? The bruidsschat example shows even the area calculation is procedural.

### Roof — parametric, conditional
`roof_type · roof_pitch · eaves_height · ridge_height · ridge_direction · ridge_position ·
roof_start_distance · roof_formula`. The bruidsschat rule (distance → regime → roof → pitch ≤ 55° →
ridge formula) is **a parametric building-envelope rule** — it maps directly onto the BIM/world-model
architecture.

---

## §5 — Province, waterschap, Rijk are not "overlays" to clip
⛔ Not `municipal envelope − water polygons − province polygons`. Instead `legal rule → applicability →
activity → constraint type → geometry`. Province → **instructieregel** (municipality must incorporate);
Waterschap → **direct water-activity rule** (applicant restriction); Rijk → direct national rule. The
DSO distinguishes these authorities and legal objects.

---

## §6 — Two sources to add immediately

### ⭐ Toepasbare Regels — a second, EXECUTABLE representation
The DSO holds machine-readable applicable rules already transformed from legal rules into **question
trees** for the vergunningcheck. **Legal source = authoritative evidence. Toepasbare regel = executable
interpretation.** That yields a cross-validation mechanism:
```
OUR RULE ENGINE  ↔  DSO TOEPASBARE REGEL  ↔  LEGAL SOURCE      — disagree → REVIEW
```

### Omgevingsinformatie Ontsluiten v2 — the hybrid discovery layer
Its own documentation says it **combines the new Omgevingswet world and the old IMRO/Ruimtelijke
Plannen world** because of the hybrid transition to 2032. ⭐ Investigate it as the discovery layer
instead of building separate IMOW and IMRO engines.

---

## §7 — Temporal state is P0
Not just `valid_from / valid_to` but **draft · future · current · ended · replaced · amended ·
overridden**. The DSO provides current/future-valid and historical collections. The engine must answer
*"what was legally applicable at the target date?"*, not *"what polygon intersects now?"*

---

## §8 — What is genuinely NOT a clean nationwide dataset (defend this list)
🔴 1. Universal normalised `legal_peil` (`parcel_id → peil_m_NAP`) · 🔴 2. Universal normalised setbacks
· 🔴 3. Universal normalised `bouwdiepte` · 🔴 4. Universal normalised roof-geometry rules · 🔴 5. Complete
individual permit entitlement (geometries exist; the full entitlement/condition/exception database does
not) · 🔴 6. BOPA future outcome · 🔴 7. Complete legal-vs-illegal existing-building state.

⛔ **But these are NOT "missing data":** `bouwvlak · bouwhoogte · goothoogte · coverage · dakhelling ·
nokhoogte · bouwlagen` **exist in the DSO/IMOW/IMRO ecosystem**. The problem is **EXTRACTION + SEMANTICS
+ APPLICABILITY + REFERENCE GEOMETRY + LEGAL PRECEDENCE** — *"a huge difference."*

---

## §9 — The eight engineering tracks
**P0** Legal applicability engine (parcel → intersecting locations → activity → authority →
applicability → exceptions) · **P0** Temporal/legal-state engine (IMRO + temporary omgevingsplan +
Bruidsschat + amendments + permanent + future) · **P0** Constraint extraction (height, eaves, ridge,
coverage, floors, depth, setback, roof, volume, use) · **P0** Reference-geometry compiler (parcel
boundary, building front, road, public area, bouwvlak, water → geometry) · **P0** Peil engine (legal
definition → physical reference → elevation → legal Z) · **P1** Higher-authority compiler (province,
waterschap, Rijk) · **P1** Existing-entitlement engine (BAG + permits + planning history) · **P1**
Exceptional/uncertain state (BOPA, maatwerk, permit conditions, contradictions, missing evidence).

---

## §10 — The data model is not "envelope parameters"
```
PARCEL
 ├── PHYSICAL FACTS   BRK · BAG · BGT · AHN · 3D
 ├── LEGAL STATE      municipal · provincial · waterschap · national · temporary · permanent · amendments · precedence
 ├── LEGAL RULES      activities · locations · norms · definitions · conditions
 ├── DERIVED GEOMETRY bouwvlak · achtererfgebied · bebouwingsgebied · setbacks · buildable footprint · exclusion zones
 ├── DERIVED VERTICAL peil · Zmax · goot · nok · roof geometry
 └── OUTCOME          PERMITTED · POSSIBLE · BOUNDED · REFUSED
```

## §11 — The architecture
```
AUTHORITATIVE LEGAL SOURCES → DSO / IMOW / IMRO → RULE COMPILER
        ├── OUR GEOMETRIC ENGINE        ├── DSO TOEPASBARE REGELS
        └──────────── CROSS-CHECK ─────┘
                    → 3D CONSTRAINT GRAPH → MAX LEGAL ENVELOPE
```

## §12 — The next audit (the instruction)
> **"The remaining question is no longer *what APIs are we missing?* — it is *which specific rule
> families still fail to compile deterministically, and for what percentage of Dutch parcels*."**

That is the audit to run: per rule family (peil, setback, depth, coverage, roof, floors, volume),
the share of a random parcel sample where the compiler resolves it deterministically, and the failure
class where it does not — the same shape as France's 100-parcel audit, applied to NL.
