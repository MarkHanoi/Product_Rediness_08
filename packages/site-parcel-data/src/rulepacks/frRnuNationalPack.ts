// FRANCE — the RÈGLEMENT NATIONAL D'URBANISME as a rule pack. Founder blocker review 2026-09-04
// §4 / §12 move 1: *"In roughly 12,400 communes there is NO MUNICIPAL PDF TO PARSE. The applicable
// rules are national articles: one corpus, fixed text, already structured by the Code's own
// numbering."*
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PACK IS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The substantive rules that govern a parcel when no local règlement does: an RNU commune
// (`is_rnu=true`, nothing served), a carte communale (sectors, no règlement of its own) or a POS
// lapsed by L.174-1. `frPlanningRegime.ts` decides WHICH of those a point is in (`rnuRulesApply`,
// `pauTestApplies`); this file says WHAT the national articles then provide, parameter by
// parameter, as `RuleState`s from the shared vocabulary — with a Légifrance citation on every arm.
//
// Every article below was READ on Légifrance on 2026-09-04 (LEGIARTI ids carried) unless its row
// says otherwise. ⚠ Nothing here is a règlement paraphrase from memory: where a text was only
// confirmed by its operative phrase, the row says `phrase-verified`; where only the section heading
// was seen, it says `section-heading-only` and the rule emitted from it is a refusal, never a number.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE THREE THINGS THE RNU ACTUALLY SAYS ABOUT AN ENVELOPE — and the two it deliberately does not
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   R.111-16  ROAD PROSPECT. Distance from any point of the building to the nearest point of the
//             OPPOSITE alignment ≥ the altitude difference between those points. At the alignment
//             that is H ≤ L: the road width (A4) IS the height cap, measured from the opposite
//             alignment's level. A FORMULA on a derivable input, not a number in a PDF.
//   R.111-17  LATERAL PROSPECT. Unless the building abuts the parcel limit, distance to the nearest
//             point of the limit ≥ half the altitude difference, never < 3 m. So: implantation on
//             the limit is AUTORISÉE nationally (the mitoyenneté split, `frImplantationRule.ts`);
//             off the limit, d ≥ max(3 m, ΔH/2).
//   R.111-15  3 m may be IMPOSED between two non-contiguous buildings of the same owner.
//   —         NO emprise-au-sol ceiling, NO floor-area ceiling, NO storey count. Section 2
//             (R.111-21–22, "Densité et reconstruction") defines density and governs reconstruction
//             without stating a limit; the RNU never carried a COS. These are `refused /
//             no-limit-stated` — the instrument applies and is silent on this parameter. ⚠ L-616:
//             "no limit stated" is NOT "unbounded"; R.111-27 and R.111-14 still bind.
//   —         and the DISCRETION the founder said a correct France run must show (§4): R.111-27
//             (refusal or special prescriptions for atteinte au caractère des lieux avoisinants),
//             R.111-19 (dérogations to R.111-15–18 by motivated decision), R.111-14 (hors PAU:
//             refusal or special prescriptions), and L.111-4 4° (the conseil municipal's motivated
//             deliberation to build outside the PAU, avis CDPENAF L.111-5). E4 = `unrecovered /
//             discretionary / mechanism: present` — the pipeline working and the answer being "a
//             person decides" (RuleState §FAILURE-TAXONOMY).
//
// ORDRE PUBLIC (R.111-1): R.111-3, R.111-5 to R.111-19 and R.111-28 to R.111-30 do NOT apply where
// a PLU (or a document tenant lieu) exists; the rest of the chapter — R.111-2, R.111-4, R.111-20 to
// R.111-27 — applies everywhere. L.111-6 (the 100 m / 75 m road bands outside urbanised spaces)
// applies everywhere too, a PLU may only depart from it with justification (L.111-8). The table
// marks each row so a PLU consumer can read the ordre-public subset without re-deriving it.
//
// PURE + deterministic (C58 §1.1/§1.9). Takes a regime verdict and optional already-derived facts;
// performs no I/O. Consumes `resolveConstraint` from the shared `ConstraintForm` for the one
// formula it can reduce (R.111-16 × A4) rather than hand-rolling the arithmetic.

import {
    resolveConstraint,
    type ConstraintValue,
    type EnvelopeParameterKey,
    type RuleSourceRef,
    type RuleState,
} from '@pryzm/schemas';

import { FR_LEGIFRANCE_CODE_URBANISME_URL } from '../countryAdapters/fr/frNoExtraction.js';
import { frDatumForRuleState } from './frHeightDatum.js';
import { type FrPauDerivation, frPauRuleState } from './frPau.js';
import type { FrRegimeVerdict } from './frPlanningRegime.js';

/* ───────────────────────────── the article table ─────────────────────────────── */

export type FrRnuApplicability = 'rnu-only' | 'ordre-public';
export type FrRnuVerification =
    | 'legifrance-read-2026-09-04'
    | 'phrase-verified-2026-09-04'
    | 'section-heading-only-2026-09-04';

export interface FrRnuArticle {
    /** `R.111-16` / `L.111-3` — Code de l'urbanisme spelling. */
    readonly article: string;
    /** Légifrance LEGIARTI id of the version read, or null when only the section page was seen. */
    readonly legiarti: string | null;
    readonly section: string;
    /** Does the article stop applying where a PLU exists (R.111-1), or does it apply everywhere? */
    readonly applicability: FrRnuApplicability;
    /** The envelope parameter this article speaks to, or null for a gate / procedural article. */
    readonly parameter: EnvelopeParameterKey | null;
    /** What the article provides, in one line — the reader's line, not the law's. */
    readonly gist: string;
    /** The operative text as read, or null where the text was not read in full. */
    readonly verbatim: string | null;
    readonly verification: FrRnuVerification;
}

export const FR_RNU_AUTHORITY = "Légifrance — Code de l'urbanisme, Livre Ier Titre Ier Chapitre Ier (RNU)";

export const FR_RNU_ARTICLES: readonly FrRnuArticle[] = Object.freeze([
    {
        article: 'R.111-1',
        legiarti: 'LEGIARTI000034355056',
        section: 'Chapitre Ier — champ d’application',
        applicability: 'ordre-public',
        parameter: 'B1',
        gist:
            'Scope. R.111-3, R.111-5 à R.111-19 and R.111-28 à R.111-30 do not apply where a PLU or a document ' +
            'en tenant lieu exists; the remainder of the chapter applies everywhere.',
        verbatim:
            'Les dispositions des articles R. 111-3, R. 111-5 à R. 111-19 et R. 111-28 à R. 111-30 ne sont pas ' +
            'applicables dans les territoires dotés d’un plan local d’urbanisme ou d’un document d’urbanisme en tenant lieu.',
        verification: 'legifrance-read-2026-09-04',
    },
    {
        article: 'L.111-3',
        legiarti: 'LEGIARTI000031210179',
        section: 'Section 1 — Localisation, implantation et desserte',
        applicability: 'rnu-only',
        parameter: 'B5',
        gist: 'Constructibilité limitée: without PLU / document en tenant lieu / carte communale, construction only inside the PAU.',
        verbatim:
            'En l’absence de plan local d’urbanisme, de tout document d’urbanisme en tenant lieu ou de carte communale, ' +
            'les constructions ne peuvent être autorisées que dans les parties urbanisées de la commune.',
        verification: 'legifrance-read-2026-09-04',
    },
    {
        article: 'L.111-4',
        legiarti: 'LEGIARTI000047303702',
        section: 'Section 1 — Localisation, implantation et desserte',
        applicability: 'rnu-only',
        parameter: 'E4',
        gist:
            'Exceptions to L.111-3, notably 4°: constructions authorised on a MOTIVATED DELIBERATION of the conseil ' +
            'municipal where the commune’s interest — in particular avoiding a fall in population — justifies it, subject ' +
            'to landscape / salubrité / sécurité / public-expenditure / L.101-2 conditions. The E4 discretion.',
        verbatim: null,
        verification: 'phrase-verified-2026-09-04',
    },
    {
        article: 'L.111-5',
        legiarti: null,
        section: 'Section 1 — Localisation, implantation et desserte',
        applicability: 'rnu-only',
        parameter: 'E4',
        gist: 'The L.111-4 4° deliberation is submitted to the CDPENAF for its opinion.',
        verbatim: null,
        verification: 'phrase-verified-2026-09-04',
    },
    {
        article: 'L.111-6',
        legiarti: 'LEGIARTI000031210187',
        section: 'Section 2 — Constructions le long des voies',
        applicability: 'ordre-public',
        parameter: 'B4',
        gist:
            'Outside urbanised spaces, construction is forbidden within 100 m either side of the axis of autoroutes, ' +
            'routes express and déviations, and 75 m of other routes classées à grande circulation (exceptions L.111-7; ' +
            'a PLU may depart with justification, L.111-8).',
        verbatim:
            'En dehors des espaces urbanisés des communes, les constructions ou installations sont interdites dans une ' +
            'bande de cent mètres de part et d’autre de l’axe des autoroutes, des routes express et des déviations au sens ' +
            'du code de la voirie routière et de soixante-quinze mètres de part et d’autre de l’axe des autres routes ' +
            'classées à grande circulation.',
        verification: 'legifrance-read-2026-09-04',
    },
    {
        article: 'R.111-14',
        legiarti: null,
        section: 'Section 1 — Localisation, implantation et desserte',
        applicability: 'rnu-only',
        parameter: 'E4',
        gist:
            'Outside the PAU the project MAY be refused or accepted only under special prescriptions if, by its location ' +
            'or destination, it meets the listed criteria (dispersed urbanisation, agricultural/forestry harm, …).',
        verbatim: null,
        verification: 'phrase-verified-2026-09-04',
    },
    {
        article: 'R.111-15',
        legiarti: 'LEGIARTI000031721290',
        section: 'Section 1 — Implantation et volume des constructions',
        applicability: 'rnu-only',
        parameter: 'C5',
        gist: 'A distance of at least 3 m MAY be imposed between two non-contiguous buildings on land of the same owner.',
        verbatim: null,
        verification: 'phrase-verified-2026-09-04',
    },
    {
        article: 'R.111-16',
        legiarti: 'LEGIARTI000031721288',
        section: 'Section 1 — Implantation et volume des constructions',
        applicability: 'rnu-only',
        parameter: 'C2',
        gist:
            'Road prospect: horizontal distance from any point of the building to the nearest point of the OPPOSITE ' +
            'alignment ≥ the altitude difference between the two points; a mandatory retrait replaces the alignment; ' +
            'private roads by their effective width.',
        verbatim:
            'Lorsque le bâtiment est édifié en bordure d’une voie publique, la distance comptée horizontalement de tout ' +
            'point de l’immeuble au point le plus proche de l’alignement opposé doit être au moins égale à la différence ' +
            'd’altitude entre ces deux points. Lorsqu’il existe une obligation de construire au retrait de l’alignement, ' +
            'la limite de ce retrait se substitue à l’alignement. Il en sera de même pour les constructions élevées en ' +
            'bordure des voies privées, la largeur effective de la voie privée étant assimilée à la largeur réglementaire ' +
            'des voies publiques.',
        verification: 'legifrance-read-2026-09-04',
    },
    {
        article: 'R.111-17',
        legiarti: 'LEGIARTI000031721286',
        section: 'Section 1 — Implantation et volume des constructions',
        applicability: 'rnu-only',
        parameter: 'C5',
        gist:
            'Lateral prospect: unless the building abuts the parcel limit, distance to the nearest point of the limit ≥ ' +
            'half the altitude difference, never < 3 m. Implantation ON the limit is thereby authorised.',
        verbatim:
            'A moins que le bâtiment à construire ne jouxte la limite parcellaire, la distance comptée horizontalement de ' +
            'tout point de ce bâtiment au point de la limite parcellaire qui en est le plus rapproché doit être au moins ' +
            'égale à la moitié de la différence d’altitude entre ces deux points, sans pouvoir être inférieure à trois mètres.',
        verification: 'legifrance-read-2026-09-04',
    },
    {
        article: 'R.111-18',
        legiarti: null,
        section: 'Section 1 — Implantation et volume des constructions',
        applicability: 'rnu-only',
        parameter: null,
        gist:
            'An existing building non-conforming to R.111-17 may only receive a permit for works that improve conformity ' +
            'or do not affect implantation or gabarit.',
        verbatim:
            'Lorsque, par son gabarit ou son implantation, un immeuble bâti existant n’est pas conforme aux prescriptions ' +
            'de l’article R. 111-17, le permis de construire ne peut être accordé que pour des travaux qui améliorent la ' +
            'conformité ou n’ont pas d’effet sur l’implantation ou le gabarit.',
        verification: 'legifrance-read-2026-09-04',
    },
    {
        article: 'R.111-19',
        legiarti: 'LEGIARTI000031721282',
        section: 'Section 1 — Implantation et volume des constructions',
        applicability: 'rnu-only',
        parameter: 'E4',
        gist: 'Dérogations to R.111-15 à R.111-18 may be granted by MOTIVATED DECISION of the competent authority, after the maire’s opinion.',
        verbatim: null,
        verification: 'phrase-verified-2026-09-04',
    },
    {
        article: 'R.111-21 à R.111-22',
        legiarti: null,
        section: 'Section 2 — Densité et reconstruction des constructions',
        applicability: 'ordre-public',
        parameter: 'D1',
        gist: 'Defines density and governs reconstruction. States NO floor-area or density ceiling.',
        verbatim: null,
        verification: 'section-heading-only-2026-09-04',
    },
    {
        article: 'R.111-25',
        legiarti: null,
        section: 'Section 4 — Réalisation d’aires de stationnement',
        applicability: 'ordre-public',
        parameter: null,
        gist: 'The permit MAY impose off-street parking matching the project’s characteristics.',
        verbatim:
            'Le permis ou la décision prise sur la déclaration préalable peut imposer la réalisation d’installations ' +
            'propres à assurer le stationnement hors des voies publiques des véhicules correspondant aux caractéristiques du projet.',
        verification: 'legifrance-read-2026-09-04',
    },
    {
        article: 'R.111-26',
        legiarti: 'LEGIARTI000031721260',
        section: 'Section 5 — Préservation des éléments présentant un intérêt architectural, patrimonial, paysager ou écologique',
        applicability: 'ordre-public',
        parameter: 'E4',
        gist:
            'The permit must respect the environmental concerns of C. env. L.110-1 / L.110-2; the project may be accepted ' +
            'only under special prescriptions where it would damage the environment.',
        verbatim: null,
        verification: 'phrase-verified-2026-09-04',
    },
    {
        article: 'R.111-27',
        legiarti: 'LEGIARTI000031721258',
        section: 'Section 5 — Préservation des éléments présentant un intérêt architectural, patrimonial, paysager ou écologique',
        applicability: 'ordre-public',
        parameter: 'C6',
        gist:
            'The project MAY be refused or accepted only under special prescriptions if the constructions, by their ' +
            'situation, architecture, dimensions or exterior aspect, would harm the character or interest of the ' +
            'surrounding places, sites, natural or urban landscapes or monumental perspectives. Qualitative by nature.',
        verbatim: null,
        verification: 'phrase-verified-2026-09-04',
    },
]);

/** The articles that keep applying under a PLU (R.111-1 read the other way round). */
export function frRnuOrdrePublicArticles(): readonly FrRnuArticle[] {
    return FR_RNU_ARTICLES.filter((a) => a.applicability === 'ordre-public');
}

function article(id: string): FrRnuArticle {
    const a = FR_RNU_ARTICLES.find((x) => x.article === id);
    if (a === undefined) throw new Error(`frRnuNationalPack: unknown article ${id}`);
    return a;
}

/* ───────────────────────────── the constraints as ConstraintValues ────────────── */

/**
 * R.111-16 at the alignment: `H_max = L` — the height cap at the alignment equals the width to the
 * opposite alignment (A4). Reducible by `resolveConstraint` once A4 is a fact. ⚠ A retrait `d`
 * behind the alignment raises the cap to `L + d`; that is the solver's per-point evaluation of
 * the same article, not a second rule.
 */
export const FR_RNU_R111_16_HEIGHT_AT_ALIGNMENT: ConstraintValue = Object.freeze({
    form: 'formula',
    expression: 'H_max_at_alignment_m = A4_opposite_alignment_width_m',
    inputs: ['A4'],
    unit: 'm',
    affine: { coefficient: 1, input: 'A4', constant: 0 },
});

/** R.111-17 off the limit: `d ≥ max(3, ΔH/2)`. Parametric in the DESIGN height — carried verbatim. */
export const FR_RNU_R111_17_LATERAL_SETBACK: ConstraintValue = Object.freeze({
    form: 'formula',
    expression: 'lateral_setback_m >= max(3, delta_H_m / 2); 0 where the building abuts the limit (autorisée)',
    inputs: ['delta_H_m'],
    unit: 'm',
    affine: null,
});

/**
 * L.111-6 road bands, conditional on TWO facts neither of which the GPU serves: the road's
 * classification (a ministerial list, not BD TOPO’s administrative class) and whether the point
 * is *en dehors des espaces urbanisés* (a judge-controlled notion, PAU-like).
 */
// ⚠ The `satisfies` is load-bearing, and `as const` is the WRONG tool here — both halves matter.
// `Object.freeze` infers its type parameter from the ARGUMENT, before the `: ConstraintValue`
// annotation can contextually type it, so the nested literals inside `cases[]` widen: `op: 'eq'`
// becomes `string` and `then.form: 'scalar'` becomes `string`, and the discriminated union stops
// matching. `satisfies` supplies that contextual type, so the literals narrow.
// ⛔ `as const` also narrows them — and then FAILS, because `ConstraintPredicateSchema.operand` is
// `z.array(...)`, a MUTABLE array: a `readonly ['autoroute', …]` tuple is not assignable to it. The
// error it produces prints the entire union and explains nothing, which is how this cost a lane.
// The scalar/formula constants above need neither, having no nested object arrays to widen.
export const FR_RNU_L111_6_ROAD_BAND: ConstraintValue = Object.freeze({
    form: 'conditional',
    cases: [
        {
            when: [
                { fact: 'fr.outsideEspacesUrbanises', op: 'eq', operand: true },
                { fact: 'fr.roadClass', op: 'in', operand: ['autoroute', 'route-express', 'deviation'] },
            ],
            then: { form: 'scalar', value: 100, unit: 'm' },
        },
        {
            when: [
                { fact: 'fr.outsideEspacesUrbanises', op: 'eq', operand: true },
                { fact: 'fr.roadClass', op: 'eq', operand: 'grande-circulation' },
            ],
            then: { form: 'scalar', value: 75, unit: 'm' },
        },
    ],
    otherwise: null,
} satisfies ConstraintValue);

/* ───────────────────────────── inputs ─────────────────────────────── */

export type FrRnuRoadClass = 'autoroute' | 'route-express' | 'deviation' | 'grande-circulation' | 'other';

export interface FrRnuFacts {
    /** A4 — the width (m) to the opposite alignment for the governing frontage, when derived. */
    readonly roadWidthM?: number | null;
    /** The PAU derivation for the parcel, when run (`frPau.ts`). */
    readonly pau?: FrPauDerivation | null;
    /** L.111-6 inputs, when known. `roadClass` is the ministerial classification, never a BD TOPO guess. */
    readonly roadClass?: FrRnuRoadClass | null;
    readonly outsideEspacesUrbanises?: boolean | null;
}

export interface FrRnuInput {
    readonly verdict: FrRegimeVerdict;
    /** The base ref — commune / plan identity from the GPU; this pack sets authority + article. */
    readonly ref: RuleSourceRef;
    readonly facts?: FrRnuFacts;
}

/** Output order is fixed so two runs are byte-comparable. */
export const FR_RNU_STATE_ORDER: readonly EnvelopeParameterKey[] = ['B2', 'B4', 'B5', 'A2', 'C2', 'C3', 'C4', 'C5', 'C6', 'D1', 'E4'];

/* ───────────────────────────── the emitter ─────────────────────────────── */

/**
 * Emit the RNU's answer for every envelope parameter it speaks to. **Pure, total, deterministic.**
 * Returns `[]` when the regime verdict says the RNU's substantive rules do not apply (PLU / PLUi /
 * PSMV / undetermined) — this pack never speaks over a local règlement or over a silence.
 */
export function frRnuRuleStates(input: FrRnuInput): readonly RuleState[] {
    const { verdict } = input;
    if (!verdict.rnuRulesApply) return [];
    const facts = input.facts ?? {};

    const ref = (a: FrRnuArticle | string, extra?: Partial<RuleSourceRef>): RuleSourceRef => {
        const art = typeof a === 'string' ? a : a.article;
        const leg = typeof a === 'string' ? null : a.legiarti;
        return {
            ...input.ref,
            authority: FR_RNU_AUTHORITY,
            dataset: 'code-de-l-urbanisme',
            document: FR_LEGIFRANCE_CODE_URBANISME_URL,
            object_id: leg,
            article: art,
            page: null,
            ...extra,
        };
    };

    const out: RuleState[] = [];

    // ── B2 zone code — the RNU has no zoning instrument; the CC's sectors are read elsewhere ──
    if (verdict.regime === 'RNU' || verdict.regime === 'POS-caduc') {
        out.push({
            rule: 'B2',
            status: 'refused',
            reachability: 'undeterminable',
            basis: 'rule-not-applicable',
            reason:
                `${verdict.regime}: no zoning instrument is in force, so no zone code has a subject here ` +
                `(${verdict.basis})`,
            ref: ref(article('R.111-1')),
        });
    }

    // ── B4 — L.111-6 road bands, ordre public, conditional on two unheld facts ─────────────────
    {
        const l1116 = article('L.111-6');
        const known: Record<string, number | string | boolean> = {};
        if (facts.roadClass !== undefined && facts.roadClass !== null) known['fr.roadClass'] = facts.roadClass;
        if (facts.outsideEspacesUrbanises !== undefined && facts.outsideEspacesUrbanises !== null) {
            known['fr.outsideEspacesUrbanises'] = facts.outsideEspacesUrbanises;
        }
        const r = resolveConstraint(FR_RNU_L111_6_ROAD_BAND, known);
        if (r.kind === 'scalar' && typeof r.value === 'number') {
            out.push({
                rule: 'B4',
                status: 'resolved',
                reachability: 'source-complete',
                value: r.value,
                unit: 'm',
                datum: null,
                provenance: 'ordinance-pdf',
                ref: ref(l1116, { article: `L.111-6 — band either side of the road axis (class ${String(known['fr.roadClass'])})` }),
            });
        } else if (
            facts.outsideEspacesUrbanises === false ||
            (facts.roadClass !== undefined && facts.roadClass !== null && facts.roadClass === 'other')
        ) {
            out.push({
                rule: 'B4',
                status: 'refused',
                reachability: 'source-complete',
                basis: 'rule-not-applicable',
                reason:
                    facts.outsideEspacesUrbanises === false
                        ? 'L.111-6 applies only en dehors des espaces urbanisés; this point is inside them.'
                        : 'L.111-6 applies only along autoroutes / routes express / déviations / routes classées à grande circulation; none fronts this parcel.',
                ref: ref(l1116),
            });
        } else {
            out.push({
                rule: 'B4',
                status: 'unrecovered',
                reachability: 'interpretive',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt:
                    'L.111-6 (100 m / 75 m from the road axis) applies only "en dehors des espaces urbanisés" and only along ' +
                    'classified roads — ' +
                    (r.kind === 'indeterminate' ? `facts not held: ${r.missing.join(', ')}` : 'facts not held') +
                    '. The classification is a ministerial list, not a BD TOPO attribute; "espaces urbanisés" is judge-controlled.',
                partial: null,
                ref: ref(l1116),
            });
        }
    }

    // ── B5 — PAU: the L.111-3 gate, derived-non-authoritative when a derivation was run ────────
    if (verdict.pauTestApplies) {
        const l1113 = article('L.111-3');
        if (facts.pau !== undefined && facts.pau !== null) {
            out.push(frPauRuleState(facts.pau, ref(l1113)));
        } else {
            out.push({
                rule: 'B5',
                status: 'refused',
                reachability: 'derivable',
                basis: 'requires-determination',
                reason:
                    `${verdict.regime}: L.111-3 limits construction to the parties actuellement urbanisées; PAU membership ` +
                    'is not published at parcel level and only the instructing authority determines it. A declared-method ' +
                    'derivation exists (frPau.ts) and was not run for this parcel.',
                ref: ref(l1113),
            });
        }
    } else if (verdict.regime === 'CC') {
        out.push({
            rule: 'B5',
            status: 'refused',
            reachability: 'source-complete',
            basis: 'rule-not-applicable',
            reason: 'Carte communale: its constructible / non-constructible sectors replace the L.111-3 PAU test (L.161-4).',
            ref: ref('L.161-4'),
        });
    }

    // ── A2 — the datum is IN the articles: a point-to-point altitude difference ────────────────
    out.push({
        rule: 'A2',
        status: 'resolved',
        reachability: 'source-complete',
        value:
            'point-to-point altitude difference — R.111-16 from the nearest point of the opposite alignment (niveau de la ' +
            'voie); R.111-17 from the nearest point of the parcel limit',
        unit: null,
        datum: null,
        provenance: 'ordinance-pdf',
        ref: ref('R.111-16 / R.111-17'),
    });

    // ── C2 — R.111-16: the road width IS the cap at the alignment ─────────────────────────────
    {
        const r11116 = article('R.111-16');
        const a4 = facts.roadWidthM;
        const r = resolveConstraint(FR_RNU_R111_16_HEIGHT_AT_ALIGNMENT, a4 !== undefined && a4 !== null ? { A4: a4 } : {});
        if (r.kind === 'scalar' && typeof r.value === 'number') {
            out.push({
                rule: 'C2',
                status: 'resolved',
                reachability: 'derivable',
                value: r.value,
                unit: 'm',
                // Measured from the level of the OPPOSITE alignment — the street's grade.
                datum: frDatumForRuleState('niveau-de-la-voie'),
                provenance: 'ordinance-pdf',
                ref: ref(r11116, { article: 'R.111-16 — H ≤ L at the alignment; L = A4 width to the opposite alignment' }),
            });
        } else {
            out.push({
                rule: 'C2',
                status: 'unrecovered',
                reachability: 'derivable',
                // The number is in the road GEOMETRY (A4) and un-read — the `graphic` rung;
                // `derivable` names the remedy (frFrontage.ts / streetWidth.ts), and `partial`
                // carries the rule so nothing about it is lost.
                failure: 'graphic',
                mechanism: 'present',
                stoppedAt:
                    'R.111-16 is fully known (H ≤ L at the alignment) and its input A4 — the width to the opposite alignment ' +
                    '— has not been derived for this parcel',
                partial: { value: FR_RNU_R111_16_HEIGHT_AT_ALIGNMENT.form === 'formula' ? FR_RNU_R111_16_HEIGHT_AT_ALIGNMENT.expression : 'H ≤ L', unit: 'm', verbatim: r11116.verbatim ?? r11116.gist },
                ref: ref(r11116),
            });
        }
    }

    // ── C3 / C4 / D1 — the RNU states no limit; other articles still bind (L-616) ─────────────
    out.push({
        rule: 'C3',
        status: 'refused',
        reachability: 'source-complete',
        basis: 'no-limit-stated',
        reason: 'The RNU states no storey count; height is governed by the R.111-16 / R.111-17 prospects and R.111-27.',
        ref: ref('R.111-16 / R.111-17'),
    });
    out.push({
        rule: 'C4',
        status: 'refused',
        reachability: 'source-complete',
        basis: 'no-limit-stated',
        reason: 'The RNU states no emprise-au-sol ceiling. R.111-14 (hors PAU) and R.111-27 (aspect) may still ground a refusal.',
        ref: ref(article('R.111-1')),
    });
    out.push({
        rule: 'D1',
        status: 'refused',
        reachability: 'source-complete',
        basis: 'no-limit-stated',
        reason:
            'Section 2 (R.111-21–R.111-22, "Densité et reconstruction") defines density and governs reconstruction ' +
            'without stating a floor-area ceiling; the RNU never carried a COS.',
        ref: ref(article('R.111-21 à R.111-22')),
    });

    // ── C5 — R.111-17 lateral prospect + R.111-15 ────────────────────────────────────────────
    {
        const r11117 = article('R.111-17');
        out.push({
            rule: 'C5',
            status: 'resolved',
            reachability: 'source-complete',
            value:
                'lateral: d ≥ max(3 m, ΔH/2) from the nearest point of the parcel limit, or 0 where the building abuts ' +
                'the limit (implantation en limite autorisée) — R.111-17; 3 m may be imposed between two non-contiguous ' +
                'buildings of the same owner — R.111-15; road: no setback stated, the R.111-16 prospect governs',
            unit: 'm',
            datum: null,
            provenance: 'ordinance-pdf',
            ref: ref(r11117, { article: 'R.111-17 (lateral) · R.111-15 (between buildings) · R.111-16 (road prospect)' }),
        });
    }

    // ── C6 — R.111-27: qualitative by nature ─────────────────────────────────────────────────
    {
        const r11127 = article('R.111-27');
        out.push({
            rule: 'C6',
            status: 'qualitative',
            reachability: 'interpretive',
            text:
                'R.111-27 — le projet peut être refusé ou n’être accepté que sous réserve de l’observation de prescriptions ' +
                'spéciales si les constructions, par leur situation, leur architecture, leurs dimensions ou l’aspect extérieur ' +
                'des bâtiments ou ouvrages à édifier ou à modifier, sont de nature à porter atteinte au caractère ou à ' +
                'l’intérêt des lieux avoisinants, aux sites, aux paysages naturels ou urbains ainsi qu’à la conservation des ' +
                'perspectives monumentales (operative phrase verified on Légifrance 2026-09-04).',
            ref: ref(r11127),
        });
    }

    // ── E4 — the discretion the founder said must show up ───────────────────────────────────
    out.push({
        rule: 'E4',
        status: 'unrecovered',
        reachability: 'interpretive',
        failure: 'discretionary',
        mechanism: 'present',
        stoppedAt:
            'an authority decides: L.111-4 4° (délibération motivée du conseil municipal to build outside the PAU, ' +
            'avis CDPENAF L.111-5) · R.111-14 (hors PAU: refusal or special prescriptions) · R.111-19 (dérogations to ' +
            'R.111-15–18 by motivated decision) · R.111-27 (aspect: refusal or special prescriptions). The rule is real ' +
            'and admits no deterministic value.',
        partial: null,
        ref: ref('L.111-4 / L.111-5 / R.111-14 / R.111-19 / R.111-27'),
    });

    // Fixed order (byte-comparable), stable within a rule.
    const rank = new Map(FR_RNU_STATE_ORDER.map((k, i) => [k, i] as const));
    return out
        .map((s, i) => ({ s, i }))
        .sort((p, q) => (rank.get(p.s.rule) ?? 99) - (rank.get(q.s.rule) ?? 99) || p.i - q.i)
        .map((x) => x.s);
}
