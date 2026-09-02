# LANE CENSUS-WEST — European Existing Envelope Geometry Census

> Census per `docs/01-strategy/STR-EUROPEAN-ENVELOPE-SOURCES.md` §10 (the founder's mandate).
> Countries: FR · BE · NL · LU · GB · IE · PT · ES · AD · MC. Researched **2026-09-02**.
> PROBED-TODAY = a live request this lane, transcript beside this file in `transcripts-west/`
> (all probes User-Agent `PRYZM-Research/1.0 (+https://pryzm.app; contact pryzmhello@gmail.com)`,
> foreground, `$?` read). REUSED = probe-verified row from the banked sweeps
> (`audit/europe-site-intel/2026-08-31/lanes/*.md`, `impl/e5-devpotential-categories.md`,
> `E5-DATA-REUSE-REPORT.md`) or a MEASURED repo dossier — cited, never re-derived.
> UNKNOWN ≠ absent ≠ zero; where a cell is UNKNOWN the probe that would close it is named.
>
> **Verdict ladder (this census):** CONSUME-GEOMETRY (Type A — explicit envelope/field/line
> geometry served) > COMPILE-PARAMETERS (Type B — numeric parameters typed onto geometry) >
> STRUCTURED-RULES (structured zone/prescription model; the numbers stay in legal text) >
> DOCUMENTS-ONLY > OPAQUE.

---

## TYPE-A HEADLINE — where explicit envelope/field/line geometry is SERVED, with live proof

**1 · FRANCE — the GPU serves drawn setback lines, plan-masse sectors and height-ceiling
polygons nationally, keyless, quantified live TODAY (2026-09-02, `data.geopf.fr/wfs`, all HTTP 200):**

| channel | layer + filter | count (national) | live payload proof |
|---|---|---:|---|
| **Drawn setback lines** | `wfs_du:prescription_lin`, `typepsc='15'` | **69,739** | sampled feature: `libelle: "Marge de recul imposée au constructions"`, `stypepsc: "00"`, `idurba: "01034_PLU_20171128"`, `nomfic`/`urlfic` document join present |
| **Setback/implantation zones (surface form)** | `wfs_du:prescription_surf`, `typepsc='15'` | **51,407** | same code, polygon geometry |
| **Plan-masse sectors** | `wfs_du:prescription_surf`, `typepsc='14'` | **5,291** | sampled: `libelle: "SECTEUR DE PLAN MASSE 1"`, `txt: "PLAN_MASSE"`, `idurba: "17453_PLU_20190411"`; also `"Secteur de plan de masse"` (87093). ⚠ one of 3 sampled was upload noise (`"Voies classée bruyante type I"`) — municipal typology discipline is imperfect; filter by code, verify by libelle |
| **Height-limit polygons** | `wfs_du:prescription_surf`, `typepsc='39' AND stypepsc='02'` | **61,176** (77,350 at typepsc=39 all sub-codes) | sampled: `libelle: "HAUTEUR DES CONSTRUCTIONS LIMITEE A 9 METRES AU FAITAGE"` — the NUMBER is in the label here; the banked FR-1 probe showed it can also be absent (`txt` empty in Paris) — value is ZONE-DEPENDENT, geometry is not |
| denominators | `prescription_lin` total 4,137,667 · `prescription_surf` total 4,276,518 | | resultType=hits, keyless |

The founder's Phase-0 claim ("TYPEPSC=15 + 14 ARE the Type-A channels") is **CONFIRMED and
quantified**: ~121k drawn setback features + 5.3k plan-masse sectors + 61k height polygons,
each carrying the `idurba` plan-version join and the règlement PDF address. Licence Ouverte 2.0.

**2 · LUXEMBOURG — building-line geometry AND four numeric ratios in ONE national CC0 file
(REUSED, probed 2026-09-01, E5-B §A-13):** the national PAG GeoPackage
(`data.public.lu` → `pag.gpkg.zip`, 617 MB, refreshed 2026-08-31) carries
**`PAG_PAG_ALIGN_A_RESP` = 2,442 "alignments to respect" — building lines as geometry** —
plus `COS/CUS/CSS/DL` typed maxima at **93.7% strictly-positive fill on 3,017 new-quarter
zones**, gauges-to-preserve (7,057), corridor widths (`LARGEUR`), and **653,315 cadastral
parcels inside the same file** (`NUM_CADAST`). No height, no setback distances, no storeys;
the 18,743 existing-quarter zones carry zero numerics (DOCX-bound).

**3 · NETHERLANDS — bouwvlak is served building-FIELD geometry; the value layer is typed but
key-gated (REUSED schema probes 2026-08-31 + PROBED-TODAY):** Ruimtelijke Plannen API v4
serves `/plannen/{id}/bouwvlakken` (building-field polygons) and `/maatvoeringen`
(`{naam: "maximum goothoogte (m)", waarde: "24"}` + GeoJSON); the Omgevingswet Ozon API serves
`NormwaardeSpec.kwantitatieveWaarde` with geometry refs. PROBED-TODAY:
`api.pdok.nl/kadaster/omgevingswet-geometrieen/ogc/v2` → **HTTP 200, live, keyless** — but
vector tiles carry **one attribute: the geometry ID** ("kennen elk één attribuut: de
geometrie-identificatie", from the live service description). And the old public WFS is GONE:
`afnemers.ruimtelijkeplannen.nl` → **DNS NXDOMAIN today** (curl exit 6). So NL geometry is
open; the numbers require the FREE DSO key (form, not procurement — the standing action).

**4 · BELGIUM/Flanders — typed bouwlijn (building-line) features inside RUP line layers,
live and keyless (PROBED-TODAY, Mercator publiek WFS):**
`lu:lu_gemrup_ln` (municipal-RUP lines) = 5,133, of which **`svnaam ILIKE '%bouwlijn%'` =
951 explicit building lines** — sampled payload: `svnaam: "Bouwlijn"`, `svnr: "art. 3.2.1"`
(the prescription-article join), `algplanid: "RUP_23027_214_00010_00001"`, `fichelink`/`svidlink`
present. Plus `lu_gemrup_roo_ln` (rooilijn/alignment lines in RUPs) = 62, `lu_gemrup_gv`
zone polygons = 37,329, gewestplan `lu_gwp_gv` = 37,905. Thin but REAL Type A where a RUP
drew the line, with the article reference attached.

**5 · SPAIN/Madrid-city — official alignment lines + buildable-depth layers as published
geometry (PROBED-TODAY):** `sigma.madrid.es/hosted/rest/services/PGOUM97/PG_ORDENACION/MapServer/8`
("Alineaciones") → `{"count":29105}` live; sampled attribute
`PLANEAMIENTO.ALIN_DESC.ALIN_DESC: "Alineación Oficial"` (TIPOALIN=1; the repo's 2026-08-01
breakdown: 22,584 official + 3,582 en Volumetría Específica + 2,066 trazado indicativo APR).
`PG_ANALISIS_EDIFICACION` publishes the *fondo* (buildable depth) in two forms (layer 2
polyline, layer 12 polygon) — ⚠ PROBED-TODAY layer 12 returns `{"count":1}` and carries
OBJECTID only: geometry whose semantics are unread is not a datum (repo warning stands).

Nowhere else in these ten countries did this census find state-served envelope/field/line
geometry — consistent with the E5 verdict (envelope state-served NOWHERE, 21/21; geometry
CHANNELS as above).

---

## PER-COUNTRY ROWS (the founder's columns)

Column key: **parcel** = parcel linkage · **zone-g** = zoning geometry · **field-g** =
building-field geometry · **line-g** = building-line geometry · **valid** = validity/versioning ·
**cover** = spatial coverage · **MRQ** = machine-readable quality.

| country | authority | dataset | API/download | parcel | zone-g | field-g | line-g | height | FAR | coverage-ratio | setbacks | valid | licence | cover | MRQ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **FR** | IGN/DGALN — Géoportail de l'Urbanisme | CNIG-standard DU (zone_urba + prescription_surf/lin/pct) | GPU WFS `data.geopf.fr/wfs` keyless (PROBED-TODAY) + apicarto per-point; bulk 5k-feature cap | via cadastre PCI (separate, `idu`); no direct key on prescriptions — spatial join | ✅ national (`zone_urba`, PLU/PLUi/PSMV) | ✖ (plan-masse sectors 5,291 are the nearest) | ✅ **69,739 typepsc-15 lines** | polygons ✅ (61,176 39-02), VALUE zone-dependent | ✖ (règlement PDF) | ✖ (règlement PDF) | ✅ drawn (15) + ✖ numeric | ✅ `idurba` = plan+date | Licence Ouverte 2.0 GREEN | mandatory upload since 2020; rural RNU/POS outside — record per-département | HIGH geometry / NONE numerics |
| **BE-VLG** | Vlaanderen Omgeving — DSI/Mercator | gewestplan + APA/BPA + RUPs (gv/ln/pt/ov + roo/ont) | Mercator publiek WFS (PROBED-TODAY, 386 layers, keyless) + DSI RDF/SPARQL (REUSED, doc-verified) | via GRB ADP (CAPAKEY) — spatial join, keyless (REUSED FEATURE-LEVEL probe) | ✅ 37,905 gewestplan + 37,329 gemRUP polygons | ✖ | ✅ **951 typed bouwlijnen** (+62 roo_ln); article join `svnr` | ✖ (voorschrift text) | ✖ | ✖ | lines yes, distances in text | `algplanid` + fase/fasedatum | Vlaanderen open/modellicentie GREEN | region-complete for in-force plans | HIGH structure / NONE numerics |
| **BE-WAL** | SPW — Plan de secteur | PDS Zones d'affectation + prescriptions suppl. | ArcGIS REST `geoservices.wallonie.be` (PROBED-TODAY) | ✖ (CADMAP separate services, same host) | ✅ **43,797 polygons**, each w/ `ART_CODT` + `LIEN_WALLEX` legislation deep-link | ✖ | ✖ (atlas VV = historic road alignments) | ✖ | ✖ | ✖ | ✖ | revision layers + DATETRANS | SPW conditions GREEN-ish (REUSED) | region-complete | MED structure / NONE numerics |
| **BE-BRU** | urban.brussels / Perspective | PRAS + PPAS perimeters | WFS `gis.urban.brussels/geoserver` (PROBED-TODAY, 382 layers) + datastore.brussels CC0 (REUSED, internal 2026-07-25) | via UrbIS CC0 — spatial join | ✅ PRAS zones | ✖ | ✖ (RRU gabarits = relative TEXT rules) | ✖ | ✖ | ✖ | ✖ (RRU Title I text) | PPAS: 609 perimeters w/ `DOC_URL` (`ppas.brussels/IXE_0019_002` sampled) + arrêté dates | CC0 family GREEN | region-complete | MED structure / NONE numerics |
| **NL** | Kadaster/DSO-LV (+ PDOK) | omgevingsplan (IMOW) + bestemmingsplannen (IMRO2012) | Ozon v8 + RP API v4 — FREE key-gated; PDOK `omgevingswet-geometrieen/ogc/v2` keyless (PROBED-TODAY 200); old public WFS DEAD (NXDOMAIN TODAY) | BRK WFS wired in PRYZM (`pdok-nl`); norm→geometry via locatieRefs | ✅ bestemmingsvlakken / omgevingsplan GIO | ✅ **`/bouwvlakken` — served building fields** (REUSED schema probe) | ✖ as separate layer (gevellijn exists as aanduiding in some plans — UNKNOWN share; probe: maatvoering/aanduiding sweep once keyed) | ✅ typed (`maximum bouwhoogte/goothoogte` values) | ✅ typed where annotated | ✅ typed (bebouwingspercentage) | via bouwvlak + rules | ✅ dual-regime temporal model; TAM-IMRO tail to 2032 | gov reuse GREEN-ish (fair-use read pending) | national, both regimes; IMOW-annotated still minority (REUSED) | **HIGHEST in this lane** — key-gated |
| **LU** | Ministère de l'Intérieur / geoportail.lu | national PAG model (27 feature classes, one schema) | `data.public.lu` GPKG bulk, monthly-fresh (REUSED full-download probe 2026-09-01) | ✅ **653,315 parcels INSIDE the GPKG** (`NUM_CADAST`) | ✅ 46,191 zones, national `CATEGORIE` codes | ✖ | ✅ **2,442 ALIGN_A_RESP building lines** | ✖ (PAP/DOCX) | ✅ CUS 93.7%+ | ✅ COS/CSS 93.7%+ | ✖ distances (lines only) | plan+version per commune; ZQE vs NQ split explicit | **CC0** | national; numerics only on 3,017 NQ zones (18,743 QE zones doc-bound) | HIGH — best per-effort in lane |
| **GB** | MHCLG (planning.data.gov.uk) + HMLR | 108 designation datasets; local plan policies | entity API + bulk, OGL v3 (REUSED FEATURE-LEVEL probe 2026-08-31) | ✖ no cadastre by design (index polygons only) | designations ✅ / allocations partial | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | `quality` field ("authoritative") + dates | OGL GREEN | England-only, self-declared incomplete | constraint-geometry HIGH / envelope N/A — **structurally capped (discretionary)** |
| **IE** | DHLGH/Tailte + local authorities | national harmonised zoning (GZT) + RZLT parcels | opendata.housing.gov.ie + ArcGIS FeatureServer keyless (REUSED probe 2026-09-01: RZLT `{"count":296293}`) | RZLT `PARCEL_ID` (state-drawn, no cadastre) | ✅ national + `ZONE_GZT` vocabulary | ✖ | ✖ | ✖ (dev-plan PDFs) | ✖ | ✖ | ✖ | RZLT annual final maps, `DATE_ADDED` | data.gov.ie CC-BY family GREEN | 30/31 LAs (RZLT) | zone-vocab HIGH / numerics NONE; part-discretionary |
| **PT** | DGT (SNIT/SNIG) + 278 municípios | CRUS national aggregate + PDM vector model (2021 Norma) | DGT OGC API (cadastro live, REUSED); CRUS via SNIG/download, NOT on OGC API (REUSED probe) | national cadastro PARTIAL — Lisbon core numberMatched 0 (REUSED measured) | ✅ classification-level national (CRUS CC BY 4.0) | ✖ | ✖ nationally; UNKNOWN per-município (probe: sweep municipal ArcGIS for `alinhamento` layers — Lisbon PT-5 inventory shows condicionantes groups, no alignment vector confirmed) | ✖ (regulamento text: cércea) | ✖ (índice de utilização in text) | ✖ | ✖ | ~51% of PDMs mid-rewrite — versioning mandatory (REUSED measured) | CC BY 4.0 GREEN | mainland-national (classification) | structure MED / numerics NONE |
| **ES** | per-CA (no national planning register; SIU = index only, per STR §5) | per-CA normativa gráfica — see split below | per-CA WFS/ArcGIS; Catastro national spine separate | Catastro refcat national (LIVE in prod) minus foral PV/NA | ✅ where CA serves (MUC, VPLA, pgou layers) | ✖ | **Madrid-city ✅ 29,105 alineaciones (PROBED-TODAY)**; elsewhere see split | Madrid-CA `IT_ALTURA` 70.2% populated (REUSED MEASURED) | Madrid-CA partial; rest text | same | Madrid-city fondo layers (semantics ⚠ unverified); rest text/derived | per-CA; Murcia `f_inicial/f_fin` three-valued (REUSED) | CC BY 4.0 (Catastro); per-CA terms | per-CA patchwork | Madrid HIGH / most CAs LOW |
| **AD** | Govern (IDE Andorra) + 7 comuns (POUP) | "Edificabilitat" WFS = HAZARD-constraint buildability zones; POUP = per-parròquia plans | `ideandorra.ad/Serveis/wms_edificabilitat/wfs` WFS 2.0 live (PROBED-TODAY) | ✖ (comú-level cadastres; no national parcel WFS found — probe: per-comú viewers) | POUP zoning NOT found as WFS (UNKNOWN — probe: comú viewers/geoportal catalogue walk) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | per-study PDFs linked in features | Govern d'Andorra (terms unread — page fetch pending) | hazard layers per-settlement | LOW |
| **MC** | Gouvernement Princier (DPUM) | per-quartier-ordonnancé Ordonnances Souveraines + plans de coordination | legimonaco.mc / journaldemonaco.gouv.mc (HTML/PDF); plot plans by MANUAL REQUEST (monservicepublic.gouv.mc) | ✖ | ✖ (plans are PDF annexes) | ✖ | ✖ | in OS text per quartier | in OS text | in OS text | in OS text | OS amendment chain (JdM) | state legal-text reuse | principality-complete as documents | NONE machine-readable — searched: no WFS/WMS/open-geo channel found (2 web searches TODAY) |

### ES per-region normativa-gráfica split (the founder's sub-question: who serves alignment/depth GEOMETRY)

| region/city | alignment geometry | depth geometry | numeric params on zones | source + grade |
|---|---|---|---|---|
| **Madrid (city)** | ✅ **29,105 alineaciones** (`ALIN_DESC "Alineación Oficial"`) — PROBED-TODAY live | 🟡 `PG_ANALISIS_EDIFICACION` fondo polyline+polygon EXIST; layer 12 count=1 today, OBJECTID-only — **semantics unverified, do not consume yet** | via CA layer below | sigma.madrid.es ArcGIS REST, keyless |
| **Madrid (CA)** | ✖ | ✖ | ✅ `VPLA_V_ORDENANZA` 93,839 feats, altura 70.2% / plantas 72.9% populated; rule fragments as data (ático retranqueo) — ⚠ EPSG:4326 bbox silently returns 0, query in 25830 | REUSED (repo MEASURED + lane-3 probe) |
| **Murcia (city)** | ⚠ named-alignment trap: `pgou_alineaciones` is a CALIFICACIÓN **polygon** layer (23,066 in-force), `DescribeFeatureType` confirms NO numeric buildable attribute; `pgou_ejes` is a ROAD AXIS, not an alignment | ✖ | ✖ | REUSED (repo VERIFICATION.md, machine-verified) |
| **Catalonia / Barcelona** | ✖ city-wide (depth is a CONSTRUCTION — Art. 242; 22@ omission INTENTIONAL, cited refusal shipped) | 🟡 BCN `Cotes` layer: 4,725 dimension polylines with `LONGITUD` metres — digitised but LOOSE, needs spatial binding | claus via MUC/Refós (wired) — params in NNUU text | REUSED (repo GIS audit + closure register) |
| **València** | UNKNOWN — probe: DescribeFeatureType sweep of ICV MapServer layer 212 siblings for alineación layers | UNKNOWN | ordinance CODES present, semantics unbound (D-004) | REUSED (repo L3 grade) |
| **Andalucía / Galicia / Aragón / Extremadura …** | UNKNOWN-to-✖ — no alignment axis in `ES-ALL-REGIONS-STATUS.md` (it graded edificabilidad/altura only); probe: per-CA capabilities grep for `alinea` | ✖ found | Andalucía forward-only 2026 schema (`EDIF_*`, no altura); Galicia mandate-not-served | REUSED (repo audit 2026-08-02) |

---

## PER-COUNTRY ONE-LINE VERDICTS

- **FRANCE — CONSUME-GEOMETRY.** 69,739 drawn setback lines + 51,407 setback zones + 5,291 plan-masse sectors + 61,176 height polygons, national, keyless, quantified live today; the numeric règlement stays a document (ONE national extraction pipeline keyed on `idurba`).
- **BELGIUM — per-region: VLG CONSUME-GEOMETRY (thin), WAL STRUCTURED-RULES, BRU STRUCTURED-RULES.** Flanders serves 951 typed bouwlijnen with article joins (plus 75k zone polygons and the only SPARQL planning register in Europe); Wallonia serves 43,797 zones with per-zone CoDT-article + WALLEX deep-links; Brussels serves PRAS zones + 609 PPAS perimeters with doc URLs — everywhere the distances/gabarits are text.
- **NETHERLANDS — CONSUME-GEOMETRY + COMPILE-PARAMETERS (key-gated, free).** Bouwvlak building fields and typed maatvoering/Normwaarde values in BOTH regimes; geometry keyless via PDOK tiles (ID-only); the old public WFS is dead (DNS) — maatvoering COMPLETENESS is unmeasurable until the free DSO key lands (the standing this-week action; the probe is a `/maatvoeringen` sweep by plan).
- **LUXEMBOURG — COMPILE-PARAMETERS + CONSUME-GEOMETRY (lines).** One CC0 national GPKG: COS/CUS/CSS/DL at 93.7% on new-quarter zones, 2,442 building lines, parcels inside the file; no height/setback distances, existing quarters doc-bound. The cheapest structured-country adapter in Europe — hand-written LU rule pack is a STOP-BUILD (E5).
- **GREAT BRITAIN — DOCUMENTS-ONLY (envelope structurally capped).** World-class constraint/designation geometry (108 datasets, OGL) but a discretionary system: no by-right numeric envelope exists to consume — Product-A market, per standing internal doctrine.
- **IRELAND — STRUCTURED-RULES.** National harmonised zoning with the GZT vocabulary + 296,293 state-determined RZLT parcels (the WHERE, never the HOW-MUCH); numeric standards in development-plan PDFs, decisions part-discretionary.
- **PORTUGAL — DOCUMENTS-ONLY (with a national classification-geometry spine).** CRUS + PDM vector standard give structured zoning geometry; every envelope number (cércea, índice) lives in regulamento text; parcels absent in urban cores (measured); ~51% of PDMs mid-rewrite makes versioning non-optional.
- **SPAIN — per-CA: Madrid COMPILE-PARAMETERS + city-level CONSUME-GEOMETRY; Murcia/Catalonia STRUCTURED-RULES; most CAs DOCUMENTS-ONLY.** Only Madrid-city publishes official alignment lines live (29,105, probed today); depth/fondo geometry exists but is semantically unverified; SIU is an index, never the envelope authority (STR §5).
- **ANDORRA — DOCUMENTS-ONLY.** Per-parròquia POUPs are documents; the one live national "Edificabilitat" WFS (probed today) is GEOLOGICAL-HAZARD buildability (sampled: `Risc: "Corrents d'Arrossegalls"`, study PDF per zone) — a constraint channel, not a planning envelope.
- **MONACO — DOCUMENTS-ONLY (geometry channel effectively OPAQUE).** Per-quartier-ordonnancé Ordonnances Souveraines + plans de coordination as legal text/PDF (legimonaco/Journal de Monaco); plot plans by manual request; no open geodata service found (searched today — absence of a FOUND channel, not proof of absence).

---

## WHAT THIS LANE ADDS vs THE BANKED SWEEPS (net-new only)

1. **FR Type-A quantification** (the founder's ask): 69,739 / 51,407 / 5,291 / 61,176 with
   payload-level semantic confirmation — the banked FR-1 probe had only per-point examples.
2. **BE line-geometry axis**: bouwlijnen are TYPED and countable in Flanders (951, article-joined);
   Wallonia zones carry per-zone legislation deep-links (`LIEN_WALLEX`) — an evidence-graph gift
   the banked sweep did not record; Brussels PPAS perimeters carry per-plan `DOC_URL`.
3. **NL negative finding**: `afnemers.ruimtelijkeplannen.nl` is NXDOMAIN — the keyless IMRO WFS
   era is over; PDOK `omgevingswet-geometrieen/ogc/v2` confirmed live but ID-only.
4. **ES Madrid alignment live re-count**: 29,105 (repo had subset counts from 2026-08-01);
   fondo layer 12 today returns count=1 — the repo's "semantics unverified" warning is
   re-confirmed, not resolved.
5. **AD/MC first-ever census rows** (absent from all banked sweeps): Andorra's Edificabilitat
   WFS is hazard-constraint geometry; Monaco is legal-text-only.

## Probe-transcript index (`transcripts-west/`)

FR: `fr-presc-lin-15-hits.xml` · `fr-presc-lin-total.xml` · `fr-presc-surf-{14,15}-hits.xml` ·
`fr-presc-surf-total.xml` · `fr-presc-surf-39-hits.xml` · `fr-presc-surf-3902-hits.xml` ·
`fr-presc-lin-15-sample.json` · `fr-presc-surf-{14,39}-sample.json`
NL: `nl-pdok-ow-article.html` · `nl-pdok-root.json` · `nl-ow-geom-root.json` (200) ·
`nl-ow-geom-tiles.json` (404 subpath) — afnemers/opendata/index NXDOMAIN recorded in lane transcript
BE: `be-vl-mercator-caps.xml` (386 layers) · `be-vl-mercator-layers.txt` · `be-vl-hits-*.xml` ·
`be-vl-bouwlijn-hits.xml` · `be-vl-gemrup-ln-sample.json` · `be-vl-gwp-gv-hits.xml` ·
`be-wal-arcgis-root.json` · `be-wal-{PDS,SOL,GCU}.json` · `be-wal-pds22-{count,sample}.json` ·
`be-bru-caps.xml` · `be-bru-layers.txt` · `be-bru-ppas-{hits.xml,sample.json}`
ES: `es-madrid-alineaciones-{count,sample}.json` · `es-madrid-fondo-poly-count.json`
AD: `ad-edificabilitat-caps.xml` (WMS) · `ad-edificabilitat-wfs-caps.xml` (WFS 2.0) ·
`ad-encamp-ze-sample.json` · `ad-geoportal.html` · `ad-cartografia-wfs-caps.xml` (404 — geoserver
path dead; services live under `/Serveis/<name>/wfs`)
MC: no endpoint found to transcript — discovery was two web searches (Journal de Monaco OS
corpus + monservicepublic manual plot-plan process), recorded above.
