# PT — the envelope derivation doctrine (founder transmission, 2026-09-04)

> **PROVENANCE.** Founder-authored operating doctrine for the Portugal (Continente) envelope
> engine, received **2026-09-04**. Captured verbatim in substance per the standing rule
> *"founder research → repo docs same-turn"*.
>
> **What this is.** Not a research note and not an audit — a **ROLE specification**: the rules the
> PT derivation must obey, the jurisdictional facts it may treat as established, the source
> precedence, and the procedure. It supersedes looser PT guidance where they disagree on method.
>
> ⛔ **The legal facts below are the founder's, not PRYZM's measurements.** Where a statute status
> is time-sensitive (RGEU revocation, DL 108/2026, BUPi) the doctrine itself says **verify before
> relying** — do that, do not transcribe.

---

## §0 — Role and the four non-negotiables

> *"You derive maximum buildable volumes for parcels in Portugal (Continente), **or you refuse with
> a citation**. A cited refusal is a valid, complete product. **A number without an article is not.**"*

1. **Every emitted value carries** — value + unit · instrument + version + date in force · article ·
   `derivation_method` (`direct | table-lookup | computed | interpolated | inferred`) · inputs ·
   `retrieved_at` · `confidence` (`resolved | assumed | unresolved`) · and `refusal_reason` when
   unresolved.
2. **Any parameter at `unresolved` BLOCKS the envelope.** Emit the refusal instead.
3. **Never silently substitute a default** for a missing municipal parameter.
4. **Never present a discretionary outcome as an entitlement.** If parameters are not densified in
   the plan, output a **range with a stated basis**.

⭐ This is the same doctrine PRYZM already ratified as `EnvelopeRefusal.legallyGrounded` +
`FieldProvenance` + `EnvelopeConfidence`. **Extend that vocabulary; do not mint a rival.**

---

## §1 — Coordinate system

**PT-TM06/ETRS89, EPSG:3763**, mandated for all IGT graphic pieces. **Açores use EPSG:2188/2189 by
island group.** Coastal LiDAR references **Datum Altimétrico de Cascais Helmert 38**.
⛔ **Never mix.**

---

## §2 — The parameter dictionary is NATIONAL and MANDATORY

**Decreto Regulamentar 5/2019** fixes **73 technical concepts**. Their use is **obligatory** and
**no plan may define its own version or abbreviation**. A *regulamento* is excused from defining
them.

### §2.1 — The indices

```
Iu    = Ac / As                          (dimensionless)
Io    = (Ai / As) × 100                  (%)
Iimp  = (Aimp / As) × 100 ;  Aimp = Cimp × As ;  Cimp ∈ [0,1]
        reference Cimp: built/impermeable 1.0 · semi-permeable 0.5 · planted/natural 0
Iv    = V / As                           (m³/m²)
Pm    = Ac / Ai                          (AVERAGE storeys — NOT an integer count)
Dhab  = F / As                           (fogos/ha)
```

### §2.2 — `Ac` (área de construção)

Sum of all floors **above and below** the *cota de soleira*, **EXCLUDING** *sótão* and *cave*
without regulation *pé-direito*. Measured per floor at the **EXTERIOR perimeter of exterior walls**.

**INCLUDES** covered circulation (*átrios, galerias, corredores, caixas de escada, caixas de
elevador*) and covered exterior spaces (*alpendres, telheiros, varandas, terraços cobertos*).

**Standard disaggregation:** `Ac hab / com / serv / est / arr / ext / ind / log`, and separately
**above vs below the cota de soleira**.

### §2.3 — `Ai` (área de implantação)

Closed polygon of the building's contact with soil **PLUS** the exterior perimeter of exterior walls
of **basement** floors. Buildings spanning a public way **subtract the enclosed public way**.

### §2.4 — Datum and height — five distinct quantities, never collapsed

| | Concept | Definition |
|---|---|---|
| **S** | *cota de soleira* | level of the main entrance threshold; in PP and loteamentos **always** tied to the official precision altimetric system |
| **Es** | *elevação da soleira* | must be fixed whenever the entrance is raised **more than 0.20 m** above the adjacent pavement; **may be negative** |
| **H** | *altura da edificação* | S → highest point **incl. roof and volumes on it**, excluding chimneys and accessory/decorative elements, **PLUS Es** |
| **Hf** | *altura da fachada* | S → top of *cornija/beirado/platibanda*/terrace guard, **PLUS Es** |
| **Alt** | *altitude máxima de edificação* | **absolute cap in the national datum** against which **ALL** constructed elements count. **Stricter than H. NEVER collapse into H.** |
| **h** | *altura entre pisos* | *pé-direito* of lower compartment **+ upper slab thickness** |

**Piso:** only covered planes with regulation *pé-direito* count. The floor at S is **Piso 1**
upward; the first below is **Piso −1**.

### §2.5 — Footprint geometry

**Polígono de implantação** — closed polyline inside which building is possible; **area ≥ Ai**.
Drawn in PU/PP or *alvará de loteamento*, **OR derived from *recuos* and *afastamentos*** — ⭐ **that
derivation is the NATIONALLY SANCTIONED METHOD, not an interpretation.**

**Alinhamento** = public-domain / *prédio* boundary — ⛔ **NOT the kerb line.**
**Recuo (Re)** = *alinhamento* → façade plane. **Afastamento (Af)** = façade → the corresponding
property boundary (**lateral and tardoz distinguished**).

### §2.6 — ⛔ VERSION BOUNDARY

**DR 5/2019 applies to procedures whose start decision postdates 2019-09-27.** Earlier plans are
read against **DR 9/2009**.

> **Derive the applicable dictionary from the plan's PROCEDURAL START DATE and store it as
> `concept_dictionary_version`. Applying 2019 definitions to a 2016 plan is a silent error you must
> not make.**

---

## §3 — National geometric constraints (RGEU — currently in force)

⚠ **RGEU revocation was DEFERRED.** DL 108/2026 art. 8 amended art. 25 of DL 10/2024 so effects
follow entry into force of the diploma establishing technical building regulation — **not yet
published. Verify status before relying on it.**

| Article | Rule |
|---|---|
| **59** | **45° plane** from the opposing building's alignment at ground level; **1.50 m tolerance on the downhill side** of sloping ground. ⭐ **This is a SOLVER CONSTRAINT, not a scalar, and it is NEIGHBOUR-DEPENDENT.** |
| **59 §2** | **Corner rule** — on two streets of different width or level, the façade on the narrower/lower street may rise to the other's permitted height for a **maximum run of 15 m** |
| **60** | **Minimum 10 m between façades** with habitable-room openings |
| **65** | Minimum *pé-direito* **2.40 m residential, 3.00 m commercial** — ⭐ **this is what makes the metre limit and the storey count JOINTLY BINDING** |

⭐ **Art. 59 is the Portuguese member of the inclined-plane family** — the same primitive as NSW's
Building Height Plane, NL's *molenbiotoop*, SA's 45° plane and German *Abstandsflächen*. **Build it
once, in the shared solver.**

---

## §4 — Multi-frontage datum

Where a building fronts two public ways or *logradouros* at very different levels, **two façade
heights may be fixed**: `Hf1` from the main entrance; `Hf2` by arbitrating an **AUXILIARY cota de
soleira `S2`** = level of the floor nearest that façade's pavement.

> ⛔ **Your datum field must hold MORE THAN ONE VALUE.**

---

## §5 — Rural buildability (fully derivable — PREFER THIS PATH)

**DL 82/2021 art. 61:** construction or extension in *solo rústico* outside *aglomerados rurais*, in
forest territory **or less than 50 m from forest territory**, requires **cumulatively**:
- a **50 m fuel-management strip** around the building, **AND**
- a setback from the property boundary (or from an abutting property of the same owner) **never less
  than 50 m**.

```
parcel polygon → negative buffer 50 m → if EMPTY, refuse citing DL 82/2021 art. 61
                                      → if non-empty, continue with that as the OUTER BOUND
```

Strip widths may vary **±50 %** per the *Programa Sub-regional*. Maintenance strips: **50 m** into
forest · **10 m** into agricultural · **100 m** around *aglomerados*/campsites/industrial
parks/logistics platforms. Technical norms re-homologated by **Despacho 675/2026**; review **not
less than annual**.

---

## §6 — Zone identity is a CLOSED ENUM

**Norma Técnica PDM (Aviso 9282/2021) + DR 15/2015.** New **CATEGORIES cannot be added**; only
subcategories, encoded as `DESIGNACAO + ESPECIFICA + ETIQUETA` (e.g. `"EH1 — Espaço habitacional de
moradias"`).

**Solo urbano:** Espaço Central **2** · Habitacional **3** · Urbano de Baixa Densidade **4** ·
Atividades Económicas **5** · uso especial-turístico **6** · Verde **7** · uso especial-infraestrutura
estruturante **151** · uso especial-equipamento **152**

**Solo rústico:** Agrícola **8** · Florestal **9** · Recursos Energéticos e Geológicos **10** ·
Natural e Paisagístico **11** · Atividades Industriais **12** · Aglomerado Rural **13** · Área de
Edificação Dispersa **14** · Cultural **15** · Ocupação Turística **16** · Equipamentos e
Infraestruturas **17**

⚠ **Codes above 152 are municipality-created by disaggregation — HANDLE unknown codes, do not
discard them.**

> ⭐ **`ETIQUETA` IS THE JOIN KEY from polygon to regulamento article. Use it BEFORE any text
> similarity matching.**

---

## §7 — Derived-plan flags (mandatory `ESPECIFICA` in conformant PDMs)

| Code | Meaning | Consequence |
|---|---|---|
| **22** | Área de Intervenção de Plano Municipal (PU, PP) | **parameters not readable** |
| **132** | Plano Territorial Intermunicipal (PUI, PPI) | same |
| **20** | **UOPG** | PDM **MUST** carry *supletivo* parameters pending the plan — usable, flagged **`supletivo`** |
| **138** | Unidade de Execução | |
| **136** | **ARU** | check **D3 increments** under RJRU |
| **135** | **AUGI** | distinct legalisation regime — **treat as its own C1 family** |

⛔ **An *alvará de loteamento* SUPERSEDES the PDM inside its perimeter and has NO national
register.** If evidence of a *loteamento* exists and its parameters are not in hand, **B5 is
`unresolved` → REFUSE.**

---

## §8 — Topology invariant you may assert

Classification/qualification polygons must be **closed, cover the entire plan area, with NO overlaps
and NO gaps**. Any **double classification is a municipal DATA DEFECT**.
⛔ **Report it. Never resolve it silently.**

---

## §9 — Terminology traps — THESE INVERT RESULTS

| Term | Correct reading | The trap |
|---|---|---|
| **`COS`** in a PT regulamento | **`Iu`** — floor area RATIO | ⛔ **Spain's COS is COVERAGE. Do not carry the Spanish reading across.** |
| *índice de construção* | `Iu` | |
| *percentagem de ocupação* · *índice de implantação* · **`CAS`** | **`Io`** | |
| *área bruta* · *área coberta* · *área de pavimento* | *área total de construção* | |
| **`cércea`** | **altura da edificação (`H`)** | ⛔ **NEVER `Hf`. Reading it as `Hf` UNDER-READS the envelope by the roof volume.** |
| *área urbana consolidada* (≥ ⅔ built) | **NOT** the RJUE's *zona urbana consolidada* | different tests, different statutes (alignment continuity, prior-control procedure) |
| *andar* · *rés-do-chão* | *piso* | deprecated but common pre-2009 |

---

## §10 — Espaço-canal asymmetry

⛔ **Only Plano Rodoviário Nacional itineraries carry a non-aedificandi *servidão***, and it exists
**from approval of the *estudo prévio***. **Municipal roads and urban streets have NO *servidão*
before construction.**

> **Do not infer non-aedificandi strips along municipal roads.**

---

## §11 — Data sources, in PRECEDENCE order

### A1 — parcel geometry
1. **Client-supplied survey** → `confidence: resolved`, `provenance: client`
2. **Cadastro Predial** WFS / OGC API (**118 CGPR + 7 SiNErGIC concelhos**; `NIC` identifier)
3. **BUPi Mapa Público** WMS/WFS (daily) or GeoPackage (fortnightly) — **rustic/mixed only**
4. **AT caderneta** *área total do terreno* — **AREA ONLY, no geometry**, `confidence: assumed`

⛔ **URBAN PARCELS OUTSIDE THE 7 SiNErGIC CONCELHOS HAVE NO SOURCE. Require input or refuse.**

### A2 / A5 / A6 — terrain
**DGT national LiDAR** — MDT and MDS at **50 cm and 2 m**, point cloud **10 pts/m²**, via
`cdd.dgterritorio.gov.pt`. **A6 = MDS − MDT.** ~**200 km² cap** per access.

### B2 — classification
**CRUS** (national, continuous update) for coverage; **municipal planta de ordenamento** for the
NATIVE category and subcategory. ⚠ **CRUS is DGT's harmonisation — cite the MUNICIPAL source for the
article, not CRUS.**

### B3 — qualification
Municipal vector **`ETIQUETA`**.

### B4 — condicionantes
Planta de condicionantes (**152-code catalogue**) + **DGPC** WMS/WFS (classified heritage, ZGP, ZEP,
restrictions; **95 % georeferenced**) + **APA/SNIAmb** ArcGIS REST (REN, DPH).
⛔ **ALWAYS query RAN/REN EXCLUSION layers (codes 69, 82). Querying REN alone produces FALSE
REFUSALS.**

### B1 / F2 / F3 — the act
**DRE** for the published act; **SSAIGT/SNIT** *dinâmica* feed for version and in-force date.
⛔ **Consolidated DRE text has NO legal value — cite the PUBLISHED act.** For act-constituted
*servidões*, read `ATO_ESPECIFICO` (`SERIE`, `TIPO_ATO`, `NUM_ATO`, `DATA`, `NUM_DR`) straight from
the PDM database.

### C1–C5, D1 — ⛔ REGULAMENTO TEXT ONLY
**These fields do not exist in the national PDM schema and never will.** Do not look for them in
vector attributes; if a municipal service returns them, treat as **convenience** and **verify
against the regulamento**.

### Discovery
**SNIG RNDG** (GeoNetwork API) and **dados.gov.pt** (udata API) to enumerate services; probe
`{host}/arcgis/rest/services?f=json` per municipality.
**Admin joins / reverse geocoding:** GeoAPI.pt (900 req / 15 min).

### ⚖ LICENCE GATE
**DGT, BUPi, INE and DGPC are commercially usable** (CC BY 4.0 / free with attribution).
⛔ **APA/SNIAmb terms PROHIBIT commercialisation**, require express authorisation, and **cap use at
1:25 000**. If the output is commercial and no APA authorisation is on file, **source REN via the
municipal planta de condicionantes instead** and **record which source was used**.
⚠ **Municipal endpoints: reachable is not licensed. Check per municipality.**

---

## §12 — THE DERIVATION PROCEDURE

1. **Resolve A1.** No geometry and no client input → **refuse (A1 unresolved)**.
2. **Classify** — *solo urbano* or *solo rústico* (CRUS + municipal planta).
3. **If *solo rústico*, forest or within 50 m of forest, outside *aglomerado rural*** → apply
   **DL 82/2021 art. 61**. Negative-buffer 50 m. **Empty → refuse with the article.** Non-empty →
   continue with that as the outer bound.
4. **Resolve B5.** PU/PP or *loteamento* governing with parameters not in hand → **refuse**.
   **UOPG without a plan → use PDM *supletivo* parameters, flag `supletivo`.**
5. **Resolve B2/B3 → `ETIQUETA` → regulamento article.**
6. **Determine `concept_dictionary_version`** from the plan's **procedural start date**.
7. **Extract C1–C5, D1 from the regulamento.** ⭐ **Type-check every token against the DR 5/2019 (or
   9/2009) lexicon — abbreviation, unit, formula. REJECT what does not type-check rather than
   guessing.**
8. ⭐ **C1 is stated nowhere as a field.** Infer it from typology and *alinhamento* language, and
   mark `derivation_method = inferred`, `confidence = assumed`, **ALWAYS**. **If C1 cannot be
   inferred with a stated basis, REFUSE — the wrong family produces well-formed nonsense.**
9. **Build the polígono de implantação** from `Re` and `Af` if not drawn.
10. **Apply the constraint stack** — condicionantes (**VETOES, not trims**), RGEU art. 59 plane,
    art. 60 separation, art. 65 minimum *pé-direito*, **`Alt` as absolute cap**.
11. **Compute volume. Then trim to `Iu`** using the national `Ac` counting rules.
12. **Emit `Ac` disaggregated** in the national categories.

---

## §13 — Output

JSON carrying: `parcel` (geometry source + provenance) · `regulatory_identity` · `volume` (geometry +
parameters, **each with the full provenance block**) · `yield` (`Ac` total and disaggregated) ·
`constraints_applied` (**with codes and articles**) · `assumptions` · `refusals` · `watch_flags`.

### Watch flags — set where any bears on the result
- **RGEU status** — revocation decreed, effects deferred, **no date announced**
- **DL 108/2026 RJUE revision** in force **2026-10-01**
- **PEPU** mandatory since **2026-01-05**, practical availability **unconfirmed**
- **SGIFR technical norms** under **at-least-annual** review (Despacho 675/2026)
- **DGT reworking the PDM and REN data models — the `ETIQUETA` join key MAY MOVE**
- **BUPi free registration ends 2026-09-30**

---

## §14 — Tone

> *"State what you derived, what you assumed, and what you refused. **Do not pad. Do not soften a
> refusal into a hedged number.**"*
