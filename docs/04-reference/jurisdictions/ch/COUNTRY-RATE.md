<!-- COUNTRY-RATE.md — Switzerland composite completion roll-up (C63 §5). Country composite master
     ("master RATE" at the country level, L-649): one row per tackled city, columns = the 7 axes +
     overall. Naming per _TEMPLATE/NAMING-CONVENTION.md. Every cell is COMPUTED (cited-derived) or
     `not-assessed`; the national legislation number lives in RATE.md (legacy) — do NOT confuse it
     with this composite. Authored by the C63 Phase-1 audit; a future scorecard-function re-run
     replaces the manual cells (C63 §1.1/§8.1). -->
# Switzerland (ch) — Country RATE (master completion roll-up)

<!-- generated-by: MANUAL C63-Phase-1-AUDIT 2026-07-30 — cheap axes (DATA-SOURCES · TERRAIN · CONTEXT)
     cited-derived per C63 §8.1; all others `not-assessed` with a typed C62 reason. No fabricated cell. -->

**National legislation/data-fill (`LEGISLATION-RATE.md` equivalent):** the legacy national structured-fill
number is `~20–25 %` on the comparable building-rule ruler (MEASURED, Outcome B — zone-ID structured, the
Ausnützungsziffer/height model+PDF-bound) — see [`RATE.md`](./RATE.md) (NOT YET renamed `LEGISLATION-RATE.md`;
pending the L-649 migration, owned by governance). The `~85 %` figure that also appears there is a *different
ruler* — the context-data (physical 3D) axis, not the building-rule fill. See [`README.md`](./README.md) for
the national data layer.

> Authority: [C63](../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md). Axes fixed in C63 §3.
> Weighting = `CITY_COMPLETION_WEIGHTS` — RATIFIED (founder, 2026-07-30): LEGISLATION 25 · ENVELOPE 20 ·
> PARCEL 15 · DATA-SOURCES 15 · HEIGHTS/LOD 10 · TERRAIN 10 · CONTEXT 5 (C63 §4). Every cell is
> cited-derived or `not-assessed`; NEVER a hand-typed/borrowed number (C63 §1.1/§1.2).

**Legend.** `—` = **not-assessed** (a typed C62 UnknownReason lives in the city's `RATE.md`; `—` ≠ 0 %,
C63 §1.2). `(cap)` = HEIGHTS measured-**capable** (swisstopo nDSM keyless + live-verified STAC) but the
per-city bake is unlanded and the wiring is a BUILD (§SWISS-NDSM-STAC-BUILD) → still not-assessed.
**Overall** is renormalised over the ASSESSED subset only (`partial`). DATA-SOURCES reads **80 %** because
CH has a genuine national cadastre (swisstopo Amtliche Vermessung, keyless, all-canton) AND a national
zone-GIS (geodienste `ms:grundnutzung` + the ÖREB/RDPPF cadastre) — the zone-GIS rated `documented` (0.5),
not `live`, since `siteDispatch.ts`/proxy wiring is unconfirmed; the building-height slot is `documented`
(0.5) because the swisstopo nDSM path is a build, not a live per-city bake.

## §0 — Subdivision scheme (documented)

Switzerland uses **`ch-<canton>` = ISO 3166-2:CH canton codes (lowercased)** for the `<cc>-<subdiv>` folder
level, and the **official Swiss BFS/OFS Gemeinde number** for `<code>` (the C57/NAMING-CONVENTION §3 join
key — `<code>` ∈ INE/INSEE/DICOFRE/LAU-equivalent; for CH that is the BFS Gemeindenummer). BFS numbers are
left-zero-padded to 4 digits, mirroring Germany's leading-zero AGS convention (`02000-hamburg`):

| Subdiv folder | ISO 3166-2:CH canton | Tackled cities (BFS-Nr) |
|---|---|---|
| `ch-zh` | Zürich | Zürich (`0261`) |
| `ch-ge` | Genève | Genève / Geneva (`6621`) |
| `ch-be` | Bern | Bern (`0351`) |

*(The BFS Gemeindenummer 261 is confirmed verbatim in the cantonal AV cadastre probe — `bfsnr 261` for a
real City-of-Zürich parcel, `ch-zh/0261-zurich/findings/ZURICH-BZO-PROBE.md` §1. Genève city = OFS 6621,
Bern city = BFS 351.)*

## §A — Per-city completion matrix (3 SCAFFOLDED this pass — the bake-covered cities)

The bake-covered Swiss cities are **Zürich, Genève and Bern** — the only three CH rows in `bake.mjs`
REGIONS (`zurich` bbox `8.45,47.34,8.62,47.43`; `geneva` bbox `6.09,46.17,6.18,46.25`; `bern` bbox
`7.40,46.93,7.48,46.99`; all clipped from `switzerland-latest.osm.pbf`) AND `terrain.mjs` REGIONS (all
three `source:'ch'` = swissALTI3D). No secondary tackled Swiss municipality sits inside any of the three
tight city-centre bboxes. Cheap axes cited-derived (see each city's `RATE.md` for the full derivation);
PARCEL/LEGISLATION/ENVELOPE/HEIGHTS are the human-gated axes, honestly `not-assessed` until scorecard-computed.

| City (`BFS`) | PARCEL | LEGIS­LATION | DATA-SRC | ENVELOPE | TERRAIN | HEIGHTS/LOD | CONTEXT | **Overall** | Dossier |
|---|---|---|---|---|---|---|---|---|---|
| _Zürich (ch-zh)_ | | | | | | | | | |
| Zürich (`0261`) | `—` | `—` | **80%** | `—` | **50%** | `—`(cap) | **56%** | **66%** `partial` | [dossier](./ch-zh/0261-zurich/RATE.md) |
| _Genève (ch-ge)_ | | | | | | | | | |
| Genève (`6621`) | `—` | `—` | **80%** | `—` | **50%** | `—`(cap) | **56%** | **66%** `partial` | [dossier](./ch-ge/6621-geneva/RATE.md) |
| _Bern (ch-be)_ | | | | | | | | | |
| Bern (`0351`) | `—` | `—` | **80%** | `—` | **50%** | `—`(cap) | **56%** | **66%** `partial` | [dossier](./ch-be/0351-bern/RATE.md) |

**Scaffolded totals (this pass):** 3 dossiers (Zürich, Genève, Bern), all **66 %** overall on the assessed
subset (DATA-SOURCES 80 · TERRAIN 50 · CONTEXT 56). All three carry measured-**capable** HEIGHTS via the
keyless swisstopo nDSM `(cap)`, unbaked/unwired (§SWISS-NDSM-STAC-BUILD). **Zürich is materially further
along in LEGISLATION/ENVELOPE than the other two — it holds a real registered BZO rule pack** (see §D +
its dossier) — but that advantage is NOT scorecard-measured yet, so it correctly does not inflate the
overall (which renormalises over the assessed axes only, C63 §1.5). Each city gained the 7-file C63 scaffold
(RATE.md composite + LEGISLATION-RATE.md + ENVELOPE.md + HEIGHT.md + NEXT.md + RISK-REGISTER.md +
RATE-IMPLEMENTATION-PLAN.md).

## §B — Pre-existing / research-only material (NOT re-scaffolded this pass)

| Item | Kind | Location | Note |
|---|---|---|---|
| `regions/national-2_0-baseline`, `regions/sankt-gallen`, `regions/schwyz` | national / canton-level notes | `ch/regions/` | Canton/region-level research folders, NOT bake-covered city dossiers → no `bake.mjs`/`terrain.mjs` city row, so their cheap axes would be `outside-coverage`. Out of this pass's bake-covered scope; left in place. |
| `ch/findings/*`, `ch/topics/*` | national data-source studies | `ch/findings`, `ch/topics` | The SWITZERLAND-DATA-RECON-SPIKE + MASTER-DATA-SOURCE-STUDY + the four context topics — national evidence that FEEDS every city's cheap-axis derivation. Unchanged. |

## §C — Tackled but migration / re-nesting notes (logged, never silently truncated — C63 SCALE clause)

- **Zürich re-nest (DONE this pass).** The mis-nested `ch/regions/zurich/ZURICH-BZO-PROBE.md` was
  `git mv`-ed to the standard city-dossier home `ch/ch-zh/0261-zurich/findings/ZURICH-BZO-PROBE.md`
  (content preserved byte-for-byte), and the empty `ch/regions/zurich/` removed — restoring the C63 §5.2
  fixed nesting `jurisdictions/<cc>/<cc>-<subdiv>/<code>-<slug>/`. A city under `regions/` was misplaced.
- **Folder-code note (`z0261` vs `0261`).** The Phase-1 brief named the Zürich folder `z0261-zurich`; this
  pass used **`0261-zurich`** — the pure zero-padded BFS Gemeindenummer — for consistency with the stated
  "`<code>` = Swiss BFS Gemeinde number" rule, the es/fr/de precedent (pure-numeric INE/INSEE/AGS codes,
  no letter prefix), and the real cadastre value (`bfsnr 261`). If the `z` prefix is deliberate, rename the
  three folders + this matrix's links in one edit — logged here, not silently diverged.
- **Composite-RATE / legislation-rename migration** for the country-level `ch/RATE.md` (legacy national
  legislation number, not yet `LEGISLATION-RATE.md`) is owned by the governance/migration track (out of this
  pass's write-fence). The three worked cities were scaffolded fresh (no legacy city `RATE.md` existed to
  migrate — the composite `RATE.md` + `LEGISLATION-RATE.md` are both authored new this pass).
- **Other Swiss municipalities** (~2,100 Gemeinden) are TACKLED for legislation only at the national level
  (ÖREB zone-ID reaches 25/26 cantons + the national Nutzungsplanung WFS ~19 cantons, but the numeric FAR is
  a per-canton INTERLIS `Typ`-catalogue harvest and height is Baureglement-PDF-bound — see `RATE.md`). They
  inherit the identical cheap-axis derivation once bake-covered; scaffold on demand.

## §D — Honesty ledger (per city: DOES / REFUSES / UNKNOWN · `honestyOk`)

All three scaffolded cities have `honestyOk: true` — they fabricate nothing.

- **Zürich (`0261`)** — DOES: terrain (swissALTI3D, rung-50 unverified) + national swisstopo AV cadastre
  parcel routing (cadastral, keyless, ZH live-verified) + baked OSM context 5/9 + the national zone-GIS
  AND a **registered City-of-Zürich BZO rule pack** (`rulepacks/chZurichBzo.ts` + `chZurichBzoCatalogue.ts`:
  BZO 700.100 AZ/Vollgeschosse/Gebäudehöhe transcribed for two regimes) that computes an `estimated-ruleset`
  envelope for BZO-regime-resolved parcels. REFUSES: any parcel whose BZO regime is unresolved
  (`regime-ambiguous`) — the W2bIII 8.5 m vs 9.0 m height split makes a guessed regime a fabricated height,
  so the resolver refuses rather than guess. UNKNOWN (typed): PARCEL quality `not-queried`; LEGISLATION +
  ENVELOPE `not-queried` (a pack EXISTS but the per-clau verified count / buildable-land coverage is not
  scorecard-computed, AND the `VERIFICATION.md` sign-off is internally contradictory — see its RISK
  register); HEIGHTS `not-queried` (measured-CAPABLE via swisstopo nDSM, unbaked). `honestyOk: true`.
- **Genève (`6621`)** — DOES: terrain (swissALTI3D) + national swisstopo AV cadastre (GE live-verified
  2026-07-26) + baked OSM context 5/9 + national zone-GIS (canton GE is `full` in the geodienste WFS; ÖREB
  GE `RdppfSVC.svc` live). REFUSES: a buildable envelope — the national CH zoning pack identifies the zone
  but returns a CITED REFUSAL (no city FAR pack for GE), never a borrowed/invented number. UNKNOWN (typed):
  PARCEL `not-queried`, LEGISLATION/ENVELOPE `pending-implementation` (no city pack), HEIGHTS `not-queried`.
  `honestyOk: true`.
- **Bern (`0351`)** — DOES: terrain (swissALTI3D) + national swisstopo AV cadastre + baked OSM context 5/9
  + national zone-GIS via ÖREB BE. REFUSES: a buildable envelope (national cited-refusal only; no city FAR
  pack). UNKNOWN (typed): PARCEL/LEGISLATION/ENVELOPE/HEIGHTS as GE. Bern-specific caveat: canton BE is in
  the geodienste `ms:grundnutzung` **`incomplete`** cohort (BE, GR, SO, VS) — its national zone-GIS coverage
  is partial, so the `documented` (0.5) DATA-SOURCES credit rests on the ÖREB BE endpoint, not the WFS.
  `honestyOk: true`.

## Dossier index — the country-level files

| File | About | Feeds |
|---|---|---|
| **`COUNTRY-RATE.md`** (this) | per-city 7-axis roll-up — country composite master | rolls up all cities |
| [`RATE.md`](./RATE.md) | legacy national structured-fill (~20–25 % building-rule; ~85 % context-data) — pending rename to `LEGISLATION-RATE.md` | LEGISLATION |
| [`LOD-RATE.md`](./LOD-RATE.md) | national building/terrain LOD sub-rate | HEIGHTS/LOD |
| [`README.md`](./README.md) | national data layer — ÖREB/geodienste/swisstopo reach + the per-canton PDF bottleneck | all |
| [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md) | national climb | LEGISLATION (+all) |
| [`COUNTRY-DATA-STRATEGY.md`](./COUNTRY-DATA-STRATEGY.md) | the reusable data-ceiling reasoning | all |
| `findings/` · `sources/` · `topics/` | national studies · citations + sign-off · per-context-layer notes | DATA-SOURCES · LEGISLATION · CONTEXT |

---
*Last updated: 2026-07-30. Maintainer: UNASSIGNED. Authored under C63 audit L-649 Phase-1. BFS codes +
subdivision scheme documented in §0; axis state from `tools/context-bake/{bake,terrain,heightSources}.mjs`
+ `packages/site-parcel-data/src/parcelProviders/registry.ts` + `.../rulepacks/{chZoning,chZurichBzo}.ts`.*
