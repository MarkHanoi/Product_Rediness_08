# Alcantarilla (INE 30006, Región de Murcia) — Envelope-Engine Capability Research

Date: 2026-08-04
Status: Independent live-verification pass (prior founder pass was ASSERTED-UNVERIFIED; this pass verifies via WebFetch/WebSearch against live sources)

## A. Verdict: PARTIALLY

Alcantarilla can support a **coarse** envelope engine today via a live, queryable regional WFS
(land-use classes only), but a defensible, zone-code-accurate engine additionally requires a
bounded, one-time **human transcription** of the operative 1983 ordinance's numeric parameters,
because the source PDFs are not machine-fetchable (see D/E). No automated parcel→zone-code
lookup exists. Confidence: High (on the shape of the verdict), Low on completeness of numeric
zone parameters (not independently extracted in this pass).

## B. Operative instrument: PGOU 1983 — CONFIRMED, with an active near-term risk

- **Confirmed operative**: The municipal page
  `https://www.alcantarilla.es/areas/desarrollo-urbano/plan-de-ordenacion-urbana-de-alcantarilla/`
  states plainly that the Plan General de Ordenación Urbana was "aprobado definitivamente en
  1983" and that all "Modificaciones Puntuales" since then amend that 1983 text — i.e., the 1983
  PGOU (approved 21/12/1983, published BORM 12/01/1984) is the current legal baseline. Confidence: **High**.
- **PGMO status is NOT "early draft"** — it is much closer to superseding the 1983 plan than the
  prior founder note characterized. Per Alcantarilla Digital (27 March 2026) and the municipal
  page: the PGMO has been in process since 2002 (initial approval 2006, provisional approval
  2010, blocked 2012, re-exposed 2020), and on **26 March 2026 the municipal Pleno resolved the
  final outstanding allegations and forwarded the complete file to the Consejería de Fomento e
  Infraestructuras (CARM) for definitive/regional approval** — the last procedural gate before
  entry into force. No evidence was found in this pass of that regional definitive approval
  having occurred by 2026-08-04, so the 1983 PGOU remains operative as of this writing.
  Confidence: **Medium-High** — absence of later news is not proof of continued non-approval;
  this should be re-checked (BORM publications) periodically, not treated as settled.
- **Practical implication**: unlike Cartagena's reported competing-plan ambiguity, Alcantarilla
  does have a single currently-operative instrument — but the changeover risk window is now
  measured in months, not years. Any rule pack should be version-flagged against "PGOU-1983,
  pending PGMO CARM approval" and monitored.

## C. Operative 1983 PGOU numeric ordinance values — NOT independently extracted (blocker)

Two source documents were located and confirmed by name/date via the municipal ordinance page
(`https://www.alcantarilla.es/portal-de-transparencia/normativa-de-aplicacion/ordenanzas/`):

1. **Normas Urbanísticas PGOU 1983**
2. **Ordenanza Municipal sobre Edificación y Uso del Suelo, AD 21/12/83** (plus a 22/06/1989 amendment)

Both are hosted exclusively as `aytoalc.sharepoint.com` "anyone with the link" share URLs. **Every
attempt to fetch these (multiple distinct share links, multiple `e=` query variants) returned
HTTP 403 Forbidden** to automated fetch — this is a genuine, reproducible technical blocker, not
a failed search. No independent mirror, BORM full-text reproduction, or secondary source quoting
the 1983 text's actual zone-by-zone numbers (height/edificabilidad/coverage/setback/fondo
edificable) was found via web search either. The zoning-plan PDFs (5.2–5.9), alignment plans
(6.1–6.8), the height plan (7.3), and the "fichas urbanísticas" are likewise all SharePoint-hosted
and equally unfetchable by this method.

**Consequence**: Deliverable C cannot be completed with a verified citation in this pass. The
draft PGMO's numeric example cited by the founder (depth 18 m, FAR 1.0, coverage 90%) must
continue to be treated as **not applicable** to the operative 1983 plan — it is unproven whether
those values resemble the 1983 ordinance at all. Confidence: **Low** (document existence/date:
High; numeric content: unverified).

## D. Blockers

- **Technical**: SharePoint anonymous-share links for all primary planning-law source documents
  return HTTP 403 to non-browser/bot fetch. A human must open them in an authenticated browser
  session and transcribe or re-host the content before any rule-pack authoring can cite the
  operative text. Separately, the regional planning-sheet ("ficha") viewer
  (`urbmurcia.carm.es/urbmurcia/sitmurcia/potgisfichacen.jsp`) is JS-rendered and returns only a
  page shell to non-JS fetch — would need a headless-browser pass to read.
- **Legal**: PGMO is one regional-approval step from superseding the 1983 PGOU (see B). Any rule
  pack built now needs an explicit "supersession watch" rather than being treated as stable for
  years, unlike municipalities where the successor plan is still early in process.
- **Data**: The only confirmed live GIS layer (SITMurcia/IDERM WFS, see E) returns HILUCS-level
  generalized land use (`ResidentialUse`, `OpenAirRecreationalAreas`, etc.), not the fine
  zone-code granularity (e.g., a specific "Zona B-3") that carries numeric ordinance values. CARM's
  own dataset metadata states Alcantarilla's source was originally **paper-format**, requiring
  digitization/georeferencing at **1:5000 (MTR-5000)** scale, and that "the information offered
  has an informational character and will not be binding" — the same ceiling already documented
  for the region generally (per prior Murcia regional audit / IDERM PLU note in memory). Confidence: **High**.
- **Engineering**: No automated parcel-to-zone-code API exists. The only parcel-specific
  instrument is the manual, paid **"Cédula/Certificado Urbanístico"** (~€43.80/parcel per the
  regional fee schedule pattern, filed via `alcantarilla.sedipualba.es` e-office, human-processed,
  no stated SLA) — unusable as a live lookup for an automated engine.

## E. Fastest implementation path

1. **Bootstrap coarse land-use geometry immediately from the already-live regional WFS** — no
   vectorization needed for this layer:
   - Service: `https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/ows` (WFS 2.0.0; also
     WMS at the same base path)
   - Layer: `sitmurcia_plu_ze` (zoning elements, HILUCS-classified)
   - Verified live query: `...&REQUEST=GetFeature&TYPENAMES=sitmurcia_plu_ze&CQL_FILTER=Municipio='Alcantarilla'&OUTPUTFORMAT=application/json`
     returned **100 real MultiPolygon features** for Alcantarilla (residential vs. open-space
     classes, areas 581–26,009 m², `plan` attribute `es.carm.sitmurcia.pgalca.plu.sp:0030005`,
     dated to 1984 — consistent with the 1983 PGOU's BORM publication date). This is genuinely
     usable, queryable, real geometry today. Confidence: **High** (directly queried and confirmed
     in this pass).
   - Caveat: this layer alone cannot carry per-zone numeric envelope parameters (see D-Data);
     it only tells you broad land use, not height/FAR/setback.
2. **In parallel, a human (not an automated agent) must open the two SharePoint documents** —
   Normas Urbanísticas PGOU 1983 and Ordenanza Municipal AD 21/12/83 — extract the per-zone
   numeric table for the small number of named zones referenced across plans 5.2–5.9, and
   transcribe it into the rule pack, mirroring however this was already done for Murcia capital's
   `esMurciaEnvelope.ts`. This is a bounded, one-time task blocked only by tooling (browser vs.
   bot), not by absence of the source.
3. Join step 2's numeric table to step 1's WFS polygons by land-use class / municipal zoning-plan
   reference; fall back to the coarse WFS classification alone (with an explicit
   "un-verified-zone-code, informational-only" flag) for any parcel where the fine zone cannot be
   confidently resolved — consistent with the platform's existing UNKNOWN-constraint-is-not-zero
   discipline (see `envelope-solid-overstates-partial-data` in engineering memory).
4. **No full vectorization of the published zoning PDF atlas (5.2–5.9, 7.3) is required** to reach
   a first coarse operational state, because the WFS already supplies real geometry; vectorization
   would only become necessary later if sub-zone precision beyond HILUCS classes proves required
   and the ordinance-to-parcel join in step 3 is insufficient.

## F. Confidence summary

| Conclusion | Confidence |
|---|---|
| Overall verdict: PARTIALLY | High |
| 1983 PGOU is the currently operative instrument | High |
| PGMO not yet definitively (regionally) approved as of 2026-08-04 | Medium-High (last confirmed data point: 26 Mar 2026; not re-checked past that) |
| A live public GIS service exists exposing real Alcantarilla zoning geometry (SITMurcia/IDERM WFS) | High (directly queried, live GeoJSON confirmed) |
| That GIS service is reference-only, non-binding, and HILUCS-coarse (same ceiling as the region generally) | High (explicit in CARM's own dataset metadata) |
| No Alcantarilla-specific municipal ArcGIS/GeoServer or automated parcel-lookup exists | Medium (absence-of-evidence from site review, robots.txt, and search; cannot fully rule out an undiscovered internal tool) |
| Operative 1983 ordinance's actual numeric zone parameters (height/FAR/coverage/setback) | Low — document identified and dated but content not independently extracted (SharePoint 403 blocker) |
