# Yjs Snapshots and Point-in-Time Recovery — Explained From Zero
## How the Platform Stores, Protects, and Restores Every Version of a Building Model

---

## The Problem This Solves

Before explaining anything technical, here is the business problem this architecture solves.

It is Thursday afternoon. Forty engineers have been collaborating on a BIM model for six weeks. At 3:47 PM, a structural engineer accidentally deletes an entire floor — 1,200 elements gone. He saves. The change propagates to everyone's screen. By the time anyone notices, twenty people have made further changes on top of the corrupted state.

The question is: **can the platform go back?**

Not just "undo the last action" — but go back to *exactly* what the model looked like at 3:46 PM on Thursday, before the deletion. With all of Wednesday's coordination work intact. With all the correct structural properties that were set that morning.

The answer — if the platform is designed correctly — is **yes, within seconds.**

The mechanism that makes this possible is the combination of **snapshots** (periodic complete copies of the model) and the **update log** (a permanent, ordered record of every single change). Together they form a system called **point-in-time recovery**.

This document explains exactly how that works.

---

## Part 1 — Two Separate Things That Work Together

The recovery system has two distinct components. Understanding what each one is separately makes the combination much clearer.

### Component 1: The Snapshot — a photograph

A snapshot is a complete copy of the entire building model at a specific moment in time — serialized (converted) into a compact binary blob and stored in the database.

Think of it as a **photograph**. If you take a photograph of a room, you capture everything in it at that exact moment — every piece of furniture, its exact position, the colour of the walls, the objects on the shelves. The photograph is a complete, self-contained record.

A Yjs snapshot works the same way. It captures the complete state of the model — every element, every property, every relationship — at the exact moment the snapshot was taken. Stored in the `yjs_state BYTEA` column of the `project_versions` table.

**The limitation of a snapshot:** It is static. The moment after it is taken, the world moves on. If engineers make 500 more changes, the snapshot is already out of date. Taking a new snapshot every few seconds would overwhelm the database with huge binary blobs.

### Component 2: The Update Log — a diary

Between snapshots, every single change is recorded as a tiny entry in a separate table: the **event log** (stored in the `event_log` table in PostgreSQL).

Think of it as a **diary**. If the snapshot is a photograph of the room, the diary records every change made to the room after the photograph was taken: "moved the chair 30cm left," "removed the lamp," "painted the wall blue."

Each diary entry is tiny — typically 20 to 100 bytes — because it only records *what changed*, not the entire room. And the diary is **append-only**: entries are never edited or deleted. Every change ever made is permanently recorded in order.

### The combination

Together, the snapshot and the log give you the ability to reconstruct the model at any point in time:

- Start from the last snapshot before the target time (the photograph)
- Apply every log entry between the snapshot and the target time (replay the diary entries)
- Stop at the exact moment you want
- The result is the model exactly as it was at that specific moment

This is the essence of point-in-time recovery.

---

## Part 2 — What "Binary Blob" Actually Means

The term "binary blob" sounds intimidating. It is not.

**Binary** means the data is stored as raw bytes — zeros and ones — not as readable text.

Your computer stores everything as binary. This document is binary. Every photograph you have ever taken is binary. Every Word document, every email, every song — all binary. Binary is the fundamental language of computers.

When we say the Yjs snapshot is stored as a **binary blob**, we mean the entire building model has been compressed and serialized — converted from its in-memory form (a complex data structure in the computer's RAM) into a sequence of bytes that can be stored in a database column.

### A concrete analogy

Imagine a LEGO model — a complex spaceship with 5,000 pieces. You want to store it in a box to ship it to someone.

**Option 1 — Describe it in words (JSON/text):**
```
"Place a 2x4 red brick at position (0,0). Place a 1x2 blue brick at position (2,0).
Place a 4x4 grey flat piece at position (4,0)..."
```
This is readable, but it takes many pages of text for a 5,000-piece model.

**Option 2 — Take the pieces apart and pack them efficiently (binary):**
Disassemble the model. Put all 2x4 red bricks in a bag labelled R24. Put all 1x2 blue bricks in a bag labelled B12. Record a compact instruction list: "R24:1@(0,0), B12:1@(2,0)..."

The binary approach is far more compact. The same information, in far fewer bytes. A computer can reassemble the model from the compact format just as easily — and much faster.

The Yjs binary format works on the same principle. Instead of storing `{ "wall-001": { "thickness": 250, "fire_rating": "90min" } }` as readable text, it packs the data into a sequence of bytes using efficient encoding. A model that would be 10 MB as JSON might be 200 KB as Yjs binary — 50 times smaller.

### What "BYTEA" means in PostgreSQL

`BYTEA` is the PostgreSQL data type for binary data — "byte array." It tells the database: "Store these raw bytes exactly as given, and return them exactly as stored."

When the application stores a snapshot:
```
database ← [binary blob: 0x59 0x41 0x04 0x00 0x01 0xAF ... 200,000 bytes]
```

When the application retrieves a snapshot:
```
database → [exactly the same binary blob, byte for byte]
```

The database treats it as opaque data — it does not try to interpret or parse the binary contents. It just stores and returns the bytes faithfully.

---

## Part 3 — The State Vector: What It Is and Why It Exists

The phrase "CRDT state vector" appears in the description. You need to understand what a state vector is before understanding how recovery works.

### The problem of distributed changes

In a Yjs collaborative session, changes come from many sources:
- Alice's browser sends changes as she works
- Bob's browser sends changes as he works
- Carol's browser (Carol joined after Alice) sends her changes
- The server itself might apply automated changes (e.g., from an IFC import)

Each of these sources generates changes independently. They do not coordinate with each other before sending — they just send whenever a change is made.

The fundamental challenge: **how does any recipient know which changes it has already received and which it is missing?**

If Alice has been offline and reconnects, she needs to know: "I have all of Alice's changes (obviously, she made them), all of Bob's changes up to a certain point, and none of Carol's changes (she joined while I was offline)." She needs to request exactly what she's missing — no more, no less.

### What a state vector is

A state vector is a compact summary of "what I have seen from each participant."

It is a simple mapping from each participant's identifier to the highest operation number seen from that participant:

```
{
  "alice-client-7f3a": 1042,
  "bob-client-9e1c":   890,
  "carol-client-2b5d": 0,      ← never seen anything from Carol
  "server-main":       3201
}
```

This says: "I have received Alice's operations 1 through 1042. I have received Bob's operations 1 through 890. I have received nothing from Carol. I have received the server's operations 1 through 3201."

**The state vector is small.** Even if 200 engineers have contributed to a project over 2 years, the state vector is just 200 entries — a few kilobytes at most. Compare this to the full operation log, which might be gigabytes.

**The state vector is sufficient.** Given two state vectors — "what I have" and "what exists" — Yjs can compute exactly which operations are missing: the diff between the two vectors.

### How the state vector is stored in the snapshot

When a snapshot is created, Yjs encodes both:
1. **The full state** — every element, every property, the complete model
2. **The state vector** — the summary of which operations have been incorporated into this state

Both are packed together into the binary blob stored in `yjs_state BYTEA`.

When the snapshot is later loaded, the state vector is extracted. This tells the system exactly where the snapshot left off — what the "clock reading" was at the moment the snapshot was taken. Any operations recorded after this clock reading are the ones that need to be replayed.

---

## Part 4 — The Event Log: The Permanent Diary of Every Change

Between snapshots, every change is stored in the `event_log` table.

Here is what the event log table looks like:

```sql
CREATE TABLE event_log (
  seq        BIGSERIAL PRIMARY KEY,  -- auto-incrementing sequence number
  project_id TEXT NOT NULL,          -- which project
  event_id   UUID NOT NULL UNIQUE,   -- unique ID for this specific operation
  actor_id   TEXT NOT NULL,          -- who made the change
  payload    JSONB NOT NULL,         -- the actual Yjs update (binary, base64-encoded)
  created_at TIMESTAMPTZ NOT NULL    -- when this was recorded
);
```

Each row is one Yjs update — one package of operations from one user at one moment.

### What the payload contains

The `payload` column contains the actual Yjs binary update, base64-encoded so it can be stored in a JSONB field. It also contains metadata:

```json
{
  "update": "AAABAQQD...(base64 encoded binary)...",
  "project_id": "proj-metro-2025",
  "actor_id": "user-bob-hassan",
  "timestamp": "2025-09-14T14:33:07.441Z",
  "operation_count": 3
}
```

The `update` field, when decoded, contains the actual Yjs binary operations: "Bob changed wall-001's thickness to 300, changed wall-001's fire_rating to 90min, and moved column-045 by 500mm north."

### Why the log is append-only — never modified, never deleted

The event log is sacred. No row is ever updated. No row is ever deleted. New rows are only ever added.

This is not just a convention — it is enforced by the database design:
- There is no `UPDATE` statement in the application code for the event log
- Database-level triggers can be added to block any UPDATE or DELETE on this table
- The log is write-once by design

**Why this strictness matters:**

The event log is the platform's **source of truth** for what happened. If you can modify history, you can cover up errors, manipulate audit trails, and dispute what actually occurred. An append-only log is tamper-evident — anyone can verify that no entry has been retroactively changed.

In legal disputes ("the contractor claims the design was changed after the issued-for-tender date"), the append-only event log, combined with cryptographic verification, provides irrefutable evidence of when each change was made and by whom.

### The sequence number (`seq`)

The `seq` column is a `BIGSERIAL` — a number that automatically increments by 1 for each new row. Row 1, row 2, row 3, etc.

This sequence number is the **global ordering** of all events. Every event in the log has a universally agreed position in the timeline, regardless of which user made the change or which client sent it. The database enforces this ordering — two events cannot have the same `seq`.

This is critical for recovery: when replaying events, you replay them in `seq` order, not in the order they were received by clients or in the order clients made them.

---

## Part 5 — How a Snapshot Is Created

Now that you understand both components, here is exactly what happens when a snapshot is created.

### When snapshots are triggered

Snapshots are not created after every single change — that would overwhelm the database with large binary writes. Instead, snapshots are triggered by:

- **Every N operations** — e.g., every 500 Yjs operations, a snapshot is automatically created
- **State transitions** — every time a document moves from `wip` to `shared`, or `shared` to `published`, a snapshot is created (because these are formal milestones)
- **Manual saves** — when a user explicitly clicks "Save Version"
- **Time-based** — e.g., once per hour during active editing sessions

### What happens during snapshot creation

**Step 1:** The server reads the current state of the server-side `Y.Doc` — the authoritative in-memory copy of the building model.

**Step 2:** Yjs serializes this entire document into a binary blob:
```typescript
const binaryBlob = Y.encodeStateAsUpdate(serverDoc)
// binaryBlob is now a Uint8Array — raw bytes
// For a large project: maybe 500,000 bytes (500 KB)
```

This binary blob contains:
- Every element in the model, every property, every relationship
- The full operation history (who changed what, in what causal order)
- The current state vector (which operations are included in this snapshot)

**Step 3:** The server counts the current elements for the `element_count` field:
```typescript
const elements = serverDoc.getMap('elements')
const elementCount = elements.size  // e.g., 47,832
```

**Step 4:** The server writes the snapshot row to PostgreSQL:
```sql
INSERT INTO project_versions (
  id, project_id, yjs_state, label, state, element_count, created_by, created_at
) VALUES (
  'snap-0005',
  'proj-metro-2025',
  '\x59410400...'::bytea,       -- the binary blob
  'Issued for Tender — Rev A',
  'published',
  47832,
  'user-appointing-party',
  NOW()
);
```

**Step 5:** The server records the current `seq` position from the event log — the sequence number of the last event included in this snapshot. This is the "clock reading" at the time of the snapshot.

```sql
-- Record which event_log seq is covered by this snapshot
INSERT INTO snapshot_cursors (
  snapshot_id, last_seq
) VALUES (
  'snap-0005',
  84721         -- the last event_log row included in this snapshot
);
```

The snapshot is now complete. It is a self-contained, complete record of the model at this exact moment.

---

## Part 6 — The Gap Between Snapshots: Where Changes Live

After the snapshot is created, engineers continue working. Their changes flow through the sync server and are stored in the event log — they do NOT create new snapshots.

So between snapshot at time T1 and the next snapshot at time T2, you have:

```
T1 ─── [snapshot: snap-0005, seq=84721] ──────────────────── T2
         │                                                      │
         │    event_log rows added during this period:          │
         │    seq 84722: Bob moved column-001                   │
         │    seq 84723: Alice changed wall-003.thickness       │
         │    seq 84724: Carol added a new door                 │
         │    seq 84725: Bob changed slab-002.fire_rating       │
         │    ...                                               │
         │    seq 91440: Alice changed window-099.height        │
         │                                                      │
         └──────────────────────────────────────────────────────┘
```

If you want the model state at any moment between T1 and T2, you:
1. Load snap-0005 (the last snapshot before your target time)
2. Replay event_log rows from seq 84722 up to the seq corresponding to your target time

---

## Part 7 — Point-in-Time Recovery: The Step-by-Step Process

Now you have everything needed to understand recovery. Let us trace the disaster scenario from the introduction.

**The situation:**
- It is Thursday, 3:46 PM — the model is good
- At 3:47 PM, a structural engineer accidentally deletes floor level 3 (1,200 elements)
- His change propagates via Yjs to all clients and is recorded in the event log
- Twenty minutes of further work is done by various engineers on top of the corrupted state
- At 4:08 PM, someone notices

**The goal:** Recover the exact model state as of Thursday 3:46 PM.

### Step 1 — Find the last snapshot before 3:46 PM

```sql
SELECT id, created_at, last_seq
FROM project_versions v
JOIN snapshot_cursors c ON c.snapshot_id = v.id
WHERE v.project_id = 'proj-metro-2025'
  AND v.created_at <= '2025-10-16 15:46:00 UTC'
ORDER BY v.created_at DESC
LIMIT 1;
```

Result: snapshot `snap-0009`, created at 3:30 PM, covering event log up to seq 91,200.

This is the starting photograph — everything correct up to 3:30 PM.

### Step 2 — Load the snapshot into a Yjs document

```typescript
// Retrieve the binary blob from the database
const snapshotRow = await db.query(
  'SELECT yjs_state FROM project_versions WHERE id = $1',
  ['snap-0009']
)

// Create a fresh empty Yjs document
const recoveryDoc = new Y.Doc()

// Apply the snapshot — this restores the entire model to 3:30 PM state
Y.applyUpdate(recoveryDoc, snapshotRow.rows[0].yjs_state)

// recoveryDoc now contains: every element, every property,
// every relationship — exactly as they were at 3:30 PM
// (47,832 elements, all correct)
```

This takes milliseconds. The binary blob plugs directly into Yjs — no parsing, no rebuilding.

### Step 3 — Find all event log entries between 3:30 PM and 3:46 PM

```sql
SELECT payload
FROM event_log
WHERE project_id = 'proj-metro-2025'
  AND seq > 91200                         -- after the snapshot
  AND created_at <= '2025-10-16 15:46:00 UTC'  -- before the disaster
ORDER BY seq ASC;                         -- in strict chronological order
```

This returns, say, 340 rows — 340 small binary updates representing 17 minutes of work by multiple engineers. Each row is 20–200 bytes. Total data: maybe 40 KB.

### Step 4 — Replay each update onto the recovery document

```typescript
for (const row of eventLogRows) {
  // Decode the base64-encoded binary update
  const update = Buffer.from(row.payload.update, 'base64')
  
  // Apply it to the recovery document
  // Yjs applies each operation in causal order
  Y.applyUpdate(recoveryDoc, update)
}

// recoveryDoc now contains: the model exactly as it was at 3:46 PM
// All 340 changes made between 3:30 PM and 3:46 PM are applied
// The accidental deletion (which happened at 3:47 PM) is NOT included
```

### Step 5 — The recovered state is available

At this point, `recoveryDoc` contains the exact model state at 3:46 PM. The platform can:
- Create a new snapshot from this recovered state (labelled "Recovered — Thursday 15:46")
- Set its state to `wip` so engineers can continue working
- Send it to all connected clients via Yjs sync — everyone's screens update to the recovered model

The entire recovery process — from triggering the recovery to having a clean model available — takes under 10 seconds for a large project.

### What was NOT recovered (and why that is correct)

The 20 minutes of work done after the deletion (4:00 PM to 4:08 PM) is not in the recovery. This is intentional — that work was done on top of the corrupted model and may itself be corrupted.

However, nothing is deleted. Those 20 minutes of changes remain in the event log. If needed, an engineer could manually review the event log entries from 4:00–4:08 PM, identify which ones are valid (e.g., "Carol added annotations that are fine"), and manually re-apply them to the recovered state.

---

## Part 8 — Why Not Just Take Snapshots Every Second?

A reasonable question: if snapshots enable recovery, why not take one every second? Then you never need to replay the event log — you just load the nearest snapshot.

### The cost of a snapshot

A snapshot of a complex BIM model is 200 KB to 2 MB of binary data. At one snapshot per second for a 10-hour working day:

```
1 snapshot/second
× 10 hours × 3600 seconds/hour
× 200 KB/snapshot
= 7,200 snapshots per day
= 1.44 GB of snapshot data per day per project
```

Multiply by hundreds of active projects and you have terabytes of snapshot data per day — millions of pounds of storage cost.

### The cost of an event log entry

Each event log entry is 20–200 bytes. The same 10-hour working day, with 2 operations per second from all engineers combined:

```
2 operations/second
× 10 hours × 3600 seconds/hour
× 100 bytes/operation
= 72,000 operations per day
= 7.2 MB of event log data per day per project
```

200 times smaller than frequent snapshots.

### The optimal strategy: infrequent snapshots + complete event log

The correct balance:
- Take a snapshot every **500 operations** or **every 30 minutes** of active editing (whichever comes first)
- Record every single operation in the event log, always
- On recovery: load the nearest snapshot + replay at most 30 minutes of event log

The maximum replay burden is 30 minutes of event log entries — typically 10–50 MB of data, replayed in 1–3 seconds. This is the accepted trade-off between storage cost and recovery speed.

---

## Part 9 — The State Vector's Role in Recovery: No Duplicate Operations

There is a subtle problem that the state vector solves during recovery.

When you replay event log entries onto a snapshot, you must be careful not to replay operations that are **already included in the snapshot**. Applying the same operation twice would produce incorrect results — like adding the same diary entry twice, which would move a chair 30cm twice instead of once.

The state vector, stored inside the snapshot's binary blob, prevents this.

When the recovery code applies an event log entry to the recovery document:

```typescript
Y.applyUpdate(recoveryDoc, update)
```

Yjs internally checks: "Does this update's state vector indicate operations that my document has already seen?" If yes, it skips those operations. If no, it applies them.

This is automatic. The engineer performing the recovery does not need to know which operations are in the snapshot and which are in the log — Yjs handles the deduplication using the state vectors.

This means the event log query in Step 3 can be slightly imprecise — it can start from a seq slightly before the snapshot's last_seq, and Yjs will correctly ignore the duplicates. The system is robust to off-by-one errors in the seq tracking.

---

## Part 10 — A Visual Timeline

Here is the complete picture, end to end:

```
TIME ──────────────────────────────────────────────────────────────────▶

09:00 AM    10:30 AM      12:00 PM      01:45 PM      03:30 PM   03:47 PM
   │              │             │             │             │          │
   ▼              ▼             ▼             ▼             ▼          ▼
[snap-006]  [snap-007]    [snap-008]    [snap-009]    [snap-010]   DISASTER
   │              │             │             │             │
   │              │             │             │             └─ seq: 91,200
   │              │             │             │
   │  event_log:  │  event_log: │ event_log:  │ event_log:
   │  seq 71000   │  seq 78500  │  seq 84200  │  seq 88100
   │  to 78499    │  to 84199   │  to 88099   │  to 91200
   │              │             │             │
   └──────────────┴─────────────┴─────────────┘
        every change in between is permanently recorded
        in order, in the event_log table

TARGET: recover to 3:46 PM (just before disaster)
  → Load snap-010 (3:30 PM, seq 91,200)
  → Replay event_log seq 91,201 to seq at 3:46 PM
  → Result: exact model state at 3:46 PM ✓
```

---

## Part 11 — This Is Also How Collaboration Works Day-to-Day

Point-in-time recovery is not only for disaster scenarios. The same mechanism — snapshot + event log replay — powers the normal daily workflow:

**New client connects to a project:**
1. Server loads the most recent snapshot into its `Y.Doc`
2. Server replays all event log entries since that snapshot
3. Server's `Y.Doc` now reflects the current live state
4. New client connects via WebSocket
5. Server sends the client the full current state (or a diff if the client has an older version)

**Engineer refreshes their browser mid-session:**
1. Their local Yjs document loads from IndexedDB (the browser-side cache)
2. They reconnect to the sync server and send their state vector
3. Server sends the operations they missed (from the event log) since their last sync
4. Their document catches up automatically

**Team wants to see what the model looked like two weeks ago:**
1. Same process as recovery — load the nearest snapshot, replay up to the target date
2. Presented as a read-only view (the historical model, not the live one)
3. Engineers can compare element counts, specific properties, structural grid positions — all from the historical replay

In each case, the snapshot + event log combination provides a complete, efficient, accurate reconstruction of the model at any point in time. No data is ever lost. No manual backup process is required. The architecture guarantees that recovery is always possible.

---

## Summary in Plain Language

| Concept | What it is | Analogy |
|---|---|---|
| **Snapshot** | A complete copy of the entire building model at a moment in time, stored as compact binary data | A photograph of a room |
| **Binary blob** | Raw bytes — the computer's native compact format, not readable text | A sealed, compressed box |
| **State vector** | A small summary of "which operations from which users are included in this snapshot" | A reading list: "I have read up to page 847 of Alice's diary" |
| **Event log** | An append-only, permanently growing record of every single change, stored as tiny entries in order | A diary where you can only add new entries, never erase old ones |
| **Replay** | Loading a snapshot and then re-applying event log entries one by one, in order, up to a target moment | Reading the photograph and then following the diary entries up to a specific date |
| **Point-in-time recovery** | Using snapshot + replay to reconstruct the model exactly as it was at any past moment | Being able to see any page in the diary's history |

The power of this architecture is that it gives you **complete history with minimal storage cost** — because the snapshots are infrequent (cheap storage) and the event log entries are tiny (cheap storage) while together they contain everything needed to reconstruct any moment in the project's entire lifetime.

---

*Document written as a detailed primer on Yjs snapshot architecture and point-in-time recovery for non-technical and technical readers alike.*
