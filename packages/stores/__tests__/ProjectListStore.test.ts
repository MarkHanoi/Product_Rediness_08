// ProjectListStore unit tests (S28 — Persistent Project Hub).
//
// Spec: `phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md` §S28
//   line 685 — reducer cases (project.create / delete / rename /
//   thumbnailUpdate).  We don't ship a command-bus reducer (the hub
//   talks REST), so the equivalent surface is the explicit helper
//   methods on the store; this file tests each.

import { describe, expect, it, vi } from 'vitest';
import {
  ProjectListStore,
  type ProjectSummary,
} from '../src/ProjectListStore.js';
import type { DirtyDiff } from '../src/types.js';

function makeSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'proj-1',
    name: 'Demo project',
    lastModifiedAt: '2026-04-01T12:00:00.000Z',
    thumbnailUrl: null,
    ownerName: 'user-1',
    collaboratorCount: 0,
    schemaVersion: 1,
    ...overrides,
  };
}

describe('ProjectListStore — S28', () => {
  it('reports its storeKey as "project-list" and is ephemeral', () => {
    const s = new ProjectListStore();
    expect(s.storeKey).toBe('project-list');
    expect(ProjectListStore.ephemeral).toBe(true);
  });

  it('starts empty and reports isEmpty()', () => {
    const s = new ProjectListStore();
    expect(s.isEmpty()).toBe(true);
    expect(s.list()).toEqual([]);
  });

  it('replaceAll seeds the store and emits one DirtyDiff', () => {
    const s = new ProjectListStore();
    const listener = vi.fn<(d: DirtyDiff<ProjectSummary>) => void>();
    s.subscribeDirty(listener);

    s.replaceAll([
      makeSummary({ id: 'a', lastModifiedAt: '2026-04-01T00:00:00.000Z' }),
      makeSummary({ id: 'b', lastModifiedAt: '2026-04-02T00:00:00.000Z' }),
    ]);

    expect(s.isEmpty()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    const list = s.list();
    expect(list.map(p => p.id)).toEqual(['b', 'a']); // sorted desc by lastModified
  });

  it('replaceAll diffs adds/removes/replaces between successive calls', () => {
    const s = new ProjectListStore();
    s.replaceAll([
      makeSummary({ id: 'a', name: 'a-old' }),
      makeSummary({ id: 'b', name: 'b' }),
    ]);

    const listener = vi.fn<(d: DirtyDiff<ProjectSummary>) => void>();
    s.subscribeDirty(listener);

    s.replaceAll([
      makeSummary({ id: 'a', name: 'a-new' }), // replaced
      makeSummary({ id: 'c', name: 'c' }),     // added; b removed
    ]);

    expect(listener).toHaveBeenCalledTimes(1);
    const ids = s.list().map(p => p.id).sort();
    expect(ids).toEqual(['a', 'c']);
    expect(s.getState().get('a')?.name).toBe('a-new');
  });

  it('addProject appends a single entry', () => {
    const s = new ProjectListStore();
    const listener = vi.fn();
    s.subscribeDirty(listener);

    s.addProject(makeSummary({ id: 'new' }));

    expect(s.getState().has('new')).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('addProject upgrades a `replace` patch when the id already exists', () => {
    const s = new ProjectListStore();
    s.addProject(makeSummary({ id: 'x', name: 'old' }));
    s.addProject(makeSummary({ id: 'x', name: 'new' }));
    expect(s.getState().get('x')?.name).toBe('new');
    expect(s.getState().size).toBe(1);
  });

  it('removeProject deletes by id; no-op when absent', () => {
    const s = new ProjectListStore();
    s.replaceAll([makeSummary({ id: 'a' }), makeSummary({ id: 'b' })]);

    const listener = vi.fn();
    s.subscribeDirty(listener);

    s.removeProject('a');
    expect(s.getState().has('a')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    s.removeProject('does-not-exist');
    expect(listener).toHaveBeenCalledTimes(1); // no extra dirty
  });

  it('renameProject updates name + bumps lastModifiedAt; no-op when absent', () => {
    const s = new ProjectListStore();
    s.replaceAll([makeSummary({ id: 'a', name: 'old', lastModifiedAt: '2026-01-01T00:00:00.000Z' })]);

    const listener = vi.fn();
    s.subscribeDirty(listener);

    s.renameProject('a', 'new', '2026-04-01T00:00:00.000Z');
    const updated = s.getState().get('a');
    expect(updated?.name).toBe('new');
    expect(updated?.lastModifiedAt).toBe('2026-04-01T00:00:00.000Z');
    expect(listener).toHaveBeenCalledTimes(1);

    s.renameProject('missing', 'whatever');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('updateThumbnail patches the thumbnailUrl; no-op when value unchanged', () => {
    const s = new ProjectListStore();
    s.replaceAll([makeSummary({ id: 'a', thumbnailUrl: null })]);

    const listener = vi.fn();
    s.subscribeDirty(listener);

    s.updateThumbnail('a', 'https://r2.example/a.png');
    expect(s.getState().get('a')?.thumbnailUrl).toBe('https://r2.example/a.png');
    expect(listener).toHaveBeenCalledTimes(1);

    // Same value: no extra dirty diff (committers don't need to re-render).
    s.updateThumbnail('a', 'https://r2.example/a.png');
    expect(listener).toHaveBeenCalledTimes(1);

    // Missing project: silent no-op.
    s.updateThumbnail('missing', 'https://r2.example/missing.png');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('list() returns a snapshot sorted by lastModifiedAt desc', () => {
    const s = new ProjectListStore();
    s.replaceAll([
      makeSummary({ id: 'mid', lastModifiedAt: '2026-04-15T00:00:00.000Z' }),
      makeSummary({ id: 'old', lastModifiedAt: '2026-01-01T00:00:00.000Z' }),
      makeSummary({ id: 'new', lastModifiedAt: '2026-04-27T00:00:00.000Z' }),
    ]);
    expect(s.list().map(p => p.id)).toEqual(['new', 'mid', 'old']);
  });
});
