/**
 * Lod200FixtureCatalogue.test.ts — §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19)
 *
 * The gate that makes a future bad preset fail the build.
 *
 * ⭐ THE TWO ARMS THAT MATTER, and why each is written the way it is:
 *
 *   ARM A — every shipped row resolves its `materialId` against the LIVE
 *           `MATERIAL_CATALOG`. It imports the real catalogue and NEVER a stub or
 *           a fake: a fake built from the same header cannot falsify the header,
 *           and a stubbed catalogue would pass for a row naming a material that
 *           does not exist — which is the entire failure the arm exists to catch.
 *
 *   ARM B — every row lands in a plausible lm/W band FOR ITS CLASS. Efficacy is
 *           the honesty check on the whole photometric set: a 6 W downlight rated
 *           at 3000 lm is 500 lm/W, roughly twice the theoretical maximum for
 *           white light and about four times any product on sale. It is not a
 *           fixture, it is a typo, and it now fails the build instead of shipping
 *           into a schedule.
 *
 * ⚠ ADVISORY, NOT COMPLIANCE. Nothing in this repository evaluates a guard,
 * energy-code or life-safety rule for any element family (measured 2026-08-19).
 * These bands are plausibility bounds on a FIXTURE; a passing test is not
 * conformance with EN 12464-1, EN 1838, IEC 60529 or any other standard, and must
 * never be reported as such.
 */

import { describe, it, expect } from 'vitest';
// ⭐ THE LIVE catalogue — the whole point of ARM A. Do not replace with a fixture.
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';
import {
    LOD200_FIXTURE_ROWS,
    LOD200_FIXTURE_IDS,
    LOD200_FLOOR_MOUNTED_IDS,
    EFFICACY_BANDS,
    lod200Row,
    lod200BodyColor,
    lod200BodyAppearance,
    reachForLumens,
    formForFace,
    efficacyLmPerW,
    efficacyClassFor,
    minIpForLocation,
    photometryRowsForLod200,
    lod200TypeDefinitionRows,
} from './Lod200FixtureCatalogue.js';
import {
    LIGHTING_FIXTURE_PHOTOMETRY,
    photometryForFixture,
    constructionFormFor,
    sceneIntensityFor,
} from './FixturePhotometry.js';
import { FLOOR_MOUNTED_FIXTURES } from './LightingTypes.js';

describe('§FEAT-LOD200-LUMINAIRES — the founder ask, measured', () => {
    it('ships exactly TWENTY LOD-200 families', () => {
        expect(LOD200_FIXTURE_ROWS).toHaveLength(20);
    });

    it('every id is unique, snake_case and stable (they are PERSISTED)', () => {
        const ids = LOD200_FIXTURE_ROWS.map((r) => r.id);
        expect(new Set(ids).size, 'duplicate fixture id').toBe(ids.length);
        for (const id of ids) {
            expect(id, `${id} is not snake_case`).toMatch(/^[a-z][a-z0-9_]*$/);
        }
    });

    it('no LOD-200 id collides with one of the twelve pre-existing named families', () => {
        const preExisting = [
            'downlight', 'pendant', 'linear_led', 'pendant_pebble',
            'pendant_ceramic_bell', 'pendant_conical', 'pendant_cluster',
            'floor_wood_post', 'floor_arc_brass', 'floor_tripod_black',
            'table_terracotta', 'mirror_light',
        ];
        for (const id of LOD200_FIXTURE_IDS) {
            expect(preExisting, `${id} shadows a named family`).not.toContain(id);
        }
    });
});

// ── ARM A ───────────────────────────────────────────────────────────────────

describe('ARM A — every shipped type resolves its materialId against the LIVE catalogue', () => {
    it('the catalogue under test is the REAL one, not a stub', () => {
        // If this ever fails, someone has swapped in a fixture and Arm A proves
        // nothing. Asserted explicitly so the substitution cannot be silent.
        expect(MATERIAL_CATALOG.length).toBeGreaterThan(100);
        expect(MATERIAL_CATALOG.some((m) => m.id === 'aluminium-powder-coated-white')).toBe(true);
    });

    it('every row names a material that EXISTS — no row invents one', () => {
        const known = new Set(MATERIAL_CATALOG.map((m) => m.id));
        for (const r of LOD200_FIXTURE_ROWS) {
            expect(known.has(r.bodyMaterialId), `${r.id} → unknown material "${r.bodyMaterialId}"`).toBe(true);
        }
    });

    it('every row resolves to a real colour AND a real PBR appearance', () => {
        for (const r of LOD200_FIXTURE_ROWS) {
            const c = lod200BodyColor(r.bodyMaterialId);
            expect(c, `${r.id} body colour`).toMatch(/^#[0-9a-fA-F]{6}$/);
            const look = lod200BodyAppearance(r.bodyMaterialId);
            expect(look, `${r.id} appearance`).not.toBeNull();
            expect(look!.metalness).toBeGreaterThanOrEqual(0);
            expect(look!.metalness).toBeLessThanOrEqual(1);
            expect(look!.roughness).toBeGreaterThanOrEqual(0);
            expect(look!.roughness).toBeLessThanOrEqual(1);
        }
    });

    it('MINTS ZERO MATERIALS — every id is one the master catalogue already had', () => {
        // The ceiling, not a preference: one circular gesture once minted 93
        // materials and the device died around 100. This asserts the LOD-200 set
        // reuses the master vocabulary and extends it by nothing.
        const used = new Set(LOD200_FIXTURE_ROWS.map((r) => r.bodyMaterialId));
        const known = new Set(MATERIAL_CATALOG.map((m) => m.id));
        const minted = [...used].filter((id) => !known.has(id));
        expect(minted, `LOD-200 minted materials: ${minted.join(', ')}`).toEqual([]);
        expect(used.size).toBeLessThanOrEqual(LOD200_FIXTURE_ROWS.length);
    });

    it('an unknown material id returns null rather than inventing a colour', () => {
        expect(lod200BodyColor('not-a-real-material-id')).toBeNull();
        expect(lod200BodyAppearance('not-a-real-material-id')).toBeNull();
    });

    it('NO row carries a hand-typed hex anywhere — the row has no colour field at all', () => {
        // A hex authored beside a materialId resolves FIRST in every builder here,
        // making the material a silent no-op the UI still reports as applied.
        for (const r of LOD200_FIXTURE_ROWS) {
            for (const [k, v] of Object.entries(r)) {
                if (typeof v === 'string') {
                    expect(v, `${r.id}.${k} looks like a hex colour`).not.toMatch(/^#?[0-9a-fA-F]{6}$/);
                }
            }
        }
    });
});

// ── ARM B ───────────────────────────────────────────────────────────────────

describe('ARM B — every shipped type lands in a plausible lm/W band', () => {
    it('efficacy is inside its DERIVED class band', () => {
        for (const r of LOD200_FIXTURE_ROWS) {
            const cls = efficacyClassFor(r);
            const [lo, hi] = EFFICACY_BANDS[cls];
            const e = efficacyLmPerW(r);
            expect(e, `${r.id}: ${r.lumens} lm / ${r.watts} W = ${e.toFixed(1)} lm/W, outside ${cls} band ${lo}–${hi}`)
                .toBeGreaterThanOrEqual(lo);
            expect(e, `${r.id}: ${e.toFixed(1)} lm/W exceeds ${cls} band ceiling ${hi}`)
                .toBeLessThanOrEqual(hi);
        }
    });

    it('the band is DERIVED, so a row cannot pick the lenient one for itself', () => {
        // efficacyClassFor reads only construction facts; no row authors its class.
        for (const r of LOD200_FIXTURE_ROWS) {
            expect(Object.prototype.hasOwnProperty.call(r, 'efficacyClass')).toBe(false);
        }
        expect(efficacyClassFor(lod200Row('exit_sign')!)).toBe('signalling');
        expect(efficacyClassFor(lod200Row('emergency_downlight')!)).toBe('signalling');
        expect(efficacyClassFor(lod200Row('chandelier_decorative')!)).toBe('decorative');
        expect(efficacyClassFor(lod200Row('step_marker_light')!)).toBe('miniature');
        expect(efficacyClassFor(lod200Row('recessed_downlight')!)).toBe('architectural');
    });

    it('CATCHES THE TYPO IT EXISTS FOR — a 6 W downlight at 3000 lm fails', () => {
        const typo = { ...lod200Row('recessed_downlight')!, lumens: 3000, watts: 6 };
        const [lo, hi] = EFFICACY_BANDS[efficacyClassFor(typo)];
        const e = efficacyLmPerW(typo);
        expect(e).toBeGreaterThan(hi);
        expect(e >= lo && e <= hi, 'the band must REJECT 500 lm/W').toBe(false);
    });

    it('every wattage and lumen output is positive and finite', () => {
        for (const r of LOD200_FIXTURE_ROWS) {
            expect(r.lumens, r.id).toBeGreaterThan(0);
            expect(r.watts, r.id).toBeGreaterThan(0);
            expect(Number.isFinite(r.lumens * r.watts), r.id).toBe(true);
        }
    });
});

// ── The rest of the photometric set ─────────────────────────────────────────

describe('§FEAT-LOD200-LUMINAIRES — the rest of the set is architecturally coherent', () => {
    it('CCT is a real lamp colour temperature', () => {
        for (const r of LOD200_FIXTURE_ROWS) {
            expect(r.kelvin, `${r.id} kelvin`).toBeGreaterThanOrEqual(2200);
            expect(r.kelvin, `${r.id} kelvin`).toBeLessThanOrEqual(6500);
        }
    });

    it('CRI is a real Ra value, and the accent/gallery fixture is the highest', () => {
        for (const r of LOD200_FIXTURE_ROWS) {
            expect(r.cri, `${r.id} CRI`).toBeGreaterThanOrEqual(70);
            expect(r.cri, `${r.id} CRI`).toBeLessThanOrEqual(100);
        }
        // A track head lights art and merchandise; it must not render worse than a
        // service wall pack. This is the axis a copied-across CRI would flatten.
        expect(lod200Row('track_head')!.cri)
            .toBeGreaterThan(lod200Row('exterior_wall_pack')!.cri);
    });

    it('beam angle is a real optic, and a spot is genuinely narrower than a washer', () => {
        for (const r of LOD200_FIXTURE_ROWS) {
            expect(r.beamAngleDeg, `${r.id} beam`).toBeGreaterThan(0);
            expect(r.beamAngleDeg, `${r.id} beam`).toBeLessThanOrEqual(360);
        }
        // ⭐ A spot and a wall washer differ by EXACTLY this field. If it were copied
        // across, both would light the same way and the two rows would be one row.
        expect(lod200Row('adjustable_downlight')!.beamAngleDeg)
            .toBeLessThan(lod200Row('wall_washer_recessed')!.beamAngleDeg);
        expect(lod200Row('flood_spot')!.beamAngleDeg)
            .toBeLessThan(lod200Row('exterior_wall_pack')!.beamAngleDeg);
    });

    it('IP rating meets the DERIVED minimum for the location — the field most likely to be silently wrong', () => {
        for (const r of LOD200_FIXTURE_ROWS) {
            const min = minIpForLocation(r.location);
            expect(r.ipRating, `${r.id} is ${r.location} but only IP${r.ipRating} (needs ≥ IP${min})`)
                .toBeGreaterThanOrEqual(min);
        }
        // Named explicitly: an IP20 bollard is the exact defect this arm catches.
        expect(lod200Row('bollard_light')!.ipRating).toBeGreaterThanOrEqual(65);
        expect(lod200Row('step_marker_light')!.ipRating).toBeGreaterThanOrEqual(65);
        expect(lod200Row('flood_spot')!.ipRating).toBeGreaterThanOrEqual(65);
    });

    it('mounting is coherent with seating — the placement bug this shape removes', () => {
        for (const r of LOD200_FIXTURE_ROWS) {
            expect(['ceiling', 'wall', 'floor', 'table']).toContain(r.mount);
            // The DERIVED floor set and the authored mount cannot disagree.
            expect(LOD200_FLOOR_MOUNTED_IDS.includes(r.id as never), `${r.id} mount/seating mismatch`)
                .toBe(r.mount === 'floor');
            // …and the derived set must actually reach the set the tool reads.
            expect(FLOOR_MOUNTED_FIXTURES.has(r.id as never), `${r.id} not seated by the tool`)
                .toBe(r.mount === 'floor');
        }
        expect(LOD200_FLOOR_MOUNTED_IDS).toContain('bollard_light');
    });
});

// ── Derivations ─────────────────────────────────────────────────────────────

describe('§FEAT-LOD200-LUMINAIRES — everything else is DERIVED, not authored', () => {
    it('reach falls out of lumens by the inverse-square rule, clamped', () => {
        expect(reachForLumens(900)).toBeCloseTo(6.0, 5);
        expect(reachForLumens(60)).toBe(2.5);       // clamped floor
        expect(reachForLumens(22000)).toBe(9);      // clamped ceiling
        // Brighter never reaches less far.
        const sorted = [...LOD200_FIXTURE_ROWS].sort((a, b) => a.lumens - b.lumens);
        for (let i = 1; i < sorted.length; i++) {
            expect(reachForLumens(sorted[i]!.lumens))
                .toBeGreaterThanOrEqual(reachForLumens(sorted[i - 1]!.lumens));
        }
    });

    it('optical form falls out of the face aspect ratio — a 1.5 m batten cannot be a point source', () => {
        expect(formForFace(1500, 60)).toBe('linear');
        expect(formForFace(600, 600)).toBe('point');
        const rows = photometryRowsForLod200();
        expect(rows.recessed_linear.form).toBe('linear');
        expect(rows.surface_linear.form).toBe('linear');
        expect(rows.cove_indirect.form).toBe('linear');
        expect(rows.undercabinet_strip.form).toBe('linear');
        expect(rows.linear_pendant.form).toBe('linear');
        expect(rows.troffer_panel.form).toBe('point');
        expect(rows.recessed_downlight.form).toBe('point');
    });

    it('suspension falls out of the drop', () => {
        const rows = photometryRowsForLod200();
        expect(rows.chandelier_decorative.suspended).toBe(true);
        expect(rows.linear_pendant.suspended).toBe(true);
        expect(rows.high_bay.suspended).toBe(true);
        expect(rows.recessed_downlight.suspended).toBeUndefined();
        expect(rows.troffer_panel.suspended).toBeUndefined();
    });

    it('the construction taxonomy classifies all twenty with NO new mapping table', () => {
        for (const id of LOD200_FIXTURE_IDS) {
            expect(['downlight', 'pendant', 'strip', 'wall-sconce'], id)
                .toContain(constructionFormFor(id));
        }
        expect(constructionFormFor('recessed_downlight')).toBe('downlight');
        expect(constructionFormFor('recessed_linear')).toBe('strip');
        expect(constructionFormFor('wall_sconce_up_down')).toBe('wall-sconce');
        expect(constructionFormFor('chandelier_decorative')).toBe('pendant');
    });

    it('KNOWN COARSENESS, recorded rather than hidden: the legacy 5-value enum cannot say "bollard"', () => {
        // `LightingKind` (packages/schemas) has five values and no exterior family, so
        // a floor-standing bollard degrades to 'pendant' by the SAME pre-existing rule
        // that already maps floor lamps there. This is a limit of the legacy schema
        // enum, not a misclassification introduced here — asserted so it is a recorded
        // fact rather than a surprise the next reader has to rediscover.
        expect(constructionFormFor('bollard_light')).toBe('pendant');
    });

    it('emergency is a DUTY, never a construction form', () => {
        // A maintained-emergency downlight is still a downlight.
        expect(constructionFormFor('emergency_downlight')).toBe('downlight');
        expect(photometryForFixture('emergency_downlight').isEmergency).toBe(true);
        expect(photometryForFixture('exit_sign').isEmergency).toBe(true);
        expect(photometryForFixture('recessed_downlight').isEmergency).toBeUndefined();
    });
});

// ── Integration with the one photometric authority ──────────────────────────

describe('§FEAT-LOD200-LUMINAIRES — one table, reachable by the renderer', () => {
    it('all twenty are IN the single photometry table', () => {
        for (const id of LOD200_FIXTURE_IDS) {
            expect(LIGHTING_FIXTURE_PHOTOMETRY[id], `${id} missing from the photometry table`).toBeDefined();
        }
        // 12 named + 20 LOD-200.
        expect(Object.keys(LIGHTING_FIXTURE_PHOTOMETRY)).toHaveLength(32);
    });

    it('every one resolves through the renderer’s own lookup — NOT the fallback', () => {
        for (const id of LOD200_FIXTURE_IDS) {
            const p = photometryForFixture(id);
            expect(p.lumens, id).toBe(lod200Row(id)!.lumens);
            expect(p.kelvin, id).toBe(lod200Row(id)!.kelvin);
            expect(p.watts, id).toBe(lod200Row(id)!.watts);
        }
    });

    it('⭐ THE LUMENS ARE READ: each one produces a distinct, positive scene intensity', () => {
        // This is what makes the numbers matter rather than being metadata. The
        // renderer converts lumens → candela → PointLight.intensity, so a 22 000 lm
        // high bay MUST outshine a 60 lm exit sign in the actual scene.
        for (const id of LOD200_FIXTURE_IDS) {
            expect(sceneIntensityFor(photometryForFixture(id), false), id).toBeGreaterThan(0);
        }
        expect(sceneIntensityFor(photometryForFixture('high_bay'), false))
            .toBeGreaterThan(sceneIntensityFor(photometryForFixture('exit_sign'), false));
        expect(sceneIntensityFor(photometryForFixture('recessed_downlight'), true))
            .toBeGreaterThan(sceneIntensityFor(photometryForFixture('recessed_downlight'), false));
    });

    it('all twenty are SELECTABLE — they reach the type-picker catalogue', () => {
        const defs = lod200TypeDefinitionRows();
        expect(defs).toHaveLength(20);
        for (const d of defs) {
            expect(d.name.length, `${d.id} name`).toBeGreaterThan(2);
            expect(d.description.length, `${d.id} description`).toBeGreaterThan(20);
            // The picker's mount must be the SAME fact the photometry table carries.
            expect(d.mount).toBe(LIGHTING_FIXTURE_PHOTOMETRY[d.id]!.mount);
        }
    });
});
