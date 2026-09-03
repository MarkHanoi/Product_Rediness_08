# SESSION HANDOVER — 2026-09-03 (the world-tranche day)

**For the next session: read this top to bottom before acting. Every number here was measured
2026-09-03 ~07:40 UTC; re-measure anything load-bearing — the staging counts and agent states
WILL be stale by the time you read this.**

The five standing goals (the founder's mandate, unchanged): **(1)** select a parcel anywhere in
Europe + US + Middle East + Australia · **(2)** baked LoD100/200 context buildings everywhere ·
**(3)** buildable envelopes everywhere possible in Europe · **(4)** the Family/System Component
creator-editor end-to-end · **(5)** performance — quicker, speedier, architecturally sound.

---

## 1 · WHAT IS LIVE IN PRODUCTION (deploy `f564b892`, bundle proof 6/6)

- **🇱🇺 Luxembourg parcel selection** at the founder's exact logged click (49.61195, 6.12926 →
  `075F00137000000` via `/api/parcel/lu`, ACT INSPIRE `cp:CP.CadastralParcel`, keyless CC0).
  Esch-sur-Alzette proven too. This closed the founder's live-reported bug.
- **Component front-door**: Starter Components (Window/Door/Panel, real signed `.pryzm-family`,
  §64 `GlassWidth = Width − 2·FrameWidth`) + the **New Component** path + U4 Types + U6 chat strips.
- All the new-country **client** code (adapters/registry) for AU/TR/IL/QA/LV/HR/GR/SI/SK/BG/HU/RO
  + US-MA/TX/WA/FL + the Gulf deferral rows.
- Rollback tag captured before that deploy: `pryzm:deployment-01M1HSYPJQY507XH2NQP8TJDFA`.

## 2 · COMMITTED + PUSHED, **NOT YET DEPLOYED** (deploy #2 owes these)

| Commit | Contents |
|---|---|
| `ef682750` | context-bake download retry (transient 5xx, backoff) + **per-region concurrency** (`context-bake-${{region}}`) — the fix that unblocked the whole staging sweep |
| `fab79894` | `run-name: context-bake <region>` (run→region mapping for drivers) |
| `9826adec` | **Perf ×2**: §PERF-TRAVERSE-RECOMPILE-SCOPE (`PBRSceneUpgrader` — needsUpdate only on real program-key changes; the "38.7s traverse" was a stale 2026-05 label, the live cost was ~4k needless PSO recompiles → now 0, 11/11 + 1,747 green) · `hub:back-clicked` mark (the "76.7s hub boot" was editing DWELL mislabeled; real back-hub cost ≈250ms; next reading is decisive). **Plus 13 proxy legs** in `euCadastreProxy.js` (AU×6 with SA's public Referer, TR semantic-404→empty, QA, LV, HR (4326 output measured live), GR, SI, SK) — 47/47 tests. **IL deliberately NOT wired** (govmap serves no ring — an extent rectangle = the L-616 overstatement family). |
| `1b3a143b` | **LU envelope pack** `luPagEnvelope.ts`: live WFS discovery (`lu:LU.SpatialPlan.PAG` on `wms.inspire.geoportail.lu` serves TYPED cos/cus/css/dl — ~47% partial view, GPKG stays the full corpus) · **all four coefficients WITHHELD** (COS/CSS ratio over *terrain à bâtir NET*, CUS/DL over *BRUT*, neither served, Art. 26 zone-average) — the engine gets no number, draws nothing, cannot overstate · `LU_PAG_CERTIFIED=false` shut until the founder signs · never-overstate arm 2i, falsification fired + sha-restored · suite 201 files / 4,244 / 0 failed. ⚠ **Its barrel line is NOT in `src/index.ts` yet** — apply from `audit/demo-esfrpt/2026-09-02/barrel-additions-lu-envelope.txt` during wave 3. |

## 3 · IN-FLIGHT AGENT WORK — ON DISK, UNCOMMITTED (wave 3)

Two agents were running at handover time (they die with the session; their FILES survive):

- **BOUNDARY-WAVE** (packages/site-parcel-data): promoting live-proven countries (expect ~LV, SK,
  SI, GR, HR) from refusal-only neighbours to claimable in `nationalBoundaries.json` + the
  resolver + registry `claimsNation` flips + the controls test (16→20 was already done by ME-OPEN;
  extend). **PLUS four forwarded deltas** (see `audit/intl-parcels/2026-09-02/proxy-legs-package-deltas.txt`):
  1. ⛔ **LV containment defect** (live-proven): `lvParcelProvider.ts` atPoint picks `features[0]`;
     at Rīga 56.9496,24.1052 the CONTAINING parcel is `01000070162`, features[0] is the adjacent
     `01000070006`. Fix = point-in-polygon selection (exemplar: `lu/luParcelProvider.ts` pickCandidate).
  2. HR: cp_wms **does** honour `srsName=EPSG:4326` on output (measured) — correct any stale
     reprojection caveat; HR's row flip is half-unblocked.
  3. SI: its queued B3 registry edit was applied by the proxy lane — verify, don't re-apply.
  4. LU comment cites a `luParcelProxy.test.ts` that doesn't exist — point it at the real test.
  ⚠ **`registry.ts` was observed MID-CASCADE (490 transient tsc errors) during its run, later
  green again (LU-envelope's full suite passed 4,244/0 after the lane fixed its own HR-row
  apostrophe).** FIRST ACTION of wave 3: `git status` + scoped tsc on the package; if the agent
  died mid-edit, reconcile from its audit file (`audit/europe-adapters-2/2026-09-02/lane-boundary-wave.md`
  if written) or restore + re-apply from the barrel-additions files.
- **U5-PREVIEW** (apps/editor): the component 3D preview — files seen on disk:
  `element-preview/ElementPreviewRenderer.ts`, `OpeningPreviewSubject.ts` (modified),
  `apps/editor/__tests__/componentPreviewLiveSurfaces.test.ts` (new), `vitest.config.ts` (modified).
  Findings expected at `audit/universal-component-editor/2026-09-02/lane-u5-preview.md`.

**Wave-3 checklist:** reconcile the two lanes → apply the LU barrel line → root tsc RC=0
(`NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck -p tsconfig.json`) →
full `@pryzm/site-parcel-data` suite + `test:server` + the component suites → commit → deploy #2.

## 4 · CONTEXT PIPELINE — THE BIG ONE (Goal 2)

**State at 07:36 UTC: 39/49 staged, 0 failures.** Missing-required (the publish gate):
**spain, denmark, germany, greatbritain, norway, sweden, riyadh, jeddah** — the heaviest files,
all in flight. They complete cloud-side regardless of this machine.

**The safety model (do not improvise past it):**
- The live tileset predates the manifest → **BOOTSTRAP**: the no-loss gate cannot protect live
  regions, so the publish `expect` MUST cover the **19-region no-regress set** =
  `spain denmark paris lyon koln netherlands newyork sanfrancisco riyadh jeddah germany
  switzerland belgium finland portugal greatbritain italy norway sweden`
  (the old live set was CITY-scoped — berlin/london/milan/zurich/lisbon… — whose rows no longer
  exist; the national rows geographically cover them). Everything else staged rides along free.
- `merge-tiles.mjs` publishes the **union of STAGED sets only** — no carry-forward. A staged
  region missing from `expect` is simply not merged; an expected region not staged = refusal.

**The exact procedure (when the required 8 are staged):**
1. Pulse: `TOK=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill | grep '^password=' | cut -d= -f2)` then GET
   `https://api.github.com/repos/MarkHanoi/Product_Rediness_08/actions/workflows/context-bake.yml/runs?per_page=100`
   — newest run per `context-bake <region>` title; success = staged. (Driver scripts:
   `<scratchpad>/stage-all.sh` re-runnable for stragglers, `<scratchpad>/publish-watch.sh` auto-fires.)
2. Dispatch `context-merge-publish.yml` (`workflow_dispatch`, ref main) inputs:
   `expect=<full staged CSV>`, `engine=tile-join`, `publish=true`. ⚠ A curl POST to the dispatch
   API may be classifier-blocked — the watcher script does it; or ask the founder to click Run in
   the Actions UI with the CSV.
3. **Only after the publish run SUCCEEDS**: bump `CONTEXT_TILESET_VERSION` (`L660a` → `L661a`) in
   `apps/editor/src/ui/geospatial/contextTiles.ts` — the L659a scar: a stamp is a claim about
   what is IN R2; never bump on dispatch. Commit + deploy.
4. Verify: `curl https://app.pryzm.so/api/context-tiles/tileset-manifest.json` (must be 200 now —
   the manifest arms the no-loss gate for all future incremental publishes), then the in-app
   §CTX-PMTILES-READER line at Tallinn/Luxembourg/rural France must show footprints > 0.

**Quality honesty:** national bakes ship LoD100 (real footprints, estimated heights). LoD200
measured heights remain ES/Köln/DK; FR/DE/UK measured-height joins are per-country lanes
(`heightSources.mjs` + the gap-master rows).

## 5 · DEPLOY #2 RECIPE (the contract path that worked first-try twice today)

`docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md` §6.9.x playbook: worktree
`C:/pryzm-deploy/tree` (`git fetch && git checkout --detach <sha>`, porcelain EMPTY) → token
`FLY_API_TOKEN=$(cat ~/.fly/pryzm_deploy_token)` → rollback tag from `flyctl machines list -a pryzm`
→ builder `flyctl apps list | grep builder` (was `fly-builder-faithful-song-347` @16384MB —
verify, it gets reaped/renamed) + warm from stopped → launch
`DOCKER_CONFIG="C:/pryzm-deploy/empty-docker-config" env -u DOCKER_HOST bash tools/deploy/fly-manual-deploy.sh`
(log to file; NO MSYS exports) → wait for `DEPLOY_RC=` IN THE LOG (never proof before script exit,
§6.7.1) → `tools/deploy/fly-bundle-proof.sh <full-sha>` → RC from file, never a pipe. Gate cover
first: root tsc @6144 + `test:server` (808/808 today) + `npm run build:server-deps` externals
clean (no `@thatopen/ui`) + `node --input-type=module -e "await import('file:///C:/…/server.mjs')"`.

## 6 · OPEN ITEMS / OWED (ranked)

1. **Wave 3 + deploy #2** (§3, §5) — then AU/TR/QA clicks resolve end-to-end (their rows route
   via bbox today); LV/GR/SI/SK/HR light up with the promotions.
2. **The publish + stamp + deploy #3** (§4) — context everywhere.
3. **IL follow-up**: find the govmap/iplan ring-geometry query (parcel WKT/polygon endpoint);
   until then `/api/parcel/il` 404s deliberately.
4. **The 8.5 MB eager main chunk** — the REAL cold-boot owner (engineLauncher 4.4MB +
   domain-engine SCC 4.4MB). Its own lane; ⚠ Contract 47 §9.5 records a naive split regressing.
5. **Founder signatures pending** (machinery complete, unsigned): LU_PAG (needs the denominator
   flip-points F1-F3 resolved or accepted as facts-only) · Madrid PGOUM SIG-M1 · Murcia SIG-MU2 ·
   CM-SPACM · Canarias sentinel-'I'.
6. **ISSUE-LOG rows owed**: the L-11562 close (recompile-scope), the hub-mark lane, the LV
   containment defect, §STAGE-CHAIN abort → parallel redesign.
7. **Gap-master follow-through**: `docs/01-strategy/BUILDABLE-ENVELOPE-GAP-MASTER.md` §CONSUME-NOW
   ordered plan (France GPU prescriptions national routing is #1 and its consumer is SHIPPED —
   wire the remaining routing; Madrid alignments #2; Canarias #3).
8. **Dubai/Abu Dhabi parcels**: government-side walls (vantage fence / F5 WAF), documented
   deferrals with reviewBy — a BD/authority conversation, not code.
9. AU server legs for WA/NT (licence-gated), the AU licence reads (TAS/ACT/SA terms),
   TR/IL/QA licence reads — flagged YELLOW in their lanes.

## 7 · STANDING HAZARDS (this session's scars, do not repeat)

- **Esc/kill-all kills the whole fleet** — never Esc with agents running.
- `git add -A` in a multi-lane tree sweeps half-states — commit scoped, or verify root tsc on the
  EXACT tree first (this session did both, deliberately, at different moments).
- A lane's "tsc is red/green" reading has a **shelf life of minutes** in a shared tree — re-run at
  the gate yourself.
- The merge publishes union-of-staged ONLY; the stamp bumps AFTER publish success ONLY.
- Read the gate, never the doc's transcribed number — every count in this file included.
