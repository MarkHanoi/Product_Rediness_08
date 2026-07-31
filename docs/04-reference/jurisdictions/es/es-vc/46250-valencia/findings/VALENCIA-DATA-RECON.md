# VALENCIA-DATA-RECON — P4.5 Planning GIS Intelligence

> **This is the P4.5 gate deliverable** for
> [`../RATE-IMPLEMENTATION-PLAN.md`](../RATE-IMPLEMENTATION-PLAN.md). It scores **no RATE points** and
> must not move the RATE — it is a gate whose output decides whether P5 LEGISLATION is an
> ordinance-extraction project or a GIS-linkage project.
>
> **Every fact below is traceable to a request actually made on 2026-07-31.** URLs are recorded inline.
> Nothing is inferred from a document; nothing is simulated. Where a thing was not observed, it says
> *unknown*, not *absent*.
>
> Produced by [`tools/spanish-genome-probe/`](../../../../../../../tools/spanish-genome-probe/).
> The experiment that this recon doubles as:
> [`../../../findings/GENOME-TEST-01-MADRID-TO-VALENCIA.md`](../../../findings/GENOME-TEST-01-MADRID-TO-VALENCIA.md).

---

## 0 — Verdict for the gate

**P5 LEGISLATION for València is an ORDINANCE-EXTRACTION project, not a GIS-linkage project.**

València's GIS is excellent at **routing** (which zone applies where, under which plan instrument,
on which cadastral parcel) and publishes **zero** normative envelope parameters. There is no
NZ1-equivalent. Height, floors, FAR, coverage, depth and setbacks are **all** in the PGOU text.

This is the *opposite* of what Madrid's recon did for Madrid — Madrid's probe inverted the strategy
*toward* GIS. València's inverts it back toward the ordinance. Both were worth running for exactly
that reason.

| Founder's P4.5 question | Answer |
| ----------------------- | ------ |
| Does València expose ArcGIS REST? | **YES** — ArcGIS Server 10.81, no auth on the planning folders |
| Zoning layer? | **YES** — `MapServer/231`, 21 210 polygons |
| Buildable-envelope geometry? | **NO** — none found in the public catalogue |
| Machine-readable planning rules? | **NO** — no numeric parameter is published as an attribute |
| Rule hierarchy / derived plans? | **YES**, but as an **attribute taxonomy**, not a layer — 494 instruments |
| Parcel join spatial or key-based? | **BOTH** — `refcat` is published, unlike Madrid |

---

## 1 — Endpoints

### 1.1 — How the root was found

`npx tsx tools/spanish-genome-probe/discoverRoots.ts valencia.es` — 143 candidate URLs generated from
generic sub-domain prefixes × generic ArcGIS/OGC paths, with **no València-specific input beyond the
bare domain**. One hit:

| Endpoint | Result |
| -------- | ------ |
| `https://geoportal.valencia.es/server/rest/services` | **200, ArcGIS catalogue, 33 folders, `currentVersion` 10.81** |
| `https://geoportal.valencia.es/portal/rest/services` | 200 JSON but not a catalogue |
| `https://www.valencia.es/{arcgis,server,portal,geoportal,rest}/rest/services` | 404 (host resolves, path wrong) |
| `https://www.valencia.es/{geoserver/wfs,geoserver/ows,ogc/wfs,wfs}?…GetCapabilities` | 404 |
| 130 other candidates | DNS/TLS failure — host does not exist |

**No WFS/GeoServer endpoint was found** on the probed hosts. **WMS is available** per-service:
`https://geoportal.valencia.es/server/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/WMSServer?request=GetCapabilities&service=WMS` → **200**.

### 1.2 — Catalogue shape, and what is gated

33 folders, **72 services, 693 layers enumerated**, and **17 access failures**.

**The 17 failures are `ArcGIS error 499 "Token Required"` — auth-gated folders, NOT empty folders.**
Recording them as "no data" would be the failure-vs-empty conflation this repo has been bitten by
repeatedly (L-422/457/467/469). Gated folders:

```
Bomberos · CIA · ConsellAgrari · FDM · Geoprocesos · GobiernoAbierto · GTECatastral ·
InspeccionTributos · Jardineria · MantInfraestructura · Mapa_Base · Patrimonio_Historico ·
PoliciaLocal · ResiduosSolidos · Sanidad · Turismo · Vivienda
```

Two of these matter to planning and are therefore **UNKNOWN, not absent**:

- **`Patrimonio_Historico`** — heritage/protection. The public catalogue's best heritage candidate is a
  tourist walking route, so **València's protection layer is unassessed**, not missing.
- **`GTECatastral`** — a second cadastral service. Public cadastral parcels exist elsewhere (§3.3), so
  this is a duplication question, not a blocker.

Publicly readable planning content lives in exactly two places:

| Folder / service | Role |
| ---------------- | ---- |
| `OPENDATA/UrbanismoEInfraestructuras` (MapServer) | The authoritative open-data planning service, 72 layers |
| `Tools/FichaUrbanismo` (MapServer) | The service behind the public *ficha urbanística* viewer; a subset of the same data |
| `Planeamiento/Cartografia_Base` | **Basemap only** — despite the folder name, it contains no planning layers |

> Note the trap: the folder literally named `Planeamiento` contains **no planning data**. A
> name-only discovery heuristic that trusted folder names would have gone straight to it.

---

## 2 — The zoning layer

**`https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/231`**
— *"PGOU - Calificacions / PGOU - Calificaciones"*, `esriGeometryPolygon`, **EPSG:25830**,
**21 210 features**.

Duplicate of the same dataset: `Tools/FichaUrbanismo/MapServer/14`.

### 2.1 — Fields (all 17, verbatim from `?f=json`)

| Field | Type | Alias | → Ontology |
| ----- | ---- | ----- | ---------- |
| `clase` | String | Clase | land **class** (`SU` = suelo urbano) |
| **`califi`** | String | **Calificación** | **`zoneCode`** ✅ |
| **`tipoca`** | String | Tipo calificación | **grade / `grado` analogue** ✅ |
| `uso` | String | Uso | `permittedUse` |
| `tipouso` | String | Tipo uso | use qualifier |
| **`origen`** | String | Origen | **governing plan instrument** ✅ |
| `categoria` | String | Categoria | human-readable zone family |
| `uso_califi`, `ttggss`, `idoperacion`, `fecha_valor`, `linkid`, `bloqueo`, `usuario`, `operacionbaja` | — | — | housekeeping / workflow |
| `objectid`, `shape` | — | — | ArcGIS internals |

**There is no `officialDesignation` field.** `categoria` is the closest, but it returns a
*comma-separated family list* (`"Asentamiento Rural, Conjunto Histórico Protegido, Edificación
abierta, Ensanche, Unifamiliares"`) shared across unrelated rows — it is a legend grouping, not a
per-zone legal name. Madrid's `AMB_TX_DENOM` (`ZONA 1 GRADO 3º`) has **no València equivalent**;
official designations must come from the PGOU text.

### 2.2 — Zone vocabulary — **109 base codes, 551 code+grade combinations**

`?returnDistinctValues=true` on `califi`:

```
AES AR ARP ARP3 ARU AT ATE ATR BRL CHP CHP1 CHP2 CHT CV DPMT E/EL E/RD E/RV E/SP EAM EAM4 EBM
EC ECM EDA EDAM EL ENHT ENP ENS EP ER ERT ERV ESP2 ET ETE ETM ETR GEC GEL GFS GIS GLT GPS GRV
GSP GSR GTR IAL IND IND2 MAR NHT NP NTH PA PAD PCV PED PH PI PID PJL PLJ PM PPV PQA PQE PQI PQL
PQM PRD PRI PRR PRV PTR PVJ PVP PZV QM QR RA RAM RED REP RERV RV S/SD SAV SED SID SJL SP SPV
SQE SR SR1 SRV TDMR TED TER TERD TOE UFA ZND ZRP ZV
```

**This is the most consequential number in the recon.** Founder discovery **D6** states *"Zones are
finite. Madrid has roughly Zones 1, 3, 4, 5, 7, 8, 9. That's not hundreds. It's a vocabulary. Once
extracted, it's done."*

València has **109 base codes and 551 code+grade combinations** — roughly **15× Madrid's ~7**. D6 does
not generalise. See §5.

Corpus check: founder batch 11 guessed `ENS`, `EDA`, `EIX`; §27 asserted `ENS-2` ↔ `ResidentialHistoric`.
**`ENS` ✅ and `EDA` ✅ are real; `EIX` ✗ is not present.** `ENS-2` exists verbatim (`califi=ENS`,
`tipoca=2`), alongside `ENS-1`, `ENS-2A`, `ENS-2ABC`, `ENS-2BL`, `ENS-B1`, `ENS-PTRX` and 20 more.
Note that **`ENS` = *Ensanche*, the 19th-century grid extension** — the §27 mapping to
`ResidentialHistoric` is plausible for `ENS` but `CHP` (*Conjunto Histórico Protegido*) is the closer
match, so the corpus's illustrative table should not be treated as verified.

**Data-quality caveat:** `tipoca` contains junk values — `#`, `##`, `*`, `**`, `_`, `-`, `----`,
whitespace. Any grade parser must treat these as *unknown*, never as a grade.

---

## 3 — The other roles

### 3.1 — Derived plans: an ATTRIBUTE taxonomy, not a layer

**This is the deepest structural difference from Madrid.** Madrid publishes derived plans as a
polygon layer (`PG_ORDENACION/3`, APR/APE/API). València publishes them as the **`origen` field** on
the zoning layer, mirrored by a thin geometry layer
`OPENDATA/UrbanismoEInfraestructuras/MapServer/275` *("PGOU - Origen")* whose only attribute is
`origen`.

`?returnDistinctValues=true` on `origen` → **494 distinct instruments**, with a clean prefix taxonomy:

| Prefix | Instrument | Examples | Count seen |
| ------ | ---------- | -------- | ---------: |
| `PGOU…` | the base General Plan (+ its own sheet codes) | `PGOU`, `PGOU A5`, `PGOU PS3/1`, `PGOU1924` | ~12 |
| **`PE`** | Plan Especial | `PE2020`, `PE1873` | ~35 |
| **`PEPRI`** | Plan Especial de Protección y Reforma Interior | **`PEPRI2076`** | 1 |
| **`PRI`** | Plan de Reforma Interior | `PRI1108` … `PRI2089` | 12 |
| `RI` / `CRI` | Reforma Interior (+ variant) | `RI1635`, `CRI1481` | ~90 |
| `PP` | Plan Parcial | `PP1196`, `PP2008` | ~24 |
| `ED` | Estudio de Detalle | `ED1375`, `ED2122` | ~170 |
| `MP` | Modificación Puntual | `MP2017`, `MP2116` | ~140 |
| `CE` / `CU` | Corrección de Error / Consulta Urbanística | `CE1856`, `CU1350/12` | ~28 |
| `UE` | Unidad de Ejecución | `UE1707` | 1 |
| `PGOI` | — | `PGOI` | 1 |

> **The pre-registered probe target hit.** València's RATE plan §V-3 named **`PRI` and `PEPRI`** as *"a
> concrete routing target for the refusal path, worth probing for directly"*. Both are present and
> machine-discoverable. This is a direct confirmation of a corpus prediction.

**Consequence for the rule engine:** a parcel's governing instrument is available *without a second
query* — it is a column on the zoning row. That is architecturally **better** than Madrid (no second
spatial join). But it also means **~482 of the 494 instruments are individual plan documents that the
base PGOU text does not contain.** Any parcel whose `origen ≠ PGOU…` is governed by a document PRYZM
does not have. That is the refusal path, and it is large.

### 3.2 — Alignment: present

`OPENDATA/UrbanismoEInfraestructuras/MapServer/212` — *"PGOU - Alineacions / PGOU - Alineaciones"*,
`esriGeometryPolygon` (note: **polygon, not polyline** — unlike Madrid's `PG_GESTION/Alineaciones`).
Mirrored at `Tools/FichaUrbanismo/MapServer/7`. Carries no numeric setback or depth attribute.

### 3.3 — Parcel join: **key-based join available, unlike Madrid**

`OPENDATA/UrbanismoEInfraestructuras/MapServer/216` — *"Parcel·les cadastrals urbana"* (and `/213`
rústica). Fields include:

```
refpar   9330901          — parcel part of the cadastral reference
refpla   YJ2793A          — sheet part
refcat   9330901YJ2793A   — FULL CATASTRO REFERENCE
codvia, npol              — street code + number
construccion, antiguedad  — construction year
sedecatastro              — deep link to sedecatastro.gob.es for that refcat
fichacastellano / fichavalenciano — deep links to the municipal ficha urbanística
```

This **resolves the founder's "most important question"** for València, and it differs from Madrid:

| | Madrid | València |
| - | ------ | -------- |
| `refcat` published on the municipal parcel layer? | **No** (batch 3 PART B: *"Madrid does NOT use Catastro refcat as join"*) | **Yes** |
| Parcel → zoning join | spatial only | **spatial only** (the zoning layer carries no parcel key) |
| refcat → parcel geometry | needs Catastro | **direct, from the municipal service** |

So the flow is `refcat → municipal parcel polygon → spatial → zoning row`. The C-8 contradiction in
the Madrid corpus (Catastro connector vs pure spatial) is resolved *for València*: the municipal
service supplies the user-facing parcel boundary **and** the Catastro key, so **no Catastro licence is
needed for València**.

### 3.4 — Building conditions / envelope: **NOT FOUND**

No layer in the public catalogue carries `altura`, `plantas`, `edificabilidad`, `ocupación`, `fondo`
or `retranqueo` as an attribute. The best-scoring candidate for the role is *"Ámbitos de Fomento de la
Edificación"* — a **building-promotion incentive area**, not an envelope.

**There is no València equivalent of Madrid's NZ1 `PG_CONDICIONES_EDIFICACION` footprint layer.**

Stated precisely, per the honesty rule: this is *not found in the 16 publicly readable folders*.
`Vivienda` and `Patrimonio_Historico` are token-gated and unassessed.

### 3.5 — Uses

Encoded as the `uso` / `tipouso` / `uso_califi` **fields on the zoning layer**, not as a separate
layer (Madrid has `PG_USOS_Y_ACTIVIDADES`). Same attribute-not-layer pattern as derived plans.

### 3.6 — Heritage: **UNKNOWN (gated)**

The public catalogue exposes `Catálogo Pormenorizado`, `Catálogo Urbano`, `Catálogo Rural` and
BIC/BRL layers inside `OPENDATA/UrbanismoEInfraestructuras`, but the dedicated
**`Patrimonio_Historico` folder returns ArcGIS 499**. Assess before P6.

---

## 4 — The layer inventory that matters

| # | Layer | URL suffix (under `.../server/rest/services/`) | Geometry | Role |
| - | ----- | ---------------------------------------------- | -------- | ---- |
| 231 | PGOU - Calificaciones | `OPENDATA/UrbanismoEInfraestructuras/MapServer/231` | Polygon | **zone routing** |
| 275 | PGOU - Origen | `OPENDATA/UrbanismoEInfraestructuras/MapServer/275` | Polygon | **derived-plan geometry** |
| 212 | PGOU - Alineaciones | `OPENDATA/UrbanismoEInfraestructuras/MapServer/212` | Polygon | alignment |
| 216 | Parcelas catastrales urbana | `OPENDATA/UrbanismoEInfraestructuras/MapServer/216` | Polygon | **parcel (+`refcat`)** |
| 213 | Parcelas catastrales rústica | `OPENDATA/UrbanismoEInfraestructuras/MapServer/213` | Polygon | parcel |
| 319–322 | Catálogo Pormenorizado / Urbano / Rural | `OPENDATA/UrbanismoEInfraestructuras/MapServer/{319,320,321,322}` | mixed | heritage (partial) |
| 277–284 | BIC / BRL bien + entorno | `OPENDATA/UrbanismoEInfraestructuras/MapServer/{277,278,281,282,283,284}` | mixed | heritage (statutory) |
| 296–299, 316–318 | Programas de Actuación, Registros | `OPENDATA/UrbanismoEInfraestructuras/MapServer/…` | Polygon | management |
| 14 | PGOU Calificaciones (viewer copy) | `Tools/FichaUrbanismo/MapServer/14` | Polygon | duplicate of 231 |

CRS throughout: **EPSG:25830** (ETRS89 / UTM 30N). `outSR=4326` is supported.
Auth: **none** on the folders above. `f=json` and `/query` both work; `returnDistinctValues` supported.

---

## 5 — What this changes for València's plan

1. **P5 LEGISLATION is an ordinance-extraction project.** Every normative number is in the PGOU text.
   The GIS contributes routing and provenance, not parameters.
2. **The zone vocabulary is 109 codes, not ~7.** Extraction cannot be "read the eight chapters of
   Título VIII". Budget accordingly — this is the single biggest cost surprise in the recon.
3. **Route the refusal path on `origen` from day one.** ~482 of 494 instruments are documents PRYZM
   will not hold. `origen ≠ PGOU*` must return *unknown-with-a-citation-to-the-instrument*, never a
   guessed value (L-616 class).
4. **No Catastro licence needed.** `refcat` + parcel geometry come from the municipal service.
5. **Do not promise a GIS envelope.** There is no NZ1 equivalent; the C63 ENVELOPE axis for València
   depends entirely on P5.
6. **Re-probe `Patrimonio_Historico` and `Vivienda` with credentials before P6.** They are gated, not
   empty, and heritage constrains envelopes.

*Recon executed 2026-07-31 against the live service. Raw crawl retained at
`tools/spanish-genome-probe/__tests__/fixtures/valencia-crawl-slim.json` (693 layers) and
`tools/spanish-genome-probe/results/valencia-blind.json`.*
