// ALCANTARILLA (INE 30005, Región de Murcia) — the CITED-REFUSAL jurisdiction, on Cartagena's
// structural-refusal precedent, one tier EARLIER: PRYZM can name a resolved COARSE land-use class
// (from CARM's live regional WFS), but holds ZERO ordinance numbers — no rulepack exists at all.
//
// WHAT PRYZM CAN AND CANNOT SAY ABOUT AN ALCANTARILLA PARCEL TODAY (measured 2026-08-04, full
// record `docs/04-reference/jurisdictions/es/es-mc/30005-alcantarilla/findings/
// CAPABILITY-RESEARCH-2026-08-04.md`):
//
// CAN — the COARSE HILUCS-classified land-use polygon covering the point, from CARM's own live
// regional WFS (`mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/ows`, layer
// `sitmurcia_plu_ze`) — `resolveAlcantarillaLanduse.ts`. CONFIRMED live: 100 real MultiPolygon
// features for `Municipio='Alcantarilla'`, dated to 1984 (consistent with the 1983 PGOU's own BORM
// publication date).
//
// CANNOT — a fine zone code, or ANY numeric ordinance parameter (height, FAR, coverage, setback).
// The operative 1983 PGOU's two source documents (`Normas Urbanísticas PGOU 1983`, `Ordenanza
// Municipal sobre Edificación y Uso del Suelo AD 21/12/83`) are hosted exclusively as
// `aytoalc.sharepoint.com` "anyone with the link" shares that return HTTP 403 to every automated
// fetch attempt — a genuine, reproducible technical blocker, not a failed search. No independent
// mirror or secondary source quoting the actual numbers was found either. CARM's own WFS layer is
// explicitly non-binding and does not carry those numbers even if the SharePoint block cleared:
// its metadata states the source was digitized at 1:5000 from paper, "informational... not
// binding for the resolution of administrative procedures."
//
// ⇒ THE HONEST OUTPUT IS A CITED REFUSAL for every Alcantarilla parcel — LAND-USE-CLASS-NAMED when
// the live WFS resolves a feature at the point — because `ALCANTARILLA_ENVELOPE_VERIFIED` is
// `false` AND unsignable: there is no transcription to sign at all (the SharePoint 403 blocks the
// numbers from ever being read, let alone verified).
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock. A refusal is data.
//
// Strategic context — `providers/resolveAlcantarillaLanduse.ts`, `providers/alcantarillaBbox.ts`,
// `esCartagena.ts` (the structural-refusal precedent this mirrors, one research stage further
// along), `researchPendingRefusal.ts` (the vocabulary this pack's refusal borrows the shape of).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.zoning');

/** The jurisdiction id Alcantarilla records and registrations use. */
export const ALCANTARILLA_JURISDICTION_ID = 'es-30005-alcantarilla';

/**
 * ⛔ `false`, and NOT SIGNABLE AT ALL today — the same third kind of gate `MALAGA_ENVELOPE_VERIFIED`
 * / `GRANADA_ENVELOPE_VERIFIED` carry: there is no rulepack, no transcription, nothing to sign.
 * The SharePoint 403 blocks the numeric source documents from ever being READ, which is a
 * precondition of transcribing them at all.
 */
export const ALCANTARILLA_ENVELOPE_VERIFIED: boolean = false;

const ALCANTARILLA_RESEARCH_REF =
    'docs/04-reference/jurisdictions/es/es-mc/30005-alcantarilla/findings/' +
    'CAPABILITY-RESEARCH-2026-08-04.md';

/**
 * The registry `noRulePackRefusal` / the L5 dispatch's per-parcel card: the HONEST, LAND-USE-
 * CLASS-NAMED-WHEN-RESOLVED refusal for EVERY Alcantarilla parcel. Mirrors
 * `cartagenaNoRulePackRefusal`'s discipline one stage earlier: a card that asserted a zone/
 * parameter it does not have would overstate PRYZM's own knowledge; a card that spoke generically
 * even when the coarse WFS DID resolve a feature would understate it.
 *
 * `landuseProperties` carries whatever attributes CARM's WFS returned for the covering feature —
 * never re-keyed onto an assumed field name, since the layer's exact schema was not exhaustively
 * confirmed (see `resolveAlcantarillaLanduse.ts`).
 *
 * PURE; never throws. OTel span `pryzm.zoning.alcantarillaNoRulePackRefusal` (P8 / C58 §1.10).
 */
export function alcantarillaNoRulePackRefusal(
    landuseProperties?: Readonly<Record<string, unknown>> | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.alcantarillaNoRulePackRefusal');
    try {
        const resolved = landuseProperties != null && Object.keys(landuseProperties).length > 0;
        span.setAttribute('jurisdictionId', ALCANTARILLA_JURISDICTION_ID);
        span.setAttribute('landuseResolved', resolved);
        span.setAttribute('resultFields', 'no-rule-pack');
        span.setStatus({ code: SpanStatusCode.OK });

        const landuseFacts = resolved
            ? Object.entries(landuseProperties!)
                  .filter(([, v]) => v != null && v !== '')
                  .slice(0, 6)
                  .map(([k, v]) => `${k}: ${String(v)}`)
            : [];

        const refusal: Omit<EnvelopeRefusal, 'knownFacts'> = {
            code: 'no-rule-pack',
            headline: resolved
                ? 'Alcantarilla — PRYZM resolved a coarse land-use classification for your land ' +
                  "from the region's own live planning GIS, but holds no transcribed ordinance " +
                  'and will not publish a buildable envelope.'
                : 'Alcantarilla — PRYZM has identified this municipality but holds no transcribed ' +
                  'ordinance, so it will not publish a buildable figure.',
            detail:
                'PRYZM has not transcribed a buildable-envelope ruleset for Alcantarilla. The ' +
                "operative instrument (PGOU 1983) is confirmed current, and the region's own WFS " +
                '(mapas-gis-inter.carm.es/geoserver/SIT_USU_PLU_CARM/ows, layer sitmurcia_plu_ze) ' +
                'publishes a real, live, COARSE land-use classification for this municipality — but ' +
                'it is explicitly non-binding (CARM\'s own metadata: 1:5000-digitized from paper, ' +
                '"informational... not binding for the resolution of administrative procedures") ' +
                'and carries no zone code or numeric parameter. The two 1983 PGOU source documents ' +
                'that WOULD carry height/FAR/coverage/setback numbers (Normas Urbanísticas PGOU ' +
                '1983; Ordenanza Municipal sobre Edificación y Uso del Suelo, AD 21/12/83) are ' +
                'hosted exclusively on SharePoint share links that return HTTP 403 to every ' +
                'automated fetch attempt — a human must open them in an authenticated browser and ' +
                'transcribe the text before any number can be published here. No height, ' +
                'buildability, occupation or setback is published — never an estimate — until ' +
                'that transcription happens and a human signs off per PRYZM\'s L-449 discipline. ' +
                `See ${ALCANTARILLA_RESEARCH_REF} for the full record.`,
            ordinanceRef: null,
            legallyGrounded: false,
        };
        return { ...refusal, knownFacts: [...knownFacts, ...landuseFacts] };
    } finally {
        span.end();
    }
}
