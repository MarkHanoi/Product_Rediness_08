# SPIKE — True North vs Project North rotation, and its defects in house-residential execution

- **Status:** Audit / spike (no production code changed by this doc) — 2026-06-18
- **Author:** Claude Opus 4.8 (code-reading audit)
- **Scope:** the house-creation execution pipeline only — wall joints, welds, perimeter realisation, preview↔execution parity. The apartment generator is the clean reference.
- **Governing docs:** ADR-0070 (Project North vs True North), ADR-0073 (house↔apartment frame parity), ADR-0075 (preview↔execution parity contract), C12-GEOSPATIAL, C19-SITE-MODEL, SPEC-PROJECT-NORTH-AUTHORING-FRAME, `docs/04-reference/architecture-detail/layout-generation-algorithm.md §17`.
- **Method:** every claim below cites real `file:line`. Files were opened and read; nothing is paraphrased from memory.

---

## 0. TL;DR

The house generator emits interior partitions in an **axis-aligned "Project-North" frame** but
the **drawn ground shell** the partitions must meet lives in the **rotated "True-North" world
frame**. The two frames only agree rigidly on an axis-aligned plate. On a rotated plate the
seam between partition and perimeter is bridged by a *weld* — and the weld rectifies the shell in
one frame while the authoritative perimeter is minted in another. The lever arm of the
re-rotation amplifies a ≤0.50 m per-edge rectify into a **~1.5 m pivot** of a long ground
partition off the previewed centreline. The upper floors are immune because their perimeter is an
engine-minted ring that rectifies to a no-op. Three "safe-half" fixes have shipped
(§GROUND-WALL-FRAME endpoint metric, §WELD-NO-LATERAL-SHIFT endpoint-max, §GROUND-PERIMETER-OVERSHOOT
clamp). The **deeper source fix** (one-frame mint: ADR-0073's spirit) remains OPEN: ground
perimeter and partitions are still minted/welded in different frames.

`closed=✓ jointGap=0.0mm` from the `WallJoinResolver` is **a false comfort** — it proves the
mitre math around whatever endpoints it was handed, not that those endpoints are on the previewed
line. The only honest instrument is `§DIAG-PARITY`: preview↔built **lateral** divergence, with the
**ground-vs-upper asymmetry** localising the bug to the ground frame.

---

## 1. The two frames — definitions

### 1.1 True North vs Project North

- **True North** — the real-world / site / globe orientation; where the drawn plot boundary
  actually sits, at some angle θ off the world axes. This is the frame C12/C19/IFC
  `IfcProjectedCRS` + `TrueNorth` live in. (`docs/02-decisions/adrs/ADR-0070-project-north-vs-true-north-authoring-frame.md:37-38`.)
- **Project North** — an **axis-aligned authoring frame** whose X-axis is the building's
  **principal axis**: θ derived automatically from the first significant drawn boundary edge, the
  real-world rotation carried separately. Mirrors Revit's Project North vs True North.
  (`0070-…:39-40`, `:27-31`.)

### 1.2 Where the angle is defined / computed

The rotation angle θ and pivot are computed by `deriveProjectNorthFrame`:

```
packages/ai-host/src/workflows/houseLayout/projectNorthWeld.ts:64-71
  thetaRad = principalAxisAngle(footprintWorld)   reduced to (−π/4, π/4]
  if |raw| < 0.01 rad  ⇒  thetaRad = 0  (near-axis plate collapses to identity)
  pivot    = the footprint-ring centroid (world m)
```

The angle's **source is the drawn boundary**, not the LTP-ENU/site frame: `principalAxisAngle`
is fed `footprintWorld`, and at the executor call site the footprint passed in is
`storey.footprint` (`apps/editor/src/ui/house-layout/HouseLayoutExecutor.ts:695`). The 0.01 rad
identity threshold deliberately matches the executor's existing `§DIAG-EXEC-ROTATION` threshold
(`projectNorthWeld.ts:60-62`).

The flag that turns the whole Project-North path on is `window.__pryzmProjectNorth` (DEFAULT ON;
`=== false` forces the legacy world-frame weld), read at
`HouseLayoutExecutor.ts:692-693`, producing the `weldFrame` at `:694-696`.

### 1.3 Contracts / ADRs in play

| Doc | Role | Cite |
|---|---|---|
| ADR-0070 | Project North as a first-class frame; the original root cause | `0070-…:14-22` |
| ADR-0073 | "joint quality is a function of FRAME PARITY"; the source-fix decision | `ADR-0073-…:14-24`, `:30-36` |
| ADR-0075 | preview↔execution parity contract (PC1–PC4); `§DIAG-PARITY` is binding | `0075-…:31-41` |
| SPEC-PROJECT-NORTH-AUTHORING-FRAME | §2 frame, §3.3 rectify (the load-bearing step) | referenced by `projectNorthWeld.ts:30-33` |
| C12 / C19 | where True North + `IfcProjectedCRS` live | `0070-…:38`, `:40` |

---

## 2. The execution pipeline, frame-by-frame

### 2.1 D-TGL engine output frame

`emitGeometry.ts` (P9) projects the persistent semantic graph into a plain `LayoutOption`
(`packages/ai-host/src/workflows/apartmentLayout/tgl/emitGeometry.ts:1-13`). Its rooms/walls are
in **plate-local metres** (graph is metres `{x,z}`, option is mm `{x,y}` with plan-y = z;
`emitGeometry.ts:8-9`). Crucially the engine **tiles partitions in the principal-axis (Project-North)
frame** then rotates the emitted geometry back to world: this is stated as the confirmed bug in
`projectNorthWeld.ts:4-12` and again in `0070-…:14-17`. So the engine option is **axis-aligned,
rotated-back-to-world** — *not* round-tripped through the same rotate as the drawn shell.

### 2.2 The reconciliation chain (`HouseLayoutExecutor.ts`)

| Step | Frame in → out | Cite |
|---|---|---|
| capture OPTION centrelines (the parity baseline = preview intent) | world (engine) | `:647-660` |
| derive `weldFrame` (θ, pivot) from `storey.footprint` | world → defines PN | `:692-696` |
| ground: ENGINE-PERIMETER path (drawn shell on footprint ring) → **weld SKIPPED** | world (no-op) | `:751-765` |
| ground: WELD-FALLBACK path → `_weldGroundPartitions(set, shellWalls, weldFrame, shell.perimeter)` | world → PN → world | `:766-778`, `:1999-2001` |
| `projectNorthWeld`: de-rotate → **rectify shell** → weld TIGHT → re-rotate | world → PN(rectified) → world | `projectNorthWeld.ts:188-224` |
| §SHELL-CONTAIN clamp endpoints inside drawn ring | world | `:2012-2014` |
| §WELD-NO-COLLAPSE revert crushed walls to OPTION baseline | world | `:2120-2136` |
| §WELD-NO-LATERAL-SHIFT revert pivoted/shifted walls to OPTION baseline (endpoint-max metric) | world | `:2137-2180` |
| §AI-CORNER-WELD: snap near-coincident endpoint clusters to one shared point (perimeter+partitions) | world | `:1159-1239`, applied `:1240-1264` |
| §GROUND-PERIMETER-OVERSHOOT: clamp the corner snap so it never EXTENDS a wall past its end | world | `:1219-1235` |
| `WallJoinResolver.resolveLevel` miter/trim/inner-face clamp (commit time) | world | `WallJoinResolver.ts:111-128`, `:402-415` |
| §DIAG-PARITY measure preview↔built lateral divergence | world | `:1455-1509` |
| §DIAG-PARITY-OPENINGS measure door/window centre drift | world | `:3108-3160` |

### 2.3 What `projectNorthWeld` actually does (the heart of the defect)

```
projectNorthWeld.ts:161-225
  thetaRad === 0  ⇒  identity pass-through; weld in world; byte-identical to legacy   (:177-186)
  thetaRad !== 0  ⇒
    (1) de-rotate partitions + shell ring by −θ about pivot  → Project-North         (:188-191)
    (2) rectifyShellRing(shellRingPN)  — snap near-axis edges to EXACT axis,
        up to snapTolM = 0.50 m per edge                                              (:88-126, :193-196)
    (3) weldPartitionsToShell(partsPN, shellWallsPN)  — TIGHT, along-axis snap        (:198-210)
    (4) re-rotate welded partitions + rectified shell by +θ about pivot → world       (:212-217)
  returns { partitions, shellRingWorld, shellWallsWorld, thetaRad }                   (:219-224)
```

The return type carries **both** the welded `partitions` AND the rectified `shellWallsWorld`
(`projectNorthWeld.ts:138-147`). The executor consumes **only `.partitions`**
(`HouseLayoutExecutor.ts:2000`) — it **discards `shellWallsWorld`**. That discard is the
§GROUND-WALL-FRAME defect (§4.1).

### 2.4 What `WallJoinResolver` operates on, and what `closed=✓` proves

The resolver runs at commit time, in the **world frame**, on whatever endpoints it is handed. A
corner join moves both endpoints to the centreline intersection and miters with a bisector plane
(`WallJoinResolver.ts:114-118`); a T-join trims only the approaching wall to the host face
(`:120-122`); 3+-endpoint clusters consensus-trim to a meeting point (`:124-128`,
`§MULTI-CLUSTER` pre-pass at `:485-540`). The `§DIAG-WALL-JOIN` log line
(`:402-415`) reports the partition→shell inner-face clamp result as `landed=innerFace✓`.

**What `closed=✓ jointGap=0.0mm` proves:** that the resolver's mitre/trim math closed the
corner around the endpoints **it received**. **What it does NOT prove:** that those endpoints sit
on the *previewed* line. The resolver mitres faithfully around endpoints that were **already
displaced upstream** by the weld. This is the recurring diagnostic trap — see §4.4.

### 2.5 ASCII data-flow with frame annotations

```
                        D-TGL engine (emitGeometry.ts P9)
                                  │  option in PLATE-LOCAL, axis-aligned,
                                  │  then rotated BACK to world  [PROJECT-NORTH→WORLD]
                                  ▼
  ┌──────────────────────── HouseLayoutExecutor ────────────────────────┐
  │                                                                      │
  │  capture OPTION centrelines  ──[WORLD]──►  optionBaselinesByLevel    │  (the parity baseline)
  │                                                                      │
  │  deriveProjectNorthFrame(storey.footprint) ──► θ, pivot  [defines PN]│
  │                                                                      │
  │  GROUND drawn shell  ──[WORLD, rotated by θ]──┐                      │
  │  partitions          ──[WORLD, from PN tile]──┤                      │
  │                                               ▼                      │
  │                                     _weldGroundPartitions            │
  │                                               │                      │
  │      ┌── projectNorthWeld ──────────────────────────────────────┐   │
  │      │  −θ de-rotate          [WORLD ──► PROJECT-NORTH]           │   │
  │      │  rectifyShellRing(0.50m)  [PN: shell snapped to EXACT axis]│   │
  │      │  weldPartitionsToShell    [PN: tight along-axis snap]      │   │
  │      │  +θ re-rotate          [PROJECT-NORTH ──► WORLD]           │   │
  │      └── returns .partitions  (✗ shellWallsWorld DISCARDED) ─────┘   │
  │                                               │                      │
  │   ┌── lever-arm amplifies 0.50m rectify → ~1.5m PIVOT at far end ──┐ │
  │   │  partitions now welded to RECTIFIED shell, but the BUILT       │ │
  │   │  perimeter is the UN-rectified DRAWN shell  →  FRAME MISMATCH   │ │
  │   └────────────────────────────────────────────────────────────────┘ │
  │                                               │                      │
  │  §SHELL-CONTAIN ► §WELD-NO-COLLAPSE ► §WELD-NO-LATERAL-SHIFT  [WORLD] │  (safe-half reverts)
  │  §AI-CORNER-WELD + §GROUND-PERIMETER-OVERSHOOT clamp         [WORLD]  │
  │                                               │                      │
  │  WallJoinResolver.resolveLevel  miter/trim   [WORLD]                 │  closed=✓ proves MITRE,
  │                                               │                       not on-previewed-line
  │  §DIAG-PARITY  (ground latMax vs upper latMax)  [WORLD]              │  ◄── the real instrument
  └──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Audit table — every transform

| # | Transform | file:line | Input frame → output frame | Mutates | Failure mode on frame mismatch | Status |
|---|---|---|---|---|---|---|
| T1 | **PN-rebase** `deriveProjectNorthFrame` | `projectNorthWeld.ts:64-71`; `HouseLayoutExecutor.ts:692-696` | world → defines θ,pivot | nothing (computes frame) | θ from drawn shell ≠ engine-tile θ ⇒ all downstream frames disagree | correct |
| T2 | **de-rotate** −θ | `projectNorthWeld.ts:188-191` | world → Project-North | endpoint coords | none (rigid, identity-safe at θ=0) | correct |
| T3 | **rectify-shell** `rectifyShellRing` (≤0.50 m/edge) | `projectNorthWeld.ts:88-126`, `:193-196` | PN → PN(clean) | **perimeter ring vertices** | moves the shell up to 0.50 m/edge; if that ring is then discarded, partitions weld to a perimeter that isn't built | **OPEN (source)** |
| T4 | **ground partition weld** `weldPartitionsToShell` (TIGHT) | `projectNorthWeld.ts:198-210`; via `:2000` | PN → PN | partition **endpoints** | endpoints land on RECTIFIED shell, not drawn shell | correct in-frame, **OPEN downstream** |
| T5 | **re-rotate** +θ | `projectNorthWeld.ts:212-217` | PN → world | endpoints + ring | lever arm amplifies T3's 0.50 m to ~1.5 m at a long partition's far end → PIVOT | fixed (reverted by T8) |
| T6 | **§SHELL-CONTAIN clamp** `clampPartitionsInsideShell` | `HouseLayoutExecutor.ts:2012-2014` | world → world | endpoints outside ring | only fixes endpoints OUTSIDE the ring, not interior-joint frame residual | fixed (band-aid; ADR-0073 §28) |
| T7 | **§WELD-NO-COLLAPSE** revert | `HouseLayoutExecutor.ts:2120-2136` | world | reverts crushed wall to OPTION baseline | a real wall crushed to a stub by a frame-bad weld | fixed |
| T8 | **§WELD-NO-LATERAL-SHIFT** revert (endpoint-max) | `HouseLayoutExecutor.ts:2137-2180` | world | reverts pivoted/shifted wall to OPTION | **was midpoint-only → missed the pivot**; now endpoint-max | fixed (commit `18ee43d1`) |
| T9 | **§AI-CORNER-WELD** cluster snap | `HouseLayoutExecutor.ts:1190-1239`, `:1240-1264` | world | near-coincident endpoint clusters → one point | snapping to centroid can EXTEND past a corner | fixed (T10) |
| T10 | **§GROUND-PERIMETER-OVERSHOOT** clamp | `HouseLayoutExecutor.ts:1219-1235` | world | along-axis component of T9 snap ≤0 | overshoot diagonal sliver past mitre | fixed (commit `1e567ec3`) |
| T11 | **miter/bisector resolve** `WallJoinResolver.resolveLevel` | `WallJoinResolver.ts:111-128`, `:402-415`, `:485-540` | world | endpoints, end caps | mitres around already-displaced endpoints → `closed=✓` masks upstream drift | correct math, **misleading signal** |
| T12 | **perimeter mint** `_buildPerimeterShell` (upper) / drawn shell (ground) | `HouseLayoutExecutor.ts:2763-2814` (upper); `shell.perimeter` (ground) | world | perimeter ring | ground perimeter minted in DRAWN frame ≠ partitions in RECTIFIED PN frame | **OPEN (source)** |

**Summary (transforms × status):** correct = T1, T2, T11(math); fixed = T5, T6, T7, T8, T9, T10;
OPEN = T3/T4/T12 (the one-frame mint), plus T11's misleading `closed=✓` signal.

---

## 4. Confirmed defects (verified against code)

### 4.1 §GROUND-WALL-FRAME — ground partitions PIVOT ~1.5 m (FIXED, commit `18ee43d1`)

**Verified.** Commit `18ee43d1` = *"fix(house): §GROUND-WALL-FRAME — revert the 1.5 m ground
partition pivot the §WELD-NO-LATERAL-SHIFT guard missed"*.

The mechanism, confirmed in code:
1. `projectNorthWeld` **rectifies** the de-rotated drawn ground shell — `rectifyShellRing` snaps
   each near-axis edge to an exact axis, up to `snapTolM = 0.50 m` per edge
   (`projectNorthWeld.ts:88-126`, default at `:88`).
2. It welds the partitions onto that **rectified** shell (`projectNorthWeld.ts:198-210`).
3. It returns both `.partitions` AND the rectified `.shellWallsWorld`
   (`projectNorthWeld.ts:138-147`, `:219-224`).
4. The call site keeps **only `.partitions`** and **discards `shellWallsWorld`**
   (`HouseLayoutExecutor.ts:2000`). The authoritative built perimeter remains the **un-rectified
   drawn shell**.
5. The re-rotation (+θ) lever arm amplifies the ≤0.50 m per-edge rectify to **~1.5 m at a long
   partition's perimeter end** → the wall **PIVOTS** off the previewed line.

This is stated in the inline root-cause comment `HouseLayoutExecutor.ts:2148-2159` and the
regression-test header `apps/editor/__tests__/groundWallFrameParity.test.ts:1-26`. The production
numbers captured there: ground `walls=16 shifted=5 latMax=1504mm`, perimeter
`§DIAG-PERIM-CORNER-WHOLE GAP=1517mm`, while Level 01 read `latMax=0mm`
(`groundWallFrameParity.test.ts:5-7`).

**Why the upper floor is clean:** its perimeter is the engine-minted `storey.footprint` ring,
which **rectifies to ≈ a no-op** (already axis-aligned in PN), so partitions + perimeter already
share ONE frame (`HouseLayoutExecutor.ts:2156-2159`; `groundWallFrameParity.test.ts:13-15`).

### 4.2 §WELD-NO-LATERAL-SHIFT was midpoint-only (FIXED)

**Verified.** The guard is supposed to revert any weld body-shift >0.10 m
(`WELD_LATERAL_REVERT_M = 0.10`, `HouseLayoutExecutor.ts:2041`). The OLD metric measured only the
welded **midpoint's** perpendicular distance to the OPTION line. A **pure pivot** about the centre
keeps the midpoint ON the line (lateral ≈ 0) while both ends swing ±1.5 m — so the gross rotation
slipped through (`HouseLayoutExecutor.ts:2160-2168`; `groundWallFrameParity.test.ts:17-20`).

The FIX measures lateral as the **MAX perpendicular distance of BOTH welded endpoints** to the
OPTION centreline — the same metric `§DIAG-PARITY` reports — catching translation AND
rotation/pivot (`HouseLayoutExecutor.ts:2169-2178`). The metric change is locked by the unit test:
the buggy `midpointLateral` returns < 0.10 m on a 1.5 m pivot while the fixed `endpointMaxLateral`
returns 1.5 m (`groundWallFrameParity.test.ts:36-70`).

### 4.3 §AI-CORNER-WELD overshoot (FIXED, commit `1e567ec3`)

**Verified** (the prompt's "§AI-CORNER-WELD overshoot" is the §GROUND-PERIMETER-OVERSHOOT clamp on
the corner weld). Commit `1e567ec3` = *"fix(house): §GROUND-PERIMETER-OVERSHOOT — clamp corner-weld
so a wall never extends past its own end"*.

`§AI-CORNER-WELD` snaps every cluster of near-coincident endpoints (perimeter + partitions
together, per level) to ONE shared centroid so AI corners share points like a hand-drawn polyline
(`HouseLayoutExecutor.ts:1159-1172`, `:1190-1218`). Unconditionally snapping to the centroid could
**EXTEND** a wall past its corner along its own axis. The clamp removes only the **positive
along-axis (corner-extending) component** of the move while keeping the lateral correction and any
shortening (`HouseLayoutExecutor.ts:1219-1235`, especially the `if (along > 0)` clamp at
`:1229-1234`). `§DIAG-PERIM-OVERSHOOT` reports when it fired (`:1251-1263`).

### 4.4 §DIAG-WALL-JOIN `closed=✓` is a false comfort (the diagnostic trap)

**Verified.** The resolver's `§DIAG-WALL-JOIN` log line reports `landed=innerFace✓` once the
partition→shell clamp has run (`WallJoinResolver.ts:402-415`), and corner joins close to the
centreline intersection by construction (`:114-118`). But the resolver mitres around **whatever
endpoints it is handed** — endpoints already displaced upstream by the §GROUND-WALL-FRAME weld. So
`closed=✓ / jointGap=0.0mm` proves the **mitre math**, not that the wall is on the **previewed
line**.

The honest instrument is `§DIAG-PARITY` (`HouseLayoutExecutor.ts:1455-1509`): it compares each
wall's OPTION centreline (captured BEFORE weld + resolver, `:647-660`) to the LIVE committed
centreline, reporting **lateral** perpendicular drift (`perpToLine`, `:1476-1477`,
`:1489`) against a 20 mm threshold (`PARITY_TOL_MM = 20`, `:1467`). The decisive signal is the
**ground-vs-upper asymmetry** — ground `latMax=1504mm` vs upper `latMax=0mm` localises the bug to
the ground frame, exactly as the test header records (`groundWallFrameParity.test.ts:5-7`). This is
ADR-0075 PC1 — parity measured every run (`0075-…:31-32`).

---

## 5. OPEN defects / the deeper source fix

### 5.1 The remaining gap: ground perimeter and partitions are minted/welded in DIFFERENT frames

This is ADR-0073's spirit (`ADR-0073-…:14-24`). The ground **perimeter** is the drawn/raw shell
(`shell.perimeter`, passed at `HouseLayoutExecutor.ts:778`); the **partitions** are welded to the
**rectified PN shell** inside `projectNorthWeld` and the rectified ring is discarded (§4.1). The
§GROUND-WALL-FRAME fix snaps the **pivoted partitions back to the previewed line** (the
graph-authoritative OPTION baseline; `HouseLayoutExecutor.ts:2175-2178`) — the **safe half**. But
reverting to the previewed line does **not guarantee** the partition physically meets the *drawn*
perimeter when the option's wall sits slightly off it: the partition is now on the preview line,
the perimeter is the drawn ring, and those two only coincide if the option was emitted against the
drawn ring in the first place — which on a rotated plate it was not.

**Two candidate source fixes:**

1. **Adopt the rectified `shellWallsWorld` as the perimeter.** `projectNorthWeld` already returns
   it (`projectNorthWeld.ts:143-147`, `:217`); the executor would mint/host the ground perimeter
   from `shellWallsWorld` instead of the un-rectified drawn ring, so partitions + perimeter share
   ONE frame. Risk: the drawn ground shell is the **persistent building envelope** that already
   exists, hosts the entrance door, and is read by `gatherShellWalls` — minting a second ring
   risks two coincident exterior rings (the apartment invariant violation flagged at
   `HouseLayoutExecutor.ts:729-737`).

2. **Transfer welded partition ends from the rectified-shell frame to the drawn-shell frame
   parametrically** (carry the along-edge parameter through the rectify so the endpoint lands on
   the *drawn* edge at the same fraction). This keeps the drawn shell authoritative and moves only
   the partition end to meet it.

This is exactly ADR-0073's "mint the perimeter in the SAME frame the partitions were emitted"
decision (`ADR-0073-…:30-36`) and ADR-0075 PC4's "move authority upstream so the weld degrades to a
safety net" (`0075-…:40-41`).

**Why a naive re-snap fights the guard.** A naive "just re-snap the partition onto the drawn
perimeter" re-introduces a lateral body shift — which the **§WELD-NO-LATERAL-SHIFT guard now
reverts** (`HouseLayoutExecutor.ts:2137-2180`): the two corrections fight. This is the
§CLAMP-COSHARE-WELD lesson — a wall-geometry change that passed unit tests still shipped a visible
defect, so the source fix must be **landed test-first and browser-verified, not auto-deployed**
(`ADR-0072-…:40`; echoed `ADR-0073-…:41`). The source fix must change the **frame the perimeter is
minted in**, not add another post-weld re-snap.

### 5.2 Windows ride displaced host walls

`§DIAG-PARITY-OPENINGS` measures door/window centre drift along the host wall
(`HouseLayoutExecutor.ts:3108-3160`). Because the opening offset is preserved **along the wall**
(`§OPENING-REBASE`, then the preview-vs-built centre uses the live baseline,
`:3138-3140`), `posDrift` reads **0** even when the host wall itself is off the previewed line. The
opening is faithfully placed *on its host* — but the host is displaced by the frame defect, so the
window is in the wrong world position despite `posDrift=0`. This ties window mis-placement directly
to the §GROUND-WALL-FRAME / one-frame-mint root, not to an openings bug.

---

## 6. Remediation plan (phased) + governance

### Phase 0 — DONE (safe-half reverts)
- §GROUND-WALL-FRAME endpoint-max metric (`18ee43d1`) + §WELD-NO-LATERAL-SHIFT endpoint-max
  (§4.1–4.2); §GROUND-PERIMETER-OVERSHOOT clamp (`1e567ec3`) (§4.3).
- **Governs:** ADR-0075 PC1/PC2 (parity measured + no-op-proof gate). No new contract.

### Phase 1 — §DIAG-PARITY regression gate
- Promote `§DIAG-PARITY` from logging-only to a **regression assertion**: **ground `latMax` must
  stay ~0** on a rotated-plate fixture (the metric already exists at
  `HouseLayoutExecutor.ts:1505`; the unit-level lock exists at `groundWallFrameParity.test.ts`).
  Add an end-to-end executor fixture so a future weld change can't silently re-open the pivot.
- **Governs / amends:** ADR-0075 PC1 (`0075-…:31-32`) — make the parity number a gate, not just a
  log. No new doc.

### Phase 2 — the one-frame mint source fix
- Implement §5.1 candidate 1 or 2: mint the ground perimeter in the **same frame** the partitions
  were emitted (adopt `projectNorthWeld`'s rectified `shellWallsWorld`, or transfer partition ends
  parametrically into the drawn-shell frame). On an axis-aligned plate (θ=0) this is a
  **byte-identical no-op** (`projectNorthWeld.ts:177-186`); on a rotated plate the minted ring then
  coincides with where partition endpoints land → `§SHELL-ANCHOR-PRESERVE` fires, the consensus-trim
  stops pulling, `bothMitred` rises (`ADR-0073-…:30-36`).
- **Governs / amends:** ADR-0073 (the source-fix decision is already its §Decision item 2,
  `ADR-0073-…:30-36`) + ADR-0070 (Project-North end-to-end). **No new ADR required — ADR-0073 is
  the home.** If a separate "perimeter-frame parity" decision is wanted, the next free number is
  **ADR-0076** — but the spirit is fully covered by ADR-0073, so prefer amending it in place.

### Phase 3 — rotated-shell stair containment
- Cross-reference the in-flight `§STAIR-IN-SHELL-POLYGON` work in
  `packages/ai-host/src/workflows/houseLayout/stairPosition.ts` (currently being edited by another
  agent — read-only here). The same rotated-plate frame mismatch makes the engine test stair
  candidates against the **plate bounding box**, not the rotated **shell polygon**
  (`stairPosition.ts:122-138`, `:232-243`), so a "flush" stair can poke outside the real shell
  (`§STAIR-OFF-SHELL`, `:232-243`). The shell-polygon containment guard is the stair sibling of the
  partition one-frame fix.
- **Governs / amends:** ADR-0072 (corridor/stair on fragmented plates) lists the rotated stair
  keep-out poking outside the shell as queued out-of-scope (`ADR-0072-…:41`). Phase 3 closes it
  there. No new doc.

---

## 7. Appendix — verified commit / file map

| Symbol | Commit / file:line |
|---|---|
| §GROUND-WALL-FRAME revert | `18ee43d1` ; `HouseLayoutExecutor.ts:2148-2178` ; `groundWallFrameParity.test.ts` |
| §GROUND-PERIMETER-OVERSHOOT | `1e567ec3` ; `HouseLayoutExecutor.ts:1219-1235` |
| §WELD-NO-LATERAL-SHIFT (endpoint-max) | `HouseLayoutExecutor.ts:2137-2180` |
| §AI-CORNER-WELD | `HouseLayoutExecutor.ts:1159-1264` |
| projectNorthWeld (de-rotate→rectify→weld→re-rotate) | `projectNorthWeld.ts:161-225` |
| rectifyShellRing (0.50 m) | `projectNorthWeld.ts:88-126` |
| discard of rectified shellWallsWorld | `HouseLayoutExecutor.ts:2000` (keeps `.partitions` only) |
| §DIAG-PARITY (the instrument) | `HouseLayoutExecutor.ts:1455-1509` |
| §DIAG-PARITY-OPENINGS | `HouseLayoutExecutor.ts:3108-3160` |
| WallJoinResolver §DIAG-WALL-JOIN / miter | `WallJoinResolver.ts:111-128`, `:402-415`, `:485-540` |
| stair shell-polygon containment | `stairPosition.ts:122-138`, `:232-243` |
| ADR-0070 / 0073 / 0075 / 0072 | as cited throughout |
