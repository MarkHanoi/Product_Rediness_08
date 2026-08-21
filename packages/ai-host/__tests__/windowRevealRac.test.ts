// §FEAT-WINDOW-REVEAL-RAC (L-3202 … L-3204) — THE NUMBER, not just the route.
// =============================================================================
//
// ⚠ THE WARNING THIS FILE EXISTS TO ANSWER, from the lane that built the matrix
// gate: *"the gate proves a sentence reaches a command or an answer — NEVER that
// the number is right."* `check-property-rac-matrix` will report
// `window.revealSplayHead` as BOTH the moment a capability names the field; it
// would report exactly the same if the sentence "set the head splay to 20
// degrees" arrived at the command carrying **0.02**.
//
// And that is not a hypothetical failure mode, it is the single most likely one
// here. Every other member of `PROPERTY_VOCABULARY` is a LENGTH, and the
// resolver's shared conversion is `toMeters(raw, unit)`:
//
//   · `toMeters('20', undefined)`   → 20      (metres — right for a length)
//   · `toMeters('20', 'mm')`        → 0.02
//
// A splay of "20" is TWENTY DEGREES. Routed through the length conversion the
// bare form would have been right by coincidence and every suffixed form wrong,
// which is the worst possible distribution: it passes the first manual test and
// fails in the founder's hands. `PropertyEntry.measure` is what prevents it and
// `§B` below is what proves `measure` is actually consulted.
//
// §C then pins the halves the ASK depends on: that the read row and the write
// capability name the SAME field (a read pointed one character away answers
// honestly and uselessly for every window in the product — the roof-pitch
// defect), and that a question never mutates.

import { describe, expect, it } from 'vitest';
import {
  applySemanticIntent,
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import {
  PROPERTY_QUERY_ROWS,
  propertyQueryRow,
  queryableKinds,
} from '../src/intents/PropertyQuery.js';
import { resolveChatCapability } from '../src/capabilities/ChatCapabilityRegistry.js';

const winCtx = (readProperty?: ResolverContext['readProperty']): ResolverContext => ({
  selection: [{ elementId: 'win-1', elementType: 'window' }],
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  activeLevelId: 'L0',
  mintId: () => 'mint-1',
  ...(readProperty !== undefined ? { readProperty } : {}),
});

/** The parameters the utterance would dispatch, or null if it did not dispatch. */
function paramsOf(utterance: string): Record<string, unknown> | null {
  const r: ZeroTokenResolution = resolveUtterance(utterance, winCtx());
  if (r.kind !== 'commands') return null;
  const payload = r.commands[0]?.payload as Record<string, unknown> | undefined;
  const p = payload?.['parameters'];
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : null;
}

// ─── §A — the sentences reach the fields the panel writes ────────────────────

describe('§A — every reveal control the panel offers has a sentence', () => {
    it('the projection sentence carries revealProjection, in metres', () => {
        expect(paramsOf('set the reveal projection to 100mm')).toEqual({ revealProjection: 0.1 });
    });

    it('the projection is SIGNED — a recess is an ordinary ask, not a refusal', () => {
        // `WindowTypes.ts:71` states the sign convention on the field itself:
        // negative recesses the window into a deep-set reveal. A positivity gate
        // here would have refused half the detail this feature exists for.
        expect(paramsOf('change the reveal projection to -50mm')).toEqual({ revealProjection: -0.05 });
    });

    it('"splay all sides" writes all four sides in ONE command — one undo step', () => {
        const r = resolveUtterance('set the reveal splay to 15 degrees', winCtx());
        expect(r.kind).toBe('commands');
        if (r.kind !== 'commands') return;
        // ONE command, not four: the panel's own "Splay all sides" control is a
        // single dispatch for exactly this reason, and four commands would be
        // four undo steps for one user action.
        expect(r.commands).toHaveLength(1);
        expect(r.commands[0]!.payload).toMatchObject({
            parameters: {
                revealSplayHead: 15,
                revealSplaySill: 15,
                revealSplayJambLeft: 15,
                revealSplayJambRight: 15,
            },
        });
    });

    it('each side can be reached alone', () => {
        expect(paramsOf('set the head splay to 20 degrees')).toEqual({ revealSplayHead: 20 });
        expect(paramsOf('set the sill splay to 20 degrees')).toEqual({ revealSplaySill: 20 });
        expect(paramsOf('set the jamb splay to 20 degrees'))
            .toEqual({ revealSplayJambLeft: 20, revealSplayJambRight: 20 });
    });

    it('the specific noun beats the generic one — "head splay" is never "splay"', () => {
        // "splay" is a suffix of "head splay". Without specificity ordering the
        // generic row is TRIED first; the patterns are anchored so it could not
        // silently win, but it would turn a specific ask into a MISS — the very
        // silence this whole lane is closing.
        const p = paramsOf('set the head splay to 20 degrees');
        expect(p).not.toBeNull();
        expect(Object.keys(p!)).toEqual(['revealSplayHead']);
    });
});

// ─── §B — ⭐ THE UNIT. The assertion the matrix gate cannot make ─────────────

describe('§B — an angle arrives as DEGREES, never as metres', () => {
    it('⭐ a bare number is degrees', () => {
        expect(paramsOf('change the splay to 20')).toMatchObject({ revealSplayHead: 20 });
    });

    it('⭐ the ° suffix does not become a millimetre', () => {
        // THE ASSERTION THAT WOULD HAVE CAUGHT THE DEFECT. Routed through
        // `toMeters` this reads 12 with no unit → 12 metres of angle; and a
        // "20mm"-shaped phrasing would have become 0.02. The value here is the
        // one a human said.
        expect(paramsOf('set the splay angle to 12°')).toMatchObject({ revealSplayHead: 12 });
    });

    it('"degrees" spelled out is the same number', () => {
        expect(paramsOf('set the head splay to 20 degrees')).toEqual({ revealSplayHead: 20 });
        expect(paramsOf('change the reveal splay head to 20')).toEqual({ revealSplayHead: 20 });
    });

    it('ZERO is a legal splay — a square reveal is an ordinary ask back', () => {
        // `zeroValid`. The blanket `value <= 0` rule every length in this
        // vocabulary uses would refuse a user undoing their own splay by hand.
        expect(paramsOf('set the reveal splay to 0')).toMatchObject({ revealSplayHead: 0 });
    });

    it('a LENGTH in the same table is still converted as a length', () => {
        // The non-vacuity control for §B: `measure` must not have turned every
        // property into a raw number. 100mm is still 0.1 m.
        expect(paramsOf('set the reveal projection to 100mm')).toEqual({ revealProjection: 0.1 });
    });
});

// ─── §C — the ASK half ───────────────────────────────────────────────────────

describe('§C — the reveal is ASKABLE, and asks about the field the write writes', () => {
    const reads = (value: number): ResolverContext['readProperty'] =>
        () => ({ ok: true, value });

    it('⭐ every reveal row reads the SAME field its write capability sets', () => {
        // The roof-pitch defect, generalised. That row was drafted against the L0
        // Zod schema (`pitch`, radians) while the write lands `slope` (a
        // gradient) on the geometry record — an honest answer, for a field the
        // record does not have, on every roof in the product.
        //
        // Here the two are checked against each other by EXECUTING the write
        // capability's probe and reading the field names out of the payload it
        // really emits, so neither side can be transcribed.
        const revealRows = PROPERTY_QUERY_ROWS.filter((r) => r.field.startsWith('reveal'));
        expect(revealRows.length).toBe(5);

        for (const row of revealRows) {
            const cap = resolveChatCapability(row.capabilityId);
            expect(cap, `${row.id} mirrors an unregistered capability`).not.toBeNull();

            const applied = applySemanticIntent(cap!.probe, winCtx());
            expect(applied.kind, `${row.id}: the write probe did not dispatch`).toBe('commands');
            if (applied.kind !== 'commands') continue;

            const params = applied.commands[0]!.payload as { parameters?: Record<string, unknown> };
            expect(
                Object.keys(params.parameters ?? {}),
                `${row.id} reads "${row.field}", which ${row.capabilityId} does not write`,
            ).toContain(row.field);
        }
    });

    it('the rows inherit WINDOW from their write twin — never a hand-typed kind', () => {
        for (const row of PROPERTY_QUERY_ROWS.filter((r) => r.field.startsWith('reveal'))) {
            expect(queryableKinds(row), row.id).toEqual(['window']);
        }
    });

    it('an angle is spoken back in degrees, and a length in metres', () => {
        const head = applySemanticIntent(
            { intent: 'property-query', property: 'reveal-splay-head' } as never,
            winCtx(reads(20)),
        );
        expect(head.kind).toBe('local');
        if (head.kind === 'local') {
            expect(head.summary).toContain('20°');
            // …and NOT metres. The unit is per-row precisely so these two rows,
            // in one table, can disagree.
            expect(head.summary).not.toMatch(/\bm\b/);
        }

        const proj = applySemanticIntent(
            { intent: 'property-query', property: 'reveal-projection' } as never,
            winCtx(reads(0.1)),
        );
        expect(proj.kind).toBe('local');
        if (proj.kind === 'local') expect(proj.summary).toContain('0.1 m');
    });

    it('the splay rows are DEGREES on the record — no conversion on the way out', () => {
        // `WindowOpeningSchema` stores the splays in degrees, unlike `slope`.
        // Three storage conventions for an angle now live in one table, which is
        // why `unit` is declared per row rather than inferred from the type.
        for (const id of [
            'reveal-splay-head', 'reveal-splay-sill',
            'reveal-splay-jamb-left', 'reveal-splay-jamb-right',
        ]) {
            expect(propertyQueryRow(id)!.unit, id).toBe('degrees');
        }
        expect(propertyQueryRow('reveal-projection')!.unit).toBe('metres');
    });

    it('a question about a reveal NEVER dispatches a command', () => {
        for (const row of PROPERTY_QUERY_ROWS.filter((r) => r.field.startsWith('reveal'))) {
            const r = applySemanticIntent(
                { intent: 'property-query', property: row.id } as never,
                winCtx(reads(1)),
            );
            expect(r.kind, row.id).not.toBe('commands');
            if (r.kind === 'local') expect(r.action, row.id).toBe('answer');
        }
    });

    it('a non-window is refused BY NAME, and told what it can do instead', () => {
        const r = applySemanticIntent(
            { intent: 'property-query', property: 'reveal-splay-head' } as never,
            { ...winCtx(reads(1)), selection: [{ elementId: 'w-1', elementType: 'wall' }] },
        );
        expect(r.kind).toBe('refusal');
        if (r.kind === 'refusal') {
            expect(r.reason.toLowerCase()).toContain('wall');
            expect(r.reason).toContain('head splay');
        }
    });
});
