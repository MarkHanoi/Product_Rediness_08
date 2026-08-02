// §AMB-CORPUS-GATE (L-678) — the 36 AMB municipalities are REACHABLE THROUGH THE GATE, and every
// one of them is SHUT.
//
// ⚠ EXERCISES THE NEW PATH. `esAmbMetropolitanCorpus.ts`, `ambEnvelopeAuthorisationForIne`,
// `ENVELOPE_GATE_CONSTANT_BY_JURISDICTION` and `ENVELOPE_GATE_CONSTANT_NAMES` did not exist before
// 2026-08-02; this file does not compile against the previous tree. MUTATION-PROVED: with
// `esAmbMetropolitanCorpus.ts` removed and the gate table reverted, this whole file fails to import.
//
// ⚠ AT PACKAGE ROOT deliberately — `vitest.config.ts` collects `__tests__/**/*.test.ts` only, so a
// nested `src/**/__tests__/` file is silently uncollected.
//
// ⛔ THE DISTINCTION UNDER TEST IS THE WHOLE POINT, and it is a §CONTEXT-DATA-HONESTY property, not
// a cosmetic one:
//     `gate-shut`            = a human has not signed yet        ⇒ the next step is a SIGNATURE
//     `unknown-jurisdiction` = nobody has assessed this place    ⇒ the next step is a MEASUREMENT
// Before this change, 31 municipalities that a 3 000-parcel-per-town cold-start probe had just
// measured answered `unknown-jurisdiction`. Conflating the two understates what PRYZM knows and
// hides the fact that only a signature is outstanding.
//
// ⛔ AND THE OTHER HALF: NOTHING HERE OPENS. Every assertion below that touches authorisation
// asserts `false`. A future edit that flips a corpus gate to make a demo work turns
// §NOTHING-IS-OPEN red, and `l449CertificationGates.test.ts §NO-UNSIGNED-OPEN-GATE` red as well.
//
// Authority: ADR-0283, ADR-0293, C58 §1.4/§1.5/§1.13, C60 §2, L-449, L-665, L-677, L-678.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    AMB_PGM_NNUU_ENVELOPE_VERIFIED,
    AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED,
    AMB_ENVELOPE_GATE_ROUTING,
    AMB_PGM_CORPUS_JURISDICTIONS,
    AMB_NO_CORPUS_JURISDICTIONS,
    AMB_CORPUS_CEILINGS,
    ambCorpusMemberForIne,
    ambAuthorisationIdForIne,
    ambCorpusGateRefusal,
} from '../src/rulepacks/esAmbMetropolitanCorpus.js';
import {
    ENVELOPE_PUBLICATION_GATES,
    ENVELOPE_GATE_CONSTANT_BY_JURISDICTION,
    UNGATED_AUTHORISED_JURISDICTIONS,
    envelopePublicationAuthorisation,
    isEnvelopePublicationAuthorised,
    ambEnvelopeAuthorisationForIne,
} from '../src/rulepacks/envelopeAuthorisation.js';
import { AMB_REFOS_MUNICIPALITIES } from '../src/providers/ambRefosMunicipalities.js';
import { ineCodeLiteral } from '../src/providers/esMunicipalCode.js';
import { BCN_JURISDICTION_ID, ineCodeForJurisdiction } from '../src/rulepacks/registry.js';

const TRACKER_TSV = fileURLToPath(
    new URL('../../../tools/cold-start-probe/out/amb-tracker-rows.tsv', import.meta.url),
);

/** An INE code the AMB Refós does NOT publish — the "37th municipality" stand-in. */
const NOT_IN_AMB = ineCodeLiteral('08121'); // Mataró: Barcelona province, outside the AMB.

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§AMB-CORPUS-ROUTING — the table is TOTAL over the AMB scope, and it is the same 36', () => {
    it('names exactly the 36 municipalities `AMB_REFOS_MUNICIPALITIES` names, by INE and by name', () => {
        // ⚠ THE TWO TABLES MUST NOT DRIFT. `AMB_REFOS_MUNICIPALITIES` is the DATASET's scope (what
        // the service publishes); this one is the AUTHORISATION routing over that scope. If a row
        // is added to one and not the other, some municipality is either reachable-but-unassessed
        // or assessed-but-unreachable — and both are invisible failures.
        const scope = AMB_REFOS_MUNICIPALITIES.map((m) => m.ineCode as string).sort();
        const routing = AMB_ENVELOPE_GATE_ROUTING.map((m) => m.ineCode as string).sort();
        expect(routing).toEqual(scope);
        expect(routing).toHaveLength(36);
        expect(new Set(routing).size).toBe(36);

        const nameByIne = new Map(
            AMB_REFOS_MUNICIPALITIES.map((m) => [m.ineCode as string, m.nameInSource]),
        );
        for (const r of AMB_ENVELOPE_GATE_ROUTING) {
            expect(r.nameInSource, r.ineCode as string).toBe(nameByIne.get(r.ineCode as string));
        }
    });

    it('§ROUTE-COUNTS — 22 corpus + 9 no-corpus + 4 own-gate + 1 ungated = 36', () => {
        // The five counts in play (36 · 27 · 26 · 25 · 22) answer five DIFFERENT questions and are
        // not interchangeable. This pins the two the routing depends on.
        const by = (route: string): number =>
            AMB_ENVELOPE_GATE_ROUTING.filter((r) => r.route === route).length;
        expect(by('amb-pgm-corpus')).toBe(22);
        expect(by('no-held-corpus')).toBe(9);
        expect(by('own-municipal-gate')).toBe(4);
        expect(by('ungated-by-record')).toBe(1);
        expect(by('amb-pgm-corpus') + by('no-held-corpus')).toBe(31); // the NEW gate entries
        expect(AMB_PGM_CORPUS_JURISDICTIONS).toHaveLength(22);
        expect(AMB_NO_CORPUS_JURISDICTIONS).toHaveLength(9);

        // The CORPUS split is the measured one and is NOT the same partition as the route split:
        // 27 municipalities interpret the metropolitan PGM, but 5 of those reach the gate by
        // another road (Barcelona by record; Badalona/Cornellà/L'Hospitalet/Sant Boi by their own
        // municipal gates). 27 − 5 = 22. Collapsing corpus and route would lose exactly that fact.
        expect(AMB_ENVELOPE_GATE_ROUTING.filter((r) => r.corpus === 'pgm-metropolitan')).toHaveLength(27);
        expect(AMB_ENVELOPE_GATE_ROUTING.filter((r) => r.corpus === 'no-held-corpus')).toHaveLength(9);
    });

    it('§ID-CARRIES-ITS-INE — every minted id is unique and carries its own municipal code', () => {
        // The §JURISDICTION-SPECIFICITY / L-652 mis-citation guard, applied to the new ids: an id
        // whose INE segment names another municipality would answer one town's land under another
        // town's authorisation.
        const ids = AMB_ENVELOPE_GATE_ROUTING.map((r) => r.jurisdictionId);
        expect(new Set(ids).size).toBe(36);
        for (const r of AMB_ENVELOPE_GATE_ROUTING) {
            expect(
                ineCodeForJurisdiction(r.jurisdictionId),
                `${r.jurisdictionId} must carry INE ${r.ineCode}`,
            ).toBe(r.ineCode);
        }
        // The five pre-existing ids are reproduced EXACTLY — a new slug for an already-registered
        // municipality would split its identity in two and quietly bypass its own gate.
        expect(ambAuthorisationIdForIne(ineCodeLiteral('08019'))).toBe(BCN_JURISDICTION_ID);
        expect(ambAuthorisationIdForIne(ineCodeLiteral('08015'))).toBe('es-08015-badalona');
        expect(ambAuthorisationIdForIne(ineCodeLiteral('08073'))).toBe('es-08073-cornella-de-llobregat');
        expect(ambAuthorisationIdForIne(ineCodeLiteral('08101'))).toBe('es-08101-hospitalet');
        expect(ambAuthorisationIdForIne(ineCodeLiteral('08200'))).toBe('es-08200-sant-boi');
    });

    it('every row states WHY it is routed the way it is — an omission is invisible, a reason is not', () => {
        for (const r of AMB_ENVELOPE_GATE_ROUTING) {
            expect(r.routeReason.length, `${r.ineCode} ${r.nameInSource}`).toBeGreaterThan(120);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('⭐ §GATE-SHUT-IS-NOT-UNKNOWN — the distinction this change exists to make', () => {
    it('a NEW municipality RESOLVES and refuses `gate-shut` — NOT `unknown-jurisdiction`', () => {
        // ⛔ THE CENTRAL ASSERTION. Every one of these answered `unknown-jurisdiction` before
        // 2026-08-02 — "nobody has assessed this place" — about municipalities the cold-start probe
        // had measured at 3 000 parcels apiece. `gate-shut` says the truth: a signature is what is
        // missing, not a measurement.
        const cases: ReadonlyArray<readonly [string, string]> = [
            ['08089', 'Gavà'],                       // PGM='S', corpus gate
            ['08056', 'Castelldefels'],              // PGM='S', 64.70 % ladder share
            ['08245', 'Santa Coloma de Gramenet'],   // PGM='S', 32.23 % delegated
            ['08204', 'Sant Climent de Llobregat'],  // PGM='S', 8.29 % delegated — the AMB minimum
            ['08020', 'Begues'],                     // PGM='N', no-corpus gate
            ['08904', 'Badia del Vallès'],           // PGM='N', the measured-zero outlier
        ];
        for (const [ine, name] of cases) {
            const id = ambAuthorisationIdForIne(ineCodeLiteral(ine));
            expect(id, `${name} must mint an id`).not.toBeNull();
            expect(envelopePublicationAuthorisation(id!), `${ine} ${name}`).toEqual({
                authorised: false,
                reason: 'gate-shut',
            });
            // …and the INE-keyed route says the same thing, so a caller holding only a `CODI_INE`
            // off an AMB feature never has to invent an id to ask the question.
            expect(ambEnvelopeAuthorisationForIne(ineCodeLiteral(ine)), `${ine} ${name}`).toEqual({
                authorised: false,
                reason: 'gate-shut',
                jurisdictionId: id,
            });
        }
    });

    it('⛔ a 37th municipality nobody assessed STILL refuses `unknown-jurisdiction`', () => {
        // FAIL-CLOSED SURVIVES THE SCOPING CHANGE. This is what a blanket "Catalunya = true" would
        // have destroyed, and it is why the corpus gate enumerates its members instead.
        expect(ambCorpusMemberForIne(NOT_IN_AMB)).toBeNull();
        expect(ambAuthorisationIdForIne(NOT_IN_AMB)).toBeNull();
        expect(ambEnvelopeAuthorisationForIne(NOT_IN_AMB)).toEqual({
            authorised: false,
            reason: 'unknown-jurisdiction',
            jurisdictionId: null,
        });
        // …including for INE codes that merely LOOK like AMB members.
        for (const ine of ['08000', '08999', '28079', '46250', '00000']) {
            expect(ambEnvelopeAuthorisationForIne(ineCodeLiteral(ine)).reason, ine).toBe(
                'unknown-jurisdiction',
            );
        }
    });

    it('ALL 36 are reachable through the gate — none answers `unknown-jurisdiction`', () => {
        const reasons = AMB_ENVELOPE_GATE_ROUTING.map((r) => ({
            ine: r.ineCode as string,
            name: r.nameInSource,
            reason: envelopePublicationAuthorisation(r.jurisdictionId).reason,
        }));
        const unassessed = reasons.filter((r) => r.reason === 'unknown-jurisdiction');
        expect(
            unassessed.map((r) => `${r.ine} ${r.name}`),
            'These AMB municipalities are MEASURED but still answer "nobody has assessed this ' +
                'place". That is the §CONTEXT-DATA-HONESTY collapse this module closes.',
        ).toEqual([]);
        expect(reasons.filter((r) => r.reason === 'gate-shut')).toHaveLength(35);
        expect(reasons.filter((r) => r.reason === 'ungated-by-record')).toHaveLength(1);
        expect(reasons.filter((r) => r.reason === 'gate-open')).toHaveLength(0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('⛔ §NOTHING-IS-OPEN — the route was wired; no permission was granted', () => {
    it('both corpus gates are SHUT', () => {
        // ⛔ If either of these is `true`, someone opened a gate without a signature. The fix is to
        // shut it, never to update this expectation. `l449CertificationGates.ts` records
        // `signature: null` for both, so opening one also turns §NO-UNSIGNED-OPEN-GATE red.
        expect(AMB_PGM_NNUU_ENVELOPE_VERIFIED).toBe(false);
        expect(AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED).toBe(false);
    });

    it('not one of the 31 new entries publishes', () => {
        for (const id of [...AMB_PGM_CORPUS_JURISDICTIONS, ...AMB_NO_CORPUS_JURISDICTIONS]) {
            expect(isEnvelopePublicationAuthorised(id), id).toBe(false);
        }
    });

    it('exactly ONE AMB municipality publishes, and it is Barcelona', () => {
        const publishing = AMB_ENVELOPE_GATE_ROUTING.filter((r) =>
            isEnvelopePublicationAuthorised(r.jurisdictionId),
        );
        expect(publishing.map((r) => r.ineCode as string)).toEqual(['08019']);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§BARCELONA-BYTE-IDENTICAL — the known-answer control', () => {
    it('Barcelona is authorised BY RECORD, and is NOT in the gate table', () => {
        // ⚠ THE REGRESSION THIS CHANGE COULD MOST EASILY HAVE CAUSED. Barcelona is measured
        // PGM='S' and is a member of the metropolitan corpus, so folding it into the corpus gate
        // would have looked correct — and would have SHUT the only published city, because
        // `envelopePublicationAuthorisation()` consults the gate table BEFORE the ungated
        // allowlist. It is deliberately routed `ungated-by-record` instead.
        expect(envelopePublicationAuthorisation(BCN_JURISDICTION_ID)).toEqual({
            authorised: true,
            reason: 'ungated-by-record',
        });
        expect(ENVELOPE_PUBLICATION_GATES.has(BCN_JURISDICTION_ID)).toBe(false);
        expect(UNGATED_AUTHORISED_JURISDICTIONS.has(BCN_JURISDICTION_ID)).toBe(true);
        expect(ENVELOPE_GATE_CONSTANT_BY_JURISDICTION.has(BCN_JURISDICTION_ID)).toBe(false);
        // …and its routing row records the corpus membership WITHOUT acting on it.
        const bcn = ambCorpusMemberForIne(ineCodeLiteral('08019'))!;
        expect(bcn.corpus).toBe('pgm-metropolitan');
        expect(bcn.route).toBe('ungated-by-record');
    });

    it('the four municipally-gated AMB cities keep their OWN constant, not the corpus one', () => {
        // Two statements of one signature can drift. Badalona is the case that proves the corpus is
        // not uniform — it rewrote the metropolitan text for its own territory — so a
        // metropolitan-corpus signature must never reach its land.
        const expected: ReadonlyArray<readonly [string, string]> = [
            ['es-08015-badalona', 'BADALONA_ENVELOPE_VERIFIED'],
            ['es-08073-cornella-de-llobregat', 'CORNELLA_ENVELOPE_VERIFIED'],
            ['es-08101-hospitalet', 'LHOSPITALET_ENVELOPE_VERIFIED'],
            ['es-08200-sant-boi', 'SANT_BOI_ENVELOPE_VERIFIED'],
        ];
        for (const [id, gate] of expected) {
            expect(ENVELOPE_GATE_CONSTANT_BY_JURISDICTION.get(id), id).toBe(gate);
            expect(envelopePublicationAuthorisation(id).reason, id).toBe('gate-shut');
        }
        // …and every corpus member points at the corpus constant, so the split is exhaustive.
        for (const id of AMB_PGM_CORPUS_JURISDICTIONS) {
            expect(ENVELOPE_GATE_CONSTANT_BY_JURISDICTION.get(id), id).toBe(
                'AMB_PGM_NNUU_ENVELOPE_VERIFIED',
            );
        }
        for (const id of AMB_NO_CORPUS_JURISDICTIONS) {
            expect(ENVELOPE_GATE_CONSTANT_BY_JURISDICTION.get(id), id).toBe(
                'AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED',
            );
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§THE-CEILING — a signature would not close the box, and the code says so', () => {
    it('the four measured ceilings plus PLANTES are carried as quotable data', () => {
        expect(AMB_CORPUS_CEILINGS).toHaveLength(5);
        const all = AMB_CORPUS_CEILINGS.join(' ');
        expect(all).toContain('59.53');            // Barcelona delegation
        expect(all).toContain('8.29');             // Sant Climent delegation — the AMB minimum
        expect(all).toContain('31-12-2009');       // the deviation list's consolidation cut-off
        expect(all).toContain('NOT exhaustive');
        expect(all).toContain('INCLUDING FOR BARCELONA, WHICH IS PUBLISHED');
        expect(all).toContain('80.33');            // PLANTES parseable
        expect(all).toContain('18.99');            // non-storey token — refusing it is CORRECT
        expect(all).toContain('0.68');             // parser gap — recoverable Engineering
        expect(all).toMatch(/OV > ladder in 17, ladder > OV in 10/);
        expect(all).toContain('ADR-0293');         // open top with a stated reason
        for (const c of AMB_CORPUS_CEILINGS) expect(c.length).toBeGreaterThan(200);
    });

    it('§DELEGATION — the measured spread is per-municipality, not a constant', () => {
        // Where a *pla derivat* governs and PRYZM does not hold it, the correct output is a CITED
        // REFUSAL. A corpus signature does not move this, and it spans an order of magnitude — so
        // "the corpus is signed" can never be read as a coverage promise.
        const del = (ine: string): number => ambCorpusMemberForIne(ineCodeLiteral(ine))!.measured.delegatedPct;
        expect(del('08019')).toBe(59.53); // Barcelona — PUBLISHED, and the highest in the AMB
        expect(del('08245')).toBe(32.23); // Santa Coloma de Gramenet
        expect(del('08204')).toBe(8.29);  // Sant Climent de Llobregat — the minimum
        expect(del('08019') / del('08204')).toBeGreaterThan(7);
    });

    it('§QUAL-MUNI — 0.00 % in ALL 27 PGM municipalities, non-zero in 8 of the 9 others', () => {
        // The measured fact that makes the two-corpus split real rather than a taxonomy invented
        // for convenience.
        const pgm = AMB_ENVELOPE_GATE_ROUTING.filter((r) => r.corpus === 'pgm-metropolitan');
        for (const r of pgm) expect(r.measured.qualMuniPct, r.nameInSource).toBe(0);
        const others = AMB_ENVELOPE_GATE_ROUTING.filter((r) => r.corpus === 'no-held-corpus');
        const nonZero = others.filter((r) => r.measured.qualMuniPct > 0);
        expect(nonZero).toHaveLength(8);
        // Badia del Vallès is the ninth, and its zero is MEASURED (95.45 % missing data), not
        // assumed — the probe's own rule: a zero must never stand in for a missing measurement.
        expect(others.find((r) => r.measured.qualMuniPct === 0)!.ineCode).toBe('08904');
        for (const r of nonZero) {
            expect(r.measured.qualMuniPct, r.nameInSource).toBeGreaterThanOrEqual(24.92);
            expect(r.measured.qualMuniPct, r.nameInSource).toBeLessThanOrEqual(77.57);
        }
    });

    it('§ROUTE-MIX-INVERTS — OV beats the ladder in 17 of 27, the ladder beats OV in 10', () => {
        // Neither route is "the" AMB path, which is why a single corpus signature cannot be sold as
        // "Barcelona's method now works metro-wide".
        const pgm = AMB_ENVELOPE_GATE_ROUTING.filter((r) => r.corpus === 'pgm-metropolitan');
        expect(pgm.filter((r) => r.measured.ovPct > r.measured.packPct)).toHaveLength(17);
        expect(pgm.filter((r) => r.measured.packPct > r.measured.ovPct)).toHaveLength(10);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§KNOWN-ANSWER — the embedded measurements agree with the probe artefact on disk', () => {
    it('every envelope % matches `tools/cold-start-probe/out/amb-tracker-rows.tsv`', () => {
        // ⚠ A SEPARATE ARTEFACT, READ AT TEST TIME. The numbers in `AMB_ENVELOPE_GATE_ROUTING` are
        // transcribed by hand into refusal copy, and a hand-transcribed measurement that nothing
        // dereferences is how a confident wrong number ships (the §DEREFERENCE-THE-CITATION lesson
        // from L-677, applied to a percentage instead of a signature).
        const tsv = readFileSync(TRACKER_TSV, 'utf8');
        const byIne = new Map<string, number>();
        for (const line of tsv.split(/\r?\n/)) {
            if (!line || line.startsWith('#')) continue;
            const cols = line.split('\t');
            const ine = cols[0]!;
            const env = Number.parseFloat(cols[5] ?? '');
            if (/^\d{5}$/.test(ine) && Number.isFinite(env)) byIne.set(ine, env);
        }
        expect(byIne.size, 'the tracker TSV must carry all 36 rows').toBe(36);
        for (const r of AMB_ENVELOPE_GATE_ROUTING) {
            expect(
                r.measured.envelopePct,
                `${r.ineCode} ${r.nameInSource}: the routing table and the probe artefact disagree`,
            ).toBe(byIne.get(r.ineCode as string));
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§THE-REFUSAL — a statement about PRYZM, never about the land', () => {
    it('is never legally grounded and cites no ordinance', () => {
        for (const r of AMB_ENVELOPE_GATE_ROUTING) {
            const refusal = ambCorpusGateRefusal(r.ineCode, '13a', 'Densificació urbana');
            expect(refusal.legallyGrounded, r.nameInSource).toBe(false);
            expect(refusal.ordinanceRef, r.nameInSource).toBeNull();
            expect(refusal.code).toBe('no-rule-pack');
            expect(refusal.headline).toContain(r.nameInSource);
        }
    });

    it('distinguishes "unsigned corpus" from "no corpus held" — different next steps', () => {
        const gava = ambCorpusGateRefusal(ineCodeLiteral('08089'));      // PGM='S'
        expect(gava.headline).toContain('no human has signed');
        expect(gava.detail).toContain("PGM='S'");
        expect(gava.detail).toContain('L-449');

        const begues = ambCorpusGateRefusal(ineCodeLiteral('08020'));    // PGM='N'
        expect(begues.headline).toContain('does not govern');
        expect(begues.detail).toContain("PGM='N'");
        expect(begues.detail).toContain('a MAP, not an ordinance');
        // ⛔ The two must not converge on one sentence: signing opens the first and never the second.
        expect(begues.headline).not.toBe(gava.headline);
    });

    it('every refusal quotes the MISSING-CONSTRAINTS ceiling verbatim', () => {
        // ADR-0293 — an open top with a STATED reason. A paraphrase drifts; the quote cannot.
        for (const ine of ['08089', '08020', '08056', '08904']) {
            expect(ambCorpusGateRefusal(ineCodeLiteral(ine)).detail).toContain(
                AMB_CORPUS_CEILINGS[2]!,
            );
        }
    });

    it('an INE outside the AMB refuses as OUTSIDE THE SERVICE, not as an unsigned gate', () => {
        // Reporting a coverage hole as a signature question would be the same collapse in the
        // opposite direction.
        const out = ambCorpusGateRefusal(NOT_IN_AMB);
        expect(out.headline).toContain('publishes no planning');
        expect(out.headline).not.toContain('signed');
        expect(out.legallyGrounded).toBe(false);
    });
});
