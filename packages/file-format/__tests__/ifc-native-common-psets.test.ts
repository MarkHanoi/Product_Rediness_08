/**
 * L-8540 — natively-authored elements now carry a standard `Pset_*Common`.
 *
 * Before this, every reader's Common pset was a pure passthrough of
 * `ifcData.psetCommon`, which only exists on elements IMPORTED from an IFC file.
 * A model drawn entirely in PRYZM exported none of them — the property sets a
 * downstream checker looks for first.
 *
 * The second half of these assertions is the more important one: that we do NOT
 * emit properties we have no source for. A fabricated `IsExternal` is worse than
 * a missing one, because a consumer cannot tell it was invented.
 */

import { describe, it, expect } from 'vitest';

import {
    statusFromPhase,
    buildNativeCommonPset,
    resolveCommonPset,
} from '../src/export/ifc/readers/commonPsets';

const names = (p: { properties: { name: string }[] } | null) =>
    (p?.properties ?? []).map((x) => x.name).sort();
const valueOf = (p: { properties: { name: string; value: unknown }[] } | null, n: string) =>
    p?.properties.find((x) => x.name === n)?.value;

describe('statusFromPhase — PRYZM phase to PEnum_ElementStatus', () => {
    it('maps the three phases that have a correct target', () => {
        expect(statusFromPhase('New Construction')).toBe('NEW');
        expect(statusFromPhase('Existing')).toBe('EXISTING');
        expect(statusFromPhase('Demolition')).toBe('DEMOLISH');
    });

    it('refuses to map "Future" — TEMPORARY means temporary WORKS, not a future phase', () => {
        // Mapping it would be a lie carrying an enum's authority.
        expect(statusFromPhase('Future')).toBeUndefined();
    });

    it('returns undefined for absent or unknown phases', () => {
        expect(statusFromPhase(undefined)).toBeUndefined();
        expect(statusFromPhase('Nonsense')).toBeUndefined();
    });
});

describe('buildNativeCommonPset — what a native element can truthfully say', () => {
    it('always emits Status, defaulting to NEW for an authoring tool', () => {
        const p = buildNativeCommonPset('Pset_WallCommon', {});
        expect(names(p)).toEqual(['Status']);
        expect(valueOf(p, 'Status')).toBe('NEW');
    });

    it('carries the phase through to Status when the element has one', () => {
        const p = buildNativeCommonPset('Pset_WallCommon', { properties: { phase: 'Demolition' } });
        expect(valueOf(p, 'Status')).toBe('DEMOLISH');
    });

    it('emits Reference from systemTypeId, preferring the TYPE over the instance mark', () => {
        const p = buildNativeCommonPset('Pset_WallCommon', {
            systemTypeId: 'wallsys_ext_cavity',
            properties: { mark: 'W-01' },
        });
        expect(valueOf(p, 'Reference')).toBe('wallsys_ext_cavity');
    });

    it('falls back to the instance mark when there is no system type', () => {
        const p = buildNativeCommonPset('Pset_WallCommon', { properties: { mark: 'W-01' } });
        expect(valueOf(p, 'Reference')).toBe('W-01');
    });

    it('emits FireRating for a door or window, which really do carry one', () => {
        const p = buildNativeCommonPset('Pset_DoorCommon', { fireRating: 'FD30' });
        expect(valueOf(p, 'FireRating')).toBe('FD30');
    });

    it('⛔ does NOT invent the properties with no source in the PRYZM schema', () => {
        // IsExternal, LoadBearing, ThermalTransmittance, AcousticRating,
        // Combustible, Compartmentation, SurfaceSpreadOfFlame and
        // ExtendToStructure have NO field on WallData or the L0 Wall schema.
        // Emitting any of them would be fabrication with a standard's authority.
        const p = buildNativeCommonPset('Pset_WallCommon', {
            systemTypeId: 'wallsys_1',
            properties: { phase: 'New Construction' },
        });
        expect(names(p)).toEqual(['Reference', 'Status']);
        for (const forbidden of [
            'IsExternal', 'LoadBearing', 'ThermalTransmittance', 'AcousticRating',
            'Combustible', 'Compartmentation', 'SurfaceSpreadOfFlame', 'ExtendToStructure',
        ]) {
            expect(valueOf(p, forbidden), `${forbidden} was fabricated`).toBeUndefined();
        }
    });

    it('accepts extra properties the caller can vouch for, typed correctly', () => {
        const p = buildNativeCommonPset('Pset_WallCommon', {}, {
            IsExternal: true,
            NominalHeight: 2.7,
            LayerCount: 3,
            Note: 'n',
            Skipped: undefined,
        });
        const byName = Object.fromEntries((p?.properties ?? []).map((x) => [x.name, x.type]));
        expect(byName['IsExternal']).toBe('boolean');
        expect(byName['NominalHeight']).toBe('real');
        expect(byName['LayerCount']).toBe('integer');
        expect(byName['Note']).toBe('label');
        expect(byName['Skipped']).toBeUndefined();
    });
});

describe('resolveCommonPset — imported data wins, native fills the gaps', () => {
    it('returns the native pset when the element was not imported', () => {
        const p = resolveCommonPset('Pset_WallCommon', { properties: { phase: 'Existing' } });
        expect(valueOf(p, 'Status')).toBe('EXISTING');
    });

    it('an imported value WINS over the native one — losing it would be a round-trip regression', () => {
        const p = resolveCommonPset('Pset_WallCommon', {
            properties: { phase: 'New Construction' },
            ifcData: { psetCommon: { Status: 'EXISTING', IsExternal: true } },
        });
        expect(valueOf(p, 'Status')).toBe('EXISTING');
        expect(valueOf(p, 'IsExternal')).toBe(true);
    });

    it('native properties FILL GAPS the import left rather than being discarded', () => {
        // An import that carried only IsExternal still gains a Status.
        const p = resolveCommonPset('Pset_WallCommon', {
            systemTypeId: 'wallsys_1',
            ifcData: { psetCommon: { IsExternal: true } },
        });
        expect(names(p)).toEqual(['IsExternal', 'Reference', 'Status']);
        expect(valueOf(p, 'Status')).toBe('NEW');
    });

    it('drops non-scalar imported values rather than emitting an object', () => {
        const p = resolveCommonPset('Pset_WallCommon', {
            ifcData: { psetCommon: { Nested: { a: 1 }, Good: 'yes' } },
        });
        expect(valueOf(p, 'Nested')).toBeUndefined();
        expect(valueOf(p, 'Good')).toBe('yes');
    });

    it('an empty imported psetCommon behaves exactly like no import', () => {
        const withEmpty = resolveCommonPset('Pset_WallCommon', { ifcData: { psetCommon: {} } });
        const without = resolveCommonPset('Pset_WallCommon', {});
        expect(names(withEmpty)).toEqual(names(without));
    });
});
