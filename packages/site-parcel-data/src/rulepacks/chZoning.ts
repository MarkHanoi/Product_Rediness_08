// SWITZERLAND (national) — the Grundnutzung zone pack: a zone-ID DECLARATION with a cited
// envelope REFUSAL. Madrid/Córdoba shape (a registered jurisdiction that refuses numbers honestly).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE HONEST SPLIT (SWITZERLAND-DATA-RECON-SPIKE.md §0 — Outcome B)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The national Nutzungsplanung WFS (`geodienste.ch/.../ms:grundnutzung`) publishes the **zone
// IDENTITY** as real structured data (`resolveChZone`): code, label, main-use, the local abbreviation
// (`W2`), legal status, canton, document link. That is a genuine `structured`-confidence win.
//
// The buildable **ENVELOPE**, however, is a cited REFUSAL: `nutzungsziffer` (FAR), `geschosszahl`
// (floors) and `gebäudehöhe` (height) are ALL null because they are NOT in the WFS. FAR is an optional
// slot in the federal INTERLIS `Typ` model (recoverable per-canton — see `resolveChFarFromCantonCatalogue`),
// and height/floors are not modelled anywhere (cantonal Baureglement PDF only). So the honest output
// for a Swiss parcel is: **render the zone; refuse the envelope** — never a fabricated number
// (C58 §1.4, the §CONTEXT-DATA-HONESTY family: a REFUSAL and a FABRICATION must not collapse).
//
// This pack therefore mirrors `esMadridNZ1.ts`: a DECLARATION whose every numeric field is `null`, and
// a `chZoningEnvelopeRefusal` that carries the identified zone as `knownFacts` (so the parcel's real
// zone is legible on the refusal card) while stating, cited, why no envelope is drawn.
//
// PURE + deterministic (C58 §1.1/§1.9). Strategic context — recon §0/§1/§2/§5,
// ch/RATE-IMPLEMENTATION-PLAN.md §Phase 1, C58 §1.2/§1.4/§1.5/§2.2.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type EnvelopeRefusal,
} from '@pryzm/schemas';
import type { ChZoneIdentification } from '../providers/chGrundnutzungProvider.js';

/** The jurisdiction id the Swiss registration + records use (national, one WFS for 19+ cantons). */
export const CH_JURISDICTION_ID = 'ch-national-grundnutzung';

/**
 * The zone code the refusal envelope carries when NO live `typ_kommunal_code` is available (the WFS
 * miss / unreachable case). `zoneCode` is required (min length 1); this names the source, not a zone,
 * and no number rides on it. When a zone IS identified, `chZoneCodeFor` returns the real code instead.
 */
export const CH_ZONING_FALLBACK_ZONE_CODE = 'ch-grundnutzung';

/** The governing citation carried on the refusal — cites the DATA source and the MODEL, never a number. */
export const CH_ZONING_ORDINANCE_REF =
    'Zone identified from the Swiss national Nutzungsplanung WFS (geodienste.ch/db/' +
    'npl_nutzungsplanung_v1_2_0, MGDM 73.1, INTERLIS Nutzungsplanung_V1_2, layer ms:grundnutzung, ' +
    'verified live 2026-07-24). Density (Nutzungsziffer) is an OPTIONAL slot of the federal INTERLIS ' +
    'model that the national WFS does not surface, and height/floors are not modelled at all — both ' +
    'are model+PDF-bound (per-canton Typ catalogue + cantonal Baureglement), not published as ' +
    'structured WFS attributes. See SWITZERLAND-DATA-RECON-SPIKE.md §1–§2.';

/**
 * The Switzerland Grundnutzung pack — a DECLARATION. Every numeric envelope field is `null`, on
 * purpose: the WFS publishes the zone, not its density/height. `defaultConfidence: 'estimated-ruleset'`
 * because a pack cannot self-certify (the zone-ID earns `structured` at the PROVIDER, not here), and the
 * envelope is refused rather than solved. Parsed at load so a shape error fails fast (like every pack).
 */
export const CH_ZONING_PACK: JurisdictionZoningContract = JurisdictionZoningContractSchema.parse({
    jurisdictionId: CH_JURISDICTION_ID,
    displayName: 'Switzerland — national Grundnutzung (zone identification)',
    source: 'oereb',
    crs: 'EPSG:2056', // the national WFS publishes in LV95 / CH1903+ (informational; we work scene-XZ).
    lastReviewed: '2026-07-24',
    defaultConfidence: 'estimated-ruleset',
    // No zones: the zone is resolved LIVE per parcel from the WFS, and its envelope refuses. There is
    // no per-code numeric pack to author until a canton's Typ catalogue is harvested + L-449-signed.
    zones: [],
});

/** A non-empty zone code for the refusal envelope: the real municipal code, else the local abbr, else the source tag. */
export function chZoneCodeFor(zone: ChZoneIdentification | null | undefined): string {
    const code = zone?.typKommunalCode?.trim();
    if (code) return code;
    const abbr = zone?.bemerkungen?.trim();
    if (abbr) return abbr;
    return CH_ZONING_FALLBACK_ZONE_CODE;
}

/** A human zone label for logs/derivation (e.g. `Wohnzone (W2)`), or a stable fallback. */
export function chZoneLabelFor(zone: ChZoneIdentification | null | undefined): string {
    const label = zone?.typKommunalBezeichnung?.trim();
    const abbr = zone?.bemerkungen?.trim();
    if (label && abbr) return `${label} (${abbr})`;
    if (label) return label;
    if (abbr) return abbr;
    return 'Swiss Grundnutzung zone';
}

/** Build the `knownFacts` lines that make an identified zone LEGIBLE on the refusal card (L-553). */
function chZoneFacts(zone: ChZoneIdentification | null | undefined): string[] {
    if (!zone) return [];
    const facts: string[] = [];
    const zoneLine = chZoneLabelFor(zone);
    facts.push(`Zone: ${zoneLine}`);
    if (zone.typKommunalCode) facts.push(`Zone code (typ_kommunal): ${zone.typKommunalCode}`);
    if (zone.hauptnutzungBezeichnung) {
        facts.push(
            `Main use: ${zone.hauptnutzungBezeichnung}` +
                (zone.hauptnutzungCode ? ` (${zone.hauptnutzungCode})` : ''),
        );
    }
    if (zone.kanton) facts.push(`Canton: ${zone.kanton}`);
    if (zone.rechtsstatus) facts.push(`Legal status: ${zone.rechtsstatus}`);
    return facts;
}

/**
 * The Swiss buildable-envelope REFUSAL — the current shipping output for a Swiss parcel.
 *
 * ⚠ THIS, NOT A NUMBER, IS WHAT A SWISS PARCEL GETS. The zone is identified (and carried in
 * `knownFacts` so the user sees their real zone), but density and height are model+PDF-bound and not
 * published as structured WFS attributes, so PRYZM declines to draw a buildable envelope rather than
 * fabricate a Nutzungsziffer or a Gebäudehöhe.
 *
 * `code: 'source-data-unavailable'` — the precise class: the zone (and the law behind it) is known;
 * what is missing is a STRUCTURED density/height for this parcel, which is a statement about the
 * available data path (the WFS does not publish it; the canton catalogue is not yet harvested), not
 * about the ordinance. Hence `legallyGrounded: false`. `ordinanceRef` cites the WFS + INTERLIS model
 * for the one claim we DO make (that the zone is published and the numbers are not), never for a number.
 *
 * @param zone        the identified zone (its fields become `knownFacts`); null on a WFS miss.
 * @param extraFacts  additional per-parcel facts the caller holds (address, area, coordinates).
 */
export function chZoningEnvelopeRefusal(
    zone: ChZoneIdentification | null | undefined = null,
    extraFacts: readonly string[] = [],
): EnvelopeRefusal {
    const identified = zone != null;
    return {
        code: 'source-data-unavailable',
        headline: identified
            ? `Zone identified (${chZoneLabelFor(zone)}) — but no structured density or height is published for it.`
            : 'Switzerland — the buildable envelope could not be resolved for this parcel.',
        detail:
            'PRYZM reads the Swiss zone from the national Nutzungsplanung WFS (geodienste.ch ' +
            'ms:grundnutzung), which publishes the zone identity but NOT its density (Nutzungsziffer) ' +
            'or height/floors. The Nutzungsziffer is an optional slot of the federal INTERLIS model ' +
            'the national WFS does not surface — recoverable only by harvesting the canton’s Typ ' +
            'catalogue — and the max height/floor count are not modelled at all (cantonal Baureglement ' +
            'PDF). Rather than fabricate a density or a height, PRYZM declines to draw a buildable ' +
            'envelope: the zone is shown, no number is shown, because none can be cited yet.',
        ordinanceRef: CH_ZONING_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...chZoneFacts(zone), ...extraFacts],
    };
}
