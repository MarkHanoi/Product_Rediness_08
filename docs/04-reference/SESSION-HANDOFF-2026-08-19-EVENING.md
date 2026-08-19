# SESSION HANDOFF — 2026-08-19 EVENING

**Read this first, then `git log --oneline` since `4455be2c` (the day's baseline).**

> ⚠ **Every status here is a LANE's measurement, verified by the orchestrator only to
> `COMPILER_RC` and the commit record.** Re-measure before trusting a line — this file rots
> exactly the way the contract counts do.

---

## 0. THE PROMPT FOR THE NEXT SESSION

> Resume the PRYZM element-soundness fleet. **First action: `git status`** — if
> `packages/geometry-slab/*` or `plugins/structural/*` files are uncommitted, lanes SL3/MT4
> died mid-edit; read their sections below, land or discard the residue, THEN start new work.
> Second action: verify the last deploy — `bash tools/deploy/fly-bundle-proof.sh` — and if the
> founder has tested, read his console logs before choosing priorities.
>
> Priority order:
> 1. **Founder's browser feedback on the instancing deploy** (windows 12→1 mesh; kill switch
>    `__pryzmElementInstancing = { window: false }`; expect ~8,400 meshes where 46,735 were).
> 2. **SL3's slab-displacement fix** if it did not land (probes exist; datum = TOP face, C92 §10).
> 3. **Doors instancing port** (no path exists; 19 meshes each; structurally the window's twin —
>    INST1's report is the map). Then handrail instancing (best next candidate).
> 4. **RN1's unfinished deliverable**: the two render-backend contracts (WebGL2 = PERFORMANCE
>    backend, WebGPU = GRAPHICS backend — the founder's role split), the role-split ADR, the
>    `@thatopen` fragments investigation, the pascalorg comparison. The audit exists
>    (in-session report); the documents were never minted.
> 5. The flush re-arm (`WallRebuildCoordinator` — WJ2 made each pass ~free; the passes remain).
> 6. S18 — IFC `IfcRelAssociatesMaterial`: **no material reaches export at all**.
>
> Standing founder instructions: **"PLEASE DECIDE YOURSELF — what is more architecturally
> sound and more robust for PRYZM."** Commit early and often with `git commit --only`. Deploy
> only via `tools/deploy/fly-manual-deploy.sh` (prefix `DOCKER_HOST=` on Windows — flyctl's
> release phase chokes on the npipe docker context otherwise), then the MANDATORY
> `fly-bundle-proof.sh`.

---

## 1. WHAT SHIPPED TODAY (highlights of ~80 session commits)

- **Instancing ON for windows by default** (`079aab83`) — 12→1 mesh per window; the blocker
  was never the flag but an ADR-0297 L1 hole: a family could free the SHARED canonical
  material other families were still bound to. Fixed at the one chokepoint for all six
  families. Kill switch honoured in both directions.
- **The 85.4 s batch stall root-caused and fixed** (PERF2) — `isBatching` was the ONE
  suppression never mirrored to `RoomTopologyObserver`'s execution chokepoint; 400 walls drove
  ~400 full room detections INSIDE the batch. Now 0 during / 1 per level after.
- **Bulk edits 95×/208× faster** (WJ2, `b3c24549`) — a WINDOW re-resolved WALL JOINS;
  invalidation was keyed on the event, not on what the solve reads. Content-addressed memo on
  the 7 fields the solve actually reads. ⭐ The defect class is named in C85 §10.5:
  **"invalidation keyed on 'something changed' rather than on the computation's inputs"** —
  three faces found in one day (rooms, joins, height).
- **Curtain-wall BY SLAB works from the founder's gesture** (CW4) — the root was HALF-fixed:
  the snapshot existed, the ASK did not; and `S` was bound to *Single*, not By-Slab. Also: 95
  curtain-wall test cases were INVISIBLE to CI (21 red); Align dispatched a verb its handler
  rejects on every call.
- **Snapping was DEAD above the ground floor** (SNAP1, ADR-0335) — `pointToLineDistance2D`
  measured in 3-D, making its own 1 m tolerance unsatisfiable above ~1 m of elevation. Five
  families never fired on upper storeys. Three scopes now: DATUM (project-wide) / ACTIVE /
  OTHER (demoted 1000, never filtered).
- **The envelope had FOUR visibility authorities** (ENV1) — hiding wrote one. One authority
  now, at the rasteriser chokepoint. A 0/0/0-setback envelope now REFUSES to draw
  (overstatement doctrine). `UNKNOWN 227` in the browser = doors/windows/beams genuinely have
  no `type` field (Zod STRIP); read-side classifier fixed, DTO root NOT fixed.
- **Grid Delete works; deletes now REFUSE out loud** (SV2) — the BIM delete arm reported
  success for deletes that deleted nothing (three layers each discarded the refusal). The
  census is EXECUTABLE: a new selectable kind fails the build until Delete handles or refuses.
- **Slab datum DECIDED: TOP face** (SL3, C92 §10) — and `root.position.y` is DERIVED.
- **Materials**: furniture hashed 205 master materials into 8 buckets (oak == walnut);
  plumbing had a SECOND service-colour table disagreeing with the live one; door + window
  gained master `materialId`; custom railing types now survive a save ("the store had a
  destructor and no constructor").
- **Panels default-closed + View Properties launcher; onboarding headers fixed (rendered
  proof); loading ground `#C8C2DE` via tokens; attribution restyled** (UX2).
- **`window.pryzmPerf` instrumentation** (INSTR1) — `.on()/.report()/.reset()`; unarmed reads
  print `UNMEASURED — these are not zeros`.

## 2. FOUNDER DECISIONS TAKEN TODAY (all recorded in contracts/ISSUE-LOG)

- **C87 CW-Region-3**: a curtain wall's region face is the **MULLION, always** (`73beef12`).
- **L-762 Cesium ion tier: DEFERRED** ("we dont for now") — valid until the first paying
  customer; two ready fixes recorded. The stamp is ion's server describing the FREE tier;
  Google tiles stream through it; the direct Google key is shadowed by branch order.
- **Slab datum = TOP face** (C92 §10).
- **C15 curtain-wall door = panel KIND** (not hosted opening — L-1075 records the inverted
  commit message; trust the contract and code over prose).

## 3. OPEN DECISIONS (founder or contract, parked not lost)

- **L-1181**: THREE instanced-pick mechanisms coexist; recommendation C93 > ADR-0076.
- **Pinned grids**: may a pinned grid be DELETED? Two live answers.
- **L-1104/L-1010/L-1090/L-1026**: browser-verification items from the morning list.
- The **step badge emits at 8.5px** (legible contrast, very small) — taste call.

## 4. LANES AT HANDOFF

CLOSED CLEAN: PERF2, WJ2, SNAP1, ENV1, CW4, SV2, UX2, INSTR1, INST1, HR4(→see log), plus the
morning's 12. STOPPED WITH RESIDUE PRESERVED: RN1 (L-1149 landed at `218b274e`; contracts
never minted), WJ1 (probe at `218b274e`). LIVE AT WRITING: **SL3** (displacement fix +
L1178 reload + the mullion `hostType` arm — `CWRegion3MullionFace.test.ts` in flight),
**MT4** (structural family in flight). If their files are gone from `git status`, they landed.

## 5. THE DEPLOY RECIPE THAT WORKS (Windows)

```bash
git worktree remove --force C:/pryzm-deploy/tree; git worktree add --detach C:/pryzm-deploy/tree HEAD
cd C:/pryzm-deploy/tree && DOCKER_HOST= bash tools/deploy/fly-manual-deploy.sh   # ~25 min
bash tools/deploy/fly-bundle-proof.sh                                            # MANDATORY 6/6
```
⚠ `DOCKER_HOST=` (empty) is required: flyctl's release phase otherwise parses the Windows
npipe docker context and dies AFTER pushing the image. ⚠ NEVER hand-type `flyctl deploy` —
nine build-args, silent in both directions (contract §3).

## 6. METHOD RULES THE DAY PAID FOR

- **Ask whether the condition can EVER be true** — five bugs today were UNSATISFIABLE, not
  broken (By-Slab's input destroyed by its own activation ×2, the grid bar gating on `!!obj`,
  snapping's 3-D "2-D" distance, the curtain-wall `alert()` at a captive pointer).
- **A test that stubs the thing under test proves nothing**; a suite CI cannot see cannot go
  red; an unarmed counter must say UNMEASURED, not 0.
- **`git commit --only` always; never `git add -A`; never `git stash`** (global stack).
- Read **COMPILER_RC from the compiler**, never a wrapper whose last statement is an echo.
- A grep for one spelling is not a census; exact non-movement is evidence of a discarded
  write; an executed probe outranks a confident reading — including the orchestrator's
  (L-1075 is mine).
