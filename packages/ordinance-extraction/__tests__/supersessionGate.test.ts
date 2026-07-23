import { describe, expect, it } from 'vitest';
import { supersessionGate } from '../src/gates/supersessionGate.js';

describe('supersessionGate (Stage 0)', () => {
    it('passes a VIGENT document for extraction', () => {
        const r = supersessionGate({ vigencia: 'VIGENT' });
        expect(r.status).toBe('vigent');
        expect(r.shouldExtract).toBe(true);
        expect(r.caveat).toBeNull();
    });

    it('accepts vigencia stems case-insensitively (Vigente)', () => {
        expect(supersessionGate({ vigencia: 'Vigente' }).status).toBe('vigent');
    });

    it('blocks a DEROGAT document — never fetched for extraction', () => {
        const r = supersessionGate({ vigencia: 'DEROGAT' });
        expect(r.status).toBe('derogated');
        expect(r.shouldExtract).toBe(false);
    });

    it('blocks an EXP_DEROG expedient even if vigencia is silent', () => {
        const r = supersessionGate({ expDerogated: true });
        expect(r.status).toBe('derogated');
        expect(r.shouldExtract).toBe(false);
        expect(r.detail).toContain('EXP_DEROG');
    });

    it('blocks a TANCAMENT_OUT / closed-out expedient', () => {
        expect(supersessionGate({ closedOut: true }).shouldExtract).toBe(false);
    });

    it('blocks a document superseded by a later modificación', () => {
        const r = supersessionGate({ vigencia: 'VIGENT', supersededByLater: true });
        expect(r.status).toBe('derogated');
        expect(r.shouldExtract).toBe(false);
    });

    it('extracts an under-appeal document WITH a caveat', () => {
        const r = supersessionGate({ vigencia: 'VIGENT', underAppeal: true });
        expect(r.status).toBe('under-appeal');
        expect(r.shouldExtract).toBe(true);
        expect(r.caveat).toContain('appeal');
    });

    it('derogation OUTRANKS under-appeal (dead beats litigated)', () => {
        const r = supersessionGate({ expDerogated: true, underAppeal: true });
        expect(r.status).toBe('derogated');
        expect(r.shouldExtract).toBe(false);
    });

    it('treats an unconfirmed in-force status as UNKNOWN and does NOT extract', () => {
        expect(supersessionGate({}).status).toBe('unknown');
        expect(supersessionGate({}).shouldExtract).toBe(false);
        expect(supersessionGate({ vigencia: '   ' }).shouldExtract).toBe(false);
        expect(supersessionGate({ vigencia: 'en tramitació' }).status).toBe('unknown');
    });
});
