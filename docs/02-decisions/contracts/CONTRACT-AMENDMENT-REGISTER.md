# CONTRACT AMENDMENT REGISTER — measured defects awaiting amendment

- **Status**: LIVE WORKING REGISTER — not a contract. It records what is **measured to be wrong**
  in the contract suite, so the amendments can be applied in priority order rather than all at once.
- **Date opened**: 2026-08-18
- **Method**: four read-only sweep lanes (C01–C20, C21–C50, C51–C75, C77–C84 + index) plus four
  element audits. **Every entry below was measured** — `ls`, `grep -n`, or the gate's own exit code
  read from a file. Claims that could not be verified are marked **NOT MEASURED** and are findings,
  not gaps.
- **How to use**: work top-down. Rank is by **blast radius** — a false claim that sends an engineer
  to *rebuild something that exists* or to *delete something live* outranks a stale count.

---

## 0. Why this register exists

Four contracts were found factually false within an hour of each other, by four independent lanes,
and **each had already propagated into a further document**. That is not four mistakes; it is a
missing control.

**The three defect shapes, all measured, all recurring:**

| Shape | What it looks like | Why review misses it |
|---|---|---|
| **A — "NOT BUILT" outliving the code** | contract stamped before the feature landed, never re-read | the claim was true when written |
| **B — one-axis reachability** | *"zero importers"* → deletion order | the count is correct; the conclusion is not |
| **C — declared but never called** | *"called every frame by the render loop"* | the declaration exists, so grep finds it |

⭐ **The cheapest durable fix, and it would have caught 119+ of the defects below:** a gate asserting
that **every `tools/ga-gate/*.ts` and `packages/*/` path cited anywhere in
`docs/02-decisions/contracts/` resolves on disk**, or carries an explicit `PLANNED` marker.
*Proposed as L-960.*

---

## 1. ⛔ RANK 1 — THE INDEX ITSELF

> **This is the highest blast radius in the suite.** CLAUDE.md calls
> `contracts/README.md` *"the authoritative enumeration — always defer to it over any range
> written here."* An index that is wrong outranks any single wrong contract.

| Claim | Where | Stated | **Measured 2026-08-18** |
|---|---|---|---|
| suite range | README row 4 | `C01–C83 + C24.1` | **98 files**; C84 + C85–C99 outside the range |
| file count | README §"69 contract files" | `69` | **98** |
| ADR count | README rows 5, 27 | `251` | **267** |
| SPEC count | README rows 6, 28 | `92` | **95** |
| suite range | **CLAUDE.md Governance** | `C01–C68 + C24.1` | **~30 contracts outside the stated ordering** |

**Files with NO row in the table:** C81, C84, and every landed per-element contract
(C85, C87–C99).

⚠ **CLAUDE.md's error is the dangerous one.** An agent reading it literally ranks **C84 below an
ADR** — and C84 binds every PR touching an element family. This is the *third* recurrence of the
same shape (C67 → C81 → C84/C85–C99).

**STATUS: ✅ BANNER APPLIED** to README rows 4–6. **CLAUDE.md still owed.**

---

## 2. ⛔ RANK 2 — C84's OWN #1 SEVERITY ROW IS FALSE

**C84 §4 ranks *"lighting never persisted"* as severity 1 — "the work itself, lost on every save".
It is false, and has been for three months.**

| File | `grep -ci lighting` |
|---|---|
| `packages/persistence-client/src/loader/ProjectSerializer.ts` — **DEAD, app never builds it** | **0** ← what C84 measured |
| `apps/editor/src/engine/persistence/ProjectSerializer.ts` — **LIVE** | **9** |
| DEAD `ProjectLoader.ts` | 0 |
| LIVE `ProjectLoader.ts` | 18 |

Lighting has serialized since **`§PERSIST-LIGHTING`, 2026-05-22** (`ProjectSerializer.ts:1025-1031`,
`:1106`) — **three months before C84 was stamped**.

⭐ **How the error survived TWO attempts to fix it.** The original claim measured the dead
serializer. My *correction* then measured the **dead serializer against the LIVE loader** — two
different files — which is why *"the LOAD half exists and the SAVE half does not"* read so
convincingly. `initPersistence.ts:94` names the trap explicitly, and the repo had already recorded
a **prior casualty** of the identical mistake (a C23 provenance fix landed on the dead copy).

**This is C84 §8.b committed by C84, on its own severity-1 row.**

**What survives, and is sharper:** the real defect is a **lossy RESTORE** — 13 authored fields
(12 `*Params` blocks + `emission`) written to disk and discarded on load, because
`CreateLightingPayload` has no slot for them. Narrower, still live, and **invisible while the false
claim held attention.**

**AMENDMENTS OWED:** retract severity row 1; set §4 `lighting` EI-6 to ✅ citing C96 §3.1; re-measure
every serializer/loader `file:line` in §0, §1.2, §4 against the `apps/editor` path; re-rank the
severity table from what survives.

---

## 3. ⛔ RANK 3 — C84 EI-11 INVERTS THE SECTION IT CITES

C84 `:542` states C73 §5.1 **E1** *"records that the canonical tolerance module is specified and not
yet built"*.

**E1 says the opposite.** C73 `:308` — *"**E1** | hard | the declared tolerance module **exists and
is exported** from `packages/geometry-kernel`"*.

And **C73 was corrected at 11:11 today; C84's mtime is 11:37** — the inversion was written
**26 minutes after** the correction landed.

`packages/geometry-kernel/src/tolerance.ts` exists (10,389 B, commits `3dba3557`/`07173cdf`/
`f580a721`, 2026-08-12/13), exported at `index.ts:22-34`.

**What still stands, and becomes binding rather than aspirational:** the harness's
`const TOL = 1e-4` (`:107`) is exactly the unnamed, unit-unqualified literal C73 §2.2/§2.3 forbid
and §5.1 **E2**'s ratchet counts. **There is no longer an "unbuilt module" excuse.**

---

## 4. ⛔ RANK 4 — C77 CALLS A GATE UNBUILT; IT IS FAILING MERGE

C77 `:26` / `:189` (and **propagated verbatim to README:148**):
*"`tools/ga-gate/check-secrets-register.ts` — **UNBUILT at stamp time (2026-08-12)**"*.

**Measured** — `npx tsx tools/ga-gate/check-secrets-register.ts` → **EXIT 3**:

> `FINDING A — WORKER_CONCURRENCY is READ (apps/bake-worker/Dockerfile:32) but has NO declaration row`
> `DRIFT — docs/04-reference/SECRETS-REGISTER.md is STALE`
> `→ [3] RATCHET EXCEEDED — 13 findings against a declared level of 12.`

Both the gate **and** the register exist. Per `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)`, **exit 3 is
never absorbable.** A contract cannot describe as unbuilt a gate that is currently blocking merge.

**Every normative clause of C77 stands** — §1.2, §1.3, §2.2, §2.3, §2.4 are unchanged and correct.
**Only the build-status line is false.**

---

## 5. ⛔ RANK 5 — C84 §5 QUOTES A READING FROM A MISCONFIGURED GATE

C84 `:981` states `check-verb-liveness` reads *"PROVEN 7 / 326; UNPROVABLE-NO-STORE 109;
UNKNOWN 210."*

**Measured: REAL EXIT = 2.** The gate emits **no counts at all**. Its terminal line:

> *"⚠ MISCONFIGURED — the read-back harness exited 1. CA-21 admits no substitute for an executed
> dispatch, so a gate that cannot run it has NOT established its subject."*

Root cause: a vitest fork-worker timeout on
`tools/rac-conformance/runtime-harness/__tests__/liveness.probe.ts`.

⛔ **The quoted figures are NOT REPRODUCIBLE and must not be inherited by any C85–C99 contract** —
C84 §6 requires all fifteen to carry per-verb liveness rows sourced from this gate.

---

## 6. ⛔ RANK 6 — C32: DXF **AND DWG** SHIPPED ELSEWHERE; THE CONTRACT ORDERS BOTH BUILT

C32 §7 calls `plugins/dxf/` a scaffold *"contributing nothing"*. **True** (5 `.ts` files). **The
conclusion is false** — the subsystem shipped in **`packages/file-format`**, a package C32 never
names: `DxfParser.ts`, `DxfGeometryBuilder.ts`, `import/dxf/DwgImportAdapter.ts`,
`DxfLayerStore.ts`, plus `DxfOverlayStore.ts` / `DxfPlanViewProjector.ts` / `DxfToBimTracer.ts`
which the contract does not mention at all. Public API at `index.ts:80-83`; dependency
`dxf@^5.3.1`.

⛔ **The DWG licence decision is already made, and differently.** C32 prescribes an
ODA-Teigha-vs-LibreDWG tier split. Shipped: `POST /api/import/dwg` → **Autodesk Platform Services**
(`server.js:2676`, `:2682-2686`). **Neither ODA nor LibreDWG is a dependency. Do not procure a DWG
licence against this contract.**

⚠ Also exposes a **code** defect: `DxfParser.ts` and `DxfGeometryBuilder.ts` exist **twice**.

**STATUS: ✅ BANNER APPLIED.**

---

## 7. ⛔ RANK 7 — C25: THREE IFC PHASES ORDERED AGAINST DELIVERED CODE

C25 §2:35 — *"IfcSite is empty; IfcSpace is absent; IfcZone is absent. These are the master plan
IFC-α-1/α-2/α-3 gap-fill phases."* **All three false**: `hierarchy.ts:283,318` emits `IFCSITE` with
full attributes; `exporters/space.ts` and `exporters/zone.ts` both exist **with tests**.

**STATUS: ✅ BANNER APPLIED.**

---

## 8. ⛔ RANK 8 — C27: DELETE A LIVE COMPONENT FOR A REPLACEMENT THAT DOES NOT EXIST

C27 §9 Phases γ/δ order `PropertyInspector` deprecated then **deleted**, in favour of
`ElementInstanceDashboard`.

- **`ElementInstanceDashboard` — ZERO occurrences repo-wide.** `apps/editor/src/ui/inspect/dashboards/`
  does not exist. **None of C27 §6's seven dashboards was built.**
- `PropertyInspector` is **live on three of C84 §3.5.1's four axes** — imports 3 live submodules;
  named in `apps/editor/migrations/sunset-pryzm1.json:50` (**build-graph axis — no import census
  sees this**); mirrored by `PropertyPanelAdapter.ts:5,60,68` (**call axis**).
- ⚠ **"(80 files)" is wrong by ~6×** — measured **13** + `PropertyInspector.ts` = **14**. The
  migration was sized against a number six times the real one.

**And C27 has substantially SHIPPED while labelling its files "(NEW)"**: `InspectSelectionStore`,
`IsolationStateStore`, `IsolationIntent`, `IsolationAnimator` (with tests),
`packages/schemas/src/inspect/`, and a live `ModelTree.ts:108`. Genuinely absent:
`SpatialRelationshipResolver`, `InspectBridge`.

---

## 9. ⛔ RANK 9 — SYSTEMIC: 15 CONTRACTS EXTEND A GATE THAT NEVER EXISTED

`scripts/ci-check-spans.ts` and `tools/ga-gate/check-spans.ts` — **both ABSENT**. CLAUDE.md already
records that the four `scripts/ci-check-*.ts` paths *"never existed, see L-812"*, and **C10:158 was
already amended** to redirect to the real gate. **The correction never propagated.**

Still standing: **C23:116** (worst — concludes *"no new gate"*, so P8 coverage for the entire AI
audit trail is declared satisfied by a file that never existed), C31:168, C33:404, C34:502,
C35:460, C36:494, and C38–C49 (twelve more).

**The real gate is `tools/ga-gate/check-otel-spans.ts`** — and it counts **handler FILES**
(255/256) against a `HARD_FLOOR` of 213, *not* "every exported function". Extending it is not a
one-line change.

**Four more aliases pointing at real gates under wrong names** — *do not build a second copy*:

| Cited | Real | Citing |
|---|---|---|
| `check-schema-purity.ts` | **`check-domain-purity.ts`** | C24:183, C26:169, C34:500 |
| `check-direct-store-writes.ts` | **`check-no-direct-store-writes.ts`** | C24:185, C24.1:99, C34:501 |
| `check-three-import-boundary.ts` | **`check-three-imports.ts`** | C32:217, C32:468 |
| `check-commandmanager.ts` | **`check-no-commandmanager.ts`** + `check-commandmanager-any.ts` | C32:211,469 · C37:49,358 |

---

## 10. ⛔ RANK 10 — C47 vs C05: A VERSIONING SCHEME THE FORMAT DOES NOT USE

C47 §1.1 mandates `formatVersion: SemVer`. **The shipped format uses a monotonic INTEGER named
`schemaVersion`**: `manifest.ts:105` (`z.literal(1)`), `PryzmArchive.ts:25,103,135`,
`ProjectSerializer.ts:113,1098,1272` + `MigrationEngine.getStoredVersion()`. The **only**
`formatVersion` in the repo is on the family-pack schema, and it is `z.literal('1.0')` — not SemVer.

**C05 owns the `.pryzm` envelope** and the shipped code implements its model. C47 legislated a rival
scheme without superseding it. **Until an ADR reconciles them, C05 governs and C47 §1.1/§1.2/§2 are
a PROPOSAL.** C47's *policies* — the 12-month deprecation window, migration-chain irreversibility,
writer-vs-feature version — all stand and have a real substrate in `MigrationEngine`.

---

## 11. OTHER MEASURED DEFECTS

| Contract | Defect | Measured |
|---|---|---|
| **C04 §3.5.2** | *"`setViewDistance` called every frame"* | **ZERO callers** — 3 occurrences, all in its own file. LOD tier is constant for the session. ✅ **APPLIED** |
| **C14 LP-09** | orders `legacy-shim` deleted, *"zero importers"* ×4 | 4 live non-import refs incl. a workspace dependency and the exclusion path of the **P3 gate, which is RED**. ✅ **APPLIED** |
| **C73 §0.1, §5** | 3 gates *"SPECIFIED, NOT BUILT"*; *"no epsilon"* | all 3 exist; 2 read this session, one at **exit 3**. ✅ **APPLIED** |
| **C03 §4.3** | *"No `affectedStores`/patch metadata"* on Path A | `types.ts:605` declares it **non-optionally**; L-947 is an instance. ✅ **APPLIED** |
| **C79 §6** | proposes extending `WallRegionDetector` | **file deleted 2026-08-12**, citing C79 §6.5 as its authority — the exit condition is discharged |
| **C83 §0.2.1** | *"`clearGraphAuthoritative` has 0 production callers"* | **FALSE** — `RoomTopologyObserver.ts:351` calls it, added citing C83's own finding. ⚠ **C72 §4 carries the same claim** |
| **C84 §4B** | *"four families"* lose audit-neutrality | **EIGHT** — the source comment ends in an ellipsis that was dropped. Owner is **ADR-0319 §2**, and **C75 §2.9 forbids citing C75** |
| **C84 EI-7d** | 9 named holes; §4 says 11 | **12 of 26** `StoreKey` members. And `affectedStores` is typed `string`, not `StoreKey` — a second, disjoint hole set |
| **C84 EI-1a** | *"24 keys"* | **38 key spellings** → 21 `window.*` globals |
| **C84 EI-7e** | *"single highest-value open question"* | **SETTLED** — 14 authored room fields survive re-detect (Jaccard on `boundingWallIds`). Residual is the audit envelope only |
| **C21** | *"No EPW reader. No NOAA reader. No ClimateStore"* | **3 of 4 false**; `runtime.climate` has 0 hits; status stated **three ways** |
| **C22** | DB columns/tables asserted present | `pryzm_users` has 10 columns, none of them these; **no `audit_log` table**; `pii-registry.ts` MISSING |
| **C23 §1.1** | central invariant | `packages/ai-host/src/**` has **zero** provenance calls — **AI calls are not audited**. Rival vocabulary vs CANONICAL **C75**, zero cross-citation |
| **C43 §57** | 4 marketing pages | **3 no longer exist** (C51 apex split); only `404.astro` remains |
| **C50** | `.tsx` component paths | `apps/editor/src/` contains **1 `.tsx` file total** — this is a vanilla-TS DOM codebase |
| **C36 :495** | *"`check-visibility-intent.ts` already exists"* | it does not |

---

## 12. COVERAGE HONESTY — what was NOT measured

**Two axes were measured exhaustively across C21–C50:** every cited gate path (**99 distinct → 2
exist**) and every cited `packages/*` path (**43 distinct → 21 exist**).

**Deep-read:** C21–C25, C27, C29, C32, C33, C36, C39, C43, C47, C50, C73, C77, C79, C83, C84, and
C01–C20 in the first sweep.

⚠ **Body NOT MEASURED** (gate/package axis only): C24.1, C26, C28, C30, C31, C34, C35, C37, C38,
C40, C41, C42, C44, C45, C46, C48, C49 — and **C78, C80, C81, C82**, which received a
falsehood-pattern sweep plus spot checks, not a line-by-line audit.

**C78 (944 lines) against C71/C72 is the highest-value unstaffed read** — it is the largest and the
most likely to be restating rules another contract owns.

---

## 13. THE PATTERN, STATED ONCE

C21–C50 were bulk-stamped 2026-08-09 as **forward-looking specifications written in normative
present tense**. That misleads in **both directions at once**:

- Where the feature **never shipped**, the contract reads as describing running enforcement.
  **97 of 99 cited gates do not exist.** An engineer citing *"per C41 §6, `check-event-no-rename`
  blocks this"* is citing nothing.
- Where the feature **did ship**, it shipped **somewhere else** — and the contract still orders it
  built. That is the C84 EI-10 defect, **minted by prose rather than by a coder**.

**Neither shape is visible from inside the contract. Both are one `ls` away.**
