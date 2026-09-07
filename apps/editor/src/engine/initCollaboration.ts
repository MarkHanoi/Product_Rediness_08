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
import { apiFetch, getStoredToken, getCurrentUserId } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import type { VisibilityIntent } from '@pryzm/core-app-model';
import { getFrameScheduler, deferWork } from '@pryzm/frame-scheduler';
import { RemoteCommandDispatcher, type SuppressBroadcastRef } from './RemoteCommandDispatcher';
import {
    classifyOutbound,
    createCursorEmitter,
    isDeliverable,
    UndeliveredCommandLedger,
    volatileEmit,
} from './collabOutbound';
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

/**
 * §FIX-DB-SATURATION-RESILIENCE (L-137/L-136) — a single, self-replacing status
 * toast for the collaboration-join lifecycle. Used to show "Reconnecting…" during
 * bounded join retries and a clickable "Retry" affordance when automatic retries
 * are exhausted — so a transient DB error surfaces as an actionable message
 * instead of a silent grey card.
 *
 * When `onRetry` is null the toast auto-dismisses (transient status). When
 * provided, it stays until clicked and invokes the callback.
 */
function showJoinStatusToast(message: string, onRetry: (() => void) | null): void {
    const container = _ensureToastContainer();
    // Only one join-status toast at a time — replace any previous one.
    container.querySelectorAll('[data-pryzm-join-status]').forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.dataset.pryzmJoinStatus = '1';
    toast.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:8px 12px',
        'background:#1a2035ee',
        'border:1px solid #6600FF',
        'border-radius:6px',
        'color:#fff',
        'font-size:12px',
        'font-family:system-ui,sans-serif',
        'box-shadow:0 2px 8px #0004',
        // Interactive toasts must receive clicks (container is pointer-events:none).
        onRetry ? 'pointer-events:auto' : 'pointer-events:none',
        'cursor:' + (onRetry ? 'pointer' : 'default'),
    ].join(';');

    const msg = document.createElement('span');
    msg.textContent = message;
    toast.appendChild(msg);

    if (onRetry) {
        const btn = document.createElement('button');
        btn.textContent = 'Retry';
        btn.style.cssText = [
            'margin-left:6px',
            'padding:2px 10px',
            'background:#6600FF',
            'color:#fff',
            'border:none',
            'border-radius:4px',
            'font-size:12px',
            'font-weight:600',
            'cursor:pointer',
        ].join(';');
        btn.addEventListener('click', () => {
            toast.remove();
            onRetry();
        });
        toast.appendChild(btn);
    }

    container.appendChild(toast);

    if (!onRetry) {
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 450);
        }, 3500);
    }
}

// ── Catch-up baseline (§FIX-REPLAY-AT-MOST-ONCE, L-814) ─────────────────────

/** The shape of `GET /api/projects/:id/commands` that the baseline depends on. */
export interface CatchUpResponse {
    commands?: Array<{ created_at?: string }> | undefined;
    /** The server's own clock, echoed on every response. */
    serverNow?: string | undefined;
}

/**
 * §FIX-REPLAY-AT-MOST-ONCE (L-814) — decide the next `lastSync` baseline.
 *
 * ROOT CAUSE this closes (BASELINE DRIFT): the baseline is sent to the server as
 * `?since=` and compared there against `project_command_log.created_at` — a SERVER
 * timestamp. The old code stamped it from the CLIENT clock
 * (`sessionStorage.setItem(key, new Date().toISOString())`, in `_triggerCatchUp`'s
 * `finally` AND on every live `remote-command`). The two clocks are unrelated, and
 * the error does not self-correct:
 *
 *   • client clock BEHIND the server → the baseline never advances past rows the
 *     client already has, so EVERY reconnect re-requests the same window forever.
 *     Combined with the missing own-origin filter, that is the founder's model
 *     mutating itself "after a while without touching the project" — the tab
 *     sleeps, BFCache kills the socket, it reconnects, and the window replays.
 *   • client clock AHEAD of the server → a peer's real edits are silently SKIPPED.
 *
 * The baseline is therefore advanced ONLY in server time: the newest `created_at`
 * actually received, else the server's echoed `serverNow`. When neither is
 * available the PREVIOUS baseline is kept rather than guessed — a stale baseline
 * costs one redundant (and now idempotent) request; a wrong one loses data.
 *
 * Pure and total: never throws, never reads a clock.
 */
export function nextCatchUpBaseline(previous: string | null, response: CatchUpResponse): string | null {
    let newest: string | null = null;
    for (const c of response.commands ?? []) {
        const at = c?.created_at;
        if (typeof at === 'string' && at.length > 0 && (newest === null || at > newest)) {
            newest = at;
        }
    }
    return newest ?? (typeof response.serverNow === 'string' && response.serverNow.length > 0
        ? response.serverNow
        : previous);
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

    /**
     * §OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET (L-13208 · C08 §3.3.1) — every local command
     * this client REFUSED TO PUT ON THE WIRE, for the whole session.
     *
     * `command-executed` is not a notification: server-side it is BOTH the peer broadcast AND
     * the only writer of `project_command_log`, the table catch-up replays from. An emit
     * dropped here is therefore absent from every peer AND from the log, so no catch-up by
     * anyone can ever recover it — and `_triggerCatchUp` (inbound-only, `excludeSelf=1`) is
     * structurally incapable of noticing. Before this ledger, "nothing was lost" and "eleven of
     * your edits never left the browser" printed the same line.
     */
    const undeliveredCommands = new UndeliveredCommandLedger();

    // ── §FIX-DB-SATURATION-RESILIENCE (L-137/L-136) — bounded join retry ────────
    // When the server can't VERIFY project access because the DB is transiently
    // degraded (saturated Supabase pooler) it replies join-project-denied with
    // `{ retryable:true, code:'db_unavailable' }` (server/projectAccess.js +
    // server.js join-project handler). That is NOT a permanent denial, so instead
    // of leaving the project silently un-joined (the "grey card" symptom) we retry
    // the join with bounded exponential backoff (~30s budget), then surface a
    // "couldn't open — retry" affordance. A genuine denial (not owner / not found)
    // is NOT retried.
    const JOIN_RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000]; // ≈30s total budget
    let joinRetryAttempt = 0;
    let joinRetryTimer: ReturnType<typeof setTimeout> | null = null;

    function clearJoinRetry(): void {
        if (joinRetryTimer !== null) { clearTimeout(joinRetryTimer); joinRetryTimer = null; }
    }

    function scheduleJoinRetry(projectId: string): void {
        if (joinRetryAttempt >= JOIN_RETRY_BACKOFF_MS.length) {
            console.warn(
                '[initCollaboration] join-project still failing after ' +
                `${JOIN_RETRY_BACKOFF_MS.length} retries (transient DB) — giving up automatic retry.`,
            );
            // Surface a manual "retry" affordance instead of a silent grey card.
            showJoinStatusToast('Couldn’t open collaboration — server busy.', () => {
                joinRetryAttempt = 0;
                if (socket?.connected && currentProjectId === projectId) {
                    console.log('[initCollaboration] Manual retry — re-joining project room:', projectId);
                    socket.emit('join-project', projectId);
                }
            });
            return;
        }
        const delay = JOIN_RETRY_BACKOFF_MS[joinRetryAttempt++] as number;
        console.warn(
            `[initCollaboration] join-project denied (transient DB) — retry ${joinRetryAttempt}/` +
            `${JOIN_RETRY_BACKOFF_MS.length} in ${delay}ms.`,
        );
        showJoinStatusToast('Reconnecting to collaboration…', null);
        clearJoinRetry();
        joinRetryTimer = setTimeout(() => {
            joinRetryTimer = null;
            if (socket?.connected && currentProjectId === projectId) {
                socket.emit('join-project', projectId);
            }
        }, delay);
    }

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
            // §FIX-DB-SATURATION-RESILIENCE — fresh connection: reset the bounded
            // join-retry counter so a new session gets its full retry budget.
            joinRetryAttempt = 0;
            clearJoinRetry();
            socket.emit('join-project', projectId);

            // Phase E-2: catch-up replay — fetch commands we missed while disconnected/offline
            _triggerCatchUp(projectId).catch(err => {
                console.warn('[initCollaboration] Catch-up request failed:', err?.message ?? err);
            });
        });

        socket.on('join-project-denied', (data: { projectId: string; reason: string; retryable?: boolean; code?: string }) => {
            console.warn(
                '[initCollaboration] join-project denied for', data.projectId,
                '— reason:', data.reason,
            );
            // §FIX-DB-SATURATION-RESILIENCE (L-137/L-136) — a transient DB error
            // (server could not verify access) is retryable; a genuine denial is not.
            const isRetryable = data?.retryable === true || data?.code === 'db_unavailable';
            if (isRetryable && data.projectId === currentProjectId) {
                scheduleJoinRetry(data.projectId);
            }
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
            clearJoinRetry(); // §FIX-DB-SATURATION-RESILIENCE — no pending join to a dead socket
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

            // §FIX-REPLAY-AT-MOST-ONCE (L-814) — the server never echoes to the
            // sender (`socket.to(room)` excludes it), but belt-and-braces: a
            // delivery whose origin is us is not ours to re-apply.
            if (data.userId && data.userId === getCurrentUserId()) return;

            // Always show a toast — even if we apply the command, the user
            // benefits from knowing a collaborator is actively working.
            const userId = data.userId as string | undefined;
            const color  = userId ? colorForUser(userId) : CURSOR_COLORS[0] as string;
            showRemoteCommandToast(data.commandType, color);

            // §FIX-REPLAY-AT-MOST-ONCE (L-814) — the lastSync baseline is NO LONGER
            // stamped from the CLIENT clock here.
            //
            // It used to be: every live command wrote `new Date().toISOString()`
            // into the baseline, which is then compared server-side against
            // `project_command_log.created_at` — a SERVER clock. The two clocks are
            // unrelated. A client running behind the server never advances past the
            // rows it already has, so every reconnect re-requests the same window
            // forever; a client running ahead silently SKIPS a peer's real edits.
            // Both are baseline drift, and the first is what makes the replay
            // recur "after a while without touching the project".
            //
            // The baseline is now advanced only by `_triggerCatchUp`, using server
            // timestamps (`created_at` / `serverNow`) — see below. Re-delivery of a
            // row already applied live is harmless: the ledger refuses it.

            // Attempt to apply the full serialized command locally.
            // Falls back gracefully (toast-only) for unregistered types.
            if (data.payload && typeof data.payload === 'object') {
                const outcome = dispatcher.dispatch(data.payload as SerializedCommand, {
                    commandLogId: data.commandLogId as string | undefined,
                    originUserId: data.userId,
                });
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
        // §PRESENCE-IS-A-SAMPLE-STREAM (L-13207 · C08 §3.4.1). This used to emit one socket
        // packet per RAW mousemove — unthrottled, uncoalesced. Dragging the multi-pane divider
        // (which lives inside this same `container`) therefore produced a write per pointer
        // event, and when the transport went CLOSING mid-drag every one of them printed
        // `WebSocket is already in CLOSING or CLOSED state.` and was silently fake-drained by
        // engine.io. ~40 warnings ≈ 0.7 s of drag.
        //
        // TWO changes, each fixing a different half, neither of them a console suppression:
        //   · COALESCE to at most ONE emit per frame. ⛔ Not a debounce and not a throttle —
        //     see `createCursorEmitter`: it is a FOLD (latest sample wins) that always fires on
        //     the next frame, so latency is bounded by one frame even during continuous motion.
        //   · VOLATILE. A cursor position is a lossy SAMPLE superseded by the next one, and
        //     `socket.volatile` is socket.io's own primitive for exactly that: it DISCARDS the
        //     packet when `io.engine.transport.writable` is false instead of calling
        //     `ws.send()` on a closing socket. That is what removes the warning AT THE SOURCE.
        //
        // The container rect is measured in the FLUSH, not per event: one forced layout read
        // per frame instead of one per mousemove, and it measures the pane box as it is at the
        // moment the sample is actually sent (the box is moving — that is the whole scenario).
        const cursorEmitter = createCursorEmitter({
            schedule: (flush) => {
                // P3 / ADR-003 — `requestAnimationFrame` may only be called inside
                // `packages/frame-scheduler`. Same shape the Cesium reflow and the pane-shell
                // settle already use: the frame bus when the pump runs, `deferWork(…, 0)`
                // (also frame-scheduler-owned) when it does not, so a headless / pre-compose
                // sample is coalesced rather than silently dropped.
                const scheduler = getFrameScheduler();
                if (scheduler.isRunning) scheduler.scheduleOnce('collab-cursor-emit', flush, 'overlay');
                else deferWork(flush, 0);
            },
            emit: (sample) => {
                if (!socket?.connected || !currentProjectId) return;
                const rect = container.getBoundingClientRect();
                volatileEmit(socket, 'cursor-move', {
                    projectId: currentProjectId,
                    x: sample.clientX - rect.left,
                    y: sample.clientY - rect.top,
                });
            },
        });

        const onMouseMove = (e: MouseEvent): void => {
            if (!socket?.connected || !currentProjectId) return;
            cursorEmitter.sample({ clientX: e.clientX, clientY: e.clientY });
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

        // §FIX-REPLAY-AT-MOST-ONCE (L-814) — bind identity + at-most-once ledger for
        // this project BEFORE any replay can run. Re-binding the same project on a
        // reconnect keeps the ledger, which is the whole point: a reconnect must
        // remember what it already applied.
        const localUserId = getCurrentUserId();
        dispatcher.bindProject(projectId, localUserId);

        // First visit this session — ask the SERVER for its clock and use that as
        // the baseline. Stamping the client clock here is the drift that made
        // reconnects re-request an already-applied window (see remote-command above).
        if (!lastSync) {
            const now = await _fetchServerNow(projectId);
            if (now) sessionStorage.setItem(storageKey, now);
            console.log('[initCollaboration] Catch-up: first connect — baseline set from server clock');
            return;
        }

        console.log('[initCollaboration] Catch-up: requesting commands since', lastSync);

        try {
            const res = await apiFetch(
                `/api/projects/${projectId}/commands?since=${encodeURIComponent(lastSync)}&excludeSelf=1`,
            );
            if (!res.ok) {
                console.warn('[initCollaboration] Catch-up: server responded', res.status);
                return;
            }

            const body = await res.json() as {
                commands?: Array<{ id?: string; user_id: string; command_type: string; payload: SerializedCommand; created_at?: string }>;
                serverNow?: string;
            };
            const cmds = body.commands ?? [];

            // §FIX-REPLAY-AT-MOST-ONCE — advance the baseline in SERVER time only.
            // See `nextCatchUpBaseline` for why the client clock cannot be used here.
            const advanceBaseline = (): void => {
                const next = nextCatchUpBaseline(lastSync, body);
                if (next && next !== lastSync) sessionStorage.setItem(storageKey, next);
            };

            // §OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET (L-13208) — ⚠ THIS LINE USED TO BE A
            // LIE BY OMISSION. Catch-up is INBOUND-ONLY and queries with `excludeSelf=1`: it asks
            // what OTHER users did while we were away. It can therefore say "no missed commands"
            // in full honesty while this client's own edits were dropped on the floor by the
            // outbound guard — which is precisely the state the founder's trace was in. Naming
            // the direction, and appending the local gap when there is one, is what stops
            // "nothing was lost" and "your edits never left" from printing the same value.
            const localGap = undeliveredCommands.summary();
            const gapSuffix = localGap ? ` — ⛔ BUT ${localGap}` : '';

            if (cmds.length === 0) {
                console.log(`[initCollaboration] Catch-up: no missed commands FROM PEERS${gapSuffix}`);
                advanceBaseline();
                return;
            }

            console.log(`[initCollaboration] Catch-up: replaying ${cmds.length} missed command(s) from peers${gapSuffix}`);

            // Re-attach delivery provenance to each SerializedCommand so the
            // dispatcher can enforce E-2 (own-origin) and E-4 (at-most-once).
            const serializeds = cmds.map(c => ({
                ...(c.payload ?? {}),
                userId: c.user_id,
                commandLogId: c.id,
            } as SerializedCommand & { userId: string; commandLogId?: string }));

            // §FIX-REPLAY-AT-MOST-ONCE — Invariant E-2 made explicit at the call site.
            // Omitting this argument is the defect that let the founder's own edits
            // replay over his live model; `dispatch` also enforces it independently.
            const { applied, skipped } = dispatcher.replayCatchUp(
                serializeds,
                localUserId ?? undefined,
            );
            console.log(`[initCollaboration] Catch-up: applied=${applied} skipped=${skipped}`);
            advanceBaseline();
        } catch (err) {
            console.warn('[initCollaboration] Catch-up: fetch error', err);
        }
    }

    /**
     * §FIX-REPLAY-AT-MOST-ONCE (L-814) — read the server's clock via an empty
     * catch-up query. The baseline is compared against `project_command_log.created_at`,
     * a SERVER timestamp, so it must be expressed in SERVER time.
     */
    async function _fetchServerNow(projectId: string): Promise<string | null> {
        try {
            const res = await apiFetch(
                `/api/projects/${projectId}/commands?since=${encodeURIComponent(new Date().toISOString())}&excludeSelf=1`,
            );
            if (!res.ok) return null;
            const body = await res.json() as { serverNow?: string };
            return typeof body.serverNow === 'string' ? body.serverNow : null;
        } catch {
            return null;
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

        // §COLLAB-FILTER: skip auto-generated and L2-bus-handled commands.
        // ⚠ ORDER MATTERS AND IT CHANGED. The deliverability check below now REPORTS a drop, so
        // it must run AFTER the filter — otherwise every intentionally-unbroadcast command would
        // be recorded as an undelivered one. A filtered command is not lost; it is not sent.
        if (COLLAB_BROADCAST_SKIP.has(cmd.type)) return;

        // §OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET (L-13208 · C08 §3.3.1). This was
        // `if (!socket?.connected || !currentProjectId) return;` — a SILENT return that dropped a
        // real BIM edit from the peer broadcast AND from `project_command_log` at once, leaving
        // no trace anywhere that it had happened. It also could not see the window that actually
        // produced the founder's warnings: during a CLOSING transport `socket.connected` is
        // still true, so the guard passed and the write went into a dead socket.
        //
        // ⛔ NOT FIXED BY QUEUEING. A client-side replay on reconnect would mint a SECOND
        // `commandLogId` for the same edit, and §FIX-REPLAY-AT-MOST-ONCE (L-814) keys its
        // dedupe on exactly that id — so the "fix" would replace a silent loss with a silent
        // DUPLICATE. Reliable delivery needs a server ack; that is L-13211, its own lane.
        // What is correct from the client alone is to make the loss LOUD, and to make the
        // catch-up line stop reporting a clean slate on top of it.
        const verdict = classifyOutbound(socket, currentProjectId);
        if (!isDeliverable(verdict)) {
            const seen = undeliveredCommands.record(cmd.type, verdict);
            console.error(
                `[initCollaboration] §OUTBOUND-DELIVERY-IS-NOT-FIRE-AND-FORGET — '${cmd.type}' was ` +
                `NOT SENT (${verdict}). It is absent from every peer AND from project_command_log, ` +
                `so no catch-up can recover it. ${seen} undelivered command(s) this session.`,
            );
            try {
                window.dispatchEvent(new CustomEvent('pryzm-collab-command-undelivered', {
                    detail: { commandType: cmd.type, verdict, undeliveredThisSession: seen },
                }));
            } catch { /* no DOM (headless) — the console line is still the record */ }
            return;
        }

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
        clearJoinRetry(); // §FIX-DB-SATURATION-RESILIENCE — cancel any pending join retry
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
            // §FIX-DB-SATURATION-RESILIENCE — cancel any pending bounded join retry.
            clearJoinRetry();

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
