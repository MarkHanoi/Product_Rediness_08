# SESSION HANDOVER — 2026-09-07 PM (supersedes the AM handover for anything they disagree on)

**LIVE AND PROVEN: `2c12b8d5`** — bundle proof 6/6 (`main-DSNbxnOF.js`). Five deploys this session, every one proven:
`722403a1` → `19b0220c` → `f5b0b42e` → `179e66a9` → **`2c12b8d5`**. Deploy recipe: `DEPLOY-CONTRACT-MANUAL-FLY.md`
§6.9.11/§6.9.12 — detached worktree `C:/pryzm-deploy/tree`, `FLY_API_TOKEN` from `~/.fly/pryzm_deploy_token`,
`DOCKER_CONFIG=C:/pryzm-deploy/empty-docker-config`, no MSYS exports, then `fly-bundle-proof.sh <sha>` ALWAYS.

## 1. WHAT THE FOUNDER CAN DO ON THE LIVE BUILD (all browser-tested by him this session)
- **Draw a buildable envelope perimeter on BOTH site views.** Confirmed live: `§ENVELOPE-DRAW finished on site-3d: 5 corners · 147.3 m² · mode=linear`, and later a 6-corner 304.2 m². Draw → close → panel reads it back → Create.
- **Place room envelopes in 3D** — 6 rooms / 77 m² inside `Proposed ground floor · 190 m²`, rendered: `§SPACE-ENVELOPE-IN-CESIUM drew 7/7 authored envelope(s)`.
- **The scope slider** — mounts, drags, reports honestly: *"trees: 10000 of 11391 inside the scope drawn — 1391 dropped by the cap; complete at a scope of ~1669 m"*.
- **Massing shapes** (I/L/U/angled), **create-it-myself**, **rooms per level**, the **setback register**, figures that **paint on the views**, the **doubled context extent**, single-view fix, onboarding panel.

## 2. ⛔ OPEN DEFECTS THE FOUNDER FOUND ON THE LIVE BUILD (each has a lane; none is closed)
| # | Defect | Evidence | Lane state at close |
|---|---|---|---|
| D1 | **The terrain is NOT cut by the scope.** Context layers clip; the beige hill-shaded terrain fills the viewport. And the globe leg logs NOTHING — a silent fallback indistinguishable from "not implemented". | His 2 screenshots; console has `§SITE-SCOPE clip` lines for every layer EXCEPT the globe/terrain/slab side | SCOPE-SLIDER was re-briefed (use `Globe.cartographicLimitRectangle` for the rect case; make the globe leg SAY what it did) — **work NOT committed** |
| D2 | **Scope max too small — he wants 4× the area (2× length), 2519 → ~5038 m.** ⚠ Collides with the measured 1781 m z16 ceiling: a coarser read DELETES footprints (`--drop-densest-as-needed`, L-579). Needs multi-bbox z16 stitching or a measured cap raise, NOT a bigger number | L-13058, L-13076 | same lane, NOT started |
| D3 | **Create-envelope refusal is a DEAD END.** *"You asked for 4 floor levels, but this project has 1 storey… Add the missing levels first"* with no way to add them. §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH (L-942) | his screenshot | ENVELOPE-FACE-DRAG brief includes it |
| D4 | **The envelope panel is too big** — covers the 3D pane he is drawing on | his words | ENVELOPE-DRAW-2 was stopped before doing it |
| D5 | **"BESIDE" renders as literal UI text**, and the 3-column row wraps badly in his narrow panel | `parcelLawIntentAgainstCeiling.ts:184` — `el('span', …, 'beside')` + `text-transform:uppercase` | CARD-POLISH running |
| D6 | **"Use this plate" navigates away from the massing options** — he cannot compare | his words; 4 plate draws in a row in his trace | CARD-POLISH running |
| D7 | **The panel CLAIMS "draggable by face" on the 3D Site — probably FALSE there.** Face-drag is bound to `world.renderer.three.domElement` (BIM canvas), not Cesium (L-13045) | his screenshot's own text | ENVELOPE-FACE-DRAG: **verdict is deliverable #0** |
| D8 | **Switching to 3D Globe resets the camera to whole-Earth.** `frameGlobe` → `setViewFraming('world')` detaches city terrain | his log's own call stack | GLOBE-KEEPS-THE-VIEW ended, work uncommitted |
| D9 | **Startup shows a 61-second loading page.** `activation:site:tiles-done +60977ms` | see §3 | STARTUP-61S ended, work uncommitted |
| D10 | **A diagnostic reports the terrain surface 6,328 km out** while buildings sit correctly — probe wrong or terrain wrong, unadjudicated | `centroidTerrainSurface=-6328484.2m`, `mean\|Δ\|=6328546.71m` | in STARTUP-61S's brief, unresolved |

## 3. ⭐ THE 61-SECOND STARTUP — CAUSE IS MEASURED, NOT GUESSED (from his own console)
- **parks drape 10,989 ms of which 10,978 ms WAITING in the terrain FIFO, 11 ms own work.** roads: 11,118 ms / 11,089 ms waiting / 29 ms work. ~22 s is two layers queuing.
- **The 2nd terrain flight re-downloads the 1st flight's tiles:** flight 1 = 18,789 pts / **5,213 ms** / **12 tiles at level 14**; flight 2 = 9,520 pts / **4,975 ms** / **the same 12 tiles** / *"0 served from cache"*. There is a POINT cache, evidently no TILE reuse across flights.
- ⛔ `max concurrent flights 1` **is CORRECT** ("two calls in the air re-download the same tiles"). The fix is ONE shared flight for all callers + tile reuse — **never raise concurrency**.
- Duplicate reads: `near+far from ONE baked-tile read` printed 3× identical; `parks 800 … 1173 ms` then `1172 ms`; buildings 15,775 footprints in **5,994 ms**.
- `1775 far candidate(s) dropped by that cap — they were already downloaded and decoded, so a drop here is pure waste` (the code's own words).
- **The 2D map arrives 46 s late** behind the 3D stream (`§UX1-DRAW-PHASE-GATE: no drawable surface after 45000 ms`).
- **The camera "flight" takes 7 ms** (`reveal:flight-settled +7ms`) — an instant teleport, then a minute of splash. The founder wants that inverted: a slow eased descent covering the stream, splash gone (but a stall/failure must still be reported — a hidden overlay must never become a hidden error).

## 4. LANES AT CLOSE
**Committed and LIVE:** context extent ×2 (`854cbdd7`+`11426e2a`), massing shapes + style + create-it-myself + rooms/level (`34238830`,`ce800197`,`d410d8d0`), card rules 1–3 + setback register (`27d3c93b`,`e2f29bc7`,`72b90d2e`+fix-forwards), envelope draw C1–C6+C8 (`e501ff42`,`c48bd049`,`4a7b1df9`,`bea53747`,`f302f256`,`e0e7c6c8`,`bce1d42c`), rooms+massing paint on views (`1fa54287`), site-scope phase 1+2 (`d602e1bf`,`c76fef51`,`1f2547c9`,`9784a3e8`,`bd76a346`,`0f4bfc8d`,`4e5793a8`,`26396bb8`), cited-paths ratchet green (`d6713967`), USAS seq-write fix (`ca9de0aa`→`591eed5b`).
**ENDED WITH WORK UNCOMMITTED IN THE TREE** (see `git status`): STARTUP-61S (`terrainTileMemo.ts`+spec, `contextLayerWarm.ts`, `globeGroundAnchor.ts`, `contextWarmExtentAgreement.spec.ts`), STARTUP-DESCENT (`quietActivationLine.ts`, `viewActivationLoading.ts`, `OnboardingStepController.ts`, `siteEntryModel/Store.ts`), GLOBE-KEEPS-THE-VIEW (`globeKeepsTheView.spec.ts`), SCOPE-SLIDER (`siteScopeGlobeCutHonesty.spec.ts`). **Assess with root tsc + the suites, then commit what is green with explicit paths — do NOT bulk-commit blind.**
**RUNNING AT CLOSE (their reports were not received):** CARD-POLISH (D5/D6 + editable rooms), ENVELOPE-FACE-DRAG (D7 verdict, face-drag on site views, per-level envelopes, D3), BIM-FROM-THE-DESIGN (Create BIM from the authored design + the wall-follows-envelope cascade), BIM-PANE-CHROME (two dropdowns on PRYZM 3D, map only).

## 5. R2 — FIVE OF SIX BAKES GREEN, ONE STILL RUNNING
✅ massachusetts `34106885030` (**365,729 measured**, Boston gate 4,044 — the USAS fix PROVEN on the run that failed) · ✅ texas `34106892241` · ✅ illinois `34106895725` · ✅ newyork `34106900276` · ✅ gccstates `34101679682` · ⏳ **california `34106888476` still running at ~141 min** (predicted 72, ceiling 330; 1.33 GB extract).
Staged and waiting: **france--buildings `34040680013` (STAMPED — this is what turns Sète's ghosts solid)**, spain `34041308538`, germany, southkorea. Headroom measured: **99 GB free, the buildings publish fits.**
⛔ **The watcher script and the cron BOTH die with the session.** Next session must re-check california by hand.
**Then:** `context-merge-publish.yml` with `{"layer":"buildings","expect":"all","engine":"tile-join","publish":"true","allow_unknown_regions":"true","allow_region_removal":"sanfrancisco,chicago,austin,houston,boston,riyadh,jeddah,dubai,abudhabi"}` (the removal list is legitimate ONLY in the run carrying the five successors + newyork) → verify `regions.france.heightJoin == "mnh_fr"` → probe Sète `--at 43.39655,3.67554` → publish roads → parks → water → landuse → rail → trees ONE AT A TIME → bump `CONTEXT_TILESET_VERSION` L663a→L664a → deploy.

## 6. FOUNDER QUESTIONS OUTSTANDING
Massing opaque vs 0.55 with rooms visible · keep the plate ladder after the shapes? · lift the four named figures to the card headline? · may a drawing replace a PRYZM-fitted plate (today: refused, reversibly)? · clear the drawn ring on parcel redraw (today: no)? · L-13034 house-shell sizing.

## 7. NEXT-SESSION PROMPT (paste verbatim)
> Resume from docs/03-execution/plans/SESSION-HANDOVER-2026-09-07-PM.md. Read §2 (the ten open defects the founder found on the live build) and §3 (the measured 61-second startup cause) first.
>
> **(1) Prove the live build:** `bash tools/deploy/fly-bundle-proof.sh 2c12b8d5`. Then `git status` — four lanes ended with uncommitted work (§4). Run root tsc (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --skipLibCheck`) and the geospatial/engine suites, and commit what is green with EXPLICIT paths. Never bare, never `-A`, never stash, never a private index (§PRIVATE-INDEX-RACE, L-13064).
>
> **(2) R2 — the founder-visible one (Sète still renders ghosts):** re-check california `34106888476`; when green, dispatch the buildings publish with the exact inputs in §5, then the other six layers serially, bump CONTEXT_TILESET_VERSION L663a→L664a, deploy, and tell me **"🚀 LIVE — test Sète heights"**.
>
> **(3) Then, in the founder's priority order:** D1+D2 the scope cut (the terrain is not being cut, and the globe leg must SAY what it did — silence is the defect) · D7 the face-drag claim verdict, then face-drag on the site views + per-level envelopes + D3's escape hatch · Create BIM from the authored design, with the envelope→wall link RECORDED so walls can follow (check `DependencyResolver`, Phase F cascade rebuilds, before building anything) · D5+D6 the card · D9 the 61-second startup and the slow descent · D8 globe camera continuity · D4 the panel size · D10 adjudicate the 6,328 km probe.
>
> Standing rules: architecturally sound, no shortcuts, read the gates never the docs, verify in the FOREGROUND, commit each green step, deploy per DEPLOY-CONTRACT-MANUAL-FLY.md and ALWAYS run the bundle proof.

---

# ADDENDUM — the last three lane reports (received at close; the most valuable pages here)

## A. D7 ANSWERED: the panel promised a gesture the surface does not have — FIXED (`e205982a`)
The sentence *"They are draggable by face and their profiles are editable on double-click"* (`roomProgrammePanel.ts:891`) was **FALSE on the 3D Site, and BOTH halves were.** `initTools.ts:2101-2105` hands `world.renderer.three.domElement` (the THREE/WebGPU BIM canvas) to `attachSpaceEnvelopeRender`, and `installSpaceEnvelopeFaceDragOnSurface` (`spaceEnvelopeDragSurface.ts:~490`) registers pointerdown/move/up/cancel/leave **and the dblclick** on that ONE element. The site views draw the same records from the same store with no drag surface installed: **drawn, not editable.** Fixed by NARROWING the claim to name the view where the gesture lives — widen it again in the same commit that lands an adapter.

**THREE CORRECTIONS TO L-13045, ALL CHEAPENING THE WORK:**
1. The extraction is at `apps/editor/src/engine/spaceEnvelopeDragSurface.ts` (538) + `...Three.ts` (167) + `...FaceDragController.ts` (94) — **NOT** `ui/site/`.
2. **Per-face pick GEOMETRY IS NOT NEEDED, and it was L-13045's dominant cost line.** A PURE ray-prism intersection answers both `rayInSceneFrame` and `pickFace` from one conversion, needs ZERO change to `renderSpaceEnvelopes`, mints no entities. That solver does NOT exist in `@pryzm/geometry-space-envelope` (every export checked) — it is the one genuinely new piece, it is pure, and it is fully headlessly testable.
3. The ray conversion needs no approximation: invert the SAME `eastNorthUpToFixedFrame` matrix the renderer builds (`:7955`) with `multiplyByPoint` / `multiplyByPointAsVector`, then `enuToSceneXZ` — verified a PURE rotation (`sceneEnuFrame.ts:137-142`), so valid on directions. Scene-Y = `enuUp - formaTerrainBaseHeight`.

**Do NOT build a second Cesium adapter** — `siteEnvelopeDrawCesium.ts` exists and the port header names that duplication as the EI-9 hazard. **Next step:** build `pickSpaceEnvelopeFace(prism, rayOrigin, rayDir)` in `packages/geometry-space-envelope` with headless tests (grazing ray, parallel ray, hit-behind-origin returns null, nearest of two prisms), THEN extend `siteEnvelopeDrawCesium.ts` into a shared surface exposing the four drag ports.

## B. PER-LEVEL ENVELOPES: a UI gap, definitively NOT a schema gap
`SpaceEnvelope.ts:174` carries `levelId`; `:62` has `role:'level'`; `:200-218` per-record geometry; `envelopeAuthoringPlan.ts:436-469` **already emits one record per storey** with its own levelId and resolved height; per-storey supersession + `payload.supersedes` + one-undo are live.

**The gap is ONE control:** `parcelLawEnvelopeAuthoring.ts:660` is a bare number input with **no storey selector**, and `envelopeAuthoringPlan.ts:366` silently takes `seatable.slice(0, asked)` — always the lowest N, unchooseable. `:431`/`:452` build the ring ONCE and assign the SAME object to every storey, so storeys can only diverge AFTER creation. `AuthoredStoreyRow` (`:168-174`) already computes elevation/height/heightSource and its own doc says it exists so a surface can list them before the click — only `.length` is read (`:886`).

**D3's escape hatch: path confirmed ready** — `level.add` (`commands.ts:975`, `initBusHandlers.ts:2360-2372`), loop precedent `HouseLayoutExecutor.ts:411-431`. WARNING: `AddLevelCommand.execute()` is sync while the bus is async, so re-reading `bimManager.getLevels()` in the same beat reads STALE (`C02:257-274`).

## C. CREATE BIM: the code ALREADY ADMITS the defect, and no producer exists
`readLevelEnvelopes` (`createHousePlan.ts:300`, filter `:314` — `if (r.role !== 'level') continue`) **drops every room envelope before the planner sees one**, and the success arm's own advisory (`:263-266`) says so in production today: *"The room envelopes you have drawn are NOT used as the room programme."* The click runs `generateHouseFromBoundary` (`houseFromBoundary.ts:130`) which draws a NEW shell and opens the generator (`houseModalHtml.ts:588`).

**Measured: NO build-from-authored-envelopes producer exists anywhere, wired or unwired** (0 modules read `role:'room'` and dispatch wall/slab create). **It must be built.**

**The design, ready to land verbatim** — a FOURTH arm ahead of the `ok` arm (`data-arm="build-from-design"`), with C80 `already-built` (`createHousePlan.ts:233-241`) staying FIRST and unconditional, and the generator staying exactly as it is for a project with no room envelopes. From his 7 envelopes it produces: 1 storey, shell walls on the level-envelope edges, partitions on room-envelope boundaries (drop edges collinear with a shell edge; dedupe a shared boundary to ONE wall via an undirected mm-quantised key, giving ~12-18 not 24+), 1 floor slab. No roof/stairs/doors/windows — printed in `willNotCreate`. A room that cannot be materialised is refused BY NAME with its numbers and the rest still build. WARNING: an edge under 0.05 m makes `CreateWallBatch.ts:152-162` throw and kills the WHOLE batch, so it must be caught in the planner.

## D. THE WALL-FOLLOWS-ENVELOPE CASCADE — the link CANNOT live on the wall
`packages/schemas/src/elements/Wall.ts` has **no** `derivedFrom`/`sourceElementId`/free-form bag. `provenance` is `{origin, detail?}` with no element id and **is not serialised for walls at all** (`serializeWall`, `ProjectSerializer.ts:830-905`). `metadata` (`:903`) and engine `properties` (`:901`) ARE serialised and are **NEVER restored** (`ProjectLoader.ts:1092-1148`). **Every on-wall route dies on reload.**

**The persistable route is the SEMANTIC GRAPH** (`ProjectSerializer.ts:1868` / `ProjectLoader.ts:2575`, which has an explicit UNREADABLE refusal and a per-row drop report), using EXISTING members `boundedBy` + `contains`. `RelationshipType` (`SemanticGraph.ts:44-209`, 29 members) has **no `derivedFrom`** and must not gain one without C67/C68. Do NOT use `derivesFrom` from `packages/building-graph` — that graph is a DERIVED, non-persisted projection, pinned as such by `ubgSnapshotIsDerivedNotAuthored.test.ts`.

**`DependencyResolver` is live but far narrower than its log line:** it routes **2 of 29** relation types (`initDependencyCascade.ts:59` filters to `sitsOn|supports`) and performs **MESH rebuilds, not store writes** — it **cannot move a wall's `baseLine` today**. `getAffected()` has 0 production callers; `setRebuildDispatcher` has 0 repo-wide.

**Hook needed from the face-drag side:** after `spaceEnvelope.moveFace` commits, emit `{ spaceEnvelopeId, face, deltaM, ringBefore, ringAfter }`. `ringBefore`/`ringAfter` are load-bearing — `moveFace`'s payload is `{face, deltaM}` **relative to the current solid**, so a consequence handler seeing only the delta cannot compute where the wall should land.

**Rule to ratify with the founder:** the hand-edit WINS and the link reports itself BROKEN with both numbers (*"3 of 8 perimeter walls were edited after they were built (WA-XX-003 is now 4.904 m, the face is 5.200 m) — they did not follow"*). Silently snapping an authored wall back is C80's defect in a new place. `wall.batch.delete` is measured ABSENT, so a cascade that removes walls costs N undo entries — say so before the drag.

**`spaceEnvelope.moveFace` is NOT-SYNCED** (`syncDisposition.ts:995` — *"RELATIVE: payload is {face, deltaM} ... Replaying it on a diverged base moves a different face by a different amount"*). Four of seven `spaceEnvelope.*` verbs are not-synced. **A cascade that moves real BIM walls off an unsynced verb means collaborator B's walls do not move.** Log it before the cascade ships.

## E. THE PRYZM 3D "TWO DROPDOWNS" ASK IS DEFERRED ARCHITECTURE, NOT A CHROME TIDY — and ONE STRIKE MUST BE PUSHED BACK
**The 3D + plan split has NO pane-element pair and NO `PaneLayoutStore`.** Left is `#container` (the WHOLE viewport); right is `#svp-secondary-pane`, `document.body.appendChild` (`SplitViewManager.ts:567`). The only `PaneLayoutStore` in the repo is `SiteAuthoringPaneShell.ts:410`. **The registry already refuses this by name** — `paneViewModel.ts:142-149`: *"The PRYZM 3D renderer still owns the whole viewport (#container) and cannot be re-targeted into a pane yet — that is C59 Phase 3."*

| His strike | Verdict |
|---|---|
| segmented `[3D + plan][3D globe][3D Site]` (`GISAreaLayout.ts:1677`, centred on `#container` at z30 — the L-13027 defect class) | **SAFE TO REMOVE** — the picker renders the same six from `viewPanelOptions()`; teardown already declared: `window.pryzmHideSiteResultToggle` (`:1904`). It also forces `#container`'s `position:relative` (`:1683-1685`) — a surviving owner must assert that or the left picker anchors wrong. |
| `[Ground]` level chip (`SplitViewManager.ts:466-501`) | **RELOCATE, DON'T DELETE** — `ActiveLevelHUD` in the top bar writes the SAME `projectContext.activeLevelId`. Residual: the chip ALSO calls `_setCameraElevation` (`:486`) and the HUD does not — probe whether `LevelPlanViewBinder` carries that leg first. |
| `Ground Fl...` view-definition select (`SplitViewManager.ts:454-462`) | **MUST BE KEPT — this is the pushback.** It is not a level chip: it is the **only** way to open a SECTION or ELEVATION, and the picker's own refusal text points AT it (`paneViewModel.ts:164-178`). Deleting it makes sections and elevations unreachable and turns two registry refusals into lies. Make it quieter, never remove it. |
| `BUILDING TYPE` / `Do it myself` (`OnboardingStepController.ts:2427/2494`) | **NO other typology chooser exists** (`offerableTypologies`/`setTypology` have zero other callers; `TypologyPickerPanel.ts` has ZERO importers). It is a STEP of a flow, not chrome — **dismiss it on split entry, do not delete it**, and verify the toast's promised "generate any time from the AI panel" route actually exists. |

`shellFloatBudget.spec.ts:317-320` pins BOTH `.svp-view-select` and `.svp-level-select` and **fails closed** — move those arms, never weaken them.

## F. WHAT LANDED AT THE VERY END
- `e205982a` — the face-drag claim narrowed to the truth (D7).
- `7d4dea4c` — four lanes' in-flight work (startup tile memo + warm-extent agreement, the quiet activation line, the globe-keeps-view spec, the scope globe-cut honesty spec). Root tsc RC=0. **ONE RED, NOT TUNED:** `contextWarmExtentAgreement.spec.ts` — *expected 0.01599892202659001 to be close to 0.016*, difference 1.078e-6 against a 5e-7 tolerance (~0.1 m on the ground). That is the lane's OWN new spec and its OWN tolerance. **Decide whether 1e-6 degrees is a real warm-vs-render divergence or float noise, and set the tolerance from that judgement — do not loosen it to get green.**
- STILL UNCOMMITTED at close: CARD-POLISH's `parcelLawIntentAgainstCeiling.ts` + spec (that lane was still running).
