# LANE 4B — THE SCHEMA DELTA + MIGRATORS

**Date:** 2026-09-01/02 · **Owns:** `packages/file-format/src/family-schema.ts`, `family-types.ts`,
`family-migrations/**` · **Authority:** ADR-0376 (D1–D5 + D9/D10), audit §12 Phase-4 row 4B,
**C111** (the model), **C112** (connectors), spec §61/§63–§70/§76.
**Gate:** §76 **B** (no duplicate source of truth) · **C** (semantic/parametric/geometric distinguishable).

> ⛔ **Every number below was read from a redirected file with `$?` taken immediately.** No reading
> in this document came through a pipe.

---

## §0 — THE HEADLINE

**The lane's own acceptance test could not have run, and the suite that was supposed to police it was
executing different code from the source under review.** Both were found before any deliverable was
claimed, and both are recorded here because each would have turned a real result into a false one:

1. **`__tests__/family-round-trip.test.ts` — the suite C111 §1.2 cites as the PROOF that ids survive
   save/load — collects ZERO TESTS at HEAD.** It imports the package barrel, which drags in
   `src/import/PDFToImageConverter.ts` → `pdfjs-dist` → `ReferenceError: DOMMatrix is not defined`
   under the package's own `environment: 'node'`. Pre-existing; measured at this lane's baseline
   **before any edit**. It silently disables a **second** suite too — `@pryzm/family-loader`'s
   `loadFamily.test.ts`, same root cause, also zero tests.
2. **L-12876 fired exactly as the brief warned.** After the source edits, the migration suite reported
   **31/31 green while asserting on a document field the source had already deleted.** It was reading
   the stale committed `.js`. Proven by execution, not inferred — see §5.

---

## §1 — WHAT LANDED

| Lane-row item | State | Where |
|---|---|---|
| Fix `introduce-expression` | ⭐ **INHERITED — verified, NOT redone** | §2 |
| `formatVersion` mechanism (C111 §8) | ✅ | §3 |
| `formatVersion` bump + registered migrator | ✅ `1.0 → 1.1`, `v1_0-to-v1_1.ts` | §3 |
| `semanticClassId` | ✅ manifest, `.optional()` | §4 |
| `boolean` solid-feature kind (D-7) | ✅ reuses the FROZEN `BooleanOp` | §4 |
| `Representation[]` | ✅ 6 kinds × `derived\|authored` | §4 |
| `Connector[]` (C112) | ✅ **pose deliberately absent** | §4 |
| `PropertySet` | ✅ separate from parameters | §4 |
| `featureEdges[]` | ✅ **declared inert** (D7 OPEN) | §4 |
| `FamilyCategorySchema` 8 → toward §61 | ✅ **8 → 20** | §4 |
| Reconcile `document.defaults` (D-5) | ✅ **removed**, with its 3 ops | §4 |
| Round-trip pack → unpack → identical `schemaHash` | ✅ + falsifier | §6 |
| `.js` artefact sync (L-12876) | ✅ **15 files × 4 extensions** | §5 |

**Suite: 31 → 53 tests, RC=0.** Downstream: `family-runtime` **88 pass**, `family-instance` **5 pass**.

---

## §2 — WHAT I DID NOT REDO

The lane row's first item is *"⛔ Fix `introduce-expression` so the migrator actually does what its
header claims"*. **It was already fixed in Phase 3 and I did not touch it.** Verified rather than
assumed, per the standing rule to check the mtime of anything inherited:

- `git log --oneline -3 -- .../ops/introduce-expression.ts` → **`569e482e`** (the Phase-3 commit).
- `.ts` mtime **2026-09-01 18:06:08**, `.js` mtime **18:54:00** — the artefact is *newer* than the
  source, i.e. the Phase-3 lane's narrow sync covered it.
- The `§SUPERSEDED-DEFAULT` block is present in **both** the `.ts` and the `.js`, and the two agree.

The lane built on it: `supersededDefault` already existed in the schema and is carried through v1.1
unchanged, still `.optional()` and **not** `.default(null)` (C111 §5.4-a).

---

## §3 — THE BLOCKER: `formatVersion` WAS A ZOD LITERAL

C111 §8 records that this made **every legal migrator fail its own exit gate** and the
`unsupported-future-version` branch **unreachable for every input**. Both fields are now a
regex-validated `MAJOR.MINOR` string (`§FORMAT-VERSION-TABLE` in `family-schema.ts`) with
`parseFormatVersion` / `compareFormatVersion` / `classifyFormatVersion` /
`isSupportedFormatVersion` / `formatVersionRefusal`.

Three properties were built deliberately and each has an arm:

- **`compareFormatVersion` returns `null`, never `0`, against a non-version.** Collapsing them
  re-creates the defect §8.1 names.
- **`unparseable` and `future-major` are DIFFERENT classifications.** A malformed file and a
  too-new file are different facts; the old code told the user the wrong one.
- **The refusal names both numbers and the route back** (C16 CA-18): *"this file is format 2.0;
  this PRYZM writes 1.1 and can read 1.0, 1.1 … upgrade PRYZM to open it."*

### §3.1 — Nine casts were lying to the compiler

Every migrator in the package ended `formatVersion: to as '1.0'`. **Nine sites**, each asserting to
TypeScript that the version it produced was `'1.0'` regardless of what it declared. That cast is
D-1's type-level face: it is what let a framework that could not bump a version compile cleanly.
All nine removed.

### §3.2 — ⚠ ONE FILE OUTSIDE THE OWNS COLUMN WAS TOUCHED, AND WHY

**`packages/file-format/src/family-unpack.ts` — one branch condition.** It read
`if (manifest.formatVersion !== '1.0')`. Left alone, the bump would have made **every v1.1 file this
build itself writes** unreadable — the same defect one version later. C111 **§8.4-c** requires that
branch to be reachable *and* covered by a test feeding `unpackFamily`. The change is the single
comparison plus its import; no other line of that file moved. No other Phase-4 lane row names
`packages/file-format`, and the file is on neither the serialize-only list nor the collision boundary.

---

## §4 — THE DELTA, AND THE FIVE PLACES RESTRAINT WAS THE ARCHITECTURE

Additions are listed in §1. What is *not* there is the part worth reviewing:

1. **The connector stores NO pose.** C112 §2.3 is a §76 gate B ruling, not a simplification: the
   host's frame is the authority, rake included, and a stored copy goes stale with nothing to say so.
   There is an arm asserting the schema **strips** `position`/`normal`, so a pose cannot be persisted
   even by accident.
2. **`allowedHostClasses` is `.optional()`, and the optionality is load-bearing.** C112 §2.2: empty
   means *"joins nothing"*, missing means *"not yet declared"*. A `.default([])` would collapse
   failure and absence into one value. There is an arm that breaks if someone "tidies" it.
3. **`op` reuses the FROZEN `BooleanOp` spellings** (`union|subtract|intersect`) from
   `geometry-kernel/producers/boolean.ts`. An arm asserts `difference`/`intersection`/`minus`
   **do not parse** — that is what stops the two declarations drifting into a translation table.
   The feature is **binary**, matching `produceBoolean(op, a, b)` 1:1; N-ary folding is declared absent.
4. **`semanticClassId` is deliberately NOT a prefixed ULID.** C111 §1.1-a demands prefixes for objects
   *this* format identifies; a semantic class is C113's, and fixing a wire shape for a vocabulary that
   may well be `Uniclass:EF_25_10` is the `C103` failure mode (C112 §0.3).
5. **`PropertySet.dataType` reuses `FamilyParameterDataTypeSchema`** rather than minting a second
   quantity vocabulary — C111 §9.1-b calls that *"a declared gap here so no lane invents a third
   answer"*, and C110 §3.4 binds the runtime's `CanonicalKind` to the same enum.

**Category widening — the count in the audit row is wrong, and it is declared rather than copied.**
The row says *"from 8 toward §61's **17** creation categories"*. Counted in the spec's own §57–62
prose the creation modal enumerates **SIXTEEN**. Three already existed (Window, Door, Furniture) and
*"Generic Component"* **is** the existing `Generic` — spelling it a second way mints the C84 EI-9
duplicate. So **8 existing (frozen, none removed) + 12 added = 20**. An arm asserts every v1.0 member
still parses and that `GenericComponent` **does not**.

**`document.defaults` removed (D-5).** The compiler independently reproduced C111 §5.3's measurement:
deleting the field produced errors in **exactly three files** — `add-parameter`,
`change-parameter-type`, `delete-parameter` — **and nowhere else**. Three writers, zero readers,
confirmed by the type system rather than by trusting the contract. `seedDefault` was removed from
`AddParameterParams` too: a caller trying to re-open the second channel now fails to **compile**.
⛔ The forbidden fix (§5.3-c, adding a reader) was not taken.

---

## §5 — L-12876 FIRED, AND IT WAS PROVEN BY EXECUTION

After the source edits the suite read **31 passed / 31**, while `family-migration.test.ts` still
asserted `out.document.defaults[NEW_PAR_ID] === false` on a field the source no longer had.

A probe asserting the barrel exposes the new migrator:

```
expected 'MigrationError,MigratorRegistry,PRYZM…' to contain 'v1_0ToV1_1Migrator'
Test Files  1 failed (1)   ·   RC=1
```

**Vitest had resolved the stale `.js`. The 31 green tests were running the old code.**

**Regeneration procedure, proven faithful before use** — a fresh `tsc -p tsconfig.build.json` into a
scratch dir, then `sha256sum` against the committed artefacts of files I had **not** touched:

```
IDENTICAL  family-types.js
IDENTICAL  family-schema.js
IDENTICAL  family-migrations/registry.js
IDENTICAL  family-migrations/identity.js
```

**Regenerated — 15 files × {`.js`, `.js.map`, `.d.ts`, `.d.ts.map`}, narrow, per L-12876's warning
against touching all 98:** `family-schema` · `family-types` · `family-unpack` · `index` ·
`family-migrations/{index, identity, v1_0-to-v1_1}` ·
`family-migrations/ops/{add-parameter, change-parameter-type, delete-parameter, introduce-expression,
merge-material-slots, rebind-ifc, rename-parameter, split-type}`.

⚠ **`family-pack.js` was NOT regenerated.** It is one of the five artefacts L-12876 names as already
diverged, I did not edit its `.ts`, and regenerating it would land an unrelated behaviour change on
the production server path — the exact thing the Phase-3 lane deliberately backed out of.

**After the sync the assertion that should break, broke** (`expected undefined to be false`) — which
is what makes the subsequent green reading mean anything. Final drift check:
**all 15 files × {js, d.ts} byte-identical to a fresh compile.**

---

## §6 — FALSIFICATION

**Per-deliverable falsifiers live in the suite** (not one-off probes), so they keep working:

- **Round-trip:** corrupt one migrated field (`connectors[0].demandedVoid.width = -1`) → pack refuses
  `document-invalid` and the message **names `connectors` and `demandedVoid`**, not merely "invalid".
- **Round-trip control:** a *different* legal value changes the `schemaHash`, so hash **equality** in
  the positive arm is meaningful.
- **Pose/direction/compatibility:** arms assert the schema strips them.
- **Category:** arms assert no v1.0 member was dropped and `GenericComponent` does not parse.

**Mechanism-level falsification, with byte-identical restore:** reverting
`formatVersion: FormatVersion` → `z.literal('1.0')` in both `.ts` and `.js`:

```
BEFORE  486aaada…  src/family-schema.ts      87012963…  src/family-schema.js
FALSIFIED   Test Files 2 failed   ·   Tests 17 failed | 30 passed (47)   ·   RC=1
            (D-1 arm, the v2.0 refusal arm, and every C112 arm died)
RESTORED    486aaada…  src/family-schema.ts  87012963…  src/family-schema.js
            sha256sum -c → both OK   ·   53 passed (53)   ·   RC=0
```

---

## §7 — ⭐ NEW FINDING: `§ENTRY-GATE-BLOCKS-NARROWING` — A SECOND UNSATISFIABLE GATE

C111 §8.2 found the **exit** gate unsatisfiable. **The entry gate has the same shape and nobody had
looked.** `migrateFamily` calls `collectSchemaErrors` **twice** — entry *and* exit — with the **same
current `FamilyDocumentSchema`**. So the SOURCE document must already satisfy the CURRENT schema, and
**a migration that narrows anything rejects its own input before it runs**: the document it exists to
repair cannot get through the door.

Measured by execution, with a passing control and an isolating falsification control, using
`types: .min(1)` — a real constraint already in the schema, not a hypothetical:

| Arm | Result | Establishes |
|---|---|---|
| CONTROL — a conforming document | `ok = true` | the chain works |
| PROBE — a document with `types: []`, and a migrator whose whole job is to seed one | `ok = false`, `reason = unknown-source-version`, **`migratorRan === false`** | ⛔ it did not fail because the migrator was wrong. **The migrator never executed.** |
| FALSIFICATION CONTROL — same migrator, `validateEntry: false` | `ok = true`, `migratorRan = true`, **exit gate left at default and clean** | isolates the cause: the op is correct, the GATE refused |

**Consequences, and they are binding on the next lane:**

- **Only WIDENING migrations are expressible today.** That is *why* every field v1.1 adds is optional
  or defaulted — it is a constraint the framework imposed, not a style choice.
- **C111 §8.4-e asks D-12 (`ent_`/`con_`/`evt_` prefixes) to ride in this bump. It cannot.** Making a
  prefix required makes every v1.0 document fail the entry gate. **NOT CARRIED — OWED**, and the fix
  is a **per-version schema pair**, a mechanism change rather than a field change.
- ⛔ **`validateEntry: false` is NOT the fix**, exactly as `validateExit: false` was not (§8.4-d / R-9).
  It is the isolator. Defaulting either to false converts an unsatisfiable gate into an absent one.

---

## §8 — OWED, EACH WITH ITS OWNER

| # | Owed | Why not here |
|---|---|---|
| **C111 D-2** | The FAKE TYPE CHECKSUM — `sha256:` naming FNV-1a/32 repeated 8×, colliding on trivial input | §2.4-b puts the repair in **`family-pack.ts`** (*"packFamily already has `sha256Hex` and is async while split-type is sync"*) — **outside this lane's ownership**. Minting a second synchronous SHA-256 inside a migration op to route around that is the rival implementation **R1** rejects. ⛔ Until it lands, §2.4-c binds: no consumer may treat `FamilyType.checksum` as an integrity signal. |
| **C111 D-12** | `ent_` / `con_` / `evt_` prefixes for the shared bare-ULID space | **Inexpressible** — §7. |
| **C111 D-10** | The whole stack is CI-invisible | `@pryzm/file-format` still has **no `test:ci`**; the 53 tests proven here **do not run in CI**. |
| **NEW** | The pdfjs barrel poison | Two family suites collect **zero tests** — `family-round-trip.test.ts` (C111 §1.2's cited proof) and `family-loader/loadFamily.test.ts`. Fix is in `src/import/` or the barrel, outside this lane. |

---

## §9 — GATE READINGS

**§76 B (no duplicate source of truth)** — four duplicates refused or removed: `document.defaults`
(removed with its three writers) · the connector pose (refused; the host frame stays sole authority) ·
the boolean-op vocabulary (reused, not re-spelled) · the property quantity vocabulary (reused
`FamilyParameterDataTypeSchema`). The version fields went from **two independent strings that every
existing migrator moved separately** to a pair bumped together with a coherence refusal naming both.

**§76 C (semantic / parametric / geometric distinguishable)** — `PropertySet` (semantic, describes) is
a separate collection from `FamilyParameter` (parametric, generates), enforced by C111 §9.1-a rather
than by convention; `Representation[]` (geometric projection, `derived` by default) is separate from
`solids[]` (parametric features); `featureEdges[]` makes the parametric dependency **explicit** so
geometric document order stops being load-bearing (C111 §10.2-a).

**Not claimed:** C111 does **not** become ACTIVE. §12.1 requires D-1, D-2, D-3, D-10 **and** D-11
closed. **D-1 is closed by this lane. D-2, D-3, D-10 and D-11 are not**, and D-11 (a bus verb placing
a component) is lane 4C's.

---

## §10 — NOT MEASURED (the honest register)

- Whether `bakeFamilyInstance` refuses the new `boolean` kind **gracefully**. The schema now lets a
  window express *"frame minus glazing void"*; the bake still implements `extrude` only and is
  expected to return `unsupported-feature` per C111 §10.1. **Wiring it is lane 4D's** and this lane
  did not execute the bake against a boolean feature.
- Whether the marketplace route (`POST /api/v1/families`) accepts a v1.1 file. It runs the server
  `.js` path; the artefacts it re-exports were synced, but no request was executed.
- `apps/component-editor`'s solid/parameter stores against the widened schema — it is the rival
  runtime ADR-0376 D1 retires, and it was deliberately not adapted.

---

## §11 — INDEPENDENT RE-VERIFICATION (2026-09-02, second 4B session)

A second Lane-4B session found this document and the uncommitted tree already in place
(doc mtime 2026-09-02 00:06; every owned file modified-uncommitted). Per the standing
rule it **verified by execution rather than redid**. Transcripts: `lane-4b-VERIFY-*.txt`
beside this file; every RC below was taken from a redirected file with `$?` read immediately.

| Claim (§ above) | Re-measured | Verdict |
|---|---|---|
| Migration suites green | `__tests__/family-migrations/` → **47/47, RC=0** | ✅ |
| "Suite … 53 tests" (§1) | **53 = 47 + 6** — the two family-migrations files (25 + 22) **plus `__tests__/migrations.test.ts` (6)**, which also passes. The doc never named its denominator; now it does. | ✅ with the denominator named |
| Artefact sync (§5) | Fresh `tsc -p tsconfig.build.json` into scratch → **all 15 modules × {`.js`, `.d.ts`} = 30 pairs byte-identical** (`cmp`). The compile's RC=2 is **1,894 pre-existing strictness errors, zero in any `family-*` file**; the 30 in-package are TS5097 `.ts`-extension barrel imports present verbatim at `569e482e`. | ✅ |
| Round-trip proof + falsifier (§6) | Arms present (`§PROOF-ROUND-TRIP`, `FALSIFIER`, control). **Live falsification re-run:** weakened `DemandedVoidSchema.width` (`.positive()` dropped) in **both `.ts` and `.js`** → exactly the falsifier arm died (*"corrupting ONE migrated field breaks the round-trip and names it"*, 21/22, RC=1) → restored, **`sha256sum -c` OK on both** (`486aaada…` / `87012963…`, matching §6) → 47/47, RC=0. | ✅ seen failing, byte-identical restore |
| Downstream `family-runtime` 88 | **88/88, RC=0** | ✅ |
| Downstream `family-instance` 5 | **23/23, RC=0** — the count GREW; lane 4D landed after this doc was written. Not a defect. | ✅ (stale-low) |
| Whole-package suite | **2 failed files / 1 failed test of 277.** (1) `family-round-trip.test.ts` — the §0.1 pdfjs barrel poison, pre-existing, zero tests collected. (2) `dxf-parser.adversarial.test.ts` one 5000ms timeout **under full-suite load only; 7/7 RC=0 in isolation** — a load flake, files untouched by this lane. | ✅ both explained, neither caused here |
| Root `tsc --skipLibCheck` | **RC=0, zero errors** with the build script's `--max-old-space-size=6144`. (At the default heap it dies RC=134 OOM — heap, not types.) | ✅ |

**Footprint check:** every uncommitted path outside `packages/file-format/**` + `audit/**`
belongs to sibling Phase-4 lanes (4C/4E/4F/4G/4H findings docs are all present). No
serialize-only file and no collision-boundary path was touched by this lane. Nothing committed.
