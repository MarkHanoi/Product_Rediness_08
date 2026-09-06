# C111 — COMPONENT DEFINITION & THE `.pryzm-family` MODEL

> **Stamp**: 2026-09-01 · **Status**: **CANONICAL — deliberately NOT ACTIVE** (§3 measures why: the
> format has one live surface and it is not the editor; §12.1 states the exit condition).
> **Scope**: the **ComponentDefinition model** and the **`.pryzm-family` v1 container** —
> `packages/file-format/src/family-schema.ts`, `family-types.ts`, `family-pack.ts`,
> `family-unpack.ts`, `family-migrations/**`, plus `@pryzm/family-runtime`, `@pryzm/family-loader`
> and `@pryzm/family-instance` **as consumers of the format** (their internals are their own).
> **Authority chain**: [ADR-0376](../adrs/ADR-0376-universal-component-editor-founding-rulings.md)
> **D3 / D4 / D5** (RULED, binding) → `audit/universal-component-editor/2026-09-01/ARCHITECTURE-AND-CONTRACT-AUDIT.md`
> §0.3 F1, §3.4, §4.2, §4.3, §11.3 R5/R6 → `docs/01-strategy/STR-UNIVERSAL-COMPONENT-EDITOR-MASTER-SPEC.md`
> §6, §7, §8, §21–§25, §37, §75.
> **Supersedes**: **[C05](./C05-PERSISTENCE-AND-FILE-FORMAT.md) §4**'s *description* of this format.
> C05 §4 now states only the envelope and points here; the model is this contract's subject.
> **Boundaries — what this contract does NOT own**: the parameter / unit / expression model
> (**C110**) · connectors (**C112**) · classification & information requirements (**C113**, deferred
> to Phase 6) · element types T1–T4 ([C65 §2](./C65-ELEMENT-TYPE-SYSTEM.md)) · material binding
> ([C100 §2.1](./C100-MASTER-MATERIAL-DATABASE.md)) · the verb register
> ([C69](./C69-API-VERB-REGISTER.md)) · constraint authorisation
> ([C74 §4.2](./C74-CONSTRAINT-HONESTY.md)) · the graph vocabulary
> ([C71](./C71-GRAPH-AND-TOPOLOGY.md)).
> **Structure**: [C84 §6](./C84-ELEMENT-INTEGRITY.md)'s twelve mandatory sections, in order. Every
> cell carries **AS-IS** (measured in this tree, 2026-09-01) and **TO-BE** (normative). *A blank
> reads as "fine"; an unknown cell reads `NOT MEASURED`.*

---

## §0 — WHAT THIS CONTRACT SETTLES BEFORE ANYTHING IS SPECIFIED

### §0.1 — The one sentence

**PRYZM already has the canonical parametric component model; it is `family-schema.ts`; it has been
governed by nothing correct; and nothing in this repository can put one of its products into a
project.** This contract makes the first true, records the second and third as measured findings,
and contracts the **seam** the fourth will occupy — **without designing it here**.

### §0.2 — ⭐ THE D5 EQUIVALENCE, STATED ONCE AND NOWHERE ELSE

**ADR-0376 D5 rules that `Component` is the one canonical vocabulary.** The equivalence is declared
**here, once**, and no other contract, ADR, spec or source file restates it:

> **`FamilyDefinition` ≡ `ComponentDefinition`. `FamilyType` ≡ `ComponentType`.
> `.pryzm-family` ≡ the ComponentDefinition envelope.**

Binding consequences:

1. **`Component` is canonical** — in contract prose, in every NEW symbol, and on every user-facing
   surface.
2. **`family-*` package names, the `Family*` exported symbols, the `fam_` / `typ_` / `par_` / `sol_`
   / `prof_` / `slot_` / `plane_` id prefixes, and the `.pryzm-family` extension are FROZEN LEGACY
   SPELLINGS.** They are wire / identity names under [C69 §1.1](./C69-API-VERB-REGISTER.md) and are
   **not renamed**. A rename is a persistence-breaking change, not a refactor.
3. ⛔ **No NEW symbol may use `Family`.** A new type, verb, store, field, file or gate that spells
   the concept `Family*` is rejected at review on this clause.
4. **This is the `curtainwall.create` treatment** — a registered legacy alias canonicalised to one
   spelling, declared in one place. Restating the equivalence elsewhere re-opens the question
   [C84 EI-9](./C84-ELEMENT-INTEGRITY.md) exists to close.

### §0.3 — ⛔ WHAT THIS CONTRACT REFUSES TO DO (the audit's standing review rule R1)

This contract **describes what exists and names its gaps**. It does **not** introduce a rival
`ComponentDefinitionSchema`, a rival sketch surface, a rival expression engine, a rival refusal
vocabulary or a rival AI tool schema. PRYZM has all five. `family-schema.ts` says so in its own
header — *"the SINGLE source of truth for the on-disk shape; the editor's in-memory store types
narrow it but never widen it"* — and this contract **adopts that sentence as normative** rather than
replacing it.

### §0.4 — NAMING DISCLOSURE: the word "component" is ALREADY PARTLY SPENT

Per [C107 §0.2-a](./C107-ELEMENT-ADAPTIVE-COMPONENT.md)'s naming-disclosure rule, the collisions are
declared before the vocabulary is claimed. Measured 2026-09-01:

| Existing spelling | Where | What it means today | Verdict |
|---|---|---|---|
| `genericComponent` | `packages/ai-host/src/AITypes.ts` and `packages/core-app-model/src/ai/types.ts` — an `AIElement` union member | an AI read-model element category | **KEEP.** A read-model label, not a model type. It may be re-pointed at the real instance when D9 rules; it may not be widened meanwhile. |
| `GenericComponent` | `VGSceneApplicator` (visibility category → `furniture`), `EdgeProjectorService` (drawing layer → `A-FURN`) | a mesh-category token | **KEEP, DECLARED.** Two graphics tables routing an unknown object to furniture. Not a model type. |
| `window.componentInstanceStore` | `packages/ai-host/src/AIReadModel.ts` — `getComponentInstanceStore()` | ⛔ **a store that does not exist.** `grep -rn "componentInstanceStore" --include=*.ts packages apps plugins src` → **exactly one hit: the reader itself.** `getAllGenericComponents()` therefore returns `[]` **always**, and the AI cannot distinguish *"no components"* from *"component reads are unavailable"*. | ⛔ **DEFECT — §11 D-4.** Failure and empty are the same value. |

**The word `component` is reserved by this contract for (a) the model tier and (b) the future element
kind. It may not be spent on a third meaning.**

---

## §1 — IDENTITY (C84 §6 s1)

### §1.1 — The identity spaces — **EIGHT declared, SEVEN prefixed**

AS-IS, from the id constants at the head of `family-schema.ts`:

| Space | Constant | Shape | Identifies |
|---|---|---|---|
| Definition | `FamilyId` | `fam_` + 26 Crockford-base32 | the ComponentDefinition |
| Type | `TypeId` | `typ_` + ULID | a named configuration |
| Parameter | `ParameterId` | `par_` + ULID | a parameter declaration |
| Feature (solid) | `SolidId` | `sol_` + ULID | one solid feature |
| Profile | `ProfileId` | `prof_` + ULID | a sketch profile |
| Material slot | `SlotId` | `slot_` + ULID | a material seat |
| Reference plane | `PlaneId` | `plane_` + ULID | a work plane |
| **(unprefixed)** | `ULID` | 26 chars, **no prefix** | ⛔ **THREE different object kinds** — `ProfileEntity.id`, `ProfileConstraint.id`, `FamilyEvent.id` |

> ⚠ **CORRECTION to a phrase in the audit.** Audit §0.1 reads *"eight **prefixed**-ULID identity
> spaces"*. There are **eight spaces and seven prefixes** — the eighth is the bare `ULID` constant,
> and it is shared. The count is right; the adjective is not, and the adjective is the half that
> matters, because the shared unprefixed space is the one place the scheme is weak (§1.3).

**TO-BE (normative):**

- **§1.1-a** Every identified object in this format carries a **prefixed** id. A new object kind
  mints its prefix in the same commit that adds the kind.
- **§1.1-b** ⛔ **A prefix is a wire identifier** ([C69 §1.1](./C69-API-VERB-REGISTER.md)). Once
  written it is permanent; changing one is governed by [C47](./C47-FILE-FORMAT-VERSIONING.md), not by
  a refactor.
- **§1.1-c** ⛔ **Never use a renderer id, a mesh index or an array position as semantic identity**
  (spec §7). `FamilyDocument.solids` is evaluated *"in document order"*; **document order is not an
  identity** and no consumer may key on it.

### §1.2 — The survival guarantees of spec §7, per axis, with its evidence class

Spec §7 requires ids to survive *recomputation · save/load · undo/redo · AI modification · parameter
changes · type changes*. AS-IS:

| Axis | State | Evidence |
|---|---|---|
| **save / load** | ✅ **PROVEN** | `packFamily` → `unpackFamily` round-trips ids verbatim; `packages/file-format/__tests__/family-round-trip.test.ts` hashes the bytes, re-reads, re-writes and asserts hash equality. ⚠ That suite **never runs in CI** — §3.2. |
| **recomputation** | ✅ **PROVEN** | `bakeFamilyInstance` emits `BakedSolid.solidId` taken from the schema id, never minted. |
| **parameter change** | ✅ **PROVEN** | `rename-parameter` changes `name` and **explicitly does not change `id`**, rewriting bare identifiers inside `lengthExpression` on word boundaries. |
| **type change** | ⚠ **PARTIAL** | `split-type` clones under a **new** id and preserves the source — correct — but stamps a **fabricated checksum** (§2.4). |
| **AI modification** | ⚠ **OFF-BUS** | the only AI verbs touching these objects live in `apps/component-editor/src/ai/toolRegistry.ts` and write an **in-memory rival store**, not this format. §6. |
| **undo / redo** | ⛔ **ABSENT** | this format has no undo. The only editor over it has a closure-undo stack with **no redo at all** (ADR-0376 D1). **Spec §7's undo/redo clause is UNPROVEN for this format and MUST NOT be claimed.** |

**TO-BE:** **§1.2-a** the undo/redo axis is satisfied **only** when the ComponentInstance lives in the
element model and is restored by `performUndoRedo` — i.e. by the §4.3 seam, never by a second stack
inside the format.

### §1.3 — ⛔ THE UNPREFIXED SPACE IS SHARED, AND `entityIds` CANNOT SAY WHAT IT POINTS AT

`ProfileConstraint.entityIds: z.array(ULID)` is typed **identically** to `ProfileConstraint.id` and to
`FamilyEvent.id`. Nothing in the schema, and nothing in any consumer, distinguishes *"this ULID is a
sketch entity"* from *"this ULID is a constraint"* — the type system cannot, and no runtime check
does.

**TO-BE (normative):**

- **§1.3-a** Profile entities, profile constraints and events MUST each acquire their own prefix at
  the next format version (`ent_`, `con_`, `evt_` — spellings reserved here so they are not
  re-litigated).
- **§1.3-b** ⛔ **Until then, a consumer MUST NOT infer an object kind from a bare ULID.** A reference
  that cannot be resolved to a declared entity **fails closed** (spec §20: *"if a reference becomes
  ambiguous: FAIL CLOSED — never silently attach to a different face"*).

### §1.4 — The bus-verb namespace — **THERE IS NONE, AND THAT IS THE HEADLINE GAP**

Measured on four axes, 2026-09-01, each `rc` read immediately and never through a pipe:

```
grep -rnE "type:\s*'(family|component|definition|parameter|constraint|feature)\." \
     --include=*.ts packages/command-registry/src plugins apps/editor/src   -> rc=1 (NO MATCH)
grep -n "family\.\|component\." packages/schemas/src/registry.ts            -> rc=1 (NO MATCH)
grep -cE "^\| `(component|family|definition|feature)\." docs/04-reference/API-VERB-REGISTER.md -> 0
grep -rn "@pryzm/family-loader\|@pryzm/family-instance\|@pryzm/family-runtime" \
     --include=*.ts --include=package.json apps/editor                      -> rc=1 (NO MATCH)
```

**NO BUS VERB PLACES A COMPONENT INTO A PROJECT.** No `component.*` verb is registered, the register
holds zero rows, and `apps/editor` imports none of the three family packages.

**TO-BE — the seam, contracted WITHOUT being designed here:**

- **§1.4-a** ⛔ **The verb namespace is `component.*`, and it is reserved by this clause.** No lane
  may spend it on anything else. (D5: not `family.*`.)
- **§1.4-b** Every `component.*` verb ships with its [C69](./C69-API-VERB-REGISTER.md) register row
  **in the same commit as its handler** — a verb is a wire identifier, written into
  `project_command_log` and replayed in collaboration history, so it is permanent.
- **§1.4-c** Every `component.*` verb ships with a **C16 CA-21 executed read-back from the
  AUTHORITATIVE store**, never from the DTO store its own handler wrote.
- **§1.4-d** ⛔ **This contract does NOT design the placement verb, its payload, or the instance
  record.** That is the *instance-is-an-element* ruling (audit §4.2, **D9, OPEN**) and it needs an
  ADR, because it adds an element family and changes C84's census. **A lane that ships a
  `component.place` handler before that ADR exists is rejected on C84 §6 grounds.**

---

## §2 — STORES: THE ENVELOPE AND ITS AUTHORITY (C84 §6 s2)

### §2.1 — The **real** `.pryzm-family` v1 container

AS-IS — `FAMILY_PATHS` in `packages/file-format/src/family-types.ts`, written by `packFamily`, read
by `unpackFamily`:

| ZIP entry | Required | Content | Schema |
|---|---|---|---|
| `manifest.json` | ✅ | id · name · semver · author · description · `ifcEntity` · `category` · tags · `minPRYZMVersion` · `schemaHash` · timestamps | `FamilyManifestSchema` |
| `document.json` | ✅ | reference planes · parameters · profiles · solids · material slots · **types (≥ 1)** · `defaults` | `FamilyDocumentSchema` |
| `ifc-mapping.json` | ✅ (always written) | the parameter → `(psetName, propertyName)` projection, **sorted by `parameterId`** | `FamilyIfcBindingExport` |
| `event-log.ndjson` | ✅ (may be empty) | one canonical `FamilyEvent` per line, in logical order | `FamilyEventSchema` |
| `signing/schema-hash` | ✅ | `sha256:` + hex over `canonical(document) + canonical(ifc-mapping)` | `Sha256` |
| `signing/signature` | optional | **Ed25519** over the canonical `manifest.json` bytes | — |
| `thumbnail.webp` | optional | opaque bytes | — |
| `icon.svg` | optional | opaque bytes | — |

> ⛔ **THERE IS NO `family-descriptor.json` AND NO `metadata.json.type = 'family'`.**
> `grep -rn "family-descriptor" --include=*.ts --include=*.json --include=*.js packages apps plugins src server`
> → **rc=1, no output.** C05 §4 described both. That is **audit §0.3 F1 / risk R5**, and C05 §4 is
> corrected by the same change-set that mints this contract.

### §2.2 — The authority

**TO-BE (normative), [C84 EI-1](./C84-ELEMENT-INTEGRITY.md) applied to a format:**

- **§2.2-a** `packages/file-format/src/family-schema.ts` is **THE** authority for the on-disk shape.
  In-memory store types **narrow** it and **never widen** it.
- **§2.2-b** ⛔ **A second schema for this document is forbidden** (§76 gate B). The model is extended
  **through `family-migrations/`**, in its own framework, never beside it. Precedent for the cost of
  getting this wrong: this repository deleted a byte-near rival (`StairValidationAuthority`) for
  exactly this reason ([C74 §2.2](./C74-CONSTRAINT-HONESTY.md)).
- **§2.2-c** ⛔ **NO SILENT NARROWING AT ANY HOP** (C84 EI-2). Two live narrowings are named in §5.5
  and are defects, not conveniences.

### §2.3 — Determinism and signing

AS-IS: JSON canonicalised via `canonicalise()` (an RFC 8785 subset); ZIP entries alphabetical with a
frozen mtime (`zip-deterministic.ts`); NDJSON line order equals input order; the `ifc-mapping`
projection sorted by `parameterId` so authoring order cannot leak into the bytes; `schemaHash` stamped
into the manifest **before** the manifest is serialised, so signing the manifest binds the whole
document graph by hash chaining.

**TO-BE:** **§2.3-a** determinism is a **format** property, not a writer property — any second writer
must produce byte-identical output for identical input, and the `family-round-trip` suite is the proof
obligation. **§2.3-b** the signature covers `manifest.json`, and therefore covers `document.json`
**only through `schemaHash`**. A change that breaks that chain — stamping the hash after signing, for
instance — silently unbinds the document and is forbidden.

### §2.4 — ⛔ `§C111-FAKE-TYPE-CHECKSUM` — a field named `sha256:` that is a 32-bit FNV hash

`FamilyType.checksum` is typed `Sha256` (`/^sha256:[0-9a-f]{64}$/`) and documented *"canonical-JSON
sha256 of the values map"*. The only code that computes one is `syncChecksumPlaceholder()` in
`family-migrations/ops/split-type.ts`. **Executed proof** (`phase3/c111-measurements.txt` §M16):

```
value                                     : sha256:86e157e786e157e786e157e786e157e786e157e786e157e7…
passes the Zod `Sha256` regex             : true
64 hex chars are 8 identical 8-char blocks: true
real sha256 of the same input             : 77580609739172d1792c5e0afd9a7363770e7821cdd30efe…
collision within 200,000 trivial inputs   : {"Width":65613} and {"Width":77901} → same digest
```

It is **FNV-1a/32, padded to eight hex chars and repeated eight times**: 32 bits of entropy presented
as 256, colliding on trivial input. A real SHA-256 would not.

Its own comment says *"The real sha256 is recomputed async when the family is packed via
family-pack.ts."* **It is not.** `grep -n "checksum" packages/file-format/src/family-pack.ts` → **no
match**; `packFamily` recomputes only the document-level `schemaHash` and stamps it into the
**manifest**. The placeholder survives into the packed, signed bytes. **Nothing anywhere verifies a
type checksum** — a `checksum` grep across `file-format`, `family-runtime`, `family-loader`,
`family-instance` and `component-editor` returns the declaration, the placeholder, and nothing else.

**TO-BE (normative):**

- **§2.4-a** ⛔ **A field whose name asserts a cryptographic property MUST have it.** `Sha256` means
  SHA-256. This is spec §75 (*do not fake capabilities*) at the format layer.
- **§2.4-b** Either compute the real digest — `packFamily` already has `sha256Hex` and is `async`
  while `split-type` is `sync`, so the recomputation belongs in the pack step, over `document.types`
  — **or delete the field**. A third option (narrowing the type to admit a non-cryptographic digest)
  is acceptable **only with a rename**, because the name is what lies.
- **§2.4-c** Until §2.4-b lands, **no consumer may treat `FamilyType.checksum` as an integrity
  signal**, and the marketplace route MUST NOT be extended to check it.

---

## §3 — CONSUMERS (C84 §6 s3) — four-axis reachability

Reachability is stated on the [C84 §3.5.1](./C84-ELEMENT-INTEGRITY.md) four-axis convention
(import/construction · bus verb · build graph · call). *A claim naming fewer than four axes is not a
claim.*

### §3.1 — The census

| Consumer | axis a · import | axis b · bus verb | axis c · build graph | axis d · call | Verdict |
|---|---|---|---|---|---|
| `unpackFamily` — **`server/familyMarketplaceRoutes.js`** | ✅ imports `@pryzm/file-format` | n/a (HTTP) | ✅ `server.js` mounts `buildFamilyMarketplaceRouter` at `/api/v1/families` | ✅ **`POST /api/v1/families`** (auth + Ed25519 verify) and `GET /api/v1/families/:id/download` | ⭐ **LIVE** |
| `packFamily` — `apps/component-editor/src/marketplace/publishFlow.ts` | ✅ | ✗ (rival bus) | ⛔ `grep -rn "component-editor" .github` → **rc=1** | ✗ no route, no boot | **DARK** |
| `unpackFamily` — `apps/marketplace-web/src/pages/detail.ts` | ✅ | n/a | ⛔ `grep -rn "marketplace-web" .github fly.toml` → **rc=1** | ✗ | **DARK** |
| `loadFamilyFromBytes` — `apps/bake-worker/src/jobs/RebakeFamilyInstanceJob.ts` | ✅ | ✗ | ✅ workspace dep declared | ⛔ `processFamilyInstanceJob` called **from tests only** | **TEST-ONLY** |
| `bakeFamilyInstance` — the same job | ✅ | ✗ | ✅ | ⛔ same | **TEST-ONLY** |
| `packFamily` / `loadFamilyFromBytes` — `apps/bench/src/benches/family-load.bench.ts` | ✅ | ✗ | ✅ | bench only | **BENCH** |
| **`apps/editor`** | ⛔ **rc=1 — imports none of the three family packages** | ⛔ **rc=1** | ✗ | ✗ | ⛔ **ABSENT ON ALL FOUR** |

**The honest characterisation, and it is not "unreachable":**

- **TRANSPORT is LIVE.** An authenticated HTTP client can publish a signed `.pryzm-family` today and
  download it back; `server.js` is the deployed Express BFF.
- **AUTHORING is DARK.** Nothing in any shipped surface writes a `document.json`.
- **PLACEMENT DOES NOT EXIST.** §1.4.
- **THERE IS NO CORPUS.** `find . -name "*.pryzm-family" -not -path "*/node_modules/*"` → **none.**
  ⭐ **That single fact is what makes every repair in §11 cheap, and it stops being true the moment
  the first component is authored and saved.**

⚠ **The live transport leg makes §9.3 more urgent, not less**: the mounted route Zod-validates and
signature-checks, so it will accept and store a document carrying constraints nothing can evaluate.

### §3.2 — ⛔ `§C111-STACK-IS-CI-INVISIBLE` — every workspace in this stack is silently skipped

`npm run test:ci` is `pnpm -r --workspace-concurrency=1 --if-present run test:ci`, and **`--if-present`
silently drops any workspace without a `test:ci` script.** `packages/file-format` declares
`build · clean · test · test:watch · typecheck` — **no `test:ci`**.

Confirmed against an independent source — `scripts/check/test-ci-coverage-baseline.json` lists, on the
silently-skipped roll: **`@pryzm/file-format` · `@pryzm/family-runtime` · `@pryzm/family-loader` ·
`@pryzm/family-instance` · `@pryzm/component-editor` · `@pryzm/test-family-load-into-project` ·
`@pryzm/test-family-marketplace-publish`.** **That is the entire component stack.**

Gate reading, foreground, `$?` read from a redirect (`phase3/gate-testci-coverage.txt`):
`npm run check:testci-coverage` → **RC=1**, *"workspaces 176 · ENFORCED (has test:ci) 40 (22.7%) ·
SILENTLY SKIPPED 122"*. ⚠ **That RC=1 is a PRE-EXISTING failure of that gate, not this stack's** — it
fails on stale baseline entries (`@pryzm/ai-host`, `@pryzm/geometry-curtain-wall`), which is the
ratchet asking to be tightened. Recorded so the next reader does not misattribute it.

**TO-BE:** **§3.2-a** ⛔ **"it is tested" may not be said of this format until `@pryzm/file-format` has
a `test:ci` script and leaves that baseline.** The audit made this finding about
`apps/component-editor`; it is **worse one level down**, because the round-trip, signature and
migration suites are the only assertions the format has.

### §3.3 — What each consumer reads, and where two consumers differ

| Reader | Reads | Ignores |
|---|---|---|
| `unpackFamily` | every entry; Zod-validates manifest + document; optionally re-derives `schemaHash` and verifies the Ed25519 signature | — |
| `family-loader` | manifest · document · events · ifc-mapping; runs a resolver pre-flight against **`document.types[0]` only** | everything else |
| `family-instance` | `document.solids` (in document order) · `document.parameters` · the chosen `FamilyType` | ⛔ `profiles[*].constraints` · `referencePlanes` · `materialSlots` · `lod` · `defaults` |
| `apps/component-editor` | its own in-memory stores | ⛔ **does not read `document.json` at all** — it has no open path |

**§3.3-a (normative):** any two readers disagreeing about the same field is split-brain and goes at
the top of §11. Two exist today — `defaults` (§5.3) and `constraints` (§9.3).

---

## §4 — THE THREE TIERS (spec §6) AND THE PLUGIN ↔ DTO ↔ COMMAND ↔ BUILDER WIRING (C84 §6 s4)

### §4.1 — `ComponentDefinition → ComponentType → ComponentInstance`, never collapsed

| Tier | Spec §6 | AS-IS | Verdict |
|---|---|---|---|
| **ComponentDefinition** | reusable design intent | `FamilyDocument` + `FamilyManifest` — reference planes, parameters, profiles, solids, material slots, defaults | ✅ **EXISTS** |
| **ComponentType** | named configuration | `FamilyType {id, name, values: Record<ParameterId, …>, checksum}`; **`types` carries `.min(1)`** — a document with no type is invalid | ✅ **EXISTS** |
| **ComponentInstance** | occurrence in a project | `InstanceOverrides = Readonly<Record<string, number \| string>>` — **an override bag with no id, no level, no host, no provenance** | ⛔ **NOT AN OBJECT** |

**§4.1-a (normative):** the three tiers are **never collapsed**. A document may not carry instance
state; an instance may not carry definition state.

**§4.1-b (normative):** `types: z.array(...).min(1)` is **load-bearing** — a definition with no type
cannot be placed, so the format refuses to represent one. Do not relax it to `[]` for authoring
convenience; an authoring buffer is not a document.

### §4.2 — The wiring, stated as it is

There is no plugin, no DTO, no command and no builder for this format. **`apps/component-editor` is a
second command bus, a second undo stack (with no redo) and a second composition root** — ADR-0376
**D1** rules RETIRE-and-HARVEST, sequenced behind the `check-single-compose` repair. **This contract
takes no position on D1 beyond recording that its assets are harvested onto the canonical bus, never
bridged.**

### §4.3 — ⭐ THE SEAM, CONTRACTED WITHOUT BEING DESIGNED

The audit §4.2 proposes — and **D9 has not yet ruled** — that the ComponentInstance **is an element**
of kind `component`, carrying `definitionRef + typeId + instanceOverrides`. This contract does not
decide that. It fixes the two boundaries that decision must respect, because both are format
questions:

- **§4.3-a — THE SPLIT OF HALVES IS NORMATIVE, whatever D9 rules.** **Definitions live in the
  content-addressed `.pryzm-family` envelope; instances live in the project snapshot.** One registry
  each, no overlap. A design in which an occurrence exists in both is a §76 gate-B breach.
- **§4.3-b — A DEFINITION REFERENCE IS `(familyId, schemaHash)`, NEVER `familyId` ALONE.** The format
  is content-addressed and a definition must survive decades of instances (spec §37: *"never silently
  destroy historical meaning"*). A bare `familyId` cannot say **which** version an instance was placed
  against, and re-resolving it later silently re-shapes placed geometry.
- **§4.3-c** ⛔ **Neither clause authorises writing a placement verb.** §1.4-d.

---

## §5 — THE FIELD MAP (C84 §6 s5) — **EVERY field: carried / transformed / DROPPED**

Omission is forbidden ([C84 EI-2](./C84-ELEMENT-INTEGRITY.md)). *Carried* = round-trips **and** is
read by at least one consumer. *Inert* = round-trips and **no consumer reads it**.

### §5.1 — `FamilyManifest`

| Field | Status | Note |
|---|---|---|
| `formatVersion` | **carried, and BROKEN** | `z.literal('1.0')` — §8 |
| `id`, `name`, `semver`, `author`, `description`, `tags` | carried | marketplace + telemetry |
| `ifcEntity` (11-member enum) | carried | authoring-time IFC anchor |
| `category` (8-member enum) | carried | ⚠ becomes a **default SemanticClass reference** when C113 lands — **never a rival classification vocabulary** |
| `minPRYZMVersion` | **inert** | no reader compares it |
| `schemaHash` | carried | recomputed and stamped by `packFamily`; verified on demand by `unpackFamily` |
| `createdAt`, `lastModifiedAt` | carried | |

### §5.2 — `FamilyDocument`

| Field | Status | Note |
|---|---|---|
| `formatVersion` | **carried, and BROKEN** | §8 |
| `referencePlanes[]` | **inert** | no consumer resolves a plane; `ReferencePlane.isHost` has **zero readers** |
| `parameters[]` | carried | the one fully-consumed collection — §5.4 |
| `profiles[].entities[]` | carried | `profileToPolygon` walks them |
| `profiles[].constraints[]` | ⛔ **INERT — ZERO writers, ZERO readers** | §9.3 |
| `solids[]` | **partially carried** | 1 of 4 kinds baked — §10.1 |
| `materialSlots[]` | **inert** | `SolidFeature.materialSlotId` round-trips; nothing binds it — §9.2 |
| `types[]` | carried | `.min(1)`; its `checksum` is fake — §2.4 |
| `defaults` | ⛔ **INERT — a SECOND default channel** | §5.3 |

### §5.3 — ⛔ `§C111-TWO-DEFAULT-CHANNELS` — one question, two answers

`FamilyDocument.defaults` is a `Record<string, …>` **maintained by three migration ops** —
`add-parameter` seeds it, `change-parameter-type` converts it, `delete-parameter` removes from it —
and **read by no resolver.** `resolveParameter` takes `ResolverInput = {parameters, type,
instanceOverrides}`; **it never sees the document**, so `document.defaults` cannot reach a resolved
value by any path.

That is [C84 EI-9](./C84-ELEMENT-INTEGRITY.md) — one answer per question — with the dangerous property
that the dead channel is the one the migration framework maintains, so it looks alive.

**TO-BE (normative):** **§5.3-a** `FamilyParameter.defaultValue` is **the sole definition-default
authority**. **§5.3-b** `document.defaults` is hereby **DECLARED DEAD**: it MUST NOT acquire a reader,
and it is removed by the first real format migration (§8.4), with the three ops that maintain it
removed in the same change-set. **§5.3-c** ⛔ **Adding a reader for it is the forbidden fix** — that
mints the second source of truth §76 gate B exists to prevent.

### §5.4 — `FamilyParameter`, and the D4 wire consequence

| Field | Status |
|---|---|
| `id`, `name`, `kind`, `dataType` | carried |
| `defaultValue` | carried — **ranked BELOW `expression`** (ADR-0376 D4) |
| `expression` | carried — **beats `defaultValue`**, loses to a type value and to an instance override |
| `supersededDefault` | carried — **provenance only, never resolved** |
| `ifcMapping` | carried — projected into `ifc-mapping.json` |
| `exposed` | **inert** — no reader |

**§5.4-a (normative) — the ONE format rule D4 imposes, and its reason.** `supersededDefault` is
`.optional()` and **NOT** `.default(null)`. A defaulted key would appear on **every** parameter of
**every** existing document, changing its packed bytes, its `schemaHash` **and its signature**. ⛔ **Do
not "tidy" it to `.default(null)`.** *(The precedence rule itself is
[C110](./C110-PARAMETER-UNIT-AND-EXPRESSION-MODEL.md)'s subject; this clause states only its on-disk
consequence.)*

### §5.5 — Two live narrowings between the schema and its runtime mirror (C84 EI-2)

`@pryzm/family-runtime`'s hand-written mirror of these types is **narrower than the schema in two
places**, and neither narrowing is declared:

| Schema (`family-schema.ts`) | Runtime mirror (`family-runtime/src/types.ts`) | Consequence |
|---|---|---|
| `FamilyType.values: Record<ParameterId, number \| string \| **boolean**>` | `FamilyType.values: Record<string, number \| string>` | a `boolean` type value is representable on disk and **not** in the resolver's type |
| `FamilyType` carries a required `checksum` | the mirror has **no `checksum` field** | the runtime cannot carry it, so it cannot verify it |

**§5.5-a (normative):** a hand-written mirror of a Zod schema is a **second declaration of one shape**.
Either derive it (`z.infer`) or gate it. Until then both narrowings are named defects (§11 D-6), not
conveniences.

---

## §6 — VERBS (C84 §6 s6)

| Verb | Lineage | Stores written | Stores restored on undo | Equal? |
|---|---|---|---|---|
| *(none)* | — | — | — | — |

**The table is empty, and the emptiness is the finding.** ⛔ **Per C84 §6's own authoring rule this
section may not be left blank, and it may not be filled with the rival application's verbs.**
`constraint.addCoincident`, `sketch.addLine`, `parameter.set` and the other nine live on
`apps/component-editor`'s own bus, write its own in-memory stores, and have **no redo**, no validation
gate, no store declaration, no patch pairs, no event record, no CRDT hook and no persistence
(ADR-0316 §4.2.1 — whose permission for every one of those omissions expires by its own terms once
component state is persisted, which is ADR-0376 D1's reasoning).

**§6-a (normative):** the first `component.*` verb is written **after** D9's ADR, **with** its C69
row, **with** a C16 CA-21 executed read-back, and **on the canonical bus**. §1.4.

---

## §7 — UNDO / REDO (C84 §6 s7)

**AS-IS: not applicable — and that is a finding, not an exemption.** The format has no undo model; its
only editor's undo is a closure stack that **pops and discards** rather than redoing.

**TO-BE (normative):**

- **§7-a** ⛔ **This format MUST NOT acquire an undo mechanism.** Undo belongs to the element model and
  `performUndoRedo` ([C03 §4.6 U-5](./C03-SCHEMAS-COMMANDS-AND-STATE.md), one entry point). A second
  stack is what §4.3-a's split exists to avoid.
- **§7-b** ⛔ **`event-log.ndjson` is NOT an undo stack and MUST NOT become one.** It is an append-only
  authoring record. **C03 §4.6 U-12** forbids selective / out-of-order undo for three measured
  reasons; a CAD history tree re-openable at feature 3 is a **different mechanism**, and planning it
  "on the undo stack" is the trap D7 names.
- **§7-c** `FamilyEvent {id, ts, kind, payload: z.unknown()}` — **`kind` is an unconstrained string and
  `payload` is `unknown`**, and no reader validates either. Any consumer that begins interpreting the
  log must first constrain both, in this contract, in the same commit.

---

## §8 — VERSIONING & MIGRATION (C84 §6 s8) — ⛔ THE FRAMEWORK CANNOT MIGRATE

### §8.1 — `formatVersion` is a Zod **literal**, so it is not comparable — D12, and worse

`FamilyManifestSchema.formatVersion` and `FamilyDocumentSchema.formatVersion` are both
`z.literal('1.0')`. **Executed proof** (`phase3/probe-d12-formatversion.txt`):

```
CONTROL — formatVersion "1.0" parses : true
PROBE   — formatVersion "2.0" parses : false
PROBE   — formatVersion "1.1" parses : false
```

**Consequence 1 — there is no ordering.** `'2.0'` is not *a later version*; it is *not a manifest*.
Neither [C47](./C47-FILE-FORMAT-VERSIONING.md) §1.2's `MAJOR/MINOR/PATCH` comparison nor §1.4's
forward-compatibility rule can be evaluated against it. *(C47 is **DRAFT**, and its own §0.0 records
that C05 governs the version field and that **C47 §1.1 / §1.2 / §2 are a PROPOSAL that MUST NOT be
cited to justify changing a shipped field.** This clause governs the `.pryzm-family` field
specifically.)*

**Consequence 2 — a refusal branch that can never fire.** `family-unpack.ts` returns
`unsupported-future-version` when `manifest.formatVersion !== '1.0'`. **`FamilyManifestSchema.safeParse`
runs first and has already rejected it**, returning `manifest-invalid`. The branch is **unreachable for
every input**, and the only test bearing that name exercises the **project** format's `unpack`, not
`unpackFamily`. **A user handed a v2 component file is told their file is malformed, not that their
PRYZM is old.**

### §8.2 — ⛔ `§C111-MIGRATION-EXIT-UNSATISFIABLE` — the eight ops cannot complete a single migration

`MigratorRegistry.register()` **throws** when `from === to`. `migrateFamily()` validates the result
against `FamilyDocumentSchema` on exit, and `validateExit` defaults to **true**. Therefore **every
legal migrator produces a document whose `formatVersion` the exit gate rejects.**

**Executed proof, with a passing control and an isolating falsification control**
(`phase3/probe-migration-framework.txt`):

```
CONTROL   no-op chain (target === source)          -> ok = true,  steps = 0
PROBE 1   identityMigrator('1.0','1.1')            -> ok = false, reason = migrator-threw
          message: exit schema invalid: document.formatVersion: Invalid input: expected "1.0"
PROBE 2   makeRenameParameterMigrator('1.0','1.1') -> ok = false, same message
FALSIFIER same op with { validateExit: false }     -> ok = true,  steps = 1
PROBE 3   register(identityMigrator('1.0','1.0'))  -> REFUSED: "from=to=1.0 would cause an
                                                      infinite loop"
```

The falsification control isolates the cause exactly: **the ops work; the exit gate is unsatisfiable.**
Ask *"can this ever be true?"* before *"why does it fail?"* — it cannot.

### §8.3 — ⚠ THE GREEN TEST IS THE WORKAROUND, NOT THE PROOF

The suite's only end-to-end migration test — *"runs an end-to-end chain that adds + renames + splits a
type, then validates exit schema"* — registers a migrator declared `to: '1.1'` whose `apply` ends:

```ts
return { ...c, document: { ...c.document, formatVersion: '1.0' } };
```

**It passes by writing the OLD version number back into the migrated document.** All eight op
migrators in that file are constructed `('1.0', '1.0')` — a pair the registry would refuse — and are
invoked through `.apply()` directly, never registered. **The suite proves the ops carry data. It proves
nothing about version bumping, and its shape is the workaround for the defect rather than a test of
it.** ⛔ **Do not read the green suite as evidence that migration works.**

### §8.4 — TO-BE (normative)

- **§8.4-a** ⛔ **`formatVersion` MUST become comparable BEFORE version two is minted**, and this is the
  last moment it is free: **there is no `.pryzm-family` corpus** (§3.1), so there is nothing to migrate
  and no `schemaHash` in the world to invalidate.
- **§8.4-b** The comparable form is a **`MAJOR.MINOR` pair parsed from the string**, validated by a
  regex rather than a literal: `MAJOR` mismatch refuses; `MINOR` ahead refuses **with upgrade advice**.
  **A shipped writer keeps writing `'1.0'`** — this widens the reader, it does not change the bytes.
- **§8.4-c** The `unsupported-future-version` branch MUST be reached by a parse that **admits** future
  values, and MUST be covered by a test that feeds **`unpackFamily`** (not `unpack`) a future file.
- **§8.4-d** ⛔ **`validateExit` MUST NOT be defaulted to `false` to make migration "work".** That
  converts an unsatisfiable gate into an absent one, which is strictly worse.
- **§8.4-e** The **first real migration (`1.0 → 1.1`) carries §5.3-b, §1.3-a and §2.4-b together**,
  because each is a byte-changing repair and a corpus-free window is not offered twice.

---

## §9 — VOCABULARIES (C84 §6 s9)

### §9.1 — PARAMETERS vs PROPERTIES (spec §8) — **the format has parameters and NO properties**

Spec §8: a **parameter** controls generation (`FrameWidth = 75 mm`); a **property** describes
(`FrameMaterial = Aluminium`); a derived property is computed (`ClearOpeningWidth = Width −
2 × FrameWidth`).

AS-IS: `FamilyDocument` declares `parameters[]` and **no property collection of any kind**. The
manifest's `description` / `tags` / `category` are catalogue metadata, not properties.

**TO-BE (normative):**

- **§9.1-a** ⛔ **The two are NOT collapsed.** A property MUST NOT be smuggled in as a `string`
  parameter, and a parameter MUST NOT be re-labelled a property to dodge the expression engine.
- **§9.1-b** The Property model is **NOT minted here.** Its template exists (`CeilingPropertiesSchema`)
  and audit §4.3 entity 5 names its two required fixes — drop `.passthrough()` (spec §33 forbids
  uncontrolled text) and give every numeric field a quantity kind. **That is C110's and C113's subject,
  and it is a declared gap here** so no lane invents a third answer.
- **§9.1-c** ⛔ **A derived value is a PARAMETER with an `expression`, never a stored property.**
  Storing `ClearOpeningWidth` as a number is the inversion ADR-0376 D4 overturned, one layer up.

### §9.2 — MATERIALS — the definition names a **slot**, never a material

AS-IS: `MaterialSlot {id, name, defaultCategory: string | null}`; `SolidFeature.materialSlotId`
round-trips. **Nothing binds a slot to a material** — `materialSlots` is inert (§5.2).

**TO-BE:** **§9.2-a** the binding resolves through
[C100 §2.1](./C100-MASTER-MATERIAL-DATABASE.md)'s `materialId` ladder. ⛔ **A sixth material vocabulary
is forbidden** — [C84 EI-8](./C84-ELEMENT-INTEGRITY.md) counts five and warns that `materialName`
carries **physical** semantics, so collapsing it to a hue loses information. **§9.2-b**
`defaultCategory: string` is **uncontrolled text today**; it becomes a C100 category reference at the
same version that binds the slot, or it is removed.

### §9.3 — CONSTRAINTS — 12 persisted · **0 reachable from this format** · a SECOND vocabulary beside them

> ⚠ **CORRECTION to the arithmetic in audit §11.3 R6.** R6 reads *"12 persisted, 5 executable"* and
> derives *"the seven unimplemented kinds"*. **Measured, the unmapped count is 8 — and the deeper
> reading is 12.**

`ProfileConstraintSchema` persists **twelve** kinds: `coincident · parallel · perpendicular ·
horizontal · vertical · tangent · distance · radius · angle · diameter · equalLength ·
distancePointLine`.

`packages/constraint-solver`'s `ConstraintKind` holds **five**, in a **different vocabulary**:
`distance-pp · parallel · perpendicular · coincident-pp · **fixed**`.

| Mapping | Count | Members |
|---|---|---|
| persisted kind with a same-named solver kind | 2 | `parallel`, `perpendicular` |
| persisted kind reachable only through a spelling map **that does not exist** | 2 | `coincident` → `coincident-pp`, `distance` → `distance-pp` |
| **persisted kind with NO solver counterpart at all** | **8** | `horizontal`, `vertical`, `tangent`, `radius`, `angle`, `diameter`, `equalLength`, `distancePointLine` |
| solver kind with **no persisted home** | 1 | `fixed` |

⛔ **And the sharper fact: `ProfileConstraintSchema` has ZERO writers and ZERO readers.**
`grep -rn "ProfileConstraintSchema\|ProfileConstraint\b" --include=*.ts packages apps plugins src` →
**two hits, both its own declaration.** `profileToPolygon.ts` — the one function that turns a profile
into geometry — **mentions no constraint kind at all.** The rival editor's five constraint commands
write the **solver** vocabulary into an in-memory `constraintStore` that never reaches `document.json`.

**So the persisted constraint array is a shape with no producer and no consumer, and the moment a
producer is written, every one of its twelve kinds is unevaluable.**

**TO-BE (normative):**

- **§9.3-a** ⛔ **UNTIL THE [C74 §4.2](./C74-CONSTRAINT-HONESTY.md) (a)/(b)/(c) RECORD IS WRITTEN FOR
  THIS FAMILY, THE EDITOR MUST REFUSE TO AUTHOR A CONSTRAINT IT CANNOT EVALUATE, AND MUST NOT PERSIST
  ONE.** Spec §75: *"if the UI says Constraint Equal it creates a real constraint."* A saved document
  carrying an inert constraint is a lie with a signature on it.
- **§9.3-b** The refusal **names both sides**: the kind requested, and the classification it lacks. A
  refusal is a correct answer; an undocumented one is not.
- **§9.3-c** ⛔ **Building a solver is forbidden, not merely unscheduled** — C74 §4.1: *"No geometric
  constraint solver may be built, bound, or budgeted on the argument that the product category implies
  one."* The route is (a) validation → (b) enforcement → (c) solving, **in writing, per kind**, and
  authorisation attaches **only** to the sub-family that reaches (c).
- **§9.3-d** ⭐ **Answer (a) and (b) first, because most of the list never reaches (c).** `horizontal`,
  `vertical`, `equalLength` and a `distance` against a fixed reference are **closed-form assignments** —
  `Equal(A,B)` is `B := A` — and belong in the **expression engine**, whose topological sort already
  supplies propagation order and whose cycle detector already supplies the over-constrained refusal.
  **Only `tangent` / `radius` / `diameter` on a coupled sketch plainly reach (c).**
- **§9.3-e** ⛔ **The two vocabularies MUST be reconciled in one direction, in writing, before any
  adapter is written.** Two spellings of `coincident` is C84 EI-8; an adapter that silently maps
  between them entrenches both.

### §9.4 — UNITS — the format is unit-blind, and metres is canonical

AS-IS: `FamilyParameterDataType` names a **quantity family** (`length · angle · number · count ·
boolean · string`) and **no unit**. The runtime mirror's header says lengths are **millimetres**;
`profileToPolygon`'s header says profile points are **metres**; `bakeFamilyInstance` converts the
extrude length mm → m and passes the polygon through unconverted.

**TO-BE:** **§9.4-a** per **ADR-0376 D3**, **metres is canonical at every model boundary** of this
format. **§9.4-b** ⚠ **The migration is OWED and NOT DONE** — `phase3/d3-unit-migration.md` records the
verdict *"larger than one coherent change-set"* and its reason: the sketch surface's unit choice is
coupled to the constraint solver's tolerance, and that coupling has never been measured. **§9.4-c** ⛔
**Until §9.4-b lands, no lane may write a producer from a sketch into `profiles[]`** — that is the join
at which a 1000× error stops being latent. **§9.4-d** the quantity-kind system itself is **C110**'s
subject; this clause fixes only the base unit on the wire.

### §9.5 — CATEGORY and IFC ENTITY

`FamilyCategorySchema` (8 members) and `FamilyIfcEntitySchema` (11 members) are **closed enums**.

**§9.5-a** ⛔ **`ifcEntity` is an interoperability MAPPING, never the internal model** (spec §31). The
document is not an `IfcWindow`; it maps to one. **§9.5-b** `category` becomes a **default SemanticClass
reference** when C113 is minted — **not** a rival classification vocabulary, and not a place to add
members instead of classifying. **§9.5-c** the `ifc-mapping.json` projection is **authoring-time**: it
records what a parameter binds to, not an export. Export remains
[C25](./C25-IFC-EXPORT-PRODUCTION.md)'s.

### §9.6 — CURVES — the `spline` entity's TWO spellings, and what a user still cannot draw

> ⛔ **THIS SECTION IS MINTED BECAUSE TWO SOURCE FILES ALREADY CITED IT AND IT DID NOT EXIST.**
> `packages/family-instance/src/profileToPolygon.ts` refused every non-cubic spline with the words
> *"Rational/weighted curves are a declared gap — **see C111 §9.6-d**"*, and
> `packages/geometry-kernel/src/math/cubicBezier.ts` repeated the declaration with the same
> citation. **This contract stopped at §9.5.** A gap declared against a section that does not exist
> is a gap declared against nothing — the same defect shape as `CLAUDE.md`'s enforcement claims
> (L-809/L-812), pointed the other way. Both halves are now real: the maths is
> `packages/geometry-kernel/src/math/nurbsCurve.ts`, and the persisted spelling is below.

**§9.6-a — `data` is a flat record of scalars, so every vector is INDEXED.** `ProfileEntitySchema.data`
is `z.record(string, number|string|boolean|null)`. It cannot hold an array, so a control polygon, a
knot vector and a weight vector are each spelled as numbered keys — the `cp0…cpN` convention that
already existed, extended, **not** a schema change. This is deliberate and load-bearing:
§8.2 above
records that the migration framework cannot complete a single migration, so a curve capability that
needed a `formatVersion` bump would be a capability nobody could ever open an old document with.

**§9.6-b — SPELLING 1, the cubic Bézier chain (v1, unchanged).**

| key | type | meaning |
|---|---|---|
| `degree` | number | ⛔ MUST be `3`. |
| `count` | number | control-point count; MUST be `3k+1`, `k ≥ 1` (4, 7, 10, …) |
| `cp0`…`cpN` | string | ids of sibling `point` entities, IN CURVE ORDER |

**§9.6-c — SPELLING 2, the rational B-spline (NURBS).** Selected by the PRESENCE of `knotCount`.

| key | type | meaning |
|---|---|---|
| `degree` | number | literal integer in `[1, 11]` |
| `count` | number | control-point count; MUST be `≥ degree + 1` |
| `cp0`…`cpN` | string | ids of sibling `point` entities, IN CURVE ORDER |
| `knotCount` | number | MUST equal `count + degree + 1`. ⭐ **Its presence is the discriminator.** |
| `knot0`…`knotM` | number | literal, non-decreasing; interior multiplicity ≤ `degree` |
| `w0`…`wN` | number | **OPTIONAL, ALL-OR-NONE**, every one `> 0` |

⭐ **A document with no `knotCount` reads EXACTLY as it did before**, through the same evaluator, to
the same vertices. The addition is strictly additive: no schema change, no `formatVersion` bump, and
no existing document's packed bytes or `schemaHash` move.

**§9.6-d — WHAT IS EXPRESSIBLE, and the measurement that says so.** ⚠ **This subsection previously
existed only as a citation.** A rational quadratic expresses an EXACT circle, ellipse and conic; a
polynomial curve of any degree cannot. Measured on the baked `BufferGeometryDescriptor.position`
buffer (`packages/family-instance/__tests__/profileNurbs.test.ts`, the 9-point unit circle):

| curve | max \|r − R\| at R = 1 m |
|---|---|
| rational quadratic (weights `1, √2/2, …`) | **3.158e-8** — float32 buffer rounding, not curve error |
| the SAME control points, weights all 1 | **6.066e-2** = `3/(2√2) − 1`, exactly |

The second row is, to every digit, the number
`§4D-CLOSED-FORM-PROFILE` in `packages/family-instance/src/profileToPolygon.ts` already recorded
from an independent probe of the quadratic-Bézier arc sampler — *"max |r − R| = 0.060660 m …
INVARIANT in segments"*. In float64 the same circle measures ~1e-16
(`packages/geometry-kernel/__tests__/nurbsCurve.test.ts`).

**§9.6-e — REFUSALS, each naming what the document does not determine.** Every one carries the code
`'profile-needs-solver'`, which `bakeFamilyInstance` maps to the bake reason `'unsupported-feature'`
— **the code is a value on the wire (C69 §1.1) and is deliberately not renamed.**

1. `degree` absent, or present and ≠ 3, with no `knotCount` → refused, and the message NAMES the
   escape (`add 'knotCount' + 'knot0'…`). ⛔ An absent `degree` gets a DIFFERENT sentence from an
   unsupported one: telling an author whose entity carries no `degree` that *"a degree-undefined
   curve IS expressible"* is an instruction nobody can act on.
2. `knotCount ≠ count + degree + 1`, decreasing knots, an interior knot of multiplicity > `degree`,
   or an empty parameter domain → refused, with the arithmetic stated.
3. A weight ≤ 0 → refused: it puts a **pole inside the curve's own parameter domain**. Clamping it
   to a small positive number would move the curve without saying so.
4. A PARTIAL weight set (`k` of `count`) → refused. Defaulting the missing half would silently pick
   one of two readings — "the author meant 1" or "a write dropped keys" — and bake it.

**§9.6-f — `degree`, `count`, `knot*` and `w*` are LITERAL; coordinates are EXPRESSION-VALUED.** A
control point's `x`/`z` may be an expression over the definition's parameters, which is what makes a
curve REGENERATE from parameters (spec §67). The four literal keys are not, and the reasons differ:
`degree`/`count` fix the entity's TOPOLOGY (and therefore the meaning of every constraint attached
to it); `knot*` fixes its PARAMETERISATION, and a parameter edit that reordered two knots would not
move the curve, it would make it stop being a curve — mid-bake, surfacing as a geometry error rather
than the parameter error it is; `w*` because a weight driven through zero is refusal 3 above,
arriving from a parameter table.

**§9.6-g — ⛔ WHAT IS STILL REFUSED, precisely, so nobody reads §9.6-d as "NURBS support".**

- **PERIODIC / closed curves as a KIND.** A closed curve is authored the way the NURBS book authors
  one — repeat the first `degree` control points at the end. There is no `periodic: true` flag, and
  inventing one would mean inventing the wrap.
- **NURBS SURFACES.** This is a CURVE seam. `SolidFeatureSchema` still bakes `extrude` only
  (§10.1 below).
- **⭐ AUTHORING ONE BY DRAWING.** `apps/component-editor`'s `SketchSpline` carries
  `controlPoints` and NOTHING ELSE — no degree, no knots, no weights — and
  `apps/component-editor/src/sketch/splineGeometry.ts` samples it through `sampleCubicBezierChainXZ`. **So a knotted or weighted
  curve is expressible in the FORMAT and evaluable in the BAKE, and there is no gesture that
  produces one.** It arrives from a document, an importer, or a migration op. That is a real gap and
  it is named here rather than left for a reader to discover from the absence of a button.
- **A CONSTRAINT ON A NURBS BEYOND ITS CONTROL POINTS.** `§9.3`'s ledger is unchanged: control
  points are ordinary sibling `point` entities and enter the solver's variable space for free, so
  `fixed`/`distance`/`coincident` on a control point are real. `point-on-curve` remains absent from
  both vocabularies and is still refused BY NAME at the gesture that asks for it
  (`apps/component-editor/src/sketch/ConstraintToolbar.ts`'s `refusePointOnCurve`).


---

## §10 — GEOMETRY & REPRESENTATIONS (C84 §6 s10)

### §10.1 — Solid features: **four declared, one baked** — and the refusal is CORRECT

`SolidFeatureSchema` is a discriminated union of `extrude · sweep · loft · revolve`.
`bakeFamilyInstance` implements **`extrude`**; the other three return a structured
`unsupported-feature` per solid, the bake completes the supported solids and reports the rest.

⭐ **That refusal is spec §75 already satisfied. Do not "fix" it by substituting an extrude.**

**There is no boolean feature in the schema at all** — so a window definition **cannot express "frame
minus glazing void" as a feature**, even though `produceBoolean` exists and works.

**§10.1-a (normative):** a `boolean` solid-feature kind is added by the same version bump as §8.4-e, or
it is declared absent here — **it is declared absent here, and §11 D-7 owns it.**

### §10.2 — There is **no feature graph**

`FamilyDocument.solids` is a **flat array evaluated in document order**. No dependency edges, no
per-feature provenance, no per-feature validation state, no incremental recomputation.

**§10.2-a** ⛔ **Document order is not a dependency graph** and no consumer may treat it as one
(§1.1-c). **§10.2-b** the feature graph is spec §16's subject and **D7 (OPEN)** governs how it
reconciles with an undo model that forbids selective undo. ⛔ **Do not plan it "on the undo stack"**
(§7-b).

### §10.3 — Representations (spec §21–§22) — one LOD triple, **with no reader**

AS-IS: each solid carries `lod: {coarse, medium, fine}` booleans. Measured, the **only** code that
reads `lod` is `apps/component-editor` — its solid store, its AI tool validator, its solid commands.
**`bakeFamilyInstance`, `family-loader` and the bake-worker read it nowhere**; the bake emits every
solid regardless of LOD.

**§10.3-a (normative):** ⛔ **an LOD flag that no producer honours is a visual-only state** — spec §75.
Either the bake honours it, or the field is declared inert here; **it is declared inert, and §11 D-8
owns it.** **§10.3-b** the `Representation[]` model spec §21 asks for (mesh · plan · elevation ·
section · symbolic · analysis, each `derived | authored`) **does not exist** and is not minted here;
when it is, **derived is the default** and an authored plan symbol is the *override*, never the only
path.

### §10.4 — Nesting (spec §25) — **the format cannot express it**

`FamilyDocument` has **no** child-component field, no transform, no parameter inheritance and no
material inheritance. A definition cannot contain another definition.

**§10.4-a** This is **D6 (OPEN)** and the repository holds **three rival answers** — `parentId` /
`childrenIds` compound parents (proven on pool, balcony, lift) · Stack 2's `composite` primitive kind ·
**nothing** here. ⛔ **Three answers to one question is a C84 EI-9 violation waiting to be minted; a
lane that picks one without an ADR mints it.** **§10.4-b** whatever D6 rules, spec §25's floor binds
this format: **nesting REFERENCES a definition; it never copies mesh geometry.**

### §10.5 — The mesh is a projection

**§10.5-a** `BufferGeometryDescriptor` output is **derived, never authored, and never stored in the
definition**. **§10.5-b** if geometry cannot be generated, the semantic / parametric definition
**survives the failure** and the result carries a structured diagnostic — the existing
`UnsupportedSolid {solidId, kind, reason, message}` shape **is** that diagnostic and is adopted here as
the normative form.

---

## §11 — THE DELTA (C84 §6 s11) — ordered; each item names its invariant and its proof

| # | Item | Invariant | Proof obligation |
|---|---|---|---|
| **D-1** | ⛔ **`§C111-MIGRATION-EXIT-UNSATISFIABLE`** — no migrator can complete a version bump (§8.2) | spec §37 *"never silently destroy historical meaning"* | the probe in `phase3/probe-migration-framework.txt` goes green for `identityMigrator('1.0','1.1')` **with `validateExit` left at its default** |
| **D-2** | ⛔ **`§C111-FAKE-TYPE-CHECKSUM`** — `sha256:` naming a 32-bit FNV hash (§2.4) | spec §75 | a real digest, plus a test that a mutated `values` map changes the checksum **and** that two distinct maps do not collide |
| **D-3** | ⛔ **The persisted constraint array is authorable and unevaluable** (§9.3) | C74 §4.1, spec §75 | the C74 §4.2 (a)/(b)/(c) record exists **before** any writer; until then, a refusal naming both sides |
| **D-4** | ⛔ **`window.componentInstanceStore` does not exist**, so `getAllGenericComponents()` returns `[]` forever (§0.4) | *failure and empty must not be the same value* | the AI read model reports **unavailable**, distinct from **none** |
| **D-5** | ⛔ **`document.defaults` is a second default channel** (§5.3) | C84 EI-9, §76 gate B | the field and its three maintaining ops are removed together |
| **D-6** | **Two undeclared narrowings between the schema and its runtime mirror** (§5.5) | C84 EI-2 | the mirror is derived or gated |
| **D-7** | **No boolean solid feature** — a window cannot express its own void (§10.1) | spec §17–§20 | a `boolean` kind, or this contract's declared absence stands |
| **D-8** | **`lod` has no producer that honours it** (§10.3) | spec §75 | the bake honours it, or it is removed |
| **D-9** | **`referencePlanes`, `materialSlots`, `exposed`, `isHost`, `minPRYZMVersion` are inert** (§5.1, §5.2) | C84 **EI-13** *(an emitter with no consumer is a declared gap)* | each acquires a consumer or is declared — **they are declared here** |
| **D-10** | ⛔ **The whole stack is CI-invisible** (§3.2) | §L-540-CI-GATE | `@pryzm/file-format` gains `test:ci` and leaves `test-ci-coverage-baseline.json` |
| **D-11** | ⛔ **No bus verb places a component into a project** (§1.4) | §76 gate G, spec §12 | D9's ADR, then a `component.*` verb with its C69 row and a C16 CA-21 executed read-back |
| **D-12** | **The bare-ULID space is shared by three object kinds** (§1.3) | spec §7 | `ent_` / `con_` / `evt_` prefixes at the next version |

**D-1, D-2, D-5 and D-12 are byte-changing and MUST land together** (§8.4-e): the corpus-free window
is not offered twice.

---

## §12 — REFUSALS (C84 §6 s12) — what this format deliberately does NOT support

*A refusal is a correct answer. An undocumented one is not.*

| # | Refusal | Why |
|---|---|---|
| **R-1** | **No second `ComponentDefinitionSchema`, ever.** | §0.3 / §2.2-b. The model is `family-schema.ts`, extended through its own migration framework. |
| **R-2** | **No rename of `family-*`, `.pryzm-family` or the id prefixes.** | ADR-0376 D5 / C69 §1.1 — wire identifiers are permanent; a rename mid-programme is the churn C84 warns against. |
| **R-3** | **No undo inside the format, and no reading the event log as one.** | §7-a, §7-b. C03 §4.6 U-12. |
| **R-4** | **No constraint solver, and no constraint kind persisted that nothing can evaluate.** | §9.3-a, §9.3-c. C74 §4.1. |
| **R-5** | **No nesting mechanism chosen here.** | §10.4 — D6 is OPEN and three rival answers exist; picking one without an ADR mints the EI-9 violation. |
| **R-6** | **No `component` element kind declared here.** | §4.3-c — D9 adds an element family and is bound by C84 §6 and an ADR. |
| **R-7** | **No classification model, no IDS requirements, no bSDD binding.** | Deferred to **C113, Phase 6**, deliberately: bSDD has **zero** call sites and IDS does not exist. Minting a contract for a validator that does not exist is how `C103` became UNMINTED-AND-CITED. |
| **R-8** | **No connectors.** | **C112**'s subject — the one true greenfield subsystem in the audit. |
| **R-9** | **No `validateExit: false` default to make migration pass.** | §8.4-d — converting an unsatisfiable gate into an absent one is strictly worse. |
| **R-10** | **No unit conversion added at the profile seam before the sketch unit is decided.** | §9.4-c — the coupling to solver tolerance is unmeasured; a conversion added now is a guess with a 1000× blast radius. |

### §12.1 — Exit condition for **ACTIVE**

This contract becomes **ACTIVE** when **D-1, D-2, D-3, D-10 and D-11** are closed — i.e. when the
format can migrate, its integrity fields mean what they say, it refuses what it cannot evaluate, its
suites run in CI, and **one component can be placed into a project through the canonical bus and read
back from the authoritative store.**

### §12.2 — NOT MEASURED (the honest register, C84 EI-1b)

- The `event-log.ndjson` **semantics** — `kind` is an unconstrained string and no consumer reads the
  log. Whether any producer writes a meaningful `kind` today is **NOT MEASURED**.
- **`thumbnail.webp` / `icon.svg` size and format constraints** — the plan cites 256×256 and 24×24; the
  code enforces neither. Whether any writer respects them is **NOT MEASURED**.
- The marketplace route's **storage** leg — this contract measured that `POST /api/v1/families` is
  mounted and verifies signatures. **What it persists, and whether a published family survives a
  restart, is NOT MEASURED** and belongs to [C07 §4](./C07-PLUGIN-SDK-AND-MARKETPLACE.md).
- Whether `apps/marketplace-web` is served by any deployed surface — it appears in **no** CI or deploy
  config, but this contract did not trace every static-hosting path.

---

## §13 — Provenance of this contract

Every measurement above was taken in this tree on **2026-09-01** and is reproducible from
`audit/universal-component-editor/2026-09-01/phase3/` — `c111-measurements.txt` (the greps, with each
`rc` read immediately and never through a pipe), `probe-d12-formatversion.txt` and
`probe-migration-framework.txt` (executed probes, each with a passing control, and §8.2 with an
explicit falsification control).

⛔ **Cite the §-tag or the symbol, never the line number.** Two contract citations measured during this
programme's archaeology pointed at the wrong code. The rule text is reliable; the line numbers are not.
