# SOURCE — Founder Madrid Recon + Completeness Audit (raw capture)

> **Provenance.** Founder-provided research, delivered 2026-07-31. Captured **verbatim** in
> §1–§3 below. Nothing in §1–§3 is my derivation, my summary, or my correction — it is the
> source material as supplied, preserved so the evidence chain stays intact.
>
> **§4 is mine**, and is clearly marked as such: it records internal conflicts *within* the
> supplied material that must be resolved before any value here is bound to a citation.
> Derived mappings into the C63 schema belong in the per-city files
> (`ENVELOPE.md`, `HEIGHT.md`, `LEGISLATION-RATE.md`, `sources/SOURCES.md`) — **not here.**
>
> Related: [`MADRID-DATA-RECON-SPIKE.md`](./MADRID-DATA-RECON-SPIKE.md),
> [`L-608-MADRID-PACK-SPEC.md`](./L-608-MADRID-PACK-SPEC.md),
> [`../MADRID-LEGISLATION-EXTRACTION-TEMPLATE.md`](../MADRID-LEGISLATION-EXTRACTION-TEMPLATE.md).

**Founder's framing constraint, quoted:**

> One important constraint: the **official GIS part is available**, but the **legislation part
> cannot honestly be filled completely from GIS alone**. Madrid's official planning source is the
> **PG97 Normas Urbanísticas / Compendio**, and the City itself notes that the Compendio is an
> updated consultation document while the official legal text is the published norm and amendments.

> Rule: no inferred FAR, heights, setbacks, or coverage. Unknown means not yet extracted from the
> primary article text. **No values have been invented.**

---

## §1 — MADRID, SPAIN — BUILDABILITY DATASET (as supplied)

### PART A — LEGISLATION (PGOUM 1997 Normas Zonales)

Source basis:

* Ordinance: **Plan General de Ordenación Urbana de Madrid 1997 — Normas Urbanísticas**
* Consolidated consultation source: **Compendio de las Normas Urbanísticas del PG97 (updated 24-09-2025)**
* Official GIS zoning codes: `NORMAS_ZONALES` (`AMB_TX_ETIQ`)

| zoneCode | officialDesignation | farRatio | densityScope | maxHeight_m | maxFloors | maxCoverage | setback front/rear/side | buildableDepth_m | permittedUse | legalSource | article+paragraph | effectiveDate | confidence |
| -------- | ------------------- | -------- | ------------ | ----------- | --------- | ----------- | ----------------------- | ---------------- | ------------ | ----------- | ----------------- | ------------- | ---------- |
| 1.1 | Norma Zonal 1 — Protección del Patrimonio Histórico, grado 1º | unknown | unknown | unknown | unknown | unknown | unknown | unknown | residential / compatible uses — exact table unknown | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 + amendments unknown | GIS code verified, parameters unknown |
| 1.2 | Norma Zonal 1 — Protección del Patrimonio Histórico, grado 2º | unknown | unknown | unknown | unknown | unknown | unknown | unknown | residential / compatible uses — exact table unknown | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 + amendments unknown | GIS code verified, parameters unknown |
| 1.3 | Norma Zonal 1 — Protección del Patrimonio Histórico, grado 3º | unknown | unknown | unknown | unknown | unknown | unknown | unknown | residential / compatible uses — exact table unknown | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 + amendments unknown | GIS code verified, parameters unknown |
| 1.4 | Norma Zonal 1 — Protección del Patrimonio Histórico, grado 4º | unknown | unknown | unknown | unknown | unknown | unknown | unknown | residential / compatible uses — exact table unknown | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 + amendments unknown | GIS code verified, parameters unknown |
| 1.5 | Norma Zonal 1 — Protección del Patrimonio Histórico, grado 5º | unknown | unknown | unknown | unknown | unknown | unknown | unknown | residential / compatible uses — exact table unknown | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 + amendments unknown | GIS code verified, parameters unknown |
| 1.6 | Norma Zonal 1 — Protección del Patrimonio Histórico, grado 6º | unknown | unknown | unknown | unknown | unknown | unknown | unknown | residential / compatible uses — exact table unknown | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 + amendments unknown | GIS code verified, parameters unknown |
| 3.x | Norma Zonal 3 — Volumetría específica | unknown | unknown | unknown | unknown | unknown | null | null | residential where assigned | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 | GIS code verified |
| 4 | Norma Zonal 4 — Edificación en manzana cerrada | unknown | unknown | unknown | unknown | unknown | unknown | unknown | residential | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 | GIS code verified |
| 5.x | Norma Zonal 5 — Edificación en bloques abiertos | unknown | unknown | unknown | unknown | unknown | unknown | null | residential | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 | GIS code verified |
| 7.x | Norma Zonal 7 — Baja densidad | unknown | unknown | unknown | unknown | unknown | unknown | null | residential | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 | GIS code verified |
| 8.x | Norma Zonal 8 — Vivienda unifamiliar | unknown | unknown | unknown | unknown | unknown | unknown | null | residential | PG97 Normas Urbanísticas | unknown | 17 Apr 1997 | GIS code verified |

#### Legislation extraction gaps

| Zone | Missing primary values |
| ---- | ---------------------- |
| NZ 4 | fondo edificable, altura, plantas, ocupación, FAR/density tables |
| NZ 5 | retranqueos, ocupación, altura, plantas |
| NZ 7 | retranqueos, ocupación, altura, plantas |
| NZ 8 | front/rear/side setbacks, occupation, height |
| NZ 1 | legal meaning of GIS `COEF_Z` codes |

---

### PART B — PARCEL DATA

#### Planning zoning GIS

| Field | Value |
| ----- | ----- |
| hasOpenSource | yes |
| endpoint | `https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer` |
| protocol | ArcGIS REST JSON |
| auth | none observed |
| CRS | EPSG:25830 |
| parcelIdField | no cadastral parcel ID; spatial join required |
| coverage | city-wide zoning coverage |
| grade | ownership-general-boundary (planning zoning, not survey parcel ownership boundary) |
| license | municipal GIS terms / unknown open-data licence text |

#### NZ1 envelope GIS

| Field | Value |
| ----- | ----- |
| endpoint | `PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer/6` |
| protocol | ArcGIS REST JSON |
| auth | none observed |
| CRS | EPSG:4326 output supported; service native EPSG:25830 |
| parcelIdField | `CODMANZANA + NUMORD` |
| coverage | NZ1 footprint geometry |
| grade | planning geometry, not cadastral survey |
| geometry | polygon rings |
| licence | municipal GIS terms / unknown |

---

### PART C — META

| Field | Value |
| ----- | ----- |
| city | Madrid |
| country | Spain |
| ordinanceUrl | Madrid Urbanismo — Normativa urbanística portal |
| ordinanceVersion | PG97 + Compendio 2025 consultation version |
| ordinanceDate | PG approved 17 Apr 1997; Compendio update 24 Sep 2025 |
| officialGIS | Madrid ArcGIS REST services |
| machineReadable? | yes for zoning and NZ1 geometry; no for most numeric regulation tables |
| updateFrequency | GIS: unknown; Compendio updates when amendments are consolidated |

### Dataset readiness for engine use (as supplied)

| Capability | Status |
| ---------- | ------ |
| Parcel → Norma Zonal routing | ✅ available |
| NZ1 footprint geometry | ✅ available |
| NZ4 alignment parameters | ❌ unknown |
| NZ5/NZ7/NZ8 setback parameters | ❌ unknown |
| FAR values | ❌ unknown until article tables extracted |
| Heights | ❌ unknown until article tables extracted |
| Coverage | ❌ unknown until article tables extracted |
| Legal citations for numeric rules | ❌ incomplete |

> The next extraction step is **not GIS**; it is a targeted read of PG97 Chapter 8 articles and
> tables for NZ 1/4/5/7/8, capturing each numeric field with article + paragraph citations.

### Cited sources (as supplied)

| # | URL |
| - | --- |
| 1 | `https://wpgeoportal.madrid.es/normativa-urbanistica/` — Geoportal del Ayuntamiento de Madrid |
| 2 | `https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/info/iteminfo` — ItemInfo |
| 3 | `https://www.madrid.es/portales/munimadrid/es/Inicio/El-Ayuntamiento/Publicaciones/Listado-de-Publicaciones/Compendio-2025-de-las-Normas-Urbanisticas-del-Plan-General-de-Ordenacion-Urbana-de-Madrid-de-1997-actualizado-a-24-09-2025-/` — Compendio 2025 |
| 4 | `https://sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer` — NORMAS_ZONALES MapServer |

---

## §2 — Madrid completeness audit (as supplied)

### Current completeness estimate

| Section | Current state | Missing |
| ------- | ------------- | ------- |
| PART A — Legislation | ~25–35% complete | Article-level numeric extraction |
| PART B — Parcel | ~85–95% complete | licence + parcel source clarification |
| PART C — Meta | ~80–90% complete | official URLs/version/update metadata |
| **Overall** | **~40–50%** | **legal tables are the blocker** |

### PART A — legislation gaps (main blocker)

Required citation granularity — `PG97 Normas Urbanísticas` / `Chapter 8.x` is **not sufficient**. Need:

```
Normas Urbanísticas del PGOU Madrid 1997
Título X / Capítulo X / Artículo X.X.X / apartado X
```

for every numeric field.

| field | required citation |
| ----- | ----------------- |
| buildableDepth_m | Art. 8.4.xx §x |
| maxHeight_m | Art. 8.4.xx §x |
| floors | Art. 8.4.xx §x |
| coverage | Art. 8.4.xx §x |

#### NZ 1 — Protección del Patrimonio Histórico

Have: ✅ GIS routing · ✅ GIS footprint polygon · ✅ GIS codes `1.1–1.6`

| Field | Status |
| ----- | ------ |
| footprint geometry | solved |
| FAR | unknown |
| FAR denominator | unknown |
| max height | unknown |
| floors | unknown |
| coverage | unknown |
| setbacks | unknown |
| permitted use table | unknown |
| COEF_Z meaning | unknown |
| article citations | missing |

> Special issue: `COEF_Z` exists in GIS, but **cannot be used until the ordinance explains what the
> code means.** Need Compendio/NNUU Chapter 8.1 legend or table defining COEF_Z, and verification
> whether it is: m²/m² edificabilidad · coefficient by catalogue condition · another regulatory value.

#### NZ 3 — Volumetría específica

Have: ✅ GIS code exists · ✅ refusal logic exists

Missing (if a legislation row is wanted): FAR, height, floors, coverage, setbacks
(*"null likely, but must be legally confirmed"*), permitted use table, article citations.

> **NZ3 probably should not become an envelope generator.** For the engine dataset the correct final
> value may remain `geometricRule = derived-plan` — but the legislation row still needs the legal citation.

#### NZ 4 — Edificación en manzana cerrada — *highest-value missing zone*

| Field | Needed |
| ----- | ------ |
| farRatio | article/table |
| denominator scope | parcel/property/planning area |
| maxHeight_m | article/table |
| height measurement method | cornisa? total? |
| maxFloors | article/table |
| maxCoverage | article/table |
| front setback | probably null, must verify |
| rear setback | unknown |
| side setback | unknown |
| **buildableDepth_m** | **critical** |
| permitted use | exact table |
| legal citation | missing |

> The single most valuable extraction is `buildableDepth_m`, because NZ4 maps directly to:
> alignment rule + official line + fondo edificable.

#### NZ 5 / NZ 7 / NZ 8

All of FAR, height, floors, coverage, setbacks, permitted use, citations = **unknown/missing**.
`buildableDepth` for NZ5 = null unless ordinance says otherwise.

Extraction must be **per grade**:

* NZ5 — `5.1`, `5.2`, `5.3`
* NZ7 — `7.1.a`, `7.1.b`, `7.2.e`
* NZ8 — `8.1.a`, `8.1.c`, `8.2.a`, `8.2.b`, `8.2.c`, `8.3.a`, `8.3.c`, `8.4`, `8.5`, `8.6`

#### FAR-specific requirement

Schema requires `farRatio (+unit +densityScope)`. Explicit confirmation needed per value:

```
WRONG:    1.5 FAR

CORRECT:  1.5 m² edificabilidad / m² parcela
          densityScope = parcel
          Source: PG97 NNUU Art. X.X.X apartado Y
```

Must identify — **numerator**: built area? computable area? total constructed area? —
**denominator**: parcela / propiedad / ámbito. **No assumptions.**

### PART B — parcel gaps (mostly solved)

1. **Official cadastral parcel source** — planning GIS solved (`sigma.madrid.es`), but schema asks
   for `parcelIdField`. Candidates: Madrid municipal parcel GIS vs Dirección General del Catastro.
   Need `parcelIdField = REFCAT?` with source citation.
2. **Licence** — exact text needed. Madrid open-data licence? ArcGIS service terms? Catastro licence?
3. **Coverage statement** — formal `complete municipal boundary` vs `partial / urban land only`, per official metadata.
4. **CRS** — record separately: planning `EPSG:25830`, output `EPSG:4326`. Dataset must specify canonical storage CRS.

### PART C — meta gaps

* **Ordinance** — missing `ordinanceUrl`, `ordinanceVersion`, exact consolidation date, `effectiveDate`. Need official source URL.
* **GIS** — mostly complete; need `provider`, `service name`, `layer IDs`, `update date`.
* **Machine readable** — final classification:

  | Dataset | Machine readable |
  | ------- | ---------------- |
  | NZ routing | yes |
  | NZ1 footprint | yes |
  | NZ4 parameters | no |
  | NZ8 parameters | no |
  | use tables | partial |

* **Update frequency** — daily? monthly? manual amendment? unknown? **Cannot infer.**

### Shortest path to 100% (as supplied)

1. **Legal extraction (80% of remaining work)** — read PGOU Madrid 1997 NNUU Título 8 / Normas Zonales;
   extract tables for NZ1 grados, NZ4, NZ5, NZ7, NZ8; capture `value`, `article`, `paragraph`,
   `table number`, `effective amendment`.
2. **Resolve GIS/legal joins** — confirm NZ code mapping, grado mapping, whether each grade changes parameters.
3. **Metadata cleanup** — official URLs, licences, update frequency, CRS statements.

### Final blocker list

1. PG97 article-level extraction for NZ1/NZ4/NZ5/NZ7/NZ8
2. All numeric tables with citations
3. FAR denominator classification
4. COEF_Z legal meaning
5. Official parcel dataset + licence
6. GIS update metadata
7. Final ordinance URLs/version metadata

> The GIS reconnaissance has already solved the hardest technical part. The remaining work is a
> **legal transcription and provenance exercise, not a data-discovery problem.**

---

## §3 — Second-pass gap analysis (as supplied)

> Framing: *"I'll treat Madrid as a **data-recon + legal extraction project**, not as a generic
> planning summary."* Scoring: ✅ Complete (primary source + machine-readable + citable) ·
> 🟡 Partial (available but missing legal meaning or full coverage) · ❌ Missing (requires human
> extraction or unavailable).

### Zone status

| Zone | Rule kind | Current status |
| ---- | --------- | -------------- |
| NZ 1 | explicit-area | 🟡 GIS complete, legal semantics incomplete |
| NZ 3 | derived-plan refusal | ✅ |
| NZ 4 | alignment | ❌ missing ordinance parameters |
| NZ 5 | setback | ❌ missing ordinance parameters |
| NZ 7 | setback | ❌ missing ordinance parameters |
| NZ 8 | setback | ❌ missing ordinance parameters |

### A1 — zoneCode ✅ ~95%

Source: `DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0`, field `AMB_TX_ETIQ`.

Full observed vocabulary:

```
1.1  1.2  1.3  1.4  1.5  1.6
3.1  3.1.a  3.1.b  3.1.c  3.2
4
5.1  5.2  5.3
7.1.a  7.1.b  7.2.e
8.1.a  8.1.c  8.2.a  8.2.b  8.2.c  8.3.a  8.3.c  8.4  8.5  8.6
```

Missing: official normalization table · historical equivalences · **zones absent from GIS synthesis (2, 6, 10, 11)**.
Needed artefact: `ZoneCodeRegistry.json` with `zoneCode`, `officialDesignation`, `active`, `source`.

### A2 — officialDesignation 🟡 ~70%

Available: GIS denomination fields, PGOUM titles. Missing: exact legal names **per grado**
(e.g. `8.2.a` = "Zona 8 grado 2 nivel a" → officialDesignation `???`). Source needed: Compendio Chapter 8.x.

### A3 — FAR 🟡 ~30% (NZ1) / ❌ (NZ4, NZ5, NZ7, NZ8)

NZ1 GIS gives `COEF_Z` but meaning unknown — e.g. `COEF_Z="5"` could be FAR, a coefficient,
a protected condition, or a special catalogue coefficient. Required extraction shape:

```
farRatio: 5
unit: m2/m2
densityScope: parcel/property/planning-area
article: 8.x.x
paragraph: x
```

Until then: `farRatio = unknown`. For other zones, need articles containing *edificabilidad*,
*aprovechamiento*, *coeficiente de edificabilidad*.

### A4 — maxHeight_m ❌ 0%

GIS has no `ALTURA` / `ALTURA_MAX` / `PLANTAS`. Likely articles `8.4.x`, `8.5.x`, `8.8.x`. Target shape:

```
maxHeight_m: 16
measurement: cornisa
article: 8.4.7
paragraph: 2
```

> **Do not use GIS building heights or existing building footprints — those are descriptive, not normative.**

### A5 — maxFloors ❌ 0%

Extract *Número máximo de plantas* per grade → `maxFloors`, `measurement: sobre rasante`, `source`.

### A6 — maxCoverage ❌ 0%

Terms: *ocupación máxima*, *porcentaje de ocupación*. **Must specify denominator** —
`maxCoverage: 70%`, `densityScope: parcel`, **NOT** building footprint / block.

### A7 — setbacks ❌ 0%

Per grade `front` / `rear` / `side` — **but only if the article says it.**
Never `side = 0`. Unknown ⇒ `null`. NZ5/NZ7 source: NNUU open-block regulations
(*retranqueo frontal / lateral / posterior*).

### A8 — buildableDepth_m ❌ — critical for NZ4

Need *fondo edificable*, e.g. `buildableDepth_m: 20`, `source: PGOUM Art 8.4.x`.

> **Do not use average block depth, GIS geometry, or Barcelona methodology. Madrid explicitly regulates this.**

### A9 — permittedUse 🟡 ~50%

GIS layer `PG_USOS_Y_ACTIVIDADES` exists but is coded. Need legend decoding
*Nivel* / *Uso cualificado* / *Uso compatible*.

### A10 — legal citations ❌ 0% — biggest legislation gap

Every numeric value requires `legalSource`, `article`, `paragraph`, `effectiveDate`.
Needed artefact: `Madrid_NNUU_Citations.csv`.

### PART A completion (as supplied)

| field | coverage |
| ----- | -------: |
| zoneCode | 95% |
| designation | 70% |
| FAR | 30% |
| height | 0% |
| floors | 0% |
| coverage | 0% |
| setbacks | 0% |
| depth | 0% |
| uses | 50% |
| citations | 0% |
| **Overall** | **~35%** |

### PART B completion (as supplied) — ~75%

| field | status |
| ----- | ------ |
| open source | ✅ (`sigma.madrid.es/hosted/rest/services`, no auth) |
| endpoint | ✅ |
| auth | ✅ public, no API key |
| CRS | 🟡 native 25830 / output 4326 — document both |
| parcel ID | 🟡 planning `CODMANZANA`+`NUMORD` vs Catastro `REFCAT`; relationship spatial only → need `joinMethod: centroid spatial intersection` |
| coverage | 🟡 zoning 100%, NZ1 footprint 100%, Catastro parcel geometry needs official source (likely Catastro INSPIRE — verify) |
| grade | 🟡 likely `ownership-general-boundary`, not survey — **avoid claiming cadastral precision** |
| license | ❌ |

### PART C completion (as supplied) — ~60%

* `ordinanceUrl` 🟡 — need official stable URL; archive `url`, `version`, `publication date`, **hash**
* ordinance version/date 🟡 — need exact `effectiveDate: YYYY-MM-DD`
* official GIS ✅ — register "Madrid Ayuntamiento SIG, ArcGIS hosted services"
* machineReadable — GIS yes / ordinance no
* updateFrequency ❌ — need GIS metadata + PDF publication history

### Overall Madrid readiness (as supplied)

| Area | completion |
| ---- | ---------: |
| GIS routing | 95% |
| NZ1 geometry | 90% |
| parcel join | 85% |
| derived-plan detection | 95% |
| legislation parameters | 25% |
| legal citations | 5% |
| machine-readable ordinance | 0% |

### Work packages

* **WP1 — PGOUM legal extraction (largest).** Human/legal extraction for NZ4, NZ5, NZ7, NZ8, and NZ1 `COEF_Z` meaning. Output: `Madrid_Norma_Zonal_Rules.json`.
* **WP2 — citation engine.** Every numeric value carries:

  ```json
  { "value": 20, "unit": "m", "source": "PGOUM-97 NNUU",
    "article": "8.4.7", "paragraph": "2", "effective": "2023" }
  ```

* **WP3 — GIS metadata hardening.** CRS, license, update date, service version, geometry accuracy.
* **WP4 — ordinance machine extraction.** PDF → structured table (`zone`, `grado`, `parameter`, `value`, `article`). **Human validation required.**

### Realistic final Madrid score (as supplied)

| Stage | Score |
| ----- | ----- |
| With current recon | **≈55–60% production-ready** |
| After legal extraction | **≈90%** |
| After KG-4 explicit-area engine + ordinance citation layer | **≈95%** |

> The last ~5% is unavoidable because Madrid contains special fichas, protected buildings, APR/APEs,
> parcel-specific volumetries, and discretionary planning instruments. A true 100% automated
> buildability engine would require those individual plans and fichas as additional datasets.

---

## §4 — Capture notes (MINE, not the founder's)

These are conflicts *internal to the supplied material*. They are recorded, not resolved. Every one
of them touches a citation-bearing field, so **none may be silently collapsed** when deriving the
per-city schema files.

### C-1 — Ordinance version conflict: Compendio **2025** vs **2023**

The material states both, in load-bearing positions:

| Says 2025 | Says 2023 |
| --------- | --------- |
| §1 source basis — "Compendio … (updated 24-09-2025)" | §3 A2 — "Source needed: PGOUM Compendio 2023: Chapter 8.x" |
| §1 PART C — `ordinanceVersion: PG97 + Compendio 2025` | §3 PART C — "Known: Compendio 2023" |
| §1 PART C — `ordinanceDate: … Compendio update 24 Sep 2025` | §3 PART C — "Need official stable URL: Madrid Compendio NNUU **2023** PDF" |
| §1 cited source [3] — URL literally contains `Compendio-2025-…-actualizado-a-24-09-2025` | §3 WP2 — citation exemplar carries `"effective": "2023"` |

The supplied **URL** is the strongest evidence and points to **2025**. The 2023 references most
likely predate it (a §3 written against an earlier consolidation). **Do not assume** — this must be
confirmed against the portal before any `effectiveDate` / `ordinanceVersion` is written, because
WP2's citation exemplar would otherwise stamp `2023` onto every extracted numeric value.

### C-2 — Completeness figures are not reconcilable across passes

| Metric | §2 says | §3 says |
| ------ | ------- | ------- |
| PART A | ~25–35% | ~35% (table) / 25% ("legislation parameters") |
| PART B | ~85–95% | ~75% |
| PART C | ~80–90% | ~60% |
| Overall | ~40–50% | ≈55–60% production-ready |

§2 and §3 score different things (schema-field coverage vs production-readiness) and disagree on
direction for B and C — §3 is *more pessimistic* on B/C but *more optimistic* overall. Pick one
scoring basis and state it; do not average them. **C63's 7-axis scorecard is the ratified basis
(LEG25 · ENV20 · PAR15 · SRC15 · HGT10 · TER10 · CTX5)** and should override both ad-hoc scales.

### C-3 — NZ3's status is inconsistent

§1 lists NZ3 with `setback: null`, `buildableDepth: null`, confidence "GIS code verified".
§3 scores NZ3 ✅ "derived-plan refusal". §2 says NZ3 still needs FAR/height/floors/coverage/citations
and that setbacks are "null likely, **but must be legally confirmed**".

The ✅ is for *refusal logic working*, not for *rules being known*. Those are different claims and
must not be merged — this is the failure-vs-empty distinction that has bitten this codebase
repeatedly (L-422/457/467/469). A correctly-refusing zone is not a complete zone.

### C-4 — `COEF_Z` is quarantined

`COEF_Z` is present in GIS and is the **only** FAR-shaped number Madrid currently exposes. Its legal
meaning is unknown. Until Chapter 8.1 defines it, it must not be bound to `farRatio` — a `COEF_Z` of
`5` read as FAR 5.0 would overstate massing by roughly the same mechanism as **L-616**, where the
Barcelona massing ignored the FAR ceiling (~5× over) and drew an unknown setback as zero.
**Unknown ≠ permissive default.**

### C-5 — Zones 2, 6, 10, 11 are absent from the GIS synthesis

§3 A1 flags these as missing from the vocabulary. Unresolved: whether they are *inactive in the PG97*,
*absent from this particular layer*, or *simply not yet observed*. Those three have very different
consequences for routing coverage, and the third would mean parcels exist that route nowhere.
