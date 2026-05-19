/**
 * PlatformCollabPill — real-time collaboration UI for PlatformShell.
 *
 * Extracted from PlatformShell.ts (Wave 14 FILE 2 god-file split, 2026-05-02).
 * Contains two responsibilities:
 *
 *   1. `mountPresenceStrip(chips)` — builds the §50 CP-1 presence HUD that
 *      shows remote-user avatars while a project is open.
 *
 *   2. `initSocketCollaboration(ctx, projectId)` — connects a socket.io
 *      client and emits/receives real-time version-saved events.
 *
 * Both functions wire global CustomEvent listeners to stay decoupled from the
 * PlatformShell class (§06 §1 — no cross-layer imports, events only).
 *
 * Contract compliance:
 *   §06 §1  — No BIM engine imports; uses CustomEvents for all cross-layer signals.
 *   §50 §5.5 — Presence strip wired to pryzm-presence-{added,removed,cleared}.
 */

import { showToast } from './PlatformToastSystem';
import { getStoredToken } from '@pryzm/core-app-model';
import type { ShellCtx } from './PlatformShellTypes';
import type { TypedEventEmitter, RuntimeEvents } from '@pryzm/runtime-composer/types';

// ── §50 CP-1 — Presence Strip ─────────────────────────────────────────────────

const PRESENCE_MAX_CHIPS = 5;

const PALETTE = [
    '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
    '#1ABC9C', '#E67E22', '#2980B9', '#27AE60', '#8E44AD',
];

function makeInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function makeChip(
    userId: string,
    displayName: string | undefined,
    color: string,
    isSelf: boolean,
): HTMLElement {
    const label = displayName?.trim() || userId.slice(0, 8);
    const chip = document.createElement('div');
    chip.className = isSelf ? 'cp-chip cp-chip--self' : 'cp-chip';
    chip.dataset.presenceUserId = userId;
    chip.style.background = color;

    const initials = document.createElement('span');
    initials.className = 'cp-chip-initials';
    initials.textContent = makeInitials(label);

    const tooltip = document.createElement('div');
    tooltip.className = 'cp-chip-tooltip';
    tooltip.textContent = isSelf ? `${label} (you)` : label;

    chip.appendChild(initials);
    chip.appendChild(tooltip);
    return chip;
}

/**
 * Creates the fixed collaborative presence HUD (`cp-presence-strip`) and wires
 * up the CustomEvent listeners dispatched by initCollaboration.ts (§50 §5.5).
 *
 * The strip is hidden until a project is opened (`pryzm-project-loaded`) and
 * hidden again when the user returns to the hub (`pryzm-go-hub`).
 *
 * @param chips - The shared presenceChips map from ShellCtx; this function owns
 *                the Map's contents (add/remove chips) while PlatformShell owns
 *                the reference.  dispose() in PlatformShell.dispose() must clear
 *                the map itself.
 */
export function mountPresenceStrip(chips: Map<string, HTMLElement>, events?: TypedEventEmitter<RuntimeEvents> | null): void {
    const strip = document.createElement('div');
    strip.className = 'cp-presence-strip';
    strip.id = 'cp-presence-strip';
    strip.style.display = 'none';
    document.body.appendChild(strip);

    const syncOverflow = (): void => {
        const overflow = strip.querySelector('.cp-overflow');
        if (overflow) overflow.remove();

        const allChips = Array.from(strip.querySelectorAll('.cp-chip:not(.cp-chip--self)')) as HTMLElement[];
        allChips.forEach((c, i) => { c.style.display = i < PRESENCE_MAX_CHIPS ? 'flex' : 'none'; });

        const hidden = allChips.length - PRESENCE_MAX_CHIPS;
        if (hidden > 0) {
            const ov = document.createElement('div');
            ov.className = 'cp-overflow';
            ov.textContent = `+${hidden}`;
            strip.appendChild(ov);
        }
    };

    // ── Show/hide on project lifecycle ────────────────────────────────────────
    window.runtime?.events?.on('pryzm-project-loaded', () => { // F.events.9
        strip.style.display = 'flex';
        const existing = strip.querySelector('.cp-chip--self');
        if (!existing) {
            try {
                const raw = localStorage.getItem('bim-platform-user');
                const user = raw ? JSON.parse(raw) as { id?: string; name?: string; email?: string } : null;
                const selfId   = user?.id    ?? 'me';
                const selfName = user?.name  ?? user?.email?.split('@')[0] ?? 'Me';
                const selfChip = makeChip(selfId, selfName, PALETTE[0]!, true);
                strip.prepend(selfChip);
            } catch { /* localStorage unavailable */ }
        }
    });

    window.runtime?.events?.on('pryzm-go-hub', () => { // F.events.12
        strip.style.display = 'none';
        chips.forEach(c => c.remove());
        chips.clear();
        const selfChip = strip.querySelector('.cp-chip--self');
        if (selfChip) selfChip.remove();
    });

    // ── Presence events from initCollaboration (F.events.2a — runtime.events) ──
    // Migrated from DOM CustomEvents ('pryzm-presence-added/removed/cleared')
    // to typed runtime.events.on() calls.  events is null only in legacy/test
    // paths where runtime is not composed — presence strip is silent in that case.
    events?.on('pryzm-presence-added', ({ userId, displayName, color }) => {
        if (!userId || chips.has(userId)) return;
        const chip = makeChip(userId, displayName, color, false);
        strip.appendChild(chip);
        chips.set(userId, chip);
        syncOverflow();
    });

    events?.on('pryzm-presence-removed', ({ userId }) => {
        if (!userId) return;
        const chip = chips.get(userId);
        if (chip) { chip.remove(); chips.delete(userId); }
        syncOverflow();
    });

    events?.on('pryzm-presence-cleared', () => {
        chips.forEach(c => c.remove());
        chips.clear();
        syncOverflow();
    });
}

// ── Phase 4 — Real-time collaboration socket client ───────────────────────────

/**
 * Loads the socket.io client bundle and connects to the collaboration room for
 * the given `projectId`.
 *
 * Listens for `version-saved` events emitted by the server when another user
 * saves a version.  Echoed saves (our own versions) are suppressed via
 * `ctx.ownSyncedVersionIds`.
 *
 * Called by PlatformShell.setProjectContext(); the old socket (if any) is
 * disconnected first via `ctx.socket`.
 *
 * Contract compliance:
 *   §06 §1 — Connects to same-origin server only; no external WebSocket host.
 *   TODO(C.3.x): legacy io — replace with runtime.transport.socket
 */
export function initSocketCollaboration(ctx: ShellCtx, projectId: string): void {
    if (ctx.socket) {
        ctx.socket.disconnect();
        ctx.socket = null;
    }

    const scriptId = 'plat-socketio-client';

    const loadAndConnect = (): void => {
        const ioFn = window.io; // window.io typed in global-window.d.ts (P4-compliant). TODO(C.3.x): replace with runtime.transport.socket
        if (typeof ioFn !== 'function') {
            console.warn('[PlatformCollabPill] socket.io client not available — skipping real-time collab');
            return;
        }

        const _tok = getStoredToken();
        ctx.socket = ioFn({
            transports: ['websocket', 'polling'],
            auth: _tok ? { token: _tok } : {},
        });

        ctx.socket.on('connect', () => {
            console.log('[PlatformCollabPill] Socket connected — joining project room:', projectId);
            ctx.socket.emit('join-project', projectId);
        });

        ctx.socket.on('version-saved', (data: {
            versionId?: string;
            label?: string;
            elementCount?: number;
        }) => {
            if (data.versionId && ctx.ownSyncedVersionIds.has(data.versionId)) {
                return;
            }
            const label = data.label ?? 'a version';
            const count = typeof data.elementCount === 'number'
                ? ` (${data.elementCount} elements)` : '';
            showToast(`\u{1F4E1} Collaborator saved: "${label}"${count}`, 'info', 5000);
        });

        ctx.socket.on('disconnect', (reason: string) => {
            console.log('[PlatformCollabPill] Socket disconnected:', reason);
        });

        ctx.socket.on('connect_error', (err: Error) => {
            console.warn('[PlatformCollabPill] Socket connection error:', err.message);
        });
    };

    if (window.io) { // window.io typed in global-window.d.ts (P4-compliant). TODO(C.3.x): replace with runtime.transport.socket
        loadAndConnect();
    } else if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = '/socket.io/socket.io.js';
        script.onload = loadAndConnect;
        script.onerror = () => {
            console.warn('[PlatformCollabPill] Failed to load socket.io client script');
        };
        document.head.appendChild(script);
    }
}
