<!--
  LANE OUTPUT — Massing without an envelope · walls on upper levels · the house-layout modal on BIM entry
  Workflow task w07z6pozb. Produced 2026-09-09 and captured to the repo the same day.

  ⚠ THIS IS A LANE REPORT, NOT A CONTRACT. It is an audit's own words, verified by its
  own adversarial passes and no further. Where it and the code disagree, the code wins
  and this file is stale. Line numbers rot fast — re-read before acting on one.

  ⭐ Captured because the fixes it drove ship across several commits, and the REASONING
  behind a one-line change is the part that is expensive to reconstruct. Several findings
  here were deliberately NOT implemented; the commits say which and why.
-->

# Fix plan — three founder-reported defects

HEAD at time of writing: `aa119382`. Every line number below was re-read at this HEAD; where the dossier's line numbers drifted I give the value I measured.

Register note before anything else: `docs/04-reference/ISSUE-LOG.md`'s highest row is **L-13266**, while code comments already cite L-13250, L-13256, L-13277, L-13278, L-13279. The register lags the code by at least five rows. Allocate new numbers from **L-13280** upward and, per this repo's convention, add the row in the same commit as the code.

---

## 1 — Massing is unreachable when no envelope was solved

### 1.1 What is actually wrong

The "Create it myself" authored-massing route has **no preconditions of its own**, but it is rendered as a child of a container whose *existence* and whose *arm* are both decided by the **generated** route's preconditions. `buildAuthoredMassingOptionHtml` is called from exactly one place — inside `buildMassingOptionsFold` (`apps/editor/src/ui/site/envelopeCardSections.ts:582`) — and that fold is emitted only through `safeMassingOptionsSection` / `wireMassingOptions`, which exist only on the full-determination template (`apps/editor/src/ui/layout/GISAreaLayout.ts:5774` and `:5884`). The three other templates never build the section: `renderEnvelopeAbsencePanel` (`:4852`, innerHTML `:4938-4947`), the refusal card (`:5201`, innerHTML `:5346-5368`) and `renderReducedEnvelopePanel` (`:4283`). So one placement error is observed twice — that is the mechanism, not two independent bugs.

**The one instance I can confirm reachable without a browser, and it is the worse half — a user-triggered deletion, not an omission.** `status: 'degenerate'` ("the setbacks consumed the whole parcel", `packages/schemas/src/site/zoning/BuildableEnvelope.ts:151,171`) is neither `'none'` nor `'not-applicable'`, so it does **not** enter the refusal branch at `GISAreaLayout.ts:5201`; it falls through to the **full** arm, which handles it by name at `:5661-5662`. There the massing fold *is* rendered and the authored card *is* on screen. But `insetPolygon` is empty on that status, so pressing **Generate massing options** reaches `enumerateMassingOptions`, hits the `permittedRing.length < 3` refusal at `apps/editor/src/ui/site/massingOptionModel.ts:404-410`, and `wireMassingOptions` calls `refreshEnvelopePanel()` (`GISAreaLayout.ts:4046`). The fold repaints on the `refused` arm — `envelopeCardSections.ts:597-607`, which returns **only** the warning div and drops `authoredCard`, contradicting its own header three lines above (`:581`, "first on both arms") and `massingAuthoredOptionSection.ts:43` ("Present on every arm — the tool is never gated"). The card the user was looking at is deleted by his own click, and with it the only on-view route into `window.pryzmOpenSiteEnvelopeTool`.

**UNKNOWN: which arm the founder was actually on.** Four are in play (absence ×6 kinds, refusal ×4 sub-arms, reduced, full-with-refused-fold) and the correct edit differs per arm. **Cheapest probe:** the absence arm ends with `console.log('[gis][envelope-card] §ENVELOPE-NOT-A-GATE (C58 §1.20) no envelope → state="…"')` at `GISAreaLayout.ts:4959-4962`. One console line, or one screenshot of the chip in the card header (`ENVELOPE_ABSENCE_CHIP` vs "Zone rules coming" vs "No plan published here" vs a numeric determination), picks the arm and eliminates three of the four edits below. Do not skip this: edit (2) is the only one whose scope is contested.

### 1.2 The fix

**Edit A — `apps/editor/src/ui/site/envelopeCardSections.ts:597-607`.** Put `authoredCard` back on the `refused` arm of `buildMassingOptionsFold`, immediately *before* the warning div. Keep `intro` off it — the intro describes generated options. Nothing else changes. This closes the degenerate case entirely and makes `:581` and `massingAuthoredOptionSection.ts:43` true. Ship it as its own commit; it needs no contract question and no probe.

**Edit B — `apps/editor/src/ui/layout/GISAreaLayout.ts`, one shared producer plus two guarded insertions.**

- Lift the authored-state read out of `safeMassingOptionsSection` (`:5789-5801`) into one closure beside the other panel helpers:
  `const readAuthoredMassingState = () => { try { const ground = pickGroundLevel(readLevelCandidates((window.bimManager as {getLevels?: () => unknown[]} | undefined)?.getLevels?.() ?? [])); return resolveAuthoredMassingState(readLevelEnvelopes(liveRuntime()?.stores?.spaceEnvelope ?? null), ground?.id ?? null); } catch { return null; } }`
  The full arm then calls it instead of inlining the read. **One producer of the state** (C06 §13.3); the HTML builder is already single.
- **Absence arm (`:4939-4947`)**: `const safeAuthoredMassingCard = studySite ? buildAuthoredMassingOptionHtml(readAuthoredMassingState()) : '';`, inserted immediately before `${safeDesignStageStrip}`. `studySite` is already computed at `:4915` and is non-null exactly when `hasCommittedParcel` — which is false for both `no-parcel` and `runtime-unreachable`, the two kinds where the tool would have no ring and no bus to write to. **Reuse that value; do not write a second predicate.**
- **Refusal arm (`:5346-5368`)**: `const safeAuthoredMassingCard = (isAbsent || isGap) ? buildAuthoredMassingOptionHtml(readAuthoredMassingState()) : '';`, inserted before `${safeDesignStageStrip}`. This is the **same predicate** `safeStudyHeightEntry` already carries at `:5261`, so the two author-side affordances on one card cannot disagree about one parcel.
- Call `wireAuthoredMassingOption(panel, …)` on both arms with the same body `wireMassingOptions` uses at `:4063-4066`. It is null-safe (`massingAuthoredOptionSection.ts:183-184`), so the call is unconditional even when the card was withheld.

⛔ **Do NOT render "Generate massing options" on these arms.** `enumerateMassingOptions` refuses by construction there (`massingOptionModel.ts:404`), and a control that can only refuse is the dead click the card's own discipline forbids.

⛔ **Deliberately excluded: `legallyGrounded: true` refusals** (park, motorway, clau-18 — emitted from `ptCrusZone`, `ptCondicionantes`, `ptPdmObjectGates`, `siuLandClassificationGuard`, `frNoExtraction`, `murciaZoningProvider`, `siteDispatch`). The comment at `GISAreaLayout.ts:5247-5251` records a deliberate ruling (§MANUALENV159 TASK B) that a massing input on a *settled legal no* "would misleadingly imply buildability where the ordinance says there is none". C58 §1.20 forbids blocking on the **absence** of an envelope; a legally-grounded refusal is a **presence**, so the contract does not reach it. **This is a founder question, one line: "on a plot where the ordinance says nothing may be built, should the Draw-my-own button still appear?"** If yes, it is a C58 amendment with its own label, not a line in this lane.

**Edit C — `apps/editor/src/ui/site/designStageModel.ts`, two parts, and part 2 is not optional.**
1. `reached('massing')` at `:141` currently returns `i.hasResolvedEnvelope || i.hasMassingProposal`. Both no-envelope arms hard-code `hasResolvedEnvelope: false` (`GISAreaLayout.ts:4898`), and neither authoring path writes `setTargetFootprintProposal`. So after the user draws, the strip would say massing **unavailable** under a card saying **chosen**. Add `readonly hasAuthoredGroundMassing: boolean` to `DesignStageInputs`, OR it into `reached('massing')`, and feed it from `readAuthoredMassingState()?.kind === 'chosen'` at **both** production call sites — `GISAreaLayout.ts:4896` and `:5137`. (There are exactly two, not three.)
2. Rewrite `NO_ENVELOPE` (`:124-126`). Drop "so there is nothing to design inside" and "anything drawn here would be unchecked against the ordinance". The replacement must name **both** live routes, because the study route already exists on these arms (`buildStudyHeightEntryHtml`, `GISAreaLayout.ts:4915-4917` / `:5261`, carrying `data-stage-control="massing"`): *no buildable envelope has been resolved, so PRYZM cannot check a massing against the ordinance. You can still type a study height, or draw your own massing on the view — the check will state itself as NOT PERFORMED, never as a pass.* Blast radius nil: module-private, one use at `:167`, no spec references the string.

**Optional, not blocking — `renderReducedEnvelopePanel` (`:4283-4325`).** Verified: no massing section, no authored card, no stage strip at all. It is the "Saved" legacy-determination arm and its designed route out is `wireLegacyRecompute`. Adding the card here changes what that arm *is*; do it only if the probe in §1.1 says the founder was on it.

### 1.3 What it must not break

- **The generated-options gate.** Every generated option is a fraction of a *permitted* footprint (`wireMassingOptions`'s own comment at `GISAreaLayout.ts:5882-5883`). Edit B renders the authored card and nothing else on the no-envelope arms; the Generate button stays gated on a permitted plate. Guarded by the negative test arms in §1.4.
- **The one forbidden outcome — a drawn massing reading as legally checked.** Four existing guards stay untouched and must be verified still present after the edit: `confidence:'authored'` with no `ordinanceRef` (C58 §1.19 cl. 3); the drawn rung's own sentence in `parcelLawEnvelopeAuthoring.ts` ("This is YOUR design intent, not a statement of what the law permits"); `ceiling-not-derived` → "cannot be checked", never a pass (`intentAgainstCeilingModel.ts`); and the absence/refusal chip sitting **one element above** the new card, so the card is read inside an explicit statement that no determination exists.
- **The settled-legal-no card.** Edit B's predicate is copied from `:5261`, not invented; if it is ever loosened, the §MANUALENV159 ruling must be named and superseded, not silently reversed.
- **`querySelector` is singular.** `wireAuthoredMassingOption` (`massingAuthoredOptionSection.ts:183`) matches one testid. Edit B makes `MASSING_AUTHOR_OPTION_TESTID` producible from two sites. They are mutually exclusive today (fold vs no-envelope template) and must stay so — if both ever paint on one arm, only the first wires and the second is a silent dead click. Pin it: assert `querySelectorAll(testid).length <= 1` on every arm.

### 1.4 The red-first test

Extend `apps/editor/src/ui/site/__tests__/massingAuthoredOptionSection.spec.ts`:

1. **Fails today, passes after Edit A** — `buildMassingOptionsFold({kind:'computed', set:{ok:false, reason:'no-permitted-footprint', text:'…'}}, {kind:'offer'})` contains `MASSING_AUTHOR_BTN_TESTID`.
2. **The state-machine arm, which no source grep can see** — render `idle`, assert the card present; render `refused` into the same host, assert **still** present. This is the arm that pins the degenerate deletion.
3. **Positive template arms** — the absence template with a committed parcel, and the refusal template with `isGap`, both emit `MASSING_AUTHOR_OPTION_TESTID` and wire the button.
4. **Negative template arms, which are what will regress** — the refusal template with `legallyGrounded: true, isTransient: false` must **not** emit it; the absence template on `no-parcel` and `runtime-unreachable` must **not** emit it. A test asserting only presence licenses exactly the over-broad insertion that mirrors the over-broad refusal being fixed.
5. **Stage-strip agreement** — `describeDesignStages({…, hasResolvedEnvelope:false, hasAuthoredGroundMassing:true})` returns massing as reached.

⚠ **The existing source pin at `:247-251` is unsafe and must be fixed in this lane.** It does `readFileSync(GISAreaLayout.ts)` and `expect(src).toContain('wireAuthoredMassingOption(panel')` **file-wide, with comments intact** — it would pass if the only occurrence were inside an explanatory comment, and it cannot tell which template the call sits in. Replace it with an arm that (a) strips `//` and `/* */` before matching, and (b) scopes each match to the slice between the template's own function header and its closing brace. This repo has shipped arms that matched their own explanatory comment three times in one day.

---

## 2 — A full perimeter wall ring lands on every upper storey

### 2.1 What is actually wrong

**Two distinct mechanisms produce the same symptom, and only the second is confirmed as a defect on its own terms.**

**(i) The build has no storey scope.** `apps/editor/src/ui/site/envelopeAuthoringPlan.ts:628-629` mints one `role:'level'` envelope per storey, each carrying a **copy of the same ring** (`footprintFor()`); `buildFromDesignPlan.ts:743` walks `for (const plate of sortedLevels)` with only two per-storey rejections (`degenerate-plate-ring`, C80 `already-built`) and no "does this storey carry a design?" arm; the shell loop then pushes one wall per plate edge per built storey, and `buildFromDesignExecutor.ts` stamps `levelId: w.levelId` so one `wall.batch.create` lands walls on all N storeys. The shipped spec pins exactly this: `buildFromDesignPlan.spec.ts:489-493` — `expect(p.shellWallCount).toBe(20); // 4 edges × 5 storeys`, with the very next arm at `:505` titled *"the empty storeys stay empty"*, which they are not. Two commits on **2026-09-08** combined to produce it (`04887ea5` §BUILD-EVERY-STOREY, then `6399ab4f` §SHELL-WITHOUT-ROOMS / L-13250 — same day, not consecutive days). **This is intended behaviour as written; whether it is wrong is a product judgement, not a bug.**

**(ii) On the chat path, C80 is blind above the active level — and this one is unambiguously a defect.** `buildFromDesignPlan.ts:732-739`: `authoredWallsOn(levelId)` consults `input.authoredWallCountByLevelId` and otherwise `return levelId === activeLevelId ? input.authoredWallCountOnActiveLevel : 0`. That map is supplied at **exactly one call site in the tree** — the panel, `apps/editor/src/ui/analysis/parcelLawCreateHouse.ts:325` (built at `:302-318`). `apps/editor/src/ui/generation/buildFromEnvelopeChatSeam.ts:232-236` omits it. So every non-active storey reads **0 authored walls by construction** and the `already-built` arm at `:788-797` can never fire above the active level. A second chat "create walls on envelope" re-dispatches a full shell + slab onto every upper storey, on top of the first run's — duplicate coincident walls, no refusal. L-13250 came from the founder **in chat**; that is the surface he was standing on.

**UNKNOWN: which of the two he saw.** They are distinguishable by **wall count per upper level**: 4 per upper storey = mechanism (i); 8 = mechanism (ii) on a second run, with the *viewed* storey looking correct. Cheapest probe, needing no console: the panel prints, before the click, `Builds: N storeys — <plate> at <h> m, <ftf> m floor-to-floor, <k> rooms` (`createHouseSection.ts:238-243`). If he saw that line he was on the panel arm; if he got walls with no such line he was in chat.

### 2.2 The fix

**Step 1 — close (ii) first; it is one line and needs no decision.** In `buildFromEnvelopeChatSeam.ts:232-236`, pass `authoredWallCountByLevelId`. Do not copy the panel's census: **export the block at `parcelLawCreateHouse.ts:302-318` as a shared helper** (`buildPerStoreyWallCensus(envelopes, activeLevelId, authoredWallCount)`) and have both callers use it. Two censuses is how this rule got two answers.

**Step 2 — the false report line, also independent.** `buildFromEnvelopeChatSeam.ts:275-277` says "…on the level you are viewing." after a build that now covers N storeys. Make it name the storeys, or say "across N storeys", whenever `plan.storeys.length > 1`.

**Step 3 — an explicit storey scope whose default is today's behaviour.** Add `readonly storeyScope?: readonly string[] | null` to `BuildFromDesignInput` and honour it inside the loop at `buildFromDesignPlan.ts:743`: a named plate that is not seatable **refuses by name** through the existing `declineStorey` machinery (never a silent fallback — the `start-storey-not-seatable` precedent). **When the field is absent, build all plates exactly as now.**

⛔ **Reject the room-derived default.** "Build only the plates that carry rooms" produces a floating building on the diagnosis's own fixture: rooms only on Level 4 of five contiguous plates ⇒ a shell and a slab at 12 m with nothing under it. Plates are contiguous from the lowest storey, so the rule punches holes mid-stack. It also cannot live at `:743`: room→plate seating runs **after** the storey loop and consumes `builtByPlateId`, so implementing it there needs a second copy of the seating rule, whose disagreements would corrupt the "within, but not on the built plate" sentence that reads `refusedStoreyByPlateId`.

**Step 4 — the surface, so the scope is a choice and not an inference.** Add a storey selector to `createHouseSection.ts` beside `BUILD_FROM_DESIGN_LABEL`, defaulting to all storeys, feeding `storeyScope`. In chat, extend `applyPartSelection` (`buildFromEnvelopeChatSeam.ts:162`) with a storey projection and have `initBusHandlers.ts`'s `generation.from-envelope` `validate` name an unknown storey rather than dropping it.

**Step 5 — wire the scope that already exists rather than minting a second one, but do not pretend it is the same producer.** `startStoreyId` (`envelopeAuthoringPlan.ts:351,512-513`) and `describeSeatableStoreys` (`:382`) are complete and tested and have **zero production callers** — `describeSeatableStoreys` is used only at `:481` inside its own module, `startStoreyId` only from `envelopeAuthoringPlan.spec.ts:135`. Wire them on the **create** gesture so the build can read a scope the user already set. ⚠ They take **project levels**; the build's domain is **level envelopes**. They cannot be literally one producer — state the join, or the two lists will disagree.

**Step 6 — specs.** Amend `buildFromDesignPlan.spec.ts:489` and `:505` to the new rule (keep the superseded reasoning beside the new arm, per convention). **Add** an arm pinning L-13250's zero-rooms case so the default cannot be replaced by a heuristic later.

**Not in this lane: `createHousePlan.ts:243`** (`const storeyCount = Math.max(1, sorted.length)`). See §ORDER OF WORK.

### 2.3 What it must not break

- **L-13250 — "it should work for walls/slabs, minimum."** Its reproduction had one plate and zero rooms. The default-is-today's-behaviour choice preserves it *by construction*; the room-derived default would have re-opened it. Guarded by the new spec arm in step 6 and by the comment block at `buildFromDesignPlan.ts:665-687`, which must be amended rather than deleted.
- **C80 per-storey `already-built`.** Step 1 makes it *stronger*, not weaker, but the permissive direction documented at `:661-666` (a storey whose census could not be taken reads 0 and does **not** refuse) must stay permissive — the alternative is refusing a build because a census failed, which is the failure≠empty conflation. Guarded by an arm asserting a throwing `authoredWallCount` still yields a build.
- **The 63 green arms in `buildFromDesignPlan.spec.ts`**, plus `buildFromDesignExecutor.spec.ts`, `buildFromDesignStore.spec.ts`, `designEnvelopeWallLink.spec.ts`, `parcelLawCreateHouse.spec.ts` and `apps/editor/__tests__/L13117WallProvenanceSurvivesReload.test.ts`. An additive optional field keeps every one of them meaning what it says; only `:489`/`:505` move.
- **Undo atomicity.** One `wall.batch.create` per build = one undo entry (L-13019). A per-storey scope must not become per-storey dispatch.

### 2.4 The red-first test

1. **Fails today** — drive `buildFromEnvelopeChatSeam` twice against a store whose upper storeys already carry authored walls, with a `authoredWallCount` stub that reports them; assert the second run's plan contains `refusedStoreys` with code `already-built` for those storeys. Today it returns a full shell on each.
2. **Fails today** — assert the seam's report does not contain `on the level you are viewing` when `plan.storeys.length > 1`.
3. **Seam-level arm, not planner-level** — assert `planBuildFromDesign` was called **with** `authoredWallCountByLevelId`. A spec on the planner alone stays green while the seam stays blind; that asymmetry is the whole defect.
4. **Scope arms** — `storeyScope: ['L2']` builds one shell; `storeyScope: ['L-nonexistent']` refuses **by name** with both the requested id and the seatable set in the sentence; `storeyScope` absent reproduces today's 20-wall/5-slab result exactly.
5. Any source-text arm here (e.g. pinning that the seam passes the census) must run against **comment-stripped** source — the surrounding comments in both files quote the field name verbatim.

---

## 3 — The house-layout chooser opens on the way into BIM

### 3.1 What is actually wrong

`apps/editor/src/ui/analysis/parcelLawCreateHouse.ts:334-336`:

```
if (design.ok && design.plan.rooms.length === 0) {
    return { mode: 'create-house', outcome: houseOutcome };
}
```

A user who has drawn a level envelope but no rooms is routed to the **generator** arm, whose button calls `deps.buildHouse(...)` → `houseFromBoundary.ts` → `_controller.request(...)` → the singleton `HouseLayoutModal`, a full-screen `alm-overlay` (`position:fixed; inset:0; z-index:4000`, `min(1600px,90vw) × 90vh`) headed *"Design your house — live"*. That is the screen on the BIM-entry path, and one predicate puts it there. The screen is also *sound-gated by strategy and the gate is being walked through*: `docs/01-strategy/STR-RESIDENTIAL-DESIGN-ORCHESTRATOR.md` §25.0 (*"the layouts are not great and won't be… I want pryzm to guide this process without building the house in one click"*) and §25.5 (*"until this is sound we would not generate walls, doors etc…"*). For the current measured quality of the engine, **read `tools/ga-gate/generator-circulation-ledger.json` — do not quote a row count from this plan or from the dossier; eleven rows were struck on 2026-09-06 and the ledger is a shrink-only ratchet that moves.**

**A separate, live defect sits under it and must be fixed first.** `armLandingLayout` is called on **both** arms — `:386` (build-from-design) and `:490` (generator). It arms `armLandInBimOnNextHouse`, which listens for `house.layout-executed`. That event is emitted from exactly one place, `HouseLayoutExecutor.ts:1861`. `apps/editor/src/ui/site/buildFromDesignExecutor.ts` contains **zero** occurrences of `emit`. So on the build-from-design arm the listener arms, nothing fires, and it expires silently after `ARM_TIMEOUT_MS = 10 * 60 * 1000` (`landInBimAfterCreateHouse.ts:59,136`). **L-13013 and L-13014 are already regressed on that arm today, for every user who *has* drawn rooms**, and both rows still read OPEN in the register.

**UNKNOWN: which door the founder used.** Both live UI doors reach the identical overlay, so the diagnosis of the *screen* is safe either way, but the edit site differs. **Cheapest probe:** the Q7 door leaves `data-arm` on `[data-testid="analysis-parcel-law-create-house"]` and prints, before the overlay appears, *"…a layout chooser will open when the variants are ready"* (`parcelLawCreateHouse.ts:494-495`). The onboarding door (`OnboardingStepController.ts:4123`, reached from `generateAndFinish` at `:4042`) prints neither. One screenshot of the panel behind the overlay settles it.

### 3.2 The fix

**Step 0 — the landing event. Do this first; it is independent of everything else.** Have `executeBuildFromDesign` emit an equivalent completion event (or widen `armLandInBimOnNextHouse` to accept one, keeping `HOUSE_BUILT_EVENT` as the house-pipeline key). Preserve the property the arm exists for: it must fire only on a **completed, successful** build, never on the pipeline promise and never on a refusal — the reason is recorded at `parcelLawCreateHouse.ts:485-489` and constrains L-13013/L-13014 from L-13020. Log it as its own L-number.

**Step 1 — retire the fall-through with an inert arm, not a fall-through to build-from-design.** At `:334`, when `design.ok && design.plan.rooms.length === 0`, return a new arm that renders the BIM button **disabled** with its refusal text pointing at Parcel Law question 4, *"What can I fit inside it?"* (`parcelLawQuestionGroup.ts:323-326`, slot at `parcelLawTab.ts:1216`) — the room-programme panel, whose output is exactly the `role:'room'` envelopes the sound arm consumes.

⛔ **Do not take the "fall through to build-from-design" option.** With zero rooms that arm produces **shell walls plus one slab per storey and nothing else**: `BUILD_FROM_DESIGN_WILL_NOT_CREATE` (`buildFromDesignPlan.ts:396`) names no roof, no stairs, no new project levels, no doors or windows, no rooms and no finishes, and with zero rooms the planner's own arithmetic yields zero partitions and zero ceilings. On a multi-storey plate that is a stack of sealed boxes with no stair, shipped under a button whose head still reads *"It draws a shell… and runs PRYZM's house pipeline"* and whose fourth-arm head hard-codes *"You have drawn a level envelope and room envelopes"* (`createHouseSection.ts:163`). Substituting a silently degraded product under the same button and the same promise is the same overstatement class as [[envelope-solid-overstates-partial-data]].

**Step 2 — the second UI door.** `OnboardingStepController.ts:4123` opens the same chooser from "Generate {typology}". Decide **explicitly** whether the founder's exclusion covers it, and whether it covers its three siblings on the same switch (`generateResidentialFromBoundary`, `generateOffice`, `generateApartmentFromBoundary`), which open the identical `alm-overlay` shape. Do not infer this.

**Step 3 — the console doors, for the record, not for change.** `houseLayoutTrigger.ts:33-36` registers `window.pryzmGenerateHouse` and `window.pryzmGenerateHouseFromBoundary` in production; both take the modal branch. They are console entries, not UI, and stay.

**Step 4 — copy and comments that become false the moment step 1 lands.** `createHouseSection.ts:60-63` ("then offers you the generated layouts to choose from"); `parcelLawCreateHouse.ts:494-495` ("a layout chooser will open…"); the three-arm contract doc at `createHouseSection.ts:129-135`; and the L-13250 comment block at `buildFromDesignPlan.ts:679-687`, which **records the fall-through as deliberately preserved** — amend it citing this instruction, never delete it silently. While in `parcelLawTab.ts`, fix the two stale comments calling the BIM step "question 6" (`:578`, `:1264`) against `ordinal: 7` at `parcelLawQuestionGroup.ts:382`.

**Step 5 — specs.** Amend, do not delete, `parcelLawCreateHouse.spec.ts:505` and `:769`, keeping the superseded reasoning beside the new arm with the founder's instruction quoted.

### 3.3 What it must not break

- **The landing into BIM (L-13013/L-13014).** Step 0 is the guard, and it must land before step 1 or the fourth arm inherits a silent regression that step 1 makes universal.
- **`HouseLayoutModal` / `HouseLayoutController` / `generateHouseFromBoundary` must not be deleted.** `generationChatSeam.ts` drives the same pipeline with `autoBuild: true` (no modal); `houseLayoutTrigger.ts` exposes the console entries; and `tools/ga-gate/generator-circulation-ledger.json` plus `tools/rac-conformance/certification/gates/*` sweep the engine directly. Deleting them breaks the RAC chat and turns ledger rows **stale**, which exits 3 — never absorbable as debt (§RATCHET-EXCEEDED-IS-NEVER-DEBT).
- **C80 runs first and unchanged.** `parcelLawCreateHouse.ts:296` returns the refusal arm before anything else, and the refusal arm renders a disabled button (`createHouseSection.ts:65-72`). The new inert arm must not be reachable around it — assert the ordering.
- **`generateHouseInExistingShell` registers no rollback by design** (it opens the chooser over a shell the *user* drew, `houseFromBoundary.ts` cancel path). If the cancel path is touched, do not give it one.
- **L-13020's cancel rollback stays.** Cancel today deletes the shell PRYZM drew and toasts *"No layout chosen… your level is exactly as it was"*, so removing the chooser from this door costs nothing on the dismiss side. Its ISSUE-LOG row still reads OPEN and should be corrected in the same commit.

### 3.4 The red-first test

1. **Fails today** — `decide()` with `design.ok === true` and `rooms.length === 0` returns the inert arm, and `deps.buildHouse` is **never** called. Today it returns `mode:'create-house'` with an enabled button.
2. **Fails today, independent of step 1** — drive `executeBuildFromDesign` through a fake runtime and assert the landing arm fires; today no event is emitted and the arm expires.
3. **Ordering** — a C80 `already-built` refusal still wins over the new arm.
4. **Copy** — the rendered section must not contain "offers you the generated layouts to choose from" or "a layout chooser will open" on the arm where no chooser can open.
5. **Comment-stripped source arm** — assert `buildFromDesignExecutor.ts` contains a real `emit(` call outside comments. The file's neighbours discuss `house.layout-executed` in prose; a naive `toContain` would match the discussion.

---

## ORDER OF WORK

Ranked by (founder-visible improvement) × (low risk).

1. **Defect 3, Step 0 — emit a landing event from `buildFromDesignExecutor`.** Highest value per unit of risk in the whole plan: it is a live regression on the arm a user with rooms already uses, it closes two rows that have read OPEN since 2026-09-06, its blast radius is fully established, and it makes Defect 3's real fix genuinely small. Nothing depends on a founder decision.
2. **Defect 2, Step 1 — pass the per-storey wall census from the chat seam** (plus exporting the panel's census as the one producer). One line of behaviour change, closes a silent duplicate-wall defect on the exact surface L-13250 came from, and it is the mechanism most likely to *be* what the founder photographed.
3. **Defect 2, Step 2 — the false "on the level you are viewing" report line.** One string; false today before any other fix.
4. **Defect 1, Edit A — `authoredCard` on the `refused` fold arm.** Five-line diff, no contract question, and it is the only instance of Defect 1 whose reachability is provable without a browser: today a Generate click on a degenerate determination deletes the Draw button from under the user.
5. **Run the three probes** (§1.1 console line / chip; §2.1 wall count per level and the presence of the "Builds: N storeys" line; §3.1 `data-arm` + status sentence). Each is one screenshot or one console line and each eliminates work below.
6. **Defect 1, Edits B and C** — the no-envelope arms, gated by the predicates already in the file, plus the stage-state field. Blocked on the §1.1 probe for scope and on one founder question (the `legallyGrounded` sub-arm).
7. **Defect 2, Steps 3–6 — the explicit `storeyScope`, its surface, and the spec moves.** Real work, spec-neutral by design, but it is a product decision dressed as a filter and should follow the probe.
8. **Defect 3, Step 1 — the inert arm.** Last of the three, because it needs the founder to choose between "refuse until rooms exist" and "keep generating but with a non-modal picker", and because it is strictly safer once Step 0 has landed.

**What I would not do yet:** `createHousePlan.ts:243` (`storeyCount = Math.max(1, sorted.length)`), listed in the Defect 2 dossier as the twin. On the panel path it is a **no-op**: `parcelLawCreateHouse.ts:334` reaches the generator arm only when `rooms.length === 0`, which is precisely the case where any storey-scope rule would build all plates anyway. It is live from onboarding and the console — but Defect 3, Step 1 may retire that arm from the panel entirely and Step 2 may retire it from onboarding. Writing a scope rule into a generator that is one decision away from being removed from both surfaces is work with a live chance of being deleted before it ships.