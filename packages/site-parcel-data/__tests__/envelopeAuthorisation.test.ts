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
    isEnvelopePublicationAuthorised,
} from '../src/rulepacks/envelopeAuthorisation.js';
import {
    ANSWERABILITY_CLASSES,
    classifyAnswerability,
    classifyDisposition,
} from '../src/rulepacks/answerabilityClass.js';
import { resolveZoneDisposition, BCN_JURISDICTION_ID } from '../src/rulepacks/registry.js';
import { MADRID_JURISDICTION_ID } from '../src/rulepacks/esMadridNZ1.js';
import { MADRID_PGOUM97_ZONE_CODES } from '../src/rulepacks/esMadridPgoum97.js';
import { CORDOBA_JURISDICTION_ID, CORDOBA_PGOU2001_ZONE_CODES } from '../src/rulepacks/esCordobaPGOU2001.js';
import { MURCIA_JURISDICTION_ID } from '../src/rulepacks/esMurciaEnvelope.js';
import { MURCIA_PGOU2012_ZONE_CODES } from '../src/rulepacks/esMurciaPgou2012.js';

const RULEPACK_DIR = fileURLToPath(new URL('../src/rulepacks/', import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§TOTALITY — a future gated city CANNOT re-open this hole', () => {
    it('every `*_ENVELOPE_VERIFIED` gate in src/rulepacks/ is registered in the gate table', () => {
        // Scanned from disk, not from an import list, for the same reason
        // `packPublishedConfidenceUnchanged.test.ts` scans: an import list can silently omit the
        // one file that matters. `ENVELOPE_PUBLICATION_GATES` fails OPEN by absence (correctly —
        // Barcelona, DK, Paris and NL declare no gate and must keep answering), so THIS assertion
        // is what makes that default safe.
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

        // Every declared gate must be represented in the table. The table is keyed by jurisdiction
        // id, so compare COUNTS plus explicit membership of the three signature-critical cities.
        expect(
            ENVELOPE_PUBLICATION_GATES.size,
            `${declared.size} *_ENVELOPE_VERIFIED constants exist but only ${ENVELOPE_PUBLICATION_GATES.size} ` +
                `are registered in ENVELOPE_PUBLICATION_GATES. An unregistered gate FAILS OPEN — the ` +
                `classifier would promise a full envelope for a city that refuses every parcel. ` +
                `Register it in src/rulepacks/envelopeAuthorisation.ts.`,
        ).toBe(declared.size);
    });

    it('the table READS the gate constants — it never restates them as literals', () => {
        // A second hand-written `false` could drift from the constant the dispatcher checks (the
        // L-422/457/467/469 family). Assert the source contains no literal booleans in the map.
        const src = readFileSync(join(RULEPACK_DIR, 'envelopeAuthorisation.ts'), 'utf8');
        const map = src.slice(src.indexOf('ENVELOPE_PUBLICATION_GATES'), src.indexOf(']);'));
        expect(map).not.toMatch(/,\s*(true|false)\s*\]/);
        for (const gate of ['MADRID_ENVELOPE_VERIFIED', 'CORDOBA_ENVELOPE_VERIFIED', 'MURCIA_ENVELOPE_VERIFIED']) {
            expect(map).toContain(gate);
        }
    });

    it('an UNGATED jurisdiction is authorised — absence is not a refusal', () => {
        expect(isEnvelopePublicationAuthorised(BCN_JURISDICTION_ID)).toBe(true);
        expect(isEnvelopePublicationAuthorised('dk')).toBe(true);
        expect(isEnvelopePublicationAuthorised('nl-bestemmingsplan')).toBe(true);
        expect(ENVELOPE_PUBLICATION_GATES.has(BCN_JURISDICTION_ID)).toBe(false);
    });

    it('all three signature-critical cities are UNAUTHORISED today', () => {
        expect(isEnvelopePublicationAuthorised(MADRID_JURISDICTION_ID)).toBe(false);
        expect(isEnvelopePublicationAuthorised(CORDOBA_JURISDICTION_ID)).toBe(false);
        expect(isEnvelopePublicationAuthorised(MURCIA_JURISDICTION_ID)).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
describe('§THE-CLASSIFIER-READS-IT — these assertions FAIL on 6632f0e3', () => {
    it('Córdoba PAS-1 is `pack-unverified`, NOT `full-envelope`', () => {
        // The exact call named in the defect report.
        expect(classifyAnswerability(CORDOBA_JURISDICTION_ID, 'PAS-1')).toBe('pack-unverified');
    });

    it('Murcia RM1 is `pack-unverified`, NOT `full-envelope`', () => {
        expect(classifyAnswerability(MURCIA_JURISDICTION_ID, 'RM1')).toBe('pack-unverified');
    });

    it('EVERY packed zone in all three gated cities is `pack-unverified` — no survivors', () => {
        const cases: ReadonlyArray<readonly [string, readonly string[]]> = [
            [MADRID_JURISDICTION_ID, MADRID_PGOUM97_ZONE_CODES],
            [CORDOBA_JURISDICTION_ID, CORDOBA_PGOU2001_ZONE_CODES],
            [MURCIA_JURISDICTION_ID, MURCIA_PGOU2012_ZONE_CODES],
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
