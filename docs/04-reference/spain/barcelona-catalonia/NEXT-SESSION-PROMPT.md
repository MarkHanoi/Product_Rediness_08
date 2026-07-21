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
1. `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md` — rows **L-508b → L-527** (this session).
2. `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` — the "Session 2026-07-21" section + the
   L-525 / L-526 sub-task tables.
3. `docs/04-reference/spain/barcelona-catalonia/`: `RISK-REGISTER.md`,
   `L-525-ENVELOPE-ACCURACY-INVESTIGATION.md`, `L-526-LEGAL-RESEARCH-PROMPT.md`.
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
  `.github/workflows/deploy-fly.yml`. **Last marker = v254.** Rapid pushes CANCEL in-flight deploys
  (content still lands in the newest deploy). SW is network-first → hard-refresh after deploy.
- Log every new item per the template into the audit + implementation plan (+ MISSING-CONTRACTS on a
  contract gap). Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- localhost dev is unusable (event-loop starvation) — test on `pryzm.fly.dev`.

## CONFIRMED WORKING (shipped v247–v254, founder-verified)
Real "Real · constructed" envelope on draw + select (green badge, cited profunditat edificable, PGM
Art. 242.2); correct street-frontage depth (L-515); envelope no longer waits on Overpass (L-516/516b);
readable + non-empty panel (L-508b/518/518c); 3D-Site paints on startup (L-520); draw flow queries the
real parcel (L-521/521b); context prefetched at the parcel (L-524a). L-489 persistence captures site.

## DONE THIS SESSION (v254) — the L-525/L-526 accuracy triage
- **SHIPPED:** pack min-floor corrected **11 m → 12 m** (PGM Art. 242 minimum; `esBarcelonaEnsanche.ts`).
- **DIAGNOSED (code-verified, NOT blind-fixed):** the depth root cause is nailed. The block-fetch bbox
  is `BLOCK_BBOX_HALF_DEG = 0.002` ≈ **444 m** (~4× a 113 m Cerdà block) → it is **NOT clipping**.
  Catastro **masa 02309 genuinely = HALF a Cerdà illa** (14 parcels / 6,686 m²), while the pilot masa
  02297 was a full illa (23 parcels / 14,090 m²). **Catastro masa ≠ urbanistic illa** — the 5-char
  refcat-prefix manzana heuristic breaks here. Then, with roads=0, the all-perimeter-front model insets
  from the masa's INTERIOR edge too → the depth over-erodes and floors out. Full write-up in
  `L-526-LEGAL-FINDINGS.md` §"THE DEPTH ROOT CAUSE" + audit L-525.
- **The visible depth (24–28 m) is NOT yet fixed** — that needs the illa-assembly (L-525b below), which
  is real geometry/data work deliberately left for a fresh context, not blind-patched on a spent one.

## OPEN TASKS — PRIORITISED CHECKLIST

### P1 — ACCURACY (the founder's flagged "we cannot have such mistakes")
- [ ] **L-526 (LEGAL, do alongside the geometry) — verify the depth's legal basis.** Is the citation
      chain (PGM Art. 242.2 / 322.1 via AMB/MMAMB Dec-2010 consolidated 31-12-2009) correct + current?
      Does "max depth" = max BUILDING depth from the alineació (our 11 m)? **Source the 2008
      modification to Art. 327 §2** (panel says "not reflected" yet source is consolidated to end-2009
      — a contradiction; Art. 327 governs alçada + storeys + profunditat, so it could be WHY depth is
      too shallow). A parallel Claude-Chat research prompt exists (`L-526-LEGAL-RESEARCH-PROMPT.md`);
      fold its verdict in. **Doubt the rule before perfecting the geometry.**
- [ ] **L-525b (GEOMETRY, THE depth fix — do FIRST, highest-impact) — assemble the full illa.**
      ROOT CAUSE ALREADY CONFIRMED this session (see "DONE THIS SESSION"): the bbox is fine; Catastro
      **masa 02309 is only HALF a Cerdà illa** (6,686 m²), and `fetchBlockForParcel` /
      `dissolveParcelsToBlockRing` return that half-masa, so the all-perimeter inset floors the depth to
      ~11–12 m. **The fix is masa-union:** make the block provider return the FULL illa (~12,000 m²) —
      union masa 02309 with its adjacent sibling masa into ONE Cerdà block — because a Catastro masa is
      NOT guaranteed to equal the urbanistic illa. Then offset the whole illa (Art. 242) and intersect
      with the parcel; never offset a half-masa. AND classify the block-INTERIOR edge (the one facing
      the pati d'illa / the sibling masa, not a street) as non-front so all-perimeter-front stops
      eroding it. Probe FIRST (the discipline): log the dissolved `blockRing` bbox/area/bearings +
      parcel count, overlay on satellite for Pau Claris 155 — confirm the union now spans the whole
      113 m illa before trusting the depth. Files: `siteDispatch.ts` (`applyBcnZoningThenFallback`),
      `CatastroBlockProvider.ts`, `server/parcelZoningProxy.js` (the `manzanaPrefix` heuristic — it
      needs a masa-adjacency/union step). Details: `L-525-ENVELOPE-ACCURACY-INVESTIGATION.md`,
      `L-526-LEGAL-FINDINGS.md`. NOTE: the min-floor is ALREADY 12 m (v254) — do NOT re-touch it.
- [ ] **L-525c — depth MODEL (only if the block is whole).** All-perimeter inset over-erodes small/
      irregular blocks; the real profunditat is a street-frontage BAND leaving the pati d'illa
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

## RECOMMENDED FIRST MOVE NEXT SESSION (diagnosis + min-floor DONE v254; the fix is now turnkey)
The legal research (L-526) and the code diagnosis are BOTH resolved: **the depth error is GEOMETRY,
code-confirmed** — Art. 242 offsets the FULL illa, but Catastro masa 02309 = HALF a Cerdà illa
(6,686 m²) and the block provider returns that half, so the inset floors to ~11–12 m. The min-floor is
already corrected to 12 m (v254). So the FIRST implementation move is **L-525b — make the block provider
return the FULL illa via masa-union** (union masa 02309 + its sibling masa; Catastro masa ≠ urbanistic
illa), classify the block-interior edge as non-front, offset the whole illa (Art. 242), then intersect
the parcel. **Probe first** (log/overlay the dissolved ring for Pau Claris 155 → confirm it spans the
whole 113 m illa) before trusting the depth — this is the whole session's discipline. THEN apply the
other confirmed fixes: encode the **Art. 327.2 height table** (20 m street → PB+5 ≈ 20.75–22.40 m; use
the OFFICIAL street width) for L-525a/L-527; fix the **citation** (depth = Art. 242, DROP Art. 322.1;
height = Arts. 238/240/327; re-cite the current Barcelona NUMAMB/RPUC, drop the anachronistic "AMB Dec
2010"; repair the "2008 §2 not reflected" caveat — it's a HEIGHT change and the vintage is wrong anyway;
update `esBarcelonaEnsanche.ts` `BCN_ORDINANCE_REF` + the panel citation + RISK-REGISTER R1). STILL TO
CERTIFY (needs the interactive MUC/RPUC fitxa, not web search): the exact depth figure + official street
width for parcel 0230904DF3803 + the 20.75-vs-22.40 PB+5 reconciliation — **task L-528, ready-to-run
browser prompt at `PAU-CLARIS-155-CERTIFICATION-PROMPT.md`** (four params + a final table; official
sources only, no estimates). NOTE: the citation itself is ALREADY SHIPPED (v255, founder re-signed the
L-449 gate) — this certifies the NUMBERS, not the attribution.

## THE FOCUS, IN ONE LINE
**Make the Barcelona envelope look as right as it reads.** The data, flow, citation-honesty, and legal
diagnosis are DONE and founder-verified. The single remaining credibility gap is ACCURACY — depth
(L-525b illa-assembly, root cause confirmed → the highest-impact move) and heights (L-525a/L-527 shared
nDSM + Art. 327.2 table). Fix those two and the Barcelona demo is production-sound. Everything else
(context tile bake L-513, 3D-globe visuals L-510/517, features L-519/524B, Madrid/Córdoba, the 7-country
study) is downstream of nailing accuracy first. Do NOT blind-fix — probe, then fix, then log per template.
