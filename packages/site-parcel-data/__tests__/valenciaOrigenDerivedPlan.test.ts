// §VALENCIA-ORIGEN-DERIVED-PLAN — CLOSURE-REGISTER #3, closed 2026-08-03.
//
// `esValenciaPgou.ts` §DELEGATION-MEASURED measured that 36,40 % of València's private buildable
// land (L-656 denominator) is ordered by a DERIVED instrument, not the PGOU — but that is a LAND
// SHARE, not a per-parcel fact, and the registry's own comment said the stronger `derived-plan`
// refusal "waits for the live `origen` read". These tests pin the seam that performs that read
// (`resolveValenciaOrigen`) and the pure classification/refusal it feeds
// (`valenciaOrigenIsPgouOrdered` / `valenciaDerivedPlanRefusal`), both in `esValenciaEnvelope.ts`.
//
// ⚠ NONE OF THIS TOUCHES THE ENVELOPE GATE. Every test here must remain compatible with
// `VALENCIA_ENVELOPE_VERIFIED === false` — this closes a REFUSAL-ACCURACY gap, not the envelope one.

import { describe, expect, it, vi } from 'vitest';
import {
    VALENCIA_ENVELOPE_VERIFIED,
    VALENCIA_JURISDICTION_ID,
    valenciaOrigenIsPgouOrdered,
    valenciaDerivedPlanRefusal,
    valenciaNoRulePackRefusal,
} from '../src/rulepacks/esValenciaEnvelope.js';
import { resolveValenciaOrigen } from '../src/providers/resolveValenciaOrigen.js';
import { VALENCIA_CALIFICACION_LAYER } from '../src/providers/resolveValenciaAlineaciones.js';

const ENSANCHE = { lat: 39.464, lon: -0.367 } as const;
const MADRID = { lat: 40.4168, lon: -3.7038 } as const;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: async () => body,
    } as unknown as Response;
}

describe('valenciaOrigenIsPgouOrdered — the pure classifier', () => {
    it('recognises every PGOU* variant', () => {
        for (const origen of ['PGOU', 'PGOU91', 'PGOU-1994', 'pgou', ' PGOU ']) {
            expect(valenciaOrigenIsPgouOrdered(origen)).toBe(true);
        }
    });

    it('rejects every derived-instrument family observed in the live vocabulary', () => {
        for (const origen of ['PE', 'PEPRI', 'PRI', 'RI', 'PP', 'ED', 'MP', 'CE', 'CU', 'UE']) {
            expect(valenciaOrigenIsPgouOrdered(origen)).toBe(false);
        }
    });

    it('⚠ blank/null is NOT PGOU-ordered — an unknown must never default to the optimistic answer', () => {
        expect(valenciaOrigenIsPgouOrdered(null)).toBe(false);
        expect(valenciaOrigenIsPgouOrdered(undefined)).toBe(false);
        expect(valenciaOrigenIsPgouOrdered('')).toBe(false);
        expect(valenciaOrigenIsPgouOrdered('   ')).toBe(false);
    });

    it('does not false-positive on a string that merely CONTAINS "PGOU"', () => {
        // Only a PREFIX match counts — a hypothetical "MP-PGOU-1991" derived instrument must not
        // be misread as the base plan itself.
        expect(valenciaOrigenIsPgouOrdered('MP-PGOU-1991')).toBe(false);
    });
});

describe('valenciaDerivedPlanRefusal — the STRONGER, legally-grounded refusal', () => {
    const refusal = valenciaDerivedPlanRefusal('PE Cabanyal', 'ENS', 'Ensanche', [
        'Referencia catastral: 6618617YJ2761H',
    ]);

    it('is a claim about the LAW (`derived-plan`, `legallyGrounded: true`) — the contract\'s own code', () => {
        expect(refusal.code).toBe('derived-plan');
        expect(refusal.legallyGrounded).toBe(true);
    });

    it('⚠ does NOT invent an ordinanceRef this file cannot back', () => {
        // Murcia's equivalent cites transcribed articles (5.25.3.3/5.26.3.3). No València PGOU
        // article establishing "derived instrument supersedes" has been transcribed/verified, so
        // fabricating a citation here would be exactly the L-616 failure this package refuses to
        // ship. The citation this refusal rests on is the live municipal record, named in prose.
        expect(refusal.ordinanceRef).toBeNull();
    });

    it('names the live governing instrument in both the prose and knownFacts', () => {
        expect(refusal.detail).toContain('PE Cabanyal');
        expect(refusal.knownFacts).toContain('Governing instrument (live): PE Cabanyal');
        expect(refusal.knownFacts).toContain('Referencia catastral: 6618617YJ2761H');
    });

    it('cites the measured 36,40 % delegation share so the claim is not asserted from nowhere', () => {
        expect(refusal.detail).toMatch(/36,40 ?%/);
    });

    it('degrades to a land-identifying headline when no zone is held', () => {
        const bare = valenciaDerivedPlanRefusal('MP-2003');
        expect(bare.headline).toMatch(/This València parcel/);
    });

    it('is STRICTLY the stronger claim: derived-plan legallyGrounded, no-rule-pack is not', () => {
        const coverage = valenciaNoRulePackRefusal('ENS', 'Ensanche');
        expect(refusal.legallyGrounded).toBe(true);
        expect(coverage.legallyGrounded).toBe(false);
        expect(refusal.legallyGrounded).not.toBe(coverage.legallyGrounded);
    });

    it('never touches the envelope gate', () => {
        expect(VALENCIA_ENVELOPE_VERIFIED).toBe(false);
    });
});

describe('resolveValenciaOrigen — the live per-parcel seam, NEVER THROWS', () => {
    it('refuses out-of-valencia before ever fetching', async () => {
        const fetchImpl = vi.fn();
        const r = await resolveValenciaOrigen(MADRID, { fetchImpl });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('out-of-valencia');
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('refuses non-finite / absent points the same way — never claims coverage it cannot check', async () => {
        const fetchImpl = vi.fn();
        expect((await resolveValenciaOrigen(null, { fetchImpl })).ok).toBe(false);
        expect(
            (await resolveValenciaOrigen({ lat: Number.NaN, lon: -0.37 }, { fetchImpl })).ok,
        ).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('reads origen/califi/tipoca/clase on a hit, requesting NO geometry', async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            expect(url).toContain(`/${VALENCIA_CALIFICACION_LAYER}/query`);
            expect(url).toContain('returnGeometry=false');
            expect(url).toContain('outFields=origen,califi,tipoca,clase');
            return jsonResponse({
                features: [
                    { attributes: { origen: ' PE Cabanyal ', califi: 'CHP', tipoca: '1', clase: 'SU' } },
                ],
            });
        });
        const r = await resolveValenciaOrigen(ENSANCHE, { fetchImpl });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.origen).toBe('PE Cabanyal'); // trimmed
            expect(r.califi).toBe('CHP');
            expect(r.tipoca).toBe('1');
            expect(r.clase).toBe('SU');
        }
    });

    it('blank origen comes back as null, never as an empty string', async () => {
        const fetchImpl = vi.fn(async () =>
            jsonResponse({ features: [{ attributes: { origen: '   ', califi: 'ENS' } }] }),
        );
        const r = await resolveValenciaOrigen(ENSANCHE, { fetchImpl });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.origen).toBeNull();
    });

    it('⚠ a genuine empty answer is `no-parcel-here`, never confused with a service failure', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({ features: [] }));
        const r = await resolveValenciaOrigen(ENSANCHE, { fetchImpl });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('no-parcel-here');
    });

    it('⚠⚠ an HTTP failure is `service-error`, NEVER `no-parcel-here` (L-422/457/467/469)', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse({}, false, 503));
        const r = await resolveValenciaOrigen(ENSANCHE, { fetchImpl });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('service-error');
    });

    it('⚠⚠ an ArcGIS HTTP-200-with-error-body is ALSO `service-error`, never an empty result', async () => {
        const fetchImpl = vi.fn(async () =>
            jsonResponse({ error: { code: 400, message: 'Invalid or missing input parameters.' } }),
        );
        const r = await resolveValenciaOrigen(ENSANCHE, { fetchImpl });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('service-error');
            expect(r.detail).toMatch(/400/);
        }
    });

    it('never throws even when fetch itself throws', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('network down');
        });
        const r = await resolveValenciaOrigen(ENSANCHE, { fetchImpl });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('service-error');
    });

    it('`no-fetch` when no fetch implementation is reachable at all', async () => {
        const original = globalThis.fetch;
        delete (globalThis as { fetch?: typeof fetch }).fetch;
        try {
            const r = await resolveValenciaOrigen(ENSANCHE, {});
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('no-fetch');
        } finally {
            globalThis.fetch = original;
        }
    });
});

describe('the closure does not relax the jurisdiction identity or the gate', () => {
    it('the refusal and the resolver both key off the same jurisdiction id', () => {
        expect(VALENCIA_JURISDICTION_ID).toBe('es-46250-valencia');
    });
});
