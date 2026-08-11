# BIM 2.0 Certification Plan — readiness matrix, ranked gaps, harness plan

> **Stamp**: 2026-08-11 · **Author**: Agent BIM20 · **Status**: PROPOSAL — measurement and
> planning only, awaiting founder approval as the roadmap. **No product source was edited by
> this document's author.**
> **The directive**: the founder's BIM 2.0 directive of 2026-08-11 (delivered as the BIM20
> brief; § references of the form "directive §N" are to that brief — it is not a repo file).
> The chain it certifies: **Intent → Command → Authoritative State → Geometry → Persistence →
> Undo/Redo → Collaboration → Report.** A capability is BIM 2.0 complete ONLY when the whole
> chain is verified; partial evidence is never promoted to VERIFIED.
> **Governing artefacts** (cited throughout, never transcribed where they self-update — C64
> §2.13): [`API-VERB-REGISTER.md`](../../04-reference/API-VERB-REGISTER.md) (generated, C69) ·
> [`RAC-CONFORMANCE-SCORECARD-CAT1-5.md`](../../04-reference/RAC-CONFORMANCE-SCORECARD-CAT1-5.md)
> and [`-CATEGORIES-6-10.md`](../../04-reference/RAC-CONFORMANCE-SCORECARD-CATEGORIES-6-10.md) ·
> [`ENGINEERING-AUDIT-2026-08-11.md`](../../04-reference/ENGINEERING-AUDIT-2026-08-11.md) §17 ·
> [`SESSION-HANDOVER-2026-08-11.md`](../../04-reference/SESSION-HANDOVER-2026-08-11.md) ·
> [`DEAD-WRITE-REMEDIATION-PLAN.md`](DEAD-WRITE-REMEDIATION-PLAN.md) ·
> [`L-391-CRDT-COLLAB-PLAN.md`](L-391-CRDT-COLLAB-PLAN.md) · C16 §5.1 (CA-17…CA-21) · C69 · C66 §1.
>
> **The evidence rule this document holds itself to (directive rule 1): evidence or UNPROVEN —
> no third option.** Every cell below is one of: EXECUTED (a named probe ran and its output was
> read), SOURCE-ANCHORED (a static fact proven by reading code — strong enough for FAIL, never
> for PASS), or UNPROVEN. "The code exists" is never evidence of the chain.
>
> ⚠ **Three fix agents were live in the shared tree while this was written** (FINISH-1
> ceiling/curtain-wall in `plugins/` + `apps/editor/`, FINISH-2 CA-21 gate, FINISH-3 dead-verb
> refusals). Their work is **uncommitted** (`git status` at writing time shows
> `plugins/ceiling/src/handlers/UpdateCeiling.ts` and
> `plugins/curtain-wall/src/handlers/UpdateCurtainWall.ts` **deleted**, ~18 `Move*/Rotate*`
> handlers modified, `CeilingUpdateReachesGeometryStore.test.ts` +
> `CurtainWallUpdateReachesGeometryStore.test.ts` untracked, and
> `tools/ga-gate/check-verb-liveness.ts` **not yet on disk**). This plan grades the last
> committed state (`main` @ `d46a631b`) and marks in-flight items IN-FLIGHT, not DONE.

---

## A — Current BIM 2.0 readiness matrix

### A.0 How to read the matrix

The eight columns map onto the directive's chain:

| Column | Chain link | What counts as evidence |
|---|---|---|
| **Implemented** | Intent → Command | verbs registered + a chat/UI route exists (register `liveness`; scorecard V1/V2) |
| **Executed** | Command dispatched | an EXECUTED probe drove the real ladder / real bus (scorecard V1–V2 EXECUTED rows) |
| **Authoritative** | Authoritative State + Geometry | V3 — the store the renderer **and** `ProjectSerializer` consult moved (never `success===true`, never the plugin DTO store) |
| **Persistent** | Persistence | V4 — save → reload → still there, executed |
| **Undo** | Undo/Redo | V5 — one undo reverses the specific property, executed |
| **Collaboration** | Collaboration | V6 — a second client receives the authoritative change |
| **Report** | Report | V7 — the transcript is true (partial says partial; refusal names its code) |

Verdict vocabulary per cell: **PROVEN** (executed) · **PARTIAL** (executed for a subset, named) ·
**FAIL** (source-proven the chain breaks) · **REFUSES-CORRECTLY** (the honest answer is a named
refusal, and it is delivered) · **UNPROVEN** (no executed evidence either way — the honest
default). **UNPROVABLE-NO-STORE** is a special FAIL-shaped UNPROVEN: `composeRuntime` builds no
authoritative store for the element kind, so V3 cannot be measured *by construction*
(audit §17.0.1; `tools/rac-conformance/runtime-harness/__tests__/compose.probe.ts` output:
12 element-kind stores ABSENT, door/window reachable only as module singletons).

### A.1 The matrix

| Subsystem | Implemented | Executed | Authoritative | Persistent | Undo | Collaboration | Report | Status |
|---|---|---|---|---|---|---|---|---|
| **1 Project / structure** (levels, buildings, sites) | PARTIAL — `hierarchy.*`, `level.*` LIVE via legacy bridges (register); most cat-1 asks have **no chat route** (scorecard 1–5 §2, rows 1.1–1.10: majority V1/V2 FAIL = NOT OFFERED) | PARTIAL — V1/V2 executed by `probe-categories-1-5.ts`; `create level 0` / `add a level` PASS | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN (V6 never PASS anywhere; see row 10) | MIXED — scorecard V7 per row | **NOT CERTIFIABLE** — route gaps + no V3-and-beyond evidence |
| **2 Walls** | PARTIAL — the live wall family is legacy bridges (`wall.updateBaseline`, `wall.updateDimensions` post-L-815, `wall.update*Batch`, per register); the parallel `wall.move`/`wall.transform` DTO family is dead-by-construction, dispatched by nothing (DEAD-WRITE plan §0, §1.3), refusal IN-FLIGHT (FINISH-3) | PARTIAL — V1/V2 executed; create/thickness/type/material/layer PASS, length/move/rotate FAIL (scorecard 1–5 §2) | **UNPROVABLE-NO-STORE** (`wallStore` ABSENT from composed runtime) | UNPROVEN | UNPROVEN — plus the three-stack 250 ms race is source-proven and pinned RED-BY-DESIGN (`apps/editor/__tests__/undoGestureOrdering.test.ts`, 3 `it.fails`; audit P1-7) | UNPROVEN — 25 property verbs *declared* + wired legs A+B (`e1f6966d`, `b8c58e61`), proven in Node against a store stand-in only, never two clients (audit §17.6.4) | UNPROVEN | **BLOCKED on the composeRuntime store gap (§B.1)** |
| **3 Openings** (doors/windows) | PARTIAL — mixed LIVE bridges + SHADOWED (`door.setHeight/setWidth`, `window.setSillHeight/setSize` per register *Declaring sites*) | PROVEN for the probed subset | **PARTIAL — the only executed V3 in the repo**: `runtime-harness/__tests__/v3v4v5.probe.ts` dispatches on the real composed bus and reads back from the real `doorStore`/`windowStore` module singletons (the ones `ProjectSerializer` imports); V3 proven for exactly the door/window verbs it reaches | **PARTIAL — doors: executed serialize → restore round-trip in the same probe** | **PARTIAL — executed for the same 2-verb subset** | UNPROVEN | UNPROVEN | **FURTHEST ALONG** — and only by accident of module scope (audit §17.0.1) |
| **4 Slabs** | PARTIAL — `slab.updateDimensions`, `slab.create-on-all-floors`, `slab.movePolygon` LIVE (register); `slab.move` in the dead DTO family (FINISH-3) | PARTIAL — V1/V2 executed per scorecard 1–5 | UNPROVABLE-NO-STORE (`slabStore` ABSENT) | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | **BLOCKED (§B.1)** |
| **5 Roofs** | PARTIAL — `roof.update` LIVE post-L-839 (`2c8b4904`; register row moved SHADOWED→LIVE); `roof.setPitch` et al. UNKNOWN | PARTIAL | **PARTIAL — geometry link PROVEN by independent oracle**: overhang/inset 300 mm requested → 300.00 mm, spread 0.000 across square/elongated/L/U/cadastral fixtures, oracle run against pre-fix code first (audit P0-5/P0-6); `RoofUpdateReachesGeometryStore.test.ts` is the one executed CA-21-style read-back outside doors/windows | UNPROVEN | UNPROVEN | UNPROVEN | UNPROVEN | **Geometry certified; chain not** |
| **6 Rooms** | PARTIAL — colour/rename/number/occupancy LIVE bridges (register); `room.setMaterial` REFUSES-CORRECTLY (a room has no catalogue-material field — audit P1-15: do **not** restate as "works"); `room.setFinish` / `room.resize` **have no verb at all** despite a fully persisted finishes schema (scorecard 6–10 §1.8) | PARTIAL — V1 2 PASS / 6 FAIL (scorecard 6–10 §2.0) | PARTIAL — cat-8 executed probe's positive control proves the colour bridge writes the authoritative `roomStore` (`deadVerbAuthoritativeState.test.ts`, 5/5) | UNPROVEN — strong source evidence (rooms are first-class in `ProjectSerializer.ts` / `ProjectLoader.ts`), explicitly "requires a runtime save/reload to settle" (scorecard 6–10 row 6.8) | UNPROVEN | UNPROVEN | UNPROVEN | **PARTIAL — honest refusals in place; write-path gaps are design gaps, not bugs** |
| **7 Visibility** | **FAIL — the category does not exist as a capability**: 0 of 45 chat capabilities hide/show/isolate anything; P7 handlers now write a real registered store but have **zero production dispatchers** from chat or UI (scorecard 6–10 §1.3); `hide level 2` MISREADS to navigation (§1.2, P0-class) | EXECUTED — the misread itself is the executed evidence | PARTIAL — the store writes are real (`composeRuntime.ts` registration) but unreachable | **FAIL by written decision** — `serialize()`/`deserialize()` have zero callers; `composeRuntime.ts:573-588` states visibility is not persisted/undoable/replicated | **FAIL by written decision** (`affectedStores: []`, empty patch pair) | **FAIL** (`not-synced` declared) | FAIL — user told an action happened that was not the action requested (§1.2) | **NOT CERTIFIABLE — needs a capability class, a founder-visible design decision (§B.8)** |
| **8 Materials / properties** | PARTIAL — the setMaterial DTO family REFUSES with named reasons (17 verbs, `5e74b178`; three refuse for deeper reasons the refusal states); `element.updateParameters` LIVE | PROVEN — `deadVerbAuthoritativeState.test.ts` 5/5 executed, incl. positive control and "a catalogue materialId must not report success while writing nothing" | PARTIAL — executed for the cat-8 probe's topology; note `"remove the material from this wall"` → `element.delete` is a live destructive MISREAD (scorecard 6–10 §1.4, P0-class, unfixed) | UNPROVEN | UNPROVEN — the P1-1 undo hazard (inverse computed against detached DTO store) was proven then proven closed for the 17 | UNPROVEN | PARTIAL — refusals carry codes for this family; `check-refusal-identity` still names 88 offenders repo-wide | **REFUSES-CORRECTLY where dead; live subset unproven past V3** |
| **9 Batch** | PROVEN — ten batch handlers (audit P0-8: ten, not eight) | PROVEN | UNPROVEN (V3 not the probe's subject) | UNPROVEN | UNPROVEN — batch = one command = one undo is *declared* (C16 CA-12), not executed | **UNPROVEN, structurally hard**: every `'all'`-subject batch verb is declared not-synced because its subject set is late-bound (audit P1-10 — "the RAC's strongest capabilities are its least syncable") | **PROVEN — the strongest Report evidence in the repo**: `ReportPayloadHonesty.spec.ts` executed, six engine payloads → six distinct transcripts, partial says partial, case 6 says "the command sent no report back" (scorecard 6–10 §4) | **Report link certified; rest of chain unproven** |
| **10 Collaboration** | PARTIAL — legs A (per-verb sync disposition, declared not allowlisted) + B (`ElementSyncReader` + `DeferredCrdtApplier`) landed; **leg C (transport) does not exist**: `apps/sync-server` ships but is undeployed AND speaks a JSON protocol no `y-websocket` client can talk to (L-391 §1.4); production is socket.io **silent last-writer-wins** (L-391 §1.3) | PARTIAL — legs A+B proven in Node against a store stand-in; the sync gate says so on every run | UNPROVEN | UNPROVEN | UNPROVEN | **FAIL — V6 is 0 PASS on every row of both scorecards; C66 §1: 0 of 3 tiers HELD, no tier may be described as supported** | UNPROVEN — the P8 conflict banner can never fire (no transport) | **NOT CERTIFIABLE — blocked on a founder infra decision (§B.7)** |

### A.2 What the matrix says in one paragraph

Across ~92 scored operations and 320 registered verbs, **executed whole-chain evidence exists
for approximately two verbs** (door/window create in `v3v4v5.probe.ts`, V3+V4+V5), one geometry
oracle (roofs), one authoritative-state probe family (cat-8, 5/5), and one report-honesty suite
(batch, six transcripts). Everything else in columns Authoritative→Collaboration is UNPROVEN or
FAIL, and for 12 of 14 element kinds it is **unprovable by construction** until §B.1 is decided.
The register's own headline (cite the file, the numbers rot: "authoritative store NONE or
UNKNOWN" covers roughly two-thirds of all verbs at last generation) is the same fact measured a
different way. **No subsystem is BIM 2.0 complete today.** That is not a collapse verdict — V1/V2
resolve reliably where a capability exists, refusals are increasingly honest, and the report link
is genuinely strong — but under the directive's rule, nothing may be promoted past its evidence.

---

## B — Blocking gap list, ranked by leverage over the certification surface

### B.1 — `composeRuntime` composes only the plugin-DTO half — THE root cause. **Founder decision: P1 ADR required**

Verified, not copied: `packages/runtime-composer/src/composeRuntime.ts:1498` builds `StoresSlot`
as `{registerHydrator, hydrate, viewState, project}` and nothing else; the geometry stores are
constructed in `apps/editor/src/engine/engineLauncher.ts` and never referenced by
`composeRuntime`; zero store committers are registered (DEAD-WRITE plan §1.1, confirming the
`821a5d0b` headless probe: 12 kinds ABSENT, doors/windows MODULE-SINGLETON by accident).
Consequence for certification: **V3 is unprovable by construction for most of the model**
(audit §17.5 item 1), and the dead verbs / shadowed routes / lying move verbs keep being
authored because the composition root offers nothing authoritative to write (audit §17.0.1).

**This is an architectural decision, not a patch. Drafted below is an ADR OUTLINE for the
founder to decide — this plan does not decide it.**

> **ADR-03xx (draft outline) — Where do the authoritative element stores live?**
>
> **Context.** P1 says production obtains a runtime only via `composeRuntime()`. Today the
> runtime it returns cannot answer "did this command change the model?" for 12 of 14 element
> kinds; the stores the serializer, 2-D projector, and IFC exporter read are built by the
> DOM-coupled `engineLauncher`. CA-21 certification, headless testing (`packages/headless`,
> N-4), and any server-side evaluation of commands are all blocked on the same fact.
>
> **Option 1 — `composeRuntime` owns the geometry stores.** Move store construction from
> `engineLauncher` into a composition slot; `engineLauncher` receives them.
> *Cost:* the largest wiring change on the board; touches every store consumer; risk of a
> second L-816-class bundle problem if store modules drag renderer imports (cf. ADR-0316's
> measured 281 KB THREE finding — must be measured, not assumed, before choosing).
> *Buys:* V3/V4/V5 provable headlessly for every kind; `packages/headless` becomes honest;
> CA-21 gate can certify the whole register; the dead-verb class loses its root cause.
>
> **Option 2 — invert the registration edges: store committers registered into the composed
> bus.** Stores stay where they are; `engineLauncher` (or a new thin package) registers
> per-kind committers/bridges with the runtime, the way the scene committer already works.
> *Cost:* keeps two construction sites; headless composition still needs a committer pack;
> the "which half is authoritative" question is answered per-kind rather than once.
> *Buys:* smaller diff; incremental per-kind migration; matches the existing L-220 bridge
> precedent.
>
> **Option 3 — bless the split (ADR-0316 pattern): `engineLauncher` is a declared second
> surface with executable invariants.** Write the invariants (every LIVE verb's store
> reachable from a named accessor; no verb may declare a store the launcher doesn't build).
> *Cost:* V3 stays unprovable headlessly — certification would need a browser harness for
> everything, which is the expensive path forever. *Buys:* honesty without wiring risk.
>
> **Decision drivers the founder should weigh:** September launch scope · whether server-side
> command evaluation (BIM 3.0, AI workers) is on the 12-month path (if yes, Option 3 is a
> dead end) · bundle-budget measurements per Option 1.
> **Exit condition (any option):** the `compose.probe.ts` reports zero ABSENT, or the ADR
> names the kinds that legitimately have no headless store and the register carries that
> disposition per verb.

### B.2 — CA-21 gate (IN-FLIGHT, FINISH-2) — the cheapest structural insurance

C16 §5.1 CA-21 binds liveness contractually ("proven by an executed read-back, never
declared"); C16 §11.1 records it **NOT ENFORCED**, and `tools/ga-gate/check-verb-liveness.ts`
does not exist on disk at writing time (verified by `find`). The runtime-harness
`liveness.probe.ts` already implements the authoritativeness rule (a store counts only if
`ProjectSerializer` imports it — checked, not asserted, so the probe cannot grade its own
homework). CA-8 *prescribed* the dead-verb defect for months before its 2026-08-11 correction
(audit N-8) — a contract clause without a gate is exactly the shape P0-12 condemns.
**Finish criterion:** the gate fails a verb whose liveness is declared but not proven by an
executed read-back, negative-tested by deleting a read-back and watching red. Note the gate's
reach is capped by B.1: until the composition root exposes a kind's store, the gate can only
certify door/window + legacy-bridge verbs and must say UNPROVABLE for the rest, loudly.

### B.3 — `ceiling.update` + `wall.updateCurtainWall` (IN-FLIGHT, FINISH-1) — the only user-visible dead writes on the board

Both are in the uncommitted working tree (handlers deleted; two `*ReachesGeometryStore` probes
untracked). Routes per DEAD-WRITE plan §2.2/§2.3: route (c) shadow-retirement for ceiling
(L-815/L-839 precedent; ⚠ the one open unknown — whether `UpdateCeilingCommand` registers an
inverse — must be confirmed before commit) and the L-220 distinct-verb bridge for curtain-wall
(every production curtain-wall move is a silent no-op today: dispatched from both move surfaces,
writes a detached store). **Finish criterion:** both probes committed and green against the
committed tree, register regenerated, `SHADOWED` count shrunk. Until committed, grade DEAD.

### B.4 — The dead verb family: refuse all ~20, one commit (IN-FLIGHT, FINISH-3)

Class A of DEAD-WRITE plan §1.3 (the 5 named + 15 siblings). The tree shows the `Move*/Rotate*`
handlers modified. Non-negotiables already established: refuse, never retire
(`CapabilityRefusal` names them); **convert all 19 lying test cases in the same commit** —
`transformDragUndoCapture.matrix.test.ts` pins 14 across the whole family, so a partial refusal
leaves it half-converted (handover §5.7). **Finish criterion:** register `REFUSES` grows by the
class size, `UNKNOWN_LIVENESS_BASELINE` shrinks, zero `*.move` verb names a plugin DTO store.

### B.5 — Persistence certification does not exist (directive §10)

Nothing today systematically compares authoritative state before and after reload. The
strongest existing evidence is one executed door round-trip (`v3v4v5.probe.ts` V4 leg — real
serializer read + real `ProjectLoader` restore sequence) and source-anchored inference for
rooms. This is a **harness build** (§C.2.1), and its scope is capped by B.1 the same way B.2 is.
Independent-oracle requirement (directive §7): the comparator must read the reloaded state
through the serializer/loader path, never through the store the handler wrote.

### B.6 — Undo/redo certification does not exist (directive §11), and one known defect is pinned unfixed

The 250 ms three-stack wall-clock race is pinned by 3 `it.fails` tests
(`undoGestureOrdering.test.ts` — green while broken, red the day it's fixed; cliff measured at
gap = 125 ms, audit P1-7). The fix is **§UNDO-GESTURE-ID** — a gesture id stamped at dispatch
(a monotonic counter cannot express "these two entries came from ONE dispatch"); the test file's
own comments say "drop `.fails` when §UNDO-GESTURE-ID lands". Producers: `command-bus` /
`command-registry`; consumer: `performUndoRedo.ts`. Also pinned: `performUndo()` returns `void`
(three different outcomes are the same value to every caller, C03 §4.6 U-4) and 16 door/window
handlers stranding ring entries. Certification harness: §C.2.2.

### B.7 — Collaboration leg C — **founder infra decision, not agent work**

Fully scoped in L-391; two options priced in DEAD-WRITE plan §3 (**C-1** stock y-websocket relay
— days, no auth/durability; **C-2** teach `apps/sync-server` y-protocols — the multi-week L-391
project with auth + Postgres durability; **or descope multi-user real-time for V1** and remove
the conflict-UI claim, which is L-391's own stated alternative). Constraints that stand
regardless of choice: default-OFF client gate stays OFF until a protocol-compatible endpoint
exists; **C66 §1 — deploying transport moves no tier; only an executed k6 run does, and
`tools/load-test/pryzm-load.js` is authored, never run (L-800). Zero tiers HELD; no capacity
description permitted until one is.** The two-client harness (§C.2.3) is blocked on this
decision; the batch/`'all'` late-bound-subject problem (audit P1-10) additionally means the
strongest chat capabilities cannot sync even after transport, and needs its own design note.

### B.8 — Visibility capability class does not exist (audit P0-4 residue; scorecard 6–10 §1.3)

`ChatCapability` has no read-only/query marker; zero capabilities hide/show/isolate;
`hide level 2` navigates. The store-side work (P7) is done and registered; what is missing is a
capability class + dispatchers + a *decision* on persistence/undo/sync for visibility intent
(today FAIL **by written decision** in `composeRuntime.ts:573-588` — honest, but the founder
should confirm that written decision is the product intent, together with the outstanding
`IMPLICIT_MODEL_VIEW_ID` judgement call, audit §17.6.6).

### B.9 — Workflow A whole-building certification does not exist (directive §8)

No artefact anywhere drives create-project → levels → walls → openings → slabs → roof → rooms →
save → reload → undo-sweep → report as one certified run. Build in §C.2.4; blocked on B.1 (no
authoritative stores to assert against for most kinds) and materially devalued until B.3/B.4
land (a whole-building run over dead verbs certifies theatre).

### B.10 — Instrument debts that grade everything above

(a) The register's liveness heuristic has a proven false UNKNOWN (`wall.updateBaseline` —
declares stores AND calls `cm.execute`; one-clause fix scoped in DEAD-WRITE plan §5, half a
day, re-baselines every number in this plan). (b) The register classifies SHADOWED from
declaring files, not registration, so **it cannot see a fix** (audit N-2) — it needs a
regeneration-plus-heuristic pass after FINISH-1 lands or ceiling will read SHADOWED forever.
(c) `check-sync-disposition` blindness is FIXED at `d46a631b` (S6 cross-gate agreement — a verb
the register lists which the gate cannot see is now a hard failure); the 139-verb
`UNDECLARED` baseline shrink remains, sequenced behind B.7. (d) Runtime-only registration is
invisible to every static gate (C69 §6.1a) — a standing, named blind spot.

---

## C — Certification harness plan

### C.1 Probes that EXIST (named, with what each proves and its honest limit)

| Probe | Path | Proves | Limit |
|---|---|---|---|
| Compose probe | `tools/rac-conformance/runtime-harness/__tests__/compose.probe.ts` | real `composeRuntime` + real `bootstrapWithEverything` compose headlessly; enumerates which stores exist | the ABSENT list **is** the finding; proves composition, not liveness |
| Discover probe | `runtime-harness/__tests__/discover.probe.ts` | bus registry contents at runtime | registration ≠ liveness |
| V3/V4/V5 probe | `runtime-harness/__tests__/v3v4v5.probe.ts` | executed dispatch → authoritative read-back, serialize→restore round-trip, undo reversal — **zero stubs on the measured path** (its own stub ledger) | reaches door/window only (B.1) |
| CA-21 liveness probe | `runtime-harness/__tests__/liveness.probe.ts` | generalises the read-back to every verb whose store the root reaches; authoritativeness rule = "ProjectSerializer imports it", externally checked | same B.1 cap; its companion gate (FINISH-2) not yet on disk |
| RAC ladder probes | `tools/rac-conformance/probe-categories-1-5.ts`, `probe-categories-6-10.ts` | V1/V2 executed against the REAL resolution ladder, verbatim output | stops at the zero-token ladder — planner/QueryEngine behaviour beyond it UNPROVEN (scorecard 6–10 §1.1) |
| Geometry oracle | `tools/rac-conformance/probe-geometry.ts` + the polygon-offset oracle tests (audit P0-5/P0-6) | requested 300 mm is 300.00 mm everywhere, spread 0.000; refusals on collapse | geometry math only, not the chain |
| Route shadowing | `tools/rac-conformance/probe-route-shadowing.ts` + register *Declaring sites* | two-site verbs where the dead one wins | static; cannot see runtime registration, cannot see fixes (B.10b) |
| Authoritative-state probe (cat 8) | `apps/editor/__tests__/deadVerbAuthoritativeState.test.ts` | resolved-successfully ⇒ authoritative record changed, with positive control | reproduces production topology in Node; not a browser |
| Report honesty | `apps/editor/src/ui/ai/__tests__/ReportPayloadHonesty.spec.ts` | six engine payloads → six distinct true transcripts, executed | one sentence family (batch); V7 elsewhere unprobed |
| Read-back precedents | `apps/editor/__tests__/RoofUpdateReachesGeometryStore.test.ts` (+ the two untracked twins) | the CA-21 pattern per verb | one verb each |
| Undo race pins | `apps/editor/__tests__/undoGestureOrdering.test.ts` (3 × `it.fails`) | the defect exists; goes red when fixed | pins, does not certify |
| Gates | `check-verb-register.ts` (C69, bidirectional CI diff) · `check-sync-disposition.ts` (post-`d46a631b`, S6) · `check-refusal-identity.ts` · report-payload-discard (R4, born at 0) | structural invariants per gate | static, each names its own NOT-CHECKED |

### C.2 Probes that must be BUILT

Target output shape for every certification run: **the directive §6 format** — per operation,
the seven chain links each stamped PROVEN/FAIL/UNPROVEN with the executing artefact named, never
collapsed into one verdict. Oracle discipline throughout per directive §7: **an implementation
never tests itself** — the read side of every comparator goes through an independent path
(serializer/loader, a second store, a second client, or a hand-computed geometric expectation).

| # | Harness | What blocks it | Cost (est.) | What it proves |
|---|---|---|---|---|
| **C.2.1** | **Persistence round-trip comparator** (directive §10): snapshot authoritative state → serialize → restore via the real `ProjectLoader` sequence → structural diff; assert per-property equality, not counts. Oracle = the loader path, never the store the handler wrote. | B.1 for 12 kinds (door/window + legacy-bridge verbs buildable **today** by generalising the `v3v4v5.probe.ts` V4 leg); a canonical state-diff utility | 2–4 d for the reachable subset; re-run free after B.1 | V4 per verb, executed — turns ~two full columns of A.1 from UNPROVEN into measurements |
| **C.2.2** | **Undo/redo round-trip vs authoritative state** (directive §11): dispatch → read → undo → assert the *specific prior value* returned in the authoritative store; then redo. Includes a compression matrix (gap ≤ 125 ms) that stays red until §UNDO-GESTURE-ID lands. | B.1 (same cap); the gesture-id fix for the compression rows; `performUndo()`'s void return (nothing to assert on until it reports) | 2–3 d reachable subset | V5 per verb, executed; converts the P1-7 `it.fails` pins into certification rows |
| **C.2.3** | **Two-client collaboration harness**: two real composed runtimes, one transport, edit on A → assert authoritative store on B holds the value (staleness ≠ failure: assert the value, never `toBeDefined()` — the P1-8 lesson). The chaos suite (`apps/sync-server` + `PeerHarness.ts`) is a starting skeleton. | **Leg C (B.7) — a founder decision.** Until transport exists this harness cannot be built honestly; do not stage a two-adapter local test and call it collaboration (the P1-10 refusal, kept) | days after C-1, embedded in L-391 Phase 2 after C-2 | V6, executed, for the 25 declared verbs; the precondition for any C66 tier motion (which still needs the k6 run) |
| **C.2.4** | **Workflow A whole-building certification** (directive §8): one scripted run — project → 2 levels → 4+ walls → door + window → slab → roof → rooms detected → save/reload → full undo sweep to empty → redo sweep back — emitting one §6-format table for every step | B.1 (assertable stores) · B.3/B.4 (else it certifies dead verbs) · C.2.1/C.2.2 as libraries | 3–5 d once deps land | the first end-to-end BIM 2.0 certificate; the artefact the founder can read as "the chain holds for a building, not a verb" |
| **C.2.5** | **Adversarial suite** (directive §9): extend the 38-phrasing read-only set past the zero-token ladder into the LLM-planner and QueryEngine rungs (the measured mutation default is now inverted, audit P0-4, but 35/38 phrasings fall through to rungs the probe never reached); add the known live misreads (`hide level 2`, `remove the material` → delete) as red rows | a stubbed `aiService` that *returns* proposals (the P0-4 method — a null service yields false passes); nothing else | 1–2 d | read-only means read-only at **every** rung; misreads become pinned regressions rather than scorecard prose |
| **C.2.6** | **Scale suite** (directive §13): execute `tools/load-test/pryzm-load.js` at C66 tier VU counts against a production-shaped target; record in `docs/03-execution/analysis/` per C66 §1 | a target environment (founder: prod-shaped staging vs prod off-hours) · leg C for the collab rows · L-800 | 1–2 d per run + env | the ONLY thing that moves a C66 tier CLAIMED → HELD |

### C.3 The five defect classes — what now structurally prevents recurrence, and what does not (directive rule 2)

| Class | Prevented NOW by | Still NOT prevented |
|---|---|---|
| **A — dead verb** (writes nothing authoritative, reports success) | C69 register generated + CI-diffed both directions (a PR adding a verb without a row fails); C16 CA-17/CA-18 as written authority (CA-8, which *prescribed* the defect, corrected in place); refusal precedent `§FIX-DEAD-VERB-REFUSE` with tests converted not deleted | **CA-21 has no gate until FINISH-2 lands** — a verb that *looks* live can still ship unproven; and for 12 kinds liveness is unprovable at all until B.1. Static SHADOWED detection cannot see fixes or runtime registration |
| **B — blind gate** (green over an unmeasured subject) | R5 meta-gate (MIN_FILES floors, 37 gates inspected); R7 distinct exit codes (exit 3 never absorbable); S6 cross-gate agreement in the sync gate (`d46a631b`) — a subject another gate can see and this one cannot is a hard failure | S6 exists in ONE gate; no general rule that every gate's denominator is reconciled against an independent census. `check-motion-gate-coverage`'s exit-0-while-blind class has no repo-wide detector. R6 (doc-cited gate paths must exist) still unwritten |
| **C — plausible fallback** (silent substitute for a refusal) | Refuse-with-named-reason doctrine in C16 CA-18 with three prohibited shapes; geometry collapse modes refuse by name (P0-6); envelope hard-reject fixed; `check-refusal-identity` keyed by file+fragment | **88 named refusal-identity offenders open** (incl. `maxHeightGate.ts`, no `code` field); `repairToSimplePolygon` still invents a boundary, unlogged, stamped 'ai-generated' (P1-5 — blocked on nothing); QueryEngine fall-through behaviour beyond the ladder unmeasured (C.2.5) |
| **D — self-output-as-intent** (system narrates its own success) | R4 report-payload-discard gate born at 0 (an engine report cannot be silently dropped); transcripts join engine strings, never re-narrate (ReportPayloadHonesty, 6 cases); total timeout is no longer a success | V7 is executed for one sentence family; nothing gates that a *new* capability's transcript is payload-derived. The `partial` kind is structural only for multi-command mixtures (scorecard 6–10 §4 note) |
| **E — under-counting** (a denominator smaller than the subject) | Register derives denominators from source per run and forbids transcription (C69 §0.1); `nft-targets.ts` parses C10 markdown at test time; S6; the sync gate's floors now derived from the register | OTel Zone C census (most exported functions unspanned) explicitly not gated; the 139 sync-UNDECLARED baseline is named but its shrink is unscheduled; every hand-written doc number (including this one) rots — which is why this plan cites artefacts for anything that moves |

### C.4 Sequencing summary (respecting what is founder-owned)

1. **Land the three in-flight agents** (B.2, B.3, B.4) — verify against their probes, commit;
   regenerate the register (with the B.10a heuristic fix folded in).
2. **Founder decides the P1 ADR (B.1).** Everything in C.2.1/C.2.2/C.2.4 scales with it.
3. **Build C.2.1 + C.2.2 for the reachable subset now** — do not wait for B.1; the door/window +
   legacy-bridge subset converts real UNPROVEN cells immediately and the harness generalises.
4. **C.2.5 adversarial suite** — independent of everything above, cheap, closes two live P0-class
   misreads' regression risk.
5. **Founder decides leg C (B.7) and the visibility class (B.8).** Then C.2.3, then C.2.6.
6. **C.2.4 Workflow A** last — it is the certificate, and a certificate over dead verbs or
   absent stores would be the exact promotion of partial evidence the directive forbids.

---

## D — What this plan could not verify (named, per doctrine)

1. The in-flight working-tree changes (FINISH-1/2/3) were **not** executed or reviewed here;
   everything graded above is at `main` @ `d46a631b`.
2. No probe was re-run by this author; every EXECUTED citation is to a run recorded in the
   scorecards, the audit §17, or the handover — all dated 2026-08-11.
3. The scorecards' V6 rows predate leg B (`b8c58e61`); the matrix states legs A+B as landed per
   the audit, but no artefact has re-scored V6 since — it would still read UNPROVEN/FAIL, for
   the leg-C reason.
4. Whether `UpdateCeilingCommand` registers a legacy-stack inverse — the one unknown that
   changes B.3's route — remains unread (DEAD-WRITE plan §7).
5. The directive itself is quoted from the BIM20 brief; §6's exact certification table format
   was not available as a repo file and is rendered here as described (seven links, per-link
   verdict + artefact).
