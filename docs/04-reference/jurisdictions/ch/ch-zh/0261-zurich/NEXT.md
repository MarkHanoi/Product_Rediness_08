# NEXT — Zürich (BFS 0261, canton ZH, Switzerland)

> **What this file is.** Where we stopped on Zürich, exactly why, and precisely what to do next — so a
> source/technique found in any OTHER jurisdiction can be brought straight back here.
> **Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD (C63 Phase-1 audit)

## 1 — WHERE WE STOPPED (the one-paragraph truth)
Zürich is the best-provisioned CH city and the furthest along: a registered BZO rule pack computes an
`estimated-ruleset` envelope for regime-resolved parcels (the Barcelona-analogue path). The three cheap axes
are cited-derived (DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56 → overall 66 % partial). The remaining gains are
DIFFERENT kinds of work: (a) resolve the `VERIFICATION.md` sign-off contradiction + the docid-6808 regime
ambiguity (human review, LEGISLATION); (b) run the C58 buildable-land coverage survey (ENVELOPE); (c) build
the swisstopo nDSM STAC join + re-bake (HEIGHTS/TERRAIN verify).

## 2 — THE NUMBER
**Overall 66 %** on the ASSESSED subset (renormalised over DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56, weights
15/10/5 → 19.8/30 = 0.66). **PARCEL is DERIVED/HIGH** (L-449 founder sign-off 2026-07-30 — AV survey-grade;
qualitative, not yet folded into the numeric Overall). LEGISLATION · ENVELOPE · HEIGHTS are `not-assessed`
(typed reasons in `RATE.md`), NOT 0 % (C63 §1.2). The city's real LEGISLATION/ENVELOPE progress (the BZO pack) is UNMEASURED by
the scorecard, so it does not inflate the number — captured in prose + §3 below.

## 3 — BLOCKERS
### 3.1 — LEGISLATION sign-off contradiction (RISK R3)
- **What it is.** `sources/VERIFICATION.md` top-section says "✅ SIGNED OFF 2026-07-26 · `CH_FAR_CERTIFIED` ON";
  the same file's per-parcel "Zürich BZO sign-off" line (§Open items) is UNSIGNED with open items (b) exact
  source-PDF URLs NOT CONFIRMED, (a) docid→regime crosswalk populated-but-not-human-CONFIRMED.
- **Why it blocks.** Axis 2 `human-reviewed` validation requires an un-contradicted signed VERIFICATION; the
  scorecard cannot honestly credit a contradictory sign-off (§CONTEXT-DATA-HONESTY).
- **What would unblock it.** Human review reconciling the two statements + confirming the source-PDF URLs.
- **THE EXACT RESUME STEP.** Read `sources/VERIFICATION.md` §"Open items before CH_FAR_CERTIFIED = ON",
  resolve items (a)/(b), and sign the per-parcel line — or correct the top-section if it over-claimed.

### 3.2 — docid-6808 regime ambiguity
- **What it is.** The most frequent `rechtsvorschrift_url` docid (6808, ~555 sample polygons) is an
  image-only scan → unclassifiable → parcels linking only to it resolve `regime-ambiguous`.
- **THE EXACT RESUME STEP.** Source a text-bearing BZO 2016 consolidated doc (the 2016 analogue of 91/99's
  docid 16945), classify it via `classifyBzoRegimeFromDocText`, add to `ZURICH_BZO_REGIME_BY_DOC`.

### 3.3 — ENVELOPE coverage unmeasured
- **THE EXACT RESUME STEP.** Run the C58 buildable-land coverage survey over the ZH BZO zones → the share
  that resolves to a constructed envelope vs cited refusal → the Axis-4 %.

### 3.4 — HEIGHTS nDSM not baked (§SWISS-NDSM-STAC-BUILD)
- **THE EXACT RESUME STEP.** Wire the STAC→COG-stitch nDSM join (swissSURFACE3D − swissALTI3D over OSM
  footprints) + LV95↔WGS84 projector in the buildings bake runner, re-bake `zurich`, probe the provenance
  histogram.

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)
- **4.1 — If any CH city's `/api/ch/<city>-bzo` proxy + CSP is wired** → flip Zürich's regional-zone-GIS from
  `documented` to `live` in DATA-SOURCES (§3 of RATE.md Axis 3) and re-derive.
- **4.2 — If the swisstopo nDSM STAC join lands for ANY CH city** → it ports to Zürich for free (§3.4).
- **4.3 — If `terrain.verify.mjs` round-trips the `zurich` tileset** → TERRAIN rung 50 → 100.

## 5 — WHAT IS ALREADY BUILT (do not redo)
- The BZO 700.100 AZ/Vollgeschosse/Gebäudehöhe catalogue (`chZurichBzoCatalogue.ts`, both regimes) + the
  regime crosswalk (`zurichBzoRegimeResolver.ts`, 12 docs classified) + the ZH parcel + BZO WFS probes
  (`findings/ZURICH-BZO-PROBE.md`).

## 6 — VERIFIED SOURCES
| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `maps.zh.ch/wfs/AVZHWFS` `liegenschaften_f` | cantonal AV parcel ring | VERIFIED-LIVE | GetFeature BBOX (Zürich HB) → `AA5070`, EGRID, 750 m², `bfsnr 261` |
| `ogd.stadt-zuerich.ch/wfs/.../BZO_` `bzo_zone_v` | municipal zone `typ` + `rechtsvorschrift_url` | VERIFIED-LIVE | `typ E1/W2bIII`, per-parcel ordinance URL |
| STAC `ch.swisstopo.swissalti3d` / `swisssurface3d-raster` | DTM / DSM COG tiles (nDSM) | VERIFIED-LIVE | HTTP 200, EPSG:2056 COG per 1 km tile |

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)
- `data.geo.admin.ch` WCS-2 GetCoverage in EPSG:4326 → HTTP 404 NoSuchKey (it is an object store; use STAC).
- `bzo_zone_v` / `bzo_zone_erhoehte_az_v` DescribeFeatureType → NO numeric AZ/height field (PDF-bound).

## 8 — THE SMALLEST NEXT STEP that moves the number
Resolve the `VERIFICATION.md` sign-off contradiction (§3.1) — the cheapest move that unlocks the LEGISLATION
axis toward a measured `human-reviewed` number. Pure human review, no new fetch.
