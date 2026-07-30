# Rate Implementation Plan — Denmark (`dk`) national — C63 city-completion climb

**Current rate:** ~66% · `partial:true` (per-city C63 composite, see [`COUNTRY-RATE.md`](./COUNTRY-RATE.md)) ·
**Realistic near-term target:** **~70–80%** (Legislation axis credited on the signed mapping; the
rest pending per-city ingestion validation — **NOT auto-100**) ·
**Realistic ceiling:** ~92–96% of the *assessable* axes, minus the **access-deferred** parcel/live-data axes ·
**Last updated:** 2026-07-30 · **Owner:** UNASSIGNED

> ### ⚑ 2026-07-30 SCOPE — "OFFLINE LEGISLATION + DEFERRED LIVE DATA" (founder ruling, mirrors Sweden)
> - **Legislation = DERIVED (L-449 SIGNED, 2026-07-30).** The PLANDATA → buildable-envelope mapping is
>   signed against BR18 §168–186: `maksbebyggelsesprocent → FAR = pct/100`, `maksbygningshojde → height`,
>   `maxetager → storeys`, with the **densityScope** (parcel / property / planning-area) preserved and
>   HONOURED — FAR is stated only at parcel scope, else withheld. Recorded in
>   [`dk-PLANDATA-ENVELOPE-MAPPING.md`](./dk-PLANDATA-ENVELOPE-MAPPING.md); implemented as the DK planning
>   **rule pack** (`packages/site-parcel-data/src/rulepacks/dkPlandataEnvelope.ts`). This offline-legislation
>   half is complete and **shippable with no live-data dependency**.
> - **Live cadastre / PLANDATA = DEFERRED.** A Datafordeler administrator account cannot be bootstrapped —
>   it is gated behind Danish **MitID** identity, the **same access class as Swedish BankID**. So there are
>   **no** live Datafordeler/PLANDATA credentials. The DK **parcel provider**
>   (`parcelProviders/dkMatrikelParcelProvider.ts`) is a **deferred stub** on the canonical interface
>   (returns `null` → OSM footprint fallback; Datafordeler adapter = a single method-body swap behind a
>   `// DEFERRED:` seam). **This is an access gap, NOT a code gap** — do not claim the country is live.
> - **Honest scoring:** Legislation axis credited (signed mapping); PARCEL + the live DATA-SOURCES slots =
>   **access-deferred** (MitID/BankID-class), not `not-assessed`-for-code-reasons. Target ~70–80% pending
>   per-city ingestion validation; the residual is data-quality/scope-encoding + access-deferral, both
>   honest (not fabricatable — C58 §1.4).

> **Denmark is the benchmark ceiling proof — and this plan is why.** Every other jurisdiction's plan
> points at Denmark as the ~96% data-readiness exemplar. But its C63 *completion* composite is only
> ~66% · `partial:true` today — five of the seven axes are honestly `not-assessed` (C63 §1.2), and the
> two heaviest (LEGISLATION 25, ENVELOPE 20) are held there **by the unsigned L-449 verification gate,
> not by missing data.** Denmark is therefore the ONE country whose completion rate can rise **furthest,
> fastest, and cheapest**: the numbers already exist as machine-readable fields in one open national
> register (Plandata.dk, ~96% digital-data byzone fill — see
> [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md), *renamed from `RATE.md` per the L-649 migration*). No OCR pipeline, no rule-transcription, no cadastral reconstruction. The whole
> climb is **wiring + one human sign-off**. §CONTEXT-DATA-HONESTY: this is a PLAN — it moves no RATE cell;
> a phase only lifts an axis when that axis's probe runs and the scorecard re-derives.

---

## 1 — The ceiling: what "maximum" means here

Denmark is the inverse of every PDF-bound jurisdiction. Portugal's ceiling is capped ~25–35% because its
numeric planning values are *prose in scanned PDFs* needing an OCR + rule-extraction pipeline before any
number can serve. Denmark has **no such wall**: `bebygpct` (FAR), `maxbygnhjd` (height), `maxetager`
(storeys) and `anvendelsegenerel` (use) are first-class WFS attributes on the adopted plan features at
`geoserver.plandata.dk` (WFS 2.0, keyless, VERIFIED-LIVE 2026-07-23). The national *data-readiness* rate
is ~96% (≈87% pure-structured byzone fill; L-609/L-611).

**So why is the C63 composite only ~66% · `partial`?** Because C63 measures *per-city completion across
seven axes*, and completion is orthogonal to data-readiness (C63 §3.1). Today only two axes are assessed
for the four tackled cities:

- **DATA-SOURCES = 70%** — 5-slot checklist, three slots `documented`/credential-gated not yet `live`.
- **CONTEXT = 56%** — 5/9 baked layers (national `denmark` bake).

The other five — PARCEL, LEGISLATION, ENVELOPE, TERRAIN, HEIGHTS/LOD — are `not-assessed` with typed
reasons (C63 §1.2): the probes have not run, and (for LEGISLATION/ENVELOPE) **C63 §1.6 forbids reporting
`human-reviewed` without a signed `sources/VERIFICATION.md`** (the C58 L-449 gate). The composite of ~66%
is renormalised over the assessed subset only (C63 §1.5) — it is honest, not a wall.

**The ceiling model is Denmark's own data:** the LEGISLATION axis prior is ~96% and the underlying feeds
(Matriklen, BBR, DHM LiDAR) are all national and survey-quality. So the *realistic* completion ceiling is
**~92–96%** — essentially 100% of every axis that can be probed, minus the genuinely-unreachable residual
(~1–2 pp plan-omitted / `kortbilag`-drawing-only / BR18-deferred legislation, an honest source absence
that is **not fabricatable** — C58 §1.4). Denmark reaches this ceiling not by building infrastructure but
by **wiring the credentials, running the probes, and signing the gate** — the cheapest, highest-ROI climb
of any audited jurisdiction.

**Mirror the *shape*, not the position:** a PDF-bound jurisdiction copies this phase ordering
(law-and-envelope first, then parcel/data, then height/terrain, then scale) but starts from a far lower
structural position because it must *build* what Denmark only has to *wire*.

---

## 2 — Phase tracker

Status vocabulary is FIXED (C63 / master-tracker): **NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED ·
VERIFIED · N/A**. "Rate: from→to" is the affected **axis** moving off `not-assessed` toward its ceiling;
it is descriptive, not a measured cell — the composite only re-derives when the scorecard function runs
(C63 §8). No cell below is a fabricated number.

| Phase | Goal | Axis (weight) | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|---|
| **A** | **Wire PLANDATA.dk (Lokalplaner + Kommuneplan) as the per-city legislation source AND sign the L-449 `VERIFICATION.md` for Copenhagen** — run the byzone click-weighted fill probe scoped to the 0101 bbox, cite per-clau values in a city `sources/SOURCES.md`, land the Danish-planner sign-off on the 2 open legal items; then measure per-city ENVELOPE solver coverage | **LEGISLATION (25)** + **ENVELOPE (20)** | The two heaviest axes off `not-assessed` toward the ~96% ceiling — with **zero OCR** (data already machine-readable); the first country to hold *certified* per-city law | LEGISLATION `not-assessed` → toward ~96% (per-city measured) · ENVELOPE `not-assessed` → toward measured solver coverage | **Low–Medium** (data exists; cost = the per-city clau audit + ONE human sign-off, not sourcing) | NOT STARTED | UNASSIGNED |
| **B** | **Wire the national register triad** — Matriklen cadastre parcel + BBR building register + DAR addresses (all SDFI/Datafordeler) with the `DATAFORDELER_USERNAME/PASSWORD` credential set in env; run `computeParcelConfidence` over an N-parcel sample in each city bbox; lift the 3 `documented` DATA-SOURCES slots to `live` | **PARCEL (15)** + **DATA-SOURCES (15)** | Trustworthy legal parcels under every downstream number (C57); DATA-SOURCES from 70% toward full checklist | PARCEL `not-assessed` → toward sample distribution · DATA-SOURCES ~70% → toward ~90–100% | **Medium** (wiring exists — `matrikel-dk` in `registry.ts`; cost = the credential + the sample run) | NOT STARTED | UNASSIGNED |
| **C** | **Wire national LiDAR height + verify terrain** — enable the DHM nDSM join (`dhm_overflade−dhm_terraen`, P90, **BBR floor-count validated** — DK's unique cross-check) with `DATAFORDELER_API_KEY`; probe the per-bbox `heightProvenance` histogram; run the `copenhagen` DHM terrain bake → `terrain.verify.mjs` round-trip | **HEIGHTS/LOD (10)** + **TERRAIN (10)** | Real measured skyline (nDSM+BBR, ★★★★★) not the 9 m carpet; terrain from rung-0/`not-assessed` → 50 → 100 | HEIGHTS/LOD `not-assessed` → toward `tagged` fraction · TERRAIN `not-assessed` → 50 → 100 (decoder pass) | **Medium** (shared nDSM module; cost = apikey + bake + verify round-trip) | NOT STARTED | UNASSIGNED |
| **D** | **Scale to Aarhus / Odense / Aalborg** — replay Phases A–C for the three next-largest cities; they inherit the SAME national providers (Plandata WFS, Matriklen, DHM, national OSM bake) so each is a re-run of the probes, not new sourcing; register their terrain bake rows; re-derive `COUNTRY-RATE.md` | all 7 (per city) | The national composite rises across all four tackled cities; proves the climb ports at ~national marginal cost | per-city composites ~66% · `partial` → toward the assessed ceiling | **Low per city** (national coverage — only the per-city probe + terrain row differ) | NOT STARTED | UNASSIGNED |

> ⚠ A phase marked SHIPPED here becomes **VERIFIED** only when the affected axis is re-measured and the
> city `RATE.md` / `COUNTRY-RATE.md` re-derives (C63 §8). Marking a phase done never moves a rate on its
> own. Phase A's LEGISLATION move is additionally gated: no `structured` fill may be laundered into a
> `human-reviewed` completion number until `VERIFICATION.md` is signed (C63 §1.6 / L-449).

### Per-phase dependency + blocker detail

- **Phase A — dependency:** the byzone click-weighted fill harness (reproduce from `sources/SOURCES.md`)
  scoped to the 0101 extent; a city `sources/SOURCES.md` with per-clau citations; the Danish-planner
  sign-off in `sources/VERIFICATION.md`. **Blocker:** the **2 open legal items** in `VERIFICATION.md` —
  (1) **§USABLE-FALLBACK instrument precedence** (a dimensionless local plan shadowed by the richer
  `kommuneplanramme` beneath it) and (2) **byggefelt bindingness semantics** (`bygvejledende` /
  `bygkunifelt` / `iomfangreg`). Both need a human planner; C63 §1.6 forbids `human-reviewed` until they
  are signed. ENVELOPE also depends on replacing the Copenhagen `dkPerimeterBlock` STUDY band with cited
  per-plan setback/coverage once A's sign-off lands (C58 certifiability).
- **Phase B — dependency:** the DK **parcel provider** now exists on the canonical interface as a
  **deferred stub** (`parcelProviders/dkMatrikelParcelProvider.ts` — returns `null` → OSM footprint
  fallback; the Datafordeler adapter is a one-method-body swap behind the `// DEFERRED:` seam). **Blocker
  is ACCESS, not code:** the Datafordeler cadastre is credential-gated and a service-user/admin account
  cannot be bootstrapped — it requires **Danish MitID** identity (the **same access class as Swedish
  BankID**). So `DATAFORDELER_USERNAME/PASSWORD` cannot be obtained, PARCEL stays **access-deferred**, and
  the parcel/height/terrain DATA-SOURCES slots stay `documented`. This is deferral, not a defect — the
  buildability engine + rule pack do not depend on it (proven in `dkPlandataEnvelope.test.ts`).
- **Phase C — dependency:** `DATAFORDELER_API_KEY` in env; the DHM WCS/nDSM join (`heightSources.mjs`
  `geodanmark` impl:`live`; `bake.mjs` denmark `heightJoin:'dhm'`) and the `terrain.mjs` `copenhagen`
  source `dk` row already exist. **Blocker:** both are **apikey-gated** — the Copenhagen adapter "skips
  loudly until the key is in env"; without it heights fall back to the honest OSM `assumed` default and no
  `layer.json` 200 / `terrain.verify.mjs` round-trip can be confirmed.
- **Phase D — dependency:** Phases A–C landed for Copenhagen as the template; a terrain bake row per new
  city in `terrain.mjs` (only Copenhagen is registered today). **Blocker:** none structural — the national
  providers already reach every DK bbox inside the `denmark` region (`7.70,54.40,15.30,57.90`); the only
  per-city work is running the probes and adding the terrain row.

---

## 3 — The gap to 100% (why the composite isn't already ~96%)

Denmark **is** the data-readiness ceiling, so — unlike every other jurisdiction's plan — the gap here is
NOT about missing data. Three facts separate the ~66% completion composite from its ~92–96% ceiling, and
each is a wiring/verification act, not a build:

**(a) The L-449 human-verification gate is unsigned — the primary gap, and it is not a data gap.**
The LEGISLATION and ENVELOPE axes (45% of the weight combined) are `not-assessed` because C63 §1.6 forbids
`human-reviewed` completion without a signed `sources/VERIFICATION.md`, and Denmark's still carries 2 open
legal items. The ~96% structured fill is the *country prior*, not a per-city measured, human-verified
number — borrowing it into a city cell would be the §CONTEXT-DATA-HONESTY country-borrow trap. This is the
single highest-leverage move in the entire audit: **a Danish planner's sign-off converts a live
`structured` source into a certifiable completion number.** No other country can close its top-weighted
axes this cheaply — everyone else must first *build* the number the sign-off would verify.

**(b) The authoritative feeds are credential-gated, not absent.** Matriklen (parcel), the DHM nDSM
(height), and the DHM WCS (terrain) are national and survey-quality, but Datafordeler gates them behind
`DATAFORDELER_USERNAME/PASSWORD` + `DATAFORDELER_API_KEY`. Until the secrets are in the bake/deploy env,
PARCEL, HEIGHTS/LOD, and TERRAIN cannot be probed and three DATA-SOURCES slots stay `documented`. This is
an env/ops gap (Phases B–C), not a sourcing gap — contrast Portugal, where 174/308 municípios have *no
cadastral geometry to gate*.

**(c) The probes simply have not run — completion ≠ readiness (C63 §3.1).** Even where the data is live
and keyless (Plandata zoning, the national OSM context bake), the C63 axis numbers are `not-assessed`
until the scorecard function draws a sample for the specific city bbox. High national data-readiness does
not launder a per-city measurement PRYZM has not executed. This is why Denmark is honestly ~66% ·
`partial` today and will stay there on paper until each axis's probe runs — the plan converts *readiness*
into *measured completion*, phase by phase.

The genuinely-unreachable residual (~1–2 pp: recreational zones that cap no building, `kortbilag`
drawing-only dimensions, BR18-deferred numbers) is an honest source absence — **not closable and not
fabricatable** (C58 §1.4). That, plus whatever apikey/credential access is permanently withheld, is the
only reason the ceiling is ~92–96% and not a literal 100%.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies (must resolve in order):**
- **L-449 (`sources/VERIFICATION.md`) sign-off** gates the LEGISLATION and ENVELOPE `human-reviewed`
  states — Phase A cannot lift either axis past `structured`-prior without it (C63 §1.6). This is the
  first move and the whole ROI story: sign the gate on a source that is *already live*.
- **`DATAFORDELER_USERNAME/PASSWORD`** gates ALL parcel-level work (Phase B). Do not design a parcel
  pipeline before the credential is confirmed in env — the wiring (`matrikel-dk`) already exists.
- **`DATAFORDELER_API_KEY`** gates the DHM nDSM height join and the DHM terrain bake (Phase C). Without it,
  heights keep the honest OSM `assumed` default and no terrain round-trip can pass.
- **ADR-0269 (curate-then-serve):** no per-clau value serves at `confidence: structured` until it is
  cited to a governing plan/`doklink` in `SOURCES.md` and verified — Denmark already cites to `doklink`,
  so this is a formalisation, not a new build.

**Current blockers (each also in `NEXT.md` / `sources/VERIFICATION.md`):**
- **§USABLE-FALLBACK legal precedence** — Danish-planner confirmation PENDING (Blocker A). Blocks
  ratifying the `byggefelt → delområde → lokalplan → ramme` fall-through as `structured`, hence Phase A's
  LEGISLATION sign-off.
- **Byggefelt bindingness semantics** — PENDING (`bygvejledende`/`bygkunifelt`/`iomfangreg`); blocks any
  byggefelt→`maxCoverage` treatment and part of the ENVELOPE coverage axis.
- **Byggefelt footprint → `maxCoverage`** — needs a C58/ADR cross-layer decision (an L0 footprint-ring
  field + a downstream C57 parcel-intersection + the bindingness gate). Denmark's ONLY coverage source
  (~1.4% of byzone clicks); keep DISTINCT from the dimensional fill (`bebygpct` is FAR×100, NOT coverage —
  a measured dead-end, do not "fix" it by reusing the FAR number).
- **Datafordeler credentials DEFERRED (not obtainable)** — admin/service-user bootstrap is gated behind
  Danish **MitID** identity (same access class as Swedish **BankID**), so Phases B and C are **access-
  deferred**, not merely env-pending. The parcel provider is a deferred stub (OSM fallback); the live
  Datafordeler adapter is a single method-body swap the day access exists. NOT a code gap.
- **DK context spike NOT STARTED** (`dk/topics/`) — CONTEXT stays at 5/9 until the L-642 rail/trees bake
  lands; an honest 0 on the missing layers, not a fabricated presence.

**Cross-jurisdiction reuse (why this climb is cheap breadth):**
- Denmark is the **shape-B proof** the shared pipeline pays off fastest on: ≈79% of its legislation
  residual is born-digital text keyed to a Plandata id, so it needs the *shared* `ORDINANCE-EXTRACTION-
  PIPELINE` core, **not a second OCR path** — and most of the axis climb needs no OCR at all.
- The **nDSM height module** (DSM−DTM → P90 per footprint, BBR-validated) is the SAME shared module as
  Spain (L-511c), France (L-512b) and Portugal — DK feeds DHM inputs and ADDS the BBR floor-count
  cross-validation (a differentiator worth porting to any country with a building register). Do NOT
  one-off it per country.
- The **road / tree / pedestrian** shared modules (centreline→class→width→drape; LiDAR→CHM→watershed;
  ortho+road+buildings→segmentation) all apply; DK additionally has an **exceptional cycle-infrastructure**
  register worth a dedicated layer (a DK differentiator).
- **National-coverage reuse:** because DK planning/parcel/height/terrain are all national, Phase D scales
  at ~national marginal cost — every tackled city inherits the identical providers (contrast Spain/PT,
  where each region re-sources). Denmark is the template for *how cheap the climb gets once the country is
  data-ready.*

---

*Model references: **Denmark** is itself the ceiling exemplar (~96% data-readiness — see
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md), renamed from `RATE.md` per the L-649 migration) and the C63 composite
master [`COUNTRY-RATE.md`](./COUNTRY-RATE.md). Per-city climbs: `dk-84/0101-copenhagen/`,
`dk-82/0751-aarhus/`, `dk-83/0461-odense/`, `dk-81/0851-aalborg/`. Pilot climb: **Barcelona**
`../es/es-ct/08019-barcelona/`. Governing: **C63** (city completion / 7 axes / §1.6 gate),
**C58** (fidelity/provenance), **ADR-0269** (curate-then-serve), **L-449** (human-verification gate).
Source findings: `findings/L-609-*`, `findings/L-610-*`, `findings/L-611-*`; `sources/SOURCES.md`;
`sources/VERIFICATION.md`.*
