# Continuation status — element-creation audit ledger

Resumable state ledger for the continuation pass. Not a derivative audit document (Discipline Rule 1).
Base: `4a4b35c0`. Opened 2026-08-30.

## Seven-fact count — the only row that describes the product

| | authored | dispatchable | reachable | renders 3D | renders plan | persists | exports |
|---|---|---|---|---|---|---|---|
| **Before (2026-08-29)** | 29 | 26 | 21 | 21 | 15 | 21 | 13 |
| **After** | _pending_ | | | | | | |

## Wave status

| Wave | Task | Status | Gate RC before | Gate RC after | Commit |
|---|---|---|---|---|---|
| 1 | check-layer-boundaries | IN PROGRESS | **3** — upward 105/102 · unclassified 15/13 · banned-3p 123/113 · sdk-bypass 186/182 | | |
| 1 | check-graph-write-coverage | IN PROGRESS | **3** — 4 findings vs named ledger 0 | | |
| 2 | check-batch-creation-coverage | PENDING | 1 | | |
| 2 | check-no-commandmanager | PENDING | 1 (declared level) | | |
| 3 | 4 blind comparators | PENDING | — | | |
| 4 | plan view 15 → ? | PENDING | — | | |
| 4 | export 13 → ? | PENDING | — | | |
| 4 | dimension · selection · grid · structural · section-view | PENDING | — | | |
| 4 | roof update · column batch · beam bus leg · slab readback | PENDING | — | | |
| 4 | bathroomPod · ceiling · curtain-wall | PENDING | — | | |
| 5 | read-back coverage (7 verbs / 3 families ≈ 2%) | PENDING | — | | |
| 6 | 10 proposed patches + 7 contract corrections | PENDING | — | | |

## Wave 1 measured targets

**check-graph-write-coverage** — 4 findings, ONE shape: REQUIRED relationship families with a
writer and NO typed production reader — write-only state nobody can query (C71 §1.3).
`hosts` · `boundedBy` · `connectedTo` · `contains`. Each has exactly one allowlist-only mention in
`packages/ai-host/src/graph/GraphQueryService.ts` (:143 :147 :145 :148); an allowlist for a dynamic
reader is not a typed reader. NB this gate carries SIX executed controls in both directions — it is
**not** a blind comparator.

**check-layer-boundaries** — four arms, tracked separately (merging them makes all four unreadable):

| Arm | Measured | Baseline | Over |
|---|---|---|---|
| upward imports | 105 | 102 | +3 |
| unclassified packages | 15 | 13 | +2 |
| banned third-party | 123 | 113 | +10 |
| SDK-facade bypasses | 186 | 182 | +4 |

Banned-3p is `@thatopen/components` concentrated in `core-app-model` (31), `plugins/annotations` (24),
`apps/editor` (23+5), `geometry-furniture` (8), `geometry-slab` (5), `input-host` (5).

⛔ `eslint-plugin-boundaries` is OUT OF SCOPE. `eslint.config.js:402-416` documents the resolver as a
deliberate non-choice; `check-layer-boundaries.ts` is the authority by design. Not a finding.

---

## WAVE 1 LANE B — `check-graph-write-coverage` · VERDICT: ALL FOUR FINDINGS **REFUTED**

**Nothing was changed.** Route taken is none of (a)/(b)/(c): the four findings are **false
positives from gate blindness**, not gaps. HARD STOP 3 fired — the capability is REACHABLE under
another name, and an own-name search for a reader cannot see it.

**RC BEFORE = 3** (`npx tsx tools/ga-gate/check-graph-write-coverage.ts` → `4 finding(s) against a
NAMED ledger of 0`). **RC AFTER = 3, identical output** — no file was touched, no ceiling moved
(`git status --porcelain tools/ packages/ai-host/ packages/core-app-model/` → clean of my work).
Root typecheck `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit -p tsconfig.json` →
**RC=0, 0 `error TS` lines** (RC=134 without the heap flag is OOM, not a type error).

### All four families ALREADY have a refusal-bearing typed reader with live production consumers

| family | reader (`packages/core-app-model/src/SemanticGraph.ts`) | production consumers |
|---|---|---|
| `hosts` | `getHostedOpenings(wallId)` :1444 | `packages/ai-host/src/SemanticQueryEngine.ts:185`, `:461` |
| `boundedBy` | `getBoundingWalls(roomId)` :1291 | `packages/ai-host/src/SemanticQueryEngine.ts:176`; `apps/editor/src/engine/consequence/WallDeleteConsequencePlanner.ts:767` (injected via `wallDeletePlannerComposition.ts`) |
| `connectedTo` | `getConnectedRooms(roomId)` :1012 | `SemanticQueryEngine.ts:164`, `packages/ai-host/src/WorldModelAdapter.ts:218` |
| `contains` | `getContainedElements(roomId)` :1061 | `WorldModelAdapter.ts:219`, `apps/editor/src/ui/dataworkbench/HierarchyTreePanel.ts:618` |

Each is exactly the gate's own **(r4) `DEDICATED_READERS`** shape: one family per method, a typed
read of that family inside `SemanticGraph.ts`, a real production caller. They are simply **not
registered** in that CLOSED map (`check-graph-write-coverage.ts:343-352`, three entries:
`getJoinedWalls`, `getElementsSittingOn`, `getHostWall`). The gate skips `SemanticGraph.ts` itself
(`if (isUnionFile || other) continue;`), so an unregistered dedicated reader is invisible on both ends.

### Root cause is ONE commit, and it was an IMPROVEMENT scored as a regression

`847a16e0` *"fix(§GR13): «0 rooms adjacent» and «nobody ever looked» were the same []"*
(2026-08-18 10:25:43) — 8 files, **none under `tools/ga-gate/`**. Its diff deletes precisely the raw
(r1) reads that were supplying reader credit and replaces them with the refusal-bearing wrappers:

```
git show 847a16e0 -- packages/ai-host/src/SemanticQueryEngine.ts packages/ai-host/src/WorldModelAdapter.ts
-  const targets = semanticGraphManager.getTargets(r.id, 'connectedTo');
-  const doors   = semanticGraphManager.getTargets(r.id, 'boundedBy').flatMap(wallId =>
-      semanticGraphManager.getTargets(wallId, 'hosts').filter(tid => {
-  const containedIds = semanticGraphManager.getTargets(room.id, 'contains');
+  const connected  = semanticGraphManager.getConnectedRooms(r.id);
+  const bounding   = semanticGraphManager.getBoundingWalls(r.id);
+  const hosted     = semanticGraphManager.getHostedOpenings(wallId);
+  const containsQ  = semanticGraphManager.getContainedElements(room.id);
```

It landed **2h46m after** the last edit to the gate (`228e9f17`, 2026-08-18 07:39:41), which is why
the map was never extended. Upgrading a bare `getTargets` — the C71 §7.h anti-pattern the gate's own
`DEDICATED_READERS` docblock exists to reward — is what turned this gate red.

### The sound fix, and why this lane did not apply it

Four entries in `DEDICATED_READERS`. That is **not** a ceiling raise (the ledger stays at 0) and not
a scope narrowing (it widens detection to a mechanism the gate already models) — but it is in
`tools/ga-gate/check-graph-write-coverage.ts`, which this lane is forbidden to touch.

⚠ **The naive four-line patch is UNSAFE for one of them.** `DEDICATED_READERS` matches
`\.<name>\s*\(` on **any receiver**. `getContainedElements`, `getBoundingWalls` and
`getHostedOpenings` are unique repo-wide (verified by grep across `packages apps plugins`, excluding
`node_modules`/`dist`/tests), but `getConnectedRooms` collides:
`2 semanticGraphManager.getConnectedRooms · 2 roomGraphService.getConnectedRooms ·
1 roomQueryService.getConnectedRooms · 2 qs.getConnectedRooms`. `RoomGraphService` is a **different
graph** (C71 §4.3 / §7.g), so that entry needs receiver-aware matching or it mints exactly the
cross-graph coverage inference the gate forbids elsewhere.

### Proposed ISSUE-LOG rows (continuing from L-12846)

| id | row |
|---|---|
| **L-12847** | `check-graph-write-coverage` scores `hosts`/`boundedBy`/`connectedTo`/`contains` as having NO typed reader. **FALSE.** All four have refusal-bearing dedicated readers in `SemanticGraph.ts` with live consumers; they are absent from the CLOSED `DEDICATED_READERS` map (gate :343-352). RC=3 is 4 false positives against a ledger of 0. |
| **L-12848** | Root cause: `847a16e0` (§GR13) replaced the raw `getTargets(…, 'X')` reads in `SemanticQueryEngine.ts` / `WorldModelAdapter.ts` with the refusal-bearing readers and did not extend the gate. **A gate that rewards the anti-pattern it was written to end.** Fix = register the four readers; the row and the map must move in the same commit, the same rule the contract-index gate had to be built to enforce. |
| **L-12849** | `DEDICATED_READERS` matches `\.<name>\(` on any receiver. `getConnectedRooms` exists on `semanticGraphManager` (SemanticGraph) **and** `roomGraphService` / `roomQueryService` (`@pryzm/spatial-index` — a different graph, C71 §4.3). Registering it as-is would credit `connectedTo` from cross-graph call sites. Needs receiver-aware matching before the L-12847 fix is applied. |
| **L-12850** | The gate's six executed controls do **not** cover this shape: none plants a *dedicated reader that is not in the map*. Add a seventh control — a synthetic family whose only reader is an unregistered dedicated method must be reported as UNREGISTERED-READER, never as ABSENT — otherwise the next reader upgrade re-reds this gate the same way. |
| **L-12851** | Separate, real, and **not** what the gate is reporting: `GraphQueryService` still answers `hosts`/`boundedBy`/`connectedTo`/`contains` through the dynamic `getTargets(elementId, relationshipType as RelationshipType)`, so the AI query surface returns a confident `{ok:true, targets: []}` where the dedicated readers would REFUSE. This is the §GR13 / §CONTEXT-DATA-HONESTY defect, unfixed at the one surface where `[]` becomes English in a prompt. `partOf` already has the correct shape (`_partOf`, ADR-0328) — route the other four the same way. |

**Unrelated, not mine:** `git status` shows `M tools/rac-conformance/certification/results/graphruntime.json`, absent from the session-start snapshot. This lane ran no certification; it belongs to a concurrent lane.
