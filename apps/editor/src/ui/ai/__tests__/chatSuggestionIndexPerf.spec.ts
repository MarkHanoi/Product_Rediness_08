/**
 * @vitest-environment happy-dom
 */
// §PERF104-TYPE (L-11546) — the founder: *"the PRYZM AI RAC typing performance — I type
// sentences and it renders extremely slow — incredibly slow — why? fix it!"*
//
// WHAT RUNS PER KEYSTROKE, before this lane (`AIPanel.ts:2114`):
//
//     inputEl.addEventListener('input', () => {
//         suggestionState.filterText = inputEl.value.trim();
//         renderSuggestions();                      // ← synchronous, every character
//     });
//
// and `renderSuggestions` → `currentNodes()` → **`chatCapabilityNode()`**, which walks
// `allChatCapabilities()` and MINTS A FRESH NODE TREE — every capability re-mapped, every
// label re-cased, every hint re-templated — on every character. Then
// `collectMatchingNodes` walks that whole tree and calls `nodeSearchText(node)` per node,
// which builds a fresh array, filters it, joins it and lowercases it. Then the pill row is
// torn down (`innerHTML = ''`) and rebuilt, one `<button>` + one `addEventListener` per
// match.
//
// So a 40-character sentence rebuilds the capability tree 40 times and re-lowercases every
// node's search text 40 times, and none of it can change between keystrokes — the registry
// is static and a node's own text does not depend on what was typed.
//
// ⛔ THE ONE THING A FIX MAY NOT DO. The typed character must echo INSTANTLY and
// synchronously. The `input` handler never touches `inputEl.value` — the browser has
// already painted the character before the listener runs — so deferring the SUGGESTION
// render cannot delay the character. Any fix that touched the input's own value would be
// worse than the bug, and this file exists partly to state that boundary.
//
// This spec measures the two costs that are pure and therefore honestly measurable here:
// building the capability node tree, and the per-keystroke search-text pass. The DOM
// rebuild is not measured (happy-dom's costs are not a browser's) and is named rather than
// guessed at.
import { describe, it, expect } from 'vitest';
import { allChatCapabilities } from '@pryzm/ai-host';
import {
    buildNodeSearchText, getNodeSearchText, __resetNodeSearchTextCacheForTests,
    createCoalescedRenderer,
} from '../suggestionSearchIndex';

interface Node { label: string; hint?: string; query?: string; prefill?: string; children?: Node[] }

/** The tree `currentNodes()` produces at the root, at the founder's registry size. */
function buildCapabilityTree(): Node {
    const leaves: Node[] = allChatCapabilities()
        .filter((cap) => cap.examples.length > 0)
        .map((cap) => ({
            label: cap.description.charAt(0).toUpperCase() + cap.description.slice(1),
            hint: `"${cap.examples[0]}"${cap.destructive ? ' — asks first' : ''}`,
            query: cap.examples[0],
        }));
    return { label: 'Chat can…', hint: `${leaves.length} abilities`, children: leaves };
}

function walk(nodes: readonly Node[], visit: (n: Node) => void): void {
    for (const n of nodes) {
        visit(n);
        if (n.children?.length) walk(n.children, visit);
    }
}

describe('§PERF104-TYPE — what a keystroke costs in the RAC chat', () => {
    it('measures the per-keystroke work at the real registry size', () => {
        const caps = allChatCapabilities();
        const tree = buildCapabilityTree();
        const all: Node[] = [];
        walk([tree], (n) => all.push(n));

        const SENTENCE = 'change every wall on level 1 to a 200mm concrete wall type please';

        // ── Before: rebuild the tree + recompute every search text, per character ──
        const t0 = performance.now();
        for (let k = 0; k < SENTENCE.length; k++) {
            const t = buildCapabilityTree();
            const seen: Node[] = [];
            walk([t], (n) => { buildNodeSearchText(n); seen.push(n); });
        }
        const beforeMs = performance.now() - t0;

        // ── After: the tree is built once and every search text is memoised ────────
        __resetNodeSearchTextCacheForTests();
        const t1 = performance.now();
        const stable = buildCapabilityTree();
        const stableNodes: Node[] = [];
        walk([stable], (n) => stableNodes.push(n));
        for (let k = 0; k < SENTENCE.length; k++) {
            for (const n of stableNodes) getNodeSearchText(n);
        }
        const afterMs = performance.now() - t1;

        console.log(
            `\n[PERF104-TYPE] registry: ${caps.length} capabilities, ${all.length} nodes in the root tree\n` +
            `  ${SENTENCE.length} keystrokes, REBUILD + RECOMPUTE per character : ${beforeMs.toFixed(1)} ms ` +
            `(${(beforeMs / SENTENCE.length).toFixed(3)} ms/keystroke)\n` +
            `  ${SENTENCE.length} keystrokes, build ONCE + memoised search text  : ${afterMs.toFixed(1)} ms ` +
            `(${(afterMs / SENTENCE.length).toFixed(3)} ms/keystroke)\n` +
            '  ⚠ NEITHER figure includes the DOM teardown+rebuild of the pill row, which happy-dom ' +
            'cannot measure honestly. That is the third cost and it is addressed by the render debounce, ' +
            'not by these two.',
        );

        expect(caps.length).toBeGreaterThan(0);
        expect(afterMs).toBeLessThan(beforeMs);
    });

    it('the memoised search text is IDENTICAL to the recomputed one — the cache changes speed, never results', () => {
        __resetNodeSearchTextCacheForTests();
        const tree = buildCapabilityTree();
        const all: Node[] = [];
        walk([tree], (n) => all.push(n));
        for (const n of all) {
            expect(getNodeSearchText(n)).toBe(buildNodeSearchText(n));
            // Second read comes from the cache and must still agree.
            expect(getNodeSearchText(n)).toBe(buildNodeSearchText(n));
        }
        expect(all.length).toBeGreaterThan(1);
    });

    it('a node whose text is entirely absent still yields an EMPTY string, never undefined', () => {
        // A cache that stored `undefined` for the empty case would recompute it on every
        // read — a memo that silently does not memoise, which is worse than none because
        // it looks fixed. `''` is a value and must be cached as one.
        __resetNodeSearchTextCacheForTests();
        const bare: Node = { label: '' };
        expect(getNodeSearchText(bare)).toBe('');
        expect(getNodeSearchText(bare)).toBe('');
    });
});

describe('§PERF104-TYPE — the render coalescer', () => {
    it('collapses a burst of keystrokes into ONE render', async () => {
        let rendered = 0;
        const r = createCoalescedRenderer(() => { rendered++; }, 5);
        // A ten-character burst, as fast as a typist can produce it.
        for (let i = 0; i < 10; i++) r.request();
        expect(rendered, 'nothing may render synchronously inside the burst').toBe(0);
        await new Promise((res) => setTimeout(res, 30));
        expect(rendered).toBe(1);
        expect(r.renderCount).toBe(1);
    });

    it('renders the LAST state, not a stale intermediate one', async () => {
        // The whole risk of coalescing: showing the chips for "cha" after the user has
        // typed "change". Because the renderer reads live state at fire time rather than
        // capturing it at request time, the last request wins by construction.
        let seen = '';
        let typed = '';
        const r = createCoalescedRenderer(() => { seen = typed; }, 5);
        for (const ch of 'change') { typed += ch; r.request(); }
        await new Promise((res) => setTimeout(res, 30));
        expect(seen).toBe('change');
    });

    it('flush() runs a pending render immediately, and is idempotent', () => {
        let rendered = 0;
        const r = createCoalescedRenderer(() => { rendered++; }, 1000);
        r.request();
        r.flush();
        expect(rendered).toBe(1);
        r.flush();  // nothing pending
        expect(rendered).toBe(1);
    });

    it('cancel() drops a pending render — the SEND path owns the state from there', async () => {
        // ⛔ Not tidiness. A queued render landing after `handleSend` reset the suggestion
        // state would repaint stale chips over a fresh conversation turn.
        let rendered = 0;
        const r = createCoalescedRenderer(() => { rendered++; }, 5);
        r.request();
        r.cancel();
        await new Promise((res) => setTimeout(res, 30));
        expect(rendered).toBe(0);
    });
});
