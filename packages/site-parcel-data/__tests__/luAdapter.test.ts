// LANE E7-LU — LUXEMBOURG, THE NEAR-FREE COUNTRY. Tested against the FROZEN R-batch shapes.
//
// ══ FIXTURE PROVENANCE — THE STATE'S OWN BYTES, NOT A HAND-WRITTEN SAMPLE (E7-FAMILY §6 G.1) ══
// Every row below was read out of the REAL national artefact by this lane on 2026-09-01:
//
//   manifest  https://data.public.lu/api/1/datasets/pag-geometries-de-tous-les-pag-version-2011-en-vigueur/
//             → 200, license "cc-zero", last_update 2026-08-31T02:35:29+00:00
//   artefact  https://download.data.public.lu/resources/pag-geometries-de-tous-les-pag-version-2011-en-vigueur/20260831-023526/pag.gpkg.zip
//             → 200, 259,912,001 bytes,
//             sha256 6d53fda3ce17be37344c23c93fa1d51a7855bf0e05e9f0d275d1ee990c9c15f1
//             → unzipped 617,377,792 B GeoPackage, read with sqlite3.
//
// RE-RECORD PATH (do this, do not hand-edit a coefficient): download the artefact at the URL the
// manifest currently serves, verify the sha256, then
//   SELECT id, xtf_id, CODE_COM, DENOMINATION, COS_MIN, COS_MAX, CUS_MIN, CUS_MAX, CSS_MAX,
//          DL_MIN, DL_MAX, NOM_FICHIER_EC, NOM_FICHIER_SD_EC, NOM_FICHIER_SD_GR, geom
//     FROM PAG_PAG_NQ_PAP WHERE id IN (1, 2, 43, 122, 1016, 2087);
// decoding `geom` from the GeoPackage binary header + WKB (srs_id 2169), coordinates rounded to
// 3 decimals — millimetres in LUREF, i.e. below the artefact's own precision.
//
// ⛔ WHY THESE ARE FIXTURES AND NOT A LIVE CALL, STATED WITH THE REASON (the acceptance's own
// wording). Luxembourg serves the PAG through NO queryable service — probed 2026-09-01:
// `wfs.geoportail.lu` answers 000/0 bytes; the opendata WMS GetCapabilities (200, 49,503 bytes,
// 58 layers) carries no PAG layer of any kind; every `ogcServers` entry in the geoportail theme
// config declares `"wfsSupport": false`. The ONLY channel is a 260 MB bulk download. So the
// artefact was downloaded IN FULL and its rows replayed here — the live half of the chain (the
// dataset manifest, which carries the licence and the freshness stamp) is exercised through
// `deps.fetchImpl` against the record the portal actually returned.
//
// ══ THE FALSIFICATION TARGET (E7-FAMILY §6 G.4) ══
// SEVER THE PROVENANCE LEG: make `luSourceRef` stop carrying the statutory `article` (or make
// `buildLuRule` stop emitting `valueBasis`) and
// `"§R2 · every coefficient rule carries its OWN statutory denominator, verbatim"` plus
// `"§PROV · the rule's legal address survives into provenance.source"` must go RED by name.
// Executed 2026-09-01; transcript 02 in lane-e7-lu-transcripts/.
//
// ══ THE SCRAMBLE CONTROL (E7-FAMILY §6 G.5 — MANDATORY, and only 1 of 4 sibling suites has one) ══
// `§SCRAMBLE` perturbs the headline fixture's four coefficients and asserts the suite's own
// value assertions would go red — i.e. this suite cannot be passing on arbitrary input.

import { describe, it, expect } from 'vitest';
import { SiteIntelRuleSchema, TRANSIENT_FETCH_REASONS } from '@pryzm/schemas';
import type { SiteIntelRule } from '@pryzm/schemas';
import {
    LUXEMBOURG_BBOX,
    LU_ADAPTER_ENDPOINT_BINDINGS,
    LU_ADAPTER_SOURCES,
    LU_APPLICABILITY_LADDER,
    LU_COEFFICIENT_VOCABULARY,
    LU_NATIVE_CRS,
    LU_NORMATIVE_FORCE,
    LU_NQ_PAP_CENSUS_2026_09_01,
    LU_NUM_CADAST_SENTINEL,
    LU_PAG_ARTEFACT_BYTES_2026_08_31,
    LU_PAG_DATASET_SLUG,
    LU_PAG_SOURCE_ID,
    LU_VALUE_BASIS_CODES,
    LU_VALUE_BASIS_SCHEME,
    buildLuPagDatasetUrl,
    classifyLuCoefficient,
    countLuUnknownRules,
    fetchLuPagManifest,
    isInLuxembourg,
    luCountryAdapter,
    luZoneEntityId,
    mapLuNqPapRowToRules,
    parseLuNqPapRow,
    resolveLuNqPapCandidatesForEnvelope,
    resolveLuParcelByNumCadast,
    resolveLuZoneChain,
    type LuFondDePlanRow,
    type LuLurefEnvelope,
    type LuNqPapRow,
    type LuPagGpkgReader,
    type LuZonageRow,
} from '../src/countryAdapters/lu/index.js';

const FETCHED_AT = '2026-09-01';

// ═══════════════════════════ THE RECORDED ARTEFACT ROWS ═══════════════════════════

/**
 * THE HEADLINE ROW — all four maxima strictly positive, all three minima NULL.
 * `Ell - Um Bierg`, commune C116. This is the row E5-B §A-13 quotes; re-read from the artefact
 * by this lane rather than copied from the report.
 *
 * `PAG_PAG_NQ_PAP` id 2, read from the artefact 2026-09-01.
 */
const ELL_UM_BIERG: LuNqPapRow = {
    id: 2,
    xtfId: "bb78fe47-e2f2-4a53-9696-73337ef387ba",
    codeCom: "C116",
    denomination: "Ell - Um Bierg",
    cosMin: null,
    cosMax: 0.5,
    cusMin: null,
    cusMax: 0.7000000000000001,
    cssMax: 0.75,
    dlMin: null,
    dlMax: 30.0,
    nomFichierEc: "116_PE_PAP_NQ",
    nomFichierSdEc: "116_SD_PE_Ell_Um_Bierg",
    nomFichierSdGr: "116_SD_GR_Ell_Um_Bierg",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[57813.437, 91840.531], [57742.61, 91784.279], [57742.269, 91783.491], [57714.992, 91788.99], [57715.43, 91791.314], [57729.559, 91855.963], [57732.346, 91855.291], [57735.587, 91854.51], [57738.902, 91853.732], [57743.662, 91853.194], [57746.546, 91853.296], [57751.396, 91854.082], [57754.693, 91855.059], [57758.727, 91856.886], [57763.419, 91859.654], [57766.435, 91861.621], [57773.196, 91866.476], [57781.425, 91872.987], [57785.097, 91875.965], [57792.655, 91881.229], [57796.482, 91883.738], [57796.816, 91883.957], [57798.97, 91881.254], [57805.914, 91872.53], [57815.116, 91861.318], [57815.116, 91861.318], [57818.966, 91856.903], [57823.481, 91851.524], [57813.437, 91840.531]]]},
};

/**
 * MINIMA SERVED AS EXPLICIT ZEROS — the other municipal encoding of "no minimum set".
 * Note also the DENOMINATION: the PAP approval reference `REF16354/61C` is inside the NAME
 * string. It is not a served column, so it is never parsed out.
 *
 * `PAG_PAG_NQ_PAP` id 1, read from the artefact 2026-09-01.
 */
const HELFENT_ROUTE_DE_LONGWY: LuNqPapRow = {
    id: 1,
    xtfId: "8743a516-ad4d-4b83-a4f4-3e90b09ee993",
    codeCom: "C061",
    denomination: "Helfent - Route de Longwy-Ouest (PAP approuvé REF16354/61C)",
    cosMin: 0.0,
    cosMax: 0.75,
    cusMin: 0.0,
    cusMax: 1.4,
    cssMax: 0.9,
    dlMin: 0.0,
    dlMax: 65.0,
    nomFichierEc: "061_PE_PAP_NQ",
    nomFichierSdEc: "061_SD_PE_Helfent_Route_de_Longwy",
    nomFichierSdGr: "061_SD_GR_Helfent_Route_de_Longwy",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[72643.481, 73936.146], [72566.769, 73918.186], [72563.899, 73933.7], [72558.306, 73964.536], [72554.706, 73984.806], [72554.709, 73984.807], [72676.737, 74014.137], [72677.181, 74012.422], [72687.565, 73972.306], [72690.014, 73963.053], [72693.832, 73948.292], [72643.481, 73936.146]]]},
};

/**
 * ALL FOUR MAXIMA SERVED AS 0 — one of the 12 rows nationally, and one of the 3 that
 * actually name ZAD. (E5-B says all 12 are ZAD; measured, 5 name "voirie", 1 "(Partie SPEC)"
 * and 3 name neither — see the census correction.)
 *
 * `PAG_PAG_NQ_PAP` id 122, read from the artefact 2026-09-01.
 */
const BEYREN_KALLEK_ZAD: LuNqPapRow = {
    id: 122,
    xtfId: "2e800bdc-1dab-4ff1-8613-b8e68a91a177",
    codeCom: "C097",
    denomination: "Beyren B07 - Kallek (ZAD)",
    cosMin: null,
    cosMax: 0.0,
    cusMin: null,
    cusMax: 0.0,
    cssMax: 0.0,
    dlMin: null,
    dlMax: 0.0,
    nomFichierEc: "097_PE_PAP_NQ",
    nomFichierSdEc: "097_SD_PE_Beyren_B07_Kallek",
    nomFichierSdGr: null,
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[92135.109, 77580.986], [92050.901, 77573.14], [92044.076, 77588.438], [92042.091, 77603.559], [92047.474, 77616.971], [92059.682, 77633.952], [92071.241, 77651.376], [92077.627, 77661.003], [92101.619, 77663.331], [92116.715, 77662.638], [92127.121, 77663.424], [92135.109, 77580.986]]]},
};

/**
 * ALL SEVEN COEFFICIENTS NULL — one of the 7 such rows nationally. Every one of its rules
 * must still be EMITTED, at tier 6.
 *
 * `PAG_PAG_NQ_PAP` id 2087, read from the artefact 2026-09-01.
 */
const HAMM_ZAD_ALL_NULL: LuNqPapRow = {
    id: 2087,
    xtfId: "94ea25a1-3fc3-480f-83e2-c5f6a9e6ceef",
    codeCom: "C026",
    denomination: "Hamm - (ZAD)",
    cosMin: null,
    cosMax: null,
    cusMin: null,
    cusMax: null,
    cssMax: null,
    dlMin: null,
    dlMax: null,
    nomFichierEc: "026_PE_PAP_NQ",
    nomFichierSdEc: null,
    nomFichierSdGr: null,
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[79281.807, 74983.988], [79284.978, 74978.673], [79298.323, 74956.313], [79304.398, 74946.054], [79338.315, 74890.957], [79348.823, 74874.231], [79328.76, 74862.522], [79304.714, 74848.97], [79284.212, 74836.684], [79266.367, 74826.425], [79238.019, 74809.959], [79212.96, 74795.267], [79193.367, 74783.694], [79186.458, 74780.081], [79182.986, 74777.898], [79168.855, 74770.758], [79144.24, 74758.282], [79119.308, 74747.516], [79097.414, 74737.89], [79088.555, 74733.204], [79077.798, 74727.124], [79068.939, 74721.804], [79059.321, 74715.345], [79051.178, 74710.541], [79049.337, 74708.846], [79034.984, 74717.568], [79025.424, 74723.072], [79016.843, 74727.493], [79005.15, 74732.455], [78990.741, 74738.328], [78960.64, 74751.557], [78951.215, 74757.235], [78934.421, 74770.495], [78919.404, 74786.224], [78906.157, 74797.15], [78898.181, 74805.844], [78887.738, 74819.069], [78882.697, 74828.277], [78878.071, 74843.555], [78873.053, 74863.113], [78871.111, 74871.059], [78868.983, 74876.094], [78865.429, 74880.775], [78861.983, 74884.404], [78852.757, 74891.456], [78862.662, 74901.709], [78872.081, 74910.918], [78878.341, 74916.888], [78892.634, 74929.773], [78905.863, 74941.121], [78921.809, 74954.125], [78941.476, 74969.137], [78960.848, 74983.205], [78962.069, 74982.462], [78962.172, 74982.549], [78983.88, 74978.058], [79006.118, 74989.934], [79013.842, 74994.886], [79040.121, 75009.941], [79066.297, 75025.191], [79206.955, 75110.262], [79243.555, 75049.777], [79270.155, 75003.633], [79274.847, 74995.768], [79281.807, 74983.988]]]},
};

/**
 * DL_MAX = 0 BESIDE A POSITIVE COS_MAX — one of the 111 rows nationally where a zero
 * dwelling density sits on buildable land (a gravel works). Coherent as a real value AND
 * indistinguishable from an unfilled slot: nothing served separates the two populations.
 *
 * `PAG_PAG_NQ_PAP` id 43, read from the artefact 2026-09-01.
 */
const MOERSDORF_SCHOTTERWERK: LuNqPapRow = {
    id: 43,
    xtfId: "d0f048e8-2c11-41de-8e4c-66acda6f2981",
    codeCom: "C070",
    denomination: "Moersdorf MD03 - Schotterwerk",
    cosMin: 0.0,
    cosMax: 0.5,
    cusMin: 0.0,
    cusMax: 1.2,
    cssMax: 0.75,
    dlMin: 0.0,
    dlMax: 0.0,
    nomFichierEc: "070_PE_PAP_NQ",
    nomFichierSdEc: "070_SD_PE_Moersdorf_MD03_Schotterwerk",
    nomFichierSdGr: "070_SD_GR_Moersdorf_MD03_Schotterwerk",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[103562.397, 88887.191], [103538.835, 88909.273], [103539.181, 88909.491], [103538.684, 88909.415], [103510.922, 88938.468], [103488.432, 88958.312], [103449.406, 88983.447], [103429.152, 89011.849], [103445.363, 89025.696], [103451.172, 89030.657], [103453.801, 89032.903], [103454.997, 89033.924], [103455.081, 89033.997], [103483.656, 89055.428], [103487.625, 89058.828], [103491.893, 89062.485], [103504.1, 89072.943], [103510.975, 89073.755], [103557.112, 89079.204], [103579.457, 89080.583], [103602.719, 89082.018], [103617.355, 89070.274], [103617.438, 89070.208], [103620.409, 89065.453], [103635.276, 89041.656], [103671.656, 89003.291], [103676.548, 89003.436], [103682.256, 89003.604], [103690.414, 89003.121], [103704.12, 88977.562], [103704.716, 88976.45], [103704.923, 88973.483], [103705.068, 88971.409], [103705.274, 88968.458], [103705.406, 88966.569], [103705.907, 88959.384], [103698.778, 88951.382], [103689.421, 88940.879], [103686.46, 88937.556], [103680.818, 88933.439], [103671.775, 88926.84], [103667.002, 88924.878], [103652.172, 88918.781], [103638.137, 88913.011], [103637.639, 88912.806], [103636.057, 88912.156], [103633.351, 88909.2], [103630.236, 88905.798], [103620.625, 88895.299], [103610.26, 88883.977], [103599.069, 88880.678], [103596.62, 88879.955], [103579.303, 88874.849], [103565.413, 88884.374], [103562.397, 88887.191]]]},
};

/**
 * A STRICTLY POSITIVE COS_MIN — one of only 44 nationally, and the statutory anomaly:
 * Art. 26 permits minima for CUS and DL only. Recorded as served, flagged in the note.
 *
 * `PAG_PAG_NQ_PAP` id 1016, read from the artefact 2026-09-01.
 */
const ROESER_GRAND_RUE: LuNqPapRow = {
    id: 1016,
    xtfId: "655e91b2-bdce-4955-bace-98add9618c74",
    codeCom: "C041",
    denomination: "Roeser 23 - Grand-Rue",
    cosMin: 0.55,
    cosMax: 0.6,
    cusMin: 1.25,
    cusMax: 1.6,
    cssMax: 0.79,
    dlMin: 60.0,
    dlMax: 87.0,
    nomFichierEc: "041_PE_PAP_NQ",
    nomFichierSdEc: "041_SD_PE_Roeser_23_Grand_Rue",
    nomFichierSdGr: null,
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[78176.043, 67186.614], [78209.026, 67238.619], [78218.645, 67232.5], [78234.624, 67224.169], [78246.712, 67217.769], [78249.44, 67216.649], [78263.257, 67210.977], [78271.181, 67207.725], [78281.678, 67203.416], [78282.16, 67203.218], [78277.059, 67139.873], [78267.804, 67143.274], [78246.511, 67151.1], [78231.372, 67156.93], [78219.849, 67161.368], [78212.494, 67165.191], [78206.824, 67168.06], [78206.342, 67168.304], [78195.884, 67174.308], [78184.852, 67181.076], [78183.897, 67181.674], [78176.043, 67186.614]]]},
};

/** A real cadastral parcel in Ell (C116). */
const ELL_PARCEL_269_886: LuFondDePlanRow = {
    id: 93590,
    xtfId: "ec14fbd8-588a-4d91-8262-95ed3dc32845",
    numCadast: "269/886",
    codeCom: "C116",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[55007.458, 92487.344], [55014.251, 92471.522], [54979.221, 92459.538], [54973.517, 92474.449], [55007.458, 92487.344]]]},
};

/** A second real Ell parcel. */
const ELL_PARCEL_258_705: LuFondDePlanRow = {
    id: 93903,
    xtfId: "2c3db78c-49a4-469c-a7c3-bea318be9eb9",
    numCadast: "258/705",
    codeCom: "C116",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[54985.216, 92417.089], [54990.953, 92398.779], [54948.469, 92384.009], [54941.96, 92401.029], [54985.216, 92417.089]]]},
};

/** DUPLICATE KEY, member A — commune C001, NUM_CADAST "109". Two distinct parcels share it. */
const NOMMERN_109_A: LuFondDePlanRow = {
    id: 489743,
    xtfId: "f2b9a468-4cce-4035-a72f-4dba36043779",
    numCadast: "109",
    codeCom: "C001",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[80173.387, 95293.831], [80169.388, 95296.685], [80181.969, 95327.153], [80210.217, 95317.8], [80201.283, 95300.079], [80191.896, 95280.62], [80173.387, 95293.831]]]},
};

/** DUPLICATE KEY, member B — the same (C001, "109") pair, a different xtf_id and geometry. */
const NOMMERN_109_B: LuFondDePlanRow = {
    id: 490063,
    xtfId: "aa8ec582-052b-4926-9d31-28bb46c35041",
    numCadast: "109",
    codeCom: "C001",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[77772.545, 96934.788], [77776.699, 96919.524], [77780.173, 96906.758], [77729.941, 96858.068], [77695.141, 96825.337], [77699.904, 96833.429], [77715.96, 96859.246], [77728.977, 96878.649], [77747.631, 96904.596], [77772.545, 96934.788]]]},
};

/** THE SENTINEL — NUM_CADAST is the literal string "N/A" (31,777 rows nationally, 4.9%). */
const FOND_DE_PLAN_NA_SENTINEL: LuFondDePlanRow = {
    id: 1,
    xtfId: "b5c4008c-8dbe-457b-982b-19a92c610ae2",
    numCadast: "N/A",
    codeCom: "C026",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[77128.961, 75137.624], [77129.647, 75134.345], [77130.469, 75130.444], [77131.276, 75126.693], [77131.762, 75124.388], [77132.168, 75122.463], [77132.838, 75119.161], [77129.706, 75118.955], [77126.14, 75118.705], [77124.923, 75118.619], [77122.797, 75118.47], [77122.01, 75122.535], [77121.166, 75127.122], [77120.421, 75131.041], [77119.583, 75135.582], [77128.961, 75137.624]]]},
};

/** A base-zoning row (HAB_1 in Ell) — carries a national CODE and no numerics at all. */
const ELL_ZONAGE_HAB_1: LuZonageRow = {
    id: 16610,
    xtfId: "7d70a11a-f0f8-4c21-ba3e-3c465589a08b",
    categorie: "HAB_1",
    genre: null,
    nomFichier: "116_PE_HAB_1",
    codeCom: "C116",
    srs: 2169,
    geometry: {"type": "Polygon", "coordinates": [[[55069.177, 95734.215], [55094.294, 95748.152], [55103.342, 95730.521], [55111.752, 95714.12], [55110.787, 95713.47], [55096.535, 95706.27], [55080.512, 95698.003], [55070.352, 95692.761], [55070.027, 95713.538], [55069.596, 95718.247], [55069.209, 95729.515], [55069.177, 95734.215]]]},
};

/**
 * The dataset record data.public.lu actually returned on 2026-09-01, trimmed to the fields the
 * manifest parser reads. Byte-for-byte values, including the `filesize`.
 */
const LU_DATASET_RECORD_LIVE = {
    id: '5e318f0af176a17e68ca547a',
    title: 'PAG - Géométries de tous les PAG "version 2011" en vigueur',
    license: 'cc-zero',
    last_update: '2026-08-31T02:35:29+00:00',
    frequency: 'continuous',
    page: 'https://data.public.lu/fr/datasets/pag-geometries-de-tous-les-pag-version-2011-en-vigueur/',
    resources: [
        {
            title: 'pag.gpkg.zip',
            format: 'gpkg.zip',
            filesize: 259912001,
            url: 'https://download.data.public.lu/resources/pag-geometries-de-tous-les-pag-version-2011-en-vigueur/20260831-023526/pag.gpkg.zip',
        },
    ],
};

// ═══════════════════════════ THE FAKE TRANSPORT ═══════════════════════════

/**
 * A reader over the recorded rows. §6 G.3: AN UNROUTED REQUEST FAILS BY NAME — never falls
 * through to an empty answer, which would let a wrong key masquerade as a coverage fact.
 */
function makeReader(
    zones: readonly LuNqPapRow[],
    parcels: readonly LuFondDePlanRow[] = [],
    zonage: readonly LuZonageRow[] = [],
): LuPagGpkgReader {
    const known = new Set(zones.map((z) => z.xtfId));
    return {
        async nqPapByXtfId(xtfId) {
            if (!known.has(xtfId) && xtfId !== 'definitely-not-in-the-artefact') {
                throw new Error(`FAKE READER: unrouted nqPapByXtfId(${xtfId})`);
            }
            return zones.find((z) => z.xtfId === xtfId) ?? null;
        },
        async fondDePlanByNumCadast(codeCom, numCadast) {
            return parcels.filter((p) => p.codeCom === codeCom && p.numCadast === numCadast);
        },
        async nqPapByBbox(env) {
            void env;
            return zones;
        },
        async zonageByBbox(env) {
            void env;
            return zonage;
        },
    };
}

/** A `fetch` that answers ONLY the dataset URL and throws by name on anything else. */
function makeFetch(body: unknown, ok = true, status = 200): typeof fetch {
    return (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url !== buildLuPagDatasetUrl(LU_PAG_DATASET_SLUG)) {
            throw new Error(`FAKE FETCH: unrouted ${url}`);
        }
        return { ok, status, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
}

function ruleFor(rules: readonly SiteIntelRule[], parameter: string): SiteIntelRule {
    const r = rules.find((x) => x.provenance.parameter === parameter);
    if (r === undefined) throw new Error(`no rule for parameter ${parameter}`);
    return r;
}

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §R2 · every coefficient rule carries its OWN statutory denominator, verbatim', () => {
    const mapped = mapLuNqPapRowToRules(ELL_UM_BIERG, FETCHED_AT);

    it('emits one rule per vocabulary entry — seven, always, for every row', () => {
        expect(mapped.rules).toHaveLength(LU_COEFFICIENT_VOCABULARY.length);
        expect(mapped.rules).toHaveLength(7);
    });

    it('THE ANTI-AARHUS ASSERTION: COS/CSS are over terrain à bâtir NET, CUS over BRUT, DL per HECTARE of BRUT — three distinct bases on one zone', () => {
        const cos = ruleFor(mapped.rules, 'maxCoverageRatio');
        const cus = ruleFor(mapped.rules, 'maxFloorAreaRatio');
        const css = ruleFor(mapped.rules, 'maxSoilSealingRatio');
        const dl = ruleFor(mapped.rules, 'maxDwellingDensity');

        expect(cos.provenance.valueBasis).toEqual({
            scheme: LU_VALUE_BASIS_SCHEME,
            code: 'terrain-a-batir-net',
        });
        expect(css.provenance.valueBasis).toEqual({
            scheme: LU_VALUE_BASIS_SCHEME,
            code: 'terrain-a-batir-net',
        });
        expect(cus.provenance.valueBasis).toEqual({
            scheme: LU_VALUE_BASIS_SCHEME,
            code: 'terrain-a-batir-brut',
        });
        expect(dl.provenance.valueBasis).toEqual({
            scheme: LU_VALUE_BASIS_SCHEME,
            code: 'terrain-a-batir-brut-hectares',
        });

        // ⛔ THE POINT: COS and CUS do NOT share a denominator. A consumer that multiplies both
        // by one area has committed the Aarhus error in French.
        expect(cos.provenance.valueBasis?.code).not.toBe(cus.provenance.valueBasis?.code);
        // …and DL is not a ratio at all.
        expect(dl.provenance.unit).toBe('dwellings/ha');
        expect(cos.provenance.unit).toBeNull();
        expect(cus.provenance.unit).toBeNull();
        expect(css.provenance.unit).toBeNull();
    });

    it('every emitted valueBasis code is inside the closed statutory set — an unknown code is a schema change, not a data point', () => {
        for (const rule of mapped.rules) {
            const code = rule.provenance.valueBasis?.code;
            expect(code).toBeDefined();
            expect(LU_VALUE_BASIS_CODES as readonly string[]).toContain(code!);
        }
    });

    it('carries the statutory definition VERBATIM in French, in the note, per rule', () => {
        expect(ruleFor(mapped.rules, 'maxCoverageRatio').provenance.confidence.note).toContain(
            'la surface d’emprise au sol de la ou des constructions (au niveau du terrain naturel) et la surface du terrain à bâtir net',
        );
        expect(ruleFor(mapped.rules, 'maxSoilSealingRatio').provenance.confidence.note).toContain(
            'la surface de sol scellée et la surface du terrain à bâtir net',
        );
        expect(ruleFor(mapped.rules, 'maxDwellingDensity').provenance.confidence.note).toContain(
            'le nombre d’unités de logement et le terrain à bâtir brut exprimé en hectares',
        );
    });

    it('CUS declares its NON-LINEAR numerator — the double/triple storey multipliers — so it is never read as a plain FAR', () => {
        const cus = ruleFor(mapped.rules, 'maxFloorAreaRatio');
        expect(cus.provenance.confidence.note).toContain('comptent double');
        expect(cus.provenance.confidence.note).toContain('comptent triple');
        expect(cus.provenance.confidence.note).toContain('WEIGHTED floor area');
    });

    it('EVERY rule refuses the per-parcel multiply, because neither denominator is a parcel or a served area', () => {
        for (const rule of mapped.rules) {
            expect(rule.provenance.confidence.note).toContain('NOT a cadastral');
            expect(rule.provenance.confidence.note).toContain('do not multiply this value by a parcel area');
        }
    });

    it('the mapper offers NO conversion between the four — the vocabulary is the only surface, and each row owns its basis', () => {
        const bases = new Set(LU_COEFFICIENT_VOCABULARY.map((e) => e.valueBasisCode));
        expect(bases.size).toBe(3);
        // The four abbreviations are four quantities; nothing maps one onto another.
        expect(new Set(LU_COEFFICIENT_VOCABULARY.map((e) => e.abbreviation))).toEqual(
            new Set(['COS', 'CUS', 'CSS', 'DL']),
        );
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §R5 · normative force is Art. 26, verbatim — the values are ZONE AVERAGES that lots may exceed', () => {
    it('rides every rule, never harmonised, never a boolean', () => {
        const mapped = mapLuNqPapRowToRules(ELL_UM_BIERG, FETCHED_AT);
        for (const rule of mapped.rules) {
            expect(rule.provenance.normativeForce).toBe(LU_NORMATIVE_FORCE);
        }
        expect(LU_NORMATIVE_FORCE).toContain('valeurs moyennes');
        expect(LU_NORMATIVE_FORCE).toContain('dépassés pour certains lots ou parcelles');
        expect(typeof LU_NORMATIVE_FORCE).toBe('string');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §R3 · validity is ingestion-versioned, because the artefact serves NO date on this layer', () => {
    it('every rule is ingestion + the fetch date — no adoption date is fabricated', () => {
        const mapped = mapLuNqPapRowToRules(ELL_UM_BIERG, FETCHED_AT);
        for (const rule of mapped.rules) {
            expect(rule.provenance.validityBasis).toBe('ingestion');
            expect(rule.provenance.valid_from).toBe(FETCHED_AT);
            expect(rule.provenance.valid_to).toBeNull();
        }
        // …and the minted Plan carries no invented dates either.
        expect(mapped.plan?.adoptedDate).toBeNull();
        expect(mapped.plan?.inForceFrom).toBeNull();
        expect(mapped.plan?.inForceTo).toBeNull();
        expect(mapped.plan?.status).toBe('version 2011 en vigueur');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §UNKNOWN · control 9 — null and zero are tier-6, VISIBLE, and counted', () => {
    it('a null coefficient becomes a tier-6 rule with value null — the row is never dropped', () => {
        const mapped = mapLuNqPapRowToRules(ELL_UM_BIERG, FETCHED_AT);
        const cosMin = ruleFor(mapped.rules, 'minCoverageRatio');
        expect(cosMin.provenance.value).toBeNull();
        expect(cosMin.provenance.confidence.tier).toBe(6);
        expect(cosMin.provenance.confidence.note).toContain('served as NULL');
        // R2 survives a tier-6 row: the denominator is a served fact about the RULE.
        expect(cosMin.provenance.valueBasis).toEqual({
            scheme: LU_VALUE_BASIS_SCHEME,
            code: 'terrain-a-batir-net',
        });
    });

    it('a ZERO coefficient is tier-6 too, and the note carries the MEASUREMENT that justifies it', () => {
        const mapped = mapLuNqPapRowToRules(BEYREN_KALLEK_ZAD, FETCHED_AT);
        for (const p of ['maxCoverageRatio', 'maxFloorAreaRatio', 'maxSoilSealingRatio', 'maxDwellingDensity']) {
            const rule = ruleFor(mapped.rules, p);
            expect(rule.provenance.value).toBeNull();
            expect(rule.provenance.confidence.tier).toBe(6);
            expect(rule.provenance.confidence.note).toContain('served as 0');
            expect(rule.provenance.confidence.note).toContain('UNKNOWN ≠ 0');
        }
        // …and the note carries THIS LANE'S correction of the "all ZAD" reading.
        expect(ruleFor(mapped.rules, 'maxCoverageRatio').provenance.confidence.note).toContain(
            'this lane CORRECTS the "all ZAD" reading',
        );
    });

    it('an all-null row still emits all seven rules, all tier 6 — the count is the assertion', () => {
        const mapped = mapLuNqPapRowToRules(HAMM_ZAD_ALL_NULL, FETCHED_AT);
        expect(mapped.rules).toHaveLength(7);
        expect(countLuUnknownRules(mapped.rules)).toBe(7);
        expect(mapped.rules.every((r) => r.provenance.value === null)).toBe(true);
    });

    it('DL_MAX=0 beside a positive COS_MAX is refused, and BOTH populations are named (C74)', () => {
        const mapped = mapLuNqPapRowToRules(MOERSDORF_SCHOTTERWERK, FETCHED_AT);
        const cos = ruleFor(mapped.rules, 'maxCoverageRatio');
        const dl = ruleFor(mapped.rules, 'maxDwellingDensity');
        expect(cos.provenance.value).toBe(0.5);
        expect(cos.provenance.confidence.tier).toBe(1);
        expect(dl.provenance.value).toBeNull();
        expect(dl.provenance.confidence.tier).toBe(6);
        expect(dl.provenance.confidence.note).toContain('123');
        expect(dl.provenance.confidence.note).toContain('111');
        expect(dl.provenance.confidence.note).toContain('NOTHING SERVED SEPARATES THEM');
    });

    it('the tier-6 population is COUNTED against the independent national census, not against itself', () => {
        // Census: 3,017 rows, of which 2,826 have all four maxima strictly positive.
        expect(LU_NQ_PAP_CENSUS_2026_09_01.rows).toBe(3017);
        expect(LU_NQ_PAP_CENSUS_2026_09_01.allFourMaximaStrictlyPositive).toBe(2826);
        expect(LU_NQ_PAP_CENSUS_2026_09_01.rowsWithAnyUnknownMaximum).toBe(
            LU_NQ_PAP_CENSUS_2026_09_01.rows -
                LU_NQ_PAP_CENSUS_2026_09_01.allFourMaximaStrictlyPositive,
        );
        // 191 / 3,017 = 6.33% — the brief's 6.3%, re-derived rather than transcribed.
        const pct =
            (LU_NQ_PAP_CENSUS_2026_09_01.rowsWithAnyUnknownMaximum /
                LU_NQ_PAP_CENSUS_2026_09_01.rows) *
            100;
        expect(pct).toBeGreaterThan(6.2);
        expect(pct).toBeLessThan(6.4);
        // The E5 correction, carried as data.
        const k = LU_NQ_PAP_CENSUS_2026_09_01.cosMaxZeroByDenominationKind;
        expect(k.zad + k.voirie + k.spec + k.neither).toBe(LU_NQ_PAP_CENSUS_2026_09_01.zeros.cosMax);
        expect(k.zad).toBeLessThan(LU_NQ_PAP_CENSUS_2026_09_01.zeros.cosMax);
    });

    it('a domain breach is REFUSED by name, never clipped — and zero rows breach it nationally', () => {
        const cosEntry = LU_COEFFICIENT_VOCABULARY.find((e) => e.column === 'cosMax')!;
        const cusEntry = LU_COEFFICIENT_VOCABULARY.find((e) => e.column === 'cusMax')!;
        expect(classifyLuCoefficient(1.4, cosEntry).kind).toBe('refused-domain');
        expect(classifyLuCoefficient(-0.2, cosEntry).kind).toBe('refused-domain');
        // …but CUS legitimately exceeds 1 (measured range 0–10): no invented ceiling.
        expect(classifyLuCoefficient(1.4, cusEntry).kind).toBe('value');
        expect(classifyLuCoefficient(10, cusEntry).value).toBe(10);
    });

    it('a strictly positive COS_MIN — 44 nationally — is emitted AND flagged as statutorily unfooted', () => {
        const mapped = mapLuNqPapRowToRules(ROESER_GRAND_RUE, FETCHED_AT);
        const cosMin = ruleFor(mapped.rules, 'minCoverageRatio');
        expect(cosMin.provenance.value).toBe(0.55);
        expect(cosMin.provenance.confidence.tier).toBe(1);
        expect(cosMin.provenance.confidence.note).toContain('Art. 26 permits minima only for CUS and DL');
    });

    it('minima served as explicit ZERO are tier-6, and the note names the 28/34/32 commune split that proves NULL and 0 are one fact', () => {
        const mapped = mapLuNqPapRowToRules(HELFENT_ROUTE_DE_LONGWY, FETCHED_AT);
        const cosMin = ruleFor(mapped.rules, 'minCoverageRatio');
        expect(cosMin.provenance.value).toBeNull();
        expect(cosMin.provenance.confidence.tier).toBe(6);
        // …while the maxima on the same row are real values at tier 1.
        expect(ruleFor(mapped.rules, 'maxCoverageRatio').provenance.value).toBe(0.75);
        expect(ruleFor(mapped.rules, 'maxFloorAreaRatio').provenance.value).toBe(1.4);
        expect(ruleFor(mapped.rules, 'maxDwellingDensity').provenance.value).toBe(65);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §PROV · the rule’s legal address survives into provenance.source', () => {
    it('names country, authority, dataset, the commune as plan_id, the zone as object_id and the statutory article', () => {
        const mapped = mapLuNqPapRowToRules(ELL_UM_BIERG, FETCHED_AT);
        const cos = ruleFor(mapped.rules, 'maxCoverageRatio');
        expect(cos.provenance.source.country).toBe('LU');
        expect(cos.provenance.source.dataset).toBe('PAG_PAG_NQ_PAP');
        expect(cos.provenance.source.plan_id).toBe('C116');
        // The DENOMINATION is NOT unique (2,845 of 3,017), so the transfer id travels with it.
        expect(cos.provenance.source.object_id).toContain('Ell - Um Bierg');
        expect(cos.provenance.source.object_id).toContain('bb78fe47-e2f2-4a53-9696-73337ef387ba');
        // The partie-écrite FILENAME, verbatim — never dressed up as a retrievable URL.
        expect(cos.provenance.source.document).toBe('116_PE_PAP_NQ');
        expect(cos.provenance.source.article).toContain('Annexe II');
        expect(cos.provenance.source.article).toContain('RGD 08/03/2017');
        expect(cos.provenance.derivation).toBe('DIRECT');
        expect(cos.provenance.valueLocation).toBe('attribute');
    });

    it('every emitted rule is a valid SiteIntelRule value', () => {
        for (const fixture of [
            ELL_UM_BIERG,
            HELFENT_ROUTE_DE_LONGWY,
            BEYREN_KALLEK_ZAD,
            HAMM_ZAD_ALL_NULL,
            MOERSDORF_SCHOTTERWERK,
            ROESER_GRAND_RUE,
        ]) {
            for (const rule of mapLuNqPapRowToRules(fixture, FETCHED_AT).rules) {
                expect(() => SiteIntelRuleSchema.parse(rule)).not.toThrow();
            }
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §R1 · every basis ref resolves to an entity returned in the same result', () => {
    it('cites the minted Zone, which cites the minted Plan, in LUREF', () => {
        const mapped = mapLuNqPapRowToRules(ELL_UM_BIERG, FETCHED_AT);
        expect(mapped.zone).not.toBeNull();
        expect(mapped.plan).not.toBeNull();
        expect(mapped.zone!.id).toBe(luZoneEntityId('bb78fe47-e2f2-4a53-9696-73337ef387ba'));
        expect(mapped.zone!.planId).toBe(mapped.plan!.id);
        expect(mapped.zone!.geometry.crs).toBe(LU_NATIVE_CRS);
        expect(mapped.zone!.geometry.crs).toBe('EPSG:2169');
        expect(mapped.zone!.typology.national).toBe('PAP_NQ');
        // No cross-country harmonisation EXISTS for LU degré-d'utilisation zoning — never guessed.
        expect(mapped.zone!.typology.harmonised).toBeNull();
        for (const rule of mapped.rules) {
            expect(rule.applicability.basis).toEqual([{ kind: 'zone', ref: mapped.zone!.id }]);
            expect(rule.applicability.rank).toBeNull();
            expect(rule.applicability.useScope).toEqual([]);
        }
    });

    it('falls back to the Plan when no geometry is served, and carries geometry INLINE when no commune is', () => {
        const noGeom: LuNqPapRow = { ...ELL_UM_BIERG, geometry: null };
        const m1 = mapLuNqPapRowToRules(noGeom, FETCHED_AT);
        expect(m1.zone).toBeNull();
        expect(m1.rules[0]!.applicability.basis).toEqual([{ kind: 'plan', ref: m1.plan!.id }]);

        const noCommune: LuNqPapRow = { ...ELL_UM_BIERG, codeCom: null };
        const m2 = mapLuNqPapRowToRules(noCommune, FETCHED_AT);
        expect(m2.plan).toBeNull();
        expect(m2.rules[0]!.applicability.basis).toEqual([]);
        expect(m2.rules[0]!.applicability.geometry).not.toBeNull();
    });

    it('REFUSES BY NAME when a row has neither — a rule that applies nowhere is not a rule', () => {
        const orphan: LuNqPapRow = { ...ELL_UM_BIERG, codeCom: null, geometry: null };
        expect(() => mapLuNqPapRowToRules(orphan, FETCHED_AT)).toThrow(/lu-rule-mapper/);
        expect(() => mapLuNqPapRowToRules(orphan, FETCHED_AT)).toThrow(/applies nowhere is not a rule/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §CHAIN · a REAL zone resolves end-to-end, at the chain layer', () => {
    it('manifest (live shape) + artefact row + rules, all typed — committed ≠ reachable', async () => {
        const out = await resolveLuZoneChain(
            'bb78fe47-e2f2-4a53-9696-73337ef387ba',
            {
                reader: makeReader([ELL_UM_BIERG]),
                fetchImpl: makeFetch(LU_DATASET_RECORD_LIVE),
            },
            FETCHED_AT,
        );
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;

        // The LIVE leg: licence + freshness + the current artefact url.
        expect(out.value.manifest.status).toBe('found');
        if (out.value.manifest.status === 'found') {
            expect(out.value.manifest.value.licenceId).toBe('cc-zero');
            expect(out.value.manifest.value.lastUpdate).toBe('2026-08-31T02:35:29+00:00');
            expect(out.value.manifest.value.artefactBytes).toBe(LU_PAG_ARTEFACT_BYTES_2026_08_31);
        }

        // The RULES leg — the four coefficients of a real Luxembourgish zone.
        const rules = out.value.zone.rules;
        expect(rules).toHaveLength(7);
        expect(ruleFor(rules, 'maxCoverageRatio').provenance.value).toBe(0.5);
        expect(ruleFor(rules, 'maxFloorAreaRatio').provenance.value).toBeCloseTo(0.7, 10);
        expect(ruleFor(rules, 'maxSoilSealingRatio').provenance.value).toBe(0.75);
        expect(ruleFor(rules, 'maxDwellingDensity').provenance.value).toBe(30);
        // Three minima UNKNOWN, four maxima known — 3 of 7 tier-6.
        expect(countLuUnknownRules(rules)).toBe(3);
        expect(out.value.zone.zoneEntity!.geometry.crs).toBe('EPSG:2169');
    });

    it('a chain whose zone is absent returns ABSENT, not an empty rule list', async () => {
        const out = await resolveLuZoneChain(
            'definitely-not-in-the-artefact',
            { reader: makeReader([ELL_UM_BIERG]), fetchImpl: makeFetch(LU_DATASET_RECORD_LIVE) },
            FETCHED_AT,
        );
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason).toMatch(/^no-feature:/);
    });

    it('a portal outage degrades PROVENANCE without destroying the ANSWER', async () => {
        const out = await resolveLuZoneChain(
            'bb78fe47-e2f2-4a53-9696-73337ef387ba',
            { reader: makeReader([ELL_UM_BIERG]), fetchImpl: makeFetch(null, false, 503) },
            FETCHED_AT,
        );
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.manifest.status).toBe('transient');
        if (out.value.manifest.status === 'transient') {
            expect(out.value.manifest.reason).toMatch(/^upstream-failed:/);
        }
        expect(out.value.zone.rules).toHaveLength(7);
    });

    it('the chain slices a FULL ISO timestamp correctly (the DK L-12873 defect, not repeated)', async () => {
        const out = await resolveLuZoneChain(
            'bb78fe47-e2f2-4a53-9696-73337ef387ba',
            { reader: makeReader([ELL_UM_BIERG]), fetchImpl: makeFetch(LU_DATASET_RECORD_LIVE) },
            '2026-09-01T18:44:07.123Z',
        );
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.zone.rules[0]!.provenance.valid_from).toBe('2026-09-01');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §TRANSPORT · no live service exists, and the missing reader says so', () => {
    it('a missing reader is TRANSIENT and names the transport, never an absence of data', async () => {
        const out = await resolveLuZoneChain('bb78fe47-e2f2-4a53-9696-73337ef387ba', {}, FETCHED_AT);
        expect(out.status).toBe('transient');
        if (out.status !== 'transient') return;
        expect(out.reason).toMatch(/^endpoint-unreachable:/);
        expect(out.reason).toContain('MISSING TRANSPORT, not an absence of data');
        // The token is the L0 vocabulary — no adapter-local dialect.
        expect(TRANSIENT_FETCH_REASONS as readonly string[]).toContain('endpoint-unreachable');
    });

    it('the manifest parser classifies a licence-less record as ABSENT, not as a failure', async () => {
        const out = await fetchLuPagManifest({
            fetchImpl: makeFetch({ resources: [], page: 'x' }),
        });
        expect(out.status).toBe('absent');
        if (out.status === 'absent') expect(out.reason).toMatch(/^no-feature:/);
    });

    it('a network throw is TRANSIENT (retryable), which is what src/net/retryWhileUnreachable.ts acts on', async () => {
        const boom = (async () => {
            throw new Error('ECONNRESET');
        }) as unknown as typeof fetch;
        const out = await fetchLuPagManifest({ fetchImpl: boom });
        expect(out.status).toBe('transient');
        if (out.status === 'transient') expect(out.reason).toMatch(/^endpoint-unreachable:/);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §PARCEL · NUM_CADAST is a sentinel-bearing, NON-UNIQUE key, and the adapter says so', () => {
    const parcels = [ELL_PARCEL_269_886, ELL_PARCEL_258_705, NOMMERN_109_A, NOMMERN_109_B, FOND_DE_PLAN_NA_SENTINEL];

    it('refuses the "N/A" sentinel BY NAME with its measured population', async () => {
        const out = await resolveLuParcelByNumCadast('C026', LU_NUM_CADAST_SENTINEL, {
            reader: makeReader([], parcels),
        });
        expect(out.status).toBe('absent');
        if (out.status !== 'absent') return;
        expect(out.reason).toMatch(/^no-parcel:/);
        expect(out.reason).toContain('31,777');
        expect(out.reason).toContain('SENTINEL');
    });

    it('resolves a real parcel', async () => {
        const out = await resolveLuParcelByNumCadast('C116', '269/886', {
            reader: makeReader([], parcels),
        });
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.matches).toHaveLength(1);
        expect(out.value.ambiguous).toBe(false);
        expect(out.value.matches[0]!.xtfId).toBe('ec14fbd8-588a-4d91-8262-95ed3dc32845');
    });

    it('CARRIES the ambiguity when the key matches two parcels — never silently picks matches[0]', async () => {
        const out = await resolveLuParcelByNumCadast('C001', '109', {
            reader: makeReader([], parcels),
        });
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.ambiguous).toBe(true);
        expect(out.value.matches).toHaveLength(2);
        expect(new Set(out.value.matches.map((m) => m.xtfId)).size).toBe(2);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §BBOX · a GeoPackage R-tree answers bbox overlap, and the type refuses to pretend otherwise', () => {
    const env: LuLurefEnvelope = { minX: 57700, minY: 91780, maxX: 57830, maxY: 91890 };

    it('returns CANDIDATES with exactIntersectionResolved false and both counts (C74)', async () => {
        const out = await resolveLuNqPapCandidatesForEnvelope(env, {
            reader: makeReader([ELL_UM_BIERG, HELFENT_ROUTE_DE_LONGWY]),
        });
        expect(out.status).toBe('found');
        if (out.status !== 'found') return;
        expect(out.value.exactIntersectionResolved).toBe(false);
        expect(out.value.candidates).toHaveLength(2);
        expect(out.value.note).toContain('2 NQ-PAP zone(s)');
        expect(out.value.note).toContain('0 of them have been tested');
        expect(out.value.note).toContain('Do not treat a candidate as the governing zone');
    });

    it('an EMPTY bbox result is a sound ABSENCE, and says why', async () => {
        const out = await resolveLuNqPapCandidatesForEnvelope(env, { reader: makeReader([]) });
        expect(out.status).toBe('absent');
        if (out.status === 'absent') {
            expect(out.reason).toContain('SUPERSET');
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §SOURCE · one probed, CC0-confirmed row; the endpoint drift guard holds', () => {
    it('exactly one row, bulk protocol, GREEN CC0 verified at the deed', () => {
        expect(LU_ADAPTER_SOURCES).toHaveLength(1);
        const row = LU_ADAPTER_SOURCES[0]!;
        expect(row.id).toBe(LU_PAG_SOURCE_ID);
        expect(row.country).toBe('LU');
        expect(row.protocol).toBe('bulk');
        expect(row.licence.colour).toBe('GREEN');
        expect(row.licence.id).toContain('CC0');
        expect(row.licence.verifiedDate).toBe('2026-09-01');
        expect(row.licence.textRef).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
        expect(row.probes.length).toBeGreaterThan(0);
        expect(row.probes[0]!.date).toBe('2026-09-01');
    });

    it('the row states what Luxembourg does NOT serve', () => {
        const row = LU_ADAPTER_SOURCES[0]!;
        expect(row.dataset).toContain('NOT SERVED ANYWHERE IN THE MODEL: max height, setbacks, storey count');
        expect(row.coverage).toContain('18,743');
    });

    it('every endpoint the adapter calls is bound to a registered row', () => {
        for (const b of LU_ADAPTER_ENDPOINT_BINDINGS) {
            const row = LU_ADAPTER_SOURCES.find((s) => s.id === b.sourceId);
            expect(row).toBeDefined();
            expect(row!.endpoint).toBe(b.endpoint);
        }
    });

    it('every rule cites the registered source id, through the minted entities', () => {
        const mapped = mapLuNqPapRowToRules(ELL_UM_BIERG, FETCHED_AT);
        expect(mapped.plan!.source).toBe(LU_PAG_SOURCE_ID);
        expect(mapped.zone!.source).toBe(LU_PAG_SOURCE_ID);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §ADAPTER · the §J shape, the ladder, and the jurisdiction box', () => {
    it('the adapter value exists and is structured (the DK L-12875 gap, not copied)', () => {
        expect(luCountryAdapter.country).toBe('LU');
        expect(luCountryAdapter.rules.kind).toBe('structured');
        expect(typeof luCountryAdapter.rules.fetchChain).toBe('function');
        expect(luCountryAdapter.sources()).toBe(LU_ADAPTER_SOURCES);
        expect(luCountryAdapter.precedence).toBe(LU_APPLICABILITY_LADDER);
    });

    it('the ladder records the ABSENCES as first-class steps', () => {
        const text = LU_APPLICABILITY_LADDER.map((s) => `${s.step} ${s.mode}`).join(' | ');
        expect(text).toContain('NO NUMERICS SERVED');
        expect(text).toContain('ABSENT FROM THE ENTIRE MODEL');
        expect(text).toContain('Absence from the PAG dataset ≠ absence of a rule');
    });

    it('the bbox contains Luxembourg City and rejects its neighbours’ capitals + non-finite input', () => {
        expect(isInLuxembourg(49.6116, 6.1319)).toBe(true); // Luxembourg City
        expect(isInLuxembourg(49.815, 6.129)).toBe(true); // Ettelbruck
        expect(isInLuxembourg(49.7597, 6.6439)).toBe(false); // Trier (DE)
        expect(isInLuxembourg(49.1193, 6.1757)).toBe(false); // Metz (FR)
        expect(isInLuxembourg(Number.NaN, 6.13)).toBe(false);
        expect(LUXEMBOURG_BBOX.maxLat).toBeLessThan(50.3); // no NRW_BBOX overlap
        expect(LUXEMBOURG_BBOX.maxLat).toBeLessThan(50.7); // no NETHERLANDS_BBOX overlap
    });

    it('parseLuNqPapRow refuses a row with no transfer id — the only unique key', () => {
        expect(parseLuNqPapRow({ CODE_COM: 'C116', COS_MAX: 0.5 })).toBeNull();
        const parsed = parseLuNqPapRow({ xtf_id: 'x', CODE_COM: 'C116', COS_MAX: 0.5 });
        expect(parsed?.codeCom).toBe('C116');
        expect(parsed?.cosMax).toBe(0.5);
        expect(parsed?.srs).toBe(2169);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════
describe('E7-LU · §SCRAMBLE · the mandatory control — this suite cannot be passing on arbitrary input', () => {
    it('perturbing the headline fixture’s coefficients makes the value assertions FALSE', () => {
        const scrambled: LuNqPapRow = {
            ...ELL_UM_BIERG,
            cosMax: 0.9,
            cusMax: 2.2,
            cssMax: 0.1,
            dlMax: 7,
        };
        const rules = mapLuNqPapRowToRules(scrambled, FETCHED_AT).rules;
        // Each of these is the NEGATION of an assertion the §CHAIN block makes.
        expect(ruleFor(rules, 'maxCoverageRatio').provenance.value).not.toBe(0.5);
        expect(ruleFor(rules, 'maxFloorAreaRatio').provenance.value).not.toBeCloseTo(0.7, 10);
        expect(ruleFor(rules, 'maxSoilSealingRatio').provenance.value).not.toBe(0.75);
        expect(ruleFor(rules, 'maxDwellingDensity').provenance.value).not.toBe(30);
    });

    it('scrambling a coefficient into the UNKNOWN band flips its tier — the classifier is load-bearing, not decorative', () => {
        const zeroed: LuNqPapRow = { ...ELL_UM_BIERG, cosMax: 0 };
        const rules = mapLuNqPapRowToRules(zeroed, FETCHED_AT).rules;
        expect(ruleFor(rules, 'maxCoverageRatio').provenance.confidence.tier).toBe(6);
        expect(countLuUnknownRules(rules)).toBe(4);
        // …and the unscrambled row still reads 3, so the delta is real.
        expect(countLuUnknownRules(mapLuNqPapRowToRules(ELL_UM_BIERG, FETCHED_AT).rules)).toBe(3);
    });

    it('scrambling the DENOMINATOR table would be caught: each entry’s basis code is asserted individually', () => {
        const byColumn = new Map(LU_COEFFICIENT_VOCABULARY.map((e) => [e.column, e.valueBasisCode]));
        expect(byColumn.get('cosMax')).toBe('terrain-a-batir-net');
        expect(byColumn.get('cssMax')).toBe('terrain-a-batir-net');
        expect(byColumn.get('cusMax')).toBe('terrain-a-batir-brut');
        expect(byColumn.get('dlMax')).toBe('terrain-a-batir-brut-hectares');
        expect(byColumn.get('cosMin')).toBe(byColumn.get('cosMax'));
        expect(byColumn.get('cusMin')).toBe(byColumn.get('cusMax'));
        expect(byColumn.get('dlMin')).toBe(byColumn.get('dlMax'));
    });
});
