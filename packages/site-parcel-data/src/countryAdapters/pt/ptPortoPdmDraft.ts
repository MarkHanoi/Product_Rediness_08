// LANE PT-ZONEID — PORTO (DTCC 1312) · the FIRST Portuguese rule-pack DRAFT, shape-as-data,
// UNCERTIFIED AND REFUSING. Mirrors `rulepacks/frParisPluBioclimatique.ts`'s
// `FR_PARIS_PLU_CERTIFIED` discipline (§UNSIGNED-GATE-DEFAULTS-SHUT, 2026-08-02): a pack whose
// numbers nobody has signed does not draw — it upgrades the REFUSAL.
//
// WHY A DRAFT EXISTS AT ALL (the extraction verdict, measured for this lane 2026-09-02):
// the Porto PDM Regulamento (*Plano Diretor Municipal — Regulamento — Janeiro 2023*,
// `pdm.cm-porto.pt/documents/121/Regulamento_PDMPorto.pdf`, HTTP 200, 1,641,985 B, 100 pp,
// text PDF, 319,459 chars extracted 2026-07-31) is STRUCTURED-WITH-CITATIONS in the repo:
// `docs/04-reference/jurisdictions/pt/sources/SOURCES.md` §A.0.3 is a per-value, per-article
// table at `VERIFIED-PRIMARY`, including the Art. 3.º definitions verbatim. That clears the
// "prose-only → refuse this half" bar the lane brief set. Every value below carries its §A.0.3
// citation; NOTHING below is newly sourced by this lane — a lane transcribing numbers out of a
// 100-page Portuguese ordinance it has not read end-to-end would be minting confidence.
//
// ⚠⚠ THE CERTIFICATION GATE — SHUT, AND SHUT TWICE OVER.
// Unlike Paris (where only the signature was missing), Porto has a missing SIGNATURE *and* a
// missing SCHEMA CAPABILITY, so even a signature cannot open a drawing path today:
//
//   TO SIGN (a human, named, with the date — the L-449 discipline), the signature must assert:
//     1. SCOPE — that the Espaços Centrais parameter chain (Art. 32.º índice; cércea ≤ largura
//        do arruamento with the 21 m cap and the moda-da-cércea override; profundidade 25/30 m;
//        afastamento ≥ H/2 min 3 m) applies to the categorias this pack would map, with a
//        Portuguese planner's reading of scope and exceptions — the EXACT condition
//        `pt/sources/VERIFICATION.md` itself sets before any `confidence: structured`.
//     2. MAPPING — that the CRUS `categoria_2021` → PDMP categoria correspondence is correct.
//        CRUS is the DGT's HARMONISED transcription (DR 15/2015 vocabulary); the regulamento
//        binds its OWN Planta de Ordenamento legend ("Espaços Centrais", "Área de Atividades
//        Económicas Tipo I/II"…). A harmonised categoria is not automatically the regulamento's
//        categoria, and a wrong mapping cites the right article against the wrong land.
//     3. ARTICLE PINS — that the rows §A.0.3 carries WITHOUT a pinned artigo number (cércea /
//        profundidade / afastamento / storeys / roof-pitch rows say "Espaços Centrais", not
//        "Art. N.º") are pinned to their articles by reading the chapter. A citation that names
//        a chapter where the ordinance names an article is not yet a citation.
//        → CLOSED 2026-09-02 (lane PT-ARTICLE-PINS): every formerly chapter-only row is pinned
//          to its Art. N.º + n.º + alínea (Arts. 24.º/27.º/30.º) with the verbatim sentence in
//          §A.0.3, re-found independently via poppler pdftotext (PDF sha256 a9383f79…, byte-
//          identical re-fetch). ⚠ Scope findings for the founder (values UNCHANGED): the
//          street-width cércea rule + 21 m cap are FUC TIPO II (Art. 27.º) — tipo I is governed
//          by the moda (Art. 24.º n.º 1 e)); the 25/30 m profundidade caps the piso à cota do
//          logradouro (upper storeys follow the tardoz alignment); Art. 32.º's índice 1 is
//          Blocos Isolados ONLY, not the whole família. See §A.0.3 rows +
//          audit/demo-esfrpt/2026-09-02/lane-pt-article-pins.md.
//   AND EVEN THEN it cannot draw, because:
//     4. SCHEMA — Porto's dominant height regime is *moda da cércea* (Art. 3.º o): the cércea
//        with the greatest extent along the built urban frontage) — a FABRIC-DERIVED value no
//        C58 GeometricRule kind can represent today. `pt-13/1315-porto/ENVELOPE.md` records the
//        needed amendment by name (`fabricDerivedHeight`); `packages/schemas/**` is frozen for
//        this lane, so the gap is DOCUMENTED here, never worked around. A pack that silently
//        substituted the 21 m cap for the moda override would overstate or understate by parcel.
//
// While shut, `ptPortoPdmDraftRefusal` upgrades Porto's generic no-rule-pack refusal to one that
// says the true state: the regulamento IS extracted, a cited draft EXISTS, and what is missing
// is a signature (+ the schema kind) — not the sourcing. The draft VALUES never appear on the
// refusal card: C58's knownFacts contract is "never a number the user could mistake for an
// allowance", and an unsigned índice on a card is exactly that mistake.
//
// ⚠ TWO RECORDED TRAPS, so nobody "fixes" this file into them:
//   • DICOFRE: Porto is **1312** (DGT CAOP `cont_municipios` dtmn, measured — §A.0.5). The repo
//     docs folder says `1315-porto`; §A.0.5 records that as a DEFECT. This file keys on 1312,
//     which is also what CRUS serves live (`dtcc: "1312"`, re-probed 2026-09-02).
//   • `edificab_m` in Porto's `cc_czp.gpkg` (1.18 / 0.67 / 0.25) is an `edificabilidade média`
//     over THREE city-wide perequação macro-zones — a compensation reference index, NOT a
//     per-parcel FAR (§A.0.3's own warning). It is deliberately NOT a draft value here.
//
// PURE. Data + refusal construction only; no I/O (P5-adjacent discipline for L2 data modules).

import type { EnvelopeRefusal } from '@pryzm/schemas';
import { ptCrusZoneRefusal, type PtCrusZone } from './ptCrusZone.js';

/** Porto's DTCC as CRUS serves it (CAOP dtmn 1312 — NOT the repo folder's 1315, a recorded defect). */
export const PT_PORTO_DTCC = '1312';

/** The jurisdiction id a REGISTERED Porto pack would carry (DK/Paris naming shape). */
export const PT_PORTO_JURISDICTION_ID = 'pt-1312-porto';

/**
 * ⚠⚠ THE CERTIFICATION GATE — default SHUT (§UNSIGNED-GATE-DEFAULTS-SHUT; the
 * `FR_PARIS_PLU_CERTIFIED` mirror). Flipping it requires a human signature of assertions 1–3 in
 * the header AND the C58 `fabricDerivedHeight` amendment (blocker 4) — a decision plus a schema
 * lane, not code here. While `false`, no code path in this package reads a numeric value out of
 * `PT_PORTO_PDM_DRAFT` for any purpose except naming that the draft exists.
 *
 * (Typed `boolean`, not the literal `false`, so a future consumer's `if (PT_PORTO_PDM_CERTIFIED)`
 * branch is not narrowed away as dead code while the gate is shut — the Paris precedent.)
 */
export const PT_PORTO_PDM_CERTIFIED: boolean = false;

/** Where every draft value below was verified, and by which pass — cited on the refusal. */
export const PT_PORTO_PDM_SOURCE =
    'Plano Diretor Municipal do Porto — Regulamento (Janeiro 2023), ' +
    'pdm.cm-porto.pt/documents/121/Regulamento_PDMPorto.pdf (100 pp, text PDF, 319,459 chars ' +
    'extracted 2026-07-31); per-value citations: docs/04-reference/jurisdictions/pt/sources/' +
    'SOURCES.md §A.0.3 (VERIFIED-PRIMARY). PDM identity: PDMP — Aviso n.º 12773/2021, D.R. ' +
    '2021-07-08, with subsequent amendments; CRUS serves registo/depósito 01.13.12/PDM/03/2021/93, ' +
    'situação Vigente (re-probed live 2026-09-02).';

/** One cited draft value: the number AND its provenance travel together or not at all. */
export interface PtPdmDraftValue {
    /** The value, verbatim from §A.0.3 (decimal commas preserved in `text` where they appear). */
    readonly text: string;
    /** The governing artigo as §A.0.3 pins it — or an honest "not pinned" naming the chapter. */
    readonly article: string;
    /** What the value governs, in the regulamento's own vocabulary. */
    readonly subject: string;
    /** Always `VERIFIED-PRIMARY` here — a row that is not would not be in this draft. */
    readonly confidence: 'VERIFIED-PRIMARY';
}

/** Suffix every article pinned by the 2026-09-02 chapter-reading pass carries (gate assertion 3). */
const PINNED = 'Art. N.º pinned 2026-09-02 (lane PT-ARTICLE-PINS)';

/**
 * THE DRAFT — the Porto pack shape as data, every value cited. This is a TRANSCRIPTION TARGET
 * for the human signer, not an input to any computation: while `PT_PORTO_PDM_CERTIFIED` is
 * false, nothing evaluates these, and the refusal card never shows them.
 */
export const PT_PORTO_PDM_DRAFT: Readonly<Record<string, PtPdmDraftValue>> = {
    indiceEdificacaoEspacosCentraisNew: {
        text: 'índice de edificação = 1 (new buildings, Espaços Centrais family)',
        article: 'Art. 32.º',
        subject: 'índice de edificação — novas edificações',
        confidence: 'VERIFIED-PRIMARY',
    },
    indiceEdificacaoExistingExtension: {
        text: 'existing below 1 may extend to 1, if índice de impermeabilização ≤ 0,6',
        article: 'Art. 32.º',
        subject: 'ampliação de edifícios existentes',
        confidence: 'VERIFIED-PRIMARY',
    },
    indiceEdificacaoAaeTipoI: {
        text: 'índice de edificação máximo = 1,8; área impermeável ≤ 70 %',
        article: 'Art. 36.º',
        subject: 'Área de Atividades Económicas — Tipo I',
        confidence: 'VERIFIED-PRIMARY',
    },
    indiceEdificacaoAaeTipoII: {
        text: 'índice de edificação máximo = 1,4; área impermeável ≤ 70 %',
        article: 'Art. 38.º',
        subject: 'Área de Atividades Económicas — Tipo II',
        confidence: 'VERIFIED-PRIMARY',
    },
    cerceaStreetWidth: {
        text: 'cércea ≤ largura do arruamento confrontante',
        article:
            'Art. 27.º n.º 1 g) — Frente Urbana Contínua tipo II («A cércea confinante com a via ' +
            'pública não pode exceder a largura do arruamento confrontante, medida entre os limites ' +
            'do espaço público dominante ou estabelecido…», PDF p. 18). ⚠ tipo II ONLY — FUC tipo I ' +
            `is governed by the moda da cércea (Art. 24.º n.º 1 e)). ${PINNED}`,
        subject: 'cércea — regra geral por largura do arruamento',
        confidence: 'VERIFIED-PRIMARY',
    },
    cerceaCap21: {
        text:
            'where the public-space cross-section > 21 m → cércea máxima 21 m, UNLESS the moda da ' +
            'cércea is higher (⚠ the moda override is NOT representable — gate blocker 4)',
        article:
            'Art. 27.º n.º 2 b) — FUC tipo II («Quando o perfil transversal do espaço público ou ' +
            'via pública confinantes com uma frente urbana seja superior a 21 metros, a cércea ' +
            'máxima admitida é de 21 metros, exceto quando a moda da cércea for superior, ' +
            `respeitando-se essa moda…», PDF p. 18). ${PINNED}`,
        subject: 'cércea — teto de 21 m com prevalência da moda da cércea',
        confidence: 'VERIFIED-PRIMARY',
    },
    profundidade: {
        text: 'profundidade máxima da edificação, medida do alinhamento: 25 m / 30 m (two subcategories)',
        article:
            'Art. 24.º n.º 1 d) (25 m, FUC tipo I) + Art. 27.º n.º 1 d) (30 m, FUC tipo II) — «No ' +
            'piso situado à cota do logradouro, admite-se o prolongamento construtivo do edifício, ' +
            'não podendo ultrapassar a profundidade de 25 metros medidos a partir do alinhamento da ' +
            'frente urbana…» (PDF p. 17; Art. 27.º identical with 30 metros, PDF p. 18). ⚠ caps the ' +
            'piso à cota do logradouro — upper storeys follow the tardoz alignment (alínea b) of ' +
            `each article). ${PINNED}`,
        subject: 'profundidade máxima',
        confidence: 'VERIFIED-PRIMARY',
    },
    afastamento: {
        text: 'afastamento of upper storeys to plot limits ≥ H/2, minimum 3 m (waived for colmatação de empena)',
        article:
            'Art. 30.º n.º 1 d) — Área de Edifícios de Tipo Moradia («Os pisos superiores do ' +
            'edifício devem garantir um afastamento aos limites do prédio, igual ou superior à ' +
            'metade da sua altura, com o mínimo de 3 metros, exceto nas situações de colmatação de ' +
            `empena…», PDF p. 19). ${PINNED}`,
        subject: 'afastamentos laterais/tardoz',
        confidence: 'VERIFIED-PRIMARY',
    },
    maxStoreysStatedSubcategory: {
        text: 'max storeys above ground = 3 (stated subcategory); in colmatação, set by the moda da cércea',
        article:
            'Art. 30.º n.º 1 c) — Área de Edifícios de Tipo Moradia («O número máximo de pisos ' +
            'acima do solo é três, com exceção de situações de colmatação de conjuntos ' +
            'consolidados, em que o número de pisos é definido em função da moda da cércea», PDF ' +
            `p. 19; n.º 3: may be exceeded within a UOPG). ${PINNED}`,
        subject: 'número máximo de pisos',
        confidence: 'VERIFIED-PRIMARY',
    },
    indicePermeabilidade: {
        text: 'índice de permeabilidade (logradouros) = 0,3; ancillary construction max 10 m²',
        article: 'Art. 25.º',
        subject: 'permeabilidade dos logradouros',
        confidence: 'VERIFIED-PRIMARY',
    },
    roofPitchMax: {
        text: 'roof pitch max 30°',
        article:
            'Art. 24.º n.º 1 f) — FUC tipo I, água com pendente para o arruamento («…o arranque da ' +
            'laje de cobertura deve coincidir com a inserção entre planos de fachada e a laje de ' +
            `teto do último piso e a sua inclinação não deve ser superior a 30º», PDF p. 17). ${PINNED}`,
        subject: 'inclinação máxima de cobertura',
        confidence: 'VERIFIED-PRIMARY',
    },
    frontageImplantationExemption: {
        text: 'parcels > 2000 m² exempt from frontage implantation rule',
        article:
            'Art. 30.º n.º 2 — Área de Edifícios de Tipo Moradia («Excetuam-se da alínea a) do ' +
            'número anterior as parcelas com área superior a 2000 m2, admite-se qualquer ' +
            `implantação…», PDF pp. 19–20). ${PINNED}`,
        subject: 'implantação à frente urbana — isenção',
        confidence: 'VERIFIED-PRIMARY',
    },
    defAreaDeEdificacao: {
        text:
            'área de edificação (ae): sum of all storey areas, EXCLUDING uncovered terraces, ' +
            'non-glazed balconies, balconies open to the exterior, publicly-usable covered open ' +
            'space, attics without regulation headroom',
        article: 'Art. 3.º d)',
        subject: 'definição — área de edificação',
        confidence: 'VERIFIED-PRIMARY',
    },
    defCercea: {
        text:
            'cércea: vertical dimension from the MEAN GROUND LEVEL AT THE FAÇADE ALIGNMENT to the ' +
            'top of eave/parapet/terrace guard, INCLUDING recessed storeys, EXCLUDING chimneys, ' +
            'lift machine rooms, water tanks (⚠ façade-datum measurement — the L-584 family: never ' +
            'sample a centroid for it)',
        article: 'Art. 3.º g)',
        subject: 'definição — cércea',
        confidence: 'VERIFIED-PRIMARY',
    },
    defIndiceDeEdificacao: {
        text:
            'índice de edificação: ratio of área de edificação (excluding collective-equipment ' +
            'areas ceded to the município) to parcel area or plan area',
        article: 'Art. 3.º m)',
        subject: 'definição — índice de edificação (NOT índice de utilização: 0 occurrences in the regulamento, measured)',
        confidence: 'VERIFIED-PRIMARY',
    },
    defModaDaCercea: {
        text: 'moda da cércea: the cércea with the greatest extent along a built urban frontage',
        article: 'Art. 3.º o)',
        subject: 'definição — moda da cércea (fabric-derived; the C58 fabricDerivedHeight gap)',
        confidence: 'VERIFIED-PRIMARY',
    },
    defFrenteUrbana: {
        text:
            'frente urbana: plane of façades fronting a public way, between two successive ' +
            'intersecting public ways',
        article: 'Art. 3.º l)',
        subject: 'definição — frente urbana',
        confidence: 'VERIFIED-PRIMARY',
    },
};

/**
 * PURE: Porto's zone-named refusal WHILE THE GATE IS SHUT — the generic CRUS refusal
 * (`ptCrusZoneRefusal`) upgraded to state Porto's true coverage position: the regulamento is
 * extracted, a per-article cited draft exists in code, and what is missing is the signature
 * (and the C58 `fabricDerivedHeight` kind), not the sourcing. Code/`legallyGrounded` are
 * UNCHANGED from the generic refusal — a draft alters no legal claim; it alters the accuracy
 * of the coverage statement. No draft VALUE appears in any field a user reads.
 */
export function ptPortoPdmDraftRefusal(zone: PtCrusZone): EnvelopeRefusal {
    const base = ptCrusZoneRefusal(zone);
    if (zone.dtcc !== PT_PORTO_DTCC) return base; // not Porto — never claim the draft elsewhere
    const draftCount = Object.keys(PT_PORTO_PDM_DRAFT).length;
    return {
        ...base,
        detail:
            base.detail +
            ` ⭐ PORTO COVERAGE UPDATE: the PDMP Regulamento (Janeiro 2023, 100 pp) IS text-extracted ` +
            `and a per-article cited pack DRAFT exists in PRYZM (${draftCount} values/definitions, ` +
            `Arts. 3.º/25.º/32.º/36.º/38.º among them, all VERIFIED-PRIMARY) — UNCERTIFIED and ` +
            `refusing until a human signs its three assertions, and structurally unable to draw ` +
            `heights until the moda-da-cércea (fabric-derived) rule kind exists in the schema. ` +
            `What is missing is the signature, not the sourcing.`,
        knownFacts: [
            ...base.knownFacts,
            'Pack draft: ptPortoPdmDraft.ts — UNCERTIFIED (PT_PORTO_PDM_CERTIFIED=false), no value shown or evaluated',
        ],
    };
}
