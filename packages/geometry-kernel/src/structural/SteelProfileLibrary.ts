/**
 * SteelProfileLibrary
 *
 * Authoritative data source for standard steel section profiles (EN 10025 / BS4).
 * All dimensions are in millimetres (mm). Converters to metres are provided.
 *
 * Architecture: §D.1 — pure data module, no THREE.js, no store access.
 * Stores hold plain DTO objects only (§01 §3.4).
 *
 * D = total depth (mm)
 * B = flange width (mm)
 * t = web thickness (mm)
 * T = flange thickness (mm)
 * r = root radius (mm)
 * mass = kg/m
 * A = cross-sectional area (cm²)
 * Ix = second moment of area about major axis (cm⁴)
 * Sx = elastic section modulus (cm³)
 * Zx = plastic section modulus (cm³)
 */

export type SectionSeries = 'UC' | 'UB';

export interface SteelProfile {
    readonly name: string;
    readonly series: SectionSeries;
    /** Total depth (mm) */
    readonly D: number;
    /** Flange width (mm) */
    readonly B: number;
    /** Web thickness (mm) */
    readonly t: number;
    /** Flange thickness (mm) */
    readonly T: number;
    /** Root radius (mm) */
    readonly r: number;
    /** Mass (kg/m) */
    readonly mass: number;
    /** Cross-sectional area (cm²) */
    readonly A?: number;
}

// ── Universal Columns (UC) — BS4 Part 1 / EN 10025 ───────────────────────────

const UC_PROFILES: readonly SteelProfile[] = [
    { name: '152x152x23',  series: 'UC', D: 152.4, B: 152.2, t: 5.8,  T: 6.8,  r: 7.6,  mass: 23.0 },
    { name: '152x152x30',  series: 'UC', D: 157.6, B: 152.9, t: 6.5,  T: 9.4,  r: 7.6,  mass: 30.0 },
    { name: '152x152x37',  series: 'UC', D: 161.8, B: 154.4, t: 8.0,  T: 11.5, r: 7.6,  mass: 37.0 },
    { name: '203x203x46',  series: 'UC', D: 203.2, B: 203.6, t: 7.2,  T: 11.0, r: 10.2, mass: 46.1 },
    { name: '203x203x52',  series: 'UC', D: 206.2, B: 204.3, t: 7.9,  T: 12.5, r: 10.2, mass: 52.0 },
    { name: '203x203x60',  series: 'UC', D: 209.6, B: 205.8, t: 9.4,  T: 14.2, r: 10.2, mass: 60.0 },
    { name: '203x203x71',  series: 'UC', D: 215.8, B: 206.4, t: 10.0, T: 17.3, r: 10.2, mass: 71.0 },
    { name: '203x203x86',  series: 'UC', D: 222.2, B: 209.1, t: 12.7, T: 20.5, r: 10.2, mass: 86.0 },
    { name: '254x254x73',  series: 'UC', D: 254.1, B: 254.6, t: 8.6,  T: 14.2, r: 12.7, mass: 73.1 },
    { name: '254x254x89',  series: 'UC', D: 260.3, B: 256.3, t: 10.3, T: 17.3, r: 12.7, mass: 88.9 },
    { name: '254x254x107', series: 'UC', D: 266.7, B: 258.8, t: 12.8, T: 20.5, r: 12.7, mass: 107.1 },
    { name: '254x254x132', series: 'UC', D: 276.3, B: 261.3, t: 15.3, T: 25.3, r: 12.7, mass: 132.0 },
    { name: '305x305x97',  series: 'UC', D: 307.9, B: 305.3, t: 9.9,  T: 15.4, r: 15.2, mass: 97.1 },
    { name: '305x305x118', series: 'UC', D: 314.5, B: 307.4, t: 11.9, T: 18.7, r: 15.2, mass: 117.9 },
    { name: '305x305x137', series: 'UC', D: 320.5, B: 309.2, t: 13.8, T: 21.7, r: 15.2, mass: 137.0 },
];

// ── Universal Beams (UB) — BS4 Part 1 / EN 10025 ────────────────────────────

const UB_PROFILES: readonly SteelProfile[] = [
    { name: '127x76x13',   series: 'UB', D: 127.0, B: 76.0,  t: 4.0,  T: 7.6,  r: 7.6,  mass: 13.0 },
    { name: '152x89x16',   series: 'UB', D: 152.4, B: 88.7,  t: 4.5,  T: 7.7,  r: 7.6,  mass: 16.0 },
    { name: '178x102x19',  series: 'UB', D: 177.8, B: 101.2, t: 4.8,  T: 7.9,  r: 7.6,  mass: 19.0 },
    { name: '203x102x23',  series: 'UB', D: 203.2, B: 101.8, t: 5.2,  T: 9.3,  r: 7.6,  mass: 23.1 },
    { name: '203x133x25',  series: 'UB', D: 203.2, B: 133.2, t: 5.7,  T: 7.8,  r: 7.6,  mass: 25.1 },
    { name: '203x133x30',  series: 'UB', D: 206.8, B: 133.9, t: 6.4,  T: 9.6,  r: 7.6,  mass: 30.0 },
    { name: '254x102x22',  series: 'UB', D: 254.0, B: 101.6, t: 5.7,  T: 6.8,  r: 7.6,  mass: 22.0 },
    { name: '254x102x28',  series: 'UB', D: 260.4, B: 102.2, t: 6.3,  T: 10.0, r: 7.6,  mass: 28.3 },
    { name: '254x146x31',  series: 'UB', D: 251.4, B: 146.1, t: 6.0,  T: 8.6,  r: 7.6,  mass: 31.1 },
    { name: '254x146x37',  series: 'UB', D: 256.0, B: 146.4, t: 6.3,  T: 10.9, r: 7.6,  mass: 37.0 },
    { name: '305x102x28',  series: 'UB', D: 308.7, B: 101.8, t: 6.0,  T: 8.8,  r: 7.6,  mass: 28.2 },
    { name: '305x102x33',  series: 'UB', D: 312.7, B: 102.4, t: 6.6,  T: 10.8, r: 7.6,  mass: 33.0 },
    { name: '305x165x40',  series: 'UB', D: 303.4, B: 165.0, t: 6.0,  T: 10.2, r: 8.9,  mass: 40.3 },
    { name: '356x127x33',  series: 'UB', D: 349.0, B: 125.4, t: 6.0,  T: 8.5,  r: 10.2, mass: 33.1 },
    { name: '356x171x45',  series: 'UB', D: 351.4, B: 171.1, t: 7.0,  T: 9.7,  r: 10.2, mass: 45.0 },
    { name: '406x140x39',  series: 'UB', D: 398.0, B: 141.8, t: 6.4,  T: 8.6,  r: 10.2, mass: 39.0 },
    { name: '406x178x54',  series: 'UB', D: 402.6, B: 177.7, t: 7.7,  T: 10.9, r: 10.2, mass: 54.1 },
    { name: '457x152x52',  series: 'UB', D: 449.8, B: 152.4, t: 7.6,  T: 10.9, r: 10.2, mass: 52.3 },
    { name: '457x191x67',  series: 'UB', D: 453.4, B: 189.9, t: 8.5,  T: 12.7, r: 10.2, mass: 67.1 },
    { name: '533x210x82',  series: 'UB', D: 528.3, B: 208.8, t: 9.6,  T: 13.2, r: 12.7, mass: 82.2 },
    { name: '610x229x101', series: 'UB', D: 602.6, B: 227.6, t: 10.5, T: 14.8, r: 12.7, mass: 101.2 },
    { name: '762x267x134', series: 'UB', D: 750.0, B: 264.4, t: 12.0, T: 15.5, r: 16.5, mass: 133.9 },
];

// ── Library facade ────────────────────────────────────────────────────────────

const _byName = new Map<string, SteelProfile>();
for (const p of [...UC_PROFILES, ...UB_PROFILES]) {
    _byName.set(p.name, p);
}

export const SteelProfileLibrary = {
    /** All UC profiles */
    UC: UC_PROFILES,
    /** All UB profiles */
    UB: UB_PROFILES,
    /** All profiles in a flat array */
    all: [...UC_PROFILES, ...UB_PROFILES] as readonly SteelProfile[],
    /** Look up a profile by exact name (e.g. "254x254x89") */
    get(name: string): SteelProfile | undefined {
        return _byName.get(name);
    },
    /** Profiles in a given series */
    bySeries(series: SectionSeries): readonly SteelProfile[] {
        return series === 'UC' ? UC_PROFILES : UB_PROFILES;
    },
    /** Default UC for new steel columns */
    defaultUC(): SteelProfile {
        return _byName.get('203x203x46')!;
    },
    /** Default UB for new steel beams */
    defaultUB(): SteelProfile {
        return _byName.get('254x146x37')!;
    },
    /** Convert mm profile to metres */
    toMetres(p: SteelProfile): { D: number; B: number; t: number; T: number; r: number } {
        return { D: p.D / 1000, B: p.B / 1000, t: p.t / 1000, T: p.T / 1000, r: p.r / 1000 };
    },
} as const;
