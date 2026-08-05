# Las Torres de Cotillas (INE 30038) — Envelope Engine Capability Research

Date: 2026-08-04
Status: Live-verified (WebFetch/WebSearch/curl), supersedes founder's prior unverified 90/100 estimate.
Municipality: Las Torres de Cotillas, Región de Murcia. `cod_municipio=038`. Population ~22,406 (2024).

## A. Verdict: PARTIAL

Las Torres de Cotillas has a consolidated, non-annulled PGMOU and a genuine parcel-level
zoning digitization exists — but it lives inside a **third-party commercial SaaS
(VisualUrb)**, gated behind authentication/payment, not a free municipal or regional GIS
service. The municipality itself exposes only PDF plan sheets. This is meaningfully
different from Murcia capital (founder-signed rule pack, direct ordinance mapping) and
closer to a "PDF-plan-sheet derivation" case than a "flip a GIS switch" case — with one
extra wrinkle: a paid digitization already exists that could be licensed/scraped-with-
permission rather than built from scratch.

## B. Confidence: 45/100

Justification:
- +confirms: PGMOU consolidated text exists, CARM-approved, no annulment found (unlike
  Cartagena 2012). Zone-code system (UE/UZE at minimum) is confirmed real, not
  founder-inferred.
- +confirms: A genuine parcel-level zoning API exists (VisualUrb, `api-sig.visualurb.es`),
  proving the PGMOU **has** been digitized to parcel granularity by someone — this lowers
  technical risk versus "geometry must be hand-digitized from scratch."
- −reduces: That API returns `401 Unauthorized` on every parcel-level endpoint tested
  (`/Urbanismo/parcela/calificacion`, `/clasificacion`) without credentials; VisualUrb's
  public pricing is a €121/report **manual purchase** product, not a disclosed bulk/dev
  API — commercial licensing terms, cost, and redistribution rights for programmatic
  access are unknown and unverified.
- −reduces: The official regional GIS (SitMurcia/IDERM) could not be independently
  verified for this municipality — the site is behind Radware/perfdrive bot-protection
  (`validate.perfdrive.com` challenge) that blocked all fetch attempts. Per prior
  research in this thread, SitMurcia is self-described reference-only, MTR-5000-digitized
  region-wide; no evidence found that Las Torres de Cotillas is an exception to that
  ceiling.
- −reduces: Could not extract full article text (numeric setback, UE/UZE parameter
  tables) from the technical criteria PDF — it returned as corrupted/non-OCR'd binary to
  the fetch tool; the Art. 203 setback rule and the actual UE/UZE numeric parameters
  remain **unconfirmed**, only the zone-code labels are confirmed.
- The municipal `urbanismo-normativa` page itself has **zero** GIS/viewer/interactive-map
  presence — it is a pure document directory pointing to `sedelectronica.es` (the
  e-government transparency portal), consistent with "PDF plan-sheet only" from the town
  hall's own side.

## C. Implementation pipeline for one real parcel (test refcat: `4605403XH5140N`)

1. **Resolve parcel geometry**: standard Catastro (Sede Electrónica del Catastro / INSPIRE
   WFS) lookup by `refcat` → parcel polygon. Confirmed reachable independent of VisualUrb
   (Catastro is a national open service, already used elsewhere in this research thread).
2. **Resolve zone code** — two paths, neither closed-loop free today:
   a. **VisualUrb path (fastest if licensable)**: `POST
      https://api-sig.visualurb.es/Urbanismo/parcela/calificacion {refcat}` and
      `/clasificacion` return the zone qualification/classification directly keyed by
      cadastral reference. Confirmed to exist and to be wired to muni 30038
      (`GET /urbanismo/municipio/30038` returns `{"codmuni":30038,"nombre":"Torres De
      Cotillas (Las)","bbox":[...]}` with **no auth required** for municipality metadata,
      but parcel-level calls 401 without a session/API key). **Action required**:
      contact VisualUrb commercially to determine if a bulk/API license exists (their
      site advertises an "Especial para Ayuntamientos" tier and per-report retail sales —
      neither is confirmed to include programmatic bulk access).
   b. **PDF-plan-sheet path (guaranteed-free fallback)**: download "Plano de ordenación
      general: Clasificación y usos" and "Plano de ordenación pormenorizada:
      Alineaciones" (georeferenced plan sheets, listed on the PGMOU transparency page —
      `lastorresdecotillas.sedelectronica.es/transparency/a5df3913-...`), georeference
      them (if not already GeoPDF/GeoTIFF — format not yet confirmed), and spatially join
      parcel centroid against zone polygons traced from the sheet. This mirrors the
      "PDF-plan-sheet derivation" pattern already used for other Murcia-region
      municipalities in this research thread where no GIS shortcut existed.
3. **Resolve ordinance parameters for the zone code**: look up the returned code (e.g.
   `UE`, `UZE`) against the consolidated "Normas Urbanísticas" text (linked from the same
   transparency page) for buildability/height/setback parameters. VisualUrb's
   `/urbanismo/parcela/normativa` and `/urbanismo/parcela/datosurbanisticos` endpoints
   suggest the SaaS already resolves code→parameter for you (again, paywalled) — the free
   path requires manual/LLM-assisted extraction from the Normas Urbanísticas PDF, same
   pattern as sibling municipalities.
4. **Apply setback/road rules**: the technical criteria PDF ("CRITERIOS TÉCNICOS PARA LA
   URBANIZACIÓN DE VIALES EN SUELO URBANO ESPECIAL (UE) Y SUELO URBANIZABLE ESPECIAL
   (UZE)") governs road-adjacent urbanization requirements in UE/UZE zones specifically —
   its numeric content could not be extracted by automated fetch in this pass (PDF
   returned as binary/non-OCR'd); needs a dedicated PDF-text-extraction pass (e.g.
   `pdftotext` or OCR) before the Art. 203 setback figure can be cited with confidence.
5. **Check for derived-plan overrides**: any parcel inside a Sector (UZS-AE-1, UZS-AE-3.2,
   UZS-AE-7, UZS-AE-12, etc.) is governed by its own Plan Parcial / reparcelación instead
   of directly by the PGMOU — see section E.

## D. Zone-code system

- Confirmed codes: **UE** (Suelo Urbano Especial / "special urban land") and **UZE**
  (Suelo Urbanizable Especial / "special developable land") — confirmed from the title and
  scope statement of the municipal technical-criteria PDF, which exists specifically to
  regulate road urbanization within UE and UZE zones under the PGMO.
- Additional codes referenced in VisualUrb/plan-modification news items but not yet
  decoded: **UZS-AE-N** ("Unidad/Sector de Suelo Urbanizable Sectorizado — Área de
  Estudio/Ejecución N", appearing as UZS-AE-1, UZS-AE-3.2, UZS-AE-7, UZS-AE-12,
  UZS-AE-1-NS) — these appear to be individual development sectors, i.e. instances of a
  sectorized-urbanizable-land code, not a fixed small enum like R1/R2. A residential
  base-zone enum (equivalent to Murcia capital's R1–R5 style codes) was **not** found in
  this pass — the consolidated Normas Urbanísticas PDF (linked, not yet parsed) is the
  next source to check.
- Rough count: at minimum 2 base land-classification codes (UE, UZE) plus an open-ended
  set of numbered sectors (UZS-AE-*) that are per-sector unique, not a small closed
  ordinance-type enum — likely closer to Cartagena/Lorca's "handful of base classes plus
  many individually-numbered sectors" pattern than to a flat R1–R9 catalogue. Not yet
  precisely countable without parsing the full Normas Urbanísticas.
- The one confirmed GIS layer carrying **geometry only, not parameters directly**: the
  public `catastro-id` vector-tile layer (Mapbox-hosted, `api-sig.visualurb.es/mapurbanismo/
  layer/catastro/{z}/{x}/{y}.mvt`) is parcel outlines only. The actual
  calificación/clasificación **code** requires the separate authenticated `POST
  /Urbanismo/parcela/calificacion` call — i.e. even inside VisualUrb, geometry and code
  are two different calls, and neither call was observed to return numeric ordinance
  parameters directly (a further `/urbanismo/parcela/normativa` and
  `/urbanismo/parcela/datosurbanisticos` call exists for that, also 401-gated).

## E. % delegated to derived plans vs. directly computable from PGMOU

Not preciseley quantifiable from this pass, but directionally: the confirmed active-sector
list (UZS-AE-1, UZS-AE-1-NS, UZS-AE-3.2, UZS-AE-7, UZS-AE-12, plus the "El Perejil"
industrial sector) shows **multiple parts of town are currently mid-Plan-Parcial or
mid-reparcelación** (2024-2025 activity: Plan Parcial UZS.AE-3.2 initial approval Jul 2024;
El Perejil reparcelación initial approval Nov 2024; UZS-AE-12 "innecesariedad de
reparcelación" approved Mar 2025). This indicates a non-trivial share of developable land
(UZE-classified, sectorized suelo urbanizable) is under active derived-plan processing
rather than settled/directly computable — consistent with (though not identical in
magnitude to) the pattern seen in Cartagena and Molina de Segura. Consolidated urban land
(UE zones, already-built city) is more likely directly computable from the PGMOU Normas
Urbanísticas without a derived plan, but this was not independently confirmed parcel-by-
parcel in this pass.

## F. Blockers

1. **GIS — parcel zoning API is commercial and gated (HIGH).** `api-sig.visualurb.es`
   returns 401 on every parcel-level endpoint without credentials. Fix: contact VisualUrb
   for a commercial/bulk license quote, or treat this as informational-only proof that a
   digitization exists and build PRYZM's own by tracing the plan sheets.
2. **GIS — regional GIS unverifiable (MEDIUM).** SitMurcia/IDERM blocked by Radware bot
   protection during this research pass; genuinely unknown whether it has a richer public
   WMS/WFS for this municipality specifically. Fix: retry with a real browser session /
   ask the founder to check manually, since automated fetch is bot-walled, not because
   the data is confirmed absent.
3. **Missing-data — PDF text extraction failed (MEDIUM).** The load-bearing technical
   criteria PDF (Art. 203, UE/UZE setback numbers) returned corrupted/binary to the
   fetch tool, so no numeric setback value is confirmed yet, only the zone-code labels.
   Fix: re-fetch with a dedicated PDF text/OCR pipeline (`pdftotext`, `pdfplumber`, or
   vision-model page-image extraction) rather than the generic web-fetch summarizer.
4. **Planning — derived-plan share unresolved (MEDIUM).** Multiple UZS-AE sectors are
   mid-processing (2024-2025); no PGMOU-wide table of "% land under active derived plan"
   was found or computed. Fix: enumerate all UZS-AE-* sectors from the Fichas
   Urbanísticas document (listed on the transparency portal, not yet opened) and their
   individual approval status.
5. **Legal — Modificación No. 14 scope (LOW-MEDIUM).** Confirmed via VisualUrb news feed:
   initial approval 2024-11-28, purpose stated as "flexibilizar las posibilidades
   edificatorias, sin modificar la edificabilidad" (flexibilize building possibilities
   without changing buildability) — this reads as article-text-only, not
   geometry-changing, consistent with the founder's prior assertion, but this is sourced
   from a third-party news aggregator (VisualUrb), not the BORM publication text itself.
   Fix: pull the actual BORM/edicto text for Modificación 14 to confirm scope before
   relying on it.

## G. Fastest path to production

Reuse the pattern already proven for Murcia capital / Cartagena / Lorca: PGMOU
Normas-Urbanísticas-as-source-of-truth with an ordinance lookup table keyed by zone code,
Catastro for parcel geometry (already integrated elsewhere in PRYZM), and a manually
traced/derived zoning layer where no free GIS exists. Concretely, in priority order:

1. Do **not** wait on VisualUrb licensing — treat it only as confirmation that
   digitization is feasible, and as a manual cross-check tool (buy a handful of €121
   reports for spot-verification of any hand-derived zone boundaries before shipping).
2. Extract and OCR the two plan sheets ("Clasificación y usos" general + "Alineaciones"
   pormenorizada) and the consolidated Normas Urbanísticas PDF from the
   `sedelectronica.es` transparency portal — this is the same manual-derivation pattern
   already built for sibling Murcia municipalities, so the tooling should already exist
   in-repo (check `packages/site-parcel-data` ingestion scripts used for Cartagena/Lorca
   first, before writing new ones).
3. Build the UE/UZE base-zone rule pack first (smallest, best-confirmed scope), defer the
   UZS-AE-* sectorized areas (higher effort, actively changing, needs per-sector
   Plan-Parcial ingestion) to a v2 pass.
4. Re-attempt SitMurcia/IDERM with a non-bot-flagged fetch path (or founder manual check)
   as a cheap parallel task — if it turns out richer than expected for this municipality,
   it could shortcut step 2 entirely.

## Sources (live-fetched this session)

- https://lastorresdecotillas.es/urbanismo-normativa
- https://lastorresdecotillas.sedelectronica.es/transparency/a5df3913-b4bf-4bf8-bdbc-b200dd22f517/
- https://www.visualurb.es/urbanismo-de-las-torres-de-cotillas-murcia-12/
- https://www.visualurb.es/Tag/las-torres-de-cotillas/
- https://www.visualurb.es/informeurbanistico/
- https://map.visualurb.es/urbanismo_torres_de_cotillas_las/muni/30038?refcat=4605403XH5140N
  (redirects to https://sig.visualurb.es/visor?rc=4605403XH5140N)
- https://sig.visualurb.es/assets/index-DaSqO_g3.js (JS bundle — source of API endpoint
  discovery: `Urbanismo/parcela/{bic,calificacion,clasificacion}`,
  `urbanismo/parcela/{normativa,nsmedioambiental,datosurbanisticos,desarrollo}`,
  `MapUrbanismo/layers`, `MapUrbanismo/layer/suelomunicipio/{codmuni}.geojson`,
  `urbanismo/municipio/{codmuni}`; base URL `https://api-sig.visualurb.es`)
- https://api-sig.visualurb.es/urbanismo/municipio/30038 (200, public, confirms muni
  registered)
- https://api-sig.visualurb.es/Urbanismo/parcela/calificacion (401, POST, confirms
  parcel-level endpoint exists but is auth-gated)
- https://api-sig.visualurb.es/Urbanismo/parcela/clasificacion (401, same)
- https://api-sig.visualurb.es/MapUrbanismo/layers (200, public — Catastro parcel vector
  tiles only, no zoning layer)
- https://api-sig.visualurb.es/MapUrbanismo/layer/suelomunicipio/30038.geojson (401)
- https://www.lastorresdecotillas.es/sites/default/files/archivos/content/uploads/2014/03/CRITERIOS-T%C3%89CNICOS-URBANIZACI%C3%93N-EN-UE-y-UZE.pdf
  (fetched, PDF text extraction failed — binary/corrupted to fetch tool)
- https://sitmurcia.carm.es/planeamiento-urbanistico (blocked — Radware/perfdrive bot
  challenge, could not verify content)
- https://lastorresdecotillas.es/robots.txt (200, standard Drupal robots.txt, no
  disallowed API/GIS paths of note)

## Notes on prior founder estimate

The founder's prior 90/100 confidence was made without confirming the parcel-level zoning
**delivery mechanism**, per the task brief. This research found that a delivery mechanism
does exist (VisualUrb) but it is commercial/third-party and gated, not the free municipal
or regional government GIS the founder may have assumed. This is the primary reason
confidence is revised down to 45/100 pending a licensing conversation with VisualUrb and a
successful SitMurcia/IDERM re-check.
