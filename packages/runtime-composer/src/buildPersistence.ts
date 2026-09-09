// buildPersistence — assembles the runtime.persistence slot.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3.  Every Phase-C
// gesture goes through one of:
//   runtime.persistence.client.{list,create,delete,rename,patch,duplicate,signOut,members.*}
//   runtime.persistence.projectListStore.subscribe(listener)
//   runtime.persistence.eventLog.{append,replay,tag,tags,replayUntil,diff}
//   runtime.persistence.openProject(projectId) | closeProject()
//   runtime.persistence.exporter.toPryzm(projectId)
//   runtime.persistence.importer.fromPryzm(file)
//
// Wave 7 (2026-05-01): workspace bridge (D.4) DELETED per the in-code
// "DELETE in Wave 4" comment.  openProject() now chains through typed legs:
//   1. attachedBootstrap.ensure() — engine boot (legacy, until Phase D.3)
//   2. tier.streamLoad(id)        — typed server fetch
//   3. surface.setProjectContext(id, name, opts) — typed WorkspaceSurface call
//
// Two typed attachment points replace the deleted attachWorkspace():
//   • attachEngineBootstrap({ ensure }) — engine boot only
//   • attachWorkspaceSurface(surface)   — typed WorkspaceSurface
//
// Construction is async-but-cheap: the only awaited work is the lazy
// import('@pryzm/persistence-client') + import('@pryzm/stores') —
// JSDOM tests that never touch persistence pay nothing.

import { decideOpenDisposition } from './openCoalescing.js';
import type { ProjectSummary } from '@pryzm/stores';
import type { EventBus } from './EventBus.js';
import type {
  PersistenceSlot,
  PersistenceTierSlot,
  PryzmProjectBundle,
  PersistenceClientLike,
  ProjectContextSlot,
  RuntimeAudit,
  PersistenceStatus,
  PersistenceOpenProgress,
} from './types.js';

export interface BuildPersistenceOptions {
  readonly audit: RuntimeAudit;
  readonly events: EventBus;
  readonly projectContext: ProjectContextSlot;
  /** Caller-supplied client (escape hatch); when omitted a default
   *  ProjectListClient + MembersClient are constructed from the
   *  page's same-origin REST surface. */
  readonly client?: PersistenceClientLike | undefined;
}

export async function buildPersistenceSlot(opts: BuildPersistenceOptions): Promise<PersistenceSlot> {
  const persistMod = await import('@pryzm/persistence-client');
  const storesMod = await import('@pryzm/stores');

  const projectListStore = new storesMod.ProjectListStore();

  // Default in-memory event log (Phase-C scope: full IndexedDb wiring
  // lands when openProject() actually opens a per-project log; here we
  // hold a session-default empty backend so eventLog.tag() / .tags() /
  // .replay() are always callable even before any project opens).
  const sessionBackend = new persistMod.InMemoryBackend();
  const eventLog = new persistMod.EventLog(sessionBackend);
  const runtimeEventLog = new persistMod.RuntimeEventLog({ eventLog, audit: opts.audit });

  // Build the typed client surface.  When the caller supplied a custom
  // client (test hook, mocked Phase-A escape hatch), we trust it
  // verbatim; otherwise we wire the default REST-backed pair.
  const rawClient: PersistenceClientLike = opts.client ?? buildDefaultClient(persistMod);

  // ProjectListController coordinates client + store atomically.
  const controller = new persistMod.ProjectListController({
    client: (rawClient as unknown) as InstanceType<typeof persistMod.ProjectListClient>,
    store: projectListStore,
    onChange: (count): void => opts.events.emit('persistence.projectListChanged', { count }),
  });

  // Phase C §16.3 — expose a client whose mutating methods route through
  // ProjectListController (atomic client+store update) while pass-through
  // methods stay on the raw client so escape-hatch tests are not affected.
  const client: PersistenceClientLike = {
    list:         () => rawClient.list(),
    // §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) — forwarded only when the
    // underlying client actually implements it. Synthesising a `listAll` that
    // delegates to `list()` and reports `complete: true` would be worse than not
    // offering one at all: it would answer "yes, that is everything" from a
    // single page, which is precisely the false certainty this method exists to
    // remove. A missing capability must stay missing.
    ...(typeof (rawClient as PersistenceClientLike).listAll === 'function'
      ? { listAll: () => (rawClient as Required<PersistenceClientLike>).listAll() }
      : {}),
    create:       (name)             => controller.create(name),
    delete:       (id)               => controller.delete(id),
    rename:       (id, name)         => controller.rename(id, name),
    patch:        (id, patch)        => controller.patch(id, patch),
    duplicate:    (id, newName)      => controller.duplicate(id, newName),
    signOut:      ()                 => rawClient.signOut(),
    getAuthToken: ()                 => rawClient.getAuthToken(),
    members:      rawClient.members,
    // chunks/22 §22.1 step 1.2 leg — typed auth surface (oauth2-pkce).
    auth:         rawClient.auth,
  };

  const exporter = new persistMod.PryzmExporter({
    eventLog,
    resolveProjectName: (id: string): string => {
      const found = projectListStore.list().find((p: ProjectSummary) => p.id === id);
      return found?.name ?? id;
    },
  });

  const importer = new persistMod.PryzmImporter({
    createBlankProject: async (name: string) => {
      const summary = await controller.create(name);
      return { id: summary.id, name: summary.name };
    },
    eventLogFor: async () => eventLog,
  });

  // ── Wave 7: typed attachment points (replace deleted workspace bridge (D.4)) ───
  //
  // These two late-binding registrations are called from src/main.ts AFTER
  // composeRuntime() returns — the same post-compose pattern as the old
  // attachWorkspace() but now typed and purpose-split:
  //
  //   runtime.persistence.attachEngineBootstrap({ ensure: workspaceMount.ensure })
  //   runtime.persistence.attachWorkspaceSurface(workspaceSurface)
  //
  // Tests and headless callers omit both; openProject() degrades gracefully
  // (data path runs, no scene loads, no surface flip).

  type BootBridge = Parameters<PersistenceSlot['attachEngineBootstrap']>[0];
  type SurfaceHandle = Parameters<PersistenceSlot['attachWorkspaceSurface']>[0];

  let attachedBootstrap: BootBridge | null = null;
  const attachEngineBootstrap: PersistenceSlot['attachEngineBootstrap'] = (bridge) => {
    attachedBootstrap = bridge;
  };

  let attachedSurface: SurfaceHandle | null = null;
  const attachWorkspaceSurface: PersistenceSlot['attachWorkspaceSurface'] = (surface) => {
    attachedSurface = surface;
  };

  // ── Wave 7: PersistenceTierSlot — typed server fetch leg ─────────────────────
  //
  // streamLoad(id) is the canonical project-data fetch step.  It replaces the
  // fetch that previously lived inside PlatformShell.loadLatestVersionFromServer()
  // (inaccessible from the persistence slot).  The bundle is threaded into
  // setProjectContext() opts as `prefetchedVersion` so PlatformShell skips the
  // redundant internal round-trip.
  //
  // Future: streaming chunks (cold/warm/hot tiered cache) per chunks/15 §15.4.
  const tier: PersistenceTierSlot = {
    streamLoad: async (projectId: string): Promise<PryzmProjectBundle | null> => {
      try {
        const res = await fetch(`/api/projects/${projectId}/latest-version`, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        if (!res.ok) {
          console.warn(`[persistence.tier.streamLoad] Server ${res.status} for project ${projectId}`);
          return null;
        }
        const json = await res.json() as {
          version?: {
            id: string;
            label?: string;
            snapshot: unknown;
            element_count?: number;
            created_at?: string;
          };
        };
        const v = json.version;
        if (!v || !v.snapshot) {
          // Brand-new project — no saved version yet.
          return null;
        }
        const bundle: PryzmProjectBundle = {
          projectId,
          versionId: v.id,
          versionLabel: v.label ?? 'Restored',
          snapshot: v.snapshot,
          elementCount: v.element_count ?? 0,
          createdAt: v.created_at ?? new Date().toISOString(),
        };
        console.log(`[persistence.tier.streamLoad] version "${bundle.versionLabel}" loaded`);
        return bundle;
      } catch (err) {
        console.warn('[persistence.tier.streamLoad] Fetch error:', err);
        return null;
      }
    },
  };

  // ── openProject / closeProject — NO-RELOAD impl ──────────────────────────────
  let openProjectInflight: Promise<void> | null = null;
  /**
   * §FIX-OPEN-COALESCE-KEYED-ON-NOTHING — WHICH project the in-flight open is
   * for. Without this, {@link openProject}'s de-duplication was keyed on NOTHING.
   */
  let inflightProjectId: string | null = null;
  let lastStatus: PersistenceStatus = { kind: 'idle', isDirty: false };

  const setStatus = (status: PersistenceStatus): void => {
    if (status.kind === lastStatus.kind && status.isDirty === lastStatus.isDirty) return;
    lastStatus = status;
    opts.events.emit('persistence.status', status);
  };

  const emitProgress = (
    phase: PersistenceOpenProgress['phase'],
    pct: number,
    label?: string,
  ): void => {
    const payload: PersistenceOpenProgress = label !== undefined
      ? { phase, pct, label }
      : { phase, pct };
    opts.events.emit('persistence.openProgress', payload);
  };

  const openProject: PersistenceSlot['openProject'] = async (projectId, hint) => {
    // ⭐ §FIX-OPEN-COALESCE-KEYED-ON-NOTHING — THIS GUARD USED TO IGNORE `projectId`.
    //
    // It read `if (openProjectInflight !== null) return openProjectInflight;` — so
    // ANY open requested while another was in flight was handed the OTHER one's
    // promise. The async body below closes over the FIRST call's `projectId`, so
    // `projectContext.set(...)`, the stream-load and `setProjectContext(...)` all
    // ran for project A while the caller believed it had opened B. The promise
    // then RESOLVED, which reports success.
    //
    // ⭐ The question that settles it: could B's open EVER win? No — not once, not
    // by racing, not by timing. During the in-flight window B was unsatisfiable BY
    // CONSTRUCTION, and the window is a network refresh plus an engine boot, so it
    // is seconds wide on a real hub. Clicking a second card during a slow load
    // silently opened the first one. That is the same shape as the reconciler
    // defect one layer down: ONE VALUE ("an open is in flight") standing in for a
    // DIFFERENT question ("the open YOU asked for is in flight").
    //
    // The two cases are now told apart:
    //   • SAME id — a genuine duplicate (the four `launchWorkspace` call sites,
    //     L-1282). Coalescing is correct and is preserved unchanged.
    //   • DIFFERENT id — a real second request. It is CHAINED after the current
    //     open rather than run concurrently: two overlapping opens would both
    //     drive `projectContext` and `attachedSurface.setProjectContext`, giving a
    //     last-writer-wins interleave of two engine loads, which is a worse defect
    //     than the one being fixed. Sequencing makes the LAST-CLICKED project the
    //     one the user ends on, which is what they asked for.
    //
    // ⚠ `.catch()` on the superseded promise is deliberate: a FAILED open of A
    // must not prevent B from opening. Without it the recovery path (open A fails
    // → user clicks B) would reject, and the escape hatch from a broken project
    // would be a page reload.
    const disposition = decideOpenDisposition(
      { hasInflight: openProjectInflight !== null, inflightProjectId },
      projectId,
    );
    if (disposition.kind === 'coalesce') return openProjectInflight as Promise<void>;
    if (disposition.kind === 'supersede') {
      return (openProjectInflight as Promise<void>)
        .catch(() => undefined)
        .then(() => openProject(projectId, hint));
    }
    inflightProjectId = projectId;
    openProjectInflight = (async (): Promise<void> => {
      try {
        // ── 1. Resolve project summary ─────────────────────────────────────
        emitProgress('fetching', 0);
        if (projectListStore.isEmpty()) {
          await controller.refresh();
        }
        let summary = projectListStore.list().find((p: ProjectSummary) => p.id === projectId);
        if (!summary) {
          // Deep-link scenario: refresh and retry once.
          await controller.refresh();
          summary = projectListStore.list().find((p: ProjectSummary) => p.id === projectId);
        }
        if (!summary) {
          // OI-059 — the project is ABSENT from the server-backed list (the server
          // serves the VOLATILE in-memory store when PG is unreachable, so a project
          // created in a prior server session is gone server-side) yet may still live
          // in THIS browser's local version store — which is exactly why the hub
          // still lists it (ProjectHub keeps server-forgotten projects that have
          // local versions). Hard-throwing here aborted BEFORE the local-restore
          // path (PlatformShell.setProjectContext → server version-404 → local
          // auto-restore) that already recovers locally-snapshotted projects. So we
          // SOFT-fall-through with a minimal summary (mirroring the version-404
          // tolerance "njk,n" already gets) instead of throwing: tier.streamLoad()
          // below returns null on the 404 and PlatformShell restores from local.
          // Analysis: docs/03-execution/analysis/PERSISTENCE-CANNOT-OPEN-PROJECT-2026-06-03.md
          console.warn(`[persistence.openProject] no server record for ${projectId} — falling through to local restore (OI-059)`);
          summary = {
            id: projectId,
            name: hint?.name ?? projectId,
            lastModifiedAt: '1970-01-01T00:00:00.000Z',
            thumbnailUrl: null,
            ownerName: '',
            collaboratorCount: 0,
            schemaVersion: 1,
          };
        }
        opts.projectContext.set({ projectId: summary.id, projectName: summary.name });

        // ── 2. Boot engine (until Phase D.3 mounts renderer from boot) ────
        // attachedBootstrap.ensure() lazy-starts the legacy engine on first
        // call; subsequent calls resolve immediately (idempotent).
        // Wired from src/main.ts: runtime.persistence.attachEngineBootstrap(...)
        //
        // §STREAM-LOAD-STARTS-BEFORE-THE-BOOT-AWAIT (founder 2026-09-09 · L-13278 · C66)
        //
        // *"THIS IS A PROJECT WITH JUST 550 ELEMENTS AND TAKES TOO LONG TO OPEN"*
        //
        // ⭐ THE FETCH USED TO BE STRICTLY SERIAL AFTER THE ENTIRE ENGINE BOOT, for no reason
        // at all: its result is not consumed until step 4. One server round-trip plus a
        // full-snapshot `res.json()` sat idle behind the single slowest await on the open path.
        // Starting it here overlaps it with the boot; the AWAIT POINT IS UNCHANGED, so the
        // ordering of every observable effect is identical.
        //
        // ⛔ WHY THE OUTCOME IS CAPTURED RATHER THAN LEFT FLOATING. A promise that rejects
        // while nothing is awaiting it fires `unhandledrejection` at the next microtask
        // checkpoint — and in this app that trips ViewportCrashGuard into a full reload. That
        // is precisely how §FIX-GLOBE-3DTILES-CRASH (L-183) presented: an unawaited rejection
        // read as a crash. So the rejection is captured into a value the instant it can
        // happen, and re-thrown at the original await point, where the original try/catch is
        // still the thing that sees it. A bare `.catch(() => null)` would be WRONG in the
        // other direction — it would silently turn a failed load into "this project is empty",
        // which is the [[context-data-honesty-family]] error that has cost this repo real data.
        const bundleOutcome: Promise<{ ok: true; v: unknown } | { ok: false; e: unknown }> =
          hint?.isNewProject
            ? Promise.resolve({ ok: true as const, v: null })
            : tier.streamLoad(projectId).then(
                (v: unknown) => ({ ok: true as const, v }),
                (e: unknown) => ({ ok: false as const, e }),
              );

        emitProgress('hydrating', 30);
        if (attachedBootstrap !== null) {
          await attachedBootstrap.ensure();
        }

        // ── 3. Stream-load project bundle (Wave 7 typed tier) ─────────────
        // For brand-new projects we skip the server round-trip — we KNOW
        // there are no saved versions.  For existing projects, tier.streamLoad()
        // fetches the latest version bundle and returns null if none exists.
        // §STREAM-LOAD-STARTS-BEFORE-THE-BOOT-AWAIT (L-13278) — the request was issued above;
        // this is the same await it always was, and a failure still throws from here.
        emitProgress('hydrating', 60);
        const _bundleOutcome = await bundleOutcome;
        if (!_bundleOutcome.ok) throw _bundleOutcome.e;
        const bundle = _bundleOutcome.v as Awaited<ReturnType<typeof tier.streamLoad>> | null;

        // ── 4. Typed WorkspaceSurface.setProjectContext() ─────────────────
        // Wave 7: zero workspace bridge (D.4) reach.  `prefetchedVersion`
        // threads the already-fetched bundle into PlatformShell so it can
        // skip its own loadLatestVersionFromServer() round-trip.
        // Wired from composeRuntime(): runtime.persistence.attachWorkspaceSurface(ws)
        emitProgress('painting', 80);
        if (attachedSurface !== null) {
          // Only pass an opts object when at least one field is meaningful.
          // This preserves backward compatibility with callers that check
          // `opts !== undefined` to detect a new-project hint.
          const isNewProject = hint?.isNewProject;
          const prefetchedVersion = bundle ?? undefined;
          const contextOpts =
            isNewProject !== undefined || prefetchedVersion !== undefined
              ? {
                ...(isNewProject     !== undefined ? { isNewProject }     : {}),
                ...(prefetchedVersion !== undefined ? { prefetchedVersion } : {}),
              }
              : undefined;
          await attachedSurface.setProjectContext(summary.id, summary.name, contextOpts);
        }

        // ── 5. Done ────────────────────────────────────────────────────────
        emitProgress('done', 100);
        setStatus({ kind: 'idle', isDirty: false });
      } finally {
        openProjectInflight = null;
        inflightProjectId = null;
      }
    })();
    return openProjectInflight;
  };

  const closeProject = async (): Promise<void> => {
    opts.projectContext.clear();
    setStatus({ kind: 'idle', isDirty: false });
  };

  return {
    client,
    projectListStore,
    eventLog: runtimeEventLog,
    exporter,
    importer,
    tier,
    openProject,
    closeProject,
    attachEngineBootstrap,
    attachWorkspaceSurface,
  };
}

function buildDefaultClient(
  mod: typeof import('@pryzm/persistence-client'),
): PersistenceClientLike {
  const projectClient = new mod.ProjectListClient();
  const members = new mod.MembersClient();
  return {
    list:      ()             => projectClient.list(),
    create:    (name)         => projectClient.create(name),
    delete:    (id)           => projectClient.delete(id),
    rename:    (id, name)     => projectClient.rename(id, name),
    patch:     (id, patch)    => projectClient.patch(id, patch),
    duplicate: (id, newName)  => projectClient.duplicate(id, newName),
    signOut:   ()             => projectClient.signOut(),
    getAuthToken: ()          => projectClient.getAuthToken(),
    members: {
      list:    (id)              => members.list(id),
      invite:  (id, email, role) => members.invite(id, email, role),
      remove:  (id, userId)      => members.remove(id, userId),
      setRole: (id, userId, r)   => members.setRole(id, userId, r),
    },
    // chunks/22 §22.1 step 1.2 leg — typed auth surface (oauth2-pkce).
    auth:      projectClient.auth,
  };
}
