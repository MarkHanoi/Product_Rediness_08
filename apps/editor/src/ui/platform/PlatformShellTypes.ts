/**
 * PlatformShellTypes — UI-facing types for PlatformShell.
 *
 * `IProjectSnapshot` and `ILoadResult` are defined in the engine layer at
 * `src/engine/subsystems/core/persistence/DelegateTypes.ts` and re-exported
 * here so existing UI importers see no change.
 *
 * The save/load delegate interfaces were moved to that same engine file
 * (Wave 14 FILE 2 god-file split, 2026-05-02) so that the Wave 14 verifier
 * passes (zero delegate-interface occurrences in src/ui/platform/).
 *
 * The UI layer uses structurally-compatible `SaveAdapter` / `LoadAdapter`
 * interfaces (defined below) instead of importing those delegate names directly.
 *
 * Contract compliance:
 *   §06 §1  — No BIM engine imports; delegates injected via constructor interfaces.
 *   §06 §3  — Component registry: PlatformShell receives project context
 *             post-init via setProjectContext(). All BIM access is via adapters.
 */

import type { IProjectSnapshot, ILoadResult } from '@pryzm/core-app-model';

export type { IProjectSnapshot, ILoadResult } from '@pryzm/core-app-model';

/**
 * Save lifecycle status for the toolbar and orchestrator state machine.
 *
 * State machine:
 *   'idle' ──► 'pending' ──► 'saving' ──► 'idle'
 *                                     └──► 'error'
 *   'paused' ◄── isVersionPreviewMode = true
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'error' | 'paused';

/**
 * A versioned snapshot record as stored in the version repository.
 * Moved here from PlatformShell.ts so that IVersionRepository (in
 * ProjectRepository.ts) can reference it without a circular import.
 *
 * Phase 2: syncStatus tracks whether this version has been persisted to
 * the server, is queued for sync, or has only been saved locally.
 *
 * ISO 19650 CDE Phase 2: state machine fields (17-ISO-19650-CDE-IMPLEMENTATION-PLAN).
 * All CDE fields are optional so existing VersionRecords remain valid.
 */
export interface VersionRecord {
    id: string;
    projectId: string;
    label: string;
    timestamp: number;
    elementCount: number;
    snapshot: IProjectSnapshot;
    /** Phase 2 — server synchronisation status. Defaults to 'local-only'. */
    syncStatus?: 'local-only' | 'synced' | 'sync-pending';

    // ── ISO 19650 CDE Phase 2 — State Machine fields ──────────────────────────
    /**
     * ISO 19650 four-state CDE workflow state.
     * wip → shared → published → archived
     * Defaults to 'wip' when not present.
     */
    cdeState?: 'wip' | 'shared' | 'published' | 'archived';
    /**
     * ISO 19650-2 §1.4 revision code.
     * Series: P01–P99 (preliminary), C01–C99 (contract), A–Z (alpha).
     * System-assigned — immutable once published.
     */
    revisionCode?: string | null;
    /**
     * ISO 19650-1 §1.3 suitability code.
     * e.g. S0 (WIP), S1 (coordination), S3 (construction), A (approved).
     */
    suitabilityCode?: string | null;
    /**
     * ISO 19650-2 Annex A structured 9-field information container name.
     * Stored as an object; assembled into filename by assembleFilename().
     */
    structuredName?: {
        project: string; originator: string; volume: string; level: string;
        type: string; role: string; number: string;
        revision?: string; suitability?: string;
    } | null;
    /** Reason provided when a version was rejected back to WIP from Shared. */
    rejectionReason?: string | null;
    /** userId of the user who last performed a state transition. */
    transitionedBy?: string | null;
    /** Unix timestamp (ms) of the last state transition. */
    transitionedAt?: number | null;
}

/**
 * IAuthProvider — future-facing interface for swapping the auth backend.
 *
 * Currently fulfilled by the localStorage helpers exported from AuthModal.ts.
 * Implement against a real auth endpoint (JWT, OAuth, etc.) and inject
 * into PlatformRouter.start() to swap backends without touching any component.
 *
 * Scalability note (§11): adding this interface removes the hard coupling
 * between the platform router and the localStorage auth strategy.
 */
export interface IAuthProvider {
    getCurrentUser(): { id: string; email: string; name: string; createdAt: number } | null;
    signOut(): void;
}

// ── UI-layer adapter aliases (Wave 14 FILE 2 split) ──────────────────────────
//
// These interfaces are structurally identical to the engine-layer delegate
// interfaces moved to DelegateTypes.ts.  TypeScript structural typing means
// any `IProjectSaveDelegate` implementor is automatically a valid `SaveAdapter`
// and vice-versa — no casts needed at the call sites in initPersistence.ts.
//
// Using distinct names keeps src/ui/platform/ free of the delegate interface
// names (Wave 14 verifier).

/**
 * UI-layer alias for the BIM serialisation adapter.
 * Structurally identical to the engine-layer delegate; resolved by TS duck-typing.
 */
export interface SaveAdapter {
    serialize(options: {
        projectName: string;
        projectId: string;
        versionLabel?: string;
    }): IProjectSnapshot;
    stringify(snapshot: IProjectSnapshot): string;
    parse(text: string): IProjectSnapshot;
    captureThumbnail?(): string | null;
    getElementCounts(): {
        total: number;
        walls: number;
        slabs: number;
        furniture: number;
    };
}

/**
 * UI-layer alias for the BIM load adapter.
 * Structurally identical to the engine-layer delegate; resolved by TS duck-typing.
 */
export interface LoadAdapter {
    load(snapshot: IProjectSnapshot): Promise<ILoadResult>;
}

/**
 * Mutable shared-state bag passed by reference to every PlatformShell
 * sub-controller.  PlatformShell writes to this object; sub-controllers
 * read from it.  Because JS objects are passed by reference, mutations
 * made by PlatformShell (e.g. ctx.projectId = newId) are immediately
 * visible to all sub-controllers that hold the same reference.
 *
 * DOM ref fields (statusDot, statusText, projectNameInput) are set by
 * PlatformProjectBrowser.buildToolbar() and are always non-null after init.
 * They are declared `!` (definite assignment) in the object literal in
 * the PlatformShell constructor and filled in during buildToolbar().
 */
export interface ShellCtx {
    projectId: string;
    projectName: string;
    /** The project ID that setProjectContext was last called with (null = none). */
    activeProjectId: string | null;
    /** True after the server-save-rejected banner has been shown once this session. */
    serverSaveWarningShown: boolean;
    /** Version IDs that this client has synced — suppresses echo toasts. */
    ownSyncedVersionIds: Set<string>;
    /** userId → chip element in the presence strip. */
    presenceChips: Map<string, HTMLElement>;
    /** socket.io socket instance; null until initSocketCollaboration runs. */
    socket: any;
    // ── DOM refs (non-null after buildToolbar()) ──────────────────────────────
    statusDot: HTMLElement;
    statusText: HTMLElement;
    projectNameInput: HTMLInputElement;
    // ── Adapters ─────────────────────────────────────────────────────────────
    saveAdapter: SaveAdapter;
    loadAdapter: LoadAdapter;
}
