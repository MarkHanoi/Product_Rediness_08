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
