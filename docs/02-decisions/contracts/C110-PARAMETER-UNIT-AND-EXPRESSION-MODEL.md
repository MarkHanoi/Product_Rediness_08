# C110 — Parameter, Unit & Expression Model

> **Stamp**: 2026-09-01 · **Lane**: C110 (Universal Component Editor, Phase 3A) ·
> **Status**: CANONICAL — deliberately **NOT ACTIVE** (§9.1 states the exit condition)
> **Ratified by**: [ADR-0376](../adrs/ADR-0376-universal-component-editor-founding-rulings.md) —
> **D3** (metres is canonical) and **D4** (expression beats `defaultValue`) are reproduced here as
> normative text, because ADR-0376's own Consequences section says they *"belong in C110 the day it
> is minted"*.
> **Source of requirements**: [`STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC`](../../01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md)
> **§8–§15** (properties-vs-parameters, parameters, units, expressions, parametric-after-placement,
> progressive parametrisation) and the **determinism clause of §46–§56**. Where this contract and
> that spec disagree, **the spec wins and this contract is the defect** — every clause cites the
> spec section it implements.
> **Evidence base**: [the Architecture & Contract Audit](../../../audit/universal-component-editor/2026-09-01/ARCHITECTURE-AND-CONTRACT-AUDIT.md)
> §0.2 item 6 · §3.6 · §3.7 · §11.3 R7/R8, and
> [Lane C](../../../audit/universal-component-editor/2026-09-01/c-parameters-formulas-constraints.md)
> §1.1 · §3.4 · §3.6 · TRAP-1 · TRAP-3 · TRAP-5 · TRAP-6 · TRAP-11 · §5.1. Every number in this
> contract was **re-measured in this tree on 2026-09-01** and every measurement is shown.
> **Governs**: `packages/family-runtime/**` (the whole package) · the parameter, unit and expression
> semantics of `FamilyParameterSchema` and `FamilyDocumentSchema.defaults` in
> `packages/file-format/src/family-schema.ts` · the parameter operators in
> `packages/file-format/src/family-migrations/ops/` · the unit seam in
> `packages/family-instance/src/bakeFamilyInstance.ts` · the resolver pre-flight in
> `packages/family-loader/src/loadFamily.ts` · and `ParametricParameterSchema` in
> `packages/schemas/src/family-parametric/parameter.ts`.
> **Binds**: **C73** (geometry determinism & the epsilon policy — §5 is an INSTANCE of C73 §1, never
> a rival) · **C74** (constraint honesty — §6's refusals are C74 §1.1's vocabulary applied at the
> parameter layer) · **C62** (confidence & typed unknowns) · **C75** (provenance — the five-value
> vocabulary a parameter's `provenance` field will take, never a sixth) · **C65** (element type
> system — owns what an element TYPE is; this contract owns what a PARAMETER is) · **C03**
> (schemas/commands/state) · **C05**/**C47** (persistence + format versioning — own the migration a
> new field triggers) · **C69** §1.1 (wire names are permanent) · **C84** EI-8/EI-9 (one vocabulary
> per concept; non-rivalry) · **C81** (design intent — §2 is why *"the model retains WHY"* is a
> parameter-model property before it is a constraint-model one) · **C111** (Component Definition and
> the `.pryzm-family` model — the sibling minted in this same phase; **the boundary is §0.1**).
> **Section tags this contract mints**, so the code that already cites them has a home:
> **`§PARAM-PRECEDENCE`** (cited today by `resolveParameter.ts`) · **`§SUPERSEDED-DEFAULT`** (cited
> today by `introduce-expression.ts` and `family-migration.test.ts`) · `§CANONICAL-LENGTH-METRES` ·
> `§UNIT-KIND-ERASURE` · `§DIAG-CLOSED-SET` · `§APPROX-BUILTIN` · `§TWO-DEFAULT-STORES`.
> ⭐ **Two of those tags were being cited by production code with no document to resolve to.** A
> `§`-tag that points at nothing is a citation to a contract that does not exist — the defect class
> this whole programme was commissioned to close, in miniature.

---

## §0 — WHAT THIS CONTRACT OWNS, AND WHAT IT EXPLICITLY DOES NOT

### §0.1 — Refusal table — read this before adding a clause

| Question | Owner, not this contract |
|---|---|
| What a **ComponentDefinition / Type / Instance** is; the `.pryzm-family` envelope | **C111** — this contract owns only the parameter, unit and expression *semantics* inside that document |
| What an element **TYPE** is and how it survives a save | **C65** |
| How trustworthy a value is; the word for *unknown* | **C62** — a `confidence` on a parameter is an INSTANCE of C62, never a rival scale |
| Where a value came from — the five-value vocabulary | **C75** |
| Whether a **geometric constraint** may be solved, enforced, validated or merely advised | **C74** §4.2, per family, in writing. ⛔ §6.6 below forbids this contract from being read as authorisation |
| Tolerance constants, epsilons, and geometry determinism | **C73** — §5 defers to it and adds exactly one thing C73 §1.2 does not name (§5.4) |
| The **feature / history graph** (spec §16), booleans, sketch entities | Out of scope entirely. A parameter is an input to a feature, not a feature |
| The 15 constraint kinds of spec §14, and design-intent preservation | **C74** (honesty) + **C81** (intent). §2.3 states only *why the precedence question is an intent question* |
| Element-level parameters in the shipping editor (`element.updateParameter`) | **C03** / **C16** / **C65** today. §7 G-2 names the join as the gap it is; **this contract does not annex it** |

### §0.2 — ⛔ THE SUBJECT IS TEST-REACHABLE ONLY. MEASURED ON FOUR AXES, STATED FIRST.

C84 §3.5.1 requires four axes because in this repository *authored ≠ wired*, and a contract whose
subject is unreachable must say so **before** it says anything else. Re-measured 2026-09-01:

| Axis | Reading | Command |
|---|---|---|
| **import / construction** | `apps/editor` imports `@pryzm/family-runtime` **0 times**; so do `src/` and `plugins/` | `grep -rn "@pryzm/family-runtime" apps/editor src plugins` → no output |
| **bus verb** | **0** `family.*` or `component.*` verbs in `packages/schemas/src/registry.ts`; **0** rows in the C69 verb register | (recorded in `phase3/c111-measurements.txt` M8/M9) |
| **build graph** | Declared by exactly **three** manifests: `packages/family-instance`, `packages/family-loader`, and the root `package.json`. **No app manifest, no plugin manifest.** | `grep -rn "@pryzm/family-runtime" --include=package.json` |
| **call** | One production call chain: `apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts` → `bakeFamilyInstance` → `resolveParameter`, plus `loadFamily`'s pre-flight. That job's exported entry point is called **from tests only**; no route, no queue consumer | `grep -rn "bakeFamilyInstance(" --include=*.ts` |

> ⭐ **This is the opposite of C107 §0.1's finding and must not be confused with it.** C107 measured
> a family that is **honestly unbuilt**. This contract's subject is **built, tested and unreachable**
> — 1,118 lines of source and 628 lines of test across 6 suites, **63 tests, all passing**
> (`npx vitest run` in `packages/family-runtime`, **RC=0**, 2026-09-01). ⛔ Therefore **every TO-BE
> clause below is cheap today and expensive later**, and §3.3 states the decay explicitly.

⚠ **The corollary that governs how this contract may be quoted.** Nothing in `packages/family-runtime`
has ever run for a user. A clause here that reads as *"PRYZM resolves parameters like this"* is
FALSE at the product; the true sentence is *"PRYZM's component-parameter engine, which the product
cannot reach, resolves parameters like this."* §7 G-2 is the whole distance between those sentences.

### §0.3 — The two sentences this contract defends

> **1. A DEFAULT IS A FALLBACK, AND A FALLBACK THAT BEATS DESIGN INTENT IS NOT A FALLBACK.**
> (ADR-0376 D4 · §2)
>
> **2. A NUMBER WITHOUT A DECLARED QUANTITY KIND IS NOT A MEASUREMENT, AND A MODEL WITH TWO
> CANONICAL LENGTH UNITS IS A 1000× DEFECT WAITING FOR ITS FIRST SEAM.**
> (ADR-0376 D3 · §3)

Everything below is a consequence. `superseded-default` is a **correct diagnostic**, not noise
(§2.4). An expression that threw resolving to **nothing** is a **correct outcome**, not a gap
(§2.5). A `string` parameter keeping its default against an expression is a **correct exception**,
not an inconsistency (§2.6).

### §0.4 — ⛔ THE MEASUREMENT WINDOW, STATED BECAUSE IT IS NOT THE COMMIT BOUNDARY

The audit that commissioned this contract was written at HEAD `6e15af2f` and describes the D4
precedence inversion as **live**. It is **no longer live in this working tree**: the ADR-0376 D4
repair landed in `packages/family-runtime/src/resolution/resolveParameter.ts`,
`packages/family-runtime/src/types.ts`,
`packages/file-format/src/family-migrations/ops/introduce-expression.ts` and
`packages/file-format/src/family-schema.ts` **as uncommitted working-tree changes** on 2026-09-01
(lane U), together with the both-present test arm the suite lacked.

**This contract describes the WORKING TREE, and says so rather than letting a reader assume HEAD.**
Two consequences, both binding:

1. Every AS-IS cell below marked **REPAIRED (D4)** is true of the working tree and **false of
   `6e15af2f`**. If those changes are reverted or lost, the cells revert with them and this
   contract's §2 becomes a TO-BE.
2. ⛔ **Do not re-report the D4 inversion from the audit's text without re-reading the code.** That
   is exactly the failure the audit itself commits about `check-single-compose.ts` (it cites a
   2026-08-29 reading of a gate repaired 2026-08-30), and repeating it here would be the second
   recurrence in the same programme.

---

## §1 — THE PARAMETER OBJECT (spec §9)

### §1.1 — Spec §9's thirteen attributes, each mapped to a field or measured ABSENT

Spec §9 enumerates: *identity, semantic meaning, name, datatype, unit, default, current value,
scope, formula, dependencies, constraints, editable, visible, provenance.* Mapped against
`FamilyParameter` (`packages/family-runtime/src/types.ts`) and its persisted twin
`FamilyParameterSchema` (`packages/file-format/src/family-schema.ts`):

| # | Spec §9 attribute | AS-IS | TO-BE |
|---|---|---|---|
| 1 | **identity** | `id` — a prefixed-ULID `ParameterId`, stable across save/load and migration (`rename-parameter` preserves it) | unchanged. **This is the wire name and it is permanent (C69 §1.1)** |
| 2 | **semantic meaning / classification** | ⛔ **ABSENT** | a `semantic` field naming a classification term. ⛔ Its vocabulary is **not minted here** — it is the bSDD/IFC axis C111 and the classification work own. **§7 G-6.** |
| 3 | **name** | `name`, constrained by `NAME_RX` = `^[A-Za-z][A-Za-z0-9_ ]{0,63}$`, uniqueness enforced by the `duplicate-name` diagnostic | unchanged. §1.4 explains why the name — not the id — is the expression identifier |
| 4 | **datatype** | `dataType` ∈ `length · angle · number · count · boolean · string` | unchanged as a *datatype*. It is **not** a quantity kind — see §3.4 |
| 5 | **unit** | ⚠ **CONFLATED WITH DATATYPE.** There is no unit field; `dataType: 'length'` implies the canonical length unit and nothing else | §3.1's canonical unit is implied by the quantity kind; the **authored** spelling is retained per §3.2 |
| 6 | **default** | `defaultValue: number \| string \| null` | unchanged in shape; **demoted in precedence** by §2.2 |
| 7 | **current value** | **not a field** — it is the resolver's *output*, `ResolverOk.values[name]` | ⭐ correct as-is, and §2.7 explains why storing it would be the defect |
| 8 | **scope** | ⚠ **TWO AXES WEARING ONE WORD.** `kind: 'type' \| 'instance'` is a *declaration*; the four resolution scopes are a *different* axis. **§2.1 separates them; §1.2 measures that `kind` is read by nobody** | §2.1 |
| 9 | **formula** | `expression: string \| null` | unchanged in shape; **promoted in precedence** by §2.2 |
| 10 | **dependencies** | **not a field** — derived per pass by `collectIdentifiers` over the parsed AST, then Kahn-sorted. ⭐ Derived, never stored, is the right answer: a stored edge can disagree with its expression | unchanged |
| 11 | **constraints** | ⛔ **ABSENT** on the parameter. (A *sketch* constraint is a different object, persisted by `ProfileConstraintSchema`, and is C74/C111's subject.) A per-parameter `min`/`max`/`step`/`allowedValues` has no home | a `constraints` field. **§7 G-4.** ⛔ It is a **range/domain** declaration and mints **no** geometric-constraint capability — §6.6 |
| 12 | **editable** | ⛔ **ABSENT.** Nothing distinguishes *"the user may change this"* from *"this is derived and read-only"* — except that an expression exists, which is inference, not declaration | ⭐ **derivable, not new state**: a parameter with an expression and no override is not editable *by definition*. §7 G-5 records the decision as OPEN rather than guessing |
| 13 | **visible** | `exposed: boolean` — *"exposed to the host editor's instance inspector"* | unchanged. ⚠ Name drift: spec says *visible*, code says `exposed`. **The wire name is `exposed` and stays (C69 §1.1); the UI word is *visible*.** Stated so it is a disclosure, not a discovery |
| 14 | **provenance** | ⛔ **ABSENT.** One partial exception: `supersededDefault` (§2.4) is a provenance field for exactly one event | a C75 `ValueOrigin`. ⛔ **The five-value vocabulary is C75's; this contract mints no sixth value.** **§7 G-6** |

**Score: 8 present · 1 present-but-conflated (unit) · 1 present-but-ambiguous (scope) · 4 absent.**
This is Lane C §1.1's *"8 of 11"* re-derived against the spec's full list, which names fourteen
things, not eleven. ⚠ **Neither count is the point** — the point is *which* four are absent, and
they are the four that make a parameter a semantic object rather than a labelled number.

### §1.2 — ⛔ `kind` IS DECLARED IN TWO PLACES AND CONSULTED BY NOBODY. MEASURED.

`FamilyParameterKind = 'type' | 'instance'` is declared in `packages/family-runtime/src/types.ts`
and mirrored as `FamilyParameterKindSchema` in `packages/file-format/src/family-schema.ts`. Its
documented meaning is that `'type'` parameters are *"baked per family-type"* and `'instance'`
parameters are *"overridable per placed instance"*.

**`pickOverride` — the function that decides whether an override applies — never reads `p.kind`.**
Measured by execution, not by reading:

```
CLAIM 3 — kind is never consulted: an INSTANCE override lands on a kind:"type" param
  kind:"type" + instanceOverride -> {"TypeOnly":1.8} diagnostics: 0
```

> **§1.2 — MUST (TO-BE).** `kind` is either **enforced** — an `instanceOverrides` entry for a
> `kind: 'type'` parameter produces an `invalid-override` diagnostic naming the parameter — **or it
> is deleted**. A field that declares a rule the resolver does not apply is C74 §1.1's shape one
> layer down from geometry: *the reported identity does not equal the performed work*.

⛔ **The decision is DEFERRED, not taken, and the reason is honest:** enforcing it would refuse
documents that the schema currently accepts, and no document exists to be refused (§0.2) — but the
right answer depends on whether the editor's instance inspector filters by `kind` when it is built,
which is Phase 4 work. **§7 G-3, OPEN.** ⚠ What is **not** deferred is the disclosure: until it is
decided, **no document, UI or AI surface may claim that a `kind: 'type'` parameter is protected from
instance override.**

### §1.3 — Properties are not Parameters (spec §8), and this contract owns only one of them

A **parameter** controls generation (`FrameWidth = 0.075 m`); a **property** describes
(`FrameMaterial = Aluminium`). Spec §8 forbids collapsing them. The distinction is drawn correctly
today in exactly one place in the repository, and it is not this one — the zoning fact vocabulary
(`packages/site-parcel-data/src/rulepacks/declarative/factVocabulary.ts`, which separates evaluator
INPUTS from rule OUTPUTS under C84 EI-9). ⛔ **That file is FROZEN and off-limits to this programme
(audit R9); it is cited as a PRECEDENT to copy, never a file to touch.**

> **§1.3 — MUST NOT.** A property may not be modelled as a `FamilyParameter` in order to reuse the
> resolver. The resolver's scope is `Record<string, number>` (§4.6): a property that entered it
> would be silently unresolvable, and a `string` parameter already demonstrates the failure mode
> (§2.6). **Descriptive data belongs in the properties bag C111 owns.**

### §1.4 — Identity: the `id` is the wire name; the `name` is the expression identifier

Two identifier spaces exist on purpose and the split is correct:

- `values` is keyed by **`name`** — *"names are the identifiers used inside expressions"*.
- `FamilyType.values` and `InstanceOverrides` are keyed by **`id`**.

> **§1.4 — MUST.** A rename changes the expression-facing identifier and **must** rewrite every
> expression that references it, in the same operation. `rename-parameter` is the operator that owes
> this. ⚠ **NOT VERIFIED BY THIS LANE** — whether `rename-parameter` rewrites referencing expression
> strings was not measured, and this contract does not assert that it does. **§7 G-7, UNMEASURED.**
> A rename that does not rewrite produces an `unknown-identifier` at the next resolve, which is a
> loud failure rather than a silent one — but *loud* is not *handled*.

---

## §2 — THE FOUR SCOPES AND THE RESOLUTION ORDER · **`§PARAM-PRECEDENCE`** · ADR-0376 **D4**

### §2.1 — The four scopes are four VALUE SOURCES, and they are not the two-member `kind` enum

Spec §9 names four scopes — **Definition · Type · Instance · Derived**. All four exist in the
resolver as four distinct value sources, and **none of them is `FamilyParameterKind`**:

| Spec scope | The value source in code | Keyed by |
|---|---|---|
| **Definition** | `FamilyParameter.defaultValue` | — (on the parameter) |
| **Type** | `FamilyType.values[parameterId]` | `id` |
| **Instance** | `InstanceOverrides[parameterId]` | `id` |
| **Derived** | `FamilyParameter.expression`, evaluated against already-resolved values | `name` (inside the expression) |

> **§2.1 — MUST.** *Scope* means the four value sources above. `kind` is a **declaration of intended
> override surface** and is a different axis (§1.2). ⛔ **The two words may not be used
> interchangeably in code, contract, UI copy or an AI tool schema.** C84 EI-8 is the rule; this is
> its second application in this contract after §1.1 row 8.

### §2.2 — ⭐ THE ORDER, NORMATIVE

> **§2.2 — MUST.** A parameter resolves in exactly this order, first match wins:
>
> ### **`instance` > `type` > `expression` > `definition default`**
>
> 1. **instance override** — a user's deliberate act *on this occurrence*;
> 2. **type value** — a named configuration's deliberate act;
> 3. **expression** — the author's design intent, evaluated from already-resolved inputs;
> 4. **definition default** — what applies when nothing else does.

**AS-IS: REPAIRED (D4) in the working tree** (§0.4). At `6e15af2f` the code ran
`instance > type > default > expression`, and a parameter carrying both a default and an expression
`continue`d before the expression was ever reached.

⚠ **Reconciliation with spec §12, which is not word-for-word this order.** Spec §12 writes
*"definition defaults → type values → instance overrides → derived parameters → geometry"*. That is
a **pipeline order** — the sequence in which a resolver *consumes* inputs, ending with derived
values computed **from** the resolved inputs. §2.2 is a **precedence order** — which source wins
when more than one has an opinion. They agree on the only thing that matters: **derived is computed
from resolved inputs and is not pre-empted by them.** Reading spec §12 as a precedence list is what
produced the inverted code, and this paragraph exists so the next reader does not repeat it.

### §2.3 — Why this is an intent question, not an implementation preference

The founder's §64 acceptance test is *"make the glass width always the opening width minus twice the
frame width."* Progressive parametrisation (spec §13) means the parameter **already had a value**
when the formula arrived — that is the only way it ever happens. Under the old order, the formula
was written, persisted, validated, dependency-sorted — **and never evaluated**, with `ok: true` and
zero diagnostics.

⭐ **That is spec §75's exact prohibition, already shipped:** *"if AI says 'the width is now
proportional to the height' a real formula exists."* One existed. It could not run. **C81's
sentence — the model retains WHY the geometry has its shape — is a property of the parameter model
before it is a property of the constraint model**, and §2.2 is where it is kept or lost.

### §2.4 — The both-present case is a **WARN**, never a silent resolution · **`§SUPERSEDED-DEFAULT`**

> **§2.4 — MUST.** A parameter carrying **both** a non-null `defaultValue` **and** an evaluable
> expression produces a diagnostic of code **`superseded-default`**, severity **`warn`**, carrying
> `parameterId` and **naming the parameter in its message**. Severity is `warn` and not `error`
> because a dead default is a **documentation defect, not a resolution failure**: `ok` stays `true`
> and the pass completes.

> **§2.4-a — MUST.** `introduce-expression` **clears** the `defaultValue` it supersedes and records
> it as `supersededDefault` for provenance. **Clearing is not optional.** Leaving it behind is what
> made the migration a no-op whose entire visible effect was nothing.

> **§2.4-b — MUST.** `supersededDefault` is **provenance and is never resolved**. It is
> `.optional()` and **not** `.default(null)`, deliberately: a defaulted key would appear on every
> parameter of every existing document, change its packed bytes, and therefore change its
> **signature** — the `.pryzm-family` envelope is signed (C111's subject). A provenance field that
> breaks signatures is not provenance, it is a format break.

⚠ **`superseded-default` is a NEW diagnostic code, added by the D4 repair.** The audit and Lane C
both say the engine has *"14 typed diagnostic codes"*. That reading is now **stale by one** — see
§4.4, which measures it rather than restating it.

### §2.5 — An expression that THREW does not fall back to the default

> **§2.5 — MUST NOT.** When an expression fails — parse error, unknown identifier, divide-by-zero,
> non-finite, unknown function, bad arity — the parameter **resolves to nothing** and the pass is
> `ok: false` with a typed diagnostic. It **may not** fall back to `defaultValue`.

A fallback here would restore the defect §2.2 removes, wearing an error handler's clothes: the user
would see a plausible number, the pass would look partially successful, and the formula would again
be inert. **A missing value is visibly missing; a substituted one is not** (C75's key principle,
applied to a computation rather than a load).

### §2.6 — The one shape where a default legitimately survives an expression

> **§2.6 — MUST.** A parameter whose `dataType` is `'string'` does **not** evaluate its expression
> and takes its `defaultValue`. The evaluator is numeric (`EvalScope = Readonly<Record<string,
> number>>`), so a string parameter has no evaluable meaning. It emits **no** `superseded-default`
> warning, because its default is not superseded — it is the only value there is.

⭐ This arm exists so that *"expression beats default"* is **never over-applied**. It is guarded by
its own test arm; if the guard is deleted, string parameters resolve to `undefined` silently.

### §2.7 — There is no stored `currentValue`, and there must not be one

> **§2.7 — MUST NOT.** The resolved value is **not persisted on the parameter**. It is the output of
> a pure function of `(parameters, type, instanceOverrides)`.

A stored current value is a cache with no invalidation key, and it can disagree with the expression
that produced it. Spec §71–73's rule — *"never let stale geometry overwrite newer state"* — has the
same shape one layer up: a stale *value* overwriting a live *formula* is the parameter-layer version
of the same defect. **Caching is legitimate; it belongs behind an identity that includes the
definition hash and the parameter state, never inside the parameter.**

### §2.8 — ⛔ **`§TWO-DEFAULT-STORES`** — A DOCUMENT HAS TWO PLACES TO PUT A DEFAULT, AND ONLY ONE IS READ

Measured 2026-09-01:

- `FamilyParameterSchema.defaultValue` — read by `resolveParameter`. **Canonical.**
- `FamilyDocumentSchema.defaults` (a `z.record`) — **written** by three migration operators
  (`add-parameter`'s `seedDefault`, `change-parameter-type`, `delete-parameter`'s cleanup) and
  **read by no resolver anywhere.** `grep '\.defaults\b'` across `family-runtime`, `family-instance`,
  `family-loader` and `file-format/src` returns writers only.

> **§2.8 — MUST.** `FamilyParameter.defaultValue` is **the** definition-scope default.
> `FamilyDocument.defaults` is **not a parameter default** and no resolver may begin reading it.
> Either it is given a distinct, documented meaning, or it is removed by a migration.

⛔ **AND ONE CONSEQUENCE OF THE D4 REPAIR THAT NO LANE REPORTED.** `introduce-expression` now clears
`defaultValue` — and it **does not touch `document.defaults[id]`**. Verified: the file contains no
occurrence of `defaults`. So a superseded default may survive in the second store. It is **inert
today** because nothing reads that store — but *"inert because nothing reads it"* is precisely the
condition that ends the moment someone adds a reader. **§7 G-8, OPEN**, and it is the reason §2.8
is a MUST rather than a note.

---

## §3 — UNITS · **`§CANONICAL-LENGTH-METRES`** · ADR-0376 **D3**

### §3.1 — The ruling, normative

> **§3.1 — MUST.** **Metres is the canonical length unit at every model boundary.** Radians is the
> canonical angle unit. A stored length is a number of metres; a stored angle is a number of
> radians. There is **no second canonical length unit** in the component model.

**Why metres and not millimetres, given millimetres is what the working engine uses** (ADR-0376 D3,
reproduced because a ruling separated from its reason gets re-argued): the component model exists to
JOIN the element model, and everything on the far side of that join is already metres — the element
schemas, the geometry producers, the renderer, the World Model, the site-intel canonical model and
IFC export. Choosing millimetres would put a 1000× conversion **on the one seam the programme exists
to build**. Choosing metres puts the conversion inside a typed unit system whose only job is
conversions.

### §3.2 — Millimetres is a **first-class authoring literal**, converted at parse

> **§3.2 — MUST.** A user may author `1200mm`. The typed unit system converts it **at parse time, at
> the literal**, and the **authored spelling is retained as provenance, never as the stored value.**

The mechanism already exists and is correct in shape: `toCanonical(value, unit)` runs at
tokenise/eval time on **literals**, so `5 m + 200 mm` is genuinely correct mixed-unit arithmetic
rather than coincidentally correct. **Only its direction changes** under §3.1.

⚠ **The provenance half is NOT BUILT.** The AST's `number` node carries `unit`, so the authored
spelling survives to the AST — and the resolver stores only the number. Retaining the authored
spelling to the document is **§7 G-9, OPEN**.

### §3.3 — ⛔ THE CODE SAYS MILLIMETRES TODAY. THE DELTA IS OWED, AND ITS WINDOW IS DECAYING.

**AS-IS, measured 2026-09-01.** `toCanonical` maps `m → mm (×1000)` and treats `mm` as identity;
`types.ts` documents *"`'length'` parameters are stored in millimetres"*; `unit-coercion.ts`'s header
states *"`5 m + 200 mm` resolves to `5200` mm cleanly"*, and the test suite asserts exactly that.
**§3.1 is therefore a TO-BE, and this contract states that plainly rather than describing the
repository it wishes it had.**

**The seam already disagrees with itself, inside one function.** In
`packages/family-instance/src/bakeFamilyInstance.ts`:

| Axis into `produceExtrude` | Declared unit | Converted? |
|---|---|---|
| **height** | mm → m via `MM_PER_M` | **YES** |
| **profile polygon** | **metres** (`profileToPolygon.ts`: *"coordinates in METRES"*) | **NO** — passed straight through |

⭐ **This is LATENT, not live, and must be stated that way.** `apps/component-editor` has a sketch
store and **no writer from the sketch into `.pryzm-family` `profiles[]`**, so nothing today feeds
millimetres into a metres contract. The 1000× is a contract mismatch between two surfaces **that are
not yet joined** — and that join is precisely the work D3 exists to unblock.

> **§3.3 — MUST.** The migration lands as **one change-set**, never in parts. Executing the
> parameter axis alone produces *"metres is canonical"* true of parameters and false of sketch
> coordinates, with no gate saying which is which — a worse state than the one it replaces. The
> full plan, its four groups, its blocker (the sketch coordinate system, whose millimetre choice
> carries a **stated solver-tolerance rationale that nobody has measured**), its sequencing and its
> falsifier are written at
> [`audit/universal-component-editor/2026-09-01/phase3/d3-unit-migration.md`](../../../audit/universal-component-editor/2026-09-01/phase3/d3-unit-migration.md).

> ⛔ **§3.3-a — THE WINDOW DECAYS.** `find . -name "*.pryzm-family"` returns **nothing**: there is no
> corpus, so no `formatVersion` bump and no data migration is required. **Re-run that command at the
> start of any lane that executes this.** If it returns a file, this plan is void and a
> `scale-length-parameters` migrator — a sibling of `introduce-expression` — becomes step zero.
> Deferring past the first saved component changes the cost *class*, not the cost.

> ⛔ **§3.3-b — THE NEGATIVE CONTROL.** A fixture whose numbers are unit-ambiguous (`1`, `2`, `10`)
> **cannot falsify a 1000× error** — both readings look plausible and the assertion passes either
> way. Every fixture in this migration must use a value whose millimetre and metre readings differ by
> three orders of magnitude **and are both physically plausible for the quantity**. `2.1 m` / `2100 mm`
> is such a value. `1` is not. *(This is [[corpus-never-jittered-min-over-peers]]'s lesson applied to
> units: a corpus that cannot distinguish the defect is not a corpus.)*

### §3.4 — Quantity kinds: spec §10 demands nine, the engine carries two

Spec §10: *"Units are semantic and typed (length, area, volume, angle, mass, temperature, pressure,
energy, power, …) — never bare `Width = 1200`."*

**AS-IS.** `CanonicalKind = 'length' | 'angle' | 'scalar'` — **two kinds and an escape hatch** — and
`kindOf()` has **zero consumers outside its own unit test**. `Unit = 'mm' | 'm' | 'deg' | 'rad'`.
**There is no units package at all** — the FAILED SEARCHES, quoted so they can be re-run:

```
$ ls -d packages/units packages/quantity packages/measure
ls: cannot access 'packages/units': No such file or directory
ls: cannot access 'packages/quantity': No such file or directory
ls: cannot access 'packages/measure': No such file or directory

$ grep -rn "QuantityKind"   --include=*.ts packages apps plugins src   ->  0
$ grep -rn "assertSameUnit" --include=*.ts packages apps plugins src   ->  0
```

> **§3.4 — MUST.** A quantity kind is a **first-class, closed, named set**, and it is widened in
> **both** the runtime `Unit` type and the persisted schema **in the same change-set** — or the
> family model forks further. ⛔ **This contract does NOT mint the nine-kind vocabulary.** Minting a
> quantity-kind system with no consumer is how nine rival unit vocabularies were acquired in the
> first place (§3.7). **§7 G-1 records it as the gap, with `kindOf()` named as the substrate to
> extend and not to duplicate.**

⭐ **The pattern to copy already exists and it is not in this subsystem.**
`packages/core-app-model/src/quantities/CostModel.ts` performs a real unit-mismatch **refusal**,
reporting that *N rates were quoted in a different unit than the line measures and were refused.*
That is the only place in the repository where a unit mismatch causes a refusal, and it is in the 5D
cost model. **Copy its shape; do not invent a second one.**

### §3.5 — ⛔ **`§UNIT-KIND-ERASURE`** — unit mismatch is AUTHORED, EXPORTED, DOCUMENTED, AND NEVER THROWN

`unit-coercion.ts` promises: *"We DO NOT cross-convert: a `m` literal supplied where an angle
parameter is expected raises `UnitMismatchError`."* Measured 2026-09-01,
`grep -rn "UnitMismatchError"` over the whole tree returns **four hits: the barrel re-export, that
comment, the class declaration, and the name assignment. No `throw` site. No caller.**

**The mechanism, so the fix is not attempted at the wrong layer.** `EvalScope` is
`Readonly<Record<string, number>>`. **The moment a parameter's value enters scope, its unit kind is
erased**, so `walk()` cannot compare kinds *even in principle*. `toCanonical` runs on **literals**
only. Mixed-unit **literals** are handled correctly; mixed-unit **parameters** are not checked at
all, and cannot be.

> **§3.5 — MUST NOT.** Spec §11's unit-mismatch requirement **may not be reported as met** — not in
> a status table, a README, a release note, an AI capability declaration or a C69 register row. It
> is `§AUTHORED-BUT-UNWIRED` in the package that best implements everything else, and C74 §1.1's
> rule binds it: *a component's reported identity must equal its performed work.*

> **§3.5-a — The exit is a typed scope, and it is ONE change.** `EvalScope` becomes
> `{ value: number; kind: CanonicalKind }`. `kindOf()` already exists and already returns the right
> three-member union. **This is the single change that turns spec §10 from aspirational into
> enforced and makes the already-written `UnitMismatchError` throw for the first time.** **§7 G-1.**

### §3.6 — Angles: radians is canonical, `deg` is a first-class literal

ADR-0376 D3 rules on **length** and is silent on angle. **This contract rules it, in the same shape,
so the silence is not later read as licence:** radians is canonical, `deg` converts at the literal,
the authored spelling is provenance. The code already does this and **the D3 migration must not
disturb it** — `toCanonical`'s angle cases are untouched by §3.3.

### §3.7 — Nine rival unit vocabularies exist. This contract mints **no tenth**.

Lane C §3.4 enumerates at least nine independent unit declarations with incompatible vocabularies —
`family-runtime`'s tokenizer, `schemas/family-request/geometry.ts`, two annotation schemas, the
dimension formatter, the takeoff types, the sheet widget payloads, material carbon, and the zoning
fact vocabulary. **None is a quantity-kind system**; they are display and serialisation enums, and
nothing anywhere answers *"is `length + angle` legal?"*.

> **§3.7 — MUST NOT.** No lane in this programme may add a tenth unit enum. The two that are in
> scope — `family-runtime`'s `Unit` and the persisted `FamilyParameterDataTypeSchema` — are widened
> together or not at all (§3.4). **C84 EI-9 non-rivalry is the rule; the count of nine is the
> evidence.**

### §3.8 — ⛔ The rival parameter model, and what §3.1 settles about it

`packages/schemas/src/family-parametric/parameter.ts` declares `ParametricParameterSchema` — a
**second** family parameter model at L0, whose unit enum is eight members (`m · mm · cm · in · ft ·
deg · rad · unitless`), whose canonical base is **metres** (*"engines convert internally to
metres"*), and whose formula field is `constraint?: string` carrying a **relational** expression
(`"depth >= width / 2"`) rather than an assignment.

Its own docstring claims the DSL is *"parsed by `@pryzm/family-runtime` at instance-bake time."*
**It is not.** `resolveParameter` reads only `FamilyParameter.expression`; **nothing anywhere reads
`ParametricParameter.constraint`.**

> **§3.8 — MUST.** ⭐ **§3.1 settles the unit half of the rivalry in `ParametricParameter`'s
> favour** — metres was already its canonical base. It settles **nothing else**: the two remain two
> models, and `constraint` remains a relational language that no parser accepts.
> ⛔ **`ParametricParameter.constraint`'s docstring is FALSE TODAY and may not be cited as evidence
> that a constraint DSL is parsed.** Reconciling the two models is **C111's** decision (it owns what
> a component definition is), taken with this contract's §3.1 already fixed. **§7 G-10, OPEN.**

---

## §4 — THE EXPRESSION ENGINE — WHAT IT GUARANTEES

⛔ **STANDING REVIEW RULE (audit R1).** PRYZM has an expression engine. **No lane may propose a new
one.** This section CONTRACTS `packages/family-runtime/src/expression/` and names its gaps.

### §4.1 — No `eval`, no `Function()`, no string substitution — the invariant

> **§4.1 — MUST NOT.** The expression engine may not use `eval`, `new Function`, a template-string
> substitution, or any host-language execution path. It is a **recursive-descent parser producing a
> closed AST**, walked by a tree-walking evaluator whose only free variable is the injected scope.

**AS-IS: BUILT and satisfied outright.** `walk()`'s only free variable is `EvalScope`; there is no
global access, no I/O, no DOM, no THREE. **Spec §11's *"No unsafe arbitrary string substitution"* is
met.** ⭐ This is the strongest single property the engine has, and it is why the whole subsystem is
reusable as the spec §46–§56 code-authoring substrate rather than a liability.

### §4.2 — The grammar is CLOSED, and is reproduced without paraphrase

```
expr     := compare
compare  := addsub (CMP addsub)?      // single-comparison only
addsub   := muldiv (('+' | '-') muldiv)*
muldiv   := unary  (('*' | '/') unary )*
unary    := '-' unary | call
call     := IDENT '(' args? ')' | primary
args     := expr (',' expr)*
primary  := NUMBER | IDENT | '(' expr ')'
```

`NUMBER = digit+ ('.' digit+)? UNIT?` where `UNIT ∈ {mm, m, deg, rad}`;
`IDENT = [A-Za-z_][A-Za-z0-9_]*`, case-sensitive. The AST is a **six-arm discriminated union**:
`number · ident · neg · arith · cmp · call`.

> **§4.2 — MUST.** The grammar is deliberately tighter than a general expression language and grows
> **only** with a stated requirement. Comparisons evaluate to `1`/`0`, which is what makes `if(...)`
> compose without a boolean type. ⚠ **Note a real limit, so it is disclosed rather than discovered:
> `compare` accepts a SINGLE comparison** — `a < b < c` does not parse. That is deliberate (it is
> the arm where every other language gets it wrong) but it is not written down anywhere else.

⚠ **Two behaviours worth knowing before writing a fixture**, both measured from the tokenizer:
`5x` is a **hard LexError** (*"insert an operator or use a unit"*) rather than an implicit
multiplication; and a **bare unit keyword not adjacent to a number is an IDENT** — a parameter may
legally be named `mm`.

### §4.3 — Cycle detection at edit time, and partial resolution is deliberate

> **§4.3 — MUST.** Circular dependencies are detected by a **Kahn topological sort** over the
> parameter→referenced-identifier graph, at **edit** time, not save time. Every parameter in a cycle
> receives a `cycle` diagnostic naming it, and **every parameter not in a cycle still resolves**, so
> an editor can render useful values mid-edit. The pass is `ok: false`.

⭐ **The cycle detector is also the over-constrained refusal.** Lane C §5.2 establishes that
`equal(A,B)`, `symmetric(A,B,axis)`, `horizontal`, `vertical` and `fixed` are **closed-form
assignments**, expressible today as expressions referencing another parameter — with the topological
sort supplying propagation order and the cycle detector supplying the refusal when they conflict.
**The founder's §64 demo is a `family-runtime` problem, not a `constraint-solver` problem.** ⛔ §6.6
states what that does and does not authorise.

### §4.4 — **`§DIAG-CLOSED-SET`** — the typed diagnostics, MEASURED, and the audit's number is stale by one

> **§4.4 — MUST.** Every failure is a **typed code from a closed set**, carrying `parameterId`
> (nullable) and a human-readable `message`. A bare thrown `Error`, a `console.warn`, a silent
> `null` return or an untyped string is a breach.

Measured 2026-09-01 by enumerating both unions mechanically:

| Union | Members | Codes |
|---|---|---|
| `ResolverDiagnostic['code']` (`types.ts`) | **9** | `cycle · duplicate-name · expression-eval · expression-parse · invalid-default · invalid-name · invalid-override · superseded-default · unknown-identifier` |
| `ExpressionEvalError['code']` (`evaluator.ts`) | **6** | `arity · div-by-zero · non-finite · parse · unknown-function · unknown-identifier` |
| **Total slots** | **15** | |
| **Distinct names** (`unknown-identifier` appears in both) | **14** | |

⛔ **Do not transcribe either number.** The audit and Lane C both say *"14 typed diagnostic codes"* —
that was **14 slots**, measured before ADR-0376 D4's repair added `superseded-default`. It is now
**15 slots / 14 distinct names**, and the coincidence that "14" is still a true number of *something*
is exactly how a stale count survives a review. **Re-run the enumeration:**

```
sed -n "/readonly code:/,/;/p" packages/family-runtime/src/types.ts | grep -oE "'[a-z-]+'" | sort -u
sed -n "/readonly code:/,/;/p" packages/family-runtime/src/expression/evaluator.ts | grep -oE "'[a-z-]+'" | sort -u
```

⭐ **Spec §45's *"structured diagnostics"* requirement is already met at the parameter layer**, and
spec §71–73's `GeometryStatus = Invalid` *"with structured diagnostics"* has its precedent here.

### §4.5 — The function table is FROZEN and has **no registration path**

Twelve built-ins: `min · max · if · sin · cos · tan · sqrt · abs · round · floor · ceil · pow`.
Arity is range-checked at eval against the table as single source of truth; `lookupBuiltin` returns
`null` rather than throwing so the evaluator can produce an `unknown-function` diagnostic with AST
context. The table is an `Object.freeze`d object literal with **no registration API**.

> **§4.5 — MUST.** A user-extensible function table, when it is built, is backed by
> `@pryzm/formula-library`'s catalogue — which already has descriptors, **pinned semver**, arity and
> type validation and three typed errors — and **not** by a second frozen literal or a third
> registry. **§7 G-11.** ⛔ Spec §46–§56's versioning clause (*"code targets a stable Component API
> version"*) makes the pinned-semver half load-bearing, not decorative.

⚠ **Name the engine you mean.** Four expression/formula paths coexist: `@pryzm/family-runtime`
(this one), `@pryzm/expr-eval`, `@pryzm/formula-library` (a catalogue, not a parser) and
`plugins/schedules`' formula evaluator. **A sentence of the form *"PRYZM has a formula engine"* is
ambiguous across four subjects.** Cite the package.

### §4.6 — The scope is `Record<string, number>`, and that is §3.5's root

`EvalScope = Readonly<Record<string, number>>`. Three consequences, stated together because they are
one fact:

1. **Unit kinds are erased at the scope boundary** — §3.5, and it is why the fix is a typed scope.
2. **`string` parameters cannot participate in expressions** — §2.6's arm, correct but narrow.
3. **Spec §11's *"detects invalid types"* is PARTIAL**, and honestly so: expressions are
   type-checked only insofar as the scope is numeric. A `boolean` or `count` parameter is a number
   with a docstring.

---

## §5 — DETERMINISM (spec §46–§56) — AN **INSTANCE** OF C73 §1, NEVER A RIVAL

### §5.1 — The equation

> **§5.1 — MUST.** Parameter resolution is a **pure function**:
>
> ### `resolve(parameters, type, instanceOverrides) → (values, order, diagnostics, ok)`
>
> Given the same triple, it produces the same result — **independent of machine, of wall-clock time,
> of how many times it has already run, and of iteration order over any hash-keyed container.**
> This is **C73 §1.1 applied one layer above geometry**, and C73 §1.2's MUST-NOTs bind unchanged:
> no wall-clock time, no unseeded `Math.random`, no unstable sort, no renderer state.

### §5.2 — What IS deterministic — verified by execution, not by reading

Executed 2026-09-01 (probe output reproduced verbatim):

```
CLAIM 1 — values are order-independent
  r1.values {"OpeningWidth":1.2,"FrameWidth":0.06,"GlassWidth":1.08}
  r2.values {"FrameWidth":0.06,"OpeningWidth":1.2,"GlassWidth":1.08}
  EQUAL(values as SETS): true
```

The same parameter **set** presented in two different array orders resolves to the same values.
⭐ Note the fixture: it is the founder's §64 demo **expressed in metres** — `1.2 − 2 × 0.06 = 1.08` —
so §2.2 and §3.1 are shown holding together rather than separately.

> **§5.2 — MUST.** `values`, `ok`, and the diagnostic **set** are functions of the parameter set
> alone and may not depend on the array order in which parameters are presented.

### §5.3 — What is NOT deterministic, and why neither case is a defect

```
CLAIM 2 — order[] IS input-array-order dependent
  r1.order ["p_ow","p_fw","p_gw"]
  r2.order ["p_fw","p_ow","p_gw"]
  order DIFFERS: true
```

`order[]` is one valid topological order among several, and which one you get depends on the input
array order. **This is not a violation of C73 §1.2's unstable-sort clause** — the tie-break is on
`document.parameters` array order, which is a **stable, persisted, model-derived key**, not hash
iteration. It is recorded because a future consumer that treats `order[]` as canonical (a cache key,
a diff, a golden-file assertion) would be wrong.

> **§5.3 — MUST NOT.** `order[]` may not be used as a cache key, a document hash input, or a
> golden-file assertion. It is a **debugging and rendering aid**. If a canonical order is ever
> needed, it is derived by sorting on a stable model key — not by trusting this array.

**The spans are also non-deterministic and are not inputs to anything.**
`pryzm.family.bake.resolveType` and `pryzm.family.parameter.evaluate` carry `Date.now()` and
`performance.now()`. **§5.5.**

### §5.4 — ⛔ **`§APPROX-BUILTIN`** — FOUR OF THE TWELVE BUILT-INS ARE **IMPLEMENTATION-APPROXIMATED**

**This is the one thing C73 §1.2 does not name, and no lane reported it.**

ECMA-262 specifies `Math.sin`, `Math.cos`, `Math.tan` and `Math.pow` as
**implementation-approximated**: conforming engines may return different last-bit results for the
same input. The other eight built-ins — `min`, `max`, `if`, `sqrt`, `abs`, `round`, `floor`, `ceil`
— are exactly specified (IEEE-754 requires correctly-rounded `sqrt`).

> **§5.4 — MUST.** A determinism claim of the form *"same inputs → bit-identical result"* holds for
> an expression **only if it uses none of `sin`, `cos`, `tan`, `pow`.** An expression using any of
> the four is deterministic **on one engine** and is **not guaranteed bit-identical across engines**
> — which is precisely the browser/Node/bake-worker split this package was built to span
> (*"the editor (browser), the bake-worker (Node), and the AI worker (Node) all import the SAME
> runtime"*).

> **§5.4-a — MUST.** Any cache identity, content hash or cross-machine equality assertion computed
> over a resolved parameter value **states whether the expression used an approximated built-in**,
> or applies a declared rounding to a tolerance owned by **C73 §2.1** — never an epsilon invented at
> the call site (C73 §2.2).

⚠ **Two smaller measured curiosities in the same family, recorded so a byte-identity claim is not
made in ignorance of them:** `Math.round(-0.5)` returns **`-0`** (JavaScript rounds half toward
`+∞`), and `JSON.stringify(-0)` is `"0"` — so a resolved `-0` is **not** round-trip stable under
`Object.is`, though it is under `===`.

⛔ **This clause is a DISCLOSURE, not a prohibition.** The four functions stay. Removing them would
break real trigonometry for no gain; **pretending the guarantee is stronger than it is** is the
failure this contract refuses.

### §5.5 — Observability: two spans, and what they are NOT

`pryzm.family.parameter.evaluate` fires **once per evaluation**, carrying the expression source and
the sorted identifier list; `pryzm.family.bake.resolveType` fires **once per resolution pass** —
not once per parameter — carrying parameter, resolved, diagnostic and error counts. Sinks are
injected (`setFamilyRuntimeSpanSink`); **sink exceptions are swallowed so a bad subscriber cannot
break the producer**. The package pulls no OpenTelemetry dependency, deliberately, so the
bake-worker and AI worker ship without paying for the SDK.

> **§5.5 — MUST NOT.** A span is **telemetry, not state**. Its attributes may not become inputs to
> resolution, cache identity, or a persisted value. P8's span obligation is satisfied here **by
> construction**; that is not a licence to route data through it.

---

## §6 — REFUSALS — spec §75 APPLIED AT THE PARAMETER LAYER

Spec §75: *"If the UI says Sweep it performs a real sweep… if AI says 'the width is now proportional
to the height' a real formula exists."* At the parameter layer that decomposes into six MUST-NOTs.

> **§6.1 — MUST NOT.** A parameter model may not report a formula as applied while resolving the
> parameter from another source. **This is the D4 defect and it is what §2.2 and §2.4 exist to make
> structurally impossible** — the warn diagnostic is the mechanism, not the good intention.

> **§6.2 — MUST NOT.** A migration operator may not describe an effect it does not perform. The
> `introduce-expression` header said *"Replaces a parameter's constant `defaultValue`"* while `apply`
> never touched `defaultValue`. ⛔ **And the test suite could not see it: the only arm asserted that
> the expression was WRITTEN, and never that the default it superseded was REMOVED.** *An assertion
> that checks the addition and not the removal certifies half a migration as a whole one.*

> **§6.3 — MUST NOT.** A capability may not be reported as met on the strength of a class being
> declared and exported. **`UnitMismatchError` is the standing example** (§3.5): authored, exported,
> documented in a header that describes a throw that does not exist. Four axes, zero throw sites.

> **§6.4 — MUST NOT.** A refusal may not be silent. Every failure exits through §4.4's closed
> diagnostic set with a code and a named parameter. A pass that returns `ok: true` while a formula
> did not run is the shape this whole contract was minted to forbid.

> **§6.5 — MUST NOT.** A default may not be substituted for a failed computation (§2.5), and a
> "reasonable" value may not be invented for an unknown (**C62** owns the word for *unknown*; **C75**
> owns the rule that an invented value is worse than a missing one).

> **§6.6 — ⛔ MUST NOT.** Nothing in this contract authorises constraint-solver work. §4.3's
> observation — that `equal`, `symmetric`, `horizontal`, `vertical` and `fixed` are closed-form
> assignments expressible as expressions — reaches **C74 §4.2(b) and stops there.** ⛔ **C74 §4.1 is
> a MUST NOT and it binds this programme:** *"No geometric constraint solver may be built, bound, or
> budgeted on the argument that the product category implies one."* C74 §4.5's standing verdict is
> **UNPROVEN**, backed by an executed enumeration of **20 constraint families — 17 ADVISORY, 1
> ENFORCEMENT, 2 VALIDATION, 0 SOLVING.** A per-family §4.2(a)/(b)/(c) argument in writing is the
> only route, and this contract is not one.

---

## §7 — WHAT IS NOT BUILT — THE GAP REGISTER

### §7.1 — The audit's per-requirement score, carried as the AS-IS

⛔ **Not re-scored by this lane.** This is Lane C §5.1's table, restricted to §9–§12 (this
contract's scope; §13–§15 belong to C74/C81/C111), with the **two cells the ADR-0376 D4 repair
moved** marked. Re-derivation from scratch would produce a second score of one subject — C84 EI-9.

| Spec | Requirement | Status | Where |
|---|---|---|---|
| §8 | Properties vs Parameters not collapsed | **BUILT (elsewhere)** | Drawn exactly, for zoning, in the fact vocabulary. **Not drawn in `FamilyParameter`** — §1.3 |
| §9 | Parameters are first-class objects | **PARTIAL** | §1.1 — 4 of 14 attributes absent |
| §9 | Scopes = Definition/Type/Instance/Derived | **BUILT** | §2.1 — all four value sources exist |
| §9 | Deterministic resolution | **BUILT** | §5.2, executed. ⚠ §5.4 narrows the claim |
| §10 | Units are semantic and typed | **PARTIAL — literals only** | §3.4 — no quantity-kind system |
| §11 | Typed expression engine | **BUILT** | §4.1, §4.2 |
| §11 | Detects circular dependencies | **BUILT** | §4.3, Kahn sort, `cycle` |
| §11 | Detects undefined references | **BUILT** | `unknown-identifier` |
| §11 | Detects **unit mismatch** | **ABSENT** | §3.5 — authored, never thrown |
| §11 | Detects invalid expressions / types | **PARTIAL** | §4.6 — expressions yes; types only insofar as scope is numeric |
| §11 | No unsafe string substitution | **BUILT** | §4.1 — satisfied outright |
| §12 | Parametric after placement | **BUILT in the family model / ABSENT in the product** | `bakeFamilyInstance` honours `instanceOverrides`; **no shipping element uses it** — G-2 |
| §12 | Resolution order | ~~**CONTRADICTED**~~ → **REPAIRED (D4)** | §2.2, §0.4 — *changed by lane U in this working tree* |
| §13 | Progressive parametrisation | ~~**PARTIAL / broken**~~ → **REPAIRED (D4)** | §2.4-a — *`introduce-expression` now clears the default* |

⭐ **Both repaired cells are the same defect from two sides**, which is why they moved together and
why neither was visible alone: the resolver preferred the default, and the migrator never removed
it. **Two green suites, one dead migration.**

### §7.2 — The gap register

| Id | Gap | Status |
|---|---|---|
| **G-1** | ⭐ **No quantity-kind system, and `UnitMismatchError` therefore cannot throw.** The exit is one change — type `EvalScope` with `CanonicalKind` (§3.5-a) — and it is the single highest-value item in this contract | **OPEN** |
| **G-2** | ⭐ **THE JOIN.** The shipping editor's element parameters (`element.updateParameter`) and this parameter model are **disjoint**: no element parameter in the product has a unit type, a formula, a dependency edge or a definition/type/instance scope. Spec §12 is unimplemented for **every element a user can place** | **OPEN — the headline gap; it is the audit's §3.1 and is Phase 4's subject, not this contract's** |
| **G-3** | `FamilyParameterKind` is declared and consulted by nobody (§1.2). Enforce it or delete it | **OPEN — decision deferred to Phase 4, disclosure binding now** |
| **G-4** | No `constraints` field on the parameter (spec §9). Range/domain only — §6.6 binds | **OPEN** |
| **G-5** | No `editable` field (spec §9). Likely derivable rather than new state; **not decided here** | **OPEN** |
| **G-6** | No `provenance` and no `semantic` classification on a parameter. C75 owns the first vocabulary, the classification work owns the second. `supersededDefault` is a one-event exception | **OPEN** |
| **G-7** | ⚠ Whether `rename-parameter` rewrites referencing expression strings was **NOT MEASURED by this lane** (§1.4) | **UNMEASURED — do not assume either answer** |
| **G-8** | `introduce-expression` clears `defaultValue` and **does not clear `document.defaults[id]`** (§2.8). Inert only while nothing reads the second store | **OPEN — new, found by this lane** |
| **G-9** | The authored unit spelling reaches the AST and is **not retained to the document** as provenance (§3.2) | **OPEN** |
| **G-10** | Two rival family parameter models (§3.8). §3.1 settles the **unit** half; `ParametricParameter.constraint`'s "parsed by family-runtime" docstring is **false today** | **OPEN — C111's decision** |
| **G-11** | The function table is frozen with no registration path (§4.5). `formula-library` is the substrate | **OPEN** |
| **G-12** | ⛔ **D3 is a TO-BE: the code says millimetres.** The plan is written, the window is decaying, and the sketch-coordinate blocker is un-measured | **OPEN — §3.3, and it blocks Phase 4A** |
| **G-13** | ⛔ **No gate enforces any clause of this contract.** §8 names the two that must exist | **OPEN** |

---

## §8 — THE GATES — NAMED, AND HONESTLY **UNBUILT**

⛔ **No gate decides C110 today.** Both gates below are **NAMED GAPS, UNBUILT at stamp time**, and
their honest status is **UNPROVEN** — never an inherited green. This is stated in the first person
because C73's front-matter carried the opposite claim for months and *"the first thing a reader sees
still carried the falsehood."*

| # | Gate | Asserts | Status |
|---|---|---|---|
| **§8.1** | `tools/ga-gate/check-canonical-length-unit.ts` — **PLANNED, this contract is its intent** | No file in the component stack declares **millimetres as a storage unit**. The Group-D sketch files are a **named, shrink-only baseline** — the `MAX_RIVALS` treatment, **baselined, not allowlisted**, so the outstanding half is counted and printed on every run | **UNBUILT** |
| **§8.2** | `tools/ga-gate/check-parameter-precedence.ts` — **PLANNED, this contract is its intent** | The `§PARAM-PRECEDENCE` order holds **by execution**, not by reading: it resolves a fixture carrying both a default and an expression and asserts the expression's value, **and** asserts the `superseded-default` warn fires naming the parameter. ⛔ **Its negative control is the reordering**: swapping the two branches in `resolveParameter` must fail it **by name** | **UNBUILT** |

> **§8.3 — MUST.** A gate for this contract asserts a **measured quantity against a known number**.
> *No error thrown* · *the array is non-empty* · *a value was produced* are **not assertions** and
> may not enter this contract's suite (C108 §6.2's rule, adopted verbatim).

> **§8.4 — MUST.** Every reading of a gate is taken in the **FOREGROUND**, redirected to a file,
> with `$?` read immediately. ⚠ **Piping a gate to `tail` returns `tail`'s exit code** — that is how
> one lane in this programme reported RC=0 for a gate sitting at RC=3.

> **§8.5 — MUST NOT.** A ratchet breach is **never** absorbable as debt (`§RATCHET-EXCEEDED-IS-NEVER-DEBT`,
> R7 / L-836): `run-all.ts` sets `anyFailed=true` on exit code 3 **unconditionally**. ⛔ Raising a
> ceiling, or adding a ledger entry to swallow an exit-3, is the one forbidden fix.

---

## §9 — STATUS, EXIT CONDITION AND AMENDMENT RULES

### §9.1 — Status: **CANONICAL — deliberately NOT ACTIVE**

ACTIVE requires the shipping code to demonstrably match. Three things prevent it, each measured:

1. **§3.1 is inverted in the code** — the canonical length unit is millimetres today (§3.3, G-12).
2. **§3.5 is unenforceable as written** — the scope erases unit kinds, so the unit-mismatch clause
   describes a check that cannot run (G-1).
3. **§0.2 — the subject is test-reachable only.** A contract cannot be ACTIVE over a subsystem no
   user has ever reached.

**Exit condition for ACTIVE:** (a) G-12 closed — the D3 migration executed as **one** change-set
with §8.1 merged in the same commit; (b) G-1 closed — the typed scope lands and
`UnitMismatchError` throws, with a test that falsifies it in both directions; (c) §8.2 built and
green with its negative control demonstrated; (d) G-2 has a named owner — **not necessarily
closed**, but the join can no longer be nobody's.

⚠ **Until then this contract states intent, and §0.2 states what has actually been proven.**

### §9.2 — Amendment rules

- The **master spec §8–§15** is the requirement source. **A clause here that contradicts it is the
  defect** — fix this contract, or raise an ADR that supersedes the spec in as many words.
- **ADR-0376 D3 and D4 are RULED.** §2.2's order and §3.1's canonical unit are not re-argued in a
  lane; they are overturned by a superseding ADR that names them, or not at all. **A falsifier is
  written for each in ADR-0376 — use it.**
- **§4.4's diagnostic set and §4.5's function table are CLOSED LISTS.** A new code or a new function
  lands with its clause, or not at all. ⛔ **And it lands with the count re-measured, never
  transcribed** — this contract's own §4.4 records the audit's number going stale inside one day.
- **§3.7 is a hard ceiling.** No lane adds a tenth unit vocabulary.
- **§4.1 (no `eval`) and §6.6 (no solver authorisation) are INVARIANTS.** Relaxing either is a new
  ADR that supersedes this contract explicitly — never a quiet exception inside a function.
- ⛔ **The AS-IS cells marked REPAIRED (D4) describe the WORKING TREE, not `6e15af2f`** (§0.4). A
  reader who finds them false should check `git status` before concluding this contract is wrong.
