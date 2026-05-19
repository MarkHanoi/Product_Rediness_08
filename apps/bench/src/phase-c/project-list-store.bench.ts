// Phase C — `runtime.persistence.projectListStore` micro-bench.
//
// Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phases
// C.1.01 (paint hub list) and C.1.04 (search/filter).
//
// Goal: prove the store's `subscribe → replaceAll → list()` round-trip
// is O(N) with no hidden allocations growing per-call (the hub paints
// the store every time the user types a search-box character).

import { bench, describe } from 'vitest';
import { ProjectListStore } from '@pryzm/stores';

function makeFakeProjects(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `p-${i.toString(36).padStart(6, '0')}`,
      name: `Project ${i}`,
      lastModifiedAt: '2026-01-01T00:00:00.000Z',
      thumbnailUrl: null,
      ownerName: 'tester',
      collaboratorCount: 0,
      schemaVersion: 1 as const,
    });
  }
  return out;
}

describe('runtime.persistence.projectListStore', () => {
  for (const n of [10, 100, 1000]) {
    const store = new ProjectListStore();
    const projects = makeFakeProjects(n);

    bench(`replaceAll(${n}) — fan-out to one subscriber`, () => {
      let received = 0;
      const dispose = store.subscribe(() => { received += 1; });
      store.replaceAll(projects);
      void received;
      dispose();
    });

    bench(`list().filter(name) — N=${n}`, () => {
      store.replaceAll(projects);
      const needle = `Project ${Math.floor(n / 2)}`;
      const hits = store.list().filter(p => p.name.includes(needle));
      void hits;
    });
  }
});
