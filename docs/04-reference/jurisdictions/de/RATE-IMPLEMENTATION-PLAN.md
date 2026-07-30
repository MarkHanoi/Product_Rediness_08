# Rate Implementation Plan — Germany (`de`) national — PHASE-3 (C63 composite)

**What this plan climbs:** the **C63 seven-axis city completion RATE** (PARCEL · LEGISLATION ·
DATA-SOURCES · ENVELOPE · TERRAIN · HEIGHTS/LOD · CONTEXT), *not* only the national structured-fill
number. The structured-fill number is the **LEGISLATION axis input** — its own climb lives in
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) *(currently `RATE.md`; rename pending the L-649/Phase-2
migration, owned by governance)*. This document sequences the **other six axes** in front of it,
because in Germany they are the high-ROI wins.

**Current composite state (do NOT edit these cells — they live in the dossiers):**
Berlin `44% partial` · München `29% partial` (both assessed over only 2 of 7 axes — DATA-SOURCES +
CONTEXT; see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)). Köln (NRW) is **not yet scored** (no dossier, no
bake region). National LEGISLATION structured-fill prior `~28%`. ·
**Realistic composite ceiling:** ~75–85% for a fully-wired **NRW** city (Köln); lower nationally,
capped by the LEGISLATION axis (~65–70%, the permanent §34 floor) and per-municipality ENVELOPE
sourcing. · **Gap to Denmark (~96%):** the un-closeable part is the §34 ~30% legal floor. ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED · **Model:** federated (16-Land, thin adapters).

> **§CONTEXT-DATA-HONESTY banner.** This is a **PLAN**. It changes **no** RATE % cell — every arrow
> below is a *planning target*, not a score, and every geospatial claim it rests on is
> **CONVERGENT-SECONDARY** (multi-source, unprobed) **EXCEPT one**: **NRW LoD2 CityGML open download is
> VERIFIED-LIVE** (`opengeodata.nrw.de`, 2026-07-24). Empty and failed are the same value. No phase
> moves an axis until that Land's service is **probed live, wired, and verified** — every phase below is
> ordered **probe → wire → verify**. Ship the probe before the fix.

---

## 1 — The ceiling: what "maximum" means here

Germany is the **inverse of Portugal**: PT is centralised-but-sparse; DE is **rich-data-but-federated**.
National *standards* exist (AdV's AFIS / ALKIS / ATKIS, one schema, national identifiers, VG250 routing);
national *services* do not (16 Länder, 16 endpoints, 16 licence regimes, no federal reverse-coordinate
lookup). The whole climb is therefore an exercise in **service orchestration, not data quality** — and its
top object is a **router**, not a monolithic provider (`GERMANY.md §1`).

**Per-axis ceilings — why the six geospatial axes climb fast and the two legal axes do not:**

| Axis | Weight (C63 §4) | Reachable ceiling | Why |
|---|---:|---|---|
| **DATA-SOURCES** | 15 % | **~80–100%** | 5 slots; for NRW, cadastre (`alkis-nrw`) + LoD2 (`fetchLod2DeNrw`) + terrain (`koln`) + OSM are already wired — only the zone-GIS slot lags. |
| **HEIGHTS/LOD** | 10 % | **~90–100%** | **LoD2-DE carries TRUE height (measuredHeight / traufhoehe / firsthoehe) directly — SKIP the nDSM pipeline.** Germany is the *easiest* of ES/PT/DE for heights. |
| **CONTEXT** | 5 % | **~56% now → higher** | OSM bake — ports free; a `bake.mjs` REGIONS row is the whole cost (rail/trees pending the L-642 landing). |
| **TERRAIN** | 10 % | **~100%** | DGM1/2/5 LiDAR per-Land = the Spanish PNOA workflow (GeoTIFF → quantized mesh); one `REGIONS` row + a bake per Land. |
| **PARCEL** | 15 % | **~100% (NRW) → per-Land** | ALKIS is one national schema; NRW is keyless-open (DL-DE Zero). Other Länder are licence-gated → the ceiling is per-Land until the licence clears. |
| **ENVELOPE** | 20 % | **partial** | Buildable envelope is a **municipal** matter — per-Bebauungsplan rule packs, human-gated (like Barcelona). The expensive axis. |
| **LEGISLATION** | 25 % | **~65–70% (capped)** | The §34 "fit-the-neighbourhood" fraction (~30% of Germany) yields **no numeric answer by law** — a permanent structural floor, not a data gap. Detail: [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md). |

**The anchor — NRW is the "German Barcelona".** NRW (readiness 9.6) is the one Land where the top of the
LOD ladder is **VERIFIED-LIVE**: LoD2 CityGML open download, keyless ALKIS (DL-DE Zero), DGM1 LiDAR,
DOP10, flood, OGC API Features. Wiring one NRW city (Köln) lights five of the seven axes at once and
proves the federated adapter pattern end-to-end. Everything downstream of `ParcelFeature` is **identical to
the Barcelona replication model**; only the legal rule pack stays municipality-specific.

**The federated architecture (build ONCE, subclass per Land).**
`GermanyBoundaryResolver (VG250 → AGS → Land) → provider registry → { NRWProvider, BerlinProvider,
BayernProvider, … }`. `AbstractALKISProvider` is written **once** (one national ALKIS schema); each Land
subclass overrides only `endpoint / auth / CRS / reverse-lookup`. One `GermanyTerrainProvider`, one CityGML
LoD2 reader, one BauNVO §17 table — all national, configured per Land. This is why per-Land expansion
(Phase B/C) is *thin adapters*, not 16 re-implementations.

**Denmark comparison (~96%):** Denmark's Plandata delivers zone + density + height as structured fields
per plan polygon. Germany's *geospatial* stack is architecturally at parity (LoD2 heights arguably richer);
the composite gap to Denmark is entirely in the two **legal** axes — the §34 floor (permanent) and
per-municipality XPlanung/Bebauungsplan sourcing (buildable, human-gated). Mirror Barcelona's **shape**
(routing → per-Land data → per-city rule packs), not its numbers.

---

## 2 — Phase tracker

ROI-ordered. "Axes" = which C63 axes the phase lifts. "Target" = a *planning* arrow, **never a RATE cell**;
measurement-only phases explicitly move nothing.

| Phase | Goal | Axes lifted | Target (plan only) | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | **National routing** — `GermanyBoundaryResolver` (VG250 polygon → AGS → Land) + provider registry | (enabler — no axis) | no cell moves — prerequisite | **VERY LOW** | NOT STARTED | UNASSIGNED |
| **A** | **Wire NRW as the German Barcelona (Köln)** — `AbstractALKISProvider` + `NRWProvider`; **consume LoD2 TRUE heights directly (SKIP nDSM)**; add Köln `bake.mjs` REGION + Köln dossier | PARCEL · DATA-SOURCES · HEIGHTS/LOD · CONTEXT · TERRAIN | Köln new dossier → highest DE composite (plan est. ~55–75%) | MED | NOT STARTED | UNASSIGNED |
| **B** | **Per-Land parcel + height expansion** — `BerlinProvider` → `HamburgProvider` → `BayernProvider` → `BWProvider` (LAND-REGISTRY onboarding order); per-Land LoD2 fetchers | PARCEL · DATA-SOURCES · HEIGHTS/LOD | Berlin `44%→↑` · München `29%→↑` (plan) | MED / Land | NOT STARTED | UNASSIGNED |
| **C** | **Per-Land terrain + orthophoto** — `GermanyTerrainProvider` → Land DGM1 GeoTIFF → quantized mesh (PNOA workflow); DOP10/20 wiring | TERRAIN · (DATA-SOURCES) | Berlin/München TERRAIN `outside-coverage → 50/100` (plan) | LOW-MED / Land | NOT STARTED | UNASSIGNED |
| **D** | **Municipal envelope packs** — four-regime classifier (§30/§34/§35) + XPlanung content-vectorised ingestion / Satzung-PDF path + BauNVO §17 sanity + per-Land Abstandsflächen + **L-449 gate** | LEGISLATION · ENVELOPE | toward the ~65–70% LEGISLATION cap (per city) — see `LEGISLATION-RATE.md` | HIGH / municipality | NOT STARTED | UNASSIGNED |

---

## 2.1 — Phase 0 — National routing (prerequisite)

- **Goal.** `lon/lat → GermanyBoundaryResolver (VG250 polygon → AGS → Land) → provider registry`. No parcel,
  terrain, height, or ortho call is made before this resolves the Land.
- **Unlocks.** Every per-Land wiring in Phases A–D. The AGS join key (== PT DICOFRE / FR INSEE / EU LAU) is
  the routing spine; Land = first 2 digits, Landkreis = first 5.
- **Axis.** None directly — an *enabler*. Moves no cell.
- **Effort.** VERY LOW (★★★★★). VG250 is national, open (DL-DE BY 2.0), download + WFS.
- **Dependency.** None — this is the floor.
- **Blocker.** None known. Probe: VG250 WFS `GetCapabilities` + one point-in-polygon resolve (`NEXT.md §8`).

## 2.2 — Phase A — Wire NRW as the "German Barcelona" (first big win)

- **Goal.** Stand up `AbstractALKISProvider` (written once) + `NRWProvider` (endpoint/auth/CRS/reverse-lookup
  only), **consume LoD2-DE TRUE height directly** (measuredHeight / eaves / ridge — **explicitly skip the
  DSM/nDSM derivation**), add a Köln `bake.mjs` REGION, and scaffold the `de-nw/05315-koln/` dossier of the
  fixed C63 shape.
- **Unlocks.** Proves the federated adapter end-to-end; Köln becomes the highest-scoring DE city and the
  reference implementation every later Land reuses.
- **Axis.** **PARCEL** (NRW keyless ALKIS `alkis-nrw`, DL-DE Zero → cadastral, not footprint-fallback) ·
  **DATA-SOURCES** (cadastre + LoD2 `fetchLod2DeNrw` + terrain `koln` are *already wired* — only the
  zone-GIS slot lags → slot mean climbs toward ~4–5/5) · **HEIGHTS/LOD** (LoD2 `tagged` provenance replaces
  the 9 m assumed carpet) · **CONTEXT** (Köln bake → 5/9) · **TERRAIN** (`terrain.mjs koln` = DGM1 NRW already
  present → verify + score).
- **Effort.** MEDIUM. Much of the NRW data spine already exists in code (`alkis-nrw`, `fetchLod2DeNrw`,
  `terrain.mjs koln`); the net-new work is the `AbstractALKISProvider` refactor, the Köln bake REGION, and
  the dossier scaffold.
- **Dependency.** Phase 0 (routing resolves the Land before any NRW call).
- **Blocker.** Köln has **no bake region and no dossier** today (`COUNTRY-RATE.md §C`). ALKIS reverse-lookup
  endpoint URL, DOP10 tiling scheme, and flood field names are probe items (`LANDS/NORDRHEIN-WESTFALEN.md §20`)
  — none blocks the LoD2 wire.

## 2.3 — Phase B — Per-Land parcel + height expansion

- **Goal.** Add `BerlinProvider → HamburgProvider → BayernProvider → BWProvider` as thin `AbstractALKISProvider`
  subclasses, in the `LAND-REGISTRY.md` onboarding order (NRW → Berlin/Hamburg → Bayern/BW → rest); wire each
  Land's LoD2 fetcher.
- **Unlocks.** Lifts the two currently-scaffolded cities off footprint-fallback: Berlin (44%) and München (29%).
- **Axis.** **PARCEL** (per-Land ALKIS) · **DATA-SOURCES** (cadastre + LoD2 slots per Land) · **HEIGHTS/LOD**
  (per-Land LoD2 tiles — Berlin FIS-Broker open convergent; BW / Sachsen-Anhalt open convergent).
- **Effort.** MEDIUM per Land — endpoint/auth/CRS differ, but the schema and downstream are shared.
- **Dependency.** Phase A (the `AbstractALKISProvider` + LoD2 reader must exist first).
- **Blocker.** **Every Land row is CONVERGENT-SECONDARY — probe before wiring.** Known snags:
  **Bavaria LoD2 licence** is `blocked` (München HEIGHTS = `license-restriction`; ZSHH INSPIRE-restricted) —
  München heights cannot move until Bavaria's terms clear (trip-wire `NEXT.md §4.4`). Hamburg ALKIS auth TBD.
  Berlin CRS is 25833 (east zone) — confirm the declared service CRS on probe.

## 2.4 — Phase C — Per-Land terrain + orthophoto

- **Goal.** One `GermanyTerrainProvider` → the resolved Land's DGM1 WCS/GeoTIFF → quantized mesh → Cesium
  (the Spanish PNOA workflow, no parser difference); wire DOP10/20 orthophotos alongside.
- **Unlocks.** Berlin and München currently score TERRAIN `outside-coverage` (the DE DTM source covers NRW/`koln`
  only). Wiring their Land DGM lifts TERRAIN off the floor.
- **Axis.** **TERRAIN** (0 → 50 baked → 100 baked+verified) · secondary **DATA-SOURCES** (terrain-DEM slot).
- **Effort.** LOW-MED per Land — one `REGIONS`/terrain row + a bake per Land.
- **Dependency.** Phase 0 routing (which Land's DGM to fetch). Independent of Phases A/B otherwise.
- **Blocker.** Per-Land DGM endpoint + CRS probe. Apply the **white-mask fix** on every bake (normals in bake +
  `enableLighting` + `requestVertexNormals`; ADR-0278) — flat-lit terrain with no octvertexnormals is the known
  L-636/L-639 defect. Score stays at rung-50 until `terrain.verify.mjs` round-trips (C63 §3 Axis 5).

## 2.5 — Phase D — Municipal envelope packs + L-449 → LEGISLATION

- **Goal.** Build the **four-regime classifier** (§30 B-Plan / §34 unplanned-interior / §35 outlying, + Berlin's
  Baunutzungsplan-1958/60 legacy layer) **once**, then per municipality: ingest XPlanung WFS where the corpus is
  **content-vectorised** (MV-style populated `grz`/`z`) or transcribe the Satzung PDF where it is a **scan corpus**
  (Hamburg/Berlin, Engine-2 behind the L-449 gate); use BauNVO §17 as an **upper-bound sanity only, never a parcel
  default**; wire per-Land Abstandsflächen (BayBO Art. 6 confirmed; HBauO §6 / BauO Bln §6 pending).
- **Unlocks.** The LEGISLATION and ENVELOPE axes — PRYZM's differentiator, and the bulk of the composite weight
  (45%). This is the existing national legislation climb, folded in as the final, most expensive phase.
- **Axis.** **LEGISLATION** (verified-cited claus / total claus, hardened by L-449) · **ENVELOPE** (rule-pack
  solver coverage per buildable-land share; `rulepacks/registry.ts` currently holds **zero DE packs**).
- **Effort.** HIGH, per-municipality, human-gated — the SOURCING is the whole cost.
- **Dependency.** Phase A (a trustworthy parcel to attach the rule to) **and** the regime classifier (no numeric
  sourcing runs until a parcel's regime is fixed).
- **Blocker.** The **content-vectorised fraction per Land** (measure before budgeting a city — cheap WFS probe);
  the scan corpus needs OCR + the L-449 gate; **Berlin's Baunutzungsplan carries a judicial *funktionslos* voidance
  risk** (OVG Bln-Bbg 2020, Az. 2 B 10.17) — those figures can never ship above `corroborated`. Full detail and the
  spike evidence live in [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) and `findings/GERMANY-DATA-RECON-SPIKE.md`.

---

## 3 — The gap to Denmark (~96%)

Denmark reaches ~96% because one national Plandata serves zone + density + height as structured fields. Germany's
composite gap decomposes into one *irreducible* part and one *buildable* part:

**(a) The §34 floor is permanent — ~30% of Germany, and it caps the LEGISLATION axis, not the geospatial ones.**
BauGB §34 deliberately provides no numeric envelope; the correct output for a §34 parcel is a **cited refusal**,
not a fill. This caps LEGISLATION at ~65–70% by law — no data engineering closes it. Crucially it does **not** cap
PARCEL/DATA-SOURCES/HEIGHTS/TERRAIN/CONTEXT, which is exactly why this plan front-loads those axes.

**(b) 16 Länder = 16 access integrations — buildable, but a sustained operations commitment.** Denmark has one
Plandata; Germany has 16 endpoints sharing one data model. Open confirmed for NRW and Sachsen-Anhalt; partially for
Berlin/Brandenburg (GDI-BE); licence-TBD for Bavaria; unknown for the rest. The `AbstractALKISProvider` +
`GermanyTerrainProvider` + one CityGML reader collapse this to *thin adapters*, but each Land still needs its own
probe + licence clearance. This is the federated tax, and it is the reason Phases B/C are per-Land, not national.

**(c) XPlanung populated ≠ XPlanung compliant.** The legal mandate requires the geometry, not that GRZ/GFZ/Höhe be
populated — so the achievable LEGISLATION ceiling per Land is the **content-vectorised fraction** of its in-force
corpus (MV-style ~33% populated vs Hamburg/Berlin scan-corpus ~0%). Measured, not assumed (Phase D blocker).

**(d) Germany's counter-advantage — heights.** Unlike Denmark's structured-field parity, Germany's LoD2-DE carries
TRUE roof geometry, so the HEIGHTS/LOD axis can *exceed* what a levels-derived estimate gives elsewhere. This is the
one axis where DE is ahead — bank it early (Phase A), skip the nDSM pipeline entirely.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **Phase 0 routing gates everything.** No per-Land call is designed or built before `GermanyBoundaryResolver`
  resolves the Land. Very low effort — do it first.
- **Phase A `AbstractALKISProvider` + LoD2 reader gate Phase B.** Build the abstraction once on NRW (the
  VERIFIED-LIVE anchor); every later Land is a subclass override, not a rebuild.
- **The four-regime classifier (Phase D) gates all numeric sourcing.** No GRZ/GFZ/Höhe value is served until a
  parcel's regime (§30/§34/§35) is fixed — shipping a number for a §34 parcel is a legal fabrication.
- **L-449 human-verification gate** is mandatory for any XPlanung/Satzung-extracted value before it serves above
  `corroborated`. ADR-0269 (curate-then-serve): never serve a value not cross-checked to a citable article.
- **Per-Land licence clearance gates that Land's PARCEL/HEIGHTS.** Bavaria LoD2 (`blocked`) blocks München HEIGHTS
  until its terms clear; Hamburg ALKIS auth is TBD.

**Current blockers (all CONVERGENT-SECONDARY unless flagged — probe before any wire):**
- VG250 WFS `GetCapabilities` not run — cannot finalise the routing resolver field names.
- Köln has **no bake region and no dossier** — the highest-ROI DE city is unscaffolded (`COUNTRY-RATE.md §C`).
- Per-Land ALKIS reverse-lookup / auth / declared-CRS unconfirmed for every Land except NRW's LoD2 cell.
- Bavaria LoD2 licence TBD (ZSHH INSPIRE-restricted); Hamburg LoD2 openness TBD (Transparenzportal).
- XPlanung content-vectorised fraction unmeasured per Land; scan-corpus OCR viability unconfirmed.

**Cross-jurisdiction reuse (build once, configure per Land/city):**
- **`AbstractALKISProvider`** — one national ALKIS schema, 16 endpoint subclasses. Never write a monolithic
  `GermanyProvider`.
- **`GermanyTerrainProvider`** — the ES PNOA workflow (GeoTIFF → quantized mesh); one provider → Land DGM endpoint,
  no parser difference. Reuses the shared terrain bake + the white-mask normals fix (ADR-0278).
- **One CityGML LoD2 reader** — the same format as Barcelona context buildings and France LiDAR LoD2. The
  height-provenance stamp is shared; **the nDSM/DSM module is ABSENT by design for Germany — do not build it.**
- **The four-regime classifier** — Germany's single most reusable legal asset; its core is a XPlanung-WFS
  point-in-polygon presence/absence check, identical machinery in every Land (only the endpoint + layer name differ).
- **The BauNVO §17 table** — a fixed national closed list; hard-code once as *Orientierungswerte* (upper-bound
  sanity), reuse in all 16 Länder, never as a parcel default.
- **The L-449 gate** — the same human-verification gate used for every sourced jurisdiction.
- **VG250 → AGS routing** — mirrors PT DICOFRE / FR INSEE / ES INE resolvers; the same municipality-key pattern.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona** `../es/es-ct/08019-barcelona/`
(the replication-model shape DE maps onto once routing exists) · **NRW / Köln**
`LANDS/NORDRHEIN-WESTFALEN.md` (the VERIFIED-LIVE anchor — wire first). National architecture:
[`GERMANY.md`](./GERMANY.md) · 16-Land matrix [`LAND-REGISTRY.md`](./LAND-REGISTRY.md) · dataset inventory
[`GERMANY-GEOSPATIAL-DATA-INVENTORY.md`](./GERMANY-GEOSPATIAL-DATA-INVENTORY.md) · composite roll-up
[`COUNTRY-RATE.md`](./COUNTRY-RATE.md) · LEGISLATION climb [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md).
Governing: **C63** (seven-axis completion) · **C58** (fidelity/provenance) · **ADR-0269** (curate-then-serve) ·
**L-449** (human-verification gate) · **ADR-0278** (terrain white-mask normals).*

*Last updated: 2026-07-30. Maintainer: UNASSIGNED. This PHASE-3 plan supersedes the prior legislation-only
climb, which is now Phase D. No RATE cell changed.*
