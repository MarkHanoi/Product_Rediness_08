import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3, ColorRgb } from '../base/primitives.js';

/**
 * Lighting fixtures (S26 / ADR-0023).
 *
 * The kernel producer emits the visible *fixture body* only; the
 * lighting committer attaches a `THREE.PointLight` (or RectAreaLight
 * for `strip`) using the parameters below.
 */
/**
 * §FEAT-FIXTURE-PHOTOMETRY (2026-08-06) — CONSTRUCTION FORM, not the fixture
 * vocabulary. Read this before adding a value.
 *
 * PRYZM has ONE canonical lighting vocabulary: `LightingFixtureType` (12 named
 * families — `downlight`, `pendant`, `linear_led`, `pendant_pebble`,
 * `pendant_ceramic_bell`, `pendant_conical`, `pendant_cluster`,
 * `floor_wood_post`, `floor_arc_brass`, `floor_tripod_black`,
 * `table_terracotta`, `mirror_light`). That union is what the placement tool
 * offers, what every builder switches on, what
 * `LightingTypeDefinitions.BUILT_IN_LIGHTING_TYPES` keys on, and what the
 * properties-panel type picker shows the user.
 *
 * `LightingKind` below is a COARSER CLASSIFICATION of those same fixtures — the
 * construction form the kernel producer needs to pick an extrusion profile. It
 * shares only TWO values with the named vocabulary (`downlight`, `pendant`), so
 * it must never be treated as a rival taxonomy.
 *
 * It is therefore DERIVED, by the single rule in
 * `@pryzm/core-app-model` → `constructionFormFor(fixtureType)`, from photometric
 * facts already authored per family (optical `form`, `mount`, suspension). A
 * 13th fixture classifies itself; there is no mapping table to drift. This is
 * the same resolution the element-type agent applied to `RailingType` vs the
 * named handrail vocabulary.
 *
 * `'emergency'` is the exception and is NOT derived: it is a DUTY, not a form (a
 * maintained-emergency downlight is still a downlight). It is carried by the
 * separate `isEmergency` boolean below, which is the correct model; this enum
 * member is retained only for the legacy serialised values already on disk.
 *
 * PURITY: this file stays P5-pure — the derivation rule lives one layer up and
 * is never imported here.
 */
const LightingKind = z.enum([
  'downlight',
  'pendant',
  'strip',
  'wall-sconce',
  'emergency',
]);

export const Lighting = defineElement('lighting', {
  levelId: z.string().default(''),
  kind: LightingKind.default('downlight'),
  /** Mount point in world coordinates (ceiling / wall surface). */
  origin: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Y-axis rotation in radians. */
  rotation: z.number().default(0),
  /** Fixture body width (X). */
  width: z.number().positive().default(0.2),
  /** Fixture body depth (Z). */
  depth: z.number().positive().default(0.2),
  /** Fixture body thickness (Y). */
  thickness: z.number().positive().default(0.05),
  /** Pendant cable length / wall-sconce stand-off, metres. */
  dropLength: z.number().nonnegative().default(0),
  /** Effective illumination range, metres (PointLight `distance`). */
  range: z.number().nonnegative().default(6),
  /**
   * §FEAT-FIXTURE-PHOTOMETRY (2026-08-06) — REAL luminous flux, lumens.
   *
   * This is the authoritative brightness field: the number printed on a lamp
   * box. `intensity` below is a DERIVED renderer value and is being retired.
   * 800 lm ≈ a standard 60 W-equivalent domestic bulb.
   */
  lumens: z.number().nonnegative().default(800),
  /**
   * §FEAT-FIXTURE-PHOTOMETRY — correlated colour temperature, kelvin.
   * 2200 = candle, 2700 = warm white, 4000 = neutral, 6500 = daylight.
   * Drives the emitted colour; `color` below is an explicit override.
   */
  kelvin: z.number().positive().default(2700),
  /**
   * §FEAT-FIXTURE-PHOTOMETRY — full beam angle, degrees. 360 = omnidirectional.
   * Documents the fixture's optic and drives the emissive-lens treatment; see
   * `@pryzm/core-app-model` FixturePhotometry §Beam angle for why it does not
   * concentrate a PointLight's candela.
   */
  beamAngleDeg: z.number().min(0).max(360).default(180),
  /**
   * DERIVED renderer intensity (scene candela). Prefer `lumens` + `kelvin`.
   *
   * The historical default of 1 is physically negligible: THREE r165+ removed
   * legacy lighting, so 1 candela falls off as 1/d² to 0.16 at 2.5 m — below the
   * scene's own ambient floor. Retained only as an explicit per-element override.
   */
  intensity: z.number().nonnegative().optional(),
  /** Linear-light color (sRGB 0..1). Overrides the `kelvin`-derived colour. */
  color: ColorRgb.default([1, 1, 1]),
  /** ISO 50293 emergency override; lights stay on when power flag is false. */
  isEmergency: z.boolean().default(false),
  materialId: z.string().optional(),
});

export type Lighting = z.infer<typeof Lighting>;
