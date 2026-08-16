# BIM 2.0 — the 10/10 acceptance plan

> **Stamp**: 2026-08-11 · **Branch**: `main` · **Status**: **CLOSED-OUT 2026-08-12 at 9/10** —
> see the §0.1 closing entry. The original plan text below is preserved unedited beneath it,
> per the rule that a plan that rewrites its own predictions cannot be audited.
>
> **Founder directive**: *"before we need to have BIM 2.0 10/10 accepted. plan, document and
> implement"* — then the same for BIM 3.0.

## 0.1 CLOSING ENTRY — 2026-08-12

**Final score: 9/10, deployed to production and bundle-proven (SHA `52bfb2ba`, proof 6/6).**
The measured trajectory, every point an executed run: persistence **24 FAILED → 11 → 8 → 5 → 0**
· undo/redo **12 FAILED → 0** · `certify.ts` grades **DECLARED-LEVEL** · cert-ratchet pinned at
`{persistence: 0, undoredo: 0}`, shrink-only.

| # | Criterion | Closed by | Evidence |
|---|---|---|---|
| C1 | Identity round-trip | `50725deb` + `f941b39a` | `check-identity-roundtrip` **0 CLEAN**, 17/17 kinds keep id **and** GUID |
| C2 | State round-trip | `3c9b75b5` + `88717441` | persistence **0 FAILED**, zero undocumented divergences; exclusions enumerated per ADR-0319, printed per row |
| C3 | Undo → State A | `8552de14` | 15/15 PROVEN, four rows with **zero** exclusions |
| C4 | Redo → State B | `8552de14` | 15/15 — **without** the patch layer ADR-0319 predicted (overturned by measurement, recorded in the ADR) |
| C5 | No dead/shadowed/lying verbs | `80845b3e` | lies 3→0 (all three now refuse) · SHADOWED 14→9 · LIVE 101→106 |
| C6 | Authoritative state provable | `be425841` + `80845b3e` | wall/slab/room registry-adopted with same-instance (`toBe`) proofs; UNPROVABLE-NO-STORE 168→109 |
| C7 | Honest reports | `dcf646a0` + `60c6acf9` + `3ee632f6` | refit-or-refuse naming both numbers · typed graph refusals · wall-delete edge purge with verbatim-restore undo |
| **C8** | **Collaboration** | **OPEN — founder decision** | code side PROVEN (hosting edge survives concurrent editing locally; WS auth fail-closed, mutation-proved 15/20); [decision packet](L-391-COLLAB-DEPLOY-DECISION.md) |
| C9 | Gate honesty | `2b1e7e99` | 0 blind, 0 MISCONFIGURED; the green-and-blind compile gate (~90 fabricated PASS lines/run for its life) un-blinded; every ratchet exits 3 on growth |
| C10 | Certification in CI | `e5addac8` | the empty-seed proof: a maximally broken run **looked better than any real one** and now exits 2 MISCONFIGURED; stale-artefact and publication guards included |

**9/10 was the declared arithmetic maximum without the sync server, and the plan said so on day
one so the number could not be quietly redefined.** C8's residue is exactly one founder decision.

**Follow-ups that survive the close-out — none of them silently absorbed:**
1. **`wall.create` / `slab.create` are readback-negative and `room.create` dispatch-throws** on
   the composed bus (plugin handlers write DTO stores). *Newly measurable* because C6 made the
   stores reachable — recorded here because the measurement itself lives in a gitignored ledger
   (`runtime-harness/.liveness-output/`) and the generated verb register still grades all three
   UNKNOWN. Also newly visible: `view.create` (TypeError), `sheet.create` / `schedule.create` /
   `hierarchy.createSite` (no handler answers a registered verb).
2. The **9 remaining SHADOWED** verbs (bridge designated winner in every case, per-verb read-back
   tests required) and the **11 unadopted store kinds**.
3. The undo **gesture race**, pinned RED-BY-DESIGN by 3 `it.fails` at the 250 ms window —
   awaiting the founder's §UNDO-GESTURE-ID decision.
4. The **27 packages failing isolated compilation** (masked by root `skipLibCheck`) and the
   **8 post-freeze XSS sites** — surfaced by C9, owned by their territories, exit-3-fenced.
5. `persist:opening` MISCONFIGURED for its kind (store holds 0 records after seed) — honest, open.

Everything below this line is the plan as written on 2026-08-11.

---

> **Measured baseline at opening**, not estimated: [`BIM20-CERTIFICATION-RESULTS.md`](../../04-reference/BIM20-CERTIFICATION-RESULTS.md)
> — 34 operations · **0 VERIFIED · 10 PARTIAL · 24 FAILED**.
> Evidence sources: the continuity deliverable (`BIM30-CONTINUITY-DELIVERABLE.md`, deleted in the
> 2026-08-15 corpus collapse — see git history) ·
> [EV-03](../../04-reference/bim30-evidence/EV-03-change-impact.md) ·
> [EV-04](../../04-reference/bim30-evidence/EV-04-semanticgraph-write-coverage.md).

---

## 0. What "10/10" is allowed to mean

A score is only worth having if it can **fail**. So each of the ten criteria below is a
**pass/fail measurement produced by an executable harness**, never a judgement, and each names the
artefact that decides it. Three rules govern the scoring, all learned the hard way this session:

1. **A criterion scores PASS only when a harness says so on a run that could have said otherwise.**
   The certification harness already demonstrates this — it diffs against a *tampered* state to
   prove the comparator can detect a difference at all.
2. **Emptiness is never a pass.** Any harness that cannot establish its subject exits
   **MISCONFIGURED (2)** and scores FAIL. A comparator reporting "0 divergences" must also report
   how many objects it compared.
3. **No criterion may be scored by a tolerance list that is written to make it pass.** The
   documented-tolerance list ships **empty**; entries require an ADR.

**Current score: 0 / 10.** Not one criterion is fully met today. C9 is closest.

---

## 1. The ten criteria

| # | Criterion | Decided by | Today | Gap |
|---|---|---|---|---|
| **C1** | **Identity round-trip** — every element kind restores with its original id **and** `ifcData.guid` | `check-identity-roundtrip` over `persistence.cert.ts` | **FAIL** | stairs + beams lose identity outright (F-2); GUID re-minted for all kinds (F-1) |
| **C2** | **State round-trip** — restored state equals authored state, or differs only by an ADR-ratified tolerance | cert persistence comparator | **FAIL** | F-1 audit fields; F-3 +15 mm/reload drift; F-4 phantom frame fields |
| **C3** | **Undo returns to State A** for every mutating verb | `undoredo.cert.ts` | **FAIL** | 12 of 18 red; `_renderVersion` +2 per cycle |
| **C4** | **Redo returns to State B** | `undoredo.cert.ts` | **FAIL** | redo re-*executes* rather than re-applying a patch |
| **C5** | **No dead, shadowed or lying verbs** — every registered verb dispatches to a live handler and reports what it did | C69 register + CA-21 liveness | **FAIL** | SHADOWED 14 · UNKNOWN 172 · 3 observed liveness lies |
| **C6** | **Every mutating verb moves authoritative state (V3)** and it is provable headlessly | CA-21 + ADR-0318 store adoption | **FAIL** | 168 UNPROVABLE-NO-STORE; 12 kinds still ABSENT-headless |
| **C7** | **Reports are honest** — refusals are typed and name the reason; no path returns `[]` for a failure | refusal-identity gate + code sweep | **FAIL** | `SpeculativeEngine` returns `[]` for a missing method; `RoomGraphService` conflates 3 cases |
| **C8** | **Collaboration preserves relationships** — two clients edit a wall and its hosted door; both converge with the hosting edge intact | new `check-collab-graph-integrity` | **FAIL — BLOCKED** | no transport deployed (leg C). **Founder decision, not engineering** |
| **C9** | **The gate suite is honest** — zero blind gates, zero MISCONFIGURED, no ratchet exceeded, ledger used only for declared-level failures | `run-all.ts` | **NEAR** | 4 gates failing; 0 blind; exit-3 contract live |
| **C10** | **The certification runs in CI** and cannot print a pass on a broken run | `ci.yml` + `minFiles` floors | **FAIL** | harness exists but is not wired into CI |

**C8 is the ceiling.** Until the sync server is deployed, C8 cannot be scored by any amount of
engineering, and therefore **10/10 is unreachable**. 9/10 is reachable. This is stated here so the
number is never quietly redefined to fit what was achievable.

---

## 2. Implementation waves

Ordered by dependency, not by size. Each item names its verified fix point.

### Wave 1 — identity (unblocks C1, and every other criterion that compares state)

| Item | Fix point | Size |
|---|---|---|
| **W1-1** stairs + beams keep their id on import | `ImportProjectCommand.ts:680` (add `id:`), `:875` (add `beamId:`) — both loops already hold the id; the failure path on the next line logs it. Mirror **§PERSIST-L1**, the May-2026 fix the editor loader received and this path did not | 2 lines |
| **W1-2** GUID stability across restore | `ifcData.guid` must be carried, not re-minted — it is the IFC round-trip join key | small |
| **W1-3** audit-field contract | **decision first**: are `createdAt`/`modifiedAt`/`version` authoritative or derived? C13 §2 demands byte-compatible round-trips. Then either carry them or ratify a tolerance by ADR | ADR |
| **W1-4** +15 mm drift | loader merge for plumbing/furniture `position.y` | small |
| **W1-5** phantom frame fields | loader `findOpeningElementData()` merge | small |

### Wave 2 — invariants that already have a gate (unblocks C2, C7)

| Item | Fix point |
|---|---|
| **W2-1** re-clamp openings when a wall shrinks | call the existing `WallOccupancyStore.clampToWall` inside `UpdateWallBaselineCommand` + `UpdateWallHeightCommand`. Verified: 2 production call sites today, **both opening-side, zero wall-side** |
| **W2-2** make the shipped fast path reachable | `WallStore.updateDoor:1230` / `updateWindow:1166` emit with **no `prevState`** → `classifyWallDelta` falls to `whole-level`. **Two arguments.** Also fixes the ADR-057 drag defect |
| **W2-3** typed refusals for missing methods | `SpeculativeEngine.ts:100/111` call `getEdges`, which does not exist; both guards are permanently true. Call `getTargets`; refuse with a reason instead of `[]` |
| **W2-4** type `window.semanticGraphManager` | `src/global-window.d.ts:193` is `any` — which is why `PhysicsEngine.ts:380`'s positional call compiles. Typing it makes the bug a **compile error** |
| **W2-5** delete-wall removes its graph edges | the only kind that doesn't, while `DependencyResolver.ts:274` comments that it does |

### Wave 3 — the gates that keep it true (unblocks C9, C10)

`check-identity-roundtrip` · `check-derived-regenerable` · `check-propagation-reaches` (must
assert **both** a listener and a `prevState`-carrying emitter — EV-03 proved either alone is
insufficient) · wire the certification into `ci.yml`. Every gate obeys the four exit-code contract
(`0` clean · `1` declared-level · `2` MISCONFIGURED, never absorbable · `3` RATCHET EXCEEDED,
never absorbable) and declares a `minFiles` floor.

### Wave 4 — reachability (unblocks C5, C6)

Per-kind ADR-0318 store adoption (wall, room, slab first — they gate everything graph-shaped) ·
CA-21 read-backs turning the three liveness lies red · resolve the 14 SHADOWED registrations.

### Wave 5 — collaboration (unblocks C8) — **FOUNDER-GATED**

Deploy the sync server (auth on WS upgrade + ~$5–10/mo infra), flip `VITE_COLLAB_CRDT` **staging
only**, then run `check-collab-graph-integrity`. Only after this can C66 tiers move
CLAIMED → HELD, and only then is 10/10 arithmetically available.

---

## 3. Then BIM 3.0

The BIM 3.0 10/10 plan is **not** written yet, and deliberately so: its criteria are the §I gates
in the continuity deliverable (`BIM30-CONTINUITY-DELIVERABLE.md`, deleted 2026-08-15 — see git
history), and several
of them measure things BIM 2.0 waves 1–4 are about to change. Writing them now would mean scoring
against a moving subject. It opens when C1–C7 and C9–C10 are green.

The roadmap it will draw from is §G of that document, and its architecture answer is already
fixed: **NO ARCHITECTURAL REWRITE REQUIRED.**

---

*Not verified: this plan performs no measurement of its own. Every "today" cell is carried from
the cited artefact. The sizes in Wave 1–2 are estimates from the located fix points, and estimates
are not measurements.*
