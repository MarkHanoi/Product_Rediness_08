// §GEN-FACADE-INTENT (L-10773) — the façade vocabulary table.
//
// The chat-path reachability proofs live in `capability-acceptance.test.ts` (sentence
// → bus payload). THESE lock the table's own behaviour: the two halves it must always
// return, the negation, and the colour bug that this feature shipped with for one
// iteration and that the acceptance suite caught.

import { describe, it, expect } from 'vitest';
import { parseFacadeIntent, facadeUnavailableSentence, FACADE_UNAVAILABLE } from '../src/intents/FacadeIntent.js';

describe('§GEN-FACADE-INTENT — what it CAN map', () => {
    it('an arcaded ground floor maps to the commercial shopfront field', () => {
        for (const s of [
            'an arcaded ground floor',
            'with shopfronts at street level',
            'ground floor retail',
            'a colonnade along the street',
        ]) {
            expect(parseFacadeIntent(s).intent.groundCommercialCurtain).toBe(true);
        }
    });

    it('a roof garden maps, by several names', () => {
        for (const s of ['with a roof garden', 'add a roof terrace', 'a green roof']) {
            expect(parseFacadeIntent(s).intent.roofGarden).toBe(true);
        }
    });

    it('balcony NEGATION is not swallowed by the noun it contains', () => {
        // "without balconies" contains "balconies"; a naive single alternation
        // would set balconies:true here. Negation is tested FIRST for that reason.
        expect(parseFacadeIntent('without balconies').intent.balconies).toBe(false);
        expect(parseFacadeIntent('no balconies please').intent.balconies).toBe(false);
        expect(parseFacadeIntent('with deep continuous balconies').intent.balconies).toBe(true);
    });

    it('⭐ colour resolves on BOTH sides of the noun — the regression this shipped with', () => {
        // English puts the colour either side and both are the same ask. The first
        // implementation handled only "façade in green" and silently dropped
        // "green façade", which is how a user's explicit instruction disappears.
        const before = parseFacadeIntent('create a residential building with a green facade');
        const after = parseFacadeIntent('create a residential building, facade in green');
        expect(before.intent.facadeColor).toBeDefined();
        expect(after.intent.facadeColor).toBe(before.intent.facadeColor);
    });

    it('⭐ a generic noun cannot anchor a colour — "residential building" is not a colour', () => {
        // `building` / `block` / `walls` were briefly colour anchors and broke the
        // feature outright: they appear in EVERY generation sentence, so the earliest
        // match won and the real colour was never reached. An anchor that matches
        // everywhere identifies nothing.
        expect(parseFacadeIntent('create a 5-storey residential building').intent.facadeColor).toBeUndefined();
        // …and with a real colour present it still resolves THAT.
        expect(
            parseFacadeIntent('create a 5-storey residential building with a green facade').intent.facadeColor,
        ).toBeDefined();
    });

    it('an explicit hex is honoured without the colour table', () => {
        expect(parseFacadeIntent('facade colour #4a7c2f').intent.facadeColor).toBe('#4a7c2f');
    });

    it('a sentence describing nothing yields an EMPTY intent — open language costs nothing', () => {
        const r = parseFacadeIntent('generate a 5-storey residential building');
        expect(Object.keys(r.intent)).toHaveLength(0);
        expect(r.applied).toHaveLength(0);
        expect(r.unavailable).toHaveLength(0);
    });
});

describe('§GEN-FACADE-INTENT — what it CANNOT map, it SAYS it cannot map', () => {
    it("the founder's photograph: every unmappable feature is named with a reason", () => {
        const r = parseFacadeIntent(
            'a 5-storey block with an arcaded ground floor, rounded corners, deep balconies, ' +
                'green glazed tile, timber shutters and a glass-block stair core',
        );
        // It still maps what it can…
        expect(r.intent.groundCommercialCurtain).toBe(true);
        expect(r.intent.balconies).toBe(true);
        // …and names all four things it cannot, each carrying its reason.
        expect(r.unavailable).toHaveLength(4);
        expect(r.unavailable.join(' | ')).toContain('rounded corners');
        expect(r.unavailable.join(' | ')).toContain('glazed-tile');
        expect(r.unavailable.join(' | ')).toContain('shutters');
        expect(r.unavailable.join(' | ')).toContain('glass-block');
    });

    it('every unavailable row states a REASON, not just a refusal', () => {
        // A row that only said "no" would teach the user nothing about the tool.
        for (const row of FACADE_UNAVAILABLE) {
            expect(row.say).toContain('—');
            expect(row.say.length).toBeGreaterThan(30);
        }
    });

    it('the pre-Confirm sentence counts the parts and promises the rest is built', () => {
        const s = facadeUnavailableSentence(['a — b', 'c — d', 'e — f']);
        expect(s).toContain('3 parts');
        expect(s).toContain("I'll build the rest");
        // Nothing to say when everything mapped.
        expect(facadeUnavailableSentence([])).toBe('');
    });
});
