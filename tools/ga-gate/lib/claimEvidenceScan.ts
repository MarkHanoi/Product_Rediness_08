/**
 * @file tools/ga-gate/lib/claimEvidenceScan.ts
 *
 * Shared PURE scanners for the E8 claim-honesty gate battery (spec §20 — AI
 * INTERPRETS, DETERMINISTIC COMPUTES). Three gates read this module:
 *
 *   check-no-silent-graduation.ts        — a tier never rises without a validation event
 *   check-claim-carries-evidence.ts      — a tier-4 claim carries its span + address
 *   check-unvalidated-claim-not-a-constraint.ts — an unvalidated claim never becomes a constraint
 *
 * ── WHY A SHARED MODULE AND NOT THREE COPIES ─────────────────────────────────
 * §GREP-FOR-THE-EXISTING-SOLVER. Three gates need the same three text scans, and
 * three copies of a regex is how two of them end up policing slightly different
 * things under one name. The COMMENT LEXER is likewise not forked: it is
 * `sourceScan.stripCommentsToLines`, the repo's one authority — the P3 lesson
 * (§RAF-GATE-COMMENT-BLIND) is that a gate counting SENTENCES instead of code
 * reports 5 owners where there is 1.
 *
 * ── EVERY SCANNER TAKES TEXT, NEVER A PATH ───────────────────────────────────
 * Deliberate, and it is what makes the planted-violation controls possible
 * WITHOUT writing a fixture into a real package tree. A gate that has to write a
 * poisoned file into `packages/*` to prove it has teeth is one crashed process
 * away from leaving the poison behind.
 *
 * PURE: no I/O, no network, no writes. Deterministic in its inputs.
 */

/**
 * The `EnvelopeConfidence` members STRICTLY STRONGER than
 * `pipeline-extracted-unverified` on the one L0 ladder
 * (`ENVELOPE_CONFIDENCE_ORDER`, `packages/schemas/src/site/zoning/ProvenanceFlags.ts`).
 *
 * ⚠ Written here as text because this is a TEXT scanner — it reads source it has
 * not imported. The runtime ladder is imported and driven separately by
 * check-no-silent-graduation's executed arms, and the two are cross-checked
 * against each other on every run, so this list cannot silently drift from the
 * enum it describes.
 */
export const TIERS_ABOVE_PIPELINE: readonly string[] = [
    'authoritative',
    'structured',
    'block-constructed',
    'estimated-ruleset',
];

/** The pipeline tier's own spelling — the only tier an extractor may mint. */
export const PIPELINE_TIER_NAME = 'pipeline-extracted-unverified';

/** One text finding. `line` is the real 1-based line number in the file on disk. */
export interface ScanFinding {
    readonly path: string;
    readonly line: number;
    readonly detail: string;
    readonly text: string;
}

/**
 * KEYS whose VALUE position is a confidence-tier ASSIGNMENT. A stronger-tier
 * literal here is a MINT; the same literal inside `forbiddenTiers: [...]` is not,
 * which is why this scan is key-aware rather than a bare literal grep.
 *
 * ⚠ MEASURED, not guessed: `grammars/germanRegimes.ts:73` really does hold
 * `forbiddenTiers: ['structured', 'authoritative']`, and a literal-only scan
 * flags it. A gate whose first real reading is a false positive gets muted.
 */
const CONFIDENCE_ASSIGN_KEYS: readonly string[] = [
    'confidence',
    'defaultConfidence',
    'envelopeConfidence',
    'promoteTo',
    'publishedConfidence',
    'tier',
];

/**
 * Scan CLEANED source lines for a confidence tier STRONGER than the pipeline tier
 * being MINTED (assigned, returned, or defaulted).
 *
 * Scoped by the caller — the intended subject is `packages/ordinance-extraction/src`,
 * the extraction producer, which may never mint anything above the pipeline tier.
 *
 * ⚠ HONEST LIMIT, stated so nobody over-reads a green: this is a TEXT scan. A tier
 * assembled at runtime (`TIERS[i]`, a variable, a helper's return) is invisible to
 * it. It catches the LITERAL mint, which is the shape every current producer uses;
 * the executed arms in check-no-silent-graduation are what bind the BEHAVIOUR.
 */
export function scanMintedTiers(cleanedLines: readonly string[], path: string): ScanFinding[] {
    const out: ScanFinding[] = [];
    for (let i = 0; i < cleanedLines.length; i++) {
        const line = cleanedLines[i]!;
        for (const tier of TIERS_ABOVE_PIPELINE) {
            const lit = new RegExp(`['"\`]${tier}['"\`]`);
            const idx = line.search(lit);
            if (idx === -1) continue;
            // Key-aware: only a value POSITION under an assignment key is a mint.
            const before = line.slice(0, idx);
            const assigning =
                CONFIDENCE_ASSIGN_KEYS.some((k) =>
                    new RegExp(`\\b${k}\\b\\s*[:=]\\s*\\(?\\s*$`).test(before),
                ) || /\breturn\s*$/.test(before);
            if (!assigning) continue;
            out.push({
                path,
                line: i + 1,
                text: line.trim(),
                detail:
                    `mints EnvelopeConfidence '${tier}', which is STRONGER than ` +
                    `'${PIPELINE_TIER_NAME}' — an extraction producer may mint only the ` +
                    'pipeline tier (LOCK 3 / C58 §1.6; the only door up is a recorded human sign-off)',
            });
        }
    }
    return out;
}

/**
 * Scan CLEANED source lines for a MACHINE minting a HUMAN VALIDATION EVENT —
 * the single door out of the pipeline tier, and out of six-tier tier 5.
 *
 * Two shapes are findings:
 *   • `humanVerifiedBy: <non-null literal>` — a machine writing a human's signature.
 *   • `derivation: 'HUMAN_VALIDATED'`       — a machine claiming a human validated.
 *
 * `humanVerifiedBy: null` is CORRECT and is never a finding: it is the producer
 * honestly recording that nobody has signed (`pipeline.ts:121` does exactly this).
 */
export function scanHumanValidationMint(
    cleanedLines: readonly string[],
    path: string,
): ScanFinding[] {
    const out: ScanFinding[] = [];
    for (let i = 0; i < cleanedLines.length; i++) {
        const line = cleanedLines[i]!;
        const hv = /\bhumanVerifiedBy\b\s*[:=]\s*([^,;}\n]+)/.exec(line);
        if (hv) {
            const value = hv[1]!.trim();
            const isNullish = /^(null|undefined)\b/.test(value);
            // A parameter/type position (`humanVerifiedBy: string | null`) is a
            // DECLARATION, not a write. Type text is not a value.
            const isTypePosition =
                /^(string|number|boolean|\(|Pick<|Omit<|z\.|readonly\b)/.test(value) ||
                value.includes('|');
            if (!isNullish && !isTypePosition) {
                out.push({
                    path,
                    line: i + 1,
                    text: line.trim(),
                    detail:
                        `writes humanVerifiedBy = ${value} — a human validation EVENT minted in ` +
                        'code. The door out of the pipeline tier is a RECORDED sign-off, never a ' +
                        'literal a producer supplies for itself (C58 §1.6 / ExtractionProvenance)',
                });
            }
        }
        if (/\bderivation\b\s*[:=]\s*['"`]HUMAN_VALIDATED['"`]/.test(line)) {
            out.push({
                path,
                line: i + 1,
                text: line.trim(),
                detail:
                    "mints derivation: 'HUMAN_VALIDATED' — six-tier tier 5 upgrades ONLY on a " +
                    'recorded validation event (RuleProvenanceSchema superRefine); a code path ' +
                    'that writes this literal IS an automatic graduation path',
            });
        }
    }
    return out;
}

/** How many lines either side of a producer site count as its object literal. */
export const AI_PRODUCER_WINDOW = 14;

/**
 * Scan CLEANED source lines for a site that PRODUCES an AI-extracted claim —
 * `derivation: 'AI_EXTRACTED'` — and check that its object literal also carries
 * BOTH halves of the evidence a tier-4 claim owes:
 *
 *   • a VERBATIM SPAN  — rase / verbatim / sentence / citation / span / requirement
 *   • a DOCUMENT ADDRESS — document
 *
 * ⚠ HONEST LIMIT. This is a WINDOW heuristic over text, not a type check: it
 * proves the two words appear near the producer, not that the span is real or the
 * address resolves. The EXECUTED arm (which walks parsed rules) is what binds
 * that; this arm exists so a producer written tomorrow in a file no corpus walk
 * reaches cannot land evidence-free and unnoticed.
 *
 * ⚠ It deliberately does NOT flag three NON-producer shapes, all of which are
 * live in the tree today and all of which must stay clean:
 *   • the schema's own enum member (`'AI_EXTRACTED',` inside a `z.enum([...])`);
 *   • a `case 'AI_EXTRACTED':` CONSUMER arm;
 *   • a TYPE-LEVEL narrowing — `readonly derivation: 'AI_EXTRACTED';` — which is
 *     the tier lock expressed in the type system, i.e. the OPPOSITE of the defect.
 *
 * ⚠ THE THIRD EXCLUSION WAS ADDED AFTER A MEASURED FALSE POSITIVE, not in
 * anticipation. On 2026-09-01 this scan's first live reading flagged
 * `packages/ordinance-extraction/src/spine/types.ts`, where
 * `ExtractionClaimProvenance` narrows `RuleProvenance['derivation']` to the
 * literal so that a tier-1/2/3/5 claim does not compile. Flagging a type-level
 * lock as an unevidenced producer is exactly the false positive this file's own
 * header warns gets a gate muted, so the SCANNER was fixed, never the ledger.
 *
 * TWO SOUND ONE-WAY DISCRIMINATORS separate a type member from a value:
 *   • a `readonly` prefix is legal ONLY in a type/interface member;
 *   • a `;` terminating the property is ILLEGAL in an object literal.
 * A bare `derivation: 'AI_EXTRACTED'` with neither (the last property of a
 * multi-line object literal) stays FLAGGED — conservative by choice: a producer
 * must carry its evidence, and the cost of asking is a comment.
 */
/**
 * Is this ONE cleaned line a VALUE-position `derivation: 'AI_EXTRACTED'` — a site
 * that PRODUCES a tier-4 claim? Exported so the census a gate PRINTS and the
 * findings it RAISES can never disagree about what a producer is: two counters
 * drifting apart under one name is the `commandManager` defect (CLAUDE.md P4,
 * "three denominators, three verdicts, one subject").
 */
export function isAiExtractedProducerLine(line: string): boolean {
    const hit = /\bderivation\b\s*[:=]\s*['"`]AI_EXTRACTED['"`](.*)$/.exec(line);
    if (!hit) return false;
    if (/^\s*readonly\s+derivation\b/.test(line)) return false; // type/interface member
    if (/^\s*;?\s*$/.test(hit[1] ?? '') && /;\s*$/.test(line)) return false; // `;`-terminated ⇒ type
    return true;
}

export function scanAiExtractedProducers(
    cleanedLines: readonly string[],
    path: string,
): ScanFinding[] {
    const out: ScanFinding[] = [];
    for (let i = 0; i < cleanedLines.length; i++) {
        const line = cleanedLines[i]!;
        // PRODUCER shape only: the literal in a `derivation:` VALUE position.
        if (!isAiExtractedProducerLine(line)) continue;
        const lo = Math.max(0, i - AI_PRODUCER_WINDOW);
        const hi = Math.min(cleanedLines.length, i + AI_PRODUCER_WINDOW + 1);
        const window = cleanedLines.slice(lo, hi).join('\n');
        const hasSpan = /\b(rase|verbatim|sentence|citation|span|requirement)\b/.test(window);
        const hasDocument = /\bdocument\b/.test(window);
        if (hasSpan && hasDocument) continue;
        const missing = [
            hasSpan ? null : 'a VERBATIM SPAN (rase/verbatim/sentence/citation/span/requirement)',
            hasDocument ? null : 'a DOCUMENT ADDRESS (document)',
        ].filter((x): x is string => x !== null);
        out.push({
            path,
            line: i + 1,
            text: line.trim(),
            detail:
                `produces derivation: 'AI_EXTRACTED' with no ${missing.join(' and no ')} within ` +
                `±${AI_PRODUCER_WINDOW} lines — a tier-4 claim with no reviewable evidence is not a ` +
                'claim, it is an unattributed number (spec §20)',
        });
    }
    return out;
}
