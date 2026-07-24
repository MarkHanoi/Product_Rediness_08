// SWITZERLAND — the FAR-harvest ceiling-lift (SCAFFOLD + prototype, default OFF).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS — Switzerland's ONE structural edge over France (recon §2, §5)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The deciding probe found the federal INTERLIS model `ARE/Nutzungsplanung_V1_2.ili` carries a TYPED,
// OPTIONAL FAR slot on the zone type:
//
//     CLASS Typ =
//       Code : MANDATORY TEXT*40;
//       ...
//       Nutzungsziffer : 0.00 .. 9.00;      -- ← the FAR / plot-ratio, a NATIVE structured number
//       Nutzungsziffer_Art : TEXT*40;       -- ← which ratio (AZ / GFZ / BMZ / GRZ …)
//     END Typ;
//
// reachable from every zone polygon via the mandatory `Typ_Geometrie` association. So — UNLIKE France,
// where the FAR exists only as règlement prose — a Swiss FAR is recoverable as **DATA**: harvest a
// canton's populated `Typ` catalogue (ili2pg / INTERLIS), map `Code → Nutzungsziffer`, and the density
// flips from "refused" to a real, cited structured number. That is a data-plumbing job, NOT OCR.
//
// ⚠ BUT: the slot is OPTIONAL (no `MANDATORY`), the national geodienste WFS does NOT surface it at all
// (recon §1.1), and getting it means a PER-CANTON harvest, not one national call. So today, with NO
// canton catalogue harvested and NO L-449 sign-off, this resolver returns `null` for every input. It is
// a SCAFFOLD: the shape the day-it-lands code plugs into, gated so it can never fabricate a number.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE HARVEST RECIPE (documented so the flip is a data drop, not a redesign)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. Obtain a canton's Nutzungsplanung INTERLIS transfer (its ili2pg / INTERLIS `.xtf`, published on
//      the cantonal geoportal or via the ÖREB pipeline).
//   2. `ili2pg --import` it into PostGIS against `Nutzungsplanung_V1_2.ili`; read the `Typ` table:
//      `SELECT code, nutzungsziffer, nutzungsziffer_art FROM ..._typ WHERE nutzungsziffer IS NOT NULL`.
//   3. Curate the `Code → { far, farKind }` rows into a per-canton catalogue artefact (versioned, with
//      the source vintage), keyed by `typ_kommunal_code` (the same code `resolveChZone` returns).
//   4. Sign the L-449 `sources/VERIFICATION.md` gate for that canton; set `CH_FAR_CERTIFIED = true` (or
//      a per-canton allow-list) and wire the catalogue into `CH_CANTON_FAR_CATALOGUES` below.
//   5. `farKind` (AZ/GFZ/BMZ/GRZ) MUST travel with the number: an Ausnützungsziffer, a Geschossflächen-
//      ziffer and a Baumassenziffer are NOT interchangeable feedstock for a volume, and promoting one
//      as another silently mis-states buildable volume (the §CONTEXT-DATA-HONESTY failure class).
//
// PURE + deterministic (no I/O). Strategic context —
// docs/04-reference/jurisdictions/ch/RATE-IMPLEMENTATION-PLAN.md §Phase 2, recon §2/§5, C58 §1.4/§1.6.

/**
 * The certification flag (L-449). **Default OFF.** While false, `resolveChFarFromCantonCatalogue`
 * returns `null` for every input — no Swiss FAR is signed off yet (`sources/VERIFICATION.md`). It
 * flips to true (or is replaced by a per-canton allow-list) only when a canton's `Typ` catalogue has
 * been harvested AND human-verified. A machine-mapped number is NEVER shown behind an unsigned gate.
 */
export const CH_FAR_CERTIFIED = false;

/** Which density ratio a harvested `Nutzungsziffer` is (INTERLIS `Nutzungsziffer_Art`). Semantics differ. */
export type ChFarKind =
    /** Ausnützungsziffer — GFA / land area (the classic FAR). */
    | 'AZ'
    /** Geschossflächenziffer — gross floor area / land area. */
    | 'GFZ'
    /** Baumassenziffer — building VOLUME / land area (m³/m², NOT a floor ratio). */
    | 'BMZ'
    /** Grünflächenziffer / Grundflächenziffer — green/ground coverage (NOT a FAR). */
    | 'GRZ'
    /** An art string we do not yet classify — carried verbatim, never assumed to be a FAR. */
    | 'other';

/** One harvested zone-type row: the FAR + which ratio it is + its provenance. */
export interface ChFarCatalogueEntry {
    /** `typ_kommunal_code` (the key `resolveChZone` returns). */
    readonly typKommunalCode: string;
    /** `Nutzungsziffer` (0.00..9.00), or null when the canton left the optional slot empty. */
    readonly far: number | null;
    /** `Nutzungsziffer_Art` classified — the number is meaningless without it. */
    readonly farKind: ChFarKind;
    /** The catalogue vintage / source citation this row was harvested from. */
    readonly source: string;
}

/** A per-canton harvested catalogue: `typ_kommunal_code → entry`. Empty until a canton is harvested. */
export type ChCantonFarCatalogue = ReadonlyMap<string, ChFarCatalogueEntry>;

/**
 * The registry of harvested per-canton `Typ` catalogues, keyed by canton abbreviation (`AI`, `ZH`…).
 *
 * ⚠ DELIBERATELY EMPTY. No canton catalogue has been harvested + L-449-signed yet. Adding a canton is
 * a curated DATA artefact registered here (step 3/4 of the recipe), never an inline number.
 */
export const CH_CANTON_FAR_CATALOGUES: ReadonlyMap<string, ChCantonFarCatalogue> = new Map();

/** The result of a FAR lookup — a signed number, or a typed reason it is absent. Never throws. */
export type ChFarResolution =
    | { readonly ok: true; readonly far: number; readonly farKind: ChFarKind; readonly source: string }
    | {
          readonly ok: false;
          readonly reason:
              /** `CH_FAR_CERTIFIED` is false — no canton has been signed off (the current state). */
              | 'not-certified'
              /** No harvested catalogue exists for this canton yet. */
              | 'no-canton-catalogue'
              /** The canton is harvested but has no row for this zone code. */
              | 'no-catalogue-entry'
              /** The row exists but the canton left the optional `Nutzungsziffer` slot empty. */
              | 'far-not-published';
      };

/**
 * Resolve a Swiss zone's FAR from a per-canton harvested `Typ` catalogue.
 *
 * ⚠ RETURNS `{ ok: false, reason: 'not-certified' }` FOR EVERY INPUT TODAY — this is a scaffold and no
 * catalogue is harvested/signed (see `CH_FAR_CERTIFIED`). It NEVER fabricates a FAR. A real value flips
 * in only when a canton's catalogue is harvested, registered in `CH_CANTON_FAR_CATALOGUES`, and the
 * L-449 gate is signed. The `farKind` always travels with the number (AZ/GFZ/BMZ are not interchangeable).
 *
 * @param typKommunalCode  the `typ_kommunal_code` from `resolveChZone` (e.g. `1102`).
 * @param canton           the two-letter canton from `resolveChZone` (e.g. `AI`).
 */
export function resolveChFarFromCantonCatalogue(
    typKommunalCode: string | null | undefined,
    canton: string | null | undefined,
): ChFarResolution {
    if (!CH_FAR_CERTIFIED) return { ok: false, reason: 'not-certified' };
    const code = typeof typKommunalCode === 'string' ? typKommunalCode.trim() : '';
    const kt = typeof canton === 'string' ? canton.trim().toUpperCase() : '';
    if (code === '' || kt === '') return { ok: false, reason: 'no-catalogue-entry' };

    const catalogue = CH_CANTON_FAR_CATALOGUES.get(kt);
    if (!catalogue) return { ok: false, reason: 'no-canton-catalogue' };
    const entry = catalogue.get(code);
    if (!entry) return { ok: false, reason: 'no-catalogue-entry' };
    if (entry.far === null || !Number.isFinite(entry.far) || entry.far <= 0) {
        return { ok: false, reason: 'far-not-published' };
    }
    return { ok: true, far: entry.far, farKind: entry.farKind, source: entry.source };
}
