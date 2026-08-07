/**
 * @file FixturePhotometry.ts
 * §FEAT-FIXTURE-PHOTOMETRY (2026-08-06)
 *
 * The ONE photometric authority for every artificial light fixture in PRYZM.
 *
 * ── Why this file exists ───────────────────────────────────────────────────
 * Before this module, every fixture in the product shared a single magic
 * scalar — `DEFAULT_EMISSION.intensity = 1.5` (LightingTypes.ts) — regardless
 * of whether it was a 450 lm bedside lamp or a 2400 lm linear LED bar. THREE
 * r165+ removed legacy (non-physical) lighting, so `PointLight.intensity` is
 * now read as CANDELA and falls off as 1/d². 1.5 cd at 2.5 m yields an
 * irradiance of 0.24 — LOWER than the scene's own ambient+hemisphere floor
 * (0.85 by day, 0.32 at night). That is precisely why a room full of placed
 * fixtures rendered black: the fixtures were physically dimmer than the
 * ambient they were supposed to overpower.
 *
 * This module replaces the scalar with real photometry:
 *   • luminous flux in LUMENS (the number printed on a real lamp box)
 *   • correlated colour temperature in KELVIN (drives the emitted colour)
 *   • a beam angle (documented; drives the emissive lens, and a future
 *     SpotLight upgrade — see §Beam angle below)
 *   • a useful reach in metres (the PointLight `distance` window)
 *
 * ── Layer / principle compliance ───────────────────────────────────────────
 *   P2 — imports no THREE. Pure arithmetic on plain numbers and tuples.
 *   P3 — no requestAnimationFrame, no timers.
 *   P5-adjacent — no I/O, no DOM. Safe for schemas-adjacent consumers.
 *   P8 — every exported function carries an OpenTelemetry span.
 *   C04 §3 — renderer-side instantiation stays in the renderer/builder layer;
 *            this file only says HOW BRIGHT and WHAT COLOUR.
 */

import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import type { LightingFixtureType } from './LightingTypes.js';

const TRACER = trace.getTracer('@pryzm/core-app-model/fixture-photometry', '0.1.0');

function withPhotoSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.fixture-photometry.${verb}`, { attributes: attrs });
    try {
        const out = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
        throw err;
    } finally {
        span.end();
    }
}

// ── The photometric record ──────────────────────────────────────────────────

/**
 * A real-world photometric definition for one fixture family.
 *
 * Every field is in a REAL unit, so the numbers can be checked against a
 * manufacturer datasheet rather than eyeballed against a screenshot.
 */
export interface FixturePhotometry {
    /** Luminous flux of the fixture's lamp(s), lumens. The box number. */
    readonly lumens: number;
    /** Correlated colour temperature, kelvin. 2200 = candle, 6500 = daylight. */
    readonly kelvin: number;
    /**
     * Full beam angle in degrees; 360 = omnidirectional (bare/diffuse lamp).
     *
     * §Beam angle — PRYZM currently instantiates every fixture as a THREE
     * `PointLight`, which is omnidirectional by construction, so the beam angle
     * does NOT narrow the point light's candela (doing so would make a 60°
     * downlight ~15× brighter than an identically-rated pendant and blow the
     * tone-mapping curve). It is authored here because (a) it is the correct
     * datasheet property, (b) it drives the emissive-lens intensity so a
     * narrow-beam fixture reads as a hotter lens, and (c) a later SpotLight
     * upgrade for `downlight` / `floor_arc_brass` reads it directly.
     */
    readonly beamAngleDeg: number;
    /** Useful reach, metres — becomes the point light's attenuation window. */
    readonly reachM: number;
    /**
     * Where the fixture is mounted. Deliberately the SAME four-value vocabulary
     * as `LightingTypeDefinitions.LightingMountClass` — one mount vocabulary for
     * the whole product, not a third one owned by photometry.
     */
    readonly mount: 'ceiling' | 'wall' | 'floor' | 'table';
    /**
     * The fixture's optical FORM: a compact source (`point`) or an extended
     * luminous line (`linear`). This is a real photometric property — it is what
     * makes a 1.2 m LED bar cast a soft, wide-edged shadow where a downlight
     * casts a hard one — and it is the ONE extra fact needed to DERIVE the
     * schema's construction taxonomy. See {@link constructionFormFor}.
     */
    readonly form: 'point' | 'linear';
    /**
     * True when the fixture hangs BELOW its mount plane on a cable/stem, so the
     * emitter anchor is under the ceiling rather than flush with it. Ceiling
     * mount + suspended is what the trade calls a "pendant"; it is a placement
     * fact, not a separate mount class.
     */
    readonly suspended?: boolean;
}

/**
 * §PRYZM-SCENE-CANDELA — the conversion from real candela to this renderer's
 * intensity convention. THIS IS NOT 1.
 *
 * PRYZM's scene is NOT absolutely calibrated: `PascalSceneLighting` renders full
 * daylight with a DirectionalLight of intensity 4 (real direct sun is ~100 000 lux)
 * against an AmbientLight of 0.5 + a HemisphereLight of 0.35, tone-mapped at
 * exposure 0.9. Feeding true candela (a 800 lm bulb = 63.7 cd) into that scene
 * would clip every surface within 3 m to pure white.
 *
 * The scale is therefore DERIVED from a stated design target rather than guessed:
 *
 *   Target: standing under a normal 800 lm pendant at 2.5 m, the fixture should
 *           deliver ~4× the scene's night ambient floor, so it unambiguously
 *           reads as the key light of the room.
 *
 *   night ambient floor = (ambient 0.5 + hemi 0.35) × 0.38 night dim ≈ 0.32
 *   target irradiance   = 4 × 0.32                                  ≈ 1.28
 *   required scene cd   = 1.28 × (2.5 m)²                           ≈ 8.0
 *   real cd of 800 lm   = 800 / 4π                                  ≈ 63.7
 *   scale               = 8.0 / 63.7                                ≈ 0.125 = 1/8
 *
 * Changing the scene's ambient/exposure convention means re-deriving this
 * constant from the same four lines — it is not a taste knob.
 */
export const SCENE_CANDELA_PER_REAL_CANDELA = 1 / 8;

/**
 * §FIX-LIGHT-NIGHT-CONTRIBUTION — day/night output multipliers.
 *
 * Fixtures emit in BOTH modes (the founder requirement): a lamp that is drawn
 * glowing must actually illuminate at noon too. At night the eye adapts and the
 * fixture becomes the key light, so it is boosted while `BottomActionMenu`
 * simultaneously dims the sun/ambient to 38%.
 *
 * INVARIANT (asserted by test): NIGHT > DAY > 0.
 */
export const FIXTURE_DAY_MULTIPLIER   = 1.0;
export const FIXTURE_NIGHT_MULTIPLIER = 1.6;

/**
 * §FIX-LIGHT-NIGHT-CONTRIBUTION — `userData.role` stamped on every fixture-owned
 * THREE light. The builder OWNS these intensities; any scene-wide dimmer (e.g.
 * the bottom-menu day/night traversal) must skip lights carrying this role or it
 * will fight the photometric model and re-introduce the black-room defect.
 */
export const FIXTURE_LIGHT_ROLE = 'lighting.fixture';

// ── Per-family photometric table ────────────────────────────────────────────

/**
 * Every `LightingFixtureType` — the first-class lighting ELEMENTS created by the
 * lighting tool / `CREATE_LIGHTING` command. Values are ordinary residential
 * retrofit-LED ratings.
 */
export const LIGHTING_FIXTURE_PHOTOMETRY: Readonly<Record<LightingFixtureType, FixturePhotometry>> = {
    // Ceiling-mounted, flush
    downlight:            { lumens:  650, kelvin: 3000, beamAngleDeg:  60, reachM: 5.0, mount: 'ceiling', form: 'point'  },
    // Ceiling-mounted, suspended (what the trade calls a pendant)
    pendant:              { lumens:  800, kelvin: 2700, beamAngleDeg: 180, reachM: 6.0, mount: 'ceiling', form: 'point',  suspended: true },
    linear_led:           { lumens: 2400, kelvin: 4000, beamAngleDeg: 180, reachM: 7.0, mount: 'ceiling', form: 'linear', suspended: true },
    pendant_pebble:       { lumens:  700, kelvin: 2700, beamAngleDeg: 160, reachM: 6.0, mount: 'ceiling', form: 'point',  suspended: true },
    pendant_ceramic_bell: { lumens:  600, kelvin: 2400, beamAngleDeg: 140, reachM: 5.0, mount: 'ceiling', form: 'point',  suspended: true },
    pendant_conical:      { lumens:  900, kelvin: 2700, beamAngleDeg: 150, reachM: 6.0, mount: 'ceiling', form: 'point',  suspended: true },
    pendant_cluster:      { lumens: 1200, kelvin: 2700, beamAngleDeg: 180, reachM: 6.0, mount: 'ceiling', form: 'point',  suspended: true },
    // Floor-standing
    floor_wood_post:      { lumens:  800, kelvin: 2700, beamAngleDeg: 200, reachM: 5.0, mount: 'floor',   form: 'point'  },
    floor_arc_brass:      { lumens: 1100, kelvin: 2700, beamAngleDeg:  90, reachM: 5.5, mount: 'floor',   form: 'point'  },
    floor_tripod_black:   { lumens:  800, kelvin: 2700, beamAngleDeg: 140, reachM: 5.0, mount: 'floor',   form: 'point'  },
    // Table / wall
    table_terracotta:     { lumens:  450, kelvin: 2400, beamAngleDeg: 180, reachM: 3.5, mount: 'table',   form: 'point'  },
    mirror_light:         { lumens:  700, kelvin: 4000, beamAngleDeg: 180, reachM: 3.0, mount: 'wall',    form: 'linear' },
};

/**
 * §FEAT-FIXTURE-PHOTOMETRY (A) — the SECOND fixture family: lamps placed from
 * the FURNITURE catalogue (`FurnitureType === 'lamp'`) and the built-in bedside
 * lamps on the Japanese-float bed. These were pure emissive meshes with NO light
 * source at all, which is the direct cause of "not all fixtures have light".
 *
 * Keyed by the builder's own discriminator rather than a fixture type, because
 * the furniture catalogue has no lighting taxonomy of its own.
 */
export type FurnitureLampKind = 'floor_standard' | 'bedside_table' | 'bed_integrated';

export const FURNITURE_LAMP_PHOTOMETRY: Readonly<Record<FurnitureLampKind, FixturePhotometry>> = {
    /** The 1.5–1.6 m tripod corner/floor lamp built by `LampBuilder`. */
    floor_standard: { lumens: 800, kelvin: 2700, beamAngleDeg: 160, reachM: 5.0, mount: 'floor', form: 'point' },
    /** The ≤0.6 m glowing bedside lamp built by `LampBuilder.buildBedsideTableLamp`. */
    bedside_table:  { lumens: 350, kelvin: 2400, beamAngleDeg: 180, reachM: 3.0, mount: 'table', form: 'point' },
    /** The two lamps integrated into the `BedEngine` float-bed wings. */
    bed_integrated: { lumens: 300, kelvin: 2400, beamAngleDeg: 180, reachM: 3.0, mount: 'table', form: 'point' },
};

/**
 * Last-resort photometry for a fixture family that reaches the renderer without a
 * table entry (e.g. a project restored from a future schema version). NEVER zero
 * — an unknown fixture must still light the room. §FEAT-FIXTURE-PHOTOMETRY.
 */
export const FALLBACK_PHOTOMETRY: FixturePhotometry = {
    lumens: 700, kelvin: 2700, beamAngleDeg: 180, reachM: 5.0, mount: 'ceiling', form: 'point',
};

// ── Taxonomy: ONE named vocabulary, construction form DERIVED ───────────────

/**
 * §FEAT-FIXTURE-PHOTOMETRY — the taxonomy decision.
 *
 * Two lighting vocabularies existed in the codebase, sharing only TWO values:
 *
 *   • `LightingFixtureType` (12 values, field `fixtureType`) — the NAMED
 *     catalogue. It is what the placement tool offers, what every builder
 *     `switch`es on, what `LightingTypeDefinitions.BUILT_IN_LIGHTING_TYPES`
 *     keys on, and what the properties-panel type picker shows the user.
 *   • `LightingKind` (5 values, field `kind`, packages/schemas) — a CONSTRUCTION
 *     taxonomy: downlight / pendant / strip / wall-sconce / emergency.
 *
 * DECISION: `LightingFixtureType` is authoritative. The construction taxonomy is
 * not a rival vocabulary, it is a CLASSIFICATION of the same fixtures at a
 * coarser grain — so it is DERIVED by the single rule below rather than kept as
 * a hand-maintained mapping table that can drift. This mirrors the resolution
 * already applied to `RailingType` vs the named handrail vocabulary.
 *
 * The rule reads only photometric facts already authored per family (`form`,
 * `mount`, `beamAngleDeg`), so adding a 13th fixture classifies itself.
 *
 * NOT DERIVED — `'emergency'`: that is a DUTY, not a construction form (a
 * maintained-emergency downlight is still a downlight). The schema already
 * carries it as the separate boolean `isEmergency`, which is the correct model;
 * callers needing the legacy 5-value enum should emit `'emergency'` from that
 * flag and use this function for everything else.
 */
export type LightingConstructionForm = 'downlight' | 'pendant' | 'strip' | 'wall-sconce';

export function constructionFormFor(fixtureType: string): LightingConstructionForm {
    return withPhotoSpan('construction-form', { 'pryzm.fixture.type': fixtureType }, () => {
        const p = photometryForFixture(fixtureType);
        // 1. An extended luminous line is a STRIP, wherever it is mounted.
        if (p.form === 'linear') return 'strip';
        // 2. Anything on a wall is a SCONCE.
        if (p.mount === 'wall') return 'wall-sconce';
        // 3. Hanging below its mount plane — or standing on floor/table, which
        //    is optically the same "free-standing luminaire" case — is a PENDANT.
        if (p.suspended || p.mount === 'floor' || p.mount === 'table') return 'pendant';
        // 4. What remains is flush to the ceiling: a DOWNLIGHT.
        return 'downlight';
    });
}

// ── Pure conversions ────────────────────────────────────────────────────────

/**
 * Resolve the photometric record for a lighting-ELEMENT fixture type.
 * Always returns a record with `lumens > 0` — never undefined, never zero.
 */
export function photometryForFixture(fixtureType: string): FixturePhotometry {
    return withPhotoSpan('resolve', { 'pryzm.fixture.type': fixtureType }, () => {
        const table = LIGHTING_FIXTURE_PHOTOMETRY as Record<string, FixturePhotometry | undefined>;
        return table[fixtureType] ?? FALLBACK_PHOTOMETRY;
    });
}

/** Resolve the photometric record for a catalogue/furniture lamp. */
export function photometryForFurnitureLamp(kind: string): FixturePhotometry {
    return withPhotoSpan('resolve-furniture', { 'pryzm.lamp.kind': kind }, () => {
        const table = FURNITURE_LAMP_PHOTOMETRY as Record<string, FixturePhotometry | undefined>;
        return table[kind] ?? FALLBACK_PHOTOMETRY;
    });
}

/**
 * Luminous flux → real candela for an OMNIDIRECTIONAL emitter: `lm / 4π sr`.
 * This is the honest conversion for a THREE `PointLight`, which radiates over
 * the full sphere. See §Beam angle on {@link FixturePhotometry.beamAngleDeg}.
 */
export function candelaFromLumens(lumens: number): number {
    return withPhotoSpan('candela', { 'pryzm.fixture.lumens': lumens }, () =>
        Math.max(0, lumens) / (4 * Math.PI));
}

/**
 * Solid angle of a cone of full angle `beamAngleDeg`, in steradians.
 * `Ω = 2π(1 − cos(θ/2))`; 360° yields 4π. Used by the lens/emissive treatment
 * and reserved for the SpotLight upgrade.
 */
export function beamSolidAngleSr(beamAngleDeg: number): number {
    return withPhotoSpan('solid-angle', { 'pryzm.fixture.beam_deg': beamAngleDeg }, () => {
        const deg = Math.max(0, Math.min(360, beamAngleDeg));
        return 2 * Math.PI * (1 - Math.cos((deg / 2) * (Math.PI / 180)));
    });
}

/**
 * The value to write into `THREE.PointLight.intensity` for this fixture.
 *
 * `scene_cd = (lumens / 4π) × SCENE_CANDELA_PER_REAL_CANDELA × dayNightMultiplier`
 *
 * @param photo photometric record (never null — see {@link photometryForFixture})
 * @param isNight true → the night multiplier applies
 */
export function sceneIntensityFor(photo: FixturePhotometry, isNight: boolean): number {
    return withPhotoSpan('scene-intensity', {
        'pryzm.fixture.lumens': photo.lumens,
        'pryzm.fixture.is_night': isNight,
    }, () => {
        const mult = isNight ? FIXTURE_NIGHT_MULTIPLIER : FIXTURE_DAY_MULTIPLIER;
        return (Math.max(0, photo.lumens) / (4 * Math.PI)) * SCENE_CANDELA_PER_REAL_CANDELA * mult;
    });
}

/**
 * Emissive intensity for the fixture's own visible lens/diffuser mesh.
 *
 * The lens is what makes a fixture READ as switched-on from across the room and
 * — critically — it is what a fixture that loses the live-light budget still
 * has. It is driven by the same photometry: brighter lamps and narrower beams
 * get hotter lenses. Clamped to [0.35, 3.0] so no lens becomes a white blob.
 */
export function lensEmissiveFor(photo: FixturePhotometry, isNight: boolean): number {
    return withPhotoSpan('lens-emissive', {
        'pryzm.fixture.lumens': photo.lumens,
        'pryzm.fixture.is_night': isNight,
    }, () => {
        // Reference: a 800 lm, 180° fixture reads at 1.0 by day.
        const fluxTerm  = Math.max(0, photo.lumens) / 800;
        const beamTerm  = Math.sqrt((4 * Math.PI) / Math.max(0.05, beamSolidAngleSr(photo.beamAngleDeg)));
        const nightTerm = isNight ? 1.35 : 1.0;
        const raw = fluxTerm * (beamTerm / Math.SQRT2) * nightTerm;
        return Math.max(0.35, Math.min(3.0, raw));
    });
}

/**
 * Correlated colour temperature → linear-sRGB tuple in 0..1.
 *
 * Planckian-locus approximation (Tanner Helland's piecewise fit, the same one
 * used by most real-time engines), then a gamma→linear transfer so the value can
 * be handed to a colour-managed THREE renderer. Pure; no colour library needed.
 *
 * @param kelvin 1000..15000; clamped.
 */
export function kelvinToLinearRgb(kelvin: number): readonly [number, number, number] {
    return withPhotoSpan('kelvin-rgb', { 'pryzm.fixture.kelvin': kelvin }, () => {
        const t = Math.max(1000, Math.min(15000, kelvin)) / 100;
        let r: number, g: number, b: number;

        if (t <= 66) {
            r = 255;
            g = 99.4708025861 * Math.log(t) - 161.1195681661;
        } else {
            r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
            g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
        }
        if (t >= 66)      b = 255;
        else if (t <= 19) b = 0;
        else              b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;

        const srgb = (v: number): number => Math.max(0, Math.min(1, v / 255));
        // sRGB EOTF → linear.
        const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
        return [lin(srgb(r)), lin(srgb(g)), lin(srgb(b))] as const;
    });
}

/** `kelvinToLinearRgb` packed as a 24-bit hex integer, for THREE.Color(hex). */
export function kelvinToHex(kelvin: number): number {
    return withPhotoSpan('kelvin-hex', { 'pryzm.fixture.kelvin': kelvin }, () => {
        const [r, g, b] = kelvinToLinearRgb(kelvin);
        const q = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 255);
        return (q(r) << 16) | (q(g) << 8) | q(b);
    });
}
