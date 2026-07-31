// Germany — instrument precedence, as data.
//
// Source of the ordering: the Baugesetzbuch's own verbs, as measured over Berlin
// B-Plan 8-30 (`de/findings/GERMANY-PDF-INGESTION-WP1-WP6.md` §4, VERIFIED
// 2026-07-31 by running the parser over all 209 pages).
//
//   `festgesetzt` / `begrenzt auf` → §9 BauGB — THIS plan binds.   → binding-plan
//   `dargestellt`                  → §5 BauGB — a preparatory       → depiction
//                                    instrument merely DEPICTS.
//   `Überschreitung … § 19 Abs. 4` → BauNVO — a permitted OVERRUN,  → statute
//                                    never the base.
//
// THE DECISIVE LINE IS `binding-plan (0) < statute (2)`.
// Berlin's GRZ 0,8 is a CORRECT reading of a BINDING statute and it still loses,
// because §19(4) BauNVO grants an overrun ABOVE a base the plan sets — it is not
// itself the base. Taking it overstates buildable footprint 2×. Ranking, not
// rejection, is what produces 0,4 here: 0,8 is real law, just not the answer to
// "what is the GRZ".

import { type InstrumentPriorityTable } from '../priority.js';

export const GERMANY_PRIORITY_TABLE: InstrumentPriorityTable = {
    jurisdiction: 'de',
    displayName: 'Germany (BauGB / BauNVO)',
    citation:
        '§9 BauGB (Festsetzung) vs §5 BauGB (Darstellung); BauNVO §19(4) (Überschreitung). ' +
        'Measured over Berlin B-Plan 8-30 — GERMANY-PDF-INGESTION-WP1-WP6.md §4.',
    rank: {
        // The B-Plan's own Festsetzung — the parcel-specific determination.
        'binding-plan': 0,
        // A vorhabenbezogener B-Plan / Ergänzungssatzung for the same parcel.
        'special-plan': 1,
        // General law layered above the plan (BauNVO §19(4) overrun ceiling).
        statute: 2,
        // §5 BauGB — an FNP / Baunutzungsplan depiction. Never a Festsetzung.
        depiction: 3,
        // Out of force for this parcel.
        'superseded-plan': 4,
        // `catalogue-overlay` is DELIBERATELY ABSENT — see `note`.
    },
    note:
        'UNKNOWN: `catalogue-overlay` has no rank. The Denkmalschutz / Denkmalliste ' +
        'interaction with a B-Plan Festsetzung has not been researched in this repo, so ' +
        'it is left UNRANKABLE rather than guessed — a candidate of that kind forces a ' +
        '`conflicted` outcome, which is the correct answer to an unresearched question. ' +
        'Also UNKNOWN: temporal precedence. `effectiveFrom` is carried on every ' +
        'InstrumentRef and is not used to rank; only the structural `supersededBy` ' +
        'pointer demotes.',
};
