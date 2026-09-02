# C113 — ELEMENT: PLACED COMPONENT

> **Stamp**: 2026-09-02 · **Lane**: Phase 4C (THE JOIN) · **Status**: CANONICAL
> **Ratified by**: [ADR-0376](../adrs/ADR-0376-universal-component-editor-founding-rulings.md) **D9**
> (*"YES: mint the `component` element kind. It is the JOIN, not a rival."*)
> **Binds**: [C84](./C84-ELEMENT-INTEGRITY.md) §6's twelve mandatory sections **and §6.2, which was
> written for this family by name** · [C16](./C16-COMMAND-AUTHORING-PROTOCOL.md) (CA-2, CA-3, CA-6,
> CA-14, **CA-21**) · [C69](./C69-API-VERB-REGISTER.md) (wire identifiers) ·
> [C110](./C110-PARAMETER-UNIT-AND-EXPRESSION-MODEL.md) (parameters/units/expressions) ·
> [C111](./C111-COMPONENT-DEFINITION-AND-FAMILY-FORMAT.md) (the definition it references) ·
> [C112](./C112-CONNECTORS.md) · [C47](./C47-SCHEMA-EVOLUTION.md) · [C13](./C13-PROJECT-LIFECYCLE.md)
> **Family**: the PLACED OCCURRENCE of a component definition — one architect's act of putting a
> `.pryzm-family` into a project.

---

## §0 — WHAT THIS IS, AND THE ONE SENTENCE IT DEFENDS

`audit/universal-component-editor/2026-09-01/ARCHITECTURE-AND-CONTRACT-AUDIT.md` §3.1, verbatim,
after eight archaeology lanes and 8,557 lines:

> **There is no bus verb anywhere in this repository that places a component into a project.**

Everything on the definition side was real. `@pryzm/file-format` authors, packs, signs, migrates and
unpacks a `.pryzm-family`; `@pryzm/family-runtime` resolves its parameters and evaluates its
expressions; `@pryzm/family-instance` bakes an extrusion. And none of it could reach a project.

⭐ **The sentence this contract defends:** *a definition an architect authored becomes an element in
her model — with an id, a level, persistence, undo and a place in the World Model — and the twenty
occurrences of it do not become twenty copies of it.*

### §0.1 — THE AS-IS IS **NEW**, AND THAT IS THE MOST IMPORTANT FACT IN THIS DOCUMENT

C84 §6.2a anticipated this and ruled in advance: *"On the day it is written, almost every AS-IS cell
will read `NOT MEASURED` or an honest absence — and that is the correct content, not a reason to
postpone the document."*

It is now slightly better than that. The family exists as of Phase 4C, so most AS-IS cells below
describe **code that landed with this contract**, and the honest cells are the ones about what has
NOT landed: rendering, hosting, nesting, connectors, chat and the definition registry. Each of those
is named in §12 with its owner.

⛔ **§0.1-a — THE THREE STATES MUST NOT BE CONFLATED, AND THIS SUITE HAS AN EXAMPLE OF EACH.**
C107 §0.1 proved a family honestly **UNBUILT** (zero hits on four axes). C110 §0.2 proved a
subsystem **BUILT, TESTED AND UNREACHABLE** (1,118 source lines, 63 passing tests, zero importers in
`apps/editor`). This family is the third state: **BUILT AND REACHED, WITH ITS PIXELS MISSING.** Its
record reaches the authoritative store, survives save→reload and reverts on Ctrl+Z — all executed —
and it draws nothing. Reading any one of those three as another is how this repository produces a
confidently wrong status line.

### §0.2 — THE NAMING DISCLOSURE (C84 §6.2c, inherited from C107 §0.2-a)

*"A family named for a behaviour it does not have is the naming-vs-behaviour defect this repository
logs repeatedly."*

⛔ **This contract does not describe hosting, nesting, connectors, IFC mapping, rendering or AI
authoring as capabilities of this family.** Each is either absent or authored-and-inert, and §12
says which. In particular `Component.hostId` is a field with no reader; C111's live example is
`ifcMapping`, persisted on every parameter and measured to have **no reader in either IFC pipeline**.

---

## §1 — IDENTITY

| | AS-IS (measured 2026-09-02) | TO-BE (normative) |
|---|---|---|
| canonical `elementType` tag | `'component'` — the sole spelling. Declared in `ElementType` and `IdFor` in `packages/schemas/src/types/Id.ts`, branded as `ComponentId`. | unchanged; **§1.1** |
| other spellings in use | **none.** `plugins/family-editor` is a marketplace manifest stub whose docstring claims it *"registers … the Place Family tool"*; it has no store, no handler, and is not in `ALL_PLUGINS`. It is not a second spelling of this family — it is a claim with nothing behind it. | the stub is a D1 harvest/retirement question, not this family's |
| the L0 schema | `Component` in `packages/schemas/src/elements/Component.ts`, via `defineElement('component')`; registered in `SCHEMA_REGISTRY` in the same commit | unchanged |
| id shape | `component_<ULID>`, enforced by `defineElement`'s regex | unchanged |
| bus verb namespace | `component.*` | **§1.2** |

> **§1.1 — MUST.** The canonical vocabulary is **`Component`** (ADR-0376 **D5**). **No NEW symbol may
> use `Family`.** The `fam_` / `typ_` / `par_` id prefixes, the `.pryzm-family` extension and the
> `@pryzm/family-*` package names are **FROZEN LEGACY WIRE SPELLINGS** under C69 §1.1 and are quoted
> by this family, never adopted. C111 §0.2 declares the equivalence
> `FamilyDefinition ≡ ComponentDefinition` **once**; this contract does not restate it.

> **§1.2 — MUST.** The namespace is `component.*`, never `family.*` (C84 §6.2e, inheriting C69 §3.6),
> and **each verb lands with its generated register row in the same commit.** A verb is a wire
> identifier written into `project_command_log` and replayed in collaboration history; renaming one
> is a persistence-breaking change governed by C47.

> **§1.3 — MUST. THE TWO ID SPACES ARE NOT INTERCHANGEABLE.** `component_<ULID>` identifies an
> OCCURRENCE; `fam_<ULID>` identifies the DEFINITION it instantiates. A definition outlives every
> occurrence of it, and an occurrence may be deleted without touching the definition. Code that
> accepts either where one is meant is a defect, not a convenience.

---

## §2 — STORES, AND WHICH ONE IS THE AUTHORITY

C84 §6.2e binds this family to EI-1 by name, *"against a family that starts with two
representations — a document model and an element record."*

| Representation | AS-IS | TO-BE |
|---|---|---|
| **L0 schema** | `Component` (`packages/schemas/src/elements/Component.ts`) | the shape; not a store |
| **plugin DTO store** | `ComponentStore` (`plugins/component/src/store.ts`), `super('component')` | ⭐ **THE AUTHORITY** — §2.1 |
| **legacy geometry twin** | **NONE.** No `window.componentStore` has ever existed. | ⛔ none may be minted — §2.2 |
| **scene `userData`** | **NONE** — nothing renders yet (§10) | 4E's, and it is a PROJECTION, never an authority |
| **kernel producer** | **NONE** for the occurrence; the DEFINITION's solids are `@pryzm/family-instance`'s | unchanged |
| **composed-runtime handle** | `StoresSlot.component`, ADOPTED (never constructed) in `composeRuntime` | unchanged — §2.3 |

> **§2.1 — MUST.** The `component` plugin DTO store is the **one authority** (C84 EI-1). It holds
> occurrences and nothing else.

> **§2.2 — MUST NOT.** No second store for placed components — no legacy twin, no render mirror, no
> `componentInstances` map elsewhere. A second representation must earn it under EI-10, and
> C111 §0.4 already records the cost of not enforcing this: `window.componentInstanceStore` exists
> with **exactly one reference in the tree, its own reader**, so `getAllGenericComponents()` returns
> `[]` forever and a caller cannot tell *none* from *unavailable*.

> **§2.3 — MUST. THE READ CHANNEL IS PART OF THE AUTHORITY, NOT A CONSEQUENCE OF IT.**
> `ProjectSerializer` reads this family as `readPluginStore('component')`, i.e.
> `window.runtime.stores.component`, and `window.runtime` is the `composeRuntime()` handle. A family
> with a store, a writer and a snapshot key but **no `StoresSlot` key** saves nothing and is
> destroyed on every reload — **silently**, because the coverage row still says `persisted`. That is
> L-11530, the balcony, for four days. The key is therefore declared in the same commit as the
> family and is proven by an executed arm, not by a claim (§13).

> **§2.4 — MUST NOT. THE DEFINITION IS NEVER COPIED INTO THE OCCURRENCE.** No parameters, no
> profiles, no solids, no material slots, no resolved values. §6's F-2 property depends on this
> absence and on nothing else.

---

## §3 — CONSUMERS

| Consumer | AS-IS | TO-BE |
|---|---|---|
| **persistence (save)** | ✅ `ProjectSerializer` writes `components`, omit-when-absent (C47) | unchanged |
| **persistence (load)** | ✅ `restoreCompoundFamilies` restores through the composed-store resolver, in the loader's COMMON TAIL | unchanged — §3.1 |
| **undo / redo** | ✅ `composedStoreUndoAdapter('component', …)` in `buildUndoStoreMap()` | a bespoke adapter when 4E gives the family a render seam — §7 |
| **renderer (3-D)** | ⛔ **NOTHING.** No subscriber on the store's dirty channel; no builder. | Phase 4E, ADR-0376 **D10**, descope pre-authorised |
| **plan view (2-D)** | ⛔ **NOTHING** | not scheduled; declared, not implied |
| **IFC export** | ⛔ **NOTHING** | needs the definition's `ifcEntity`; blocked on §12's registry gap |
| **GLB export / bake worker** | ⛔ **NOTHING** | as IFC |
| **schedules (C28)** | ⛔ **NOT MEASURED** | an occurrence is schedulable in principle; nothing has been executed |
| **World Model graph** | ⛔ **NOTHING** — `instantiates` / `specializes` / `dependsOnDefinition` do not exist | Phase 4G, under C71 §2.6's four obligations **in one PR** |
| **chat / AI** | ⛔ **UNDECLARED** — §12.4 | Phase 4H |

> **§3.1 — MUST.** The restore runs **once**, in `ProjectLoader`'s common tail after the
> `if (useImportCommandPath) … else …` join. ⛔ Not inside one branch: `boundaryLine`'s restore sat
> in the branch production does not take, so it never ran at all (L-11528) — saved and never read
> back. ⛔ And not duplicated into a second load path, which is how that happened.

> **§3.2 — MUST NOT.** The restore does **not** re-dispatch `component.place`. That verb REFUSES a
> placement whose `definitionId` is not a `fam_<ULID>` — correct at authoring time and fatal at load
> time, since a re-dispatch would drop a saved occurrence on the floor by validation. An `add` patch
> of the serialized record returns the occurrence the architect placed, which is what C13 asks for.

> **§3.3 — SPLIT-BRAIN CHECK.** Two consumers reading different representations is what C84 §6 puts
> at the top of this section. **There is no split brain here, because there is only one
> representation and eight of the eleven consumers read nothing at all.** That is a coverage gap,
> not a consistency defect, and the two must not be reported as one.

---

## §4 — PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER

| Axis | AS-IS |
|---|---|
| handlers that exist | `PlaceComponentHandler`, `SwapComponentTypeHandler`, `SetComponentInstanceParameterHandler` (`plugins/component/src/handlers/`) |
| registered in production | ✅ via the `component` descriptor in `apps/editor/src/PluginRegistry.ts` (`buildComponentHandlerSet`) |
| reachable from a UI control | ⛔ **NO.** There is no plan-view tool, no palette entry and no property panel for this family. Phase 4F. |
| dead handlers | none |

> **§4.1 — MUST.** The `PluginRegistry` descriptor is **axis 2 of the four-axis reachability check
> and it is the one that throws silently**: with no descriptor the store key is absent and
> `CommandBus.buildContext` throws *"component.place: required store 'component' is missing from
> HandlerContext.stores"* **before any mutation** — registered and undispatchable
> (§FIX-POOL-UNREACHABLE, L-5200, which hid `pool.create` for weeks). The arm that makes this
> unrepeatable is named in §13.

> **§4.2 — DISCLOSURE.** *Registered and dispatchable* is not *reachable by a user.* Until Phase 4F
> the only caller is a test. C107 §0.1 records **fifteen built-but-unreachable surfaces found in one
> session**; this row is written so this family is not the sixteenth found by someone else.

---

## §5 — THE BRIDGE FIELD MAP

Every field of `PlaceComponentPayload`, and what happens to it. Omission is forbidden (C84 EI-2).

| Payload field | Disposition |
|---|---|
| `componentId` | **carried** → `id`. PRE-MINTED by the caller (CA-2 — `execute()` re-runs on redo) |
| `levelId` | **carried** verbatim |
| `definitionId` | **carried**; REFUSED unless `fam_<ULID>` |
| `typeId` | **carried**; REFUSED unless `typ_<ULID>` |
| `definitionVersion` | **carried when sent**, absent stays absent (C79 §2.3). **Provenance only — it pins nothing** |
| `origin` | **carried**, metres (D3) |
| `rotation` | **carried**, radians about +Y |
| `hostId` | **carried, and INERT** — nothing reads it (§12.1) |
| `instanceParameters` | **carried**; every key REFUSED unless `par_<ULID>` |
| `materialId` | **carried when sent** |

⛔ **NOTHING IS DROPPED.** There is no `CommandEventBridge` case for this family, so there is no
bridge to drop a field *in* — the mapping above is payload → record, and it is total. The absence of
the bridge is §10's subject, not this section's.

---

## §6 — VERBS

| Verb | Stores WRITTEN | Stores RESTORED on undo | Equal? |
|---|---|---|---|
| `component.place` | `component` | `component` | ✅ |
| `component.swapType` | `component` | `component` | ✅ |
| `component.setInstanceParameter` | `component` | `component` | ✅ |

**Not present, deliberately:** batch create · delete · move · transform · rotate · dimension change ·
material · colour · level change. Each is a real gap and none is faked; see §12.

> **§6.1 — MUST. `component.swapType` WRITES `typeId` AND NOTHING ELSE.** ⛔ It must never resolve
> the new type's values onto the occurrence. Doing so would (a) store a derived value (C84 §8.i),
> stale the next time the type is edited, and (b) **overwrite the user's instance overrides with type
> values**, which is spec §66's F-2 failure — *"the instance has collapsed into the type"* — and it
> would fail QUIETLY, because the record would look correct.

> **§6.2 — MUST. `component.setInstanceParameter` WRITES ONLY OVERRIDES, NEVER RESOLVED VALUES.** It
> is the TOP rung of ADR-0376 **D4**'s ladder (*instance > type > expression > definition default*).

> **§6.3 — MUST. SETTING AND CLEARING ARE DIFFERENT ACTS AND CARRY DIFFERENT PAYLOAD FIELDS.**
> `value` sets; `clear: true` removes the key. ⛔ A nullable `value` is forbidden: `null` is
> excluded from the record's value union precisely so *cleared* and *set to nothing* cannot become
> the same bytes.

> **§6.4 — MUST. A VERB THAT WOULD CHANGE NOTHING REFUSES.** A swap to the type already worn, a
> clear of an override that does not exist, and a `setInstanceParameter` carrying neither `value` nor
> `clear` are all refusals with a reason (C16 CA-3). A no-op command still mints a ring-buffer entry,
> so the user's next Ctrl+Z would spend itself on an edit that never happened.

> **§6.5 — MUST NOT.** `affectedStores` names `['component']` and only that. It is the UNDO ROUTING
> declaration (CA-6 / §U-B6): naming a store the command does not write makes the declaration untrue,
> and every key named must resolve at `CommandBus.buildContext` or the dispatch throws.

---

## §7 — UNDO / REDO

| Axis | AS-IS |
|---|---|
| `affectedStores` vs measured write set | **equal** — one store, declared, written (EI-7) |
| adapter | `composedStoreUndoAdapter('component', resolveComposedStoreFromWindow)` in `buildUndoStoreMap()` |
| in `UNMAPPED_BUS_STORE_KEYS` | **no** — a key may be in exactly one of the two |
| redo restores or recomputes | **restores** — Immer generates the inverse from the mutation that happened |
| executed proof | ✅ ARM J of the acceptance suite (§13) |

> **§7.1 — MUST. THE ADAPTER RESOLVES LAZILY, ON EVERY APPLY.** The store lives on the composed
> runtime, which does not exist when `buildUndoStoreMap()` runs. A cached reference goes stale on
> every recomposition (project switch, backend swap, device-loss recovery); a permanently-`undefined`
> adapter is a lie (L-980) and a silent `return` is a worse one, so an absent runtime THROWS a named
> error that `applyRingBufferSide` reports as a per-store failure.

> **§7.2 — DISCLOSURE.** The adapter reverts the **authoritative record**. It does not claim a mesh
> disappears; there is no mesh (§10). When 4E adds a render seam, that seam must be re-driven — by a
> **bespoke** adapter, on this file's own precedent, not by widening the generic factory, which
> cannot invent a family's render ordering.

---

## §8 — CASCADES

**AS-IS: there are none.** No cascade is triggered by any of the three verbs, and none is suppressed.

> **§8.1 — DISCLOSURE, because "no cascades" is a claim that ages badly.** The cascades this family
> will acquire are known and named: a definition edit must reach its occurrences (Phase 4G's
> `dependsOnDefinition`), a host move must reach a hosted occurrence (blocked on D11, Phase 6C), and
> a delete must reap nested children (blocked on D6, Phase 8D). Each is absent, not suppressed, and
> **an absent cascade is not the same fact as a cascade undo does not reverse** — C84 §4C's subject
> is the second, and this family has none of the first kind to have the second problem with.

---

## §9 — VOCABULARIES

| Vocabulary | AS-IS |
|---|---|
| material | `materialId`, an opaque optional string. ⛔ **This family mints NO material vocabulary.** C84 EI-8 records **five** already, and C110/C112's lanes both refused a sixth. |
| profile / shape enums | **none** — profiles belong to the DEFINITION (`ProfileSchema`, C111) |
| parameter value kinds | `number | string | boolean` — deliberately IDENTICAL to `FamilyType.values`, so an instance override and a type value are the same kind of thing at two rungs of one ladder |
| enums the pipeline cannot carry | **none measured** — there is no bridge to lose one in |

> **§9.1 — MUST.** `null` is not a member of the parameter value union (see §6.3).

> **§9.2 — MUST. AN OVERRIDE IS KEYED BY PARAMETER ID, NEVER BY DISPLAY NAME.** A name-keyed override
> is silently orphaned by a rename, and `rename-parameter` is a shipped migration op.

---

## §10 — GEOMETRY

| Axis | AS-IS | TO-BE |
|---|---|---|
| Stack A builder | **NONE** | 4E: `*FragmentBuilder` fallback, or the descriptor path |
| Stack B producer | the DEFINITION's, in `@pryzm/family-instance` (`bakeFamilyInstance`); **not reached from an occurrence** | 4D/4E |
| proven to agree | **N/A — there is only one, and nothing calls it from here** | when both exist |
| datum convention | `origin` is the insertion point in WORLD metres; `rotation` about +Y | unchanged |

> **§10.1 — THE HONEST HEADLINE OF THIS SECTION: A PLACED COMPONENT DOES NOT APPEAR IN THE
> VIEWPORT.** It is a record in the model — persisted, undoable, addressable by id — and it draws
> nothing. This is registered as three `UNMIRRORED` rows in `tools/ga-gate/mirror-debt.json`.

> **§10.2 — MUST. THOSE ROWS ARE CLASSIFIED `UNMIRRORED`, NOT `no-render`.** `no-render` claims a
> family reaches no builder BY DESIGN. A component is meant to be seen — that is spec §63's 3-D leg.
> Classifying it as an exemption would be the naming-vs-behaviour defect §0.2 forbids.

> **§10.3 — MUST NOT.** No `CommandEventBridge` case may be added to buy a green while there is no
> subscriber and no builder. Emitting an event nobody consumes is **inventing a consumer** — the
> failure `pluginStoreUndoAdapter.ts` names for `structural` and `dimension`.

> **§10.4 — ADR-0376 D10 IS THE OWNER, AND ITS DESCOPE IS PRE-AUTHORISED.** If `runtime.scene.mount`
> cannot be made to work for one family, the 3-D ships through the `*FragmentBuilder` path and the
> descriptor migration is **DESCOPED, NOT FAKED** (spec §75). *"Not rendered" is an acceptable,
> reportable result"* — so no lane is under pressure to report a rendering path working when it is
> not.

---

## §11 — THE DELTA

Ordered. Each item names its invariant and its proof.

1. **Rendering.** §10. Invariant: an authored element is visible. Proof: a rendered instance, not a
   passing test (ADR-0376 D10). **Owner: Phase 4E.**
2. **The definition registry.** Nothing can answer *"does `fam_…` exist in this project?"*, so no
   handler validates a definition reference beyond its shape, no `typeId` is checked against the
   definition that declares it, no parameter `kind` is checked (a `type` parameter must not be
   overridable per occurrence), and **C110 §3.5-a's `UnitMismatchError` cannot be reached from a
   placement** although Phase 4A made it throwable. Invariant: a reference resolves or is refused by
   name. Proof: an executed refusal naming both sides. **Owner: unassigned — the largest open item.**
3. **World Model registration.** `instantiates` / `specializes` / `dependsOnDefinition`, each with
   C71 §2.6's four obligations — writer AND typed reader AND rebuild disposition AND delete
   behaviour, **in one PR** (writer-first is a defect). **Owner: Phase 4G.**
4. **Chat.** Three verbs are `UNDECLARED` on `check-chat-capability-coverage`. **Owner: Phase 4H**,
   whose row names `component.*` explicitly. §12.4.
5. **A UI control.** **Owner: Phase 4F.**
6. **Delete, move, rotate, level-change, batch place.** Five ordinary verbs this family does not
   have. Invariant: the C84 §6 verb roster. Proof: each with a CA-21 read-back.
7. **Hosting.** §12.1. **Owner: Phase 6C (D11).**
8. **Nesting.** §12.2. **Owner: Phase 8D (D6).**
9. **Connectors.** §12.3. **Owner: Phase 6C.**

---

## §12 — REFUSALS

What this family deliberately does NOT support, and why. *A refusal is a correct answer — an
undocumented one is not.*

> **§12.1 — `hostId` IS INERT, AND IT IS INERT ON PURPOSE.** It records what the placement gesture
> snapped to. It resolves no host surface, cuts no opening and re-seats nothing when the host moves.
> **D11 is OPEN** — *does a new host surface amend C15 or get a sibling mechanism?* — and C15
> §0.1.1's own closing rule says **sibling**. Writing a host resolver here would pre-empt a ruling
> nobody has taken. ⚠ The field is present rather than absent because D9's falsifier names host as
> one of the five properties that make a placed component an element; recording what the user snapped
> to costs nothing and inventing what it means costs correctness.

> **§12.2 — NO NESTING.** D6 is OPEN (spec §25, Phase 8D). `childrenIds` exists only because
> `BaseNodeShape` gives it to every element; this family writes nothing into it, and **a reader must
> not infer sub-component ownership from an empty array every element carries.**

> **§12.3 — NO CONNECTORS.** C112's `Connector[]` lives on the DEFINITION and stores **no pose** by
> ruling (C112 §2.3 — the host's frame is the authority). No connector is resolved, matched or joined
> at placement.

> **§12.4 — CHAT IS UNDECLARED, AND THE NUMBER MOVED IN THE WRONG DIRECTION.**
> `check-chat-capability-coverage` read **UNDECLARED 13 (baseline 0)** at HEAD and reads **17** with
> this family — three verbs plus one bare `component` entry, which is the same extraction artefact
> the ledger already shows for `balcony` and `lift`. ⛔ **This is a red ratchet made worse, and it is
> recorded here rather than absorbed anywhere.** It is not fixable from this lane: the declaration
> surfaces (`ChatCapabilityRegistry`, `CHAT_UNAVAILABLE`) are Phase 4H's exclusive files, and 4H's
> ENTRY condition is *"4C's verbs registered"* — so the plan schedules this delta deliberately. That
> makes it OWED, not acceptable.

> **§12.5 — NO SECOND `ComponentDefinitionSchema`, NO SECOND EXPRESSION ENGINE, NO SECOND REFUSAL
> VOCABULARY.** The audit's standing rule R1. This family adds an OCCURRENCE — the one thing that
> genuinely did not exist — and references C111's definition and C110's resolver rather than
> restating either.

> **§12.6 — NO RESOLVED VALUES, EVER, ANYWHERE IN THE RECORD.** §2.4 and §6.1. This is the refusal
> the whole design rests on.

> **§12.7 — NO SNAPSHOT SCHEMA BUMP.** `components` is additive-optional and omitted when nothing was
> authored (C47), so a project with no placed components produces a snapshot byte-identical to a
> pre-Phase-4C one.

---

## §13 — GATES AND EXECUTED PROOFS

| Claim | Instrument | Reading (2026-09-02) |
|---|---|---|
| the family is accounted for in persistence | `tools/ga-gate/check-snapshot-family-coverage.ts` | **RC=0** · 31 store keys / 31 rows, sets equal both directions |
| the verbs are in the generated register | `tools/ga-gate/check-verb-register.ts` | **RC=0** after regeneration; all three rows **LIVE**, authoritative store `component`, undo `patch-pair → component` |
| the read channel resolves on a REAL `composeRuntime()` | `apps/editor/__tests__/persistedFamiliesReachTheSerializerChannel.test.ts` ARM A (**pre-existing, not authored by this lane**) | **8/8 pass**; it SCANS `readPluginStore('…')` out of the serializer, so the key set is not hand-written |
| ⭐ dispatch → **read back from the AUTHORITATIVE store** (C16 CA-21) | `apps/editor/__tests__/componentJoinThroughComposedRuntime.test.ts` ARMs A–F, J | **10/10 pass** |
| ⭐ **save → reload → still there** | same file, ARM G (+ ARM H, the negative control) | **pass** |
| the render gap is declared, not hidden | `tools/ga-gate/check-mirror-completeness.ts` | **RC=0** with three `UNMIRRORED` rows |
| layer boundaries | `tools/ga-gate/check-layer-boundaries.ts` | **RC=0**, within baselines |
| L0 purity | `tools/ga-gate/check-domain-purity.ts` | **RC=0**, hard-0 |
| spans | `tools/ga-gate/check-otel-spans.ts` | **RC=0** — Zone A 277/277, Zone B at baseline |
| chat coverage | `tools/ga-gate/check-chat-capability-coverage.ts` | ⛔ **RC=3**, UNDECLARED 13 → 17 — §12.4 |

> **§13.1 — MUST. THE ACCEPTANCE SUITE MAY NOT CONSTRUCT A STORE, A `stores` OBJECT OR A BUS.** It
> obtains its runtime through `composeRuntime()` — P1's only legal route — and reads
> `rt.stores.component`. A suite that supplies the thing that can be broken cannot observe it
> breaking; that is how a thorough pool suite stayed green for weeks while `pool.create` was
> undispatchable.

> **§13.2 — THE THREE FALSIFICATIONS EXECUTED BEFORE THIS CONTRACT WAS WRITTEN.** Each was removed,
> the suite was seen RED, and the file was restored byte-identically (sha256 verified):
> removing `StoresSlot.component` → **9 arms RED**, including the pre-existing channel test naming
> `[component]`; disabling the restore leg → **ARM G alone RED**; removing the undo adapter →
> **ARM J alone RED**. A proof that cannot fail is not a proof.

> **§13.3 — WHAT NO GREEN ABOVE ESTABLISHES.** That a component renders · that a click places one ·
> that a `definitionId` names a definition that exists · that a parameter resolves through the
> ladder. Each is §11's work list, with an owner.

---

## §14 — STATUS

**CANONICAL — and, unlike C107, C110, C111 and C112, this family is ACTIVE AT THE MODEL LAYER and
INACTIVE AT THE PRESENTATION LAYER.** The distinction is the whole content of §0.1-a.

**Exit condition** for this contract's own gaps: §11 items 1–4 close, the AS-IS cells in §3 stop
reading NOTHING, and §12.4's UNDECLARED count returns to its 0 baseline.
