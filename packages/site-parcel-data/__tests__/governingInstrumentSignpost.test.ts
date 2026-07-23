// L-590h §6 — THE GOVERNING-INSTRUMENT SIGNPOST TIER.
//
// WHAT THESE TESTS GUARD
// ----------------------
// The signpost turns a blank derived-planning refusal into a cited pointer at the governing plan.
// Its two ways to be dangerous are both SILENT:
//   1. presenting a SUPERSEDED/annulled instrument as the one that governs (the L-590c §10.4 stale-
//      index failure — OUR failure once we assert it), and
//   2. collapsing "in-force not confirmed" into "in force" (§CONTEXT-DATA-HONESTY: a missing field
//      is not a positive fact).
// So the tests below assert the STANDING derivation and the `citableAsGoverning` gate directly, on
// register payloads mirroring the real RPUC `detall` shape (incl. the real expedient 110061), and
// pin the honesty properties: determinism, no-throw on partial input, and never fabricating a date.

import { describe, it, expect } from 'vitest';
import {
    buildGoverningInstrumentSignpost,
    type RegisterInstrumentDetail,
} from '../src/rulepacks/governingInstrumentSignpost.js';

// A faithful reduction of a real RPUC `detall?codiExpedient=110061` payload (Congrés Eucarístic Pla
// parcial, `L-590e` §4.3 / §CONTEXT-DATA-HONESTY): note `vigencia:null` in `detall` while the list
// row carries "SI", and the initial archival `Alta` assentament flagged `vigent:false`.
const DETALL_110061: RegisterInstrumentDetail = {
    codi: '110061',
    codintExp: 110061,
    municipi: 'Barcelona',
    tema: 'MODIF. ALINEACIONS I ORDENACIÓ ILLES VIVENDES CONGRÉS EUCARÍSTIC',
    nomComplet: '1955 / 000011 / B',
    tipologiaCA: "Pla parcial d'ordenació",
    vigencia: null,
    dataAprovacio: '1956-07-16',
    dataPublicacio: '1956-07-23',
    assentaments: [
        { tipusAssentament: 'Alta', comentari: 'Assentament inicial', vigent: false },
    ],
    documents: [
        { idDocument: 72016, nomDocument: 'dun.pdf', baixa: null, recurs: null },
        { idDocument: 72015, nomDocument: 'CU-AD_Aprovació definitiva.pdf', baixa: null, recurs: null },
    ],
};

describe('L-590h §6 — the signpost derives IDENTITY from the register payload', () => {
    it('extracts type, name, dates, expedient code, and ordered document links', () => {
        const s = buildGoverningInstrumentSignpost(DETALL_110061, { vigenciaHint: 'SI' });
        expect(s.found).toBe(true);
        expect(s.instrumentType).toBe("Pla parcial d'ordenació");
        expect(s.instrumentName).toContain('CONGRÉS EUCARÍSTIC');
        expect(s.approvalDate).toBe('1956-07-16');
        expect(s.publicationDate).toBe('1956-07-23');
        expect(s.expedientCode).toBe('110061');
        // documents ordered by idDocument (determinism), not payload order (72016 before 72015).
        expect(s.documents.map((d) => d.idDocument)).toEqual([72015, 72016]);
        expect(s.confidence).toBe('index-cited');
    });

    it('builds the RPUC inline-download URL for each document', () => {
        const s = buildGoverningInstrumentSignpost(DETALL_110061, { vigenciaHint: 'SI' });
        const doc = s.documents.find((d) => d.idDocument === 72016)!;
        expect(doc.url).toBe(
            'https://dtes.gencat.cat/RPUC-portal/rest/consulta/documents' +
                '?documentId=72016&downloadType=inline&idioma=ca',
        );
    });

    it('honours a custom document endpoint base + query params', () => {
        const s = buildGoverningInstrumentSignpost(DETALL_110061, {
            documentEndpointBase: 'https://example.test/reg/',
            idioma: 'es',
            downloadType: 'attachment',
        });
        expect(s.documents[0]!.url).toBe(
            'https://example.test/reg/documents?documentId=72015&downloadType=attachment&idioma=es',
        );
    });
});

describe('L-590h §6 — the ANNULMENT / SUPERSESSION guard (L-590c §10.4)', () => {
    it('confirms in-force from the list `vigencia` hint when `detall.vigencia` is null', () => {
        // The real 110061 shape: detall omits vigencia, basica carries "SI".
        const s = buildGoverningInstrumentSignpost(DETALL_110061, { vigenciaHint: 'SI' });
        expect(s.standing).toBe('in-force');
        expect(s.citableAsGoverning).toBe(true);
        expect(s.citation).toContain('governed by');
    });

    it('does NOT confirm in-force from an archival `Alta vigent:false` — that is not a derogation', () => {
        // Without a vigencia hint, the payload states no standing; the initial `Alta` entry's
        // `vigent:false` must NOT be read as a supersession (it is an audit-trail artefact).
        const s = buildGoverningInstrumentSignpost(DETALL_110061);
        expect(s.standing).toBe('standing-unknown');
        expect(s.citableAsGoverning).toBe(false);
        expect(s.citation).toContain('could not be confirmed');
        expect(s.notes.join(' ')).toContain('annulment guard');
    });

    it('marks an explicitly not-in-force instrument as superseded and refuses to cite it', () => {
        const s = buildGoverningInstrumentSignpost({ ...DETALL_110061, vigencia: 'NO' });
        expect(s.standing).toBe('superseded-or-withdrawn');
        expect(s.citableAsGoverning).toBe(false);
        expect(s.citation).toContain('NOT in force');
    });

    it('treats a recorded `Baixa` assentament as supersession when no vigencia is stated', () => {
        const s = buildGoverningInstrumentSignpost({
            ...DETALL_110061,
            vigencia: null,
            assentaments: [
                { tipusAssentament: 'Alta', vigent: true },
                { tipusAssentament: 'Baixa', comentari: 'Derogat per PGM', vigent: false },
            ],
        });
        expect(s.standing).toBe('superseded-or-withdrawn');
        expect(s.citableAsGoverning).toBe(false);
    });

    it('an explicit in-force flag (V/A = vigent/amended) still governs despite a Baixa in history', () => {
        const s = buildGoverningInstrumentSignpost({
            ...DETALL_110061,
            vigencia: 'V/A',
            assentaments: [{ tipusAssentament: 'Baixa', vigent: false }],
        });
        expect(s.standing).toBe('in-force');
        expect(s.citableAsGoverning).toBe(true);
    });

    it('flags withdrawn (baixa) documents without dropping them', () => {
        const s = buildGoverningInstrumentSignpost(
            {
                ...DETALL_110061,
                documents: [
                    { idDocument: 72016, nomDocument: 'dun.pdf', baixa: null },
                    { idDocument: 72020, nomDocument: 'old.pdf', baixa: '2019-01-01' },
                ],
            },
            { vigenciaHint: 'SI' },
        );
        expect(s.documents.find((d) => d.idDocument === 72020)!.withdrawn).toBe(true);
        expect(s.notes.join(' ')).toContain('withdrawn');
    });
});

describe('L-590h §6 — honesty invariants (failure ≠ empty, no fabrication, determinism)', () => {
    it('never fabricates an approval date and says so when it is missing', () => {
        const s = buildGoverningInstrumentSignpost(
            { ...DETALL_110061, dataAprovacio: null },
            { vigenciaHint: 'SI' },
        );
        expect(s.approvalDate).toBeNull();
        expect(s.citation).toContain('approval date not recorded');
        expect(s.notes.join(' ')).toContain('No definitive-approval date');
    });

    it('returns a STATED absence (found:false), not a throw, on an empty/missing payload', () => {
        expect(buildGoverningInstrumentSignpost(null).found).toBe(false);
        expect(buildGoverningInstrumentSignpost(undefined).found).toBe(false);
        expect(buildGoverningInstrumentSignpost({}).found).toBe(false);
        const empty = buildGoverningInstrumentSignpost({});
        expect(empty.citableAsGoverning).toBe(false);
        expect(empty.documents).toEqual([]);
    });

    it('carries no buildable field — it is an index pointer, never an envelope', () => {
        const s = buildGoverningInstrumentSignpost(DETALL_110061, { vigenciaHint: 'SI' });
        // The signpost object must not smuggle a numeric envelope field.
        for (const k of ['height', 'far', 'edificabilitat', 'occupation', 'setback', 'insetPolygon']) {
            expect(k in (s as unknown as Record<string, unknown>)).toBe(false);
        }
        expect(s.confidence).toBe('index-cited');
    });

    it('is deterministic — same payload yields a byte-identical signpost', () => {
        const a = buildGoverningInstrumentSignpost(DETALL_110061, { vigenciaHint: 'SI' });
        const b = buildGoverningInstrumentSignpost(DETALL_110061, { vigenciaHint: 'SI' });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('tolerates malformed documents (missing/dup ids) without throwing', () => {
        const s = buildGoverningInstrumentSignpost(
            {
                ...DETALL_110061,
                documents: [
                    { idDocument: 72016, nomDocument: 'a.pdf' },
                    { idDocument: 72016, nomDocument: 'dup.pdf' }, // duplicate id → deduped
                    // deliberately malformed entries the pure fn must survive:
                    { nomDocument: 'no-id.pdf' } as unknown as { idDocument: number },
                ],
            },
            { vigenciaHint: 'SI' },
        );
        expect(s.documents.map((d) => d.idDocument)).toEqual([72016]);
    });
});
