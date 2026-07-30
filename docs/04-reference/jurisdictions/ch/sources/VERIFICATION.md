# Switzerland (`ch`) — human verification sign-off

**Verifier:** UNASSIGNED · **Date:** — · **Pack version / commit:** —

---

## ✅ PARCEL geometry (Amtliche Vermessung) — L-449 sign-off (SIGNED 2026-07-30)

**Verifier:** repo owner (MarkHanoi) · **Date:** 2026-07-30 · **Axis:** PARCEL (C63 Axis 1) ·
**Scope:** parcel geometry + ownership-boundary ONLY (NOT the building-rule numbers in the sections below).

> **Switzerland (CH):** swisstopo **Amtliche Vermessung (AV)** cadastral parcels are authoritative,
> survey-grade cadastral data → score **HIGH** for parcel geometry + ownership-boundary. Downgrade
> ONLY for non-AV derivatives, generalized map tiles, or tasks needing a contemporaneous field
> survey. AV dataset = YES (engineering-grade); rendered web maps / non-authoritative copies = NO.

**What this signs — and what it deliberately does NOT.** This L-449 gate is exercised for the PARCEL
axis only. It does **not** sign any Ausnützungsziffer (FAR) / height / setback value — those stay
UNSIGNED (see the building-rule *Status* section immediately below, and the still-open Zürich
`CH_FAR_CERTIFIED` sign-off reconciliation tracked as RISK R3, which this decision does NOT touch).
Raising PARCEL to HIGH does **not** raise the CH country composite to 100: PARCEL is one axis at 15 %
weight (C63 §4), and LEGISLATION/ENVELOPE/HEIGHTS remain the binding cap.

**Evidence basis (DERIVED, cited).** The federal geo.admin.ch `identify` on
`ch.kantone.cadastralwebmap-farbe` returns the real AV *Grundstück* — federal **EGRID** + local parcel
number + canton + the survey polygon — keyless and all-canton, live-verified for **ZH**
(`CH119192997709`) and **GE** (`CH453165896335`) 2026-07-26 (`findings/ZURICH-PARCEL-SOURCE.md`; the
cantonal ZH AV WFS `maps.zh.ch/wfs/AVZHWFS` returns a real 184-vertex ring, EGRID `CH349199778779`,
`../ch-zh/0261-zurich/findings/ZURICH-BZO-PROBE.md` §1). AV is the Swiss statutory cadastre
(cadastre.ch) — the analogue of Spain's *referencia catastral* / Denmark's Matrikel. This **resolves**
the prior `footprint-fallback` verdict (`PARCEL-SELECT-COVERAGE.md`, 2026-07-24, which probed the
*wrong host* — `geodienste.ch/db/av_0` land-cover, never the federal identify): the two claims do not
both stand — the AV cadastral parcel is survey-grade and is PRYZM's shipping parcel source
(`swisstopo-av`, cadastral, not footprint).

**Standard field-survey caveat (unchanged by this sign-off).** HIGH covers the authoritative AV
geometry as published; it is not a warrant of a contemporaneous on-site boundary survey for a specific
transaction. Any task requiring a fresh field survey, or any *non-AV* derivative (generalized web-map
tiles, scraped/rendered copies), downgrades on its own merits — the sign-off is for the AV dataset,
not its derivatives.

**Sign-off:** ✅ **SIGNED 2026-07-30 — repo owner (MarkHanoi)** · L-449 (PARCEL axis).

---

## Status (2026-07-24)

**NO PACK VALUES SIGNED OFF YET** *(building-rule numbers only — the PARCEL-geometry axis IS signed;
see the L-449 section above. This section is scoped to Ausnützungsziffer / height / setback.)* Live
probes have confirmed endpoint availability and — as of the
2026-07-24 deciding probe — the STRUCTURE of the national zoning delivery: the geodienste WFS and the
federal INTERLIS model carry **zone identification as data but NOT the density/height numbers** (FAR =
optional model slot, unexposed by the national WFS; height = not modelled). This means even a fully
wired provider would render zone-ID structured and FAR/height `null`/refused. No numeric building-rule
value (Ausnützungsziffer, height, setback) has been read from a real parcel and verified against a
primary planning document, so no field may ship `confidence: 'structured'`.

Per playbook §3.4 and L-449: a pack may NOT ship `confidence: 'structured'` without this file
completed for each field.

---

## Live probe log (all 2026-07-24 — agent-run, not human sign-off)

| Endpoint / action | Result | Human sign-off required? |
|---|---|---|
| ÖREB AG `getegrid/json/?EN=2645020,1249500` | ✅ HTTP 200 — `{"GetEGRIDResponse":[{"egrid":"CH959823775233","number":"62","identDN":"AG0200004001","type":{"Code":"RealEstate",...}}]}` | No (structural confirmation only) |
| ÖREB ZH `getegrid/json/?EN=2683448,1248342` | ✅ HTTP 200 — `{"GetEGRIDResponse":[{"egrid":"CH779170199926","number":"UN4079","identDN":"ZH0200000261",...}]}` | No (structural confirmation only) |
| ÖREB GE `ge.ch/terecadastrews/RdppfSVC.svc` | ✅ HTTP 200 — WCF service page; WSDL accessible | No (endpoint live) |
| ÖREB VD `rdppf.vd.ch/ws/RdppfSVC.svc/` | ✅ HTTP 200 — WCF service page; WSDL accessible | No (endpoint live) |
| GWR API `madd.bfs.admin.ch/eCH-0206?egid=1175237` | ✅ HTTP 200 — XML response with building data for Poschiavo (GR) | No (API structural; GASTW visible in response) |
| GWR API `madd.bfs.admin.ch/eCH-0206?egid=501001` | ✅ HTTP 200 — XML response with 5 dwellings for Heiden (AR) | No (API structural) |
| swissBUILDINGS3D CityGML page | ✅ Page fetched — "CityGML 2.0" confirmed verbatim | No (format confirmation) |
| Nutzungsplanung WFS GetCapabilities (geodienste.ch) | ✅ HTTP 200 — layer names confirmed; 19 cantons full | No (capabilities only) |
| **DECIDING: WFS `ms:grundnutzung` DescribeFeatureType** | ✅ HTTP 200 — 13 elements; **no `nutzungsziffer`/`geschosszahl`/`gebäudehöhe`** | No (schema fact — but gates the RATE) |
| **DECIDING: WFS `ms:grundnutzung` GetFeature (AI, GML)** | ✅ HTTP 200 — `typ_kommunal_code 1102 / Wohnzone`, `hauptnutzung 11`, `bemerkungen W2`, dokument null; **no numbers** | No |
| **WFS overlay `…flaechenbezogene_festlegungen` DescribeFeatureType** | ✅ HTTP 200 — identical generic schema; **no height** | No |
| **INTERLIS `Nutzungsplanung_V1_2.ili` full read** | ✅ HTTP 200 — `Typ.Nutzungsziffer 0..9` OPTIONAL; **no height class anywhere** | No |
| **GWR eCH-0206 EGID 1175237 field transcription** | ✅ HTTP 200 — GKAT 1020, GKLAS 1110, GBAUJ 1987, GAREA 87, GASTW 3, Poschiavo GR | No |
| **STAC `ch.swisstopo.swissbuildings3d_3_0` + items** | ✅ HTTP 200 — EPSG 2056; per-tile `.gdb.zip` + `.dwg.zip`; CityGML separate | No |
| ÖREB `extract` operation (AG/ZH/BS, json/xml/pdf) | ❌ 404/303 on all federal-spec path guesses — per-canton path not landed | N/A (not decision-relevant) |
| swisstopo WMS GetCapabilities | ✅ HTTP 200 — capabilities confirmed live | No (structural) |
| GWR PDF Merkmalskatalog v4.2 | ✅ PDF fetched — full Stufe A field list read | No (schema confirmation only) |

---

## What was checked against which document version

| Field | Verified against | Method | Verdict |
|---|---|---|---|
| swissBUILDINGS3D 2.0 — LOD2, coverage, accuracy, formats, licence | swisstopo product page (read 2026-07-24) | Document read | ⚠ Research-confirmed from official page; NOT live-endpoint-verified (no tile downloaded) |
| swissBUILDINGS3D CityGML version | swisstopo CityGML product page 2024-08-14 (fetched 2026-07-24) | Page fetch | ✅ **CityGML 2.0 CONFIRMED** — verbatim statement in page text |
| swissBUILDINGS3D 3.0 Beta — canton list | opendata.swiss dataset page (read 2026-07-24) | Document read | ⚠ Research-confirmed; biannual update — re-check |
| swissTLM3D — roads, water, parks, trees coverage and attributes | Objektkatalog swissTLM3D v1.7–2.4 (read 2026-07-24) | Document read | ⚠ Research-confirmed; NOT live-endpoint-verified |
| GWR Stufe A field schema | GWR Merkmalskatalog PDF v4.2 (fetched and read 2026-07-24) | PDF read | ✅ Full field list confirmed; API catalog version is now 4.3 (minor delta) |
| GWR API — live availability | `madd.bfs.admin.ch/eCH-0206` (probed 2026-07-24, two EGIDs) | HTTP probe | ✅ VERIFIED LIVE — structured XML returned |
| ÖREB AG endpoint — live availability | `api.geo.ag.ch/v2/oereb/getegrid/json/` (probed 2026-07-24) | HTTP probe | ✅ VERIFIED LIVE — JSON EGRID response |
| ÖREB ZH endpoint — live availability | `maps.zh.ch/oereb/v2/getegrid/json/` (probed 2026-07-24) | HTTP probe | ✅ VERIFIED LIVE — JSON EGRID response |
| ÖREB GE endpoint — live availability | `ge.ch/terecadastrews/RdppfSVC.svc` (probed 2026-07-24) | HTTP probe | ✅ VERIFIED LIVE — WCF service page |
| ÖREB VD endpoint — live availability | `rdppf.vd.ch/ws/RdppfSVC.svc/` (probed 2026-07-24) | HTTP probe | ✅ VERIFIED LIVE — WCF service page |
| ÖREB 2.0 schema — TypeCode structured | `schemas.geo.admin.ch/V_D/OeREB/2.0/extractdata.json` (fetched 2026-07-24) | Schema read | ✅ `TypeCode` confirmed as required string field in `RestrictionOnLandownership` |
| ÖREB 2.0 schema — no numeric FAR/height field | Same schema | Schema read | ✅ Confirmed: no `Ausnuetzungsziffer` or `Gebaeudehoehe` numeric field in base schema |
| Nutzungsplanung WFS — layer names, canton coverage | geodienste.ch GetCapabilities (fetched 2026-07-24) | WFS probe | ✅ Layer names and canton list confirmed |
| Nutzungsplanung WFS — Nutzungsziffer attribute | geodienste WFS DescribeFeatureType + GetFeature (2026-07-24) | WFS probe | ✅ **RESOLVED: NOT a national WFS attribute** — zone-ID + dokument only |
| Nutzungsplanung WFS overlay — height attribute | Overlay DescribeFeatureType (2026-07-24) | WFS probe | ✅ **RESOLVED: no height** — schema identical to grundnutzung |
| INTERLIS model — FAR / height presence | `Nutzungsplanung_V1_2.ili` full read (2026-07-24) | Model read | ✅ **RESOLVED:** FAR = optional `Typ.Nutzungsziffer 0..9`; height = absent from model |
| GWR building record — real field values | `madd.bfs.admin.ch/eCH-0206?egid=1175237` (2026-07-24) | HTTP probe | ✅ GKAT/GKLAS/GBAUJ/GAREA/GASTW transcribed verbatim |
| ÖREB full `extract` content (any canton) | AG/ZH/BS json/xml/pdf attempted (2026-07-24) | HTTP probe | ⚠ ATTEMPTED-not-landed (per-canton path); NOT decision-relevant |
| Swiss parcel **GEOMETRY + ownership-boundary** (AV / EGRID) | ZH `CH119192997709` + GE `CH453165896335` (`findings/ZURICH-PARCEL-SOURCE.md`); cantonal ZH AV WFS 184-vertex ring | Federal geo.admin.ch identify + cantonal AV WFS | ✅ **SIGNED 2026-07-30 (L-449, PARCEL axis) — HIGH.** AV = survey-grade; downgrade only for non-AV derivatives / generalized tiles / field-survey tasks (see the L-449 sign-off at the top of this file) |
| Any specific Swiss parcel — zone code / AZ / height (as a SIGNED **building-rule** value) | Not read for a named parcel | — | ❌ NOT CONFIRMED — needs a separate L-449 building-rule sign-off (distinct from the PARCEL-geometry sign-off above) |
| Cantonal Denkmalschutz WFS | NOT PROBED | — | ❌ NOT CONFIRMED |

---

## What was RESOLVED by the deciding probe (2026-07-24) — no longer open

- **Ausnützungsziffer (FAR) as a structured national field:** ✅ RESOLVED — it is NOT one. Absent from
  the ÖREB base schema AND from the national geodienste WFS (`ms:grundnutzung` DescribeFeatureType +
  GetFeature). It exists only as an OPTIONAL typed slot `Typ.Nutzungsziffer 0..9` in the federal
  INTERLIS model, recoverable via a per-canton `Typ`-catalogue harvest.
- **Max height as a structured field:** ✅ RESOLVED — it does NOT exist anywhere in the Nutzungsplanung
  model (not in grundnutzung, not in the overlay layer, not in the `.ili`). Baureglement-PDF-bound.

## What still could NOT be confirmed (stays unshippable / needs human L-449)

- **Any numeric building-rule value SIGNED OFF for a named Swiss parcel:** no ÖREB extract landed, no
  cantonal Baureglement read + verified for a specific address. Every pack value stays `null`/refused.
- **A POPULATED `Typ.Nutzungsziffer` for a real parcel:** the slot exists; whether a given canton fills
  it, and its value, needs the per-canton INTERLIS harvest + sign-off.
- **Geodienste.ch access fee:** "costs may apply" — not confirmed free.
- **NE ÖREB endpoint:** no URL found.
- **GWR field domain codes (GKAT, GKLAS value tables):** field names + one live record confirmed; full
  domain code lists not transcribed.

## Caveats that must remain visible in the product

- **CityGML 2.0 applies to 3.0 Beta cantons only** — the 2.0 product ships FileGDB and DWG.
- **3.0 Beta canton list is dated 2026-07-24 and is biannually updated.** Re-check before build plans.
- **NW and OW share one ÖREB endpoint** (`oereb.gis-daten.ch/oereb`) — must test both canton EGIDs.
- **GE and VD RDPPF are SOAP/WCF services**, not REST/JSON — require SOAP client, not simple GET.
- **Geodienste.ch WFS: cantonal fees may apply** — cannot assume free for production use.
- **GWR tree data / swissTLM3D** — Zürich assigns primary authority to its Baumkataster; treat
  swissTLM3D tree data as national fallback only.

---

**Sign-off:** ✅ SIGNED OFF 2026-07-26 by the repo owner (MarkHanoi), who verified the transcribed
BZO 700.100 AZ / Vollgeschosse / Gebäudehöhe tables (both 91/99 + 2016 regimes) and accepted the
per-parcel regime crosswalk. `CH_FAR_CERTIFIED` is now **ON**: the Zürich computed envelope ships at
`confidence: 'estimated-ruleset'` (transcribed values, not a live authoritative feed) for parcels
whose BZO regime resolves via the crosswalk; parcels with an unresolved regime honestly refuse.

---

# City of Zürich (BFS-Nr 261, canton ZH) — BZO 700.100 zone-parameter transcription

**Added 2026-07-25.** Founder-supplied values, transcribed from the BZO 700.100 primary PDFs and
cross-checked. Machine catalogue: `packages/site-parcel-data/src/providers/chZurichBzoCatalogue.ts`;
canonical data artefact: `ch/sources/bzo_zone_data.json`. **Certification gate `CH_FAR_CERTIFIED` is
ON (signed off 2026-07-26 by the repo owner)** — these values ship at `estimated-ruleset` (transcribed,
NOT `structured`); the computed Zürich envelope is live for parcels whose regime resolves via the crosswalk.

## The TWO parallel regimes

Zürich runs two parallel BZO regimes over different plan areas. The value that governs a parcel depends
on WHICH regime applies — resolvable from the parcel's `rechtsvorschrift_url` / plan area, **not the
zone-code string alone**. `resolveZurichBzoRegime()` determines it and **REFUSES `regime-ambiguous`**
when it cannot, rather than guess.

### BZO 91/99 (older — most of the city; Art. 13 Wohnzonen, Art. 18 Zentrumszonen)

| Zone | AZ | Vollgeschosse | Höhe (m) | Other |
|---|---|---|---|---|
| W2bI | 40 % | 2 | 9.0 | |
| W2bII | 40 % | 2 | 9.0 | |
| W2bIII | 45 % | 2 | **8.5** | Grundgrenzabstand 5 m, Überbauungsziffer 25 % |
| W2 | 60 % | 2 | 9.0 | |
| W3 | 90 % | 3 | 9.5 | |
| W4b | 105 % | 4 | 12.5 | |
| W4 | 120 % | 4 | 12.5 | |
| W5 | 165 % | 5 | 15.5 | |
| W6 | 205 % | 6 | 18.5 | |
| Z5 | 200 % | 5 | 19.0 | Grundgrenzabstand 3.5 m |
| Z6 | 230 % | 6 | 22.0 | |
| Z7 | 260 % | 7 | 25.0 | |

### BZO 2016 (newer plan area — different article numbering)

| Zone | AZ | Vollgeschosse | Höhe (m) | vs 91/99 |
|---|---|---|---|---|
| W2bIII | 45 % | 2 | **9.0** | ⚠ Höhe 9.0 m (vs 8.5 m); AZ unchanged |
| Z5 | 200 % | 5 | 19.0 | identical |
| Z6 | 230 % | 6 | 22.0 | identical |
| Z7 | 260 % | 7 | 25.0 | identical |

Only the zones the founder cross-checked under BZO 2016 are carried; the rest are deliberately NOT
transcribed under this regime (no value supplied, none guessed).

## Cross-check — **PASS**

- **Z5–Z7 AZ 200 / 230 / 260 %** independently corroborated (founder + the Stadt Zürich BZO summary
  magnitudes for the centre zones), and identical across both regimes. ✅
- The residential ladder (W2b… → W6) AZ / Vollgeschosse / Höhe transcribed from the BZO 700.100 table
  and agree with the founder's second read. ✅
- Machine-vs-artefact parity: `chZurichBzoCatalogue.test.ts` pins the catalogue values against this
  table (W2bIII→0.45, Z5→2.00, Z6→2.30, Z7→2.60 both regimes; the full 91/99 ladder). ✅

## The W2bIII DISCREPANCY (why per-parcel regime resolution is soundness-critical)

`W2bIII` carries **AZ 0.45 in both regimes but max Gebäudehöhe 8.5 m (BZO 91/99) vs 9.0 m (BZO 2016)**.
The FAR is regime-independent; the **height is not**. So a parcel's height cap **cannot** be taken from
the zone code alone — the governing regime must be resolved first. A guessed regime is a fabricated
height (§CONTEXT-DATA-HONESTY: a refusal and a fabrication must not collapse). This is exactly why
`resolveZurichBzoRegime` / `resolveZurichBzoEnvelopeParams` refuse `regime-ambiguous` on any parcel
they cannot place, and why the OFF-state refusal surfaces BOTH heights when the regime is unresolved.

## Source PDFs (founder-supplied)

| Regime | Document | Reference | URL status |
|---|---|---|---|
| BZO 91/99 | Bau- und Zonenordnung der Stadt Zürich (1991/1999) | Art. 13 / Art. 18 | oerebdocs.zh.ch `getDoc` base verified live 2026-07-25; **exact consolidated-PDF URL to be confirmed at sign-off** |
| BZO 2016 | 700.100 Bau- und Zonenordnung der Stadt Zürich (2016) | Amtliche Sammlung 700.100 | oerebdocs.zh.ch `getDoc` base verified live 2026-07-25; **exact consolidated-PDF URL to be confirmed at sign-off** |

## Open items before `CH_FAR_CERTIFIED = ON`

1. **(a) Per-parcel regime resolution — CROSSWALK POPULATED (from real docs); human sign-off still open.**
   The `docid → regime` crosswalk (`ZURICH_BZO_REGIME_BY_DOC`) is **no longer empty**. It was populated
   2026-07-25 by a probe-first pipeline (canonical artefact: `ch/sources/bzo_regime_crosswalk.json`;
   reproducible script: `tools/ch-bzo-regime/`):
   - **Endpoint used:** the live Stadt-Zürich BZO WFS
     `https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Nutzungsplanung___kommunale_Bau__und_Zonenordnung__BZO_`,
     layer `bzo_zone_v`, field `rechtsvorschrift_url` — self-sourced the real docids from a broad polygon
     sample (a single parcel's `rechtsvorschrift_url` can concatenate several `; `-separated
     `getDoc?docid=<N>` links, so the resolver parses all docids and resolves only on consensus).
   - **Classified from each document's own text** (`getDoc?docid=<N>` fetched + `classifyBzoRegimeFromDocText`):
     - **`bzo_91_99` (8 docids):** 573, 562, 601, 606, 610, 615, 620 (BZO 92 → BZO 99 festsetzung
       lineage: GRB Nr. 1559 vom 23. Oktober 1991; GRB 1815/1816 vom 24. November 1999), plus **16945**
       (the consolidated "Bau- und Zonenordnung (BZO 91/99)" text, changes to 20. März 2024).
     - **`bzo_2016` (4 docids):** 10868, 10984, 11130, 15172 (the BZO 2016 fassung / post-2016
       `Teilrevision Bau- und Zonenordnung` + Stadtratsbeschluss (STRB) chain).
   - **Deliberately EXCLUDED (refuse `regime-ambiguous`, never guessed):** 6808 / 6561 / 7315
     (image-only scans, 0 extractable text), 16381 (a *cantonal* Nutzungszonen/Waldgrenzen Verfügung,
     not the municipal BZO), 625 (a 2005 zone-plan change restating no lineage). ⚠ **6808 is the single
     most frequent docid (~555 polygons in the sample).** The founder-supplied `bzo_zone_data.json`
     labels it the "BZO 2016" consolidated 700.100 PDF, but that is **not verifiable from the document
     text** (scanned image), so parcels linking only to 6808 still resolve `regime-ambiguous` — a
     text-bearing BZO 2016 consolidated doc (the 2016 analogue of 91/99's `16945`), or the human
     sign-off in item (b), would close them.
   - Real parcels identified by `resolveZurichBzoZone` (which yield a `rechtsvorschrift_url`) now resolve
     a regime whenever their governing docid(s) are classified above. **Status: crosswalk populated
     from 12 real docs; the docid→regime verdicts still require the repo owner's review at sign-off —
     NOT yet human-CONFIRMED.**
2. **(b) Exact source-PDF URLs confirmed.** Replace the `founder-to-confirm` URL status in
   `bzo_zone_data.json` / `ZURICH_BZO_SOURCE_DOCUMENTS` with the verified consolidated-PDF URLs for
   both regimes. **Status: NOT CONFIRMED.**
3. **(c) Human sign-off by the repo owner** — reviewing this transcription against the primary BZO
   700.100 PDFs for the specific pilot parcel, then flipping `CH_FAR_CERTIFIED` to `true` (the single
   one-line activation).

**Zürich BZO sign-off:** ______________________________ (repo owner) · **Date:** __________ · UNSIGNED.

*Until every open item above is closed and this line is signed, `CH_FAR_CERTIFIED` stays `false` and
the honest cited refusal (enriched with these transcribed reference values, labelled "pending
certification") is the shipping output for every City-of-Zürich parcel.*
