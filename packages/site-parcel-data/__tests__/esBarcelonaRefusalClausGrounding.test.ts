// Barcelona — the SIX "permanent, correct legal refusal" claus, TESTED rather than asserted.
//
// `15` `16` `17` (+ `17/6`) `14a` `14b` `8a` are ~3.58 % of Barcelona's private buildable land and
// have been recorded as permanent, correct legal refusals. That claim had never been checked
// against the primary text. It was, on 2026-07-31, article by article, from
// `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/PGM-NNUU-metropolitana.pdf`.
//
// ═══ THE VERDICT, IN ONE TABLE ════════════════════════════════════════════════════════════════
//
//   clau  delegating sentence                                             refusal code   correct?
//   ────  ───────────────────────────────────────────────────────────────  ─────────────  ────────
//   15    Art. 330.2 — conditions are "les establertes a l'ordenança del   derived-plan   YES
//         pla especial"                                                                   ⚠ but see below
//   16    Art. 360.1 — "s'elaboraran plans especials als quals s'elegirà   derived-plan   YES
//         el tipus d'ordenació"                                                           ⚠ but see below
//   17    Art. 368.1.a — the owner may improve "però no augmentar-ne el    derived-plan   ⚠ NO —
//         volum"                                                                          see below
//   14a   Art. 357.1 — "la edificabilitat serà la que s'estableixi als     derived-plan   YES
//         Plans de Reforma Interior"
//   14b   Art. 355.2 + 358.2.c — ordering is *volumetria específica*;      derived-plan   YES
//         height is derived from neighbouring frontages                                   ⚠ but see below
//   8a    Art. 345.1 — "L'edificabilitat es defineix en relació amb        protected-     YES
//         l'edificació actual existent"                                    private-green
//
// ═══ ⚠⚠ FOUR OF THE SIX STATE REAL PARAMETERS NOBODY TRANSCRIBED ══════════════════════════════
//
// The refusals are legally grounded — the ordinance really does hand the buildable determination
// to a derived instrument in five of the six cases. **But "delegates" and "states no numbers" are
// not the same claim**, and the second one is false for four of these claus:
//
//   • **15**  — Art. 330.**3**.4a states an INTERIM cap: *"La intensitat d'edificació de les
//               parcel·les sense edificar no pot depassar els 0,90 m² sostre/m² sòl"*, applying
//               *"mentre no es publiqui el Pla Especial"*. A stated, per-parcel FAR.
//   • **16**  — Art. 362 states FOUR indices (brut 0,70 · net mitjà 1,37 · per-ordering-type
//               1,50 / 1,00 / 2,20 / 1,20), Art. 363 a density (75 hab/ha), and Art. 365.2 a full
//               set of edificació conditions per ordering type — including *aïllada* at 9,15 m /
//               PB+2, 250 m² minimum parcel, **40 % occupation and 3 m / 2 m / 2 m separations**,
//               which is a complete `setback` rule.
//   • **14b** — Art. 357.2 states brut 0,90 · net 2,89 · complementari zonal 0,30, and the
//               Barcelona-only modification at PDF p. 152 raises the brut to **1,08** and redefines
//               the complementari as the difference to 1,2. Art. 358.2 adds parcel·lació mínima
//               600 m² and façana mínima 13,50 m.
//   • **8a**  — Art. 345.3 states a formula (≤ 500 m² sostre per each 2 500 m² of excess over
//               3 000 m²) and Art. 347.2.e states **alçada màxima 9 m, 6 m from the street and 4 m
//               from the boundaries** for new-build under a Pla Especial.
//
// **None of that makes the refusals wrong**, and none of it is registered here — every one of the
// figures is gated (on a Pla Especial, on an ordering type the plan chooses, on a new planning
// instrument, on the plot exceeding 3 000 m²). They are recorded in the per-clau `CLAU.md` files
// so the next reader does not re-discover them, and so nobody mistakes "we refuse" for "the
// ordinance is silent". Those are different statements and only the first is true here.
//
// ═══ ⚠⚠⚠ AND ONE REFUSAL REASON LOOKS WRONG — clau `17` ═══════════════════════════════════════
//
// `17` is *zona de renovació urbana en transformació de l'ús* (PGM Art. 314.9). Art. 368.1 does
// **not** delegate to a derived instrument. It states the regime itself:
//
//   *"Fins que no es programi l'actuació encaminada a l'adquisició del terreny per tal de
//   destinar-lo a equipaments o espais verds, el propietari … podrà: a. efectuar obres de
//   consolidació, reparació, modernització o millora de les condicions estètiques o higièniques de
//   les edificacions, **però no augmentar-ne el volum**."*
//
// That is a **statutory no-new-volume holding regime on land earmarked for public acquisition** —
// the PGM's own answer, not a pointer at somebody else's document. `derived-plan` asserts that
// the general plan delegates buildability to another instrument for this parcel, which for clau 17
// is **not what the article says**. The reason is closer to the `public-system` / *land held for
// acquisition* family than to `14a`'s genuine PERI delegation.
//
// ⚠ THE OUTCOME IS THE SAME (no new envelope) SO NOTHING RENDERS DIFFERENTLY TODAY — which is
// exactly why it would survive review. Correcting it changes the sentence a clau 17 owner reads
// from *"a derived plan governs your land"* (they should go find it — it may not exist) to *"your
// land is held for public acquisition and no volume increase is permitted until then"* (they
// should not). Changing it is a legal act on someone's land and is therefore **reported, not
// applied**: the test below PINS TODAY'S BEHAVIOUR and names the finding, so a future correction
// is a deliberate edit with this comment attached rather than a silent drift.

import { describe, it, expect } from 'vitest';
import { resolveZoneDisposition, BCN_JURISDICTION_ID } from '../src/rulepacks/registry.js';
import { barcelonaZoneRefusal } from '../src/rulepacks/esBarcelonaZoneClassification.js';

/** The six claus this suite is about, plus the subzone-suffixed variant the MUC actually returns. */
const REFUSAL_CLAUS = ['15', '16', '17', '17/6', '14a', '14b', '8a'] as const;

describe('Barcelona refusal claus — every one still refuses, and none silently becomes a pack', () => {
    for (const clau of REFUSAL_CLAUS) {
        it(`clau ${clau} resolves to a refusal, never to a pack and never to unregistered`, () => {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind).toBe('refusal');
            // ⚠ `unregistered` would drop these claus into the generic estimated pack — a
            // fabricated front/side/rear triple on land the ordinance genuinely refuses. That is
            // the L-550 defect this whole classification exists to prevent.
        });
    }
});

describe('Barcelona refusal claus — the CODE, pinned per clau', () => {
    // ⚠ A legally-grounded refusal and a we-have-not-done-the-work refusal are DIFFERENT ANSWERS
    // and must never be swapped. `legallyGrounded` is what the UI renders differently, so it is
    // asserted alongside the code rather than left implicit.
    const EXPECTED: ReadonlyArray<readonly [string, string]> = [
        // Art. 357.1 — *"la edificabilitat serà la que s’estableixi als Plans de Reforma
        // Interior, que no podran depassar l’edificació global existent al sector."* A textbook
        // delegation: the figure is in another document, and the PGM caps it at what exists.
        ['14a', 'derived-plan'],
        // Art. 355.2 — *"A les zones de remodelació privada el tipus d’ordenació serà el
        // d’edificació volumètrica específica"*, i.e. the SOLID comes from the PRI / Estudi de
        // Detall. Art. 358.2.c then derives the height from the neighbouring frontages, which is
        // a construction over land PRYZM does not hold. Delegation confirmed — even though
        // Art. 357.2 does state FAR indices (see the header).
        ['14b', 'derived-plan'],
        // Art. 330.2 — *"Les condicions d’edificació de cada unitat de zona seran les establertes
        // a l’ordenança del pla especial"*. Delegation confirmed.
        ['15', 'derived-plan'],
        // Art. 360.1 — *"Per a l’actuació en aquesta zona s’elaboraran plans especials als quals
        // s’elegirà el tipus d’ordenació de l’edificació a aplicar en cadascun dels sectors"*.
        // ⚠ The delegation here is sharper than it looks: Art. 365.2 states four complete
        // parameter sets, and WHICH ONE APPLIES is chosen by the plan. Holding the numbers without
        // the choice is holding nothing.
        ['16', 'derived-plan'],
        // ⚠⚠ SEE THE HEADER. Art. 368.1.a states a no-volume-increase holding regime; it does NOT
        // delegate. This row PINS TODAY'S BEHAVIOUR and is flagged for correction, not endorsed.
        ['17', 'derived-plan'],
        ['17/6', 'derived-plan'],
        // Art. 345.1 — *"L’edificabilitat, en aquesta zona, es defineix en relació amb l’edificació
        // actual existent i només es permet augmentar-la fins a un màxim del 10 per 100"*. Not a
        // delegation and not a coverage gap: the entitlement is defined RELATIVE TO THE EXISTING
        // BUILDING, so there is no parcel-derived envelope at all. The dedicated code is correct.
        ['8a', 'protected-private-green'],
    ];

    for (const [clau, code] of EXPECTED) {
        it(`clau ${clau} → \`${code}\`, legally grounded`, () => {
            const r = barcelonaZoneRefusal(clau);
            expect(r).not.toBeNull();
            expect(r!.code).toBe(code);
            // Every one of the six is a statement about the LAW, not about PRYZM's coverage.
            expect(r!.legallyGrounded).toBe(true);
            expect(r!.ordinanceRef).toBeTruthy();
        });
    }

    it('⚠ `8a` does NOT share a refusal with the derived-plan family', () => {
        // Its reason is a different legal fact — private, protected, entitlement measured against
        // the existing building — and collapsing it into `derived-plan` would tell a 8a owner to
        // go and find a plan that does not exist.
        expect(barcelonaZoneRefusal('8a')!.code).not.toBe(
            barcelonaZoneRefusal('15')!.code,
        );
    });

    it('⚠ `8a` is NOT classified as public land — the ownership half of the answer matters', () => {
        const r = barcelonaZoneRefusal('8a')!;
        expect(r.code).not.toBe('public-open-space');
        expect(r.code).not.toBe('public-system');
        expect(r.code).not.toBe('protected-soil');
    });

    it('none of the six wears a COVERAGE-GAP code — that would be a statement about PRYZM', () => {
        for (const clau of REFUSAL_CLAUS) {
            const r = barcelonaZoneRefusal(clau)!;
            expect(r.code).not.toBe('no-rule-pack');
            expect(r.code).not.toBe('regime-undetermined');
            expect(r.code).not.toBe('source-data-unavailable');
        }
    });
});

describe('Barcelona refusal claus — the ⚠ FINDING: four of them DO state parameters', () => {
    // These assertions carry no numbers into the engine. They exist so the finding cannot be
    // deleted by someone tidying comments: the figures below are recorded in the per-clau
    // `CLAU.md` files under `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/claus/`,
    // and each is GATED, which is why the refusal survives them.
    const STATED_BUT_GATED: ReadonlyArray<readonly [string, string, string]> = [
        [
            '15',
            'PGM Art. 330.3.4a',
            'interim FAR 0,90 m²st/m²s on UNBUILT parcels, only "mentre no es publiqui el Pla Especial"',
        ],
        [
            '16',
            'PGM Arts. 362 / 363 / 365.2',
            'brut 0,70 · net mitjà 1,37 · per-ordering-type 1,50/1,00/2,20/1,20 · 75 hab/ha · ' +
                'aïllada 9,15 m PB+2, 250 m², 40 %, 3/2/2 m — but the ordering type is CHOSEN by the plan',
        ],
        [
            '14b',
            'PGM Art. 357.2 (+ Barcelona modification, PDF p. 152)',
            'brut 0,90 → Barcelona 1,08 · net 2,89 · complementari zonal 0,30 → difference to 1,2; ' +
                'the Barcelona figures require "la tramitació d’un nou planejament"',
        ],
        [
            '8a',
            'PGM Arts. 345.3 / 347.2.e',
            '≤ 500 m² sostre per 2 500 m² of excess over 3 000 m²; new-build 9 m high, 6 m from the ' +
                'street, 4 m from the boundaries — all only via a Pla Especial on a > 3 000 m² parcel',
        ],
    ];

    for (const [clau, articles, what] of STATED_BUT_GATED) {
        it(`clau ${clau} — ${articles} states parameters (${what}), and STILL refuses`, () => {
            // The finding is that the ordinance is NOT silent. The refusal stands because every
            // figure is procedurally gated — which is a different, weaker statement than "there is
            // nothing to transcribe", and the difference is what this test records.
            expect(articles.length).toBeGreaterThan(0);
            expect(what.length).toBeGreaterThan(0);
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind).toBe('refusal');
        });
    }
});
