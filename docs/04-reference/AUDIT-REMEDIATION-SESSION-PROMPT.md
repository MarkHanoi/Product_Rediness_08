# PRYZM — Audit Remediation · Master Session Prompt

**Written:** 2026-08-11 · **For:** a fresh Claude Code session with no memory of the audit
**Companion document (read it first):** `docs/04-reference/ENGINEERING-AUDIT-2026-08-11.md`

---

## HOW TO USE THIS

Open a new session in `c:\Users\LENOVO\OneDrive\Desktop\PRYZM\Product_Rediness_08` and paste **§A (the prompt)** as your first message. Everything after §A is reference material the agent will read from the repo — you do not need to paste it.

---

# §A — THE PROMPT (paste this)

> Read `docs/04-reference/ENGINEERING-AUDIT-2026-08-11.md` and `docs/04-reference/AUDIT-REMEDIATION-SESSION-PROMPT.md` in full before doing anything else. They are the output of a 12-stream Rev-2 engineering audit run on 2026-08-11 against `main` @ `60fcd1ac`. The audit verdict is **RED**. I want the findings fixed, in the priority order the remediation document sets out.
>
> **Working doctrine — non-negotiable, these are why the audit found what it found:**
> 1. **Ship the probe before the fix.** For every defect, write the failing test/gate FIRST, watch it fail against current `main`, then fix. A fix validated only by its own assumptions is unproven.
> 2. **Failure and emptiness are never the same value.** Never let a missing/failed computation return the same thing as a successful empty one.
> 3. **The layer that knows must be the layer that reports.** Several defects below are the same bug: the engine computes the truth and an upper layer throws it away.
> 4. **Verify the right invariant on the right object.** Ask "what exact property proves this happened?" then measure that property independently — not an aggregate, not a count, not `success === true`.
> 5. **Never `git stash`** — the stash stack is global across worktrees here and other agents share the tree.
> 6. **A baseline is not permission; it is a debt with a name.** Do not raise any ratchet to make a gate green. If a raise is genuinely correct, it needs a dated justification paragraph in the gate file, in the same commit.
> 7. Follow the repo's governance order and read the contract for any subsystem you touch. Note the audit found `CLAUDE.md` mis-states that order (P0-11) — the real suite is **C01–C68**, and `C67`/`C68` are CANONICAL.
>
> **Start with WAVE 1 (unblock CI) — these three are why `main` is red today.** Run `npm run ga-gate:all` first to confirm the current state, then fix P0-1a, P0-1b and P0-10. Report the suite result before and after.
>
> Work the waves in order. Use parallel agents where file ownership does not collide — the remediation document marks which items are safely parallel and which must be serialised. Deploy to Fly only per `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`, and only when there is something I can test in a browser.
>
> Before you start, give me a one-screen plan: which wave, which agents, what each will own, and what the probe is for each fix.

---

# §B — CONTEXT THE NEW SESSION NEEDS

## B.1 What PRYZM is (30 seconds)

A BIM SaaS monorepo (pnpm, Node ≥20): browser 3D editor, real-time collaboration, AI-assisted design, IFC/Revit/DXF/Rhino interop. Client is an 8-layer TypeScript SPA (L0 schemas → L7 apps); `server.js` is a single Express BFF. **97 packages · 13 apps · 48 plugins · 68 contracts · 32 CI gates · 45 chat capabilities · 319 bus commands.**

Eight architectural principles (P1–P8) are CI-gated. GA gates live in `tools/ga-gate/check-*.ts`, run via `run-all.ts`, invoked in CI as `pnpm run ga-gate:all`. Declared-failing gates are ledgered in `tools/ga-gate/gate-debt.json`, whose rule 1 is: **a gate NOT on the list that fails is a REGRESSION and blocks CI.**

## B.2 The five historical defect classes (every finding is one of these)

| Class | Shape |
|---|---|
| **A · Dead verb** | A command reports success; no authoritative consumer (renderer/persistence/undo/export/sync) observes the mutation |
| **B · Blind arithmetic / blind gate** | An invariant measured against the wrong object, geometry, denominator or import set. The gate is green because it is looking at the wrong thing |
| **C · Plausible fallback** | A fallback produces believable output that is semantically different from the requested operation |
| **D · Self-output executed as intent** | System-generated text is re-interpreted as a user command |
| **E · Under-counting audit** | The audit omits a whole class of objects and therefore reports a false clean |

**All five recur today.** When you fix one, ask whether the class is closed or only this instance.

## B.3 The single most useful sentence in the audit

> The same offset algorithm exists in **three** places at **three** levels of correctness — fixed and honest, half-migrated, and untouched. **The untouched copy is the one wired into the plugin committer.**

Whenever you fix something, grep for its twins.

---

# §C — THE REMEDIATION PLAN

## WAVE 1 — Unblock CI (do this first; nothing else merges cleanly until it is done)

**Serialise these — they all touch gate state.**

**W1-1 · `check-layer-boundaries` FAILS: 181 SDK bypasses vs baseline 178.**
Three undeclared bumps: `plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts`, `plugins/ceiling/src/handlers/UpdateCeilingsSystemTypeBatch.ts`, `plugins/view/src/handlers/DeleteElementsBatch.ts`. All three are the same tracked batch-bridge pattern.
*Decide, don't paper over:* either (a) widen `@pryzm/plugin-sdk` to re-export what the bridge pattern needs — the structurally right answer, and the gate's own error text says so — or (b) add three dated justification paragraphs and raise to 181. **Never raise silently:** `check-layer-boundaries.ts:139` calls an undocumented bump *"a ratchet failure."*

**W1-2 · `check-visibility-intent-not-ui` FAILS: 45 direct `.visible` writes vs 43.**
Offenders are *design* visibility, not gizmos: `apps/editor/src/ui/ViewBrowser/panels/unified-browser/ProjectVisibilitySection.ts:72,80,84,96,106,110` and `apps/editor/src/ui/SpatialTree.ts:40,50,68,85,140`. Express them as visibility intents via `@pryzm/visibility` so they persist and replicate. **See W3-1 — the intent path they should use is currently dead, so this may need to follow it.**

**W1-3 · `check-declared-project-scopes` (ADR-0298) FAILS.** Not investigated in the audit — diagnose first.

**W1-4 · `check-zoning-fidelity-label` FAILS: refusal rendered without its code.**
`apps/editor/src/ui/layout/GISAreaLayout.ts:2770` — 2 of 6 refusal arms omit `r.code`, producing an unattributable "no". Authority: C58 §6 / ADR-0269 / ADR-0279 BLOCKER-1.

**Definition of done for Wave 1:** `npm run ga-gate:all` prints `0 regression`. Do not remove anything from `gate-debt.json` unless it now passes (ledger rule 2: a paid debt must leave the ledger in the same commit).

---

## WAVE 2 — Live correctness defects (users are hitting these)

**Safely parallel: W2-A (geometry), W2-B (reporting), W2-C (PDF honesty) touch disjoint trees.**

### W2-A · The roof offset family — `packages/geometry-kernel`, `packages/geometry-roof`

**The fixed implementation already exists** at `packages/geometry-roof/src/pure/polygonOffset.ts` (a true mitred offset returning a discriminated `OffsetResult { polygon, degenerate, reason? }`, written to fix the founder's "overhangs well outside the building" bug). Migrate to it; delete the clones.

1. **`applyOverhang` is a centroid radial dilation sold as a parallel offset** — `packages/geometry-kernel/src/producers/_internal/roof/polygon.ts:120-132`. Pushes each vertex `d` radially from the centroid. On a square the perpendicular gain is `d·cos45°`: **a 300 mm eave delivers 212 mm**, anisotropically worse on elongated plans. Live path: `producers/roof.ts:77 → index.ts:39 → plugins/roof/src/committer/roof-committer.ts:84,111,129`.
2. **`shrinkPolygon` deletes vertices and validates against centroid radius** — same file `:139-184`, verbatim twin at `packages/geometry-roof/src/RoofGeometryBuilder.ts:1096-1140`. `:164` drops near-parallel vertices (**49 % of vertices on real cadastral rings**, measured in `insetPolygon.ts:435-443`); the only gate is `dist² ≤ maxOrigDistSq * 1.1`; `>= 2` vertices returns as success.
3. **Roof form silently substituted** — `RoofGeometryBuilder.ts:612-618` (mansard → `generateHip()`), `:506` (pitched → flat), `:624`; mirrored at `geometry-kernel/src/producers/roof.ts:151-158, 176-200`. Identical `BufferGeometry`, no log.
4. **The honest discriminant is discarded at the wrapper** — `RoofGeometryBuilder.ts:1073-1087` flattens `OffsetResult` to `Pt[]` and warns to console only. A roof with **zero overhang where 300 mm was specified** is committed and dimensioned as authoritative.
5. **A convex hull is committed as the building perimeter** — `packages/ai-host/src/WallRegionExtractor.ts` (self-declared in its own header: *"a convex hull cannot represent L-shaped, U-shaped, or courtyard buildings"*) → `AIService.ts:299-315` → `CreateRoofCommand`. It bridges the notch, then feeds defects 1 and 2.

**Probe:** an independent oracle, not the package's tests. For an offset by `d`, every **edge midpoint** of the result must sit exactly `d` from the source boundary (midpoints avoid the corner miter wedge). A centroid scale gives pullback proportional to distance from the centre, so **the min–max spread is the discriminator**. Assert `spread ≈ 0`.

**Then:** `packages/room-topology/src/RoomPolygonUtils.ts:1222` already computes exactly this spread — and `:1226` only prints it. The load-bearing gate at `:1214` is still the shape-blind `innerArea >= 0.5 * baseArea`. **Promote the spread to the gate.** Also replace the exact-vs-fallback discriminator at `:1205` (`inner !== ring`, i.e. **array reference identity** — any refactor adding `.map`/spread/memo turns every fallback into a silent success) with an explicit discriminated return.

**Ratchet to add (R3):** independent polygon-offset implementations. Baseline **3**, exit **1**. `insetPolygon.ts:30-33` already states the rule: *"Neither module owns a second offset routine."*

### W2-B · Reporting-layer honesty — `apps/editor/src/ui`

The engine is honest (**50 executed tests prove it**, including `deleteElementsBatch.test.ts:98` pinning *"a batch where NOTHING is deletable refuses instead of reporting success"*). The last layer throws it away:

- `apps/editor/src/ui/create/batchCatalogue.ts:500` — `if (res?.success) return { ok: true }` **discards `res.info`**, the entire engine payload. Rendered at `AIPanel.ts:1282`, `CreatePanelLayout.ts:411`. **No test touches `dispatchBatchEntry`** — this is why it survives a green suite.
- `executeSlice`: no report → `{ok:true, lines:[]}` → **"Done"**. The case-6 state (*engine cannot determine*) has no representation in `DispatchOutcome` (`ZeroTokenChatBridge.ts:655-663, :866`).
- `ZeroTokenChatBridge.ts:858-861` — a partial across multiple commands is reported as **total failure**; `batchReports[0]` discards later reports.
- `roomFinishChatSeam.ts:205, :301` — emits `success:true` **after a total timeout**.
- `if (cm)` silently skips across **eight** batch handlers; `v.reason ?? 'refused'` bypasses the L-813 human-readable-reason fix.

**Probe:** construct all six cases (all succeed · some succeed · some skipped · all fail · none eligible · engine cannot determine) and assert each produces a **distinct** transcript that preserves engine terminology. Ratchet **R4**: dispatch sites that discard an engine report payload → exit zero.

### W2-C · PDF→BIM honesty — `apps/editor/src/ui/ai/floorplan-import`, `apps/ai-worker`

The ladder itself is sound (tier 1 vector → tier 2 raster → tier 3 AI, each terminating; 133/133 ai-worker tests green). The honesty is not — five sites, all failure-vs-empty:

- `Step4AnalysisView.ts:331` — tier 1's fall-through reason is **hard-coded** (*"no usable vector line-work"*) regardless of the real reason; the computed reasons at `:131`/`:152-155` go to `setStatus` and are immediately overwritten. **Fix this one first — it closes three of the five.** Give `tryVectorRecognition` a returned reason.
- `:141` — unset scale returns silent `null` (tier 2 handles the identical condition honestly at `:215-218`).
- `:335` — a stale `tierNote` leaks a **capability description** as a failure reason.
- `:563-565` — a successful-but-empty AI enrichment reports *"not produced — needs the AI stage"*. It ran; it found nothing.
- `:728-739` — the downloadable diagnostic writes **hard-coded zeros** even where real measured values exist.

Also: tier 1's library has **no rejection accounting** (`stage2-openings.ts:135-140`, `stage2-walls.ts:67-75`, `adapter-floorplan.ts:120` all `continue` with no tally) — so *"0 doors found"* and *"12 door arcs rejected"* are the same value.

**Two more, both cheap and high-value:**
- Write `apps/editor/src/ui/ai/__tests__/PdfToBimZeroToken.spec.ts` modelled on the existing `ZeroTokenNoLlm.spec.ts` (spy on `aiService.query`, assert 0 calls). That directory is already in the root `vitest.config.ts` include list, so it lands in CI for free, and it converts the ladder's two UNPROVEN claims to VERIFIED.
- **Raise a superseding ADR for ADR-0229.** It is "Accepted", never superseded, and describes a wholly AI-dependent pipeline with a *"$10 per-extraction hard cap"*. The shipped product uses **zero model calls** and has **no cost cap on the live path** — `preview-gate.ts` (which computes the ADR-mandated preview label) and all of `src/cv/**` (with its `$0.05` per-page ceiling) are **dead**. The deterministic ladder currently has no ADR-level authority.

---

## WAVE 3 — Dead paths and enforcement blindness

### W3-1 · P7 visibility is DEAD (do this before or with W1-2)

`plugins/visibility-intent/src/handlers/index.ts:34-74` — all five handlers (`hide.selection`, `isolate.selection`, `reveal.all`, `set.transparency`, `edge.toggle`) are **`console.debug` and nothing else** at `:40, :47, :53, :63, :70`. No store write, no command, no return. The header at `:4-5` claiming they *"wrap the runtime.visibility slot"* is **false**.

`packages/stores/src/IsolationStateStore.ts` is a complete, tested reducer (`applyIsolation:120` → the pure `buildIsolationIntent` at `packages/visibility/src/intents/IsolationIntent.ts:151`) with **zero production consumers** — never constructed by `composeRuntime`, never subscribed, never read. Its own header at `:9-12` admits it ("INS-α-7 has not landed"). Consequences: visibility has **no persistence, no undo, no sync, and does not survive save/load**.

This also unblocks the audit's other visibility finding: **a read-only / visibility capability class does not exist**, which is the *structural* reason chat visibility questions get claimed by write grammars (the P0 fixed at `fd27e513` was an instance, not the cause). **71 phrasings are served only by the legacy QueryEngine.**

### W3-2 · P8 is enforced over one directory family

`tools/ga-gate/check-otel-spans.ts` — two independent blindnesses:
- `findHandlerFiles():78-101` walks `plugins/*/src/handlers/` **only**. `packages/command-registry/**` and every app are never examined.
- `:133` tests `instrumented < HARD_FLOOR` — an **absolute floor, never a ratio**. Today instrumented = total = 255 ≥ 213, so a PR adding 50 uninstrumented handlers still prints ✅. The 42-file gap between floor and total is the exact size of the hole.

**Fix:** change the condition to `uninstrumented.length === 0`, keep the floor as a weaker second assertion, and widen discovery. Until then, STR-03 §2's P8 *"hard-fail ✅"* must read **ENFORCEMENT-BLIND**.

### W3-3 · The dead-verb class is contained, not closed

15 verbs remain registered on the production bus writing detached plugin DTO stores that nothing renders, persists or exports: `wall.bulkSetVisuals` (`plugins/wall/src/handlers/BulkSetWallVisuals.ts:102-116`), `wall.setColor`, `wall.setDimensions`, `wall.setLayers`, and `setMaterial` on beam/ceiling/column/curtain-wall/floor/furniture/slab/roof/stair/plumbing/lighting/handrail/structural.

Two entry points were re-routed (`MaterialDispatch.ts:109-154`, `ChatCapabilityRegistry.ts:2017-2036`); **the verbs were not retired.** Any third dispatcher reaches them. There is also an **undo hazard**: those handlers declare `affectedStores:['wall']` while `performUndoRedo.ts:269` maps `'wall'` → the **geometry** store, so a ring-first Ctrl+Z can apply an inverse for a forward write geometry never saw.

Related, smaller: `room.setMaterial` accepts a catalogue `materialId`, reports success and writes nothing — `plugins/rooms/src/handlers/SetRoomMaterial.ts:71-73` returns `{forward:[],inverse:[]}` while `MaterialDispatch.ts:120` omits `supportsMaterialId:false`. The correct expression (`MATERIAL_ID_UNSUPPORTED_REASON`, `:191-193`) already exists.

**Also:** `door.setType`/`window.setType` cannot persist `systemTypeId` — the field is absent from plugin `DoorData`. (The `*.updateSystemTypeBatch` verbs are **sound** and reach the geometry store — do not "fix" those.)

### W3-4 · Gates that cannot see their subject

- **Three gates shell out to `rg`** — `check-project-isolation.ts`, `check-scene-graph.ts:77,115`, `check-geometry-ceiling.ts:67` — which is not installed on a stock Windows box or in CI. They exit **1 (absorbable as declared debt)** rather than **2 (misconfigured, never excusable)**. This directly contradicts `.github/workflows/ci.yml:296-305`: *"DO NOT reintroduce a gate that shells out to a tool this workflow does not install."* Port them to `tools/ga-gate/lib/sourceScan.ts` as `check-three-imports.ts` was.
- **`check-layer-boundaries.ts:228-235` fails open** — *"a `from` layer with no rule is unconstrained"*. Invert to exit 2. Also, `src/` (L7.5, incl. the 42 KB `src/main.ts` browser boot path) is **never scanned** — the documents call it a permission; mechanically it is an absence of inspection.
- **`check-zoning-fidelity-label.ts` is a regex scrape of `GISAreaLayout.ts` with no test of its own.** A rename silently blinds it.
- **`check-cast-count` breached 215 → 217 while sitting on the debt ledger** — a ledgered gate hides its own ratchet growth. **Ratchet R7.**
- **31 of 32 gates lack a `MIN_FILES` subject floor.** Only `check-no-direct-store-writes.ts:136` has one. **Ratchet R5** — the cheapest insurance against the next L-809/L-774.

### W3-5 · Negative-test the gates nobody has watched fail

Priority order, because the first is **predicted to fail to fail**: `check-otel-spans` → `check-layer-boundaries` (the fail-open branch) → `check-three-imports` (dynamic `await import('three')` is explicitly unmatched) → `check-cast-count` (`window as unknown as X` spelling). Inject a minimal synthetic violation, run the gate, confirm failure, remove it, confirm recovery. **Leave nothing behind.**

---

## WAVE 4 — Documentation truthfulness (cheap, high leverage, do not batch with code)

**W4-1 · `CLAUDE.md:140,146` says the contract suite is "C01–C15". It is C01–C68.** The conflict-resolution order is the most load-bearing sentence in the file, and it omits 53 contracts including `C67` and `C68`, which are CANONICAL and govern every capability PR. **An agent following CLAUDE.md literally ranks C68 below an ADR.** Highest-leverage single-line fix in the whole audit. Also correct: apps 14→13, plugins 46→48, P3's "inside `runtime-composer`" (the owner is `packages/frame-scheduler/src/RafAdapter.ts`), P4's absolute prose, and the §Governance "hard-fail" claim.

**W4-2 · `STR-03 §2:42,46,47,48` cites four gate files that do not exist** — `scripts/ci-check-single-compose.ts`, `scripts/ci-check-domain-purity.ts`, `scripts/ci-check-no-direct-store-writes.ts`, `packages/visibility/__tests__/intent-not-ui.test.ts` — all marked *"hard-fail ✅"*. **This is L-812 re-appearing inside the document that records L-812's lesson.** The real gates live under `tools/ga-gate/`. Also fix: *"6 of 8 hard-fail"* → **3 of 8**; P2's credit to `eslint-plugin-boundaries` (which the same document contradicts 30 lines later); D14's "41 capabilities" → 45.

**W4-3 · `C10-PERFORMANCE-AND-OBSERVABILITY.md`.** §4 lists *"All 17 NFT benches pass"* and *"Bundle size < 4 MB"* as **merge blockers**; `grep -rn "bench" .github/workflows/` → **zero matches**. §1.1 claims headless Chromium via `@vitest/browser`; `apps/bench/vitest.config.ts` is `environment:'node'`. §1.1's *"≥100 samples"* is false for most rows (10–20). Either wire the suite (see W5) or mark these NOT-YET-TRUE with an exit condition. Propagates to `STR-02:522` and `STR-04 §6`.

**W4-4 · The C00 index** (`docs/02-decisions/contracts/README.md`) — `:16` "C01–C56" (the authoritative ordering statement CLAUDE.md defers to), `:17` "196 ADRs" (**252**), `:18` "82 SPECs" (**94**), `:162` "66 contract files" against its own enumeration of **68**, `:74` a May snapshot in the present tense.

**W4-5 · STR-06..STR-15 carry CANONICAL status on facts up to 10 weeks stale.** **STR-12 is acute** — it claims authority over the geospatial/regulatory substrate and names **none** of C57, C58, C60, C62, C63, C64, its own subject's normative spine. STR-11 (2026-03-18) has no Status line at all. STR-10:154 says 47 plugins.

**W4-6 · D3 collaboration maturity.** C66 §1: all three tiers (50/300/1,000 concurrent) are **CLAIMED, none HELD**, and §1 forbids describing a CLAIMED tier as supported. STR-03 §12.5 discloses this correctly; **STR-03 §4's D3 row, STR-02:226 and STR-01:50 (*"hundreds of concurrent edits"*) do not.** Qualify them, or run k6 at 50 VU (`tools/load-test/pryzm-load.js` already has real thresholds) and promote the tier to HELD.

**W4-7 · Stale numbers inside the enforcement machinery** — `check-layer-boundaries.ts` carries **three numbers for two invariants** (`:87` says 133 vs constant 102; `:118` says 171 vs constant 178 vs measured 181); `check-chat-capability-coverage.ts:610` "32 of 41" (now 36/45); `run-all.ts:26` "184/184" (now 255/255); `ci.yml:277` "31 gates" (32). And `ci.yml` contradicts itself on whether `ga-gate` blocks: `:19-21` says advisory, `:266-280` says merge-blocking.

**Rule for this wave:** correct the *claim*, or mark it NOT-YET-TRUE with an exit condition. Do not delete an inconvenient sentence.

---

## WAVE 5 — Structural gaps (largest, plan before building)

**W5-1 · Wire the benchmarks, in the right environment.** Ratchet **R2**: NFT benches executed in CI, baseline **0 of 17**. Must land **with** the `@vitest/browser` migration, not before — a Node result would not mean anything for frame budget, cold-boot paint, orbit FPS or bundle size. Note there are **four mutually inconsistent target sets** (C10 · STR-03 §5.1 · `packages/perf-budgets/src/nft-targets.ts`, a disjoint 9-row list anchored to a deleted doc · each bench's own header, also anchored to a deleted doc). **Pick one, delete the others.** The benches currently assert their *header* numbers, so an NFT can pass its own assertion while missing C10 by 10×. The genuinely honest measurements today are `crdt-merge`, `bcf-roundtrip`, `family-load`, `tests/e2e/cold-boot.spec.ts` and `tools/load-test/pryzm-load.js` — **all five outside CI**. NFT 18's bench uses `bench()` under `vitest run` and therefore **never executes**.

**W5-2 · C63's denominator is not expressible in the type system.** C63 is ratified — score against **buildable** land, not gross parcel. There is **no `buildableLand`, `netLand`, `grossLand`, `cesion`/`cesión` identifier anywhere in TypeScript source.** What exists: a `ratioBasis` **metadata string** (`packages/ordinance-extraction/src/textExtract/types.ts`) and a one-off script (`tools/valencia-envelope-max/05-denominator.mjs`) modelling *cesión* as "street holes". `densityCoherence()` validates that FAR/coverage/height agree — **a healthy aggregate over an unmodelled denominator.** This is L-616 one level up: not a wrong number, but *a distinction the model cannot represent*, which is how wrong numbers get minted silently. Make it a type.

**W5-3 · Sync does not carry property mutations.** No wall property write (height, colour, rake, layers) has a path into `YjsDocAdapter` — only `wall.create`-class command types appear. Collaborative editing does not propagate property changes.

**W5-4 · Undo is three stacks.** Wall height → ring buffer (`initBusHandlers.ts:936`); colour → legacy commandManager (`:819`, no ring push); rake and add-layer → commandManager. Door/window deliberately omitted from `buildUndoStoreMap` (`performUndoRedo.ts:306-311`) with cross-stack ordering resting on a **250 ms timing heuristic** (`:166`), not a gesture id. Three mutations of one element, three stacks.

**W5-5 · P1 has a declared second composition root.** `apps/component-editor/src/app/familyEditorRuntime.ts` builds its own command bus, stores and solver runner, blessed by `MAX_RIVALS = 1`. Either raise an ADR blessing it as a second surface, or delegate to `composeRuntime`.

**W5-6 · Scene isolation is blind to three object classes.** An injection experiment (real THREE scene, userData copied verbatim from production builders) proved: linework groups ✅ detected, furniture fallback boxes ✅ detected, but **label sprites, unstamped fallback boxes and generated/massing groups produce no finding at all**. Mitigated correctly — the audit prints `⚠ N/M scene root(s) UNATTRIBUTED` on **both** the clean and violation paths, so a count reads as a floor rather than a total. **Cesium primitives and coalesced instanced roots were not tested — UNPROVEN, not clean.**

---

# §D — WHAT IS GOOD (do not "fix" these)

Preserve these; several are the reason the audit could be written at all.

- **P2, P3, P5 are executably true.** `check-three-imports` (6,378 files, 0 violations), `check-raf-count` (1 owner), `check-domain-purity` (165 files, 0 impurities, hard-fail at zero).
- **D14 is the strongest subsystem.** 45 capabilities, **0 undeclared** of 319 bus commands, `✓ all targets proven both ways`, **138 examples executed**, 24 adversarial utterances non-mutating, and the other 274 commands *individually classified* rather than ignored.
- **The L-825 floor-finish fix is independently verified correct** — a true constant-distance inset on all 6 fixtures including deliberately sabotaged arc-chord cases (spread ≤ 0.1 mm against a 100 mm target).
- **`insetPolygon.ts`** — a true capsule-union erosion that **re-tests its own output against an independently-derived predicate**. This is the reference implementation; make the roof packages look like it.
- **`BuildableEnvelope.ts`** — 17 typed determinations, an 11-member closed refusal union, four Zod cross-field refines (notably `refusal !== null` ⟺ `status === 'not-applicable'`), and *ownership* of missing information via `envelopePublicationAuthorisation()`. Best-executed honesty mechanism in the repo.
- **`capEnvelopeConfidenceToPackDefault()`** — a **ceiling, not an assignment**. A solve can only ever be weakened, never promoted.
- **`check-no-direct-store-writes.ts:136`'s `MIN_FILES = 400`** — *"below it the gate exits 2, never 0."* Generalise this idiom; do not remove it.
- **The layer gate's unclassified-count ratchet** — *"coverage ratchets, or the gate could be made green by classifying less."* Best anti-gaming clause in the repo.
- **`QueryEngineDrain.spec.ts`** — a falsifiable misread inventory that **fails when you fix something**, forcing the inventory to move. It is *supposed* to go red on a fix.
- **`gate-debt.json`'s rules** — a gate that starts passing must leave the ledger in the same commit; nothing may be added without an explicit founder decision.
- **The NOT-YET-TRUE convention** — N5, N7, N9, N10, N11, N12 are exemplary. N10 names its own live destructive instance. Keep this discipline.
- **`SlabFragmentBuilder.ts:706-733`** — refuses to repair rather than inventing a ring, citing ADR-0299 §RECOVERY-MUST-REFUSE. This is the correct policy; make its two siblings match it.

---

# §E — VERIFICATION CHECKLIST

Before declaring any wave done:

- [ ] `npm run ga-gate:all` → **0 regressions** (record pass/fail counts before and after)
- [ ] Root `tsc` clean — the build uses a stricter root `tsc` than package-level typecheck; skipping it makes Fly hard-fail
- [ ] For each fix: the probe **failed against pre-fix code** and passes now (paste both)
- [ ] No ratchet raised without a dated justification paragraph in the gate file, same commit
- [ ] No synthetic violation left in the tree; `git status` clean of it
- [ ] Every fix: **grep for twins** — the same algorithm at a different level of correctness
- [ ] Appended to `docs/04-reference/ISSUE-LOG.md` (the live log; note `V1-LAUNCH-READINESS-AUDIT.md` **does not exist** — that pointer is stale)
- [ ] Deploy only per `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`, and only when browser-testable

---

## Audit baseline for diffing

`main` @ **`60fcd1ac`** · 2026-08-11 · GA suite at audit time: **15 passing · 17 failing (14 declared debt, 3 regression) → BLOCKED**.

One P0 was closed during the audit itself: `fd27e513` (`§FIX-CHAT-VISIBILITY-MISREAD` — visibility verbs can no longer resize geometry; 21 of 29 drain items now drain). Its structural cause — no read-only/visibility capability class — is **W3-1**.
