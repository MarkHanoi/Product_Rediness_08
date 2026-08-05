# ILLES BALEARS — CAPABILITY AUDIT (2026-08-04)

**Scope**: can PRYZM move the Illes Balears past its current `open-top-indicative` posture toward a
full DETERMINATION (a legally-defensible closed-top buildable envelope), for Mallorca, Menorca,
Eivissa and Formentera? This is a research audit only — **no code was written or recommended for
implementation.**

**Starting point** (verified against the repo, not asserted): `packages/site-parcel-data/src/rulepacks/esBalearsMuib.ts`,
`packages/site-parcel-data/src/providers/resolveBalearsMuib.ts`,
`packages/site-parcel-data/src/rulepacks/openTopIndicative.ts` and
`docs/04-reference/jurisdictions/es/es-ib/BALEARS-MUIB-ASSESSMENT.md`. Confirmed live in code:
`BALEARS_ENVELOPE_VERIFIED = false`; Balears **was listed** `open-top-indicative` on 2026-08-03
(`BALEARS_OPEN_TOP_INDICATIVE` in `openTopIndicative.ts`, registered in
`OPEN_TOP_INDICATIVE_JURISDICTIONS`); `R` (parcel/zone identity) resolves uniquely on **97.1%** of
2,210 GESTIO features by census; `P` (a drawable rule) reaches **~74.1% of private developable
land** (61.4% complete + 12.7% partial); only **2.0%** of fitxes are both COMPLETE and cite a
governing article on the parameter; and **67 of 67 municipalities carry the PTI-abrogation flag on
rustic land (94.53% of the territory)**, which MUIB's own metadata says can only be **PARTIALLY OR
TOTALLY ABROGATED** by the island territorial plans — invisible in the GESTIO layer used for `R`.

---

## Executive Summary

Illes Balears is, by a wide margin, the best-instrumented Spanish region PRYZM has measured for the
*parcel + zoning* half of an envelope: MUIB is a live, census-verified, per-feature-linked
structured *fitxa* system, and this audit's own live probing found something the prior internal
assessment had not yet surfaced — the Govern (GOIB) and two of the three island councils publish
**machine-readable, queryable ArcGIS/WFS geometry for several of the six "unmodelled" constraint
families**, at least for parts of the archipelago: flood risk (`GOIB_XarxaHidro_RiscInun_IB`,
GOIB-wide), the Eivissa/Formentera territorial plan bundled with its own heritage (BIC), airport
acoustic servitude, wildfire, flood and DPMT-servitude layers (`GOIB_PTI_PIT`), the Mallorca
territorial plan's risk-prevention layers (`ws_ptm`, Consell de Mallorca), and Menorca's PTI/ANEI
WFS with 50+ feature types including cultural-heritage markers (`ide.cime.es/geoserver/ordenacio`).
None of this closes the determination gap by itself: every geometry layer found publishes a
**category or a boundary, not the numeric override rule** — the actual normative text that says
*what a PTI category does to height/FAR/setback* remains in unstructured plan documents (PDF), and
the fitxa-to-article citation gap (2.0%) is a separate, still-open problem that is a parsing/sourcing
problem, not a coverage problem. Airport servitude (AESA) and coastal servitude (MITECO DPMT) are
nationally-scoped services whose Balears coverage is asserted but was not confirmed queryable by
point in this session. Heritage remains the weakest family region-wide: BIC geometry exists for
Eivissa (inside `GOIB_PTI_PIT`) and appears to exist at municipal scale for Eivissa city
(`mapes.eivissacultural.es`), but no unified, GOIB-wide BIC/catàleg layer was found covering Mallorca
or Menorca. **The ceiling PRYZM already states (open-top, not determination) is correct today**, but
the audit found real, previously-undocumented geometry that narrows — without closing — three of the
six gaps (flood, PTI-as-category, and heritage-for-Eivissa), and confirms the other three
(coastal, airport, heritage-for-Mallorca/Menorca) as either nationally-scoped-but-unverified or
genuinely absent.

---

## Capability: **Indicative Ready** (confirmed) — with a documented, narrow path to *partial* determination on specific constraint families, not a path to a full regional determination

Balears cannot move to `BALEARS_ENVELOPE_VERIFIED = true` on the evidence gathered here. Two
independent blockers each individually forbid it, and neither is close to closing:

1. **The fitxa-to-article citation gap (98%)** is a sourcing/parsing problem inside the *parameter*
   half of the pipeline, unrelated to the six constraint families, and this audit found no new
   evidence that it is closeable by finding a different source — MUIB's own fitxa page is already
   the canonical structured source, and the article citation is either printed or it isn't.
2. **The PTI/heritage/flood/airport/coastal/environmental families**, even where this audit found
   live geometry, publish **category, not numeric consequence**. A PTI polygon says "this parcel is
   inside `ptm_cat = ANEI`" or "inside the airport acoustic-servitude zone"; it does not say "so your
   height ceiling is X". Translating category → numeric override requires reading the PTI's own
   *normativa* (a text document per island, not yet confirmed as structured data anywhere in this
   session), which is a materially different and harder problem than reading the MUIB fitxa.

What changed relative to the existing internal assessment: this audit's own live queries show the
"six unmodelled constraint families" line in `openTopIndicative.ts` is **partially stale as a
coverage statement** (geometry exists, unread, for several of them) even though it remains **entirely
correct as a determination statement** (none of that geometry carries a numeric rule PRYZM could
cite). The distinction matters for scoping future work but does not change today's gate.

---

## Evidence Matrix

| # | Area | Finding | Source (live-verified this session) |
|---|---|---|---|
| 1 | Planning docs — fitxa system | Structured, per-zone, live HTML fitxa (not PDF, not scan) linked from the zoning layer; census-verified 2.0% article-cited | `docs/.../BALEARS-MUIB-ASSESSMENT.md` (prior session, code-consistent) |
| 2 | Zoning geometry coverage | `GOIB_MUIB` MapServer, ArcGIS REST, keyless, all 4 islands in one service | `ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer` |
| 3 | Parcel geometry | Not re-verified this session (national Catastro INSPIRE WFS per prior assessment) | carried from `BALEARS-MUIB-ASSESSMENT.md` |
| 4 | Fitxa parameter reliability | Height (`HR`/`HT`), storeys (`NP`), FAR (`E`), coverage (`O`), setbacks (`RA`/`RM`/`RF`) — all NULL-honest, none fabricated | `esBalearsMuib.ts` (code, read this session) |
| 5 | Heritage — GOIB-wide | **Not found.** No `GOIB_*Patrimoni*`/`*BIC*`/`*Cultural*` MapServer in the public IDEIB catalog search | `ideib.caib.es/geoserveis/rest/services/public?f=json` (live) |
| 5b | Heritage — Eivissa | **Found, partial.** `PTI05 BICs Eivissa` (point layer, id 27) inside `GOIB_PTI_PIT` | `ideib.caib.es/geoserveis/rest/services/public/GOIB_PTI_PIT/MapServer?f=json` (live) |
| 5c | Heritage — municipal (Eivissa city) | A dedicated "Mapa BIC" viewer exists | `mapes.eivissacultural.es/mapa/` (found via search, not queried) |
| 5d | Heritage — Mallorca/Menorca | **Not found** in this session | — |
| 6 | Flood — GOIB-wide | **Live, queryable.** `GOIB_XarxaHidro_RiscInun_IB` — ARPSI DPH, flow-preferential zone, 500-yr flood extent, "no-ARPSI in process", "potentially floodable ZPI" — 16+ layers, ArcGIS REST Query capability confirmed | `ideib.caib.es/geoserveis/rest/services/public/GOIB_XarxaHidro_RiscInun_IB/MapServer?f=json` (live) |
| 6b | Flood — scope caveat | Only 43 ARPSI zones nationally assessed (11 fluvial/pluvial in Mallorca+Eivissa, 32 coastal) — this is a *significant-risk* subset, not full torrent coverage | Govern's own "Portal de l'Aigua" pages (search-derived, not queried live) |
| 7 | Airport — servitude existence | RD 416/2011 (Palma/Son Sant Joan), RD 732/2015 (Ibiza) confirmed as the governing instruments; Menorca also regulated | `transportes.gob.es`, `seguridadaerea.gob.es` (search-derived) |
| 7b | Airport — machine-readable geometry, GOIB-wide | **Not confirmed downloadable/queryable.** AESA's public viewer describes outlines but no WMS/WFS/KMZ endpoint was surfaced | `seguridadaerea.gob.es/en/ambitos/servidumbres-aeronauticas/mapa-de-ssaa` (live fetch, inconclusive) |
| 7c | Airport — Eivissa acoustic servitude | **Found.** `PTI modif1 Zona Servitud Aeronàtica Acústica Eivissa` + `PTIE modif1 Zona Servei i Cautela Aereportuària` inside `GOIB_PTI_PIT` | same MapServer as row 5b (live) |
| 8 | Coastal — national | Deslinde/servidumbre-de-protección data published Spain-wide as Shapefile/GML-INSPIRE/KMZ, "national scope", regional filtering not confirmed | `miteco.gob.es/.../deslinde-dpmt.html` (live fetch, inconclusive on per-region query) |
| 8b | Coastal — GOIB layer | `GOIB_Ord_Litoral_IB` exists but publishes **concessions/seasonal installations**, not the servitude/deslinde line itself | `ideib.caib.es/.../GOIB_Ord_Litoral_IB/MapServer?f=json` (live) |
| 8c | Coastal — Eivissa PTI | `PTIE 05 Servitud DPMT Eivissa` polygon layer exists inside `GOIB_PTI_PIT` | same MapServer as row 5b (live) |
| 9 | Environmental — Natura 2000 | `GOIB_NATURA_ENP_IB` MapServer + WMS GetCapabilities endpoint confirmed to exist; not queried for fields this session | search-derived, URL confirmed reachable in listings |
| 9b | Environmental — Eivissa PTI | `PTI05 LICS ZEPAS Eivissa` layer exists inside `GOIB_PTI_PIT` | same MapServer as row 5b (live) |
| 10 | PTI — Mallorca | **Live ArcGIS REST**, `ws_ptm` (Consell de Mallorca), PTI approved 2023. 13 layers incl. `ptmrustic` (rustic land category), 4× `apr_*` risk layers (landslide/erosion/flood/fire), `apt`, `art`/`art_p`, `aip`, `up`. Field-level check on `ptmrustic`: **only `ptm_cat` (category string) + `codi_ine` + `modificacio` — no numeric parameter of any kind.** | `ide.conselldemallorca.net/server/rest/services/public/ws_ptm/MapServer` (live, fields checked) |
| 10b | PTI — Menorca | **Live WFS 2.0.0**, `ide.cime.es/geoserver/ordenacio` — GML/JSON/KML/Shapefile/CSV output. Feature types include PTI zoning classes (`or007rpt_classesol`), NTT land categories, ANEI boundaries (multiple layers), and heritage markers (*camí de cavalls*, `orm13ane_patrim`) | `ide.cime.es/geoserver/ordenacio/wms?service=WFS&request=GetCapabilities` (live) |
| 10c | PTI — Eivissa/Formentera | **Live ArcGIS REST**, `GOIB_PTI_PIT`, 35 layers — the richest single constraint bundle found (heritage, airport, flood, fire, coastal servitude, Natura 2000, aquifer protection all co-located) | `ideib.caib.es/.../GOIB_PTI_PIT/MapServer?f=json` (live) |
| 10d | PTI — numeric override | **Not found anywhere.** Every PTI geometry layer checked publishes a category code, not a height/FAR/setback consequence of that category | inferred from rows 10, 10b field lists (live) |
| 10e | PTI abrogation flag | 67/67 municipalities self-flag rustic land as possibly abrogated by PTI (prior session finding, not re-verified) | `BALEARS-MUIB-ASSESSMENT.md` |

---

## Machine-readable assets — every verified endpoint

All confirmed reachable and structurally described (JSON layer listing or WFS `GetCapabilities`)
in this session, via `WebFetch`:

- `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_MUIB/MapServer` — zoning + fitxa links, all islands
- `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_XarxaHidro_RiscInun_IB/MapServer` — flood/ARPSI, GOIB-wide, Query-capable
- `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_PTI_PIT/MapServer` — Eivissa+Formentera PTI bundle (heritage, airport, flood, fire, coastal, Natura2000), Query-capable
- `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_Ord_Litoral_IB/MapServer` — coastal concessions/installations (not servitude line), Query-capable
- `https://ide.conselldemallorca.net/server/rest/services/public/ws_ptm/MapServer` — PTI Mallorca (2023), 13 layers, Query-capable; `ptmrustic` field-checked (categorical only)
- `https://ide.cime.es/geoserver/ordenacio/wms` (WFS 2.0.0) — PTI Menorca + ANEI + NTT, 50+ feature types, multi-format output (GML/JSON/KML/SHP/CSV)
- `https://ideib.caib.es/geoserveis/rest/services/public/GOIB_NATURA_ENP_IB/MapServer` — Natura 2000 / protected natural spaces, existence confirmed, not field-checked

Existence confirmed but not queried for schema this session (follow-up work, not this audit):
`GOIB_Hidro_ZonesProt_Vuln_IB`, `NGIB`, `GOIB_BTIB_IB`, `GOIB_Memoria_Democratica_IB`,
`GOIB_ArbresSingulars_IB`, `GOIB_Posidonia_IB`, `GOIB_PortsIB`, `mapes.eivissacultural.es/mapa/`.

---

## Missing assets — the six constraint families, per-family findings

1. **Heritage.** GOIB-wide: absent. Eivissa: BIC point layer inside `GOIB_PTI_PIT` (row 27). Eivissa
   city: a dedicated municipal viewer exists (unverified schema). Mallorca, Menorca, Formentera:
   nothing found. Even where a BIC point exists, it is a location marker, not a buffer/protection-zone
   polygon with numeric consequence — Spain's national heritage law imposes case-by-case entorno de
   protección determinations that are not generally geometric.

2. **Flood.** The strongest of the six. GOIB-wide ARPSI + flow-preferential-zone + 500-yr-extent
   layers are live and queryable. Caveat: ARPSI is a *significant risk* subset (43 zones nationally),
   not full torrent-network coverage, and the layer's numeric consequence for buildability (which
   ordinance article restricts what, inside a flood zone) was not verified in this session.

3. **Airport.** National RD-level servitudes exist and are legally real for Palma, Ibiza and Menorca.
   Geometric access: unconfirmed at GOIB level for Mallorca/Menorca; confirmed present but narrow
   (acoustic + service/caution zones only, not the full obstacle-limitation-surface geometry) for
   Eivissa inside `GOIB_PTI_PIT`.

4. **Coastal.** MITECO publishes a national deslinde/servidumbre dataset in downloadable formats, but
   per-region (Balears-specific) query/WFS access was not confirmed live. GOIB's own coastal layer
   (`GOIB_Ord_Litoral_IB`) is the wrong layer (concessions, not the servitude line). Eivissa's PTI
   bundle carries a DPMT servitude polygon specifically — the one island where this is directly
   confirmed.

5. **Environmental (Natura 2000).** GOIB-wide service exists (`GOIB_NATURA_ENP_IB`), not schema-verified
   this session. Eivissa's PTI bundle separately carries `LICS ZEPAS` — redundant confirmation that
   the geometry exists at least for that island.

6. **PTI (island territorial plans).** The most legally significant of the six, and the one this audit
   spent the most effort on. All three island councils publish *some* live PTI geometry
   (Mallorca: ArcGIS REST; Menorca: WFS 2.0.0; Eivissa/Formentera: ArcGIS REST via GOIB). This is a
   materially different picture from "PTI is invisible" — geometry to answer "is this parcel inside a
   category the PTI treats specially" now looks reachable for all three councils. **What remains
   genuinely absent everywhere checked: the numeric consequence of a category.** A `ptm_cat = ANEI`
   or an `or007ntt_entitats_categ_sr` code is a lookup key into a *text* normativa document, and no
   structured mapping from category-code → height/FAR/setback override was found for any island. This
   is the single most important corrected finding of this audit relative to the existing internal
   record: the geometry gap is smaller than documented; the semantic (category→number) gap is the
   real, still-total blocker, and it was not previously named as a distinct problem.

---

## Blockers

| Blocker | Type | Solvability |
|---|---|---|
| Fitxa parameter lacks article citation (98%) | Sourcing/legal | Hard — the publisher would have to change what it prints; PRYZM cannot infer a citation it doesn't hold |
| PTI category has no structured numeric mapping | Engineering + legal research | Hard — requires reading each island's PTI normativa text (3 separate legal documents) and building a verified category→rule table; this is exactly the "derived-plan" class PRYZM already refuses rather than guesses |
| Heritage geometry absent for 3 of 4 islands | GIS-solvability | Uncertain — may not exist as GIS anywhere (heritage protection in Spain is frequently expressed as a list + case-by-case entorno, not a polygon layer) |
| Airport full obstacle-surface geometry unconfirmed | GIS-solvability | Medium — AESA's authorization workflow implies the surfaces exist digitally internally; public self-service access not found |
| Coastal servitude regional query unconfirmed | Engineering | Medium — national datasets exist in bulk-download form (Shapefile/GML/KMZ); a static Balears-clip pipeline is plausible even without a live WFS, echoing the "bulk vs query endpoint" lesson from other regions |
| Supersession of MUIB record by PTI abrogation flag | Legal | Hard — 94.53% of land (rustic) is flagged; the flag is binary and municipality-wide, not parcel-level, so it cannot be narrowed without reading each unadapted municipality's actual PTI-vs-PGOU conflict |

---

## Estimated Unlock Effort toward a FULL determination: **Very Large**

Even the narrower, single-family unlocks (e.g. "wire flood geometry as a hard exclusion") are
Medium-to-Large on their own once article-level verification and legal sign-off are included. A full
regional determination requires: (a) closing the fitxa-citation gap (largely not closeable by more
engineering — it is a sourcing ceiling), (b) building three separate island PTI category→rule
mappings from unstructured legal text, (c) resolving heritage for three islands where no GIS layer
was found at all, and (d) a founder/legal signature on all of it (L-449). This is Very Large, not
because any one piece is unsolvable, but because the work is heterogeneous, per-island, and gated on
legal research that this audit is explicitly not authorized to perform as engineering.

---

## Recommendation: **Research first** — specifically, three narrow, bounded research spikes, not a build

1. Verify whether any island's PTI *normativa* (the legal text, not the geometry) has ever been
   digitized as structured data anywhere (island council open-data portals, `dadesobertes.caib.es`) —
   this session could not reach `dadesobertes.caib.es` (redirect loop) and it was not otherwise probed.
2. Confirm AESA's actual machine-readable access path for obstacle-limitation surfaces (the internal
   memory record for Barcelona notes an AESA KMZ was previously used successfully elsewhere in this
   project — if that pattern transfers, Balears airports may be closer than this audit could confirm
   live).
3. Confirm MITECO's DPMT WFS/download actually clips to and resolves for Balears coordinates, since
   the page text asserts national scope without demonstrating a regional query.

**Do not build** a Balears full-determination pipeline on the current evidence — the PTI
category→number mapping and the heritage gap for 3 islands are not engineering-solvable without
prior legal/document research this audit was not scoped to perform.

---

## PRYZM Readiness Score: **58 / 100**

Reflects: excellent parcel+zoning foundation (already shipped, `open-top-indicative`, census-verified
at 97.1%/74.1%) pulling the score up; the newly-found breadth of *geometric* constraint coverage
(flood GOIB-wide, PTI geometry on all 3 councils, a genuinely rich Eivissa bundle) pulling it up
further versus where the prior internal assessment implied ("six families unmodelled" read as zero
geometry); offset by the still-total absence of any numeric PTI override anywhere, heritage coverage
for only 1 of 4 islands, and unconfirmed airport/coastal machine access — each of which independently
caps the region below Production Ready regardless of the others.

---

## Compare against: Barcelona, Murcia, Zaragoza, Sevilla, Valencia, Granada, Córdoba, Málaga

This audit did not re-verify those regions' current state live; the comparison below is qualitative,
based on what the Balears evidence here demonstrates in relative terms, not a re-scored table:

- **Barcelona** remains PRYZM's most mature Spanish jurisdiction per repo memory (envelope depth+height
  shipped, AESA airport KMZ reportedly already integrated) — Balears's PTI/heritage gaps put it
  behind Barcelona on determination-readiness despite a stronger *zoning-parameter* layer (MUIB's
  fitxa system, per prior census work, out-cites Barcelona's raw article-coverage rate).
- **Murcia, Zaragoza, Córdoba, Málaga** — per repo memory, each carries its own distinct, partially
  resolved blocker (road-axis misreads, vigencia founder-policy gaps, signed-but-narrow gates,
  cross-regional depth vocabulary). Balears's blocker profile (geometry-rich but numerically-empty
  PTI layer, heritage absent for 3/4 islands) is a *different shape* of gap than any of those —
  it is not primarily a data-quality problem, it is a **structured-data-does-not-exist-yet** problem
  for the PTI numeric layer specifically.
- **Sevilla, Valencia, Granada** — not independently assessed in this session; no comparison claim made.

The one meaningful comparative finding from this audit: Balears is the **first region in this
programme** (per files read this session) where three separate sub-national bodies (GOIB + 2 of 3
island councils) each independently publish live, queryable planning geometry for the *same*
constraint family (PTI) with **no shared schema** between them (`ptm_cat` vs `or007ntt_entitats_categ_sr`
vs GOIB's Eivissa-specific layer names) — a fragmentation risk future work should flag explicitly
rather than assume a single Balears-wide PTI reader could serve all islands.

---

## Final verdict

**Illes Balears remains correctly gated at `open-top-indicative`.** This audit adds real, verified
evidence that the geometric side of several "unmodelled" constraint families is more reachable than
the existing internal documentation implied — but it also surfaces, more precisely than before, that
**the actual blocking gap is semantic, not geometric**: every PTI/heritage/flood layer found publishes
a category or a boundary, and translating that into a numeric height/FAR/setback consequence requires
reading unstructured legal text per island, which nobody has done yet.

**Single biggest blocker to reaching a full determination:** there is no structured mapping,
anywhere, from a PTI land-category code (Mallorca's `ptm_cat`, Menorca's `or007ntt_entitats_categ_sr`,
or Eivissa/Formentera's equivalent) to the numeric building-parameter override that category imposes.
Until that mapping exists — built from each island's own PTI normativa text, verified, and
legally signed off — a Balears envelope must remain an open top, no matter how good the underlying
MUIB fitxa parameter system gets, because the PTI override "can only reduce" what the fitxa says and
PRYZM cannot currently state by how much, or whether at all, for any given parcel.

---

**Related**: `docs/04-reference/jurisdictions/es/es-ib/BALEARS-MUIB-ASSESSMENT.md` ·
`packages/site-parcel-data/src/rulepacks/esBalearsMuib.ts` ·
`packages/site-parcel-data/src/rulepacks/openTopIndicative.ts` · ADR-0293 · L-449
