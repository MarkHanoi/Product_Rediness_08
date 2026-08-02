// ⭐ THE BALEARS KNOWN-ANSWER CONTROL — Manacor `RE-NA`, identitat 292430.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS A CONTROL AND NOT MERELY A TEST
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The expected values are INDEPENDENTLY KNOWN — they were read off the published fitxa by a human
// before any parser existed, and they are the figures quoted in the Balears probe write-up:
//
//     PM 200 m²  ·  AM 7 m  ·  NP 3 plantes  ·  O 80 %  ·  IRP 120 m²/habitatge  ·  E 2.4
//     citing Article 66 (on NP) and Article 56.3.j (on O)
//
// A test whose expectations are whatever the code happened to produce proves only that the code is
// deterministic. These expectations came from OUTSIDE the code, which is what makes a red here mean
// "the parser is wrong" rather than "the parser changed".
//
// ⚠ THE FIXTURE IS THE REAL PAGE, COMMITTED. `tools/balears-muib-probe/out/p-test-292430.html` is
// the byte-for-byte HTML the live service returned. It is read from disk rather than inlined so the
// test cannot drift from the artefact the 418-page parser census was run against — and ⛔ it FAILS
// LOUDLY if the file is missing. A skipped control is a green suite that ran nothing, which is the
// failure mode this file exists to rule out.
//
// ── THE COLLISIONS THIS CONTROL PINS, WHICH COST REAL MEASUREMENT ERROR ──────────────────────────
//   • `AT` is *Allotjament turístic* — a USE CLASS, not *altura total*. An earlier page-wide regex
//     read use rows as geometry.
//   • `RL` is *Religiós* — a USE, not a setback.
//   • Height is `HR`/`HT`; setbacks are ***Reculada*** `RA`/`RF`/`RM`, never *Retranqueig*.
//     ⭐ A GUESSED DICTIONARY REPORTED METRIC HEIGHT AS 0/80 ABSENT WHEN IT IS 49/80.
//   • The UNIT IS ITS OWN CELL, and it decides what the number is (`80 %` vs `200 m2`).

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    parseBalearsFitxa,
    classifyBalearsFitxa,
    classifyBalearsParameter,
    balearsDrawability,
    balearsFitxaCells,
} from '../src/providers/balearsMuibFitxa.js';
// ⚠ STATIC, NOT `await import(...)` INSIDE `it()`. The dynamic form was measured taking >5 s on a
// cold esbuild transform in this package, which is vitest's DEFAULT TEST TIMEOUT — so the control
// went red intermittently for a reason that had nothing to do with the parser. A control that fails
// on machine speed is worse than no control: it trains a reader to re-run rather than to look.
import { balearsMaxCoverage } from '../src/rulepacks/esBalearsMuib.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Locate the committed fitxa fixture. The package may run from a git worktree, so walk out of
 * `.claude/worktrees/<id>/` to the main checkout before giving up — the same fallback the probe's
 * own `findMuibArtefact` uses. ⛔ Returns null rather than guessing; the caller then FAILS.
 */
function fixturePath(): string | null {
    const rel = 'tools/balears-muib-probe/out/p-test-292430.html';
    const candidates = [resolve(HERE, '..', '..', '..', rel)];
    const m = HERE.replace(/\\/g, '/').match(/^(.*)\/\.claude\/worktrees\/[^/]+\//);
    if (m) candidates.push(resolve(m[1] as string, rel));
    for (const c of candidates) if (existsSync(c)) return c;
    return null;
}

const path = fixturePath();
// ⛔ NOT `it.skipIf`. A missing control must be RED, never absent — a suite that silently stopped
// running its control is indistinguishable from one that passed it.
if (path === null) {
    throw new Error(
        'BALEARS CONTROL FIXTURE MISSING: tools/balears-muib-probe/out/p-test-292430.html. ' +
            'The known-answer control cannot run, and skipping it would make the suite green on ' +
            'nothing. Restore the fixture.',
    );
}
const HTML = readFileSync(path, 'utf8');

describe('§BALEARS-CONTROL — Manacor RE-NA (identitat 292430), the known-answer fitxa', () => {
    const fitxa = parseBalearsFitxa(HTML);
    const P = classifyBalearsFitxa(fitxa);

    it('identifies the entity, the municipality and the MUIB zone code', () => {
        expect(fitxa.identitat).toBe('292430');
        expect(fitxa.municipi).toBe('Manacor');
        expect(fitxa.codiMuib).toBe('RE_NA');
    });

    it('⛔ reads EVERY code cell it saw — a non-zero miss invalidates the whole read', () => {
        expect(fitxa.codeCellsUnparsed).toEqual([]);
        expect(fitxa.codeCellsSeen).toBeGreaterThan(0);
    });

    it('⭐ THE SIX PUBLISHED PARAMETERS, to their independently-known values', () => {
        expect(P['PM']).toMatchObject({ status: 'PRESENT', verdict: 'VALID', value: 200 });
        expect(P['AM']).toMatchObject({ status: 'PRESENT', verdict: 'VALID', value: 7 });
        expect(P['NP']).toMatchObject({ status: 'PRESENT', verdict: 'VALID', kind: 'STOREYS', value: 3 });
        expect(P['O']).toMatchObject({ status: 'PRESENT', verdict: 'VALID', kind: 'PERCENT', value: 80 });
        expect(P['IRP']).toMatchObject({ status: 'PRESENT', verdict: 'VALID', value: 120 });
        expect(P['E']).toMatchObject({ status: 'PRESENT', verdict: 'VALID', kind: 'RATIO', value: 2.4 });
    });

    it('⭐ THE UNIT CELL — read separately, because it decides what the number IS', () => {
        expect(P['PM']?.units).toMatch(/m2/i);
        expect(P['AM']?.units).toMatch(/^m$/i);
        expect(P['NP']?.units).toMatch(/plantes/i);
        expect(P['O']?.units).toMatch(/%/);
        // `E` is a RATIO here (m² buildable per m² of plot), not an absolute m² ceiling.
        expect(P['E']?.units).toMatch(/superf/i);
    });

    it('⛔ USE CLASSES ARE NOT PARAMETERS — AT is *Allotjament turístic*, RL is *Religiós*', () => {
        // ⚠ ASSERTED ON `fitxa.rows`, THE RAW PARSE — **NOT** on the classified parameter map.
        // An earlier version of this test checked `classifyBalearsFitxa(...)[code]`, and that was
        // VACUOUS: the classifier only iterates `BALEARS_ENVELOPE_CODES`, which does not contain the
        // use codes, so it returned `undefined` for them no matter what the parser had done. Mutation
        // testing found it — the check passed with the use-class guard deliberately broken. `rows` is
        // where a leaked use code would actually appear, so `rows` is where the guard must be tested.
        for (const useCode of ['AT', 'RL', 'CO', 'UN', 'PL', 'ET', 'TM', 'DO', 'SA']) {
            expect(fitxa.rows[useCode], `${useCode} must not parse as a parameter`).toBeUndefined();
        }
        // The fitxa publishes EXACTLY the seven parameter rows and nothing else — a count, so a leak
        // of any use row (there are 27 on this page) is caught even if it lands on a new code.
        expect(Object.keys(fitxa.rows).sort()).toEqual(['AM', 'E', 'IRP', 'NP', 'O', 'PM', 'T']);
        expect(fitxa.codeCellsSeen).toBe(7);

        // …and the page DOES carry those tokens, so none of the above is vacuous.
        const cells = balearsFitxaCells(HTML);
        expect(cells.some((c) => /^TU-AT:/.test(c))).toBe(true);
        expect(cells.some((c) => /^EQ-RL:/.test(c))).toBe(true);
    });

    it('carries the governing article ON the parameter, not merely on the page', () => {
        expect(P['NP']?.articleRefs).toContain('Article 66');
        expect(P['O']?.articleRefs).toContain('Article 56.3.j');
        expect(fitxa.articleRefsAll).toEqual(
            expect.arrayContaining(['Article 66', 'Article 56.3.j']),
        );
    });

    it('reads *Tipus d’ordenació* as CATEGORICAL text, not as a failed number', () => {
        expect(P['T']).toMatchObject({ status: 'PRESENT', verdict: 'VALID', kind: 'TEXT' });
        expect(String(P['T']?.value)).toMatch(/^EM:/);
    });

    it('scores COMPLETE — height + occupation + FAR, all VALID', () => {
        const d = balearsDrawability(P);
        expect(d.tier).toBe('COMPLETE');
        expect(d.heightStoreys).toBe(true);
        expect(d.occupation).toBe(true);
        expect(d.far).toBe(true);
    });

    it('publishes NO *Reculada* — and they are ABSENT, never zero (L-616)', () => {
        for (const c of ['RA', 'RF', 'RM']) {
            expect(P[c]?.status, c).toBe('ABSENT');
            expect(P[c]?.value, c).toBeUndefined();
        }
        expect(balearsDrawability(P).setbacks).toEqual([]);
    });
});

describe('§BALEARS-VALIDITY — the numbers this dataset publishes that are NOT true', () => {
    const row = (value: string, units: string | null, regim = '') => ({
        label: 'x', value, units, regim, articleRefs: [] as string[],
    });

    it('⛔ O = 100 % is SUSPECT, never VALID — a null substitute and a contradiction', () => {
        const p = classifyBalearsParameter('O', row('100', '%'));
        expect(p.status).toBe('PRESENT');
        expect(p.verdict).toBe('SUSPECT');
        expect(p.why).toMatch(/null substitute|contradiction/i);
        // ⇒ and therefore it draws NOTHING: it enters no numerator.
        const P = { O: p, NP: classifyBalearsParameter('NP', row('3', 'plantes')) };
        expect(balearsDrawability(P).occupation).toBe(false);
    });

    it('⛔ a 0 m setback is ZERO_AMBIGUOUS and enters no numerator', () => {
        const p = classifyBalearsParameter('RA', row('0', 'm'));
        expect(p.verdict).toBe('ZERO_AMBIGUOUS');
        const P = { RA: p, NP: classifyBalearsParameter('NP', row('3', 'plantes')) };
        expect(balearsDrawability(P).setbacks).toEqual([]);
        expect(balearsDrawability(P).tier).toBe('NOT_DRAWABLE');
    });

    it('a NON-EMPTY observation makes a parameter CONDITIONAL ⇒ never a clean complete', () => {
        const P = {
            NP: classifyBalearsParameter('NP', row('3', 'plantes', 'Un règim específic s’aplica')),
            O: classifyBalearsParameter('O', row('80', '%')),
            E: classifyBalearsParameter('E', row('2.4', 'm2 superf. edificable/m2 superf. del solar')),
        };
        expect(P['NP']?.conditional).toBe(true);
        expect(balearsDrawability(P).conditional).toBe(true);
    });

    it('⭐ FAR ALONE DOES NOT DRAW — floor area with neither footprint nor height', () => {
        const P = { E: classifyBalearsParameter('E', row('2', 'm2 superf. edificable/m2 superf. del solar')) };
        const d = balearsDrawability(P);
        expect(d.tier).toBe('NOT_DRAWABLE');
        expect(d.reasons.join(' ')).toMatch(/FAR alone/);
    });

    it('⭐ height + occupation ALONE *does* draw — PARTIAL is taken, not discarded (12.7 pp)', () => {
        const P = {
            NP: classifyBalearsParameter('NP', row('3', 'plantes')),
            O: classifyBalearsParameter('O', row('60', '%')),
        };
        expect(balearsDrawability(P).tier).toBe('PARTIAL_DRAWABLE');
    });

    it('the sentinel 99999999 is UNUSABLE, never a number', () => {
        expect(classifyBalearsParameter('HR', row('99999999', 'm')).verdict).toBe('UNUSABLE');
    });

    it('occupation in m² is an AREA, not a percentage — the unit is not decoration', () => {
        const p = classifyBalearsParameter('O', row('200', 'm2'));
        expect(p.kind).toBe('ABSOLUTE_M2');
        // ⇒ and it must NOT become a coverage ratio.
        expect(balearsMaxCoverage({ O: p })).toBeNull();
    });
});
