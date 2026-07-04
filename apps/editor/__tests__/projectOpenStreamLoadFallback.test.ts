// @vitest-environment happy-dom
//
// §FIX-PROJECT-OPEN-STREAMLOAD-FALLBACK (L-83) — opening a project must NOT open
// empty when the server has no latest-version. Prod symptom:
//   GET /api/projects/<id>/latest-version → 404
//   → [persistence.tier.streamLoad] Server 404
//   → the open path fell through to `_loadLatestVersionFromServer`, which on a
//     non-ok response returned and fired pryzm-project-loaded(empty:true) →
//     the project opened EMPTY even though a LOCAL snapshot existed.
//
// The fix makes the server leg self-sufficient: on ANY "server has nothing
// usable" outcome (404, {version:null}, or fetch error) it restores the latest
// LOCAL version before firing the empty event. This also hardens the empty-load
// `.catch` call site, which reaches this method WITHOUT the earlier local-first
// check having run.
//
// This gate drives `PlatformShell._loadLatestVersionFromServer` directly with a
// mocked `apiFetch` (the streamLoad server leg) and a mocked version repository,
// and asserts: 404 + present local → restores the local version (elements come
// back); 404 + no local → opens empty; server-200 → still loads the server copy.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

// ── Isolate the heavy PlatformShell constructor to its orchestration only ─────
vi.mock('../src/ui/styles/AppTheme', () => ({ injectAppTheme: vi.fn() }));
vi.mock('../src/ui/platform/PlatformToastSystem', () => ({
    generateId: () => 'gen-id',
}));
vi.mock('../src/ui/platform/PlatformCollabPill', () => ({
    mountPresenceStrip: vi.fn(),
    initSocketCollaboration: vi.fn(),
}));
vi.mock('../src/ui/platform/PlatformSaveController', () => ({
    PlatformSaveController: vi.fn().mockImplementation(() => ({
        orchestrator: {
            setLoading: vi.fn(),
            resetDirtyAfterLoad: vi.fn(),
            setVersionPreviewMode: vi.fn(),
        },
        schedulePostLoadThumbnailCapture: vi.fn(),
        dispose: vi.fn(),
    })),
}));
vi.mock('../src/ui/platform/PlatformVersionController', () => ({
    PlatformVersionController: vi.fn().mockImplementation(() => ({
        loadVersion: vi.fn(),
        dismissPreviewBanner: vi.fn(),
    })),
}));
vi.mock('../src/ui/platform/PlatformProjectBrowser', () => ({
    PlatformProjectBrowser: vi.fn().mockImplementation(() => ({
        buildToolbar: vi.fn(),
        buildHubMenu: vi.fn(),
        dispose: vi.fn(),
    })),
}));

// Controllable version repository + warm.
vi.mock('../src/ui/platform/ProjectRepository', () => ({
    warmVersionCache: vi.fn().mockResolvedValue(undefined),
    versionRepository: {
        getVersions: vi.fn(),
        saveVersionWithMeta: vi.fn(),
    },
}));

// Controllable server fetch — the streamLoad server leg.
vi.mock('@pryzm/core-app-model', () => ({
    apiFetch: vi.fn(),
}));

import { PlatformShell } from '../src/ui/platform/PlatformShell';
import { versionRepository } from '../src/ui/platform/ProjectRepository';
import { apiFetch } from '@pryzm/core-app-model';
import type { VersionRecord } from '../src/ui/platform/PlatformShellTypes';

const apiFetchMock = apiFetch as unknown as Mock;
const getVersionsMock = versionRepository.getVersions as unknown as Mock;

function makeLocalVersion(projectId: string): VersionRecord {
    return {
        id: 'ver-local-1',
        projectId,
        label: 'Auto-save',
        timestamp: 1_700_000_000_000,
        elementCount: 2,
        snapshot: {
            projectId,
            projectName: 'Local',
            elementCount: 2,
            walls: [{ id: 'wall-a' }, { id: 'wall-b' }],
            slabs: [], furniture: [], levels: [], grids: [], columns: [],
            stairs: [], beams: [], curtainWalls: [], roofs: [], handrails: [],
            plumbing: [], windows: [], doors: [],
            viewDefinitions: [], visibilityRules: [], semanticIndex: {}, vgGovernance: {},
            sheets: [], schedules: [], schemaVersion: 1,
        } as unknown as VersionRecord['snapshot'],
        syncStatus: 'synced',
    };
}

/** Build a PlatformShell whose active project is `projectId`, ready to drive the
 *  server-leg fallback directly. */
function makeShell(projectId: string): {
    shell: PlatformShell;
    loadVersion: Mock;
    emit: Mock;
} {
    const emit = vi.fn();
    (globalThis as any).window.runtime = { events: { emit, on: vi.fn() } };

    const shell = new PlatformShell({} as any, { load: vi.fn() } as any, null);
    const anyShell = shell as any;
    anyShell.ctx.activeProjectId = projectId;
    anyShell.ctx.projectId = projectId;
    anyShell.ctx.projectName = 'P';
    return { shell, loadVersion: anyShell.versionCtrl.loadVersion as Mock, emit };
}

describe('§FIX-PROJECT-OPEN-STREAMLOAD-FALLBACK — server-404 open falls back to local', () => {
    beforeEach(() => {
        (globalThis as any).window = (globalThis as any).window ?? {};
        getVersionsMock.mockReset();
        apiFetchMock.mockReset();
    });
    afterEach(() => {
        vi.clearAllMocks();
        delete (globalThis as any).window.runtime;
    });

    it('restores the latest LOCAL version when the server returns 404', async () => {
        const projectId = 'proj-only-local';
        getVersionsMock.mockReturnValue([makeLocalVersion(projectId)]);
        apiFetchMock.mockResolvedValue({ ok: false, status: 404 });

        const { shell, loadVersion, emit } = makeShell(projectId);
        await (shell as any)._loadLatestVersionFromServer(projectId);

        // The local snapshot (with its elements) was restored…
        expect(loadVersion).toHaveBeenCalledTimes(1);
        const restored = loadVersion.mock.calls[0]![0] as VersionRecord;
        expect((restored.snapshot as unknown as { walls: { id: string }[] }).walls.map(w => w.id))
            .toEqual(['wall-a', 'wall-b']);
        // …and the project did NOT resolve as empty.
        const emptyEmits = emit.mock.calls.filter(
            ([topic, payload]) => topic === 'pryzm-project-loaded' && (payload as any)?.empty === true,
        );
        expect(emptyEmits.length).toBe(0);
    });

    it('opens empty only when the server 404s AND there is no local snapshot', async () => {
        const projectId = 'proj-nothing';
        getVersionsMock.mockReturnValue([]);
        apiFetchMock.mockResolvedValue({ ok: false, status: 404 });

        const { shell, loadVersion, emit } = makeShell(projectId);
        await (shell as any)._loadLatestVersionFromServer(projectId);

        expect(loadVersion).not.toHaveBeenCalled();
        const emptyEmits = emit.mock.calls.filter(
            ([topic, payload]) => topic === 'pryzm-project-loaded' && (payload as any)?.empty === true,
        );
        expect(emptyEmits.length).toBe(1);
    });

    it('falls back to local when the server response has {version:null}', async () => {
        const projectId = 'proj-null-version';
        getVersionsMock.mockReturnValue([makeLocalVersion(projectId)]);
        apiFetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: null }) });

        const { shell, loadVersion, emit } = makeShell(projectId);
        await (shell as any)._loadLatestVersionFromServer(projectId);

        expect(loadVersion).toHaveBeenCalledTimes(1);
        const emptyEmits = emit.mock.calls.filter(
            ([topic, payload]) => topic === 'pryzm-project-loaded' && (payload as any)?.empty === true,
        );
        expect(emptyEmits.length).toBe(0);
    });

    it('still loads the SERVER version when one exists (no regression)', async () => {
        const projectId = 'proj-server';
        getVersionsMock.mockReturnValue([]); // local empty — server must carry it
        apiFetchMock.mockResolvedValue({
            ok: true,
            json: async () => ({
                version: {
                    id: 'ver-server-1',
                    label: 'Server v1',
                    element_count: 3,
                    created_at: new Date(1_700_000_000_000).toISOString(),
                    snapshot: { projectName: 'Server', walls: [{ id: 'w1' }] },
                },
            }),
        });

        const { shell, loadVersion, emit } = makeShell(projectId);
        await (shell as any)._loadLatestVersionFromServer(projectId);

        expect(loadVersion).toHaveBeenCalledTimes(1);
        const restored = loadVersion.mock.calls[0]![0] as VersionRecord;
        expect(restored.id).toBe('ver-server-1');
        // getVersions must NOT have been consulted for a fallback (server won).
        expect(getVersionsMock).not.toHaveBeenCalled();
        const emptyEmits = emit.mock.calls.filter(
            ([topic, payload]) => topic === 'pryzm-project-loaded' && (payload as any)?.empty === true,
        );
        expect(emptyEmits.length).toBe(0);
    });
});
