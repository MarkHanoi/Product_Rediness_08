# ADR-0376 — Universal Component Editor: the founding rulings (D1–D5)

**Status:** ACCEPTED · **Date:** 2026-09-01 · **Authority:** the founder's standing delegation of
2026-09-01 (*"take the decisions on me as per whatever is the most architecturally sound"*), applied
to the five decisions `audit/universal-component-editor/2026-09-01/ARCHITECTURE-AND-CONTRACT-AUDIT.md`
§11.2 records as blocking Phase 3. **Subject:** `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md`.
**Evidence base:** eight archaeology lanes + the settling synthesis (8,557 lines), committed `e0f80557`.

> Each ruling below states the decision, the reason it is the *architecturally sound* one rather than
> the convenient one, and what would falsify it. D6–D12 stay open and are ruled by their own phases.

---

## D3 — THE CANONICAL LENGTH UNIT IS **METRES** ⭐ (ruled first: it blocks everything)

`family-runtime` treats **mm** as canonical; `schemas/family-request/geometry.ts` says *"engines
convert internally to metres"*; `Wall.ts` documents metres. **Two canonical length units in one
repository is a 1000× defect class** (audit §3.7).

**RULING: metres is canonical at every model boundary.** Millimetres remain a **first-class authoring
literal** — a user types `1200mm`, the typed unit system converts at parse and the *authored* spelling
is retained as provenance, never as the stored value.

**Why metres and not mm, given mm is what the working engine uses:** the component model's entire
purpose is to JOIN the element model (audit §3.1 — that join is the headline gap). Everything on the
far side of that join is already metres: the element schemas, the geometry producers, the renderer, the
World Model, the site-intel canonical model, and IFC export. Choosing mm would put a 1000× conversion
on the one seam the programme exists to build. Choosing metres puts the conversion inside a typed unit
system whose only job is conversions — which is what `family-runtime`'s unit-tagged literals are FOR.
The cost is bounded and is payable now precisely because `family-runtime` is **not yet reachable from
the editor** (`grep '@pryzm/family-runtime' apps/editor` → 0): changing it today costs nothing in
production and costs a migration forever if deferred.

**Falsifier:** a measured case where an element-side consumer requires mm precision that a double in
metres cannot represent. (IEEE-754 doubles give ~15 significant digits; at building scale this is
sub-nanometre. Not expected — but it is the test.)

> ⛔ **STATUS 2026-09-04 — D3 IS NOT EXECUTED, AND ITS STATED PREMISE IS NOW FALSE.**
> **The premise:** *"payable now precisely because `family-runtime` is not yet reachable from the
> editor (`grep '@pryzm/family-runtime' apps/editor` → 0)."* **Re-measured at HEAD: 10 files** in
> `apps/editor/src` import `@pryzm/family-runtime`, 7 import `@pryzm/family-instance`, and
> `ComponentCatalog.ts` imports `@pryzm/family-loader`. **The window this ruling said it was
> exploiting has closed** — the whole authoring spine is reachable from the Tools rail.
> **The execution:** `packages/family-instance/src/units.ts` (§4D-ONE-LENGTH-SEAM) records it
> plainly — *"Lane 4A executed the D4 half of its row and **deliberately did NOT execute D3** —
> `family-runtime`'s `CANONICAL_LENGTH_UNIT` is still `'mm'` and its own guard test asserts that
> OWED state."* So the 1000× seam this ruling exists to remove **is live today**: a number out of
> the parameter runtime is millimetres, a number authored in the document is metres.
> ⭐ **The mitigation is real and was taken deliberately:** both consumers were funnelled through
> the single `runtimeLengthToMetres` helper, so the flip is one constant
> (`RUNTIME_LENGTH_UNITS_PER_METRE`). ⛔ **Do not inline a second `÷1000` at a new call site** — two
> hand-written ones is how a 1000× defect survives a migration, which is why that file exists.
> ⚠ **Flipping the constant is necessary and NOT sufficient**: existing `.pryzm-family` documents
> carry length `defaultValue`s and expression-valued profile coordinates in runtime units, so D3's
> landing needs a **version migration op**, not only the constant. Costed as rank 6 in
> [`UCE-REACHABILITY-AUDIT.md`](../../03-execution/plans/UCE-REACHABILITY-AUDIT.md).
> **Read the code and the audit, never this paragraph's parenthetical.**

## D4 — **EXPRESSION BEATS `defaultValue`**; the full order is instance > type > expression > definition default

Spec §12 orders resolution `definition defaults → type values → instance overrides → derived → geometry`
— derived **last**, computed from resolved inputs. The code inverts it: `defaultValue` pre-empts
`expression`, **silently**, and `introduce-expression` never clears the default (audit §0.2 item 6,
R7). The founder's own §64 demo — *"make the glass width always the opening width minus twice the frame
width"* — therefore **fails silently today**, in the only progressive-parametrisation path that exists.

**RULING:** an explicit **instance override** wins (a user's deliberate act on this occurrence), then a
**type value** (a named configuration's deliberate act), then the **expression** (design intent), and a
**definition default** is what applies when nothing else does — a default is a *fallback*, and a
fallback that beats design intent is not a fallback. `introduce-expression` MUST clear the superseded
default (or record it as `supersededDefault` for provenance), and the both-present case — which
`resolveParameter.test.ts` does not currently cover — becomes a required test arm.

**Falsifier:** a parameter where the authored default must survive an expression. None found; if one
exists it is a *conditional* expression, which the rule engine expresses without inverting precedence.

## D5 — THE CANONICAL VOCABULARY IS **`Component`**; `Family*` is its frozen legacy spelling

C84 **EI-8** ("one vocabulary per concept") makes choosing mandatory; C69 §1.1 makes wire names
permanent; C107 §1.1 records *"four vocabularies over one family"* as another family's headline defect.

**RULING:** **`Component` is the one canonical vocabulary** — in the contracts, in every new symbol, and
on every user-facing surface. The spec's §0 is explicit that this is not a Revit Family Editor, and
*Family* is Revit's word for it. **The existing `family-*` package names and the `.pryzm-family` format
extension are FROZEN AS LEGACY SPELLINGS** and are not renamed: they are wire/identity names under C69
§1.1, and a rename mid-programme is exactly the churn C84 warns against. **No NEW symbol may use
`Family`.** C111 declares the equivalence ONCE — `FamilyDefinition ≡ ComponentDefinition` — and nothing
restates it.

**Precedent:** this is the `curtainwall.create` treatment — a registered legacy alias canonicalised to
one spelling, declared in one place (C69 / `command-aliases.test.ts`).

## D1 — **RETIRE the rival runtime, HARVEST its assets** — executed only AFTER the instrument is fixed

`apps/component-editor` (52 files / 5,918 LoC, S52–S59) carries a second composition root blessed by
ADR-0316 at `MAX_RIVALS=1`. **ADR-0316 §5 names six conditions that void its own blessing, and this
spec triggers at least four** — decisively the one §4.2.1 relied on: the blessing permitted the rival
bus to have no redo, no validation gate, no store declaration, no patch pairs, no event record, no CRDT
hook, no refusal values and no persistence **only because family state was *"in-memory and never
CRDT-merged or replayed from a persisted log."*** The spec makes the component a first-class World-Model
participant. **That clause expires by its own terms.**

**RULING: RETIRE the rival runtime; HARVEST its assets onto the canonical bus** — the 12 AI-invocable
verbs (including the five real constraint creators), the `.pryzm-family` format work, the sketch
surface, and the six quality gates. **Not BRIDGE:** a bridge preserves the second composition root,
which P1 forbids and which ADR-0316's expiry clause has already voided.

⛔ **SEQUENCING IS PART OF THE RULING.** `check-single-compose.ts` prints the literal `"0 rivals"` while
its own run enumerates one and names `familyEditorRuntime.ts` (**L-12830, P0**). Every judgement about
this application is currently taken against an instrument printing a false green **about that exact
application**. **Fix the gate first; execute the retirement second.** A retirement justified by a lying
instrument would be right by accident, and this repository does not accept right-by-accident.

> ⭐ **STATUS 2026-09-04 — THE SEQUENCING BLOCKER IS CLEARED; THE RETIREMENT IS NOT DONE.**
> The `"0 rivals"` literal was removed from `check-single-compose.ts` on **2026-08-30**
> (`4a4b35c0`); the gate now reads **1 definition · 1/1 rival (`createFamilyEditorRuntime`) · 2/2
> production callers, RC=0**. **D1's own precondition is therefore satisfied and the retirement is
> executable.**
> ⛔ **Neither half has happened, and the HARVEST is the expensive half to keep forgetting.**
> `apps/component-editor` is not merely un-retired, it is **UNREACHABLE**: not a rollup input
> (`vite.config.ts:425-428` declares only `index.html` / `browser.html`), never copied into the
> runtime image (`Dockerfile:251-280`), no server route, no link, **zero dependent workspaces**, and
> its `test:ci` is silently skipped by CI. Grepping all 105 files of `dist/assets/` for
> `mountAppShell` / `familyEditorRuntime` / `constraint.addCoincident` → **0**.
> ⭐ **What is stranded there is the largest block of built-and-unreachable value in the programme**:
> the five REAL constraint creators on planegcs (spec §14) and eleven sketch modules (spec §57
> *Create*/*Modify*) — capabilities the live editor does **not** have. ⚠ **Harvest is not a port**:
> the rival bus has no redo, no validation gate and no persistence, so the verbs must be re-authored
> to C16 rather than moved. Costed as rank 3 in
> [`UCE-REACHABILITY-AUDIT.md`](../../03-execution/plans/UCE-REACHABILITY-AUDIT.md).

## D2 — 3-D IS A FIRST-CLASS AUTHORING SURFACE **FOR EVERYTHING THAT DOES NOT INFER A PLANE**

Spec §58 says 3-D is first-class authoring; C86 §10.6 D8 (founder-ratified) says preview, for a
**measured** reason: *"there is no camera in this repo guaranteed to be looking at that plane."*

**RULING — neither yields wholesale, because the contract's reason is narrower than its clause.** The
reason binds **plane-inferring input** (sketching), not authoring generally. Therefore: **3-D IS
first-class for selection, face/edge/feature picking, parameter and dimension manipulation, material and
host preview** — none of which infers a work plane. **3-D is NOT a sketch-input surface** until a
camera-plane guarantee exists; sketching stays on the explicit-plane surfaces. C86 §10.6 is amended to
record exactly this split and its reason, so the next reader inherits the boundary rather than the
conflict.

**Falsifier:** a 3-D authoring gesture that cannot avoid inferring a plane and is nonetheless required
by the spec — it would move that gesture, not the ruling.

---

## Consequences

- **Phase 3 is unblocked** (its entry named D1/D3/D4/D5).
- D3 and D4 are **canonical-model rulings** and belong in **C110** the day it is minted; D5's
  equivalence belongs in **C111**; D2's split amends **C86 §10.6**; D1's retirement is a Phase-7 lane
  gated on the L-12830 fix.
- **D6–D12 remain OPEN** and are ruled by the phases that own them (nesting, feature-graph-vs-undo, the
  C74 §4.2 solving-family classification, the `component` element kind, the descriptor path, the C15
  host-surface question, `formatVersion` comparability).
- The audit's R1 stands as the standing review rule: **any lane proposing a new
  `ComponentDefinitionSchema`, sketch surface, expression engine, refusal vocabulary or AI tool schema
  is rejected on §1 grounds.**

---

# ADDENDUM (2026-09-01) — D9 and D10, ruled to unblock Phase 4

Same authority (the founder's standing delegation). Both are named by the audit §11.2 as Phase-4
entry conditions.

## D9 — **YES: mint the `component` element kind.** It is the JOIN, not a rival.

The audit's headline gap is that **no bus verb anywhere places a component into a project**. A
*placed* component is, by every property that matters, an element occurrence: it needs a stable id,
a level, a host, selection, persistence, undo, a snapshot row and a graph identity. Those are
exactly what the element model already provides for twenty-odd families.

**The alternative is worse and must be named so it is not drifted into:** a parallel
"component instance" concept living outside the element model would create a **second citizenship
class in the World Model** — two answers to "what is in this project", which is C84 EI-9 at the
largest possible scale and precisely the rival this whole programme exists to avoid.

**Binding conditions, not optional:** the kind is bound by **C84 §6's twelve mandatory sections**;
the family census row moves **in the same commit** as the kind (the row-and-range rule, one level
down — it has now failed on contracts seven times and on the index once today); and its verbs carry
**C69 register rows from the first commit** with **C16 CA-21 executed read-back from the
AUTHORITATIVE store**, never the DTO store the handler wrote.

**Falsifier:** if placing a component turns out to require no id, level, host, persistence or undo,
it is not an element and this ruling is wrong. (It requires all five.)

## D10 — **ATTEMPT the descriptor path for one family; the descope is PRE-AUTHORISED.**

Turning it on makes the component family the first production caller of `runtime.scene.mount` and
constructs the first committer ever built in a browser (audit §0.2 item 4, R13).

**RULING: attempt it in a lane whose failure is survivable, and the slice's acceptance MUST NOT
depend on it.** The 3-D leg ships through the existing `*FragmentBuilder` path by default; the
descriptor path is proven separately, and **if it cannot be made to work for one family the
migration is DESCOPED, not faked** (spec §75) — that outcome is authorised here in advance, so no
lane is ever under pressure to report a rendering path working when it is not.

**Why pre-authorising the failure is the sound move:** R13 is a rendering-architecture risk on a
path that has *never run in production*. A lane that must succeed will fake it; a lane permitted to
fail honestly will measure it. The acceptance is **a rendered instance, not a passing test** —
and "not rendered" is an acceptable, reportable result.

**Falsifier:** if the FragmentBuilder fallback cannot carry a component's 3-D at all, the descriptor
path stops being optional and this ruling must be revisited before Phase 4E ships.
