# PRYZM 2 — Critical Architecture Review

| Field | Value |
|---|---|
| Date | 2026-04-27 |
| Scope | `docs/02-decisions/contracts/` (00–18 + Wave-2 indices) and `docs/00_NEW_ARCHITECTURE/` (00–10 + Context + PROCESS-TRACKER + `phases/`) |
| Type | Critical review — gaps, contradictions, robustness/clarity issues, Forma/Qonic-grade shortfalls |
| Audience | Tech lead, architecture review |

> Goal: refactor the documented architecture to a quality bar comparable to **Autodesk Forma** / **Qonic**. This document is ruthless on purpose. Every finding is grounded in the corpus; file/section/line references are inline.

---

## A. Cross-cutting / meta-architecture problems

These are the issues that, if not fixed first, will cause the rest of the rebuild to silently lose its grip.

### A1. The binding hierarchy is asserted but not enforced anywhere
- `02-decisions/contracts/_README.md` declares the order **`06-IDENTITY → 08-VISION → 10-MASTER → 00–07 NEW_ARCH → 00–18 contracts`**, with per-file supersession banners.
- `08-VISION.md` §10: "08 wins over every other doc except `06-IDENTITY` and the `.pryzm` file-format spec."
- There is **no machine-readable manifest** of who wins over what (no JSON, no front-matter version field, no `governance.yaml`), and no CI check that fails when a contract still asserts a rule that NEW_ARCH has overturned.
- Result: contracts in `02-decisions/contracts/` still contain rules (LWW conflict resolution in §07, JSONB snapshots in §09, Immer-only mutation in §01) that NEW_ARCH explicitly negates. Engineers reading those contracts will implement the wrong thing unless they also memorise the supersession banner. **This is a foot-gun, not "documentation."**

### A2. `CONFLICT-ANALYSIS.md` is referenced from at least four places and does not exist
- `02-decisions/contracts/_README.md`, `_AUDIT_AND_CONSOLIDATION_PLAN.md`, `_WAVE2_SUMMARY.md`, and the per-file supersession banners all link to **`docs/00_NEW_ARCHITECTURE/CONFLICT-ANALYSIS.md`**.
- The file does not exist.
- That document is *the* artefact that makes the supersession real (per-rule conflict map, what wins, migration path). Without it, every reader has to construct the conflict map in their head from a 40,000-line corpus. **Fix this before Sprint 1.**

### A3. The contract corpus is internally lossy after Wave 2
- `_WAVE2_SUMMARY.md` §3: "**No internal cross-reference rewrite.** A reference inside what is now §09 Part B that says 'see §13' still says that." Thousands of in-document `§NN` cross-references are stale; the reader is told to mentally apply `_README.md §5.1` as a forwarding table on every link.
- Combined with the per-file supersession banner that voids whole sections, the cognitive cost of reading the contracts correctly is now **larger than the cost of just rewriting them**.
- Either (a) execute a one-shot mechanical rewrite of cross-refs, or (b) demote the entire `02-decisions/contracts/` folder to `archive/` and treat NEW_ARCH as the only normative source. Mixed regime is the worst option.

### A4. "Solo founder + Replit Agent" is the load-bearing assumption — and it is incompatible with the rest of the document set
- `10-MASTER-IMPLEMENTATION-PLAN-36M.md` is calibrated for **solo + agent**. `07-EXECUTION-PLAYBOOK.md` is calibrated for **4 → 11 FTE**. These are different operating models, not different formats of the same model. Every architectural commitment in 08-VISION (eight CI gates, OTel coverage, plugin SDK + marketplace, headless package, AI worker, sync server, bake worker, export worker, observability stack) was *sized* for the FTE model.
- Concretely: P1–P8 are eight independent CI/lint regimes, plus `eslint-plugin-pryzm-no-raf`, plus boundaries enforcement, plus span-coverage check, plus 17 named bench gates (08 §6), plus a no-full-snapshot test, plus a `pryzm dev` hot-reload toolchain, plus a marketplace, plus signed plugin manifests, plus per-plugin permissions, plus an AI approval queue, plus Yjs server, plus BullMQ workers, plus R2 chunk store, plus OTel→Honeycomb pipeline, plus IFC4 round-trip, plus DXF/DWG, plus self-host story, plus sandbox CSP… **for one human + an agent over 36 months**.
- Forma has hundreds of engineers behind it. Qonic is a focused but well-funded team. The plan does not contain a credible *capacity* model — there is no "what gets cut if velocity slips by 20% / 40% / 60%" matrix. Only kill-switches mentioned in `02-ORCHESTRATION` (itself superseded). **Single biggest delivery risk in the entire corpus.**

### A5. Multiple "decision-binding" docs say contradictory things about the wire format
- `08-VISION` §3 (P4): "Every state mutation flows through a `CommandHandler<TPayload>`. Handlers produce **Immer patches** … emitted as **MessagePack-encoded events with ULIDs**, which are simultaneously the undo log, the persistence event log, the sync wire format and the audit trail."
- `09-AS-IS-VS-TO-BE` §L3: "**Yjs CRDT** with conflict-free merge of every command."
- These two are *not* the same wire format. Yjs has its own update encoding (`Y.encodeStateAsUpdate` / `Y.applyUpdate`). You cannot have a single MessagePack event log that is **simultaneously** the undo log, persistence log, *and* the Yjs update stream — they are different bytes, with different merge semantics, ordering guarantees, and conflict handling. The plan needs a sharp answer to: do commands emit Immer patches that get translated into Y.Doc mutations on the way out (and Y.Doc updates get translated into patches on the way in)? Or is Y.Doc the source of truth and Immer patches are derived? **ADR-002 territory and PROCESS-TRACKER shows ADR-002 is unstarted.**
- Phase 1D explicitly downgrades to "LWW until 2D CRDT." That means M12 Alpha ships with **non-CRDT** persistence, then Phase 2D rewrites the wire format. This is a much larger refactor than the plan acknowledges, because the event log in Phase 1 will not be replayable into Y.Doc state without bespoke bridging code.

### A6. The "L7.5 AI Operations" layer is asserted but under-specified
- `08-VISION` §4 puts AI between L7 and L6 in the diagram, calls it a "first-class architectural layer." `09-AS-IS` §L7.5 is one short table.
- No contract for: **(a)** how the approval queue interacts with CRDT ordering (does an approved AI batch get an actor identity? what if a human edits the same elements while the queue is pending? conflict resolution?), **(b)** rate-limit / quota / cost accounting (AI is the only layer where each operation has a literal $ cost), **(c)** prompt/version pinning for reproducibility, **(d)** how the headless `@pryzm/headless` package gets AI access (it can't ship the LLM keys), **(e)** what "L7.5" means in the boundaries lint — can L7.5 import L4 directly, or only through L2 commands?
- Contract `04-BIM-AI-MODIFICATION-PROTOCOL` is marked "🔴 SUPERSEDED — rewrite/replace" with the famous self-supremacy clause voided, but **nothing has been written to replace it**.

### A7. Visibility Intent is "preserved verbatim" — that's a category error
- `09-AS-IS` §L7 line 121: "11-wave Visibility-Intent UI … **Preserved verbatim** — refactored into smaller classes but logic untouched. Visual diff every frame in CI."
- Contract `12` describes a Cut/Beyond/Hidden/Projection rule matrix with override layers and a `StyleResolutionCache`. This is a hot-path subsystem that runs per-frame per-element; preserving its **algorithm verbatim** while moving it across the L4/L5/L7 boundary almost certainly violates P1 (kernel purity) — today the rules touch THREE materials, scene flags, and `userData`. There is no documented plan for which parts move into the pure kernel (cut/beyond classification = pure geometry math), which become a `committer.ts` concern (material swap, edge style), and which stay in the renderer (per-pass dirty flags).
- "Visual diff every frame in CI" is also unrealistic — visual diffs run on golden scenes, not "every frame" of an interactive system. This is a slogan, not a gate.

### A8. The 264 → ~110 command consolidation has no triage rubric
- `09-AS-IS` §4 lists per-subdomain triage outcomes (DROP / MERGE / PORT / LIFT) but never defines what each means, what makes a command DROP-able vs MERGE-able, or who decides. Without a written rubric, the consolidation will be inconsistent.
- Corollary: **`affectedStores` is at 92% adoption today**, the plan claims "100% by S03." Migrating the remaining 22 commands sounds easy until you realise the laggards are laggards because they touch cross-store state in ways that don't fit the pattern. The plan needs to *name those 22 commands* and have a per-command resolution.

### A9. The CI-gate machinery is the actual contract — and it isn't written
`08-VISION` §3 says "CI gate" eight times (one per principle):
1. `forbiddenDependencies` lint for `packages/geometry-kernel/`
2. `eslint-plugin-boundaries` blocking THREE outside scene-committer
3. Custom `eslint-plugin-pryzm-no-raf`
4. `affected-stores-required` lint
5. `eslint-plugin-boundaries` global matrix
6. `(window as any)` block with sprint-level progress targets
7. `no-full-snapshot.test.ts`
8. OTel span-coverage check on new exported L0–L6 functions

Plus the 17 bench gates in §6. Plus a bundle-size gate. Plus a Lighthouse FCP gate. **None of these exist yet** (PROCESS-TRACKER shows S01 still in flight). Until those gates are running, the principles are aspirational, the discipline paragraph (§9) is a prayer, and every PR will silently re-introduce the patterns the rebuild was supposed to delete.

---

## B. Pillar-by-pillar critical gaps

### B1. Geometry kernel (P1, L4, contracts 01/02)
- **Booleans / topology**: producers use `three-bvh-csg`. That library is unsuitable for production BIM at the level Forma/Qonic operate — known robustness issues on coplanar faces, degenerate edges, non-manifold input; no exact-arithmetic mode. Forma uses Parasolid (or its derivative); Qonic uses CGAL/OpenCASCADE-class kernels. There is **no contract defining the geometric robustness budget** (coordinate range, minimum feature size, tolerance for coincident-edge merges, snapping rules at the kernel level). Without this, you will silently lose the "5,000 walls" target the moment two non-perpendicular walls meet at a column.
- **No constraint solver mention.** Revit-style parametric constraints (lock dimension, equal, perpendicular, tangent) require a 2D solver (SolveSpace, planegcs, or in-house). Forma has light constraints; Qonic is investing here. PRYZM 2's "Family Editor" claim (D10) is impossible without one.
- **No analytic vs display geometry split.** A wall has a centerline (analytic), a swept solid (display), an MEP routing surface (analytic), and a poche fill (display). The contracts treat geometry as one thing. This will bite the moment you try schedules ("count linear meters of centerline") vs takeoffs ("count m³ of brick layer") vs IFC export (analytic representation context).
- **Headless purity tests**: P1 says CI fails on transitive THREE imports in `packages/geometry-kernel/`. Phase 1A names this as the critical rail. **No specification of how the test is run** — transitive analysis is non-trivial; `three-bvh-csg` itself imports THREE; you have to either fork it or use an adapter pattern. Needs an ADR.

### B2. Persistence (P7, L0, contract 09)
- **Event log + chunked binary is correct in principle**, but the contract is silent on:
  - **Compaction**: an append-only log for a 36-month-old project will be enormous. When/how do you snapshot? Where does the snapshot live? Does loading require replaying every event since beginning of time?
  - **Schema migrations**: P7 mentions `schemaVersion` migrations, but every event payload is also versioned (`Wall.v1` vs `Wall.v2`). The contract is silent on event-payload migration (can a v2 client read a v1 event log? must we re-bake?).
  - **Bake-worker idempotency / retries**: BullMQ jobs fail. What happens to a partially-baked chunk set? Is there a transactional pointer flip?
  - **Multi-region**: R2 has eventual consistency; Postgres is strongly consistent. The plan never says what the consistency window between event commit and chunk visibility is.
- **`.pryzm` ZIP**: D7 (headless), D3 (self-host), D9 (IFC) all depend on the file format being stable from M12. Phase 1D ships v1. There is **no signed-format spec, no CRC plan, no streaming-read story** (you cannot stream a ZIP central-directory-trailer without random-access to the end of the file — fine for downloads, painful for HTTP-progressive-render).
- **Storage cost model is missing.** "One event per command" + chunked rebake on every event = N events × M chunks. For an active project this can be GB/day per user. No cost ceiling, no garbage-collection policy, no tiered-storage policy.

### B3. Sync / CRDT (L3, contract 07)
- **Yjs is fine for text, comments, and presence. It is not battle-tested for parametric BIM geometry.** No published BIM tool runs Yjs as the sole conflict resolution layer for geometric mutations. Yjs convergence guarantees apply to operations on Y.Doc structures (Y.Map, Y.Array, Y.Text), not to *application semantics* over them. If user A moves a wall and user B inserts a door on it concurrently, Yjs will converge the *fields*, but the door's `hostId` may end up dangling, the wall's openings array may contain a stale offset, and the bake worker will produce a geometrically-inconsistent chunk.
- The contract says "structured 3-way for parameters; lock-respecting for concurrent edits." That's a sentence, not a spec. Forma's actual answer is "delayed sync with operational locking and explicit merge"; Qonic's is closer to OT with element-level reservation. PRYZM is claiming to beat both with Yjs alone. **Hardest CS problem in the rebuild and it has no design doc.**
- Soft locks with TTL — TTL is set how? UX when your lock expires mid-edit? Conflict resolution when two users grab the same element a few ms apart? PRYZM 1 has none of this; PRYZM 2 ships it as part of M22-M24 with no prototype.

### B4. Drawing engine / plan view / sections (contracts 10, 11, 12, Phase 2B)
- **Make-or-break for D8** (desktop-CAD documentation parity). Contract 11 admits "section hatch (poche fill)" and "far clip for section depth" are missing. Phase 2B explicitly defers full force-directed label placement to Phase 3. Hidden-line *quality* — the thing that makes Revit look like Revit and SketchUp look like SketchUp — is "not yet classified."
- View templates, view filters, view-range, scale-dependent symbology, cut-plane stability across edits, override propagation — mentioned in passing but never specified. Forma is *weaker* than Revit here; Qonic is investing; PRYZM claiming "Matches Revit" (09 §5 D8) without a contract for view templates is overpromising.
- The Canvas2D / WebGPU split (contract 10) is a workaround for a GPU device-conflict bug. Fine tactical fix, but it caps drawing-engine quality at "Canvas2D hairlines" (contract 11 line 333). For real CAD-grade output you need anti-aliased vector primitives with consistent stroke ordering, dash phase preservation, hatch alignment, and PDF/SVG-faithful export. None of that comes from Canvas2D for free.

### B5. Type catalog & material library (contract 17)
- Contract 17 is **271 lines** for the entire "Element Types & Material Library" — material persistence to Supabase is "Future Work," material inheritance from layers to the WebGPU resolver is "still planned." This is the foundation of every BIM workflow (a "wall type" is what carries layer composition, fire rating, U-value, schedule grouping, IFC mapping). Forma ships ~30 wall types out of the box; Revit ships hundreds + a vibrant template ecosystem. PRYZM 2 has no contract for: type catalog inheritance, type vs instance parameters, per-type override semantics, type-level family parameters, system families vs loadable families, or material inheritance across layers.
- This 271-line contract should be ~1500 lines. **Most under-invested document in the corpus.**

### B6. Rooms, levels, elevations (contracts 02, Phase 2A M13)
- Phase 2A "non-element completion" includes Rooms but explicitly **defers multi-level rooms to Phase 3**. Contract 03's relationship graph mentions Host/Insert but never room-bounding semantics (which surfaces of which walls bound which rooms when overlapping volumes exist).
- Levels: contract 02 says `worldY = Level.elevation + baseOffset`. That's a single global Z. Real BIM has split levels, sloped levels (terrain following), level associations per discipline (architectural vs structural), and level-bound vs level-spanning elements. None of this is in the corpus.
- **Without a rich level/room model, schedules and IFC export are incorrect.**

### B7. AI subsystem (contract 04, L7.5)
- Same gaps as A6 above, plus:
  - **Determinism/reproducibility** of AI outputs — the plan never addresses prompt versioning, model versioning, seed/temperature pinning. Without it, "approval queue" is approving a different output every time.
  - **Cost guardrails**: each AI call has a real cost; the AI bench in §6 (`< 15 s for AI floor-plan import`) only measures latency.
  - **Headless AI**: `@pryzm/headless` is a key differentiator (D7) but cannot embed the LLM key. No design for how a headless script invokes AI safely.

### B8. Security / collaboration / multi-tenancy (contract 07)
- LWW conflict resolution is voided per the supersession banner; CRDT replaces it; but **the actual security model didn't change**. The contract acknowledges no device fingerprinting, server-side AI-key relay only, basic JWT/bcrypt. For C3 (large enterprise) you need: SSO (OIDC/SAML), SCIM provisioning, audit log streaming to SIEM, tenant-scoped encryption keys, RLS policies per project, OAuth scopes, MFA. None of this is on the 36-month plan.
- For collaboration security: who can grant a soft lock? Can a guest editor lock a structural wall? Permission model is mentioned (D4 has "7 named permissions") but there's no role/permission matrix — it's implicit.
- The contract still leaks Supabase service-role-key behaviour — RLS bypassed at the server level. **Sales-stopper for C3 customers.**

### B9. Plugin SDK / marketplace (L6, D4, M64)
- The marketplace is sized as one sprint (S64). Realistically: payment infra, plugin signing, malware scanning, version dependency resolution, free/paid tiers, refunds, plugin reviews, support workflows. **A quarter of work, not a sprint.**
- The sandbox model (web worker + postMessage, CSP) is realistic for read-mostly plugins but very limiting for tools that need synchronous canvas access (e.g. a measure tool plugin that wants to draw a preview overlay at 60 fps with cursor latency < 16 ms — postMessage RTT is 1-5 ms minimum, often more, and accumulates). The plan needs to define which plugin classes can have "fast path" host integration vs which are fully sandboxed.
- Hot-reload `pryzm dev` < 500 ms (D6) is a developer-tooling claim; it depends on Vite HMR boundaries inside a sandboxed worker, which is non-trivial.

### B10. Observability (P8, OTel)
- "Span on every new exported function in L0–L6, CI-enforced" is a beautiful idea. In practice it produces unreadable traces (every helper becomes a span; flame graphs explode). The discipline needs to be span-on-meaningful-boundary, not span-on-every-function. The CI gate as written will be either useless (auto-rubber-stamped) or deeply annoying.
- No contract on **trace volume budgets, sampling, or OTel exporter cost**. Honeycomb at PRYZM scale (10,000-wall projects, 20 concurrent users) bills per event; this is an observability-cost problem the plan ignores.

### B11. Testing strategy
The corpus has bench gates and a snapshot regime for producers. It does not have:
- End-to-end test framework (Playwright? Cypress?)
- Visual-regression framework for the UI
- A "golden project" suite for IFC round-trip
- A multi-user concurrency test harness (the bench `concurrent-users.ts` is named but not specified)
- An accessibility test pass (WCAG 2.2 AA — not mentioned anywhere)
- A property-based testing strategy for the geometry kernel (essential for boolean correctness)

### B12. Bundle-splitting / Cesium / web-ifc (contract 18)
- Contract 18 admits Step 3 (defer 3.4 MB of `web-ifc`) is *blocked* because OBC statically imports it. The OBC-demotion plan (NEW_ARCH) is supposed to fix this — but only at S55–S62 (legacy deletion). **For 18 months you ship the 3.4 MB.**
- Cesium is huge and used only for geospatial context; the plan to lazy-load it is sound but the contract never measures the *first-paint regression* when a project has geospatial context (lazy load means a placeholder during load).
- The "< 1.8 MB gzip initial bundle" target (08 §6) at GA presupposes the OBC removal, the 264-command consolidation to ~110, and the React decision (vanilla TS). These compound; if any one slips, the bundle goal slips.

---

## C. Where the plan falls short of Forma / Qonic GA

| Capability | Forma / Qonic | PRYZM 2 plan | Gap |
|---|---|---|---|
| Geometric robustness | Parasolid-class (Forma) / OpenCASCADE-class (Qonic) | three-bvh-csg | **Will not handle real architectural cases at scale.** |
| Constraint solver | Light (Forma) / In progress (Qonic) | None mentioned | **Family Editor (D10) is impossible without one.** |
| IFC fidelity | IFC4, partial IFC4.3, certified | "IFC4 round-trip parity" by M36 | **No bSI certification target.** |
| View templates | Forma weak; Revit strong | Not specified | **Beats Revit (D8) without specifying templates.** |
| Sheet revisioning | Standard | Not in 2C | **Required by C2 (mid-size practice).** |
| Annotation richness | Standard (text styles, dim styles, leaders, callouts, revision clouds) | Phase 2A M13 | **Surface scope only.** |
| Schedule formulas | Forma weak; Revit strong; Qonic catching up | "SUM, COUNT, IF" DSL in 2C | **No conditional formatting, no key schedules, no embedded params.** |
| Worksets / branching | Revit yes; Forma no; Qonic limited | Not on roadmap | **Enterprise BIM table stakes.** |
| BCF support | Forma yes; Qonic yes | D9 ("BCF issues") with no contract | **Mentioned but not designed.** |
| Performance at scale | Forma 100k+ elements | "10,000 walls / 50 levels" by M36 | **One order of magnitude behind.** |
| SDK ecosystem | Forma marketplace early; Qonic n/a | Marketplace S64 | **Planned, but undersized.** |
| GIS / geospatial | Forma deep | Cesium present, integration "partial" (D3 ◑) | **PRYZM has the asset, no integration plan.** |
| Sustainability / analysis | Forma core | Explicit non-goal (NG3) | **A non-trivial loss vs Forma's core value prop.** |
| Generative design | Forma yes (Spacemaker heritage) | Plugin only | **PRYZM already has GenerativeDesignAdvisor — not on the roadmap.** |
| Mobile / tablet | Forma viewer; Qonic responsive | NG4 | **OK as a non-goal but limits C1 (solo architect) on iPad.** |

The honest read: PRYZM 2's plan beats Forma/Qonic on **collaboration semantics (D1), AI-as-layer (D2), self-host (D3), plugin SDK depth (D4), observability (D5), DX (D6), headless (D7), parametric authoring (D10)**. It loses on **geometric robustness, IFC certification, sustainability/analysis, GIS depth, scale-of-model**. That is a defensible positioning, but the docs claim "beats every named competitor on every measured dimension" (08 §5 intro) — that is **not what the matrix actually shows**.

---

## D. 36-month plan realism

### D1. The 12 ADRs are the gating bottleneck
- `05-IMPLEMENTATION-PLAN.md` §17 lists 12 ADRs that must be made before Sprint 1. PROCESS-TRACKER shows most are still `[ ]`.
- ADR-002 (CRDT choice) is the most consequential — it dictates the wire format, the persistence layer, the undo system, *and* the public API. Until it is decided, every "command/event/Yjs/MessagePack" sentence in the corpus is approximate.
- ADR-009 (plugin sandbox model) gates the entire L6 layer.
- The plan should not start Sprint 1 (S01) without all 12 ADRs ratified. PROCESS-TRACKER says you are inside S01 already. **You're building on undecided foundations.**

### D2. PROCESS-TRACKER.md has no kill-switch column
- `02-ORCHESTRATION.md` defined kill-switches; `10-MASTER` references them; PROCESS-TRACKER never tracks them. So when do you actually trigger one? On what signal?
- PROCESS-TRACKER also has **no risk register section** — risks are scattered across 00-AUDIT (six structural failure modes), 09-AS-IS (per-layer migration risks), and 10-MASTER (sprint-level risks). Nothing consolidated.

### D3. The migration story for live customers is missing
- Phase 2 explicitly defers customer migration to "Phase 2D/3A." That means PRYZM 1 keeps running for 24 months while PRYZM 2 builds in parallel. Real questions never answered:
  - Do PRYZM 1 customers see a feature freeze (per 08-VISION) or do they get fixes?
  - When a PRYZM 1 customer migrates to PRYZM 2, what happens to their JSON snapshot, their thumbnails, their Stripe subscription, their sharing links?
  - What if PRYZM 2 doesn't yet support a feature their project uses (curtain walls? schedules?)?
  - What about projects co-edited during the transition?
- This needs a 2-page "PRYZM 1 → PRYZM 2 customer migration contract" before any PRYZM 1 user is even *told* about PRYZM 2.

### D4. Phase 1B's "Wall End-to-End" is not actually end-to-end
Phase 1B implements miter joins and defers cross-element cascade to 1C, defers room-bounding to 2A, has no boolean kernel for non-perpendicular joins, and uses planar-cap miter math. A *real* "wall end-to-end" milestone would include: openings cut by doors and windows, multi-layer compound walls, host-insert cleanup on element delete, room-bound association, level association, baseline vs face-based wall logic, drawing-engine plan symbol, schedule line, IFC4 export of `IfcWallStandardCase`, undo, redo, multi-user merge, AI prompt to "make this wall fire-rated 60 min." Until Phase 1B includes those, it's "wall sliver" not "wall end-to-end" — and the rest of Phase 1 will assume more than 1B delivers.

### D5. The "K1-C multiplier" (3 days per element family) is fiction
Phase 2A assumes 3 days per family. Walls took **months** in PRYZM 1 (the contract for it is 1,646 lines). Curtain walls, MEP, stairs, and roofs each have hundreds of edge cases. The K1-C number is an aggressive average that will produce slipping schedules from Phase 2A onward.

### D6. The "delete in one sprint" plan for legacy code (S61) is high-risk
Deleting `EngineBootstrap.ts`, `ProjectSerializer.ts`, `ImportProjectCommand.ts`, `initUI.ts` *plus* all 264 commands *plus* `(window as any)` callsites in a single sprint is genuinely scary. A safer plan stages: (a) S55–S60 dual-run (new + old behind a feature flag), (b) S61 flip the flag default, (c) S62 delete the old code. The current plan omits (a).

---

## E. Top recommendations (priority-ordered)

1. **Write `CONFLICT-ANALYSIS.md` this week.** Referenced from four places, voids whole sections of contracts, does not exist. Without it, the binding hierarchy is folklore.
2. **Settle ADR-002 (CRDT/event-log unification) before S02.** The contradiction between "MessagePack event log is the wire format" (08 P4) and "Yjs is the conflict resolution" (08 §1, 09 §L3) must be resolved into a single design with code-level interfaces shown. Your sprint plan currently builds the event log first, then bolts CRDT on later — that is a 6-month rewrite waiting to happen.
3. **Replace `02-decisions/contracts/` wholesale.** Keep the old folder as `archive/` for forensic value. Rewrite ~12 short, sharp normative contracts under NEW_ARCH that match the new layer model exactly. Stop maintaining two parallel corpora.
4. **Write a serious capacity model.** "Solo + Agent for 36 months delivers eight CI gates, 17 benches, marketplace, IFC, headless, plugin SDK, AI layer, sync server, bake worker, export worker, OTel pipeline, self-host" is not true. Identify the 5 must-haves for M12, M24, M36 and explicitly cut the rest. Most likely casualties: marketplace at GA, IFC4 round-trip at GA, OTel coverage of all hot paths, headless AI, soft-lock CRDT semantics. Cut early.
5. **Pick a real geometry kernel story.** Either commit to `three-bvh-csg` and write a robustness contract that *defines* what input it can survive, or plan a swap to a more capable kernel (manifold-3d, OpenCASCADE.js, JSCAD's geom kernel) with a migration sprint. Today the corpus assumes geometric robustness without naming the kernel.
6. **Specify the type catalog properly.** Contract 17 needs to triple in size (parameters, families, system families, layer composition, IFC mapping, type catalog import, key plan symbol) before Phase 1C ships any element families against it. Otherwise Phase 1C bakes in a thin model that everything else has to work around.
7. **Write a real drawing-engine contract.** Contract 11 needs hidden-line classification rules, hatch/poche specification, view-range model, view-template inheritance, view-filter override semantics, anti-aliasing strategy, and a vector-export pipeline (PDF + SVG + DXF). This is your differentiation vs Forma; right now it is a Canvas2D rasteriser.
8. **Write the multi-user semantics contract.** Yjs awareness + soft locks + CRDT merge for *parametric BIM elements* is novel CS. Write the design doc with worked examples (two users edit the same wall; one inserts a door; one moves the wall; one deletes it; reconnect from offline; lock TTL expiry) before Phase 2D.
9. **Define rooms, levels, and view templates as first-class L1 stores with their own contracts.** Today they are afterthoughts in 02 and 03; without them, schedules and IFC are incorrect.
10. **Build the eight CI gates in Sprint 1.** P1–P8 are the architecture. Until the gates are red on violations, the architecture is a wish list. Make S01 deliverables: the eight gates, even if the codebase initially has thousands of violations behind warning-only modes.
11. **Add a security/threat model and a privacy/data-residency contract for C3 (enterprise self-host).** Without SSO, audit-log streaming, tenant key separation, and IFC sanitisation, C3 is unaddressable.
12. **Stop claiming "beats every named competitor on every measured dimension."** The competitive matrix doesn't show that. The honest claim is "wins on D1–D7, D10; matches on D8–D9; loses on geometric robustness, scale, sustainability, IFC certification." That positioning is defensible and credible. The current claim is neither.

---

## F. Suggested next moves (any one of these unblocks the rebuild)

- (a) Draft the missing **`CONFLICT-ANALYSIS.md`** with the actual conflict map between the 19 contracts and NEW_ARCH (most valuable; prerequisite for everything else).
- (b) Write a tightened **single-contract replacement** for one pillar (e.g. drawing engine, type catalog, or CRDT semantics).
- (c) Produce a **risk-prioritised cut list** for the 36-month plan tied to a realistic capacity model.
- (d) Code-level audit of which existing PRYZM 1 modules are closest to (and farthest from) the L0–L7.5 layer they're supposed to become.

---

*End of review.*
