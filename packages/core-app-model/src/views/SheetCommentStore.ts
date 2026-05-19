/**
 * SheetCommentStore — Phase SC-8 (Next-Gen Sheet Composition Engine)
 * src/core/views/SheetCommentStore.ts
 *
 * In-memory store for real-time sheet annotation comments and cursor presence.
 * Comments are persisted via the collaboration server (server.js) and hydrated
 * on sheet open. Cursor presence is ephemeral (session-scoped).
 *
 * Contract compliance:
 *   §01 §3.3  — Follows ElementStore<T> schema conventions
 *   §05       — Pure data store; no DOM, no Three.js
 *   §06       — No platform-layer imports
 *   §07       — No server route definitions here; socket integration in SheetEditorPanel
 *
 * Usage:
 *   import { sheetCommentStore } from './SheetCommentStore';
 *   sheetCommentStore.addComment(comment);
 *   sheetCommentStore.on('sh:comment-added', handler);
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SheetComment {
    id:          string;
    sheetId:     string;
    authorId:    string;
    authorName:  string;
    authorColor: string;
    body:        string;
    /** Position on the sheet canvas in mm from top-left. */
    position:    { x: number; y: number };
    resolved:    boolean;
    createdAt:   number;
    updatedAt:   number;
    replies:     SheetCommentReply[];
}

export interface SheetCommentReply {
    id:         string;
    commentId:  string;
    authorId:   string;
    authorName: string;
    body:       string;
    createdAt:  number;
}

export interface CursorPresence {
    userId:     string;
    userName:   string;
    userColor:  string;
    sheetId:    string;
    position:   { x: number; y: number };
    lastSeen:   number;
}

// ── Event map ──────────────────────────────────────────────────────────────────

type SheetCommentEventMap = {
    'sh:comment-added':    SheetComment;
    'sh:comment-updated':  SheetComment;
    'sh:comment-resolved': SheetComment;
    'sh:comment-deleted':  { id: string; sheetId: string };
    'sh:cursor-updated':   CursorPresence;
    'sh:cursor-removed':   { userId: string; sheetId: string };
};

type SheetCommentListener<K extends keyof SheetCommentEventMap> =
    (payload: SheetCommentEventMap[K]) => void;

// ── Store implementation ───────────────────────────────────────────────────────

class SheetCommentStoreImpl {
    private _comments: Map<string, SheetComment>   = new Map();
    private _cursors:  Map<string, CursorPresence> = new Map();
    private _listeners = new Map<string, Set<Function>>();

    /** Contract 45 — wipe all sheet comments and cursor presence on project switch. */
    clear(): void {
        this._comments.clear();
        this._cursors.clear();
    }

    // ── Comments ────────────────────────────────────────────────────────────────

    getCommentsForSheet(sheetId: string): SheetComment[] {
        return [...this._comments.values()]
            .filter(c => c.sheetId === sheetId)
            .sort((a, b) => a.createdAt - b.createdAt);
    }

    get(id: string): SheetComment | undefined {
        return this._comments.get(id);
    }

    addComment(comment: SheetComment): void {
        if (this._comments.has(comment.id)) return;
        this._comments.set(comment.id, { ...comment, replies: comment.replies ?? [] });
        this._emit('sh:comment-added', this._comments.get(comment.id)!);
    }

    updateCommentBody(id: string, body: string): void {
        const comment = this._comments.get(id);
        if (!comment) return;
        comment.body      = body;
        comment.updatedAt = Date.now();
        this._emit('sh:comment-updated', { ...comment });
    }

    addReply(commentId: string, reply: SheetCommentReply): void {
        const comment = this._comments.get(commentId);
        if (!comment) return;
        comment.replies.push(reply);
        comment.updatedAt = Date.now();
        this._emit('sh:comment-updated', { ...comment });
    }

    resolveComment(id: string): void {
        const comment = this._comments.get(id);
        if (!comment || comment.resolved) return;
        comment.resolved  = true;
        comment.updatedAt = Date.now();
        this._emit('sh:comment-resolved', { ...comment });
    }

    deleteComment(id: string): void {
        const comment = this._comments.get(id);
        if (!comment) return;
        this._comments.delete(id);
        this._emit('sh:comment-deleted', { id, sheetId: comment.sheetId });
    }

    /** Replace all comments for a sheet with a fresh snapshot (from server hydration). */
    hydrateSheet(sheetId: string, comments: SheetComment[]): void {
        // Remove existing for this sheet
        for (const [k, v] of this._comments) {
            if (v.sheetId === sheetId) this._comments.delete(k);
        }
        for (const c of comments) {
            this._comments.set(c.id, { ...c, replies: c.replies ?? [] });
        }
    }

    // ── Cursor Presence ─────────────────────────────────────────────────────────

    getCursorsForSheet(sheetId: string): CursorPresence[] {
        return [...this._cursors.values()].filter(c => c.sheetId === sheetId);
    }

    updateCursor(presence: CursorPresence): void {
        this._cursors.set(presence.userId, presence);
        this._emit('sh:cursor-updated', presence);
    }

    removeCursor(userId: string, sheetId: string): void {
        if (!this._cursors.has(userId)) return;
        this._cursors.delete(userId);
        this._emit('sh:cursor-removed', { userId, sheetId });
    }

    /** Prune stale cursors older than 10 seconds. */
    pruneStaleCursors(): void {
        const cutoff = Date.now() - 10_000;
        for (const [uid, cursor] of this._cursors) {
            if (cursor.lastSeen < cutoff) {
                this._cursors.delete(uid);
                this._emit('sh:cursor-removed', { userId: uid, sheetId: cursor.sheetId });
            }
        }
    }

    // ── Event emitter ───────────────────────────────────────────────────────────

    on<K extends keyof SheetCommentEventMap>(
        event:    K,
        listener: SheetCommentListener<K>,
    ): () => void {
        if (!this._listeners.has(event)) this._listeners.set(event, new Set());
        this._listeners.get(event)!.add(listener);
        return () => this._listeners.get(event)?.delete(listener);
    }

    private _emit<K extends keyof SheetCommentEventMap>(
        event:   K,
        payload: SheetCommentEventMap[K],
    ): void {
        this._listeners.get(event)?.forEach(fn => {
            try { fn(payload); } catch (e) { console.error(`[SheetCommentStore] Listener error on '${event}':`, e); }
        });
    }
}

// ── Singleton export ───────────────────────────────────────────────────────────

export const sheetCommentStore = new SheetCommentStoreImpl();
export type { SheetCommentStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'sheetCommentStore',
    clear: () => sheetCommentStore.clear(),
});
