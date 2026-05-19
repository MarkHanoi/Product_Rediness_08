# M24 Preview Self-Test Checklist

> **Purpose**: a concrete, click-by-click runbook for verifying — in the Replit Preview pane — that everything Phase 1 + Phase 2A + Phase 2B + Phase 2C + Phase 2D has shipped, before the 25 invitations are sent on **S48 D2**.
>
> **Audience**: the Founder + agent on the morning of S48 D9 (M24 LAUNCH Tuesday).
>
> **Authority**: subordinate to the SPEC and ADR series. Conflict precedence: `specs/SPEC-*` → `adrs/ADR-*` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` → this document. This file is **operational**, not contractual.
>
> **Cross-references**:
> - `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S48 (M24 BETA GATE).
> - `specs/SPEC-15-DEPLOYMENT-TOPOLOGY.md` §6 (required production env vars).
> - `specs/SPEC-27-MIGRATION-ROLLBACK.md` §3 (Replit-PG → Supabase cutover).
> - `src/main.ts` lines 17–158 (the K1A-4 / S06-T7 `?pryzm2=1` kill-switch).
> - `PHASE-3-COMPLETION-GA-M25-M36.md` line 291 (when `?pryzm2=1` becomes default — **S61, not S48**).

---

## Why a checklist exists

The Preview iframe loads `/` by default. At M24, **the default URL still mounts the PRYZM 1 marketing landing** ("Where the built world meets intelligence."). The kill-switch in `src/main.ts` is binding through all of Phase 2D; the default flip to PRYZM 2 happens at S61 (mid-Phase 3C, ~M32). So "open Preview, see PRYZM 2" is **not** the right mental model — the right model is "open Preview, append `?pryzm2=1`, see PRYZM 2".

This document removes the ambiguity by enumerating exactly which URL to load, what to click, and what to expect at each step.

---

## §0 Pre-flight — before the first click (S48 D9 morning)

### §0.1 Production secrets

Confirm in Replit Secrets that all required production env vars from SPEC-15 §6 are set:

- [ ] `NODE_ENV=production`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_DB_URL`
- [ ] `R2_ACCOUNT_ID`
- [ ] `R2_ACCESS_KEY_ID`
- [ ] `R2_SECRET_ACCESS_KEY`
- [ ] `UPSTASH_REDIS_URL`
- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `SESSION_SECRET`
- [ ] `ANTHROPIC_API_KEY` **or** `CF_WORKER_URL`
- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT`

### §0.2 Workflows green

- [ ] `Start application` workflow running, port 5000 webview live.
- [ ] `apps/sync-server` workflow running, listening on its WS port.
- [ ] `apps/bake-worker` workflow running, BullMQ connected to Upstash.
- [ ] `apps/api-gateway` health-check passes (`GET /healthz` returns 200).
- [ ] Boot log contains **no** `SUPABASE_SERVICE_ROLE_KEY IS NOT SET` warning. The S45 D5 cutover removed the auto-fallback for production; if that warning prints, `NODE_ENV` is wrong or the cutover was reverted.

### §0.3 Bench gates

Run from the Replit shell (not the UI):

- [ ] `pnpm spec:audit-storage` — green (no rogue tables outside SPEC-24 §4).
- [ ] `pnpm bench restore-verify` — green for ≥ 14 consecutive nights (Supabase PITR → fresh checksum match per SPEC-24 §3.4).
- [ ] `pnpm bench yjs-collab` — ≤ 250 ms broadcast lag p95 at 50 concurrent users.
- [ ] `pnpm bench all` — full M24 suite green; report at `apps/bench/reports/M24-beta.md`.

If any item in §0 is RED, **stop**. Per kill-switch K2D-A / K2D-B, do not invite beta users with broken sync, persistence, or backup.

---

## §1 Open the new stack (the URL discipline)

In the Preview pane URL bar, append `?pryzm2=1` to the root URL:

```
<your-preview-url>/?pryzm2=1
```

| Expected | If you see this instead |
|---|---|
| **Project Hub** mounts: project list, "Create new project" button, empty state on first run. | "Where the built world meets intelligence." marketing landing → you forgot the `?pryzm2=1` flag. |
| Page chrome is the new PRYZM 2 hub layout (S28 deliverable). | Old PRYZM 1 hub → kill-switch wasn't recognised; check `src/main.ts` lines 33–35. |

The two valid PRYZM 2 URLs at M24 are:

- `/?pryzm2=1` → Project Hub.
- `/?pryzm2=1&project=<id>` → opens that project in the full editor.

Optional renderer overrides (per ADR-007):

- `&mode=webgpu` → force WebGPU.
- `&mode=webgl2` → force WebGL2.
- `&mode=auto` (default) → auto-detect.

---

## §2 Sign in through the gateway

1. Click **Sign in**.
2. Choose Email + password / Google OAuth / Microsoft OAuth (per SPEC-15 §5).
3. Complete the auth flow. The gateway issues a JWT cookie signed by `SESSION_SECRET`.
4. Refresh the page — you should stay logged in.
5. DevTools → Application → Cookies: confirm a session cookie is present. Decode it (jwt.io) and confirm the `iss` claim matches your gateway hostname.

**Failure mode**: if the cookie is set but every authenticated request returns 401, check that `apps/sync-server` and `apps/bake-worker` are configured to accept gateway-issued JWTs (per SPEC-15 §5 they accept **only** gateway JWTs, never OAuth-direct).

---

## §3 Single-user editor smoke (Phase 1 + 2A + 2B + 2C coverage)

### §3.1 Create a project

1. Click **Create new project**, name it `m24-smoke`.
2. URL changes to `/?pryzm2=1&project=<id>`.
3. Editor mounts; canvas + 3D scene visible; sidebar populated.

### §3.2 Element families (Phase 1B + 1C + 2A — ~18 families)

Cycle through each family in turn; one element of each is sufficient:

- [ ] Wall (pick wall tool, click two points).
- [ ] Slab.
- [ ] Door (placed on a wall).
- [ ] Window.
- [ ] Roof.
- [ ] Curtain wall (panels + mullions + transoms render).
- [ ] Column.
- [ ] Beam.
- [ ] Grid.
- [ ] Stair.
- [ ] Handrail.
- [ ] Ceiling.
- [ ] Room (Phase 2A).
- [ ] Structural (Phase 2A).
- [ ] MEP (Phase 2A).
- [ ] Furniture (Phase 2A).

### §3.3 Plan view (Phase 2B + S46)

1. Switch view → Plan, Level 1.
2. Walls appear as 2D linework with correct end-joins.
3. Toggle a category off → elements vanish; toggle on → elements reappear; **no flicker**.
4. Verify Visibility-Intent waves 1–5 are operational:
   - Wave 1 — level scope.
   - Wave 2 — category visibility.
   - Wave 3 — view-template inheritance.
   - Wave 4 — wall-end joins.
   - Wave 5 — opening culling.
5. Visual diff < 1 px against PRYZM 1 plan view (per S46 parity-test gate).

> Waves 6–11 are **not** in M24 — deferred to S49 (Phase 3A).

### §3.4 Section view (Phase 2B)

1. Drop a section line in plan.
2. Open the section.
3. Geometry cuts cleanly; no z-fighting at the cut plane.

### §3.5 Sheets (Phase 2C)

1. Open Sheets panel → **New sheet**.
2. Drop a viewport → assign the plan view.
3. Drop a viewport → assign the section.
4. Drop a title block widget.
5. Drop one of each remaining widget type (10 total per Phase 2C scope).

### §3.6 Schedules (Phase 2C)

1. Open Schedules panel → **New schedule** → Wall schedule.
2. Rows populate from the model.
3. Add a formula column (`area`, `length`); values compute correctly.

### §3.7 Export (Phase 2C)

- [ ] PDF export of the sheet → file downloads → opens in browser → text is selectable (vector, not raster).
- [ ] CSV export of the schedule → opens cleanly in spreadsheet software.
- [ ] XLSX export of the schedule → opens cleanly.

### §3.8 Save / load round-trip

1. Trigger save (auto-save or File → Save).
2. Reload `/?pryzm2=1&project=<id>` → all geometry, sheets, schedules restored.
3. File → Export `.pryzm` → save locally.
4. Create a fresh empty project → File → Import `.pryzm` → state byte-equal to source (per `.pryzm v1` stability gate, M24 BETA GATE Architecture §).

If any of §3 fails, log it as a P0/P1 bug per K2D rules and **do not proceed to §4**.

---

## §4 Multi-user smoke (Phase 2D — the headline test)

### §4.1 Two-tab setup

1. Tab A: `/?pryzm2=1&project=<id>` (signed in as user A).
2. Tab B: same URL in a **different browser profile / incognito window**, signed in as user B (or a second test account).

> If you only have one account, two tabs in the same profile will share the session — fine for awareness/sync verification, but not for testing per-user permissions. For per-user tests, use two profiles.

### §4.2 Awareness (S44)

In tab A, switch to plan view, pick the wall tool. Within one frame, in tab B (in 3D view) you should see:

- [ ] Tab A's coloured cursor following its mouse position.
- [ ] A peer chip in the sidebar reading: `User A — Plan view — Level 1 — Wall tool`.
- [ ] When user A selects an element, the selection echoes in tab B's peer state.
- [ ] When user A switches view, the cursor disappears from tab B's old view and reappears in the new one within one frame (per `[ADR 0025-multi-view-sync]`).

Throttle check: open DevTools → Network → WS frames in tab B. Awareness payloads should average **< 5 KB/s** (per `[strategic ADR-018]` T1.8 cap).

### §4.3 Sync latency (S43)

1. In tab A, place a wall.
2. In tab B, the wall appears within **< 250 ms p95** (eyeball via DevTools, or use the Performance tab to measure).
3. Repeat 10 times — no edits dropped, no re-broadcast loops.

For the formal measurement run `pnpm bench yjs-collab` from the shell.

### §4.4 Soft locks (S45)

1. In tab A, start dragging a wall (mouse-down, hold).
2. In tab B, attempt to grab the same wall.
3. Tab B should see:
   - A small lock-icon badge adjacent to the wall.
   - A friendly message: `User A is editing this wall`.
   - The drag attempt is rejected at the gateway (HTTP 409).
4. Release the drag in tab A → the lock badge in tab B disappears within ≤ 30 s (TTL default).
5. Repeat with the lock holder's tab forcibly closed → after 30 s, the lock auto-expires (TTL sweeper per S45 D6).

### §4.5 20-user concurrent stress (only if cohort available)

- [ ] Coordinate 20 cohort members on one project for 10 minutes.
- [ ] No crashes.
- [ ] Sync latency < 500 ms p95 throughout (per K2D-E threshold).
- [ ] Awareness throttle holds (< 5 KB/s/peer).

If §4 fails on any point, halt per K2D-A (no broken sync to invitees).

---

## §5 AI approval-queue smoke (Phase 2D — S47)

1. Open the AI sidebar → confirm the **count badge** is empty.
2. Trigger a mock AI workflow: dev menu → **Fire mock AI batch** (per S47 D5 smoke fixture).
3. A pending action appears in the queue with:
   - Workflow kind (`floorplan` / `generative` / `rules` / `cv` / `voice`).
   - Estimated cost in USD.
   - Preview (image or JSON).
4. Click **Approve** → proposed commands commit to the model → geometry updates → badge clears.
5. Click **Reject** on a second mock action → it disappears with no model change.
6. Verify lazy-load: DevTools → Network → confirm `packages/ai-host/AiHost.impl` only loaded **on first AI invocation**, not on first paint (per S47 exit criterion + K3-A kill-switch).

> Real AI workflows (CV pipeline, generative, rules, voice) are **not** in M24. Phase 3A delivers them. The mock approval flow is the only end-to-end AI path verified at M24.

---

## §6 Persistence + observability spot-checks

### §6.1 Storage substrate is Supabase (not Replit-PG)

1. Open a Supabase SQL editor (or psql against `SUPABASE_DB_URL`).
2. `SELECT count(*) FROM projects;` → row exists for `m24-smoke`.
3. `\dt project_command_log` → **table does not exist** (deleted at S45 D5 per the cutover checklist).
4. Replit-PG database for production has been dropped (snapshot retained for 30 days).

### §6.2 OTel traces

1. Honeycomb / Tempo dashboard → filter `service.name = pryzm-editor`, time range = last hour.
2. Spans visible: `pryzm.command.execute`, `pryzm.frame.tick`, `pryzm.scene.commit`, `pryzm.ai.cost.usd`, `pryzm.sync.broadcast`.
3. AI cost dashboard reflects live `ai_usage` rows (per SPEC-28 §5.3).

### §6.3 Crash reporting

1. Sentry-equivalent crash dashboard live with beta-cohort filter (per S48 D3).
2. Trigger a test exception via the dev menu → confirm trace ID surfaces in the dashboard with a 1-click OTel link.

---

## §7 What you will *not* see at M24 (set expectations)

Per Phase 2D §6 "What Phase 2D Explicitly Did NOT Do":

| Not in M24 | Lands at |
|---|---|
| Visibility-Intent waves 6–11 | S49 (Phase 3A) |
| Full AI workflows (CV, generative, rules, voice) beyond mock | S49–S52 (Phase 3A) |
| Public AI API | S53 (Phase 3A) |
| IFC, DXF, Rhino import/export plugins | S55–S57 (Phase 3B) |
| Component editor migration | v2 backlog (cut per `[strategic ADR-018]` T2.2) |
| BCF round-trip | Phase 3B |
| Plugin SDK 1.0 publish | Phase 3C |
| Marketplace | Phase 3C |
| Public REST/WS APIs | S65 (Phase 3C) |
| `?pryzm2=1` becomes default URL | S61 (Phase 3C) |
| Self-host docker-compose | S70 (Phase 3D) |
| Firefox / Safari / Edge support | S70 (Phase 3D) |
| Multi-region sync replication | S67 (Phase 3D) — cut per T1.7 |
| Public open sign-up | S72 (Phase 3D — M36 GA) |

If a beta invitee reports any of the above as a "missing feature", it is on-plan and not a bug.

---

## §8 The 30-second version

1. **Pre-flight** — secrets set, workflows green, three `pnpm bench` commands green.
2. **Open Preview** — append `?pryzm2=1` to the URL.
3. **Sign in** — gateway JWT cookie present.
4. **Solo test** — create a project, place walls, switch to plan / section, build a sheet, export a PDF (covers Phases 1 + 2A + 2B + 2C).
5. **Multi-user test** — same project URL in a second tab; watch cursors and lock badges; place a wall in tab A, time how fast it appears in tab B (covers Phase 2D sync + awareness + locks).
6. **AI test** — fire a mock AI batch, approve it (covers S47).
7. **Spot-check Supabase** — row exists, `project_command_log` doesn't (covers S43–S45 cutover).

If §1–§6 all pass, you can send the 25 invitations on D2 with confidence and proceed to **D9 LAUNCH (Tuesday)**.

---

## §9 Failure response

If any check fails:

| Failure | Kill-switch | Action |
|---|---|---|
| Sync chaos test fails to converge < 5 s | K2D-A | Halt 2D forward work; do **not** invite beta users. |
| S45 D5 morning checklist any item RED | K2D-B | Defer `project_command_log` deletion to S46 D1; extend rollback window. |
| AI host bytes in first-paint bundle | K2D-C / K3-A | Halt S47 forward; root-cause; re-verify before D2. |
| Same-element edit data loss reported | K2D-D | Halt all work; root-cause CRDT layer; do not resume Phase 3 until regression locked out by test. |
| Sync latency > 500 ms p95 with 20 users | K2D-E | Halt beta widening; tune sync server before adding more users. |

All of the above are documented in `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §4 and `phases/PHASE-2-MIGRATION-MULTIUSER-M13-M24.md` §7.

---

*Last updated: 2026-04-28. Owner: Founder + Architecture lead. Conflicts? See Authority note at top. This document is operational; the contracts live in SPEC-* and ADR-*.*
