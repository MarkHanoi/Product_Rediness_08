# COMUNITAT VALENCIANA — REGIONAL CAPABILITY AUDIT (2026-08-04)

> **Scope: REGIONAL.** This audit covers the Generalitat Valenciana's region-wide GIS/legal
> infrastructure for the three provinces (València, Alacant/Alicante, Castelló/Castellón) and the
> cities OTHER THAN the capital (Alicante, Elche, Castellón de la Plana, and the ~540 remaining
> municipalities). **The city of València itself is audited separately** — see
> `46250-valencia/CLOSURE-REGISTER.md` and its siblings, which this document cites but does not
> repeat. Companion municipal stubs exist for `03014-alicante/` and `12040-castellon-de-la-plana/`
> (both `NO PACK — not-assessed`).
>
> Method: live endpoint verification (WFS/WMS `GetCapabilities`/`DescribeFeatureType`/`GetFeature`),
> web search against `.gva.es` primary sources, and cross-reference with the existing repo corpus
> (`VALENCIA-GRAMMAR-HYPOTHESIS.md`, `VALENCIA-DATA-RECON.md`, `REGIONAL-INTAKE-LIST.md`). No GIS
> or legal fact is asserted without a citation. Where a claim could not be verified live, it is
> marked `UNVERIFIED` rather than assumed true or false.

---

## Executive Summary

The Generalitat Valenciana **does** publish a genuine region-wide planning GIS — the **Institut
Cartogràfic Valencià's `terramapas.icv.gva.es/0702_Planeamiento` WFS 1.1.0 service**, a harmonised
product built from municipal plans approved under **Decreto 74/2016** and covering all three
provinces from one endpoint, unlike most of the Spanish regions surveyed so far (which offer either
nothing regional or only a routing layer for the capital). This is a real asset: it exists, answers
unauthenticated, and was independently reached and probed live in this audit — one `GetFeature`
sample returned zoning polygons for Gandia, Xàbia, Xert and Confrides, i.e. genuinely spread across
the region, not capital-centric. But it publishes **zone codes and land classification only** —
`Planeamiento.Zonificacion` carries `clas_suelo`/`zon_suelo`/`dotacion`, never a height, FAR,
setback, coverage or depth field — so it is a **routing/instrument-selector layer, structurally
identical in kind to what the sibling València-city audit found for the capital's own municipal
GIS.** A second regional layer, `InventarioSuSuz` (Inventario de Suelo Urbano y Urbanizable),
carries `legislacion_pp`/`legislacion_pg` (governing instrument) and `sup_m2`/`edif_m2` (surface and
buildable floorspace, but string-typed and of unverified completeness) — the closest thing to a
regional envelope-parameter field found, and it is unread and unmeasured in this audit. A live
municipality-filtered query for Alicante (INE 03014) returned **zero features** against a filter
that returned features for four other municipalities, which is either a genuine coverage gap for
Alicante in this dataset or a filter-syntax artefact — recorded honestly as **unresolved**, not as
proof of either. Regional overlays exist for heritage (BIC/BRL WMS/WFS, `terramapas.icv.gva.es/22_
IGPCV`) and flood (**PATRICOVA**, the region's own flood-hazard/-risk plan, with a public viewer and
a stated but not machine-verified WMS at `mediambient.gva.es`); airport limitation surfaces exist as
three separate Reales Decretos (Alicante-Elche RD 631/2023, Castellón RD 538/2023, València/Manises
RD 856/2008 + noise RD 54/2018) with no confirmed machine-readable geometry service found for any of
them in this session. **No envelope parameter — height, floors, FAR, occupation, setback, buildable
depth or alignment — was found published as GIS data anywhere at regional scale**, which mirrors
exactly what the sibling audit found for the capital: the region's GIS is excellent at *routing*
(which plan governs which parcel) and silent on *entitlement*. Legal delegation to municipal/derived
instruments is the norm, not the exception, everywhere this repo has measured it in this CCAA
(36.40% of València capital's buildable land is delegated). PRYZM could, today, route a parcel
anywhere in the Comunitat Valenciana to its governing plan instrument and its zone code — it could
not, for any of the three provinces, compute a legally defensible buildable envelope from regional
data alone.

---

## Capability: **Research Blocked**

Not Production Ready, not Indicative Ready — no envelope parameter of any kind has been found at
regional scale, so there is nothing to be indicative *about* yet. Not Engineering Blocked or Legally
Blocked in the strict sense either: the blocking fact is that **the region-wide search for envelope
data has not been completed** — only one WFS service (six feature types) and one supplementary
inventory layer have been read in this session; the ~540 non-capital municipalities' own portals
(the equivalent of València city's `geoportal.valencia.es`) have not been surveyed at all, and it is
already known from the sibling audit that municipal portals can carry attributes the regional
harmonisation does not (València's own `altura` field on layer 212 has no regional-layer
equivalent found here). This is the same shape as the **`missing-measurement`** finding the
València-city register made about its own RATE score: the negative evidence is real but the sweep
is not yet exhaustive enough to certify "does not exist" region-wide.

---

## Evidence Matrix

| # | Research area | Finding | Evidence | Verified live? |
|---|---|---|---|---|
| 1 | Planning framework | Municipalities author their own PGOU/PGMO; GVA harmonises approved instruments under Decreto 74/2016 into one regional layer | `terramapas.icv.gva.es/0702_Planeamiento` abstract + IDEV notice re: DECREE 74/2016 classification basis | ✅ WFS GetCapabilities fetched |
| 2 | Zoning geometry (regional) | 6 feature types: `Planeamiento.Zonificacion`, `.Clasificacion`, `.Dotaciones`, `InventarioSuSuz`, `DeclaracionInteresComunitario`, `MinimizacionViviendasSNU` | WFS 1.1.0, EPSG:25830 native (+25831/3857/23030/23031/4230/4258/4326), contact `responde_icv@gva.es` | ✅ GetCapabilities |
| 3 | Zonificacion fields | `clas_suelo`, `zon_suelo`, `dotacion`, `expediente`, `url_abs` — **no height/FAR/setback/depth field** | DescribeFeatureType, 16 attributes enumerated | ✅ |
| 4 | InventarioSuSuz fields | `clasificacion`, `pp`/`ue` (plan/unit refs), `legislacion_pp`/`legislacion_pg`, `sup_m2`, `edif_m2` (buildable floorspace — **string-typed**), management/urbanisation-phase fields | DescribeFeatureType, 38 attributes enumerated | ✅ |
| 5 | Regional coverage — Alicante | `CQL_FILTER=cod_ine_mun='03014'` returned **0 features**; unfiltered sample returned Gandia/Xàbia/Xert/Confrides | Live GetFeature, maxFeatures=5 | ⚠️ Verified as a live result; ambiguous between genuine gap and filter-syntax miss on a MapServer WFS (CQL_FILTER is a GeoServer idiom, not guaranteed on ArcGIS-backed WFS) — **UNRESOLVED, not proof of absence** |
| 6 | Parcel geometry | National Catastro INSPIRE WFS — same uniform national source used everywhere else in the repo; no separate regional cadastre found | Prior repo corpus (`VALENCIA-DATA-RECON.md` §3.3, `sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md` §5) | ✅ (inherited, re-cited not re-run) |
| 7 | Delegation to municipal instrument | `InventarioSuSuz.pp`/`ue`/`legislacion_pp` fields exist regionally but were not read for content in this audit; capital-level delegation is measured at **36.40%** of buildable land | `esValenciaEnvelope.ts` §DELEGATION-MEASURED; `CLOSURE-REGISTER.md` §3 | ✅ (capital only; regional % `UNKNOWN`) |
| 8 | Heritage (regional) | BIC/BRL/Pedra Seca WMS/WFS at `terramapas.icv.gva.es/22_IGPCV` and `carto.icv.gva.es/arcgis/services/tm_cultura/bics/MapServer` — distinct from and NOT gated like València city's own token-walled `Patrimonio_Historico` folder | IDEV notice "Nuevas URLs de servicios WMS/WFS de Cultura: BICs, BRLs y Pedra Seca"; `dadesobertes.gva.es` dataset pages | ⚠️ Search-verified, endpoint not GetCapabilities-probed in this session |
| 9 | Flood — PATRICOVA | Region-wide flood hazard/risk plan; public viewer `visor.gva.es`; a WMS service page exists (`/web/sistema-de-informacion-territorial/servicio-wms-69944`) and a "Descarga de capas" page is referenced | `mediambient.gva.es/.../cartografia-del-patricova` fetched live | ⚠️ Page fetched; the actual `GetCapabilities` XML for the WMS itself was NOT independently retrieved — URL exists, endpoint response not confirmed |
| 10 | Airport — Manises (València) | RD 856/2008 (physical servitudes) + RD 54/2018 (acoustic/noise) | BOE-A-2008-9226, BOE-A-2018-2188 | ✅ legal instrument confirmed; no GIS geometry source confirmed |
| 11 | Airport — Alicante-Elche | RD 631/2023 (4 July 2023) updates servitudes | Search result citing the RD directly | ✅ legal instrument confirmed; no GIS geometry source confirmed |
| 12 | Airport — Castellón | RD 538/2023 (20 June 2023) establishes servitudes | Search result citing the RD directly | ✅ legal instrument confirmed; no GIS geometry source confirmed |
| 13 | Airport GIS/download | AESA publishes an interactive "Mapa de SSAA" viewer; no WMS/shapefile/KMZ download URL was successfully retrieved in this session (fetch of the interactive-map page was truncated/inconclusive) | `seguridadaerea.gob.es/.../mapa-de-ssaa` | ❌ NOT verified — recorded as `UNKNOWN`, not absent |
| 14 | Environmental — Natura 2000 | National MITECO WMS (`wms.mapama.gob.es/sig/Biodiversidad/RedNatura`) covers the whole of Spain including CV (Albufera ZEPA ES0000471 + LIC); no CV-specific regional WMS distinct from the national one was found | MITECO + `parquesnaturales.gva.es` pages | ⚠️ National service found; a CV-specific service was searched for but not found separately |
| 15 | "ARGOS" | **Not found.** No Generalitat Valenciana system by this name surfaced in searches for GVA urbanismo/geoportal; the name appears to belong to a different context (possibly conflated from another region's tooling) | Two targeted searches, no GVA hit | ❌ Could not verify existence — treat the brief's mention as unconfirmed, not as a real endpoint |
| 16 | Legal delegation % (region-wide) | Not measured. Only the capital's 36.40% is measured; the regional `InventarioSuSuz`/`pp`/`ue` fields that could answer this for Alicante/Castellón/Elche were found but not read for content | This audit, §5 above | ❌ `UNKNOWN` |
| 17 | Dispatch feasibility (regional) | Same shape as the capital: parcel (national Catastro) → zone code (regional WFS) → **no ordinance-numeric join exists at regional scale** → no automatic envelope | Composite of rows 3, 4, 6 above | ✅ for the negative result; region-wide ordinance-text corpus not assembled |

---

## Machine-readable assets — every verified endpoint

| Asset | URL | Protocol | Verified |
|---|---|---|---|
| Regional planning WFS (root) | `https://terramapas.icv.gva.es/0702_Planeamiento` | WFS 1.1.0, `GetCapabilities`/`DescribeFeatureType`/`GetFeature` all responded | ✅ live, this session |
| — feature type `Planeamiento.Zonificacion` | (same service) | zoning/classification polygons, no envelope fields | ✅ |
| — feature type `Planeamiento.Clasificacion` | (same service) | land classification | listed in GetCapabilities, not individually probed |
| — feature type `Planeamiento.Dotaciones` | (same service) | facilities/dotaciones | listed, not probed |
| — feature type `InventarioSuSuz` | (same service) | urban/developable land inventory, incl. `sup_m2`/`edif_m2`/`legislacion_pp` | ✅ DescribeFeatureType fetched |
| — feature type `DeclaracionInteresComunitario` | (same service) | Community Interest Declarations | listed, not probed |
| — feature type `MinimizacionViviendasSNU` | (same service) | 1976–2014 minimisation-eligible rural housing | listed, not probed |
| ICV services root (all regional themes) | `https://terramapas.icv.gva.es/` (other numbered folders, e.g. `0105_Delimitaciones`, `0801_VEUS`, `20_GvaServicios`, `22_IGPCV`) | WFS/WMS per-service | ⚠️ discovered via search, not individually GetCapabilities-probed except `0702_Planeamiento` |
| Cultural heritage BIC/BRL/Pedra Seca | `https://carto.icv.gva.es/arcgis/services/tm_cultura/bics/MapServer/WmsServer` and `terramapas.icv.gva.es/22_IGPCV` | ArcGIS WMS + IGPCV WFS | ⚠️ search-verified, not GetCapabilities-probed |
| PATRICOVA flood viewer | `https://visor.gva.es/visor/?...capasids=Orto_Actual;,Ordenacion_Territorial;...` | interactive web map | ✅ page fetched |
| PATRICOVA WMS (page reference) | `mediambient.gva.es/.../servicio-wms-69944` | referenced but GetCapabilities not independently fetched | ⚠️ |
| National Catastro parcel service | (inherited from prior repo corpus, not re-probed this session) | INSPIRE WFS, keyless | ✅ per prior repo verification |
| Natura 2000 (national, covers CV) | `https://wms.mapama.gob.es/sig/Biodiversidad/RedNatura` | WMS | ⚠️ found via search, not GetCapabilities-probed this session |

---

## Missing assets

- **Any regional layer carrying height, número de plantas, FAR/edificabilidad, ocupación, setback,
  buildable depth or alignment.** Swept: `Zonificacion` (16 fields, none), `InventarioSuSuz` (38
  fields — `sup_m2`/`edif_m2` are the closest candidates and are unread/unverified for completeness
  and are string-typed, not numeric).
- **A confirmed machine-readable geometry source for any of the three airports' servitude
  surfaces.** Three RDs exist as legal text; none was traced to a GIS layer in this session (contrast
  with the memory note that Barcelona's AESA servitude was resolved via a KMZ with full 3D geometry —
  that same route was searched for here and not confirmed working).
- **A region-wide, machine-readable ordinance-TEXT corpus** analogous to what would need to exist for
  every municipality's Título/Capítulo articles (the capital alone required manual PDF sourcing and
  article-by-article transcription — see `46250-valencia/sources/PRIMARY-SOURCE-VERIFICATION-2026-08-01.md`).
- **Confirmation or denial of the Alicante zero-feature result** — needs a second, independently
  syntaxed query (standard OGC `<Filter>` XML rather than `CQL_FILTER`) before it can be classified as
  a genuine regional coverage gap versus a query artefact.
- **A CV-specific (as opposed to national) Natura 2000 WFS**, if one exists, was not located.
- **Confirmation that "ARGOS" exists** — it does not appear to be a real Generalitat Valenciana
  system under that name; treat as unconfirmed.
- **A regional heritage attribute equivalent to the capital's `protec` field** was not checked for
  content (only that a WMS/WFS endpoint exists).
- **PATRICOVA's actual `GetCapabilities` response** — the service was referenced on an official page
  but its XML was not independently retrieved in this session.

---

## Blockers

| Blocker | Category | Solvable how |
|---|---|---|
| No envelope parameters in regional GIS | Data acquisition / possibly structural | Same as the capital's finding: the ordinance texts (per municipality) are the only source. Not a GIS problem — GIS-solvable only for *routing*, never for entitlement, in every Spanish region this repo has surveyed so far (Madrid, Catalunya, Murcia, Andalucía, València) |
| `InventarioSuSuz.sup_m2`/`edif_m2` unread | Engineering (cheap) | Field-sweep + sample read is ~hours, mirrors the `PRIMARY-SOURCE-VERIFICATION` method already used for the capital |
| Alicante zero-feature result unresolved | Engineering (cheap) | Re-query with standard OGC filter syntax; assert unfiltered count first (per this repo's own `§CONTEXT-DATA-HONESTY` discipline already codified in `CLOSURE-REGISTER.md`) |
| Airport servitude geometry unconfirmed | Data acquisition / GIS-solvability unknown | Needs a direct AESA portal session (not a search-engine pass) to locate a genuine download; RDs themselves could in principle be digitised as a last resort (High effort) |
| Heritage endpoint not GetCapabilities-probed | Engineering (trivial) | One more live fetch closes this |
| PATRICOVA WMS not confirmed live | Engineering (trivial) | One more live fetch closes this |
| Regional ordinance-text corpus does not exist | Legal / Data acquisition, Very Large | Same category as the capital's own PGOU sourcing, multiplied by every remaining municipality; no shortcut identified |
| Legal delegation share region-wide unknown | Data acquisition (cheap, once `InventarioSuSuz` is read) | Read `pp`/`ue`/`legislacion_pp` at scale, mirroring the capital's `origen`-column measurement |

---

## Estimated Unlock Effort: **Very Large**

The *routing* layer (parcel → zone → governing instrument) is real and regional, and closing its
remaining gaps (Alicante query, heritage/PATRICOVA GetCapabilities confirmation, `InventarioSuSuz`
content read) is genuinely **Small**. But the *entitlement* layer — the actual buildable envelope —
requires the same per-municipality ordinance-extraction project the capital required, repeated
across every municipality PRYZM wants to cover, because (per this audit and every prior regional
audit in this repo) **no Spanish region publishes numeric envelope parameters as GIS data.** That
multiplies the capital's own effort (which the sibling audit already sized at roughly a week of
mixed legal/engineering work plus an external authority wait) across an indeterminate number of
distinct planning grammars. `VALENCIA-GRAMMAR-HYPOTHESIS.md` (already in this repo) frames exactly
this problem and proposes measuring "how many grammars" rather than "how many municipalities" — that
measurement (M1–M3 in that document) has not been run and is the correct next step before sizing
this further.

---

## Recommendation: **Research first**

Specifically: (1) close the six cheap engineering items above (re-query Alicante, confirm heritage
and PATRICOVA endpoints live, read `InventarioSuSuz` content, probe the remaining five `terramapas`
service folders for envelope-shaped fields); (2) run the M1–M3 grammar-distribution measurement
already specified in `VALENCIA-GRAMMAR-HYPOTHESIS.md` §4 across a stratified sample of ~50
municipalities before committing engineering effort to any specific city beyond the capital. Do not
build a rule pack for Alicante, Elche, or Castellón on the strength of this audit alone — nothing
here establishes what their ordinance grammars look like, only that the regional GIS cannot supply
their numeric parameters either.

---

## PRYZM Readiness Score: **12 / 100**

Scored on the same rough basis as the comparison set below: a real, live, unauthenticated, provably
regional routing layer exists (worth meaningfully more than "Impossible Today" or a pure legal
refusal state), but zero envelope parameters were found anywhere in the region, zero municipalities
beyond the capital have been legally researched at all, and the capital itself — the one city in
this CCAA with real engineering behind it — is independently measured at **0% ENVELOPE** and stays
there pending an external authority answer. The score reflects: routing infrastructure present
(+), heritage/flood/environmental overlays exist as named regional programmes with at least a
public viewer each (+), but no numeric entitlement data anywhere, no regional delegation percentage
measured, no airport geometry confirmed, and 540+ municipalities entirely unresearched (−).

---

## Compare against: Barcelona, Murcia, Balears, Zaragoza, Sevilla, Granada, Córdoba, Málaga

*(Per the corpus's own registers — not re-derived in this session; cited from memory context and the
repo's existing dossiers, since re-verifying eight other cities live is out of scope for this
regional audit.)*

| City/Region | ENVELOPE state | Regional GIS | Note |
|---|---|---|---|
| **Barcelona (AMB/PGM)** | Partial — OV/ladder routes computed on parts of 27 municipalities | Real, mature, deviation-tracked | Most-developed grammar in the repo; still ❌ on constraints (heritage/flood/airport) region-wide |
| **Murcia** | Partial, ~9.4% ENVELOPE axis computed via C63 scorecard | Delegation ~67% measured | Signed pack exists for some zones |
| **Balears** | Blocked — `OBS` validity field shows some rows self-declare not-in-force | Regional GIS exists | Currency/validity is the specific named blocker |
| **Zaragoza / Aragón** | Blocked — `fiab_geom` 100% present but only 21.8% "Aprobada" | SITAR/regional system exists (no "ARGOS" confirmed) | Presence ≠ currency, a named trap in this repo's own standards doc |
| **Sevilla / Andalucía** | Structurally capped — mandated schema has `EDIF_*`+`DENS`, **no `altura` field at all** | Regional GIS exists | Cannot close even if fully populated — a schema defect, not a coverage gap |
| **Granada** | Not separately audited in this session | — | — |
| **Córdoba** | Signed gate, zero dispatcher compute branch (per project memory) | — | Verification/dispatch/rendering tracked as separate milestones |
| **Málaga** | Real corpus read, cross-regional depth-vocabulary flag raised | — | Recent audit, per project memory |
| **Comunitat Valenciana (this audit)** | **0% for the one city measured (València capital); UNMEASURED for the other ~540** | **Real, live, regional, but routing-only — zero envelope fields found** | The routing layer is comparatively strong; the entitlement layer is, so far, the weakest measured of this set, because not even the capital — the best-researched city in the CCAA — has cleared its single remaining blocker (an external authority answer on `altura`'s offset convention) |

---

## Final verdict

The Comunitat Valenciana has **better region-wide routing infrastructure than most of the regions
this repo has surveyed** — a live, unauthenticated, genuinely pan-regional WFS harmonised under
Decreto 74/2016, distinct from (and in some respects stronger than) the capital's own municipal
GIS. But routing is not entitlement. **No envelope parameter — height, FAR, setback, coverage, or
buildable depth — was found published as machine-readable regional data anywhere in this audit**,
and the one city in the region where real engineering and legal work has been done (València
capital) is independently measured at 0% computed envelope, blocked on an external authority answer
that has nothing to do with regional GIS at all. The single biggest blocker for the REGION as a
whole is not any one dataset gap — it is that **the region-wide "how many planning grammars exist"
measurement has never been run** (`VALENCIA-GRAMMAR-HYPOTHESIS.md` M1–M3, already scoped in this
repo, still open). Until that measurement exists, no claim about Alicante, Elche, or Castellón's
buildability can be made with the same evidentiary standard this repo has applied to the capital —
and building anything for those cities today would repeat, blind, the exact article-by-article
sourcing effort the capital already required, with no assurance the effort transfers.

---

*Authority: C58 §1.2/§1.4/§1.5/§1.7a · C63 · ADR-0270/0279/0283/0287 · `REGIONAL-INTAKE-LIST.md` ·
`ES-REGIONAL-PLANNING-DATA-STANDARDS.md` · §CONTEXT-DATA-HONESTY. Cross-refs:
[`46250-valencia/CLOSURE-REGISTER.md`](./46250-valencia/CLOSURE-REGISTER.md) ·
[`VALENCIA-GRAMMAR-HYPOTHESIS.md`](./VALENCIA-GRAMMAR-HYPOTHESIS.md) ·
[`03014-alicante/ENVELOPE.md`](./03014-alicante/ENVELOPE.md) ·
[`12040-castellon-de-la-plana/ENVELOPE.md`](./12040-castellon-de-la-plana/ENVELOPE.md).
Live endpoint verification performed 2026-08-04. Maintainer: UNASSIGNED.*
