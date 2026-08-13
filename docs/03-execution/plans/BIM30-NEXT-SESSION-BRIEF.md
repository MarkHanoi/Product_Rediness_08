# BIM 3.0 — NEXT SESSION BRIEF · THE PATH TO 50 %

> **Purpose**: open a new session at full speed and drive the counted figure from **30 % to 50 %**.
> **Written** 2026-08-13 after a 70-commit session · **HEAD** `aa219a31` (deployed, bundle proof 6/6)
> **Companions**: [MASTER-COMPLETION-TRACKER](BIM30-MASTER-COMPLETION-TRACKER.md) (status + the
> three bars) · [IMPLEMENTATION-ROADMAP](BIM30-IMPLEMENTATION-ROADMAP.md) §3.1 (what "closed" means)
>
> **Why this file exists**: the last session lost hours to re-reading 13 contracts, lanes going
> silent holding uncommitted work, and collisions in a shared tree. All three are solved below.

---

## §0 — PASTE THIS AS THE OPENING PROMPT

```
Read docs/03-execution/plans/BIM30-NEXT-SESSION-BRIEF.md in full — §2.0 FIRST,
it records what landed in the last ten minutes of the previous session and what
is still broken. Then BIM30-MASTER-COMPLETION-TRACKER.md §-3, §-2 and §-1.

BEFORE ANY CODE: ask me two things.
  1. What did you SEE when you moved a wall on the deployed build? The slab fix
     is proven in a unit harness, NOT in a browser. Do not claim it works.
  2. L-847 — which Data workbench ships, dataworkbench/DataWorkbench.ts or
     data/buckets/AuditBucket.ts? The model tree is unreachable until that is
     decided, and it is a decision, not a patch. Do not guess; do not delete
     either one.

Do NOT re-read contracts C67-C80 end to end. §1 here carries the digest. Open a
contract only when you are about to change what it governs, and only that §.

TARGET THIS SESSION: 25/82 -> 41/82 counted (30% -> 50%).

Execute §2 in order. Step A is a RECOUNT and it must run first — ~45 commits
landed after the register was last stamped, and several rows are already closed
but uncounted. Do not guess the number; run the gates.

Then launch the lanes in §3 IN PARALLEL using the partition map. Every lane brief
in §3 is paste-ready. Enforce §4's git discipline verbatim — each rule there was
learned by losing work.

Poll lanes by commits and file mtimes, never by launch records. A lane that has
written nothing in 15 minutes is stalled: message it to commit-or-report.

Report the counted figure only after a recount produces it. Never increment it
by hand.
```

---

## §1 — THE CONTRACT DIGEST (so you never re-read 13 contracts)

| Contract | The rule that will bite you |
|---|---|
| **C70** | A capability missing any Golden-Chain link **is not complete** — "90 %" is forbidden (§3.2). Exit **2 and 3 are NEVER absorbable** (§5.1). A floor may never be lowered to go green (§5.3) — identical to deleting the gate. Paid debt leaves the ledger **in the commit that pays it** (§5.4). Every comparator **watched go red** before trusted (§5.6). UNPROVEN is neither pass nor fail (§2.2). |
| **C78** | Every operation: DETERMINED-affected / DETERMINED-unaffected / **UNDETERMINED with a typed reason** — no fourth answer (§1.1). Never infer "unaffected" from missing data (§1.4). Union **closed at 11 members**, `packages/command-bus/src/consequence.ts`. **§19.1 no-partial-credit applies ACROSS the element × relationship product.** |
| **C79** | Bounded **by reference, never copied coordinates**. Attribution **by construction, never proximity** — "a wrong host is strictly worse than no host" (§2.3). `fallback` at **authoring time** (§4.3). Five recomputation states (§5); §5.2.1 forbids collapsing `preserved` into `undetermined`. |
| **C80** | Generation is consequential: plan → validate → preview → approve → execute-the-same-plan → reconcile → undo. Authority **per element**: `may` / `protected` / `unknown-authority`, and **`unknown-authority` is not permission** (§2.3). |
| **C71** | Six semantics per family. **An untyped enumeration is not a reader** (§1.3). **Writer-first unparking forbidden** without an ADR naming the first consumer (§2.5). One family per PR (§2.6). |
| **C72** | A cascade with no listener and a diff with no `prevState` are the same defect. Suppression must be reversible. |
| **C73** | One declared tolerance policy; **never widen a tolerance to go green** (§2.5). One canonical implementation per predicate family. |
| **C74** | **No adapter reports a solve it did not perform.** An arm never watched failing is **UNPROVEN** (§6.2). A test whose fixture supplies the value under test proves nothing (§3.4). |
| **C75** | AUTHORED · OBSERVED · COMPUTED · INFERRED · REGENERATED. **Never invented.** UNKNOWN is a value **with a reason** (§1.4). COMPUTED and INFERRED **never merged** (§1.2). New fields optional with an UNKNOWN default (§2.5). |
| **C67/C68** | **Mandatory** for any PR registering a bus command: chat-reachable or declared `CHAT_UNAVAILABLE`. Run `check-chat-capability-coverage.ts` before *and* after; never weaken a baseline. |

**The sentence that generates all of it:** *a claim is not evidence; run the check.*

---

## §2 — THE PATH FROM 30 % TO 50 %

**25 of 82 closed today. 50 % = 41 of 82. You need +16 rows.**

### STEP A — RECOUNT FIRST (likely worth **+6 to +10 rows on its own**, ~30 min)

The register (`docs/04-reference/BIM30-GAP-REGISTER.md`) is status-bearing as of `c0a1785c` but
**predates ~45 commits**. These rows are believed closed and **uncounted** — verify each by running
its gate, then update the register's Status column and §9.0 distribution:

| Row | Why it is probably closed now | Verify with |
|---|---|---|
| **PV-01** | unknown origin no longer upgraded to `auto-topology` | `check-provenance-not-invented` → exit 1 at 2/2 |
| **PV-02** | repaired boundary distinguishable from detected | same gate + `7b015805` |
| **PV-03** | five-value union exists in `packages/schemas` | `ls packages/schemas/src/provenance/ValueOrigin.ts` |
| **PV-04** | **27 element kinds carry provenance**, ledger 28 → 1 | `check-provenance-coverage` → exit 1 at 1/1 |
| **PV-07** | all three C75 gates exist and run | run all three |
| **GR-01/04** | `contains` has a first-party writer **and** a rebuild path | `check-graph-write-coverage` → exit 1 at 2/2 |
| **GR-05/07** | `sitsOn` + `hostedBy` typed readers landed | same gate; 8 of REQUIRED 9 |
| **GR-12** | move-time mutation **measured** (it was UNPROVEN) | `check-move-propagation` → exit 1 at 7/7 |
| **MT-09** | isolated compile **measured at 26**, target `< 27` | already run; cite the reading |
| **MT-10** | XSS gate exit 0, baseline tightened | `check-xss-guards` → exit 0 |
| **CE-01/02** | 10 of 10 C70 gates exist; Geometry axis has a subject | `221fdef7` |
| **PR-06** | load-window `try/finally` landed | `4dbed18f` |

⚠ **Rule**: a row closes on an **executed gate**, not a commit subject. If the gate disagrees with
the commit message, **the gate wins** — that is how MT-10 was correctly re-opened last session.

### STEP B — THE HIGH-YIELD CLUSTERS (+8 to +12 rows, parallel)

| Cluster | Rows | Why it is fast |
|---|---|---|
| **Constraint evidence** | CO-02, CO-03, CO-05, CO-06, CO-07, CO-10 | **16 of 17 families lack executable evidence.** One harness, then per-family fixtures — the pattern repeats. `check-constraint-honesty` is already at 14/14 and each family struck is a row. |
| **Predicate canonicalisation** | GE-02, GE-03, GE-04 | `check-predicate-canonical` exists and is pinned. **61 rival point-in-polygon bodies → 1.** One family per PR (C73 §3.5). |
| **The `[]`-means-unknown drain** | GR-10 | Ledger at **95 files**. Reference pattern is `bed7aa67`; each fix needs a differentiating test. Bulk work, low risk. |
| **Propagation** | PR-03, PR-07, PR-10, PR-11 | `RECONCILABLE_TYPES` names 13 types with **zero consumers**; the real reconcile handles walls and slabs only. Either wire them or narrow the list — **narrowing a claim to the truth is an acceptable fix** (C72 §5). |

### STEP C — THE PRODUCT FIX (not a row, but it is the promise)

**§2.1 below.** Do it early: it is small, it is the template for three other families, and it makes
"move a wall, the slab follows" true.

---

## §2.0 ✅ WHAT CHANGED AT THE VERY END OF THE LAST SESSION — read before §2.1

**§2.1's first half is DONE** (`798f2cfd`). Do not re-do it. What follows is what is left.

### The slab now follows a moved wall — measured 0 rebuilds → 1

Both `SlabDependencyTracker:57-67` and `SlabWallConnectivityService:115-122` guarded on
`e.detail.slab` / `e.detail.slabId` — fields `SlabStore.emit` **has never sent** (it sends `{ id }`).
`registerSlab()` was unreachable from the event path; only `bootstrap()` ever filled the graph, so
every slab created **or loaded** after boot was invisible. Both now resolve the record via
`slabStore.getById`, accepting either payload shape. `check-move-propagation` **7/7 → 6/6**, ledger
row struck in the same commit, geometry-slab **134/134**.

Two pinned tests were **INVERTED, not deleted** — they asserted `rebuilds` stayed empty in order to
*prove* the defect, so left alone they would have forbidden the fix.

### ⚠ THREE THINGS THAT ARE **NOT** FIXED — do not assume otherwise

1. **The stored polygon still does not follow.** Only the drawn mesh does: 36.000 m² drawn vs
   **24.000 m² recorded** in `SlabData.polygon`. So schedules, area take-off, export and any
   downstream region detection still read the **pre-move** shape. This is the remaining slab row in
   `move-propagation.json` and it is the **next fix**.
2. **Browser behaviour is UNPROVEN.** The evidence is a unit harness — it proves the wire carries
   the signal, **not** that the viewport redraws. Per [[probe-can-be-wrong-three-ways]] confirm in
   the browser before claiming it works. *Ask the founder what he actually saw.*
3. **Walls still do not extend to join a moved wall.** Untouched — a different subsystem
   (junction re-weld). If a **small** move fails to re-mitre a corner, that is a **new** defect and
   the path is supposed to be gate-proven; investigate rather than assume it is the same bug.

### ⚠ L-847 — THE MODEL TREE IS UNREACHABLE (founder-reported, needs a DECISION not a patch)

There are **two rival Data workbench implementations**. `dataworkbench/DataWorkbench.ts` declares a
`hierarchy` sub-tab and constructs `HierarchyTreePanel`; **the one that actually ships is
`data/buckets/AuditBucket.ts`, which has no sub-tab bar at all** — so there is no path to the model
tree from the shipped UI.

This also **conceals a fix that landed**: `contains` gained its first-party writer, so the Furniture
group could finally render (C71 §5.2 records it *"has never rendered"*) — and it still cannot,
because the panel is not on screen. **Neither implementation was deleted**; one is somebody's
intended surface. **Ask the founder which ships before touching either.**

---

## §2.1 🔴 THE MOVE-PROPAGATION WIRE — SECOND HALF (the first half is done, see §2.0)

**Defect**: a slab created after boot **never re-projects when its wall moves**. 0 rebuilds.
The reference is perfect; the maths is perfect; **the wire is cut**.

```
SlabStore.emit  →  `bim-slab-{added,updated,removed}`  payload { id }
                   packages/event-bus/src/catalog.ts:95-97
SlabDependencyTracker.ts:57-67  →  guards on  e.detail.slab / e.detail.slabId   ← ALWAYS undefined
```

`registerSlab()` is unreachable from the event path; only `bootstrap()` (`initTools.ts:828`, run
**once** at wiring) ever fills the graph — which is why a slab created *or loaded* after boot is
invisible.

- **Worked precedent — copy its shape**: `initBuilders.ts:367-383`, fixed for this **exact**
  mismatch (§DOM-EVENT-LISTENER-AUDIT-2026-05-18).
- **Second site with the identical defect**: `SlabWallConnectivityService.ts:115-122`.
- **Second half**: even when reached, only the *mesh* follows — `SlabData.polygon` keeps the
  pre-move ring (36 m² drawn vs 24 m² recorded). Fix the write-back too.

**Verify**: `npx tsx tools/rac-conformance/certification/gates/check-move-propagation.ts`
Currently **exit 1 at 7/7**. Two findings should fall. **Strike them from `move-propagation.json`
in the same commit** or it exits 3 STALE.

**Then the same pattern for**: floor finish and ceiling (`FloorHostReferenceEdge` /
`CeilingHostReferenceEdge` have **0 consumers**; they also need a `{x,z}`→`{x,y}` adapter, because
the only resolver in the tree speaks `{x,y}`). **Roof is different** — `RoofTypes.ts` has no field
that can hold a reference and `schemas/elements/Roof.ts` types `boundary` as `Vec3[]`, so **Zod
strips it in transit**; roof needs an L0 schema field first.

---

## §3 — LANE BRIEFS, PASTE-READY (launch 6–8 in parallel)

**Every brief must open with this block:**

```
GIT DISCIPLINE (non-negotiable): never git stash; never `git add -A`/`git add .`;
never `git commit --amend`; never `git checkout --`. Commit ONLY with
`git commit -F msg -- <explicit paths>` — a bare `git commit` takes the whole
shared index including other lanes' staged files. Stage and commit in ONE tight
sequence, then verify content at HEAD. Commit INCREMENTALLY, not at the end.

If you are blocked, or the work is bigger than the brief, STOP AND REPORT rather
than guess. A truthful "this needs its own lane" beats a rushed half-fix.

Verify by EXECUTION, never by a commit subject or an inherited claim.
```

| Lane | Owns (disjoint) | Task |
|---|---|---|
| **L1 recount** | `docs/04-reference/BIM30-GAP-REGISTER.md` | §2 STEP A. Run each gate, set Status, update §9.0. Report new CLOSED/OPEN/UNPROVEN. |
| **L2 slab-wire** | `packages/geometry-slab/**`, `packages/event-bus/**` | §2.1 both halves + the second site. Strike ledger rows in the same commit. |
| **L3 finishes** | `packages/command-registry/src/{floors,ceilings}/**`, a new tracker package | Floor/ceiling trackers + the `{x,z}`/`{x,y}` adapter. |
| **L4 constraints** | `packages/constraint-solver/**`, `tools/ga-gate/check-constraint-honesty.ts` | Executable evidence per family; strike each from the ledger as it lands. |
| **L5 predicates** | `packages/geometry-kernel/**`, `tools/ga-gate/check-predicate-canonical.ts` | Point-in-polygon → one canonical impl, **one family per PR**. |
| **L6 empty-drain** | `apps/editor/src/ui/**` (NOT `engine/`) | Next 10 rows of `no-empty-means-unknown-debt.json`, each with a differentiating test. |
| **L7 propagation** | `packages/core-app-model/src/**` | `RECONCILABLE_TYPES`: wire the consumers or narrow the list to the truth. |
| **L8 universal gate** | `tools/rac-conformance/certification/gates/check-relationship-determination.ts` (NEW) | **The bar-3 instrument.** Spec in tracker §-3. Lands RED. |

**Shared and dangerous — sequence, never parallel**: `apps/editor/src/engine/initBusHandlers.ts`,
`initScene.ts`, `packages/command-bus/src/*`, `packages/schemas/**`.

---

## §4 — GIT DISCIPLINE (each rule cost real work to learn)

1. **`git commit -F msg -- <explicit paths>`**, always. A bare `git commit` swept another lane's
   31 staged files into the wrong commit — twice.
2. **`git commit --amend` is banned** in a shared tree.
3. **Never `git stash`** — the stash stack is global across worktrees.
4. **Never `git add -A` / `git add .`**.
5. **Ledger rows are struck in the commit that fixes them** — a fixed row left declared exits 3.

---

## §5 — KNOWN-GOOD BASELINES (a regression is obvious against these)

> ✅ **RE-VERIFIED BY EXECUTION at the end of the session**, after the final commit — not copied
> forward from earlier in the day. Every gate below was re-run and returned the stated reading.
> **If your first run disagrees with this table, something regressed between then and now — do not
> assume the table is stale.** (One gotcha that cost time: `check-graph-write-coverage` lives in
> `tools/ga-gate/`, **not** in `certification/gates/`. Looking in the wrong directory makes a
> healthy gate look crashed.)

| Thing | Value |
|---|---|
| Root tsc | **0 errors** — ⚠ **requires `NODE_OPTIONS=--max-old-space-size=6144`**; it can **exit 0 while OOM-ing** and report a false green |
| `check-xss-guards` | exit 0 |
| `check-move-propagation` | exit 1 at **7/7** |
| `check-provenance-coverage` | exit 1 at **1/1** |
| `check-graph-write-coverage` | exit 1 at **2/2** (8 of REQUIRED 9) |
| `check-graph-delete-integrity` | exit 1 at **10** |
| `check-no-empty-means-unknown` | exit 1 at **95** |
| `check-constraint-honesty` | exit 1 at **14/14** |
| `check-plan-determinism` | exit **0**, 3 planners |
| command-bus 73/73 · command-registry **386/386** · core-app-model **801/801** |
| room-topology 145/145 · geometry-slab **134/134** · server **613/613** |
| schemas 1555 pass · **3 pre-existing failures** (water round-trip ×2 = deliberate ADR-0124 refine; view-template `detailLevel` ×1) |
| apps/editor | ~9 pre-existing failing files (Cesium, MarketingPages, SiteEntryModel, murciaSiteDispatch, context*, creationToolShortcuts, siteCaptureProvenance) — **do not chase, do not add to** |

---

## §6 — RUNNING LANES SO THEY DON'T STALL

**The default failure mode is a lane going silent holding uncommitted work** — it stranded 74 files
last session.

- **Poll by output**: `git log --since=…`, and file mtimes. "I launched it" ≠ "it is working".
- **15 minutes with no write = stalled.** Message it: *"commit what is finished now, or report the
  blocker."*
- **Resuming a killed lane**: tell it exactly what its predecessor left and that the work is
  **suspect, not trusted**. The two best findings last session came from lanes distrusting their
  inheritance — a provenance abstraction that made its field **invisible to the gate measuring it**,
  and a ledger row **struck as paid on a free-text string**.
- **Give every lane permission to STOP.** That is how `clearGraphAuthoritative` got an honest
  UNDETERMINED instead of a guessed wiring.

---

## §8 — THE DOCUMENT MAP (every reference, one place)

### Read these — the program
| Doc | What it is | When |
|---|---|---|
| **THIS FILE** | the plan and the opening prompt | first, always |
| [BIM30-MASTER-COMPLETION-TRACKER](BIM30-MASTER-COMPLETION-TRACKER.md) | **§-3 the 100 % bar · §-2 the matrix · §-1 the first fix · §1 the counted figure** | first, always |
| [BIM30-IMPLEMENTATION-ROADMAP](BIM30-IMPLEMENTATION-ROADMAP.md) | phases 0R–9 + F; **§3.1 the three bars** | when sequencing |
| [BIM30-GAP-REGISTER](../../04-reference/BIM30-GAP-REGISTER.md) | **the 82 rows and their Status column** — the denominator | for the recount |
| [BIM30-READINESS-GATES](../../04-reference/BIM30-READINESS-GATES.md) | per-gate BUILT / SPECIFIED-NOT-BUILT | when building a gate |
| [BIM30-DISPOSITION-DOCKET](../../04-reference/BIM30-DISPOSITION-DOCKET.md) | the only dated CLOSED/EXECUTED rows | when checking history |
| [ISSUE-LOG](../../04-reference/ISSUE-LOG.md) | L-NNN findings — **latest L-847** | append every founder-reported bug |
| [BIM30-CERTIFICATION-PLAN](BIM30-CERTIFICATION-PLAN.md) | the harness, verdicts, exit-code order | when touching certify |
| [BIM30-REASONING-LOOP-PLAN](BIM30-REASONING-LOOP-PLAN.md) | R0–R9 + the golden-operation matrix | when opening a matrix row |

### The contracts — open only the § you are changing
`C70` target/chain/exit-codes · `C78` universal relationships **(the 100 % bar)** · `C79` regions ·
`C80` generation · `C71` graph · `C72` propagation · `C73` geometry determinism · `C74` constraint
honesty · `C75` provenance · `C67`/`C68` chat reachability *(mandatory for any new bus command)* ·
`C16` command authoring · `C11` creation pipeline · `C15` hosted elements · `C03` what a command is.
All at `docs/02-decisions/contracts/`. **The index is `contracts/README.md` — it is the authority
on the suite, which is C01–C68 plus C70–C80.**

### ⚠ Contracts NOT digested in §1, and what that means
§1 digests **C67–C80 only** — those were read in full. **C01–C66 have NOT been read** in the
session that produced this brief; what is known of them comes from `CLAUDE.md`'s summary, which has
been **measurably wrong before** (it claimed the suite was C01–C15 when it was C01–C68, and claimed
a CI enforcement that did not exist). **Before changing anything governed by C01–C66, open that
contract.** Do not infer its content from this brief.

### The deploy path
[DEPLOY-CONTRACT-MANUAL-FLY](../../02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md) — see §7 below.

---

## §7 — DEPLOY (contract: `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`)

1. §6 cover **before** deploying: root tsc (with the memory flag), `check:isolation`,
   `test:server`. Record in `ISSUE-LOG.md` — last entry **L-846**.
2. `flyctl apps list | grep builder` — **the builder gets reaped**; a new one is minted at 8 GB and
   needs `--vm-memory 16384`.
3. Run with **only** `DOCKER_CONFIG=/tmp/empty-docker-config`. **Add no MSYS exports** (§6.6.1 — the
   script defends itself; the global export breaks its own `curl`).
4. `bash tools/deploy/fly-bundle-proof.sh <the-SHA-the-script-printed>` — **mandatory**, and it must
   read **values, not lengths**: 39 characters of garbage passes a length check and once shipped green.
5. "Pushing image done" then a crash ⇒ **delivery failed, not the build**. Reference-deploy the
   pushed tag; never re-run the full script.

**Last deploy**: `aa219a31` → `deployment-01KZXC3JFSGFE41MMPAZE2B2B6`, proof 6/6, live at
https://pryzm.fly.dev
