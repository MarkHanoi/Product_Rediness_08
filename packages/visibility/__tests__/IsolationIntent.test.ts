// C27 INS-α-3 (BIM 3.0 Inspect Model) — IsolationVisibilityIntent tests.
//
// Covers the pure intent + apply function shipped in `src/intents/`:
//   - `spatialRelationship(selection, location)` — relationship resolver.
//   - `buildIsolationIntent(selection, elements, opts?)` — Map producer.
//   - `buildPassThroughIntent(elements)` — null-selection pass-through.
//
// Scenarios traced from C27 §5.1 (relationship → tier mapping) plus the
// realistic building-tree scenarios from master plan Part V §11.2.

import { describe, expect, it } from 'vitest';
import type { InspectSelection } from '@pryzm/schemas';
import {
    buildIsolationIntent,
    buildPassThroughIntent,
    spatialRelationship,
    type ElementLocation,
} from '../src/intents/IsolationIntent.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Build an `InspectSelection` for a room inside building/level. */
function roomSelection(
    roomId: string,
    levelId: string,
    buildingId = 'b1',
    projectId = 'p1',
): InspectSelection {
    return {
        kind: 'room',
        id: roomId,
        level: 4,
        breadcrumb: [
            { kind: 'project', id: projectId },
            { kind: 'building', id: buildingId },
            { kind: 'level', id: levelId },
        ],
    };
}

/** Build an `InspectSelection` for an apartment. */
function apartmentSelection(
    apartmentId: string,
    levelId: string,
    buildingId = 'b1',
    projectId = 'p1',
): InspectSelection {
    return {
        kind: 'apartment',
        id: apartmentId,
        level: 3,
        breadcrumb: [
            { kind: 'project', id: projectId },
            { kind: 'building', id: buildingId },
            { kind: 'level', id: levelId },
        ],
    };
}

function loc(
    elementId: string,
    kind: ElementLocation['kind'],
    parentChain: ReadonlyArray<{ kind: string; id: string }>,
): ElementLocation {
    return { elementId, kind, parentChain };
}

// ─── spatialRelationship ──────────────────────────────────────────────────

describe('spatialRelationship', () => {
    it('returns SELECTED when location.elementId matches selection.id', () => {
        const sel = roomSelection('r1', 'lvl1');
        const elem = loc('r1', 'room', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
            { kind: 'level', id: 'lvl1' },
        ]);
        expect(spatialRelationship(sel, elem)).toBe('SELECTED');
    });

    it('returns CHILD when selection appears in the element parent chain', () => {
        const sel = roomSelection('r1', 'lvl1');
        const wall = loc('w1', 'elementInstance', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
            { kind: 'level', id: 'lvl1' },
            { kind: 'room', id: 'r1' },
        ]);
        expect(spatialRelationship(sel, wall)).toBe('CHILD');
    });

    it('returns PARENT when the element appears in the selection breadcrumb', () => {
        const sel = roomSelection('r1', 'lvl1');
        const level = loc('lvl1', 'level', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
        ]);
        expect(spatialRelationship(sel, level)).toBe('PARENT');
    });

    it('returns SIBLING when element shares the immediate parent with the selection', () => {
        const sel = roomSelection('r1', 'lvl1');
        const sibling = loc('r2', 'room', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
            { kind: 'level', id: 'lvl1' },
        ]);
        expect(spatialRelationship(sel, sibling)).toBe('SIBLING');
    });

    it('returns UNRELATED when nothing is shared', () => {
        const sel = roomSelection('r1', 'lvl1');
        const stranger = loc('r99', 'room', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b2' }, // different building entirely
            { kind: 'level', id: 'lvl99' },
        ]);
        expect(spatialRelationship(sel, stranger)).toBe('UNRELATED');
    });

    it('does NOT mis-classify cousin (same project, different level) as SIBLING', () => {
        const sel = roomSelection('r1', 'lvl1');
        const cousin = loc('r2', 'room', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
            { kind: 'level', id: 'lvl2' }, // different level → immediate parent differs
        ]);
        expect(spatialRelationship(sel, cousin)).toBe('UNRELATED');
    });
});

// ─── buildIsolationIntent ─────────────────────────────────────────────────

describe('buildIsolationIntent', () => {
    it('produces exactly one IsolationOverride per input element', () => {
        const sel = roomSelection('r1', 'lvl1');
        const elems: ElementLocation[] = [
            loc('r1', 'room', []),
            loc('w1', 'elementInstance', []),
            loc('w2', 'elementInstance', []),
        ];
        const out = buildIsolationIntent(sel, elems);
        expect(out.size).toBe(3);
        expect(out.has('r1')).toBe(true);
        expect(out.has('w1')).toBe(true);
        expect(out.has('w2')).toBe(true);
    });

    it('SELECTED element → FULL with no opacity field', () => {
        const sel = roomSelection('r1', 'lvl1');
        const out = buildIsolationIntent(sel, [loc('r1', 'room', [])]);
        const ov = out.get('r1')!;
        expect(ov.tier).toBe('FULL');
        expect(ov.opacity).toBeUndefined();
    });

    it('CHILD element → FULL with no opacity field', () => {
        const sel = roomSelection('r1', 'lvl1');
        const child = loc('w1', 'elementInstance', [
            { kind: 'level', id: 'lvl1' },
            { kind: 'room', id: 'r1' },
        ]);
        const out = buildIsolationIntent(sel, [child]);
        const ov = out.get('w1')!;
        expect(ov.tier).toBe('FULL');
        expect(ov.opacity).toBeUndefined();
    });

    it('PARENT element → DIMMED with default opacity 0.7', () => {
        const sel = roomSelection('r1', 'lvl1');
        const parent = loc('lvl1', 'level', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
        ]);
        const out = buildIsolationIntent(sel, [parent]);
        const ov = out.get('lvl1')!;
        expect(ov.tier).toBe('DIMMED');
        expect(ov.opacity).toBe(0.7);
    });

    it('SIBLING element → DIMMED with default opacity 0.2', () => {
        const sel = roomSelection('r1', 'lvl1');
        const sibling = loc('r2', 'room', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
            { kind: 'level', id: 'lvl1' },
        ]);
        const out = buildIsolationIntent(sel, [sibling]);
        const ov = out.get('r2')!;
        expect(ov.tier).toBe('DIMMED');
        expect(ov.opacity).toBe(0.2);
    });

    it('UNRELATED element → DIMMED with default opacity 0.1', () => {
        const sel = roomSelection('r1', 'lvl1');
        const stranger = loc('r99', 'room', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b2' },
            { kind: 'level', id: 'lvl99' },
        ]);
        const out = buildIsolationIntent(sel, [stranger]);
        const ov = out.get('r99')!;
        expect(ov.tier).toBe('DIMMED');
        expect(ov.opacity).toBe(0.1);
    });

    it('UNRELATED with hideUnrelated: true → HIDDEN with no opacity', () => {
        const sel = roomSelection('r1', 'lvl1');
        const stranger = loc('r99', 'room', [
            { kind: 'level', id: 'lvl99' },
        ]);
        const out = buildIsolationIntent(sel, [stranger], { hideUnrelated: true });
        const ov = out.get('r99')!;
        expect(ov.tier).toBe('HIDDEN');
        expect(ov.opacity).toBeUndefined();
    });

    it('opts.opacityForParent overrides the default 0.7', () => {
        const sel = roomSelection('r1', 'lvl1');
        const parent = loc('lvl1', 'level', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
        ]);
        const out = buildIsolationIntent(sel, [parent], { opacityForParent: 0.5 });
        expect(out.get('lvl1')!.opacity).toBe(0.5);
    });

    it('opts.opacityForSibling overrides the default 0.2', () => {
        const sel = roomSelection('r1', 'lvl1');
        const sibling = loc('r2', 'room', [
            { kind: 'project', id: 'p1' },
            { kind: 'building', id: 'b1' },
            { kind: 'level', id: 'lvl1' },
        ]);
        const out = buildIsolationIntent(sel, [sibling], { opacityForSibling: 0.35 });
        expect(out.get('r2')!.opacity).toBe(0.35);
    });

    it('opts.opacityForUnrelated overrides the default 0.1', () => {
        const sel = roomSelection('r1', 'lvl1');
        const stranger = loc('r99', 'room', [
            { kind: 'level', id: 'lvl99' },
        ]);
        const out = buildIsolationIntent(sel, [stranger], { opacityForUnrelated: 0.05 });
        expect(out.get('r99')!.opacity).toBe(0.05);
    });

    it('hideUnrelated takes precedence over opacityForUnrelated', () => {
        const sel = roomSelection('r1', 'lvl1');
        const stranger = loc('r99', 'room', []);
        const out = buildIsolationIntent(sel, [stranger], {
            hideUnrelated: true,
            opacityForUnrelated: 0.05,
        });
        const ov = out.get('r99')!;
        expect(ov.tier).toBe('HIDDEN');
        expect(ov.opacity).toBeUndefined();
    });

    it('empty elements array → empty Map', () => {
        const sel = roomSelection('r1', 'lvl1');
        const out = buildIsolationIntent(sel, []);
        expect(out.size).toBe(0);
    });

    it('selection.id NOT in elements → no SELECTED entry, but other relations resolve', () => {
        const sel = roomSelection('rZ', 'lvl1'); // rZ is not in the list
        const elems: ElementLocation[] = [
            loc('lvl1', 'level', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
            ]),
            loc('r2', 'room', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
                { kind: 'level', id: 'lvl1' },
            ]),
        ];
        const out = buildIsolationIntent(sel, elems);
        // no element has tier FULL — selection is absent.
        const fulls = [...out.values()].filter(o => o.tier === 'FULL');
        expect(fulls.length).toBe(0);
        expect(out.get('lvl1')!.tier).toBe('DIMMED'); // PARENT
        expect(out.get('r2')!.tier).toBe('DIMMED');   // SIBLING
    });

    it('determinism: same input twice → semantically identical output', () => {
        const sel = roomSelection('r1', 'lvl1');
        const elems: ElementLocation[] = [
            loc('r1', 'room', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
                { kind: 'level', id: 'lvl1' },
            ]),
            loc('r2', 'room', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
                { kind: 'level', id: 'lvl1' },
            ]),
            loc('lvl1', 'level', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
            ]),
        ];
        const a = buildIsolationIntent(sel, elems);
        const b = buildIsolationIntent(sel, elems);
        expect([...a.entries()]).toEqual([...b.entries()]);
    });

    it('preserves input order in the output Map (deterministic iteration)', () => {
        const sel = roomSelection('r1', 'lvl1');
        const elems: ElementLocation[] = [
            loc('z', 'elementInstance', []),
            loc('a', 'elementInstance', []),
            loc('m', 'elementInstance', []),
        ];
        const out = buildIsolationIntent(sel, elems);
        expect([...out.keys()]).toEqual(['z', 'a', 'm']);
    });

    // ─── Realistic building-tree scenarios (C27 §5.1) ─────────────────

    it('room selected → level is PARENT, room walls are CHILD, sibling rooms are SIBLING', () => {
        const sel = roomSelection('r1', 'lvl1');
        const elems: ElementLocation[] = [
            // The level (PARENT — in selection.breadcrumb)
            loc('lvl1', 'level', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
            ]),
            // Walls inside r1 (CHILD — r1 in their parentChain)
            loc('w1', 'elementInstance', [
                { kind: 'level', id: 'lvl1' },
                { kind: 'room', id: 'r1' },
            ]),
            loc('w2', 'elementInstance', [
                { kind: 'level', id: 'lvl1' },
                { kind: 'room', id: 'r1' },
            ]),
            // Sibling room on the same level
            loc('r2', 'room', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
                { kind: 'level', id: 'lvl1' },
            ]),
            // The selected room itself
            loc('r1', 'room', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
                { kind: 'level', id: 'lvl1' },
            ]),
        ];
        const out = buildIsolationIntent(sel, elems);
        expect(out.get('lvl1')!.tier).toBe('DIMMED');
        expect(out.get('lvl1')!.opacity).toBe(0.7); // PARENT
        expect(out.get('w1')!.tier).toBe('FULL');   // CHILD
        expect(out.get('w2')!.tier).toBe('FULL');   // CHILD
        expect(out.get('r2')!.tier).toBe('DIMMED');
        expect(out.get('r2')!.opacity).toBe(0.2);   // SIBLING
        expect(out.get('r1')!.tier).toBe('FULL');   // SELECTED
    });

    it('apartment selected → rooms are CHILD, other apartments on same level are SIBLING, level is PARENT', () => {
        const sel = apartmentSelection('apt1', 'lvl1');
        const elems: ElementLocation[] = [
            // The selected apartment
            loc('apt1', 'apartment', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
                { kind: 'level', id: 'lvl1' },
            ]),
            // Rooms inside apt1 (CHILD)
            loc('r-living', 'room', [
                { kind: 'level', id: 'lvl1' },
                { kind: 'apartment', id: 'apt1' },
            ]),
            loc('r-bed', 'room', [
                { kind: 'level', id: 'lvl1' },
                { kind: 'apartment', id: 'apt1' },
            ]),
            // Other apartment on the same level (SIBLING)
            loc('apt2', 'apartment', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
                { kind: 'level', id: 'lvl1' },
            ]),
            // The level itself (PARENT)
            loc('lvl1', 'level', [
                { kind: 'project', id: 'p1' },
                { kind: 'building', id: 'b1' },
            ]),
        ];
        const out = buildIsolationIntent(sel, elems);
        expect(out.get('apt1')!.tier).toBe('FULL');     // SELECTED
        expect(out.get('r-living')!.tier).toBe('FULL'); // CHILD
        expect(out.get('r-bed')!.tier).toBe('FULL');    // CHILD
        expect(out.get('apt2')!.tier).toBe('DIMMED');
        expect(out.get('apt2')!.opacity).toBe(0.2);     // SIBLING
        expect(out.get('lvl1')!.tier).toBe('DIMMED');
        expect(out.get('lvl1')!.opacity).toBe(0.7);     // PARENT
    });

    it('deeply nested CHILD (grandchild) is still CHILD (FULL)', () => {
        // Apartment selected; element is a wall inside a room inside the
        // apartment.  apt1 appears in the wall's parentChain → CHILD.
        const sel = apartmentSelection('apt1', 'lvl1');
        const grandchild = loc('w1', 'elementInstance', [
            { kind: 'level', id: 'lvl1' },
            { kind: 'apartment', id: 'apt1' },
            { kind: 'room', id: 'r-living' },
        ]);
        const out = buildIsolationIntent(sel, [grandchild]);
        expect(out.get('w1')!.tier).toBe('FULL');
        expect(out.get('w1')!.opacity).toBeUndefined();
    });

    it('elementId field on every IsolationOverride matches the input elementId', () => {
        const sel = roomSelection('r1', 'lvl1');
        const elems: ElementLocation[] = [
            loc('a', 'elementInstance', []),
            loc('b', 'elementInstance', []),
            loc('c', 'elementInstance', []),
        ];
        const out = buildIsolationIntent(sel, elems);
        for (const [id, ov] of out.entries()) {
            expect(ov.elementId).toBe(id);
        }
    });
});

// ─── buildPassThroughIntent ───────────────────────────────────────────────

describe('buildPassThroughIntent', () => {
    it('returns FULL with no opacity for every element', () => {
        const elems: ElementLocation[] = [
            loc('a', 'elementInstance', []),
            loc('b', 'elementInstance', []),
            loc('c', 'room', []),
        ];
        const out = buildPassThroughIntent(elems);
        expect(out.size).toBe(3);
        for (const ov of out.values()) {
            expect(ov.tier).toBe('FULL');
            expect(ov.opacity).toBeUndefined();
        }
    });

    it('preserves elementId on every override', () => {
        const elems: ElementLocation[] = [
            loc('x', 'elementInstance', []),
            loc('y', 'elementInstance', []),
        ];
        const out = buildPassThroughIntent(elems);
        expect(out.get('x')!.elementId).toBe('x');
        expect(out.get('y')!.elementId).toBe('y');
    });

    it('empty elements array → empty Map', () => {
        const out = buildPassThroughIntent([]);
        expect(out.size).toBe(0);
    });
});
