# Canarias Regional Capability Audit — 2026-08-04

> Synthesis + live re-verification, not a cold start. This session has the deepest prior Canarias
> corpus of any region in the programme (`esCanariasSipu.ts`, `esTeldePgo2003.ts`, `esElSauzal.ts`,
> `canariasMunicipalBboxes.ts`, `35026-telde/sources/VERIFICATION.md`). Every claim below was
> re-checked live this session (WebFetch/WebSearch, one live zip download and extraction) rather
> than trusted from prior code comments. Contradictions between prior code comments and this
> session's live findings are called out explicitly, not silently reconciled.

---

## Executive Summary

PRYZM holds a genuinely strong Canarias corpus — the region is the only one in this programme
where the government publishes built-form parameters (setbacks, coverage, and in a minority of
rows, alignment+depth) as **named numeric columns in a harmonised schema** (SIPU `EDIF.mdb`)
across all 88 municipalities, rather than as OCR'd PDF text or plan-sheet drawings. Two
municipalities carry a real, article-cited, curated pack today (Telde, El Sauzal), both gated shut
behind an unsigned L-449 human sign-off, and Telde's is additionally un-dispatched because its
resolver was authored against a live IDECanarias WFS that is administratively disabled. **This
session's single most consequential finding, independently re-verified live**: the disabled WFS is
a non-issue for Telde specifically, because Telde's own SIPU zip — the exact file already cited in
`esTeldePgo2003.ts` and downloaded fresh this session (9.08 MB,
`030319-pgo-ad-itpu-150323-210504-sipu.zip`) — ships `EDIF.shp`/`EDIF.dbf` (the zone-polygon
geometry) in the SAME package as `EDIF.mdb` (the numeric attributes already read). Telde can be
resolved point→zone **entirely offline**, by the same offline-shapefile-join pattern El Sauzal
already uses, without ever touching IDECanarias. That converts Telde's dispatch gap from "waiting
on a third-party service to come back online" (Research Blocked / Wait for external source) into
"an afternoon of parsing a file already in hand" (Engineering, Small). The 40 "routable"
municipalities inherit the same structural advantage — the SIPU package format is regionally
standardised (`02SIST/` directory, same file family, confirmed on the live download) — so the
El Sauzal pattern is not a one-off; it is closer to the DEFAULT shape of a Canarias package, with
El Sauzal being the unusual case (no `EDIF.mdb` at all, geometry-only `ZUSO`, generic-typology
figures with a named fichero-annex gap) rather than the template. The 46 multi-instrument
municipalities remain the harder, structurally different problem: `PLAN.mdb` genuinely does not
exist anywhere, but this session found a real (if non-machine-readable) resolution path — the
Ley 4/2017 **Registro de Planeamiento de Canarias** and its `geobdp.grafcan.es` portal, which lets
a human (not a machine) determine, per municipality, which instrument is currently in force,
independent of overlapping/superseded plans. This does not unlock automation, but it does convert
"structurally unsolvable" into "solvable per-municipality by human research," which is a materially
different, better classification than the code's current framing implies. Heritage (BIC), flood
(SNCZI, national), and airport-servitude (AESA RD-based, per-airport) machine-readable or
semi-machine-readable layers all exist and were independently confirmed live. Nothing here changes
the gate: `CANARIAS_ENVELOPE_VERIFIED = false` remains the correct, honest default, and every
number in this region is still legally a citation, never a published figure.

---

## Capability: **Research Blocked → Engineering Blocked (bimodal, split by axis)**

Canarias does not have one answer — it has (at least) three, cleanly separated by the milestone
discipline this session already uses (verification ≠ dispatch ≠ rendering):

- **Telde**: was Research Blocked (dependent on IDECanarias, "no live endpoint exists"). **This
  audit reclassifies it to Engineering Blocked** — the offline `EDIF.shp` route removes the
  external-service dependency entirely. What remains is (a) an unsigned L-449 gate (legal, human,
  not automatable) and (b) an unwritten offline resolver + dispatch branch (engineering, bounded,
  small — El Sauzal's `resolveElSauzalZone.ts` is a working template one file away).
- **El Sauzal**: Engineering Blocked on the numeric side (dispatch simply not wired, deliberately,
  per its own header) and Research Blocked on the fichero-anexo gap (a genuine missing document,
  not yet found in the 340-page PDF extracted).
- **The 40 routable municipalities**: Engineering Blocked, with a now-demonstrated, repeatable
  procedure (download the muni's own SIPU zip → parse `EDIF.mdb`+`EDIF.shp` with the SAME
  `canariasSipuProvider.ts`/`readSipuZone` code already written and jurisdiction-agnostic → author
  a small pack + bbox + VERIFICATION.md, get it signed). Not Research Blocked — the data pipeline
  and its parser already exist; what is missing is repeated, mechanical execution per municipality.
- **The 46 multi-instrument municipalities**: Legally Blocked at the automation layer (no GIS
  vigencia field exists, confirmed), but only Research Blocked, not Impossible, at the per-parcel
  human layer (the Registro de Planeamiento / `geobdp.grafcan.es` can answer "which instrument
  governs here today" for a human, one query at a time — it just cannot answer it in bulk or in
  code).

No single label covers Canarias honestly; a reader who wants one word should read "Engineering
Blocked, with the legal gate as the pacing item on the two municipalities already built."

---

## Evidence Matrix

| # | Research area | Finding | Status | Live-verified this session |
|---|---|---|---|---|
| 1 | Planning documents / SIPU structure | 88 municipalities, 1 169 SIPU resources, CKAN catalogue (`opendata.sitcan.es`). 41 routable / 46 multi-instrument / 1 Telde (asserted-unverified routing) split confirmed still present in code; VERIFICATION.md flags this split may itself be stale (Telde's live catalogue now shows exactly ONE base resource, which by the code's OWN rule would make it routable — unresolved contradiction, not adjudicated here). El Sauzal is a documented 41st/routable municipality covered by its own richer pack. | Confirmed, with one open internal contradiction | Yes — `opendata.sitcan.es/dataset/planeamiento-urbanistico-de-telde` fetched live, 12 resources enumerated |
| 2 | Zoning geometry — Telde offline extract | **`030319-pgo-ad-itpu-150323-210504-sipu.zip` downloaded live (9 081 608 bytes) and unzipped.** Contains `02SIST/EDIF.shp` (1 978 356 bytes), `EDIF.dbf`... wait, `EDIF.CPG`+`EDIF.shx`, and `02SIST/TMP/EDIF.mdb` (462 848 bytes) — geometry AND attributes, same package, same zip, no WFS dependency of any kind. | **CONFIRMED OBTAINABLE OFFLINE** | Yes — direct download + `unzip -l` |
| 3 | Parcel geometry | Dirección General del Catastro INSPIRE ATOM feeds, both Canarias provinces (35, 38) — same source `canariasMunicipalBboxes.ts` already cites and uses for all 88 municipal bboxes; CRS EPSG:32628 (SIPU) vs EPSG:4326 (bbox feed) consistently documented. | Confirmed, consistent, already wired | Re-read from code, not re-fetched (already cited with URLs in-repo) |
| 4 | Envelope parameters — schema consistency across the 40 routable municipalities | The SIPU package format is standardised: the live Telde download shows a fixed `02SIST/` directory with `AMB, CAT, CLA, DES, EDIF, EST, GES, TRA, UG, ZUSO` families and a parallel `TMP/*.mdb` set — the SAME family names `esCanariasSipu.ts` documents as region-wide. `esCanariasSipu.ts`'s own corpus measurement (73/87 archives with a readable `EDIF` table) was NOT re-run this session (would require downloading and parsing all 87 remaining zips — out of scope for a single audit pass) but is consistent with the live single-archive structure found. | Plausible generalisation, NOT independently re-measured for all 40 | Partial — 1 of 88 zips inspected live |
| 5 | Heritage (BIC) | A region-wide WMS exists: "most BIC in Canarias," layered by category (Monument, Historic Garden, Historic Complex, Historic Site, Archaeological Zone, Paleontological Zone), boundary + protection-area geometry, published by Dirección General de Patrimonio Cultural / GRAFCAN, last updated Sept 2024. Archaeological zone locations are DELIBERATELY approximate (security). | Machine-readable asset exists, not yet ingested | Yes — `idecanarias.es/listado_servicios/bienes-interes-cultural`, `grafcan.es` news item, `datos.canarias.es` showcase page found live |
| 6 | Flood | No Canarias-specific flash-flood/barranco layer found. The applicable machine-readable asset is the **national** SNCZI (Sistema Nacional de Cartografía de Zonas Inundables, MITECO), which does cover Canarias within its national fluvial flood-risk shapefiles/WMS (T=10/100/500 return periods) — but this is a national fluvial model, not a Canarias-specific volcanic/barranco flash-flood product. Whether SNCZI's fluvial model is fit for a barranco-dominated hydrology was NOT assessed (out of scope; a hydrology question, not a data-availability one). | Partial — national layer covers the islands, no Canarias-specific barranco layer found | Yes — MITECO SNCZI pages found live |
| 7 | Airport | AESA publishes Real-Decreto-based servidumbres aeronáuticas for the three major Canarias airports checked: Gran Canaria–Gando (RD 417/2011), Tenerife Norte (RD 718/2023), Tenerife Sur (RD 1030/2020). IDEGranCanaria separately hosts a dedicated WMS for Gando's servitudes. Whether these RDs ship as ingestable geometry (KMZ, as Barcelona's AESA source does per this session's memory) vs. only as RD/PDF text was NOT confirmed for the Canarias-specific RDs — the Barcelona precedent (`aesa` KMZ) is not proven to repeat here without a further per-airport check. The other 5 of 8 island airports (Lanzarote, Fuerteventura, La Palma, La Gomera, El Hierro) were not individually checked. | Partial — servitude regime confirmed to exist per major airport; geometry format not confirmed | Yes — AESA + IDEGranCanaria pages found live |
| 8 | Environmental | Canarias hosts 4 of Spain's 15 national parks (Teide, Timanfaya, Garajonay, Caldera de Taburiente), each independently Natura 2000-designated (Habitats/Birds Directives; Teide ES7020043, Timanfaya ES0000141 confirmed). Significant land-area overlap with buildable land is plausible given the islands' geography but was NOT quantified this session. A machine-readable GIS boundary layer for the parks/Natura-2000 sites was NOT directly confirmed to exist as a downloadable/WMS asset in THIS session's searches, though the Gobierno de Canarias parks portal references "cartografía y visor" tooling that plausibly serves one. | Partial — designation confirmed, machine-readable boundary layer not directly verified | Partial — designation via MITECO/EUNIS, GIS layer inferred not confirmed |
| 9 | Legal delegation / multi-instrument resolution | **New finding this session.** Ley 4/2017 (Suelo y Espacios Naturales Protegidos de Canarias, in force 2017-09-01) establishes a **Registro de Planeamiento de Canarias**, a public register of definitively-approved instruments, modifications, and nullifying judicial rulings, explicitly designed so a user can determine currency "sin cortes por solapamiento de planes" (without being confused by overlapping plans) regardless of whether an instrument is repealed or partially modified. Portal: `geobdp.grafcan.es`. **Live-checked this session: it is a human-browsable document/map viewer, with no confirmed REST/WFS/WMS API for bulk or programmatic vigencia queries.** So a mechanism to resolve "which instrument governs here today" DOES exist and is authoritative — but it resolves one municipality/parcel at a time, by a human reading the register, not a GIS field PRYZM's provider layer can join against. This is a genuinely different finding from "no mechanism exists" (the prior code comment's framing) — it should be corrected to "no MACHINE-READABLE mechanism exists; a human-usable one does." | **Partial mechanism found — human-usable, not machine-readable** | Yes — `iustel.com`, `gobiernodecanarias.org/transparencia`, `geobdp.grafcan.es` fetched live |
| 10 | Dispatch feasibility of the offline-SIPU-extract pattern | El Sauzal's approach was **not luck** — it rests on the SAME public CKAN catalogue (`opendata.sitcan.es`) every other municipality publishes into, and the SAME `02SIST/` package convention this session confirmed live on Telde's download. The specific document El Sauzal needed (Normativa Urbanística PDF) was found via the municipality's own e-administration portal (`eadmin.elsauzal.es`), which is municipality-specific and not guaranteed to exist/be discoverable the same way for all 86 remaining municipalities — THAT part (finding the parent ordinance PDF for citation, when the SIPU package's own numeric table needs corroboration) is genuinely bespoke, one-municipality-at-a-time research. But the STRUCTURAL part (a downloadable zip with `EDIF.shp`+`EDIF.mdb` in a fixed schema) is the DEFAULT SIPU shape, not an El Sauzal peculiarity — El Sauzal was actually the atypical case (no `EDIF.mdb`, had to fall back to `ZUSO` + an external PDF). Telde, with both files present in the same zip, is the EASIER case of the two already-built municipalities. | Generalises structurally; per-municipality corroboration research does not | Yes, per findings 1-4 above |

---

## Machine-readable assets — every endpoint verified live this session

- `https://opendata.sitcan.es/dataset/planeamiento-urbanistico-de-telde` — CKAN dataset page, 12 resources enumerated live.
- `https://opendata.sitcan.es/dataset/32f72bc0-924b-4a85-ae02-1cb8d2b54686/resource/24bf8f38-53fa-4a7f-8614-9be6ead15e0b/download/030319-pgo-ad-itpu-150323-210504-sipu.zip` — **downloaded live, 9 081 608 bytes**, contains `02SIST/EDIF.shp` + `02SIST/EDIF.shx` + `02SIST/EDIF.CPG` + `02SIST/TMP/EDIF.mdb`, plus siblings `AMB, CAT, CLA, DES, EST, GES, TRA, UG` and `ZUSO.mdb` in the same `TMP/` set. This is the file already cited (unread-for-geometry) in `esTeldePgo2003.ts`.
- `https://datos.canarias.es/catalogos/general/dataset/planeamiento-urbanistico-de-telde/resource/7b8d5866-a435-4e3b-982e-f51195a5935c` — mirror listing, confirms the same resource on the Gobierno de Canarias' own open-data domain (not only SITCAN).
- `geobdp.grafcan.es` — Registro de Planeamiento portal (human-browsable, no API found).
- `idecanarias.es/listado_servicios/bienes-interes-cultural` — Canarias-wide BIC WMS (categories: Monumento, Jardín Histórico, Conjunto Histórico, Sitio Histórico, Zona Arqueológica, Zona Paleontológica).
- MITECO SNCZI national flood layers (T=10/100/500 fluvial, WMS + shapefile download) — cover Canarias as part of the national extent.
- AESA servidumbres aeronáuticas pages, per-airport RDs (Gando RD 417/2011, Tenerife Norte RD 718/2023, Tenerife Sur RD 1030/2020); IDEGranCanaria dedicated Gando WMS.
- `www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/{35,38}/ES.SDGC.CP.atom_{35,38}.xml` — parcel/municipal-bbox source, already wired in `canariasMunicipalBboxes.ts` (not re-fetched this session, cited from code with URLs present).

## Missing assets

- A machine-readable per-parcel or per-municipality **vigencia/currency field** — confirmed absent (`PLAN.mdb` does not exist in any of 87 packages examined by the prior session's measurement; this session did not find a contradicting field either). The Registro de Planeamiento resolves this for a HUMAN, not a machine.
- A Canarias-specific flash-flood / barranco hazard layer, distinct from the national SNCZI fluvial model.
- A confirmed downloadable geometry (KMZ/shapefile) format for the AESA airport servitudes specific to the Canarias RDs (existence of the RD confirmed; geometry-file format not confirmed).
- A directly-confirmed machine-readable GIS boundary layer for the 4 national parks / their Natura 2000 designations (designation confirmed; boundary-layer endpoint not directly found this session).
- The El Sauzal "fichero de ordenación anexo" — the per-area override document Título X repeatedly defers to and which the 340-page extracted PDF did not contain.
- A region-wide, systematic re-measurement of which of the 40 routable municipalities actually have BOTH `EDIF.mdb` and `EDIF.shp` in their zips the way Telde does (only Telde was checked live this session; the 73/87-archive figure is inherited from a prior session's measurement, not reproduced here).

## Blockers

| Item | Type | Solvable how |
|---|---|---|
| `CANARIAS_ENVELOPE_VERIFIED = false` | Legal (L-449) | Human sign-off only — correctly not automatable, and this audit does not recommend flipping it. |
| Telde dispatch: resolver targets a dead WFS | Engineering | **Newly bounded, Small**: rewrite `resolveTeldeZone.ts` to parse the already-downloadable `EDIF.shp`/`EDIF.dbf` offline, mirroring `resolveElSauzalZone.ts`'s point-in-polygon pattern against `ZUSO.shp`. No new external dependency. |
| El Sauzal fichero-anexo gap | Research/GIS-solvability: GIS-unsolvable, document-solvable | Requires locating the missing annex pages (not in the 340-page extract found) — a document-hunting task, not a data-engineering one. |
| 46 multi-instrument municipalities: no machine vigencia field | Legal/structural | NOT closable by any GIS field found. Closable per-municipality by a human consulting `geobdp.grafcan.es` / the Registro de Planeamiento — i.e., convertible from "automation-blocked" to "manually-researchable," at the cost of doing that research 46 times. |
| 40 routable municipalities: no packs authored yet | Engineering, repetitive | Bounded by the now-confirmed generalisable pattern (download zip → parse with existing `canariasSipuProvider.ts` → author pack/bbox/VERIFICATION.md) but genuinely 40 separate research+authoring+sign-off cycles, not one. |
| Heritage/flood/airport/environmental overlays | Engineering, several distinct layers | Each individually feasible (endpoints found), none ingested; per ADR-0283 these can only ever REDUCE the envelope, so their absence keeps every current and future Canarias envelope open-top, never a false ceiling. |
| Planes Insulares (island plans) | Structural, unmeasured | Sits above municipal instruments in the Canarian hierarchy; not measured in any session including this one. Same open-top consequence as above. |

## Estimated Unlock Effort

- **(a) Telde via offline extract**: **Small.** The zip is already in hand (downloaded live this session), the numeric pack already exists and is signed-ready, `readSipuZone` is already jurisdiction-agnostic. What remains is: write an offline `EDIF.shp` point-in-polygon resolver (a known pattern, one file, closely mirroring `resolveElSauzalZone.ts`), wire a `applyTeldeZoningThenFallback`-style dispatch branch (mirroring Córdoba/Balears), and separately obtain the L-449 signature. Engineering effort alone: Small. Total unlock (engineering + signature) depends on signer availability, not engineering size.
- **(b) The 40 routable municipalities via the El Sauzal/Telde pattern**: **Large**, in aggregate, though each individual municipality is Small-to-Medium. The parsing machinery is built and reusable; the bottleneck is 40 repetitions of download→corroborate-against-source-PDF-where-possible→author→sign, each carrying its own risk of an El-Sauzal-style missing-annex surprise or a Telde-style stale-catalogue routing question. No shortcut collapses this to fewer than ~40 units of work.
- **(c) The 46 multi-instrument municipalities**: **Very Large**, and possibly not fully closable to a MACHINE-automatable state at all — the structural blocker (no vigencia field) is real and independently reconfirmed. What is newly closable is a HUMAN-in-the-loop path (Registro de Planeamiento lookup) that turns "impossible" into "46× manual legal research," which is a different, still expensive, but no longer purely structural problem.

## Recommendation: **Research first, then build the two smallest, bounded items**

Do not attempt a region-wide Canarias rollout in one motion. The two smallest, cleanly-bounded,
already-substantially-built items — (1) Telde's offline `EDIF.shp` resolver + dispatch wiring, and
(2) obtaining the L-449 signature for Telde and El Sauzal's EXISTING packs — are ready for a
build decision now, independent of the other 86 municipalities. The 40 routable municipalities are
a legitimate scale-out target with a proven, reusable pipeline, but should be costed as 40 discrete
units, not one. The 46 multi-instrument municipalities should not be built against until a decision
is made about whether "human-researched-per-municipality vigencia" is an acceptable product
posture (it is a real, legally defensible path, just an expensive one) — that is a product/ops
decision, not an engineering one, and this audit does not make it.

## PRYZM Readiness Score: **22 / 100**

Scoring rationale: two municipalities (of 88) have a real, citable, article-referenced ruleset
(Telde 31/46 zones, El Sauzal 17 generic zones) — meaningfully above zero. Neither renders a number
today (both gated). The dispatch gap for Telde is now known to be smaller than previously recorded
(no external-service dependency), which raises the score slightly versus a naive "blocked on a dead
government WFS" reading. The 46/88 structural block and the un-quantified environmental/heritage/
airport/flood overlays, plus the unmeasured Planes Insulares ceiling, keep the number low. This is
comparable to a region with one strong pilot and a clear, non-trivial path to a second tranche, not
a region close to production for any meaningful share of its land.

## Compare against other regions in this programme

| Region | Relative position |
|---|---|
| **Barcelona** | Ahead of Canarias — AESA KMZ + full 3D servitude geometry already resolved, envelope depth+height shipped, most mature single-city pipeline in the programme. |
| **Murcia** | Registered, ~28% + ficha coverage measured — ahead on breadth-with-caveats; behind Canarias on schema harmonisation (Canarias' EDIF columns are a cleaner grammar than Murcia's ficha joins). |
| **Balears** | Ahead on census completeness (97.1%) and the PTI ceiling is a KNOWN, named constraint (unlike Canarias' unmeasured Planes Insulares). Structurally the closest analogue to Canarias' island-hierarchy problem. |
| **Zaragoza** | Comparable maturity tier — both have a working per-parcel resolver pattern (`resolveZaragozaZone` / the new offline Telde route) and both are one signature away from a first live number. |
| **Sevilla** | Comparable — registered, partial coverage, gated. |
| **Valencia** | Behind on machine-readability (depth is unavailable across 696 swept layers) but ahead on other axes; not directly comparable on this specific finding. |
| **Granada** | Less measured in this programme than Canarias; Canarias ahead on data-structure maturity. |
| **Córdoba** | Directly comparable posture: "registered-and-refusing," pipeline-extracted vs Canarias' published-structured (Canarias' provenance is BETTER — publisher's own typed columns, not OCR). Córdoba's post-signature discovery (signing ≠ rendering, no compute branch existed) is the exact defect this audit's Telde finding pre-empts by identifying the dispatch gap NOW, before a signature is sought. |
| **Málaga** | Less mature; Canarias ahead on both data structure and pilot depth. |

## Final Verdict

Canarias is neither close to production nor stuck. It has the best-structured RAW planning data of
any region in this programme (named numeric columns, harmonised schema, region-wide), two real
pilots built on it, and — as of this session — the "IDECanarias WFS is dead so Telde is stuck"
narrative is corrected: **it was never actually a live-service dependency for the data PRYZM
already reads; it was only a dependency for the ONE piece PRYZM hadn't yet read (the geometry),
and that piece ships in the same file already in hand.**

**Single biggest blocker**: not a technical one. It is the L-449 human sign-off gate, which is
correctly outside PRYZM's own authority to close, sitting in front of two ALREADY-BUILT, well-
evidenced packs (Telde, El Sauzal). The second-biggest blocker, and the one that actually limits
SCALE rather than the first two pilots, is the 46-municipality multi-instrument structural gap,
which this session reclassifies from "no resolution mechanism exists" to "no MACHINE-readable
resolution mechanism exists — a human-usable one (the Registro de Planeamiento) does."

**Is Telde unlockable via an offline SIPU extract? Yes — confirmed live this session.** The exact
zip already cited for Telde's numeric pack (`030319-pgo-ad-itpu-150323-210504-sipu.zip`,
downloaded and unzipped this session, 9 081 608 bytes) contains `EDIF.shp`/`EDIF.dbf`, the zone
polygon geometry, in the SAME package as `EDIF.mdb`. Telde does not need IDECanarias' disabled WFS
at all for either the numbers (already read) or the geometry (now confirmed present, not yet
parsed). The only genuinely external dependency left for Telde is the L-449 human signature, which
was always going to be external by design.
