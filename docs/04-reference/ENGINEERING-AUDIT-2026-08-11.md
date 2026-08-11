# PRYZM — Engineering Audit

**Protocol:** Canonical Audit Protocol Rev 2 · **Date:** 2026-08-11 · **Baseline:** `main` @ `9ad92622`
**Method:** 12 parallel audit streams. Every material claim traced `claim → gate/probe → execution → observed result`. Two streams ran **independent executable probes** (a geometry oracle computing its own invariant; a real THREE scene with injected foreign objects). No repository file was edited by any stream; all probes live outside the repo.

**Working-tree caveat:** the tree was DIRTY throughout (a live RAC agent mid-edit). Where that changes an answer it is stated — it changes finding P0-4.

> ### ⚠ THIS DOCUMENT HAS BEEN ANNOTATED, NOT REVISED — see [§17](#17-remediation-annotation--2026-08-11-post-audit)
>
> Everything in §1–§16 is the record of what was true on **2026-08-11 at `9ad92622`** and is
> preserved **verbatim**. Nothing has been deleted, softened, or quietly re-scoped. Thirty-four
> commits of remediation landed afterwards (`e205864e..HEAD`); **§17 carries a
> CLOSED / OPEN / CORRECTED / CHANGED status for every P0 and P1**, each backed by a commit SHA
> or an executed gate reading.
>
> **Read §17 before acting on any finding below.** Four of this document's findings are
> **CORRECTED — the audit was wrong**, and in one case (P0-10) complying with it would have
> damaged honest source. The audit's own premise is also reframed there: the drift was not
> primarily implementation-vs-documentation, it was that **the measuring instruments were broken.**

---

## 1. Executive verdict

# 🔴 RED

The architecture is genuinely stronger than several of its documents claim, and the correctness culture is real — most findings below were *found by the repository's own instruments*. But the protocol's §23 stop conditions are met repeatedly, and three of them are live production defects rather than paperwork.

**The three most important reasons:**

**1. CI is red on `main` right now, on three merge-blocking gates — and the suite says so.**
Executed: `npm run ga-gate:all` → **`15 passing · 17 failing (14 declared debt, 3 regression)` → `BLOCKED`**. The three regressions are *not* on the debt ledger, so by the repository's own rule each is a fresh contract violation shipped since the last green run:
- `check-layer-boundaries` — **181 SDK-facade bypasses vs baseline 178**, three undeclared bumps (`UpdateSlabsSystemTypeBatch.ts`, `UpdateCeilingsSystemTypeBatch.ts`, `DeleteElementsBatch.ts`), each missing the dated justification the gate's own comment demands at `:139`.
- `check-visibility-intent-not-ui` — **45 direct `.visible` writes vs baseline 43**, and the offenders are *design* visibility (`ProjectVisibilitySection.ts`, `SpatialTree.ts`), precisely what P7 exists to protect, not transient gizmos.
- `check-declared-project-scopes` (ADR-0298).
Either deploys are currently blocked, or they are going out through the documented `bypass_ci_gate` path — meaning the gate is being routed around rather than satisfied.

**2. A canonical merge blocker has never blocked a merge, and a live geometry P0 is the twin of a bug already fixed next door.**
`C10 §4` lists *"All 17 NFT benches pass"* and *"Bundle size < 4 MB"* as merge blockers. `grep -rn "bench" .github/workflows/` → **zero matches**. And `C10 §1.1` claims headless Chromium via `@vitest/browser` while `apps/bench/vitest.config.ts` is `environment:'node'` — so the suite is not invoked, **and would measure the wrong thing if it were**. Separately, `applyOverhang` in `packages/geometry-kernel/.../roof/polygon.ts:120` is a **centroid radial dilation sold as a parallel offset**: a specified 300 mm eave delivers **212 mm** on a square and is anisotropically worse on elongated plans. The correct implementation *already exists* in the sibling package (`geometry-roof/src/pure/polygonOffset.ts`, written to fix the founder's "overhangs well outside the building" bug) — **the un-migrated clone is the one wired into the roof committer.** This is L-825's twin, unfixed, shipping.

**3. Reports lie at the last layer, and a read-only question mutates geometry.**
The command layer reports partials honestly — 50 executed tests prove `"Changed N of M — K skipped: reason"` and prove "nothing eligible" ≠ "all succeeded". Then `apps/editor/src/ui/create/batchCatalogue.ts:500` does `if (res?.success) return { ok: true }` — **discarding `res.info`, the entire engine payload** — and the user sees **"Done"**. The honest number is computed and thrown away. The same shape appears three more times (the L-825 fix computes the discriminating pullback spread at `RoomPolygonUtils.ts:1222` and never asserts it; `RoofGeometryBuilder.ts:1073` flattens an honest discriminated `OffsetResult` to a bare array). And at the audit baseline, `"highlight walls taller than 3m"` resolved to `set-height` and dispatched `wall.updateDimensions` — the guard existed only in an uncommitted tree. **That fix landed during the audit (`fd27e513`) and is now the one P0 closed;** the structural cause — no read-only/visibility capability class exists — is untouched.

**What the RED is not.** P2, P3 and P5 are executably true — I ran each gate. D14 is the strongest subsystem in the repository and closes both directions at zero undeclared with *executed* evidence. The L-825 floor-finish fix is **independently verified correct** by an oracle that computed its own invariant. The isolation audit's honesty clause is exemplary. The failure is concentrated in **enforcement reach**, **the last reporting layer**, and **documents that did not move with the fixes**.

---

## 2. Measured repository snapshot

| Subject | Measured | Canonical claim | Verdict |
|---|---:|---|---|
| Packages | **97** | 97 (STR-04 §1.1) | ✅ |
| Apps | **13** | 13 (STR-04) ✅ / 14 (CLAUDE.md) | ⚠ |
| Plugins | **48** | 48 (STR-04) ✅ / 46 (CLAUDE.md) / 47 (STR-03:91, STR-05:570) | ⚠ |
| GA gates | **32** (all 32 wired into `run-all.ts`) | 32 ✅ / 21 (STR-02:522, STR-04 §5) / 31 (`ci.yml:266`, `run-all.ts:22`) | ⚠ |
| Benches | **68** (all 17 NFT files present) | 68 ✅ | ✅ exist — **0 invoked in CI** |
| Contracts | **68** (C01–C68, C61 unminted, +C24.1) | C01–C15 (CLAUDE.md) · C01–C49 (STR-04:317) · C01–C56 (README:16) · "66" (README:162) | ❌ **4 wrong answers** |
| ADRs / SPECs | **252 / 94** | 196 / 82 (README); 108 (STR-04:745) | ❌ |
| Chat capabilities | **45** | 41 (×4 documents) | ❌ |
| Bus commands | **319** | — | measured |
| Composition roots | **1** definition, 2 production callers, **1 declared rival** | "one" | ⚠ |
| Layer coverage | 158 manifests, **145 classified, 13 unclassified** | 8 unclassified (STR-04, CLAUDE.md) | ❌ docs shrink the blind spot by 5 |
| GA suite state | **15 pass / 17 fail (14 debt, 3 regression) → BLOCKED** | "hard-fail — no PR merges without it green" | ❌ |

---

## 3. P1–P8 matrix

Every row's evidence is a gate I or a stream **executed**.

| Principle | Claim | Evidence | Gate | Sees subject? | Runtime verified? | Status | Finding |
|---|---|---|---|---|---|---|---|
| **P1** Single composition root | one `composeRuntime()` | `✓ 1 root, 0 rivals, 2/2 production callers` | `check-single-compose.ts` | Partially — self-declared: cannot tell a delegating wrapper from a rival | No | **PARTIALLY VERIFIED** | `MAX_RIVALS = 1` **blesses a genuine second root**: `apps/component-editor/src/app/familyEditorRuntime.ts` builds its own command bus, stores and solver runner, per the gate's own header. P1 is false for that surface — visible only inside a gate comment. |
| **P2** Single THREE owner | only `renderer-three` | **6,378 files scanned, 0 violations.** My raw grep found 688 files matching `import * as THREE` — but 724 use the compliant barrel and only 19 name `three`, all inside the owner | `check-three-imports.ts`, `MIN_FILES=3000` | **Yes** | No | **VERIFIED (static)** | `await import('three')` is explicitly unmatched (gate header admits it). My initial grep measured the wrong invariant — **a live reproduction of defect class B inside this audit.** |
| **P3** Single rAF | only `RafAdapter.ts` | `OK: 1 owner` | `check-raf-count.ts` | Yes | No | **VERIFIED (static)** | Previously counted 5 owners; 4 were *comments asserting compliance*. Aliased rAF (`const raf = window.requestAnimationFrame`) remains invisible. |
| **P4** No `(window as any)` | *"Forbidden outside the one shim"* | **FAIL: 217 > baseline 215** | `check-cast-count.ts` | Yes | n/a | **FALSE as stated · REGRESSION (tolerated)** | 215 are *permitted*, not forbidden. The gate is **on the debt ledger**, so the two new casts passed a shrink-only ratchet **with nothing stopping them**. A ledgered gate hides its own growth. |
| **P5** Schemas pure | zero I/O/THREE/DOM | `165 files · 7 rules · 0 impurities`, hard-fail at zero | `check-domain-purity.ts`, `MIN_FILES=100` | Yes | No | **VERIFIED** | Scope is `packages/schemas` only; no other package is asserted pure. Cleanest principle in the repo. |
| **P6** Commands only mutation path | *"no direct store writes from UI"* | `✓ within baseline (37/37)` | `check-no-direct-store-writes.ts`, **`MIN_FILES=400`** | Partially — syntactic, `*Store`-named receivers only | No | **PARTIALLY VERIFIED** | 37 blessed writes include **committed model data** (`userMaterialStore.create/delete`, `decisionRecordStore.add`, `scheduleStore.seedDefaultSchedules`) — invisible to undo, CRDT and the event log, the three systems P6 exists to protect. **Only 1 of 32 gates has the `MIN_FILES` defence.** |
| **P7** Visibility intent ≠ UI state | domain concept | **FAIL: 45 > 43** *and* `plugins/visibility-intent/src/handlers/index.ts:34-74` — all five handlers are `console.debug` and nothing else; `packages/stores/src/IsolationStateStore.ts` has **zero production consumers** | `check-visibility-intent-not-ui.ts` | ARM A yes; **ARM B is a self-declared proxy** and cannot see that intent reaches nothing | **No — it reaches nothing** | **DEAD · REGRESSION** | The domain layer is built, tested and correct. **Nothing is wired to it.** No render, persist, undo or sync. Visibility does not survive save/load. The handler header claiming it *"wraps the runtime.visibility slot"* is false. |
| **P8** Conflicts + ≥1 OTel span per new exported function | *"No span = no merge"* | `255/255 ✅`, `OK: 255 ≥ HARD_FLOOR(213)` | `check-otel-spans.ts` | **NO — twice** | No | **ENFORCEMENT-BLIND** | (a) `findHandlerFiles():78-101` walks **`plugins/*/src/handlers/` only** — `packages/command-registry/**` never examined. (b) The test is `instrumented < HARD_FLOOR` — an **absolute floor, never a ratio**. A PR adding 50 uninstrumented handlers leaves 255 ≥ 213 and prints ✅. **It measures neither "every", nor "new", nor "exported function".** The CRDT/conflict half of P8 has no gate at all. |

**STR-03 §2 claims "6 of 8 hard-fail". Truthfully: 3 of 8** (P2, P3, P5) — P1 has a blessed rival, P4/P6/P7 are ratchets (two currently breached), P8 is blind.

---

## 4. Layer-boundary audit

```
workspace packages: 158 · classified: 145 · UNCLASSIFIED: 13
upward imports between classified packages: 102   (baseline 102, at ceiling)
L6 plugin imports bypassing the L5 SDK facade: 181 (baseline 178) ← FAIL
banned third-party imports outside allowed homes: 113
```

- **Alias resolution WORKS — VERIFIED.** `workspacePackages()` runs `git ls-files -- "*/package.json"`, parses each `name`, maps to its directory. Exact, no node resolution, no symlink dependence. A genuine repair of the L-809 blindness, and coverage is printed as a first-class ratcheted number.
- **Illegal edges:** `L2→L6` 39 · `L2→L4` 14 · `L3→L4` 12 · `L3→L6` 11 · `L4→L6` 9 · `L1→L2` 9 · `L2→L3` 6 · `L3→L7` 1 · `L6→L7` 1. Root causes are the three documented ones.
- **Three exceptions, one dangerous.** `isAllowed()` at `:228-235` — *"A `from` layer with no rule is unconstrained… not a violation this gate can assert"* — is a **fail-open branch**. Any layer added to `layerElements` without a matching `allowedDependencies` row is silently exempt: the L-809 shape, one level up. **Recommend inverting the polarity to exit 2 (misconfigured)**, which `run-all.ts` refuses to absorb as debt.
- **L7.5 is not an exception — it is an unexamined zone.** `scan()` globs only `packages/**`, `plugins/**`, `apps/**`. `src/main.ts` (42 KB, the browser boot path) **has never been layer-checked**. The documents describe a permission; mechanically it is an absence of inspection.
- **Gate-internal drift:** `:87` documents 133 violations, `:130` sets 102, output prints 102; `:118` documents 171 bypasses, `:156` sets 178, output prints 181. **Three numbers for two invariants in the file STR-04 elevates to "the authority."**
- **Negative test: NOT ATTEMPTED in this audit** — marked UNPROVEN, not claimed. The gate's own source records two prior author negative tests (a missing bare side-effect-import form; a truncated failure report), and it is failing on a real violation today — weak-but-real evidence it can fail.

---

## 5. Correctness invariant audit (STR-03 §12.3)

| Invariant | Tested? | Independent probe? | Runtime evidence | Blind spot | Status |
|---|---|---|---|---|---|
| **I1** Failure ≠ emptiness | Partially | Yes | `MIN_FILES` idiom exists and works. **But:** PDF→BIM tier 1 hard-codes *"no usable vector line-work"* regardless of the real reason (`Step4AnalysisView.ts:331`); an unset scale returns silent `null` (`:141`); a stale `tierNote` leaks a *capability description* as a failure reason (`:335`); a successful-but-empty AI enrichment reports *"not produced — needs the AI stage"* (`:563`); the downloadable diagnostic writes hard-coded zeros (`:728`). Tier 1's library has **no rejection accounting at all** — "0 doors found" and "12 door arcs rejected" are the same value. | **31 of 32 gates lack a subject floor.** Three gates shell out to `rg` and exit **1 (absorbable as debt)** rather than **2 (misconfigured)** when it is absent. | **FALSE in the PDF subsystem; PARTIALLY VERIFIED elsewhere** |
| **I2** Ship the probe before the fix | Partially | Mixed | `QueryEngineDrain.spec.ts` **fails in the good direction** (2/6) because fixes drained phrasings it still pins — the design working exactly as built. The L-825 fix was independently re-verified by an oracle computing its own invariant. | Layer, OTel, isolation and capability gates have no *recorded* negative test. | **PARTIALLY VERIFIED** |
| **I3** Liveness proven, not presumed | Yes — and it found dead paths | Yes | Wall height/rake/add-layer proven live to renderer+persistence+undo. **Visibility proven DEAD.** 15 verbs write detached DTO stores; `door.setType` cannot persist `systemTypeId` (field absent from `DoorData`); `room.setMaterial` accepts a catalogue id, reports success, writes nothing; `preview-gate.ts` and all PDF cost gating are dead. | Non-chat dispatch is unaudited. | **FALSE for visibility; PARTIALLY VERIFIED elsewhere** |
| **I4** Declaration must be executed | Yes | Yes — 138 examples **executed** | `✓ all targets proven both ways`, 24 adversarial utterances non-mutating | Proves route+target symmetry, **not** authoritative-state mutation | **VERIFIED (declaration↔route)** / **UNPROVEN (→state)** |
| **I5** Both directions, or neither | Yes | Yes | `UNDECLARED: 0` — 319 commands, 45 declared, 274 individually classified | Blind to non-chat dispatchers | **VERIFIED** |
| **I6** Partial reported as partial | **Yes, at the engine. NO, at the transcript** | Yes — 50 executed tests | Engine layer **VERIFIED**: `deleteElementsBatch.test.ts:98` explicitly pins *"a batch where NOTHING is deletable refuses instead of reporting success"* — case 5 ≠ case 4, green. **Then `batchCatalogue.ts:500` discards `res.info` and renders "Done".** No test in any suite touches `dispatchBatchEntry`. | The 27 green bridge tests make it *look* covered — the only "Done" assertion guards the throw path. | **VERIFIED (engine) · FALSE (transcript) · ENFORCEMENT-BLIND** |
| **I7** Aggregate success ≠ proof | Yes, repeatedly | Yes | `255/255 ✅` over the wrong denominator **and** against an absolute floor. C10's NFTs: AI critique (8 s) measured by a 2 µs multiplication; 4 MB bundle by gzipping 318 bytes; 5 % CPU by a string builder in ms; 10k-element load by a call loading **zero** elements. `shrinkPolygon` gates a mitre offset on **centroid radius**. The L-825 fix's load-bearing gate is still the **shape-blind area ratio**. | — | **FALSE in performance and roof geometry** |

---

## 6. Historical defect recurrence

| Class | Recurrence | Evidence | Severity | Gate detects? |
|---|---|---|---|---|
| **A — Dead verb** | **YES** | 15 verbs still registered writing detached DTO stores; `door.setType` cannot persist its own field; `room.setMaterial` silently discards catalogue ids; **P7 visibility terminates in `console.debug`**; `preview-gate.ts`, `src/cv/**` and the entire PDF cost-cap machinery (`PDF_TO_BIM_PER_PAGE_CEILING_USD`, ADR-0229's $10 hard cap) are wired to nothing; `AI_FALLBACK_THRESHOLD` is asserted by a test and read by no production code. `create-wall` honestly ratcheted as UNPROVEN. | **P0–P1** | **Partially** — chat-reachable routes only; contained at two entry points, **open as a class** |
| **B — Blind arithmetic / blind gate** | **YES** | P8 gate: wrong directory *and* absolute floor. C10 NFT proxies. `shrinkPolygon`'s centroid-radius gate. The L-825 area-ratio gate. **I reproduced the class myself** with the 688-file THREE grep. | **P0** | **No — it *is* the gate.** Nothing audits gate reach |
| **C — Plausible fallback** | **YES — worse than expected** | `applyOverhang` centroid dilation (300 mm → 212 mm); `shrinkPolygon` drops 49 %-class vertices and returns 2-vertex "polygons" as success; **mansard silently returns a hip, pitched returns flat**, identical type, no log; a **convex hull committed as the building perimeter** (self-declared in `WallRegionExtractor.ts`, bridges the notch on every L/U/courtyard plan, then feeds the broken roof offset); `repairToSimplePolygon` invents a boundary with no log and stamps it `detectionMethod:'ai-generated'` — while the sibling `SlabFragmentBuilder.ts:706` **refuses** on identical input, citing ADR-0299. | **P0** | **No** |
| **D — Self-output executed as intent** | **YES — live, destructive** | `"highlight walls taller than 3m"` → `wall.updateDimensions` at HEAD. L-823's pasteback family is fixed; the general rule (claiming discipline) has **no general gate** — C68 §6.3-G10 says so and names this instance. | **P0** | **Partially** — 4c executes only the corpus someone wrote; cannot bind a *new* grammar |
| **E — Under-counting audit** | **YES ×4** | Three undeclared ratchet breaches → CI red; P8 under-counts by directory trees; docs report 8 unclassified packages where the gate reports 13. **Scene isolation: injection performed** — label sprites, unstamped fallback boxes and generated groups produce **no finding at all**. | **P0** | **No** — but see the honesty clause below |

**The class done right, worth preserving:** the isolation audit now prints its own coverage on **both** the clean and violation paths — my all-five injection produced `scene.foreignElement×2` **followed by** `⚠ 3/6 scene root(s) UNATTRIBUTED … neither proven clean nor proven leaked: [Sprite, Mesh (unnamed), Group "massing-A"]`. That is the difference between *under-counting* and *declaring the count is a floor*. The detection is still partial; **the verdict is honest.**

---

## 7. D14 capability audit

Executed `check-chat-capability-coverage.ts` — **PASSES**:

```
registered bus commands: 319 · chat capabilities: 45 covering 31 command(s)
explicitly deferred: 51 · classified (237): B 133 · C 50 · D 48 · E 3 · F 3
UNDECLARED: 0 (baseline 0)   ✓ all targets proven both ways
✓ 138 examples executed (1/1 unresolved) · 24 adversarial utterances, none mutating
  · 15 spatial scope probes honoured · 36/45 pinned
```

**The strongest subsystem in the repository.** Both directions close at zero, evidence is *executed* rather than asserted, and the 274 non-declared commands are individually classified rather than ignored.

**What it does not prove:** that execution mutates **authoritative state**. §8's questions 7–9 are **UNPROVEN for every sampled capability** — a probe was still compiling at cut-off and its results are not claimed. It is also **enforcement-blind outside chat**.

**Declared-but-refused (the lying-table class):** not found among chat capabilities; found one layer down — `room.setMaterial` advertises `supportsColor` without `supportsMaterialId:false`, so a catalogue pick is sent, accepted, reported successful and discarded, with the inspector's live repaint implying success. The correct expression (`MATERIAL_ID_UNSUPPORTED_REASON`) already exists and was not used.

**Six ratchets pinned at ceiling, none improving:** unpinned 9/9 · spatial reach 24/24 · unreachable properties 42/42 · case arms 27/27 · unclassified global routes 1/1 · unresolved examples 1/1.

---

## 8. D15 planning / envelope audit

**The derivation chain is a real construction, not a lookup — PARTIALLY VERIFIED (by read; no end-to-end solve executed).**
`resolveParcelWithFallback → resolveZoneDisposition → dissolveParcelsToBlockRing + classifyBlockFrontages → computeBuildableEnvelope → classifyEnvelopeCompleteness`. Block geometry is **injected, never fetched** inside the L2 engine — purity preserved.

**The envelope carries what it must — VERIFIED as a schema.** `BuildableEnvelope.ts` (731 lines) carries `ordinanceRef` citation, **17 typed determinations**, an **11-member closed refusal union**, and — best-in-repo — *ownership* of missing information via `envelopePublicationAuthorisation()` and `l449CertificationGates.ts`. Four Zod cross-field refines enforce the honesty seam, notably **`refusal !== null` ⟺ `status === 'not-applicable'`**.

**Estimates cannot silently become authoritative — VERIFIED.** `capEnvelopeConfidenceToPackDefault()` is a **ceiling, not an assignment**; a solve can only be weakened, never promoted.

**But the refusal direction is leaking — REGRESSION, gate red on main.** Executed:
```
[zoning-fidelity-label] ❌ FAIL — 1 violation:
  [C/refusal-without-code] apps/editor/src/ui/layout/GISAreaLayout.ts:2770
    2 of 6 refusal reason arms render a refusal WITHOUT interpolating `r.code`.
```
An unattributable "no" — the Madrid *"un tram de vial"* case losing its identity at the render layer (C58 §1.13 / L-550 / L-574).

**The denominator rule is not expressible in the type system — UNPROVEN / ENFORCEMENT-BLIND.** C63 is ratified: score against **buildable** land. There is **no `buildableLand`, `netLand`, `grossLand`, `cesion`/`cesión` identifier anywhere in TypeScript source.** What exists is a `ratioBasis` **metadata string** and a one-off script (`tools/valencia-envelope-max/05-denominator.mjs`) modelling *cesión* as "street holes". The engine cannot distinguish "FAR × gross plot" from "FAR × net lot", and `densityCoherence()` validates that FAR/coverage/height agree — **a healthy aggregate over an unmodelled denominator.** This is L-616 one level up: not a wrong number, but *a distinction the model cannot represent*, which is how wrong numbers get minted silently.

**The reference erosion is the right one — VERIFIED as design.** `insetPolygonPerEdge()` is a true capsule-union erosion that **re-tests its own output against an independently-derived predicate**, and its header states the discipline the roof packages violate: *"Neither module owns a second offset routine."*

---

## 9. Geometry correctness

### The L-825 floor-finish fix is independently VERIFIED

Not by running its tests — by an oracle computing its own invariant. A constant-distance inset by `d` maps every edge midpoint to exactly `d` from the source boundary; a centroid similarity scale produces pullback **proportional to distance from the centre**, so **the spread is the discriminator the area gate is structurally blind to.**

| Fixture (target 100 mm) | pullback | spread | verts outside |
|---|---|---|---|
| plain 20×4 | 100.0..100.0 | 0.0 mm | 0 |
| rounded 20×4, 16 chords/arc | 99.9..100.0 | 0.1 mm | 0 |
| …ONE chord's wall-match missed | 99.9..100.0 | 0.1 mm | 0 |
| …THREE missed | 99.9..100.0 | 0.1 mm | 0 |
| rounded 8×6 / 3×3 | 100.0..100.0 | 0.0 mm | 0 |

**A true constant-distance inset on every fixture, including the deliberately sabotaged arc cases.** *Honest limit:* 60+ synthetic fixtures could **not** reach the pre-fix centroid shrink — consistent with the commit's claim that it required a bow-tie cascade on a traced irregular shell, but the original defect remains **unreproduced by me**.

### The findings — the same algorithm exists at three levels of correctness

**P0 · `applyOverhang` is a centroid radial dilation presented as an offset.** `geometry-kernel/src/producers/_internal/roof/polygon.ts:120-132` pushes each vertex `d` metres *radially from the arithmetic centroid* — a star dilation. Perpendicular gain on a square is `d·cos45° ≈ 0.707d`: **a 300 mm eave delivers 212 mm**, anisotropically worse on elongated plans. Its docstring's claim that it *"works correctly for convex polygons"* is **false for every convex polygon that is not a circle**. Live: `producers/roof.ts:77 → index.ts:39 → plugins/roof/src/committer/roof-committer.ts:84,111,129`.

**P0 · `shrinkPolygon` deletes vertices and validates against centroid radius.** `:139-184` (+ verbatim twin at `RoofGeometryBuilder.ts:1096`). `:164` **drops a vertex entirely** on near-parallel edges — measured at **49 % of vertices on real cadastral rings**; dropping one changes which edges are adjacent, so the survivor is not an offset of the input at all. The only gate is `dist² ≤ maxOrigDistSq * 1.1` — the plausible-shape metric. `>= 2` vertices returns as success.

**P0 · A convex hull is committed as the building perimeter.** `WallRegionExtractor.ts` says so itself: *"a convex hull cannot represent L-shaped, U-shaped, or courtyard buildings."* It bridges the notch, and `AIService.ts:299-315` hands it to `CreateRoofCommand` as an authored footprint — into the two defects above.

**P1 · A roof silently becomes a different roof.** `RoofGeometryBuilder.ts:612-618` — a mansard whose shrink collapses returns `generateHip()`. Same at `:506` (pitched → flat), `:624`, and mirrored in the kernel. Identical `BufferGeometry`, no log.

**P1 · The honest discriminant is discarded at the wrapper.** `polygonOffset.ts` returns a proper discriminated `OffsetResult`; `RoofGeometryBuilder.ts:1073-1087` **flattens it to `Pt[]`** and reports degradation via `console.warn` only. A roof with **zero overhang where 300 mm was specified** is committed, serialised and dimensioned as authoritative. Its docstring's *"never silently substituted"* is true only for a human with devtools open.

**P1 · The L-825 fix computes the right invariant and never enforces it.** `RoomPolygonUtils.ts:1222` computes the pullback spread; `:1226` prints it in a template string; **`grep -n "spread"` returns those two lines and nothing else.** The load-bearing gate at `:1214` is still `innerArea >= 0.5 * baseArea` — the shape-blind area ratio the commit correctly diagnosed. Worse, exact-vs-fallback is discriminated by **array reference identity** (`:1205`): any refactor adding a `.map`, spread or memo converts every fallback into a silent success.

**P1 · A ring is invented and stamped as authored.** `roomFromGraphSpec.ts:66-72` calls `repairToSimplePolygon` (which **excises the smaller lobe of a self-crossing ring — it invents a boundary**) with **no log**, returning `detectionMethod:'ai-generated'`. Three sibling call sites, three policies; only `SlabFragmentBuilder.ts:706-733` refuses, citing ADR-0299 §RECOVERY-MUST-REFUSE.

**P2/P3 ·** `MiterPrismBuilder.ts:241` degrades to a butt-capped box with a **one-shot** warn (40 degraded walls → 1 log line); centroid-fan triangulation emits triangles **outside** concave rooms (disclosed, scheduled S30); `outsetPolygon`'s anti-parallel branch folds (contained).

**Cleared as genuinely correct:** `insetPolygon.ts`, `blockConcentricBand.ts`, `geometry-roof/src/pure/polygonOffset.ts`, `SlabFragmentBuilder.ts:706-770`, `WallFragmentBuilder.ts:2396`.

> **The structural finding:** the same offset algorithm exists in **three** places at **three** levels of correctness — fixed and honest, half-fixed, and untouched. **The untouched copy is the one wired into the plugin committer.** L-825 was fixed in one package; its twin shipped on in two others.

---

## 10. Chat / language execution and partial reporting

**The engine reports honestly — VERIFIED by 50 executed tests** (`updateWallsRakeBatch` 6, `deleteElementsBatch`+2 others 17, chat bridge 27, all green). `deleteElementsBatch.test.ts:98` explicitly pins *"a batch where NOTHING is deletable refuses instead of reporting success"* — case 5 ≠ case 4, executed. The classic conflation genuinely does not recur at the command layer.

**Then the last layer throws it away — FALSE:**
- `apps/editor/src/ui/create/batchCatalogue.ts:500` — `if (res?.success) return { ok: true }` **discards `res.info`**, the entire engine payload. Rendered at `AIPanel.ts:1282`, `CreatePanelLayout.ts:411`. **No test in any suite touches `dispatchBatchEntry`.**
- `executeSlice`: no report → `{ok:true, lines:[]}` → **"Done"** (case 6, the engine-cannot-determine case, has no representation).
- `ZeroTokenChatBridge.ts:858-861` — a partial across multiple commands is reported as **total failure**; `batchReports[0]` discards later reports.
- `roomFinishChatSeam.ts:205/:301` emits `success:true` **after a total timeout**.
- `if (cm)` silently skips across **eight** batch handlers; `v.reason ?? 'refused'` bypasses the L-813 human-readable-reason fix.

**Why this is dangerous rather than merely wrong:** the 27 green bridge tests make the area *look* covered. They cover refusals and dispatch failure; the only `"Done"` assertion guards the **throw** path. **Every finding here survives a fully green run.**

**Self-output executed as intent — live at HEAD.** Proven:
```
git show HEAD:…/CapabilityRefusal.ts | grep -c visibilityMisreadReason → 0
grep -c visibilityMisreadReason  …/CapabilityRefusal.ts                → 1
```
Root cause is structural: **a read-only / visibility capability class does not exist**, leaving 71 phrasings served only by the legacy QueryEngine — so every visibility question is a candidate to be claimed by a write grammar.

---

## 11. Deterministic-first AI

**Chat — VERIFIED.** `ZeroTokenNoLlm.spec.ts` + `LlmPlannerBridge.spec.ts`: **27/27 passing**. The ladder order (tier-0 → tier-1 → NL → planner → legacy) is structurally present with the planner as the **last** rung, its vocabulary generated from the registry.

**PDF→BIM — the ladder is real, its honesty is not.** `apps/ai-worker` = **133/133 tests passing**. The ladder lives at `Step4AnalysisView.ts:273`; tier order is **VERIFIED** (each tier terminates; tier 3 is structurally unreachable unless both deterministic tiers return null). Furniture/Plumbing ship **unchecked**, so a default successful run makes **zero** model calls — but **no executed test proves it**: not one spec imports `handleAnalyse`, `tryVectorRecognition`, `tryRasterRecognition` or `probeAiAvailability`. **The tier boundaries — the four decisions that make it a ladder — are asserted only in comments.**

**And ADR-0229 is severe DOCUMENTATION DRIFT.** Status "Accepted", never superseded, describing a wholly AI-dependent pipeline (*"AI labels each page"*, *"AI reads the scale bar"*, $1.50–3.00 per set, a *"$10 per-extraction hard cap"*). The shipped product does page/scale/wall/opening extraction with **zero model calls** and has **no cost cap on the live path at all** — the module that computes the preview label (`preview-gate.ts`, mandated by ADR-0229 Part E) is called by nothing, and `src/cv/**` with its `$0.05` per-page ceiling is dead.

**Correction issued during the audit:** the ladder doctrine *is* recorded at the top of the governance order — `STR-03:133-136` and `:226` (where the "PDF-to-BIM as a primary on-ramp" non-goal is struck through and retired, while honestly adding *"It is still not claimed to be reliable at production grade"*), and `STR-04 §15.6`. So the drift is **one-directional**: ADR-0229 is a stale ADR that now contradicts both the code and the two strategy documents that outrank it. The remedy is a cheap supersession note, not a new architectural ratification.

**One further gap:** `apps/bench/` has two PDF benches, both covering only the **tier-1** classifier. **Tier 2 (`raster-cv.ts`) has no bench at all** — despite being the expensive tier (Otsu + despeckle + morphology + Hough over a full-resolution RGBA buffer), and `Step4AnalysisView.ts:221` calls `analyseRasterFloorPlan` **synchronously on the UI thread with no worker and no yield**. An unmeasured jank risk on the deterministic path the product now depends on.

---

## 12. CI gate audit

**Executed suite: `15 passing · 17 failing (14 declared debt, 3 regression) → BLOCKED`.**

| Gate | Claims | Actually checks | Sees subject? | Neg-tested | Status |
|---|---|---|---|---|---|
| `check-single-compose` | P1 | defs/rivals/callers | Partially (self-declared) | no | ✅ (1 blessed rival) |
| `check-three-imports` | P2 | static `from 'three'`, 6,378 files, floor 3000 | ✅ | **historically yes** | ✅ 0 |
| `check-raf-count` | P3 | rAF, comments filtered | ✅ | **historically yes** | ✅ 1 |
| `check-domain-purity` | P5 | 7 rules, floor 100 | ✅ | no | ✅ 0 |
| `check-no-direct-store-writes` | P6 | `*Store` receivers, **floor 400** | Partially | no | ✅ 37/37 |
| `check-cast-count` | P4 | `(window as any)` | ✅ | no | ❌ **217>215, debt-absorbed** |
| `check-visibility-intent-not-ui` | P7 | ARM A purity + ARM B proxy | ARM B is a proxy | no | ❌ **REGRESSION 45>43** |
| `check-layer-boundaries` | layer rule | manifest alias map | ✅ (13 blind, `src/` unscanned, fail-open branch) | no | ❌ **REGRESSION 181>178** |
| `check-declared-project-scopes` | ADR-0298 | declared scopes | ✅ | no | ❌ **REGRESSION** |
| `check-otel-spans` | P8 | `plugins/` only, **absolute floor** | ❌ **NO** | no | ✅ over the wrong denominator |
| `check-chat-capability-coverage` | D14 | **executes** 138 examples + 24 adversarial | ✅ | yes, by design | ✅ |
| `check-zoning-fidelity-label` | C58 §6 | **regex scrape of `GISAreaLayout.ts`, no test of its own** | latent-blind | no | ❌ **FAIL — refusal without code** |
| `check-xss-guards`, `check-structuredclone-new-commands` | security / undo-clone | — | ✅ | no | ❌ debt-absorbed — **the two whose failure mode is a user-visible defect** |
| `check-project-isolation`, `check-scene-graph`, `check-geometry-ceiling` | C13 / scene | **shell out to `rg`** | ❌ on a stock Windows box | no | ❌ **exit 1 (absorbable) instead of 2 (misconfigured)** — directly contradicting `ci.yml:296-305`'s *"DO NOT reintroduce a gate that shells out to a tool this workflow does not install"* |

**`ci.yml` contradicts itself:** `:19-21` lists `ga-gate` under *"NOT yet required (advisory by design)"*; `:266-280` states *"MERGE-BLOCKING. `continue-on-error: true` is GONE."* Given three live regressions, that ambiguity is load-bearing right now. The job title says *31* gates; there are **32**.

---

## 13. Findings (ranked)

### P0

| ID | Finding | Path | Gate should/does catch |
|---|---|---|---|
| **P0-1** | **CI red on `main`** — 3 undeclared ratchet breaches (`layer-boundaries` 181>178, `visibility-intent-not-ui` 45>43, `declared-project-scopes`); suite BLOCKED | `tools/ga-gate/run-all.ts` | yes / **yes — nobody is reading it** |
| **P0-2** | **C10 §4's merge blockers have never blocked a merge**; §1.1's environment claim also false — two breaks in series | `.github/workflows/*`, `apps/bench/vitest.config.ts` | yes / **no gate checks any perf number** |
| **P0-3** | **P8 ENFORCEMENT-BLIND twice** — wrong directory *and* an absolute floor instead of a ratio | `check-otel-spans.ts:78-101, :133` | yes / **no** |
| **P0-4** | ~~A read-only question mutates geometry; the fix is uncommitted~~ → **CLOSED DURING THIS AUDIT** at `fd27e513`. Guard sits at the *ladder* level (both tier-0/1 paths + NL, one shared definition) and deliberately does not blanket-ban visibility verbs, so `show level 2` still works. **21 of 29 drain items now drain; 8 remain, named individually.** The underlying structural gap stands: **a read-only/visibility capability class still does not exist** | `CapabilityRefusal.ts`, `ZeroTokenResolver.ts:3296-3333` | C68 G10 says it cannot |
| **P0-5** | **`applyOverhang` is a centroid dilation sold as an offset** — 300 mm → 212 mm; the fixed version already exists next door | `geometry-kernel/.../roof/polygon.ts:120` | **no** |
| **P0-6** | **`shrinkPolygon` deletes vertices, gates on centroid radius, returns 2-vertex polygons as success** | same file `:139-184` + `RoofGeometryBuilder.ts:1096` | **no** |
| **P0-7** | **A convex hull is committed as the building perimeter** (self-declared) | `WallRegionExtractor.ts` → `AIService.ts:299` | **no** |
| **P0-8** | **Partial reports collapse to "Done"** — `res.info` discarded; case 6 unrepresentable; total-timeout reports success | `batchCatalogue.ts:500` | **no — untested path** |
| **P0-9** | **P7 is DEAD** — five handlers are `console.debug`; `IsolationStateStore` has zero production consumers; no persist/undo/sync | `plugins/visibility-intent/src/handlers/index.ts:34-74` | **no** |
| **P0-10** | **Refusals render without their code** — an unattributable "no" | `GISAreaLayout.ts:2770` | yes / **yes — currently red** |
| **P0-11** | **CLAUDE.md's conflict order omits 53 contracts** (*"C01–C15"*) — an agent following it literally ranks C68 below an ADR. **Highest-leverage single-line fix in this audit.** | `CLAUDE.md:140,146` | **no** |
| **P0-12** | **STR-03 §2 cites four gate files that do not exist**, all marked hard-fail ✅ — **L-812 re-appearing inside the document that records L-812's lesson**, revised the same day | `STR-03:42,46,47,48` | **no** |

### P1

`P1-1` dead-verb class contained at two entry points, not closed (15 verbs; plus an undo hazard where `affectedStores:['wall']` routes to the **geometry** store) · `P1-2` roof form silently substituted (mansard→hip, pitched→flat) · `P1-3` honest `OffsetResult` discarded at the wrapper · `P1-4` the L-825 fix's right invariant computed and never enforced; exact-vs-fallback discriminated by **array reference identity** · `P1-5` `repairToSimplePolygon` invents a boundary, no log, stamped as authored — while a sibling refuses on identical input · `P1-6` C63's buildable-land denominator not expressible in the type system · `P1-7` three wall mutations use three different undo stacks · `P1-8` **no wall property mutation reaches sync** (height/colour/rake/layers have no path into `YjsDocAdapter`) · `P1-9` P6's 37 blessed writes include committed model data invisible to undo/CRDT/event log · `P1-10` D3 collaboration overstated — C66: all three tiers CLAIMED, **zero HELD**; STR-01:50's *"hundreds of concurrent edits"* is UNPROVEN · `P1-11` STR-06..STR-15 CANONICAL on stale facts; **STR-12 names none of C57/C58/C60/C62/C63/C64**, its own subject's governing contracts · `P1-12` "hard-fail" overstated (3 of 8, not 6 of 8) · `P1-13` the C00 index stale in the one place CLAUDE.md defers to · `P1-14` PDF→BIM: five failure-vs-empty defects + ADR-0229 severe drift + all cost gating dead · `P1-15` `room.setMaterial` silently discards catalogue materials · `P1-16` P1 has a declared second composition root.

### P2 / P3

Stale counts in documents revised today (41→45 ×4, 47→48 ×2, "21 gates" contradicting the same file's 32, "108 ADRs", "C01–C49" ×3, "D1–D13" now D15) · STR-04 §9:436 *"CANONICAL suite (C01–C18) is enforced today"* false twice over · unclassified blind spot 13 vs documented 8 · stale numbers **inside** the enforcement machinery (`check-layer-boundaries.ts` carries three numbers for two invariants) · scene audit blind to sprites/unstamped boxes/generated groups (**honestly declared**) · three gates shell out to `rg` · `check-zoning-fidelity-label` is an untested regex scrape · `MiterPrismBuilder` one-shot warn · broken link STR-02:624 · centroid-fan triangulation (disclosed, S30) · README:74 presents a May snapshot in the present tense.

---

## 14. NOT-YET-TRUE register

The convention is real, load-bearing and mostly well kept — N5, N7, N9, N10, N11, N12 are exemplary, specifying their own exit conditions and refusing to presume in either direction.

| # | Statement | Enforcement | Still honest? |
|---|---|---|---|
| N1 | plugins may import the SDK facade only — a GOAL | ratchet 178 — **BREACHED at 181** | ⚠ **NO** — docs 171, gate 178, reality 181 |
| N2 | `runtime-composer` is not really L3 | 16 of 102 violations | ✅ |
| N3 | `core-app-model`/`command-registry` at L2 importing L4 | inside the 102 | ✅ |
| N4 | backend packages have no layer — open question | ratchet 13 | ⚠ docs say 8, gate says 13 |
| N5 | **C68 is CANONICAL, not ACTIVE** | gate 31, negative-tested | ✅ **exemplary — the only fully specified exit condition in the suite** |
| N6 | the envelope fidelity-label gate does not exist | **it exists, on the failing ledger — and now fails on a real violation** | ✅, but ⚠ **a failing gate file reads as coverage** |
| N7 | refusal correctness never measured | none | ✅ |
| N8 | collaboration maturity overstated by D3 | C66: 3 CLAIMED, 0 HELD | ⚠ honest in §12.5, unqualified in 3 other places |
| N9 | C64 layers 2–4 unbuilt | n/a | ✅ |
| N10 | **claiming discipline has no general gate — one of the 29 already is destructive** | regression-only | ✅ **strongest form — it names its own live destructive instance** |
| N11 | `create-wall` is UNCLASSIFIED, not live | ratchet 1 | ✅ |
| N12 | *"All gates MUST pass — currently untrue"* | ledger blocks regressions | ✅ stated inside the ledger — ⚠ CLAUDE.md still asserts the absolute form to every agent |

**Three recurring failure modes:** (a) the disclosure lives one document away from the claim; (b) the numbers inside the disclosure went stale the same day; (c) a *failing* gate file reads as coverage to anyone who does not open the ledger.

---

## 15. Recommended ratchets

> A baseline is not permission. It is a debt with a name.

**R1 — OTel coverage outside `plugins/`, and as a ratio.** *Metric:* uninstrumented exported functions in `packages/**` + `apps/**`. *Baseline:* **measure first.** *Also change the existing condition to `uninstrumented.length === 0`* — the 42-file gap between floor (213) and total (255) is the exact size of the current hole. Until then **STR-03 §2's P8 "hard-fail ✅" must read ENFORCEMENT-BLIND.**

**R2 — Bench *invocation*, not existence.** *Baseline:* **0 of 17.** Must land **with** the `@vitest/browser` migration C10 §1.1 already claims, not before it — a Node-environment result would not mean anything.

**R3 — One offset routine per repo.** *Metric:* independent polygon-offset/inset implementations. *Baseline:* **3** (`geometry-roof/pure/polygonOffset.ts` correct · `RoofGeometryBuilder.ts` half-migrated · `geometry-kernel/.../roof/polygon.ts` untouched and **wired to the committer**). *Exit:* 1, plus `insetPolygon.ts`'s erosion. `insetPolygon.ts:30-33` already states the rule: *"Neither module owns a second offset routine."*

**R4 — Reporting-layer honesty.** *Metric:* dispatch sites that discard an engine `info`/report payload. *Baseline:* measure from `batchCatalogue.ts:500`, `ZeroTokenChatBridge.ts:858`, `roomFinishChatSeam.ts:205/301`, the eight `if (cm)` skips. *Cannot see:* a report that is present but wrong. *Exit:* zero — every dispatch either renders the engine's words or names why it could not.

**R5 — Generalise `MIN_FILES`.** *Baseline:* **31 of 32** gates lack a subject floor. **Cheapest available insurance against the next L-809/L-774.** Pair it with: a missing external binary must exit **2 (misconfigured)**, never **1**, so it can never be absorbed as debt.

**R6 — Gate-path validity in canonical docs.** *Baseline:* **4** (STR-03 §2). *Exit:* **zero immediately — do not ratchet this.** Extend `run-all.ts`'s existing missing-file pre-flight to the doc-cited set.

**R7 — Ledgered gates must still ratchet.** *Baseline:* **1** (`check-cast-count`, 215→217). A ledgered gate currently hides its own growth.

**R8 — Count freshness.** *Baseline:* **9**. Better than a ratchet: **delete the transcription and cite the artefact**, which C64 §2.13 already binds `docs/` to do for coverage percentages.

---

## 16. Completeness and evidence standard

**Verified by execution:** all eight principle gates; the full GA suite; the D14 capability gate with 138 executed examples; 50 partial-reporting tests; 133 ai-worker tests; 27 zero-token tests; an **independent geometry oracle** (6 fixtures, HEAD and pre-fix); an **independent scene-isolation injection** (6 scenarios in a real THREE scene, each reverted); `check-zoning-fidelity-label` failing.

**Verified by read + corroborating source:** the roof geometry findings (the arithmetic in P0-5/P0-6 is self-evident and P0-5 is corroborated by the sibling package's own fix commentary), the envelope schema.

**UNPROVEN and marked as such:** §8's questions 7–9 for every capability (probe still compiling at cut-off — results not claimed); the pre-fix L-825 defect could not be synthetically reproduced; no end-to-end parcel→envelope solve; Cesium primitives and coalesced instanced roots not injected; PDF tier boundaries untested.

**Negative testing:** performed historically and recorded for P2 and P3 — both gates were caught passing while blind, and rewritten. **Not performed in this audit** for the layer, OTel, isolation or capability gates. Those are marked UNPROVEN rather than claimed. Priority order for injection, since one is *predicted to fail to fail*: `check-otel-spans` (P0-3 predicts it will **not** fail), `check-layer-boundaries` (fail-open branch), `check-three-imports` (dynamic import), `check-cast-count` (`window as unknown as`).

**Tree integrity:** no repository file was edited, no commit, no push, no `git stash` (the global stack holds three foreign entries, untouched). All probes live in the session scratchpad outside the repo.

---

## The pattern worth carrying forward

The five defect classes have not stopped recurring — **but the recurrences are overwhelmingly found by the repository's own instruments.** `create-wall` by check 3e, the 29 misreads by the drain spec, the 13 unclassified packages by the layer gate, the three ratchet breaches by their own ratchets, the refusal-without-code by its own fidelity gate. That is STR-03 §12's correctness culture working, and it is rare.

**Two failure modes remain, and both are narrow enough to fix.**

**First: the last layer throws away the honesty the engine produced.** `batchCatalogue.ts:500` discards `res.info`. `RoomPolygonUtils.ts:1222` computes the discriminating spread and prints it to a string. `RoofGeometryBuilder.ts:1073` flattens a discriminated union to a bare array. In all three the system *knows* the truth and declines to carry it one layer further. That is a single, teachable rule: **the layer that knows must be the layer that reports.**

**Second: the documents did not move with the fixes.** P0-3, P0-11 and P0-12 are one shape — an enforcement claim that outlived the code it described. STR-03 §12.2 names *"the gate whose own arithmetic disproves its verdict"* as class 2; **P0-12 is a document whose own repository disproves its verdict, sitting inside the section that teaches the lesson.**

And by §12.4's own standard — *a gate nobody has watched fail is a gate nobody should trust* — **P0-2 remains the sharpest instance in this audit: seventeen benchmarks nobody has ever watched fail, because nothing has ever run them.**

---

# §17 Remediation annotation — 2026-08-11 (post-audit)

**Annotated:** 2026-08-11 · **Baseline of the annotation:** `main` @ `c7690b60` ·
**Range reviewed:** `e205864e..HEAD`, 34 commits ·
**Method:** every status below is backed by a **commit SHA** whose diff or message was read
(`git show <sha> --stat`), by an **executed gate reading**, or by a **read of the file at HEAD**.
Where none of those was available the row is marked **UNVERIFIED** and says why.

**The annotation rule.** §1–§16 are not edited. They are the record of `9ad92622`. This section
adds status; it never revises a finding. Two of the audit's findings turned out to be
**materially wrong**, and one of them (**P0-10**) would have caused damage if implemented —
those are recorded here as CORRECTED, with the counter-evidence, rather than erased above.

---

## §17.0 The meta-finding — the audit's premise was half right, and the wrong half was the important one

> The audit's premise was that **implementation had drifted from documentation.** What the
> remediation found is that **the measuring instruments were broken.**
>
> **Fifteen gates reported numbers they had never measured. Eight guarded invariants that had
> been clean for months.** `check-project-isolation` returned a well-formed literal `0` for all
> four C13 anchors on every Windows run while all four were present (33/3/1/1) — it did not
> crash, so "I could not look" and "I looked and found nothing" were the same value.
> `check-scene-graph`, `check-geometry-ceiling` and six more died on `spawnSync … ENOENT` at
> **exit 1 — the same exit code a real violation produces** — so the debt ledger recorded a
> crash as merit. `check-zoning-fidelity-label` was not blind but **lying**: it accused honest
> source. And `check-motion-gate-coverage` printed a **FALSE STRUCTURAL CLAIM** — *"R11
> structurally retired — no Canvas2D view manager files found at any candidate path"* — about a
> directory holding **83 files**, and it was **EXITING 0**, so it was never even on the debt
> ledger. Green and blind is the most dangerous state a gate can occupy, and it is the one state
> no ledger can see.

The corollary reframes §12 and §15 of this document: **the three "regressions" that made §1's
verdict RED were not three regressions.** Two of them were one artefact — a single file deleted
by a concurrent stream, which `git ls-files` still listed from the index, so three gates threw
ENOENT and the suite recorded three separate failures (`9044f69f`). One was the lying zoning gate
(`c3d74927`). Exactly one — P7 visibility at 45>43 — was a real breach, and it is now closed at
40/43 with the baseline never raised (`e021513d`).

**This does not vindicate the repository.** It relocates the defect. An enforcement layer that
cannot be trusted to report its own subject is a worse finding than the drift the audit set out
to measure, because every other number in this document was read through it.

---

## §17.0.1 The deepest structural finding — it post-dates the audit entirely

**`composeRuntime` composes only the plugin-DTO half of the model.** Measured by a real headless
composition (`821a5d0b`) — real `composeRuntime`, real `bootstrapWithEverything`, happy-dom,
51 slots, bus registry 236, **zero stubs on the measured path**:

```
runtime.stores exposes: registerHydrator, hydrate, viewState, project
wallStore=ABSENT  slabStore=ABSENT  roofStore=ABSENT  stairStore=ABSENT
columnStore=ABSENT curtainWallStore=ABSENT gridStore=ABSENT beamStore=ABSENT
handrailStore=ABSENT roomStore=ABSENT ceilingStore=ABSENT floorStore=ABSENT
furnitureStore=ABSENT plumbingStore=ABSENT
doorStore=MODULE-SINGLETON  windowStore=MODULE-SINGLETON
```

The stores the serializer, the builders, the 2-D projector and the IFC exporter actually read are
built by `engineLauncher` — the DOM/renderer half — and are **never referenced by
`composeRuntime`**. Doors and windows are reachable only by accident of module scope.
**For twelve element kinds, "did this command change authoritative state?" is unprovable by
construction.**

That is very likely the **single common cause** behind three findings this document treats as
separate: the dead verbs (§6 class A), the shadowed routes (L-839 / `roof.update` and its fifteen
siblings), and the lying move verbs (§17.3 N-1). A verb can dispatch cleanly, return
`success: true`, arm an undo pair, and change nothing — not because its author was careless, but
because the composition root never gave it anything authoritative to write.

Measured, not inferred, in the same probe: `door.create` dispatched OK with the authoritative
`doorStore` going 0 → 0; `door.move` refused *"door not found"* against a door that **is**
authoritative. Both of that probe's passes came via persistence and `command-registry`, **never
via the bus**. Every green cell was watched failing before it was believed.

---

## §17.1 P0 status

| ID | Status | Evidence |
|---|---|---|
| **P0-1** CI red on `main`, 3 undeclared ratchet breaches | **CORRECTED** | **None of the three was the regression this document describes.** `check-declared-project-scopes` + two others all died on ONE file a concurrent stream had deleted: bare `git ls-files` lists the *index*, so the gates read a tracked-but-deleted path and threw ENOENT at exit 1 — the suite recorded three separate REGRESSIONS from one artefact (`9044f69f`). With the crash fixed, `check-layer-boundaries` reads 102/102 · 13/13 — **the "103 violations" was the same artefact.** `check-zoning-fidelity-label` was a false accusation (see P0-10). The one real breach, P7 45>43, is closed (see P0-9). **Executed today** — `npx tsx tools/ga-gate/run-all.ts` → **`35 passing · 4 failing (4 declared debt, 0 regression)`**. The suite is still **BLOCKED**, but by declared debt plus one exit-3 ratchet, not by any regression. |
| **P0-2** C10 §4's merge blockers have never blocked a merge | **CHANGED** | `c7690b60`. Benches now **execute** in CI: `ci.yml:400` `nft-bench`, **0 of 19 → 16 executing**. But three things differ from the finding. (a) **C10 defines 19 NFTs, not 17** — the brief, C10 §4's own row and the ratchet spec all said 17; NFTs 18 and 19 were outside every count. (b) A **fifth** rival target set was found (this document knew of four); `nft-targets.ts` now mirrors C10 verbatim with `c10-crosscheck.test.ts` parsing the C10 markdown *at test time*, and `nftLimit()` **throws** for a not-yet-measurable NFT so a proxy bench cannot borrow C10's number. (c) **The job lands ADVISORY** (`ci.yml:35-37`, `:401`), so "never blocked a merge" is still literally true — it is now *measured* rather than *unmeasured*. **Two NFTs ship RED, targets not moved:** NFT 15 — `dist/` is **9.85 MB gzipped across 203 assets against a 4 MB budget, 2.5× over, the first honest bundle measurement ever taken** (the old bench gzipped export-name strings and asserted `> 0`); NFT 12 family-load unstable at 391.7 ms under parallel load, reported as NOT RELIABLY PASSING rather than green. The `@vitest/browser` migration this document's R2 required was **refused with reasons** — a browser-flavoured proxy is still not a compositor paint event, the honest measurement already exists at `tests/e2e/cold-boot.spec.ts`, and NFT 15 is a *build* quantity a browser cannot help with. |
| **P0-3** P8 enforcement-blind twice | **CLOSED** | `c3d74927` (L-830). ⚠ **The audit mis-transcribed the reading.** It records `255/255 ✅ · OK: 255 ≥ HARD_FLOOR(213)`. The gate actually printed **`255/256 … OK` and exited 0** — *it reported the violation inside its own headline number*. Both structural findings were real and are fixed. **Executed today:** Zone A (CommandBus handlers, **zero tolerance**) **256/256**; Zone B (command-registry + app handlers + plugin barrels — the families discovery never reached) 52 uninstrumented of 60 against a named shrink-only baseline of 52; Zone C **§CENSUS: 1,648 of 1,885 files declaring an exported function carry no span**, printed on every run and **explicitly NOT gated**, with the gate itself stating *"P8 as written in C10 §2 is not fully enforced by any gate in this repo."* The absolute floor is gone. |
| **P0-4** A read-only question mutates geometry | **CHANGED** | The resolver-level fix (`fd27e513`) **holds**: 0 mutations across 38 adversarial read-only phrasings including all nine imperative-plus-measurement forms (`5eebc32c`). But the finding was **larger than measured**: 35 of those 38 ended as an honest `miss`, and a miss falls through to `QueryEngine` — **which was mutating by default**. Measured with a stub `aiService` that *returns* a proposal (probing with `aiService === null` short-circuits the branch under test and yields a false pass): **7 failed / 46 passed**, including `'do not create 5 levels at 3m'` and `"don't make all slabs white"` — **the literal opposite instruction queued the mutation.** The scorecard's 38 were safe only because none happened to contain one of that table's unanchored regexes — luck, not a guard. Fixed by **inverting the default** (`QueryPattern.readOnly?: true`, mutating by default, safety opt-in), 57/57 after, with a positive control proving the harness can still see a proposal (`6b538355`). **The structural gap this document names — no read-only/visibility capability class exists — is still OPEN.** |
| **P0-5** `applyOverhang` is a centroid dilation sold as an offset | **CLOSED** | `26b7848c`. Oracle run against pre-fix code via `git show HEAD` (never `git stash`) for a requested 300 mm: square 212.13 (spread 0.00) · **elongated 40×4 → 29.85..298.51, spread 268.66 — one eave at a tenth of what was asked** · L-shape 121.77..260.96 · U-shape 183.24..228.13 · cadastral arc 204.48..297.20. This document measured only the square. **AFTER: every fixture 300.00 mm, spread 0.000 mm**, vertex counts preserved 4→4, 6→6, 8→8. R3 gate **executed today**: `0/0 implementation(s) outside packages/geometry-kernel/src/pure/polygonOffset.ts` across 4,478 files, pinned at **0**, not the 3 its header claimed — the pre-fix reading measured against the gate's own predicate was **4**, and a shrink-only ratchet parked at 3 is three free slots. ⚠ **One nuance inverts R3's prescription:** this document says the fix already exists next door and should be migrated across. It could not be. The correct implementation lived in `geometry-roof` (**L4**) and the shipping committer is reached through `geometry-kernel` (**L2**), which cannot import L4 — **the fix could never have reached production where it sat.** It moved **down**, not across. |
| **P0-6** `shrinkPolygon` deletes vertices, gates on centroid radius | **CLOSED · one sub-claim CORRECTED** | Fixed at `26b7848c`; all three collapse modes now REFUSE with a named reason (*consumed the ring* / *inverted the ring winding* / *collapsed the ring*). **The defect was worse than described, in a different way:** at the depth the **live hip branch** calls it, a square shrunk by its own inradius returned **four identical points** `[[5,5],[5,5],[5,5],[5,5]]` — not zero — so the apex-pyramid branch downstream was **dead code, unreachable because a collapsed ring never looked collapsed**. A U-shape shrunk 3 m returned 8 vertices AS SUCCESS with a pullback of 1000..2000 mm. ⚠ **CORRECTED: the *"49 % of vertices on real cadastral rings"* figure is NOT REPRODUCIBLE and is effectively fabricated.** Re-measured across 24–4000-segment arcs the loss is **1–3 vertices ABSOLUTE**, and the share **falls** with density — the opposite of the trend a 49 % figure implies. It was borrowed from a threshold six orders of magnitude looser. **Do not cite it.** |
| **P0-7** A convex hull is committed as the building perimeter | **CLOSED** | `26b7848c`, §W2A-HULL-IS-NOT-A-PERIMETER. Verified by read at HEAD: `packages/ai-host/src/AIService.ts:299-316` now calls `WallRegionExtractor.extractOutermostRegionResult()` and **throws a named refusal** when the hull bridges open air, identifying the offending edge — `throw` being the correct channel because the AI intent path already surfaces thrown reasons to the user. |
| **P0-8** Partial reports collapse to "Done" | **CLOSED** | `30b2e975` + `f8baded5`. The **probe is the strongest artefact**: the R4 gate was run against a *materialised* pre-fix tree (`git archive HEAD` → scratchpad; no `git stash`) → `FAIL: 12 sites discard an engine report payload`, then against the working tree → `OK: 0`. **Executed today:** `report-payload-discard — 1691 files scanned (excluded 314, floor 800) · OK: 0 dispatch sites discard an engine report payload`. Born at zero, so **not ledgered**. Six cases, six distinct transcripts, asserted by set-cardinality (21/21) with every count and skip reason being the **engine's own string**, joined but never re-narrated. **Case 6 had no representation at all before** and now reads *"I can't tell you what happened — the command was dispatched and sent no report back."* A total timeout is no longer a success. **CHANGED detail: ten batch handlers, not the eight this document named** — ceiling and slab were twins it missed. |
| **P0-9** P7 is DEAD | **CLOSED · CHANGED** | `e021513d`. **The sharpest finding of the remediation, and this document could not see it:** `runtime.viewRegistry.activate()` has **ZERO production callers** — every hit repo-wide is a test or `runtime-composer` itself, and `buildViewRegistrySlot` self-describes as a *"D.11-prep stub"*. So `activeViewId` is `null` for the entire life of a shipping session and the handlers' `activeViewId() === null → discard the intent` branch **would have fired 100 % of the time, forever**. The wiring was real, the store constructed, the handlers writing, **and the suite green** — because every test calls `activate(VIEW_ID)` in `beforeEach`, which production never does. **P7 was about to ship dead a second time, for an entirely new reason, behind a green suite.** Fixed by distinguishing never-set from set-to-none (failure is not emptiness): never-activated keys to a named `IMPLICIT_MODEL_VIEW_ID`; an *explicit* `activate(null)` still discards loudly and that safety property remains tested. **Executed today:** ARM A 0 across 20 files (hard-0); **ARM B 40/43 — the baseline was NEVER raised**. The gate still prints *"NOT CHECKED: persistence, per-view scoping, AI intent path — a pass here is NOT 'P7 holds'."* ⚠ **One founder judgement call is outstanding**: the `IMPLICIT_MODEL_VIEW_ID` semantics were decided rather than reported, and want confirmation. |
| **P0-10** Refusals render without their code | **CORRECTED — the audit was WRONG, and complying would have caused damage** | `c3d74927` / L-829. **`GISAreaLayout.ts` was ALREADY HONEST**: all four real refusal arms interpolate `${escHtml(r.code)}`. **The GATE was falsely accusing the source.** It sliced its region from `const reasonLine =` to a *later* `panel.innerHTML =` and harvested "arms" with a naive `` /`[^`]*`/g `` — sweeping in a backtick-quoted path **inside a comment** and the `manualZoneAffordance` **admin button** template. Neither can carry a refusal code. **Complying with this finding as written would have meant stamping a refusal code onto a button** — damaging an honest render to satisfy a bad regex. `GISAreaLayout.ts` was **NOT modified**. The gate was rewritten with a template-literal-aware tokenizer, content-based subject discovery (a rename can no longer blind it) and four honesty floors that exit 2; **19 specs where it had none**, and the negative test proves a stripped code still fails — counted correctly as **1 of 4**, not the phantom 2 of 6. ⚠ **A lying gate is worse than a blind one**: while it accused a phantom, a real codeless arm added next door would have been invisible inside the same count. **The class is real and is now gated separately** — `check-refusal-identity` (`f8baded5`), **executed today: 88 NAMED offenders (arm A 55, arm B 33)**, keyed by file+fragment rather than a count so a PR that fixes one and breaks another still fails. `maxHeightGate.ts` — whose result type has **no `code` field at all** despite citing C58 — is among them and remains **OPEN**. |
| **P0-11** CLAUDE.md's conflict order omits 53 contracts | **CLOSED** | `a79a17b7`. CLAUDE.md now enumerates **C01–C68 + C24.1** and defers explicitly to `docs/02-decisions/contracts/README.md` as the authority. |
| **P0-12** STR-03 §2 cites four gate files that do not exist | **CLOSED** | Verified by executing a path check over every gate path STR-03 cites: **all 11 `tools/ga-gate/*.ts` paths exist.** The three `scripts/ci-check-*.ts` strings that remain in the file appear **only inside the dated correction note at STR-03:39-47** that records their absence — corrected in place, never deleted, which is the doctrine. ⚠ **R6 itself remains OPEN**: no gate enforces doc-cited gate-path validity, so the next such citation is unguarded. |

---

## §17.2 P1 status

| ID | Status | Evidence |
|---|---|---|
| **P1-1** dead-verb class contained, not closed (15 verbs) | **CHANGED · closed for 17, open for 5 more** | `5e74b178`. **The brief said 15; it enumerated 17**, all measured dead rather than assumed: production `bootstrap.ts:92-97` hands the bus the fresh **plugin DTO stores**, while renderers, the 2-D projector, the IFC exporter and persistence all read the **legacy geometry singletons**, and only `<family>.created` is mirrored. **REFUSE, not retire** — and the reason is verified: `CapabilityRefusal` and `CHAT_UNAVAILABLE` both *name* these verbs and the D14 gate requires every named verb to be registered, so retiring them would make chat's own refusal cite a nonexistent command. The refusal lives in `canExecute`, so the bus throws **before arming either undo stack**. Three are dead for deeper reasons and now say so (`beam.setMaterial` — `BeamData` has no material field at all; `stair.setMaterial` — a fixed enum, not a catalogue id; `structural.setMaterial` — no runtime family exists). The undo hazard this document flagged was **proven, then proven closed**: one `PatchPair` keyed `'wall'` → the *geometry* store for a forward write geometry never saw, so Ctrl+Z rewrote `materialColor` using an inverse computed against the detached DTO store. **Five test files were pinning the lie** and were converted. **Executed today:** the C69 register reads **REFUSES 17**. ⚠ **Residue OPEN — see §17.3 N-1.** |
| **P1-2** roof form silently substituted (mansard→hip, pitched→flat) | **CLOSED** | `26b7848c` — impossible insets now REFUSE with a named reason instead of substituting a different roof. |
| **P1-3** honest `OffsetResult` discarded at the wrapper | **CLOSED** | `26b7848c` — one canonical offset routine; R3 executed at 0/0. |
| **P1-4** the L-825 fix computes the right invariant and never enforces it | **CLOSED** | Verified by read at HEAD: `RoomPolygonUtils.ts:1281-1287` — `_measurePullbackSpreadAtMidpoints()` is now the **load-bearing gate** (`spreadAll.max <= maxInset + SPREAD_TOL && spreadAll.min >= -SPREAD_TOL`), and `:1258` records that the old gate *was* `innerArea >= 0.5 * baseArea`. The array-reference-identity landmine is documented at `:216` and `:1246` and the shape gate no longer depends on it. |
| **P1-5** `repairToSimplePolygon` invents a boundary, no log, stamped as authored | **OPEN** | Verified unchanged by read at HEAD: `packages/room-topology/src/roomFromGraphSpec.ts:66-83` still calls `repairToSimplePolygon()` with **no log** and still stamps `detectionMethod: 'ai-generated'`, while the sibling `SlabFragmentBuilder.ts:706` refuses on identical input citing ADR-0299. **Blocked on: nothing.** It was simply not in this session's scope. |
| **P1-6** C63's buildable-land denominator not expressible in the type system | **CHANGED** | `74a20d37`. Closed **as a type**: `LandBasis` is an invariant branded L0 type beside `BuildableEnvelope`; mixing bases is now **TS2345**, verified by removing the `@ts-expect-error` and re-running `tsc`. Three properties make the error *unrepresentable* rather than merely detected — `(b: B) => B` forces invariance (without it TS's structural bivariance accepts a gross ratio in a parcel slot and the brand is decoration); the brand symbol is module-private **with a real value**, so construction needs **zero `as` casts**; and `ratioOverLand` takes `KnownLandBasis`, so a ratio at `'unknown'` **does not exist as a value**. The probe run first against unmodified code read `expected 'pass' not to be 'pass'` — FAR 0.9 over gross sector land, coverage 0.5 over the parcel, three storeys → three mutually consistent numbers about nothing. **Still OPEN as a capability:** `'buildable'` is declared and **deliberately unreachable**, with `unreachableLandBasisRefusal()` so a caller is refused *by name* rather than served a parcel-land figure. C63's ratified denominator remains unscoreable — the gap is now legible instead of invisible. |
| **P1-7** three wall mutations use three different undo stacks | **CORRECTED (magnitude) · still OPEN** | `284a8db7`. The mechanism is confirmed exactly as described — height pushes to the ring buffer **and** `commandManager`, colour goes to `commandManager` only with no ring push, reconciled by a 250 ms **wall clock**. **But it does NOT reproduce at the pacing this document implies.** At **400 ms apart it is CORRECT**: three undos reverse rake → colour → height in order. It fails **under compression**. At 80 ms apart, one keypress reverts the **oldest** mutation, leaves the **newest** in place, **and silently clobbers the colour edit** (the ring inverse is a whole-record `replace` built from a snapshot taken before the colour edit existed). The guard measures `|t_rake − t_height| = 2 × gap`, so **the cliff sits at gap = 125 ms** — a 2 ms difference in how fast the user clicked leaves the model in different states. Two further defects pinned: `performUndo()` returns `void`, so *"nothing to undo"*, *"I reverted something"* and *"a pending entry was stranded"* are the **same value** to every caller (C03 §4.6 U-4); and 16 live door/window handlers declare `affectedStores` `buildUndoStoreMap` cannot cover, permanently stranding their ring entries. **NOT FIXED** — encoded as `it.fails` (`2 passed | 3 expected fail`), green while the defect exists and **red the day it is fixed**. An earlier draft of that test passed **vacuously** (mis-parameterised on `gap` instead of `2 × gap`) and was fixed and given two probe guards rather than deleted. **Blocked on:** a gesture id stamped at dispatch — *"these two entries came from ONE dispatch"* is a relation a monotonic counter **cannot** express, so swapping the timestamp for a sequence number leaves all three red; its consumer is `performUndoRedo.ts` and its producers are `command-bus`/`command-registry`. |
| **P1-8** no wall property mutation reaches sync | **CHANGED · legs A and B closed, leg C open** | `e1f6966d` then `b8c58e61`. Directionally right; **the mechanism is worse.** There is no allowlist anywhere — `CommandBus` routes every successful command generically, and the filter is one line inside `applyCommand`: `const elementId = String(payload['id'] ?? ''); if (!elementId) return;` — a **silent drop, no log, no counter**. So the synced set was never "create verbs", it was *payloads with a top-level `id` key*; ~50 property verbs key `wallId`/`elementId`/`slabId` and were dropped without trace, including `element.updateParameters`, the property panel's live route. A second independent defect: writes landed in a `Y.Map` named after the **command type**, so an edit could never reach the create record of its element. **The received value was `3`, not `undefined`** — the collaborator keeps the creation-time height forever, confidently; failure and staleness had the **same observable value**, and every assertion in the fix names the value rather than using `toBeDefined()`. Fixed **by declaration, not special cases**: `syncDisposition.ts` states per command type where the subject id and properties live, proven by a test in which `thickness` is named nowhere and still replicates. **25 verbs wired · 32 declared NOT-SYNCED with written reasons · 24 `disclose` + 1 last-writer-wins.** Leg B (`b8c58e61`) adds `ElementSyncReader` plus a fix for a defect this document never saw: the adapter is constructed behind `requestIdleCallback`, so **commands in the first ~1.5–4 s never reached the Y.Doc at all**, silently — now queued by a `DeferredCrdtApplier` installed synchronously at the top of `bootstrap()`, **bounded at 5000**, with `hasLostCommands` staying true after attach (a loss that stops being reportable once the adapter arrives is just a slower silent drop). **OPEN: leg C — see §17.3 N-5.** |
| **P1-9** P6's 37 blessed writes include committed model data | **OPEN** | `check-no-direct-store-writes` still passes at its baseline; not addressed this session. |
| **P1-10** D3 collaboration overstated — C66 3 CLAIMED, 0 HELD | **OPEN — now measured rather than asserted** | ISSUE-LOG §9.5 / L-843: collaboration fails **all 8 rows**, and the reason is structural. Per C66 §1 **no tier is described as supported**, and the probe deliberately did **not** stage a two-adapter test and call it collaboration. **Sharpest sub-finding:** every mass edit the chat can actually perform is declared `not-synced`, because its `"all"` subject is **late-bound** — the batch verbs take `xIds: string[] \| 'all'` and on `'all'` the subject set does not exist in the payload. **The RAC's strongest capabilities are its least syncable.** |
| **P1-11** STR-06..STR-15 CANONICAL on stale facts | **UNVERIFIED** | Not re-measured. No commit in `e205864e..HEAD` touches STR-06..STR-15, so it is *probably* still true — but "no commit touched it" is not a measurement of its content, and this annotation does not claim one. |
| **P1-12** "hard-fail" overstated — 3 of 8, not 6 of 8 | **CHANGED** | **Executed today it is 4 of 8.** P1 (`single-compose`: 1 definition, **0 rivals**, 2/2 production callers — the rival is now blessed, see P1-16), P2, P3, P5 (166 files, 7 rules, 0 impurities) are hard-0. P4 is **RED at 218 > 215 and now exits 3**. P6 passes at a baseline of 37. P7 passes at 40/43 with three axes NOT CHECKED. **P8 gained a hard-0 arm** (Zone A 256/256) but its C10 §2 scope is explicitly not enforced (Zone C census 1,648/1,885). The honest sentence is: **four principles hard-fail at the invariant; three are ratchets; P8 hard-fails on a sub-scope it names.** |
| **P1-13** the C00 index stale where CLAUDE.md defers to it | **UNVERIFIED** | C69 was minted **and indexed** in the same change (`6b18491f`), so the index moved — but I did not re-audit the whole index for the staleness this document reported. |
| **P1-14** PDF→BIM: five failure-vs-empty defects + ADR-0229 drift + dead cost gating | **CLOSED** | `7085113a`. All five sites fixed; the tier ladder itself was sound, the honesty was not. **The rejection accounting is the one that closes the class:** two worlds differing only in whether there was anything to reject previously produced **byte-identical output** — now World A reads *"0 doors — the page contains no arc primitives at all"* and World B *"0 doors matched out of 12 arcs — 12 REJECTED (12 with no wall close enough to host them)"*. The downloadable diagnostic's hard-coded zeros are now real measurements, and where zeros are unavoidable it flags `preprocessingRan: false` — **the zeros are labelled as not measurements**. Zero-token proof: `PdfToBimZeroToken.spec.ts` spies `aiService.query`, rejects on call, and asserts not-called in a **global** `afterEach`. **ADR-0229 status verified by read at HEAD: `Superseded — 2026-08-11 by ADR-0317`**, text retained verbatim, with Part C's $10 cap and Part E's preview label recorded as *not implemented on the live path* and Part G's rejection of rule-based vector extraction **reversed**. ⚠ Residue: the cost gating is documented-as-dead, not revived. |
| **P1-15** `room.setMaterial` silently discards catalogue materials | **CLOSED · CORRECTED** | `5e74b178`. The `materialId` path now **refuses**, and the route declares `supportsMaterialId: false` — the correct expression (`MATERIAL_ID_UNSUPPORTED_REASON`) that already existed and was unused. ⚠ **Correction: refusal is the *right answer*, not a workaround — a room has no catalogue-material field.** Do not restate this as *"room materials work"*. The **colour** path was and remains live (`commandManager` → `UpdateRoomCommand` → `roomStore`) and is kept as the probe's **positive control**, so a refuse-everything implementation could not have passed. |
| **P1-16** P1 has a declared second composition root | **CLOSED** | `d312c01c` + **ADR-0316 verified on disk**. The defect was not the second root, it was that a **constant (`MAX_RIVALS = 1`) is not an architecture decision**. Route (b) — a genuine second surface — chosen **with evidence, not preference**: `composeRuntime` statically imports `@pryzm/renderer-three` (THREE core ~281 KB gzip) against `component-editor`'s hard **180 KB** budget — **1.53× the whole budget for one import** — and additionally requires a `bootstrapFn` from `@pryzm/editor`. Delegation does not make the app expensive, it makes its own contract **unsatisfiable**. The blessing is **executable, not prose**: 8 invariants pinning P6 command-only mutation, verb **reachability**, one-batch-one-undo, P8 spans, total dispose, and the 12 forbidden imports whose presence would collapse the second-surface argument. Writing them found a real bug — `referencePlane.*` and `solid.*` were authored and unit-tested but **registered nowhere**, so clause 3 now asserts reachability rather than existence. **Executed today: 0 rivals.** |

### §17.2.1 The §6 class-E "blind" scene-isolation classes — partly CORRECTED

`d312c01c`. **Most of the classes this document called blind were not silent** — label sprites,
unstamped fallback boxes and generated massing groups **landed in the unattributed floor,
unnamed**, which is a weaker defect than "produce no finding at all" and is exactly the honesty
property §6 praises. They are now **classified by name** rather than merely counted.

**Two classes genuinely vanished, and those were the real false-clean:** (a) a root with an `id`
but **no type** — coverage waved it through as *attributed* while `detectLeaks` skipped it as
*untyped*, so it fell between two checks; (b) a foreign subtree **parented under an owned root**,
silently inherited. Both are now detected, and a coalesced root belonging to a foreign level is a
real finding rather than a floor entry. The floor-not-total property is preserved and
strengthened — the excluded-graph clause prints on the **empty, clean and violation** branches
alike, asserted on all three. Four fixture defects were found in the predecessor's own tests.

### §17.2.2 The §12 gate table — `check-no-commandmanager` CORRECTED

`3a343a7a`. This document's ledger records **14** literal `commandManager.execute` sites.
**The number is 11**, and the three removed were never violations:

- **Two are inside `console` STRING LITERALS** — `console.error('…: commandManager.execute
  failed:', err)` and `console.warn('… commandManager.execute not available — skipping …')`.
  Both are the codebase **REPORTING that the legacy path failed**. Counting the report as a use
  is the same defect as counting a comment, one layer down: `scanFilesStripped` removes comments
  but deliberately **preserves string bodies**, which is correct for the security gate it was
  built for and wrong here.
- **One is `executeChunked`** — a *different* method, declared only on `CommandManagerImpl:316`,
  which awaits the command's own chunked implementation and yields a frame between batches so a
  1,300-element open does not block the main thread. The bus has **no chunked-dispatch API**, so
  the site is **not migratable in principle** and the gate was asserting a violation with no
  available fix. **A regex written for `execute` was claiming a method whose name merely starts
  the same way.**

**The ceiling stayed at 0 and the gate still FAILS at 11** — this was precision, not relief. And
the deeper answer is that **zero of the 11 should be migrated today**: migrating them would move
the string out of `apps/editor/src` while the mutation ran through the identical path —
**laundering the count, not satisfying P6**. Each of the 11 was verified by hand
(`ProjectLoader:529` — migration *inverts* the intent, pushing ~1,300 creations onto the undo
stack so one Ctrl+Z starts dismantling the project just opened; `RemoteCommandDispatcher:392` —
it already *is* the migration, the bus runs first and this is the no-handler `.catch()`;
`engineLauncher:1007` — the bus path is the known `§F-1.4-REDETECT-LOOP` stack-blowing bug and
the legacy call is the documented escape). **Executed today: `literal=11 window=62
cm.execute=62`, still failing, still ledgered.**

---

## §17.3 New findings that post-date the audit — all OPEN

| # | Finding | Evidence | Blocked on |
|---|---|---|---|
| **N-1** | **Move has a verb that LIES.** This document's companion claim *"NO MOVE OR ROTATE VERB FOR ANY ELEMENT KIND"* is **FALSE** — `wall.move`, `wall.transform`, `door.move`, `window.move`, `slab.move`, `room.move`, `door.create`, `slab.create` and rotate for furniture/stair/curtain-wall **all exist and are registered**. **The real defect is worse than the one alleged:** five of them (`wall.move`, `wall.transform`, `door.move`, `window.move`, `slab.move`) `produceCommand` against the **detached plugin DTO store** that `5e74b178` proved nothing renders, persists or exports. Only `room.move` is a live bridge. | `ee6ad0d8` | A repeat of the entire 17-verb commit for a second family, **including converting the tests that currently pin the lie**. Deliberately not done shallowly at session end — that is how a dead verb ships twice. |
| **N-2** | **`ceiling.update` is an exact twin of `roof.update`, still broken.** Same header text as the old `UpdateRoof.ts`, same `produceCommand` into `ctx.stores.ceiling`, shadowing the same way. `roof.update` was closed via route (c) — verbatim the **L-815** precedent, leaving the verb out of the plugin's `HANDLER_TYPES` so the same-name `initBusHandlers` bridge registers — and the register row moved `plugins/roof \| SHADOWED \| UNKNOWN` → `apps/editor \| LIVE \| legacy geometry store`. A second defect was found on the way: **`thickness: -1` was ACCEPTED and REPORTED SUCCESSFUL** — the plugin handler had no validation, converting a refusal into a success *on top of* writing nowhere. | `2c8b4904`; C69 register **executed today: SHADOWED 15** (was 16) | Applying the same route (c) to `ceiling.update`. Note the register classifies SHADOWED from **declaring files, not registration**, and therefore **cannot see a fix** — `wall.updateDimensions` still read SHADOWED months after L-815 fixed it. |
| **N-3** | **`composeRuntime` composes only the plugin-DTO half — 12 element kinds have no authoritative store in the composed runtime.** See §17.0.1. Very likely the single common cause behind the dead verbs, the shadowed routes and N-1. | `821a5d0b` | An architectural decision, not a patch: either `composeRuntime` owns the geometry stores, or the registration edges invert. |
| **N-4** | **`packages/headless` v1.0.0-rc.1 CANNOT COMPOSE.** `ComposeRuntimeOptions.bootstrapFn` is **required** and every prior "headless" caller omits it. **Verified: `grep -rn bootstrapFn packages/headless/src/*.ts` → zero hits; `packages/headless/package.json` version `1.0.0-rc.1`.** Its test **mocks `runtime-composer` wholesale — which is HOW it shipped.** RAC-1's earlier diagnosis that `@thatopen/ui` was the blocker was **wrong**; the cost is transform time, not a hang. Convergence boolean #8 (`headless_published`) currently reads ✅. | `821a5d0b`; executed today | Supplying a real `bootstrapFn`, and replacing the wholesale mock with the real composition the probe proved works. |
| **N-5** | **Collaboration leg C does not exist.** No CRDT transport is deployed (L-391); production is socket.io last-writer-wins full-snapshot. Legs A (`e1f6966d`) and B (`b8c58e61`) landed. Per **C66 §1 zero tiers are HELD.** | ISSUE-LOG §9.5 | Deploying a transport. Until then nobody should read legs A+B as collaboration working — the sync gate says so on every run. |
| **N-6** | **`check-sync-disposition` sees ~19 % of handlers.** Executed today: `Registered handler types found: 60` against `registered bus commands: 321`. The C69 register reports **sync UNDECLARED for 139 property verbs**. The gate's own output already carries the confession — the same defect `check-chat-capability-coverage` records in its first draft: *"saw 102 of the ~300, confidently wrong."* | executed today | Widening discovery to the registration surface the verb register already reaches. |
| **N-7** | **`check-cast-count` is RED at 218 vs 215 and rising.** It grew **215 → 217 → 218**, the last increment *during the remediation session*. R7 (`3e662222`) made this visible by giving the ratchet its **own exit code**: `0` clean · `1` failed at its declared level (absorbable if ledgered) · `2` misconfigured (never absorbable, L-811) · **`3` shrink-only ratchet exceeded (never absorbable)**. A distinct exit code rather than louder text, because the ledger is keyed on gate *name* and only the gate knows its own baseline. The contract is pinned by `e7d9fe13` — five assertions on the **contract**, deliberately **not** on the count, because *"a test everybody has to edit is a test nobody reads."* | executed today: `FAIL (repo-wide): 218 … exiting 3` | Fixing the casts. **Do NOT raise the threshold** — the gates say so in both files, because the failure mode here is social. |
| **N-8** | **CA-21 is NOT ENFORCED.** C16 §5.1 now binds liveness contractually — **CA-17** authoritative-state liveness (authoritative = RENDER ∪ PERSIST ∪ EXPORT, the L1 bus store *explicitly excluded*), **CA-18** refuse with a named reason (three prohibited shapes: bare `success:true`, an empty forward/inverse pair as the whole outcome, silence or `console.debug`), **CA-19** `affectedStores` names the store actually written, **CA-20** registration order is contractual, **CA-21** liveness proven by an **executed read-back**. **`grep -rl "CA-21" tools/ga-gate/` returns nothing** — the one clause that would prevent the next dead verb has no gate. ⚠ **The sharper half of `50496c54`: C16 CA-8 was the written authority the dead verbs were authored under.** It said the bus mutation *is* `produceCommand()` — the L1 store C03 §4.4 already documents as not driving the mesh and not being what the serializer reads. **The contract did not merely fail to forbid the defect; it PRESCRIBED it.** Corrected in place with the note attached; no new contract minted. | verified today | Writing the gate. This is the highest-leverage single item in §17.4. |
| **N-9** | **The SDK-bypass baseline was raised TWICE in one day, 178 → 181 → 183** — ISSUE-LOG §8.3 states 178→181 was *"the only raise this session"*, and it was not. The second raise (`c7690b60`) carries a full dated justification and both new bypasses are the identical batch-bridge pattern, from verbs authored **to close dead-verb defects**; refusing the import would have meant authoring two more dead verbs to keep a ratchet flat, which inverts what the ratchet is for. The impossibility proof for the preferred fix (widening `@pryzm/plugin-sdk` closes the cycle `plugin-sdk → command-registry → plugin-annotations → plugin-sdk`, **and** `command-registry` is `private:true` while the SDK publishes publicly) is unchanged and was verified against the manifests. **Executed today: sdk-bypass 183/183.** Recorded here because a correct raise recorded as *"the only raise"* is how N1's ⚠ in §14 became true in the first place. | `c7690b60`; executed today | Inverting the dependency so `command-registry` registers batch constructors into a name→factory registry the SDK re-exports an accessor for. |
| **N-10** | **221 of 320 verbs have authoritative store NONE or UNKNOWN.** The C69 register (`6b18491f`) is generated from handler sources and diffed by CI in both directions, so a PR adding a bus command without a register row **fails**. It found the 17 refusing verbs **independently**, from a purely structural rule, and matched this document's list exactly. **And it generalised L-839: `roof.update` was not one shadowed verb, it is SIXTEEN.** | executed today: `LIVE 99 · REFUSES 17 · SHADOWED 15 · UNKNOWN 189` | Working the register down. It is the artefact — cite it, do not transcribe it (C64 §2.13). |

---

## §17.4 Scoreboard

**P0 — 12 findings**

| Status | Count | IDs |
|---|---:|---|
| **CLOSED** | **8** | P0-3, P0-5, P0-6, P0-7, P0-8, P0-9, P0-11, P0-12 |
| **CHANGED** | **2** | P0-2, P0-4 |
| **CORRECTED** | **2** | P0-1, P0-10 |
| **OPEN** | **0** | — |

**P1 — 16 findings**

| Status | Count | IDs |
|---|---:|---|
| **CLOSED** | **6** | P1-2, P1-3, P1-4, P1-14, P1-15, P1-16 |
| **CHANGED** | **4** | P1-1, P1-6, P1-8, P1-12 |
| **CORRECTED** | **1** | P1-7 |
| **OPEN** | **3** | P1-5, P1-9, P1-10 |
| **UNVERIFIED** | **2** | P1-11, P1-13 |

**Totals across P0+P1 (28 findings):** CLOSED **14** · CHANGED **6** · CORRECTED **3** ·
OPEN **3** · UNVERIFIED **2**. **New OPEN findings that post-date the audit: 10** (§17.3).

**Corrections issued — six, and this is the number that matters most:**

1. **P0-10** — the gate was falsely accusing honest source; complying would have caused damage.
2. **P0-1** — three "regressions" were one deleted file plus one lying gate; exactly one was real.
3. **P0-6** — *"49 % of vertices on real cadastral rings"* is not reproducible; the real figure is
   **1–3 vertices absolute**, and the share **falls** with density.
4. **P1-7** — real, but does **not** reproduce at the pacing implied; correct at 400 ms, cliff at
   gap = 125 ms.
5. **§12 / `check-no-commandmanager`** — 14 is **11**; two were console string literals, one was
   `executeChunked`.
6. **"No move or rotate verb for any element kind"** — **FALSE**; they exist and are registered.
   The real defect is worse: **five of them write a detached store.**

**Suite movement (executed, not reported):** `15 passing · 17 failing (14 debt, 3 regression)` →
**`35 passing · 4 failing (4 declared debt, 0 regression)`**. Gate count 32 → **39 run** (38
`check-*.ts` files on disk plus the convergence check). Debt ledger **14 → 4**
(`cast-count`, `no-commandmanager`, `xss-guards`, `custom-event-apps`).
**The suite is still BLOCKED**, and correctly so: exit-3 on P4 is never absorbable.

---

## §17.5 What would it take to close this audit — ordered

Ordered by **leverage over the remaining defect surface**, not by effort. Items 1–3 are one
finding wearing three costumes.

**1. Give `composeRuntime` the authoritative stores — or invert the registration edges (N-3).**
Twelve element kinds have no authoritative store in the composed runtime. Until that is decided,
**V3 ("did the command change authoritative state?") is unprovable by construction** for most of
the model, and the dead verbs, the shadowed routes and the lying move verbs will keep being
authored — not by carelessness, but because the composition root offers nothing else to write.
*Exit condition:* a headless `composeRuntime` exposes the stores the serializer, the builders,
the 2-D projector and the IFC exporter read, and `821a5d0b`'s probe reports zero `ABSENT`.

**2. Write the CA-21 gate (N-8).** C16 §5.1 now binds liveness contractually, and **no gate
checks it.** This is the cheapest structural insurance available: CA-8 *prescribed* the dead-verb
defect for months, and a contract clause with no gate is exactly the shape this document's own
P0-12 condemns. *Exit condition:* a gate that fails a verb whose liveness is declared but not
proven by an executed read-back, negative-tested by deleting a read-back and watching it go red.

**3. Close the five lying move verbs (N-1), then `ceiling.update` (N-2).** Both are mechanical
repeats of work already done and precedented (`5e74b178` for the family, route (c)/L-815 for the
shadow). The **tests that pin the lie must be converted in the same commit** — five such files
were found last time. *Exit condition:* C69 register `SHADOWED` reaches 0 and no `*.move` verb
names a plugin DTO store in `affectedStores`.

**4. Fix the 218 casts and clear the P4 ratchet (N-7).** It is the only exit-3 in the suite, so
it alone keeps `run-all` BLOCKED. *Exit condition:* repo-wide count 0 and the gate leaves
`gate-debt.json`. **Do not raise the threshold.**

**5. Make `check-sync-disposition` see the whole registration surface (N-6),** then deploy a CRDT
transport (N-5). ~19 % coverage on a gate whose subject is *"every property verb"* is the
`check-otel-spans` failure mode with a different denominator, and the C69 register already
reaches the surface it is missing. *Exit condition:* the disposition gate's handler-type count
tracks the register's verb count, and C66 §1 can move one tier from CLAIMED to HELD.

**6. Give `packages/headless` a real `bootstrapFn` and delete the wholesale mock (N-4).** A
`1.0.0-rc.1` that cannot compose is a published lie, and convergence boolean #8 currently reads
✅ over it.

**7. Close the remaining honesty residue.** `check-refusal-identity`'s **88 named offenders**,
starting with `maxHeightGate.ts` (no `code` field at all despite citing C58, rendered at 5 call
sites) · `repairToSimplePolygon` still inventing a boundary with no log and stamping it as
authored (**P1-5**) · P6's 37 blessed writes of committed model data (**P1-9**) · the 19
production `CustomEvent` dispatches against a ceiling of 4 · `check-xss-guards`, which must learn
to recognise provably-safe expressions or its signal will keep degrading (L-835 — **no live
vulnerability exists there today; every new interpolation was checked by hand**).

**8. Fix the undo gesture id (P1-7).** Three `it.fails` tests go red the day it lands, which is
the point. *Exit condition:* a gesture id stamped at dispatch — **not** a monotonic counter,
which cannot express the relation.

**9. Make the NFT benches merge-blocking, and close the two RED NFTs (P0-2).** They execute now
but land ADVISORY, so C10 §4's blockers still block nothing. **NFT 15 at 9.85 MB gzipped vs a
4 MB budget is a real product defect**, not a paperwork one. *Exit condition:* `nft-bench` is
required, and 19 of 19 execute with targets unmoved.

**10. Write the R6 gate (P0-12 residue).** STR-03 is corrected, but nothing prevents the next
document from citing a gate that does not exist — which this repository has now done twice.
Extend `run-all.ts`'s existing missing-file pre-flight to the doc-cited set. **Do not ratchet
this; exit is zero immediately.**

**11. Re-measure P1-11 and P1-13** (STR-06..STR-15 currency; the C00 index), which this
annotation does **not** claim to have verified.

**What is NOT on this list, deliberately.** R5 (generalise `MIN_FILES`) is substantially done —
the R5 meta-gate exists, is registered, and reads **37 gates inspected · 28 floored · 9 unfloored
against a ceiling of 9, exactly at the measurement, no headroom**. R7 is done (`3e662222` +
`e7d9fe13`). R3 is done and pinned at 0. R4 is done and born at zero. R8 is being addressed
structurally rather than by ratchet: C69's generated register and `nft-targets.ts`'s test-time
parse of the C10 markdown both **delete the transcription and cite the artefact**, which is what
C64 §2.13 asks for.

---

## §17.6 What this annotation could NOT verify — named

1. **P1-11** — STR-06..STR-15 currency. Not re-measured. No commit in range touches them, which
   is evidence about the files, not about their content.
2. **P1-13** — whether the C00 index is still stale where CLAUDE.md defers to it. C69 was minted
   and indexed; the rest of the index was not re-audited.
3. **Every V4 (persist) and V5 (undo) verdict, and every V3 outside category 8, in the RAC
   scorecard remain UNPROVEN** — no browser, no renderer, no save/reload, no two clients. Where
   source *proves* a write cannot reach authoritative state it is marked FAIL; where it merely
   suggests it does, it is UNPROVEN with the expected live path named. **A runtime harness is the
   single largest outstanding piece of work the remediation identified.** Static analysis can
   prove a verb is dead; **it cannot prove a live one is alive.**
4. **Leg B of sync is proven in Node against a store stand-in, never in a browser.** The gate says
   so on every run. Do not read it as replication.
5. **R7's falsifiability was demonstrated by accident, not by deliberate injection** — two
   assertions failed against a mis-sliced window and were fixed. The exit-3 branch was not deleted
   and watched to go red, because that means editing `run-all.ts` while other agents share the
   tree. Stated in `e7d9fe13` rather than implied.
6. **The `IMPLICIT_MODEL_VIEW_ID` semantics in the P7 fix are a judgement call made rather than
   reported** (`e021513d`) and want founder confirmation.
7. **Negative testing was not performed in this annotation** for `check-layer-boundaries`'s
   fail-open branch or for `check-chat-capability-coverage`. §16's priority order stands, minus
   `check-otel-spans` and `check-three-imports`, which the remediation covered.
8. **`src/main.ts` (42 KB, the browser boot path) is still outside `check-layer-boundaries`'s
   scan glob.** §4's "unexamined zone" finding was not addressed and is not claimed closed.
