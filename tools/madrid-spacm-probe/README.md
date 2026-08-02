# madrid-spacm-probe — how to re-run

Measures the four `spacm_*` Comunidad de Madrid planning datasets. Seeded and deterministic:
there is no sampling anywhere, so a re-run reproduces every figure exactly unless the publisher
changes the data.

```bash
node tools/madrid-spacm-probe/01-schema.mjs            # DescribeFeatureType + exact feature counts
node tools/madrid-spacm-probe/02-paging-and-domains.mjs # paging capability, municipality key, domains
node tools/madrid-spacm-probe/03-verify-paging-and-key.mjs  # verifies step 2's two claims
node --max-old-space-size=6144 tools/madrid-spacm-probe/04-census.mjs   # ~10 min, ~180 MB, caches to out/
node --max-old-space-size=6144 tools/madrid-spacm-probe/05-analyse.mjs  # coverage + override ratio
node --max-old-space-size=6144 tools/madrid-spacm-probe/06-r-layer.mjs  # instrument-selector capability
```

Run 03 before trusting 04–06: it is the control. Step 04 refuses to write a layer whose page walk
does not reconcile against an independent `resultType=hits` total, and 05/06 refuse to load a
layer marked `reconciled:false`.

`out/census-*.json` are gitignored caches. Delete them to force a fresh download.

Endpoint: `https://idem.comunidad.madrid/geoserver3/wfs` (WFS 2.0.0, no key, no auth).

## Method notes that matter

- **Paging requires `sortBy=CDID`.** Without it the service returns
  `Cannot do natural order without a primary key`. With it, `startIndex` advances correctly —
  verified disjoint and complete in step 03.
- **`resultType=hits` returns an exact, uncapped `numberMatched`** (93,839 against an advertised
  `CountDefault` of 5,000), so it is a valid independent oracle for the page walk.
- **`CD_MUNICIPIO` is a 3-digit zero-padded code**, not INE-5 and not DGC-5. Madrid capital is
  `079`, Corpa is `048`. Cross-checked against `Callejero:SIGI_V_MUNICIPIOS` on the same server.
- Numeric fields are counted as valid only when `> 0`; step 05 §0 shows the zero-inflation that
  justifies it (`NM_RTR_FRNT` carries 7,225 zeros).
