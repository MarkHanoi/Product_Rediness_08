/**
 * §FEAT-FIXTURE-PHOTOMETRY — data assertions, not pixels.
 *
 * These tests exist because the defect they guard against was invisible to every
 * existing test: every fixture DID have a light, the light DID have a non-zero
 * intensity, and the scene DID render — the intensity was simply physically
 * smaller than the ambient it had to overpower. So the assertions here are about
 * RATIOS against the scene's own ambient floor, not about "non-zero".
 */
import { describe, it, expect } from 'vitest';
import {
    LIGHTING_FIXTURE_PHOTOMETRY,
    FURNITURE_LAMP_PHOTOMETRY,
    FALLBACK_PHOTOMETRY,
    SCENE_CANDELA_PER_REAL_CANDELA,
    FIXTURE_DAY_MULTIPLIER,
    FIXTURE_NIGHT_MULTIPLIER,
    FIXTURE_LIGHT_ROLE,
    photometryForFixture,
    photometryForFurnitureLamp,
    constructionFormFor,
    candelaFromLumens,
    beamSolidAngleSr,
    sceneIntensityFor,
    lensEmissiveFor,
    kelvinToLinearRgb,
    kelvinToHex,
} from './FixturePhotometry.js';
import { FLOOR_MOUNTED_FIXTURES } from './LightingTypes.js';

/** The 12 first-class fixture families the lighting tool can place. */
const ALL_FIXTURE_TYPES = [
    'downlight', 'pendant', 'linear_led', 'pendant_pebble',
    'pendant_ceramic_bell', 'pendant_conical', 'pendant_cluster',
    'floor_wood_post', 'floor_arc_brass', 'floor_tripod_black',
    'table_terracotta', 'mirror_light',
] as const;

/**
 * The scene's own ambient floor at night, which artificial light must beat:
 * (AmbientLight 0.5 + HemisphereLight 0.35) × the 0.38 night dim applied by
 * BottomActionMenu. See PascalSceneLighting DEFAULT_CONFIG.
 */
const NIGHT_AMBIENT_FLOOR = (0.5 + 0.35) * 0.38;
const DAY_AMBIENT_FLOOR   = 0.5 + 0.35;

/** Irradiance a point light of `cd` delivers at `d` metres (inverse square). */
const irradiance = (cd: number, d: number): number => cd / (d * d);

describe('§FEAT-FIXTURE-PHOTOMETRY — coverage', () => {
    it('every first-class fixture family resolves to a non-zero photometric definition', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            const p = photometryForFixture(t);
            expect(p, `missing photometry for ${t}`).toBeDefined();
            expect(p.lumens, `${t} lumens`).toBeGreaterThan(0);
            expect(p.kelvin, `${t} kelvin`).toBeGreaterThan(1000);
            expect(p.reachM, `${t} reach`).toBeGreaterThan(0);
        }
    });

    it('the photometry table covers EXACTLY the fixture families the tool can place', () => {
        expect(Object.keys(LIGHTING_FIXTURE_PHOTOMETRY).sort())
            .toEqual([...ALL_FIXTURE_TYPES].sort());
    });

    it('every furniture/catalogue lamp kind resolves to a non-zero definition', () => {
        for (const k of ['floor_standard', 'bedside_table', 'bed_integrated'] as const) {
            const p = photometryForFurnitureLamp(k);
            expect(p.lumens, `${k} lumens`).toBeGreaterThan(0);
            expect(sceneIntensityFor(p, false), `${k} day intensity`).toBeGreaterThan(0);
        }
        expect(Object.keys(FURNITURE_LAMP_PHOTOMETRY)).toHaveLength(3);
    });

    it('an UNKNOWN fixture family still lights the room — never zero, never undefined', () => {
        const p = photometryForFixture('some_future_fixture_from_a_newer_schema');
        expect(p).toEqual(FALLBACK_PHOTOMETRY);
        expect(sceneIntensityFor(p, true)).toBeGreaterThan(0);
    });

    it('floor-mounted families are all present in the photometry table', () => {
        for (const t of FLOOR_MOUNTED_FIXTURES) {
            expect(LIGHTING_FIXTURE_PHOTOMETRY[t]).toBeDefined();
        }
    });
});

describe('§FEAT-FIXTURE-PHOTOMETRY — taxonomy: one vocabulary, form DERIVED', () => {
    /**
     * The decision under test: `LightingFixtureType` (12 named families) is the
     * canonical vocabulary, and the schema's 5-value construction taxonomy
     * (`LightingKind`) is DERIVED from photometric facts by one rule — not kept
     * as a hand-maintained mapping table that can drift out of sync.
     */
    it('classifies EVERY named fixture into a construction form — no gaps', () => {
        const forms = new Set<string>();
        for (const t of ALL_FIXTURE_TYPES) {
            const f = constructionFormFor(t);
            expect(['downlight', 'pendant', 'strip', 'wall-sconce'], t).toContain(f);
            forms.add(f);
        }
        // …and the rule genuinely discriminates: it is not collapsing everything
        // onto one bucket.
        expect(forms.size).toBeGreaterThanOrEqual(3);
    });

    it('derives the two values the vocabularies ALREADY shared, identically', () => {
        // `downlight` and `pendant` are the only names present in both the
        // 12-value geometry union and the 5-value schema enum. The derivation
        // must reproduce them, or the "derive don't map" claim is false.
        expect(constructionFormFor('downlight')).toBe('downlight');
        expect(constructionFormFor('pendant')).toBe('pendant');
    });

    it('an extended luminous line is a STRIP wherever it is mounted', () => {
        expect(constructionFormFor('linear_led')).toBe('strip');   // ceiling
        expect(constructionFormFor('mirror_light')).toBe('strip');  // wall
    });

    it('every suspended ceiling fixture derives as a PENDANT', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            const p = photometryForFixture(t);
            if (p.suspended && p.form === 'point') {
                expect(constructionFormFor(t), t).toBe('pendant');
            }
        }
    });

    it('flush-to-ceiling point sources derive as DOWNLIGHT', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            const p = photometryForFixture(t);
            if (p.mount === 'ceiling' && !p.suspended && p.form === 'point') {
                expect(constructionFormFor(t), t).toBe('downlight');
            }
        }
    });

    it('is a pure function of the photometric record — same facts, same form', () => {
        // Two different fixture names sharing form+mount+suspension must derive
        // the same construction form. This is what makes it a RULE, not a table.
        const byFacts = new Map<string, string>();
        for (const t of ALL_FIXTURE_TYPES) {
            const p = photometryForFixture(t);
            const facts = `${p.form}|${p.mount}|${p.suspended ? 1 : 0}`;
            const form = constructionFormFor(t);
            if (byFacts.has(facts)) expect(byFacts.get(facts), t).toBe(form);
            else byFacts.set(facts, form);
        }
    });

    it('never derives "emergency" — that is a DUTY flag, not a construction form', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            expect(constructionFormFor(t)).not.toBe('emergency');
        }
    });

    it('an unknown fixture classifies via the fallback rather than throwing', () => {
        expect(constructionFormFor('some_future_fixture')).toBe('downlight');
    });

    it('the mount vocabulary is the SAME four values the type registry uses', () => {
        const allowed = new Set(['ceiling', 'floor', 'table', 'wall']);
        for (const t of ALL_FIXTURE_TYPES) {
            expect(allowed, `${t} mount`).toContain(photometryForFixture(t).mount);
        }
    });

    it('FLOOR_MOUNTED_FIXTURES agrees with the photometric mount class', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            const isFloorish = ['floor', 'table'].includes(photometryForFixture(t).mount);
            expect(FLOOR_MOUNTED_FIXTURES.has(t), `${t}`).toBe(isFloorish);
        }
    });
});

describe('§FEAT-FIXTURE-PHOTOMETRY — conversions', () => {
    it('candelaFromLumens is lm / 4π (omnidirectional emitter)', () => {
        expect(candelaFromLumens(800)).toBeCloseTo(800 / (4 * Math.PI), 6);
        expect(candelaFromLumens(0)).toBe(0);
        expect(candelaFromLumens(-5)).toBe(0);        // clamped, never negative
    });

    it('beamSolidAngleSr returns 4π for a 360° emitter and 2π for a hemisphere', () => {
        expect(beamSolidAngleSr(360)).toBeCloseTo(4 * Math.PI, 6);
        expect(beamSolidAngleSr(180)).toBeCloseTo(2 * Math.PI, 6);
        expect(beamSolidAngleSr(0)).toBeCloseTo(0, 6);
    });

    it('kelvinToLinearRgb is warm below 5000 K and cool above 7000 K', () => {
        const [wr, , wb] = kelvinToLinearRgb(2400);
        expect(wr).toBeGreaterThan(wb);               // candlelight: red-dominant
        const [cr, , cb] = kelvinToLinearRgb(9000);
        expect(cb).toBeGreaterThan(cr);               // cool daylight: blue-dominant
    });

    it('kelvinToLinearRgb clamps out-of-range input rather than producing NaN', () => {
        for (const k of [-100, 0, 1, 1e9]) {
            const rgb = kelvinToLinearRgb(k);
            for (const c of rgb) {
                expect(Number.isFinite(c)).toBe(true);
                expect(c).toBeGreaterThanOrEqual(0);
                expect(c).toBeLessThanOrEqual(1);
            }
        }
    });

    it('kelvinToHex packs into a valid 24-bit value', () => {
        const hex = kelvinToHex(2700);
        expect(hex).toBeGreaterThanOrEqual(0);
        expect(hex).toBeLessThanOrEqual(0xffffff);
    });
});

describe('§FIX-LIGHT-NIGHT-CONTRIBUTION — day vs night', () => {
    it('the night multiplier EXCEEDS the day multiplier, and both are non-zero', () => {
        expect(FIXTURE_NIGHT_MULTIPLIER).toBeGreaterThan(FIXTURE_DAY_MULTIPLIER);
        expect(FIXTURE_DAY_MULTIPLIER).toBeGreaterThan(0);
    });

    it('EVERY fixture family emits in day mode as well as night', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            const p = photometryForFixture(t);
            expect(sceneIntensityFor(p, false), `${t} must emit by DAY`).toBeGreaterThan(0);
            expect(sceneIntensityFor(p, true), `${t} must emit at NIGHT`).toBeGreaterThan(0);
            expect(sceneIntensityFor(p, true)).toBeGreaterThan(sceneIntensityFor(p, false));
        }
    });

    it('at night every ceiling/pendant fixture DOMINATES the scene ambient floor at 2.5 m', () => {
        const ceilingFamilies = ALL_FIXTURE_TYPES.filter(
            (t) => photometryForFixture(t).mount === 'ceiling' || photometryForFixture(t).mount === 'pendant',
        );
        expect(ceilingFamilies.length).toBeGreaterThan(0);
        for (const t of ceilingFamilies) {
            const cd = sceneIntensityFor(photometryForFixture(t), true);
            const e = irradiance(cd, 2.5);
            // "Dominant" = at least 2× the ambient it has to beat. The OLD flat
            // 1.5 cd gave 0.24 here, i.e. 0.75× — DIMMER than ambient. That is
            // the black-room defect, expressed as a number.
            expect(e / NIGHT_AMBIENT_FLOOR, `${t} night dominance`).toBeGreaterThan(2);
        }
    });

    it('by day a pendant reads as ON without washing out the sun', () => {
        const cd = sceneIntensityFor(photometryForFixture('pendant'), false);
        const ratio = irradiance(cd, 2.5) / DAY_AMBIENT_FLOOR;
        expect(ratio).toBeGreaterThan(0.5);   // clearly visible
        expect(ratio).toBeLessThan(4);        // not blowing out the daylight scene
    });
});

describe('§FEAT-FIXTURE-PHOTOMETRY — the 2× brightness requirement', () => {
    /** The single magic scalar every fixture shared before this change. */
    const LEGACY_INTENSITY = 1.5;

    it('every fixture family is at least 2× the legacy flat intensity, at night AND by day', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            const p = photometryForFixture(t);
            expect(sceneIntensityFor(p, true) / LEGACY_INTENSITY, `${t} night`).toBeGreaterThanOrEqual(2);
            expect(sceneIntensityFor(p, false) / LEGACY_INTENSITY, `${t} day`).toBeGreaterThanOrEqual(2);
        }
    });

    it('the scene candela scale is the documented derivation, not a free knob', () => {
        // Design target: 800 lm pendant at 2.5 m delivers ~4× the night ambient floor.
        const cd = candelaFromLumens(800) * SCENE_CANDELA_PER_REAL_CANDELA * FIXTURE_NIGHT_MULTIPLIER;
        const ratio = irradiance(cd, 2.5) / NIGHT_AMBIENT_FLOOR;
        expect(ratio).toBeGreaterThan(5);
        expect(ratio).toBeLessThan(9);
    });

    it('brightness is ORDERED by luminous flux — a 2400 lm bar beats a 450 lm table lamp', () => {
        const bar   = sceneIntensityFor(photometryForFixture('linear_led'), true);
        const table = sceneIntensityFor(photometryForFixture('table_terracotta'), true);
        expect(bar).toBeGreaterThan(table);
        // and by the same ratio as their real flux — proof it is photometric,
        // not a hand-tuned per-fixture scalar.
        expect(bar / table).toBeCloseTo(2400 / 450, 5);
    });
});

describe('§FEAT-FIXTURE-PHOTOMETRY — emissive lens', () => {
    it('every family gets a lens intensity inside the documented clamp', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            for (const night of [false, true]) {
                const v = lensEmissiveFor(photometryForFixture(t), night);
                expect(v).toBeGreaterThanOrEqual(0.35);
                expect(v).toBeLessThanOrEqual(3.0);
            }
        }
    });

    it('the lens is brighter at night, so a budget-dark fixture still reads as ON', () => {
        for (const t of ALL_FIXTURE_TYPES) {
            const p = photometryForFixture(t);
            expect(lensEmissiveFor(p, true)).toBeGreaterThanOrEqual(lensEmissiveFor(p, false));
        }
    });
});

describe('§FIX-LIGHT-NIGHT-CONTRIBUTION — fixture light role', () => {
    it('exposes a stable role string for the environment dimmer to skip', () => {
        expect(FIXTURE_LIGHT_ROLE).toBe('lighting.fixture');
    });
});

describe('P5-adjacent purity', () => {
    it('the photometry module imports no THREE, no DOM and no I/O', async () => {
        const { readFileSync } = await import('node:fs');
        const { fileURLToPath } = await import('node:url');
        const { dirname, join } = await import('node:path');
        const here = dirname(fileURLToPath(import.meta.url));
        const src = readFileSync(join(here, 'FixturePhotometry.ts'), 'utf8');
        // Strip comments first: prose legitimately mentions THREE, the
        // attenuation "window", etc. Purity is about CODE, not documentation.
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
        expect(code).not.toMatch(/from ['"]three['"]/);
        expect(code).not.toMatch(/renderer-three/);
        expect(code).not.toMatch(/\bdocument\.|\bwindow\.|globalThis\./);
        expect(code).not.toMatch(/node:fs|node:path|fetch\(|localStorage/);
        // Only dependency permitted: the OTel API (P8 spans) and sibling types.
        const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
        expect(imports.sort()).toEqual(['./LightingTypes.js', '@opentelemetry/api']);
    });
});
