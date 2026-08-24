# SPEC — STAIR SECOND-RUN DIRECTION: RAC CAPABILITY HANDOFF

**Lane STAIRDIR19 · L-10270 · 2026-08-23 · ⛔ HANDOFF, NOT IMPLEMENTED HERE**

> **Ownership.** `packages/ai-host/**` belongs to lane **RACLIGHT16**, live at the time of writing.
> This lane built and proved the whole stack BENEATH the capability — schema, command, gate,
> geometry rebuild, property-panel control, 49 tests — and stopped at the ai-host boundary. This
> file is the declaration RACLIGHT16 (or its successor) needs; **nothing in `ai-host` was touched.**

---

## 0. Founder's ask

> *"Once a stair in **L or U shape** is created — we should be able to **afterwards modify, via RAC
> and via the UI properties panel, the DIRECTION OF THE SECOND RUN**."* (2026-08-23)

The **UI half is SHIPPED** (`apps/editor/src/ui/property-panel/StairSecondRunWidget.ts`). This spec
is the **RAC half**.

---

## 1. ⭐ The one fact that changes how the verb must be written

**`turnDirection` and `secondRunSide` are TWO concepts, not one, and both are live.**

| Field | Shape it governs | Question it answers | Read by |
|---|---|---|---|
| `turnDirection` | **L** only | Which way does the 90° turn go? | `StairParameterReconciler` case `'L'` |
| `secondRunSide` | **U** only | Which side does the 180° return run sit on? | `StairParameterReconciler` case `'U'`, `StairMeshBuilder:573`, `StairRailingBuilder:903/911` |

`stairSecondRunField(shape)` in `@pryzm/geometry-stair` is the **ONE** table mapping shape → field.
⛔ **The verb must not pick a field itself, and must not translate one into the other** —
`UpdateStairParametersCommand` REFUSES a mismatched field by name (proved:
`packages/command-registry/__tests__/stairSecondRunDirection.test.ts`).

**Neither field is dead.** The founder's phrase "direction of the second run" covers **both**; the
verb should speak the founder's language and resolve the field from the stair's own shape.

---

## 2. ⛔ THE STAMPED FIELD LIES — the verb MUST NOT report it

Four shipping creation paths stamp a **constant** while deriving the flights some other way:
`StairPathAdapter:207`, `StairPath3DToolHandler:221`, `StairPathPlanToolHandler:180`,
`StairPlanToolHandler:209`. That last one provably stamps `'left'` on a stair whose flight 2 turns
**right** (`flight1Dir = (0,0,1)` ⇒ `flight2Dir = (1,0,0)`; the LEFT perpendicular is `(-1,0,0)`).

⇒ **A RAC verb that answers "which way does this stair turn?" from `stair.turnDirection` will lie
on most stairs in the wild.** Use **`deriveStairSecondRunHandedness(stair)`** — exported from
`@pryzm/geometry-stair`, derives from the flight geometry, and returns **`null`** (never `'left'`)
when the side cannot be read. ⛔ Render `null` as "cannot be read", never as a value.

---

## 3. The capability declaration

| | |
|---|---|
| **Name** | `set-stair-second-run-direction` |
| **Family** | `stair` · `stairs` |
| **Executor** | `stair.updateParameters` → `UpdateStairParametersCommand` (⛔ **NOT** `element.updateParameters` — the generic route writes the raw flag and is a **dead control** on any path-authored stair) |
| **Payload** | `{ stairId, updates: { [stairSecondRunField(shape)]: 'left' \| 'right' } }` |
| **Undo** | ONE unit — the command snapshots full `StairData` and `restoreSnapshot`s it (proved) |
| **Scope modes** | `all` · `selection` · `level` · `room` — the shared spatial tail, per C98 §Scoping. **Declaration is the work; the reach already exists.** |

### Phrasings to accept

Free-form, per §RAC-FREEFORM-PLUS-HARD-STOPPERS — **never narrow the vocabulary**:

- *"turn the second run left / right"* · *"flip the second run"* · *"mirror the second flight"*
- *"make the stair turn the other way"* · *"switch the landing to the other side"*
- *"put the return run on the left"* (U) · *"turn it clockwise / anticlockwise"* → map to
  handedness **relative to the first run's direction**, which is the only frame the model has
- *"which way does this stair turn?"* → a READ, answered from `deriveStairSecondRunHandedness`

### Refusal texts — reuse the engine's, do not paraphrase

`stairSecondRunEligibility(stair)` returns the sentence. Verbatim cases:

- **Straight stair** — *"A straight stair has one run, so there is no second run to turn."*
- **Curved / >2 runs** — *"This stair has N runs. Turning 'the second run' is only unambiguous on a
  two-run stair — which of N runs should move is not decided yet, so the control is withheld rather
  than guessing."* ⚠ A **curved** stair persists as `shape: 'L'` (`StairPathAdapter:190`), so shape
  alone cannot separate it; the **run count** does.
- **Wrong field for the shape** — *"'secondRunSide' does not govern a L-shaped stair. A L stair's
  second run is set by 'turnDirection' (which way the 90° turn goes)."*

---

## 4. ⛔ THE ONE UNDECIDED AXIS — ask the founder, do not invent a convention

**What is decided** (and stated in the panel): the flip is a **reflection about the first run's own
axis**, so **run 1 is pointwise fixed** — the stair keeps its start point. That is the literal
content of "change the direction of the *second* run"; moving run 1 would be `MoveStairCommand`.

**What is NOT decided:** whether the editor should **refuse, warn, or allow** when the mirrored run
sweeps **into a wall, off the slab, or out of its room**. This model carries **no clearance check
for stairs**. Per the founder's standing spatial-validity direction (IMPOSSIBLE vs INADVISABLE vs
FINE — *always ASK, never auto-edit*), the shipped behaviour is: **neither refuse nor relocate**,
and say so. The panel says it; **the RAC verb must say it too** rather than implying a check exists.

> **⭐ FOUNDER QUESTION:** should a second-run flip that lands the run in a wall / off the slab be
> (a) allowed silently, (b) allowed with a warning naming the obstruction, or (c) refused? A
> clearance check is a real piece of machinery and is **not** built.

---

## 5. What is already done and needs no RAC work

- Schema, gate, command, refusals — `UpdateStairParametersCommand` (`turnDirection` / `secondRunSide`
  in `updates`, added to `_geometryAffecting`).
- Geometry rebuild — both reconciler branches follow the flip (uniform **and** path-authored).
- Persistence — `ProjectLoader:1334` / `ImportProjectCommand:975` already map both fields.
- Undo / redo — proved at the command.
- 49 tests across `geometry-stair`, `command-registry` and the property panel.

**The RAC lane's work is the DECLARATION and the phrasing. The reach is built.**
