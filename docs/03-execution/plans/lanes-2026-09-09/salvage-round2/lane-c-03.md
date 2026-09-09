{
  "dimension": "The server and the database (backend behaviour on project open)",
  "summary": "I read every project-load endpoint in server.js, the whole of server/projectStore.js, server/dbMigrate.js, server/api/v1/routes.js and the client-side open orchestrator (packages/runtime-composer/src/buildPersistence.ts → apps/editor/src/ui/platform/PlatformShell.ts). THE HEADLINE, STATED HONESTLY FIRST: the founder's pasted console contains ZERO server-side lines — every timed number in it (EdgeProjector 109 ms, HiddenLineRemoval, WebGPU device loss, IndexedDB 1.4 MB) is client-side, and the open path is LOCAL-FIRST (PlatformShell.ts:297 reads IndexedDB and, on a hit, never touches the server for the snapshot). I therefore cannot claim the backend is where the bulk of the time goes, and I will not. The indexes are NOT the problem: dbMigrate.js:116 already carries `idx_project_versions_project_created (project_id, created_at DESC)`, which is exactly the shape every open-path read uses — the classic \"missing index on the hot column\" diagnosis is already closed here and re-opening it would waste budget. What I DID establish is a set of real, code-visible round trips the open pays unnecessarily: the biggest is that buildPersistence.ts:316 unconditionally AWAITS a full-snapshot fetch from the server, and PlatformShell.ts:299 then DISCARDS it whenever local history exists — a serial network leg whose result is thrown away on exactly the founder's scenario. Two independent socket.io connections, two thumbnail PATCHes, an uncached per-request Supabase access check, and a project-list query that still pulls up-to-50 base64 thumbnails only to `delete` them all pile on top. Measured on a synthetic 503-element / 2366-mutation snapshot using the repo's OWN scanner code, per-request server CPU is small (~18-20 ms here, maybe 60-120 ms on the shared-cpu-1x Fly box), so the server cost is round trips and wasted bytes, not query time.",
  "findings": [
    {
      "title": "The open path AWAITS a full-snapshot server fetch whose result is thrown away whenever local history exists",
      "mechanism": "`buildPersistence.openProject` step 3 does `const bundle = hint?.isNewProject ? null : await tier.streamLoad(projectId)` — an unconditional, serial `GET /api/projects/:id/latest-version` that returns the ENTIRE snapshot JSONB. Step 4 then hands it to `PlatformShell.setProjectContext(..., { prefetchedVersion: bundle })`. But `setProjectContext` is LOCAL-FIRST: it reads `versionRepository.getLatestVersion(id)` and, if that returns a record, calls `loadVersion(latest)` and returns. `opts.prefetchedVersion` is only ever read inside the `else` branch. So for a user who has local history — which the founder demonstrably does, his log shows '6 version(s) persisted to IndexedDB' — the whole server leg is dead weight, and it is AWAITED before the scene load is even allowed to begin. Only `isNewProject` skips it.",
      "evidence": [
        "packages/runtime-composer/src/buildPersistence.ts:316 — `const bundle = hint?.isNewProject ? null : await tier.streamLoad(projectId);`",
        "packages/runtime-composer/src/buildPersistence.ts:155 — `const res = await fetch(`/api/projects/${projectId}/latest-version`, {`",
        "apps/editor/src/ui/platform/PlatformShell.ts:297-301 — `const latest = versionRepository.getLatestVersion(id);` … `if (latest) { console.log('[PlatformShell] Auto-restoring latest local version:', latest.label); this.versionCtrl.loadVersion(latest); }` — prefetchedVersion is NOT consulted on this branch",
        "apps/editor/src/ui/platform/PlatformShell.ts:325 — `const prefetched = opts?.prefetchedVersion as (...)` — the ONLY read, inside the `else` (no-local-versions) branch",
        "apps/editor/src/ui/platform/PlatformRouter.ts:1247 — `await this.runtime.persistence.openProject(projectId, hint);` — the whole chain is awaited before the overlay hides",
        "Founder log: `[VersionRepository] reason=save-version - 6 version(s) persisted to IndexedDB` — proves local history is present, i.e. the discard branch is the live one"
      ],
      "estimatedCostMs": 350,
      "costBasis": "estimated",
      "fix": "Make the server fetch conditional on the local read, not unconditional. Either (a) move the `versionRepository.getLatestVersion(id)` probe UP into `buildPersistence.openProject` (or expose a cheap `hasLocalVersion(projectId)` predicate through the persistence slot) and skip `tier.streamLoad` when it hits, or (b) stop AWAITING it: fire `tier.streamLoad` without await, pass the promise as `prefetchedVersion`, and let the `else` branch await it only if local missed. (b) is the smaller change and keeps the deep-link case working unchanged. Add an `open:stream-load-start`/`open:stream-load-done` pair to `markStartupPhase` so this leg is on the same timeline as the rest and stops being invisible.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "The invariant the current code protects is 'a deep-linked / cold-cache open must still find its data', plus 'the server copy is the durable authority'. Option (b) preserves both — the fetch still happens, it just stops blocking. Option (a) is the riskier one: it would stop refreshing the local copy from the server on every open, so a project edited on ANOTHER device would keep showing the stale local version until the sync queue reconciles. Do not take (a) without deciding that explicitly.",
      "filesToChange": [
        "packages/runtime-composer/src/buildPersistence.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    },
    {
      "title": "GET /api/projects/:id/latest-version is two SERIAL Supabase round trips, and the whole snapshot is parsed and re-serialised inside the Fly process",
      "mechanism": "On the Supabase branch the handler first fetches the project row purely to check ownership, awaits it, and only then fetches the version row including the `snapshot` column. Two sequential PostgREST HTTPS calls Fly→Supabase for one logical read. Then the snapshot is materialised THREE times in the Node process on one shared vCPU: supabase-js JSON.parses the PostgREST body into JS objects, `res.json({ version: data })` re-stringifies the whole thing, and `app.use(compression())` gzips the result. None of that is streamed.",
      "evidence": [
        "server.js:3519-3523 — `const { data: proj } = await supabase.from('projects').select('id').eq('id', id).eq('owner_id', userId).maybeSingle(); if (!proj) return res.status(404)...`",
        "server.js:3525-3531 — `const { data, error } = await supabase.from('project_versions').select('id,project_id,label,created_at,element_count,snapshot').eq('project_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();`",
        "server.js:373 — `app.use(compression());`",
        "fly.toml:225-228 — `size = \"shared-cpu-1x\"` / `cpus = 1` / `memory_mb = 512` — one shared vCPU, single Node event loop",
        "MEASURED on this audit machine with a synthetic 503-element / 2366-mutation snapshot (0.52 MB raw JSON): JSON.parse 5.9 ms · res.json re-stringify 5.3 ms · gzip 7.0 ms = ~18 ms total. At 12 000 mutations (2.47 MB): 33.6 / 19.2 / 22.4 = ~75 ms. At 40 000 mutations (8.18 MB): 101.4 / 60.5 / 73.2 = ~235 ms — this grows linearly with the journal, which is embedded whole in every snapshot"
      ],
      "estimatedCostMs": 120,
      "costBasis": "estimated",
      "fix": "Collapse the two round trips into one. The ownership predicate belongs INSIDE the version query — a PostgREST embedded filter (`project_versions?select=...,projects!inner(owner_id)&projects.owner_id=eq.<uid>`) or a small RPC does it in a single call, and the composite index already covers it. Separately, stop paying the parse→stringify tax: PostgREST can stream the row and the handler can pipe it, or the snapshot can be stored/served as a pre-compressed blob so Node never materialises it as objects.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "The two-step shape is deliberate — server.js:3517's comment says the pre-check exists so 'no rows' vs a real DB error are told apart, and C13 project isolation depends on the owner_id scope being applied. Any single-query rewrite must keep 404-for-not-yours indistinguishable from 404-for-absent, and must not fall back to a filter the client can influence. Streaming the body would also lose the ETag currently set from `data.id` (server.js:3535).",
      "filesToChange": [
        "server.js"
      ]
    },
    {
      "title": "Two independent socket.io connections are opened per project open — double handshake, double uncached DB access check",
      "mechanism": "`initCollaboration.connectSocket` and `PlatformCollabPill.initSocketCollaboration` each call `ioFn({ transports, auth })` on their own. Neither looks for an existing socket; they hold separate references (`socket` module-local vs `ctx.socket`). Server-side each connection costs a WebSocket upgrade plus, on `join-project`, a `getSupabaseClient()` + `canUserAccessProject()` — which is one Supabase HTTPS round trip (two if the caller is not the owner). Nothing caches that verdict. Only the initCollaboration socket then also fires `_triggerCatchUp`, which is a further authenticated HTTP request that pays ANOTHER access check.",
      "evidence": [
        "apps/editor/src/engine/initCollaboration.ts:578-588 — `socket = ioFn({ transports: ['websocket','polling'], auth: ... });` … `console.log('[initCollaboration] Socket connected — joining project room:', projectId); socket.emit('join-project', projectId);`",
        "apps/editor/src/ui/platform/PlatformCollabPill.ts:183-191 — `ctx.socket = ioFn({ transports: ['websocket','polling'], auth: ... });` … `console.log('[PlatformCollabPill] Socket connected — joining project room:', projectId); ctx.socket.emit('join-project', projectId);`",
        "Founder log confirms BOTH fire on one open: `[PlatformCollabPill] Socket connected - joining project room: proj-...` and `[initCollaboration] Socket connected - joining project room: proj-...` — annotated `joined TWICE`",
        "server.js:577-587 — `const supabase = await getSupabaseClient().catch(() => null); const access = await canUserAccessProject(socket.data.userId, projectId, {...});` — per join, no memoisation",
        "server/projectAccess.js:121-126 — `const { data, error } = await supabase.from('projects').select('id, owner_id').eq('id', projectId).maybeSingle();`"
      ],
      "estimatedCostMs": 80,
      "costBasis": "estimated",
      "fix": "One socket per session. Hoist socket creation into a single owner (the runtime transport slot the TODOs in both files already point at: `TODO(C.3.x): legacy io — replace with runtime.transport.socket`) and have the pill subscribe to `version-saved` on that shared socket instead of minting its own. Independently, memoise `canUserAccessProject` per (userId, projectId) with a short TTL and an invalidation on membership change — it is currently the single most-repeated DB call on the open path.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "Each socket currently owns its own disconnect/reconnect lifecycle: PlatformCollabPill disconnects `ctx.socket` on project switch (PlatformCollabPill.ts:168-171), initCollaboration disconnects its own (initCollaboration.ts:571-574). Sharing one socket means one owner must handle project-switch teardown for both, and the catch-up replay ledger (`dispatcher.bindProject`) must not be re-bound twice.",
      "filesToChange": [
        "apps/editor/src/engine/initCollaboration.ts",
        "apps/editor/src/ui/platform/PlatformCollabPill.ts",
        "server.js"
      ]
    },
    {
      "title": "GET /api/projects still SELECTs the base64 `thumbnail` column for 50 rows and then deletes it server-side",
      "mechanism": "The Supabase branch of the v0 project-list endpoint selects `thumbnail` explicitly, then maps every row through `withThumbnailMetadata`, whose second statement is `delete row.thumbnail`. So up to 50 base64 data-URLs (ceiling 65 536 chars each) travel Supabase→Fly over HTTPS, are parsed into JS strings, and are immediately discarded. The L-10405 fix that replaced this with a boolean projection landed only in the Postgres `listProjects` (projectStore.js:481 `(p.thumbnail IS NOT NULL AND p.thumbnail <> '') AS has_thumbnail`); the Supabase branch in server.js was left as-is and the comment beside it says so outright. This endpoint is `controller.refresh()`, which `openProject` step 1 calls whenever `projectListStore.isEmpty()` — i.e. every deep-link and every hard reload.",
      "evidence": [
        "server.js:2941 — `.from('projects').select('id,name,updated_at,version_count,owner_id,thumbnail')`",
        "server.js:2945-2947 — `// §SUSTAIN109 (L-10405) — PostgREST cannot project `thumbnail IS NOT NULL` without an RPC, so the column is still read from the DB here; it is stripped to metadata BEFORE the response`",
        "server/projectThumbnail.js:66 — `delete row.thumbnail;`",
        "server.js:3346-3348 (THUMBNAIL_MAX_CHARS doc) — `64 KB caps that at ~3.2 MB worst case (~0.5–1 MB in practice at the observed 10–20 KB per WebP preview)` — the repo's own size estimate for this exact leg",
        "packages/runtime-composer/src/buildPersistence.ts:265-267 — `if (projectListStore.isEmpty()) { await controller.refresh(); }` — puts this on the open path for cold-list opens"
      ],
      "estimatedCostMs": 150,
      "costBasis": "estimated",
      "fix": "Add a PostgREST-visible generated/boolean column or an RPC (`list_projects_for_owner`) that returns `has_thumbnail` instead of the bytes, exactly as the Postgres branch already does, and drop `thumbnail` from the select list. The client already prefers `thumbnail_url` (projectStore.js:479 comment; ProjectHub.ts:875 `p.thumbnail_url ?? p.thumbnail ?? null`), so the response shape does not change.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "`withThumbnailMetadata` derives `has_thumbnail` from `isUsableStoredThumbnail(row.thumbnail)` when the column is present (projectThumbnail.js:65). Removing the column means the boolean must come from the DB and must apply the SAME usability test, or projects with a stored-but-unusable value (non-data-URL junk) would start advertising a preview that `GET /:id/thumbnail` then 404s.",
      "filesToChange": [
        "server.js",
        "server/projectThumbnail.js"
      ]
    },
    {
      "title": "When both Supabase and DATABASE_URL are configured, GET /api/projects runs BOTH list queries serially and merges them",
      "mechanism": "After the Supabase list completes, the handler checks `if (getPgPool())` and, if a Postgres pool exists, awaits `pgProjectStore.listProjects(userId)` as well — a second full list query against a different database, carrying a `LEFT JOIN LATERAL` over `project_versions` executed once per returned row — then merges and re-sorts in JS. The two awaits are strictly sequential. fly.toml's own secrets recipe sets BOTH `SUPABASE_URL` and `DATABASE_URL`, and pgClient.js creates a pool whenever `DATABASE_URL` is present, so this double path is the likely production shape.",
      "evidence": [
        "server.js:2955-2973 — `if (getPgPool()) { const pgProjects = await pgProjectStore.listProjects(userId); if (supabase) { ... const merged = [...supabaseProjects, ...pgOnly].sort(...); return res.json({ projects: merged }); } }`",
        "server/projectStore.js:490-499 — `FROM projects p LEFT JOIN LATERAL ( SELECT id, element_count FROM project_versions WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1 ) v ON true`",
        "server/pgClient.js:52-54 — `if (process.env.DATABASE_URL) { console.log('[pgClient] Using Replit PostgreSQL (DATABASE_URL)'); ... }`",
        "fly.toml:9-10 — `flyctl secrets set SESSION_SECRET=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... ...`"
      ],
      "estimatedCostMs": 120,
      "costBasis": "estimated",
      "fix": "Do not act on this until you have checked `flyctl secrets list` for the live app — if `DATABASE_URL` is unset in production this finding costs zero. If both ARE set, run the two lists with `Promise.all` rather than sequentially (they are independent), or decide which store is authoritative and stop double-reading.",
      "risk": "medium",
      "confidence": "low",
      "whatItWouldBreak": "The merge is the safety net for projects created before Supabase was configured or during a Supabase outage (server.js:2954 comment cites C13: 'projects must never silently disappear'). Parallelising is safe; deleting the PG leg would make those projects vanish from the hub.",
      "filesToChange": [
        "server.js"
      ]
    },
    {
      "title": "No cache on the per-request project access check — every project-scoped route pays an extra Supabase round trip before doing any work",
      "mechanism": "`_httpAccessResult` calls `canUserAccessProject` fresh on every invocation with no memoisation. On the Supabase branch that is a `projects` select by id; if the caller is not the owner it is a SECOND select against `project_members`. Every project-scoped HTTP route on or near the open path goes through it — visibility-intents, the catch-up `commands` query, versions, version state, audit — and so does every socket `join-project` (which, per the finding above, happens twice).",
      "evidence": [
        "server.js:960-974 — `async function _httpAccessResult(userId, projectId) { ... const supabase = await getSupabaseClient().catch(() => null); return await canUserAccessProject(userId, projectId, { supabase, pgPool: getPgPool(), ... }); }` — no cache map, no TTL",
        "server.js:4447 — `const allowed = await _httpCanAccess(userId, projectId);` (catch-up `/commands`)",
        "server.js:4213 — `if (!await _httpRequireAccess(userId, id, res, {...})) return;` (visibility-intents)",
        "server/projectAccess.js:141-146 — the second round trip: `const { data: mem, error: memErr } = await supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).maybeSingle();`",
        "Contrast: the plan lookup on the same request path IS cached — server/planStore.js:220-224 `if (_loadedSet.has(userId)) return;` — so the pattern already exists in this codebase"
      ],
      "estimatedCostMs": 60,
      "costBasis": "estimated",
      "fix": "Add the same `_loadedSet`-style memo that planStore.js already uses, keyed on `${userId}:${projectId}`, with a short TTL (30-60 s) and an explicit invalidation hook fired from the member add/remove/setRole routes and from project delete. Keep the retryable/transient distinction (L-136) uncached — only cache a VERIFIED allow or a VERIFIED deny, never a `db_unavailable`.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "This is an authorisation gate. Caching an allow means a revoked collaborator keeps write access for the TTL; caching a deny means a just-accepted invite is refused for the TTL. The invalidation hooks are the load-bearing part and must cover every write to `project_members` (server/projectMembersRoutes.js) plus project delete. Caching the `retryable` verdict would be strictly wrong — it would turn a transient blip into a sticky refusal.",
      "filesToChange": [
        "server.js",
        "server/projectAccess.js",
        "server/projectMembersRoutes.js"
      ]
    },
    {
      "title": "Two thumbnail captures per open produce two independent PATCH /thumbnail writes of the same project row",
      "mechanism": "There are two separate capture-and-upload sites in PlatformSaveController: the autosave path captures a thumbnail and calls `_uploadThumbnailToServer`, and a `pryzm-project-loaded`-triggered post-load path captures again and calls `_uploadThumbnailToServer` again. Neither checks whether the other already ran this open, and `uploadProjectThumbnail` has no dedup or in-flight guard. Each PATCH carries up to 65 536 chars of base64 and performs a Supabase UPDATE on the `projects` row. The founder's log shows the capture line twice.",
      "evidence": [
        "Founder log: `[captureThumbnail] Thumbnail captured ...        <-- appears TWICE`",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:397 — `this._uploadThumbnailToServer(this.ctx.projectId, capturedThumb);` (autosave path)",
        "apps/editor/src/ui/platform/PlatformSaveController.ts:567 — `this._uploadThumbnailToServer(projectId, thumb);` (post-load path, inside `runCapture`)",
        "apps/editor/src/ui/platform/thumbnailUpload.ts:77-82 — `const res = await apiFetch(`/api/projects/${projectId}/thumbnail`, { method: 'PATCH', headers: {...}, body: JSON.stringify({ thumbnail: dataUrl }) });` — no dedup, no in-flight guard",
        "server.js:3395-3411 — the Supabase handler does an UPDATE + `.select('id')` per call"
      ],
      "estimatedCostMs": 60,
      "costBasis": "estimated",
      "fix": "Give `uploadProjectThumbnail` a per-project last-uploaded digest (cheap FNV-1a over the data URL — server/projectThumbnail.js:73 already has one) and skip the PATCH when the bytes are unchanged, plus an in-flight promise map so two concurrent calls for the same project collapse into one.",
      "risk": "low",
      "confidence": "medium",
      "whatItWouldBreak": "The post-load capture exists specifically because the autosave capture can run before the renderer has settled (PlatformSaveController.ts:552 handles `capture returned null — renderer not ready`). Deduping on digest is safe; suppressing the post-load one is NOT — it is the capture that produces the good preview.",
      "filesToChange": [
        "apps/editor/src/ui/platform/thumbnailUpload.ts",
        "apps/editor/src/ui/platform/PlatformSaveController.ts"
      ]
    },
    {
      "title": "The snapshot is one unpaginated, unstreamed blob — the client-side streaming plane exists but the server endpoints it needs were never built",
      "mechanism": "`SnapshotStreaming` splits a snapshot into a header plus per-level chunks and is described as a pure data plane with 'no consumers in production code'. Its own header lists the server half as DEFERRED. I grepped server.js for the two endpoint shapes it names and found zero occurrences, so nothing on the server can serve a header or a level chunk. Every open therefore fetches the entire snapshot — model plus the whole embedded `temporalGraph` — as one response before anything can render. The journal is the dominant term: ProjectSerializer's own probe comment records that for a 264-element project the model is ~0.1 MB while the stored container was ~35 MB, and names `temporalGraph` as the difference.",
      "evidence": [
        "packages/persistence-client/src/loader/SnapshotStreaming.ts:24-27 — `❌ DEFERRED to Phase 8-extension (needs Contract 13 + 20 amendment first): • Server endpoint split (`/latest-version/header` + `/level/:levelId`). • New `project_versions_levels` Postgres/Supabase table + dual-write.`",
        "`grep -n \"latest-version/header|/level/\" server.js` → NO MATCHES (the server half does not exist)",
        "apps/editor/src/engine/persistence/ProjectSerializer.ts:2069-2072 — `for a 264-element project the model serialises to ~0.1 MB while the founder's stored 20-version container is ~35 MB (lane LOAD30, 2026-08-22). The difference is `temporalGraph`, embedded WHOLE in every snapshot`",
        "packages/persistence-client/src/loader/ProjectSerializer.ts:926 — `temporalGraph: temporalGraphManager.serialize(),` — the journal is a first-class member of the snapshot the server stores and returns",
        "Founder log: `temporalGraph 2366 mutations / 0 edges` — the journal rides in this project's snapshot today"
      ],
      "estimatedCostMs": -1,
      "costBasis": "read-from-code",
      "fix": "Two independent moves, cheap one first. (1) SPLIT THE JOURNAL OFF THE WIRE, not the model: add `?includeJournal=0` (or a separate `/latest-version/journal` leg) so the open fetch carries the model only and the journal streams in behind first paint — undo history is not needed for the first frame. That is a small server change and it attacks the term that actually grows. (2) Only then consider the per-level chunking SnapshotStreaming describes, which needs the `project_versions_levels` table and the Contract 13/20 amendments its header names.",
      "risk": "medium",
      "confidence": "high",
      "whatItWouldBreak": "The snapshot's integrity checksum is computed over the whole object. Detaching the journal on the wire means the digest is computed over a DIFFERENT shape than the one stored — the client already has the right idiom for this (`detachJournalMutations` / `attachJournalMutations` in @pryzm/persistence-client, and the rule that an unfaithful reassembly makes the digest NOT COMPARABLE rather than 'corrupt', ProjectRepository.ts:34-42) and any server-side split MUST reuse it rather than invent a second one. Undo/redo depth is also degraded until the journal arrives — that has to be a visible state, not a silent one.",
      "filesToChange": [
        "server.js",
        "packages/persistence-client/src/loader/SnapshotStreaming.ts",
        "apps/editor/src/ui/platform/PlatformShell.ts"
      ]
    },
    {
      "title": "Unbounded COUNT(*) on project_versions runs TWICE per save, on a table that grows per save and is never pruned",
      "mechanism": "`createVersionTransactional` step 3 runs `SELECT COUNT(*) AS cnt FROM project_versions WHERE project_id = $1` to enforce the plan version limit, and step 5's UPDATE recomputes the same count as a subquery. Neither carries a LIMIT. This is the query shape the brief asks about in (e): unbounded, on a table that gains a row on every autosave. I found no server-side retention or pruning of `project_versions` anywhere. The founder's own console, quoted verbatim in a code comment, shows a project that had reached 746 versions. The counts are index-only, so the cost is small today — I am reporting the SHAPE and the unbounded growth, not claiming this is the bottleneck.",
      "evidence": [
        "server/projectStore.js:1257-1260 — `const countResult = await client.query(`SELECT COUNT(*) AS cnt FROM project_versions WHERE project_id = $1`, [projectId]);` (step 3)",
        "server/projectStore.js:1280-1284 — `UPDATE projects SET updated_at = NOW(), version_count = (SELECT COUNT(*) FROM project_versions WHERE project_id = $1) WHERE id = $1` (step 5 — the same count again)",
        "server/projectStore.js:967-971 — `export async function countVersions(projectId) { ... `SELECT COUNT(*) AS cnt FROM project_versions WHERE project_id = $1` ... }` — a third copy of the shape",
        "apps/editor/src/ui/platform/ServerSyncQueue.ts:830-832 — the founder's own console line, preserved as evidence in the source: `§L-B2-RECONCILE 412 for \"Auto-save\" — expected 1, server has 746.`",
        "No DELETE / pruning of project_versions found anywhere in server/ — the only DELETE is the ON DELETE CASCADE from `projects` (dbMigrate.js:74)"
      ],
      "estimatedCostMs": 10,
      "costBasis": "estimated",
      "fix": "Step 5 already holds the correct count: it is `projResult.rows[0].version_count + 1` under the FOR UPDATE lock, so the subquery is redundant — replace it with an arithmetic increment and delete one of the two counts outright. Separately, and more important than the counts: decide a server-side retention policy for project_versions, because 746 snapshot rows for one project is somewhere between 0.4 GB and 1 GB of TOASTed JSONB with no ceiling on it.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "`version_count` is the value the optimistic-locking `If-Match` header is compared against (server.js:3612-3620, projectStore.js:1237-1242). Deriving it arithmetically instead of by COUNT(*) means a row inserted by any path that does NOT go through this transaction would silently desync it — and `createVersion` (projectStore.js:1085) is exactly such a path. Either route every insert through the transactional function or keep one authoritative recount. Retention is a data-loss decision and needs the founder's explicit call, not an agent's.",
      "filesToChange": [
        "server/projectStore.js"
      ]
    },
    {
      "title": "GET /api/v1/portfolio is a true serial N+1 that loads the FULL snapshot of up to 50 projects — but it is NOT on the open path",
      "mechanism": "After listing up to 50 projects, the handler loops over them and, per project, awaits a full latest-version snapshot fetch (`getLatestVersionSnapshot` on the PG path, or a PostgREST select including `snapshot` on the Supabase path), parses it, and walks its rooms. Fifty serial multi-megabyte reads on one shared vCPU. I am reporting it because the brief asks for N+1 patterns, and flagging clearly that I traced its only caller and it is a modal the user must explicitly open — it does not run when a project is opened.",
      "evidence": [
        "server/api/v1/routes.js:1248 — `for (const project of projects) {` … :1255 `.from('project_versions').select('id, label, snapshot, element_count, created_at').eq('project_id', project.id).order('created_at', { ascending: false }).limit(1).single();`",
        "server/api/v1/routes.js:1264-1265 — `} else if (pgProjectStore.getLatestVersionSnapshot) { const row = await pgProjectStore.getLatestVersionSnapshot(project.id);` — awaited inside the loop, no batching, no Promise.all",
        "apps/editor/src/ui/platform/PlatformProjectBrowser.ts:874 — `apiFetch('/api/v1/portfolio')` — called from inside `openPortfolioPanel()` (:850), a user-initiated modal, not the open path"
      ],
      "estimatedCostMs": 0,
      "costBasis": "read-from-code",
      "fix": "Leave it alone for the open-time complaint. If the portfolio modal is itself slow, the fix is to stop reading snapshots at all: the per-room aggregates it computes (GIA, room-type counts, compliance pass/fail) should be materialised into a summary column or table at save time, so the portfolio is one query over 50 small rows rather than 50 queries over 50 large ones.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "Nothing on the open path — that is the point of listing it. Materialising the aggregates would mean they go stale if a snapshot is written by any path that skips the aggregation hook.",
      "filesToChange": [
        "server/api/v1/routes.js"
      ]
    },
    {
      "title": "NEGATIVE FINDING, recorded so it is not re-diagnosed: the indexes on the open path are present and correct",
      "mechanism": "The brief names 'a missing index on a hot column' as the classic cause. It is not the cause here, and I am recording the check so the next agent does not spend budget on it. Every read the open path performs is index-covered: the latest-version read is `WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, which `idx_project_versions_project_created (project_id, created_at DESC)` serves exactly; the hub list is `WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 50`, served by `idx_projects_owner_updated (owner_id, updated_at DESC)`; the membership direction the access gate needs is served by `idx_project_members_user_project (user_id, project_id)`; the catch-up query is served by `idx_pcl_project_time (project_id, created_at DESC)`. Only ONE open-adjacent query lacks a sort-covering index — visibility-intents — and it is not fetched during open.",
      "evidence": [
        "server/dbMigrate.js:116-118 — `CREATE INDEX IF NOT EXISTS idx_project_versions_project_created ON project_versions(project_id, created_at DESC);` with the comment `THE most important index in the schema` naming `getLatestVersionSnapshot() (THE PROJECT-OPEN PATH)`",
        "server/dbMigrate.js:70 — `CREATE INDEX IF NOT EXISTS idx_projects_owner_updated ON projects(owner_id, updated_at DESC);`",
        "server/dbMigrate.js:137 — `CREATE INDEX IF NOT EXISTS idx_project_members_user_project ON project_members(user_id, project_id);`",
        "server/dbMigrate.js:272 — `CREATE INDEX IF NOT EXISTS idx_pcl_project_time ON project_command_log(project_id, created_at DESC);`",
        "THE ONE GAP: server.js:4229 — `SELECT * FROM visibility_intents WHERE project_id = $1 AND is_system = false ORDER BY updated_at DESC` has NO LIMIT and dbMigrate.js:258 provides only `idx_visibility_intents_project (project_id)`, so the sort is unindexed. Its only client caller is the `vi:intent-updated` socket handler (apps/editor/src/engine/initCollaboration.ts:715), i.e. a peer edit, not an open"
      ],
      "estimatedCostMs": 0,
      "costBasis": "read-from-code",
      "fix": "No index work is warranted for the open complaint. If visibility-intents ever grows, widen its index to `(project_id, updated_at DESC)` and add a LIMIT — but do that as hygiene, not as a fix for this symptom.",
      "risk": "low",
      "confidence": "high",
      "whatItWouldBreak": "none known",
      "filesToChange": []
    },
    {
      "title": "One shared vCPU / 512 MB with a 50 MB JSON body limit — the autosave POST that fires DURING open contends with every open-path request on the same event loop",
      "mechanism": "Node is single-threaded and the Fly VM is one shared CPU. The founder's log shows an autosave completing during the open (`[PlatformSaveController] Version saved: \"Auto-save\" (503 elements)`), so a snapshot POST is in flight while the open's other requests are queued behind it. The POST handler traverses the body four times synchronously: express.json parses it, the route re-stringifies the whole thing purely to measure its size against the 50 MB cap, a Zod passthrough parse walks it, the URL scanner walks up to 500 000 values, and the pg insert stringifies it again. I measured all of these with the repo's real scanner code and the cost is SMALL at this scale — I am reporting the contention shape and the memory hazard, not claiming this is the bottleneck.",
      "evidence": [
        "fly.toml:225-228 — `size = \"shared-cpu-1x\"` / `cpus = 1` / `memory_mb = 512`",
        "server.js:382 — `return express.json({ limit: '50mb' })(req, _res, next);` — a 50 MB body limit on a 512 MB box",
        "server.js:3628-3629 — `const _snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');` — a full re-stringify of the already-parsed body, only to measure it",
        "server.js:3690 — `const _urlScan = scanSnapshotForUnsafeUrls(snapshot);`",
        "server/projectStore.js:1268 — `JSON.stringify(snapshot)` again, as the insert parameter",
        "MEASURED, this audit machine, synthetic 503-element / 2366-mutation snapshot (0.56 MB), median of 9, using the REAL server/snapshotUrlScan.js: JSON.parse 6.1 ms · size-cap stringify 5.0 ms · scanSnapshotForUnsafeUrls 4.9 ms (42 393 values visited, not truncated) · insert stringify 4.4 ms = ~20 ms total per save",
        "server/snapshotUrlScan.js:33-37 — the repo's own measured table for the scanner, which is where the 500 000-value bound came from"
      ],
      "estimatedCostMs": 100,
      "costBasis": "estimated",
      "fix": "Two cheap wins and one decision. (1) Delete the size-cap re-stringify: express.json's own `limit` already refused anything oversized, so a full traversal purely to compute a number is waste. (2) Move the URL scan off the request path — it is report-only by design (server.js:3684 'REPORT ONLY, REJECTS NOTHING'), so it can run after the response is sent, or on a sample. (3) Decide whether 50 MB is a real limit on a 512 MB VM — parsing a 35 MB body into a JS object graph on that box is an OOM, and the object graph is several times the byte size.",
      "risk": "low",
      "confidence": "medium",
      "whatItWouldBreak": "The size cap must still refuse oversized bodies before any DB write; `content-length` is client-supplied, so the correct form is to let express.json's `limit` do the refusing (it already does) rather than to trust a header. Deferring the URL scan means a finding is logged after the 201 rather than before it, which is fine while it rejects nothing but must be revisited if it is ever flipped to a refusal (its exit condition is written at the bottom of server/snapshotUrlScan.js).",
      "filesToChange": [
        "server.js",
        "fly.toml"
      ]
    }
  ],
  "whatIcouldNotEstablish": "THE BIGGEST GAP, AND IT IS FUNDAMENTAL: there is not one server-side number in the founder's log. No HAR, no DevTools network waterfall, no Fly logs, no Supabase query timings. Every millisecond figure in my findings is ESTIMATED — the only MEASURED numbers I produced are from a synthetic snapshot on THIS machine (a fast dedicated CPU, not a Fly shared-cpu-1x) using the repo's real scanner and codec code. I have labelled every one accordingly. If anyone quotes my estimatedCostMs as a measurement, that is exactly the failure mode this repo has a documented history of. THE SINGLE HIGHEST-VALUE NEXT STEP is not a code change: it is one DevTools Network HAR of a slow open, filtered to /api/*, with timings. That settles in thirty seconds what I could only reason about from code.\n\nSpecifically unresolved:\n1. Whether the server is on the critical path AT ALL for the founder's open. The path is local-first (PlatformShell.ts:297), his log proves local history exists, and yet buildPersistence.ts:316 still awaits the server fetch. I established the fetch HAPPENS and is DISCARDED; I could not establish how long it took, because the log excerpt does not include the `[persistence.tier.streamLoad] version \"...\" loaded` line that would have told me.\n2. Which database branch production actually runs. The Supabase branch and the Postgres branch are DIFFERENT code with different costs, and several findings apply to only one. fly.toml's secrets recipe lists both SUPABASE_URL and DATABASE_URL, which would make the double-list path in finding 5 live — but a secrets recipe in a comment is not a reading of `flyctl secrets list`. Check that before acting on findings 2, 4 or 5.\n3. The actual byte size of the founder's SERVER-side snapshot. The 1.4 MB in his log is the COMPRESSED local IndexedDB container for SIX versions sharing one deduplicated journal — it is not the server payload and must not be read as one. The server stores each version's snapshot with the full temporalGraph embedded, uncompressed, as JSONB. My 0.52 MB synthetic is a construction, not a measurement of his data.\n4. Fly region vs Supabase region, hence real per-round-trip latency. Every \"two serial round trips\" finding is worth 2×RTT and I do not know RTT.\n5. Whether the founder's project_versions row count is still near the 746 quoted in ServerSyncQueue.ts:830 — that figure is preserved in a comment from an earlier session, not measured today. `SELECT project_id, count(*) FROM project_versions GROUP BY 1 ORDER BY 2 DESC LIMIT 10` would settle it and would also size the retention problem.\n6. Whether the two `[captureThumbnail]` lines produce two actual PATCH requests. I established two independent call sites with no dedup, which makes it very likely, but the log records the CAPTURE, not the upload.\n7. Whether the Fly machine was warm. `min_machines_running = 1` says it should be, but `auto_stop_machines = \"stop\"` plus a deploy bounce can leave a window; a cold boot re-transpiles ~100 workspace TypeScript packages under tsx (fly.toml:207-212 says so explicitly), and nothing in the founder's client log would distinguish that from a slow query.\n8. I did not read the Yjs/CRDT sync path at all. CLAUDE.md says Yjs powers collaboration and fly.toml:236 says CRDT documents persist to Postgres via persistence-client — if there is a document-load leg on open, it is outside what I traced. My socket findings cover only the socket.io collaboration channel."
}