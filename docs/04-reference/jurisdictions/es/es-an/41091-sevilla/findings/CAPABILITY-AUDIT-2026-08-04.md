# Sevilla (INE 41091) — CITY-WIDE Capability Audit

> **Date:** 2026-08-04. **Scope:** the whole municipality of Sevilla — NOT just the SB
> ("Suburbana") zone this session's prior work transcribed and wired
> (`packages/site-parcel-data/src/rulepacks/esSevilla.ts`,
> `providers/resolveSevillaZone.ts`, `providers/resolveSevillaAlignments.ts`, `sevillaFondoClip.ts`,
> `apps/editor/src/ui/site/siteDispatch.ts` §SEVILLA-ENVELOPE, all read in full before this audit).
> Prior research read in full and not duplicated:
> [`findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./FORENSIC-BLOCKER-AUDIT-2026-08-03.md),
> [`findings/SOURCE-founder-sevilla-research-programme-2026-08-03.md`](./SOURCE-founder-sevilla-research-programme-2026-08-03.md).
> Regional overlay findings inherited (not re-derived, cited as inherited where used):
> [`../ANDALUCIA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md`](../ANDALUCIA-REGIONAL-CAPABILITY-AUDIT-2026-08-04.md).
> Every endpoint below not marked "inherited" was independently `WebFetch`/`WebSearch`-checked in
> this session, same day. **This audit is research only — it recommends nothing be built, and no
> code was written to produce it.**

---

## Executive Summary

Sevilla's own ArcGIS service (`cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU`)
genuinely covers the whole municipality at parcel-usable scale — Layer 25 ("Calificación") holds
**13,863 features across 15 real `zona_orden` zone-family codes** (`M, ST-C, CT, IS, AD, CH, A, IC,
CJ, MP, UA, SB, IA, SA, ST-A`, confirmed live this session, plus null/blank rows and one anomalous
`"ver PG 87"` graphic-pointer value), inside an extent bounding box that comfortably contains the
~140 km² municipal boundary. This confirms the founder research programme's central optimistic
claim: Sevilla is not a geometry-discovery problem. But this session's own prior work already
transcribed only **one** of those 15 families (`SB`), and even that one transcription still carries
three `null` parameters (height, FAR, rear setback) and required a hard structural refusal on
buildable depth until the Layer-4 `Alineaciones` alignment-line discovery unblocked it this same
session (`SEVILLA_SB_FONDO_UNRESOLVED_RING` → `resolveSevillaAlignments.ts`). The other 14 zone
families sit at exactly the pre-SB starting point: their ordinance chapters almost certainly exist
as native-text PDF inside the same consolidated `06_TR_NORMAS.PDF` document Sevilla's own
`web.urbanismosevilla.org` serves (search results confirm Título XII names chapters for `M`, `A`,
`CH`, `Ciudad Jardín`, `Vivienda Unifamiliar Adosada`, `Conservación Tipológica` — a family match to
the code list), but **not one of their chapters was opened or transcribed this session**, and the
Layer-4 alignment mechanism that rescued `SB`'s buildable-depth refusal is verified to carry
**zone-specific code families of its own** (`CH` has its own `CS_CH_DIVISION_ALTURA` /
`CH_DIVISION_ALTURA` / `LABEL_CH` alignment codes, distinct from `SB`'s `A_INTERIOR-MAXIMA`) — meaning
the mechanism plausibly generalises architecturally, but its legal grammar almost certainly does
**not** generalise 1:1, especially for `CH` (Centro Histórico, heritage-protection-driven form
rules) and the industrial/tertiary families (`IC`/`IA`/`ST-A`/`ST-C`, typically governed by
freestanding-block `edificación abierta` rules, not continuous street-alignment massing). Regional
overlays for heritage, flood, and environment are real and live (inherited from the Andalucía
regional audit, re-confirmed at the WMS-capabilities level for heritage this session) but were
checked at metadata/portal depth, not byte-level `GetCapabilities` depth, for Sevilla specifically.
Sevilla's historic centre carries at least one delegated instrument (a PEPRI/Plan Especial for the
Casco Antiguo, confirmed to exist via search, never independently opened) whose share of the
municipality's buildable land was **not measured** this session — an open research task, not a
guess. **Sevilla is the strongest-evidenced Andalucían capital for zoning geometry, and now has one
genuinely working (dispatch + staged-preview) pipeline for one zone family out of fifteen — but a
city-wide legally-defensible envelope engine remains a fourteen-zone research programme, not an
engineering task.**

---

## Capability: **Research Blocked** (city-wide) — with `SB` individually **Legally Blocked** (verification-gated, not research-blocked)

Two different answers are honest at two different scopes, exactly as `SEVILLA_ENVELOPE_VERIFIED`'s
own module header already states for `SB` alone:

- **City-wide (all 15 zone families):** **Research Blocked.** 14 of 15 `zona_orden` families have
  zero PRYZM-read ordinance text. The geometry precondition (does a usable zoning layer exist at
  all) is answered — yes — but §B/§C of the founder's own three-pass capture ("legal grammar
  extraction... probably 70% of the project," "the largest hidden problem [is conditional grammar]")
  is unstarted for 14/15 families. This is not an engineering blocker: nothing has been built to
  block on for those 14 families, and no external authority has refused access — the same PDF
  corpus that yielded `SB` is sitting at the same URL for the others.
- **`SB` alone:** **Legally Blocked.** Zone identity, alignment geometry, and a staged
  (uncertified-preview) render pipeline all work end-to-end (`applySevillaZoningThenFallback` in
  `siteDispatch.ts`, confirmed by direct code read this session). What blocks `SB` specifically is
  `SEVILLA_ENVELOPE_VERIFIED = false` — a founder-only sign-off gate (L-449) — plus three still-`null`
  parameters (`maxHeight_m`, `maxFloors`, `plotRatioFAR`) and one conditional rule
  (`setbacks.rear_m`) that Art. 12.5.6/12.5.7/12.5.9's own conditional grammar (parcel-size- and
  depth-dependent) has not yet been resolved into a per-parcel solver. This is the correct,
  narrower kind of block — legal sign-off and residual parameter-grammar work, not "we don't know if
  this is possible."

---

## Evidence Matrix

| # | Research area | Status | Evidence |
|---|---|---|---|
| 1 | Planning documents (14 other zones) | **Unread, plausibly native-text** | `web.urbanismosevilla.org/planeamientopgou/pdfs/06_TR_NORMAS_URBANISTICAS/06_TR_NORMAS/06_TR_NORMAS.PDF` — same consolidated Título XII document `SB`'s Capítulo V (Arts. 12.5.1–12.5.13) was read verbatim from this session's prior pass. `WebFetch` on this URL this session returned raw PDF binary (not text-extractable by the fetch tool; saved locally, not opened page-by-page). Web-search snippets independently name Título XII chapters for `Centro Histórico`, `Edificación en Manzana`, `Edificación Abierta`, `Ciudad Jardín`, `Vivienda Unifamiliar Adosada`, `Conservación Tipológica` — a direct family match to 6 of the 15 live `zona_orden` codes, consistent with (not proof of) the same one-chapter-per-zone-family structure `SB` exemplifies. **Not independently confirmed**: page ranges, article numbering, or — critically — whether each chapter shares `SB`'s front=0/side=0/conditional-rear grammar, or a materially different one (perimeter-block vs. freestanding-block vs. heritage-driven). |
| 2 | Zoning geometry, whole-municipality coverage | **Confirmed live, whole-municipality** | `Info_Urban_Groups/PGOU/FeatureServer/25` (Calificación): **13,863 total features** (`returnCountOnly=true`, fetched live this session), extent `xmin 232200.17, ymin 4133728.90, xmax 248461.05, ymax 4149115.62` (EPSG:25830) — a ~16.3 km × 15.4 km bounding box comfortably containing Sevilla's ~140.8 km² municipal area. **18 distinct `zona_orden` values** returned by a live `returnDistinctValues` query: 15 real zone-family codes (`M, ST-C, CT, IS, AD, CH, A, IC, CJ, MP, UA, SB, IA, SA, ST-A`) plus `null`, a blank/whitespace value, and one anomalous `"ver PG 87"` string (a graphic-only cross-reference, not a code — a data-quality/instrument-resolution flag in its own right, unresolved this session). Layer-4 Alineaciones also answered live with 18 distinct `layer` field values, including **zone-specific families not previously seen** (`CS_CH_DIVISION_ALTURA`, `CH_DIVISION_ALTURA`, `LABEL_CH`, `_Provisional`) alongside `SB`'s already-confirmed `A_EXTERIOR`/`A_INTERIOR-OBLIGATORIA`/`A_INTERIOR-MAXIMA` family — confirming the alignment mechanism is not `SB`-exclusive, though its total-feature-count claim from this same fetch (**"18"**) directly **contradicts** the prior session's own already-confirmed count of 28 real features for `A_INTERIOR-MAXIMA` alone, meaning that number is unreliable (likely the tool's summarizer conflated distinct-value count with total-record count, or an unpaginated default cap) — flagged, not corrected by guess. |
| 3 | Parcel geometry | **Presumed national Catastro, standard pattern** | Not independently re-fetched this session at byte level for Sevilla specifically. Spanish national Catastro INSPIRE WMS/WFS/ATOM (`catastro.hacienda.gob.es`, ETRS89, per-municipality ZIP/GML download, continuously-updated WFS + bulk ATOM) is confirmed live-and-standard by every other Spanish jurisdiction already audited in this repo (Barcelona, Córdoba, Málaga, Murcia, Zaragoza) — no municipality-specific parcel deviation found or expected for Sevilla. Treat as **high-confidence inherited, not independently verified this pass.** |
| 4 | Envelope parameters, other zones | **Mechanism plausible, grammar unverified** | The Layer-4 alignment mechanism that resolved `SB`'s buildable-depth refusal is architecturally zone-agnostic (a `layer`-field classification on a citywide polyline layer), and `CH`'s own alignment codes prove it is at minimum *populated* for a second zone family. But whether `CH`'s (or the other 13 zones') ordinance TEXT uses the same front=0/side=0/conditional-rear-via-fondo-line grammar `SB`'s Capítulo V does is **unverified** — and *a priori* unlikely for `CH` (heritage-protection-level-driven height and massing, per Art. 12.5.7's own precedent of height-fixed-per-manzana rather than zone-wide) and for the industrial/tertiary families (`IC/IA/ST-A/ST-C`, typically `edificación abierta`/freestanding-block rules in Spanish PGOUs, which do not resolve to a single street-alignment fondo line the way perimeter-block zones like `SB`/`M`/`CJ`/`AD` might). |
| 5 | Heritage (UNESCO + BIC) | **Regional GIS exists, Sevilla-specific depth unconfirmed** | IDEAndalucia WMS `ideandalucia.es/wms/dea100_patrimonio` — `GetCapabilities` fetched live this session — exposes `patrimonio_humanidad` (World Heritage Sites — the plausible carrier of the Catedral/Alcázar/Archivo de Indias 1987 UNESCO serial inscription), `Patrimonio_inmueble`/`Patrimonio_inmueble_pol` (immovable heritage/BIC), `Espacios_culturales`, at **DEA100 (1:100,000) generalised scale** (per the Andalucía regional audit's own finding, inherited here — too coarse for parcel-level determination). The sharper `bica_public` GeoServer WMS/WFS (CGPHA/ZSA/IBR, EPSG:25830) confirmed live in the regional audit session is **inherited, not re-fetched for Sevilla specifically this session.** Sevilla's own PGOU additionally carries a documented **Catálogo Periférico** (114 buildings/parcels outside the historic centre with individual protection levels, per `sevilla.org` search results) and a historic-centre Plan Especial (PEPRI/Plan Especial de Protección del Casco Histórico, per a Dialnet academic PDF found this session) — **neither the Catálogo Periférico's parcel list nor the PEPRI's delimitation was found as a queryable GIS layer this session**; both may exist behind the sign-in-gated `Contenidos` folder on `cdu.urbanismosevilla.org` (checked live this session, returned a login page — **contents unknown, not confirmed absent**). |
| 6 | Flood (Río Guadalquivir) | **Regional GIS exists, not byte-verified this pass** | REDIAM "Zonas inundables asociadas a periodos de retorno (T10, T50, T100, T500) en Andalucía" WMS/WFS (Portal Ambiental de la CSMA) and CHGuadalquivir basin-authority WMS (`idechg.chguadalquivir.es`) both confirmed at search-result/portal-page level this session (inherited pattern from the regional audit, not independently re-checked at `?request=GetCapabilities` byte level for a Sevilla bounding box this session). National SNCZI (MITECO) is a documented fallback/cross-check viewer. Directly relevant: the Guadalquivir runs through the city centre, historically floods (1961, 1963 events widely documented), and the river's edge sits within a few hundred metres of `CH` (Centro Histórico) parcels. |
| 7 | Airport (Sevilla–San Pablo) | **Legal servitude confirmed, GIS endpoint NOT found this session** | `BOE-A-2017-10311` (Real Decreto 764/2017) confirms Sevilla airport's aeronautical servitudes are legally defined and current. Sevilla's own PGOU carries a static plan sheet, "Plano de servidumbres aeronáuticas del aeropuerto de Sevilla" (per a Fidas normativas-index page found this session) — evidence the constraint is at minimum drawn, not evidence it is published as queryable GIS geometry. Unlike Barcelona's confirmed-live AESA KMZ servitude geometry (this repo's own prior finding, memory: "Barcelona airport resolved — AESA KMZ has full 3D servitude geometry"), **no equivalent live AESA GIS/KMZ endpoint for Sevilla was found or fetched this session** — status is UNKNOWN, not ABSENT; a national AESA source plausibly exists (per the Barcelona precedent) but was not searched for specifically enough this pass to confirm. |
| 8 | Environmental (Natura 2000, Doñana) | **Regional GIS exists; city-specific proximity unmeasured** | REDIAM Red Natura 2000/RENPA WMS/WFS is Andalucía-wide (inherited from the regional audit). Sevilla capital's own municipal boundary does **not** intersect the Doñana core protected area (~80 km SW, in the Guadalquivir marshes near Almonte/Aznalcázar) nor the Sierra Norte de Sevilla natural park (northern half of the province) — both confirmed as province-level, not capital-adjacent, facts via search this session, though the exact nearest Natura 2000/ZEPA polygon to the Sevilla urban core (candidates include riverine corridors along the Guadalquivir/Guadaíra) was **not individually identified** this session. |
| 9 | Legal delegation (PERI/PEPRI) | **Confirmed to exist, share of urban land NOT measured** | A Plan Especial de Protección y Reforma Interior (PEPRI) / Plan Especial for Sevilla's Casco Histórico is confirmed to exist (Dialnet academic source, `sevilla.org` catálogo-periférico page), meaning at least the `CH` zone family — and possibly parts of adjoining families near the historic core — is governed by a **delegated instrument that would override or refine** the base PGOU's `CH` chapter, exactly the founder capture's own "Stage 0 — Instrument resolution... probably the biggest missing legal abstraction" concern. This session ran **no area-aggregation query** against Layer 25 to compute `CH`'s (or any zone's) share of the 13,863-feature/~140 km² total — a citable percentage was not attempted and would be a guess if stated. Separately, `Modificaciones_PGOU` (Layer 15, a distinct live MapServer+FeatureServer service, confirmed live both in the prior session's forensic audit and structurally present in this session's service-root listing) still has an **unresolved precedence question**: does a modification polygon override the base PGOU for an enclosed parcel? Not answered this or the prior session. |
| 10 | Dispatch feasibility, all zones | **Works for 1 of 15 zone families; trivial-to-extend once #1/#4 are done for each** | Direct code read of `apps/editor/src/ui/site/siteDispatch.ts` (§SEVILLA-ENVELOPE, `applySevillaZoningThenFallback`, lines ~3533–3718) confirms: `isInSevilla` → `resolveSevillaZone` → (if `zona_orden` maps to a code in `SEVILLA_PGOU_ZONE_CODES`) `resolveSevillaAlignments` → `clipParcelByFondoLine` → an **"uncertified preview"** staged render (caveated, not a legal determination) → else a cited, zone-named refusal (`sevillaNoRulePackRefusal`). `SEVILLA_PGOU_ZONE_CODES` is **derived from `ES_SEVILLA_PGOU_PACK.zones`**, currently `['SB']` only — so all 14 other zone families, even where a parcel's zone resolves correctly and confidently, fall straight to the cited refusal today. The dispatch *machinery* (zone resolve → alignment resolve → geometric clip → staged render OR refusal) is now zone-agnostic and re-usable; extending it to a 2nd/3rd/… zone family is an engineering-cheap step **once each zone's ordinance text and alignment-code family are individually read and transcribed** — the bottleneck is #1/#4 (research), not #10 (engineering). |

---

## Machine-readable assets — every verified endpoint

- **`https://cdu.urbanismosevilla.org/arcgis/rest/services/Info_Urban_Groups/PGOU/FeatureServer/25`**
  (Calificación) — **live, confirmed this session.** 13,863 features, EPSG:25830, `zona_orden` field
  (no coded-value domain — free string), `u_global` field (`UsoGlobalPormenorizado` coded domain,
  40+ values, confirmed live), `altura_max` (string, unit unresolved — inherited from prior session),
  `enlace_ng`/`enlace_np` (PDF links, direct-vs-lookup still unverified).
- **`.../Info_Urban_Groups/PGOU/FeatureServer/4`** (Alineaciones) — **live, confirmed this session
  and the prior one.** 18 distinct `layer` classification values confirmed this session (superset of
  the `SB`-relevant codes already used in `resolveSevillaAlignments.ts`); `CH`-specific alignment
  code family confirmed present (`CS_CH_DIVISION_ALTURA`, `CH_DIVISION_ALTURA`, `LABEL_CH`).
- **`.../Info_Urban_Groups/PGOU/MapServer`** — root service listing confirmed live this session: 6
  layers (Etiquetas y Altura máxima [1], Alineaciones [4], Modificaciones PGOU [15], Planeamiento de
  Desarrollo [20], Clasificación [24], Calificación [25]) — matches the prior session's inventory
  exactly, no drift.
- **`.../Modificaciones_PGOU/MapServer`** and **`.../Modificaciones_PGOU/FeatureServer`** — separate,
  standalone service (not just a sub-layer of `Info_Urban_Groups`) confirmed present in this
  session's root service-catalog listing.
- **`.../InfoUrban/Parcelario_GU_2004`** (FeatureServer + MapServer) — **newly found this session**,
  not mentioned in either prior capture. A municipal parcel/cadastral-reference layer dated 2004 —
  plausibly a legacy/reference cadastral snapshot, not confirmed as authoritative or current; worth
  a dedicated follow-up probe before assuming it substitutes for or duplicates national Catastro.
- **`.../InfoUrban/Anexos_Ordenanza_Publicidad`** (FeatureServer + MapServer) — newly found this
  session; advertising/signage ordinance annex — not envelope-relevant, noted for completeness.
- **`https://web.urbanismosevilla.org/planeamientopgou/pdfs/06_TR_NORMAS_URBANISTICAS/06_TR_NORMAS/06_TR_NORMAS.PDF`**
  — the consolidated Título XII Normas Urbanísticas document; **reachable (HTTP fetch succeeded,
  1.7 MB PDF), not text-extracted or indexed this session** (the fetch tool returned raw binary,
  not parsed prose — a follow-up needs a proper PDF-text extraction pass, not another `WebFetch`).
- **Catastro INSPIRE WMS/WFS/ATOM** (`catastro.hacienda.gob.es`) — national, standard, inherited
  as high-confidence per every other Spanish jurisdiction in this repo; not independently re-checked
  for Sevilla this session.
- **IDEAndalucia `dea100_patrimonio` WMS** (`ideandalucia.es/wms/dea100_patrimonio`) — **live,
  `GetCapabilities` fetched this session.** Layers: `patrimonio_humanidad` (World Heritage),
  `Patrimonio_inmueble`/`Patrimonio_inmueble_pol` (BIC), `Espacios_culturales`, `cuevas`,
  `Espacios_naturales`, `pepmf`, `Lugares_interes_comunitario`, `Unidades_Paisaje` — DEA100
  (1:100,000) scale.
- **`bica_public` GeoServer WMS/WFS** (`ws096.juntadeandalucia.es/geoserver/bica_public/{wms,wfs}`)
  — sharper heritage layer (CGPHA/ZSA/IBR, EPSG:25830), confirmed live **in the regional audit
  session**, inherited here, not re-fetched this session for a Sevilla-specific query.
- **REDIAM flood return-period WMS/WFS** and **CHGuadalquivir basin-authority WMS**
  (`idechg.chguadalquivir.es`) — confirmed at search/portal level this session; inherited pattern
  from the regional audit for byte-level confidence.
- **AESA / BOE legal servitude text** — `boe.es/diario_boe/txt.php?id=BOE-A-2017-10311` (Real
  Decreto 764/2017) — confirms the servitude is legally current; not a GIS endpoint.

---

## Missing assets

- **13 of 15 zone-family ordinance transcriptions** (`M, ST-C, CT, IS, AD, CH, A, IC, CJ, MP, UA,
  IA, SA, ST-A` — all but `SB`). No PDF chapter was opened this session beyond confirming the
  consolidated document is reachable.
- **Per-zone alignment-grammar mapping.** Layer 4's code families exist per zone (`SB`'s
  `A_INTERIOR-MAXIMA`, `CH`'s `CH_DIVISION_ALTURA`/`LABEL_CH`), but which ordinance article each
  code family answers, for zones other than `SB`, is unmapped.
- **A byte-level `GetCapabilities` check of `bica_public`, REDIAM flood, and REDIAM Natura 2000 for
  a Sevilla-specific bounding box.** All three are inherited at portal/metadata depth from the
  regional audit; none was independently re-verified this session for Sevilla's own extent.
- **A live AESA GIS/KMZ endpoint for Sevilla–San Pablo airport**, equivalent to the one already
  confirmed for Barcelona. Not found this session.
- **The `Contenidos` folder's contents** on `cdu.urbanismosevilla.org` — sign-in-gated, returned a
  login page this session. Unknown, not confirmed empty; may hold heritage/catalogue layers.
- **A per-zone area query against Layer 25** — the share of the municipality's ~140 km² (or of the
  13,863 features) each `zona_orden` family covers, and specifically `CH`'s share, needed to
  estimate the % of urban land under delegated PEPRI/Plan Especial governance. Not run this session.
- **PEPRI/Plan Especial del Casco Histórico's own delimitation as a GIS layer**, and its precedence
  relationship to the base PGOU `CH` chapter. Confirmed to exist as an instrument; not located as
  data.
- **`Modificaciones_PGOU` precedence logic.** The layer is live; whether/how a modification polygon
  overrides the base `Calificación` polygon for an enclosed parcel remains unresolved from both
  sessions.
- **Text extraction of `06_TR_NORMAS.PDF`** — fetched as bytes, not parsed as prose, this session.
- **`altura_max`'s unit** (metres vs. storeys) — still unresolved, inherited unchanged from the
  prior session; not re-attempted this pass.

---

## Blockers

1. **13/15 zone ordinances unread.** *Solvable?* Yes — same mechanism `SB` already proved (native
   PDF extraction, article-cited transcription), but each zone is its own multi-day research pass,
   not a batch job; heritage-driven zones (`CH`) and freestanding-block zones (`IC/IA/ST-A/ST-C`)
   are flagged as likely requiring a *different* grammar model than `SB`'s front/side/depth pattern,
   not a copy-paste of it. Research, not engineering, not legal.
2. **`CH` (Centro Histórico) likely needs a fundamentally different envelope model.** Historic-centre
   ordinances in Spanish PGOUs typically key height/massing to individual building protection levels
   and per-manzana graphic determinations (exactly the pattern `SB`'s own Art. 12.5.7 §2 already
   shows even for a non-historic zone) rather than a flat zone-wide rule. *Solvable?* Only after the
   PEPRI/Plan Especial instrument (blocker 3) is itself read — `CH`'s base-PGOU chapter alone may be
   legally insufficient without it. Research + legal-instrument-resolution, not engineering.
3. **PEPRI/Plan Especial delegation, precedence, and area-share unmeasured.** *Solvable?* Yes,
   research task: locate the instrument's own text/GIS, and run the area-aggregation query against
   Layer 25 this session skipped. Not an external-authority block (the instrument is public), not
   engineering.
4. **`Modificaciones_PGOU` precedence logic unresolved.** *Solvable?* Yes, research (read the layer's
   fields + a sample of linked modification documents to infer the precedence convention) — not
   discovered as engineering-blocked or authority-blocked.
5. **Heritage/flood/environmental overlays confirmed at portal/metadata depth, not byte-level
   `GetCapabilities` depth, for Sevilla's own extent.** *Solvable?* Trivially — a direct fetch of
   each service's actual WMS/WFS endpoint scoped to Sevilla's bounding box, minutes of work, GIS-
   solvable, no legal or engineering barrier.
6. **No confirmed live airport GIS/KMZ source for Sevilla**, unlike Barcelona's precedent.
   *Solvable?* Plausibly GIS-solvable — search AESA's own citizen portal (`sede.seguridadaerea.gob.es`)
   for a downloadable geometry layer analogous to Barcelona's, not attempted deeply enough this
   session to say more.
7. **`Contenidos` folder access-gated (sign-in required).** *Solvable?* Unknown — may require a
   credentialed request to Gerencia de Urbanismo y Medio Ambiente (the same category of block as
   Canarias' vigencia gate — a founder/administrative act, not a public-endpoint problem — but
   unconfirmed whether the gate is a real authorization barrier or merely an unlinked-but-public
   admin panel; not tested with any credential this session).
8. **`altura_max`'s unit remains formally unresolved** for `SB` and, by extension, every other zone.
   *Solvable?* Yes, research — cross-reference against the Layer-1 "Etiquetas y Altura máxima"
   symbology/legend metadata or the ordinance text's own height table per zone (the same method that
   nearly resolved it for `SB` this session, short of a documented convention).

---

## Estimated Unlock Effort

**Very Large**, city-wide — 14 more zone-family research passes at roughly the depth `SB` already
took (each requiring native-PDF reading, article citation, conditional-grammar resolution, and — for
`CH` specifically — a second, likely much larger, PEPRI/Plan Especial research pass on top), plus the
still-open cross-cutting items (Modificaciones precedence, area-share measurement, byte-level overlay
verification, airport GIS discovery). None of this is blocked by external authority or unsolved
engineering — every open item above is either a research task or a GIS-verification task — but the
volume (14 zone families × the density §B/§C of the founder capture already describes as "probably
70% of the project" per zone) makes "Very Large" the honest label, not "Large."

**Small**, for `SB` alone — the remaining gap is founder sign-off (L-449, a legal act, not
engineering) plus resolving three still-`null` parameters and one conditional rear-setback rule
using the same per-parcel-area/depth logic Art. 12.5.4/12.5.6 already state in closed form.

---

## Recommendation

**Research first — do not build a city-wide Sevilla envelope engine yet.** The zoning-geometry
precondition is real and citywide (a genuinely strong result this session adds: 13,863 features, 15
zone codes, confirmed alignment-mechanism reuse for a second zone family), so Sevilla remains worth
continued investment — but 13 of 15 zone families have not had their ordinance text opened even
once, `CH` almost certainly needs an entirely separate PEPRI research track, and several
cross-cutting legal-precedence questions (Modificaciones, PEPRI-vs-base-PGOU) are unresolved. **Do**
independently verify the three regional overlay services (heritage, flood, environment) at
byte-level `GetCapabilities` depth for Sevilla's own extent — this is Tiny effort per the regional
audit's own finding and applies uniformly regardless of the zoning-ordinance research programme's
pace. **Do** continue `SB`'s own path toward founder sign-off (Small effort) as a proof instance,
since its dispatch/render machinery is already reusable for the next zone family once that family's
ordinance is read. **Do not** extend `SEVILLA_PGOU_ZONE_CODES` to any new zone code without first
reading that zone's own ordinance chapter — the empty-until-read discipline `esSevilla.ts` already
documents for the other 14 codes is correct and should not be shortcut by inference from `SB`'s
pattern.

---

## PRYZM Readiness Score: **38 / 100**

Scored city-wide (all 15 zone families), not as `SB` in isolation (which would score materially
higher — its dispatch + staged-preview pipeline is real and working, gated only on sign-off).
Weighted buckets, mirroring the regional audit's methodology:

- **Zoning geometry + ordinances (40 max): 12/40.** Geometry is live, citywide, and multi-zone
  (strong: worth ~25 of the 40 on geometry alone) — but ordinance transcription is 1/15 zones, and
  that one zone still carries three `null` parameters and one unresolved conditional rule, dragging
  the combined score down heavily.
- **Parcel (10 max): 8/10.** Standard, high-confidence national Catastro inheritance; not
  independently re-verified this session (hence not 10/10).
- **Heritage (10 max): 5/10.** Two live regional WMS sources exist and one was `GetCapabilities`-
  confirmed this session, but both are coarse (DEA100) or unverified at Sevilla-specific byte depth,
  and neither the UNESCO boundary nor the PEPRI/Catálogo Periférico delimitation was independently
  located as data.
- **Flood (10 max): 5/10.** Multiple real, directly-relevant regional/basin services exist
  (REDIAM, CHGuadalquivir, SNCZI) but none was byte-verified for Sevilla's extent this session.
- **Environmental (10 max): 5/10.** Regional Natura 2000/RENPA coverage is real and applies
  uniformly; Sevilla-specific proximity/features were not individually identified.
- **Airport (10 max): 2/10.** Legal servitude confirmed current (BOE); no live GIS/KMZ source found,
  unlike the Barcelona precedent.
- **Legal delegation clarity (10 max): 2/10.** A delegated instrument (PEPRI) is confirmed to exist,
  which is worth something over having no idea at all — but its area-share, precedence, and content
  are entirely unmeasured, and `Modificaciones_PGOU`'s precedence logic is likewise unresolved.

**38/100** — meaningfully ahead of the Andalucía region-wide score (22/100, which had no zoning
geometry credit at all) and ahead of Málaga/Granada on the strength of Sevilla's live, multi-zone
Calificación layer, but well behind a jurisdiction with a working multi-zone dispatch pipeline
(Barcelona) or even Córdoba's narrower-but-signed-adjacent single-instrument pack.

---

## Compare against: Barcelona, Murcia, Balears, Zaragoza, Valencia, Granada, Córdoba, Málaga

- **Barcelona** — still the strongest comparator in the portfolio: a full rule pack across multiple
  zone families (Eixample/Nucli Antic/etc.), measured MDS heights, MUC zone-GIS, and (per this
  repo's own memory) a confirmed-live AESA airport-servitude KMZ with full 3D geometry — the exact
  overlay class Sevilla is missing for its own airport. Sevilla's Calificación-layer breadth (15
  zones, citywide) is architecturally comparable to Barcelona's zone diversity, but Barcelona is far
  ahead on ordinance-corpus depth and overlay completeness.
- **Córdoba** — the only other Andalucían capital with working dispatch machinery (a signed-adjacent
  PGOU-2001 pack + zone classification), but per the prior session's own forensic audit, Córdoba's
  reusable parts were "already generic before Córdoba existed" and its own alignment problem (no
  published alignment layer) is the exact gap Sevilla's Layer 4 solves that Córdoba cannot. Sevilla
  is ahead of Córdoba specifically on alignment/depth geometry; Córdoba is ahead on ordinance
  breadth (per this session, unmeasured precisely for either).
- **Málaga** — per this repo's memory, Málaga is the only other Andalucían capital confirmed to
  publish a municipal alignment layer (`LINALIN_T`) — meaning Sevilla and Málaga are, together, the
  only two Andalucían capitals in this repo's findings with any published alignment geometry at all,
  a materially rarer asset than zoning polygons or height attributes across the region.
- **Murcia** — per this repo's memory, the strongest *proven* municipal alignment dataset in the
  portfolio (679 real lines, GeoServer-published, not ArcGIS). Sevilla's 28-confirmed-feature
  `A_INTERIOR-MAXIMA` sample is real but smaller in proven scope; Murcia's container is WFS/GeoServer-
  shaped, Sevilla's is the first confirmed ArcGIS-REST-shaped Spanish municipality in this repo,
  meaning neither's container code is reusable for the other without a new adapter (per ADR-0294/
  ADR-0295 — a region/publisher supplies a container, not a branch).
- **Zaragoza** — cited in this repo's own `SB` pack as the confidence-tier precedent
  (`estimated-ruleset`, `source:'manual'`) Sevilla's pack follows exactly; comparable maturity tier,
  ordinance-corpus breadth not compared this session.
- **Valencia** — cited as the cautionary precedent this audit's own module comments repeatedly
  invoke (the `altura`/L-616/ADR-0287 fabrication risk) for why `altura_max`'s unit is carried as
  `null` rather than guessed. Valencia's own height-semantics saga is the reason Sevilla's height gap
  is being handled conservatively rather than optimistically.
- **Granada** — one of the four Andalucían capitals already audited per the regional audit's own
  scope note; not independently re-compared this session beyond the region-wide finding that all
  four share the "municipal-only, no regional GIS/ordinance shortcut" structural conclusion.
- **Illes Balears (Palma)** — not independently compared this session; no Balears-specific findings
  were surfaced in the materials read for this audit.

---

## Final verdict

**Not today, city-wide — and this is a research gap, not an engineering or legal one, except for
`CH`'s likely PEPRI dependency.** Sevilla has, as of this session, the best-evidenced zoning-geometry
foundation of any Andalucían capital in this repo — a live, 13,863-feature, 15-zone-family
Calificación layer, plus a genuinely reusable alignment/depth-line mechanism now proven for two zone
families (`SB`, and circumstantially `CH`) rather than one. **The single biggest blocker is that 14
of Sevilla's 15 real zone families still have zero PRYZM-transcribed ordinance text** — the
geometry precondition the founder's three-pass research programme worried about turned out not to
be the bottleneck; the 70%-of-the-project legal-grammar-extraction work it also predicted is the
bottleneck, exactly as predicted, and it has been done for one zone out of fifteen. The SB alignment
pattern (real, queryable ArcGIS polyline geometry for buildable depth) **plausibly generalises as a
mechanism** — the layer publishes zone-specific code families beyond `SB`'s own — but it does **not**
yet generalise as **grammar**: no other zone's ordinance text has been checked to confirm it uses the
same front/side/conditional-depth pattern, and `CH` in particular is expected to need a materially
different, PEPRI-dependent model rather than a copy of `SB`'s.
