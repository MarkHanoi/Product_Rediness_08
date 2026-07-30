# Rate Implementation Plan — Belgium (`be`) national

**Current national legislation/data-fill:** ~10–14% blended (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) —
the structured-fill metric, renamed from `RATE.md` per the L-649 migration) · **Current bake-covered composite:** ~44% `partial` (Brussels only, DATA-SOURCES 40 +
CONTEXT 56 — see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic COMPOSITE ceiling (PROJECTED, CONTINGENT on the Phase-A/B/C probes landing):** ~30–40%
national · ~40–50% for the best-sourced region (Brussels) · **Realistic LEGISLATION ceiling (unchanged,
policy-bound):** ~20–30% without a policy change · **Structurally capped by the constitutional
region-split — not a defect** · **Ceiling model — Denmark (~96%)** · **Pilot model — Barcelona (~48%)** ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the
> national legislation number stays ~10–14% and the Brussels composite stays ~44% (DATA-SOURCES 40 ·
> CONTEXT 56) until the probes below actually run and wire. The federal CADMAP finding that anchors
> Phase A is **`VERIFIED LIVE` at the WFS** (2026-07-24, HTTP 200) but rated **`documented` — NOT `live`**
> as an app source, because it is **not yet wired** into `parcelProviders/registry.ts`. A WFS that answers
> `200` is not the same as a wired provider. The heights and terrain findings are honestly `blocked` for
> Brussels and this plan does **not** dress them up. **Ship the probe before the fix.**

> **Why Belgium's ceiling is capped (the region-split is structural, not a bug).** Belgium is **the
> weakest audited jurisdiction so far** — DATA-SOURCES reads **40%** (vs ES 70 · FR 80 · NL 90). This is
> a *true* reading, not a coverage miss. Spatial planning is an **exclusive regional competence** (special
> laws of 8 Aug 1980 + 12 Jan 1989): there is no Belgian BauNVO, no Belgian GPU, no shared zone taxonomy,
> no shared numeric-envelope mechanism, and **no provision-code semantic catalogue** in any region (the
> starkest gap vs Sweden's Planbestämmelsekatalog — `README.md §1.6`). One federal layer is genuinely
> shared — the **cadastre (CADMAP/CadGIS)** — and everything else (zoning, height, terrain, heritage,
> LiDAR) forks three ways. So Belgium is **three independent legal-system integrations** (VCRO / CoDT /
> CoBAT) wearing one country's name. The binding cap is that region-split, plus the pervasive discretionary
> test (*goede ruimtelijke ordening* / *bon aménagement des lieux*) layered on top of every permit.
> Raising Belgium durably would need a **policy change**, not just data engineering. Full study:
> [`findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`](./findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md).

---

## 1 — The ceiling: what "maximum" means here

Belgium is **region-split-bound** for its planning values. The one federal efficiency is the cadastre;
above it, three constitutionally-independent systems (Flanders VCRO / Wallonia CoDT / Brussels CoBAT)
share no taxonomy, no numeric-envelope mechanism, and no exchange schema. This places Belgium in the
hardest structural position of any European jurisdiction audited: **the LEGISLATION and ENVELOPE axes
are capped three-fold** (one integration per region), and **within Brussels** the numeric text that does
exist (RRU Titre I) is a **context-relative formula-in-PDF** (`H = P + 3.00 + D`), legally subordinate to
the discretionary *bon aménagement des lieux* test and to a PRAS/RRU/RRUZ/PPAS precedence check.

**Ceiling model — Denmark (~96%):** Denmark's national Plandata delivers zone code, numeric density, and
height as machine-readable structured fields. That is the proof ~96% is reachable when a country fully
digitises its planning rules **as one system**. Belgium is the antithesis: no region publishes a
provision-code catalogue, and there are three systems, not one. The Denmark ceiling is **not** reachable
for Belgium without a constitutional/policy digitisation of planning rules that is outside PRYZM's control.

**Pilot model — Barcelona (~48%):** Barcelona demonstrates the phased climb — registry, per-clau packs,
block-derived construction envelopes, a refusal vocabulary. Belgium should mirror this **shape** per region
(Brussels first — the only region with a region-wide gabarit text): wire the cheapest axis, source one
instrument, build the extraction infrastructure, then scale. Mirror the shape, not the numbers.

**Belgium's ceiling is bounded by three structural facts:**
1. **Region-split (constitutional).** Three legal systems, no shared taxonomy/schema — LEGISLATION +
   ENVELOPE (45% of the weight) must be integrated **three times**, not once. *(Structural — a policy
   fact, not a defect. This is the binding national cap; it is what holds the LEGISLATION ceiling at
   ~20–30% without a policy change.)*
2. **No provision-code semantic catalogue in any region.** Nothing like Sweden's Planbestämmelsekatalog
   maps plan-provision codes to numeric meaning — so even where a plan is adopted, its numbers are
   PDF/prose, not queryable attributes. *(Caps the fill rate below Sweden/Germany Stufe-2.)*
3. **Brussels heights + terrain are `blocked`.** The GRB LiDAR height product is **Flanders-only**; no
   Brussels-Capital DTM route is located (`terrain.mjs` `be` verdict `blocked`). *(An engineering
   blocker, honestly low — see Phase B; the enclaved Brussels-Capital region is covered by neither the
   Flanders DHMV nor the Wallonia MNT programme.)*

### 1.4 — Mapping the ROI sequence onto the seven C63 axes

Weights are RATIFIED (founder, 2026-07-30 — C63 §4). "Post-phase" is the *projected* state **once probed
+ wired**; every entry is `CONVERGENT-SECONDARY`/`documented` until the named probe runs — **no RATE cell
moves on it.**

| C63 axis | Weight | Current premise (Brussels) | Post-phase (once probed + wired) |
|---|---:|---|---|
| **DATA-SOURCES** | 15% | 40% — cadastre `documented`, zone-GIS `documented`, height `blocked`, terrain `blocked`, context `live` | **Rises (Phase A)** — CADMAP wired flips cadastre-slot `documented`→`live`; a PRAS wire flips zone-GIS `documented`→`live`. Height/terrain stay `blocked` for Brussels (Phase B honest). |
| **PARCEL** | 15% | `wired-pending-probe` (Phase-4) — `FlandersGrbParcelProvider` (GRB `Adp`, Flanders-only) BUILT in `parcelProviders/flandersGrbParcelProvider.ts` + tested; **not yet in `registry.ts`** (single-writer orchestrator) and **not live-probed**, so the RATE cell stays `not-assessed`. Federal CADMAP (all-region) still unbuilt. | **Rises (Phase A)** — orchestrator registers `isInFlanders→flanders-grb`, live-probes GRB `Adp`, then draws a `computeParcelConfidence` sample; the later CADMAP wire serves all 3 regions (the single cross-region efficiency). |
| **CONTEXT** | 5% | 56% — 5/9 baked layers (`bake.mjs brussels`) | Roughly flat — rail/trees pending the L-642 re-bake; sea N/A (inland). |
| **HEIGHTS/LOD** | 10% | `not-assessed` — `grb_be` `blocked`; UrbIS height unprobed | **Contingent (Phase B)** — the highest-value BE height probe is the **CADMAP building sublayer** height/storey attribute; UrbIS second. Stays low for Brussels if both are negative — honest. |
| **TERRAIN** | 10% | `not-assessed` — `be` verdict `blocked`; no Brussels DTM route | **Contingent (Phase B)** — needs a Bruxelles-Environnement/CIRB DTM route pinned + a `terrain.mjs` REGIONS row. **Blocked until located** — do not fabricate a rung. |
| **LEGISLATION** | 25% | ~10–14% national / ~5–10% Brussels prior — no L-449-verified clau count | **Unchanged until Phase C** — RRU Titre I read verbatim + `VERIFICATION.md` signed; capped three-fold by the region-split (~20–30% ceiling). |
| **ENVELOPE** | 20% | `not-assessed` — no BE rule pack; RRU KIND not built | **Unchanged until Phase C** — needs the reference-formula gabarit KIND + PRAS/RRU/RRUZ/PPAS precedence resolver + CBS+/TOTEM gates. |

The cheapest, highest-leverage move is **Phase A** (wire the already-verified-live CADMAP cadastre): it
lifts DATA-SOURCES + PARCEL with one federal integration that serves all three regions. Heights + terrain
(**Phase B**) stay honestly low for Brussels — the region-split leaves it uncovered. LEGISLATION +
ENVELOPE (**Phase C**, 45% of the weight) are the surviving three-fold cap. **All contingent on the
probes actually landing.**

---

## 2 — Phase tracker (existing — retained)

The original national Phase 0–6 tracker (2026-07-24) is **retained unchanged** below — it is the
LEGISLATION-axis + per-region legal climb, and it stays the source of truth for the numbered phases.
The C63 composite roadmap folds it into three ordered, probed-and-wired phases **A/B/C** (§Phase-3), which
re-frame the same work along the seven axes. Cross-reference the two: the numbered Phases 1/2/3 map onto
A (access + CADMAP wiring) and C (the RRU KIND); Phases 4/5 are C's per-region extension; Phase 6 is the
policy-dependent ceiling raise.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — live endpoint/schema checks; write RATE.md | Honest baseline: ~10–14% confirmed | — → ~10–14% | Complete | VERIFIED | UNASSIGNED |
| **1** | Resolve Brussels bot-detection block; confirm PRAS/RRU/RRUZ layer schema and licence terms live from Belgian-IP deployment | PRAS zone query + RRU Titre I instrument-priority check operational; prerequisite for all Brussels pack work | ~10–14% → ~10–14% (access unblocked; rate unchanged until Phase 2) | Low–Medium (infrastructure) | NOT STARTED | UNASSIGNED |
| **2** | Run WFS GetFeature probes: (a) any Flemish RUP feature for numeric height/FAR attribute; (b) any Brussels PPAS feature for numeric content; (c) federal CADMAP building sublayer for height/storey attribute | Closes the single largest remaining unknown — confirms whether structured numeric fields exist at all in any regional plan feature | ~10–14% → ~12–18% (if positive hits found) or confirms ceiling | Medium (probe design + access workarounds) | NOT STARTED | UNASSIGNED |
| **3** | Build Brussels RRU Titre I formula encoder: new rule KIND (context-relative H = P + 3.00 + D); instrument-priority check (PPAS/RRUZ/PAD > RRU); live PRAS zone query | First region with a computable envelope path; Brussels ~5–10% → ~20–30% for parcels under RRU Titre I default | ~12–18% → ~15–22% (Belgium blended; Brussels accounts for ~11% of population) | High — new rule KIND; requires Phase 1 complete | NOT STARTED | UNASSIGNED |
| **4** | Build Flanders RUP ingestion: DSI WFS access (via `mercator.vlaanderen.be` or alternative); gewestplan/RUP classifier; Art. 7.4.2/2 nullification check; "vrij" refusal output | Flanders parcels with explicit numeric RUP provisions reach the fill denominator; "vrij" parcels get a correct reasoned refusal instead of silence | ~15–22% → ~18–27% (blended; Flanders ~57% of population but low fill fraction per RUP) | High — four-step instrument cascade; "vrij" refusal KIND | NOT STARTED | UNASSIGNED |
| **5** | Confirm Wallonia GCU adoption for Liège; if confirmed, extract numeric provisions; build plan-de-secteur zone query against live WFS | Liège parcels under a GCU numeric provision reach the denominator; all Wallonia parcels get a correct plan-de-secteur zone answer + bon-aménagement-des-lieux refusal | ~18–27% → ~20–30% (ceiling without policy change) | Medium (Liège GCU research) + Low (plan de secteur WFS already live) | NOT STARTED | UNASSIGNED |
| **6** | Policy-dependent: a Belgian region adopts a provision-code semantic catalogue mapping plan-provision codes to numeric values | Structural ceiling rises from ~20–30% to ~50–60%; equivalent of Sweden's Planbestämmelsekatalog | Political/administrative change — not currently underway in any region | BLOCKED (external) | UNASSIGNED |

---

## Phase-3 — the Belgium ROI roadmap (NEW, 2026-07-30)

Three ordered phases. **A** is the geospatial-platform wiring — the highest-leverage, cheapest win (the
already-`VERIFIED LIVE` federal cadastre, currently unwired). **B** probes heights + attempts to unblock
terrain, and is **honest that both stay low for Brussels** given the region-split. **C** is the per-region
legal SOURCING + OCR + the RRU gabarit KIND that is the surviving three-fold cap on LEGISLATION/ENVELOPE.
Each phase lists **goal · unlocks · axis · effort · dependency · blocker**. Every row is
`CONVERGENT-SECONDARY`/`documented` until its named probe runs — the probe queue lives in [`NEXT.md`](./NEXT.md)
and the city [`be-bru/21004-brussels/NEXT.md`](./be-bru/21004-brussels/NEXT.md).

### Phase A — Wire the federal CADMAP cadastre (the verified-live win) → PARCEL + DATA-SOURCES

> **Phase-4 status (2026-07-30) — Flanders GRB provider BUILT, `wired-pending-probe`.** A first BE
> cadastre provider now exists in code: `packages/site-parcel-data/src/parcelProviders/flandersGrbParcelProvider.ts`
> — the **Flemish GRB `Adp`** (administrative parcels: CaPaKey + NISCODE + geometry, "Gratis Open
> Data", no key), behind an `isInFlanders` bbox predicate, resolving through a same-origin proxy
> (`/api/parcel/be-vlg`) with the DK/NL/NO/FR server-side reprojection seam (native EPSG:31370 →
> requested WGS84). Pure parse + 18 unit tests; typecheck + isolation clean; never throws; geometry-only
> (no envelope). **It is `documented` not `live`:** the orchestrator has NOT yet registered it in
> `parcelProviders/registry.ts` (single-writer), no server proxy is wired, and no `computeParcelConfidence`
> sample has been drawn against a live GRB response. This is the **Flanders** slice, NOT the all-region
> federal CADMAP win — GRB does not cover Brussels-Capital or Wallonia. **Live PROBEs still owed:** GRB
> `Adp` typeName via GetCapabilities, `srsName=EPSG:4326` reprojection honoured, exact CaPaKey/area field
> names, and the `overdrachtdiensten` vs `geo.api.vlaanderen.be` host. Ship the probe before the fix.

- **Goal.** Wire the federal **CADMAP/CadGIS** parcel dataset (AGDP/SPF Finances — single national WFS
  `ccff02.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/`, **`VERIFIED LIVE` 2026-07-24, HTTP
  200, CC-equivalent open, no key**) into `packages/site-parcel-data/src/parcelProviders/registry.ts` as a
  first-class `BeParcelProvider` behind an `isInBelgium` predicate (today `registry.ts` carries only
  `pdok-nl`, `ign-fr`, `catastro`, `geonorge-no`, `alkis-nrw` + `footprint` — **no BE predicate**, so a
  Brussels click resolves to the footprint-fallback, never a legal parcel). Then run `computeParcelConfidence`
  over a Brussels sample, and add a Belgian-IP access path to live-verify the Brussels **PRAS** zone-GIS
  (`gis.urban.brussels/geoserver/PERSPECTIVE_FR:Affectations` — **bot-blocked** on direct fetch today,
  confirmed via cache) and wire it into `siteDispatch.ts`.
- **Unlocks.** A **PARCEL + DATA-SOURCES jump** — this is the phase that materially moves Belgium's
  composite. Wiring CADMAP flips the cadastre source-slot `documented`→`live` **and** makes PARCEL
  sample-ready; the **one federal integration serves all three regions identically** (the single genuine
  cross-region efficiency — build CadGIS ingestion once, it serves Brussels + Flanders + Wallonia parcels).
- **Axis.** PARCEL (Axis 1) · DATA-SOURCES (Axis 3).
- **Effort.** Low–Medium. The CADMAP provider is one adapter behind one predicate (~1–2 dev-days once the
  WFS FeatureType names are read); the PRAS wire + Belgian-IP path is ~2–3 dev-days.
- **Dependency.** Confirm the CADMAP WFS `GetCapabilities` FeatureType names first (the WFS is verified
  live but the exact CP layer names for the provider adapter are not yet read). PRAS live-verify depends on
  a Belgian-IP (or alternative-access) path to defeat the bot-block.
- **Blocker.** The CADMAP WFS is **`VERIFIED LIVE` but the provider is `documented` not `live`** until the
  `registry.ts` wire ships — the standing #1 gap (`COUNTRY-RATE.md` legend). CadGIS is a
  **visualization/bulk-geometry product, not the certified legal extract** (certified plan extract €11 /
  matrix €5.50 — the "presumption vs certified" caveat, as flagged for Portugal). PRAS direct fetch is
  **bot-blocked** (deployment-engineering, not a geo-block — Belgian-IP deployment resolves it).

### Phase B — Probe heights (CADMAP sublayer / UrbIS) + attempt to unblock Brussels terrain

- **Goal.** Probe the two candidate Brussels height sources — the **federal CADMAP building sublayer**
  ("buildings managed by AGDP", `GetFeature` for a height/storey attribute — the **highest-value BE height
  probe**, because if positive it is a free, nationally-consistent source) and the Brussels **UrbIS** height
  attribute (unprobed) — and pin a Brussels-Capital **DTM route** (Bruxelles-Environnement / CIRB) so a
  `terrain.mjs` REGIONS row + bake becomes possible.
- **Unlocks.** HEIGHTS/LOD and TERRAIN — **conditionally.** Be honest: **both stay low for Brussels** on
  current evidence. `heightSources.mjs` maps `brussels`→`grb_be` **`blocked`** ("GRB height is
  **Flanders-only**; Brussels UrbIS height unprobed"), and `terrain.mjs` `be` verdict is **`blocked`**
  (LIVE-PROBED 2026-07-25 — URBIS GeoServer answers but exposes **no elevation coverage**; the enclaved
  Brussels-Capital region is covered by neither the Flanders DHMV nor the Wallonia MNT programme). This
  phase moves the axes **only if** a probe comes back positive — otherwise it confirms an honest `blocked`.
- **Axis.** HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5).
- **Effort.** Low (the two height `GetFeature` probes); Medium (the terrain bake — one `terrain.mjs`
  REGIONS row + a bake + a `terrain.verify.mjs` round-trip, **once a DTM route is pinned**).
- **Dependency.** The nDSM building-height module is **shared** — the SAME module as Spain (L-511c) and
  France (L-512b); Belgium (Flanders GRB/DHMV) would feed different inputs. Do **NOT** one-off it per
  region. The terrain bake depends on locating any live Brussels-Capital bare-earth DTM endpoint first.
- **Blocker.** **The region-split leaves Brussels uncovered for both axes.** GRB LiDAR height is
  Flanders-only; **no Brussels-Capital DTM route is located** — this is not a wiring gap that a probe fixes,
  it is a data-existence question. **Flanders vs Brussels split, stated plainly:** Antwerp/Flanders *can*
  reach measured heights + terrain via GRB/DHMV II once bake-covered; **Brussels cannot today**. Do not
  fabricate a terrain rung or a height score for Brussels (§CONTEXT-DATA-HONESTY).

### Phase C — Per-region legal SOURCING: zone-GIS + OCR + L-449 → LEGISLATION + ENVELOPE

- **Goal.** Build the per-region planning-value SOURCING + OCR pipeline and the **RRU Titre I gabarit KIND**.
  **Start with Brussels** (the only region carrying a region-wide numeric-leaning text): read **RRU Titre I**
  verbatim, record clause citations in `sources/SOURCES.md`, pass each through the **L-449 human-verification
  gate**, sign `VERIFICATION.md`, then build the **reference-formula gabarit KIND** (`H = P + 3.00 + D`) + a
  **PRAS/RRU/RRUZ/PPAS precedence resolver** + the **CBS+/TOTEM** massing gates. Then extend to **Flanders**
  (VCRO — per-RUP *stedenbouwkundige voorschriften*, with the **Art. 7.4.2/2 "clichering"** check that
  statutorily nullifies post-2009 percentage provisions) and **Wallonia** (CoDT — plan de secteur affectation
  only; *bon aménagement des lieux* is load-bearing). The regional zone-GIS wiring (Wallonia is Belgium's
  **strongest** confirmed endpoint — OGC API Features + WMS, verified live; Flanders GRB/DSI robots-blocked;
  Brussels PRAS bot-blocked) feeds the zone denominator.
- **Unlocks.** LEGISLATION (structured, L-449-hardened) and ENVELOPE (the C58 solver runs only on sourced
  numeric parameters). These two axes (45% of the weight) are the surviving cap — Phases A/B do **not** touch
  them, and the region-split means the cost is paid **three times**.
- **Axis.** LEGISLATION (Axis 2) · ENVELOPE (Axis 4).
- **Effort.** High — the "whole cost" is human-gated legal SOURCING, paid **once per region** (no shared
  taxonomy to amortise). Brussels: ~20–25 dev-days (`findings/ §B.1`). The RRU gabarit KIND is
  architecturally the **same family** as Paris's ADR-0274 reference-surface + gabarit resolver and Porto's
  *moda da cércea* — build one resolver, reuse across BE/FR/PT. Any OCR of the PDF planning texts must be
  built generically (per-region configuration), reusing the shared ES/FR/PT/UK OCR investment.
- **Dependency.** **L-449** (human-verification gate) is mandatory before any sourced number serves at
  `confidence: structured`. **ADR-0269** (curate-then-serve): no value serves without a citable governing
  article in `SOURCES.md`. A **new C58 GeometricRule KIND** (reference-formula gabarit) is required before
  any RRU Titre I envelope can produce parcel-level numbers. Phase A cadastre wiring gates attaching any
  extracted rule to a parcel.
- **Blocker.** **The pervasive discretionary test** — *goede ruimtelijke ordening* (VCRO Art. 4.3.1) /
  *bon aménagement des lieux* (CoDT Art. D.IV.13 / CoBAT-RRU practice) — is layered on **every** permit in
  all three regions and is **NOT queryable by design**; any sourced number is legally subordinate to it.
  **No provision-code semantic catalogue** exists in any region, so numbers are PDF/prose not attributes.
  **Flanders Art. 7.4.2/2 "clichering"** may statutorily void a whole class of post-2009 percentage
  provisions. **RRUZ/PPAS/PAD** override RRU Titre I for specific districts. This axis links to **L-449**
  (the general human-verification gate) — all `CONVERGENT-SECONDARY` until read verbatim + L-449-signed.

---

## 3 — The gap to Denmark (~96%)

Three structural facts separate Belgium from the 96% Denmark ceiling. **Phase A relieves (b); (a) and (c)
are the surviving cap and are policy-bound, not engineering-bound.**

**(a) Three independent legal systems — no shared taxonomy or schema (the primary structural gap,
POLICY-BOUND).** Denmark's national Plandata delivers zone code, density, and height as typed queryable
fields **from one system**. Belgium has **three** (VCRO / CoDT / CoBAT) sharing no zone taxonomy, no
numeric-envelope mechanism, and no exchange schema — devolved independently in 1980/1989 with no
cross-reference. Closing this needs the **Phase C** SOURCING + OCR + L-449 work paid **three times over**.
Until then the LEGISLATION + ENVELOPE axes (45% of the weight) cannot rise regardless of geospatial wiring.
**This is the binding cap — and it is a policy fact, not a defect PRYZM can engineer away.**

**(b) Parcel geometry — RELIEVED by the federal CADMAP cadastre (Phase A).** Unlike the fragmented case,
Belgium has **one genuine national parcel dataset** (CADMAP/CadGIS), `VERIFIED LIVE`. This is the mirror
image of Germany (there the taxonomy is federal and the cadastre per-Land; in Belgium the cadastre is
federal and everything else is per-region). Wiring it once (Phase A) serves all three regions — the single
cross-region efficiency. Caveat: it is a visualization/bulk-geometry product, not the certified legal
extract.

**(c) No provision-code semantic catalogue anywhere (POLICY-BOUND, UNCHANGED).** No Belgian region
publishes anything like Sweden's Planbestämmelsekatalog mapping plan-provision codes to numeric meaning,
and the **discretionary test** (*goede ruimtelijke ordening* / *bon aménagement des lieux*) sits on top of
every permit — a value the engine cannot itself evaluate. There is no national numeric sanity-check (no
BauNVO §17 backstop), so the L-449 gate is even more load-bearing here. Raising Belgium durably would
require a **policy change**, not better data engineering — `README.md §1.6`.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **CADMAP WFS `GetCapabilities` FeatureType confirmation (Phase A)** anchors the `BeParcelProvider`
  adapter. The WFS is verified live, but the exact CP layer names must be read before the adapter is coded.
- A **Belgian-IP (or alternative) access path** gates the live PRAS verify (bot-blocked) and the Flanders
  GRB/DSI verify (robots-blocked) — deployment engineering, not a geo-block.
- **L-449** (human-verification gate) is mandatory for any planning value before it serves at
  `confidence: structured`. No sourced number bypasses it.
- **ADR-0269** (curate-then-serve): serve no value without a citable governing article in `SOURCES.md`.
- A **new C58 GeometricRule KIND** (reference-formula gabarit) is required before any RRU Titre I envelope
  (Phase C) can produce parcel-level numbers — the same KIND family as Paris ADR-0274 + Porto *moda da
  cércea*.

**Current blockers:**
- **CADMAP is `documented` not `live`** — the federal WFS answers `200`, but the provider is not wired into
  `registry.ts`; no `computeParcelConfidence` sample has been drawn (the standing #1 gap).
- **Brussels heights + terrain are `blocked`** — GRB LiDAR height is **Flanders-only**; **no
  Brussels-Capital DTM route is located** (`terrain.mjs` `be` = `blocked`, LIVE-PROBED 2026-07-25). The
  CADMAP building-sublayer height attribute is **unprobed** (the highest-value BE probe).
- **PRAS bot-blocked / Flanders GRB robots-blocked** on direct fetch — confirmed via cache, not
  independently live-verified.
- **The discretionary test is NOT queryable** and **no provision-code catalogue exists** — a policy cap on
  the LEGISLATION/ENVELOPE ceiling, not a data-engineering one.

**Cross-jurisdiction reuse:**
- The **federal CADMAP parcel ingestion (Phase A)** is the **one cross-region efficiency** — build CadGIS
  ingestion once behind `isInBelgium`; it serves Brussels + Flanders + Wallonia parcels identically. Do NOT
  build it per-region.
- The **nDSM height module (Phase B)** — DSM−DTM, 90th-percentile per footprint — is the SAME shared module
  as Spain (L-511c) and France (L-512b); Flanders would feed GRB/DHMV inputs. Do NOT one-off it per region.
- The **reference-formula gabarit KIND (Phase C)** is the SAME C58 family as Paris ADR-0274 (reference-
  surface + gabarit) and Porto *moda da cércea* — build one resolver, reuse across BE/FR/PT.
- The **planning-text OCR pipeline (Phase C)** is a **shared ES/FR/PT/UK/BE investment** — all are
  PDF/prose-bound for numeric planning values. Build generically (per-region configuration: instrument
  names, article-numbering patterns, glossary terms), never Brussels-specific.
- **Region routing** keys on the **NIS/INS municipality code** → ISO 3166-2:BE region (`be-bru` / `be-vlg`
  / `be-wal`); the constitutional fracture makes the subdivision axis legally load-bearing (the analogue of
  Germany's AGS / France's INSEE, but with three *legal systems* behind it, not one).
- **Sequencing: Brussels → Antwerp → Liège** (`README.md §5`) — start with the only region carrying a
  region-wide gabarit text, mirroring Germany (Hamburg→Munich→Berlin) and Spain (simplest→most complex).

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona** `../es/es-ct/08019-barcelona/`
(pilot climb, ~48%). Governing: **C58** (fidelity/provenance + the new gabarit KIND), **ADR-0269**
(curate-then-serve), **L-449** (human-verification gate), **C63 §3/§4** (the seven axes + ratified
weighting), **CoBAT · PRAS · RRU Titre I · VCRO · CoDT**, special laws **8 Aug 1980 + 12 Jan 1989**. Data
layer: [`findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md`](./findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md)
(federal cadastre + three regional systems) · [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city composite) ·
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (structured-fill; renamed from `RATE.md`, L-649) · [`LOD-RATE.md`](./LOD-RATE.md) (building/terrain LOD) · [`NEXT.md`](./NEXT.md)
(probe queue). All Phase-A/B/C findings are `documented`/`CONVERGENT-SECONDARY` until live-probed +
wired — ship the probe before the fix. The region-split ceiling is structural, not a defect.*

*Last updated: 2026-07-30. Maintainer: UNASSIGNED.*
