# Country Data Strategy — Switzerland (`ch`)

**Country:** Switzerland · **ISO 3166-1:** CH · **National join key:** EGID (buildings, GWR) + EGRID
(parcels, cadastre) · **Legal-plan unit:** cantonal/communal **Nutzungsplanung / Bau- und Zonenordnung
(BZO)**, published into the federal **ÖREB/RDPPF** cadastre (V-ÖREB) + the national **Nutzungsplanung
WFS** (MGDM 73.1) · **Fragmentation:** 26 cantons / ~2,100 communes, but ONE federal data model ·
**Proven-minimum rate:** ~20–25% building-rule (see `RATE.md`) · **Realistic ceiling:** ~30–40% legal
layer · context-data ~85–90% (separate axis) · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

> **The question, per parcel:** zone/use · a density metric (Ausnützungsziffer/GFZ) · height · setbacks.
> The rate is *how many parcels get all of those as machine-readable data, with no human opening a PDF.*
> Same ruler as every other country. **Deciding-probe verdict (2026-07-24): Switzerland delivers the
> zone as data, not the numbers — Outcome B, France-class ~20–25%, NOT the aspirational ~88%.** Full
> transcript: `findings/SWITZERLAND-DATA-RECON-SPIKE.md`.

---

## Step (a) — Inventory every authoritative machine-readable dataset

Every dataset probed LIVE 2026-07-24 (non-DACH origin; `geodienste.ch` + federal `*.admin.ch` are NOT
geo-blocked — only ZG's cantonal WFS is).

| Layer | Authoritative source + endpoint | Licence | Live-probe result (date · sample field=value) | Delivers a numeric building param? |
|---|---|---|---|---|
| Parcel geometry + EGRID | Amtliche Vermessung; ÖREB `getegrid` (`api.geo.ag.ch/v2/oereb`, `maps.zh.ch/oereb/v2`, +23 cantons) | Free OGD | probed: AG `egrid=CH959823775233`; ZH `egrid=CH779170199926` | geometry + join key only |
| Zoning code + plan link | geodienste **Nutzungplanung WFS** `ms:grundnutzung` (`geodienste.ch/db/npl_nutzungsplanung_v1_2_0/deu`), 19 cantons full | Free OGD (⚠ cantonal fees may apply) | probed: `typ_kommunal_code=1102 Wohnzone`, `hauptnutzung_code=11`, `bemerkungen=W2`, `dokument` | ❌ **zone code + PDF-link string, no numbers** |
| Structured numeric rules | national WFS — **ABSENT**; federal INTERLIS `Typ.Nutzungsziffer 0..9` exists but OPTIONAL + not surfaced nationally | Free OGD | probed: DescribeFeatureType has no `nutzungsziffer`/`gebäudehöhe`; `.ili` model has optional FAR slot only | **partial (FAR = optional model slot, unexposed); height ❌ (not modelled)** |
| Overlays — ÖREB restrictions (heritage/road-line/noise/forest…) | ÖREB `extract` per canton; swisstopo WMS `wms.geo.admin.ch` | Free OGD | WMS capabilities live w/ heritage/inventory layers; ÖREB `extract` op path not landed | overlay geometry (rule stays in linked PDF) |
| Context buildings + height | swissBUILDINGS3D 3.0 Beta STAC `data.geo.admin.ch/api/stac/v0.9/collections/ch.swisstopo.swissbuildings3d_3_0`; GWR `madd.bfs.admin.ch/eCH-0206` | Free OGD | STAC: EPSG 2056, `.gdb.zip`+`.dwg.zip` tiles; GWR EGID 1175237: `numberOfFloors=3, GAREA=87, GBAUJ=1987` | ✅ existing-building storeys/area/height (context, NOT rule) |
| Terrain (DTM/DSM/LiDAR) | swissALTI3D (DTM 0.5m), swissSURFACE3D (LiDAR 15–20 pts/m², COPC), swissSURFACE3D Raster (DSM 0.5m) | Free OGD | product docs; full national | datum only |

**Two-denominator note (mandatory).** **Switzerland answers "which zone" for ~65–75% of parcels
(national WFS + ÖREB TypeCode, 19–25 cantons) but "what numbers" for ~5–25%** — FAR only where a canton
populates the optional `Typ` slot and it is harvested; height/setback effectively 0% as structured data.
Quoting the ~85% *context-data* number, or the zone-ID number, as the headline is the §CONTEXT-DATA-HONESTY
failure — the two denominators are far apart and the ~88% claim conflated them.

---

## Step (b) — Measure how many parcel questions the data answers DIRECTLY

| Field | Structured? | Source / where the number actually lives | Coverage | Score |
|---|---|---|---|---|
| Parcel geometry + EGRID | ✅ | Amtliche Vermessung / ÖREB getegrid | 26/26 cantons | ~90% |
| Zone / use code | ✅ | national WFS `typ_*_code` + `hauptnutzung_code`; ÖREB `TypeCode` | 19 full + 4 partial WFS; 25/26 ÖREB | ~70% |
| Density (Ausnützungsziffer / GFZ) | ⚠ optional model slot, not nationally delivered | `Typ.Nutzungsziffer 0..9` in INTERLIS — only via per-canton `Typ` harvest; NOT in national WFS | canton-dependent, mostly unharvested | ~5–10% |
| Max height | ❌ | cantonal Bau- und Zonenordnung PDF — **not modelled anywhere** | ~0% as data | ~0–5% |
| Setbacks (Grenzabstand) | ❌ | cantonal BZO PDF | ~0% as data | ~0–5% |
| Overlays (heritage/flood) | ⚠ geometry via ÖREB/WMS; rule in PDF | ÖREB restrictions + swisstopo WMS inventories | national geometry | ~40% |
| Existing-building height (context) | ✅ | swissBUILDINGS3D LOD2 + GWR GASTW + swissSURFACE3D LiDAR | full national | ~90% |

**Composite → headline.** Building-rule dimensional fill = weighted read of zone + density + height, no
PDF: **(zone ~70 · density ~8 · height ~3) → practical ~20–25%.** This IS the `RATE.md` building-rule
headline. (The context-data axis — buildings/terrain/roads/water/parks — is ~85% and is a SEPARATE,
non-comparable ruler.)

---

## Step (c) — Identify what remains only in legal text

| Numeric field | Lives only in | Why it is not (national) data | Extractable by pipeline? |
|---|---|---|---|
| Ausnützungsziffer / GFZ (FAR) | per-canton `Typ` catalogue (INTERLIS) **or** the communal Baureglement | national WFS flattening drops the `Typ` join; the model slot is optional | **YES — but as a DATA HARVEST (ili2pg), not OCR.** This is the ceiling edge over France |
| Max height (Gebäude-/First-/Traufhöhe) | communal Baureglement / BZO PDF | not modelled in Nutzungsplanung_V1_2 at all | yes — article parser (like FR Art. 10) |
| Setbacks (Grenzabstand) | communal BZO PDF | not modelled; often a canton-level formula | yes / sometimes a coded formula |
| Heritage / ISOS / discretionary | ÖREB restriction + narrative sign-off | not a number — a case-by-case judgement | **NO — refuse, never fabricate** |

**Document-shape count (depth-vs-breadth lever).** Switzerland's plan corpus:

| Shape | Description | Switzerland |
|---|---|---|
| **A** — old scanned typewriter walls | high OCR burden | small — some rural communal Baureglemente |
| **B** — modern consolidated, born-digital | low burden, high-leverage | **most cantonal + city Baureglemente** (PDFs are born-digital, structured articles) |
| **C** — a national/general model governs directly | no pipeline needed | **the FAR slot** — `Typ.Nutzungsziffer` is a national MODEL field; harvesting it is Shape-C-like (data, not text) |

Switzerland is unusually favourable: FAR sits in a **national model field** (Shape C-ish, harvest not
OCR); height/setback sit in **born-digital consolidated PDFs** (Shape B, clean extraction). Very little
Shape-A scanned burden.

---

## Step (d) — Extraction-pipeline design for this country

Shared engine: **`docs/04-reference/standards/ORDINANCE-EXTRACTION-PIPELINE.md`** (`@pryzm/ordinance-extraction`,
Stages 0–6 → **L-449 human gate** → emit at `pipeline-extracted-unverified`). Switzerland supplies:

1. **Enumerator** — the FAR path is NOT the extraction pipeline: it is a **per-canton INTERLIS harvest**
   of the `Typ` catalogue (ili2pg from each canton's Nutzungsplanung transfer / geodienste per-canton
   download), joined to `Grundnutzung_Zonenflaeche` via `Typ_Geometrie`. The height/setback path IS the
   pipeline: enumerate in-force communal Baureglemente (canton GIS portals / ÖREB `LegalProvisions`
   links), with the ÖREB `rechtsstatus`/`publiziertab` as the supersession signal.
2. **Article/section grammar adapter** — one parser per Baureglement article, reused across communes:
   | Local article/section | Governs | → C58 field |
   |---|---|---|
   | `Ausnützungs-/Nutzungsziffer` (Art. varies) | density | `far` (prefer the harvested `Typ.Nutzungsziffer`) |
   | `Gebäudehöhe / Gesamthöhe / Firsthöhe / Traufhöhe` | height | `maxHeight_m` |
   | `Grenzabstand / Gebäudeabstand` | setbacks | `setback.front_m / side_m / rear_m` |
   | `Geschosszahl / Vollgeschosse` | storeys | `maxStoreys` |
3. **Locale + algorithm-detector settings** — German/French/Italian decimal comma; phrases like *"gemäss
   Zonenplan"*, *"nach Gestaltungsplan"*, *"Sondernutzungsplan"* mean the number is on a drawing / in a
   special plan → emit `null`/`derived`, **never a number**.
4. **Efficiency unit** — transcribe at the **canton** level for the `Typ` catalogue (one catalogue →
   many communes) and at the **commune** level for Baureglement height/setback. Prioritise the FAR
   harvest (national model field) before the PDF height extraction.

⚠ **L-449 gate + `pipeline-extracted-unverified` tier are non-negotiable.** Applies to the harvested FAR
too: a `Typ.Nutzungsziffer` value ships BELOW `estimated-ruleset` until a human signs `VERIFICATION.md`.

---

## Step (e) — The green / amber / red model

| Band | Meaning | Confidence tier | Counts toward the rate? |
|---|---|---|---|
| 🟢 **GREEN — structured data** | zone code + label + national main-use from the geodienste WFS / ÖREB TypeCode | `structured` | ✅ yes — this IS the ~20–25% (zone-ID dominated) |
| 🟠 **AMBER — compiled** | harvested `Typ.Nutzungsziffer` (FAR) OR pipeline-extracted height/setback, once human-verified | `pipeline-extracted-unverified` (pre-sign-off) → human tier | ✅ once L-449-verified |
| 🔴 **RED — needs a human / not a number** | Sondernutzungs-/Gestaltungsplan governs (a drawing), ISOS/heritage discretionary sign-off, or an unencoded canton | `not-determined` → cited **refusal** | ❌ — a refusal is a positive cited answer |

**The invariant:** RED is never dressed as GREEN. The `W2` a WFS returns is a zone identity, not a
buildable number — PRYZM renders the zone and refuses the height until the Baureglement is read/verified.

---

## Step (f) — The honest ceiling method

1. **Proven minimum = today's `RATE.md` number ~20–25%** (building-rule, green-band = zone-ID; live-probed
   2026-07-24). Floor, never inflated.
2. **Harvest + extraction lever = a HYPOTHESIS.** IF the per-canton `Typ`-catalogue harvest runs (FAR as
   data) AND the Baureglement pipeline runs on the born-digital consolidated PDFs at measured precision,
   the amber band adds FAR + height → **projected ~30–40%**. Projected, to be measured — not landed.
3. **Human-review ceiling ≈ 95–99%, NEVER 100%.** Residuum that stays RED forever: **Sondernutzungs-/
   Gestaltungspläne** (a graphic special plan overrides the zone table — Barcelona-graphic-primacy
   analogue), **ISOS / heritage discretionary sign-offs**, and cantons that decline to publish a
   populated `Typ` catalogue. Switzerland's residuum is smaller than France's (FAR is a model field, not
   prose) but real.

| Ceiling step | Switzerland | Basis |
|---|---|---|
| Proven minimum (green today) | ~20–25% | live-probed 2026-07-24 |
| + harvest (FAR) + extraction (height/setback), conditional | ~30–40% | projected; measure via a pilot canton |
| Human-review ceiling | ~90–95% legal + ~90% context | never 100 — residuum: Gestaltungspläne, ISOS/heritage, non-publishing cantons |

---

## Step (g) — The multi-source layer harvesting checklist

- [x] **Parcel geometry + EGRID** — ÖREB `getegrid` / Amtliche Vermessung → the inset ring + join key.
- [x] **Zoning code + plan link** — geodienste WFS `ms:grundnutzung` (`typ_*_code`, `hauptnutzung_code`,
      `bemerkungen`, `dokument`) → zone identity + PDF reference.
- [ ] **Structured numeric rule** — per-canton `Typ`-catalogue harvest (`Typ.Nutzungsziffer`) for FAR;
      Baureglement pipeline for height/setback. **NOT available from the base WFS query.**
- [ ] **Overlay: ÖREB restrictions (heritage/road-line/noise/forest)** — ÖREB `extract` per canton →
      **refuse-with-warning on intersection**.
- [ ] **Overlay: flood / natural-hazard (Gefahrenkarte)** — cantonal hazard WFS → can cap/forbid build.
- [x] **Context buildings + real height** — swissBUILDINGS3D 3.0 Beta STAC (`.gdb.zip`/`.dwg.zip` tiles)
      + GWR eCH-0206 GASTW → LOD2 massing + storey verification.
- [x] **Terrain (DTM/DSM/LiDAR)** — swissALTI3D / swissSURFACE3D → datum heights are measured from.
- [ ] **Supersession / in-force check** — ÖREB `rechtsstatus=inKraft` + `publiziertab/bis`; never extract
      from a superseded Baureglement.

---

## Worked contrast — Switzerland vs. the France instance

France (`../fr/`) and Switzerland are BOTH Outcome-B "zone-ID high, numbers text-bound", but differ on
ONE structural point that sets the ceiling:

- **France:** the FAR/height live only as **prose** in per-EPCI PLU règlements → the ONLY route is the
  one-parser-per-article extraction pipeline (Art. 6/7/9/10) + L-449. Ceiling ~30–35%.
- **Switzerland:** the FAR lives as a **typed national model field** (`Typ.Nutzungsziffer 0..9`) — a
  DATA harvest, not OCR — while height/setback live in born-digital Baureglemente (clean Shape-B PDFs,
  little scanned-A burden). So Switzerland's *ceiling* is a little higher and its FAR path is a
  data-plumbing job, not a language-model job. But its *floor today* is the same France-class ~20–25%,
  because the national delivery ships the zone, not the numbers.

⇒ **Do NOT build a numeric `ChZoningProvider` on the strength of the deciding probe** (it disproved
structured numbers via the national delivery). The honest builds are: (1) a zone-ID-only provider
(numbers `null`, L-449-gated — a founder call), (2) a per-canton FAR harvest, (3) the Baureglement
pipeline. See `RATE-IMPLEMENTATION-PLAN.md` Phases 1–3.

---

*Governing: **C58** §1.2 (fidelity) / §1.4 (never a guess) / §1.6 (per-field provenance) · **ADR-0269**
(curate-then-serve) · **L-449** (human-verification gate). Engine: `../../ORDINANCE-EXTRACTION-PIPELINE.md`.
Trackers: `RATE.md`, `RATE-IMPLEMENTATION-PLAN.md`. Probe transcript: `findings/SWITZERLAND-DATA-RECON-SPIKE.md`.
Probe discipline: `../../PROBE-DISCIPLINE.md`.*
