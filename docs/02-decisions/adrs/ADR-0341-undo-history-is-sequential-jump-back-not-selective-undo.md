# ADR-0341 — The undo history dropdown is SEQUENTIAL JUMP-BACK, and selective undo is refused with a reason

- **Status:** Accepted
- **Date:** 2026-08-21
- **Lane:** UNDO1
- **Supersedes:** nothing. **Amends in place:** `PatchPair` (adds optional `commandType`),
  `Command` (adds optional `describe()`), `RingBufferUndoStack` (adds `listEntries()` /
  `cursorIndex`), `CommandManager` (adds `getUndoHistoryView()` / `getRedoHistoryView()`),
  `SaveUndoRedoHUD`.
- **Commit:** `b343e24b`
- **Contracts:** C03 §4.5–4.8 (undo architecture, U-1/U-5/U-8/U-10), C16 §5 (command authoring,
  new **CA-22**), C06 (UI layer / design tokens), P6 (commands are the only mutation path).
- **Issue-log:** L-1880 … L-1884.

---

## 1 · Context — what the founder asked for

> "Could do undo and redo have a mini arrow below the icon - and be able to see exactly what was
> done and be able to undo and redo a specific thing in time? Review and check - architecturally
> sound task." — 2026-08-21

He is describing the Revit / AutoCAD undo dropdown: a caret beside undo and redo that opens a list
of recent actions in plain language, where picking an entry rolls the model back to that point.

## 2 · The decision that defines this work — (A) vs (B)

**"Undo a specific thing in time" has two readings, and they are not variations of one feature.
They are different products with different correctness properties.**

| | What it means | Status |
|---|---|---|
| **(A) Sequential jump-back** | Picking the 5th row undoes rows 1–5, newest first | ⭐ **SHIPPED** |
| **(B) Selective / out-of-order undo** | Undo row 3 while KEEPING rows 4 and 5 | 🔴 **REFUSED — stated in the UI, in words** |

**DECISION: implement (A). Refuse (B), and say so where the user can see it — not only here.**

### 2.1 · Why (B) is not merely unimplemented — it is unsound in *this* command model

This is not "we ran out of time". Three independent mechanisms make (B) undefined here, and all
three were read out of the code rather than assumed:

1. **The ring-buffer inverse is a POSITIONAL ASSIGNMENT, not a commutable operation.**
   `PatchPair.inverse` is a list of JSON-Pointer ops carrying **literal values captured at commit
   time** (`RingBufferUndoStack.ts`). Replaying entry 3's inverse after entries 4 and 5 have
   written the same path does not remove entry 3's contribution — it **overwrites 4 and 5 with a
   value from before they existed**. The patch has no notion of what it is undoing.

2. **The legacy half is a WHOLE-STORE SNAPSHOT, which is strictly worse.** Path-A undo
   (`CommandManagerImpl.undo()` → `command.undo(ctx)`) writes back state captured by
   `createSnapshot()` scoped to `affectedStores` — i.e. whole stores, not one element (C03 §4.3).
   Out of order, it discards **every later edit to every element in those stores**.

3. **Hosted and derived elements make the result undefined rather than merely wrong.** C15 doors
   and windows are hosted *in* a wall; C03 §4.6 **U-9** exists precisely because a command's
   effects reach elements it does not name. Move a wall → host a door on it → selectively un-move
   the wall: the door's host geometry no longer exists at the position its own record was written
   against. There is no defined answer. This is why Revit, AutoCAD and ArchiCAD refuse it too.

**A partial (B) is not the honest middle.** The honest exit is ADR-0251's end state — one store,
derived geometry, one timeline — at which point selective undo becomes a question that can at
least be *asked*. Until then, shipping (B) would be a button that silently corrupts a model, and a
corrupting button with a plausible tooltip is worse than no button at all
(§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH, inverted: here the refusal IS the correct answer).

### 2.2 · The refusal is VISIBLE, not implied by silence

Shipping (A) while the founder believes he asked for (B) would be the defect, not the fix. Three
mechanisms make the difference visible **before** the click:

- The popover header states it: *"Choosing a step undoes it and everything above it, newest
  first. Undoing one earlier step on its own is not supported."*
- **Hovering row k marks rows 0…k as in-scope** (`.is-in-scope`) with row k as the target. The
  user sees the whole set that the click will take. A single-row highlight would *look* like
  selective undo, which is exactly the promise this product does not keep.
- Each row's tooltip reads *"Undo 5 steps — back to just before «Create wall»"*, never
  *"Undo «Create wall»"*.

Gated by `apps/editor/src/ui/__tests__/undoHistoryHud.spec.ts` — the assertion on the header
sentence exists so that removing it fails a test rather than quietly re-implying (B).

## 3 · Why a projection had to be built at all — neither stack could be READ

PRYZM has **two** undo stacks (C03 §4.3) and `performUndo` merges them **at the top entry only**.
Before this change:

| Stack | What could be read | What could not |
|---|---|---|
| `RingBufferUndoStack` | `current()`, `peek()` — the top of each direction | every other entry; `_entries` and `_cursor` are private |
| `CommandManagerImpl` | `getHistory()` — a **shallow copy holding the LIVE `Command` objects** | a safe view; `redoStack` had no accessor at all |

⭐ **The lane brief said "they are private with no public read accessor". That is half wrong and
the half that is wrong matters.** `getHistory()` **does** exist
(`CommandManagerImpl.ts:908` pre-change) and returns `[...this.history]` — a fresh array holding
the same live `HistoryEntry` objects. A caller that takes one can call `.execute(ctx)` or
`.undo(ctx)` on the command **directly, out of band, with no dispatcher, no snapshot and no
history bookkeeping.** That is a mutation path into model state that bypasses the command
dispatcher entirely (**P6**), handed to whoever asks. So the problem was never *"there is no
accessor"* — it was *"the accessor that exists must not be given to a UI."*

**Both stacks now expose FROZEN, VALUE-FREE row views**, and the two properties that make them
safe are asserted rather than assumed:

- `RingBufferUndoStack.listEntries(): readonly RingBufferEntryView[]` — scalars plus `opPaths`
  (JSON Pointer strings **without values**). Gate:
  `ring-buffer-list-entries.test.ts` serialises a row and asserts the payload marker does not
  appear.
- `CommandManager.getUndoHistoryView()` / `getRedoHistoryView()` — scalars only, no route back to
  a `Command`. Gate: `undoHistoryView.test.ts` asserts `row.execute`/`row.undo` are `undefined`
  **and** contrasts it with `getHistory()[0].command.undo`, which is still a function.

`getHistory()` is **left in place** (it has non-UI callers) but is now documented as *not the
accessor a UI may use*.

## 4 · Labels — a TRANSFORM, deliberately not a lookup table

Commands had **no human-readable name**. `packages/command-registry/src/types.ts` had no
`description` / `label` / `displayName`; there was only `CommandType`
(`UPDATE_VIEWPORT_SCALE`, `SET_VIEW_CROP`, `MOVE_VIEWPORT`). A dropdown reading
`UPDATE_VIEWPORT_SCALE` is not the feature that was asked for.

Two sources exist and **both** are used, in strict priority:

1. **`Command.describe?(): string`** — new, **OPTIONAL** (C16 **CA-22**, §5 below). The author
   states it, in the file that holds the payload. Only a command can say *"Set wall height to
   3.2 m"*; a UI never can. Optional because making it required would mean editing ~200 command
   classes in one commit — a change that cannot be reviewed and cannot be verified.
2. **`describeCommandToken(token)`** — a total transform, used when (1) is absent (which is every
   command today).

**A UI-side lookup TABLE was rejected, and the reason is the whole argument for the transform.**
A table is a *partial function*: every command authored after it was written falls through to the
raw enum, and **nothing fails** — the dropdown just degrades, quietly, forever. The transform is
*total*: an unrecognised token still produces a readable sentence, so a new command can be
un-polished but never un-named. It spans the three token shapes measured in this repo:

| Input | Output |
|---|---|
| `wall.create` | Create wall |
| `element.updateParameters` | Update element parameters |
| `door.setOffset` | Set door offset |
| `wall.batch.create` | Create wall (batch) |
| `UPDATE_VIEWPORT_SCALE` | Update viewport scale |
| `SET_VIEW_CROP` | Set view crop |
| `quantum.entangleFoo` *(never seen before)* | Entangle quantum foo |

The noun is inserted **after the leading verb word**, not appended — appending yields "Update
parameters element", which reads as machine output. Gated by 5 cases in
`undoHistoryTimeline.test.ts`, including the totality property and a "never empty for any
degenerate input" sweep.

`PatchPair` also gained an optional `commandType`, stamped by `CommandBus` from `record.type`.
The bus already had the verb in hand two lines above the push and dropped it on the floor; without
it a ring-buffer row could only ever say *"wall"* (a store key), never *"Create wall"*. **It is
label data only** — nothing on the undo path reads it, so an entry pushed without it routes
byte-identically.

## 5 · C16 **CA-22** — `describe()` (OPTIONAL, and stated as such)

> **CA-22 — HUMAN-READABLE COMMAND LABEL (OPTIONAL, NOT YET BINDING).** A command MAY implement
> `describe(): string` returning a one-line, present-tense sentence naming what it did, in the
> user's vocabulary and with real numbers and units (*"Set wall height to 3.2 m"*, *"Move 3
> walls"*). It MUST be pure, MUST NOT throw, MUST NOT read stores, and carries **no undo
> semantics** — nothing in `performUndoRedo` or `CommandManager.undo()` reads it.
> **When absent, `describeCommandToken(type)` derives a label from the type token**, so a command
> without `describe()` is never unnamed. A thrown or empty result is treated as absent and falls
> back to the derivation (`_safeDescribe`), so an author's bug degrades the label, never the
> toolbar.
>
> **NOT-YET-TRUE as enforcement, deliberately.** There is no gate requiring `describe()` and there
> should not be one yet: at ~200 legacy command classes, a hard rule would be satisfied by 200
> perfunctory strings, which is worse than 200 honest derivations. *Exit condition:* when the
> highest-traffic families (wall, slab, door, window, level) carry `describe()`, promote CA-22 to
> a ratchet over that set — never a repo-wide hard-0 in one step.

## 6 · The cross-stack merge — one row = one `performUndo()`

`buildUndoTimeline()` merges both stacks using **the same predicates `performUndo` routes by**:

- **U-10 chronological order across stacks** — take the legacy head first when it is strictly
  newer than the ring head and the two are not a twin.
- **U-8 twin collapse** — a dual-dispatch twin (one gesture on BOTH stacks) is **one row**, not
  two. The predicate is `gestureId` equality **plus** `targetIds ⊆ ringIds`, mirroring
  `_isSameGestureTwin`. **Wall-clock proximity is NOT used** — C03 §4.6 U-10's amendment is
  explicit that it must not be.
- **Absence is not membership** — an entry with no `gestureId` is never another's twin, so it gets
  its own row. That direction costs at most one extra preview row; the other direction would hide
  a real user action from the list.
- **§L-874 structural cascades are NOT separate rows.** They revert with their gesture, so the row
  names the count instead: *"+2 related changes"*. Hiding them entirely would make the row
  under-report what the click takes.
- **A collaborator's edit can never appear.** The exclusion is at the PUSH
  (`CommandManagerImpl.execute()` excludes `REMOTE` and remote-origin dispatches — C03 §4.6 U-1 /
  §UNDO-REMOTE-ORIGIN). **No second filter was added in the projection**, deliberately: a second
  copy of that rule would be the weaker one, and the copy at the push is the one the two-client
  harness measured.

That equivalence — **one row = one `performUndo()` call** — is what makes "jump to row k" mean
"press Ctrl+Z k+1 times", which is what makes (A) correct by construction.

## 7 · The jump respects P6 and reports what it actually did

`undoThrough(k)` calls `performUndo()` `k+1` times through **the** single unified path (C03 §4.6
U-5). There is no second undo algorithm and there must never be one — gated by a spy assertion in
`undoHistoryTimeline.test.ts`.

**It stops at the first step that did not revert.** `performUndo` returns `'stranded'` when an
entry is pending but has no adapter (C03 §4.8 — a real state here, enumerated in
`UNMAPPED_BUS_STORE_KEYS`: `structural`, `dimension`, `section`, `selection`, `sheet`, `schedule`,
`view`, `active-view`). Continuing past one would spin against an unmovable cursor and report N
steps for zero work. The outcome carries `completed`, and the HUD surfaces it when it is less than
`requested`: *"2 of 5 steps undone — stopped: no applyPatch adapter for store(s) [section]"*.
Reporting `requested` would be the failure≠emptiness defect this repo keeps closing, sitting in
the undo path again.

## 8 · What this does NOT establish

1. 🔴 **NOT VERIFIED IN A BROWSER.** Every claim above is proven by unit and DOM assertions under
   happy-dom. Nobody has opened the editor, drawn a wall, opened the caret and clicked row 3.
   **This verification is owed and is the next action.**
2. 🔴 **THE PROJECTED ORDER IS A PREVIEW, NOT A PROOF.** Two named divergence modes, both in the
   module header: (a) the U-8 shadow-drop's real predicate also requires the elements to be
   **already gone** (`_elementExists`), which is unknowable at preview time, so a drop can take
   more legacy entries than the row showed; (b) a stranded entry consumes no cursor. `undoThrough`
   does not trust the projection — it measures each step — but the LABELS beside a multi-step jump
   could still name the wrong rows in a mixed-stack session.
3. 🔴 **`describe()` IS IMPLEMENTED BY ZERO COMMANDS.** The plumbing, the fallback and the
   throw-safety are gated; the feature it enables is unused. Every row today is a derived label.
4. 🔴 **PERFORMANCE OF A DEEP JUMP IS UNMEASURED.** Each `performUndo()` runs its own
   observer pause/resume cycle (`_withPausedObservers`), so a 40-step jump is 40 cycles. No
   coalescing was attempted and no timing was taken.
5. ⭐ **REFUTED — the brief's "no public read accessor" for the legacy history.** `getHistory()`
   existed and leaked live `Command` objects. See §3; that discovery is *why* the new accessor is
   a frozen projection rather than a getter.
