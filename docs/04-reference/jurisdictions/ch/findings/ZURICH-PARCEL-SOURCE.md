# Zürich (Switzerland) — cadastral PARCEL source (deciding probe + wiring)

**Dated:** 2026-07-26 · **Probe origin:** non-DACH (US-region) egress · **Status:** WIRED.
**Issue:** the city matrix marked the Zürich PARCEL cell ⚠️ *unverified* — we were unsure the plot
boundary PRYZM selects for a Zürich site is the real Amtliche Vermessung (AV) cadastral parcel, the
way Barcelona uses Catastro and Denmark uses the Matrikel.

---

## 0 — VERDICT (read this first)

**A free, keyless, licence-clean, all-canton parcel source EXISTS and is now wired.** A Zürich map
click resolves the **real AV *Grundstück*** under the cursor — carrying its **federal EGRID**, its
**local parcel number**, and the **canton** — from the federal geo.admin.ch REST `identify` service.
No account, no API key, no VPN.

This **corrects** the prior parcel-coverage verdict (`PARCEL-SELECT-COVERAGE.md`, 2026-07-24), which
read *"no free Liegenschaft layer → FOOTPRINT"*. That probe hit the **wrong system**
(MEMORY §probe-can-be-wrong-three-ways): it tested `geodienste.ch/db/av_0/deu`, a *different host*
whose free WFS serves only land-cover / single-object layers. The **federal `api3.geo.admin.ch`
identify** service serves the parcels — and it was never probed until now.

Before this fix, CH was a `footprint-fallback`: a Zürich click resolved the **OSM building
footprint** (the building outline, honestly labelled — not the land boundary). That was honest, but
it was not the parcel.

---

## 1 — THE DECIDING PROBE (verbatim, live 2026-07-26)

**Endpoint:** `https://api3.geo.admin.ch/rest/services/all/MapServer/identify`
**Layer:** `ch.kantone.cadastralwebmap-farbe` (attribution field: `"CS + canton"`, i.e. Cadastre
Suisse + the canton; attribution URL `https://www.cadastre.ch/en`).

Point = Zürich (lon 8.5417, lat 47.3769), `sr=4326`, `tolerance=0`, `returnGeometry=true`:

```json
{ "results": [ {
  "layerBodId": "ch.kantone.cadastralwebmap-farbe",
  "attributes": {
    "ak": "ZH", "number": "AA8048", "identnd": "ZH0200000261",
    "egris_egrid": "CH119192997709", "realestate_type": null, "label": "ZH"
  },
  "geometry": { "rings": [ [ [8.541118,47.377346], [8.541158,47.377414], ... ] ],
                "spatialReference": { "wkid": 4326 } }
} ] }
```

- `egris_egrid` = **`CH119192997709`** — the *eidgenössischer Grundstücksidentifikator* (EGRID), the
  official pan-Swiss federal parcel id. This is the AV parcel's stable identity — the Swiss analogue
  of Spain's *referencia catastral*.
- `number` = `AA8048` — the local (communal) parcel number; `ak` = `ZH` — the canton.
- `geometry.rings` — the real 93-vertex parcel polygon, WGS84, **[lon,lat]** (Esri x,y order).
- `tolerance=0` returns **exactly one** parcel — the one containing the point. A small tolerance
  robustly resolves a click that lands just off a boundary.

**All-canton ENDPOINT, not ZH-only.** Same call at Geneva (lon 6.1432, lat 46.2044) → `ak: GE`,
`egris_egrid: CH453165896335`, `number: 7340`. The service is the federal aggregation of cantonal
AV, so it *answers* across Switzerland; the wiring is `isInSwitzerland`, not a ZH box.

⚠️ **But the coarse ROUTER doesn't reach Geneva.** Geneva (6.14°E, 46.20°N) sits inside
`FRANCE_BBOX`, and FR precedes CH in the registry order, so a Geneva click resolves via the *French*
cadastre (which returns null for Swiss soil → the client falls to the OSM footprint), not via the
Swiss AV. This is the documented FR/CH coarse-router tradeoff: Geneva is nearly encircled by France,
so a bbox can't separate them — a polygon gate would, but reversing FR/CH order would instead lose
French Alpine border towns inside `SWITZERLAND_BBOX`. **Zürich (8.54°E) is east of France's 8.3°
edge, so it routes to CH correctly** — the task target works. See `PARCEL-SELECT-COVERAGE.md`
§tradeoffs; a polygon gate for the Franco-Swiss frontier is a clean follow-up.

**Reachability:** every probe above succeeded from a **non-DACH egress**, HTTP 200, keyless. (The
prior "geo-blocked" note applied to a *cantonal* WFS host, not to `*.geo.admin.ch`.)

---

## 2 — LICENCE (the gate — verified, not assumed)

geo.admin.ch **FSDI terms of use** (`https://www.geo.admin.ch/en/general-terms-of-use-fsdi`):

- **Free of charge**, and **commercial use is permitted** ("subject to the provisions on fair use").
- **Fair use:** ~**20 requests/minute on a 24/7 average** across the REST services is considered
  fair use; *"automatic parsing of geoservices via bots with high query intensities is to be
  avoided"*; contact `info@geo.admin.ch` before high-volume/high-intensity use.
- **Attribution required:** `© swisstopo` (for cadastral, `© swisstopo + canton` per the layer's own
  attribution) — surfaced via `ParcelFeature.source = 'swisstopo-av'` on the info card.

**Why this stays within fair use.** PRYZM calls the service through a **same-origin server proxy**
(`/api/parcel/ch`) with a **7-day per-parcel cache** (keyed by EGRID) and the standard `apiLimiter`,
and a call happens only on a **deliberate user parcel-select click** — nowhere near a sustained
20 req/min. If PRYZM ever drives this at scale (batch/automated parcel resolution), that crosses into
"high query intensity" and a courtesy note to `info@geo.admin.ch` is the founder-owned next step.

---

## 3 — WHAT WAS WIRED

Mirrors the L-613 `euCadastreProxy` pattern (FR/NL/NO/DE-NRW) — one same-origin call, ring whose
polygon contains the click, `{ parcel: { ring, refcat, areaM2, address, source } }`:

| File | Change |
|---|---|
| `server/euCadastreProxy.js` | New `ch` source: `chUrl()` builds the identify URL; `parseEsriJsonCandidates()` reads Esri `rings` ([lon,lat]); `normalise` → `refcat = EGRID`, `address = "<canton> <number>"`, area derived from the ring. New `format: 'esrijson'` in the dispatch. |
| `packages/site-parcel-data/src/parcelProviders/registry.ts` | CH flipped `footprint-fallback` → **`cadastral`**, `providerId: 'swisstopo-av'`, `proxyPath: '/api/parcel/ch'`, cited note. |
| `packages/site-parcel-data/src/parcelProviders/countryBbox.ts` | CH comment corrected (cadastral, not footprint). |
| `apps/editor/src/ui/site/parcel/parcelRegistry.ts` | Comments: CH removed from footprint-fallback list; `swisstopo-av` added to the provenance-tag list. |
| Tests | `euCadastreProxy.test.ts` (+CH fixture/test, five sources), `parcelRegistry.test.ts` (Zürich+Geneva → cadastral), `parcelProviders.spec.ts` (+CH proxy row). |
| Docs | `PARCEL-SELECT-COVERAGE.md` CH row updated; this findings note. |

No key, no secret, no env var — unlike Denmark's Matrikel, this source needs **nothing** from the
founder to work in production. The server route `/api/parcel/:cc` already dispatches any registered
`cc`, so no `server.js` change was needed.

---

## 4 — HONEST LIMITS

- **Live-verified for ZH + GE.** The endpoint is federal (all cantons), and a miss anywhere falls
  back gracefully to the OSM footprint, so no canton can *break* — but only ZH + GE parcels were
  actually returned+inspected in this probe. Other cantons ride the same service and should be
  spot-checked opportunistically, not assumed field-perfect.
- **Parcel geometry only — not zoning numbers.** This resolves the *plot boundary*. Zürich's
  buildable envelope (BZO → FAR/height) is a separate axis, wired earlier this session
  (`CH_FAR_CERTIFIED`); the AV parcel is the *shape* those rules are applied to, not the rules.
- **`realestate_type` is null** in the sampled features. The layer returns *Grundstücke* (parcels /
  real-estate units); the identify features all carry an EGRID, which is the parcel identity we key
  on. If a future canton returns a non-*Liegenschaft* real-estate type (e.g. *SelbstRecht*), the
  ring is still the plot outline and the EGRID still identifies it.
