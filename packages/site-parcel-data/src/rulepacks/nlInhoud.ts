// §NL-INHOUD (lane ENVELOPE-NLDK, 2026-09-04) — the cubic-metre volume cap, and the label correction.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT THAT CHANGED THE LABEL
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Phase 0 read `inhoud` at 0 of 556 parcels and `NL-ENVELOPE-COMPLETION.md` labelled it
// `missing-source`. The founder (review §6) disputed the label: `inhoud hoofdgebouw maximaal 650 m³`
// is a routine Dutch construction, but a RURAL one, which a national uniform sample can miss.
//
// The targeted probe (`nl-inhoud-probe.mjs`, seed 20260903, 2026-09-04) measured it:
//
//   buitengebied stratum   cubic-metre inhoud rule in plan TEXT   9 / 37  = 24.3 %
//   control stratum                                                3 / 36  =  8.3 %
//   modal figure 750 m³ (4 plans); also 900, 700, 2 500 (mestsilo), 50 (bijgebouwen)
//
// So the 0/556 was the STRUCTURED zero: SVBP2012 maatvoering does not carry the volume, the plan
// text does — three times as often in the buitengebied. ⭐ The honest label is `pdf` with
// `mechanism: 'present'`, NOT `missing-source`, and it is a D-group (quantum) cap of the kind the
// withdrawn French D1 claim got wrong in the other direction. This module is the correction.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE VERBATIM WINDOWS TAUGHT — a detector hit is NOT a cap
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Reading the stored windows rather than the count (the whole point of storing them):
//   · "De inhoud van een bedrijfswoning bedraagt ten hoogste 750 m³"        → a MAXIMUM. A cap.
//   · "dient een inhoud te hebben van minimaal 900 m³"                       → a MINIMUM. Not a cap.
//   · "kan worden verruimd tot 900 m³ in geval van sloop van tenminste …"   → CONDITIONAL. Not an
//                                                                              entitlement (§7.8).
//   · "de inhoud van één mestsilo bedraagt maximaal 2.500 m³"               → a cap ON A SILO. Not
//                                                                              the dwelling's cap.
// So a cap has a QUANTIFIER and a SUBJECT, and this module refuses to emit a number without
// both — the same `min` guard `classifyMaatvoering` applies to heights, applied to volumes.
//
// ⚠ PARAMETER-KEY DEBT, RECORDED BY NAME (`NL_INHOUD_PARAMETER_KEY_DEBT`): the ratified
// `EnvelopeParameterKey` enum has no VOLUME slot. The D-group is "the quantum" and D1 is the
// floor-area limit; a cubic-metre cap is reported against D1 with `unit: 'm3'` so a reducer can
// see it, and the schema owner (not this lane) owes a volume key. Never silently converted to m².
//
// PURE (C58 §1.9). Deterministic. No I/O. Emits the shared `RuleState` vocabulary.

import type { RuleState } from '@pryzm/schemas';

export const NL_INHOUD_PARAMETER_KEY_DEBT = Object.freeze({
    id: 'NL-INHOUD-PARAMETER-KEY-OWED',
    what:
        '`EnvelopeParameterKeySchema` (packages/schemas, STR-ENVELOPE-PARAMETER-REFERENCE) has no ' +
        'VOLUME slot; the Dutch `inhoud` cap (m³) is a D-group quantum with no key of its own.',
    interim: 'reported against D1 with `unit: "m3"`; never converted to floor area.',
    owedAgainst: 'the schema owner — a superseding ADR adding a volume key to the D-group.',
} as const);

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Extraction — transcribed from the probe, plus the quantifier and subject the probe did not need
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Which way the sentence points. Only `maximum` can become a cap. */
export type NlInhoudQuantifier = 'maximum' | 'minimum' | 'conditional' | 'unqualified';

export interface NlInhoudRuleHit {
    readonly offset: number;
    /** Every cubic-metre figure in the window, in m³ (Dutch "2.500" → 2500, "12,5" → 12.5). */
    readonly numbersM3: readonly number[];
    readonly quantifier: NlInhoudQuantifier;
    /** "een bedrijfswoning", "één mestsilo", "elk gebouw" — the words after "inhoud van", or null. */
    readonly subjectVerbatim: string | null;
    /** ±160 chars of the plan text, verbatim. */
    readonly verbatim: string;
}

const CUBIC = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?)\s*(m³|m3|m\s3|kubieke meter[s]?)/gi;

function parseNlNumber(s: string): number | null {
    const t = s.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function quantifierOf(window: string): NlInhoudQuantifier {
    const s = window.toLowerCase();
    // Conditional first: a bonus clause usually ALSO contains a maximal verb ("verruimd tot").
    if (/kan worden verruimd|kan worden vergroot|bij (een )?omgevingsvergunning|afwijk|mits|indien .{0,60}(sloop|gesloopt)|in geval van/.test(s)) {
        return 'conditional';
    }
    if (/minimaal|ten minste|tenminste|niet minder|minstens/.test(s)) return 'minimum';
    if (/maximaal|maximale|maximum|ten hoogste|niet meer (dan|mag|bedragen)|mag niet meer|bedraagt niet meer/.test(s)) return 'maximum';
    return 'unqualified';
}

function subjectOf(window: string): string | null {
    const m = /\binhoud\s+van\s+((?:een|één|de|het|elk|elke|iedere?|andere)\s+[a-zà-ÿ()\- ,]{2,60}?)\s+(?:bedraagt|mag|niet|dient|kan|is|per|ten|maximaal)\b/i.exec(window);
    return m ? m[1]!.trim() : null;
}

/**
 * Extract every cubic-metre `inhoud` sentence from flattened plan text, verbatim. The detector is
 * the probe's (an `inhoud` token followed within 160 chars by a number and a cubic-metre unit) so
 * the census and the runtime count the same things; the quantifier and subject are added here
 * because the runtime must not emit what the census only needed to count.
 */
export function extractNlInhoudRules(text: string | null | undefined): readonly NlInhoudRuleHit[] {
    if (typeof text !== 'string' || text === '') return Object.freeze([]);
    const out: NlInhoudRuleHit[] = [];
    const re = /\binhoud\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        const win = text.slice(m.index, m.index + 160);
        const nums: number[] = [];
        CUBIC.lastIndex = 0;
        let c: RegExpExecArray | null;
        while ((c = CUBIC.exec(win)) !== null) {
            const n = parseNlNumber(c[1]!);
            if (n !== null) nums.push(n);
        }
        if (nums.length === 0) continue;
        const verbatim = text.slice(Math.max(0, m.index - 120), m.index + 200);
        out.push({
            offset: m.index,
            numbersM3: Object.freeze(nums),
            quantifier: quantifierOf(verbatim),
            subjectVerbatim: subjectOf(win),
            verbatim,
        });
    }
    return Object.freeze(out);
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Resolution — one subject, one maximum, or an honest non-answer
// ──────────────────────────────────────────────────────────────────────────────────────────────

export type NlInhoudResolution =
    /** 🟢 exactly one MAXIMUM figure for the requested subject. */
    | {
          readonly kind: 'cap-recovered';
          readonly capM3: number;
          readonly subjectVerbatim: string | null;
          readonly verbatim: string;
      }
    /** 🟡 several distinct MAXIMUM figures for the subject (e.g. per aanduiding) — named, not averaged. */
    | {
          readonly kind: 'several-caps';
          readonly capsM3: readonly number[];
          readonly hits: readonly NlInhoudRuleHit[];
      }
    /** 🟡 volume sentences exist for the subject but none is an unconditional maximum. */
    | {
          readonly kind: 'no-unconditional-maximum';
          readonly hits: readonly NlInhoudRuleHit[];
      }
    /** ⚪ the text was read and the detector found no cubic-metre sentence for the subject. */
    | { readonly kind: 'no-cubic-rule-detected'; readonly otherSubjectHits: number }
    /** ⚫ the plan text was not read. About us. */
    | { readonly kind: 'text-not-examined' };

/**
 * Resolve the volume cap for ONE subject (default: the dwelling — woning / hoofdgebouw /
 * bedrijfswoning). Pure and total.
 *
 * ⚠ `no-cubic-rule-detected` is NOT F1. The detector is a regex over flattened prose; a miss says
 * the regex did not fire, not that the plan has no volume rule. `mechanism` stays `unknown`.
 */
export function resolveNlInhoud(opts: {
    readonly planText: string | null | undefined;
    /** Which subject the cap must be about. Default matches dwellings. */
    readonly subject?: RegExp;
}): NlInhoudResolution {
    if (typeof opts.planText !== 'string' || opts.planText.trim() === '') return { kind: 'text-not-examined' };
    const subject = opts.subject ?? /woning|hoofdgebouw|bedrijfswoning|boerderij/i;
    const all = extractNlInhoudRules(opts.planText);
    const mine = all.filter((h) => subject.test(h.subjectVerbatim ?? '') || subject.test(h.verbatim));
    if (mine.length === 0) return { kind: 'no-cubic-rule-detected', otherSubjectHits: all.length };
    const maxima = mine.filter((h) => h.quantifier === 'maximum');
    if (maxima.length === 0) return { kind: 'no-unconditional-maximum', hits: mine };
    const caps = [...new Set(maxima.flatMap((h) => h.numbersM3))].sort((a, b) => a - b);
    if (caps.length === 1) {
        const h = maxima[0]!;
        return { kind: 'cap-recovered', capM3: caps[0]!, subjectVerbatim: h.subjectVerbatim, verbatim: h.verbatim };
    }
    return { kind: 'several-caps', capsM3: Object.freeze(caps), hits: maxima };
}

/**
 * Project onto `RuleState` — against **D1** with `unit: 'm3'` (see the parameter-key debt above).
 *
 *   cap-recovered            → `resolved`, `extractable` (it came out of prose)
 *   several-caps             → `alternative`
 *   no-unconditional-maximum → `refused` / `requires-determination` — the only volume sentences are
 *                              conditional or minimum; a cap would be a determination we cannot make
 *   no-cubic-rule-detected   → `unrecovered` / `pdf` / mechanism `unknown`  ⚠ never `absent`
 *   text-not-examined        → `unrecovered` / `pdf` / mechanism `unknown`
 */
export function nlInhoudToRuleState(r: NlInhoudResolution, ref: RuleState['ref']): RuleState {
    switch (r.kind) {
        case 'cap-recovered':
            return {
                rule: 'D1',
                status: 'resolved',
                reachability: 'extractable',
                value: r.capM3,
                unit: 'm3',
                datum: null,
                provenance: 'pipeline-extracted',
                ref,
            };
        case 'several-caps':
            return {
                rule: 'D1',
                status: 'alternative',
                reachability: 'extractable',
                alternatives: r.capsM3.map((c) => `maximum inhoud ${c} m³`),
                ref,
            };
        case 'no-unconditional-maximum':
            return {
                rule: 'D1',
                status: 'refused',
                reachability: 'interpretive',
                basis: 'requires-determination',
                reason:
                    'the plan’s volume sentences for this subject are conditional (an afwijking / sloop ' +
                    'bonus) or minimums; no unconditional maximum is stated, and a conditional volume is ' +
                    'never an entitlement',
                ref,
            };
        case 'no-cubic-rule-detected':
            return {
                rule: 'D1',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'pdf',
                mechanism: 'unknown',
                stoppedAt:
                    'plan text read; the cubic-metre detector found no inhoud sentence for this subject ' +
                    `(${r.otherSubjectHits} hit(s) for other subjects). A detector miss is not proof of absence.`,
                ref,
            };
        case 'text-not-examined':
            return {
                rule: 'D1',
                status: 'unrecovered',
                partial: null,
                reachability: 'extractable',
                failure: 'pdf',
                mechanism: 'unknown',
                stoppedAt: 'plan text not read — inhoud lives in the regels, never in SVBP2012 maatvoering',
                ref,
            };
    }
}
