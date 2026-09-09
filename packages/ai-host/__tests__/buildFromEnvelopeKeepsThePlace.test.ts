// §BUILD-FROM-ENVELOPE-KEEPS-THE-PLACE (L-13303, 2026-09-09)
// ═══════════════════════════════════════════════════════════════════════════
//
// THE DOMINANT DEFECT OF THIS REPOSITORY, CAUGHT IN THE ACT: one rule, two
// implementations, and the fix landed in the copy nobody was looking at.
//
// L-13301 removed a silent scope-widening from `parseWindowsParametricIntent`:
// it read the trailing place phrase, kept it only if it was a LEVEL, and threw
// the rest away, so "create windows on all walls IN THE KITCHEN" created
// windows in every wall of every building. `parseBuildFromEnvelopeIntent`
// carried the SAME four lines. Measured before this change:
//
//   "create walls and slabs from my envelope in block b"
//        → { parts: [walls, floor-plate] }        ← "in block b" GONE
//   "create walls and slabs from my envelope in the kitchen"
//        → { parts: [walls, floor-plate] }        ← "in the kitchen" GONE
//
// …and the pass then built the whole active storey. That is worse here than it
// was for windows, for two reasons. It is the verb the founder's master-planning
// question is ABOUT — *"it should create windows in all walls on all the
// envelopes of all houses on the parcel"* begins with building those houses —
// and a mistaken build is the most expensive thing in this product to undo by
// hand.
//
// ⛔ THE HARD PART IS NOT THE REFUSAL, IT IS THE ANCHORS. This capability's own
// documented openers are place-shaped: the panel button reads "Create BIM from
// this design", so users type "create walls IN MY DESIGN" and "…IN THE
// ENVELOPE". A naive "a room phrase ⇒ decline" kills the capability's primary
// sentences. They are handled by the SHARED `isNotAPlace` predicate — the same
// one the window grammar and the wall-finish grammar use — because they name the
// DEFAULT TARGET, not a different one. The first describe block is therefore the
// regression guard, and it is the whole safety of this change.

import { describe, it, expect } from 'vitest';
import {
    resolveUtterance,
    type ResolverContext,
    type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';
import { resolveCompoundUtterance } from '../src/intents/SemanticPlan.js';
import { parseBuildFromEnvelopeIntent } from '../src/intents/BuildFromEnvelope.js';

const LEVELS = [
    { id: 'L0', name: 'Level 0', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
];
const ROOMS = [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001', levelId: 'L0' }];

function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
    return {
        selection: [],
        levels: LEVELS,
        activeLevelId: 'L0',
        rooms: ROOMS,
        mintId: () => 'bfe-1',
        resolveScope: () => ({ ids: [], kindCounts: {}, skipped: [], diagnostics: [] }),
        ...overrides,
    } as ResolverContext;
}

/** The real ladder, in the bridge's order. */
function resolveFull(utterance: string, ctx: ResolverContext): ZeroTokenResolution {
    const plan = resolveCompoundUtterance(utterance, ctx);
    if (plan !== null) return plan;
    const tier01 = resolveUtterance(utterance, ctx);
    if (tier01.kind !== 'miss') return tier01;
    const nl = resolveNaturalLanguage(utterance, ctx);
    if (nl.kind === 'resolved') return nl.resolution;
    return { kind: 'miss' };
}

function dispatched(r: ZeroTokenResolution): readonly string[] {
    return r.kind === 'commands' ? r.commands.map((c) => c.type) : [];
}

// ─────────────────────────────────────────────────────────────────────────────

describe('⛔ REGRESSION GUARD — the anchor sentences are place-shaped and must still build', () => {
    const STILL_BUILDS = [
        'create walls and slabs from my envelope',
        'create walls in my design',
        'create walls and slabs from this design',
        'make it real',
    ];

    for (const utterance of STILL_BUILDS) {
        it(`"${utterance}" still dispatches the build`, () => {
            const r = resolveFull(utterance, ctxOf());
            expect(r.kind, `resolved as ${r.kind}`).toBe('commands');
            expect(dispatched(r)).toContain('generation.from-envelope');
        });
    }

    it('a LEVEL is still read and carried, not treated as an unscopable place', () => {
        const si = parseBuildFromEnvelopeIntent('create walls and slabs from my envelope on level 1', ctxOf());
        expect(si).not.toBeNull();
        expect(si && 'levelQuery' in si ? si.levelQuery : undefined).toBe('1');
        expect(si && 'unscopablePlace' in si ? si.unscopablePlace : undefined).toBeUndefined();
    });
});

describe('⛔ THE SILENT DROP — a place this pass cannot honour STOPS the build', () => {
    it('"in block b" refuses, names the missing BUILDING axis, and creates nothing', () => {
        const r = resolveFull('create walls and slabs from my envelope in block b', ctxOf());
        expect(r.kind, `resolved as ${r.kind}`).toBe('refusal');
        if (r.kind !== 'refusal') return;
        // ⭐ THE FOUNDER'S QUESTION, ANSWERED IN THE VERB HE ASKED IT ABOUT.
        expect(r.reason).toContain('block b');
        expect(r.reason).toContain('cannot scope a request to one building on a parcel yet');
        // C114-style honesty: say that nothing happened.
        expect(r.reason).toContain('Nothing has been created');
        // ⛔ AND NO COMMAND. This is the assertion that actually protects the
        // model — the copy could be perfect and still have built the storey.
        expect(dispatched(r)).toHaveLength(0);
    });

    it('"in the kitchen" refuses as a ROOM, without borrowing the building sentence', () => {
        const r = resolveFull('create walls and slabs from my envelope in the kitchen', ctxOf());
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') return;
        expect(r.reason).toContain('kitchen');
        expect(r.reason).toContain('takes a level, not a room or a facade');
        expect(r.reason).not.toContain('building on a parcel');
        expect(dispatched(r)).toHaveLength(0);
    });

    it('"on the south facade" refuses, and quotes the place WITHOUT its preposition', () => {
        const r = resolveFull('create walls and slabs from my envelope on the south facade', ctxOf());
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') return;
        expect(r.reason).toContain('"the south facade"');
        expect(r.reason).not.toContain('"on the south facade"');
        expect(dispatched(r)).toHaveLength(0);
    });

    it('the refusal offers sentences that DO work', () => {
        const r = resolveFull('create walls and slabs from my envelope in block b', ctxOf());
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') return;
        // [[refusing-half-needs-its-escape-hatch]] — a "no" with nothing to type
        // next is a regression with a citation attached. And an example that does
        // not work is a lie shipped in the UI (C68 §6.3-G2), so they are DRIVEN.
        expect(r.suggestions.length).toBeGreaterThan(0);
        for (const s of r.suggestions) {
            const again = resolveFull(s, ctxOf());
            expect(again.kind, `suggestion "${s}" resolved as ${again.kind}`).toBe('commands');
            expect(dispatched(again)).toContain('generation.from-envelope');
        }
    });
});

describe('ONE answer about the missing building axis', () => {
    it('this verb and the scoped families use the SAME absent-axis wording', () => {
        // ⭐ Not a style point. Two sentences about the missing building axis are
        // two answers to one question, and the next person to change one would
        // leave the other behind — which is precisely the defect this file is
        // named for. `applyBuildFromEnvelope` reads `absentAxisFor`, the same
        // table `unmatchedQualifierTail` reads.
        const r = resolveFull('create walls and slabs from my envelope in block b', ctxOf());
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') return;
        expect(r.reason).toContain(
            'PRYZM cannot scope a request to one building on a parcel yet — walls, '
            + 'windows and slabs are stored per project, not per block',
        );
    });
});
