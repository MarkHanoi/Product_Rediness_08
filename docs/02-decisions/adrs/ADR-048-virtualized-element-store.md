# ADR-048 — Virtualized ElementStore with Spatial LRU Streaming

| Field | Value |
|---|---|
| Status | **Proposed** — 2026-05-08 |
| Closes | Phase J.3 (45-CW-SLAB-BATCH-IMPLEMENTATION-PLAN.md) |
| Required by | 1M-element milestone (quarterly) |
| Owner | State architecture lead |
| Constraint reference | C03 §3 (store contract), C05 §1.2 (persistence), C10 NFT-16 (memory <1.5GB) |

---

## Context

All PRYZM element stores (`WallStore`, `SlabStore`, `CurtainWallStore`, `FurnitureStore`, …) are backed by **Zustand + Immer**. The full element graph lives in JavaScript heap memory for the lifetime of the project session.

At current scale (≤10,000 elements), this is fine: ~60MB heap footprint, mutations take <5ms. At 1M elements:

- **Memory**: ~6GB heap for element data alone — exceeds NFT-16 limit of 1.5GB.
- **Mutation cost**: Immer draft proxy wrapping an object graph of 1M elements takes 100–500ms per mutation (doc 48 §6.2.5). Every `wall.create` bus event triggers Immer to diff 1M-element draft.
- **Serialisation**: `ProjectSerializer.snapshot()` iterates all elements — O(n). At 1M elements: 2–10s serialise time. Breaks autosave.

### Current state

```typescript
// WallStore (simplified)
const useWallStore = create<WallState>()(immer((set) => ({
    walls: {},                        // ← all walls in memory
    add: (w) => set(draft => { draft.walls[w.id] = w; }),
    ...
})));
```

Every subscriber (builders, VDT, NME) receives a new `walls` reference on every mutation — React re-renders all 1M wall representations simultaneously.

### Options evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Virtualized store: in-memory LRU cap of 50,000 elements; spatial eviction; stream from PostgreSQL on demand | Bounded heap; works with existing Zustand API surface | Streaming latency on cache miss; requires persistence-client wiring |
| **B** | IndexedDB-first: all elements in IndexedDB; store holds only the 1,000 visible elements | Minimal heap; true offline | IndexedDB random-access latency 1–3ms per element; poor batch performance |
| **C** | Columnar store: replace Zustand with a flat typed-array store (like an in-process database column) | Cache-optimal; 10× mutation speed | Full store rewrite; breaks all existing subscribers |
| **D** | Split stores by level: one Zustand store per level, evict whole levels from memory | Coarser granularity; simpler | Levels can have 100k+ elements — doesn't fully solve the problem |

---

## Decision

**Option A — Virtualized store with spatial LRU cap of 50,000 elements per store**, backed by the existing `IndexedDBStore` persistence layer (C05 §1.2):

**Architecture**:

```
VirtualizedWallStore:
  _lruCache: LRUMap<string, WallElement>  ← max 50,000 entries
  _dirtySet: Set<string>                  ← elements modified since last flush
  
  get(id): WallElement | undefined
    → LRU hit: return from cache
    → LRU miss: fetch from IndexedDB (async); insert into LRU; evict LRU tail if over cap
  
  add(element): void
    → insert into LRU; mark dirty
    → if LRU > 50,000: evict by spatial distance from camera (via CameraPositionService)
  
  flush(): void            ← called by persistence-client on autosave
    → write _dirtySet to IndexedDB in one batch transaction
    → clear _dirtySet
```

**Spatial eviction**: elements are evicted in order of **distance from camera position** — elements furthest from the active viewport are evicted first. `CameraPositionService.getWorldPosition()` provides the eviction pivot. This ensures the current working area stays in memory.

**Zustand compatibility**: `VirtualizedWallStore` exposes the same `{ walls, add, update, remove }` API surface as `WallStore`. The `walls` object becomes a `Proxy` that traps `Object.keys()` to return only cached keys and traps property access to trigger async LRU fetch. Existing subscribers see no API change.

**Immer elimination**: At 1M-element scale, Immer draft proxying is O(n) on mutation. `VirtualizedWallStore` replaces Immer with direct mutation + structural clone on the element level only (not the full store graph). Each `add/update/remove` patches the element in the LRU directly — no full-store draft.

---

## Consequences

### Positive

- Heap: bounded at `50,000 × ~600B/element = ~30MB` per store. Across 10 element stores: **≤300MB** — within NFT-16.
- Mutation cost: O(1) insert into LRU map (no Immer draft over 1M elements).
- Serialisation: only `_dirtySet` elements flushed per autosave cycle — O(changed elements), not O(all elements).

### Negative / constraints

- **Cache miss latency**: `get(id)` on a cold element incurs 1–3ms IndexedDB fetch. Builders and NME must tolerate async element access. Phase H.1 (crop culling) already culls non-visible elements — miss rate should be low for the active viewport.
- **C03 §3 invariant**: stores are data-only. `VirtualizedWallStore` must NOT call builders directly. Eviction fires `storeEventBus.emit({ type: 'wall.evicted', id })` — builders respond via their existing subscription.
- **CRDT compatibility**: `YjsDocAdapter` patches element state via store mutations. The virtualized store must not evict an element that has a pending CRDT sync (tracked via `_pendingSyncIds: Set<string>`).
- **IndexedDB dependency**: `VirtualizedWallStore` depends on `IndexedDBStore` (C05 §1.2). If IndexedDB is unavailable (private browsing on some browsers), degrade to full in-memory store with a 50,000-element hard cap and a warning banner.

---

## Implementation gate

ADR-048 is **Proposed**. Before implementation begins:

1. Prototype `VirtualizedWallStore` for walls only (1M synthetic elements via `generateWallFixture()`).
2. Measure heap before/after with `performance.measureUserAgentSpecificMemory()`.
3. Verify existing `WallFragmentBuilder` receives `wall.evicted` events and correctly removes geometry.
4. Verify `ProjectSerializer.snapshot()` reads from IndexedDB for evicted elements and produces a complete snapshot.
5. Update to **Accepted** and merge prototype.

---

## References

- doc 48 §6.2.5 (Zustand + Immer scaling analysis)
- `packages/core-app-model/src/stores/WallStore.ts` (target for virtualisation)
- `packages/sync-client/src/IndexedDBStore.ts` (backing persistence)
- C03 §3 (store data-only invariant), C05 §1.2 (IndexedDB persistence contract), C10 NFT-16 (memory budget)
