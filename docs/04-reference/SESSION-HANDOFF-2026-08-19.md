# SESSION HANDOFF — 2026-08-19

**Read this first, then `git log --oneline` since `4455be2c`.**
Baseline at handoff: **`85b1f5f9`**, pushed to `origin/main`.

> ⚠ **Every status below is the LANE'S measurement, verified by the orchestrator only to
> `COMPILER_RC=0` and the commit record.** Three lanes were still running when the session
> ended, so anything marked LIVE has moved past this document. **Re-measure before trusting a
> line here** — this file rots the same way the contract counts do.

---

## 0. THE PROMPT FOR THE NEXT SESSION

> Resume the PRYZM element-soundness fleet at `85b1f5f9` (or later — check `git log` first).
> Three lanes were live at handoff and their in-flight files were deliberately NOT committed by
> the orchestrator: RK1 (wall profile mitre), CW1 (curtain-wall steps 7–11), HR1 (handrail
> persistence L-1102). **First action: `git status` — if those files are still uncommitted, the
> lanes died mid-edit; read their contract sections and the ISSUE-LOG rows named below, then
> decide whether to land or discard the residue before starting new work.**
>
> Priority order: (1) land or discard the three lanes' residue; (2) HR1 L-1102 persistence — it
> blocks four other handrail items; (3) CW1 step 7 curtain-wall doors, which needs the C15
> hosting decision TAKEN, not escalated; (4) C100 slices S14 → S16 → S17 in that order, because
> S16 is blocked on S14; (5) the founder-verifiable list in §6, which needs a browser.
>
> Standing founder instruction: **"PLEASE DECIDE YOURSELF — what is more architecturally sound
> and more robust for PRYZM."** Do not stall a lane on a decision you can take and document.

---

## 1. MATERIAL LANE (MT1) — lane FINISHED, work OPEN

**Landed:** `ab13c5bd` — one family of sixteen consumes the master material database, and the
finding that mattered is that **neither material gate was wired**: C100 §2.1 had a `MUST NOT`
shipping violated and unmeasured. Both gates are now registered.

**L-1038 census — the honest answer to "are all elements consuming from the database" is NO.**
No material information reaches IFC at all; four families lose `materialId` at save; door and
window have none to lose.

**Open slices (C100 §9.8) — ordered by dependency, not preference:**

| slice | what | state |
|---|---|---|
| S13 | `materialLibrary.ts`'s four `0x` wall presets: master row, or C04 view style? | NAMED, blocked on a design decision |
| S14 | reconcile drifted ids to master ids (ARM B → 0) | OPEN — **prerequisite for S16** |
| S15 | five serializers drop `materialId` (ARM D → 0) | OPEN |
| S16 | route every producer's colour slot through the resolver (ARM C → 0) | blocked on S14 |
| S17 | `door` + `window` gain `materialId` (ARM A → 0) | OPEN — largest, C67/C68-bound |
| S18 | IFC `IfcRelAssociatesMaterial` (C25) | OPEN — nothing reaches export today |

⭐ **One correction to the census, in the curtain wall's favour:** curtain-wall **panels** are an
exception to L-1038's finding that only `wall`'s `materialId` reaches a pixel.
`CurtainWallInstanceManager._getPanelMaterial()` resolves `panel.materialId` against
`STANDARD_MATERIAL_LIBRARY` (injected `initUI.ts:2236-2241`) and it now persists. MT1's separate
finding that `serializeCurtainWall()` writes no `materialId` is **confirmed and not in conflict** —
that is the *wall* record, which has no such field at all.

---

## 2. WALL — RAKED / CURVED / CURVED-RAKED **SHIPPED**; PROFILE EDITOR **LIVE**

**Closed and pushed:**

- `476cbfa2` **L-1062** — a raked curved wall is a **CONE**; the fork that would have made it two cones is gone.
- `98e8e09d` **L-1061/L-1064** — a layered wall with a window stood bolt upright at 80°, and the gate meant to prevent that had an off-by-one hole.
- `b11359fb` **L-1068** — the leaf's rake used the wall's **CHORD**, with a warning sixty lines above saying not to.
- `308bbb7d` **L-1066** — the curved raked corner now **closes at the top** (was `topSep 0.555 m`). **The ORDER of operations was the whole fix.**
- `a7914847` / `ca70eb2d` **L-1087** — a storey change that moved the FILING and not the HEIGHT was a silently-wrong element. The register had asserted every renderer derives `worldY` from `level.elevation`; **four of twelve do not.**

**PROFILE EDITOR — the status changed twice, so read this carefully:**
L-1034 recorded profile-edit as *"already on main under two slices."* `067c5aff` **overturned
that**: a profile drew **NOTHING** on any wall — the authoring surface existed and the body never
consumed it. Then `33ac2f3f` **L-1067 PARTIALLY CLOSED — the wall profile now DRAWS.**

⚠ **WHAT REMAINS IS THE MITRE.** RK1 was mid-edit on `WallProfileBodyBuilder.ts` and
`WallFragmentBuilder.ts` when the session ended. **Check whether those are committed.**

---

## 3. CURTAIN WALL (CW1) — LIVE, steps 1–6 landed, 7–11 open

**Landed:** `8b3ec6e8` panel authoring survives save/load (L-1057 — *the authority store was read
by nothing*) · `55ba658f` sparse override layer · `88c3e5e6` one panel vocabulary · `c19004eb`
panel-type control now reaches a store (*the DI struct it needed was never passed*) · `6e033993`
offset-from-centreline authored, persisted, rendered, excluded from batching · `85b1f5f9` **CW-4
post + transom spacing — the write re-derives the grid, or the control changes nothing.**

**OPEN — steps 7 to 11:** curtain-wall **doors** (genuinely need creating) · polyline + ENTER
closes the loop · slab-by-region inside a curtain wall · MOVE → PROPAGATE → RECOMPUTE · RAC for all.

⛔ **Step 7 is blocked on a C15 DECISION THAT MUST BE TAKEN, NOT ESCALATED.** Is a curtain-wall
door (a) a hosted opening the way a door is hosted in a wall, or (b) a panel KIND replacing a grid
cell? Read C15/C67/C68/C84, decide, write it into C87 with citations, log DECIDED, then build.

### ⭐ The lane's most valuable output was a RETRACTION — carry these forward

1. **`5157fd94` — it read `RC=0` from the WRAPPER, not the compiler.** `npx tsc … ; echo "RC=$?"`
   always exits 0, because the wrapper's last statement is the echo. Three claims carried an RC the
   artefact never supported; all three runs were **RC=2**. *A verification harness that cannot fail
   is not a verification.* **Always read `COMPILER_RC` from the compiler.**
2. **`823bdbcb` — step 4 needed NO CODE. TAB sub-element cycling was already fully built**
   (`SelectionManager.ts:1164-1174` handler, `:2462` ordered ring, `:2469-2481` wrap, `:2487` amber
   highlight, then `updateInspector` → `engineLauncher.ts:289` → `PropertyPanelAdapter.update:73`).
   The lane's own diagnosis — marked *"THIS IS THE WHOLE OF CW-1's WORK"* — was wrong: TAB state
   lives in `cwSubElements` + `cwSubElementIndex`. **There was a message doing a message's job next
   to state doing state's job, and it read the first without looking for the second.**
   ⚠ **That is the THIRD "build this" item in C87 that measurement found ALREADY BUILT.** Discount
   any C87 row not accompanied by a measurement.
3. `bd572afd` — the TYPE→KIND relationship was not lossy, **it did not exist**; and a master
   nobody can import is not a master.
4. **`ReplacePanelTypeCommand`'s name no longer matches what it does.** Declared, NOT renamed: its
   type string is serialised into undo history, so renaming is a **stored-data change**, not a refactor.

---

## 4. HANDRAIL (HR1) — LIVE, persistence-first

**Landed:** `d8de90c4` / `9acf58d3` / `86449a3c` `geometry-handrail` is its own package ·
`10513bf4` the 20 railing types now carry `materialId` (they shipped a raw hex — **C100 §2.1's
explicit MUST NOT, introduced by this lane**) · `d1e6e1f1` deleting a stair no longer strands its
handrails (*a comment had claimed a garbage-collect pass was handling it*) · `f2dc5dbf` storey change.

⭐ **BLOCKING EVERYTHING: L-1102 — only 7 of ~26 authored fields survive a save/load round trip.**
Post spacing (R5), infill panelling (R6), user types (R3) and slab-edge RAC (R8) all sit behind it,
because authoring what will not persist is wasted work. Align with **L-1037 DECIDED** (persistence
inverts its default: serialise minus derived, rebuild through ONE payload builder) rather than
inventing a second scheme. HR1 was mid-edit on `handrailPersistence.ts` at handoff.

**Founder's requirement is PARITY WITH THE WALL:** mode bar Linear / Ortho / Curved / By Slab plus
square / circular / ellipse; 20 types; materials from C100; every property reachable from the
properties panel **AND** RAC; works as a stair sub-element **AND** standalone; BIM 3.0 (C70–C83).

---

## 5. METHOD RULES THIS SESSION PAID FOR — put these in every lane brief

- `git commit --only <paths>` **ALWAYS**. Never `git add -A`. **Never `git stash`** — the stash stack is GLOBAL across worktrees.
- Root `tsc` needs `NODE_OPTIONS=--max-old-space-size=8192` or it **OOMs at 2 GB having checked NOTHING** and reports RC=134.
- **A wildcard `export *` cannot be audited by grepping the names you know** — parse the binding list. This cost a red tree once (`9acf58d3` → `86449a3c`, 14 unnoticed symbols).
- `pnpm install --lockfile-only` creates **no node_modules link**. Run a real install.
- **Deploy from a clean detached-HEAD worktree** — `flyctl` uses the WORKING TREE as Docker context, so a normal deploy ships every lane's half-finished work.
- Commit messages via `git commit -F -` heredoc, never `-m` with backticks (command substitution eats fragments).

---

## 6. ⛔ FOUNDER-ONLY — needs a browser or a product call, no lane can close these

1. **L-1004** — does clicking Render kill the viewport? (It hands a THIRD renderer the live scene and disposes it the way L-948 forbids. OPEN, **not reproduced**.)
2. **C87 §12** — the *"I can swap panels"* account contradicts the measurement.
3. **Does the TAB highlight + panel actually appear on a keypress in a running editor?** CW1 traced the path link by link but **did not execute it** — `§committed-is-not-reachable` applies.
4. **L-1090** — two facades both claiming the stability boundary.
5. **L-1026** — Null Island georeferencing.
6. **L-1010** — needs browser proof.

**Unowned, pre-existing:** `GeometryWorkerPool.test.ts` has **17 failures** (hook timeouts,
MockWorker state leaking between cases). Not caused by any lane this session.
