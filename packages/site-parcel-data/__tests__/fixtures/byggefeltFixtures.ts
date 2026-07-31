// RECORDED FIXTURES - real `theme_pdk_byggefelt_vedtaget` features from geoserver.plandata.dk.
//
// These are REAL RESPONSES, NOT HAND-WRITTEN SHAPES. Each was fetched live on 2026-07-31 with
// `outputFormat=application/json&srsName=EPSG:25832`, and the geometry plus every
// classification-relevant property is VERBATIM. Only irrelevant attribute columns (the ~60
// `anvspec*` / `eareal*` / `maxvind*` slots) were dropped, so a test asserting against these is
// asserting against what Plandata actually serves - including its exact boolean encoding, its
// `doklink` form and its MultiPolygon nesting depth.
//
// If Plandata changes its encoding (e.g. starts emitting `'true'` STRINGS on this output format),
// these fixtures go stale and the tests would keep passing while production broke. RE-RECORD them
// when touching the classifier; the exact queries are in the findings doc's Reproducing section.
//
// Source: docs/04-reference/jurisdictions/dk/findings/DK-BYGGEFELT-PRODUCER.md

import type { DkByggefeltFeature } from '../../src/evidence/byggefeltEvidence.js';

/**
 * BINDING - `bygkunifelt=true, bygvejledende=false`. Silkeborg LP 12-002.
 * The record class that opens tier 1: 13,629 of 57,035 (23.9%) nationally.
 */
export const BINDING_FEATURE: DkByggefeltFeature = {
        "id": "theme_pdk_byggefelt_vedtaget.1485483",
        "properties": {
            "id": 1485483,
            "planid": 9528955,
            "lokplan_id": 1023378,
            "komnr": 740,
            "kommunenavn": "Silkeborg",
            "lp_plannr": "12-002",
            "lp_plannavn": "BoligomrÃ¥de ved Vestre Ringvej-Hvinningdalvej",
            "doklink": "https://dokument.plandata.dk/20_1023378_APPROVED_1220596881068.pdf",
            "datovedt": 20070924,
            "bygkunifelt": true,
            "bygvejledende": false,
            "maxetager": 4,
            "maxbygnhjd": 14
        },
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [
                            531454.6232619812,
                            6224463.2976678265
                        ],
                        [
                            531455.8493903,
                            6224464.16782341
                        ],
                        [
                            531455.84939069,
                            6224464.16782447
                        ],
                        [
                            531440.22006988,
                            6224485.19133578
                        ],
                        [
                            531446.673274347,
                            6224490.885444682
                        ],
                        [
                            531460.41,
                            6224490.65
                        ],
                        [
                            531483.7349592752,
                            6224494.306553022
                        ],
                        [
                            531493.90839908,
                            6224480.09682288
                        ],
                        [
                            531459.30720423,
                            6224454.32458048
                        ],
                        [
                            531458.1084964902,
                            6224455.47718407
                        ],
                        [
                            531459.0766839702,
                            6224456.69894445
                        ],
                        [
                            531459.07668399,
                            6224456.69894566
                        ],
                        [
                            531455.1451763693,
                            6224462.148560183
                        ],
                        [
                            531454.6232619812,
                            6224463.2976678265
                        ]
                    ]
                ]
            ]
        }
    };

/**
 * ADVISORY - `bygvejledende=true`. Silkeborg LP 12-002 - the SAME lokalplan as the binding
 * fixture. That is the point: one plan publishes both classes, so bindingness is a per-FEATURE
 * property and can never be inferred from the plan identity.
 */
export const ADVISORY_FEATURE: DkByggefeltFeature = {
        "id": "theme_pdk_byggefelt_vedtaget.1485481",
        "properties": {
            "id": 1485481,
            "planid": 9528956,
            "lokplan_id": 1023378,
            "komnr": 740,
            "kommunenavn": "Silkeborg",
            "lp_plannr": "12-002",
            "lp_plannavn": "BoligomrÃ¥de ved Vestre Ringvej-Hvinningdalvej",
            "doklink": "https://dokument.plandata.dk/20_1023378_APPROVED_1220596881068.pdf",
            "datovedt": 20070924,
            "bygkunifelt": false,
            "bygvejledende": true,
            "maxetager": null,
            "maxbygnhjd": null
        },
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [
                            531592.17948716,
                            6224528.22959882
                        ],
                        [
                            531610.25233054,
                            6224552.11157044
                        ],
                        [
                            531610.80558035,
                            6224553.03365344
                        ],
                        [
                            531625.19008664,
                            6224542.75241978
                        ],
                        [
                            531565.43905464,
                            6224462.85385616
                        ],
                        [
                            531551.33117337,
                            6224473.8266527
                        ],
                        [
                            531592.17948716,
                            6224528.22959882
                        ]
                    ]
                ]
            ]
        }
    };

/**
 * NOT DECLARED - both flags `false`. Hedensted. 6,101 of 57,035 (10.7%); this bucket, not the
 * advisory set, is the correctly-scoped target for a future lokalplan-text parser.
 */
export const NOT_DECLARED_FEATURE: DkByggefeltFeature = {
        "id": "theme_pdk_byggefelt_vedtaget.1486749",
        "properties": {
            "id": 1486749,
            "planid": 12192609,
            "lokplan_id": 12138157,
            "komnr": 766,
            "kommunenavn": "Hedensted",
            "lp_plannr": "1215",
            "lp_plannavn": "SolcelleanlÃ¦g ved Hornsyld og vindmÃ¸ller vest for Bjerre",
            "doklink": "https://dokument.plandata.dk/20_12138157_1783415855013.pdf",
            "datovedt": 20260624,
            "bygkunifelt": false,
            "bygvejledende": false,
            "maxetager": null,
            "maxbygnhjd": 16
        },
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [
                            554206.5776460783,
                            6180066.772914531
                        ],
                        [
                            554194.1795961808,
                            6180140.825355534
                        ],
                        [
                            554134.6594811833,
                            6180130.946410374
                        ],
                        [
                            554147.0575310808,
                            6180056.893969371
                        ],
                        [
                            554206.5776460783,
                            6180066.772914531
                        ]
                    ]
                ]
            ]
        }
    };

/**
 * CONTRADICTORY - both flags `true`. Naestved LP 402. One of exactly 179 national records
 * (0.31%) whose metadata contradicts itself. PRYZM refuses to resolve these.
 */
export const CONTRADICTORY_FEATURE: DkByggefeltFeature = {
        "id": "theme_pdk_byggefelt_vedtaget.1488457",
        "properties": {
            "id": 1488457,
            "planid": 9495805,
            "lokplan_id": 1062340,
            "komnr": 370,
            "kommunenavn": "NÃ¦stved",
            "lp_plannr": "402",
            "lp_plannavn": "402 Krummerup by - bevarende lokalplan",
            "doklink": "https://dokument.plandata.dk/20_1062340_APPROVED_1198139727858.pdf",
            "datovedt": 20000817,
            "bygkunifelt": true,
            "bygvejledende": true,
            "maxetager": null,
            "maxbygnhjd": null
        },
        "geometry": {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [
                            659555.90808427,
                            6130993.61421701
                        ],
                        [
                            659618.15346311,
                            6131028.27027554
                        ],
                        [
                            659650.0317045134,
                            6131023.069225499
                        ],
                        [
                            659565.191524394,
                            6130968.694382794
                        ],
                        [
                            659555.90808427,
                            6130993.61421701
                        ]
                    ]
                ]
            ]
        }
    };

