#!/usr/bin/env npx tsx
/**
 * @file tools/ga-gate/check-claim-carries-evidence.ts
 *
 * GA Gate — EVERY CLAIM CARRIES ITS EVIDENCE (lane E8-GATES, 2026-09-01).
 * Spec §20 · BRIEF §3/§11 · C58 §1.3/§1.6 · E4-EXECUTION-CONTROL controls 3, 8, 9.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * An extracted rule is a CLAIM, and a claim a human cannot review is not a claim —
 * it is an unattributed number wearing a tier. So every claim at six-tier **tier 4
 * (`ai-interpretation` / `AI_EXTRACTED`)** must carry BOTH halves of its evidence:
 *
 *   1. A VERBATIM SPAN — the exact source sentence, in the source language, never
 *      a paraphrase (`RaseAnnotation.requirement`; the attribution layer's
 *      `EvidenceCitation.verbatim` invariant; COMPASS's retrieve-then-verify
 *      pattern, where the model returns a SPAN and the parser computes the number).
 *   2. A DOCUMENT ADDRESS — `source.document`, PLUS an in-document locator
 *      (`article` OR `page`). A 478-page règlement id on its own is an identity,
 *      not an address (lane E8-SCOUT §3.3 measured exactly that on the French GPU:
 *      naming is not addressing).
 *
 * ⚠ WHY `article` **OR** `page`, NOT BOTH. Deliberately calibrated, not lax. In
 * continental practice the ARTICLE is the canonical citation and page numbers vary
 * by edition; demanding both would fail every correctly-cited Spanish and German
 * rule in the tree and the gate would be muted within a week. The requirement is
 * that a human can FIND the sentence, and either locator achieves that.
 *
 * ── WHY THIS GATE EXISTS ─────────────────────────────────────────────────────
 * Measured by lane E8-SCOUT: **0 of 76 GA gates** name, import or assert anything
 * about `packages/ordinance-extraction`, and the honesty invariants were enforced
 * only at the L0 schema and at the RENDER. The L0 schema cannot enforce this one:
 * `RuleProvenanceSchema` makes `article`/`page` nullable ON PURPOSE, because the
 * chain honestly thins out for attribute-served values — a WFS column has no
 * article. The requirement is CONDITIONAL on the claim being AI-extracted, and a
 * conditional invariant across two schemas is exactly what a gate is for.
 *
 * ── FOUR ARMS ────────────────────────────────────────────────────────────────
 *   A · EXECUTED — every rule in every shipping DECLARATIVE rule-pack document
 *       (`rulepacks/declarative/*.decl.ts`) that is tier 4 or `AI_EXTRACTED`.
 *       The document SET is checked BOTH WAYS against the files on disk, so a new
 *       `.decl.ts` cannot land unwalked (the L-4601 "compare SETS, never a count"
 *       lesson). ⛔ LANDS RED — see the ledger.
 *
 *   B · EXECUTED — every registered rule-pack zone carrying at least one
 *       `fieldProvenance: 'pipeline-extracted'` field must carry a non-null
 *       `ordinanceRef`: a machine-read number whose document nobody named is the
 *       same defect one layer down. Read LIVE from the shipping registry.
 *
 *   C · STATIC — repo-wide: any site PRODUCING `derivation: 'AI_EXTRACTED'` must
 *       name a span and a document within its object literal. Producers today: 0
 *       (the seat is built and empty). This arm exists so the FIRST one cannot
 *       land evidence-free in a file no corpus walk reaches.
 *
 *   D · EXECUTED — the extraction CORE's own citation invariant, driven not
 *       described: `extractRules` over real German ordinance text must emit rules
 *       that each carry a non-empty `citation.document` AND `citation.sentence`,
 *       at `pipeline-extracted-unverified` / `pipeline-extracted`. A rule with no
 *       reviewable sentence must never be emitted at all.
 *
 * ── THE LEDGER (`claim-evidence-ledger.json`) — NAMED ROWS, NEVER A COUNT ─────
 * Arm A lands RED on the E1bc Barcelona pilot: 57 rules are stamped tier 4 /
 * `AI_EXTRACTED` and 48 of them carry no `rase.requirement`. That is AUTHORING
 * debt the pilot's own header already names ('no-verbatim-span-curated') — and it
 * is exactly the shape the wave forbids shipping, so it is measured, not excused.
 * The ledger pins those rows BY NAME at the first honest reading.
 *
 * ⛔ THE LEDGER IS COMPARED AS A SET, IN BOTH DIRECTIONS, AND EITHER DIFFERENCE
 * EXITS 3. A NEW row is a regression. A row with NO finding means the ledger is
 * STALE — the debt was paid and nobody struck the line, which is how a baseline
 * becomes a list of things that are actually fine and stops meaning anything.
 * Exit 3 is NEVER absorbable by any ledger (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7).
 *
 * ── PROVEN ABLE TO FAIL, ON EVERY RUN ────────────────────────────────────────
 * NINE controls run IN MEMORY inside every invocation, and each one's OUTCOME is
 * PRINTED rather than implied by silence — "the control fired" and "the control
 * was never reached" must not print the same value. Four are PLANTED violations
 * that must fire (span-less · document-less · locator-less · an evidence-free
 * producer string); five are CALIBRATIONS that must stay CLEAN, because the first
 * false positive is how a gate gets muted:
 *   · page-but-no-article and article-but-no-page both pass (the OR, above);
 *   · a `DIRECT` tier-1 attribute read owes no span and is out of remit;
 *   · a fully-evidenced claim reads 0 (L-716 satisfiability);
 *   · ⭐ a TYPE-LEVEL tier lock (`readonly derivation: 'AI_EXTRACTED';`) reads 0.
 *     That last one closes a MEASURED false positive: on 2026-09-01 this arm's
 *     first live reading flagged `ordinance-extraction/src/spine/types.ts`, where
 *     a sibling lane narrows the derivation to a literal so a tier-1/2/3/5 claim
 *     does not compile — i.e. the invariant in the type system, the opposite of
 *     the defect. The SCANNER was fixed and this control was added; the ledger
 *     was NOT edited to absorb it.
 * ⛔ No planted fixture is written into any package tree. A silent control exits 2.
 *
 * ── EXIT CODES ───────────────────────────────────────────────────────────────
 *   0 — PASS: every arm walked its subject and the ledger is empty.
 *   1 — FAIL at the DECLARED ledger: findings === the pinned rows, exactly.
 *   2 — UNPROVEN: an honesty floor breached; a control stayed silent; a walk
 *       reached nothing. Never aliases with 1.
 *   3 — the ledger SET moved in either direction. Never absorbable.
 *
 * PURE READ: drives pure L2 functions in memory and reads source text. No
 * network, no writes, no clock dependence. Deterministic.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DeclarativeRule, DeclarativeRulePackDocument } from '../../packages/schemas/src/index.js';
import {
    ES_BARCELONA_20A_DECL_DOC,
    listJurisdictionCoverage,
    registeredPackZoneCodes,
    resolveZoneDisposition,
} from '../../packages/site-parcel-data/src/index.js';
import { extractRules } from '../../packages/ordinance-extraction/src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../../packages/ordinance-extraction/src/grammars/german.js';
import { PIPELINE_TIER } from '../../packages/ordinance-extraction/src/confidence.js';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import {
    isAiExtractedProducerLine,
    scanAiExtractedProducers,
    type ScanFinding,
} from './lib/claimEvidenceScan.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dir, '..', '..');
const LEDGER_PATH = join(__dir, 'claim-evidence-ledger.json');

/** Honesty floors — a walk that reached nothing must never print a pass. */
const MIN_DECL_DOCS = 1;
const MIN_DECL_RULES = 50;
const MIN_PACK_ZONES = 20;
const MIN_STATIC_FILES = 400;

/** The declarative documents this gate WALKS, keyed by their file basename. */
const WALKED_DECL_DOCS: ReadonlyArray<{ readonly file: string; readonly doc: DeclarativeRulePackDocument }> = [
    { file: 'esBarcelona20aAillada.decl.ts', doc: ES_BARCELONA_20A_DECL_DOC },
];

const DECL_DIR = join(REPO, 'packages', 'site-parcel-data', 'src', 'rulepacks', 'declarative');

interface Finding {
    readonly arm: 'A' | 'B' | 'C' | 'D';
    /** The LEDGER KEY — stable, name-based, never a line number (lines drift, L-7060). */
    readonly key: string;
    readonly detail: string;
}

const findings: Finding[] = [];
const blind: string[] = [];
/**
 * What each planted control ACTUALLY did this run — PRINTED, never merely implied
 * by the absence of a complaint. "The control fired" and "the control was never
 * reached" must never print the same value.
 */
const controlLog: string[] = [];

/* ═══════════════ the claim auditor — factored so it can be planted ══════════ */

/** The evidence-bearing shape this gate audits, independent of any one schema. */
export interface AuditableClaim {
    readonly key: string;
    readonly tier: number;
    readonly derivation: string;
    readonly verbatimSpan: string | null;
    readonly document: string | null;
    readonly article: string | null;
    readonly page: number | null;
    readonly valueLocation: string | null;
}

/** Is this claim AI-INTERPRETED — six-tier tier 4, or an AI_EXTRACTED derivation? */
function isAiClaim(c: AuditableClaim): boolean {
    return c.tier === 4 || c.derivation === 'AI_EXTRACTED';
}

/**
 * Audit ONE claim. Returns the gaps found ([] = clean). Non-AI claims are OUT OF
 * REMIT and return [] — a `DIRECT` read of a WFS attribute owes no verbatim span,
 * and demanding one would make the gate wrong in the honest direction.
 */
function auditClaim(c: AuditableClaim): string[] {
    if (!isAiClaim(c)) return [];
    const gaps: string[] = [];
    if (c.verbatimSpan === null || c.verbatimSpan.trim() === '') gaps.push('no-verbatim-span');
    if (c.document === null || c.document.trim() === '') gaps.push('no-document');
    const hasLocator = (c.article !== null && c.article.trim() !== '') || c.page !== null;
    if (!hasLocator) gaps.push('no-in-document-locator');
    return gaps;
}

function claimOfRule(jurisdictionId: string, zoneCode: string, rule: DeclarativeRule): AuditableClaim {
    const p = rule.provenance;
    return {
        key: `${jurisdictionId}/${zoneCode}/${p.parameter}`,
        tier: p.confidence.tier,
        derivation: p.derivation,
        verbatimSpan: rule.rase?.requirement ?? null,
        document: p.source.document,
        article: p.source.article,
        page: p.source.page,
        valueLocation: p.valueLocation ?? null,
    };
}

/* ══════════════════════════════════ main ════════════════════════════════════ */

function main(): number {
    /* ── ARM A — the declarative corpus. ────────────────────────────────────── */
    // SET equivalence FIRST: a .decl.ts on disk that this gate does not import is
    // an unwalked corpus, and a gate that does not know what it missed cannot
    // report a pass (L-4601: compare SETS, never a count).
    let onDisk: string[] = [];
    try {
        onDisk = readdirSync(DECL_DIR).filter((n) => n.endsWith('.decl.ts'));
    } catch {
        blind.push(`arm A could not read ${relPath(REPO, DECL_DIR)} — the declarative corpus moved`);
    }
    const walkedFiles = new Set(WALKED_DECL_DOCS.map((d) => d.file));
    const unwalked = onDisk.filter((n) => !walkedFiles.has(n));
    const missingOnDisk = [...walkedFiles].filter((n) => !onDisk.includes(n));
    if (unwalked.length > 0) {
        blind.push(
            `arm A: ${unwalked.length} declarative document(s) on disk are NOT walked by this gate ` +
                `(${unwalked.join(', ')}) — add them to WALKED_DECL_DOCS in the same commit that ` +
                'adds the file, or the corpus grows unmeasured',
        );
    }
    if (missingOnDisk.length > 0) {
        blind.push(`arm A: this gate imports ${missingOnDisk.join(', ')}, which is not on disk`);
    }

    let declRules = 0;
    let aiClaims = 0;
    let aiWithSpan = 0;
    let aiWithPage = 0;
    for (const { doc } of WALKED_DECL_DOCS) {
        for (const pack of doc.packs) {
            for (const zone of pack.zones) {
                for (const rule of zone.rules) {
                    declRules++;
                    const claim = claimOfRule(pack.meta.jurisdictionId, zone.code, rule);
                    if (isAiClaim(claim)) {
                        aiClaims++;
                        if (claim.verbatimSpan !== null && claim.verbatimSpan.trim() !== '') aiWithSpan++;
                        if (claim.page !== null) aiWithPage++;
                    }
                    for (const gap of auditClaim(claim)) {
                        findings.push({
                            arm: 'A',
                            key: `A|${claim.key}|${gap}`,
                            detail:
                                `tier ${claim.tier} / ${claim.derivation} claim with ${gap} ` +
                                `(valueLocation=${claim.valueLocation ?? 'unstated'}) — a tier-4 claim a ` +
                                'human cannot review is an unattributed number (spec §20)',
                        });
                    }
                }
            }
        }
    }
    if (WALKED_DECL_DOCS.length < MIN_DECL_DOCS || declRules < MIN_DECL_RULES) {
        blind.push(
            `arm A walked ${WALKED_DECL_DOCS.length} document(s) / ${declRules} rule(s) ` +
                `(floors ${MIN_DECL_DOCS} / ${MIN_DECL_RULES})`,
        );
    }

    /* ── ARM B — the registered packs' machine-read zones. ──────────────────── */
    let packZones = 0;
    let pipelineZones = 0;
    for (const jur of listJurisdictionCoverage().filter((j) => j.packZoneCodes.length > 0)) {
        for (const code of registeredPackZoneCodes(jur.jurisdictionId)) {
            const disp = resolveZoneDisposition(jur.jurisdictionId, code);
            if (disp.kind !== 'pack') continue;
            const zone = disp.pack.zones.find((z) => z.code === code);
            if (!zone) continue;
            packZones++;
            const provs = Object.values(zone.fieldProvenance ?? {}) as string[];
            if (!provs.includes('pipeline-extracted')) continue;
            pipelineZones++;
            const ref = zone.ordinanceRef;
            if (ref === null || ref === undefined || String(ref).trim() === '') {
                findings.push({
                    arm: 'B',
                    key: `B|${jur.jurisdictionId}/${code}|no-ordinance-ref`,
                    detail:
                        'a zone carrying machine-extracted field(s) names no ordinanceRef — the ' +
                        'document a human would have to open to check OUR pipeline\'s read is unstated ' +
                        '(C58 §1.3/§1.6: a wrong value here is our error, not the publisher\'s)',
                });
            }
        }
    }
    if (packZones < MIN_PACK_ZONES) {
        blind.push(`arm B walked ${packZones} pack zone(s) (floor ${MIN_PACK_ZONES}) — the registry read nothing`);
    }

    /* ── ARM C — static producer scan, repo-wide. ──────────────────────────── */
    let staticFiles = 0;
    let producerSites = 0;
    for (const top of ['packages', 'apps', 'plugins', 'server', 'tools']) {
        for (const abs of walk(join(REPO, top))) {
            const rel = relPath(REPO, abs);
            if (rel.includes('__tests__') || /\.(test|spec)\.tsx?$/.test(rel)) continue;
            if (rel.startsWith('tools/ga-gate/lib/claimEvidenceScan.ts')) continue;
            if (rel.startsWith('tools/ga-gate/check-')) continue;
            staticFiles++;
            let hits: ScanFinding[];
            let lines: readonly string[];
            try {
                lines = stripCommentsToLines(readFileSync(abs, 'utf8'));
                hits = scanAiExtractedProducers(lines, rel);
            } catch {
                continue;
            }
            for (const line of lines) {
                if (isAiExtractedProducerLine(line)) producerSites++;
            }
            for (const h of hits) {
                findings.push({
                    arm: 'C',
                    key: `C|${h.path}|ai-producer-without-evidence`,
                    detail: `${h.detail}\n      ${h.text}`,
                });
            }
        }
    }
    if (staticFiles < MIN_STATIC_FILES) {
        blind.push(`arm C walked ${staticFiles} file(s) (floor ${MIN_STATIC_FILES})`);
    }

    /* ── ARM D — the extraction core's citation invariant, DRIVEN. ─────────── */
    // Real born-digital German ordinance phrasing, the shape the Berlin probe
    // proved (PROBE-VERDICT-2026-07-31). The point is not the numbers — it is
    // that every EMITTED rule carries a sentence a human can go and read.
    const DE_TEXT =
        'Im Plangebiet ist eine Grundflächenzahl (GRZ) von 0,4 sowie eine Geschossflächenzahl ' +
        '(GFZ) von 1,2 festgesetzt. Die Traufhöhe darf 12,5 m nicht überschreiten. ' +
        'Zulässig sind höchstens III Vollgeschosse.';
    const outcome = extractRules(DE_TEXT, GERMAN_GRAMMAR, { document: 'gate-de-fixture', page: 3 });
    let emitted = 0;
    if (!outcome.ok) {
        blind.push(
            `arm D: extractRules refused the fixture (${outcome.reason}: ${outcome.detail}) — the ` +
                'extraction core could not be driven, so its citation invariant is UNMEASURED',
        );
    } else {
        emitted = outcome.rules.length;
        for (const r of outcome.rules) {
            const key = `D|${r.field}|${r.matcherId}`;
            if (!r.citation.document || r.citation.document.trim() === '') {
                findings.push({ arm: 'D', key: `${key}|no-citation-document`, detail: 'emitted a rule with no citeable document' });
            }
            if (!r.citation.sentence || r.citation.sentence.trim() === '') {
                findings.push({
                    arm: 'D',
                    key: `${key}|no-citation-sentence`,
                    detail:
                        'emitted a rule with no verbatim sentence — the evidence a human reviews ' +
                        'is exactly what makes a machine read checkable (L-449)',
                });
            }
            if (r.confidence !== PIPELINE_TIER) {
                findings.push({
                    arm: 'D',
                    key: `${key}|minted-tier-${r.confidence}`,
                    detail: `emitted at '${r.confidence}' — the parser may mint only '${PIPELINE_TIER}'`,
                });
            }
            if (r.fieldProvenance !== 'pipeline-extracted') {
                findings.push({
                    arm: 'D',
                    key: `${key}|minted-field-provenance-${r.fieldProvenance}`,
                    detail: `emitted fieldProvenance '${r.fieldProvenance}' — a machine read is 'pipeline-extracted'`,
                });
            }
        }
        if (emitted === 0) {
            blind.push(
                'arm D: the German grammar emitted 0 rules from a fixture containing GRZ, GFZ, a ' +
                    'Traufhöhe and a Vollgeschoss count — the core is not being exercised, so a green ' +
                    'here would mean "looked nowhere" (§CONTEXT-DATA-HONESTY)',
            );
        }
    }

    /* ── CONTROLS — planted, in memory, every run. ─────────────────────────── */
    const base: AuditableClaim = {
        key: 'control',
        tier: 4,
        derivation: 'AI_EXTRACTED',
        verbatimSpan: 'Die Traufhöhe darf 12,5 m nicht überschreiten.',
        document: 'doc-1',
        article: 'Art. 4',
        page: 7,
        valueLocation: 'in-document-text',
    };
    const controlResults: Array<{ label: string; got: string[]; expect: 'flag' | 'clean' }> = [
        { label: 'span-less tier-4 claim', got: auditClaim({ ...base, verbatimSpan: null }), expect: 'flag' },
        { label: 'document-less tier-4 claim', got: auditClaim({ ...base, document: null }), expect: 'flag' },
        {
            label: 'locator-less tier-4 claim (no article, no page)',
            got: auditClaim({ ...base, article: null, page: null }),
            expect: 'flag',
        },
        {
            label: 'CALIBRATION: page but no article MUST pass',
            got: auditClaim({ ...base, article: null }),
            expect: 'clean',
        },
        {
            label: 'CALIBRATION: article but no page MUST pass',
            got: auditClaim({ ...base, page: null }),
            expect: 'clean',
        },
        {
            label: 'CALIBRATION: a DIRECT tier-1 attribute read owes no span',
            got: auditClaim({
                ...base,
                tier: 1,
                derivation: 'DIRECT',
                verbatimSpan: null,
                article: null,
                page: null,
                valueLocation: 'attribute',
            }),
            expect: 'clean',
        },
        { label: 'L-716 satisfiability: a fully-evidenced claim', got: auditClaim(base), expect: 'clean' },
    ];
    let flagControls = 0;
    let cleanControls = 0;
    for (const c of controlResults) {
        const passed = c.expect === 'flag' ? c.got.length > 0 : c.got.length === 0;
        if (c.expect === 'flag') flagControls++;
        else cleanControls++;
        controlLog.push(
            `${c.expect === 'flag' ? 'PLANTED' : 'CALIBRATION'} "${c.label}" → ` +
                `${c.got.length === 0 ? 'no gap' : c.got.join(', ')} — ` +
                `${passed ? (c.expect === 'flag' ? 'FIRED' : 'CLEAN as required') : c.expect === 'flag' ? '⛔ SILENT' : '⛔ OVER-BROAD'}`,
        );
        if (c.expect === 'flag' && c.got.length === 0) {
            blind.push(`CONTROL stayed silent: "${c.label}" produced no gap — the auditor cannot see it`);
        }
        if (c.expect === 'clean' && c.got.length > 0) {
            blind.push(
                `CONTROL is over-broad: "${c.label}" produced ${c.got.join(', ')} — a false positive ` +
                    'here is how the gate gets muted',
            );
        }
    }
    {
        const plantedProducer = [
            "const claim = {",
            "  parameter: 'maxHeight',",
            "  derivation: 'AI_EXTRACTED',",
            "  value: 21,",
            "};",
        ];
        const cleanProducer = [
            "const claim = {",
            "  parameter: 'maxHeight',",
            "  derivation: 'AI_EXTRACTED',",
            "  rase: { requirement: 'Die Traufhöhe darf 12,5 m nicht überschreiten.' },",
            "  source: { document: 'doc-1', article: 'Art. 4' },",
            "};",
        ];
        // ⭐ THE TYPE-LEVEL TIER LOCK — the shape that produced this scan's FIRST
        // LIVE FALSE POSITIVE (packages/ordinance-extraction/src/spine/types.ts,
        // measured 2026-09-01). It must NEVER be a finding: it is the invariant
        // expressed in the type system, the exact opposite of the defect. The
        // SCANNER was fixed and this control was added so it cannot regress.
        const typeLevelLock = [
            'export type ExtractionClaimProvenance = Omit<RuleProvenance, K> & {',
            "    readonly derivation: 'AI_EXTRACTED';",
            '    readonly confidence: { readonly tier: 4 };',
            '};',
        ];
        const gotPlanted = scanAiExtractedProducers(stripCommentsToLines(plantedProducer.join('\n')), '<planted>');
        const gotClean = scanAiExtractedProducers(stripCommentsToLines(cleanProducer.join('\n')), '<clean>');
        const gotTypeLock = scanAiExtractedProducers(stripCommentsToLines(typeLevelLock.join('\n')), '<type-lock>');
        controlLog.push(
            'CALIBRATION "type-level tier lock (readonly derivation: \'AI_EXTRACTED\';)" → ' +
                `${gotTypeLock.length} finding(s) — ` +
                (gotTypeLock.length === 0
                    ? 'CLEAN as required (closes a MEASURED false positive, 2026-09-01)'
                    : '⛔ OVER-BROAD'),
        );
        if (gotTypeLock.length !== 0) {
            blind.push(
                'CONTROL (arm C, type-lock calibration) is over-broad: a TYPE-LEVEL narrowing of ' +
                    "`derivation` to 'AI_EXTRACTED' was flagged as an unevidenced producer. That is the " +
                    'tier lock expressed in the type system — flagging it teaches people to delete the ' +
                    'lock, which is the defect this gate exists to stop',
            );
        }
        controlLog.push(
            `PLANTED "arm-C evidence-free AI producer" → ${gotPlanted.length} finding(s) — ` +
                `${gotPlanted.length > 0 ? 'FIRED' : '⛔ SILENT'} · CALIBRATION "fully-evidenced AI ` +
                `producer" → ${gotClean.length} finding(s) — ` +
                `${gotClean.length === 0 ? 'CLEAN as required (L-716)' : '⛔ OVER-BROAD'}`,
        );
        if (gotPlanted.length === 0) {
            blind.push('CONTROL (arm C, positive) stayed silent: a planted evidence-free AI producer was not flagged');
        }
        if (gotClean.length !== 0) {
            blind.push(
                `CONTROL (arm C, negative) is over-broad: a fully-evidenced AI producer produced ` +
                    `${gotClean.length} finding(s) — the arm is unsatisfiable (L-716)`,
            );
        }
    }

    /* ── Report ────────────────────────────────────────────────────────────── */
    console.log(
        `[claim-evidence] arm A: ${WALKED_DECL_DOCS.length} declarative document(s) · ${declRules} rule(s) · ` +
            `${aiClaims} AI-interpreted claim(s) (tier 4 or AI_EXTRACTED), of which ${aiWithSpan} carry a ` +
            `verbatim span and ${aiWithPage} carry a page.`,
    );
    console.log(
        `[claim-evidence] arm B: ${packZones} registered pack zone(s) walked · ${pipelineZones} carry at ` +
            'least one machine-extracted field.',
    );
    console.log(
        `[claim-evidence] arm C: ${staticFiles} file(s) scanned repo-wide · ${producerSites} ` +
            "`derivation: 'AI_EXTRACTED'` PRODUCER site(s) found. " +
            (producerSites === 0
                ? 'ZERO is the honest current reading — the seat is built and empty. This arm is the ' +
                  'tripwire for the first one, not a claim that the surface is exercised.'
                : ''),
    );
    console.log(
        `[claim-evidence] arm D: extraction core DRIVEN — ${emitted} cited rule(s) emitted from real ` +
            'German ordinance text; every one checked for document + verbatim sentence + tier.',
    );
    console.log(
        `[claim-evidence] controls: ${controlLog.length} planted/calibration scenario(s) executed IN ` +
            'MEMORY this run — each OUTCOME printed. No fixture was written to any package tree:',
    );
    for (const c of controlLog) console.log(`    · CONTROL ${c}`);
    if (controlLog.length < 9) {
        blind.push(
            `only ${controlLog.length} of 9 controls were REACHED — an unreached control proves ` +
                'nothing, and a gate whose self-test did not run must not print a pass',
        );
    }
    console.log(
        '[claim-evidence] NOT ESTABLISHED by this gate: that a verbatim span is FAITHFUL to the source ' +
            '(n-gram containment is the missing 8th verification gate, E8-SCOUT §4.2 item 4), that a ' +
            'qualifier survived normalization (the 9th, §4.3), or that the number is right. It binds ' +
            'the PRESENCE of reviewable evidence, never its truth.',
    );

    if (blind.length > 0) {
        console.error(`[claim-evidence] UNPROVEN: ${blind.length} honesty-floor breach(es):`);
        for (const b of blind) console.error(`  · ${b}`);
        return 2;
    }

    /* ── Ledger comparison — SETS, both directions. ─────────────────────────── */
    let ledgerRows: string[] = [];
    if (existsSync(LEDGER_PATH)) {
        try {
            const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as { rows?: string[] };
            ledgerRows = raw.rows ?? [];
        } catch (err) {
            console.error(`[claim-evidence] UNPROVEN: ledger unreadable — ${String(err)}`);
            return 2;
        }
    }
    const ledger = new Set(ledgerRows);
    const found = new Set(findings.map((x) => x.key));
    const novel = [...found].filter((k) => !ledger.has(k)).sort();
    const struck = [...ledger].filter((k) => !found.has(k)).sort();

    if (novel.length > 0 || struck.length > 0) {
        console.error(
            `[claim-evidence] LEDGER SET MOVED — ${novel.length} new · ${struck.length} no longer found. ` +
                'A count can be right while the set is wrong, so this compares NAMES, both ways.',
        );
        for (const k of novel.slice(0, 30)) {
            const d = findings.find((x) => x.key === k)?.detail ?? '';
            console.error(`  + NEW      ${k}\n      ${d}`);
        }
        if (novel.length > 30) console.error(`  … and ${novel.length - 30} more new`);
        for (const k of struck.slice(0, 30)) console.error(`  - STRUCK   ${k}  (fixed — strike this row)`);
        if (struck.length > 30) console.error(`  … and ${struck.length - 30} more struck`);
        console.error(
            '\n  ⛔ Exit 3 in BOTH directions, and it is never absorbable by any ledger ' +
                '(§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7). A NEW row is a regression. A STRUCK row means ' +
                'the debt was paid and the line was left standing, which is how a baseline drifts into ' +
                'a list of things that are actually fine and stops meaning anything.',
        );
        return 3;
    }

    if (findings.length > 0) {
        console.error(
            `[claim-evidence] FAIL at the DECLARED ledger: ${findings.length} evidence gap(s), ` +
                `exactly the ${ledger.size} pinned row(s):`,
        );
        const byArm = new Map<string, number>();
        for (const x of findings) byArm.set(x.arm, (byArm.get(x.arm) ?? 0) + 1);
        for (const [arm, n] of [...byArm].sort()) console.error(`  · arm ${arm}: ${n} finding(s)`);
        for (const x of findings.slice(0, 12)) console.error(`  · ${x.key} — ${x.detail}`);
        if (findings.length > 12) console.error(`  … and ${findings.length - 12} more (all pinned by name in the ledger)`);
        console.error(
            '\n  EXIT CONDITION: curate the missing `rase.requirement` spans from the held source, or ' +
                'downgrade the affected claims off tier 4. ⛔ NOT by deleting rows and NOT by relaxing ' +
                'the auditor — a fabricated quote is worse than a named gap.',
        );
        return 1;
    }

    console.log(`[claim-evidence] OK: 0 evidence gap(s). Every AI-interpreted claim carries a span and an address.`);
    return 0;
}

try {
    process.exit(main());
} catch (err) {
    console.error('[claim-evidence] UNPROVEN: gate crashed —', err);
    process.exit(2);
}
