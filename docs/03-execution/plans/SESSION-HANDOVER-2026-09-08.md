# SESSION HANDOVER — 2026-09-08

**Started from a stopped session** carrying ~4,350 uncommitted lines across seven parallel lanes
(root tsc was RC=2, several lanes had collided). All recovered, reconciled, committed, and — see
§1 for the exact SHA — deployed.

## 1. LIVE STATE — VERIFY BEFORE TRUSTING ANYTHING BELOW

Run `bash tools/deploy/fly-bundle-proof.sh <sha>` for whichever of these two is confirmed live —
check `/tmp/deploy3.log` (this session's last deploy attempt) or `flyctl releases -a pryzm` for the
actual outcome; it was still finishing green-machine health checks when this session closed:

- `74686678190de9e5028645ee83885933acf422cc` — the project-isolation fix (§3, the critical one)
- `30fcac21` — the envelope-card text-compaction fix, on top of the above

If NEITHER proves live, the last confirmed-live build is `2be0f970` (proven earlier this session,
6/6). **Do not assume either new commit is live — prove it first.**

## 2. NINE COMMITS THIS SESSION, IN ORDER

| SHA | What |
|---|---|
| `08ef2fd1` | Parcel Law: ROOMS becomes question ④, discreet when empty; fixes a double-add-on-drop bug found while building it |
| `bf2c3f6e` | Project Hub: all four modals get white glass (not just Delete); Delete gains Escape/backdrop/focus |
| `04887ea5` | Site: "Create BIM from this design" builds walls+slabs+ceilings on EVERY storey (was active-level-only) |
| `32233c79` | RAC chat: "create walls/slabs/ceilings from my envelope" reaches the same builder as the panel button |
| `afc5ce4c` | Site: the scope panel (D4, "too big") folds to half its footprint |
| `df4cded6` | 3D Site: rectangular scope stops drawing a CIRCLE of buildings — cap ORDERING fix, no constant raised |
| `2be0f970` | docs: Abu Dhabi cadastral parcel sourcing survey |
| `74686678` | **fix: project isolation** — 8 element families (envelopes, pools, lifts, balconies, etc.) survived a project switch and got auto-saved into the NEXT project |
| `30fcac21` | fix: Envelope-tool card — a 6-storey replace printed 6 near-duplicate paragraphs, one of them WRONG (repeated "ONE undo" when the whole gesture is genuinely one) |

Root tsc RC=0 on every commit, verified on both the main tree and the deploy worktree (§6.9.2).

## 3. ⭐ THE PROJECT-ISOLATION BUG — READ THIS FIRST NEXT SESSION

Founder reported it live, with console attached: opened a **brand-new empty project** and watched
it draw, then **auto-save**, 15 space envelopes belonging to the PREVIOUS project. His own log:

```
[ImportProjectCommand] Loading 0 walls / Load complete: 0 loaded, 0 failed
[space-envelope] drew 15/15 authored envelope(s)
[C13 VIOLATION] Project-isolation leak — scene.foreignElement×16
[ProjectSerializer] Snapshot created: 15 elements
[PlatformSaveController] Version saved: "Auto-save" (15 elements)
```

**Root cause:** `ClearProjectCommand` clears ~16 hand-written stores, then `projectScopeRegistry
.clearAll()` — the mechanism C45 built to close the gap between the serializer's ~34 stores and
that list. Eight plugin-DTO families (`bathroomPod, lift, liftPart, pool, water, balcony,
component, spaceEnvelope`) are new-style stores on `runtime.stores`, not `window.<x>Store`
globals — so the hand-written list never named them, and nothing ever registered them with the
scope registry. **Fixed** by registering all eight into `projectScopeRegistry` inside the ONE
array in `composeRuntime.ts` that already holds their keys (`packages/runtime-composer/src/
composeRuntime.ts`) — a 9th family added there is now project-scoped on the same line that makes
it reachable at all. Guarded by `packages/runtime-composer/src/__tests__/
pluginDtoStoresAreProjectScoped.spec.ts` (reads the keys out of the real source, so it cannot
drift). **NOT browser-verified** — the unit spec proves the mechanism; nobody has switched
projects on the deployed build and confirmed the previous project's envelopes are gone. **Do
that first**, with the founder if possible — it's the single highest-value verification available.

## 4. THE FOUNDER'S OPEN ASKS, IN THE ORDER HE RAISED THEM

### 4a. Envelope tool card — "make it 20% of the space with dropdowns the user opens on demand"
**Half done.** The text-bulk cause (6 repeated paragraphs) is fixed in `30fcac21` — see the commit
message for the exact mechanism. **NOT done:** the panel is still a fixed 340px in
`apps/editor/src/ui/site/siteEnvelopeTool.ts:195` (`width:340px`), and none of its sections
(draw / create / status) are collapsible. The Parcel Law tab already has a mature disclosure
primitive — `buildQuestionGroup` in `apps/editor/src/ui/analysis/parcelLawQuestionGroup.ts`
(a `<details>` with a digest-mirror pattern, session-scoped open/closed memory) — but it is styled
for that tab's type scale, not this floating white/violet panel. Two real choices: extract a
lighter, panel-scoped `<details>` wrapper matching `siteEnvelopeTool.ts`'s own styling, or widen
`buildQuestionGroup`'s reach. Either way, **"20% of the space" was the founder's literal number —
ask him whether that means 20% of the viewport width or the current split-pane width** before
picking a target px, since the panel currently sits over the RIGHT (3D) pane specifically.

### 4b. Per-level height editing — "let the user set/change level heights and see it update in 3D"
**Not started. The solver already exists and is proven live elsewhere:**
`SetLevelHeightCommand` (`packages/command-registry/src/levels/SetLevelHeightCommand.ts`, ADR-0345)
— cascades every level ABOVE the edit by the delta as ONE undo unit, refuses (never clamps) an
inverted stack, already wired to the bus (`level.update` exists but is a DIFFERENT command —
`SetLevelHeightCommand` is dispatched directly via `commandManager`, see
`apps/editor/src/ui/levels/LevelManagerPanel.ts:196` and `PropertyPanel.ts:1277` for the two live
callers). **The work is exposing an editable height control from the Site-view envelope card** (or
wherever makes sense for this surface) that dispatches the same command — do NOT build a second
height-edit path. **Read the whole command header first** — it documents exactly what
"below levels shall adapt" does and does not mean, and the founder used almost those words.

### 4c. Three envelope categories everywhere (Project Browser / Inspect / Analysis / rail)
**Investigated, not built.** The taxonomy the founder described — Buildable envelope (purple,
"what can be built") / Level envelope ("what we design on Site") / Rooms — **already exists as
data**: `ENVELOPE_LEGEND` in `apps/editor/src/ui/site/toBeBuiltEnvelopeStyle.ts:185` names exactly
these three (`permitted` / `to-be-built` / `room`), with the "only `permitted` carries a
confidence badge" rule encoded as DATA rather than a branch. **It is consumed in exactly one
place** — a legend inside the site card (`envelopeCardSections.ts`). The element-family authority
for the Project Browser + Inspect (they share one source: `INSPECT_CATEGORIES` in
`apps/editor/src/ui/inspect/audit/inspectCategories.ts`, with `projectTreeModel.ts` explicitly
"deriving, not re-listing") does not carry `spaceEnvelope` at all — and its own coverage gate
(`InspectCategoryCoverage.test.ts`) is BLIND to it, because that gate reads `window.<x>Store =`
assignments off the engine bootstrap, and `spaceEnvelope` is wired the new way, on
`runtime.stores.spaceEnvelope`. **That gate blindness is the durable bug** underneath "why did
this never get done" — fixing it is what stops the next runtime-store family from silently
missing every element-facing surface the same way. **Design decision needed from the founder
first:** is `permitted` (one solved STUDY volume per parcel, not a per-instance element) meant to
appear in the Project Browser tree at all, or only Level-envelope and Room? A tree row implies
"an instance you can select," which a study volume is not.

### 4d. "True-height buildings adapt to the scope bar" (from a pasted console log, not yet scoped)
**Not investigated.** The founder's ask, read off the pasted log: shadow-casting/true-height
buildings are currently limited to a smaller fixed radius (`§FEAT-FORMA-CONTEXT-NEAR-CAP`, the
"near ring tiered ... within 600 m of a 600 m ceiling" line) independent of the scope-bar radius
he sets at the bottom of the 3D-Site view. Start by reading that constant's definition in
`contextExtentBudget.ts` and checking whether it is meant to scale with `scopeOuterRadiusM` the
way `df4cded6`'s plate-fill spending policy already does for the far tier — this may be the exact
same class of "constant vs. scope-scaled" defect that lane just fixed for a different tier.

## 5. LOOSE ENDS RECORDED, NOT CHASED

- `describeLevelEnvelope` (`apps/editor/src/ui/site/levelEnvelopeSupersession.ts:262`) appends
  `· {area} m²` unconditionally whenever `footprintAreaM2` is set — so a name that already embeds
  an area string (the real production shape: `"Level envelope · Ground · 310 m²"`) prints the area
  TWICE wherever this describer is called. Found writing the `30fcac21` regression pin, not fixed
  (out of scope for that commit). Affects every caller of `describeLevelEnvelope`, including the
  blocked-sentence path in `resolveLevelEnvelopeSupersession`.
- Two pre-existing red suites, confirmed unrelated to every commit this session (zero diff
  overlap): `set-curtain-wall-dimensions` / fan-out-ceiling in `packages/ai-host`, and the
  `shellWallMatch` layout failures in the same package.

## 6. NEXT-SESSION PROMPT (paste verbatim)

> Resume from `docs/03-execution/plans/SESSION-HANDOVER-2026-09-08.md`. First: run
> `bash tools/deploy/fly-bundle-proof.sh` and `flyctl releases -a pryzm` to find out which SHA is
> actually live (§1) — the last deploy was still finishing its green-machine health check when the
> session closed, so do not assume.
>
> Then, in priority order: **(1)** verify the project-isolation fix (§3) end-to-end — switch
> projects on the live build and confirm the previous project's space envelopes, pools, lifts,
> balconies etc. are gone, not just that the unit spec passes. **(2)** Finish the founder's
> Envelope-tool card ask (§4a) — the text bulk is fixed, the WIDTH and the collapsible sections are
> not; ask him to confirm "20% of the space" means before picking a number. **(3)** Wire per-level
> height editing (§4b) onto the existing `SetLevelHeightCommand` — do not build a second solver.
> **(4)** The three-envelope-category taxonomy (§4c) needs a founder decision on whether
> `permitted` belongs in the Project Browser tree before any code moves. **(5)** Scope and possibly
> fix the true-height/scope-bar mismatch (§4d).
>
> Standing rules: architecturally sound, no shortcuts, read the gates never the docs, commit each
> green step with explicit paths (never bare, never `-A`, never stash), root tsc before every
> commit, deploy per `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md` §6.9.2 (typecheck the
> DEPLOY WORKTREE, not the main tree) and ALWAYS run the bundle proof before calling anything live.

---

## 7. LATE ADDITIONS (after §1–§6 were written)

Three more commits landed after the first wrap-up, all on founder reports:

| SHA | What |
|---|---|
| `30fcac21` | Envelope-tool card: a 6-storey replace printed SIX near-duplicate paragraphs, one of them stating the undo cost WRONG six times |
| `6399ab4f` | **§SHELL-WITHOUT-ROOMS** — a level envelope with NO rooms now builds the shell + floor plate instead of refusing; plus the missing `generation.from-envelope` sync disposition |
| (this) | `panelFold.ts` — the disclosure primitive for the card's dropdowns, BUILT BUT NOT YET WIRED |

### 7a. ⚠ `panelFold.ts` IS BUILT AND WIRED TO NOTHING — finish this first
`apps/editor/src/ui/site/panelFold.ts` is complete, typechecks, and is imported by
**nobody**. It is `buildPanelFold({id, summary, open})` → `{el, body, setSummaryNote}`, a
`<details>` styled for the floating white/violet Site panel, reusing the SHARED session fold
memory (`questionGroupFoldIsOpen` / `setQuestionGroupFoldOpen`) so it is an INSTANCE of the one
disclosure mechanism and not the sixth `C115-91` forbids.

**The wiring that remains** — this is the founder's *"20% of the space with drop down menus the
user opens on demand"* ask, and it is the thing he has now asked for twice:
- `apps/editor/src/ui/site/siteEnvelopeTool.ts` — panel is still `width:340px` (~line 195).
  Fold the `lede`. Narrow the panel.
- `apps/editor/src/ui/analysis/parcelLawEnvelopeAuthoring.ts` — root children are
  `heading, sourceLine, discardDrawnBtn, entryRow, intentLine, statusLine, addLevelsBtn,
  addLevelsNote, advisoryLine, createdList` then `lawLede, lawSlot` (see the `root.append(` call
  ~line 851). Fold `sourceLine` (the long STUDY prose) and the `lawLede + lawSlot` pair
  ("How much of the allowance have you used?" / "Where these allowances come from").
- ⛔ **DO NOT fold** `intentLine`, `statusLine`, `advisoryLine`, `addLevelsBtn/Note`, or the
  draw/create controls. Those are refusals, warnings and the primary actions — `panelFold`'s own
  header records why (C58 §1.2: a collapsed section may hide explanation, never a refusal or a
  figure's confidence). `setSummaryNote` exists for the one fact that must survive collapsing.

### 7b. STILL NOT STARTED
- Per-level height editing (§4b) — `SetLevelHeightCommand` is the solver, do not build a second.
- The three-envelope-category taxonomy (§4c) — needs the founder's ruling on whether `permitted`
  belongs in the Project Browser tree.
- True-height buildings adapting to the scope bar (§4d).

---

## 8. ⭐⭐ §ONE-VIEW-SWITCHER — THE FOUNDER'S #1 ASK, DIAGNOSED TO THE LINE, NOT BUILT

**He has now asked THREE times** (*"I requested that already - i want always the same drop
down"*). Do this first. The diagnosis below is complete — no re-investigation needed.

### What he wants (his four screenshots)
- **WRONG (images 1–2):** in the PRYZM/BIM canvas he gets a horizontal SEGMENTED STRIP —
  `[2D Site Map][2D Satellite][3D Site][3D Globe][3D PRYZM][2D PRYZM]` + a `Current view: … (read
  at 11:57:38 AM — a snapshot…)` line + a full-width `⊞ Split` button — plus the legacy top bar
  (`Level 6` · Grid · IFC · V/G · INTENT · Architectural Docume… · Range · ✕).
- **RIGHT (images 3–4):** the PILL — a small centred `▪ 2D Site Map ▾` on the left pane and
  `● 3D Site ▾` on the right — opening the rich popup: **SHOW IN THIS PANE** (the six, each with
  its own explanation, including the honest "there is only one cesium instance, so the two panes
  SWAP" note), **MORE VIEWS** (Elevation, Section), then ⇄ Swap panes · ⛶ Full screen · ◧ Back to
  split · × Empty this pane.
- **And he wants it EXTENDED:** *"on pryzm view this drop down shall extend to level views also
  and elevations"*.

### The measured cause — THREE different switchers, and the retirement only covers two
1. **The pill (correct)** is `mountPaneViewPicker` (`engine/views/PaneViewPicker.ts`), mounted
   **ONLY** by `engine/views/SiteAuthoringPaneShell.ts:606-607` (`corner:'top-center'`, one per
   pane). That is why it exists during site authoring and nowhere else.
2. **`§ONE-VIEW-SWITCHER` (L-13160) ALREADY SHIPPED, PARTIALLY.**
   `engine/views/legacyViewSwitcherRetirement.ts` is a complete, excellent model of this exact ask
   (it quotes the founder verbatim) and IS wired — `GISAreaLayout.ts:1649` calls
   `retireLegacyViewBars` from `activateView`, and `:2053` from `applyBimDualPane`; it mounts a
   centred `ViewSwitcherPill` via `ensurePryzmViewPill` (`GISAreaLayout.ts:1930+`).
   ⛔ **But `retireLegacyViewBars` only removes `resultToggle` and `formaToggle`.**
3. **THE STRIP IN HIS SCREENSHOT IS NEITHER OF THOSE.** It is `viewSegmentSwitcher.ts` (its
   `Current view: … a snapshot; press a segment` copy is at `viewSegmentSwitcher.ts:334`), and it
   is mounted by **`ui/analysis/parcelLawTab.ts`** — `mountSwitcher: mountViewSegmentSwitcher`
   (`:607`), invoked at `:882-892` under a comment that reads *"SAME CONTROL, DIFFERENT PLACE"*.
   **Nothing retires it**, so it rides into the PRYZM views with the Parcel Law panel.

### The work
- Make the Parcel Law tab's switcher placement use the PILL, not the segmented strip — or have
  `retireLegacyViewBars` also stand the strip down on `pryzm-view` (it already stands the pill
  down when a bar owns the region: `mountResultToggleBar` calls `removePryzmViewPill()` at
  `GISAreaLayout.ts:2215`, so the "one region, one switcher" convention to follow is established).
- Extend the popup to LEVEL views and ELEVATIONS. `paneViewOptions.ts` already has a **MORE VIEWS**
  section carrying Elevation and Section, and `PaneViewPicker.ts:567` renders it — so this is
  extending an existing section, NOT a new table. ⛔ `viewPanelOptions()` is the ONE definition of
  the six; do not mint a seventh copy (the retirement file says so explicitly).
- ⛔ **KEEP** `SplitViewManager.ts:454-462`'s `Ground Fl…` view-definition select until the
  dropdown genuinely reaches sections/elevations — it is currently the ONLY route to them, and
  `shellFloatBudget.spec.ts:317-320` fails closed on it.
- The guard suite already exists: `engine/__tests__/oneViewSwitcher.spec.ts`.

### Why it was not built this session
Diagnosed at the very end, with the session's credit budget essentially spent. Starting the edit
without room to run `oneViewSwitcher.spec.ts` + the shell-float budget spec + a deploy would have
left a half-wired switcher on the founder's critical path — the same "authored but unwired" shape
this file already records twice. **The analysis above is the expensive part and it is done.**
