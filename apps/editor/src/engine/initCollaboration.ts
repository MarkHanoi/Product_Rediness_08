/**
 * initCollaboration — Phase F-1 subsystem initializer.
 *
 * Creates the Socket.io client for real-time collaboration:
 *   - Cursor presence: shows remote user cursors as overlays in the 3D viewport
 *   - Command sync: broadcasts locally-executed commands to collaborators
 *   - Remote command reception: dispatches pryzm-remote-command CustomEvent
 *     for future Phase E-2 CRDT/OT handlers to consume
 *
 * Extracted as a NEW subsystem (EngineBootstrap decomposition — Phase F-1).
 * Collaboration wiring did not previously exist in EngineBootstrap; this
 * module creates the client-side collaboration infrastructure.
 *
 * Lifecycle:
 *   1. initCollaboration() runs at the end of bootstrap — sets up event
 *      listeners but does NOT yet connect to the socket server.
 *   2. PlatformShell fires "pryzm-project-loaded" → module connects the
 *      socket and joins the project room.
 *   3. PlatformShell fires "pryzm-go-hub" → module leaves the project room
 *      and suspends collaboration until the next project is opened.
 *
 * Socket protocol (server in server.js):
 *   Emits:
 *     join-project(projectId: string)
 *     leave-project(projectId: string)
 *     command-executed({ projectId, commandType })
 *     cursor-move({ projectId, x, y })
 *   Listens:
 *     join-project-denied({ projectId, reason })
 *     user-joined({ userId })
 *     user-left({ userId })
 *     remote-command({ projectId, commandType, ...payload })
 *     remote-cursor({ userId, projectId, x, y })
 *
 * Contracts:
 *   §01-BIM-ENGINE-CORE-CONTRACT §9 — engine-layer only; must not be
 *     imported by UI components.
 *   §07-BIM-SECURITY-CONTRACT — Socket connects to same-origin server only;
 *     no external WebSocket hosts.
 *   §01 §2.1 — No direct store mutation from this module.
 */

import type { CommandManager } from '@pryzm/command-registry';
import { CommandType, type Command, type SerializedCommand } from '@pryzm/command-registry';
import { apiFetch, getStoredToken } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import type { VisibilityIntent } from '@pryzm/core-app-model';
import { RemoteCommandDispatcher, type SuppressBroadcastRef } from './RemoteCommandDispatcher';
import type { TypedEventEmitter, RuntimeEvents } from '@pryzm/runtime-composer/types';

// ── Cursor color palette ────────────────────────────────────────────────────
const CURSOR_COLORS: readonly string[] = [
    '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
    '#1ABC9C', '#E67E22', '#2980B9', '#27AE60', '#8E44AD',
];

// ── Remote command toast notification ──────────────────────────────────────
// Phase E-3: last-write-wins conflict strategy — show a brief toast whenever
// a collaborator executes a command so the local user knows the model changed.

const COMMAND_LABELS: Record<string, string> = {
    CreateWallCommand:           'wall created',
    DeleteWallCommand:           'wall deleted',
    UpdateWallCommand:           'wall updated',
    CreateDoorCommand:           'door created',
    CreateWindowCommand:         'window created',
    CreateRoomCommand:           'room created',
    DeleteRoomCommand:           'room deleted',
    UpdateRoomDataCommand:       'room updated',
    CreateColumnCommand:         'column created',
    UpdateColumnCommand:         'column updated',
    DeleteColumnCommand:         'column deleted',
    CreateFloorCommand:          'floor created',
    CreateCeilingCommand:        'ceiling created',
    CreateSlabCommand:           'slab created',
    UpdateSlabCommand:           'slab updated',
    CreateBeamCommand:           'beam created',
    CreateStairsCommand:         'stairs created',
    CreateCurtainWallCommand:    'curtain wall created',
    CreateTemplateCommand:       'template created',
    UpdateTemplateCommand:       'template updated',
    DeleteTemplateCommand:       'template deleted',
    AssignRoomToUnitCommand:     'room assigned to unit',
    CreateWallOpeningCommand:    'wall opening created',
};

function normalizeRemoteIntent(raw: any): VisibilityIntent | null {
    if (!raw?.id || !raw?.name) return null;
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description ?? '',
        version: raw.version ?? 1,
        isSystem: false,
        createdAt: raw.createdAt ?? new Date().toISOString(),
        updatedAt: raw.updatedAt ?? new Date().toISOString(),
        elementRules: raw.elementRules ?? raw.rules ?? {},
        viewTypeModifiers: raw.viewTypeModifiers ?? raw.modifiers ?? [],
        purposeModifiers: raw.purposeModifiers ?? [],
        planViewRange: raw.planViewRange ?? null,
    };
}

let _toastContainer: HTMLElement | null = null;

function _ensureToastContainer(): HTMLElement {
    if (_toastContainer && document.body.contains(_toastContainer)) {
        return _toastContainer;
    }
    const el = document.createElement('div');
    el.id = 'pryzm-collab-toasts';
    el.style.cssText = [
        'position:fixed',
        'bottom:80px',
        'right:16px',
        'z-index:9999',
        'display:flex',
        'flex-direction:column',
        'gap:6px',
        'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
    _toastContainer = el;
    return el;
}

function showRemoteCommandToast(commandType: string, color: string): void {
    const label = COMMAND_LABELS[commandType] ?? commandType.replace(/Command$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const container = _ensureToastContainer();

    const toast = document.createElement('div');
    toast.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:8px 12px',
        'background:#1a2035ee',
        'border:1px solid ' + color,
        'border-radius:6px',
        'color:#fff',
        'font-size:12px',
        'font-family:system-ui,sans-serif',
        'box-shadow:0 2px 8px #0004',
        'opacity:1',
        'transition:opacity 0.4s ease',
    ].join(';');

    const dot = document.createElement('span');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`;
    toast.appendChild(dot);

    const msg = document.createElement('span');
    msg.textContent = `Collaborator: ${label}`;
    toast.appendChild(msg);

    container.appendChild(toast);

    // Auto-dismiss after 3.5 s
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 450);
    }, 3500);
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface CollaborationHandle {
    /** Disconnect the collaboration socket and clean up all cursors. */
    disconnect(): void;
}

export interface CollaborationResult {
    handle: CollaborationHandle;
}

// ── initCollaboration ───────────────────────────────────────────────────────

export function initCollaboration(params: {
    /** The 3D viewport container.  Cursor overlays are appended here. */
    container: HTMLElement;
    /** CommandManager — subscription fires after each local command executes. */
    commandManager: CommandManager;
    /** Typed event emitter from runtime.events — replaces DOM CustomEvent dispatches (F.events.2a).
     *  When null/undefined the collaboration socket still works but no typed events are emitted. */
    events?: TypedEventEmitter<RuntimeEvents> | null;
}): CollaborationResult {
    const { container, commandManager, events } = params;

    // ── Module-level state ──────────────────────────────────────────────────

    /** Active socket.io socket; null when not connected. */
    let socket: any = null;

    /** projectId of the currently open project; null before pryzm-project-loaded. */
    let currentProjectId: string | null = null;

    /** Unsubscribe function returned by CommandManager.onCommandExecuted(). */
    let unsubscribeCommands: (() => void) | null = null;

    /** Map: userId → cursor overlay DOM element. */
    const remoteCursors = new Map<string, HTMLElement>();

    /** Map: userId → assigned color. */
    const userColorMap  = new Map<string, string>();
    let   colorIndex    = 0;

    /** Map: userId → idle timeout handle (§50 §5.3 — cursor hidden after 5 s). */
    const cursorTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

    /** Map: userId → display name (from server-enriched events). */
    const userDisplayNames = new Map<string, string>();
    let suppressOutboundVisibilityIntentEvents = false;
    let intentUpdateTimer: number | null = null;

    // ── Remote command dispatcher (Phase E-2) ───────────────────────────────
    // Ref shared between the broadcast guard and the dispatcher so that
    // commands executed with source:'REMOTE' are never re-broadcast back.
    const suppressBroadcast: SuppressBroadcastRef = { value: false };
    const dispatcher = new RemoteCommandDispatcher(commandManager, suppressBroadcast);

    // ── Cursor overlay container ────────────────────────────────────────────
    // Transparent absolute div sits over the viewport (pointer-events:none)
    // so it never intercepts mouse events destined for Three.js / OBC tools.

    const cursorOverlay = document.createElement('div');
    cursorOverlay.id = 'pryzm-collab-cursor-overlay';
    cursorOverlay.style.cssText = [
        'position:absolute',
        'inset:0',
        'pointer-events:none',
        'overflow:hidden',
        'z-index:10',
    ].join(';');

    // Ensure the viewport container has a positioning context so `inset:0` works.
    if (!container.style.position) {
        container.style.position = 'relative';
    }
    container.appendChild(cursorOverlay);

    // ── Color helpers ───────────────────────────────────────────────────────

    function colorForUser(userId: string): string {
        if (!userColorMap.has(userId)) {
            userColorMap.set(
                userId,
                CURSOR_COLORS[colorIndex++ % CURSOR_COLORS.length] as string,
            );
        }
        return userColorMap.get(userId)!;
    }

    // ── Cursor DOM helpers (§50 CP-1) ───────────────────────────────────────

    /**
     * Derive a short display label from a server-resolved display name.
     * Shows the first given name, falling back to the first 6 chars of userId.
     */
    function labelFor(displayName: string | undefined, userId: string): string {
        if (displayName) {
            const first = displayName.trim().split(/\s+/)[0] ?? '';
            if (first.length > 0) return first;
        }
        return userId.slice(0, 6);
    }

    function getOrCreateCursor(userId: string, displayName?: string): HTMLElement {
        // Cache display name if provided by server
        if (displayName) userDisplayNames.set(userId, displayName);

        if (remoteCursors.has(userId)) {
            // Update label text when displayName arrives after first render
            const existing = remoteCursors.get(userId)!;
            const lbl = existing.querySelector('[data-cursor-label]') as HTMLElement | null;
            if (lbl) lbl.textContent = labelFor(userDisplayNames.get(userId), userId);
            return existing;
        }

        const color = colorForUser(userId);

        const wrapper = document.createElement('div');
        wrapper.dataset.collabUserId = userId;
        wrapper.style.cssText = [
            'position:absolute',
            'pointer-events:none',
            'display:flex',
            'flex-direction:column',
            'align-items:flex-start',
            'gap:2px',
            'transition:left 0.06s linear,top 0.06s linear',
        ].join(';');

        // SVG cursor arrow (§50 §5.1)
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '18');
        svg.setAttribute('viewBox', '0 0 14 18');
        svg.style.cssText = 'display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));';

        const path = document.createElementNS(svgNS, 'path');
        // Classic cursor arrow shape
        path.setAttribute('d', 'M0 0 L0 14 L3.5 10.5 L6.5 17 L8.5 16 L5.5 9 L10 9 Z');
        path.setAttribute('fill', color);
        path.setAttribute('stroke', 'white');
        path.setAttribute('stroke-width', '1.2');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);

        // Name label below cursor
        const label = document.createElement('div');
        label.dataset.cursorLabel = '1';
        label.textContent = labelFor(displayName, userId);
        label.style.cssText = [
            `background:${color}`,
            'color:#fff',
            'font-size:10px',
            'font-weight:600',
            'font-family:var(--app-font,-apple-system,sans-serif)',
            'border-radius:3px',
            'padding:2px 5px',
            'white-space:nowrap',
            'opacity:0.92',
            'margin-left:4px',
            'box-shadow:0 1px 3px rgba(0,0,0,0.3)',
            'max-width:100px',
            'overflow:hidden',
            'text-overflow:ellipsis',
        ].join(';');

        wrapper.appendChild(svg);
        wrapper.appendChild(label);
        cursorOverlay.appendChild(wrapper);
        remoteCursors.set(userId, wrapper);
        return wrapper;
    }

    /**
     * Reset the idle timeout for a cursor (§50 §5.3).
     * Hides cursor after 5 s of inactivity; shows again on next move event.
     */
    function resetCursorTimeout(userId: string): void {
        const existing = cursorTimeouts.get(userId);
        if (existing !== undefined) clearTimeout(existing);

        const handle = setTimeout(() => {
            const el = remoteCursors.get(userId);
            if (el) el.style.display = 'none';
            cursorTimeouts.delete(userId);
        }, 5000);

        cursorTimeouts.set(userId, handle);

        // Ensure visible when activity resumes
        const el = remoteCursors.get(userId);
        if (el) el.style.display = 'flex';
    }

    function removeCursor(userId: string): void {
        const timeout = cursorTimeouts.get(userId);
        if (timeout !== undefined) { clearTimeout(timeout); cursorTimeouts.delete(userId); }
        const el = remoteCursors.get(userId);
        if (el) {
            el.remove();
            remoteCursors.delete(userId);
        }
        userDisplayNames.delete(userId);
    }

    function clearAllCursors(): void {
        cursorTimeouts.forEach(t => clearTimeout(t));
        cursorTimeouts.clear();
        remoteCursors.forEach(el => el.remove());
        remoteCursors.clear();
        userDisplayNames.clear();
    }

    // ── Socket setup ────────────────────────────────────────────────────────

    /**
     * Register all socket event handlers and start emitting cursor positions.
     * Called once socket.io is loaded and a projectId is known.
     */
    function connectSocket(projectId: string, ioFn: (opts?: object) => any): void {
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        clearAllCursors();

        // §07-BIM-SECURITY-CONTRACT: no-origin option omitted → defaults to
        // same-origin (window.location).  Never pass an external host here.
        const _authToken = getStoredToken();
        socket = ioFn({
            transports: ['websocket', 'polling'],
            auth: _authToken ? { token: _authToken } : {},
        });

        // ── Lifecycle ───────────────────────────────────────────────────────

        socket.on('connect', () => {
            console.log('[initCollaboration] Socket connected — joining project room:', projectId);
            socket.emit('join-project', projectId);

            // Phase E-2: catch-up replay — fetch commands we missed while disconnected/offline
            _triggerCatchUp(projectId).catch(err => {
                console.warn('[initCollaboration] Catch-up request failed:', err?.message ?? err);
            });
        });

        socket.on('join-project-denied', (data: { projectId: string; reason: string }) => {
            console.warn(
                '[initCollaboration] join-project denied for', data.projectId,
                '— reason:', data.reason,
            );
        });

        socket.on('user-joined', (data: { userId: string; displayName?: string }) => {
            console.log('[initCollaboration] Collaborator joined:', data.userId, data.displayName);
            const color = colorForUser(data.userId);
            if (data.displayName) userDisplayNames.set(data.userId, data.displayName);
            // §50 §5.5 — emit presence event for Presence Strip (PlatformShell)
            events?.emit('pryzm-presence-added', { userId: data.userId, displayName: data.displayName, color }); // F.events.2a
        });

        socket.on('user-left', (data: { userId: string }) => {
            console.log('[initCollaboration] Collaborator left:', data.userId);
            removeCursor(data.userId);
            // §50 §5.5
            events?.emit('pryzm-presence-removed', { userId: data.userId }); // F.events.2a
        });

        socket.on('disconnect', (reason: string) => {
            console.log('[initCollaboration] Socket disconnected:', reason);
            clearAllCursors();
            // §50 §5.5
            events?.emit('pryzm-presence-cleared', {}); // F.events.2a
        });

        socket.on('connect_error', (err: Error) => {
            console.warn('[initCollaboration] Socket connection error:', err.message);
        });

        // ── Remote cursor reception ─────────────────────────────────────────

        socket.on('remote-cursor', (data: { userId: string; displayName?: string; x: number; y: number }) => {
            const cursor = getOrCreateCursor(data.userId, data.displayName);
            cursor.style.left = `${data.x}px`;
            cursor.style.top  = `${data.y}px`;
            resetCursorTimeout(data.userId);
        });

        // ── Remote command reception (Phase E-2) ───────────────────────────
        // Receive a full SerializedCommand from a collaborator, reconstruct
        // the typed Command via CommandRegistry, and execute it locally through
        // CommandManager with source:'REMOTE' (suppresses re-broadcast).

        socket.on('remote-command', (data: {
            projectId: string;
            commandType: string;
            userId?: string;
            payload?: SerializedCommand;
            [key: string]: unknown;
        }) => {
            console.log('[initCollaboration] Remote command received:', data.commandType);

            // Always show a toast — even if we apply the command, the user
            // benefits from knowing a collaborator is actively working.
            const userId = data.userId as string | undefined;
            const color  = userId ? colorForUser(userId) : CURSOR_COLORS[0] as string;
            showRemoteCommandToast(data.commandType, color);

            // Update the lastSync timestamp for this project so catch-up
            // on the next reconnect starts from now.
            if (currentProjectId) {
                const storageKey = `pryzm:lastSync:${currentProjectId}`;
                sessionStorage.setItem(storageKey, new Date().toISOString());
            }

            // Attempt to apply the full serialized command locally.
            // Falls back gracefully (toast-only) for unregistered types.
            if (data.payload && typeof data.payload === 'object') {
                const outcome = dispatcher.dispatch(data.payload as SerializedCommand);
                if (outcome === 'applied') {
                    console.log('[initCollaboration] Remote command applied to local model:', data.commandType);
                }
            } else {
                console.info(
                    '[initCollaboration] Remote command has no payload — toast-only:',
                    data.commandType,
                );
            }

            // Typed runtime event for any other subscribers (F.events.2a).
            events?.emit('pryzm-remote-command', data); // F.events.2a
        });

        socket.on('vi:intent-updated', async (data: { projectId: string; intentId: string }) => {
            if (!data?.intentId || data.projectId !== currentProjectId) return;
            try {
                const res = await apiFetch(`/api/projects/${data.projectId}/visibility-intents`);
                if (!res.ok) throw new Error(await res.text());
                const payload = await res.json();
                const remote = normalizeRemoteIntent((payload.intents ?? []).find((i: any) => i.id === data.intentId));
                if (!remote) return;
                suppressOutboundVisibilityIntentEvents = true;
                if (visibilityIntentStore.has(remote.id)) {
                    visibilityIntentStore.update(remote.id, {
                        name: remote.name,
                        description: remote.description,
                        elementRules: remote.elementRules,
                        viewTypeModifiers: remote.viewTypeModifiers,
                        purposeModifiers: remote.purposeModifiers,
                        planViewRange: remote.planViewRange,
                    });
                } else {
                    visibilityIntentStore.create(remote);
                }
                events?.emit('vi:intent-remote-synced', { intentId: remote.id }); // F.events.2a
            } catch (err) {
                console.warn('[initCollaboration] Failed to sync remote visibility intent', err);
            } finally {
                setTimeout(() => { suppressOutboundVisibilityIntentEvents = false; }, 0);
            }
        });

        // Stage S8 — receive instance/overrides updates from peers.
        socket.on('vi:instance-updated', (data: { projectId: string; viewId: string; intentId?: string }) => {
            if (!data?.viewId || data.projectId !== currentProjectId) return;
            suppressOutboundVisibilityIntentEvents = true;
            try {
                if (data.intentId && viewIntentInstanceStore.has(data.viewId)) {
                    viewIntentInstanceStore.assign(data.viewId, data.intentId);
                }
                events?.emit('vi:instance-remote-synced', { projectId: data.projectId, viewId: data.viewId, intentId: data.intentId }); // F.events.2a
            } finally {
                setTimeout(() => { suppressOutboundVisibilityIntentEvents = false; }, 0);
            }
        });
        socket.on('vi:overrides-cleared', (data: { projectId: string; viewId: string }) => {
            if (!data?.viewId || data.projectId !== currentProjectId) return;
            suppressOutboundVisibilityIntentEvents = true;
            try {
                viewIntentInstanceStore.clearOverrides(data.viewId);
                events?.emit('vi:overrides-remote-cleared', { projectId: data.projectId, viewId: data.viewId }); // F.events.2a
            } finally {
                setTimeout(() => { suppressOutboundVisibilityIntentEvents = false; }, 0);
            }
        });

        socket.on('vi:override-set', (data: { projectId: string; viewId: string }) => {
            if (!data?.viewId || data.projectId !== currentProjectId) return;
            // Phase 6.2 — invalidate the local ViewIntentInstance drawing cache for
            // the affected view so it reprojects with the remote override applied.
            const instance = viewIntentInstanceStore.get(data.viewId);
            if (instance) {
                events?.emit('vi:instance-updated', { viewId: data.viewId, instanceId: instance.id }); // F.events.2b
            }
            events?.emit('vi:remote-override-set', { projectId: data.projectId, viewId: data.viewId }); // F.events.2a
        });

        // ── Local cursor emission ───────────────────────────────────────────
        // Emits viewport-relative pointer coordinates to the server on every
        // mousemove inside the 3D container.

        const onMouseMove = (e: MouseEvent): void => {
            if (!socket?.connected || !currentProjectId) return;
            const rect = container.getBoundingClientRect();
            socket.emit('cursor-move', {
                projectId: currentProjectId,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        };

        container.addEventListener('mousemove', onMouseMove);

        // Remove the mousemove listener on disconnect to avoid stale closures.
        socket.once('disconnect', () => {
            container.removeEventListener('mousemove', onMouseMove);
        });
    }

    /**
     * Load the socket.io browser client (served by the socket.io server at
     * /socket.io/socket.io.js) and then connect for the given project.
     *
     * Safe to call multiple times — subsequent calls re-connect to the new
     * project room after discarding the previous socket.
     */
    function loadAndConnect(projectId: string): void {
        const connect = (): void => {
            const ioFn = window.io as ((opts?: object) => any) | undefined;
            if (typeof ioFn !== 'function') {
                console.warn(
                    '[initCollaboration] socket.io client not available — collaboration disabled.',
                    'Ensure the server is running with socket.io support.',
                );
                return;
            }
            connectSocket(projectId, ioFn);
        };

        if (window.io) {
            connect();
            return;
        }

        // socket.io server auto-serves the browser bundle at /socket.io/socket.io.js
        const scriptId = 'pryzm-collab-socketio-client';
        if (document.getElementById(scriptId)) {
            // Script tag already injected (e.g. by PlatformShell); wait briefly
            // for the `io` global to be assigned, then connect.
            setTimeout(connect, 300);
            return;
        }

        const script       = document.createElement('script');
        script.id          = scriptId;
        script.src         = '/socket.io/socket.io.js';
        script.onload      = connect;
        script.onerror     = () => {
            console.warn('[initCollaboration] Failed to load /socket.io/socket.io.js');
        };
        document.head.appendChild(script);
    }

    // ── Catch-up (Phase E-2) ────────────────────────────────────────────────
    // After (re)connecting, fetch commands logged since our last session and
    // replay them so the local model is current.
    //
    // Strategy:
    //   1. First connect ever → record now as lastSync, no replay needed
    //      (the user just loaded the latest project snapshot from the server).
    //   2. Reconnect / return to project → replay all commands since lastSync.
    //      Commands already executed locally will silently fail canExecute()
    //      validation, which is the intended idempotency guard.
    //   3. After replay → update lastSync to now.

    async function _triggerCatchUp(projectId: string): Promise<void> {
        const storageKey = `pryzm:lastSync:${projectId}`;
        const lastSync   = sessionStorage.getItem(storageKey);

        // First visit this session — record timestamp and skip replay
        if (!lastSync) {
            sessionStorage.setItem(storageKey, new Date().toISOString());
            console.log('[initCollaboration] Catch-up: first connect — setting baseline timestamp');
            return;
        }

        console.log('[initCollaboration] Catch-up: requesting commands since', lastSync);

        try {
            const res = await apiFetch(
                `/api/projects/${projectId}/commands?since=${encodeURIComponent(lastSync)}`,
            );
            if (!res.ok) {
                console.warn('[initCollaboration] Catch-up: server responded', res.status);
                return;
            }

            const body = await res.json() as { commands?: Array<{ user_id: string; command_type: string; payload: SerializedCommand }> };
            const cmds = body.commands ?? [];

            if (cmds.length === 0) {
                console.log('[initCollaboration] Catch-up: no missed commands');
                return;
            }

            console.log(`[initCollaboration] Catch-up: replaying ${cmds.length} missed command(s)`);

            // Re-attach userId to each SerializedCommand for dispatcher filtering
            const serializeds = cmds.map(c => ({ ...(c.payload ?? {}), userId: c.user_id } as SerializedCommand & { userId: string }));

            const { applied, skipped } = dispatcher.replayCatchUp(serializeds);
            console.log(`[initCollaboration] Catch-up: applied=${applied} skipped=${skipped}`);
        } catch (err) {
            console.warn('[initCollaboration] Catch-up: fetch error', err);
        } finally {
            // Always advance the baseline so next reconnect starts from now
            sessionStorage.setItem(storageKey, new Date().toISOString());
        }
    }

    // ── Command broadcast (Phase E-2) ──────────────────────────────────────
    // Subscribe to CommandManager: after each successful command, broadcast the
    // FULL serialized command payload to the server so collaborators can apply it.
    //
    // Echo-loop guard: suppressBroadcast.value is set to true by
    // RemoteCommandDispatcher while executing a remote command, preventing
    // the command from being re-emitted back to the server.

    // §COLLAB-FILTER: Command types that must never be broadcast to the
    // collaboration socket or persisted in the server-side command log.
    //
    // REDETECT_ROOMS — auto-fired by BatchCoordinator after every batch;
    //   it has no RemoteCommandDispatcher factory so replaying it on reconnect
    //   only emits "[RemoteCommandDispatcher] No factory for type: REDETECT_ROOMS
    //   — toast-only" errors. Room topology is re-derived by replaying the
    //   structural commands (CREATE_WALLS_ON_ALL_SLABS, CREATE_CURTAIN_WALLS_*).
    //
    // CREATE_WALLS_ON_ALL_SLABS / CREATE_CURTAIN_WALLS_ON_ALL_SLABS /
    // CREATE_CURTAIN_WALLS_FROM_SLAB / CREATE_WALLS_FROM_SLAB — AI batch
    //   commands; they are handled by the L2 bus (wall.batch.create /
    //   curtain-wall.batch.create events — §P2e-wall-slab + §P2e-CW-slab)
    //   and must not also be replayed as legacy CommandManager commands,
    //   which would attempt to re-create already-existing elements and flood
    //   the log with "Wall already exists" / "CW already exists" validation failures.
    const COLLAB_BROADCAST_SKIP: ReadonlySet<string> = new Set<string>([
        CommandType.REDETECT_ROOMS,
        CommandType.CREATE_WALLS_ON_ALL_SLABS,
        CommandType.CREATE_CURTAIN_WALLS_ON_ALL_SLABS,
        CommandType.CREATE_CURTAIN_WALLS_FROM_SLAB,
        CommandType.CREATE_WALLS_FROM_SLAB,
    ]);

    unsubscribeCommands = commandManager.onCommandExecuted((cmd: Command) => {
        // Echo-loop prevention: skip re-broadcast of remotely-applied commands
        if (suppressBroadcast.value) return;
        if (!socket?.connected || !currentProjectId) return;

        // §COLLAB-FILTER: skip auto-generated and L2-bus-handled commands.
        if (COLLAB_BROADCAST_SKIP.has(cmd.type)) return;

        // Serialize the full command payload for over-wire transmission
        let serialized: SerializedCommand | null = null;
        try {
            serialized = cmd.serialize ? cmd.serialize() : null;
        } catch {
            serialized = null;
        }

        socket.emit('command-executed', {
            projectId:   currentProjectId,
            commandType: cmd.type,
            payload:     serialized,   // Full SerializedCommand for remote replay
        });

        if (cmd.type === CommandType.SET_GRAPHIC_OVERRIDE || cmd.type === CommandType.CLEAR_OVERRIDE || cmd.type === CommandType.CLEAR_ALL_OVERRIDES) {
            socket.emit('vi:override-set', {
                projectId: currentProjectId,
                viewId: (cmd as any).serialize?.().payload?.viewId ?? cmd.targetIds?.[0],
                commandType: cmd.type,
            });
        }
    });

    const onLocalIntentUpdated = (e: Event): void => {
        if (suppressOutboundVisibilityIntentEvents || !socket?.connected || !currentProjectId) return;
        const intentId = (e as CustomEvent<{ intentId?: string }>).detail?.intentId;
        if (!intentId) return;
        if (intentUpdateTimer !== null) window.clearTimeout(intentUpdateTimer);
        intentUpdateTimer = window.setTimeout(() => {
            if (!socket?.connected || !currentProjectId) return;
            socket.emit('vi:intent-updated', { projectId: currentProjectId, intentId });
            intentUpdateTimer = null;
        }, 300);
    };

    window.addEventListener('vi:intent-updated', onLocalIntentUpdated);

    // ── Stage S8 — collaboration relay for instance + overrides-cleared events ──
    let instanceUpdateTimer: number | null = null;
    // F.events.2b — migrated from DOM CustomEvent listener to runtime.events.on().
    // The only dispatch of 'vi:instance-updated' is now events?.emit(...) (typed).
    // intentId was always undefined from this dispatch path (detail had viewId + instanceId only).
    const onLocalInstanceUpdated = ({ viewId }: { viewId: string; instanceId: string }): void => {
        if (suppressOutboundVisibilityIntentEvents || !socket?.connected || !currentProjectId) return;
        if (!viewId) return;
        if (instanceUpdateTimer !== null) window.clearTimeout(instanceUpdateTimer);
        instanceUpdateTimer = window.setTimeout(() => {
            if (!socket?.connected || !currentProjectId) return;
            socket.emit('vi:instance-updated', { projectId: currentProjectId, viewId });
            instanceUpdateTimer = null;
        }, 300);
    };
    const onLocalOverridesCleared = (e: Event): void => {
        if (suppressOutboundVisibilityIntentEvents || !socket?.connected || !currentProjectId) return;
        const detail = (e as CustomEvent<{ viewId?: string }>).detail ?? {};
        if (!detail.viewId) return;
        socket.emit('vi:overrides-cleared', { projectId: currentProjectId, viewId: detail.viewId });
    };
    events?.on('vi:instance-updated', onLocalInstanceUpdated); // F.events.2b — was window.addEventListener (DOM); now typed runtime.events
    window.addEventListener('vi:overrides-cleared', onLocalOverridesCleared);

    // ── Project lifecycle listeners ─────────────────────────────────────────

    const onProjectLoaded = (payload: unknown): void => {
        const detail = (payload as { projectId?: string } | undefined) ?? {};
        const projectId = detail.projectId;
        if (!projectId) return;

        currentProjectId = projectId;
        window.currentProjectId = projectId;
        loadAndConnect(projectId);
        console.log('[initCollaboration] Project opened — collaboration active for', projectId);
    };

    const onGoHub = (): void => {
        if (socket && currentProjectId) {
            try { socket.emit('leave-project', currentProjectId); } catch { /* best effort */ }
        }
        socket?.disconnect();
        socket = null;
        currentProjectId = null;
        window.currentProjectId = null;
        clearAllCursors();
        console.log('[initCollaboration] Returned to hub — collaboration suspended');
    };

    let _unsubProjectLoaded: (() => void) | null = window.runtime?.events?.on('pryzm-project-loaded', onProjectLoaded) ?? null; // F.events.9
    let _unsubGoHub: (() => void) | null = window.runtime?.events?.on('pryzm-go-hub', onGoHub) ?? null; // F.events.12

    console.log('[initCollaboration] Collaboration subsystem initialised — waiting for pryzm-project-loaded');

    // ── Public handle ───────────────────────────────────────────────────────

    const handle: CollaborationHandle = {
        disconnect(): void {
            // Unsubscribe command broadcast
            unsubscribeCommands?.();
            unsubscribeCommands = null;

            // Leave project room and disconnect socket
            if (socket && currentProjectId) {
                try { socket.emit('leave-project', currentProjectId); } catch { /* best effort */ }
            }
            socket?.disconnect();
            socket = null;
            currentProjectId = null;
            window.currentProjectId = null;

            // Remove all cursor overlays and the overlay container
            clearAllCursors();
            cursorOverlay.remove();

            // Remove window listeners
            _unsubProjectLoaded?.(); _unsubProjectLoaded = null; // F.events.9
            _unsubGoHub?.(); _unsubGoHub = null; // F.events.12
            window.removeEventListener('vi:intent-updated', onLocalIntentUpdated);
            if (intentUpdateTimer !== null) window.clearTimeout(intentUpdateTimer);

            console.log('[initCollaboration] Collaboration handle disposed');
        },
    };

    return { handle };
}
