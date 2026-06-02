// A.31.c (Phase A · Sprint 2) — L3 ProvenanceStore.
//
// Reactive APPEND-ONLY wrapper around the L0 C23 Provenance schemas
// (A.31.a). Per [C23 §1.9] all rows are immutable after write EXCEPT
// `AIArtefact.approvalStatus` (§1.7 explicit carve-out) and
// `AIArtefact.producedElementIds` (§4.4 linkElement mutation). Every
// other mutation is forbidden — the store enforces this at the API
// boundary; the command handlers (A.31.d) gate user intent above.
//
// Cycle detection for [C23 §1.3] — when adding an artefact-to-artefact
// or cache-derived-from / fallback-from edge, the store traverses
// existing edges from the target back to the source; any path reaching
// the source means the new edge would close a cycle. Rejected at write.
//
// L3-layer: imports ONLY from @pryzm/schemas (L0). Cross-store
// invariants (e.g. linking to an artefact that doesn't exist) are the
// COMMAND handler's job per P6 — but the store does check id existence
// for edges, since a "dangling edge" pointing to nothing breaks the
// graph invariants in §2.2.
//
// Per [C13 §3.8] isolation: `reset()` is the canonical project-switch
// hook (composeRuntime wires it to projectContext.set()).

import type {
    AIArtefact,
    ApprovalStatus,
    ProvenanceEdge,
    ContextSnapshot,
    RedactionRecord,
} from '@pryzm/schemas/provenance';

/**
 * L3 reactive append-only store for the C23 Provenance substrate.
 * One instance per runtime session (constructed by composeRuntime).
 * Idempotent disposal.
 */
export class ProvenanceStore {
    private readonly _artefactsById = new Map<string, AIArtefact>();
    private readonly _edgesById = new Map<string, ProvenanceEdge>();
    /** Index of out-edges by source artefact — used by cycle detection. */
    private readonly _outEdgesByFrom = new Map<string, Set<string>>();
    /** Dedup of snapshots by contextHash per [C23 §2.3]. */
    private readonly _snapshotsByHash = new Map<string, ContextSnapshot>();
    private readonly _snapshotsById = new Map<string, ContextSnapshot>();
    private readonly _redactionsById = new Map<string, RedactionRecord>();
    private readonly _listeners = new Set<() => void>();
    private _disposed = false;

    // ── Read API ───────────────────────────────────────────────────────────

    getArtefact(id: string): AIArtefact | undefined {
        return this._artefactsById.get(id);
    }

    getEdge(id: string): ProvenanceEdge | undefined {
        return this._edgesById.get(id);
    }

    getSnapshot(id: string): ContextSnapshot | undefined {
        return this._snapshotsById.get(id);
    }

    /** Look up a snapshot by its content hash (the dedup key). */
    findSnapshotByHash(contextHash: string): ContextSnapshot | undefined {
        return this._snapshotsByHash.get(contextHash);
    }

    getRedaction(id: string): RedactionRecord | undefined {
        return this._redactionsById.get(id);
    }

    /** Snapshot of every artefact, sorted by timestamp ascending (oldest
     *  first — the natural audit-log read order). */
    listArtefacts(): readonly AIArtefact[] {
        return Array.from(this._artefactsById.values()).sort((a, b) =>
            a.timestamp < b.timestamp
                ? -1
                : a.timestamp > b.timestamp
                  ? 1
                  : 0,
        );
    }

    listArtefactsForProject(projectId: string): readonly AIArtefact[] {
        return this.listArtefacts().filter((a) => a.projectId === projectId);
    }

    listArtefactsForSession(sessionId: string): readonly AIArtefact[] {
        return this.listArtefacts().filter((a) => a.sessionId === sessionId);
    }

    listEdges(): readonly ProvenanceEdge[] {
        return Array.from(this._edgesById.values()).sort((a, b) =>
            a.createdAt < b.createdAt
                ? -1
                : a.createdAt > b.createdAt
                  ? 1
                  : 0,
        );
    }

    listEdgesForProject(projectId: string): readonly ProvenanceEdge[] {
        return this.listEdges().filter((e) => e.projectId === projectId);
    }

    /** Out-edges from a given artefact id. */
    outEdges(artefactId: string): readonly ProvenanceEdge[] {
        const ids = this._outEdgesByFrom.get(artefactId);
        if (!ids) return [];
        const out: ProvenanceEdge[] = [];
        for (const id of ids) {
            const e = this._edgesById.get(id);
            if (e) out.push(e);
        }
        return out;
    }

    artefactCount(): number {
        return this._artefactsById.size;
    }

    edgeCount(): number {
        return this._edgesById.size;
    }

    // ── Write API (append-only) ────────────────────────────────────────────

    /**
     * Append an `AIArtefact`. Per [C23 §1.9] artefacts are immutable
     * after write — re-add throws. Idempotency is the caller's job
     * (`AIArtefact.idempotencyKey` lets the command handler short-circuit
     * before calling this).
     */
    addArtefact(a: AIArtefact): void {
        if (this._disposed) {
            console.warn('[ProvenanceStore] addArtefact() after dispose — ignored');
            return;
        }
        if (this._artefactsById.has(a.id)) {
            throw new Error(
                `ProvenanceStore: artefact '${a.id}' already exists — provenance is append-only (C23 §1.9)`,
            );
        }
        this._artefactsById.set(a.id, a);
        this._notify();
    }

    /**
     * Append a `ProvenanceEdge`. Per [C23 §1.3] the store rejects:
     *   - dup edge ids
     *   - edges whose `fromArtefactId` doesn't exist in the store
     *   - artefact-to-* edges whose target artefact doesn't exist
     *   - edges that close a cycle (artefact-to-artefact /
     *     cache-derived-from / fallback-from only — artefact-to-element
     *     can't cycle by construction)
     */
    addEdge(e: ProvenanceEdge): void {
        if (this._disposed) {
            console.warn('[ProvenanceStore] addEdge() after dispose — ignored');
            return;
        }
        if (this._edgesById.has(e.id)) {
            throw new Error(
                `ProvenanceStore: edge '${e.id}' already exists — provenance is append-only`,
            );
        }
        if (!this._artefactsById.has(e.fromArtefactId)) {
            throw new Error(
                `ProvenanceStore: edge from unknown artefact '${e.fromArtefactId}'`,
            );
        }
        if (e.toArtefactId !== null && !this._artefactsById.has(e.toArtefactId)) {
            throw new Error(
                `ProvenanceStore: edge to unknown artefact '${e.toArtefactId}'`,
            );
        }
        if (
            e.toArtefactId !== null &&
            this._wouldCreateCycle(e.fromArtefactId, e.toArtefactId)
        ) {
            throw new Error(
                `ProvenanceStore: edge ${e.fromArtefactId} → ${e.toArtefactId} would close a cycle (C23 §1.3 DAG invariant)`,
            );
        }
        this._edgesById.set(e.id, e);
        const out = this._outEdgesByFrom.get(e.fromArtefactId) ?? new Set();
        out.add(e.id);
        this._outEdgesByFrom.set(e.fromArtefactId, out);
        this._notify();
    }

    /**
     * Append a `ContextSnapshot` — dedup by `contextHash` per [C23 §2.3].
     * Calling this with a hash already in the store is a no-op + returns
     * the existing row (the canonical "snapshots are de-duplicated by
     * contextHash" behaviour the contract requires).
     */
    addOrReuseSnapshot(s: ContextSnapshot): ContextSnapshot {
        if (this._disposed) {
            console.warn('[ProvenanceStore] addOrReuseSnapshot() after dispose — ignored');
            return s;
        }
        const existing = this._snapshotsByHash.get(s.contextHash);
        if (existing) return existing;
        if (this._snapshotsById.has(s.id)) {
            throw new Error(
                `ProvenanceStore: snapshot '${s.id}' already exists with a different contextHash`,
            );
        }
        this._snapshotsById.set(s.id, s);
        this._snapshotsByHash.set(s.contextHash, s);
        this._notify();
        return s;
    }

    /** Append a `RedactionRecord`. Append-only — dup id throws. */
    addRedaction(r: RedactionRecord): void {
        if (this._disposed) {
            console.warn('[ProvenanceStore] addRedaction() after dispose — ignored');
            return;
        }
        if (this._redactionsById.has(r.id)) {
            throw new Error(
                `ProvenanceStore: redaction '${r.id}' already exists — provenance is append-only`,
            );
        }
        this._redactionsById.set(r.id, r);
        this._notify();
    }

    /**
     * Mutate the approval status of an existing artefact. The [C23 §1.9]
     * single carve-out — the ONE field that can change after write.
     * Throws when the id is unknown; per §1.7 the legal transitions
     * are: `pending` → {`user-approved`, `user-rejected`, `never-applied`},
     * `auto-applied` → terminal (no transition allowed). The store
     * accepts any target status; the command handler (A.31.d) gates the
     * legality of transitions.
     */
    updateApprovalStatus(id: string, status: ApprovalStatus): void {
        if (this._disposed) {
            console.warn('[ProvenanceStore] updateApprovalStatus() after dispose — ignored');
            return;
        }
        const a = this._artefactsById.get(id);
        if (!a) {
            throw new Error(
                `ProvenanceStore: cannot update approval status of unknown artefact '${id}'`,
            );
        }
        if (a.approvalStatus === status) return; // no-op
        this._artefactsById.set(id, { ...a, approvalStatus: status });
        this._notify();
    }

    /**
     * Link an element id to an artefact's `producedElementIds` per
     * [C23 §4.4] — the second permitted post-write mutation. The element
     * id is appended; dup links are no-ops. Throws when the artefact id
     * is unknown.
     */
    linkElement(artefactId: string, elementId: string): void {
        if (this._disposed) {
            console.warn('[ProvenanceStore] linkElement() after dispose — ignored');
            return;
        }
        const a = this._artefactsById.get(artefactId);
        if (!a) {
            throw new Error(
                `ProvenanceStore: cannot link element to unknown artefact '${artefactId}'`,
            );
        }
        if (a.producedElementIds.includes(elementId)) return; // idempotent
        this._artefactsById.set(artefactId, {
            ...a,
            producedElementIds: [...a.producedElementIds, elementId],
        });
        this._notify();
    }

    /** Clear all rows — used by the C13 project-switch reset hook. */
    reset(): void {
        if (this._disposed) return;
        if (
            this._artefactsById.size === 0 &&
            this._edgesById.size === 0 &&
            this._snapshotsById.size === 0 &&
            this._redactionsById.size === 0
        ) {
            return;
        }
        this._artefactsById.clear();
        this._edgesById.clear();
        this._outEdgesByFrom.clear();
        this._snapshotsById.clear();
        this._snapshotsByHash.clear();
        this._redactionsById.clear();
        this._notify();
    }

    // ── Subscription / lifecycle ───────────────────────────────────────────

    subscribe(listener: () => void): () => void {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
        };
    }

    /** Idempotent. Clears listeners + freezes writes. */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._artefactsById.clear();
        this._edgesById.clear();
        this._outEdgesByFrom.clear();
        this._snapshotsById.clear();
        this._snapshotsByHash.clear();
        this._redactionsById.clear();
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private _notify(): void {
        for (const l of this._listeners) {
            try {
                l();
            } catch (err) {
                console.warn('[ProvenanceStore] listener threw:', err);
            }
        }
    }

    /**
     * Returns true iff adding an edge `from → to` would close a cycle.
     * Implemented as DFS from `to` over existing out-edges searching for
     * `from`. O(V+E) worst case — fine for the audit graph's size
     * (hundreds to low thousands of nodes per project).
     */
    private _wouldCreateCycle(from: string, to: string): boolean {
        if (from === to) return true; // self-loop
        const visited = new Set<string>();
        const stack: string[] = [to];
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (node === from) return true;
            if (visited.has(node)) continue;
            visited.add(node);
            const outIds = this._outEdgesByFrom.get(node);
            if (!outIds) continue;
            for (const edgeId of outIds) {
                const edge = this._edgesById.get(edgeId);
                if (!edge) continue;
                if (edge.toArtefactId !== null) stack.push(edge.toArtefactId);
            }
        }
        return false;
    }
}
