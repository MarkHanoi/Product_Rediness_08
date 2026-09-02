# Lane 4H — AI REACHES THE SLICE

**The AIArtefact.** Audit §12 Phase 4 · spec §64 / §39–45 / §41–42 / §75 / §76 gate **D** ·
ADR-0324 §1–3 · ADR-0376 D3 / D9 · C16 CA-21 · audit R4 / R12 / R14.

Written 2026-09-02. Every number below was produced by a command in this document, run in the
foreground with `$?` read from a redirect. Transcripts are beside this file as
`lane-4h-*.txt`.

---

## 0 · THE VERDICT IN FOUR LINES

| Claim | State | Where it is proved |
|---|---|---|
| **§76 D-i** — the AI reaches the model through the SAME command system as the UI | ⭐ **TRUE, and now EXECUTED for the component slice** | `aiReachesComponentSliceThroughComposedRuntime.test.ts` ARMS A–C, 7/7 green |
| **§76 D-ii** — …and the record says it was the AI | ⭐ **TRUE AS OF THIS LANE. FALSE BEFORE IT, everywhere, for every actor** | ARMS D–E + the falsification control |
| **§64 first half** — *"create a 1200 × 1500 mm window with a 75 mm aluminium frame"* driven from a SENTENCE | ⛔ **NOT REACHABLE, and the blocker is structural** | ARM F (measured, not asserted) |
| **§41–42** — a value change vs **rule creation** | ⛔ **RULE CREATION IS NOT REACHABLE ANYWHERE IN THE AI PATH** | ARM G + the re-measured greps in §5 |

The lane's ⛔ gate obligation — `check-chat-capability-coverage` **UNDECLARED back to its 0
baseline** — is **MET**: `17 → 0`, with **no ceiling raised, no gate disabled and no
`gate-debt.json` entry**.

---

## 1 · ⭐⭐ THE FINDING THAT MATTERS MOST: ADR-0324's INVOCATION ENVELOPE WAS UNREACHABLE

**This is the lane's headline, and it was found by a probe, not by reading.**

The brief scoped actor-stamping as *"~2 lines"*. Those two lines went into
`ZeroTokenChatBridge`, and the acceptance test then read the actor off the `EventRecord` the
bus really emitted and got **`undefined`** (`lane-4h-test-RUN1.txt` — ARMS D and E RED,
5 passed).

The cause, at `packages/runtime-composer/src/composeRuntime.ts`, symbol `bus` (the public slot
the runtime hands the application):

```ts
executeCommand(type: string, payload: unknown): unknown {
  return inner.bus.executeCommand(type, payload);
}
```

**Two parameters declared, two forwarded, and the third silently dropped.**
`CommandBus.executeCommand` has accepted `{ context: { actor, origin, approval } }` since
ADR-0324 R1; `EventRecord.context` exists (`command-bus/src/types.ts`, symbol `EventRecord`);
`CommandBus` spreads it onto the record; `normalizeForParity` deliberately **strips** it so
G-REASON-04 parity survives. Every piece shipped. And **the only bus surface application code
ever holds could not carry it.**

Measured, repo-wide, before this lane:

```
grep -rn "executeCommand(" --include=*.ts apps/ plugins/ packages/ | grep -v node_modules | grep -v __tests__
  → 638 call sites
…of which pass a `context:`  → 0
```

So the ADR-0324 §1 envelope — actor, origin, approval, the whole AI-provenance contract — had
**never been stamped by anything in production**, and could not have been. That is
[[committed-is-not-reachable]] in its purest form: a contract, a type, a field, a persistence
path and a parity rule that strips it, all correct, all unreachable.

**The fix is two forwarded parameters** (`§ENVELOPE-REACHES-THE-BUS`), typed with
`CommandExecutionContext` on the slot in `types.ts`. It is additive by construction — an
omitted `opts` produces the call CommandBus already read — and ADR-0324 §3 forbids anything
from reading `context`, so widening the signature **cannot change what any command does**.

⚠ **Owed, and not mine:** `CommandEventBridge`'s `command.executed` relay forwards
`record.audit.actorId` and **drops `record.context`**, so the runtime event channel still
cannot tell an AI edit from a click. See §6 item 3.

---

## 2 · THE GATE: WHAT WAS COUNTED, AND WHY THREE OF THE SEVENTEEN WERE FICTIONS

### 2.1 Before

```
$ npx tsx tools/ga-gate/check-chat-capability-coverage.ts > /tmp/chat.txt 2>&1; echo "RC=$?"
[check-chat-capability-coverage] registered bus commands: 365
[check-chat-capability-coverage] UNDECLARED: 17 (baseline 0)
RC=3
```
(`lane-4h-chat-BEFORE.txt`. The audit's R4 row read **13/0**; the four added since are 4C's
three component verbs plus one artefact — see below.)

### 2.2 ⭐ Three of the seventeen were never commands

`HANDLER_TYPE_RE` matches a `type` **property**, and an element record carries one.
`PlaceComponent.ts` builds `{ id, type: 'component', levelId, … }` as the L0 record it stores;
`CreateBalcony.ts`, `CreateFloor.ts`, `CreateLift.ts` and `CreatePool.ts` do the same. **Five
element kinds were counted as registered bus commands.** The file's own header records the
inverse defect (an under-matching first draft that produced phantoms); this is the same defect
facing the other way, and it produces **fictions** — subjects with no handler that the ratchet
then demands somebody "declare".

⛔ **And somebody did.** `ChatCommandClassification.ts` carried, verbatim:

```ts
...family('D', 'Bare-verb alias registration of the .create form.', ['floor', 'pool']),
```

There is no bare-verb alias. `CreateFloor.ts` declares `readonly type = 'floor.create'` and its
record says `type: 'floor'`; `CreatePool.ts` declares `'pool.create'` and its `_recordOf` says
`type: 'pool'`. **A confident, plausible, written reason for two commands that have never
existed** — [[confident-register-rows-are-the-wrong-ones]] exactly. The row is deleted.

### 2.3 ⛔ TWO NARROWER FIXES WERE TRIED AND FALSIFIED BY EXECUTION FIRST

Recorded because both look obviously right and both are wrong:

| Candidate rule | Verdict | Measurement |
|---|---|---|
| *"a real verb contains a dot"* | ⛔ **FALSE** | `copy-selection`, `paste-clipboard`, `zoom-fit`, `zoom-selected` are real, registered and dotless |
| *"a real declaration carries a modifier, or has `execute`/`affectedStores` within a bounded window"* | ⛔ **FALSE, and dangerously so** | measured: it would have dropped **74 real verbs** from `initBusHandlers.ts` — a better UNDECLARED number over a subject the gate had stopped reading, which is the `§R5-FLOOR` failure the file exists to refuse |

**The rule that shipped** (`§FIX-ELEMENT-KIND-DISCRIMINATOR-IS-NOT-A-VERB`): drop a matched
literal **iff** it has no dot **and** the same file also declares a dotted verb with it as the
prefix. A handler file that declares `X.action` and also writes a bare `X` is writing the
discriminator of the record `X.action` creates. Measured on this tree: **368 raw → 363 kept, 5
dropped**, the five being exactly `balcony / component / floor / lift / pool`, and all four real
dotless verbs surviving. The excluded set is **printed on stdout every run**, never silent.

### 2.4 ⭐ HANDLER_GLOBS: three real verbs were outside the gate's subject entirely

`apps/editor/src/engine/graphQueryBusHandlers.ts` registers `graph.query`, `graph.neighbors`
and `graph.path` — the World Model read surface **spec §69 is written about** — and no glob
reached it. They could never have been counted as undeclared. **That is the c1902a5a defect one
directory over.** Added.

⚠ **And one blindness is declared rather than closed.**
`apps/editor/src/engine/links/linkBusHandlers.ts` registers four real verbs (`link.create`,
`link.remove`, `link.setDisplay`, `link.setPin`) through a local `reg(type, …)` helper — the
verb is a **call argument**, not a `type` property. Measured: adding the path to the glob list
yields **0 new verbs**. ⛔ It is therefore deliberately **not** added, and the reason is written
into the gate: a glob that matches a file whose shape the regex cannot read is worse than its
absence, because the file *looks* covered in the list a reviewer reads while the count is
unchanged. Constant `HANDLER_GLOBS_KNOWN_BLIND`.

### 2.5 After

```
[check-chat-capability-coverage] element-kind discriminators excluded (not verbs): balcony, component, floor, lift, pool
[check-chat-capability-coverage] registered bus commands: 363
[check-chat-capability-coverage] explicitly deferred (CHAT_UNAVAILABLE): 78
[check-chat-capability-coverage] UNDECLARED: 0 (baseline 0)
RC=3
```

**BEFORE vs AFTER, headline diff — the ONLY change:**

```
< UNDECLARED: 17 (baseline 0)                          > UNDECLARED: 0 (baseline 0)
< FAIL — 17 undeclared bus command(s), baseline 0.     (line gone)
```

Every other arm is byte-identical to HEAD. Nothing was raised, disabled or ledgered.

---

## 3 · ⛔ WHAT THIS LANE REFUSED, AND WHY

The lane row says *"Add `component.*` as `ChatCapability` rows with `probe` + `commandProof`."*
**That is refused, on §75 grounds, with the measurement that justifies it.**

**Every reference in the component family is a ULID, and a sentence carries names.**

| Verb | What its payload needs |
|---|---|
| `component.place` | `definitionId: fam_<ULID>` **and** `typeId: typ_<ULID>` — both regex-enforced in `canExecute` |
| `component.setInstanceParameter` | `parameterId: par_<ULID>`, and it **refuses a name-keyed override by design** (its header: *"Overrides are keyed by parameter ID, never by display name — a rename would silently orphan a name-keyed override"*) |
| `component.swapType` | a second `typ_<ULID>` |

The join from a spoken word to any of those three ids is a **project-level component-definition
registry**, and there is none at this commit. `PlaceComponent.ts` says so in its own header
(*"there is no project-level definition registry at this commit … inventing a lookup that
silently returns 'yes' would be strictly worse than the honest absence"*), and a repo-wide sweep
for a `FamilyDocument` store addressable by name finds the pack / unpack / migrate / evaluate
side and **no registry**.

A `ChatCapability` is an **assertion of reach**. Its `targets` would be a claim the guard cannot
honour for any sentence a user would actually say — which is precisely the `ElementCapabilities`
lie this gate's **check 3a** was built to reject, and precisely what §75 forbids. So the three
verbs are declared in `CHAT_UNAVAILABLE` with sentences that name the missing piece and the
route that works today, following the `room.setDepartment` precedent already written into that
map.

⛔ **A second refusal, smaller:** no new NL matcher was added. `applySemanticIntent`'s
hand-written case-arm ratchet reads **30/30 — at its ceiling** — and `MATCHERS` is a ~60-entry
ordered list whose ordering is load-bearing and adversarially pinned. Even had the registry
existed, a new family belongs on the table-routed seam (`asVisibilityIntent` /
`asMoveToLevelIntent` / `applyCreateStairShape`), with its own adversarial corpus, in its own
lane.

### The seventeen, answered

| Verbs | Answer |
|---|---|
| `component.place` · `.setInstanceParameter` · `.swapType` | the ULID/registry gap above |
| `graph.query` · `.neighbors` · `.path` | read-only; answering spec §69's *"which windows on Level 02 use Large?"* needs 4G's typed reader and the `instantiates` axis. Wiring chat to a half-built query surface produces confident wrong answers |
| `balcony.create` · `.updateProfile` · `lift.create` · `bathroomPod.create` | the geometry is **pointed at, not spoken** — the same honest refusal `wall.createOpening` already carries |
| `balcony.delete` · `lift.delete` · `bathroomPod.delete` | speakable in principle; a `DELETE_FAMILIES` row is real work (a `FilterScope` noun set + executed example + acceptance coverage). Deferred out loud |
| `room.autoClassify.batch` | ⚠ not a wiring gap — a **confirmation-model** decision. Bulk inference-driven rename; the Confirm card cannot state a truthful count before the inference runs (ADR-0313's deferred shape). Reachable from the Room Schedule where the user sees the proposal |
| `room.restoreMeaning` · `room.setColourMode` | a proposal card, and a display setting |
| `view.setCategoryVisibility` | ⚠ **P7.** `visibility.*` records a domain INTENT; this is a per-view graphic override. *"Hide the doors"* lands on the first, and silently landing it on the second is the intent/UI-state collapse P7 exists to prevent |

---

## 4 · THE EXECUTED ACCEPTANCE

`apps/editor/__tests__/aiReachesComponentSliceThroughComposedRuntime.test.ts` — **7/7, RC=0**
(`lane-4h-test-RUN2.txt`).

It obtains its runtime **only** via `composeRuntime({ bootstrapFn: bootstrapWithEverything })`
and installs it at `window.runtime` — precisely where `ZeroTokenChatBridge` looks
(`win().runtime?.bus`). It constructs **no bus and no store**.

| ARM | What it establishes |
|---|---|
| **A** | The bridge and the composition root agree on where the bus is. Asserted FIRST because `dispatchCommands` answers a missing bus with a polite sentence and dispatches nothing — a green-looking no-op |
| **B** | ⭐ `runZeroTokenResolution` (*"Nothing may reach the bus by another route"*) lands `component.place`, and the occurrence is read back out of `rt.stores.component`: `definitionId`, `typeId`, `levelId`, **and the §64 numbers in canonical metres — 1.2 / 1.5 / 0.075, never 1200 / 1500 / 75** (ADR-0376 D3; a 1000× error no schema here can detect). Plus: the transcript contains no *"not ready yet" / "did not complete" / "Nothing was changed"* |
| **C** | §39–45 — the AI mutated nothing directly: the same dispatch repeated is **refused by `canExecute`'s duplicate-id guard**, the bridge says so, and the record is untouched. A direct store write would have no such guard |
| **D** | ⭐ `EventRecord.context.actor.kind === 'ai'` **and** `origin.surface === 'chat'` (ADR-0324 §2: *"never stamp actorId='ai' as a substitute"*), **and `approval` is asserted ABSENT** — `hooks.confirm()` is a UI confirmation, not a proposal→validate→approve record, and manufacturing one would be the worse defect |
| **E** | The provenance round-trips `PatchEmitter.encode`/`decode` — the exact encoder `CommandBus` runs before handing records to `EventLogPersistor`. A field that does not survive the wire is not provenance |
| **F** | ⛔ **THE MEASUREMENT.** §64's own sentence through the real ladder emits **zero `component.*` commands** — the only outcome this lane would have treated as a defect is the ladder inventing a `fam_`/`typ_` ULID — and all three verbs carry a declared reason naming the missing piece |
| **G** | ⛔ §41–42's rule half: three formula sentences, none may resolve to `commands`. A resolver that read *"twice"* as a number and set `width = 2` would be §75's forbidden shape |

**On the one non-store read (ARMS D/E).** C16 CA-21 forbids reading a **mutation** back from
anywhere but the authoritative store, and ARMS B–E all do read the mutation from
`rt.stores.component`. **Provenance is not a mutation:** ADR-0324 §3 forbids anything from
reading `context`, so it deliberately reaches no store — the `EventRecord` is its only
authoritative home. The capture is a **delegate** that forwards all three arguments to
`rt.bus.executeCommand` and returns its real value; the real handler runs and the real store is
written, which is why a lying delegate would fail the store assertions rather than pass them.

### Falsification

| Control | Result |
|---|---|
| **Seen failing** | `lane-4h-test-RUN1.txt` — ARMS D + E RED (`Cannot read properties of undefined (reading 'subscribe')`, then `expected undefined to be defined`), 5 passed |
| **Sensitivity control** | Reverted **only** `return inner.bus.executeCommand(type, payload, opts)` → `(type, payload)`. ARMS D + E go RED with `AssertionError: expected undefined to be defined`; the other five stay green (`lane-4h-test-CONTROL.txt`). The arms are sensitive to exactly the fix, and the bridge's stamp alone is provably insufficient |
| **Byte-identical restore** | `sha256(composeRuntime.ts)` = `90c631eca7bd189bef804b4d6b5170055bb5a3d8dd7fb1d1103b19cf35b2a93b` before injection and after restore |
| **Pre-existing-failure control** | `chat-capability-registry.test.ts` fails 2/90 with **HEAD** copies of both registry files and 2/90 with mine — identical set, so the failures (`set-curtain-wall-dimensions` missing from the matrix literal; fan-out families at 5 > 4) are **not this lane's**. Restore verified by `sha256sum -c` |

---

## 5 · §41–42, RE-MEASURED 2026-09-02

The brief reported *"grep -ic formula over the three resolvers returned 0/0/0"*. Re-measured,
and it is worse than that — **`expression` is 0 as well**:

| File | `formula` | `expression` |
|---|---|---|
| `packages/ai-host/src/intents/ZeroTokenResolver.ts` | **0** | **0** |
| `packages/ai-host/src/intents/LocalNaturalLanguageResolver.ts` | **0** | **0** |
| `packages/ai-host/src/intents/LlmPlanner.ts` | **0** | **0** |

**No member of the `SemanticIntent` union carries a formula or an expression.** So the §41–42
distinction is not *mis-resolved* — it is **unrepresentable**: there is no shape for the AI to
put *"Width = Height × 2"* into, which is why ARM G's sentences fall through rather than
flattening into a value. That is the better of the two failures, and it is why the arm asserts
`kind !== 'commands'` rather than a particular refusal.

**What creating a rule needs, named:**

1. A `SemanticIntent` member carrying an **expression string** (never a closure — C111/§10.2's
   contract-emitter rule), plus its table-routed applier.
2. A **bus verb that accepts an expression**. `component.setInstanceParameter` accepts only a
   `number | string | boolean`; `FamilyParameter.expression` lives in the **definition
   document**, so authoring a rule is a definition edit, and **there is no bus verb that edits a
   component definition** at this commit — 4C minted three placement verbs, by design.
3. The **precedence decision 4A landed** (ADR-0376 D4 / C110 — instance > type > expression >
   definition default), so a written rule and a written override compose predictably.
4. A grammar for arithmetic over parameter **names** — which lands back on §3's registry: a rule
   must name `Height`, and nothing joins that word to a `par_<ULID>`.

⭐ **(2) and (4) are the same blocker as §64's first half.** One missing piece — the
project-level definition registry, plus a definition-editing verb — gates the value half of §64,
the rule half of §41–42, and the whole `component.*` chat surface. It is the single highest-value
unblock for the AI leg of this programme.

---

## 6 · OWED — ISSUE-LOG rows this lane could not append

⚠ **No L-number is cited in code for these.** Minting one a lane cannot append is the
UNMINTED-AND-CITED defect (C103, and CLAUDE.md's own correction history). The register's max at
writing is **L-12892**; the orchestrator owns `ISSUE-LOG.md`.

1. **`linkBusHandlers.ts`'s four verbs are invisible to `check-chat-capability-coverage`
   regardless of globs** — it registers through a `reg(type, …)` helper, and `HANDLER_TYPE_RE`
   matches a `type` property. Measured: adding the path yields 0 new verbs. **Disposition:** a
   second matcher for the helper-call shape. **Acceptance:** the gate's registered count rises
   by exactly 4 and `link.*` appears as undeclared until declared.

2. **There is no project-level component-definition registry**, so nothing joins a spoken name to
   `fam_`/`typ_`/`par_`. Blocks §64's first half, §41–42's rule half, and every `component.*`
   chat capability. **Disposition:** mint the registry (and a definition-editing verb) in the
   lane that owns the definition side. **Acceptance:** `resolveUtterance("place a Large window
   on level 2")` reaches `component.place` with a real `fam_`/`typ_` pair, read back from
   `rt.stores.component`.

3. **`CommandEventBridge`'s `command.executed` relay drops `record.context`** — it forwards
   `record.audit.actorId` only, so the runtime event channel still cannot distinguish an AI edit
   from a click even now that the record can. **Disposition:** forward `context` (or a narrowed
   `actor`) on the relay. **Acceptance:** a `command.executed` listener sees `actor.kind: 'ai'`
   for a chat dispatch.

4. **`ChatCapabilityRegistry.ts` has no `component` entry in `PROBE_ELEMENT_KINDS`**, so no
   capability is probed against the new element kind and silent over-reach onto it cannot be
   detected. Deliberately not added here: with 77 capabilities it is a measurement whose fallout
   belongs to whoever owns the capabilities that fail it. **Acceptance:** `'component'` joins the
   list and check 3a reads clean.

---

## 7 · ⛔ FOUR PRE-EXISTING RATCHET BREACHES, UNCHANGED, NOT THIS LANE'S

`check-chat-capability-coverage` still exits **RC=3**. §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 /
L-836) applies — these are **not** absorbable via `gate-debt.json` — and they are RED at HEAD,
byte-identical before and after this lane. Audit R4 assigns this gate's **UNDECLARED** arm to
lane H; it assigns none of these:

| Arm | Reading | Note |
|---|---|---|
| Unresolvable parameter sources | **3** (hard) | `set-reveal-direction.revealDirection` → `"enumeration"`; `set-window-shape.shape` / `set-door-shape.shape` → `"opening-shapes"` — no resolver exists for either name |
| Scope mode declared but not honoured | **1** (hard) | `add-wall-layer` declares `"orientation"`; the intent never reaches `ctx.resolveScope`. C68 §7.d — *"the ElementCapabilities lie in a new costume"* |
| Undeclared spatial reach | **5 / 2** (ratchet) | `set-wall-dimensions`, `set-window-dimensions`, `set-door-dimensions` honour `orientation`; `create-windows-parametric` honours `room` + `orientation` |
| Unreachable panel properties | **47 / 42** (ratchet) | 5 over. Largest holders: `handrail.*` (9), `stair.*` (8), `stair-railing.*` (6) |

⚠ Two of these sit in a file this lane owns (`ChatCapabilityRegistry.ts`) and were deliberately
left alone: the capabilities involved are wall/window/door dimension and opening-shape families
adjacent to lane **4F**'s surface, and silently re-declaring another lane's spatial claims mid-wave
is how two lanes end up disagreeing about one table.

---

## 8 · FILES TOUCHED

| File | Change |
|---|---|
| `tools/ga-gate/check-chat-capability-coverage.ts` *(serialize-only, this lane's)* | `§GLOB-GRAPH-QUERY` (+`graphQueryBusHandlers.ts`) · `§GLOB-BLINDNESS-DECLARED` (`HANDLER_GLOBS_KNOWN_BLIND`) · `§FIX-ELEMENT-KIND-DISCRIMINATOR-IS-NOT-A-VERB` + its printed exclusion line |
| `packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts` | **+113 lines, 0 deletions** — `§CHAT-UNDECLARED-ZERO`: the seventeen `CHAT_UNAVAILABLE` rows and their reasoning. **No capability added, removed or altered** |
| `packages/ai-host/src/capabilities/ChatCommandClassification.ts` | the false `family('D', 'Bare-verb alias registration…', ['floor','pool'])` row deleted, with the evidence kept in place of it |
| `apps/editor/src/ui/ai/ZeroTokenChatBridge.ts` | `§AI-ACTOR-STAMP` — `AI_INVOCATION` (frozen) on **all three** dispatch sites: batch, single, and the visibility leg |
| `packages/runtime-composer/src/composeRuntime.ts` · `types.ts` | `§ENVELOPE-REACHES-THE-BUS` — the bus slot forwards `opts` (see §1). ⚠ Not in this lane's OWNS list; taken because without it the lane's deliverable does not exist |
| `apps/editor/__tests__/aiReachesComponentSliceThroughComposedRuntime.test.ts` **(new)** | the seven arms |

**Verification run at the end of the lane:** root `tsc --noEmit` **RC=0, 0 errors** (needs
`NODE_OPTIONS=--max-old-space-size=8192`; the default heap OOMs) · `check-layer-boundaries`
**RC=0** (48/102, 13/13, 159/182) · `check-single-compose` **RC=0** ·
`@pryzm/runtime-composer` **179/179** · the four editor bridge + 4C composed-runtime suites
**36/36**.

**Not committed**, per the lane brief.

---

## 9 · INDEPENDENT RE-VERIFICATION — SESSION 2, 2026-09-02 ~11:27–11:45

**Why this section exists.** This lane's delta was INHERITED uncommitted (doc mtime 09:50,
transcripts 09:48–09:53) and lanes 4B / 4C / 4D / 4G landed in the shared tree AFTERWARD
(11:07–11:25), with 4C regenerating `API-VERB-REGISTER.md` at 11:16. Per the standing mtime
rule, everything above was therefore **re-executed at the 11:27+ HEAD (`f18df693` + the shared
uncommitted wave)**, not trusted. Fresh transcripts: `lane-4h-VERIFY-*.txt` beside this file.

### 9.1 Every §-tag on disk at HEAD

`§ENVELOPE-REACHES-THE-BUS` in `composeRuntime.ts` (symbol `bus.executeCommand`, `opts`
forwarded) **and** `types.ts` · `§AI-ACTOR-STAMP` + frozen `AI_INVOCATION`
(`actor.kind:'ai'`, `origin.surface:'chat'`) on **all three** dispatch legs of
`ZeroTokenChatBridge.ts` (batch · single · visibility) · `§GLOB-GRAPH-QUERY`,
`HANDLER_GLOBS_KNOWN_BLIND`, `§FIX-ELEMENT-KIND-DISCRIMINATOR-IS-NOT-A-VERB` in the gate ·
`§CHAT-UNDECLARED-ZERO` + the three `component.*` `CHAT_UNAVAILABLE` rows in
`ChatCapabilityRegistry.ts`, each naming the missing registry AND the route that works today.

### 9.2 Re-executed

| Subject | Reading | Transcript |
|---|---|---|
| `aiReachesComponentSliceThroughComposedRuntime.test.ts` | **7/7, RC=0** — real `composeRuntime()`, occurrence read back from `rt.stores.component.getState()` (CA-21 at the authoritative layer), §64 numbers in canonical metres | `lane-4h-VERIFY-acceptance-PASSING.txt` |
| `check-chat-capability-coverage` | **UNDECLARED: 0 (baseline 0)** — the lane's ⛔ obligation HOLDS at HEAD. RC=3, on exactly the four §7 pre-existing arms (3 unresolvable sources · 1 unhonoured scope mode · spatial reach 5/2 · unreachable properties 47/42), byte-consistent with §7 | `lane-4h-VERIFY-chat-gate.txt` |
| `check-single-compose` | **RC=0** — 1 root · 1/1 declared rival · 2/2 callers; this lane's composeRuntime edit did not disturb P1 | `lane-4h-VERIFY-gate-compose.txt` |
| Root `tsc --noEmit --skipLibCheck` | **RC=0 — zero errors** (NODE_OPTIONS=--max-old-space-size=8192) | `lane-4h-VERIFY-root-tsc.txt` |
| §5's resolver greps | **re-measured fresh: `formula` 0/0/0 · `expression` 0/0/0** — §41–42 rule creation remains UNREPRESENTABLE in the AI path | this table |

### 9.3 Fresh falsification (not inherited)

Severed **only** `return inner.bus.executeCommand(type, payload, opts)` → `(type, payload)`:
**ARMS D + E RED** (`AssertionError: expected undefined to be defined`), the other five green,
RC=1 (`lane-4h-VERIFY-falsify-SEEN-FAILING.txt`). Restored from backup;
`sha256sum -c` **OK** against the pre-severance hash
`006d0d9000ed6b0515372a19c69b6d62d64fabc8caa9ebcfe7251ac80bededc4`
(`lane-4h-VERIFY-falsify-sha256.txt`); re-run **7/7 RC=0**
(`lane-4h-VERIFY-falsify-RESTORED-GREEN.txt`).

⚠ **Hash discrepancy, resolved.** §4's control recorded `sha256(composeRuntime.ts) =
90c631ec…b93b`; today the same file reads `006d0d90…edc4`. The working diff explains it: the
file now carries **two lanes' hunks** — 4E's `§COMPONENT-RENDER-MOUNT-ADOPTS-INNER` alongside
4H's `§ENVELOPE-REACHES-THE-BUS` — so the bytes moved between the two sessions' baselines.
That is the shared-tree condition that made THIS re-execution mandatory rather than a
courtesy, and it is why the falsification above was run fresh instead of trusting §4's.

### 9.4 What did NOT change

No file this lane owns was edited this session. No ceiling, no baseline, no gate-debt entry.
The §3 refusal (no `ChatCapability` rows for ULID-keyed verbs without a name registry, per
§75), the §5 rule-creation blocker, and the four §6 owed rows all stand exactly as written —
§6 item 2 (the project-level component-definition registry + a definition-editing verb)
remains the single blocker gating §64's first half AND §41–42's rule half. Nothing committed,
per brief.
