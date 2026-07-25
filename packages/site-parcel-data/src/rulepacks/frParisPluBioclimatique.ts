// PARIS (Ville de Paris, INSEE 75056) — the PLU bioclimatique rule pack: a zone-ID + hauteur
// DECLARATION with a cited envelope REFUSAL by default. Madrid/Switzerland shape (a registered
// jurisdiction that refuses the parts it cannot cite, honestly).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE HONEST SPLIT (PARIS-PLU-DATA probe, live 2026-07-25 — see `resolveParisPluZone.ts` header)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A Paris parcel has THREE fidelity tiers and this pack keeps them apart:
//   • ZONE IDENTITY  — structured (GPU `zone_urba`): code `UG`, label, the règlement doc.
//   • HAUTEUR PLAFOND — structured & NUMERIC (opendata `plub_hauteur`): 18 / 25 / 31 / 37 m.
//   • EMPRISE / GABARIT / rear-cour — PDF-BOUND: NO structured coverage field exists anywhere.
//
// So the honest buildable envelope for a UG parcel is a HYBRID: we hold a real hauteur but NOT a real
// emprise. Applying the hauteur to the FULL parcel footprint (emprise = the parcel, ordre continu /
// built-to-alignment fabric) is a defensible MASSING CAP, but the "emprise = whole parcel" step is an
// ASSUMPTION, not published data — so it is gated behind a human certification (`FR_PARIS_PLU_CERTIFIED`,
// default OFF). While closed, `parisPluEnvelopeRefusal` carries the REAL zone + REAL hauteur as
// knownFacts and names the règlement for the missing emprise/gabarit — a big upgrade over the bare
// estimated triple, and never a fabricated coverage (C58 §1.4, the §CONTEXT-DATA-HONESTY family:
// a REFUSAL and a FABRICATION must not collapse to the same value).
//
// PURE + deterministic (C58 §1.1/§1.9). Strategic context — C58 §1.2/§1.4/§1.5/§2.2, ADR-0270,
// the Switzerland Outcome-B precedent (`chZoning.ts`), and the Madrid `estimated-ruleset` discipline.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type EnvelopeRefusal,
} from '@pryzm/schemas';
import type { ParisZoneIdentification } from '../providers/resolveParisPluZone.js';

/** The jurisdiction id the Paris pack + records use — equals the commune identity (INSEE 75056). */
export const PARIS_JURISDICTION_ID = 'fr-75056-paris';

/**
 * ⚠⚠ THE CERTIFICATION GATE. **DEFAULT OFF.** While false, the dispatcher renders the cited PLU
 * refusal (which carries the real zone + hauteur) for every Paris parcel and NO buildable volume is
 * drawn. Flip to true ONLY after a human certifies that, for zone UG, applying the published hauteur
 * plafond to the full parcel footprint is an acceptable massing-study cap — i.e. signs off the ONE
 * assumption the data cannot supply (emprise = the parcel, ordre continu). The règlement's true
 * emprise, gabarit-enveloppe taper and mandatory rear courtyard reduce this, so even when ON the
 * envelope renders `estimated-ruleset` WITH the emprise caveat, NEVER `structured`, NEVER a claim that
 * the coverage is cited. Same discipline as `MADRID_NZ1_CERTIFIED` / `CORDOBA_ENVELOPE_VERIFIED` /
 * `BCN_REFOS_OV_CERTIFIED`.
 *
 * (Typed `boolean`, not the literal `false`, so a consumer's `if (FR_PARIS_PLU_CERTIFIED)` compute
 * branch is not narrowed away as dead code while the gate is closed.)
 *
 * CURRENT STATE (2026-07-25): **OFF.** The zone identity and the numeric hauteur are live and cited,
 * but the emprise-as-parcel massing assumption has NOT been founder-signed against the UG règlement
 * (75056_reglement_20260616.pdf, art. UG 3 / 4). Until it is, the honest cited refusal ships.
 */
export const FR_PARIS_PLU_CERTIFIED: boolean = false;

/**
 * The govern­ing citation carried on the refusal — cites the DATA sources and the règlement DOCUMENT,
 * never a fabricated number. The doc name is filled per-parcel from the resolved zone when available.
 */
export const PARIS_PLU_ORDINANCE_REF =
    'Paris — PLU bioclimatique (Ville de Paris, INSEE 75056; règlement voted by the Conseil de ' +
    'Paris, living text 16-06-2026, idurba 75056_PLU_20260616). Zone identity is read from the ' +
    'Géoportail de l\'urbanisme national WFS (data.geopf.fr wfs_du:zone_urba); the hauteur plafond ' +
    '(UG.3.2.1) from Paris opendata plub_hauteur; the HMC (UG.3.2.2) from plub_hmc; and the filet / ' +
    'gabarit-enveloppe frontage from plub_filet — all verified live 2026-07-25. The LEGAL authority is ' +
    'the règlement PDF (75056_reglement_20260616.pdf); the Paris opendata layers are informational ' +
    'graphic annexes of it. The emprise au sol, the emprise géométrique, the gabarit-enveloppe taper ' +
    'and the rear-courtyard rule are NOT published as structured data; they live in the règlement, ' +
    'which is why the buildable footprint is not asserted from the sources alone.';

/**
 * The PLU zone this pack authors a massing rule for: `UG` (Zone urbaine générale) — the general urban
 * zone that, per the PLU-b, covers almost the whole commune and is ordre-continu fabric (façades on
 * the alignment, party walls on the sides). It is the ONLY zone for which "emprise = the parcel" is a
 * defensible massing cap; UV (urbaine verte), N, and the secteur sauvegardé (US, governed by a separate
 * PSMV) are NOT — they keep the cited refusal even when the gate is open.
 */
export const FR_PARIS_UG_ZONE_CODE = 'UG' as const;

/**
 * The zone entry. `maxHeight_m` is `null` in the pack — the hauteur is resolved LIVE per parcel from
 * `plub_hauteur` and injected by the dispatcher (like Madrid's per-manzana COEF_Z), never a constant.
 * `setbacks` are 0/0/0: for UG ordre-continu fabric the buildable footprint is the parcel itself (the
 * emprise cap the human certifies). Every other numeric field stays null — the règlement states them,
 * the data does not.
 */
function parisUgZone() {
    return {
        code: FR_PARIS_UG_ZONE_CODE,
        label: 'Zone urbaine générale (UG) — PLU bioclimatique de Paris',
        permittedUse: ['residential', 'mixed'] as const,
        maxHeight_m: null, // resolved live from plub_hauteur; NEVER a pack constant.
        maxFloors: null,
        plotRatioFAR: null,
        maxCoverage: null, // emprise is PDF-bound — NEVER a fabricated ratio.
        // 0/0/0 = the parcel footprint is the massing cap (ordre continu). Only USED behind the cert.
        setbacks: { front_m: 0, side_m: 0, rear_m: 0 },
        geometricRule: null, // legacy inset from the 0/0/0 setbacks = the full parcel.
        fieldProvenance: {
            // The hauteur is real published DATA; the 0/0/0 emprise is the CERTIFIED assumption, not a
            // cited number — flagged estimated so no chip ever reads it as an ordinance figure.
            maxHeight: 'published-structured' as const,
        },
        ordinanceRef: PARIS_PLU_ORDINANCE_REF,
    };
}

/**
 * The Paris PLU bioclimatique pack. `defaultConfidence: 'estimated-ruleset'` — a pack cannot
 * self-certify (the zone-ID earns `structured` at the PROVIDER, not here), and the envelope is a
 * massing cap under an assumed emprise, so it never rises above the ruleset tier. Parsed at load so a
 * shape error fails fast (like every pack).
 */
export const FR_PARIS_PLU_PACK: JurisdictionZoningContract = JurisdictionZoningContractSchema.parse({
    jurisdictionId: PARIS_JURISDICTION_ID,
    displayName: 'Paris — PLU bioclimatique (zone UG massing cap)',
    source: 'manual', // curated from the GPU/opendata probe; not one of the named pipeline sources.
    crs: 'EPSG:4326', // the sources publish WGS84 (informational; the engine works scene-XZ).
    lastReviewed: '2026-07-25',
    defaultConfidence: 'estimated-ruleset',
    zones: [parisUgZone()],
});

/** True when this zone code is the one the pack authors a certified height massing for (UG only). */
export function parisUgHeightMassingSupported(zoneCode: string | null | undefined): boolean {
    return typeof zoneCode === 'string' && zoneCode.trim().toUpperCase() === FR_PARIS_UG_ZONE_CODE;
}

/** A non-empty zone code for the refusal envelope: the real PLU code, else a stable source tag. */
export function parisZoneCodeFor(zone: ParisZoneIdentification | null | undefined): string {
    const code = zone?.zoneCode?.trim();
    return code && code.length > 0 ? code : 'fr-paris-plu';
}

/** A human zone label for logs/derivation (e.g. `Zone urbaine générale (UG)`), or a stable fallback. */
export function parisZoneLabelFor(zone: ParisZoneIdentification | null | undefined): string {
    const label = zone?.zoneLabel?.trim();
    const code = zone?.zoneCode?.trim();
    if (label && code) return `${label} (${code})`;
    if (label) return label;
    if (code) return code;
    return 'Paris PLU zone';
}

/**
 * The structured facts an enriched refusal carries beyond the zone + height ceiling. Each is a real
 * published value the resolver read (or a null-honest withheld) — NEVER a fabricated figure.
 */
export interface ParisPluRefusalExtras {
    /** HMC (Hauteur Maximale Constructible, UG.3.2.2) in metres, or null (no overlay at the point). */
    readonly hmc_m?: number | null;
    /** The datum of `hmc_m` (e.g. `NGF` = absolute altitude, not a metres-above-ground height). */
    readonly hmcDatum?: string | null;
    /** The nearest filet frontage `haut` code (e.g. `N`), or null. */
    readonly filetCode?: string | null;
    /** The filet frontage height in metres mapped from the code, or null (`M`/unknown). */
    readonly filetFrontageHeight_m?: number | null;
    /** The PLU dataset version `YYYY-MM-DD` derived from the plan `idurba`, or null. */
    readonly sourceVersion?: string | null;
}

/**
 * The rules the PLU-b règlement states but does NOT publish as structured data — the cumulative UG.3
 * apparatus that (together, not a parcel×height product) yields the theoretical buildable volume. Named
 * on the refusal so the user sees precisely WHICH legal inputs are withheld, not a vague "unavailable".
 */
export const PARIS_PLU_MISSING_RULES = [
    'emprise_au_sol',
    'emprise_geometrique',
    'gabarit_enveloppe',
    'cumulative_UG3_rules',
] as const;

/** Build the `knownFacts` lines that make the identified zone + structured facts LEGIBLE on the card (L-553). */
function parisPluFacts(
    zone: ParisZoneIdentification | null | undefined,
    heightCeiling_m: number | null,
    extras: ParisPluRefusalExtras = {},
): string[] {
    const facts: string[] = [];
    if (zone) {
        facts.push(`Zone: ${parisZoneLabelFor(zone)}`);
        if (zone.typeZone) facts.push(`Zone type: ${zone.typeZone}`);
        if (zone.planId) facts.push(`Plan: ${zone.planId}`);
    }
    // The height CEILING is REAL published data (plub_hauteur) — carry it even though the envelope refuses.
    // ⚠ It is the plafond (UG.3.2.1), NOT a max building height.
    if (heightCeiling_m !== null) {
        facts.push(`Height ceiling (plafond): ${heightCeiling_m} m (opendata plub_hauteur, UG.3.2.1)`);
    }
    // HMC is a DISTINCT ceiling (UG.3.2.2) — carry its datum so an NGF altitude is not misread as a height.
    if (extras.hmc_m != null) {
        const datum = extras.hmcDatum ? ` ${extras.hmcDatum}` : '';
        facts.push(`HMC (hauteur max. constructible): ${extras.hmc_m} m${datum} (opendata plub_hmc, UG.3.2.2)`);
    }
    // Filet frontage gabarit — the nearest frontage marking (informational), raw code + mapped metres.
    if (extras.filetCode) {
        const metres =
            extras.filetFrontageHeight_m != null
                ? `${extras.filetFrontageHeight_m} m`
                : 'same as existing façade';
        facts.push(`Filet (frontage gabarit): code ${extras.filetCode} → ${metres} (opendata plub_filet)`);
    }
    if (extras.sourceVersion) {
        facts.push(`PLU version: ${extras.sourceVersion}`);
    }
    return facts;
}

/**
 * The Paris buildable-envelope REFUSAL — the current shipping output for a Paris parcel while the cert
 * gate is closed (and the honest output, even open, for any zone but UG or any parcel with no height).
 *
 * ⚠ THIS, NOT A NUMBER, IS WHAT A PARIS PARCEL GETS BY DEFAULT. The zone is identified and the hauteur
 * plafond is READ (both carried in `knownFacts` so the user sees them), but the emprise au sol / gabarit
 * that would close the buildable footprint are PDF-bound, so PRYZM declines to draw a volume rather than
 * fabricate a coverage. It is NOT a bare estimate: it names the user's real zone AND their real height
 * ceiling, and cites the règlement for the one thing it withholds.
 *
 * `code: 'source-data-unavailable'` — the precise class: the zone (and the law) is known and the
 * height is read; what is missing is a STRUCTURED emprise/gabarit for this parcel, a statement about
 * the available data path (the sources publish zone + height but not coverage), not about the ordinance.
 * Hence `legallyGrounded: false`. `ordinanceRef` cites the PLU-b for the claims we DO make (the zone,
 * the height, the fact that emprise is PDF-bound), never for a coverage number.
 *
 * @param zone            the identified PLU zone (its fields become facts); null on a WFS miss.
 * @param heightCeiling_m the real published height ceiling (plafond, UG.3.2.1) in metres, or null.
 * @param extraFacts      additional per-parcel facts the caller holds (address, area, coordinates).
 * @param extras          the further structured facts the resolver read — HMC, filet, source version.
 */
export function parisPluEnvelopeRefusal(
    zone: ParisZoneIdentification | null | undefined = null,
    heightCeiling_m: number | null = null,
    extraFacts: readonly string[] = [],
    extras: ParisPluRefusalExtras = {},
): EnvelopeRefusal {
    const identified = zone != null;
    const doc = zone?.reglementDoc ? ` (règlement ${zone.reglementDoc})` : '';
    // Legible summary of the structured facts found, for the headline.
    const found: string[] = [];
    if (heightCeiling_m !== null) found.push(`a ${heightCeiling_m} m height ceiling`);
    if (extras.hmc_m != null) found.push(`HMC ${extras.hmc_m} m${extras.hmcDatum ? ` ${extras.hmcDatum}` : ''}`);
    if (extras.filetCode) {
        const m = extras.filetFrontageHeight_m != null ? `${extras.filetFrontageHeight_m} m` : 'façade-matched';
        found.push(`filet ${extras.filetCode} (${m})`);
    }
    const foundClause = found.length > 0 ? ` with ${found.join(', ')}` : '';
    return {
        code: 'source-data-unavailable',
        headline: identified
            ? `Zone identified (${parisZoneLabelFor(zone)})${foundClause} — but the buildable volume is ` +
              'not computed: the PLU requires cumulative implantation/emprise/gabarit rules.'
            : 'Paris — the buildable envelope could not be resolved for this parcel.',
        detail:
            'PRYZM reads the Paris PLU zone from the Géoportail de l\'urbanisme WFS and, from Paris ' +
            'opendata, the hauteur plafond (plub_hauteur, UG.3.2.1), the HMC (plub_hmc, UG.3.2.2) and the ' +
            'nearest filet frontage gabarit (plub_filet) — all shown above where present. What is NOT ' +
            'published as structured data is the emprise au sol, the emprise géométrique, the gabarit-' +
            'enveloppe taper and the rear-courtyard rule — those live only in the PLU bioclimatique ' +
            'règlement' + doc + ', article UG.3/UG.4 (missing: ' + PARIS_PLU_MISSING_RULES.join(', ') + '). ' +
            'The règlement is explicit that the theoretical maximum volume results from the CUMULATIVE ' +
            'application of the UG.3 implantation/emprise/gabarit rules — a parcel-footprint × height ' +
            'product is NOT equivalent and PRYZM will not ship it as if it were. So rather than fabricate ' +
            'a ground-coverage ratio to close the footprint, PRYZM declines to draw a volume: the zone and ' +
            'the height facts are shown, but the envelope is withheld because its footprint cannot be cited yet.',
        ordinanceRef: PARIS_PLU_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...parisPluFacts(zone, heightCeiling_m, extras), ...extraFacts],
    };
}
