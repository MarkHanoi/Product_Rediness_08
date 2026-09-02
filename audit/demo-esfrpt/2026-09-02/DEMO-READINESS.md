# DEMO READINESS — Spain · France · Portugal (lane DEMO-ESFRPT)

**Date:** 2026-09-02 · **Mode:** READ-ONLY on production code (nothing edited, nothing committed by this lane) ·
**Deployed target measured:** `https://pryzm.fly.dev` at **`8febc2a6`** (built 2026-09-01T21:12:45Z, run 2041 — `/version`).
That deploy PRE-DATES today's three commits (`5faa71ba` 25-row bake, `8b3ffeb7` E8 spine, `c5d0109c` E9 registration wave),
so "LIVE-NOW" below means *on the deployed SHA*, and today's committed work is classified separately.

**Method.** Every cell below was measured at the layer the user experiences on 2026-09-02:
- **AXIS 1 PARCEL** — the committed routing chain driven offline (`resolveParcelCandidates` /
  `resolveRegisteredJurisdictionAt` via a scratchpad tsx driver, `transcripts/route9.txt`), PLUS the
  **live production proxy** the deployed client actually calls (`/api/catastro/parcel`, `/api/parcel/fr`,
  `/api/parcel/pt` — `transcripts/live-*-parcel.json`). UA `PRYZM-Research/1.0` on every live request.
- **AXIS 2 CONTEXT** — `tools/context-height-probe/probe.mjs` against the SHIPPED
  `buildings.pmtiles` (the same R2 URL and decoder ladder the browser uses), one probe per point
  (`transcripts/ctx-*.json`), plus live `terrain/<city>/layer.json` HEAD checks on R2.
- **AXIS 3 ENVELOPE** — the live zone proxies (`/api/muc/zoning`, `/api/madrid/normas-zonales`,
  `/api/paris/plu`, `/api/madrid/condiciones`, `/api/siu/classification` — `transcripts/live-*.json`),
  the returned zone codes fed through the committed `resolveZoneDisposition` (`transcripts/`, driver
  `dispo.mts`), and the editor dispatch ladder read from `apps/editor/src/ui/site/siteDispatch.ts`.

**Cell vocabulary.** `LIVE-NOW` (works on the deployed app today) · `EXISTS-UNWIRED` (committed code with
no reachable path at the user layer) · `COMMITTED-AWAITING-OPS` (no new code needed — a bake / publish /
deploy / signature dispatch closes it) · `MISSING` (needs new code or data that does not exist) ·
`UNKNOWN` stays distinct from absent wherever a probe could not decide.

---

## 1 · The 9-point × 3-axis table

| # | Point (probed coord) | AXIS 1 — PARCEL | AXIS 2 — CONTEXT LoD200 | AXIS 3 — ENVELOPE |
|---|---|---|---|---|
| 1 | **Madrid centre** (40.4203,−3.7058 Gran Vía 46) | **LIVE-NOW.** `/api/catastro/parcel` → refcat `0248301VK4704G`, 1 432 m² official, address "CL GRAN VIA 46". A click on Puerta del Sol itself returns honest `{parcel:null}` (a square) → draw fallback (`live-madrid-parcel.json`, `live-madrid3-parcel.json`). | **LIVE-NOW, measured.** 5 847 footprints, **5 738 measured-lidar** (98.3 % render as solid LoD200), median 20.1 m (`ctx-madrid.json`). Terrain `terrain/madrid` HTTP 200. | **LIVE-honest-refusal, no drawn envelope at this parcel.** Zone resolves live: NZ **1.2** (`live-madrid-nz.json`). `MADRID_NZ1_CERTIFIED=true` but the condiciones (área de movimiento) layer answered **502 then `features:[]`** here (15 s, flaky — `live-madrid-cond*.json`) → cited refusal. PGOUM97 zones 4–9 have packs but `MADRID_ENVELOPE_VERIFIED=false` + the C58 confidence plumbing gap ⇒ machine-extracted-unverified refusal (siteDispatch §HONESTY-GATE). |
| 2 | **Barcelona Eixample** (41.3928,2.1651 Pg. Gràcia 56) | **LIVE-NOW.** refcat `0229720DF3802G`, 1 046 m², `clickInside:true` (`live-bcn-parcel.json`). | **LIVE-NOW, measured.** 5 640 footprints, 5 437 measured-lidar (96.4 % solid), median 23.9 m (`ctx-bcn.json`). Terrain 200. | ⭐ **LIVE-NOW, SOLVED.** MUC live → clau **13a** (`live-bcn-muc.json`) → `resolveZoneDisposition('es-08019-barcelona','13a')` → **pack** (`transcripts` dispo run). The certified evaluator (E4 byte-parity) draws the full cited envelope. The only point of the nine where all three axes are simultaneously at full depth. |
| 3 | **Rural Castilla-La Mancha** (39.5500,−3.3500 Villacañas farmland, Toledo) | **LIVE-NOW.** Real rústica parcel: refcat `45186A06800141`, **67 505 m²** official, "Polígono 68 Parcela 141, Villacañas (Toledo)", `clickInside:true` (`live-ruralclm-parcel.json`). Whole-country, not city-island. | **LIVE-partial.** At the parcel: 25/25 tiles ABSENT (probe verdict `not-baked` — featureless farmland emits no tile; the national `spain` archive IS live: Villacañas town centre 1.5 km away holds 200 footprints, **0 measured** — `ctx-ruralclm.json`, `ctx-villacanascentre.json`). Terrain: the `villacanas` box starts at lat 39.5637 → the parcel itself is on the flat ellipsoid. Small-town MDS heights = UNMEASURED in the live archive. | **MISSING (+ overstatement risk).** Zoning dispatch = `none` → `estimated-default` triple labelled Estimated. ⚠ The **live** SIU proxy answers `clase:"no_urbanizable"` (published-structured, `live-clm-siu.json`) but is consulted only for Córdoba — an Estimated buildable triple is rendered on land the state classifies non-developable (L-616 family). |
| 4 | **Paris intra-muros** (48.8590,2.3480 Marais) | **LIVE-NOW.** `/api/parcel/fr` → idu `75101000AO0030`, 3 688 m², source `ign-fr` (`live-paris-parcel.json`). | **LIVE-degraded (heights).** 6 288 footprints live but only **191 measured** (3 %); solidRenderFraction **0.044**, 27.6 % assumed (`ctx-paris.json`). The `paris` row's BD TOPO live join is committed (`heightSources.mjs paris:'bdtopo'`) — a re-bake stamps real heights ⇒ heights are **COMMITTED-AWAITING-OPS**. Terrain 200. | **COMMITTED-AWAITING-SIGNATURE.** The whole chain runs live: `/api/paris/plu` → zone **UG**, hauteur **25 m**, filet B (`live-paris-plu.json`); `computeParisEnvelope` + published ECM geometry are proven. But `FR_PARIS_PLU_CERTIFIED=false` (§UNSIGNED-GATE-DEFAULTS-SHUT, 2026-08-02) ⇒ the user gets a CITED refusal carrying the real zone + hauteur, no drawn envelope. Reopening needs a human signature of the 3 assertions in `frParisPluBioclimatique.ts` — a decision, not code. |
| 5 | **Lyon** (45.7570,4.8330 Ainay) | **LIVE-NOW.** idu `69382000AN0002`, 320 m² (`live-lyon-parcel.json`). | **LIVE-degraded (heights).** 4 895 footprints, **0 measured**, 66 % assumed, median 9 m default, solid 0.2 % (`ctx-lyon.json`). `lyon:'bdtopo'` committed → heights COMMITTED-AWAITING-OPS. Terrain 200. | **MISSING.** Zoning dispatch `none` → Estimated triple. GPU zone identity IS fetchable nationally (E8 scout: zone-urba 6/6 cities) but no FR-national resolver/registration exists; per-zone document addressing is 1/6; the E8 spine has **no French reader** (Marseille PLUi: `failed / no-reader-configured`, honestly). |
| 6 | **Rural Auvergne** (45.5250,3.2200 Solignat, Puy-de-Dôme) | **LIVE-NOW.** idu `63422000ZK0036`, 1 645 m², "Solignat ZK 0036" (`live-ruralauv-parcel.json`). | **MISSING live / COMMITTED-AWAITING-OPS.** 25/25 tiles absent (`ctx-ruralauv.json`) — the live archive holds only the paris/lyon city boxes for France. The national `france` row is committed (5faa71ba, mass-only until the MNH stamp lands) in bake-plan **phase 2**, behind the R2-budget decision + the incremental-sync workflow switch. No terrain box → flat. | **MISSING.** Estimated triple. |
| 7 | **Lisbon centre** (38.7223,−9.1393 Baixa) | **LIVE-wiring, upstream-data-EMPTY.** `/api/parcel/pt` answers `{parcel:null,outcome:"empty"}` (`live-lisbon-parcel.json`) — SNIC genuinely has no urban Lisboa coverage (recon: Lisboa 1 747 parcels, 0 in core; only ~134/308 municípios hold cadastro). Editor falls to OSM footprint select, honestly labelled. Not a wiring gap — a national data gap. | **LIVE-degraded.** 7 271 footprints, 0 measured, **79 % assumed** 9 m ghosts (`ctx-lisbon.json`). **Terrain 404** (`terrain/lisbon`, `terrain/lisboa`) → flat ellipsoid. The national `portugal` row (mass-only + Mapterhorn terrain) is committed in bake-plan **phase 1** — it MUST be in the next publish or the deduped lisbon/porto city rows vanish from the map. | **MISSING.** No PT pack; PDM numerics are per-município PDF-only (LEGISLATION-RATE ~0 %); CRUS categorical zone WFS is verified live per-DICOFRE but unwired. Estimated triple. |
| 8 | **Porto** (41.1496,−8.6109 Aliados) | **LIVE-wiring, upstream-data-EMPTY.** `outcome:"empty"` (`live-porto-parcel.json`) — SNIC Porto = 0 parcels. Footprint fallback. | **LIVE-degraded.** 9 308 footprints, 0 measured, **88 % assumed** (`ctx-porto.json`). Terrain 404 → flat. Same phase-1 dependency as Lisbon. | **MISSING.** Porto's PDM regulamento is already text-extracted (319 459 chars, clean) but no pack/reader exists. Estimated triple. |
| 9 | **Rural Alentejo** (38.5200,−7.9500 nr. Évora) | ⭐ **LIVE-NOW.** A real 1 086-ha herdade resolves: refcat `AAA000909656`, **10 862 738 m²** registry-declared, freguesia 070525, click-inside verified (`live-ruralale-parcel.json`). Rural PT is where the cadastre actually exists — the inverse of every other country's coverage story. | **MISSING live / COMMITTED-AWAITING-OPS.** 25/25 tiles absent (`ctx-ruralale.json`); national `portugal` row phase-1. No terrain. | **MISSING.** Estimated triple. |

**Axis-1 attribute detail (what comes back):** ES — refcat + official m² + address + point-to-parcel distance
(+ `/api/catastro/block` exists for manzanas); no zoning link inline. FR — IDU + geometry-derived m² +
commune/section label; no zoning attributes. PT — national cadastral reference + registry-declared m²; the
DGT source is geometry-only by design (no ownership, no FAR, no height).

---

## 2 · The ordered demo gap list

| # | Gap (what the founder would see) | What closes it | Size | Owner |
|---|---|---|---|---|
| **G1** | **Paris shows a cited refusal instead of a drawn envelope**, with the real zone + 25 m hauteur already in hand. | **A signature, not code**: `FR_PARIS_PLU_CERTIFIED` flip requires a human to sign the 3 assertions listed in `packages/site-parcel-data/src/rulepacks/frParisPluBioclimatique.ts` (ordre continu reading · ECM ring is governing · plub_hauteur is the operative ceiling), then flag flip + deploy. All geometry/data legs are proven live. ⚠ The 2026-08-03 founder gate-authorization does NOT cover it — this gate is a legal-authority gate, so it needs an explicit founder/expert decision. | **Hours** (once the decision is made) | **NEW — founder decision.** No running lane owns it. |
| **G2** | **No context anywhere in FR/PT outside 2 city boxes; Lisbon/Porto flat + ghost-height; Paris/Lyon skylines grey.** | **The publish, in order:** (a) the **incremental-sync workflow switch** (arithmetically forced — an unscoped full bake cannot finish in a CI job, and a region-scoped publish today REPLACES the whole tileset); (b) the **R2 budget decision** (founder; projected 24–57 GB vs 10 GB free, ~$0.36–0.86/mo); then (c) CI `context-bake` dispatches: **portugal (phase 1 — mandatory before ANY next publish or lisbon/porto vanish)**, france (phase 2), **paris+lyon re-bake** (bdtopo heights go live), spain re-bake (wider MDS stamping). Zero new code. | **Days** (ops + CI wall-clock; the founder decision is the long pole) | **The sync-switch lane owns (a)+publishes; (b) is the founder; (c) is a dispatch once (a)+(b) land.** |
| **G3** | **Lyon and all non-Paris France answer with a generic Estimated triple that names no zone.** | A **FR national zone-identity leg on the GPU** (`wfs_du:zone_urba` — measured 6/6 answering nationally): resolver + registration on the Denmark/Paris "answers live" shape, yielding a zone-NAMED cited refusal (libelle + règlement PDF link) instead of the anonymous estimate. Numeric envelopes are NOT this gap — they need the **E8 French reader** (Marseille 478 pp has a text layer; today honestly `no-reader-configured`), which is weeks-class and not demo-critical. | **Days** (zone-identity leg) | **NEW small lane** (E9-shape registration). The E8 spine lane owns the eventual reader/numbers. |
| **G4** | **Portugal has no envelope story at all — not even a zone name.** | A **PT zone-identity leg on CRUS** (verified live per-DICOFRE, 11 categorical fields + PDF pointer; Lisboa even carries `ART_RPDM`): categorical zone + honest PDF-cited refusal. Optionally the first **PT pack (Porto)** — regulamento already extracted clean — behind the same L-449 human-signature discipline. | **Days** (CRUS leg) / days-to-week (first signed pack) | **NEW lane.** Nobody owns PT today. |
| **G5** | **Rural Spain renders an "Estimated" buildable triple on land SIU classifies `no_urbanizable`** — the L-616 overstatement family, live at probe point 3. | Wire the **already-live** `/api/siu/classification` as a national ES guard ahead of `applyEstimatedZoning`: on `no_urbanizable`/protected classes, dispatch a cited land-class refusal instead of the estimate. Server leg exists; this is a dispatch-ladder edit + tests. | **Hours-to-a-day** | **NEW (small).** |
| G6 | Madrid centre never draws: NZ1 explicit-area empty at many parcels (and the upstream is 15 s slow / 502-flaky); PGOUM97 zones sit behind `MADRID_ENVELOPE_VERIFIED=false` **and** the C58 confidence plumbing gap (`ZoningRulesEngine` ignores `defaultConfidence`). | Human verification signature for the 23 transcribed PGOUM97 zones + the C58 confidence fix, landed together (the code comment names that order deliberately). | Days | NEW / founder verification. |
| G7 | Deployed SHA (8febc2a6) lags today's E9/E8/bake commits. | A normal push-then-dispatch deploy once the in-flight lanes (proxy ee/lt/pl, sync-switch) land. Not ES/FR/PT-critical — all ES/FR/PT legs measured above are already in the deploy. | Hours | Deploy owner (founder workflow). |

---

## 3 · The honest minimum demo script — TODAY, zero new work

> Floor statement: **Barcelona is the only point where all three axes are simultaneously live at full
> depth.** The parcel axis is live at 7 of 9 points (and honestly-empty with a labelled fallback at the
> other 2). Measured context exists in Spanish cities only. Exactly one solved envelope city exists.

1. **Open with Barcelona Eixample (Pg. Gràcia).** Click-select → the real Catastro parcel snaps in
   (1 046 m², reference shown). The surrounding Eixample renders as **measured-LiDAR LoD200** (96 %
   solid skyline, median 23.9 m) on real terrain. The MUC resolves clau 13a live and the certified pack
   draws the **full cited envelope**. This is the complete founder story working end-to-end.
2. **Prove "whole country, not city islands" on the PARCEL axis — rural Spain.** Click farmland outside
   Villacañas → a real 6.75-ha rústica parcel with official area and polígono/parcela identity. Then
   **rural Portugal (Évora)** → a 1 086-ha herdade resolves live. Two countries, arbitrary rural land,
   real cadastral answers.
3. **France = data honesty as a feature.** Paris Marais: real PCI-Express parcel → context footprints
   render (do NOT lean on the skyline — heights are mostly grey "not surveyed" ghosts) → the envelope
   card shows the **real zone UG and the real 25 m ceiling as a cited refusal**: "PRYZM found the rule
   and declines to draw it until a human signs the reading." Frame it as the never-overstate discipline,
   because that is literally what it is. Lyon: parcel + footprints; envelope shows Estimated.
4. **Portugal cities, eyes open.** Lisbon/Porto: parcel select falls to the labelled OSM footprint —
   say out loud that Portugal has no urban cadastre in ~174 of 308 municípios and PRYZM refuses to
   fabricate one. Context footprints render (7–9 k buildings) but flat ground and 9 m ghosts.
5. **Do not demo:** Madrid solved envelopes (refusal today), any Portuguese envelope number, French
   measured heights, rural 3D context anywhere, or anything on the Canary Islands (outside the spain
   bake bbox).

---

## 4 · Evidence index

- `transcripts/route9.txt` — offline routing (9 points: provider candidates + zoning jurisdiction).
- `transcripts/live-*-parcel.json` — 11 live parcel probes (incl. the two honest-null Madrid clicks).
- `transcripts/live-{madrid-nz,bcn-muc,bcn-ov,paris-plu,clm-siu,madrid-cond,madrid-cond2}.json` — live zoning legs.
- `transcripts/ctx-*.json` — 11 shipped-tileset probes (9 points + Villacañas town ×2).
- Terrain HEADs: madrid/barcelona/paris/lyon/villacanas/toledo/alcazardesanjuan **200**; lisbon/lisboa/porto **404**.
- Flags read at HEAD: `FR_PARIS_PLU_CERTIFIED=false` (`frParisPluBioclimatique.ts:94`),
  `MADRID_NZ1_CERTIFIED=true` (`resolveMadridNZ1Ring.ts:132`), `MADRID_ENVELOPE_VERIFIED=false`
  (`esMadridPgoum97.ts:150`).
- Bake plan: `audit/europe-site-intel/2026-08-31/impl/regions-full-bake-plan.json` (portugal phase 1,
  france phase 2, prerequisites = R2 budget + sync switch).
- FR corpus state: `audit/europe-site-intel/2026-08-31/impl/e8-extraction-scout.md` (GPU 6/6 zone identity,
  1/6 per-zone doc, Marseille no-reader) · PT recon: `docs/04-reference/jurisdictions/pt/NEXT.md` +
  `LEGISLATION-RATE.md` (~0 % structured).
