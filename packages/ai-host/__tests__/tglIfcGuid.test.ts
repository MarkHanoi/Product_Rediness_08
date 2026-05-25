// TGL — deterministic IFC GlobalId tests (SPEC §3.4 / §6).

import { describe, expect, it } from 'vitest';
import { ifcGuid } from '../src/workflows/apartmentLayout/tgl/ifcGuid.js';

describe('ifcGuid (TGL §3.4)', () => {
    it('produces a 22-char IFC GlobalId from the IFC base64 alphabet', () => {
        const g = ifcGuid('seed-1', 'Space', 0, 'r0');
        expect(g).toHaveLength(22);
        expect(/^[0-9A-Za-z_$]{22}$/.test(g)).toBe(true);
    });

    it('is deterministic — same inputs give the same GUID', () => {
        expect(ifcGuid('s', 'Wall', 3, 'w3')).toBe(ifcGuid('s', 'Wall', 3, 'w3'));
    });

    it('is sensitive to every input (seed, role, index, geomKey)', () => {
        const base = ifcGuid('s', 'Wall', 3, 'w3');
        expect(ifcGuid('s2', 'Wall', 3, 'w3')).not.toBe(base);
        expect(ifcGuid('s', 'Door', 3, 'w3')).not.toBe(base);
        expect(ifcGuid('s', 'Wall', 4, 'w3')).not.toBe(base);
        expect(ifcGuid('s', 'Wall', 3, 'w4')).not.toBe(base);
    });

    it('is collision-free across a realistic node count', () => {
        const set = new Set<string>();
        for (let i = 0; i < 500; i++) set.add(ifcGuid('seed', 'Space', i, `r${i}`));
        expect(set.size).toBe(500);
    });
});
