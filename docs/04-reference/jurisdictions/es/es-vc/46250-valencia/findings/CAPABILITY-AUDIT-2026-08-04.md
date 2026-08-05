# CAPABILITY AUDIT — València (INE 46250) — 2026-08-04

> Independent capability audit, not an implementation task. This file re-derives its conclusions
> from primary sources fetched live on 2026-08-04, and cross-checks them against the extensive
> prior research already in this repo (`CLOSURE-REGISTER.md`, `NEXT.md`, `esValenciaEnvelope.ts`,
> `esValenciaPgou.ts`, `resolveValenciaOrigen.ts`). Where this audit's live probes agree with the
> prior record, that is noted as independent corroboration, not copied as fact. No code was
> written or changed to produce this document.

---

## Executive Summary

PRYZM cannot today, and cannot for the foreseeable future without external action, produce a
legally-defensible buildable envelope (height/depth/FAR) for any parcel in the city of València.
The parcel-identification and zoning-classification halves of the pipeline are live, keyless, and
well-evidenced (Catastro INSPIRE for cadastral identity; `geoportal.valencia.es` ArcGIS REST for
zoning `califi`/`tipoca`/`origen`), and this audit independently re-confirmed the two ArcGIS layers
central to the case (`MapServer/212` "PGOU - Alineaciones", `MapServer/231` "PGOU -
Calificaciones") are live, unauthenticated, and exactly as documented in the existing repo record.
The central open question — what the `altura` field on layer 212 means — was re-probed live today
via the ArcGIS layer JSON, the ISO metadata endpoint, and the `datos.gob.es` federated catalogue
entry, and **none of the three sources defines it beyond the tautological alias "Altura"/"Altura
del PGOU."** This independently corroborates the prior finding rather than resolving it: the field
is documented to exist, its type (15-character string) and that it derives from "the PGOU," but
never its unit or its offset convention relative to the plan text's "número de plantas grafiado en
el Plano C." The prior empirical test in this repo (n=105, `altura` vs. OpenStreetMap
`building:levels`, median ratio 0.78, `altura` below built storeys on 81% of sampled buildings,
modally by two) remains the strongest evidence in existence on this question, and this audit found
no additional primary source — official or otherwise — that resolves it. Plano C itself was
re-confirmed absent from the municipality's entire public GIS catalogue as a downloadable vector or
raster dataset; the depth question is closed by a different, non-`altura` route (the alignment
polygon geometry itself, per founder decision), which this audit finds is soundly reasoned but is
itself an inference from geometry, not a document. Beyond the ordinance question, this audit newly
verified that a genuine PATRICOVA flood-hazard WMS/shapefile distribution exists and is
machine-readable, and that a public heritage catalogue layer (`MapServer/321`, "Catálogo Rural
Líneas," carrying `nivel_prot`) is live and unauthenticated even though the wider `Patrimonio_
Historico` folder remains token-gated. València is, in the framing this repo has adopted, a city
that can reach a 100%-terminal, evidence-cited answer for every parcel today (a refusal, correctly
reasoned) but a 0%-computed one, and this audit did not find grounds to move that number.

## Capability: **Research Blocked**

Not Engineering Blocked: the parcel and zoning pipeline exists and could be wired for production
today. Not Legally Blocked in the sense of a prohibition — nothing forbids PRYZM from computing an
envelope; the problem is that the ordinance's own operative language defines every
envelope-determining number as a value on a drawing sheet PRYZM does not hold, and the one
candidate proxy field is empirically two-sided (both under- and over-states relative to built
stock), which this repo's own doctrine (ADR-0287, correctly applied here in this audit's
independent judgment) treats as unshippable. It is not Impossible Today in an absolute sense —
one written municipal answer would very plausibly unlock ~52.6% of buildable land on the evidence
already gathered — but nothing PRYZM can do internally, no further GIS mining, OCR run, or
heuristic, gets there. The correct label is **Research Blocked**: the blocking artifact is a
missing external fact (an authoritative field definition), not a missing internal capability.

## Evidence Matrix

| # | Research Area | Status | Evidence | Verified live 2026-08-04 |
|---|---|---|---|---|
| 1 | PGOU 1991 Normas Urbanísticas text | Digitized, born-digital PDF | `valencia.es` "10. Normas Urbanísticas. (Transcripción).pdf" — 435,440 B, no "sin valor normativo" disclaimer found in prior sweep | Not re-fetched this pass; relied on prior record (`CLOSURE-REGISTER.md` row 5) |
| 1b | GVA Registro Autonómico deposit `46250-1001 1991-0010` | Image-only scan, 0 extractable chars | 11.8 MB PDF, `pdftotext` → 0 characters (prior record) | Not re-fetched; relied on prior record |
| 1c | Plano C (storey/depth graphic sheet) | **Not found as data anywhere in the public catalogue** — RESOLVED negative | Prior 696-layer, 67-service sweep found zero `profundidad`/`edificabilidad`/`ocupación`/`retranqueo`/"número de plantas" field; a decoy service (`Tools/FichaUrbanismo/MapServer` layers 2 & 7, "(TEXTOS)") re-publishes the *same* `PGOU_AL` table as layer 212, not an independent annotation layer | Corroborated: this audit found no contrary evidence; no vector/raster Plano C distribution exists on `datos.gob.es`, `geoportal.valencia.es`, or `mediambient.gva.es` |
| 2 | Zoning geometry, `MapServer/231` ("PGOU - Calificaciones") | **Live, unauthenticated** | `?f=json` → fields `clase` (str, 6), `califi` (str, 4), `tipoca` (str, 4), `origen` (str, 10); polygon geometry | **Fetched live 2026-08-04**, fields confirmed exactly as prior record states |
| 2b | `altura` field, `MapServer/212` ("PGOU - Alineaciones") | **Undocumented beyond a tautological alias** — the central open question | Layer JSON: `esriFieldTypeString`, alias "Altura", length 15, no domain. ISO metadata (`/212/metadata`): abstract only describes the layer as "alignments," no field dictionary, contact `datosabiertos@valencia.es`. `datos.gob.es` federated catalogue (publisher `L01462508`): distribution list (GeoJSON/JSON/HTML/PBF/KMZ query URLs), **no field-level data dictionary for "altura" present on the page** | **Fetched live 2026-08-04, all three sources** — none defines the field's unit or offset convention |
| 2c | `altura` semantics test (metres vs. storeys) | Storeys, refuted metres 4× | `altura`/OSM `building:levels` median ratio 0.78 (metres hypothesis predicts ≈3.0), n=105 (prior record, `esValenciaEnvelope.ts` lines 280–296) | Not independently re-run this pass (would require a fresh OSM pairing); the method is sound and reproducible, and no new evidence contradicts it |
| 2d | `altura` offset convention (Np vs. graphed count) | **UNRESOLVED — the single release gate** | `altura` sits BELOW built storey count on 81% of 105 sampled buildings, modally by 2, spread −13…+7; only 33% agree within ±1 (prior record) | Not independently re-run; this audit found no additional source (official communication, updated dataset, or GVA planning-office publication) that answers it |
| 3 | Parcel geometry | Live, Catastro INSPIRE, national | `<cp>46</cp><cm>250</cm>` → INE 46250 composed live; municipal parcel layer 216 independently republishes `refcat` | Corroborated via code read (`valenciaBbox.ts`), not independently re-fetched |
| 4 | Envelope parameters (height/storey, FAR, occupancy, setbacks, depth, alignment) | Depth: resolved via geometry (non-`altura` route). Height: blocked. FAR: not stated in ordinance text read to date. Setbacks: Art. 6.18.2 forbids retranqueo from the exterior alignment (stated, not blocked) | See `esValenciaEnvelope.ts` `VALENCIA_MOVEMENT_GEOMETRY_DECISION`, `VALENCIA_ALTURA_SEMANTICS_2026_08_02` | Not independently re-derived; this audit finds the depth-via-geometry reasoning legally plausible but notes it rests on 4 sampled points cited as "consistent with," not a documented rule, and remains an inference from the founder, not a municipal statement |
| 5 | Heritage (BIC/BRL, Ciutat Vella) | **Partially machine-readable** | `MapServer/321` "Catálogo Rural Líneas" — public, unauthenticated, fields include `nivel_prot`, `fecha_decl`, `categoria`, `clase='BIC'/'BRL'` — **verified live 2026-08-04**. Wider `Patrimonio_Historico` and `Vivienda` folders return `{"error":{"code":499,"message":"Token Required"}}` (prior record; not re-probed this pass but consistent with a stable, long-lived gate) | Partially verified live |
| 6 | Flood (PATRICOVA) | **Machine-readable, live** | `datos.gob.es` dataset `a10002983` (PATRICOVA Peligrosidad por Inundación) lists a live WMS `GetCapabilities` endpoint (`carto.icv.gva.es/.../MapServer/WmsServer`), a direct Shapefile download endpoint (`descargas.icv.gva.es/server_api/gdb/descarga/...`), and a data-dictionary PDF | **Verified live 2026-08-04** via `datos.gob.es` distribution list. WMS endpoint itself not hit directly (DNS/network probe of `cartoweb.cma.gva.es` failed from this environment; `carto.icv.gva.es` URL not independently pinged) |
| 7 | Airport (Manises/LEVC) limitation surfaces | Interactive map exists at AESA; a KMZ/GIS export pattern exists for at least one other Spanish airport per this repo's own memory (Barcelona) | AESA "mapa de servidumbres aeronáuticas" interactive map, `seguridadaerea.gob.es`; a `datos.gob.es` entry titled "Servidumbres aeronáuticas del aeropuerto" (publisher `L01200697`, generic — not confirmed LEVC-specific) exists | **Not independently confirmed for LEVC specifically** — this audit located the AESA interactive-map tool and a generic servidumbres dataset listing but did not confirm a downloadable, LEVC-scoped GIS layer live; treat as unresolved this pass, follow-up needed |
| 8 | Environmental (Natura 2000 / Albufera park boundary) | **Machine-readable WMS exists** | `habitatge.gva.es/estatico/areas/SIG/wms/epn_swf.htm` documents a WMS server for protected spaces (`cartoweb.cma.gva.es/arcgis/services/espacios_protegidos/MapServer/WMSServer`) covering Natural Parks, ZEC, LIC, ZEPA, wetlands, PORN plans, explicitly including l'Albufera | Endpoint **named live** via search of the GVA habitatge/SIG documentation page; direct `GetCapabilities` fetch **failed (DNS: `getaddrinfo ENOTFOUND cartoweb.cma.gva.es`)** from this environment — endpoint existence is documented but not independently pinged successfully this pass |
| 9 | Legal delegation (`origen` share) | **36.40% of private buildable land** (L-656 denominator: `clase='SU'` ∧ Art. 6.3.1's six zones, 1,874.9 ha) governed by a derived instrument, not the PGOU directly | Prior measurement over the full `MapServer/231.origen` column (21,210 polygons, client-side shoelace area, EPSG:25830); breakdown by instrument family given (`PE` 14.94%, `RI` 7.10%, `MP` 6.38%, etc.) | Corroborated field-level (this audit independently confirmed `origen` exists as a string(10) field on layer 231 live 2026-08-04); the area measurement itself not independently re-run |
| 10 | Dispatch feasibility | Parcel→zone resolves automatically today (`resolveValenciaOrigen` reads `origen`/`califi`/`tipoca`/`clase` live per point); envelope step is gated shut by design (`VALENCIA_ENVELOPE_VERIFIED = false`, not a hand-set flag but derived from `valenciaAlturaRouteBlockers()`) | Code read directly (`resolveValenciaOrigen.ts`, `esValenciaEnvelope.ts`) | Verified by direct code inspection, not a live dispatch test |

## Machine-readable assets — every verified endpoint

- `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/212?f=json` — PGOU Alineaciones, live, unauthenticated. **Verified 2026-08-04.**
- `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/212/metadata` — ISO metadata, HTTP 200. **Verified 2026-08-04.**
- `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/231?f=json` — PGOU Calificaciones, live, unauthenticated. **Verified 2026-08-04.**
- `https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/321?f=json` — Catálogo Rural Líneas (BIC/BRL heritage), live, unauthenticated. **Verified 2026-08-04.**
- `https://datos.gob.es/...l01462508-pgou-alineaciones` — federated catalogue entry, distribution list (GeoJSON/JSON/HTML/PBF/KMZ query URLs). **Verified 2026-08-04.**
- `https://datos.gob.es/...a10002983-patricova-peligrosidad-por-inundacion...` — PATRICOVA flood hazard, WMS `GetCapabilities` + direct Shapefile download URL listed. **Verified 2026-08-04** (dataset page content only; WMS itself not independently pinged).
- `http://carto.icv.gva.es/arcgis/services/tm_infraestructuras/ordenacion_territorial/MapServer/WmsServer` — PATRICOVA WMS, per `datos.gob.es`. Not independently pinged this pass.
- `http://descargas.icv.gva.es/server_api/gdb/descarga/...` — PATRICOVA direct shapefile download. Not independently pinged this pass.
- `http://cartoweb.cma.gva.es/arcgis/services/espacios_protegidos/MapServer/WMSServer` — Natura 2000 / Albufera / PORN WMS, per `habitatge.gva.es` documentation. **DNS failure on live fetch this pass** — documented but not confirmed reachable from this environment.
- Catastro OVC INSPIRE services (national) — cadastral reference + boundary, per prior record; not re-fetched.
- `MapServer/216` — municipal parcel layer publishing `refcat` independently of Catastro, per prior record; not re-fetched.

## Missing assets

- **Plano C** as any machine-readable format (vector, georeferenced raster, DWG). Confirmed absent from the entire public REST catalogue in the prior 696-layer sweep; this audit found no contrary evidence and no new distribution.
- A field-level data dictionary for `altura` (layer 212) from any source — ArcGIS layer metadata, ISO metadata, or `datos.gob.es` — all three checked live this pass, none exists.
- Any authoritative statement of the `altura` offset convention (graphed count vs. Np = count−1).
- `edificabilidad`/FAR figures as a queryable attribute anywhere in the swept catalogue (per prior record).
- An LEVC-specific, downloadable aeronautical servitude GIS layer — an interactive map and a generic dataset title exist; a confirmed downloadable geometry for this specific airport was not established this pass.
- Direct confirmation that the PATRICOVA and `espacios_protegidos` WMS endpoints resolve and respond (both documented via secondary pages; direct `GetCapabilities` calls either not attempted or DNS-failed from this environment).
- Credentialed access to `Patrimonio_Historico`/`Vivienda` folders (499 Token Required), which would be needed for a complete, rather than partial, heritage picture beyond the public BIC/BRL catalogue layer.

## Blockers

- **Legal / External authority (the central blocker).** The `altura` field's offset convention is undocumented by the publisher and cannot be inferred safely — the measured error is two-sided (under-states 81% of the time, over-states the rest), so no conservative reading exists. This is not GIS-solvable and not OCR-solvable; it requires a municipal or Generalitat written answer. Category: External authority per this repo's own `BLOCKER-CLASSIFICATION-STANDARD.md`.
- **Legal / External authority (secondary, gating deployment not engineering).** Heritage folders are token-gated (499); PRYZM cannot positively clear a parcel of heritage protection, only positively confirm it applies via the public BIC/BRL layer. This blocks shipping any envelope, independent of `altura`, until either credentials are obtained or every parcel is refused where heritage cannot be cleared.
- **Legal / Data acquisition (bounded, cheap).** Three PGOU zone chapters (CHP, TER, IND — together ~20.6% of buildable land, but only ~3.35 pp of it PGOU-ordered) remain unread; reading them does not by itself produce a computable envelope (they route to Plano C too), so this buys classification completeness, not coverage.
- **Legal / Data acquisition (bounded).** UFA setback articles (6.36/6.37/6.39/6.40) unread, gating 5.87 pp of buildable land jointly with `altura`.
- **Engineering (small, non-blocking on the envelope question).** The live `origen` per-parcel read exists in code (`resolveValenciaOrigen.ts`) but this audit did not verify it is wired into the production dispatch path end-to-end; if not, ~36.4% of the city is receiving a weaker coverage refusal than it is legally entitled to, which is a correctness gap, not a blocker on the 0% envelope score.
- **Provenance risk (low severity, flagged not blocking).** The PGOU text quoted throughout this repo derives from a `valencia.es`-hosted "(Transcripción)" PDF, not the GVA Registro Autonómico's registered deposit, which is an unreadable image scan. Until OCR'd and cross-checked, there is a small residual risk that the transcription differs from the registered instrument in some article. This does not block the `altura` question (which is orthogonal) but should be resolved before any envelope figure, once unblocked, is published as legally authoritative.

## Estimated Unlock Effort: **Small (for the `altura` question) / Very Large (for Plano C as a full alternative route)**

Per this repo's own cost accounting, which this audit finds credible: obtaining a written municipal
answer to the four-part R5 question is "one email and a reply" in effort, but its timeline is
external and not under PRYZM's control (weeks, per the statutory Ley 19/2013 access-to-information
channel, which obliges a response within one month once formally filed). Internal engineering
effort to consume that answer, once given, is estimated at 2-3 days (parser + envelope emission for
ENS/EDA). Obtaining Plano C itself as an independent, full-coverage route is a separate, much larger
and non-automatable undertaking (an institutional/archival acquisition with no timeline), and is not
the recommended path given the `altura` route's much better cost/prize ratio (~52.6% of buildable
land vs. Plano C's ceiling of 63.6%, for a fraction of the effort).

## Recommendation: **Research first / Wait for external source**

Do not build the `altura`-to-envelope parser or any envelope-emission logic before the municipal
answer arrives — this repo's own architecture already reflects this correctly (the parser and
validation logic are built ahead of the missing authority, not around it, per its own account, which
this audit did not find reason to dispute). The highest-leverage action available is to file the
statutory information request (Ley 19/2013) in parallel with the informal email to
`datosabiertos@valencia.es`, since the statutory channel is the only one with an enforceable
deadline. Independently useful, lower-priority work exists (the `origen` dispatch wiring
verification, the three unread zone chapters, the LEVC airport servitude confirmation, and pinging
the PATRICOVA/Natura-2000 WMS endpoints directly to confirm live reachability) and can proceed in
parallel without any risk of shipping a wrong number, because none of it touches the envelope
figure.

## PRYZM Readiness Score: **18 / 100**

Scored against the C63-style seven-axis frame this repo already uses for València (per
`valencia.measurements.json`, not independently re-derived by this audit): PARCEL ~99%, DATA-SOURCES
~90%, CONTEXT ~89%, LEGISLATION ~50%, TERRAIN ~50%, HEIGHTS ~0.16%, ENVELOPE 0%. This audit assigns
its overall readiness score around the low end of that composite, weighting ENVELOPE and HEIGHTS —
the two axes that determine whether a user-facing buildable figure can be produced — most heavily,
since parcel identification and zoning classification without a buildable number is not, on its
own, a product-ready capability for a BIM/site-feasibility tool. The score reflects a city with
excellent infrastructure and evidentiary discipline around what it cannot yet say, but zero ability
to say the one thing (how much can be built) that is the point of the exercise.

## Compare against: Barcelona, Murcia, Balears, Zaragoza, Sevilla, Granada, Córdoba, Málaga

This audit did not re-verify each comparator city's status live; the comparison below is drawn from
this repo's own memory/tracker record and should be treated as secondhand relative to the live work
above.

- **Barcelona** — furthest along of the set; envelope computation working for a meaningful share of
  the city, cited refusals for the rest (clau 18 and similar), context/terrain/3D pipeline reported
  end-to-end sound. València's zoning-service architecture (single ArcGIS layer carrying
  `califi`/`tipoca`/`origen` together) is arguably *cleaner* than Barcelona's, but Barcelona has an
  actual computable envelope on much of its land, which València does not have at all.
- **Murcia** — ~67% of buildable land delegated to derived instruments (vs. València's measured
  36.4%), computed envelope exists on a real (if partial) share, ENVELOPE axis measured at 9.4%
  through the same C63 machinery — i.e., not zero, unlike València.
  Murcia is the direct architectural template `resolveValenciaOrigen.ts` and
  `valenciaDerivedPlanRefusal` were built to mirror.
  **València's ENVELOPE axis (0%) is meaningfully behind Murcia's (9.4%), despite a technically
  cleaner data source, purely because of the `altura` semantic block.**
- **Córdoba** — reported (memory) as a "signed gate, zero dispatcher compute branch" milestone,
  suggesting further along on the verification/dispatch axis than València, though the comparison
  is not apples-to-apples without a fresh audit of Córdoba.
- **Balears, Zaragoza, Sevilla, Granada, Málaga** — not independently assessed by this audit;
  per this repo's tracker, several of these have had recent, real primary-source progress
  (Málaga real parameter data, Zaragoza/other cross-regional depth-vocabulary work referenced in
  memory), but none were re-verified here and no live comparison claim is made.

**València's distinguishing feature in this set is not weak infrastructure — it is the sharpest,
most completely evidenced example of a city blocked by a single external semantic fact rather than
by missing engineering or missing legal research.** Every other blocker on its own closure register
has either already closed or is bounded, cheap, internal work.

## Final verdict + single biggest blocker

**Verdict:** València should not be shipped with any computed buildable figure today, and the
correct interim product is exactly what this repo already implements: a 100%-terminal, per-parcel,
cited refusal (either the stronger `derived-plan` refusal where `origen` names a non-PGOU
instrument, or the general `no-rule-pack` refusal elsewhere), never a guessed number.

**Single biggest blocker, explicitly:** it is the `altura` semantic question, and this audit's live
re-probe of all three plausible documentation sources (ArcGIS layer metadata, ISO service metadata,
and the `datos.gob.es` federated catalogue) found nothing that resolves it — corroborating rather
than superseding the prior finding. It is a genuinely narrow, well-scoped blocker (one field, one
offset convention) rather than a diffuse one, and the empirical case that it cannot be guessed
around (the two-sided error measured against OpenStreetMap building counts) is sound. Nothing this
audit found suggests a more fundamental problem sitting underneath it — the depth question, the
parcel/zone identification, the legal-delegation share, and the heritage-disposition logic are all
independently well-evidenced and none of them is the long pole. The long pole is entirely external:
a municipality that has published a field without ever stating what it means.

---
*Audit conducted 2026-08-04. Live sources fetched this pass: `MapServer/212?f=json`,
`MapServer/212/metadata`, `MapServer/231?f=json`, `MapServer/321?f=json`, `datos.gob.es` catalogue
entries for `l01462508-pgou-alineaciones` and PATRICOVA (`a10002983`), plus web search verification
of PATRICOVA, AESA servidumbres, and Natura 2000/Albufera WMS endpoint existence. One endpoint
(`cartoweb.cma.gva.es`) failed DNS resolution from this environment and its live reachability is
unconfirmed — this is noted, not concealed. No code was written, modified, or executed as part of
this audit. Cross-references: `../CLOSURE-REGISTER.md`, `../NEXT.md`, `../RISK-REGISTER.md`,
`packages/site-parcel-data/src/rulepacks/esValenciaEnvelope.ts`,
`packages/site-parcel-data/src/providers/resolveValenciaOrigen.ts`,
`packages/site-parcel-data/src/providers/valenciaBbox.ts`.*
