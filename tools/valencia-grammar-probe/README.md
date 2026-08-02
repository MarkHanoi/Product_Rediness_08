# València grammar probe — M1 / M2 / M3

Measures the **Comunitat Valenciana** planning system against
[`VALENCIA-GRAMMAR-HYPOTHESIS.md`](../../docs/04-reference/jurisdictions/es/es-vc/VALENCIA-GRAMMAR-HYPOTHESIS.md).

`13-verdict.mjs` regenerates every headline figure; `_13_verdict.json` is the machine-readable
result. Findings were reported to the orchestrator, which owns the jurisdiction docs.

Endpoint: `https://terramapas.icv.gva.es/0702_Planeamiento` (WFS 1.1.0 / 2.0.0, **MapServer**).

## Run

```bash
node 00-recon.mjs          # GetCapabilities + DescribeFeatureType (3 planning typenames)
node 01-validate.mjs       # OGC-filter controls        → FAILS BY DESIGN, see below
node 02-filter-forms.mjs   # filter-encoding sweep
node 03-controls.mjs       # CQL controls               → FAILS BY DESIGN, see below
node 04-filter-verify.mjs  # ⭐ establishes the PROVEN transport
node 05-census.mjs         # regional census pulls A + B (geometry-free)
node 06-analyse.mjs        # zon_suelo vocabulary, sharing, clas_suelo
node 07-schemas-all.mjs    # all 6 typenames — parameter hunt
node 08-inventario.mjs     # InventarioSuSuz: FAR + zero-as-null contradiction test
node 09-grammar-derivable.mjs  # ⛔ the decisive test
node 10-area-sample.mjs --all  # area census (542 municipalities, ~25 min)
node 11-pdf-text.mjs       # M3: extract the official data-model PDF text
node 12-provenance.mjs     # url_abs trap test
node 13-verdict.mjs        # generates every number quoted in FINDINGS.md
node 14-paging.mjs         # paging/sortBy capability
```

Steps 05/10/11 write cache files; later steps reuse them. Delete `_*.xml` to force a refetch.
`10-area-sample.mjs` without `--all` runs a seeded stratified sample (seed `20260802`) instead of
the census.

## ⛔ Two steps fail deliberately — do not "fix" them

`01` and `03` are **retained as evidence**, not as broken code.

- **`01`** uses the OGC `PropertyIsEqualTo` filter on `cod_ine_mun` that a previous probe used.
  It fails server-side (`FLTApplyFilterToLayer() failed msPostGISLayerWhichShapes(): Query error`)
  for **every** municipality including the known-positive. Reading that error as "no data" would
  record a **false negative for the whole region**.
- **`03`** uses `CQL_FILTER`, which this server **accepts and silently ignores** — MapServer does
  not implement it. Every municipality returned `COVERED`, and `resultType=hits` returned the
  identical whole-layer total (122,840) for València, for Tollos **and for Madrid**.

`CQL_FILTER` was caught **only** by the negative control. A positive-only check would have passed
it and every per-municipality count in this run would have been a regional total.

## The method rule this run exists to enforce

> **A successful response is not an applied filter.**
> A filter is accepted only when **both** hold:
> 1. every returned feature actually carries the requested value, **and**
> 2. a value known to be outside the region returns **zero**.

The **proven** transport is OGC `PropertyIsLike` on `cod_ine_mun` (positive-verified *and*
negative-clean), which is what steps 05–13 use.

## Controls that passed

| Control | Independent source | Result |
|---|---|---|
| Municipality count | 542 (Castelló 135 + València 266 + Alacant 141) | census returned **exactly 542** |
| Regional area | 23,255 km² | shoelace area census — see FINDINGS |
| `zon_suelo` domain | official data-model PDF, tabla 2 anexo IV | 21 published codes, **21 measured**, exact match |
| Tollos (03130) polygons | prior probe, independent run | 13 = 13 |
| Download completeness | `resultType=hits` oracle | 122,840 = 122,840 on every pass |

## Notes for the corpus

- **Paging is NOT broken here.** All 8 configurations (WFS 1.1.0/2.0.0 × 4 `sortBy` forms) page
  correctly with disjoint pages. This endpoint is **MapServer** and honours `startindex` natively;
  the `sortBy` remedy is a GeoServer behaviour. M1/M2 never depended on paging — the full 122,840
  features return in a **single** request and reconcile against `hits`.
- **Geometry suppression:** `propertyname=` omitting `msGeometry` drops geometry (23× smaller).
  That is what makes the census cheap — and it caused a **self-inflicted zero** in the first run of
  step 10, which reported 0 km² for every code. A zero must be explained before it is reported,
  **including when the probe caused it**.
- `outputformat=csv` and `outputformat=gpkg` are supported and may be cheaper for future pulls.
