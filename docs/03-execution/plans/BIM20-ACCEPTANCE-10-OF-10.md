# BIM 2.0 — the 10/10 acceptance plan

> **Stamp**: 2026-08-11 · **Branch**: `main` · **Status**: PLAN, opened today ·
> **Founder directive**: *"before we need to have BIM 2.0 10/10 accepted. plan, document and
> implement"* — then the same for BIM 3.0.
>
> **Measured baseline**, not estimated: [`BIM20-CERTIFICATION-RESULTS.md`](../../04-reference/BIM20-CERTIFICATION-RESULTS.md)
> — 34 operations · **0 VERIFIED · 10 PARTIAL · 24 FAILED**.
> Evidence sources: [continuity deliverable](../../04-reference/BIM30-CONTINUITY-DELIVERABLE.md) ·
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
in the [continuity deliverable](../../04-reference/BIM30-CONTINUITY-DELIVERABLE.md), and several
of them measure things BIM 2.0 waves 1–4 are about to change. Writing them now would mean scoring
against a moving subject. It opens when C1–C7 and C9–C10 are green.

The roadmap it will draw from is §G of that document, and its architecture answer is already
fixed: **NO ARCHITECTURAL REWRITE REQUIRED.**

---

*Not verified: this plan performs no measurement of its own. Every "today" cell is carried from
the cited artefact. The sizes in Wave 1–2 are estimates from the located fix points, and estimates
are not measurements.*
