// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the house-layout node inspector's ISOLATION diagnosis may only ever be made
// over a RECORDED door graph.
//
// computeEntranceReach carried a dead `r.doorAdjacentTo ?? []` below its own
// every()-guard — the guard is what makes this file honest (an unrecorded door
// graph returns null = reach UNDETERMINED, and the "isolated from the
// entrance" verdict is skipped). The `?? []` was unreachable, but it was also
// exactly the line that would silently reintroduce the unknown→empty collapse
// if the guard were ever weakened. These cases PIN the guard: they fail
// against any shape that treats an absent door list as an empty one.

import { describe, it, expect } from 'vitest';
import { buildNodeInspectorHtml } from '../house-layout/houseModalHtml';

const HALL = { name: 'Hall', type: 'hall', area: 6, adjacentTo: ['Corridor'], doorAdjacentTo: ['Corridor'] };
const CORRIDOR = { name: 'Corridor', type: 'corridor', area: 5, adjacentTo: ['Hall', 'Bedroom'], doorAdjacentTo: ['Hall'] };
// Bedroom: DETERMINED door graph, zero doors — genuinely cut off.
const BEDROOM_SEALED = { name: 'Bedroom', type: 'bedroom', area: 12, adjacentTo: ['Corridor'], doorAdjacentTo: [] as string[] };
// Bedroom: door graph NEVER RECORDED (pre-deploy engine build).
const BEDROOM_UNRECORDED = { name: 'Bedroom', type: 'bedroom', area: 12, adjacentTo: ['Corridor'] };

describe('buildNodeInspectorHtml — isolation is diagnosed only over a RECORDED door graph (GR-10)', () => {
  it('a DETERMINED door graph isolates the genuinely sealed room', () => {
    const storey = [HALL, CORRIDOR, BEDROOM_SEALED] as never[];
    const html = buildNodeInspectorHtml(BEDROOM_SEALED as never, storey as never);
    expect(html).toContain('isolated from the entrance');
  });

  it('an UNRECORDED door graph must NOT produce the isolation diagnosis — unknown is not sealed', () => {
    const storey = [HALL, CORRIDOR, BEDROOM_UNRECORDED] as never[];
    const html = buildNodeInspectorHtml(BEDROOM_UNRECORDED as never, storey as never);
    // FAILS against any shape that defaults an absent doorAdjacentTo to []:
    // the reach BFS would then compute and brand this room isolated.
    expect(html).not.toContain('isolated from the entrance');
    // The wall-adjacency fallback still answers (declared pre-deploy contract):
    expect(html).toContain('On circulation');
  });

  it('negative control: the entrance hall is on-circulation under both graphs', () => {
    for (const storey of [[HALL, CORRIDOR, BEDROOM_SEALED], [HALL, CORRIDOR, BEDROOM_UNRECORDED]]) {
      const html = buildNodeInspectorHtml(HALL as never, storey as never);
      expect(html).toContain('entry hall');
    }
  });
});
