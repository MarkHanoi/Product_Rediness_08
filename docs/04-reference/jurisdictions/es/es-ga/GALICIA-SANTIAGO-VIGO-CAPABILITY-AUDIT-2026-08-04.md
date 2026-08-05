# Galicia — Santiago de Compostela (15078) & Vigo (36057): Capability Audit

Date: 2026-08-04. Scope: can PRYZM produce a legally-defensible buildable envelope for a parcel in
Santiago de Compostela or Vigo today. This is a fresh, live, municipal-level audit — it does not
repeat the regional-level SIOTUGA/NNTTPP groundwork already logged in
`ES-ALL-REGIONS-STATUS.md` §4.5 and `SPAIN-ZONING-LIVE-VERIFICATION-2026-07-20.md` §2.7; it
verifies, extends, and in one place corrects that prior work.

## Executive Summary

Neither city can be dispatched to an envelope solver today, but the two cities are in materially
different positions. Vigo just replaced its 2008 plan with a definitively-approved 2025 PGOM
(in force since 27 Aug 2025) published as a structured, navigable document tree with per-file PDF
normativa (ordinances U1–U9 with explicit height/edificabilidad/occupancy language visible in
public search snippets) and a dedicated ArcGIS Instant-App viewer — the richest raw material of
any Galician municipality checked so far, but none of it is confirmed to be machine-queryable
(no REST/WFS endpoint for the zoning geometry was found live). Santiago de Compostela runs on a
2007/2009-vintage PXOM whose historic centre (169.9 ha, UNESCO 1985) is further governed by a
separate 1997 Plan Especial (PE-1/PEPRI) that the base PXOM cannot answer buildability for at all
— and the municipal PXOM PDF host (`santiagodecompostela.gal`, non-www and www) refused every
connection attempt during this audit (`ECONNREFUSED`), so its native-text-vs-scan status is
UNVERIFIED, not confirmed either way. The regional SIOTUGA/IDEG classification service was
re-verified live and re-confirmed parameter-free — but a new, more precise finding this pass:
the specific `POL_AD_PlaneamientoUrbanistico` MapServer is scoped to the **Plan de Ordenación do
Litoral (POL)**, i.e. only the coastal/rustic-land strip, not full municipal zoning. It returned
zero features for landlocked-relevant query on Santiago (15078, non-coastal) and only 4
rustic-land features for Vigo (36057, coastal) — none urban, none carrying a buildability
parameter. Catastro parcel geometry is presumed standard-national (Galicia is not one of the two
excluded provinces group) but was not independently re-fetched this pass. AESA aeronautical
servitudes cover both LEST (Santiago) and LEVX (Vigo) nationally, and Vigo specifically holds an
AESA *exemption* (≤45 m, exempt zones only) that is itself evidence a real GIS/rule exists but
was not resolved to a fetchable KMZ/WMS endpoint in this session. Flood (SNCZI) and Natura 2000/
national-park layers are asserted by their hosting ministries to have national WMS coverage but
neither was hit with a live GetCapabilities call this pass — both counted below as unverified,
not confirmed.

## Capability: **Research Blocked**

Reasoning: this is not simply "Engineering Blocked" (a known gap with a known fix) because the
single highest-value asset found — Vigo's brand-new 2025 PGOM document tree and ArcGIS viewer —
has not been resolved to a queryable geometry+attribute endpoint, and Santiago's core planning
host could not be reached at all in this session (a genuine unknown, not a confirmed absence).
Before any engineering estimate is credible, someone needs to (a) get inside the Vigo ArcGIS
Instant App to find its underlying Feature/MapServer URL, (b) successfully reach
`santiagodecompostela.gal` planning pages from a different network/agent to determine PXOM format,
and (c) resolve the PE-1/PEPRI heritage-zone GIS question for Santiago's historic centre. Until
those three research gaps close, "Engineering Blocked" would overstate what is known and
"Legally Blocked" would understate it — the legal path (public planning instruments exist and are
approved) is intact; it is the *data-access* path that is unresolved.

## Evidence Matrix

| Research area | Santiago de Compostela finding | Vigo finding | Source URL | Confidence |
|---|---|---|---|---|
| Planning doc format | PXOM approved 2007-10-03 (SIOTUGA record), in-force notice 2009 (BOP). Host `santiagodecompostela.gal` (both http/https, apex and www) returned `ECONNREFUSED` on every fetch attempt — format (native text vs scan) **unverified this session** | PGOM revision definitively approved 2025-05-26 (Concello pleno), published DOG 30-06-2025, entered force 27-08-2025. Structured doc tree at `xmu.vigo.org/docs/PXOM_2025/…` incl. `07_NU/36057_PXOM_202502_AD01_NU_01NU_cas.pdf` (normativa) — WebFetch could not decode the PDF's compressed text streams (tool limitation, not proof of scan); WebSearch snippet-indexing of the same PDF surfaced literal ordinance names ("Ordenanza U1 Mantenimiento de la edificación existente", "U2 Manzana Cerrada"…U9), which is only possible if the PDF is text-indexable — treat as **probable native text, not fully confirmed** | santiagodecompostela: `https://siotuga.xunta.gal/siotuga/urb` (search result), `http://santiagodecompostela.gal/medi/Urbanismo/pxom2008/INDICE_XERAL_PXOM.pdf` (unreachable). Vigo: `https://hoxe.vigo.org/movemonos/urbanismo_pxom_2025.php?lang=cas`, `https://xmu.vigo.org/docs/PXOM_2025/PXOM_2025/07_NU/36057_PXOM_202502_AD01_NU_01NU_cas.pdf`, `https://www.xunta.gal/dog/Publicados/2025/20250630/AnuncioL257-090625-0001_es.html` | Medium (Vigo); Low (Santiago — host unreachable) |
| Zoning geometry — municipal GIS | No municipal ArcGIS/WFS/WMS found for Santiago specifically in this session | Dedicated ArcGIS Instant App viewer live: `vigo.maps.arcgis.com/apps/instant/sidebar/index.html?appid=38cd806cdb1e48b08d4a1d3c75d70b28`. WebFetch could only see the app shell ("Sidebar"), not the underlying Feature/MapServer REST URL (JS-rendered app, not resolvable via WebFetch). A separate `mapas.vigo.org` "Open Data" portal exists but returned only its title on fetch, and a `portal/apps/sites/#/inicio` guess 404'd | `https://vigo.maps.arcgis.com/apps/instant/sidebar/index.html?appid=38cd806cdb1e48b08d4a1d3c75d70b28`; `https://mapas.vigo.org/` | Low-Medium — asset exists, endpoint not resolved |
| Zoning geometry — regional (SIOTUGA/IDEG) re-verify | `POL_AD_PlaneamientoUrbanistico` MapServer confirmed live (ArcGIS 10.91, 30 layers, EPSG 25829). Layer 29 (`IURB_V9`) query `CODINE=15078` returned **0 features** | Same MapServer, layer 29 query `CODINE=36057` returned **4 features**, all non-urban rustic-land classification (`SNR`, `SR/PO`, `SR/PF`, `SR/PI`) with populated `EnlaceGIS` codes (e.g. `36057_21_001`) but no `altura`/`edificabilidad`/`ordenanza` field on the layer at all (schema re-confirmed field-empty for buildability) | `https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer?f=json`; `.../MapServer/29/query?where=CODINE=%2715078%27&outFields=*&f=json` (0 results); `.../MapServer/29/query?where=CODINE=%2736057%27&outFields=*&f=json` (4 results) | High — directly queried, both cities |
| **New finding this pass**: this MapServer's actual scope | This service is titled "Plan de Ordenación do Litoral de Galicia (POL)" — it is the **coastal-strip land-use plan**, not a general municipal zoning layer. That is why non-coastal-relevant Santiago returns 0 and coastal Vigo returns 4 rustic (non-urban) polygons. Prior repo research described this MapServer generically; this pass narrows its actual legal scope | (same) | `.../MapServer?f=json` service description field: "Plan de Ordenación do Litoral de Galicia (POL). Ortofoto 2006,2007,2008. Aprobación Definitiva" | High |
| SIOTUGA per-municipality WMS link | "Documento de capacidades" link on the SIOTUGA municipal table resolves to a bare `#` anchor — **non-functional**, confirming the prior "WFS/WMS existence unconfirmed" note and hardening it to "the advertised per-instrument WMS link is a dead placeholder," not merely untested | Same portal, same dead-link behavior | `https://siotuga.xunta.gal/siotuga/urb?lang=es_ES` | Medium (JS-heavy page, WebFetch sees rendered/cached HTML only) |
| SIOTUGA WFS at IDEG root | `MapServer/WFSServer?service=wfs&request=getcapabilities` did not return WFS XML — resolved instead to the plain ArcGIS REST HTML directory page. No valid WFS GetCapabilities observed | same endpoint, same negative result | `https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/WFSServer?service=wfs&request=getcapabilities` | Medium — confirms, does not fully resolve, the prior HTTP-400 note |
| Parcel geometry | Not independently re-fetched this pass. Sede Electrónica del Catastro is asserted (via search results) to cover "the entire Spanish territory except Navarre and the Basque Country" — Galicia is not excluded, so presumed standard-national INSPIRE/ATOM delivery | Same presumption | `https://www.catastro.hacienda.gob.es/es-ES/sede.html` (not fetched live this pass — carried over from general Spain baseline, flagged as unverified-this-session) | Low — inference, not a live hit |
| Envelope parameters (altura/edificabilidad/ocupación/retranqueos) | Not extractable — host unreachable | Ordinance names (U1–U9) surfaced via search snippet indexing of the PXOM 2025 normativa PDF, implying parameter tables exist in the document, but no individual parameter value (a specific altura in metres, a specific edificabilidad ratio) was directly read this session — the PDF content itself could not be rendered (no `pdftoppm`/poppler available in this environment, and WebFetch's own extraction failed on the compressed PDF streams) | `https://xmu.vigo.org/docs/PXOM_2025/PXOM_2025/07_NU/36057_PXOM_202502_AD01_NU_01NU_cas.pdf` | Low — existence confirmed, content unread |
| Heritage — Santiago historic centre | Historic centre (169.9 ha, walled old town + historic quarters, 2,660 buildings, UNESCO 1985) is governed by **Plan Especial de Protección e Rehabilitación (PE-1/PEPRI)**, approved 1997, separately amended as recently as June 2025 (Catálogo modification) and April 2024 (DOG notice on unidad edificatoria 511224). A GIS for the historic centre was built with CESGA circa 2003 (parcel/building-unit polygons, aerial photo) per an academic paper — but no current public download/REST endpoint for that GIS was found; `patrimonio.xunta.gal` itself was not directly reached with a working BIC-layer URL this session | Vigo has no equivalent UNESCO/PEPRI historic-centre instrument identified in this pass | `https://www.xunta.gal/dog/Publicados/2024/20240415/AnuncioL178-210324-0001_es.html`; `https://ari-igvs.xunta.gal/es/node/52`; academia.edu paper "El SIG del casco histórico de Santiago de Compostela" (descriptive, not a live data source) | Medium (existence of PE-1 and its GIS pedigree) / Low (no current fetchable endpoint) |
| Flood | Not independently hit with a live GetCapabilities/query this pass — SNCZI viewer and WMS endpoints (e.g. `wms.mapama.gob.es/sig/agua/Presas`) are asserted nationally to cover Galicia per search-result summaries, not confirmed for Santiago/Vigo specifically | Same | `https://sig.mapama.gob.es` (not queried live); `https://www.miteco.gob.es/en/agua/temas/gestion-de-los-riesgos-de-inundacion/snczi.html` | Low — unverified this session |
| Airport | LEST (Santiago–Rosalía de Castro) confirmed in scope of national aeronautical-easement regime; RD 763/2017 specifically modified LEST's servidumbres | LEVX (Vigo–Peinador) confirmed in scope; **Vigo additionally holds an AESA exemption** — max height 45 m above ground/water in AESA-delimited exempt zones, removing the need for prior AESA sign-off in those zones (but the exempt-zone boundary map itself was not resolved to a fetchable file this pass) | `https://www.seguridadaerea.gob.es/en/ambitos/servidumbres-aeronauticas/mapa-de-ssaa` (live Google-Maps-based viewer confirmed, no KMZ/WMS link surfaced); `https://www.seguridadaerea.gob.es/en/noticias/nueva-exencion-de-aesa-en-materia-de-servidumbres-aeronauticas-para-vigo` | Medium — regime and exemption both confirmed to exist; neither resolved to machine-readable geometry |
| Environmental (Natura 2000 / national park) | Not directly relevant to Santiago (inland) | Parque Nacional Marítimo-Terrestre das Illas Atlánticas de Galicia (Cíes islands, closing the Ría de Vigo) — Natura 2000 code ES110001, park HQ physically located in Vigo. Existence and designation confirmed; no live WMS/GIS endpoint for the park boundary was hit this pass | `https://www.miteco.gob.es/en/parques-nacionales-oapn/red-parques-nacionales/parques-nacionales/islas-atlanticas.html`; `https://rsis.ramsar.org/es/ris/2453` | Medium (existence) / Low (no live geometry fetch) |
| Legal delegation (Plan Especial coverage) | The 169.9 ha historic centre is fully delegated to PE-1/PEPRI — base PXOM cannot answer buildability there. Santiago's municipal area is roughly 220 km² total, so the PE-1 footprint is a small fraction of total area by land, but likely a disproportionately large fraction of the **buildable urban core** (the historic centre is exactly where dense infill/renovation demand concentrates) — no precise % of buildable area is computable from what was found this session; flag as unestimated, not zero | No equivalent delegated instrument identified for Vigo in this pass, though the 2025 PGOM's own "planeamiento incorporado" (`API.html`) section suggests some sub-areas may still reference older, separately-approved partial instruments — not resolved further | (as above) | Low — directional only, no % computed |
| Dispatch feasibility | Chain breaks at step 1 (planning-document host unreachable) and step 2 (regional GIS carries no parameters, confirmed scoped to POL/coastal-rustic land only) | Chain has real upstream material (approved 2025 PGOM, ArcGIS viewer) but breaks at the geometry↔attribute machine-readable join — no confirmed queryable endpoint that returns a parcel's ordinance code + its parameter values in one call | — | Medium confidence in "breaks," low confidence in exactly where it would resume if the ArcGIS viewer's backend were found |

## Machine-readable assets (every verified live endpoint)

- `https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer?f=json` — HTTP 200, ArcGIS REST JSON, 30 layers, confirmed live, EPSG:25829. **Scope note (new this pass): this is the Plan de Ordenación do Litoral, coastal-strip only — not general zoning.**
- `https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/29/query?where=CODINE=%2715078%27&outFields=*&f=json` — HTTP 200, valid GeoJSON schema, **0 features** for Santiago.
- `https://ideg.xunta.gal/servizos/rest/services/Ordenacion/POL_AD_PlaneamientoUrbanistico/MapServer/29/query?where=CODINE=%2736057%27&outFields=*&f=json` — HTTP 200, **4 features** for Vigo (rustic land only, `SNR`/`SR/PO`/`SR/PF`/`SR/PI`, populated `EnlaceGIS` codes, no buildability fields).
- `https://siotuga.xunta.gal/siotuga/urb?lang=es_ES` — reachable, renders a searchable municipality table (Santiago: PXOM approved 2007-10-03; Vigo: PGOM approved 2025-05-26), but its "WMS/Documento de capacidades" link is a dead `#` anchor.
- `https://hoxe.vigo.org/movemonos/urbanismo_pxom_2025.php?lang=cas` — reachable, confirms 2025 PGOM status and links to `xmu.vigo.org/docs/PXOM_2025` document tree and the ArcGIS viewer.
- `https://xmu.vigo.org/docs/PXOM_2025/PXOM_2025/07_NU/36057_PXOM_202502_AD01_NU_01NU_cas.pdf` — HTTP 200, ~2 MB PDF, downloaded successfully; content not renderable in this environment (no poppler) and not decodable via WebFetch's extractor. Existence and reachability confirmed; text content NOT verified.
- `https://vigo.maps.arcgis.com/apps/instant/sidebar/index.html?appid=38cd806cdb1e48b08d4a1d3c75d70b28` — reachable, confirmed as a real ArcGIS Instant App for the 2025 PGOM; underlying Feature/MapServer URL not resolved (JS app shell only visible to WebFetch).
- `https://www.xunta.gal/dog/Publicados/2025/20250630/AnuncioL257-090625-0001_es.html` — DOG publication of Vigo PGOM definitive approval, confirms 2025-05-26 approval date and BOP 146 (04-08-2025) ordinance publication.
- `https://www.seguridadaerea.gob.es/en/ambitos/servidumbres-aeronauticas/mapa-de-ssaa` — reachable, live Google-Maps-based national aeronautical-easement viewer (red = aerodrome/radio easements, blue = operation easements); no direct KMZ/WMS link found on the page itself.

## Missing assets

- A resolvable queryable endpoint (REST/WFS) for **either city's actual zoning/ordinance geometry** — the one regional service that is confirmed live (SIOTUGA POL MapServer) is proven, by direct query in this session, to be scoped to coastal/rustic land only and to carry no buildability parameters.
- The backend Feature/MapServer URL behind Vigo's 2025 PGOM ArcGIS Instant App.
- Any live confirmation of Santiago's PXOM document format — the host would not connect in this session.
- A resolved BIC/PE-1 heritage boundary GIS layer for Santiago's historic centre (only a 2003-era academic description of a GIS was found, not a current endpoint).
- A resolved KMZ/WMS boundary for the AESA Vigo aeronautical-servitude exemption zone.
- Any live-fetched SNCZI flood layer or Natura-2000/national-park boundary layer over either city (both asserted to exist nationally, neither queried live this pass).
- Confirmation of catastro cartography specifically for Galicia (presumed standard, not independently re-verified this pass).

## Blockers

- **Engineering** — Vigo: the richest asset (2025 PGOM + ArcGIS viewer) is not yet reduced to a machine-callable geometry+attribute join; someone needs to open the Instant App in a real browser (not WebFetch) to capture its network calls and find the underlying service URL, or contact XMU (Xerencia Municipal de Urbanismo) for a direct REST/WFS endpoint.
- **Engineering** — Santiago: the planning-document host (`santiagodecompostela.gal`) refused every connection attempt in this session (`ECONNREFUSED` on http and https, apex and www). This must be re-tried from a different network/tool before concluding anything about PXOM format — treat as a research gap, not a confirmed dead end.
- **GIS-solvability** — the SIOTUGA/IDEG regional service, now proven scoped to the Plan de Ordenación do Litoral (coastal-strip rustic land), cannot be the source of urban zoning parameters for either city under any circumstance — this door is now more firmly closed than before, not just "unconfirmed."
- **Legal/OCR** — Santiago's historic centre (PE-1/PEPRI) is a confirmed non-machine-readable overlay for a heritage-dense, high-value fraction of the city; no current GIS was found for it, only a 20-year-old academic reference to one that once existed.
- **Legal** — neither city's delegated-instrument footprint (% of buildable area not resolvable from the base PXOM/PGOM alone) was quantified this pass; Santiago's is presumptively significant given UNESCO-core overlap, Vigo's is presumptively small but unconfirmed.

## Estimated Unlock Effort: **Large**

Vigo could plausibly move to "Medium" if the ArcGIS Instant App's backend is found and turns out to carry ordinance attributes directly (a single focused follow-up session, likely Small-to-Medium effort, could resolve this). Santiago requires first re-establishing basic connectivity to its planning-document host (unknown effort — could be trivial network flakiness or a structurally inaccessible/JS-gated site) and then a second, separate effort to resolve the PE-1 heritage layer. Taken together as one jurisdiction pair, "Large" reflects that at least three independent unknowns (Vigo GIS backend, Santiago host reachability, Santiago heritage GIS) must each resolve favorably before an engineering estimate for envelope computation is even meaningful.

## Recommendation: **Research first**

Do not attempt to build a dispatcher or rule pack yet. The next research session should: (1) resolve
Vigo's ArcGIS Instant App backend URL via a real browser/devtools pass rather than WebFetch; (2)
re-attempt `santiagodecompostela.gal` from a different environment/IP; (3) directly render or OCR
at least the Vigo `07_NU` normativa PDF to confirm whether parameter tables are extractable text or
require OCR; (4) contact or directly query `patrimonio.xunta.gal` for a current PE-1/BIC boundary
layer.

## PRYZM Readiness Score: **16 / 100**

Justification: scored on the same rough basis as the comparison set below (Balears 58, Murcia/
Madrid-capital/Catalunya 34, Málaga/Andalucía 22, Granada/València 18, Córdoba 17, Aragón/
Comunitat Valenciana 12, Valladolid 14). Galicia sits near the low end because the one regional
service confirmed live this pass was also confirmed, by direct query, to be scoped to coastal
rustic land only — it contributes essentially nothing to urban envelope computation for either
city. The score is not zero because: parcel geometry is presumptively standard-national (small,
unverified credit); Vigo's 2025 PGOM is unusually fresh and well-structured with a dedicated
public GIS viewer (real, if unresolved, potential); and the airport/heritage/flood regimes all
demonstrably exist with named, citable legal instruments even where their geometry wasn't reached
live. It is materially lower than Madrid/Murcia/Catalunya because those jurisdictions had at least
one directly-queried endpoint returning real parameters; Galicia's directly-queried endpoint
returned real geometry but zero parameters.

## Compare against

- **Barcelona** — PRYZM's most mature jurisdiction; full envelope pipeline shipped and end-to-end sound as of 2026-07-21 per `barcelona-end-to-end-production-state` memory; not separately re-scored here.
- **Murcia** (34/100) — capital scores meaningfully with a live envelope solver on measured, cited data; Galicia has no equivalent live solver path yet.
- **Balears** (58/100) — best-in-class outside Barcelona; excellent parcel+zoning foundation already shipped; Galicia is far behind this.
- **Aragón** (12/100) — national parcel layer live plus a reachable regional classification layer, similar shape to Galicia's finding but Galicia's regional layer is even narrower in scope (coastal-only).
- **Sevilla** — not separately audited in the files checked this pass; not compared with a number.
- **Comunitat Valenciana** (12/100 regional) / **València capital** (18/100) — comparable low-tier scoring rationale (live, unauthenticated, provably-reachable but thin data).
- **Granada** (18/100) — parcel geometry plus coarse classification live, justifying a similar low-but-nonzero score to what Galicia would earn on parcel-presumption alone.
- **Córdoba** (17/100) — ENVELOPE axis measured at 0.0% in a C63-style pass; directionally similar outcome expected for Galicia if formally scored on that framework.
- **Málaga** (22/100) — richer parameter text plus working regional flood pull; Galicia has neither confirmed yet.

## Final verdict + single biggest blocker

Verdict: Galicia (Santiago + Vigo) is **not buildable today** and, unusually among the jurisdictions
audited so far, the honest state is "we don't yet know how hard it will be" rather than "we know
it's hard." Vigo's brand-new 2025 PGOM is a genuinely promising, better-than-average raw asset that
no other Galician municipality in this repo's prior scaffolding has; it just hasn't been mined yet.

**Single biggest blocker: the SIOTUGA/IDEG regional GIS service — the only live, directly-queried
endpoint found for either city — is confirmed scoped to the Plan de Ordenación do Litoral
(coastal/rustic land only) and carries zero buildability parameters, which means there is currently
no known machine path from a parcel to a zone's height/FAR/setback values for either Santiago or
Vigo; that path would have to be built from Vigo's still-unresolved ArcGIS viewer backend or from
manual/OCR extraction of PXOM normativa PDFs, neither of which is confirmed feasible yet.**
