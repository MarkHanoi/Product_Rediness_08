# CAPABILITY AUDIT — Zaragoza (INE 50297), city-wide legally-defensible buildable envelopes

**Date:** 2026-08-04. **Method:** codebase read (`esZaragoza.ts`, `esAragon.ts`, `resolveZaragozaZone.ts`,
`resolveZaragozaStreetWidth.ts`, `openTopIndicative.ts`, `zaragozaZoningProxy.js`, prior
`docs/04-reference/jurisdictions/es/es-ar/50297-zaragoza/*.md`) + LIVE re-verification via WebFetch
against zaragoza.es, the IDEZar GeoServer, IDEE Aragón, MITECO, CHE and Catastro. Every claim below is
marked by how it was checked; nothing is asserted from memory of prior sessions.

## Executive Summary

PRYZM has done real, verifiable work on Zaragoza — a live, city-wide, parcel-precision zone resolver
against the city's own `urbanismo:Calificaciones_Urbanas` WFS (confirmed live today, 7,967 polygons,
EPSG:25830, genuinely absent from `GetCapabilities` exactly as the code claims), and a verbatim,
page-cited transcription of 4 of the ordinance's 52 zone codes (subgrados A1/3.1, A1/3.2, A1/4.1,
A1/4.2) — but every path to an actual number is still closed. The determination gate
(`ZARAGOZA_ENVELOPE_VERIFIED`) is hard-coded `false` pending a human legal signature; as of today
(`§ZARAGOZA-LISTING`, 2026-08-04) a narrower *indicative-only* draw was authorised, but it functions
for at most 2 of the 4 packed subgrados in production (A1/4.1, A1/4.2 — 329 of 7,967 polygons, 4.1 %)
because the street-width resolver the other two zones need is hard-refused `not-wired` with no live
Zaragoza block/parcel-neighbourhood source feeding it. The remaining 48 zone codes (96 % of the
calificación vocabulary) have no legal reading at all, and all four named constraint families
(heritage, flood, airport, environmental) are unmodelled — confirmed live: none of the endpoints this
audit could locate (IDEE Aragón, MITECO SNCZI/RN2000 WMS, AESA/seguridadaerea.gob.es, CHE) returned a
usable, confirmed-working service in the time available, so the "unmodelled" claim could not even be
downgraded to "modellable but unwired." City-wide, legally-defensible envelope generation for Zaragoza
does not exist today, and would not exist even if the signature gate were flipped tomorrow.

## Capability: **Engineering Blocked** (with a compounding **Legally Blocked** gate on top)

Reasoning: a live, correctly-behaving data spine exists (parcel + zone resolution), which rules out
"Research Blocked" or "Impossible Today" as the top-line label — this is not a dead end. But three
independent, unfinished engineering tracks stand between today and a city-wide capability (transcribing
48 more zone codes, wiring a Zaragoza block/parcel-neighbourhood source for street-width measurement,
wiring at least one constraint layer), and on top of that a human-authored legal signature
(`sources/VERIFICATION.md`) is a hard precondition for anything above indicative that no amount of
engineering can substitute for. The 4.1 %-of-polygons indicative slice that opened today is real but is
not "Indicative Ready" at the city scale the brief asks about.

## Evidence Matrix

| Research area | Claim (codebase) | Verification method | Result | Source URL |
|---|---|---|---|---|
| Zone WFS reachability | `Calificaciones_Urbanas` answers `GetFeature` 200 but is absent from `GetCapabilities` | Live `GetFeature` + `GetCapabilities` fetch | **CONFIRMED** — GetFeature returned valid GeoJSON (`calificacion: "EQ"`, `descripcion`); GetCapabilities listed ~29 `urbanismo:` types (Alturas_Edificios, Manzanas, Parcelas, Vias, …) and did NOT include `Calificaciones_Urbanas` | `https://idezar-sig.zaragoza.es/servicios/geoserver/wfs` (GetFeature & GetCapabilities requests) |
| Zone polygon count | 7,967 polygons, EPSG:25830 | Live `GetFeature` (bulk request) | **CONFIRMED** — response stated ~7,967 total features matched; CRS reported as `urn:ogc:def:crs:EPSG::25830` | same endpoint, `typeNames=urbanismo:Calificaciones_Urbanas` |
| Zone codes beyond the 4 packed | 52 distinct codes, only 4 packed | Live sample fetch (2,000 features, `calificacion` only) | **PARTIALLY CONFIRMED** — sample surfaced `EQ`, `ZV` (not in the 4-code pack), consistent with a much larger vocabulary; full 52-code enumeration not independently re-run (would require the census tooling in `tools/ogc-layer-census/`, not re-executed live this session) | same endpoint |
| PGOU 2024 TR — native text or scan | Verbatim-transcribed from a document, page-cited pp.147-154 of a Título Cuarto extract | Live fetch of zaragoza.es urbanismo/PGOU pages | **CONFIRMED (native, downloadable, structured)** — found `TR2024_Tomo 12_Normas urbanisticas-DEF-titulo4-139-188.pdf` (Título Cuarto, pp.139-188 of Tomo 12) plus 7 sibling Título PDFs (Primero…Octavo), Tomo 10 (Estructura y Clasificación, 98.3 Mb), Tomo 11 (Calificación y Regulación, 242.3 Mb), and Anejos (Tomos 13-15) — codebase's pp.147-154 citation sits inside the confirmed 139-188 Título Cuarto range | `https://www.zaragoza.es/sede/portal/urbanismo/planeamiento/pgouz` |
| PGOU structure (Títulos) | Not previously enumerated | Live fetch | **NEW FINDING** — 8 Títulos confirmed (Primero…Octavo) plus separate structural/qualification tomos and annexes; Título Cuarto (suelo urbano consolidado, where the 4 packed subgrados live) is one of 8 — the other 7 Títulos and the Anejos are unread by PRYZM | same page |
| Parcel geometry / CRS | Catastro, EPSG:25830 | Live `GetCapabilities` on INSPIRE Cadastral WFS | **CONFIRMED** — national INSPIRE Cadastral Parcels/Zoning WFS live, EPSG:25830 among supported CRS (25829-25831 range), covers mainland Spain incl. Zaragoza; per-parcel update frequency not independently verified live | `http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx` |
| Other zones (A2/A3/B/C/Grados 1-2) transcribable | Grado 1 is graphic-only (`Textos_Altura_Edificable`); other grados/subgrados unread | Not independently re-verified beyond what `esAragon.ts` already records | **NOT RE-VERIFIED LIVE** — codebase's own census (`ZARAGOZA_REACHABLE_NORMATIVE_LAYERS`) is internally consistent and cites a specific layer name/count; this audit did not re-open the Título Cuarto PDF pages for zones outside the 4 packed subgrados | n/a — inherited from repo census, not independently re-run |
| Heritage GIS layer | Not modelled; no layer wired | Live browse of IDEE Aragón geoportal homepage | **NO DEDICATED LAYER FOUND** (not proof of absence — Ministerio de Cultura's separate national BIC dataset was not checked live) | `https://idearagon.aragon.es/` |
| Flood GIS layer (Ebro) | Not modelled; `resolveCatalunyaFloodOverlay.ts` is Catalunya-only | Live fetch of MITECO SNCZI page, MITECO/CHE WMS guesses | **UNVERIFIED, ENDPOINTS UNRELIABLE** — MITECO SNCZI landing page 404'd; a plausible MITECO flood WMS endpoint returned a server-side .NET `NullReferenceException`, not a capabilities document; CHE's own site pointed to "Geoportal SITEbro" (`iber.chebro.es/geoportal`) and a citizen "check flood risk of a parcel" tool, but no working WMS/WFS endpoint URL was recovered in the time available | `https://www.miteco.gob.es/...`, `https://wms.mapama.gob.es/sig/Agua/ZonasInundables/wms.aspx`, `http://iber.chebro.es/geoportal/` |
| Airport servitudes (LEZG) | Not modelled; unlike Barcelona's AESA KMZ, no equivalent wired for Zaragoza | Live fetch, AESA domain + successor agency | **UNVERIFIED — DOMAIN CHANGED, CONTENT NOT REACHED** — `www.aesa.gob.es` no longer resolves (DNS failure); its likely successor `seguridadaerea.gob.es` page returned truncated content with no confirmed download link; separately, the PGOU's own Tomo 15 Anejos page listing (zaragoza.es) mentions "aeronautical easements" among its cartographic materials, meaning the *municipality's own plan documents* may carry this geometry even though no separate AESA/ENAIRE feed was confirmed — worth a follow-up read of that specific Anejo, not done this session | `https://www.seguridadaerea.gob.es/...`, PGOU Anejos listing on `zaragoza.es/sede/portal/urbanismo/planeamiento/pgouz` |
| Environmental (Natura 2000, ZEC Sotos y Galachos) | Not modelled | Live fetch, guessed MITECO RN2000 WMS endpoint | **UNVERIFIED, SAME BROKEN ENDPOINT PATTERN** — the guessed MITECO Natura 2000 WMS URL returned the identical .NET `NullReferenceException` as the flood layer, suggesting a shared broken legacy ArcGIS-to-WMS proxy on MITECO's side rather than confirmation the data doesn't exist elsewhere | `https://wms.mapama.gob.es/sig/Biodiversidad/RN2000/wms.aspx` |
| PERI/Plan Especial delegation extent | Not previously estimated | Not independently measured | **RESEARCH BLOCKED — NOT ESTIMATED.** Confirming the 8-Título structure shows suelo urbano consolidado (Título Cuarto, direct-ordinance) is only one of several regimes; a defensible %-of-city estimate would require reading the other Títulos/Anejos, which was out of scope for this session. Treat as an open question, not a number | n/a |
| Dispatch feasibility across all ~9,031/7,967 polygons | Only 4 subgrados packed; rest refuse | Codebase read + registry check | **CONFIRMED BLOCKED CITY-WIDE FOR DETERMINATIONS.** `ZARAGOZA_ENVELOPE_VERIFIED = false` (`esAragon.ts`) blocks every polygon from a determination-grade figure. As of 2026-08-04, `ZARAGOZA_OPEN_TOP_INDICATIVE` is newly listed in `OPEN_TOP_INDICATIVE_JURISDICTIONS`, but `resolveZaragozaStreetWidth.ts` unconditionally returns `not-wired` in production (no block/parcel-neighbourhood geometry source is fetched anywhere in this codebase), so A1/3.1 and A1/3.2 (301+40=341 polygons) cannot resolve even indicatively today; only A1/4.1 and A1/4.2 (215+114=329 polygons, fixed scalars, no street-width dependency) can — 329 of 7,967 total polygons, ≈4.1 % | `packages/site-parcel-data/src/rulepacks/esAragon.ts`, `openTopIndicative.ts`, `providers/resolveZaragozaStreetWidth.ts` |

## Machine-readable assets — every verified live endpoint

| Endpoint | Format | What it serves | Verified how |
|---|---|---|---|
| `https://idezar-sig.zaragoza.es/servicios/geoserver/wfs` — `typeNames=urbanismo:Calificaciones_Urbanas` | WFS 2.0.0 / GeoJSON, EPSG:25830 | Full PGOU-2024 calificación polygons (7,967), point-queryable | Live `GetFeature` fetch this session, returned real feature properties |
| same GeoServer root, `GetCapabilities` | WFS capabilities XML | Advertises ~29 `urbanismo:` feature types; **does not** advertise `Calificaciones_Urbanas` | Live fetch this session |
| `http://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx` | WFS / GML 3.2.1, INSPIRE | National `CadastralParcel` + `CadastralZoning`, mainland Spain incl. Zaragoza, EPSG:25830 supported | Live `GetCapabilities` fetch this session |
| `https://www.zaragoza.es/sede/portal/urbanismo/planeamiento/pgouz` | HTML + linked PDFs | TR2024 document index: Tomo 10 (Estructura/Clasificación), Tomo 11 (Calificación/Regulación), Tomo 12 (Normas urbanísticas, 8 Títulos as separate PDFs), Anejos (Tomos 13-15) | Live fetch this session |
| `/api/zaragoza/calificaciones` (PRYZM own proxy, `server/zaragozaZoningProxy.js`) | JSON | Same-origin wrapper around the WFS above, C57 discipline | Code read, not independently hit (would require a running server) |

No other endpoint reached "confirmed live and usable" status this session. Everything below is
explicitly unverified.

## Missing assets — the 4 named constraint families, updated with live findings

1. **Heritage** (Casco Histórico, La Aljafería, La Seo, Basílica del Pilar) — codebase: not modelled,
   no layer wired anywhere. **Live finding:** no dedicated BIC/heritage viewer surfaced from IDEE
   Aragón's homepage navigation. Absence of a homepage link is not proof no such layer exists
   (Ministerio de Cultura's national BIC dataset was not checked). **Status: still unmodelled, existence
   of a usable source still open.**
2. **Flood** (Ebro ARPSI, PGRI Demarcación Hidrográfica del Ebro) — codebase: not modelled,
   Catalunya-only overlay exists elsewhere. **Live finding:** MITECO's SNCZI landing page 404'd; a
   plausible flood WMS endpoint errored server-side; CHE points to "Geoportal SITEbro" and a citizen
   parcel-flood-check tool, but no working machine endpoint was recovered. **Status: unmodelled,
   and no working live endpoint was found this session either** (worse than "unwired" — currently
   unreachable by the methods tried).
3. **Airport** (LEZG servidumbres aeronáuticas) — codebase: not modelled, no Barcelona-style AESA KMZ
   equivalent wired. **Live finding:** the AESA domain no longer resolves; its likely successor
   (`seguridadaerea.gob.es`) did not yield a confirmed per-airport download. **New lead, not closed:**
   the PGOU's own Tomo 15 Anejos listing on zaragoza.es references "aeronautical easements" among its
   cartographic materials — i.e. the servitude geometry may already be inside the municipality's own
   plan annexes rather than requiring an external AESA feed, but this was not opened and confirmed.
   **Status: unmodelled; a promising, unconfirmed in-plan lead exists.**
4. **Environmental** (Red Natura 2000, ZEC Sotos y Galachos del Ebro) — codebase: not modelled.
   **Live finding:** the guessed MITECO Natura 2000 WMS endpoint failed with the identical server error
   as the flood layer, suggesting a broken legacy MITECO proxy rather than confirming or denying data
   availability. **Status: unmodelled, existence of a usable live endpoint not established either way.**

Net: the codebase's honest claim — "PRYZM models zero constraint layers here" — **stands, and this
audit was unable to upgrade any of the four to "confirmed available and wireable" or definitively
downgrade any to "confirmed unavailable."** All four remain open unknowns from a live-data standpoint.

## Blockers

- **Legal (signature):** `ZARAGOZA_ENVELOPE_VERIFIED` requires a Spanish-planning-literate human to
  sign `sources/VERIFICATION.md` before any determination-grade figure may publish for any of the 4
  packed subgrados. No engineering change substitutes for this.
- **Legal/research (transcription volume):** 48 of 52 calificación codes (92 %) have zero legal reading
  — the 4 packed subgrados are a narrow slice of Título Cuarto, and 7 of 8 Títulos plus the Anejos are
  entirely unread by PRYZM.
- **Engineering (street-width source):** `resolveZaragozaStreetWidth.ts` is intentionally injection-only
  and refuses `not-wired` because no Zaragoza block/parcel-neighbourhood geometry source feeds it in
  production — this blocks A1/3.1 and A1/3.2 (341 polygons) from even the indicative pathway.
  `ZARAGOZA_ALIGNMENT_CANDIDATE` records a geometry candidate (`urbanismo:Linea_Normativa`) that is
  measured but explicitly not adopted because its semantics are unpublished by the city.
  `ZARAGOZA_A1_3_2_TRAVESIA_GAP` is a further named, unresolved sub-gap (a street-name lookup problem)
  inside even the packed A1/3.2 zone.
  **This is not a GIS-solvability dead end** — the underlying `measureStreetWidths` machinery exists
  and works elsewhere; Zaragoza specifically lacks the input geometry feed.
- **GIS-solvability (constraints):** heritage/flood/environmental endpoints this audit tried were either
  unreachable, erroring, or simply absent from the sources checked — none is confirmed solvable with a
  live public endpoint today; the airport lead (in-plan Anejo cartography) is unconfirmed but plausible.
- **Documentation staleness (process risk, not a technical blocker):** `NEXT.md` and `RISK-REGISTER.md`
  in this same jurisdiction folder are dated 2026-07-30 and state "NO rule pack" / zoning
  "not-assessed" — both are now factually superseded by `esZaragoza.ts` (a real, page-cited pack exists)
  and by today's `§ZARAGOZA-LISTING` open-top-indicative registration. These two docs should be treated
  as out of date, not as the current state.

## Estimated Unlock Effort: **Large**

Closing the legal signature alone is a bounded, small task once a qualified human is available. But
"city-wide" per the brief requires: (a) transcribing the remaining 48 zone codes across 7 more Títulos
and the Anejos (a large, multi-week legal-reading effort, at the same page-cited discipline already
demonstrated), (b) wiring a real Zaragoza block/parcel-neighbourhood geometry source for street-width
measurement (medium engineering effort — the measurement machinery already exists, only the feed is
missing), and (c) actually locating and wiring at least the flood and airport layers, which this audit
could not confirm are even reachable via a working public endpoint (open-ended research effort, since
two attempted MITECO endpoints errored outright). Taken together this is a **Large** program, not a
single PR.

## Recommendation: **Research first**

The narrow indicative slice (A1/4.1, A1/4.2, ≈4 % of polygons) can be exercised today for demo/massing
purposes with its caveats stated in the record (`ZARAGOZA_MISSING_CONSTRAINTS`), and that is a
reasonable "build now, narrowly" move already made in the registry. But before investing further
engineering into Zaragoza specifically, the flood/heritage/airport/environmental endpoint research
needs to actually locate working services — this audit tried plausible URLs and hit dead ends or
server errors on 3 of 4 families, which is a materially different finding from "known to not exist."
That research should happen before more transcription effort, since a transcribed-but-unconstrained
envelope is exactly the L-616 overstatement risk the codebase's own comments repeatedly flag.

## PRYZM Readiness Score: **16 / 100**

Justification: +8 for a genuinely live, correct, city-scale zone resolver (rare — most Spanish cities in
this repo don't have this); +4 for one demonstrably real, page-cited legal transcription covering 4
zones with proper honesty scaffolding (gates, named gaps, provenance ceilings); +4 for the
just-shipped indicative listing actually functioning for a small real slice. Held down hard by: 0 %
of the city reachable at determination grade (signature gate, correctly, never flips itself); 92 % of
zone codes with no legal reading; 2 of 4 packed zones non-functional in production pending a street-
width source; and all four constraint families both unmodelled AND, per this session's live checks,
not even confirmed as *reachable* endpoints.

## Compare against: Barcelona, Murcia, Balears, Sevilla, Valencia, Granada, Córdoba, Málaga

(Cited from what already exists in this repo — not independently re-verified live this session, per the
brief's scope for this section.)

| City | Determination gate | Zone coverage breadth | Notable state |
|---|---|---|---|
| **Barcelona** | Long-standing production reference implementation (many dedicated rulepacks: Eixample, Nucli Antic, 22@, industrial, semi-intensiva, volumetria, etc.) plus a wired AESA airport-servitude KMZ and Catalunya flood overlay | Widest of any city in this repo | The template every other city's "closed, gated shut" pattern cites itself against |
| **Murcia** | `MURCIA_ENVELOPE_VERIFIED = true` (SIG-MU1, per `registry.ts` comment dated 2026-08-01) | Ancho-de-calle table + PGOU 2012 pack, live block/alignment source (`Murcia:pgou_alineaciones`) feeding street width directly — the wiring Zaragoza still lacks | Currently the most-verified non-Barcelona Spanish city in this repo |
| **Balears** | `BALEARS_ENVELOPE_VERIFIED = false`, but `BALEARS_OPEN_TOP_INDICATIVE` is listed (founder-authorised 2026-08-03) | MUIB normative fitxa apparatus; only ~2 % of fitxes carry both a complete rule and an article citation | Six named missing-constraint families (more than Zaragoza's four) |
| **Sevilla** | `SEVILLA_ENVELOPE_VERIFIED = false` | Parameter-cited pack, same "registered but gated shut" pattern as Zaragoza/Córdoba | Not open-top-indicative listed (per this file's own header note) |
| **Valencia** | `VALENCIA_ENVELOPE_VERIFIED` referenced as a gate (esAragon.ts cites it alongside Córdoba's) | Refusal jurisdiction — buildable depth graphically regulated on "Plano C" sheets, same class of blocker as Huesca/Zaragoza's fondo issue | Recorded as a case where the "graphic-only" premise should be re-tested, per `esAragon.ts`'s own §PLANO5-IS-VECTOR note |
| **Granada** | `GRANADA_ENVELOPE_VERIFIED = false`, described in-code as "NOT SIGNABLE AT ALL today" — a third kind of gate distinct from Málaga's | — | Worse-off than Zaragoza per its own file's framing |
| **Córdoba** | Two gates referenced: `CORDOBA_ENVELOPE_VERIFIED = true` (`esCordobaZoneClassification.ts`) alongside a separately-gated `false` in `esCordobaPGOU2001.ts` for other zone families (MC/CTP-1/UAD) | Structural template `esZaragoza.ts` explicitly imitates | Mixed state — some zone families verified, others not, same layered pattern Zaragoza is heading toward |
| **Málaga** | `MALAGA_ENVELOPE_VERIFIED = false` | — | Same closed-gate family as Zaragoza/Sevilla/Granada |

Zaragoza sits in the middle of this pack: better-instrumented (live city-wide zone resolver) than most
of the still-gated cities, but with less legal transcription completed than Córdoba/Sevilla and no
live street-width feed the way Murcia has. It is not close to Barcelona's or Murcia's operational tier.

## Final Verdict

PRYZM can locate a Zaragoza parcel, resolve its exact PGOU-2024 calificación code live, and — for a
4.1 % slice of the city's polygons — draw a non-authoritative massing envelope today. It cannot, and
will not soon, produce a legally-defensible, city-wide buildable envelope for Zaragoza.

**Single biggest blocker:** the compounding of an unsigned legal gate (`ZARAGOZA_ENVELOPE_VERIFIED`,
correctly withheld pending a founder-authorised human legal sign-off) with a 92 %-unread ordinance —
even a same-day signature would only unlock 4 of 52 zone codes, and only 2 of those 4 function in
production today because the street-width source the other 2 need was never wired. There is no single
fix; there is a legal-review backlog sitting on top of an unfinished engineering feed.
