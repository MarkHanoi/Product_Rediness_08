# Helsinki (`091`) — Jurisdiction Pack

**Country:** `fi` · **Region (maakunta):** Uusimaa (`fi-01`, ISO FI-18) · **Kuntanumero:** `091` ·
**Governing instrument:** asemakaava (detailed local plan, MRL/RakL) + yleiskaava ·
**Last updated:** 2026-07-30 · **Maintainer:** UNASSIGNED

---

## Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Zoning identification** | RESEARCH — Ryhti kaavatietomalli OGC API confirmed live+public; item schema unconfirmed | Item-level property schema confirmed → structured use/density/height |
| **Parcel provider** | NOT WIRED — falls to OSM footprint fallback | `isInFinland` predicate + MML Kiinteistörekisteri adapter wired |
| **Context data (LOD1)** | BAKED — OSM context 5/9 layers (`bake.mjs` REGIONS `helsinki`) | — (assessed) |
| **Terrain** | CONFIGURED — `terrain.mjs` `helsinki` (source `fi`), key-gated (`MML_API_KEY`) | `terrain.verify.mjs` round-trip + `layer.json` 200 |
| **Building height** | NO WIRED SOURCE — open LoD2 documented candidate | LoD2 source wired in `heightSources.mjs` |
| **Rule pack** | NOT STARTED | asemakaava provision decoding + a sourced pack |

**Overall status: NOT STARTED (bake-covered; legislation research at the national level only).**

---

## The Finnish mechanism (national context)

Finland's binding local instrument is the municipal **asemakaava**. The national **Ryhti** programme
publishes a machine-readable plan data model (`kaavatietomalli`) via an OGC API — **confirmed live and public**
at `https://paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1` (four `_ix_` collections; the
`ryhti_building` sub-service is live NATIONWIDE, Helsinki address record verified 2026-07-24). This makes
Finland structurally the strongest Nordic legislation feed AFTER Denmark — but the item-level property schema
for the plan collections is unconfirmed (a tooling gap, not an access gate), so the national rate is a band
(`~55–65 %` Ryhti-live est. / `~30–35 %` non-Ryhti — see [`../../RATE.md`](../../RATE.md)).

Helsinki additionally runs one of Europe's most open municipal GIS estates (Helsinki Region Infoshare,
`kartta.hel.fi`) including an open **LoD2** city model — the reason `heightSources.mjs` flags Helsinki as a
"candidate to add" rather than a hard block.

---

## Source hierarchy

| Data needed | Source | Confidence |
|---|---|---|
| Parcel geometry | MML Kiinteistörekisteri / Helsinki kiinteistökartta | `documented` — NOT wired |
| Zone code + provisions | Ryhti `kaavatietomalli` OGC API | `documented` — live+public, item schema TBD, not wired |
| Building height | Helsinki open LoD2 CityGML | `documented` — candidate, not wired (`heightSources.mjs` `no-source`) |
| Terrain DEM | MML WCS (`terrain.mjs` source `fi`) | `documented` — free key (`MML_API_KEY`) |
| Context buildings/roads/… | OSM (`bake.mjs` REGIONS `helsinki`) | `live` (baked) |

---

**Related files:** `../../README.md` (country umbrella) · `../../RATE.md` (national legislation rate) ·
`RATE.md` (composite scorecard) · `LEGISLATION-RATE.md` · `NEXT.md` · `sources/SOURCES.md`
