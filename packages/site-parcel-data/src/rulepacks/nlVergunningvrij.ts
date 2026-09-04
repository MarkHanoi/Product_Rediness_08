// §NL-VERGUNNINGVRIJ (lane ENVELOPE-NLDK, 2026-09-04) — the permit-free layer, RE-SCOPED to the
// regime that is actually in force. Founder review §4 / §10 move 8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ ROUND ONE SCOPED THIS AGAINST A REPEALED REGIME
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `NL-ENVELOPE-COMPLETION.md` §3 item 7 described carve-outs "on monuments and in beschermd
// stadsgezicht" — the Wabo / Bijlage II Bor framing. **Bijlage II Bor lapsed on 2024-01-01.** The
// successor is shaped differently, in a way that changes the design:
//
//   · THE KNIP. The technical *bouwactiviteit* and the *omgevingsplanactiviteit* (OPA) are assessed
//     SEPARATELY. Technical: Bbl arts. 2.25–2.26 (vergunningplicht), 2.27 (exceptions). OPA:
//     Bbl arts. 2.28–2.31 plus the omgevingsplan itself. A plan can be technically vergunningvrij
//     and spatially vergunningplichtig, or the reverse.
//   · Art. 2.29 Bbl — the NATIONAL FLOOR of vergunningvrije OPA cases.
//   · Art. 2.30 lid 1–2 — the floor is disapplied (limited exceptions) in, on or against a
//     (voorbeschermd) gemeentelijk, provinciaal or rijksmonument. Lid 3 — the same for a location
//     carrying the `functieaanduiding rijksbeschermd stads- of dorpsgezicht` IN THE OMGEVINGSPLAN.
//     ⭐ The exclusion trigger is a functieaanduiding QUERYABLE IN IMOW, not an external heritage set.
//   · The bruidsschat carries vergunningvrije activities of its own — omgevingsplan arts. 22.27
//     and 22.36.
//   · ⭐ For BIJBEHORENDE BOUWWERKEN the national rules NO LONGER APPLY: the GEMEENTE determines
//     what is vergunningvrij for the OPA, and may extend the list or replace the vergunning with a
//     melding. Small amendments landed 2025-01-01.
//
// So the carve-out layer CANNOT be a national rule pack. It is: national floor (2.29) + exclusion
// (2.30) + bruidsschat + a PER-OMGEVINGSPLAN municipal overlay, keyed on a functieaanduiding.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS — a typed skeleton of that structure, and NOT a table of rights
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It fixes the SHAPE so that no consumer can ask "is X vergunningvrij here?" and get a national
// yes. Every path that would need the municipal overlay or the heritage trigger and does not have
// it returns a typed non-answer. It contains NO dimensions (no "4 m", no "achtererfgebied 50 %"):
// those are exactly what the gemeente now determines, and inventing them is inventing a percentage.
//
// ⚠ CITATIONS: every article number above is the FOUNDER'S (review §4), sourced but NOT re-verified
// by this lane — wetten.overheid.nl exceeded the fetch size limit and the IPLO pages tried returned
// 404 (2026-09-04). `NL_VERGUNNINGVRIJ_REGIME.citationStatus` says so. The technical track
// (2.25–2.27) is typed but NOT resolved here: it stays `not-built`, and is named as such.
//
// PURE (C58 §1.9). Deterministic. Emits the shared `RuleState` vocabulary against **D3** (bonuses
// and increments — a permit-free addition is an increment to what the plan itself permits).

import type { RuleState } from '@pryzm/schemas';

export const NL_VERGUNNINGVRIJ_REGIME = Object.freeze({
    repealed: 'Bijlage II Besluit omgevingsrecht (Wabo) — lapsed 2024-01-01; round one was scoped against it',
    current: {
        knip: 'technische bouwactiviteit (Bbl 2.25–2.27) and omgevingsplanactiviteit (Bbl 2.28–2.31 + omgevingsplan) are assessed SEPARATELY',
        nationalFloor: 'Bbl art. 2.29 — vergunningvrije omgevingsplanactiviteiten (national floor)',
        exclusion: 'Bbl art. 2.30 lid 1–2 (monumenten, incl. voorbeschermd) · lid 3 (functieaanduiding rijksbeschermd stads- of dorpsgezicht in het omgevingsplan)',
        bruidsschat: 'omgevingsplan arts. 22.27 and 22.36',
        municipal: 'bijbehorende bouwwerken: the gemeente determines vergunningvrij for the OPA in its omgevingsplan (amendments 2025-01-01)',
    },
    citationStatus: 'founder-sourced-not-re-verified',
    notBuilt: ['technical track (Bbl 2.25–2.27) resolution', 'bruidsschat 22.27/22.36 reading', 'IMOW functieaanduiding query'],
} as const);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Inputs
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlVergunningvrijTrack = 'technische-bouwactiviteit' | 'omgevingsplanactiviteit';

/** The OPA activity classes this skeleton distinguishes. */
export type NlOpaActivity =
    /** A bijbehorend bouwwerk (aanbouw, uitbouw, bijgebouw) — the case the gemeente now determines. */
    | 'bijbehorend-bouwwerk'
    /** Any other case the caller asserts is on the art. 2.29 national list (dakkapel, erfafscheiding…). */
    | 'art-2.29-listed-case';

export type NlMonumentStatus = 'rijks' | 'provinciaal' | 'gemeentelijk' | 'voorbeschermd' | 'none' | 'unknown';

export interface NlHeritageStatus {
    readonly monument: NlMonumentStatus;
    /** Does the omgevingsplan carry the `functieaanduiding rijksbeschermd stads- of dorpsgezicht` here?
     *  `null` = IMOW not queried (the DSO layer is key-gated). */
    readonly rijksbeschermdGezichtFunctieaanduiding: boolean | null;
}

/** What the gemeente's omgevingsplan says about vergunningvrij bijbehorende bouwwerken — if read. */
export type NlMunicipalOverlay =
    | { readonly read: false }
    | {
          readonly read: true;
          readonly bijbehorendeBouwwerken: 'national-list-adopted' | 'extended' | 'replaced-by-melding' | 'not-vergunningvrij' | 'unclear';
          /** The omgevingsplan article, verbatim reference. Never fabricated. */
          readonly citation: string | null;
      };

export interface NlVergunningvrijOpaInputs {
    readonly activity: NlOpaActivity;
    readonly heritage: NlHeritageStatus;
    readonly municipalOverlay: NlMunicipalOverlay;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Outcomes
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlVergunningvrijOpaOutcome =
    /** 🟢 an art. 2.29 case, no 2.30 exclusion triggered — the national floor applies (dimensions NOT stated here). */
    | { readonly kind: 'national-floor-applies'; readonly layer: 'bbl-2.29'; readonly statement: string }
    /** 🔴 a 2.30 exclusion is triggered — the national floor does NOT apply. */
    | {
          readonly kind: 'excluded-by-heritage';
          readonly layer: 'bbl-2.30';
          readonly trigger: 'monument' | 'rijksbeschermd-gezicht-functieaanduiding';
          readonly statement: string;
      }
    /** 🟡 the heritage trigger is UNKNOWN — the floor cannot be applied until it is. */
    | { readonly kind: 'heritage-status-unknown'; readonly missing: readonly string[]; readonly statement: string }
    /** 🟡 bijbehorend bouwwerk — the GEMEENTE determines; the overlay was not read. */
    | { readonly kind: 'municipal-determination-required'; readonly layer: 'omgevingsplan-overlay'; readonly statement: string }
    /** 🟢/🔴 bijbehorend bouwwerk — the overlay WAS read; its verdict is passed through with its citation. */
    | {
          readonly kind: 'municipal-overlay-read';
          readonly layer: 'omgevingsplan-overlay';
          readonly verdict: 'national-list-adopted' | 'extended' | 'replaced-by-melding' | 'not-vergunningvrij' | 'unclear';
          readonly citation: string | null;
          readonly statement: string;
      };

/**
 * Resolve whether the OPA permit-free layer can be applied for one activity at one location.
 * Pure and total. Never returns a dimension.
 *
 * BRANCH ORDER IS LEGAL:
 *   1. heritage exclusion (2.30) — checked FIRST because it disapplies everything below it.
 *   2. heritage unknown — the floor cannot be applied on an unknown trigger.
 *   3. bijbehorend bouwwerk — the gemeente determines: overlay read → pass through; not read → required.
 *   4. otherwise the national floor applies.
 */
export function resolveNlVergunningvrijOpa(input: NlVergunningvrijOpaInputs): NlVergunningvrijOpaOutcome {
    const h = input.heritage;
    if (h.monument !== 'none' && h.monument !== 'unknown') {
        return {
            kind: 'excluded-by-heritage',
            layer: 'bbl-2.30',
            trigger: 'monument',
            statement:
                `Bbl art. 2.30 lid 1–2: the location is a ${h.monument} monument (or voorbeschermd); the national ` +
                'vergunningvrij floor of art. 2.29 does not apply here (limited exceptions aside).',
        };
    }
    if (h.rijksbeschermdGezichtFunctieaanduiding === true) {
        return {
            kind: 'excluded-by-heritage',
            layer: 'bbl-2.30',
            trigger: 'rijksbeschermd-gezicht-functieaanduiding',
            statement:
                'Bbl art. 2.30 lid 3: the omgevingsplan carries the functieaanduiding rijksbeschermd stads- of ' +
                'dorpsgezicht at this location; the national vergunningvrij floor of art. 2.29 does not apply.',
        };
    }
    const missing: string[] = [];
    if (h.monument === 'unknown') missing.push('monument status (gemeentelijk / provinciaal / rijks / voorbeschermd)');
    if (h.rijksbeschermdGezichtFunctieaanduiding === null) {
        missing.push('functieaanduiding rijksbeschermd stads- of dorpsgezicht (IMOW query — DSO key-gated)');
    }
    if (missing.length > 0) {
        return {
            kind: 'heritage-status-unknown',
            missing: Object.freeze(missing),
            statement:
                'the art. 2.30 exclusion trigger is not known, so the art. 2.29 floor cannot be applied: ' +
                missing.join('; '),
        };
    }
    if (input.activity === 'bijbehorend-bouwwerk') {
        const o = input.municipalOverlay;
        if (!o.read) {
            return {
                kind: 'municipal-determination-required',
                layer: 'omgevingsplan-overlay',
                statement:
                    'for bijbehorende bouwwerken the national rules no longer apply — the gemeente determines ' +
                    'vergunningvrij in its omgevingsplan, and that overlay was not read. No national answer exists.',
            };
        }
        return {
            kind: 'municipal-overlay-read',
            layer: 'omgevingsplan-overlay',
            verdict: o.bijbehorendeBouwwerken,
            citation: o.citation,
            statement:
                `the omgevingsplan${o.citation ? ` (${o.citation})` : ''} determines vergunningvrij bijbehorende ` +
                `bouwwerken here: ${o.bijbehorendeBouwwerken}.`,
        };
    }
    return {
        kind: 'national-floor-applies',
        layer: 'bbl-2.29',
        statement:
            'no art. 2.30 exclusion is triggered; the art. 2.29 national floor of vergunningvrije ' +
            'omgevingsplanactiviteiten applies for this listed case. ⚠ Its dimensions are not stated by this ' +
            'module and the technical track (Bbl 2.25–2.27) is assessed separately.',
    };
}

/**
 * Project onto `RuleState` against **D3**.
 *
 *   national-floor-applies             → `qualitative` (the right exists and is cited; its dimensions
 *                                         are not read here — a sentence, never a number)
 *   excluded-by-heritage               → `refused` / `rule-not-applicable` (the floor has no subject here)
 *   heritage-status-unknown            → `unrecovered` / `inaccessible` / mechanism `present`
 *                                         (the IMOW layer exists and is key-gated — retryable)
 *   municipal-determination-required   → `unrecovered` / `semantic` / mechanism `unknown`
 *   municipal-overlay-read             → `qualitative` with the verdict and its citation
 */
export function nlVergunningvrijToRuleState(o: NlVergunningvrijOpaOutcome, ref: RuleState['ref']): RuleState {
    switch (o.kind) {
        case 'national-floor-applies':
            return { rule: 'D3', status: 'qualitative', reachability: 'interpretive', text: o.statement, ref };
        case 'excluded-by-heritage':
            return {
                rule: 'D3',
                status: 'refused',
                reachability: 'source-complete',
                basis: 'rule-not-applicable',
                reason: o.statement,
                ref,
            };
        case 'heritage-status-unknown':
            return {
                rule: 'D3',
                status: 'unrecovered',
                partial: null,
                reachability: 'derivable',
                failure: 'inaccessible',
                mechanism: 'present',
                stoppedAt: o.statement,
                ref,
            };
        case 'municipal-determination-required':
            return {
                rule: 'D3',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'semantic',
                mechanism: 'unknown',
                stoppedAt: o.statement,
                ref,
            };
        case 'municipal-overlay-read':
            return { rule: 'D3', status: 'qualitative', reachability: 'extractable', text: o.statement, ref };
    }
}
