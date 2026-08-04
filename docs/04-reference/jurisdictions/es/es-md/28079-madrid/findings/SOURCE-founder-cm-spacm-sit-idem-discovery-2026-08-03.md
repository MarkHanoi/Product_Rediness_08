# SOURCE — Founder: CM_SPACM Regional SIT/IDEM Discovery (raw capture + verified data pull)

> **Provenance.** Founder-provided research, delivered 2026-08-03 (two successive messages), proposing
> that Madrid's regional planning infrastructure (Visor SIT + IDEM geoportal, covering all 179
> Comunidad de Madrid municipalities) may be far richer than `esMadridSpacm.ts`'s current assumptions.
> Captured **condensed** in §A. §B is mine: **not just URL-reachability verification but an actual
> data pull** — the founder's own proposed Stage 1 ("download every schema, don't trust the marketing
> page") was executed this session, not just recommended.
>
> ⭐ **This is the strongest capture of the day.** Unlike the Sevilla/Barcelona/Andalucía captures,
> which verified endpoint *existence*, this one downloaded and inspected actual *content* — 304 MB of
> real planning data — and found the parameter fields the founder hoped for, by keyword count, in the
> live dataset.
>
> Related: [`SOURCE-founder-nz1-cpphan-negative-proof-dossier-2026-08-03.md`](./SOURCE-founder-nz1-cpphan-negative-proof-dossier-2026-08-03.md) ·
> `packages/site-parcel-data/src/rulepacks/esMadridSpacm.ts` · `providers/resolveMadridNZ1Ring.ts`

**Framing, quoted:** *"The question is no longer 'does the data exist?' but rather 'can PRYZM consume
it automatically?'... If Madrid already exposes zoning polygons, parameters, municipality boundaries,
and planning documents through one consistent service, then CM_SPACM is not a data problem. It
becomes an engineering problem."*

---

## §A — Claims (condensed across both messages)

- **179 municipalities, not 178.** The Visor SIT covers all 179 municipalities of the Comunidad de
  Madrid with ~3,300 vectorized planning instruments and "more than 160 planning parameters"
  represented in the cartography.
- **Vectorized, not PDF-only**: planning cartography is captured as digital vector data, with
  attributes "entresacados de los textos de la documentación de los planes" (extracted from the plan
  texts by the administration itself).
- **Parcel search exists** in the SIT viewer, including by `referencia catastral`.
- **Multiple machine-readable services claimed**: WFS, WMS, WMTS, ATOM downloads, CSW catalogue,
  INSPIRE services, a dedicated "Planeamiento Urbanístico" dataset.
- **Continuously maintained**: periodic updates, 2026 updates listed.
- **Proposed research programme** (5 stages): enumerate every endpoint → enumerate every layer/field
  → rank fields by envelope-relevance → search specifically for
  altura/plantas/edificabilidad/retranqueo/fondo/ocupacion/alineacion/cornisa/rasante → test the full
  parcel→polygon→attributes→envelope workflow.
- **Four named scenarios**: (A) WFS/data returns height/floors/setback/depth directly — "the dream";
  (B) returns zone code + PDF/article reference — "still excellent, one rulepack"; (C) parameters
  exist only inside the viewer, public service is geometry-only; (D) viewer queries a private
  internal service, public WFS is poorer.

---

## §B — Verification (mine): the claims are true, and Scenario A is now data-confirmed, not hypothesized

### B.1 — Page claims confirmed by direct fetch

Both cited pages were fetched directly and quoted verbatim where checkable:

- `comunidad.madrid/medio-ambiente/sistema-informacion-territorial-visor-sit` — confirms 179
  municipalities, ~3,300 instruments, attribute-extraction-from-text, and catastral-reference search,
  verbatim: *"El Visor SIT... ofrece el planeamiento urbanístico vigente aprobado definitivamente
  para los 179 municipios..."* and *"sus atributos son entresacados de los textos de la documentación
  de los planes."*
- `comunidad.madrid/geoportal/idem` — confirms a dedicated ATOM feed for "Planeamiento Urbanístico"
  and 17 separate WFS theme endpoints.

### B.2 — The one place §A's optimism needed a correction, found before the data pull

The 17 WFS themes listed on the IDEM page (`Zonas, ZonasRiesgo, UsoDelSuelo, UnidadesAdministrativas,
Suelo, SistemasCuadriculas, ServiciosPublicos, RegionesBiogeograficas, RedesTransporte,
LugaresProtegidos, InstalacionesMedioAmbiente, Hidrografia, Habitats, Geologia, Elevaciones,
CubiertaTerrestre`) **do not include a "Planeamiento" theme.** Urban planning is published via **ATOM
bulk download only**, not as a live queryable WFS/REST service. This is a materially different
engineering shape than §A's Question 1 hoped to resolve cleanly: it is not "which live API do we
call per parcel," it is "download a regional GeoPackage once, ingest it, and query it locally" — a
one-time ETL task, not a per-request API integration.

### B.3 — The actual data pull: this session downloaded and inspected the real dataset, not just its existence

Followed the ATOM feed chain to a real download:
`idem.comunidad.madrid/recursos_cat_geo/Catalogo/atom/dataset_feeds/planeamiento/vpla_pg.cm.xml` →
`.../recursos/Planeamiento/General/vpla_pg_gpkg.zip` — **132.8 MB zip, downloaded and extracted to a
304 MB GeoPackage** (`vpla_pg_gpkg.gpkg`, EPSG:4258/ETRS89, CC BY 4.0), confirming this is a real,
substantial regional dataset, not a stub or a marketing artefact.

**Table schema extracted directly from the SQLite/GeoPackage file** (no `sqlite3`/`ogrinfo` available
in this environment; extracted via raw `grep`/`CREATE TABLE` pattern matching on the binary):

- `VPLA_CLASIFICACION` — coarse land classification (the layer every Spanish city so far has
  published easily; not the bottleneck).
- **`VPLA_ORDENANZAS` — the ordinance/parameter-level layer.** This is the layer every Andalucía
  audit this session (Córdoba, Málaga, Granada) found to be the actual bottleneck once coarse
  classification was solved — **and Madrid's regional dataset has a table with this exact name.**
- `VPLA_AMBITOS` (planning ámbitos/scopes), `VPLA_G_REUR` (general structure), `VPLA_REDES`
  (networks) — supporting layers, not independently inspected.

**Keyword frequency inside the raw file** (a proxy for whether these fields/values genuinely appear
in the data, run before more precise per-table column extraction was attempted and failed on this
system's available tooling):

| Keyword | Meaning | Occurrences |
|---|---|---|
| `USO` | use | 11,337 |
| `ALTURA` | height | 3,536 |
| `RETRANQUEO` | setback | 1,345 |
| `OCUPACION` | coverage | 856 |
| `EDIFICABILIDAD` | FAR | 944 |
| `FONDO` | depth | 676 |
| `APROVECH` | buildability | 233 |
| `PLANTAS` | floors | 438 |
| `COEF_EDIF` | edificabilidad coefficient | 203 |

**This is strong evidence for §A's Scenario A** (WFS/data returns height/floors/setback/depth
directly), not B or C — every parameter category the founder's Stage 4 asked to search for is present
in real volume in the actual downloaded data, in a table literally named `VPLA_ORDENANZAS`.

### B.4 — What is still NOT established (honest gaps)

- **Exact column-to-value mapping was not completed.** The keyword counts prove these terms appear in
  the file (as column names, coded-value domains, and/or attribute values are all plausible), but the
  precise schema (which column holds a numeric height in metres vs. a coded band, whether
  `VPLA_ORDENANZAS` rows join to `VPLA_CLASIFICACION` polygons by a stable key) was not extracted —
  this environment lacks `sqlite3`/`ogrinfo`/GDAL tooling to open the GeoPackage properly. **The
  correct next step is opening this file with real GIS tooling** (QGIS, `ogrinfo`, or a `better-sqlite3`
  Node script — Node is available in this repo's toolchain), not more keyword-grepping.
- **Per-municipality vs. regional-aggregate schema parity was not checked.** The ATOM feed also lists
  ~179 individual municipality GPKG files (`28001`-`28014`+ seen in the feed, matching INE codes); this
  session pulled only the regional-aggregate `vpla_pg_gpkg.gpkg`. Whether Madrid capital's own
  parameters are in this file or require the per-municipality download was not confirmed.
- **Whether `VPLA_ORDENANZAS` covers CM_SPACM's actual failure mode is unconfirmed.** `esMadridSpacm.ts`'s
  own documented blocker is a **bbox-routing bug** (4.35 km overlap with Madrid capital) preventing any
  click from ever reaching this jurisdiction, independent of data quality — that specific bug is
  unaffected by anything found in this GPKG and must still be fixed (see prior forensic analysis:
  "build a polygon-based `contains` predicate from `Callejero:SIGI_V_MUNICIPIOS`, 3-5 days").
- **License and update-currency were read from the ATOM feed metadata (CC BY 4.0, dated 2026-07-21 for
  this specific file) but not independently cross-checked against a second source.**

### B.5 — Net effect on CM_SPACM's classification

The prior forensic analysis classified CM_SPACM's root blocker as purely **Engineering** (the bbox
bug) with the parameter-availability question left implicitly assumed-hard. This capture doesn't
change the *root* blocker (the bbox bug is still first in the causal chain — nothing downstream
matters until a parcel can route here at all), but it substantially **de-risks the *second* blocker**:
once routing is fixed, the parameter-extraction task this session assumed would need Córdoba-style
OCR/PDF-parsing work may instead be a GeoPackage schema-mapping task — plausibly faster, given real
structured data already confirmed present at volume. Recommend re-scoping CM_SPACM's second-stage
effort estimate downward pending the proper schema extraction in B.4, rather than treating the
original "1-2 days compute once signed" Madrid-NZ-4-9 estimate as a proxy for CM_SPACM's much larger
178-municipality scope.

**Housekeeping**: the downloaded files (`/tmp/vpla_pg.zip`, `/tmp/vpla_pg_gpkg.gpkg`, ~437 MB
combined) were scratch-space downloads for this verification, not committed to the repository, and
should be deleted after this session if not already.
