// Phase C — `runtime.persistence.openProject(id)` no-reload bench.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phase
// C.3.01 (open project — no reload).  Goal: prove the runtime-side
// progress emit pipeline + project-context swap completes in well
// under one frame (the painted-shell budget).

import { bench, describe } from 'vitest';
import { composeRuntime } from '@pryzm/runtime-composer';

function fakeClient() {
  const projects = [
    {
      id: 'bench-project',
      name: 'Bench Project',
      lastModifiedAt: '2026-01-01T00:00:00.000Z',
      thumbnailUrl: null,
      ownerName: 'tester',
      collaboratorCount: 0,
      schemaVersion: 1 as const,
    },
  ];
  return {
    list: () => Promise.resolve(projects),
    create: () => Promise.reject(new Error('bench: create not supported')),
    delete: () => Promise.resolve(),
    rename: () => Promise.reject(new Error('bench: rename not supported')),
    patch: () => Promise.reject(new Error('bench: patch not supported')),
    duplicate: () => Promise.reject(new Error('bench: duplicate not supported')),
    signOut: () => Promise.resolve(),
    getAuthToken: () => null,
    members: {
      list: () => Promise.resolve([]),
      invite: () => Promise.reject(new Error('bench: invite not supported')),
      remove: () => Promise.resolve(),
      setRole: () => Promise.reject(new Error('bench: setRole not supported')),
    },
  };
}

describe('runtime.persistence.openProject — no-reload pipeline', () => {
  bench('compose + openProject(known id)', async () => {
    const runtime = await composeRuntime({
      audit: { actorId: 'bench', projectId: '', clientId: 'bench-client' },
      // @ts-expect-error — bench stub uses a structurally-compatible client
      persistenceClient: fakeClient(),
    });
    await runtime.persistence.openProject('bench-project');
    runtime.tearDown();
  });
});
