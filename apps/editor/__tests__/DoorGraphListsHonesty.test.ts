// GR-10 — layoutBubbleGraph `doorGraphListsOrUnknown` differentiating tests.
//
// §CIRC-REACH reads the per-room DOOR graph to paint unreachable rooms red.
// The old shape iterated `r.doorAdjacentTo ?? []` — an UNRECORDED door graph
// on one room and a genuinely SEALED room (empty list) were the same value,
// one guard away from flagging pre-deploy layouts as non-compliant. The honest
// read returns `null` (whole analysis refuses) when any room's graph was never
// recorded, and keeps the empty list as a real sealed-room answer. The `null`
// assertions fail against the `?? []` shape, which produced lists in every case.

import { describe, it, expect } from 'vitest';
import { doorGraphListsOrUnknown } from '../src/ui/apartment-layout/layoutBubbleGraph';

describe('doorGraphListsOrUnknown — unrecorded ≠ sealed (C75 §1.4)', () => {
    it('every room recorded → index-aligned lists; an EMPTY list survives as "sealed"', () => {
        const lists = doorGraphListsOrUnknown([
            { doorAdjacentTo: ['hall'] },
            { doorAdjacentTo: [] }, // genuinely sealed — a real, determined answer
        ]);
        expect(lists).toEqual([['hall'], []]);
    });

    it('ONE room with an unrecorded door graph refuses the WHOLE read (null, not [])', () => {
        const lists = doorGraphListsOrUnknown([
            { doorAdjacentTo: ['hall'] },
            {}, // doorAdjacentTo never recorded (pre-deploy engine build)
        ]);
        // The old `?? []` shape produced [['hall'], []] here — indistinguishable
        // from the sealed-room case above, which is exactly the ledger defect.
        expect(lists).toBeNull();
    });

    it('zero rooms → null (there is no door graph to speak of, not an empty one)', () => {
        expect(doorGraphListsOrUnknown([])).toBeNull();
    });
});
