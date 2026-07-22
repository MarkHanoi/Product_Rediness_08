// L-591 / ADR-0271 — Barcelona (INE 08019) rule pack for the **`20a` family**,
// *Zona d'ordenació en edificació aïllada* (PGM Arts. 337–343, Barcelona-exclusive text).
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1. DOES `20a` FIT OUR RULE MODEL? — **YES, AND IT IS THE FIRST BARCELONA CLAU THAT DOES.**
// ═════════════════════════════════════════════════════════════════════════════════════════════
// Every Barcelona zone packed so far (13a/13E, 13b) is *alineació a vial + profunditat edificable*
// — a half-plane clip that `kind: 'setback'` cannot express at all, which is why ADR-0270 had to
// invent `alignment` and ADR-0271 `block-derived-alignment`.
//
// `20a` is the opposite case. Art. 339: *"A totes les subzones el tipus d'ordenació aplicable és
// el d'edificació aïllada."* Arts. 342.7 / 343.3 then state, per subzone, a triple in the order
// **front – lateral – fons**. That is `{ front_m, side_m, rear_m }`, in the ordinance's own words,
// in the ordinance's own order. **`kind: 'setback'` is not a forced fit here — it is the native
// shape**, and C58 §2.2's original model (built for the founder's Portuguese Seixal UH2 reference
// case) turns out to be the Spanish *edificació aïllada* model too.
//
// This is also why `esBarcelonaZoneClassification.ts`'s coverage-gap copy for `20a` says the
// opposite of what it says for 12/12b: *"This zone IS governed by real separation distances …
// so an envelope of the usual shape is the right answer here."* That sentence is now redeemed.
//
// WHAT WE **CANNOT** EXPRESS, STATED PLAINLY (full list: `BCN_20A_UNMODELLED_RULES`)
// ----------------------------------------------------------------------------------
//   • **Art. 255's slope reduction of the edificabilitat** (−20 % at 30–50 % slope, −40 % at
//     50–100 %, INEDIFICABLE above 100 %). We hold no DTM and extrude from a flat plane (L-584).
//     Barcelona's `20a` fabric is disproportionately hillside. THIS IS THE LARGEST KNOWN
//     OVER-STATEMENT RISK IN THIS PACK and a consumer must not present a `20a` envelope as
//     slope-checked.
//   • The *separació entre edificacions d'una mateixa parcel·la* ratio — we solve one envelope.
//   • The Art. 342.1/343.1 exception cases (a/b/c) and their proportional index reduction — the
//     trigger is cadastral legal history (pre-1956 deeds, the 1953 Pla Comarcal) that PRYZM does
//     not hold. Surfaced as a MAY-APPLY caveat by `resolve20aEdificabilitat`, never applied.
//
// **No new rule KIND is needed.** The one thing the schema has no slot for is a FAR (or a height)
// that is a FUNCTION rather than a scalar — and that gap already exists and already has a
// pattern: `maxHeight_m: null` in the pack + a resolver module + the L5 dispatcher attaching the
// constructed value with its own derivation row (exactly how 13a/13b heights ship). This pack
// reuses that pattern for `20a/8`'s width-indexed FAR and for `20a/9u`'s area-indexed FAR. Adding
// a `kind` would have been the wrong response: the GEOMETRIC OPERATION is a plain inset in every
// one of the ten subzones.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2. THE ARTICLE CITED PER FIELD — read this before touching a number
// ═════════════════════════════════════════════════════════════════════════════════════════════
//   setbacks front/side/rear   Art. 342.7 (plurifamiliar I–V)  ·  Art. 343.3 (unifamiliar VI–IX)
//   maxCoverage                Art. 342.2 (plurifamiliar)      ·  Art. 343.1 (unifamiliar)
//   maxHeight_m / maxFloors    Art. 342.3 (plurifamiliar; 9,15 m PB+2, IVb 15,25 m PB+4)
//                              Art. 342.5 (subzona V ONLY — a width table ⇒ NULL in the pack)
//                              Art. 343.2 (unifamiliar; 9,15 m PB+2 throughout)
//   plotRatioFAR               Art. 340.1 (the net-index table)
//                              Art. 340.2 + Art. 343.1 (subzona VI ⇒ a parcel-area construction)
//                              Art. 342.5 (subzona V ⇒ a street-width construction)
//   minimum parcel / façana    Art. 342.1 (plurifamiliar)      ·  Art. 343.1 (unifamiliar)
//
// ⚠ **Art. 340 IS NOT MODIFIED FOR BARCELONA.** Footnote 54 on printed p. 110 — the one that
// sends the reader to p. 185 — attaches to **Art. 341** (*Actuacions de reforma interior*), which
// sits immediately below the Art. 340 table in the right-hand column. Arts. 342 and 343 ARE
// modified, via footnotes 55 and 56. Reading footnote 54 as Art. 340's would have replaced the
// edificabilitat table with a land-share table. See `BCN_20A_BARCELONA_DELTAS`.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3. §NULLS — every null is a finding
// ═════════════════════════════════════════════════════════════════════════════════════════════
//   • `20a/8` (V) — `maxHeight_m`, `maxFloors`, `plotRatioFAR` ALL null. Barcelona's Art. 342.5
//     keys all three on the *amplada de vial*, off one shared table row. A scalar would publish
//     one street's answer for the subzone; for the FAR specifically it would over-state a
//     narrow-street parcel by up to 2,5× (1,50 vs 0,60).
//   • `20a/9u` (VI) — `plotRatioFAR` null. Art. 340.2 reduces 1,00 to 0,75 below the 400 m²
//     minimum, and Barcelona Art. 343.1 sets the floor at which the reduced index exists at all
//     (≥ 200 m² AND ≥ 10 m façana). A parcel-area construction, not a constant. **The brief was
//     right that this is an algorithm; encoding 1,00 would have been wrong for every small VI
//     parcel and 0,75 wrong for every large one.**
//   • `20a/9`, `20a/9b` (IVa, IVb) — FAR is **1,00 and stays 1,00**. Art. 340.2's reduction is
//     scoped to *"les subzones unifamiliars"*; IVa/IVb are plurifamiliar. Applying it to them
//     would be reading a scope out of the sentence that carries it.
//   • Every subzone's **dwelling cap** is absent from the pack. Art. 342.10 gives a per-parcel
//     count (÷ 80 m² of edificabilitat) for the PLURIFAMILIAR subzones only; Art. 343 states no
//     equivalent. It caps the PROGRAMME, not the envelope. Recorded as
//     `BCN_20A_ART342_DWELLING_MODULE_M2`, not as a zone field.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4. CONFIDENCE — `estimated-ruleset`, and NOTHING here is `certified`
// ═════════════════════════════════════════════════════════════════════════════════════════════
// The source read is the MMAMB re-edition of the PGM NNUU, committed in this repo. It is a
// **re-edition of the 1988 *text refós***: manually re-typeset, with documented transcription
// errors elsewhere in the same volume (Arts. 251.3a, 330, 331). Reading it with text coordinates
// removes the column-interleaving failure that defeated three prior rounds (L-590) — it does not
// convert a secondary edition into the DOGC original. The citation string says exactly this.
//
// PURE + deterministic (C58 §1.1). Strategic context: C58 §1.1/§1.2/§1.4/§1.7a/§1.11, ADR-0270,
// ADR-0271, ADR-0272, L-590, L-591.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type ZoningRule,
} from '@pryzm/schemas';
import {
    BCN_20A_BY_CLAU,
    BCN_20A_SUBZONES,
    BCN_20A_ZONE_CODES,
    type Bcn20aSubzone,
} from './bcn20aSubzones.js';
import { resolveAlcada20aSubzonaV } from './bcnAlcada20aAillada.js';

/** Re-exported under the name the registry and the height dispatcher use. */
export const BCN_20A_AILLADA_ZONE_CODES = BCN_20A_ZONE_CODES;

/** The shared provenance of every value in this pack: a coordinate-accurate read of a re-edition. */
const SOURCE_SENTENCE =
    'Source: PGM-1976 NNUU as re-edited by the MMAMB (Normativa Urbanística Metropolitana), ' +
    'committed at docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf and read ' +
    'with text coordinates (printed pp. 109–114 for the base text, pp. 177–188 for the ' +
    'Barcelona-exclusive modifications). ⚠ This is a RE-EDITION of the 1988 text refós — manually ' +
    're-typeset, with documented transcription errors elsewhere in the same volume (Arts. 251.3a, ' +
    '330, 331) — not the DOGC original and not Barcelona\'s own 08019 consolidation. Confidence ' +
    'estimated-ruleset; nothing in this pack is certified (L-590, L-591).';

/** The Barcelona-exclusive instrument that governs Arts. 342 and 343 for INE 08019. */
const BARCELONA_MODIFICATION_SENTENCE =
    'Arts. 342 and 343 are read from "Modificació de les Normes urbanístiques del PGM per a ' +
    'l\'ordenació de l\'edificació aïllada, de Barcelona", approved by the Subcomissió ' +
    'd\'Urbanisme del municipi de Barcelona on 20-10-2004 (DOGC núm. 4277 of 10-12-2004), whose ' +
    'articles are headed "(d\'aplicació al municipi de Barcelona exclusivament)" — NOT from the ' +
    'base metropolitan text, which those articles\' own footnotes 55 and 56 redirect away from. ' +
    'Arts. 337, 338, 339 and 340 are NOT Barcelona-modified (footnote 54 attaches to Art. 341).';

/**
 * The citation carried on every value of one subzone. Built per subzone because the governing
 * article genuinely differs by family — Art. 342 for I–V, Art. 343 for VI–IX — and a single shared
 * string would have to name both, which is how a reader ends up attributing a plurifamiliar figure
 * to a unifamiliar parcel (L-526).
 */
export function bcn20aOrdinanceRef(sub: Bcn20aSubzone): string {
    const conditions = sub.family === 'plurifamiliar' ? 'Art. 342' : 'Art. 343';
    const heightClause =
        sub.clau === '20a/8'
            ? 'Alçada + nombre de plantes + edificabilitat realitzable: Art. 342.5 (Barcelona ' +
              'Taula 10/11), a function of the amplada de vial — NOT a subzone scalar, hence the ' +
              'nulls in this pack.'
            : sub.family === 'plurifamiliar'
              ? `Alçada màxima ${sub.maxHeight_m?.toFixed(2)} m / PB+${sub.floorsAboveGround}: ` +
                'Art. 342.3.'
              : `Alçada màxima ${sub.maxHeight_m?.toFixed(2)} m / PB+${sub.floorsAboveGround}: ` +
                'Art. 343.2.';
    const farClause = sub.edificabilitatIsConstructed
        ? `Índex d'edificabilitat neta: Art. 340.1 states ${sub.edificabilitatNeta
              .toFixed(2)
              .replace('.', ',')} for this subzone, but it is a CONSTRUCTION here (` +
          (sub.clau === '20a/8'
              ? 'Art. 342.5 makes it a function of the amplada de vial, 0,60–1,50'
              : "Art. 340.2 reduces it to 0,75 below the 400 m² minimum, and Barcelona's " +
                'Art. 343.1 conditions the reduced index on ≥ 200 m² and ≥ 10 m of façana') +
          '), so this pack ships plotRatioFAR: null and resolve20aEdificabilitat() answers it.'
        : `Índex d'edificabilitat neta ${sub.edificabilitatNeta
              .toFixed(2)
              .replace('.', ',')} m²st/m²s: Art. 340.1 (not Barcelona-modified).`;
    return (
        `PGM-1976 NNUU, clau ${sub.clau} — Zona d'ordenació en edificació aïllada (20a), ` +
        `subzona ${sub.subzone}, ${sub.family} (Art. 338.2). Tipus d'ordenació: edificació ` +
        `aïllada (Art. 339). Separacions front–lateral–fons ${sub.separations.front_m}–` +
        `${sub.separations.side_m}–${sub.separations.rear_m} m: ${conditions}.${
            sub.family === 'plurifamiliar' ? '7' : '3'
        } ` +
        `Ocupació màxima ${(sub.maxCoverage * 100).toFixed(0)} %: ${conditions}.` +
        `${sub.family === 'plurifamiliar' ? '2' : '1'} (measured per Barcelona Art. 249.1 as the ` +
        `orthogonal projection of the whole volume, above or below grade, cossos sortints ` +
        `included). Superfície mínima de parcel·la ${sub.minParcel_m2} m² / façana mínima ` +
        `${sub.minFacade_m} m: ${conditions}.1. ${heightClause} ${farClause} ` +
        `⚠ Art. 255 (Barcelona) reduces the edificabilitat on parcels of average slope > 30 % and ` +
        `makes those above 100 % inedificables — PRYZM holds no terrain model and does NOT apply ` +
        `it. ${BARCELONA_MODIFICATION_SENTENCE} ${SOURCE_SENTENCE}`
    );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The edificabilitat resolver — Art. 340.1 / 340.2 / 342.5 / 343.1
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Why an index could not be stated. Each value is a DIFFERENT missing input, never a failure. */
export type Bcn20aEdificabilitatRefusal =
    /** The clau is not a `20a` subzone this pack knows. */
    | 'unknown-clau'
    /** Subzona V: Art. 342.5 needs an *amplada de vial* and none was supplied. */
    | 'needs-street-width'
    /** Subzona V: the width sits within the band-edge guard, so noise would pick the index. */
    | 'band-edge'
    /** Subzona VI: Art. 340.2 needs the parcel area and none was supplied. */
    | 'needs-parcel-area'
    /** Subzona VI: below Barcelona Art. 343.1's 200 m² floor, the ordinance states no index. */
    | 'below-ordinance-floor';

export type Bcn20aEdificabilitatResolution =
    | {
          readonly ok: true;
          /** m² sostre / m² sòl. */
          readonly index: number;
          /** The article that STATES this index — the sub-clause, not just "Art. 340". */
          readonly article: string;
          /** How it was reached, for the derivation row. */
          readonly why: string;
          /**
           * Conditions the ordinance imposes that PRYZM did NOT verify. **Never empty for a
           * hillside-capable subzone** — Art. 255's slope reduction is always listed, because we
           * hold no terrain and a consumer must say so.
           */
          readonly caveats: readonly string[];
      }
    | {
          readonly ok: false;
          readonly reason: Bcn20aEdificabilitatRefusal;
          readonly detail: string;
          /** For `band-edge`: the two indices the width sits between. */
          readonly straddles: readonly number[];
      };

/** Attached to every successful resolution — the terrain gap is unconditional (L-584). */
const SLOPE_CAVEAT =
    'Art. 255 (Barcelona): a parcel of average slope 30–50 % has this index reduced by 20 %, ' +
    '50–100 % by 40 %, and above 100 % is inedificable. PRYZM holds no terrain model and has NOT ' +
    'applied this — on a sloping parcel the figure above is an UPPER BOUND.';

/** Attached when the parcel is below its subzone minimum: Art. 342.1/343.1 cases a/b/c. */
function undersizedCaveat(sub: Bcn20aSubzone, area: number): string {
    return (
        `The parcel (${area.toFixed(0)} m²) is below this subzone's ${sub.minParcel_m2} m² ` +
        `minimum (${sub.family === 'plurifamiliar' ? 'Art. 342' : 'Art. 343'}.1). It is buildable ` +
        'in isolation only under exception cases a/b/c (a pre-1956 public-deed segregation, the ' +
        '1953 Pla Comarcal, or being landlocked between built parcels), and in those cases the ' +
        'Art. 340 index is reduced IN THE SAME PROPORTION as the shortfall — except where only ' +
        'ONE dwelling is built. The trigger is cadastral legal history PRYZM does not hold, so ' +
        'the reduction is NOT applied here. Treat the index as an upper bound pending a check.'
    );
}

/**
 * Resolve the *índex d'edificabilitat neta* for a `20a` parcel.
 *
 * PURE, deterministic, never throws. Returns `ok: false` — with the specific missing input —
 * rather than a plausible number, because in this family the plausible number is wrong by up to
 * 2,5× (subzona V) or 33 % (subzona VI).
 *
 * @param clau            the MUC clau, e.g. `'20a/10'`.
 * @param input.parcelArea_m2  cadastral parcel area, m². Required for `20a/9u`.
 * @param input.amplada_m      *amplada de vial*, m. Required for `20a/8`.
 */
export function resolve20aEdificabilitat(
    clau: string,
    input: {
        readonly parcelArea_m2?: number | null;
        readonly amplada_m?: number | null;
        readonly trustedOfficialWidth?: boolean;
        readonly measurementSpread_m?: number | null;
    } = {},
): Bcn20aEdificabilitatResolution {
    const sub = BCN_20A_BY_CLAU.get(clau);
    if (!sub) {
        return {
            ok: false,
            reason: 'unknown-clau',
            detail:
                `"${clau}" is not one of the ten 20a subzone claus (Art. 338.2). A bare "20a" ` +
                'identifies the zone, not the subzone, and the ten differ by 6× in edificabilitat.',
            straddles: [],
        };
    }

    // ── Subzona V (20a/8) — Barcelona Art. 342.5: the index comes off the WIDTH row. ──────────
    if (clau === '20a/8') {
        const w = input.amplada_m;
        if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
            return {
                ok: false,
                reason: 'needs-street-width',
                detail:
                    'Barcelona Art. 342.5 makes subzona V\'s realisable edificabilitat a function ' +
                    'of the amplada de vial (0,60 · 0,90 · 1,20 · 1,50). Art. 340.1\'s 1,50 is the ' +
                    'TOP of that ladder, reachable only from a vial ≥ 15 m — publishing it without ' +
                    'a width would over-state a narrow-street parcel by up to 2,5×.',
                straddles: [],
            };
        }
        const r = resolveAlcada20aSubzonaV(w, {
            trustedOfficialWidth: input.trustedOfficialWidth,
            measurementSpread_m: input.measurementSpread_m,
        });
        if (!r.ok) {
            return {
                ok: false,
                reason: r.reason === 'band-edge' ? 'band-edge' : 'needs-street-width',
                detail:
                    `Art. 342.5 rejected an amplada of ${w.toFixed(2)} m: ${r.reason}. A band ` +
                    'crossing here moves BOTH the height (3,05 m) and the index (0,30), so the ' +
                    'measurement — not the noise — must be what decides the row.',
                straddles: r.straddles,
            };
        }
        return {
            ok: true,
            index: r.edificabilitatNeta,
            article: 'Art. 342.5 (Barcelona, Taula 10/11)',
            why:
                `amplada de vial ${w.toFixed(2)} m → band [${r.band.minWidth_m}, ` +
                `${r.band.maxWidth_m === Infinity ? '∞' : r.band.maxWidth_m}) → PB+` +
                `${r.band.floorsAboveGround} = ${r.band.height_m.toFixed(2)} m and edificabilitat ` +
                `${r.edificabilitatNeta.toFixed(2).replace('.', ',')} m²st/m²s (same table row)`,
            caveats: [
                SLOPE_CAVEAT,
                'Art. 342.5 states this index is derived "en funció de l\'ocupació màxima 30 per ' +
                    '100 i del nombre límit de plantes admissible segons l\'amplada del vial" — it ' +
                    'is consistent with, not additional to, the 30 % coverage cap in this pack.',
                ...(typeof input.parcelArea_m2 === 'number' &&
                input.parcelArea_m2 < sub.minParcel_m2
                    ? [undersizedCaveat(sub, input.parcelArea_m2)]
                    : []),
            ],
        };
    }

    // ── Subzona VI (20a/9u) — Art. 340.2 + Barcelona Art. 343.1: the index depends on the AREA. ─
    if (clau === '20a/9u') {
        const a = input.parcelArea_m2;
        if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0) {
            return {
                ok: false,
                reason: 'needs-parcel-area',
                detail:
                    'Art. 340.2: "A les subzones unifamiliars, l\'índex d\'1,00 m² sostre/m² sòl ' +
                    'es redueix a 0,75 … per a aquelles parcel·les de superfície inferior a la ' +
                    'mínima 400 m²." Subzona VI is the only unifamiliar subzone carrying 1,00, so ' +
                    'its index cannot be stated without the parcel area.',
                straddles: [],
            };
        }
        if (a < 200) {
            return {
                ok: false,
                reason: 'below-ordinance-floor',
                detail:
                    `The parcel is ${a.toFixed(0)} m². Barcelona Art. 343.1 makes subzona VI's ` +
                    'reduced 0,75 index available only "sempre que la parcel·la assoleixi com a ' +
                    'mínim una superfície de 200 m² i una façana mínima de 10 m", and Art. 343.1 ' +
                    'further states that parcels not reaching the minimum surface or façana "no ' +
                    'podran construir-se aïlladament". Below 200 m² the ordinance states no index ' +
                    'for us to publish.',
                straddles: [],
            };
        }
        const reduced = a < 400;
        return {
            ok: true,
            index: reduced ? 0.75 : 1.0,
            article: reduced ? 'Art. 340.2 (with Barcelona Art. 343.1)' : 'Art. 340.1',
            why: reduced
                ? `parcel ${a.toFixed(0)} m² < the 400 m² subzone minimum ⇒ Art. 340.2 reduces the ` +
                  '1,00 index to 0,75 (Barcelona Art. 343.1 confirms it applies from 200 m² and a ' +
                  '10 m façana upward)'
                : `parcel ${a.toFixed(0)} m² ≥ the 400 m² subzone minimum ⇒ Art. 340.1's 1,00 ` +
                  'stands, unreduced',
            caveats: [
                SLOPE_CAVEAT,
                ...(reduced
                    ? [
                          'Barcelona Art. 343.1 also conditions this on a façana of at least 10 m. ' +
                              'PRYZM does not measure the cadastral street frontage, so that ' +
                              'condition is UNVERIFIED.',
                          'Barcelona Art. 343.2: below 400 m² the alçada reguladora màxima drops ' +
                              'to 7 m and the storey limit to PB+1, and the lateral separation ' +
                              'relaxes to 2 m (Art. 343.3). See resolve20aParcelOverrides().',
                          undersizedCaveat(sub, a),
                      ]
                    : []),
            ],
        };
    }

    // ── Every other subzone — Art. 340.1's scalar, unconditional. ─────────────────────────────
    return {
        ok: true,
        index: sub.edificabilitatNeta,
        article: 'Art. 340.1',
        why:
            `subzona ${sub.subzone} (${sub.clau}) — Art. 340.1 net index ` +
            `${sub.edificabilitatNeta.toFixed(2).replace('.', ',')} m²st/m²s` +
            (sub.family === 'plurifamiliar' && sub.edificabilitatNeta === 1
                ? '; Art. 340.2\'s reduction to 0,75 does NOT apply — it is scoped to "les ' +
                  'subzones unifamiliars" and this subzone is plurifamiliar'
                : ''),
        caveats: [
            SLOPE_CAVEAT,
            ...(typeof input.parcelArea_m2 === 'number' && input.parcelArea_m2 < sub.minParcel_m2
                ? [undersizedCaveat(sub, input.parcelArea_m2)]
                : []),
        ],
    };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The parcel-conditional overrides — Barcelona Arts. 343.2 / 343.3
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The small-parcel regime a `20a` parcel falls under, if any.
 *
 * ⚠ WHY THIS IS A SEPARATE CALL AND NOT BAKED INTO THE PACK: the pack is per-ZONE and the
 * override is per-PARCEL. The pack therefore ships the subzone's own table values — which is what
 * Arts. 342.3/343.2 state for the subzone — and a caller holding the parcel area asks here for
 * the parcel's own answer. Baking a 7 m height into `20a/9u` would be wrong for every conforming
 * VI parcel; omitting the override entirely would over-state every small one.
 */
export interface Bcn20aParcelOverrides {
    /** Overriding *alçada reguladora màxima* (m), or `null` when the subzone table stands. */
    readonly maxHeight_m: number | null;
    /** Overriding storeys above ground (PB+N ⇒ N), or `null`. */
    readonly floorsAboveGround: number | null;
    /** Overriding *separació lateral* (m), or `null`. */
    readonly side_m: number | null;
    /** Absolute cap on built floor area (m²), where the ordinance states one. */
    readonly maxBuiltArea_m2: number | null;
    /** The article stating the override, or `null` when none applies. */
    readonly article: string | null;
    /** Conditions of the override that PRYZM has NOT verified. */
    readonly unverifiedConditions: readonly string[];
    readonly why: string;
}

const NO_OVERRIDE: Bcn20aParcelOverrides = Object.freeze({
    maxHeight_m: null,
    floorsAboveGround: null,
    side_m: null,
    maxBuiltArea_m2: null,
    article: null,
    unverifiedConditions: [],
    why: 'no small-parcel regime applies; the subzone table values stand',
});

/**
 * Barcelona's small-parcel overrides for the unifamiliar subzones.
 *
 * ⚠ EVERY ONE OF THESE IS GATED ON AN EXCEPTION CASE WE CANNOT CHECK (Art. 343.1 a/b/c — a
 * pre-1956 public-deed segregation, the 1953 Pla Comarcal, or being landlocked). They are returned
 * with `unverifiedConditions` populated so a consumer presents them as *"if your parcel qualifies
 * under Art. 343.1"*, never as a determination.
 *
 * PURE, deterministic, never throws.
 */
export function resolve20aParcelOverrides(
    clau: string,
    parcelArea_m2: number | null | undefined,
): Bcn20aParcelOverrides {
    const sub = BCN_20A_BY_CLAU.get(clau);
    if (!sub || typeof parcelArea_m2 !== 'number' || !Number.isFinite(parcelArea_m2)) {
        return NO_OVERRIDE;
    }
    if (parcelArea_m2 >= sub.minParcel_m2) return NO_OVERRIDE;

    // Subzona VI — Barcelona Art. 343.2 + 343.3.
    if (clau === '20a/9u' && parcelArea_m2 >= 200) {
        return {
            maxHeight_m: 7,
            floorsAboveGround: 1,
            side_m: 2,
            maxBuiltArea_m2: null,
            article: 'Barcelona Art. 343.2 (height/storeys) + Art. 343.3 (lateral separation)',
            unverifiedConditions: [
                'Art. 343.1 exception case a/b/c must hold for the parcel to be buildable in ' +
                    'isolation at all — PRYZM does not hold cadastral segregation history.',
                'Art. 343.1 also requires a façana of at least 10 m, which PRYZM does not measure.',
            ],
            why:
                `subzona VI parcel of ${parcelArea_m2.toFixed(0)} m² < 400 m²: "l'alçada màxima ` +
                'permesa serà de 7 m. i el nombre límit de plantes, el de baixa i un pis"; ' +
                '"la separació mínima a la llinda lateral de la parcel·la serà de 2 m."',
        };
    }

    // Subzones VII and VIII — Barcelona Art. 343.1's 250 m² regime.
    if ((clau === '20a/10' || clau === '20a/11') && parcelArea_m2 >= 250) {
        return {
            maxHeight_m: 7,
            floorsAboveGround: 1,
            side_m: null,
            maxBuiltArea_m2: 125,
            article: 'Barcelona Art. 343.1',
            unverifiedConditions: [
                'Art. 343.1 requires a façana of at least 12 m, which PRYZM does not measure.',
                'Art. 343.1 exception case a/b/c must hold — PRYZM does not hold cadastral ' +
                    'segregation history.',
            ],
            why:
                `subzona ${sub.subzone} parcel of ${parcelArea_m2.toFixed(0)} m²: "s'hi podrà ` +
                'construir un sostre de 125 m² desenvolupat en planta baixa i un pis, amb una ' +
                'alçada reguladora màxima de 7 m." ⚠ Barcelona adds that these parcels are exempt ' +
                'from the Art. 255 slope reductions where the average slope does not exceed 100 %.',
        };
    }

    return NO_OVERRIDE;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The pack
// ─────────────────────────────────────────────────────────────────────────────────────────────

function zoneFor(sub: Bcn20aSubzone): ZoningRule {
    return {
        code: sub.clau,
        label:
            `Ordenació en edificació aïllada — subzona ${sub.subzone}, ` +
            `${sub.family} (clau ${sub.clau})`,
        // Art. 337 describes the zone as dwelling fabric "envoltada de vegetació"; the
        // plurifamiliar subzones admit apartment buildings, the unifamiliar ones do not. Neither
        // family is a mixed-use zone in the PGM's sense, so `residential` alone — adding `mixed`
        // would assert a permission Arts. 337–343 do not grant.
        permittedUse: ['residential'],
        // NULL for subzona V only — Art. 342.5 keys height + storeys on the amplada de vial.
        maxHeight_m: sub.maxHeight_m,
        // PB+N ⇒ N+1 levels including the ground floor, the convention the L5 dispatcher applies
        // to the 13a/13b tables (`alcadaFloors = r.floorsAboveGround + 1`).
        maxFloors: sub.floorsAboveGround === null ? null : sub.floorsAboveGround + 1,
        // NULL wherever Art. 340.1's figure is not usable per-parcel — see §NULLS in the header.
        plotRatioFAR: sub.edificabilitatIsConstructed ? null : sub.edificabilitatNeta,
        maxCoverage: sub.maxCoverage,
        // ⚠ REAL DISTANCES, not a fabricated triple. Arts. 342.7/343.3 state them in this exact
        // order — front, lateral, fons.
        setbacks: {
            front_m: sub.separations.front_m,
            side_m: sub.separations.side_m,
            rear_m: sub.separations.rear_m,
        },
        // The `setback` kind is the ordinance's own shape here (see §1 of the header). `setbacks`
        // above remains the inset input; this states the OPERATION explicitly rather than relying
        // on `GeometricRuleCompatSchema` inferring it.
        geometricRule: {
            kind: 'setback',
            front_m: sub.separations.front_m,
            side_m: sub.separations.side_m,
            rear_m: sub.separations.rear_m,
        },
        fieldProvenance: {
            // `ordinance-pdf` throughout — these are transcribed from ordinance text, which is
            // what drives the amber "verify against the ordinance" affordance. Nothing in this
            // pack came from a structured municipal API.
            'setback.front': 'ordinance-pdf',
            'setback.side': 'ordinance-pdf',
            'setback.rear': 'ordinance-pdf',
            maxCoverage: 'ordinance-pdf',
            permittedUse: 'ordinance-pdf',
            ...(sub.maxHeight_m === null
                ? {}
                : { maxHeight: 'ordinance-pdf' as const, maxFloors: 'ordinance-pdf' as const }),
            ...(sub.edificabilitatIsConstructed ? {} : { maxFAR: 'ordinance-pdf' as const }),
        },
        ordinanceRef: bcn20aOrdinanceRef(sub),
    };
}

/**
 * The Barcelona *ordenació en edificació aïllada* pack — ten claus.
 *
 * `defaultConfidence: 'estimated-ruleset'`. A pack cannot self-certify, and the `block-constructed`
 * tier does not arise here at all: `20a` needs no cadastral block, because its geometry is a plain
 * inset from the parcel's own boundaries.
 */
export const ES_BARCELONA_20A_AILLADA_PACK: JurisdictionZoningContract =
    JurisdictionZoningContractSchema.parse({
        jurisdictionId: 'es-08019-barcelona',
        displayName: "Barcelona — Ordenació en edificació aïllada (PGM clau 20a)",
        source: 'catastro-muc',
        crs: 'EPSG:4326',
        lastReviewed: '2026-07-22',
        defaultConfidence: 'estimated-ruleset',
        zones: BCN_20A_SUBZONES.map(zoneFor),
    });
