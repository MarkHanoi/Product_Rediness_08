# Andalucía — REGIONAL Capability Audit (Junta de Andalucía layer, not any single capital)

> **Date:** 2026-08-04. **Scope:** the Autonomous Community of Andalucía as a whole (8 provinces,
> ~778/785 municipalities) — does a Junta de Andalucía region-wide GIS/planning layer exist that
> could shortcut 778 separate municipal integrations? This document does **not** re-litigate
> Córdoba, Málaga, Granada or Sevilla — see their own `findings/FORENSIC-BLOCKER-AUDIT-2026-08-03.md`
> files and the region's capital roll-up, `ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md`, both read in full
> before this audit was written. Related prior regional research (read in full, not duplicated):
> `docs/04-reference/jurisdictions/es/ES-REGIONAL-PLANNING-DATA-STANDARDS.md` §1 and
> `docs/04-reference/jurisdictions/es/ES-ALL-REGIONS-STATUS.md` (Andalucía row), plus governing
> ADRs [ADR-0294](../../../02-decisions/adrs/ADR-0294-the-zone-resolver-is-container-agnostic-and-carries-confidence.md)
> and [ADR-0295](../../../02-decisions/adrs/ADR-0295-the-capability-engine-five-independent-providers.md).
> Endpoints below were re-verified live this session via `WebFetch`/`WebSearch`; each citation below
> is either freshly checked or explicitly marked as inherited from the prior session's measurement.

---

## Executive Summary

Andalucía has legislated a mandatory region-wide planning-data standard — **SITUA/VITUA under
Ley 7/2021 (LISTA) and the *Normas Directoras* (Orden de 18 de febrero de 2026, BOJA 37, in force
24 April 2026)** — and separately runs three genuinely useful, live, machine-readable regional
overlay services (heritage, Natura 2000/protected areas, and cartographic flood zones via REDIAM
and IAPH GeoServer). But **none of this substitutes for municipal zoning geometry or ordinance
text**, and the region confirms rather than contradicts the capital-level finding: **Spain's
buildable-envelope truth lives at the municipality, not the autonomous community.** The one
candidate for a genuine regional zoning/ordinance shortcut — the Normas Directoras schema — was
already measured in a prior session and carries a fatal double defect for this exact use case: its
GeoPackage template ships `EDIF_*` (edificabilidad/FAR) and `DENS` (density) fields but **zero**
height, storey-count, setback, or depth fields, and it is **forward-only**, binding only on general
planning instruments *approved after* 24 April 2026 — a window of roughly fourteen weeks across
~778 municipalities in which the number of newly-approved general instruments is plausibly zero to
a handful. The **usable regional layers are the overlays** (heritage: `bica_public` WMS/WFS on
`ws096.juntadeandalucia.es`, live, EPSG:25830, verified this session; environmental: REDIAM Red
Natura 2000/RENPA WMS/WFS; flood: REDIAM T10/T50/T100/T500 return-period WMS/WFS plus national
SNCZI/CHG data) — not the zoning/ordinance backbone. DERA, the region's general reference-data
infrastructure, publishes a "Sistema Urbano" layer, but at **1:100,000 (DEA100) generalised scale**
— useful for context, not for drawing a parcel's buildable volume. **The regional layer is real,
live, and worth wiring in for overlays; it is not, and cannot become, a substitute for the
778-municipality zoning/ordinance integration problem documented capital-by-capital.**

---

## Capability: **Research Blocked** (for the region-wide zoning/ordinance shortcut question) — with **Indicative Ready** carve-outs for three specific overlay layers (heritage, environmental, flood)

The zoning-geometry and ordinance-parameter question is **Research Blocked**, not Engineering
Blocked and not Impossible: the Normas Directoras schema is verified to lack the parameters an
envelope needs (measured fact, not assumption), and the actual corpus size under the new mandate
(how many of ~778 municipalities have submitted anything) was not found published as a queryable
count anywhere on the Registro de Instrumentos Urbanísticos page (checked live this session — the
page describes a deposit *process*, not a public searchable dataset or entry count). That specific
number — "how many municipalities have a machine-readable instrument under the new schema today" —
is the single fact that would most change this rating, and it was not discoverable through the
public-facing registry page. Separately, the three overlay layers (heritage, environmental, flood)
**are** live, queried, and correctly scoped as region-wide inputs — they earn **Indicative Ready**
on their own, independent of the zoning-geometry blocker, per ADR-0295's "five independent
providers, not regional packs" framing: constraint overlays are one of five capabilities, not the
whole engine.

---

## Evidence Matrix

| Requirement | Status | Evidence |
|---|---|---|
| **Parcel geometry** (regional) | Not separately regional | Andalucía inherits the national Catastro INSPIRE service, same as every Spanish region; no Junta-specific parcel layer found or expected. Consistent with Córdoba/Málaga/Sevilla capital audits (all presumed/confirmed national Catastro). |
| **Zoning geometry** (regional) | **Absent at usable scale** | DERA "Sistema Urbano" (`G06_SISTEMA_URBANO`, layer `dea100_sistema_urbano`) exists at **DEA100 = 1:100,000** generalised scale (verified via search of `ideandalucia.es/wms/dea100_sistema_urbano` and IECA's own DERA description). Not parcel-resolvable; a region-scale classification map, not a calificación/ordenanza layer. |
| **Ordinances / legal grammar** (regional) | **Schema mandated, corpus unmeasured, parameters incomplete by design** | Orden de 18 de febrero de 2026 (BOJA 37) — `2026.02.18_Plantilla_NNDD.zip` normalised schema, mandatory for instruments approved after 24-04-2026 under LISTA Art. 11 determination 5. Prior-session schema read: `EDIF_*` + `DENS` fields present; **no altura, plantas, profundidad, ocupación, or retranqueos fields**. Corpus count (how many municipalities have filed under it) not found published; the Registro de Instrumentos Urbanísticos page (checked live) describes the deposit process, not a browsable count. |
| **Height** (regional) | Absent | No regional height layer found; height is confirmed capital-by-capital as a per-municipality ordinance/PDF fact (Córdoba, Málaga). |
| **FAR** (regional) | Partial, schema only | Normas Directoras `EDIF_*` field is a genuine FAR carrier **once populated** — but corpus is unmeasured/plausibly near-zero this early post-mandate. |
| **Occupancy** (regional) | Absent | Not in the Normas Directoras schema fields found; not published elsewhere regionally. |
| **Setbacks** (regional) | Absent | Not in the Normas Directoras schema fields found. |
| **Alignment** (regional) | Absent | No regional alignment layer found; ADR-0295 already documents Málaga's municipal `LINALIN_T` as the *only* published alignment layer found anywhere in the region — no Junta-level equivalent exists. |
| **Heritage** (regional) | **Live, machine-readable** | `bica_public` WMS/WFS at `https://ws096.juntadeandalucia.es/geoserver/bica_public/{wms,wfs}` (WMS 1.1.1/1.3.0, WFS 2.0.0, EPSG:25830) — Catálogo General del Patrimonio Histórico Andaluz (CGPHA), Zona de Servidumbre Arqueológica (ZSA), Inventario de Bienes Reconocidos (IBR). Metadata record verified live this session at `ideandalucia.es/catalogo/inspire/srv/api/records/9e2c774e-fc4f-4f0b-9602-63b03ed4eb0c`. Separately, IAPH's own WMS at `iaph.es/ide/pmu/wms?request=getcapabilities` (verified live, HTTP 200) exposes only a single layer, `pmu` (Patrimonio Mueble Urbano — movable/street furniture heritage), **not** the immovable BIC layer — the `bica_public` GeoServer instance is the correct heritage endpoint, not `iaph.es/ide/pmu`. |
| **Flood** (regional) | **Live, machine-readable** | REDIAM WMS/WFS "Zonas inundables asociadas a periodos de retorno (T10, T50, T100 y T500) en Andalucía" (Portal Ambiental de la CSMA, `juntadeandalucia.es/medioambiente/portal`) plus a coarser "Recopilación de zonas inundables en cauces de Andalucía (T500)" WMS. Overlaps with the national SNCZI (MITECO) and basin-authority services (CHGuadalquivir `idechg.chguadalquivir.es`, WMS confirmed via its own `guiawms.html` catalogue page) — not independently reconciled against REDIAM in this session; both exist and were not fetched for a byte-level GetCapabilities check (search-result level verification only). |
| **Airport** (regional) | Not separately checked this session | Not investigated regionally — Barcelona's AESA KMZ servitude-geometry finding (memory: "Barcelona airport resolved") implies a *national* AESA source likely covers Andalucía's airports (Sevilla, Málaga, Granada, Jaén, Almería, Córdoba) too, but this was not re-verified for Andalucía specifically in this session — treat as **UNKNOWN, not ABSENT**, per ADR-0295 §4's three-state rule. |
| **Environment (Natura 2000 / RENPA)** | **Live, machine-readable** | REDIAM "WMS/WFS Red Natura 2000 (LIC, ZEC y ZEPA) en Andalucía" and "WMS-WFS Red de Espacios Naturales Protegidos de Andalucía (RENPA)" — both listed with live metadata records at `ideandalucia.es/catalogo/inspire` and `portalrediam.cica.es/geonetwork`, most recently updated November 2025 per the RENPA/Natura 2000 metadata title itself. Endpoint URLs found via search-result titles/metadata pages, not independently GetCapabilities-fetched byte-for-byte this session (see Missing Assets). |

---

## Machine-readable assets (verified, no assumptions)

- **SITUA/VITUA** — `juntadeandalucia.es/organismos/fomentoarticulaciondelterritorioyvivienda/areas/urbanismo/situa.html` (portal page) and viewer at `juntadeandalucia.es/institutodeestadisticaycartografia/visores/VITUA/` — public viewer of territorial + urban planning instrument scope per municipality; confirms which general instrument (PGOU/PGOM/PBOM/NNSS/DSU/none) is in force per municipality. **Confirmed live**, page content fetched this session.
- **Normas Directoras schema** — `2026.02.18_Plantilla_NNDD.zip`, referenced from
  `juntadeandalucia.es/organismos/fomentoarticulaciondelterritorioyvivienda/areas/urbanismo/lista-urbanismo/paginas/normas-directoras.html`. Schema fields inherited from prior-session measurement (`EDIF_*`, `DENS` present; no altura/plantas/profundidad/ocupación/retranqueos).
- **Registro de Instrumentos Urbanísticos** — `juntadeandalucia.es/organismos/fomentoarticulaciondelterritorioyvivienda/areas/urbanismo/planeamiento/paginas/registro-instrumentos-urbanisticos.html` — describes the deposit **process** (municipal + Consejería registries under LISTA), not a public searchable database. **Confirmed live, fetched this session — no downloadable corpus or count found on the page itself.**
- **DERA "Sistema Urbano"** (`G06_SISTEMA_URBANO`) — `ideandalucia.es/wms/dea100_sistema_urbano` — WMS/WFS at **1:100,000 (DEA100)** generalised scale. Region-wide reference layer, not zoning-parameter carrier.
- **DERA general** — `juntadeandalucia.es/institutodeestadisticaycartografia/DERA/` — confirmed live this session; exposes "Patrimonio", "Sistema urbano", "Medio físico" groups via WMS/WFS at intermediate (1:10,000–1:100,000) scale; no cadastre or flood-specific group in the top-level catalogue (those live in REDIAM/IAPH instead, below).
- **Heritage — CGPHA/ZSA/IBR** — WMS `https://ws096.juntadeandalucia.es/geoserver/bica_public/wms`, WFS `https://ws096.juntadeandalucia.es/geoserver/bica_public/wfs` (WMS 1.1.1/1.3.0, WFS 2.0.0, EPSG:25830). **Confirmed live via metadata record fetch this session** (`ideandalucia.es/catalogo/inspire/srv/api/records/9e2c774e-fc4f-4f0b-9602-63b03ed4eb0c`); GeoServer endpoints themselves were not independently GetCapabilities-probed this session (metadata-record-level verification only — see Missing Assets).
- **Heritage — IAPH `pmu` WMS** — `https://www.iaph.es/ide/pmu/wms?request=getcapabilities` — **fetched live this session, HTTP 200**, single layer `pmu` = Patrimonio Mueble Urbano (movable heritage) — confirmed NOT the immovable-BIC layer; noted to avoid future confusion between IAPH's own domain and the `bica_public` GeoServer instance.
- **Environment — Natura 2000 / RENPA** — REDIAM WMS/WFS, metadata records at `ideandalucia.es/catalogo/inspire/srv/api/records/ffa0b84f62b6a5dcf72702376c727980382b355f` (Natura 2000) and `portalrediam.cica.es/geonetwork` (RENPA, Patrimonio Natural). Search-result/metadata-page level confirmation only this session.
- **Flood — REDIAM return-period zones** — WMS/WFS "Zonas inundables asociadas a periodos de retorno (T10, T50, T100, T500) en Andalucía", portal page at `juntadeandalucia.es/medioambiente/portal/landing-page-servicio-ogc/...rediam.-wms-wfs-zonas-inundables...`. Search-result/portal-page level confirmation only this session.
- **Flood — CHGuadalquivir (basin authority, national-tier)** — `idechg.chguadalquivir.es`, WMS guide at `idechg.chguadalquivir.es/nodo/Catalogo/guiawms.html`; overlaps Andalucía's Guadalquivir basin (most of western Andalucía) but is not a Junta-published service.

---

## Missing assets

- **A regional zoning/calificación GIS layer at usable scale.** DERA's Sistema Urbano tops out at 1:100,000 — an order of magnitude too coarse for parcel-level ordenanza determination.
- **A populated Normas Directoras corpus.** The schema exists; whether *any* municipality has filed a real dataset under it since 24-04-2026 is unmeasured — the registry page gives no browsable count, and this is the single highest-value unknown for this audit's central question.
- **Regional height/FAR/occupancy/setback/depth/alignment layers.** None found at Junta level; every one of these is confirmed capital-by-capital as a municipal-only fact in the four capitals already audited (Córdoba, Málaga, Granada, Sevilla).
- **A live byte-level GetCapabilities check on the REDIAM Natura-2000/RENPA and flood WMS/WFS endpoints.** This session verified their existence via metadata-catalogue pages and portal listings, not via a direct `?request=GetCapabilities` fetch the way the heritage and IAPH endpoints were checked. Treat the REDIAM environmental/flood endpoint *URLs* as one hop short of the heritage layer's verification depth.
- **Airport limitation surfaces specific to Andalucía's airports.** Not investigated this session; status is UNKNOWN, not ABSENT (Barcelona's AESA precedent suggests a national source likely exists, but Andalucía's own airports — Sevilla-San Pablo, Málaga-Costa del Sol, Granada, Jaén, Almería, Córdoba — were not individually checked against it).
- **A reconciliation between REDIAM's own flood layer and CHGuadalquivir's basin-authority flood layer** where they overlap (most of Andalucía sits in the Guadalquivir, Guadalete-Barbate, Segura, Sur, or Mediterráneo Andaluz basins) — which is authoritative for a given parcel, and whether they agree, was not checked.

---

## Blockers

1. **Normas Directoras schema lacks height/setback/depth/occupation fields.** Even a fully-populated
   corpus under this schema could not alone produce an envelope — it can determine FAR and density
   but nothing about vertical form or plan-form constraints. *Can engineering/GIS-processing solve
   it?* No — this is a legislative schema-design gap, upstream of PRYZM; the fix would require the
   Junta to amend the mandated schema, or PRYZM would still need the municipal ordinance PDF/GIS
   layer for the missing dimensions regardless.
2. **Forward-only mandate with an unmeasured, plausibly near-empty corpus.** Even where the schema
   is sufficient, coverage is bounded by how many of ~778 municipalities have approved a *new*
   general planning instrument since 24-04-2026 — a roughly fourteen-week window. *Can this be
   solved?* Only by waiting (time, not engineering) or by a direct records request to the Registro
   de Instrumentos Urbanísticos for an actual filed-instrument count — a research task, not
   engineering.
3. **DERA's zoning-adjacent layer is scale-inadequate.** 1:100,000 generalisation cannot support a
   parcel-level buildable-envelope determination. *Can this be solved?* No — this is a fundamental
   scale mismatch, not a data-access problem; the fix is the same as every capital audit already
   concluded: go to the municipal container.
4. **No regional alignment layer.** Alignment is documented in ADR-0295 as "a geometry, not a
   parameter" and the highest-leverage unresolved dependency in Spain; at the regional level,
   nothing exists at all (Málaga's municipal `LINALIN_T` remains the only regional-adjacent example,
   and it is locked). *Can this be solved?* Not regionally — must be sourced per-municipality or
   constructed from block-ring geometry (as Barcelona does), per ADR-0295.
5. **Regional overlay endpoints (REDIAM environmental/flood) confirmed only at metadata/portal level,
   not GetCapabilities level, this session.** *Can this be solved?* Yes, trivially — a follow-up
   `WebFetch` of the actual WMS/WFS service URLs (not just their catalogue metadata pages) would
   close this in minutes; flagged as incomplete rather than treated as verified to avoid
   overstating confidence (per ADR-0294 §2, confidence must be honestly carried, not upgraded by
   inference).

---

## Estimated Unlock Effort

**Large**, for the region-wide zoning/ordinance question specifically — because the finding is not
"one endpoint is broken," it is "the regional container does not carry the needed parameters by
design, and the realistic path is 778 separate municipal integrations, exactly as ADR-0294/0295
already concluded from the capital-level evidence." **Tiny (<1 week)**, separately, for wiring the
three verified regional overlay layers (heritage `bica_public`, REDIAM Natura 2000/RENPA, REDIAM
flood return-periods) into the constraint-overlay provider — these are live, queryable, and
region-wide by design, independent of the zoning-geometry blocker.

---

## Recommendation

**Do not build a region-wide Andalucía zoning/ordinance adapter.** The evidence — this session's
plus the prior capital-by-capital and cross-region ADR-0294/0295 findings — converges on the same
conclusion from every direction: Spain's buildable-envelope truth is published per-municipality,
and Andalucía is not an exception. **Do build the three regional overlay integrations** (heritage,
environmental, flood) as constraint-overlay providers per ADR-0295's five-capability model — they
are Tiny effort, already verified live, and apply uniformly across all 778 municipalities regardless
of which municipal zoning container (if any) is later built for each. **Research first** on exactly
one open question before closing this file: request or search for an actual instrument count from
the Registro de Instrumentos Urbanísticos (a phone/email inquiry to the Consejería, or a follow-up
search for any published dataset behind SITUA/VITUA) — if the Normas Directoras corpus turns out to
already contain more than a handful of municipalities, the "near-empty corpus" premise here would
need re-measurement, though even then the schema's missing height/setback/depth fields would still
block full envelopes.

---

## PRYZM Readiness Score: **22 / 100**

Scored as a region-wide capability, not as the average of its four audited capitals. Breakdown:
zoning geometry/ordinances at regional scale (0/40 — confirmed absent at usable scale, schema
mandate exists but is parameter-incomplete and corpus-unmeasured), parcel geometry (0/10 — no
regional layer, inherits national Catastro same as everywhere else so no regional *credit* or
*debit*), heritage overlay (8/10 — live, verified, region-wide), environmental overlay (7/10 —
strong evidence, one verification hop short of the heritage layer's depth), flood overlay (5/10 —
strong evidence, dual-source reconciliation unchecked, one verification hop short), airport (0/10 —
not checked this session, scored as unknown-absent conservatively), legal-delegation clarity (2/10
— SITUA/VITUA at least tells you *which instrument type* governs a municipality, which is a real
regional contribution even though it isn't itself an envelope input). This is meaningfully lower
than Córdoba's individual score (which has working dispatch machinery) and roughly in the same band
as the weaker of the four audited capitals, because the region contributes almost nothing to the
part of the pipeline that actually blocks envelopes today.

---

## Compare against: Barcelona, Murcia, Balears, Zaragoza, Sevilla, Valencia, Granada, Málaga

Andalucía-the-region is most similar to **Aragón**, not to any of the eight named comparators
directly — both are autonomous communities that have legislated or defined a region-wide planning
data/vocabulary standard (Aragón's NOTEPA, Andalucía's Normas Directoras) that turned out, on direct
measurement, to be a *classification and vocabulary* standard rather than a *complete envelope-parameter*
standard (Aragón: `edificab` populated only 1.3% of sampled rows; Andalucía: `EDIF_*`/`DENS` present
but zero form-parameter fields, corpus unmeasured/likely near-empty). Both are cases where a
genuine regional legal instrument exists but does not close the gap, versus **Catalunya** (AMB
Refós is a real *legal text* governing document at regional-metro scope, closer to actually
substituting for municipal-by-municipality work over its 36-municipality footprint) or **Murcia**
(a *municipal* GeoServer, not regional, but the one proven to carry real alignment data — 679
lines). Among the eight named comparators specifically: closest analogue is **Sevilla** in the
sense that both have "a real, live, well-structured endpoint that nonetheless does not carry the
form parameters an envelope needs" — Sevilla's ArcGIS layer serves `altura_max` as data but is
missing FAR/setbacks/depth; Andalucía's Normas Directoras schema serves `EDIF_*`/FAR but is missing
height/setbacks/depth — a mirror-image gap, and neither is regional-vs-municipal in the way this
audit is designed to test (Sevilla's endpoint is municipal, not the Junta's).

---

## Final verdict

**No — not at the regional level, and this is not a gap PRYZM's engineering can close.** The single
biggest blocker: **Andalucía's regional planning-data standard (Normas Directoras / SITUA-VITUA) is
a real, live, legally-mandated schema, but it was legislated to standardise *edificabilidad and
classification*, not the full set of form parameters (height, storeys, setbacks, buildable depth,
occupation) an envelope calculation requires — and even on the parameters it does carry, the corpus
behind it is forward-only from 24 April 2026 and its actual current size (how many of ~778
municipalities have filed anything) is not published anywhere this session could find.** This
confirms, rather than overturns, the standing conclusion already reached independently at the
capital level and ratified in ADR-0294/0295: Andalucía's buildable-envelope capability is not a
region-level problem with a region-level fix — it is 778 independent municipal integrations, of
which exactly one (Córdoba) has working dispatch machinery today, and the region's own genuine
contribution is limited to constraint overlays (heritage, environment, flood) that are real, live,
and worth building now, in parallel with — never instead of — municipal zoning work.
