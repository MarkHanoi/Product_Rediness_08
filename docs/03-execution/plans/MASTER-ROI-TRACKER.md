# MASTER-ROI-TRACKER — code-grounded ROI ranking toward C63 100%

> **Stamp**: 2026-07-30 · **Authority**: [C63 — City Completion & Dossier](../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md)
> §4 (ratified weights) · **Sources synthesised**: the 15 per-country
> [`RATE-IMPLEMENTATION-PLAN.md`](../../04-reference/jurisdictions/) + [`COUNTRY-RATE.md`](../../04-reference/jurisdictions/)
> roll-ups · the 91-city [`§CITY-COMPLETION`](./master-execution-tracker.md) matrix · **code verified against**
> `parcelProviders/registry.ts` · `tools/context-bake/heightSources.mjs` · `bake.mjs` · `terrain.mjs` ·
> `rulepacks/registry.ts`.
>
> **The one board that ranks every country + city by VERIFIED return-on-investment, so the founder knows
> what to execute first.** This is a decision aid, not a scorecard — see the honesty header.

---

## §0 — Honesty header (read this before trusting a number)

1. **The weights are RATIFIED** (founder, 2026-07-30, L-649 · C63 §4):
   **LEGISLATION 25 · ENVELOPE 20 · PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5.**
   Every ROI judgement below is weighted by these. Phase-A moves that touch LEGISLATION+ENVELOPE (45 pts)
   or PARCEL+DATA-SOURCES (30 pts) rank above ones that touch HEIGHTS/TERRAIN/CONTEXT (25 pts total).

2. **The composite %s are C63 Phase-1 *manual-audit* numbers**, renormalised over the **assessed subset
   only** (`partial:true`) and transcribed verbatim from each `COUNTRY-RATE.md`. The **automated scorecard
   function is NOT built** (C63 §8). Every composite here is a **planning estimate until the scorecard
   computes it**. `not-assessed ≠ 0 %`.

3. **Ceilings are PROJECTED** roadmap estimates from each country's `RATE-IMPLEMENTATION-PLAN.md` (mostly
   `CONTINGENT on Phase-A/B/C probes landing`), **not measured maxima.**

4. **ROI cells are marked VERIFIED or PROJECTED.**
   - **VERIFIED** = the code-feasibility claim under the ROI (provider wired / height source `impl` / bake
     region present / envelope pack registered) was **checked in the source this session** and is cited.
   - **PROJECTED** = the score-gain is a roadmap estimate not yet grounded in a wired code path.
   The ROI *ranking* is VERIFIED (rests on checked code state); the *magnitude* of the gain is PROJECTED.

5. **Code-verified column vocabulary** (all checked in `registry.ts` / `heightSources.mjs` this session):
   `wired-live` = keyless national cadastre wired + live · `needs-token` = wired but credential-gated ·
   `verified-live-but-unwired` = cadastre proven live but no routing predicate yet · `to-build` = provider
   not yet wired · `blocked` = source geo-fenced/licensed shut.

---

## §0.5 — Phase-4 EXECUTION LOG (live — updated as agents land)

> **Started 2026-07-30.** This log records what Phase-4 has actually *changed*, cited by commit. The §1
> ranked board below stays as the Phase-1 **audit baseline** (a planning estimate per §0.2). The **computed**
> composite %s cannot move until the **C63 scorecard compute function lands** (in-flight, agent building
> `tools/city-completion/computeScorecard.mjs` + the P5 schema) — it is the tool that recomputes the number.
> Until then this log tracks **status + realised axis-deltas**, not re-scored composites. `not-assessed ≠ 0 %`.

| Country | Phase-4 move | Status | Commit | Axis effect (honest) |
|---|---|---|---|---|
| 🇪🇸 Spain | MDS Edificación measured-height join extended to 6 metro capitals (Madrid/Valencia/Sevilla/Málaga/Zaragoza/Bilbao), priority-stamped + uncapped | **LANDED (code)** — re-bake DEFERRED (needs R2 write cred) | `3d687f22` | HEIGHTS: code ready; buildings stay *estimated* until the `buildings` re-bake+R2 upload runs |
| 🇮🇹 Italy | `AgenziaEntrateParcelProvider` (national INSPIRE Catasto WFS) + 21 tests | **LANDED (code, inert)** — pending batch `registry.ts` row + server `/api/parcel/it` proxy + 1 live GetCapabilities probe | `893e62eb` | PARCEL+DATA-SOURCES: provider built & green (1019 tests); not yet routed (graceful OSM fallback) |
| 🇩🇰 Denmark | L-449 SIGNED vs BR18: `FAR = maksbebyggelsesprocent/100`, height, storeys, `densityScope` preserved → offline rule pack | **IN-FLIGHT** — reshaped to **offline-legislation + DEFERRED live data** (Datafordeler MitID bootstrap blocked, founder 2026-07-30) | *(agent)* | LEGISLATION: credited (DERIVED, signed). PARCEL/live-data: **access-deferred, not a code gap** — Datafordeler adapter = canonical stub |
| 🇨🇭 Switzerland | L-449 resolved = **YES**: swisstopo AV (Amtliche Vermessung) = survey-grade → parcel HIGH (AV dataset only; rendered tiles ≠ engineering-grade) | **IN-FLIGHT (docs)** | *(agent)* | PARCEL: → HIGH (signed); DATA-SOURCES measurement follows scorecard |
| 🇧🇪 Belgium | `FlandersGrbParcelProvider` (GRB/CadGIS, keyless) — Flanders first; Wallonia/Brussels next behind one `isInBelgium` | **IN-FLIGHT** | *(agent)* | PARCEL+DATA-SOURCES: Flanders; national ceiling still region-split-capped |
| 🇺🇸 USA | `NycPlutoParcelProvider` (MapPLUTO — lot geometry + zoning + FAR + height) — establishes the `CityParcelProvider` pattern | **IN-FLIGHT** | *(agent)* | PARCEL+DATA-SOURCES **and** a LEGISLATION bonus (PLUTO carries FAR/zoning) for NYC |
| 🇪🇸 Madrid | Legislation extraction template (Barcelona-format, PGOUM Compendio 2024, article-cited) | **IN-FLIGHT (docs)** — then BLOCKED on founder-sourced numeric values | *(agent)* | LEGISLATION (25 %, heaviest): template ready; values are the human-gated 65 % |
| C63 scorecard | `CityCompletionScorecard` P5 schema + `computeScorecard.mjs` + `computeParcelConfidence` helper | **IN-FLIGHT (enabler)** | *(agent)* | Unblocks the NL/FR/NO/CH "measure-already-wired" moves + **recomputes every composite %** |

### §0.5.1 — 2026-07-31 session (stamp: `a937a023`)

> ⚠ **THE §0.5 TABLE ABOVE WAS MATERIALLY STALE and is corrected here.** Verified directly against
> `parcelProviders/registry.ts` on `60d11aea`: **IT, BE-Flanders, US-NYC, FI and GB-England are ALREADY
> WIRED** (predicates `isInItaly`, `isInFlanders`, `isInNYC`, `isInFinland`, `isInEngland` all imported
> and registered) — the table lists them as pending. **Rule going forward: verify a wire against
> `registry.ts`, never against this tracker.** (L-654)

| Move | Status | Commit |
|---|---|---|
| 🇪🇸 **Murcia (30030) wired end to end** — S2 gate + live S3 WFS resolver + S5 registry + L5 dispatch + same-origin proxy | **LANDED + DEPLOYED** (v-current) | `60d11aea` |
| 🇪🇸 **Murcia refusal correctness** — founder's parcel returned the WEAK refusal; now RR / TA-379 legally-grounded (L-653) | **LANDED, NOT DEPLOYED** | `7333374f` |
| 🇪🇸 **Catastro block-route `areaM2: undefined`** — fed PGM Art. 242.2 *profunditat edificable* (L-652) | **LANDED, NOT DEPLOYED** | `a937a023` |

**The structural finding that should reorder this board (L-654).** The binding constraint is **WIRING, not
sourcing**. Authored, tested and **inert** on `60d11aea`: 6 parcel providers (`brussels`, `wallonia`,
`dgt`/PT, `scotlandRos`, `sf`, `chicago`) with **0 refs** in `parcelProviders/registry.ts`; and 5 envelope
packs (`frParisPluBioclimatique`, `nlBestemmingsplan`, `chZurichBzo`, `dkPerimeterBlock`,
`esBarcelonaVolumetria18`) with **0 refs** in `rulepacks/registry.ts` — Switzerland registered as a
*refusal* jurisdiction with an empty `packsByZone` while its own BZO pack sits unwired beside it.
**ENVELOPE (20 pts) still has exactly one shipped city.** Several §1 "Phase-A first move" cells therefore
overstate remaining effort: for FR/NL/CH the pack already exists and the cost is the 5-slot wire, not
authoring. `60d11aea` is the canonical wiring exemplar.

**⚠ Infrastructure gate on the HEIGHTS/TERRAIN axes (L-655).** GitHub Actions is under an intermittent
**account-level billing block** (4 on/off flips in 30 h; repo is already public and all jobs are plain
`ubuntu-latest`, so this is not a minutes quota). It killed the Murcia terrain bake (run 30633298436, 12 s).
**Consequence: no HEIGHTS or TERRAIN axis can move until the founder clears it** — those axes ship as baked
PMTiles / quantized-mesh to R2 via `context-bake.yml` / `terrain-bake.yml`, not via a Fly code deploy.
LEGISLATION / ENVELOPE / PARCEL axes are unaffected (code deploys fine). **Plan approved by the founder,
blocked on billing:** Murcia terrain canary → full 590-region sharded rollout (`terrain-bake-all.yml`,
12 shards) → Spain buildings re-bake with measured MDS heights.

**Agents in flight this session (8 launched):** CI diagnosis ✅ · Murcia live-prod verification ✅ ·
envelope wiring FR/NL/CH · L-456 compliance panel · parcel-provider batch wire · Madrid PGOUM-97 pack ·
Köln "German Barcelona" bake + LoD2 heights · CI gate restoration (L-651).

### §0.5.2 — ⚖ FOUNDER RATIFICATION 2026-07-31: the PARCEL and ENVELOPE denominator is **BUILDABLE LAND**

> **"For the RATE / ROI we should also consider not all lands for parcel and envelopes — but all parcels
> where you CAN build."** — founder, 2026-07-31.

**The rule.** For the **PARCEL** and **ENVELOPE** axes the denominator is **land where building is
legally possible** — private buildable land — **not all municipal land, and not all clicks.**

**Why it is the correct denominator, not a flattering one.** Scoring against all municipal ground
punishes a city for its parks, streets, rail, port and protected soil — land where *no envelope can
exist by law*, so a "miss" there is not a miss. In Barcelona that is not a rounding error: systems +
`27`/`28`/`29` protected soil are **~17.9 % of all municipal ground**, and **only 27.1 % of the city is
private buildable at all** (31.8 M m² of 101.78 M m², live AMB census 2026-07-31). Under the old
reading Barcelona could never exceed ~27 % however perfect the work. Under the ratified reading its
measured coverage is **56.0 %** with a **~70 %** legal ceiling.

**Three numbers that must never be conflated** — each answers a different question:

| Metric | Denominator | Barcelona today | Answers |
|---|---|---|---|
| **Axis score** (C63 PARCEL/ENVELOPE) | private **buildable** land area | **56.0 %** | *how much of the buildable city do we govern?* |
| **Click coverage** | all clicks anywhere | **~15 %** get an envelope | *what does a random user see?* |
| **Answer correctness** | all clicks anywhere | **~100 %** | *does every click get a TRUE answer — envelope **or** cited refusal?* |

⚠ **A cited refusal is a CORRECT ANSWER, not a gap** — but it is **not an envelope**, and the two must
never be blurred into one headline. Land excluded from the denominator (systems, Collserola, parks) is
**excluded, not scored zero**: `not-applicable ≠ 0 %`, exactly as `not-assessed ≠ 0 %` (C63 §1.2/§1.5).

**Consequences to apply.** (1) Every per-city `RATE.md` PARCEL/ENVELOPE cell must **name its
denominator and its measurement date** — the Barcelona audit found the same headline "24 %" resting on
two different denominators. (2) Cross-city comparison only becomes fair under this rule; a park-heavy
city is no longer penalised. (3) **C63 §3/§4 should be amended to state this explicitly** — the ceiling
audit already measured ENVELOPE this way (31.8 M m²), so the contract is trailing the practice.

**Founder decisions locked this session (govern the board):**
- 🇩🇰 DK + 🇸🇪 SE = **offline-legislation + deferred-live-data** — authoritative cadastre is identity-bootstrap-gated (MitID / BankID) and un-clearable by a foreign founder; both ship on canonical **stub adapters** (fill one method later, no engine change). Parcel axis = *access-deferred*, scored honestly, **not** a code gap.
- 🇫🇮 FI = **only self-service unblock** — MML API key is create-it-yourself online; the one easy full-country win (pending founder key).
- 🇪🇸 Madrid = **lead legislation city** after Barcelona.
- 🇧🇪 BE = **Flanders first**; 🇺🇸 US = **NYC first** (both confirmed).

**Orchestrator debt (batch when IT/BE/US all land):** one `registry.ts` pass wiring all new providers + evolve routing toward **bbox-intersection + priority-fallback** (retire per-country `if(isInX)` growth); wire the `/api/parcel/<cc>` server proxies; add **golden-parcel CI tests** per provider.

---

## §0.6 — 🇪🇸 BARCELONA (`08019`) — measured ROI board

> **Stamp 2026-07-31.** Denominator per **L-656**: **private buildable land area = 31,801,618 m²**
> (of 101.78 M m² city area — only **27.1 %** of Barcelona is private buildable). Source: live AMB
> `qualificacio_refos_3857/MapServer/16` census, n = 89 clau codes. Cross-checked by the repo's
> independent 275-point MUC grid at **53.5 %** — two publishers, 2.5 pp apart.
> ⚠ **The long-quoted "24 %" was 13a ALONE and stale since 2026-07-21.** `RATE.md` Axis 4,
> `LEGISLATION-RATE.md` and `ENVELOPE.md` still carry it and are **wrong**; the ceiling audit is
> authoritative. `ENVELOPE.md` also says 13b/12/20a are "not shipped" — all three shipped 2026-07-22.

### ENVELOPE — where the 20 weighted points stand

**Today: 56.0 % coverage × 0.7 (`block-constructed`) = 39.2 axis pts → 7.84 of 20 weighted.**
**Ceiling: ~70 % → 49 axis pts → 9.8 of 20.** The residual ~30 % is the derived-planning wall
(**62.8 % of city land is `PD*`**) — a document-acquisition programme, not rule authoring.

| clau | share | disposition | what moves it | human-h | eng-days | axis pts | weighted | gated on |
|---|---:|---|---|---:|---:|---:|---:|---|
| `13a`/`13E` | 22.98 % | ✅ packed | — | — | — | — | — | done (L-449 signed 2026-07-20/21) |
| `13b` | 12.52 % | ✅ packed | — | — | — | — | — | done (shipped 2026-07-22) |
| `20a/*` ×10 | 10.62 % | ✅ packed | — | — | — | — | — | done — the one **native `setback`** family |
| `12` | 9.38 % | ✅ packed | ⚠ Ciutat Vella predicate untested | — | 0.5 | — | — | **RISK, see below** |
| **`18`** | **17.51 %** | ⏸ cited refusal | wire `/api/bcn-refos/ov` + measure coverage + L-449 sign | **2–4** | **1.5–2.5** | **+4.0…+7.8** | **+0.80…+1.56** | ⭐ **ENGINEERING** |
| `22@` | 2.06 % | ⏸ coverage-gap | transcribe MPGM 22@ — **PDF already in repo** | 4–8 | 0.5–1 | +1.4 | +0.29 | **SOURCING** (the only one left) |
| `12b` | 2.44 % | ⏸ coverage-gap | LiDAR neighbour heights (the rule *is* "mean of neighbours") | 2 | 3–5 | +1.7 | +0.34 | **DATA AVAILABILITY** |
| bare `20a` | 1.55 % | ⏸ coverage-gap | a subzone-granular municipal layer | 2 | 0.5 | +1.1 | +0.22 | **DATA AVAIL.** — may not exist; refusing judged correct |
| **`22a`** | **15.60 %** | ⏸ cited refusal | ~2,595 *Pla Parcial* docs — **98.9 % is `PD*` ⇒ Art. 350.1** | *programme* | *programme* | **0** | **0** | ⛔ **LAW** — fully sourced already, worth zero |
| `15` `16` `17/*` `14a/b` `8a` | 3.58 % | ⏸ legal refusal | **nothing — refusing IS the right answer** | — | — | 0 | 0 | ⛔ LAW (permanent) |

**⭐ Highest-ROI action: wire the clau-18 proxy AND measure its coverage in the same change** —
~1.5–2.5 eng-days + 2–4 human-hours for the largest available movement on the axis. The measurement is
part of the action, not a follow-up: the only prior estimate (32.5–63.8 %, n=80) rested on an
"independent cross-check" that the audit **refuted** (it divided the *whole* OV layer's area — 98.6 % of
whose polygons have an empty `CLAU` — by clau 18's area). Hard ceiling: OV_Trames' entire area is
**11.2 %** of the denominator.

### The other six axes

| axis | W | today | the honest read |
|---|---:|---|---|
| PARCEL | 15 | `not-assessed` | Catastro live+keyless, **block dissolve 2/2 — best in Spain**; never sampled |
| LEGISLATION | 25 | `not-assessed` | sub-rate **~48 %**, and **~48 % is also the ceiling** — past it is **plànol vectorisation, not OCR** |
| DATA-SOURCES | 15 | **90 %** | 4.5/5 slots live |
| **HEIGHTS/LOD** | 10 | `not-assessed` | ⚠ shipped tiles report **`measuredMarkerCount: 0`** — 0.9 % surveyed · 79.3 % levels×3.2 m · **19.8 % a fabricated 9 m**. Re-bake in flight; **coverage unmeasured until probed** |
| TERRAIN | 10 | **50 %** | baked-but-unverified; one centroid sample, not façade *rasant* (L-584) |
| CONTEXT | 5 | **56 %** | 5/9 layers |

### Landed for Barcelona 2026-07-31

- `a937a023` — block-route parcels carried `areaM2: undefined`, feeding **PGM Art. 242.2 *profunditat edificable*** (L-652)
- `24d324bd` — **L'Hospitalet / Badalona / Sant Boi / Cornellà land was answered with Barcelona's rule pack and citation.** All four register a *deliberately empty* `packsByZone`; first-match handed them Barcelona's numbers — the exact mis-citation each registration exists to prevent (L-654 family)
- `b81d758d` — the 13a extraction protocol, made replicable; **Arts. 322 / 323 / 326 / 327 / 328 recovered verbatim** from the committed PDF (the Art. 327 and 328 street-width→height tables were the standing blocker)

### Open risks

1. ⚠ **Clau `12` is mapped unconditionally with NO geographic predicate** while the legal argument (Art. 315.2) is that the pack governs the *annexed* nuclis antics and that Ciutat Vella is `12b`. If the MUC returns `12` on a Ciutat Vella parcel it gets an Art. 320.3a envelope under a citation that does not govern it. **9.38 % of buildable land rides on an untested assumption.** No probe exists.
2. ⚠ **Street width uses the MEDIAN of ray samples; PGM Art. 238.1.b/c requires the MINIMUM** — median ≥ minimum ⇒ higher band ⇒ **over-stated permitted height on the 44.9 % already shipped** (L-591). Fix in flight.
3. **C63 tier vocabulary does not match the code** — C63 §3 names `certified`/`constructed-amber`; `EnvelopeConfidenceSchema` has `authoritative | structured | block-constructed | estimated-ruleset | …`. Neither top tier is reachable for a *constructed* Art. 242.2 depth, so **0.7 is the honest cap** and the "certify to 1.0" lever may not exist. Needs a C63 ruling; likely why Axis 4 reads `not-assessed`.

---

## §1 — Per-country ranked board (top → bottom by score-gain-per-effort)

| # | Country | Current composite | Ceiling (proj.) | Gap | Phase-A first move | Effort | Code-verified? | ROI |
|---|---|---|---|---|---|---|---|---|
| 1 | 🇩🇰 **Denmark** | **66 %** part | ~92–96 % | ~26–30 | **Wire PLANDATA.dk (Lokalplaner+Kommuneplan) as per-city legislation + sign the L-449 `VERIFICATION.md` for Copenhagen** — moves the two heaviest axes (LEG 25 + ENV 20 = **45 pts**) with **zero OCR**, data already machine-readable | Low–Med | **VERIFIED** — `geodanmark` height `impl:'live'`; parcel `matrikel-dk` wired (`needs-token`); plandata WFS keyless (per plan) · **⚙️P4: L-449 SIGNED vs BR18 (offline legislation credited); live cadastre/PLANDATA DEFERRED — Datafordeler MitID bootstrap blocked → canonical stub adapter** | 🟢🟢🟢 |
| 2 | 🇮🇹 **Italy** | **51 %** part | ~55–65 % | ~4–14 | **Wire `AgenziaEntrateParcelProvider` in `registry.ts`** as a `kind:'cadastral'` jurisdiction (+ `isInItaly`/ISTAT routing) — one wire lights **PARCEL 15 + DATA-SOURCES 15 = 30 pts** | Low (~1–2 d) | **VERIFIED** — `isInItaly` **absent** from `registry.ts` imports → `verified-live-but-unwired`; the single highest-gain new wire · **⚙️P4: PROVIDER LANDED `893e62eb` (code + 21 tests, 1019 pkg green), pending batch registry row + `/api/parcel/it` proxy + 1 live GetCapabilities probe** | 🟢🟢🟢 |
| 3 | 🇳🇱 **Netherlands** | **71 %** part (highest) | ~85–92 % | ~15–20 | **Run `computeParcelConfidence` over an Amsterdam bbox against the already-wired `pdok-nl`** — measure, don't build; **smallest gap to Denmark of any country** | Low | **VERIFIED** — `pdok-nl` cadastral **wired-live**; `3dbag` height `impl:'live'` | 🟢🟢🟢 |
| 4 | 🇫🇷 **France** | **66 %** part | ~68–80 % | ~2–14 | **Run `computeParcelConfidence`+`computeParcelMetrics` over Paris/Lyon bboxes** — `ign-fr` already wired+live, a measurement not a build | S (~0.5–1 d) | **VERIFIED** — `ign-fr` cadastral **wired-live**; `bdtopo` height `impl:'live'` | 🟢🟢🟢 |
| 5 | 🇳🇴 **Norway** | **66 %** part | ~40–50 nat · 55–65 Oslo | ~-11–0 nat | **Measure the already-wired keyless `geonorge-no` Matrikkelen** — `computeParcelConfidence` over Oslo bbox | Low | **VERIFIED** — `geonorge-no` cadastral **wired-live** (keyless); `ndh_no` height `documented` | 🟢🟢 |
| 6 | 🇨🇭 **Switzerland** | **66 %** part | ctx 90–95 · city 60–75 | ~0–9 | **Measure the already-wired `swisstopo-av` cadastre** (L-627, all-canton keyless) + finish DATA-SOURCES wiring | Low | **VERIFIED** — `swisstopo-av` cadastral **wired-live**; `swissbuildings3d` height `documented` (keyless build) · **⚙️P4: L-449 = YES SIGNED → parcel HIGH (AV Amtliche Vermessung = survey-grade; rendered tiles ≠ engineering-grade)** | 🟢🟢 |
| 7 | 🇩🇪 **Germany** | Berlin 44 · Munich 29 | ~75–85 (NRW city Köln) | ~31–41 | **Stand up NRW as the "German Barcelona" (Köln)** — `NRWProvider` on the wired `alkis-nrw` + LoD2-DE-NRW true heights + a Köln `bake.mjs` REGION | Med | **VERIFIED** — `alkis-nrw` cadastral **wired-live**; `lod2de_nrw` height `impl:'live'`; needs a **new** Köln bake+terrain row | 🟢🟢 |
| 8 | 🇸🇪 **Sweden** | **56 %** part | ~45–55 nat · 55–65 Stockholm | ~-1–9 | **Obtain+wire free `LANTMATERIET_API_KEY`, add `isInSweden` + Fastighetsindelning parcel adapter** | Low | **PROJECTED** — provider `to-build` + `needs-token`; `lidar_se` height `documented` | 🟢 |
| 9 | 🇫🇮 **Finland** | **56 %** part | ~80–85 (if Ryhti attrs) · 40–50 else | ~24–29 | **Probe the Ryhti `_ix_` GET** (`pub_valid_ld_plan_ix_gs/items`); if `properties` carry FAR/storeys, wire the OGC reader — the "second-Denmark" upside | Very-Low probe | **PROJECTED** — upside `CONTINGENT` on one **unread** `_ix_` schema; provider `to-build`; Helsinki terrain `needs-token` (MML key) | 🟢 |
| 10 | 🇺🇸 **USA** | **53 %** part | ~55–60 NYC · 50–55 SF (per city) | ~2–7 | **Wire `NYCParcelProvider` (MapPLUTO/BBL) + `SFParcelProvider` (APN)** as `City*Provider`s; probe `MaxAllwFAR` semantics | Low–Med (~2–4 d/city) | **PROJECTED** — providers `to-build` (no national parcel); `overture_us` height `documented`; **no single national ceiling** | 🟡 |
| 11 | 🇪🇸 **Spain** | **34 %** (national composite) | ~55 % | ~21 | **Barcelona/metro MDS re-bake** — flip heights estimated→measured (`mdsn_e025` P90 `tagged`); broader climb = per-city clau OCR/sourcing | Low (Phase-A) | **VERIFIED** — `mds_edificacion`+`catastro` `impl:'live'`; **Barcelona is the ONLY city with a rendering envelope pack** (4 packs); rest = OCR-gated · **⚙️P4: MDS metro heights code LANDED `3d687f22` (6 capitals priority-stamped/uncapped); Madrid = lead legislation city (template in-flight); heights stay estimated until `buildings` re-bake + R2 upload** | 🟡 |
| 12 | 🇧🇪 **Belgium** | **44 %** part | ~30–40 nat · 40–50 Brussels | structurally capped | **Wire federal CADMAP/CadGIS as `BeParcelProvider` behind `isInBelgium`** + `computeParcelConfidence` + PRAS zone-GIS | Low–Med | **PROJECTED** — provider `to-build`; `grb_be` height `documented` (Flanders-only); **ceiling capped by the constitutional region-split, not a defect** · **⚙️P4: `FlandersGrbParcelProvider` LANDED `2da5371c` (GRB Adp, 18 tests), pending batch registry + `/api/parcel/be-vlg` proxy; Wallonia/Brussels next behind one `isInBelgium`** | 🟡 |
| 13 | 🇵🇹 **Portugal** | **36 %** part | ~45–55 % | ~9–19 | **Probe+wire the DGT OGC API** (CAOP+DICOFRE, Cadastro Predial, CRUS/COS, orthophotos) | Low–Med | **PROJECTED** — all DGT findings `CONVERGENT-SECONDARY` (**not live-probed**); no national footprint; parcels weak; terrain `blocked`; `dgt_pt` height `documented` | 🟡 |
| 14 | 🇬🇧 **United Kingdom** | **51 %** part | ~45–55 English · 35–45 nat | little headroom | **Wire OS Open (Buildings/Roads/Greenspace/Rivers) + AddressBase/UPRN** for England/London | Low–Med | **PROJECTED** — OS findings `CONVERGENT-SECONDARY`; provider `to-build`; **discretionary-planning caps the LEGISLATION ceiling** — composite already near ceiling | 🟠 |
| 15 | 🇸🇦 **Saudi Arabia** | **19 %** part (lowest) | ~30–40 % best case | ~11–21 | **Register+sign the authored `saRiyadhDemo.ts` footprint pack** (ENVELOPE — the ONE movable axis); vertical held null | Low–Med | **VERIFIED** — Riyadh pack **already registered** in `rulepacks/registry.ts` (footprint/setbacks; height refuses); parcel + `ml_sa` height **`blocked`** (geo-fenced) — nationally capped | ⚫ |

**Ranking logic.** Ordered by *score-gain-per-effort, gated by code feasibility*: (1) Denmark first — the two
heaviest axes (45 pts) over data that is **already live**, cost = wiring + one sign-off; (2) Italy — one cheap
wire lights 30 pts, the highest gain-per-wire and the only `verified-live-but-unwired` cadastre; (3–6) the
**already-wired-just-measure** countries (NL/FR/NO/CH) — near-zero effort, pure ROI, PARCEL 15 each; (7) Germany
— the wired NRW stack pays across five axes but needs a new bake region; (8–10) token/new-wire builds; (11–14)
OCR/sourcing-bound legislation ceilings in the middle; (15) Saudi at the bottom — honest low ceiling, only ENVELOPE moves.

---

## §2 — Top-10 "do-this-first" execution list (highest single moves, exact code action)

| Rank | Move (exact code action) | Country | Axes (weight) | Code-verified state |
|---|---|---|---|---|
| 1 | **Sign the L-449 `sources/VERIFICATION.md` for Copenhagen + wire PLANDATA.dk WFS** (`geoserver.plandata.dk`, keyless) as the per-city legislation source; run the byzone click-weighted fill probe scoped to the `0101` bbox | 🇩🇰 DK | LEG 25 + ENV 20 = **45** | **VERIFIED** — data live, zero OCR; `matrikel-dk` + `geodanmark` already in code |
| 2 | **Wire `AgenziaEntrateParcelProvider` into `parcelProviders/registry.ts`** as `kind:'cadastral'` behind a new `isInItaly` predicate (+ ISTAT `ItalyJurisdictionResolver`) | 🇮🇹 IT | PAR 15 + SRC 15 = **30** | **VERIFIED** — `isInItaly` absent today → one-wire, verified-live-but-unwired |
| 3 | **Run `computeParcelConfidence` over an Amsterdam bbox against `pdok-nl`** (already wired) — record the confidence distribution | 🇳🇱 NL | PAR 15 | **VERIFIED** — `pdok-nl` wired-live; sample run never executed |
| 4 | **Run `computeParcelConfidence`+`computeParcelMetrics` over Paris (`75056`) + Lyon (`69123`) bboxes against `ign-fr`** | 🇫🇷 FR | PAR 15 | **VERIFIED** — `ign-fr` wired-live |
| 5 | **Run `computeParcelConfidence` over an Oslo bbox against keyless `geonorge-no`** | 🇳🇴 NO | PAR 15 | **VERIFIED** — `geonorge-no` wired-live keyless |
| 6 | **Run `computeParcelConfidence`+`computeParcelMetrics` over Zürich/Genève/Bern against `swisstopo-av`** + confirm geodienste WFS licence | 🇨🇭 CH | PAR 15 + SRC | **VERIFIED** — `swisstopo-av` wired-live (L-627) |
| 7 | **Add per-city metro-capital bboxes to `heightSources.mjs` MDS join and re-bake** (Barcelona/Madrid/… → `mdsn_e025` `tagged`), flipping heights estimated→measured | 🇪🇸 ES | HGT 10 (+SRC) | **VERIFIED** — `mds_edificacion` `impl:'live'`, bboxes staged in `REGION_SOURCE` |
| 8 | **Stand up `NRWProvider` on the wired `alkis-nrw` + consume `fetchLod2DeNrw` true heights + add a Köln `bake.mjs` REGION** (the "German Barcelona") | 🇩🇪 DE | PAR+SRC+HGT+TER+CTX | **VERIFIED** — `alkis-nrw` + `lod2de_nrw` both live; needs new bake/terrain row |
| 9 | **Obtain the free `LANTMATERIET_API_KEY` (repo secret) + add `isInSweden` + a Fastighetsindelning parcel adapter to `registry.ts`**; run the Stockholm sample | 🇸🇪 SE | PAR 15 + SRC 15 | **PROJECTED** — provider to-build + needs-token |
| 10 | **Probe the Ryhti `_ix_` item GET** (`pub_valid_ld_plan_ix_gs/items?limit=1`) and read `properties` for `tehokkuusluku`/`kerrosluku` — decides FI's "second-Denmark" ceiling before any wiring | 🇫🇮 FI | LEG+ENV (contingent) | **PROJECTED** — one unread schema gates the whole upside |

**Honest note on ordering #3–#6 vs #2.** Moves #3–#6 are cheaper than #2 (a probe run vs a code wire) but each
lights only PARCEL (15). #2 lights 30 pts for ~1–2 days of one wire — a higher *absolute* gain, hence above the
measure-only set. #1 sits alone at the top: 45 pts over already-live data.

---

## §3 — Per-city drill-down (the 91-city board — Overall + country next-move)

Overall %s transcribed verbatim from [`§CITY-COMPLETION`](./master-execution-tracker.md) §CC.1 (`partial`,
assessed-subset renormalised, `n/a ≠ 0 %`). **74 Phase-1-audited** rows carry an Overall; **17** are
`see dossier` (pre-existing / research-only, not re-audited this pass — Overall lives in the linked dossier).
"Next-move" = the city's country Phase-A from §1.

### Non-Spain audited cities (25) + all see-dossier flagships

| City (`code`) | Country | Overall | Country Phase-A next-move |
|---|---|---|---|
| Copenhagen (`0101`) | 🇩🇰 DK | **66 %** | Sign L-449 + wire PLANDATA.dk (LEG+ENV, data live) |
| Aarhus (`0751`) | 🇩🇰 DK | **66 %** | replay DK Phase-A–C (national providers) |
| Odense (`0461`) | 🇩🇰 DK | **66 %** | replay DK Phase-A–C |
| Aalborg (`0851`) | 🇩🇰 DK | **66 %** | replay DK Phase-A–C |
| Amsterdam (`0363`) | 🇳🇱 NL | **71 %** (top) | `computeParcelConfidence` on wired `pdok-nl` |
| Paris (`75056`) | 🇫🇷 FR | **66 %** | measure wired `ign-fr` |
| Lyon (`69123`) | 🇫🇷 FR | **66 %** | measure wired `ign-fr` |
| Oslo (`0301`) | 🇳🇴 NO | **66 %** | measure keyless `geonorge-no` |
| Zürich (`0261`) | 🇨🇭 CH | **66 %** | measure wired `swisstopo-av` |
| Genève (`6621`) | 🇨🇭 CH | **66 %** | measure wired `swisstopo-av` |
| Bern (`0351`) | 🇨🇭 CH | **66 %** | measure wired `swisstopo-av` |
| Roma (`058091`) | 🇮🇹 IT | **51 %** | **wire `AgenziaEntrateParcelProvider`** |
| Milano (`015146`) | 🇮🇹 IT | **51 %** | **wire `AgenziaEntrateParcelProvider`** |
| New York City (`3651000`) | 🇺🇸 US | **53 %** | wire `NYCParcelProvider` (MapPLUTO/BBL) |
| San Francisco (`0667000`) | 🇺🇸 US | **53 %** | wire `SFParcelProvider` (APN) |
| Greater London (`E12000007`) | 🇬🇧 GB | **51 %** | wire OS Open + AddressBase/UPRN |
| Stockholm (`0180`) | 🇸🇪 SE | **56 %** | obtain `LANTMATERIET_API_KEY` + wire adapter |
| Helsinki (`091`) | 🇫🇮 FI | **56 %** | probe Ryhti `_ix_` |
| Brussels (`21004`) | 🇧🇪 BE | **44 %** | wire CADMAP `BeParcelProvider` |
| Berlin (`11000`) ⚑ | 🇩🇪 DE | **44 %** | NRW/Köln stack (Berlin is T-out for terrain) |
| München (`09162`) ⚑ | 🇩🇪 DE | **29 %** | NRW/Köln stack (Bavaria LoD2 licence TBD) |
| Lisboa (`1106`) | 🇵🇹 PT | **36 %** | probe+wire DGT OGC API |
| Porto (`1315`) | 🇵🇹 PT | **36 %** | probe+wire DGT OGC API |
| Riyadh (`RUH`) | 🇸🇦 SA | **19 %** (lowest) | register+sign `saRiyadhDemo.ts` (ENV only) |
| Jeddah (`JED`) | 🇸🇦 SA | **19 %** | register+sign `saRiyadhDemo.ts` (ENV only) |
| **Barcelona** (`08019`) | 🇪🇸 ES | **ENV 56.0 %** (measured 2026-07-31) — see **§0.6** | ⭐ wire `/api/bcn-refos/ov` (clau 18) — ENGINEERING, not sourcing |
| Madrid (`28079`) | 🇪🇸 ES | *see dossier* | NZ-1 explicit-area refusal jurisdiction |
| Córdoba (`14021`) | 🇪🇸 ES | *see dossier* | OCR pack refusing (VERIFICATION unsigned) |
| L'Hospitalet/Badalona/Sant Boi (`08101/08015/08200`) | 🇪🇸 ES | *see dossier* | cited-refusal jurisdictions (L-449 gate) |
| Antwerp/Liège (`11002/62063`) | 🇧🇪 BE | *see dossier* | Flanders/Wallonia regional path |
| Hamburg (`02000`) | 🇩🇪 DE | *see dossier* | DiPlanung structured-attribute path |
| Marseille (`13055`) | 🇫🇷 FR | *see dossier* | France Phase-A (measure `ign-fr`) |
| Turin (`001272`) | 🇮🇹 IT | *see dossier* | ARPA Piemonte 3D + IT parcel wire |
| Bergen/Trondheim (`4601/5001`) | 🇳🇴 NO | *see dossier* | Norway Phase-A (measure `geonorge-no`) |
| Braga (`0303`) | 🇵🇹 PT | *see dossier* | DGT LiDAR path |
| Dammam (`DMM`) | 🇸🇦 SA | *see dossier* | Saudi ENV pack |
| Los Angeles/Chicago (`0644000/1714000`) | 🇺🇸 US | *see dossier* | wire city parcel provider |

### Spain audited cities (49) — grouped by Overall (all share ES Phase-A: MDS heights re-bake now; per-city clau OCR later)

- **66 %** (Catalan MUC data-source 80 %): Girona (`17079`) · Lleida (`25120`) · Tarragona (`43148`).
- **61 %** (data-source 70 %) — 33 cities: Almería (`04013`) · Cádiz (`11012`) · Granada (`18087`) · Huelva
  (`21041`) · Jaén (`23050`) · Málaga (`29067`) · Sevilla (`41091`) · Huesca (`22125`) · Teruel (`44216`) ·
  Zaragoza (`50297`) · Oviedo (`33044`) · Palma (`07040`) · Santander (`39075`) · Ávila (`05019`) · Burgos
  (`09059`) · León (`24089`) · Palencia (`34120`) · Salamanca (`37274`) · Segovia (`40194`) · Soria (`42173`) ·
  Valladolid (`47186`) · Zamora (`49275`) · Albacete (`02003`) · Ciudad Real (`13034`) · Cuenca (`16078`) ·
  Guadalajara (`19130`) · Toledo (`45168`) · Badajoz (`06015`) · Cáceres (`10037`) · A Coruña (`15030`) · Lugo
  (`27028`) · Ourense (`32054`) · Pontevedra (`36038`) · Murcia (`30030`) · Logroño (`26089`) · Alicante
  (`03014`) · Castelló (`12040`) · València (`46250`).
  *(38 names listed — the 61 % tier; foral/coastal variants below sit lower.)*
- **51 %** (foral cadastre ⚑, data-source 50 %): Pamplona (`31201`) · Vitoria-Gasteiz (`01059`) · San Sebastián
  (`20069`) · Bilbao (`48020`).
- **50 %** (context outside bake clip, `n/a (out)`): Las Palmas (`35016`) · Sta. Cruz de Tenerife (`38038`) ·
  Ceuta (`51001`) · Melilla (`52001`).

**City-board takeaway.** The entire non-Spain measure-only tier (NL/FR/NO/CH — 8 cities) already sits at 66–71 %
on cheap axes; their PARCEL axis flips the moment a probe runs against a **wired-live** provider. The two Italian
cities (51 %) jump the same way behind **one** new wire. Denmark's four cities (66 %) carry the biggest latent
gain — 45 pts of law+envelope over live data.

---

## §4 — Code-verification appendix (what was checked this session)

**`packages/site-parcel-data/src/parcelProviders/registry.ts`** — WIRED cadastral providers:
`catastro` (ES), `ign-fr` (FR), `alkis-nrw` (DE-NW only), `pdok-nl` (NL), `geonorge-no` (NO), `swisstopo-av`
(CH, L-627), `matrikel-dk` (DK, **credential-gated** `DATAFORDELER_USERNAME/PASSWORD`). Footprint-fallback:
DE (non-NRW), SA (geo-fenced). **NOT wired** (no predicate imported): **IT, SE, BE, FI, GB, US, PT** — so
IT/SE/BE/FI/GB/US/PT Phase-A parcel moves are genuine new wires; IT's is `verified-live-but-unwired`.

**`tools/context-bake/heightSources.mjs`** — `impl` flags: **live** = `3dbag` (nl), `bdtopo` (fr), `catastro`
+ `mds_edificacion` (es), `lod2de_nrw` (de), `geodanmark` (dk, apikey-gated). **documented** = `swissbuildings3d`
(ch, keyless build), `lod2de` (de-Berlin), `overture_us` (us), `ndh_no` (no), `lidar_se` (se), `dgt_pt` (pt),
`piedmont_it` (it, Turin-only). **blocked** = `ml_sa` (sa, geo-fenced 403).

**`tools/context-bake/bake.mjs`** — 23 baked REGIONS cover **every demo city** (spain+denmark+netherlands
whole-country; paris/lyon/rome/milan/berlin/munich/london/brussels/oslo/stockholm/helsinki/zurich/geneva/bern/
newyork/sanfrancisco; riyadh+jeddah on Overture). Copenhagen rides `denmark`, Amsterdam rides `netherlands`.
→ CONTEXT axis (~56 %) is VERIFIED-present nearly everywhere.

**`packages/site-parcel-data/src/rulepacks/registry.ts`** — envelope packs that **render numbers**: only
**Barcelona** (4 packs: Ensanche 13a/13E · Semiintensiva 13b · 20a Aïllada · Nucli Antic). **Riyadh** demo pack
registered (footprint/setbacks; height/floors refuse). **Madrid · Córdoba · Switzerland · L'Hospitalet ·
Badalona · Sant Boi · Cornellà** = registered **refusal jurisdictions** (empty `packsByZone`). → ENVELOPE is the
scarcest axis: one shipped city.
