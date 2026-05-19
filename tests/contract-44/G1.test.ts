// Contract 44 — G1: plan view elements MUST be scoped to the active level.
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 line 622.
// ADR:  docs/architecture/adr/0025-plan-view-svp-parity-contract-44.md.

import { describe, expect, it } from 'vitest';
import { Wall, createId } from '@pryzm/schemas';
import { scopeToLevel } from '@pryzm/plugin-plan-view';

function wallOnLevel(levelId: string, x: number): Wall {
  return Wall.parse({
    id: createId('wall'),
    levelId,
    baseLine: [
      { x, y: 0, z: 0 },
      { x: x + 4, y: 0, z: 0 },
    ],
    thickness: 0.2,
  });
}

describe('Contract 44 — G1: walls scope to the active level', () => {
  it('walls on other levels are excluded from the active-level scope', () => {
    const w_l1_a = wallOnLevel('L1', 0);
    const w_l2   = wallOnLevel('L2', 0);
    const w_l1_b = wallOnLevel('L1', 5);

    const out = scopeToLevel([w_l1_a, w_l2, w_l1_b], 'L1', (w) => w.levelId);
    const ids = out.map((w) => w.id).sort();
    expect(ids).toEqual([w_l1_a.id, w_l1_b.id].sort());
    expect(out).not.toContain(w_l2);
  });
});
