// §MURCIA-CROSSTAB — the LEGAL classification, kept in one file so it is reviewable line by line.
//
// Every set below carries the PGOU article that puts a code in it. Nothing here is a heuristic about
// what a code "looks like"; each membership is a reading of the Normas Urbanísticas, Texto Refundido
// diciembre 2012, transcribed in `ENVELOPE.md` §3 and re-stated here so the measurement and the
// dossier cannot silently drift apart. A test in `__tests__/classify.test.ts` pins the two together.

// ─────────────────────────────────────────────────────────────────────────────
// 1 — the DENOMINATOR: private buildable calificación families (L-656)
// ─────────────────────────────────────────────────────────────────────────────
//
// L-656 is explicit that the denominator is BUILDABLE land — not all land, not clicks. Murcia's
// calificación layer covers the whole 902.4 km² municipality, most of it forest (`NF`), public open
// space (`EV`, `EW`, `FV`), infrastructure (`EG`, `EF`, `BA`, `CT`) or public facilities (`DE`,
// `EE`). None of those is a buildable private plot and none belongs in a coverage denominator.
//
// The families below are exactly the 34 base codes classified four-state in `ENVELOPE.md` §3.1/§3.2.

/** PACKED — every envelope-determining parameter STATED, transcribed in `esMurciaPgou2012.ts`. */
export const PACKED_FAMILIES = [
    'MC', 'MG', 'RM1', 'RM2', 'RD', 'RD1', 'RF', 'RG', 'RH', 'RL', 'IC', 'IX', 'IG', 'AJ',
];

/**
 * DELEGATED ON THE CALIFICACIÓN — *zona genérica*.
 *
 * Arts. 5.25.3.3 / 5.26.3.3, verbatim and identical: «…el alcance de los códigos de calificación
 * zonal de los suelos edificables dentro del ámbito … se reduce a las condiciones de uso y tipología
 * de las edificaciones, **pero no a los parámetros definitorios de la altura o edificabilidad**. En
 * ocasiones se recurre en los planos a indicaciones de calificación genérica (RX, RJ, RS, UC, IP,
 * TC, GP, AE)…»  Also Arts. 6.2.2.4 / 6.5.1 for the urbanizable-sectorizado equivalents.
 */
export const GENERICA_FAMILIES = ['RX', 'RJ', 'RS', 'UC', 'IP', 'TC', 'GP', 'AE'];

/**
 * DELEGATED ON THE CALIFICACIÓN — *ordenación remitida al planeamiento anterior*.
 *
 * Art. 5.24.5.1 (RR): «sus condiciones de edificación son enteramente concordantes con las definidas
 * en los anteriores instrumentos convalidados.» Art. 5.24.6 for the economic-industrial codes.
 */
export const REMITTED_FAMILIES = ['RR', 'TR', 'IR', 'GR'];

/**
 * REFUSED but PGOU-DIRECT — the general plan DOES order this land; PRYZM cannot pack the ordinance
 * because a parameter is CONSTRUCTED (a street-width table) or UNKNOWN (`ENVELOPE.md` §3.2).
 * These count in the denominator and are NOT delegated.
 */
export const REFUSED_DIRECT_FAMILIES = ['RB', 'RC', 'RM', 'RN', 'RT', 'RU', 'MZ', 'MX'];

/** The full private-buildable denominator. */
export const BUILDABLE_FAMILIES = [
    ...PACKED_FAMILIES, ...GENERICA_FAMILIES, ...REMITTED_FAMILIES, ...REFUSED_DIRECT_FAMILIES,
];

// ─────────────────────────────────────────────────────────────────────────────
// 2 — family assignment: LONGEST-PREFIX, and why that is safe HERE and nowhere else
// ─────────────────────────────────────────────────────────────────────────────
//
// The live layer publishes 319 distinct calificación strings, most of them local variants of a base
// code (`RB-Ch6`, `RF-Eg1`, `IX-VJ2`, `RCJ`, `RDe`, `IC - AB1- 2`…).
//
// ⚠⚠ `esMurciaPgou2012.ts` REFUSES to do this, deliberately, and it is right to: `PACKED_VARIANTS`
// is an explicit two-entry allow-list because "stripping suffixes with a regex would silently assert
// that a variant carries its base zone's numbers — a claim the ordinance nowhere makes."
//
// That prohibition is about WHICH ORDINANCE APPLIES. This file answers a different question: WHICH
// LAND IS PRIVATE AND BUILDABLE — i.e. what belongs in the denominator. `RB-Ch6` is residential
// buildable land whatever number governs it. So prefix-grouping is used for the DENOMINATOR and for
// the LEGAL cross-tab, and is NEVER used for the shipping-behaviour measurement, which calls the
// real `resolveMurciaPgouZone` allow-list. Both are reported, and their difference is a finding.

const SORTED_FAMILIES = [...BUILDABLE_FAMILIES].sort((a, b) => b.length - a.length || a.localeCompare(b));

/**
 * Map a raw live calificación string to a buildable family, or `null` if it is not private buildable
 * land. Longest prefix wins, so `RD1…` resolves to `RD1` and not to `RD`.
 *
 * ⚠ Separators are normalised (`IC - AB1- 2` → `ICAB12`) BEFORE matching, because Murcia's operators
 * typed these by hand and the spacing is not meaningful.
 */
export function calificacionFamily(raw) {
    const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!s) return null;
    for (const f of SORTED_FAMILIES) if (s.startsWith(f)) return f;
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 — delegation on the ÁMBITO (sector code) and on the CLASE DE SUELO
// ─────────────────────────────────────────────────────────────────────────────

/** Arts. 5.24 (UA/UH/UM) · 5.25.1 (UE) · 5.25.2 (UD) · 6.6 (TA/TM). */
export const DELEGATING_AMBITO_PREFIXES = ['TA', 'TM', 'UA', 'UH', 'UM', 'UE', 'UD'];

/**
 * The subset the SHIPPING code branches on — `REMITTED_AMBITO_PREFIXES` in
 * `packages/site-parcel-data/src/providers/murciaZoningProvider.ts`.
 *
 * ⚠ IT IS NARROWER THAN THE LEGAL SET ABOVE, AND THAT IS THE POINT OF MEASURING BOTH.
 */
export const CODE_REMITTED_PREFIXES = ['TA', 'TM', 'UA', 'UH', 'UM'];

/** Planes Especiales / Parciales (Art. 5.26.2) — `PERI`, `PU`, `PM`, `PI`, `PC`, `PP`… */
export function isPlanEspecialPrefix(prefix) {
    return /^P[A-Z]*$/.test(prefix) && prefix !== 'PAR';
}

/** Art. 6.2.2.3 — urbanizable land is ordered by a Plan Parcial, not by the general plan. */
export function isUrbanizable(claseSuelo) {
    return /urbanizable/i.test(String(claseSuelo ?? '')) && !/^\s*no\s+urbanizable/i.test(String(claseSuelo ?? ''));
}

/**
 * Why is this polygon delegated? Returns the ground, in the PGOU's own precedence, or `null` for
 * PGOU-DIRECT land. `claseSuelo === undefined` means UNJOINED — a third value, never "not delegated".
 */
export function delegationGround(family, sectorPrefix, claseSuelo) {
    if (family && GENERICA_FAMILIES.includes(family)) return 'calificacion-generica';
    if (family && REMITTED_FAMILIES.includes(family)) return 'calificacion-remitida';
    if (claseSuelo !== undefined && isUrbanizable(claseSuelo)) return 'clase-urbanizable';
    if (sectorPrefix && (DELEGATING_AMBITO_PREFIXES.includes(sectorPrefix) || isPlanEspecialPrefix(sectorPrefix))) {
        return 'ambito-delegante';
    }
    return null;
}

/** The article that grounds each delegation ground — quoted in the output so nothing is unsourced. */
export const GROUND_ARTICLE = {
    'calificacion-generica': 'Arts. 5.25.3.3 / 5.26.3.3 / 6.2.2.4 / 6.5.1',
    'calificacion-remitida': 'Arts. 5.24.5.1 / 5.24.6',
    'clase-urbanizable': 'Art. 6.2.2.3',
    'ambito-delegante': 'Arts. 5.24 / 5.25.1 / 5.25.2 / 5.26.2 / 6.6.2',
};

/**
 * The EXACT calificación strings the shipping pack answers for: the 14 transcribed codes plus the
 * two allow-listed variants in `PACKED_VARIANTS`. Mirrors `resolveMurciaPgouZone`; a test pins it.
 */
export const CODE_PACKED_EXACT = [...PACKED_FAMILIES, 'RF1', 'IXT'];

/** ⚠ `RL`'s Art. 5.14.3 regime is expressly interim — «antes de la aprobación de Planes Especiales». */
export const INTERIM_FAMILIES = ['RL'];
