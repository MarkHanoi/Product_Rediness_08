# Rate Implementation Plan — Switzerland (`ch`) national

**Current national legislation/data-fill:** **~20–25 % building-rule (MEASURED, Outcome B)** — zone-ID
structured, FAR = optional-unexposed model slot, height not modelled (see [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) — the
national structured-fill number, renamed from `RATE.md` per the L-649 migration) ·
**Current context-data axis (a DIFFERENT ruler):** ~85 % (physical 3D context — NOT the building-rule
number) · **Current bake-covered composite:** **~66 % `partial`** for Zürich · Genève · Bern
(DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56, assessed subset only — see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic ceiling (PROJECTED, CONTINGENT on the Phase-A/B/C probes landing):** context ~90–95 % (proven) ·
legal ~30–40 % with a per-canton FAR harvest + Baureglement pipeline (Outcome B) · **a well-sourced,
BZO-signed city (Zürich): ~60–75 % weighted** · **Ceiling model — Denmark (~96 %)** ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> **⚠ HONESTY GATE (§CONTEXT-DATA-HONESTY).** This is a PLAN. It changes **no RATE % cell** — the national
> building-rule number stays **~20–25 %**, the context-data axis stays ~85 %, and the Zürich/Genève/Bern
> composite stays **~66 % `partial`** until the phases below actually run and wire. Every projected gain
> here is `CONVERGENT-SECONDARY` (cited state + a founder-ratified weighting, **NOT** a scorecard re-run):
> the C63 scorecard function has not been shipped (C63 §8), so no per-axis number moves on this document.
> A doc asserting a source is wired is **not** a probed source, and a registered rule pack is **not** a
> signed one. **Ship the probe before the fix.**

> **Why Switzerland climbs cheaply — and where it doesn't.** Unlike the PDF-bound jurisdictions (PT/ES/FR),
> Switzerland's *geospatial half* is already near-ceiling: swisstopo delivers a genuine national cadastre
> (Amtliche Vermessung, keyless, all-canton), national terrain (swissALTI3D), national LOD2 heights
> (swissBUILDINGS3D + swissSURFACE3D nDSM), and national context (swissTLM3D). The 2026-07-24 **deciding
> probe** (`findings/SWITZERLAND-DATA-RECON-SPIKE.md`) resolved the legal half to **Outcome B**: the
> national ÖREB/geodienste delivery carries the **zone identification as data but not the numbers** —
> `Nutzungsziffer` (FAR) is an *optional, unexposed* federal-INTERLIS model slot, and max height is **not
> modelled at all**. So the *binding* cap is NOT geospatial fragmentation (as in PT); it is the
> **LEGISLATION + ENVELOPE** sourcing work — recovering FAR per-canton and extracting height from
> cantonal Baureglement PDFs, both L-449-gated. That is why the ROI sequence below wires the cheap,
> already-strong geospatial axes first (Phases A/B), then spends the expensive legal budget where it
> uniquely pays off — **Zürich, which already holds a registered BZO rule pack** (Phase C).

---

## 1 — The ceiling: what "maximum" means here

Switzerland is a **two-layer split** — and the two layers have structurally different ceilings.

**Context-data layer (~85 %, near ceiling).** The 3D physical context — buildings, terrain, roads, water,
parks, trees — is confirmed live from swisstopo/BFS product docs + live STAC/GWR probes. Genuinely among
the strongest in the benchmark; **this is NOT the comparable building-rule number** (a recurring conflation
trap — the "~88 %, highest of any jurisdiction" claim mixed the two rulers). Three low-effort context reads
(GWR Merkmalskatalog, TLM3D pedestrian/Freizeit sub-typing, municipal tree cadastres) push it to ~90–95 %.

**Building-rule layer (~20–25 %, MEASURED — Outcome B).** This is the comparable, cross-jurisdiction ruler
(zone/use code + a density metric + height, no PDF). The deciding probe **CLOSED Outcome A**: the national
geodienste WFS `ms:grundnutzung` (DescribeFeatureType + GetFeature) and the ÖREB 2.0 schema return zone-ID +
`dokument` only — no `nutzungsziffer`, no height; the overlay layer schema is identical. So the
"single reader for 26 cantons delivers the numbers" path does **not** open. Switzerland sits at
**France-class ~20–25 %** on this ruler.

**BUT the FAR ceiling beats France's.** The federal INTERLIS model `Nutzungsplanung_V1_2` defines a **typed,
optional** `Typ.Nutzungsziffer : 0.00 .. 9.00` slot reachable from every zone polygon. France's FAR exists
only as prose; Switzerland's exists as a **native numeric model field** some cantons populate — so FAR is
recoverable as **data** via a per-canton `Typ`-catalogue harvest (INTERLIS/ili2pg — data-plumbing, not OCR),
not as a single national WFS call. Height + setback remain genuinely PDF-bound (unmodelled) and need the
Baureglement extraction pipeline + L-449, exactly like France for height. **Realistic legal-layer ceiling
~30–40 %.**

**Ceiling model — Denmark (~96 %):** Denmark's national Plandata delivers zone code, numeric density, AND
height as machine-readable structured fields. Switzerland's zone boundary/code coverage is Denmark-level;
the numeric fill is not — FAR is an unexposed model slot and height is unmodelled. The Denmark ceiling is
not reachable for Switzerland without the numbers becoming structured data, which the per-canton FAR harvest
partially achieves and the Baureglement pipeline (height) only approximates.

**Pilot model — Barcelona (~48 %) / Zürich as CH's pilot city:** Barcelona demonstrates the phased climb —
registry → per-clau packs → block-derived envelopes → refusal vocabulary. **Zürich is Switzerland's pilot**:
it already holds a **registered City-of-Zürich BZO rule pack** (`rulepacks/chZurichBzo.ts` +
`chZurichBzoCatalogue.ts`: BZO 700.100 AZ / Vollgeschosse / Gebäudehöhe transcribed for both regimes) that
computes an `estimated-ruleset` envelope for BZO-regime-resolved parcels and honestly **refuses**
`regime-ambiguous` ones. Mirror the **shape**, not the numbers.

### 1.4 — Mapping the phases onto the seven C63 axes and their ratified weights

Weighting = `CITY_COMPLETION_WEIGHTS`, RATIFIED (founder, 2026-07-30, C63 §4): LEGISLATION 25 · ENVELOPE 20 ·
PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5.

| C63 axis | Weight | Current premise (this pass) | After the phase lands (projected, CONTINGENT) |
|---|---:|---|---|
| **PARCEL** | 15 % | `not-assessed` — swisstopo-AV IS wired (keyless, all-canton, ZH+GE live-verified) but **no `computeParcelConfidence` run** for any city bbox | **Phase A** — a confidence run turns the wired cadastre into a measured `high/medium/low` distribution; CH is cadastral-capable (not footprint-fallback) so the score should be high |
| **DATA-SOURCES** | 15 % | **80 %** — cadastre `live`, terrain `live`, context `live`; zone-GIS + nDSM `documented` (0.5 each) | **Phase A/B** — zone-GIS → `live` once `siteDispatch.ts`/proxy wiring lands; nDSM → `live` once the STAC→COG bake lands (§SWISS-NDSM-STAC-BUILD) → up to 5/5 slots |
| **HEIGHTS / LOD** | 10 % | `not-assessed` `(cap)` — measured-**capable** via swisstopo nDSM (keyless, STAC 200) but **unbaked/unwired** | **Phase B** — bakes the nDSM (DSM−DTM) → `tagged` measured heights replace the `assumed` default |
| **TERRAIN** | 10 % | **50 %** — swissALTI3D baked but **unverified** (rung-50, no `terrain.verify.mjs` round-trip) | **Phase B** — an independent-decoder round-trip lifts rung 50 → 100 |
| **CONTEXT** | 5 % | **56 %** — 5/9 layers baked (buildings·roads·water·parks·landuse); rail+trees config-added, unbaked | (out of A/B/C scope) — the L-642 rail/trees re-bake lands separately; sea genuinely absent (landlocked) |
| **LEGISLATION** | 25 % | `not-assessed` — Zürich holds a **registered BZO pack** but the `VERIFICATION.md` sign-off is **internally contradictory** (RISK R3); Genève/Bern have national cited-refusal only | **Phase C** — reconcile+sign L-449 for Zürich (pack→`human-reviewed`); per-canton FAR harvest + Baureglement pipeline for the rest |
| **ENVELOPE** | 20 % | `not-assessed` — Zürich pack ships `estimated-ruleset` but **buildable-land coverage UNMEASURED**; Genève/Bern refuse | **Phase C** — a C58 coverage survey measures Zürich's certified-vs-refuse share; Genève/Bern packs move cited-refusal → real |

The five geospatial axes (55 % of the weight) are **already wired or one build away** — Switzerland's
geospatial half does not need discovery, only wiring and a confidence/verify run. The binding cap is the
LEGISLATION + ENVELOPE axes (45 % of the weight), where the numbers are model/PDF-bound. **All projected
moves are `CONVERGENT-SECONDARY` and contingent on Phase A/B/C landing. No RATE cell moves on this doc.**

---

## 2 — Phase tracker (existing — retained)

The original national Phase 0–3 tracker (Outcome-B-pointed) is retained unchanged. The Phase-3 roadmap
(§Phase-3 below) re-frames it into probed-and-wired phases **A/B/C** ordered by ROI: A/B are the
geospatial-axis wiring (cheap, already-strong), C is the legal-axis climb (the binding cap).

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0 — Context closeout** | Read GWR Merkmalskatalog; confirm CityGML version; TLM3D pedestrian + Areale Freizeit sub-typing; municipal tree cadastres | Context layer climbs; GWR EGID join pipeline speccable | ~85 % → ~90–92 % | Very low — 3 doc reads | NOT STARTED | UNASSIGNED |
| **0b — DECIDING probe** | geodienste WFS `ms:grundnutzung` DescribeFeatureType + GetFeature; overlay layer; INTERLIS `.ili` | Establishes the legal ceiling model | NOT ASSESSED → **Outcome B measured** | — | ✅ **DONE 2026-07-24** | agent |
| **1 — Zone-ID structured provider** | A `ChZoningProvider` returning zone code/label/main-use from the geodienste WFS as `structured`; FAR/height `null` → estimated-ruleset; L-449 cert flag default OFF | First honest Swiss zone identity; numbers refused | zone-ID only | Low–Medium | NOT STARTED (founder call, not probe-authorised) | UNASSIGNED |
| **2 — Per-canton FAR harvest** | Ingest each canton's populated `Typ` catalogue (INTERLIS/ili2pg) → structured `Nutzungsziffer` as DATA; L-449 per canton | FAR becomes data where a canton populates the slot — CH's edge over France | +FAR (canton-dependent) | Medium (per-canton ingest) | NOT STARTED (⊂ §Phase-3 C) | UNASSIGNED |
| **3 — Baureglement extraction pipeline** | Point `@pryzm/ordinance-extraction` at cantonal BZO PDFs; one-parser-per-article; L-449 gate | Height + setback (unmodelled) become amber, France-style | +height/setback (projected) | High (per-plan-authority) | NOT STARTED (⊂ §Phase-3 C) | UNASSIGNED |

---

## Phase-3 — ROI-ordered roadmap (NEW, 2026-07-30)

The climb decomposes into three ordered phases, sequenced by return-on-effort against the ratified
weights. **A** wires the already-strong geospatial cadastre (cheapest measured win); **B** bakes heights +
verifies terrain; **C** is the LEGISLATION/ENVELOPE work that is the binding cap. Each phase lists
**goal · unlocks · axis · effort · dependency · blocker**. Every row is `CONVERGENT-SECONDARY` until the
named probe/run executes — the probe queue lives in [`NEXT.md`](./NEXT.md).

### Phase A — Run the parcel-confidence measurement + finish the DATA-SOURCES wiring

- **Goal.** Switzerland's national cadastre is **already wired**: `parcelProviders/registry.ts`
  `isInSwitzerland` → `swisstopo-av` (federal `api3.geo.admin.ch` identify `ch.kantone.cadastralwebmap-farbe`
  → real Grundstück with `egris_egrid` + local number + canton, **keyless, all-canton**, ZH + GE
  live-verified 2026-07-26; the cantonal ZH WFS returns a real 184-vertex ring, `findings/ZURICH-BZO-PROBE.md`
  §1). Phase A **runs `computeParcelConfidence` + `computeParcelMetrics` over an N-parcel sample** in each of
  the three city bboxes (Zürich / Genève / Bern) to turn the *wired* cadastre into a *measured* PARCEL score,
  and lands the two `documented`→`live` DATA-SOURCES upgrades: the zone-GIS proxy wiring
  (`siteDispatch.ts` / the `/api/ch/zurich-bzo` proxy + CSP) and confirming the geodienste WFS licence/fee.
- **Unlocks.** A **PARCEL measurement** (Axis 1 moves off `not-assessed`) and a **DATA-SOURCES bump** (Axis 3
  can climb past 80 % as slots move `documented`→`live`). This is the cheapest measured win because the
  hard part — a real national cadastre — is already wired and verified; only the confidence *run* is missing.
- **Axis.** PARCEL (Axis 1) · DATA-SOURCES (Axis 3).
- **Effort.** Low. The provider exists; this is a scorecard run + a proxy/CSP wiring task, not a data hunt.
  ~1–2 dev-days for the confidence run across the three bboxes; ~2–3 for the zone-GIS proxy landing.
- **Dependency.** The C63 scorecard function (`computeParcelConfidence` exists; the axis-scoring harness is
  C63 §8, not yet shipped). The zone-GIS `live` upgrade depends on the `siteDispatch.ts` proxy + CSP landing.
- **Blocker.** No scorecard function shipped yet (C63 §8) → the PARCEL number cannot be *computed* today, only
  the run designed. The geodienste WFS **fee structure is unconfirmed** ("Kosten können anfallen" — cantonal
  fees) — must confirm free-for-production before ingestion (NEXT §3.4). NE ÖREB endpoint URL still unknown.

### Phase B — Bake swissBUILDINGS3D heights (nDSM) + verify swissALTI3D terrain

- **Goal.** Feed the keyless swisstopo **nDSM = swissSURFACE3D DSM − swissALTI3D DTM** into the **shared
  building-height module** and bake per-city `tagged` measured heights, and independently **verify the
  already-baked swissALTI3D terrain** to lift its rung 50 → 100. The nDSM wiring is a **BUILD**
  (§SWISS-NDSM-STAC-BUILD): the naïve WCS-in-4326 shape is FALSE — `data.geo.admin.ch` is an object store
  (404 `NoSuchKey`); the real path is the **STAC → COG-stitch** + an **LV95 (EPSG:2056) ↔ WGS84 reprojector**
  the buildings bake runner does not yet install.
- **Unlocks.** **HEIGHTS/LOD** (moves `swissbuildings3d` from `documented`/`(cap)`/unbaked to `tagged`
  measured heights once baked — closes Zürich RISK R2) and **TERRAIN** (rung 50 → 100 once
  `terrain.verify.mjs` round-trips the deployed `layer.json` — closes RISK R7).
- **Axis.** HEIGHTS/LOD (Axis 6) · TERRAIN (Axis 5).
- **Effort.** Medium. The nDSM module is **shared** — the SAME module as Spain (L-511c) and France (L-512b);
  CH feeds different swisstopo STAC inputs. Do **NOT** one-off it per country. The terrain verify is a single
  `terrain.verify.mjs --tileset` round-trip per city against the existing bake.
- **Dependency.** The shared ES/FR nDSM module; the STAC→COG-stitch + LV95 reprojector build
  (§SWISS-NDSM-STAC-BUILD). Terrain verify depends only on the already-baked `terrain/<city>/layer.json`
  being deployed and 200.
- **Blocker.** The STAC→COG + reprojection build is unlanded — until it does, HEIGHTS stays measured-**capable**,
  never *measured* (capability is never reported as a measurement, §CONTEXT-DATA-HONESTY). The nDSM RMSE / roof
  method is documented, not per-building-provenance probed. Terrain rung stays capped at 50 until the
  independent decoder round-trip is recorded.

### Phase C — The LEGISLATION + ENVELOPE climb (the binding cap) — start Zürich

- **Goal.** Spend the expensive legal budget where it uniquely pays off. **(C1) Zürich — reconcile + sign.**
  Zürich already holds a **registered BZO rule pack** (`chZurichBzo.ts` + `chZurichBzoCatalogue.ts`) shipping
  an `estimated-ruleset` envelope, but `sources/VERIFICATION.md` is **internally CONTRADICTORY** (RISK R3): the
  top line reads "✅ SIGNED OFF 2026-07-26 · `CH_FAR_CERTIFIED` ON" while the per-parcel "Zürich BZO sign-off"
  line remains **UNSIGNED** with open items — (a) the docid→regime crosswalk is populated-but-not-human-CONFIRMED,
  (b) the exact source-PDF URLs are NOT CONFIRMED. Reconcile that contradiction, close the two open items
  (notably: docid **6808** — the single most frequent docid, ~555 polygons — is an **image-only scan** labelled
  "BZO 2016" but unverifiable from its own text, so those parcels correctly resolve `regime-ambiguous`), and
  land the **L-449 human sign-off**. **(C2) Per-canton FAR harvest** (INTERLIS/ili2pg on the populated
  `Typ.Nutzungsziffer` slot — CH's structural edge over France). **(C3) Baureglement extraction pipeline**
  (height + setback, unmodelled → France-style ordinance OCR). Then extend real city packs to Genève + Bern
  (today national **cited-refusal** only).
- **Unlocks.** **LEGISLATION** (Zürich pack → `human-reviewed` once R3 is reconciled and signed; FAR-as-data
  per canton; height/setback via the pipeline) and **ENVELOPE** (a C58 coverage survey measures Zürich's
  certified-vs-refuse buildable-land share; Genève/Bern packs move cited-refusal → real). These two axes
  (45 % of the weight) are the surviving cap after Phases A/B.
- **Axis.** LEGISLATION (Axis 2) · ENVELOPE (Axis 4).
- **Effort.** High — the "whole cost" (human-gated legal SOURCING). But: **(C1) Zürich reconcile+sign is
  LOW** relative to the payoff — the pack already exists; it needs a sign-off reconciliation, not new
  sourcing. **(C3) Baureglement OCR is a shared ES / FR / CH investment** — all three are PDF-bound for
  height; build the ordinance-extraction pipeline **generically** (per-plan-authority config: article
  patterns, glossary terms), never CH-specific. **(C2) FAR harvest** is per-canton INTERLIS ingest.
- **Dependency.** **L-449 human-verification gate** is mandatory before any numeric value ships
  `confidence: 'structured'` (or before `CH_FAR_CERTIFIED` legitimately flips at a hardened tier). ADR-0269
  (curate-then-serve): no BZO/Baureglement value serves without a citable governing article in SOURCES.md.
  ADR-0270: Swiss Nutzungsplanung governs via **Ausnützungsziffer + max height** (density-and-height model),
  NOT alignment — confirm per canton before assuming alignment logic. The C58 solver runs only on sourced
  numeric parameters. Zürich's C1 gates C2/C3 sequencing (prove the sign-off loop on the city that already
  has a pack).
- **Blocker.** ⚠ **The contradictory Zürich sign-off (RISK R3, flagged in the audit) is a soundness risk**:
  the scorecard must NOT launder an ambiguous `CH_FAR_CERTIFIED = ON` into LEGISLATION/ENVELOPE completeness
  — those axes stay `not-assessed` until the reconciliation lands (§CONTEXT-DATA-HONESTY). The **W2bIII height
  split** (8.5 m under BZO 91/99 vs 9.0 m under BZO 2016, AZ identical) makes a guessed regime a *fabricated
  height* — the resolver must keep refusing `regime-ambiguous` rather than guess (RISK R4). FAR harvest is
  blocked where a canton leaves `Typ.Nutzungsziffer` unpopulated. Baureglement height has **no national
  numeric sanity-check** (unlike Germany's BauNVO §17) — the L-449 gate is the only backstop against
  extraction error.

---

## 3 — The gap to Denmark (~96 %)

Three structural facts separate Switzerland from the Denmark ceiling. **Phases A/B relieve the geospatial
facts cheaply; the legal facts (a)/(c) are the binding cap and need Phase C.**

**(a) Numeric planning values are model/PDF-bound — the primary structural gap.** Denmark's Plandata
delivers zone code, density, AND height as typed, queryable fields. Switzerland's national delivery
(geodienste WFS + ÖREB 2.0) delivers the **zone identity** as data but **not the numbers**: FAR is an
*optional, unexposed* `Typ.Nutzungsziffer` model slot, and height is **not modelled anywhere** — it lives in
cantonal Baureglement PDFs. Closing this needs the **Phase C** FAR harvest (FAR-as-data per canton) + the
Baureglement extraction pipeline (height) + the L-449 gate. **This is the binding cap on Switzerland's
ceiling.**

**(b) The geospatial layers are strong — RELIEVED, not a gap.** Unlike PT/ES/FR (fragmented parcels),
Switzerland has a **complete national cadastre** (Amtliche Vermessung, keyless, all-canton), national terrain
(swissALTI3D), national LOD2 heights (swissBUILDINGS3D + swissSURFACE3D nDSM), and national context
(swissTLM3D). These are Denmark-level. The only work is **wiring + a measurement run** (Phase A) and **one
build** (the nDSM STAC→COG bake, Phase B) — not discovery. This is Switzerland's decisive advantage over the
PDF-bound jurisdictions.

**(c) FAR ceiling beats France's, but the numbers still are not delivered by default — and no national
numeric anchor exists.** The federal INTERLIS model gives FAR a native typed slot (France has only prose), so
FAR is recoverable as **data** via the per-canton `Typ` harvest — a real structural edge. But height/setback
remain unmodelled, and there is **no national ceiling GRZ/GFZ** (Germany's BauNVO §17 backstop) to sanity-check
extracted values across cantons — so the L-449 gate is even more critical here than in jurisdictions with a
national numeric anchor.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- The C63 **scorecard function** (C63 §8) is not shipped — until it is, PARCEL/HEIGHTS/etc. can be *run and
  measured* but the composite is authored by the manual Phase-1 audit, not computed. No hand-typed axis number.
- **`computeParcelConfidence` run** (Phase A) gates the PARCEL measurement for all three cities — the provider
  is wired; the run is missing.
- **L-449 human-verification gate** is mandatory before any legal numeric value serves `confidence:
  'structured'`. No Swiss numeric value is legitimately signed yet — and the Zürich `CH_FAR_CERTIFIED = ON`
  sign-off is **internally contradictory** (RISK R3), so it does NOT yet count as `human-reviewed`.
- **ADR-0269** (curate-then-serve): no BZO/Baureglement value serves without a citable governing article in
  `sources/SOURCES.md`.
- **§SWISS-NDSM-STAC-BUILD** (the STAC→COG-stitch + LV95↔WGS84 reprojector) gates any *measured* height —
  the object-store 404 makes the naïve WCS path a dead end.
- **ADR-0270** (setback vs. alignment): confirm the density-and-height model per canton before assuming
  alignment-governed logic.

**Current blockers:**
- **No C63 scorecard function shipped** — the composite is a manual audit; axis numbers are cited-derived,
  not computed. None may move a RATE cell without the run.
- **Zürich `VERIFICATION.md` sign-off is internally CONTRADICTORY** (RISK R3, OPEN) — LEGISLATION/ENVELOPE
  stay `not-assessed` until reconciled + signed. Do not launder the ambiguous gate into completeness.
- **swisstopo nDSM is unbaked/unwired** — the STAC→COG + reprojection build is unlanded; HEIGHTS is
  measured-**capable**, not measured.
- **Terrain rung capped at 50** — no `terrain.verify.mjs` round-trip recorded for any of the three cities.
- **geodienste WFS fee structure unconfirmed** — cantonal "Kosten können anfallen"; confirm free-for-production
  before ingestion. **NE ÖREB endpoint URL** still unknown. **ZG cantonal WFS geo-blocked** from non-DACH egress.

**Cross-jurisdiction reuse:**
- The **nDSM height module (Phase B)** — DSM−DTM, 90th-percentile per footprint — is the SAME shared module as
  Spain (L-511c) and France (L-512b). CH feeds different swisstopo STAC inputs. Do NOT one-off it per country.
- The **Baureglement / ordinance-extraction pipeline (Phase C3)** is a **shared ES / FR / CH investment** — all
  three are PDF-bound for their numeric height/setback values. Build it generically (per-plan-authority
  config), never CH-specific.
- The **`ChZoningProvider`** (geodienste WFS `ms:grundnutzung`, zone-ID only, L-449-gated default OFF) is
  directly reusable across all 19+ participating cantons via the ONE national endpoint — but it delivers zone
  *identity*, not numbers (mirrors `DkZoningProvider` / the Madrid-Córdoba shape).
- The **swisstopo-AV cadastre reader** is a single national reader keyed on `isInSwitzerland` for all ~2,100
  Gemeinden — the CH analogue of Germany's AGS / France's INSEE / PT's DICOFRE jurisdiction-routing pattern.
- The **per-canton `Typ`-catalogue FAR harvest** (INTERLIS/ili2pg) is Switzerland's **structural edge over
  France** — FAR-as-data where a canton populates the optional slot; build the INTERLIS ingest once, run per
  canton.
- The **GWR EGID join** (single federal register, one API) is reusable for every Swiss project bbox regardless
  of canton — proves storey count (`GASTW`) + construction year as per-building context/verification.
- **swissSURFACE3D COPC reader:** if built for CH, reusable for any future COPC-format LiDAR source.
- **C58 fidelity/provenance** applies to all `sources/SOURCES.md` rows; the L-449 gate is shared across every
  jurisdiction.

---

*Model references: **Denmark** [`../dk/`](../dk/) (ceiling, ~96 %) · **Barcelona**
[`../es/es-ct/08019-barcelona/`](../es/es-ct/08019-barcelona/) (pilot climb) · **Zürich**
[`./ch-zh/0261-zurich/RATE.md`](./ch-zh/0261-zurich/RATE.md) (CH pilot city — registered BZO pack).
Governing: **C58** (fidelity/provenance), **ADR-0269** (curate-then-serve), **ADR-0270** (density-and-height
model), **L-449** (human-verification gate), **C63 §3/§4** (the seven axes + ratified weighting). Data layer:
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) (national structured-fill; renamed from `RATE.md`, L-649) ·
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md) (per-city composite) ·
[`findings/SWITZERLAND-DATA-RECON-SPIKE.md`](./findings/SWITZERLAND-DATA-RECON-SPIKE.md) (the Outcome-B
deciding-probe transcript) · [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) (the contradictory Zürich
sign-off, RISK R3) · [`NEXT.md`](./NEXT.md) (probe queue). Every projected gain is `CONVERGENT-SECONDARY`
until the named run lands — ship the probe before the fix.*
