// E8-TRIAL — CH-PROSE gold rows: Bau- und Zonenreglement der Stadt Luzern, body
// articles (PDF pages 5, 6, 7, 15).
//
// ⭐ HOW THESE VALUES WERE READ. By reading the NORMALIZED page text produced by the
// repo's own reader (`tools/ordinance-trial/dump-normalized.ts`) — i.e. exactly the
// string the extractor is fed — and quoting the sentence each value sits in. Every
// `quote` below is verbatim from that output and re-checkable in one command.
//
// ⚠ DECLARED BIAS. These four pages were chosen because they carry the zone
// articles (Art. 7–13) and the height article (Art. 26–28). That is a CONTENT-
// DIRECTED selection: it supports a statement about PRECISION on rule-bearing text
// and about the SHAPE of the failures, and it does NOT support a document-level
// recall claim. Said plainly rather than buried (E8-SCOUT §4.4: "selecting on parse
// success is how a corpus certifies itself").

import type { GoldRow } from './types.js';

const S = 'CH-PROSE' as const;

export const CH_PROSE_ROWS: readonly GoldRow[] = [
    // ─────────────────────────── PDF page 5 — Art. 8, Art. 9 ───────────────────────────
    {
        id: 'ch-prose/p5-art8-dichtemass/maxCoverage',
        stratum: S,
        locator: 'p5/art-8-dichte-oez-sf-gr',
        field: 'maxCoverage',
        label: 'RULE-NOT-VALUE',
        value: null,
        unit: null,
        evidence: {
            page: 5,
            quote: 'Für die Zone für öffentliche Zwecke, die Zone für Sport- und Freizeitanlagen und die Grünzone legt der Stadtrat das zulässige Dichtemass unter Berücksichtigung der örtlichen Situation und der öffentlichen Interessen fest.',
            anchor: 'legt der Stadtrat das zulässige Dichtemass',
        },
        qualifiers: ['applicability: zones ÖZ, SF, GR only', 'discretionary: determined case-by-case by the Stadtrat'],
        reviewerNote:
            'The density measure for these three zones is REGULATED but not numeric — the Stadtrat fixes it per case. The honest outcome is a rule reference, never a number and never "not stated".',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p5-art9-abweichung/maxFloors',
        stratum: S,
        locator: 'p5/art-9-bestehende-bauten',
        field: 'maxFloors',
        label: 'NOT-A-PARCEL-RULE',
        value: 1,
        unit: null,
        evidence: {
            page: 5,
            quote: 'Die Geschosszahl darf maximal um ein Geschoss von der massgebenden Geschosszahl der betreffenden Zone abweichen.',
            anchor: 'maximal um ein Geschoss',
        },
        qualifiers: ['applicability: replacement of EXISTING buildings only', 'relative to the zone value, not absolute'],
        reviewerNote:
            'A RELATIVE tolerance (±1 storey) for replacement buildings. Emitting maxFloors = 1 from this sentence would turn a tolerance into an absolute cap.',
        humanConfirmed: false,
    },

    // ─────────────────────── PDF page 6 — percentage distractors ───────────────────────
    {
        id: 'ch-prose/p6-fremdnutzung-15pct/maxCoverage',
        stratum: S,
        locator: 'p6/art-10a-verkehrshauszone',
        field: 'maxCoverage',
        label: 'NOT-A-PARCEL-RULE',
        value: 15,
        unit: null,
        evidence: {
            page: 6,
            quote: 'Der Anteil dieser Fremdnutzungen darf maximal 15 % der Hauptnutzflächen betragen.',
            anchor: 'maximal 15 % der Hauptnutzflächen',
        },
        qualifiers: ['a USE-MIX share of Hauptnutzfläche, not a land coverage'],
        reviewerNote: 'A use-mix percentage. Not a coverage, not a FAR, not a height. Present as a distractor.',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p6-umnutzung-20pct/maxCoverage',
        stratum: S,
        locator: 'p6/art-10-tourismuszone',
        field: 'maxCoverage',
        label: 'NOT-A-PARCEL-RULE',
        value: 20,
        unit: null,
        evidence: {
            page: 6,
            quote: 'Es können 20 Prozent der im Zeitpunkt des Inkrafttretens der Bau- und Zonenordnung bewilligten, tatsächlich touristisch genutzten Fläche voraussetzungslos für Wohn- und Arbeitsnutzungen umgenutzt werden.',
            anchor: '20 Prozent der im Zeitpunkt des Inkrafttretens',
        },
        qualifiers: ['a CONVERSION share of existing tourist floor area'],
        reviewerNote: 'A conversion quota. Not an envelope parameter. Present as a distractor.',
        humanConfirmed: false,
    },

    // ───────────────────── PDF page 7 — Art. 11 Abs. 5, Art. 12 ─────────────────────
    {
        id: 'ch-prose/p7-art11-sportarena-21/maxHeight_m',
        stratum: S,
        locator: 'p7/art-11-abs-5-sportarena',
        field: 'maxHeight_m',
        label: 'NUMBER',
        value: 21,
        unit: 'm',
        evidence: {
            page: 7,
            quote: 'In der Zone mit der Ordnungsnummer 521 gilt für die neue Sportarena eine Fassadenhöhe von max. 21 m (exklusive technischer Aufbauten und Spielfeldbeleuchtung), für das neue Breitensportgebäude eine Fassadenhöhe von max. 24 m (exklusive technischer Aufbauten) und für die Hochhäuser eine Fassadenhöhe von max. 88 m (exklusive technischer Aufbauten).',
            anchor: 'für die neue Sportarena eine Fassadenhöhe von max. 21 m',
        },
        qualifiers: [
            'applicability: Ordnungsnummer 521, and WITHIN it only the Sportarena',
            'exclusion: exklusive technischer Aufbauten und Spielfeldbeleuchtung',
            'provisional: "Die detaillierten Höhen werden im Gestaltungsplan festgelegt."',
            'datum: Fassadenhöhe — NO SEAT in HeightMeasurement',
        ],
        reviewerNote:
            'Binding for ONE building inside zone 521. An unqualified emission of 21 m as the zone height is wrong in both directions — too low for the Hochhäuser (88 m), too high for anything not named.',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p7-art11-breitensport-24/maxHeight_m',
        stratum: S,
        locator: 'p7/art-11-abs-5-breitensportgebaeude',
        field: 'maxHeight_m',
        label: 'NUMBER',
        value: 24,
        unit: 'm',
        evidence: {
            page: 7,
            quote: 'für das neue Breitensportgebäude eine Fassadenhöhe von max. 24 m (exklusive technischer Aufbauten)',
            anchor: 'Breitensportgebäude eine Fassadenhöhe von max. 24 m',
        },
        qualifiers: [
            'applicability: Ordnungsnummer 521, Breitensportgebäude only',
            'exclusion: exklusive technischer Aufbauten',
            'datum: Fassadenhöhe — NO SEAT',
        ],
        reviewerNote: 'Second of three per-building heights in one sentence.',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p7-art11-hochhaeuser-88/maxHeight_m',
        stratum: S,
        locator: 'p7/art-11-abs-5-hochhaeuser',
        field: 'maxHeight_m',
        label: 'NUMBER',
        value: 88,
        unit: 'm',
        evidence: {
            page: 7,
            quote: 'für die Hochhäuser eine Fassadenhöhe von max. 88 m (exklusive technischer Aufbauten)',
            anchor: 'für die Hochhäuser eine Fassadenhöhe von max. 88 m',
        },
        qualifiers: [
            'applicability: Ordnungsnummer 521, the two Hochhäuser only',
            'exclusion: exklusive technischer Aufbauten',
            'gated: Gestaltungsplanpflicht (Art. 11 Abs. 4)',
            'datum: Fassadenhöhe — NO SEAT',
        ],
        reviewerNote:
            '⭐ THE OVERSTATEMENT TEST OF THIS STRATUM. 88 m is binding for two named towers. Applied to zone 521 as a whole it is a 4x overstatement over the same sentence\'s 21 m — with a perfectly correct citation.',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p7-art12-geschosszahl-zonenplan/maxFloors',
        stratum: S,
        locator: 'p7/art-12-abs-1-tribschenstadtzone',
        field: 'maxFloors',
        label: 'RULE-NOT-VALUE',
        value: null,
        unit: null,
        evidence: {
            page: 7,
            quote: 'In der Wohnzone mit der Ordnungsnummer 183 ist die Geschosszahl gemäss Zonenplan zulässig.',
            anchor: 'die Geschosszahl gemäss Zonenplan zulässig',
        },
        qualifiers: ['applicability: Ordnungsnummer 183', 'value lives ON THE DRAWING (Zonenplan)'],
        reviewerNote:
            '⭐ THE `on-drawing` CASE, in Swiss wording. The parameter IS regulated; its value is on the Zonenplan. Reporting "not stated in text" would collapse a real, differently-shaped answer into a silent empty (§CONTEXT-DATA-HONESTY, control 9).',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p7-art12-dachrandkote/maxHeight_m',
        stratum: S,
        locator: 'p7/art-12-abs-2-dachrandkote',
        field: 'maxHeight_m',
        label: 'RULE-NOT-VALUE',
        value: null,
        unit: null,
        evidence: {
            page: 7,
            quote: 'In der Wohn- und Arbeitszone mit der Ordnungsnummer 55 sind die Geschosszahl oder die Dachrandkote in m ü. M. gemäss Zonenplan zulässig.',
            anchor: 'die Dachrandkote in m ü. M. gemäss Zonenplan',
        },
        qualifiers: [
            'applicability: Ordnungsnummer 55',
            'value lives ON THE DRAWING (Zonenplan)',
            '⚠ DATUM: "m ü. M." = metres ABOVE SEA LEVEL, an absolute elevation — NOT a height above ground',
        ],
        reviewerNote:
            'Same absolute-elevation datum trap as Berlin\'s "über NHN" (see the DE stratum). A Dachrandkote read as a building height would be an order-of-magnitude overstatement.',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p7-art12-attika-2m/setback.front',
        stratum: S,
        locator: 'p7/art-12-abs-3-attika',
        field: 'setback.front',
        label: 'NOT-A-PARCEL-RULE',
        value: 2,
        unit: null,
        evidence: {
            page: 7,
            quote: 'Sie sind samt allfälligen Dachvorsprüngen von allen Baulinien mindestens 2 m zurückzuversetzen und haben Flachdächer aufzuweisen.',
            anchor: 'von allen Baulinien mindestens 2 m zurückzuversetzen',
        },
        qualifiers: ['applies to Attikageschosse und Aufbauten ONLY', 'measured from Baulinien, not from the parcel boundary'],
        reviewerNote:
            'A setback for roof storeys from BUILDING LINES — not a parcel setback. Emitting it as setback.front would mis-scope a real rule.',
        humanConfirmed: false,
    },

    // ─────────────────────── PDF page 15 — Art. 26, Art. 27 ───────────────────────
    {
        id: 'ch-prose/p15-art26-fassadenhoehe-21/maxHeight_m',
        stratum: S,
        locator: 'p15/art-26-abs-1-fassadenhoehe',
        field: 'maxHeight_m',
        label: 'NUMBER',
        value: 21,
        unit: 'm',
        evidence: {
            page: 15,
            quote: 'Die maximale Fassadenhöhe beträgt 21 m und die maximale Firsthöhe 27 m gemessen an jedem Punkt der Fassade.',
            anchor: 'Die maximale Fassadenhöhe beträgt 21 m',
        },
        qualifiers: [
            'measurement basis: "gemessen an jedem Punkt der Fassade" — at EVERY point of the facade, not at a centroid (the §TERRAIN-RASANT class)',
            'escape: Art. 26 Abs. 3 lets the Stadtrat permit minor exceedances',
            'datum: Fassadenhöhe — NO SEAT in HeightMeasurement',
        ],
        reviewerNote:
            'The city-wide facade height. Its measurement basis is the load-bearing qualifier: a per-point rule cannot be satisfied by one centroid sample (L-584).',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p15-art26-firsthoehe-27/maxHeight_m',
        stratum: S,
        locator: 'p15/art-26-abs-1-firsthoehe',
        field: 'maxHeight_m',
        label: 'NUMBER',
        value: 27,
        unit: 'm',
        evidence: {
            page: 15,
            quote: 'Die maximale Fassadenhöhe beträgt 21 m und die maximale Firsthöhe 27 m gemessen an jedem Punkt der Fassade.',
            anchor: 'die maximale Firsthöhe 27 m',
        },
        qualifiers: [
            'datum: Firsthöhe (ridge) — DISTINCT from the 21 m Fassadenhöhe in the SAME sentence',
            'measurement basis: gemessen an jedem Punkt der Fassade',
        ],
        reviewerNote:
            '⭐ Two heights, two datums, one sentence, 6 m apart. An extractor that keeps only one number, or that stamps the wrong datum on it, has lost the rule even though the digits are right (control 8).',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p15-art26-sechs-vollgeschosse/maxFloors',
        stratum: S,
        locator: 'p15/art-26-abs-2-vollgeschosse',
        field: 'maxFloors',
        label: 'NUMBER',
        value: 6,
        unit: 'storeys',
        evidence: {
            page: 15,
            quote: 'Es dürfen maximal sechs Vollgeschosse gebaut werden.',
            anchor: 'maximal sechs Vollgeschosse',
        },
        qualifiers: ['city-wide cap', 'Art. 26 Abs. 4 permits ONE additional Vollgeschoss in Ordnungsnummer 105 only'],
        reviewerNote:
            '⭐ THE WORD-FORM TEST. The value is written "sechs", not "6". A digit-only matcher reports "not stated in text" for a rule that is plainly stated — a silent empty standing in for a real value.',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p15-art26-zone105-24/maxHeight_m',
        stratum: S,
        locator: 'p15/art-26-abs-4-zone-105',
        field: 'maxHeight_m',
        label: 'NUMBER',
        value: 24,
        unit: 'm',
        evidence: {
            page: 15,
            quote: 'In der Wohnzone mit der Ordnungsnummer 105 beträgt die Fassadenhöhe max. 24 m.',
            anchor: 'Ordnungsnummer 105 beträgt die Fassadenhöhe max. 24 m',
        },
        qualifiers: ['applicability: Ordnungsnummer 105 ONLY', 'datum: Fassadenhöhe — NO SEAT'],
        reviewerNote:
            'A zone-scoped exception to the 21 m city-wide rule. Emitted without its applicability qualifier it overstates every other zone by 3 m (control 8 + control 9).',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p15-art26-siebtes-vg/maxFloors',
        stratum: S,
        locator: 'p15/art-26-abs-4-siebtes-vollgeschoss',
        field: 'maxFloors',
        label: 'NOT-A-PARCEL-RULE',
        value: 7,
        unit: null,
        evidence: {
            page: 15,
            quote: 'Es kann ein zusätzliches Vollgeschoss gebaut werden, wenn dadurch eine städtebaulich bessere Lösung erzielt wird. Über dem siebten Vollgeschoss ist kein Attikageschoss zulässig.',
            anchor: 'Über dem siebten Vollgeschoss',
        },
        qualifiers: [
            'applicability: Ordnungsnummer 105 only',
            'conditional: "wenn dadurch eine städtebaulich bessere Lösung erzielt wird" — a DISCRETIONARY grant, not an entitlement',
        ],
        reviewerNote:
            'The 7th storey is CONDITIONAL and zone-scoped. Emitting maxFloors = 7 turns a discretionary bonus into a general entitlement — the §L-616 shape.',
        humanConfirmed: false,
    },
    {
        id: 'ch-prose/p15-art27-anhang1-verweis/maxHeight_m',
        stratum: S,
        locator: 'p15/art-27-abs-1-hochhaeuser',
        field: 'maxHeight_m',
        label: 'RULE-NOT-VALUE',
        value: null,
        unit: null,
        evidence: {
            page: 15,
            quote: 'Hochhausstandorte sind in den Teilzonenplänen und die maximalen Fassadenhöhen in den Zonen- und Dichtebestimmungen im Anhang 1 festgelegt.',
            anchor: 'die maximalen Fassadenhöhen in den Zonen- und Dichtebestimmungen im Anhang 1',
        },
        qualifiers: ['value lives in Anhang 1 (the table of the CH-TABLE stratum)', 'sites live on the Teilzonenpläne'],
        reviewerNote:
            'An explicit cross-reference from prose INTO the annex table. This is the seam between the two CH strata: the prose knows where the number is, and the prose reader cannot supply it.',
        humanConfirmed: false,
    },
];
