# PHASE 1 — AUDIT-DRIVEN IMPLEMENTATION PLAN (2026-04-28)

**Companion to:** `PHASE-1-AUDIT-2026-04-28.md`.

**Goal:** turn the audit's gap list into a concrete, ticketed plan that
takes Pryzm from "Phase 1 substantively built, cap-stone artefacts
missing" to **"M12 alpha gate green, defensible to external users"**.

**Form factor:** three sprints (S25 → S27), each ~1–2 weeks, each
ending at a hard gate. No ticket is open-ended; each has files, steps,
and an executable acceptance check.

---

## 0. Sequencing summary

| Sprint | Theme | Duration | Exit gate |
| ------ | ----- | -------- | --------- |
| **S25** | Pre-alpha hygiene (the "no-claim-without-this" set) | 5 working days | All `.replit` workflows green; one resolved `three`; PRYZM-2 surface boots in CI. |
| **S26** | M12 alpha-gate cap-stone | 10 working days | `canonical.json` per family; perf gates failing CI on regression; alpha-gate recording published. |
| **S27** | Credibility package | 10 working days | Self-host `docker compose`; IFC4 round-trip badge; `(window as any)` ratchet down 50 % from baseline; observability spans on every L0–L3 export. |

Sprint cuts are deliberate: S25 unblocks the team, S26 produces the
artefact you can ship to design partners, S27 produces the artefacts
you can put on the website.

---

## 1. Sprint S25 — Pre-alpha hygiene (5 days)

### S25-T01  Fix `bake-worker-test-geometry` workflow path
- **Blocked by:** none.
- **Owner:** repo / DX.
- **Files:** `.replit` (lines around the `bake-worker-test-geometry`
  workflow).
- **Steps:**
  1. Replace `cd packages/bake-worker` with `cd apps/bake-worker`.
  2. Remove the `2>/dev/null || echo "bake-worker tests not present
     (deferred)"` mask. Failures must surface.
  3. Restart the workflow.
- **Acceptance:** workflow reaches a real `vitest` run; status is
  either green or a real test failure (not "deferred").
- **Effort:** 30 min.

### S25-T02  Restart stale validation workflows
- **Blocked by:** none.
- **Owner:** DX.
- **Workflows:** `pryzm-persistence`, `pryzm-vi-parity`,
  `audit-log-middleware`.
- **Steps:**
  1. Restart each via the workflow tool.
  2. If any still fails with "No such file or directory", file as a
     real ticket against the responsible package and add to S26.
  3. If any fails on real test output, triage into S26 with a fix
     ticket.
- **Acceptance:** all four "Project" workflow children either green or
  carrying a real, ticketed failure (no path-not-found errors).
- **Effort:** 30 min + triage.

### S25-T03  Pin `three` exactly + dedupe in lockfile
- **Blocked by:** none.
- **Owner:** renderer / DX.
- **Files:** `package.json` (root), `pnpm-lock.yaml`,
  `apps/editor/package.json`, every `packages/*/package.json` and
  `plugins/*/package.json` that lists `three` or `@types/three`.
- **Steps:**
  1. Decide pinned version. Recommendation: the highest `0.183.x`
     already in tree (`0.183.2`) — minimises blast radius vs ADR-025's
     stated `r169` (which is now ~12 months old). Either:
     - Update ADR-025 to ratify `0.183.2`, or
     - Downgrade to exactly `0.169.0` (heavier; will surface
       compatibility breaks in `@thatopen/*`).
  2. Replace every `^0.183.x` / `^0.169.x` with the bare version
     string (no `^`, no `~`).
  3. Add to root `package.json`:
     ```json
     "pnpm": {
       "overrides": {
         "three": "0.183.2",
         "@types/three": "0.183.x"
       }
     }
     ```
  4. `pnpm install` → confirm `pnpm why three | grep -c "^three "`
     returns `1`.
  5. Add CI check `scripts/check-three-singleton.mjs` that fails if
     `pnpm list -r three --json` shows more than one resolved version.
  6. Wire the script into a new `.replit` workflow `three-singleton`
     and into the root `npm test` chain.
- **Acceptance:**
  - `pnpm why three` returns one row.
  - The new `three-singleton` workflow is green.
  - The "Project" parallel workflow includes it.
- **Effort:** half a day. Larger if `@thatopen/*` resists the chosen
  pin — in that case, raise an ADR amendment same day.

### S25-T04  Boot the PRYZM-2 surface in the live workflow
- **Blocked by:** S25-T03 (deduped renderer).
- **Owner:** editor / DX.
- **Files:** `.replit`, `apps/editor/vite.pryzm2.config.ts`,
  `server.js` (route).
- **Steps:**
  1. Add a `npm run build:pryzm2` script at the root that runs
     `pnpm --filter @pryzm/editor build:pryzm2`.
  2. Have `server.js` serve the PRYZM-2 build under `/pryzm2/*` (and
     keep PRYZM-1 at `/`).
  3. Add a smoke test `apps/editor/__tests__/bootstrap.smoke.test.ts`
     that spins up `bootstrap.everything.ts` against the wall+slab
     fixture in `apps/headless/__tests__` and asserts a non-zero
     committed mesh count.
  4. Add a `.replit` workflow `pryzm2-smoke` that runs that test.
- **Acceptance:**
  - Visiting `/pryzm2/?pryzm2=1` in the running app renders the M3
    cube demo (visual confirmation via `screenshot` tool).
  - `pryzm2-smoke` workflow green.
- **Effort:** 1 day.

### S25 exit gate
- All 14 workflows in `.replit` are either green or carrying real
  ticketed failures.
- `three` resolves to one version everywhere.
- The PRYZM-2 surface boots in the deployed dev workflow.

---

## 2. Sprint S26 — M12 alpha-gate cap-stone (10 days)

### S26-T05  `canonical.json` per family (SPEC-21 §9-step gate)
- **Blocked by:** S25-T03.
- **Owner:** each plugin owner; coordinator: schemas team.
- **Scope:** 12 plugins — `wall`, `slab`, `door`, `window`, `roof`,
  `curtain-wall`, `grid`, `column`, `beam`, `stair`, `handrail`,
  `ceiling`.
- **Files (per plugin):**
  - `plugins/<x>/__fixtures__/canonical.json` — the deterministic
    DTO + producer-output bytes for the canonical instance.
  - `plugins/<x>/__tests__/canonical.test.ts` — re-runs the producer
    on the canonical DTO and asserts byte-equality with the fixture.
- **Steps (per plugin, can be parallelised across owners):**
  1. Pick a canonical instance (the one used in `apps/headless`
     fixtures where possible — keeps cross-package parity tight).
  2. Run the kernel producer on it via a small node script
     (`scripts/freeze-canonical.mjs <plugin>`); write the output to
     the fixture file as base64-encoded msgpack + a SHA-256 line.
  3. Add the test that re-runs and asserts.
  4. Add a workflow `canonical-fixtures` that runs all 12 tests.
- **Acceptance:**
  - All 12 fixtures present.
  - `canonical-fixtures` workflow green.
  - SHA-256 line in each fixture matches the kernel output (any
    change to a producer requires an explicit fixture update PR).
- **Effort:** 0.5 day per plugin × 12 = 6 days. Parallelisable to
  ~2 days wall-clock with three engineers.
- **Risk:** the first fixture freeze will surface non-determinism in
  one or two producers (Map iteration order, floating-point snap).
  Budget half a day for fixes; document each in
  `packages/geometry-kernel/DETERMINISM.md`.

### S26-T06  Wire perf gates as failing CI checks
- **Blocked by:** S25-T04.
- **Owner:** bench team.
- **Files:** `apps/bench/src/benches/`, `.replit`.
- **Five gates to wire:**

  | Gate | Bench file | Threshold | Failure mode |
  | ---- | ---------- | --------- | ------------ |
  | Initial bundle ≤ 1.8 MiB gzip | `apps/bench/src/benches/bundle-size.ts` | 1.8 MiB | exit 1 if over |
  | Idle 0 fps (P3) | `__tests__/idle-zero-fps.test.ts` in `frame-scheduler` | 0 frames in 2s window | vitest fail |
  | Small-fixture cold load < 800 ms | `apps/bench/src/benches/load-small.ts` | 800 ms p95 | exit 1 |
  | Orbit 60 fps with full Post-FX | `apps/bench/src/benches/orbit-fps.ts` | ≥ 55 fps p50 | exit 1 |
  | Sync round-trip < 50 ms | `apps/bench/src/benches/sync-roundtrip.ts` | 50 ms p95 | exit 1 |

- **Steps:**
  1. Implement / finish each bench (some skeletons exist).
  2. Add 5 `.replit` workflows, one per gate, all `isValidation = true`.
  3. Add to the `Project` parallel workflow.
- **Acceptance:** all 5 workflows green on a clean main; deliberately
  break one (e.g. add a `for(let i=0;i<1e7;i++)` to the renderer)
  and confirm CI goes red.
- **Effort:** 1 day per gate × 5 = 5 days. Parallelisable.

### S26-T07  Reconcile msgpack vs msgpackr
- **Blocked by:** none.
- **Owner:** persistence / sync.
- **Files:** ADR-004 (amendment), `packages/persistence-client/src/codecs/`,
  `packages/wire/` (if it lands), `packages/sync-client/`.
- **Decision sub-ticket S26-T07a (1 day):**
  - Bench `@msgpack/msgpack` vs `msgpackr` on the canonical event
    stream from S26-T05. If `msgpackr` with pre-registered structures
    is ≥ 30% smaller on median event size, migrate. Otherwise amend
    ADR-004 to ratify `@msgpack/msgpack` and document why.
- **Migration sub-ticket S26-T07b (3 days, only if migration wins):**
  1. Add `msgpackr` dep; create `MsgpackrCodec.ts`.
  2. Pre-register every command/patch shape in
     `packages/protocol/src/wire-structs.ts`.
  3. Behind a feature flag `WIRE_FORMAT=msgpackr`, run both codecs in
     CI for two weeks; assert byte-stable round-trip on a corpus of
     10 k events.
  4. Flip the default; deprecate `MsgpackCodec` after one release.
- **Acceptance:** ADR-004 is current; codec choice is bench-justified.
- **Effort:** 1 day decision + 0–3 days migration.

### S26-T08  Publish the M12 alpha-gate recording
- **Blocked by:** S26-T05, S26-T06, S25-T04.
- **Owner:** alpha tiger team.
- **Files:** `apps/bench/recordings/M12-alpha-gate.json`,
  `docs/00_NEW_ARCHITECTURE/phases/audits/M12-ALPHA-GATE-RECORDING.md`.
- **Steps:**
  1. Run the headless fixture (`apps/headless` wall+slab project) on
     a clean checkout, capture timings for: command-bus latency,
     bake-worker time, persistence flush, cold-load.
  2. Take a screenshot of `/pryzm2/?pryzm2=1` rendering the same
     fixture.
  3. Commit recording JSON + screenshot.
  4. Write the `M12-ALPHA-GATE-RECORDING.md` companion: numbers,
     git SHA, hardware, env.
  5. Add a CI workflow `m12-alpha-gate` that re-runs the recording
     and fails if any number regresses by > 10 %.
- **Acceptance:**
  - Recording artefact in repo.
  - CI gate green; deliberately regress and confirm it goes red.
- **Effort:** 1 day.

### S26 exit gate (this is M12 ALPHA GATE GREEN)
- 12 `canonical.json` fixtures present and verified.
- 5 perf gates fail CI on regression.
- ADR-004 codec decision ratified.
- `M12-alpha-gate` recording committed and CI-protected.

---

## 3. Sprint S27 — Credibility package (10 days)

### S27-T09  Self-host `docker compose` story
- **Blocked by:** S26 (alpha must work).
- **Owner:** self-host / DevRel.
- **Files:** `pryzm-selfhost/compose.yml`, `pryzm-selfhost/README.md`,
  `pryzm-selfhost/Caddyfile` (or nginx), per-service `Dockerfile`s
  under `apps/{editor,sync-server,bake-worker,headless}/`.
- **Steps:**
  1. Write a `compose.yml` with services: `postgres`, `editor`,
     `sync-server`, `bake-worker`, `caddy` (TLS reverse proxy).
  2. Add per-service Dockerfile (multi-stage, pnpm fetch + workspace
     prune for the smallest image).
  3. Document a 5-minute quick-start: clone, `cp .env.example .env`,
     `docker compose up`, open `https://localhost`.
  4. Add a CI workflow `selfhost-smoke` that runs `docker compose up
     -d`, hits the editor on port 8080, asserts 200, tears down.
- **Acceptance:**
  - One operator can stand up Pryzm in under 10 minutes from a
    fresh VM.
  - `selfhost-smoke` workflow green.
- **Effort:** 3 days.

### S27-T10  IFC4 round-trip badge
- **Blocked by:** none (independent of editor surface).
- **Owner:** plugins/ifc team.
- **Files:** `plugins/ifc-export/__tests__/round-trip.test.ts`,
  `plugins/ifc-import/__tests__/round-trip.test.ts`,
  `tests/ifc4-corpus/` (a small set of buildingSMART sample IFC4
  files), `README.md` (root, badge line).
- **Steps:**
  1. Add 5–8 small public IFC4 sample files to `tests/ifc4-corpus/`
     (Git LFS if > 1 MB each).
  2. Test: import each IFC4 → export to IFC4 → re-import → assert
     entity-count and pset-value parity (within tolerance).
  3. Wire as `.replit` workflow `ifc4-round-trip` and as a
     conventional GitHub-Actions-style status badge in README.
- **Acceptance:**
  - 100 % of corpus passes the round-trip diff.
  - Badge visible on the repo README.
- **Effort:** 2 days.

### S27-T11  Burn down `(window as any)` — Phase 1 of N
- **Blocked by:** none.
- **Owner:** editor / component-editor.
- **Files:** new `packages/service-registry/`, every file currently
  using `(window as any)` (~50+ — see audit grep).
- **Steps:**
  1. Create `packages/service-registry` with a typed `register<T>()` /
     `lookup<T>()` API.
  2. In `apps/editor/src/bootstrap.ts`, instantiate the registry and
     pass it into the plugin host explicitly (no globals).
  3. Migrate the 10 highest-value globals first
     (`apps/component-editor/src/sketch/*` is the biggest cluster).
     Each migration: replace `(window as any).foo = bar` with
     `registry.register("foo", bar)` and the consumer with
     `registry.lookup<typeof bar>("foo")`.
  4. Land a custom ESLint rule
     `tools/eslint-plugin-pryzm/src/no-window-any.js`. Run as `warn`
     with a one-time carve-out list of remaining sites; flip
     individual files to `error` as they are migrated.
  5. Track count weekly; publish to `apps/bench/reports/window-any-burn.md`.
- **Acceptance:**
  - Service registry shipped and used by ≥ 10 sites.
  - `pryzm/no-window-any` rule landed.
  - Total count reduced by ≥ 50 % from current baseline (~50 → ≤ 25).
- **Effort:** 3 days for the first wave; this is a multi-sprint
  ratchet.

### S27-T12  Observability spans (SPEC-10)
- **Blocked by:** none.
- **Owner:** platform.
- **Files:** new `packages/observability/`, every L0–L3 exported
  function.
- **Steps:**
  1. Create `packages/observability` exporting `withSpan(name, fn)`
     that wraps a function in an OTel span using the existing
     `@opentelemetry/api` dep.
  2. Wrap the top-level export of every public function in
     `command-bus`, `persistence-client`, `sync-client`,
     `scene-committer`, `geometry-kernel` producers.
  3. Add ESLint rule `pryzm/exported-function-needs-span` (warn-mode
     for now, error-mode after one release).
  4. Add a default OTLP exporter behind `OTEL_EXPORTER_OTLP_ENDPOINT`
     env (no-op if unset, so self-host operators are unaffected).
- **Acceptance:**
  - Every L0–L3 export has a span (lint passes).
  - When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, traces appear in the
    operator's collector.
- **Effort:** 2 days.

### S27 exit gate
- One-command self-host works.
- IFC4 badge live in README.
- `(window as any)` baseline halved; rule shipping.
- Observability spans on every L0–L3 export.

---

## 4. Out-of-band tickets (file now, schedule into next phase)

These came out of the audit's §6 forward-looking section but do not
belong in Phase 1 acceptance:

| Ticket | Belongs in | One-liner |
| ------ | ---------- | --------- |
| **OOB-A** | Phase 1.5 (between S27 and Phase 2A) | Soft-lock service (ADR-019) so the alpha multi-user demo is safe. ~3 days. |
| **OOB-B** | Phase 2C scoping | `fast-check` property tests for kernel wall miters and slab booleans (ADR-020). ~2 days when scheduled. |
| **OOB-C** | Phase 2D scoping | Translator round-trip identity tests for event-log ↔ Yjs (ADR-002). ~2 days. |
| **OOB-D** | DevRel, anytime | "Bring your own AI" toggle: make `CF_WORKER_URL` an explicit non-default; document OpenAI / Anthropic direct-key path for self-hosters. ~1 day. |
| **OOB-E** | Phase 2C kickoff | Vector-primitives parity bench so SPEC-04/29 PDF backend inherits a baseline. ~2 days. |

---

## 5. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Pinning `three` breaks `@thatopen/*` | Medium | High | Bench the chosen pin in S25-T03 sub-ticket on day 1; if it breaks, raise ADR-025 amendment same day. |
| `canonical.json` freeze surfaces non-determinism | High (first time always does) | Medium | Allocate half-day buffer per plugin; document each non-determinism in `packages/geometry-kernel/DETERMINISM.md`. |
| Perf gates fail on CI runners (slower than dev hardware) | High | Low | Express thresholds in "frames per p50/p95", not absolute ms; calibrate against the CI runner once and freeze. |
| `docker compose` self-host hits Postgres-on-arm64 / x86 mismatch | Medium | Low | Use multi-arch base images; document supported architectures in README. |
| `service_registry` migration stalls because consumers are entrenched | Medium | Medium | Ratchet with ESLint, not big-bang; add a "complete by S30" cap; publish weekly burn-down. |

---

## 6. Capacity assumption and team shape

This plan assumes:

- **3 engineers** working in parallel across the three sprints.
- One **DX/platform** engineer who owns `.replit`, ESLint rules, CI
  workflows, and `pnpm overrides`.
- One **renderer/editor** engineer who owns the PRYZM-2 surface, the
  perf benches, and `three` deduplication.
- One **plugins/persistence** engineer who drives `canonical.json`
  rollout and the codec decision.

If the team is two engineers, S26-T05 (`canonical.json` × 12) becomes
the bottleneck; cut it to 6 plugins for S26 and the remaining 6 land
in S28.

If the team is one engineer, drop S27 entirely and ship S25 + S26 over
4 weeks; that still produces M12 alpha-gate green.

---

## 7. Definition of done for "M12 alpha gate"

A single line you can hold the team to:

> A reviewer who has never seen the codebase can clone `main`, run
> `npm install && npm test && npm run dev`, open the running app at
> `/pryzm2/?pryzm2=1`, see the wall+slab fixture render, then run
> `pnpm bench:m12-alpha-gate` and watch every number land inside its
> threshold — without touching a single config file.

S25 + S26 deliver this. S27 makes it credible to the outside world.

---

*End of plan. — 2026-04-28*
