# ES — the founder's source archaeology (three transmissions, 2026-09-03)

> **PROVENANCE.** Founder-forwarded research, three successive transmissions received
> **2026-09-03**, each going a level deeper than the last. Captured per the standing rule
> *"founder research → repo docs same-turn"*. Wording preserved where it carries the argument.
>
> **What this document is.** A **correction to PRYZM's own Spain assessment**, which the founder
> judges **too pessimistic** — the same verdict, and the same shape, as the France correction in
> [`../fr/FR-FOUNDER-REACHABILITY-BOUNDARY.md`](../fr/FR-FOUNDER-REACHABILITY-BOUNDARY.md).
>
> ⛔ **Nothing here is a measurement of PRYZM's code, and nothing here is verified.** Every claim is
> about the SPANISH DATA ESTATE and every endpoint is the founder's research trail (the URLs carry
> `utm_source=chatgpt.com`). **NEVER INVENT AN ENDPOINT** — re-verify each against official
> documentation before wiring. The measured state of the repo is the audit's job, not this file's.

---

## §0 — The sentence that must be retired

PRYZM's current Spain one-liner reads:

> *"Spain hands you the spatial key for free and withholds the parameter table. The work is not
> finding data — it is transcribing per-zone numbers from planning documents and having a human
> sign each one."*

⛔ **The founder's verdict: too pessimistic.** The replacement:

> *"Spain provides most of the spatial key and, in several regions and municipalities, **substantial
> parts of the parameter table in machine-readable planning systems**. The remaining challenge is
> harmonizing fragmented regional and municipal planning models, recovering legacy Urbanismo en
> Red / FIP / SIPU datasets, resolving planning documents and amendments, and translating the
> remaining normative rules into a parcel-level envelope with provenance and human validation."*

And the reframing of the gap itself:

> **The missing layer is RULE RESOLUTION, not data acquisition.**

---

## §1 — The 8-layer stack (not "Catastro + PGOU")

| Layer | What is obtainable | Machine-readable | National coverage |
|---|---|:--:|---|
| 1. Parcel | cadastral geometry / ID | ✅ | ~95 % DGC + foral systems |
| 2. Existing building | footprints, use, GFA, date, building parts/floors | ✅ | very high |
| 3. Terrain | MDT + LiDAR + orthophoto | ✅ | excellent |
| 4. Planning geography | classification / zoning / plans | ✅/🟡 | high but fragmented |
| 5. **Planning parameters** | FAR, height, floors, occupancy, setbacks, depth | 🟡 | **highly fragmented** |
| 6. Special restrictions | coast, flood, Natura, protected land | ✅/🟢 | high |
| 7. Infrastructure servitudes | roads, rail, airports, utilities, easements | 🟢/🟡 | high but fragmented |
| 8. **Legal interpretation** | exceptions, text rules, amendments, parcel conditions | 🔴/🟡 | **the real bottleneck** |

---

## §2 — The per-parameter revision

| Parameter | Prior verdict | Founder's revision |
|---|---|---|
| Cadastral geometry · buildings · terrain · zone geometry · zoning codes · plan identity/version | good | **unchanged — excellent** |
| **FAR / edificabilidad** | missing | **🟡/✅ much better than the inventory suggests** |
| **Maximum height** | missing | **🟡/✅ much better than the inventory suggests** |
| **Number of floors** | missing | **🟡/✅ much better than the inventory suggests** |
| Occupancy · setbacks · buildable depth · minimum parcel | missing | 🟡 |
| Building alignment | missing | 🟡/🟢 |
| Parcel-specific rules | missing | 🟡/🔴 |
| **Complete 3D envelope, nationally** | — | **🔴** |
| **Legally certified buildability** | — | **❌ — never** |

---

## §3 — The four discoveries that drive the revision

### §3.1 — Canarias is NOT a "WMS only" case — it may be Spain's best planning implementation

PRYZM's audit recorded Canarias as *"GetFeatureInfo only. DescribeLayer never run."* True of that one
WMS probe; **false as a description of the ecosystem.**

GRAFCAN runs a **Base de Datos Geográfica de Planeamiento (GeoBDP)** which explicitly
**interprets** the legal planning documents, **normalizes** them, stores them in a geographic +
alphanumeric database, produces standardized planning layers, and offers **downloads** and a
**point-based urban-planning query**. The open-data portal carries **SIPU and FIP ZIPs**, not
merely WMS images (Las Palmas, San Bartolomé, Teguise, Firgas, Arico, San Miguel de Abona…).

⭐ **And SIPU is not just geometry.** The official GRAFCAN SIPU manual defines: `m2s`, `m2e`,
surface, net surface, gross surface, density, **índice de edificabilidad**, **housing density**,
total lucrative development rights, average development rights, real/patrimonializable development
rights, **zoning ordinances**, and **coefficients**.

### §3.2 — Urbanismo en Red is a hidden NATIONAL dataset

The national **Urbanismo en Red** programme digitized planning, systematized it, created municipal
planning registries, published them, and provided **interoperable web services** — including a
**Registro de Planeamiento Municipal**. Named implementations reach well beyond Canarias: Asturias,
Albacete, Santiago de Compostela, Lorca, Agüimes, Sant Joan d'Alacant, Yecla, Ceuta, Melilla,
Cuenca, Extremadura. There is still an official dataset listing participating municipalities.

**This changes the research question** from *"Does Spain have machine-readable planning?"* to:

> **"Which Spanish municipalities still expose their Urbanismo en Red / FIP / SIPU database or a
> derivative service?"**

Legacy architecture used services such as `urbanismoenredWS` with functions for planning queries,
parcel/coordinate search, planning registry, surfaces and export. **A municipality whose current
website looks API-less may still have the old database behind its viewer.**

### §3.3 — FIP is the gold mine — priority 🔥 VERY HIGH

The **FIP (Fichero de Intercambio de Planeamiento)** was built specifically to exchange systematic
planning information: *legal planning document → normalized semantic model → geographic objects →
machine-readable exchange format → web services*. **That is very nearly what PRYZM is building.**

> The question is no longer *"Does Spain have FIP?"* — it does. It is:
> **"Which current municipalities still have usable FIP, and which envelope parameters are actually
> populated?"** That is an **empirical** question, answerable by downloading samples.

### §3.4 — A new source CLASS: authoritative-**document-derived**

GRAFCAN's database is not a copy of a GIS layer; it is *documents → interpretation → normalization
→ geographic database → standardized service*. So a source can be **"authoritative-document-derived"**
rather than **"authoritative-machine-readable"** — and PRYZM's existing six-tier confidence model
already accommodates exactly that. ⭐ **The founder's verdict: "your confidence model is therefore
exactly right."**

---

## §4 — The confidence ladder, as the founder maps it to Spain

| Tier | Example | Confidence |
|---|---|---|
| **A** authoritative machine-readable | parcel → official zone → official numeric attribute | `authoritative-machine-readable` |
| **B** authoritative structured planning | official FIP/SIPU/GML → normalized parameter | same, or `authoritative-document-derived` if the transformation changes semantics |
| **C** official planning document | PGOU PDF art. 7.3 *"altura máxima = 12 m"* | `authoritative-document-derived` |
| **D** deterministic geometric derivation | FAR 1.5 × 800 m² ⇒ 1,200 m² | `deterministic-inference` |
| **E** AI interpretation | *"the wording appears to imply attic area is excluded"* | `ai-interpretation` |
| **F** human validation | final authoritative review | `human-validated` |

> *"This is much more powerful than pretending every field must come from an API."*

---

## §5 — `Vmax` is an INTERSECTION, not a multiplication

⛔ **`Vmax ≠ parcel_area × FAR`.** The founder's canonical model:

```
Vmax = intersection( cadastral geometry, planning zone, applicable plan, plan version,
                     zoning ordinance, building alignment, front/rear/side setbacks,
                     buildable depth, occupancy, FAR, max floors, max height,
                     terrain/rasante, street width, slope, heritage, coastal,
                     airport, flood/environment, special planning,
                     development-unit constraints, parcel-specific conditions )
```

⭐ **And parameters can be DERIVED rather than sourced** — you do not need every parameter
published, only enough constraints to **reconstruct** the legal envelope:

```
buildable footprint = parcel − setbacks − protected areas − building-line restrictions
max floor area      = min( parcel_area × FAR,
                           footprint × allowed_floors,
                           explicitly_defined_buildable_area )
max volume          = Σ floor_envelope(z)     -- floors, height, terrain, stepbacks,
                                                 setbacks, depth, roof restrictions
```

---

## §6 — `dimensioningIndication` (INSPIRE) — still the highest-value European query

The INSPIRE Land Use model supports **`dimensioningIndication`** for urban-development dimensions,
**and the value can be a real number**. The Spanish CODIIGE transformation guide describes
`SupplementaryRegulation` as additional planning information carrying `dimensioningIndication`,
regulation nature, specific regulation, temporal validity and inheritance from other plans.

```
ZoningElement → residential, zone R3, validFrom, validTo
      └── SupplementaryRegulation → height · setback · occupancy · other dimension
```

⚠ **But: the existence of the schema does not mean Spanish publishers populated it.** *"That
distinction is critical."* This remains one of the highest-value queries in the whole European
project — and it must be answered by **measuring populated fields**, not by reading the spec.

---

## §7 — SIU: valuable, and NOT the parcel source

The national **Sistema de Información Urbana** is machine-readable (WMS + WFS + ArcGIS) and the 2025
edition carries development sectors, planned residential/industrial/tertiary buildability, planned
housing, development status, executed/pending buildability — with fields such as `Cedifres`
(planned residential buildability) and `Cedrepnd` (pending).

⛔ **But SIU is sector/development-area intelligence, not a parcel entitlement engine.**
*"Sector A: 100,000 m² residential, 800 dwellings"* does not yield *"Parcel 123: max footprint
430 m², max height 12 m, rear setback 5 m."* Use it as an **additional layer and a validator**.

---

## §8 — Catastro is deeper than the parcel polygon

- **INSPIRE CP / BU / AD** — WFS, WMS, municipality ATOM downloads, GML, bulk cartography.
- ⭐ **A public, UNAUTHENTICATED XML web service for non-protected cadastral data**, queryable by
  cadastral reference, location, polygon/parcel, street→municipality→address, coordinate
  conversion, and nearby references. **Free access, no API key.**

```
coordinate → Catastro coordinate service → RC → non-protected API → cadastral attributes
```

- **BU carries more than a footprint**: building geometry, **building parts**, construction date,
  current use, number of building units, number of dwellings, **floors above ground at BuildingPart
  level**, gross/official floor area, parcel linkage, documentation links.

⛔ **The legal line holds: Catastro says what EXISTS, never what is PERMITTED.** Existing GFA is
context, not entitlement.

---

## §9 — The regional inventory (founder's ranking)

### 🔥 Tier 1 — investigate deeply

| Region | Why |
|---|---|
| **Canarias** | GeoBDP + SIPU + FIP + open-data downloads + point planning query |
| **Balears (MUIB)** | compiles/harmonizes/digitizes planning for **all municipalities**; a **large database of planning parameters with a single dictionary of urban concepts** + urban information sheets; public ArcGIS service. ⚠ MUIB itself warns it is **informational**, approved documents remain authoritative, some recent planning is not incorporated (Ibiza incomplete; Palma and Andratx have unincorporated recent planning), municipal vs island planning can conflict — *an excellent argument for the provenance architecture* |
| **Madrid** | a planning service GRAPH, not one layer: PGOUM modifications (ESRI REST + WMS + WFS), **línea límite de la edificación**, protected buildings, public-information cases, **Transferencia de Aprovechamiento Urbanístico**, and **VEDA — Visor de Edificabilidad Disponible en Ámbitos** (2026, relates planning parcels ↔ cadastral parcels ↔ uses ↔ **available/remnant buildability**). Metadata describes a **"Condiciones de la Edificación"** layer with **building depth, weighted buildability coefficient, and parcel-specific conditions** |
| **Catalunya** | **MUC** (general/derivative/current planning; GML, SHP, DGN, WMS, WFS) + **RPUC** register. Law 11/2025 requires municipalities to enable telematic consultation in interoperable formats. ⚠ MUC gives the spatial framework, **not** a universal `zone → FAR/height/occupancy/setback` table |
| **Euskadi** | **UDALPLAN** is a regional planning database. **Bizkaia** publishes WFS/WMS/JSON/XML/CSV/TSV/XLSX/GPKG/SHP/FGDB/ATOM including *calificación pormenorizada*. ⭐ **Gipuzkoa exposes an actual `API del registro del planeamiento urbanístico`** |
| **Murcia** | public **GeoServer WFS** for *Planeamiento General* + an INSPIRE PLU WFS; sectors carry classification, uses, surfaces, **aprovechamientos**, general systems, protected areas — each with a **data sheet linked to planning documents and approval decisions** |
| **Navarra** | IDENA unified WFS + municipal planning services |
| **Andalucía** 🟠 | **URGENT**: Feb 2026 *Normas Directoras de la documentación electrónica de los instrumentos de ordenación urbanística* provides standardized files for the **data schema** of planning instruments + spatial metadata. **A standardized electronic planning-data model.** The public catalogue still exposes only the older XLSX. ⛔ **Do not mark Andalucía red — investigate the 2026 schema urgently.** *"Exactly the kind of recent change your earlier audit could have missed."* |

### 🟡 Tier 2 — has hidden depth, do not close on a first pass
**Aragón** (SIUa on GeoServer: WMS/WFS/SHP + planning *expedientes* in XML, development plans in
CSV/XML) · **Cantabria** (SIUCAN ArcGIS: planning figure, sectors, general/local systems,
**Condiciones Complementarias** — likely invisible in the plain zoning layer, modifications,
classification) · **Asturias** (a formal **Registro de Planeamiento y Gestión Urbanística** +
SITPA-IDEAS WFS/WMS/WMTS/**CSW** — the register/document link is likelier to be the valuable part
than the WMS) · **La Rioja** (regional AND **per-municipality** WMS/WFS via IDErioja, plus the
regional SIU) · **Galicia** (POL has a **REST API** + WMS, updated 2026-07; the generic municipal
dataset is CSV status only — search SITGA/IDEG deeper) · **Castilla y León** (soil classification,
categories, sectors, monthly-updated planning status — spatial resolution good, **rule resolution
weaker**) · **Castilla-La Mancha** (SIU on ArcGIS incl. WFS — classification/development/status more
than parcel envelope) · **Extremadura** (urbanism WMS with expedientes, action units, soil
categories/qualification/classes; **WMS far more visible than a clean regional WFS** — probe
GetFeatureInfo, ArcGIS, SITEX CSW, municipal GIS, LINCE before declaring absence) · **Valencia** ·
**Baleares** (see Tier 1 MUIB).

---

## §10 — The methodological finding: stop treating "WFS available" as the end of the search

⭐ **This is the transferable lesson, and it generalises past Spain.**

> *"We should not treat 'WFS available' as the end of the investigation. There are ArcGIS REST,
> GeoServer, WMS GetFeatureInfo, CSW metadata, FIP/SIPU, OpenDataSoft APIs, XML/JSON municipal
> databases, planning registers and document repositories sitting behind the visible portals."*

⛔ **Do NOT mark a municipality "no machine-readable planning" until all fourteen are checked:**
current ArcGIS REST · current WFS · OGC API · INSPIRE LU · regional planning database · municipal
planning database · **Urbanismo en Red legacy endpoints** · **FIP** · **SIPU** · downloadable
GML/SHP/FGDB · planning registry · document repository · cadastral-to-planning lookup · Geoportal
API · **hidden JSON endpoints used by the current viewer**.

> *"Your previous 'measured absent' methodology was too narrow if it only examined currently
> advertised WFS layers."*

**The four hidden source families, ranked by what they unlock:**
1. **ArcGIS REST** — *"probably the biggest hidden source family."* Many portals describe a service
   as merely a "map" while exposing `/rest/services/.../MapServer` or `/FeatureServer`, revealing
   layers, fields, **domains**, relationships, attachments, query capabilities, and direct `/query`.
   **Test ArcGIS REST discovery before concluding WMS-only.**
2. **GeoServer** — probe `/wfs` `GetCapabilities` → `DescribeFeatureType` → `GetFeature`. Murcia and
   Aragón both run GeoServer, so **one adapter can serve multiple communities.**
3. **WMS `GetFeatureInfo`** — not dead. It can bridge `map pixel → planning feature → ID → document`
   even without geometry/attributes.
4. **CSW** — `GetCapabilities` / `GetRecords` / `GetRecordById` per regional IDE, to discover
   services Google never indexed.
Plus **OpenDataSoft** installations — recognise `/api/v2/catalog/datasets/` as a planning-source
pattern (e.g. Castellón: JSON, GeoJSON, SHP, CSV, ArcGIS REST).

⚠ **Semantic searches must use the real vocabulary**, not just `altura`: *altura máxima · altura
reguladora · número de plantas · edificabilidad · índice/coeficiente de edificabilidad · ocupación
máxima · fondo edificable · profundidad edificable · retranqueo · separación a linderos · alineación
· línea de edificación · aprovechamiento (objetivo/medio) · superficie edificable · m2e · m2t · m2s*
— **and search inside machine-readable files and service schemas, not only Google-indexed pages.**

---

## §11 — `datos.gob.es` is itself a discovery layer

The national catalogue has an **API and a SPARQL endpoint** returning JSON/CSV/XML/RDF over the
whole catalogue graph. So PRYZM should not hard-code a curated source list; it should **discover**:

```
datos.gob.es SPARQL → publisher + geography + {urbanismo, planeamiento, edificabilidad,
                       calificación, altura, ocupación, parcela} → candidate services
```

**A machine-readable catalogue of machine-readable sources.** The planning tag currently shows
**~130 datasets** across CSV/JSON/XML/XLSX/TSV/ZIP/WMS/SHP/API/ODS/RDF — but heavily skewed to
Bizkaia, Madrid and specific municipalities. **That skew is the structural problem: Spain has many
islands of machine-readable planning, not one national planning database.**

---

## §12 — What NOT to spend time on

For the envelope engine, do not take a dependency on: ❌ property owner · ❌ cadastral tax value ·
❌ cadastral valuation model · ❌ existing building GFA **as the legal maximum** (context, not
entitlement) · ❌ SIU alone (too coarse for the parcel).

---

## §13 — The architecture the founder asks for

Add an explicit **`Source Discovery Engine`** rather than hard-coding sources:

```
Country = ES → national catalogue → regional IDE → municipal → CSW → ArcGIS
             → GeoServer → OGC → FIP/SIPU → document registry → SOURCE GRAPH
```

Every discovered source is classified as data:

```json
{ "source_type": "planning_rule", "protocol": "WFS", "machine_readable": true,
  "spatial": true, "legal_authority": "authoritative", "temporal": true,
  "parcel_join": "spatial", "parameters": ["height","floors","occupancy"],
  "confidence": "authoritative-machine-readable" }

{ "source_type": "planning_regulation", "protocol": "PDF", "machine_readable": false,
  "document_extractable": true, "legal_authority": "authoritative",
  "confidence": "authoritative-document-derived" }
```

And the pipeline runs `parcel → plan resolution → RULE RESOLUTION → constraint graph → envelope
engine → 3D volume`, where rule resolution fans out over **numeric | geometry | formula**.

---

## §14 — THE NEXT AUDIT (this is the instruction, not the prose)

> *"There is one thing I would do **before any further broad web search**: download and reverse-engineer
> actual **FIP + SIPU + MUIB + GeoBDP** samples."*

Because that will empirically settle whether Spain already contains **80–90 % of the numerical
envelope data in structured form**, which the founder now thinks *"quite possible in the best
regions"*.

**The next audit must be FIELD-LEVEL, not source-level:**

```
FIP/SIPU/MUIB/GeoBDP field → PRYZM canonical field → populated? → coverage
                           → current? → legal authority → parcel join → missing parameters
```

⭐ **Cross-map `STR-ENVELOPE-PARAMETER-REFERENCE.md` against the SIPU schema FIELD BY FIELD before
building any new parameter extractor.** The candidate mapping the founder proposes:

```
edificabilidad   -> FAR / buildable_floor_area      ocupación      -> max_site_coverage
altura           -> max_height                      parcela mínima -> min_parcel_area
número plantas   -> max_storeys                     densidad       -> dwelling_density
aprovechamiento  -> development_right               ordenanza      -> rule_set_id
```

> *"If this mapping works, **we don't need to invent a new semantic representation for these
> regions**."*

---

## §15 — The revised verdict

| Question | Answer |
|---|---|
| Can PRYZM get max buildable volume for a Spanish parcel? | **For a large and growing proportion of Spain: yes, automatically or semi-automatically** |
| From one API? | **No** |
| Machine-readably? | **More of it than the current audit suggests — definitely** |
| 100 % of parcels with 100 % automatic legal certainty? | **No** |

The residual hard cases: parcel-specific exceptions · overlapping plans · amendments ·
outdated/legacy planning · textual rules · special protections · complex volumetric interpretation ·
final legal validation.

⛔ **Do not close Spain as "missing numeric planning data." Reopen it as:**

> *"Structured planning data exists in multiple generations and standards; the remaining engineering
> problem is discovery, extraction, harmonization, temporal resolution, parcel joining and 3D rule
> execution."*

And the strategic conclusion: **Spain may be a much better pilot country than assumed** — national
cadastre + national terrain + regional planning infrastructures + municipal planning + INSPIRE +
legacy Urbanismo en Red + FIP/SIPU + planning documents + public registries. *"The challenge is not
data availability in the conventional sense. It is **federating heterogeneous planning systems into
one canonical constraint graph** — exactly the problem PRYZM should solve."*
