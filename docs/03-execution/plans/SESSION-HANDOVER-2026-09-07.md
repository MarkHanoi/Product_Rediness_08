# SESSION HANDOVER — 2026-09-07 (orchestrator close)

**LIVE:** `722403a1` proven (bundle proof 6/6). **DEPLOYING at close:** `19b0220c` (tree == `097fa597`,
root tsc RC=0 on the detached worktree) — if the next session finds `/version` ≠ `19b0220c`, run
`tools/deploy/fly-bundle-proof.sh 19b0220c`; if it fails, redeploy per `DEPLOY-CONTRACT-MANUAL-FLY.md`
(§6.9.11 has the exact recipe; token at `~/.fly/pryzm_deploy_token`, `DOCKER_CONFIG=C:/pryzm-deploy/empty-docker-config`).

## What 19b0220c carries (test these first)
- L-13053 single view = layout fact · L-13057 onboarding "Where is your project?" + cadastral ref (already live in 722403a1)
- L-13058 context extent: far tier 8,000 inst / 1,781 m, trees ×2, people ×2 — read `§CTX-PMTILES-READER`, `§FEAT-FORMA-CONTEXT-EXTENT-LOD`, `§STARTUP-GROUND-SAMPLE-COALESCE` (maxConcurrentFlights MUST be 1) on prod
- L-13037 massing SHAPES on the card (I/L/angled L/U before the plates) · L-13039 "Create it myself" + rooms per level · §26.6.3 pale solid massing
- L-13046 card rules 1–3: dedupe, every figure paints on all three views (incl. Bounding box and per-edge), "What can I build here?", ✕ removed, four named rows, SETBACK REGISTER, intent beside ceiling
- ENVELOPE-DRAW C1–C3: authored provenance on every created envelope; create REPLACES instead of accumulating
- §SITE-SCOPE phase 1: `SiteModel.scope` schema + command + pure clip (no slider yet)
- USAS seq-write fix (context-bake only)

## OPEN LANES CUT MID-FLIGHT (their disk work is uncommitted or absent)
- **SCOPE-SLAB phase 2** (slider + render wiring, F-1/F-2/F-8 fixes) — check `git status` for geospatial/* modifications; if present and green, commit them; else the SPEC §7.6 work list in `docs/03-execution/specs/SPEC-3D-SITE-PRODUCTION-CONTEXT.md` §7 is the plan.
- **ENVELOPE-DRAW C4–C8** — plan `docs/03-execution/plans/PLAN-ENVELOPE-DRAW-ON-SITE-VIEWS.md`; corrections: R5 wrong (port frame is PROJECT frame, adapters `enuToSceneXZ` at the edge); C8 already declared `fc32f235` (add `supersedes` to its reason); `pnpm --filter @pryzm/geometry-slab typecheck` is red at HEAD (use root tsc).

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
> Resume from docs/03-execution/plans/SESSION-HANDOVER-2026-09-07.md. (1) Prove the live build: `bash tools/deploy/fly-bundle-proof.sh 19b0220c`; redeploy per DEPLOY-CONTRACT-MANUAL-FLY.md if it fails. (2) `git status` — commit any green SCOPE-SLAB phase-2 work with explicit paths (never bare, never stash). (3) Re-arm the R2 rollout: read the six bake runs listed in the handover; when green, dispatch the buildings publish with the inputs in the handover, then the other six layers serially, then bump CONTEXT_TILESET_VERSION L663a→L664a and deploy — and tell me "🚀 LIVE — test Sète heights". (4) Dispatch lanes: ENVELOPE-DRAW C4–C8 (Draw button reachable first), SCOPE-SLAB phase 2 (slider + clip wiring), CARD rooms-draw-on-view + massing preview on 2D/3D site (L-13022), the cited-paths ratchet clean-up. Same rules: architecturally sound, no shortcuts, scoped commits, read the gates never the docs.
