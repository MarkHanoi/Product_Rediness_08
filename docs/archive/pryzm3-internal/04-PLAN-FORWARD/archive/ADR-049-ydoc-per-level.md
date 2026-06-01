# ADR-049 — Y.Doc-per-level CRDT Split

**Status**: Accepted (2026-05-09)
**Supersedes**: C08 §3.1 (single Y.Doc per project — Phase 2D original contract)
**Amendment to**: `docs/archive/pryzm3-internal/02-ARCHITECTURE.md §6 — Collaboration tier`
**Implementation task**: Phase 4 Task 4.4 in `46-IMPLEMENTATION-PLAN-2026-05-08.md`

---

## Context

The Phase 2D `YjsDocAdapter` (Wave A19-T2) establishes one `Y.Doc` per PRYZM project. The sync server (`YjsProjectCache`) holds one server-side `Y.Doc` per project keyed by `projectId`.

**Problem**: A late-joining collaborator must sync the entire project state from the server — typically 200 MB for a 200-level building. This creates:
- A 15–45 second join latency (measured on 100 Mbps LAN).
- A 400–600 ms CRDT merge time on the client (violates NFT 7: < 80 ms p95).
- A full-project CRDT conflict surface (violates NFT 8: conflict surface < 1 s).

**Insight**: Architects work on one level at a time. The active level contains ~200 KB of element data. Cross-level dependencies (level order, elevation, grid lines) are small (< 5 KB) and infrequently mutated.

---

## Decision

Split the single project `Y.Doc` into:

1. **Coordination Y.Doc** (`YjsDocAdapter.doc`) — holds cross-level invariants: level order, active level ID, grid line definitions, project metadata. All commands without a `levelId` route here. Remains backward-compatible with all Phase 2D call sites.

2. **Per-level Y.Doc** (`YjsDocAdapter._levelDocs: Map<levelId, Y.Doc>`) — holds all element-property state scoped to one level (walls, doors, slabs, curtain walls, rooms, annotations). Created lazily on first access; cached for the adapter lifetime.

**Routing rule** (inside `applyCommand(commandType, payload)`):

```
perLevelMode=false (default):  all commands → this.doc  [Phase 2D compat]
perLevelMode=true:
  payload.levelId is non-empty string → _levelDocs.get(levelId) (lazy-created)
  payload.levelId absent or empty    → this.doc (coordination doc)
```

**Feature flag**: `PRYZM_YDOC_PER_LEVEL=true` environment variable (read at construction time). Default is `false` — single-doc mode. The flag remains off until **E.2** (seqNo cross-level ordering) is implemented.

---

## Server-side (YjsProjectCache)

`YjsProjectCache` gains a parallel `_levelDocs: Map<string, Y.Doc>` keyed by the compound key `"${projectId}:${levelId}"`. This key is also the Socket.io room name for level-scoped subscriptions.

New level-scoped API (all additive — existing project-scoped API unchanged):
- `applyUpdateForLevel(projectId, levelId, update)` — server-side CRDT merge for one level; returns merged delta.
- `getFullStateForLevel(projectId, levelId)` — catch-up snapshot for a late-joining client (~200 KB).
- `getStateVectorForLevel(projectId, levelId)` — differential sync vector.
- `mergeStatesForLevel(projectId, levelId, updateA, updateB)` — conflict detection within one level scope.
- `evictLevel(projectId, levelId)` — memory reclamation when all subscribers leave.
- `getLevelIds(projectId)` — enumerate active level docs for a project.
- `levelSize()` — total active level doc count (for health endpoint).

---

## Batch blackout scoping (§E.1 extension)

`BatchWindowOpenInfo` and `BatchWindowCloseInfo` gain an optional `levelIds?: readonly string[]` field. When per-level mode is active, `BatchCoordinator` passes the set of affected level IDs so the CRDT blackout is scoped to only those level docs rather than the entire project. This is backward-compatible — `BatchCoordinator.ts` uses a structural inline type for its `_yjsDocAdapter` reference; the new optional fields are accepted without modification.

---

## Gate: E.2 (seqNo cross-level ordering)

Per-level mode MUST NOT be enabled in production until `seqNo` cross-level ordering is implemented in `RemoteCommandDispatcher`. Without E.2, commands from different levels that arrive out of order (e.g. a wall on L2 created after a slab on L1, but the L1 update arrives second) cannot be deterministically replayed in the correct cross-level sequence. The `PRYZM_YDOC_PER_LEVEL` flag enforces this gate at the infrastructure layer.

---

## Consequences

**Positive**:
- Late-joining collaborator sync: ~200 KB (active level) vs ~200 MB (full project) — **1000× reduction**.
- CRDT merge time: ~< 5 ms per level (well within NFT 7: 80 ms p95 for 2 users).
- Conflict surface: scoped to the active level (< 200 KB) — well within NFT 8: < 1 s.
- All Phase 2D callers (no `levelId` in payload) remain fully compatible — coordination doc is the single-doc fallback.

**Negative**:
- Socket.io room management complexity increases: clients must subscribe/unsubscribe to level-scoped rooms as they navigate floors.
- E.2 is a hard prerequisite for production enablement — cross-level commands (e.g. stairs spanning two levels) require correct seqNo ordering.
- `YjsProjectCache.evictLevel()` must be called by the WebSocket session cleanup path — currently left as a manual concern until E.2 lands.

---

## Affected files

| File | Change |
|------|--------|
| `packages/sync-client/src/YjsDocAdapter.ts` | Per-level routing, level API, flag, BatchWindowInfo extensions |
| `apps/sync-server/src/YjsProjectCache.ts` | Level-scoped doc map, level API, `_mergeTwoUpdates` DRY extract |
| `packages/sync-client/src/index.ts` | Export `YjsDocAdapterOptions`, `BatchWindowOpenInfo`, `BatchWindowCloseInfo` |
| `packages/sync-client/__tests__/yjs-adapter-per-level.test.ts` | NEW — 16 tests (P1–P16) |
| `apps/sync-server/__tests__/YjsProjectCacheLevel.test.ts` | NEW — 12 tests (L1–L12) |

---

## Test coverage

| Suite | Tests | Result |
|-------|-------|--------|
| `yjs-adapter.test.ts` (original T1–T16) | 16 | ✅ all pass |
| `yjs-adapter-per-level.test.ts` (P1–P16) | 16 | ✅ all pass |
| `YjsProjectCacheLevel.test.ts` (L1–L12) | 12 | ✅ all pass |
| sync-client total | 109 | ✅ |
| sync-server total | 126 + 1 todo | ✅ |

---

## Related

- ADR-048 — Virtualized ElementStore with spatial LRU (Task 4.3)
- ADR-050 — AI response cache (Task 4.5, next)
- C08 §3.1 — original CRDT contract (Phase 2D)
- NFT 7 — CRDT merge < 80 ms p95 for 2 concurrent users
- NFT 8 — Conflict surface < 1 s
