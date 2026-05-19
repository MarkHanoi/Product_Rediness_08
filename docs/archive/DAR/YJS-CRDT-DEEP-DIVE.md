# Yjs CRDT — Deep Technical Explanation
## Why a BIM Platform Uses a CRDT Layer Instead of Row-by-Row PostgreSQL Persistence

---

## The Core Question

When you change a wall's thickness in a BIM model, why not just run:

```sql
UPDATE elements SET thickness = 250 WHERE id = 'wall-abc-123';
```

This is simple. PostgreSQL is reliable. It has ACID guarantees. Why add an entirely different system — a CRDT — on top of it?

The answer requires understanding a problem that the database model cannot solve: **what happens when two engineers change the same wall at the same time, on different continents, while one of them is on a plane with no internet?**

---

## Part 1 — The Fundamental Problem: Concurrent State

### What "concurrent" actually means in a BIM context

Imagine two structural engineers — Alice in London and Bob in Riyadh — both have the same BIM project open. They are both looking at the same floor slab.

- Alice changes the slab's `thickness` from `200mm` to `250mm`
- At the same moment, Bob changes the same slab's `fire_rating` from `60min` to `90min`

These are different properties on the same element. There is no conflict — both changes should survive. But the database only has one copy of the row.

Now consider a harder case:
- Alice moves a structural column 500mm north
- At the same moment, Bob moves the same column 300mm west

These affect the same property (`position`). After both engineers save, what position should the column be in?

There are only bad answers if you use a database as your coordination mechanism:
- **Last write wins:** Bob's save arrives 12ms after Alice's, so Alice's 500mm north move is silently lost. Alice does not know this happened.
- **First write wins:** Alice's move is accepted, Bob's is rejected with an error. Bob must reload and try again. The UI shows a write failure on a user who did nothing wrong.
- **Lock the row:** While Alice is working, Bob cannot touch the element at all. One user blocks another — BIM coordination becomes a queue.

None of these is acceptable for a professional authoring tool. And we have not even considered the offline case yet.

### The offline case

Bob boards a flight from Dubai to London. He opens his laptop and continues working on the structural model for 7 hours. He has no internet. He moves 40 columns, changes 80 property values, and deletes one redundant beam.

While Bob is in the air, Alice makes 120 changes to the same model.

When Bob's laptop connects to WiFi at Heathrow, what happens?

With a database-centric model:
- You could reject all of Bob's changes ("your session is 7 hours stale")
- You could try to accept Bob's changes by checking each one for conflicts
- You could store Bob's changes and ask a human to manually merge them

All of these are either destructive or require human intervention. At the scale of a 200-person project team, this is not a workflow — it is a coordination disaster.

---

## Part 2 — What a CRDT Is

### The mathematical insight

CRDT stands for **Conflict-free Replicated Data Type**.

The key word is *conflict-free* — not "no conflicts happen," but "the data structure is designed so that concurrent changes always converge to the same result, automatically, without coordination."

The mathematical foundation:

A CRDT is a data structure that satisfies this property:

> Given any two replicas of the same document that have applied the same set of operations (in any order), they will always arrive at the same state.

This is called **strong eventual consistency**. It is a mathematical guarantee, not a best-effort promise.

### How it works: the operation model

Instead of storing and updating **values** (like a database does), a CRDT stores **operations**.

Every change to the document is recorded as an immutable operation with:
- A unique identifier (who made it + a logical clock — a **Lamport timestamp** or **vector clock**)
- The operation type (insert, delete, set)
- The target (which element, which property)
- The value

These operations are **commutative** — they produce the same result regardless of the order they are applied. This is the property that makes offline sync possible.

---

## Part 3 — Yjs Specifically

### What Yjs is

Yjs is a CRDT implementation written in TypeScript (with a C++ core planned). It is used in production by Figma, Linear, Liveblocks, and many other real-time collaboration tools.

Yjs implements a specific CRDT algorithm called **YATA** (Yet Another Transformation Approach), which is optimized for structured data — not just text.

Yjs provides these primitive types:

| Yjs type | Description | BIM use |
|---|---|---|
| `Y.Map` | Key-value store, conflict-free on concurrent key writes | Element properties: `{ thickness: 250, fireRating: "90min" }` |
| `Y.Array` | Ordered list, conflict-free on concurrent insertions | Command history, ordered level list |
| `Y.Text` | Rich text with conflict-free character-level insertions | Element names, comments |
| `Y.Doc` | The root document that contains all shared types | The entire BIM project state |

### The Y.Doc — the container of all shared state

A `Y.Doc` is Yjs's name for a document. For a BIM project, one `Y.Doc` represents the entire live state of that project.

Inside the `Y.Doc`, you might have:

```typescript
const doc = new Y.Doc()

// The element map: elementId → element properties
const elements = doc.getMap<Y.Map<unknown>>('elements')

// The levels array: ordered list of spatial levels
const levels = doc.getArray<Y.Map<unknown>>('levels')

// The relationships map: relationshipId → relationship data
const relationships = doc.getMap<Y.Map<unknown>>('relationships')

// The command log: ordered append-only history
const commandLog = doc.getArray<CommandRecord>('commandLog')
```

Every key in these maps, every entry in these arrays, is a shared type. Changes to them are automatically tracked as CRDT operations.

### How a change is represented internally

When Alice runs:

```typescript
const wallElement = elements.get('wall-abc-123') as Y.Map<unknown>
wallElement.set('thickness', 250)
```

Yjs does not just store `250`. It creates an **operation** that looks like (conceptually):

```
Operation {
  id:        { client: alice_client_id, clock: 1042 }
  type:      'set'
  key:       'thickness'
  value:     250
  target:    elements['wall-abc-123']
  origin:    { client: alice_client_id, clock: 1041 }  // previous state this is based on
}
```

This operation is:
- Stored locally in Alice's `Y.Doc`
- Serialized to a compact binary format (typically 15–50 bytes)
- Broadcast to other clients via WebSocket
- Applied to their local `Y.Doc` copies

Crucially, **the operation contains enough information to be applied in any order relative to other operations and still produce the correct result.**

### The state vector — the mechanism for sync

Every `Y.Doc` maintains a **state vector**: a map from each client ID to the highest clock value seen from that client.

```
Alice's state vector: { alice: 1042, bob: 890, server: 3201 }
Bob's state vector:   { alice: 1038, bob: 895, server: 3201 }
```

When Bob reconnects after his 7-hour flight, his sync-server connection sends:

```
"My state vector is { alice: 1038, bob: 895, server: 3201 }.
 Send me everything you have that I'm missing."
```

The server responds with a binary blob of all operations newer than Bob's state vector — specifically, Alice's operations from clock 1039 through 1042.

Bob's local `Y.Doc` applies these operations. Because CRDT operations are commutative, it does not matter that Bob applied his own 895 operations before receiving Alice's. The result is identical to if they had been applied in any other order.

**This is offline sync without a merge conflict dialog.** No human intervention. No "choose your version." Mathematics guarantees convergence.

---

## Part 4 — The Binary Format and Why It Matters

### Yjs update encoding

Yjs serializes operations to a highly compact binary format. A single property change on one element is typically **15–50 bytes**.

Compare this to:
- A full JSON snapshot of a 10,000-element model: ~5–20 MB
- A PostgreSQL row update for one property: a full round-trip with at least 200 bytes of protocol overhead plus query parsing

For a collaborative session where users are making changes every few seconds, the binary update stream is orders of magnitude more efficient than row-level database writes.

### The two types of binary data Yjs produces

**`Y.Doc.encodeStateAsUpdate()`** — the full document as a binary blob
- Contains every operation ever applied to the document
- Can be used to reconstruct the document from scratch
- Stored as `snapshot JSONB` (actually `bytea`) in PostgreSQL
- Typically 50–200 KB for a complex BIM model (after Yjs's internal compression)

**`Y.Doc.encodeStateVectorAsUpdate(stateVector)`** — a diff update
- Contains only the operations missing from the provided state vector
- Used for synchronization: "here's what you're missing"
- Typically 50 bytes to 50 KB depending on how many changes are being synced

---

## Part 5 — Why Not Row-by-Row PostgreSQL

Let's now answer the original question directly by examining what row-by-row PostgreSQL persistence would require.

### Scenario: 5 users editing simultaneously

In a 5-user collaborative session, each user is making changes at approximately one change per second. That is 5 changes/second hitting the database.

**With row-level PostgreSQL writes:**

```sql
-- User 1 changes wall thickness:
UPDATE elements SET thickness = 250, updated_at = NOW(), updated_by = 'alice'
WHERE id = 'wall-abc-123';

-- User 2 changes the same wall's fire rating simultaneously:
UPDATE elements SET fire_rating = '90min', updated_at = NOW(), updated_by = 'bob'
WHERE id = 'wall-abc-123';
```

Problems:
1. **Race condition:** Both updates target the same row. PostgreSQL serializes them. The second update overwrites the `updated_at` and `updated_by` of the first. Worse, if the application reads the full row before writing (a read-modify-write pattern), the second write could silently overwrite the first write's changes to fields they were not trying to change.
2. **No causal history:** The database row contains only the current value. There is no record of "Alice changed this from 200 to 250 and then Bob changed this from 250 to 300." You lose the operation history.
3. **No offline support:** The row can only be written to by a client with an active database connection. Offline changes have no home.
4. **No merge semantics:** If Alice and Bob both change `thickness` at the same time, PostgreSQL has no concept of "merge these two changes sensibly." It applies them sequentially and the last one wins.
5. **Latency:** Every single property change requires a round-trip to the database. At 5 users × 1 change/second, that is manageable. At 50 users × 2 changes/second, the database becomes the bottleneck.

**With Yjs CRDT:**

Each change is an operation in the local `Y.Doc`. Changes are:
- Applied **locally and immediately** (no latency for the user making the change)
- Broadcast as binary blobs (15–50 bytes) to other clients via WebSocket
- Merged **locally** by each receiving client using CRDT rules
- Persisted to PostgreSQL **periodically** (every N operations or on snapshot triggers), not on every change

The database is not in the critical path of a user making a change. It is the durable storage for the CRDT state, not the coordination mechanism.

### The deeper architectural difference

**PostgreSQL is a shared mutable store:** all clients agree on the truth by writing to and reading from the same rows. Consistency requires coordination (transactions, locks, serialization).

**Yjs is a replicated operation log:** every client has a full local copy of the document. Consistency is achieved by applying the same set of operations to every replica — coordination is not required because the CRDT algorithm guarantees convergence.

```
PostgreSQL model:
Client A ──writes──▶ Database (single truth) ──reads──▶ Client B
                          │
                     (coordination point)
                     (latency required)
                     (lock contention)

Yjs model:
Client A (local Y.Doc) ──broadcasts operation──▶ Client B (local Y.Doc)
         │                                                │
         └──────────────────────────────────────────────▶│
                      (server persists)           (applied immediately)
         (no coordination required)          (same result guaranteed)
```

---

## Part 6 — How the Two Systems Work Together

Yjs and PostgreSQL are not alternatives. They are complementary layers with different responsibilities.

### What Yjs owns

- The **live collaborative state** of the document (the currently active model)
- **Causal history** of every change (who changed what, in what order, relative to what)
- **Conflict resolution** (mathematically guaranteed, no human intervention)
- **Offline queue** (operations made without network connectivity, merged on reconnect)
- **Presence/awareness** (cursor positions, active selections — ephemeral, not persisted)

### What PostgreSQL owns

- **Project metadata** (name, owner, timestamps, org membership)
- **Access control** (who has what role on which project)
- **Yjs snapshots** (periodic serializations of the full `Y.Doc` state)
- **Yjs update log** (the append-only stream of binary operations for catch-up sync)
- **Audit trail** (command log — who, what, when)
- **File references** (pointers to IFC/GLB/DWG files in object storage)
- **ISO 19650 state** (wip/shared/published/archived — enforced by the server, not the CRDT)

### The persistence pattern

```
User makes a change
        ↓
 Applied to local Y.Doc immediately
        ↓
 Rendered instantly (SceneCommitter diff)
        ↓
 Binary update broadcast via WebSocket to sync server
        ↓
 Sync server applies to server-side Y.Doc (merge)
        ↓
 Sync server broadcasts merged update to other clients
        ↓
 Sync server appends binary update to event_log (PostgreSQL)
        ↓         [non-blocking — happens in background]
 Periodic snapshot: Y.Doc.encodeStateAsUpdate() → project_versions.yjs_state
```

The critical observation: the database write (step 9) is **non-blocking and asynchronous** relative to the user's change (step 1). The user gets instant feedback. Durability is provided by the append-only event log, not by synchronous row writes.

### What a Yjs snapshot in PostgreSQL looks like

```sql
-- The snapshot table
CREATE TABLE project_versions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id),
  label       TEXT,               -- "Design Review v3"
  state       TEXT,               -- wip | shared | published | archived
  yjs_state   BYTEA,              -- Y.Doc.encodeStateAsUpdate() output (binary)
  element_count INTEGER,
  created_at  TIMESTAMPTZ,
  created_by  TEXT
);

-- The update log (for catch-up sync)
CREATE TABLE event_log (
  seq        BIGSERIAL PRIMARY KEY,
  project_id TEXT,
  event_id   UUID UNIQUE,
  actor_id   TEXT,
  payload    JSONB,         -- contains the binary Yjs update (base64) + metadata
  created_at TIMESTAMPTZ
);
```

The `yjs_state` column contains the serialized `Y.Doc`. To reconstruct the live document:

```typescript
// Server reconstructing a Y.Doc from a snapshot
const doc = new Y.Doc()
const snapshotRow = await db.query(
  'SELECT yjs_state FROM project_versions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
  [projectId]
)
Y.applyUpdate(doc, snapshotRow.rows[0].yjs_state)  // restore snapshot

// Apply all updates since the snapshot
const updates = await db.query(
  'SELECT payload FROM event_log WHERE project_id = $1 AND seq > $2 ORDER BY seq',
  [projectId, snapshotSeq]
)
for (const row of updates.rows) {
  Y.applyUpdate(doc, Buffer.from(row.payload.update, 'base64'))
}

// doc now contains the current live state
```

---

## Part 7 — The Sync Server's Role

The sync server (`apps/sync-server`) is the relay and persistence layer for Yjs updates. It is not the source of truth — every client has an equally valid copy of the document. The sync server's job is:

1. **Receive binary updates** from WebSocket clients
2. **Apply them to a server-side `Y.Doc`** (the server's authoritative replica)
3. **Broadcast** the merged update to all other clients in the same project
4. **Persist** updates to the `event_log` table in PostgreSQL
5. **Respond to state vector requests** (send missing updates to reconnecting clients)
6. **Enforce soft locks** (prevent simultaneous spatial hierarchy restructuring)

```typescript
// Simplified sync server WebSocket handler
ws.on('message', async (data: Buffer) => {
  const message = decode(data)  // msgpack decode

  if (message.type === 'sync-step-1') {
    // Client sends its state vector: "what do you have that I don't?"
    const stateVector = message.stateVector
    const missingUpdates = Y.encodeStateAsUpdate(serverDoc, stateVector)
    ws.send(encode({ type: 'sync-step-2', update: missingUpdates }))
  }

  if (message.type === 'update') {
    // Client sends a new operation
    Y.applyUpdate(serverDoc, message.update)    // merge into server doc
    
    // Broadcast to all other clients in this project
    for (const client of projectClients.get(message.projectId)) {
      if (client !== ws) {
        client.send(encode({ type: 'update', update: message.update }))
      }
    }

    // Persist to database (non-blocking)
    appendToEventLog(message.projectId, message.update).catch(console.error)
  }

  if (message.type === 'awareness') {
    // Cursor/presence data: broadcast but do NOT persist
    for (const client of projectClients.get(message.projectId)) {
      if (client !== ws) {
        client.send(encode({ type: 'awareness', update: message.update }))
      }
    }
  }
})
```

Note that **awareness (cursor positions, active selections) is broadcast but never persisted.** It is ephemeral state — relevant only while users are connected. This is a distinct concern from the CRDT document state, which must be durable.

---

## Part 8 — The BIM-Specific Adaptation: Semantic Conflict Resolution

Standard Yjs conflict resolution uses Last Write Wins (LWW) on `Y.Map` entries. For BIM, this is sometimes not sufficient.

### Example: two engineers change a wall's thickness simultaneously

- Alice sets `thickness` to `250mm` (she's adding insulation)
- Bob sets `thickness` to `300mm` (he's adding a structural layer)

With pure LWW, one value silently wins. The losing engineer does not know their change was overridden.

### The `CRDTConflictResolver` pattern

PRYZM implements a layer above Yjs that intercepts these cases:

```typescript
class CRDTConflictResolver {
  resolve(key: string, localOp: Operation, remoteOp: Operation): Resolution {
    // Numeric properties: attempt additive delta merge
    if (typeof localOp.value === 'number' && typeof remoteOp.value === 'number') {
      const localDelta = localOp.value - localOp.previousValue
      const remoteDelta = remoteOp.value - remoteOp.previousValue
      
      // If both are additive deltas from the same base, merge them
      if (localOp.previousValue === remoteOp.previousValue) {
        return {
          type: 'merged',
          value: localOp.previousValue + localDelta + remoteDelta
          // Alice added 50mm, Bob added 100mm → result is 350mm
          // (not Alice's 250 overwriting Bob's 300 or vice versa)
        }
      }
    }

    // String/enum properties: cannot auto-merge → surface for user resolution
    return {
      type: 'conflict',
      localValue: localOp.value,
      remoteValue: remoteOp.value,
      actorA: localOp.actor,
      actorB: remoteOp.actor
      // User sees: "Alice set fire_rating to 60min; Bob set it to 90min. Choose one."
    }
  }
}
```

This is a **semantic layer above the CRDT** — Yjs handles the causal ordering and convergence; the conflict resolver adds BIM-domain-specific merge intelligence.

---

## Part 9 — Awareness: The Ephemeral Layer

Yjs has a second protocol alongside the document sync: **awareness**.

Awareness is a map of `{ clientId → presenceState }` that is:
- Broadcast to all clients in the room when it changes
- Never persisted to the database
- Automatically cleaned up when a client disconnects (after a 30-second timeout)

Each client's presence state:

```typescript
interface PresenceState {
  user: {
    id: string
    name: string      // enriched by server (not client-supplied — cannot be spoofed)
    color: string     // assigned on connection
  }
  cursor: {
    x: number         // 3D world position
    y: number
    z: number
    normalX: number   // surface normal for cursor placement
    normalY: number
    normalZ: number
  } | null
  selection: string[] // currently selected element IDs
  activeTool: string  // 'wall' | 'door' | 'select' | ...
}
```

The client updates its awareness on mouse move (throttled to 50ms via coalescing):

```typescript
provider.awareness.setLocalState({
  user: { id: currentUser.id, name: currentUser.name, color: assignedColor },
  cursor: raycaster.intersectionPoint,
  selection: selectionStore.selectedIds,
  activeTool: toolStore.activeTool
})
```

All other clients receive this update and render:
- A colored ghost cursor in the 3D viewport at the cursor position
- The user's name label floating above the cursor
- A colored highlight on any elements they have selected
- Their active tool shown in a "who's doing what" panel in the UI

This entire layer requires zero database interaction. It is pure WebSocket broadcast.

---

## Part 10 — Offline Support: The Full Cycle

Here is the complete offline and reconnection cycle in detail:

### Going offline

1. Client loses network connection
2. Yjs's `WebsocketProvider` detects disconnect (timeout or error event)
3. Provider enters **disconnected state** — all subsequent changes are applied to the local `Y.Doc` only
4. Changes are also written to **IndexedDB** (`y-indexeddb` provider) for durability across page refreshes
5. UI shows "Working offline — changes saved locally"
6. The user continues editing normally — the UX is identical

### While offline

Every change the user makes is a Yjs operation in the local `Y.Doc`. These operations are queued in the provider's **pending update buffer** and also committed to IndexedDB. The user can close their laptop, their browser can crash — on reopen, the IndexedDB provider restores the local `Y.Doc` state.

Meanwhile, other online users are continuing to make changes. Their changes are accumulating in the sync server's `Y.Doc` and being persisted to the event log.

### Reconnecting

1. Network connection restored
2. WebSocket connection re-established to sync server
3. Client performs **sync step 1**: sends its current state vector to the server
   ```
   Client: "My state vector is { alice: 1042, bob: 890, server: 3201 }"
   ```
4. Server performs **sync step 2**: sends all updates the client is missing
   ```
   Server: "Here are Alice's operations from clock 1043 to 1089, and Server's from 3202 to 3310"
   ```
5. Client applies received updates to local `Y.Doc` — CRDT guarantees convergence
6. Client sends its own pending updates (the ones made offline) to the server
   ```
   Client: "Here are Bob's operations from clock 891 to 950, which you're missing"
   ```
7. Server applies and broadcasts them to all other clients
8. All replicas converge to the same state — no conflicts, no user dialogs, no rejected changes

**The mathematical guarantee:** After step 8, every client's `Y.Doc` contains every operation from every actor, regardless of order or timing. The resulting state is identical on every replica.

---

## Part 11 — Performance Characteristics

### Memory

A `Y.Doc` for a complex BIM model (10,000 elements, 50,000 properties) fits comfortably within 50–200 MB in memory. This is because Yjs stores operations, not geometric data. Geometry lives in GLB files in object storage — not in the document.

### Network

Binary update blobs are typically 15–200 bytes per operation. At 10 simultaneous users each making 2 changes per second, the sync server is relaying approximately 400 KB/minute of update data — well within any WebSocket connection's capacity.

### Database writes

With a snapshot interval of every 100 operations (or on state transitions), a busy collaborative session generates approximately 1 snapshot write per few minutes. Compare this to row-by-row writes which would generate 20 database writes per second under the same load.

### Compression

Yjs applies run-length encoding to repeated operations and reuses client IDs as integers. The binary format is 5–10x more compact than an equivalent JSON representation. The full state of a 10,000-element document is typically 50–150 KB as a Yjs snapshot — not megabytes.

---

## Summary: When to Use CRDT vs. SQL

| Concern | Yjs CRDT | PostgreSQL |
|---|---|---|
| **Live collaborative state** | Owner — every keystroke, every move | Not appropriate — latency, contention |
| **Causal history of changes** | Owner — operation log with timestamps | Not appropriate — overwrites lose history |
| **Conflict resolution** | Owner — mathematical guarantee | Not appropriate — no merge semantics |
| **Offline authoring** | Owner — full local replica | Not appropriate — requires network |
| **Presence (cursors, selections)** | Owner — ephemeral, never persisted | Not appropriate — too volatile |
| **Durability (crash recovery)** | Via IndexedDB (client) + event_log (server) | Owner of durable record |
| **Access control (who can do what)** | Not appropriate — CRDT has no notion of permissions | Owner — roles, policies, enforcement |
| **ISO 19650 state machine** | Not appropriate — CRDT cannot enforce state transitions | Owner — server enforces before applying |
| **Cross-project queries** | Not possible | Owner — SQL queries across projects |
| **Billing, audit, compliance** | Not appropriate | Owner — append-only, tamper-evident |
| **File metadata (IFC URLs, sizes)** | Not appropriate | Owner — structured, queryable |

**The design principle:** Yjs owns everything that needs to converge under concurrency or survive offline. PostgreSQL owns everything that needs to be queried, enforced, or reported on.

Neither system is a replacement for the other. They are two layers with precisely complementary strengths.

---

*Document prepared as a technical reference for the DAR / Sidara enterprise BIM platform initiative.*
