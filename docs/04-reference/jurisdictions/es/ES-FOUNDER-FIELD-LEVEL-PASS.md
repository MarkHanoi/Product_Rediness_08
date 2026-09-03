# ES — the founder's field-level pass (transmissions 4 and 5, 2026-09-03)

> **PROVENANCE.** Founder-forwarded research, transmissions 4 and 5 of five received **2026-09-03**.
> Part I is [`ES-FOUNDER-SOURCE-ARCHAEOLOGY.md`](ES-FOUNDER-SOURCE-ARCHAEOLOGY.md) (source level);
> **this is the FIELD/SCHEMA level pass**, which raises the estimate again and says where the
> remaining gap actually hides.
>
> ⛔ **Nothing here is verified and nothing here measures PRYZM's code.** Every URL in the
> transmission is a research trail (`utm_source=chatgpt.com`). **NEVER INVENT AN ENDPOINT** —
> re-verify against official documentation before wiring.

---

## §1 — The headline estimate

| Scope | Estimate |
|---|---|
| Mature regions, machine-computable envelope | **~75–85 %** |
| **Nationally**, automatic parcel-specific current legally-defensible envelope | **~55–65 %** |

> *"**You are much closer to 90 % technically than you are to 90 % legally.** The remaining gap is
> disproportionately difficult because it consists of precedence, exceptions, graphical rules,
> amendments and document interpretation, rather than missing basic GIS data."*

A later pass in the same transmission raises the raw-input figure again:

> **~85 % ± 5 % of the raw inputs are probably publicly obtainable** — but **only ~60–70 % of the
> effective legal rules are straightforward to resolve automatically**, and **~50–60 % can be made
> legally defensible without a human gate.** *"The difference is the RESOLUTION problem, not the
> absence of data."*

---

## §2 — SIPU already contains almost the entire PRYZM parameter vocabulary

⭐ **The strongest single piece of evidence across all five transmissions.** The official Canarias
SIPU specification defines fields for minimum parcel, minimum frontage, minimum inscribed circle,
front / rear / side setbacks, maximum depth, separation between volumes, maximum occupancy %,
maximum occupiable area, maximum edificability, maximum buildable area, maximum floors, and maximum
height in metres — **each with its own observations/conditions field**:

```
SupMin · LongMin · CircInsc · SepMinFr · SepMinPs · SepMinLt · FondoMax
SepMnVol · PMaxOcup · SupOcMax · EdifMax · SupEdMax · AltMaxPl · AltMaxMt
```

> *"That's almost a ready-made Envelope Parameter Schema. This isn't theoretical — the historical
> Spanish urban-planning standard literally defines fields remarkably close to what you're building."*

**The problem is therefore not "Spain doesn't have the parameters."** It is: *how many CURRENT plans
have them populated, and how reliably can they be joined to a parcel?* Canarias states the design
explicitly — `polygon → code → alphanumeric record → parameters` — so the remaining problem there is
not acquisition but **which plan or modification wins**.

⭐ **ACTION: cross-map `STR-ENVELOPE-PARAMETER-REFERENCE.md` against the SIPU schema FIELD BY FIELD
before building another parameter extractor.** *"If this mapping works, we don't need to invent a new
semantic representation for these regions."*

---

## §3 — Two canonical layers PRYZM's model is missing

### §3.1 — `alineaciones` — the legal building line, drawn

Valencia publishes **PGOU – Alineaciones** as a first-class spatial dataset (WFS, JSON, CSV, GML,
DWG, KML, WMS, with a queryable ArcGIS REST service), carrying an `Altura` field and protection
information. Pamplona publishes **PM. Alineaciones** (SHP + WFS), **updated April 2026** — a current
municipal pattern, not a historical curiosity.

> ⭐ **Consuming the line the plan already drew is far more reliable than interpreting "5 metres from
> the street."** ⚠ But you must search for it **separately from "planeamiento"**.

```
alignment: { geometry, type, source, plan_id, validity, legal_status }
```

### §3.2 — Urban MANAGEMENT changes the practical envelope

Arganda del Rey publishes **Unidades de Ejecución** as GeoJSON/JSON. Donostia publishes
**Condiciones de ejecución urbanística** — buildings out of planning order, expropriation areas,
execution units, integrated-action areas, status, approval date, area — with all post-2010 PGOU
modifications incorporated.

Hunt for: *Unidades de Ejecución / de Actuación · Ámbitos de Gestión · Ámbitos de Actuación Integrada
· reparcelaciones · expropriation areas · transferencias de aprovechamiento · compensación ·
urbanization projects · development sectors · **Estudios de Detalle · Planes Parciales · Planes
Especiales***.

⭐ **Therefore add a `development_status` dimension:**

```
consolidated | planned | pending_management | execution_unit | reparcellation_required
| urbanization_required | out_of_order | special_management | protected | unknown
```

> **"What can theoretically be built?" ≠ "what can be licensed on this parcel today?"**
> *"Those are different states."*

---

## §4 — The precedence chain, and why `Estudios de Detalle` matter

El Sauzal publishes machine-readable **SIPU for approved Estudios de Detalle**, one explicitly
concerning *maintenance of the existing alignment* — a detailed instrument **overriding** the general
plan. Mogán's catalogue carries actual **FIP** files for Plan Parcial, modifications, consolidated
texts and special planning, with associated SIPU and GeoBDP documents.

> *"That's essentially the raw material for a **planning compiler**."*

```
PGOU → Modification → Plan Parcial → Plan Especial → Estudio de Detalle → parcel-specific condition
```

**Your engine needs to know the precedence.** This is the axis the founder rates hardest, and it has
**no universal machine model** anywhere in Spain.

---

## §5 — Spain needs a RULE ENGINE, not a row of three numbers

Real 2026 Andalusian planning publications carry conditional systems: occupancy **80 % on ground,
70 % on upper floors**; maximum edificability **1.5 / 2.0 / 2.5 / 3.0 m²t/m²s depending on the number
of floors**; attic setback 3 m; attic occupancy **≤ 50 % of the floor below**. Others derive height
from floor count, street relationship, façade elevation, average street grade and corner conditions.
One states that maximum edificability *is the result of applying* occupancy and height.

```
IF zone=CH-2 AND use=residential AND parcel_area<=200m² THEN occupancy_ground=80% ELSE 70%
IF floors=3 THEN height <= 10.50m
IF parcel.frontage > X THEN a different building-depth rule
IF parcel has two opposite streets THEN split into two depth zones
```

> *"This isn't missing information. It's **legal computation**."*

⭐ **So the canonical constraint model must support SIX forms, not one:**

| Form | Example |
|---|---|
| **scalar** | `15 m` |
| **formula** | `0.5 × street width` |
| **conditional** | `IF use=X THEN …` |
| **geometric** | `POLYGON` |
| **linear** | `LINESTRING` |
| **document-derived** | `article 7.3.4` |

Madrid's dedicated **Condiciones de la Edificación** layer already represents building depth and the
weighted buildability coefficient, and **identifies parcels requiring specific fichas**.

---

## §6 — Andalucía's Feb-2026 standard: real, and deliberately incomplete

The *Normas Directoras de la documentación electrónica de los instrumentos de ordenación urbanística*
require standardized electronic documentation, spatial data, **GeoPackage or SHP**, metadata, unique
instrument identification, and identification of modifications, corrections and consolidated texts —
with municipalities obliged to send complete standardized instruments into the regional system.

```
Municipality → standardized planning package → regional registry → machine-readable spatial model
```

⚠ **But the standard states outright that it does NOT attempt to encode every planning
determination** — only those considered essential for homogeneous dissemination. **Do not assume
Andalucía suddenly yields 100 % of envelope rules.** Status: 🟠 **investigate urgently**, do not mark
red.

---

## §7 — Three targets, and the honest ceiling

| Target | Question | Current potential |
|---|---|---|
| **A** Spatially correct envelope | *"What area/volume is probably buildable?"* | **~80–90 %** |
| **B** Planning-correct envelope | *"What does the current instrument allow?"* | **~65–80 %** |
| **C** Legally defensible automatic answer | *"Is this THE legally permitted maximum?"* | **~50–65 %** |

> *"And I don't think this ceiling is a failure of the product. **It is a property of Spanish
> planning.**"*

**Where the remaining 20–30 % hides** — the founder stresses these **overlap, so do not add them
literally**:

| Share | Gap |
|---|---|
| ~5 % | technical endpoint discovery (municipal ArcGIS, GeoServer, WFS, GetFeatureInfo, FIP, SIPU, registers) |
| 5–10 % | structured parameter extraction — FIP/SIPU/MUIB/regional DB → canonical model |
| 5–10 % | document semantic extraction — PGOU + ordinance + ficha + modification → structured rules |
| **5–10 %** | **precedence + temporal resolution — *"the hardest part"*** |
| ~5 % | graphical / legal interpretation — alignment, depth, special geometry, formulas |

---

## §8 — Field-level confidence

| Band | Fields |
|---|---|
| 🟢 **90–100 %** | cadastral parcel geometry · cadastral reference · parcel area · existing footprint · building parts · existing floors · existing GFA · terrain (MDT) · LiDAR (PNOA) · land classification · zoning/qualification |
| 🟡 **65–85 %** | applicable plan · plan version/date · FAR/edificability · max occupancy · max floors · max height · min parcel · density/dwellings · aprovechamiento |
| 🟠 **40–70 %** | front setback · side/rear setback · building depth · building alignment · street/rasante relationship · special-plan applicability · parcel-specific ficha · planning amendments |
| 🔴 **30–60 %** | **rule precedence — NO universal machine model** · legal currentness reconciliation |
| 🔴 **~0 %** | **universal parcel → final envelope — does not exist as a national service** |

⭐ **"Your canonical schema is AHEAD of the available national data, rather than the other way
around. That's a good position. You shouldn't simplify the schema to match the current APIs."** The
canonical model is the **semantic normalization layer**.

---

## §9 — Product framing

⛔ **Do not promise *"AI tells you what you can build."*** Promise:

> *"PRYZM compiles Spain's planning, cadastral, environmental and regulatory data into a **traceable**
> 3D buildable envelope."*

— where every constraint is inspectable:

```
MAX HEIGHT 10.50 m
────────────────────────────────
Source:           PGOU Fernán Núñez, Art. 9.23.2(b)
Confidence:       authoritative-document-derived
Applied because:  Zone CH-2
Overrides:        General height rule
```

⛔ **Do NOT chase "100 % machine-readable" as the product KPI.** The founder's KPI:

> **% of parcels for which PRYZM can produce a complete envelope + provenance + confidence WITHOUT
> human intervention.**

> *"That is measurable, defensible, and potentially a very strong competitive moat."*

---

## §10 — The five-phase build

1. **Prove the structured layer** — Canarias + Balears + Madrid + Murcia + Euskadi. Take real
   parcels and measure zone, FAR, occupancy, floors, height, setbacks, depth, alignment, density,
   special conditions. ⭐ **"Don't measure datasets. Measure actual PARCELS."**
2. **FIP/SIPU compiler** — `FIP XML → SIPU → canonical PRYZM rule schema`. *"This could be your
   biggest shortcut."*
3. **Rule compiler** — *"unless… / provided that… / except…"* → constraint graph.
4. **Precedence engine** — territorial → general plan → development plan → special plan →
   modification → parcel-specific ficha → sectorial restriction, **with explicit legal provenance**.
5. **Human gate** — only when `confidence < threshold`.

---

## §11 — THE DECISIVE TEST (this is the instruction, not the prose)

> *"Rather than another general web search, I would run a **municipality-by-municipality forensic
> audit** across representative regions."*

**Madrid → Barcelona → Valencia → Palma → Las Palmas → Santa Cruz/La Laguna → Bilbao → Donostia →
Pamplona → Murcia → Zaragoza → Sevilla → Málaga → Córdoba → A Coruña → Oviedo → Santander → Logroño
→ Valladolid → Cáceres/Badajoz.**

For each, hunt **every** endpoint and structured resource:

```
WFS · WMS(GetFeatureInfo) · ArcGIS REST · FeatureServer · GeoServer · CSW · FIP · SIPU
JSON · XML · GeoJSON · GPKG · SHP · DWG/DXF
planning registry · amendments · execution units · alignments · special plans · fichas
```

Then **take ONE REAL CADASTRAL PARCEL PER CITY and try to reconstruct the complete envelope.**

That produces the first genuinely defensible number:

> **"PRYZM can automatically reconstruct X % of the legally relevant envelope for Y % of Spanish
> parcels"** — *"not a generic 'Spain is 80 % covered'."*

---

## §12 — The 20 source types the ES connector must search

**Cadastre** — `cadastral_parcel` · `cadastral_building` · `cadastral_address`
**Physical context** — `terrain` · `lidar` · `orthophoto`
**Planning** — `classification` · `zoning` · `detailed_zoning` · **`building_alignment`** ·
**`building_depth`** · **`height_plane`** · **`building_line`**
**Development management** — `development_sector` · **`execution_unit`** · `management_area` ·
`reparcelation` · `development_plan`
**Legal / regulatory** — `planning_instrument` · `planning_amendment`

Plus, separately: `planning_rule` · `special_condition` · `parcel_ficha` · `legal_document` ·
`approval_event`.

**And the sectoral cuts, which are not "urban planning" but do cut the envelope:** coastal · flood ·
protected_area · heritage · forest · water · road · rail · airport · port · utility · energy ·
pipeline · telecom.

---

## §13 — The moat

Bizkaia's own metadata is the clearest statement of the real problem anywhere in the five
transmissions: the published information is **orientative**; the legally binding documents are the
**approved planning documents**, which historically **may exist on paper** in municipal, foral or
government archives; and the municipal plans are **not homogeneous** and require interpretation to
yield coherent territory-wide information.

> **"The GIS is structured, but the law isn't normalized. That is precisely the problem PRYZM has to
> solve."**

And therefore:

> *"If another company had a secret national database containing every Spanish FAR, height and
> setback, the moat would be the database. But what I'm finding is that the underlying information is
> scattered across **public** infrastructure. The moat can therefore be **PRYZM's ability to discover,
> reconcile, interpret, version, provenance-track and geometrically compile all of those sources into
> one live 3D rule graph.** **The missing product is the compiler.**"*

⭐ **Stop asking "what data are we missing?" Start asking "what TRANSFORMATIONS are missing between
publicly available data and the final envelope?"**

```
PUBLIC DATA → {CATASTRO, PLANNING(GIS|FIP|DOC), CONTEXT}
            → PLAN RESOLUTION → RULE NORMALIZATION → PRECEDENCE/OVERRIDE
            → GEOMETRIC CONSTRAINTS → 3D ENVELOPE
```
