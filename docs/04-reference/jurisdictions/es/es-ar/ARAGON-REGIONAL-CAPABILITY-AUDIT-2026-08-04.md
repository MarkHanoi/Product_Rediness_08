# ARAGÓN — REGIONAL CAPABILITY AUDIT (2026-08-04)

**Scope**: the Autonomous Community of Aragón AS A REGIONAL PLATFORM — i.e. does the Gobierno de
Aragón itself publish machine-readable, parcel-usable planning/cadastral/heritage/flood/environmental
data that would let PRYZM produce a legally-defensible buildable envelope for a THIRD Aragonese
municipality (Teruel, Fraga, Ejea, Sabiñánigo, or any town other than Zaragoza/Huesca, which are
audited separately as municipal cases)? This is NOT a re-audit of Zaragoza or Huesca; it inherits
their findings as given and asks only whether the REGION generalises beyond them.

**Method**: primary sources only, verified live where reachable this session; every other claim is
inherited from the repo's own prior measured/read runs (cited) rather than re-asserted. No dataset is
assumed to exist without a fetched response or an explicit repo citation to a prior measured run.

---

## Executive Summary

Aragón was already the subject of a closed, dated regional investigation in this repository
(`ARAGON-BUILDABILITY-RESEARCH.md`, closed 2026-08-02, "the answer is no") that ran exactly the tests
this brief asks for and returned primary-sourced negative results on every one: the region's own
planning GIS (SIUa, run by Gobierno de Aragón, `icearagon.aragon.es` / `idearagon.aragon.es`) serves
buildability fields (`edificab`, `aprove`, `densidad`) populated at 1.3%, 0.0% and 1.3% respectively
across a 78-record/16-municipality sample, carries a legal-approval flag (`fiab_geom`, resolved from
the service's own SLD legend as *fiabilidad JURÍDICA*) that reads "Aprobada" on only 21.8% of records,
and publishes its finest planning geometry at 1:15,000 — too coarse for a parcel independent of
attribute quality. This session's live re-checks corroborate rather than overturn that finding: the
Teruel-specific ficha (`idearagon.aragon.es/fichaDescarga/fichaDescarga_44216.html`) loads and lists
~80 catalogue sections but zero planning/urbanismo parameter sections (no altura, edificabilidad,
ocupación, PGOU). Critically, Zaragoza's usable service — `urbanismo:Calificaciones_Urbanas`,
7,967 parcel-precise polygons — is confirmed to be the CITY OF ZARAGOZA'S OWN municipal GeoServer
(IDEZar/Ayuntamiento), a completely different system from the regional SIUa/SITAR service; the two
share no endpoint, no namespace and no data model. Zaragoza is therefore not "the first of many" on
a regional rail — it is a municipal outlier PRYZM found by exhaustively probing one city's own
infrastructure, and nothing in the regional layer predicts which, if any, other Aragonese
municipality has built the same thing. Heritage (INAGA BIC/cultural-parks WMS), flood (CHE/SNCZI,
~200 km of hazard maps added in Aragón), and Natura 2000 (204 enclaves, national MITECO WMS) all
exist at usable technical quality for their own purposes, but none of them substitutes for the
missing buildability layer, and the regional legal delegation model (Delimitaciones de Suelo Urbano
for municipalities without a general plan, Ley 2/2023) is read but not yet tested against a single
"unplanned" town.

## Capability: **Research Blocked** (regional axis) — bordering on **Engineering Blocked**

Not "Impossible Today": the repo's own prior finding is explicit that Aragón moved from "likely
impossible" to "promising but unverified," and this audit's live checks did not close that gap either
way for any THIRD municipality. It is not "Legally Blocked" — nothing found asserts the region's
planning data lacks legal force (unlike Castilla y León's explicit disclaimer or Illes Balears'
"not in force" flag); the blocker throughout is DATA, not law. It is not "Production Ready" or
"Indicative Ready" for any municipality beyond Zaragoza/Huesca because no third town has a populated
buildability field, a georeferenced plan sheet, or a wired rule pack of any kind (`44216-teruel`
folder in this repo is explicitly `NO PACK — not-assessed`, all five ADR-0279 slots empty). The
rating is **Research Blocked**: the three cheap, sequenced tests the repo's own plan calls Phase B
(fetch a second/third ficha to confirm the pattern generalises with zero planning content; read one
non-capital ordinance to settle setback-vs-alignment; resolve `fiab_geom`'s exact legal meaning from
a data dictionary) have not been run to completion for a THIRD municipality this session, and running
them is cheap, unblocked, and does not require code.

## Evidence Matrix

| # | Area | Finding | Grade | Source |
|---|---|---|---|---|
| 1 | Regional planning framework | Texto refundido, Ley de Urbanismo de Aragón (Decreto Legislativo 1/2014), most recently modified by Ley 2/2023 (9 Feb 2023) — restores *Delimitaciones de Suelo Urbano* (DSU) as an instrument for municipalities lacking a PGOU | READ | boe.es BOE-A-2023-6659; aragon.es legislación-en-materia-de-urbanismo (fetched 2026-08-04) |
| 2 | Regional planning GIS reach | SIUa serves 78 sampled records across 16 municipalities via WMS `GetFeatureInfo`; **no WFS bulk endpoint found** for SIUa | MEASURED | `ARAGON-BUILDABILITY-RESEARCH.md` §2, prior run |
| 3 | Same WFS as Zaragoza? | **NO.** Zaragoza's `urbanismo:Calificaciones_Urbanas` is the Ayuntamiento de Zaragoza's own municipal GeoServer (`ZARAGOZA_INSTRUMENT_REF`: "served live by IDEZar (Ayuntamiento de Zaragoza)"), distinct from the region-wide SIUa/SITAR system run by Gobierno de Aragón. Different publisher, different namespace prefix use, no shared typename census | MEASURED / READ | `esAragon.ts` L69-72 (this repo); `ARAGON-BUILDABILITY-RESEARCH.md` §2 (regional SIUa is WMS-only, no WFS) |
| 4 | Buildability field fill rate (regional layer) | `edificab` 1.3%, `aprove` 0.0%, `densidad` 1.3% valid (non-null-and-non-contradictory) across n=78 | MEASURED | `ARAGON-BUILDABILITY-RESEARCH.md` §3 |
| 5 | Classification field fill rate | `clase` 100%, `notepa` 97.4% | MEASURED | same |
| 6 | Legal-approval ceiling | `fiab_geom` resolved via SLD `GetLegendGraphic` for `SIUa:figuradeplaneamiento_fiabgeom`: "Aprobada" (`fiab_geom='1'`) on 21.8% of records; remainder is denied/doubtful/prescribed | MEASURED (from server's own legend) | `ARAGON-BUILDABILITY-RESEARCH.md` §A3 |
| 7 | Scale ceiling | Finest published planning geometry: 1:15,000 (clasificación de suelo, uso global); regional directives 1:300,000 | MEASURED | same, §8/§A1 |
| 8 | Ficha pattern generalises, carries no planning content | `idearagon.aragon.es/fichaDescarga/fichaDescarga_<CMUNIINE>.html` returns HTTP 200 on Fraga(22112)/Zaragoza(50297)/Huesca(22125)/Teruel(44216)/Ejea(50095)/Sabiñánigo(22199); every planning term (altura/plantas/edificabilidad/aprovechamiento/retranqueo/fondo/PGOU/normas urbanísticas) valid-rate = 0 across all six | MEASURED (prior run) + **RE-VERIFIED LIVE this session for Teruel 44216** | `ARAGON-BUILDABILITY-RESEARCH.md` §A1; live WebFetch 2026-08-04 on `fichaDescarga_44216.html` — confirms Teruel-specific content loads, lists ~80 catalogue sections (hunting, economic activity, human settlements, climate atlas, BCA5 cartography base), **zero** planning/urbanismo sections |
| 9 | Non-capital ordinance model | Huesca (fallback proxy, not Fraga) PGOU: closed-block fabric (Art. 8.4.8, alineación + fondo edificable — same machinery as Barcelona Art. 242) DOMINATES the consolidated residential fabric alongside setback zones (Vivienda Unifamiliar, Bloque Abierto). "Aragón needs less than Catalunya" hypothesis **not supported**. Fraga itself (Art. B2 target) is `blocked`: its SIUa inventory row has both publication-link cells empty (pre-digital 1983 plan, 55 unretropublished modifications) | READ (Huesca proxy) / MEASURED (Fraga row empty) | same, §A2 |
| 10 | Heritage — BIC/Mudéjar (Teruel is UNESCO Mudéjar architecture) | INAGA operates GIS/WMS cultural-heritage services (BIC + cultural parks) cataloged in IGEAR; a national-level equivalent (IDEEX I-09_BIC WMS) exists in other regions as a template. Aragón's own live endpoint was **not directly reached** this session (search-only, no GetCapabilities fetched) | READ | web search 2026-08-04: aragon.es "inaga-servicios-gis", icearagon.aragon.es/geonetwork catalogue entries — endpoint URL not resolved to a working GetCapabilities in this session |
| 11 | Flood — Río Ebro basin | Confederación Hidrográfica del Ebro (CHEbro) publishes flood-hazard maps for 10/50/100/500-year return periods via SNCZI + the SITEbro viewer; ~200 km of new hazard maps added within Aragón. WMS/WFS support referenced but no endpoint fetched live this session | READ | web search 2026-08-04: chebro.es, miteco.gob.es SNCZI page |
| 12 | Airport | Zaragoza and Huesca airport servitude surfaces are covered by sibling municipal audits (per task brief); not re-verified here to avoid duplication | N/A (deferred) | task scope |
| 13 | Environmental — Natura 2000 / Pirineos | Aragón holds 18 protected natural spaces + 204 Natura 2000 enclaves; national MITECO WMS (`wms.mapama.gob.es/sig/Biodiversidad/RedNatura`) plus SHP/GeoJSON/GML/KMZ downloads exist at national level. No Aragón-specific regional WMS/WFS endpoint was fetched live this session — the search surfaced only the national service and the region's descriptive landing page | READ | web search 2026-08-04: aragon.es "red-de-espacios-naturales-protegidos", miteco.gob.es rednatura_2000_desc |
| 14 | Legal delegation | Ley 2/2023 restores *Delimitaciones de Suelo Urbano* (DSU) as the instrument for municipalities without a General Plan — structurally the same shape as Galicia's Plan Básico Autonómico gap-filler (per `ES-ALL-REGIONS-STATUS.md` §1, which explicitly flags "Aragón and Castilla y León both have provincial normas subsidiarias worth checking on the same logic" as an OPEN action, never closed) | READ (law read) / **UNKNOWN** (never tested against one DSU municipality's actual content) | boe.es BOE-A-2023-6659; `ES-ALL-REGIONS-STATUS.md` §1 |
| 15 | Dispatch feasibility, region-wide | Zero. No third municipality has a wired parcel→zone→ordinance→envelope path; Teruel's own dossier (`44216-teruel/ENVELOPE.md`) records all five ADR-0279 slots (S1 parcel provider … S5 registration) as `❌ none` except the national Catastro parcel provider (S1, ✅) | MEASURED (repo state) | `docs/.../es-ar/44216-teruel/ENVELOPE.md` |

## Machine-readable assets — every verified endpoint

- **Catastro INSPIRE WFS** (national, not Aragón-specific) — parcel geometry, live, wired. `S1` in every dossier reads ✅.
- **SIUa planning WMS `GetFeatureInfo`** (Gobierno de Aragón, `icearagon.aragon.es`/`idearagon.aragon.es`) — regional, all 731+ Aragonese municipalities notionally in scope, but classification-only in practice (buildability fields near-empty; scale capped at 1:15,000). **No bulk WFS confirmed** — repeated live attempts this session to reach `icearagon.aragon.es` and a guessed SIUa GeoServer WMS host failed (DNS/robots-disallowed), consistent with the repo's own prior note that `icearagon.aragon.es` returns `ROBOTS_DISALLOWED` to crawlers. Access requires a browser user-agent; treated as UNKNOWN-not-absent per the repo's own negative-proof discipline, not as newly closed.
- **Ficha per-municipality pages**: `idearagon.aragon.es/fichaDescarga/fichaDescarga_<CMUNIINE>.html` — confirmed live for 44216 (Teruel) this session, and previously for 22112/50297/22125/50095/22199. Geodata catalogue only (climate, hunting, cartographic base); zero planning parameters on any of the six tested.
- **`urbanismo:Calificaciones_Urbanas`** — Zaragoza municipal GeoServer, 7,967 polygons, EPSG:25830, parcel-precise, live via WFS `GetFeature` (unadvertised in `GetCapabilities`, found via WMS `DescribeLayer`). **This is a Zaragoza-city asset, not a regional one** — see Evidence Matrix row 3.
- **SNCZI / SITEbro** (national + CHEbro basin authority) — flood hazard maps by return period, viewer confirmed to exist; WMS/WFS referenced in secondary sources, not fetched live to a `GetCapabilities` response this session.
- **MITECO Red Natura 2000 WMS** (`wms.mapama.gob.es/sig/Biodiversidad/RedNatura`, national) — confirmed to exist by search; covers Aragón's 204 enclaves as part of the national layer; not fetched live to a `GetCapabilities` response this session.

## Missing assets

- A confirmed, live, bulk **WFS** for SIUa (only `GetFeatureInfo` point-query has ever been measured).
- Any populated buildability field (height/FAR/occupation/setback/buildable depth) at the regional tier, for any municipality.
- A resolved legal meaning of `fiab_geom` beyond the SLD legend text itself (data-dictionary confirmation not yet fetched).
- A second and third municipality with the ficha's planning content actually populated (all six tested are catalogue shells).
- A working ordinance corpus for Fraga specifically (its own SIUa inventory row has no publication link at all).
- A live-fetched INAGA heritage WMS `GetCapabilities` response (found only by description, not by request this session).
- A live-fetched CHEbro/SNCZI WMS or WFS `GetCapabilities` response for Aragón specifically.
- Any test of a single Delimitación de Suelo Urbano (DSU) municipality's actual published content.

## Blockers

| Item | Type | Solvable how |
|---|---|---|
| SIUa buildability fields near-empty (1.3%/0%/1.3%) | Data (regional GIS is a classification catalogue, not an ordinance register) | Not GIS-solvable by better queries — the fields exist and are simply unpopulated at source. Only fix is per-municipality ordinance transcription, i.e. repeating the Zaragoza/Huesca municipal-level work town by town |
| `fiab_geom` legal-approval ceiling (21.8%) | Legal/data | Resolvable by finding SIUa's own data dictionary (not yet located); until then treat every non-`'1'` polygon as non-authoritative |
| 1:15,000 scale | Engineering/GIS | Not solvable by reprojection or interpolation — genuinely too coarse for parcel boundaries independent of any attribute question |
| No confirmed WFS, `icearagon.aragon.es` robots-disallowed | Engineering | Solvable with a browser-UA fetch (not yet done); does not change the underlying content-emptiness problem even if reached |
| Zaragoza's WFS is municipal, not regional | Architectural/scope | Not solvable — it is a fact about which government body built which system. Any other Aragonese town's usable data (if it exists) must be independently discovered by probing THAT municipality's own infrastructure, exactly as was done for Zaragoza, not inherited from the region |
| Fraga's PGOU has no published document at all | Legal/administrative (pre-digital 1983 plan, unretropublished) | Not GIS-solvable; would require a formal records request to the ayuntamiento/comarca |
| DSU gap-filler untested | Research | Cheap — pick one municipality believed to lack a PGOU, fetch its DSU if one exists, read it |
| Heritage/flood/Natura2000 endpoints not live-fetched this session | Research | Cheap — direct `GetCapabilities` fetches, blocked this session only by tool/network reachability, not by any evidence of absence |

## Estimated Unlock Effort: **Medium**

The repo's own Phase B plan (three cheap, sequenced, code-free tests: confirm the ficha pattern's
planning-emptiness on 2 more towns — done for one, Teruel, this session; read one non-capital PGOU
for the setback-vs-alignment answer; resolve `fiab_geom` from a data dictionary) is genuinely small
and was already costed as "not a 20-municipality survey, one document." But that only produces a
COST MODEL, not an unlocked region — actually reaching Production/Indicative Ready for a third
municipality requires repeating the full Zaragoza-style exhaustive-service-discovery effort
(DescribeLayer census, unadvertised-layer hunting, alignment-candidate measurement) or the Huesca-style
full-ordinance-read-plus-georeference effort, PER MUNICIPALITY, with no regional shortcut. That is
Medium-to-Large multiplied by however many towns are wanted, not a one-time regional unlock.

## Recommendation: **Research first**

Do not build against the regional SIUa layer for buildability — it is proven empty where it matters
and capped by its own legal-approval flag regardless. Do not assume Zaragoza's approach generalises —
verify municipality-by-municipality whether an equivalent unadvertised municipal GeoServer exists
before spending engineering time. The three specific research actions worth running next, in order:
(1) resolve `fiab_geom`'s dictionary meaning, (2) read one non-capital, non-Fraga PGOU to firm up the
setback-vs-alignment split across real Aragonese towns, (3) run the Zaragoza-style DescribeLayer/
unadvertised-layer census against ONE candidate mid-size Aragonese town (e.g. Calatayud, Barbastro,
Alcañiz) that is known to run its own municipal GeoServer, before committing to build any pipeline.

## PRYZM Readiness Score: **12/100**

Reflects: national parcel layer live (contributes a floor), regional classification layer reachable
(small credit), zero populated buildability data at regional scale, zero third-municipality dossiers
past `not-assessed`, and a legal-approval ceiling that caps even a best-case regional read at ~22% of
records. This is a region-wide score distinct from Zaragoza's (parcel-precise zoning reachable but
ungated) and Huesca's (fully-read law, georeference-blocked) municipal scores, both of which are
materially higher than the regional figure because they represent actual per-municipality work
already done.

## Compare against: Barcelona, Murcia, Balears, Sevilla, Valencia, Granada, Córdoba, Málaga

| City/region | Regional or metro-wide GIS generalises beyond the flagship? | Aragón comparison |
|---|---|---|
| **Barcelona** | AMB Refós covers 36 municipalities, 27 with `PGM='S'` confirmed — a genuine METRO-WIDE regional instrument with shared schema | Aragón has no equivalent shared regional buildability schema; SIUa is classification-only |
| **Murcia** | Municipal GeoServer with `Edificabilidad`+`Enlace_ficha` fields observed in schema; population/normativity not established (READ, not MEASURED) | Comparable evidentiary maturity (both READ-tier, unconfirmed), but Murcia's schema at least has the right field names present |
| **Balears** | MUIB serves `CODIAJ` + per-feature normativa URL region-wide, but explicitly flags some rows (Eivissa) NOT in force | More advanced than Aragón — has a working regional link-out mechanism, with an honest currency caveat |
| **Sevilla / Andalucía** | SITUA/VITUA is L4-framework region-wide, with a MANDATED schema (`EDIF_*`, `DENS`) via Orden 18-02-2026, though corpus fill is UNKNOWN | More legally mature at the regional-mandate level than Aragón; Aragón's NOTEPA (Decreto 78/2017) is a drafting standard only, not shown to require publication |
| **Valencia** | `terramapas.icv.gva.es` Zonificación serves ordinance codes present region-wide (READ) | Roughly comparable maturity; neither confirmed MEASURED for buildability fill |
| **Granada / Córdoba** | Part of the Andalucía regional framework above; Córdoba specifically already has a wired rule pack in this repo (`rulepacks/registry.ts`) | Aragón has zero wired rule packs outside the closed Zaragoza/Huesca refusal gates |
| **Málaga** | Also under Andalucía's regional SITUA/VITUA framework | Same comparison as Sevilla/Granada above |

**Net position**: Aragón sits at the WEAK end of the national spread. Its regional GIS is real,
technically reachable, and honestly classified (clase/notepa fields genuinely populated) — but for the
one axis this audit was asked to test, buildability, it is measured empty, unlike Barcelona's AMB
Refós or Andalucía's mandated (if unfilled) schema. Aragón is closer to Extremadura (`CALIFICACION_*`
returns geometry and nothing else) than to Catalunya or Madrid.

## Final Verdict

Aragón's region-wide planning-data platform (SIUa/SITAR, run by Gobierno de Aragón) is real,
technically reachable in part, and has been directly measured — not assumed — to carry classification
data but essentially no buildability data (edificab 1.3%, aprove 0.0%, densidad 1.3% valid across a
78-record, 16-municipality sample), capped further by a legal-approval flag that clears only 21.8% of
records and by a 1:15,000 publication scale too coarse for parcel work regardless of attributes. This
session's live re-check of the Teruel ficha corroborates that finding on a UNESCO-heritage-relevant
municipality specifically named in the brief: the page loads, is genuinely municipality-specific, and
contains zero planning parameters among ~80 catalogue sections.

**Does Zaragoza's WFS service extend to other Aragonese towns? No.** `urbanismo:Calificaciones_Urbanas`
is the Ayuntamiento de Zaragoza's own municipal GeoServer infrastructure — a different publisher,
different host, different data model from the region-wide SIUa/SITAR system. There is no evidence
Zaragoza is "the first of many" on a shared regional rail; it is a single city that happened to build
(and under-advertise) a rich municipal system, discovered only by exhaustively probing that city's own
WMS `DescribeLayer` output. Whether any other Aragonese municipality — Calatayud, Barbastro, Alcañiz,
or Teruel itself — has built an equivalent municipal system is genuinely UNKNOWN and must be tested
per-city, exactly as Zaragoza and Huesca were, never inferred from the region.

**Single biggest blocker**: the region-wide SIUa layer's buildability fields are measured empty
(1.3%/0%/1.3%), and the one legal-currency signal the service itself provides (`fiab_geom`) caps even
optimistic reuse at ~22% of records — a data-completeness ceiling, not a legal or engineering one, and
not solvable by better queries, only by the same municipality-by-municipality ordinance work already
under way for Zaragoza and Huesca.

---
*Audit date: 2026-08-04. Sources: primary Gobierno de Aragón services (idearagon.aragon.es,
icearagon.aragon.es), BOE/BOA legal texts, CHEbro/SNCZI, MITECO, and this repository's own prior
measured runs in `ARAGON-BUILDABILITY-RESEARCH.md` and `ES-ALL-REGIONS-STATUS.md`, cited inline.
No dataset asserted without a fetched response or an explicit repo citation. Recommends research, not
implementation; no code was written or modified.*
