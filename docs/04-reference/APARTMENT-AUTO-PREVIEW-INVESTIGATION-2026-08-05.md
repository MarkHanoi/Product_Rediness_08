# Apartment auto-preview / residential-building interior-wall investigation (2026-08-05)

## Summary of findings

**This is NOT a stub/placeholder-by-design situation.** Both the setup-wizard preview and the
real "Generate residential building" path are wired to run the actual D-TGL deterministic
room-layout engine per apartment, end-to-end, with no early-return / no reused schematic
polygon standing in for the real design. A live diagnostic run (below) proves the engine
produces genuine multi-room, multi-door apartment layouts. I could **not** reproduce the
founder's "walls = copy of the preview blob" symptom from the pure orchestrator layer alone —
the divergence, if real on the founder's actual site, is either (a) a legibility/visual-quality
artefact of the D-TGL engine's rectilinear squarify tiling (genuinely computed, but boxy), or
(b) a silent per-apartment build failure specific to the founder's actual (possibly irregular /
rotated / oddly-sized) parcel that my synthetic rectangular test didn't trigger. See "Open
uncertainty" at the end.

## 1. Where the preview lives

- Wizard modal: `apps/editor/src/ui/onboarding/OnboardingStepController.ts` —
  `renderResidentialProgramStep` (title "Set up your residential building",
  `apps/editor/src/ui/onboarding/OnboardingStepController.ts:1276`).
- Plan preview + circulation graph rendered by `renderPreviewForLevel`
  (`OnboardingStepController.ts:1588-1627`), fed by a **debounced LIVE re-run of the real
  orchestrator** on every slider/chip change (`renderLivePreview`, `OnboardingStepController.ts:1629-1692`,
  calling `orchestrateResidentialBuilding` at `OnboardingStepController.ts:1640`). This is the
  same pure function (`packages/ai-host/src/workflows/residentialBuilding/residentialBuildingOrchestrator.ts`)
  used by the real Build path — **not** a cheap/fake preview stub.

## 2. The plan-preview thumbnail genuinely threads real rooms

`apps/editor/src/ui/residential-building/residentialPlanThumbnail.ts:167-190`
(`buildResidentialPlanDescriptor`) reads `c.layout?.rooms` off each placed apartment cell and
emits `subRooms` (room polygons, mm→m converted) into the shared `BuildingPlanDescriptor`. The
shared renderer `apps/editor/src/ui/preview-kit/buildingPlanSvg.ts:126-146` draws each `subRoom`
as its own tinted polygon with a partition stroke when `subRooms.length > 0`, falling back to a
flat box **only** when a cell carries no room detail. This is real, working code
(`git log` shows it shipped in `23eba230 feat(preview): §BUILDING-PREVIEW-QUALITY — building
preview renders each apartment's internal rooms (house-grade)`).

**Caveat on the wizard screenshot:** `TYPO_FILL` (T1-T4) and `ROOM_FILL` (kitchen/bedroom/
bathroom/…) in `residentialPlanThumbnail.ts:29-51` are all very pale, closely-spaced purple
tints, and the partition stroke between rooms is only `0.8` px
(`buildingPlanSvg.ts:141`) at a scale where a whole multi-floor building's plan is drawn in one
small thumbnail. It is plausible the room subdivisions ARE being drawn but are not legible at
that size/colour contrast — this is a design/legibility issue, not a missing-data issue, if so.

**The "Circulation · core + N units" bubble diagram is intentionally building-level, not
room-level** — confirmed by its own header comment
(`apps/editor/src/ui/residential-building/residentialCirculationGraph.ts:1-14`, "each
apartment CELL is a node, the central CORE … is the hub"). It is a deliberate schematic (the
sibling of the house's room-level Living Graph, but at the building scale), not a bug.

## 3. The real Build path also runs the real engine per cell

`ResidentialBuildingController.request` → `orchestrateResidentialBuilding` (same pure function)
→ opens `ResidentialBuildingModal` → on "Build this building",
`ResidentialBuildingExecutor.execute` (`apps/editor/src/ui/residential-building/ResidentialBuildingExecutor.ts`).

Per-apartment interior walls come from `apt.layout` — the **actual** `ScoredLayoutOption` the
orchestrator's per-cell D-TGL run produced — not from the packer/partition's schematic cell
rectangle:

```
apps/editor/src/ui/residential-building/ResidentialBuildingExecutor.ts:491-527
for (const apt of perLevel.apartments) {
    if (apt.status !== 'ok' || !apt.layout) { rejectedCount++; continue; }
    ...
    const set = buildLayoutCommands(apt.layout, opts, (p: IdPrefix) => createId(p));
    apartmentBuilds.push({ levelId, set, option: apt.layout, entryDoor: perimeter.entryDoor });
```

`buildLayoutCommands` (`packages/ai-host/src/workflows/apartmentLayout/executePlan.ts:537`) is
the SAME shared, frozen function the single-apartment and house generators use. Interior
partitions are NOT dropped by `skipExteriorWalls` — that option only filters walls flagged
`isExternal` (`executePlan.ts:321`), i.e. only the cell's own perimeter (already built
separately as `cellPerimeterPayloads`, `ResidentialBuildingExecutor.ts:494-500`) is skipped;
interior partition walls always pass through.

The per-cell D-TGL invocation itself: `packages/ai-host/src/workflows/residentialBuilding/runApartmentCellLayout.ts`
— calls the FROZEN `generateDeterministicLayouts` (the same apartment-generator engine),
applies `scaleCellProgram` to fit the room programme to the actual cell area
(`runApartmentCellLayout.ts:247-305`), and returns `status: 'rejected'` (never a fallback box)
when the engine can't fit anything (`runApartmentCellLayout.ts:426-435`). A rejected cell
renders **hatched** in the preview (`residentialPlanThumbnail.ts:170`) — visually distinct from
a plain filled "T3" box — so a plain (non-hatched) box with no visible subdivision is not what
the code paths would emit for a rejected cell.

## 4. Live diagnostic — the engine genuinely designs rooms

Ran `orchestrateResidentialBuilding` directly (pure, no editor) on a clean 40×30 m footprint, 5
upper floors, T2+T3, 60–100 m² band (the onboarding wizard's own seeded defaults):

```
diagnostic: §DIAG-RESI-ORCHESTRATE levels=6 coreCentre=(20,15) corePlacement=centre
plate=40x30 apartmentsPerLevel=[0,10,10,10,10,10]

---apartment--- T2 ok targetAreaM2= 79.6734
  rooms: 6
    room kitchen  area=13
    room bathroom area=8
    room bedroom  area=12
    room living   area=24
    room corridor area=11
    room bedroom  area=12
  walls: 19  windows: 4  doors: 5

---apartment--- T3 ok targetAreaM2= 108
  rooms: 6
    room kitchen  area=18
    room corridor area=14
    room living   area=33
    room bathroom area=10
    room bedroom  area=17
    room bedroom  area=17
  walls: 19  windows: 2  doors: 5
```

Every apartment on every upper floor got a genuine 6-room programme (kitchen / bathroom /
2 bedrooms / living / internal corridor), 19 walls, and 5 doors — this is a real room-by-room
solve, not a raw area-ratio subdivision. This directly contradicts the hypothesis that the
orchestrator or executor substitutes the packer/partition's schematic cell rectangle for the
real design on upper floors.

(Diagnostic script was written to a scratch file, run via `npx tsx`, and deleted afterward —
no working-tree changes were left from it.)

## 5. Why ground floor "looks correct" while upper floors don't, per the founder's new report

The ground floor is architecturally a **much simpler** structure by design — it never runs
D-TGL at all: it's core + commercial shopfront/solid shell + a straight lobby corridor from the
entrance to the core fire door (`ResidentialBuildingExecutor.ts:417-439`,
`computeGroundFloor` in the orchestrator). There is no "real design" being compared against a
"fake design" here — the ground floor's walls were always going to look clean because they are
architecturally trivial (a box + a straight corridor), while the upper floors carry ten
apartments' worth of genuinely-solved-but-rectilinear room partitions. If the founder is
perceiving the upper floors as "not designed," the most likely honest explanations are:

1. **Visual/quality, not data** — D-TGL's squarify-based room tiling is, by construction,
   always axis-aligned rectangles (see the engine's own documented limits in
   `docs/03_PRYZM3/reference/specs/SPEC-TGL-DETERMINISTIC-LAYOUT-ENGINE.md` §11.1 — "P3b
   squarifies by area … rectilinear shells only"). A compact ~80–108 m² apartment's 6 rooms,
   drawn at whole-building/whole-floor scale, can genuinely look like "a rough rectangular
   zone split" even though each room is individually programmed, doored, and (partly) windowed
   — because the rooms genuinely ARE simple rectangles. This would look worse the more zoomed-
   out the view (matching "the actual generated building," a 3D/whole-floor view, looking
   cruder than a single room-level plan would).
2. **A per-apartment silent failure specific to the real site** — `ResidentialBuildingExecutor.ts:519-527`
   wraps `buildLayoutCommands` in a `try/catch` that **skips the apartment silently** (only a
   `console.warn`) on any exception, leaving just that apartment's 4-wall cell perimeter (the
   box) with **no interior partitions at all**. I could not trigger this on a clean rectangular
   footprint, but I have not tested the founder's actual (possibly irregular / rotated /
   L-shaped / very compact) parcel, and the newer non-rect-cell path
   (`§NONRECT-CELLS-P1`, `runApartmentCellLayout.ts:82-85`, `379-380`) is comparatively less
   exercised than the plain-rect path. If this is what's happening, the resulting geometry (a
   plain 4-wall box, no interior walls) is exactly what a founder would describe as "just the
   preview's rough zone boundary."

I did not find any code path where the cell's schematic rectangle is used **as wall geometry**
in place of `apt.layout` — every wall-building call site reads `apt.layout` from the real D-TGL
result. So "literally reusing the preview polygon as the wall source" (as a designed behaviour)
is ruled out; the two remaining candidates are a genuine-but-boxy design (1) or a swallowed
per-apartment exception on the founder's specific site geometry (2).

## Open uncertainty / recommended next step

I did not have the founder's actual failing parcel (shape, upper-level count, typology mix) to
reproduce against, and I did not run the live editor (this environment has no running dev
server / DB). To close this definitively:

- Ask the founder for the console log from their actual generation — specifically grep for
  `[resi-building] buildLayoutCommands failed for an apartment (skipped)`. If that line appears
  for some/most upper-floor apartments, candidate (2) above is confirmed and the fix is in
  `runApartmentCellLayout`'s non-rect-cell (`cellPolygon`) path or in `buildLayoutCommands`'s
  handling of whatever specific geometry that parcel produces.
- If that line does NOT appear, the walls being built genuinely are the D-TGL design, and the
  fix is a rendering/quality one (finer subroom partition strokes / stronger room-type colour
  separation in the plan preview per §3 above, and possibly a deeper D-TGL enhancement —
  non-orthogonal room shapes — which is already a tracked, known engine limitation, not new).

No code changes were made — this investigation did not reach a narrow, confirmed root cause I
could safely fix without guessing (per the task's own constraint against guess-fixing). No
files in the working tree were modified.
