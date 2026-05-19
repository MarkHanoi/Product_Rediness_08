# What Is a Data Model and Why Does It Matter?
## A Deep Explanation of the ProjectSnapshot Table — From Zero

---

## Part 1 — What Is a Data Model?

### The simplest possible definition

A **data model** is a precise description of:
1. What information your system needs to store
2. How that information is structured
3. How different pieces of information relate to each other
4. What rules govern that information (what is required, what is optional, what values are allowed)

That is it. A data model is a blueprint for your data — the same way an architectural drawing is a blueprint for a building.

### Why not just "store stuff somewhere"?

Imagine you are moving into a new house and you need to store 10,000 documents — contracts, invoices, drawings, correspondence. You have two choices:

**Option A — Unstructured storage:** Dump everything into boxes. Label the boxes vaguely ("2023 stuff," "important"). When you need a specific contract from March 2023, you open boxes until you find it. This takes an hour.

**Option B — Structured storage (a data model):** Design a filing system before you start. Documents go into folders by type (contracts, invoices, drawings). Folders go into drawers by year. Drawers are labelled. When you need a specific contract from March 2023, you go to the Contracts drawer, open the 2023 folder, and find it in 30 seconds.

The filing system is your data model. The structure you impose *before* you start storing things determines how efficiently you can find, update, and reason about information later.

### Why the data model is the most important decision in the entire platform

In software, the data model is the decision that is hardest to change after the fact.

You can rewrite the user interface in a week. You can replace the AI models in a day. You can swap your cloud provider in a month. But if you need to change the data model after thousands of projects have been saved against it, you must:

1. Write a migration script that processes every existing record
2. Run it on live data without losing anything
3. Update every piece of code that reads or writes that data
4. Test everything against both the old format and the new format
5. Plan for a maintenance window or a complex "dual write" period

This is why senior engineers say: **"Get the data model right first. Features can wait."**

A bad data model is not just a technical problem — it is a business problem. It caps what the product can ever do. It creates performance ceilings. It makes some features impossible to add without a complete rewrite.

---

## Part 2 — The Anatomy of a Database Table

Before diving into `ProjectSnapshot`, you need to understand what a database table is.

A database table is like a spreadsheet:
- Each **row** is one record — one specific thing
- Each **column** is one attribute — one piece of information about that thing
- Every row in the table has the same columns

For example, a simple `users` table:

| id | name | email | created_at |
|---|---|---|---|
| user-001 | Alice Müller | alice@dar.com | 2025-01-15 09:00 |
| user-002 | Bob Hassan | bob@dar.com | 2025-01-16 14:30 |
| user-003 | Carol Tan | carol@dar.com | 2025-02-01 11:00 |

Each row is one user. Each column captures one piece of information about that user.

### Column types — what kind of data each column holds

Every column has a **type** — a declaration of what kind of data it stores. The database enforces this: you cannot put a date in a column declared as a number. This is a fundamental difference from a spreadsheet, where you can put anything anywhere.

Common types:
- `TEXT` — any text string ("hello", "Design Review v3", "reinforced concrete")
- `INTEGER` — a whole number (1, 42, 10000)
- `BOOLEAN` — true or false
- `TIMESTAMP` — a specific moment in time ("2025-01-15 09:00:00")
- `UUID` — a universally unique identifier (explained below)
- `BYTEA` — raw binary data (images, serialized objects, compressed blobs)
- `JSONB` — structured data in JSON format, stored efficiently in the database

Now let's go through each column of `ProjectSnapshot` one by one.

---

## Part 3 — The ProjectSnapshot Table, Field by Field

```
ProjectSnapshot {
  id:              UUID
  project_id:      UUID
  yjs_state:       bytea
  label:           string
  state:           wip | shared | published | archived
  element_count:   integer
  created_by:      UUID
  created_at:      timestamp
}
```

This table answers a specific question: **"What did this building model look like at a specific moment in time, and what was its official status?"**

Every row in this table is one saved version of one project. A project might have 20 rows in this table — 20 different saved versions across its lifetime.

---

### Field 1: `id` — UUID

**What it is:**

UUID stands for **Universally Unique Identifier**. It looks like this:

```
a3f8c2d1-49e7-4b2a-8f3c-1d2e5a7b9c0f
```

It is a 128-bit number, typically displayed as 32 hexadecimal characters separated by hyphens into 5 groups.

**What it does:**

Every row in every table needs a way to be uniquely identified so you can say "I want *that specific* record, not any other." This is called a **primary key**.

The `id` column is the primary key for the `ProjectSnapshot` table. When you want to retrieve, update, or delete a specific snapshot, you use its `id`.

**Why UUID and not a simple number (1, 2, 3...)?**

A simple incrementing number (1, 2, 3...) seems easier. But it has problems:

**Problem 1 — Predictability.** If version IDs are 1, 2, 3, a user who has access to version 3 might guess that versions 1 and 2 exist and try to access them. UUIDs are cryptographically random — there are 2^122 possible values, making guessing impossible.

**Problem 2 — Multiple servers.** If you have two database servers (for redundancy or scaling), each counting from 1, they will both create a record number 1 and a record number 2. When you try to merge them, you have duplicates. UUIDs are generated randomly and independently — the chance of two servers generating the same UUID is astronomically small (less likely than being struck by lightning twice in the same second).

**Problem 3 — Leaking information.** If your last invoice has ID 847, a customer knows you have 846 other invoices. UUIDs reveal nothing about the system.

**How UUIDs are generated:**

They are generated algorithmically — the algorithm combines the current time, a random number, and other factors to produce a value that is effectively guaranteed to be unique across all computers in the world, forever.

You do not need to coordinate with a central server to get a unique UUID. Each device can generate its own. This matters for the BIM platform because clients sometimes need to generate IDs for elements they are creating offline — before they have connected to the server.

---

### Field 2: `project_id` — UUID (Foreign Key)

**What it is:**

Another UUID, but this one is not the snapshot's own identity — it points to something else. It is the `id` of the project this snapshot belongs to.

**The concept of a foreign key:**

A foreign key is a column in one table that contains the primary key value of a row in another table. It creates a link between two tables.

Think of it like a reference in a book. If page 45 says "See figure 3," the phrase "figure 3" is a reference — it points to something defined elsewhere. A foreign key is the database equivalent.

In this case:
- There is a `projects` table where each row represents one building project
- Each project has its own `id` (a UUID)
- The `ProjectSnapshot` table uses `project_id` to say "this snapshot belongs to *that* project"

```
projects table:
┌─────────────────────────────────────────────────────────┐
│ id            │ name                    │ owner_id       │
├─────────────────────────────────────────────────────────┤
│ proj-abc-123  │ DAR - Riyadh Metro      │ user-001       │
│ proj-def-456  │ DAR - Hospital Wing     │ user-002       │
└─────────────────────────────────────────────────────────┘

project_versions (snapshots) table:
┌────────────────────────────────────────────────────────────────────────┐
│ id            │ project_id   │ label              │ state      │ ...   │
├────────────────────────────────────────────────────────────────────────┤
│ snap-001      │ proj-abc-123 │ "Initial upload"   │ wip        │ ...   │
│ snap-002      │ proj-abc-123 │ "Design Review v1" │ shared     │ ...   │
│ snap-003      │ proj-abc-123 │ "Design Review v2" │ shared     │ ...   │
│ snap-004      │ proj-abc-123 │ "Issued for Tender"│ published  │ ...   │
│ snap-005      │ proj-def-456 │ "Structural Scheme"│ wip        │ ...   │
└────────────────────────────────────────────────────────────────────────┘
```

Notice that four snapshots (snap-001 through snap-004) all have `project_id = proj-abc-123`. They all belong to the Riyadh Metro project. Snapshot snap-005 belongs to the Hospital Wing project.

**Why not just put all the project details in the snapshot row?**

Because that would be duplication. If the project name changes from "DAR - Riyadh Metro" to "DAR - Riyadh Metro Extension Phase 2," you would need to update every single snapshot row. With a foreign key, you update the project name in one place (the `projects` table) and all snapshots automatically reflect it because they point to the same project record.

This principle — store each piece of information once, reference it by ID — is called **normalization** and it is a foundational principle of relational database design.

**The database constraint:**

When you declare `project_id` as a foreign key that references `projects.id`, the database enforces referential integrity:
- You cannot create a snapshot with a `project_id` that does not exist in the `projects` table
- You cannot delete a project from the `projects` table if snapshots still reference it

These constraints prevent orphaned data — snapshots that point to projects that no longer exist.

---

### Field 3: `yjs_state` — BYTEA (The Most Important Field)

**What it is:**

`BYTEA` means Binary Data. This column stores raw bytes — not text, not numbers, not structured data that you can read directly. Raw binary.

Specifically, this column stores the result of calling `Y.Doc.encodeStateAsUpdate()` — a Yjs function that takes the entire in-memory collaborative document (with all its elements, properties, relationships, and operation history) and compresses it into a compact binary blob.

**Why binary instead of something readable?**

You might wonder: why not just store the building model as JSON? Something like:

```json
{
  "elements": [
    { "id": "wall-001", "type": "IfcWall", "thickness": 250, "fire_rating": "90min" },
    { "id": "col-001", "type": "IfcColumn", "section": "400x400" }
  ]
}
```

This would be readable. You could open it and understand it. So why use binary?

**Reason 1 — The Yjs operation history must be preserved.**

The `yjs_state` does not just store the *current values* of all elements. It stores the entire **operation log** — every change ever made, who made it, when, in what causal order.

This operation log is what makes it possible to:
- Reconstruct the document state at any previous point in time
- Accept updates from users who were offline and merge them correctly
- Generate diffs ("what changed between snapshot A and snapshot B?")
- Undo operations by reversing specific entries in the log

The Yjs binary format encodes all of this compactly. A plain JSON representation of the current state contains none of the operation history — it is just the end result, not the journey.

**Reason 2 — Size.**

A 10,000-element BIM model as JSON might be 5–20 MB (element properties, relationships, metadata). The same model as a Yjs binary state is typically 50–200 KB — 10 to 100 times smaller — because Yjs uses:
- Run-length encoding (repeated patterns compressed)
- Integer encoding for IDs (not full UUID strings every time)
- Delta encoding (only storing what changed from a previous state, not the full value)
- Binary packing (no quotes, brackets, or whitespace)

At scale — thousands of projects, hundreds of snapshots each — this difference is millions of dollars of storage cost.

**Reason 3 — It can be loaded directly into Yjs.**

When a user opens a project, the server fetches the `yjs_state` binary blob from the database and calls:

```typescript
const doc = new Y.Doc()
Y.applyUpdate(doc, snapshotBinaryBlob)
// doc now contains the full collaborative document
// ready for real-time editing
```

This takes milliseconds. No parsing, no transformation, no rebuilding. The binary blob is Yjs's native format — it plugs directly in.

**What happens to the yjs_state over time:**

When the snapshot is first created, `yjs_state` might be 80 KB. As more engineers make more changes and the model grows, the operation log grows. Over a long project, the `yjs_state` could grow to 2–5 MB.

This is managed through a process called **compaction** — periodically, the operation log is collapsed so that superseded operations (a wall that was created and then deleted and then recreated) are cleaned up, keeping the blob size manageable.

---

### Field 4: `label` — STRING

**What it is:**

A human-readable name for this snapshot. A string of text, chosen by the user who creates the snapshot.

**Examples:**
- `"Initial IFC upload"`
- `"Design Review v3"`
- `"Issued for Tender — Rev A"`
- `"Post-Workshop Structural Update"`
- `"Coordination Model — MEP + Structural"`

**Why it exists:**

Without a label, every snapshot is identified only by its `id` (a UUID like `a3f8c2d1-...`) and its `created_at` timestamp. When someone needs to find the version that was shared at the client presentation in February 2026, they cannot browse through UUIDs.

The label is what appears in the UI — the version history panel shows a list of named versions that users can click on to restore or compare.

**What it does not need to be:**

The label does not need to follow any technical format. It is purely for humans. However, organizations often develop their own conventions (e.g., ISO 19650 mandates specific naming conventions for issued documents — the label might capture these).

**What the label does NOT determine:**

The label is descriptive, not authoritative. Whether a snapshot is the "official issued version" is not determined by its label — it is determined by the `state` field (discussed next). A document labelled "Final" is not actually final unless its `state` is `published`.

---

### Field 5: `state` — ENUM (wip | shared | published | archived)

**What it is:**

This is the most business-critical field in the entire table. It determines the official status of this version according to the ISO 19650 information management standard.

`state` can only be one of four values:
- `wip` — Work in Progress
- `shared` — Shared (for coordination/review)
- `published` — Published (officially issued)
- `archived` — Archived (superseded, no longer active)

**What an ENUM is:**

An ENUM (enumeration) is a column type that restricts values to a predefined list. The database will reject any other value. You cannot accidentally set `state` to `"final"` or `"done"` or `"complete"` — the database will throw an error. This prevents inconsistency.

**The ISO 19650 lifecycle — explained:**

ISO 19650 is an international standard for managing information in building projects. It mandates a specific lifecycle for every information deliverable (document, drawing, model):

```
wip → shared → published → archived
```

Each transition represents a formal gate in the project's information management process.

**Stage 1 — `wip` (Work in Progress):**

The model is being worked on. The team is making daily changes. This version is internal — not officially shared with anyone outside the immediate authoring team.

Rules in this state:
- Any team member can make changes
- The Yjs collaborative layer is fully active — real-time editing by multiple engineers
- No external parties (client, contractor, approving authority) should rely on this version
- This version can be discarded or overwritten without formal notification

The majority of a project's life is spent in `wip`.

**Stage 2 — `shared` (Shared for Coordination):**

The model has been reviewed internally and is now shared with other discipline teams for coordination purposes. For example, the architectural team shares their model with the structural team for clash detection.

Rules in this state:
- The version is "frozen" — it will not be actively changed by the sharing team
- Other teams can read and reference it
- It is still not an official contractual deliverable — it can still be revised
- The team that shared it can issue a new `shared` version if major changes are needed

**Stage 3 — `published` (Officially Issued):**

This is the most significant state. A `published` version is a formal contractual deliverable — it has been officially issued to a client, a contractor, a regulatory authority, or another external party.

Rules in this state:
- **This version is immutable.** It cannot be changed under any circumstances. Not by the engineer who created it. Not by an administrator. Not by anyone.
- This is enforced by the platform's code — the API rejects any mutation command targeting a `published` version with a hard error
- The ISO 19650 audit log records exactly who published it, when, and from which `shared` state
- If a correction is needed, a new version must be created (going through `wip` → `shared` → `published` again)

Why immutability matters: When a contractor builds something based on a "Issued for Construction" drawing, and later there is a dispute, both parties can point to the exact published version with a timestamp and an auditable history of who approved it. This is a legal protection for both parties.

**Stage 4 — `archived` (Superseded):**

When a newer version is published, the previous published version moves to `archived`. It is retained for historical record but is no longer the active reference.

Rules in this state:
- Completely immutable — no changes possible
- Still readable (for audit, dispute resolution, historical reference)
- Cannot be reverted to any previous state
- The archive is permanent — data is never deleted

**The state machine — why transitions are one-way and restricted:**

Not every transition is allowed. The state machine enforces:

```
wip → shared      ✓ (allowed)
shared → wip      ✓ (allowed — if the team needs to revise before issuing)
shared → published ✓ (allowed — but only by Appointing Party role)
published → archived ✓ (allowed — when superseded by a new version)
wip → published   ✗ (blocked — must go through shared review first)
published → wip   ✗ (blocked — published documents are permanent)
archived → anything ✗ (blocked — archiving is terminal)
```

These rules are not policies written in a document somewhere. They are enforced as code in the platform's state machine — `server/versionStateMachine.js`. The API will reject any attempt to make an illegal transition, regardless of what the client-side application sends.

**What this means in practice for a DAR project:**

- A structural engineer works on the model for three weeks (`wip`)
- The team lead reviews it and shares it with the MEP team for coordination (`shared`)
- The MEP team finds a clash — the structural team revises and re-shares (`wip` → `shared` again)
- After coordination is resolved, the Appointing Party reviews and approves (`shared` → `published`)
- The contractor receives the issued model and begins construction
- Six months later, a design change is issued — the old version moves to `archived`, a new version goes through the whole cycle

This entire process is tracked, enforced, and auditable automatically by the platform.

---

### Field 6: `element_count` — INTEGER

**What it is:**

A whole number representing how many BIM elements (walls, columns, slabs, doors, windows, beams, etc.) are in the model at the time this snapshot was created.

**Examples:**
- A schematic design model: 2,000–5,000 elements
- A coordinated design model: 15,000–50,000 elements
- A complex hospital project at construction documentation stage: 100,000–500,000 elements

**Why store this separately if the count could be derived from the data?**

You could, in theory, always derive the element count by loading the `yjs_state` binary blob, deserializing the entire document, and counting the elements. This would give you the exact current count.

But this is computationally expensive — deserializing a large Yjs document can take hundreds of milliseconds. If you want to display a list of 50 project versions with their element counts, you would need to deserialize 50 large binary blobs. This would take minutes.

By storing `element_count` as a separate integer column, you can display it instantly:

```sql
SELECT label, state, element_count, created_at
FROM project_versions
WHERE project_id = 'proj-abc-123'
ORDER BY created_at DESC;
```

This query returns instantly. No binary deserialization required.

This technique — storing a computed or summarized value separately so it does not need to be recomputed every time — is called **denormalization** (the intentional exception to the normalization principle mentioned earlier). It is a performance optimization with an explicit trade-off: the stored count might become slightly out of date if elements are added without creating a new snapshot. This is acceptable because `element_count` is used for display purposes only — not for any business logic.

**Other uses of element_count:**

- Project management dashboards: "How has model complexity grown over the project lifecycle?"
- Billing: Charging for large models (element count is a proxy for model complexity and storage cost)
- Performance monitoring: Alerting when a model grows beyond a size threshold that might affect performance
- Search and filtering: "Show me only projects with more than 50,000 elements" — instant, without touching the binary data

---

### Field 7: `created_by` — UUID (Foreign Key to Users)

**What it is:**

Another UUID — this one points to the user who created this specific snapshot.

It is a foreign key referencing the `users` (or `pryzm_users`) table.

**What it records:**

When an engineer clicks "Save Version" or when an Appointing Party clicks "Publish," the system automatically records that user's ID in `created_by`. The user does not type this — the system reads it from their authentication token.

**Why this matters — accountability:**

In AEC projects, knowing *who* did something is often as important as knowing *what* was done. ISO 19650 explicitly requires that every information deliverable be traceable to the person who issued it.

With `created_by`:
- "Who published the issued-for-tender model?" → one SQL query → the answer is immediate
- "Alice published six versions this month" → tracked automatically
- "This design decision was made in the model on the 15th, three days before the client meeting" → `created_by` combined with `created_at` creates an evidentiary record

This is also used in the audit log. When a dispute arises between a client and a contractor about what was in the "official" issued model, the platform can produce:

```
Version: "Issued for Tender — Rev A"
State: published
Created by: Ahmed Al-Rashid (Appointing Party)
Created at: 2025-09-14 16:42:07 UTC
Previous state: shared
Element count: 47,832
[yjs_state binary available for full reconstruction]
```

This is a legally meaningful record.

**Why UUID and not the user's name?**

Because names change. A person gets married and their legal name changes. An employee's display name in the system is updated. If you stored "Ahmed Al-Rashid" as text, and Ahmed's name changes in the system, the historical records become inconsistent.

By storing a UUID that points to the user's record, the historical snapshot is linked to *the identity* — not the name. If the name changes, the pointer still resolves correctly. The name displayed in the audit log is looked up at query time from the current user record.

---

### Field 8: `created_at` — TIMESTAMP

**What it is:**

The exact moment this snapshot was created. Stored as a timestamp — a specific date and time, typically with timezone information (UTC is the standard).

**Example value:** `2025-09-14 16:42:07.392 UTC`

**Why timezone matters:**

A timestamp without timezone is ambiguous. "16:42 on the 14th" — 16:42 where? If DAR's Dubai office and London office are both working on the same project, a timestamp without timezone creates confusion about the sequence of events.

UTC (Coordinated Universal Time) is the global reference. All timestamps are stored in UTC. When displayed to a user, they are converted to their local timezone by the application. But internally, everything is UTC — this eliminates ambiguity.

**How it is set:**

`created_at` is set automatically by the database when the row is inserted. The application does not need to set it — in fact, the application should not set it (to prevent clock skew on client devices from creating inaccurate records). The database server's clock is the authoritative source.

**How it is used:**

- **Ordering:** `ORDER BY created_at DESC` shows the most recent version first
- **Filtering:** "Show me all versions published in Q3 2025" → `WHERE created_at BETWEEN '2025-07-01' AND '2025-09-30' AND state = 'published'`
- **Audit trail:** Combined with `created_by`, it creates a timestamped chain of custody for every version
- **Performance:** When loading only recent snapshots, you can filter by `created_at` without scanning the entire table

---

## Part 4 — How All the Fields Work Together: A Complete Lifecycle Example

Here is a realistic project lifecycle — the Riyadh Metro Extension — traced through the `project_versions` table:

```
project_id for this project: proj-metro-2025
```

**January 15 — Initial IFC upload**
```
id:            snap-0001
project_id:    proj-metro-2025
yjs_state:     [binary, 95 KB — the imported IFC converted to Yjs format]
label:         "Initial IFC upload from Revit"
state:         wip
element_count: 3,847
created_by:    user-bim-manager
created_at:    2025-01-15 09:14:33 UTC
```

**February 28 — First coordination share (architecture to structure)**
```
id:            snap-0002
project_id:    proj-metro-2025
yjs_state:     [binary, 187 KB — six weeks of collaborative edits]
label:         "Arch scheme for structural coordination — Rev 1"
state:         shared
element_count: 12,443
created_by:    user-lead-architect
created_at:    2025-02-28 17:02:11 UTC
```

**March 15 — Returned to WIP after clash resolution**
```
id:            snap-0003
project_id:    proj-metro-2025
yjs_state:     [binary, 241 KB — clash fixes + structural additions]
label:         "Post-coordination revision"
state:         wip
element_count: 14,201
created_by:    user-structural-lead
created_at:    2025-03-15 11:33:44 UTC
```

**April 2 — Issued for client review**
```
id:            snap-0004
project_id:    proj-metro-2025
yjs_state:     [binary, 289 KB]
label:         "Design Review — Client Presentation April 2025"
state:         shared
element_count: 15,890
created_by:    user-project-director
created_at:    2025-04-02 08:55:01 UTC
```

**September 14 — Issued for Tender (the official, contractual issue)**
```
id:            snap-0005
project_id:    proj-metro-2025
yjs_state:     [binary, 1.4 MB — full coordinated model]
label:         "Issued for Tender — Rev A"
state:         published             ← IMMUTABLE FROM THIS MOMENT
element_count: 47,832
created_by:    user-appointing-party
created_at:    2025-09-14 16:42:07 UTC
```

**November 20 — Design change requiring a new issue**
```
id:            snap-0006
project_id:    proj-metro-2025
yjs_state:     [binary, 1.6 MB]
label:         "Issued for Tender — Rev B (structural grid revision)"
state:         published
element_count: 49,114
created_by:    user-appointing-party
created_at:    2025-11-20 15:20:44 UTC
```

At this point, snap-0005 automatically moves to `archived` — it is superseded but permanently retained.

**Now snap-0005 becomes:**
```
state: archived    ← permanent record, cannot be changed or deleted
```

---

## Part 5 — The Full Table Structure and Why Each Decision Matters

```sql
CREATE TABLE project_versions (
  id            TEXT PRIMARY KEY,               -- UUID, never changes
  project_id    TEXT REFERENCES projects(id),   -- which project
  yjs_state     BYTEA NOT NULL,                 -- the full collaborative document
  label         TEXT NOT NULL,                  -- human-readable name
  state         TEXT NOT NULL                   -- ISO 19650 lifecycle state
                CHECK (state IN ('wip','shared','published','archived')),
  element_count INTEGER NOT NULL DEFAULT 0,     -- for fast display
  created_by    TEXT REFERENCES pryzm_users(id),-- who created it
  created_at    TIMESTAMPTZ NOT NULL            -- when (UTC)
                DEFAULT NOW()
);
```

**`NOT NULL`** — these columns cannot be empty. Every snapshot must have a state, a label, and a Yjs blob. The database rejects any insert that omits these.

**`CHECK (state IN (...))`** — this is the ENUM constraint. The database checks the value before accepting it. `state = 'final'` throws an error. Only the four valid values are accepted.

**`DEFAULT NOW()`** — `created_at` is set automatically to the current time if not provided. The application does not need to supply it.

**`REFERENCES projects(id)`** — this creates the foreign key constraint. The database refuses to create a snapshot for a non-existent project.

---

## Summary — Why This One Table Is So Important

The `ProjectSnapshot` table is where every critical concern of the platform meets in one place:

| Business concern | Which field |
|---|---|
| "Which project does this belong to?" | `project_id` |
| "What was the model at this moment?" | `yjs_state` |
| "What is it officially called?" | `label` |
| "Is this an official contractual deliverable?" | `state` |
| "How complex is the model?" | `element_count` |
| "Who is accountable for this version?" | `created_by` |
| "When was this issued?" | `created_at` |
| "Can I ever modify this version?" | Depends on `state` — if `published` or `archived`, no |

Every field serves a purpose. None is decorative. This is what a well-designed data model looks like: every column answers a question that the business needs answered, in a format that allows the database to enforce it correctly and the application to query it efficiently.

---

*Document written for non-technical readers explaining the data model, its purpose, and the ProjectSnapshot table in detail.*
