/**
 * §CARD-TRANSCRIPT-IS-PROJECT-STATE — C13 §3.10 / §4.
 *
 * The founder reported the site panel "absolutely in the wrong place" on a new project opened
 * after an old one. `clearLayoutProjectState()` is C13's NAMED owner for the GIS layout and is
 * thorough about geocode frame, placement caches and draw state — and reset NONE of the envelope
 * card's own transcript: seven `mountGISArea` closure slots written by user GESTURES on project
 * A's card (a typed target area and its verdict, an adopt result, a generated massing set and the
 * footprint it was solved for).
 *
 * ⛔ WHY NOTHING CAUGHT IT. The only writers of `null` were the card's Clear button and the
 * ≥0.5 m² staleness gate, and neither runs on a project switch. Worse, that staleness gate lives
 * on the FULL-determination arm, so a project-B parcel that REFUSES never reaches it — the arm a
 * founder with an unsolved plot actually lands on is precisely the arm that cannot self-heal.
 *
 * ⭐ AND THE PROBE COULD NOT SEE IT. `describeLayoutProjectState` / `layoutHoldsProjectState` are
 * the C13 probe this layout registers, and they enumerated neither slot — so the isolation audit
 * answered "✓ loaded clean" over a live leak. A probe blind to a surface cannot fail on it
 * (§GATE-BLIND-ON-THE-WRONG-AXIS: green ≠ right; the axis that keeps failing is MEMBERSHIP).
 *
 * ⚠ WHY THESE ARE SOURCE PINS. The seven slots are `let`s inside an 8,700-line closure that no
 * spec can mount — the same compromise `envelopeCardSections.spec` and `massingOptionModel.spec`
 * already make for the card's three render arms. The RATE half below is NOT a source pin where it
 * matters: the behaviour that distinguishes the right call from the wrong one is exercised for
 * real, because that is the half where picking the wrong function is silent.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';

import {
    getIndicativeRate,
    setIndicativeRate,
    subscribeIndicativeRate,
    resetIndicativeRateState,
} from '../indicativeRateState';

const GIS = readFileSync(resolve(__dirname, '../../layout/GISAreaLayout.ts'), 'utf8');

const DISPATCH = readFileSync(resolve(__dirname, '../siteDispatch.ts'), 'utf8');

/**
 * Source with block and line comments removed, so a pin tests CODE and never the prose beside it.
 *
 * ⚠ Deliberately crude — it is a comment stripper for an assertion, not a parser. It would mangle
 * a `//` inside a string literal, which is why it is only ever used on the two narrow call-symbol
 * pins below and never to reason about program structure.
 */
function code(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n');
}

/** The seven closure slots that make up the card's per-project transcript. */
const TRANSCRIPT = [
    'targetAreaStatement',
    'targetAreaRefused',
    'targetAreaTyped',
    'adoptStatement',
    'adoptFailed',
    'massingOptions',
    'massingOptionsForFootprintM2',
] as const;

/**
 * The body of a named arrow `const <name> = (…) => <body>` in the layout, by delimiter matching.
 *
 * ⛔ IT MATCHES `(` AS WELL AS `{`, AND THAT IS THE WHOLE POINT. This helper read only `{` at
 * first, and `layoutHoldsProjectState` is an EXPRESSION-BODIED arrow — `=> ( … )` — so the scan
 * ran past its body entirely and returned the next braced function in the file, which happened to
 * be `clearLayoutProjectState`. Every slot assertion then passed while measuring a DIFFERENT
 * FUNCTION, and deleting a real term from the probe left the suite green.
 *
 * ⭐ THE SCRAMBLE CONTROL IS WHAT FOUND IT (L-586) — the assertions themselves looked immaculate.
 * That is [[same-rule-two-implementations]] inside a test helper: the arm was green because it
 * was reading the copy that could not fail.
 */
function bodyOf(name: string): string {
    const start = GIS.indexOf(`const ${name} = `);
    expect(start, `${name} must exist`).toBeGreaterThan(-1);
    const arrow = GIS.indexOf('=>', start);
    expect(arrow, `${name} must be an arrow function`).toBeGreaterThan(-1);
    // Whichever delimiter opens the body FIRST is the one that closes it.
    const brace = GIS.indexOf('{', arrow);
    const paren = GIS.indexOf('(', arrow);
    const open = (paren !== -1 && paren < brace) ? paren : brace;
    const [OPEN, CLOSE] = GIS[open] === '(' ? ['(', ')'] : ['{', '}'];
    let depth = 0;
    for (let i = open; i < GIS.length; i += 1) {
        if (GIS[i] === OPEN) depth += 1;
        else if (GIS[i] === CLOSE) {
            depth -= 1;
            if (depth === 0) return GIS.slice(open, i + 1);
        }
    }
    throw new Error(`unbalanced ${OPEN}${CLOSE} reading ${name}`);
}

describe('§CARD-TRANSCRIPT-IS-PROJECT-STATE — the envelope card’s transcript is per-project', () => {
    it('⛔ C13 teardown CLEARS all seven slots — project A’s typed area and massing may not survive', () => {
        const clear = bodyOf('clearLayoutProjectState');
        // Assigned to a null/false in the teardown itself, not merely mentioned in a comment.
        expect(clear).toContain('targetAreaStatement = null;');
        expect(clear).toContain('targetAreaRefused = false;');
        expect(clear).toContain('targetAreaTyped = null;');
        expect(clear).toContain('adoptStatement = null;');
        expect(clear).toContain('adoptFailed = false;');
        expect(clear).toContain('massingOptions = null;');
        expect(clear).toContain('massingOptionsForFootprintM2 = null;');
    });

    it('⭐ the C13 PROBE can see all seven — a probe blind to a slot can never fail on it', () => {
        const describeBody = bodyOf('describeLayoutProjectState');
        const holdsBody = bodyOf('layoutHoldsProjectState');
        for (const slot of TRANSCRIPT) {
            expect(describeBody, `describeLayoutProjectState must report ${slot}`).toContain(slot);
            expect(holdsBody, `layoutHoldsProjectState must count ${slot}`).toContain(slot);
        }
    });

    it('CONTROL — `bodyOf` returns the function it was ASKED for, not the next one in the file', () => {
        // ⛔ THIS CONTROL EXISTS BECAUSE IT ALREADY CAUGHT A REAL FAILURE. `bodyOf` matched only
        // `{`, so for the expression-bodied `layoutHoldsProjectState` (`=> ( … )`) it skipped past
        // and returned `clearLayoutProjectState` instead — which contains all seven slot names, so
        // every assertion above passed against the WRONG FUNCTION. A length check alone did not
        // notice; IDENTITY is the axis that failed, so identity is what this control asserts.
        const clear = bodyOf('clearLayoutProjectState');
        const described = bodyOf('describeLayoutProjectState');
        const holds = bodyOf('layoutHoldsProjectState');

        // Each must be a strict slice, never the whole file.
        for (const [fn, body] of [['clear', clear], ['describe', described], ['holds', holds]] as const) {
            expect(body.length, `${fn} body`).toBeGreaterThan(40);
            expect(body.length, `${fn} body must not be the whole file`).toBeLessThan(GIS.length / 2);
        }
        // ⭐ AND THE THREE MUST BE THREE. Two identical readings mean one of them is a mis-read.
        expect(new Set([clear, described, holds]).size, 'three distinct bodies').toBe(3);

        // ⭐ EACH BODY MUST CARRY ITS OWN SIGNATURE SHAPE — the discriminator a name-only match
        // cannot fake. `holds` is a boolean OR-chain, `describe` is an object literal of reads,
        // `clear` is a sequence of assignments.
        expect(holds, 'holds is an OR-chain of null-checks').toContain('!== null ||');
        expect(holds, 'holds must NOT be the teardown').not.toContain('targetAreaStatement = null;');
        expect(clear, 'clear assigns').toContain('lastGeocodeFrame = null;');
        expect(clear, 'clear must NOT be the OR-chain').not.toContain('!== null ||');
        expect(described, 'describe reads into an object literal').toContain('hasMassingOptions:');
        expect(described, 'describe must NOT be the teardown').not.toContain('lastGeocodeFrame = null;');
    });
});

describe('§RATE-IS-PER-PROJECT — the €/m² assumption does not cross a project switch', () => {
    beforeEach(() => { resetIndicativeRateState(); });

    const RATE = {
        amountPerM2: 1800, currency: 'EUR', source: 'user-supplied' as const,
        setAtIso: '2026-09-09T00:00:00.000Z',
    };

    it('⛔ the teardown calls setIndicativeRate(null) and NOT resetIndicativeRateState()', () => {
        // The wiring pin. `resetIndicativeRateState` is the function NAMED for this job — its own
        // docstring says "C13 §4 — project teardown" — and calling it here is the defect, so the
        // pin asserts the wrong one is absent as loudly as it asserts the right one is present.
        //
        // ⚠ COMMENTS ARE STRIPPED FIRST, and that is not a convenience. The teardown's own header
        // EXPLAINS why `resetIndicativeRateState()` is the wrong call, so a naive `not.toContain`
        // fails on the prose that documents the fix — which would push the next author to delete
        // the explanation in order to get green. A pin must never make the honest comment the
        // cheapest thing to remove.
        expect(code(DISPATCH)).toContain('setIndicativeRate(null);');
        expect(code(DISPATCH)).not.toContain('resetIndicativeRateState(');
        // … and the reasoning IS still on the file, where the next reader meets it.
        expect(DISPATCH).toContain('resetIndicativeRateState');
    });

    it('⭐ THE REASON, EXERCISED — setIndicativeRate(null) clears the rate AND KEEPS subscribers', () => {
        const seen: (unknown)[] = [];
        const unsub = subscribeIndicativeRate((next) => { seen.push(next); });
        setIndicativeRate(RATE);
        expect(getIndicativeRate()).not.toBeNull();

        // The project switch.
        setIndicativeRate(null);
        expect(getIndicativeRate(), 'project B must not inherit project A’s rate').toBeNull();
        expect(seen, 'mounted controls must be told to repaint their no-rate arm').toEqual([RATE, null]);

        // ⭐ THE ARM THAT BINDS THE CHOICE OF FUNCTION. `parcelLawQuantities` subscribes ONCE at
        // mount; listener lifetime is per-MOUNT, not per-project. A teardown that dropped
        // subscribers would leave the cost control silent for the rest of the session — quieter
        // than the leak it fixes, and invisible to every assertion above.
        setIndicativeRate(RATE);
        expect(seen, 'the subscription must survive the switch').toEqual([RATE, null, RATE]);
        unsub();
    });

    it('CONTROL — resetIndicativeRateState() really does drop subscribers, which is why it is wrong here', () => {
        // Without this the arm above proves nothing: if BOTH functions kept listeners, the
        // distinction the teardown pin enforces would be imaginary.
        const seen: unknown[] = [];
        subscribeIndicativeRate((next) => { seen.push(next); });
        resetIndicativeRateState();
        setIndicativeRate(RATE);
        expect(seen, 'resetIndicativeRateState clears the listener set').toEqual([]);
    });
});
