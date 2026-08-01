// §RPUC-SUPERSESSION (L-676) — the screens that reduce Barcelona CLOSURE-REGISTER row 9's 147
// candidates to a reading list. These assertions exist because a screen that quietly stops failing
// OPEN would shrink the reading list and read as progress.

import { describe, it, expect } from 'vitest';
import { classifyScope, subjectHits, funnel, buildReadingList } from '../classify.mjs';

describe('§RPUC-SUPERSESSION — SCREEN 1, instrument scope', () => {
    it('recognises a Normes urbanístiques modification as general-normative', () => {
        expect(classifyScope(
            'Modificació de les Normes urbanístiques del Pla general metropolità per a la modificació '
            + 'de les alçades reguladores en el tipus d\'ordenació segons alineació de vial',
        )).toBe('general-normative');
    });

    it('recognises a delimited àmbit as site-specific', () => {
        expect(classifyScope(
            'Modificació del Pla general metropolità a l\'àmbit delimitat pel passeig de Maragall i '
            + 'els carrers de Ramon Albó i Prat d\'en Roquer',
        )).toBe('site-specific');
    });

    // THE LOAD-BEARING ONE. A title that matches neither marker MUST reach the reading list. If this
    // ever returns 'site-specific', the screen has stopped failing open and starts hiding candidates.
    it('FAILS OPEN — an unrecognised title is AMBIGUOUS, never set aside', () => {
        expect(classifyScope('Modificació del Pla general metropolità de coses no reconegudes')).toBe('AMBIGUOUS');
        expect(classifyScope('')).toBe('AMBIGUOUS');
        expect(classifyScope(null)).toBe('AMBIGUOUS');
    });
});

describe('§RPUC-SUPERSESSION — SCREEN 2, subject matter', () => {
    it('flags the subject matter of each target article', () => {
        expect(subjectHits('modificació de les alçades reguladores')).toContain('239 (alçada reguladora)');
        expect(subjectHits('regulació de la profunditat edificable')).toContain('327/328 (profunditat edificable)');
        expect(subjectHits('ordenació de l\'interior d\'illa')).toContain('327/328 (interior d\'illa)');
        expect(subjectHits('protecció del nucli antic')).toContain('320 (clau 12, nucli antic)');
    });

    it('returns [] for an off-subject title rather than a false hit', () => {
        expect(subjectHits('adequació de les infraestructures de telecomunicacions')).toEqual([]);
    });

    // A site-specific plan cannot rewrite an article but CAN disapply it inside its own àmbit, and
    // PRYZM (routing on the MUC clau) would never see that override. So a subject hit must survive
    // Screen 1 setting the instrument aside.
    it('a SUBJECT hit puts a SITE-SPECIFIC instrument on the reading list anyway', () => {
        const rows = buildReadingList([{
            codi: '1', nomComplet: 'X', data: '2015-01-01 00:00:00.0', vigencia: 'SI',
            instrumentca: 'Modificació de pla general d\'ordenació',
            tema: 'Modificació del Pla general metropolità a l\'àmbit del carrer Gran de Gràcia per a '
                + 'la modificació de les alçades reguladores',
        }]);
        expect(rows[0]!.scope).toBe('site-specific');
        expect(rows[0]!.mustRead).toBe(true);
    });

    it('a site-specific instrument with NO subject hit is set aside', () => {
        const rows = buildReadingList([{
            codi: '2', nomComplet: 'Y', data: '2015-01-01 00:00:00.0', vigencia: 'SI',
            instrumentca: 'Modificació de pla general d\'ordenació',
            tema: 'Modificació del Pla general metropolità a l\'àmbit del carrer Muntaner per a la '
                + 'creació d\'un equipament esportiu',
        }]);
        expect(rows[0]!.mustRead).toBe(false);
    });
});

describe('§RPUC-SUPERSESSION — the funnel', () => {
    const listing = [
        // Before the cut ⇒ cannot supersede the 2007-03-02 MPGM.
        { data: '2001-05-05 00:00:00.0', instrumentca: 'Modificació de pla general d\'ordenació', tema: 'a', codi: 'a' },
        // After the cut, PGM level ⇒ a candidate.
        { data: '2018-09-18 00:00:00.0', instrumentca: 'Modificació de pla general d\'ordenació', tema: 'b', codi: 'b' },
        { data: '2019-01-01 00:00:00.0', instrumentca: 'Modificació normes subsidiàries', tema: 'c', codi: 'c' },
        // After the cut but BELOW the general plan ⇒ develops it, cannot rewrite its articulat.
        { data: '2020-01-01 00:00:00.0', instrumentca: 'Pla especial urbanístic', tema: 'd', codi: 'd' },
        { data: '2020-01-01 00:00:00.0', instrumentca: 'Pla de millora urbana', tema: 'e', codi: 'e' },
    ];

    it('keeps only post-cut, PGM-level instruments', () => {
        const f = funnel(listing);
        expect(f.all).toBe(5);
        expect(f.postCut).toBe(4);
        expect(f.candidates.map((r) => r.codi)).toEqual(['b', 'c']);
    });

    // §CONTEXT-DATA-HONESTY: a missing listing is UNKNOWN handled as empty, never a crash that a
    // caller could mistake for "no candidates".
    it('treats an absent listing as zero candidates, not a throw', () => {
        expect(funnel(undefined).candidates).toEqual([]);
    });
});
