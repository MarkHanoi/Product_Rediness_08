{
  "defectId": "house-layout-modal-on-bim-entry",
  "rootCauseFound": true,
  "rootCause": "The \"Design your house — live\" screen is `buildHouseModalHtml` (`apps/editor/src/ui/house-layout/houseModalHtml.ts:588`, 3-pane: plan LEFT · graph CENTER · sliders/tools RIGHT), mounted as a transient overlay by `HouseLayoutModal.show` via a direct `document.body.appendChild(overlay)` (`HouseLayoutModal.ts:613`) — not through PanelManager. It is shown from exactly one place in the codebase: `HouseLayoutController.request` → `this.modal.show(...)` (`HouseLayoutController.ts:333`). That is reached on entry to the BIM/PRYZM views by two production call sites, both of which leave `HouseFromBoundaryOptions.autoBuild` at its default `false` (the modal path): (1) the Parcel Law tab's question 7 \"Take me into BIM.\" Create-house button — `parcelLawCreateHouse.ts:492` calls `deps.buildHouse(...)`, whose production impl at `parcelLawCreateHouse.ts:215` is `generateHouseFromBoundary(rt, storeyCount, {...})` with `autoBuild` deliberately NOT passed; and (2) `OnboardingStepController.generateHouse()` at `:4123`, which awaits `generateHouseFromBoundary(...)` and then hands the pane to `pryzmShowSiteResultView('2D')` at `:4085` — and because `request()` resolves the instant the chooser opens (`HouseLayoutController.ts:109`), the modal is literally on screen as the BIM dual pane comes up. It is gated on NOTHING resembling a flag: the only pre-conditions before `modal.show` are an active level, a closed ≥3-wall shell, the C58 max-height gate, and `variants.length > 0` (`HouseLayoutController.ts:243-303`). The unsound algorithm behind it is the apartment TGL engine driven per storey — `houseOrchestrator.ts:19` imports `generateDeterministicLayouts` from `../apartmentLayout/tgl/runDeterministicLayout.js`, and `§TOPO-HARD-REJECT-ALL` (the founder's console line) lives in `packages/ai-host/src/workflows/apartmentLayout/tgl/enumerate.ts:296`, whose own comment says the pool \"is NEVER emptied\" so a hard-invalid layout still ships. Crucially, the reason the BIM group still reaches the generator at all is THREE LINES: `parcelLawCreateHouse.ts:334-336` — `if (design.ok && design.plan.rooms.length === 0) return { mode: 'create-house', outcome: houseOutcome };`. `planBuildFromDesign` already returns an OK plan with zero rooms since §SHELL-WITHOUT-ROOMS/L-13250 (`buildFromDesignPlan.ts:665-686`: \"A PLATE WITH NO ROOMS IS A BUILDABLE DESIGN, AND REFUSING IT WAS WRONG\" — shell walls off the level ring, one slab per storey, neither reads a room), and its own comment states the panel fall-through was kept only because changing that surface's offer \"is not something this lane should change silently\". So the modal is not load-bearing on the BIM path: removing that fall-through routes the button to the sound build-from-design executor instead.",
  "evidence": [
    {
      "file": "apps/editor/src/ui/house-layout/houseModalHtml.ts",
      "line": 588,
      "quote": "`<div class=\"alm-header\">Design your house — live</div>` +",
      "why": "Identifies the founder's screen exactly, and the surrounding lines show the §3PANE layout (plan LEFT · graph CENTER · tools RIGHT) he describes as floor plans + room graph + sliders."
    },
    {
      "file": "apps/editor/src/ui/house-layout/HouseLayoutController.ts",
      "line": 333,
      "quote": "this.modal.show(",
      "why": "THE single show site for that modal in the repo. Everything upstream funnels here; nothing else opens it."
    },
    {
      "file": "apps/editor/src/ui/house-layout/HouseLayoutController.ts",
      "line": 109,
      "quote": "* `request()` resolves as soon as `modal.show` is called — `ok` here means *\"the chooser is",
      "why": "Proves the modal is concurrent with, not before, the BIM view handoff on the onboarding path — the caller awaits and immediately navigates."
    },
    {
      "file": "apps/editor/src/ui/analysis/parcelLawCreateHouse.ts",
      "line": 334,
      "quote": "if (design.ok && design.plan.rooms.length === 0) {\n            return { mode: 'create-house', outcome: houseOutcome };",
      "why": "THE call site to change. This is the only thing routing the BIM group's button to the generator+modal instead of the sound build-from-design executor when the user has declared no rooms."
    },
    {
      "file": "apps/editor/src/ui/analysis/parcelLawCreateHouse.ts",
      "line": 215,
      "quote": "return mod.generateHouseFromBoundary(rt, storeyCount, {",
      "why": "The production dep. Two lines above it: '⛔ `autoBuild` is NOT passed — its default `false` is the modal path, which is what STR §25.0 requires.' Confirms the modal is chosen deliberately and via absence of a flag, not via any gate."
    },
    {
      "file": "apps/editor/src/ui/site/buildFromDesignPlan.ts",
      "line": 665,
      "quote": "// ⛔⛔ §SHELL-WITHOUT-ROOMS (L-13250) — A PLATE WITH NO ROOMS IS A BUILDABLE DESIGN, AND\n        // REFUSING IT WAS WRONG.",
      "why": "The sound replacement already exists and already handles the zero-rooms case: shell walls off the level ring + one slab per storey, no layout algorithm. This is why the exclusion costs no capability."
    },
    {
      "file": "apps/editor/src/ui/site/buildFromDesignPlan.ts",
      "line": 678,
      "quote": "// ⭐ THE PANEL'S GENERATOR FALL-THROUGH IS PRESERVED, AND DELIBERATELY MOVED RATHER THAN\n        // DROPPED.",
      "why": "The author of L-13250 states in source that the fall-through at parcelLawCreateHouse.ts:334 is a product choice about that one surface, not a correctness requirement — i.e. it is safe and intended to be revisited."
    },
    {
      "file": "apps/editor/src/ui/onboarding/OnboardingStepController.ts",
      "line": 4123,
      "quote": "await generateHouseFromBoundary(\n            this.runtime,\n            storeyCount,\n            footprint ? { footprint } : undefined,\n        );",
      "why": "The SECOND production call site on a BIM-entry path, with no autoBuild and no gate. Any exclusion that only touches the Parcel Law tab leaves this one open."
    },
    {
      "file": "apps/editor/src/ui/onboarding/OnboardingStepController.ts",
      "line": 4085,
      "quote": "showResult('2D');",
      "why": "Immediately after the house generate branch — this is the handoff into the BIM dual pane, so the modal and the BIM views appear together."
    },
    {
      "file": "packages/ai-host/src/workflows/houseLayout/houseOrchestrator.ts",
      "line": 19,
      "quote": "import { generateDeterministicLayouts } from '../apartmentLayout/tgl/runDeterministicLayout.js';",
      "why": "Explains why the founder's console shows [apartment-layout] TOPO-HARD-REJECT-ALL alongside [house-layout] PROGRAMME-OFFER: the house pipeline drives the apartment TGL engine per storey. Rules out the apartment modal being the subject."
    },
    {
      "file": "packages/ai-host/src/workflows/apartmentLayout/tgl/enumerate.ts",
      "line": 296,
      "quote": "* hard-invalid the pool is NEVER emptied (a loud §TOPO-HARD-REJECT-ALL warning",
      "why": "Source of the founder's 'shipping the LEAST-BAD layout' line — the engine is designed never to refuse, which is precisely the unsoundness he is naming."
    },
    {
      "file": "apps/editor/src/ui/room-programme/roomProgrammePanel.ts",
      "line": 2,
      "quote": "* roomProgrammePanel — the ROOM PROGRAMME surface: a library you drag from, a graph you\n * plug and unplug, a plan that re-solves as you do it, and one button that turns the\n * result into room ENVELOPES in the 3-D scene.",
      "why": "(d) The 'add rooms via the room graph' surface already exists."
    },
    {
      "file": "apps/editor/src/ui/room-programme/roomProgrammePanel.ts",
      "line": 528,
      "quote": "applyRoomProgrammeIntent({ type: 'programme.add-room', id: deps.mintId('room'), kind }));",
      "why": "A user CAN add a room today — clicking or dragging a library chip dispatches programme.add-room. Line 806 does programme.link on drag-onto-node; the model also carries remove/rename/set-area/unlink/pin/draw-room (roomProgrammeModel.ts:112-201)."
    },
    {
      "file": "apps/editor/src/ui/analysis/parcelLawTab.ts",
      "line": 1216,
      "quote": "bodyOf('rooms').appendChild(roomProgrammeSlot);",
      "why": "The room-graph panel is LIVE-MOUNTED (not authored-but-unwired) in Parcel Law question 4, three questions above 'Take me into BIM' — so the replacement affordance needs no new surface."
    },
    {
      "file": "apps/editor/src/ui/analysis/parcelLawQuestionGroup.ts",
      "line": 323,
      "quote": "id: 'rooms',\n        ordinal: 4,\n        // `C115-05`, stage 05, verbatim.\n        question: 'What can I fit inside it?',\n        hint: 'Room library, the graph that drives the plan, the programme, and the rooms on each storey.'",
      "why": "Names the exact group the replacement pointer should route to; group 7 'bim' ('Take me into BIM.') is where the create-house control lives."
    },
    {
      "file": "apps/editor/src/ui/room-programme/roomEnvelopePlan.ts",
      "line": 238,
      "quote": "role: 'room',",
      "why": "Closes the loop: the graph's 'Place envelopes in 3D' mints role:'room' envelopes, which buildFromDesignPlan.ts:664 (`input.envelopes.filter((e) => e.role === 'room')`) consumes — so declaring rooms in the graph makes the SAME BIM button build partitions and ceilings, with no layout algorithm involved."
    },
    {
      "file": "apps/editor/src/ui/house-layout/houseLayoutTrigger.ts",
      "line": 34,
      "quote": "void generateHouseFromBoundary(runtime, Math.max(1, Math.floor(storeyCount || 1)), opts);",
      "why": "window.pryzmGenerateHouse(n) keeps the whole feature reachable for the later make-it-sound lane without any UI entry point — so nothing needs deleting."
    }
  ],
  "proposedFix": "EXCLUDE (one call site, zero deletions): remove the three-line fall-through at `apps/editor/src/ui/analysis/parcelLawCreateHouse.ts:334-336`, so `decide()` ends with `return { mode: 'build-from-design', outcome: design };`. That is the ONLY thing routing question 7's button into the generator+modal, and since §SHELL-WITHOUT-ROOMS (L-13250) the build-from-design planner already produces an OK plan with zero rooms — shell walls off the level envelope's own ring plus one slab per storey, `willNotCreate` already naming partitions and ceilings as not built. So the button keeps working, gets strictly sounder (no TGL enumeration, no least-bad ship), and the founder's \"it should work for walls/slabs, minimum\" is honoured on this surface too. Nothing in house-layout/ is touched: `HouseLayoutController`, `HouseLayoutModal`, `houseModalHtml` and `generateHouseFromBoundary` stay intact and stay reachable via `window.pryzmGenerateHouse(n)` (`houseLayoutTrigger.ts:34`, installed at `AIAreaLayout.ts:289`) and via the chat seam (`generationChatSeam.ts:649`, which passes `autoBuild:true` and never opened the modal anyway) — that is the lane's own test bench while it is made sound.\n\nREPLACEMENT AFFORDANCE (the founder's \"add rooms via the room graph in case the user did not do it\"): in `buildBuildFromDesignSection` (`apps/editor/src/ui/site/createHouseSection.ts`), when `plan.rooms.length === 0`, print one line beside the enabled button — \"You have declared no rooms, so this builds the shell and the floor plate only. Add rooms in question 4, 'What can I fit inside it?', and this button will build their partitions and ceilings too\" — with a control that opens question group 4 and scrolls to `PARCEL_LAW_ROOM_PROGRAMME_HOST_TESTID` (`parcelLawTab.ts:1216`; the group's open/closed state is already a first-class primitive in `parcelLawQuestionGroup.ts`). No new engine, no new panel: the graph at question 4 already dispatches `programme.add-room` / `programme.link` / `programme.draw-room` and already emits `role:'room'` envelopes that this same button consumes.\n\nSECOND CALL SITE — needs a founder decision, do not guess: `OnboardingStepController.generateHouse()` (`:4123`) also opens the modal, concurrently with `pryzmShowSiteResultView('2D')` at `:4085`. If his session was the onboarding wizard rather than the Parcel Law tab, the Parcel Law change alone will not remove the screen he saw. The architecturally consistent move there is to stop calling the house generator on the `route === 'house'` branch and land the user in the BIM dual pane with the parcel + level envelope, pointing at the room-graph question — but that changes what \"Generate\" means for the casa-unifamiliar typology and belongs in the same lane, not in a quiet edit.\n\nREJECTED ALTERNATIVES: (a) passing `autoBuild: true` — it swaps `modal.show` for `HouseLayoutController.buildDirect` (`:400`), which runs the SAME unsound enumeration and ships the same least-bad layout, just without asking. That hides the defect instead of excluding it. (b) A new `chooser?: boolean` flag on `HouseFromBoundaryOptions` — it would have to be threaded through every call site anyway (so it is not fewer edits), and it leaves a permanently-false branch in a 3,595-line executor's neighbourhood, which is the \"authored-but-unreachable\" shape this repo already tracks as debt. (c) Guarding inside `HouseLayoutModal.show` — that suppresses the feature globally, including the console bench the later lane needs.",
  "confidence": "high",
  "rivalHypothesesRuledOut": [
    "RIVAL 1 — 'entering a PRYZM/BIM view itself opens the modal (a view-switch side effect)'. RULED OUT. `applyBimDualPane` (GISAreaLayout.ts:2106-2169) and `showSiteResultView` / `window.pryzmShowSiteResultView` (:2588) contain no call into house-layout: they toggle GIS off, activate the 3D view, activate SplitViewManager and retire legacy view bars. I enumerated every caller of `generateHouseFromBoundary` and `generateHouseInExistingShell` repo-wide — parcelLawCreateHouse.ts:215, OnboardingStepController.ts:4123, houseLayoutTrigger.ts:34/36 (console), generationChatSeam.ts:649 (autoBuild:true), plus tests — and `modal.show` has exactly one call site (HouseLayoutController.ts:333). The modal follows an explicit generate/create gesture; it is not armed by the view transition.",
    "RIVAL 2 — 'it is the APARTMENT chooser (ApartmentLayoutModal), not the house one'. RULED OUT by the founder's own console mixing `[apartment-layout] TOPO-HARD-REJECT-ALL` with `[house-layout] PROGRAMME-OFFER`: houseOrchestrator.ts:19 imports `generateDeterministicLayouts` from `../apartmentLayout/tgl/runDeterministicLayout.js`, so the house pipeline emits `[apartment-layout]` logs per storey. The header string he named, 'Design your house — live', exists only at houseModalHtml.ts:588.",
    "RIVAL 3 — 'the modal is already behind a flag/feature gate that has regressed'. RULED OUT by reading HouseLayoutController.request:238-333 line by line: the only guards are `resolveActiveLevel()`, `analyseActiveShell(ground.id)`, `checkMaxHeightGate`, and `variants.length === 0`. There is no flag, no store read, no config. The one flag-shaped thing in the pipeline is `HouseFromBoundaryOptions.autoBuild` (houseFromBoundary.ts:51), which selects buildDirect over the modal — not enablement.",
    "RIVAL 4 — 'excluding the modal would break the BIM-entry button (it is the only thing that can build from a bare plate)'. RULED OUT by buildFromDesignPlan.ts:665-686, which states in source that shell walls and slabs read no room and that refusing a roomless plate 'WAS WRONG'; `design.ok` is true with `rooms.length === 0`, which is exactly the condition the fall-through at parcelLawCreateHouse.ts:334 currently discards.",
    "NOT RULED OUT — WHICH of the two entry paths the founder was on. Both the Parcel Law 'Take me into BIM' button and the onboarding house route open the modal on the way into the PRYZM views. The Parcel Law surface is the stronger textual match (createHouseSection.ts:64 calls itself 'The explicit step from the envelope stage into BIM'), and his 'in case the user did not do it' matches that surface's room-envelope check precisely — but his console alone cannot distinguish them, so I am reporting both call sites rather than picking one."
  ],
  "whatWouldFalsifyThis": "Open the Parcel Law tab, question 7 \"Take me into BIM.\", with a level envelope drawn and no room envelopes, click \"Create house from this envelope\", and watch the console. My account predicts the sequence `[analysis][create-house]` → `[house-from-boundary] shell ready: N exterior walls` → `[house-layout] controller: computed N house variant(s) — opening modal with the single best` → `[house-layout] §MODAL-FILL seed: …`, with `HouseLayoutModal` appending `.alm-overlay` to `document.body`. If instead the \"Design your house — live\" overlay appears with NO preceding `[house-layout] controller: computed …` line, or appears without any click on that button (e.g. purely on switching to a PRYZM view, or on project load), then something other than `HouseLayoutController.request` is mounting it and my single-show-site claim is wrong. Equally falsifying: if deleting parcelLawCreateHouse.ts:334-336 in a scratch build still leaves the modal on that click — that would mean `decide()` is returning `create-house` through the `!houseOutcome.ok` branch above it, i.e. a refusal arm is somehow producing an enabled button, and the routing analysis is wrong.",
  "filesToChange": [
    "apps/editor/src/ui/analysis/parcelLawCreateHouse.ts",
    "apps/editor/src/ui/site/createHouseSection.ts",
    "apps/editor/src/ui/analysis/parcelLawTab.ts",
    "apps/editor/src/ui/onboarding/OnboardingStepController.ts"
  ]
}