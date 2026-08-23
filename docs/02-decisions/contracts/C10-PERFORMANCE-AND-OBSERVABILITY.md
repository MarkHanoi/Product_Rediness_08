# C10 — Performance & Observability

> **Stamp**: 2026-05-02 · **Status**: CANONICAL  
> **Scope**: The 17 Non-Functional Targets (NFTs), OpenTelemetry span requirements, CI performance gates, bundle splitting, and the DR runbook reference.  
> **Key principles**: P8 (every new exported function adds ≥ 1 OpenTelemetry span).

---

## §1 — The 19 Non-Functional Targets (NFTs)

Each has a benchmark in `apps/bench/src/benches/*.bench.ts` (68 `.bench.ts` files —
`ls apps/bench/src/benches/*.bench.ts | wc -l`). The bench suite **MUST** run in CI on every merge
to main, and a regression on any NFT **MUST** be a merge blocker on the PR that caused it.

> ⚠ **NOT-YET-TRUE (recorded 2026-08-11). The two `MUST`s above are the requirement, not the
> state.** This section used to open *"These are **measured contracts**, not aspirational goals"*
> — as an unqualified statement of fact. It is currently the reverse: **the bench suite runs in no
> CI job at all.**
>
> - Measured: `grep -rn "bench" .github/workflows/` → **zero matches** across every workflow file.
>   Nothing in CI invokes `apps/bench`. There is no baseline file, so there is nothing a
>   "regression from baseline" could be computed against.
>
> **Exit condition:** a `bench` job exists in `.github/workflows/ci.yml`, runs
> `apps/bench` against a committed baseline, and is listed among the required status checks in
> that file's header. Wave 5 owns this. Until then, every NFT row below is a **TARGET**, and no
> row may be cited as a measured property of the shipped product.

NFTs 1–17 exist as of Wave 13 (2026-05-01) ✅. NFT 18 added Wave A16 (2026-05-03) ✅. NFT 19 target Wave A18.

| # | NFT | Target | Bench file |
|---|---|---|---|
| 1 | Cold-boot to first paint | < 2.5 s on M1 / Chrome | `cold-boot.bench.ts` |
| 2 | Project-load (10k elements) | < 6 s p95 | `project-load.bench.ts` |
| 3 | Tool latency (click → visible) | < 50 ms p95 | `tool-latency.bench.ts` |
| 4 | Frame budget (interactive viewport) | 16.6 ms p95 (60 FPS) | `frame-budget.bench.ts` |
| 5 | Plan-view re-render after edit | < 100 ms p95 | `plan-view-redraw.bench.ts` |
| 6 | Sheet-view re-render | < 200 ms p95 | `sheet-view-redraw.bench.ts` |
| 7 | CRDT merge (2 concurrent users) | < 80 ms p95 | `crdt-merge.bench.ts` |
| 8 | Sync conflict surface | < 1 s from second-user save | `sync-conflict.bench.ts` |
| 9 | IFC import (Tier-1, 50 MB) | < 30 s | `ifc-import-tier1.bench.ts` |
| 10 | IFC export (Tier-1, 10k elements) | < 20 s | `ifc-export-tier1.bench.ts` |
| 11 | BCF round-trip (issue cycle) | < 4 s | `bcf-roundtrip.bench.ts` |
| 12 | Family load (medium, 200 params) | < 200 ms | `family-load.bench.ts` |
| 13 | Schedule rebuild (10k rows) | < 500 ms p95 | `schedule-rebuild.bench.ts` |
| 14 | AI plan-critique latency | < 8 s e2e | `ai-critique.bench.ts` |
| 15 | Bundle size (editor app) | < 4 MB gzipped | `bundle-size.bench.ts` |
| 16 | Memory ceiling (10k elements, 1 h session) | < 1.5 GB | `memory-ceiling.bench.ts` |
| 17 | Plugin sandbox overhead | < 5 % CPU vs native call | `plugin-sandbox-overhead.bench.ts` |
| 18 | Undo stack memory (4 h session, 1000 commands) | < 50 MB rss delta | `undo-stack-memory.bench.ts` |
| 19 | E2E suite (Playwright, 10 critical flows) | all green on every CI run | `e2e-playwright-suite.spec.ts` (Wave A18 ✅) |

### §1.1 — Measurement methodology

**INTENDED methodology** (all four bullets are the target; the ⚠ notes record what is true today):

- Benchmarks run in a headless Chromium instance via `@vitest/browser`.
  ⚠ **NOT-YET-TRUE.** `apps/bench/vitest.config.ts` sets `environment: 'node'` and no
  `@vitest/browser` is configured. Every bench therefore runs in **Node**, with no renderer, no
  GPU and no real layout — so the rendering, frame-budget and cold-boot NFTs cannot be measuring
  what their names claim. *Exit condition:* the browser provider is configured, or the affected
  NFT rows are re-scoped to what a Node harness can honestly measure.
- All p95 targets are measured over ≥ 100 samples.
  ⚠ **NOT-YET-TRUE for most rows.** Measured with
  `grep -rhoE "SAMPLES *= *[0-9]+" apps/bench/src/benches/*.bench.ts | sort | uniq -c`: of the 25
  benches that declare a sample count, **only 8 are ≥ 100** (5×200, 3×500). The remaining 17 run
  at **5, 8, 10, 15, 20, 30 or 50** samples — nine of them at **5**. A p95 over 5 samples is not a
  p95. *Exit condition:* every bench that states a p95 target declares `SAMPLES >= 100`, enforced
  by the Wave-5 bench job.
- The bench suite runs after `pnpm build` to measure production bundle performance, not dev server
  performance. ⚠ **NOT-YET-TRUE** — see §1's note: the suite runs in no CI job, so it runs after
  nothing.
- NFT regressions are tracked in `03-CURRENT-STATE.md §1` alongside the code metrics.

---

## §2 — OpenTelemetry Span Contract (P8)

**Every new exported function MUST add ≥ 1 OpenTelemetry span.** This is a merge blocker.

> ⛔ **READ §2.6 BEFORE QUOTING ANY NUMBER FROM §2.3.** Until **2026-08-23** every
> span this contract mandates **recorded nothing and exported nowhere in the
> browser, by construction** — the switch that enables the tracer provider had no
> wire attached to it on the client. `ZONE A 246/246 instrumented` was, and for any
> build that does not set `VITE_PRYZM_TRACING` still is, a measurement of **source
> text**, not of behaviour. **Coverage and reachability are two different axes and
> §2.3 measures only the first.**

### §2.1 — Span naming convention

```ts
const span = tracer.startSpan('pryzm.<package>.<operation>');
// Examples:
//   pryzm.geometry-kernel.section-cut
//   pryzm.persistence-client.save-project
//   pryzm.ai-host.plan-critique
```

### §2.2 — Required span attributes

| Attribute | Type | Required for |
|---|---|---|
| `pryzm.project_id` | string | All project-scoped operations |
| `pryzm.user_id` | string | All user-triggered operations |
| `pryzm.element_count` | number | Geometry and scene operations |
| `pryzm.command_type` | string | Command handler spans |
| `error` | boolean | All spans (set true on exception) |

### §2.3 — CI gate

~~`scripts/ci-check-spans.ts` runs on every PR. It diffs the changed files for new `export` declarations and checks that at least one `tracer.startSpan` call exists in the same function scope.~~

> ⛔ **CORRECTED 2026-08-18 — §2.3 STATED AS LIVE FACT A GATE THAT §5 OF THIS SAME FILE RECORDS AS NEVER HAVING EXISTED.** `ls scripts/ci-check-spans.ts` → **No such file or directory.** §5's row was amended months ago; **this section was not, so the contract contradicted itself and the present-tense sentence is the one readers reached first** — fifteen other contracts then cited it onward (see the †PHANTOM-GATE footnotes now carried by C31, C33–C36 and C38–C49).
>
> **The real gate is [`tools/ga-gate/check-otel-spans.ts`](../../../tools/ga-gate/check-otel-spans.ts), and it does NOT do what the struck sentence describes.** It does not diff changed files, and it does not scope to function bodies. Measured:
> `npx tsx tools/ga-gate/check-otel-spans.ts > /tmp/otel.txt 2>&1; echo "RC=$?" >> /tmp/otel.txt` → **RC=3**
>
> | Zone | Subject | Reading |
> |---|---|---|
> | **A** | CommandBus handlers, zero tolerance | **246 / 246** instrumented |
> | **B** | command-registry + app handlers + plugin barrels | **54 uninstrumented of 70**, baseline **52** — **the failure**, 2 new files |
> | **C** | §CENSUS, **NOT GATED** | **1772 of 2023** files declaring an exported function have **NO span** |
>
> ⛔ **P8's "every new exported function" clause is therefore measured for ZERO files** — it lives entirely in the ungated Zone C. State it as **NOT-YET-TRUE**. Zone B's baseline is **shrink-only**; fix the two files, never widen it.

### §2.4 — User-facing observability events (toasts + polls)

OTel spans are the operator-facing channel. The **user-facing** observability channel is the in-app toast/event pipeline:

- **§VALIDATE-CACHE.** Workflows that produce per-room warnings (the §F-Sprint-5 furnish circulation gate, see C09 §3.4.1) MUST emit them on a `*.layout-executed` event payload AND cache them in-memory so the user can review via a `pryzm…Warnings()` console command after the toast scrolls off.
- **§VALIDATE-TOAST.** When a `*.layout-executed` event carries `validationWarnings.length > 0`, the trigger MUST emit a single `pryzm:toast` of severity `info` (not `error` — the gate flags risk, not failure) pointing the user at the review command. Severity is `info` because the layout still landed.
- **§BUILD-TOAST.** Generative completion toasts MUST surface dropped-element counts when the §PREVIEW-VS-BUILD gate rejected items during the build runBatch — e.g. `Built layout — N walls, M doors (K dropped — see console)`. Severity stays `success`; the drops are advisory. The drops MUST also be logged through a `console.group(§BUILD-WARN — N item(s) dropped during build)`.

### §2.5 — Polling / wait telemetry (§POLL-TELEMETRY)

Silent post-runBatch polls (wait-until-store-mutation, wait-until-room-named, etc.) MUST emit a structured `<stage>.<poll>-completed` event on `runtime.events` (P4) with:

- `levelId`
- `durationMs` (Date.now()-start)
- `attempts` (poll iteration count)
- `pollDescription` (what was being waited on)

This converts the otherwise-invisible silent latency into an observable metric so an operator can answer "why did the apartment build take 8 s instead of 2 s?" without console-archaeology. The two reference sites today are `apartment.wall-poll-completed` + `apartment.room-name-completed` (`e0a4b44`).

---

### §2.6 — §SPAN-REACHABILITY, §SPAN-DESTINATION, §SPAN-SAMPLING, §SPAN-PRIVACY

> **Added 2026-08-23, lane OBS4 (ISSUE-LOG `L-9960`), from
> [`docs/04-reference/AUDIT/D-collab-persistence.md` §2.4](../../04-reference/AUDIT/D-collab-persistence.md).**
> §2.1–§2.3 govern whether a span is **written**. This section governs whether it is
> **recorded, delivered, affordable and safe.** They are four separate axes and only
> the first had a contract.

#### §2.6.0 — What was measured (the defect this section exists to close)

| Fact | Reading | Command |
|---|---|---|
| `trace.getTracer(...)` call sites | **347** across **328** files | `grep -rn "getTracer(" packages apps plugins server server.js src tools \| grep -v node_modules \| wc -l` |
| …of those, under `server/` | **1** (`server/manualAdminZoneStore.js:49`) | `grep -rn "getTracer(" server server.js` |
| `span.setAttribute(...)` sites | **1 766** | `grep -rn "span\.setAttribute" packages apps plugins server \| wc -l` |
| Configuration files setting `PRYZM_TRACING` | **0** | `grep -rn PRYZM_TRACING --include=*.json --include=*.toml --include=*.yml .` |
| `PRYZM_TRACING` in `secrets-declarations.json` | **absent** | — |
| `define` in `vite.config.ts` | **none at all** | — |
| OTLP exporter packages installed | **none** — `@opentelemetry/api` only | `ls node_modules/@opentelemetry/` |

⛔ **The switch for 345 of the 347 tracer sites had no wire.** `initTracing()` read
`PRYZM_TRACING` from `process.env` only; `process.env` does not exist in a browser
bundle. This is **UNREACHABLE, not absent** — the code was correct and could not be
turned on. Fixing only the server half would have moved **0.3 %** of the
instrumentation.

#### §2.6.1 — §SPAN-REACHABILITY (binding)

**A build MUST be able to register a real tracer provider, and MUST SAY whether it
did.** Two mechanisms, because the two halves are different problems:

| Half | Mechanism | Why |
|---|---|---|
| **Server** | `process.env.PRYZM_TRACING`, read at `server/telemetry.js` | Node has the variable. |
| **Browser** | **build-time `define`** in `vite.config.ts` → the bare identifiers `__PRYZM_TRACING__`, `__PRYZM_TRACING_SAMPLE__`, `__PRYZM_TRACING_ENDPOINT__`, `__PRYZM_RELEASE__`, `__PRYZM_ENV__`, fed from `VITE_PRYZM_TRACING` &c. | `initTracing()` **must complete synchronously** before the composition root opens its first span (`composeRuntime.ts`). A runtime config endpoint would either block boot on a network round-trip — unacceptable while "opening takes minutes" is the live complaint — or resolve *after* the first spans were already created against the no-op tracer, which is the same unreachability one layer along. |

⚠ **Bare identifiers, NOT `import.meta.env.X`**, and the reason is structural:
`packages/crash-reporter` is a **linked workspace package consumed as raw TS**, its
`tsconfig` declares `types: ["node"]` (so `import.meta.env` is a type error without
dragging `vite/client` into an L1 leaf), and the *same file* is additionally bundled
by esbuild into `dist-server-deps/` and run under vitest, where `import.meta.env` is
`undefined` and `import.meta.env.X` **throws**. `typeof <undeclared>` is safe in all
four environments.

**PROVEN, not asserted** (2026-08-23, real `vite build` over a fixture importing the
linked package):

- flag **unset** → `readBuildTimeEnv()` compiles to `function(){const out={};return out;}` — every branch constant-folded and dead-code-eliminated, **zero runtime cost**;
- `VITE_PRYZM_TRACING=otlp` → the literal is baked in and the built bundle prints `PROBE_MODE=otlp`.

**COST OF THE CHOICE, stated:** flipping browser tracing needs a **rebuild**, not a
restart. Accepted — tracing is not an emergency switch, and `VITE_*` is already how
this repo configures the client (11 declared rows in `secrets-declarations.json`).

**Every composition root MUST log `describeTracing(handle)` at boot.** L-392 stayed
invisible for months because nothing ever printed `OFF`.

#### §2.6.2 — §SPAN-DESTINATION (binding)

⛔ **A span created and dropped is the same defect one layer along. There is no
"on but nowhere" state.**

| `PRYZM_TRACING` | Destination | Endpoint required? |
|---|---|---|
| unset / unrecognised | **OFF** — no provider, no cost | — |
| `console` | `ConsoleSpanExporter` (dev) | no |
| `otlp` / `1` / `true` / `on` | OTLP/HTTP **JSON** → `OTEL_EXPORTER_OTLP_ENDPOINT` | **yes** |

**When OTLP is asked for and no endpoint is set, `initTracing()` REFUSES**: it stays
OFF, returns a populated `refusedReason`, and logs one loud line **that names the
`console` escape hatch** (a refusal whose "no" branch leaves the operator with no next
step is its own defect — L-942).

The exporter is **`packages/crash-reporter/src/OtlpHttpJsonSpanExporter.ts`**, written
in-package and taking **zero new dependencies**. ⚠ `server/telemetry.js`'s NodeSDK
block dynamically imports five `@opentelemetry/*` packages that **are not installed**,
so it has never executed its success path — it falls into its own catch and logs
"packages not installed". It is retained but is **not** the path that works, and it is
now skipped whenever `initTracing()` already registered a provider (two global
providers silently orphan one pipeline).

⛔ **`OTEL_EXPORTER_OTLP_HEADERS` (classification SECRET) MUST NOT be mirrored to a
`VITE_` name.** It carries the collector auth token; a public bundle would publish it
to every visitor. `vite.config.ts` hard-codes `__PRYZM_TRACING_HEADERS__` to
`undefined` so no future edit wires it by accident. A browser exporter MUST use an
ingest endpoint that authenticates by URL/origin, or a same-origin proxy route.

#### §2.6.3 — §SPAN-SAMPLING (binding)

**Sampling is `ParentBased(TraceIdRatioBased(r))`. Default `r` = `0.05` in OTLP mode,
`1.0` in `console` mode.** Override with `PRYZM_TRACING_SAMPLE` /
`VITE_PRYZM_TRACING_SAMPLE`. `ParentBased` so a child never contradicts its parent —
half a trace is worse than none, because it reads as a *fast* operation.

**MEASURED, not chosen for roundness** (`packages/crash-reporter/__tests__/OtlpHttpJsonSpanExporter.test.ts`,
which prints the reading so it cannot rot silently):

```
one project-open (281-element shape) = 288 spans,
126 336 bytes OTLP/JSON = 439 B/span; ~6 317 bytes per open at r = 0.05
```

| | unsampled | at `r = 0.05` |
|---|---|---|
| per open | 288 spans · **126 KB** | ~14 spans · **~6.3 KB** |
| C66 1 000-user target, ~20 opens/user/day | **5.8 M spans/day · ~2.5 GB/day** | ~288 K spans/day · ~8.6 M/month |

2.5 GB/day of egress is **charged to users' bandwidth** for telemetry they did not ask
for, and is past every vendor free tier. ~6.3 KB per open is **~0.15 %** of the ~4 MB
of vendor chunks the page already downloads. 5 % still *sees* a slow open: at 20
opens/day one user contributes a fully-traced open roughly daily, and the founder can
trace his own session at `PRYZM_TRACING_SAMPLE=1`.

⚠ **Head sampling, not tail** — decided per trace at creation, so the un-sampled 95 %
cost nothing to create and nothing to send. Tail sampling needs a collector-side
policy and belongs to whoever provisions the collector.

#### §2.6.4 — §SPAN-PRIVACY (binding)

**Every span MUST pass through `RedactingSpanProcessor` before any exporter can see
it.** It wraps the batching processor and is its **only** caller, so there is no
ordering in which raw attributes reach the wire.

| Rule | Effect |
|---|---|
| credential-shaped values | → `[redacted]` (Anthropic, OpenAI, OpenRouter, Google, Groq, xAI, bearer, JWT, plus a generic ≥40-char high-entropy arm for vendors PRYZM has not enumerated) |
| email-shaped values | → `[redacted-email]` (covers `PRYZM_OWNER_EMAIL` and every end user) |
| credential/content-**named** keys | value dropped whole: `apikey`, `secret`, `password`, `credential`, `token`, `authorization`, `cookie`, `session`, `email`, `prompt`, `utterance`, `content`, `body`, `payload`, `snapshot`, `filename`, `filepath` — because a short custom key matches no entropy pattern and the **key name is the only signal** |
| any string > **256 chars** | truncated with a marker — a span attribute is a LABEL, not a payload |
| numbers / booleans / ids / enums | **untouched** — redaction that deletes the signal is another way of shipping nothing |

Span **names** and **event** names/attributes are scrubbed on the same path.

⭐ **BYOM is the load-bearing case.** [C105 §4.4](C105-AI-PROVIDER-CREDENTIALS-BYOM.md)
binds that a user-supplied provider key must never reach "a log, a telemetry span, an
error report, a project file, or a network request to PRYZM". **MEASURED 2026-08-23:
the BYOM path (`packages/ai-host/src/byom/**`, `apps/editor/src/ui/ai/byom/**`) carries
ZERO OTel spans**, so today the key cannot reach one — but that is a property of the
current call graph, **not an invariant**, and one `span.setAttribute('pryzm.byom.header', h)`
in a future lane would break it silently. `__tests__/SpanRedaction.test.ts` pins the
containment at the **export boundary** for nine real-shaped provider credentials, in
both the value position and under an innocuous key name, asserted against the **actual
OTLP wire payload**. ⚠ The detector patterns are **duplicated** from
`ByomRedaction.ts` on purpose: `crash-reporter` is L1 and `ai-host` is L2, so importing
upward is a layer violation and the exporter must work in a bundle with no `ai-host`.

**MEASURED, whole-repo, that no existing attribute carries project content:** every
`setAttribute('pryzm.*', …)` value assigned from a `.name` / `.label` / `.title` /
`.address` / `.email` / `.text` / `.query` / `.description` / `.prompt` / `.content` /
`.body` / `.path` / `.url` property → **0 hits** across `packages/` and `apps/`. The
attributes that exist are ids, counts, ratios, enums and status strings. Two carry a
user identifier and are **server-side only**: `pryzm.authz.user`
(`apps/sync-server/src/authz/PgAuthz.ts:272`) and `pryzm.ws.auth.user`
(`apps/sync-server/src/auth/WsAuthGate.ts:243`).

#### §2.6.5 — ⭐ THE COLLECTOR DECISION — the founder's, and NOT taken here

⛔ **There is no collector.** §2.6.1–§2.6.4 make every option a one-variable change
rather than a code change; **choosing one is a spend decision and is deliberately not
made by a lane.** ⚠ The prices below are **ASSUMED** — list prices recalled at time of
writing, **not fetched from a vendor page in this lane**. Confirm before committing.

| # | Option | Cost (ASSUMED) | Buys | Costs |
|---|---|---|---|---|
| **1** | **Console-only in dev, OFF in prod** (today, minus the silence) | **€0** | A developer can trace a local repro end-to-end with one env var. | **Nothing in production.** The founder's "opens take minutes" stays undiagnosable from here. |
| **2** | **Vendor, free tier** — Grafana Cloud (~50 GB traces/mo, 14-day retention) or Honeycomb (~20 M events/mo) or Axiom / Baselime | **€0** until the tier, then usage-priced | Production traces with **zero ops**. At `r = 0.05` the measured 8.6 M spans/month for 1 000 users fits inside Honeycomb's event budget with headroom. | Third-party data processor → a **DPA + privacy-policy line** is required, which §2.6.4's redaction makes defensible but does not remove. Vendor lock on query language. |
| **3** | **Self-hosted** — OTel Collector + Grafana Tempo on Fly.io, traces in R2/S3 | **~$2–6/mo** for one `shared-cpu-1x` 512 MB machine + object storage; **plus** the real cost: **setup and ongoing operation** | No third-party processor; data stays on infrastructure PRYZM already runs (Fly + R2 are both in use). Tail sampling becomes possible. | An extra service to run, upgrade and page on. A collector that falls over silently re-creates this whole defect. |

**Lane recommendation, offered not enacted: Option 2 on a free tier, browser at
`r = 0.05`, server at `r = 1.0`** — the server has **1** tracer site, so tracing it
fully is free, while the browser has 345 and is the half that costs bandwidth. Revisit
when the free tier is actually exceeded, at which point Option 3's operational cost is
being compared against a real invoice rather than a guess.

⛔ **Until an option is chosen, the honest statement is `PRYZM_TRACING` unset ⇒ OFF ⇒
"instrumented in source, recording nothing in production."** §2.3's Zone A figure MUST
be reported that way (see the box under §2).

#### §2.6.6 — What one project-open emits

`ProjectLoader` dispatches **one `Create*` command per element** (its own header
documents the ordering), and every one of those is an instrumented Zone A CommandBus
handler. For the founder's real project (**281 elements / 7 levels**, ISSUE-LOG
`L-8704`) that is the **288 spans / 126 KB** measured in §2.6.3.

⚠ **AND THE STORAGE LEG STILL HAS NO SPANS.** Measured: `getTracer(` in
`packages/persistence-client/src/loader/ProjectLoader.ts`,
`apps/editor/src/engine/persistence/ProjectLoader.ts`,
`apps/editor/src/ui/platform/ProjectRepository.ts`, `PlatformShell.ts` → **0, 0, 0, 0**.
So turning tracing on gives **per-command** visibility into an open (which nothing had)
but says **nothing** about the mirror-read → envelope-parse → inflate → record-parse
leg that `L-8703` identified as the unmeasured one; that leg is covered by
`§PROBE-OPEN-PATH-STORAGE-LEG`'s always-on console probe. **The two are complementary
and neither is redundant.** Adding spans to the open path is instrumentation
*coverage* — `check-otel-spans` Zone B, a different axis, not this section.

#### §2.6.7 — Exit conditions

1. A collector option in §2.6.5 is chosen and `OTEL_EXPORTER_OTLP_ENDPOINT` is set for at least one environment.
2. A gate asserts that a production bundle built with `VITE_PRYZM_TRACING=1` actually registers a provider (`isTracingEnabled()` true in a prod smoke test) — otherwise §2.6.1 is a rule that nothing enforces, which is the failure shape this contract keeps recording.
3. The open path acquires spans, so §2.6.6's "storage leg has none" row can be deleted rather than annotated.

---

## §3 — Bundle Splitting Strategy

The editor app MUST apply manual chunk splitting to prevent the heavy vendor bundles from blocking the initial load. Current split boundaries (enforced in `vite.config.ts`):

| Chunk | Packages | Trigger |
|---|---|---|
| `vendor-cesium` | `cesium` | Geospatial viewport open |
| `vendor-web-ifc` | `web-ifc` | IFC import dialog |
| `vendor-thatopen` | `@thatopen/*` | IFC viewer open |
| `vendor-pathtracer` | `three-gpu-pathtracer` | Photorealistic render mode |
| `vendor-three-bvh` | `three-mesh-bvh` | Loaded with three core |
| `vendor-three` | `three` | Always loaded (deferred) |
| `vendor-pdfjs` | `pdfjs-dist` | PDF viewer |
| `vendor-dxf` | `dxf` | DXF import |
| `vendor-rhino3dm` | `rhino3dm` | Rhino import |
| `vendor-chart` | `chart.js` | Data Workbench / schedules |

**Rationale**: jspdf, svg2pdf, and html2canvas MUST NOT be manually chunked — doing so causes Vite's `__vitePreload` runtime to be co-located with the jspdf vendor chunk, pulling 477 KB of export code into the eager startup graph (documented incident, Contract 18 audit).

The `chunkSizeWarningLimit` is set to 1500 KB to suppress false-positive warnings for the intentionally large CAD/BIM vendor chunks.

---

## §4 — CI Gate Inventory (Performance + Build)

| Gate | Condition | Failure mode — measured 2026-08-11 |
|---|---|---|
| All 19 NFT benches pass | No regression from baseline | ⚠ **NOT A GATE — no CI job runs it.** `grep -rn "bench" .github/workflows/` → **0 matches**; no committed baseline exists. Intended: merge blocker. **Exit condition:** Wave-5 bench job wired into `ci.yml` and added to that file's required-checks header. (The row also said "17"; §1 defines **19**.) |
| `pnpm build` succeeds | `npm run build` exits 0 | Merge blocker — `build` job in `ci.yml` ✅ |
| Bundle size < 4 MB gzipped | NFT 15 | ⚠ **NOT A GATE.** `bundle-size.bench.ts` exists but, like every other bench, is invoked by no workflow. Same exit condition as the row above. |
| TypeScript `--noEmit` 0 errors | `pnpm tsc --noEmit` | Merge blocker — inside the `build` job ✅ |
| All workspace tests pass | `pnpm test:ci` | Merge blocker ✅ — but note `test-pryzm1` is deliberately `continue-on-error` pending L-544 |
| OpenTelemetry span coverage | ~~`scripts/ci-check-spans.ts`~~ → **`tools/ga-gate/check-otel-spans.ts`** | ⚠ **The cited path never existed** (`ls scripts/ci-check-spans.ts` → No such file) — the same defect class as L-812. The real gate runs inside the `ga-gate` job and is **ENFORCEMENT-BLIND**: 255/256 handler files instrumented against a `HARD_FLOOR` of 213, counting *files* rather than *exported functions*. See [STR-03 §2](../../01-strategy/STR-03-engineering-vision.md) P8 for the exit condition. |

---

## §5 — Crash Reporter

`packages/crash-reporter/` captures unhandled errors and unhandled promise rejections in production. It MUST:
- Sanitise any PII (user IDs are hashed; no project content is sent).
- Not block the main thread.
- Be configurable off via `CRASH_REPORTER_DISABLED=true` for self-hosted deployments.

---

## §6 — Disaster Recovery

The DR runbook is in `docs/04-reference/runbooks/DR-DRILL-RUNBOOK.md`. The runbook MUST be exercised (dry-run drill) at least once per quarter. Key RTO/RPO targets:

| Target | Value |
|---|---|
| Recovery Time Objective (RTO) | < 4 hours |
| Recovery Point Objective (RPO) | < 1 hour (Supabase WAL-based point-in-time recovery) |
| DR drill cadence | Quarterly |

The last DR drill MUST be logged in `03-CURRENT-STATE.md §11` with its date and outcome.

---

## §7 — Generation performance (log-gating + rebuild-budget + single-redetect)

A "building generation" (residential / office / house) is a KNOWN-heavy, multi-sub-batch
operation that authors 500+ elements in one shot. Three rules keep it fast (L-369):

1. **Hot per-element debug logs MUST be gated on a bulk-path flag.** A `console.log` on the
   main thread blocks it (severely so with DevTools open). Per-element / per-opening /
   per-finish loggers on the generation hot path (`[BimManager] Registered element`,
   `[WallOccupancyStore] canPlace OK`, `[RoomFinishSyncService] Synced/Propagated`,
   `[WallFragmentBuilder] RAF_DRAIN`) MUST be suppressed while a project load
   (`globalThis.__pryzmProjectLoadActive`) OR a building generation
   (`globalThis.__pryzmBuildingGenActive`, set by `buildingGenerationLifecycle`) is in flight.
   Interactive edits (neither flag set) still log; per-sub-batch SUMMARY lines are kept. New
   hot-path loggers MUST follow this gate.

2. **Deferred rebuild budgets MAY go high during a batch drain.** Renders are suppressed for the
   whole batch drain, so a drain frame is pure geometry cost. `WallFragmentBuilder` raises its
   per-frame floor (32) and cap (64) during a batch drain, with a `frameMs` back-off bounding a
   single frame. (SlabFragmentBuilder / CurtainWallBuilder MAY adopt the same batch-floor
   pattern — tracked as an L-369 follow-up.)

3. **Room re-detection MUST NOT run per-sub-batch during a generation.** The
   `RoomTopologyObserver` suppresses its AUTO-redetects while `__pryzmBuildingGenActive` (mirrors
   the existing `isBatching` guard); room identity during generation comes from the executors'
   graph rooms (`BatchCreateRoomsCommand`, ADR-0069) + their explicit `ReDetectRoomsCommand`s
   (which bypass the observer). `buildingGenerationLifecycle.release()` fires exactly ONE
   `scheduleRedetectAllLevels` sweep at the true end (a no-op on graph-authoritative levels).
