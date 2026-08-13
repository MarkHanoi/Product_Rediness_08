// GR-10 — ScreenReaderListView `countSpatialNodes` differentiating tests.
//
// The old `_countNodes` read `n.children ?? []`: a node whose child list was
// never recorded counted as a LEAF, and the heading announced an EXACT element
// count to a screen-reader user — the one audience that cannot cross-check the
// number against the canvas. The honest count marks itself inexact and names
// the nodes whose subtrees are unknown. Every "inexact" assertion here fails
// against the `?? []` shape, which reported exact for both cases.

import { describe, it, expect } from 'vitest';
import { countSpatialNodes, type SpatialNode } from '../src/ui/a11y/ScreenReaderListView';

const leaf = (id: string): SpatialNode => ({ id, label: id, type: 'wall', level: 0, children: [] });

describe('countSpatialNodes — absent children ≠ leaf (C75 §1.4)', () => {
    it('a fully recorded tree counts EXACTLY (empty child lists are real leaves)', () => {
        const tree: SpatialNode[] = [
            { id: 'lvl', label: 'L0', type: 'level', level: 0, children: [leaf('w1'), leaf('w2')] },
        ];
        expect(countSpatialNodes(tree)).toEqual({
            total: 3,
            exact: true,
            unrecordedChildrenNodeIds: [],
        });
    });

    it('a node with an ABSENT child list makes the count INEXACT and is NAMED', () => {
        const unrecorded: SpatialNode = { id: 'mystery', label: 'M', type: 'unit', level: 1 };
        const tree: SpatialNode[] = [
            { id: 'lvl', label: 'L0', type: 'level', level: 0, children: [leaf('w1'), unrecorded] },
        ];
        const c = countSpatialNodes(tree);
        expect(c.total).toBe(3); // the node itself counts; its subtree is UNKNOWN, not zero
        expect(c.exact).toBe(false); // the old `?? []` shape reported exact:true here
        expect(c.unrecordedChildrenNodeIds).toEqual(['mystery']);
    });

    it('negative control: an empty tree is exactly zero, not undetermined', () => {
        expect(countSpatialNodes([])).toEqual({
            total: 0,
            exact: true,
            unrecordedChildrenNodeIds: [],
        });
    });
});
