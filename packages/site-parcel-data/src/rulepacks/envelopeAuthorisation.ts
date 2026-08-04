// §ENVELOPE-PUBLICATION-AUTHORISATION (L-665) — the ONE machine-readable statement of
// "may PRYZM publish a buildable envelope for this jurisdiction yet?"
//
// WHAT THIS IS, AND WHY IT IS NOT THE REGISTRY
// --------------------------------------------
// Two different questions were being answered by ONE table, and only one of them was ever asked:
//
//   • `registry.ts` `REGISTRATIONS` answers **ROUTING** — which pack, refusal vocabulary and
//     extent apply to a (jurisdiction, zone) pair. Registering a pack is a WIRING act.
//   • This module answers **AUTHORISATION** — whether a human has signed the transcription those
//     packs encode. Signing is a LEGAL act, and it is deliberately NOT a code change (each
//     `*_ENVELOPE_VERIFIED` constant lives beside the pack it governs, and flipping it is the
//     signature event recorded in that city's `sources/VERIFICATION.md`).
//
// "Registration wires routing; it does not authorise output" is written into three cities'
// `VERIFICATION.md` files. Until now it was true only of the L5 DISPATCHER, which checks the gate
// before it computes anything. Every OTHER consumer of the registry — starting with the
// answerability classifier — read `packsByZone` and concluded "we can answer here". That is how
// `classifyAnswerability('es-14021-cordoba', 'PAS-1')` came to return `full-envelope`: a claim no
// Córdoba parcel can honour, and one Córdoba has carried since the day it was registered.
//
// ⚠ THE FIX IS NEVER TO DE-REGISTER A PACK. De-registration would fix one city and re-open the
// same hole for the next gated one, and it would ALSO put out the C60 coverage globe (we DO answer
// in Córdoba — with an honest, cited refusal, which is an answer). The gate has to become
// something the ontology can READ.
//
// ⛔⛔ FAIL-CLOSED BY ABSENCE — CHANGED 2026-08-02. READ THIS BEFORE TOUCHING THE DEFAULT.
// ------------------------------------------------------------------------------------------
// THIS MODULE USED TO FAIL **OPEN**: `ENVELOPE_PUBLICATION_GATES.get(id) ?? true`. The reasoning
// was sound for the world it was written in — Barcelona, Denmark, Paris and the Netherlands owe no
// gate, and making absence mean "refused" would have silenced every jurisdiction that had shipped.
// The §TOTALITY test closed the obvious hole (a gate that exists but was never listed here).
//
// ⚠ WHAT THE TOTALITY TEST NEVER COVERED, AND WHY THE DEFAULT HAD TO INVERT. Totality scans for
// `*_ENVELOPE_VERIFIED` CONSTANTS. It therefore protects against *an unlisted gate*. It says
// nothing about *an unlisted JURISDICTION* — an id that reaches this function having never been
// considered by anyone. Under `?? true` such an id PUBLISHED.
//
// That was harmless only while the set of reachable jurisdiction ids was closed and hand-written.
// The moment the Barcelona hardcodes are parameterised on the INE code, the AMB layer's **36
// municipalities** become reachable, and 26 of them have no entry anywhere in this package. Under
// the old default they would not have been "unlocked" — they would have **PUBLISHED WITHOUT A
// GATE**. Of the nine confident-and-wrong patterns measured this week this is the ONLY one whose
// failure direction is OVER-GRANTING; every other has been safe-side.
//
// ⇒ THE DEFAULT IS NOW `false`. Authorisation requires the jurisdiction to be EXPLICITLY KNOWN,
//   in exactly one of two ways:
//     1. `ENVELOPE_PUBLICATION_GATES` — it declares a human-verification gate; the gate's own
//        constant decides. (Unchanged.)
//     2. `UNGATED_AUTHORISED_JURISDICTIONS` — it owes no gate, and the REASON is written down.
//   Anything else refuses with a named reason (`unknown-jurisdiction`), which is the honest answer
//   to "we have never assessed this place".
//
// ⚠ MEASURED BEFORE AND AFTER: **no shipped jurisdiction loses coverage.** All 16 registered
// jurisdictions are in one of the two tables, so every id that could reach this function before
// the change returns exactly what it returned before. The only behaviour that changes is for ids
// nobody had assessed — which never had authorisation to lose.
//
// ⚠ ADDING A JURISDICTION TO `UNGATED_AUTHORISED_JURISDICTIONS` IS A PUBLICATION DECISION. It is
// not a wiring convenience. The reason string is not decoration: it is the record of why no human
// signature is owed, and `envelopeAuthorisation.test.ts` asserts the set is exactly this list, so
// adding one is a stated act rather than an absorbed one.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// §GATE-KEYED-ON-THE-CORPUS (L-678, 2026-08-02) — ONE GATE CONSTANT MAY GOVERN MANY JURISDICTIONS.
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The paragraph above anticipated this exactly: *"the AMB layer's 36 municipalities become
// reachable, and 26 of them have no entry anywhere in this package."* They now have one. 31 new
// rows arrived from `esAmbMetropolitanCorpus.ts`, and they are gated by just TWO constants.
//
// ⭐ WHY A GATE MAY BE KEYED ON A CORPUS RATHER THAN A CITY. `BCN_REFOS_OV_CERTIFIED` / SIG-3
// already certifies a DATASET VINTAGE across the whole 36-municipality AMB Refós service — a
// corpus, not a city. Under that precedent, extending a corpus gate to another municipality is a
// SCOPING CHANGE, not a new legal instrument, and a human signing the PGM-1976 Normes Urbanístiques
// signs ONE document once rather than twenty-two times. So the VALUE is shared.
//
// ⚠⚠ THE MEMBERSHIP IS STILL ENUMERATED PER MUNICIPALITY, AND THAT IS THE FAIL-CLOSED PROPERTY.
// A blanket `'Catalunya' → true` would have been the easy edit and it is EXACTLY what Step 0 exists
// to prevent: an unassessed id must never inherit an assessed one's authorisation. Every gated id
// is a literal row in `AMB_ENVELOPE_GATE_ROUTING` carrying its own measured evidence, so a **37th
// AMB municipality nobody assessed is absent from that table, presents no id, and still refuses
// `unknown-jurisdiction`.** Signing the corpus opens 22 named places; it opens nothing else.
//
// ⚠ THE TABLE SHAPE CHANGED TO SAY WHICH CONSTANT GOVERNS WHICH ID. `ENVELOPE_PUBLICATION_GATES`
// keeps its `id → boolean` contract for every existing caller, but it is now PROJECTED from
// `GATE_DECLARATIONS` alongside `ENVELOPE_GATE_CONSTANT_BY_JURISDICTION` (`id → constant NAME`).
// The old §TOTALITY test compared `ENVELOPE_PUBLICATION_GATES.size` to the number of
// `*_ENVELOPE_VERIFIED` constants on disk, which was only ever a proxy for "every gate is
// represented" and is FALSE the moment one constant governs many ids. Projecting both maps from ONE
// literal lets totality assert the real property — every declared constant is NAMED here — without
// creating a second statement that can drift.
//
// PURITY: L2-pure (C58 §1.1/§1.9) — no I/O, no clock, no RNG. It reads compile-time constants.
//
// Strategic context — C58 §1.4/§1.13, C60 §2, L-449 (the human-verification gate), L-665.

import { trace } from '@opentelemetry/api';
import { BADALONA_ENVELOPE_VERIFIED, BADALONA_JURISDICTION_ID } from './esBadalona.js';
import { CATALUNYA_ENVELOPE_VERIFIED, CATALUNYA_JURISDICTION_ID } from './esCatalunya.js';
import { CANARIAS_ENVELOPE_VERIFIED, TELDE_JURISDICTION_ID } from './esCanariasSipu.js';
// §CANARIAS-88-REGISTRATION (2026-08-03) — the other 87 municipalities registered in registry.ts
// govern by the SAME gate as Telde: one signature question ("has PRYZM's SIPU EDIF reading been
// checked against the Normas Urbanísticas"), the same corpus-gate shape the AMB rows below use.
import {
    CANARIAS_ROUTABLE_MUNICIPAL_BBOXES,
    CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES,
} from '../providers/canariasMunicipalBboxes.js';
import { CORDOBA_ENVELOPE_VERIFIED } from './esCordobaZoneClassification.js';
import { CORDOBA_JURISDICTION_ID } from './esCordobaPGOU2001.js';
import { CORNELLA_ENVELOPE_VERIFIED, CORNELLA_JURISDICTION_ID } from './esCornella.js';
import { LHOSPITALET_ENVELOPE_VERIFIED, LHOSPITALET_JURISDICTION_ID } from './esLHospitalet.js';
import { MADRID_ENVELOPE_VERIFIED } from './esMadridPgoum97.js';
import { MADRID_JURISDICTION_ID } from './esMadridNZ1.js';
import { MURCIA_ENVELOPE_VERIFIED, MURCIA_JURISDICTION_ID } from './esMurciaEnvelope.js';
// ── ILLES BALEARS (L-680) — a LIVE-RESOLVED jurisdiction that still owes a gate. See the row below. ──
import { BALEARS_ENVELOPE_VERIFIED, BALEARS_JURISDICTION_ID } from './esBalearsMuib.js';
// §MADRID-SPACM-PORT (L-681) — the Comunidad de Madrid REGIONAL gate. ⚠ Distinct from
// `MADRID_ENVELOPE_VERIFIED` (the capital's PGOUM-97 gate): one signature must not open the other.
import { CM_SPACM_ENVELOPE_VERIFIED } from './esMadridSpacm.js';
import { SANT_BOI_ENVELOPE_VERIFIED, SANT_BOI_JURISDICTION_ID } from './esSantBoi.js';
// ⚠ VALÈNCIA — a gate of a THIRD kind. See the third group in the table below.
import { VALENCIA_ENVELOPE_VERIFIED, VALENCIA_JURISDICTION_ID } from './esValenciaEnvelope.js';
// ⚠ SEVILLA — same kind of gate as València: `zones` is empty by construction (no ordinance
// transcription exists at all yet), so registering it here stops the classifier failing open.
import { SEVILLA_ENVELOPE_VERIFIED, SEVILLA_JURISDICTION_ID } from './esSevilla.js';
// ⚠ MÁLAGA / GRANADA — the SAME third kind of gate as València/Sevilla, one step earlier: NO
// rulepack exists at all, so registering them here stops the classifier failing open on a
// jurisdiction that has an `isInX` dispatch branch but zero research behind it.
import { MALAGA_ENVELOPE_VERIFIED, MALAGA_JURISDICTION_ID } from './esMalaga.js';
import { GRANADA_ENVELOPE_VERIFIED, GRANADA_JURISDICTION_ID } from './esGranada.js';
import {
    HUESCA_ENVELOPE_VERIFIED,
    HUESCA_JURISDICTION_ID,
    ZARAGOZA_ENVELOPE_VERIFIED,
    ZARAGOZA_JURISDICTION_ID,
} from './esAragon.js';
// ⚠ EL SAUZAL — a real Ciudad Jardín (Título X Cap.3) ruleset is transcribed and cited, but NOT
// wired into registry.ts/siteDispatch.ts yet (see esElSauzal.ts header for why). Registered here
// regardless, so the classifier cannot fail open the day it IS wired.
import { EL_SAUZAL_ENVELOPE_VERIFIED, EL_SAUZAL_JURISDICTION_ID } from './esElSauzal.js';
// ── §GATE-KEYED-ON-THE-CORPUS — the two AMB corpus gates and the 31 ids they govern. ──
import {
    AMB_PGM_NNUU_ENVELOPE_VERIFIED,
    AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED,
    AMB_PGM_CORPUS_JURISDICTIONS,
    AMB_NO_CORPUS_JURISDICTIONS,
    ambAuthorisationIdForIne,
} from './esAmbMetropolitanCorpus.js';
import type { IneCode } from '../providers/esMunicipalCode.js';
// ── The UNGATED-BY-RECORD allowlist. Ids only; these packs declare no `*_ENVELOPE_VERIFIED`. ──
import { BCN_JURISDICTION_ID } from './esBarcelonaVolumetria18.js';
import { CH_JURISDICTION_ID } from './chZoning.js';
import { CORDOBA_MUNICIPAL_JURISDICTION_ID } from './esCordobaZoneClassification.js';
import { DK_PLANDATA_JURISDICTION_ID } from './dkPlandataEnvelope.js';
import { NL_JURISDICTION_ID } from './nlBestemmingsplan.js';
import { PARIS_JURISDICTION_ID } from './frParisPluBioclimatique.js';
import { SA_RIYADH_JURISDICTION_ID } from './saRiyadhDemo.js';

const tracer = trace.getTracer('pryzm.zoning.authorisation');

/**
 * ONE gate declaration: the constant's NAME, its CURRENT VALUE, and every jurisdiction it governs.
 *
 * ⚠ THE NAME IS CARRIED SO TOTALITY CAN BE CHECKED AGAINST DISK. Before 2026-08-02 the totality
 * test compared the gate table's SIZE to the number of `*_ENVELOPE_VERIFIED` constants found in
 * `src/rulepacks/`. That equality was a proxy, and it silently assumed one constant ⇒ one
 * jurisdiction. It stops being true the moment a gate is keyed on a CORPUS, so the name is now
 * stated and the test compares SETS instead of counts — a strictly stronger property.
 */
interface GateDeclaration {
    /** The exported constant's NAME, so `envelopeAuthorisation.test.ts` can match it on disk. */
    readonly gate: string;
    /** ⚠ READ from the constant. Never a literal — see the map docstring. */
    readonly value: boolean;
    /** Every jurisdiction id this ONE constant governs. Usually one; for a corpus gate, many. */
    readonly jurisdictions: readonly string[];
}

/**
 * Every human-verification gate in this package, with the jurisdictions each governs.
 *
 * ⚠ THE VALUES ARE READ FROM THE GATE CONSTANTS, NEVER RESTATED. Writing `false` here would create
 * a second statement of the signature that could drift from the one the dispatcher checks — the
 * L-422/457/467/469 failure family, restated at the authorisation seam. Signing a city means
 * flipping ITS constant, in ITS own file, next to the pack it governs; this table then follows with
 * no edit.
 *
 * ⚠ THE KEYS ARE JURISDICTION ID CONSTANTS, not literals, for the same reason.
 */
// §CANARIAS-88-REGISTRATION — every jurisdiction id `registry.ts` generates for the 87 non-Telde
// municipalities, derived from the SAME sourced bbox tables (never restated as a literal list, so
// the two cannot drift). Both the 41 routable and 46 multi-instrument municipalities owe the same
// signature question as Telde: the constant is `CANARIAS_ENVELOPE_VERIFIED` either way — a
// multi-instrument municipality's blocker is about WHICH plan governs, not a different signature.
const CANARIAS_OTHER_MUNICIPAL_JURISDICTION_IDS: readonly string[] = [
    ...CANARIAS_ROUTABLE_MUNICIPAL_BBOXES,
    ...CANARIAS_MULTI_INSTRUMENT_MUNICIPAL_BBOXES,
].map((m) => `es-${m.ine}-${m.jurisdictionSlug}`);

const GATE_DECLARATIONS: readonly GateDeclaration[] = Object.freeze([
    // ── Awaiting a signature on a transcription PRYZM already holds. ──
    { gate: 'MADRID_ENVELOPE_VERIFIED', value: MADRID_ENVELOPE_VERIFIED, jurisdictions: [MADRID_JURISDICTION_ID] },
    { gate: 'CORDOBA_ENVELOPE_VERIFIED', value: CORDOBA_ENVELOPE_VERIFIED, jurisdictions: [CORDOBA_JURISDICTION_ID] },
    { gate: 'MURCIA_ENVELOPE_VERIFIED', value: MURCIA_ENVELOPE_VERIFIED, jurisdictions: [MURCIA_JURISDICTION_ID] },
    // §MADRID-SPACM-PORT (L-681) — the Comunidad de Madrid REGIONAL corpus (`sitcm:VPLA_V_*`),
    // i.e. the 178 municipalities that are NOT the capital.
    //
    // ⚠⚠ `jurisdictions: []` — AND THAT IS THE HONEST ENTRY, NOT A PLACEHOLDER. There is no
    // registered `es-md-comunidad-madrid` jurisdiction to name yet: a rectangle CANNOT separate the
    // capital from its western neighbours, because their real municipal terms interleave (measured
    // 2026-08-02 from `Callejero:SIGI_V_MUNICIPIOS`: Madrid 28079 spans lon [-3.8890, -3.5181],
    // Boadilla 28022 spans [-3.9526, -3.8378] — a 4.35 km longitudinal OVERLAP). Registering it
    // would have broken `jurisdictionSpecificity`'s shipped "a registration's own centre resolves
    // to it" invariant and still not routed the proven parcel. See `esMadridSpacm.ts`
    // §CM-REGISTRATION-BLOCKED.
    //
    // ⇒ The gate is declared HERE ANYWAY, before the registration exists, so that the day someone
    // wires the polygon routing gate the authorisation classifier ALREADY fails closed for this
    // corpus. A gate that arrives after its jurisdiction is a gate that was briefly absent.
    { gate: 'CM_SPACM_ENVELOPE_VERIFIED', value: CM_SPACM_ENVELOPE_VERIFIED, jurisdictions: [] },
    // ── Awaiting a per-clau confirmation that Barcelona's numbers transfer (Envelope Phase 2). ──
    // ⚠ THESE FOUR ARE DELIBERATELY **NOT** FOLDED INTO THE AMB CORPUS GATE BELOW, even though all
    // four are measured PGM='S'. Each already owns a municipal signature question, and re-keying it
    // onto a shared constant would create two statements of one signature. Badalona is the case
    // that proves the corpus is not uniform — it rewrote Arts. 238/242/320/323/327/328/330/342/343/
    // 363 for its own territory, so a metropolitan-corpus signature must never reach its land.
    { gate: 'LHOSPITALET_ENVELOPE_VERIFIED', value: LHOSPITALET_ENVELOPE_VERIFIED, jurisdictions: [LHOSPITALET_JURISDICTION_ID] },
    { gate: 'BADALONA_ENVELOPE_VERIFIED', value: BADALONA_ENVELOPE_VERIFIED, jurisdictions: [BADALONA_JURISDICTION_ID] },
    { gate: 'SANT_BOI_ENVELOPE_VERIFIED', value: SANT_BOI_ENVELOPE_VERIFIED, jurisdictions: [SANT_BOI_JURISDICTION_ID] },
    { gate: 'CORNELLA_ENVELOPE_VERIFIED', value: CORNELLA_ENVELOPE_VERIFIED, jurisdictions: [CORNELLA_JURISDICTION_ID] },
    // ── ⚠ A THIRD KIND OF GATE: NOT awaiting a signature, and NOT signable at all. ──
    // Madrid/Córdoba/Murcia are `false` because a human has not yet signed a transcription PRYZM
    // HOLDS. València is `false` because there is NO NUMBER TO SIGN: the PGOU *Normas Urbanísticas*
    // (mayo 1991) were sourced, read and transcribed in full, and Arts. 6.18.2 / 6.19.1 / 6.25.1 /
    // 6.30.1 define the envelope as a function of a storey count and a depth graphed on **Plano C**,
    // which the city does not publish as data. `ES_VALENCIA_PGOU_PACK.zones` is EMPTY by
    // construction, so flipping this constant would authorise nothing — it would merely remove the
    // interlock that stops a later author packing a guessed Np and shipping it (L-616 mechanism-A).
    // ⇒ It is registered here so the classifier cannot FAIL OPEN on València, not so it can be signed.
    { gate: 'VALENCIA_ENVELOPE_VERIFIED', value: VALENCIA_ENVELOPE_VERIFIED, jurisdictions: [VALENCIA_JURISDICTION_ID] },
    // ⚠ SEVILLA — 2026-08-03: `ES_SEVILLA_PGOU_PACK.zones` now carries one transcribed zone (SB),
    // but this gate STILL authorises nothing: `SEVILLA_ENVELOPE_VERIFIED` is false and SB itself
    // hard-refuses at the geometry level regardless (`SEVILLA_SB_FONDO_UNRESOLVED_RING`). Declared
    // so the classifier cannot fail open on a registered jurisdiction with no gate declared.
    { gate: 'SEVILLA_ENVELOPE_VERIFIED', value: SEVILLA_ENVELOPE_VERIFIED, jurisdictions: [SEVILLA_JURISDICTION_ID] },
    // ⚠ MÁLAGA / GRANADA — 2026-08-04: NO rulepack exists for either (Málaga's zoning geometry is
    // Oracle-locked; Granada has zero research). Declared so the classifier cannot fail open on a
    // registered `isInX` branch with no gate behind it — the same discipline as València/Sevilla,
    // one research stage earlier.
    { gate: 'MALAGA_ENVELOPE_VERIFIED', value: MALAGA_ENVELOPE_VERIFIED, jurisdictions: [MALAGA_JURISDICTION_ID] },
    { gate: 'GRANADA_ENVELOPE_VERIFIED', value: GRANADA_ENVELOPE_VERIFIED, jurisdictions: [GRANADA_JURISDICTION_ID] },
    // ── ⚠ A FOURTH KIND, AND THE ONE MOST LIKELY TO BE MIS-SORTED: LIVE-RESOLVED, YET GATED. ──
    // §BALEARS-GATE (L-680). Balears looks like Denmark — the authority publishes the parameters as
    // machine-readable data, PRYZM transcribes NO ordinance, and `ES_BALEARS` has no static zone
    // table (`balearsResolvedPack()` builds a one-zone contract from the fetched fitxa). The
    // tempting move is therefore `UNGATED_AUTHORISED_JURISDICTIONS` on the Denmark precedent.
    //
    // ⛔ THAT WOULD BE THE SIGNATURE PERFORMED BY A SIDE DOOR, and the Denmark reason does not
    // transfer. Plandata.dk IS the determination register — the municipality's own binding plan,
    // published as the legal instrument. MUIB is a MAPPING PRODUCT that links to a normative fitxa,
    // and only **2.0 %** of fitxes cite the governing article on the parameter itself. So publishing
    // a fitxa cell as a determination asserts a relationship between that cell and the ordinance
    // that NOBODY HAS ESTABLISHED (`articleGovernance: 'NOT_ESTABLISHED'`, `supersession:
    // 'NOT_VERIFIED'` — `openTopIndicative.ts`). "PRYZM transcribes nothing" is necessary for the
    // ungated tier; it is not sufficient. The determination has to BE the published thing.
    //
    // ⇒ Balears owes a gate, the gate is SHUT, and listing it here is worth doing anyway: it moves
    // Balears from `unknown-jurisdiction` ("nobody has ever looked at this place") to `gate-shut`
    // ("a human has not signed") — the same delta the 31 AMB rows below buy. Both refuse; only one
    // is true. The genuinely productive unlock is `openTopIndicative.ts` + the renderer input it
    // names, NOT a signature here. See `BALEARS_ENVELOPE_VERIFIED`'s own docstring.
    { gate: 'BALEARS_ENVELOPE_VERIFIED', value: BALEARS_ENVELOPE_VERIFIED, jurisdictions: [BALEARS_JURISDICTION_ID] },
    // ── ARAGÓN. Both shut — but ⚠ AS OF §ZGZ-SUBGRADO THE TWO ARE NO LONGER THE SAME KIND, and
    //    the difference is worth keeping visible because it decides what actually unblocks each.
    //
    //    HUESCA is still the València kind: NOT waiting on a signature, because the missing thing
    //    is not a legal reading at all. Its ordinance is fully read and article-cited; what is
    //    missing is a GEOREFERENCE for the 1:1.000 plan sheet carrying the depth and storey count
    //    (rejected at 2.31 m median error, 1.9× vs a wrong-control offset, against a 3× bar).
    //    A signature cannot supply a coordinate.
    //
    //    ZARAGOZA HAS MOVED. This comment used to say the blocker was "the A1 subgrado attribute,
    //    which the city holds but does not serve" — measured false. `Calificaciones_Urbanas`
    //    serves all four article selectors and answers 200; it is simply unadvertised in WFS
    //    GetCapabilities, so a 28-name guess sweep and a capabilities census would BOTH have
    //    missed it. Zaragoza is therefore now the ORDINARY kind of shut gate: a real transcription
    //    (arts. 4.1.12/4.1.13/4.1.15/4.1.17 + the graphic fondo) that a human has not yet done and
    //    signed. That is a promotion, not an unlock.
    //
    // ⇒ Registered so the classifier cannot FAIL OPEN on either. Flipping either today would
    //   authorise nothing — neither has a zone table — and would only remove the interlock that
    //   stops a later author packing a guessed depth (the L-616 mechanism). See `esAragon.ts`.
    { gate: 'HUESCA_ENVELOPE_VERIFIED', value: HUESCA_ENVELOPE_VERIFIED, jurisdictions: [HUESCA_JURISDICTION_ID] },
    { gate: 'ZARAGOZA_ENVELOPE_VERIFIED', value: ZARAGOZA_ENVELOPE_VERIFIED, jurisdictions: [ZARAGOZA_JURISDICTION_ID] },
    // ── El Sauzal (INE 38041, Canarias) — a cited Ciudad Jardín ruleset exists (Título X Cap.3,
    //    Arts. 10.24-10.32), registered in registry.ts with its OWN bespoke entry (the Telde
    //    pattern) and excluded from the generic Canarias 86-municipality table
    //    (`canariasMunicipalBboxes.ts`) so `es-38041-el-sauzal` is claimed exactly once. Flipping
    //    this today would authorise nothing: the RE-ViUf ↔ Ciudad Jardín typology binding is an
    //    inference (see EL_SAUZAL_TYPOLOGY_BINDING_INFERENCE) and a per-area fichero override may
    //    exist unread — real, cited gaps, not a placeholder.
    { gate: 'EL_SAUZAL_ENVELOPE_VERIFIED', value: EL_SAUZAL_ENVELOPE_VERIFIED, jurisdictions: [EL_SAUZAL_JURISDICTION_ID] },
    // ── NOT waiting on a signature: there is nothing to sign (no Catalonia-wide instrument
    //    exists). Listed because the gate EXISTS and totality demands it — never because a
    //    signature would open it. See `esCatalunya.ts`: do not "fix" this by flipping it.
    { gate: 'CATALUNYA_ENVELOPE_VERIFIED', value: CATALUNYA_ENVELOPE_VERIFIED, jurisdictions: [CATALUNYA_JURISDICTION_ID] },
    // ── ⛔ SHUT, AND UNLIKE VALÈNCIA THERE IS PLENTY TO SIGN. Canarias' built-form parameters are
    //    PUBLISHED STRUCTURED DATA (SIPU 2.6.A `EDIF.mdb`, named numeric columns), so unlike
    //    Córdoba there is no OCR step to distrust and `ES_TELDE_PGO2003_PACK` carries 17 real
    //    zones. What is missing is that NOBODY HAS CHECKED THOSE COLUMNS against the *Normas
    //    Urbanísticas* they summarise, and the schema's dominant sentinel `'I'` has an UNKNOWN
    //    meaning region-wide. A signature is the only thing absent, and a pack may not write its
    //    own. ⚠ REGISTERED THE MOMENT TELDE WAS REGISTERED IN `registry.ts`: an unregistered
    //    `*_ENVELOPE_VERIFIED` FAILS OPEN, so a routed-but-ungated Telde would have the classifier
    //    promise a full envelope for a jurisdiction that refuses every parcel — strictly worse than
    //    not routing it at all.
    {
        gate: 'CANARIAS_ENVELOPE_VERIFIED',
        value: CANARIAS_ENVELOPE_VERIFIED,
        // Telde (its own bespoke pack) + all 87 other Canarias municipalities registered in
        // registry.ts (§CANARIAS-88-REGISTRATION, empty packs, cited refusal either way) — one
        // signature question, one constant, exactly the AMB corpus-gate shape below.
        jurisdictions: [TELDE_JURISDICTION_ID, ...CANARIAS_OTHER_MUNICIPAL_JURISDICTION_IDS],
    },

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // §GATE-KEYED-ON-THE-CORPUS (L-678) — THE 31 AMB MUNICIPALITIES, ALL SHUT, ALL UNSIGNED.
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⛔ THESE ARE THE ONLY TWO ROWS WHERE ONE CONSTANT GOVERNS MANY JURISDICTIONS, and it is a
    // decision, not a shortcut: a human signing the PGM-1976 Normes Urbanístiques signs ONE
    // document. The membership is still enumerated municipality by municipality in
    // `AMB_ENVELOPE_GATE_ROUTING`, each row carrying its own 2026-08-02 measurement, so an
    // unassessed municipality inherits nothing. ⛔ NEITHER CONSTANT MAY BE FLIPPED HERE — flipping
    // one is a legal act performed at its declaration, and neither has a recorded signature
    // (`l449CertificationGates.ts`, `signature: null`), so opening one turns §NO-UNSIGNED-OPEN-GATE
    // RED. What these rows buy is that all 31 now answer `gate-shut` — *"a human has not signed"* —
    // instead of `unknown-jurisdiction`, which claimed nobody had ever looked at municipalities the
    // cold-start probe had just measured at 3 000 parcels apiece.
    {
        gate: 'AMB_PGM_NNUU_ENVELOPE_VERIFIED',
        value: AMB_PGM_NNUU_ENVELOPE_VERIFIED,
        jurisdictions: AMB_PGM_CORPUS_JURISDICTIONS, // 22 — measured PGM='S', no municipal gate.
    },
    {
        gate: 'AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED',
        value: AMB_NO_HELD_CORPUS_ENVELOPE_VERIFIED,
        jurisdictions: AMB_NO_CORPUS_JURISDICTIONS, // 9 — measured PGM='N'; PRYZM holds no plan.
    },
]);

/**
 * Every jurisdiction that declares a human-verification gate, mapped to the gate's CURRENT state.
 *
 * ⚠ PROJECTED from `GATE_DECLARATIONS`, never hand-maintained — see the header §GATE-KEYED-ON-THE-
 * CORPUS. The `id → boolean` contract is unchanged for every existing caller.
 *
 * ⚠ THROWS at module load on a duplicate id, for the same reason `packMap()` in `registry.ts` does:
 * two gates claiming one jurisdiction is not a resolvable ambiguity — whichever the map ordering
 * kept would silently decide whose signature governs someone's land, and the loser would fail
 * nowhere. A load-time throw is the only failure mode that cannot be mistaken for a working gate.
 */
export const ENVELOPE_PUBLICATION_GATES: ReadonlyMap<string, boolean> = (() => {
    const m = new Map<string, boolean>();
    const claimedBy = new Map<string, string>();
    for (const d of GATE_DECLARATIONS) {
        for (const id of d.jurisdictions) {
            if (m.has(id)) {
                throw new Error(
                    `[site-parcel-data] duplicate publication gate for jurisdiction "${id}" ` +
                        `(${claimedBy.get(id)!} vs ${d.gate}). One jurisdiction, one signature.`,
                );
            }
            m.set(id, d.value);
            claimedBy.set(id, d.gate);
        }
    }
    return m;
})();

/**
 * Which gate CONSTANT governs each jurisdiction — `id → constant name`.
 *
 * ⚠ Projected from the SAME literal as `ENVELOPE_PUBLICATION_GATES`, so the two cannot disagree.
 * It exists so §TOTALITY can assert the real property ("every `*_ENVELOPE_VERIFIED` constant on
 * disk is named here") instead of the count proxy that broke when one constant came to govern 22
 * municipalities. It is also what a refusal card reads to name the signature it is waiting on.
 */
export const ENVELOPE_GATE_CONSTANT_BY_JURISDICTION: ReadonlyMap<string, string> = new Map(
    GATE_DECLARATIONS.flatMap((d) => d.jurisdictions.map((id) => [id, d.gate] as const)),
);

/** Every gate constant NAME this table reads. Derived — the totality test compares it to disk. */
export const ENVELOPE_GATE_CONSTANT_NAMES: readonly string[] = Object.freeze(
    GATE_DECLARATIONS.map((d) => d.gate),
);

/**
 * Jurisdictions that publish WITHOUT a human-verification gate, each with the reason none is owed.
 *
 * ⚠ THIS IS THE OTHER HALF OF THE FAIL-CLOSED DEFAULT. Before 2026-08-02 these were authorised by
 * ABSENCE, which is indistinguishable from "nobody has looked at this place". Making the reason
 * explicit is what lets the default invert without silencing anything that had shipped.
 *
 * ⚠ A jurisdiction belongs here ONLY when the authority publishes the governing determination as
 * DATA, so PRYZM transcribes no ordinance and there is nothing for a human to sign (the SIG-M2 /
 * ADR-0283 argument). If PRYZM transcribes a number, it owes a gate — put it in
 * `ENVELOPE_PUBLICATION_GATES` instead.
 */
export const UNGATED_AUTHORISED_JURISDICTIONS: ReadonlyMap<string, string> = new Map<string, string>([
    [
        BCN_JURISDICTION_ID,
        'Barcelona is the reference city. Its packs ship at `estimated-ruleset` under SIG-1/SIG-2/SIG-3/SIG-4 ' +
            '(docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/sources/VERIFICATION.md); the route-level ' +
            'gates it does owe are enforced at their own dispatch sites (e.g. BCN_REFOS_OV_CERTIFIED for clau 18), ' +
            'not at jurisdiction granularity.',
    ],
    [
        DK_PLANDATA_JURISDICTION_ID,
        'Denmark publishes the envelope determination itself through Plandata.dk as machine-readable data ' +
            '(maksbebyggelsesprocent / maks. bygningshoejde per plan). PRYZM transcribes no ordinance, so no ' +
            'signature is owed (L-449 SIGNED vs BR18).',
    ],
    [
        PARIS_JURISDICTION_ID,
        'Paris PLU bioclimatique: the route gate is FR_PARIS_PLU_CERTIFIED, enforced at its own dispatch site. ' +
            '⚠ That gate is currently OPEN AND UNSIGNED and is quarantined in `UNSIGNED_OPEN_GATES` ' +
            '(l449CertificationGates.ts). This entry authorises the JURISDICTION; it does not resolve that quarantine.',
    ],
    [
        NL_JURISDICTION_ID,
        'Netherlands bestemmingsplan: the route gate is NL_BESTEMMINGSPLAN_CERTIFIED, enforced at its own ' +
            'dispatch site. ⚠ Also OPEN AND UNSIGNED and quarantined in `UNSIGNED_OPEN_GATES`.',
    ],
    [
        CH_JURISDICTION_ID,
        'Switzerland national Grundnutzung: the route gate is CH_FAR_CERTIFIED, SIGNED 2026-07-26 by the repo ' +
            'owner (docs/04-reference/jurisdictions/ch/sources/VERIFICATION.md) and enforced at its own dispatch site.',
    ],
    [
        CORDOBA_MUNICIPAL_JURISDICTION_ID,
        'The Cordoba MUNICIPAL classification jurisdiction publishes refusals only — it carries no numeric ' +
            'envelope to authorise. The numeric pack is `es-14021-cordoba`, which IS gated and is `false`.',
    ],
    [
        SA_RIYADH_JURISDICTION_ID,
        'Riyadh is an explicit DEMO jurisdiction (saRiyadhDemo.ts), not a determination surface. It is listed ' +
            'so it cannot reach the unknown-jurisdiction refusal by accident, and it must never be cited as coverage.',
    ],
]);

/** Why `isEnvelopePublicationAuthorised` answered as it did — for refusal copy and for the span. */
export type EnvelopeAuthorisationReason =
    /** The jurisdiction declares a gate and it is OPEN. */
    | 'gate-open'
    /** The jurisdiction declares a gate and it is SHUT — a human signature is outstanding. */
    | 'gate-shut'
    /** The jurisdiction owes no gate, and the reason is recorded in `UNGATED_AUTHORISED_JURISDICTIONS`. */
    | 'ungated-by-record'
    /**
     * ⛔ THE FAIL-CLOSED PATH. This jurisdiction id appears in NEITHER table — nobody has assessed
     * it. It refuses. This is the honest answer, and before 2026-08-02 it silently PUBLISHED.
     */
    | 'unknown-jurisdiction';

/**
 * Whether PRYZM is authorised to PUBLISH A NUMERIC ENVELOPE for this jurisdiction, with the reason.
 *
 * ⛔ FAILS CLOSED. An id in neither table returns `authorised: false` / `unknown-jurisdiction`.
 *
 * ⚠ THIS IS NOT "DO WE COVER IT" AND NOT "IS THIS ZONE BUILDABLE". It is exclusively the
 * signature question. A `false` here says PRYZM's own verification is unfinished; it says nothing
 * whatsoever about the land or the ordinance, and a caller that renders it as a legal statement
 * has committed the §CONTEXT-DATA-HONESTY collapse this package keeps hitting (L-553).
 *
 * P8 — emits `pryzm.zoning.envelopePublicationAuthorisation`.
 */
export function envelopePublicationAuthorisation(jurisdictionId: string): {
    readonly authorised: boolean;
    readonly reason: EnvelopeAuthorisationReason;
} {
    const span = tracer.startSpan('pryzm.zoning.envelopePublicationAuthorisation');
    try {
        let result: { authorised: boolean; reason: EnvelopeAuthorisationReason };
        if (ENVELOPE_PUBLICATION_GATES.has(jurisdictionId)) {
            const open = ENVELOPE_PUBLICATION_GATES.get(jurisdictionId) === true;
            result = { authorised: open, reason: open ? 'gate-open' : 'gate-shut' };
        } else if (UNGATED_AUTHORISED_JURISDICTIONS.has(jurisdictionId)) {
            result = { authorised: true, reason: 'ungated-by-record' };
        } else {
            // ⛔ The inverted default. Never `true`.
            result = { authorised: false, reason: 'unknown-jurisdiction' };
        }
        span.setAttribute('jurisdictionId', jurisdictionId);
        span.setAttribute('authorised', result.authorised);
        span.setAttribute('reason', result.reason);
        return result;
    } finally {
        span.end();
    }
}

/**
 * Whether PRYZM is authorised to PUBLISH A NUMERIC ENVELOPE for this jurisdiction.
 *
 * ⛔ FAILS CLOSED as of 2026-08-02 — see the header. An unrecognised jurisdiction id REFUSES.
 * Use `envelopePublicationAuthorisation()` when you need the reason (e.g. for refusal copy).
 *
 * P8 — emits `pryzm.zoning.isEnvelopePublicationAuthorised`.
 */
export function isEnvelopePublicationAuthorised(jurisdictionId: string): boolean {
    const span = tracer.startSpan('pryzm.zoning.isEnvelopePublicationAuthorised');
    try {
        const { authorised, reason } = envelopePublicationAuthorisation(jurisdictionId);
        span.setAttribute('jurisdictionId', jurisdictionId);
        span.setAttribute('gated', ENVELOPE_PUBLICATION_GATES.has(jurisdictionId));
        span.setAttribute('authorised', authorised);
        span.setAttribute('reason', reason);
        return authorised;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §AMB-CORPUS-GATE — THE ROUTE FROM AN AMB `CODI_INE` TO AN AUTHORISATION ANSWER.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// ⚠ WHY THIS SEAM AND NOT THE DISPATCHER'S BBOX CHAIN. `siteDispatch.ts` peels municipalities off
// by `isInX(lat, lon)`, and there is no bbox module for 31 of the 36 — nor should there be one
// invented here, because the AMB Refós response ALREADY CARRIES the municipality: `CODI_INE` is a
// column on the layers this pipeline reads. The identity is a fact returned by the service, not a
// box a human drew, so the honest route into the gate is INE-keyed. Adding 31 hand-drawn boxes
// would be a second, drift-prone statement of a fact the data already answers.

/**
 * Whether PRYZM may publish a numeric envelope in the AMB municipality with this INE code.
 *
 * ⭐ THE ONE CALL that closes the L-678 gap. Given a `CODI_INE` read off an AMB Refós feature, it
 * answers with the SAME vocabulary every other jurisdiction uses, and it distinguishes the three
 * states that were previously collapsed into one:
 *   • `gate-shut`            — assessed, measured, and awaiting a HUMAN SIGNATURE (35 of 36 today).
 *   • `ungated-by-record`    — Barcelona, the one municipality that publishes.
 *   • `unknown-jurisdiction` — the AMB publishes nothing for this INE code; nobody assessed it.
 *
 * ⚠ `jurisdictionId` is `null` exactly when the answer is `unknown-jurisdiction`. It is an
 * ASSESSMENT identity, never a routing registration — `registry.ts` still registers six Catalan
 * jurisdictions, and this function grants nothing.
 *
 * PURE, total, never throws. P8 — emits `pryzm.zoning.ambEnvelopeAuthorisationForIne`.
 */
export function ambEnvelopeAuthorisationForIne(ine: IneCode): {
    readonly authorised: boolean;
    readonly reason: EnvelopeAuthorisationReason;
    readonly jurisdictionId: string | null;
} {
    const span = tracer.startSpan('pryzm.zoning.ambEnvelopeAuthorisationForIne');
    try {
        const jurisdictionId = ambAuthorisationIdForIne(ine);
        span.setAttribute('ineCode', ine as string);
        span.setAttribute('assessed', jurisdictionId !== null);
        if (jurisdictionId === null) {
            // ⛔ Outside the AMB Refós's 36. The fail-closed answer, and the correct one — this is
            // the state a 37th municipality lands in, and it must stay reachable.
            span.setAttribute('reason', 'unknown-jurisdiction');
            span.setAttribute('authorised', false);
            return { authorised: false, reason: 'unknown-jurisdiction', jurisdictionId: null };
        }
        const { authorised, reason } = envelopePublicationAuthorisation(jurisdictionId);
        span.setAttribute('jurisdictionId', jurisdictionId);
        span.setAttribute('authorised', authorised);
        span.setAttribute('reason', reason);
        return { authorised, reason, jurisdictionId };
    } finally {
        span.end();
    }
}
