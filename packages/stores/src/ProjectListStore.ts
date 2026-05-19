// ProjectListStore — the L1 store backing the multi-project hub
// (S28, Phase-2A §S28).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md`
//   §S28 lines 666-721 (`packages/stores/ProjectListStore.ts` shape +
//   reducer outline).
//
// Shape per spec line 669:
//   ProjectSummary { id, name, lastModifiedAt, thumbnailUrl,
//                    ownerName, collaboratorCount, schemaVersion }.
//
// Architectural choice — like every other PRYZM 2 store the project
// list is a `Store<T>` keyed by stable id; mutations land via Immer
// patches so subscribers receive the standard `DirtyDiff` and the
// future PatchEmitter routing path is shared with the rest of L1.
// The hub is REST-driven (one `replaceAll(...)` on hub load + the
// occasional WebSocket `projectList.thumbnailUpdate` patch from the
// bake worker) — no command-bus traffic, so the store offers explicit
// helpers (`replaceAll / addProject / removeProject / renameProject /
// updateThumbnail`) instead of a per-command handler set.

import { Store } from './Store.js';
import type { Patch } from './types.js';

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  /** ISO-8601 string; the hub renders relative time off this. */
  readonly lastModifiedAt: string;
  /** R2 signed URL; `null` until the bake worker has rendered one
   *  (per ADR + §S28 line 673). */
  readonly thumbnailUrl: string | null;
  readonly ownerName: string;
  readonly collaboratorCount: number;
  readonly schemaVersion: number;
  /** Phase C (S74-WIRE) §16.3 sub-phase C.4.03 — set by
   *  `runtime.persistence.client.patch(id, { isArchived: true })`.
   *  Optional for back-compat with older REST responses. */
  readonly isArchived?: boolean;
  /** Phase C §16.3 C.4.04 — set by `client.patch(id, { isStarred })`. */
  readonly isStarred?: boolean;
  /** Phase C §16.3 C.4.05 — set by `client.patch(id, { description })`. */
  readonly description?: string | null;
  /** Number of saved versions on the server.  Optional for back-compat
   *  with older REST responses; surfaced by the project hub card.
   *  Sourced from the `projects.version_count` column the server-side
   *  `pgProjectStore` projection already returns (S28 D2 + Phase C §16.3). */
  readonly versionCount?: number;
}

export class ProjectListStore extends Store<ProjectSummary> {
  /** Like SelectionStore / ActiveViewStore — the project list is UI
   *  state, not a domain store; mark it ephemeral so the future
   *  PatchEmitter ephemeral-routing branch treats project-list
   *  mutations consistently with the other UI-state stores. */
  static readonly ephemeral = true;

  constructor() {
    super('project-list');
  }

  /** Replace the entire list (used on initial REST load).  Emits one
   *  patch batch — `replace` for any existing entries that are still
   *  present, `remove` for those that disappeared, `add` for new
   *  ones — so subscribers see the right per-id `DirtyDiff` even
   *  across a full refresh. */
  replaceAll(next: ReadonlyArray<ProjectSummary>): void {
    const patches: Patch[] = [];
    const seen = new Set<string>();

    for (const summary of next) {
      const frozen = Object.freeze({ ...summary });
      seen.add(summary.id);
      const exists = this.state.has(summary.id);
      patches.push({
        op: exists ? 'replace' : 'add',
        path: [summary.id],
        value: frozen,
      });
    }

    for (const id of this.state.keys()) {
      if (!seen.has(id)) {
        patches.push({ op: 'remove', path: [id] });
      }
    }

    if (patches.length > 0) this.applyPatch(patches);
  }

  /** Insert a single project (POST /projects success path). */
  addProject(summary: ProjectSummary): void {
    const frozen = Object.freeze({ ...summary });
    this.applyPatch([{
      op: this.state.has(summary.id) ? 'replace' : 'add',
      path: [summary.id],
      value: frozen,
    }]);
  }

  /** Remove a single project (DELETE /projects/:id success). */
  removeProject(id: string): void {
    if (!this.state.has(id)) return;
    this.applyPatch([{ op: 'remove', path: [id] }]);
  }

  /** Rename a single project (PATCH /projects/:id success).  Bumps
   *  `lastModifiedAt` to `now` so the card re-sorts correctly without
   *  waiting for the next REST refresh. */
  renameProject(id: string, name: string, now: string = new Date().toISOString()): void {
    const existing = this.state.get(id);
    if (!existing) return;
    const next: ProjectSummary = Object.freeze({
      ...existing,
      name,
      lastModifiedAt: now,
    });
    this.applyPatch([{ op: 'replace', path: [id], value: next }]);
  }

  /** Update a single project's thumbnail URL (S28 §line 713 —
   *  `projectList.thumbnailUpdate` event from the bake worker).  No-op
   *  when the project is no longer in the list (the user may have
   *  deleted it after the worker started). */
  updateThumbnail(id: string, thumbnailUrl: string | null): void {
    const existing = this.state.get(id);
    if (!existing) return;
    if (existing.thumbnailUrl === thumbnailUrl) return;
    const next: ProjectSummary = Object.freeze({
      ...existing,
      thumbnailUrl,
    });
    this.applyPatch([{ op: 'replace', path: [id], value: next }]);
  }

  /** Snapshot helper: ordered by `lastModifiedAt` desc, mirroring the
   *  default REST `ORDER BY updated_at DESC` so first paint matches
   *  whatever the server returned. */
  list(): ReadonlyArray<ProjectSummary> {
    return Array.from(this.state.values()).sort(
      (a, b) => b.lastModifiedAt.localeCompare(a.lastModifiedAt),
    );
  }

  /** True when the store has never been populated (post-construct,
   *  pre-`replaceAll`).  Used by the hub to render a skeleton
   *  vs. an empty state. */
  isEmpty(): boolean {
    return this.state.size === 0;
  }
}
