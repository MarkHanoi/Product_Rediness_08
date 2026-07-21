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
  `.github/workflows/deploy-fly.yml`. **Last marker = v253.** Rapid pushes CANCEL in-flight deploys
  (content still lands in the newest deploy). SW is network-first → hard-refresh after deploy.
- Log every new item per the template into the audit + implementation plan (+ MISSING-CONTRACTS on a
  contract gap). Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- localhost dev is unusable (event-loop starvation) — test on `pryzm.fly.dev`.

## CONFIRMED WORKING (shipped v247–v253, founder-verified)
Real "Real · constructed" envelope on draw + select (green badge, cited profunditat edificable, PGM
Art. 242.2); correct street-frontage depth (L-515); envelope no longer waits on Overpass (L-516/516b);
readable + non-empty panel (L-508b/518/518c); 3D-Site paints on startup (L-520); draw flow queries the
real parcel (L-521/521b); context prefetched at the parcel (L-524a). L-489 persistence captures site.

## OPEN TASKS — PRIORITISED CHECKLIST

### P1 — ACCURACY (the founder's flagged "we cannot have such mistakes")
- [ ] **L-526 (LEGAL, do alongside the geometry) — verify the depth's legal basis.** Is the citation
      chain (PGM Art. 242.2 / 322.1 via AMB/MMAMB Dec-2010 consolidated 31-12-2009) correct + current?
      Does "max depth" = max BUILDING depth from the alineació (our 11 m)? **Source the 2008
      modification to Art. 327 §2** (panel says "not reflected" yet source is consolidated to end-2009
      — a contradiction; Art. 327 governs alçada + storeys + profunditat, so it could be WHY depth is
      too shallow). A parallel Claude-Chat research prompt exists (`L-526-LEGAL-RESEARCH-PROMPT.md`);
      fold its verdict in. **Doubt the rule before perfecting the geometry.**
- [ ] **L-525b (GEOMETRY, do FIRST — cheap + highest-impact) — verify the block dissolve.** Block
      02309 came out ~6,686 m² ≈ HALF a Cerdà manzana → the all-perimeter inset floored the depth to
      11 m (`min-floor`). Probe: in `apps/editor/src/ui/site/siteDispatch.ts` (`applyBcnZoningThenFallback`)
      log the dissolved `blockRing` bbox/area/bearings; overlay on satellite for a KNOWN parcel — full
      block or partial? If partial → fix `fetchBlockForParcel` / `dissolveParcelsToBlockRing`
      (a silent shrink on EVERY affected envelope). Details: `L-525-ENVELOPE-ACCURACY-INVESTIGATION.md`.
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

### P1 — CONTEXT RENDER LATENCY (last "feels-production" gap; needs a Docker machine)
- [ ] **L-513a — run the bake.** Tool BUILT: `tools/context-bake/`. `docker build -t pryzm-context-bake
      tools/context-bake` then `node tools/context-bake/bake.mjs` → upload `out/*.pmtiles` to object
      storage. (Live public Overpass is unfixable — 502/429/failover; static tiles = <50 ms.)
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
Do **L-525b's block-dissolve probe** (cheapest, highest-impact — a partial block silently shrinks every
envelope) and read back the **L-526 Claude-Chat legal verdict** in parallel. Those two together tell you
whether the depth is wrong because of the block (geometry) or the rule (legal) — and everything else
(height nDSM, the bake, the visuals) follows from a correct depth.
