#!/usr/bin/env npx tsx
/**
 * @file tools/ga-gate/check-no-silent-graduation.ts
 *
 * GA Gate — NO SILENT GRADUATION (lane E8-GATES, 2026-09-01).
 * Spec §20 · C58 §1.2/§1.6 · ORDINANCE-EXTRACTION-PIPELINE.md §3.2 LOCK 3 ·
 * E4-EXECUTION-CONTROL controls 3 (frozen model), 8 (qualifiers survive), 9 (UNKNOWN ≠ 0).
 *
 * ── THE ONE RULE ─────────────────────────────────────────────────────────────
 * AI INTERPRETS, DETERMINISTIC COMPUTES. An extracted rule is a CLAIM carrying
 * evidence, a tier, an extraction method and a validation state. It is NEVER a
 * fact, and **no code path may raise its tier without a recorded validation
 * event**. Extraction produces six-tier tier 4 (`AI_EXTRACTED`) at best; only a
 * HUMAN validation event produces tier 5. On the C58 ladder the same rule reads:
 * nothing leaves `pipeline-extracted-unverified` without `humanVerifiedBy`.
 *
 * ── WHY THIS GATE EXISTS (measured, lane E8-SCOUT §1.5 / F-3) ────────────────
 * `ls tools/ga-gate/` → 76 `check-*.ts`, and **not one of them names, imports or
 * asserts anything about `packages/ordinance-extraction`**. The tier lock was
 * enforced in exactly two places, neither of them the producer: at the L0 schema
 * (`RuleProvenanceSchema`'s superRefine) and at the render
 * (`check-zoning-fidelity-label`, arm B). This gate binds the PRODUCER SIDE and
 * the LADDER ITSELF.
 *
 * ── SIX ARMS ─────────────────────────────────────────────────────────────────
 * FOUR ARE EXECUTED (they DRIVE the production functions, they do not read files
 * about them); TWO ARE STATIC (they read source for the shapes no execution can
 * reach). Both kinds are needed and neither substitutes for the other.
 *
 *   A · EXECUTED — `canGraduateTier` over the FULL 6 × 6 tier cross-product ×
 *       4 provenance shapes (nothing signed / signer only / date only / both).
 *       INVARIANT: rising above the pipeline tier is permitted IFF BOTH
 *       `humanVerifiedBy` and `verifiedAt` are non-null. 144 executed decisions.
 *
 *   B · EXECUTED — `resolvePublishedConfidence` over all 6 `promoteTo` values ×
 *       the same 4 shapes. INVARIANT: without a full sign-off the published tier
 *       is EXACTLY `PIPELINE_TIER`, whatever was requested. 24 executed resolves.
 *
 *   C · EXECUTED — `capEnvelopeConfidenceToPackDefault` over 6 derived × 4 pack
 *       declarations (3 members + absent). INVARIANT: the result is never
 *       STRONGER than either input — a pack may DEMOTE, never PROMOTE. This is
 *       the §PACK-CONFIDENCE-CEILING (L-665) property executed rather than
 *       asserted in prose. 24 executed clamps.
 *
 *   D · EXECUTED — `RuleProvenanceSchema.safeParse` over six-tier tier (6) ×
 *       derivation (4) × valueLocation (3) = 72 records, plus 6 `value: null`
 *       records. INVARIANT: exactly the three named incoherent pairs are
 *       REJECTED (tier1+AI_EXTRACTED · tier1+in-document-text · tier5 without
 *       HUMAN_VALIDATED), `value: null` parses ONLY at tier 6, and every other
 *       combination parses. ⭐ This is the FROZEN L0 lock (control 3) made
 *       EXECUTABLE: the schema may not be edited, and this arm is what notices
 *       if it is weakened. It never edits it.
 *
 *   E · STATIC — repo-wide: no code path MINTS a human validation event.
 *       `humanVerifiedBy: <non-null>` and `derivation: 'HUMAN_VALIDATED'` are
 *       both findings anywhere outside `packages/schemas` (which DECLARES the
 *       vocabulary) and `__tests__`. `humanVerifiedBy: null` is correct and is
 *       never flagged — it is a producer honestly recording that nobody signed.
 *
 *   F · STATIC — scoped to `packages/ordinance-extraction/src`: the extraction
 *       producer mints no `EnvelopeConfidence` above the pipeline tier. Key-aware
 *       (a literal inside `forbiddenTiers: [...]` is not a mint) and
 *       comment-stripped through the repo's one lexer (§RAF-GATE-COMMENT-BLIND).
 *
 * ── PROVEN ABLE TO FAIL, ON EVERY RUN ────────────────────────────────────────
 * Six planted-violation CONTROLS run INSIDE every invocation, all IN MEMORY —
 * a permissive decider for A, a promoting clamp for C, an all-accepting parser
 * for D, and planted source STRINGS for E and F (plus a clean string that must
 * read 0, the L-716 satisfiability control). ⛔ No planted fixture is ever
 * written into a package tree. If any control stays SILENT the gate exits 2:
 * a checker that cannot see the defect it polices must never print a pass.
 *
 * ── EXIT CODES (standard run-all.ts contract) ────────────────────────────────
 *   0 — PASS: every arm walked its subject; no graduation path found.
 *   1 — FAIL: a real finding — the arm, the path and the line are named.
 *   2 — UNPROVEN: an honesty floor breached (a control stayed silent, a walk
 *       reached too few subjects, an import failed). Never aliases with 1.
 *   3 — unused, and it must STAY unused. This gate is hard-0 from birth: there
 *       is no baseline and no ratchet, because a ceiling here would be a licence
 *       to graduate a claim (§RATCHET-EXCEEDED-IS-NEVER-DEBT).
 *
 * PURE READ: drives pure L0/L2 functions in memory and reads source text. No
 * network, no writes, no clock dependence. Deterministic.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ENVELOPE_CONFIDENCE_ORDER,
    RuleProvenanceSchema,
    RulePackDefaultConfidenceSchema,
    capEnvelopeConfidenceToPackDefault,
    envelopeConfidenceRank,
    type EnvelopeConfidence,
    type RulePackDefaultConfidence,
} from '../../packages/schemas/src/index.js';
import {
    PIPELINE_TIER,
    canGraduateTier,
    resolvePublishedConfidence,
} from '../../packages/ordinance-extraction/src/confidence.js';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import {
    PIPELINE_TIER_NAME,
    TIERS_ABOVE_PIPELINE,
    scanHumanValidationMint,
    scanMintedTiers,
    type ScanFinding,
} from './lib/claimEvidenceScan.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');

/** Honesty floors — "looked nowhere" and "found nothing wrong" must never print the same. */
const MIN_ARM_A_DECISIONS = 100;
const MIN_ARM_D_PARSES = 60;
const MIN_ARM_E_FILES = 400;
const MIN_ARM_F_FILES = 30;

interface Finding {
    readonly arm: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
    readonly subject: string;
    readonly detail: string;
}

const findings: Finding[] = [];
const blind: string[] = [];
/**
 * What each planted control ACTUALLY did this run — PRINTED, never merely implied
 * by the absence of a complaint. "The control fired" and "the control was never
 * reached" must never print the same value (§CONTEXT-DATA-HONESTY, applied to a
 * gate's own self-test).
 */
const controlLog: string[] = [];
const f = (arm: Finding['arm'], subject: string, detail: string): void => {
    findings.push({ arm, subject, detail });
};

/* ═══════════════════════ shared provenance shapes ═══════════════════════════ */

type SignOff = { readonly humanVerifiedBy: string | null; readonly verifiedAt: string | null };

const SIGN_OFF_SHAPES: ReadonlyArray<{ readonly label: string; readonly prov: SignOff; readonly signed: boolean }> = [
    { label: 'unsigned', prov: { humanVerifiedBy: null, verifiedAt: null }, signed: false },
    { label: 'signer-only', prov: { humanVerifiedBy: 'a.curator', verifiedAt: null }, signed: false },
    { label: 'date-only', prov: { humanVerifiedBy: null, verifiedAt: '2026-09-01' }, signed: false },
    { label: 'fully-signed', prov: { humanVerifiedBy: 'a.curator', verifiedAt: '2026-09-01' }, signed: true },
];

/** The graduation decision under audit — the real one, or a planted rival. */
type Decider = (from: EnvelopeConfidence, to: EnvelopeConfidence, prov: SignOff) => boolean;

/**
 * ARM A's audit, factored so the SAME auditor can be pointed at a PLANTED
 * permissive decider. A checker that only ever sees the correct implementation
 * has never been shown to have teeth.
 */
function auditGraduation(decide: Decider): { readonly violations: string[]; readonly decisions: number } {
    const violations: string[] = [];
    let decisions = 0;
    for (const from of ENVELOPE_CONFIDENCE_ORDER) {
        for (const to of ENVELOPE_CONFIDENCE_ORDER) {
            for (const shape of SIGN_OFF_SHAPES) {
                decisions++;
                const allowed = decide(from, to, shape.prov);
                const risingAbovePipeline =
                    from === PIPELINE_TIER && envelopeConfidenceRank(to) > envelopeConfidenceRank(PIPELINE_TIER);
                if (!risingAbovePipeline) continue;
                if (allowed && !shape.signed) {
                    violations.push(
                        `${from} → ${to} ALLOWED under '${shape.label}' provenance — a tier rose ` +
                            'with no recorded validation event (LOCK 3)',
                    );
                }
                if (!allowed && shape.signed) {
                    violations.push(
                        `${from} → ${to} REFUSED under a FULL sign-off ('${shape.label}') — the ` +
                            'validation door is welded shut, which is the refusing half with no ' +
                            'escape hatch (§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH)',
                    );
                }
            }
        }
    }
    return { violations, decisions };
}

/** ARM C's audit, factored the same way, so a PROMOTING clamp can be planted. */
type Clamp = (derived: EnvelopeConfidence, packDefault: RulePackDefaultConfidence | null) => EnvelopeConfidence;

function auditClamp(clamp: Clamp): { readonly violations: string[]; readonly clamps: number } {
    const violations: string[] = [];
    let clamps = 0;
    const packDecls: ReadonlyArray<RulePackDefaultConfidence | null> = [
        ...RulePackDefaultConfidenceSchema.options,
        null,
    ];
    for (const derived of ENVELOPE_CONFIDENCE_ORDER) {
        for (const decl of packDecls) {
            clamps++;
            const out = clamp(derived, decl);
            if (envelopeConfidenceRank(out) > envelopeConfidenceRank(derived)) {
                violations.push(
                    `clamp(${derived}, ${decl ?? 'no-pack'}) = ${out} — STRONGER than the derived ` +
                        'tier. A pack may DEMOTE a solve, never PROMOTE it (§PACK-CONFIDENCE-CEILING, L-665)',
                );
            }
            if (decl !== null && envelopeConfidenceRank(out) > envelopeConfidenceRank(decl)) {
                violations.push(
                    `clamp(${derived}, ${decl}) = ${out} — STRONGER than the pack's own declared ` +
                        'ceiling. A pack cannot self-certify above what it declares',
                );
            }
        }
    }
    return { violations, clamps };
}

/* ═════════════════════ ARM D — the FROZEN L0 lock, executed ═════════════════ */

type ParseFn = (rec: unknown) => { readonly success: boolean };

const DERIVATIONS = ['DIRECT', 'DERIVED', 'AI_EXTRACTED', 'HUMAN_VALIDATED'] as const;
const VALUE_LOCATIONS = ['attribute', 'in-document-text', undefined] as const;
const TIERS = [1, 2, 3, 4, 5, 6] as const;

function provenanceRecord(
    tier: (typeof TIERS)[number],
    derivation: (typeof DERIVATIONS)[number],
    valueLocation: (typeof VALUE_LOCATIONS)[number],
    value: number | null = 12,
): unknown {
    const rec: Record<string, unknown> = {
        parameter: 'maxHeight',
        value,
        unit: 'm',
        source: {
            country: 'DE',
            authority: 'gate',
            dataset: 'no-silent-graduation-audit',
            plan_id: null,
            object_id: null,
            document: 'doc-1',
            article: 'Art. 1',
            page: 1,
        },
        derivation,
        confidence: { tier },
        normativeForce: null,
        validityBasis: 'legal',
        valid_from: '2020-01-01',
        valid_to: null,
    };
    if (valueLocation !== undefined) rec['valueLocation'] = valueLocation;
    return rec;
}

/** The three DEMONSTRATED-incoherent pairs the frozen schema must reject. */
function mustBeRejected(
    tier: (typeof TIERS)[number],
    derivation: (typeof DERIVATIONS)[number],
    valueLocation: (typeof VALUE_LOCATIONS)[number],
): string | null {
    if (tier === 1 && derivation === 'AI_EXTRACTED') return 'tier1 + AI_EXTRACTED';
    if (tier === 1 && valueLocation === 'in-document-text') return 'tier1 + in-document-text';
    if (tier === 5 && derivation !== 'HUMAN_VALIDATED') return 'tier5 without HUMAN_VALIDATED';
    return null;
}

function auditFrozenLock(parse: ParseFn): { readonly violations: string[]; readonly parses: number } {
    const violations: string[] = [];
    let parses = 0;
    for (const tier of TIERS) {
        for (const derivation of DERIVATIONS) {
            for (const valueLocation of VALUE_LOCATIONS) {
                parses++;
                const why = mustBeRejected(tier, derivation, valueLocation);
                const ok = parse(provenanceRecord(tier, derivation, valueLocation)).success;
                if (why !== null && ok) {
                    violations.push(
                        `the FROZEN L0 lock ACCEPTED an incoherent record (${why}) — ` +
                            'RuleProvenanceSchema.superRefine has been weakened; spec §20 is no longer ' +
                            'unrepresentable (E4-EXECUTION-CONTROL control 3: this schema is untouchable)',
                    );
                }
                if (why === null && !ok) {
                    violations.push(
                        `the FROZEN L0 lock REJECTED a coherent record (tier ${tier} · ${derivation} · ` +
                            `${valueLocation ?? 'no valueLocation'}) — the lock has become over-broad, ` +
                            'which turns honest labelling into a parse error and pushes producers to lie',
                    );
                }
            }
        }
    }
    // UNKNOWN ≠ 0 ≠ no-limit (control 9): `value: null` is representable ONLY at tier 6.
    for (const tier of TIERS) {
        parses++;
        const ok = parse(provenanceRecord(tier, 'DIRECT', 'attribute', null)).success;
        if (tier === 6 && !ok) {
            violations.push('value=null REJECTED at tier 6 — UNKNOWN has lost its only honest seat (control 9)');
        }
        if (tier !== 6 && ok) {
            violations.push(
                `value=null ACCEPTED at tier ${tier} — UNKNOWN is representable as a confident ` +
                    'answer, which is the zero/unlimited conflation control 9 forbids',
            );
        }
    }
    return { violations, parses };
}

/* ═══════════════════════════ static arm helpers ═════════════════════════════ */

function cleanedLinesOf(abs: string): readonly string[] {
    return stripCommentsToLines(readFileSync(abs, 'utf8'));
}

/* ══════════════════════════════════ main ════════════════════════════════════ */

function main(): number {
    /* ── Ladder agreement: the TEXT list and the RUNTIME enum must not drift. ── */
    const runtimeAbove = ENVELOPE_CONFIDENCE_ORDER.filter(
        (c) => envelopeConfidenceRank(c) > envelopeConfidenceRank(PIPELINE_TIER),
    );
    const textAbove = [...TIERS_ABOVE_PIPELINE].sort();
    if (JSON.stringify([...runtimeAbove].sort()) !== JSON.stringify(textAbove)) {
        blind.push(
            'the scanner\'s TIERS_ABOVE_PIPELINE list disagrees with the runtime ladder ' +
                `(runtime: ${runtimeAbove.join(', ')} · scanner: ${TIERS_ABOVE_PIPELINE.join(', ')}) — ` +
                'the static arms would police a vocabulary that no longer exists (L-664)',
        );
    }
    if (PIPELINE_TIER !== PIPELINE_TIER_NAME) {
        blind.push(`PIPELINE_TIER is '${PIPELINE_TIER}' but the scanner spells it '${PIPELINE_TIER_NAME}'`);
    }

    /* ── ARM A — canGraduateTier, executed. ─────────────────────────────────── */
    const armA = auditGraduation((from, to, prov) => canGraduateTier(from, to, prov));
    for (const v of armA.violations) f('A', 'canGraduateTier', v);
    if (armA.decisions < MIN_ARM_A_DECISIONS) {
        blind.push(`arm A drove only ${armA.decisions} decision(s) (floor ${MIN_ARM_A_DECISIONS})`);
    }
    // CONTROL A — a PLANTED permissive decider must be caught.
    const plantedA = auditGraduation((from, to) =>
        envelopeConfidenceRank(to) >= envelopeConfidenceRank(from) ? true : true,
    );
    controlLog.push(
        `A PERMISSIVE DECIDER (allows every promotion, signed or not) → ${plantedA.violations.length} ` +
            `violation(s) — ${plantedA.violations.length > 0 ? 'FIRED' : '⛔ SILENT'}`,
    );
    if (plantedA.violations.length === 0) {
        blind.push(
            'CONTROL A stayed silent: a planted decider that allows EVERY promotion without a ' +
                'sign-off produced no violation — arm A cannot see the defect it polices',
        );
    }

    /* ── ARM B — resolvePublishedConfidence, executed. ──────────────────────── */
    let armBResolves = 0;
    for (const promoteTo of ENVELOPE_CONFIDENCE_ORDER) {
        for (const shape of SIGN_OFF_SHAPES) {
            armBResolves++;
            const published = resolvePublishedConfidence(shape.prov, promoteTo);
            const rising = envelopeConfidenceRank(promoteTo) > envelopeConfidenceRank(PIPELINE_TIER);
            if (rising && !shape.signed && published !== PIPELINE_TIER) {
                f(
                    'B',
                    'resolvePublishedConfidence',
                    `promoteTo=${promoteTo} under '${shape.label}' published as ${published} — an ` +
                        'unsigned pipeline value must clamp to the pipeline tier, not publish its request',
                );
            }
            if (rising && shape.signed && published !== promoteTo) {
                f(
                    'B',
                    'resolvePublishedConfidence',
                    `promoteTo=${promoteTo} under a FULL sign-off published as ${published} — a ` +
                        'recorded validation event must be honoured, or the tier can never be earned',
                );
            }
        }
    }

    /* ── ARM C — the pack ceiling, executed. ────────────────────────────────── */
    const armC = auditClamp((d, p) => capEnvelopeConfidenceToPackDefault(d, p));
    for (const v of armC.violations) f('C', 'capEnvelopeConfidenceToPackDefault', v);
    // CONTROL C — a PLANTED promoting clamp must be caught.
    const plantedC = auditClamp(() => 'authoritative');
    controlLog.push(
        `C PROMOTING CLAMP (returns 'authoritative' for every input) → ${plantedC.violations.length} ` +
            `violation(s) — ${plantedC.violations.length > 0 ? 'FIRED' : '⛔ SILENT'}`,
    );
    if (plantedC.violations.length === 0) {
        blind.push(
            'CONTROL C stayed silent: a planted clamp returning `authoritative` for every input ' +
                'produced no violation — arm C cannot see a promoting pack',
        );
    }

    /* ── ARM D — the FROZEN L0 lock, executed. ─────────────────────────────── */
    const armD = auditFrozenLock((rec) => RuleProvenanceSchema.safeParse(rec));
    for (const v of armD.violations) f('D', 'RuleProvenanceSchema (FROZEN L0)', v);
    if (armD.parses < MIN_ARM_D_PARSES) {
        blind.push(`arm D drove only ${armD.parses} parse(s) (floor ${MIN_ARM_D_PARSES})`);
    }
    // CONTROL D — a PLANTED all-accepting parser must be caught.
    const plantedD = auditFrozenLock(() => ({ success: true }));
    controlLog.push(
        `D ALL-ACCEPTING PARSER (a removed superRefine) → ${plantedD.violations.length} violation(s) — ` +
            `${plantedD.violations.length > 0 ? 'FIRED' : '⛔ SILENT'}`,
    );
    if (plantedD.violations.length === 0) {
        blind.push(
            'CONTROL D stayed silent: a planted parser that accepts EVERY record produced no ' +
                'violation — arm D cannot tell a frozen lock from a removed one',
        );
    }

    /* ── ARM E — static, repo-wide: no minted validation event. ─────────────── */
    let armEFiles = 0;
    const armETargets = ['packages', 'apps', 'plugins', 'server', 'tools'];
    for (const top of armETargets) {
        for (const abs of walk(join(REPO, top))) {
            const rel = relPath(REPO, abs);
            if (rel.includes('__tests__') || /\.(test|spec)\.tsx?$/.test(rel)) continue;
            // packages/schemas DECLARES the vocabulary (the z.enum member, the field
            // declaration). A declaration is not a write.
            if (rel.startsWith('packages/schemas/')) continue;
            // This gate and its lib name the literals in order to police them.
            if (rel.startsWith('tools/ga-gate/lib/claimEvidenceScan.ts')) continue;
            if (rel.startsWith('tools/ga-gate/check-no-silent-graduation.ts')) continue;
            if (rel.startsWith('tools/ga-gate/check-claim-carries-evidence.ts')) continue;
            if (rel.startsWith('tools/ga-gate/check-unvalidated-claim-not-a-constraint.ts')) continue;
            armEFiles++;
            let hits: ScanFinding[];
            try {
                hits = scanHumanValidationMint(cleanedLinesOf(abs), rel);
            } catch {
                continue;
            }
            for (const h of hits) f('E', `${h.path}:${h.line}`, `${h.detail}\n      ${h.text}`);
        }
    }
    if (armEFiles < MIN_ARM_E_FILES) {
        blind.push(`arm E walked only ${armEFiles} file(s) (floor ${MIN_ARM_E_FILES}) — the walk found nothing because it looked nowhere`);
    }
    // CONTROL E — planted source STRINGS, in memory. Positive AND negative.
    {
        const planted = [
            "const p = { humanVerifiedBy: 'auto-approver', verifiedAt: '2026-09-01' };",
            "const r = { derivation: 'HUMAN_VALIDATED', value: 12 };",
        ];
        const clean = [
            'const p = { humanVerifiedBy: null, verifiedAt: null };',
            "const r = { derivation: 'AI_EXTRACTED', value: 12 };",
            "// humanVerifiedBy: 'someone' — a COMMENT must never be a finding",
        ];
        const gotPlanted = scanHumanValidationMint(stripCommentsToLines(planted.join('\n')), '<planted>');
        const gotClean = scanHumanValidationMint(stripCommentsToLines(clean.join('\n')), '<clean>');
        controlLog.push(
            `E POSITIVE (2 planted minted validation events) → ${gotPlanted.length} finding(s) — ` +
                `${gotPlanted.length >= 2 ? 'FIRED' : '⛔ SILENT'} · E NEGATIVE (null sign-off, ` +
                `AI_EXTRACTED, a COMMENT) → ${gotClean.length} finding(s) — ` +
                `${gotClean.length === 0 ? 'CLEAN as required (L-716)' : '⛔ OVER-BROAD'}`,
        );
        if (gotPlanted.length < 2) {
            blind.push(
                `CONTROL E (positive) stayed silent: a planted minted sign-off + a planted ` +
                    `HUMAN_VALIDATED derivation produced ${gotPlanted.length} finding(s), expected 2`,
            );
        }
        if (gotClean.length !== 0) {
            blind.push(
                `CONTROL E (negative) is over-broad: honest null sign-off / AI_EXTRACTED / a COMMENT ` +
                    `produced ${gotClean.length} finding(s), expected 0 — a gate that cannot read 0 on a ` +
                    'clean corpus is unsatisfiable (L-716)',
            );
        }
    }

    /* ── ARM F — static, scoped: the extractor mints no stronger tier. ──────── */
    let armFFiles = 0;
    const extractionSrc = join(REPO, 'packages', 'ordinance-extraction', 'src');
    for (const abs of walk(extractionSrc)) {
        const rel = relPath(REPO, abs);
        armFFiles++;
        let hits: ScanFinding[];
        try {
            hits = scanMintedTiers(cleanedLinesOf(abs), rel);
        } catch {
            continue;
        }
        for (const h of hits) f('F', `${h.path}:${h.line}`, `${h.detail}\n      ${h.text}`);
    }
    if (armFFiles < MIN_ARM_F_FILES) {
        blind.push(
            `arm F walked only ${armFFiles} file(s) under packages/ordinance-extraction/src ` +
                `(floor ${MIN_ARM_F_FILES}) — the package moved, or the walk resolved nowhere`,
        );
    }
    // CONTROL F — planted source STRINGS, in memory. Positive AND negative.
    {
        const planted = [
            "const c = { confidence: 'authoritative' };",
            "  defaultConfidence: 'structured',",
            "function tier() { return 'estimated-ruleset'; }",
        ];
        const clean = [
            "forbiddenTiers: ['structured', 'authoritative'],",
            "const c = { confidence: 'pipeline-extracted-unverified' };",
            "/* confidence: 'authoritative' — a COMMENT must never be a finding */",
        ];
        const gotPlanted = scanMintedTiers(stripCommentsToLines(planted.join('\n')), '<planted>');
        const gotClean = scanMintedTiers(stripCommentsToLines(clean.join('\n')), '<clean>');
        controlLog.push(
            `F POSITIVE (3 planted stronger-tier mints) → ${gotPlanted.length} finding(s) — ` +
                `${gotPlanted.length >= 3 ? 'FIRED' : '⛔ SILENT'} · F NEGATIVE (a forbiddenTiers ` +
                `list, the pipeline tier, a COMMENT) → ${gotClean.length} finding(s) — ` +
                `${gotClean.length === 0 ? 'CLEAN as required (L-716)' : '⛔ OVER-BROAD'}`,
        );
        if (gotPlanted.length < 3) {
            blind.push(
                `CONTROL F (positive) stayed silent: 3 planted tier mints produced ` +
                    `${gotPlanted.length} finding(s) — arm F cannot see a minted tier`,
            );
        }
        if (gotClean.length !== 0) {
            blind.push(
                `CONTROL F (negative) is over-broad: a forbiddenTiers list, the pipeline tier and a ` +
                    `COMMENT produced ${gotClean.length} finding(s), expected 0 — the first false ` +
                    'positive is how a gate gets muted',
            );
        }
    }

    /* ── Verdict ────────────────────────────────────────────────────────────── */
    console.log(
        `[no-silent-graduation] executed: arm A ${armA.decisions} graduation decision(s) · ` +
            `arm B ${armBResolves} publish resolve(s) · arm C ${armC.clamps} pack clamp(s) · ` +
            `arm D ${armD.parses} FROZEN-L0 parse(s) — all through the production functions.`,
    );
    console.log(
        `[no-silent-graduation] static: arm E ${armEFiles} file(s) repo-wide (minted validation ` +
            `events) · arm F ${armFFiles} file(s) in packages/ordinance-extraction/src (minted tiers).`,
    );
    console.log(
        `[no-silent-graduation] controls: ${controlLog.length} planted scenario(s) executed IN MEMORY ` +
            'this run — each OUTCOME printed. No fixture was written to any package tree:',
    );
    for (const c of controlLog) console.log(`    · CONTROL ${c}`);
    if (controlLog.length < 5) {
        blind.push(
            `only ${controlLog.length} of 5 planted control groups were REACHED — an unreached ` +
                'control proves nothing, and a gate whose self-test did not run must not print a pass',
        );
    }
    console.log(
        '[no-silent-graduation] NOT ESTABLISHED by this gate: that a tier is CORRECT for its value ' +
            '(a wrong number honestly labelled tier 4 passes every arm), that a verbatim span is ' +
            'genuine (check-claim-carries-evidence owns the evidence axis), or that an unvalidated ' +
            'claim stays out of an envelope (check-unvalidated-claim-not-a-constraint owns that). ' +
            'It binds the LADDER and the DOOR, not the reading.',
    );

    if (blind.length > 0) {
        console.error(`[no-silent-graduation] UNPROVEN: ${blind.length} honesty-floor breach(es):`);
        for (const b of blind) console.error(`  · ${b}`);
        return 2;
    }
    if (findings.length > 0) {
        console.error(`[no-silent-graduation] FAIL: ${findings.length} silent-graduation finding(s):`);
        for (const x of findings.slice(0, 40)) {
            console.error(`  · [arm ${x.arm}] ${x.subject} — ${x.detail}`);
        }
        if (findings.length > 40) console.error(`  … and ${findings.length - 40} more`);
        console.error(
            '\n  ⛔ THE FIX IS NEVER A CEILING. There is no baseline on this gate and there must ' +
                'never be one: a tolerated graduation is a licence to publish an unchecked machine ' +
                'read as a human determination (C58 §1.6, L-449).',
        );
        return 1;
    }
    console.log(
        `[no-silent-graduation] OK: 0 finding(s). No path raises a claim's tier without a recorded ` +
            'validation event; the FROZEN L0 lock still rejects all three incoherent pairs.',
    );
    return 0;
}

try {
    process.exit(main());
} catch (err) {
    console.error('[no-silent-graduation] UNPROVEN: gate crashed —', err);
    process.exit(2);
}
