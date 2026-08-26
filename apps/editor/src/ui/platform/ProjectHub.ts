/**
 * ProjectHub — CDE-compliant project browser
 *
 * Contract compliance:
 *   §05 §5   — CSS in AppTheme.ts (ph- prefix)
 *   §05 §7.6 — No independent <style> injection
 *   §01      — Zero BIM engine interaction
 *   §06 §7   — Project reads/writes via projectRepository (single source of truth)
 *
 * CDE Phase 4 additions:
 *   • Sidebar sections: All Projects (with count), Starred, Recent, Archived
 *   • Sort/filter bar: sort by name / date / version count
 *   • Context menu on project cards: Rename, Duplicate, Star/Unstar, Archive, Delete
 *   • Delete / Archive confirmation modals
 *   • Description field in "New Project" modal
 *   • Empty states for each section
 *   • Owner plan badge (no upgrade button for owner)
 *
 * Class prefix: ph-  (Project Hub)
 */

import { trace } from '@opentelemetry/api';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { injectAppTheme } from '../styles/AppTheme';
import { PlatformUser, signOut } from './AuthModal';
import { projectRepository, versionRepository, ProjectMeta, warmThumbnailCache, warmVersionCache, probeCachedThumbnail, seedCachedThumbnail } from './ProjectRepository';
import { decideLocalOnlyProjectFate } from './localOnlyProjectFate';
// §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — the server list is a PAGE (50 rows,
// `server/projectStore.js`). Absence from it is not absence from the server, and
// this module is the gate that keeps the two apart. See its header for the
// founder's 50-of-50 reading that made the distinction unavoidable.
import { assessListCompleteness, mayConcludeAbsence, describeCompleteness, type ListCompleteness } from './serverListCompleteness';
// §FIX-THUMBNAIL-DURABILITY — thumbnail residency is reconciled on EVERY sync,
// independently of the metadata-freshness gate below. See thumbnailReconcile.ts
// for the full evidence chain; in short: sign-out deletes the IndexedDB preview
// cache by design, the (non-pryzm-prefixed) metadata index survives it, and the
// old code could only adopt the durable server copy inside the freshness gate —
// which is false for exactly the unchanged projects whose cache was just wiped.
import { planThumbnailReconcile, describeThumbnailResolution } from './thumbnailReconcile';
import {
    uploadProjectThumbnail, describeUploadOutcome,
    // §SUSTAIN109 (L-10405) — the READ leg: previews leave the list response and are
    // fetched per card, lazily, after the grid is interactive.
    downloadProjectThumbnail, describeDownloadOutcome,
} from './thumbnailUpload';
import { EntitlementStore } from '@pryzm/core-app-model';
import { getPlanDisplayName, PLAN_LIMITS } from '@pryzm/core-app-model';
import { ProjectMemberPanel, ProjectMember, MemberLoadResult } from './ProjectMemberPanel';
import { CDERole } from '@pryzm/protocol';
import { apiFetch } from '@pryzm/core-app-model';
import { OwnerSettingsPanel } from './OwnerSettingsPanel';
import type { ProjectSummary } from '@pryzm/stores';
import { renderShell as phRenderShell, renderSidebar as phRenderSidebar, sectionLabel as phSectionLabel, renderGrid as phRenderGrid } from './ProjectHubTemplates';
import { generateUntitledSiteName } from './projectAutoName';
// §STARTUP-BUDGET (L-10722) / §PERF100 (L-11440) — the EXISTING instrument, not a rival
// timer. The founder's 2026-08-25 log had a 44.2 s hole between `runtime:composed` and
// `boot:ensure-requested` with NOTHING named inside it, and everything the console showed
// happening in there was hub work. These marks bracket every leg of that work so the next
// reading names the culprit instead of leaving it to inference. ⛔ Marks only — no leg is
// gated, delayed, retried or skipped because of one.
import { markStartupPhase } from '../../engine/startupBudget';
// §PERF104 (L-11540) — the yielding runner and the residency-verdict vocabulary. The
// audit and the preview back-fill are corpus maintenance; they must not sit on the
// critical path of opening ONE project, and a deferral that could not SAY it had not
// concluded would silently restore the wrong answer L-10400 exists to prevent.
import { runDeferred, yieldToMacrotask, describeResidencyAudit } from './hubDeferredWork';

const _tracer = trace.getTracer('pryzm.platform.projectHub');

// ── Helpers ──────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'name' | 'versions' | 'custom';
type HubSection = 'all' | 'starred' | 'recent' | 'archived';

export { generateUntitledSiteName };

// ── Public interface ──────────────────────────────────────────────────────────

export interface ProjectHubCallbacks {
    onOpenProject: (projectId: string, projectName: string, opts?: { isNewProject?: boolean }) => void;
    onSignOut: () => void;
    /** Called when user clicks "Upgrade" — opens the pricing page */
    onUpgrade?: () => void;
    /**
     * O.5 (ONBOARDING-WORKFLOW-DESIGN §6 O.5) — launch the guided RAC onboarding
     * flow seeded by the New-Project modal (name + project type), INSTEAD of a
     * blank create. The host (PlatformRouter) routes this to `showOnboarding(seed)`;
     * the RAC conversation + briefBootstrap then create+open the project and run
     * site → generate. When absent (defensive / null-runtime), the hub falls back
     * to the legacy blank create so "New Project" never dead-ends.
     *
     * PRYZM-EARTH-ONBOARDING PRD Phase 2 (2026-08-06, founder-confirmed override
     * of the Phase 1 §13.3 deferral) — `directEntry: true` marks the no-modal
     * "+ New Project" gesture (`startGuidedOnboardingDirect`). The host
     * (`PlatformRouter.showOnboarding`) treats this as an explicit instruction to
     * skip the RAC role/typology chat entirely and land straight on the
     * `location` step (PRYZM Earth). It is NOT set by the legacy modal-seeded
     * path (`handleCreate('guided')`) or the anonymous "Build something" RAC
     * entry, both of which still show RAC as before.
     */
    onStartOnboarding?: (seed?: { name?: string; projectType?: string; directEntry?: boolean }) => void;
}

// ── ProjectHub class ──────────────────────────────────────────────────────────

export class ProjectHub {
    private root: HTMLElement;
    private el: HTMLElement;
    private user: PlatformUser;

    private currentSection: HubSection = 'all';
    private currentSort: SortKey = 'date';
    private searchQuery = '';

    // Context menu state
    private ctxMenuEl: HTMLElement | null = null;

    // ── §PERF104 (L-11540) — the deferral state ───────────────────────────────
    /**
     * The whole-corpus IndexedDB version-mirror warm. Held as a FIELD, not awaited
     * inline, so the two places L-148 and §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION
     * actually depend on it can await it while the grid paint and the server list
     * do not. See `_warmThenSync` F1.
     */
    private _versionWarm: Promise<void> | null = null;
    /**
     * ⭐ TRUE FROM THE MOMENT THE USER CLICKS A CARD. Every deferred maintenance
     * task checks this before each chunk and stops. This is the whole mechanism by
     * which corpus maintenance leaves the open path: not a shorter debounce, not a
     * spinner — the work genuinely stops running while an open is in flight, and
     * resumes on the next hub mount (a gesture the user makes constantly).
     */
    private _openInFlight = false;
    /** Set by {@link destroy}; a superseded hub must not keep auditing. */
    private _destroyed = false;
    /**
     * §FIX-THUMBNAIL-DURABILITY back-fills COLLECTED rather than fired. The repair is
     * unchanged and is NOT dropped — it is simply sent one connection at a time,
     * after the grid is interactive. See `_runDeferredMaintenance`.
     */
    private _pendingThumbBackfill: Array<{ projectId: string; value: string }> = [];
    /**
     * §SUSTAIN109 (L-10405) — previews the server HOLDS but the list did not carry
     * (`has_thumbnail` + `thumbnail_url`, no bytes). Fetched one connection at a
     * time after the grid is interactive, then seeded into the local cache exactly
     * as the inline-bytes leg seeds it. Same durability story as before: the
     * bytes are the server's; what changed is WHEN and per WHAT they travel.
     */
    private _pendingThumbFetch: Array<{ projectId: string; url: string }> = [];

    // Phase 10: Platform Owner Settings
    private readonly _ownerSettingsPanel = new OwnerSettingsPanel();

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(root: HTMLElement, user: PlatformUser, private callbacks: ProjectHubCallbacks, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.root = root;
        this.user = user;
        injectAppTheme();
        this.el = this.build();
        this.root.appendChild(this.el);
        // §HUB-THUMBNAIL-STORAGE (2026-06-24) — warm the IndexedDB thumbnail mirror
        // (and migrate any legacy inline thumbnails out of the localStorage index)
        // BEFORE the first server sync, then re-render so previews appear. Thumbnail
        // bytes no longer live in the project index, so the synchronous card render
        // reads them from this mirror; warming populates it once per session.
        // §VERSION-QUOTA-INDEXEDDB (2026-06-25) — warm the IndexedDB version mirror
        // (and migrate any legacy localStorage version stores) on hub mount so the
        // synchronous auto-restore read at project-open surfaces local history that
        // is now too large for localStorage.
        // §FIX-LOCALSTORAGE-QUOTA-RESIDUAL (L-148) — BOTH migrations must COMPLETE
        // before the first server-sync `saveProject*` write. The version migration
        // used to be fire-and-forget, so the sync's index writes raced it: the heavy
        // legacy `bim-project-<id>-versions` blobs were still in localStorage when the
        // index write fired, yielding "quota exceeded — eviction exhausted" once per
        // project. Awaiting both warms relocates that bloat into IndexedDB (and strips
        // inline thumbnails) FIRST, so the single reconcile write lands in a lean
        // localStorage.
        // ⚠ §FIX-PREVIEW-WAITS-ON-VERSION-HISTORY (L-10402) — the two warms now run
        // CONCURRENTLY rather than in series. L-148's invariant is unchanged (both
        // settle before the first sync write); what changed is that the grid repaint
        // no longer waits for the version warm. See `_warmThenSync`.
        void this._warmThenSync();
    }

    /**
     * §FIX-LOCALSTORAGE-QUOTA-RESIDUAL — await the version + thumbnail migrations,
     * THEN reconcile with the server. Sequencing (not fire-and-forget) guarantees
     * the legacy blobs are migrated out of localStorage before the first index write.
     * Never throws — each leg degrades independently (server/version fallbacks cover
     * a cold cache).
     */
    private async _warmThenSync(): Promise<void> {
        // ── §FIX-PREVIEW-WAITS-ON-VERSION-HISTORY (L-10402) ──────────────────
        //
        // ⭐ THE ~1 SECOND OF PLACEHOLDER CARDS. The founder: *"it looks like a
        // bug"* — the hub paints "BIM Project" skeletons, then ~1 s later the real
        // previews. The cause is this function's ORDER, and nothing else.
        //
        // MEASURED (the mechanism, from the code): `warmVersionCache()` opens a
        // cursor over EVERY row of the `versions` object store and materialises
        // each project's entire compressed version container into a `Map`
        // (`VersionCacheStore.warm()`). `warmThumbnailCache()` was `await`ed
        // strictly BEHIND that, and the first repaint behind that again. So the
        // previews were gated on reading the complete version history of every
        // project the user has ever made — which the grid does not use at all.
        //
        // ⚠ ESTIMATED (the magnitude, and stated separately on purpose): ~100
        // projects of up to 45 versions each. The §JOURNAL-SIDECAR work (L-9980,
        // 2026-08-23) cut the container 14.8× — 34.33 MB → 2.32 MB at the
        // founder's largest project — so this is materially cheaper than it was
        // last week, and the residual cost here is NOT measured. ⭐ The fix does
        // not depend on the magnitude: the grid has no use for version history at
        // any size, so the dependency is pure cost whatever it currently is.
        //
        // ⛔ NOT the fix, and worth stating because it is the intuitive one: the
        // console line `0 painted from the durable server column` does NOT mean
        // the durable path is dead, and painting FROM the server would be
        // strictly SLOWER — a network round-trip in place of an in-memory mirror
        // read. That line is the correct output of a warm cache; the note at
        // §FIX-THUMBNAIL-DURABILITY / L-1283 below already says so.
        //
        // ⛔ Nor is removing the skeleton the fix. The placeholder lives inside
        // the same `.ph-card-thumb` box as the real `<img>`
        // (`ProjectHubTemplates.ts:435-441`), so the swap costs no reflow — an
        // empty card would be strictly worse. Make the real content ARRIVE
        // sooner instead.
        //
        // ⚠ L-148 IS PRESERVED EXACTLY. Its invariant is that BOTH migrations
        // complete before the first server-sync `saveProject*` index write — not
        // that they run in series, and not that the paint waits for them. The two
        // warms touch disjoint storage (`pryzm-project-thumbnails` +
        // `bim-projects-index` vs `pryzm-project-versions` +
        // `bim-project-<id>-versions`), so running them concurrently is safe, and
        // `syncFromServer()` still runs only after BOTH have settled.
        // ── §PERF104 (L-11540) — F1: THE WARM IS AWAITED AT ITS POINTS OF NEED ──
        //
        // ⚠ L-148's INVARIANT, READ EXACTLY. It is *"both migrations complete before
        // the first server-sync `saveProject*` **WRITE**"* — NOT "before the sync
        // starts". The old line `await versionWarm; await this.syncFromServer();`
        // enforced the stronger proxy, and the cost of the proxy is that the server
        // list round-trip queues behind reading EVERY project's version container.
        // Opening one project cannot be a function of how many OTHER projects exist;
        // it was, and this is the line that stops it.
        //
        // The warm is now held as a field and awaited at the TWO places the invariant
        // actually names:
        //   · `_reconcileFromServer`, immediately before `saveProjectsBatch` — the
        //     write L-148 is about;
        //   · `_auditLocalOnlyResidency`, before its first probe — and there it is
        //     CORRECTNESS, not politeness (see F3 in that method).
        //
        // ⭐ MEASURED, and honestly: on the founder's 2026-08-26 run this leg was
        // `hub:warm-versions-done +93 ms` and the sync behind it ~509 ms, so the win
        // here is on the order of ~0.6 s of the ~1.4 s of serialized hub work ahead
        // of the first possible click. It is NOT the 40 s of the 2026-08-25 report —
        // that reading contained un-split human dwell and is not reproduced.
        markStartupPhase('hub:warm-start');
        this._versionWarm = warmVersionCache()
            .then(() => { markStartupPhase('hub:warm-versions-done'); })
            .catch(() => { /* non-fatal — server version fallback covers cold reads */ });
        const thumbWarm = warmThumbnailCache().catch(() => { /* non-fatal — server thumbnailUrl / placeholder still render */ });

        // Repaint the moment the previews are available, WITHOUT waiting for the
        // version history. This is the line that removes the flash.
        await thumbWarm;
        markStartupPhase('hub:warm-thumbs-done');
        this.refreshGrid();
        markStartupPhase('hub:grid-painted');

        // ⛔ NO `await this._versionWarm` here any more. See F1 above.
        await this.syncFromServer();
    }

    // ── Build ─────────────────────────────────────────────────────────────────

    private build(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'ph-shell';
        el.innerHTML = this.renderShell();
        this.attachListeners(el);
        return el;
    }


    private _asCtx(): import('./ProjectHubTemplates').PhRenderCtx {
        return {
            currentSection: this.currentSection,
            currentSort: this.currentSort,
            searchQuery: this.searchQuery,
            user: this.user,
        };
    }

    /**
     * Fetches the project list from the server and reconciles it with the
     * localStorage cache.
     *
     * Wireup (chunks/22 §22.1 step 1.5 — Flow 1 — Landing → Signup → Hub):
     *   Architectural leg = `runtime.persistence.client.list()` (S28 D2,
     *   typed `ProjectListClient.list(): Promise<ProjectSummary[]>`).
     *   The hub now reads via the typed client whenever the runtime is
     *   threaded — the legacy `apiFetch('/api/projects')` v0 read path
     *   is the fallback for the (vanishing) null-runtime call sites.
     *
     * Both paths converge on the same server-side `pgProjectStore`
     * projection and feed the same `projectRepository` localStorage
     * cache that powers offline UX + per-card chip rendering — only the
     * adapter changes.  Reconciliation rules (server = source of truth;
     * stale local-only entries with no version data are purged; entries
     * with local versions are preserved for offline) are unchanged.
     */
    private async syncFromServer(): Promise<void> {
        markStartupPhase('hub:sync-start');
        try {
            const reading = await this._fetchSummaries();
            markStartupPhase('hub:sync-fetch-done');
            if (reading === null) return;
            const { summaries, completeness } = reading;

            // §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — ⭐ THE AUTHORITY GATE.
            //
            // `serverIds` is a set of the rows the server CHOSE TO SEND, not of
            // the rows it holds. Every list path is capped (50 by default), so
            // `!serverIds.has(id)` means "not in this page" — and only when the
            // page is a complete enumeration does that also mean "not on the
            // server". `canConcludeAbsence` is that distinction, and the purge
            // branch below is now the only consumer of `serverIds` that may act
            // on absence.
            const canConcludeAbsence = mayConcludeAbsence(completeness);
            const serverIds = new Set(summaries.map(s => s.id));

            // §FIX-LOCALSTORAGE-QUOTA-RESIDUAL (L-148) — accumulate ALL reconcile
            // mutations (upserts + purges) and apply them in a SINGLE index write via
            // `saveProjectsBatch`, instead of one full-index `saveProject`/`deleteProject`
            // write (and one potential quota warn) per project. A 50-project sync now
            // performs exactly ONE `bim-projects-index` write.
            const upserts: ProjectMeta[] = [];
            const deleteIds: string[] = [];

            // Snapshot the local index ONCE (was re-read per iteration before).
            const localById = new Map(projectRepository.listProjects().map(lp => [lp.id, lp]));

            // ── §FIX-THUMBNAIL-DURABILITY — reconcile preview residency FIRST, ──
            // for EVERY server row, before and independently of the
            // metadata-freshness gate below.
            //
            // This is the actual fix for "previews disappear after logout →
            // login". Thumbnail bytes live only in IndexedDB
            // (`pryzm-project-thumbnails`, §HUB-THUMBNAIL-STORAGE) and
            // `signOut()` deletes every pryzm-prefixed IDB database by design
            // (§AUTH-SESSION-LEAK — that security fix stays). The metadata index
            // `bim-projects-index` is NOT pryzm-prefixed, so it survives with
            // `updatedAt` still equal to the server's `updated_at` — which is
            // exactly why names, timestamps and version counts came back correct
            // while every preview was blank. The ONLY code that could re-adopt
            // the durable server copy used to sit inside
            // `existing.updatedAt < lastModifiedAt`, false for every unchanged
            // project, so the row was skipped whole and the preview never
            // returned. Residency is a property of the local CACHE, not of
            // metadata freshness; per C05 the server is authoritative for
            // durable project state and the client store is a cache that must be
            // reconstructible from it.
            const thumbPlan = planThumbnailReconcile(summaries, probeCachedThumbnail);
            const resolvedThumbById = new Map<string, string | undefined>();
            for (const r of thumbPlan) {
                resolvedThumbById.set(r.projectId, r.value);
                // Server had it, cache did not → repopulate the cache so the
                // synchronous card render finds it on the next paint.
                if (r.seedLocalCache && r.value) seedCachedThumbnail(r.projectId, r.value);
                // Cache had it, the durable column did not → push it up. Self-heals
                // every project whose original upload was lost (413 / plan-gated /
                // offline at capture time) WITHOUT the user reopening the model, so
                // the NEXT sign-out is survivable.
                //
                // ⚠ §PERF104 (L-11543) — F4: COLLECTED, NOT FIRED HERE. This line used
                // to `void uploadProjectThumbnail(...)` INSIDE the loop: up to fifty
                // concurrent POSTs of base64 image data to one origin, at hub mount.
                // A browser allows ~6 connections per host, so the seventh onward
                // queue — and the requests that queue behind them include the two the
                // OPEN path needs (`controller.refresh()` and `tier.streamLoad()`).
                // A repair pass for PREVIEWS was able to delay the PROJECT the user
                // asked for, over a resource neither of them declares.
                //
                // ⛔ THE REPAIR IS NOT DROPPED. Dropping it re-opens
                // §FIX-THUMBNAIL-DURABILITY — the whole point of that fix is that a
                // preview lost to a 413 / plan-gate / offline capture self-heals
                // WITHOUT the user reopening the model. Same repair, same rows, same
                // self-heal; one connection at a time, after the grid is interactive,
                // and paused the instant an open begins.
                if (r.backfillToServer && r.value) {
                    this._pendingThumbBackfill.push({ projectId: r.projectId, value: r.value });
                }
                // §SUSTAIN109 (L-10405) — the server holds bytes the cache lacks and
                // the list carried only their URL. Collected, never fetched here: the
                // same connection-budget reasoning as the back-fill above, applied to
                // the read leg. Fifty previews used to arrive INSIDE the list body
                // before a card could paint; now the grid paints from the local cache
                // first and the missing previews fill in one at a time.
                if (r.fetchFromServer && r.serverUrl) {
                    this._pendingThumbFetch.push({ projectId: r.projectId, url: r.serverUrl });
                }
            }

            markStartupPhase('hub:sync-thumbs-done');

            // ── Add / update entries from the server ──────────────────────────
            for (const s of summaries) {
                if (!s.id || !s.name) continue;
                const existing = localById.get(s.id);
                const serverUpdatedAt = Date.parse(s.lastModifiedAt);
                const lastModifiedAt = Number.isFinite(serverUpdatedAt) ? serverUpdatedAt : Date.now();
                if (!existing || existing.updatedAt < lastModifiedAt) {
                    // §FIX-THUMBNAIL-DURABILITY — take the value the reconciliation
                    // pass already resolved (local cache > durable server column)
                    // rather than re-deriving it from `existing.thumbnail`, which is
                    // itself only a rehydration of the same cache.
                    const resolvedThumbnail = resolvedThumbById.get(s.id);
                    upserts.push({
                        id: s.id,
                        name: s.name,
                        updatedAt: lastModifiedAt,
                        versionCount: s.versionCount ?? 0,
                        ownerId: s.ownerName,
                        createdAt: existing?.createdAt ?? lastModifiedAt,
                        thumbnail:    resolvedThumbnail,
                        // Server is authoritative for these chips (Phase C
                        // §16.3 C.4.03/04/05).  Falls back to the local cached
                        // value when the server response omits the field
                        // (older REST responses pre-Phase C).
                        isStarred:    s.isStarred ?? existing?.isStarred,
                        isArchived:   s.isArchived ?? existing?.isArchived,
                        description:  (s.description ?? undefined) ?? existing?.description,
                        projectType:  existing?.projectType,
                        cdeSummary:   existing?.cdeSummary,
                        // §SHARE101 / §PERF104 (L-11547) — the share label, carried
                        // through with its THREE states intact. `?? existing?.sharedWithMe`
                        // keeps a previously-known label when THIS response omitted the
                        // field (an older server), rather than downgrading a known `true`
                        // to unknown; it does NOT invent one.
                        sharedWithMe: (s as { sharedWithMe?: boolean | null }).sharedWithMe ?? existing?.sharedWithMe,
                    });
                    // §FIX-THUMBNAIL-DURABILITY / §CONTEXT-DATA-HONESTY — the old
                    // line said `thumbnail: none`, which could not distinguish
                    // "never captured", "cache purged but the server has it",
                    // "server value unusable" and "the cache read threw". That
                    // ambiguity is what made this bug take a founder report to
                    // find. The resolution now names the SOURCE, and on absence
                    // the REASON, and on repair the action being taken.
                    const _res = thumbPlan.find(r => r.projectId === s.id);
                    console.log(`[ProjectHub] Synced project "${s.name}" (${s.id}) — thumbnail: ${_res ? describeThumbnailResolution(_res) : 'absent (not-in-plan)'}`);
                }
            }

            // ── §PERF104 (L-11540) — F2: THE RESIDENCY AUDIT LEAVES THIS FUNCTION ──
            //
            // ⭐ WHAT MOVED, AND — MORE IMPORTANTLY — WHAT DID NOT.
            //
            // The audit below used to run HERE, inside the reconcile, as ONE
            // uninterrupted `for` over every local row the server page did not name:
            // 77 of them on the founder's account. Measured at that scale
            // (`__tests__/perf104OpenPath.spec.ts`) it is **109 ms in a single
            // main-thread task** — and a single task is exactly what a click cannot
            // interrupt. It is also maintenance of projects the user is NOT opening,
            // sequenced ahead of the one they asked for.
            //
            // ⛔ THE RULING IS UNCHANGED AND IS NOT WEAKENED. `mayConcludeAbsence`,
            // `decideLocalOnlyProjectFate` and `probeVersions` are called with exactly
            // the same inputs, in the same order, on the same rows. The ONLY change is
            // WHEN and in HOW MANY TASKS. A deferral that skipped the audit, or that
            // relaxed a gate to make it cheap, would be a regression wearing a fix's
            // name — so the deferred pass reports **UNDETERMINED**, loudly and by
            // reason, whenever it cannot finish. Absence is still never concluded from
            // a page (§FIX-A-PAGE-IS-NOT-AN-INVENTORY, L-10400), and not-having-looked
            // is still never allowed to read as "nothing there".
            const localOnlyIds: ProjectMeta[] = [];
            for (const lp of localById.values()) {
                if (!serverIds.has(lp.id)) localOnlyIds.push(lp);
            }
            void this._auditLocalOnlyResidency(localOnlyIds, canConcludeAbsence, completeness);
            console.log(
                `[ProjectHub] §FIX-A-PAGE-IS-NOT-AN-INVENTORY server list: ${describeCompleteness(completeness)} — ` +
                `absence ${canConcludeAbsence ? 'IS' : 'is NOT'} concludable from it.`,
            );

            // §FIX-THUMBNAIL-DURABILITY / §CONTEXT-DATA-HONESTY — one census line
            // for the WHOLE plan, so projects the freshness gate skipped (exactly
            // the ones whose purged preview was just restored) are still visible
            // in the console. Without this, a fully-restored hub would log
            // nothing at all and the repair would be unobservable.
            const _seeded = thumbPlan.filter(r => r.seedLocalCache).length;
            const _backfilled = thumbPlan.filter(r => r.backfillToServer).length;
            const _absent = thumbPlan.filter(r => r.source === 'absent');
            // §FIX-THUMBNAIL-DURABILITY / L-1283 — REPORT THE DURABILITY, NOT ONLY
            // THE SOURCE THIS BOOT USED.
            //
            // ⚠ WHY THIS COUNTER EXISTS. The founder read a production line saying
            // `0 from the durable server column (0 seeded), 0 backfilled` and
            // reasonably concluded the durable path was dead. It was not — that is
            // the CORRECT output of a warm cache, because `resolveProjectThumbnail`
            // puts LOCAL first by design. `source` answers "where did this paint
            // come from TODAY", which on every boot after the first is "local", and
            // says nothing about whether the preview would survive a sign-out.
            //
            // The durability fact was only ever inferable BACKWARDS, from the
            // backfill count (`backfillToServer` is exactly `!serverOk` on a
            // local-cache row) — a derivation no reader should have to perform to
            // find out whether a fix named "durability" is working. So state it:
            // a row is durable when the SERVER holds usable bytes, whichever copy
            // was painted.
            // §SUSTAIN109 (L-10405) — `server-remote` rows are DURABLE too: the server
            // holds the bytes; the list simply no longer carries them. They paint
            // after the deferred fetch below seeds the cache, and the line says so.
            const _remote = thumbPlan.filter(r => r.source === 'server-remote').length;
            const _durable = thumbPlan.filter(
                r => r.source === 'server' || r.source === 'server-remote'
                    || (r.source === 'local-cache' && !r.backfillToServer),
            ).length;
            console.log(
                `[ProjectHub] §FIX-THUMBNAIL-DURABILITY thumbnails: ${thumbPlan.length} row(s) — ` +
                `${_durable} DURABLE (server holds usable bytes; these survive sign-out) — ` +
                `${thumbPlan.filter(r => r.source === 'local-cache').length} painted from local cache, ` +
                `${thumbPlan.filter(r => r.source === 'server').length} painted from the durable server column ` +
                `(${_seeded} seeded into the local cache), ` +
                `${_remote} held by the server and queued for a per-card fetch (§SUSTAIN109 — no bytes in the list), ` +
                `${_backfilled} backfilled to the server, ` +
                `${_absent.length} absent [${[...new Set(_absent.map(r => r.reason))].join(', ') || 'n/a'}]`,
            );

            if (upserts.length > 0 || deleteIds.length > 0) {
                // ⭐ §PERF104 (L-11540) — F1, THE POINT OF NEED. §FIX-LOCALSTORAGE-QUOTA-
                // RESIDUAL (L-148) requires that BOTH migrations have completed before
                // the first server-sync `saveProject*` WRITE — because the heavy legacy
                // `bim-project-<id>-versions` blobs must be out of localStorage before
                // this index write lands, or it hits "quota exceeded — eviction
                // exhausted" once per project. THIS is that write, and this is where the
                // await belongs. Awaiting it at the top of the sync (as the code did
                // until this lane) enforced a strictly stronger condition and put a
                // whole-corpus IndexedDB read in front of a network round trip that the
                // open path also needs.
                if (this._versionWarm !== null) await this._versionWarm;
                projectRepository.saveProjectsBatch(upserts, deleteIds);
                console.log(`[ProjectHub] Synced with server: ${summaries.length} project(s)`);
                this.refreshSidebar();
                this.refreshGrid();
            } else if (_seeded > 0) {
                // The metadata index is unchanged (this IS the logout→login case:
                // timestamps identical, so nothing to upsert) but previews were
                // just restored into the cache the card render reads. Repaint, or
                // the restored thumbnails would not appear until the next reload.
                this.refreshGrid();
            }
        } catch (err) {
            // §SERVER-500-CLIENT-VISIBILITY (Round 39) — surface the server
            // response body too so the architect sees errorId + code in the
            // browser console for support correlation. Round 39 already
            // landed the errorId in the error message (see
            // ProjectListClient.ts), but also logging the full body lets
            // the architect right-click → Copy the entire envelope without
            // having to expand the error object first.
            console.warn('[ProjectHub] Server sync failed (offline?):', err);
            const errBody = (err as { body?: unknown })?.body;
            if (errBody) {
                console.warn('[ProjectHub] server response body:', errBody);
            }
        } finally {
            markStartupPhase('hub:sync-done');
            // §PERF104 (L-11543) — F4. The grid is interactive; the preview repair may
            // now use the connection budget it was previously competing for.
            // §SUSTAIN109 (L-10405) — the FETCH leg first (it is what fills the blank
            // cards after a sign-out), then the back-fill; both one connection at a
            // time, both stopping the instant an open begins.
            void this._drainThumbnailFetch().then(() => this._drainThumbnailBackfill());
        }
    }

    /**
     * §SUSTAIN109 (L-10405) — fetch the previews the server holds but the list no
     * longer carries, one at a time, and seed the local cache with each.
     *
     * Mirrors `_drainThumbnailBackfill` deliberately: same `runDeferred`, same
     * chunk size of ONE, same open-in-flight stop, same "paused, not dropped"
     * statement. One repaint at the end (not one per preview) so fifty cards do
     * not cost fifty `innerHTML` rebuilds; a paused drain repaints what it managed.
     */
    private async _drainThumbnailFetch(): Promise<void> {
        const queue = this._pendingThumbFetch;
        if (queue.length === 0) return;
        this._pendingThumbFetch = [];
        let seeded = 0;
        const run = await runDeferred(queue, async (row) => {
            const outcome = await downloadProjectThumbnail(row.url);
            if (outcome.ok) {
                seedCachedThumbnail(row.projectId, outcome.dataUrl);
                seeded++;
            }
            console.log(`[ProjectHub] §SUSTAIN109 thumbnail fetch ${row.projectId}: ${describeDownloadOutcome(outcome)}`);
        }, {
            chunkSize: 1,
            isOpenInFlight: () => this._openInFlight,
            isDestroyed: () => this._destroyed,
            onError: (row, err) => {
                console.warn(`[ProjectHub] §SUSTAIN109 thumbnail fetch ${row.projectId} threw (will retry next hub mount):`, err);
            },
        });
        if (seeded > 0 && !this._destroyed) this.refreshGrid();
        if (!run.complete) {
            console.log(
                `[ProjectHub] §SUSTAIN109 thumbnail fetch PAUSED after ${run.processed} of ${queue.length} ` +
                `(${run.stoppedBecause}) — the remaining ${run.remaining} are NOT lost: the plan is recomputed on ` +
                'the next hub mount.',
            );
        }
    }

    /**
     * §PERF104 (L-11540) — the local-only residency audit, off the open critical path.
     *
     * ⛔ THIS METHOD IS THE ONE PLACE A PROJECT ROW MAY BE DELETED, and every guard the
     * inline version carried is carried here VERBATIM. Read the three that matter:
     *
     * F3 — **it awaits the version warm FIRST, and that is CORRECTNESS, not politeness.**
     *   On an unwarmed store every `probeVersions` returns `unreadable/cache-not-warmed`,
     *   every fate is `refuse`, and the hub prints the sign-out-damage warning for a
     *   corpus that is perfectly intact (`localOnlyProjectPurgeSafety.test.ts:189`).
     *   Deferring the audit WITHOUT this await would be faster and wrong.
     *
     * §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — `canConcludeAbsence` is passed in
     *   already computed from the SAME `completeness` the reconcile saw. When it is
     *   false NOTHING is probed and NOTHING is claimed: the rows are reported as
     *   residency-UNDETERMINED, exactly as before. A ruling drawn from an inadmissible
     *   premise is not a safer ruling; it is the same error with a decision attached.
     *
     * §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION (L-1289) — the purge branch is still
     *   `decideLocalOnlyProjectFate`'s `purge`, never a count comparison. `probeVersions`
     *   can say *"I could not look"*, and the ruling deletes only when the STORE and the
     *   INDEX ROW agree there is nothing.
     *
     * ⭐ AND THE NEW HONESTY OBLIGATION THE DEFERRAL CREATES: an audit that stops early
     * — because the user opened a project, or because the hub was replaced — has NOT
     * established that the unexamined rows are present, absent, or safe. It reports
     * UNDETERMINED with the reason and the unexamined count. Silence would be the
     * defect: "never ran" and "found nothing" must not print the same value.
     */
    private async _auditLocalOnlyResidency(
        localOnly: readonly ProjectMeta[],
        canConcludeAbsence: boolean,
        completeness: ListCompleteness,
    ): Promise<void> {
        if (localOnly.length === 0) {
            markStartupPhase('hub:sync-residency-done');
            return;
        }

        // §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — the page did not enumerate the
        // server, so absence is not a fact about the server. No purge, no
        // "exists only in this browser" claim, no version probe. Unchanged.
        if (!canConcludeAbsence) {
            markStartupPhase('hub:sync-residency-done');
            console.warn(
                `[ProjectHub] §FIX-A-PAGE-IS-NOT-AN-INVENTORY — ${localOnly.length} local project(s) are ` +
                `NOT IN THIS PAGE of the server list, and the list is ${describeCompleteness(completeness)}. ` +
                `${describeResidencyAudit({ kind: 'undetermined', reason: 'page-not-an-inventory', examined: 0, unexamined: localOnly.length })} ` +
                `(GET /api/v1/projects?limit=&offset=, L-10400). ids: ${localOnly.map(p => p.id).join(', ')}`,
            );
            return;
        }

        // F3 — the await that makes the ruling meaningful. See the header.
        if (this._versionWarm !== null) await this._versionWarm;
        // One macrotask before the first probe, so the reconcile's repaint lands and
        // any click already queued is dispatched before this pass takes the thread.
        await yieldToMacrotask();

        const localOnlyWithVersions: string[] = [];
        const refusedToPurge: string[] = [];
        const deleteIds: string[] = [];

        const run = await runDeferred(localOnly, (lp) => {
            // ⚠ The L-1300 performance property is PRESERVED: `probeVersions` reads the
            // same v2/v3 envelope `countVersions` does — no inflate, no snapshot parse.
            const fate = decideLocalOnlyProjectFate({
                projectId: lp.id,
                indexVersionCount: lp.versionCount,
                probe: versionRepository.probeVersions(lp.id),
            });
            if (fate.action === 'keep') { localOnlyWithVersions.push(lp.id); return; }
            if (fate.action === 'refuse') {
                refusedToPurge.push(lp.id);
                console.warn(`[ProjectHub] §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION refusing to purge — ${fate.detail}`);
                return;
            }
            console.log(`[ProjectHub] Purging empty stale local project ${lp.id} (not on server, no local data, index agrees)`);
            deleteIds.push(lp.id);
        }, {
            chunkSize: 8,
            isOpenInFlight: () => this._openInFlight,
            isDestroyed: () => this._destroyed,
            onError: (lp, err) => {
                // ⛔ An unreadable row must not abandon the other seventy-six, and it
                // must not be counted as "nothing there" either — it is simply not
                // ruled on, which leaves the row in place. Refusing is the safe arm.
                console.warn(`[ProjectHub] §PERF104 residency probe threw for ${lp.id} — row KEPT, not ruled on:`, err);
                refusedToPurge.push(lp.id);
            },
        });

        markStartupPhase('hub:sync-residency-done');

        // ⛔ THE PURGE IS APPLIED ONLY OVER ROWS THAT WERE ACTUALLY EXAMINED. A partial
        // run purges what it ruled on and says so; it never extrapolates to the rest.
        // §FIX-LOCALSTORAGE-QUOTA-RESIDUAL (L-148) — at most ONE additional full-index
        // write, and only when something was genuinely purged. Two writes on a rare
        // path is not the fifty-writes-plus-fifty-quota-warns defect L-148 was raised
        // against.
        if (deleteIds.length > 0) projectRepository.saveProjectsBatch([], deleteIds);

        console.warn(
            `[ProjectHub] §PERF104 residency audit — ${describeResidencyAudit(
                run.complete
                    ? {
                        kind: 'concluded', examined: run.processed, purged: deleteIds.length,
                        keptWithLocalVersions: localOnlyWithVersions.length, refused: refusedToPurge.length,
                    }
                    : {
                        kind: 'undetermined',
                        reason: run.stoppedBecause === 'surface-destroyed' ? 'surface-destroyed' : 'paused-project-open',
                        examined: run.processed, unexamined: run.remaining,
                    },
            )} (${run.chunks} task(s), not one block)`,
        );

        if (refusedToPurge.length > 0) {
            console.warn(
                `[ProjectHub] §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION — ${refusedToPurge.length} project(s) were ` +
                'KEPT that the previous code would have DELETED: their index rows claim version history the ' +
                'version store no longer holds, or the store could not be read at all. This is the signature ' +
                'of the sign-out / account-switch IndexedDB purge. The rows survive so the loss stays visible ' +
                `and recoverable. ids: ${refusedToPurge.join(', ')}`,
            );
        }

        // ── §PROBE-LOCAL-ONLY-VERSION-EXPOSURE (L-1288) ────────────────────────
        //
        // ⭐ SHIP THE PROBE BEFORE THE FIX. Not cosmetic: the keep-branch above is
        // CORRECT — it protects offline and free-plan work — but that work lives in
        // `pryzm-project-versions`, an IndexedDB database `purgeUserScopedClientState`
        // deletes on sign-out and account switch by design (§AUTH-SESSION-LEAK, and
        // that security fix must stay), while the non-prefixed `bim-projects-index`
        // SURVIVES. So a local-only project with history is silently lost one sign-out
        // later. The durable fix is a server back-fill and is real work; what ships
        // here is the measurement, because an exposure nobody can see cannot be
        // prioritised. Deliberately `console.warn`.
        if (localOnlyWithVersions.length > 0) {
            console.warn(
                `[ProjectHub] §PROBE-LOCAL-ONLY-VERSION-EXPOSURE — ${localOnlyWithVersions.length} project(s) ` +
                'exist ONLY in this browser: they are absent from the server and their version history is in ' +
                'IndexedDB `pryzm-project-versions`, which sign-out and account-switch DELETE. They are kept ' +
                'now (correctly), but a sign-out would lose them and the next sync would then purge the rows. ' +
                `ids: ${localOnlyWithVersions.join(', ')}`,
            );
        }
    }

    /**
     * §PERF104 (L-11543) — F4: the §FIX-THUMBNAIL-DURABILITY back-fill, SERIALISED.
     *
     * ⛔ SAME REPAIR, SAME ROWS, SAME SELF-HEAL. The only change is that the POSTs go
     * one at a time instead of up to fifty at once, and stop while an open is in
     * flight. A browser allows ~6 connections per host; the previous in-loop
     * `void uploadProjectThumbnail(...)` could therefore put dozens of base64 image
     * uploads ahead of `controller.refresh()` and `tier.streamLoad()` — the two
     * requests the OPEN path is waiting on — over a resource neither side declares.
     *
     * ⚠ A paused drain resumes on the NEXT hub mount, not never: the plan is
     * recomputed from scratch every sync and the repair is idempotent, so the corpus
     * converges across the sign-in / back-to-hub gestures the user makes constantly.
     * Stated rather than assumed, because "deferred" and "dropped" must not be the
     * same value — dropping it re-opens §FIX-THUMBNAIL-DURABILITY.
     */
    private async _drainThumbnailBackfill(): Promise<void> {
        const queue = this._pendingThumbBackfill;
        if (queue.length === 0) return;
        this._pendingThumbBackfill = [];
        const run = await runDeferred(queue, async (row) => {
            const outcome = await uploadProjectThumbnail(row.projectId, row.value);
            console.log(`[ProjectHub] §FIX-THUMBNAIL-DURABILITY back-fill ${row.projectId}: ${describeUploadOutcome(outcome)}`);
        }, {
            chunkSize: 1,           // ONE connection at a time — that is the whole fix.
            isOpenInFlight: () => this._openInFlight,
            isDestroyed: () => this._destroyed,
            onError: (row, err) => {
                console.warn(`[ProjectHub] §FIX-THUMBNAIL-DURABILITY back-fill ${row.projectId} threw (will retry next hub mount):`, err);
            },
        });
        if (!run.complete) {
            console.log(
                `[ProjectHub] §PERF104 thumbnail back-fill PAUSED after ${run.processed} of ${queue.length} ` +
                `(${run.stoppedBecause}) — the remaining ${run.remaining} are NOT lost: the plan is recomputed on ` +
                'the next hub mount and the repair is idempotent.',
            );
        }
    }

    /**
     * Pull the project list using whichever leg is available.
     *
     *   • Canonical (chunks/22 §22.1 step 1.5):
     *       `runtime.persistence.client.list()` — the typed
     *       `ProjectListClient` instance composed by the runtime.
     *       Returns the canonical `ProjectSummary[]` shape directly
     *       (camelCase, server-authoritative chips).
     *
     *   • Fallback (legacy null-runtime call sites that pre-date
     *     S73-WIRE Phase B):
     *       `apiFetch('/api/projects')` — the v0 REST endpoint with the
     *       same `pgProjectStore` projection.  The snake_case row is
     *       mapped to the same `ProjectSummary` shape so the
     *       reconciliation pass downstream is a single code path.
     *
     * Returns `null` on any non-OK / network failure (the caller logs
     * and continues so an offline hub still renders from cache).
     *
     * §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — ⭐ IT NOW RETURNS COMPLETENESS
     * ALONGSIDE THE ROWS, and that is the point of the change. Every leg below is
     * page-limited (50 rows by default, `server/projectStore.js`), and the caller
     * uses the result to decide whether local projects are ABSENT from the server
     * — a question a page cannot answer. Returning a bare array made the limit
     * invisible at the one call site that reasons about absence.
     */
    private async _fetchSummaries(): Promise<{ summaries: ProjectSummary[]; completeness: ListCompleteness } | null> {
        if (this.runtime) {
            // Prefer full enumeration when the composed client offers it. This is
            // the only leg that can establish completeness positively; `list()`
            // below leaves it to be inferred from a row count.
            const client = this.runtime.persistence.client;
            if (typeof client.listAll === 'function') {
                const all = await client.listAll() as { projects: ProjectSummary[]; complete: boolean };
                if (!Array.isArray(all?.projects)) return null;
                return {
                    summaries: all.projects,
                    // ⚠ `complete: false` is forwarded as `serverDeclaredHasMore: true`
                    // — the enumerator ran out of budget or the server would not
                    // paginate, and either way rows exist that are not here.
                    completeness: assessListCompleteness({
                        rowCount: all.projects.length,
                        serverDeclaredHasMore: all.complete ? false : true,
                    }),
                };
            }
            const summaries = await client.list() as ProjectSummary[];
            if (!Array.isArray(summaries)) return null;
            // No `hasMore` available: completeness is INFERRED from whether the
            // page came back saturated at the server's default limit.
            return { summaries, completeness: assessListCompleteness({ rowCount: summaries.length }) };
        }
        const res = await apiFetch('/api/projects');
        if (!res.ok) return null;
        const { projects } = await res.json() as { projects?: Array<Record<string, unknown>> };
        if (!Array.isArray(projects)) return null;
        const mapped = projects
            .filter(p => typeof p.id === 'string' && typeof p.name === 'string')
            .map(p => {
                const updatedAtIso = typeof p.updated_at === 'string' ? p.updated_at
                    : typeof p.created_at === 'string' ? p.created_at
                    : new Date(0).toISOString();
                const summary: {
                    -readonly [K in keyof ProjectSummary]: ProjectSummary[K];
                } = {
                    id: p.id as string,
                    name: p.name as string,
                    lastModifiedAt: updatedAtIso,
                    thumbnailUrl: (p.thumbnail_url ?? p.thumbnail ?? null) as string | null,
                    ownerName: typeof p.owner_id === 'string' ? p.owner_id : '',
                    collaboratorCount: 0,
                    schemaVersion: 1,
                };
                if (typeof p.version_count === 'number') summary.versionCount = p.version_count;
                if (typeof p.is_archived === 'boolean')  summary.isArchived  = p.is_archived;
                if (typeof p.is_starred === 'boolean')   summary.isStarred   = p.is_starred;
                if (typeof p.description === 'string' || p.description === null) {
                    summary.description = p.description as string | null;
                }
                // §SUSTAIN109 (L-10405) — forwarded only when the server sent it, same
                // three-state discipline as `rowToSummary`.
                if (typeof p.has_thumbnail === 'boolean') {
                    (summary as { hasThumbnail?: boolean }).hasThumbnail = p.has_thumbnail;
                }
                return summary;
            });
        // ⚠ The v0 `/api/projects` leg has NO paging at all — it is hard-capped
        // at 50 (`server.js:2927` / `projectStore.js`) with no way to ask for
        // more. Its completeness can only ever be inferred, never established.
        return { summaries: mapped, completeness: assessListCompleteness({ rowCount: mapped.length }) };
    }

    // ── Shell HTML ────────────────────────────────────────────────────────────

    private renderShell(): string { return phRenderShell(this._asCtx()); }


    // ── Sidebar ───────────────────────────────────────────────────────────────

    private renderSidebar(): string { return phRenderSidebar(this._asCtx()); }


    private sectionLabel(): string { return phSectionLabel(this.currentSection); }


    // ── Grid ──────────────────────────────────────────────────────────────────



    /**
     * Persist a new manual ordering. Called after a drag-and-drop reorder.
     * Reassigns sequential displayOrder values to the projects in `orderedIds`
     * so the order is stable across reloads.
     */
    private persistCustomOrder(orderedIds: string[]): void {
        const all = projectRepository.listProjects();
        const byId = new Map(all.map(p => [p.id, p]));
        orderedIds.forEach((id, idx) => {
            const p = byId.get(id);
            if (!p) return;
            if (p.displayOrder !== idx) {
                projectRepository.saveProject({ ...p, displayOrder: idx });
            }
        });
    }

    private renderGrid(): string { return phRenderGrid(this._asCtx()); }











    // ── Refresh helpers ───────────────────────────────────────────────────────

    private refreshGrid(): void {
        const grid = this.el.querySelector('#ph-grid')!;
        grid.innerHTML = this.renderGrid();
        this.attachGridListeners(this.el);
    }

    private refreshSidebar(): void {
        const sidebar = this.el.querySelector('#ph-sidebar')!;
        sidebar.innerHTML = this.renderSidebar();
        this.attachSidebarListeners(this.el);
    }

    private refreshSectionTitle(): void {
        const title = this.el.querySelector('#ph-section-title');
        if (title) title.textContent = this.sectionLabel();
    }

    private refreshSortBar(): void {
        this.el.querySelectorAll<HTMLElement>('.ph-sort-btn').forEach(btn => {
            btn.classList.toggle('ph-sort-btn--active', btn.dataset.sort === this.currentSort);
        });
    }

    // ── Listeners ─────────────────────────────────────────────────────────────

    private attachListeners(el: HTMLElement): void {
        // ── Mobile sidebar toggle (MOB-001-PH) ────────────────────────────
        const sidebar = el.querySelector<HTMLElement>('#ph-sidebar')!;
        const backdrop = el.querySelector<HTMLElement>('#ph-mobile-backdrop')!;
        const mobileHamburger = el.querySelector<HTMLButtonElement>('#ph-mobile-hamburger')!;
        const closeSidebar = () => {
            sidebar.classList.remove('ph-sidebar--open');
            backdrop.classList.remove('ph-mobile-backdrop--visible');
            mobileHamburger.setAttribute('aria-expanded', 'false');
        };
        mobileHamburger.addEventListener('click', () => {
            const isOpen = sidebar.classList.contains('ph-sidebar--open');
            sidebar.classList.toggle('ph-sidebar--open', !isOpen);
            backdrop.classList.toggle('ph-mobile-backdrop--visible', !isOpen);
            mobileHamburger.setAttribute('aria-expanded', String(!isOpen));
        });
        backdrop.addEventListener('click', closeSidebar);
        el.querySelector('#ph-mobile-new-btn')!.addEventListener('click', () => this.startGuidedOnboardingDirect());

        // Auto-close sidebar on sidebar-item click (mobile UX)
        sidebar.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.ph-sidebar-item') || target.closest('#ph-new-btn') || target.closest('#ph-invite-collab-btn') || target.closest('.ph-settings-btn') || target.closest('#ph-sign-out') || target.closest('#ph-upgrade-btn')) {
                if (window.innerWidth <= 768) closeSidebar();
            }
        });

        // §UI-MAIN-PANEL (DAILY-USE 2026-05-21) — The Sign out / New Project /
        // Upgrade / Import-Upload click listeners have been MOVED into
        // `attachSidebarListeners` (search "§UI-MAIN-PANEL" there). Reason:
        // `refreshSidebar()` (line 303) does `sidebar.innerHTML = …` which
        // destroys + recreates the sidebar DOM, blowing away every listener
        // bound on those elements. Sidebar refreshes happen on plan changes,
        // project add/remove, section nav, etc. — after the FIRST refresh
        // the architect's clicks on Sign Out and New Project went silently
        // unheard. `attachSidebarListeners` IS called by `refreshSidebar`,
        // so binding there keeps refresh ↔ rebind symmetric. The architect
        // reported: "the buttons on the left hand side panel don't get
        // triggered." Root cause: orphaned listeners after every sidebar
        // refresh.

        // Search filter
        el.querySelector('#ph-search')!.addEventListener('input', (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
            this.refreshGrid();
        });

        // Sort buttons
        el.querySelectorAll<HTMLElement>('[data-sort]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentSort = btn.dataset.sort as SortKey;
                this.refreshSortBar();
                this.refreshGrid();
            });
        });

        // Sidebar — handles #ph-sign-out, #ph-new-btn, #ph-upgrade-btn,
        // #ph-import-upload-btn, section nav, settings, world-model toggle
        // (all re-bindable on refresh)
        this.attachSidebarListeners(el);

        // Grid
        this.attachGridListeners(el);

        // New project modal
        el.querySelector('#ph-modal-close')!.addEventListener('click', () => this.closeNewModal());
        el.querySelector('#ph-modal-cancel')!.addEventListener('click', () => this.closeNewModal());
        el.querySelector('#ph-new-modal')!.addEventListener('click', (e) => {
            if (e.target === el.querySelector('#ph-new-modal')) this.closeNewModal();
        });
        // O.5 — primary "Create & guide me" → guided onboarding; the new
        // "Skip — blank canvas" secondary → legacy blank create. Enter in the
        // name field keeps the primary (guided) behaviour.
        el.querySelector('#ph-modal-create')!.addEventListener('click', () => this.handleCreate('guided'));
        el.querySelector('#ph-modal-create-blank')?.addEventListener('click', () => this.handleCreate('blank'));
        el.querySelector('#ph-new-name')!.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') this.handleCreate('guided');
        });

        // Generic modal close buttons (rename, delete)
        el.querySelectorAll<HTMLElement>('[data-modal]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.modal!;
                const modal = el.querySelector('#' + modalId) as HTMLElement | null;
                if (modal) modal.style.display = 'none';
            });
        });

        // Rename confirm
        el.querySelector('#ph-rename-confirm')!.addEventListener('click', () => this.handleRename());
        el.querySelector('#ph-rename-input')!.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') this.handleRename();
        });

        // Delete confirm
        el.querySelector('#ph-delete-confirm')!.addEventListener('click', () => this.handleDelete());

        // Members modal close
        el.querySelector('#ph-members-modal-close')!.addEventListener('click', () => this.closeMembersModal());
        el.querySelector('#ph-members-modal')!.addEventListener('click', (e) => {
            if (e.target === el.querySelector('#ph-members-modal')) this.closeMembersModal();
        });

        // Global click → close context menu
        document.addEventListener('click', this.onDocClick);
    }

    private attachSidebarListeners(el: HTMLElement): void {
        el.querySelectorAll<HTMLElement>('[data-section]').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section as HubSection;
                this.currentSection = section;
                this.refreshSidebar();
                this.refreshSectionTitle();
                this.refreshGrid();
            });
        });

        // §UI-MAIN-PANEL (DAILY-USE 2026-05-21) — moved here from
        // attachListeners() so the handlers survive every refreshSidebar()
        // (which calls innerHTML=… on the sidebar root and destroys all
        // existing listeners). See the explanatory note in attachListeners
        // above the `// Search filter` block.

        // New project button (sidebar CTA — primary)
        el.querySelector('#ph-new-btn')?.addEventListener('click', () => this.startGuidedOnboardingDirect());

        // §ADD-PEOPLE — Invite collaborators (sidebar CTA). Opens the members
        // flow: 0 projects → prompt to create one; 1 → straight to its members;
        // many → a quick project chooser, then that project's members modal.
        el.querySelector('#ph-invite-collab-btn')?.addEventListener('click', () => this.openInviteCollaborators());

        // Import / Upload button (sidebar CTA — secondary, currently disabled
        // but kept wired so flipping the disabled flag in markup is enough)
        el.querySelector('#ph-import-upload-btn')?.addEventListener('click', () => {
            window.runtime?.events?.emit('import-ifc', {});
        });

        // Upgrade button (footer — only present on free/trial plans)
        el.querySelector('#ph-upgrade-btn')?.addEventListener('click', () => {
            this.callbacks.onUpgrade?.();
        });

        // Sign out (footer) — Phase C.10.04 (PRYZM2-WIREUP-PLAN-S72/14-
        // subphases-A-D.md line 137). Fires `runtime.persistence.client.signOut()`
        // so the server invalidates the bearer token, then clears local-storage
        // session via the legacy `signOut()` helper, then notifies the shell
        // to re-mount the auth modal. Never await — the UX must be instant;
        // if the server call fails the local logout still completes (the
        // token is gone from this browser regardless).
        el.querySelector('#ph-sign-out')?.addEventListener('click', () => {
            // §FIX-SIGN-OUT-IS-A-DESTRUCTIVE-ACT (L-10401) — ⚠ ORDER CHANGED, AND
            // THE ORDER IS THE POINT. The consent gate lives inside `signOut()`, so
            // it must run BEFORE the server token is invalidated: the old sequence
            // fired `client.signOut()` first, which would have killed the session
            // even when the user then declined — leaving them signed out on the
            // server, still holding the local work, and unable to upload any of it.
            // A cancelled sign-out must change NOTHING.
            if (!signOut()) return;
            if (this.runtime) {
                void this.runtime.persistence.client.signOut().catch(err => {
                    console.warn('[ProjectHub] runtime.persistence.client.signOut failed (continuing local logout):', err);
                });
            }
            this.callbacks.onSignOut();
        });

        // Phase 10: Platform Settings button (owner only)
        el.querySelector('#ph-platform-settings-btn')?.addEventListener('click', () => {
            this._ownerSettingsPanel.open();
        });

        // Phase 10: World model (Design Insights) toggle (all users)
        el.querySelector('#ph-world-model-toggle')?.addEventListener('click', (e) => {
            e.preventDefault();
            const sw = el.querySelector('#ph-world-model-toggle') as HTMLElement;
            const current = localStorage.getItem('pryzm-world-model-prompts') !== 'false';
            const next = !current;
            localStorage.setItem('pryzm-world-model-prompts', String(next));
            sw.classList.toggle('osp-toggle-switch--on', next);
            sw.setAttribute('aria-checked', String(next));
            // Adjust thumb position via inline style since toggle size differs
            const thumb = sw.querySelector<HTMLElement>('.osp-toggle-thumb');
            if (thumb) thumb.style.left = next ? '17px' : '3px';
            console.log(`[ProjectHub] Design Insights prompts → ${next}`);
        });
    }

    /** §CANVAS-CARD Phase 2 — disposers for per-card free-drag listeners; cleared + rebuilt on each refreshGrid so document-level handlers never leak. */
    private _cardDragDisposers: Array<() => void> = [];

    /** §HUB-CANVAS-ZOOM (slice 1) — wheel-zoom scale for the project canvas. 1 = identity
     * (default; cards render exactly as laid out — no fit-all). Persisted across
     * refreshGrid so creating/deleting a project keeps the zoom. Panning is provided by
     * the grid's own scrollbars; drag-to-pan + fit-all are later slices. */
    private _hubZoom = 1;
    private static readonly _HUB_ZOOM_MIN = 0.3;
    private static readonly _HUB_ZOOM_MAX = 2.0;

    /**
     * §FIX-HUB-GRID-LISTENER-STACK (L-1281) — have the container-level DELEGATED
     * listeners below already been bound to `#ph-grid`?
     *
     * ⚠ THE BUG THIS CLOSES, stated as the founder saw it: ONE click on a project
     * card produced THREE `[PlatformRouter] Opening project:` lines and three full
     * `launchWorkspace` calls. Not three gestures — three listeners.
     *
     * `refreshGrid()` replaces `#ph-grid`'s CHILDREN (`grid.innerHTML = …`) and then
     * re-runs `attachGridListeners`. `#ph-grid` ITSELF is part of the stable shell
     * markup and SURVIVES that, so every one of the delegated `grid.addEventListener`
     * calls below added ANOTHER anonymous arrow to the same surviving node.
     * `addEventListener` de-duplicates only on referential identity, and a fresh
     * arrow is never identical — so N refreshes meant N handlers, all firing in one
     * dispatch. A normal signed-in boot refreshes three times (build → warm-then-sync
     * → syncFromServer), which is exactly the ×3 in the log.
     *
     * The card's own `pointerEvents = 'none'` in `openProject` cannot help: all N
     * listeners are on the SAME node and fire in the same event dispatch, before any
     * style change is observed.
     *
     * ⭐ The asymmetry that made this survivable for so long is recorded above in
     * `attachSidebarListeners`: the SIDEBAR was fixed for the mirror-image defect
     * (its DOM is destroyed, so its listeners must be re-bound). The grid needed the
     * OPPOSITE treatment — its delegation root is NOT destroyed, so its listeners
     * must NOT be re-bound — and the two were given the same call.
     *
     * Only the container-delegated listeners are gated. Anything bound to a node
     * `renderGrid()` actually replaces (`#ph-card-new`) still re-binds every time,
     * because that element genuinely IS a new node.
     */
    private _gridDelegatesBound = false;

    private attachGridListeners(el: HTMLElement): void {
        const grid = el.querySelector('#ph-grid') as HTMLElement;

        // New project card — a node `renderGrid()` REPLACES, so it must re-bind
        // every refresh. Deliberately OUTSIDE the delegation guard below.
        grid.querySelector('#ph-card-new')?.addEventListener('click', () => this.startGuidedOnboardingDirect());
        grid.querySelector('#ph-card-new')?.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Enter') this.startGuidedOnboardingDirect();
        });

        // §FIX-HUB-GRID-LISTENER-STACK (L-1281) — everything from here to the
        // `_attachCanvasDrag` call is bound to `#ph-grid` ITSELF, which survives
        // `refreshGrid()`. Bind ONCE. See `_gridDelegatesBound` above.
        if (this._gridDelegatesBound) {
            // `_attachCanvasDrag` disposes its own prior listeners and re-reads the
            // freshly rendered cards, so it MUST still run on every refresh.
            this._attachCanvasDrag(grid);
            return;
        }
        this._gridDelegatesBound = true;

        // Project cards — open (click on card body, not menu btn)
        grid.addEventListener('click', (e) => {
            const menuBtn = (e.target as HTMLElement).closest<HTMLElement>('.ph-card-menu-btn');
            if (menuBtn) {
                e.stopPropagation();
                this.openContextMenu(menuBtn, menuBtn.dataset.projectId!);
                return;
            }
            const card = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (card) this.openProject(card.dataset.projectId!, card.dataset.projectName!);
        });

        grid.addEventListener('keydown', (e) => {
            const card = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (card && (e as KeyboardEvent).key === 'Enter') this.openProject(card.dataset.projectId!, card.dataset.projectName!);
        });

        // ── Drag-and-drop reordering ──────────────────────────────────────────
        let draggingId: string | null = null;
        let draggingEl: HTMLElement | null = null;

        grid.addEventListener('dragstart', (e) => {
            const card = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (!card) return;
            draggingId = card.dataset.projectId || null;
            draggingEl = card;
            card.classList.add('ph-card--dragging');
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', draggingId || '');
            }
        });

        grid.addEventListener('dragend', () => {
            if (draggingEl) draggingEl.classList.remove('ph-card--dragging');
            grid.querySelectorAll('.ph-card--drop-before, .ph-card--drop-after')
                .forEach(el => el.classList.remove('ph-card--drop-before', 'ph-card--drop-after'));
            draggingId = null;
            draggingEl = null;
        });

        grid.addEventListener('dragover', (e) => {
            if (!draggingId) return;
            const target = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (!target || target === draggingEl) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            grid.querySelectorAll('.ph-card--drop-before, .ph-card--drop-after')
                .forEach(el => el.classList.remove('ph-card--drop-before', 'ph-card--drop-after'));
            const rect = target.getBoundingClientRect();
            const before = (e.clientX - rect.left) < rect.width / 2;
            target.classList.add(before ? 'ph-card--drop-before' : 'ph-card--drop-after');
        });

        grid.addEventListener('drop', (e) => {
            if (!draggingId) return;
            const target = (e.target as HTMLElement).closest<HTMLElement>('.ph-card--project');
            if (!target || target === draggingEl) return;
            e.preventDefault();

            const rect = target.getBoundingClientRect();
            const before = (e.clientX - rect.left) < rect.width / 2;
            const targetId = target.dataset.projectId!;

            // Build the new order from current visible cards, then move dragged
            // id to before/after the target id.
            const ids = Array.from(grid.querySelectorAll<HTMLElement>('.ph-card--project'))
                .map(el => el.dataset.projectId!)
                .filter(id => id !== draggingId);
            const targetIdx = ids.indexOf(targetId);
            const insertAt = before ? targetIdx : targetIdx + 1;
            ids.splice(insertAt, 0, draggingId);

            // Switch to custom sort so the new order takes effect on render.
            this.currentSort = 'custom';
            this.persistCustomOrder(ids);

            // Update sort button active state then re-render.
            this.el.querySelectorAll<HTMLElement>('.ph-sort-btn').forEach(btn => {
                btn.classList.toggle('ph-sort-btn--active', btn.dataset.sort === this.currentSort);
            });
            this.refreshGrid();
        });

        // §CANVAS-CARD Phase 2 — free drag-to-move layer. Lays the cards out as an
        // absolutely-positioned canvas and disables the HTML5 reorder above (cards
        // get draggable=false). Re-run every refresh; prior listeners disposed first.
        this._attachCanvasDrag(grid);
    }

    // ── §CANVAS-CARD Phase 2 — free "Canvas" drag-to-move ──────────────────────
    //
    // Lays the project cards out as an absolutely-positioned canvas (replacing the
    // CSS grid + HTML5 reorder) so each card can be dragged anywhere; its position
    // is remembered per project in localStorage. Drag is DELTA-based (no
    // getBoundingClientRect → correct regardless of grid scroll). Re-run on every
    // refreshGrid; previous document-level listeners are disposed first so they
    // never leak. A drag past a 5 px threshold suppresses the follow-up click so a
    // move never accidentally opens the project; a plain click still opens it.
    private _attachCanvasDrag(grid: HTMLElement): void {
        for (const d of this._cardDragDisposers) d();
        this._cardDragDisposers = [];

        const CARD_W = 240;
        const GAP    = 20;
        const PAD    = 16;
        const ROW_H  = 244; // approx card height + gap; cards auto-layout, user repositions

        grid.style.position = 'relative';
        grid.style.display  = 'block';

        const cols  = Math.max(1, Math.floor((grid.clientWidth - PAD * 2 + GAP) / (CARD_W + GAP)));
        const cards = Array.from(grid.querySelectorAll<HTMLElement>('.ph-card'));
        let topZ = 10;

        cards.forEach((card, i) => {
            const pid   = card.dataset.projectId || null;
            const saved = pid ? this._loadCardPos(pid) : null;
            const col   = i % cols;
            const row   = Math.floor(i / cols);
            const defLeft = PAD + col * (CARD_W + GAP);
            const defTop  = PAD + row * ROW_H;

            // §HUB-CARD-RECOVER: the grid clips horizontally and a free-dragged card
            // persists its x/y in localStorage; a position past the right edge (or
            // negative / absurdly far) hides the card with no pan or scroll to reach
            // it — so projects appear "missing". When the width is known, re-flow any
            // out-of-bounds saved position back to its default grid slot and heal the
            // stored value so every project stays visible. In-bounds custom positions
            // are preserved untouched.
            const clientW = grid.clientWidth;
            const maxLeft = clientW - CARD_W - PAD;
            const outOfBounds = saved != null && clientW > 400 &&
                (saved.x < 0 || saved.x > maxLeft || saved.y < 0 || saved.y > 20000);
            const left = (saved && !outOfBounds) ? saved.x : defLeft;
            const top  = (saved && !outOfBounds) ? saved.y : defTop;
            if (outOfBounds && pid) this._saveCardPos(pid, left, top);

            card.style.position = 'absolute';
            card.style.margin   = '0';
            card.style.width    = `${CARD_W}px`;
            card.style.left     = `${left}px`;
            card.style.top      = `${top}px`;
            card.style.zIndex   = String(topZ);
            card.draggable      = false; // disable HTML5 reorder — replaced by free-drag

            let sx = 0, sy = 0, ol = 0, ot = 0, dragging = false, moved = false;

            const onDown = (e: MouseEvent): void => {
                if (e.button !== 0) return;
                // Don't start a drag when grabbing the menu (⋯) button.
                if ((e.target as HTMLElement).closest('.ph-card-menu-btn')) return;
                dragging = true; moved = false;
                sx = e.clientX; sy = e.clientY;
                ol = parseFloat(card.style.left) || 0;
                ot = parseFloat(card.style.top)  || 0;
                card.style.zIndex = String(++topZ); // click-to-front
                e.preventDefault();
            };
            const onMove = (e: MouseEvent): void => {
                if (!dragging) return;
                // §HUB-CANVAS-ZOOM: screen delta → content delta (÷ zoom) so the card
                // tracks the cursor 1:1 at any zoom level (identity at zoom 1).
                const z = this._hubZoom || 1;
                const dx = (e.clientX - sx) / z, dy = (e.clientY - sy) / z;
                if (!moved && dx * dx + dy * dy > 25 / (z * z)) {
                    moved = true;
                    card.style.cursor    = 'grabbing';
                    card.style.boxShadow = '0 20px 48px rgba(40,30,90,0.28)';
                }
                if (moved) {
                    card.style.left = `${Math.max(0, ol + dx)}px`;
                    card.style.top  = `${Math.max(0, ot + dy)}px`;
                }
            };
            const suppressClick = (ev: Event): void => {
                ev.stopPropagation();
                ev.preventDefault();
                card.removeEventListener('click', suppressClick, true);
            };
            const onUp = (): void => {
                if (!dragging) return;
                dragging = false;
                card.style.cursor    = '';
                card.style.boxShadow = '';
                if (moved) {
                    if (pid) this._saveCardPos(pid, parseFloat(card.style.left) || 0, parseFloat(card.style.top) || 0);
                    // Suppress the click that follows a real drag (capture phase, one-shot).
                    card.addEventListener('click', suppressClick, true);
                }
            };

            card.addEventListener('mousedown', onDown);
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            this._cardDragDisposers.push(() => {
                card.removeEventListener('mousedown', onDown);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            });
        });

        // §HUB-CANVAS-ZOOM (slice 1): wrap the cards in a scaled content layer inside a
        // "sizer" that reserves the (scaled) scroll extent, so the grid's own scrollbars
        // pan the canvas and Ctrl/Cmd + wheel zooms it toward the cursor. At zoom 1 this
        // is identity — cards render exactly as laid out above (safe default; NO fit-all,
        // so the empty-grid regression cannot recur). Plain wheel still scrolls natively.
        let maxBottom = 0, maxRight = 0;
        for (const card of cards) {
            maxBottom = Math.max(maxBottom, (parseFloat(card.style.top)  || 0) + (card.offsetHeight || ROW_H));
            maxRight  = Math.max(maxRight,  (parseFloat(card.style.left) || 0) + CARD_W);
        }
        const contentW = maxRight  + PAD;
        const contentH = maxBottom + 40;

        const content = document.createElement('div');
        content.className = 'ph-canvas-content';
        content.style.cssText = 'position:absolute;top:0;left:0;transform-origin:0 0;';
        for (const c of cards) content.appendChild(c);

        const sizer = document.createElement('div');
        sizer.className = 'ph-canvas-sizer';
        sizer.style.position = 'relative';
        sizer.appendChild(content);

        grid.style.overflow = 'auto';
        grid.appendChild(sizer);

        const applyZoom = (): void => {
            const z = this._hubZoom;
            content.style.transform = `scale(${z})`;
            sizer.style.width  = `${contentW * z}px`;
            sizer.style.height = `${contentH * z}px`;
        };
        applyZoom();

        // Ctrl/Cmd + wheel = zoom toward cursor; plain wheel = native scroll (pan).
        const onWheel = (e: WheelEvent): void => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const rect = grid.getBoundingClientRect();
            const vx = e.clientX - rect.left;
            const vy = e.clientY - rect.top;
            const z0 = this._hubZoom || 1;
            const contentX = (grid.scrollLeft + vx) / z0;
            const contentY = (grid.scrollTop  + vy) / z0;
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            const z1 = Math.min(ProjectHub._HUB_ZOOM_MAX, Math.max(ProjectHub._HUB_ZOOM_MIN, z0 * factor));
            if (z1 === z0) return;
            this._hubZoom = z1;
            applyZoom();
            grid.scrollLeft = contentX * z1 - vx;   // keep the point under the cursor fixed
            grid.scrollTop  = contentY * z1 - vy;
        };
        grid.addEventListener('wheel', onWheel, { passive: false });
        this._cardDragDisposers.push(() => grid.removeEventListener('wheel', onWheel));
    }

    private _cardPosKey(id: string): string { return `pryzm.hubCardPos.${id}`; }

    private _loadCardPos(id: string): { x: number; y: number } | null {
        try {
            const raw = localStorage.getItem(this._cardPosKey(id));
            if (!raw) return null;
            const p = JSON.parse(raw) as { x: number; y: number };
            return (typeof p.x === 'number' && typeof p.y === 'number') ? p : null;
        } catch { return null; }
    }

    private _saveCardPos(id: string, x: number, y: number): void {
        try { localStorage.setItem(this._cardPosKey(id), JSON.stringify({ x, y })); }
        catch { /* quota / private mode — non-critical */ }
    }

    // ── Context menu ──────────────────────────────────────────────────────────

    private openContextMenu(anchor: HTMLElement, projectId: string): void {
        this.closeContextMenu();

        const menu = this.el.querySelector('#ph-ctx-menu') as HTMLElement;
        const project = projectRepository.listProjects().find(p => p.id === projectId);

        // Update dynamic labels
        const starBtn = menu.querySelector('#ph-ctx-star') as HTMLElement;
        if (starBtn) starBtn.innerHTML = (project?.isStarred)
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Unstar`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Star`;

        const archiveBtn = menu.querySelector('#ph-ctx-archive') as HTMLElement;
        if (archiveBtn) archiveBtn.innerHTML = (project?.isArchived)
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> Unarchive`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> Archive`;

        // Position the menu near the anchor
        const rect = anchor.getBoundingClientRect();
        menu.style.display = 'block';
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left - 140}px`;

        // Make sure it doesn't go off screen.
        // D.7.5 batch #5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('project-hub-menu-position', () => {
            const mRect = menu.getBoundingClientRect();
            if (mRect.right > window.innerWidth - 8) {
                menu.style.left = `${window.innerWidth - mRect.width - 8}px`;
            }
            if (mRect.bottom > window.innerHeight - 8) {
                menu.style.top = `${rect.top - mRect.height - 4}px`;
            }
        });

        // Attach action listeners (remove old ones first)
        const clone = menu.cloneNode(true) as HTMLElement;
        menu.parentNode!.replaceChild(clone, menu);

        clone.querySelectorAll<HTMLElement>('[data-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action!;
                this.handleContextAction(action, projectId);
                this.closeContextMenuEl(clone);
            });
        });

        this.ctxMenuEl = clone;
    }

    private closeContextMenu(): void {
        const menu = this.el.querySelector('#ph-ctx-menu') as HTMLElement | null;
        if (menu) menu.style.display = 'none';
        if (this.ctxMenuEl) this.ctxMenuEl.style.display = 'none';
    }

    private closeContextMenuEl(el: HTMLElement): void {
        el.style.display = 'none';
    }

    private onDocClick = (e: MouseEvent): void => {
        if (this.ctxMenuEl && !this.ctxMenuEl.contains(e.target as Node)) {
            this.ctxMenuEl.style.display = 'none';
        }
    };

    private handleContextAction(action: string, projectId: string): void {
        const project = projectRepository.listProjects().find(p => p.id === projectId);
        if (!project) return;

        switch (action) {
            case 'open':
                this.openProject(project.id, project.name);
                break;
            case 'rename':
                this.openRenameModal(project);
                break;
            case 'duplicate':
                this.duplicateProject(project);
                break;
            case 'team':
                this.openMembersModal(project);
                break;
            case 'star':
                this.toggleStar(project);
                break;
            case 'archive':
                this.toggleArchive(project);
                break;
            case 'delete':
                this.openDeleteModal(project);
                break;
        }
    }

    // ── Members modal (ISO 19650 CDE Phase 1) ─────────────────────────────────

    private _memberPanel: ProjectMemberPanel | null = null;

    /**
     * §ADD-PEOPLE (2026-05-22) — sidebar "Invite collaborators" entry point.
     * Members are per-project, so: 0 projects → ask to create one; exactly 1 →
     * jump straight to its members modal; many → a quick project chooser inside
     * the members modal, then open the chosen project's ProjectMemberPanel.
     */
    private openInviteCollaborators(): void {
        const projects = projectRepository.listProjects();
        if (!projects.length) {
            alert('Create a project first — then you can invite collaborators to it.');
            return;
        }
        if (projects.length === 1) {
            this.openMembersModal(projects[0]);
            return;
        }
        const modal = this.el.querySelector('#ph-members-modal') as HTMLElement;
        const title = this.el.querySelector('#ph-members-modal-title') as HTMLElement;
        const body  = this.el.querySelector('#ph-members-modal-body') as HTMLElement;
        if (this._memberPanel) { this._memberPanel.destroy?.(); this._memberPanel = null; }
        title.textContent = 'Invite collaborators — choose a project';
        body.innerHTML = '';
        const list = document.createElement('div');
        list.className = 'ph-invite-picker';
        for (const p of projects) {
            const row = document.createElement('button');
            row.className = 'ph-invite-picker-row';
            row.type = 'button';
            const name = document.createElement('span');
            name.className = 'ph-invite-picker-name';
            name.textContent = p.name;            // textContent — no XSS, no escape helper needed
            row.appendChild(name);
            row.addEventListener('click', () => this.openMembersModal(p)); // re-renders modal with the member panel
            list.appendChild(row);
        }
        body.appendChild(list);
        modal.style.display = 'flex';
    }

    private openMembersModal(project: ProjectMeta): void {
        const modal = this.el.querySelector('#ph-members-modal') as HTMLElement;
        const title = this.el.querySelector('#ph-members-modal-title') as HTMLElement;
        const body = this.el.querySelector('#ph-members-modal-body') as HTMLElement;

        title.textContent = `Team — ${project.name}`;
        body.innerHTML = '<div class="mp-loading">Loading members…</div>';
        modal.style.display = 'flex';

        // Destroy previous panel instance if any
        if (this._memberPanel) {
            this._memberPanel.destroy?.();
            this._memberPanel = null;
        }

        const projectId = project.id;
        const plan = (this.user.plan || 'free') as string;
        const isOwner = plan === 'owner';
        const currentUserRole: CDERole | null = isOwner ? 'lead_appointed' : 'team_member';

        const callbacks = {
            currentUserRole,
            isOwner,
            // §FIX-MEMBERS-ABSENT-VS-UNREACHABLE — this MUST reject on a failed
            // read and MUST NOT reduce a failure to []. It also forwards the
            // server's `source` so the panel can tell "postgres says zero" from
            // "an in-memory Map says zero", which are not the same fact.
            onLoadMembers: async (pid: string): Promise<MemberLoadResult> => {
                const res = await apiFetch(`/api/projects/${pid}/members`, {
                    headers: { 'Content-Type': 'application/json' },
                });
                if (!res.ok) {
                    // Carry the STATUS CODE into the message. "400" and "503"
                    // send the reader to different places, and a bare
                    // "Failed to load" sends them nowhere.
                    const body = await res.json().catch(() => null);
                    const detail = (body && typeof body.error === 'string')
                        ? body.error
                        : await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status} — ${detail || res.statusText || 'no detail returned'}`);
                }
                const body = await res.json().catch(() => null);
                if (!body || !Array.isArray(body.members)) {
                    // A 200 whose body is not a member list is a failed read
                    // wearing a success code. Do not render it as "0 members".
                    throw new Error('HTTP 200 but the response carried no member list — the read did not produce an answer.');
                }
                return { members: body.members as ProjectMember[], source: body.source ?? null };
            },
            onInviteMember: async (pid: string, userId: string, role: CDERole): Promise<ProjectMember> => {
                const res = await apiFetch(`/api/projects/${pid}/members`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, role }),
                });
                if (!res.ok) {
                    const { error } = await res.json().catch(() => ({ error: 'Request failed' }));
                    throw new Error(error);
                }
                const { member } = await res.json();
                return member;
            },
            onChangeRole: async (pid: string, userId: string, role: CDERole): Promise<ProjectMember> => {
                const res = await apiFetch(`/api/projects/${pid}/members/${userId}/role`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role }),
                });
                if (!res.ok) {
                    const { error } = await res.json().catch(() => ({ error: 'Request failed' }));
                    throw new Error(error);
                }
                const { member } = await res.json();
                return member;
            },
            onRemoveMember: async (pid: string, userId: string): Promise<void> => {
                const res = await apiFetch(`/api/projects/${pid}/members/${userId}`, {
                    method: 'DELETE',
                });
                if (!res.ok && res.status !== 204) {
                    const { error } = await res.json().catch(() => ({ error: 'Request failed' }));
                    throw new Error(error);
                }
            },
        };

        body.innerHTML = '';
        this._memberPanel = new ProjectMemberPanel(body, projectId, callbacks);
    }

    private closeMembersModal(): void {
        const modal = this.el.querySelector('#ph-members-modal') as HTMLElement;
        modal.style.display = 'none';
        if (this._memberPanel) {
            this._memberPanel.destroy?.();
            this._memberPanel = null;
        }
    }

    // ── Project actions ───────────────────────────────────────────────────────

    /**
     * Phase C.4.06 (PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md line
     * 112) — duplicate uses `runtime.persistence.client.duplicate(id,
     * newName)` which goes through the ProjectListController so the
     * `projectListStore` is updated atomically; we mirror the
     * server-authoritative summary into the legacy `projectRepository`
     * for back-compat readers (sidebar / grid / cards) until C.1.01
     * migrates them to subscribe to `projectListStore`.
     */
    private duplicateProject(project: ProjectMeta): void {
        if (!this.runtime) {
            console.error('[ProjectHub] duplicate: runtime is null');
            return;
        }
        const newName = `${project.name} (copy)`;
        void (async (): Promise<void> => {
            try {
                const summary = (await this.runtime!.persistence.client.duplicate(project.id, newName)) as {
                    readonly id: string;
                    readonly name: string;
                    readonly lastModifiedAt: string;
                    readonly ownerName: string;
                };
                const lastModifiedAt = Date.parse(summary.lastModifiedAt);
                const now = Date.now();
                // §FIX-PROJECT-DUPLICATE-OPEN (L-81) — deep-copy the source's local
                // version history under the new id BEFORE saving the meta, so the
                // local-first open path (PlatformShell.setProjectContext reads
                // getVersions(newId) before the server) restores the source's
                // elements instead of opening an empty project. Returns 0 when the
                // source has no local history on this device — the server-side
                // snapshot copy (duplicateProject) then carries the open.
                const copiedCount = versionRepository.duplicateInto(project.id, summary.id, summary.name);
                projectRepository.saveProject({
                    ...project,
                    id: summary.id,
                    name: summary.name,
                    updatedAt: Number.isFinite(lastModifiedAt) ? lastModifiedAt : now,
                    createdAt: now,
                    versionCount: copiedCount,
                    isStarred: false,
                    ownerId: summary.ownerName,
                });
                this.refreshSidebar();
                this.refreshGrid();
            } catch (err) {
                console.error('[ProjectHub] runtime.persistence.client.duplicate failed:', err);
                this.runtime?.toasts.error(`Could not duplicate "${project.name}": ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    }

    /**
     * Phase C.4.05 (line 111) — `client.patch(id, {isStarred})`.  The
     * UI stays optimistic (toggle is instant); we revert if the server
     * rejects the patch.
     */
    private toggleStar(project: ProjectMeta): void {
        if (!this.runtime) {
            console.error('[ProjectHub] toggleStar: runtime is null');
            return;
        }
        const next = !project.isStarred;
        // Optimistic local update so the UI feels instant.
        projectRepository.saveProject({ ...project, isStarred: next });
        this.refreshSidebar();
        this.refreshGrid();

        void (async (): Promise<void> => {
            try {
                await this.runtime!.persistence.client.patch(project.id, { isStarred: next });
            } catch (err) {
                console.error('[ProjectHub] runtime.persistence.client.patch(isStarred) failed:', err);
                // Revert on failure.
                projectRepository.saveProject({ ...project, isStarred: !next });
                this.refreshSidebar();
                this.refreshGrid();
                this.runtime?.toasts.error(`Could not update star: ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    }

    /**
     * Phase C.4.04 (line 110) — `client.patch(id, {isArchived})`.
     * Optimistic toggle with revert on server rejection.
     */
    private toggleArchive(project: ProjectMeta): void {
        if (!this.runtime) {
            console.error('[ProjectHub] toggleArchive: runtime is null');
            return;
        }
        const next = !project.isArchived;
        projectRepository.saveProject({ ...project, isArchived: next });
        this.refreshSidebar();
        this.refreshGrid();

        void (async (): Promise<void> => {
            try {
                await this.runtime!.persistence.client.patch(project.id, { isArchived: next });
            } catch (err) {
                console.error('[ProjectHub] runtime.persistence.client.patch(isArchived) failed:', err);
                projectRepository.saveProject({ ...project, isArchived: !next });
                this.refreshSidebar();
                this.refreshGrid();
                this.runtime?.toasts.error(`Could not ${next ? 'archive' : 'unarchive'}: ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    }

    // ── Rename modal ──────────────────────────────────────────────────────────

    private openRenameModal(project: ProjectMeta): void {
        const modal = this.el.querySelector('#ph-rename-modal') as HTMLElement;
        const input = this.el.querySelector('#ph-rename-input') as HTMLInputElement;
        input.value = project.name;
        input.dataset.projectId = project.id;
        modal.style.display = 'flex';
        setTimeout(() => input.select(), 50);
    }

    /**
     * Phase C.4.02 (PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md line
     * 108) — `await runtime.persistence.client.rename(id, newName)`
     * routes through the ProjectListController so the projectListStore
     * is updated atomically with the server's response.  We mirror the
     * server-authoritative summary into the legacy `projectRepository`
     * for back-compat readers (sidebar / grid / cards) until C.1.01
     * migrates them to subscribe to `projectListStore`.
     */
    private handleRename(): void {
        const modal = this.el.querySelector('#ph-rename-modal') as HTMLElement;
        const input = this.el.querySelector('#ph-rename-input') as HTMLInputElement;
        const projectId = input.dataset.projectId;
        const newName = input.value.trim();
        if (!projectId || !newName) return;

        const all = projectRepository.listProjects();
        const project = all.find(p => p.id === projectId);
        if (!project) return;

        if (!this.runtime) {
            console.error('[ProjectHub] handleRename: runtime is null');
            return;
        }

        modal.style.display = 'none';

        void (async (): Promise<void> => {
            try {
                const summary = (await this.runtime!.persistence.client.rename(projectId, newName)) as {
                    readonly id: string;
                    readonly name: string;
                    readonly lastModifiedAt: string;
                };
                const lastModifiedAt = Date.parse(summary.lastModifiedAt);
                projectRepository.saveProject({
                    ...project,
                    name: summary.name,
                    updatedAt: Number.isFinite(lastModifiedAt) ? lastModifiedAt : Date.now(),
                });
                this.refreshSidebar();
                this.refreshGrid();
            } catch (err) {
                console.error('[ProjectHub] runtime.persistence.client.rename failed:', err);
                this.runtime?.toasts.error(`Could not rename project: ${err instanceof Error ? err.message : String(err)}`);
            }
        })();
    }

    // ── Delete modal ──────────────────────────────────────────────────────────

    private openDeleteModal(project: ProjectMeta): void {
        const modal = this.el.querySelector('#ph-delete-modal') as HTMLElement;
        const msg = this.el.querySelector('#ph-delete-msg') as HTMLElement;
        const confirmBtn = this.el.querySelector('#ph-delete-confirm') as HTMLElement;

        msg.textContent = `Are you sure you want to permanently delete "${project.name}"? This action cannot be undone.`;
        confirmBtn.dataset.projectId = project.id;
        modal.style.display = 'flex';
    }

    /**
     * Phase C.4.03 (PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md line
     * 109) — `await runtime.persistence.client.delete(id)` routes
     * through the ProjectListController so the projectListStore
     * removes the entry atomically with the server's 204.  We keep
     * the local UI optimistic (close modal + refresh) and revert the
     * legacy `projectRepository` removal if the server rejects the
     * delete.
     */
    private async handleDelete(): Promise<void> {
        const modal = this.el.querySelector('#ph-delete-modal') as HTMLElement;
        const confirmBtn = this.el.querySelector('#ph-delete-confirm') as HTMLElement;
        const projectId = confirmBtn.dataset.projectId;
        if (!projectId) return;

        if (!this.runtime) {
            console.error('[ProjectHub] handleDelete: runtime is null');
            return;
        }

        // Snapshot the meta so we can restore on error.
        const snapshot = projectRepository.listProjects().find(p => p.id === projectId);

        // Optimistically remove from local storage and close modal immediately.
        projectRepository.deleteProject(projectId);
        modal.style.display = 'none';
        this.refreshSidebar();
        this.refreshGrid();

        try {
            await this.runtime.persistence.client.delete(projectId);
        } catch (err) {
            console.error('[ProjectHub] runtime.persistence.client.delete failed:', err);
            // Restore the local entry so the user does not lose visibility on the project.
            if (snapshot) {
                projectRepository.saveProject(snapshot);
                this.refreshSidebar();
                this.refreshGrid();
            }
            this.runtime.toasts.error(`Could not delete project: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // ── New project modal ─────────────────────────────────────────────────────

    /**
     * PRYZM-EARTH-ONBOARDING PRD Milestone 1 — no longer called by any "+ New
     * Project" entry point (see `startGuidedOnboardingDirect`), but kept and
     * made public (not deleted) in case a future surface wants the typed
     * name/description/type form explicitly (e.g. an "advanced create" option).
     * `public` also keeps `noUnusedLocals` (tsconfig.json) from flagging it —
     * TS only flags unused *private* members, and turning this genuinely-dead
     * private method invisible-but-present felt more misleading than exposing
     * it honestly as an unused-today public API surface.
     */
    openNewModal(): void {
        const modal = this.el.querySelector('#ph-new-modal') as HTMLElement;
        modal.style.display = 'flex';
        setTimeout(() => (this.el.querySelector('#ph-new-name') as HTMLInputElement)?.focus(), 50);
    }

    /**
     * PRYZM-EARTH-ONBOARDING PRD Milestone 1 — "+ New Project" no longer opens
     * the name/description/type modal as a blocking gate (PRD §1.1, §10, §12
     * conflict #1). Instead this auto-generates a placeholder name and hands off
     * straight to the guided onboarding flow (`onStartOnboarding`) exactly as the
     * modal's primary CTA used to, minus the typed fields. The modal itself is
     * NOT deleted — `openNewModal`/`handleCreate`/`closeNewModal` stay intact and
     * reachable (defensive: nothing else in this file references the modal
     * directly today, but removing the machinery is a bigger, separately-scoped
     * change than Milestone 1 asks for).
     */
    private startGuidedOnboardingDirect(): void {
        const span = _tracer.startSpan('pryzm.platform.projectHub.startGuidedOnboardingDirect');
        try {
            // Same monetization gate `handleCreate` applies — a project-limit hit
            // must still surface the upgrade prompt, not silently create.
            const activeProjects = projectRepository.listProjects().filter(p => !p.isArchived);
            if (!EntitlementStore.canCreateProject(activeProjects.length)) {
                const plan = EntitlementStore.getUserPlan();
                const limit = PLAN_LIMITS[plan]?.maxProjects ?? 3;
                const msg = `You've reached the ${limit}-project limit on the ${getPlanDisplayName(plan)} plan.\n\nUpgrade to Architect for unlimited projects.`;
                if (confirm(msg + '\n\nView upgrade options?')) {
                    this.callbacks.onUpgrade?.();
                }
                return;
            }

            const name = generateUntitledSiteName();
            if (this.callbacks.onStartOnboarding) {
                console.log('[ProjectHub] New Project → guided onboarding, no modal, direct to PRYZM Earth (PRYZM Earth Phase 2):', { name });
                try {
                    // Phase 2 — `directEntry: true` tells the router to skip the RAC
                    // role/typology chat and land straight on the `location` step.
                    this.callbacks.onStartOnboarding({ name, directEntry: true });
                } catch (err) {
                    // Never throw into the hub — fall back to a blank create, same
                    // guard `handleCreate('guided')` already applies.
                    console.error('[ProjectHub] onStartOnboarding threw — falling back to blank create:', err);
                    void this._createViaRuntime(name, undefined, null);
                }
                return;
            }
            console.warn('[ProjectHub] guided onboarding requested but no onStartOnboarding callback — creating a blank project instead.');
            void this._createViaRuntime(name, undefined, null);
        } finally {
            span.end();
        }
    }

    private closeNewModal(): void {
        const modal = this.el.querySelector('#ph-new-modal') as HTMLElement;
        modal.style.display = 'none';
        (this.el.querySelector('#ph-new-name') as HTMLInputElement).value = '';
        (this.el.querySelector('#ph-new-description') as HTMLTextAreaElement).value = '';
    }

    /**
     * O.5 — the modal's PRIMARY "Create Project" action. Instead of a blank
     * create, it launches the guided RAC onboarding flow (`onStartOnboarding`),
     * seeded by the modal's name + project type — the RAC conversation +
     * briefBootstrap then create+open the project and run site → generate. The
     * secondary "Skip — blank canvas" button calls `handleCreate('blank')`,
     * which keeps the legacy blank-create path verbatim. If `onStartOnboarding`
     * is missing (defensive / degraded host), the guided path also falls back to
     * blank create so "New Project" never dead-ends.
     */
    private handleCreate(mode: 'guided' | 'blank' = 'guided'): void {
        // Monetization gate — check project count against plan limit
        const activeProjects = projectRepository.listProjects().filter(p => !p.isArchived);
        if (!EntitlementStore.canCreateProject(activeProjects.length)) {
            this.closeNewModal();
            const plan = EntitlementStore.getUserPlan();
            const limit = PLAN_LIMITS[plan]?.maxProjects ?? 3;
            const msg = `You've reached the ${limit}-project limit on the ${getPlanDisplayName(plan)} plan.\n\nUpgrade to Architect for unlimited projects.`;
            if (confirm(msg + '\n\nView upgrade options?')) {
                this.callbacks.onUpgrade?.();
            }
            return;
        }

        const nameInput = this.el.querySelector('#ph-new-name') as HTMLInputElement;
        const descInput = this.el.querySelector('#ph-new-description') as HTMLTextAreaElement;
        const typeInput = this.el.querySelector('#ph-new-type') as HTMLSelectElement | null;
        const name = nameInput.value.trim() || 'Untitled Project';
        const description = descInput.value.trim() || undefined;
        const projectType = typeInput?.value || undefined;

        // O.5 — PRIMARY path: launch the guided RAC onboarding seeded by the
        // modal. The onboarding flow owns project creation (via briefBootstrap →
        // createAndOpenProject), so we just close the modal and hand off. Guarded:
        // if the host didn't wire `onStartOnboarding`, fall through to blank create.
        if (mode === 'guided' && this.callbacks.onStartOnboarding) {
            console.log('[ProjectHub] New Project → guided onboarding (O.5):', { name, projectType });
            this.closeNewModal();
            try {
                this.callbacks.onStartOnboarding({ name, projectType });
            } catch (err) {
                // Never throw into the hub — fall back to a blank create.
                console.error('[ProjectHub] onStartOnboarding threw — falling back to blank create:', err);
                void this._createViaRuntime(name, description, null);
            }
            return;
        }
        if (mode === 'guided') {
            console.warn('[ProjectHub] guided onboarding requested but no onStartOnboarding callback — creating a blank project instead.');
        }

        // Disable the create button so a double-click cannot fire two POSTs
        // and so the user gets visual feedback that the request is in flight
        // before the EngineLoadingOverlay paints (it paints from openProject).
        const createBtn = this.el.querySelector('#ph-modal-create') as HTMLButtonElement | null;
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.style.opacity = '0.6';
            createBtn.style.pointerEvents = 'none';
        }

        // Phase C.2.02 (PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3
        // line 104) — creation flows through `runtime.persistence.client.create(name)`
        // which POSTs `/api/v1/projects`.  The server is the authority on the
        // project id; the legacy "optimistic local id + fire-and-forget POST
        // /api/projects" path generated UUID-format ids the server's
        // `proj-TIMESTAMP-ALPHANUM` regex rejected (and the pgPool branch
        // ignores the client id entirely), producing an id mismatch that
        // surfaced as the
        //   `[persistence.openProject] project not found: proj-…`
        // error every time a freshly-created project was opened.
        void this._createViaRuntime(name, description, createBtn);
    }

    private async _createViaRuntime(
        name: string,
        description: string | undefined,
        createBtn: HTMLButtonElement | null,
    ): Promise<void> {
        const restoreBtn = (): void => {
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.style.opacity = '';
                createBtn.style.pointerEvents = '';
            }
        };

        if (!this.runtime) {
            // The runtime is constructed in `bootPlatform()` and threaded
            // by `PlatformRouter.showHub`.  Reaching this branch means
            // composeRuntime() failed to mount — surface the failure rather
            // than silently fall back to the legacy POST whose id mismatch
            // is the root cause we are removing.
            console.error('[ProjectHub] runtime is null — cannot create project (composeRuntime() must have failed at boot).');
            restoreBtn();
            alert('Project service is unavailable. Please refresh the page.');
            return;
        }

        try {
            // PersistenceClientLike.create returns `Promise<unknown>` by
            // contract (the slot keeps the `ProjectSummary` shape free to
            // evolve in `@pryzm/persistence-client`); we cast at the call
            // site per the type-comment guidance in
            // `packages/runtime-composer/src/types.ts` line 233.
            const summary = (await this.runtime.persistence.client.create(name)) as {
                readonly id: string;
                readonly name: string;
                readonly lastModifiedAt: string;
                readonly ownerName: string;
                readonly thumbnailUrl: string | null;
                readonly collaboratorCount: number;
                readonly schemaVersion: number;
            };

            // Mirror the server-authoritative summary into the legacy
            // localStorage repo so the rest of the white UI (sidebar
            // counts, ExistingProjectsPanel, version history) keeps
            // working unchanged until those readers migrate to
            // `runtime.persistence.projectListStore` in later sub-phases.
            const now = Date.now();
            const lastModifiedAt = Date.parse(summary.lastModifiedAt);
            const meta: ProjectMeta = {
                id: summary.id,
                name: summary.name,
                description,
                updatedAt: Number.isFinite(lastModifiedAt) ? lastModifiedAt : now,
                createdAt: now,
                versionCount: 0,
                ownerId: summary.ownerName,
            };
            projectRepository.saveProject(meta);

            // The store is already populated atomically by the
            // ProjectListController inside `runtime.persistence.client.create`
            // (see `packages/runtime-composer/src/buildPersistence.ts`
            // lines 72–93 — the public `client` surface routes mutations
            // through the controller so `client.create` does
            // `client.create() → store.addProject()` atomically) — the
            // subsequent `openProject(id)` therefore finds the summary
            // without a round-trip refresh.

            this.closeNewModal();
            this.openProject(summary.id, summary.name, { isNewProject: true });
        } catch (err) {
            // §SERVER-500-CLIENT-VISIBILITY (DAILY-USE 2026-05-21, Round 39) —
            // ALSO log the full error body so the architect's browser console
            // shows the structured { error, errorId, code } payload alongside
            // the message. Round 39 made the message itself carry errorId + code
            // (see ProjectListClient.ts), but logging the full body too means
            // the architect can copy the entire diagnostic envelope with one
            // right-click without having to expand the error object.
            console.error('[ProjectHub] runtime.persistence.client.create failed:', err);
            const errBody = (err as { body?: unknown })?.body;
            if (errBody) {
                console.error('[ProjectHub] server response body:', errBody);
            }
            restoreBtn();
            const msg = err instanceof Error ? err.message : String(err);
            // §SERVER-500-CLIENT-VISIBILITY — include errorId in the user-facing
            // alert too so the architect can paste it directly from the dialog
            // without opening DevTools.
            const errorId = (errBody && typeof errBody === 'object'
                ? (errBody as { errorId?: string }).errorId
                : undefined);
            const errorIdSuffix = errorId ? `\n\nReference ID: ${errorId}` : '';
            alert(`Failed to create project: ${msg}${errorIdSuffix}`);
        }
    }

    // ── Open project ──────────────────────────────────────────────────────────

    private openProject(id: string, name: string, opts?: { isNewProject?: boolean }): void {
        // §PERF100 (L-11440) — ⭐ THE MARK THAT SEPARATES THE HUMAN FROM THE MACHINE.
        //
        // The founder's 44.2 s hole runs from `runtime:composed` to `boot:ensure-requested`,
        // and NOTHING in the vocabulary distinguished "the app was busy" from "the app was
        // waiting for the user to pick a card". Every reading of that hole before this mark
        // was therefore unattributable in principle, not merely unmeasured: a hub that
        // painted in 300 ms and then sat idle for 43 s produces the SAME two marks as one
        // that blocked the main thread for 44 s. This is the boundary between them.
        //   • runtime:composed → hub:open-clicked  = hub work ∥ human dwell (NOT a defect
        //     by itself — read `hub:sync-done` against it to see which).
        //   • hub:open-clicked → boot:ensure-requested = machine work on the CRITICAL PATH
        //     of opening ONE project. This is the only half a perf fix can shrink.
        markStartupPhase('hub:open-clicked');
        // ⭐ §PERF104 (L-11540) — THE LATCH THAT TAKES CORPUS MAINTENANCE OFF THE PATH.
        // From this instant the residency audit and the thumbnail back-fill stop before
        // their next chunk and hand back both the main thread and the connection budget.
        // ⛔ This is not a spinner and not a loading state: the work genuinely stops
        // running. It resumes on the next hub mount, and both passes are idempotent.
        this._openInFlight = true;
        const card = this.el.querySelector(`[data-project-id="${id}"]`) as HTMLElement | null;
        if (card) {
            card.style.opacity = '0.6';
            card.style.pointerEvents = 'none';
        }
        window.__pendingProjectId = id; // TODO(C.3.x): legacy __pendingProjectId — replace with runtime.persistence.openProject hint
        window.__pendingProjectName = name; // TODO(C.3.x): legacy __pendingProjectName — replace with runtime.persistence.openProject hint
        this.callbacks.onOpenProject(id, name, opts);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    destroy(): void {
        // §PERF104 (L-11540) — a superseded hub must not keep auditing a corpus on
        // behalf of a surface that no longer exists. The deferred passes check this
        // before each chunk and report UNDETERMINED rather than stopping silently.
        this._destroyed = true;
        document.removeEventListener('click', this.onDocClick);
        this.el.remove();
    }
}
