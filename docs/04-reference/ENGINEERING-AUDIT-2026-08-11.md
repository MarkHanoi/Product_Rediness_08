# PRYZM — Engineering Audit

**Protocol:** Canonical Audit Protocol Rev 2 · **Date:** 2026-08-11 · **Baseline:** `main` @ `9ad92622`
**Method:** 12 parallel audit streams. Every material claim traced `claim → gate/probe → execution → observed result`. Two streams ran **independent executable probes** (a geometry oracle computing its own invariant; a real THREE scene with injected foreign objects). No repository file was edited by any stream; all probes live outside the repo.

**Working-tree caveat:** the tree was DIRTY throughout (a live RAC agent mid-edit). Where that changes an answer it is stated — it changes finding P0-4.

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
