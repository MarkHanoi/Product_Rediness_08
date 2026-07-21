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
1. `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` — rows **L-508b → L-530** (L-529 depth fix + L-530 frame probe are the newest).
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
  `.github/workflows/deploy-fly.yml`. **Last marker = v257.** Rapid pushes CANCEL in-flight deploys
  (content still lands in the newest deploy). SW is network-first → hard-refresh after deploy.
- Log every new item per the template into the audit + implementation plan (+ MISSING-CONTRACTS on a
  contract gap). Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- localhost dev is unusable (event-loop starvation) — test on `pryzm.fly.dev`.

## CONFIRMED WORKING (shipped v247–v254, founder-verified)
Real "Real · constructed" envelope on draw + select (green badge, cited profunditat edificable, PGM
Art. 242.2); correct street-frontage depth (L-515); envelope no longer waits on Overpass (L-516/516b);
readable + non-empty panel (L-508b/518/518c); 3D-Site paints on startup (L-520); draw flow queries the
real parcel (L-521/521b); context prefetched at the parcel (L-524a). L-489 persistence captures site.

## DONE LAST SESSION (v256–v257) — the depth is FIXED, and the documented cause was WRONG

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

⚠ **WIDER BLAST RADIUS, NOT YET SWEPT:** `insetPolygonPerEdge` backs `ZoningRulesEngine`,
`depthBandClip`, `blockDerivedDepth` and `siteDispatch` — i.e. EVERY setback inset in EVERY
jurisdiction. Any irregular plot at a meaningful setback could have been silently reporting "no
buildable area" or a floored figure. **Non-Spain pilot parcels have NOT been re-checked.**

**ALSO SHIPPED v257:** the Art. 327.2 **alçada reguladora table** (`resolveAlcadaReguladora`, 19
tests) + a **curated Cerdà official street-width allow-list** — both PURE and **deliberately
UNWIRED** (see L-525a below), and **§SITE-FRAME-PROBE** for L-530.

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

**1. Read the `§SITE-FRAME-PROBE` line (L-530) — it gates everything visual.** The founder reports the
3D-Site plot boundary no longer lines up with the context buildings. v257 ships the measurement, not a
fix, because three mechanisms produce that symptom and they need OPPOSITE fixes: **(1) origin /
translation** (anchor-vs-parcel-centroid — the L-521/L-524a family; the founder's log already shows two
context fetches whose bbox centres are ~800 m apart), **(2) θ / rotation** (`readProjectNorthRad` has a
documented history of latching 0 forever when the store link is absent at first read — a ~45° error in
Barcelona, where the Cerdà grid is 45° off true north), **(3) neither** (Catastro parcel vs OSM
footprints genuinely disagreeing). The probe prints `origin`, `theta`, `boundaryCentroid` and
`offsetFromOrigin` in metres with the reading key inline. **L-529 is already RULED OUT** as the cause,
on logic (it only rewrites the inset behind the purple envelope; the boundary never passes through it)
and by measurement (old-vs-new byte-identical on a cross-shaped drawn plot at every setback 1–6 m).

**2. Then WIRE the height (L-525a)** — now the biggest credibility gap, since the envelope is the right
DEPTH but still a fabricated ~9 m tall (~2.5× too short). The table and the width source are already
committed; what remains is: resolve address → official width → alçada → `envelope.maxHeightM`, and
**delete the hardcoded `: 9` fallback in `CesiumViewport.ts` (~L4073)**, which extrudes a fabricated
~PB+2 in the same purple study volume as a real height (the L-459 defect class). Held back deliberately
— do not stack a new height source on an unexplained frame problem.

**3. Then sweep the L-529 blast radius** — re-check the non-Spain pilot parcels now that deep insets
succeed where they used to return "no buildable area".

**STILL TO CERTIFY (needs the interactive MUC/RPUC fitxa, not web search):** the exact depth figure and
the official street width for parcel 0230904DF3803, plus the **20.75-vs-22.40 m** PB+5 reconciliation —
task **L-528**, ready-to-run browser prompt at `PAU-CLARIS-155-CERTIFICATION-PROMPT.md`. Note the
certified depth is now compared against **15.7 m**, not 12 m.

## THE FOCUS, IN ONE LINE

**Make the Barcelona envelope look as right as it reads.** The DEPTH is now genuinely right (15.7 m,
Art. 242.2-constructed, v256). What remains is the **HEIGHT** (L-525a — table + widths committed, wiring
held pending L-530) and the **frame alignment** (L-530 — probe shipped, one console line selects the
fix). Everything else (context tile bake L-513, 3D-globe visuals L-510/517, features L-519/524B,
Madrid/Córdoba, the 7-country study) is downstream. **Do NOT blind-fix — probe, then fix, then log per
template.** And when a doc says a root cause is "confirmed", check whether anyone measured it: this
session's entire first act was spent refuting three documents that agreed with each other.