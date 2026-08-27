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

// §RACORIENT145 — a curtain wall classifies exactly like a wall: same shape
// (id/levelId/baseLine), same `classifyFacades` math, no second formula. This
// is the HOST a curtain-panel inherits its facing from
// (§CHAT-ORIENTATION-HOSTED-OPENINGS, L-10946 — "an opening faces where its
// host faces"); before this the curtain-wall store was absent from `_walls()`
// entirely, so a panel's host could never be found facing anything.
describe('FacadeOrientationService — curtain walls join the facade classification (§RACORIENT145)', () => {
  const CURTAIN_WALLS = [
    // A glazed south facade, replacing what would otherwise be the south wall.
    { id: 'cw-s', levelId: 'L0', baseLine: [{ x: -5, y: 0, z: 5 }, { x: 5, y: 0, z: 5 }] },
  ];

  it('an exterior curtain wall gets a compass orientation, θ=0', () => {
    storeRegistry.register('wall', { getAll: () => WALLS.filter((w) => w.id !== 'w-s') } as never);
    storeRegistry.register('curtainwall', { getAll: () => CURTAIN_WALLS } as never);
    storeRegistry.register('room', { getAll: () => [] } as never);

    const svc = new FacadeOrientationService();
    const facades = svc.getFacades('L0');
    expect(facades.get('cw-s')!.isExterior).toBe(true);
    expect(facades.get('cw-s')!.orientation).toBe('S');
    // The compass-scoped selector (facadesByOrientation) returns the curtain
    // wall's id alongside any wall's, the same way a window-hosting wall does.
    expect(svc.facadesByOrientation('L0', 'S').map((f) => f.wallId)).toContain('cw-s');
  });

  it('θ-threaded (true-north corrected): a 90°-rotated site reclassifies the SAME curtain wall', () => {
    storeRegistry.register('wall', { getAll: () => WALLS.filter((w) => w.id !== 'w-s') } as never);
    storeRegistry.register('curtainwall', { getAll: () => CURTAIN_WALLS } as never);
    storeRegistry.register('room', { getAll: () => [] } as never);

    const svc = new FacadeOrientationService();
    // Byte-identical θ-threading proof to the wall case above: the raw
    // authoring-frame +Z normal is South at θ=0 and West at θ=+90°.
    expect(svc.getFacades('L0', Math.PI / 2).get('cw-s')!.orientation).toBe('W');
  });
});
