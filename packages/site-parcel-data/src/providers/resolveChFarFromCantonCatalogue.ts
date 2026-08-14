// SWITZERLAND — the FAR-harvest ceiling-lift. PARTIALLY RETIRED: Zürich (ZH) is signed and live.
//
// ─── C74 §3.4 SCAFFOLD DECLARATION (CO-06, §CO-06-GRACE-FIX 2026-08-14) ───────────────────────
// owner: site-parcel-data / CH jurisdiction seat (the per-canton harvest is this package's debt).
// date: 2026-08-14 (this declaration). Zürich sign-off: 2026-07-26, repo owner, ch/sources/VERIFICATION.md.
//
// ⚠ THE HEADER BELOW WAS FACTUALLY STALE UNTIL THIS PASS, and that is the CO-06 defect itself:
//   it said "default OFF … NO canton catalogue harvested and NO L-449 sign-off … returns `null` for
//   every input". NONE of that is true today. `CH_FAR_CERTIFIED` is `true` (line ~71, signed
//   2026-07-26), `ZURICH_ZH_FAR_CATALOGUE` IS wired into `CH_CANTON_FAR_CATALOGUES`, and
//   `__tests__/chZurichBzoCatalogue.test.ts` asserts a real ZH zone (`W2bIII`) RESOLVES a signed AZ.
//   A reader trusting the old header would have believed a live, envelope-binding number was a stub.
//   The scaffold was partially retired and its declaration never caught up — exactly "permanent
//   architecture that nobody chose", in the direction nobody watches for.
//
// WHAT IS REAL — Zürich ZH: a human-verified TRANSCRIPTION of the BZO 700.100 per-code table,
//   signed under L-449, wired, and GFA-capping the massing (AZ × parcel area binds the engine's
//   `farLimitedHeight_m`). Not a live authoritative feed — never `structured` confidence.
// WHAT IS STILL SCAFFOLD — EVERY OTHER CANTON. `CH_CANTON_FAR_CATALOGUES` holds ZH alone, so an
//   unharvested canton refuses `no-canton-catalogue` rather than returning a number. The harvest
//   recipe below is the remaining work, per canton.
//
// RETIRING ASSERTIONS (executable, not prose) — in `packages/site-parcel-data/__tests__/`:
//   • `chZurichBzoCatalogue.test.ts` — "the gate is ON (owner-signed 2026-07-26 …)" asserts
//     `CH_FAR_CERTIFIED === true`, and the next case asserts `resolveChFarFromCantonCatalogue`
//     returns `ok: true` for `W2bIII`. Flipping the flag back, or unwiring ZH, FAILS these.
//   • `chGrundnutzungProvider.test.ts` — asserts an UNHARVESTED canton refuses
//     `no-canton-catalogue` and never fabricates a FAR. That case must be updated, deliberately,
//     by whichever harvest lands next — so this header cannot rot silently again.
// FULLY RETIRED when `CH_CANTON_FAR_CATALOGUES` covers every canton this product sells into and
//   the per-canton refusal branch has no reachable input left.
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
// (recon §1.1), and getting it means a PER-CANTON harvest, not one national call. ⚠ CORRECTED
// 2026-08-14 (CO-06): this paragraph used to end "with NO canton catalogue harvested and NO L-449
// sign-off, this resolver returns `null` for every input" — false since the 2026-07-26 ZH sign-off.
// ZH is harvested, signed and wired; every OTHER canton is still unharvested and refuses
// `no-canton-catalogue`. The gating principle is unchanged and still holds: this resolver can
// never fabricate a number — it returns a signed one or a typed reason it has none.
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

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { zurichBzoEnvelopeRefusal } from '../rulepacks/chZurichBzo.js';
import {
    ZURICH_CANTON,
    ZURICH_ZH_FAR_CATALOGUE,
    resolveZurichBzoEnvelopeParams,
    zurichBzoPendingCertFacts,
    computeZurichBzoGfa,
    type ZurichBzoRegime,
    type ZurichBzoEnvelopeParamsInput,
    type ZurichBzoLegalSource,
} from './chZurichBzoCatalogue.js';

/**
 * The certification flag (L-449). **Default OFF.** While false, `resolveChFarFromCantonCatalogue`
 * returns `not-certified` for every input and `computeZurichBzoEnvelope` returns the honest cited
 * refusal — no Swiss FAR is signed off yet (`sources/VERIFICATION.md`). It flips to true (or is
 * replaced by a per-canton allow-list) only when a canton's zone table has been transcribed/harvested
 * AND human-verified. A machine-mapped number is NEVER shown behind an unsigned gate.
 *
 * ⚠ THE ONE-LINE FLIP. Setting this to `true` activates BOTH the FAR lookup (canton catalogues below)
 * AND the Zürich BZO computed envelope (`computeZurichBzoEnvelope`). Do NOT flip it without completing
 * `ch/sources/VERIFICATION.md` (human sign-off + confirmed per-parcel regime resolution).
 *
 * (Typed `boolean`, not the literal `false`, so the certified compute branches are not narrowed away
 * as dead code while the gate is closed — same discipline as `FR_PARIS_PLU_CERTIFIED`.)
 */
export const CH_FAR_CERTIFIED: boolean = true; // Data SIGNED OFF 2026-07-26 by repo owner (MarkHanoi) — see ch/sources/VERIFICATION.md — and the FLAG is now ON: the Zürich BZO compute is WIRED into siteDispatch's CH branch (applyChZoningThenFallback), which drops `zurichBzoStructuredFields` (AZ as `plotRatioFAR`) onto a C58 ZoningRecord and feeds `computeBuildableEnvelope({ …, rulePack: null })`. The AZ therefore binds the engine's L-616 `farLimitedHeight_m` cap, so the massing is GFA-capped (AZ × parcel area), never footprint×height — the OVERSTATES-FAR defect is closed. The path REFUSES (cited) when the regime is undetermined (W2bIII 8.5 vs 9.0 m) or the zone is not in the resolved regime — never a guessed height (§CONTEXT-DATA-HONESTY).

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
 * The registry of per-canton FAR catalogues, keyed by canton abbreviation (`AI`, `ZH`…).
 *
 * `ZH` carries the City of Zürich BZO transcription (`ZURICH_ZH_FAR_CATALOGUE`, the reference-commune
 * pack). ⚠ Its presence here does NOT ship any number: while `CH_FAR_CERTIFIED` is OFF,
 * `resolveChFarFromCantonCatalogue` short-circuits to `not-certified` BEFORE any catalogue read, so the
 * registered rows are inert until the human sign-off flips the gate. The AZ rows are regime-independent
 * (see `zurichBzoFarFor`); the regime-sensitive height lives in `resolveZurichBzoEnvelopeParams`, not
 * here. Adding another canton is a curated DATA artefact registered here, never an inline number.
 */
export const CH_CANTON_FAR_CATALOGUES: ReadonlyMap<string, ChCantonFarCatalogue> = new Map([
    [ZURICH_CANTON, ZURICH_ZH_FAR_CATALOGUE],
]);

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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ZÜRICH BZO — the COMPUTED envelope, gated behind `CH_FAR_CERTIFIED` (colocated with the flag)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This is the concrete instantiation of the scaffold for the reference commune (City of Zürich): it
// READS the transcribed BZO catalogue (`chZurichBzoCatalogue.ts`) and, when the human gate is ON,
// computes an `estimated-ruleset` envelope (AZ × parcel area → GFA, with Vollgeschosse + Gebäudehöhe
// as caps). While the gate is OFF (current), it returns the honest cited refusal — ENRICHED with the
// transcribed AZ / height / storeys as "pending certification" reference facts, a strict upgrade over
// the bare refusal, and never a fabricated number (§CONTEXT-DATA-HONESTY).

/** The computed Zürich envelope (gate ON) — every value carries its regime + legal sources. */
export interface ZurichBzoComputedEnvelope {
    readonly zone: string;
    /** Ausnützungsziffer as a fraction (the FAR). */
    readonly far: number;
    /**
     * The AZ under the ENGINE's FAR-cap field name (L-616). ALWAYS === `far`; carried as a distinct,
     * engine-named field so the L5 dispatcher copies it straight into the C58 `ZoningRecord`
     * `structuredFields.plotRatioFAR` — the EXACT key `computeBuildableEnvelope`'s `farLimitedHeight_m`
     * reads (`resolveNumber(structured.plotRatioFAR, …)`). Emitting the AZ ONLY as `far` would leave the
     * shared massing's `maxFAR` null → footprint × height with no AZ cap = the OVERSTATES-FAR defect.
     */
    readonly plotRatioFAR: number;
    /** Max GFA in m² = `far × parcelAreaM2`. */
    readonly maxGFA_m2: number;
    /** Max full storeys — a cap carried alongside the GFA, never derived from it. */
    readonly maxStoreys: number;
    /** Max building height in metres — a cap; the regime-sensitive field. */
    readonly maxHeight_m: number;
    /** Which BZO regime this parcel was resolved under. */
    readonly regime: ZurichBzoRegime;
    /**
     * ALWAYS `'estimated-ruleset'`, NEVER `'structured'` — this is a human transcription of a PDF
     * table, not a live authoritative feed. Typed as the literal so a consumer cannot widen it.
     */
    readonly confidence: 'estimated-ruleset';
    readonly legalSources: readonly ZurichBzoLegalSource[];
}

/** The compute result: a refusal (gate OFF, or the parcel could not be placed) or a computed envelope. */
export type ZurichBzoEnvelopeComputation =
    | { readonly computed: false; readonly refusal: EnvelopeRefusal }
    | { readonly computed: true; readonly envelope: ZurichBzoComputedEnvelope };

/** Input to `computeZurichBzoEnvelope` — the resolved zone identity + the parcel area (m²). */
export interface ComputeZurichBzoEnvelopeInput extends ZurichBzoEnvelopeParamsInput {
    /** The parcel's ground area in m² (from the cadastre) — the multiplicand for AZ × area. */
    readonly parcelAreaM2: number;
    /** Extra per-parcel facts to surface on the refusal card (address, area, coordinates). */
    readonly extraFacts?: readonly string[];
}

/**
 * The Zürich BZO buildable-envelope path — the ONE function the CH dispatch calls for a City-of-Zürich
 * parcel once wired. Its behaviour is governed entirely by `CH_FAR_CERTIFIED`:
 *
 *   • GATE OFF (current) → returns `{ computed: false, refusal }`: the honest cited refusal
 *     (`zurichBzoEnvelopeRefusal`) ENRICHED with the transcribed AZ / height / storeys as
 *     "pending certification" reference facts. No envelope is drawn; no number is asserted.
 *   • GATE ON (post-sign-off) → resolves the regime-aware params and, if the parcel can be placed,
 *     returns `{ computed: true, envelope }` with `maxGFA_m2 = far × parcelAreaM2`, the storeys +
 *     height carried as caps, and `confidence: 'estimated-ruleset'`. If the regime is undetermined
 *     (or the zone is not in the catalogue), it STILL refuses — a guessed regime is a fabricated
 *     height (W2bIII 8.5 vs 9.0 m).
 *
 * Flipping `CH_FAR_CERTIFIED` to `true` is the entire activation — no other code change is needed here.
 */
export function computeZurichBzoEnvelope(
    input: ComputeZurichBzoEnvelopeInput,
): ZurichBzoEnvelopeComputation {
    const zoneForRefusal = {
        typ: typeof input.typ === 'string' && input.typ.trim() !== '' ? input.typ.trim() : null,
        rechtsstatus: null,
        rechtsvorschriftUrl:
            typeof input.rechtsvorschriftUrl === 'string' ? input.rechtsvorschriftUrl : null,
        planUrl: null,
        mutationsnummer: null,
        objectid: null,
    };

    if (!CH_FAR_CERTIFIED) {
        // OFF: the honest cited refusal, enriched with transcribed reference values (pending cert).
        const enriched = [...zurichBzoPendingCertFacts(input), ...(input.extraFacts ?? [])];
        return { computed: false, refusal: zurichBzoEnvelopeRefusal(zoneForRefusal, enriched) };
    }

    // ON: read the catalogue, regime-aware. Refuse (never guess) if the parcel cannot be placed.
    const params = resolveZurichBzoEnvelopeParams(input);
    if (!params.ok) {
        const enriched = [...zurichBzoPendingCertFacts(input), ...(input.extraFacts ?? [])];
        return { computed: false, refusal: zurichBzoEnvelopeRefusal(zoneForRefusal, enriched) };
    }

    const maxGFA_m2 = computeZurichBzoGfa(params.far, input.parcelAreaM2);
    if (maxGFA_m2 === null) {
        // No usable parcel area — refuse rather than emit a NaN / zero envelope.
        const enriched = [...zurichBzoPendingCertFacts(input), ...(input.extraFacts ?? [])];
        return { computed: false, refusal: zurichBzoEnvelopeRefusal(zoneForRefusal, enriched) };
    }

    return {
        computed: true,
        envelope: {
            zone: params.zone,
            far: params.far,
            // L-616 — emit the AZ under the engine's FAR-cap field name so the wired dispatcher's
            // ZoningRecord.structuredFields.plotRatioFAR binds the shared massing (no OVERSTATES-FAR).
            plotRatioFAR: params.far,
            maxGFA_m2,
            maxStoreys: params.maxStoreys,
            maxHeight_m: params.maxHeight_m,
            regime: params.regime,
            confidence: 'estimated-ruleset',
            legalSources: params.legalSources,
        },
    };
}
