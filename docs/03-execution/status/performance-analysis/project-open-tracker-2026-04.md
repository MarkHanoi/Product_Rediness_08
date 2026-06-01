# Project-Open Performance — Process Tracker

Companion to [`PROJECT-OPEN-PERFORMANCE-AUDIT-2026-04.md`](./PROJECT-OPEN-PERFORMANCE-AUDIT-2026-04.md).
Updated: 22 April 2026.

## Surgical fixes

| # | Description | File(s) | Status |
|---|---|---|---|
| 1 | Confirm engine bundle is prefetched on the home view | `src/main.ts` | [x] verified — already in place at line 94 |
| 2 | Add `_httpCanAccess()` helper that supplies the runtime context to `canUserAccessProject()` | `server.js` (new helper near line ~393) | [x] done |
| 3 | Switch all 5 HTTP handlers from raw `canUserAccessProject(userId, projectId)` to `_httpCanAccess()` | `server.js` (POST/GET/GET/DELETE on `/api/projects/:id/ifc-uploads*`, GET `/api/projects/:id/commands`) | [x] done |
| 4 | Make `/api/projects/:id/commands?since=…` fail-soft when access check throws (return empty list instead of 500) | `server.js` | [x] done |
| 5 | Hoist `ifcStorageService` and `dwgConversionService` from per-request `await import()` to boot-time `import` | `server.js` top of file + 5 call sites | [x] done |
| 6 | Defer `splitViewManager.activate()` to `requestIdleCallback` instead of a fixed 400 ms `setTimeout` | `src/engine/subsystems/initScene.ts` | [x] done |
| 7 | Add a 2 s "quiet window" after `pryzm-project-loaded` in `AmbientIntelligence` so constraint-engine warm-up does not trigger a spurious AI request during load | `src/ai/AmbientIntelligence.ts` | [x] done |

## Verification

| Check | Status |
|---|---|
| `npx tsc --skipLibCheck --noEmit` passes with zero errors | [x] |
| Workflow `Start application` restarts cleanly | [x] |
| Server logs show Supabase connected with service role key | [x] |
| No new server-side errors after restart | [x] |

## Documentation

| Item | Location | Status |
|---|---|---|
| Performance audit report | `docs/03-execution/status/intent-analysis/PROJECT-OPEN-PERFORMANCE-AUDIT-2026-04.md` | [x] created |
| Process tracker (this file) | `docs/03-execution/status/intent-analysis/PROJECT-OPEN-PERFORMANCE-PROCESS-TRACKER-2026-04.md` | [x] created |

## Round 2 (after first user retest)

The first round did not eliminate the project-open errors because the real
cause was a network-level failure that wasn't visible until the workflow
was actively serving requests:

| # | Description | File(s) | Status |
|---|---|---|---|
| 8 | Route `listIfcUploads()` through the Supabase REST client (HTTPS) instead of `pgPool`. The direct PG hostname `db.<ref>.supabase.co` is IPv6-only on Supabase free/standard plans and Replit's container has no IPv6 → every `pgQuery` from this endpoint died with `getaddrinfo ENOTFOUND`. | `server/ifcStorageService.js` | [x] done |
| 9 | Same Supabase-REST switch for the `/api/projects/:id/commands?since=…` catch-up endpoint. PostgREST returns the same data shape so the response contract is unchanged. | `server.js` | [x] done |
| 10 | Diff-based registration in `ReDetectRoomsCommand`. `mergeWithExisting()` already preserves room IDs across detections, so the previous "unregister all → re-register all" pattern was performing 50+ redundant cycles per wall edit (one console line each, plus `BimManager` event + `SemanticGraph` + `SpatialIndex` work). Now we only unregister rooms that disappeared and only register rooms that are new. | `src/commands/rooms/ReDetectRoomsCommand.ts` | [x] done |

### Verification (round 2)

| Check | Status |
|---|---|
| Server logs show no more `[IFC Storage] List failed: getaddrinfo ENOTFOUND` | [x] |
| Server logs show no more `[commands/catch-up] Query failed: getaddrinfo ENOTFOUND` | [x] |
| `npx tsc --skipLibCheck --noEmit` passes | [x] |
| Home page renders with HTTP 200 + 55 fps after restart | [x] |

## Still deferred (multi-day work)

- [ ] Move `PlanarTopologyEngine` and wall-junction clustering to a Web Worker
- [ ] Coalesce the two compliance-overlay passes into one
- [ ] Yield WebGPU renderer warm-up to idle so the loading overlay paints at 60 fps
- [ ] Long-term: migrate the legacy `src/` runtime onto the `editor/` Turborepo monorepo

## Optional follow-up the user can take

If the project ever moves off Replit (e.g. to a Vercel/Fly.io host that has
IPv6), the Supabase REST fallback continues to work, but you can also flip
`SUPABASE_DB_URL` to the Supabase **transaction pooler** URL:

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

The pooler is IPv4-friendly, so `pgPool` queries would start working again
and the REST fallback would simply not be triggered.

---

## Round 3 — 2026-04-23 (post-load main-thread relief)

After Round 2 eliminated the silent ENOTFOUND failures from `db.<ref>.supabase.co`,
the remaining wall-clock cost during project open was concentrated in the
~3 s window immediately after `pryzm-project-loaded` fires, where four heavy
subsystems compete for the main thread.

### Fixes applied

| # | Hot path | Before | After | File |
|---|----------|--------|-------|------|
| 1 | Socket.io command-log INSERT | Direct `pgQuery` → silent ENOTFOUND on every collaborative command | Supabase REST primary; `pgQuery` fallback | `server.js:244` |
| 2 | Socket.io retention cleanup DELETE | Same as above (~2% of commands) | Supabase REST primary | `server.js:275` |
| 3 | H-1 PhysicsEngine `enqueueAll()` | `setTimeout(500ms)` | `requestIdleCallback({ timeout: 3000 })` | `src/engine/subsystems/initDataPlatform.ts:189` |
| 4 | ConstraintEngine auto-run on load | Fired ~N times during command replay (one per element), each scheduling a 600 ms validation | 2 s quiet window after `pryzm-project-loaded`, then a single coalesced run on idle | `src/engine/subsystems/initDataPlatform.ts:117` |
| 5 | Post-load thumbnail capture | `setTimeout(2500ms)` → ~2.5 s LONGTASK from WebP encode | `setTimeout(3500ms)` + `requestIdleCallback({ timeout: 4000 })` | `src/ui/platform/PlatformShell.ts:1919` |
| 6 | RoomBoundaryBuilder compliance overlay | Repainted for every `pryzm-constraints-updated` (often duplicate during load) | Hash-coalesced — duplicate broadcasts skipped | `src/elements/rooms/RoomBoundaryBuilder.ts:118` |

### Expected impact

- The ~2.5 s LONGTASK after first paint should be gone or moved off the
  critical interaction path (now runs during idle, with a 4 s timeout fallback).
- The ConstraintEngine's storm of debounced runs during command replay
  collapses into a single coalesced run, removing 1–2 s of main-thread blocking.
- Collaborative editing no longer logs an ENOTFOUND warning per command
  (REST is the primary path; `pgQuery` is fallback only).
- Compliance overlay repaints once per real change, not twice.

All edits are tagged `PERF-FIX (Apr 2026)` for traceability.
