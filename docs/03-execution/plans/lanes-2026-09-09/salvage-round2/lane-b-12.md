{
  "defectId": "do-it-myself-creates-upper-level-walls",
  "rootCauseFound": false,
  "rootCause": "PARTIAL — one half is settled, the other is UNKNOWN.\n\nSETTLED (high confidence): the \"Do it myself\" control does NOT create anything. It is the §UX-COMPACT-TYPE-PILL exit at `apps/editor/src/ui/onboarding/OnboardingStepController.ts:2684-2696` (the BUILDING TYPE ▾ + \"Do it myself\" row, `data-testid=\"onboarding-confirm-notnow\"`). Its click handler logs, toasts, and calls `landInCanvasWithUnderlay()` (:2182), which is `await enterCanvasWithSitePlanUnderlay(); this.dispose();`. That function (`apps/editor/src/ui/site/overlay/enterCanvasWithSitePlan.ts:98-189`) does exactly five things: `setAppPhase('canvas')`, `pryzmCloseBoundaryMap2D()`, `pryzmActivateBimView('3D')`, `splitViewManager.activate()`, `viewController.zoomToFit()`. There is not one `bus.executeCommand` on the path. The two sibling exits (\"Not now — I'll design it myself\", :3201 residential and :3769 office) call the same handler. The `[linework-probe]` line the founder pasted is a CONSEQUENCE of the click, not evidence of it: the probe subscribes to `view-activated {mode:'3D'}` (`lineworkProbe.ts:414-418`) and step 2 of the landing IS that activation. So the click made an already-populated BIM scene visible; it did not populate it.\n\nSETTLED (high confidence) — the crux question (c): the 6 `WallEdges` LineSegments are NOT the envelope's own edges. `userData.elementType = 'WallEdges'` is stamped in exactly one place in the repo, `buildWallEdgeOverlay` (`packages/geometry-wall/src/WallEdgeOverlayBuilder.ts:143-149`), and every caller of that function is inside `WallFragmentBuilder`, always keyed on `wall.id` (13 sites: :1830, :1835, :2203, :2530, :2659, :2706, :3115, :3120, :3903, plus the `attachWallEdgeOverlay` wrapper at :228). The envelope's scene objects stamp `elementType: 'spaceEnvelope'` on the group (`SpaceEnvelopeMeshBuilder.ts:200`) and `'SpaceEnvelopeFace'` on each face mesh (:225), and that builder creates NO line object at all — it is prism faces plus a sprite label. Grep of `plugins/space-envelope/src` and `packages/geometry-space-envelope/src` for `WallEdges` returns zero, and grep of `packages/scene-committer/src`, `plugins/wall/src`, `packages/geometry-wall/src` for `spaceEnvelope` returns one unrelated comment. So REAL WALL ELEMENTS exist in that scene. (Count caveat: a layered wall emits one overlay per layer, `WallFragmentBuilder.ts:2203`, a plain wall one, `:2706` — so 6 LineSegments is an upper bound of 6 walls, not a proof of 6.)\n\nUNKNOWN: which gesture created those walls. I could not establish it from static reading, and the paraphrased console cannot separate the candidates. Everything that can put walls on upper storeys in this subsystem is explicitly click- or chat-driven; nothing auto-fires on the landing.",
  "evidence": [
    {
      "file": "apps/editor/src/ui/onboarding/OnboardingStepController.ts",
      "line": 2688,
      "quote": "notNow.textContent = 'Do it myself';\n        notNow.addEventListener('click', () => {\n            console.log('[onboarding-step] type pill → DO IT MYSELF — landing in the PRYZM canvas, no generate.');\n            this.toast('Your plot + buildable envelope are in the canvas — design away, or generate any time from the AI panel.', 'info');\n            void this.landInCanvasWithUnderlay();\n        });",
      "why": "(a)+(b). This is the BUILDING TYPE row's exit. The ENTIRE handler is three statements: a log, a toast, and the landing. No command, no store write, no element."
    },
    {
      "file": "apps/editor/src/ui/onboarding/OnboardingStepController.ts",
      "line": 2182,
      "quote": "private async landInCanvasWithUnderlay(): Promise<void> {\n        await enterCanvasWithSitePlanUnderlay();\n        // Dispose the wizard — we're done; the user is in the canvas.\n        this.dispose();\n    }",
      "why": "The whole body of what the click dispatches. Two statements."
    },
    {
      "file": "apps/editor/src/ui/site/overlay/enterCanvasWithSitePlan.ts",
      "line": 104,
      "quote": "export function enterCanvasWithSitePlanUnderlay(): Promise<void> {\n    setAppPhase('canvas');\n    if (inFlight) return inFlight;\n    inFlight = runLanding().finally(() => { inFlight = null; });\n    return inFlight;\n}",
      "why": "`runLanding()` (:110-189) does: markStartupPhase, pryzmCloseBoundaryMap2D(), pryzmActivateBimView('3D'), splitViewManager.activate(), viewController.zoomToFit(). Zero bus.executeCommand in the file. The button creates nothing."
    },
    {
      "file": "packages/geometry-wall/src/WallEdgeOverlayBuilder.ts",
      "line": 143,
      "quote": "edgesLine.userData = {\n        id: wallId,\n        parentId: wallId,\n        elementType: 'WallEdges',\n        role: 'edges',\n        selectable: false,\n    };",
      "why": "(c) THE CRUX. The ONLY place `WallEdges` is stamped. Its argument is `wallId`. Every caller is in WallFragmentBuilder, always passing `wall.id`. Therefore 6 WallEdges ⇒ real wall elements, NOT envelope edges."
    },
    {
      "file": "apps/editor/src/engine/SpaceEnvelopeMeshBuilder.ts",
      "line": 200,
      "quote": "group.userData['elementType'] = 'spaceEnvelope';",
      "why": "(c) the rival, killed. The envelope group is 'spaceEnvelope'; its children are 'SpaceEnvelopeFace' with role 'geometry' (:225-226). The builder creates Mesh faces and a sprite label — no THREE.LineSegments anywhere in its 489 lines. The founder is not looking at envelope linework."
    },
    {
      "file": "apps/editor/src/engine/lineworkProbe.ts",
      "line": 334,
      "quote": "const visibleSigs = Object.entries(census.histogram)\n        .filter(([sig]) => sig.endsWith('VISIBLE'))",
      "why": "The probe prints ONLY effectively-visible classes, and it fires on `view-activated {mode:'3D'}` (:414-418). So (i) the founder's probe line IS the 'Do it myself' landing's own 3D activation, and (ii) those 6 wall-edge overlays were VISIBLE — worth knowing, because he may be seeing edge LINEWORK, not wall solids. Benign explanation: the landing opens the plan+3D split and `WallEdgeVisibilityService.setVisible(isPlanMode)` governs one shared scene."
    },
    {
      "file": "apps/editor/src/ui/site/buildFromDesignPlan.ts",
      "line": 860,
      "quote": "for (const s of built) {\n            s.shellStart = walls.length;\n            for (let i = 0; i < s.ring.length; i++) {\n                ...\n                walls.push({\n                    kind: 'shell',\n                    ...\n                    levelId: s.levelId,",
      "why": "(d) THE STOREY-SET DECIDER. `built` comes from `for (const plate of sortedLevels)` at :748, where `sortedLevels` is every `role:'level'` envelope (:650). One shell ring per level envelope — six level envelopes ⇒ shells on all six storeys. This is §BUILD-EVERY-STOREY, deliberately introduced 2026-09-07 (header, :47-71: 'C — the build was GROUND-ONLY. Now every plate is a storey')."
    },
    {
      "file": "apps/editor/src/ui/generation/buildFromEnvelopeChatSeam.ts",
      "line": 230,
      "quote": "const outcome = planBuildFromDesign({\n            envelopes: readDesignEnvelopes(envelopeStore(rt)),\n            activeLevelId,\n            authoredWallCountOnActiveLevel: wallCount,\n        });",
      "why": "⭐ A REAL DEFECT that produces exactly 'walls appeared on upper storeys'. `authoredWallCountByLevelId` is NOT passed. The planner's fallback (`buildFromDesignPlan.ts:733-738`) then reads 0 for every non-active level, so the C80 `already-built` refusal at :791-802 CANNOT fire on any upper storey — the chat verb `generation.from-envelope` threads a second shell through storeys that already carry walls. The button path does pass it (`parcelLawCreateHouse.ts:303-318`), so the two entry points disagree."
    },
    {
      "file": "packages/command-registry/src/levels/AddLevelCommand.ts",
      "line": 65,
      "quote": "projectContext.activeLevelId = newLevel.id;",
      "why": "⭐ Second real mechanism, already logged as L-13189 and explicitly 'logged, not fixed' (`buildFromDesignPlan.ts:71-76`). Creating a 6-storey envelope dispatches `level.add` per missing storey (`parcelLawEnvelopeAuthoring.ts:1466-1473`), so the ACTIVE LEVEL ends up as the TOP storey — matching the founder's `Registered element spaceEnvelope_… to level L5-…`. Anything afterwards that seats on the active level lands on the TOP level."
    },
    {
      "file": "apps/editor/src/engine/spaceEnvelopeWallFollow.ts",
      "line": 439,
      "quote": "const result = deps.dispatch(WALL_CASCADE_BASELINE_COMMAND, {",
      "why": "Rival killed. The only two verbs the wall-follow consequence dispatches are `wall.updateHeight.batch` (:404) and `wall.cascadeBaseline` (:439) — it MOVES walls, never creates them. And the founder's own line 'No walls are linked to this envelope yet' is its refusal (`spaceEnvelopeWallFollowPlan.ts:994`), which proves ZERO walls were linked to that envelope at that moment — i.e. those 6 walls were not built from it via `recordEnvelopeWallLinks`."
    },
    {
      "file": "apps/editor/src/ui/analysis/parcelLawEnvelopeAuthoring.ts",
      "line": 1394,
      "quote": "bus.executeCommand(plan.command, plan.payload);",
      "why": "Rival killed. Envelope authoring's only verbs are `spaceEnvelope.batch.create` (:1394, `plan.command` pinned to that literal at `envelopeAuthoringPlan.ts:245/757`) and `level.add` per storey (:1470). No wall verb anywhere in the envelope authoring or draw path."
    }
  ],
  "proposedFix": "DO NOT change the \"Do it myself\" button — it is innocent, and gating it would be fixing the wrong thing.\n\nSTEP 1 (before any code change) — get the discriminating measurement, because this repo has paid for confident-but-wrong picks between rivals. Ask the founder for two console lines he already has the machinery for:\n  a. `__pryzmDumpLinework()` — the full per-object table (`lineworkProbe.ts:420-427`). The `elementId` column gives the real wall ids and `parentChain` gives the producer's group; six rows keyed `wall_<ULID>` settles \"real walls\" beyond the provenance argument, and the ids let the wall store be queried for `levelId`.\n  b. The `[site][build-from-design]` / \"Built from your design across N storeys\" status line, or the `pryzm-generation-report`. If either is in the log, the shell came from `executeBuildFromDesign` and the storey set is `buildFromDesignPlan.ts:748/860`.\nAlso worth asking: did he type anything to the chat before the click? `generation.from-envelope` resolves from free language (`packages/ai-host/src/intents/BuildFromEnvelope.ts`), and a sentence like \"do it yourself\" is exactly the shape that could resolve to a build.\n\nSTEP 2 — two real defects found on the way, both worth fixing regardless of which one bit him:\n\n  FIX A (C80 bypass, one line). `buildFromEnvelopeChatSeam.ts:230-234` must pass `authoredWallCountByLevelId`, built the same way the button builds it at `parcelLawCreateHouse.ts:303-318` (seed the target set with `activeLevelId` when non-null, add every `role:'level'` envelope's `levelId`, census each through `deps.authoredWallCount`). Today the chat path can silently re-shell every upper storey that already has walls, while the button path refuses by name. Two entry points, one question, two answers — the exact C84 EI-9 shape, and the header of that very file claims it reaches the button's own wiring \"so a second census cannot exist\". It does exist, and it is the omission.\n\n  FIX B (L-13189, the storey the geometry lands on). `AddLevelCommand.execute` re-points `projectContext.activeLevelId` at every storey it mints (`AddLevelCommand.ts:65`). After \"Create the envelope\" with 6 storeys the active level is the TOP one, so every subsequent active-level-seated creation lands on the top floor. This is already logged and deferred; if the founder's walls turn out to be on the TOP storey only (not all six), this is the root cause and the fix belongs in AddLevelCommand / the envelope-authoring storey loop, not in the planner.\n\nSTEP 3 — if the dump shows the six WallEdges are visible while their wall BODIES are not, the founder is looking at leaked plan-mode linework, not walls, and the fix is in `WallEdgeVisibilityService` (its `setVisible(isPlanMode)` governs ONE scene shared by the split's 3D and plan panes). That is a third, separable defect; do not conflate it with creation.",
  "confidence": "medium",
  "rivalHypothesesRuledOut": [
    "RULED OUT — 'the 6 WallEdges are the envelope's own edge overlay being mistaken for walls' (the task's suspicion): `WallEdges` is stamped only at `WallEdgeOverlayBuilder.ts:143`, whose only callers are inside `WallFragmentBuilder`, always with `wall.id`. The envelope builder stamps `spaceEnvelope`/`SpaceEnvelopeFace` and emits no line object at all (`SpaceEnvelopeMeshBuilder.ts:200,225`). No file under `plugins/space-envelope/src` or `packages/geometry-space-envelope/src` contains the string `WallEdges`, and no file under `packages/scene-committer/src`, `plugins/wall/src` or `packages/geometry-wall/src` contains `spaceEnvelope` except one unrelated comment. Real walls exist.",
    "RULED OUT — 'the Do it myself click dispatches a build-from-envelope / shell extrude': the handler is three statements (:2690-2694) and the landing function has no `executeCommand` in its 189 lines. `executeBuildFromDesign` has exactly two production callers — `parcelLawCreateHouse.ts:210` (the CREATE_HOUSE_BTN click) and `buildFromEnvelopeChatSeam.ts` (the `generation.from-envelope` chat verb, registered at `initBusHandlers.ts:3073-3097`). Neither is reachable from the pill.",
    "RULED OUT — 'something auto-builds when the app phase flips to canvas': the only `onAppPhaseChanged` subscribers are `mountSiteViewLauncher()` and `refreshSiteSplitLauncher()` (`GISAreaLayout.ts:7653,7656`), and `elementAuthoringContext.ts` is a pure predicate with no queue — it gates authoring during onboarding and un-gates it, it does not replay anything.",
    "RULED OUT — 'creating the 6-storey envelope creates walls': the authoring control dispatches `spaceEnvelope.batch.create` (`parcelLawEnvelopeAuthoring.ts:1394`) and `level.add` per missing storey (:1470) and nothing else; `plugins/space-envelope/src/handlers/` holds only CreateSpaceEnvelopeBatch / MutateSpaceEnvelope / removeEnvelopes / containmentGate, none of which touches a wall.",
    "RULED OUT — 'the envelope face-drag wall-follow created them': it dispatches only `wall.updateHeight.batch` and `wall.cascadeBaseline` (`spaceEnvelopeWallFollow.ts:404,439`), and its own console line in the founder's paste ('No walls are linked to this envelope yet', `spaceEnvelopeWallFollowPlan.ts:994`) proves the link graph held ZERO walls for that envelope — so they were not created from it by `recordEnvelopeWallLinks` either.",
    "NOT RULED OUT — 'the walls were created by an earlier, separate gesture in the same session (the Create BIM from this design button, an AI-panel batch such as walls-on-all-slabs, or a chat sentence resolving to generation.from-envelope), and the click merely revealed them by switching into the BIM 3D canvas.' The paraphrased console cannot separate this, and it is the hypothesis the remaining evidence best fits.",
    "NOT RULED OUT — 'the founder is looking at leaked plan-mode edge LINEWORK rather than wall solids.' The probe prints only effectively-visible rows, and WallEdges are born `visible=false` and are supposed to be hidden in 3D; the plan pane of the split the landing opens is the benign explanation, but I could not measure which."
  ],
  "whatWouldFalsifyThis": "Two things would falsify the settled half:\n\n1. A `__pryzmDumpLinework()` table in which the six `WallEdges` rows carry `elementId` values that are NOT `wall_<ULID>` — e.g. `spaceEnvelope_…` — or a `parentChain` that runs through `spaceEnvelope:<id>`. That would mean something is feeding envelope geometry through `buildWallEdgeOverlay` on a path my grep missed, and my whole (c) answer collapses. (Equivalently: an empty `wallStore` while six WallEdges are on screen.)\n\n2. A console trace showing `[site][build-from-design]`, `wall.batch.create`, or a `pryzm-generation-report` timestamped AFTER `[onboarding-step] type pill → DO IT MYSELF`. That would mean the landing does reach a builder through a seam I did not find (a `view-activated` or `bim-level-added` subscriber, say), and the exoneration of the button is wrong.\n\nAnd what would falsify the UNKNOWN half in the other direction — i.e. confirm a specific cause: if the wall records' `levelId` values are all ONE level and that level is the top storey, FIX B (AddLevelCommand re-pointing the active level, L-13189) is the root cause; if they span every storey of the envelope stack, the cause is `planBuildFromDesign`'s §BUILD-EVERY-STOREY loop and the question becomes which of its two dispatchers ran.",
  "filesToChange": [
    "apps/editor/src/ui/generation/buildFromEnvelopeChatSeam.ts",
    "packages/command-registry/src/levels/AddLevelCommand.ts",
    "apps/editor/src/ui/analysis/parcelLawEnvelopeAuthoring.ts"
  ]
}