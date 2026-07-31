// Madrid (28079) — instrument precedence, as data.
//
// Source: `es/es-md/28079-madrid/findings/COMPENDIO-2025-EXTRACTION-01.md` §5,
// which read Título 8 and Capítulo 3.2 of the Compendio 2025 de las NNUU del
// PGOUM-97 (24-09-2025).
//
// 🔴 THE HEADLINE, AND THE REASON THIS TABLE LOOKS SPARSE:
// **The PGOUM contains NO article stating a global precedence order** across Norma
// Zonal / área de planeamiento / catálogo. The ordering below is ASSEMBLED from four
// independently-scoped clauses (8.0.6, 8.0.4, 3.2.7, 3.2.10, 3.2.13). Anything those
// clauses do not cover is left UNRANKABLE, which makes the resolver refuse rather
// than guess.
//
// Art. 8.0.6 is the only clean, express precedence rule in Título 8, and its scope is
// precise and NARROW (PDF p366, printed 364):
//
//   "Cuando un edificio … se encuentren incluidos en alguno de los Catálogos de
//    Protección, EL RÉGIMEN DE OBRAS previsto en el Título 4 de estas Normas tendrá
//    preferencia sobre las que autorice la norma zonal por la que se regule.
//    Igualmente LAS CONDICIONES ESPECIALES DEL USO DE HOSPEDAJE reguladas en el
//    artículo 4.3.8, apartado 7, tendrán preferencia respecto a las condiciones de
//    usos regulados en la norma zonal correspondiente."
//
// It does NOT say the catalogue overrides FAR, height or coverage. A catalogued
// building in NZ 4 still takes its 12 m fondo and its street-width height table;
// what changes is which WORKS may be carried out on it. So `catalogue-overlay` is
// ranked ONLY through the per-parameter override below, and is unrankable elsewhere.
//
// This table is the reason `parameterOverrides` exists. The feature came from SPAIN.

import { type InstrumentPriorityTable } from '../priority.js';

/** The two parameters Art. 8.0.6 actually names. Not envelope fields — on purpose. */
export const MADRID_CATALOGUE_OVERRIDE_PARAMETERS: readonly string[] = [
    'worksRegime',
    'hospedajeUseConditions',
];

export const MADRID_PRIORITY_TABLE: InstrumentPriorityTable = {
    jurisdiction: 'es-md',
    displayName: 'Madrid (PGOUM-97, Compendio 2025)',
    citation:
        'Assembled from Arts. 8.0.4, 8.0.6, 3.2.7, 3.2.10, 3.2.13 of the Compendio 2025 ' +
        'de las NNUU del PGOUM-97 (24-09-2025) — COMPENDIO-2025-EXTRACTION-01.md §5.',
    rank: {
        // Art. 8.0.4 partitions urban land into FOUR MUTUALLY EXCLUSIVE área classes.
        // Where an API/APE/APR applies, that área's regime is the primary source — the
        // Norma Zonal does NOT sit "underneath" it as a default; it substitutes.
        'special-plan': 0,
        // The Normas Zonales govern *ordenación directa* land.
        'binding-plan': 1,
        'superseded-plan': 2,
        // `catalogue-overlay` DELIBERATELY ABSENT from the base map — Art. 8.0.6's
        // override is narrow and lives in `parameterOverrides` below. `depiction` and
        // `statute` absent: no Spanish equivalent has been researched.
    },
    parameterOverrides: [
        {
            parameters: MADRID_CATALOGUE_OVERRIDE_PARAMETERS,
            rank: {
                'catalogue-overlay': 0,
                'special-plan': 1,
                'binding-plan': 2,
                'superseded-plan': 3,
            },
            citation:
                'Art. 8.0.6 (PDF p366, printed 364) — "el régimen de obras previsto en el ' +
                'Título 4 … tendrá preferencia sobre las que autorice la norma zonal"; and ' +
                'the Art. 4.3.8.7 hospedaje conditions likewise.',
        },
    ],
    note:
        'HONEST LIMIT (COMPENDIO-2025-EXTRACTION-01.md §5.3): the Compendio contains NO ' +
        'article stating a global precedence order across Norma Zonal / área de ' +
        'planeamiento / catálogo. This table is assembled from four independently-scoped ' +
        'clauses. Where a real parcel carries both a catalogue listing and an APE ficha ' +
        'that are silent on each other, the source document does not resolve it and ' +
        'neither does this table — the ficha must be read. ' +
        'Consequently NZ 7 grado 2º nivel "e" FAR (Art. 8.7.9 = 0,5 vs Art. 8.7.20 = 1,0) ' +
        'ties on authority and resolves to `conflicted`. Art. 8.7.20 IS the more specific ' +
        'provision and a Spanish planner would likely apply lex specialis — but the ' +
        'Compendio has NO express derogation clause, so encoding that would be an ' +
        'unsourced legal opinion. UNKNOWN: whether these four clauses are the complete ' +
        'set; the extraction read Título 8 and Capítulo 3.2, not the whole Compendio.',
};
