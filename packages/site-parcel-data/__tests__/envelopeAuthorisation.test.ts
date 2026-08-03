// §ENVELOPE-PUBLICATION-AUTHORISATION (L-665) — the answerability classifier reads the GATE,
// not only the registry.
//
// THE DEFECT
// ----------
// `classifyAnswerability('es-14021-cordoba', 'PAS-1')` returned `'full-envelope'` — "a curated pack
// answers; PRYZM computes a real buildable volume" — for a city whose every parcel receives a cited
// REFUSAL and no number, because `CORDOBA_ENVELOPE_VERIFIED` is `false`. Same for Murcia's `RM1`
// and Madrid's 23 Título-8 codes. Córdoba has carried the false claim since it was registered.
//
// ROOT CAUSE, SHARED WITH THE `ZoningRulesEngine` CONFIDENCE DEFECT: a consumer that reads the
// REGISTRY without reading the GATE. `packsByZone` says what is WIRED; `*_ENVELOPE_VERIFIED` says
// what is AUTHORISED. Registration wires routing; it does not authorise output.
//
// ⚠ THE §TOTALITY BLOCK IS THE LOAD-BEARING ONE. Fixing this by de-registering a pack — or by
// listing three cities by hand — would fix today and re-open the hole for the next gated city.
// Totality is scanned from the FILESYSTEM: every exported `*_ENVELOPE_VERIFIED` constant in
// `src/rulepacks/` must appear in `ENVELOPE_PUBLICATION_GATES`, so a new gate that forgets to
// register is a RED TEST, not a silent over-claim.
//
// The §THE-CLASSIFIER-READS-IT assertions FAIL on `6632f0e3` (they all read `full-envelope`).
//
// Authority: C58 §1.4/§1.13, C60 §2, L-449 (the human-verification gate), L-665.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    ENVELOPE_PUBLICATION_GATES,
    ENVELOPE_GATE_CONSTANT_BY_JURISDICTION,
    ENVELOPE_GATE_CONSTANT_NAMES,
    UNGATED_AUTHORISED_JURISDICTIONS,
    envelopePublicationAuthorisation,
    isEnvelopePublicationAuthorised,
} from '../src/rulepacks/envelopeAuthorisation.js';
import {
    ANSWERABILITY_CLASSES,
    classifyAnswerability,
    classifyDisposition,
} from '../src/rulepacks/answerabilityClass.js';
import {
    resolveZoneDisposition,
    BCN_JURISDICTION_ID,
    listJurisdictionCoverage,
} from '../src/rulepacks/registry.js';
import { MADRID_JURISDICTION_ID } from '../src/rulepacks/esMadridNZ1.js';
import { MADRID_PGOUM97_ZONE_CODES } from '../src/rulepacks/esMadridPgoum97.js';
import { CORDOBA_JURISDICTION_ID } from '../src/rulepacks/esCordobaPGOU2001.js';
import { MURCIA_JURISDICTION_ID } from '../src/rulepacks/esMurciaEnvelope.js';
import { MURCIA_PGOU2012_ZONE_CODES } from '../src/rulepacks/esMurciaPgou2012.js';

const RULEPACK_DIR = fileURLToPath(new URL('../src/rulepacks/', import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§TOTALITY — a future gated city CANNOT re-open this hole', () => {
    it('every `*_ENVELOPE_VERIFIED` gate in src/rulepacks/ is registered in the gate table', () => {
        // Scanned from disk, not from an import list, for the same reason
        // `packPublishedConfidenceUnchanged.test.ts` scans: an import list can silently omit the
        // one file that matters. `ENVELOPE_PUBLICATION_GATES` fails CLOSED by absence since
        // 2026-08-02, but an UNREGISTERED gate is still invisible to the classifier, so THIS
        // assertion is what makes the table total over the constants that exist.
        //
        // ⚠ REWRITTEN 2026-08-02 (§GATE-KEYED-ON-THE-CORPUS, L-678). This used to assert
        // `ENVELOPE_PUBLICATION_GATES.size === declared.size`. That equality was never the property
        // — it was a proxy that silently assumed ONE CONSTANT ⇒ ONE JURISDICTION, and it becomes
        // FALSE the moment a gate is keyed on an ordinance CORPUS: `AMB_PGM_NNUU_ENVELOPE_VERIFIED`
        // governs 22 municipalities under one signature. Comparing NAME SETS instead of counts is
        // strictly stronger — a count can be right while the membership is wrong.
        const declared = new Set<string>();
        for (const file of readdirSync(RULEPACK_DIR).filter((f) => f.endsWith('.ts'))) {
            const src = readFileSync(join(RULEPACK_DIR, file), 'utf8');
            for (const m of src.matchAll(/export const ([A-Z0-9_]*_ENVELOPE_VERIFIED)\b/g)) {
                declared.add(m[1]!);
            }
        }
        // Sanity: the scan actually found something (a broken regex must not pass vacuously).
        expect(declared.size).toBeGreaterThanOrEqual(8);
        expect(declared).toContain('MADRID_ENVELOPE_VERIFIED');
        expect(declared).toContain('CORDOBA_ENVELOPE_VERIFIED');
        expect(declared).toContain('MURCIA_ENVELOPE_VERIFIED');
        // The corpus gate — the constant whose existence broke the old count proxy.
        expect(declared).toContain('AMB_PGM_NNUU_ENVELOPE_VERIFIED');

        const named = new Set(ENVELOPE_GATE_CONSTANT_NAMES);
        const unregistered = [...declared].filter((d) => !named.has(d)).sort();
        expect(
            unregistered,
            `${unregistered.length} *_ENVELOPE_VERIFIED constant(s) exist on disk but are NOT read ` +
                `by ENVELOPE_PUBLICATION_GATES: ${unregistered.join(', ')}. An unregistered gate is ` +
                `one the classifier cannot see — it would promise a full envelope for a city that ` +
                `refuses every parcel. Register it in src/rulepacks/envelopeAuthorisation.ts.`,
        ).toEqual([]);

        const phantom = [...named].filter((n) => !declared.has(n)).sort();
        expect(phantom, 'the gate table names a constant that no longer exists on disk').toEqual([]);

        // …and every gated jurisdiction resolves to one of those constants, so the two projections
        // of `GATE_DECLARATIONS` cannot drift apart.
        for (const id of ENVELOPE_PUBLICATION_GATES.keys()) {
            expect(ENVELOPE_GATE_CONSTANT_BY_JURISDICTION.get(id), id).toBeDefined();
            expect(named.has(ENVELOPE_GATE_CONSTANT_BY_JURISDICTION.get(id)!), id).toBe(true);
        }
    });

    it('the table READS the gate constants — it never restates them as literals', () => {
        // A second hand-written `false` could drift from the constant the dispatcher checks (the
        // L-422/457/467/469 family). Assert the declaration literal contains no boolean literals.
        const src = readFileSync(join(RULEPACK_DIR, 'envelopeAuthorisation.ts'), 'utf8');
        const start = src.indexOf('const GATE_DECLARATIONS');
        expect(start, 'GATE_DECLARATIONS must exist — it is the single source of both gate maps')
            .toBeGreaterThan(0);
        const table = src.slice(start, src.indexOf('export const ENVELOPE_PUBLICATION_GATES'));
        expect(table.length).toBeGreaterThan(500);
        expect(table).not.toMatch(/value:\s*(true|false)\b/);
        for (const gate of [
            'MADRID_ENVELOPE_VERIFIED',
            'CORDOBA_ENVELOPE_VERIFIED',
            'MURCIA_ENVELOPE_VERIFIED',
            'AMB_PGM_NNUU_ENVELOPE_VERIFIED',
        ]) {
            expect(table).toContain(gate);
        }
    });

    // ⚠ REWRITTEN 2026-08-02 — this test previously asserted the FAIL-OPEN contract
    // ("absence is not a refusal"). Absence is now a refusal; what keeps these three authorised is
    // that they are RECORDED in `UNGATED_AUTHORISED_JURISDICTIONS`, not that they are missing.
    it('an ungated-BY-RECORD jurisdiction is authorised, and it is the RECORD that authorises it', () => {
        for (const id of [BCN_JURISDICTION_ID, 'dk', 'nl-bestemmingsplan']) {
            expect(isEnvelopePublicationAuthorised(id)).toBe(true);
            expect(envelopePublicationAuthorisation(id).reason).toBe('ungated-by-record');
            expect(UNGATED_AUTHORISED_JURISDICTIONS.has(id)).toBe(true);
            // and the reason is written down, not empty
            expect((UNGATED_AUTHORISED_JURISDICTIONS.get(id) ?? '').length).toBeGreaterThan(40);
        }
        expect(ENVELOPE_PUBLICATION_GATES.has(BCN_JURISDICTION_ID)).toBe(false);
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⛔ THE FAIL-CLOSED CONTRACT. These four tests exercise the NEW path — none of them would have
    //    passed before 2026-08-02, and the first one is the whole reason the default inverted.
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    it('⛔ an UNRECOGNISED jurisdiction id REFUSES — it does not publish', () => {
        // ⚠ UPDATED 2026-08-02 (L-678). This list used to name `es-08204-sant-climent` and
        // `es-08245-santa-coloma` as *"a real AMB municipality, never assessed"*. Both ARE now
        // assessed and gated (see §AMB-CORPUS-GATE below), so leaving them here would have kept the
        // test green for the WRONG REASON — those two literals are not the ids the corpus table
        // mints, so it would have been asserting a slug typo, not the fail-closed default. The ids
        // below carry no INE the AMB publishes, or no INE at all.
        for (const unknown of [
            'es-08015-badalona-metro',      // right municipality, an id nobody registered
            'es-25120-lleida',              // a real Catalan municipality, outside the AMB
            'es-99999-nowhere',
            '',
            'undefined',
        ]) {
            expect(
                isEnvelopePublicationAuthorised(unknown),
                `"${unknown}" must REFUSE. Under the old \`?? true\` default it PUBLISHED, ungated.`,
            ).toBe(false);
            expect(envelopePublicationAuthorisation(unknown).reason).toBe('unknown-jurisdiction');
        }
    });

    it('⛔ parameterising the Barcelona hardcodes cannot silently publish the other 35 AMB municipalities', () => {
        // The AMB Refos layer covers 36 municipalities by CODI_INE. Barcelona is the only one
        // AUTHORISED. Every other id must refuse — and an id built by GUESSING a slug must refuse
        // as unassessed, because inheriting a neighbour's authorisation is the whole hazard.
        const ambIne = ['08015', '08020', '08056', '08123', '08196', '08204', '08245', '08301'];
        for (const ine of ambIne) {
            const id = `es-${ine}-amb`;
            expect(isEnvelopePublicationAuthorised(id), `${id} must refuse`).toBe(false);
            expect(envelopePublicationAuthorisation(id).reason, id).toBe('unknown-jurisdiction');
        }
    });

    it('a SHUT gate refuses with `gate-shut`, distinct from `unknown-jurisdiction`', () => {
        // The distinction is load-bearing: "a human has not signed yet" is a different product
        // state from "nobody has ever assessed this place", and refusal copy must not conflate them.
        // ⚠ Córdoba is no longer this example — it was signed 2026-08-03 (VERIFICATION.md §SIG-1).
        // Madrid demonstrates the SHUT case now.
        expect(envelopePublicationAuthorisation(MADRID_JURISDICTION_ID)).toEqual({
            authorised: false,
            reason: 'gate-shut',
        });
        expect(envelopePublicationAuthorisation(CORDOBA_JURISDICTION_ID)).toEqual({
            authorised: true,
            reason: 'gate-open',
        });
        expect(envelopePublicationAuthorisation('es-00000-unassessed').reason).toBe('unknown-jurisdiction');
    });

    it('§NO-COVERAGE-LOST — every REGISTERED jurisdiction is in exactly one of the two tables', () => {
        // This is the before/after measurement made permanent. If a registered jurisdiction is in
        // neither table it just LOST coverage to the fail-closed flip, and that must be a red test
        // rather than a silent regression discovered in production.
        const orphans: string[] = [];
        for (const j of listJurisdictionCoverage()) {
            const known =
                ENVELOPE_PUBLICATION_GATES.has(j.jurisdictionId) ||
                UNGATED_AUTHORISED_JURISDICTIONS.has(j.jurisdictionId);
            if (!known) orphans.push(j.jurisdictionId);
        }
        expect(
            orphans,
            `These REGISTERED jurisdictions are in neither ENVELOPE_PUBLICATION_GATES nor ` +
                `UNGATED_AUTHORISED_JURISDICTIONS, so the fail-closed default now REFUSES them: ` +
                `${orphans.join(', ')}. Either record the reason they owe no gate, or give them a gate.`,
        ).toEqual([]);
    });

    it('authorisation tracks the SIGNATURE, per city — Murcia + Córdoba signed, Madrid not', () => {
        // Was "all three signature-critical cities are UNAUTHORISED today", then "Murcia signed,
        // Madrid + Córdoba not". The founder signed MURCIA on 2026-08-01 and CÓRDOBA on 2026-08-03
        // (VERIFICATION.md §SIG-1) — Córdoba's D1 UAD defect this test used to cite (Art. 13.9.3.3
        // depth cap stated in source, absent from pack) was independently re-audited 2026-08-03 and
        // confirmed already closed (`ef0e966b`, 2026-08-02), which is what made the signature
        // possible. Madrid is deliberately NOT flipped yet: the six zones excluded as unsignable IN
        // PRINCIPLE (4 · 9.1 · 9.2 · 5.1 · 5.2 · 5.3) are still in the pack — Art. 8.5.6.3 measures
        // to the street CENTRELINE, which `GeometricRule` cannot express ⇒ no front inset ⇒
        // overstates on a narrow street.
        // ⚠ THIS TEST'S REAL JOB IS UNCHANGED: authorisation is PER-JURISDICTION and must never be
        // global. A signature for one city must not authorise another — that is the whole point of
        // asserting all three here rather than only the signed ones.
        expect(isEnvelopePublicationAuthorised(MURCIA_JURISDICTION_ID)).toBe(true);
        expect(isEnvelopePublicationAuthorised(MADRID_JURISDICTION_ID)).toBe(false);
        expect(isEnvelopePublicationAuthorised(CORDOBA_JURISDICTION_ID)).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§THE-CLASSIFIER-READS-IT — these assertions FAIL on 6632f0e3', () => {
    it('Córdoba PAS-1 is now `full-envelope` — the classifier followed the SIGNATURE (2026-08-03)', () => {
        // Was `pack-unverified` while the gate was shut, which was the defect report's own example.
        // The founder signed Córdoba (VERIFICATION.md §SIG-1) on 2026-08-03, so the classifier must
        // now say `full-envelope` — same proof-of-tracking as the Murcia sibling test below.
        // ⚠ `full-envelope` is an AUTHORISATION claim, not a render guarantee: no live dispatch path
        // calls the compute engine for Córdoba yet (`applyCordobaZoningThenFallback` never got past
        // its two refusal branches, siteDispatch.ts) — that is a separate, still-open engineering
        // gap the signature revealed rather than closed.
        expect(classifyAnswerability(CORDOBA_JURISDICTION_ID, 'PAS-1')).toBe('full-envelope');
    });

    it('Murcia RM1 is now `full-envelope` — the classifier followed the SIGNATURE', () => {
        // Was `pack-unverified` while the gate was shut, which was the defect's own example.
        // The founder signed Murcia on 2026-08-01, so the classifier must now say `full-envelope`
        // — and the fact that it MOVED is the proof the fix reads the gate rather than a constant.
        // ⚠ A classifier that stayed `pack-unverified` after a signature would be the SAME defect
        // in the opposite direction: a claim that does not track the authorisation it reports on.
        expect(classifyAnswerability(MURCIA_JURISDICTION_ID, 'RM1')).toBe('full-envelope');
    });

    it('EVERY packed zone in the STILL-GATED cities is `pack-unverified` — no survivors', () => {
        // ⚠ MURCIA WAS REMOVED FROM THIS LIST ON 2026-08-01, CÓRDOBA ON 2026-08-03, and only because
        // each was SIGNED — never because it was inconvenient. Their packed zones are now asserted
        // `full-envelope` by the sibling tests above, so the coverage is not lost, it MOVED with the
        // authorisation. Madrid stays here: it would publish an overstatement today (six
        // centreline/street-width zones with no resolver yet).
        const cases: ReadonlyArray<readonly [string, readonly string[]]> = [
            [MADRID_JURISDICTION_ID, MADRID_PGOUM97_ZONE_CODES],
        ];
        for (const [jurisdiction, codes] of cases) {
            expect(codes.length, jurisdiction).toBeGreaterThan(0);
            for (const code of codes) {
                const d = resolveZoneDisposition(jurisdiction, code);
                // Precondition: these ARE registered packs. The fix must NOT be de-registration —
                // that would fix one city and re-open the hole for the next, and would put out the
                // C60 coverage globe (we DO answer here, with an honest refusal).
                expect(d.kind, `${jurisdiction}/${code} must stay REGISTERED`).toBe('pack');
                expect(classifyAnswerability(jurisdiction, code), `${jurisdiction}/${code}`).toBe(
                    'pack-unverified',
                );
            }
        }
    });

    it('Barcelona — an AUTHORISED jurisdiction — still classifies `full-envelope`', () => {
        // The regression guard. A fix that refuses everything is not a fix.
        for (const clau of ['13a', '12', '18']) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            if (d.kind === 'pack') {
                expect(classifyAnswerability(BCN_JURISDICTION_ID, clau), clau).toBe('full-envelope');
            }
        }
    });

    it('`classifyDisposition` and `classifyAnswerability` STILL agree by construction', () => {
        // The gate is read inside `classifyDisposition` (the pack carries its own `jurisdictionId`)
        // precisely so this property survives — a caller holding a disposition must never get a
        // different answer from one resolving a zone code. Checking the gate only in the
        // convenience wrapper would have re-created a split ontology, the L-664 mistake.
        for (const [jurisdiction, code] of [
            [CORDOBA_JURISDICTION_ID, 'PAS-1'],
            [MURCIA_JURISDICTION_ID, 'RM1'],
            [BCN_JURISDICTION_ID, '13a'],
        ] as const) {
            expect(classifyDisposition(resolveZoneDisposition(jurisdiction, code))).toBe(
                classifyAnswerability(jurisdiction, code),
            );
        }
    });

    it('`pack-unverified` is a MEMBER of the frozen class list, and distinct from its neighbours', () => {
        expect(ANSWERABILITY_CLASSES).toContain('pack-unverified');
        expect(Object.isFrozen(ANSWERABILITY_CLASSES)).toBe(true);
        // §CONTEXT-DATA-HONESTY — it must never collapse into a class that makes a different claim.
        const collapsed = ['full-envelope', 'zone-unencoded', 'systems-land', 'plan-defined', 'no-plan-published'];
        for (const other of collapsed) {
            expect('pack-unverified').not.toBe(other);
        }
        expect(new Set(ANSWERABILITY_CLASSES).size).toBe(ANSWERABILITY_CLASSES.length);
    });
});
