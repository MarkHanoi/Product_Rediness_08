# Belgium (`be`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

**Status: OPEN — partially live-probed (3 of 5 key endpoints VERIFIED LIVE 2026-07-24), but no
numeric rule value has been verified. This file will be completed once live GetFeature probes are
run and the first plan-feature attributes are read against primary sources.**

---

## What was checked, against which document version

| Field | Verified against (doc + version/date) | Method (viewer / PDF read / endpoint response) | Verdict |
|---|---|---|---|
| Federal cadastre WFS (CADMAP) — endpoint live and accessible | GetCapabilities response — 2026-07-24 | HTTP probe — HTTP 200, application/xml | ✅ **VERIFIED LIVE** |
| Federal cadastre licence (CC-equivalent open, no key) | GetCapabilities `<AccessConstraints>` and `<Fees>` fields — 2026-07-24 | HTTP probe response | ✅ confirmed |
| Wallonia plan de secteur WMS — endpoint live | GetCapabilities response — 2026-07-24 | HTTP probe — HTTP 200, full WMS_Capabilities XML | ✅ **VERIFIED LIVE** |
| Wallonia WMS access constraints ("Accès libre et gratuit") | GetCapabilities `<AccessConstraints>` field — 2026-07-24 | HTTP probe response | ✅ confirmed |
| Wallonia OGC API Features — endpoint live | OpenAPI JSON response — 2026-07-24 | HTTP probe — HTTP 200, OpenAPI JSON | ✅ **VERIFIED LIVE** |
| Wallonia plan de secteur legal coverage (100% of Wallonia, 1977–1987) | CoDT Art. D.I.1 + WMS capabilities bounding box | Primary text + endpoint response | ✅ confirmed (stated) |
| Flanders heritage WFS (Onroerend Erfgoed) — endpoint live | GetCapabilities response — 2026-07-24 | HTTP probe — HTTP 200, application/xml | ✅ **VERIFIED LIVE** |
| Flanders heritage layer list (bes_monument, bes_sd_gezicht, etc.) | GetCapabilities `<FeatureType>` list — 2026-07-24 | HTTP probe response | ✅ confirmed |
| Brussels PRAS layer existence (PERSPECTIVE_FR:Affectations) | Third-party WFS aggregator cache (wfs.michelstuyts.be) | Secondary corroboration | ⚠ `corroborated` — not independently fetched from origin; direct fetch bot-blocked |
| Flanders DSI/GRB layer existence and "kosteloos" licence | Search-engine cache of live GetCapabilities response | Secondary corroboration | ⚠ `corroborated` — not independently fetched; direct fetch robots-disallowed |
| VCRO Art. 4.3.1 (goede ruimtelijke ordening) | VCRO current consolidated text | Primary text read | ✅ confirmed |
| VCRO Art. 7.4.2/2 "clichering" nullification | VCRO current consolidated text | Primary text read | ✅ confirmed |
| CoDT Art. D.IV.13 (bon aménagement des lieux) | CoDT current consolidated text (reformed May 2025) | Primary text read | ✅ confirmed |
| CoBAT + RRU Titre I existence and scope | CoBAT arrêté 9 April 2004; RRU arrêté 3 June 1999 / re-adopted 21 November 2006 | Primary text read | ✅ confirmed (stated — full text of Titre I formulas not independently verified in this pass) |
| Devolution special laws (8 August 1980; 12 January 1989) | Belgian Moniteur belge references | Primary text citation | ✅ confirmed |
| Flanders DHMV II full-coverage status | DHMV product documentation + DHMV I gap list (13 centrumsteden) | Primary source read | ✅ confirmed (stated) |

---

## What I could NOT confirm (and why it stays unshippable)

- **Federal CADMAP building sublayer — height/storey attribute:** building sublayer confirmed in capabilities; GetFeature not run; attribute schema unknown.
- **Brussels PRAS live HTTP status and licence terms:** origin server bot-blocks direct access; cached confirmation only. Cannot ship any Brussels pack as `structured` confidence until live access confirmed.
- **Flanders DSI/GRB live HTTP status and layer attribute schema:** robots.txt restriction in this pass; cached confirmation only.
- **Whether any Belgian plan feature carries a numeric height/FAR attribute:** GetCapabilities/capabilities confirms layers exist and contain plan-element features; GetFeature has not been run for any specific Belgian parcel. This is the single most critical unverified question before any Belgian pack can be scoped.
- **Brussels RRU Titre I height formulas — exact text:** the context-relative formula pattern (H = P + 3.00 + D, etc.) is research-confirmed from secondary sources; the full canonical Art. 4–6 text has not been independently read in this pass.
- **Wallonia / Brussels LiDAR products:** not probed; PICC terrain products and Brussels LiDAR programme both unconfirmed as standing deliverables comparable to Flanders' DHMV II.
- **Brussels heritage GIS layer (Direction du Patrimoine culturel):** register confirmed; queryable GIS layer with geographic coordinates not independently confirmed live.

## Caveats that must remain visible in the product

- The Belgian blended data-readiness rate (~10–14%) is a research estimate derived from secondary sources and GetCapabilities metadata — **not a measurement from live GetFeature probes**. It may change substantially once GetFeature calls are run.
- Any Flemish card sourcing a numeric provision from a post-2009 RUP **must** carry an explicit caveat that the provision may be void under VCRO Art. 7.4.2/2 ("clichering") if it is percentage-based.
- Any Belgian card sourcing a numeric height/FAR/setback value **must** carry an explicit caveat that the value is legally subordinate to a mandatory discretionary compatibility test (*goede ruimtelijke ordening* / *bon aménagement des lieux*) which can modify or override any stated numeric rule.
- Brussels RRU Titre I height formulas are context-relative (H = P + 3.00 + D) — they depend on the height of adjacent buildings and cannot be reduced to a single lookup value without additional geometric context.
- The Brussels PRAS layer is `corroborated`, not `verified` — the third-party aggregator cache may not reflect current layer names or attributes.

**Sign-off:** NOT SIGNED — awaiting live GetFeature probe results, Brussels bot-detection resolution, and first plan-feature primary source read for at least one parcel in each region.
