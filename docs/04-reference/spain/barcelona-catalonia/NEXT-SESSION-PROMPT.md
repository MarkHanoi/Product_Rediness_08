# Next-session prompt — PRYZM Barcelona geospatial (maximum-context hand-off, 2026-07-21)

Paste this whole file to start the next Claude Code session.

---

You are continuing PRYZM (a browser BIM SaaS; pnpm monorepo, mid-migration to "PRYZM 3"). We have spent
this session getting the **Barcelona real geospatial end-to-end** to production quality. Work with the
"ship the probe before the fix" discipline — **never blind-fix geometry or render**; settle every root
cause with a live probe/console line first (the whole session was paid for on this rule).

## THE GOAL

**Immediate:** a REAL, credible end-to-end Barcelona demo — create project → geocode/select or draw a
parcel → real 3D-Site context + 3D-globe (Google photoreal) → a REAL, cited **buildable envelope**
(clau 13a/13E, profunditat edificable per PGM Art. 242.2, block-derived) → design → return to views.
The founder has CONFIRMED this is "sound/perfect" for the panel data + flow. The remaining gap is
**ACCURACY** (envelope + context building heights/depth) and **context render latency**.

**Medium-term:** (1) other Spanish cities (Madrid, Córdoba) then (2) the 7-country **context-data
quality upgrade** (NL/DK/CH/FR/DE/ES/PT) — OSM → national-authoritative buildings/LOD/height/roads/
water/parks/trees via the tiered per-country resolver. All scoped in `CONTEXT-DATA-COUNTRY-STUDY.md`.

## READ FIRST (in order)
1. `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` — rows **L-508b → L-534** (L-529 depth, L-525a height, L-531/532/533/534 are the newest).
2. `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` — the "Session 2026-07-21" section + the
   L-525 / L-526 sub-task tables.
3. `docs/04-reference/spain/barcelona-catalonia/`: `RISK-REGISTER.md`,
   `L-525-ENVELOPE-ACCURACY-INVESTIGATION.md` (READ ITS RESOLUTION BOX FIRST — the body below it is superseded), `L-526-LEGAL-FINDINGS.md`.
4. `docs/04-reference/spain/SPAIN-HEIGHT-MEASUREMENT.md` (the LiDAR-nDSM method) +
   `spain/CONTEXT-DATA-SPIKE.md`; `docs/04-reference/CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` (§8 bake
   sources, §9 tile-reader spec).
5. Memories: `barcelona-end-to-end-production-state`, `context-3d-tiles-not-live-overpass`,
   `barcelona-edificabilitat-is-a-construction`, `context-data-honesty-family`,
   `architectural-soundness-mandate`.
6. Governance: `CLAUDE.md` + `docs/02-decisions/contracts/` (C58 zoning, C57 parcel, C19 site,
   C12/C55 geodata, C23 provenance); ADR-0270 (alignment/depth), ADR-0271 (block-derived depth).

## CONVENTIONS (NON-NEGOTIABLE)
- Root `npx tsc --skipLibCheck --noEmit` MUST be clean before EVERY commit (Fly build is strict —
  noUnusedLocals; a new dep MUST commit `pnpm-lock.yaml` in the SAME commit or the build breaks).
- Shared checkout: commit with EXPLICIT pathspecs; NEVER `git stash` / `git reset --hard` / `git add -A`.
- Deploy = push to `main` + a `# deploy-marker: vNNN — <what to test>` line in
  `.github/workflows/deploy-fly.yml`. **Last marker = v268.** Rapid pushes CANCEL in-flight deploys
  (content still lands in the newest deploy). SW is network-first → hard-refresh after deploy.
- Log every new item per the template into the audit + implementation plan (+ MISSING-CONTRACTS on a
  contract gap). Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- localhost dev is unusable (event-loop starvation) — test on `pryzm.fly.dev`.

## CONFIRMED WORKING (shipped v247–v263, founder-verified)
Real "Real · constructed" envelope on draw + select (green badge, cited profunditat edificable, PGM
Art. 242.2); correct street-frontage depth (L-515); envelope no longer waits on Overpass (L-516/516b);
readable + non-empty panel (L-508b/518/518c); 3D-Site paints on startup (L-520); draw flow queries the
real parcel (L-521/521b); context prefetched at the parcel (L-524a). L-489 persistence captures site.

## ⚡ READ THIS FIRST — THE STATE CHANGED FUNDAMENTALLY ON 2026-07-21 (v256–v268)

**Yesterday's framing was "Barcelona works, Spain is unknown." That is obsolete. The GEOMETRY now
works across Spain; what remains is LEGAL CURATION, city by city.** Four separate "confirmed" root
causes were falsified by probe in one day — trust measurements in this file, not prose elsewhere.

**The numbers that matter now (all measured, none estimated):**
- **Block dissolve 63.5 % → 91.4 %** across 5 cities / 956 real manzanas (**ADR-0274**, L-539).
  Córdoba went **0/3 → 90.8 %**. **0 pre-existing rings changed, 0 lost** — guaranteed by
  exact-pass-first AND verified on all 607. *Madrid and Córdoba are no longer geometry-blocked.*
- **Barcelona fabrications: 741 points → 0.** Ground getting a constructed-or-cited answer
  **6.5 % → 86.1 %** (L-550/L-551). Private buildable land positively answered **24.2 % → 48.4 %**.
- **Street width is a CONSTRUCTION** (**ADR-0275**, L-537): Barcelona height coverage **44 % → 86 %**.
- **CI now gates deploys** (L-540, v268). Before that, v256–v267 all shipped with CI red and ungated.

**FOUNDER DECISION 2026-07-21 — `no-rule-pack` refusal switched ON.** 51.6 % of Barcelona's private
buildable land (13b, 12, 12b, 22a, 22@, 20a/*) now shows NO envelope + a cited refusal rather than a
generic estimated setback triple, because for an *alineació de vial* zone that triple is the WRONG
GEOMETRIC OPERATION, not merely an imprecise value. **Do not "restore" it.**

**⚠ FIVE CONTRACT-vs-CODE CONFLICTS ARE LOGGED AND NEED A HUMAN** (see C57 §13 / C58 / C19 §13):
(1) **C58 has no `constructed` confidence tier (L-518)** — Barcelona's real, block-derived,
ordinance-cited depth renders with an **ESTIMATED** badge. Our best data is undersold by our own UI,
and the September wedge depends on that distinction. (2) **L-560** — θ is derived from the parcel's
LONGEST edge (often a party wall or chamfer): within ONE Cerdà block θ measured 44.6, −44.9, −37.6,
0.0, 31.4, 20.2°. Every generated wall is squared to that frame. Fixing it re-squares EXISTING saved
projects — needs a migration decision. (3) the C19 θ invariant is documented but not enforced.
(4) correct 326-vertex block rings breach a 200-vertex hard reject. (5) **20.75 vs 22.40 m** for PB+5
unreconciled (L-528).

**BLOCKED ON THE FOUNDER, NOT ON ENGINEERING:** the **R2 bucket** (kills the `/items/*.glb` 404s in
every console log and unblocks the L-513a tile bake — live public Overpass is the last unreliable
dependency on the demo critical path); an **interactive RPUC/AMB session** to source **Art. 328**
(clau 13b) and **Art. 316** (nucli antic) — automated fetches get 403/404 for INE 08019, and Phases
1–3 cannot ship without them; and **L-528 certification**.

**THE DISCIPLINE THAT PAID FOR THE DAY:** four convenient hypotheses died on contact with a probe —
the half-illa masa-union, "nucli antic is a cheap parameter change", "the dissolve fails on slivers"
(zero slivers in 250,646 edges), and clau 13b being config-only (a municipal republication claimed a
single 18 m depth — adopting it would have replaced the Art. 242 algorithm with a constant,
city-wide). **When a doc says a root cause is CONFIRMED, check whether anyone measured it.**

---

## DONE (v256–v263) — depth AND height are FIXED; the documented depth cause was WRONG

⚠ **READ THIS BEFORE TRUSTING ANY "CONFIRMED ROOT CAUSE" IN THE OLDER DOCS.** Three documents (the
audit, `L-525-ENVELOPE-ACCURACY-INVESTIGATION.md`, `L-526-LEGAL-FINDINGS.md`) had independently
converged on *"Catastro masa 02309 is HALF a Cerdà illa → fix = masa-union → turnkey"*. It was a
shared inference from ONE number (6,686 m² vs a nominal 12,769 m²) that **nobody had measured the
shape behind**, and it was wrong. So was the parallel legal theory. Five live-Catastro probes (the
WFS is keyless and callable straight from the dev box — no deploy needed, ~10 minutes) settled it:

- masa 02309's bbox is **113.4 × 113.8 m** with **ZERO cross-masa adjacency links** in a 444 m
  search ⇒ **there is no sibling masa to union with**;
- its dissolved ring is SOLID (enclosed = summed parcel area = 6,696 m²), perimeter only **336 m**
  ⇒ a genuine **~82 × 82 m block rotated ~45°** (the Eixample grid bearing), not half of anything.
  The half-illa arithmetic compared a *rotated small block* against a *nominal axis-aligned* one.

**THE ACTUAL ROOT CAUSE (L-529, FIXED v256):** `insetPolygonPerEdge`'s greedy
`removeSelfIntersections` **collapsed the block ring from 40 vertices to 2** at any inset ≥ 8 m
(clean to d=6, degenerate at every d ≥ 8; a clean 82 m control square handled d=25 fine).
`solveBlockDerivedDepth` reads a degenerate inset as ZERO interior free area ⇒ Art. 242.2
unsatisfiable at any depth ⇒ fall to the ordinance FLOOR and flag `degenerate`. Fix =
**§INSET-LOOP-DECOMPOSE** (split the self-intersecting offset ring into simple loops; discard loops
wound opposite the CCW input on ORIENTATION, never a size threshold; match crossings by edge-pair
identity so no tolerance governs topology).

**CL Pau Claris 155: `12.0 m · min-floor · degenerate=true` → `15.7 m · interior-ratio ·
achievedFreeRatio=0.300 · degenerate=false`** — the genuine Art. 242.2 construction.

The exact bisection in `blockDerivedDepth.ts` was deliberately NOT replaced: Art. 242 says *"figura
similar a la illa"* — an equidistant figure **similar** to the block, i.e. **sharp mitered corners** —
so the miter is the legally faithful construction and a distance-field solve (validated to 2 dp
against an analytic control) served only as the verification ORACLE. They bracket as theory predicts:
**15.7 m miter (shipped) vs 17.4 m distance-field**.

⚠ **WIDER BLAST RADIUS — SWEPT (v258), AND IT WAS NEVER A BARCELONA BUG.** `insetPolygonPerEdge`
backs `ZoningRulesEngine`, `depthBandClip`, `blockDerivedDepth` and `siteDispatch` — EVERY setback
inset in EVERY jurisdiction. 684 old-vs-new cases: **0 regressed, 0 changed, 0 soundness escapes,
21 FIXED**, so the change is strictly a repair. The headline: a **FLAG / BATTLE-AXE lot** reported
"no buildable area" at the DEFAULT pack's own 3/1.5/3 m setbacks, everywhere. **STILL OPEN: the
non-Spain pilot PARCELS have not been re-opened since** — cheap, and the last unexamined consequence.

**HEIGHT IS ALSO FIXED (L-525a, v259) — founder-verified live.** PGM **Art. 327.2** alçada table
(`bcnAlcadaReguladora.ts`, 19 tests) + a curated Cerdà *ample oficial* allow-list
(`bcnOfficialStreetWidths.ts`) now CONSTRUCT the height AND the storey count, with a citable
`maxHeight` derivation row. Live: `DIPUTACIO ample oficial 20.00 m → PB+5 = 20.75 m`, envelope
`block-constructed`, depth 26.3 m, 90 % of parcel covered. **The hardcoded `: 9` fallback in
`CesiumViewport.ts` is GONE** — with no known height the envelope draws as a 0.5 m FOOTPRINT SLAB
(§ENVELOPE-NO-FABRICATED-HEIGHT), never an invented prism.

⚠ **THE TWO "9 m" PROBLEMS ARE DIFFERENT — DO NOT CONFLATE THEM.** The ENVELOPE height is fixed.
The **CONTEXT NEIGHBOUR** heights are still ~35–40 % flat 9 m, because that share of Barcelona OSM
footprints carries no `height`/`building:levels` tag. That is **L-527**, a DATA-COVERAGE problem no
code can fix; it needs the LiDAR nDSM build. Symptom: move one manzana and the neighbours go flat
again. v263 ships the honest interim (§CTX-ASSUMED-HEIGHT-VISIBLE — assumed-height buildings render
translucent/cooler so a guess cannot read as surveyed). **A "nicer" fix was deliberately REJECTED:**
inheriting a neighbourhood median would make fabricated data MORE convincing, which is strictly
worse than visibly wrong, and is the exact failure this session spent its length unwinding.

**ALSO SHIPPED v258–v263, all founder-reported, all root-caused from live logs:**
- **L-529 blast sweep (v258)** — 684 old-vs-new cases: **0 regressed, 0 changed, 0 soundness
  escapes, 21 FIXED**. The collapse was never a Barcelona bug: a **FLAG / BATTLE-AXE lot** (narrow
  neck onto a wider body) reported "no buildable area" at the DEFAULT pack's 3/1.5/3 m setbacks in
  EVERY jurisdiction; likewise an L-shape at 8 m and 6 % of randomised non-convex parcels at 6 m.
- **L-530 (v257) — RESOLVED by its own probe.** `§SITE-FRAME-PROBE` reported `theta=43.71°`
  (the Cerdà grid bearing, correct) and a 23.2 m first-vertex→centroid offset on a 616 m² plot —
  i.e. the plot's own geometry. **No origin bug, no θ bug.** L-529 was ruled out as the cause on
  logic AND measurement (byte-identical old-vs-new on a cross-shaped drawn plot, every setback).
- **L-531 (v259)** — context buildings were held hostage: the near ring was fetched and logged as
  "secured", then `await`ed behind the expensive far ring, so nothing painted until that settled
  (tens of seconds, usually `0 footprints`) — and toggling the envelope forced a re-render that
  made them appear. **Second occurrence of the L-516 defect class** (an optional refinement gating a
  critical path); now 2500 ms-bounded (§CTX-FAR-RING-NONBLOCKING).
- **L-532 (v260)** — two camera defaults for one intent (3D Site opened `plan` 0°/−68°, globe NW
  oblique 325°/−45°). One `DEFAULT_3D_SITE_VIEW` constant now drives it. ⚠ REMAINING: the **BIM 3D
  view is a separate camera system** and still frames independently — the other half of the founder's
  request, and it wants a live iterate-and-look pass.
- **L-533 (v261)** — envelope latency: the block route had **NO cache at all**; it spent a whole
  extra round-trip re-fetching the parcel just to centre its own bbox; and the roads deadline was a
  2 s tax for a query that returns 0 every time in dense Eixample. Now cached per manzana
  (per-handler, not module-global — see the audit for why that distinction bit), centroid reused,
  deadline 600 ms. `§BCN-ENVELOPE-TIMING` measures what remains.
- **L-534 (v262)** — `overpass.kumi.systems` removed from the BROWSER mirror list (CORS-blocked from
  pryzm.fly.dev, so a guaranteed-failed leg). Still used server-side, where CORS does not apply.

## OPEN TASKS — PRIORITISED CHECKLIST

### P1 — ACCURACY (the founder's flagged "we cannot have such mistakes")

- [x] **L-526 (LEGAL) — RESOLVED.** Primary-source verdict in `L-526-LEGAL-FINDINGS.md`; citation fix
      SHIPPED v255 (depth = Art. 242, NOT 322.1; height = Arts. 238/240/327; source = current
      consolidated RPUC/NUMAMB; the anachronistic "AMB Dec 2010" and the self-contradictory "2008 §2
      not reflected" caveat both dropped). Min-floor corrected to 12 m (v254). ⚠ Its one GEOMETRY
      inference — "the depth error is a partial/half illa" — was REFUTED (see above); the LEGAL
      findings are unaffected and still hold.

- [x] **L-525b / L-525c — CLOSED AS MIS-SCOPED.** There is no partial block to assemble (probed:
      zero cross-masa adjacency, bbox 113.4 × 113.8 m, solid 6,696 m² ring ⇒ a real ~82 m block
      rotated 45°), and no evidence the all-perimeter model over-erodes once the inset works. The
      depth was fixed at its real cause instead — **L-529**, shipped v256. **Do not resurrect the
      masa-union work.**

- [ ] **L-530 (DO FIRST) — 3D-Site boundary vs context misalignment.** Probe SHIPPED v257
      (`§SITE-FRAME-PROBE`). Read the one console line, then fix the mechanism it names: origin/
      translation (L-521/L-524a family), θ/rotation (`readProjectNorthRad` latching 0), or neither.
      L-529 is already ruled out as the cause, on logic and by measurement.

- [ ] **L-525a — WIRE the height (table + widths already committed v257, deliberately unwired).**
      `resolveAlcadaReguladora` (Art. 327.2, 19 tests) + `bcnOfficialStreetWidths.ts` (curated Cerdà
      allow-list) exist. Remaining: address → official width → alçada → `envelope.maxHeightM`, and
      **DELETE the hardcoded `: 9` fallback in `CesiumViewport.ts` (~L4073)** which extrudes a
      fabricated ~PB+2 in the same purple volume as a real height (the L-459 defect class).
      ⚠ Barcelona publishes NO machine-readable *ample oficial* (probed: the only relevant `vial`
      dataset is a WMS raster with no width attribute), and a MEASURED width cannot substitute —
      the Art. 327.2 bands are STEPS and the Cerdà grid sits ON one (20.00 m = the PB+4/PB+5 edge,
      so 1 cm of noise moves the building a full storey). Hence the allow-list + the band-edge
      refusal. **Held pending L-530** — do not stack a new height source on an unexplained frame bug.

- [ ] **L-529 follow-up — SWEEP THE BLAST RADIUS.** Re-check the non-Spain pilot parcels; deep insets
      that used to return "no buildable area" now succeed. Also: multi-region `InsetResult` if a
      genuinely severed plot appears (today the largest surviving loop is returned — conservative,
      documented, not faked).

      courtyard, not an inset from every edge (incl. chamfers). Evolve `blockDerivedDepth.ts`.
- [ ] **L-525a + L-527 — HEIGHTS, via ONE shared nDSM module.** Both the envelope-parcel height
      (fabricated ~9 m, L-525a) AND the context neighbours (~36% OSM-tagless → flat 9 m, L-527) are
      fixed by the SAME **LiDAR nDSM** pipeline in `spain/SPAIN-HEIGHT-MEASUREMENT.md` (PNOA/ICGC,
      90th-pctile of DSM−DTM per footprint, three-field badge). Build the shared module (L-511c/L-512b)
      once; run it over the envelope building + context footprints; bake the height INTO the L-513a
      PMTiles. For the ENVELOPE height specifically (L-525a) also encode the PGM **alçada reguladora**
      table (street-width → height, ~20.75 m std Eixample) — no direct alçada layer (probe was
      inconclusive), so CONSTRUCT it (amplada de vial = the measured frontage-to-frontage gap, reuses
      block geometry). Interim: badge `assumed` heights ESTIMATED so a guess never reads as surveyed.

### P1 — CONTEXT RENDER LATENCY (last "feels-production" gap)
**STORAGE DECIDED (founder 2026-07-21): Cloudflare R2, bucket `pryzm-assets`, prefixes `tiles/` +
`items/`. Full setup + env-var contract + upload commands + caching in `OBJECT-STORAGE-R2-DECISION.md`.**
The dependency chain: (1) founder creates bucket + public domain + token → hands over `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` + the base URL; then all of the below are unblocked.
- [ ] **GLB re-host (quick win) — kill the `/items/*.glb` 404.** Once the bucket exists: `aws s3 sync`
      the 185 MB furniture catalog to `pryzm-assets/items/`, set `VITE_GLB_URL`, and swap the loader's
      `/items/x.glb` → `${VITE_GLB_URL}x.glb`. No other change. (memory `furniture-glb-404-object-storage`.)
- [ ] **L-513a — the bake, as a GitHub-Actions `workflow_dispatch` job (recommended over local Docker).**
      Tool BUILT: `tools/context-bake/` (Dockerfile bundles `osmium` + `tippecanoe`; downloads Geofabrik
      Cataluña pbf ~200–300 MB → clip → filter → tile → PMTiles; ~5–15 min; needs Docker + ~2–4 GB disk).
      Write a `.github/workflows/context-bake.yml` that runs the image and `aws s3 sync`s `out/*.pmtiles`
      to `pryzm-assets/tiles/` using the `R2_*` repo secrets; founder clicks "Run". (Live public Overpass
      is unfixable — 502/429/failover; static tiles = <50 ms.)
- [ ] **L-513b — wire the client reader** per `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md §9`: add
      `pmtiles` + `@mapbox/vector-tile` + `pbf`, COMMIT the lockfile same commit; new
      `apps/editor/src/ui/geospatial/contextTiles.ts` (drop-in for `fetchContextBuildingsNearAndFar`);
      gate on `VITE_CONTEXT_TILES_URL` (Overpass fallback until tiles exist). NEEDS real tiles to test.

### P2 — 3D-globe visuals (need a LIVE browser — iterate-and-look, NOT blind)
- [ ] **L-510** white party-wall caps on the parcel void (founder-requested ×4; void reads black).
- [ ] **L-517** clip facade-sliver (tune the outward buffer — under-sized vs offset).
- [ ] **L-520 confirm** the ResizeObserver fixed blank-on-startup.

### P2 — features / study (docs done, build pending)
- [ ] **L-519** interactive envelope↔data linking (click a panel row → select its geometry; foundation
      = a C58 `constraint → geometry` map; reuse SelectionBus + GPU-pick highlight).
- [ ] **L-524 Part B** context-ready loading gate (front-load the wait into the view-activation overlay).
- [ ] **L-511/512/514/522** country context-data study — docs complete, adapters unbuilt; ⚠ FABDEM
      non-commercial + Lisbon CML licences; MADRID + CÓRDOBA are the next cities.

### Also open (not Barcelona-blocking)
- [ ] L-489 Gate-2: confirm persistence captures site on a save WITH walls (probe reads `siteStore=
      resolved`; capture looks fixed — verify the float case is gone).
- [ ] WebGPU device-loss on the renderer backend toggle; furniture-GLB 404 (re-host on object storage).

## MISSING CONTRACTS (logged in `docs/02-decisions/MISSING-CONTRACTS-AUDIT-2026-06-01.md`)
- Graded / source-tagged CONTEXT-DATA provenance (C23 is binary REAL/ESTIMATED; the height model needs
  graded + cycle-tagged) — extend C23 or add a spec BEFORE the graded height badge ships.
- Data↔geometry bidirectional link (L-519) — no contract governs clicking a report row to select geometry.

## RECOMMENDED FIRST MOVE NEXT SESSION

**The Barcelona envelope is now ACCURATE and founder-verified: real depth (Art. 242.2 construction)
and real height (Art. 327.2 construction), both cited, both amber/estimated by design.** What remains
is NOT envelope correctness. Work the queue in this order:

**1. UNBLOCK THE FOUNDER-GATED ITEMS FIRST — they are pure waiting, not engineering.**
   - **R2 credentials** (`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` + base URL).
     Until the bucket exists, the GLB re-host, the **L-513a** tile bake and **L-513b** reader are all
     dead in the water. Setup is written: `OBJECT-STORAGE-R2-DECISION.md`.
   - **L-528 certification** — the founder in the MUC/RPUC viewer with
     `PAU-CLARIS-155-CERTIFICATION-PROMPT.md`. This is the ONLY path from amber to green. Note the
     certified depth is now compared against **15.7 m / 26.3 m**, not 12 m, and the certified height
     against **20.75 m** — and the **20.75-vs-22.40 m PB+5** question is still open.

**2. THE L-529 FOLLOW-UP NOBODY HAS DONE — re-check the NON-SPAIN pilot parcels.** The inset fix
   changed 21 of 684 swept cases from "no buildable area" to a real envelope, including a
   battle-axe lot at the DEFAULT setbacks in every jurisdiction. Denmark/Plandata pilots have NOT
   been re-verified since. This is cheap and is the last unexamined consequence of the fix.

**3. L-527 heights — the real build.** ~35–40 % of context footprints have no OSM height. Build the
   shared **LiDAR nDSM** module (`spain/SPAIN-HEIGHT-MEASUREMENT.md`: PNOA/ICGC, 90th-pctile of
   DSM−DTM per footprint) — the SAME module that would certify the envelope height — and bake the
   result into the L-513a PMTiles. Do NOT substitute a prettier guess; v263 deliberately makes the
   guesses LOOK like guesses instead, and that decision should stand until real heights exist.

**4. The visual pass, WITH the founder at the screen** (this repo's own P2 rule: iterate-and-look,
   never blind): the **BIM 3D camera** (the remaining half of L-532 — it is a separate camera system
   from Cesium's), **L-510** white party-wall caps, **L-517** facade sliver.

**5. L-519 panel selectability** — the founder asked; it is unbuilt AND ungoverned. Write the
   C58 `constraint → geometry` map spec FIRST (it is already logged in MISSING-CONTRACTS), then wire
   SelectionBus + the GPU-pick highlight.

⚠ **AND THE HABIT THAT PAID FOR THIS SESSION:** when a doc says a root cause is "confirmed", check
whether anyone MEASURED it. Three documents agreed the depth bug was a half-illa needing masa-union;
all three were wrong, and a ten-minute probe against the keyless Catastro WFS — from the dev box, no
deploy — refuted them. `server/parcelZoningProxy.js` exports its parsers precisely so a probe cannot
disagree with the code path it is diagnosing.

## THE FOCUS, IN ONE LINE

**Make the Barcelona envelope look as right as it reads.** The DEPTH is now genuinely right (15.7 m,
Art. 242.2-constructed, v256). What remains is the **HEIGHT** (L-525a — table + widths committed, wiring
held pending L-530) and the **frame alignment** (L-530 — probe shipped, one console line selects the
fix). Everything else (context tile bake L-513, 3D-globe visuals L-510/517, features L-519/524B,
Madrid/Córdoba, the 7-country study) is downstream. **Do NOT blind-fix — probe, then fix, then log per
template.** And when a doc says a root cause is "confirmed", check whether anyone measured it: this
session's entire first act was spent refuting three documents that agreed with each other.