// L3-γ-1 (2026-05-29) — Semantic edge typing pin tests.
//
// Locks in classifyEdge() so the seven semantic categories stay stable as the
// rules database evolves. Each case asserts the architectural intent of the
// classification rather than the implementation detail — when a future commit
// reshuffles priority rules, these tests catch the regression at the meaning
// level (e.g. "master↔ensuite must remain INTIMATE_ACCESS").

import { describe, expect, it } from 'vitest';
import { EDGE_TYPES, classifyEdge, type EdgeType } from '../src/workflows/apartmentLayout/tgl/edgeTypes.js';

describe('classifyEdge — semantic edge typing (L3-γ-1)', () => {
    it('exposes all seven enum members in stable order', () => {
        expect(EDGE_TYPES).toEqual([
            'SOCIAL_FLOW',
            'INTIMATE_ACCESS',
            'BUFFER',
            'SERVICE_ACCESS',
            'CEREMONIAL_THRESHOLD',
            'VISUAL_CONNECTION',
            'ACOUSTIC_SEPARATION',
        ]);
    });

    // ── CEREMONIAL_THRESHOLD: any edge touching the entrance hall ────────
    it('hall ↔ living (open) is CEREMONIAL_THRESHOLD (arrival reveal)', () => {
        expect(classifyEdge('hall', 'living', 'open')).toBe('CEREMONIAL_THRESHOLD');
    });
    it('hall ↔ corridor (door) is CEREMONIAL_THRESHOLD (zone gate)', () => {
        expect(classifyEdge('hall', 'corridor', 'door')).toBe('CEREMONIAL_THRESHOLD');
    });
    it('hall ↔ kitchen (door) is CEREMONIAL_THRESHOLD (hall wins over public-public)', () => {
        expect(classifyEdge('hall', 'kitchen', 'door')).toBe('CEREMONIAL_THRESHOLD');
    });

    // ── SOCIAL_FLOW: public ↔ public ─────────────────────────────────────
    it('living ↔ kitchen (door) is SOCIAL_FLOW', () => {
        expect(classifyEdge('living', 'kitchen', 'door')).toBe('SOCIAL_FLOW');
    });
    it('kitchen ↔ dining (door) is SOCIAL_FLOW', () => {
        expect(classifyEdge('kitchen', 'dining', 'door')).toBe('SOCIAL_FLOW');
    });

    // ── VISUAL_CONNECTION: open-plan, NO door, not via the hall ──────────
    it('living ↔ dining (open) is VISUAL_CONNECTION (open-plan lounge-diner)', () => {
        expect(classifyEdge('living', 'dining', 'open')).toBe('VISUAL_CONNECTION');
    });

    // ── INTIMATE_ACCESS: both private (privacy intent beats wet role) ────
    it('master ↔ ensuite (door) is INTIMATE_ACCESS (canonical case)', () => {
        // Privacy intent dominates: master and ensuite are both private rooms,
        // and the ensuite exists FOR the master. The hierarchical-privacy
        // relationship outweighs the fact that the ensuite carries plumbing.
        expect(classifyEdge('master', 'ensuite', 'door')).toBe('INTIMATE_ACCESS');
    });
    it('bedroom ↔ study (door) is INTIMATE_ACCESS (private ↔ private, no wet)', () => {
        expect(classifyEdge('bedroom', 'study', 'door')).toBe('INTIMATE_ACCESS');
    });

    // ── SERVICE_ACCESS: anything ↔ wet/service ───────────────────────────
    it('corridor ↔ bathroom (door) is SERVICE_ACCESS', () => {
        expect(classifyEdge('corridor', 'bathroom', 'door')).toBe('SERVICE_ACCESS');
    });
    it('corridor ↔ utility (door) is SERVICE_ACCESS (service-class)', () => {
        expect(classifyEdge('corridor', 'utility', 'door')).toBe('SERVICE_ACCESS');
    });
    it('kitchen ↔ wc (door) is SERVICE_ACCESS (wet-private wins over public-public)', () => {
        expect(classifyEdge('kitchen', 'wc', 'door')).toBe('SERVICE_ACCESS');
    });

    // ── BUFFER: circulation ↔ private ────────────────────────────────────
    it('corridor ↔ bedroom (door) is BUFFER (corridor IS the buffer)', () => {
        expect(classifyEdge('corridor', 'bedroom', 'door')).toBe('BUFFER');
    });
    it('corridor ↔ master (door) is BUFFER', () => {
        expect(classifyEdge('corridor', 'master', 'door')).toBe('BUFFER');
    });

    // ── Commutativity ────────────────────────────────────────────────────
    it('classifier is order-independent for (a, b)', () => {
        const pairs: Array<[Parameters<typeof classifyEdge>[0], Parameters<typeof classifyEdge>[1]]> = [
            ['hall', 'corridor'], ['living', 'kitchen'], ['master', 'ensuite'],
            ['corridor', 'bedroom'], ['kitchen', 'wc'], ['bedroom', 'study'],
            ['utility', 'corridor'], ['living', 'dining'],
        ];
        for (const [a, b] of pairs) {
            for (const via of ['open', 'door'] as const) {
                expect(classifyEdge(a, b, via)).toBe(classifyEdge(b, a, via));
            }
        }
    });

    // ── ACOUSTIC_SEPARATION is reserved — classifier MUST never return it ─
    it('classifyEdge never returns ACOUSTIC_SEPARATION (reserved for L3-γ-3)', () => {
        const allTypes: Parameters<typeof classifyEdge>[0][] = [
            'master', 'bedroom', 'living', 'kitchen', 'dining',
            'bathroom', 'ensuite', 'wc', 'hall', 'corridor', 'study', 'utility',
        ];
        const seen = new Set<EdgeType>();
        for (const a of allTypes) {
            for (const b of allTypes) {
                if (a === b) continue;
                seen.add(classifyEdge(a, b, 'door'));
                seen.add(classifyEdge(a, b, 'open'));
            }
        }
        expect(seen.has('ACOUSTIC_SEPARATION')).toBe(false);
    });
});
