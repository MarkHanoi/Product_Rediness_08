// §FIX-FACADE-TRUE-NORTH (ADR-0315 U2.1) — service-level provider tests.
//
// Lives here (happy-dom root vitest) rather than in @pryzm/spatial-index's
// pure-Node suite because FacadeOrientationService imports the
// @pryzm/core-app-model BARREL, whose module-load side effects hang plain Node
// ([[scc-no-barrel-access-at-module-load]]). The pure math (zero-rooms
// fallback, per-level centroid) is tested in the package suite.

import { describe, expect, it } from 'vitest';
import { FacadeOrientationService } from '@pryzm/spatial-index';
import { storeRegistry } from '@pryzm/core-app-model';

const WALLS = [
  { id: 'w-n', levelId: 'L0', baseLine: [{ x: -5, z: -5 }, { x: 5, z: -5 }] },
  { id: 'w-s', levelId: 'L0', baseLine: [{ x: -5, z: 5 }, { x: 5, z: 5 }] },
  { id: 'w-e', levelId: 'L0', baseLine: [{ x: 5, z: -5 }, { x: 5, z: 5 }] },
  { id: 'w-w', levelId: 'L0', baseLine: [{ x: -5, z: -5 }, { x: -5, z: 5 }] },
];

describe('FacadeOrientationService — injected true-north provider (U2.1)', () => {
  it('provider θ applies when the argument is omitted; explicit θ wins; failures degrade to 0', () => {
    storeRegistry.register('wall', { getAll: () => WALLS } as never);
    storeRegistry.register('room', { getAll: () => [] } as never);

    const svc = new FacadeOrientationService();
    // Unset provider → θ=0 → the +Z wall is South (via the zero-rooms fallback).
    expect(svc.getFacades('L0').get('w-s')!.orientation).toBe('S');
    // Provider says 180°: the frame flips; the +Z wall now reads North.
    svc.setTrueNorthProvider(() => Math.PI);
    expect(svc.getFacades('L0').get('w-s')!.orientation).toBe('N');
    // An explicit θ argument beats the provider (the solar pipeline's contract).
    expect(svc.getFacades('L0', 0).get('w-s')!.orientation).toBe('S');
    // All-levels roll-up sees every wall and honours the provider.
    expect(svc.getFacadesAllLevels().size).toBe(4);
    expect(svc.facadesByOrientation(undefined, 'N').map((f) => f.wallId)).toContain('w-s');
    // A throwing provider degrades to 0 — classification never breaks on a
    // missing site.
    svc.setTrueNorthProvider(() => { throw new Error('no site'); });
    expect(svc.getFacades('L0').get('w-s')!.orientation).toBe('S');
  });
});
