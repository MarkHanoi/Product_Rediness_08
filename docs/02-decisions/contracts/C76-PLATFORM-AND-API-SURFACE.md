# C76 — Platform & API Surface

> **Stamp**: 2026-08-19 · **Status**: CANONICAL
> **Scope**: the **platform surface itself** — the public SDK facade, the layer boundary as an *enforced API rule*, the command-handler contract as an API type, versioning and deprecation policy, and the downstream consumers of the model. Owns *what is public, how it is bounded, how it changes, and who may depend on it*.
> **Key principle**: *A facade whose size cannot be counted is not yet curated, and an absence that is not typed is indistinguishable from a defect.*
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Peers with **C03** (owns what a command *is*), **C16** (owns how one is *authored*), **C69** (owns the verb *register*), **C67**/**C68** (own whether the *chat* can reach a verb), **C05**/**C47** (own the file format and its versioning), **C10** (owns the performance targets this contract binds the *measurement honesty* of), **C84** (owns element integrity — §5.3 and §1.4 below defer to its EI rules). Supersedes nothing.
> **Gates**: `tools/ga-gate/check-layer-boundaries.ts` · `tools/ga-gate/check-verb-register.ts` · `tools/ga-gate/check-command-naming.ts` · `tools/ga-gate/check-verb-liveness.ts` · `packages/perf-budgets/__tests__/c10-crosscheck.test.ts`
> **Ledgers**: `tools/ga-gate/gate-debt.json` · `tools/ga-gate/gate-newly-measured.json`
> **Changelog**: 2026-08-19 — created (lane KT1), on the founder's ruling that the platform/API evidence *"belongs in a CONTRACT, with the most up-to-date status, not only in a strategy document."* Evidence gathered for `docs/01-strategy/STR-17-computational-geometry-capability-evidence.md`.

---

## §0 — Why this contract exists

**Nothing owned the platform surface.**

- **C03** owns what a command *is*. **C16** owns how one is *authored*. **C69** owns the verb
  *register*. **C67**/**C68** own whether the chat can reach a verb. **C05**/**C47** own the file
  format and its versioning.
- **No contract owned**: which symbols are public; what stability is promised on them and for how
  long; what the layer boundary *is* as an API rule rather than as a lint preference; what a
  deprecation costs; or which downstream consumers depend on the model and which of them are
  implemented versus scaffolded.

The evidence for every one of those currently lives **only inside gate sources and package
headers** — `check-layer-boundaries.ts`, `plugin-sdk/src/index.ts`, `command-bus/src/types.ts`,
`nft-targets.ts`. That is exactly the condition C69 §0 was minted against, and
`check-verb-register.ts:9-34` already records **four measured drifts** produced by it: `CLAUDE.md`
stating the suite was `C01–C15` against a real `C01–C68`; four mutually inconsistent NFT target
sets; `check-layer-boundaries.ts` carrying **three numbers for two invariants inside itself**; and a
chat-capability count reading 41 in four documents while the gate measured 45.

This is the **C69 pattern, fourth instance** — after verbs (C69), element families (C84, via
COORD-01) and secrets (C77).

> ### §0.1 — MUST. Cite the artefact; never transcribe its numbers.
>
> This is **C64 §2.13** and **C69 §0.1** applied to the platform surface. No section of this
> contract, and no other document, may transcribe as a *standing fact*: the SDK export count, the
> verb count or any per-verb column, the layer-gate baselines, the NFT budget values, or the ledger
> sizes. **Cite the artefact that computes each.**
>
> Where a number appears in this contract it appears **only** in §9 (AS-IS), **carries the exact
> command that produced it and the date it was run**, and is explicitly a *reading*, not a fact.
> A reading in §9 that disagrees with its artefact means §9 is stale — **the artefact wins, always.**
>
> **The authorities, by name:**
>
> | Subject | Authority — read this, not a document |
> |---|---|
> | Layer/facade/coverage baselines | `tools/ga-gate/check-layer-boundaries.ts` (`MAX_VIOLATIONS`, `MAX_UNCLASSIFIED`, `MAX_SDK_BYPASS`, `MAX_RESTRICTED_IMPORTS`) |
> | Verbs, liveness, per-verb columns | `docs/04-reference/API-VERB-REGISTER.md` — **generated** (C69 §0.1) |
> | Performance budgets | `packages/perf-budgets/src/nft-targets.ts`, whose source of truth is C10 §1, cross-checked by a test that parses C10's table and fails on drift |
> | Declared debt | `tools/ga-gate/gate-debt.json` |
> | Gates RED on pre-existing defects | `tools/ga-gate/gate-newly-measured.json` |
> | Public SDK surface | `packages/plugin-sdk/src/index.ts` + its `package.json` `exports` |

---

## §1 — The public surface

> **§1.1 — MUST.** `@pryzm/plugin-sdk` is the **single L5 public facade**. It is the only permitted
> path from an L6/L7 plugin to any L0–L4 contract. This is not advisory: the ESLint rule
> `pryzm/no-direct-pryzm-in-plugins` enforces it at error level
> (`packages/plugin-sdk/src/index.ts:124-128`), and `check-layer-boundaries.ts` counts every bypass
> as a separate, ratcheted number (§2.3).

The facade declares **8 subpath exports** (`.`, `./descriptor`, `./types`, `./lifecycle`, `./hosts`,
`./sandbox`, `./signing`, `./dev`) plus a `pryzm dev` CLI binary, and re-exports a curated subset of
11 upstream packages. Its `publishConfig` **renames it on publish** to `@pryzm/sdk` — the workspace
name and the published name are deliberately different, and both must be understood by anyone
reading a consumer's manifest.

> **§1.2 — MUST.** What the facade exports is **locked for v1.x**. `plugin-sdk/src/index.ts:22-23`,
> verbatim: *"Anything you can import from here is locked for v1.x per ADR-0038 §A. Anything not
> exported here is internal and may move."* Breaking that lock requires **v2.0.0 plus a one-year
> deprecation cycle** (`packages/plugin-sdk/CHANGELOG.md`). Widening the facade is cheap and
> one-way; narrowing it is a major version.

> **§1.3 — MUST.** **A facade curates capability, not just symbols.** The store registry is
> re-exported **without** its `register()` method. `plugin-sdk/src/index.ts:666-693`, verbatim:
>
> > **READ-ONLY BY INTENT.** `register()` is deliberately NOT re-exported … **Plugins ask; they do
> > not fill.**
>
> This sentence is this contract's spine. A facade that re-exports a module wholesale has decided
> nothing; a facade that withholds one method has made a design decision about who is allowed to
> extend the platform. **New facade entries MUST state which capabilities they withhold and why**,
> or state that they withhold none.

### §1.4 — TWO FACADES CLAIM ONE ROLE. This is a defect, and it is open.

⚠ **`@pryzm/protocol` and `@pryzm/plugin-sdk` both claim to be the import boundary.**

- `packages/protocol/src/index.ts:1-6` — *"L1 stores, sync, AI, and plugin authors import from here;
  never directly from `@pryzm/schemas`. **This barrel is what we promise stability on.**"*
- `packages/plugin-sdk/src/index.ts:22-23` — plugins import only from the SDK.
- **And `plugin-sdk` re-exports `@pryzm/schemas` directly** (`index.ts:232`), **bypassing
  `protocol`** — so the package that promises DTO stability is not on the path the plugins actually
  take.

> **§1.4.1 — MUST.** Two artefacts claiming one role is **C84 EI-9** (one answer per question).
> Until this is decided, **no document may describe either package as "the" stability boundary
> without naming the other.** The decision is one of:
>
> | | End state | Consequence |
> |---|---|---|
> | **F-1** | `plugin-sdk` is the sole facade | `@pryzm/protocol`'s header claim is withdrawn; it becomes an internal re-export or is retired |
> | **F-2** | `protocol` is the DTO boundary beneath the SDK | `plugin-sdk:232`'s direct `@pryzm/schemas` wildcard must route through `protocol` |
> | **F-3** | Both stand with disjoint, stated audiences | Each header must name the other and say who uses which |
>
> ⛔ **Until this is decided, neither package's barrel may be narrowed** — a narrowing under an
> undecided ownership question would break consumers of whichever one turns out to be authoritative.

### §1.5 — The surface is not fully countable, and that is a finding

⚠ `plugin-sdk/src/index.ts` contains **wildcard re-exports** (`export * from …`), among them the
whole `@pryzm/schemas` barrel. **A wildcard means the true public surface is larger than any static
count of the file**, and grows silently whenever an upstream barrel grows.

> **§1.5 — SHOULD.** Wildcard re-exports in the facade are **enumerated over time**. A facade whose
> size cannot be counted cannot be diffed, and the v1.x lock in §1.2 is only as strong as the
> ability to detect that it moved. The `k3c-api-surface-diff` audit recorded in the CHANGELOG is the
> right shape; it must cover the wildcards to be complete.
>
> *Exit condition:* every `export *` in the facade is replaced by an enumerated export list, or an
> artefact generates the resolved symbol set so it can be diffed.

---

## §2 — The boundary as an enforced API rule

> **§2.1 — MUST.** The layer rule — *a layer may import from any lower layer, never a higher one* —
> is an **API invariant**, not a style preference, and its authority is
> `tools/ga-gate/check-layer-boundaries.ts`. Where any document and the gate disagree, **the gate
> wins.**

> **§2.2 — MUST.** Package identity is resolved from **workspace manifests**, never from a module
> resolver. The gate builds `Map<package.json name → dirname>` from
> `git ls-files … "packages/*/package.json" "plugins/*/package.json" "apps/*/package.json"`, and
> **imports the layer table from `eslint.config.js` rather than copying it.**
>
> **Why this is normative and not an implementation detail:** the predecessor rule was an ESLint
> `boundaries` rule set to `'error'` with **no `import/resolver` configured**, so `@pryzm/*`
> specifiers — essentially every cross-package import in this repo — could not be resolved and were
> **silently skipped**. pnpm links some `@pryzm/*` packages into a given package and not others, so
> a resolver caught a violation in one place and skipped the identical one next door. The gate's own
> header states the rule this contract adopts: *"A gate that fires unpredictably is worse than one
> that is off, because people trust it."*

> **§2.3 — MUST. Four independent numbers, never one total.** The gate reports, and ratchets,
> **separately**:
>
> 1. **upward imports** between classified packages — the layer rule;
> 2. **L6 plugin imports bypassing the L5 facade** — an *encapsulation* breach;
> 3. **banned third-party imports** outside their allowed homes;
> 4. **UNCLASSIFIED packages** — coverage.
>
> ⛔ **These MUST NOT be merged into a single score.** A plugin importing `renderer-three` goes
> *downward*: it is a facade breach, not a layer violation, and folding it into the layer count
> makes both numbers unreadable. **UNCLASSIFIED is ratcheted as a first-class number** precisely so
> the gate cannot be made green by classifying less.

> **§2.4 — MUST. The three-value exit contract.** `0` = within baselines · `2` = **MISCONFIGURED —
> the gate could not reach its subject** · `3` = ratchet exceeded. **`2` is deliberately not `1`,
> and `3` is deliberately not `1`**, because `1` is the code `gate-debt.json` can absorb.
>
> *"Could not measure"*, *"measured a failure"* and *"measured a regression against a ratchet"* are
> **three different facts and MUST NOT alias.** A gate that returns the same code for "I found a
> problem" and "I could not look" converts an outage into a pass. This generalises §6.

> **§2.5 — MUST NOT.** A ratchet baseline may not be **raised**. A `LEDGERED_`/`MAX_` constant *"is
> a record of how bad the debt was when someone last looked, and it may only ever fall — raising one
> converts a measurement into a permission"* (`gate-debt.json`).

> **§2.6 — MUST.** A contract or strategy document reporting boundary health MUST report **headroom,
> not only totals**. A count at its ceiling and a count converging toward its ceiling are opposite
> engineering situations, and a total hides both. See §9.2 — one of the four numbers currently has
> **zero headroom** while another has fallen ten below its ceiling.

---

## §3 — The command API

> **§3.1 — MUST.** The public command contract is the type
> `CommandHandler<TPayload, TStores>` (`packages/command-bus/src/types.ts:150-193`):
>
> ```ts
> export interface CommandHandler<TPayload, TStores extends AnyStores = AnyStores> {
>   readonly type: string;                        // canonical wire verb, e.g. 'wall.create'
>   readonly aliases?: readonly string[];         // a DEPRECATION, not a synonym
>   readonly affectedStores: readonly (keyof TStores & string)[];
>   canExecute(ctx: HandlerContext<TStores>, cmd: TPayload): ValidationResult;
>   execute(ctx: HandlerContext<TStores>, cmd: TPayload): Promise<HandlerResult> | HandlerResult;
> }
> ```

> **§3.2 — MUST. `affectedStores` is required and is a declaration, not a hint.** The lint rule
> `pryzm/affected-stores-required` hard-fails any handler omitting it. The bus throws synchronously
> if a declared store is absent from the materialised store map — *"no `(window as any)` fallback"*
> (`types.ts:72-75`) — and warns loudly if a handler emits forward patches while declaring no stores,
> because those patches *"are dropped from undo routing (Ctrl+Z will not restore them)"*
> (`CommandBus.ts:474-493`). **An undeclared store is a silent undo defect**, which is why the
> declaration is part of the API type rather than of the handler's internals.

> **§3.3 — MUST. Registration validates at boot, not at dispatch.** `CommandBus.register()`
> (`CommandBus.ts:99-144`) rejects a duplicate type, a non-readonly `affectedStores`, and a handler
> missing either method — each as a throw at wiring time.

> **§3.4 — MUST. Alias collisions are FATAL, never last-write-wins.** Verbatim
> (`CommandBus.ts:124-144`): *"An alias silently shadowing a real command would route a caller to the
> wrong handler and produce patches against the wrong store."* This is the deliberate inverse of
> C69 §1.2's `initBusHandlers` guard, which converts a loud boot error into a silent SHADOWING — and
> C69 §5.2 records that the resulting dead-route family is **not one verb**.

> **§3.5 — MUST. A command type is a WIRE IDENTIFIER, not a label.** It appears in call sites, in
> the CRDT payload, in the persisted `project_command_log`, and in replayed history. *"Renaming one
> is therefore not a refactor, it is a protocol change"* (`types.ts:161-164`) — governed by C47, per
> C69 §1.1. `aliases` exist to make a rename **incremental**, and carry their own obligation (§4.4).

> **§3.6 — MUST. A query verb returns on the report channel, never in `forward`.**
> `HandlerResult.report` exists so a read does not enter the undo stack — *"Ctrl+Z would not 'undo'
> a QUESTION"* (C71 §4.4). Likewise `refusal: CapabilityRefusal` is a first-class return, because
> C80 §1.4: *"a refusal the caller can drop on the floor is an exception, not a refusal."*

### §3.7 — NOT FOUND is a finding

Two absences are recorded here **because an absence stated is worth more than an absence implied**,
and because a future reader would otherwise assume the opposite:

- **There is no middleware / interceptor pipeline.** `grep -ni "middleware|interceptor|beforeExecute|afterExecute" packages/command-bus/src/`
  → **zero matches** (2026-08-19). Extension is by **named injection points only**
  (`setCrdtApplier`, and the constructor's `emitter` / `undoStack` / `ringBuffer` /
  `storesProvider` / `audit`). A PR proposing cross-cutting command behaviour must either use a
  named seam or amend this section — **it may not introduce an implicit chain.**
- **There is no `VERB_ALLOWLIST` / `VERB_REGISTRY` constant.** The register is **generated and
  diffed bidirectionally** by `check-verb-register.ts` (C69). A hand-written allowlist would be the
  artefact C69 §0 exists to refuse.

---

## §4 — Versioning, deprecation and developer experience

> **§4.1 — MUST. A published API spec is byte-pinned.** `packages/api-spec/openapi.yaml` is
> OpenAPI 3.1 and its **byte-stable SHA-256 is asserted in a test**, so an auto-formatter rewrite
> fails CI and a schema change cannot land without an ADR. A spec that any tool may reformat is not
> a contract.

> **§4.2 — MUST. Format migrations are append-only and single-step.** Two invariants, stated at
> `packages/file-format/src/migrations/index.ts:5-14`:
>
> 1. *"once a `MigrationStep` has shipped in a release, it is NEVER removed"* — removing one breaks
>    the upgrade path for any project that skipped intermediate versions;
> 2. each step's `toVersion` **MUST equal** `fromVersion + 1` — multi-version jumps are expressed as
>    a sequence, never as one step.

> **§4.3 — MUST. Version strings are validated, not conventional.** Family versions are checked
> against a semver regex at the schema boundary (`family-schema.ts:24,64`) and emitted as an
> OpenTelemetry attribute (`family.semver`) at four sites, so a version is observable at runtime and
> not merely declared.

> **§4.4 — MUST. An alias is a DEPRECATION, not a synonym.** Verbatim (`types.ts:175-177`):
> *"Every alias needs a plan to remove it."* An alias added without a recorded removal plan is a
> permanent second name for one verb, which is §1.4's defect shape at the command layer.

> **§4.5 — MUST. Breaking the facade costs a major version and a year.** Per §1.2. The v1.0.0
> release recorded three pre-publish audit gates, including an **API surface diff** reporting zero
> breaking changes against the locked symbol set — that diff, extended per §1.5, is the mechanism
> that makes §1.2 checkable rather than aspirational.

> **§4.6 — MUST. A performance budget may only be asserted by a bench that measures its subject.**
> `packages/perf-budgets/src/nft-targets.ts` reproduces C10 §1 verbatim, and
> `__tests__/c10-crosscheck.test.ts` **parses C10's markdown table at test time and fails if any
> cell drifts** — the anti-transcription rule of §0.1, implemented.
>
> `nftLimit()` **throws** rather than hand a contract budget to a proxy measurement. The rule,
> verbatim: *"A green bench that measures something adjacent is worse than no bench: it manufactures
> false confidence."*
>
> ⛔ **A target that cannot yet be measured MUST carry a `blockedBy` and a `measuresInsteadToday`
> disclosure.** It may not be silently downgraded, and it may not be asserted against a proxy. See
> §9.4 for the current, uncomfortable reading — which stays at full strength.

---

## §5 — Downstream consumers of the model

> **§5.1 — MUST.** The authoritative model is the single source for 3-D geometry, 2-D drawings
> (projection + hidden-line removal), schedules, and every export. An exporter **MUST NOT** carry a
> second geometry derivation; where one exists it is a C84 §3.5 duplication and must be recorded.

> **§5.2 — MUST. An interop capability is stated at the granularity where it is true.** An engine
> implementation and a plugin shell are **different verdicts** and may not be reported as one. Two
> readings that a future document would otherwise get wrong, and which MUST survive verbatim:
>
> - **DXF: the engine is IMPLEMENTED; the plugin is a DECLARED SHELL.** The parser, importer,
>   exporter and hatch library are real under `packages/file-format/`; `plugins/dxf/src/index.ts` is
>   66 lines that say *"empty workspace-package shell"* in its first comment. The same split holds
>   for PDF (`packages/pdf-export/` real, `plugins/export-pdf/` a shell).
> - ⛔ **`packages/pdf-to-bim` is a REVIEW QUEUE, NOT A CONVERTER.** It contains a confidence model
>   and a human-review feeder. **There is no PDF parsing and no geometry extraction in it.** Do not
>   describe it as a PDF→BIM converter.

> **§5.3 — MUST. Rhino has two independent import paths and this is a recorded duplication risk.**
> `plugins/rhino-import/src/reader.ts` binds the McNeel `rhino3dm` WASM directly;
> `packages/file-format/src/import/rhino/RhinoImporter.ts` binds three.js's `Rhino3dmLoader`. **They
> share no code.** Under C84 §3.5 this is two answers to one question: neither may be deleted
> without deciding which is canonical, and any fix to one must state whether the other needs it.

> **§5.4 — MUST NOT.** A performance claim about an interop path may not be inherited from the
> existence of its implementation. The IFC import and export budgets are **not measured** (§9.4);
> the code is implemented and the throughput is not established, and both halves must be said
> together.

---

## §6 — THE CROSS-CUTTING DOCTRINE: absence is typed, named and counted

This section is normative and binds every future addition to this platform. It generalises a pattern
that already runs through the codebase but had never been written down as a rule.

> **§6.1 — MUST. A new absence in this platform is TYPED, NAMED and COUNTED. It is never silent.**
>
> An unimplemented path, an unmeasured target, an unclassified package or an unknown value MUST be
> representable as a distinct value that a caller can branch on and a gate can count. It MUST NOT be
> expressed as an empty array, `null`, `0`, a default, or a blank cell.

The five existing instances, each of which is the pattern rather than an example of it:

| Mechanism | Where | What it prevents |
|---|---|---|
| **Typed stub error** | `MigrationStubError` carries `code: 'migration-stub'` | A caller cannot confuse "this migration is not written" with a generic failure |
| **Named absence record** | Each of the shell plugins exports a `*_PROVENANCE_MAPPING` absence record | An unwired plugin still declares what it owes, so the gap is greppable |
| **UNKNOWN, never blank** | The generated verb register — *"an empty cell would read as 'fine' and mean 'nobody looked'"* | An unexamined verb reading as a healthy one |
| **Throw rather than proxy** | `nftLimit()` throws rather than lend a contract budget to a bench measuring something adjacent | A green bench manufacturing false confidence |
| **Coverage as a ratchet** | UNCLASSIFIED is a first-class ratcheted number | A gate made green by measuring less |
| **Non-aliasing exit codes** | `2` could-not-measure · `1` measured-a-failure · `3` ratchet-exceeded | An outage reported as a pass |

> **§6.2 — MUST NOT.** A default value may not stand in for an unknown one where the default is a
> *valid* member of the domain. This is the failure C75 §0 records at `roomSnapshotUtils.ts:156`,
> where a missing detection method loaded as `'auto-topology'` — the most authoritative origin
> available — and it is the same failure as a blank register cell reading as healthy.

> **§6.3 — MUST.** A gate landing RED on defects that **predate it** goes in
> `gate-newly-measured.json`, not `gate-debt.json`. The rationale is that both of the other labels
> are wrong in opposite directions: calling it a regression blames the gate's author, and absorbing
> it as declared debt **backdates a founder decision that was never made**. Each entry carries
> `firstReading`, `pinnedTo`, `predatesTheGate` and `exitCondition`; `run-all.ts` refuses an entry
> present in both files.

> **§6.4 — MUST.** A gate that starts **passing** while listed in `gate-debt.json` is **also a
> failure**, and its line is removed in the same commit. Debt that has been paid but is still
> declared is a false statement about the platform's health.

---

## §7 — TO-BE (the invariants a future PR is measured against)

1. **A new public symbol** in `plugin-sdk` states what it withholds, or states that it withholds
   nothing (§1.3).
2. **§1.4 is decided** — F-1, F-2 or F-3 — and the losing barrel's header claim is withdrawn in the
   same commit.
3. **The facade's wildcard re-exports are enumerated or resolved into a diffable artefact** (§1.5),
   so the v1.x lock is checkable.
4. **No PR merges that raises a ratchet baseline** (§2.5); a genuinely-accepted regression is an
   explicit, argued change with the measurement beside it.
5. **A new command handler declares `affectedStores` naming the store actually written** (§3.2,
   C16 CA-DOCTRINE-A), and any alias it adds carries a removal plan (§4.4).
6. **A new bus verb regenerates the register in the same change** (C69 §3.3).
7. **A new interop path is reported at the granularity where its verdict is true** (§5.2), and any
   second derivation of an existing question is recorded under C84 §3.5 (§5.3).
8. **A new performance target ships with a bench that measures its subject, or with a `blockedBy`
   and a `measuresInsteadToday`** (§4.6).
9. **A new absence is typed, named and counted** (§6.1).

---

## §8 — NOT MEASURED (the honest register)

Stated in this suite's house style: these are things this contract **cannot** tell you, listed so
nobody reads its silence as assurance.

| # | Not measured | Why it matters |
|---|---|---|
| **N1** | **Whether the facade's *resolved* symbol set has changed.** The wildcard re-exports (§1.5) mean the v1.x lock is asserted over a set nothing enumerates. | The strongest promise in §1 is the least checkable one. |
| **N2** | **Whether a public symbol is actually consumed.** The SDK barrel is not liveness-checked the way verbs are (`check-verb-liveness.ts`). A symbol locked for v1.x that nothing imports carries the deprecation cost with none of the benefit. | Facade width is measured; facade *usefulness* is not. |
| **N3** | **Whether the layer table itself is right.** The gate enforces the table it imports; it cannot say the table encodes the correct architecture. Two orderings in it were corrected by measured edge direction only after they had minted ~180 false violations. | A precise gate over a wrong table is confidently wrong. |
| **N4** | **Whether a handler registered in the register is reachable by a user.** C69 §6.1 already states this: discovery is static, so a handler authored but never added to a handler set counts as registered, and liveness answers *"does this reach an execution authority"*, not *"does it compute the right value."* | §5.4's rule stated at the command layer. |
| **N5** | **Whether the deprecation policy has ever been exercised.** §1.2 promises v2.0.0 + one year. There has been no v2. The policy is **declared and untested**. | An untested policy is a plan, not a guarantee. |
| **N6** | **Whether `@pryzm/protocol`'s stability promise has any enforcement.** No gate diffs its barrel. | §1.4 is a live ambiguity with no instrument. |
| **N7** | **13 packages have no layer at all** and the gate says so — it *"cannot judge any import to or from them."* Most are backend packages consumed only by API apps. **Open question, unowned: does the 8-layer model extend to the backend, or does the backend need its own?** | A coverage hole that is counted but not closed. |
| **N8** | **Interop throughput.** IFC import/export budgets are `not-yet-measurable` (§9.4). | Implemented ≠ fast enough. |

---

## §9 — AS-IS (readings, not facts)

⛔ **Every number below is a READING taken on 2026-08-19 with the command shown, on branch `main`.**
Per §0.1 these are **not standing facts**. If a reading here disagrees with its artefact, **the
artefact is right and this section is stale.** Do not cite §9 in another document; cite the artefact.

### §9.1 — The facade

```bash
grep -c 'export' packages/plugin-sdk/src/index.ts        # 61 (5 of them wildcards — see §1.5)
wc -l packages/plugin-sdk/src/index.ts                   # 693
grep -rl "@pryzm/plugin-sdk" plugins/*/package.json | wc -l   # 35 of 48 plugin manifests
```

Version `1.0.0` (the only workspace package at 1.0.0); published as `@pryzm/sdk`; 8 subpath exports;
867 import statements from `plugins/` across 554 files.

### §9.2 — The boundary — read the gate, not this block

```bash
npx tsx tools/ga-gate/check-layer-boundaries.ts    # exit 0
```

| Number | Reading | Ceiling | Headroom |
|---|---|---|---|
| upward imports (layer rule) | 102 | `MAX_VIOLATIONS` | ⚠ **ZERO — the next real upward import fails this gate** |
| L6 → SDK-facade bypasses | 172 | `MAX_SDK_BYPASS` | 10 below — **converging** |
| banned third-party imports | 113 | `MAX_RESTRICTED_IMPORTS` | at ceiling |
| UNCLASSIFIED packages | 13 | `MAX_UNCLASSIFIED` | at ceiling (see N7) |

Workspace packages 159 · classified 146. Largest single bypass target: `packages/renderer-three`
(83 of the 172) — consistent with §2.3's point that this is an *encapsulation* number, not a layering
one. **§2.6 is why this table shows headroom: two of these four rows are opposite situations.**

### §9.3 — The command surface

Cite `docs/04-reference/API-VERB-REGISTER.md`, which is **generated**; per C69 §0.1 this contract
states no verb counts of its own. `affectedStores` occurrences repo-wide: **1,031**
(`grep -rn "affectedStores" --include=*.ts | wc -l`).

### §9.4 — Performance budgets — the uncomfortable reading, at full strength

Authority: `packages/perf-budgets/src/nft-targets.ts`; source of truth C10 §1.

**19 targets · 6 measured · 13 `not-yet-measurable`.** Each of the 13 carries a mandatory
`blockedBy` and a `measuresInsteadToday` disclosure. Three of those disclosures, verbatim, because
they are the evidence that §4.6 is real rather than decorative:

- *"`computeCostUSD()` arithmetic — sub-microsecond pure JS, asserted < 3000 ms. **This assertion
  can never fail and therefore carries zero information.**"*
- *"2,000 (not 10,000) WallStore DTOs against a 200 MB (not 1.5 GB) data-layer ceiling, over seconds
  (not an hour). **Three separate deviations in one file.**"*
- The E2E suite's `blockedBy`: the spec file C10 names *"**DOES NOT EXIST anywhere in the repo**."*

And an **inverted ratchet** (may only rise): benches executed in CI, baselined at 16, recorded
against the finding that before 2026-08-11 the number was **0 of 19** — *"C10 §4 lists 'All 17 NFT
benches pass' as a MERGE BLOCKER, so for the entire life of that clause the gate has been asserting
a fact nobody checked."*

### §9.5 — Ledgers

```bash
ls tools/ga-gate/check-*.ts | wc -l     # 60 gates
```

`gate-debt.json` — **2** declared-debt gates, down from 16 at the 2026-08-08 baseline.
`gate-newly-measured.json` — **28** entries (gates RED on defects that predate them, §6.3).

### §9.6 — Downstream consumers

| Format | Verdict | Evidence |
|---|---|---|
| IFC4 / IFC4X3 export | **IMPLEMENTED** | `plugins/ifc-export/` binds `web-ifc`; 13-file engine writer under `file-format/src/export/ifc/` |
| IFC import | **IMPLEMENTED** | `file-format/src/import/ifc/IfcImporter.ts` (largest interop file) + parse worker |
| BCF round-trip | **IMPLEMENTED + measured** | `plugins/bcf/`; one of the 6 measured NFTs |
| Revit — native .NET add-in | **IMPLEMENTED** | `revit-addin/PRYZM.Revit.Bridge/` — C#/XAML with compiled `bin/` |
| Revit — IFC4X3-RV variant | **IMPLEMENTED**, one declared stub | `plugins/ifc-export/src/exporters/revit-variant.ts`; does not fork the IFC4X3 exporter; `Pset_SiteRevitVariant` self-declared stub |
| DXF engine | **IMPLEMENTED** | `export/sheets/DxfExportService.ts` + 7-file import dir |
| **DXF plugin** | **DECLARED SHELL** | `plugins/dxf/src/index.ts` — 66 lines (§5.2) |
| Rhino .3dm | **IMPLEMENTED ×2** | Two independent paths, no shared code (§5.3) |
| glTF / GLB export | **IMPLEMENTED** | `export/glb/GLBExporter.ts` |
| PDF vector export | **IMPLEMENTED** | `packages/pdf-export/` + `PdfExportService.ts` |
| **PDF plugin** | **DECLARED SHELL** | `plugins/export-pdf/src/index.ts` |
| **`pdf-to-bim`** | **PARTIAL — review queue only** | ⛔ **not a converter** (§5.2) |
| `.pryzm` v0→v1 migration | **TYPED STUB** | `MigrationStubError`, `code = 'migration-stub'` (§6.1) |
| Family migrations | **IMPLEMENTED** | `family-migrations/registry.ts` with cycle detection |

```bash
grep -rln "empty workspace-package shell" plugins/*/src/index.ts | wc -l   # 6 of 48
```

The six shells are `dxf`, `export-pdf`, `geospatial`, `navigate`, `render`, `visibility-intent`.
Each declares itself a shell in its first comment line **and** exports a named
`*_PROVENANCE_MAPPING` absence record — §6.1 in practice.

---

## §10 — Related

- **C03** — schemas, commands, state (what a command *is*)
- **C16** — command authoring protocol (how one is *written*; CA-DOCTRINE-A on `affectedStores`)
- **C69** — the API verb register (the *enumeration*, and §0.1's cite-don't-transcribe rule)
- **C67 / C68** — chat control plane and per-PR onboarding obligation
- **C05 / C47** — file format and format versioning (a verb rename lands here)
- **C10** — performance and observability (source of truth for §4.6's budgets)
- **C64 §2.13** — the parent anti-transcription rule
- **C75** — provenance (§6.2's default-standing-in-for-unknown failure)
- **C77** — secrets & configuration register (the C69 pattern, third instance)
- **C84** — element integrity (§1.4's EI-9, §5.3's §3.5 duplication rule)
- **ADR-0038** — the SDK schema lock referenced by §1.2
