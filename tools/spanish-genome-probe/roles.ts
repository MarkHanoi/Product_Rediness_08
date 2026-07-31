/**
 * ROLE PROFILES — predict a layer's ROLE, not generic "planning-ness".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ HONESTY HEADER — THIS FILE IS POST-HOC. READ BEFORE QUOTING ANY NUMBER.
 * ─────────────────────────────────────────────────────────────────────────────
 * The role refinement was specified by the coordinator AFTER the blind València
 * run had already been executed and committed (`8b557bf7`). Therefore:
 *
 *   • Role-scored results are **NOT a blind test**. They are a post-hoc analysis.
 *   • The blind single-score result stands as the experiment's primary evidence
 *     and is reported unchanged.
 *   • `heuristics.ts` is deliberately NOT modified, so its pre-registration
 *     SHA-256 still verifies. Everything role-specific lives here.
 *
 * Contamination mitigation actually applied (stated so it can be checked):
 *   1. Every token below is justified by a **Madrid** layer/folder or by the
 *      founder corpus (module 2's role list, Sevilla batch 18a's name→role
 *      table). A `why` string records the justification for each profile.
 *   2. NO token was chosen because it appears in a València layer name. The
 *      specific València decoys observed in the blind run — "Zonas Acústicamente
 *      Saturadas", "Ordenanza Espacios Públicos", "Zones ZAS" — are deliberately
 *      NOT special-cased. If the role scorer still ranks them highly, that is
 *      reported as a residual defect, not patched away.
 *   3. The role scorer is verified on Madrid first, and Madrid's role ranks are
 *      locked by tests, exactly as the single scorer's were.
 *
 * The roles are the coordinator's list, which matches founder module 2
 * ("Zoning / Alignment / Building conditions / Uses / Protected buildings /
 * Management") and Sevilla batch 18a's classifier table.
 */

import type { OntologyKey, Token } from './heuristics.js';

export type LayerRole =
  | 'zone-routing'
  | 'derived-plan'
  | 'parcel'
  | 'building-condition'
  | 'alignment'
  | 'heritage'
  | 'use';

/**
 * Tokens that mark an *urban-planning* context, as opposed to any other
 * municipal domain. Justification is Madrid's own catalogue: its folder list
 * includes `ORDENANZAS` (municipal by-laws: parking zones, terraces — NOT
 * planning), `MOVILIDAD`, `MEDIO_AMBIENTE`, `ESTADISTICA`. The word `ordenanza`
 * alone therefore does NOT establish a planning context in Spain; `PGOU`,
 * `urbanístic*`, `planeamiento`, `calificación`, `norma zonal` do.
 */
export const PLANNING_CONTEXT_TOKENS: readonly string[] = [
  'pgou', // MAD — PGOUM97 folder
  'pgom',
  'poum', // founder §28 — Catalan instrument, same family
  'urbanistic', // MAD — "Parcelas Urbanísticas", "AMBITOS_PLANEAMIENTO_URBANISTICO"
  'urbanismo', // MAD — URBANISMO folder
  'urbanisme',
  'planeamiento', // MAD — PLANEAMIENTO_URBANISTICO
  'planejament',
  'calificacio', // B11
  'qualificacio', // B11 equivalent in the other co-official spelling
  'zonificacio', // B11
  'norma zonal', // MAD — the exact Madrid instrument
  'normas zonales',
  'ordenacion', // MAD — PG_ORDENACION
  'ordenacio',
  'desarrollo urbano', // MAD — DESARROLLO_URBANO_ACTUALIZADO folder
  'suelo', // MAD — USOS_SUELO, "clases de suelo"
  'sol',
];

export interface RoleProfile {
  readonly role: LayerRole;
  /** Madrid layer this role is calibrated against, for the test lock. */
  readonly madridGroundTruth: string | null;
  readonly why: string;
  readonly nameTokens: readonly Token[];
  /** Role-specific demotions: signals that mean "this is a DIFFERENT role". */
  readonly negativeTokens: readonly Token[];
  /** Ontology keys that evidence this role, and their weight. */
  readonly ontology: Partial<Record<OntologyKey, number>>;
  /** Areal roles want polygons; alignment is linear. */
  readonly wantsGeometry: 'polygon' | 'polyline' | 'any';
  /** If true, a planning-context token must appear somewhere or the layer is penalised. */
  readonly requiresPlanningContext: boolean;
}

const T = (t: string, w: number, src: Token['src']): Token => ({ t, w, src });

export const ROLE_PROFILES: readonly RoleProfile[] = [
  {
    role: 'zone-routing',
    madridGroundTruth: 'NORMAS_ZONALES/MapServer/0',
    why:
      'Answers "which zoning applies to this parcel". Madrid: Normas Zonales, ' +
      'carrying AMB_TX_ETIQ (zone code) + AMB_TX_DENOM (official designation). ' +
      'Demotes ámbito/ordenación because in Madrid those name the derived-plan layer.',
    nameTokens: [
      T('norma', 20, 'B11'),
      T('zona', 18, 'SEV'),
      T('calificacio', 20, 'B11'),
      T('qualificacio', 20, 'B11'),
      T('zonificacio', 20, 'B11'),
      T('clasificacio', 12, 'B11'),
      T('suelo', 8, 'MAD'),
      T('pgou', 12, 'MAD'),
      T('urbanistic', 8, 'SEV'),
    ],
    negativeTokens: [
      // Each of these names a DIFFERENT Madrid role.
      T('ambito', -15, 'MAD'), // → derived-plan (PG_ORDENACION)
      T('ordenacio', -8, 'MAD'), // → derived-plan
      T('catalogo', -20, 'MAD'), // → heritage (CATALOGO2021)
      T('proteccio', -15, 'MAD'), // → heritage
      T('alineacio', -20, 'MAD'), // → alignment
      T('condicion', -12, 'MAD'), // → building-condition
      T('parcela', -8, 'MAD'), // → parcel
      T('catastr', -15, 'MAD'), // → parcel
      T('expediente', -15, 'MAD'), // → management (EXPEDIENTES_PLANEAMIENTO_AD)
      T('gestion', -12, 'MAD'), // → management (GESTION_URBANA)
    ],
    ontology: { zoneCode: 30, officialDesignation: 15, permittedUse: 5 },
    wantsGeometry: 'polygon',
    requiresPlanningContext: true,
  },
  {
    role: 'derived-plan',
    madridGroundTruth: 'PG_ORDENACION/MapServer/3',
    why:
      'Detects instruments that OVERRIDE the base zoning. Madrid: Ámbitos de ' +
      'Ordenación (APR/APE/API), carrying CODAMBORD + TIPOAMB. Founder names ' +
      "València's equivalents as PRI/PEPRI and Barcelona's as MPGM/PEU/PMU.",
    nameTokens: [
      T('ambito', 22, 'B11'),
      T('ambit', 22, 'B11'),
      T('ordenacio', 18, 'SEV'),
      T('planeamiento', 16, 'SEV'),
      T('planejament', 16, 'SEV'),
      T('plan especial', 20, 'MAD'),
      T('pla especial', 20, 'MAD'),
      T('desarrollo', 10, 'MAD'),
      T('actuacio', 12, 'MAD'),
      T('sector', 10, 'MAD'),
      T('unidad de ejecucion', 14, 'MAD'),
      T('expediente', 10, 'MAD'),
      T('modificacio', 10, 'MAD'),
      T('reforma interior', 16, 'MAD'),
      T('estudio de detalle', 16, 'MAD'),
    ],
    negativeTokens: [
      T('calificacio', -10, 'MAD'), // → zone-routing
      T('norma', -8, 'MAD'), // → zone-routing
      T('catalogo', -15, 'MAD'),
      T('alineacio', -15, 'MAD'),
      T('catastr', -12, 'MAD'),
    ],
    ontology: { planningAreaType: 25, zoneCode: 12, officialDesignation: 12 },
    wantsGeometry: 'polygon',
    requiresPlanningContext: true,
  },
  {
    role: 'parcel',
    madridGroundTruth: null,
    why:
      'The geometry the user clicks. Madrid resolves planning SPATIALLY from a ' +
      'coordinate (batch 3 PART B: "Madrid does NOT use Catastro refcat as join"), ' +
      'so this role exists to answer whether another city offers a KEY join instead.',
    nameTokens: [
      T('parcela', 22, 'MAD'),
      T('parcel', 22, 'MAD'),
      T('catastr', 22, 'MAD'),
      T('cadastr', 22, 'MAD'),
      T('manzana', 14, 'MAD'),
      T('illa', 10, 'MAD'),
      T('solar', 12, 'MAD'),
      T('finca', 12, 'MAD'),
    ],
    negativeTokens: [T('catalogo', -12, 'MAD'), T('alineacio', -12, 'MAD')],
    ontology: { zoneCode: 6 },
    wantsGeometry: 'polygon',
    requiresPlanningContext: false,
  },
  {
    role: 'building-condition',
    madridGroundTruth: 'PG_CONDICIONES_EDIFICACION/MapServer/6',
    why:
      'Machine-readable envelope geometry/parameters. Madrid: Condiciones de la ' +
      'Edificación (NZ1 footprint) carrying CODMANZANA/NUMORD/COEF_Z. This is the ' +
      'role the single scorer could NOT find even on Madrid (#24) — precisely ' +
      'because it carries no zone code, which is why role separation was needed.',
    nameTokens: [
      T('condicion', 22, 'MAD'),
      T('condicio', 22, 'MAD'),
      T('edificacio', 18, 'SEV'),
      T('edificabilidad', 20, 'P41'),
      T('edificabilitat', 20, 'P41'),
      T('altura', 18, 'P41'),
      T('alcada', 18, 'P41'),
      T('volumetr', 18, 'MAD'),
      T('fondo', 14, 'P41'),
      T('ocupacio', 14, 'P41'),
      T('aprovechamiento', 16, 'P41'),
    ],
    negativeTokens: [T('catalogo', -12, 'MAD'), T('alineacio', -10, 'MAD'), T('expediente', -10, 'MAD')],
    ontology: {
      coefficient: 22,
      maxHeight: 22,
      maxFloors: 20,
      far: 22,
      coverage: 18,
      buildableDepth: 20,
      setback: 18,
    },
    wantsGeometry: 'polygon',
    requiresPlanningContext: true,
  },
  {
    role: 'alignment',
    madridGroundTruth: null,
    why:
      'Madrid NZ4 is alignment-based, not setback-based (batch 3b §5): the rule is ' +
      'alineación + fondo edificable. Madrid exposes Alineaciones (per batch 3b §9, ' +
      'in PG_GESTION). Linear geometry, so it wants polylines rather than polygons.',
    nameTokens: [
      T('alineacio', 28, 'P41'),
      T('alineamiento', 24, 'P41'),
      T('rasante', 16, 'MAD'),
      T('vial', 8, 'MAD'),
      T('retranqueo', 14, 'P41'),
    ],
    negativeTokens: [T('catalogo', -12, 'MAD')],
    ontology: { alignment: 22, setback: 18 },
    wantsGeometry: 'polyline',
    requiresPlanningContext: false,
  },
  {
    role: 'heritage',
    madridGroundTruth: null,
    why:
      'Protected buildings are one of the four things the founder lists as ' +
      'preventing 100% (batch 3b). Madrid: the CATALOGO2021 folder. Spanish ' +
      'national instrument names BIC / BRL are statutory, not city-specific.',
    nameTokens: [
      T('catalogo', 24, 'MAD'),
      T('cataleg', 24, 'MAD'),
      T('proteccio', 22, 'MAD'),
      T('protegit', 20, 'MAD'),
      T('patrimoni', 22, 'MAD'),
      T('bic', 18, 'MAD'),
      T('brl', 18, 'MAD'),
      T('historic', 14, 'MAD'),
      T('monument', 16, 'MAD'),
    ],
    negativeTokens: [],
    ontology: {},
    wantsGeometry: 'any',
    requiresPlanningContext: false,
  },
  {
    role: 'use',
    madridGroundTruth: null,
    why: 'Madrid: PG_USOS_Y_ACTIVIDADES. Permitted/conditional/prohibited uses are §26 primitives.',
    nameTokens: [T('uso', 20, 'P41'), T('usos', 20, 'P41'), T('us ', 12, 'P41'), T('actividad', 18, 'P41'), T('activitat', 18, 'P41')],
    negativeTokens: [T('catalogo', -12, 'MAD')],
    ontology: { permittedUse: 22 },
    wantsGeometry: 'polygon',
    requiresPlanningContext: true,
  },
];
