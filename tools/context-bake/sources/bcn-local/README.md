# Barcelona municipal downloads — staging (NOT committed)

Put the CartoBCN downloads here. **Everything in this folder except this README is
git-ignored on purpose** — these are 100 MB–550 MB archives and they must never enter the
repository history.

## What goes here

Downloaded from <https://w20.bcn.cat/cartobcn/> · Ajuntament de Barcelona, `Cartografia_AJBCN`.

| Priority | Product (English catalogue name) | Format | Scope | Why |
|---|---|---|---|---|
| 1 | **MUNICIPAL THEMATIC MAP by ELEVATIONS and BUILDING with Geopackage format** | GeoPackage | City | GDAL reads it directly — one `ogr2ogr` to GeoJSON and it enters the existing vector bake |
| 2 | **Municipal Topographic Cartography - GIS GPKG** | GeoPackage | City | The 3-D topographic base the buildings model is extruded from; fallback if (1) is styling rather than geometry |
| 3 | **Three-dimensional buildings model** | SLPK | City | The product whose metadata sheet is quoted in the adoption plan (`Z_MIN_VOL` / `Z_MAX_VOL`). Cross-check only — SLPK is an Esri 3-D scene package and needs I3S unpacking |

⛔ **Not** the DGN / DWG / JPG / GeoPDF products. CAD and pictures, not usable data.

## ⚠ Save the licence text too

The single thing gating whether this data may be baked to R2 is the **terms of use shown at
registration**. Save them beside the archive as `TERMS-AS-ACCEPTED.txt`, with the date.

Why it matters: the Barcelona geoportal grants CC BY 4.0 generally but routes *"types of data
where there is participation by third parties"* to **CC BY-ND 4.0**, and ND would forbid
redistributing our derived tiles. See
`docs/04-reference/geospatial/BARCELONA-LOD2-ADOPTION-PLAN.md` §A.2 for why that trigger
probably does not attach to this product — the argument is that the catalogued product carries
only municipal attributes (`NIVELL`, `PERÍMETRE`, `DISTRICTE`, `BARRI`, `Z_MIN_VOL`,
`Z_MAX_VOL`, `OBJECTID`) and no Catastro join. **That is an argument, not a determination.**
The accepted terms are the evidence; keep them.

## ⚠ Why this is staged by hand and not fetched by CI

The download is **registration-gated** — basket, form, accept the terms, email activation. It
cannot run unattended. This is the same shape as the SE/DK cadastre gates
([[identity-bootstrap-gate-offline-legislation-pattern]]): a human-fetched artefact, staged
once, with the bake reading the staged file. Record it as a deliberate exception in the City
Replication Standard rather than letting a later reader discover it as an inconsistency.

## First thing to run once a file lands

```bash
ogrinfo -so tools/context-bake/sources/bcn-local/<file>.gpkg
```

That lists the layers and their geometry types without loading the data — it is how we find out
whether the buildings layer carries per-volume heights, which decides the whole ingest.
