// §MATERIAL-CARBON-FACTS (L-3101) — the reference factors PRYZM ships, and the
// three hundred it deliberately does NOT.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⭐ WHY THIS TABLE IS SHORT, AND WHY THAT IS THE FEATURE
// ─────────────────────────────────────────────────────────────────────────────
// `MATERIAL_CATALOG` holds hundreds of rows. This table carries factors for a
// SMALL, NAMED subset of them: the structural and envelope materials where
// embodied carbon actually lives, and only where a generic published figure
// exists that honestly describes the PRYZM material it is attached to.
//
// **Every other material reads NOT MEASURED.** That is not an omission to be
// tidied up later by filling in plausible numbers — it is the correct output.
// A 6D surface showing 300 plausible figures and one real one is indistinguishable
// from a 6D surface showing 301 real ones, and an architect cannot tell which
// cell they just pasted into a planning submission.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ EVERY ROW HERE IS `UNVERIFIED_TRANSCRIPTION`
// ─────────────────────────────────────────────────────────────────────────────
// Each row names a real, published dataset and the row within it. **Nobody has
// re-opened that dataset inside this repository and confirmed the figure.** That
// is a different fact from "it has a citation", and the two are kept apart on
// purpose (see `CarbonVerification` in `materialCarbon.ts`). The 6D surface
// prints the state beside every number and refuses to let a total be read
// without it.
//
// ⛔ TO ADD A ROW: it must name (a) the dataset and edition, (b) the row within
// it, (c) the geography, (d) the scope, and (e) what the published row covers
// that the PRYZM material does not, or vice versa. A row that cannot state all
// five does not go in — it stays NOT MEASURED, which is a true statement.
//
// ⛔ NOT A FALLBACK TABLE. There is no "nearest material" lookup, no category
// default and no `?? GENERIC_CONCRETE`. `findCarbonFacts()` returns `undefined`
// on a miss, exactly as `findMaterialRecord()` returns `undefined` rather than a
// substitute colour (C100 §5).
//
// Layer: L0 — packages/schemas. Pure data (P5).

import type { CarbonFactorFact, DensityFact, MaterialCarbonFacts } from './materialCarbon.js';

// ── Citation builders ─────────────────────────────────────────────────────────
//
// These exist so the dataset/edition/geography/verification quartet cannot drift
// row to row, and so a reader can see at a glance that not one number in this
// file was typed without one.

const ICE = (row: string, geography = 'UK'): Omit<DensityFact, 'kgPerM3'> => ({
  source:
    `ICE Database v3.0 (Circular Ecology; Hammond & Jones, University of Bath), row "${row}". `
    + 'Generic cradle-to-gate figure — NOT a product EPD. Transcribed into PRYZM; '
    + 'not re-checked against the source document.',
  dataset: 'ICE v3.0',
  year: 2019,
  geography,
  provenance: 'BUILTIN_REFERENCE',
  verification: 'UNVERIFIED_TRANSCRIPTION',
});

const EN1991 = (row: string): Omit<DensityFact, 'kgPerM3'> => ({
  source:
    `EN 1991-1-1:2002 Annex A, ${row} — nominal density for design. `
    + 'Transcribed into PRYZM; not re-checked against the source document.',
  dataset: 'EN 1991-1-1 Annex A',
  year: 2002,
  geography: 'EU',
  provenance: 'BUILTIN_REFERENCE',
  verification: 'UNVERIFIED_TRANSCRIPTION',
});

const kgFactor = (
  value: number,
  cite: Omit<DensityFact, 'kgPerM3'>,
  qualifier?: string,
): CarbonFactorFact => ({ ...cite, value, unit: 'kgCO2e/kg', scope: 'A1-A3', qualifier });

const density = (kgPerM3: number, cite: Omit<DensityFact, 'kgPerM3'>): DensityFact => ({
  ...cite,
  kgPerM3,
});

// ── The shipped rows ──────────────────────────────────────────────────────────

/** Generic in-situ concrete. The reinforcement is a SEPARATE quantity PRYZM does not model. */
const GENERIC_CONCRETE: MaterialCarbonFacts = {
  carbonA1A3: kgFactor(
    0.113,
    ICE('Concrete, ready-mix, generic C25/30'),
    'Generic in-situ concrete. REINFORCEMENT IS NOT INCLUDED — PRYZM models no bar schedule, '
    + 'and inventing one would move the number more than the factor itself does.',
  ),
  density: density(2400, EN1991('Table A.1 — normal-weight concrete, 24 kN/m³')),
};

/** Generic clay facing brick. Mortar is a separate quantity PRYZM does not model. */
const GENERIC_CLAY_BRICK: MaterialCarbonFacts = {
  carbonA1A3: kgFactor(
    0.213,
    ICE('Bricks, general (common brick)'),
    'MORTAR IS NOT INCLUDED — PRYZM measures a wall face, not its joints. '
    + 'Mortar is typically 15-20% of a brick wall\'s volume and carries its own, higher factor.',
  ),
  density: density(1900, EN1991('Table A.1 — solid clay masonry units, 18-21 kN/m³ (midpoint taken)')),
};

/**
 * The table. Keyed by `MaterialRecord.id` — the SAME id an element references,
 * so there is no second material vocabulary here (C100 §1.1).
 *
 * ⚠ An id in this table that is NOT in `MATERIAL_CATALOG` is a DEFECT, not a
 * harmless extra: it means a factor is attached to nothing and will silently
 * never apply. `carbonFactorOrphans()` below names them and a test asserts zero.
 */
export const CARBON_FACTOR_TABLE: Readonly<Record<string, MaterialCarbonFacts>> = Object.freeze({
  // ── Concrete ────────────────────────────────────────────────────────────────
  // Attached only to the rows that ARE generic in-situ concrete. `concrete-white`
  // (white cement — a materially higher factor), `concrete-precast` (works-based
  // manufacture and transport), `concrete-terrazzo-*` and `concrete-formwork-oiled`
  // are DELIBERATELY ABSENT: the generic figure does not describe them, and
  // attaching it anyway is precisely the "plausible number" failure.
  'concrete-smooth': GENERIC_CONCRETE,
  'concrete-rough': GENERIC_CONCRETE,
  'concrete-exposed': GENERIC_CONCRETE,
  'concrete-burnished': GENERIC_CONCRETE,
  'concrete-reinforced': {
    carbonA1A3: GENERIC_CONCRETE.carbonA1A3,
    density: density(2500, EN1991('Table A.1 — normal-weight concrete +1 kN/m³ for normal reinforcement')),
  },

  // ── Metals ──────────────────────────────────────────────────────────────────
  'steel-structural': {
    carbonA1A3: kgFactor(
      1.55,
      ICE('Steel, section, UK (EU average recycled content)', 'UK / EU average'),
      'Hot-rolled section. Fabrication, protective coating, connections and site erection '
      + 'are NOT included.',
    ),
    density: density(7850, EN1991('Table A.4 — steel, 77.0-78.5 kN/m³')),
  },
  'copper-new': {
    carbonA1A3: kgFactor(
      2.71,
      ICE('Copper, average incl. recycled content', 'World average'),
      'Sheet/strip stock. Standing-seam forming and fixings are NOT included.',
    ),
    density: density(8900, EN1991('Table A.4 — copper, 87-89 kN/m³')),
  },
  'aluminium-anodised-silver': {
    carbonA1A3: kgFactor(
      13.1,
      ICE('Aluminium, general, worldwide average recycled content', 'World average'),
      'Generic aluminium stock. ANODISING IS NOT INCLUDED, and recycled content moves this '
      + 'figure by more than any other row in this table — a specific EPD is strongly preferred here.',
    ),
    density: density(2700, EN1991('Table A.4 — aluminium, 27 kN/m³')),
  },

  // ── Timber ──────────────────────────────────────────────────────────────────
  // ⚠ Every timber row EXCLUDES biogenic sequestration. ICE v3.0 reports timber
  // both ways; the figure taken here is the one WITHOUT the sequestration credit,
  // because a credit that depends on end-of-life fate cannot be claimed by a model
  // that has no end-of-life scenario. Reporting the credited figure would make
  // timber look better than PRYZM can justify.
  'timber-glulam': {
    carbonA1A3: kgFactor(
      0.512,
      ICE('Glued laminated timber (glulam)'),
      'EXCLUDES biogenic carbon sequestration — PRYZM declares no end-of-life scenario.',
    ),
    density: density(500, ICE('Glued laminated timber (glulam) — density column')),
  },
  'timber-clt': {
    carbonA1A3: kgFactor(
      0.437,
      ICE('Cross-laminated timber (CLT)'),
      'EXCLUDES biogenic carbon sequestration — PRYZM declares no end-of-life scenario.',
    ),
    density: density(500, ICE('Cross-laminated timber (CLT) — density column')),
  },
  'timber-plywood': {
    carbonA1A3: kgFactor(
      0.681,
      ICE('Plywood'),
      'EXCLUDES biogenic carbon sequestration.',
    ),
    density: density(600, ICE('Plywood — density column')),
  },
  'wood-pine': {
    carbonA1A3: kgFactor(
      0.263,
      ICE('Timber, sawn softwood, kiln dried'),
      'Generic sawn SOFTWOOD. EXCLUDES biogenic carbon sequestration. Not applied to the '
      + 'hardwood rows (oak, walnut, teak) — their published figures differ and none is transcribed.',
    ),
    density: density(500, ICE('Timber, sawn softwood — density column')),
  },

  // ── Masonry ─────────────────────────────────────────────────────────────────
  'brick-red': GENERIC_CLAY_BRICK,
  'brick-buff': GENERIC_CLAY_BRICK,
  'brick-grey': GENERIC_CLAY_BRICK,
  'brick-dark': GENERIC_CLAY_BRICK,

  // ── Glass ───────────────────────────────────────────────────────────────────
  'glass-clear': {
    carbonA1A3: kgFactor(
      1.44,
      ICE('Glass, primary/flat (float)'),
      'PRIMARY FLOAT GLASS ONLY. Toughening, coating, laminating and IGU assembly each add '
      + 'to this and are NOT included — which is why the coated, toughened and tinted glass '
      + 'rows carry no factor.',
    ),
    density: density(2500, EN1991('Table A.5 — glass in sheets, 25 kN/m³')),
  },

  // ── Boards ──────────────────────────────────────────────────────────────────
  'gypsum-plasterboard': {
    carbonA1A3: kgFactor(0.39, ICE('Plasterboard (gypsum wallboard)')),
    density: density(700, ICE('Plasterboard — density column')),
  },

  // ── Insulation — FACTOR BUT NO DENSITY, DELIBERATELY ────────────────────────
  //
  // ⭐ These two rows are the honest shape of a HALF-KNOWN material, and they are
  // here on purpose. Mineral wool ships anywhere from 23 to 150 kg/m³ and EPS from
  // 15 to 35; the density is a SPECIFICATION DECISION, not a property of "mineral
  // wool". Picking one would silently multiply every insulation line by a number
  // nobody chose.
  //
  // So the factor is shipped, the density is not, and `carbonPerCubicMetre()`
  // returns `NO_DENSITY` — which the 6D surface renders as NOT MEASURED with the
  // reason, and which the user closes by entering the density of the product they
  // have actually specified.
  'insulation-mineral-wool': {
    carbonA1A3: kgFactor(
      1.28,
      ICE('Mineral wool (rock/stone wool) insulation'),
      'NO DENSITY IS SHIPPED. Mineral wool ranges roughly 23-150 kg/m³ depending on the '
      + 'product specified; enter the density of YOUR product to complete this line.',
    ),
  },
  'insulation-eps': {
    carbonA1A3: kgFactor(
      3.29,
      ICE('Expanded polystyrene (EPS) insulation'),
      'NO DENSITY IS SHIPPED. EPS ranges roughly 15-35 kg/m³ by grade; enter the density of '
      + 'YOUR product to complete this line.',
    ),
  },
});

/** Look up carbon facts for a material id. `undefined` on a miss — NEVER a substitute. */
export function findCarbonFacts(materialId: string): MaterialCarbonFacts | undefined {
  return CARBON_FACTOR_TABLE[materialId];
}

/**
 * Ids in {@link CARBON_FACTOR_TABLE} that do not exist in the supplied catalogue.
 *
 * A factor attached to a non-existent material never applies to anything and can
 * never be noticed by looking at the 6D surface — it simply contributes nothing,
 * forever. The catalogue is passed in rather than imported so this stays a pure
 * function over data and cannot create an import cycle with `materialCatalog.ts`,
 * which consumes this module.
 */
export function carbonFactorOrphans(catalogIds: Iterable<string>): string[] {
  const known = new Set(catalogIds);
  return Object.keys(CARBON_FACTOR_TABLE).filter((id) => !known.has(id)).sort();
}

/** How many materials ship a factor. Cite this, never a number written in prose. */
export const SHIPPED_CARBON_FACTOR_COUNT = Object.keys(CARBON_FACTOR_TABLE).length;
