# NEXT — Brussels-Capital Region (`bru-brussels`)

> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

## 1 — WHERE WE STOPPED

Research is complete. The Brussels instrument-priority chain is characterised (PPAS/RRUZ/PAD >
RRU Titre I), the PRAS is confirmed as a real, populated layer, and RRU Titre I's context-relative
formula structure (H = P + 3.00 + D) is understood. The primary blocker is that direct automated
access to the Brussels PRAS GeoServer is bot-blocked, making it impossible to confirm the current
layer schema, attribute names, or licence terms. No GetFeature has been run for any Brussels parcel.

## 2 — THE NUMBER

**0% of clicks return a full, cited envelope (not started).** Research estimate for Brussels: ~5–10%.

## 3 — BLOCKERS

### 3.1 — Brussels PRAS WFS bot-blocked (the top blocker)
- **What it is.** `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` blocks automated access via bot detection. Layer catalogue confirmed via third-party aggregator cache.
- **Why it blocks.** Cannot confirm current attribute schema, licence terms, or live HTTP status. All Brussels pack work is gated on this.
- **What would unblock it.** Deploy from a Belgian-IP server (VPS, Fly.io Brussels/AMS region). Or check `geo.be` federal portal for a mirror of the PRAS layer.
- **THE EXACT RESUME STEP.** From a Belgian-IP: `curl -A "Mozilla/5.0" "https://gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows?REQUEST=GetCapabilities&SERVICE=WFS"` → check HTTP status and capture `<FeatureType>` / `<Attribute>` elements.

### 3.2 — RRU Titre I canonical text not read
- **What it is.** The formula H = P + 3.00 + D is research-confirmed from secondary sources; the full canonical Article 4–6 text has not been independently read.
- **Why it blocks.** Cannot author a rule KIND without reading the exact Article text, including conditions, exceptions, calculation method for P and D, and reference-datum definition.
- **THE EXACT RESUME STEP.** Fetch RRU Titre I from `urban.brussels` — search for "Règlement Régional d'Urbanisme Titre I" PDF or consolidated text; read Art. 4 (Hauteur), Art. 5 (Implantation), Art. 6 (Profondeur de bâti).

### 3.3 — Street-width (P) source unconfirmed
- **What it is.** The RRU Titre I formula requires the rue width (P) as an input. UrbIS may carry a queryable `largeur_rue` attribute; geometric derivation from UrbIS road polygons is the fallback.
- **THE EXACT RESUME STEP.** `curl "https://geoservices-urbis.irisnet.be/geoserver/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities"` → find road layer; then GetFeature one road segment and inspect attribute list for width-related field.

## 4 — TRIP-WIRES

- **4.1 — If a Belgian-IP server is set up for any purpose** → immediately run the PRAS/RRU GetCapabilities probe (§3.1). Unblocks all Brussels pack work.
- **4.2 — If a context-relative height formula KIND is built for any other jurisdiction** (e.g. Porto's moda-da-cércea) → assess whether it can encode Brussels' H = P + 3.00 + D with different inputs.
- **4.3 — If CBS+ is confirmed as enacted law in the Brussels RRU reform** → add it as a mandatory pre-check step in the Brussels pack schema for any demolition/rebuild card.

## 5 — WHAT IS ALREADY BUILT (do not redo)
- Brussels instrument-priority chain documented — `README.md §1`
- PRAS layer existence confirmed via cache — `sources/SOURCES.md`
- RRU Titre I formula structure confirmed from secondary sources

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` | Brussels PRAS zoning + RRU-adjacent layers | `corroborated` — bot-blocked origin; confirmed via wfs.michelstuyts.be cache | Belgian-IP required for live access |
| CoBAT + RRU Titre I (arrêté 3 June 1999 / re-adopted 21 November 2006) | Brussels planning code; RRU scope and gabarit provisions | `published` | `urban.brussels` / Brussels Moniteur belge |
| Conseil d'État ruling on Brussels high-rise RRU derogation | Derogation standard (bon-aménagement-des-lieux) confirmed for tower projects | `corroborated` — ruling existence confirmed; full text not read | `raadvst-consetat.be` |

## 7 — DEAD ENDS
- **Brussels PRAS via direct automated HTTP from non-Belgian IP:** confirmed bot-blocked in this pass. Do not retry the same endpoint from the same IP/tooling.

## 8 — THE SMALLEST NEXT STEP

**Resolve bot-detection block: deploy from Belgian-IP. Estimated: 0.5 dev-days.**

Once live: `curl "https://gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows?REQUEST=GetCapabilities&SERVICE=WFS"` — inspect `<FeatureType>` for `Affectations`; then run a GetFeature for a known Brussels parcel bbox and inspect the full attribute set.
