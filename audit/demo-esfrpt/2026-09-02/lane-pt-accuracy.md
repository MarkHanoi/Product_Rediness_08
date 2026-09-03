# LANE PT-PARCEL-ACCURACY — "Parcels in Portugal are not accurate" (founder, 2026-09-03, live app.pryzm.so)

**Verdict: CLASS (a) — fallback-presented-as-parcel, driven by a genuine DATA WALL.** An urban
Portuguese click resolves the OSM **building footprint**, not a cadastral parcel, because the DGT
Cadastro Predial publishes **zero parcels for the Lisboa and Porto municípios**. Not a CRS bug,
not a stale source. The client already brands the fallback honestly; the missing piece was the
**why**, which the `pt` proxy leg now states on every `empty`. ISSUE-LOG row: **L-12897**.

All transcripts: `audit/demo-esfrpt/2026-09-02/transcripts/pt-accuracy/`.

---

## 1. Reproduction (live, 2026-09-03)

The PT route today: registry PT row (`packages/site-parcel-data/src/parcelProviders/registry.ts`,
`providerId 'dgt-cadastro-predial'`, `contains: isInPortugal`) → generic client
(`apps/editor/src/ui/site/parcel/WfsParcelProvider.ts`) → same-origin `/api/parcel/pt`
(`server/jurisdiction/euCadastreProxy.js` `pt` leg) → SNIC WFS
`snicws.dgterritorio.gov.pt/geoserver/inspire/ows`, `inspire:cadastralparcel`, urn-authority
EPSG:4326 bbox. On a miss the registry falls to the OSM footprint
(`footprintPick.ts` → `source 'footprint (OSM)'`, confidence hard-`'low'`).

| Point | Coords | SNIC WFS (proxy's exact query shape) | Production `/api/parcel/pt` |
|---|---|---|---|
| Central Lisboa | 38.7223, −9.1393 | `numberMatched: 0` (`snic-lisbon.txt`) | `{"parcel":null,"outcome":"empty"}` (`prod-proxy-lisbon.txt`) |
| Central Porto | 41.1496, −8.6110 | `numberMatched: 0` (`snic-porto.txt`) | `{"parcel":null,"outcome":"empty"}` (`prod-proxy-porto.txt`) |
| Alentejo rural (Évora area) | 38.57, −7.90 | `numberMatched: 0` (`snic-alentejo.txt`) | — |
| **Control** (Vila Velha de Ródão, the 2026-07-31 verified point) | 39.6702, −7.5566 | **7 features**, real WGS84 MultiPolygon, NIC attributes (`snic-knowngood-vvrodao.txt`) | **real parcel ring returned** (`prod-proxy-vvrodao.txt`) |

Whole-area `resultType=hits` counts (`snic-hits-*.txt`):

- **Porto city bbox (41.13–41.19 × −8.70…−8.55): 0 parcels.** The entire city.
- Greater-Lisbon bbox: 2,078 — **all in Amadora** (DICOFRE 1115xx, a SiNErGIC pilot; sample
  `snic-lisbonbbox-sample.json`). Lisboa município itself: 0 at every probed point.
- Évora-area bbox: 2,266 (per-município patchwork; the exact rural test point still 0).
- **National total: 1,789,672** (was 1,789,404 on 2026-07-31 — the dataset is alive and growing).

**Rules out class (b) CRS/offset:** the control point returns genuine WGS84 degrees under the same
`srsName`/urn-authority-bbox request the proxy issues (the Córdoba/Murcia silent-empty trap is
already correctly defended in `ptUrl`). **Rules out class (c) stale source:** the same live
service answers correctly wherever coverage exists.

## 2. Classification

**(a) fallback-presented-as-parcel — with one important nuance: the client-side honesty machinery
already exists and fires.** The fallback is stamped `source: 'footprint (OSM)'`, `refcat` is the
OSM way id, confidence is hard-`'low'` by construction (`footprintPick.ts`), the parcel card
renders the banner *"⚠ Building footprint (OSM) — NOT a legal cadastral parcel…"*
(`parcelCard.ts` `PARCEL_FOOTPRINT_WARNING`, kind-field-driven per §L-1581), and on commit the
jurisdiction label is forced to *"OpenStreetMap contributors — building footprint, not a cadastral
parcel"* (`SiteBoundaryMap2D.ts` §L-1580).

What was genuinely missing: **nothing anywhere said WHY** — that Portugal publishes no urban
cadastre at all, so in Lisbon/Porto the footprint is the best any source can do. A user who
expected the land parcel reads the building outline as "inaccurate", which is exactly the
founder's words. The proxy's `empty` (honest: the cadastre answered) was indistinguishable from
"no parcel exists here", when for PT it almost always means "no cadastre published for this área".

## 3. Better-channel probes (all foreground, UA `PRYZM-Research/1.0`)

| Channel | Verdict | Evidence |
|---|---|---|
| **DGT SNIC INSPIRE WFS** (current channel) | LIVE, keyless, CC BY 4.0, correct — but per-município coverage; **Lisboa + Porto = 0** | `snic-*.txt` |
| **DGT OGC API `cadastro` collection** — NEW since the 2026-07-31 probe (which correctly recorded no parcel collection there) | LIVE (`ogcapi.dgterritorio.gov.pt/collections/cadastro`, "Cadastro Predial (Continente)") — **the SAME incomplete dataset**; Lisbon `numberMatched: 0`. No routing gain | `ogcapi-collections.json`, `ogcapi-cadastro-meta.json`, `ogcapi-cadastro-lisbon.json` |
| **BUPi RGG** (Representação Gráfica Georreferenciada) | **LIVE keyless WFS + ArcGIS REST** — `geo.bupi.gov.pt/gisbupi/services/opendata/RGG_DadosGovPT/MapServer/WFSServer` (+ Madeira sibling), CC BY 4.0, updated daily, **3,546,427 polygons** with matriz refs (`numeromatriz` e.g. `R-20525`) — the 2024 "WFS removed" reporting is STALE. **BUT rústico/misto voluntary registrations only: 0 at Lisbon, Porto, and every rural test point; point-query mechanics proven at Proença-a-Nova.** Not an urban channel; a plausible future *rural supplement* | `bupi-rgg-dataset.json`, `bupi-rgg-mapserver.json`, `bupi-rgg-{lisbon,porto,alentejo}.json`, `bupi-rgg-sample.json` (count 3,546,427), `bupi-rgg-mechcheck.json` |
| **Lisboa municipal (geodados-cml.hub.arcgis.com)** | No cadastral/lote parcel dataset found (two hub-search APIs, 0 results; web search agrees) | `cml-hub-search*.json` |
| **Informação Predial Simplificada** (IRN) | Textual land-registry extracts, per-prédio, no geometry, no open API — cannot serve polygons by construction (the Registo Predial is descriptive) | service page redirects to conservatoria.justica.gov.pt (500 at probe time) |

**DATA WALL, stated with evidence: no keyless urban parcel-geometry service exists for Portugal.**
The urban cadastre is famously unexecuted (SiNErGIC/CGPR built out per-município; BUPi targets
rústico). This matches and sharpens the E5 sweep + `region-iberia-france.md` PORTUGAL block ("the
national cadastre is empty exactly where the cities are"). The honest deferral pattern applies:
refuse to imply cadastral truth, say why, never fabricate.

## 4. What was fixed (this lane, server-side, tested)

`server/jurisdiction/euCadastreProxy.js`:

- The `pt` source config now declares a cited **`coverageNote`** (per-município incompleteness,
  Lisboa/Porto = 0 measured 2026-09-03, "empty usually means no cadastre published here", BUPi
  non-applicability).
- `resolveEuParcelOutcome` decorates **every `empty`** from a note-declaring source with that note
  (only `empty` — `ok`/`unreachable`/`out-of-area` never carry it). Inner resolution untouched.
- The Express handler forwards `coverageNote` in the JSON and sets
  `X-Cadastre-Outcome: empty` + `X-Cadastre-Coverage: declared-incomplete`.

Tests: `server/__tests__/euCadastreProxy.test.ts` §PT-PARCEL-ACCURACY — 5 new pins (note on PT
empty with the exact denial wording; absent on PT ok; absent on PT unreachable; absent on FR
empty; PT is the ONLY note-declaring leg today). Suite: **52/52 green**.

This is additive and back-compatible (`{parcel, outcome}` unchanged; the note is a new optional
field), so the honest state is visible at the API surface immediately and consumable by any
client without a redeploy dependency.

## 5. What is OWED (shared UI — described precisely, deliberately not touched)

1. **`apps/editor/src/ui/site/parcel/WfsParcelProvider.ts` discards `outcome` and now
   `coverageNote`** — `parseWfsProxyResponse` reads only `parcel`. Fix: have
   `fetchParcelAtPoint` also read `{outcome, coverageNote}` on a miss and return them through a
   richer miss type (or a side-channel the registry passes down), so the registry knows the most
   specific failed cadastral candidate said "declared-incomplete coverage".
2. **`parcelRegistry.ts` / `footprintPick.ts`**: when the footprint fallback fires AFTER a
   cadastral candidate answered `empty`-with-`coverageNote`, attach the note to the
   `ParcelFeature` (e.g. `coverageNote` field) so provenance survives the commit seam
   (`parcelFeatureToProvenance`).
3. **`parcelCard.ts`**: when a footprint model carries a coverage note, render it under
   `PARCEL_FOOTPRINT_WARNING` — the PT user then reads: footprint banner + *"no official cadastre
   is published for this área (Lisboa/Porto publish none)"*. Keep the note verbatim-from-server
   (one spelling per fact, C84 EI-9).
4. **`SiteBoundaryMap2D.ts` select-mode chip** says *"Click a plot to select its real cadastral
   parcel"* unconditionally — in un-covered PT this over-promises. Cheap fix: neutral wording
   ("select the plot under the click — cadastral where published"); better fix: chip text driven
   by the resolved candidates' coverage state.

## 6. Residuals / notes

- The founder-facing accuracy of the footprint itself is bounded by OSM Lisbon/Porto quality —
  irreducible until Portugal publishes urban parcels or a paid/keyed channel is procured (none
  found keyless; a commercial DGT/municipal arrangement would be a founder decision, not a lane).
- `packages/site-parcel-data/src/parcelProviders/dgtParcelProvider.ts` (the package adapter with
  `PT_COVERAGE_CAVEAT`) is NOT on the live editor path — the editor uses the generic
  `WfsParcelProvider` + proxy. Its caveat text and this lane's `coverageNote` should converge to
  one spelling if the adapter is ever seated (noted, not merged here — different layers own them
  today).
- BUPi RGG as a rural supplement (matriz number ↔ RGG polygon) is a real future channel; it would
  need its own honesty framing (voluntary registrations ≠ cadastre) and is NOT part of the urban
  fix.
