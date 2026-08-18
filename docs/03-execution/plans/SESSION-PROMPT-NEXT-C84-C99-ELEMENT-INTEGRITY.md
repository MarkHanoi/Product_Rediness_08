# NEXT SESSION — from-scratch prompt · C84–C99 Element Integrity + BIM30 Half 1 / Half 2

> Paste everything below the line into a fresh session. It assumes no memory of this one.

---

You are picking up PRYZM's **element-integrity programme**. Read `CLAUDE.md` first, then
`docs/02-decisions/contracts/README.md` (the C00 index). Governance order, strongest first:
`STR-03` → `STR-04` → the **C01–C100** contract suite → ADRs → SPECs. **When code disagrees with a
contract, the code is wrong.** Never write a new `*-AUDIT.md`; edit the canonical `C0N-*.md` in place.

## What exists already — do not re-create it

- **`C84-ELEMENT-INTEGRITY.md`** — the master contract. Invariants **EI-1…EI-13**; §3.5 classification
  test; §4 AS-IS matrix; §4A six mutation lineages; §4B verb axes; §4C cascades; §4D two geometry
  stacks; §4E element-type tagging; §5 gates; §6 the twelve mandatory per-element sections; §8
  anti-patterns; **§9 the NOT-MEASURED register**.
- **Per-element contracts C85–C99** — wall, wall.opening, curtain-wall, ceiling, floor, roof, column,
  slab, beam, room/space, handrail, lighting, furniture, stair, plumbing.
- **`C100-MASTER-MATERIAL-DATABASE.md`** — the material catalogue authority. **EI-8 forbids a sixth
  material vocabulary**; anything new must reference C100, not mint a rival.
- **`CONTRACT-AMENDMENT-REGISTER.md`** — every measured contract defect, ranked by blast radius.
- BIM30: `BIM30-IMPLEMENTATION-ROADMAP.md`, `BIM30-MASTER-COMPLETION-TRACKER.md`,
  `SESSION-2026-08-17-HALF1-HALF2-FLEET.md`.

## Your job, in priority order

### 1. Close C84 §9 — the NOT-MEASURED register (highest value)

§9 is the honest list of what nobody has measured. **A blank is not a clearance** (EI-1b: an unmeasured
row and a clean row look identical). Work top-down:

- **The eleven unread `.created` bridge bodies** — `initTools.ts:1059, 1260, 1408, 1511, 1591, 1636,
  1708, 1773, 1824, 1967, 2031`. Only the handrail bridge has ever been read in full. Measure each for
  EI-2's four mechanisms, above all **(b) the constant-ternary dead branch**, which is invisible to
  both `tsc` and review. Expect real defects here.
- **Six of the ten wall Y-datum sites** — `WallInstanceBridge.ts:105,111,147,151`;
  `WallJunctionInfillManager.ts:122-123`; `LayeredWallOpeningBuilder.ts:140-141,205`;
  `WallFragmentBuilder.ts:1237/2112/2138/2186/2233/2371-2390`. The measured half already shows a
  delta of `slabBaseOffset + 2 × wall.baseOffset` between wall bodies and hosted leaves. **LATENT**
  today because nothing authors either offset non-zero — and it is the recorded reason the CSG arm is
  switched off at `WallFragmentBuilder.ts:2326-2333`.
- **EI-7e** — do user-authored room name / number / finish survive `RoomTopologyObserver.resume()`'s
  post-undo recompute?
- **Plan-view store authority, per family** — unmeasured for every family.
- **ADR-0331 §D3** — routing the forward patch through `elementUndoStoreAdapter` has never been
  executed; it is inferred from a file header, not observed.

⛔ **`ADR-0331 §D5 — "what is Stack B for?"` is a FOUNDER question. Do not resolve it in a lane.**
Until it is decided, **nothing** in `packages/geometry-kernel/src/producers/` or
`plugins/*/src/committer/` may be deleted (C84 §3.5.2).

### 2. Finish the amendment register

Outstanding: **C02, C05–C11, C15, C16, C21–C50, C71, C72, C77, C79, C83**, the contracts README index,
and the stale `C01–C15` range still written in `CLAUDE.md` (the suite is C01–C100).

### 3. View-layer element contracts (C101+)

C84 was extended to cover view-layer families but they have no per-element contracts yet: **view,
sheet, schedule, dimension, section, annotation, grid, selection, hierarchy, catalog, level,
curtainPanel, visibility-intent, pool, structural.** Use C84 §6's twelve mandatory sections.

### 4. Open founder decision — surface it, do not decide it

`glazingMaterialId` is now the wall's default **panel** material, which is a misnomer for stone or
ceramic panels. Renaming touches persistence and both serializers.

## How to work — these are binding, and each was learned the hard way

- **`§EXIT-CODE-THROUGH-A-PIPE`** — never read a verdict through a pipe. `CMD > out.txt 2>&1;
  echo "RC=$?" >> out.txt`, then read the file. `| tail` reports *tail's* exit code.
- **Committed ≠ reachable ≠ measured.** Prove a fix at the layer that DECIDES, never at a pure
  function's return. Last session: a fix sat on `main`, under a green `tsc` and a passing suite, and
  was still broken — because the suite's four arms all tested a different axis.
- **A worktree commit is not a fix.** Before closing any lane, check for commits reachable from no
  branch you merged. Last session a 207-line test was stranded in a worktree; recovered and run
  against `main` it failed 4 of 6 arms and exposed three live defects.
- **Watch every test go RED before it goes green.** A `not.toContain` over a mis-spelled field can
  never fail — pair every negative assertion with a positive one on the *same* expression.
- **Catching a failure ≠ declining to claim the success.** Two separate obligations. A `.catch` that
  sits beside an unconditional success `console.log` still lies to the user.
- **Type-checking cannot see runtime import edges.** `import type` is erased; a value import is not.
  A barrel that re-exports a DOM module will boot-crash the server bundle while `tsc` stays green —
  only `scripts/build/smoke-prod-boot.mjs` catches it.
- ⛔ **NEVER `git stash`** — the stash stack is GLOBAL across worktrees and will corrupt other agents.
- ⛔ **NEVER `git add -A`** — commit explicitly scoped paths only.
- ⛔ **Never raise a ratchet threshold or add to `gate-debt.json`.** `§RATCHET-EXCEEDED-IS-NEVER-DEBT
  (R7)` — exceeding a ratchet exits 3 and is never absorbable. Fix the code.
- **Deploy only via `docs/02-decisions/DEPLOY-CONTRACT-MANUAL-FLY.md`.** `DOCKER_CONFIG` must be a
  **Windows-shaped** path (e.g. `C:/pryzm-deploy/empty-docker-config`) holding `config.json` = `{}`;
  the MSYS form fails silently. Do not run the bundle proof until the deploy script has EXITED
  (L-941). On a GIT_SHA mismatch with `DEPLOY_RC=0`, re-run once after 60 s — a single sample is not
  evidence. With `DEPLOY_RC=1` the script itself failed: read the log, do not retry blind.
- **Never print secret values** — report lengths only.
- Agents commit scoped CODE; the orchestrator owns docs and does the cherry-picks.

## State at handoff

`main` carries the completed L-965 walls-by-slab fix (branded ids, curve reaching the plugin store,
honest ACCEPTED/REJECTED sentences across all three commands) and L-967 (metals no longer render
black in either backend). `tsc` RC=0 / 0 errors. `command-registry` is 629 passing with **three
pre-existing failures** in `L926MoveReweldPreflightStem` and `L936InteriorLPairMove` — unrelated to
that work, and worth picking up.

**L-966 is open and unstarted**: *"Render pipeline retries exhausted — phase=error"*, the viewport
dies and stays dead. It needs a bounded retry counter before `recoverFromRenderFailure()` is wired to
anything automatic.
