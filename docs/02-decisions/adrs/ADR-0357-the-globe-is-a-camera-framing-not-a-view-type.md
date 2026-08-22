# ADR-0357 — The 3D Globe is a camera framing, not a view type

**Status:** ACCEPTED
**Date:** 2026-08-22
**Lane:** GLOBE32 · `§GLOBE-QUICK-TOGGLE` · L-6800..L-6808
**Contracts:** [C59](../contracts/C59-MULTI-PANE-VIEW-SYSTEM.md) §2 · [C60](../contracts/C60-SITE-ENTRY-AND-JURISDICTION-COVERAGE.md) §6.5/§6.10
**Neighbours:** C19 §1.3/§1.4 (the one-shot parcel boundary), C06 §13 (`gisActionRegistry`), C84 EI-8/EI-9 (one vocabulary)

---

## Context

**Founder, 2026-08-22:** *"add in the top panel buttons **3d globe** also."*

He is looking at the top-centre segmented control that reads
`▦ 2D Site Map | ◉ 3D Site | ◧ Split`, mounted by `SiteAuthoringPaneShell` during site
authoring.

**He asked for this once before, and the request is quoted verbatim in the source of the
file that failed to deliver it** —
`apps/editor/src/engine/views/siteViewQuickToggleModel.ts:5`, dated 2026-08-21:
*"at this stage the user should be able to just go to 3D globe, so a button 3D globe / 3D
site in the middle top would be beneficial."* That file's header calls itself *"the PURE
decision half of the top-centre **3D globe / 3D site** control"*, and it shipped with two
segments and no globe.

### The first question is why, and the answer is not "someone forgot"

Two design commitments, each individually correct, **forbid each other**:

1. **The segment set is DERIVED, not listed.** `describeSiteViewQuickToggle()` maps
   `VIEW_TYPE_REGISTRY` filtered by `SITE_RENDERER_KINDS = {maplibre, cesium}`. The module
   header states the reason plainly: a hand-written `['site-map-2d','site-3d']` would be a
   second census beside the registry, and *"this repo's own finding is that censuses rot"*
   (C01 §6 rule 6). **A globe segment therefore requires a globe `ViewType`.**

2. **C60 §6.10 forbids that `ViewType`** — normative, ratified:
   > *"The entry flow is a STATE of the `site-3d` view, not a new view mechanism (C59
   > §0/§2.6). It adds no `ViewType`, no renderer and no pane framework."*

   …because C60 §6.5 is also normative:
   > *"ONE Cesium instance (C59 §2.1). The globe and the 3D Site are the **same viewer at
   > different camera altitudes**."*

So the derivation **could never have produced a globe segment**, and no amount of care
during the 2026-08-21 pass would have caught it — the bug was that the header promised a
capability the derivation structurally excludes.

### ABSENT versus UNREACHABLE — the two halves have different causes and opposite fixes

- The globe **CONTROL** in this bar was **ABSENT**, for the structural reason above.
- The globe **SUBSYSTEM** is fully built and **UNREACHABLE**. `siteEntryModel.ts` (the
  `world → country → city → parcel` reducer), `siteEntryStore.ts` (the store + camera
  port), `globePlacementDecisions.ts` and `SiteEntryPanel.ts` all exist and are
  unit-tested — but **`new SiteEntryStore` has exactly ONE production call site**,
  `apps/editor/src/ui/onboarding/GlobeHeroSearch.ts:144`. The globe is reachable during
  onboarding and nowhere else.

Had the diagnosis been "UNREACHABLE" alone, the fix would have been to surface the entry
flow mid-project. **That fix would have been actively dangerous** — see Decision 2.

---

## Decision

### 1. The globe is an ACTION beside the segments, never a fourth segment

`SiteViewGlobeAction` is modelled next to `segments`, mirroring the `SiteViewSplitAction`
(`◧ Back to split`) that was already modelled that way for the same reason: **it is a
thing you do, not a view you host.**

The rival design — registering `site-globe-3d` as a second `cesium`, `singleton: true`
view type — was **rejected on a measurement, not a preference** (L-6802):

```
assignViewToPane(EMPTY, RIGHT, 'site-3d')  →  {left: null,           right: 'site-3d'}
assignViewToPane( …  , LEFT,  'site-globe-3d')
                                           →  {left: 'site-globe-3d', right: 'site-3d'}
validatePaneLayout(…)                      →  {ok: false,
                                               conflicts: [{rendererKind:'cesium',
                                                            panes:['left','right']}]}
```

`assignViewToPane` vacates a singleton's *previous pane* only when the view type is **the
same**. Two different `cesium` singletons therefore do not vacate each other, the pure
algebra yields an invalid layout, and only `PaneLayoutStore.guard()` catches it — as a
**rejection of the user's click**. In the founder's own default split (2D map left, 3D Site
right) the globe button would have refused **every** time it was pressed. The measurement
is pinned as a test rather than recorded as prose, so the decision is re-provable.

**Consequence:** the segment set stays exactly `['site-3d', 'site-map-2d']`, and a test
fails if a later pass "simplifies" the action into a segment.

### 2. It reuses C60's PROJECTION and refuses C60's REDUCER

A globe button that opened a `SiteEntryStore` mid-project would put the user back at the
top of a machine whose terminal intent (`site.entry.select-parcel`) emits `site-handoff`.
**The parcel boundary is a ONE-SHOT IMMUTABLE polygon** (C19 §1.3/§1.4, restated in
`siteEntryModel.ts`'s own header). A user who pressed a *camera* button and then kept
zooming would be walking toward re-committing the site of a project that already has one.

So the action moves the camera and nothing else. `siteEntryModel.ts` gains one export:

```ts
export function worldFramingTarget(): SiteEntryCameraTarget {
    return cameraForState(INITIAL_SITE_ENTRY_STATE);
}
```

— the **declared** world framing (`WORLD_HOME`, `SITE_ENTRY_ALTITUDE_M.world`,
`SITE_ENTRY_PITCH_DEG.world`), produced as a value with no state, no effects list, no port
and no intent that could ever reach the hand-off. The editor acquires **no stage machine**:
"show me the whole Earth" is one framing, not four stages.

This also keeps the C60 header's own invariant intact — *"STAGE IS A CAUSE, NOT AN EFFECT.
The camera is a PROJECTION of the stage"* — because the framing is still derived from a
declared state, never sniffed from a live camera.

**Pinned as a property, not a promise:** a test enumerates every (layout × framing ×
return-availability) input and asserts no `site.entry.*` intent is producible.

### 3. Two intent namespaces, because there are two ports

| What changes | Intent | Owner |
|---|---|---|
| which view is on screen | `view.pane.assign` / `view.pane.solo` | `PaneLayoutStore` (unchanged) |
| where the one camera looks | `view.site.frame-globe` / `view.site.frame-site` | an injected camera port |

`PaneLayoutStore` has no altitude state and must not grow one. The camera intents are
**payload-free**: C60 depends on C59 (C60 §7), so a C59 chrome module importing C60 to fill
in a lat/lon/altitude would invert that edge. The model names *which* framing; the port —
the C60-aware adapter in the composition layer — supplies *what it is*.

**The pane half of a globe click is `segmentClickIntents` itself, not a copy of it.** "Show
me the globe" first means "put the 3D Site on screen, alone" — precisely what clicking
`◉ 3D Site` means, and precisely what C60's own `siteEntryPaneIntent()` already requests
(assign + solo; C59 §2 invariant 5 — no live BIM pane behind a photoreal globe on the
founder's WebGL box). Delegating inherits the no-churn rules for free and makes it
impossible for the two controls to disagree about how a view reaches the screen.

### 4. The return path is the same button, and it gates the way OUT

The control flips between `⊕ 3D Globe` and `⤢ Back to site`. The return dispatches the
**one declared `site.zoom-to-site` action** from `gisActionRegistry.ts`, whose entire reason
for existing is that *the ACTIVE SURFACE decides the target* — re-deriving a "fly back to
the site" target here would be a third copy of the thing that registry de-duplicated.

**When that entry point is unregistered, the OUTBOUND click is refused with a reason.** The
gate is on the way out, where refusing costs nothing, rather than on the way back, where
refusing strands the user at 20,000 km. That is the L-942 shape — *"a gate whose 'yes'
branch awaits a decision is a REGRESSION with a contract citation attached"* — inverted into
a rule.

### 5. The framing bit is the control's memory of its own command

`globeFraming: 'site' | 'world'` is held by the bar and written in exactly one place: after
the camera intent for that framing has been forwarded to the port. It is the exact analogue
of `PaneLayoutStore._splitMemory`, which is what makes `◧ Split` work.

**It is not a camera reading**, and `siteEntryModel.ts` already disqualified that:
*"IT FLAPS. Altitude is continuous and the user's hand is not steady."*

**Stated so nobody "fixes" it:** if the user grabs the globe and flies somewhere by hand,
this value does not move. That is not a lie, because `SiteViewGlobeAction` describes **what
the click does**, never where the camera is — and both labels stay true and useful under any
hand-flown camera. A port that throws leaves the memory untouched, so the label never claims
a move that did not happen.

---

## Alternatives rejected

| Alternative | Why rejected |
|---|---|
| A `site-globe-3d` `ViewType` | Breaches C60 §6.10 outright, **and** is reachably broken — measured conflict above (L-6802). |
| Mount a `SiteEntryStore` in the editor | Re-opens the path to `site-handoff` against a ONE-SHOT immutable boundary (C19 §1.3/§1.4). Decision 2. |
| Reuse `gisActionRegistry`'s existing `site.globe` row | That row is `pryzmShowSiteResultView('3D')` — the **post-generate photoreal RESULT view with the building placed**, a different surface from the site-authoring split the founder is looking at. The registry's own comment already flags this confusion: *"NOT the same action as `site.earth`, despite the names."* Surfacing it here would put a third meaning on one phrase. |
| Read the camera altitude to decide the label | Explicitly disqualified by `siteEntryModel.ts`'s header (flapping; stage is a cause). Decision 5. |
| Let the DOM layer decide the sequencing | C59 §2 invariant 3 — a click never touches a renderer or `MultiPaneController`. `globeClickIntents()` returns DATA. |
| Emoji 🌐 for the glyph | The bar's family (`▦ ◉ ◧`) is monochrome geometric (C06 §6.1) and the brand is white + purple, no black; an emoji would be the only colour in the bar. `⊕` reads as a graticuled sphere. `⤢` is **not a new mark** — it is the glyph `gisActionRegistry` already declares for `site.zoom-to-site` (C84 EI-8/EI-9). |

---

## Consequences

- The founder gets `▦ 2D Site Map | ◉ 3D Site | ⊕ 3D Globe | ◧ Split` in the top-centre bar
  during site authoring, one click to the whole Earth and one click back.
- **Mid-project safety is a tested property, not a review promise.** No `site.entry.*`
  intent is producible from this control under any input.
- `siteEntryModel.ts` gains one pure export and no behaviour. The C60 reducer, store,
  panels and coverage machinery are untouched.
- **The globe subsystem remains UNREACHABLE outside onboarding.** This ADR surfaces the
  globe *framing*; it does not re-host the entry *flow*. Anyone wanting the staged
  `world → country → city → parcel` descent mid-project must first answer what happens to
  the already-committed boundary — that question is open, and Decision 2 is why it must be
  answered before the flow is surfaced, not after.
- **WebGL:** the founder's box runs the WebGL fallback, and `frameGlobe` issues the SAME
  `CesiumViewport.flyToGeographic(worldFramingTarget())` call the onboarding globe already
  makes on every project start (`SiteEntryStore.frameCurrent()`). Its behaviour there is
  established by existing use, not assumed by this ADR.

## Verification

Foreground, at authoring time:

- `npx vitest run apps/editor/src/engine/__tests__/siteViewQuickToggle.spec.ts` → **44/44
  PASS** (was 20/20; +24 arms), including a **reachability** arm that mounts the real bar
  against the real `PaneLayoutStore` and clicks the real button — this repo's most-repeated
  defect is a fix that runs nowhere.
- `PaneHost.spec.ts` + `PaneViewPicker.spec.ts` + `shellFloatBudget.spec.ts` → **51/51 PASS**.
- root `tsc --noEmit --skipLibCheck` → **2 errors, both in another lane's untracked
  `plantools/__tests__/zzprobe.spec.ts`; ZERO in this lane's files.** ⚠ That is a reading
  with a timestamp, not a state — re-run it.
- **NOT founder-verified live.** The bar mounts only inside `mountSiteAuthoringPanes()`, so
  the on-screen check is: open a project → site-authoring split → the top-centre bar.
