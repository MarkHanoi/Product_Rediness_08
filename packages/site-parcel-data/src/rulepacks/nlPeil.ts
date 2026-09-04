// §NL-PEIL (lane ENVELOPE-NLDK, 2026-09-04) — `peil` as a FIRST-CLASS LEGAL VARIABLE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE RULE THIS MODULE EXISTS TO ENFORCE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// **NEVER `peil = AHN elevation`.** `NL-ENVELOPE-MASTER-PROMPT.md` §7.1 states it and this module
// is the mechanism. AHN (the national LiDAR DTM/DSM, in NAP) is EVIDENCE FOR an elevation. It is
// never the LEGAL DEFINITION of the plane a height is measured from. Those are different kinds of
// thing, and a solver that substitutes the second for the first produces a number that looks
// surveyed and is not — the §CONTEXT-DATA-HONESTY failure class (L-459), on the vertical axis.
//
// A Dutch bestemmingsplan defines `peil` in its own `begripsbepalingen` (definitions article).
// "Maximum bouwhoogte 12 m" means twelve metres ABOVE THAT PLANE — and the plane is typically the
// crown of the adjoining road at the main entrance, or the average finished adjoining ground, or
// NAP, or something the municipality decides case by case. Twelve metres above the road and twelve
// metres above the polder floor are different buildings.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT PHASE 0 MEASURED (nl-phase0-report.json §M4_M5b.m4 — 66 plan texts parsed of 70 fetched)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   · a resolvable peil definition was found in **20/66 = 30.3%** of plans;
//   · those 20 carried **17 DISTINCT definitions** — i.e. peil is very nearly bespoke per plan;
//   · reference-class frequency (a definition may reference several, and most do):
//       main-entrance-referenced 14 · maaiveld-other 9 · water-or-dike 8 · nap-absolute 6 ·
//       authority-determined 3 · road-crown 2 · adjoining-finished-ground 1.
//
// ⭐ THE CONSEQUENCE THAT SHAPES THIS MODULE'S TYPE: **most definitions are MULTI-BRANCH.** The
// commonest Dutch peil article reads "a. for a building whose main entrance directly adjoins the
// road: the height of the road at that entrance; b. where it does not: the height of the finished
// ground at the entrance; c. where built in or on water: NAP." Which branch binds is a fact about
// THE BUILDING — where its main entrance will be, whether it adjoins the road. That fact does not
// exist until the building is designed, and PRYZM does not hold it at envelope time.
//
// So a multi-branch peil is NOT an unknown to be resolved by better data. It is the ratified
// `RuleState` **`alternative`** arm: named alternatives, no unique value, and — in that arm's own
// words — "NOT A RANGE, AND NOT AN AVERAGE". Interpolating between branch (a) and branch (c)
// produces a datum no article supports.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE TAXONOMY IS THE AUDIT'S, VERBATIM — one vocabulary, not two
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The eight reference classes below are exactly those emitted by the Phase 0 harness
// (`docs/04-reference/jurisdictions/nl/findings/nl-phase0/nl-phase0-plantext.mjs` `classifyPeil`),
// so the measurement's output and this runtime's output are the SAME STRINGS and can be compared
// without a translation table — the discipline `RuleState.ts` applies to the founder's six failure
// labels, applied here to the peil classes. `unclassified` is a first-class member and is NEVER
// folded into `maaiveld-other`: that fold IS the "peil = ground elevation" hard-code, laundered.
//
// PURE (C58 §1.9) — no I/O, no THREE, no DOM, no clock, no RNG. Deterministic (C58 §1.1).
//
// Contracts: C58 §1.3/§1.4 (cited refusal, never a fabricated number), C63 (denominator/datum is
// data), C74/C75. Master prompt §6 (never naked numbers), §7.1, §9 (status taxonomy), §11.

import type { RuleState } from '@pryzm/schemas';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The reference classes
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * WHICH PHYSICAL THING a plan's `peil` definition points at. Carried verbatim from the Phase 0
 * classifier so the audit and the runtime speak one vocabulary.
 *
 * ⚠ A CLASS IS NOT AN ELEVATION. Knowing the plan says "the crown of the road" tells you what to
 * go and measure; it does not tell you the number. That gap is the whole point of
 * `NlPeilResolution` below — identifying the datum and KNOWING it are separate states.
 */
export type NlPeilReferenceClass =
    /** "de kruin van de weg" — the crown of the adjoining road / carriageway surface. */
    | 'road-crown'
    /** "het aansluitende afgewerkte terrein/maaiveld" — the adjoining FINISHED ground. */
    | 'adjoining-finished-ground'
    /** `maaiveld` referenced in some other construction (e.g. before `bouwrijp maken`). */
    | 'maaiveld-other'
    /** An absolute NAP figure ("0,00 m +NAP"), or NAP named as the datum. */
    | 'nap-absolute'
    /** Keyed to the building's `hoofdtoegang` / entree — a fact about the UNBUILT design. */
    | 'main-entrance-referenced'
    /** "bovenkant afgewerkte vloer" / `begane-grondvloer` — the finished ground-floor level. */
    | 'ground-floor-level'
    /** A dike crown, quay, or a water level (`waterpeil` / `boezempeil`). */
    | 'water-or-dike'
    /** "burgemeester en wethouders bepalen nader" — the authority decides. DISCRETIONARY. */
    | 'authority-determined'
    /** A definition was found and matched NOTHING. ⚠ Never folded into `maaiveld-other`. */
    | 'unclassified';

/** Every class, for exhaustiveness tests and UI enumeration. Order is the audit's histogram order. */
export const NL_PEIL_REFERENCE_CLASSES: readonly NlPeilReferenceClass[] = Object.freeze([
    'main-entrance-referenced',
    'maaiveld-other',
    'water-or-dike',
    'nap-absolute',
    'authority-determined',
    'road-crown',
    'adjoining-finished-ground',
    'ground-floor-level',
    'unclassified',
] as const);

/**
 * Classify a verbatim `peil` begripsbepaling into its reference classes.
 *
 * ⚠ RETURNS A SET, NOT A CLASS, AND THAT IS THE LOAD-BEARING DECISION. Phase 0 found most Dutch
 * peil definitions reference several physical things across lettered branches; collapsing to "the
 * first match" would pick branch (a) and silently discard (b) and (c), manufacturing a unique
 * datum out of an article that offers three.
 *
 * The regexes are TRANSCRIBED from the Phase 0 harness. Keeping them identical is deliberate: if
 * this classifier and the audit's disagree, the coverage figures stop describing the runtime.
 */
export function classifyNlPeilDefinition(text: string | null | undefined): readonly NlPeilReferenceClass[] {
    if (typeof text !== 'string' || text.trim() === '') return [];
    const s = text.toLowerCase();
    const hits: NlPeilReferenceClass[] = [];
    if (/kruin van de weg|kruin van de aangrenzende|wegdek/.test(s)) hits.push('road-crown');
    if (
        /aansluitende?\s+(afgewerkte?\s+)?(maaiveld|terrein)|gemiddelde hoogte van het\s+(aansluitende?\s+)?(afgewerkte?\s+)?(terrein|maaiveld)/.test(s)
    ) {
        hits.push('adjoining-finished-ground');
    }
    if (/\bmaaiveld\b/.test(s) && !hits.includes('adjoining-finished-ground')) hits.push('maaiveld-other');
    if (/\bn\.?a\.?p\.?\b|normaal amsterdams peil/.test(s)) hits.push('nap-absolute');
    if (/hoofdtoegang|toegang van het gebouw|entree/.test(s)) hits.push('main-entrance-referenced');
    if (/bovenkant.*(afgewerkte )?vloer|begane[- ]grondvloer/.test(s)) hits.push('ground-floor-level');
    if (/dijk|kade|waterpeil|waterstand|boezempeil/.test(s)) hits.push('water-or-dike');
    if (/burgemeester en wethouders|bevoegd gezag|nader.{0,20}bepaal/.test(s)) hits.push('authority-determined');
    if (hits.length === 0) hits.push('unclassified');
    return Object.freeze(hits);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// The resolution
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ THE EVIDENCE A CALLER MAY SUPPLY — and the shape is deliberately awkward, because supplying it
 * SHOULD require a decision.
 *
 * `elevationM_NAP` is only ever accepted alongside `measuredAtClass`: the caller must say WHICH
 * legal reference the number is the elevation OF. Handing this module a bare "the AHN says 3.2 m
 * here" is not expressible, by construction. That is the §7.1 prohibition enforced in the type
 * system rather than in a comment.
 */
export interface NlPeilEvidence {
    /** WHICH legal reference class this elevation was measured for. Never omitted. */
    readonly measuredAtClass: NlPeilReferenceClass;
    /** The elevation of that reference, in metres NAP. */
    readonly elevationM_NAP: number;
    /** How it was obtained — `"AHN4 DTM 0.5m, median over the road polygon"`. Free text, required. */
    readonly method: string;
}

export type NlPeilResolution =
    /**
     * 🟢 The plan names ONE physical reference AND the caller supplied its elevation. The only arm
     * that yields a usable datum, and it still records which class it came from.
     */
    | {
          readonly kind: 'resolved';
          readonly datumElevationM_NAP: number;
          readonly referenceClass: NlPeilReferenceClass;
          readonly definitionVerbatim: string;
          readonly evidenceMethod: string;
      }
    /**
     * 🟡 The plan names ONE physical reference and we do NOT hold its elevation. The datum is
     * IDENTIFIED but not KNOWN. ⚠ This is a genuinely different state from "we cannot tell what
     * the datum is": it is actionable (go measure THIS thing), and a UI should say so.
     */
    | {
          readonly kind: 'datum-identified-elevation-unknown';
          readonly referenceClass: NlPeilReferenceClass;
          readonly requiredEvidence: string;
          readonly definitionVerbatim: string;
      }
    /**
     * 🟡 The plan offers SEVERAL branches and which binds depends on the building. NOT a range,
     * NOT an average. Maps to the `RuleState` `alternative` arm.
     */
    | {
          readonly kind: 'branch-dependent';
          readonly branches: readonly NlPeilReferenceClass[];
          readonly definitionVerbatim: string;
          readonly whyUnresolved: string;
      }
    /**
     * 🟠 The definition hands the datum to the municipality ("burgemeester en wethouders bepalen
     * nader"). ⚠ A DISCRETIONARY POWER, NEVER SILENTLY CONVERTED INTO A DATUM (§7.8).
     */
    | {
          readonly kind: 'authority-determined';
          readonly definitionVerbatim: string;
      }
    /**
     * 🔴 No peil definition was recovered from the plan at all — the 69.7% case in Phase 0.
     * ⚠ THIS IS ABOUT PRYZM, NOT ABOUT THE LAW. The plan almost certainly HAS a peil article;
     * we did not extract it. It must never render as "no datum applies".
     */
    | {
          readonly kind: 'definition-not-recovered';
          readonly stoppedAt: string;
      };

/**
 * Resolve a plan's `peil` for one parcel. Pure and total.
 *
 * ORDER OF THE BRANCHES IS LEGAL, NOT COSMETIC:
 *   1. no definition text        → `definition-not-recovered` (ours, retryable)
 *   2. authority-determined      → discretionary, and it OUTRANKS a co-occurring physical class,
 *                                  because a definition that says "…and otherwise B&W decide" has
 *                                  not given us a datum even though it named a road.
 *   3. more than one class       → `branch-dependent`
 *   4. one class + evidence FOR THAT CLASS → `resolved`
 *   5. one class, no evidence    → `datum-identified-elevation-unknown`
 *
 * ⚠ STEP 4's CLASS CHECK IS THE WHOLE MODULE. Evidence measured at the `adjoining-finished-ground`
 * does NOT resolve a plan whose peil is the `road-crown`. Accepting it would be "peil = whatever
 * elevation we happen to hold", which is the hard-code wearing a different hat.
 */
export function resolveNlPeil(opts: {
    readonly definitionVerbatim: string | null | undefined;
    readonly evidence?: NlPeilEvidence | null;
    readonly stoppedAt?: string | null;
}): NlPeilResolution {
    const text = typeof opts.definitionVerbatim === 'string' ? opts.definitionVerbatim.trim() : '';
    if (text === '') {
        return {
            kind: 'definition-not-recovered',
            stoppedAt:
                opts.stoppedAt ??
                'no peil begripsbepaling extracted from the governing plan text (ruimtelijkeplannen pt_<planId>.xml)',
        };
    }
    const classes = classifyNlPeilDefinition(text);
    if (classes.includes('authority-determined')) {
        return { kind: 'authority-determined', definitionVerbatim: text };
    }
    if (classes.length > 1) {
        return {
            kind: 'branch-dependent',
            branches: classes,
            definitionVerbatim: text,
            whyUnresolved:
                'the peil article states several lettered branches and which one binds is a fact ' +
                'about the building (where its main entrance sits, whether it adjoins the road, ' +
                'whether it is built in water) that does not exist at envelope time',
        };
    }
    const only = classes[0]!;
    if (only === 'unclassified') {
        return {
            kind: 'datum-identified-elevation-unknown',
            referenceClass: 'unclassified',
            requiredEvidence:
                'the peil definition was recovered but matched no known reference class — it needs ' +
                'a human read before any elevation can be attached',
            definitionVerbatim: text,
        };
    }
    const ev = opts.evidence ?? null;
    if (ev !== null && ev.measuredAtClass === only && Number.isFinite(ev.elevationM_NAP)) {
        return {
            kind: 'resolved',
            datumElevationM_NAP: ev.elevationM_NAP,
            referenceClass: only,
            definitionVerbatim: text,
            evidenceMethod: ev.method,
        };
    }
    return {
        kind: 'datum-identified-elevation-unknown',
        referenceClass: only,
        requiredEvidence:
            ev === null
                ? `an elevation in NAP measured at: ${describeNlPeilClass(only)}`
                : `evidence was supplied for "${ev.measuredAtClass}" but this plan's peil is ` +
                  `"${only}" — the elevation of a DIFFERENT reference does not resolve this datum`,
        definitionVerbatim: text,
    };
}

/** A one-line human gloss of a reference class, for the why-chain (§11). */
export function describeNlPeilClass(c: NlPeilReferenceClass): string {
    switch (c) {
        case 'road-crown':
            return 'de kruin van de aangrenzende weg — the crown of the adjoining road';
        case 'adjoining-finished-ground':
            return 'het aansluitende afgewerkte terrein — the adjoining FINISHED ground (post-construction, not current AHN)';
        case 'maaiveld-other':
            return 'maaiveld in a plan-specific construction — read the article before measuring';
        case 'nap-absolute':
            return 'an absolute NAP level stated in the plan';
        case 'main-entrance-referenced':
            return 'the ground at the building’s hoofdtoegang — a fact about the UNBUILT design';
        case 'ground-floor-level':
            return 'de bovenkant van de afgewerkte begane-grondvloer';
        case 'water-or-dike':
            return 'a dike crown, quay or water level (waterpeil / boezempeil)';
        case 'authority-determined':
            return 'a level the municipality determines case by case — discretionary';
        case 'unclassified':
            return 'a definition that matched no known reference class';
    }
}

/**
 * ⚠ THE HONEST VERTICAL ANSWER when the datum did not resolve — master prompt §7.1's
 * **`legally-bounded-datum-unresolved`**, as a value rather than a sentence.
 *
 * The height LIMIT is known (the maatvoering said 12 m). The PLANE it is measured from is not. So
 * the vertical extent is legally bounded and geometrically unplaceable, and those two facts must
 * travel together. A consumer that drops `datumResolved: false` and draws 12 m from the terrain has
 * manufactured the hard-code this module exists to prevent — so the limit is deliberately NOT
 * offered as a bare number anywhere in this type.
 */
export interface NlVerticalEnvelope {
    readonly limitM: number;
    /** WHICH limit — `'bouwhoogte'` (ridge/overall) or `'goothoogte'` (eaves). Never merged. */
    readonly limitKind: 'bouwhoogte' | 'goothoogte';
    readonly datumResolved: boolean;
    /** Present ONLY when `datumResolved`. Absolute NAP top = this + `limitM`. */
    readonly datumElevationM_NAP: number | null;
    /** The peil resolution in full, so the why-chain (§11) can quote the article verbatim. */
    readonly peil: NlPeilResolution;
    /** One line a user sees. Says "legally bounded, datum unresolved" when that is the truth. */
    readonly statement: string;
}

/** Build the vertical envelope from a limit + a peil resolution. Never fabricates a datum. */
export function nlVerticalEnvelope(
    limitM: number,
    limitKind: 'bouwhoogte' | 'goothoogte',
    peil: NlPeilResolution,
): NlVerticalEnvelope {
    if (peil.kind === 'resolved') {
        return {
            limitM,
            limitKind,
            datumResolved: true,
            datumElevationM_NAP: peil.datumElevationM_NAP,
            peil,
            statement:
                `maximum ${limitKind} ${limitM} m above peil; peil = ${peil.datumElevationM_NAP} m NAP ` +
                `(${describeNlPeilClass(peil.referenceClass)}; ${peil.evidenceMethod}) ` +
                `→ absolute top ${peil.datumElevationM_NAP + limitM} m NAP`,
        };
    }
    return {
        limitM,
        limitKind,
        datumResolved: false,
        datumElevationM_NAP: null,
        peil,
        statement:
            `LEGALLY BOUNDED, DATUM UNRESOLVED — maximum ${limitKind} ${limitM} m above peil, ` +
            `but peil is ${nlPeilUnresolvedReason(peil)}. The height LIMIT is known; the plane it is ` +
            'measured from is not, so no absolute level can be stated. AHN terrain is evidence for ' +
            'an elevation, never the legal definition of peil.',
    };
}

function nlPeilUnresolvedReason(p: NlPeilResolution): string {
    switch (p.kind) {
        case 'resolved':
            return 'resolved';
        case 'datum-identified-elevation-unknown':
            return `identified as "${describeNlPeilClass(p.referenceClass)}" but its elevation is not held`;
        case 'branch-dependent':
            return `branch-dependent across ${p.branches.length} named alternatives (${p.branches.join(', ')})`;
        case 'authority-determined':
            return 'determined case by case by the municipality (discretionary)';
        case 'definition-not-recovered':
            return `not recovered from the plan text (stopped at: ${p.stoppedAt})`;
    }
}

/**
 * Project a peil resolution onto the SHARED `RuleState` vocabulary (ENVELOPE-FR's
 * `packages/schemas/src/site/zoning/RuleState.ts`), parameter **A2 — height reference datum**.
 *
 * Adopting that union rather than minting a rival is the point: NL's peil, FR's datum, DK's
 * niveauplan and NSW's ground level are ONE question, and a coverage reducer must be able to count
 * them together. The mapping is the interesting part:
 *
 *   resolved                          → `resolved`,     reachability `derivable`
 *                                       (peil is COMPUTED from evidence at a named reference; the
 *                                        plan publishes the definition, never the number, so it is
 *                                        not `source-complete`)
 *   branch-dependent                  → `alternative`,  reachability `interpretive`
 *   authority-determined              → `refused` / `requires-determination`  ⚠ legallyGrounded
 *   datum-identified-elevation-unknown→ `unrecovered`, mechanism `present`, failure `semantic`
 *                                       (⚠ mechanism PRESENT: the plan HAS a peil article — this is
 *                                        NOT F1)
 *   definition-not-recovered          → `unrecovered`, mechanism `unknown`,  failure `pdf`
 *                                       (⚠ `unknown`, not `absent`: we did not read far enough to
 *                                        say the plan lacks a peil article, and asserting `absent`
 *                                        would be claiming F1 on no evidence)
 */
export function nlPeilToRuleState(
    peil: NlPeilResolution,
    ref: RuleState['ref'],
): RuleState {
    switch (peil.kind) {
        case 'resolved':
            return {
                rule: 'A2',
                status: 'resolved',
                reachability: 'derivable',
                value: peil.datumElevationM_NAP,
                unit: 'm NAP',
                datum: peil.referenceClass,
                provenance: 'pipeline-extracted',
                ref,
            };
        case 'branch-dependent':
            return {
                rule: 'A2',
                status: 'alternative',
                reachability: 'interpretive',
                alternatives: peil.branches.map((b) => describeNlPeilClass(b)),
                ref,
            };
        case 'authority-determined':
            return {
                rule: 'A2',
                status: 'refused',
                reachability: 'undeterminable',
                basis: 'requires-determination',
                reason:
                    'the plan’s peil begripsbepaling hands the datum to burgemeester en ' +
                    'wethouders; no dataset publishes that decision in advance',
                ref,
            };
        case 'datum-identified-elevation-unknown':
            return {
                rule: 'A2',
                status: 'unrecovered',
                partial: null,
                reachability: 'derivable',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt: peil.requiredEvidence,
                ref,
            };
        case 'definition-not-recovered':
            return {
                rule: 'A2',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'pdf',
                mechanism: 'unknown',
                stoppedAt: peil.stoppedAt,
                ref,
            };
    }
}
