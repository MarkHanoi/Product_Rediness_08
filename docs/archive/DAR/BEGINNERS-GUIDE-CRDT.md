# What Is the Yjs CRDT Layer? — Explained From Zero
## For Someone Who Has Never Heard These Words Before

---

## Start Here: The Problem This Solves

Before explaining what Yjs is, we need to understand the problem it solves — because without the problem, the solution makes no sense.

### Imagine a shared Word document — but for a building

A BIM (Building Information Model) is a digital file that contains everything about a building: every wall, every column, every pipe, every door, with exact measurements, materials, fire ratings, structural loads, and spatial positions. It is not a picture of a building — it is a structured database that *describes* a building precisely enough that you could build it from it.

Now imagine 50 engineers at DAR — architects, structural engineers, MEP engineers — all need to work on the same building model at the same time. Some are in Dubai, some in London, some on a construction site in Saudi Arabia with intermittent internet.

This is the problem. How do 50 people edit the same highly structured file simultaneously, without destroying each other's work?

---

## Chapter 1: The Simple Solutions That Don't Work

### Solution 1: Take turns (file locking)

The oldest approach: one person opens the file, everyone else is locked out. When they're done, they save and unlock it.

**What goes wrong:** A building coordination project might have 200 people who all need to work. If everyone has to queue up and take turns, work grinds to a halt. The structural engineer cannot work while the architect is still in the file. A discipline that should take 3 weeks takes 3 months.

This is how Revit's "central file" model works. It is the industry standard today — and it is one of the key pain points the platform is built to solve.

### Solution 2: Everyone saves their own copy, someone merges later

Each discipline team works in their own copy of the model. Every week, a BIM coordinator combines them all.

**What goes wrong:** By the time the merge happens, there are hundreds of contradictions. The structural engineer moved a column that the architect already built a wall around. The MEP engineer ran a duct through a beam. These are discovered at the merge meeting, not at the moment they happened. Fixing them takes more time than the original work.

### Solution 3: One shared database — everyone writes to it directly

This is what comes to mind when developers first think about this problem. Just put everything in a database. When an engineer changes a wall's thickness, run:

```sql
UPDATE walls SET thickness = 250 WHERE id = 'wall-123';
```

Simple, right? One database, one truth.

**What goes wrong — and this is important:**

Imagine Alice and Bob both open the same wall at 9:03 AM. Alice is going to change the thickness. Bob is going to change the fire rating. These are *different* things — there should be no conflict.

But here is what happens at the database level:

- Both Alice and Bob's computers read the wall row: `{ id: 'wall-123', thickness: 200, fire_rating: '60min' }`
- Alice's computer sends: `UPDATE walls SET thickness = 250 WHERE id = 'wall-123'`
- Bob's computer sends: `UPDATE walls SET thickness = 200, fire_rating = '90min' WHERE id = 'wall-123'`

Bob's update overwrites Alice's! Even though Bob never touched the thickness field — his computer sent the whole row back, including the old thickness value it read before Alice's change. Alice's work is silently gone. Neither Alice nor Bob knows this happened. The database did exactly what it was told.

This is called a **race condition** — and it gets worse:

- What if Alice is on a plane and has no internet? She cannot write to the database at all. She cannot work.
- What if two engineers *both* try to change the same property — who wins? The database picks whoever got there last. No explanation to either engineer.
- What if the database server goes down? Nobody can work.

---

## Chapter 2: A Different Mental Model — Operations Instead of Values

Here is the key insight behind Yjs and CRDTs.

### The bank account analogy

Imagine two bank clerks both trying to update your account balance at the same moment.

**The wrong approach (storing values):**
- Current balance: £1,000
- Clerk A reads £1,000, adds a £500 deposit, writes back £1,500
- Clerk B reads £1,000 (before Clerk A finished!), adds a £200 deposit, writes back £1,200
- Final balance: £1,200. The £500 deposit is lost.

**The right approach (storing operations):**
- Clerk A records the operation: "add £500 to account 123"
- Clerk B records the operation: "add £200 to account 123"
- Both operations are applied: £1,000 + £500 + £200 = £1,700
- It does not matter which order they were applied. The result is correct.

This is the fundamental shift. Instead of storing the *current value* and updating it, you store *operations* — and you apply all operations to produce the current value.

### Applied to BIM

Instead of:
```
wall-123.thickness = 250    ← this overwrites whatever was there
```

You store:
```
Operation 1: "Alice changed wall-123.thickness from 200 to 250 at 9:03:12 AM"
Operation 2: "Bob changed wall-123.fire_rating from 60min to 90min at 9:03:12 AM"
```

Both operations survive. Both changes are applied. The wall ends up with thickness 250 AND fire_rating 90min — which is exactly what both engineers intended.

---

## Chapter 3: What "CRDT" Means

CRDT stands for **Conflict-free Replicated Data Type**.

Let's break each word down:

**Conflict-free** — changes made simultaneously by different people will never destroy each other. They are designed to be combined without conflicts.

**Replicated** — every person working on the document has a complete copy of it on their own device. There is no single "master copy" that everyone depends on. Alice has a full copy on her laptop. Bob has a full copy on his. The server has a full copy. They are all *replicas* of each other.

**Data Type** — it is a specific kind of data structure (like how a list, a table, or a dictionary are data structures), designed with these conflict-free properties built in.

### The mathematical guarantee

The key property of a CRDT is this:

> If any two replicas have seen the same set of operations — regardless of what order they received them — they will always end up with exactly the same state.

This is not a "hopefully it works" property. It is mathematically proven. The algorithm is designed so that the order of operations does not matter. 

Alice applies operations in order: A, B, C.
Bob applies the same operations in order: C, A, B.
They get the same result.

This means:
- Alice can work offline for 7 hours, making hundreds of changes
- Bob can work online and receive changes from 20 other engineers
- When Alice reconnects, her changes and Bob's changes are merged automatically
- No human decides who wins. The mathematics resolves everything.

---

## Chapter 4: What Yjs Is

Yjs is a specific CRDT library — a piece of software that implements the CRDT principles for practical use in web applications.

It was created by Kevin Jahns and is open-source. It is the same technology used by:
- **Figma** (the collaborative design tool)
- **Linear** (project management used by thousands of tech companies)
- **Liveblocks** (a collaborative infrastructure platform)
- **Notion** (the notes/wiki tool)

Yjs provides specific building blocks — think of them as Lego pieces — for building collaborative documents:

### The building blocks Yjs provides

**`Y.Map`** — A key-value store where you can set and get values. Like a dictionary or a row in a database table, but with CRDT properties built in.

```
Y.Map example for a BIM element (a wall):
{
  "thickness": 250,
  "fire_rating": "90min",
  "material": "reinforced_concrete",
  "level_id": "level-3"
}
```

If Alice and Bob both change different keys in this map simultaneously, both changes survive. If they both change the same key simultaneously, Yjs uses a deterministic rule to pick one — and crucially, *all replicas pick the same one*, so everyone ends up with the same result.

**`Y.Array`** — An ordered list where items can be inserted or deleted concurrently without creating duplicates or gaps. Used for ordered lists of levels, ordered command history, etc.

**`Y.Text`** — A text field where two people can type simultaneously (like Google Docs). Used for comments and element names.

**`Y.Doc`** — The container for everything. Think of it as the entire BIM project. One `Y.Doc` contains all the maps, arrays, and text fields for one project.

---

## Chapter 5: The Y.Doc — Your Personal Copy of the Entire Project

This is the most important concept to understand.

In the traditional database model, the project data lives in one place (the database server). Everyone reads from and writes to that one place. If the database goes down, nobody can work.

In the Yjs model:
- Every client (every engineer's browser) has a **complete copy** of the `Y.Doc` in memory
- The server also has a complete copy
- Every copy is kept in sync by continuously sharing **operations** (not values)

When Alice changes a wall's thickness:
1. Her local copy of the `Y.Doc` is updated immediately — she sees the change instantly
2. A tiny binary message (~30 bytes) is sent via the internet describing the operation: "wall-123 thickness changed to 250"
3. The server receives this, updates its copy, and forwards it to Bob's browser
4. Bob's browser receives it, updates his local copy
5. Bob sees Alice's change within milliseconds

Nobody had to wait for a database round-trip. Alice saw her change the instant she made it. The database (PostgreSQL) is not even involved in this flow.

---

## Chapter 6: What the Binary Format Looks Like

Yjs does not send human-readable text when syncing changes. It sends compact binary data.

A typical operation — "Alice changed wall-123's thickness to 250" — is encoded as approximately 30–50 bytes of binary data. That is smaller than this sentence.

To put this in perspective:
- A typical HTTP request to a database to update one row: ~500–2,000 bytes (including headers)
- A typical Yjs update for the same change: ~30–50 bytes
- A WhatsApp text message of similar length: ~100 bytes

This is why Yjs can sync changes across 50 simultaneous editors without performance problems. The data being sent is tiny.

---

## Chapter 7: How Two Copies Stay in Sync — The State Vector

Here is how Yjs keeps everyone's copy perfectly synchronized.

Every `Y.Doc` maintains a **state vector** — a record of how many operations it has seen from each person who has ever contributed to the document.

Think of it like a reading list:
```
Alice's state vector: "I have seen 1,042 operations from Alice, 890 from Bob, 3,201 from the server"
Bob's state vector:   "I have seen 1,038 operations from Alice, 895 from Bob, 3,201 from the server"
```

When Bob reconnects after being offline, his browser sends his state vector to the server and says: "I have seen up to operation 1,038 from Alice. What did I miss?"

The server looks at this, sees Alice went up to operation 1,042, and sends Bob exactly the 4 operations he missed — as a binary blob of maybe 150 bytes.

Bob's browser receives this, applies those 4 operations to his local copy, and his `Y.Doc` is now identical to the server's. Done. No conflict dialog. No "choose which version to keep." Automatic.

---

## Chapter 8: The Offline Case — The Killer Feature

This is where Yjs truly shines and where traditional databases completely fail.

### Bob's scenario

Bob is a structural engineer. He gets on a flight from Dubai to London. For 7 hours, he has no internet.

He opens his laptop, opens the BIM project (which is loaded from his local `Y.Doc` copy stored on his device), and works. He moves 40 columns, changes 80 property values, and deletes one redundant beam.

His computer records every single one of these changes as Yjs operations. They are stored locally.

Meanwhile, Alice is online in London. She is working on the same project. She makes 120 changes.

### When Bob lands

Bob's laptop connects to the airport WiFi.

1. Bob's browser connects to the sync server
2. Bob's browser says: "My state vector is `{ bob: 950, alice: 1,038, server: 3,201 }`. I've been working offline. Here are my 60 new operations." (The binary blob is sent — perhaps 20 KB)
3. Bob's browser also says: "What do you have that I've missed?"
4. The server says: "Here are Alice's 120 operations." (Another small binary blob is sent)
5. Bob's browser applies Alice's 120 operations to his local copy
6. The server applies Bob's 60 operations to its copy and broadcasts them to Alice
7. Both Alice and Bob now have identical `Y.Doc` copies — containing all 180 changes from both of them

**This took about 2 seconds and required zero human decisions.**

With a traditional database, this scenario is impossible. Bob could not work offline at all — every change requires writing to the database. His 7 hours of work would have been done on paper.

---

## Chapter 9: Where PostgreSQL (the Database) Fits In

After all of this, you might wonder: why use PostgreSQL at all?

Yjs is excellent at managing live, collaborative, in-memory state. But it has limitations:

- It does not store structured data in a way you can query ("show me all walls thicker than 200mm on level 3")
- It does not enforce access control ("only the Appointing Party can publish a document")
- It does not permanently store project metadata, user accounts, or billing information
- It cannot be backed up and restored in a standard way

PostgreSQL handles everything that Yjs cannot:

| What Yjs owns | What PostgreSQL owns |
|---|---|
| Live collaborative editing state | Project name, owner, creation date |
| The full operation history (who changed what) | User accounts and passwords |
| Automatic conflict resolution | Who has access to which project (RBAC) |
| Offline authoring and sync | Snapshots of the Yjs document (for cold recovery) |
| Cursor positions and presence | Billing, invoices, plan information |
| Instant local changes (no network latency) | ISO 19650 document state (WIP/Published/Archived) |
| | Audit log (who changed what — for compliance) |

Think of it this way:

**Yjs is the live working surface.** Like a whiteboard in a meeting room where everyone can write simultaneously.

**PostgreSQL is the filing cabinet.** Where you store the permanent record once the meeting is over.

### How a Yjs snapshot gets into PostgreSQL

Every so often (say, every 100 operations, or when a document is explicitly saved), the server takes the entire `Y.Doc` and serializes it — converts the entire in-memory document into a compact binary blob — and stores that blob in a database column.

```
PostgreSQL column: project_versions.yjs_state (type: binary data)
Content: [a few hundred kilobytes of binary, representing the entire BIM project state]
```

This is the safety net. If every server crashes simultaneously, the last snapshot is in PostgreSQL. The system restores from it and replays any operations that happened after the last snapshot (which are also stored in PostgreSQL's event log).

---

## Chapter 10: The Presence Layer — Cursors and "Who's Doing What"

Yjs has a second, separate feature called **awareness**. This handles the ephemeral "who's here and what are they doing" information.

When you use Google Docs, you can see other people's cursors — a colored line with their name. That information does not need to be saved forever. The moment someone closes their browser, their cursor disappears. This is different from the document content, which must persist.

Yjs's awareness layer handles exactly this:

Every user broadcasts a small blob of information continuously:
- Where is my 3D cursor right now? (X, Y, Z position in the building model)
- Which elements have I selected?
- What tool am I using? (Wall, Door, Select, etc.)
- What color should represent me?
- What is my name?

Every other user's browser receives these blobs and renders:
- A colored ghost cursor floating in 3D space where Alice is working
- A colored highlight on any elements Bob has selected
- A panel showing "Alice is placing walls on Level 3, Bob is editing a column on Level 2"

This data is **never saved to PostgreSQL**. The moment Alice closes her browser, her cursor disappears for everyone. It is purely real-time, purely ephemeral. No database required.

---

## Summary: The Full Picture

Here is the complete system in plain language:

1. **The building model lives as a `Y.Doc`** — a special data structure that supports simultaneous editing by many people at once, without conflicts, even while some people are offline.

2. **Every engineer has a complete copy** on their device. Changes happen locally, instantly, with no internet required.

3. **Changes are tiny binary messages** (~30 bytes) sent to a sync server, which forwards them to everyone else. This is hundreds of times more efficient than database round-trips.

4. **The mathematics guarantees** that if everyone receives the same set of changes, they all end up with identical documents — regardless of the order the changes arrived.

5. **PostgreSQL stores the permanent record** — user accounts, access control, billing, compliance documents, and periodic snapshots of the `Y.Doc` for disaster recovery.

6. **Presence (cursors, selections)** is handled by a separate, never-persisted broadcast layer — so you can see your colleagues' 3D cursors in real time without that data ever touching a database.

The result: 50 engineers in 5 countries, some on-site with bad internet, some on planes, can all work on the same building simultaneously. Their changes merge automatically. The model is always consistent. No coordination meetings required just to share a file.

This is what makes browser-native BIM authoring genuinely possible — not just a "nice demo," but a production-grade engineering workflow.

---

*Document written for non-technical readers as a primer on CRDT-based collaboration in a BIM context.*
