// L-525a — curated *ample oficial* (official street width) for the Barcelona Eixample.
//
// WHY A CURATED TABLE, WHICH IS NORMALLY THE WRONG ANSWER
// -------------------------------------------------------
// PGM Art. 327.2 keys the *alçada reguladora* on the **ample oficial del carrer** — the width
// declared in the planning street database, not a width measured off a map. We probed for a
// machine-readable source on 2026-07-21 and there is none: Barcelona's open-data CKAN returns four
// `vial` datasets, of which the only relevant one (`mapa-base-de-vialitat`) is a **WMS raster** of
// façade/pavement contours carrying no width attribute, and `amplada` / `secció` / `alineació`
// return nothing at all.
//
// The alternative — measuring the frontage-to-frontage gap from block geometry — cannot be used
// where it matters most, because Art. 327.2's bands are STEPS and the Cerdà grid sits ON one. A
// standard Eixample street is 20.00 m, exactly the PB+4/PB+5 boundary: measured 19.99 m gives
// 17.70 m, measured 20.00 m gives 20.75 m. A centimetre of cadastral noise moves the building a
// full storey. `resolveAlcadaReguladora` therefore refuses measured widths near a band edge, which
// would leave the most common street in the city with no height at all.
//
// So this table exists to supply the DECLARED figure for streets whose official width is a matter
// of public record, and to refuse for every street where it is not.
//
// ⚠ UPDATE — L-537 DEMOTED THIS FILE FROM "THE SOURCE" TO "THE TOP OVERRIDE TIER"
// -------------------------------------------------------------------------------
// Everything above remains true; what changed is that it is no longer the ONLY answer. An
// allow-list of ~26 streets does not scale to a city, let alone to Spain, and the founder hit the
// consequence directly: Carrer d'Enric Granados and Ronda de la Universitat are unlisted, so
// `maxHeight` was null and the massing path drew a 0.5 m footprint slab. **Coverage was the defect,
// not the honesty.**
//
// The fix was NOT to guess a 20 m Eixample default (see the ALLOW-LIST note below — that would be
// the same fabrication in a new costume). It was to MEASURE the frontage gap from cadastral
// geometry and, where the measured distribution proves the grid quantises, attribute it to the
// quantum. That claim was gated on evidence before any code shipped: 6,819 frontages across 697
// blocks in 5 cities (`SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`) show Barcelona spikes of ×7.55
// at 20 m and ×7.51 at 30 m — and, equally importantly, NO 10/15/25 m quantum at all, which is why
// the intuitive snap set was not shipped.
//
// This table therefore SURVIVES, unchanged and above the measurement, as tier 2 of
// `resolveAmpladaDeVial` (`ampladaDeVial.ts`): on the streets it lists it still wins, because a
// nominal declared value beats an inference from geometry. It is superseded entry-for-entry by
// L-528 certification, and by a real municipal GIS layer (`declared-municipal-gis`) if one ever
// appears. Deleting it would have thrown away the only verified figures we have.
//
// ⚠⚠ PROVENANCE — STATE IT PLAINLY, BECAUSE THIS TABLE IS THE WEAK LINK
// ---------------------------------------------------------------------
// These are the **Cerdà plan's nominal official widths**, which is why they are round numbers: the
// 1859 Pla Cerdà standardised the Eixample grid at 20 m with a small set of wider arteries, and
// those figures carried into the PGM as the *ample oficial*. They are NOT extracted from the
// municipal street database, and no entry here has been certified against the MUC/RPUC *fitxa
// urbanística*. **Certifying them is audit item L-528**, and a certified value SUPERSEDES this
// table entry-for-entry.
//
// Consequences that follow from that, and are enforced rather than merely noted:
//   • Every entry carries `provenance: 'curated-cerda-nominal'`, so a consumer can badge the
//     resulting height amber/estimated. It must NEVER reach a user as a surveyed figure (C58 §1.4,
//     C23) — that is the L-459 defect this whole work item exists to close.
//   • The table is an ALLOW-LIST. An unlisted street returns `null` and the caller shows no
//     constructed height. Extending a 20 m "Eixample default" to any street we merely believe is
//     in the grid would re-create the fabrication in a new costume.
//   • Only streets whose width is unambiguous are listed. Where a street varies along its length
//     or we are unsure, it is omitted on purpose — omission costs an absent height, a wrong entry
//     costs a wrong building.
//
// ⚠ CORNER PARCELS. A parcel on a corner fronts two streets of possibly different widths, and
// Art. 327 resolves that per façade. We key on the parcel's OFFICIAL POSTAL ADDRESS street, which
// is the façade the address is taken from — defensible and deterministic, but it is a CHOICE, and
// on a corner between a 20 m and a 30 m street it is not necessarily the governing one. Flagged
// for L-528; do not silently extend this to a per-façade height without the ordinance text.
//
// PURE + deterministic (C58 §1.1/§1.9). No I/O, no THREE, no DOM.

/**
 * How a width figure was obtained — drives the confidence badge downstream (C23).
 *
 * ⚠ THE ORDER IS THE CONTRACT, strongest first. `resolveAmpladaDeVial` (`ampladaDeVial.ts`) walks
 * these tiers and the panel badges them differently, so they must NEVER be flattened into a single
 * "we have a width" boolean — that flattening IS the L-459 defect (a constructed number rendering
 * exactly like a surveyed one).
 */
export type StreetWidthProvenance =
    /**
     * A municipal planning street database — the actual *ample oficial*.
     *
     * RESERVED, NOT REACHABLE TODAY: no Spanish municipality we have probed publishes one
     * machine-readably (Barcelona's only relevant `vial` layer is a WMS raster with no width
     * attribute, probed 2026-07-21). The tier exists so that the day such a layer appears it slots
     * in ABOVE the curated list without a redesign — and so the ladder cannot be misread as
     * "curated is the best possible".
     */
    | 'declared-municipal-gis'
    /** Cerdà-plan nominal official width. Public record, NOT yet certified against MUC/RPUC. */
    | 'curated-cerda-nominal'
    /**
     * A cadastral measurement attributed to a value the street grid demonstrably quantises on
     * (L-537). One tier BELOW the curated list: it is an inference about the declared figure, made
     * from geometry, and the inference is only licensed by the measured distribution documented in
     * `SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`.
     */
    | 'snapped-to-declared-quantum'
    /**
     * The raw frontage-to-frontage distance. NOT the legal quantity — the weakest tier that still
     * produces a height, and the only one on which the band-edge guard stays armed.
     */
    | 'measured-cadastral';

export interface OfficialStreetWidth {
    /** Normalised street name (see `normaliseStreetName`). */
    readonly street: string;
    /** *Ample oficial*, metres. */
    readonly width_m: number;
    readonly provenance: StreetWidthProvenance;
    /** Why this figure — kept per-entry so a reviewer can audit one street without the header. */
    readonly note: string;
}

/**
 * Catastro address type prefixes (`ldt` field). Real example, probed live 2026-07-21:
 * `"CL PAU CLARIS 174 BARCELONA (BARCELONA)"`.
 */
const ADDRESS_TYPE_CODES = new Set([
    'CL', 'CR', 'AV', 'AVD', 'PS', 'PZ', 'PL', 'RB', 'GV', 'TR', 'PJ', 'CM', 'RD', 'BJ',
]);

/**
 * §L-586 — the parsed halves of a Catastro `ldt` line, kept SEPARATE.
 *
 * ⚠ THE TYPE CODE IS NOT NOISE, AND DISCARDING IT WAS A LIVE DEFECT. See
 * `BCN_OFFICIAL_STREET_WIDTH_ALIASES` below: `"PS GRACIA"` (Passeig de Gràcia, ~60 m) and
 * `"TR GRACIA"` (Travessera de Gràcia, a fraction of that) share the bare name `GRACIA`. A lookup
 * that throws the code away either misses both or — far worse — answers one with the other's width.
 */
export interface CatastroAddressParts {
    /** The `ldt` type code, uppercased (`CL`, `PS`, `RB`, `GV`, `AV`, `PJ`, `PZ`…), or `''`. */
    readonly typeCode: string;
    /** The street name, normalised by `normaliseStreetName`. `''` when none could be read. */
    readonly street: string;
}

/**
 * Normalise a street name for matching: strip diacritics, uppercase, drop Catalan/Spanish
 * particles and punctuation, collapse whitespace.
 *
 * The particles matter: the same street is written "PAU CLARIS", "DE PAU CLARIS" and
 * "CARRER DE PAU CLARIS" across sources, and a lookup that misses becomes an absent height rather
 * than a loud error — so the normalisation is deliberately aggressive about them.
 */
export function normaliseStreetName(raw: string): string {
    if (typeof raw !== 'string') return '';
    const stripped = raw
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // drop combining accents
        .toUpperCase()
        .replace(/[.,'’]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const PARTICLES = new Set(['DE', 'DEL', 'DELS', 'DE LA', 'LA', 'LES', 'EL', 'D', 'L']);
    return stripped
        .split(' ')
        .filter((t) => t.length > 0 && !PARTICLES.has(t))
        .join(' ');
}

/**
 * Split a Catastro `ldt` address line into its type code and its street name.
 *
 * `"CL PAU CLARIS 174 BARCELONA (BARCELONA)"` → `{ typeCode: 'CL', street: 'PAU CLARIS' }`.
 * Returns empty strings rather than a partial guess — a partial name could collide with a
 * different street, and this value becomes a building height.
 */
export function parseCatastroAddress(address: string): CatastroAddressParts {
    if (typeof address !== 'string' || address.trim() === '') return { typeCode: '', street: '' };
    const tokens = address.trim().split(/\s+/);
    let i = 0;
    let typeCode = '';
    if (tokens[i] && ADDRESS_TYPE_CODES.has(tokens[i]!.toUpperCase())) {
        typeCode = tokens[i]!.toUpperCase();
        i++;
    }
    const nameTokens: string[] = [];
    for (; i < tokens.length; i++) {
        // The house number terminates the street name.
        if (/^\d/.test(tokens[i]!)) break;
        nameTokens.push(tokens[i]!);
    }
    return { typeCode, street: normaliseStreetName(nameTokens.join(' ')) };
}

/**
 * Pull the street name out of a Catastro `ldt` address line.
 *
 * `"CL PAU CLARIS 174 BARCELONA (BARCELONA)"` → `"PAU CLARIS"`. Returns `''` when no street can be
 * read — never a partial guess, because a partial name could collide with a different street.
 *
 * ⚠ The type code is DROPPED here. For a lookup, use `parseCatastroAddress` and keep it — see
 * `CatastroAddressParts` for the defect that costs.
 */
export function streetNameFromCatastroAddress(address: string): string {
    return parseCatastroAddress(address).street;
}

/**
 * The allow-list. Keyed by `normaliseStreetName`. See the header before adding anything: an entry
 * here becomes a building height, and an unlisted street is a SAFE outcome, not a gap to fill.
 */
export const BCN_OFFICIAL_STREET_WIDTHS: ReadonlyMap<string, OfficialStreetWidth> = new Map(
    (
        [
            // ── The wide arteries. Distinctive, unambiguous, and individually well documented. ──
            ['GRAN VIA CORTS CATALANES', 50, 'Cerdà primary artery; 50 m official width.'],
            ['DIAGONAL', 50, 'Cerdà diagonal artery; 50 m official width.'],
            ['MERIDIANA', 50, 'Cerdà diagonal artery; 50 m official width.'],
            ['PARAL LEL', 50, 'Cerdà artery; 50 m official width.'],
            ['PASSEIG SANT JOAN', 50, 'Cerdà passeig; 50 m official width.'],
            ['PASSEIG GRACIA', 60, 'Cerdà showcase passeig; ~60 m official width (widest Eixample street). '
                + '§L-586: seven parcels measured their Passeig frontage at 61.1–62.3 m, i.e. ~1–2 m WIDER '
                + 'than this nominal. Not reconciled and deliberately not "corrected" — 60 and 62 sit in the '
                + 'same ≥30 m band, so the height is identical either way and adjusting the figure to match '
                + 'a measurement would be inventing a declared value.'],
            ['ARAGO', 30, 'Cerdà secondary artery; 30 m official width.'],
            // ⚠ §L-586 — 30 m IS THE ≥30 BAND BOUNDARY (Art. 327.2): 30.00 ⇒ 23.80 m PB+6, 29.99 ⇒
            // 20.75 m PB+5. Because a declared width is band-edge-exempt by definition, this entry
            // decides a whole storey with no guard behind it. It is corroborated but NOT certified:
            // three parcels independently measured their Rambla frontage at 29.85–30.01 m (mean
            // ~29.94), which is consistent with a declared 30 m and is ALSO consistent with a
            // declared 29.9 m. Certifying it is L-528.
            ['RAMBLA CATALUNYA', 30, 'Cerdà rambla; 30 m official width. ⚠ Sits EXACTLY on the Art. 327.2 '
                + '≥30 m band edge, so it alone decides PB+5 vs PB+6; measured 29.85–30.01 m across three '
                + 'parcels (§L-586) — corroborated, uncertified (L-528).'],

            // ── The standard 20 m Cerdà grid. Listed EXPLICITLY, one by one, rather than applied
            //    as a default — see the header on why an "Eixample default" is a fabrication. ──
            ['PAU CLARIS', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['ROGER LLURIA', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['BRUC', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['GIRONA', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['BAILEN', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['BALMES', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['ARIBAU', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['MUNTANER', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['CASANOVA', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['VILLARROEL', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['COMTE URGELL', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['CONSELL CENT', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['DIPUTACIO', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['VALENCIA', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['MALLORCA', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['PROVENCA', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['ROSSELLO', 20, 'Standard Cerdà grid street; 20 m official width.'],
            ['CORSEGA', 20, 'Standard Cerdà grid street; 20 m official width.'],
        ] as ReadonlyArray<readonly [string, number, string]>
    ).map(([street, width_m, note]) => [
        normaliseStreetName(street),
        { street: normaliseStreetName(street), width_m, provenance: 'curated-cerda-nominal' as const, note },
    ]),
);

/**
 * §L-586 — **THE FOUR ARTERIES CATASTRO COULD NEVER REACH.** Type-qualified aliases, keyed
 * `"<ldt type code> <normalised name>"`.
 *
 * THE DEFECT THIS CLOSES, AND HOW IT WAS FOUND
 * --------------------------------------------
 * The allow-list above keys eight arteries on names that CONTAIN their street type — `PASSEIG
 * GRACIA`, `RAMBLA CATALUNYA`, `GRAN VIA CORTS CATALANES`, `PASSEIG SANT JOAN`. Catastro's `ldt`
 * field never writes the type as a WORD; it writes a CODE, and `parseCatastroAddress` strips it:
 *
 *     "PS GRACIA 67 BARCELONA (BARCELONA)"          → "GRACIA"           ✗ no entry
 *     "RB CATALUNYA 43 BARCELONA (BARCELONA)"       → "CATALUNYA"        ✗ no entry
 *     "GV CORTS CATALANES 748 BARCELONA (BARCELONA)"→ "CORTS CATALANES"  ✗ no entry
 *
 * So **the four highest-value entries in the table were dead data**: every parcel on Passeig de
 * Gràcia, Rambla de Catalunya and Gran Via fell straight through the tier ladder to tier 3/4 and
 * was resolved from the NARROWEST street around it — which on a corner parcel is the cross street,
 * not the artery it is addressed on. Measured live over 83 Barcelona manzanas (L-586 probe), that
 * cost one outright refusal and eight parcels resolved off the wrong façade.
 *
 * ⚠ WHY THE FIX IS NOT "ALSO KEY THEM ON THE BARE NAME". Because `GRACIA` is AMBIGUOUS: `PS GRACIA`
 * is Passeig de Gràcia (~60 m) and `TR GRACIA` is Travessera de Gràcia, a different and much
 * narrower street. Adding a bare `GRACIA → 60` key would hand the Passeig's width to the Travessera
 * — a fabricated height wearing a curated badge, which is the exact failure class this whole module
 * exists to prevent. **The type code is therefore part of the key, and a wrong code simply misses.**
 *
 * PROVENANCE. The widths are unchanged — they are the same `curated-cerda-nominal` figures already
 * in the table, reached rather than restated. The alias strings are the LIVE Catastro renderings,
 * read off `Consulta_RCCOOR_Distancia` responses for real parcels in the L-586 probe, not guessed.
 *
 * ⚠ Only forms OBSERVED in live Catastro data are listed. An artery whose `ldt` rendering we have
 * not seen stays absent and keeps missing — an unlisted street is a safe outcome (see the header).
 */
export const BCN_OFFICIAL_STREET_WIDTH_ALIASES: ReadonlyMap<string, string> = new Map([
    // Observed: "PS GRACIA 67 BARCELONA (BARCELONA)" and six further PS GRACIA parcels.
    ['PS GRACIA', normaliseStreetName('PASSEIG GRACIA')],
    // Observed: "RB CATALUNYA 42/43/79 BARCELONA (BARCELONA)".
    ['RB CATALUNYA', normaliseStreetName('RAMBLA CATALUNYA')],
    // Observed: "GV CORTS CATALANES 517/524/748/764/780/796 BARCELONA (BARCELONA)".
    ['GV CORTS CATALANES', normaliseStreetName('GRAN VIA CORTS CATALANES')],
    // Same construction as PS GRACIA (a *passeig* whose entry carries the word). NOT yet observed
    // in a live `ldt` string — listed because the rendering follows mechanically from the same
    // code table, and because missing is the failure mode either way.
    ['PS SANT JOAN', normaliseStreetName('PASSEIG SANT JOAN')],
]);

/**
 * Look up the *ample oficial* for a Catastro address line.
 *
 * Returns `null` for any street not on the allow-list — the caller must then show NO constructed
 * height rather than fall back to a measured width or a default. See the header.
 *
 * §L-586 — resolution is TYPE-QUALIFIED FIRST, bare name second. The order is the safety property:
 * a type-qualified alias can distinguish `PS GRACIA` from `TR GRACIA`, and the bare-name pass can
 * never reach an aliased entry because no aliased entry is keyed on its bare name.
 */
export function officialStreetWidthForAddress(address: string): OfficialStreetWidth | null {
    const { typeCode, street } = parseCatastroAddress(address);
    if (street === '') return null;
    if (typeCode !== '') {
        const canonical = BCN_OFFICIAL_STREET_WIDTH_ALIASES.get(`${typeCode} ${street}`);
        if (canonical) return BCN_OFFICIAL_STREET_WIDTHS.get(canonical) ?? null;
    }
    return BCN_OFFICIAL_STREET_WIDTHS.get(street) ?? null;
}
