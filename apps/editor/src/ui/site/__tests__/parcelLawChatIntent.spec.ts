// §PL-CHAT — the PURE half: what a sentence resolves to, and what it deliberately does NOT.
//
// STR §25.4. These cases pin the three states this repo keeps collapsing into one:
//   · RECOGNISED           → an intent carrying the string a FIELD takes;
//   · RECOGNISED-UNDERSPEC → a clarify question. ⛔ Never a default value;
//   · UNRECOGNISED         → a MISS, which is a HAND-OFF to the shipped ladder, never a refusal.
// Plus the fourth thing a chat surface must never do: stay silent about a clause it heard.

import { describe, it, expect } from 'vitest';
import {
    HEARD_NOT_DRIVEN_TEXT,
    PARCEL_LAW_CHAT_EXAMPLES,
    normaliseUtterance,
    parseLooseNumber,
    resolveParcelLawUtterance,
} from '../parcelLawChatIntent';

describe('parseLooseNumber — a thousands separator is not a decimal point', () => {
    it('reads 1,200 as one thousand two hundred and 1,2 as one point two', () => {
        // ⛔ THE DEFECT THIS FORBIDS: reading "1,200 m²" as 1.2 m² would make the control refuse a
        // legal ask with a real-looking number — a wrong answer wearing a citation.
        expect(parseLooseNumber('1,200')).toBe(1200);
        expect(parseLooseNumber('1,2')).toBe(1.2);
        expect(parseLooseNumber('1200.5')).toBe(1200.5);
        expect(parseLooseNumber('12,345,678')).toBe(12345678);
        expect(parseLooseNumber('abc')).toBeNull();
        expect(parseLooseNumber('')).toBeNull();
    });
});

describe('normaliseUtterance — m² and m2 are one token', () => {
    it('folds the superscript, the typographic dashes and the quotes', () => {
        expect(normaliseUtterance('180 M²  on the GROUND–floor')).toBe('180 m2 on the ground-floor');
    });
});

describe('resolveParcelLawUtterance — the ground-floor area (STR §25.2)', () => {
    it('carries the number as the STRING the field takes', () => {
        const r = resolveParcelLawUtterance('I want 180 sqm on the ground floor');
        expect(r.kind).toBe('act');
        expect(r.intents).toEqual([{ kind: 'set-ground-area', areaM2: 180, areaText: '180' }]);
    });

    it('reads the founder’s own phrasing — "maximum implantation area in ground is 200 sqm"', () => {
        const r = resolveParcelLawUtterance('the maximum implantation area in ground is 200 sqm');
        expect(r.intents[0]).toEqual({ kind: 'set-ground-area', areaM2: 200, areaText: '200' });
    });

    it('ASKS when the ground floor is named with no number — it never defaults one', () => {
        const r = resolveParcelLawUtterance('set the ground floor area');
        expect(r.kind).toBe('clarify');
        expect(r.intents).toEqual([]);
        expect(r.question).toContain('How many m²');
    });
});

describe('resolveParcelLawUtterance — the create (STR §25.2/§25.6)', () => {
    it('resolves a storey count to the string the storeys field takes', () => {
        expect(resolveParcelLawUtterance('create a 3 storey envelope').intents)
            .toEqual([{ kind: 'create-envelope', storeys: 3, storeysText: '3' }]);
        expect(resolveParcelLawUtterance('extrude it over 4 floors').intents)
            .toEqual([{ kind: 'create-envelope', storeys: 4, storeysText: '4' }]);
        expect(resolveParcelLawUtterance('2 levels').intents)
            .toEqual([{ kind: 'create-envelope', storeys: 2, storeysText: '2' }]);
    });

    it('ASKS how many levels rather than assuming one', () => {
        const r = resolveParcelLawUtterance('create the envelope');
        expect(r.kind).toBe('clarify');
        expect(r.question).toContain('How many floor levels');
    });

    it('⛔ does NOT read a QUESTION about a floor as an instruction to build one', () => {
        // The single most dangerous mis-order a chat surface can have: a question becoming a
        // mutation. `how much can I build on the first floor?` must ANSWER, never create.
        const r = resolveParcelLawUtterance('how much can I build on the first floor?');
        expect(r.kind).toBe('act');
        expect(r.intents).toEqual([{ kind: 'ask', topic: 'remaining' }]);
    });
});

describe('resolveParcelLawUtterance — the cost rate (STR §25.7)', () => {
    it('takes the number and the NAMED currency, and never infers one', () => {
        expect(resolveParcelLawUtterance('cost 1800 eur per m2').intents)
            .toEqual([{ kind: 'set-rate', amountPerM2: 1800, rateText: '1800', currency: 'EUR' }]);
        // No currency named ⇒ `null`, so the control keeps whatever the select already shows.
        expect(resolveParcelLawUtterance('set the rate to 1500').intents)
            .toEqual([{ kind: 'set-rate', amountPerM2: 1500, rateText: '1500', currency: null }]);
    });

    it('clears the rate on an explicit unset', () => {
        expect(resolveParcelLawUtterance('clear the cost rate').intents)
            .toEqual([{ kind: 'clear-rate' }]);
    });
});

describe('resolveParcelLawUtterance — the compound instruction the founder actually wrote', () => {
    it('splits "180 sqm brut in ground floor – ideally L shape – south facing" into TWO acts and ONE admission', () => {
        // STR §25.3's worked instruction, verbatim in shape. Two of the three clauses are driven;
        // the third is HEARD AND NAMED, because silence about it would read as compliance.
        const r = resolveParcelLawUtterance(
            'I want initially as a value attribute 180 sqm brut in ground floor - ideally L shape - south facing oriented');
        expect(r.kind).toBe('act');
        expect(r.intents).toEqual([
            { kind: 'set-ground-area', areaM2: 180, areaText: '180' },
            { kind: 'pick-shape', shape: 'ell' },
        ]);
        expect(r.heardNotDriven).toContain('orientation');
        expect(HEARD_NOT_DRIVEN_TEXT.orientation).toContain('does not yet solve a shape TO an orientation');
    });

    it('orders the area BEFORE the shape, because the shapes are solved against the area', () => {
        const r = resolveParcelLawUtterance('L shape with 200 m2 on the ground floor');
        expect(r.intents.map((i) => i.kind)).toEqual(['set-ground-area', 'pick-shape']);
    });

    it('picks NO shape when two shapes are named — that is a comparison, not two instructions', () => {
        const r = resolveParcelLawUtterance('should I use an L shape or a U shape?');
        expect(r.intents.some((i) => i.kind === 'pick-shape')).toBe(false);
    });

    it('maps the four shipped shape families and no others', () => {
        expect(resolveParcelLawUtterance('u shape').intents).toEqual([{ kind: 'pick-shape', shape: 'u-court' }]);
        expect(resolveParcelLawUtterance('make it a single bar').intents)
            .toEqual([{ kind: 'pick-shape', shape: 'bar-i' }]);
        expect(resolveParcelLawUtterance('non-orthogonal l').intents)
            .toEqual([{ kind: 'pick-shape', shape: 'ell-non-orthogonal' }]);
    });
});

describe('resolveParcelLawUtterance — a miss is a HAND-OFF, not a refusal', () => {
    it('misses anything the panel does not drive, so the shipped ladder gets it', () => {
        // These are real PRYZM asks the general zero-token ladder DOES answer. This surface must
        // stand aside for them rather than refuse — narrowing the vocabulary is the one thing the
        // founder's RAC doctrine forbids outright.
        for (const q of [
            'make all the walls 3 metres tall',
            'hide the selection',
            'duplicate level 0 to level 1',
            'undo',
        ]) {
            expect(resolveParcelLawUtterance(q).kind, q).toBe('miss');
        }
    });

    it('misses an empty or subject-less utterance rather than answering it with the fact card', () => {
        expect(resolveParcelLawUtterance('').kind).toBe('miss');
        expect(resolveParcelLawUtterance('   ').kind).toBe('miss');
        expect(resolveParcelLawUtterance('what?').kind).toBe('miss');
    });

    it('still NAMES a heard-not-driven topic on a miss', () => {
        const r = resolveParcelLawUtterance('put the parking underground');
        expect(r.kind).toBe('miss');
        expect(r.heardNotDriven).toContain('parking');
    });
});

describe('resolveParcelLawUtterance — totality', () => {
    it('never throws, for any input, including hostile ones', () => {
        for (const q of [
            '<script>alert(1)</script>', ' ', '1'.repeat(5000), '....,,,,', 'm² m² m²',
            'create create create 999999999 storeys', String.fromCharCode(0xd800),
        ]) {
            expect(() => resolveParcelLawUtterance(q)).not.toThrow();
        }
    });

    it('publishes the example list the refusal renders, so help and parser cannot drift', () => {
        expect(PARCEL_LAW_CHAT_EXAMPLES.length).toBeGreaterThan(0);
        // Every published example must actually resolve to something — an example that misses
        // would be the surface advertising a capability it does not have.
        for (const ex of PARCEL_LAW_CHAT_EXAMPLES) {
            expect(resolveParcelLawUtterance(ex).kind, ex).not.toBe('miss');
        }
    });
});
