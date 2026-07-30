# NEXT — Finland (`fi`, national, Alueidenkäyttölaki / Rakentamislaki / Ryhti)

> WHERE WE STOPPED + how to resume. README = what is true now; this = where we stopped.
> Last updated: 2026-07-24 · Maintainer: UNASSIGNED · Status: research complete; no live probe executed; no rule pack; no code.

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

**Phase 0 partially complete (2026-07-24).** The Ryhti plan OGC API is confirmed live and public at
`https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1` — no login required. Four
collections are enumerated, all carrying `_ix_` (index) suffixes in their schema naming, which is a
concrete signal (mirroring Hamburg's B-Plan index) that these may be plan-boundary/directory collections
rather than attribute-rich kaavatietomalli feature collections. A separate `ryhti_building` sub-service
is confirmed live **nationally** — the `open_address` collection returned a Helsinki (municipality 091,
June 2026) record — ahead of the plan layer in rollout. The one unresolved question that decides the
entire rate estimate: does `pub_valid_ld_plan_ix_gs` carry kaavayksikkö numeric attributes (FAR,
kerrosluku, use code) in its feature `properties`, or only plan boundary + PDF link? This sits behind a
tooling gap (binary GeoJSON payload) — not an access restriction — and requires a single HTTP GET in any
GeoJSON-capable environment to resolve.

---

## 2 — THE NUMBER

**Phase 0 partial — endpoint confirmed, item schema unresolved.**

| Scenario | Rate | Basis |
|---|---|---|
| `_ix_` collections = index + kaavatietomalli numeric attributes | **~55–65%** (Ryhti live regions) | Original estimate; holds if FAR/kerrosluku are in `properties` |
| `_ix_` collections = index-only (boundary + PDF link) | **~30–40%** (Ryhti live regions) | Revised if Hamburg B-Plan pattern confirmed |
| Non-Ryhti regions (all other) | **~30–35%** | Unchanged; plan in PDF/municipal WebGIS |

**Confirmed live today regardless of `_ix_` outcome:**
- Ryhti plan OGC API: live, public, no auth (`pub_valid_ld_plan_ix_gs`, `pub_valid_lm_plan_ix_gs`)
- ryhti_building `open_address`: live **nationally** (Helsinki 091, June 2026 timestamp verified)

The `_ix_` schema result is the single measurement that pins the number.

---

## 3 — BLOCKERS (each: what · why it blocks · what would unblock it · exact resume step)

### 3.1 — `_ix_` item-level schema unconfirmed (BLOCKER — tooling gap, not access gate) ⚠️ CRITICAL

- **What it is.** The Ryhti plan OGC API is confirmed live at
  `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1`. Four collections enumerated,
  all `_ix_`-suffixed. Item-level GeoJSON was requested but returned as binary payload that the probe tool
  cannot decode as text. This is a **tooling gap**, not a server-side access restriction — the API is
  serving `application/geo+json` successfully.
- **Why it blocks.** The `_ix_` schema question decides whether the Tier-1 rate is ~55–65% (attributes
  present) or ~30–40% (index-only, Hamburg pattern). This is the rate-defining unknown for all of Finland.
- **What would unblock it.** Any environment that can parse `application/geo+json` text — curl, Python
  requests, Node.js fetch, browser DevTools. The API requires no auth.
- **THE EXACT RESUME STEP.**
  ```
  curl -s "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections/pub_valid_ld_plan_ix_gs/items?limit=1" \
    -H "Accept: application/geo+json" | python3 -m json.tool | grep -A 50 '"properties"'
  ```
  Inspect the `properties` object: if it contains `tehokkuusluku`, `kerrosluku`, or `kayttotarkoitus`
  fields → `_ix_` = attributes present → rate is ~55–65%. If it contains only `planId`, `geometry`, and
  a PDF URL field → `_ix_` = index-only → rate is ~30–40%.
  Write result to `findings/RYHTI-PHASE0-PROBE.md` and update §2 of this file.

### 3.2 — Maanmittauslaitos cadastre — no live API key obtained

- **What it is.** The OGC API Features endpoint URL is confirmed from NLS documentation. No actual API key
  has been obtained (self-service via NLS "My Account" email registration — no contract required).
- **Why it blocks.** Cannot confirm parcel geometry delivery, attribute schema, or CRS.
- **What would unblock it.** Register at `https://www.maanmittauslaitos.fi/asioi/avoin-data` or the NLS
  "My Account" service; request API key for the kiinteisto-avoin tier.
- **THE EXACT RESUME STEP.** Register for the NLS open API key. Then:
  `GET https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/collections`
  with the key in the Authorization header. Record field names and CRS.

### 3.3 — KMTK 3D building vector — field names and fill rate unconfirmed

- **What it is.** The KMTK Building feature class is confirmed to carry storey count (kerroslukumäärä) and
  intended use, derived from national LiDAR. The exact OGC API or WFS endpoint URL, attribute name, and
  per-building population rate have not been probed.
- **Why it blocks.** Cannot confirm the building-height sourcing path for the context-data layer.
- **THE EXACT RESUME STEP.** Fetch the Maastotietokanta download or WFS endpoint from
  `https://www.maanmittauslaitos.fi/kartat-ja-paikkatieto/asiantuntevalle-kayttajalle/tuotekuvaukset/maastotietokanta`.
  Run GetCapabilities + DescribeFeatureType on the Buildings layer; fetch a sample of ~5 buildings in Helsinki
  and inspect the height/storey field.

### 3.4 — Museovirasto heritage WFS/WMS — not live-probed

- **What it is.** The Museovirasto open WFS/WMS service URL and layer names have not been fetched via
  GetCapabilities.
- **Why it blocks.** Cannot confirm whether the heritage overlay is accessible globally (vs. geo-blocked),
  what the exact layer names are, and whether the non-exhaustion caveat (LVV + municipal plan-overlay channel)
  is correctly handled.
- **THE EXACT RESUME STEP.** Fetch:
  `GET https://kartta.nba.fi/arcgis/services/...?service=WFS&version=2.0.0&request=GetCapabilities`
  (or the equivalent Museovirasto OGC endpoint — confirm URL from `https://www.museovirasto.fi/fi/palvelut-ja-ohjeet/tietojarjestelmat/kulttuuriympariston-paikkatietoaineistot`).
  Record layer names, CRS, and licence terms.

### 3.5 — Helsinki / Uusimaa VOOKA migration date unconfirmed

- **What it is.** The VOOKA project schedule for the Uusimaa region (which includes Helsinki, Espoo, Vantaa,
  Kauniainen) has not been confirmed in this pass.
- **Why it blocks.** Cannot determine whether the capital region is Tier 1 (live) or Tier 2 (near-term
  pending).
- **THE EXACT RESUME STEP.** Check the VOOKA project page at the Ministry of Environment / Ryhti programme
  site. Look for a regional rollout schedule or progress tracker. Record the Uusimaa migration date.

### 3.6 — Åland status unconfirmed

- **What it is.** Åland is an autonomous Swedish-speaking province with its own separate land registry and
  building permitting administration by statute. Its cadastral/planning system is separate from mainland NLS
  and Ryhti.
- **Why it blocks.** Cannot include Åland in Finland coverage claims without separate confirmation.
- **What would unblock it.** Check Åland's regional government open data / GIS portal independently.
- **THE EXACT RESUME STEP.** Check `https://www.regeringen.ax/` or Åland Statistics / geodata portal.
  Record whether a separate cadastre API exists and whether Åland's planning plans are in a separate digital
  system.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If you have a GeoJSON-capable tool available (curl, Python, Node.js, browser):**
  run Blocker 3.1 immediately — `GET .../pub_valid_ld_plan_ix_gs/items?limit=1` and read the `properties`
  object. This is a 30-second probe that resolves the entire rate estimate. The API is open, no auth.
- **4.2 — If you are probing any Nordic jurisdiction's national digital plan API:** apply the same
  "participation vs. land-area fill" discipline that is the core lesson from Sweden's NGP research. Finnish
  VOOKA migration ≠ full land-area coverage of that region's older plans.
- **4.3 — If you add storey count or LoD2 building height as a field to the L0 zoning schema:**
  Finland's KMTK Building feature class is a candidate national source — check attribute names confirmed in
  Blocker 3.3 before wiring.
- **4.4 — If another jurisdiction's heritage WFS returns structured caveat metadata** (i.e. "this result is
  not exhaustive — also check X and Y channels"): Finland's Museovirasto two-channel caveat (LVV +
  municipality) is the most precisely-scoped such caveat in the research series; use it as the design
  reference for the caveat-display pattern.
- **4.5 — If the VOOKA project publishes a completed national rollout schedule with all region migration
  dates:** this resolves the bimodal rate into a time-series — update §2 and the RATE.md §3 ceiling
  analysis immediately.
- **4.6 — If you find a country whose national zoning data layer is ISO 19109/19103/19107-based:** compare
  its schema to the kaavatietomalli to check for interoperability. Finland's kaavatietomalli is the only
  ISO-grounded national zoning schema confirmed in this research series.
- **4.7 — If Åland's system is confirmed as a separate OGC API:** create `fi/fi-ax/` folder following the
  same structure as mainland `fi/fi-es/` (South Savo), and note the separate legal status.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- The legal-structural study (this README + `findings/FINLAND-MASTER-DATA-SOURCE-STUDY.md`) — do not
  re-research the Alueidenkäyttölaki/Rakentamislaki hierarchy, kaavatietomalli schema basis, Ryhti
  programme, VOOKA mandate, or Maanmittauslaitos open-data model.
- **Ryhti plan API confirmed live** (2026-07-24): endpoint `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1`,
  four `_ix_` collections enumerated, no auth required. Do not re-probe the landing page or collections list.
- **ryhti_building `open_address` confirmed live nationally** (2026-07-24): Helsinki 091 record verified.
  Do not re-probe basic endpoint availability.
- **`_ix_` bbox trap documented** — all four collections declare bbox covering all Finland; this is
  GeoServer CRS-extent metadata default, NOT data coverage. Do not re-investigate this observation.
- The bimodal rate framing — split is TIMING (VOOKA migration) + `_ix_` SCHEMA QUESTION (see Blocker 3.1).
- The Museovirasto heritage non-exhaustion caveat (two named channels: LVV + municipality/region) — keep named.
- The ryhti_plan / ryhti_building separation — these are two independent sub-services on different rollout
  timelines. Do not conflate them under one "Ryhti" umbrella.

---

## 6 — VERIFIED SOURCES (endpoint · answers · tier · exact query)

| Source | Answers | Tier | Note |
|---|---|---|---|
| `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1` | Ryhti plan OGC API — 4 `_ix_` collections: `pub_valid_ld_plan_ix_gs`, `pub_valid_lm_plan_ix_gs`, `pub_prep_ld_plan_ix_gs`, `pub_prep_lm_plan_ix_gs` | ✅ VERIFIED-LIVE 2026-07-24 | Open; no auth; item-level schema unconfirmed (binary payload) |
| `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_building/ogc/features/v1/collections/open_address/items` | Building address data — NATIONWIDE (Helsinki 091, June 2026 confirmed) | ✅ VERIFIED-LIVE 2026-07-24 | Open; no auth; nationwide coverage confirmed |
| `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/` | Parcel geometry, cadastral unit IDs, usage-right units | DOCUMENT — not live-probed | CC BY 4.0; self-service API key |
| `https://www.maanmittauslaitos.fi` (Maastotietokanta) | KMTK national topographic DB including 3D Buildings + storey count | DOCUMENT — not live-probed | Open data; LiDAR-derived |
| `https://www.museovirasto.fi` / Museovirasto WFS | Heritage: ancient monuments, RKY, Building Heritage Register, World Heritage | DOCUMENT — not live-probed | Open WFS/WMS; explicitly non-exhaustive (two other channels required) |
| `https://www.ymparisto.fi` / Alueidenkäyttölaki + Rakentamislaki (2025) | National planning + building law | DOCUMENT — statutory text | Effective 1.1.2025; replacing MRL |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **RHR (rakennus- ja huoneistorekisteri) open access:** confirmed GDPR-restricted; third-party access requires DVV permission. Do not attempt to use RHR as a primary data source without a DVV access agreement. Building massing is available via KMTK instead.
- **Åland under mainland systems:** Åland is confirmed to have a separate land registry and building permitting administration by statute. Do not assume NLS or Ryhti endpoints cover Åland without separate confirmation.
- **Ryhti plan collection `bbox` as data-coverage proxy:** all four `_ix_` collections declare a bbox covering all of Finland (15.05–33.99°E, 58.6–70.26°N). This is a **GeoServer CRS-extent metadata default**, not data coverage. Do not infer national plan coverage from this field. Actual content is South/North Savo only per Ryhti documentation.
- **Binary payload from Ryhti item endpoint:** fetching `pub_valid_ld_plan_ix_gs/items?limit=1` with any format parameter (GeoJSON, CSV, HTML, WFS DescribeFeatureType XML) returns `[binary data]` in the probe tool. This is a tool rendering limitation — the server IS serving `application/geo+json`. Do not retry with the same probe tool; use curl/Python/Node instead.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the single curl command in Blocker 3.1** — read the `properties` of one `pub_valid_ld_plan_ix_gs` item.

Cost: ~5 minutes. The API is confirmed live, open, and no auth. The command:
```bash
curl -s "https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1/collections/pub_valid_ld_plan_ix_gs/items?limit=1" \
  -H "Accept: application/geo+json" | python3 -m json.tool | grep -A 50 '"properties"'
```
Two outcomes:
- Properties contain `tehokkuusluku`/`kerrosluku`/`kayttotarkoitus` → **rate is ~55–65%**, Phase 1 can start immediately.
- Properties contain only plan ID + geometry + PDF link → **rate is ~30–40%**, Phase 4 PDF-extraction pipeline is the next lever.

This is the highest-value measurement remaining in the entire Finland research programme. Everything else is secondary to this.

---

## 9 — C63 PHASE-3 MAP (which blocker feeds which axis phase — 2026-07-30)

> The [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) Phase-3 roadmap re-frames the probes
> above into three C63 seven-axis phases keyed to the RATIFIED weights (LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS 10 · TERRAIN 10 · CONTEXT 5). **Honesty gate:** each stays
> `CONVERGENT-SECONDARY` until live-probed; no RATE cell moves on an unprobed claim. Ship the probe before
> the fix.

- **Phase A (LEGISLATION + ENVELOPE + DATA-SOURCES zone-GIS slot) — the second-Denmark move, biggest gain.**
  Feeds off **Blocker 3.1** (`_ix_` schema — the single rate-defining GET) + **3.5** (Uusimaa VOOKA date).
  If `_ix_` = attributes, Ryhti fills LEGISLATION from a structured API with NO OCR — inverting the Portugal
  ordering where LEGISLATION is the surviving cap.
- **Phase B (PARCEL + DATA-SOURCES cadastre slot).** Feeds off **Blocker 3.2** (`MML_API_KEY` — free,
  self-service; the same key also unblocks Phase-C terrain). Exclude Åland (**3.6**).
- **Phase C (HEIGHTS/LOD + TERRAIN + DATA-SOURCES height slot).** Feeds off **Blocker 3.3** (KMTK 3D building
  field names) + the Phase-B MML key (terrain bake is key-gated → `terrain.verify.mjs` moves rung 50→100).
  nDSM module is SHARED with ES/FR — do NOT one-off. RHR is a DEAD END (GDPR; use KMTK).
