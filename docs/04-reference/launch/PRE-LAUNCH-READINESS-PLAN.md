# PRE-LAUNCH READINESS PLAN — the launch-critical cut

> **Scope:** the minimum set of things that MUST be true before PRYZM is exposed to paying,
> professional-BIM users. This is the *launch-critical* subset — not the full backlog. The full
> phased roadmap lives in `V1-LAUNCH-IMPLEMENTATION-PLAN.md`; the issue register (source of truth
> for per-item severity/status) is `ISSUE-LOG.md`. This document does **not**
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

Launch-ready also means the **go-live infrastructure** is real, not just the product code: the
**repository is private** (it is public today only as a GitHub-Actions-billing workaround, which
exposes the entire codebase/IP — unacceptable pre-acquisition), a **single canonical domain** is
chosen and live with the other brand references swept out of the code, and a **staging
environment exists** so a release can be proven off-prod before it reaches users (today all
testing is on production). These are Phase 7 and trace to
`PRYZM-PATH-TO-PRODUCTION.md` (the verified infra investigation).

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
| 7 | Infrastructure & go-live | 5.0 |
| **Total** | | **≈ 31 eng-weeks** (≈ 26.5 on the collab-downscope path) |

Estimates are single-engineer-weeks of focused work. Phases 0→2 are the hard serial spine (each
unblocks the next); Phases 3–6 can be run partly in parallel once Phase 1 lands, so *calendar*
time is shorter than the serial sum if more than one engineer is available. The collab-downscope
alternative (Phase 2) trades ~2.5 eng-weeks for a documented LWW limitation instead of a real
network CRDT backend — a legitimate launch decision, not a bug fix. **Phase 7 (infra & go-live)
runs largely in parallel with Phases 3–6** — it is a different team lane (ops/deploy, not the
data-integrity code spine) — with one exception: **item 7.1 (repo privacy) is urgent and
near-term**, not parallel-and-later, because the repo is public today and that exposes the whole
codebase/IP in an acquisition context. The 5.0 eng-weeks for Phase 7 is mostly the
domain-sweep, go-live wiring, and staging build-out; 7.1 itself is a small (~0.5 eng-week) but
time-critical task.

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

## Phase 7 — Infrastructure & go-live

**Goal:** make the path to production real, private, and canonical — so the product can actually
be exposed at a stable domain, deployed repeatably, and tested off-prod, without leaking the
codebase in the process. This phase is the ops/deploy lane and **runs largely in parallel with
Phases 3–6** (different team, different work). The one exception is **7.1, which is urgent and
near-term** given the acquisition context.

**Evidence base:** every item traces to `PRYZM-PATH-TO-PRODUCTION.md` (the 2026-07-30 verified
infra investigation), which tags each claim `[VERIFIED-FROM-CODE]` / `[INFERRED]` /
`⚠️ VERIFY IN DASHBOARD`. Items below inherit those tags; anything that lives only in an external
dashboard (Cloudflare/Fly/DNS/GitHub billing) is a *verify*, not an *assume*.

**Closes:** the pipeline gaps L-650 (no staging), L-652 (domain split-brain), L-653 (Actions
billing fragility driving the public-repo workaround), L-654 (undocumented manual deploy),
L-659 (secrets sprawl / no rotation story) — candidate L-numbers from the infra investigation
(§8), to be appended to the audit register by the orchestrator, not here.

### 7.1 — Repo privacy + private-repo deploy path  *(HIGH / near-term — IP exposure)*

**Goal:** the repository must be **private**. It is **public today** as a deliberate workaround
for GitHub-Actions-billing (Actions minutes are free on public repos — see memory
`github-actions-billing-blocks-deploy` and PATH-TO-PRODUCTION §3.2/L-653). That workaround
exposes the **entire codebase and IP** — unacceptable before an acquisition. The deploy path
must keep working after the repo goes private.

Three options — all documented, one recommended:
- **(A) Private repo + paid Actions minutes.** Flip visibility to private and enable a paid
  Actions plan so the existing CI/deploy/bake workflows keep running. Cheapest change to the
  *mechanism* (nothing else moves), but reintroduces the exact Actions-billing failure mode
  (zero-step ~3 s deaths, L-653) that drove the app deploy off Actions in the first place.
- **(B) `flyctl deploy` direct via a committed deploy script + scoped Fly token.** Removes the
  Actions dependency for the app deploy entirely — matches the already-chosen "Option A" direction
  in PATH-TO-PRODUCTION §9.2 and the DEPLOYMENT-PLATFORM-AUDIT. The app already deploys manually
  via `flyctl deploy` today (§OPTION-A); this just makes it a committed `deploy.ps1` driven by a
  **scoped** Fly deploy token, so going private changes nothing about the app deploy. Overlaps
  with 7.5.
- **(C) Move the static apex to Cloudflare Pages private-repo git integration.** Cloudflare Pages
  supports private-repo git integration (as the sister MIAWS project uses), so the apex auto-deploy
  survives the repo going private. This only covers the **apex**, not the Fly app deploy — so it
  pairs with (B) for the app.

**Recommendation: (B) for the app deploy + (C) for the apex.** (B) removes the Actions-billing
coupling that made "keep the repo public" tempting in the first place, and it is already the
declared direction of travel; (C) keeps the apex auto-deploy working under a private repo without
paying for Actions. (A) is the fastest keystroke but re-buys the billing-fragility problem, so it
is a fallback, not the target. All three end with a private repo — the non-negotiable exit.

**Exit — done when:** the GitHub repo is **private** and both the app (Fly) and the apex
(Cloudflare Pages) still deploy successfully from the private repo, verified by one real deploy of
each after the visibility flip.

**Effort:** 0.5 eng-week (small — a visibility flip + wiring the already-manual deploy to a scoped
token / private-repo Pages integration). **Dependency:** overlaps 7.5 (scoped token + runbook).
**Risk if not done:** the full codebase and IP stay publicly readable — a direct threat to an
acquisition and to competitive position; also every credential-adjacent mistake becomes a public
disclosure.

### 7.2 — Domain canonicalization (`.so` vs `.app` vs `.io` split-brain)

**Goal:** resolve the domain split-brain the investigation surfaced. Per PATH-TO-PRODUCTION §4,
`pryzm.app` is **hard-coded in shipping code** (marketplace footer link, the Revit add-in vendor
URL + `api.pryzm.app` import endpoint, the planned `assets.pryzm.app` R2 CDN domain, the
`pryzm.app/sunset` banner, CSP comments), there is a **stray `pryzm.io`** in `.env.example`
(`app.pryzm.io` for `PUBLIC_BASE_URL`), while **`pryzm.so` is the C51-canonical apex** (the single
normative source, C51 §4). Wiring DNS today would violate C51 for every `.app` reference.

**FOUNDER DECISION required (blocking):** pick **one** canonical top-level domain. C51 says
`pryzm.so`; the app code says `pryzm.app`. Whichever wins, the loser must be swept out of the code
and, if both are owned, kept only as a 301 redirect.

**Exit — done when:** one domain is canonical; the non-canonical brand references are removed from
the code (marketplace footer, Revit add-in, R2 custom-domain plan, sunset banner, CSP comments,
`.env.example`); and C51 §4 is amended to match (or confirmed already correct). No stray domain
refs remain in a grep of the tree.

**Effort:** 1.0 eng-week (the sweep touches several shipping surfaces + a contract amendment; the
decision itself is the founder's, the sweep is the engineering). **Dependency:** the founder
decision gates the sweep; must land **before** 7.3 (DNS wiring) or C51 is violated on day one.
**Risk if not done:** DNS goes live pointing users/tools at a domain the code contradicts — broken
marketplace links, a Revit add-in importing from the wrong host, and a live C51 contract violation.

### 7.3 — `pryzm.so` go-live

**Goal:** actually serve the product at its domain. Today the app is reached at `pryzm.fly.dev`,
not `app.pryzm.so`. Two things block go-live (PATH-TO-PRODUCTION §4.1, §9.5): (1) the Cloudflare
Pages apex must be **repointed off the old Astro docs-site** to `apps/editor/dist-apex` **before**
the Astro pages are deleted — the "LANDMINE" in `cloudflare-pages-apex-setup.md §1` / memory
`c51-apex-app-split-shipped`; and (2) DNS + TLS wiring for the subdomains (`app.` / `api.` front
the Fly app via a Fly cert; `www` 301s to apex).

**Exit — done when:** `pryzm.so` (the chosen canonical apex) serves the static apex from Cloudflare
Pages with the repoint verified green *before* any Astro deletion; and `app.`/`api.` resolve, with
valid TLS, to the running Fly app. (External state is `⚠️ VERIFY IN DASHBOARD` — the exit is a
verified dashboard/curl check, not an assumption.)

**Effort:** 1.0 eng-week. **Dependency:** 7.2 (canonical domain must be chosen first) and 7.1
(private-repo Pages integration should be settled so the apex deploy source is stable).
**Risk if not done:** the product has no stable public address (only a `*.fly.dev` handle), the
apex/marketing surface can't go live, and deleting Astro before the repoint would take the apex
down (the LANDMINE).

### 7.4 — Staging environment

**Goal:** stop testing on production. There is **no staging today** — only `fly.toml` exists; the
header itself references a sibling `fly.staging.toml` that does not exist, so **all testing is on
`pryzm.fly.dev`** (PATH-TO-PRODUCTION §8 / L-650, §9.1). Add a `pryzm-staging` Fly app (fra) with
its **own** database (a separate Supabase project or a staging schema/branch) and its own secrets,
deploy `main` there first, and **promote to prod on green**.

**Exit — done when:** a staging URL exists (e.g. `staging.pryzm.so` or the staging Fly handle)
running the current `main` against an isolated DB, and a **documented promote-on-green flow** takes
a verified staging release to production.

**Effort:** 1.5 eng-weeks (new Fly app + isolated DB + secrets duplication + the promote flow;
the highest-value single addition per the investigation §9.1). **Dependency:** benefits from 7.5
(the promote flow is part of the deploy runbook) and 7.1 (staging deploy uses the same scoped
token). **Risk if not done:** every release is validated only by shipping it to real users; a bad
deploy is discovered in production, on customer data — the opposite of a data-integrity posture.

### 7.5 — Deploy documentation + secret hygiene

**Goal:** make the deploy path **documented, one-command, and scoped-token-based** instead of an
undocumented manual command with a broad credential. Today the live app deploy is a **manual
`flyctl deploy` whose exact flags are not in the repo** (`deploy.ps1` is a sketch only — L-654),
and secrets sprawl across Fly + GitHub + Cloudflare with **no rotation story** (L-659,
PATH-TO-PRODUCTION §7). Commit the canonical deploy runbook; ensure the deploy uses a **scoped Fly
deploy token** via secrets management (not a broad PAT); and document the **revoke/rotate** flow.

**Exit — done when:** a committed runbook + `deploy.ps1` gives a **one-command documented deploy**;
the deploy authenticates with a **scoped** token (no broad PAT in the deploy path); and a
documented revoke/rotate procedure exists for the deploy token and the other shared secrets.

**Effort:** 1.0 eng-week. **Dependency:** pairs with 7.1(B) (the committed deploy script is the
same artifact) and feeds 7.4 (the promote flow lives in this runbook). **Risk if not done:**
bus-factor and drift on the one command that ships the product; a broad token in the deploy path
is an over-scoped credential that, if leaked, grants more than deploy.

**Phase 7 effort:** 5.0 eng-weeks total (7.1 = 0.5 · 7.2 = 1.0 · 7.3 = 1.0 · 7.4 = 1.5 ·
7.5 = 1.0). 7.1 is the smallest but the most time-critical.

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
