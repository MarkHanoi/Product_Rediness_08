# SOURCES — Córdoba (INE 14021)

> The trust gate (playbook §3.3). **No pack field ships a value yet** — the numeric parameters live in
> scanned ordinance PDFs and are unextracted/unverified, so this is a **source catalogue**, not a
> per-field citation table. A pack may not ship `confidence: 'structured'` until every value it sets has a
> row here backed by an extracted, human-verified number. **Never interpolate a legal number.**
> All rows tiered VERIFIED-LIVE (fetched 2026-07-23) / COULD-NOT-VERIFY.

## A — Live data endpoints (verified this session)

| # | Source | Endpoint | Returns | Granularity | Tier |
|---|---|---|---|---|---|
| A1 | **COACo GeoServer — calificación** | `https://geoserver.pgou.coacordoba.org/geoserver/wfs` · `typeNames=coaco:ordenanzas` | Polygon + `ordenanza` (calificación code) + `sup_m2` + `link` (ordinance PDF). **453 features**, ~10 families, 15 PDFs. | zone/manzana polygon | **VERIFIED-LIVE** |
| A2 | COACo GeoServer — derived planning | `…/wfs typeNames=coaco:actuaciones` | 42 ámbitos: `instrumento` (PP/PERI/ED/SG), `clase_suelo`, `tramitado`, `link` | ámbito | **VERIFIED-LIVE** |
| A3 | COACo GeoServer — uso global / dotacional | `…/wfs typeNames=coaco:usos_globales`, `coaco:usos_dotacionales` | uso polygons (`tipo`, `actuacion`, `sup_m2`) | polygon | **VERIFIED-LIVE** |
| A4 | COACo GeoServer — districts (coverage) | `…/wfs typeNames=coaco:distritos` | **2 rows only: Sur (01), Noroeste (02)** — defines the pilot extent | district | **VERIFIED-LIVE** |
| A5 | COACo GeoServer — cadastre×urbanism | `…/wfs typeNames=coaco:vcatastro_urbanismo` | cadastre-joined urbanism | parcel | **VERIFIED-LIVE (present; not profiled)** |
| A6 | COACo GeoServer — WMS | `https://geoserver.pgou.coacordoba.org/geoserver/wms?…GetCapabilities` (v1.3.0) | 15 renderable layers | — | **VERIFIED-LIVE** |
| A7 | **National SIU — clasificación** | `https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15/query?where=ProvINE='14021'` (browser UA) | 6 clases de suelo, all `FechaBaja=99999999` (in force) | sub-municipal MultiSurface | **VERIFIED-LIVE** |
| A8 | National SIU — plan in force | `…/SIU/Planeamiento_Vigente/MapServer/1/query?where=nombre LIKE '%rdoba%'` | `FiguraVigente="Plan General"`, `FechaFigura=2002`, `UrlLink=…situadifusion…` | municipality | **VERIFIED-LIVE** |

## B — Document sources (the numbers, not yet extracted)

| # | Source | Location | State | Tier |
|---|---|---|---|---|
| B1 | Ordinance PDFs (15 links → **12 distinct docs**) | `http://visor.pgou.coacordoba.org/doc/ordenanzas/O_*.pdf` | ⚠ **HETEROGENEOUS, NOT uniformly scanned** (corrects the prior "all scanned, no text layer"): **2 born-digital text** (`O_INDUSTRIAL` 23 620 chars, `O_UAD3` 8 021 chars — read by text-pull); **10 clean rasters** (read by render-to-PNG + vision, fully legible); the **5 `O_MC*` names are ONE Manzana-Cerrada chapter** (dedupe by content, not filename); **2 dead links** (`O_UAD1`, `O_UAS1` → 69-byte "Server under construction" HTML — but `O_UAD1`'s content lives inside `O_UAD3`). **Numbers now EXTRACTED** (machine, `pipeline-extracted-unverified`) — see `findings/OCR-EXTRACTION-RESULTS.md`. | **VERIFIED-LIVE (files); values pipeline-extracted-unverified** |
| B2 | PGOU-2001 full plan | Junta SITUA `https://ws132.juntadeandalucia.es/situadifusion/pages/search.jsf` (search INE 14021) + GMU Córdoba `https://www.gmucordoba.es/urbanismo/plan-general-de-ordenacion-urbanistica-pgou` | document registry (PDF payload) | **VERIFIED-LIVE (registry)** |
| B3 | PEPCH (casco histórico) | separate Plan Especial — dual regime, not in the COACo pilot | not sourced | **COULD-NOT-VERIFY** |

## C — Per-field pack rows (the value table)

**STILL EMPTY as a `structured`/verified table** — the L-449 gate is NOT met (no human sign-off yet).
The numbers ARE extracted, but at tier **`pipeline-extracted-unverified`** (machine OCR/vision, below
`estimated-ruleset`), so they do **not** belong in this verified value table. The full extracted set — per
family, per field, with the governing article and the gate flags — is in
**`findings/OCR-EXTRACTION-RESULTS.md §2`**, and authored (unregistered) into
`packages/site-parcel-data/src/rulepacks/esCordobaPGOU2001.ts`. This section is filled here only after a
Spanish-planning-literate human verifies each value against the source crop and records it in
`VERIFICATION.md` + a C23 AIArtefact `humanApproval` — one row per value: `value · unit · governing
ordenanza/article · document + date · URL`.

⚠ **Do not promote the pipeline values into this table without the human pass.** A wrong number we OCR'd
ourselves is our pipeline's error (`ORDINANCE-EXTRACTION-PIPELINE.md §3`); it must stay visibly unverified
until signed off.

## D — Provenance / legal chain

- Instrument: **PGOU-2001** (approved 2001; SIU `FechaFigura=2002`). Frame: LOUA → **LISTA (Ley 7/2021)**.
- Normas Directoras (electronic documentation) in force **24 Apr 2026** — post-date plans publish geodata via
  VITUA; the 2001 PGOU predates it, hence PDF-only.
- Provider of A1–A6: **Colegio Oficial de Arquitectos de Córdoba (COACo)**, IMDEEC-funded pilot
  (`informatica@coacordoba.net`).
