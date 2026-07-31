# `spanish-genome-probe`

A small, reusable ArcGIS-REST crawler + planning-layer scorer, built to run **GENOME TEST 01**
(Madrid → València): *does a discovery engine calibrated on one Spanish city locate another city's
planning layers without bespoke research?*

This is a **probe, not the national compiler**. It answers "which layer is the zoning layer, and which
field is the zone code", records **which heuristics fired**, and stops there.

## Files

| File | What it is |
| ---- | ---------- |
| `heuristics.ts` | The token tables. **Every token is provenance-tagged** (`MAD`/`B11`/`SEV`/`P41`/`P42`) to a source that predates any València observation. |
| `scoring.ts` | Pure layer scorer + field→ontology classifier. No I/O. |
| `arcgisCrawler.ts` | Catalogue → folders → services → layers → fields. Typed `Fetched<T>` so a 500, a timeout, an ArcGIS error envelope and an empty list are four distinct results. |
| `probe.ts` | CLI. Crawls a root, ranks layers, emits a per-heuristic hit/miss ledger. |
| `rank.ts` | Looks up a known layer's rank/score/margin in a report. |
| `cities.ts` | Declarative per-city config. **This file is the CH5 "<200 lines" budget** — root URL, folder filter, CRS, doc URLs only. |
| `slimFixture.ts` | Shrinks a `--raw` dump into a repo-sized test fixture. |

## Usage

```bash
npx tsx tools/spanish-genome-probe/probe.ts <arcgis-rest-root> \
    [--folders <regex>] [--top N] [--out report.json] [--raw crawl.json]

npx tsx tools/spanish-genome-probe/rank.ts report.json <layerUrlSuffix>...

npx vitest run --config tools/spanish-genome-probe/vitest.config.ts
```

No `package.json` — deliberately, so the tool cannot perturb `pnpm-lock.yaml`
(matches `tools/city-completion/`, `tools/height-engine/`).

## The calibration lock

`__tests__/scoring.test.ts` scores a real 701-layer crawl of `sigma.madrid.es` (captured 2026-07-31,
`fixtures/madrid-crawl-slim.json`) and asserts Madrid's ground-truth ranks:

- `NORMAS_ZONALES/0` (zoning) → top 3
- `PG_ORDENACION/3` (derived plans) → top 3
- `PG_CONDICIONES_EDIFICACION/6` (NZ1 envelope) → **NOT** top 3 (a documented limitation, locked in
  as a fact: this is a zoning discoverer, not an envelope discoverer)

**If you tune the heuristics to make a new city pass, these tests fail.** That is the point.

## Results

- Pre-registration: `docs/04-reference/jurisdictions/es/findings/GENOME-TEST-01-PREREGISTRATION.md`
- Experiment: `docs/04-reference/jurisdictions/es/findings/GENOME-TEST-01-MADRID-TO-VALENCIA.md`
- València recon (P4.5): `docs/04-reference/jurisdictions/es/es-vc/46250-valencia/findings/VALENCIA-DATA-RECON.md`
