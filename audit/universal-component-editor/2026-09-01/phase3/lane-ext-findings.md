# LANE EXT — the ten extensions, four corrections, and L-666

**Date:** 2026-09-01 · **Phase:** 3 (contract design — no code, no UI) · **Risk:** R10
**Authority:** ADR-0376 D1–D5 · `ARCHITECTURE-AND-CONTRACT-AUDIT.md` §6.1 / §6.2 / §11.3 / §12 Phase 3
**Committed:** NO (per brief). **Contracts minted:** NONE — therefore **no `index-row-*.txt` file**,
and `contracts/README.md` was NOT touched.

---

## 0 — What this lane changed, and the one-line reason for each

**13 files, all EXISTING contracts, all amended IN PLACE.** No new derivative doc. Every retraction
quotes the text it retracts, so the correction is auditable.

| Contract | Kind | Change |
|---|---|---|
| **C15 §0.1.2** | ⛔ CORRECT | slab + roof rows were **FALSE**; `OpeningData` is a third hosting mechanism, measured on four axes |
| **C74** front-matter + §6 | ⛔ CORRECT | *"all three gates UNBUILT"* — all three are BUILT; two RC=0 with executed controls, one RC=3 |
| **C25 §1.1** | ⛔ CORRECT | §1.1's IFC4X3 claim is false of the shipping pipeline and carried **no marker at its own site** |
| **C67 §1.2** | ⛔ CORRECT | every row re-measured; **UNDECLARED 0 → 13 against a hard-0 baseline** |
| **C65 §2.0** | EXTEND | the **T0 / Definition tier**, declared above T1 |
| **C71 §1.5 + §2.7** | EXTEND | the **node-kind** semantic (7th) + `instantiates` / `specializes` / `dependsOnDefinition` |
| **C15 §2.2** | EXTEND | `HostingCapability` as a **declaration shape**; **D11 recorded, NOT decided** |
| **C86 §10.1 PR-9 + §10.6.1** | EXTEND | universal-profile inheritance of PR-1/PR-2/PR-8; **ADR-0376 D2's 3-D split** |
| **C73 §2.6** | EXTEND | an adopted kernel is driven from `tolerance.ts`; **E4's shrink-only rule extends to it** |
| **C74 §4.6** | EXTEND | the **§4.2 (a)/(b)/(c) record** for the `.pryzm-family` sketch-profile family (**D8**) |
| **C69 §3.6** | EXTEND | every `component.*` verb registered from its first commit |
| **C84 §6 + §6.1 + §6.2** | EXTEND (+ correct) | block is **20 contracts, not 15**; the `component` family's twelve sections; C107 as template |
| **C100 §2.4** | EXTEND | `MaterialSlot` → `materialId` joins the §2.1 ladder |
| **C03 §4.10.1** | EXTEND | **a routing key is not a parameter**, generalised from `levelId` |
| **C11 §3.2 / §3.2.1 / §7.6 / §8.1.1** | ⭐ **CLOSE L-666** | the id-minting invariant is now normative where it was already being cited |

---

## 1 — The four corrections, with the measurement that settles each

### 1.1 — C15 §0.1.1's slab and roof rows were FALSE (audit §6.1, Lane G §G.1.5)

**Retracted text**, quoted in the contract: *"Slab / floor — ⛔ NO — and there is no rival mechanism
either. No opening model exists … Roof — ⛔ NO — same … UNBUILT."*

`OpeningData` (`packages/core-app-model/src/stores/OpeningTypes.ts`) is a generic
`hostId` + host-local 2-D `profile` opening record. **Four-axis reachability, measured:**

| Axis | Slab / floor | Roof |
|---|---|---|
| import / construction | `packages/input-host/src/OpeningTool.ts` constructs `CreateOpeningCommand`; `CommandRegistry.ts` maps `CREATE_OPENING` | `CommandRegistry.ts` maps `CREATE_ROOF_OPENING` |
| **bus verb** | ✅ `opening.create` in `initBusHandlers.ts`, + `syncDisposition.ts` row + `CHAT_UNAVAILABLE` reason | ⛔ **NONE** — non-test grep for `roof.opening\|roofOpening\|roof-opening` returns only the command's own id and one span attribute |
| build graph | ✅ `@pryzm/command-registry` → `@pryzm/input-host`, → `apps/editor` | ✅ → `apps/editor` |
| **call** | ✅ `OpeningPlanToolHandler`, registered at `planToolHandlerRegistry.ts` as tool id `'opening'`, dispatches `opening.create` (2 sites) | ⛔ **no first-party caller** — only the serialized-command deserialiser |

Geometry is wired on **both**: `initBuilders.ts` injects `openingStore` into `slabBuilder` and,
under `§ROOF-HOSTED-OPENINGS`, into `roofBuilder` — the file's own comment says without that line
*"the roof renders SOLID while the command reports success."*

**Why the contract got it wrong:** its grep searched `packages/schemas/src` for
`penetration|shaftOpening|slabOpening`. **The grep was correct; the vocabulary was wrong.** The
mechanism is neither of those names and is not under `packages/schemas`.

⭐ **The rule minted from it** (C15 §0.1.2): an absence claim MUST name the symbol it searched for
**and the root it searched under**, and MUST be re-run before it is cited. An absence proven over
`packages/schemas/src` is an absence *in* `packages/schemas/src`.

⚠ **What §0.1.1's positive ruling KEEPS:** slab and roof openings are still **not** C15 openings —
they fail three of the four requirements. The correct row was always *"NO — routed to a sibling
mechanism"*; the defect is that the contract wrote *"not routed elsewhere"* about code older than
the clause.

### 1.2 — C74's three gates are BUILT (audit §6.1, Lanes C §2.6 / H §4.1)

Run in the **FOREGROUND**, redirected, `$?` read immediately:

| Gate | RC | Terminal line | Controls | Floors |
|---|---|---|---|---|
| `check-constraint-honesty` | **0** | *"CLEAN — 0 findings, hard-0, no baseline"* | negative **5 findings, arms `[H1,H2,H3]`**; positive **0** | adapters 6/1 · families 20/1 · files 5150/500 · evidence 3015/100 · controls 1/1 |
| `check-solver-is-real` | **0** | *"CLEAN — 0 findings, hard-0, no baseline"* | negative fired `R2`/`R3` on `GhostAdapter`; positive **0** | manifests 179/100 · files 5150/500 · adapters-with-`kind` 2/1 · controls 1/1 |
| `check-no-hidden-mock` | **3** | *"RATCHET EXCEEDED — 2 finding(s) against a declared level of 0"* | controls 1/1 | files 5180/500 · scaffold headers 10/1 |

⛔ **`check-no-hidden-mock` findings — TWO, not the audit's one:**
1. `M-B` — `packages/core-app-model/src/annotations/AnnotationStore.ts`: scaffold header, dated
   2026-08-24, **no owner** (*"a date alone buys nothing"*). Parent of the repo's only persisted
   constraint family.
2. `packages/site-parcel-data/src/geometry/blockRing.ts` — forbidden-to-production field
   `tJunctionTolerance_m`. ⛔ **OUT OF REACH of every universal-editor lane (audit R9).** Named so
   the breach is not read as one finding and not mis-attributed.

⭐ **The lesson recorded in C74's §6 banner:** C74 wrote *"UNBUILT **at stamp time (2026-08-12)**"*
— **dated, correctly**, and C71 §6 praises it for exactly that. It **still** got cited in 2026-09
as evidence the gates were unbuilt. *A dated claim that is never re-read still rots in a reader's
hands.*

### 1.3 — C25 §1.1 is false at its own site

§1.7 has said since 2026-08-23 that *"§1.1 … is FALSE of the path users actually use"* (L-8560,
OPEN) — **but §1.1 carried no marker**, and §1.1 is where a component-IFC-mapping designer lands.

Measured 2026-09-01: `packages/file-format/src/export/ifc/IfcExporter.ts` declares
`schema?: 'IFC2X3' | 'IFC4'`, defaults `'IFC4'`; `ExportIFC.ts` repeats it. **IFC4X3 is not
expressible on the shipping pipeline.** `exportProjectToIFC4X3` (Pipeline B) has **zero non-test
callers** — the definition, a barrel re-export, one comment.

⭐ **New finding this lane added (C25 §1.7.1):** the component format ships an authoring-time IFC
binding — `ifc-mapping.json` as a ZIP entry, `ifcMapping` on every parameter — and

```
grep -rn "ifcMapping\|ifc-mapping" --include=*.ts packages/file-format/src/export plugins/ifc-export/src
   -> NO OUTPUT
```

**Neither exporter reads it.** The only carriers are `@pryzm/family-loader` and
`@pryzm/family-instance`, which have **no importer outside themselves** on any axis.
So `ifcMapping` is **persisted authoring intent with NO reader** — and choosing the pipeline is
cheapest now, because nothing downstream exists to migrate.

### 1.4 — C67 §1.2 re-measured: a hard-0 ratchet is breached

`npx tsx tools/ga-gate/check-chat-capability-coverage.ts` → **RC=3**.

| Measure | 2026-09-01 | 2026-08-19 |
|---|---|---|
| registered bus commands | **361** | 325 |
| chat capabilities | **77** / 52 commands | 56 / 35 |
| `CHAT_UNAVAILABLE` | **61** | 52 |
| classified | **235** (B 131 · C 49 · D 48 · E 4 · F 3) | 238 |
| **UNDECLARED** | 🔴 **13** (baseline **0**) | 0 |
| maturity | 77 · 27 · 21 · 1 · 4 | 56 · 17 · 16 · 1 · 4 |

Ratchets: unresolved examples 1/1 · unpinned 7/9 · **undeclared spatial reach 5/2** 🔴 ·
unclassified global routes 1/1 · resolver case arms 30/30 · **unreachable properties 47/42** 🔴.

⚠ **Two rows corrected the contract in BOTH directions** — *spatial reach* fell 26→5 while its
baseline fell 24→2 (still exceeded); *unreachable properties* went 40/42 **below** → 47/42
**exceeded**. A row the contract recorded as healthy is now the breach.

⛔ **The 13 undeclared include two element families and two compound systems that each carry a
canonical contract** — `balcony` ×4, `bathroomPod` ×2, `lift` ×3 (C104), `room.*` ×3,
`view.setCategoryVisibility`. They reach the chat as *"I'm not sure how to help with that yet"* —
the founder-reported defect this gate exists for, recurring against families minted after it.

---

## 2 — L-666: CLOSED at the contract, gate half OWED and DATED

**The contract half is done.** C11 §3.2 gains the invariant, and **§3.2.1** carries the rule where
it was already being cited — §7.0's `FIX-WALL-ID` / `FIX-CW-ID` rows cite *"§3.2 (tools MUST
pre-generate branded IDs)"* for a sentence §3.2 did not contain. **Those citations are now true.**

**§3.2.1 states:** one minter (`createId`) · no constructed id strings · the payload-builder owns
the id (`furnitureCreatePayload.ts` is the proven shape) · **a DERIVED-id category, declared and
allowlisted** (the `LiftAssembly` precedent) · no closing a recurrence by loosening a schema regex.

### The measured baseline (C11 §3.2.1e)

Scan: `.ts`/`.tsx` under `packages`, `apps`, `plugins`, `src`; excluding `.d.ts`, tests and
`packages/schemas/**`; comments excluded. **5,180 files · 14 candidates · 3 REAL:**

1. ⛔ `packages/core-app-model/src/views/DefaultViewsManager.ts` — `_annotationId()` returns
   `` `annotation_${_ulid()}` `` against a **hand-written `Math.random()` ULID generator in the same
   file**. Bypasses `createId` **and** mints a second ULID implementation. **L-145's exact shape,
   after L-145 was fixed.**
2. ✅ `packages/geometry-lift/src/LiftAssembly.ts` — `derivedShaftPartId`, `derivedLandingOpeningId`
   — **DERIVED and compliant** with §3.2.1d(1)(2)(3); owes only the allowlist entry.
3. ⛔ `packages/room-topology/src/PlanarTopologyEngine.ts` — `` `room_${idx}_${Date.now()}` ``.
   Cannot satisfy `^room_[0-9A-HJKMNP-TV-Z]{26}$`. ⚠ Whether it reaches a Zod parse is
   **NOT MEASURED** and is not claimed.

**11 non-violations, named so the next scan does not re-raise them:** `SyncStateEngine.ts` ×4
(derivation-map keys) · `BrowserDataHelpers.ts` ×1 (`'floor_'` in a substring test) ·
`apps/bench/.../dimension-schema.bench.ts` ×5.

### ⭐ The finding that argues for the gate rather than for more fixes

**All three violations §7.6 named are CLOSED** (verified: the kitchen/wardrobe/`randomUUID`
literals survive only as comments describing their own fixes) — **and the class produced two new
members while they were being fixed.** `grep -rn "no-id-casts"` → **six hits, all in documents,
zero in source.** ADR-0001 §4 scheduled it for S07 in 2026-04.

### ⛔ OWED: `tools/ga-gate/check-id-minting.ts`

**NOT BUILT.** Specified completely at **C11 §8.1.1** — I0 (exit-2 floor incl. *the `ElementType`
union parsed with ≥30 members*) · I1 (named shrink-only ratchet **by file and symbol**, never a
count) · I2 (no second ULID implementation — `DefaultViewsManager._ulid()` is the negative fixture)
· I3 (derived allowlist symmetric, stale entry exits 3) · I4 (one minter symbol), plus what it
cannot see. Status written **dated**, per C71 §6's authoring rule.

**Deliberately not written by this lane:** Phase 3 is *"no code, no UI"*, and a gate landed without
its per-arm negative test recorded is what C74 §6.2 calls UNPROVEN. **L-666 does not fully close
until that gate exists and every arm has been watched failing.**

---

## 3 — Decisions this lane deliberately did NOT take

| Open decision | Where recorded | Why not taken here |
|---|---|---|
| **D11** — does a new host surface amend C15 or get a sibling? | **C15 §2.2.3** | ADR-0376 ruled D1–D5 only. §0.1.1's closing rule is **consciously KEPT**. ⭐ New input for whoever rules it: the question is no longer *"generalise or mint a sibling"* — a third mechanism (`OpeningData`) already ships **and is governed by no contract**. |
| **D8** — is the sketch profile a C74 §4.2(c) SOLVING family? | **C74 §4.6.2** | Answered as far as evidence allows: eight of twelve close at (a)/(b); four are a **CANDIDATE** whose proof obligation (§4.6.2b) is **not executed**. §4.5's standing verdict is unlifted. |
| **D6** — nesting | C71 §2.7 (`dependsOnDefinition`'s consumer) | named, not decided |
| Adding `rise` to a segmental arch | **C86 §10.1 PR-9** | ⛔ it **amends PR-8** — a contract change, not a feature. The derived alternative must be refuted first. |

### ⛔ One thing the audit asked for that I did NOT do literally, and why

The audit says *"add `instantiates`, `specializes`, `dependsOnDefinition` to **§2.1 REQUIRED**."*
**I put them in a new §2.7 instead, admitted-on-arrival.** C71 §2.5 forbids writer-first unparking
and §2.6 requires writer + typed reader in one PR; `check-graph-write-coverage` is **already RC=3 at
a shrink-only ledger of 0**. Listing three consumer-less families as REQUIRED would have turned the
gate redder **because a document said so** — a regression with a contract citation attached
(`[[refusing-half-needs-its-escape-hatch]]`). §2.7 writes all four §2.6 obligations **in advance**,
which is the valuable part, and each family joins §2.1 in the PR that lands its writer and reader.

---

## 4 — Gate readings (foreground, redirected, `$?` read immediately)

### `check-contract-index-equivalence.ts` → **RC=3**, and **0% attributable to this lane**

```
contract FILES on disk : 111 · index ROWS in README : 91 (max id C112)
A FILE WITHOUT ROW : 21 (baseline 18)   B: 0 (hard 0)   C: 0 (hard 0)   D: 0 (hard 0)
```

**Arms B, C and D are hard-0 and CLEAN.** Arm A is 21 vs 18. **Proven by SET comparison, not by a
count:** the gate prints its arm-A set as `C81 C84 C85…C99 C100 C110 C111 C112`; the gate's own
header pins the baseline 18 as *"C81, C84, the whole C85–C99 per-element block, and C100."*
**The delta is exactly `C110 C111 C112` — lane 3A's three new mint files, untracked, awaiting the
orchestrator's README rows.**

`git status --porcelain docs/02-decisions/contracts/` → **13 `M` (all mine, all pre-existing files)
+ 3 `??` (C110/C111/C112, not mine)**. This lane minted nothing and therefore has **no index row**
to hand the orchestrator. C84, C86 and C100 are *inside* the baseline 18 and were modified, not
added — no effect on arm A.

### `check-contract-cited-paths.ts --list` → **RC=3**, and **0 new UNRESOLVED from this lane**

```
citations 3581 -> 1848 distinct · RESOLVE 1330 · UNRESOLVED (arm A) 507 (baseline 490)
UNRESOLVED but EXEMPT 11 (arm B — disclosure only)
```

**Attribution was executed, not assumed.** Every citing site in the gate's full `--list` output was
matched against the added-line ranges of all 13 files from `git diff -U0`:

> `UNRESOLVED CITATIONS ON LINES THIS LANE ADDED: 0`

The first run reported **2**, both introduced by this lane, and **both were fixed rather than
absorbed**: `tools/ga-gate/check-id-minting.ts` is now marked **PLANNED** (the gate's own sanctioned
exemption for a specified-but-unbuilt artefact — it appears in arm B, disclosure-only), and C69's
bare `src/handlers/` fragment was reworded to *"the plugin handler roots"* so it is no longer parsed
as a repo path. Arm A moved **509 → 507** across those two fixes.

**Lane 3A's three contracts also contribute 0** to arm A — their only unresolved citations
(`check-canonical-length-unit.ts`, `check-parameter-precedence.ts`) are both `[PLANNED]`-exempt.

⛔ **So the +17 over baseline 490 is PRE-EXISTING DRIFT AT HEAD, not this wave.** Supporting
evidence: `git status --porcelain | grep -E "^ ?D"` → **no deletions**, so no cited path stopped
resolving because of working-tree changes; and every one of the 507 sits on a line that existed at
HEAD. **It is nonetheless a breached shrink-only ratchet and is never absorbable as debt**
(`§RATCHET-EXCEEDED-IS-NEVER-DEBT`, R7 / L-836). **It needs a named owner. This lane is not it.**

### Falsification control for the C15 correction

The correction rests on greps finding things. The control asks whether the same grep shape can find
*nothing* when there is nothing:

```
grep -rn "slabPenetration|ShaftOpeningCommand|penetration.create" --include=*.ts packages apps plugins src
   -> RC=1, 0 lines        # a REAL declared absence looks like this
grep -rn "opening.create"  --include=*.ts packages apps plugins src
   -> RC=0, 130 lines      # the mechanism C15 said did not exist
```

⚠ Both were run **without a pipe**. The first attempt piped to `head` and returned **RC=0 for an
empty result** — the exact measurement hazard audit R4 names, reproduced and caught in this lane.

### Gates NOT run, stated so a blank is not read as "fine"

`check-graph-write-coverage` (C71's own gate) was **not re-run** — this lane deliberately added no
`RelationshipType` member, so its reading is unchanged by these edits; the audit's RC=3 stands.
`check-verb-register`, `check-epsilon-policy`, `check-predicate-canonical`,
`check-deterministic-regeneration` were **not run** — no code changed.

---

## 5 — Owed after this lane

1. ⛔ **`tools/ga-gate/check-id-minting.ts`** — specified at C11 §8.1.1, negative test per arm
   required. **L-666 is not fully closed without it.**
2. ⛔ **Two live id-minting violations** — `DefaultViewsManager._annotationId()` and
   `PlanarTopologyEngine`'s `room_${idx}_${Date.now()}`. Both are code fixes, out of Phase 3's scope.
3. ⛔ **`check-no-hidden-mock` RC=3** — `AnnotationStore`'s owner-less scaffold header is fixable by
   this programme; the `site-parcel-data` finding is **not** (audit R9).
4. ⛔ **C67's 13 UNDECLARED verbs** — a `ChatCapability` or a readable `CHAT_UNAVAILABLE` reason for
   `balcony.*`, `bathroomPod.*`, `lift.*`, `room.*`, `view.setCategoryVisibility`. **Never a raised
   baseline.**
5. ⛔ **`check-contract-cited-paths` arm A at 507/490** — pre-existing, unowned, and a breached
   shrink-only ratchet.
6. **L-8560** (the two IFC pipelines) is now a **hard precondition** on component IFC work
   (C25 §1.7.1), not a background gap.
7. **ISSUE-LOG rows** the orchestrator should append: the C15 §0.1.1 false-clearance defect; the
   `ifcMapping`-has-no-reader finding; the two new id-minting violations. *(This lane owns no
   `ISSUE-LOG.md` edit — it is shared.)*
