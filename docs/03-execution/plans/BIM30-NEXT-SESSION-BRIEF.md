# BIM 3.0 — NEXT SESSION BRIEF

> **Purpose**: start a new session at full speed. Paste §0 as the opening prompt, then work §2.
> **Written**: 2026-08-13, after a 68-commit session · **HEAD at write time**: `aa219a31`
> **Read with**: [BIM30-MASTER-COMPLETION-TRACKER.md](BIM30-MASTER-COMPLETION-TRACKER.md) (status)
> and [BIM30-IMPLEMENTATION-ROADMAP.md](BIM30-IMPLEMENTATION-ROADMAP.md) (sequencing).
>
> **Why this file exists**: the last session lost hours to re-reading 13 contracts, agents going
> silent while holding uncommitted work, and lanes colliding in a shared tree. Every one of those
> is preventable and is prevented below.

---

## §0 — THE OPENING PROMPT (paste this verbatim)

```
Read docs/03-execution/plans/BIM30-NEXT-SESSION-BRIEF.md in full, then
docs/03-execution/plans/BIM30-MASTER-COMPLETION-TRACKER.md §-1 and §8.

Do NOT re-read the C67–C80 contracts end to end — §1 of the brief carries the
digest. Open a contract only when you are about to change something it governs,
and then only the relevant §.

First task: §2.1 of the brief — the move-propagation wire. It is a payload-shape
fix with a worked precedent in this repo, and it makes "move a wall, the slab
follows" true. Verify with the gate named there before and after.

Then work §2 in order. Launch lanes using the partition map in §3 and the git
discipline in §4 — both are non-negotiable, they exist because violating them
cost the last session real work.
```

---

## §1 — WHAT YOU DO NOT NEED TO RE-READ

The contract suite is **C01–C80**. For BIM 3.0 only these matter, and here is what each *binds*
you to, so you need not open it unless you are changing what it governs:

| Contract | The one rule that will bite you |
|---|---|
| **C70** | A capability missing any Golden-Chain link **is not complete** — "90 %" is forbidden (§3.2). Four exit codes; **2 and 3 are NEVER absorbable as debt** (§5.1). A floor may never be lowered to go green (§5.3) — that is identical to deleting the gate. Paid debt leaves the ledger **in the commit that pays it** (§5.4). Every comparator must be **watched go red** before it is trusted (§5.6). |
| **C78** | Every operation is DETERMINED-affected, DETERMINED-unaffected, or **UNDETERMINED with a typed reason** — no fourth answer (§1.1). Never infer "unaffected" from missing data (§1.4). The reason union is **closed at 11 members**, in `packages/command-bus/src/consequence.ts`. |
| **C79** | A region is bounded **by reference, never copied coordinates**. Attribution **by construction, never proximity** — "a wrong host is strictly worse than no host" (§2.3). `fallback` populated **at authoring time** (§4.3). Five recomputation states (§5). |
| **C80** | Generation is consequential: plan → validate → preview → approve → execute-the-same-plan → reconcile → undo. Authority is **per element**, three legal answers: `may` / `protected` / `unknown-authority` — and `unknown-authority` **is not permission** (§2.3). |
| **C71** | Six semantics per relationship family. An **untyped enumeration is not a reader** (§1.3). **Writer-first unparking is forbidden** without an ADR naming the first consumer (§2.5). |
| **C72** | A cascade with no listener and a diff with no `prevState` are the same defect. Suppression must be **reversible**. |
| **C73** | One declared tolerance policy; tolerances may **never be widened to go green** (§2.5). |
| **C74** | **No adapter reports a solve it did not perform.** An arm never watched failing is **UNPROVEN** (§6.2). A test whose fixture supplies the value under test proves nothing (§3.4). |
| **C75** | Five origins: AUTHORED · OBSERVED · COMPUTED · INFERRED · REGENERATED. **Never invented.** UNKNOWN is a value **with a reason**, never a blank (§1.4). COMPUTED and INFERRED are **never merged** (§1.2). |
| **C67/C68** | **Mandatory** for any PR registering a bus command: it must be chat-reachable or declared `CHAT_UNAVAILABLE`. Run `tools/ga-gate/check-chat-capability-coverage.ts` before *and* after. |

**The single sentence that generates all of the above:** *a claim is not evidence; run the check.*

---

## §1.5 — THE ACTUAL GOAL (do not mistake §2.1 for it)

**BIM 3.0 is done when every element is fully wired to every element it relates to, for every
operation — or says, in a typed voice, that it cannot determine the answer.**

§2.1 below is **one cell** in that matrix, not the destination. C78's bar is every
`(element, related element, operation)` triple answering DETERMINED-affected /
DETERMINED-unaffected / UNDETERMINED-with-a-reason, and **§19.1 applies no-partial-credit across
the whole product** — one flagship operation working is not the goal.

See the grid in [BIM30-MASTER-COMPLETION-TRACKER.md](BIM30-MASTER-COMPLETION-TRACKER.md) §-2. The
largest category there is **⬜ UNMEASURED**, and ⬜ is not "probably fine". Every ⬜ you measure
will likely become 🔴 before it becomes ✅ — **that is the program working, and the count going
down is honest progress**, not regression.

**Why §2.1 leads anyway**: its fix pattern — *a reference written at creation that nothing reads
at mutation time* — is the template for most other 🔴 move cells. Close it and you have the
worked example for floor finish, ceiling, and roof.

---

## §2 — THE WORK QUEUE, in priority order

### §2.1 🔴 FIRST — the move-propagation wire (one cell, and the template for the rest)

**The defect**: a slab created after boot **never re-projects when its wall moves**. Measured: 0
rebuilds. The reference is perfect and the maths is perfect — the wire is cut.

**Root cause, pinned to the line:**
```
SlabStore.emit fires `bim-slab-{added,updated,removed}` with payload  { id }
                                    packages/event-bus/src/catalog.ts:95-97
SlabDependencyTracker.ts:57-67 guards on  e.detail.slab / e.detail.slabId   ← always undefined
```
`registerSlab()` is therefore unreachable from the event path; only `bootstrap()`
(`initTools.ts:828`, run **once** at wiring) ever fills the graph.

**There is a worked precedent**: `initBuilders.ts:367-383` was fixed for this exact mismatch
(§DOM-EVENT-LISTENER-AUDIT-2026-05-18). Copy its shape.
**`SlabWallConnectivityService.ts:115-122` carries the identical defect** — fix both.

**Verify**: `npx tsx tools/rac-conformance/certification/gates/check-move-propagation.ts`
Currently **[1] DECLARED-LEVEL at 7/7**. Two findings should fall. **Strike them from
`move-propagation.json` in the same commit** or the gate exits 3 STALE.

**Then the second half**: even when reached, only the *mesh* follows — `SlabData.polygon` keeps
the pre-move ring (36 m² drawn vs 24 m² recorded). Fix the write-back too.

### §2.2 The finish families — references correct, read by nothing

`FloorHostReferenceEdge` and `CeilingHostReferenceEdge` have **0 consumers**. Needs a tracker
**and** a coordinate adapter: the finish edge speaks `{x,z}`; the only resolver in the tree
(`WallFaceResolver`, `Segment2D`) speaks `{x,y}`.

### §2.3 Roof cannot follow structurally

`RoofTypes.ts` declares no reference-capable boundary field, and
`packages/schemas/src/elements/Roof.ts` types `boundary` as `Vec3[]` — **Zod strips a reference in
transit**. Needs an L0 schema field before anything else can work. Owner: `@pryzm/geometry-roof`.

### §2.4 C79 §5's five states are not distinguishable

`preserved` and `undetermined` return **byte-identical rings** — the §5.2.1 forbidden collapse,
confirmed by execution. `WallFaceResolver.resolve()` returns null (it *knows*) and
`resolveOrFallback()` absorbs that into a stale segment with no reason attached.

### §2.5 RECOUNT the register

`docs/04-reference/BIM30-GAP-REGISTER.md` is status-bearing as of `c0a1785c` but predates ~45
commits. **Do not increment by hand** (tracker §0.3): re-run the gates and count.

### §2.6 Then the open queue

Provenance **producers** (27 kinds carry the field; all default to `predates-provenance` — honest
and empty; instrumenting producers is the real work) · `room.regenerate` moving from refusal to
safe execution (needs GEN-GAP-2) · matrix rows 4 and 5 · `partOf` (DECLINED, needs an ADR).

---

## §3 — THE LANE PARTITION MAP (prevents the collisions that cost hours)

Assign each lane a **disjoint** file set. These groups were collision-free last session:

| Lane | Owns |
|---|---|
| Slab/move | `packages/geometry-slab/**`, `packages/event-bus/**` |
| Consequence | `apps/editor/src/engine/consequence/**`, `packages/command-bus/**` |
| Graph | `packages/core-app-model/src/SemanticGraph.ts`, `packages/command-registry/src/**` |
| Provenance | `packages/schemas/**`, `packages/room-topology/**` |
| Rooms/gen | `plugins/rooms/**`, `packages/ai-host/**` |
| UI | `apps/editor/src/ui/**` |
| Gates | **one gate file each** — never two lanes in `tools/` at once |

**Shared and dangerous**: `apps/editor/src/engine/initBusHandlers.ts`, `initScene.ts`,
`packages/command-bus/src/*`. If two lanes need one of these, sequence them.

---

## §4 — GIT DISCIPLINE (non-negotiable; each rule was learned by losing work)

1. **`git commit -F msg -- <explicit paths>`**, always. A bare `git commit` takes the **whole
   shared index**, including other lanes' staged files. It happened twice last session.
2. **`git commit --amend` is banned** in a shared tree — it swallowed 31 files from a concurrent
   lane.
3. **Never `git stash`** — the stash stack is global across worktrees.
4. **Never `git add -A` / `git add .`**.
5. **Stage and commit in one tight sequence**, then verify content at HEAD.

---

## §5 — KNOWN-GOOD BASELINES (so a regression is obvious)

| Thing | Value |
|---|---|
| Root tsc | **0 errors** — ⚠ **requires `NODE_OPTIONS=--max-old-space-size=6144`**; without it the compiler can **exit 0 while OOM-ing** and report a false green |
| `check-xss-guards` | exit 0 |
| `check-move-propagation` | exit 1 at **7/7** |
| `check-provenance-coverage` | exit 1 at **1/1** |
| `check-graph-write-coverage` | exit 1 at **2/2** (8 of REQUIRED 9 families) |
| `check-graph-delete-integrity` | exit 1 at **10** |
| `check-no-empty-means-unknown` | exit 1 at **95** |
| `check-constraint-honesty` | exit 1 at **14/14** |
| command-bus | 73/73 · command-registry **386/386** · core-app-model **801/801** |
| room-topology | 145/145 · geometry-slab **134/134** · server **613/613** |
| schemas | 1555 pass · **3 pre-existing failures** (water round-trip ×2 = a deliberate ADR-0124 refine; view-template `detailLevel` ×1) |
| apps/editor | ~9 pre-existing failing files (Cesium, MarketingPages, SiteEntryModel, murciaSiteDispatch, context*, creationToolShortcuts, siteCaptureProvenance) — **do not chase, do not add to** |

---

## §6 — HOW TO RUN LANES SO THEY DON'T STALL

**The default failure mode is a lane going silent while holding uncommitted work.** It happened
to four lanes last session and stranded 74 files.

- **Poll by output, never by launch record**: `git log --since=…` and file mtimes. "I launched it"
  is not "it is working".
- **Tell every lane to commit incrementally**, not at the end.
- **Brief each lane with what its predecessor left** if you are resuming one, and tell it to
  **verify by execution, never trust the inherited work.** Two of last session's best findings came
  from lanes distrusting what they were handed: a provenance abstraction that made its field
  **invisible to the gate measuring it**, and a ledger row **struck as paid on a free-text string**.
- **Give every lane permission to STOP and report** rather than guess. A truthful "this needs its
  own lane" beats a rushed half-fix, and it is how `clearGraphAuthoritative` got an honest
  UNDETERMINED instead of a wrong wiring.

---

## §7 — DEPLOY

Follow `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md` exactly. The traps:

- Run with **only** `DOCKER_CONFIG=/tmp/empty-docker-config` — **add no MSYS exports** (§6.6.1;
  the script defends itself and the global export breaks its own `curl`).
- **Check the builder app name every time** (`flyctl apps list | grep builder`) — the legacy
  builder gets reaped and the replacement is minted at 8 GB, needing a resize to **16384**.
- **The §5 bundle proof is mandatory** and must read **values, not lengths** — 39 characters of
  garbage passes a length check. A silently-rewritten build-arg once shipped green.
- "Pushing image done" then a crash ⇒ **delivery failed, not the build**. Reference-deploy the
  pushed tag; never re-run the full script.
