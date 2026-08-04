// LAS TORRES DE COTILLAS (INE 30038, Región de Murcia) — §RESEARCH-PENDING, not §L-449. No
// rulepack and no working parcel-level zone resolver exist for Las Torres de Cotillas today.
//
// WHAT THE 2026-08-04 CAPABILITY PASS FOUND (full record: `docs/04-reference/jurisdictions/es/
// es-mc/30038-las-torres-de-cotillas/findings/CAPABILITY-RESEARCH-2026-08-04.md`):
//   • The PGMOU consolidated text is CARM-approved, non-annulled — no judicial nullity found,
//     unlike Cartagena's 2012 revision. A base zone-code system (UE/UZE at minimum, plus numbered
//     UZS-AE-* sectors) is confirmed real from the municipal technical-criteria PDF.
//   • A genuine parcel-level zoning digitization EXISTS — proving the PGMOU has been digitized to
//     parcel granularity — but it lives inside a commercial third-party SaaS, VisualUrb
//     (`api-sig.visualurb.es`). The municipality-metadata endpoint
//     (`GET /urbanismo/municipio/30038`) answers with no auth required, confirming the platform is
//     wired to this exact municipality; every PARCEL-level endpoint
//     (`/Urbanismo/parcela/calificacion`, `/clasificacion`, `/normativa`, `/datosurbanisticos`)
//     returns HTTP 401 without credentials. VisualUrb's disclosed pricing is a €121/report manual
//     purchase product — no bulk/dev API is disclosed, and licensing terms are unknown.
//   • The municipal `urbanismo-normativa` page itself has ZERO GIS/viewer presence — it is a pure
//     PDF document directory (`sedelectronica.es` transparency portal). The one load-bearing
//     technical-criteria PDF (Art. 203, UE/UZE setback numbers) returned corrupted/binary to
//     automated fetch, so no numeric setback figure is confirmed — only the zone-code labels.
//
// ⇒ This is a genuine commercial-licensing/payment blocker for the parcel→zone digitization, and
// a PDF-extraction blocker for the numeric ordinance parameters. Neither is PRYZM's to bypass:
// per the task's own discipline, a paid third-party API without a disclosed bulk licence is not
// something to circumvent. Las Torres de Cotillas ships NO resolver and NO pack; every parcel
// gets a cited refusal naming the SPECIFIC commercial-licensing blocker.
//
// PURITY: L2-pure. No I/O, no THREE, no DOM, no clock.

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { researchPendingRefusal } from './researchPendingRefusal.js';

export const LAS_TORRES_DE_COTILLAS_JURISDICTION_ID = 'es-30038-las-torres-de-cotillas';

/**
 * ⛔ `false`, and NOT SIGNABLE AT ALL today — the same THIRD-kind gate `MALAGA_ENVELOPE_VERIFIED`/
 * `GRANADA_ENVELOPE_VERIFIED` carry: no rulepack exists, so there is nothing to sign.
 */
export const LAS_TORRES_DE_COTILLAS_ENVELOPE_VERIFIED: boolean = false;

const LAS_TORRES_DE_COTILLAS_RESEARCH_REF =
    'docs/04-reference/jurisdictions/es/es-mc/30038-las-torres-de-cotillas/findings/' +
    'CAPABILITY-RESEARCH-2026-08-04.md';

/** A cited "digitized but commercially gated" refusal for Las Torres de Cotillas. */
export function lasTorresDeCotillasResearchPendingRefusal(): EnvelopeRefusal {
    return researchPendingRefusal({
        displayName: 'Las Torres de Cotillas',
        rootBlocker:
            'A real parcel-level zoning digitization exists, confirmed wired to this exact ' +
            'municipality (`api-sig.visualurb.es/urbanismo/municipio/30038` answers with no auth ' +
            'required), but it is a commercial third-party SaaS (VisualUrb): every parcel-level ' +
            'endpoint returns HTTP 401 without credentials, and VisualUrb\'s only disclosed ' +
            'pricing is a manual €121-per-report retail product, not a bulk/programmatic licence. ' +
            'Separately, the one municipal PDF that would carry the UE/UZE setback figures (Art. ' +
            '203) returned corrupted/binary to automated text extraction, so no numeric ordinance ' +
            'parameter is confirmed — only the zone-code labels (UE, UZE, UZS-AE-*) are. PRYZM ' +
            'will not circumvent a paid, credentialed third-party service to obtain this data.',
        auditRef: LAS_TORRES_DE_COTILLAS_RESEARCH_REF,
    });
}
