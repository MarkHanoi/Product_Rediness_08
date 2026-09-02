// ADAPTER (Switzerland) — the Luzern Bau- und Zonenreglement "Anhang 1 Zonen- und
// Dichtebestimmungen" as DATA.
//
// ⛔ CONTROL 5: country semantics live in adapters; the generic logic is
// country-agnostic. Everything here is a table of regexes and vocabulary. There is
// no Swiss LOGIC anywhere — `structure/tables.ts` does not know what "FH" means,
// and `spine/readers.ts` does not know that Switzerland exists.
//
// ── WHY THIS DOCUMENT AND WHY THIS TABLE ─────────────────────────────────────
// ÖREB (`svc.geo.lu.ch/oereb/extract/json/?EGRID=…`) dereferences a parcel's
// zoning restriction to an EXACT PDF address — `geoshop.lu.ch/pdf/luze_BZR.pdf` —
// and publishes `InstrumentKind` and `LegalStatus` as METADATA. Measured
// 2026-09-01: 594,982 bytes · 46 pp · 69,714 chars · 46/46 text pages ·
// born-digital. CH is the easiest READ in Europe and the hardest TABLE, and this
// is the table:
//
//     Nr. | Zonenart | A/B | ÜZ | GL | VG | FH | g/o | Weitere Bestimmungen
//
// Flattened to a text stream it reads `10 WA 0.15 21 geschlossen`, and a
// line-based grammar reads "21 Vollgeschosse" — a 7x overstatement of a
// three-storey zone, with a correct citation attached, that the locale gate, the
// range gate, dual-pass agreement and n-gram containment would ALL pass. Read as a
// GRID the `21` lands in FH (x=348.3) and never in VG (x=300.4). That is the
// entire reason Layer 3 exists.
//
// ⚠ THE ENVELOPE IS STILL REFUSED FOR SWITZERLAND. `rulepacks/chZoning.ts` states,
// correctly, that height/floors/FAR are "not modelled anywhere (cantonal
// Baureglement PDF only)" and draws no envelope. Nothing here changes that: this
// adapter produces tier-4 CLAIMS carrying evidence, not facts, and no provider is
// registered (L-12871 stays OPEN). A claim is what a human validates INTO a fact.

import { type QualifierLexicon } from '../gates/qualifierSurvival.js';
import { type ZoneTableSchema } from '../spine/readers.js';

/**
 * German-language planning qualifiers (Swiss usage). CONTROL 8's vocabulary: each
 * phrase changes what the number means, and a claim that drops it states as
 * unconditional what the ordinance states conditionally.
 */
export const SWISS_GERMAN_QUALIFIERS: QualifierLexicon = Object.freeze({
    language: 'de-CH',
    patterns: Object.freeze([
        // ⭐ THE BOUND PATTERNS MATCH COMPOUND STEMS, NOT WHOLE WORDS, AND CARRY A
        // POLARITY. GERMAN COMPOUNDS ARE WHY — measured 2026-09-02 (lane E8-SPINE)
        // on the real cached Berlin document `0100062b_1-62b.pdf`. These read
        // `/mindestens/`, `/h(ö|oe)chstens/` and `/maximal/`, and German ordinance
        // prose does not use those words: it welds the stem onto the noun.
        //
        //     "einer MINDESTBAUHÖHE (Oberkante) von 19,0 m"     ← /mindestens/ MISSED
        //     "als HÖCHSTZULÄSSIGE Nutzungsmaße … GRZ von 0,5"  ← /höchstens/ MISSED
        //     "die durch § 17 BauNVO bestimmte OBERGRENZE der GFZ von 1,2"
        //
        // Every one MISSED, so the gate returned `not-applicable` — a SILENT PASS —
        // on precisely the spans whose qualifier mattered most, and the first of
        // them published a MINIMUM into `maxHeight_m`. A thin lexicon does not make
        // a gate lenient, it makes it BLIND; the gate's own doc says to read
        // `not-applicable` as a statement about the lexicon. `\w` is [A-Za-z0-9_]
        // and STOPS AT AN UMLAUT, so the class is spelled out explicitly.
        {
            id: 'de-hoechstens',
            pattern: /h(ö|oe)chst[a-zäöüß]*/u,
            kind: 'bound' as const,
            polarity: 'max' as const,
            detail: 'the value is a CEILING, not a determination — "höchstens 21 m" is not "21 m".',
        },
        {
            id: 'de-mindestens',
            pattern: /mindest[a-zäöüß]*/u,
            kind: 'bound' as const,
            polarity: 'min' as const,
            detail: 'the value is a FLOOR, not a ceiling — inverting it inverts the envelope.',
        },
        {
            id: 'de-maximal',
            pattern: /\bmax\.?\b|maximal[a-zäöüß]*/u,
            kind: 'bound' as const,
            polarity: 'max' as const,
            detail: 'an explicit maximum.',
        },
        {
            id: 'de-obergrenze',
            pattern: /obergrenze[a-zäöüß]*/u,
            kind: 'bound' as const,
            polarity: 'max' as const,
            detail: 'an upper limit set by a superior instrument (BauNVO § 17) — a ceiling.',
        },
        {
            id: 'de-untergrenze',
            pattern: /untergrenze[a-zäöüß]*/u,
            kind: 'bound' as const,
            polarity: 'min' as const,
            detail: 'a lower limit — reading it as a ceiling inverts the envelope.',
        },
        {
            id: 'ch-gestaltungsplanpflicht',
            pattern: /Gestaltungsplanpflicht/u,
            kind: 'condition' as const,
            detail:
                'the zone may only be built under an approved Gestaltungsplan (PBG §§ 62 ff.) — ' +
                'the tabulated numbers are not directly exercisable without one.',
        },
        {
            id: 'de-gilt-nicht',
            pattern: /gilt nicht(\s+f(ü|ue)r)?/u,
            kind: 'exception' as const,
            detail: 'an article is DISAPPLIED here — dropping it converts a conditional rule into an unconditional one.',
        },
        {
            id: 'de-sofern',
            pattern: /\bsofern\b/u,
            kind: 'condition' as const,
            detail: 'the value binds only if the stated condition holds.',
        },
        {
            id: 'de-nur-fuer',
            pattern: /nur f(ü|ue)r/u,
            kind: 'applicability' as const,
            detail: 'the value binds only for the named parcels/area, not for the whole zone.',
        },
        {
            id: 'de-vorbehalten',
            pattern: /vorbehalten|Vorbehalt/u,
            kind: 'condition' as const,
            detail: 'a reservation: another instrument may override.',
        },
        {
            id: 'de-orientierungswert',
            pattern: /Orientierungswert|richtwert/u,
            kind: 'force' as const,
            detail: 'ADVISORY, not binding — belongs in `normativeForce`, never silently promoted.',
        },
        {
            id: 'de-zurueckgestellt',
            pattern: /zur(ü|ue)ckgestellt/u,
            kind: 'temporal' as const,
            detail: 'approval was withheld/deferred for this entry — the row is not in force as printed.',
        },
    ]),
});

/**
 * The Luzern BZR Anhang-1 column bindings.
 *
 * ⭐ TWO SEATS ARE USED HERE EXACTLY AS THE R-BATCH INTENDED, and one gap is
 * RECORDED rather than papered over:
 *
 *  - `ÜZ` carries `landBasis: 'unknown'`, NOT `undefined` and NOT `'parcel'`. The
 *    table states the ratio; its denominator (anrechenbare Grundstücksfläche) is
 *    defined in cantonal law, not here. `'unknown'` is the ordinance stating a
 *    ratio without its denominator; `undefined` would mean PRYZM never looked.
 *    Control 9: they are different facts and they refuse differently.
 *
 *  - `FH` carries `valueBasis: {scheme:'ch-lu-hoehenbezug', code:'Fassadenhoehe'}` —
 *    R2's seat, carried VERBATIM in the source's own vocabulary, mapped nowhere.
 *    ⭐ DISCOVERY, RECORDED NOT ACTED ON (control 10): `HeightMeasurement`
 *    (`eaves | ridge | building | unknown`) has NO member for Fassadenhöhe, which
 *    is a distinct Swiss datum (PBV) and is NOT Traufhöhe. Forcing it to
 *    `'building'` would be an invented harmonisation and `'unknown'` would be a
 *    lie (the datum IS stated). So `measurement` is omitted and R2 carries the
 *    truth. Extending the datum vocabulary is a later lane's call.
 */
export const LUZERN_BZR_ANHANG1: ZoneTableSchema = Object.freeze({
    id: 'ch-lu-bzr-anhang1',
    language: 'de-CH',
    keyColumn: /^Nr\.?$/u,
    // ⭐ `ch`, NOT `de`. Swiss German writes 0.15 with a DOT decimal; reading the
    // Überbauungsziffer under the German convention yields 15 — a 100× coverage
    // overstatement that the locale gate CONFIRMS as correct, because it verifies
    // against the convention it is told. See `gates/localeGate.ts` NumberLocale.
    locale: 'ch' as const,
    columns: Object.freeze([
        {
            headerPattern: /^(ÜZ|UZ)$/u,
            field: 'maxCoverage' as const,
            unit: null,
            landBasis: 'unknown' as const,
        },
        {
            headerPattern: /^VG$/u,
            field: 'maxFloors' as const,
            unit: null,
        },
        {
            headerPattern: /^FH$/u,
            field: 'maxHeight_m' as const,
            unit: 'm',
            valueBasis: Object.freeze({ scheme: 'ch-lu-hoehenbezug', code: 'Fassadenhoehe' }),
        },
    ]),
    // "Weitere Bestimmungen" is where Gestaltungsplanpflicht, disapplied articles
    // and parcel-specific carve-outs live. It is the qualifier column, and losing
    // it is losing the conditions the numbers hang on.
    qualifierColumns: Object.freeze([/^Weitere Bestimmungen$/u]),
    lexicon: SWISS_GERMAN_QUALIFIERS,
});
