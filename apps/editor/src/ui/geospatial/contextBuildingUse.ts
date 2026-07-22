// §CTX-USE-COLOUR (L-599) — what a context building IS, as a colourable class.
//
// PURE MODULE. No DOM, no Cesium, no I/O — so the classification, the palette and the legend
// are unit-testable and the renderer only ever consumes the answer. Per the
// `globePlacementDecisions.ts` / `globeGroundAnchor.ts` precedent (L-186/L-193), **pure decisions
// are P8 span-exempt** — and `classifyContextUse` in particular runs once per building (~10k on
// the founder's box) inside one toggle, where a span per call would be the cost, not the insight.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS LOOKS THE WAY IT DOES — three constraints, each a lesson already paid for
// ─────────────────────────────────────────────────────────────────────────────
//
// (1) MEASURED FIRST, DESIGNED SECOND. `scratchpad/probe-l599-use-tags.mts` read 16,187
//     buildings out of the LIVE baked tiles (central Eixample + Gràcia) before a line of this
//     was written: **91.0% carry a meaningful use tag**, 9.0% are a bare `building=yes`.
//     Distribution: apartments 76.3% · retail 3.5% · residential 3.2% · office 2.2% ·
//     public 1.6% · hotel/school/industrial/house/church/commercial 0.2–0.6%.
//     This is the OPPOSITE of the height situation (L-582: 0.9% surveyed, 19.8% fabricated) —
//     the use data is real, and that is precisely why it may be coloured at all.
//
// (2) THE 9% UNKNOWN IS RENDERED AS EXPLICITLY UNKNOWN — by having NO COLOUR AT ALL.
//     A colour reads as a fact. Giving "we don't know" its own normal-looking swatch is the
//     L-582 fabrication pattern in colour form. So `unknown` maps to `colorCss: null`, which the
//     renderer implements as "leave this building in its ordinary context fill" — the ABSENCE of
//     colour is the signal, and the legend says so in words. This deliberately uses a DIFFERENT
//     channel from §CTX-ASSUMED-HEIGHT-VISIBLE (which owns translucency for unknown HEIGHT), so
//     the two "we don't know" statements compose instead of colliding: a building may be
//     uncoloured (use unknown) AND translucent (height unknown) and still read correctly.
//
// (3) THE LEGEND IS DESIGNED FOR THE LONG TAIL, because 76.3% is apartments. A naive per-use
//     palette paints Barcelona one colour and carries zero information. So the majority class
//     (`residential`, which absorbs apartments + residential + house + terrace + dormitory ≈ 80%)
//     gets a deliberately RECESSIVE muted warm grey, and every minority use gets a distinct
//     saturated hue. The picture the user gets is a quiet residential field with the shops,
//     offices, schools, hotels and civic buildings standing out — which is the information.
//
// ⭐ (4) THIS MODULE ANSWERS **ONE** QUESTION: what the building IS (OSM `building=*` and
//     friends). It does NOT know, and must not learn, what the land MAY BE (the clau / MUC
//     zoning code). Those are different layers, and **their disagreement is a development
//     signal** — retail standing on land zoned for something else. Merging them into a single
//     "use" colour destroys exactly the information a developer wants. The seam for a future
//     PERMITTED-use layer is `ContextUseMode`: add a second mode with its own classifier and its
//     own legend, never a second branch inside `classifyContextUse`.
//
// COLOUR SAFETY: the proposed buildable envelope is PRYZM purple #6600FF and the context fill is
// off-white. No hue in this palette sits in the 250–300° purple band, so a use colour can never be
// mistaken for the envelope or for the proposed massing.

/** The OSM keys that say what a building IS, in the priority order the L-599 probe measured. */
const USE_TAG_KEYS = ['building', 'amenity', 'shop', 'office', 'tourism', 'landuse'] as const;

/**
 * The raw, UNINTERPRETED winning use tag for a feature, e.g. `building=apartments`, `shop=*`.
 *
 * Returns `undefined` when nothing meaningful is tagged (a bare `building=yes`, or no tag at
 * all) — the 9.0% the probe measured. ⚠ `undefined` is a REAL ANSWER ("OSM does not record a
 * use here"), never a failure, and the caller must render it as such.
 *
 * Kept byte-identical in shape to the probe's own expression so the shipped classification and
 * the measured distribution describe the same thing.
 */
export function resolveUseTag(tags: Readonly<Record<string, string>> | undefined): string | undefined {
    if (!tags) return undefined;
    for (const k of USE_TAG_KEYS) {
        const v = tags[k];
        if (!v) continue;
        if (k === 'building' && v === 'yes') continue;   // the bare tag says nothing
        // `shop` / `office` carry hundreds of long-tail values; the KEY is the information.
        if (k === 'shop' || k === 'office') return `${k}=*`;
        return `${k}=${v}`;
    }
    return undefined;
}

/** The colourable classes. `unknown` is a first-class member, not a fallback bucket. */
export type ContextUseClass =
    | 'residential'
    | 'retail'
    | 'office'
    | 'civic'
    | 'education'
    | 'hospitality'
    | 'industrial'
    | 'religious'
    | 'other-known'
    | 'unknown';

/** Which classifier produced a class. Today only `actual`; `permitted` is the reserved seam. */
export type ContextUseMode = 'actual';

const RESIDENTIAL = new Set([
    'apartments', 'residential', 'house', 'detached', 'semidetached_house', 'terrace',
    'bungalow', 'dormitory', 'houseboat', 'static_caravan', 'farm',
]);
const RETAIL = new Set([
    'retail', 'commercial', 'supermarket', 'kiosk', 'shop', 'mall', 'marketplace', 'restaurant',
    'cafe', 'bar', 'fast_food', 'pub',
]);
const OFFICE = new Set(['office']);
const CIVIC = new Set([
    'public', 'civic', 'government', 'hospital', 'clinic', 'fire_station', 'police',
    'townhall', 'courthouse', 'library', 'museum', 'theatre', 'sports_hall', 'stadium',
    'train_station', 'transportation', 'community_centre',
]);
const EDUCATION = new Set(['school', 'university', 'college', 'kindergarten', 'education']);
const HOSPITALITY = new Set(['hotel', 'hostel', 'motel', 'guest_house', 'apartment']);
const INDUSTRIAL = new Set([
    'industrial', 'warehouse', 'factory', 'manufacture', 'works', 'depot', 'hangar',
    'service', 'garage', 'garages', 'construction',
]);
const RELIGIOUS = new Set([
    'church', 'chapel', 'cathedral', 'mosque', 'synagogue', 'temple', 'religious',
    'monastery', 'shrine', 'place_of_worship',
]);

/**
 * Classify a raw use tag (the output of `resolveUseTag`) into a colourable class.
 *
 * ⚠ `undefined` in ⇒ `'unknown'` out. There is no "sensible default" here on purpose: an
 * unrecorded use must not inherit the majority class, which would silently manufacture ~9% more
 * apartments than OSM knows about.
 *
 * A tag we DO have but do not bucket lands in `'other-known'` — a distinct class from `'unknown'`,
 * because "OSM says something we don't have a swatch for" and "OSM says nothing" are different
 * facts and must not look identical (the failure-vs-empty conflation of L-467/L-469).
 */
export function classifyContextUse(useTag: string | undefined): ContextUseClass {
    if (!useTag) return 'unknown';
    const eq = useTag.indexOf('=');
    const key = eq >= 0 ? useTag.slice(0, eq) : useTag;
    const value = eq >= 0 ? useTag.slice(eq + 1) : '';

    if (key === 'shop') return 'retail';
    if (key === 'office') return 'office';
    if (key === 'tourism') return HOSPITALITY.has(value) ? 'hospitality' : 'other-known';
    if (key === 'amenity') {
        if (RELIGIOUS.has(value)) return 'religious';
        if (EDUCATION.has(value)) return 'education';
        if (RETAIL.has(value)) return 'retail';
        if (CIVIC.has(value)) return 'civic';
        return 'other-known';
    }
    if (key === 'landuse') {
        if (value === 'residential') return 'residential';
        if (value === 'retail' || value === 'commercial') return 'retail';
        if (value === 'industrial') return 'industrial';
        return 'other-known';
    }
    // key === 'building'
    if (RESIDENTIAL.has(value)) return 'residential';
    if (RETAIL.has(value)) return 'retail';
    if (OFFICE.has(value)) return 'office';
    if (EDUCATION.has(value)) return 'education';
    if (HOSPITALITY.has(value)) return 'hospitality';
    if (RELIGIOUS.has(value)) return 'religious';
    if (INDUSTRIAL.has(value)) return 'industrial';
    if (CIVIC.has(value)) return 'civic';
    return 'other-known';
}

/** How one class is presented: its swatch (or the deliberate absence of one) and its wording. */
export interface ContextUseStyle {
    readonly label: string;
    /**
     * The fill for this class, or `null` meaning **do not colour this building at all** — leave
     * it in the ordinary context fill so the absence of colour IS the statement (see note 2).
     */
    readonly colorCss: string | null;
    /** Shown in the legend under the label. States the fact, never a guess. */
    readonly note?: string;
    /** Recessive classes are drawn muted so the long tail can be seen (see note 3). */
    readonly recessive?: boolean;
}

/**
 * The palette. Deliberately NO purple (reserved for the #6600FF buildable envelope) and no
 * off-white (that IS the uncoloured context fill), so a use colour can never be confused with
 * the massing semantics the scene already carries.
 */
export const CONTEXT_USE_STYLE: Readonly<Record<ContextUseClass, ContextUseStyle>> = {
    residential:   { label: 'Residential',      colorCss: '#D8CFC0', recessive: true,
                     note: '≈80% of the city — muted on purpose so the minority uses read' },
    retail:        { label: 'Retail / food',    colorCss: '#E8863C' },
    office:        { label: 'Office',           colorCss: '#2E7BC4' },
    civic:         { label: 'Civic / public',   colorCss: '#00A39B' },
    education:     { label: 'Education',        colorCss: '#4FA83D' },
    hospitality:   { label: 'Hotel / lodging',  colorCss: '#E0455E' },
    industrial:    { label: 'Industrial',       colorCss: '#8A7F6B' },
    religious:     { label: 'Religious',        colorCss: '#C9A227' },
    'other-known': { label: 'Other (tagged)',   colorCss: '#7A8B99',
                     note: 'OSM records a use we do not have a category for' },
    unknown:       { label: 'Use not recorded', colorCss: null,
                     note: 'left uncoloured — OSM has no use tag here; a colour would be a guess' },
};

/** One legend row: a class, its style, and how much of the LOADED scene it actually is. */
export interface ContextUseLegendRow {
    readonly cls: ContextUseClass;
    readonly style: ContextUseStyle;
    readonly count: number;
    /** Share of the counted set, 0..1. */
    readonly share: number;
}

export interface ContextUseLegend {
    readonly mode: ContextUseMode;
    readonly total: number;
    /**
     * Rows ordered for the LONG TAIL: every coloured minority class first (rarest last within
     * that group is unhelpful, so they are ordered by count DESC), then the recessive majority,
     * then `unknown` pinned LAST so the "we don't know" statement is always in the same place
     * and can never be mistaken for a normal category.
     */
    readonly rows: readonly ContextUseLegendRow[];
    /** Share of the counted set with no recorded use, 0..1 — surfaced verbatim in the UI. */
    readonly unknownShare: number;
}

/**
 * Build the legend from the buildings ACTUALLY ON SCREEN, not from the probe's numbers.
 *
 * ⚠ The counts are LIVE and local: the probe measured 9.0% unknown across central
 * Eixample + Gràcia, but a different neighbourhood has a different answer, and quoting the
 * probe's constant as if it described the current view would be exactly the "a real number
 * from the wrong place" failure. The legend must always state THIS scene.
 */
export function summariseContextUse(
    classes: Iterable<ContextUseClass>,
    mode: ContextUseMode = 'actual',
): ContextUseLegend {
    const counts = new Map<ContextUseClass, number>();
    let total = 0;
    for (const c of classes) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
        total++;
    }
    const present = [...counts.entries()].filter(([, n]) => n > 0);
    const rank = (cls: ContextUseClass): number =>
        cls === 'unknown' ? 2 : CONTEXT_USE_STYLE[cls].recessive ? 1 : 0;
    present.sort((a, b) => (rank(a[0]) - rank(b[0])) || (b[1] - a[1]));

    const rows: ContextUseLegendRow[] = present.map(([cls, count]) => ({
        cls,
        style: CONTEXT_USE_STYLE[cls],
        count,
        share: total > 0 ? count / total : 0,
    }));
    return {
        mode,
        total,
        rows,
        unknownShare: total > 0 ? (counts.get('unknown') ?? 0) / total : 0,
    };
}
