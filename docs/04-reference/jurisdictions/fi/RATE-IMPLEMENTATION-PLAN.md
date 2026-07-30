# Rate Implementation Plan — Finland (`fi`) national

**Current national legislation/data-fill:** `~55–65%` (Ryhti live regions, est.) / `~30–35%` (non-Ryhti)
(see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) — the structured-fill metric, renamed from `RATE.md`
per the L-649 migration) · **Current bake-covered composite:** ~56%
`partial` (Helsinki, DATA-SOURCES + TERRAIN + CONTEXT only — see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic ceiling (PROJECTED, CONTINGENT on the `_ix_` probe + Phase A/B/C landing):** `~80–85%`
national **if Ryhti `_ix_` = attributes** · `~40–50%` national **if Ryhti `_ix_` = index-only** ·
**Ceiling model — Denmark (~96%)** · **Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the national
> legislation number stays `~55–65%`/`~30–35%` and the Helsinki composite stays `~56%` until the probes
> below actually run and wire. The Ryhti "second-Denmark" opportunity that raises the *projected* ceiling
> rests on a single **UNRESOLVED** measurement — the `_ix_` item-level schema — which is `VERIFIED-LIVE`
> only at the *endpoint/collection* level; the item `properties` are **unread** (tooling gap, not access —
> [`NEXT.md`](./NEXT.md) §3.1). A doc claiming a source is available is **not** a wired or probed source.
> The raised ceiling is a *projection contingent on Phase A landing attributes-present*, not a measured
> gain. **Ship the probe before the fix.**

> **KEY OPPORTUNITY — Finland is a possible SECOND DENMARK for planning.** Unlike Portugal / Spain /
> France / the UK — all **PDF-bound** for their numeric planning values, capped behind an OCR pipeline —
> Finland runs **Ryhti**, a government national planning platform whose plan layer is an **OGC API Features
> service confirmed LIVE + PUBLIC + no-auth** (`paikkatiedot.ymparisto.fi/geoserver/ryhti_plan/ogc/features/v1`,
> `ryhti_building` sub-service nationwide) on the **ISO 19109/19103/19107 kaavatietomalli** data model. This
> is the **Denmark-like machine-readable-planning shape**: if the `_ix_` collections carry
> `tehokkuusluku`/`kerrosluku`/`kayttotarkoitus` in `properties`, Finland's **LEGISLATION axis fills from a
> structured API with NO OCR** — the single largest and cheapest gain in the whole country. That inverts the
> Portugal ordering, where LEGISLATION is the *surviving cap*. **The entire opportunity turns on one
> `_ix_` GET.** See §1.4 and the Phase-3 roadmap. Full data layer: [`README.md`](./README.md) §2.2.

---

## 1 — The ceiling: what "maximum" means here

Finland's ceiling is **Denmark-adjacent (~80–85%)** once the Ryhti national rollout completes — and it is the
first jurisdiction in the research programme where that ceiling is set by a **government-mandated, legally
backstopped (Rakentamislaki; building data to Ryhti by 1.1.2029), ISO-standards-based national system already
in partial production**, not a private aggregator or a per-Land patchwork. This places Finland in a
**Scenario-A-adjacent** structural position (structured national API), **NOT** the Portugal/France Scenario-B
"PDF-bound" position — **conditional on the one `_ix_` schema answer** (§1.4, §2 `_ix_` block).

**Ceiling model — Denmark (~96%):** Denmark's national Plandata delivers zone code, numeric density, and
height as machine-readable structured fields. That is the proof that ~96% is reachable when a country fully
digitises its planning rules. Finland's kaavatietomalli is **already Denmark-class in schema quality**; the
open question is item-level attribute *population*, not schema existence. **This is why Finland's projected
ceiling sits close to Denmark's, not near Portugal's** — the structural machinery already exists.

**Pilot model — Barcelona (~48%):** Barcelona demonstrates the phased climb — registry, per-clau packs,
block-derived construction envelopes, refusal vocabulary. Finland should mirror this **shape** (source one
region, build the reader, then scale by VOOKA rollout), **not** the numbers.

**What caps Finland below Denmark's ~96% even in the best case (~80–85%):**
1. **Setbacks are graphical, not formula-based.** Finnish asemakaava setbacks are plan-drawing markings (no
   national Abstandsflächen-equivalent formula) — not queryable as a kaavatietomalli numeric attribute
   (~5–10% of queries where setbacks govern). Denmark's *byggelinje* shares this cap.
2. **Heritage overlay is non-exhaustive by design.** Museovirasto's WFS excludes statute-protected (LVV
   channel) and plan-overlay-protected (municipality channel) buildings — a NOT-FOUND does not certify
   absence (README §2.5).
3. **Kaavayksikkö (plan-unit) adoption varies** even inside Ryhti-live regions — plans without plan-unit
   objects may not deliver parcel-level numeric attributes.
4. **Retroactive migration is voluntary.** The 1.1.2025→2029 mandate applies forward only; older plans stay
   in PDF/municipal WebGIS unless VOOKA migrates them. This alone is ~10–15 pts of the Denmark gap.

**And the binding cap that could COLLAPSE the ceiling to ~40–50%:** if the `_ix_` collections prove
**index-only** (boundary + PDF link — the Hamburg `app:hh_hh_festgestellt` B-Plan pattern), the structured
numeric-fill advantage disappears and Finland reverts to a PDF-extraction climb no better than the non-Ryhti
floor. **This one unknown gates every ceiling number below.**

### 1.4 — The Ryhti opportunity mapped onto the seven C63 axes (CONTINGENT)

Mapping the platform onto the seven C63 axes (§3) and their RATIFIED weights (§4 — LEGISLATION 25 ·
ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS 10 · TERRAIN 10 · CONTEXT 5):

| C63 axis | Weight | Current premise (Helsinki `COUNTRY-RATE.md`) | Once probed + wired (which Phase) |
|---|---:|---|---|
| **LEGISLATION** | 25% | national `~55–65%`/`~30–35%` prior; item schema unconfirmed; **not wired** into `siteDispatch.ts` | **Phase A — the biggest single gain.** If `_ix_` = attributes, Ryhti serves structured FAR/kerrosluku like Denmark's Plandata → Axis 2 climbs **with NO OCR**. If index-only → capped; PDF path (old Phase 4) |
| **ENVELOPE** | 20% | no rule pack (`not-assessed`) | **Phase A** — the C58 solver runs only on Ryhti-sourced numeric params; gated behind LEGISLATION + L-449 |
| **DATA-SOURCES** | 15% | **60%** — context-OSM `live`; Ryhti zone-GIS / MML cadastre / height all `documented` | **Rises across A + B + C** — Ryhti zone-GIS slot (A), cadastre-parcel slot (B), height slot (C) each move `documented`→`live` |
| **PARCEL** | 15% | `not-assessed` — no FI provider wired; falls to OSM footprint | **Phase B** — MML Kiinteistörekisteri OGC API (CC BY 4.0, self-service key) → `computeParcelConfidence` |
| **HEIGHTS/LOD** | 10% | `not-assessed` `(cap)` — open LoD2 / KMTK documented, **unwired** | **Phase C** — wire KMTK 3D Buildings / open LoD2 → shared nDSM module |
| **TERRAIN** | 10% | **50** — baked-but-unverified; MML WCS key-gated | **Phase C** — obtain MML key → `terrain.verify.mjs` round-trip → rung 50→100 |
| **CONTEXT** | 5% | **56%** — 5/9 layers baked | mostly done; rail/trees/sea ride the pending L-642 re-bake |

The LEGISLATION + ENVELOPE axes (**45% of the weight**) are the *first and largest* Finnish opportunity —
the exact inverse of Portugal, where they are the surviving cap. **All of this is `CONVERGENT-SECONDARY`
until the `_ix_` probe runs; no RATE cell moves on it.**

---

## 2 — Phase tracker (existing — retained)

The original Phase 0–5 tracker is retained. The Ryhti/geospatial work is re-framed into probed-and-wired
phases **A/B/C** in the **Phase-3 roadmap (§Phase-3)** below and cross-referenced: Phases 0/0b/1/4 remain the
LEGISLATION-axis climb; Phases A/B/C are the C63 seven-axis climb keyed to the RATIFIED weights.

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — Ryhti plan API + `ryhti_building` probed; `_ix_` item schema still pending (tooling gap) | Honest measured baseline — **conditional on `_ix_`** | — → **~30–40% OR ~55–65%** | Very Low | **IN PROGRESS** — endpoint + collections confirmed live; item schema blocked on tooling | UNASSIGNED |
| **0b** | Resolve `_ix_` schema — fetch `pub_valid_ld_plan_ix_gs/items?limit=1`; confirm index-only vs. index+attributes | Sets Phase A (attributes) vs. Phase 4 (index-only) as the next lever | Confirms ~55–65% (attributes) or ~30–40% (index-only) | Very Low — 5-min curl (NEXT §8) | NOT STARTED | UNASSIGNED |
| **1a** | Wire `ryhti_building` `open_address` nationally | Nationally-live building/address context, independent of plan rollout | baseline → +5% | Low | NOT STARTED | UNASSIGNED |
| **1b** | Wire the Ryhti plan path (if 0b = attributes): MML parcels + `pub_valid_ld_plan_ix_gs` + KMTK buildings + Museovirasto guard | First confirmed numeric-fill structured path (S/N Savo) | measured → **~55–65%** | Low-Medium | NOT STARTED (superseded/expanded by §Phase-3 A) | UNASSIGNED |
| **2** | Confirm Helsinki/Uusimaa VOOKA date + integrate SeutuRAMAVA floor-area | Adds the capital market; block-level FAR already structured | **~55–65%** → **~60–70%** | Low | NOT STARTED | UNASSIGNED |
| **3** | Track VOOKA rollout; auto-ingest each newly-migrated region | Extends Tier-1 coverage toward national | grows as VOOKA migrates | Low per region | NOT STARTED | UNASSIGNED |
| **4** | PDF extraction pipeline for non-Ryhti (or index-only) asemakaava plans | Raises PDF-bound regions ~30–35% → ~45–55% | **~30–35%** → **~45–55%** | Medium | NOT STARTED | UNASSIGNED |
| **5** | Full national coverage post-VOOKA + heritage multi-channel | Ceiling: ~80–85% | → **~80–85%** | Medium | NOT STARTED | UNASSIGNED |

---

## Phase-3 — Ryhti + geospatial roadmap (NEW, 2026-07-30)

The C63 seven-axis climb decomposes into three ordered phases keyed to the RATIFIED weights. **A** is the
Ryhti national-planning wiring (the highest-leverage, Denmark-like win — the biggest weight, 45%); **B** wires
the MML parcel provider (and obtains the credential that also unblocks terrain); **C** derives heights + moves
terrain 50→100. Each phase lists **goal · unlocks · axis · effort · dependency · blocker**. Every row is
`CONVERGENT-SECONDARY` until the named probe runs — the probe queue lives in [`NEXT.md`](./NEXT.md) §3/§8.

### Phase A — Probe + wire the Ryhti national planning platform (the second-Denmark move)

- **Goal.** **FIRST, run the single rate-defining probe** (NEXT §3.1/§8):
  `GET .../ryhti_plan/ogc/features/v1/collections/pub_valid_ld_plan_ix_gs/items?limit=1` in a GeoJSON-capable
  tool (curl/Python/Node — the API is open, no auth) and inspect `properties` for `tehokkuusluku` (FAR),
  `kerrosluku` (storeys), `kayttotarkoitus` (use code). **If attributes present:** wire the kaavatietomalli
  OGC API reader into `siteDispatch.ts` as the FI **regional-zone-GIS** provider; register a Savo (then
  Helsinki/Uusimaa) rule pack sourced to the Ryhti attributes; pass **every** extracted value through the
  **L-449** human-verification gate before it serves at `confidence: structured`. **Independently** wire
  `ryhti_building` `open_address` (nationwide, already `VERIFIED-LIVE`) as the building/address layer.
- **Unlocks.** **LEGISLATION + ENVELOPE (45% of the weight) — the biggest single gain**, and the DATA-SOURCES
  regional-zone-GIS slot (`documented`→`live`). If Ryhti is structured, this is a **Denmark-like win with NO
  OCR** — unlike PT/ES/FR/UK. This is the phase that materially raises Finland's ceiling (§1.4).
- **Axis.** LEGISLATION (Axis 2) · ENVELOPE (Axis 4) · DATA-SOURCES (Axis 3, zone-GIS slot).
- **Effort.** The `_ix_` probe is **Very Low** (one GET, no auth, ~5 min). Wiring the reader + one rule pack:
  **Low-Medium** *if attributes present*. **If index-only,** the LEGISLATION gain reverts to the Phase-4 PDF
  pipeline (**Medium-High**) and this phase's ceiling collapses — the effort is entirely schema-dependent.
- **Dependency.** The `_ix_` probe (NEXT §3.1) MUST run first — it decides Phase A vs. Phase 4. **L-449** gate
  before any Ryhti value serves `structured`; **ADR-0269** (curate-then-serve) — no value serves without a
  cited governing article in `sources/SOURCES.md`. Ryhti *plan* content is **South/North Savo only** today
  (the all-Finland `bbox` is a GeoServer CRS-extent default, NOT coverage); Helsinki/Uusimaa depends on the
  VOOKA migration date (NEXT §3.5). `ryhti_building` is already national.
- **Blocker.** The `_ix_` schema is **UNCONFIRMED** (tooling gap — binary payload — not an access gate);
  until read, the whole "second Denmark" is **possible, not measured**. If **index-only** (Hamburg B-Plan
  pattern → boundary + PDF link), the structured LEGISLATION gain **evaporates**. Setbacks stay graphical (no
  numeric attribute) regardless. Kaavayksikkö adoption varies; retroactive migration is voluntary. Do NOT
  report the coarse national ~55–65% prior as the Axis-2 score (§CONTEXT-DATA-HONESTY).

> ## 🇫🇮 = 🇩🇰-lite MILESTONE — "the second fully-automated country" (2026-07-30)
>
> Finland is the **second country after Denmark to be fully automated**, and the ONLY one whose sole
> founder friction is a **self-service key** (create-it-yourself at `omatili.maanmittauslaitos.fi` — no
> eID, no contract). The MML parcel provider is **BUILT + VERIFIED ahead of the key**:
> `packages/site-parcel-data/src/parcelProviders/mmlParcelProvider.ts` (`isInFinland` + `FINLAND_BBOX`,
> OGC API Features parse, EPSG:3067→4326 CRS-guard refusal, typed refusal union incl. the distinct
> `no-api-key` blocker, never-throws, OTel span) + 25 green tests. It goes live the instant `MML_API_KEY`
> lands and `/api/parcel/fi` is wired. **Success criteria — ALL must go green to close the milestone:**
>
> | # | Criterion | Gated on |
> |---|---|---|
> | 1 | ✅ **MML API key generated** (self-service — the ONLY founder friction) | founder |
> | 2 | ✅ **MML parcel lookup operational** — Helsinki click → real `kiinteistötunnus` via `/api/parcel/fi` | proxy wire + key |
> | 3 | ✅ **MML DEM operational** — same key unblocks the MML WCS terrain bake (Phase C) | key |
> | 4 | ✅ **Ryhti exposes `tehokkuusluku`** (FAR) in the `_ix_` item `properties` | code probe (UNPROBED) |
> | 5 | ✅ **Ryhti exposes `kerrosluku`** (height/storeys) in the `_ix_` item `properties` | code probe (UNPROBED) |
> | 6 | ✅ **Helsinki `computeParcelConfidence` ≥95%** — cadastre reads off the footprint fallback | key + sample |
>
> **Founder friction = ONE self-service key.** Criteria 4/5 are the code-only Ryhti `_ix_` probe
> (`RYHTI_IX_PROBE_URL` in the provider) — they stay ⬜ until the open no-auth GET actually runs (Phase A).
> Ship the probe before the fix. No RATE cell moves until each criterion is measured, not projected.

### Phase B — Obtain `MML_API_KEY` → wire the MML parcel provider + `computeParcelConfidence`

- **Goal.** Register for the **FREE self-service** MML open-data key (create-it-yourself at
  `omatili.maanmittauslaitos.fi` — no contract). **The `isInFinland` predicate + the `mmlParcelProvider`
  are ALREADY BUILT** (`parcelProviders/mmlParcelProvider.ts`, verified 25 tests) hitting the
  Kiinteistörekisteri OGC API Features
  (`avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/`, CC BY 4.0, nightly
  refresh); the remaining work is (a) the orchestrator registering `isInFinland→mml` in
  `parcelProviders/registry.ts` and (b) the `/api/parcel/fi` server proxy that injects the key.
  Run `computeParcelConfidence` over an N-parcel Helsinki sample so PARCEL reads from a national cadastre
  instead of the labelled OSM-footprint fallback (a footprint is never a legal parcel — C57 §L-640).
- **Auth shape the proxy must apply** (MML documents both — prefer Basic, fall back to the query param):
  HTTP Basic with **username = the API key and a BLANK password** (`Authorization: Basic base64("<key>:")`
  — note the trailing colon), OR the query param `?api-key=<key>` on the OGC items URL. The provider
  itself carries NO key (`buildMmlItemsUrl` is key-free); the proxy owns it server-side, exactly as
  `server/dkMatrikelProxy.js` carries the Danish credential. Key unset/rejected → the provider returns the
  `no-api-key` refusal → OSM footprint (graceful).
- **CRS.** MML is native ETRS-TM35FIN (**EPSG:3067**, projected metres); the proxy must request
  `crs=EPSG:4326` (OGC URI `.../def/crs/EPSG/0/4326`) so features arrive as WGS84 lon/lat. If a native-3067
  body ever comes back, the provider REFUSES `crs-unhandled` rather than fabricate a hand-rolled projection.
- **Terrain (Phase C) rides the SAME key** — the MML WCS DEM (`korkeusmalli`) is key-gated with the
  identical Basic/query-param auth. One self-service credential lights up PARCEL **and** TERRAIN.
- **Unlocks.** **PARCEL (Axis 1)** off the footprint fallback onto a national cadastre; DATA-SOURCES
  cadastre-parcel slot (`documented`→`live`). **The same MML key also gates Phase C terrain** (the MML WCS
  bake is key-gated) — so obtaining it is the highest-leverage single credential in the whole country.
- **Axis.** PARCEL (Axis 1) · DATA-SOURCES (Axis 3, cadastre slot).
- **Effort.** **Low.** Key is self-service email registration (no contract). Provider adapter + confidence
  sample: Low-Medium once field names + CRS (ETRS89/TM35FIN) are confirmed from a live GetFeatures.
- **Dependency.** `MML_API_KEY` obtained + stored as a repo secret (NEXT §3.2). Åland maintains a **separate**
  land registry by statute — **exclude** until confirmed independently (NEXT §3.6).
- **Blocker.** No live GetFeatures call executed yet — endpoint + licence confirmed from documentation only;
  CRS/field names `stated`, unverified. Åland separate. Ownership/mortgage history (Lainhuuto) is a **paid**
  tier — the open "simple" product carries geometry + IDs only.

### Phase C — Heights (KMTK / open LoD2) + terrain verify 50→100

- **Goal.** Wire the **KMTK 3D Buildings** feature class / open LoD2 CityGML (LiDAR-derived, national, open;
  storey count `kerroslukumäärä` a structured national attribute) as the FI height source in
  `heightSources.mjs` (currently `REGION_SOURCE helsinki` = `no-source`), feeding the **shared ES/FR nDSM =
  DSM−DTM module** (or a LoD2 direct-extrusion path). With the **Phase-B MML key** in place, run
  `terrain.verify.mjs` on the Helsinki tileset to move TERRAIN rung **50→100** (baked + independent-decoder
  round-trip + lit-and-correct).
- **Unlocks.** **HEIGHTS/LOD (Axis 6)** from `(cap)` documented-unwired to `tagged` measured; **TERRAIN
  (Axis 5)** 50→100 baked-and-verified; DATA-SOURCES height slot (`documented`→`live`).
- **Axis.** HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5) · DATA-SOURCES (Axis 3, height slot).
- **Effort.** **Medium.** The nDSM module is **SHARED** — the SAME module as Spain (L-511c) and France
  (L-512b); FI feeds different KMTK/LoD2 inputs. Do **NOT** one-off it per country. Terrain verify is one
  round-trip run once the key is set. KMTK storey count is cheap once field names are confirmed (NEXT §3.3).
- **Dependency.** Phase B (`MML_API_KEY` — the terrain bake is gated on it) and the shared ES/FR nDSM module.
  KMTK field-name + per-building fill confirmation (NEXT §3.3).
- **Blocker.** KMTK attribute name + per-building population rate **unconfirmed**; open LoD2 endpoint not
  wired; **RHR** (the richer per-building register, DVV) is **GDPR-gated — do NOT use it**; KMTK is the open
  path. TERRAIN stays rung-50 until the MML key + a `layer.json` 200 round-trip land. No RMSE-Z tier can be
  assigned until an accuracy spec is confirmed.

---

## 3 — The gap to Denmark (~96%)

Finland differs from Denmark in ways that are **legal and temporal, not structural** — which is exactly why
its ceiling is Denmark-adjacent rather than Portugal-like:

**(a) Retroactive plan migration is voluntary, not mandated (the primary gap).** Denmark's Plandata covers
its full active plan stock; Finland's 1.1.2025→2029 mandate applies **forward only**. Older plans stay in
PDF/municipal WebGIS unless VOOKA migrates them. ~10–15 pts of the gap. Closes with time (natural plan
turnover) or a hypothetical retroactive mandate.

**(b) The `_ix_` attribute question — the one that could turn the gap from ~15 pts into ~50 pts.** If the
Ryhti `_ix_` collections are index-only, Finland is not a second Denmark at all on the numeric axis; it is a
national **plan-discovery** layer (still valuable — replaces the 309-municipality WebGIS crawl) but PDF-bound
for the numbers. **This is the single gating unknown for the entire Denmark comparison** — resolve it (Phase
A probe) before quoting any ceiling.

**(c) Setbacks are graphical in both countries + heritage has named gaps.** Neither country delivers
structured setback attributes (a shared ~5% cap). Finland's Museovirasto two-channel non-exhaustion caveat
(LVV + municipality) is a structural cap requiring a multi-source discipline not yet standardised in any
pipeline (README §2.5).

**The kaavatietomalli schema is already Denmark-class in quality; the plan-stock *population* is the remaining
work.** That is the essential difference from Portugal, where the *schema itself* does not exist nationally.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **The `_ix_` schema probe (Phase A / NEXT §3.1) anchors everything** — it decides whether Finland's
  LEGISLATION axis fills from a structured API (Phase A) or from a PDF pipeline (Phase 4). Run it first; it is
  a ~5-minute open-API GET.
- **`MML_API_KEY` (Phase B / NEXT §3.2)** gates BOTH the parcel provider AND the Phase-C terrain bake — one
  free credential unblocks two axes.
- **L-449** (human-verification gate) is mandatory before any Ryhti/OCR-extracted value serves at
  `confidence: structured`. No extracted number may bypass it.
- **ADR-0269** (curate-then-serve): no Ryhti/PDM value serves without a citable governing article in
  `sources/SOURCES.md`.
- **VOOKA migration date for Uusimaa (NEXT §3.5)** gates whether Helsinki is Tier-1 (live) or Tier-2
  (near-term) for the *plan* layer; `ryhti_building` is already national.

**Current blockers:**
- **Ryhti `_ix_` item schema UNCONFIRMED** (tooling gap, not access) — the rate-defining unknown; no
  LEGISLATION cell moves until read (NEXT §3.1).
- **`MML_API_KEY` not yet obtained** — no live GetFeatures on the cadastre; CRS/field names unverified
  (NEXT §3.2).
- **KMTK 3D building field name + fill rate unconfirmed** (NEXT §3.3); open LoD2 endpoint not wired.
- **Museovirasto WFS not GetCapabilities-probed** (NEXT §3.4); heritage two-channel caveat unhandled.
- **Åland** is a separate cadastral/planning jurisdiction by statute — exclude from FI coverage claims until
  confirmed (NEXT §3.6). **RHR** ownership/occupancy register is GDPR-gated (DEAD END — use KMTK for massing).
- Ryhti *plan* content is **South/North Savo only** today; the all-Finland collection `bbox` is a GeoServer
  metadata default, NOT coverage — do not infer national plan coverage from it.

**Cross-jurisdiction reuse:**
- The **Ryhti kaavatietomalli OGC API reader (Phase A)** is reusable for **every Finnish region as VOOKA
  migrates it** — one ISO-based schema, ~309 municipalities, **no new legal research per region**. This is the
  inverse of Italy's 21-mechanism problem, and it is *closer to Denmark's Plandata reader than to any
  PDF-extraction adapter* — build it as a structured-API reader, not an OCR tool.
- The **nDSM height module (Phase C)** — DSM−DTM, 90th-percentile per footprint — is the SAME shared module as
  Spain (L-511c) and France (L-512b). FI feeds different KMTK/LoD2 inputs. Do NOT one-off it per country.
- The **KMTK 3D building path** can reuse the LOD1-extrusion approach validated for Spain/Switzerland
  (footprint extrusion) if finished LoD2 vectors are not reliably populated per-building.
- The **Finnish-language kaavamerkinnät PDF adapter (Phase 4, only if `_ix_` = index-only)** reuses the shared
  ES/FR/PT/UK ordinance-extraction pipeline core; only the thin Finnish-language adapter is FI-specific — do
  NOT build a FI-specific OCR tool.
- **If another jurisdiction's national planning API proves ISO 19109/19103/19107-based**, compare its schema
  to the kaavatietomalli — Finland's is the only ISO-grounded national zoning schema in the research series
  (NEXT trip-wire 4.6), and the reader may port.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96% — and the *shape* Finland may replicate for planning) ·
**Barcelona** `../es/es-ct/08019-barcelona/` (pilot climb). Governing: **C58** (fidelity/provenance),
**ADR-0269** (curate-then-serve), **L-449** (human-verification gate), **C63 §3/§4** (the seven axes + the
RATIFIED weighting). Data layer: [`README.md`](./README.md) (national — Ryhti / MML / KMTK reach + the
`_ix_` schema gap) · [`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city composite; Helsinki ~56%) ·
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (structured-fill; renamed from `RATE.md`, L-649) · [`NEXT.md`](./NEXT.md) (probe queue). All Ryhti/geospatial findings are
`CONVERGENT-SECONDARY` until live-probed — ship the probe before the fix.*
