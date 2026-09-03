/**
 * RegionalBuildingCost — 5D. A BUILDING-LEVEL €/m² published by an official
 * bulletin, keyed to the parcel's jurisdiction, and the numbers it actually
 * ships.
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C66 §1.1 (a price that has not been sourced is a CLAIM),
 *           C100 §5 (a miss is a miss, never a substitute),
 *           C03 (pure read model; no I/O, no clock in any exported function).
 * ADR:      ADR-0350 §5D, amended by ADR-0365 §2 (this module).
 * Issue:    §REGIONAL-BUILDING-COST (L-9100..L-9107), lane RATE53.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS IS A SEPARATE MODULE FROM `RegionalRates.ts`, AND NOT A ROW IN IT
 * ═════════════════════════════════════════════════════════════════════════════
 * `RegionalRates.ts` holds `RegionalRate` — a PER-LINE unit price
 * (`FIN.WALL.plaster-inner`, €/m²). It ships zero of them and, after this lane
 * read the licences, it still ships zero: no per-trade price base covering
 * Catalonia has a licence that permits redistribution (see
 * {@link RATE_SOURCE_CANDIDATES} — BEDEC is a per-seat subscription).
 *
 * The source that DID clear publishes something structurally different: **one
 * €/m² for the whole building, by typology.** Those two numbers cannot be stored
 * in the same table.
 *
 * ⛔ AND THE TEMPTING BRIDGE BETWEEN THEM IS THE FABRICATION THIS FILE EXISTS TO
 * REFUSE. Given "1.428,96 €/m² for a dwelling" and a 42-line take-off, it is
 * trivial to invent trade percentages — "plaster is about 4 %" — and emit 42
 * per-line rates that look sourced. Every one of them would be a number this
 * repo made up, wearing a BOPB citation. `estimateBuildingCost()` therefore
 * returns exactly ONE figure for the WHOLE building and there is no code path
 * here that divides it across lines. See ADR-0365 §4.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT A MODULE IS, AND THE THREE THINGS IT IS NOT
 * ═════════════════════════════════════════════════════════════════════════════
 * The shipped figure is an **administrative reference cost of material execution
 * (cost d'execució material / PEM)** published in a fiscal ordinance so that a
 * building-licence tax can be computed when no certified budget is presented.
 *
 * It is therefore NOT:
 *   • a market quotation — a contractor's tender in Barcelona may sit either
 *     side of it, and the ordinance says nothing about which;
 *   • a total project cost — professional fees, contractor's profit, general
 *     expenses, VAT and other taxes are EXCLUDED BY THE ORDINANCE'S OWN ARTICLE
 *     8, and that exclusion list is carried verbatim in {@link notCovered};
 *   • a per-trade rate — see the block above.
 *
 * All three are stated in {@link BuildingCostEstimate.statement}, which is
 * generated HERE rather than in the UI so that a second surface cannot render
 * the figure without them.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHERE THE GEOGRAPHY COMES FROM
 * ═════════════════════════════════════════════════════════════════════════════
 * The SAME ladder `resolveRegionalRates()` runs, from the SAME
 * `CostJurisdictionBinding` built at the composition surface out of the ONE
 * existing resolver (`resolveRegisteredJurisdictionAt`). The rung walk is
 * `walkJurisdictionLadder()` in `RegionalRates.ts` — imported, not re-written,
 * because two ladders is how two answers to "where is this?" start disagreeing
 * (C68 §5.d).
 *
 * ⛔ NO INTERPOLATION, exactly as on the per-line path. A project in Girona does
 * NOT get Barcelona's module because it is nearby, and a project in Spain does
 * not get it because it is Spanish. The ordinance is Barcelona's own municipal
 * law and it binds inside Barcelona; the book declares `extent: 'municipal'` and
 * exactly one jurisdiction key, and everywhere else gets a refusal with a reason.
 */

import type { TakeoffResult } from './TakeoffTypes.js';
import {
  walkJurisdictionLadder,
  type CostJurisdictionBinding,
  type RateMatchTier,
  type RatePriceProvenance,
} from './RegionalRates.js';

// ── The model ─────────────────────────────────────────────────────────────────

/**
 * ONE typology row of a published module table.
 *
 * ⭐ BOTH THE COEFFICIENT AND THE PUBLISHED VALUE ARE CARRIED, and
 * {@link buildingCostRowsThatDisagreeWithTheirModule} asserts they agree. The
 * source prints both, and transcribing only one of them would throw away the
 * only self-check available on a hand-copied table: a mistyped digit in
 * `ratePerAreaM2` is invisible on its own and obvious next to
 * `basicModuleRatePerM2 × coefficient`.
 *
 * ⛔ `ratePerAreaM2` IS THE PUBLISHED NUMBER, NOT THE PRODUCT. Where the source's
 * own arithmetic rounds differently from ours — and in Barcelona's group VI it
 * does, by 0.008 € — the source's number is the one that has legal force and
 * the one a reader will check us against.
 */
export interface BuildingCostGroup {
  /** The source's own row identifier, e.g. the Roman numeral `'VI'`. */
  readonly groupId: string;
  /** English label for the UI. */
  readonly label: string;
  /** The source's OWN words, in the source's language. Never a translation only. */
  readonly labelInSource: string;
  /** The published multiplier applied to the basic module. */
  readonly coefficient: number;
  /** The published €/m² for this row. See the ⛔ above: published, not derived. */
  readonly ratePerAreaM2: number;
}

/**
 * A published multiplier applied AFTER the typology rate, for works that are not
 * a whole new building. Never applied by default — see {@link estimateBuildingCost}.
 */
export interface BuildingCostCorrection {
  readonly correctionId: string;
  readonly label: string;
  readonly labelInSource: string;
  readonly factor: number;
}

export interface RegionalBuildingCostModel {
  /** Stable id, `<jurisdiction-key>-<instrument-slug>-<year>`. Shown to the user. */
  readonly modelId: string;
  readonly displayName: string;
  /** ISO 3166-1 alpha-2, lowercase. */
  readonly countryCode: string;
  readonly extent: 'municipal' | 'regional' | 'national';
  /**
   * The registered `jurisdictionId` literals this instrument binds inside — the
   * same strings `resolveRegisteredJurisdictionAt()` returns. A municipal
   * ordinance names exactly one.
   */
  readonly jurisdictionKeys: readonly string[];
  /** ISO-4217. The instrument states its own currency; never assumed. */
  readonly currency: string;
  /**
   * WHAT the €/m² measures, in words — the single most misreadable thing about
   * this figure. Rendered next to the number, always.
   */
  readonly costBasis: string;
  /** The published base value every coefficient multiplies. */
  readonly basicModuleRatePerM2: number;
  readonly groups: readonly BuildingCostGroup[];
  readonly corrections: readonly BuildingCostCorrection[];
  /**
   * What the figure EXCLUDES, in the instrument's own terms. Required and
   * non-empty: a €/m² whose exclusions are unstated will be read as a project
   * cost, and it is not one.
   */
  readonly notCovered: readonly string[];
  readonly provenance: RatePriceProvenance;
}

// ── What ships ────────────────────────────────────────────────────────────────

/**
 * §REGIONAL-BUILDING-COST (L-9100) — BARCELONA. The first regional cost figure
 * PRYZM has ever shipped.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE LICENCE, READ — AND IT IS A THREE-WAY CONVERGENCE, NOT AN ASSUMPTION
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. **The instrument is not copyrightable at all.** Spain's Ley de Propiedad
 *    Intelectual (RDLeg 1/1996) **Art. 13**, verbatim: *"No son objeto de
 *    propiedad intelectual las disposiciones legales o reglamentarias y sus
 *    correspondientes proyectos, las resoluciones de los órganos
 *    jurisdiccionales y los actos, acuerdos, deliberaciones y dictámenes de los
 *    organismos públicos, así como las traducciones oficiales de todos los
 *    textos anteriores."* An *ordenança fiscal* approved by the Plenari del
 *    Consell Municipal is a *disposición reglamentaria*. **This is the sentence
 *    that decided it.**
 * 2. **The publisher's own catalogue entry says CC BY 4.0.** `datos.gob.es`, the
 *    Spanish government's official open-data catalogue, lists the BOPB dataset
 *    under **Creative Commons Attribution 4.0**, across all its distributions.
 *    That supplies the attribution condition, which {@link provenance} honours by
 *    naming publisher, instrument, edition, date and CVE on the panel itself.
 * 3. ⚠ **AND THE OBVIOUS REFUSAL IS A REFUSAL ABOUT THE WRONG PRODUCT** —
 *    §BULK-VS-QUERY-ENDPOINT-FALSE-REFUSALS, for the tenth time in this repo.
 *    `bop.diba.cat/avis-legal` says *"Queda totalment prohibit distribuir,
 *    copiar, modificar o trametre tant el contingut com el codi de les
 *    pàgines"*. Read at a glance that kills this source. Read carefully, its
 *    object is **les pàgines** — the BOPB web portal — and a portal's terms of
 *    use cannot create a property right in a municipal regulation that Art. 13
 *    places outside intellectual property in the first place. The thing being
 *    refused was not the thing needed.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE NUMBERS — TRANSCRIBED FROM THE PDF, AND CHECKED TWICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Read from the official PDF at
 * `ajuntament.barcelona.cat/hisenda/.../2.1-ordenanca-icio.pdf`, Annex A §1,
 * published **BOPB 2 February 2026, CVE 202610021075**, approved by the Plenari
 * del Consell Municipal **30 January 2026**.
 *
 * Annex A §1 verbatim: *"El valor del mòdul bàsic és de 866,04 €/m2 sobre el qual
 * s'aplicaran els coeficients següents"*.
 *
 * ⚠ The table was extracted TWICE, with `pdftotext -layout` and with
 * `pdftotext -raw`, because the first mode splits a wrapped label across lines
 * and leaves the coefficient and value columns free to slip against each other.
 * The `-raw` pass puts each row's coefficient and value adjacent on one line and
 * confirmed the pairing. `buildingCostRowsThatDisagreeWithTheirModule()` is the
 * third check and runs in CI.
 */
export const ES_BARCELONA_ICIO_2026: RegionalBuildingCostModel = Object.freeze({
  modelId: 'es-08019-barcelona-icio-2026',
  displayName: 'Barcelona — ICIO fiscal ordinance 2.1, Annex A (2026)',
  countryCode: 'es',
  extent: 'municipal',
  jurisdictionKeys: Object.freeze(['es-08019-barcelona']),
  currency: 'EUR',
  costBasis:
    'Cost of MATERIAL EXECUTION (cost d’execució material / PEM) per m² of built area, as the '
    + 'ordinance defines the ICIO tax base in its Art. 8. It is an administrative reference figure '
    + 'used when no certified budget is presented — NOT a market quotation and NOT a project total.',
  basicModuleRatePerM2: 866.04,
  groups: Object.freeze([
    {
      groupId: 'I',
      label: 'Monumental architecture',
      labelInSource: 'Arquitectura monumental',
      coefficient: 2.75,
      ratePerAreaM2: 2381.61,
    },
    {
      groupId: 'II',
      label: '5-star hotels',
      labelInSource: 'Hotels de 5 estrelles',
      coefficient: 2.55,
      ratePerAreaM2: 2208.40,
    },
    {
      groupId: 'III',
      label: 'Cinemas, clubs, clinics and hospitals, spas, libraries, museums, theatres, transport stations, prisons, 4-star hotels',
      labelInSource: 'Cinemes. Discoteques. Clíniques i hospitals. Balnearis. Biblioteques. Museus. Teatres. Estacions de transports. Presons. Hotels de 4 estrelles',
      coefficient: 2.25,
      ratePerAreaM2: 1948.59,
    },
    {
      groupId: 'IV',
      label: 'Laboratories, office buildings, dwellings over 130 m²',
      labelInSource: 'Laboratoris. Edificis d’oficines. Habitatge de més de 130 m2',
      coefficient: 2.15,
      ratePerAreaM2: 1861.98,
    },
    {
      groupId: 'V',
      label: '3-star hotels, surgeries and medical centres, care homes, dwellings of 90–130 m²',
      labelInSource: 'Hotels de 3 estrelles. Dispensaris i centres mèdics. Residències geriàtriques. Habitatges de 90 a 130 m2',
      coefficient: 1.65,
      ratePerAreaM2: 1428.96,
    },
    {
      groupId: 'VI',
      label: '2-star hotels, schools, student residences, dwellings under 90 m²',
      labelInSource: 'Hotels de 2 estrelles. Escoles. Residències d’estudiants. Habitatges inferiors a 90 m2',
      coefficient: 1.30,
      // ⚠ The ordinance prints 1.125,86 where 866,04 × 1,30 = 1.125,852. The
      // PUBLISHED number is carried; the tolerance in the gate below is one cent
      // precisely so that the source's own rounding is not "corrected" by us.
      ratePerAreaM2: 1125.86,
    },
    {
      groupId: 'VII',
      label: '1-star hotels, guest houses and hostels, protected (social) housing',
      labelInSource: 'Hotels d’una estrella. Pensions i hostals. Habitatges protegits',
      coefficient: 1.00,
      ratePerAreaM2: 866.04,
    },
    {
      groupId: 'VIII',
      label: 'Industrial buildings, warehouses, retail centres and units, covered sports halls',
      labelInSource: 'Edificis industrials. Magatzems, Centres i locals comercials. Pavellons esportius coberts',
      coefficient: 0.85,
      ratePerAreaM2: 736.13,
    },
    {
      groupId: 'IX',
      label: 'Car parks and garages',
      labelInSource: 'Aparcaments, garatges',
      coefficient: 0.55,
      ratePerAreaM2: 476.32,
    },
    {
      groupId: 'X',
      label: 'Outdoor playgrounds, swimming pools, uncovered sports facilities and similar',
      labelInSource: 'Parcs infantils a l’aire lliure. Piscines, instal·lacions esportives descobertes i similars',
      coefficient: 0.30,
      ratePerAreaM2: 259.81,
    },
  ]),
  corrections: Object.freeze([
    {
      correctionId: 'interior-reform',
      label: 'Interior reform — redistribution only, structure untouched or touched at points',
      labelInSource:
        'En les reformes interiors de locals, habitatges o espais comuns, que modifiquen la distribució '
        + 'sense afectar o afectant puntualment l’estructura de l’edifici, el factor corrector serà 0,4',
      factor: 0.4,
    },
    {
      correctionId: 'partial-reform',
      label: 'Partial reform — structure partly affected, principal use unchanged',
      labelInSource:
        'En les reformes parcials de l’edifici que no afectin o afectin parcialment l’estructura i que no '
        + 'impliquin canvi de l’ús principal de l’edifici, el factor corrector serà 0,5',
      factor: 0.5,
    },
  ]),
  notCovered: Object.freeze([
    'VAT and other analogous taxes (Art. 8: "l’impost sobre el valor afegit i altres impostos anàlegs propis de règims especials").',
    'Fees, public prices and other local public charges connected with the works (Art. 8).',
    'Professional fees — architect, engineer, project management (Art. 8: "els honoraris dels professionals").',
    'The contractor’s profit and general expenses (Art. 8: "el benefici empresarial i les despeses generals del/a contractista").',
    'Archaeological survey, excavation, recording and conservation works (Art. 8).',
    'Land, financing, and anything else outside the cost of material execution (Art. 8).',
    'Demolition, site clearance and urbanisation outside the building footprint are separate acts under Art. 3 and are not in this module.',
    'THE FIGURE IS AN ADMINISTRATIVE FISCAL REFERENCE, not a survey of tendered prices. A real tender may sit either side of it.',
  ]),
  provenance: Object.freeze({
    database: 'Ordenança fiscal núm. 2.1 — Impost sobre construccions, instal·lacions i obres (ICIO), Annex A',
    publisher: 'Ajuntament de Barcelona',
    edition: '2026 (approved by the Plenari del Consell Municipal, 30 January 2026)',
    priceDate: '2026-02-02',
    itemCode: 'BOPB CVE 202610021075',
    sourcePath: null,
    sourceToChase:
      'https://ajuntament.barcelona.cat/hisenda/sites/default/files/normativa/2026-02/2.1-ordenanca-icio.pdf '
      + '— Annex A §1. Published in the Butlletí Oficial de la Província de Barcelona, 2 February 2026, '
      + 'CVE 202610021075. Re-read Annex A each January: the ordinance is re-approved annually and the '
      + 'basic module moves.',
    confidence: 'database-cited',
    licence: 'CLEARED_FOR_REDISTRIBUTION',
    licenceNote:
      'Ley de Propiedad Intelectual (RDLeg 1/1996) Art. 13: "No son objeto de propiedad intelectual las '
      + 'disposiciones legales o reglamentarias..." — a municipal fiscal ordinance is a disposición '
      + 'reglamentaria and carries no copyright. Independently, datos.gob.es catalogues the BOPB under '
      + 'CC BY 4.0. The bop.diba.cat portal notice prohibiting copying names "el contingut com el codi de '
      + 'les pàgines" — the web portal, not the regulation it publishes.',
  }),
});

/**
 * ⭐ EVERY SHIPPED BUILDING-COST MODEL. **ONE**, and it is Barcelona's.
 *
 * A second entry is a sourcing task, not a coding one: find an instrument that
 * publishes a €/m² for that jurisdiction, READ ITS LICENCE, and transcribe it
 * with its date. ⛔ Do not add a row by analogy to this one — "Spain publishes
 * these, so Madrid probably has one too" is exactly the reasoning that produces
 * a number nobody sourced.
 */
export const REGIONAL_BUILDING_COST_MODELS: readonly RegionalBuildingCostModel[] =
  Object.freeze([ES_BARCELONA_ICIO_2026]);

/** Cite THIS, never a number written in prose. */
export const SHIPPED_BUILDING_COST_MODEL_COUNT: number = REGIONAL_BUILDING_COST_MODELS.length;

// ── The gates that make the header true rather than aspirational ─────────────

/**
 * ⛔ Returns every shipped model whose licence has not been READ AND CLEARED. A
 * non-empty result means this repo is redistributing something nobody
 * established it may. Identical in intent to
 * `ratesShippedWithoutClearedLicence()`; separate because the two tables are
 * separate.
 */
export function buildingCostModelsShippedWithoutClearedLicence(
  models: readonly RegionalBuildingCostModel[] = REGIONAL_BUILDING_COST_MODELS,
): readonly string[] {
  return models
    .filter((m) => m.provenance.licence !== 'CLEARED_FOR_REDISTRIBUTION')
    .map((m) => m.modelId);
}

/**
 * ⭐ THE TRANSCRIPTION CHECK. A hand-copied table's failure mode is a mistyped
 * digit, and a mistyped €/m² is invisible on its own. Every row's published
 * value must equal `basicModuleRatePerM2 × coefficient` to within ONE CENT —
 * which is the source's own rounding, not a fudge factor: Barcelona's group VI
 * prints 1.125,86 against a product of 1.125,852.
 *
 * Returns `<modelId>/<groupId>` for each row that fails, so a failure names the
 * row instead of merely being false.
 */
export function buildingCostRowsThatDisagreeWithTheirModule(
  models: readonly RegionalBuildingCostModel[] = REGIONAL_BUILDING_COST_MODELS,
): readonly string[] {
  const bad: string[] = [];
  for (const m of models) {
    for (const g of m.groups) {
      const derived = m.basicModuleRatePerM2 * g.coefficient;
      if (Math.abs(derived - g.ratePerAreaM2) > 0.01 + 1e-9) {
        bad.push(`${m.modelId}/${g.groupId}`);
      }
    }
  }
  return bad;
}

/**
 * ⛔ A model that does not say what it EXCLUDES will be read as a project cost.
 * Returns the ids of models with an empty `notCovered` or an empty `costBasis`.
 */
export function buildingCostModelsThatDoNotStateTheirExclusions(
  models: readonly RegionalBuildingCostModel[] = REGIONAL_BUILDING_COST_MODELS,
): readonly string[] {
  return models
    .filter((m) => m.notCovered.length === 0 || m.costBasis.trim().length === 0)
    .map((m) => m.modelId);
}

// ── Resolution ────────────────────────────────────────────────────────────────

export interface ResolvedBuildingCostModels {
  readonly tier: RateMatchTier;
  readonly models: readonly RegionalBuildingCostModel[];
  /** The sentence that MUST accompany any estimate — or explain its absence. */
  readonly statement: string;
}

/**
 * The SAME ladder as `resolveRegionalRates()`, finest first:
 * jurisdiction → region → country → NONE, walked by the SAME
 * {@link walkJurisdictionLadder}.
 *
 * ⛔ THERE IS NO INTERPOLATION. A location no instrument covers gets `'none'`
 * and a sentence saying so — never a neighbour's module, never a national
 * average of the municipal ones PRYZM happens to hold.
 */
export function resolveBuildingCostModels(
  binding: CostJurisdictionBinding | null | undefined,
  all: readonly RegionalBuildingCostModel[] = REGIONAL_BUILDING_COST_MODELS,
): ResolvedBuildingCostModels {
  const none = (why: string): ResolvedBuildingCostModels => ({ tier: 'none', models: [], statement: why });

  if (all.length === 0) {
    return none('PRYZM holds no published building-cost module for anywhere.');
  }
  if (!binding || binding.resolution === 'not-asked') {
    return none(
      'No parcel location has been set, so no jurisdiction can be resolved and no estimate is offered. '
      + 'Pin the site on the map and this figure appears by itself.',
    );
  }
  if (binding.resolution === 'ambiguous') {
    return none(
      'Two jurisdiction registrations claim this parcel and PRYZM will not pick between them. '
      + 'No estimate is offered — a cost module from the wrong municipality is a wrong number, '
      + 'not an approximate one.',
    );
  }

  const hit = walkJurisdictionLadder(binding, all);
  if (hit) {
    const names = hit.matches.map((m) => m.displayName).join(', ');
    return {
      tier: hit.tier,
      models: hit.matches,
      statement:
        `Estimate from ${names}, matched at the ${hit.tier} level for "${hit.key}".`,
    };
  }
  return none(
    `No published building-cost module covers this location (${binding.jurisdictionId ?? binding.countryCode ?? 'unknown'}). `
    + 'PRYZM holds one today — Barcelona\'s — and it does NOT substitute it for anywhere else: a €/m² from '
    + 'the wrong municipality is a wrong number, not an approximate one. To add yours, find the instrument '
    + 'that publishes a €/m² for that jurisdiction and read its licence.',
  );
}

// ── The area the estimate multiplies ─────────────────────────────────────────

/**
 * WHICH measured area was used as the built area, and WHY it is a proxy.
 *
 * ⭐ THE PROXY IS NAMED, NOT HIDDEN. The ordinance multiplies *"el nombre de
 * metres quadrats de superfície construïda o reformada"* — GROSS built area,
 * measured to the outside of the envelope. PRYZM does not compute that quantity
 * anywhere. It computes slab plan area, which is close, and floor-finish area,
 * which is smaller (it excludes the walls). Neither IS gross built area, so the
 * one used is named on the panel and the reader can judge the error.
 *
 * ⭐ `'envelope-study-gfa'` (lane RESI-ORCHESTRATOR, 2026-09-03) IS A FOURTH NAMED
 * PROXY, AND IT IS THE WEAKEST OF THE FOUR BY CONSTRUCTION. The other three are
 * measured off drawn geometry. This one is a STUDY figure taken from a buildable
 * envelope — footprint × storeys — on a project where nothing has been drawn yet,
 * which is precisely the stage at which an INDICATIVE order of magnitude is worth
 * having and a PRICE is not. It is admitted here rather than in a rival type for
 * one reason: `estimateBuildingCost` generates the sentence that must accompany
 * every figure, and that sentence is built from `basis` + `caveat`. A second
 * estimator for the envelope stage would be a second producer of the number AND
 * of its provenance, and the two would drift. So the caller supplies the honest
 * `basis`/`caveat` and the ONE estimator still writes the ONE statement.
 *
 * ⛔ It is a proxy for a proxy, and its `caveat` must say so. A study GFA is not a
 * measurement of anything; it is what the ordinance would permit if it were built
 * out in full.
 */
export interface MeasuredBuiltArea {
  readonly areaM2: number;
  readonly proxy:
    | 'slab-plan-area'
    | 'floor-plan-area'
    | 'room-finish-area'
    | 'envelope-study-gfa';
  /** How the number was reached, in words, for the panel and the CSV. */
  readonly basis: string;
  /** Which take-off lines contributed, so the figure is traceable. */
  readonly lineCodes: readonly string[];
  /** How this proxy differs from the quantity the source asks for. Never empty. */
  readonly caveat: string;
}

/** Sum a take-off's `SLAB.*` lines by their `Plan area` secondary measure. */
function slabPlanArea(t: TakeoffResult): { area: number; codes: string[] } {
  let area = 0;
  const codes: string[] = [];
  for (const l of t.lines) {
    if (!l.code.startsWith('SLAB.')) continue;
    const plan = l.secondary.find((s) => s.unit === 'm2' && /plan area/i.test(s.label));
    if (!plan || !(plan.value > 0)) continue;
    area += plan.value;
    codes.push(l.code);
  }
  return { area, codes };
}

function sumM2Lines(t: TakeoffResult, prefix: string): { area: number; codes: string[] } {
  let area = 0;
  const codes: string[] = [];
  for (const l of t.lines) {
    if (!l.code.startsWith(prefix) || l.unit !== 'm2' || !(l.quantity > 0)) continue;
    area += l.quantity;
    codes.push(l.code);
  }
  return { area, codes };
}

/**
 * The built area to multiply, derived from the take-off ITSELF so the estimate
 * stands on the same measurement everything else on this panel stands on.
 *
 * The preference order is by CLOSENESS to gross built area, and each rung says
 * how far off it is:
 *   1. `SLAB.*` plan area — structural floor plate, includes the walls above it;
 *   2. `FLOOR.*` plan area — floor construction polygons;
 *   3. `FIN.FLOOR.*` — room floor finishes, i.e. *superfície útil*, the smallest.
 *
 * ⛔ RETURNS `null` WHEN NOTHING MEASURED AN AREA, and null is a real answer: a
 * model with walls but no slabs and no floors has no built area, and inventing
 * one from the wall footprint would be a second measurement engine disagreeing
 * with the first. The caller states the refusal.
 */
export function measuredBuiltArea(takeoff: TakeoffResult): MeasuredBuiltArea | null {
  const slab = slabPlanArea(takeoff);
  if (slab.area > 0) {
    return {
      areaM2: Math.round(slab.area * 100) / 100,
      proxy: 'slab-plan-area',
      basis: `Σ plan area of ${slab.codes.length} measured slab line${slab.codes.length === 1 ? '' : 's'}`,
      lineCodes: slab.codes,
      caveat:
        'Slab plan area is a PROXY for gross built area. It is measured to the slab polygon, so it '
        + 'includes the walls standing on it but excludes any overhang, balcony or envelope thickness '
        + 'beyond the slab edge, and it counts every slab including those the ordinance would treat '
        + 'separately (car park, terrace). PRYZM does not compute superfície construïda.',
    };
  }
  const floor = sumM2Lines(takeoff, 'FLOOR.');
  if (floor.area > 0) {
    return {
      areaM2: Math.round(floor.area * 100) / 100,
      proxy: 'floor-plan-area',
      basis: `Σ plan area of ${floor.codes.length} measured floor line${floor.codes.length === 1 ? '' : 's'} (no slab was measured)`,
      lineCodes: floor.codes,
      caveat:
        'Floor-construction plan area is a PROXY for gross built area, and a SMALLER one than the slab '
        + 'measure this model has no slabs to use. It follows the floor polygons, so wall thickness and '
        + 'envelope are outside it.',
    };
  }
  const finish = sumM2Lines(takeoff, 'FIN.FLOOR.');
  if (finish.area > 0) {
    return {
      areaM2: Math.round(finish.area * 100) / 100,
      proxy: 'room-finish-area',
      basis: `Σ room floor-finish area over ${finish.codes.length} line${finish.codes.length === 1 ? '' : 's'} (no slab and no floor was measured)`,
      lineCodes: finish.codes,
      caveat:
        'Room floor-finish area is SUPERFÍCIE ÚTIL — the usable area inside the rooms. The ordinance '
        + 'multiplies superfície CONSTRUÏDA, which is larger by the walls, the shafts and the shared '
        + 'circulation. This estimate is therefore LOW, and by an amount PRYZM cannot measure. Model '
        + 'the slabs to improve it.',
    };
  }
  return null;
}

// ── The estimate ──────────────────────────────────────────────────────────────

/**
 * §REGIONAL-BUILDING-COST — ONE published figure for the WHOLE building.
 *
 * ⛔ THIS IS NOT A PRICE AND IT IS NOT PART OF ANY TOTAL. `CostSummary` does not
 * carry it, `applyRates()` never sees it, and no field anywhere adds it to
 * `pricedTotal` or `estimatedTotal`. It is computed and rendered on its own.
 */
export interface BuildingCostEstimate {
  readonly modelId: string;
  readonly displayName: string;
  readonly currency: string;
  readonly group: BuildingCostGroup;
  /** `null` ⇒ no correction factor was chosen; the full typology rate applies. */
  readonly correction: BuildingCostCorrection | null;
  readonly area: MeasuredBuiltArea;
  /** `group.ratePerAreaM2 × (correction?.factor ?? 1)`. */
  readonly effectiveRatePerAreaM2: number;
  /** `effectiveRatePerAreaM2 × area.areaM2`. The whole answer, and the only one. */
  readonly amount: number;
  readonly costBasis: string;
  readonly notCovered: readonly string[];
  readonly provenance: RatePriceProvenance;
  /**
   * The sentence that MUST accompany the figure. Generated HERE, not in the UI,
   * so a second surface cannot render the number without what it is.
   */
  readonly statement: string;
}

/**
 * Compute the building-level estimate. Pure, total, and side-effect free.
 *
 * ⛔ `groupId` IS REQUIRED AND HAS NO DEFAULT. The typology decides the rate, and
 * in Barcelona's table it moves the answer by a factor of NINE (259,81 to
 * 2.381,61 €/m²). Defaulting it to "dwelling" would be a guess with a legal
 * citation attached, so an unset typology returns `null` and the panel asks.
 *
 * Returns `null` — never a zero, never a partial figure — when the typology is
 * unknown to the model or no built area could be measured.
 */
export function estimateBuildingCost(
  model: RegionalBuildingCostModel,
  groupId: string | null | undefined,
  area: MeasuredBuiltArea | null | undefined,
  correctionId: string | null | undefined = null,
): BuildingCostEstimate | null {
  if (!groupId || !area || !(area.areaM2 > 0)) return null;
  const group = model.groups.find((g) => g.groupId === groupId);
  if (!group || !Number.isFinite(group.ratePerAreaM2) || group.ratePerAreaM2 < 0) return null;

  const correction = correctionId
    ? (model.corrections.find((c) => c.correctionId === correctionId) ?? null)
    : null;

  const effective = Math.round(group.ratePerAreaM2 * (correction?.factor ?? 1) * 100) / 100;
  const amount = Math.round(effective * area.areaM2 * 100) / 100;

  const statement =
    `≈ ${effective} ${model.currency}/m² × ${area.areaM2} m² (${area.basis}). `
    + `Rate: ${model.displayName}, group ${group.groupId} — ${group.label}`
    + (correction ? `, with the published ${correction.factor} correction for ${correction.label.toLowerCase()}` : '')
    + `. Prices at ${model.provenance.priceDate}, ${model.provenance.itemCode}. `
    + `THIS IS AN ESTIMATE AND IT IS NOT IN THE PRICED TOTAL. ${model.costBasis} `
    + `The area is a proxy: ${area.caveat}`;

  return {
    modelId: model.modelId,
    displayName: model.displayName,
    currency: model.currency,
    group,
    correction,
    area,
    effectiveRatePerAreaM2: effective,
    amount,
    costBasis: model.costBasis,
    notCovered: model.notCovered,
    provenance: model.provenance,
    statement,
  };
}
