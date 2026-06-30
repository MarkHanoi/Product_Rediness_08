// Office-building pack — manifest + input-model canary tests.

import { describe, it, expect } from 'vitest';
import { OFFICE_BUILDING_MANIFEST } from '../src/manifest.js';
import { buildOfficeBuildingTypologyPack } from '../src/buildOfficeBuildingTypologyPack.js';
import { parseOfficeBuildingInput, OfficeBuildingInput } from '../src/inputModel.js';

describe('OFFICE_BUILDING_MANIFEST', () => {
    it('is a valid C50 manifest with the office brief fields', () => {
        expect(OFFICE_BUILDING_MANIFEST.id).toBe('office-building');
        expect(OFFICE_BUILDING_MANIFEST.category).toBe('workplace');
        const ids = OFFICE_BUILDING_MANIFEST.briefSchema?.fields.map((f) => f.id) ?? [];
        expect(ids).toContain('stories');
        expect(ids).toContain('radiusM');
        expect(ids).toContain('culture');
    });

    it('builds a registerable pack with bridge stages', () => {
        const pack = buildOfficeBuildingTypologyPack();
        expect(pack.manifest.id).toBe('office-building');
        expect(typeof pack.stages.generative).toBe('function');
        expect(typeof pack.stages.bimEmit).toBe('function');
    });
});

describe('parseOfficeBuildingInput', () => {
    it('applies defaults and parses a 40-storey brief', () => {
        const parsed = parseOfficeBuildingInput({ stories: 40, radiusM: 22 });
        expect(parsed.stories).toBe(40);
        expect(parsed.radiusM).toBe(22);
        expect(parsed.deskMode).toBe('bench');
        expect(parsed.culture).toBe('open-plan-first');
        expect(parsed.plateShape).toBe('circular');
    });

    it('rejects out-of-range stories', () => {
        expect(() => OfficeBuildingInput.parse({ stories: 99 })).toThrow();
    });
});
