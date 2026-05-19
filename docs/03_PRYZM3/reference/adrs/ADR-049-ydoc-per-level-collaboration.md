# ADR-049 — Y.Doc-per-Level Collaboration Architecture

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-05-08 |
| Closes | Phase J.4 (45-CW-SLAB-BATCH-IMPLEMENTATION-PLAN.md) |
| Required by | 1M-element milestone (quarterly) |
| Owner | Collaboration lead |
| Constraint reference | C08 §3.1 (CRDT contract), C05 §1.2 (persistence), C10 NFT-16 (memory) |

---

## Context

PRYZM uses a **single `Y.Doc`** per project session. All element mutations across all levels are encoded as Yjs operations against this shared document. `YjsDocAdapter.applyUpdate()` applies remote CRDT operations to the store layer; `YjsDocAdapter.applyCommand()` encodes local mutations as Yjs ops.

At current scale (≤10,000 elements), a single Y.Doc works well. At 1M elements:

- **Sync message size**: a full state vector (`Y.encodeStateAsUpdate`) at 1M elements produces ~200MB binary message. Late joiners must download 200MB before they can render anything.
- **Merge cost**: `Y.applyUpdate()` on a 200MB document takes 3–8 seconds (CPU-bound merge algorithm).
- **Memory**: the Yjs document model in JavaScript heap is ~2× the raw element data — 400MB for CRDT metadata alone at 1M elements.
- **Batch blackout**: E.1 measures the batch blackout window at 11.4s (doc 48 §4.3). With a single Y.Doc, all concurrent operations against any element are blocked during the entire batch. Splitting by level allows operations on un-batched levels to proceed unblocked.

### Current state

```typescript
// YjsDocAdapter (simplified)
const ydoc = new Y.Doc();
const ywalls = ydoc.getMap<WallElement>('walls');      // all walls, all levels
const ycurtainwalls = ydoc.getMap<CWElement>('curtainWalls');  // all CWs, all levels

// Late joiner syncs:
provider.on('sync', () => {
    Y.applyUpdate(ydoc, fullStateVector);   // ← 200MB download + 8s merge at 1M elements
});
```

### Options evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Y.Doc-per-level: independent `Y.Doc` per level ID; server assembles full project from sub-documents on demand | Level-scoped sync (download only visible levels); batch blackout scoped to one level; parallel merge | Server must aggregate cross-level queries; inter-level CRDT operations need coordination |
| **B** | Y.Doc sharding by element type: one Y.Doc per `(elementType)` | Simpler than level-split; batches don't span types | Does not reduce sync message size (all walls across all levels still in one doc) |
| **C** | Selective sync: only sync visible levels via awareness protocol | No architectural change; works with single Y.Doc | Full state vector still downloaded; visible-level filtering is advisory not structural |
| **D** | Single Y.Doc with delta sync: only exchange deltas after state vector comparison | Reduces bandwidth for incremental updates | Still requires full state vector download for new joiners |

---

## Decision

**Option A — Y.Doc-per-level**, with server-side sub-document assembly:

**Architecture**:

```
Client (per session):
  activeLevel:  Y.Doc for the user's active level   ← always loaded
  visibleLevels: Map<levelId, Y.Doc>                ← loaded on viewport demand
  
YjsDocAdapter:
  _levelDocs: Map<levelId, Y.Doc>
  
  getOrCreateLevelDoc(levelId: string): Y.Doc
    → create Y.Doc if not present
    → connect to sync-server room `project:{projectId}:level:{levelId}`
  
  applyCommand(element, levelId):
    const doc = this.getOrCreateLevelDoc(levelId);
    doc.getMap('walls').set(element.id, element);  // level-scoped

  onBatchWindowOpen({ batchId, levelIds }):
    → pause CRDT on levelIds only
    → other levels remain live

Server (sync-server):
  rooms: Map<`project:${projectId}:level:${levelId}`, Y.Doc>
  
  /api/projects/:id/full-state
    → assembles all level docs into a project snapshot (for export/serialisation)
```

**Late joiner optimisation**: new client loads only the **active level** Y.Doc on first connect (`~200KB` for a typical 5,000-element level vs `~200MB` for the full project). Additional levels load lazily as the user navigates.

**CRDT blackout scoping**: `onBatchWindowOpen({ batchId, levelIds })` now accepts `levelIds[]`. The batch pauses CRDT only on the affected levels — operations on other levels (e.g., a collaborator editing Level 2 while a batch runs on Level 1) proceed without interruption.

**Cross-level invariants**: operations that span levels (e.g., a curtain wall grid that references slabs on two levels) use a **coordination vector** — a lightweight `Y.Map<levelId, seqNo>` on a dedicated `_coordination` Y.Doc per project. This doc is tiny (<1KB) and always loaded.

---

## Consequences

### Positive

- Late joiner sync: `~200MB` → `~200KB` (active level only) — 1000× reduction.
- Batch blackout: scoped to affected levels; collaborators on other levels unblocked.
- Memory: CRDT metadata only for loaded levels. At 5 levels visible: `~5 × 2MB = ~10MB` CRDT overhead (vs `~400MB` for full project at 1M elements).
- Server-side room management: `sync-server` already uses socket.io rooms — the change is adding level-scoped room names.

### Negative / constraints

- **Server migration**: `sync-server` must add level-scoped room routing. Existing `project:{projectId}` room preserved for backward compatibility during rollout.
- **`YjsDocAdapter` complexity**: `_levelDocs: Map<levelId, Y.Doc>` adds lifecycle management. Level doc must be disconnected and disposed on level delete (`pryzm-level-deleted` event).
- **C08 §3.1 CRDT contract**: the contract's definition of "the Y.Doc" must be updated to "the level Y.Doc for the element's level". Existing contract text is backward-compatible (still one Y.Doc per context — context is now a level, not a project).
- **E.2 dependency**: `seqNo` ordering (E.2, currently blocked) becomes more important with level-scoped docs — clock drift between level docs could cause ordering issues. E.2 must be unblocked (server column added) before J.4 production rollout.

---

## Implementation gate

ADR-049 is **Proposed**. Before implementation begins:

1. Prototype `YjsDocAdapter` with `_levelDocs` map; verify `applyCommand` routes to correct level doc.
2. Prototype `sync-server` level-scoped rooms; verify two clients editing the same level converge.
3. Verify cross-level invariant: curtain wall referencing slabs on two levels resolves correctly.
4. Measure late-joiner sync time before/after with `performance.now()` around `Y.applyUpdate()`.
5. Update to **Accepted** and merge prototype.

---

## References

- doc 48 §6.2.3 (Y.Doc scaling analysis)
- `packages/sync-client/src/YjsDocAdapter.ts` (implementation target)
- `apps/sync-server/` (server-side room management)
- Phase E.1 (`§E1-CRDT-BLACKOUT`) — confirms 11.4s blackout window; J.4 reduces to per-level scope
- C08 §3.1 (CRDT collaboration contract)
