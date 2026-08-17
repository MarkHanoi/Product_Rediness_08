# SESSION STATE — 2026-08-17 · handoff

> **Baseline**: production is `49befd93`. HEAD is **81 commits** ahead.
> **The two authoritative BIM30 docs remain** `BIM30-IMPLEMENTATION-ROADMAP.md` (plan) and
> `BIM30-MASTER-COMPLETION-TRACKER.md` (state). This file is a session handoff, not a third
> authority — delete it once its contents are absorbed.

---

## 1 — EVERY FOUNDER REQUEST THIS SESSION, IN ORDER

| # | Request | State |
|---|---|---|
| 1 | Resume Half 1 + Half 2 with multiple agents | **DONE** — 5 fleets, ~51 lanes dispatched |
| 2 | Status of active agents (asked ×6) | answered each time from the commit stream, never inferred |
| 3 | "Launch as many as you can to finish Half 1" | **DONE** — 12-lane fleet on the exit-3 breaches + unowned rows |
| 4 | "Continue closing Half 1 and Half 2" | **DONE** — 6-lane fleet, MT-01 + door/window batch families |
| 5 | **L-930** viewport crash, destroyed `ShadowDepthTexture` | **LANE LIVE** |
| 6 | **L-931** camera too far after parcel select | **LANE LIVE — my hypothesis REFUTED** |
| 7 | **L-932** angled wall's neighbours don't follow | **LANE LIVE — my hypothesis REFUTED** |
| 8 | **L-933** level pill UI: brand colour, transparent | **QUEUED, no lane** |
| 9 | **L-934** layered partition renders a tan stretch | **QUEUED, no lane** |
| 10 | **L-935** polyline wall TAPERS on a non-aligned snap | **QUEUED, no lane** |
| 11 | **L-936** L-shaped interior walls don't follow | **QUEUED, no lane — has a smoking gun** |
| 12 | Deploy to Fly per `DEPLOY-CONTRACT-MANUAL-FLY.md` | **NOT DONE — blocked, see §5** |
| 13 | Session handoff (this document) | **DONE** |

---

## 2 — ⭐ TWO OF MY OWN HYPOTHESES WERE REFUTED BY MEASUREMENT. READ THIS FIRST.

I wrote explicit refutation paths into both founder-defect briefs. Both lanes used them and killed
my theory before building on it. **Do not resurrect either.**

| Row | What I claimed | What was MEASURED |
|---|---|---|
| **L-932** | `[WallTransform] gizmo aligned with direction N` proved the gizmo used a CARDINAL axis | `8d20b041` — **"direction N" was a MINIFIED CLASS NAME**, not a direction. The real relationship is **cot(θ)**. |
| **L-931** | `[HomeView] Returned to default viewpoint` was overriding the framing | `e60059e3` — **HomeView has exactly ONE caller: the ⌂ Home button.** Its position last in the trace *is the founder pressing Home* — the workaround the report itself describes. **It is the remedy, not the cause.** |
| **L-931** | the four framing actors RACE, and the racing is the defect | All four read the same poisoned bounds and **AGREE**. Remove the poison and they converge with no arbitration. |
| **L-931** | on a restore MISS the default targets world origin — *"make the default frame the PARCEL"* | The parcel default **was already written and shipped** (§CAM-FRAME-SITE-WHEN-NO-MODEL, L-748). It was **UNREACHABLE, not missing.** |
| **L-931** | `§CULL-PROBE bvCtrMag=3189094` proves the BIM scene is seated geocentrically | **WRONG SYSTEM.** That probe is Cesium's, reporting a TILE's ECEF centre in the geospatial viewport. It says nothing about the BIM scene. |

**The lesson for the next session: a log line read at face value is a hypothesis, not evidence.**
Minified builds rename things; a plausible-looking token can be a class name; and a probe from one
subsystem tells you nothing about another.

### ✅ L-931 IS FIXED — and the root cause is one object

**`GroundShadowCatcher`** — an invisible **4000 × 4000 m** contact-shadow plane centred on the
origin, whose `userData` carried neither `elementType` nor `isHelper`, so **every arm of
`SceneObjectClassifier.shouldExcludeFromBounds` admitted it** into the one bounds population all
four framing actors read.

Both numbers in the founder's trace are closed-form consequences of that single object:
```
maxDim 4000  → _computeCameraDistance() = 4000 × 2            = 8000.0
radius |(4000,0,4000)|/2 = 2828.43 → (2828.43/sin30) × 1.15  = 6505.38 → prints 6505.4
```
**`boundsFramedByCamera` PASSED against the 4 km plane and FAILED against the model** — which is
exactly why the recovery announced *"auto-framed and VERIFIED"* while the model was sub-pixel.

**Measured at the camera's resting pose** after driving the real `zoomToAll()`:
**6505.4 m → 122.6 m**, target offset **> 20 m → < 1 m**. Pose is now bit-identical with and without
the catcher.

⚠ The one-line fix (tag it `isHelper`) was **rejected on measurement**: 15 unrelated call sites read
that flag, and the catcher must keep rendering and keep receiving the sun shadow (L-112 / L-205).
This is **L-749 recurring on PRYZM's own infrastructure** — ADR-0305 §3 enumerated three.js control
types; our own 4 km render aid was never in that set.

---

## 3 — LANES IN FLIGHT (do not duplicate; they commit their own work)

**~30 files in the working tree belong to these lanes.** Do NOT commit them wholesale — that is
inheriting unaudited work, which shipped a defect twice this session (a `TEMP-AB-PROBE`
short-circuit, and a "single chokepoint" that was 1 of 6).

| Lane | Job | Visible artefact |
|---|---|---|
| **L930** | shadow-submit ordering | `RenderPipelineManager.recoveryShadowSubmitOrdering.test.ts` |
| **L931** | the 4 km shadow plane | `L931GroundCatcherPoisonsFraming.test.ts` |
| **L932** | cot(θ) angled-wall follow | `L932AngledWallMove.measure.test.ts`, `WallMoveReweld.ts` |
| **K1** | MT-01 composed-bus readback | `authoritativeStores.ts`, `engineLauncher.ts` |
| **K3** | MT-05 heap identity | `mt05StoreIdentityHeap.spec.ts` |
| **K4** | PV-05 provenance round-trip | `provenanceSliceProductionPath.test.ts` |
| **K2 · K5 · K6** | GE-04 dedup · door/window batch families | — |
| **H9** | CE-05's 45 indirection idioms | `resolve-indirection.ts` |
| **H11** | MT-07 six level records | `resolveLevelAuthority.ts` |
| **F4b** | L-918 Auto mode | plantools handlers |

⚠ `README.md` at repo root is a **stray** (18 lines of npm boilerplate for `3d-view-app`). Not ours.
Do not commit it. `test-results/` and `k1-probe/` are artefacts.

---

## 4 — HALF 1 AND HALF 2

### Half 1 — **53 / 79 = 67.1 %** (tracker §1.0, stamped at `3785eae6`)

⚠ **That reading is already historical** — ~45 lane commits have landed since. It fell from 59/79
because seven carried closures were finally measured and **five were refuted**. Verification
coverage rose 30/59 → **53/53 = 100 %**. *Completion fell precisely because coverage rose.*

**Worst block: C70 model-truth at 2 of 10.** Best: C72 propagation at 12 of 13.

**Exit-3 breaches — the Phase A exit condition.** Started at 9, and every one now has a lane or is
cleared: `region-reference-frame` → exit 0 · `index-can-refuse` → exit 1 + registered (certification
orphans reach **0**) · `epsilon-policy` 324→318, exit 3→1 · `no-empty-means-unknown` cleared at
source · `cast-count`/`cast-unknown` ceiling 215→**100** · `suppression-is-reversible` re-anchored ·
`deterministic-regeneration` **still exit 3 — see the handoff below**.

### Half 2 — **124 findings** (not 125), and **the denominator is wrong**

`acf24bc9` landed `wall.batch.create` whole, taking 125 → 124. `check-plan-determinism` 6/6 clean.

> ⭐ **THE DENOMINATOR IS OVERSTATED AND IT NEEDS A FOUNDER DECISION.**
> The 41-relationship axis **counts all 12 families C71 §2.2 PARKS**. §2.3 is a MUST: *"No coverage
> census … may count a parked family as missing capability."* The gate contains **zero** occurrences
> of "park". Honest capability reading: **112 findings over 29 relationships = 2,900 cells**, not
> 124 / 4,100.
> **The conflict is between two CANONICAL contracts at equal rank** — C78 §20 U-INV-1's exit
> condition says the ledger covers all 26 families; C71 §2.3 forbids counting the parked 12. An
> agent cannot settle that. It needs an ADR or your call. And it is not a unilateral gate edit: the
> ledger is shrink-only, so dropping 12 means asserting the debt was never real.

> ⚠ **And rank families by REACHABILITY, not by finding count.** Of the 89 silent verbs only **23
> are LIVE**; 9 refuse and **57 are UNKNOWN-liveness**. Closing an UNKNOWN-live family moves the
> ledger and changes nothing a user can reach. Lane J2 correctly REFUSED to land on those grounds.

> **The single highest-leverage structural change in the whole 4,100-cell matrix**, named by J0:
> **type `ConsequencePreviewService.preview`'s return.** It is a bare `Promise<ConsequencePlan | null>`
> today, so there are **0 honest-refusal cells** anywhere. Typing that ONE signature converts every
> silent cell of an unrecognised verb into a typed `UNSUPPORTED_ELEMENT_TYPE`.

---

## 5 — DEPLOY: NOT DONE, AND WHY

Production is `49befd93`; HEAD is 81 ahead. The contract is
`docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md` — clean detached worktree at a committed SHA,
16 GB builder, Windows-shaped `DOCKER_CONFIG` (§6.5.6), bundle proof reading VALUES not lengths.

### ✅ Blocker 1 CLEARED — root tsc is green at `fa40c5ba`

Three runs, and **the harness reported "exit code 0" for all three.** The real codes, read from a
file written by `RC=$?` immediately after the process:

| run | real exit | meaning |
|---|---|---|
| 1 | **134** | SIGABRT — **out of memory**, never finished. Reported "0 errors" because it never got there. |
| 2 | **2** | one real error, at HEAD, from `6925992f` |
| 3 | **0** | **clean, 0 errors** — after `fa40c5ba` |

Run 1 needs `NODE_OPTIONS=--max-old-space-size=6144`, the same flag `npm run build` sets. Without it
root tsc does not fail — **it dies**, and a reader who trusts the harness sees a pass.

### ⛔ Blocker 2 STANDS — ~20 lanes are still committing

Several are at the composition root (**K1** changes store registration — P1 territory). A deploy
takes a clean worktree at a committed SHA, so nothing uncommitted leaks — but HEAD moves every few
minutes and a half-migrated composition root would ship.

**When the lanes quiesce:** root tsc → `check:isolation` → `test:server` → deploy from a clean
detached worktree → bundle proof 6/6. The work is genuinely browser-testable — **L-931 camera fix**,
L-918 Auto mode, GE-06 clash detection, L-921 atomicity, L-924 roof follow — so a deploy is warranted
as soon as the tree is still.

---

## 6 — HANDOFFS THAT NEED AN OWNER

1. ⭐ **`check-deterministic-regeneration` is STILL EXIT 3 and blocks `run-all`.** H1 cleared 30
   phantom "stale" rows (all anchor drift, **zero** actually paid) — **and that revealed 3 REAL
   findings that had been hidden behind them**, in `packages/geometry-wall/src/WallCrossesOpening.ts`
   (added by `5b33c439`, after the ledger was measured). *Clearing the drift did not create the
   breach; it revealed it.* **These must NOT be ledgered.**
2. **MT-09's real numbers**, settled by M7 from source: population is **93** packages (not 94),
   **26** failing stable (not 27 — `command-bus` was a transient of the shared tree), **34 of 93 NOT
   PROVEN**. The 8 skips are all ledgered with reasons and exit conditions. ⚠ And **shrink-only
   enforcement DID land** (`2e538fe3`, `6c43ebbe`) — the record saying otherwise was wrong.
   ⭐ M7 also found that **10 of 27 failures have ZERO errors of their own** — the count measures
   *reachability to a broken dependency*, and those dependencies are already on the skip ledger. **The
   failure count and the exclusion list were reporting the same debt twice, in two units.**
3. **The `syncDisposition.ts` gap** — `wall.create` (L-932) and `UPDATE_ANNOTATION` (L-934) both
   replicate NOTHING. Worth ONE lane covering the whole file rather than one verb at a time.
4. **GE-02 / GE-03** were downgraded to UNPROVEN purely because a lane held their gate dirty. They
   need a clean run, not work. **Cheapest two rows in the register.**

---

## 7 — THE DISCIPLINE THAT EARNED ITS KEEP TODAY

- **COMMITTED ≠ REACHABLE.** MT-01's green rested on the wrong runtime — a DTO store the row itself
  says nobody reads.
- **EXIT CODES THROUGH A PIPE ARE LIES.** Cost a false "exit 0" on root tsc (real answer: 134) and
  on MT-09's 25-minute run.
- **EXPECT TO BE REFUTED.** Today: 51-of-136 · "52 % PROSE" · "the 30 stale rows were ZERO paid" ·
  "the predicate was never missing — its ORACLE was blind" · "not rivals, different KINDS" · "the
  SIXTH level record" · **and two of my own hypotheses.**
- **PREFER AN ANCHOR THAT CANNOT DRIFT** — and **test it against control flow**: my own
  `ENCLOSING_DECL` keyed on `if` and `for` until H1's parallel finding exposed it (`6e544d48`).
- **NEVER `git add -A`** with lanes live. **NEVER `git stash`** — the stack is global.
