// §L449-SIGNATURE-TOTALITY (L-677) — the ONE machine-readable answer to
// *"which human signature does this publication gate rest on, and does that signature EXIST?"*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS CLOSES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `MADRID_NZ1_CERTIFIED` shipped `= true` for a week and authorised the only Madrid envelope that
// rendered — 11.695 % of the city's Norma-Zonal-governed land. Its docstring attributed that to
// *"the L-608 sign-off, 2026-07-25"*. `git log -S` located the flip in ONE commit, `3e571724`,
// `Co-Authored-By: Claude Opus 4.8`, whose message explains only a COEF_Z parse. Madrid's
// `sources/VERIFICATION.md §3 "Signed off (legal)"` was — and is — EMPTY. **The gate cited as its
// authority the very commit that opened it, and the signatory was a machine.**
//
// L-449's whole content is that transcribing an ordinance is a LEGAL act and a pack cannot sign its
// own transcription. A model flipping its own publication gate is that rule's limiting case, and
// nothing in the repo could see it happen: `envelopeAuthorisation.ts` §TOTALITY scans
// `src/rulepacks/` for `*_ENVELOPE_VERIFIED`, and this gate is named `*_CERTIFIED` and lives in
// `src/providers/`. It was invisible to the guard by BOTH the directory and the naming convention.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS, AND WHAT IT IS NOT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It is NOT a second statement of whether publication is authorised — that is
// `envelopeAuthorisation.ts`, which answers *"may we publish for this JURISDICTION?"* and is read by
// the classifier. This registry answers a different, narrower question that nothing answered before:
// *"for each gate CONSTANT in this package, where is the human signature it claims, and is that
// signature retrievable?"* The two are deliberately separate, for the same reason
// `VERIFICATION.md` separates source-identity from legal sign-off: one is about coverage, the other
// is about custody of a signature.
//
// ⚠ THE `value` IS READ FROM THE CONSTANT, NEVER RESTATED. Writing `true`/`false` here would create a
// second statement of the signature that could drift from the one the dispatcher checks — the
// L-422/457/467/469 family at the signature seam. Flipping a gate means editing ITS constant, in ITS
// own file, beside the code it governs; this table then follows with no edit.
//
// ⚠ THE REGISTRY IS NOT THE AUTHORITY EITHER. `signature` records WHERE a signature is claimed to
// live. `l449CertificationGates.test.ts` is what checks the claim: it opens the named document and
// fails if the anchor is not in it. A citation nobody dereferences is how Madrid got here.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — no I/O, no clock, no RNG. It reads compile-time constants.
// ⚠ THE DOCTRINE THESE GATES ENFORCE is ADR-0283 ("Evidence-bounded publication", founder-signed
// 2026-08-02): dispatch a deterministic envelope ONLY where the applicable zoning geometry is
// directly supported by authoritative published data; partial publication authorises no inference
// beyond its demonstrated spatial extent, and outside it the answer is UNKNOWN. A gate is the
// mechanism by which that doctrine is enforced per jurisdiction.
//
// Strategic context — ADR-0283, C58 §1.4/§1.13, C63 §1.6, L-449, L-665, L-677.

import { trace } from '@opentelemetry/api';
import { BCN_REFOS_OV_CERTIFIED } from './providers/bcnRefosOVProvider.js';
import { CH_FAR_CERTIFIED } from './providers/resolveChFarFromCantonCatalogue.js';
import { MADRID_NZ1_CERTIFIED } from './providers/resolveMadridNZ1Ring.js';
import { NL_BESTEMMINGSPLAN_CERTIFIED } from './providers/resolveNlBestemmingsplan.js';
import {
    AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED,
    AMB_PGM_NNUU_ENVELOPE_VERIFIED,
} from './rulepacks/esAmbMetropolitanCorpus.js';
import { BADALONA_ENVELOPE_VERIFIED } from './rulepacks/esBadalona.js';
import { BALEARS_ENVELOPE_VERIFIED } from './rulepacks/esBalearsMuib.js';
import { CANARIAS_ENVELOPE_VERIFIED } from './rulepacks/esCanariasSipu.js';
import { CATALUNYA_ENVELOPE_VERIFIED } from './rulepacks/esCatalunya.js';
import { CORDOBA_ENVELOPE_VERIFIED } from './rulepacks/esCordobaZoneClassification.js';
// §MADRID-SPACM-PORT (L-681) — the Comunidad de Madrid REGIONAL gate. ⚠ Distinct from
// `MADRID_ENVELOPE_VERIFIED` (the capital's PGOUM-97 gate): different publisher, different corpus.
import { CM_SPACM_ENVELOPE_VERIFIED } from './rulepacks/esMadridSpacm.js';
import { CORNELLA_ENVELOPE_VERIFIED } from './rulepacks/esCornella.js';
import { LHOSPITALET_ENVELOPE_VERIFIED } from './rulepacks/esLHospitalet.js';
import { MADRID_ENVELOPE_VERIFIED } from './rulepacks/esMadridPgoum97.js';
import { MURCIA_ENVELOPE_VERIFIED } from './rulepacks/esMurciaEnvelope.js';
import { SANT_BOI_ENVELOPE_VERIFIED } from './rulepacks/esSantBoi.js';
import { VALENCIA_ENVELOPE_VERIFIED } from './rulepacks/esValenciaEnvelope.js';
import { HUESCA_ENVELOPE_VERIFIED, ZARAGOZA_ENVELOPE_VERIFIED } from './rulepacks/esAragon.js';
import { FR_PARIS_PLU_CERTIFIED } from './rulepacks/frParisPluBioclimatique.js';

const tracer = trace.getTracer('pryzm.zoning.l449');

/** Where a gate's human signature is recorded — a document plus an anchor the test dereferences. */
export interface L449SignatureRef {
    /** Repo-relative path to the `sources/VERIFICATION.md` (or equivalent) holding the signature. */
    readonly doc: string;
    /** A literal substring that must appear in `doc` — the signature block's own heading/marker. */
    readonly anchor: string;
}

export interface L449Gate {
    /** The exported constant's NAME, so the disk scan can match it. */
    readonly gate: string;
    /** Repo-relative path of the file that declares it (where a flip must be made). */
    readonly file: string;
    /** ⚠ READ from the constant. Never a literal — see the header. */
    readonly value: boolean;
    /**
     * The signature this gate rests on, or `null` when NO human signature is recorded for it.
     *
     * ⚠ `null` is NOT a synonym for "shut". A shut gate needs no signature (that is the honest
     * default). A gate that is `true` with `signature: null` is the Madrid defect, and it is only
     * tolerated at all while its name is in `UNSIGNED_OPEN_GATES` below.
     */
    readonly signature: L449SignatureRef | null;
}

/**
 * EVERY L-449 publication/certification gate constant in this package.
 *
 * TOTALITY IS ENFORCED FROM DISK, not from this list: the test scans `src/**` for every exported
 * `*_CERTIFIED` / `*_ENVELOPE_VERIFIED` constant and fails if one is missing here. Adding a gate and
 * forgetting to register it is a RED TEST, not a silent claim — which is precisely what
 * `MADRID_NZ1_CERTIFIED` was for a week, because the older guard scanned one directory and one
 * naming convention.
 */
export const L449_CERTIFICATION_GATES: readonly L449Gate[] = Object.freeze([
    // ── OPEN (`true`) and SIGNED — each anchor is dereferenced by the test. ──
    {
        gate: 'BCN_REFOS_OV_CERTIFIED',
        file: 'packages/site-parcel-data/src/providers/bcnRefosOVProvider.ts',
        value: BCN_REFOS_OV_CERTIFIED,
        signature: {
            doc: 'docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/sources/VERIFICATION.md',
            anchor: 'SIG-3',
        },
    },
    {
        gate: 'MURCIA_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esMurciaEnvelope.ts',
        value: MURCIA_ENVELOPE_VERIFIED,
        signature: {
            doc: 'docs/04-reference/jurisdictions/es/es-mc/30030-murcia/sources/VERIFICATION.md',
            anchor: 'SIG-MU1',
        },
    },
    {
        gate: 'CH_FAR_CERTIFIED',
        file: 'packages/site-parcel-data/src/providers/resolveChFarFromCantonCatalogue.ts',
        value: CH_FAR_CERTIFIED,
        signature: {
            doc: 'docs/04-reference/jurisdictions/ch/sources/VERIFICATION.md',
            anchor: 'SIGNED OFF 2026-07-26 by the repo owner',
        },
    },

    // ── ⛔ SHUT 2026-08-02 — these two WERE `true` with `signature: null`. §UNSIGNED-GATE-DEFAULTS-SHUT.
    //    They were the Madrid defect found twice more, and unlike Madrid they had already SHIPPED.
    //    Both now refuse with a CITED determination; neither draws. Reasoning is at each declaration.
    {
        gate: 'NL_BESTEMMINGSPLAN_CERTIFIED',
        file: 'packages/site-parcel-data/src/providers/resolveNlBestemmingsplan.ts',
        value: NL_BESTEMMINGSPLAN_CERTIFIED,
        signature: null,
    },
    {
        gate: 'FR_PARIS_PLU_CERTIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/frParisPluBioclimatique.ts',
        value: FR_PARIS_PLU_CERTIFIED,
        signature: null,
    },

    // ── SHUT (`false`) — a shut gate publishes nothing and owes no signature. Several name the
    //    signature they are WAITING for; that is a request, not a signature, so it stays `null`. ──
    {
        // ⭐ SIGNED 2026-08-02 (the founder), on Doctrine B — ADR-0283. This row is the whole point
        // of the module: the gate was OPEN for a week on a machine's self-attribution, is now open
        // on a signature the test below OPENS AND READS, and the difference is checkable in CI.
        gate: 'MADRID_NZ1_CERTIFIED',
        file: 'packages/site-parcel-data/src/providers/resolveMadridNZ1Ring.ts',
        value: MADRID_NZ1_CERTIFIED,
        signature: {
            doc: 'docs/04-reference/jurisdictions/es/es-md/28079-madrid/sources/VERIFICATION.md',
            anchor: 'SIG-M2 · ✍ SIGNED 2026-08-02',
        },
    },
    {
        // SIG-M1: the founder has stated the NARROWER text they would sign and asked for a targeted
        // review of the transcription FIRST (`extracted/SIG-M1-REVIEW-SAMPLE.md`). A stated
        // willingness to sign is NOT a signature, so this stays `null` and the gate stays shut —
        // the exact distinction this module exists to keep.
        gate: 'MADRID_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esMadridPgoum97.ts',
        value: MADRID_ENVELOPE_VERIFIED,
        signature: null,
    },
    {
        gate: 'CORDOBA_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esCordobaZoneClassification.ts',
        value: CORDOBA_ENVELOPE_VERIFIED,
        signature: {
            doc: 'docs/04-reference/jurisdictions/es/es-an/14021-cordoba/sources/VERIFICATION.md',
            anchor: 'SIG-1',
        },
    },
    {
        // §MADRID-SPACM-PORT (L-681) — the Comunidad de Madrid REGIONAL corpus, i.e. the 178
        // municipalities that are NOT the capital. ⚠ A SECOND, INDEPENDENT Madrid gate, and the
        // duplication is deliberate: `MADRID_ENVELOPE_VERIFIED` above governs PGOUM-97 in the
        // capital, read from `sigma.madrid.es`; this one governs `sitcm:VPLA_V_ORDENANZA` on
        // `idem.comunidad.madrid`. Different publisher, different corpus, different failure mode —
        // one signature must not be able to open the other.
        gate: 'CM_SPACM_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esMadridSpacm.ts',
        value: CM_SPACM_ENVELOPE_VERIFIED,
        signature: null, // Not requested yet — the adapter is proven, the transcription is unsigned.
    },
    {
        gate: 'VALENCIA_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esValenciaEnvelope.ts',
        value: VALENCIA_ENVELOPE_VERIFIED,
        signature: null, // Not signable at all: `zones` is empty by construction (L-676).
    },
    {
        gate: 'CATALUNYA_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esCatalunya.ts',
        value: CATALUNYA_ENVELOPE_VERIFIED,
        signature: null, // No Catalonia-wide instrument exists — do not "fix" by flipping.
    },
    {
        // ⛔ SHUT, and `signature: null` — the honest default under §UNSIGNED-GATE-DEFAULTS-SHUT.
        // Canarias' built-form parameters are PUBLISHED STRUCTURED DATA (SIPU 2.6.A `EDIF.mdb`),
        // so unlike Córdoba there is no OCR step to distrust — but nobody has checked those
        // columns against the *Normas Urbanísticas* they summarise, and the schema's dominant
        // sentinel `'I'` has an UNKNOWN meaning region-wide. A signature is the only thing
        // missing, and a signature is not something a pack may write for itself.
        gate: 'CANARIAS_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esCanariasSipu.ts',
        value: CANARIAS_ENVELOPE_VERIFIED,
        signature: null,
    },
    {
        gate: 'HUESCA_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esAragon.ts',
        value: HUESCA_ENVELOPE_VERIFIED,
        // ⚠ NOT signable today, and NOT for want of a reader. The ordinance is fully read and
        // article-cited (arts. 8.4.8 / 8.4.10). It remits the buildable depth and the storey
        // count to plano nº 5, a 1:1.000 sheet PROVEN to be vector CAD whose legend has been
        // bound — but which is NOT YET GEOREFERENCED (best candidate fix rejected: 2.31 m median
        // hold-out error, only 1.9× better than a deliberately wrong control offset, bar 3×).
        // A signature cannot supply a coordinate. What closes this is a georeference, not a
        // lawyer, and until then no line on the sheet may become a metre on the ground.
        signature: null,
    },
    {
        gate: 'ZARAGOZA_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esAragon.ts',
        value: ZARAGOZA_ENVELOPE_VERIFIED,
        // ⚠ NOT signable today either, and again not for want of a reader. The zoning is LIVE and
        // parcel-precise (9,031 calificación polygons, 100 % populated), and the articles are
        // published. ⚠ CORRECTED (§ZGZ-SUBGRADO): this row used to say the blocker was that the
        // polygon carries `A1` without its subgrado, evidenced by a 28-name typename sweep that
        // returned HTTP 400 on all 28. That evidence was worthless — HTTP 400 means UNKNOWN
        // TYPENAME, a fact about the guesses. `urbanismo:Calificaciones_Urbanas` serves all four
        // article selectors (A1/3.1, A1/3.2, A1/4.1, A1/4.2) over the same WFS and answers 200;
        // it is merely absent from GetCapabilities. So the gate is no longer waiting on DATA — it
        // is waiting on the TRANSCRIPTION of arts. 4.1.12/4.1.13/4.1.15/4.1.17 and on the
        // graphically-regulated fondo, which is exactly the kind of thing a signature covers.
        // ⇒ Still `false`, and now genuinely signable ONCE THE READING IS DONE. See `esAragon.ts`.
        signature: null,
    },
    {
        gate: 'LHOSPITALET_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esLHospitalet.ts',
        value: LHOSPITALET_ENVELOPE_VERIFIED,
        signature: null,
    },
    {
        gate: 'BADALONA_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esBadalona.ts',
        value: BADALONA_ENVELOPE_VERIFIED,
        signature: null,
    },
    {
        gate: 'SANT_BOI_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esSantBoi.ts',
        value: SANT_BOI_ENVELOPE_VERIFIED,
        signature: null,
    },
    {
        gate: 'CORNELLA_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esCornella.ts',
        value: CORNELLA_ENVELOPE_VERIFIED,
        signature: null,
    },
    {
        // §BALEARS-GATE (L-680) — the Illes Balears, wired end to end and SHUT.
        //
        // ⚠ IT IS NOT WAITING ON A TRANSCRIPTION. Unlike Madrid/Córdoba, PRYZM transcribes nothing
        // here: the parameters are read LIVE from the publisher's own normative fitxa at the point.
        // What is outstanding is the acceptance of a RELATIONSHIP — that a fitxa cell IS the
        // determination — which only 2.0 % of fitxes evidence by citing their own article.
        //
        // ⛔ AND A SIGNATURE HERE WOULD STILL NOT BE ENOUGH, WHICH IS WHY THIS ROW SHOULD PROBABLY
        // NEVER BE OPENED. Six constraint families are unmodelled (heritage, flood, airport,
        // coastal, environmental, the island PTIs) and each can only REDUCE the solid, so a Balears
        // envelope is an OPEN TOP (ADR-0293). The instrument that fits is `openTopIndicative.ts` —
        // draw, claim no right — and its blocker is a RENDERER input, not a signature.
        gate: 'BALEARS_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esBalearsMuib.ts',
        value: BALEARS_ENVELOPE_VERIFIED,
        signature: null,
    },

    // ── §GATE-KEYED-ON-THE-CORPUS (L-678, 2026-08-02) — THE FIRST TWO GATES WHOSE UNIT IS AN
    //    ORDINANCE CORPUS RATHER THAN A CITY. Both SHUT, both `signature: null`.
    //
    // ⭐ WHY A CORPUS MAY BE THE UNIT. `BCN_REFOS_OV_CERTIFIED` / SIG-3 already certifies a DATASET
    // VINTAGE across the whole 36-municipality AMB Refós — a corpus, not a city. Signing an
    // ordinance is reading ONE document; demanding twenty-two signatures for the same 1976 text
    // would be ceremony, not diligence. The membership is nonetheless enumerated per municipality
    // (`AMB_ENVELOPE_GATE_ROUTING`), so an unassessed 37th inherits nothing.
    //
    // ⛔ THESE TWO ARE THE HIGHEST-LEVERAGE UNSIGNED GATES IN THE REPO — one flip would authorise 22
    // municipalities at once. That is precisely why they arrive SHUT, with the signature slot empty
    // and this row already in place: the ROUTE is engineering and it is done; the OPENING is a legal
    // act reserved to a human (L-449), and §NO-UNSIGNED-OPEN-GATE turns RED if one is opened without
    // a dereferenceable signature recorded here.
    //
    // ⚠ WHAT A SIGNATURE ON `AMB_PGM_NNUU_ENVELOPE_VERIFIED` WOULD *NOT* BUY is written into
    // `esAmbMetropolitanCorpus.ts` §THE-CEILING and carried as data in `AMB_CORPUS_CEILINGS`:
    // per-municipality DELEGATION spanning 8.29 %–59.53 %; a deviation list that is non-official,
    // non-exhaustive and stale to 31-12-2009; ABSENT heritage/airport/flood/environmental
    // constraints (absent for Barcelona too, which IS published); and the unanswered LEGAL question
    // of whether Barcelona-scoped MPGM articles govern in the other 26 — which carries 42–65 % of
    // the envelope in Castelldefels, Pallejà, Sant Just Desvern and Sant Cugat.
    {
        gate: 'AMB_PGM_NNUU_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esAmbMetropolitanCorpus.ts',
        value: AMB_PGM_NNUU_ENVELOPE_VERIFIED,
        signature: null, // ⛔ 22 municipalities await ONE signature. None has been given.
    },
    {
        // NOT signable at all today, and the distinction matters: the 22 above wait on a signature
        // over a corpus PRYZM HOLDS; these 9 are measured PGM='N' and PRYZM holds NO governing text
        // for them. The route to opening them is ACQUIRING NINE MUNICIPAL PLANS, then registering
        // nine municipal gates — never flipping this. Same shape as `VALENCIA_ENVELOPE_VERIFIED`.
        gate: 'AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED',
        file: 'packages/site-parcel-data/src/rulepacks/esAmbMetropolitanCorpus.ts',
        value: AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED,
        signature: null,
    },
]);

/**
 * The FROZEN inventory of gates that are OPEN (`true`) while carrying NO recorded signature.
 *
 * ⚠ THIS IS A QUARANTINE, NOT A PERMISSION. Each entry is a live instance of the exact defect that
 * de-certified `MADRID_NZ1_CERTIFIED`, inventoried rather than silently tolerated — the same
 * technique as `packPublishedConfidenceUnchanged.test.ts`'s frozen manifest. The test asserts the
 * set of unsigned-open gates is EXACTLY this list, so:
 *   • a NEW gate opened without a signature is a RED TEST — the reintroduction the founder asked to
 *     be made impossible;
 *   • signing one of these, or shutting it, is also a red test until this list is updated, which
 *     forces the change to be stated rather than absorbed.
 *
 * Both entries were found by this guard on the day it was written (2026-08-01), while it was being
 * built for Madrid. Neither is Madrid's to resolve, and neither is flipped here: each may have a
 * defensible "the authority publishes the footprint AS GEOMETRY, so nothing is transcribed" argument
 * — exactly Madrid's SIG-M2 question. That argument has to be WRITTEN DOWN and answered, per city.
 *   • `NL_BESTEMMINGSPLAN_CERTIFIED` — `docs/04-reference/jurisdictions/nl/sources/VERIFICATION.md`
 *     reads `Verifier: UNASSIGNED · Status: OPEN`.
 *   • `FR_PARIS_PLU_CERTIFIED` — `docs/04-reference/jurisdictions/fr/sources/VERIFICATION.md` reads
 *     `Verifier: UNASSIGNED`, `this file is OPEN`. ⚠ Its docstring justifies itself with *"Same
 *     discipline as `MADRID_NZ1_CERTIFIED` / `NL_BESTEMMINGSPLAN_CERTIFIED` (both ON…)"* — i.e.
 *     Madrid's unattributed flip was ALREADY being cited as precedent by a third jurisdiction.
 */
/**
 * ⭐ EMPTY SINCE 2026-08-02 — and keeping it empty is now the invariant.
 *
 * Both former entries were SHUT rather than signed (§UNSIGNED-GATE-DEFAULTS-SHUT). The quarantine
 * existed to make an unsigned-open gate *visible* rather than tolerated; with it empty, the guard
 * below states the stronger property directly: NO GATE IS OPEN WITHOUT A RECORDED SIGNATURE.
 *
 * ⛔ An empty list is the CORRECT steady state. If a future gate lands here, that is a governance
 * defect being declared out loud — which is the point — but the fix is a signature or a shut, never
 * a longer list.
 */
export const UNSIGNED_OPEN_GATES: readonly string[] = Object.freeze([]);

/**
 * Whether this gate is OPEN on the strength of a RECORDED human signature.
 *
 * ⚠ IT IS NOT "MAY WE PUBLISH" — that is `isEnvelopePublicationAuthorised`. This answers only
 * *"is the reason this gate is open written down anywhere?"*, and `false` for an open gate is a
 * governance defect, never a statement about the land or the ordinance.
 *
 * P8 — emits `pryzm.zoning.isGateSignatureRecorded`.
 */
export function isGateSignatureRecorded(gateName: string): boolean {
    const span = tracer.startSpan('pryzm.zoning.isGateSignatureRecorded');
    try {
        const row = L449_CERTIFICATION_GATES.find((g) => g.gate === gateName);
        const recorded = row !== undefined && row.value === true && row.signature !== null;
        span.setAttribute('gate', gateName);
        span.setAttribute('known', row !== undefined);
        span.setAttribute('open', row?.value === true);
        span.setAttribute('signatureRecorded', recorded);
        return recorded;
    } finally {
        span.end();
    }
}
