# ADR-0366 — Declare the graph, fix the two poisoners, and do NOT break up `apps/editor`

- **Status:** ⛔ **PROPOSED — a founder decision is required before any of this is executed.**
  **No production code was changed by this lane.** Three of the four decisions below are
  *recommendations to act*; one (§5) is a **recommendation to refuse**.
- **Date:** 2026-08-23
- **Lane:** PLAN9
- **Supersedes:** nothing. **Extends** the diagnosis written into
  `tools/ga-gate/check-per-package-compile.ts` and
  `tools/ga-gate/per-package-compile-skip-ledger.json` (§MT-09-ISOLATION-IS-NOT-ISOLATED).
- **Contracts:** **C76 §2.1/§2.2** (the boundary gate resolves identity from *workspace manifests,
  never a module resolver* — this ADR **declines** to overturn it, see §3.3) · **C76 §2.3** (four
  numbers, never one score) · **C76 §6** (absence is typed, named and counted) · **C76 §5**
  (the shell plugins are deliberate — this is why §9 recommends DELETE for almost nothing) ·
  **C70 §4.2** (machinery-present ≠ capability-reachable) · **C01** · **C14**
- **Source audits:** `docs/04-reference/AUDIT/A-architecture.md` §2.5 / §2.7 / §2.8 ·
  `docs/04-reference/AUDIT/E-quality-ci.md` §2.4
- **Implements:** **nothing.** This ADR is a plan. Its deliverable is a decision.

---

## 1. Context

The Pascal comparison audit surfaced three structural findings and filed them as items 16, 17 and
18. They were handed to this lane as *"the XL structural changes"* to be **planned, not executed**.

| # | Item | Audit size |
|---|---|---|
| **16** | Make packages compile independently | XL |
| **17** | Declare the dependency graph | L |
| **18** | Break up `apps/editor` | XL |

They are the same defect at three scales: **PRYZM has 166 workspaces and no compilation
boundary between any of them.** A "package" here is a directory convention, not a unit that can be
built, typechecked, versioned or reasoned about on its own. Everything below follows from that.

⛔ **What this ADR is not.** It does not start a migration, and it does not delete anything. §9
enumerates 26 unreachable workspaces with a verdict each, per the standing rule that this lane
**recommends and never acts**.

---

## 2. Verification — every number re-measured

⚠ The brief's figures came from an audit run earlier the same day, against a tree that eight
sibling lanes have been committing into since. **Six of the twelve had moved.** Per C76 §0.1,
each row below carries the command; the artefact wins over this table on any future read.

Tree: `Product_Rediness_08` @ **`eabbdfd0`**, measured **2026-08-23**. Working tree carried only
sibling-lane artefacts; **this lane left it byte-identical** (`git status --porcelain` before and
after show the same set).

### 2.1 Item 16 — compilation isolation

Full gate reading, `npx tsx tools/ga-gate/check-per-package-compile.ts` → **RC=1**:

```
  tsconfig-bearing packages : 97   (the population)
  compiled (tsc actually ran): 97   · floor 40
  excluded by ledger         : 8   · ceiling 8
  FAILED                     : 27
    ├ own-source errors      : 16   (actionable here)
    └ CASCADE ONLY           : 11   (zero own errors — a dependency's fault)
  passing in isolation       : 62
  NOT PROVEN to compile      : 35 of 97  ← quote THIS, not "compiled".
```

| Claim (brief) | Re-measured | Verdict |
|---|---|---|
| `check-per-package-compile.ts` → RC=1 | **RC=1** | ✔ **HOLDS** |
| 35 of 97 not proven to compile in isolation | **35 of 97** | ✔ **HOLDS exactly** |
| 11 with zero errors of their own | **11**, named: `editor-ui, engine, geometry-beam, geometry-column, geometry-door, geometry-handrail, geometry-window, picking, renderer, ui-base, views` | ✔ **HOLDS exactly** |
| `packages/engine`: *"own 0 · foreign 1864 via 18 packages"* | **verbatim match** | ✔ **HOLDS** |
| All 152 workspaces export raw `src/*.ts`; **0** export `dist` | **0 of 166** export `dist`; **163** export `src`; 3 export neither | ✔ **HOLDS** (denominator is 166, not 152) |
| — | workspaces with a `build` script: **34 of 166** | — |
| — | `packages/*/tsconfig.json` with `"composite": true`: **74** | — |
| — | tsconfigs with `"references"`: **1 file**, listing **4** projects | — |

**⚠ `packages/tsconfig.references.json:3` — the brief's warning is CORRECT and worse than stated.**

```
grep -rn "tsconfig.references" --include=*.json --include=*.ts --include=*.mjs --include=*.js \
  --include=*.yml packages plugins apps tools scripts .github package.json
# → packages/tsconfig.references.json:3   (its own comment. Nothing else in the repo.)
```

Line 3 claims *"Run via: `tsc -b packages/tsconfig.references.json` (added to root build)"*. The
root `build` script is `check-project-isolation.mjs && tsc --skipLibCheck && vite build &&
build:server-deps && write-prod-shim.mjs` — **there is no `tsc -b`**. The file also contradicts
itself at lines 6–9, admitting its own entries *"carry composite:false and `tsc -b` will skip
incremental graph walking for them."* It lists **4** of 166 workspaces. **TS project references in
PRYZM are ABSENT in effect** — 74 packages set `composite: true`, which emits `.tsbuildinfo`, with
no reference graph to walk.

### 2.2 ⭐ The 1,864 "foreign errors" are NOT 1,864 latent bugs

This is the single most important correction in this ADR, and it changes the cost of item 16 by an
order of magnitude in one direction and adds a hidden cost in another.

`tsconfig.base.json` sets `strict: true` **and `noUncheckedIndexedAccess: true`**. Exactly **two of
166** workspaces opt out of it in their own tsconfig:

```
grep -l '"strictNullChecks": false' packages/*/tsconfig.json plugins/*/tsconfig.json apps/*/tsconfig.json
# packages/command-registry/tsconfig.json
# packages/core-app-model/tsconfig.json
```

Both set `strictNullChecks: false` **and** `noUncheckedIndexedAccess: false`. Because no package has
a compilation boundary, **that exemption does not hold at the boundary — it leaks inverted into
every consumer.** When `geometry-beam` (which inherits the strict base) compiles, it drags in
`command-registry`'s *source* and typechecks it under `geometry-beam`'s flags. Hence
`own 0 · foreign 1864`, and hence the error mix: `TS18048`/`TS2532` *"possibly undefined"*.

Measured directly, compiling each poisoner under the repo's own declared base strictness:

| Package | Errors under `strict` + `noUncheckedIndexedAccess` | Of which "possibly undefined" |
|---|---|---|
| `packages/command-registry` | **1,770** | **1,283** (714 `TS18048` + 569 `TS2532`) |
| `packages/core-app-model` | **1,956** | — |

**Attribution, from the gate's own output.** Of the foreign-error lines the gate prints,
**99 of 109 (90.8 %) originate in `../command-registry/src/`**; the remainder are 4 `schemas`,
2 `scene-committer`, and one each from `stores`, `solar-analysis`, `geometry-kernel`,
`command-bus`. ⚠ **This is a sample, not a census** — the gate truncates to ~8 lines per failing
package, so it establishes *dominance*, not an exact share. The independent measurement above
corroborates it: `command-registry`'s own 1,770 is 94.9 % of the 1,864 the gate attributes to
`geometry-beam`'s full closure.

⭐ **So the eleven CASCADE-ONLY failures are not a cascade of defects. They are a cascade of
CONFIG DISAGREEMENT, and the great majority of it is attributable to two packages.** The root build never sees
these errors either — the root `tsconfig.json` leaves `noUncheckedIndexedAccess` unset and its
`include` is only `src` + `apps/editor/src/{ui,engine,rendering,types}`. **The 1,864 are visible to
the isolation gate and to nothing else.** That is why the app ships.

⚠ **And here is the hidden cost, which must not be lost.** Emitting `.d.ts` from
`command-registry` under its *own* loose config makes the cascade vanish — and produces
declarations in which inferred types have lost their `| undefined`. Consumers would then get types
that **claim non-null where the value may be null**, converting a compile error into a runtime
crash. §8 files this as the single most tempting and most dangerous shortcut in the programme.

### 2.3 Item 17 — the dependency graph

| Claim (brief) | Re-measured | Verdict |
|---|---|---|
| 1,807 of 5,700 intra-scope imports (31.7 %) undeclared | **1,923 of 6,341 (30.3 %)** | ✔ **HOLDS** — moved up in absolute, down in share |
| across 63 workspaces / 145 edges | **67 workspaces / 151 edges** | ✔ **HOLDS**, drifted |
| Pascal: 0.0 % | not re-run (no Pascal clone in this lane's tree) | — inherited from AUDIT-E §2.4 |

⭐ **But *import sites* is the wrong unit for the work, and it overstates it by 9×.** The work unit
is `(workspace, dependency)` pairs — one line of `package.json` each. Counting only real
`from` / `import()` / `require()` specifiers:

```
workspaces needing new declarations : 73
TOTAL missing (workspace, dep) pairs: 204
  of which from PRODUCTION src      : 150      (the other 54 are test-only imports)
```

| Workspace | Imports | Declares | **Missing** |
|---|---|---|---|
| `apps/editor` | 100 | 58 | **42** |
| `packages/persistence-client` | 18 | 3 | **16** |
| `plugins/window` | 8 | 2 | 6 |
| `packages/eslint-plugin-pryzm` | 5 | 0 | 5 |
| `packages/geometry-column` | 9 | 4 | 5 |
| `plugins/{ceiling,door,furniture}` | 6–7 | 1–2 | 5 each |
| `apps/bench` | 31 | 26 | 5 |

**#17 is 204 lines of JSON across 73 files.** The top five workspaces are 36.3 % of it.
`apps/editor` alone is **1,548 of the 1,923 import sites (80.5 %)** but only **42 of the 204
declarations**. This is a days-scale job, not an L-scale one.

### 2.4 ⭐ Item 17's stated payoff — TESTED, and it does not survive contact with C76

The brief says #17 is *"the ROOT CAUSE of the `eslint-plugin-boundaries` failure"* and that fixing
it *"retires ~500 lines of bespoke gate."* I tested both halves.

**The causal mechanism is real, and I confirmed it exactly.** A pnpm workspace symlink exists iff
the dependency is declared:

| Workspace | Declared `@pryzm/*` | Symlinks in its `node_modules/@pryzm` | Distinct `@pryzm/*` imported |
|---|---|---|---|
| `apps/editor` | 58 | **58** | **100** |
| `packages/persistence-client` | 3 | **3** | **18** |

Not approximately — **exactly**. So `eslint.config.js`'s claim that *"pnpm symlinks some and not
others"* is describing a **deterministic consequence of the undeclared deps**, not a random
property of pnpm. Declaring them would make the symlink set equal the import set.

**The magnitude, measured across the whole tree:**

```
distinct @pryzm/* specifiers imported anywhere : 129
  resolvable from the hoisted root node_modules: 102
  workspace exists but NOT hoisted             :  26   ← resolve only from a declaring package
  no such workspace (a lint-test fixture string):  1   (@pryzm/sdk, in eslint-plugin-pryzm's own test)
```

**26 of 129 specifiers resolve position-dependently.** That is precisely *"catches a violation in
one package and silently skips the identical one next door."* The rationale in `eslint.config.js`
and in **C76 §2.2** is **verified, not stale**.

⛔ **Therefore the stated payoff is refused.** **C76 §2.2 is a MUST**: *"Package identity is
resolved from workspace manifests, never from a module resolver."* Retiring
`check-layer-boundaries.ts` in favour of a resolver would require superseding a CANONICAL contract
MUST — and it would be a **downgrade** even if it were permitted, because the manifest map is exact
and independent of install state, while a resolver is only ever as correct as the last `pnpm
install`. **#17 is still worth doing. It is worth doing for §7's reasons, not this one.**

### 2.5 Item 18 — `apps/editor`

| Claim (brief) | Re-measured | Verdict |
|---|---|---|
| 1,786 files | **1,786** | ✔ exact |
| 587,012 LOC | **587,013** | ✔ (one line drifted) |
| 33 % of PRYZM | **33.0 %** (of 1,779,739 across packages+plugins+apps) | ✔ |
| 1.32× Pascal's entire product | **1.32×** (Pascal 444,102, from AUDIT-A §2.1) | ✔ |
| 26 workspaces with zero importers | **26** — reconciled exactly, see §9 | ✔ |
| `render-runtime/package.json:33` carries an un-executed DROP verdict | **verbatim**: *"Wave-12 DROP: @pryzm/render-runtime had 0 importers at Wave 8 close. Verdict: DROP"* | ✔ |

⚠ **The LOC figure is easy to get wrong on Windows.** `find … | xargs wc -l | tail -1` reports only
the **last xargs batch** and yields **83,583**. The correct form sums the batches:
`… | xargs wc -l | grep 'total$' | awk '{s+=$1}END{print s}'` → **587,013**.

### 2.6 Supporting readings

`npx tsx tools/ga-gate/check-layer-boundaries.ts` → **RC=3** (unchanged from AUDIT-A §2.3):
166 workspaces · 151 classified · **15 UNCLASSIFIED** · **103** upward imports · **179** L5-facade
bypasses · **121** banned third-party imports. Per C76 §2.3 these are four numbers and are not
summed here.

---

## 3. Decision A — the order is **17 → 16 → 18**, but the brief's reason for it is not the load-bearing one

**ADOPTED, with a correction to the argument and a split of #16.**

### 3.1 The brief's chain, tested

> *"declared deps are the precondition for project references, which are the precondition for
> splitting an app safely."*

**Link 1 — declared deps → project references: TRUE, and mechanically hard.** `tsc -b` resolves a
referenced project's `.d.ts` through node resolution. For the 26 non-hoisted specifiers (§2.4) that
resolution **fails today** unless the importer declares the dep. You cannot build a reference graph
over edges the package manager has not linked.

**Link 2 — project references → safe app split: TRUE but weak.** Splitting `apps/editor` is
blocked by its *internal* cycle (§5), which project references neither cause nor cure. References
make a split *verifiable*, not *possible*.

### 3.2 ⭐ The correction: #17 is necessary but nowhere near sufficient for #16

**#16's real blocker is not the missing declarations. It is that `command-registry` (1,770 errors)
and `core-app-model` (1,956 errors) are not strict-null-clean, and every consumer typechecks their
source** (§2.2). Declaring 204 dependencies does not remove one of those 3,726 errors.

So #16 must be split, and the expensive half is **independent of #17 and can start in parallel**:

| Phase | Work | Depends on |
|---|---|---|
| **16a — de-poison** | make `command-registry` + `core-app-model` compile clean under `tsconfig.base.json`; delete their two opt-out lines | **nothing** — can start today |
| **16b — emit + reference** | `dist` exports, `composite: true`, a real reference graph, a `tsc -b` step in the root build | **17** and **16a** |

And #17 splits the same way:

| Phase | Work |
|---|---|
| **17a — declare** | add the 204 missing `(workspace, dep)` pairs. Mechanical, reversible, no behaviour change |
| **17b — enforce** | a gate asserting *imported ⊆ declared*, ratcheted to 0. Without 17b, 17a rots in a week |

### 3.3 The recommended sequence

```
17a  declare 204 deps                     ──┐
16a  de-poison the two packages           ──┼─→  16b  dist + references  ──→  18 (vertical only, §5)
17b  imported ⊆ declared gate             ──┘
```

**17a, 16a and 17b are independent of each other and can run concurrently.** 16b is the join.
**18 is gated behind a separate founder decision and this ADR recommends against its stated form.**

---

## 4. Decision B — the first slice is `packages/schemas`, and it is **measured, not estimated**

**ADOPTED.**

### 4.1 Why this package

| Property | `packages/schemas` |
|---|---|
| layer | **L0** — the sink of the graph |
| workspace deps | **none** (`ulid`, `zod` only) — a true leaf |
| workspaces importing it | **51** — the highest fan-in leaf in the tree |
| P5 status | pure; `check-domain-purity.ts` hard-fails on it, so it cannot silently regress |
| export subpaths | **26** — enough to exercise the hard part of the migration |

⚠ One near-miss worth recording: `grep "@pryzm/renderer-three" packages/schemas/src` returns a hit
at `materials/materialRecord.ts:5`. **It is inside a comment.** P5 holds. A grep that does not
distinguish a comment from an import would have disqualified the correct first slice.

### 4.2 What it actually cost — executed

I ran the emit half for real. `dist/` is `.gitignore`d (line 2), so this produced **no tracked
change**; the artefacts were removed afterwards and `git status` is unchanged.

```
cd packages/schemas && npx tsc -p tsconfig.json
# RC=0 · 0 errors · real 0m10.8s
# emitted: 191 .d.ts + 191 .js
```

And under `composite: true`, which is what `tsc -b` requires:

```
# 191 .d.ts emitted · 0 real errors
# (2 TS2688 "cannot find type definition file" for @webgpu/types and node — an artefact of running
#  the probe config from outside the repo's typeRoots, not a property of the package)
```

⭐ **The emit half of the first slice is ~11 seconds and zero errors.** No `TS2742`
("cannot be named") portability failures — the classic composite-emit blocker — appeared.

### 4.3 What the first slice still has to prove, in order

The emit is the easy part. The slice is only complete when all five land:

1. Rewrite the **26-entry `exports` map** to `{"types": "./dist/x.d.ts", "import": "./dist/x.js"}`.
2. Set `composite: true`; add `{"path": "../schemas"}` to the 51 consumers that declare it
   (which is why **17a comes first**).
3. Insert `tsc -b` into the root `build` **before** `vite build` — today there is none, so
   `vite build` would resolve `dist/` before anything created it. **This is the step that breaks the
   build if forgotten.**
4. Keep the dev loop alive — see §6.1. **This is the step that breaks the founder.**
5. Re-run `check-per-package-compile.ts` and confirm the number moved in the right direction.

**Exit criterion for the slice:** `pnpm --filter @pryzm/schemas build` produces `dist`, the root
build passes with `tsc -b`, `npm run dev` still hot-reloads a schema edit, and the isolation gate's
"NOT PROVEN" count is strictly lower. **If step 4 cannot be met, stop the programme and re-plan** —
it is the one that makes the difference between a migration and a tax.

---

## 5. Decision C — ⛔ **REFUSE item 18 in its stated form.** Extract verticals, never the horizontal split

**RECOMMENDED REFUSAL. This is the decision the founder most needs to make explicitly.**

### 5.1 The measurement that decides it

"Break up `apps/editor`" reads as *lift `src/ui` and `src/engine` into packages*. Those two
subtrees are **1,308 of the 1,786 files**. They are **mutually recursive**:

| Edge | Count |
|---|---|
| `src/ui` → `src/engine` | **93** |
| `src/engine` → `src/ui` | **110** |
| `src/ui` → `src/rendering` | 16 |
| `src/rendering` → `src/ui` | **1** |
| `src/engine` → `src/rendering` | 4 |
| `src/rendering` → `src/engine` | **0** |

⭐ **The horizontal split is not a move, it is a dependency-inversion programme over 203 edges
before a single file changes directory.** A package cannot import its own importer. `src/rendering`
is the only clean horizontal seam, and it is 6 files.

### 5.2 The vertical seams, by contrast, are nearly free

`apps/editor/src/ui` decomposes into feature verticals, and several have **zero inbound edges**:

| Vertical | files | inbound from outside itself |
|---|---|---|
| `ui/apartment-layout` | 29 | **0** |
| `ui/analysis` | 29 | **0** |
| `ui/house-layout` | 19 | **0** |
| `ui/geospatial` | 46 | **1** |
| `ui/dataworkbench` | 38 | **2** |
| `ui/documentation` | 26 | 3 |
| `ui/ai` | 41 | 5 |
| `ui/site` | 60 | 11 |

**Five verticals totalling 161 files can be extracted with ≤2 inbound edges each.** That is a real,
incremental, stoppable-at-any-point path. The horizontal one is not.

### 5.3 Is item 18 worth doing at all? — **Mostly no, and the audit agrees with itself here**

⭐ **AUDIT-A §2.9 is the counterweight and it should be read as binding.** PRYZM's per-family split
is *right*: **103** kind-name branches in framework packages against Pascal's **446**, and **zero**
per-kind residue folders in framework code against Pascal's 27. PRYZM already won the architectural
argument that item 18 sounds like it is relitigating.

But there is one honest argument **for** a bounded version, and it is measurable:

```
kind-name branches in apps/editor/src            : 239
kind-name branches in the 7 framework packages   :  73
```

**The kind-branching PRYZM removed from its framework has accumulated in its app at 3.3× the
density.** `apps/editor` is at L7 where no inter-package gate reaches inside it, so this is
invisible to every boundary check in the repo. That is a real finding and it is the *only* part of
item 18 that buys something today.

**Recommendation:** ⛔ **do not schedule "break up `apps/editor`".** Instead:

- **Accept** that a 587k-LOC composition root is not itself a defect. `apps/editor` has **0
  importers by design** — nothing is blocked by its size except reuse that nobody is currently
  asking for.
- **Do** extract verticals opportunistically, when a vertical is *already* being worked on for a
  product reason. Never as a migration.
- **Do** treat the **239 kind-name branches** as the actual debt, and let the registration-layer
  work other lanes are already doing retire them. That is a different and cheaper programme.

**#18 as written is a multi-year tax for a benefit the product does not need yet.** If the founder
wants one sentence: *the app being big is a symptom, and the disease is being treated elsewhere.*

---

## 6. Blast radius — stated honestly

### 6.1 ⛔ The dev loop is the real risk, and it hits the founder directly

`vite.config.ts` has **no alias for `@pryzm/*`** (only `@pryzm/renderer-three/three` → `three` and
the three `@app/*` paths). Vite resolves every workspace package through its `exports` map, lands on
`src/*.ts`, and compiles the TypeScript source directly. **That is what makes `npm run dev`
hot-reload a package edit today.**

Point `exports` at `dist/` and **that stops**. Editing `packages/schemas/src/foo.ts` would change
nothing on screen until a `tsc` run completes.

**This is not optional to solve, and it must be solved in the same PR as the first slice**, by
running `tsc -b --watch` alongside Vite. ⚠ Per the standing memory note *localhost dev is unusable
— test on prod*, the founder may not be exercising `npm run dev` often enough to notice this
regression quickly. **That makes it more dangerous, not less.**

### 6.2 Does the app stay shippable throughout? — **Yes for 17a/16a/17b. Conditionally for 16b.**

| Phase | Shippable? | Why |
|---|---|---|
| **17a** declare deps | ✔ **yes, always** | adding a `dependencies` entry that pnpm already hoists changes no resolution outcome. Pure metadata. Reversible per line |
| **16a** de-poison | ✔ **yes** | narrowing types in two packages; every change is a compile-time fix guarded by the existing suites |
| **17b** the gate | ✔ **yes** | a gate, not a code change |
| **16b** dist + references | ⚠ **per-package, and only if the build order lands first** | the root build has no `tsc -b`; until it does, the first package to export `dist` **breaks `vite build`** |

⭐ **The mitigation that makes 16b safe is available and cheap:** migrate one package at a time and
keep the rest on `src`. Because `exports` is per-package, **`dist` and `src` packages coexist
without any global flag day.** There is no big-bang cutover in this programme and there must never
be one.

### 6.3 What breaks that is not obvious

- **The root build's 6144 MB ceiling is load-bearing today** and project references are the thing
  that would relieve it — but *only after* enough packages are converted. Mid-migration the build
  does both: `tsc -b` on the converted set **and** the monolithic `tsc` on the rest. **Peak memory
  goes up before it goes down.**
- **`vite.config.ts:246-289`** hand-splits manual chunks by matching `id.includes('@pryzm/core-app-model')`
  and six siblings. Those matches survive a `dist` path (the string is still present), but this is
  path-string coupling and it should be re-verified per package, not assumed.
- **8 packages sit in `per-package-compile-skip-ledger.json`** (`ai-host`, `command-registry`,
  `constraint-solver`, `core-app-model`, `family-instance`, `family-loader`, `headless`,
  `runtime-composer`) and are excluded from the gate's exit code. The ledger is shrink-only and
  correctly refuses to grow silently. **16a pays off two of the eight directly** —
  `command-registry` and `core-app-model` — **and is the precondition for the 11 CASCADE-ONLY
  packages, which cannot be fixed in themselves.** ⚠ Per ledger RULE 2, a row that starts
  compiling cleanly must be **deleted in the same commit that fixes it**, or the gate exits 3
  (STALE).

---

## 7. What each item actually buys — measured, not asserted

| Item | Claimed benefit | Verdict |
|---|---|---|
| **17** | *"an off-the-shelf resolver becomes trustworthy, retiring ~500 lines of bespoke gate"* | ⛔ **REFUSED.** Mechanically true (§2.4) but **prohibited by C76 §2.2** and a downgrade regardless. Do not bank it |
| **17** | project references become buildable | ✔ **TRUE and load-bearing.** 26 of 129 specifiers are unresolvable from a non-declaring package today |
| **17** | `pnpm --filter <pkg> test/build` becomes correct in isolation | ✔ **TRUE.** Today 73 workspaces would fail if the root hoist vanished |
| **17** | removes a class of works-from-the-root bugs | ✔ **TRUE**, and it is the one a user would feel |
| **16** | 35 of 97 packages become provable | ✔ **TRUE**, and cheaper than it looks — ~95 % of the cascade traces to two packages (§2.2) |
| **16** | faster, less memory-hungry builds | ⚠ **TRUE ONLY AT THE END.** Worse in the middle (§6.3). Do not sell this as an early win |
| **16** | each package's declared strictness becomes binding at its boundary | ⭐ **TRUE, and this is the real prize.** Today two packages' self-declared exemption leaks *inverted* into every consumer |
| **18** | reuse of `apps/editor` internals | ✖ **NO DEMAND.** `apps/editor` has 0 importers by design; nothing is waiting on this |
| **18** | inter-package gates reach inside | ⚠ **PARTLY TRUE** — and the 239 kind-name branches are the only concrete thing it would catch (§5.3) |

---

## 8. ⛔ DO-NOT-DO — the tempting shortcuts, and why each is wrong

1. ⛔ **Do not emit `.d.ts` from `command-registry` / `core-app-model` under their current loose
   config.** It makes the gate green in an afternoon and it is the worst thing in this document.
   Declarations built with `strictNullChecks: false` drop `| undefined` from inferred types, so
   every one of the 1,283 *possibly-undefined* sites becomes a **type that lies to its consumer** —
   a compile error traded for a runtime crash. **16a exists precisely to avoid this.**

2. ⛔ **Do not add `@pryzm/*` entries to the root `tsconfig.json` `paths` to make a resolver work.**
   It is a two-line change that appears to fix §2.4 and instead **re-creates L-809 with extra
   steps**: a second identity map that can disagree with the manifests, policing a rule C76 §2.2
   assigns to the manifests. If the boundaries plugin is ever wired, it must read the same map the
   gate reads.

3. ⛔ **Do not raise `SKIP_CEILING` in `check-per-package-compile.ts`.** The ledger's own RULE 1
   says raising it *"is choosing to ship an unproven package."* The ledger already survived one
   hard-coded-map and one auto-skip defect; it should not survive a third.

4. ⛔ **Do not do a flag-day `dist` cutover.** `exports` is per-package; `dist` and `src` packages
   coexist (§6.2). A repo-wide switch converts a stoppable migration into an unstoppable one.

5. ⛔ **Do not convert `apps/editor` to `dist`.** It is the composition root with 0 importers.
   It has nothing to declare to anyone and would gain only the dev-loop regression.

6. ⛔ **Do not start #18 by moving files.** The 203-edge `ui ↔ engine` cycle (§5.1) means the first
   move creates a circular package dependency, which fails at a strictly worse layer than the
   current mess: a build error instead of a code-organisation complaint.

7. ⛔ **Do not delete any of the 26 workspaces in §9** — standing founder rule, and C76 §5 records
   that several are *deliberate declared shells*, not accidents.

8. ⛔ **Do not land 17a without 17b.** Declarations with no gate rot back within weeks; that is
   how the tree reached 204.

9. ⛔ **Do not quote "1,807 undeclared imports" as the size of #17.** It is 204 lines in 73 files
   (§2.3). Sizing the item by import sites is what made it look like an L.

---

## 9. The 26 unreachable workspaces, enumerated with a verdict

**Method.** Single-pass scan of every `.ts/.tsx/.js/.mjs/.cjs` file under
`packages plugins apps src server tools scripts`, matching `'<name>'` and `'<name>/…'`, excluding
the workspace's own directory. **`.json` baselines were deliberately excluded** — a name in
`scripts/check/test-ci-coverage-baseline.json` is not an importer, and counting it "rescues" 20
workspaces that nothing can call.

**Reconciliation with AUDIT-A §2.7:** raw result is **36** zero-importer workspaces. Nine are
`apps/*`, which are entry points by definition. Of the remaining 27, `headless` and `release` are
entry points by design. `render-runtime` shows two "importers" — **both are gate files naming it as
a policed string** (`eslint-plugin-pryzm/src/rules/no-l7-boundary-violation.js`,
`tools/ga-gate/check-l7-boundary.ts`), not consumers, so it belongs on this list. **27 − 2 + 1 = 26.**
✔ Matches the audit exactly.

⛔ **DELETE NOTHING. These are recommendations.**

### 9.1 Packages — **14 of the 26**

*(16 rows: `release` and `headless` are listed for completeness and are **excluded** from the 26 as
entry points by design.)*

| Workspace | ts | Verdict | Reason |
|---|---|---|---|
| `packages/render-runtime` | 12 | ⭐ **DELETE — the only unambiguous one** | Its own `package.json:33` carries an executed decision: *"Wave-12 DROP … Verdict: DROP"*. The verdict was recorded and never carried out. **Either drop it or delete the field** — a stale DROP verdict in a manifest is worse than neither |
| `packages/legacy-shim` | 2 | ✔ **KEEP** | Self-describes as *"fixture-only package used by `pryzm/no-raf` lint integration"*. Reachable by the lint fixture harness, not by import. **Correctly unreachable** |
| `packages/bench-visual-diff` | 1 | ✔ **KEEP** | Has a `bin`; a CLI entry point. Invoked by command, not import |
| `packages/release` | 0 | ✔ **KEEP** | `bin`, release tooling. Entry point by design (listed for completeness; excluded from the 26) |
| `packages/headless` | 5 | ✔ **KEEP** | A headless runtime — a `composeRuntime` **caller**, named as such in `check-single-compose.ts`. Entry point by design (excluded from the 26) |
| `packages/ordinance-extraction` | 61 | ✔ **KEEP** | Largest orphan. C58/C23 named subsystem, **20 test files**, 15 docs references. Real capability, unwired. **A wiring gap, not dead code** |
| `packages/api-spec` | 5 | ✔ **KEEP** | The OpenAPI 3.1 source of truth. C76 §4 pins its SHA-256 in a test — **consumed by a test, not by an import** |
| `packages/data-engine` | 8 | ⚠ **UNKNOWN** | C28 Data Panel engine, 3 tests, only 2 doc references. Overlaps `apps/editor/src/ui/dataworkbench` (38 files). **Ask: is the workbench meant to sit on this?** |
| `packages/pdf-to-bim` | 6 | ✔ **KEEP** | ⭐ C76 §5 records it explicitly as **a REVIEW QUEUE, NOT A CONVERTER**. Its unreachability is documented and deliberate |
| `packages/render-pipeline` | 7 | ⚠ **UNKNOWN** | TSL WebGPU passes. **0 tests, 0 doc references** — the weakest provenance of any package here. **Most likely genuine dead code, but nothing states it** |
| `packages/speculative-engine` | 2 | ⚠ **UNKNOWN** | Read-only consequence preview; 0 tests, 3 doc refs. Adjacent to C72 propagation work |
| `packages/wcag-audit` | 5 | ✔ **KEEP** | Audit runner, invoked as a tool (ADR-0052 §B.2), 7 doc refs |
| `packages/expr-eval` | 5 | ⚠ **UNKNOWN** | SPEC-01 §4.1 parametric evaluator. `packages/formula-library` and `schemas/schedule/formula` may have superseded it. **Check for duplication before anything else** |
| `packages/feature-flags` | 3 | ⚠ **UNKNOWN** | Kill-switch registry. **A flag registry nothing imports cannot kill a switch** — either wire it or retire it |
| `packages/beta-signup` | 7 | ✔ **KEEP** | Server-side surface; consumed via the API layer, not the client graph |
| `packages/oauth2-pkce` | 3 | ✔ **KEEP** | RFC 7636 utilities; backend, no client edge. C76 §8 N7's unlayered-backend question |

*(`a11y-tokens` has exactly one importer — `scripts/check/check-a11y-token-contrast.mjs` — so it is
reachable and not on this list.)*

### 9.2 Plugins — **12 of the 26.** ⭐ Read C76 §5 before judging any of these

| Workspace | ts | Verdict | Reason |
|---|---|---|---|
| `plugins/schedules` | 36 | ⚠ **UNKNOWN — the most valuable question here** | Largest orphan plugin. **13 test files, 27 doc references**, a named product capability. Nothing imports it. This is [[authored-but-unwired]] at its purest |
| `plugins/multiplayer` | 14 | ⚠ **UNKNOWN** | 4 tests, 12 doc refs. PRYZM's collaboration story is a differentiator vs Pascal (which has none). **An unwired multiplayer plugin is a claim without a path** |
| `plugins/dxf` | 5 | ✔ **KEEP** | C76 §5: *the DXF engine is IMPLEMENTED while its plugin is a declared SHELL*. Deliberate |
| `plugins/{ai-floorplan,ai-generative,ai-query,ai-rules,ai-voice}` | 4–7 | ✔ **KEEP** | The AI plane registers in-process via `composeRuntime → getAiHost`, not by plugin import. Unreachability here is expected. ⚠ **But `PLUGIN_CATALOG` lists them, so `runtime.plugins.list()` reports capabilities with no module behind them** — a C70 §4.2 machinery-vs-capability gap worth its own row |
| `plugins/render` | 4 | ✔ **KEEP** | Shell; paired with `render-pipeline`. **Decide the pair together, not separately** |
| `plugins/navigate` | 6 | ⚠ **UNKNOWN** | 9 doc refs; absent from `PLUGIN_CATALOG` entirely |
| `plugins/visibility-intent` | 5 | ⚠ **UNKNOWN** | P7 is a live principle with a live gate, and `packages/visibility` **is** reachable. This plugin duplicates the name. **Check for rivalry before keeping** |
| `plugins/family-editor` | 1 | ✔ **KEEP** | 1 file; paired with `apps/component-editor` (89 files), which is a real app |

**Summary of the 26: 1 DELETE (already decided, never executed) · 16 KEEP-with-reason · 9 UNKNOWN.**

- **DELETE (1):** `render-runtime`
- **UNKNOWN (9):** `data-engine`, `render-pipeline`, `speculative-engine`, `expr-eval`,
  `feature-flags`, `plugins/schedules`, `plugins/multiplayer`, `plugins/navigate`,
  `plugins/visibility-intent`
- **KEEP-with-reason (16):** everything else in §9.1–§9.2

⭐ **The 9 UNKNOWNs are the useful output of this section** — each is a question only the founder
can answer, and none of them is *"is this dead?"* but ***"was this meant to be wired?"***

---

## 10. What the founder is being asked to decide

| # | Decision | This ADR recommends |
|---|---|---|
| **D1** | Run **17a** (204 declarations) + **17b** (a gate)? | ✔ **YES.** Days, not weeks. Reversible. Ships throughout |
| **D2** | Run **16a** (de-poison the two packages, ~3,726 errors)? | ✔ **YES**, and it is the real cost of the whole programme. Start it in parallel with D1 |
| **D3** | Run **16b** (`dist` + references), starting with `packages/schemas`? | ⚠ **YES, BUT** only after the §4.3 exit criterion — especially the dev loop (§6.1) — is met on the first slice. **If step 4 fails, stop** |
| **D4** | Run **18** (break up `apps/editor`)? | ⛔ **NO.** Refuse the horizontal split outright (§5.1). Extract verticals only when product work is already in one. Treat the 239 kind-name branches as the actual debt |
| **D5** | `packages/render-runtime` — execute the DROP verdict, or delete the stale field? | **One or the other.** Not a third year of both |
| **D6** | The 9 UNKNOWN workspaces (§9) — wire or retire? | Founder call. `plugins/schedules` and `plugins/multiplayer` first — both are **named product capabilities with no path to a user** |

⚠ **If only one of these is approved, make it D1.** It is the cheapest, it is the precondition for
D3, and it is the only one that improves the tree even if the rest of the programme is abandoned.

---

## 11. Related

- `docs/04-reference/AUDIT/A-architecture.md` §2.5 (compilation boundary), §2.7 (reachability),
  §2.8 (where the mass is), §2.9 (⭐ the counterweight — PRYZM's per-family split is right)
- `docs/04-reference/AUDIT/E-quality-ci.md` §2.4 (the phantom-dependency measurement), §3.4
  (⭐ Pascal's real enforcement mechanism is `tsc --build`, not a linter)
- `C76-PLATFORM-AND-API-SURFACE.md` §2.2 (the resolver prohibition this ADR declines to overturn),
  §5 (the declared shells), §6 (absence is typed and counted)
- `tools/ga-gate/per-package-compile-skip-ledger.json` — the ledger whose `strictness-skew` class
  is the *forward* direction of the defect §2.2 measures in the *inverse* direction
- `tools/ga-gate/check-layer-boundaries.ts` — the authority for the layer rule, per C76 §2.1
