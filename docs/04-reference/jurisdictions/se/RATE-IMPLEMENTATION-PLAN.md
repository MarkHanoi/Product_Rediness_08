# Rate Implementation Plan — Sweden (`se`) national

**Current national legislation/data-fill:** `~40 %` post-2022 optimistic / `~20–30 %` land-area-weighted
conservative (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) — the structured-fill metric, renamed from `RATE.md`
per the L-649 migration) · **Current bake-covered
composite:** ~56 % `partial` (Stockholm only, DATA-SOURCES + TERRAIN + CONTEXT — see
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) · **Realistic ceiling (PROJECTED, CONTINGENT on the Phase-A/B/C
probes landing):** ~45–55 % national · ~55–65 % for a well-sourced, cadastre-confirmed city (Stockholm) ·
**Ceiling model — Denmark (~96 % national fully-digitised ceiling; ~87 % measured byzone)** ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the current
> national legislation number stays `~40 %`/`~20–30 %` and the Stockholm composite stays ~56 % until the
> probes below actually run and wire. The structural findings that frame the ceiling are a mix of
> `documented`/`stated` published-source reads and **one** live probe (the NGP 403 geo-block, 2026-07-24) —
> **no land-area fill-rate has ever been measured**, and the ceiling projections here are *contingent on
> Phase A/B/C landing*, not measured gains. A doc claiming a source is available is **not** a wired or
> probed source. **Ship the probe before the fix.**

> **Why Sweden's ceiling is structurally HIGH but land-area-capped (not OCR-capped like Portugal).**
> Sweden is the most promising jurisdiction studied after Denmark, for one structural reason: post-2022
> detaljplaner are authored against a **national digital standard** (Boverket's **Planbestämmelsekatalog**,
> ~3,700 machine-readable provision codes) and published through the **Nationella Geodataplattformen (NGP)**
> STAC/OAPIF stack. So — unlike Portugal (PDF-only numeric values, capped behind an OCR pipeline + L-449) —
> Sweden's LEGISLATION axis is **not** OCR-bound: a post-2022 plan returns zone use + density + height as
> *structured provision codes*. The binding cap is therefore **not** "can we read the number" but **three
> different facts**: (1) the **FREE `LANTMATERIET_API_KEY`** token gates the geospatial half (TERRAIN +
> HEIGHTS + the cadastral adapter) simultaneously; (2) the NGP API is **geo-blocked from non-SE IPs** (HTTP
> 403, probed 2026-07-24); (3) the majority of currently-operative zoned **land area** is very likely still
> pre-2022, undigitised, and absent from NGP — "236/290 municipalities live" is a *participation* metric,
> not a *land-area* metric. This is why the ROI sequence front-loads the token + parcel wiring (Phase A),
> then the nDSM/terrain unblock (Phase B), and treats the NGP land-area fill measurement + provision-code
> sourcing as the surviving cap (Phase C). Full source study:
> [`findings/SWEDEN-MASTER-DATA-SOURCE-STUDY.md`](./findings/SWEDEN-MASTER-DATA-SOURCE-STUDY.md).

---

## 1 — The ceiling: what "maximum" means here

Sweden is **token- and geo-block-bound**, not PDF-bound. Its central structural advantage over every other
jurisdiction studied (except Denmark) is that the numeric planning values already exist as structured data:
NGP delivers Planbestämmelsekatalog provision codes, not just a polygon + a PDF link (Germany's XPlanung
Stufe 1) or a PDF-only value (Portugal, France). This places Sweden in a **different structural position
from Scenario B (PDF-bound)** jurisdictions: the LEGISLATION axis is capped by *coverage of the existing
plan stock*, not by an extraction pipeline. What must be built is not an OCR pipeline — it is **(a)** the
free-token wiring for the geospatial axes and **(b)** an SE-resident proxy + a land-area fill-rate probe to
convert the structural estimate into a measured number.

**Ceiling model — Denmark (~96 %):** Denmark's national Plandata delivers zone code, numeric density, and
height as machine-readable structured fields, keyless. That is the proof that ~90–96 % is reachable when a
country fully digitises its planning rules *and* has no large pre-digital plan backlog. Sweden's mechanism
is Denmark-class (Planbestämmelsekatalog IS the structured semantic layer); **the gap to Denmark is legal
and temporal, not structural** — Denmark never had a large pre-2022 plan stock to worry about, while
Sweden's 2022 mandate applies only forward (§3).

**Pilot model — Barcelona (~48 %):** Barcelona demonstrates the phased climb — registry, per-clau packs,
block-derived construction envelopes, refusal vocabulary. Sweden should mirror this phase *shape*: start
with the bake-covered city (Stockholm), wire the free token, source one post-2022 detaljplan's structured
provisions, then scale to Gothenburg/Malmö. Mirror the **shape**, not the numbers.

**Sweden's binding caps (the surviving ceiling):**
1. **The FREE `LANTMATERIET_API_KEY` token** — free-account/scope-gated, **not keyless** (unlike Norway's
   Matrikkelen + Kartverket). One repo secret simultaneously gates TERRAIN (bake), HEIGHTS (LiDAR nDSM
   join), and the cadastral parcel adapter. Until set, three axes cannot land. *(Phase A/B — the cheapest,
   highest-leverage unlock.)*
2. **NGP geo-block from non-SE IPs** — HTTP 403 "Geolocation Block!" confirmed 2026-07-24. No feature query,
   fill-rate measurement, or field inspection is possible without a Swedish IP or an SE-resident proxy.
   *(Phase C — gates the LEGISLATION per-clau count.)*
3. **Pre-2022 land-area fraction** — the single most important unmeasured number in Swedish coverage. High
   municipal participation coexists with a majority of operative *land* very likely governed by
   undigitised older plans. This bounds how high the LEGISLATION axis can rise even after (1) and (2) are
   resolved. *(Phase C — a Monte-Carlo land-area probe, the L-609 Denmark method.)*

### 1.4 — Mapping the phases onto the seven C63 axes (CONTINGENT)

The seven C63 axes and their ratified weights (C63 §4), against the current cited-derived state and the
premise once Phases A/B/C land. Every "post-phase" cell is `documented`/`stated` until the named probe runs
— **no RATE cell moves on this table.**

| C63 axis | Weight | Current premise (cited-derived) | Post-phase (once probed + wired) |
|---|---:|---|---|
| **DATA-SOURCES** | 15 % | **60 %** (Stockholm) — 1/5 slots `live` (OSM context bake), 4/5 `documented` (cadastre, NGP zone-GIS, `lidar_se` nDSM, `se` terrain DEM) | **Jumps** — the free token promotes terrain DEM + cadastre `documented`→`live`; an SE proxy promotes NGP zone-GIS `documented`→`live` → up to 4–5/5 slots `live` |
| **PARCEL** | 15 % | `not-assessed` — no `isInSweden` predicate in `parcelProviders/registry.ts`; a Stockholm click falls to the OSM footprint fallback (never a legal parcel, C57 §L-640) | **Rises** — Lantmäteriet Fastighetsindelning is CC0 national (~90 % quality, README §2.1) once wired + `computeParcelConfidence` sampled |
| **CONTEXT** | 5 % | **56 %** — 5/9 layers baked (buildings·roads·water·parks·landuse) | **Rises** — rail + trees are config-added (`bake.mjs` LAYERS, L-642); once that re-bake lands → 7/9 |
| **HEIGHTS/LOD** | 10 % | `not-assessed` **(cap)** — measured-CAPABLE via `lidar_se` (national LiDAR nDSM), `impl:documented`, unbaked | **Rises** once the **shared nDSM = DSM−DTM module** bakes `lidar_se` over the Stockholm bbox → `tagged` heights. LOD2 volumes stay per-municipality **PAID** (Stockholm confirmed) |
| **TERRAIN** | 10 % | **50 %** — `terrain.mjs` `stockholm` (source `se` = Lantmäteriet Höjddata) baked-but-unverified; key-gated | **Unblocks to 100** once the free token is set + the `stockholm` bake runs + `terrain.verify.mjs` round-trip passes (national LiDAR CC0, coverage complete — the strongest terrain layer studied) |
| **LEGISLATION** | 25 % | `not-assessed` — national prior `~40 %`/`~20–30 %` is the COARSE prior (geo-blocked, not the L-449-verified per-clau count) | **Rises where post-2022 detaljplan land-area fill is confirmed**; capped by the pre-2022 stock + the geo-block. **Surviving cap** (§3a) |
| **ENVELOPE** | 20 % | `not-assessed` — no rule pack registered for any SE kommun | **Depends on LEGISLATION + the C58 solver** — the surviving cap after Phases A/B |

The five geospatial axes (DATA-SOURCES + PARCEL + CONTEXT + HEIGHTS + TERRAIN = **55 % of the weight**)
move from *token-blocked / unwired* to *fillable* the moment the free `LANTMATERIET_API_KEY` is set and the
parcel provider is wired. A back-of-envelope projection for a **well-sourced, cadastre-confirmed
Stockholm**: PARCEL ~0.85, LEGISLATION ~0.35 (land-area-capped), DATA-SOURCES ~0.85, ENVELOPE ~0.30,
TERRAIN ~0.9, HEIGHTS ~0.6, CONTEXT ~0.7 → **~55–60 % weighted**. So the *well-sourced-city* ceiling rises
to **~55–65 %** and the *national* ceiling to **~45–55 %** — bounded now by the LEGISLATION land-area fill +
the ENVELOPE C58 cost (45 % of the weight) and the NGP geo-block, **not** by an OCR gap. **All contingent on
Phase A/B/C actually landing.** No RATE cell moves on it.

---

## 2 — Phase tracker (national climb)

The national LEGISLATION climb (fill-rate measurement + provision-code sourcing) and the geospatial-axis
climb (the free-token + parcel + nDSM + terrain wiring) are cross-referenced: Phases 0–2 are the
LEGISLATION-axis measurement track; Phases A/B/C (the **Phase-3 roadmap** below) are the ordered,
probed-and-wired execution the token + geo-block unlock. The per-city execution mirrors Stockholm's
[`se-01/0180-stockholm/RATE-IMPLEMENTATION-PLAN.md`](./se-01/0180-stockholm/RATE-IMPLEMENTATION-PLAN.md)
(P1–P6).

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Register the FREE Lantmäteriet OAuth2 service account (`apimanager.lantmateriet.se`) + obtain `LANTMATERIET_API_KEY`; set the repo secret | Every SE geospatial axis (TERRAIN + HEIGHTS + cadastre adapter) — the single dominating gate | — (enables A/B) | ~0.5 dev-days | NOT STARTED | UNASSIGNED |
| **1** | Route a `GET .../collections` NGP call through a Swedish IP (Fly `arn` region / SE VPS) to defeat the geo-block; confirm the STAC/OAPIF endpoint returns features | The land-area fill-rate probe (Phase 2) + the LEGISLATION per-clau count (Phase C) | — | ~1 dev-day | NOT STARTED (NGP 403 confirmed 2026-07-24) | UNASSIGNED |
| **2** | Run the NGP land-area fill-rate probe (100–300 area-weighted points, one participating city — Gothenburg recommended; L-609 Denmark method); record hit-with-codes / hit-no-codes / miss | Converts the `~40 %`/`~20–30 %` structural range to a **measured** number; sets the honest national LEGISLATION ceiling | ~40 %/~20–30 % → TBD (measured) | Medium | NOT STARTED | UNASSIGNED |
| **A/B/C** | The geospatial + legislation execution roadmap | see §Phase-3 | per-axis | see §Phase-3 | NOT STARTED | UNASSIGNED |

---

## Phase-3 — the SE execution roadmap (NEW, 2026-07-30)

Three ordered phases by ROI. **A** is the free-token + parcel wiring (highest-leverage, cheapest win — one
repo secret unblocks three axes). **B** derives heights + verifies terrain off the same token. **C** is the
NGP land-area fill measurement + provision-code sourcing that is the surviving cap on the
LEGISLATION/ENVELOPE axes. Each phase lists **goal · unlocks · axis · effort · dependency · blocker**. Every
row is `documented`/`stated` until the named probe runs — the resume queue lives in [`NEXT.md`](./NEXT.md)
and the Stockholm [`NEXT.md`](./se-01/0180-stockholm/NEXT.md).

### Phase A — Obtain + wire `LANTMATERIET_API_KEY`, then wire the Lantmäteriet parcel provider

- **Goal.** **(1)** Register the FREE Lantmäteriet OAuth2 service account at `apimanager.lantmateriet.se`,
  obtain `LANTMATERIET_API_KEY`, and **set it as a repo secret** — this is the single token that
  simultaneously gates TERRAIN, HEIGHTS, and the cadastral adapter. **(2)** Add an **`isInSweden`
  predicate** + a **Lantmäteriet Fastighetsindelning** (property-boundary) parcel adapter to
  `packages/site-parcel-data/src/parcelProviders/registry.ts` (today the registry has `isInSpain`,
  `isInFrance`, `isInNorway`, `isInDenmark`, … but **no `isInSweden`** — a Stockholm click falls to the OSM
  footprint fallback). **(3)** Run **`computeParcelConfidence`** over an N-parcel Stockholm sample to
  measure the `high|medium|low` match distribution + click-inside-ring containment (C57 §2.4). Read the
  licence field directly to confirm the CC0 status (README §2.1 — don't infer).
- **Unlocks.** A **PARCEL + DATA-SOURCES jump** — this is the phase that materially moves Sweden's ceiling.
  The token promotes the terrain-DEM + cadastre + height slots `documented`→`live`; the parcel adapter
  moves PARCEL off `not-assessed` (Lantmäteriet cadastre is CC0 national, ~90 % quality). DATA-SOURCES rises
  from 60 % (1/5 live) toward 4/5 live.
- **Axis.** PARCEL (Axis 1) · DATA-SOURCES (Axis 3).
- **Effort.** Low. Token registration + repo secret: ~0.5 dev-days. `isInSweden` + Fastighetsindelning
  adapter + a `computeParcelConfidence` sample: ~2–3 dev-days (the predicate + adapter pattern is already
  proven for ES/FR/NO/DK in `registry.ts`).
- **Dependency.** Obtain the token first — it anchors every other SE geospatial row. `isInSweden` before
  `computeParcelConfidence` (no sample without a provider). The C57 registry pattern (existing predicates)
  is the template.
- **Blocker.** **THE TOKEN IS THE BLOCKER** — `LANTMATERIET_API_KEY` is **free-account/scope-gated, not
  keyless** (README §2.1 "high-value dataset" gate: account + intent statement + geographic scope). Until
  the repo secret is set, TERRAIN cannot bake, HEIGHTS cannot join, and the cadastre cannot resolve — all
  three wait on this one secret (COUNTRY-RATE §D). Secondary: Lantmäteriet **"akt" (deed) digital access is
  currently CLOSED** following a government security inquiry (README §2.1, NEXT §3.3) — direct status check
  required before assuming full cadastral-document access; this caps the plan-document *certifying* link,
  not the parcel geometry.

### Phase B — Derive heights (`lidar_se` nDSM shared module) + verify terrain 50→100

- **Goal.** Feed Lantmäteriet's national LiDAR (CC0, 2009–2019 complete, 0.5–1 pts/m²) into the **shared
  nDSM = DSM − DTM building-height module** via `heightSources.mjs` `lidar_se` (`REGION_SOURCE
  stockholm:'lidar_se'`, `impl:documented`, coverage `partial` → **APPEND top-up**), baking `tagged`
  measured heights over the Stockholm bbox; **and** run the `stockholm` terrain bake (`terrain.mjs` source
  `se` = Lantmäteriet Höjddata) + a **`terrain.verify.mjs` round-trip** to lift TERRAIN from rung **50
  (baked-but-unverified) → 100** (baked + independent-decoder pass + `layer.json` 200).
- **Unlocks.** **HEIGHTS/LOD** (moves `lidar_se` from `documented`/unbaked to `tagged` measured heights once
  baked) and **TERRAIN** (50→100). Sweden's national LiDAR is the **strongest terrain layer in any European
  jurisdiction studied** (CC0, complete — no per-Land patchiness).
- **Axis.** HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5).
- **Effort.** Medium. The nDSM module is **shared** — it is the SAME module as Spain (L-511c), France
  (L-512b), Norway, and Portugal (`heightSources.mjs` — "Shares the nDSM module with ES/PT/SE"); SE feeds
  different Lantmäteriet inputs. Do **NOT** one-off it per country. The terrain verify is one
  `terrain.verify.mjs` run per city.
- **Dependency.** **Phase A's token** (both the LiDAR nDSM download and the `se` terrain DEM are gated on
  `LANTMATERIET_API_KEY`) + the shared ES/FR/DK nDSM module. The two unlock **together** the moment the key
  is set (Stockholm NEXT trip-wire 2.1).
- **Blocker.** The token (Phase A) — no bake runs without it. **No national LOD2 building product** (unlike
  Denmark's "Danmark i 3D" / Germany's LoD2-DE): finished LOD2 volumes are **per-municipality PAID**
  (Stockholm confirmed fee-based). The FREE path is the coarser nDSM — do not conflate the free nDSM with
  the paid LOD2 volumes. Gothenburg (first city to deliver a building record to NGP) may offer free LOD2 —
  unconfirmed (NEXT §3.5).

### Phase C — NGP land-area fill + detaljplan provision sourcing (the surviving cap) — start Stockholm

- **Goal.** **(1)** Defeat the NGP geo-block (SE-resident proxy / Fly `arn`), run the **land-area fill-rate
  probe** (Phase 2) to establish the honest LEGISLATION ceiling; **(2)** for a Stockholm post-2022
  detaljplan, **count the structured Planbestämmelsekatalog provision codes** (zone use + density/FAR +
  height) it returns, cite each in `se-01/0180-stockholm/sources/SOURCES.md`, and pass it through the
  **L-449 human-verification gate** (`sources/VERIFICATION.md`) before it serves at `confidence:
  structured`; **(3)** then author the `se-0180-stockholm` C58 rule pack. **Start with Stockholm**
  (bake-covered), then **Gothenburg** (most data-forward — first NGP building record) and **Malmö**.
- **Unlocks.** **LEGISLATION** (structured provision-code fill, hardened by L-449) and **ENVELOPE** (the C58
  solver runs only on sourced numeric parameters). These two axes (45 % of the weight) are the surviving cap
  after Phases A/B — the free token does **not** touch them. Sweden's advantage: the numbers are **already
  structured** (Planbestämmelsekatalog, ~3,700 codes) — this is a *sourcing + coverage* cost, **not** an OCR
  cost (contrast Portugal).
- **Axis.** LEGISLATION (Axis 2) · ENVELOPE (Axis 4).
- **Effort.** High. This is the "whole cost" — human-gated legal SOURCING, the most expensive axis. But it
  is **cheaper than the PDF-OCR jurisdictions** (ES/FR/PT/UK): the semantic layer already exists as machine
  codes via the Boverket Planbestämmelsekatalog API (XML/JSON, ~3,700 codes, open). The cost is the SE proxy
  + the fill-rate probe + per-clau verification, not a bespoke extraction pipeline.
- **Dependency.** **An SE-resident proxy** (Fly `arn` region / SE VPS) to defeat the NGP geo-block —
  Phase 1. **L-449** (human-verification gate) is mandatory before any provision code serves at `confidence:
  structured`. ADR-0269 (curate-then-serve): no plan value serves without a citable governing provision code
  + the PDF plan-map reference (the PDF map remains **legally authoritative** even where NGP has the digital
  plan — RATE §3.5). Phase A's parcel provider gates attaching any extracted rule to a parcel; the C58
  solver gates ENVELOPE.
- **Blocker.** **NGP geo-blocked from non-SE IPs** (HTTP 403, 2026-07-24) — the standing #1 legislation
  blocker (NEXT §3.1). **The pre-2022 land-area fraction is unmeasured** — 236/290 municipal participation
  is a *process* metric, not a *land-area* metric; the majority of operative zoned land is very likely
  pre-2022, undigitised, and absent from NGP, which caps how high LEGISLATION can rise. **Setbacks are
  graphical** (*prickmark* / *kryss*), not a structured formula (no German-Abstandsflächen equivalent) —
  treat as `null`/plan-text-only. Boverket Planbestämmelsekatalog exact API base URL not resolved from a
  non-SE origin (NEXT §3.4). All `documented`/`stated` until live-probed from an SE IP.

---

## 3 — The gap to Denmark (~96 %)

Three facts separate Sweden from the ~90–96 % Denmark ceiling — but **Sweden's gap is legal and temporal,
not structural** (unlike Portugal's, whose gap is a missing OCR pipeline).

**(a) Land-area coverage of the plan stock — the primary gap (the surviving cap).** Denmark's national
Plandata delivers structured dimensions for essentially all operative zoned land, keyless. Sweden's NGP
delivers the same *kind* of structured data (Planbestämmelsekatalog provision codes) but only for **post-2022
plans**, which are a minority of operative land area. Closing this gap does **not** need an OCR pipeline
(the semantic layer exists) — it needs **plan turnover or a retro-digitisation mandate**, both outside
PRYZM's control, plus the **Phase C** fill measurement + L-449 sourcing to serve what IS in NGP. Until the
land-area fill is measured and the geo-block defeated, the **LEGISLATION + ENVELOPE** axes (45 % of the
weight) cannot rise regardless of how well the geospatial layers are wired. **This is the binding cap on
Sweden's ceiling.**

**(b) The NGP geo-block — a deployment constraint, not a data gap.** Denmark's Plandata WFS is keyless and
reachable from anywhere. Sweden's NGP is live and in use by 236 municipalities but returns **HTTP 403 from
non-SE IPs**. This is relieved by an SE-resident proxy (Fly `arn` / SE VPS) — a deployment cost, not a data
absence. It gates every fill measurement and per-clau count (Phase C).

**(c) No national LOD2 + paid municipal volumes — a HEIGHTS partial-gap.** Denmark's "Danmark i 3D" and
Germany's LoD2-DE give free national building volumes. Sweden has **no national LOD2 product**; finished
LOD2 volumes are per-municipality and often **PAID** (Stockholm confirmed fee-based). The FREE path is the
coarser national LiDAR **nDSM** (Phase B), which yields `tagged` heights but not full LOD2 fidelity. This
caps HEIGHTS/LOD below the Denmark/Germany ceiling for the free path.

**Where Sweden BEATS Portugal/Germany/France:** the planning-rule vocabulary (Planbestämmelsekatalog) is a
**structured semantic layer** — the problem is coverage, not mechanism. Heritage (RAÄ WMS) is the
best-confirmed free open layer in the study (VERIFIED LIVE 2026-07-24, national, JSON, no credentials, NONE
fees). Terrain is CC0 and complete. So Sweden's climb, once the token + proxy are in place, is materially
cheaper per axis than any PDF-bound jurisdiction.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **`LANTMATERIET_API_KEY` (free repo secret) — Phase A** anchors every SE geospatial row (TERRAIN, HEIGHTS,
  cadastre). It is the single dominating gate; set it first (COUNTRY-RATE §D, Stockholm NEXT §3).
- **`isInSweden` predicate + Fastighetsindelning adapter (Phase A)** gate ALL parcel-level work. Do not
  design any parcel pipeline before the predicate lands in `parcelProviders/registry.ts`.
- **An SE-resident proxy (Phase 1 / Phase C)** gates every NGP feature query, fill-rate probe, and
  provision-code count. No LEGISLATION number moves without it.
- **L-449 (human-verification gate)** is mandatory for any NGP provision code before it serves at
  `confidence: structured`. No value bypasses this gate.
- **ADR-0269 (curate-then-serve):** no plan value serves without a citable governing provision code in
  `sources/SOURCES.md` **and** the accompanying PDF plan-map reference (the PDF map is legally authoritative
  even where NGP carries the digital plan — RATE §3.5).
- **C58 (ENVELOPE):** the solver + a registered `se-0180-stockholm` rule pack are required before ENVELOPE
  moves off `not-assessed`.

**Current blockers:**
- **`LANTMATERIET_API_KEY` unset** — the dominating gate; TERRAIN + HEIGHTS + cadastre all wait on it.
- **NGP geo-blocked from non-SE IPs** — HTTP 403 confirmed 2026-07-24; no fill-rate or per-clau probe until
  an SE proxy is available.
- **Land-area fill rate never measured** — 236/290 is participation, not land-area; the whole LEGISLATION
  ceiling hinges on this one unmeasured number (NEXT §3.2).
- **Lantmäteriet "akt" (deed) access CLOSED** — government security inquiry; caps the plan-document
  certifying link (NEXT §3.3). Re-check `lantmateriet.se` for current status.
- **Boverket Planbestämmelsekatalog exact API base URL** not resolved from a non-SE origin (NEXT §3.4);
  `pb.boverket.se` is a dead host — the live portal is `api-portal.boverket.se` (NEXT §7 dead ends).
- **LOD2 outside Stockholm unknown** — Gothenburg (first NGP building record) may offer free LOD2;
  unconfirmed (NEXT §3.5).

**Cross-jurisdiction reuse:**
- The **nDSM height module (Phase B)** — DSM−DTM, P90 per footprint — is the SAME shared module as Spain
  (L-511c), France (L-512b), Norway, and Portugal (`heightSources.mjs`: "Shares the nDSM module with
  ES/PT/SE"). SE feeds different Lantmäteriet inputs. Do **NOT** one-off it per country.
- The **`isInSweden` parcel predicate** follows the existing `registry.ts` pattern (`isInSpain`,
  `isInFrance`, `isInNorway`, `isInDenmark`, …) — one predicate + one national adapter, the proven C57
  pattern. Do not invent a new shape.
- **SCB kommunkod routing** is Sweden's jurisdiction-routing key (the analogue of Germany's AGS / France's
  INSEE / Portugal's DICOFRE) — one national reader keyed on the 4-digit kommunkod for all SE municipality
  folders (COUNTRY-RATE §0). Gothenburg `1480` (se-14) / Malmö `1280` (se-12) inherit the identical
  cheap-axis derivation once bake-covered.
- The **RAÄ heritage WMS** (`pub.raa.se/visning/lamningar_v1`) is VERIFIED LIVE, national, keyless — build
  ONE national heritage reader (fornlämning / övrig kulturhistorisk lämning), not per-city instances. RAÄ
  is being merged into NGP (from autumn 2022) — a structural advantage over every other country studied.
- The **land-area fill-rate probe** is the SAME Monte-Carlo method as Denmark's L-609 byzone sampling —
  reuse it, don't reinvent. Expect the count→area move to go the "wrong" way when big polygons are the
  empty/older ones (Denmark L-609 §2 lesson; NEXT trip-wire 4.2).
- The **"participation ≠ land-area fill" distinction** generalises: any jurisdiction with a "mandatory
  national digital plan standard since [year]" inherits it (NEXT trip-wire 4.5).

---

*Model references: **Denmark** `../dk/` (ceiling, ~90–96 %) · **Barcelona** `../es/es-ct/08019-barcelona/`
(pilot climb). Governing: **C58** (fidelity/provenance), **ADR-0269** (curate-then-serve), **L-449**
(human-verification gate), **C63 §3/§4** (the seven axes + ratified weighting: LEGISLATION 25 · ENVELOPE 20 ·
PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5). Data layer:
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city composite) · [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md)
(national structured-fill; renamed from `RATE.md`, L-649) ·
[`README.md`](./README.md) (national data layer) · [`NEXT.md`](./NEXT.md) (blockers + resume steps) ·
[`findings/SWEDEN-MASTER-DATA-SOURCE-STUDY.md`](./findings/SWEDEN-MASTER-DATA-SOURCE-STUDY.md). Stockholm
dossier: [`se-01/0180-stockholm/`](./se-01/0180-stockholm/RATE.md). Findings are `documented`/`stated` (one
live probe: NGP 403, 2026-07-24) until live-probed from an SE IP — ship the probe before the fix.*
