// L-601 (a) — THE ANSWERABILITY CLASSIFIER.
//
// WHAT THESE TESTS GUARD (L-601 §task-3, restated): they assert the DERIVATION, not the values.
// The whole risk of a colour layer over land is the §CONTEXT-DATA-HONESTY collapse — a correct
// legal refusal and an owned coverage gap painted the same colour, telling a developer the law
// forbids building on a buildable plot. So the tests below assert:
//   1. the class is a PROJECTION of the shipping answer path (`resolveZoneDisposition` + the
//      refusal vocabulary), so registering a pack re-classes a zone with no edit to the classifier;
//   2. the legal classes (`systems-land`, `plan-defined`) and the coverage class (`zone-unencoded`)
//      never collapse — they track the SAME `legallyGrounded` flag the registry sets;
//   3. the code→class map is EXHAUSTIVE over the L0 refusal-code enum, so a new code cannot fall
//      silently into a neighbour's bucket.
// A test that hard-coded expected classes against clau literals would pass while measuring nothing
// (the debt-gate lesson) — each test here first pins the shipping precondition it depends on.

import { describe, it, expect } from 'vitest';
import { EnvelopeRefusalCodeSchema, type EnvelopeRefusalCode } from '@pryzm/schemas';
import {
    resolveZoneDisposition,
    registeredPackZoneCodes,
    BCN_JURISDICTION_ID,
    type ZoneDisposition,
} from '../src/rulepacks/registry.js';
import {
    classifyAnswerability,
    classifyDisposition,
    classifyRefusalCode,
    ANSWERABILITY_CLASSES,
    type AnswerabilityClass,
} from '../src/rulepacks/answerabilityClass.js';

describe('L-601 (a) — the answerability classifier is a PROJECTION of the answer path', () => {
    it('every clau a pack is registered for classifies as `full-envelope`, read LIVE from the registry', () => {
        // The list is the registry's OWN packed-code list, not a literal — so registering the next
        // clau is covered here automatically, and a class that stopped tracking the pack would fail.
        const packed = registeredPackZoneCodes(BCN_JURISDICTION_ID);
        expect(packed.length).toBeGreaterThan(0); // the test is vacuous if nothing is registered
        for (const clau of packed) {
            // Precondition: the shipping path really does answer `pack` for this clau…
            expect(resolveZoneDisposition(BCN_JURISDICTION_ID, clau).kind, clau).toBe('pack');
            // …and the classifier projects that to `full-envelope`.
            expect(classifyAnswerability(BCN_JURISDICTION_ID, clau), clau).toBe('full-envelope');
        }
    });

    it('§task-3 — clau 22a classifies as `zone-unencoded` BECAUSE the registry does not list it', () => {
        // The load-bearing derivation test. First prove the precondition the class depends on:
        // 22a is NOT a registered pack (so it is not `full-envelope`), and the shipping path
        // answers it as a coverage-gap refusal about PRYZM, never a legal one.
        expect(registeredPackZoneCodes(BCN_JURISDICTION_ID)).not.toContain('22a');
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '22a');
        expect(d.kind).toBe('refusal');
        if (d.kind === 'refusal') {
            expect(d.refusal.legallyGrounded, 'a coverage gap must never wear the legal chip').toBe(false);
        }
        // The class follows from that disposition.
        expect(classifyAnswerability(BCN_JURISDICTION_ID, '22a')).toBe('zone-unencoded');

        // ⚠ THE RE-CLASSIFICATION GUARANTEE, proved through the mechanism rather than asserted about
        // it: the ONLY thing that would flip 22a's class is the registry returning `kind: 'pack'`,
        // and `classifyDisposition` maps exactly that to `full-envelope`. So the day 22a is
        // registered, its colour changes with zero edit to the classifier — no second source of
        // truth exists to forget to update (L-601 §task-2). We build the "22a is now packed"
        // disposition by taking a REAL registered pack and re-labelling its zoneCode, rather than
        // fabricating a fake contract — the classifier keys only on `kind`, but the object stays a
        // valid `ZoneDisposition`.
        const firstPacked = registeredPackZoneCodes(BCN_JURISDICTION_ID)[0];
        expect(firstPacked, 'the registry must have at least one pack for this test').toBeTruthy();
        const realPackDisp = resolveZoneDisposition(BCN_JURISDICTION_ID, firstPacked!);
        expect(realPackDisp.kind).toBe('pack');
        if (realPackDisp.kind === 'pack') {
            const asIfRegistered: ZoneDisposition = { ...realPackDisp, zoneCode: '22a' };
            expect(classifyDisposition(asIfRegistered)).toBe('full-envelope');
        }
    });
});

describe('L-601 (a) — legal refusals and coverage gaps NEVER share a class (C58 §1.4)', () => {
    // Each row pins BOTH halves: the shipping refusal code the registry actually returns, and the
    // class the classifier projects it to. If the refusal vocabulary re-codes a clau, the code
    // assertion breaks first and forces a conscious re-look — the class tracks the answer path.
    const legalCases: ReadonlyArray<readonly [clau: string, code: EnvelopeRefusalCode, cls: AnswerabilityClass]> = [
        ['6a', 'public-open-space', 'systems-land'],
        ['7a', 'facility-plan', 'systems-land'],
        ['27', 'protected-soil', 'systems-land'],
        ['1a', 'public-system', 'systems-land'],
        ['8a', 'protected-private-green', 'systems-land'],
        ['18', 'derived-plan', 'plan-defined'],
        ['15', 'derived-plan', 'plan-defined'],
        // §DEC-1 (founder, 2026-08-01) — `22@` MOVED HERE from the coverage-gap row below, and the
        // move is the whole point of the decision: MPGM 22@ Art. 8.1 states a by-right envelope but
        // states NO buildable depth, deliberately, because 22@ fixes its geometry site by site in
        // the Pla de Millora Urbana. That is `derived-plan` — the rule is elsewhere — not "PRYZM
        // has not encoded this zone". Same class as clau 18, and for the same reason.
        ['22@', 'derived-plan', 'plan-defined'],
    ];

    it('the LEGAL claus classify as `systems-land` / `plan-defined`, and are legally grounded', () => {
        for (const [clau, code, cls] of legalCases) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind, clau).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            // The shipping path says this — the class is not allowed to disagree with it.
            expect(d.refusal.code, clau).toBe(code);
            expect(d.refusal.legallyGrounded, clau).toBe(true);
            expect(classifyAnswerability(BCN_JURISDICTION_ID, clau), clau).toBe(cls);
        }
    });

    it('a COVERAGE gap (`zone-unencoded`) is never one of the legal classes', () => {
        // 12b / bare 20a are buildable claus with no pack: the registry refuses them as a
        // coverage gap. They must classify to `zone-unencoded`, never to `systems-land` /
        // `plan-defined` — the false-negative-about-someone's-land error L-553 ranks worst.
        // ⚠ §DEC-1 — `22@` LEFT this list on 2026-08-01 and is now asserted in the LEGAL row above.
        // That is not a relaxation of this invariant: 22@ stopped being a coverage gap because the
        // ordinance's own answer was established, which is the only honest way out of this bucket.
        for (const clau of ['12b', '20a']) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind, clau).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            expect(d.refusal.legallyGrounded, clau).toBe(false);
            const cls = classifyAnswerability(BCN_JURISDICTION_ID, clau);
            expect(cls, clau).toBe('zone-unencoded');
            expect(['systems-land', 'plan-defined']).not.toContain(cls);
        }
    });

    it('an unknown jurisdiction / zone falls to `zone-unencoded`, never to a legal class', () => {
        // The estimated-fallback path. A plot outside every registered city is a coverage gap, not
        // a legal refusal — it must never be coloured as "the law grants no envelope".
        // ⚠ Uses a genuinely-UNREGISTERED id: Madrid (es-28079-madrid) is now registered as a
        // refusal jurisdiction (L-608), so it no longer answers `unregistered`.
        expect(resolveZoneDisposition('es-99999-unregistered', '13a').kind).toBe('unregistered');
        expect(classifyAnswerability('es-99999-unregistered', '13a')).toBe('zone-unencoded');
        expect(classifyAnswerability('', '')).toBe('zone-unencoded');
    });
});

describe('L-601 (a) — the code→class map is EXHAUSTIVE and total', () => {
    it('maps every refusal code in the L0 enum to a known class — no code is left unmapped', () => {
        // Iterates the SCHEMA's own enum, so adding a code there without a case in
        // `classifyRefusalCode` fails here (and, at compile time, via `assertNever`). This is the
        // guard that stops a new legal/coverage distinction falling silently into a neighbour.
        for (const code of EnvelopeRefusalCodeSchema.options) {
            const cls = classifyRefusalCode(code);
            expect(ANSWERABILITY_CLASSES, code).toContain(cls);
        }
    });

    it('classifies the transient construction failure as its own class', () => {
        // `source-data-unavailable` is neither legal denial nor coverage gap — it is the encoded
        // pack that could not complete for this parcel (§L-574). Its own colour, so a retry
        // affordance can hang off it and off nothing else.
        expect(classifyRefusalCode('source-data-unavailable')).toBe('construction-incomplete');
    });

    it('STRUCTURAL-SEAM-4 — a genuine data-absence is its OWN class, never the transient/coverage colour', () => {
        // `no-plan-at-point` (the source answered with no plan here) must not share a colour with the
        // transient `source-data-unavailable` (retryable) nor the `zone-unencoded` coverage gap.
        expect(classifyRefusalCode('no-plan-at-point')).toBe('no-plan-published');
        expect(classifyRefusalCode('no-plan-at-point')).not.toBe('construction-incomplete');
        expect(classifyRefusalCode('no-plan-at-point')).not.toBe('zone-unencoded');
    });

    it('groups the plan-delegating and overlay codes as `plan-defined`', () => {
        expect(classifyRefusalCode('derived-plan')).toBe('plan-defined');
        expect(classifyRefusalCode('overlay-uncertain')).toBe('plan-defined');
    });

    it('classifyDisposition and classifyAnswerability agree by construction', () => {
        // The convenience entry point is defined as classifyDisposition ∘ resolveZoneDisposition,
        // so there is a single resolution site. Assert they cannot diverge.
        for (const clau of ['13a', '6a', '18', '22a', '99z']) {
            const viaDisposition = classifyDisposition(resolveZoneDisposition(BCN_JURISDICTION_ID, clau));
            const viaConvenience = classifyAnswerability(BCN_JURISDICTION_ID, clau);
            expect(viaConvenience, clau).toBe(viaDisposition);
        }
    });

    it('exposes exactly the six classes, frozen', () => {
        expect([...ANSWERABILITY_CLASSES].sort()).toEqual(
            ['construction-incomplete', 'full-envelope', 'no-plan-published', 'plan-defined', 'systems-land', 'zone-unencoded'].sort(),
        );
        expect(Object.isFrozen(ANSWERABILITY_CLASSES)).toBe(true);
    });
});
