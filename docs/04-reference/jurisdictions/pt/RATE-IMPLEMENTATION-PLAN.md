# Rate Implementation Plan — Portugal (`pt`) national

**Current national legislation/data-fill:** ~0% (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) —
the renamed structured-fill metric; national rename to `LEGISLATION-RATE.md` is pending the L-649
governance/migration track, so the number physically still lives in [`RATE.md`](./RATE.md) until that
rename lands) · **Current bake-covered composite:** ~36% `partial` (Lisboa + Porto, DATA-SOURCES +
CONTEXT only — see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic ceiling (PROJECTED, post-DGT, CONTINGENT on the Phase-A/B/C probes landing):** ~45–55%
national · ~55–65% for a well-sourced cadastre-confirmed city · **Pre-DGT ceiling (superseded):**
~25–35% · **Ceiling model — Denmark (~96%)** · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the
> current legislation number stays ~0% and the Lisboa/Porto composite stays ~36% until the probes below
> actually run and wire. The DGT OGC API findings that raise the *projected* ceiling are all
> **`CONVERGENT-SECONDARY`** (founder-supplied expert review, 2026-07-30 — cited authorities, **NOT
> live-probed**). A doc claiming a source is available is **not** a wired or probed source. The raised
> ceiling is a *projection contingent on Phase A/B/C landing*, not a measured gain. **Ship the probe
> before the fix.**

> **Why the ceiling rose (2026-07-30): the DGT OGC API platform.** The pre-DGT ceiling (~25–35%) was
> written before the *Portugal Geospatial Infrastructure Review* surfaced the **DGT OGC API platform**
> (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`) — CAOP admin boundaries, Cadastro Predial parcels,
> CRUS/COS territorial-classification + land-cover, and 30 cm national orthophotos, all reported **CC BY
> 4.0**, plus a DGT LiDAR campaign (DTM 50 cm / DSM 2 m, ~90% continental) and a Copernicus DEM terrain
> fallback. The old ceiling assumed the geospatial axes (PARCEL + DATA-SOURCES + HEIGHTS + TERRAIN +
> CONTEXT = **55% of the C63 weight**) were largely *blocked* by parcel-geometry fragmentation. The DGT
> discovery shows those axes can **largely fill once probed + wired** — so the *binding* cap moves off
> parcel fragmentation and onto the LEGISLATION + ENVELOPE OCR work (the remaining **45% of the weight**).
> That is what materially raises Portugal's ceiling. See §1.4 and the Phase-3 roadmap below. Full
> inventory: [`PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md`](./PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md).

---

## 1 — The ceiling: what "maximum" means here

Portugal is **PDF-bound** for its numeric planning values. The SNIT portal (Portugal's GPU
equivalent) returns zone polygons and PDF links — it does not deliver structured numeric attributes
for índice de utilização, cércea, or afastamentos. DR 15/2015 provides a national zone-category
taxonomy but attaches no numeric ceilings (unlike Germany's BauNVO §17). This places Portugal
firmly in the **Scenario B** structural position: **the LEGISLATION and ENVELOPE axes** are capped
until an OCR / rule-extraction pipeline and the L-449 human-verification gate are built. **What the
DGT discovery changes is the *geospatial* half of the ceiling, not this PDF-bound legal half** — see
§1.4.

**Ceiling model — Denmark (~96%):** Denmark's national Plandata delivers zone code, numeric
density, and height as machine-readable structured fields. That is the proof that ~96% is reachable
when a country fully digitises its planning rules. Portugal is far from this on the *legal* axis: its
numeric values are locked in municipal PDFs. The Denmark ceiling is not achievable for Portugal
without a structural digital-transformation of PDM publishing that is outside PRYZM's control.

**Pilot model — Barcelona (~48%):** Barcelona demonstrates the phased climb — registry, per-clau
packs, block-derived construction envelopes, refusal vocabulary. Portugal should mirror this phase
shape: start with the most tractable city (Braga), source one category, build the extraction
infrastructure, then scale to additional categories and cities. Mirror the **shape**, not the
numbers.

**Portugal's pre-DGT ceiling (~25–35%, SUPERSEDED):** the original estimate was bounded by three
structural facts:
1. **PDF-only numeric values** — OCR pipeline + L-449 gate required before any numeric field can be
   served at `confidence: structured`. *(Still true — see §1.4; this is the surviving cap.)*
2. **Fragmented parcel geometry** — ~134/308 municípios have cadastral coverage; 174 have none. *(Now
   partially relieved by the DGT Cadastro Predial OGC API — see §1.4 and §3(b). Still mainland-only,
   coverage-varies, and unconfirmed for the Lisbon/Porto urban cores.)*
3. **Per-PDM formula variation** — unlike Germany (national §20 BauNVO formula for GFZ), Portugal has
   no national definition of "área de edificação." *(Still true — the OCR pipeline must handle formula
   variation, not just value variation.)*

### 1.4 — The DGT OGC API discovery raises the ceiling (2026-07-30, CONTINGENT)

The founder-supplied review scores Portugal's **infrastructure 9/10** (EXCLUDING envelope rules ≈ 0%
and building heights, the two weak axes). Mapping the discovery onto the seven C63 axes and their
ratified weights:

| C63 axis | Weight | Pre-DGT premise | Post-DGT (once probed + wired) |
|---|---:|---|---|
| **DATA-SOURCES** | 15% | mostly blocked; no cadastre wired | **Jumps** — CAOP routing + Cadastro Predial parcel slot + DGT-LiDAR height + DGT-DTM/Copernicus terrain + OSM context: up to 4–5/5 slots `live`/`documented` |
| **PARCEL** | 15% | fragmentation caps it near 0 nationally | **Rises** where Cadastro Predial coverage is confirmed (mainland only; cores TBV) |
| **CONTEXT** | 5% | OSM only | **Rises** — CRUS/COS + 30 cm orthophotos add authoritative context layers |
| **HEIGHTS/LOD** | 10% | `documented` nDSM, unbaked | **Rises** once the nDSM = DSM−DTM module bakes DGT LiDAR (~90% continental) |
| **TERRAIN** | 10% | `blocked` — "no open DGT bare-earth DTM" | **Potentially UNBLOCKS** — the DGT LiDAR campaign publishes a **DTM 50 cm** bare-earth model; Copernicus DEM backfills the NW ~10% gap |
| **LEGISLATION** | 25% | PDF-only, OCR-gated | **Unchanged** — still the surviving cap (§1.1/§3a) |
| **ENVELOPE** | 20% | no rule pack; OCR-gated | **Unchanged** — depends on LEGISLATION + C58 solver |

The five geospatial axes (55% of the weight) move from *assumed-blocked* to *fillable*. A back-of-envelope
projection for a **well-sourced, cadastre-confirmed city** (Braga): DATA-SOURCES ~0.8, PARCEL ~0.7,
CONTEXT ~0.7, HEIGHTS ~0.6, TERRAIN ~0.7, LEGISLATION ~0.3, ENVELOPE ~0.25 → **~50–55% weighted**. So
the *individual well-sourced city* ceiling rises to **~55–65%** and the *national* ceiling to
**~45–55%** — bounded now by the LEGISLATION + ENVELOPE OCR cost (45% of the weight) and by cadastre
coverage on the cores, **not** by parcel fragmentation. **All of this is `CONVERGENT-SECONDARY` and
contingent on Phase A/B/C actually landing.** No RATE cell moves on it.

---

## 2 — Phase tracker (existing — retained)

The original Phase 0–4 tracker is retained unchanged. The DGT discovery is folded in as the
**Phase-3 roadmap (§Phase-3)** below, which expands and re-frames the old "Phase 3/4" geospatial
confirmation work into probed-and-wired phases A/B/C. Cross-reference the two: Phase 0/1/2 remain the
LEGISLATION-axis climb; Phases A/B/C are the geospatial-axis climb the DGT discovery unlocked.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Confirm cadastral regime for Braga (DICOFRE 0303) via DGT SNIC; run SNIT WFS probe (GetCapabilities + GetFeature for Braga point); write/update the legislation-rate for Braga | First measurable rate for any Portuguese city; honest ceiling for Braga established | ~0% → TBD | ~0.75 dev-days | NOT STARTED | UNASSIGNED |
| **1** | Read Braga PDM regulamento (SNIT PDF): upgrade índice 1.20 + cércea 7.5 m from CONVERGENT-SECONDARY to VERIFIED-PRIMARY; discover full category list; add SOURCES.md rows with governing articles | First pack-ready values for Braga "espaços residenciais"; unblocks Braga pack | ~0% → TBD | ~1–2 dev-days | NOT STARTED | UNASSIGNED |
| **2** | Build SNIT zone-polygon ingestion + PDM OCR/rule-extraction pipeline + L-449 human-verification gate; source all Braga PDM categories (índice + cércea + afastamentos per categoria) | First non-zero fill rate for Braga; OCR pipeline reusable for all Portuguese cities | TBD → TBD (Braga ceiling estimate: ~40–55%) | High (pipeline); Medium (Braga categories ~8–12 dev-days) | NOT STARTED | UNASSIGNED |
| **3** | Confirm Lisboa and Porto cadastral regimes; probe DGPC Atlas heritage layers live; confirm DGT LiDAR endpoints; source Porto PDM (after `fabricDerivedHeight` C58 amendment); source Lisboa PDM (after `transferableRights` C58 amendment) | Porto and Lisboa packs; heritage overlay; terrain layer confirmed | TBD → TBD | High | NOT STARTED (superseded/expanded by §Phase-3 A/B/C) | UNASSIGNED |
| **4** | Scale OCR pipeline to remaining target cities; re-derive national rate from confirmed live checks | National rate rises toward ceiling | TBD → ~45–55% (post-DGT ceiling) | High | NOT STARTED | UNASSIGNED |

---

## Phase-3 — DGT OGC API roadmap (NEW, 2026-07-30)

The DGT OGC API discovery decomposes into three ordered phases. **A** is the geospatial-platform
wiring (the highest-leverage, cheapest win); **B** derives heights + unblocks terrain from the DGT
LiDAR; **C** is the PDM OCR pipeline that is the surviving cap on the LEGISLATION/ENVELOPE axes. Each
phase lists **goal · unlocks · axis · effort · dependency · blocker**. Every row is
`CONVERGENT-SECONDARY` until the named probe runs — the probe queue lives in
[`PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md` §Probe steps](./PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md) and
[`NEXT.md`](./NEXT.md).

### Phase A — Probe + wire the DGT OGC API platform

- **Goal.** Confirm the DGT OGC API base URL (`dgterritorio.gov.pt` / `snig.dgterritorio.gov.pt`),
  then probe and wire the four platform layers: **CAOP** (distrito + concelho + freguesia admin
  boundaries, with the **DICOFRE** join attribute — the jurisdiction-routing analogue of Germany's AGS
  / France's INSEE lookup, the reviewer's "easiest win"), **Cadastro Predial (Continente)** (parcel
  geometry + NIC, mainland only), **CRUS + COS** (territorial classification + land cover, planning
  context), and the **30 cm national orthophotos** (imagery base, the analogue of Spain's PNOA). Read
  the licence field directly to confirm the reported **CC BY 4.0** platform-wide (don't infer).
- **Unlocks.** A **PARCEL + DATA-SOURCES + CONTEXT jump** — this is the phase that materially raises
  Portugal's ceiling (§1.4). CAOP wires DICOFRE routing for every PT municipality folder; Cadastro
  Predial fills the cadastre-parcel source slot; CRUS/COS + orthophotos fill CONTEXT.
- **Axis.** PARCEL (Axis 1) · DATA-SOURCES (Axis 3) · CONTEXT (Axis 7).
- **Effort.** Low–Medium. CAOP routing is a small win (~1–2 dev-days). Cadastro Predial + CRUS/COS +
  ortho wiring: ~3–5 dev-days once the base URL + collection names are confirmed.
- **Dependency.** Confirm the DGT OGC API base URL first (it anchors every other DGT row). CAOP →
  Cadastro Predial → CRUS/COS/ortho in that order.
- **Blocker.** All four claims are `CONVERGENT-SECONDARY` (unprobed). Cadastro Predial coverage
  **varies** and is **mainland-only**; it is **NOT confirmed for the Lisbon (1106) / Porto (1315)
  urban cores** — the standing #1 blocker (README §2.1 / NEXT §3.1). The DGT platform is a *catalogue*
  discovery until the `/collections` landing, FeatureType names, and licence string are read live.

### Phase B — Derive heights (DGT LiDAR nDSM) + unblock terrain

- **Goal.** Feed the DGT LiDAR campaign (`cdd.dgterritorio.gov.pt`, PRR, flown Apr 2024 – Mar 2025;
  DTM 50 cm + DSM 2 m, ~90% continental) into the **shared nDSM = DSM − DTM building-height module**,
  and bake the bare-earth **DTM 50 cm as the terrain tileset**, with **Copernicus DEM (~30 m GLO-30)**
  as the terrain fallback for the NW-mainland ~10% gap outside DGT LiDAR (terrain only — **NOT** a
  building-height source; do not conflate).
- **Unlocks.** **HEIGHTS/LOD** (moves `dgt_pt` from `documented`/unbaked to `tagged` measured heights
  once baked) and **TERRAIN** (potentially unblocks the axis that `COUNTRY-RATE.md` currently marks
  `blocked` — "no open DGT bare-earth DTM" — because the LiDAR campaign publishes exactly that DTM).
- **Axis.** HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5).
- **Effort.** Medium. The nDSM module is **shared** — it is the SAME module as Spain (L-511c) and
  France (L-512b); PT feeds different DGT inputs. Do NOT one-off it per country. The terrain bake is
  one `REGIONS` row + a bake per city.
- **Dependency.** Phase A (DGT platform base URL confirmed) and the shared ES/FR nDSM module. Terrain
  bake depends on confirming the DGT LiDAR endpoint is live (`cdd.dgterritorio.gov.pt`) and the tile
  grid / QGIS "DGT CDD Downloader" access path.
- **Blocker.** **RMSE-Z is unpublished** — cannot assign a confidence tier to the height data until DGT
  publishes a formal accuracy specification. No national floor-count attribute exists. The ~10%
  NW-mainland LiDAR gap needs the Copernicus fallback boundary mapped (which municípios fall in it).
  All `CONVERGENT-SECONDARY` until the endpoint is live-probed.

### Phase C — The PDM OCR pipeline (the surviving cap) — start Braga

- **Goal.** Build the **PDM regulamento OCR / rule-extraction pipeline** that reads the numeric
  planning values (**índice de utilização, cércea / altura da edificação, afastamentos**) that are
  **confirmed PDF-only** in every PDM regulamento, extracts them per zone category, and passes each
  extracted value through the **L-449 human-verification gate** before it serves at
  `confidence: structured`. **Start with Braga** (DICOFRE 0303) — the best pilot (most tractable
  category set; índice 1.20 + cércea 7.5 m already CONVERGENT-SECONDARY from the review).
- **Unlocks.** **LEGISLATION** (structured dimensional fill, hardened by L-449) and **ENVELOPE** (the
  C58 solver can only run on sourced numeric parameters). These two axes (45% of the weight) are the
  surviving cap after Phases A/B — the DGT discovery does **not** touch them.
- **Axis.** LEGISLATION (Axis 2) · ENVELOPE (Axis 4).
- **Effort.** High. This is the "whole cost" — human-gated legal SOURCING, the most expensive axis.
  But it is a **shared ES / FR / PT / UK OCR investment**: all four jurisdictions are PDF-bound for
  their numeric planning values, so the OCR / rule-extraction pipeline must be built **generically**
  (per-PDM configuration: category names, article-numbering patterns, glossary terms), never as a
  Braga-specific or PT-specific tool. Braga category sourcing itself: ~8–12 dev-days.
- **Dependency.** L-449 (human-verification gate) is mandatory before any OCR-extracted number serves
  at `confidence: structured`. ADR-0269 (curate-then-serve): no PDM value serves without a citable
  governing article in SOURCES.md. Cadastral regime confirmation (Phase A) gates attaching any
  extracted rule to a parcel. C58 §2.2 `fabricDerivedHeight` amendment gates Porto (*moda da cércea*);
  C58 `transferableRights` overlay gates Lisboa (*créditos de construção*).
- **Blocker.** **Per-PDM formula variation** — no national definition of "área de edificação," so the
  OCR must handle formula variation, not just value variation, and there is **no national numeric
  sanity-check** (unlike BauNVO §17) to catch extraction errors — which makes the L-449 gate even more
  critical here than in jurisdictions with a national numeric anchor. SNIT WFS GetCapabilities not yet
  run — zone-polygon field names unconfirmed.

---

## 3 — The gap to Denmark (~96%)

Three structural facts separate Portugal from the 96% Denmark ceiling, each requiring a different
kind of work. **The DGT discovery relieves (b); (a) and (c) are unchanged and remain the surviving
cap.**

**(a) Numeric values are PDF-only — the primary structural gap (UNCHANGED).** Denmark's national
Plandata delivers zone code, density, and height as typed, queryable fields. Portugal's SNIT delivers
a polygon and a PDF link. Closing this gap requires the **Phase C** OCR / rule-extraction pipeline +
the L-449 gate. This is buildable — analogous to France's position — but not trivial, and the
verification gate caps throughput. Until this pipeline exists, the **LEGISLATION + ENVELOPE** axes
(45% of the weight) cannot rise regardless of how well the geospatial layers are wired. **This is now
the binding cap on Portugal's ceiling.**

**(b) Parcel geometry is fragmented — RELIEVED by the DGT Cadastro Predial OGC API.** France and
Germany both have complete national parcel geometry (PCI-Express and ALKIS). The pre-DGT plan treated
Portugal's ~174/308 no-cadastre municípios as a hard cap *below* France/Germany. The DGT discovery
surfaces a **Cadastro Predial (Continente) OGC API** (parcel geometry + NIC, reported CC BY 4.0) —
which relieves this gate **where coverage is confirmed**. It is **not fully closed**: the API is
**mainland-only**, coverage **varies** (CGPR/SiNErGIC ~134 munis), and is **unconfirmed for the
Lisbon/Porto urban cores**. Confirming Cadastro Predial coverage for target-city cores (Phase A) is
the single highest-leverage probe — it is what moves the parcel-fragmentation fact from "hard cap" to
"per-city coverage question."

**(c) Per-PDM formula variation — no national numeric sanity-check (UNCHANGED).** Germany's BauNVO
§17 provides national ceiling GRZ/GFZ values a municipality cannot exceed — a backstop for
cross-municipality sanity-checking. Portugal's DR 15/2015 provides category names but no numbers.
Even the formula for what counts toward índice de edificação is per-PDM. OCR extraction (Phase C)
must handle formula variation, not just value variation, and no national check exists to catch
extraction errors — the L-449 gate becomes even more critical than in jurisdictions with national
numeric anchors.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **DGT OGC API base URL confirmation (Phase A)** anchors every DGT-platform row (CAOP, Cadastro
  Predial, CRUS/COS, orthophotos). Confirm the `/collections` landing before designing any ingestion.
- Cadastral regime confirmation per city (Phase 0 / Phase A) gates ALL parcel-level pipeline work. Do
  not design or build any parcel-geometry pipeline before this is confirmed — **especially the
  Lisbon/Porto cores, which Cadastro Predial does NOT confirm.**
- L-449 (human-verification gate) is mandatory for any value extracted via the OCR pipeline (Phase C)
  before it can be served at `confidence: structured`. No OCR-extracted number may bypass this gate.
- ADR-0269 (curate-then-serve): do not serve any PDM value that has not been verified against a
  citable governing article in SOURCES.md.
- C58 §2.2 amendment (new `fabricDerivedHeight` GeometricRule kind) is required before any Porto
  pack touching *moda da cércea* zones can be authored.
- C58 overlay schema addition (new `transferableRights` overlay type) is required before any
  Lisboa pack covering *créditos de construção* can be complete.

**Current blockers:**
- **DGT OGC API layers are all `CONVERGENT-SECONDARY`** — base URL, CAOP/CRUS/COS/ortho collection
  names, and the CC BY 4.0 licence string are reported, not live-probed. None may raise a RATE cell
  until probed (§Probe steps in the inventory).
- Cadastro Predial coverage **unconfirmed for the Lisbon (1106) / Porto (1315) cores**, and Braga
  (0303) regime needs direct confirmation (not assumed from national statistics).
- DGT LiDAR endpoints (`cdd.dgterritorio.gov.pt`) not live-probed; **DGT LiDAR RMSE-Z unpublished** —
  cannot assign a confidence tier to height data until a formal accuracy specification is obtained.
- SNIT WFS GetCapabilities not run — cannot design SNIT zone ingestion without confirmed field names.
- Lisbon CML 3D model licence unverified — hard blocker for the Lisbon context layer (LOD2/3).

**Cross-jurisdiction reuse:**
- The **PDM → OCR / rule-extraction pipeline (Phase C)** is a **shared ES / FR / PT / UK investment** —
  all four are PDF-bound for their numeric planning values. Build it generically (per-PDM/per-country
  configuration: category names, article-numbering patterns, glossary terms), reusable for all 308
  Portuguese municípios and portable to the other three jurisdictions. Do NOT build it Braga-specific.
- The **nDSM height module (Phase B)** — DSM−DTM, 90th-percentile per footprint — is the SAME shared
  module as Spain (L-511c) and France (L-512b). PT feeds different DGT inputs. Do NOT one-off it per
  country.
- **CAOP DICOFRE routing** is the direct analogue of Germany's AGS and France's INSEE lookup — the same
  jurisdiction-routing pattern, one national reader keyed on DICOFRE for all PT municipality folders.
- The DGPC Atlas heritage layer probe, once confirmed live, covers all Portuguese municipalities.
  Build one national heritage reader (ZGP/ZEP/ZNA), not per-city instances.
- The **LNEG** (energy + geology) OGC API is a modern OGC API and is **DISTINCT from LNEC** (civil-eng /
  geotech lab) — do NOT conflate; add both to SOURCES §A.4 as separate authorities.
- The cadastral coverage confirmation (which CGPR/SiNErGIC/no-cadastre regime applies per município)
  should be done as a batch for all 308 municipalities once the DGT coverage list is obtained.
- Pattern comparison: France's GPU pattern (zone polygon + PDF → OCR extraction) maps onto SNIT. If an
  apicarto-style pattern is confirmed for SNIT, the France adapter logic may port directly.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona**
`../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate), **C63 §3/§4** (the seven axes
+ ratified weighting). Data layer: [`PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md`](./PORTUGAL-GEOSPATIAL-DATA-INVENTORY.md)
(DGT OGC API inventory, all `CONVERGENT-SECONDARY`) · [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city
composite) · [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (structured-fill; national rename pending
L-649) · [`NEXT.md`](./NEXT.md) (probe queue). All DGT findings are `CONVERGENT-SECONDARY` until
live-probed — ship the probe before the fix.*
