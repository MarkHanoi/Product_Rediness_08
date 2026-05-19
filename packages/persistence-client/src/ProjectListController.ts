// ProjectListController — coordinator that owns a `ProjectListClient`
// + a `ProjectListStore` and exposes a single mutation surface that
// keeps both in sync atomically.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phases
// C.1.x (paint), C.2.x (creation modal), C.3.x (open project),
// C.4.x (per-project context menu — rename / delete / archive /
// duplicate / export / import).  Every hub gesture goes through one
// of these methods so the in-memory store never drifts from the
// server's authoritative project list.

import type { ProjectListStore, ProjectSummary } from '@pryzm/stores';
import type { ProjectListClient } from './ProjectListClient.js';

/** Patch envelope shared by the client + the server PATCH endpoint. */
export interface ProjectPatch {
  readonly name?: string;
  readonly isArchived?: boolean;
  readonly isStarred?: boolean;
  readonly description?: string;
}

export interface ProjectListControllerOptions {
  readonly client: ProjectListClient;
  readonly store: ProjectListStore;
  /** Called after every mutation with the new total count. */
  readonly onChange?: (count: number) => void;
}

export class ProjectListController {
  readonly client: ProjectListClient;
  readonly store: ProjectListStore;
  private readonly onChange: (count: number) => void;
  private refreshing: Promise<void> | null = null;

  constructor(opts: ProjectListControllerOptions) {
    this.client = opts.client;
    this.store = opts.store;
    this.onChange = opts.onChange ?? ((): void => {});
  }

  /** Fetch the latest list from the server and replace the store contents.
   *  Concurrent calls share the same in-flight promise. */
  async refresh(): Promise<void> {
    if (this.refreshing !== null) return this.refreshing;
    this.refreshing = (async (): Promise<void> => {
      try {
        const list = await this.client.list();
        this.store.replaceAll(list);
        this.onChange(list.length);
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async create(name: string): Promise<ProjectSummary> {
    const summary = await this.client.create(name);
    this.store.addProject(summary);
    this.onChange(this.store.list().length);
    return summary;
  }

  async delete(id: string): Promise<void> {
    await this.client.delete(id);
    this.store.removeProject(id);
    this.onChange(this.store.list().length);
  }

  async rename(id: string, name: string): Promise<ProjectSummary> {
    const summary = await this.client.rename(id, name);
    this.store.replaceAll(this.store.list().map(p => (p.id === id ? summary : p)));
    this.onChange(this.store.list().length);
    return summary;
  }

  async patch(id: string, patch: ProjectPatch): Promise<ProjectSummary> {
    const summary = await this.client.patch(id, patch);
    this.store.replaceAll(this.store.list().map(p => (p.id === id ? summary : p)));
    this.onChange(this.store.list().length);
    return summary;
  }

  async duplicate(id: string, newName?: string): Promise<ProjectSummary> {
    const summary = await this.client.duplicate(id, newName);
    this.store.addProject(summary);
    this.onChange(this.store.list().length);
    return summary;
  }
}
