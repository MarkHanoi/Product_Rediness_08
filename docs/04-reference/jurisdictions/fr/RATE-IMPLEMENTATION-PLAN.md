# Rate Implementation Plan — France (`fr`) national — C63 per-axis roadmap

<!-- Sibling of COUNTRY-RATE.md (the C63 composite master this plan drives) and RATE.md (the legacy
national LEGISLATION structured-fill number). The sequenced per-AXIS climb from the CURRENTLY-ASSESSED
state to the MAXIMUM C63 completion achievable in scope. Standard:
docs/04-reference/jurisdictions/README.md §"RATE-IMPLEMENTATION-PLAN.md". Reusable cross-country method:
../_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md. Model peer: ../pt/RATE-IMPLEMENTATION-PLAN.md.
§CONTEXT-DATA-HONESTY: this is a PLAN. It changes NO RATE % cell — every "→" below is an honest
ESTIMATE of a jump that WOULD land when the work is done and RATE.md is re-derived from real checks,
never a claim the cell has already moved. -->

**Drives:** the C63 composite [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city 7-axis roll-up) ·
**Current composite (2 scaffolded cities):** Paris & Lyon = **66 % `partial`** — renormalised over the
**ASSESSED subset only** (DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56); **4 of 7 axes** (PARCEL ·
LEGISLATION · ENVELOPE · HEIGHTS/LOD) are honestly **`not-assessed`**, not 0 % (C63 §1.2/§1.5) ·
**Realistic composite ceiling (no national CNIG SRU):** ~68–80 % per pilot city · **Theoretical
ceiling (full SRU):** ~88–92 % · **Gap to Denmark (~96 %):** structural (see §4) ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED · **Status:** RESEARCH COMPLETE + live-probed — pre-implementation

> ⚠ **TWO DENOMINATORS, kept distinct all the way down (the France honesty crux).** France answers two
> different questions at two very different rates, and the LEGISLATION axis is the *numeric* one:
> - **Zone identification: ~95 %** of communes — GPU returns the zone code, the governing document and
>   the règlement PDF filename for every commune with a GPU-published PLU/PLUi (live-probed, Appendix A).
> - **Numeric dimensional fill: ~22 %** (the LEGISLATION headline, the proven minimum) — height / emprise /
>   setback return a machine-readable value for a parcel. For ~95 % of communes these live only in the PDF
>   the first denominator just handed us a *link* to.
>
> Never quote the 95 % zone-ID number as if it were the buildable-rule rate — that conflation is the
> §CONTEXT-DATA-HONESTY failure C58 §1.2/§1.4 forbids. The C63 **LEGISLATION** axis (Axis 2, weight 25 %)
> reads the *numeric* denominator, hardened by the L-449 human gate.

---

## 1 — The ceiling: what "maximum" means for the C63 composite

France's C63 completion splits cleanly along the **portable / human-gated** line that sets the whole
weighting (C63 §4):

- **The five "portable" axes — 55 % of the weight — are all wired or one bake away.** PARCEL (15 %) rides
  the already-live IGN PCI Express provider; DATA-SOURCES (15 %) already reads **80 %**; HEIGHTS/LOD (10 %)
  is measured-**capable** on live BD TOPO `hauteur`; TERRAIN (10 %) is baked (rung 50); CONTEXT (5 %) is
  5/9 layers baked. Every one of these can approach its own ceiling with **measurement or a bake, not new
  law** — this is why France starts strong (Spain-tier physical data; DATA-SOURCES 80 %, above the
  Spanish-mainland 70 % because GPU is a genuine national zone-GIS).
- **The two human-gated axes — 45 % of the weight — are the ceiling.** LEGISLATION (25 %) + ENVELOPE
  (20 %) are **PDF-bound.** The single structural fact: **there is no national height/emprise/setback
  table.** Since loi ALUR (2014) abolished the COS (FAR), density is governed only by height + emprise au
  sol + retraits, and every one of ~34,900 communes (or ~1,200 intercommunal EPCI) writes those three
  numbers in its own prose `règlement écrit` PDF, with its own zone codes. `UA` in one EPCI and `UA` in the
  next are independent local mnemonics — no cross-commune lookup (README §1.2).

Three composite ceilings, honestly separated:

| Path | Composite ceiling | Why |
|---|---|---|
| **Portable axes filled** (Phases A+B: PARCEL measured, HEIGHTS baked, TERRAIN verified, DATA-SOURCES/CONTEXT topped up) with LEGISLATION/ENVELOPE still `not-assessed` | **~55 %** of weight *earned*, composite still `partial` | Measurement + bakes only. Raises the *assessed denominator*, does not yet touch the law. |
| **+ per-EPCI règlement transcription** (Phase C: PLU-OCR pipeline + L-449 gate) on a pilot metro | **~68–80 %** for that city | LEGISLATION climbs to its France ceiling (~30–35 % national / ~55–65 % Lyon) and ENVELOPE follows once a pack is registered. Bounded by human-review throughput, not data existence. |
| **+ full CNIG SRU national rollout** (structured règlement, national) | **~88–92 %** theoretical | Outside PRYZM's control — a national standardisation programme (2 pilot communes as of 2026). Monitor; do not plan around a date. |

**Never 100 %.** Even under full SRU, discretionary layers remain: the ABF (Architecte des Bâtiments de
France) sign-off inside a monument's 500 m *périmètre des abords* is a case-by-case human judgement, not a
number, and Marseille/AMP's *règlement graphique* legally overrides the written table. Those parcels
resolve to a cited **refusal-with-overlay-warning** — which is **100 % honest at 0 % complete** (C63 §3.1)
— never a fabricated figure (C58 §1.4).

---

## 2 — Phase tracker (per-axis, ROI-sequenced)

<!-- Each phase names the C63 axis it converts. "Moves cell" = the honest ESTIMATED jump when the phase
lands and RATE.md is re-derived — NOT a claim the cell has changed. Cheapest ROI first: the already-wired
PARCEL win, then the height/terrain bakes, then the expensive shared OCR investment. -->

| Phase | C63 axis(es) | Goal | Unlocks (moves which cell) | Effort | Dependency | Blocker |
|---|---|---|---|---|---|---|
| **A** | **PARCEL** (15 %) | Run `computeParcelConfidence` + `computeParcelMetrics` over an N-parcel sample inside the Paris (`75056`) and Lyon (`69123`) bboxes. IGN PCI Express (`ign-fr`) is **already wired + live** → this is a *measurement*, not a build | PARCEL `not-assessed`→ a measured % (first human-gated axis assessed; composite renormalises over **4** axes, truer denominator) | **S** (~0.5–1 dev-day) | `parcelProviders/registry.ts` `isInFrance→ign-fr` (DONE, keyless, live); shared `parcelConfidence.ts` | **None** — the unblocked cheap win. PCI graphic-precision (boundaries not survey-precise) caps the score honestly; it is a caveat, not a blocker |
| **B1** | **HEIGHTS/LOD** (10 %) | Land the per-city height bake: BD TOPO `hauteur` + LiDAR HD **nDSM** (`DSM−DTM`→P90) via the **shared ES/FR/PT module — never fork**. Solve §BDTOPO-CAP-TRUNCATE: Paris bbox ≈ 317k buildings, single-shot WFS caps at `limit` → tile/paginate so the bake keeps all, not ~2 % | HEIGHTS `not-assessed (cap)`→ measured `tagged/total` %; **co-benefit** DATA-SOURCES height slot `documented`(0.5)→`live`(1.0) | **M** | Shared **nDSM** module (build ONCE for ES+FR+PT); LiDAR HD dept coverage (progressive); BD TOPO schema re-probe | §BDTOPO-CAP-TRUNCATE pagination; LiDAR HD progressive coverage (verify dept flown); do NOT quote RMSE-Z until measured |
| **B2** | **TERRAIN** (10 %) | Verify **50→100**: `terrain.verify.mjs --tileset` independent-decoder round-trip on the baked Paris & Lyon RGE ALTI tilesets + confirm lit-and-correct (octvertexnormals + `enableLighting`, no white-mask) | TERRAIN rung **50 (baked-unverified)→100 (cross-validated)** | **S–M** | `terrain.mjs` `paris`/`lyon` rows (DONE, source `fr`=RGE ALTI); `terrain.verify.mjs` | High-relief white-mask class (L-636) if it recurs; else none |
| **B3** | **CONTEXT** (5 %) · **DATA-SOURCES** (15 %) | Cheap top-ups riding B1/B2: land the L-642 rail+trees re-bake (config-added, not-yet-landed → CONTEXT 5/9→7/9); confirm `siteDispatch.ts` zone-GIS wiring (DATA-SOURCES regional-GIS slot `documented`→`live`) | CONTEXT 56→ higher; DATA-SOURCES 80→ higher | **S** | `bake.mjs` REGIONS `paris`/`lyon` (DONE); GPU `zone-urba` endpoint (live, Appendix A) | rail+trees re-bake unlanded; `siteDispatch.ts` wiring unconfirmed (why the GIS slot is `documented`, not `live`) |
| **C** | **LEGISLATION** (25 %) · **ENVELOPE** (20 %) | Build the **PLU-OCR rule-extraction pipeline OFF GPU**: GPU serves zoning polygons + PDF links (~95 % of communes) but **not** numbers → one-parser-per-PLU-article (Art. 6/7 retrait, Art. 9 emprise, Art. 10 hauteur) on the **shared `@pryzm/ordinance-extraction` core** → **L-449 human gate** → emit pack. Start **Paris/Lyon**. Per-EPCI leverage (one PLUi doc = 58 Lyon communes at once) | LEGISLATION `not-assessed`→ `verified_cited_claus/total` %; then ENVELOPE `not-assessed`→ solver-coverage % once a pack is registered | **H** — the **shared ES/FR/PT/UK ~65 %-effort core**; France adds only a *French-article-grammar adapter* + enumerator | `@pryzm/ordinance-extraction` core + `pipeline-extracted-unverified` tier (DESIGN SPEC, not built); **L-449** gate; **ADR-0274** (Paris gabarit engine KIND) before Paris ENVELOPE; **ADR-0275** (Marseille graphic-primacy) | OCR throughput bounded by the human gate (not data existence); new engine kinds un-ADR'd; ABF/SUP overlay refusal guard mandatory before any numeric answer near a monument |
| **C+** | **LEGISLATION** ceiling-lift | **CNIG SRU monitor** — ingest a target EPCI the moment it enters the national structured-règlement dataset; transcription cost collapses to an ingestion | LEGISLATION → ~0.85–0.90 (the ~88–92 % composite ceiling) *(conditional)* | national programme | `cnig.fr/cnig/structuration-des-reglements` trip-wire (NEXT.md §4.1) | **BLOCKED** — outside PRYZM control; 2 pilot communes as of 2026. Do NOT plan a date around it |

⚠ Status tracks WORK; a cell only moves when the city's `RATE.md` is re-derived from real checks and the
composite in `COUNTRY-RATE.md` re-rolled. Nothing in this plan asserts a moved cell.

---

## 3 — Per-phase detail

### 3.A — PARCEL: the already-wired cheap win (do this first)

France **removes Portugal's biggest weakness**: PCI Express is national with stable cadastral ids
(département + commune INSEE + section + parcel #), and the `ign-fr` provider is already live in
`parcelProviders/registry.ts` (`isInFrance→ign-fr`, `data.geopf.fr` WFS
`CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`, keyless — the Paris note cites the real
`idu 75104000AE0003`). Axis 1 does **not** measure "is a provider wired" — it measures the **quality
distribution over an N-parcel sample** (`high|medium|low` match × containment × official-area-published),
and **no `computeParcelConfidence` run has been executed** for either bbox (C63 §8). Running it is a
measurement of already-flowing data — the single cheapest axis to convert from `not-assessed` to a number,
with no new build and no human gate. The only honest cap is PCI's graphic-precision caveat (boundaries
predate high-precision aerial photography — same caveat class as Spanish refcat geometry): it lowers the
score truthfully, it does not block the run.

### 3.B — HEIGHTS + TERRAIN: reuse the shared modules, verify the bake

France plugs IGN inputs into the **existing** shared geometry/height plumbing — the only genuinely new
France build is the Phase-C OCR pipeline. **Do NOT one-off any of these per country:**

| Shared module | Method | Reused by |
|---|---|---|
| **nDSM height** | `DSM − DTM` per footprint → **P90** (keep max + point-count for confidence) | ES, FR, PT (L-511c / L-512b) |
| **CHM trees** | veg-class canopy-height model → local-maxima + watershed | ES, FR, PT |
| **Buffered road + terrain drape** | centreline + class → width buffer → junction-fill → drape on DTM | ES, FR, PT |
| **Ortho-sidewalk segmentation** | aerial imagery → sidewalk polygons where no municipal layer | ES, FR, PT |

HEIGHTS has a **higher ceiling than Portugal**: France has *authoritative* BD TOPO footprints AND a second
`hauteur` field to cross-check the nDSM against (PT LiDAR height stands alone). The bake blocker is purely
mechanical — §BDTOPO-CAP-TRUNCATE — solved by tiling the WFS fetch. TERRAIN is already baked from RGE ALTI;
Phase B2 is a *verification* (round-trip decode + lit-render), not a re-bake, unless the L-636 white-mask
class recurs.

### 3.C — LEGISLATION + ENVELOPE: the shared, human-gated OCR investment

**One-parser-per-PLU-article** is the extraction unit. A French PLU règlement is structured by article
number (the 2015+ modernised PLU keeps a stable article grammar per zone) — so build **one parser per
article, reused across every commune**, not one bespoke reader per PLU:

| PLU article | Governs | Extractor output (C58 field) |
|---|---|---|
| **Art. 6** | implantation par rapport aux **voies** (street setback) | `setback.front_m` |
| **Art. 7** | implantation par rapport aux **limites séparatives** (side/rear) | `setback.side_m` / `setback.rear_m` |
| **Art. 8** | implantation des constructions les unes par rapport aux autres | (inter-building spacing) |
| **Art. 9** | **emprise au sol** (ground coverage) | `maxCoverage` |
| **Art. 10** | **hauteur maximale** (max height) | `maxHeight_m` |
| **Art. 14** | (pre-ALUR COS) | `n/a — abolished loi ALUR 2014` |

This maps onto the **shared `@pryzm/ordinance-extraction` core** (`../../standards/ORDINANCE-EXTRACTION-PIPELINE.md`):
Stages 1–6 (profile → OCR/text-pull → dual-pass → cross-checks → **L-449 human gate** → emit pack at
`pipeline-extracted-unverified`) are **identical across ES/FR/PT/UK** — the *enumerator* differs per city;
the *extraction + verification core is horizontal* (that doc §1). **France's marginal build is only a
French-article-grammar adapter** (Art. 6/7/9/10 → C58 fields), which is why Phase C is scored as the
**shared ~65 %-effort investment, amortised across four countries — build once**. The algorithm-detector is
essential here: French règlements frequently say *"hauteur résultant de l'application du gabarit"* — emit
`null`/`derived`, never a number.

**Per-EPCI is the leverage multiplier.** Live-probed: the Lyon zone carries `partition = DU_200046977`
(Métropole de Lyon) — a **single** `200046977_reglement_20260326.pdf` for all **58** communes. Transcribe
that one document and every parcel in 58 communes gains its numbers at once. The right unit of work is the
**~1,200 EPCI**, not the ~34,900 communes; the INSEE join key must carry the comma-separated commune list
per PLUi (NEXT.md §4.4).

**The overlay guard is not optional.** Each harvest row is a *separate* query — the base zone query does
not carry the others. A height resolved inside an ABF perimeter without checking the SUP layer is
confidently-wrong in a way invisible to the engine. Phase C wires the SUP query (`assiette-sup-s`,
`Périmètre des abords` — 66 assiettes live-probed for Paris, Appendix A) **before** any numeric answer and
returns a refusal-with-overlay-warning on intersection. **ENVELOPE** additionally needs the new engine
KIND per city — Paris a reference-surface + relative-formula *gabarit* kind (ADR-0274), Marseille a
graphic-primacy precedence kind (ADR-0275) — **before** a pack; these are envelope-*shape* work, orthogonal
to LEGISLATION fill.

---

## 4 — The gap to Denmark (~96 %)

Denmark hits ~96 % because Plandata delivers zone + numeric density + height as **structured national
fields** — almost no query reads a PDF. France's gap is squarely reason **(a) numbers are in PDFs, not
structured fields**, compounded by **(b) fragmentation across ~1,200 EPCI** (the reader is one; the
règlements are ~1,200). It is *not* reason (c) licence/geo-fence: every national layer is open (Etalab 2.0 /
ODbL), unlike the geo-fenced feeds elsewhere. France thus has **world-class geospatial infrastructure with
the numbers deliberately left in prose** — the inverse of a licensing problem, and the reason the composite
ceiling is transcription-throughput-bound, not access-bound. On the C63 axes this reads directly: the five
portable axes port to Denmark-parity cheaply; the two human-gated axes (45 % of weight) carry the entire
gap.

---

## 5 — Dependencies, blockers, cross-jurisdiction reuse

**Hard dependencies (resolve in order):**
- **Phase A before nothing** — it is the unblocked first move; run it independently of everything else.
- **Phase B1 nDSM depends on the shared ES/FR/PT module** — do not fork; if ES or PT builds it first,
  France feeds different IGN inputs into the same module (NEXT.md §4.3 trip-wire).
- **Phase C depends on `@pryzm/ordinance-extraction`** (DESIGN SPEC, not built) + the
  `pipeline-extracted-unverified` confidence tier (WIRING TODO). France is a **new enumerator + a
  French-article grammar adapter** on that core — the same reuse argument that makes Córdoba cheap after
  Barcelona.
- **L-449 human-verification gate** — no French pack ships above `pipeline-extracted-unverified` without a
  recorded human sign-off (`sources/VERIFICATION.md`, currently OPEN for Paris and Lyon). Non-negotiable.
- **ADR-0269 (curate-then-serve)** — serve no PLU value not verified against a citable governing article.
- **ADR-0274 / ADR-0275** — Paris ENVELOPE needs the gabarit KIND; Marseille needs graphic-primacy. Both
  need the ADR *before* the KIND, and the KIND *before* the pack. Envelope-shape work, orthogonal to the
  LEGISLATION fill rate.

**Current blockers (measured):**
- §BDTOPO-CAP-TRUNCATE — a naïve single-shot Paris bake deletes ~98 % of buildings (WFS `limit` cap).
- LiDAR HD is **progressive** (~80 % metro end-2025, full national end-2026) — verify department coverage
  before a site depends on it; do NOT quote an RMSE-Z until measured against known buildings.
- `siteDispatch.ts` zone-GIS wiring **unconfirmed** — why DATA-SOURCES scores the regional-GIS slot
  `documented` (0.5), not `live` (1.0).
- CNIG SRU at 2 pilot communes — the national ceiling-lift is BLOCKED outside PRYZM control (monitor only).

**Cross-jurisdiction reuse (build once):**
- The **PLU→OCR / rule-extraction core** is the **same shared ES/FR/PT/UK investment** — the ~65 %-effort
  horizontal core; France adds only the French-article-grammar adapter. Do not build it Paris-specific.
- The **nDSM / CHM / buffered-road / ortho-sidewalk** modules are shared with ES and PT — France plugs IGN
  inputs, adds no pipeline.
- The **per-EPCI multi-commune INSEE join** generalises to any EPCI-fragmented, PDF-bound jurisdiction.
- Pattern comparison: France's GPU pattern (zone polygon + PDF → OCR extraction) is the reference the PT
  SNIT adapter (`../pt/RATE-IMPLEMENTATION-PLAN.md`) maps onto — if the apicarto-style pattern is confirmed
  for SNIT, the France adapter logic may port directly.

---

## Appendix A — Live-probe evidence (2026-07-24)

All asserted on Content-Type + body; endpoints returned JSON/GeoJSON with the fields shown. No value below
is inferred. This is the evidence base for the "physical layers strong, numbers in PDFs" ceiling — it does
**not** move any RATE cell.

| Endpoint · query | Result (verbatim sample) | What it proves |
|---|---|---|
| `apicarto.ign.fr/api/gpu/zone-urba` · Paris `2.3470,48.8530` | `libelle='UG'`, `libelong='Zone urbaine générale'`, `typezone='U'`, `nomfic='75056_reglement_20260616.pdf'`, `urlfic=''`, `idurba='75056_PLU_20260616'` | Zone code + règlement PDF filename present; **NO numeric height/emprise/setback field**; `urlfic` empty (PDF located via `nomfic`). The core PDF-bound finding — the LEGISLATION-axis blocker, confirmed. |
| `apicarto.ign.fr/api/gpu/zone-urba` · Lyon `4.8357,45.7640` | `libelle='UCe1b'`, `partition='DU_200046977'`, `nomfic='200046977_reglement_20260326.pdf'`, identical CNIG schema | Lyon uses the **same national schema with no structured height**; one PLUi doc for the whole Métropole (per-EPCI efficiency). |
| `data.grandlyon.com/geoserver/metropole-de-lyon/ows` · `plu_h_opposable.pluhauteur` | layer **exists**; feature `hauteur='16'` (m), `last_update='2019-02-18'` | The **one Tier-1 structured-height** French case — but on Lyon's **local** portal, **not** national GPU. Lyon = cheapest LEGISLATION win **and** needs a second data source. |
| `data.geopf.fr/wfs` · `BDTOPO_V3:batiment`, Paris bbox | 5/5 features non-null: `hauteur` ∈ {9.5, 21, 9.6, 22.4, 21.7} m, `nombre_d_etages` ∈ {3,6,1,7,5}, `usage_1` | LOD1 context massing (real building heights) is **live today** — the HEIGHTS axis is measured-*capable* now. |
| `apicarto.ign.fr/api/gpu/assiette-sup-s` · Paris `2.3470,48.8530` | **66** servitude assiettes incl. multiple `typeass='Périmètre des abords'` (ABF heritage) | The ABF/heritage overlay **IS queryable** via a *separate* SUP call — build the ENVELOPE overlay refusal on this. |
| `data.geopf.fr/wfs` · `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`, Paris bbox | 1 parcel: `section='BQ'`, `numero='0046'`, `code_dep='75'`, `nom_com='Paris'`, `code_com='056'` | Parcel geometry + cadastral ref **live** — the PARCEL axis (Phase A) rides already-flowing data. |
| `apicarto.ign.fr/api/cadastre/parcelle` · Point geom | 0 features | A Point-geom quirk of the apicarto cadastre route; the national WFS (row above) is the working parcel path. A measured negative, not a gap. |

---

*Model references: **Denmark** `../dk/` (ceiling, ~96 %) · **Barcelona** `../es/es-ct/08019-barcelona/`
(pilot climb) · **Portugal** `../pt/RATE-IMPLEMENTATION-PLAN.md` (mirrored structure; shared OCR core).
Composite this drives: [`COUNTRY-RATE.md`](./COUNTRY-RATE.md). National LEGISLATION number:
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) — renamed from `RATE.md` (L-649). Per-city plans:
[Paris](./fr-idf/75056-paris/RATE-IMPLEMENTATION-PLAN.md) · [Lyon](./fr-ara/69123-lyon/RATE-IMPLEMENTATION-PLAN.md).
Governing: **C63** (`../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md`, axes §3 /
weighting §4) · **C58** (fidelity/provenance) · **ADR-0269** (curate-then-serve) · **L-449** (human gate).
Extraction engine: `../../standards/ORDINANCE-EXTRACTION-PIPELINE.md`. Cross-country method:
`../_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md`.*

*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under the C63 audit (L-649). Changes NO RATE % cell.*
