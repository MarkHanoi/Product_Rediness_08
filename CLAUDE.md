# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PRYZM is a BIM (Building Information Modeling) SaaS platform: a browser-based 3D editor with
real-time collaboration, AI-assisted design, and IFC/Revit/DXF/Rhino interoperability. It is a
**pnpm monorepo** (`pnpm@10.26.1`, Node ≥20) currently mid-migration to the "PRYZM 3"
architecture (see Governance below).

## Commands

```bash
npm run dev            # Express + Vite dev server on port 5000 (tsx server.js)
npm run build          # isolation check → tsc --skipLibCheck → vite build → prod shim
npm run lint           # eslint across the repo
npm run check:isolation        # project + storage isolation static checks
npm run check:commandmanager   # CI guard: no legacy commandManager.execute() sites

# Tests — there is no single root "test" script; suites are split by config:
npm run test:server    # vitest, server/__tests__/**  (Node env, Express/permissions)
npm run test:pryzm1    # node test runner, tests/*.test.ts (tsx --test)
npm run test:ci        # per-workspace: pnpm -r run test:ci, concurrency 1
npx vitest run         # root vitest.config.ts — src/ui panel + toolbar binding tests (happy-dom)
npx playwright test    # E2E, tests/e2e/** across chromium/firefox/webkit

# Single test
npx vitest run path/to/file.spec.ts          # one file
npx vitest run -t "test name substring"      # by name
pnpm --filter @pryzm/<pkg> test              # one workspace package's suite
npx playwright test tests/e2e/foo.spec.ts --project=chromium
```

Most `packages/*` and `apps/*` expose their own `test`, `test:watch`, and `typecheck` scripts;
run them with `pnpm --filter @pryzm/<name> <script>`. The build is memory-hungry — the `build`
script sets `NODE_OPTIONS=--max-old-space-size=6144`.

Required env vars to run the server: `DATABASE_URL`, `SESSION_SECRET`, `CF_WORKER_URL` (or
`ANTHROPIC_API_KEY`), `PRYZM_OWNER_EMAIL`, `PRYZM_OWNER_PASSWORD`. Optional: Supabase, Stripe,
Google/Microsoft OAuth credentials.

## Architecture

### Two halves of the codebase

- **`server.js`** (root, ~240 KB) — a single Express Backend-for-Frontend. It owns auth, data
  APIs, file storage, AI proxying (to a Cloudflare Worker via `CF_WORKER_URL`), Stripe billing,
  the plugin marketplace API, and Socket.io. DB schema is in `server/dbMigrate.js`, applied on
  startup. Backend modules live in `server/`. PostgreSQL is the database; Yjs powers CRDT
  collaboration.
- **The client** — a layered TypeScript SPA. `index.html` is the entry; `src/` is the
  transitional client root.

### The 8-layer model (PRYZM 3)

The client is governed by a strict layered dependency rule: **a layer may import from any lower
layer, never a higher one.**

> ⚠ **Corrected 2026-08-09 (L-809).** This paragraph used to end "CI enforces this via
> `eslint-plugin-boundaries`". **It did not.** `eslint.config.js` configured no `import/resolver`,
> so boundaries could not resolve `@pryzm/*` specifiers — which is how essentially every
> cross-package import here is written — and silently checked nothing for them. The rule was set
> to `'error'` and matched almost none of the imports it existed to police.
>
> **The authority is `tools/ga-gate/check-layer-boundaries.ts`**, which maps `@pryzm/X` → directory
> by reading each workspace `package.json`. That is exact and independent of pnpm symlink state —
> which is precisely what made resolver-based checking unreliable here (some `@pryzm/*` packages
> are linked into a given package and some are not, so a resolver caught a violation in one place
> and silently skipped the identical one next door). It imports the tables from `eslint.config.js`
> rather than copying them. `boundaries/element-types` is retained and still catches relative-path
> violations, but it is not the layer gate.

```
L7    apps/* (13)                — per-app surfaces (editor, marketplace, workers, docs-site…)
L6    plugins/* (48)             — features
L5    packages/plugin-sdk/       — curated public SDK facade (re-exports a subset)
L4    packages/renderer, render-runtime, persistence-client, scene-committer
L3    packages/runtime-composer, ui-base, stores, view-state, file-format, sync-client
L2    packages/geometry-kernel, ai-host, constraint-solver, drawing-primitives
L1    packages/command-bus, picking, visibility, snapping, renderer-three, spatial-index,
      frame-scheduler, …
L0    packages/schemas/          — pure Zod schemas; no I/O, no THREE, no DOM
```

> **Counts measured 2026-08-11** — `ls apps/ | wc -l` → **13**; `ls plugins/ | wc -l` → **48**;
> `ls packages/*/package.json | wc -l` → **97** real workspaces (`ls packages/ | wc -l` is 99 —
> two entries under `packages/` carry no manifest, so count manifests, not directories; this
> matches [STR-03 §1](docs/01-strategy/STR-03-engineering-vision.md)). These rot. Prefer re-running the command over trusting the
> number: the table's purpose is the *ordering*, not the census.

**Two orderings above were corrected by measured edge direction, not by preference:**

- **apps moved BELOW → ABOVE plugins.** The old table put apps at L5, beneath the plugins they
  host. Measured `apps → plugins` **142**; `plugins → apps` **0** real import statements.
  `apps/editor` imports twenty-odd plugins in order to *register* them — that is what a
  composition root does, and it is structural, not debt. Encoding the old order minted **151
  permanent false violations**.
- **`frame-scheduler` L3 → L1.** It imports nothing at all, and is consumed by eleven L2
  `geometry-*` packages plus `core-app-model`. A zero-dependency primitive consumed by L2 cannot
  sit at L3; the old placement generated ~29 false violations.

**Stated honestly as NOT-YET-TRUE, so nobody mistakes them for settled invariants:**

- **"plugins may import L6 only" is a GOAL, not an invariant** — ~630 SDK imports against
  **171 direct bypasses at a baseline of 182**, alongside **102 layer violations** and
  **13 unclassified packages** (measured **2026-08-16**: `npx tsx tools/ga-gate/check-layer-boundaries.ts`
  → **exit 0**, *"within baselines (violations 102/102, unclassified 13/13, sdk-bypass 171/182)"*).
  This bullet previously said **181/181**; both halves were wrong — the count is **171**, and the
  ceiling is **182**. **Read the gate, not this line** — it is the artefact that computes these, and
  all three are shrink-only ratchets that move most weeks. Do not treat the bypass figure as
  monotonic: it has gone both up and down, which is precisely why a hand-copied number here rots.
  The bypass count is tracked separately from the layer count rather than folded into it, because
  `plugin → renderer-three` goes *downward*: it is a facade-encapsulation breach, not a layer
  violation, and merging the two would make both numbers unreadable.
- **`runtime-composer` is not really L3.** It is the P1 composition root and necessarily imports
  `persistence-client`, `renderer`, four typology packs, five plugins and `apps/editor`. Either it
  belongs at the top or those registration edges must invert. 16 violations are this.
- **`core-app-model` / `command-registry` sit at L2 while importing L4.** The real debt is that a
  domain model depends on persistence.
- **Backend packages have no layer** — `admin-overrides`, `ai-spend`, `api-rbac`, `api-spec`,
  `rate-limit`, `webhooks`, `email-transport`, `beta-signup`. Consumed only by
  `apps/api-gateway` / `marketplace-api`, zero client dependencies. **Open question: does this
  model extend to the backend, or does the backend need its own?**

The main editor application is `apps/editor` (`@pryzm/editor`). Each element type (wall, door,
roof, stair, curtain-wall, slab, etc.) is split across a `packages/geometry-*` package (geometry
math) and a `plugins/*` package (the user-facing tool, commands, UI).

### The 8 principles — binding commitments; FOUR are enforced at the invariant

> ⚠ **Corrected 2026-08-11.** This heading used to read "these are CI-enforced and merge-blocking",
> flat, for all eight. **That was false for half of them** and it is the same class of defect as
> L-809/L-812: a document describing enforcement that either did not exist or did not enforce the
> stated invariant. The authoritative, per-principle state is
> [STR-03 §2](docs/01-strategy/STR-03-engineering-vision.md#2--the-8-architectural-principles-p1p8),
> which carries the gate path and the current reading for each. Do not re-flatten this heading.

1. **P1 — Single composition root.** Production code obtains a runtime only via
   `composeRuntime()` in `packages/runtime-composer`. No parallel runtime wiring.
   → **D1 arm hard-fails at the invariant; R1/C1 are shrink-only ratchets**
   (`tools/ga-gate/check-single-compose.ts`). Measured 2026-09-01: **1 definition · 1/1 rival
   (`createFamilyEditorRuntime`, blessed by ADR-0316) · 2/2 production callers**, RC=0.
   > ⚠ **This line read `1 definition / 0 rivals` until 2026-09-01, and BOTH halves of that were
   > wrong.** The rival count was transcribed from a terminal line that hard-coded the string
   > `"0 rivals"` while the gate's own body named one (**L-12830**); that literal was removed from
   > the gate on **2026-08-30** (`4a4b35c0`), and this doc line was the last uncorrected copy.
   > And "hard-fail at the invariant" was never true of R1: a rival is BASELINED, not allowlisted,
   > deliberately — so it stays counted and printed on every run. **Read the gate, never this line.**
2. **P2 — Single THREE owner.** `import * as THREE` is allowed **only** in
   `packages/renderer-three/`. Anywhere else fails CI.
   → **hard-fail at the invariant** (`tools/ga-gate/check-three-imports.ts`, 0 importers outside).
3. **P3 — Single rAF.** `requestAnimationFrame()` is called only in
   `packages/frame-scheduler/src/RafAdapter.ts` — the frame scheduler is its OWN L1 package, it is
   not "inside `runtime-composer`". All animation subscribes to the frame bus.
   → **hard-fail at the invariant** (`tools/ga-gate/check-raf-count.ts`, exactly 1 owner).
   > ⭐ **CONFIRMED GREEN 2026-08-29 — recorded here because the CONTRACTS were wrong
   > PESSIMISTICALLY, which costs budget rather than safety.**
   > `npx tsx tools/ga-gate/check-raf-count.ts > /tmp/raf.txt 2>&1; echo "RC=$?" >> /tmp/raf.txt`
   > → **RC=0**, `[raf-tripwire] OK: 1 owner` (`packages/frame-scheduler/src/RafAdapter.ts`),
   > **files scanned: 5438 (excluded 2841)**, plus *"Comment-only mentions (not owners): 5 file(s)"*.
   > ⚠ **THIS BULLET WAS ALREADY RIGHT.** `C01` §1 and `C01` §5 both read *"FAILING: 5 owner files,
   > target 1"* and were the LAST uncorrected copies — `C14`'s banner and
   > `CONTRACT-AMENDMENT-REGISTER` §11B had both already corrected it. Corrected in `C01` by the
   > same patch that added this note, so the fact lives in one place with one reading (C84 EI-9).
   > ⭐ **The "5" was 1 owner + 4 COMMENT lines, three of them doc comments asserting P3
   > compliance** — the gate counted sentences until `§RAF-GATE-COMMENT-BLIND` (2026-08-10).
   > ⛔ **Do not re-open P3 from a naive `grep -c requestAnimationFrame`: that grep reproduces the
   > exact defect the fix removed.** Run the gate.
4. **P4 — No `(window as any)`.** Forbidden outside the one allowlisted shim file — *as a rule*.
   **NOT-YET-TRUE as enforcement:** `check-cast-count.ts` is a shrink-only ratchet and is on
   `tools/ga-gate/gate-debt.json`.
   > ⛔ **Corrected AGAIN 2026-08-29 — the 2026-08-18 box below is now stale in the OPPOSITE
   > direction. This bullet has been wrong in BOTH directions inside eleven days.** The 08-18 box
   > read *"**RC=0**, terminal line `[cast-tripwire] OK: 3 = baseline.` · scoped 215 files ·
   > **3 / 3** · repo-wide 4821 files · **100 / 100** … **Both arms are within ceiling; neither is
   > breached.**"* **Re-run 2026-08-29 (HEAD `064a838e`):**
   > `npx tsx tools/ga-gate/check-cast-count.ts > /tmp/cast.txt 2>&1; echo "RC=$?" >> /tmp/cast.txt`
   > → **RC=3**. Terminal line: `[cast-tripwire] FAIL (repo-wide): 101 (window as any) cast(s) >
   > baseline 100.` · **repo-wide 5,315 files · 101 / 100** (tests excluded) · **scoped strict
   > (`src`, `apps/editor/src/engine`) 11 / 3 — headroom −8**, in the gate's own words:
   > *"A regression added 8 new cast(s)."* **BOTH arms are breached; neither is within ceiling.**
   > ⛔ **RC=3 is SHRINK-ONLY RATCHET EXCEEDED, and `run-all.ts:1162` sets `anyFailed=true` on code
   > 3 UNCONDITIONALLY. It is NOT absorbable via `gate-debt.json`
   > (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 / L-836). Fix the 8 new casts. Raising either ceiling, or
   > adding a ledger entry to swallow the exit-3, is the one forbidden fix.**
   > ⭐ **The lesson is the OSCILLATION, not the number.** 08-16 read RED · 08-18 read GREEN ·
   > 08-29 reads RED — three transcribed readings, three verdicts, one gate. Stale-pessimistic
   > wastes budget on a solved problem; stale-optimistic **certifies a breach as clean**, which is
   > worse. **If you are quoting a number out of this bullet, you have already made the mistake it
   > documents. Read the gate.**

   > ⚠ **SUPERSEDED 2026-08-29 — kept as the record of the oscillation, NOT as a reading.**
   > ⚠ **Corrected 2026-08-18 — this bullet claimed the gate was RED. It is GREEN.** It read
   > *"**RED — exit 3** (measured 2026-08-16) … repo-wide **209 / 215** … scoped **6 / 4** — **this
   > is the breach**"*. **Re-run:** `npx tsx tools/ga-gate/check-cast-count.ts > /tmp/cast.txt 2>&1;
   > echo "RC=$?" >> /tmp/cast.txt` → **RC=0**, terminal line `[cast-tripwire] OK: 3 = baseline.`
   > · scoped (`src`, `apps/editor/src/engine`) **215 files · 3 / 3** · repo-wide **4821 files ·
   > 100 / 100** (tests excluded). **Both arms are within ceiling; neither is breached.** The
   > earlier reading was not merely stale, it was stale *pessimistically* — it named a breach that
   > the gate does not report, which is the same class of defect as claiming enforcement that does
   > not exist, inverted. **Read the gate, never this line.** ⛔ *(Every number in THIS box is the 08-18 measurement and is NO LONGER TRUE — see the 08-29 box above.)*

   > ⚠ **The `commandManager` sub-finding under this bullet was ALSO stale — rewritten
   > 2026-08-18.** It read: *"one of the six is
   > `apps/editor/src/engine/views/PlanViewToolOverlay.ts:786` … `(window as any)['commandManager']`
   > aliased to `_lvl`, then `_lvl.execute(...)` … its own comment states the rationale — bracket
   > notation avoids the GA gate pattern … `check:commandmanager`'s **51/52 PASS**"*.
   > **Three of those four claims are now false.** Measured 2026-08-18:
   > - **The cited site is GONE.** `grep -n commandManager apps/editor/src/engine/views/PlanViewToolOverlay.ts`
   >   → **3 hits, none of them a cast and none at :786** (`:386`/`:393` comments, `:445`
   >   `commandManager: window.commandManager, // TODO(TASK-06)`). There is no
   >   `(window as any)['commandManager']` in that file and no `_lvl` alias.
   > - **`check:commandmanager` is not passing.** `npm run check:commandmanager > /tmp/cm3.txt 2>&1;
   >   echo "RC=$?" >> /tmp/cm3.txt` → **RC=1**, `FAIL -- count 139 exceeds threshold 136 (+3)`.
   >   It resolves to `scripts/check/ci-check-no-commandmanager.mjs`, **not** a `tools/ga-gate/`
   >   script. **Do not quote "51/52 PASS".**
   > - **The name-blindness point SURVIVES, and is the part worth keeping.** A gate that classifies
   >   by NAME can be satisfied by RENAMING — that is roadmap §7B.5, and it is why there are now
   >   *three* rival commandManager counters disagreeing with each other:
   >   `tools/ga-gate/check-no-commandmanager.ts` → **RC=1**, *"failing at its DECLARED level
   >   (literal 11/11 · window 62/62 · cm.execute 62/62); absorbable via gate-debt.json"*;
   >   `tools/ga-gate/check-commandmanager-any.ts` → **RC=0**, `OK: 25 / 25`; and the npm script
   >   above → **RC=1** at 139/136. **Three denominators, three verdicts, one subject.** Name the
   >   gate you ran, or do not quote a number.
   *Exit condition:* the repo-wide count reaches 0 and the gate leaves `gate-debt.json`.
5. **P5 — Schemas are pure.** `packages/schemas/` has zero I/O, zero THREE, zero DOM imports.
   → **hard-fail at the invariant** (`tools/ga-gate/check-domain-purity.ts`, 0 impurities / 165 files).
6. **P6 — Commands are the only mutation path.** UI must dispatch through `commandBus`; no
   direct store writes from UI code. **NOT-YET-TRUE as enforcement:**
   `check-no-direct-store-writes.ts` passes *at a baseline of 37 tolerated direct writes*, not at 0.
   *Exit condition:* baseline reaches 0, then flip the gate to hard-0.
7. **P7 — Visibility intent ≠ UI state.** `packages/visibility/` is a domain concept, not UI.
   **PARTIALLY ENFORCED:** `check-visibility-intent-not-ui.ts` **exits 0** (measured 2026-08-16).
   ARM A is hard-0 inside `packages/visibility/src` — **20 files, 0 UI leaks**. ARM B is a ratchet
   and reads **40 / 43** across **772 UI files** — *within* baseline, **not RED**. This bullet said
   *"RED today (45 … against a baseline of 43)"*; that was wrong, and wrong **pessimistically** —
   the gate passes and the count had come down, not up. The largest single holder is
   `ProjectVisibilitySection.ts` at 13 of the 40.
   The gate's own output still says persistence, per-view scoping and the AI intent path are
   **NOT CHECKED**, so *"P7 holds"* remains something this gate cannot tell you.
   *Exit condition:* ARM B reaches 0 and the three unchecked axes get arms of their own.
8. **P8 — Explicit sync conflicts + spans.** CRDT merges that lose data surface as
   user-resolvable conflicts; **every new exported function must add ≥1 OpenTelemetry span.**
   **The two halves have DIFFERENT states — do not flatten them.**
   - **Spans half — NOT-YET-TRUE as enforcement, and currently RED.**
     `npx tsx tools/ga-gate/check-otel-spans.ts > /tmp/otel.txt 2>&1; echo "RC=$?" >> /tmp/otel.txt`
     → **RC=3** (measured 2026-08-18). The gate is **three-zone**, not the single `HARD_FLOOR: 213`
     count this bullet used to describe: **ZONE A** (CommandBus handlers, zero tolerance)
     **246 / 246 instrumented**; **ZONE B** (command-registry + app handlers + plugin barrels)
     **54 uninstrumented of 70 against a baseline of 52** — *this is the failure*, 2 new files
     (`UpdateElementParameterCommand.ts`, `lightingAuthoredParams.ts`); **ZONE C** is an
     un-gated census — **1772 of 2023** files declaring an exported function have **no span**.
     So *"every new exported function must add ≥1 span"* is measured for **zero** of the 2023 —
     Zone C prints the number and gates nothing. **The baseline is shrink-only; fix the two files,
     never extend it.**
   - **Conflict-surfacing half — this bullet said it "has no gate". FALSE, corrected 2026-08-18.**
     The gate is **`tools/rac-conformance/certification/gates/check-conflict-surfacing.ts`** —
     *not* under `tools/ga-gate/`, which is why a `ls tools/ga-gate/` sweep misses it
     (`find . -name 'check-conflict-surfacing*' -not -path '*/node_modules/*'` → **1**). It
     **exits 0**, hard-0, no baseline: **0 findings against a NAMED ledger of 0**, driving 126
     real `YjsDocAdapter` merges per disposition with **0 SILENT** losses. It names its own
     unproven axes (the wire is simulated, the store leg is not measured, artefact quality is not
     measured), so *"P8's conflict half holds"* is still not what it establishes — but *"no gate"*
     is wrong.
   *Exit condition:* Zone B reaches 0 **and** Zone C acquires an arm, so the "every exported
   function" clause is measured rather than merely printed.

GA-gate checks live in `tools/ga-gate/` (run via `run-all.ts`); a handful of older, non-gate
scripts live in `scripts/` (11 files — none of them are P-gates; the four `scripts/ci-check-*.ts`
paths cited in older docs never existed, see L-812).

**The `.github/workflows/ci.yml` gate is merge-blocking for the jobs listed as required in that
file's header — but not uniformly.** Two jobs are deliberately `continue-on-error` (`test-pryzm1`,
pending L-544; and the legacy release gate inside the `ga-gate` job). More importantly, the
founder's real workflow is push-straight-to-`main`, so **required status checks are not the gate
here** — the actual gate is the `ci-gate` job in `deploy-fly.yml`, which refuses to deploy a SHA
whose CI run did not succeed (§L-540-CI-GATE). Read `ci.yml`'s header before assuming a job blocks.

## Governance — read the contracts first

`docs/02-decisions/contracts/README.md` (the "C00" contract-suite index) is **the authoritative
enumeration of the suite — always defer to it over any range written here.** It indexes
**C01–C108 + C24.1**; **`C61` and `C103` are the RESERVED, unminted slots** — ~~C76~~ **was MINTED
2026-08-19** (`baa98eba`, Platform & API Surface). The suite governs every implementation decision.

> ⚠ **Corrected 2026-08-24 (lane FACADE53) — the SIXTH recurrence of the count/range shape.** This
> paragraph read **`C01–C100`** and **`C61` is the ONLY RESERVED slot**. Both were false: **C101–C107
> were on disk** (seven contracts outside the stated ordering, among them C104 / C106 / C107 — three
> element-family contracts), and **`C103` is a SECOND unminted slot, and a WORSE one: UNMINTED-AND-CITED**
> (five source files plus C104 §0.2 cite it; L-7060, OPEN). This lane minted **C108** (Facade
> Reconstruction From Image) and moved **the row and the range in the same commit**. ⛔ **Do not
> re-transcribe:** `npx tsx tools/ga-gate/check-contract-index-equivalence.ts` → **RC=0 · 107 files ·
> 90 rows · max id C108 · reserved C61, C103 · arm A 18 = baseline · arms B/C/D clean.**
> **Read the gate, never this line.**

> ⚠ **Corrected 2026-08-18 — and this is the FOURTH recurrence of one defect shape.** This
> paragraph and the conflict-resolution order below both read **`C01–C68 + C24.1`**, leaving
> **thirty-two contracts outside the stated ordering** — among them **C84 (Element Integrity)**,
> binding on *every PR touching an element family*, and the whole **C85–C99 per-element block**
> plus **C100**. An agent reading the stale line literally ranked **C84 below an ADR**. The prior
> correction (2026-08-11, from `C01–C15` to `C01–C68`) recorded exactly the same failure for C67
> and C68, and the README records it again for C81; **the range keeps being written as a literal
> and the literal keeps rotting.**
>
> **Re-measure, never re-transcribe:**
> `ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'` → **100** (re-measured **2026-08-19**, lane
> REG1; it read **99** on 2026-08-18, which is the point of re-running it).
> That is C01–C100 *minus* the ONE unminted slot C61, *plus* C24.1. **The count and the
> range are different facts** — a correct count with a stale range still demotes real contracts,
> which is what happened here. **When this file and `contracts/README.md` disagree, README wins**
> (it says so above).

> ⚠ **Corrected AGAIN 2026-08-19 (lane REG1) — the FIFTH recurrence, one day after the fourth.**
> The paragraph above read *"**C61 and C76 are RESERVED, unminted slots**"* and this box derived
> the count as *"C01–C100 minus the **two** unminted slots"* → **99**. **C76 was MINTED 2026-08-19**
> and `C76-PLATFORM-AND-API-SURFACE.md` is on disk. The count/range shape has now failed
> **C67 → C81 → C84/C85–C99 → C100 → C76**, and the fifth recurrence landed *inside the correction
> notice for the fourth*. That is the strongest available evidence that the rule *"the row and the
> range move together"* is stated in three places and was enforced by nothing.
>
> ⭐ **It is now enforced.** `tools/ga-gate/check-contract-index-equivalence.ts` (lane REG1,
> 2026-08-19) compares `ls contracts/` against `contracts/README.md`'s row set **in both
> directions** — the gate this box previously recorded as *"which does not exist yet"*. It compares
> **SETS, never a number**, precisely because a count can be right while the range is wrong, which
> is what happened here more than once. First reading, RC=0: **100 files · 83 rows · arm A
> FILE-WITHOUT-ROW = 18** (C81, C84, C85–C99, C100 — all real, all ordered by nothing, baselined
> shrink-only) · arms B/C/D hard-0 and clean. **Read the gate, never this paragraph.**
>
> Its sibling `tools/ga-gate/check-contract-cited-paths.ts` (L-960) asserts that every repo path
> cited anywhere in `contracts/**` resolves on disk or is explicitly marked `PLANNED`. First
> reading, RC=0 at a pinned baseline: **1528 distinct citations, 491 UNRESOLVED.** The register
> that proposed it estimated *"119+"*.

Before non-trivial work, read the contract for the subsystem you are touching — e.g. `C03`
(schemas/commands/state), `C04` (rendering/scheduling), `C11` (element creation pipeline), `C15`
(hosted elements: doors/windows in walls), `C16` (command authoring), `C66` (concurrency &
scale — **no capacity tier may be described as supported while C66 §1 marks it CLAIMED**), `C67`
+ `C68` (**mandatory** if your PR registers a bus command, adds an element kind, or adds a
user-visible attribute), and **`C84` + its `C85`–`C99` per-element block** (**mandatory** if your
PR touches an element family at all — C84 is the contract the stale `C01–C68` range above was
demoting below an ADR; `ls docs/02-decisions/contracts/C8*.md docs/02-decisions/contracts/C9*.md`
enumerates the block).

Conflict resolution order (strongest first): `docs/01-strategy/STR-03-engineering-vision.md` →
`docs/01-strategy/STR-04-architecture.md` → **the C01–C100 contract suite** (as enumerated by
`docs/02-decisions/contracts/README.md` — **defer to it, not to this range**) → ADRs
(`docs/02-decisions/adrs/`, **285** files) → SPECs (`docs/03-execution/specs/`, **101** files). **When code disagrees with a contract, the code is
wrong** — fix the code, or raise a superseding ADR; never write a new `*-AUDIT.md` derivative doc.
Edit the canonical `C0N-*.md` in place. Current migration status:
`docs/03-execution/plans/master-execution-tracker.md`.

> Counts re-measured **2026-08-22** (lane VIEWDOC20) · `ls docs/02-decisions/adrs/ADR-*.md | wc -l`
> → **285** · `find docs -name 'SPEC-*.md' | wc -l` → **101** ·
> `ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'` → **102**.
> *(They read 268 / 96 / 100 on 2026-08-18, and 251 / 92 on 2026-08-11. **Run the commands** — these
> have now each been wrong at least three times, which is the point of the instruction, not a
> footnote to it.)* **The SPEC path was also wrong** in an earlier revision: this file said
> `reference/specs/`, which does not exist; specs live at `docs/03-execution/specs/`.
>
> ⭐ **The contract count moved because C101 (Annotation) and C102 (View & Sheet Integrity) were
> minted 2026-08-21.** `check-contract-index-equivalence.ts` compares the file SET against
> `contracts/README.md`'s row SET in both directions and is the authority — **read the gate, never
> this paragraph.** A count can be right while the range is wrong; that failure has its own
> correction box above.
