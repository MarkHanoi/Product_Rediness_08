# FR — the founder's reachability boundary (two transmissions, 2026-09-03)

> **PROVENANCE.** Founder-forwarded research, received **2026-09-03** (10:43 and later; one
> message clipped by the mail client after §17). Captured per the standing rule *"founder research
> → repo docs same-turn"*. Wording preserved where it carries the argument; the clipped tail is
> marked and **must not be reconstructed**.
>
> **What this document is.** A **correction to PRYZM's own France audit**
> ([`FR-DATA-GAP-AUDIT.md`](FR-DATA-GAP-AUDIT.md)), which the founder judges **too pessimistic**.
> It is not a build prompt. It changes the *classification* of French gaps, which changes what
> gets built and in what order.
>
> ⛔ **Nothing here is a measurement of PRYZM's code.** Every claim is about the FRENCH DATA
> ESTATE. The measured state of the repo is the audit's job, not this file's.

---

## §0 — The headline correction

> *"Very little is truly unreachable. But there is a meaningful set of things that are reachable
> as documents or evidence, yet not deterministically computable as a legal answer."*

The founder's four-layer framing of the French data universe:

| Layer | Can PRYZM reach it? | Can PRYZM compute it? |
|---|---:|---:|
| **National geographic facts** | **Yes, overwhelmingly** | **Yes** |
| **Published planning spatial rules** | **Yes, overwhelmingly where a document exists** | **Yes** |
| **Published planning parameters** | **Often** | **Often** |
| **Legal judgement / discretion** | **No dataset** | **No** |

> *"The first two are much more complete than your current document suggests. The third is the
> engineering problem. The fourth is the hard boundary."*

---

## §1 — The five-state model (replaces `known / unknown`)

**This is the single most actionable instruction in the transmission.** The founder asks that it
go directly into the PRYZM spec:

| State | Meaning |
|---|---|
| 🟢 **Source-complete** | an authoritative machine-readable value exists |
| 🔵 **Derivable** | authoritative geometry/data exists; **PRYZM calculates it** |
| 🟡 **Extractable** | the authoritative value exists in XML / text / PDF / graphic |
| 🟠 **Interpretive** | the rule exists but requires legal/semantic interpretation |
| 🔴 **Undeterminable** | no authoritative dataset can answer the question |

And the corresponding change to the solver's question:

> *"Don't make the solver ask **'Do I have height?'**. Make it ask **'What is the STATE of the
> height rule?'**"*

```json
{ "rule": "maximum_height", "status": "resolved",
  "value": 9, "unit": "m", "datum": "terrain_naturel",
  "source": "SRU_XML", "article": "UC 4.2" }

{ "rule": "maximum_height", "status": "qualitative",
  "text": "...", "source": "...", "article": "UC 4.2" }

{ "rule": "maximum_height", "status": "alternative", "alternatives": [ "..." ] }

{ "rule": "PAU", "status": "refused", "reason": "RNU" }
```

> *"That is much more robust than treating everything as a nullable numeric field."*

---

## §2 — The regulatory taxonomy is ALREADY machine-readable

The current **CNIG PLU 2025** prescription code list classifies rules by type. This is the finding
that most changes the build order:

```
15.01 implantation vs roads      38.02 maximum emprise au sol     39.02 maximum height
15.02 lateral boundaries         38.97 qualitative emprise        39.97 qualitative height
15.03 rear boundaries            38.98 alternative emprise        39.98 alternative height

40.02 maximum volumetry   41.* external appearance   42 coefficient de biotope
40.97 qualitative volumetry      43.* landscaping    44.* parking
40.98 alternative volumetry      47.* networks       48.* runoff / impermeability
50 prohibited uses               51 conditional uses
```

So a **deterministic decision tree** is available at the parcel:

```
parcel -> intersect prescriptions
       -> 39.02?  => need max-height parameter
       -> 15.01?  => need road setback
       -> 15.02?  => need lateral setback
       -> 38.02?  => need max footprint
       -> 40.02?  => need volumetric rule
```

> *"This is **much better than searching a 200-page PDF with an LLM**."*

⭐ **`39-97` (qualitative height) and `40-97` (qualitative volumetry) are EXPLICIT CODES.** That
means PRYZM can report **`QUALITATIVE RULE`** rather than **`UNKNOWN`** — a different, and honest,
answer, and one the source itself licenses.

---

## §3 — The regulation itself is increasingly machine-readable (CNIG SRU Level 1)

The **CNIG SRU Level 1** standard exists specifically to make PLU/PLUi regulations
*computationally exploitable*: a **parcel-queryable structured representation of the written
regulation**, text and diagrams, structured by blocks.

The PLU 2025 package permits:

```
3_Reglement/
    REGLEMENT.pdf              (mandatory)
    Reglement Xml              (optional — SRU)
    REGLEMENT_GRAPHIQUE.pdf    (optional)
    ressources/
```

**Therefore the extraction ladder is NOT "find the PDF and use NLP".** It is:

```
GPU -> NOMFIC / URLFIC -> SRU XML if present -> structured zone-specific regulation
    -> PDF only where necessary -> graphic interpretation only where necessary
```

---

## §4 — Where the boundary actually lies

GPU may serve `TYPEPSC=39 · STYPEPSC=02 · LIBELLE="Hauteur maximale" · geometry=polygon`. That
establishes **a maximum-height rule applies here**. The prescription schema does **not** make a
universal numeric `MAX_HEIGHT_METRES` field mandatory — it carries `TYPEPSC`, `STYPEPSC`,
`LIBELLE`, `TXT`, `NOMFIC`, `URLFIC`, `DATVALID`, `IDURBA`, geometry.

```
RULE EXISTS   = YES
RULE TYPE     = YES
RULE LOCATION = YES
RULE SOURCE   = YES
RULE VALUE    = NOT ALWAYS
```

**But "not a structured field" is not "not reachable".** Five states of a value:

1. **Native numeric** — `height = 9m`. Best.
2. **SRU XML** — still excellent.
3. **PDF text** — *"La hauteur maximale est fixée à 9 mètres…"* — machine extractable.
4. **Graphic** — a dimension on a plan graphique. Potentially machine-readable with
   document/diagram processing.
5. **Human legal judgement** — *"la construction doit s'intégrer harmonieusement…"* — **no
   legitimate numeric value.**

> *"The important question isn't 'Is the value in the API?' It is: **'Is the authoritative value
> recoverable by a deterministic extraction pipeline?'**"*

---

## §5 — Physical data is a separate, essentially solved problem

IGN / Géoplateforme exposes WFS/WMS, download APIs, geocoding, **altimetry**, isochrone/isodistance,
extraction and search. The Cadastre API gives parcel geometry and divisions. **BD TOPO** provides
building heights and 3D/topographic information (**BD TOPO Express** is now weekly). The
Géoplateforme altimetry service computes elevations and profiles from **RGE ALTI**.

So these are **PRYZM's to calculate** — 🔵 Derivable, not missing:

```
parcel_area · frontage_length · frontage_count · road-facing_edges · boundary_edges
terrain_z · terrain_slope · terrain_profile · neighbour_buildings · neighbour_heights
building_coverage · distances
```

> *"We shouldn't wait for a government API to hand us those exact derived attributes."*

### §5.1 — Frontage is a COMPUTATION, not a data gap (re-classifies audit blocker B1)

> *"It isn't 'Government doesn't publish frontage.' It is **'Frontage is a deterministic spatial
> computation over national reference geometry.'**"*

```
Cadastre + road network + parcel polygon -> parcel edge intersects road corridor? => frontage
```

with the honest split:

```
physical frontage 🟢 computable
legal   frontage 🟡 interpretation
```

### §5.2 — Datum: the founder AGREES with audit blocker B2

RGE ALTI 🟢 · sampling terrain 🟢 · **datum definition 🟡 semantic** · **application of datum 🟡
rule engine**. IGN gives terrain elevation; it cannot say whether the PLU means *terrain naturel*,
*terrain après travaux*, *niveau de la voie*, *égout*, *acrotère* or *faîtage*.

> *"The **terrain** is data. The **legal definition of the reference level** is in the rule. This
> is exactly the kind of thing PRYZM should own."*

---

## §6 — One correction to the audit's D1 statement

⛔ **Remove the sentence *"France has no D1."*** — too broad.

What is dead is the old **COS** density mechanism (removed/replaced in the post-2014/2015 reforms).
That does **not** mean surface-de-plancher constraints do not exist: French law still defines
**`surface de plancher`**, and current planning rules can impose floor-area-affecting rules,
including sector-specific mechanisms.

```
COS / old coefficient          = DISCARD
floor-area-based rule          = potentially ACTIVE
surface de plancher definition = ACTIVE
```

> *"Otherwise we could accidentally throw away a legitimate constraint just because it isn't
> called COS."*

---

## §7 — SITADEL as an evidence layer

**SITADEL** publishes planning authorisations (PC, PA, PD, relevant DP), monthly, queryable by
cadastral parcel or geometry, returning project/parcel information: previous permit, application,
authorisation type, date, created floor area, dwellings, parcel(s), project footprint.

> *"That **does not override the PLU**. But it gives PRYZM: 'Here is what has actually been
> authorised historically under this planning regime.' That's extremely useful validation."*

⭐ This is the French analogue of the NSW brief's §10 *"use the government's own answers"* — a
free, national, at-scale way to find where the rule graph is incomplete.

**Other non-envelope sources for the wider product:** BAN (addresses, migrated into the
Géoplateforme geocoding service) · OCS GE (national land use, two current vintages, a third being
prepared) · INPN protected spaces (91 current files, actively updated) · DVF geolocalised
transactions (last updated 2026-09-01).

---

## §8 — The genuinely RED list (short)

For a **documented** parcel, only these are hard-red:

```
RNU -> PAU determination
future permit decision
future ABF decision
authority discretion
legal party-wall status where not otherwise documented
numeric value for a genuinely qualitative rule
unpublished / local administrative interpretation
```

Detail on the ones that bind hardest:

- **RNU → PAU.** API Carto exposes a commune's **RNU status** 🟢. There is **no** national
  parcel-level dataset saying *parcel X ∈ parties actuellement urbanisées* 🔴. The determination is
  case-specific. **PRYZM must REFUSE the envelope — not infer it.**
- **ABF / discretion.** The constraint is reachable (monument historique, protected perimeter,
  **SUP AC1**, heritage zone) 🟢; *"ABF will approve this design"* is an outcome of an
  administrative process, not a missing API 🔴.
- **Legal party-wall (mitoyenneté).** *building touches boundary* is geometric 🟢; *this is legally
  a mitoyen wall* is a property-law fact national GIS cannot settle 🔴.

---

## §9 — The 🟠 middle: reachable, not necessarily computable

| Item | State |
|---|---|
| The actual height number | exists 🟢 · location 🟢 · rule type 🟢 · **number 🟡** · **meaning of the number 🟡** |
| Exact setback | where it applies 🟢 · geometry 🟢/🟡 · **distance 🟡** · **exceptions 🟠** |
| Datum used for height | terrain 🟢 · **definition 🟡** |
| **Graphic rules** | *"probably the biggest technical grey area"* — information encoded visually (a `5m` dimension against a road line). **reachable ≠ structured.** CV/parsing possible, needs validation |
| **Plan-masse** | reachable 🟢 — ⚠ *"polygon = actual buildable footprint" is **not something I would assume**.* Distinguish **plan-masse sector ≠ guaranteed 3D building volume** |
| **OAP** | applies 🟢 · geometry 🟢 · text 🟢 · **development implication 🟡** · **exact envelope 🟠** |
| Annexes / external constraints | sanitation, water, flood, risk, archaeology, noise, radioelectric, heritage, captages, forest… — *"the fact that it is in the PLU package doesn't mean it has a uniform national schema"* |

**NOT a reachability problem** (do not list these as missing data): parcel · zone ·
document/version/date · destinations · prescription existence/type/geometry · SUP · terrain ·
buildings · road geometry · heritage constraints · risk layers · historical permits · transactions.

---

## §10 — The layer stack, and where the moat is

```
              DATA ACCESS            🟢  |
                   |                      |  infrastructure
          SPATIAL INTERSECTION      🟢  |
                   |                      |
         RULE CLASSIFICATION        🟢  |
                   |
       PARAMETER EXTRACTION         🟡  |
                   |                      |  THE PRYZM MOAT
       LEGAL SEMANTIC PARSING       🟡/🟠 |
                   |                      |
       RULE INTERACTION ENGINE      🟠  |
                   |
       AUTHORITY DISCRETION         🔴  <- where PRYZM must REFUSE
```

---

## §11 — The decisive next experiment (this is the instruction, not the prose)

> *"I would **not spend another week hunting for more generic French APIs** before testing the
> actual rule payload."*

The measurable question:

> **Of the rules that apply to a random parcel, what percentage can PRYZM recover as an
> authoritative parameter without human judgement?**

The experiment:

> **A 100-parcel audit that traces every required PRYZM field all the way from
> `parcel -> authoritative source -> extracted value -> computable envelope`, labelling each failure
> as `missing source | inaccessible | PDF | graphic | semantic | discretionary`.**

### The caveat the founder attaches to it

CNIG supports multiple versions (PLU/CC **v2022-10** and **v2025-06**, older versions retained as
legacy), and real GPU packages vary substantially. Two different claims:

> *"France publishes the information somewhere"* — **very strong.**
> *"PRYZM can retrieve and parse it automatically for every parcel"* — **still needs measurement.**

Working boundary, explicitly **not for the investor/product spec until measured**:

- **~80–90 %** of the envelope information is directly accessible or deterministically derivable
- **most of the remaining 10–20 %** is accessible but needs document/rule extraction
- **a small residual** is genuinely non-computable — qualitative, discretionary, or case-by-case

---

## §12 — Sources cited in the transmission

API Carto GPU module · CNIG PLU 2025 model + `PrescriptionSUrbaType` code table ·
CNIG SRU Niveau 1 standard (`250603_standard_cnig_sru_niveau1_v2023_rev2025-06.pdf`) ·
IGN Géoservices web services + altimetry · API Carto Cadastre module · BD TOPO / BD TOPO Express ·
API Adresse (BAN) · OCS GE · INPN Espaces Protégés · DVF géolocalisées · SITADEL (+ the
"Mon Territoire Carto" reuse describing per-parcel/geometry query) · Légifrance
`LEGIARTI000029593965` (L123-1-5, the COS repeal) and the *surface de plancher* section ·
Géoportail de l'Urbanisme document views `56248_PLU_20251209`, `39441_PLU_20251209`.

*(URLs as forwarded carry `utm_source=chatgpt.com` query strings; they are the founder's research
trail, not PRYZM endpoints. Re-verify any endpoint against official documentation before wiring —
`NEVER INVENT AN ENDPOINT`, the rule the Denmark prompt states explicitly and which applies here.)*

---

## §13 — What this changes in PRYZM's France plan

| Audit position | Founder's correction | Consequence |
|---|---|---|
| B1 frontage = data gap | **Deterministic computation** over cadastre + road network | Build the solver; stop sourcing |
| B2 datum = gap | **Agreed** — and it is PRYZM's to own | Keep as a real blocker |
| *"France has no D1"* | **Wrong** — COS is dead, `surface de plancher` is not | Do not discard floor-area rules |
| Extraction starts at PDF+NLP | **Starts at SRU XML** via `NOMFIC`/`URLFIC` | Re-order the ladder |
| `known / unknown` | **Five states** 🟢🔵🟡🟠🔴 | Schema change, and it generalises beyond FR |
| Qualitative rule => unknown | `39-97` / `40-97` => **`QUALITATIVE RULE`** | An honest third answer |
| More API hunting | **100-parcel end-to-end audit** | The next experiment |

⭐ **The five-state model and the "what is the STATE of the rule" reframing are not France-specific.**
They are the same shape as the NSW brief's status taxonomy (A–F2) and the Netherlands brief's
(A–F2). Whatever lands should land in the **shared** envelope vocabulary, not in the FR adapter —
the same instruction the NSW brief gives about the inclined-plane primitive.
