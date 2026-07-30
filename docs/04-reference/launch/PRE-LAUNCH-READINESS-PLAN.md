# PRE-LAUNCH READINESS PLAN — the launch-critical cut

> **Scope:** the minimum set of things that MUST be true before PRYZM is exposed to paying,
> professional-BIM users. This is the *launch-critical* subset — not the full backlog. The full
> phased roadmap lives in `V1-LAUNCH-IMPLEMENTATION-PLAN.md`; the issue register (source of truth
> for per-item severity/status) is `V1-LAUNCH-READINESS-AUDIT.md`. This document does **not**
> restate those — it selects the launch-blocking items, orders them by the professional-BIM risk
> bar, and states an exit criterion for each.
>
> **Evidence base:** every item below traces to a specific L-item and to
> `reports/PRE-LAUNCH-EVIDENCE-2026-07-17.md` (raw command output, `pnpm audit`, test runs,
> `file:line` traces). No item here is invented; nothing is marked done that the evidence does not
> support. Where the evidence says "UNVERIFIED", the item's job is to make it verifiable — not to
> assume a pass.

---

## Definition of launch-ready

PRYZM is launch-ready when a professional user can trust that **the file they save is the file
they get back** and that **concurrent editing never silently loses their work** — and when we can
*prove* both. Concretely: the CI gate is green with a real coverage number; there is no code path
that drops or mangles a saved element without either refusing the write or raising a
user-resolvable conflict; the snapshot schema is validated on write and its migrations are tested;
collaboration either runs true CRDT merge or ships with documented last-write-wins limits plus the
two-browser tests that prove those limits; a production corruption or crash actually fires an alert
we can see; a backup restore has been drilled at least once end-to-end; runtime-reachable critical
CVEs are cleared and the embed/token surface is scoped; and we publish a supported-scale SLA backed
by real in-browser GPU numbers rather than headless proxies. Anything still "UNVERIFIED" at launch
is either fixed or explicitly downscoped and disclosed — never assumed.

Because PRYZM files become **construction and legal documents**, the ordering below puts data
integrity and collaboration correctness ahead of performance and polish: a slow editor loses a
demo, a corrupt save loses a customer and potentially exposes them to liability.

---

## Effort rollup

| Phase | Theme | Eng-weeks |
|---|---|---|
| 0 | Green baseline | 2.5 |
| 1 | Data integrity & durability | 6.0 |
| 2 | Collaboration correctness | 4.0 (full CRDT) / 1.5 (downscope) |
| 3 | Observability | 2.0 |
| 4 | Backup / restore + DR | 2.0 |
| 5 | Security hardening | 4.0 |
| 6 | Perf at real scale + interop + device matrix | 5.5 |
| **Total** | | **≈ 26 eng-weeks** (≈ 21.5 on the collab-downscope path) |

Estimates are single-engineer-weeks of focused work. Phases 0→2 are the hard serial spine (each
unblocks the next); Phases 3–6 can be run partly in parallel once Phase 1 lands, so *calendar*
time is shorter than the serial sum if more than one engineer is available. The collab-downscope
alternative (Phase 2) trades ~2.5 eng-weeks for a documented LWW limitation instead of a real
network CRDT backend — a legitimate launch decision, not a bug fix.

---

## Phase 0 — Green baseline

**Goal:** get the tree to a state where "green" means something, so every later phase has a
trustworthy signal. Right now the root test gate is RED and passes silently, and the unit estate
never runs in CI.

**Closes:** L-388 (root `npx vitest run` RED — 3 door/dimension specs fail at *module load* via
`DoorStore.ts:227` barrel-at-load, registering 0 tests, which "212 passed" masks), L-390 (dead
governance breadcrumbs — CLAUDE.md/contracts cite the moved `docs/03_PRYZM3/01-VISION.md` /
`02-ARCHITECTURE.md`), L-247 (the 1,495-test `apps/editor` estate + 121 other workspaces never run
in CI; 34 are RED on `main` and nothing reports it). Plus **secret hygiene**: rotate/revoke the
session PAT used this cycle — the *repository itself is clean* (evidence §A5: no hardcoded secrets,
`.env` gitignored and never committed), so this is credential rotation, not a code fix.

**Exit — done when:** `npx vitest run` exits 0 (the 3 collect-failures fixed by moving the
`projectScopeRegistry.register` call off module top-level, per the known SCC barrel-at-load
hazard); the unit estate runs as a CI job (`pnpm -r run test:ci` wired into
`.github/workflows/ci.yml`) and is green with the 34 pre-existing reds triaged (fixed or explicitly
quarantined with a tracking issue); a real coverage number is produced and recorded; the governance
breadcrumbs resolve to files that exist; the session PAT is revoked.

**Effort:** 2.5 eng-weeks. **Dependency:** none — this is the unblocker.

---

## Phase 1 — Data integrity & durability  *(THE #1 gap)*

**Goal:** guarantee that a saved project round-trips without silent loss. Today the save path
trusts almost nothing: the server validates **only the `furniture` array** (a `.passthrough()`
Zod schema — walls, slabs, doors, windows, stairs, roofs, columns, beams, curtain-walls, rooms,
levels, grids, and the semantic/temporal graphs are **unvalidated**), there is **no corruption
detection anywhere** in source, and the v0→v5 migration path has **zero automated coverage**.

**Closes:**
- **L-334** — save/reload data integrity: no whole-snapshot validation, no quarantine of dropped
  records, no checksum. **Design constraint:** a naive checksum was already shipped once and
  **reverted (L-360) because it hard-refused and bricked a real 1009-element project** on a stored-
  vs-computed hash mismatch. The redesign must be **safe by construction**: (a) **element-count
  reconciliation** on write/read (compare serialized vs in-memory counts per element type, surface
  a discrepancy — never silently drop), and (b) an **opt-in / advisory checksum** that flags a
  mismatch for review rather than refusing the load. Never re-introduce a hard-refuse gate.
- **Save-path validation gap** — extend server-side validation (`server.js:3172-3246`) from
  furniture-only to a real snapshot schema covering the load-bearing element arrays, so a corrupt
  snapshot is rejected or quarantined rather than persisted as `201`.
- **L-394** — snapshot migration v0→v5 is untested and forward-version snapshots load anyway with
  silent field loss (`MigrationEngine.ts:241-248`). Add migration round-trip tests; make
  forward-version loads explicit (refuse or warn-and-preserve, not silent).
- **L-85** (P0) — kitchen/wardrobe/lighting elements vanish after close→reopen (element-loss);
  verify the persist/restore path under the new validation and lock it with a test.
- **L-53** (P0) — concurrent wall `baseLine` edit is silent last-write-wins: `baseLine` is just
  another `Y.Map` key, and `emitConflict` fires only for the two elevation/CW-level mismatch
  detectors, so a geometry-defining edit is dropped with no user-resolvable conflict (P8
  violation). Add `baseLine`/geometry-field conflict detection to the resolver.

**Exit — done when:** there is no code path that persists a corrupt or count-mismatched snapshot
as success; the server validates the full snapshot schema (not just furniture) on write; migration
v0→v5 has passing round-trip tests and forward-version handling is explicit; L-85 element types
survive a close→reopen test; and a concurrent `baseLine` edit raises a conflict instead of a silent
overwrite. The count-reconciliation/checksum work ships **without** any hard-refuse regression.

**Effort:** 6.0 eng-weeks. **Dependency:** Phase 0 (need a trustworthy green gate to land this
safely and prove the L-360 class of regression cannot recur).

---

## Phase 2 — Collaboration correctness

**Goal:** make multi-user editing either correct or honestly bounded. The advertised feature (Yjs
CRDT + 3-way `CRDTConflictResolver`) **has no network backend in production**: `apps/sync-server`
is undeployed, no `WebsocketProvider`/`WebrtcProvider` is ever constructed (`_provider` stays
`null`), Fly runs a single `app` process. So the resolver and conflict banner **never fire in
prod**. What actually runs is socket.io command-rebroadcast applied in arrival order → **silent
last-write-wins for move / property-edit / delete** (only create is idempotent).

**Closes:** L-391 (P0 — CRDT has no network backend; prod collab is socket.io LWW).

**Exit — done when EITHER:**
- **(Full path)** `apps/sync-server` is deployed and the client constructs a real
  `WebsocketProvider` so the Yjs doc receives remote ops, the `CRDTConflictResolver` and conflict
  banner fire in prod, and a two-browser test proves concurrent move/edit/delete merges (or
  surfaces a resolvable conflict) rather than silently dropping — **OR**
- **(Downscope path)** collaboration is honestly re-scoped to LWW for launch, the LWW limits are
  **documented in-product and in the docs** (concurrent move/edit/delete is last-writer-wins,
  create is safe), and the two-browser conflict tests are added to prove the *documented* behaviour
  (dropped-ws-mid-edit, two-users-same-element, 60s reconnect). No launch on the *current* state,
  where the behaviour is undocumented and untested.

**Effort:** 4.0 eng-weeks (full CRDT deploy) or 1.5 eng-weeks (downscope + document + tests).
**Dependency:** Phase 1 (conflict semantics and the L-53 detector inform what the resolver must
protect). Founder decision required on which path.

---

## Phase 3 — Observability

**Goal:** make a production corruption or crash *visible* the moment it happens, instead of waiting
for a user to report it — non-negotiable for a data-integrity product. Today P8 OTel spans are
created everywhere (CI even enforces ≥1 span per exported fn) but **no tracer provider is
registered**, so `@opentelemetry/api` returns a **no-op tracer** and every span goes nowhere; the
crash reporter defaults to `NoopCrashReporter` (Sentry deferred); server logging is bare
`console.*` to Fly stdout with no aggregation; and there is **no save-integrity alert**.

**Closes:** L-392 (P1 — OTel no-op, crash reporter Noop, no save-integrity monitoring).

**Exit — done when:** a tracer provider + exporter is registered so spans actually export to the
OTLP endpoint the health JSON already advertises; a real crash reporter (Sentry/GlitchTip) is
bound in place of the Noop; and the Phase-1 corruption/count-mismatch signal is wired to an alert
that a human receives. "Done" = a deliberately-triggered corruption and a deliberate crash both
produce a visible trace/report in the dashboard.

**Effort:** 2.0 eng-weeks. **Dependency:** Phase 1 (the corruption signal to alert on must exist
first).

---

## Phase 4 — Backup / restore + DR

**Goal:** be able to actually get a customer's project back. Runbooks exist on paper
(`DR-DRILL`, `RUNBOOK-ACCIDENTAL-DELETE`, ransomware, regional-outage) but **no restore has ever
been drilled** (`DR-DRILL-RUNBOOK.md:340` explicitly disclaims a real drill), **PITR is not wired**
(`:342`), no `pg_dump` cron/retention job was found, and **free-plan projects live only in one
browser's IndexedDB** (`VERSION_LIMITS.free = 0` → zero server versions).

**Closes:** L-396 (P1 — restore never drilled; PITR unwired; free-plan single-device durability).
Also folds in L-376a (P2 — ~30 local-only projects pile up in IndexedDB with no eviction cap), a
related durability-hygiene gap.

**Exit — done when:** a real end-to-end restore drill has been executed against a production-like
snapshot and documented (what was restored, how long it took, what broke); PITR is either wired or
its absence is an explicit, disclosed limitation; the free-plan single-device durability reality is
either changed (server-side versions for free) or clearly disclosed to the user before they rely on
it; and the IndexedDB pile-up has an eviction/cap policy.

**Effort:** 2.0 eng-weeks. **Dependency:** Phase 1 (a validated snapshot is what you restore; no
point drilling restore of an unvalidated blob).

---

## Phase 5 — Security hardening

**Goal:** close the runtime-reachable security holes before the surface is public.

**Closes:**
- **L-387** (P1) — 93 dependency advisories (7 critical / 28 high). Most criticals are dev/test-only
  (happy-dom, vitest UI, vite dev-server, astro build) and out of the runtime bundle. **The
  runtime-reachable ones must clear:** jsPDF (critical LFI / path-traversal + HTML-injection +
  PDF-injection/DoS on the C29 export path), Multer (upload DoS), ws (collab transport DoS),
  form-data (CRLF), protobufjs (DoS).
- **L-395** (P1) — `/embed?projectId=X&token=Y` serves a public shell (X-Frame-Options removed,
  `frame-ancestors *`) echoing projectId+token into the DOM with **no server-side token
  validation**; the token→access-scope mapping (view vs edit, single-project vs account-wide) is
  unlocated. Add server-side token validation and pin the token scope.
- **`/api/event-log` unauthenticated write** (`server.js:3970`, P2) — mutating route without
  `authMiddleware`; confirm/fix whether it can write another tenant's log.
- **XSS pass** (P2) — 781 `.innerHTML=` / `dangerouslySetInnerHTML` / `eval(` / `new Function(`
  occurrences; mostly static/escaped, but UGC marketplace pages (family names/descriptions) are the
  highest-risk interpolation sinks and need a focused review.

**Exit — done when:** the runtime-reachable critical/high CVEs are upgraded/cleared (dev-only
advisories may be accepted with a documented rationale); the embed endpoint validates its token and
enforces a defined scope; `/api/event-log` is authenticated or proven safe; and the XSS review of
the interpolating sinks (marketplace UGC first) is completed with fixes applied.

**Effort:** 4.0 eng-weeks. **Dependency:** Phase 0 (green gate to catch upgrade regressions). Can
run in parallel with Phases 3–4.

---

## Phase 6 — Perf at real scale + interop + device matrix

**Goal:** know — and publish — what PRYZM can actually handle, on real hardware, with real files.
Today the C10 perf budgets pass only against **headless proxies** (e.g. frame-budget p95
`0.0075 ms` from a FakeRaf scheduler drain with no GPU), the real in-browser 60 FPS + tool-latency-
with-renderer numbers are **UNVERIFIED**, and the founder's live logs contradict the proxies on
heavy scenes.

**Closes:**
- **L-389** (P1) — capture real in-browser GPU frame-budget + tool-latency numbers (the
  `apps/editor-bench` "Wave 13" harness that the proxy notes keep referencing but which was never
  run/captured), and state a supported-scale SLA (there is currently no "supported max element
  count" — `isHeavyModel` is a heuristic, not an SLA).
- **L-366** (P0) — the auto-WebGL heavy-scene fallback did NOT fire for a real ~1,300-element /
  6-level building (6 < 15 levels and 1,300 < 4,000 elements, so `isHeavyModel` returns false) →
  WebGPU device loss with no fallback. Close the predicate hole.
- **L-393** (P1) — no IFC/DXF/Rhino round-trip (import→export→re-import compare) test; geometry
  fidelity for the load-bearing BIM formats is assumed. Add an IFC round-trip fidelity test and an
  adversarial/malformed-file parser test.
- **Browser/device matrix** (P2) — Playwright covers desktop chromium/firefox/webkit only; real GPU
  verification is effectively one Windows box; tablet/mobile is untested and likely unsupported.
  Define and test the supported matrix (even if the answer is "desktop WebGL only, disclosed").

**Exit — done when:** real-GPU frame-budget/tool-latency numbers exist and are recorded; a
supported-scale SLA is published; the L-366 device-loss predicate is fixed so real mid-size
buildings degrade gracefully instead of losing the device; an IFC round-trip fidelity test passes;
and the supported browser/device matrix is stated and tested (or its limits disclosed).

**Effort:** 5.5 eng-weeks. **Dependency:** Phase 0 (green gate); benefits from Phase 3 observability
to capture real-world perf. Can overlap Phase 5.

---

## Out of scope for this cut (tracked elsewhere)

- **L-397** (pricing contradiction: marketing tiers vs billing-code `monthlyUSD`) — a founder
  business decision, not a launch-blocking engineering defect. Resolve before public pricing goes
  live, but it does not gate the technical launch.
- **L-373a** (heuristic heatmaps rendered in standards-named colour scales) — a trust/GIS-honesty
  item; important but not in the data-integrity/collab critical spine. Tracked in the main audit.
- Client bundle-size / first-paint budget (P2) — a real gap (no gate-measured gzip shell size) but
  a polish/perf-hygiene item, not launch-blocking on its own; fold into Phase 6 perf work if time
  allows.
