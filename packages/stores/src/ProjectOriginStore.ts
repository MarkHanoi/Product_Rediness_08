// §FEAT-PROJECT-ORIGIN (L-109) — L3 ProjectOriginStore.
//
// Reactive singleton wrapper around the L0 `ProjectOrigin` schema (P1).
// Exactly ONE Project Origin / Base Point per project — the always-on
// blue-sphere coordination datum whose `position` is the shared-coordinate
// origin (C19 §1.3 LTP-ENU / ADR-0115 project base point). The origin is
// system-seeded at world origin on construction and re-seeded on project
// switch — it is never user-drawn (so it is NOT a C17 catalogue tool).
//
// Layer rules (mirrors SiteModelStore):
//   - L3 — wraps an L0 schema. Imports ONLY from `@pryzm/schemas` (L0).
//     No THREE, no DOM, no other @pryzm packages.
//   - `reset()` is the canonical project-switch hook; it re-seeds the
//     singleton at world origin (the datum always exists).
//
// Mutation surface is intentionally minimal and is driven by the
// `projectOrigin.setPosition` / `projectOrigin.setVisible` commands (P6);
// those command handlers carry the OTel spans (P8). The store methods are
// thin reactive setters and follow the spanless convention of the sibling
// SiteModelStore (ADR-0115 §Consequences P8 note).

import { ProjectOrigin } from '@pryzm/schemas';

/**
 * The stable singleton id for the project origin element. Fixed (not a fresh
 * ULID) so the schema element, the renderer marker's `userData.id`, and the
 * View-Intent panel toggle all address the SAME entity across reloads. The
 * 26-zero suffix satisfies the canonical `projectOrigin_<ulid>` id regex.
 */
export const PROJECT_ORIGIN_ID = 'projectOrigin_00000000000000000000000000';

/** A ProjectOrigin decorated with `name` (= label) for panel/inspector display. */
export type ProjectOriginView = ProjectOrigin & { name: string };

function _seedOrigin(): ProjectOrigin {
    return ProjectOrigin.parse({ id: PROJECT_ORIGIN_ID });
}

/**
 * L3 reactive store for the singleton ProjectOrigin. One per runtime.
 *
 * Subscription model mirrors SiteModelStore — a coarse-grained
 * `subscribe(() => void)` that fires after every state change.
 */
export class ProjectOriginStore {
    private _origin: ProjectOrigin = _seedOrigin();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    /** The singleton ProjectOrigin (always present — the datum never disappears). */
    getOrigin(): ProjectOrigin {
        return this._origin;
    }

    /**
     * Panel-shaped read: the singleton as a one-element array, each decorated
     * with `name` (= label). Consumed by the View-Intent panel's
     * `getCategoryElements('Project Origin')`, mirroring `window.<x>Store.getAll()`.
     */
    getAll(): ProjectOriginView[] {
        return [{ ...this._origin, name: this._origin.label }];
    }

    /** Whether the origin marker is currently shown (View-Intent, default true). */
    isVisible(): boolean {
        return this._origin.visible;
    }

    // ── Write API (driven by projectOrigin.* commands, P6) ───────────────────

    /**
     * Reposition the shared-coordinate datum. Fires listeners (→ marker moves).
     * No-op after dispose.
     */
    setPosition(position: { x: number; y: number; z: number }): void {
        if (this._disposed) {
            console.warn('[ProjectOriginStore] setPosition() after dispose — ignored');
            return;
        }
        this._origin = ProjectOrigin.parse({ ...this._origin, position });
        this._notify();
    }

    /**
     * Toggle the origin's View-Intent visibility. Fires listeners (→ marker
     * shows/hides). No-op after dispose.
     */
    setVisible(visible: boolean): void {
        if (this._disposed) {
            console.warn('[ProjectOriginStore] setVisible() after dispose — ignored');
            return;
        }
        if (this._origin.visible === visible) return;
        this._origin = ProjectOrigin.parse({ ...this._origin, visible });
        this._notify();
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    /** Serialise the singleton for the project snapshot. */
    serialize(): ProjectOrigin {
        return { ...this._origin };
    }

    /**
     * Restore from a project snapshot. Invalid input re-seeds the default at
     * world origin (the datum always exists). Fires listeners.
     */
    deserialize(data: unknown): void {
        if (this._disposed) return;
        if (!data || typeof data !== 'object') {
            this._origin = _seedOrigin();
            this._notify();
            return;
        }
        const parsed = ProjectOrigin.safeParse({ ...(data as object), id: PROJECT_ORIGIN_ID });
        this._origin = parsed.success ? parsed.data : _seedOrigin();
        this._notify();
    }

    /**
     * Project-switch reset hook — re-seeds the singleton at world origin so a
     * Project A datum never leaks into Project B. The origin is NEVER absent.
     */
    reset(): void {
        if (this._disposed) return;
        this._origin = _seedOrigin();
        this._notify();
    }

    // ── Subscription / lifecycle ───────────────────────────────────────────

    /** Subscribe to coarse mutation notifications. Returns an idempotent disposer. */
    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /** Idempotent. Clears listeners and freezes future mutations into no-ops. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try {
                l();
            } catch (e) {
                console.warn('[ProjectOriginStore] listener threw:', e);
            }
        }
    }
}

/** Process-wide singleton (mirrors the `window.<x>Store` legacy-store idiom). */
export const projectOriginStore = new ProjectOriginStore();
