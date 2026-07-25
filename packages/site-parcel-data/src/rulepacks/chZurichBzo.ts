// SWITZERLAND / canton Zürich — the Stadt Zürich BZO pack: a MUNICIPAL zone-ID DECLARATION with a
// cited envelope REFUSAL naming the exact per-parcel BZO document. Madrid/Córdoba shape (a registered
// jurisdiction that refuses numbers honestly), one notch richer than the national CH pack.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE HONEST SPLIT (ZURICH-BZO-PROBE.md §2–§3 — Outcome B, confirmed at CITY granularity)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The City of Zürich BZO WFS (`ogd.stadt-zuerich.ch/.../bzo_zone_v`) publishes the **zone IDENTITY**
// as real structured data (`resolveZurichBzoZone`): the municipal code (`typ`, e.g. `W2bIII`/`Z5`),
// legal status, AND a DIRECT link to this parcel's governing ordinance (`rechtsvorschrift_url` →
// BZO 700.100 on oerebdocs.zh.ch). That is a genuine `structured`-confidence win, and finer than the
// national `ms:grundnutzung` (which for many cantons carries a null `dokument`).
//
// The buildable **ENVELOPE**, however, is a cited REFUSAL: the `Ausnützungsziffer` (AZ), max
// `Gebäudehöhe` and `Vollgeschosse` are ALL absent from the WFS — `DescribeFeatureType` for
// `bzo_zone_v` AND for `bzo_zone_erhoehte_az_v` carry NO numeric field. Those live in the BZO 700.100
// Bauordnung table, keyed by the `typ` code — recoverable only by a HUMAN-VERIFIED transcription of
// that article table (the L-449 gate, `CH_FAR_CERTIFIED`, still OFF). So the honest output for a
// Zürich parcel is: **render the richer zone identity + name its ordinance; refuse the envelope** —
// never a fabricated number (C58 §1.4; the §CONTEXT-DATA-HONESTY family: a REFUSAL and a FABRICATION
// must not collapse).
//
// This pack therefore mirrors `esMadridNZ1.ts` / `chZoning.ts`: a DECLARATION whose every numeric
// field is `null`, and a `zurichBzoEnvelopeRefusal` that carries the identified zone (and its
// per-parcel ordinance link) as `knownFacts` while stating, cited, why no envelope is drawn.
//
// PURE + deterministic (C58 §1.1/§1.9). Strategic context — ZURICH-BZO-PROBE §0/§2/§3,
// ch/RATE-IMPLEMENTATION-PLAN.md §Phase 2, C58 §1.2/§1.4/§1.5/§2.2.

import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type EnvelopeRefusal,
} from '@pryzm/schemas';
import type { ZurichBzoZoneIdentification } from '../providers/zurichBzoProvider.js';

/** The jurisdiction id the Zürich-city registration + records use (BFS-Nr 261, canton ZH). */
export const CH_ZURICH_JURISDICTION_ID = 'ch-zh-zurich-bzo';

/**
 * The zone code the refusal envelope carries when NO live `typ` is available (the WFS miss /
 * unreachable case). `zoneCode` is required (min length 1); this names the source, not a zone, and no
 * number rides on it. When a zone IS identified, `zurichBzoZoneCodeFor` returns the real `typ` instead.
 */
export const CH_ZURICH_BZO_FALLBACK_ZONE_CODE = 'ch-zh-bzo';

/** The governing citation carried on the refusal — cites the DATA source and the ORDINANCE, never a number. */
export const CH_ZURICH_BZO_ORDINANCE_REF =
    'Zone identified from the City of Zürich BZO (Bau- und Zonenordnung) WFS ' +
    '(ogd.stadt-zuerich.ch/wfs/geoportal/Nutzungsplanung___kommunale_Bau__und_Zonenordnung__BZO_, ' +
    'layer bzo_zone_v, EPSG:2056, verified live 2026-07-25). The Ausnützungsziffer (AZ), max ' +
    'Gebäudehöhe and Vollgeschosse are NOT published as structured WFS attributes (DescribeFeatureType ' +
    'for bzo_zone_v and bzo_zone_erhoehte_az_v carry no numeric field) — they are stated in the ' +
    'BZO 700.100 Bauordnung der Stadt Zürich (BZO 2016), keyed by the zone code, and require a ' +
    'human-verified transcription of that article table (L-449). See ZURICH-BZO-PROBE.md §2–§3.';

/**
 * The Stadt Zürich BZO pack — a DECLARATION. Every numeric envelope field is `null`, on purpose: the
 * WFS publishes the zone identity, not its AZ/height. `defaultConfidence: 'estimated-ruleset'` because
 * a pack cannot self-certify (the zone-ID earns `structured` at the PROVIDER, not here), and the
 * envelope is refused rather than solved. Parsed at load so a shape error fails fast (like every pack).
 */
export const CH_ZURICH_BZO_PACK: JurisdictionZoningContract = JurisdictionZoningContractSchema.parse({
    jurisdictionId: CH_ZURICH_JURISDICTION_ID,
    displayName: 'Switzerland — City of Zürich BZO (zone identification)',
    source: 'oereb',
    crs: 'EPSG:2056', // the city BZO WFS publishes in LV95 / CH1903+ (informational; we work scene-XZ).
    lastReviewed: '2026-07-25',
    defaultConfidence: 'estimated-ruleset',
    // No zones: the zone is resolved LIVE per parcel from the WFS, and its envelope refuses. There is
    // no per-code numeric pack to author until the BZO 700.100 AZ table is transcribed + L-449-signed.
    zones: [],
});

/** A non-empty zone code for the refusal envelope: the real municipal `typ`, else the source tag. */
export function zurichBzoZoneCodeFor(zone: ZurichBzoZoneIdentification | null | undefined): string {
    const code = zone?.typ?.trim();
    if (code) return code;
    return CH_ZURICH_BZO_FALLBACK_ZONE_CODE;
}

/** A human zone label for logs/derivation (e.g. `BZO zone W2bIII`), or a stable fallback. */
export function zurichBzoZoneLabelFor(zone: ZurichBzoZoneIdentification | null | undefined): string {
    const code = zone?.typ?.trim();
    if (code) return `BZO zone ${code}`;
    return 'City of Zürich BZO zone';
}

/** Build the `knownFacts` lines that make an identified BZO zone LEGIBLE on the refusal card (L-553). */
function zurichBzoZoneFacts(zone: ZurichBzoZoneIdentification | null | undefined): string[] {
    if (!zone) return [];
    const facts: string[] = [];
    facts.push(`Zone: ${zurichBzoZoneLabelFor(zone)}`);
    if (zone.typ) facts.push(`BZO zone code (typ): ${zone.typ}`);
    if (zone.rechtsstatus) facts.push(`Legal status: ${zone.rechtsstatus}`);
    facts.push('Municipality: Zürich (BFS-Nr 261), canton ZH');
    if (zone.rechtsvorschriftUrl) facts.push(`Governing ordinance (BZO 700.100): ${zone.rechtsvorschriftUrl}`);
    return facts;
}

/**
 * The Zürich BZO buildable-envelope REFUSAL — the current shipping output for a City-of-Zürich parcel
 * once the `/api/ch/zurich-bzo` proxy is wired (until then the CH path falls through to the national
 * refusal; both are honest).
 *
 * ⚠ THIS, NOT A NUMBER, IS WHAT A ZÜRICH PARCEL GETS. The zone is identified — richer than the
 * national resolver (municipal `typ` code + a DIRECT link to this parcel's BZO ordinance, both carried
 * in `knownFacts` so the user sees them) — but the Ausnützungsziffer and max height are PDF-bound in
 * BZO 700.100 and not published as structured WFS attributes, so PRYZM declines to draw a buildable
 * envelope rather than fabricate an AZ or a Gebäudehöhe.
 *
 * `code: 'source-data-unavailable'` — the precise class: the zone (and the ordinance behind it) is
 * known; what is missing is a STRUCTURED density/height for this parcel (the WFS does not publish it;
 * the BZO table is not yet transcribed + verified), a statement about the available data path, not
 * about the ordinance. Hence `legallyGrounded: false`.
 *
 * @param zone        the identified BZO zone (its fields become `knownFacts`); null on a WFS miss.
 * @param extraFacts  additional per-parcel facts the caller holds (address, area, coordinates).
 */
export function zurichBzoEnvelopeRefusal(
    zone: ZurichBzoZoneIdentification | null | undefined = null,
    extraFacts: readonly string[] = [],
): EnvelopeRefusal {
    const identified = zone != null && (zone.typ != null || zone.rechtsvorschriftUrl != null);
    return {
        code: 'source-data-unavailable',
        headline: identified
            ? `Zürich BZO zone identified (${zurichBzoZoneLabelFor(zone)}) — but no structured Ausnützungsziffer or height is published for it.`
            : 'City of Zürich — the buildable envelope could not be resolved for this parcel.',
        detail:
            'PRYZM reads the Zürich zone from the City of Zürich BZO WFS (ogd.stadt-zuerich.ch ' +
            'bzo_zone_v), which publishes the zone code and a direct link to the governing BZO ' +
            'ordinance but NOT its density (Ausnützungsziffer) or height/Vollgeschosse. Those are ' +
            'stated in the BZO 700.100 Bauordnung der Stadt Zürich, keyed by the zone code, and are ' +
            'not exposed as structured WFS attributes (verified against DescribeFeatureType). Rather ' +
            'than fabricate an AZ or a height, PRYZM declines to draw a buildable envelope: the zone ' +
            'and its ordinance are shown, no number is shown, because none can be cited yet.',
        ordinanceRef: CH_ZURICH_BZO_ORDINANCE_REF,
        legallyGrounded: false,
        knownFacts: [...zurichBzoZoneFacts(zone), ...extraFacts],
    };
}
