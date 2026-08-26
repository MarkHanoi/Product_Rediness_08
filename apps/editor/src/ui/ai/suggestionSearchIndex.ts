// suggestionSearchIndex — §PERF104-TYPE (L-11546)
//
// The founder: *"the PRYZM AI RAC typing performance — I type sentences and it renders
// extremely slow — incredibly slow — why? fix it!"*
//
// ── WHAT RAN PER KEYSTROKE ───────────────────────────────────────────────────
// `AIPanel.ts`'s input listener called `renderSuggestions()` synchronously on every
// `input` event, and that call:
//
//   1. rebuilt the ENTIRE capability node tree via `chatCapabilityNode()` — every
//      registered capability re-mapped, every label re-cased, every hint re-templated;
//   2. walked the whole tree calling `nodeSearchText(node)`, which for each node built a
//      fresh array, filtered it, joined it and lowercased it;
//   3. tore the pill row down (`innerHTML = ''`) and rebuilt it, one `<button>` plus one
//      `addEventListener` per match.
//
// None of (1) or (2) can change between keystrokes. The capability registry is static for
// the session, and a node's own searchable text does not depend on what the user typed.
// A forty-character sentence therefore rebuilt the tree forty times and re-lowercased
// every node's text forty times to answer forty questions that differed only in the
// filter string.
//
// ── THE BOUNDARY THIS MODULE MUST NOT CROSS ──────────────────────────────────
// ⛔ THE TYPED CHARACTER MUST ECHO INSTANTLY AND SYNCHRONOUSLY. The browser has already
// applied and painted the character before an `input` listener runs, and neither this
// module nor the listener touches `inputEl.value`. Deferring the SUGGESTION render
// therefore cannot delay a keystroke. A "fix" that debounced the input's own value would
// be worse than the bug it treats, and that is why the debounce below is scoped to the
// render callback and nothing else.
//
// ── WHY A WeakMap AND NOT A FIELD ON THE NODE ────────────────────────────────
// `SuggestionNode` objects are built by several producers (the registry hub, the
// hand-written COMMAND_TREE, the batch catalogue, wall-type leaves minted on drill-down)
// and some are re-created on navigation. A WeakMap keyed by the node object memoises for
// exactly as long as the node lives and collects with it — no cache-invalidation protocol
// to get wrong, and no extra key on a shape other code serialises.
//
// P8: every exported function carries an OTel span.

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.ui.ai.suggestionSearchIndex');

/** The searchable fields of a suggestion node. Structural on purpose — this module must
 *  not import `AIPanel.ts` (which imports the world); the four fields are the contract. */
export interface SearchableSuggestionNode {
    readonly label?: string;
    readonly hint?: string;
    readonly query?: string;
    readonly prefill?: string;
}

// Held in a MUTABLE binding so `__resetNodeSearchTextCacheForTests` can genuinely drop it
// (a WeakMap has no `clear`). A "reset" that did nothing would be the same defect class as
// a gate that checks nothing — the name would assert a behaviour the code does not have.
let _searchTextCache = new WeakMap<object, string>();

/**
 * Build a node's lowercased search text. This is the ORIGINAL computation, unchanged —
 * kept exported so a test can assert that the memoised value and the freshly computed one
 * are identical. A cache that changes results is not a cache.
 */
export function buildNodeSearchText(node: SearchableSuggestionNode): string {
    const span = _tracer.startSpan('pryzm.ui.ai.buildNodeSearchText');
    try {
        return [node.label, node.hint, node.query, node.prefill]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
    } finally {
        span.end();
    }
}

/**
 * Memoised {@link buildNodeSearchText}.
 *
 * ⚠ `''` IS A VALUE AND IS CACHED AS ONE. A cache that treated the empty string as "not
 * cached" would recompute it on every keystroke for every node with no searchable text —
 * a memo that silently does not memoise, which is worse than no memo because it looks
 * fixed. `WeakMap.has` is the check, never truthiness of the stored value.
 */
export function getNodeSearchText(node: SearchableSuggestionNode): string {
    const span = _tracer.startSpan('pryzm.ui.ai.getNodeSearchText');
    try {
        const key = node as unknown as object;
        // `has`, not truthiness: `''` is a legitimate cached value for a node with no
        // searchable text, and a truthiness check would recompute it on every keystroke.
        if (_searchTextCache.has(key)) return _searchTextCache.get(key) as string;
        const built = buildNodeSearchText(node);
        _searchTextCache.set(key, built);
        return built;
    } finally {
        span.end();
    }
}

/** Test-only: drop the memo so a benchmark can measure a cold pass. */
export function __resetNodeSearchTextCacheForTests(): void {
    const span = _tracer.startSpan('pryzm.ui.ai.resetSearchTextCache');
    try {
        _searchTextCache = new WeakMap<object, string>();
    } finally {
        span.end();
    }
}

/**
 * Coalesce a burst of keystrokes into ONE render.
 *
 * ⛔ Deliberately `setTimeout`, not `requestAnimationFrame` and not the frame bus: P3
 * gives rAF to `packages/frame-scheduler` alone, and a chat panel that is not animating
 * must not mint frames to redraw a list. A timer schedules no frames.
 *
 * ⚠ `0` IS A LEGITIMATE DELAY and means "the next macrotask", i.e. coalesce only within
 * the current task. It is NOT the same as calling synchronously — the difference is that
 * ten `input` events delivered in one burst produce ONE render instead of ten.
 *
 * `flush()` runs any pending render immediately — required on SEND, where the user's
 * gesture must not race a queued render, and on teardown.
 */
export interface CoalescedRenderer {
    /** Request a render. Repeated calls within the window collapse into one. */
    request(): void;
    /** Run a pending render NOW (no-op when nothing is pending). */
    flush(): void;
    /** Drop any pending render without running it. */
    cancel(): void;
    /** How many renders this instance has actually performed — for tests and probes. */
    readonly renderCount: number;
}

export function createCoalescedRenderer(render: () => void, delayMs = 60): CoalescedRenderer {
    const span = _tracer.startSpan('pryzm.ui.ai.createCoalescedRenderer');
    try {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let count = 0;
        const run = (): void => {
            timer = null;
            count++;
            render();
        };
        return {
            request(): void {
                if (timer !== null) clearTimeout(timer);
                timer = setTimeout(run, delayMs);
            },
            flush(): void {
                if (timer === null) return;
                clearTimeout(timer);
                run();
            },
            cancel(): void {
                if (timer === null) return;
                clearTimeout(timer);
                timer = null;
            },
            get renderCount(): number { return count; },
        };
    } finally {
        span.end();
    }
}
