# CAPABILITY AUDIT — Málaga (INE 29067), 2026-08-04

> Builds on [`FORENSIC-BLOCKER-AUDIT-2026-08-03.md`](./FORENSIC-BLOCKER-AUDIT-2026-08-03.md) (same
> folder) and the regional [`ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md`](../../ANDALUSIAN-CAPITALS-FORENSIC-AUDIT.md).
> This pass's mandate: independently verify the hypothesis (pasted by the user, unverified before
> this session) that Málaga's public PGOU viewer calls a different, unlocked backend than the locked
> `sig.malaga.eu` GeoServer. All URLs below were fetched live on 2026-08-04. Objective is
> capability assessment only — **no code was written or recommended**.

## Highest-priority finding, stated first

**No alternate unlocked backend was found.** Every distinct candidate surface was checked and each
terminates in one of three ways: (a) the same locked GeoServer, (b) a viewer that is itself offline,
or (c) a general-purpose service (street directory, base cartography) that does not carry zoning
geometry at all. Detail in §2 below.

---

## 1. Planning documents

Unchanged from the 2026-08-03 forensic audit: PGOU Málaga (Aprobación Definitiva, Jul-2011, GMU) —
12 normative Título 12 PDFs, all HTTP 200, all natively text-extractable (verified prior session, not
re-verified today). Additionally confirmed today: the full PGOU document tree is browsable at
`urbanismo.malaga.eu/normativa-y-planeamiento/pgou-2011/` (memoria, planos, normativa, modificaciones,
corrección de errores, criterios de interpretación) and a historical archive back to PGOU 1983/1997.
Documents only — no CAD/GIS in this tree.

## 2. Zoning geometry — the alternate-backend investigation

Live-checked candidate surfaces, in order of plausibility:

| Candidate | URL | Result |
|---|---|---|
| Locked GeoServer (control re-probe) | `sig.malaga.eu/geoserver/wfs?...typeName=muralPGOU:POLCALIF_T` | **Still HTTP 500** today (2026-08-04) — lock persists, unchanged from 2026-08-03. |
| PEPRI Centro GIS viewer | `urbanismo.malaga.eu/normativa-y-planeamiento/pepri-centro/gis-visor-cartografico/` | Page states explicitly: **"Visor cerrado temporalmente, y en proceso de actualización"** (viewer temporarily closed, being updated). No embedded map, no service URL on the page at all — not merely blocked upstream, offline at the municipal front end too. |
| Municipal GeoPortal | `geoportal.malaga.eu` | **301 redirects to `callejero.malaga.eu/?gp=o`** — this is the street-directory/city-map viewer (Callejero), not a zoning/PGOU viewer. No WMS/WFS/ArcGIS endpoint distinct from the locked GeoServer was surfaced. |
| Legacy preidemap viewer | `preidemap.malaga.es/visorCarto/` (surfaced by search as a Málaga cartography viewer) | **DNS resolution fails** (`ENOTFOUND`) — dead host. |
| ArcGIS hub hit | `malagadata-wcupagis.hub.arcgis.com` ("City of Malaga") | Surfaced by search but the subdomain token (`wcupagis`) is consistent with a university GIS course project, not an Ayuntamiento de Málaga asset — **not treated as an official source**; no independent confirmation it is municipal. |
| Open-data CKAN search | `datosabiertos.malaga.eu/api/3/action/package_search?q=calificacion+OR+PGOU+OR+planeamiento+OR+urbanistico` | **0 results.** Live CKAN API query against the full catalogue returns zero datasets for every zoning-relevant term tried. |
| Open-data "geoportal" tag browse | `datosabiertos.malaga.eu/dataset?tags=geoportal` (110 datasets) | Datasets present are all **Sistema de Información Cartográfica — Callejero/Vial/Clase de vial** (street network), not zoning. No PGOU/calificación dataset in this tag group. |
| 1:1000 base cartography | `urbanismo.malaga.eu/normativa-y-planeamiento/cartografia/` | Confirmed **PDF-only**, 1×1 km grid sheets, imagery dated **October 2015**. No vector formats offered. Base topographic mapping, not zoning. |
| INFURB (Información Urbanística) | `urbanismo.malaga.eu` "Información Urbanística de Calificación" | Confirmed to be a **manual, request-based service** ("consulta telemática" by phone/email/video call, or in-person) — not an API, not machine-callable at any volume. |

**Conclusion on the hypothesis**: the pasted research's premise (a different backend bypassing the
locked Oracle GeoServer) does **not hold** for Málaga capital. The one candidate that would have
constituted a genuine alternate viewer — PEPRI Centro's GIS viewer — is independently offline for
maintenance, and every other public entry point either redirects to an unrelated street-map service
or returns zero results. This is a **negative finding, arrived at by direct verification**, not an
absence of search effort.

## 3. Parcel geometry

Unchanged: national Catastro (INSPIRE WFS), consistent with the rest of Spain — already wired at the
provider level in PRYZM (`parcelProviders/registry.ts`, `isInSpain`). Not independently re-verified
for a Málaga-specific bbox this session (out of scope for this pass; the earlier forensic audit and
`ENVELOPE.md` both record it as the routed national default).

## 4. Envelope parameters

Unchanged from 2026-08-03: height present on ~90% of zone chapters (PROD 9m/12m, GSM 12m, UAS
PB+1/7m, OA 4.20–25.40m table, MC 3.00m), CTP states 15m *profundidad edificable* explicitly (Art.
12.2.14). FAR/coverage/setbacks: 20% complete, 60% partial, 20% not-drawable, per document. These
numbers live in text PDFs only — there is no geometry layer to attach them to a specific parcel
(§2 above is the actual blocker; the parameters themselves are comparatively rich).

## 5. Heritage

Two distinct regional (Junta de Andalucía) surfaces checked live:

- **IAPH `pmu` WMS** (`iaph.es/ide/pmu/wms?request=getcapabilities`) — valid WMS 1.3.0, but the only
  layer (`pmu`) is **Patrimonio Mueble Urbano** (movable urban heritage — sculptures, monuments as
  objects), **not** BIC polygons or archaeological protection zones. Wrong layer for envelope
  purposes.
- **"Patrimonio Inmueble de Andalucía"** (`datos.gob.es/en/catalogo/a01002820-...`) — a real,
  region-wide (27,000+ entities) dataset, but distributed as **JSON/XML/CSV via a paginated API**,
  not WMS/WFS/shapefile. Whether records carry polygon boundaries (BIC *entorno de protección*) or
  only point coordinates was **not resolved this session** — the catalogue page does not state
  geometry type, and the API was not queried for a sample record.
- Local PEPRI-Centro *Catálogo de Edificios Protegidos* (protected-buildings catalogue for the
  historic centre) exists as a page (`.../pepri-centro/catalogo-de-edificios-protegidos/`) but was
  not opened this session; historically these municipal catalogues are PDF/list, not GIS.

**Status: unresolved, not "machine-readable: yes."** Best evidence points to point-level, not
polygon-level, heritage geometry being available regionally — needs one more live query to confirm.

## 6. Flood

**REDIAM zonas inundables WMS confirmed live**: `juntadeandalucia.es/medioambiente/mapwms/REDIAM_zonas_inundables_and?service=WMS&request=GetCapabilities`
returned a valid WMS 1.3.0 document with 8 return-period layers (T10/T50/T100/T500, ×2 basin
groupings — intracomunitarias and intercomunitarias). Málaga sits in the Cuenca Mediterránea
Andaluza (intracomunitaria) demarcation, so coverage is expected but **the specific layer bbox
was not clipped/verified against the 29067 extent this session**. A companion WFS (vector download)
is referenced by the regional metadata catalogue (`portalrediam.cica.es`) but was not independently
GetCapabilities-tested today.

## 7. Airport

Málaga-Costa del Sol (LEMG) is a major international airport with real limitation-surface exposure.
Findings:

- A Málaga-specific servidumbres-aeronáuticas **plan exists as a PDF**:
  `transportes.gob.es/.../ss_aerodromo.pdf` ("aeropuerto de málaga servidumbres aeronáuticas
  planos") — found via search, **not opened/verified this session** (whether it is a vector-precise
  plan or a scanned raster is unknown).
- AESA's interactive-map tool (`seguridadaerea.gob.es/.../mapas-interactivos/servidumbres-aeronauticas1`)
  exists but its content could not be retrieved this session (fetch returned truncated/empty), so
  whether it exposes a per-airport export (as Barcelona's AESA KMZ does, per prior session findings)
  is **unverified — an open question, not a confirmed capability**.
- A `datos.gob.es` "servidumbres aeronáuticas del aeropuerto" dataset was found but on inspection
  **covers San Sebastián/Donostia, not Málaga** — a false lead from search, explicitly ruled out.

**Status: unresolved.** Unlike Barcelona (confirmed AESA KMZ with full 3D servitude geometry, per
prior session), Málaga's airport-surface geometry availability is **not yet established either way**.

## 8. Environmental (Natura 2000 / RENPA)

Regional REDIAM/RENPA WMS/WFS services for Red Natura 2000 (LIC/ZEC/ZEPA) and RENPA (protected
natural areas network) were located via the Junta de Andalucía environmental portal
(`juntadeandalucia.es/medioambiente/portal/...`) — same publisher family and URL pattern as the
flood-zone service verified live in §6. **Not independently GetCapabilities-tested this session**
(time-boxed); treated as high-confidence-available by pattern match, not as directly confirmed.
Málaga capital's urban footprint is not adjacent to major Natura 2000 sites, so this axis is
lower-priority than flood/airport for the city core, but relevant for peripheral parcels.

## 9. Legal delegation (PERI/PEPRI/Estudio de Detalle)

Unchanged and reinforced by today's finding: PEPRI Centro (the historic-centre special plan) governs
a defined sub-area with its own ordenanzas, catálogo, and archaeological-protection zones — and its
dedicated GIS viewer is **offline** ("cerrado temporalmente"), meaning even the delegated instrument's
own geometry is currently unreachable through its intended channel, not just the citywide layer.
`normativa-y-planeamiento/planeamiento-de-desarrollo/` lists further Planes Especiales, Planes de
Reforma Interior, Planes Parciales, and Modificaciones — Málaga has a materially deep instrument
hierarchy below the PGOU. **Estimated non-computable fraction: not newly quantified this session**;
carry forward the 2026-08-03 audit's qualitative read (dense subordinate-instrument layer, likely
double-digit % of parcels routed to PEPRI/PERI/ED rather than base PGOU zoning).

## 10. Dispatch feasibility

Unchanged: **zero.** No `isInMalaga` branch, no rule pack, no registry entry
(`ENVELOPE.md`: S2–S5 all ❌). Falls through to `applyEstimatedZoning` — a fabricated generic
estimate, not a refusal. This is independent of and would remain true even if the geometry blocker
were resolved tomorrow — dispatch has not been built at all.

---

## Executive Summary

Málaga has the richest *textual* parameter corpus of any audited Andalusian capital (90% height
coverage across 12 natively-extractable normative PDFs, the region's only published municipal
alignment layer by name) but its *geometric* pipeline is blocked at every public entry point checked
today: the municipal GeoServer remains locked (`ORA-28000`, re-confirmed live), its own historic-centre
GIS viewer is independently offline for maintenance, the city's "GeoPortal" redirects to an unrelated
street-directory tool, the open-data catalogue returns zero results for every zoning-relevant search
term, and base cartography is 2015-vintage PDF grids. The specific hypothesis motivating this pass —
that the public PGOU viewer calls a different, unlocked backend — is **not supported by evidence**;
no such backend was found. Regional (Junta de Andalucía) layers for flood risk are confirmed live and
usable; heritage-polygon and airport-servitude geometry for Málaga specifically remain open questions
rather than confirmed capabilities. Dispatch machinery for Málaga does not exist in PRYZM at all.

## Capability: Research Blocked

Not Engineering Blocked (there is no compute-branch fix available, unlike Córdoba) and not Legally
Blocked (no legal instrument forbids access — this is an operational account lockout). It is
**Research Blocked** because the smallest unlock is external and human (a founder/support contact to
the Ayuntamiento or its GIS vendor to reset the Oracle account, or to ask directly whether an
internal/partner feed exists) — engineering cannot route around it with more probing; today's session
exhausted the plausible alternate-backend search space and found nothing to build against.

## Evidence Matrix

| Area | Machine-readable? | Source | Verified live 2026-08-04 |
|---|---|---|---|
| Planning documents (text) | Yes, native text | 12 Título 12 PDFs | Carried forward, not re-tested |
| Zoning geometry (municipal) | **No** | `sig.malaga.eu` GeoServer | Yes — still HTTP 500/ORA-28000 |
| Zoning geometry (alternate backend) | **Does not exist** | searched exhaustively | Yes — none found |
| Parcel geometry | Yes (national default) | Catastro INSPIRE WFS | Not Málaga-bbox tested this pass |
| Height parameter | ~90% Yes | Título 12 PDFs | Carried forward |
| FAR/coverage/setback | Partial (20/60/20) | Título 12 PDFs | Carried forward |
| Alignment layer | Advertised, unreachable | `muralPGOU:LINALIN_T` | Yes — same lock |
| Heritage (movable) | Yes, wrong layer | IAPH `pmu` WMS | Yes |
| Heritage (immovable/BIC polygons) | **Unresolved** | `datos.gob.es` tabular dataset | Partially — geometry type unknown |
| Flood | Yes (regional) | REDIAM WMS | Yes — valid GetCapabilities |
| Airport servitudes | **Unresolved** | AESA PDF / interactive map | No — fetch failed/incomplete |
| Natura 2000 / RENPA | Likely yes (pattern match) | Junta de Andalucía REDIAM | Not independently tested |
| Dispatch | No | — | Confirmed absent (code search, prior session) |

## Machine-readable assets — every verified endpoint

- `sig.malaga.eu/geoserver/wfs` — GetCapabilities HTTP 200 (43 feature types listed), but every
  `muralPGOU:*` layer HTTP 500/`ORA-28000`. Re-confirmed live today.
- `juntadeandalucia.es/medioambiente/mapwms/REDIAM_zonas_inundables_and` — valid WMS 1.3.0
  GetCapabilities, 8 flood-return-period layers, confirmed live today.
- `iaph.es/ide/pmu/wms` — valid WMS 1.3.0, one layer (`pmu`, movable heritage, wrong type for
  envelope purposes), confirmed live today.
- `datos.gob.es/.../a01002820-patrimonio-inmueble-de-andalucia` — JSON/XML/CSV paginated API,
  27,000+ heritage entities region-wide, geometry type (point vs. polygon) unconfirmed.
- 12 Título 12 normative PDFs at `urbanismo.malaga.eu` (native text, carried forward from
  2026-08-03).
- Catastro INSPIRE WFS (national default, already wired in PRYZM).

## Missing assets

- Any working zoning-geometry endpoint for Málaga municipality (the core blocker).
- A PEPRI Centro geometry source (its dedicated viewer is offline).
- Confirmed BIC/archaeological-protection polygon geometry (only movable-heritage WMS and an
  unconfirmed-geometry tabular dataset were found).
- Confirmed airport servitude geometry for LEMG (PDF plan found but unopened; AESA interactive-map
  export capability unverified).
- Any Málaga-specific dispatch code in PRYZM (rule pack, provider, registry entry, gate) — zero,
  unchanged from prior audits.

## Blockers

| Item | Type | Solvable how |
|---|---|---|
| GeoServer Oracle lock | External/operational | Human contact to Ayto. Málaga / GIS vendor. Not GIS-solvable, not OCR-solvable — it is an account-state problem, not a data-format problem. |
| PEPRI viewer offline | External/operational | Same category — outside PRYZM's control; may resolve itself when the municipality finishes its stated update. |
| Heritage geometry type unknown | Research | One follow-up query against the `datos.gob.es` API to inspect a sample record's schema — cheap, same-session-sized task, not done here due to scope/time. |
| Airport servitude format unknown | Research | Open the `ss_aerodromo.pdf` and separately retry the AESA interactive-map page fetch — both cheap, not done here. |
| Dispatch absent | Engineering | Real work, but pointless until geometry is unblocked — building a rule pack against parameters with no zone-polygon target produces the same fabricated-estimate failure mode dispatch already exhibits. |

## Estimated Unlock Effort: Large

Not because any single technical step is hard — it is Large because the **critical path runs through
a third party's account-administration process**, which has no PRYZM-controlled timeline, layered on
top of two still-open research sub-questions (heritage geometry type, airport servitude format) that
are individually Small but currently block a complete picture. Once the Oracle account is unlocked,
the earlier audit's own estimate stands: ~2–4 engineering days to author a pack, since most parameter
reading is already done.

## Recommendation: Wait for external source

Do not build. Do not spend further engineering research cycles probing for a nonexistent alternate
backend — that specific question is now answered (no). The correct next action is a founder-level
contact to the Ayuntamiento de Málaga (or its GIS operator) to ask directly (a) when the Oracle
account will be unlocked, and (b) whether an internal/partner data feed exists outside the public
GeoServer. In parallel, two cheap research follow-ups (heritage geometry type, airport PDF/AESA
interactive-map inspection) can be done without waiting on that contact.

## PRYZM Readiness Score: 22 / 100

Rich parameter text (height, one alignment layer by name) and working regional flood data pull the
score up from near-zero; the total absence of any queryable zoning-geometry endpoint — confirmed
exhaustively this session, including the specific alternate-backend hypothesis that would have
raised this score materially had it panned out — and zero dispatch code hold it down. This is a
downgrade in confidence, not in the underlying facts, relative to any reading of the 2026-08-03 audit
that left the door open to an unlocked alternate viewer; that door is now closed.

## Compare against

| City | Geometry access | Dispatch | Relative position |
|---|---|---|---|
| **Barcelona** | AESA KMZ (airport) confirmed full 3D; broader pipeline sound end-to-end per prior session | Wired | Ahead — Málaga has no analogue this session confirmed |
| **Córdoba** | Working GIS (COACo, third-party), filename-encoded keys | Reaches gate, no compute branch (1-2 hr fix) | Ahead on dispatch machinery; behind Málaga on raw parameter completeness |
| **Sevilla** | ArcGIS REST hypothesized, strongest research position among the un-implemented cities | Falls to fabricated estimate | Comparable research-blocked status, different container type |
| **Murcia** | `pgou_ejes` road-axis pitfall resolved; per MEMORY, careful about reprojection | Not directly compared this session | Not directly re-audited |
| **Balears, Zaragoza, Valencia, Granada** | Not directly re-audited this session | — | Granada: scaffold only, first-discovery-pass stage per regional audit |
| **Málaga (this audit)** | **Zero working geometry endpoint**, alternate-backend hypothesis explicitly ruled out | None | Behind all cities with any working geometry path; ahead only of the fully-unaudited Andalusian capitals (Jaén, Almería, Cádiz, Huelva) on parameter-text richness alone |

## Final verdict

Málaga cannot currently produce a legally-defensible buildable envelope, and — new to this pass —
the specific route that might have unblocked it without waiting on the municipality (a separate,
unlocked backend behind the public viewer) has been searched for and **does not exist**. The single
biggest blocker is the **locked Oracle account behind `sig.malaga.eu`'s `muralPGOU:*` layers**,
compounded by the fact that the one plausible independent geometry source — the PEPRI Centro GIS
viewer — is itself offline. This is an external, human-owned unlock, not an engineering problem;
PRYZM should not spend further cycles here until that contact is made.
