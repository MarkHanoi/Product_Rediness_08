// E8-TRIAL — the GOLD SET vocabulary.
//
// ⛔ PROVENANCE DISCIPLINE (the whole point of this file)
// -----------------------------------------------------
// Every gold value in `e8-gold-set.ts` was derived by READING THE DOCUMENT, not by
// running the extractor and blessing its output. A gold set derived from the
// subject measures nothing (§fake-more-capable-than-real). So every row carries:
//   - the exact PAGE of the exact document (pinned by sha256), and
//   - the exact QUOTE (prose) or the pdf.js COLUMN X POSITION (table cell)
// a human reviewer can check without trusting this lane.
//
// ⛔ EVERY ROW IS `humanConfirmed: false`. This trial is a SELF-ASSESSMENT until a
// human signs it. No number produced from this set may be reported as a validated
// precision figure — only as an UNCONFIRMED-BY-HUMAN reading.

import type { ExtractableField } from '../../../packages/ordinance-extraction/src/types.js';
import type { RuleUnit } from '../../../packages/ordinance-extraction/src/textExtract/types.js';

/**
 * What the SOURCE says about this (locator, field) — the label a human reviewer is
 * asked to confirm or correct.
 *
 * ⭐ The four members are NOT "right number / wrong number". Control 9 requires
 * UNKNOWN to be distinct from zero, and the failure this wave exists to prevent is
 * *a number emitted where the honest answer was no number* — which is only
 * measurable if "no number" is a first-class label.
 */
export type GoldLabel =
    /** A binding numeric value for this field at this locator. */
    | 'NUMBER'
    /** The locator is silent on this field. Emitting anything here is a fabrication. */
    | 'UNKNOWN'
    /**
     * The field IS regulated here, but its value lives elsewhere — on the zoning
     * drawing, in an annex, in a Gestaltungsplan, or in a discretionary decision.
     * The honest outcome is `stated-as-rule-not-value`, NEVER a number.
     */
    | 'RULE-NOT-VALUE'
    /**
     * A number appears at this locator but it is NOT this parcel's binding value:
     * a statutory ceiling (§17 BauNVO), an OVERRUN cap (§19(4)), a computed
     * consequence ("ergibt sich"), a design description, a MINIMUM, an absolute
     * elevation over a vertical datum, or a column that maps to no field at all.
     * Emitting it is the overstatement class this trial exists to count.
     */
    | 'NOT-A-PARCEL-RULE';

export type StratumId = 'CH-TABLE' | 'CH-PROSE' | 'DE-PROSE';

/** How the reviewer locates the evidence. */
export interface GoldEvidence {
    /** 1-based PDF page (not the document's printed page number). */
    readonly page: number;
    /** The exact text a reviewer reads to check this row. */
    readonly quote: string;
    /**
     * TABLE CELLS ONLY — the pdf.js text-item x position that PROVES which column
     * the value sits in. This is the geometric fact a flattened text stream
     * destroys, and it is why the CH gold values are checkable at all.
     */
    readonly columnX?: number;
    /** TABLE CELLS ONLY — the column header the x position resolves to. */
    readonly columnHeader?: string;
    /**
     * PROSE ONLY — a short verbatim phrase used to test whether an emitted rule's
     * `citation.sentence` actually points at THIS locator (the slot arm).
     * `null` where no anchor can exist (a table cell has no sentence).
     */
    readonly anchor?: string | null;
}

export interface GoldRow {
    readonly id: string;
    readonly stratum: StratumId;
    /** e.g. `p31/row-130` (table) or `p74/hoehenfestsetzung-hoechstmass` (prose). */
    readonly locator: string;
    readonly field: ExtractableField;
    readonly label: GoldLabel;
    /** The value for a NUMBER row; for NOT-A-PARCEL-RULE the value that must NOT be emitted. */
    readonly value: number | null;
    readonly unit: RuleUnit | null;
    readonly evidence: GoldEvidence;
    /**
     * Control-8 semantic qualifiers PRESENT IN THE SOURCE that must survive
     * normalization. A NUMBER row whose qualifiers are dropped downstream is a
     * different defect from a wrong number, and is recorded here so it is countable.
     */
    readonly qualifiers: readonly string[];
    /** Why this label — in words a human reviewer can dispute. */
    readonly reviewerNote: string;
    /** ⛔ ALWAYS false. Flipping this requires a named human and a date. */
    readonly humanConfirmed: false;
}

export interface Stratum {
    readonly id: StratumId;
    readonly label: string;
    readonly documentUrl: string;
    /** Pinned bytes — the loader REFUSES if the live document no longer matches. */
    readonly sha256: string;
    /** 1-based PDF pages fed to the extractor. */
    readonly pages: readonly number[];
    /**
     * ⭐ HOW THESE PAGES WERE CHOSEN — stated so a reader can judge the bias.
     * "Selecting on parse success is how a corpus certifies itself" (E8-SCOUT §4.4).
     */
    readonly selectionRule: string;
    /** Named, un-hidden biases of this stratum. */
    readonly declaredBias: readonly string[];
    readonly valueShape: 'table-cell' | 'prose';
    readonly ingestionPath: 'born-digital-text' | 'hybrid' | 'scanned';
    readonly country: 'CH' | 'DE';
    /** Was the extractor's grammar authored against this corpus? */
    readonly sample: 'in-sample' | 'out-of-sample';
}

export interface GoldSet {
    readonly version: string;
    readonly authoredOn: string;
    readonly authoredBy: string;
    readonly humanConfirmed: false;
    readonly strata: readonly Stratum[];
    readonly rows: readonly GoldRow[];
}
