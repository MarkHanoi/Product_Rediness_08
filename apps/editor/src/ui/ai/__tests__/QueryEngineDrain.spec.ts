// §DRAIN (RAC U10.3) — what the LEGACY QueryEngine path still uniquely serves.
//
// The chat has two vocabularies. The older one is `AIPanel.COMMAND_TREE`, ~100
// phrasings hand-transcribed from `QueryEngine`'s regex table. The current one
// is `ChatCapabilityRegistry`, and the resolution ladder answers BEFORE
// `aiService.query()` ever runs. So every hand-written pill is now in one of
// three states, and which state it is in is a FACT, not an opinion:
//
//   SERVED     — the ladder misses it, so the QueryEngine pattern still runs.
//                This is what the legacy path uniquely serves, and the list
//                below is the answer to "what is left to drain?".
//   SHADOWED   — the ladder claims it and handles it correctly. The QueryEngine
//                pattern behind it is unreachable from chat.
//   MISREAD    — the ladder claims it and gets it WRONG. These are live defects,
//                not drain progress, and they are named individually so that
//                fixing one FAILS this test and forces the inventory to move.
//
// The point of pinning all three is that "drained" is otherwise unfalsifiable:
// a pattern that stopped being reached because something upstream started
// eating it looks exactly like a pattern that was properly replaced
// ([[context-data-honesty-family]] — failure and empty are the same value until
// you make them different).

import { describe, it, expect } from 'vitest';
import {
    resolveUtterance,
    resolveNaturalLanguage,
    resolveCompoundUtterance,
    allChatCapabilities,
    type ResolverContext,
} from '@pryzm/ai-host';
import { COMMAND_TREE, chatCapabilityNode, type SuggestionNode } from '../AIPanel';

// ─── The classification ──────────────────────────────────────────────────────

/** The context a pill click really runs in: something selected (pills are used
 *  with a selection as often as without), the project's levels, an active
 *  level. Deliberately NOT an empty context, which would make half the ladder
 *  refuse for want of a target and report the wrong classification. */
const ctx: ResolverContext = {
    selection: [{ elementId: 'w1', elementType: 'wall' }],
    levels: [
        { id: 'L0', name: 'Level 0', elevation: 0 },
        { id: 'L1', name: 'Level 1', elevation: 3 },
    ],
    activeLevelId: 'L0',
    mintId: () => 'drain-probe',
};

function collectQueries(nodes: readonly SuggestionNode[], out: string[] = []): string[] {
    for (const n of nodes) {
        if (typeof n.query === 'string' && n.query.length > 0) out.push(n.query);
        if (n.children) collectQueries(n.children, out);
    }
    return out;
}

/** Which capability, if any, the deterministic ladder claims for a phrasing. */
function claimedBy(utterance: string): string | null {
    const plan = resolveCompoundUtterance(utterance, ctx);
    const r = plan ?? resolveUtterance(utterance, ctx);
    if (r.kind !== 'miss') return r.intent;
    const nl = resolveNaturalLanguage(utterance, ctx);
    if (nl.kind === 'resolved') return nl.resolution.intent;
    if (nl.kind === 'clarification') return 'clarify';
    return null;
}

const treeQueries = [...new Set(collectQueries(COMMAND_TREE))].sort();

/**
 * MISREAD — the ladder claims these and produces the WRONG thing. Verified by
 * reading the resolution, not by suspicion. What is LEFT after the U9 fix pass:
 *
 *  • "create (curtain) walls on all slabs" / "by ground floor slab" / "on the
 *    perimeter of slab" → `create-wall`, which then refuses for want of
 *    coordinates. The verb+noun are right and only the PLACEMENT is missing, so
 *    the honest fix is the slab-derived creation route (E-class today:
 *    wall.create-on-all-slabs and curtain-wall.create-on-all-slabs are both
 *    classified E in ChatCommandClassification, blocked on preview-before-
 *    execute), not a narrower grammar.
 *  • "delete all grids" → a `clarify` question about the selection. Grid is not
 *    a DeleteElementCommand branch, so U9.2 did not claim it (see the
 *    DeleteFamilies header for the bar a kind has to clear).
 *
 * Fixing any of these must fail this test — that is the whole point of naming
 * them one by one instead of counting them.
 */
const MISREAD: readonly string[] = [
    'create curtain walls by ground floor slab',
    'create curtain walls on all slabs',
    'create curtain walls on slab',
    'create walls by ground floor slab',
    'create walls on all slabs',
    'create walls on the perimeter of slab',
    'delete all grids',
];

/**
 * DRAINED — these WERE misreads and are now honest misses. Each is pinned here
 * rather than deleted, because "the ladder no longer claims it" is a property
 * that can regress silently; a resolver change that re-claims one fails this
 * spec instead of quietly resurrecting the defect.
 *
 * Closed by fd27e513 (§FIX-CHAT-VISIBILITY-MISREAD / §FIX-CHAT-TYPEREF-SWALLOW
 * and the add-level over-claim pass), 2026-08-11:
 *
 *  • "highlight walls taller than 3m" / "isolate doors higher than 2 meters"
 *    were the worst of the whole inventory — `set-height` DISPATCHING
 *    wall.updateDimensions, so a read-only visibility question resized a wall.
 *  • "create N levels at Xm" read the COUNT as an elevation (one level at 10 m).
 *  • "create floor plan view" / "create stairs between levels" / "create slabs
 *    in all levels" all became `add-level`, because the token "level" anywhere
 *    in the sentence was enough.
 *  • "make all slabs <colour>" and "set all slabs thickness to Xm" became
 *    `set-slab-type` with a typeRef of "blue" or "thickness to 0.2m", stating a
 *    falsehood in the summary before the command refused it.
 *  • the three "set all curtain wall …" phrasings were the same all-scope
 *    dimension misread; U7.3 gave the chat REAL curtain-wall mullion/panel
 *    properties, but they are selection-scoped, so the all-scope form is now an
 *    honest miss rather than an edit of whatever happened to be selected.
 *
 * Closed by §FIX-CHAT-HIDE-IS-NOT-NAVIGATE (RAC-FIX-1), 2026-08-11:
 *
 *  • "isolate level 2" → `go-to-level`. It moved out of MISREAD, where it had
 *    been parked with the note "it closes when the chat gains a real isolate
 *    capability". That note was WRONG about where the capability lives, and the
 *    RAC-2 conformance probe is what proved it: `QueryEngine.ts:1363-1386`
 *    carries a LIVE isolate-level handler, and `:1339-1360` a live hide-level
 *    one, both emitting `pryzm-visibility-command` to a real consumer at
 *    `UnifiedBrowserPanel.ts:154`. The ladder was not covering a gap — it was
 *    STANDING IN FRONT of the path that does the right thing.
 *  • "hide level 2" / "hide all walls" / "turn off level 2" were the same
 *    defect, and were in NEITHER list: the RAC-2 scorecard (§1.2) found them
 *    undocumented. `hide level 2` and `show level 2` — two opposite asks —
 *    produced the identical `setActiveLevel`.
 *
 * Note what did NOT change: "show level 2" still resolves to `go-to-level`,
 * because for `show` that is the right answer. The fix split the opener class
 * (`visibilityAskClass` in `CapabilityRefusal.ts`) instead of blanket-refusing
 * every visibility verb — a blanket refusal would have "fixed" `hide` by
 * breaking `show`.
 */
const DRAINED: readonly string[] = [
    'create 10 levels at 3.5m',
    'create 10 levels at 3m',
    'create 15 levels at 4m',
    'create 20 levels at 3m',
    'create 5 levels at 3m',
    'create 8 levels at 3m',
    'create floor plan view',
    'create slabs in all levels',
    'create stairs between levels',
    'highlight walls taller than 3m',
    'isolate doors higher than 2 meters',
    'make all slabs blue',
    'make all slabs gray',
    'make all slabs white',
    'set all curtain wall height to 4m',
    'set all curtain wall mullion thickness to 0.08m',
    'set all curtain wall panel thickness to 0.05m',
    'set all slabs thickness to 0.15m',
    'set all slabs thickness to 0.25m',
    'set all slabs thickness to 0.2m',
    'set all slabs thickness to 0.3m',
    // §FIX-CHAT-HIDE-IS-NOT-NAVIGATE — the visibility family, drained to the
    // legacy handlers that actually hide.
    'isolate level 2',
    'hide level 2',
    'hide all walls',
    // §FIX-CHAT-PROPERTY-REMOVAL-IS-NOT-DELETE — a property ask must never
    // reach a destructive element delete.
    'remove the material from this wall',
];

/** SHADOWED and CORRECT — the ladder claims it and does the right thing, so the
 *  legacy pattern behind it is genuinely dead from chat. */
const SHADOWED_CORRECT: readonly string[] = [
    'add ceilings to all rooms',
    // §GATE-VIS-INTENT (VIS-CLASS, 2026-08-11) — the selection-isolate pill.
    // The ladder now resolves it to the `isolate-selection` capability
    // (visibility.isolate.selection → ViewVisibilityIntentStore, projected via
    // runtime.visibility.applyToScene), which is the intent path P7 asked for.
    // The legacy QueryEngine selection-isolate pattern behind it is dead FROM
    // CHAT; the level/category isolate patterns are untouched and still
    // served ("isolate level 2" and "isolate all doors" stay misses — pinned
    // in DRAINED and in the served-families test below).
    'isolate selected elements',
];

describe('§DRAIN — the legacy QueryEngine inventory, pinned', () => {
    it('every hand-written pill is classified — no phrasing is unaccounted for', () => {
        const claimed = treeQueries.filter((q) => claimedBy(q) !== null);
        expect([...claimed].sort()).toEqual([...MISREAD, ...SHADOWED_CORRECT].sort());
    });

    it('the MISREAD list is exactly the live defect set — fixing one fails here', () => {
        for (const q of MISREAD) {
            expect(claimedBy(q), `"${q}" is no longer misread — move it out of MISREAD`).not.toBeNull();
        }
    });

    it('every DRAINED phrasing stays an honest miss — re-claiming one fails here', () => {
        for (const q of DRAINED) {
            expect(
                claimedBy(q),
                `"${q}" is claimed again — it was a fixed misread, and this is the regression`,
            ).toBeNull();
        }
    });

    it('what remains SERVED by the legacy path is read-only questions, views/sheets/IFC, visibility and the wardrobe configurator', () => {
        const served = treeQueries.filter((q) => claimedBy(q) === null);
        // The four families that survive the drain, each for a stated reason:
        //  1. READ-ONLY questions — "how many elements", "what levels exist",
        //     "summarise the model". No capability answers a question, because
        //     the whole registry is built around commands that MUTATE and
        //     refuse honestly. Migrating them needs a read-only capability
        //     class (a query verb with no bus command), which is a design step,
        //     not a transcription.
        //  2. VISIBILITY / selection — hide / isolate / highlight / select by
        //     level, category, type and height. P7 says visibility INTENT is a
        //     domain concept in `packages/visibility`, not UI state, so these
        //     belong to a visibility capability family that does not exist yet.
        //  3. DOCUMENT surfaces — views, sheets, schedules, IFC import/export,
        //     compliance audits, parameter CSV. These drive stores the chat
        //     registry does not cover at all (CHAT_UNAVAILABLE's B/C classes).
        //  4. The WARDROBE configurator — the one genuinely bespoke flow, with
        //     its own multi-clause parser inside QueryEngine.
        expect(served.length).toBeGreaterThan(60);
        expect(served).toContain('How many elements are in the model?');
        expect(served).toContain('hide all walls');
        expect(served).toContain('export model to ifc');
        expect(served).toContain('modify the existing wardrobe');
        // None of them is a capability the registry claims to own.
        const ids = new Set(allChatCapabilities().map((c) => c.id));
        for (const q of served) expect(ids.has(q)).toBe(false);
    });
});

describe('§DRAIN — the panel now advertises the REGISTRY, not a transcription', () => {
    it('the generated hub carries one leaf per capability that declares an example', () => {
        const node = chatCapabilityNode();
        const expected = allChatCapabilities().filter((c) => c.examples.length > 0);
        expect(node.children).toHaveLength(expected.length);
        expect(expected.length).toBeGreaterThan(30);
    });

    it('every generated leaf sends the capability\'s OWN declared example', () => {
        const byQuery = new Set((chatCapabilityNode().children ?? []).map((c) => c.query));
        for (const cap of allChatCapabilities()) {
            if (cap.examples.length === 0) continue;
            expect(byQuery.has(cap.examples[0]), `${cap.id}'s first example is not offered`).toBe(true);
        }
    });

    it('a destructive capability says so on its pill, before it is clicked', () => {
        const destructive = allChatCapabilities().filter((c) => c.destructive && c.examples.length > 0);
        const leaves = chatCapabilityNode().children ?? [];
        for (const cap of destructive) {
            const leaf = leaves.find((l) => l.query === cap.examples[0]);
            expect(leaf?.hint, `${cap.id} does not warn that it asks first`).toContain('asks first');
        }
    });
});
