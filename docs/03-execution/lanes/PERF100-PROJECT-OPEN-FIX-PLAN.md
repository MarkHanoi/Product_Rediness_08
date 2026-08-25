# PERF100 — "only 151 elements but it takes a few minutes to open"

**Lane** PERF100 · **Opened** 2026-08-25 · **Status** INSTRUMENTED + PROBED; fix DESIGNED, NOT SHIPPED
**Issue rows** L-11440 … L-11445 · **Tag** `§PERF100-OPEN-IS-NOT-THE-LIST`

> **The founder:** *"AUDIT PROJECT OPENING — ONLY 151 ELEMENTS BUT IT IS SUPER SLOW. WHY?
> WHAT IS CORRUPTED? IT TAKES A FEW MINUTES ONLY TO OPEN THIS SMALL PROJECT."*

---

## 0. THE HEADLINE, BEFORE THE DETAIL

**Nothing is corrupted.** Every container parses, every count is right, every ruling runs. The
measured CPU cost of the entire hub-mount pass, at a fixture built to his own console's
dimensions, is **178 ms** (§3). What this is instead is **work that should not be on the
critical path** — and, more uncomfortably, **a span that no instrument could attribute.**

⭐ **The 44.2 s figure everyone has been quoting is not a measured cost.** It is the distance
between two marks that also contains *the founder looking at his screen and choosing a card*.
Human dwell and machine work were the same value. That is §CONTEXT-DATA-HONESTY applied to a
stopwatch, and it is the finding this lane is proudest of, because it means **the previous
readings of that hole — including the ones in the lane brief — were unattributable in
principle, not merely unmeasured.**

---

## 1. THE MEASURED CHAIN (his run, verbatim)

```
[§STARTUP-BUDGET] runtime:composed        +0ms     (t+0ms)
[§STARTUP-BUDGET] boot:ensure-requested   +44230ms (t+44230ms)   ← THE HOLE
[§STARTUP-BUDGET] boot:heavy-wiring-done  +0ms     (t+44230ms)
[§STARTUP-BUDGET] boot:engine-start       +532ms   (t+44762ms)
[§STARTUP-BUDGET] boot:scene-done         +608ms   (t+45369ms)
```

`runtime:composed +0ms (t+0ms)` is the FIRST mark of the run, i.e. `beginStartupBudget()` never
ran — this was a **hub-open**, not an onboarding run. Two suspects are exonerated by his own log:

| Suspect | Verdict | Evidence |
|---|---|---|
| Wave 1.5 `_heavyWiringDone` (2,433-LOC `PlatformShell` + 4 singleton hand-offs) | **EXONERATED** | `boot:heavy-wiring-done +0ms` — it had already resolved. `src/main.ts:344-352` predicted this uncertainty; this reading answers it. |
| The engine, the scene, and the 151 elements | **EXONERATED** | 532 ms + 608 ms. Rendering is not the problem and the element count is irrelevant. |

Everything else in the hole was **unnamed by any mark.**

---

## 2. PER-HYPOTHESIS VERDICT

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| H1 | `ProjectHub.syncFromServer` CPU (50 projects, 47 thumbnails, 77 residency ids) | **REFUTED as the hole** | Measured **178 ms total** at founder scale (§3). Real, wrongly ordered, but not 44 s. |
| H2 | `[AIApprovalStore] Restored 269 audit records` | **REFUTED** | `packages/ai-host/src/AIApprovalStore.ts:74` — one `localStorage.getItem` + one `JSON.parse` of 269 small records. Sub-millisecond. |
| H3 | Version history decompress/parse on open (20 versions, ~0.9 MB, 2056 journal records) | **REFUTED as the hole** | `probeVersions` ×77 over 66.1 MB = **88 ms**. `_parseContainer` reads the envelope only — no inflate, no snapshot parse (L-1300 property intact). |
| H4 | ⚠ Identity bug — shell inits on `proj-1787696877148-krt3e`, router opens `proj-1787676607909-cf330f23212c` | **REFUTED — cosmetic** | `PlatformShell.ts:117-121` prints `this.ctx.projectId`, set at `PlatformShell.ts:91` from `generateId()` (`PlatformToastSystem.ts:79-81`). A **placeholder**, minted in the constructor, inert until `setProjectContext` overwrites it at `PlatformShell.ts:168`. The two ids even have different suffix formats (5-char base-36 vs 12-char hex) — unrelated generators, not one value diverging. **No work is keyed on it:** every id-keyed operation (`warmVersionCache`, `getLatestVersion`, `_loadLatestVersionFromServer`, `initSocketCollaboration`) takes the `id` **parameter**, never `ctx.projectId`. `PlatformShell.ts:122-126` explicitly forbids the constructor entering the open path. **Nothing is done twice.** |
| H5 | Polling / retry loops on the hub path | **REFUTED** | Zero `setInterval` on the hub or shell path. `SaveOrchestrator` is event-driven, not periodic. |
| H6 | ⭐ **The hole contains human dwell and nothing distinguished it** | **CONFIRMED — and it is the finding** | No mark existed between `runtime:composed` and `boot:ensure-requested`. A hub that paints in 300 ms then waits 43 s for a click emits the SAME two marks as one that blocks for 44 s. |
| H7 | The server list round-trip (`_fetchSummaries`, and again `controller.refresh()` at `buildPersistence.ts:267-269`) | **OPEN — now measurable** | `hub:sync-start → hub:sync-fetch-done` isolates it. Note the open path asks for the list a SECOND time. |
| H8 | `VersionCacheStore.warm()`'s IDB cursor over the whole corpus (~66 MB) | **OPEN — honestly unmeasured** | happy-dom has no IndexedDB, so the probe short-circuits it. Not measured cheap; **unmeasured.** `hub:warm-start → hub:warm-versions-done` names it. |

---

## 3. THE MEASUREMENT (`apps/editor/src/ui/platform/__tests__/perf100Probe.spec.ts`)

Fixture built to his console: **77 local projects × 0.86 MB v3 container × 20 versions ×
2 056 journal records in 2 chunks = 66.1 MB.**

```
warmVersionCache (corpus)          1 ms   ⚠ IDB absent in happy-dom — UNMEASURED, not cheap
warmThumbnailCache                 1 ms
listProjects                       1 ms
planThumbnailReconcile             1 ms   50 server rows (the page cap)
probeVersions ×77                 88 ms   _parseContainer per project
decideLocalOnlyProjectFate ×77    85 ms
saveProjectsBatch(50)              1 ms   the single L-148 index write
────────────────────────────────────────
TOTAL                            178 ms
```

**What I could not measure, stated plainly:** I cannot run his browser. The two legs that are
not CPU — the server list round-trip and the real IndexedDB corpus read — are absent from this
harness. **An honest partial attribution: the hub's computation is 178 ms; the remaining
candidates are network and IndexedDB, and the new marks name both.**

---

## 4. THE ROOT, AT file:line

**`apps/editor/src/ui/platform/ProjectHub.ts:188-199` (`_warmThenSync`) — opening ONE project is
sequenced behind whole-corpus maintenance of ALL projects.**

```ts
const versionWarm = warmVersionCache().catch(() => {});   // reads EVERY project's history
const thumbWarm   = warmThumbnailCache().catch(() => {});
await thumbWarm;  this.refreshGrid();
await versionWarm;                 // ⛔ the server list queues behind ~66 MB of IndexedDB
await this.syncFromServer();       //    …and this is the list the OPEN path also wants
```

Three sub-roots, each independently wrong regardless of its current cost:

1. **`ProjectHub.ts:198`** — `syncFromServer()` awaits the corpus version warm. The server
   project list is what the grid wants *and* what `buildPersistence.openProject` step 1 asks
   for again (`buildPersistence.ts:267-269`). It should not queue behind reading every version
   of every project the user has ever made. **Opening one project cannot be a function of how
   many OTHER projects exist.** It is — which is exactly the shape a founder reports as *"a
   small project is slow"*.
2. **`ProjectHub.ts:349-421`** — the local-only residency AUDIT (77 ids) runs inside the
   reconcile, ahead of the index write and the repaint. It is a maintenance pass over projects
   the user is *not* opening.
3. **`ProjectHub.ts:300-304`** — the thumbnail back-fill fires `void uploadProjectThumbnail(...)`
   **inside the loop**: up to 50 concurrent POSTs of base64 image data to one origin at hub
   mount. Browsers allow ~6 connections per host; the 7th onward queue — **and the requests
   that queue behind them include the two the open path needs**, `controller.refresh()`
   (openProject step 1) and `tier.streamLoad()` (step 3). A repair pass for *previews* can
   delay the *project* the user asked for, over a resource neither declares.

---

## 5. SHIPPED — THE INSTRUMENT (commit `f6d14a78`)

Fifteen marks in the EXISTING `§STARTUP-BUDGET` instrument (L-10722). ⛔ No rival timer;
`markStartupPhase` is a passive recorder and no leg is gated, delayed or skipped.

`platform:router-started` · `hub:mount-start` · `hub:warm-start` · `hub:warm-thumbs-done` ·
`hub:grid-painted` · `hub:warm-versions-done` · `hub:sync-start` · `hub:sync-fetch-done` ·
`hub:sync-thumbs-done` · `hub:sync-residency-done` · `hub:sync-done` · `wiring:heavy-resolved` ·
⭐ `hub:open-clicked` · `open:router-launch` · `open:persistence-openProject`

⭐ **`hub:open-clicked` is the one that matters.** It splits the hole:
- `runtime:composed → hub:open-clicked` = hub work ∥ **human dwell** (read `hub:sync-done`
  against it to see which).
- `hub:open-clicked → boot:ensure-requested` = **machine work on the critical path of opening
  one project.** Only this half is a perf defect, and only this half a fix can shrink.

⛔ **Never quote the `runtime:composed → boot:ensure-requested` span as a cost again without
`hub:open-clicked` in the same run. Say which half you measured.**

**The founder's very next project open prints the whole table.** That reading, not this
document, decides which of H7 / H8 gets fixed first.

---

## 6. DESIGNED, NOT SHIPPED — THE FIX (deferred; session ended)

Reverted cleanly from the working tree rather than half-landed. `ProjectHub.ts` is at
`f6d14a78` (marks only).

| # | Change | Correctness constraint it must not break |
|---|---|---|
| F1 | `_versionWarm` becomes a field, awaited at its **two real points of need** instead of ahead of everything: immediately before `saveProjectsBatch`, and at the top of the residency audit. | ⚠ **L-148** — its invariant is *"both migrations complete before the first server-sync `saveProject*` **write**"*, **not** "before the sync starts". `hubPreviewWarmOrder.test.ts` asserts the stronger proxy ("the sync does not START until the warm settles") and **must be loosened to the real invariant, deliberately and with a note** — not silently. |
| F2 | Split `syncFromServer` into RECONCILE (fetch → thumbnails → upserts → one index write → repaint) and a `void`-fired `_auditLocalOnlyResidency` that yields a macrotask first. | ⚠ **§FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400)** and **§FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION (L-1289)** both stay INSIDE the ruling. Deferral cannot re-introduce the wrong conclusion because `mayConcludeAbsence(completeness)` and `decideLocalOnlyProjectFate(...)` are called unchanged, on the same inputs. **A deferral that instead SKIPPED the audit, or relaxed a gate to make it cheap, would be a regression wearing a fix's name.** |
| F3 | The audit awaits `_versionWarm` **first**, and that is CORRECTNESS, not politeness. | On an unwarmed store every probe reads `unreadable/cache-not-warmed`, every fate is `refuse`, and the hub prints the sign-out-damage warning for a corpus that is perfectly intact (`localOnlyProjectPurgeSafety.test.ts:189`). Deferring without this await would be faster and **wrong**. |
| F4 | Thumbnail back-fill collected, then sent **serially** after the grid is interactive. | ⚠ The repair is **not dropped** — dropping it re-opens §FIX-THUMBNAIL-DURABILITY. Same repair, same self-heal, one connection. |
| F5 | L-148's *one full-index write per sync* survives: the reconcile writes once; the audit writes at most once more, and only when it actually purges. Two writes on a rare path is not the fifty-writes-plus-fifty-quota-warns defect L-148 was raised against. | — |

**Deliberately NOT done, and named rather than guessed at:** replacing the whole-corpus version
warm with a KEY-ONLY warm plus a per-project `VersionCacheStore.warmOne(projectId)`. That is
the structurally correct answer to H8 — *read what you need, when you need it* — but it changes
`isWarmed()` semantics, which the purge ruling depends on, and three lanes were live in this
tree. **L-11444, OPEN.**

---

## 7. WHAT MUST PIN IT

1. **Budget pin** (`apps/editor/src/ui/platform/__tests__/` — already in the root vitest
   ALLOWLIST, verify discovery by failing it on purpose first, L-10931): `hub:open-clicked →
   boot:ensure-requested` under a stated budget for a fixture project, **plus** a mark-ORDER
   assertion that `hub:sync-fetch-done` precedes `hub:sync-residency-done`. The ordering arm is
   the real invariant; the millisecond arm will drift.
2. **`hubPreviewWarmOrder.test.ts`** rewritten to assert L-148's actual invariant (the warm
   settles before the index WRITE) rather than the proxy.
3. **`localOnlyProjectPurgeSafety.test.ts`** must stay green untouched — it is what proves F2/F3
   did not trade correctness for latency.

---

## 8. OPEN

- **L-11441** H7 — the server list is fetched TWICE on an open (hub `_fetchSummaries`, then
  `buildPersistence.ts:267-269` `controller.refresh()`). Deduplicate or seed the store.
- **L-11442** H8 — the corpus IDB warm is unmeasured. `hub:warm-*` names it on the next run.
- **L-11443** `ServerSyncQueue.ts:373` arms a one-shot network flush **3 s** after shell
  construction when a previous session left an unsynced queue — it can fire mid-open and
  contend for the same connection budget as F4. Not a loop; worth a mark.
- **L-11444** key-only corpus warm + `warmOne(projectId)` (§6).
- **L-11445** `PlatformShell.ts:117-121` prints a placeholder project id that looks like a real
  one and cost this lane a hypothesis. Print `(placeholder — no project open)` or nothing.
