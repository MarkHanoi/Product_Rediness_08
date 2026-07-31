# `tools/murcia-terrain-probe`

Standalone live probe for the **terrain + building-height** half of the Murcia (INE 30030) site
stack. Findings live in
`docs/04-reference/jurisdictions/es/es-mc/30030-murcia/findings/MURCIA-TERRAIN-AND-HEIGHTS.md` —
**read that first**; this directory is the evidence, not the conclusion.

No dependency on `packages/**`. Plain `.mjs`, run from the repo root with Node ≥20.

```bash
node tools/murcia-terrain-probe/probe-01-sources.mjs       # enumerate IGN elevation coverages
node tools/murcia-terrain-probe/probe-02-posting.mjs       # VERIFY posting spacing — the gate
node tools/murcia-terrain-probe/probe-03-terrain.mjs       # int16 path (encoding evidence only)
node tools/murcia-terrain-probe/probe-04-terrain-float.mjs # DEFINITIVE slope / aspect (float)
node tools/murcia-terrain-probe/probe-05-buildings.mjs     # Catastro parcel + buildings
node tools/murcia-terrain-probe/probe-06-ndsm.mjs          # measured heights + vacancy control
node tools/murcia-terrain-probe/probe-07-finer.mjs         # MDT02 / PNOA LiDAR / CARTOMUR / IDERM
node tools/murcia-terrain-probe/probe-08-rasant.mjs        # per-edge boundary datum profile
node tools/murcia-terrain-probe/probe-09-scale.mjs         # request cap + municipality budget
```

## The rules these probes follow

1. **Posting spacing is verified, never inferred from a coverage name.** `probe-02` derives it two
   independent ways (`gml:offsetVector`, and domain-envelope ÷ grid-envelope) and they must agree.
   Every downstream statistic is reported with the posting that produced it.
2. **Vertical quantisation is the second fidelity axis.** The same coverage returns Int16 over
   `FORMAT=image/tiff` and float over `FORMAT=ArcGrid`. Slope figures are computed on the float
   encoding only.
3. **Never trust a status code.** Every payload is validated against its own declared size —
   `Content-Length` vs received bytes for XML, and `ncols × nrows` vs parsed cell count for ASCII
   grids. `TRUNCATED-BUT-200` is a distinct, reported verdict.
4. **Failure ≠ absence.** `host-unreachable`, `timeout`, `http-4xx`, `ows-exception`,
   `empty-but-well-formed` and `truncated-but-200` are six separate verdicts. An unreachable host is
   recorded as UNKNOWN, never as "the dataset does not exist".
5. **Absence claims need a control.** Before calling the target parcel vacant, the same stored query
   is run against a neighbour known to have buildings (`probe-06` step A).
6. **The probe's own window must not manufacture absence.** `probe-06` pads the raster fetch beyond
   the footprint bbox so edge buildings aren't starved of samples and misread as "unmeasurable".
7. **Report `n` and the method for every statistic.** No scalar without its sample count.
8. **Be a polite client.** All responses cache to `cache/` keyed by sha1 of the URL — re-runs never
   re-hit IGN or Catastro. Requests are serialised per host with a 900 ms minimum gap.

## Layout

| File | Purpose |
|---|---|
| `lib.mjs` | cached + rate-limited fetch, payload validators, geotiff/proj4 loaders, the site constant |
| `probe-0N-*.mjs` | the probes above |
| `out-0N-*.json` | machine-readable results (committed — they are the evidence) |
| `cache/` | raw responses, **git-ignored** |

`geotiff` and `proj4` are resolved from the main checkout's existing installs (this worktree has no
`node_modules`); `lib.mjs` falls back to a bare specifier if the pinned path is absent.
