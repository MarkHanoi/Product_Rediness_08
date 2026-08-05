# Catalunya Regional Capability Audit (beyond AMB) — 2026-08-04

> Scope: the ~911 non-AMB Catalan municipalities (947 total − 36 AMB). Barcelona/AMB is audited
> separately. This is a research audit only — **no code was written or is recommended here.**
> Live-verified this session (2026-08-04) plus prior in-repo measurements dated 2026-07-31/08-03,
> cited by file where reused rather than re-fetched.

## Executive Summary

Catalunya publishes exactly one genuinely region-wide, machine-readable planning layer — the
Generalitat's **Mapa Urbanístic de Catalunya (MUC)**, a live keyless WFS 2.0.0 at
`sig.gencat.cat/ows/MUC/wfs` — and it answers a **classification** question (what harmonised
zone/system code covers this point, and which RPUC expedient governs it) for all 947
municipalities, not a **parameters** question. No regional instrument publishes height, FAR,
occupation, setback or buildable depth for the ~911 non-AMB municipalities; each has its own POUM,
PGOU or Normes Subsidiàries, published as a native-text (not scanned) PDF on that municipality's
own website, individually. The Generalitat additionally publishes solid, live, keyless regional
layers for flood risk (ACA `AIGUA_ZFP`/`AIGUA_DPH` WFS) and Natura 2000 (`inspire-natura-2000` WMS,
INSPIRE-conformant), and per-airport aeronautical-servitude KMZ/DWG downloads exist nationally
(AESA) for Girona-Costa Brava and Reus. Cultural heritage is the weak point: no region-wide
machine-readable WMS/WFS for BCIN/BCIL protected assets was found — only a human-facing geoportal
viewer and Barcelona's own municipal WMS (out of scope here). Net effect: PRYZM can always tell a
user *what land they are on and which document governs it* across all of Catalunya, and can
increasingly overlay flood/Natura2000 constraints, but it can dispatch a numeric buildable
**envelope** only where a specific municipality has been individually transcribed and registered
(currently Girona, Lleida, Tarragona, plus AMB members — each its own pack, none from a regional
source) — exactly what `esCatalunya.ts` already documents and this audit independently reconfirms.

## Capability: **Research Blocked** (regional envelope parameters) / **Indicative Ready** (regional zoning identity + selected overlays)

Two different capabilities exist at two different maturities and the template's single label does
not fit both, so both are stated: **zoning identity + classification** (MUC) is effectively
Indicative Ready region-wide — live, complete, keyless, already reflected in `esCatalunya.ts`'s
cited-refusal machinery. **Numeric envelope parameters** for the ~911 non-AMB municipalities are
Research Blocked — not because no data exists (each municipality has a POUM/PGOU), but because no
regional instrument or registry aggregates their *parameters* machine-readably; each of the ~911
requires the same one-municipality-at-a-time transcription effort already used for Girona, Lleida
and Tarragona. This is a **structural, not temporary** blocker per the governing ADR-0279 model:
Catalunya is a **coverage aggregator for citations**, never an **envelope source**.

## Evidence Matrix

| # | Research area | Region-wide asset found | Machine-readable? | Live-verified | Covers non-AMB envelope params? |
|---|---|---|---|---|---|
| 1 | Planning documents (POUM) | Per-municipality native-text PDF, e.g. Girona `text refós` PDF at girona.cat, Palafrugell POUM PDF at mapes.palafrugell.cat, Porqueres POUM PDF at ddgi.cat | Text PDF, not scanned image — but per-municipality, zero aggregation | Yes (search-confirmed URLs) | No — text only, not structured |
| 2 | Zoning geometry | Generalitat MUC — `MUC:MUCVW_MUCS_QUAL` (qualification), `MUC:MUCVW_MUCS_TM` (terme municipal), `MUC:MUCVW_AMBIT_PG_INE` (instrument register) | WFS 2.0.0, GeoJSON/GML/SHP/KML output | Yes, `sig.gencat.cat/ows/MUC/wfs?service=WFS&version=2.0.0&request=GetCapabilities` returns live capabilities | Classification only, not parameters |
| 3 | Parcel geometry | Spanish national Catastro INSPIRE WFS (not Catalunya-specific) | Yes, already the S1 provider per `docs/…/17079-girona/ENVELOPE.md` | Previously verified (repo) | N/A (parcel identity, not zoning) |
| 4 | Envelope parameters (height/FAR/occupation/setback/depth/alignment) | None found at regional scale | — | Searched; no regional parameter registry located | **No — the core gap** |
| 5 | Heritage (BIC/BCIL, historic centres, archaeology) | `patrimoni.gencat.cat` Geoportal del Patrimoni Cultural — 44,365 georeferenced assets (30,040 architectural + 14,325 archaeological) per Departament de Cultura | Human-facing viewer only; no WMS/WFS endpoint located under `sig.gencat.cat/ows/PATRIMONI` (404) or elsewhere in this session | Viewer page confirmed live; no service endpoint confirmed | No machine-readable regional layer confirmed |
| 6 | Flood | ACA (Agència Catalana de l'Aigua) `AIGUA_ZFP`/`AIGUA_DPH` WFS, `sig.gencat.cat/ows/AIGUA/wfs` | WFS 2.0.0, live, keyless, 674-layer GeoServer | Verified in-repo 2026-08-03 per `packages/site-parcel-data/src/providers/catalunyaAiguaEspaiFluvial.ts` (byte-verified live features); not re-fetched this session | ZFP/DPH yes; `ZI` (T=100/T=500 general flood zone) NOT found as a separate service — documented gap |
| 7 | Airport | AESA per-airport servitude pages: Girona-Costa Brava (RD 378/1988 amended RD 520/2023), Reus (RD 368/2011) — DWG + KMZ downloads at seguridadaerea.gob.es | KMZ (machine-readable geometry), per-airport, national source | Search-confirmed; matches the pattern already used for Barcelona-El Prat per repo's own Barcelona-airport resolution (per MEMORY) | Same national AESA source pattern as the rest of Spain — not Catalunya-specific |
| 8 | Environmental (Natura 2000, PEIN) | `geoserveis.ide.cat/servei/catalunya/inspire-natura-2000/wms` — layer `PS.ProtectedSite`; also a separate WFS download service for `espais-naturals` referenced via `catalegs.ide.cat` | WMS live-confirmed this session (`GetCapabilities` returned real layer); WFS download service referenced but not independently re-verified this session | Yes (WMS) | Constraint identity yes; not envelope parameters (not applicable to this axis) |
| 9 | Legal delegation to derived plans | Confirmed in-repo: MUC's `D1–D5` (`urbanitzable`) classes — 21,776 polygons, 4.0% of Catalunya's classified polygons — require a separately-approved *pla parcial* for parameters | N/A (a legal fact, not a dataset) | Reused from `esCatalunya.ts` measured 2026-07-31 | Confirms non-computability for that slice by design, not by gap |
| 10 | Dispatch feasibility | Parcel (Catastro) → zone identity + governing instrument (MUC) is fully automatic; zone → **envelope** is NOT automatic anywhere outside individually-registered municipalities | — | Reused from `esCatalunya.ts` + registry evidence | **No** for the ~911; **yes but per-municipality** for Girona/Lleida/Tarragona (packs are `NO PACK — not-assessed` per their own `ENVELOPE.md` files, i.e. registered as gaps, not yet solved) |

## Machine-readable assets — every verified endpoint

- `https://sig.gencat.cat/ows/MUC/wfs` — WFS 2.0.0, GetCapabilities confirmed live this session; feature types include `MUCPD_QUAL`, `MUCPD_SECTOR`, `MUCT_AMBIT`, `MUCVW_ESPAIS_OBERTS`, `MUC_EIX_ESTR`, `MUCVW_MUCS_SECT_RES` (sample; the fuller `MUCVW_MUCS_QUAL` / `MUCVW_MUCS_TM` / `MUCVW_AMBIT_PG_INE` names are the ones already load-bearing in `packages/site-parcel-data/src/rulepacks/esCatalunya.ts`, measured there 2026-07-31: 547k qualification polygons, 947/947 municipalities, 874/947 with a confirmed base general-plan expedient). EPSG:25831 native.
- `https://sig.gencat.cat/ows/AIGUA/wfs` — ACA flood layers `AIGUA:AIGUA_ZFP`, `AIGUA:AIGUA_DPH`. Live, keyless, WFS 2.0.0 (verified in-repo 2026-08-03, see `packages/site-parcel-data/src/providers/catalunyaAiguaEspaiFluvial.ts` and `resolveCatalunyaFloodOverlay.ts` — draft/schema-extraction status, NOT wired to a same-origin proxy or the registry yet).
- `https://geoserveis.ide.cat/servei/catalunya/inspire-natura-2000/wms` — layer `PS.ProtectedSite`, INSPIRE Network Services Level A, live-confirmed this session. ICGC-managed.
- `https://sig.gencat.cat/ows/FAUNA/wms` and `https://sig.gencat.cat/ows/COSTES/wfs` — found via search, referenced by the Generalitat's own service listings; not independently fetched this session (not on this audit's critical path).
- Spanish national Catastro INSPIRE WFS — the S1 parcel provider already wired for Girona/Lleida/Tarragona per their `ENVELOPE.md` files; not Catalunya-specific.
- AESA per-airport servitude KMZ/DWG downloads (Girona-Costa Brava, Reus) at `seguridadaerea.gob.es` — national source, same pattern used elsewhere in the repo for Barcelona-El Prat.
- `patrimoni.gencat.cat/ca/geoportal-del-patrimoni-cultural` — human-facing viewer only; **not** a confirmed machine endpoint (listed here as a found-but-unusable asset, not a usable one).

## Missing assets

- **A region-wide envelope-parameter registry.** No Catalunya-level source publishes height, FAR,
  occupation, setback, buildable depth or alignment for the ~911 non-AMB municipalities. This is
  the single structural gap; MUC deliberately does not carry it (`esCatalunya.ts` L.139-148: "MAY
  NOT publish any number").
- **A machine-readable regional heritage service.** `sig.gencat.cat/ows/PATRIMONI/wfs` does not
  exist (404, tested this session); no WFS/WMS equivalent to MUC/AIGUA/Natura2000 was located for
  BCIN/BCIL assets, historic centres, or archaeological protection zones region-wide. Girona's Call
  Jueu and Tarragona's Tàrraco ensemble are UNESCO-listed and certainly mapped internally by the
  Departament de Cultura, but no public service surfaces that geometry.
- **A `ZI` (Zona Inundable, general T=100/T=500 flood hazard) layer** distinct from ZFP/DPH — not
  located under the ACA WFS census (documented gap, `resolveCatalunyaFloodOverlay.ts`).
- **An RPUC (Registre de Planejament Urbanístic de Catalunya) direct API** — the instrument register
  is only reachable indirectly through MUC's spatial index (`MUCVW_AMBIT_PG_INE`), not through an
  RPUC API of its own (already noted in `esCatalunya.ts`).

## Blockers

- **Legal/structural (not solvable by more engineering):** Catalunya has 947 municipalities and no
  single ordinance governs building parameters for the ~911 non-AMB ones. This is the same
  structural fact `esCatalunya.ts` states for its own registration and this audit independently
  confirms finding no counter-evidence. Unlike AMB (PGM-1976 shared instrument) there is no
  metropolitan-style shortcut available for the rest of the region.
- **GIS-solvability, heritage:** solvable in principle (the Generalitat clearly holds this data —
  44,365 georeferenced assets per its own published figure) but not solved *today*: no confirmed
  public WFS/WMS endpoint. Would require either locating an undocumented service or requesting
  access/export from the Departament de Cultura.
- **OCR/scanning:** not currently a blocker for POUM text — the samples checked (Girona, Palafrugell,
  Porqueres, Caldes de Malavella) are native-text PDFs, not scans, consistent with what the repo
  already found for Girona/Lleida/Tarragona individually. The blocker is aggregation and per-article
  transcription effort, not OCR.
- **Engineering:** the flood overlay provider (`resolveCatalunyaFloodOverlay.ts`) is explicitly
  marked draft/unwired — no same-origin proxy, no registry entry, no certification gate treats it
  as authoritative yet. This is a "ready to wire" gap, not a research gap.

## Estimated Unlock Effort

- Regional heritage machine-readable layer: **Medium** (locate/request the correct service, or
  build an ingestion path from the geoportal if no API exists) — research-then-engineering, not
  pure engineering.
- Wiring the already-drafted flood overlay into the registry/proxy/gate chain: **Small**
  (schema and live data already proven; the gap is plumbing).
- Closing the envelope-parameter gap for the ~911 non-AMB municipalities: **Very Large** — this is
  ~911 individual municipal transcription efforts, the same order of magnitude problem the repo
  is already solving one city at a time (Girona/Lleida/Tarragona registered as gaps, not yet
  solved envelopes).

## Recommendation

**Research first**, narrowly, on exactly two items: (a) whether an undocumented or access-gated
regional heritage WFS/WMS exists before assuming one must be built from the viewer; (b) whether
wiring the already-drafted `resolveCatalunyaFloodOverlay.ts` is worth prioritizing given it is
Small effort with a real live source behind it. **Do not build** a regional envelope-parameter
source — none exists to build against; the only path is the municipality-by-municipality one
already in motion. This audit does not recommend implementation of anything.

## PRYZM Readiness Score: **34 / 100**

Scored on the same rough model as the AMB gate: high marks for zoning-identity coverage and
citation honesty (already shipped, live, and unusually rigorous per `esCatalunya.ts`'s own
measured methodology), near-zero for the actual deliverable this audit was asked about — buildable
envelope parameters for the ~911 non-AMB municipalities — because no regional source for that
exists to score against. The number reflects "PRYZM never lies to a Catalan user" (high) combined
with "PRYZM can compute a number for almost none of non-AMB Catalunya" (structurally near-zero,
not an engineering debt).

## Compare against

| Jurisdiction | Regional/central parameter source? | PRYZM coverage model |
|---|---|---|
| Barcelona (AMB, already covered) | Yes — PGM-1976 shared metropolitan instrument, 22–27 municipalities | Corpus gate (`AMB_PGM_NNUU_ENVELOPE_VERIFIED`) — the shortcut Catalunya-at-large lacks |
| **Catalunya (this audit)** | **No** — 911 independent instruments | Per-municipality only; MUC = classification, not parameters |
| Murcia | Single PGOU-Murcia-capital instrument, transcribed | Municipal, but one large single-city win already banked |
| Balears | MUIB regional cadastral/zoning layer (per `esBalearsMuib.ts`) — partially regional | Better regional footing than Catalunya on the classification axis |
| Zaragoza | Single-city PGOU, transcribed (`esZaragoza.ts`) | Municipal, standalone |
| Sevilla | Single-city zone resolver (`resolveSevillaZone.ts`) | Municipal, standalone |
| Valencia | Alineaciones + envelope packs, city-specific | Municipal, standalone |
| Granada | Rule pack registered (`esGranada.ts`) | Municipal, standalone |
| Córdoba | Zone classification registered (`esCordobaZoneClassification.ts`), verification/dispatch/rendering tracked as separate milestones per project memory | Municipal, standalone |
| Málaga | Real parameter corpus read per project memory (cross-regional depth-vocabulary flag noted) | Municipal, standalone |

Catalunya is unusual among this set for having a genuinely strong **classification-and-citation**
layer at regional scale (MUC) that none of the single-city comparators have an equivalent of — but
it is the *weakest* of the group on the parameter axis specifically because its regional layer
was deliberately built to never publish a number, whereas the single-city packs (Zaragoza, Sevilla,
Valencia, Granada, Córdoba, Málaga) each publish real parameters for their one city.

## Final verdict + single biggest blocker

Catalunya beyond AMB cannot be "unlocked" the way AMB unlocked 22+ municipalities from one
instrument — there is no regional shortcut for envelope parameters, only for zoning **identity**,
which PRYZM already exploits well. **The single biggest blocker is structural, not technical: no
Catalunya-wide (or even sub-regional) instrument sets buildable parameters for the ~911 non-AMB
municipalities, so every one of them requires the same individual transcription-and-registration
effort already applied to Girona, Lleida and Tarragona — each of which, notably, is STILL an
unregistered `not-assessed` gap today, not a shipped envelope.**
