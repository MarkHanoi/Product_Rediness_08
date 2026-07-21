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

/** How a width figure was obtained — drives the confidence badge downstream (C23). */
export type StreetWidthProvenance =
    /** Cerdà-plan nominal official width. Public record, NOT yet certified against MUC/RPUC. */
    | 'curated-cerda-nominal';

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
 * Pull the street name out of a Catastro `ldt` address line.
 *
 * `"CL PAU CLARIS 174 BARCELONA (BARCELONA)"` → `"PAU CLARIS"`. Returns `''` when no street can be
 * read — never a partial guess, because a partial name could collide with a different street.
 */
export function streetNameFromCatastroAddress(address: string): string {
    if (typeof address !== 'string' || address.trim() === '') return '';
    const tokens = address.trim().split(/\s+/);
    let i = 0;
    if (tokens[i] && ADDRESS_TYPE_CODES.has(tokens[i]!.toUpperCase())) i++;
    const nameTokens: string[] = [];
    for (; i < tokens.length; i++) {
        // The house number terminates the street name.
        if (/^\d/.test(tokens[i]!)) break;
        nameTokens.push(tokens[i]!);
    }
    return normaliseStreetName(nameTokens.join(' '));
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
            ['PASSEIG GRACIA', 60, 'Cerdà showcase passeig; ~60 m official width (widest Eixample street).'],
            ['ARAGO', 30, 'Cerdà secondary artery; 30 m official width.'],
            ['RAMBLA CATALUNYA', 30, 'Cerdà rambla; 30 m official width.'],

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
 * Look up the *ample oficial* for a Catastro address line.
 *
 * Returns `null` for any street not on the allow-list — the caller must then show NO constructed
 * height rather than fall back to a measured width or a default. See the header.
 */
export function officialStreetWidthForAddress(address: string): OfficialStreetWidth | null {
    const name = streetNameFromCatastroAddress(address);
    if (name === '') return null;
    return BCN_OFFICIAL_STREET_WIDTHS.get(name) ?? null;
}
