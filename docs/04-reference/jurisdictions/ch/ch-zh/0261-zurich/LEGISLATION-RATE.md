# Legislation Data-Readiness Rate — Zürich (`ch`) city (BFS 0261)

**Headline rate: ~25–35% (city building-rule structured dimensional fill — SEMI-STRUCTURED via the BZO catalogue)**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [Ausnützungsziffer /
> Baumassenziffer] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction so the scores are directly comparable. Derived from live endpoint probes
> (`findings/ZURICH-BZO-PROBE.md`, 2026-07-25) + the transcribed BZO 700.100 catalogue, NOT assumed.

<!-- Per-axis DETAIL rate that FEEDS the LEGISLATION axis of the composite RATE.md — NOT the composite
     itself. Naming: `RATE.md` = composite master; `LEGISLATION-RATE.md` = per-axis detail. -->

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| **Zürich (city, BZO catalogue)** | **~25–35%** |
| Switzerland (national, building-rule) | ~20–25% |
| France (national) | ~22% |

**Why Zürich edges ABOVE the CH national ~20–25%:** the City of Zürich is the best-provisioned open GIS in
CH (the Swiss analogue of Barcelona). Its BZO WFS gives a **finer municipal `typ` code** than the national
`ms:grundnutzung` AND a **direct per-parcel `rechtsvorschrift_url`**; and — unlike the national layer — the
per-zone Ausnützungsziffer / Vollgeschosse / Gebäudehöhe numbers HAVE been transcribed into a machine
catalogue (`chZurichBzoCatalogue.ts`) from the BZO 700.100 PDF. That converts the density/height from
"PDF-bound prose" to "curated structured value" for the transcribed zones — the single largest lever that a
national query cannot pull. The rate stays capped in the 25–35 % band (not Barcelona's ~48 %) because the
values are `estimated-ruleset` (transcribed, not a live authoritative feed), the per-parcel **regime**
resolution is only partially populated, and the human sign-off is contradictory (see below).

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ | swisstopo AV / cantonal ZH `maps.zh.ch/wfs/AVZHWFS` `liegenschaften_f` (EPSG:2056, real ring) | high |
| Plan/zone existence + boundary | ✅ | City BZO WFS `bzo_zone_v` (geometry per polygon) | high |
| Zone/use code | ✅ | `bzo_zone_v.typ` (municipal, e.g. `E1`, `W2bIII`, `Oe5`) — finer than national `typ_kommunal_code` | high |
| Density metric (Ausnützungsziffer) | ⚠️ semi | NOT a WFS attribute; transcribed per-`typ` in `chZurichBzoCatalogue.ts` from BZO 700.100 (W2bIII 45 %, Z5 200 %, Z6 230 %, Z7 260 %, …) — `estimated-ruleset` | partial |
| Max height (Gebäudehöhe) | ⚠️ semi | Same catalogue (W2bIII **8.5 m 91/99 vs 9.0 m 2016** — regime-dependent); NOT in the WFS | partial |
| Vollgeschosse | ⚠️ semi | Same catalogue | partial |
| Setback / alignment (Grenzabstand) | ❌ | BZO 700.100 text (e.g. W2bIII Grundgrenzabstand 5 m) — not in a structured field | text-PDF |
| Building footprint + height (LOD1/2) | ✅ capable | swissBUILDINGS3D 2.0/3.0 + swissSURFACE3D nDSM (measured-capable) | high |
| Terrain (DTM/DSM) | ✅ | swissALTI3D | high |
| Heritage overlay (Denkmalschutz) | ⚠️ | swisstopo federal WMS live; cantonal ZH Denkmalschutz WFS not probed | partial |

## The structural gap

The Zürich density/height is **model+PDF-bound keyed by the `typ` code** — the national Outcome-B shape, one
level down (`findings/ZURICH-BZO-PROBE.md` §3). The BZO WFS carries the zone identity + the ordinance URL but
NO numeric AZ/height field, and the `bzo_zone_erhoehte_az_v` layer where a number might have lived carries
only a free-text `bemerkungen`. The gap is closed for the transcribed zones by the founder-supplied
`chZurichBzoCatalogue.ts`, but two structural residuals cap the rate:

1. **The values are `estimated-ruleset`, not `structured`** — transcribed from the PDF + cross-checked, not
   read from a live authoritative feed. C58 ranks this below a plandata-style structured field.
2. **Per-parcel regime resolution is partial.** `W2bIII` carries AZ 0.45 in both regimes but 8.5 m (91/99) vs
   9.0 m (2016) — so the height cap CANNOT come from the zone code alone; the governing regime must be
   resolved first (`ZURICH_BZO_REGIME_BY_DOC` crosswalk, populated from 12 real docs but the single most
   frequent docid 6808, ~555 polygons, is an image-only scan → still `regime-ambiguous`). Unresolved parcels
   honestly refuse rather than emit a guessed height.

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Land a text-bearing BZO 2016 consolidated doc (the 2016 analogue of 91/99's docid 16945) so docid 6808 parcels resolve | Closes ~555 sample polygons from `regime-ambiguous` to a real height | Low–Medium (source + classify) |
| Human-CONFIRM the docid→regime crosswalk + the exact source-PDF URLs; sign the per-parcel line in `VERIFICATION.md` | Resolves the sign-off contradiction; unlocks `human-reviewed` validation for Axis 2 | Low (human review) |
| Transcribe the remaining BZO 2016 zones (only cross-checked zones carried today) | Widens catalogue coverage | Medium |
| Wire the `/api/ch/zurich-bzo` proxy + CSP so `resolveZurichBzoZone` goes live (server scope) | Flips regional-zone-GIS from `documented` to `live` in DATA-SOURCES | Low (server) |

---
*Last updated: 2026-07-30. CONFIRMED live: cantonal AV WFS + City BZO WFS (`findings/ZURICH-BZO-PROBE.md`,
2026-07-25, US egress). The BZO catalogue is transcribed + cross-checked but the per-parcel human sign-off is
UNSIGNED (contradiction with the file's top-section 2026-07-26 sign-off — see `RISK-REGISTER.md` R3).
Maintainer: UNASSIGNED.*
