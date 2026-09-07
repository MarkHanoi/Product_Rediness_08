# SESSION HANDOVER — 2026-09-07 (orchestrator close)

**LIVE AND PROVEN:** `26396bb8` — bundle proof **6/6 PASS** (chunk `main-ok2bphZQ.js`). Before it: `19b0220c` (6/6) and `722403a1` (6/6).
**DEPLOYING at close:** `f5b0b42e` — rooms + massing paint on the views (`1fa54287`) and the cited-paths ratchet fix (`d6713967`). Root tsc RC=0 on the detached worktree before launch.
**FIRST ACTION NEXT SESSION:** `bash tools/deploy/fly-bundle-proof.sh f5b0b42e`. If it does not pass, redeploy per `DEPLOY-CONTRACT-MANUAL-FLY.md` §6.9.11/§6.9.12 (detached worktree `C:/pryzm-deploy/tree`, `FLY_API_TOKEN` from `~/.fly/pryzm_deploy_token`, `DOCKER_CONFIG=C:/pryzm-deploy/empty-docker-config`, no MSYS exports).

## What 19b0220c carries (test these first)
- L-13053 single view = layout fact · L-13057 onboarding "Where is your project?" + cadastral ref (already live in 722403a1)
- L-13058 context extent: far tier 8,000 inst / 1,781 m, trees ×2, people ×2 — read `§CTX-PMTILES-READER`, `§FEAT-FORMA-CONTEXT-EXTENT-LOD`, `§STARTUP-GROUND-SAMPLE-COALESCE` (maxConcurrentFlights MUST be 1) on prod
- L-13037 massing SHAPES on the card (I/L/angled L/U before the plates) · L-13039 "Create it myself" + rooms per level · §26.6.3 pale solid massing
- L-13046 card rules 1–3: dedupe, every figure paints on all three views (incl. Bounding box and per-edge), "What can I build here?", ✕ removed, four named rows, SETBACK REGISTER, intent beside ceiling
- ENVELOPE-DRAW C1–C3: authored provenance on every created envelope; create REPLACES instead of accumulating
- §SITE-SCOPE phase 1: `SiteModel.scope` schema + command + pure clip (no slider yet)
- USAS seq-write fix (context-bake only)

## OPEN LANES CUT MID-FLIGHT
- **SCOPE-SLAB phase 2 — WIRING RECOVERED AND LANDED (`26396bb8`), SLIDER STILL NOT BUILT.**
  The lane was killed by a session rate limit mid-edit, leaving `opts` declared on
  `readContextTileFeatures` and consumed inside `readContextTilesOnce`, which never received it
  (TS6133 + TS2304 — HEAD would not have built). Completed as that parameter's own doc comment
  specifies (threaded as `fanOutCapOverride`, one argument, no new policy) and verified: root tsc
  RC=0 · geospatial 31 files / 469 tests · four P-gates RC=0. What landed: `site.scope-changed` on
  the runtime event map, `setContextScope` as the ONE entry point, `scopeFetchHalfDeg` (**F-1**),
  `scopeReadFanOutCap` threaded through 19 call sites (**F-2**), `applySiteScopeClip`.
  **Still to build:** the per-pane `SiteScopeSlider.ts`, the globe clip + slab side, and **F-8**
  (`setContextScope` must SWAP, not clear before the fetch resolves — the L-635 blank-Madrid shape).
  Nothing scope-related is browser-verified. Plan: `SPEC-3D-SITE-PRODUCTION-CONTEXT.md` §7.6.
- **ENVELOPE-DRAW C4–C8** — plan `docs/03-execution/plans/PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS.md`; corrections: R5 wrong (port frame is PROJECT frame, adapters `enuToSceneXZ` at the edge); C8 already declared `fc32f235` (add `supersedes` to its reason); `pnpm --filter @pryzm/geometry-slab typecheck` is red at HEAD (use root tsc).


## LANDED AFTER THE FIRST CLOSE (2026-09-07 10:00-11:00Z)
- `d6713967` **cited-paths ratchet GREEN** — 507→462, baseline tightened DOWN 490→462, zero new PLANNED markers (L-13072). My attribution of its cause was WRONG; the lane measured it.
- `1fa54287` **rooms paint on all three views + the massing candidate previews on both site views** (L-13073, L-13074). +72 tests, 0 regressions, five gates RC=0.
- `26396bb8` **site-scope phase-2 wiring** recovered from a rate-limited lane (F-1, F-2 fixed; F-8 still open).
⚠ Still NOT browser-verified anywhere: the highlight pixels, the massing plate pixels, the scope crop. No headless Cesium/MapLibre render test exists in this repo.

## R2 AT CLOSE — FIVE OF SIX BAKES GREEN
massachusetts 34106885030 ✅ (365,729 measured, Boston gate 4,044 — the USAS fix PROVEN on the run that failed) · texas 34106892241 ✅ · illinois 34106895725 ✅ · newyork 34106900276 ✅ · gccstates 34101679682 ✅ · **california 34106888476 STILL BAKING** (81 min at close vs 72 predicted; 1.33 GB extract, 330-min ceiling).
A watcher script (`scratchpad/await-ca-then-publish.mjs`) was armed to dispatch the buildings publish on california SUCCESS — **it dies with the session, so re-check california by hand first.**

## R2 CHAIN (founder authorised; repo is PUBLIC so Actions is free)
Staged + waiting: france--buildings (34040680013, stamped), spain (34041308538), germany, southkorea.
Re-dispatched on the USAS fix: massachusetts 34106885030 · california 34106888476 · texas 34106892241 ·
illinois 34106895725 · newyork 34106900276; gccstates 34101679682. **Cron d9cd65b0 DIED with the session.**
Next: when all six conclude success → `context-merge-publish.yml` `{"layer":"buildings","expect":"all","engine":"tile-join","publish":"true","allow_unknown_regions":"true","allow_region_removal":"sanfrancisco,chicago,austin,houston,boston,riyadh,jeddah,dubai,abudhabi"}`
(headroom measured 99 GB free — fits) → verify manifest `regions.france.heightJoin == "mnh_fr"` → probe Sète
`--at 43.39655,3.67554` → roads → parks → water → landuse → rail → trees, one at a time → bump
`CONTEXT_TILESET_VERSION` L663a→L664a → deploy. Whole-France heights need ~5 more `region=france stage=true`
bakes (sweep cursor resumes at 5320 — but successive runs do NOT accumulate, see mnhFrNationalStamp.mjs header).
Dispatch helper: `scratchpad/gh-dispatch.mjs` pattern = POST `/actions/workflows/<wf>/dispatches` with token from `git credential fill`.

## RED RATCHET TO FIX (not absorbable)
`check-contract-cited-paths.ts` RC=3 (507/490): 17 unresolved paths from C114/C59/C58/C111 edits — mark PLANNED files PLANNED.

## FOUNDER QUESTIONS PENDING (both options named in the lane rows)
L-13034 house-shell sizing · massing: opaque vs 0.55 · keep plate ladder? · card: lift the four figures to the headline? · envelope: may a drawing replace a fitted plate? clear the drawn ring on parcel redraw?

## NEXT-SESSION PROMPT (paste verbatim)
> Resume from docs/03-execution/plans/SESSION-HANDOVER-2026-09-07.md.
>
> **(1) Prove the live build.** `bash tools/deploy/fly-bundle-proof.sh 26396bb8` — if it does not pass, redeploy per DEPLOY-CONTRACT-MANUAL-FLY.md §6.9.11 (detached worktree `C:/pryzm-deploy/tree`, `FLY_API_TOKEN` from `~/.fly/pryzm_deploy_token`, `DOCKER_CONFIG=C:/pryzm-deploy/empty-docker-config`) and prove it again. Then `git status` and commit anything green with explicit paths (never bare, never stash).
>
> **(2) Re-arm the R2 rollout — this is the founder-visible one (Sète still renders ghosts).** The cron died with the last session. Read these six bake runs via the GitHub API (PAT from `git credential fill`): massachusetts 34106885030 · california 34106888476 · texas 34106892241 · illinois 34106895725 · newyork 34106900276 · gccstates 34101679682. For a failure, read the failed job's log and diagnose the FIRST real error (ignore `[36;1m` script echoes). When all six are green, dispatch `context-merge-publish.yml` with `{"layer":"buildings","expect":"all","engine":"tile-join","publish":"true","allow_unknown_regions":"true","allow_region_removal":"sanfrancisco,chicago,austin,houston,boston,riyadh,jeddah,dubai,abudhabi"}` (headroom measured 99 GB — it fits; the removal list is only legitimate in the run that carries the five successors + newyork). Then verify the manifest reads `regions.france.heightJoin == "mnh_fr"`, probe Sète with `node tools/context-height-probe/probe.mjs --at 43.39655,3.67554 --name sete`, publish roads → parks → water → landuse → rail → trees ONE AT A TIME, bump `CONTEXT_TILESET_VERSION` L663a→L664a, deploy, and tell me **"🚀 LIVE — test Sète heights"**. Whole-France coverage needs ~5 more `region=france stage=true` bakes; read `mnhFrNationalStamp.mjs`'s header first — successive runs do NOT accumulate today.
>
> **(3) Then dispatch these lanes** (architecturally sound, no shortcuts, scoped commits, read the gates never the docs): **ENVELOPE-DRAW C4–C8** — C4 first, because it is the commit that makes drawing REACHABLE (the founder's top priority; today he can extrude a ring but not draw one); **SCOPE-SLAB** — the per-pane slider, the globe clip + slab side, and F-8; **CARD** — rooms draw on the view (`room:<id>` subject + three cue arms, the `edge:<n>` shape) and the massing preview on the 2D/3D site views (L-13022, `targetFootprintAreaState` has zero importers in either viewport); **the cited-paths ratchet** — `check-contract-cited-paths.ts` is RC=3 at 507/490 and is NOT absorbable.
>
> **(4) Founder questions are queued in the rows** — put them to me before building past them.
