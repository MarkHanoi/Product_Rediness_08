# Molina de Segura (INE 30027) — PRYZM Capability Research

> **Correction (2026-08-04):** this research was originally briefed and filed under INE 30026 — a
> mis-cited code. Verified live against `es.wikipedia.org/wiki/Molina_de_Segura`
> (`cod_municipio=027`): the correct INE code is **30027**. This file was moved from
> `30026-molina-de-segura/` to `30027-molina-de-segura/` accordingly; no other content changed.

Date: 2026-08-04
Status: Independently verified via live WebFetch/WebSearch (this pass). Supersedes nothing — extends
the prior founder manual-research pass, which is corroborated below except where noted.

## 0. Verdict up front

**Public parcel → ordinance mechanism: FOUND, but third-party-hosted and not confirmed
machine-queryable.** Molina de Segura has a real, named, funded GIS program (IDEMO) with an
internal GeoServer + Oracle stack (per a 2017 procurement PPT), and — as of this research — a
live public map viewer that explicitly supports "search by address or cadastral reference" and
displays zoning classification. That viewer, however, is not self-hosted GeoServer/ArcGIS
reachable at a `molinadesegura.es` URL; it is white-labelled on a third-party SaaS platform
(TecnoGeoWS "Citymap"), whose underlying service endpoints could not be enumerated by this
research pass (no browser devtools access; static WebFetch could not surface the SPA's XHR/API
calls). **The single blocker is: confirm/reverse-engineer the TecnoGeoWS Citymap backend API for
this specific map instance** (or negotiate direct GeoServer/WFS access from the Ayuntamiento,
which per the 2017 PPT already runs GeoServer internally). This is a research/access problem, not
a "data doesn't exist" problem.

## 1. Architecture as evidenced (text diagram)

```
┌─────────────────────────────────────────────────────────────────────┐
│  AYUNTAMIENTO DE MOLINA DE SEGURA — internal IDEMO stack (2017 PPT)  │
│                                                                       │
│   Oracle 11g (no spatial extension) ──edición──> QGIS (desktop)     │
│         │                                                            │
│         └── consulta de datos ──> GeoServer ──> "Geoportal" (web)   │
│                                                                       │
│  Tables: TABLAS_PGMO, TABLAS_GUIA_URBANA, TABLAS_EXPEDIENTES_       │
│  URBANISMO. User auth via municipal LDAP.                           │
│  Planning/expediente case management lives in separate platform     │
│  PAC/TAO (+ legacy Access files) — NOT the spatial DB.               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ (public exposure, as observed live 2026-08-04)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  urbanismo.molinadesegura.es/idemo/  →  3 embedded viewers, all      │
│  hosted on citymap.tecnogeows.com (third-party SaaS, "Citymap" by   │
│  Tecnogeo), NOT a molinadesegura.es-hosted GeoServer/ArcGIS URL:     │
│                                                                       │
│   1. Guía Urbana / Callejero Caminos                                │
│      https://citymap.tecnogeows.com/user/.../XQgUpir5E6Y5yq9o9xtnx7 │
│   2. P.G.M.O. Información territorial  ← the planning layer         │
│      https://citymap.tecnogeows.com/user/.../LJJD49MCXfXGyPCJWdcec2 │
│      — supports search by address or cadastral reference;           │
│        displays zoning classification (per page description text)  │
│   3. Medio natural. Árboles singulares                              │
│      https://citymap.tecnogeows.com/user/.../EsJffubn2EqKwjcDJDwhjH │
└─────────────────────────────────────────────────────────────────────┘
```

Whether the internal GeoServer (from the 2017 PPT) is the same instance feeding the current
TecnoGeoWS-hosted viewer, or whether the municipality has since migrated its public-facing layer
to the third-party platform while keeping GeoServer purely internal, could not be determined from
this pass. Both are plausible; TecnoGeoWS/Citymap products typically ingest a client's SHP/GeoServer
exports and re-serve them from Tecnogeo's own infrastructure, which would explain why no
`molinadesegura.es`-hosted WMS/GeoServer endpoint is publicly discoverable even though one exists
per the procurement document.

## 2. Phase-by-phase findings

### Phase 1 — Hidden GIS infrastructure search
- `site:molinadesegura.es geoserver|arcgis|wms|wfs` — **no indexed results** on any
  `molinadesegura.es` subdomain.
- `site:molinadesegura.es urbanismo visor|planeamiento` and `geoportal|IDE|cartografia` searches
  surfaced the real assets: `urbanismo.molinadesegura.es/idemo/` (the geoportal landing page) and
  `sedeelectronica.molinadesegura.es/informacion-urbanistica/`.
- Direct probe `https://citymap.tecnogeows.com/geoserver/wms?service=WMS&request=GetCapabilities`
  → **HTTP 404**. No public GeoServer at that guessed path.
- No GeoJSON/SHP/GML bulk-download links found anywhere in the crawl.

### Phase 2 — Internal GIS confirmation
- **Confirmed independently** (not just per the founder's prior pass): the Pliego de
  Prescripciones Técnicas "FASE II del Proyecto IDEMO" (Molina de Segura, October 2017,
  `contrataciondelestado.es`, doc ID `253339cb-9180-463b-a85f-604e35d6b200`) states verbatim:
  > "El sistema de este proyecto, utilizará como base el sistema ya existente de IDEMO, el cual
  > se fundamenta en: Gestor de bases de datos Oracle 11g (Sin extensión "spatial"). Servidor de
  > datos espaciales GeoServer. Aplicaciones de escritorio Qgis."
- The same PPT's Annex 1 diagram shows: GeoServer → Geoportal (public: visualización, consulta,
  informes, mapas temáticos) and QGIS → edición/análisis (internal staff only), both against the
  same Oracle 11g DB, gated by LDAP for editing.
- The PPT explicitly requires (as a scored bid criterion, "Mantenimiento del geoportal del PGMO",
  worth 5/100 points) a public geoportal with: consulta de normativa zonal sobre PNOA/catastral/
  topográfica base maps, **"Fichas urbanísticas por parcelas catastrales"**, search by street
  name/toponym/**referencia catastral**, and 5 thematic maps including "Clasificación del suelo."
  This is the aspirational spec (2017) for exactly the parcel→ordinance product PRYZM needs — it
  was explicitly commissioned, not merely inferred.
- **Whether the delivered/live product matches that 2017 spec is the open question.** The live
  viewer found in Phase 1 (TecnoGeoWS Citymap "P.G.M.O. Información territorial") does appear to
  deliver on it functionally (cadastral-reference search + zoning display), which is a strong
  positive signal that the 2017 contract was substantially executed — but it's hosted off-domain,
  so its data pipeline back to the internal GeoServer/Oracle system is unverified.
- **Public vs semi-public vs internal**: the geoportal (GeoServer-fed or its TecnoGeoWS successor)
  is **public, no login required** for viewing/querying. The editing side (QGIS + LDAP) is
  internal-only, as expected and irrelevant to PRYZM's read-only needs.

### Phase 3 — Planning polygon attributes
- Could not directly inspect layer attribute schemas: the TecnoGeoWS Citymap viewer is a
  JavaScript SPA; static WebFetch renders only the page shell/title, not the runtime API calls or
  GetFeatureInfo responses. No devtools/browser access was available in this research pass.
- Indirect evidence only: the viewer's own description promises "zoning classifications" on
  cadastral-reference search, implying at minimum a `CLASIFICACION`/`ZONA`-type field exists, but
  the exact field names, `ORDENANZA`/`CLAVE` codes, and whether they're exposed via any
  machine-readable response (vs. rendered-only map tiles/popups) is **unverified**.

### Phase 4 — Ordinance linkage
- The regulatory source documents exist and were located:
  - **Normas Urbanísticas del PGMO** (BORM publication 2006-07-28):
    `https://urbanismo.molinadesegura.es/download/67/normas-urbanisticas-del-plan-general-fecha-de-publicacion-borm-28-07-06/387/normas-urbanisticas-del-plan-general-municipal-de-ordenacion-de-molina-de-segura.pdf`
  - **Fichas Urbanísticas del Refundido PGMO** (zoning data sheets, 2013 consolidated text):
    `https://urbanismo.molinadesegura.es/wp-content/uploads/sites/11/wpfd/preview_files/Fichas-Urbanisticas-del-Refundido-PGMO.pdf` (3.1 MB)
- **Could not extract per-zone height/FAR/coverage/setback tables from either PDF in this pass.**
  Both PDFs downloaded successfully (154 KB and 3.1 MB respectively, confirming they are real,
  reachable, non-broken documents) but WebFetch's text-extraction reported the content as
  effectively non-extractable as plain text — consistent with these being image-embedded/
  vector-drawn tables (common for "fichas" zone-parameter sheets in Spanish PGMOs) rather than
  text-selectable tables. This is an OCR/structured-extraction task, not evidence the data is
  absent — the document exists, is public, and is exactly the class of document Cartagena/Lorca/
  other Murcia-region municipalities use for the same purpose.
- No article numbers or example zone parameter values could be cited this pass — **flag for a
  dedicated OCR/table-extraction pass**, not re-litigate whether the document exists.

### Phase 5 — Parcel lookup tool
- **Found, live, public, no auth**: the TecnoGeoWS-hosted "P.G.M.O. Información territorial"
  viewer explicitly supports search by cadastral reference and displays the corresponding zoning
  classification. This is the single most important finding of this pass — it means the
  founder's "one unresolved question" has a positive answer at the UX layer, even though the
  underlying API/automation layer is not yet confirmed accessible.
- No separate/standalone "cédula urbanística" or "informe urbanístico" auto-generation tool
  (PDF report generator) was found on `sedeelectronica.molinadesegura.es/informacion-urbanistica/`
  — that page is a document-archive page (individual modification/expropriation PDFs), not a
  live query tool.
- Standard Spanish national Catastro lookup (`sedecatastro.gob.es`) works for Molina de Segura as
  everywhere in Spain, but returns cadastral/ownership data only, not planning/zoning — as
  expected, this is not a substitute for the municipal ordinance linkage.

### Phase 6 — Hidden APIs
- **Not enumerable with the tools available in this pass.** `citymap.tecnogeows.com` is a
  JavaScript single-page application; WebFetch (static HTML→markdown conversion via a secondary
  model) returns only the page `<title>` and no meaningful DOM/script content, so no config JSON,
  API base URL, or WMS/WFS/REST call pattern could be recovered. A direct guess at a co-located
  GeoServer path (`citymap.tecnogeows.com/geoserver/wms?...GetCapabilities`) returned HTTP 404,
  ruling out that specific guess but not the existence of a differently-named or differently-
  routed backend (e.g., a proprietary Tecnogeo REST API, a GeoServer on a different subdomain, or
  server-side rendering with no client-exposed OGC service at all).
- **Recommended next step** (requires a real browser / headless browser with network-tab capture,
  which this research pass did not have access to): load
  `https://citymap.tecnogeows.com/user/100910439833684053395/map/LJJD49MCXfXGyPCJWdcec2`,
  perform a sample cadastral-reference search, and capture the XHR/fetch calls it issues. This
  single step would either (a) reveal a queryable WMS/WFS/REST endpoint → pipeline becomes
  automatable in days, or (b) reveal a closed/obfuscated proprietary call → next step is to
  contact the Ayuntamiento's Nuevas Tecnologías/Urbanismo departments (named in the 2017 PPT as
  IDEMO's governance team) to request direct GeoServer/WFS credentials, which the municipality
  already operates internally per Phase 2.

### Phase 7 — Digital planning database public exposure
- **Confirmed**: the internal planning-polygon/PGMO/expediente database (Oracle 11g + GeoServer,
  per Phase 2) has at least one public exposure point — the TecnoGeoWS-hosted viewer — for
  visualization and (per its own description) cadastral-reference-driven zoning lookup. Whether
  that exposure point is a live pass-through of the same Oracle/GeoServer data or a periodically-
  exported static snapshot is unverified.

### Phase 8 — Envelope parameters table

| Parameter | Found | Source | Machine-readable? |
|---|---|---|---|
| Height (altura máxima) | Likely present, not extracted | Fichas Urbanísticas del Refundido PGMO (PDF, per-zone sheets) | No — PDF appears image/vector-table based; needs OCR pass |
| FAR (edificabilidad) | Likely present, not extracted | Same Fichas Urbanísticas PDF; possibly also Normas Urbanísticas articles | No — same blocker |
| Coverage (ocupación) | Likely present, not extracted | Same Fichas Urbanísticas PDF | No — same blocker |
| Setbacks (retranqueos) | Likely present, not extracted | Normas Urbanísticas PDF (article-based general rules) + Fichas (per-zone specifics) | No — same blocker |
| Max floors (plantas) | Likely present, not extracted | Same Fichas Urbanísticas PDF | No — same blocker |
| Building depth (fondo edificable) | Likely present, not extracted | Same Fichas Urbanísticas PDF, if present at all (not all Spanish PGMOs regulate this explicitly) | No — same blocker |
| Zone code → parcel linkage | **Found, live** | TecnoGeoWS "P.G.M.O. Información territorial" viewer, cadastral-reference search | Unverified — UI-level yes, API-level unconfirmed |

All six numeric parameters are asserted to exist (the documents are real, downloadable, and of
the expected type/size for a Spanish PGMO's zone-parameter sheets) but **none were independently
confirmed with a cited article number or example value in this pass**, because the PDF
text-extraction tool available could not read the tables. This is a distinct and easier problem
than "document doesn't exist" or "document is unreachable."

## 3. Plan-status verification (independent check on the founder's prior claim)

- **Corroborated**: multiple independent search results state the PGMO's **texto refundido was
  approved by the Pleno on 25 March 2013 and is currently in force**. No search for
  "Molina de Segura PGMO anulado / nulo / sentencia TSJ" surfaced any judicial annulment of the
  plan — the only TSJ-Murcia/Molina de Segura rulings found concern an unrelated wastewater-
  discharge sanction (2025), not planning nullity. This is a meaningfully different situation
  from Cartagena's 2012 revision, which the memory record confirms WAS declared null.
- **Corroborated**: modifications 83 and 86 are narrow. Modification 83 (public exhibition
  2024-11-07) adjusts planning alignments to an existing pedestrian path in the API-Los Olivos
  area. Modification 86 adjusts street alignments on Calle San Nicolás (Llano de Molina) to match
  physical reality. Neither is a framework replacement.
- Base PGMO instrument was originally approved and published in BORM 2006-07-28 (per the live
  `urbanismo.molinadesegura.es/pgmo/` page), with the 2013 consolidated text folding in the
  intervening modifications — a normal, stable single-plan situation.

## 4. Implementation assessment (Phase 9)

**Can PRYZM automatically compute parcel → applicable ordinance → envelope for Molina de Segura
today? No — but not because the data or a public tool is missing.** The blocker is narrower and
more tractable than in cases with genuinely absent public infrastructure:

**The single missing technical step: confirm the query/API contract of the TecnoGeoWS Citymap
viewer's cadastral-reference search (or obtain direct GeoServer/WFS access from the Ayuntamiento's
Nuevas Tecnologías department), and OCR/structure-extract the Fichas Urbanísticas PDF into a
zone-code → parameter table.**

Both of these are execution tasks against known, real, reachable targets — not blocked by
"nothing exists," "everything is internal-only," or a legal/authorization barrier. This puts
Molina de Segura in a substantially better starting position than jurisdictions where Phase 1–2
come back empty.

Two parallel paths forward, roughly in order of preference:
1. **Reverse-engineer the public viewer** — load the Citymap viewer in a real/headless browser,
   run a cadastral-reference search, capture the network calls. If it's backed by a queryable
   WMS/WFS/REST layer (even a Tecnogeo-proprietary one), build a thin adapter. Fastest path if it
   works; unknown probability of success without hands-on browser access (not available to this
   research pass).
2. **Request direct access** — the Ayuntamiento already operates GeoServer + Oracle internally
   (2017 PPT) and has an active "Responsable del Proyecto IDEMO" role and a Nuevas Tecnologías/
   Urbanismo joint governance team. A direct data-sharing/API request (similar to what likely
   happened for Murcia capital) is a realistic, precedented ask. Slower (depends on municipal
   responsiveness) but more durable/legitimate than reverse-engineering a third-party SaaS.

In parallel, regardless of which path above succeeds: the **ordinance-parameter extraction (Phase
8 gaps) must happen either way** — OCR/manual transcription of the Fichas Urbanísticas PDF into a
structured zone-code table, cross-checked against the Normas Urbanísticas articles for the
general (non-zone-specific) rules (general setback rules, height-per-street-width rules, etc., as
is typical in Spanish PGMOs).

## 5. PRYZM readiness score: **45 / 100**

Justification:
- +20 for a stable, non-annulled, single operative plan (2013 consolidated text) with narrow,
  non-structural recent modifications — this is the hardest prerequisite in other jurisdictions
  and it's cleanly satisfied here.
- +15 for confirmed internal digital GIS infrastructure (Oracle + GeoServer, 2017 procurement,
  independently verified) — proves the data is already structured, georeferenced, and
  policy-linked at the municipality, not something PRYZM would have to digitize from scratch.
- +10 for a live, public, no-auth parcel/cadastral-reference → zoning-classification viewer
  (TecnoGeoWS Citymap) — this is the "Phase 5" deliverable other jurisdictions often lack
  entirely.
- −0 rather than a penalty for the plan being from 2006/2013 rather than more recent — age is not
  a defect here since it's stable and current.
- Capped well below 70+ because: (a) no confirmed machine-readable API/WFS access point — the
  entire parcel→zone linkage currently exists only as a human-facing SPA on third-party
  infrastructure; (b) zero confirmed ordinance parameter values (height/FAR/coverage/setbacks) —
  the source PDFs exist but were not successfully parsed in this pass; (c) the relationship
  between the internal GeoServer and the public TecnoGeoWS viewer is unconfirmed (is it a live
  feed, a periodic export, or a wholly separate re-digitization?) — this uncertainty could hide
  either a trivial fix or a genuine data-freshness/reliability risk.

## 6. Engineering estimate

Conditional on which path (Section 4) succeeds:

- **If the TecnoGeoWS viewer's backend turns out to expose a queryable WMS/WFS/REST layer**
  (best case): ~1–2 weeks — 2–3 days for endpoint reverse-engineering/adapter code, 3–5 days for
  OCR/structuring the Fichas Urbanísticas PDF into a zone-parameter table, 2–3 days integration +
  testing against the same pattern already used for Murcia capital (`esMurciaEnvelope.ts`).
- **If it requires negotiating direct municipal GeoServer/WFS access** (more likely for a
  production-grade, ToS-compliant, non-fragile integration): ~4–8 weeks — includes outreach/
  approval lead time (which is the dominant, non-engineering-controllable variable; comparable
  Spanish municipal IT departments typically take 2–6 weeks to respond to a formal data-access
  request), plus the same ~1 week of OCR/structuring and ~1 week of integration once access is
  granted.
- **Ordinance-parameter OCR/extraction work is required in both scenarios** and is the one
  self-contained piece of work that can start immediately, in parallel with either access path,
  since both source PDFs (Normas Urbanísticas, Fichas Urbanísticas) are already downloaded and
  public.

## 7. Sources (live-fetch confirmation status)

| URL | Status |
|---|---|
| `https://urbanismo.molinadesegura.es/idemo/` | Live, fetched — 3 embedded TecnoGeoWS viewers found |
| `https://citymap.tecnogeows.com/user/.../LJJD49MCXfXGyPCJWdcec2` (PGMO viewer) | Live, title-only rendered (SPA — full API not enumerable via static fetch) |
| `https://citymap.tecnogeows.com/geoserver/wms?service=WMS&request=GetCapabilities` | HTTP 404 — ruled out this specific guessed path |
| `contrataciondelestado.es` IDEMO Fase II PPT (2017, doc ID `253339cb-9180-463b-a85f-604e35d6b200`) | Downloaded and read in full (16 pages) — GeoServer/Oracle/QGIS stack confirmed verbatim |
| `https://sedeelectronica.molinadesegura.es/informacion-urbanistica/` | Live, fetched — document archive, no live query tool |
| `https://urbanismo.molinadesegura.es/pgmo/` | Live, fetched — links to Normas/Fichas PDFs and the viewer confirmed |
| Normas Urbanísticas PDF (BORM 2006-07-28) | Downloaded (633.8 KB) — text extraction failed, existence/reachability confirmed |
| Fichas Urbanísticas del Refundido PGMO PDF | Downloaded (3.1 MB) — text extraction failed, existence/reachability confirmed |
| PGMO texto refundido 2013-03-25 vigente | Corroborated via independent web search, not a single primary-source PDF fetch in this pass |
| Modifications 83, 86 (BORM) | Corroborated via independent web search — narrow alignment adjustments confirmed |
| PGMO annulment search | No annulment found; only unrelated 2025 wastewater-sanction TSJ ruling surfaced |

## 8. What remains unverified / explicitly flagged as ASSERTED-NOT-CONFIRMED

- The exact relationship between the internal GeoServer (2017 PPT) and the live TecnoGeoWS public
  viewer (same system evolved, or a separate/parallel deployment).
- Whether the TecnoGeoWS viewer's cadastral search is backed by a standards-based OGC service
  (WMS/WFS) at all, versus a closed proprietary API.
- Exact zone-code → height/FAR/coverage/setback values (the PDFs exist and are reachable, but no
  values were read).
- Whether the 25 March 2013 Pleno approval date for the texto refundido, found via web search
  only, is stated on a primary BORM/municipal source — this pass did not fetch a primary document
  making that specific claim, only search-result summaries referencing it.
