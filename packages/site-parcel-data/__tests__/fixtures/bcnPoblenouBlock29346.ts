// §AMPLADA-ART-238 (L-591) — REAL Barcelona cadastral geometry, for the one test in this repo that
// can tell the ordinance's MINIMUM *amplada puntual* apart from the median we used to return.
//
// PROVENANCE. Catastro INSPIRE `CadastralParcel` WFS (`ovc.catastro.meh.es/INSPIRE/wfsCP.aspx`),
// BBOX `GetFeature` around 41.3985 N, 2.1985 E — the production block route's own query, at its own
// `BLOCK_BBOX_HALF_DEG = 0.002`. Fetched 2026-07-31. **Manzana 29346, Poblenou (clau 13a.)**
// `BLOCK_RING` is the output of the production `dissolveParcelsToBlockRing` over that manzana's six
// parcels (path: `exact`, no T-junction repair). Coordinates are metres in the scene-XZ frame,
// re-centred on the midpoint of block-ring edge 14, rounded to the millimetre — Catastro's own
// coordinate quantum is 0.111 m, so the rounding is two orders of magnitude below the source's
// resolution and cannot move a measurement.
//
// ⚠⚠ **`OPPOSING_RINGS` IS TRIMMED, AND THE TRIM IS NOT NEUTRAL — READ BEFORE ADDING AN ASSERTION.**
// The live bbox returns 268 foreign parcels. Committing all of them would be a 19 KB fixture nobody
// reads, so this keeps only the 9 rings within 45 m of edge 14's midpoint. That reproduces **edge
// 14's measurement bit-for-bit** (verified at extraction: width and spread identical to the full
// 268-ring measurement) and *nothing else*: the other frontages of this block — edges 7, 16 and 18 —
// have no opposing geometry left in the fixture and are rejected as `no-opposing-frontage`.
//
// ⇒ **Assert on `GOVERNING_EDGE_INDEX` explicitly. Never on "the narrowest edge of this block".**
// In the live data edge 14 (19.35 m) *is* the narrowest of the six this parcel fronts (19.68 /
// 48.27 / 20.18 m), so `governingStreetWidth` picks it either way — but in the fixture it would be
// picked because the rivals are absent, and a test that leaned on that would be asserting the trim
// rather than the geometry.

/** Manzana 29346's dissolved block outline, 22 vertices. Metres, scene-XZ. */
export const BLOCK_RING: ReadonlyArray<readonly [number, number]> = [
    [-64.674, 94.51], [-68.264, 94.51], [-94.401, 68.128], [-108.179, 54.213],
    [-129.556, 32.728], [-129.723, 11.911], [-114.275, -3.674], [-99.495, -18.702],
    [-83.045, -35.4], [-68.849, -49.76], [-66.678, -49.76], [-48.641, -49.426],
    [-48.14, -48.981], [-34.612, -35.177], [-13.569, -13.804], [13.569, 13.804],
    [13.569, 15.362], [13.319, 33.841], [12.985, 34.064], [-16.91, 63.563],
    [-47.054, 93.174], [-48.307, 94.399],
] as const;

/** The subject parcel (index 5 of the manzana). It fronts block edges 7, 14, 15, 16, 17, 18. */
export const PARCEL_RING: ReadonlyArray<readonly [number, number]> = [
    [-58.829, -10.798], [-37.702, 10.687], [-13.569, -13.804], [13.569, 13.804],
    [13.569, 15.362], [13.319, 33.841], [12.985, 34.064], [-16.91, 63.563],
    [-25.677, 54.769], [-75.028, 5.566], [-78.953, 1.67], [-83.295, -2.672],
    [-99.495, -18.702], [-83.045, -35.4], [-79.454, -31.726], [-72.356, -24.49],
    [-67.012, -19.147], [-58.829, -10.798],
] as const;

/** The 9 foreign parcels across the street from edge 14 — the opposing *alineació*. */
export const OPPOSING_RINGS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [[25.26,-34.954],[28.016,-37.737],[34.445,-31.169],[31.189,-27.941],[26.763,-23.488],[26.011,-22.709],[25.51,-22.153],[15.323,-12.134],[13.152,-14.36],[11.732,-15.807],[8.977,-18.702],[19.665,-29.277],[20.417,-30.056],[20.751,-30.502],[25.26,-34.954]],
    [[34.445,-31.169],[37.452,-28.053],[40.541,-24.936],[32.775,-17.255],[31.523,-16.03],[21.335,-5.9],[18.747,-8.572],[17.411,-10.019],[15.323,-12.134],[25.51,-22.153],[26.011,-22.709],[26.763,-23.488],[31.189,-27.941],[34.445,-31.169]],
    [[24.341,-41.522],[28.016,-37.737],[25.26,-34.954],[20.751,-30.502],[20.417,-30.056],[19.665,-29.277],[8.977,-18.702],[6.305,-21.485],[5.219,-22.598],[7.891,-25.27],[10.48,-27.83],[15.907,-33.173],[17.077,-34.286],[17.745,-34.954],[21.669,-38.851],[22.003,-39.184],[24.341,-41.522]],
    [[32.775,-17.255],[40.541,-24.936],[57.242,-7.57],[50.562,-1.113],[48.307,1.113],[38.454,1.113],[28.099,1.002],[21.335,-5.9],[31.523,-16.03],[32.775,-17.255]],
    [[17.995,-43.415],[20.333,-45.641],[24.341,-41.522],[22.003,-39.184],[21.669,-38.851],[17.745,-34.954],[17.077,-34.286],[15.907,-33.173],[10.48,-27.83],[7.891,-25.27],[5.219,-22.598],[3.382,-24.379],[1.127,-26.717],[6.138,-31.726],[11.315,-36.735],[11.983,-37.403],[13.653,-39.073],[16.659,-42.079],[17.995,-43.415]],
    [[16.325,-49.76],[16.492,-49.648],[20.333,-45.641],[17.995,-43.415],[16.659,-42.079],[13.653,-39.073],[11.983,-37.403],[11.315,-36.735],[6.138,-31.726],[1.127,-26.717],[-2.964,-30.947],[-0.125,-33.618],[2.296,-35.956],[7.223,-40.966],[7.641,-41.3],[7.975,-41.633],[9.144,-42.747],[12.651,-46.198],[16.325,-49.76]],
    [[16.325,-49.76],[12.651,-46.198],[9.144,-42.747],[7.975,-41.633],[7.641,-41.3],[7.223,-40.966],[2.296,-35.956],[-0.125,-33.618],[-2.964,-30.947],[-7.056,-35.177],[-4.3,-37.849],[-1.712,-40.409],[3.382,-45.307],[3.549,-45.53],[4.801,-46.754],[5.052,-46.977],[12.233,-53.99],[16.325,-49.76]],
    [[8.81,-57.552],[12.233,-53.99],[5.052,-46.977],[4.801,-46.754],[3.549,-45.53],[3.382,-45.307],[-1.712,-40.409],[-4.3,-37.849],[-7.056,-35.177],[-9.812,-37.96],[-8.392,-39.407],[-7.14,-40.632],[-7.808,-41.077],[-7.39,-41.522],[-3.215,-45.641],[-1.378,-47.422],[0.042,-48.869],[1.461,-50.316],[8.81,-57.552]],
    [[-2.129,-64.899],[-0.209,-66.792],[3.465,-62.896],[3.966,-62.45],[8.058,-58.22],[8.81,-57.552],[1.461,-50.316],[0.042,-48.869],[-1.378,-47.422],[-3.215,-45.641],[-7.39,-41.522],[-7.808,-41.077],[-7.14,-40.632],[-8.392,-39.407],[-9.812,-37.96],[-15.072,-43.415],[-19.248,-47.756],[-8.977,-57.997],[-8.225,-58.777],[-7.891,-59.111],[-5.887,-61.114],[-5.386,-61.56],[-4.3,-62.784],[-2.129,-64.899]],
] as const;

/** The frontage under test. See the header: assert on THIS index, never on "the narrowest". */
export const GOVERNING_EDGE_INDEX = 14;

/**
 * What edge 14's five rays yield under each statistic, metres — recorded so the two can be reasoned
 * about (and the test's expectations read) without re-running the ray caster.
 *
 *   minimum (PGM Art. 238.1.b/c) = 19.3475 m       median (pre-L-591) = 19.4419 m
 *   spread (max − min)           =  0.2053 m       difference         =  0.0944 m
 *
 * ⚠ **9,4 cm — AND IT IS WORTH A WHOLE STOREY.** Not through the Art. 327.2 table directly (both
 * values sit inside its 15–20 m band) but through the *snap tier*: `BCN_STREET_WIDTH_QUANTISATION`
 * admits a 0.60 m tolerance around the 20 m Cerdà quantum. 19.4419 is 0.5581 m away and **snaps**;
 * 19.3475 is 0.6525 m away and does not. So the median's answer became `snapped-to-declared-
 * quantum` carrying `trustedOfficialWidth: true`, which **skips the band-edge guard entirely**, and
 * published 20,75 m / PB+5. The minimum stays `measured-cadastral`, keeps the guard armed, and
 * publishes the 17,70 m / PB+4 that the ordinance's own quantity selects.
 *
 * ⇒ The 0.60 m snap tolerance is 6× this gap. That is why "the median is within a few centimetres
 * of the minimum" was never a safety argument: downstream of a quantiser, centimetres are storeys.
 */
export const EDGE_14_MINIMUM_M = 19.3475;
/** The pre-L-591 value. Present so a regression can assert the code does NOT return it. */
export const EDGE_14_MEDIAN_M = 19.4419;
export const EDGE_14_SPREAD_M = 0.2053;
