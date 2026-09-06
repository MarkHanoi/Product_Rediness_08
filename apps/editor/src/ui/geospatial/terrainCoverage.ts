// §TERRAIN-RENDER (Phase 3 of the Context Scene-Compiler + Terrain North Star, §6.3) — the CLIENT
// side of the terrain wiring. `tools/context-bake/terrain.mjs` compiles a national DTM → Cesium
// quantized-mesh tiles under `<R2 tiles base>/terrain/<city>/`; this module resolves a site's
// lon/lat to that `<city>` slug and builds the tileset URL so `CesiumViewport` can attach a
// `CesiumTerrainProvider`.
//
// GUARD / NO-REGRESSION CONTRACT
// ------------------------------
// Only cities whose country has an OPEN, commercial-OK DTM that we actually bake appear here. A
// site outside every listed bbox resolves to `null`, and the viewport keeps today's flat
// EllipsoidTerrainProvider (base 0) — un-baked jurisdictions are NOT regressed. Even for a listed
// city the viewport still guards on the tileset actually existing (its `layer.json` must load);
// a city listed here but not yet baked in R2 simply 404s and stays flat, then lights up with no
// code change the moment CI publishes it — the same self-correcting philosophy as the PMTiles
// context reader (`contextTiles.ts`).
//
// §TERRAIN-EVERYWHERE (2026-09-04, terrain.mjs §11) — TWO TABLES, resolved CITY FIRST, then REGION.
// `TERRAIN_CITY_BBOXES` are the per-city tilesets baked from NATIONAL DTM adapters (0.5 m base error,
// legal-grade sources). `TERRAIN_REGION_BBOXES` are the whole-region tilesets (`terrain.mjs`
// NATIONAL_REGIONS — whole countries in Europe, metro rows for USA/Middle East, states for Australia)
// baked from Mapterhorn terrarium with a per-post EGM2008 lift at z0..10 — the SAME finest level a
// Spanish city has today. A site outside every city bbox but inside a region now drapes real relief
// instead of rendering flat. Slugs in BOTH tables MUST match `terrain.mjs` (`REGIONS` / `NATIONAL_REGIONS`
// `name`) and the R2 path `terrain/<slug>/` — `node tools/context-bake/terrain.mjs
// --check-client-coverage` asserts the two slug sets are equal in both directions, because a slug in
// one and not the other is a SILENT 404 (flat ground with no error).
//
// FORMERLY "DELIBERATELY OMITTED", NOW COVERED BY THEIR REGION TILESET (visual drape only — the LEGAL
// DTM status of these cities is unchanged; Mapterhorn is never the L-584 sampling source): Lisbon/Porto
// → `portugal`, Brussels → `belgium`, Berlin/Munich → `germany`, Riyadh/Jeddah → their own metro rows,
// Tallinn → `estonia`, Luxembourg City → `luxembourg`, New York/San Francisco → their own metro rows.
// See docs/04-reference/CONTEXT-TERRAIN-COVERAGE.md.
import { contextTilesBaseUrl } from './contextTiles';

/** A lon/lat bounding box `[west, south, east, north]`. */
export type TerrainBbox = readonly [number, number, number, number];

/**
 * The cities with a baked (or bake-scheduled) terrain tileset — slug + city-centre bbox. Slugs
 * MATCH `tools/context-bake/terrain.mjs` REGIONS `name` and the R2 path `terrain/<slug>/`. Bboxes
 * mirror `tools/context-bake/bake.mjs` REGIONS (the Spanish city clips are defined here + in
 * terrain.mjs, since the building bake uses one national `spain` region).
 */
export const TERRAIN_CITY_BBOXES: ReadonlyArray<{ readonly city: string; readonly bbox: TerrainBbox }> = [
    // NL — AHN (keyless, CC0). §NL-NATIONWIDE — per-city terrain (whole-country AHN is a heavy
    // follow-up); buildings/envelope/parcel are already nationwide.
    { city: 'amsterdam', bbox: [4.83, 52.34, 4.97, 52.42] },
    { city: 'rotterdam', bbox: [4.42, 51.88, 4.55, 51.96] },
    { city: 'utrecht', bbox: [5.06, 52.06, 5.16, 52.12] },
    { city: 'thehague', bbox: [4.25, 52.04, 4.35, 52.10] },
    { city: 'eindhoven', bbox: [5.42, 51.40, 5.52, 51.48] },
    // FR — RGE ALTI / IGN (keyless)
    { city: 'paris', bbox: [2.22, 48.80, 2.47, 48.91] },
    { city: 'lyon', bbox: [4.78, 45.70, 4.92, 45.80] },
    // IT — Tinitaly 10 m (keyless, CC-BY)
    { city: 'rome', bbox: [12.40, 41.83, 12.60, 41.99] },
    { city: 'milan', bbox: [9.10, 45.40, 9.28, 45.55] },
    // GB — Environment Agency LIDAR Composite DTM 1 m (keyless, OGL)
    { city: 'london', bbox: [-0.20, 51.44, 0.02, 51.55] },
    // DK — DHM/Terræn (Datafordeler apikey)
    { city: 'copenhagen', bbox: [12.50, 55.63, 12.65, 55.72] },
    // NO — NDH / Kartverket (keyless)
    { city: 'oslo', bbox: [10.66, 59.88, 10.83, 59.96] },
    // SE — Lantmäteriet höjddata (free-key, CC0)
    { city: 'stockholm', bbox: [17.98, 59.28, 18.14, 59.37] },
    // FI — NLS/Maanmittauslaitos (free-key, CC-BY)
    { city: 'helsinki', bbox: [24.88, 60.14, 25.02, 60.20] },
    // CH — swissALTI3D (keyless)
    { city: 'zurich', bbox: [8.45, 47.34, 8.62, 47.43] },
    { city: 'geneva', bbox: [6.09, 46.17, 6.18, 46.25] },
    { city: 'bern', bbox: [7.40, 46.93, 7.48, 46.99] },
    // DE — Geobasis NRW DGM1 (keyless). Köln is the NRW-covered city; Berlin/Munich stay omitted.
    { city: 'koln', bbox: [6.85, 50.88, 7.02, 50.99] },
    // ES — PNOA MDT (keyless, CC-BY)
    { city: 'barcelona', bbox: [2.09, 41.32, 2.23, 41.47] },
    { city: 'valencia', bbox: [-0.43, 39.40, -0.30, 39.52] },
    { city: 'madrid', bbox: [-3.80, 40.33, -3.58, 40.52] },
    { city: 'cordoba', bbox: [-4.85, 37.84, -4.72, 37.94] },
    { city: 'toledo', bbox: [-4.08, 39.82, -3.95, 39.91] },
    // Costa del Sol (Málaga→Marbella) — big desnivel under the Sierra de Mijas / Sierra Blanca
    { city: 'malaga', bbox: [-4.52, 36.66, -4.38, 36.78] },
    { city: 'benalmadena', bbox: [-4.62, 36.56, -4.48, 36.66] },
    { city: 'fuengirola', bbox: [-4.70, 36.49, -4.56, 36.63] },
    { city: 'marbella', bbox: [-4.95, 36.47, -4.82, 36.59] },
    // §ES-ALL-CAPITALS (L-636) — all Spanish provincial capitals + Balearics + Canaries + big non-capitals.
    { city: 'sevilla', bbox: [-6.0545, 37.3291, -5.9145, 37.4491] },
    { city: 'zaragoza', bbox: [-0.9591, 41.5888, -0.8191, 41.7088] },
    { city: 'murcia', bbox: [-1.2007, 37.9322, -1.0607, 38.0522] },
    { city: 'palma', bbox: [2.5802, 39.5096, 2.7202, 39.6296] },
    { city: 'laspalmas', bbox: [-15.5063, 28.0635, -15.3663, 28.1835] },
    { city: 'bilbao', bbox: [-3.005, 43.203, -2.865, 43.323] },
    { city: 'alicante', bbox: [-0.551, 38.2852, -0.411, 38.4052] },
    { city: 'valladolid', bbox: [-4.7945, 41.5923, -4.6545, 41.7123] },
    { city: 'vigo', bbox: [-8.7907, 42.1806, -8.6507, 42.3006] },
    { city: 'gijon', bbox: [-5.7311, 43.4722, -5.5911, 43.5922] },
    { city: 'acoruna', bbox: [-8.4815, 43.3023, -8.3415, 43.4223] },
    { city: 'vitoria', bbox: [-2.7416, 42.7867, -2.6016, 42.9067] },
    { city: 'granada', bbox: [-3.6686, 37.1173, -3.5286, 37.2373] },
    { city: 'elche', bbox: [-0.7826, 38.2099, -0.6426, 38.3299] },
    { city: 'oviedo', bbox: [-5.9194, 43.3019, -5.7794, 43.4219] },
    { city: 'santacruztenerife', bbox: [-16.3218, 28.4036, -16.1818, 28.5236] },
    { city: 'cartagena', bbox: [-1.0666, 37.5657, -0.9266, 37.6857] },
    { city: 'jerez', bbox: [-6.1961, 36.625, -6.0561, 36.745] },
    { city: 'alcaladehenares', bbox: [-3.4335, 40.422, -3.2935, 40.542] },
    { city: 'pamplona', bbox: [-1.7158, 42.7525, -1.5758, 42.8725] },
    { city: 'almeria', bbox: [-2.5337, 36.774, -2.3937, 36.894] },
    { city: 'sansebastian', bbox: [-2.0512, 43.2583, -1.9112, 43.3783] },
    { city: 'santander', bbox: [-3.88, 43.4023, -3.74, 43.5223] },
    { city: 'castellon', bbox: [-0.1213, 39.9264, 0.0187, 40.0464] },
    { city: 'burgos', bbox: [-3.7669, 42.2839, -3.6269, 42.4039] },
    { city: 'albacete', bbox: [-1.9285, 38.9343, -1.7885, 39.0543] },
    { city: 'logrono', bbox: [-2.5149, 42.4027, -2.3749, 42.5227] },
    { city: 'lalaguna', bbox: [-16.3859, 28.4274, -16.2459, 28.5474] },
    { city: 'badajoz', bbox: [-7.0407, 38.8194, -6.9007, 38.9394] },
    { city: 'salamanca', bbox: [-5.7335, 40.9101, -5.5935, 41.0301] },
    { city: 'huelva', bbox: [-7.0147, 37.2014, -6.8747, 37.3214] },
    { city: 'lleida', bbox: [0.55, 41.5576, 0.69, 41.6776] },
    { city: 'tarragona', bbox: [1.1745, 41.0589, 1.3145, 41.1789] },
    { city: 'leon', bbox: [-5.6371, 42.5387, -5.4971, 42.6587] },
    { city: 'cadiz', bbox: [-6.3586, 36.4671, -6.2186, 36.5871] },
    { city: 'jaen', bbox: [-3.8549, 37.7196, -3.7149, 37.8396] },
    { city: 'ourense', bbox: [-7.9339, 42.2758, -7.7939, 42.3958] },
    { city: 'girona', bbox: [2.7514, 41.9194, 2.8914, 42.0394] },
    { city: 'lugo', bbox: [-7.6259, 42.9521, -7.4859, 43.0721] },
    { city: 'caceres', bbox: [-6.4424, 39.4153, -6.3024, 39.5353] },
    { city: 'santiago', bbox: [-8.6148, 42.8182, -8.4748, 42.9382] },
    { city: 'guadalajara', bbox: [-3.2337, 40.5697, -3.0937, 40.6897] },
    { city: 'pontevedra', bbox: [-8.7144, 42.371, -8.5744, 42.491] },
    { city: 'palencia', bbox: [-4.5988, 41.9496, -4.4588, 42.0696] },
    { city: 'ciudadreal', bbox: [-3.9976, 38.9248, -3.8576, 39.0448] },
    { city: 'zamora', bbox: [-5.8146, 41.4433, -5.6746, 41.5633] },
    { city: 'avila', bbox: [-4.7512, 40.5965, -4.6112, 40.7165] },
    { city: 'cuenca', bbox: [-2.2074, 40.0104, -2.0674, 40.1304] },
    { city: 'segovia', bbox: [-4.1788, 40.8829, -4.0388, 41.0029] },
    { city: 'soria', bbox: [-2.549, 41.7066, -2.409, 41.8266] },
    { city: 'teruel', bbox: [-1.1765, 40.2856, -1.0365, 40.4056] },
    { city: 'huesca', bbox: [-0.4789, 42.0801, -0.3389, 42.2001] },
    // §ES-ALL-MUNI (L-636) — all Spanish municipalities >10k pop (GeoNames, 6km-deduped).
    { city: 'lhospitaletdellobregat', bbox: [2.0303, 41.2997, 2.1703, 41.4197] },
    { city: 'latina', bbox: [-3.8157, 40.329, -3.6757, 40.449] },
    { city: 'fuencarral', bbox: [-3.7533, 40.44, -3.6133, 40.56] },
    { city: 'terrassa', bbox: [1.9467, 41.5067, 2.0867, 41.6267] },
    { city: 'badalona', bbox: [2.1774, 41.39, 2.3174, 41.51] },
    { city: 'sabadell', bbox: [2.0394, 41.4833, 2.1794, 41.6033] },
    { city: 'mostoles', bbox: [-3.935, 40.2623, -3.795, 40.3823] },
    { city: 'fuenlabrada', bbox: [-3.8641, 40.2242, -3.7241, 40.3442] },
    { city: 'sanblascanillejas', bbox: [-3.6854, 40.3789, -3.5454, 40.4989] },
    { city: 'mataro', bbox: [2.3745, 41.4821, 2.5145, 41.6021] },
    { city: 'telde', bbox: [-15.4891, 27.9324, -15.3491, 28.0524] },
    { city: 'doshermanas', bbox: [-5.9909, 37.2229, -5.8509, 37.3429] },
    { city: 'algeciras', bbox: [-5.5205, 36.0733, -5.3805, 36.1933] },
    { city: 'torrejondeardoz', bbox: [-3.5397, 40.3954, -3.3997, 40.5154] },
    { city: 'alcobendas', bbox: [-3.712, 40.4875, -3.572, 40.6075] },
    { city: 'reus', bbox: [1.0369, 41.0961, 1.1769, 41.2161] },
    { city: 'orihuela', bbox: [-1.014, 38.0248, -0.874, 38.1448] },
    { city: 'lasrozasdemadrid', bbox: [-3.9437, 40.4329, -3.8037, 40.5529] },
    { city: 'sanfernando', bbox: [-6.2682, 36.4159, -6.1282, 36.5359] },
    { city: 'roquetasdemar', bbox: [-2.6847, 36.7042, -2.5447, 36.8242] },
    { city: 'lorca', bbox: [-1.7717, 37.6112, -1.6317, 37.7312] },
    { city: 'talaveradelareina', bbox: [-4.9008, 39.9035, -4.7608, 40.0235] },
    { city: 'elpuertodesantamaria', bbox: [-6.303, 36.5339, -6.163, 36.6539] },
    { city: 'melilla', bbox: [-3.0083, 35.2337, -2.8683, 35.3537] },
    { city: 'elejido', bbox: [-2.8846, 36.7163, -2.7446, 36.8363] },
    { city: 'chiclanadelafrontera', bbox: [-6.2137, 36.3598, -6.0737, 36.4798] },
    { city: 'ceuta', bbox: [-5.3904, 35.8292, -5.2504, 35.9492] },
    { city: 'algorta', bbox: [-3.0794, 43.2893, -2.9394, 43.4093] },
    { city: 'torrevieja', bbox: [-0.7522, 37.9187, -0.6122, 38.0387] },
    { city: 'pozuelodealarcon', bbox: [-3.8834, 40.3729, -3.7434, 40.4929] },
    { city: 'santcugatdelvalles', bbox: [2.0161, 41.4106, 2.1561, 41.5306] },
    { city: 'aviles', bbox: [-5.9948, 43.4947, -5.8548, 43.6147] },
    { city: 'arona', bbox: [-16.751, 28.0396, -16.611, 28.1596] },
    { city: 'torrent', bbox: [-0.5355, 39.377, -0.3955, 39.4971] },
    { city: 'manresa', bbox: [1.754, 41.6682, 1.894, 41.7882] },
    { city: 'valdemoro', bbox: [-3.7489, 40.1308, -3.6089, 40.2508] },
    { city: 'velezmalaga', bbox: [-4.1727, 36.7211, -4.0327, 36.8411] },
    { city: 'gandia', bbox: [-0.2533, 38.9067, -0.1133, 39.0267] },
    { city: 'santalucia', bbox: [-15.6107, 27.8517, -15.4707, 27.9717] },
    { city: 'benidorm', bbox: [-0.201, 38.4782, -0.061, 38.5982] },
    { city: 'alcaladeguadaira', bbox: [-5.9095, 37.2779, -5.7695, 37.3979] },
    { city: 'ponferrada', bbox: [-6.6662, 42.4866, -6.5262, 42.6066] },
    { city: 'rivasvaciamadrid', bbox: [-3.5809, 40.2661, -3.4409, 40.3861] },
    { city: 'sanlucardebarrameda', bbox: [-6.4215, 36.7181, -6.2815, 36.8381] },
    { city: 'campina', bbox: [-3.0507, 38.159, -2.9107, 38.279] },
    { city: 'estepona', bbox: [-5.2159, 36.3676, -5.0759, 36.4876] },
    { city: 'ferrol', bbox: [-8.3029, 43.4245, -8.1629, 43.5445] },
    { city: 'castelldefels', bbox: [1.9003, 41.2179, 2.0403, 41.3379] },
    { city: 'sagunto', bbox: [-0.3367, 39.6233, -0.1967, 39.7433] },
    { city: 'vilanovailageltru', bbox: [1.6551, 41.1639, 1.7951, 41.2839] },
    { city: 'villadevallecas', bbox: [-3.6715, 40.307, -3.5315, 40.427] },
    { city: 'lalineadelaconcepcion', bbox: [-5.4178, 36.1081, -5.2778, 36.2281] },
    { city: 'molinadesegura', bbox: [-1.2776, 37.9946, -1.1376, 38.1146] },
    { city: 'paterna', bbox: [-0.5108, 39.4426, -0.3708, 39.5626] },
    { city: 'colladovillalba', bbox: [-4.0749, 40.5751, -3.9349, 40.6951] },
    { city: 'irun', bbox: [-1.8594, 43.279, -1.7194, 43.399] },
    { city: 'alcoy', bbox: [-0.5443, 38.6454, -0.4043, 38.7655] },
    { city: 'arrecife', bbox: [-13.6177, 28.903, -13.4777, 29.023] },
    { city: 'granollers', bbox: [2.2177, 41.548, 2.3577, 41.668] },
    { city: 'motril', bbox: [-3.5879, 36.6907, -3.4479, 36.8107] },
    { city: 'merida', bbox: [-6.4129, 38.858, -6.2729, 38.978] },
    { city: 'linares', bbox: [-3.706, 38.0352, -3.566, 38.1552] },
    { city: 'sanvicentdelraspeig', bbox: [-0.5955, 38.3364, -0.4555, 38.4564] },
    { city: 'torrelavega', bbox: [-4.1179, 43.2894, -3.9779, 43.4094] },
    { city: 'elda', bbox: [-0.8616, 38.4178, -0.7216, 38.5378] },
    { city: 'aranjuez', bbox: [-3.6725, 39.9711, -3.5325, 40.0911] },
    { city: 'boadilladelmonte', bbox: [-3.9483, 40.345, -3.8083, 40.465] },
    { city: 'utrera', bbox: [-5.8509, 37.1252, -5.7109, 37.2452] },
    { city: 'molletdelvalles', bbox: [2.1431, 41.4803, 2.2831, 41.6003] },
    { city: 'puertollano', bbox: [-4.1773, 38.6271, -4.0373, 38.7471] },
    { city: 'calvia', bbox: [2.4362, 39.5057, 2.5762, 39.6257] },
    { city: 'arganda', bbox: [-3.5072, 40.2408, -3.3672, 40.3608] },
    { city: 'vilareal', bbox: [-0.1709, 39.8783, -0.0309, 39.9983] },
    { city: 'ibiza', bbox: [1.363, 38.8488, 1.503, 38.9688] },
    { city: 'figueres', bbox: [2.8916, 42.2064, 3.0316, 42.3265] },
    { city: 'mairenadelaljarafe', bbox: [-6.1339, 37.2846, -5.9939, 37.4046] },
    { city: 'antequera', bbox: [-4.6312, 36.9594, -4.4912, 37.0794] },
    { city: 'alzira', bbox: [-0.5033, 39.09, -0.3633, 39.21] },
    { city: 'mieres', bbox: [-5.8367, 43.19, -5.6967, 43.31] },
    { city: 'colmenarviejo', bbox: [-3.8376, 40.5991, -3.6976, 40.7191] },
    { city: 'manacor', bbox: [3.1396, 39.5096, 3.2796, 39.6296] },
    { city: 'lucena', bbox: [-4.5552, 37.3488, -4.4152, 37.4688] },
    { city: 'trescantos', bbox: [-3.7781, 40.5409, -3.6381, 40.6609] },
    { city: 'laorotava', bbox: [-16.5931, 28.3308, -16.4531, 28.4508] },
    { city: 'denia', bbox: [0.0357, 38.7808, 0.1757, 38.9008] },
    { city: 'alcantarilla', bbox: [-1.2871, 37.9094, -1.1471, 38.0294] },
    { city: 'plasencia', bbox: [-6.1584, 39.9712, -6.0184, 40.0912] },
    { city: 'blanes', bbox: [2.7204, 41.6142, 2.8604, 41.7342] },
    { city: 'granadilladeabona', bbox: [-16.646, 28.0588, -16.506, 28.1788] },
    { city: 'sama', bbox: [-5.7542, 43.2357, -5.6142, 43.3557] },
    { city: 'ecija', bbox: [-5.1526, 37.4822, -5.0126, 37.6022] },
    { city: 'vic', bbox: [2.1849, 41.8701, 2.3249, 41.9901] },
    { city: 'sanfernandodehenares', bbox: [-3.6026, 40.3639, -3.4626, 40.4839] },
    { city: 'mirandadeebro', bbox: [-3.0169, 42.6265, -2.877, 42.7465] },
    { city: 'igualada', bbox: [1.5472, 41.521, 1.6872, 41.641] },
    { city: 'errenteria', bbox: [-1.9723, 43.252, -1.8323, 43.372] },
    { city: 'rincondelavictoria', bbox: [-4.3458, 36.6571, -4.2058, 36.7772] },
    { city: 'vilafrancadelpenedes', bbox: [1.6271, 41.2862, 1.7671, 41.4062] },
    { city: 'ripollet', bbox: [2.0874, 41.4369, 2.2274, 41.5569] },
    { city: 'losrosales', bbox: [-3.7585, 40.2957, -3.6186, 40.4157] },
    { city: 'ontinyent', bbox: [-0.676, 38.7619, -0.536, 38.8819] },
    { city: 'vilagarciadearousa', bbox: [-8.8343, 42.5363, -8.6943, 42.6563] },
    { city: 'andujar', bbox: [-4.1208, 37.9792, -3.9808, 38.0992] },
    { city: 'donbenito', bbox: [-5.9316, 38.8963, -5.7916, 39.0163] },
    { city: 'ronda', bbox: [-5.2371, 36.6823, -5.0971, 36.8023] },
    { city: 'lospalaciosyvillafranca', bbox: [-5.9943, 37.1018, -5.8543, 37.2218] },
    { city: 'marratxi', bbox: [2.6553, 39.5614, 2.7953, 39.6814] },
    { city: 'arucas', bbox: [-15.5932, 28.0598, -15.4532, 28.1798] },
    { city: 'tomelloso', bbox: [-3.0916, 39.0976, -2.9516, 39.2176] },
    { city: 'llucmajor', bbox: [2.8211, 39.4309, 2.9611, 39.5509] },
    { city: 'maspalomas', bbox: [-15.656, 27.7006, -15.516, 27.8206] },
    { city: 'realejoalto', bbox: [-16.6557, 28.3165, -16.5157, 28.4365] },
    { city: 'larinconada', bbox: [-6.0509, 37.4261, -5.9109, 37.5461] },
    { city: 'elvendrell', bbox: [1.4633, 41.1567, 1.6033, 41.2767] },
    { city: 'puertodelrosario', bbox: [-13.9327, 28.4404, -13.7927, 28.5604] },
    { city: 'torrepacheco', bbox: [-1.024, 37.6829, -0.884, 37.8029] },
    { city: 'oleiros', bbox: [-8.3867, 43.2733, -8.2467, 43.3933] },
    { city: 'villena', bbox: [-0.9357, 38.5773, -0.7957, 38.6973] },
    { city: 'mazarron', bbox: [-1.3849, 37.5392, -1.2449, 37.6592] },
    { city: 'tortosa', bbox: [0.4516, 40.7525, 0.5916, 40.8725] },
    { city: 'alhaurindelatorre', bbox: [-4.6314, 36.604, -4.4914, 36.724] },
    { city: 'yecla', bbox: [-1.1847, 38.5537, -1.0447, 38.6737] },
    { city: 'sanpedroalcantara', bbox: [-5.0612, 36.4284, -4.9212, 36.5484] },
    { city: 'cieza', bbox: [-1.4899, 38.18, -1.3499, 38.3] },
    { city: 'tudela', bbox: [-1.6745, 42.0017, -1.5345, 42.1217] },
    { city: 'azuquecadehenares', bbox: [-3.3375, 40.5057, -3.1975, 40.6257] },
    { city: 'ubeda', bbox: [-3.4405, 37.9533, -3.3005, 38.0733] },
    { city: 'aguilas', bbox: [-1.6529, 37.3463, -1.5129, 37.4663] },
    { city: 'villajoyosa', bbox: [-0.3035, 38.4475, -0.1635, 38.5675] },
    { city: 'olot', bbox: [2.4201, 42.121, 2.5601, 42.241] },
    { city: 'almendralejo', bbox: [-6.4775, 38.6232, -6.3375, 38.7432] },
    { city: 'arandadeduero', bbox: [-3.7592, 41.6104, -3.6192, 41.7304] },
    { city: 'cambrils', bbox: [0.9895, 41.01, 1.1295, 41.13] },
    { city: 'castrourdiales', bbox: [-3.2904, 43.3228, -3.1504, 43.4429] },
    { city: 'galapagar', bbox: [-4.0743, 40.5183, -3.9343, 40.6383] },
    { city: 'santapola', bbox: [-0.6358, 38.1317, -0.4958, 38.2517] },
    { city: 'sanjavier', bbox: [-0.9074, 37.7463, -0.7674, 37.8663] },
    { city: 'arroyomolinos', bbox: [-3.9895, 40.2095, -3.8495, 40.3295] },
    { city: 'santaeulariadesriu', bbox: [1.4641, 38.9246, 1.6041, 39.0446] },
    { city: 'carballo', bbox: [-8.761, 43.153, -8.621, 43.273] },
    { city: 'arcosdelafrontera', bbox: [-5.8806, 36.6907, -5.7406, 36.8108] },
    { city: 'valdepenas', bbox: [-3.4548, 38.7021, -3.3148, 38.8221] },
    { city: 'hellin', bbox: [-1.771, 38.4506, -1.631, 38.5706] },
    { city: 'alcazardesanjuan', bbox: [-3.2783, 39.3301, -3.1383, 39.4501] },
    { city: 'coriadelrio', bbox: [-6.1241, 37.2277, -5.9841, 37.3477] },
    { city: 'camargo', bbox: [-3.955, 43.3474, -3.815, 43.4674] },
    { city: 'puentegenil', bbox: [-4.8369, 37.3294, -4.6969, 37.4494] },
    { city: 'culleredo', bbox: [-8.4586, 43.2279, -8.3186, 43.3479] },
    { city: 'atamaria', bbox: [-0.8768, 37.5399, -0.7368, 37.6599] },
    { city: 'puertodelcarmen', bbox: [-13.7358, 28.8631, -13.5958, 28.9831] },
    { city: 'arteixo', bbox: [-8.5775, 43.2448, -8.4375, 43.3648] },
    { city: 'xativa', bbox: [-0.5885, 38.9304, -0.4485, 39.0504] },
    { city: 'ingenio', bbox: [-15.5043, 27.8586, -15.3643, 27.9786] },
    { city: 'inca', bbox: [2.8409, 39.6611, 2.9809, 39.7811] },
    { city: 'galdakao', bbox: [-2.9129, 43.1707, -2.7729, 43.2907] },
    { city: 'totana', bbox: [-1.5723, 37.7088, -1.4323, 37.8288] },
    { city: 'redondela', bbox: [-8.6796, 42.2234, -8.5396, 42.3434] },
    { city: 'ciutadella', bbox: [3.7714, 39.9411, 3.9114, 40.0611] },
    { city: 'mao', bbox: [4.1958, 39.8285, 4.3358, 39.9485] },
    { city: 'crevillente', bbox: [-0.8797, 38.1899, -0.7397, 38.3099] },
    { city: 'sueca', bbox: [-0.3811, 39.1426, -0.2411, 39.2626] },
    { city: 'rota', bbox: [-6.43, 36.5636, -6.29, 36.6836] },
    { city: 'carmona', bbox: [-5.7161, 37.4112, -5.5761, 37.5313] },
    { city: 'oliva', bbox: [-0.1894, 38.8597, -0.0493, 38.9797] },
    { city: 'vinaros', bbox: [0.4056, 40.4103, 0.5456, 40.5303] },
    { city: 'durango', bbox: [-2.7038, 43.1112, -2.5638, 43.2312] },
    { city: 'javea', bbox: [0.0967, 38.7233, 0.2367, 38.8433] },
    { city: 'santvicencdelshorts', bbox: [1.9369, 41.3332, 2.0769, 41.4532] },
    { city: 'elcampello', bbox: [-0.4677, 38.3688, -0.3277, 38.4889] },
    { city: 'martorell', bbox: [1.8606, 41.414, 2.0006, 41.534] },
    { city: 'morondelafrontera', bbox: [-5.524, 37.0608, -5.384, 37.1808] },
    { city: 'almunecar', bbox: [-3.7617, 36.6725, -3.6217, 36.7925] },
    { city: 'sitges', bbox: [1.7419, 41.1751, 1.8819, 41.2951] },
    { city: 'ribeira', bbox: [-8.5111, 42.6781, -8.3711, 42.7981] },
    { city: 'eibar', bbox: [-2.5416, 43.1249, -2.4016, 43.2449] },
    { city: 'premiademar', bbox: [2.2952, 41.4321, 2.4352, 41.5521] },
    { city: 'novelda', bbox: [-0.8377, 38.3248, -0.6977, 38.4448] },
    { city: 'santauxiaderibeira', bbox: [-9.0609, 42.4935, -8.9209, 42.6135] },
    { city: 'catarroja', bbox: [-0.47, 39.34, -0.33, 39.46] },
    { city: 'salou', bbox: [1.0716, 41.0166, 1.2116, 41.1366] },
    { city: 'pinedademar', bbox: [2.6189, 41.5676, 2.7589, 41.6876] },
    { city: 'benicarlo', bbox: [0.3571, 40.3565, 0.4971, 40.4765] },
    { city: 'villarrobledo', bbox: [-2.6712, 39.2099, -2.5312, 39.3299] },
    { city: 'nijar', bbox: [-2.2759, 36.9065, -2.136, 37.0266] },
    { city: 'lebrija', bbox: [-6.1453, 36.8608, -6.0053, 36.9808] },
    { city: 'caravaca', bbox: [-1.9334, 38.0456, -1.7934, 38.1656] },
    { city: 'marin', bbox: [-8.7714, 42.3314, -8.6314, 42.4515] },
    { city: 'lepe', bbox: [-7.2743, 37.1948, -7.1343, 37.3148] },
    { city: 'laoliva', bbox: [-13.9991, 28.5505, -13.8591, 28.6705] },
    { city: 'almonte', bbox: [-6.5867, 37.2047, -6.4467, 37.3247] },
    { city: 'jumilla', bbox: [-1.395, 38.4192, -1.255, 38.5392] },
    { city: 'valls', bbox: [1.1799, 41.2261, 1.3199, 41.3461] },
    { city: 'onda', bbox: [-0.3304, 39.905, -0.1904, 40.025] },
    { city: 'calahorra', bbox: [-2.0352, 42.2451, -1.8952, 42.3651] },
    { city: 'martos', bbox: [-4.0426, 37.6611, -3.9026, 37.7811] },
    { city: 'almansa', bbox: [-1.1671, 38.8092, -1.0271, 38.9292] },
    { city: 'adra', bbox: [-3.0908, 36.6883, -2.9508, 36.8083] },
    { city: 'candelaria', bbox: [-16.4427, 28.2948, -16.3027, 28.4148] },
    { city: 'galdar', bbox: [-15.7202, 28.087, -15.5802, 28.207] },
    { city: 'cullera', bbox: [-0.32, 39.1067, -0.18, 39.2267] },
    { city: 'ibi', bbox: [-0.6422, 38.5653, -0.5023, 38.6853] },
    { city: 'castellardelvalles', bbox: [2.0133, 41.5567, 2.1533, 41.6767] },
    { city: 'icoddelosvinos', bbox: [-16.7819, 28.3124, -16.6419, 28.4324] },
    { city: 'altea', bbox: [-0.1215, 38.5388, 0.0185, 38.6588] },
    { city: 'tacoronte', bbox: [-16.4802, 28.4169, -16.3402, 28.5369] },
    { city: 'losbarrios', bbox: [-5.5621, 36.1248, -5.4221, 36.2448] },
    { city: 'baza', bbox: [-2.8426, 37.4307, -2.7026, 37.5507] },
    { city: 'calp', bbox: [-0.0255, 38.5847, 0.1145, 38.7047] },
    { city: 'alhaurinelgrande', bbox: [-4.7573, 36.583, -4.6173, 36.703] },
    { city: 'olesademontserrat', bbox: [1.8241, 41.4837, 1.9641, 41.6037] },
    { city: 'ponteareas', bbox: [-8.574, 42.1148, -8.434, 42.2348] },
    { city: 'montilla', bbox: [-4.708, 37.5263, -4.568, 37.6463] },
    { city: 'lliria', bbox: [-0.6678, 39.5689, -0.5278, 39.6889] },
    { city: 'vicar', bbox: [-2.7127, 36.7716, -2.5727, 36.8916] },
    { city: 'alcalalareal', bbox: [-3.993, 37.4014, -3.853, 37.5214] },
    { city: 'zarautz', bbox: [-2.2399, 43.2244, -2.0999, 43.3444] },
    { city: 'priegodecordoba', bbox: [-4.2652, 37.3781, -4.1252, 37.4981] },
    { city: 'barbate', bbox: [-5.9919, 36.1324, -5.8519, 36.2524] },
    { city: 'conildelafrontera', bbox: [-6.1585, 36.2172, -6.0185, 36.3372] },
    { city: 'palafrugell', bbox: [3.0931, 41.8574, 3.2331, 41.9774] },
    { city: 'ciempozuelos', bbox: [-3.691, 40.0991, -3.551, 40.2191] },
    { city: 'arrasatemondragon', bbox: [-2.5598, 43.0044, -2.4198, 43.1244] },
    { city: 'ribarrojadelturia', bbox: [-0.6407, 39.4859, -0.5007, 39.606] },
    { city: 'santfeliudeguixols', bbox: [2.9633, 41.7233, 3.1033, 41.8433] },
    { city: 'moncada', bbox: [-0.4655, 39.4855, -0.3255, 39.6056] },
    { city: 'coin', bbox: [-4.8264, 36.5995, -4.6864, 36.7195] },
    { city: 'santantonideportmany', bbox: [1.2336, 38.9207, 1.3736, 39.0407] },
    { city: 'nerja', bbox: [-3.9444, 36.6928, -3.8044, 36.8128] },
    { city: 'torrelodones', bbox: [-3.9966, 40.5165, -3.8566, 40.6365] },
    { city: 'lagunadeduero', bbox: [-4.7933, 41.5215, -4.6533, 41.6415] },
    { city: 'mogan', bbox: [-15.7954, 27.8239, -15.6554, 27.9439] },
    { city: 'navalcarnero', bbox: [-4.082, 40.2291, -3.942, 40.3491] },
    { city: 'loja', bbox: [-4.2213, 37.1089, -4.0813, 37.2289] },
    { city: 'medinadelcampo', bbox: [-4.9841, 41.2524, -4.8441, 41.3724] },
    { city: 'pilardelahoradada', bbox: [-0.8626, 37.8059, -0.7226, 37.9259] },
    { city: 'cabra', bbox: [-4.5121, 37.4125, -4.3721, 37.5325] },
    { city: 'islacristina', bbox: [-7.3867, 37.14, -7.2467, 37.26] },
    { city: 'cartama', bbox: [-4.703, 36.6507, -4.563, 36.7707] },
    { city: 'illescas', bbox: [-3.917, 40.0621, -3.777, 40.1821] },
    { city: 'amposta', bbox: [0.5086, 40.6499, 0.6486, 40.77] },
    { city: 'palmadelrio', bbox: [-5.3512, 37.6402, -5.2112, 37.7602] },
    { city: 'baena', bbox: [-4.3924, 37.5567, -4.2524, 37.6767] },
    { city: 'ayamonte', bbox: [-7.4781, 37.1533, -7.3381, 37.2733] },
    { city: 'pajara', bbox: [-14.1776, 28.2904, -14.0376, 28.4104] },
    { city: 'betera', bbox: [-0.5315, 39.5311, -0.3915, 39.6511] },
    { city: 'aestrada', bbox: [-8.5584, 42.6291, -8.4184, 42.7491] },
    { city: 'manlleu', bbox: [2.2148, 41.9423, 2.3548, 42.0623] },
    { city: 'almoradi', bbox: [-0.862, 38.0488, -0.722, 38.1688] },
    { city: 'guiadeisora', bbox: [-16.8495, 28.1515, -16.7095, 28.2715] },
    { city: 'rojales', bbox: [-0.7954, 38.028, -0.6554, 38.148] },
    { city: 'mairenadelalcor', bbox: [-5.8195, 37.313, -5.6795, 37.433] },
    { city: 'requena', bbox: [-1.1704, 39.4283, -1.0304, 39.5483] },
    { city: 'algete', bbox: [-3.5674, 40.5371, -3.4274, 40.6571] },
    { city: 'losllanosdearidane', bbox: [-17.9882, 28.5985, -17.8482, 28.7185] },
    { city: 'lalin', bbox: [-8.1828, 42.6009, -8.0428, 42.7209] },
    { city: 'calatayud', bbox: [-1.7132, 41.2935, -1.5732, 41.4135] },
    { city: 'alhamademurcia', bbox: [-1.4951, 37.791, -1.3551, 37.911] },
    { city: 'alcudia', bbox: [3.0514, 39.7932, 3.1914, 39.9132] },
    { city: 'picassent', bbox: [-0.5295, 39.3035, -0.3895, 39.4235] },
    { city: 'marchena', bbox: [-5.4868, 37.269, -5.3468, 37.389] },
    { city: 'banyoles', bbox: [2.6967, 42.0567, 2.8367, 42.1767] },
    { city: 'moguer', bbox: [-6.9085, 37.2156, -6.7685, 37.3356] },
    { city: 'elarahal', bbox: [-5.6153, 37.2027, -5.4753, 37.3227] },
    { city: 'monfortedelemos', bbox: [-7.5842, 42.4617, -7.4442, 42.5817] },
    { city: 'teguise', bbox: [-13.634, 29.0005, -13.494, 29.1205] },
    { city: 'chipiona', bbox: [-6.507, 36.6766, -6.367, 36.7966] },
    { city: 'loradelrio', bbox: [-5.5975, 37.599, -5.4575, 37.719] },
    { city: 'roses', bbox: [3.1069, 42.202, 3.2469, 42.322] },
    { city: 'manzanares', bbox: [-3.4399, 38.9392, -3.2999, 39.0592] },
    { city: 'benavente', bbox: [-5.7483, 41.9425, -5.6083, 42.0625] },
    { city: 'pucol', bbox: [-0.37, 39.5567, -0.23, 39.6767] },
    { city: 'zubia', bbox: [-3.654, 37.0591, -3.514, 37.1791] },
    { city: 'boiro', bbox: [-8.9546, 42.5873, -8.8146, 42.7073] },
    { city: 'bailen', bbox: [-3.8479, 38.0364, -3.7079, 38.1564] },
    { city: 'guadix', bbox: [-3.2092, 37.2393, -3.0692, 37.3593] },
    { city: 'daimiel', bbox: [-3.685, 39.01, -3.545, 39.13] },
    { city: 'sanbartolome', bbox: [-13.683, 28.9409, -13.543, 29.0609] },
    { city: 'santabrigida', bbox: [-15.5742, 27.972, -15.4342, 28.092] },
    { city: 'llodio', bbox: [-3.032, 43.0832, -2.892, 43.2032] },
    { city: 'felanitx', bbox: [3.0783, 39.4096, 3.2183, 39.5296] },
    { city: 'sanmartindelavega', bbox: [-3.6406, 40.1473, -3.5006, 40.2674] },
    { city: 'archena', bbox: [-1.3704, 38.0563, -1.2304, 38.1763] },
    { city: 'tavernesdelavalldigna', bbox: [-0.3362, 39.012, -0.1962, 39.132] },
    { city: 'tarifa', bbox: [-5.677, 35.9539, -5.5369, 36.0739] },
    { city: 'benicassim', bbox: [-0.0033, 39.99, 0.1367, 40.11] },
    { city: 'tolosa', bbox: [-2.148, 43.0748, -2.008, 43.1948] },
    { city: 'nigran', bbox: [-8.8766, 42.0815, -8.7366, 42.2015] },
    { city: 'aljaraque', bbox: [-7.0931, 37.2099, -6.9531, 37.3299] },
    { city: 'callosadesegura', bbox: [-0.9482, 38.065, -0.8082, 38.185] },
    { city: 'palamos', bbox: [3.0591, 41.7884, 3.1991, 41.9084] },
    { city: 'sanlorenzodeelescorial', bbox: [-4.2174, 40.5314, -4.0774, 40.6514] },
    { city: 'lanucia', bbox: [-0.1969, 38.5537, -0.0569, 38.6737] },
    { city: 'osuna', bbox: [-5.1731, 37.1776, -5.0331, 37.2976] },
    { city: 'oria', bbox: [-2.0887, 43.1954, -1.9487, 43.3154] },
    { city: 'amorebieta', bbox: [-2.8033, 43.1567, -2.6633, 43.2767] },
    { city: 'teo', bbox: [-8.618, 42.735, -8.478, 42.855] },
    { city: 'launion', bbox: [-0.948, 37.5591, -0.808, 37.6792] },
    { city: 'utebo', bbox: [-1.0692, 41.6483, -0.9292, 41.7683] },
    { city: 'pozoblanco', bbox: [-4.9183, 38.3191, -4.7783, 38.4391] },
    { city: 'guimar', bbox: [-16.4828, 28.2512, -16.3428, 28.3712] },
    { city: 'huercalovera', bbox: [-2.013, 37.3292, -1.873, 37.4492] },
    { city: 'porrino', bbox: [-8.6898, 42.1016, -8.5498, 42.2216] },
    { city: 'ejeadeloscaballeros', bbox: [-1.2072, 42.0663, -1.0672, 42.1863] },
    { city: 'vilaseca', bbox: [2.1853, 42.0017, 2.3253, 42.1217] },
    { city: 'tui', bbox: [-8.7143, 41.9871, -8.5743, 42.1071] },
    { city: 'pollenca', bbox: [2.9463, 39.8168, 3.0863, 39.9368] },
    { city: 'navalmoraldelamata', bbox: [-5.6106, 39.8316, -5.4706, 39.9516] },
    { city: 'sanxenxo', bbox: [-8.877, 42.34, -8.737, 42.46] },
    { city: 'berga', bbox: [1.7763, 42.0443, 1.9163, 42.1643] },
    { city: 'albolote', bbox: [-3.7251, 37.1709, -3.5851, 37.2909] },
    { city: 'monzon', bbox: [0.1241, 41.8508, 0.2641, 41.9708] },
    { city: 'ubrique', bbox: [-5.516, 36.6178, -5.376, 36.7378] },
    { city: 'mula', bbox: [-1.5601, 37.981, -1.4201, 38.101] },
    { city: 'bermeo', bbox: [-2.7915, 43.3609, -2.6515, 43.4809] },
    { city: 'barbastro', bbox: [0.0569, 41.9756, 0.1969, 42.0957] },
    { city: 'torrox', bbox: [-4.0223, 36.6979, -3.8823, 36.8179] },
    { city: 'caldesdemontbui', bbox: [2.0967, 41.5733, 2.2367, 41.6933] },
    { city: 'santceloni', bbox: [2.4197, 41.6292, 2.5597, 41.7492] },
    { city: 'balaguer', bbox: [0.7409, 41.7312, 0.8809, 41.8512] },
    { city: 'villanuevadelacanada', bbox: [-4.0743, 40.3869, -3.9343, 40.5069] },
    { city: 'cardedeu', bbox: [2.2874, 41.5798, 2.4274, 41.6998] },
    { city: 'tarrega', bbox: [1.0696, 41.587, 1.2096, 41.707] },
    { city: 'zafra', bbox: [-6.4873, 38.3654, -6.3473, 38.4854] },
    { city: 'alcaniz', bbox: [-0.2033, 40.99, -0.0633, 41.11] },
    { city: 'lascabezasdesanjuan', bbox: [-6.0093, 36.9238, -5.8693, 37.0438] },
    { city: 'lasgabias', bbox: [-3.7403, 37.0755, -3.6003, 37.1955] },
    { city: 'guardamardelsegura', bbox: [-0.7256, 38.0303, -0.5856, 38.1503] },
    { city: 'yaiza', bbox: [-13.8353, 28.8968, -13.6953, 29.0168] },
    { city: 'baeza', bbox: [-3.541, 37.9338, -3.401, 38.0538] },
    { city: 'gernikalumo', bbox: [-2.7533, 43.2567, -2.6133, 43.3767] },
    { city: 'viveiro', bbox: [-7.6634, 43.6023, -7.5234, 43.7223] },
    { city: 'montijo', bbox: [-6.6878, 38.8484, -6.5478, 38.9684] },
    { city: 'sesena', bbox: [-3.7679, 40.0447, -3.6279, 40.1647] },
    { city: 'mungia', bbox: [-2.9152, 43.2946, -2.7752, 43.4146] },
    { city: 'laroda', bbox: [-2.2272, 39.1473, -2.0872, 39.2674] },
    { city: 'santacruzdelapalma', bbox: [-17.8342, 28.6235, -17.6942, 28.7435] },
    { city: 'losalcazares', bbox: [-0.9204, 37.6843, -0.7804, 37.8043] },
    { city: 'tarancon', bbox: [-3.0773, 39.9485, -2.9373, 40.0685] },
    { city: 'carlet', bbox: [-0.5914, 39.1666, -0.4514, 39.2866] },
    { city: 'lasolana', bbox: [-3.3081, 38.8842, -3.1681, 39.0042] },
    { city: 'santcarlesdelarapita', bbox: [0.53, 40.5567, 0.67, 40.6767] },
    { city: 'santafe', bbox: [-3.7889, 37.1286, -3.6489, 37.2486] },
    { city: 'piera', bbox: [1.6808, 41.4623, 1.8208, 41.5823] },
    { city: 'tordera', bbox: [2.6489, 41.6391, 2.7889, 41.7591] },
    { city: 'santomera', bbox: [-1.1188, 38.0015, -0.9788, 38.1215] },
    { city: 'arenysdemar', bbox: [2.4794, 41.5219, 2.6194, 41.6419] },
    { city: 'lacarolina', bbox: [-3.6853, 38.2156, -3.5453, 38.3356] },
    { city: 'torredembarra', bbox: [1.3286, 41.085, 1.4686, 41.2051] },
    { city: 'berja', bbox: [-3.0197, 36.7869, -2.8797, 36.9069] },
    { city: 'bejar', bbox: [-5.8334, 40.3264, -5.6934, 40.4464] },
    { city: 'campodecriptana', bbox: [-3.1949, 39.3446, -3.0549, 39.4646] },
    { city: 'lagarriga', bbox: [2.2133, 41.6233, 2.3533, 41.7433] },
    { city: 'puertolumbreras', bbox: [-1.8797, 37.5033, -1.7397, 37.6233] },
    { city: 'huercaldealmeria', bbox: [-2.5076, 36.8251, -2.3676, 36.9451] },
    { city: 'vecindario', bbox: [-15.5145, 27.7864, -15.3745, 27.9064] },
    { city: 'guadarrama', bbox: [-4.1595, 40.6127, -4.0195, 40.7327] },
    { city: 'azpeitia', bbox: [-2.3369, 43.1225, -2.1969, 43.2425] },
    { city: 'puntaumbria', bbox: [-7.036, 37.1221, -6.896, 37.2421] },
    { city: 'bergara', bbox: [-2.4875, 43.0551, -2.3475, 43.1751] },
    { city: 'mos', bbox: [-7.6132, 43.1012, -7.4732, 43.2212] },
    { city: 'torredelcampo', bbox: [-3.9673, 37.7105, -3.8273, 37.8305] },
    { city: 'teulada', bbox: [0.0338, 38.6694, 0.1738, 38.7894] },
    { city: 'cangasdelnarcea', bbox: [-6.62, 43.1233, -6.48, 43.2433] },
    { city: 'arnedo', bbox: [-2.1708, 42.168, -2.0308, 42.288] },
    { city: 'villaviciosa', bbox: [-5.5057, 43.4213, -5.3657, 43.5413] },
    { city: 'paracuellosdejarama', bbox: [-3.5977, 40.4435, -3.4577, 40.5635] },
    { city: 'mollerussa', bbox: [0.83, 41.5733, 0.97, 41.6933] },
    { city: 'fraga', bbox: [0.2789, 41.4629, 0.4189, 41.5829] },
    { city: 'estellalizarra', bbox: [-2.1023, 42.6118, -1.9623, 42.7318] },
    { city: 'vilalba', bbox: [-7.7513, 43.2381, -7.6113, 43.3581] },
    { city: 'chiva', bbox: [-0.7867, 39.4067, -0.6467, 39.5267] },
    { city: 'fene', bbox: [-8.22, 43.39, -8.08, 43.51] },
    { city: 'bollullospardelcondado', bbox: [-6.6097, 37.2813, -6.4697, 37.4013] },
    { city: 'ciudadrodrigo', bbox: [-6.6033, 40.54, -6.4633, 40.66] },
    { city: 'vallirana', bbox: [1.8621, 41.3268, 2.0021, 41.4468] },
    { city: 'soller', bbox: [2.6452, 39.7062, 2.7852, 39.8262] },
    { city: 'vera', bbox: [-1.929, 37.1835, -1.789, 37.3035] },
    { city: 'llanera', bbox: [-5.9208, 43.3796, -5.7808, 43.4996] },
    { city: 'canals', bbox: [-0.6544, 38.9025, -0.5144, 39.0225] },
    { city: 'ocarballino', bbox: [-8.149, 42.3716, -8.009, 42.4916] },
    { city: 'aguadulce', bbox: [-2.6423, 36.7541, -2.5024, 36.8741] },
    { city: 'verin', bbox: [-7.5081, 41.8815, -7.3681, 42.0015] },
    { city: 'manilva', bbox: [-5.3203, 36.3164, -5.1803, 36.4365] },
    { city: 'cambados', bbox: [-8.8831, 42.4522, -8.7431, 42.5722] },
    { city: 'betanzos', bbox: [-8.2847, 43.2204, -8.1447, 43.3404] },
    { city: 'llanes', bbox: [-4.8249, 43.3598, -4.6848, 43.4798] },
    { city: 'tuineje', bbox: [-14.1172, 28.2637, -13.9772, 28.3837] },
    { city: 'corralejo', bbox: [-13.9375, 28.6708, -13.7975, 28.7908] },
    { city: 'beasain', bbox: [-2.2709, 42.9902, -2.1309, 43.1102] },
    { city: 'pinospuente', bbox: [-3.8197, 37.1911, -3.6797, 37.3111] },
    { city: 'aguilar', bbox: [-4.7272, 37.4548, -4.5872, 37.5748] },
    { city: 'sarria', bbox: [-7.4843, 42.7215, -7.3443, 42.8415] },
    { city: 'nules', bbox: [-0.2264, 39.7936, -0.0864, 39.9136] },
    { city: 'obarcodevaldeorras', bbox: [-7.06, 42.3564, -6.92, 42.4764] },
    { city: 'jaca', bbox: [-0.6199, 42.509, -0.4799, 42.629] },
    { city: 'pilas', bbox: [-6.371, 37.2434, -6.231, 37.3634] },
    { city: 'villafrancadelosbarros', bbox: [-6.4081, 38.5014, -6.2681, 38.6214] },
    { city: 'tomino', bbox: [-8.825, 41.9277, -8.685, 42.0477] },
    { city: 'sanagustindelguadalix', bbox: [-3.6864, 40.6188, -3.5464, 40.7388] },
    { city: 'alginet', bbox: [-0.5367, 39.2067, -0.3967, 39.3267] },
    { city: 'lacarlota', bbox: [-5.0012, 37.6136, -4.8612, 37.7336] },
    { city: 'socuellamos', bbox: [-2.862, 39.2258, -2.7221, 39.3458] },
    { city: 'torrijos', bbox: [-4.3535, 39.9219, -4.2135, 40.042] },
    { city: 'cuevasdelalmanzora', bbox: [-1.9522, 37.2368, -1.8122, 37.3568] },
    { city: 'vejerdelafrontera', bbox: [-6.0372, 36.1921, -5.8972, 36.3121] },
    { city: 'alora', bbox: [-4.7758, 36.7636, -4.6357, 36.8836] },
    { city: 'montroigdelcamp', bbox: [0.8893, 41.0268, 1.0293, 41.1468] },
    { city: 'coria', bbox: [-6.606, 39.9241, -6.466, 40.0441] },
    { city: 'valverdedelcamino', bbox: [-6.8243, 37.5151, -6.6843, 37.6351] },
    { city: 'sapobla', bbox: [2.9539, 39.7092, 3.0939, 39.8292] },
    { city: 'sanlucarlamayor', bbox: [-6.2735, 37.3276, -6.1335, 37.4476] },
    { city: 'salobrena', bbox: [-3.6572, 36.6828, -3.5172, 36.8028] },
    { city: 'quintanardelaorden', bbox: [-3.1116, 39.5337, -2.9717, 39.6537] },
    { city: 'santanyi', bbox: [3.0591, 39.2946, 3.1991, 39.4146] },
    { city: 'espartinas', bbox: [-6.1958, 37.3215, -6.0558, 37.4415] },
    { city: 'estepa', bbox: [-4.949, 37.2326, -4.809, 37.3526] },
    { city: 'ordes', bbox: [-8.479, 43.0165, -8.339, 43.1365] },
    { city: 'poladesiero', bbox: [-5.7334, 43.3323, -5.5933, 43.4523] },
    { city: 'villamartin', bbox: [-5.7148, 36.7998, -5.5748, 36.9198] },
    { city: 'bullas', bbox: [-1.7423, 37.9867, -1.6023, 38.1067] },
    { city: 'bolanosdecalatrava', bbox: [-3.7334, 38.8469, -3.5934, 38.9669] },
    { city: 'brenes', bbox: [-5.9414, 37.4894, -5.8014, 37.6094] },
    { city: 'utiel', bbox: [-1.27, 39.5067, -1.13, 39.6267] },
    { city: 'bueu', bbox: [-8.855, 42.2646, -8.715, 42.3846] },
    { city: 'cunit', bbox: [1.5664, 41.1383, 1.7065, 41.2583] },
    { city: 'haro', bbox: [-2.9176, 42.5163, -2.7776, 42.6363] },
    { city: 'gibraleon', bbox: [-7.0389, 37.3163, -6.8989, 37.4363] },
    { city: 'santsadurnidanoia', bbox: [1.7152, 41.3656, 1.8552, 41.4856] },
    { city: 'sonservera', bbox: [3.2901, 39.5607, 3.4301, 39.6807] },
    { city: 'monovar', bbox: [-0.9106, 38.3781, -0.7706, 38.4981] },
    { city: 'jodar', bbox: [-3.4226, 37.7806, -3.2826, 37.9006] },
    { city: 'castellodempuries', bbox: [3.0045, 42.1967, 3.1445, 42.3167] },
    { city: 'astorga', bbox: [-6.126, 42.3988, -5.986, 42.5188] },
    { city: 'santiagodelteide', bbox: [-16.8862, 28.234, -16.7462, 28.354] },
    { city: 'laseudurgell', bbox: [1.3914, 42.2988, 1.5314, 42.4188] },
    { city: 'olivenza', bbox: [-7.1705, 38.6227, -7.0305, 38.7427] },
    { city: 'antigua', bbox: [-14.0838, 28.3631, -13.9438, 28.4831] },
    { city: 'capdepera', bbox: [3.3653, 39.6424, 3.5053, 39.7624] },
    { city: 'penarroyapueblonuevo', bbox: [-5.3367, 38.24, -5.1967, 38.36] },
    { city: 'deltebre', bbox: [0.6384, 40.6594, 0.7784, 40.7794] },
    { city: 'albatera', bbox: [-0.9406, 38.119, -0.8006, 38.239] },
    { city: 'santacolomadefarners', bbox: [2.5967, 41.8067, 2.7367, 41.9267] },
    { city: 'arroyodelaencomienda', bbox: [-4.8669, 41.5496, -4.7269, 41.6696] },
    { city: 'andratx', bbox: [2.3502, 39.5155, 2.4902, 39.6355] },
    { city: 'medinasidonia', bbox: [-5.9972, 36.3969, -5.8572, 36.517] },
    { city: 'torroellademontgri', bbox: [3.057, 41.9825, 3.197, 42.1025] },
    { city: 'santona', bbox: [-3.5276, 43.3839, -3.3876, 43.5039] },
    { city: 'santamargalida', bbox: [3.0322, 39.6414, 3.1721, 39.7614] },
    { city: 'loscorralesdebuelna', bbox: [-4.1426, 43.2036, -4.0026, 43.3236] },
    { city: 'aspontesdegarciarodriguez', bbox: [-7.9218, 43.3927, -7.7818, 43.5127] },
    { city: 'madridejos', bbox: [-3.602, 39.4082, -3.462, 39.5282] },
    { city: 'tafalla', bbox: [-1.7445, 42.4669, -1.6045, 42.5869] },
    { city: 'laracha', bbox: [-8.6553, 43.1937, -8.5153, 43.3138] },
    { city: 'villacarrillo', bbox: [-3.1548, 38.0556, -3.0148, 38.1756] },
    { city: 'sonseca', bbox: [-4.0445, 39.6175, -3.9045, 39.7375] },
    { city: 'tarazona', bbox: [-1.7968, 41.8448, -1.6568, 41.9648] },
    { city: 'villarrubiadelosojos', bbox: [-3.678, 39.1608, -3.538, 39.2809] },
    { city: 'albox', bbox: [-2.2195, 37.3286, -2.0795, 37.4486] },
    { city: 'alberic', bbox: [-0.5867, 39.0567, -0.4467, 39.1767] },
    { city: 'tineo', bbox: [-6.4845, 43.2776, -6.3445, 43.3977] },
    { city: 'alcaudete', bbox: [-4.1524, 37.5309, -4.0124, 37.6509] },
    { city: 'pego', bbox: [-0.1871, 38.783, -0.0471, 38.9031] },
    { city: 'guillena', bbox: [-6.1263, 37.4826, -5.9863, 37.6026] },
    { city: 'poladelena', bbox: [-5.8988, 43.1009, -5.7588, 43.2209] },
    { city: 'ripoll', bbox: [2.1203, 42.1406, 2.2603, 42.2606] },
    { city: 'labaneza', bbox: [-5.9677, 42.2403, -5.8277, 42.3603] },
    { city: 'valdemorillo', bbox: [-4.1371, 40.4406, -3.9971, 40.5606] },
    { city: 'lapuebladecazalla', bbox: [-5.3815, 37.1616, -5.2415, 37.2816] },
    { city: 'puertorico', bbox: [-15.7804, 27.7294, -15.6404, 27.8494] },
    { city: 'manchareal', bbox: [-3.6823, 37.7263, -3.5423, 37.8463] },
    { city: 'fuensalida', bbox: [-4.2772, 39.9929, -4.1372, 40.1129] },
    { city: 'consuegra', bbox: [-3.678, 39.4025, -3.538, 39.5225] },
    { city: 'onate', bbox: [-2.48, 42.9726, -2.34, 43.0926] },
    { city: 'fuentepalmera', bbox: [-5.1696, 37.6449, -5.0296, 37.7649] },
    { city: 'santaponsa', bbox: [2.4066, 39.4487, 2.5466, 39.5687] },
    { city: 'villacanas', bbox: [-3.4081, 39.5637, -3.2681, 39.6837] },
    { city: 'cantillana', bbox: [-5.8947, 37.5503, -5.7547, 37.6703] },
    { city: 'rute', bbox: [-4.4383, 37.2669, -4.2983, 37.3869] },
    { city: 'mora', bbox: [-3.8439, 39.6249, -3.7039, 39.7449] },
    { city: 'santacomba', bbox: [-8.8793, 42.9731, -8.7392, 43.0931] },
    { city: 'illora', bbox: [-3.9511, 37.2277, -3.8111, 37.3477] },
    { city: 'lalcora', bbox: [-0.27, 40.0067, -0.13, 40.1267] },
    { city: 'luanco', bbox: [-5.8634, 43.5552, -5.7234, 43.6752] },
    { city: 'lescala', bbox: [3.0626, 42.0656, 3.2026, 42.1856] },
    { city: 'labisbaldemporda', bbox: [2.98, 41.89, 3.12, 42.01] },
    { city: 'sabinanigo', bbox: [-0.4361, 42.4592, -0.2961, 42.5792] },
    { city: 'miajadas', bbox: [-5.9784, 39.0913, -5.8384, 39.2113] },
    { city: 'caudete', bbox: [-1.0572, 38.6468, -0.9172, 38.7668] },
    { city: 'castalla', bbox: [-0.7421, 38.5369, -0.6021, 38.6569] },
    { city: 'reinosa', bbox: [-4.208, 42.9396, -4.068, 43.0596] },
    { city: 'amurrio', bbox: [-3.07, 42.99, -2.93, 43.11] },
    { city: 'jerezdeloscaballeros', bbox: [-6.8426, 38.2606, -6.7026, 38.3806] },
    { city: 'sarenal', bbox: [2.68, 39.44, 2.82, 39.56] },
    { city: 'calasparra', bbox: [-1.7699, 38.17, -1.6299, 38.29] },
    { city: 'xinzodelimia', bbox: [-7.7946, 42.0035, -7.6546, 42.1235] },
    { city: 'bembibre', bbox: [-6.4854, 42.5577, -6.3454, 42.6777] },
    { city: 'villanuevadecordoba', bbox: [-4.6987, 38.2628, -4.5587, 38.3828] },
    { city: 'sax', bbox: [-0.8878, 38.4773, -0.7478, 38.5973] },
    { city: 'caldasdereis', bbox: [-8.7123, 42.5447, -8.5723, 42.6647] },
    { city: 'elcasar', bbox: [-5.9951, 38.4709, -5.8551, 38.5909] },
    { city: 'playablanca', bbox: [-13.8981, 28.8043, -13.7581, 28.9243] },
    { city: 'lamangadelmarmenor', bbox: [-0.7865, 37.5813, -0.6465, 37.7013] },
    // US — newyork / sanfrancisco moved to TERRAIN_REGION_BBOXES (2026-09-04): 3DEP has no keyless bake
    // adapter, so their tilesets are the Mapterhorn region bakes under the SAME slugs.
];

/**
 * §TERRAIN-EVERYWHERE — the whole-region tilesets. Slug + bbox MIRROR `tools/context-bake/terrain.mjs`
 * NATIONAL_REGIONS 1:1 (asserted by `terrain.mjs --check-client-coverage`); the R2 path is
 * `terrain/<region>/`. Resolved only when no city bbox matches (city detail wins where it exists).
 * Rows are ordered as the bake's groups (europe → usa → canada/mexico → australia → oceania → middleeast).
 * ⛔ Bboxes overlap at borders, and the FIRST match does NOT win — that was true until L-12944 and this
 * line was the last uncorrected copy of it. `mostInterior` (below) picks the box the point sits deepest
 * inside; row order only breaks exact ties.
 */
export const TERRAIN_REGION_BBOXES: ReadonlyArray<{ readonly region: string; readonly bbox: TerrainBbox }> = [
    // Europe — whole countries (Mapterhorn national-lidar/GLO-30, per-post EGM2008 lift; z0..10 = the resolution a Spanish city has today)
    { region: 'spain', bbox: [-9.55, 35.90, 4.60, 43.90] },
    { region: 'denmark', bbox: [7.70, 54.40, 15.30, 57.90] },
    { region: 'netherlands', bbox: [3.30, 50.75, 7.30, 53.70] },
    { region: 'estonia', bbox: [21.60, 57.50, 28.30, 59.80] },
    { region: 'lithuania', bbox: [20.85, 53.85, 26.90, 56.50] },
    { region: 'latvia', bbox: [20.90, 55.60, 28.30, 58.10] },
    { region: 'poland', bbox: [14.05, 48.95, 24.20, 55.00] },
    { region: 'luxembourg', bbox: [5.70, 49.40, 6.60, 50.20] },
    { region: 'sweden', bbox: [10.90, 55.20, 24.20, 69.10] },
    { region: 'finland', bbox: [19.00, 59.70, 31.60, 70.10] },
    { region: 'norway', bbox: [4.50, 57.90, 31.20, 71.20] },
    { region: 'germany', bbox: [5.85, 47.25, 15.05, 55.10] },
    { region: 'france', bbox: [-5.15, 41.30, 9.60, 51.10] },
    { region: 'italy', bbox: [6.60, 35.40, 18.60, 47.10] },
    { region: 'greatbritain', bbox: [-8.20, 49.90, 1.80, 60.90] },
    { region: 'ireland', bbox: [-10.70, 51.30, -5.30, 55.50] },
    { region: 'switzerland', bbox: [5.90, 45.80, 10.50, 47.85] },
    { region: 'austria', bbox: [9.50, 46.30, 17.20, 49.05] },
    { region: 'czechia', bbox: [12.05, 48.50, 18.90, 51.10] },
    { region: 'portugal', bbox: [-9.60, 36.90, -6.10, 42.20] },
    { region: 'belgium', bbox: [2.50, 49.50, 6.40, 51.60] },
    { region: 'croatia', bbox: [13.40, 42.30, 19.50, 46.60] },
    { region: 'slovenia', bbox: [13.30, 45.40, 16.60, 46.90] },
    { region: 'greece', bbox: [19.30, 34.70, 29.70, 41.80] },
    { region: 'hungary', bbox: [16.10, 45.70, 22.95, 48.60] },
    { region: 'romania', bbox: [20.20, 43.60, 29.80, 48.30] },
    { region: 'slovakia', bbox: [16.80, 47.70, 22.60, 49.65] },
    { region: 'bulgaria', bbox: [22.30, 41.20, 28.70, 44.25] },
    // §EU-EVERY-COUNTRY (2026-09-06) — the 11 new whole-country europe rows. Each bbox is
    // BYTE-IDENTICAL to `terrain.mjs` NATIONAL_REGIONS and to the `bake.mjs` context row of the same
    // name; `node tools/context-bake/terrain.mjs --check-client-coverage` fails if any of the three
    // drifts. Six MORE countries got a CONTEXT row with no terrain row on purpose — malta, andorra,
    // liechtenstein, channelislands, isleofman and moldova are each fully inside a neighbour's
    // region box AND lose to it on §MOST-INTERIOR-BBOX-WINS, so a row here would be baked and never
    // requested; the covering region is named in terrain.mjs's own block comment.
    { region: 'iceland', bbox: [-25.70, 62.80, -12.40, 67.55] },
    { region: 'faroeislands', bbox: [-8.70, 60.85, -5.50, 62.95] },
    { region: 'cyprus', bbox: [31.95, 34.20, 35.00, 36.05] },
    { region: 'serbia', bbox: [18.80, 42.20, 23.05, 46.20] },
    { region: 'bosniaherzegovina', bbox: [15.70, 42.55, 19.65, 45.30] },
    { region: 'montenegro', bbox: [18.15, 41.60, 20.40, 43.60] },
    { region: 'northmacedonia', bbox: [20.40, 40.80, 23.05, 42.40] },
    { region: 'albania', bbox: [18.85, 39.60, 21.10, 42.70] },
    { region: 'kosovo', bbox: [20.00, 41.85, 21.80, 43.30] },
    { region: 'ukraine', bbox: [22.10, 44.00, 40.25, 52.40] },
    { region: 'belarus', bbox: [23.15, 51.20, 32.80, 56.20] },
    // USA — 54 whole-STATE rows (§BAKE-US-STATES, lane USA-ALL-STATES 2026-09-06). These REPLACE the
    // six metro rows (newyork kept its slug and widened Manhattan → the whole state; sanfrancisco /
    // chicago / austin / houston / boston are gone — bake.mjs carries the reasoning). Slug + bbox
    // mirror terrain.mjs NATIONAL_REGIONS 1:1. 3DEP has no keyless bake adapter, so every US drape is
    // the Mapterhorn region bake. ⚠  is the EAST-of-antimeridian half of Alaska: its
    // west edge 171.76 is GREATER than nothing here — it is a normal w<e box in the eastern hemisphere,
    // and  is a normal w<e box in the western one. Nothing wraps, so nothing swallows the
    // Pacific. ⚠ KNOWN LIMITATION, measured and NOT tuned away: see §MOST-INTERIOR-BBOX-WINS below and
    // __tests__/terrainRegionResolve.spec.ts — rectangles cannot separate every US state border, and
    // three points (Chicago, Houston, El Paso) resolve to a FOREIGN row that already contained them
    // before these rows existed.
    { region: 'alabama', bbox: [-88.49, 29.95, -84.88, 35.01] },
    { region: 'alaska', bbox: [-180.00, 49.80, -129.79, 72.99] },
    { region: 'alaskaaleutians', bbox: [171.76, 51.11, 180.00, 54.20] },
    { region: 'arizona', bbox: [-114.83, 31.32, -109.04, 37.01] },
    { region: 'arkansas', bbox: [-94.63, 33.00, -89.63, 36.52] },
    { region: 'california', bbox: [-125.90, 32.48, -114.12, 42.02] },
    { region: 'colorado', bbox: [-109.07, 36.98, -102.03, 41.01] },
    { region: 'connecticut', bbox: [-73.73, 40.96, -71.78, 42.06] },
    { region: 'delaware', bbox: [-75.79, 38.45, -74.98, 39.85] },
    { region: 'districtofcolumbia', bbox: [-77.13, 38.79, -76.90, 39.00] },
    { region: 'florida', bbox: [-88.47, 24.20, -79.43, 31.01] },
    { region: 'georgia', bbox: [-85.61, 30.35, -80.74, 35.01] },
    { region: 'hawaii', bbox: [-179.60, 15.92, -142.65, 29.03] },
    { region: 'idaho', bbox: [-117.25, 41.98, -111.04, 49.01] },
    { region: 'illinois', bbox: [-91.52, 36.96, -87.49, 42.51] },
    { region: 'indiana', bbox: [-88.11, 37.76, -84.78, 41.77] },
    { region: 'iowa', bbox: [-96.65, 40.37, -90.13, 43.51] },
    { region: 'kansas', bbox: [-102.06, 36.99, -94.58, 40.01] },
    { region: 'kentucky', bbox: [-89.59, 36.49, -81.95, 39.15] },
    { region: 'louisiana', bbox: [-94.05, 28.14, -88.66, 33.03] },
    { region: 'maine', bbox: [-71.09, 42.85, -66.87, 47.47] },
    { region: 'maryland', bbox: [-79.49, 37.88, -74.95, 39.73] },
    { region: 'massachusetts', bbox: [-73.52, 40.88, -68.73, 42.89] },
    { region: 'michigan', bbox: [-90.42, 41.69, -82.06, 48.36] },
    { region: 'minnesota', bbox: [-97.25, 43.49, -89.48, 49.41] },
    { region: 'mississippi', bbox: [-91.66, 30.04, -88.09, 35.01] },
    { region: 'missouri', bbox: [-95.78, 35.99, -89.08, 40.62] },
    { region: 'montana', bbox: [-116.06, 44.35, -104.03, 49.01] },
    { region: 'nebraska', bbox: [-104.06, 40.00, -95.30, 43.01] },
    { region: 'nevada', bbox: [-120.01, 35.00, -114.03, 42.01] },
    { region: 'newhampshire', bbox: [-72.56, 42.69, -70.48, 45.32] },
    { region: 'newjersey', bbox: [-75.58, 38.75, -73.67, 41.36] },
    { region: 'newmexico', bbox: [-109.06, 31.33, -102.99, 37.01] },
    { region: 'newyork', bbox: [-79.77, 40.43, -71.66, 45.02] },
    { region: 'northcarolina', bbox: [-84.33, 33.12, -73.73, 36.59] },
    { region: 'northdakota', bbox: [-104.06, 45.93, -96.55, 49.02] },
    { region: 'ohio', bbox: [-84.83, 38.40, -80.50, 42.34] },
    { region: 'oklahoma', bbox: [-103.01, 33.61, -94.42, 37.01] },
    { region: 'oregon', bbox: [-126.39, 41.96, -116.45, 46.31] },
    { region: 'pennsylvania', bbox: [-80.53, 39.66, -74.68, 42.52] },
    // `puertoricousa`, NOT `puertorico`: that slug is the Canarian city row above (Puerto Rico de Gran Canaria).
    { region: 'puertoricousa', bbox: [-68.32, 17.51, -65.09, 18.82] },
    { region: 'rhodeisland', bbox: [-71.92, 40.99, -71.06, 42.02] },
    { region: 'southcarolina', bbox: [-83.36, 32.02, -78.51, 35.22] },
    { region: 'southdakota', bbox: [-104.06, 42.47, -96.43, 45.95] },
    { region: 'tennessee', bbox: [-90.32, 34.98, -81.64, 36.69] },
    { region: 'texas', bbox: [-106.65, 25.69, -93.01, 36.53] },
    { region: 'usvirginislands', bbox: [-65.18, 17.28, -63.95, 18.49] },
    { region: 'utah', bbox: [-114.06, 36.99, -109.03, 42.01] },
    { region: 'vermont', bbox: [-73.44, 42.72, -71.46, 45.03] },
    { region: 'virginia', bbox: [-83.68, 36.53, -74.29, 39.47] },
    { region: 'washington', bbox: [-126.75, 45.53, -116.91, 49.01] },
    { region: 'westvirginia', bbox: [-82.65, 37.19, -77.71, 40.65] },
    { region: 'wisconsin', bbox: [-92.90, 42.48, -86.20, 47.42] },
    { region: 'wyoming', bbox: [-111.06, 40.98, -103.94, 45.02] },
    // Canada + Mexico — §NA-TERRAIN-ROWS (2026-09-06, lane MEXICO-CANADA). Slug + bbox mirror
    // terrain.mjs NATIONAL_REGIONS 1:1 (asserted by `terrain.mjs --check-client-coverage` AND by
    // tools/context-bake/__tests__/northAmericaContext.spec.ts, which reads BOTH files). Canada is
    // split by province because Geofabrik serves it split and because cadastre + planning are
    // provincial competencies — the Australia pattern; Mexico is one national row because the same
    // Geofabrik index lists NO Mexican sub-regions. The drape is Mapterhorn, PROBED at z10 over every
    // probe point including Resolute at 74.70 N (HTTP 200 image/webp, 199,770 B) — no Arctic hole.
    // ⚠ These rectangles overlap the 49th parallel by construction (ontario also spans Detroit and
    // Chicago; the prairie rows reach 48.90 N).
    // ⛔ CORRECTED 2026-09-06 (lane USA-ALL-STATES). This note used to read "`regionForLonLat` resolves
    // by `mostInterior`, so a Chicago site still lands on the tighter `chicago` row above". That is the
    // rule BACKWARDS: `mostInterior` takes the LARGEST edge margin, i.e. the box the point sits DEEPEST
    // inside — a tighter box loses. Measured on the pre-USA-states table: at Chicago (-87.6298,
    // 41.8781) the `chicago` metro box gave margin 0.081 deg and `ontario` 0.278, so Chicago ALREADY
    // resolved to `ontario`; Houston and Austin already resolved to `mexico` the same way. The `chicago`
    // row named above no longer exists (§BAKE-US-STATES), and adding `illinois`/`texas` does not fix it
    // — `illinois` scores 0.104 at Chicago and `texas` 2.05 at Houston, still under ontario/mexico.
    // Recorded as a measured limitation in __tests__/terrainRegionResolve.spec.ts, NOT tuned away: the
    // cure is a polygon country test, as the Antwerp note below already says.
    { region: 'ontario', bbox: [-95.20, 41.60, -74.30, 56.90] },
    { region: 'quebec', bbox: [-79.90, 44.90, -56.90, 62.70] },
    { region: 'britishcolumbia', bbox: [-139.10, 48.20, -114.00, 60.10] },
    { region: 'alberta', bbox: [-120.10, 48.90, -109.90, 60.10] },
    { region: 'saskatchewan', bbox: [-110.10, 48.90, -101.30, 60.10] },
    { region: 'manitoba', bbox: [-102.10, 48.90, -88.90, 60.10] },
    { region: 'newbrunswick', bbox: [-69.10, 44.50, -63.70, 48.10] },
    { region: 'novascotia', bbox: [-66.40, 43.30, -59.60, 47.10] },
    { region: 'princeedwardisland', bbox: [-64.50, 45.90, -61.90, 47.10] },
    { region: 'newfoundland', bbox: [-67.90, 46.50, -52.50, 60.50] },
    { region: 'yukon', bbox: [-141.10, 59.90, -123.70, 69.70] },
    { region: 'northwestterritories', bbox: [-136.60, 59.90, -101.90, 78.90] },
    { region: 'nunavut', bbox: [-120.80, 51.60, -61.00, 83.20] },
    { region: 'mexico', bbox: [-118.50, 14.50, -86.70, 32.75] },
    // Australia — states/territories
    { region: 'newsouthwales', bbox: [141.00, -37.60, 153.70, -28.10] },
    { region: 'victoria', bbox: [140.90, -39.20, 150.05, -33.90] },
    { region: 'queensland', bbox: [138.00, -29.20, 153.60, -9.00] },
    { region: 'westernaustralia', bbox: [112.90, -35.20, 129.00, -13.50] },
    { region: 'southaustralia', bbox: [129.00, -38.10, 141.05, -25.90] },
    { region: 'tasmania', bbox: [143.80, -43.75, 148.55, -39.40] },
    { region: 'act', bbox: [148.70, -35.95, 149.40, -35.10] },
    { region: 'northernterritory', bbox: [128.90, -26.10, 138.10, -10.90] },
    // Oceania — New Zealand, whole country (§BAKE-NEWZEALAND 2026-09-05). LINZ's national LiDAR DEM is
    // API-key gated, so the drape is Mapterhorn (z10 10/1009/624 under Auckland → HTTP 200, PROBED);
    // bbox == terrain.mjs NATIONAL_REGIONS == bake.mjs, west of the antimeridian. VISUAL only (L-584 unwired).
    { region: 'newzealand', bbox: [166.0, -47.5, 178.7, -34.3] },
    // Middle East — whole countries (§ME-NATIONAL, lane ME-NATIONAL 2026-09-06). This block WAS five metro
    // rows (riyadh/jeddah/dubai/abudhabi/doha); they are gone because `mostInterior` scores by ABSOLUTE
    // edge distance, so a national box beats a metro box at every interior point and the metro row became
    // unreachable the moment the national one existed (terrain.mjs §ME-NATIONAL carries the measurement).
    // Mapterhorn drape only — no Gulf/Levant/TR national DTM is keyless (SA GEOSA, AE emirate hosts and the
    // IL MAPI bulk are all gated); the L-584 legal sampling source is unchanged and still unwired here.
    { region: 'gccstates', bbox: [34.43, 15.24, 60.95, 32.20] },
    { region: 'turkey', bbox: [25.52, 35.71, 44.86, 43.08] },
    { region: 'israel', bbox: [33.99, 29.43, 35.92, 33.46] },
    { region: 'jordan', bbox: [34.86, 29.18, 39.32, 33.38] },
    { region: 'lebanon', bbox: [34.76, 33.05, 36.64, 34.81] },
    // Asia — Japan, whole country (§BAKE-JAPAN, lane JAPAN-FULL 2026-09-06). GSI publishes a KEYLESS
    // national DEM (cyberjapandata dem_png 10 m / dem5a_png 5 m LiDAR, both HTTP 200 over Tokyo,
    // PROBED 2026-09-06) but no DTM_FETCH adapter is wired for it yet, so the drape is Mapterhorn
    // (z10 10/909/403 under Tokyo → HTTP 200 image/webp 264,074 B, PROBED). bbox == terrain.mjs
    // NATIONAL_REGIONS == bake.mjs, west of the antimeridian. VISUAL only (L-584 unwired for JP).
    // ⚠ THE CLIENT HAS NO `group` CONCEPT — the bake's new `asia` group needs NO client change; what
    // the client needs is this ROW, and `terrain.mjs --check-client-coverage` fails without it.
    { region: 'japan', bbox: [122.9, 24.0, 153.99, 45.6] },
    // Asia — SOUTH KOREA, whole country (§BAKE-SOUTHKOREA, lane KOREA-FROM-NOTHING 2026-09-06).
    // bbox == terrain.mjs NATIONAL_REGIONS == bake.mjs `southkorea`, 1:1. Drape is Mapterhorn (eight
    // z10 land-check points across the rectangle, all HTTP 200 image/webp, PROBED — see terrain.mjs).
    // VISUAL only: L-584 legal terrain sampling stays UNWIRED for KR, and no national DTM adapter
    // exists because V-World's whole origin answered HTTP 502 / curl 52 to seven probes on
    // 2026-09-06 and `nsdi.go.kr` no longer resolves.
    //
    // ⛔⛔ §KR-NESTED-IN-JAPAN (2026-09-06) — THIS ROW IS SHADOWED BY `japan` AND THE NUMBERS SAY SO.
    //   `japan`'s rectangle [122.9, 24.0, 153.99, 45.6] CONTAINS [124.5, 32.9, 131.95, 38.65]
    //   entirely, and `mostInterior` (§MOST-INTERIOR-BBOX-WINS, L-12944) awards the point to the box
    //   it sits DEEPEST inside — which, for two NESTED boxes, is always the OUTER one. Computed with
    //   `interiorMarginDeg` itself, cos(lat)-weighted, 2026-09-06:
    //     Seoul (126.978, 37.5665)  japan 3.232  southkorea 1.084   → japan
    //     Busan (129.076, 35.1796)  japan 5.048  southkorea 2.280   → japan
    //     Jeju  (126.531, 33.4996)  japan 3.028  southkorea 0.600   → japan
    //   No HONEST Korean rectangle can win: to beat 3.233 at Seoul it would have to extend 3.24°
    //   past Seoul in every direction — west to 122.9, east to 131.1, south to 34.3 (north of Jeju,
    //   Mokpo and Busan), north to 40.8 (deep inside North Korea). Redrawing Korea is not the fix.
    //
    //   ⭐ WHY THE ROW IS STILL REACHABLE TODAY, AND THIS IS A MEASUREMENT NOT A HOPE:
    //   §PENDING-REGION-FALLS-THROUGH. `regionsForLonLat` returns EVERY containing region ordered by
    //   margin, and the viewport attaches the first whose `layer.json` LOADS. `japan` is
    //   `pending: true` in bake.mjs and has never been baked or published, so its layer.json 404s and
    //   Seoul falls through to `southkorea`. That is precisely the case that mechanism was written
    //   for ("this is what makes it safe to land a new country row before its first bake").
    //
    //   ⛔ THE DAY `japan` IS PUBLISHED, KOREA'S TILESET STOPS BEING SELECTED — silently, because the
    //   Japanese tileset covers Korean ground from the SAME Mapterhorn source at the SAME z0..10, so
    //   the drape still looks right and nothing errors. What breaks is (a) the Korean bake becomes
    //   dead weight, (b) the console reports `japan` over Seoul, and (c) any future KOREAN national
    //   DTM upgrade is unreachable behind the Japanese row. THE FIX IS TO SHRINK `japan`, NOT to grow
    //   Korea: bake.mjs already documents the split ("BY ISLAND on the SAME extract — hokkaido /
    //   honshu / shikoku-kyushu / okinawa"), and splitting the Ryukyus off (an `okinawa` row roughly
    //   [122.9, 24.0, 131.4, 29.0] plus a main-archipelago `japan` starting east of the Korea Strait)
    //   removes the containment. ⚠ Tsushima (129.17 E, Japanese) sits 0.09° EAST of Busan
    //   (129.08 E, Korean), so the two countries interleave in longitude and the split must be
    //   VERIFIED against both, not assumed. Tracked as L-12996.
    { region: 'southkorea', bbox: [124.5, 32.9, 131.95, 38.65] },
];

/** True when `lon,lat` falls inside `bbox` (inclusive). */
function inBbox(lon: number, lat: number, bbox: TerrainBbox): boolean {
    const [w, s, e, n] = bbox;
    return lon >= Math.min(w, e) && lon <= Math.max(w, e)
        && lat >= Math.min(s, n) && lat <= Math.max(s, n);
}

/**
 * Resolve a site's `lon,lat` to a baked-terrain city slug, or `null` when the point is outside
 * every listed city (→ the viewport keeps flat ground). PURE + testable.
 */
/**
 * §MOST-INTERIOR-BBOX-WINS (L-12944, 2026-09-06) — HOW A POINT INSIDE TWO BOXES IS RESOLVED.
 *
 * THE DEFECT THIS RETIRES. Both resolvers returned the FIRST bbox containing the point. These are
 * coarse national rectangles that necessarily overlap — measured 2026-09-06, 69 of the 48 region
 * rows overlap at least one sibling (spain x france, netherlands x germany, denmark x sweden,
 * poland x czechia, ...). Spain's box runs east to lon 4.6 and north to lat 43.9, which swallows
 * Languedoc, and `spain` is listed before `france`. So Sete (3.696, 43.402) and Montpellier
 * (3.876, 43.611) were served the SPANISH terrain tileset: the founder's console reads
 * "attached baked terrain for 'spain'" at both, ground 56.8 m at Sete (real ~3 m) and 96.9 m at
 * Montpellier (real ~40 m). A ~50 m false plateau puts the sea surface UNDER the land — the
 * founder's "the sea goes beneath buildings land" — and every seat, envelope and shadow inherits it.
 *
 * THE RULE. Among ALL boxes containing the point, take the one where the point sits FURTHEST FROM
 * THE BOX EDGE (longitude weighted by cos(lat), so the margin is a real distance, not a degree
 * count). A point deep inside France and 0.5 deg from Spain's arbitrary eastern edge resolves to
 * france; a point deep inside Spain and just over France's southern edge resolves to spain. Ties
 * keep the table order, so a single-match point is byte-identical to the old behaviour.
 *
 * Verified against the real border cases in the spec: Sete + Montpellier + Toulouse + Perpignan to
 * france, Barcelona + Girona to spain.
 */
function interiorMarginDeg(lon: number, lat: number, bbox: TerrainBbox): number {
    const [w, s, e, n] = bbox;
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6;
    return Math.min((lon - w) * cosLat, (e - lon) * cosLat, lat - s, n - lat);
}

/** The most-interior match, or null. Shared by the city and region resolvers. */
function mostInterior<T>(lon: number, lat: number, rows: ReadonlyArray<T>, bboxOf: (row: T) => TerrainBbox): T | null {
    let best: T | null = null;
    let bestMargin = -Infinity;
    for (const row of rows) {
        const bbox = bboxOf(row);
        if (!inBbox(lon, lat, bbox)) continue;
        const margin = interiorMarginDeg(lon, lat, bbox);
        if (margin > bestMargin) { bestMargin = margin; best = row; }
    }
    return best;
}

export function cityForLonLat(lon: number, lat: number): string | null {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    // §MOST-INTERIOR-BBOX-WINS (L-12944) — city boxes overlap too (a metro row beside its state row).
    return mostInterior(lon, lat, TERRAIN_CITY_BBOXES, (r) => r.bbox)?.city ?? null;
}

/**
 * Resolve a site's `lon,lat` to a whole-REGION tileset slug (`TERRAIN_REGION_BBOXES`), or `null`
 * outside every region. PURE + testable. Does not consider cities — see `terrainSlugForLonLat`.
 */
export function regionForLonLat(lon: number, lat: number): string | null {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    // §MOST-INTERIOR-BBOX-WINS (L-12944) — NOT the first match: Spain's box swallows Languedoc, and
    // taking the first row served Sete and Montpellier a Spanish tileset (~50 m of false ground).
    return mostInterior(lon, lat, TERRAIN_REGION_BBOXES, (r) => r.bbox)?.region ?? null;
}

/**
 * §TERRAIN-EVERYWHERE — every tileset slug that could serve `lon,lat`, MOST DETAILED FIRST: the city
 * tileset (national-DTM bake, 0.5 m) when the point is inside a city bbox, then the region tileset
 * (Mapterhorn z0..10). Empty outside both. The viewport attaches the first candidate whose `layer.json`
 * loads; a city that is listed but not yet published (an apikey city without its CI secret) therefore
 * falls through to its region instead of leaving the site flat.
 */
/**
 * §PENDING-REGION-FALLS-THROUGH (2026-09-06, lane EU-EVERY-COUNTRY) — the region half is now EVERY
 * containing region, most-interior FIRST, not just the winner.
 *
 * WHY. §MOST-INTERIOR-BBOX-WINS picks one region out of the overlapping set; the viewport attaches
 * the first candidate whose `layer.json` loads. With a single region candidate, a region that is
 * LISTED but NOT YET PUBLISHED takes the site with it: the tileset 404s and the ground falls back to
 * bare ellipsoid even though a published neighbour covers the same ground. That is not theoretical —
 * §EU-EVERY-COUNTRY adds `ukraine`, whose one rectangle necessarily swallows eastern Romania (Ukraine
 * wraps around Moldova), and it wins Iaşi on margin 3.158 vs romania 1.142. Until `ukraine` is baked,
 * Iaşi would have gone FLAT, having had real relief the day before.
 *
 * The file already states this philosophy for the city half — "a city that is listed but not yet
 * published therefore falls through to its region instead of leaving the site flat". This applies the
 * same rule to regions, which is what makes it safe to land a new country row before its first bake.
 * Ordering is unchanged for a point inside exactly one region, so nothing that resolves today moves.
 */
function regionsForLonLat(lon: number, lat: number): readonly string[] {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
    return TERRAIN_REGION_BBOXES
        .filter((r) => inBbox(lon, lat, r.bbox))
        .map((r) => ({ region: r.region, margin: interiorMarginDeg(lon, lat, r.bbox) }))
        .sort((a, b) => b.margin - a.margin)
        .map((r) => r.region);
}

export function terrainSlugCandidates(lon: number, lat: number): readonly string[] {
    const out: string[] = [];
    const city = cityForLonLat(lon, lat);
    if (city) out.push(city);
    for (const region of regionsForLonLat(lon, lat)) if (!out.includes(region)) out.push(region);
    return out;
}

/** The single best tileset slug for `lon,lat` (city first, then region), or `null` outside both. */
export function terrainSlugForLonLat(lon: number, lat: number): string | null {
    return terrainSlugCandidates(lon, lat)[0] ?? null;
}

/**
 * §TERRAIN-TOGGLE (founder 2026-07-27) — the PURE decision "should the baked quantized-mesh
 * terrain provider attach for this site right now?", factored out of `CesiumViewport.
 * maybeAttachTerrainProvider` so the gate is unit-testable with no Cesium/DOM dependency.
 *
 * Ordered gates (first hit wins):
 *   • toggle-off      — the user turned the 3D-Site terrain OFF (the founder escape hatch).
 *   • world-framing   — §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991). The ONE Cesium camera is framed
 *                       on the WHOLE EARTH (the `3D Globe` variant of `site-3d`), and a CITY-BOUNDED
 *                       quantized-mesh tileset declares availability only inside its own layer.json
 *                       bbox — so at world range it yields one or two level-0 roots and nothing
 *                       else. That is the founder's beige triangular shard. The surface table
 *                       (`cesiumSurfaceFraming.ts`) decides this; the gate only obeys it.
 *   • photoreal       — the paid Google-3D-tiles path (non-Forma) already carries its own
 *                       ground; draping our mesh under it double-grounds / z-fights.
 *   • no-baked-city   — the site is outside every baked-terrain bbox (city AND region) → keep flat.
 *   • attach          — a tileset applies (`city` = the slug, city first then region — §TERRAIN-EVERYWHERE;
 *                       `candidates` lists every applicable slug most-detailed-first so the caller can
 *                       fall through to the region when a listed city's layer.json 404s); caller still
 *                       guards on the tileset actually loading.
 */
export interface TerrainAttachInputs {
    /** The user TERRAIN ON/OFF toggle (default ON). When false → never attach → flat ground. */
    readonly terrainEnabled: boolean;
    /** True when the paid Google photoreal 3D tileset is the live ground. */
    readonly photorealActive: boolean;
    /** True on the free Forma flat/massing study path (where our terrain IS drawn). */
    readonly formaMode: boolean;
    /**
     * §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) — may a CITY-BOUNDED tileset be on the shared
     * viewer right now? This is `CesiumSurfaceWrites.boundedTerrainPermitted`, i.e. FALSE exactly
     * while the ONE camera is framed on the whole Earth. Passed in rather than re-derived so the
     * surface table stays the single authority and the two cannot disagree (C84 EI-1).
     */
    readonly boundedTerrainPermitted: boolean;
    readonly lon: number;
    readonly lat: number;
}

export type TerrainAttachDecision =
    | { readonly attach: false; readonly reason: 'toggle-off' | 'world-framing' | 'photoreal' | 'no-baked-city' }
    | { readonly attach: true; readonly city: string; readonly scope: 'city' | 'region'; readonly candidates: readonly string[] };

export function decideBakedTerrainAttach(inp: TerrainAttachInputs): TerrainAttachDecision {
    if (!inp.terrainEnabled) return { attach: false, reason: 'toggle-off' };
    // §GLOBE-INHERITS-THE-CITY-TERRAIN (L-12991) — ⛔ BEFORE the photoreal gate on purpose. At world
    // framing the answer is the same whether or not the paid tileset ever loaded, and ordering it
    // second would make the refusal REASON depend on a fact that is irrelevant to it.
    if (!inp.boundedTerrainPermitted) return { attach: false, reason: 'world-framing' };
    // Skip our terrain ONLY on the true photoreal (non-Forma) path; in Forma the photoreal
    // tileset is hidden and the globe is shown, so draping baked terrain is correct.
    if (inp.photorealActive && !inp.formaMode) return { attach: false, reason: 'photoreal' };
    const candidates = terrainSlugCandidates(inp.lon, inp.lat);
    const slug = candidates[0];
    if (!slug) return { attach: false, reason: 'no-baked-city' };
    return { attach: true, city: slug, scope: cityForLonLat(inp.lon, inp.lat) === slug ? 'city' : 'region', candidates };
}

/**
 * The quantized-mesh tileset URL for a city, mirroring the PMTiles layout: the terrain lives at
 * `<tiles base>/terrain/<city>/{layer.json,{z}/{x}/{y}.terrain}`. `CesiumTerrainProvider.fromUrl`
 * appends `/layer.json`, so this returns the tileset DIRECTORY with no trailing slash. Returns
 * `null` when no tiles base is configured (local/dev Overpass path).
 */
/**
 * §TERRAIN-CACHE-BUST (L-639) — a version stamp on the tileset URL. Terrain tiles are path-stable and
 * cached (R2 1-day + the same-origin proxy 1-hour must-revalidate), so a re-bake keeps the SAME URL and
 * the browser keeps serving the OLD tile — which is why the interior-city fixes (occlusion, sea-level)
 * read byte-identical across deploys: they were never fetched. Cesium's Resource propagates a query
 * string to every derived request (layer.json AND {z}/{x}/{y}.terrain), so `?v=…` busts the browser
 * cache for the whole tileset. BUMP this whenever the terrain BAKE changes so clients pull fresh tiles.
 */
export const TERRAIN_TILESET_VERSION = 'L639k';
export function terrainTilesetUrl(city: string): string | null {
    const base = contextTilesBaseUrl();
    if (!base) return null;
    return `${base}terrain/${city}?v=${TERRAIN_TILESET_VERSION}`;
}
