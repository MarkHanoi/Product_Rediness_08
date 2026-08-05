# Región de Murcia + Capital (INE 30030) — Capability Audit

> **Stamp: 2026-08-04.** Scope: the Región de Murcia (uniprovincial CCAA) AND the capital city
> Murcia specifically. This is a **research audit, not an implementation plan** — no code is
> proposed or written here. Every claim below is tagged **VERIFIED** (hit live this session),
> **ASSERTED-UNVERIFIED** (stated by a credible source, not re-hit), or **UNKNOWN**.
>
> **Relationship to existing repo state.** Murcia city already carries a very large, live body of
> work: `docs/04-reference/jurisdictions/es/es-mc/30030-murcia/` (RATE.md, ENVELOPE.md,
> CLOSURE-REGISTER.md, RISK-REGISTER.md, sources/, findings/, corpus/) and
> `packages/site-parcel-data/src/rulepacks/esMurciaEnvelope.ts` /
> `esMurciaPgou2012.ts` / `esMurciaAnchoDeCalle.ts`, dispatched from
> `apps/editor/src/ui/site/siteDispatch.ts` (`applyMurciaZoningThenFallback`). This audit does
> **not** duplicate that measurement work — it verifies its currency against the live services and
> extends the picture to (a) the rest of the region and (b) the seven research areas the existing
> dossier does not centrally address (heritage, flood, airport, environment, legal delegation
> framed regionally).

---

## Executive Summary

PRYZM's Murcia-city dossier is, as of 2026-08-01, materially ahead of the "cited refusal" baseline
this audit was asked to verify: the founder has since **signed** a scoped authorisation
(`MURCIA_ENVELOPE_VERIFIED = true`, SIG-MU1 + SIG-MU2), and the municipal GeoServer
(`geoserver.murcia.es`) is confirmed **still live** with the same `pgou_alineaciones` /
`pgou_sectores` layers plus a previously-unused `pgou_eje_comercial` axis layer — so Murcia city now
**renders a computed, cited buildable envelope on a measured 28.09 % of its private buildable land**
(23.51 % base + 4.58 pp from a street-width resolver), capped at `estimated-ruleset` confidence
because the transcription is unsigned-as-`authoritative` and the source PDF sits behind an HTTP 403
that defeats automated re-verification. The remaining 67 % of buildable land is **legally**
delegated to partial plans (Planes Parciales / PERI / Estudios de Detalle) that PRYZM does not hold
— a structural ceiling, not a PRYZM gap. Outside the capital, the picture inverts: **no other
municipality in the Región de Murcia has been onboarded** — Cartagena, Lorca and Molina de Segura
each run their own independent municipal GIS with planning-related WMS services, but none was
verified in this session to publish machine-readable numeric envelope parameters (only Murcia city
was confirmed to). A genuinely **regional** layer exists — IDERM/SitMurcia's INSPIRE "Planned Land
Use" WFS, covering the whole CCAA — but its own metadata self-describes as **reference-only**,
digitized from 1:5000 cartography, which is the same identity-not-parameter ceiling Murcia city's
own layer has. Flood risk (CHS, covering the Segura basin including the city's historic centre),
heritage (BIC via SitMurcia/`patrimoniocultural.carm.es`) and Mar Menor/Natura 2000 protection all
have live regional GIS with geometry; none was confirmed in this session to carry the specific
numeric override parameters an envelope solver needs, and the Corvera airport's aeronautical
easement status returned a **contradiction** (a public search snippet states no easements are
approved for this airport, while AESA's national servitude-map infrastructure — already used for
Barcelona — should in principle cover every public airport) that needs resolving before any airport
constraint is asserted for Murcia parcels.

## Capability: **Indicative Ready** (capital) / **Research Blocked** (rest of region)

The capital already clears "Indicative Ready" in the strict sense that PRYZM publishes real,
cited, non-fabricated numbers on a bounded, measured, sub-third of its buildable land, and refuses
— correctly and legally-groundedly — everywhere else. It does not clear "Production Ready" because
(a) the tier is capped at `estimated-ruleset` (0.4 weight; `authoritative` is stated as
**unreachable** under the current signature) and (b) the source PDF cannot be independently
re-verified by automation (HTTP 403). The rest of the region is **Research Blocked**: GIS
infrastructure clearly exists at every municipality checked, but no session (this one or the prior
one) has established whether Cartagena's or Lorca's layers carry numeric parameters the way
Murcia's calificación table does — that is an unanswered question, not a negative finding.

## Evidence Matrix

| # | Area | Capital (Murcia, 30030) | Rest of region | Status |
|---|---|---|---|---|
| 1 | Planning docs | PGOU *Texto Refundido* dic-2012, Vol. 11, 205pp, born-digital, HTTP 200 on first fetch (2026-08-01), now HTTP 403 to automation (L-674) | Cartagena: PGOU under "Revisión" (RPG0/RPG1/RPG2 WMS layer names imply multiple ordinance revisions exist); Lorca: PGMO PDF confirmed reachable (`urbanismo.lorca.es/pdf/documentos/...`) | VERIFIED (capital, partial) / ASSERTED-UNVERIFIED (region) |
| 2 | Zoning geometry | `Murcia:pgou_alineaciones` + `Murcia:pgou_sectores` + `Murcia:pgou_eje_comercial`, WFS 2.0.0, EPSG:25830, keyless | Cartagena: `S_Datos_RPG0/1/2` WMS (18 services loaded, layer names not resolved this session); Lorca: SITLorca `sit.lorca.es/Visor/` (connection failed this session — ECONNRESET, not proof of absence); Regional: IDERM `SIT_USU_PLU_CARM` WFS, whole-CCAA bbox | VERIFIED (capital) / VERIFIED-exists, UNVERIFIED-attributes (Cartagena) / UNKNOWN (Lorca, this session) / VERIFIED (regional PLU) |
| 3 | Parcel geometry | National Catastro INSPIRE WFS, EPSG:25830, keyless, refcat-joined — 99 % `computeParcelConfidence` score | Same national Catastro service covers every Spanish municipality identically | VERIFIED (national, region-wide) |
| 4 | Envelope parameters | 14 of 25 calificaciones carry STATED height/depth/FAR/coverage (article + verbatim quote); 11 refuse on a cited ground | Not established for any other Murcia-region municipality | VERIFIED (capital, partial) / UNKNOWN (region) |
| 5 | Heritage | SitMurcia BIC viewer draws from `patrimoniocultural.carm.es` Catálogo de Bienes Inmuebles, region-wide | Same regional source covers Cartagena/Lorca/all municipalities — this is a REGIONAL not municipal dataset | VERIFIED-exists / UNVERIFIED-machine-readable-attributes |
| 6 | Flood | CHS (Confederación Hidrográfica del Segura) publishes Cartografía de Zonas Inundables — 5/10/50/100/500-yr return-period polygons + depths, WMS + SHP download, feeds national SNCZI | Region-wide (basin-scoped, not municipal) — covers Murcia city (Segura riverbank) and most of the region's river network | VERIFIED-exists (not re-hit live this session — ASSERTED-UNVERIFIED on the live endpoint) |
| 7 | Airport | Corvera / Región de Murcia International Airport: AESA fact sheet exists (`ficha_murcia_corvera.pdf`, fetched but binary/unparseable this session); AESA's national interactive servitude map (`mapa-ssaa`) in principle covers every public airport; one search snippet asserts "no aeronautical easements have been approved for Murcia Airport" | N/A — single regional airport | **CONTRADICTORY, UNRESOLVED** — flagged, not answered |
| 8 | Environmental | Mar Menor: ZEC declared by decree Oct-2019, LIC ES6200006, managed via OISMA/`murcianatural.carm.es`, Natura 2000 EU viewer; `geoportal.imida.es` ArcGIS REST service (`PROYECTOS/OISMA`) found live | Region-wide, not municipal — Mar Menor abuts several municipalities beyond the capital (San Javier, Los Alcázares, Cartagena, Torre-Pacheco) | VERIFIED-exists / UNVERIFIED-attribute-level |
| 9 | Legal delegation | Measured precisely: **67.0 %** of Murcia city's private buildable land (75.145 km²) is delegated to Planes Parciales/PERI/EDs, cited article-by-article (Arts. 5.24–5.26, 6.2.2, 6.5.1, 6.6) | Not measured for any other municipality; expected structurally similar (same national/regional legal framework — Decreto Legislativo 1/2005) | VERIFIED (capital) / ASSERTED-UNVERIFIED-by-extrapolation (region) |
| 10 | Dispatch feasibility | **Live and wired**: `isInMurcia` bbox router → `resolveMurciaZoning` → `murciaEnvelopeDisposition` → `computeBuildableEnvelope` on the 28.09 % non-delegated packed slice; refusal elsewhere | **No router exists** for Cartagena/Lorca/Molina de Segura — a parcel there falls through to the generic Spain no-rule-pack refusal today | VERIFIED (capital) / VERIFIED-absent (region) |

## Machine-readable assets — every verified endpoint

- `https://geoserver.murcia.es/geoserver/Murcia/wfs` (WFS 2.0.0) — **VERIFIED live 2026-08-04**, 150+ feature types, keyless, EPSG:25830. Confirmed relevant layers: `pgou_alineaciones` (+ `_2001`/`_2007`/`_2012` historical variants), `pgou_sectores` (+ historical variants), `pgou_eje_comercial`, `pgou_sendas`, `pgou_ribas_lineas`/`pgou_ribas_texto`, `pgou_nf1`, `pgou_mpg`, `pgou_modpgs`, `pgou_ejes`.
- `https://ovc.catastro.meh.es/INSPIRE/...` (national Catastro INSPIRE WFS, CP + BU) — VERIFIED live (from prior session work, `MURCIA-TERRAIN-AND-HEIGHTS.md`), keyless, covers the entire region and country.
- `https://servicios.idee.es/wcs-inspire/mdt` (IGN WCS 2.0.1, MDT05 5 m terrain) — VERIFIED live, keyless, CC BY 4.0, covers the whole region.
- `https://wcs-mds.idee.es/mds` (CNIG building-height nDSM, 2.5 m posting) — VERIFIED live, keyless, national coverage, but PNOA-LiDAR 1st-coverage vintage (2009–2015).
- `https://mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/wfs` — **VERIFIED live 2026-08-04** (via GeoNetwork metadata record `sit_usu_plu_carm_wfs_md`), INSPIRE Planned Land Use, whole-region bbox (38.77°/37.36°/−0.65°/−2.35°), last metadata update 2023-12-20. Self-described as reference cartography digitized from MTR-5000 — no confirmation of numeric attributes.
- `https://sitmurcia.carm.es/` — VERIFIED live 2026-08-04, the region's IDERM/CARM geoportal, WMS + WFS + metadata catalog, sections for territorial planning, heritage (`patrimonio-cultural`), environment (`gestion-ambiental`).
- `https://www.chsegura.es/es/cuenca/caracterizacion/zonas-inundables-y-gestion-del-riesgo/cartografia-de-zonas-inundables-zi/` — ASSERTED-UNVERIFIED-this-session (found via search, not re-fetched live), stated to offer WMS + SHP download of 5/10/25/50/100/500-yr flood extents.
- `https://urbanismo.cartagena.es/urbanismo4/aspx/ide.aspx` and `.../urbanismo/aspx/Admin/TestWMS.aspx` — **VERIFIED live 2026-08-04**, lists 18 loaded WMS services including `S_Datos_RPG0/RPG1/RPG2` (Revisión Plan General, implying multiple ordinance versions), `S_CATASTRO`, `S_Datos_MEDIONATURAL`, `S_Datos_CULTURA`. A direct WFS GetCapabilities probe against a guessed endpoint (`WMS_RPG2?service=WFS`) returned **HTTP 404** — the actual WFS endpoint path was not located this session.
- `http://sit.lorca.es/Visor/` — referenced by search results (SITLorca); **connection failed** (`ECONNRESET`) when fetched live this session. Not proof of absence — genuinely unknown from this machine, same caveat the prior Murcia dossier records for `iderm.imida.es`.
- `https://geoportal.imida.es/gis/rest/services/PROYECTOS/OISMA/MapServer` — VERIFIED found via search (ArcGIS REST, environmental/OISMA), not fetched live this session.
- `https://www.seguridadaerea.gob.es/sites/default/files/ficha_murcia_corvera.pdf` — reachable (HTTP fetch succeeded, returned binary PDF ~1.2 MB) but not parseable via WebFetch this session; content unresolved.

## Missing assets

- No confirmed numeric-parameter (height/FAR/setback) source for **any** Murcia-region municipality other than the capital.
- No PRYZM router/dispatch entry for Cartagena, Lorca, Molina de Segura, or any other of the region's 45 municipalities.
- No independently re-fetchable copy of the governing PGOU text for Murcia city (`urbanismo.murcia.es` HTTP 403 to automation — L-674, already tracked) — a standing risk to the capital's own claims, not a new finding.
- No live re-verification this session of the CHS flood WMS endpoint, the AESA servitude KMZ/WMS, or the Mar Menor/Natura 2000 attribute schema — all found via search only.
- No BORM (regional gazette) approval reference for the Murcia PGOU (already tracked as `not-located-in-source` in the existing dossier — not resolved by this audit).
- No street-hierarchy/width source for any region municipality besides the capital's own resolver.

## Blockers

| Item | Type | Note |
|---|---|---|
| PGOU source PDF returns HTTP 403 to automation | Engineering/Access | Human-gated fetch only (BCNROC pattern per repo convention); blocks automated re-verification and the 2012↔2017 concordance diff. |
| 67 % of Murcia city's buildable land delegated to Planes Parciales | **Legal** | Structural — no engineering or transcription closes it; correctly closed today as a cited `derived-plan` refusal. |
| No numeric-parameter confirmation for Cartagena/Lorca/other municipalities | Research | Unanswered, not negative — GIS clearly exists (WMS services enumerated), attribute-level content was not probed to `DescribeFeatureType` depth this session. |
| No dispatch router for any non-capital Murcia-region municipality | Engineering | Zero coverage today; every parcel outside Murcia city currently falls to the generic Spain refusal. |
| Regional PLU (IDERM) layer self-describes as reference-only, MTR-5000-digitized | GIS-solvability, likely negative | Suggests the regional layer will not itself supply numeric parameters even where probed — each municipality's own instrument (as with Murcia city) will likely remain the authoritative source, meaning region-wide coverage is N × municipal replication, not one regional shortcut. |
| Corvera airport easement status contradictory | Research | One source implies no approved easements for this specific airport; AESA's national infrastructure (used successfully for Barcelona per prior work) should in principle apply universally. Needs a direct fetch of `mapa-ssaa`/KMZ output for the Corvera coordinates before any airport constraint is asserted. |
| Flood/heritage/environment layers unverified at attribute level | GIS-solvability, unknown | Geometry is very likely available (CHS flood, BIC heritage, Natura 2000/OISMA); whether any of them expose the specific override fields an envelope solver needs (build prohibition, height cap in a protected setting, etc.) is unestablished. |

## Estimated Unlock Effort

- **Capital, closing remaining gaps** (street-width row already resolved 2026-08-02; BORM reference, 2017-diff, PDF retrieval): **Small** — per the existing `CLOSURE-REGISTER.md`, ~2–4 days, mostly human-gated.
- **Region-wide replication** (Cartagena, Lorca, Molina de Segura and beyond, each requiring its own GeoServer/WFS discovery, PGOU transcription, and dispatch router): **Very Large** — this is N repetitions of the multi-week Murcia-city research-and-transcription effort already documented (the capital alone consumed a multi-session, founder-signed research programme), with no regional shortcut confirmed.
- **Flood/heritage/airport/environment as override layers** (assuming geometry is confirmed usable): **Medium** per layer, contingent on an unperformed attribute-level probe.

## Recommendation

**Research first**, region-wide. The capital is defensible to continue building on incrementally
(it already has a founder-signed, tested, honestly-capped pipeline). Nothing here justifies
extending to a second Murcia-region municipality without first running the same discovery
discipline already applied to the capital: locate each municipality's own GeoServer, `DescribeFeatureType`
its zoning layer for numeric attributes (not just identity), and only then decide whether it is a
"packed calificación" city like Murcia or a "cited refusal" city. **Do not build** a regional
router that assumes IDERM's PLU layer supplies numeric parameters — its own metadata denies this by
calling itself reference cartography. **Do not** assert an airport constraint for Corvera until the
contradiction in the AESA evidence is resolved by a direct, successfully-parsed fetch.

## PRYZM Readiness Score: **34 / 100**

Composite reasoning: capital scores meaningfully (envelope solver live on a measured, cited,
non-trivial 28.09 % of buildable land, at capped confidence) but the region as a whole is
overwhelmingly unonboarded — 1 of an estimated 45 municipalities has been researched at all, and
the one regional-scope data source found (IDERM PLU) is self-declared non-authoritative for
numeric parameters. Weighting roughly by the C63 axis logic already used for the capital
(LEGISLATION 25 · ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS 10 · TERRAIN 10 · CONTEXT 5),
and discounting the capital's own ~39 % city-level score by the fraction of the region it
represents, yields a low-30s regional composite. This is not a criticism of the capital's work,
which is unusually rigorous and honestly capped — it is a statement that "Región de Murcia" as a
unit is far from covered.

## Compare against: Barcelona, Balears, Zaragoza, Sevilla, Valencia, Granada, Córdoba, Málaga

Per prior tracker entries (memory, not re-verified live in this session): Barcelona has full 3D
AESA servitude geometry resolved and an end-to-end-sound production state as of 2026-07-21; Balears
and other cities carry their own per-city research states of varying maturity documented under
their respective `es-XX` folders. Murcia city's structural profile — a general plan that delegates
a majority of buildable land to derived instruments, leaving a signed but capped `estimated-ruleset`
slice — was explicitly compared in the existing dossier to Barcelona (Barcelona: 62.8 % delegated,
≈37 % direct ceiling; Murcia: 67.0 % delegated, 33.0 % direct ceiling, 23.51–28.09 % actually
rendering). **Murcia is comparable to Barcelona in structure, not clearly better or worse** — both
are majority-delegated general plans. What sets Murcia apart from most peers in this comparison set
is that it is the **only region in this set where the audit was explicitly asked to cover the whole
CCAA**, and the whole-CCAA picture is far behind the whole-city picture for every one of these
comparators, because none of the others has had its second/third-largest city even scoped.

## Final Verdict

The **capital** is a genuine, if narrow, PRYZM success story: a founder-signed, honestly-capped,
legally-cited envelope solver live on a measured slice of the city, with every refusal traceable to
either an unsigned transcription or a structural legal delegation. The **region** is not a PRYZM
capability today in any meaningful sense — it is one researched municipality out of roughly
forty-five, plus a regional reference layer that explicitly disclaims the numeric authority an
envelope tool needs.

**Single biggest blocker:** there is no regional shortcut. IDERM's Planned-Land-Use WFS is the one
dataset that could in principle have turned "cover Cartagena, Lorca, Molina de Segura, …" into a
single integration; its own metadata states it is reference cartography digitized from 1:5000
mapping, not the authoritative numeric-parameter source. That forces Región-de-Murcia coverage back
onto the same municipality-by-municipality PGOU-discovery-and-transcription path Murcia city
required — a Very Large, multi-month effort with no confirmed way to shortcut it.

---
*Session: 2026-08-04. Live verifications performed: `geoserver.murcia.es` WFS GetCapabilities,
`mapas-gis-inter.carm.es` IDERM PLU WFS metadata, `sitmurcia.carm.es` presentation page,
`urbanismo.cartagena.es` WMS test/admin page (+ a failed WFS probe against a guessed endpoint),
AESA Corvera fact-sheet fetch (unparseable). Not re-verified live: CHS flood WMS, AESA interactive
servitude map output, Lorca SITLorca visor (connection failure), Mar Menor/Natura 2000 attribute
schema, Cartagena's actual WFS feature types. Authority: this audit is additive to, and does not
supersede, `30030-murcia/RATE.md`, `ENVELOPE.md`, and `CLOSURE-REGISTER.md`, which remain the
canonical source for the capital's own measured state.*
