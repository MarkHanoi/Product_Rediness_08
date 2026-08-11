# C69 — The API Verb Register

> **Stamp**: 2026-08-11 · **Status**: CANONICAL
> **Scope**: the enumeration of every command type the CommandBus accepts — the wire identifiers — and the binding rule that the enumeration is GENERATED from the handler sources, never transcribed. Owns the register artefact, its columns, and the gate that keeps it true.
> **Key principle**: *A register a human maintains is a register that is already wrong.* The verbs are read out of the code on every CI run, and a PR that adds a verb without regenerating the register cannot merge.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Peers with **C03** (schemas/commands/state — owns what a command *is*), **C16** (command authoring — owns how one is written), **C08** (collaboration — owns whether it replicates), **C67**/**C68** (owns whether the chat can reach it), **C05** (persistence — owns the command log the wire identifier lands in). Supersedes nothing.
> **Register artefact**: [`docs/04-reference/API-VERB-REGISTER.md`](../../04-reference/API-VERB-REGISTER.md) — **generated**.
> **Gate**: `tools/ga-gate/check-verb-register.ts`.
> **Changelog**: 2026-08-11 — created, in answer to the founder's ask: *"Can we have all the API verbs documented in a contractual document? This needs to be clear, and whenever a new one is added it should be added there."*

---

## §0 — Why this contract exists, and why it is not a list

The ask is for a document. The obvious build is a markdown table somebody updates when
they add a verb. **This repository has disproved that artefact, in writing, four times
in one week**, and every instance is in its own governance documents:

- `CLAUDE.md` stated the contract suite was **C01–C15**; it is **C01–C68**. Fifty-three
  contracts sat outside the stated conflict-resolution order, two of them CANONICAL and
  binding on every capability PR.
- **Four mutually inconsistent NFT target sets** existed simultaneously. Benches asserted
  their own headers, so a bench could pass while missing the contract by 10×.
- `check-layer-boundaries.ts` — the file `STR-03`/`STR-04` call *"the authority"* —
  carried **three numbers for two invariants** inside itself.
- The chat capability count read **41** in four documents while the gate measured **45**.

Every one of those is the same defect, and it is not carelessness: it is that the
*mechanism* was a human promise. So this contract does not ask for a promise.

> **§0.1 — MUST.** The register is **produced by a program from the handler sources**.
> No section of this contract, and no other document, may transcribe the verb list, the
> verb count, or any per-verb column. Cite the artefact. This is C64 §2.13 applied to
> the command surface, and it is the reason no number appears in the body of this
> contract.

---

## §1 — What a verb is

A **verb** (equivalently: a *command type*) is the string a `CommandHandler` registers
with `CommandBus.register()` — `wall.create`, `roof.update`, `zoom-fit`.

> **§1.1 — MUST.** A verb is a **wire identifier, not a label.** It is written into
> `project_command_log`, it appears in replayed collaboration history, and it is the key
> a remote dispatcher resolves. **Renaming a verb is a persistence-breaking change** and
> is governed by C47 (file-format versioning), not by ordinary refactoring. A rename
> without a migration silently orphans every logged command that carried the old name.

> **§1.2 — MUST.** A verb is registered **exactly once**. `CommandBus.register()` throws
> on a duplicate type; `apps/editor/src/engine/initBusHandlers.ts` therefore guards every
> bridge with `if (runtime.bus.registry?.has?.(spec.type)) continue;`. That guard converts
> a loud boot error into a **silent shadowing**: first registration wins, and the loser is
> dead code that logs nothing. See §5.2 — this is not hypothetical, and it is not one verb.

---

## §2 — The register

The register is [`docs/04-reference/API-VERB-REGISTER.md`](../../04-reference/API-VERB-REGISTER.md).
It carries one row per verb, and the columns below. Every column is **derived from source**;
none is authored.

| Column | What it answers | Derivation |
|---|---|---|
| **verb** | the wire identifier | the `type` literal in a handler-shaped declaration |
| **owner** | who to talk to | the workspace containing the declaring file |
| **liveness** | *does dispatching this change anything?* | §2.1 |
| **authoritative store** | *what does it change?* | the declared `affectedStores`, or `NONE`, or `UNKNOWN` |
| **undo** | *does one Ctrl+Z revert it?* | the declared forward/inverse shape and the stores `affectedStores` names |
| **sync** | *does a collaborator see it?* | cited from `packages/sync-client/src/syncDisposition.ts` (C08 / W5-3) |
| **chat** | *can a user ask for it in a sentence?* | cited from `ChatCapabilityRegistry` / `CHAT_UNAVAILABLE` / `ChatCommandClassification` (C67 / C68) |

> **§2.1 — the liveness vocabulary.** Four values, and they are not a quality ranking —
> they are four *different states of knowledge*:
>
> - **LIVE** — declared in an execution-authority root (`packages/command-registry/`,
>   `apps/editor/`), or a plugin handler carrying the legacy-bridge signature
>   (`commandManager` + empty `affectedStores`). The verb reaches state the renderers,
>   the plan projector, the exporters and persistence read.
> - **REFUSES** — `canExecute` cannot return `{ valid: true }` on any path. The verb is
>   registered and deliberately rejects (§FIX-DEAD-VERB-REFUSE, `5e74b178`).
> - **SHADOWED** — two registration sites exist, and §1.2's boot-order guard means the
>   plugin one wins while the live bridge never registers.
> - **UNKNOWN** — a lone plugin handler that `produceCommand`s against `ctx.stores`.
>   `check-chat-capability-coverage.ts` records this presumption being right 13 of 13
>   times (§FIX-CHAT-DEAD-ROUTES) *and* records why `wall.create` is nonetheless not
>   declared dead. Both are true, so the value is UNKNOWN.

> **§2.2 — MUST NOT.** `UNKNOWN` may never be rendered as blank, omitted, or defaulted to
> LIVE. **Failure and emptiness are never the same value** (§CONTEXT-DATA-HONESTY). An
> empty *authoritative store* cell reads as "fine" and means "nobody looked" — which is
> precisely the defect that let seventeen verbs report success while writing a store
> nothing renders, persists or exports.

> **§2.3 — the register is not a quality report.** LIVE means *"reaches an execution
> authority"*. It does **not** mean the write is correct, that undo reverts it, or that a
> collaborator sees it. C66 §1.1 — a claim and a measurement must not be written the same
> way.

---

## §3 — Binding rules

> **§3.1 — MUST.** The register is generated. Editing
> `docs/04-reference/API-VERB-REGISTER.md` by hand is a contract violation; the file
> carries a DO-NOT-EDIT banner and the gate overwrites it.

> **§3.2 — MUST.** The register **cites**, and never copies, data another artefact owns.
> Sync dispositions live in `packages/sync-client/src/syncDisposition.ts`; chat
> reachability lives in the C67/C68 registries. The generator imports them. A second copy
> of either would be a fourth rival list, which is the failure mode §0 catalogues.

> **§3.3 — MUST.** Adding, renaming or removing a bus command **requires regenerating the
> register in the same change**. This is the founder's *"whenever a new one is added it
> should be added there"*, made mechanical: `check-verb-register.ts` fails and names the
> verb.

> **§3.4 — MUST NOT.** A verb may not be introduced with liveness UNKNOWN or SHADOWED
> without the author adding it, by name, to the corresponding baseline in the gate file
> and stating why. Both baselines are **named, shrink-only lists, checked in both
> directions** — a verb that leaves the class must leave the list in the same commit, or
> the list rots into a record of things that are secretly fine.

> **§3.5 — MUST NOT.** The gate's honesty floors (`MIN_FILES`, `MIN_VERBS`) may never be
> lowered to make a run green. They are misconfiguration detectors. A scan below its floor
> exits **2**, never 0 and never 1.

---

## §4 — Relationship to the two gates that already own part of this

Two gates already enumerate verbs, for their own purposes, and **they disagree with each
other**. C69 does not adjudicate that by picking one; it takes the union as its subject
and makes the disagreement visible.

| Gate | What it owns | Its subject |
|---|---|---|
| `check-chat-capability-coverage.ts` | C67/C68 — every verb is declared to the chat | `plugins/*/src/handlers/*.ts` + two editor files, both declaration forms |
| `check-sync-disposition.ts` | C08/P8 — every property verb declares its sync fate | `plugins`, `apps/editor/src/engine`, `packages/command-registry/src`, **object-literal form only** |
| `check-verb-register.ts` (this contract) | the enumeration itself | the union, both forms, with a store-declaration or handler-directory test |

> **§4.1 — MUST.** Where the three subjects differ, the difference is a **finding**, not a
> tie to be broken silently. §5 records the ones open today.

> **§4.2 — MUST NOT.** C69 does not restate what C08 or C67/C68 decide about a verb. It
> reports their answer and marks `UNDECLARED` where they have none.

---

## §5 — Open findings (the register's first output)

These are what the first generated register surfaced. **Counts are deliberately absent —
read the artefact** (§0.1).

### §5.1 — `check-sync-disposition.ts` polices a fraction of its stated subject

Its handler-discovery regex requires `type: '…'` within 900 characters of
`affectedStores`. The overwhelming majority of handlers in this repo are **class**
handlers writing `readonly type = 'wall.create';`, which that pattern cannot match. The
gate reports *"Every property-mutation command type declares its sync disposition"* over a
handler set that is a small minority of the real one; applying **its own**
`PROPERTY_VERB_RE` to the full registered set leaves a large majority of property verbs
undeclared.

This is the identical defect `check-chat-capability-coverage.ts` records having had in its
own first draft (*"matched only the object-literal form and saw 102 of the ~300 registered
verbs… a gate that is confidently wrong"*). Its `propertyVerbs.length < 20` floor did not
catch it, because 60 handler types are enough to clear a floor of 20.

**Disposition**: open. The register's `sync` column reads `UNDECLARED` for every affected
verb, so the gap is enumerated by name in the artefact. Fixing `check-sync-disposition.ts`
is outside C69's ownership.

### §5.2 — SHADOWED verbs: a live bridge that can never register

Every verb in the register's *Declaring sites* table is declared twice — once by a plugin
handler, once by an `initBusHandlers` bridge that delegates to the legacy `commandManager`
command. Per §1.2 the plugin registration wins, so the arm that reaches the geometry stores
is unreachable. `roof.update` is the known instance; it is not alone.

### §5.3 — element kinds counted as verbs

`check-chat-capability-coverage.ts` counts `floor` and `pool` as registered bus commands.
Both are `type: '<kind>'` discriminants inside element literals in
`plugins/floor/src/handlers/CreateFloor.ts` and `plugins/pool/src/handlers/CreatePool.ts`.
`check-sync-disposition.ts` has the same class of noise (`door`, `rectangular`, `sitsOn`).
C69's generator requires a **store declaration** before it will accept a dotless
identifier, which excludes both.

### §5.4 — a verb outside the chat gate's field of view

`cube.move` is registered from `plugins/toy-cube/src/MoveCubeCommand.ts`, which is not
under `src/handlers/`, so `check-chat-capability-coverage.ts` never sees it and its
"UNDECLARED: 0" is over a set that excludes it. Small verb; general hole.

---

## §6 — The gate

`tools/ga-gate/check-verb-register.ts`.

| Check | Kind | What it asserts |
|---|---|---|
| **V0** | exit **2** | the walk read ≥ `MIN_FILES` files, discovered ≥ `MIN_VERBS` verbs, and the three cited declaration sources loaded. A gate that cannot establish its subject is **misconfigured**, not passing. |
| **V1** | hard | **symmetry, both directions** — every discovered verb has a row, every row maps to a discovered verb |
| **V2** | hard | the committed artefact equals the regenerated one; the failure names the changed rows |
| **V3** | hard | no blank cells (§2.2) |
| **V4** | ratchet | the **named** SHADOWED and UNKNOWN baselines, checked in both directions (§3.4) |

**Negative-tested 2026-08-11.** Every arm was watched failing before it was trusted:

- a synthetic `cube.gateNegativeTest` handler → *"V1 1 registered bus command(s) have NO
  row … cube.gateNegativeTest"* **and** *"V4 1 NEW UNKNOWN-liveness verb(s)"*; removing the
  file returned the gate to green.
- a fabricated `wall.phantomVerb` row → *"V1 1 register row(s) map to no registered bus
  command: wall.phantomVerb"*.
- flipping one committed cell from `REFUSES | NONE` to `LIVE | wall` → *"V2 … 1 line(s)
  disagree with the code"*, printing the committed and generated rows side by side.
- pointing `HANDLER_ROOTS` at a directory that does not exist → **exit 2**, *"the handler
  walk READ only 0 file(s); floor is 900… This is NOT a pass."*

The V2 negative test found a real defect in the gate itself: the comparison was
byte-exact, so a Windows checkout with `core.autocrlf` would have failed on every run
while Linux passed. Line endings are now normalised on both sides.

> **§6.1 — what this gate CANNOT see**, stated so nobody reads it as full coverage:
> **(a) runtime registration** — discovery is static, so a handler that is authored but
> never added to a handler set counts as registered; **(b) correctness** — liveness answers
> *"does this reach an execution authority"*, not *"is the value right"*; **(c) dynamic
> verbs** — a `type` assembled from a template literal is invisible to a source scan (none
> are known, and none would be found); **(d) undo behaviour** — the undo column is
> *declared shape*, not an executed proof that one Ctrl+Z reverts one edit, and commit
> `284a8db7` is the standing evidence that those differ.

---

## §7 — Anti-patterns

- **§7.a — A second verb list.** Any new document, spec or ADR enumerating command types.
  Cite the register.
- **§7.b — Hand-editing the artefact.** It is overwritten. The edit will look like it
  worked, exactly once.
- **§7.c — A bare count as a baseline.** A count lets a PR fix one verb, break another and
  stay level. §3.4 requires names.
- **§7.d — Raising a floor to go green.** §3.5.
- **§7.e — Reading LIVE as "works".** §2.3.
- **§7.f — Renaming a verb as a refactor.** §1.1 — it is a persistence change.
