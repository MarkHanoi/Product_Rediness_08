# NEXT — Finland (`fi`, national, Alueidenkäyttölaki / Rakentamislaki / Ryhti)

> WHERE WE STOPPED + how to resume. README = what is true now; this = where we stopped.
> Last updated: 2026-07-24 · Maintainer: UNASSIGNED · Status: research complete; no live probe executed; no rule pack; no code.

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Finland has been fully characterised at the legal/structural level — Alueidenkäyttölaki + Rakentamislaki
(both 1.1.2025), kaavatietomalli (ISO-based national zoning data model), Ryhti programme, VOOKA national
rollout project, Maanmittauslaitos cadastre, KMTK national 3D building vectors, national LiDAR, Museovirasto
heritage — and is structurally the strongest jurisdiction studied after Denmark. No API endpoints have been
live-probed, no sample parcels queried, and no code has been written. The entire readiness estimate is
documentation-level from published primary sources. The two highest-value unknowns are: (1) does the live
Ryhti OGC API for South/North Savo actually return structured FAR/height values at the parcel level, and
(2) when is the Helsinki/Uusimaa region migrated into Ryhti — which determines whether the capital is Tier 1
or Tier 2.

---

## 2 — THE NUMBER

**❔ UNVERIFIED — no live probe has been executed.**

Structural estimate (documentation-level):
- **~55–65%** for confirmed Ryhti live regions (South Savo, North Savo)
- **~30–35%** for non-Ryhti regions

The bimodal split is driven entirely by VOOKA migration status — not by legal-mechanism variation. The
mechanism is identical everywhere; the data delivery is bimodal. A direct OGC API probe against the Ryhti
endpoint for South or North Savo is the single measurement that converts the Tier-1 estimate from
documentation to a measured number.

---

## 3 — BLOCKERS (each: what · why it blocks · what would unblock it · exact resume step)

### 3.1 — Ryhti OGC API not live-probed

- **What it is.** The national Ryhti built-environment API for South Savo and North Savo is confirmed live
  from Ministry of Environment documentation. The exact OGC API Features / STAC endpoint URL, auth model,
  and schema field names have not been fetched.
- **Why it blocks.** Cannot confirm: (a) the exact parcel-level query path, (b) whether FAR/kerrosluku are
  structured attributes in the kaavatietomalli API response, (c) whether kaavayksikkö objects are present or
  absent for the sampled plans.
- **What would unblock it.** A live HTTP call to the Ryhti API. No geo-block is known (unlike Sweden's NGP);
  access appears to be free and open. The Ministry of Environment Ryhti map service page is the starting point
  for the endpoint URL.
- **THE EXACT RESUME STEP.**
  1. Fetch the Ryhti API documentation / map service landing page at `https://www.ymparisto.fi/ryhti` or
     `https://ryhti.ymparisto.fi/`.
  2. Run `GET .../collections` (OGC API Features) or STAC root; record available collections.
  3. Fetch one asemakaava feature from South Savo; inspect `properties` for tehokkuusluku, kerrosluku,
     kayttotarkoitus.
  4. Write result to `findings/` and update §2 of this file.

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

- **4.1 — If you find the Ryhti OGC API endpoint working anywhere in the codebase or research:**
  run Blocker 3.1 immediately for South Savo. The live numeric field response converts the entire estimate
  from documentation to measurement.
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
- The bimodal rate framing — Finland's split is TIMING (VOOKA migration), not LEGAL-MECHANISM. Do not
  re-derive this from first principles; it is already the correct characterisation.
- The Museovirasto heritage non-exhaustion caveat structure (two named channels: LVV + municipality/region)
  — do not simplify to "heritage overlay is incomplete"; the specific channels must remain named.
- The first-city sequencing recommendation (South/North Savo → Helsinki/Uusimaa → Tampere/Turku) with
  rationale (confirmed-live vs. capital-city-intuition).

---

## 6 — VERIFIED SOURCES (endpoint · answers · tier · exact query)

| Source | Answers | Tier | Note |
|---|---|---|---|
| `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/` | Parcel geometry, cadastral unit IDs, usage-right units | DOCUMENT — not live-probed | CC BY 4.0; self-service API key |
| `https://www.ymparisto.fi/ryhti` (or `ryhti.ymparisto.fi`) | Ryhti programme + kaavatietomalli OGC API for South/North Savo | DOCUMENT — live Ryhti regions confirmed; API endpoint URL not fetched | Free, open; no geo-block known |
| `https://www.maanmittauslaitos.fi` (Maastotietokanta) | KMTK national topographic DB including 3D Buildings + storey count | DOCUMENT — not live-probed | Open data; LiDAR-derived |
| `https://www.museovirasto.fi` / Museovirasto WFS | Heritage: ancient monuments, RKY, Building Heritage Register, World Heritage | DOCUMENT — not live-probed | Open WFS/WMS; explicitly non-exhaustive (two other channels required) |
| `https://www.ymparisto.fi` / Alueidenkäyttölaki + Rakentamislaki (2025) | National planning + building law | DOCUMENT — statutory text | Effective 1.1.2025; replacing MRL |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **RHR (rakennus- ja huoneistorekisteri) open access:** confirmed GDPR-restricted; third-party access requires DVV permission. Do not attempt to use RHR as a primary data source without a DVV access agreement. Building massing is available via KMTK instead.
- **Åland under mainland systems:** Åland is confirmed to have a separate land registry and building permitting administration by statute. Do not assume NLS or Ryhti endpoints cover Åland without separate confirmation.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Fetch the Ryhti OGC API landing page and run GetCapabilities / collections for South Savo** (Blocker 3.1).

Cost: ~30–60 minutes. The Ministry of Environment Ryhti programme page (`ymparisto.fi/ryhti`) is the
starting point. The API is documented as free and open with no geo-block (unlike Sweden's NGP). Once a
single asemakaava feature response for South Savo is in hand, inspect `properties` for tehokkuusluku
and kerrosluku — those two attribute names, confirmed live, convert the Tier-1 estimate from
documentation-level to a measured number. That is the highest-value measurement available.
