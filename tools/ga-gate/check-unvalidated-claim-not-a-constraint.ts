#!/usr/bin/env npx tsx
/**
 * @file tools/ga-gate/check-unvalidated-claim-not-a-constraint.ts
 *
 * GA Gate — NO UNVALIDATED CLAIM REACHES AN ENVELOPE UNLABELLED
 * (lane E8-GATES, 2026-09-01). Spec §20 · C58 §1.2/§1.6 · §PACK-CONFIDENCE-CEILING
 * (L-665) · E4-EXECUTION-CONTROL controls 3, 5, 8, 9, 10.
 *
 * ── THE ONE FAILURE THIS WAVE EXISTS TO PREVENT ──────────────────────────────
 * *"A pipeline that lets an AI-extracted number reach a buildable-envelope
 * calculation UNLABELLED."* Not "reaches an envelope" — machine-extracted numbers
 * legitimately do (Madrid and Córdoba both ship that way today, and both label it).
 * **UNLABELLED** is the failure: the number arrives wearing a stronger tier than
 * the claim that produced it, and the user reads a machine guess as a curated
 * estimate or a human transcription.
 *
 * ── SIBLING, NOT RIVAL, OF check-envelope-never-overstates ───────────────────
 * That gate asks a GEOMETRIC question — does the solved volume exceed what the
 * rule GRANTS on height / FAR / coverage / setback / volume. It says so itself:
 * *"NOT ESTABLISHED … jurisdiction-correct rule VALUES (a wrong transcribed number
 * that stays self-consistent passes)."* THIS gate asks the PROVENANCE question:
 * does the label on the number survive the trip to the envelope. A number can be
 * geometrically perfect and provenance-laundered, and vice versa. No shared arm,
 * no shared subject, no shared ledger row. The two are complementary by
 * construction — this gate deliberately never re-audits an axis.
 *
 * ── FIVE ARMS, ALL EXECUTED ──────────────────────────────────────────────────
 * Every arm DRIVES production code — `computeBuildableEnvelope`,
 * `envelopeToMassing` / `classifyEnvelopeCompleteness`, `deriveC58Contract`. None
 * of them counts files or reads a declaration ABOUT behaviour: a gate that counted
 * provenance-handling FILES would be satisfied by writing one.
 *
 *   A · THE FIELD-LEVEL CEILING. For every registered pack zone (× classified and
 *       unclassified edges): a zone carrying ≥1 `fieldProvenance:
 *       'pipeline-extracted'` field that solves `ok` must produce an envelope at
 *       EXACTLY `pipeline-extracted-unverified` — never stronger.
 *       ⚠ MEASURED LATENT GAP, recorded not fixed (control 10, discovery D-1):
 *       the engine's ceiling is read from `rulePack.defaultConfidence` — the PACK
 *       level — and NOTHING reads the per-field flag. Today the invariant holds
 *       only because the two machine-extracted packs are wholly machine-extracted.
 *       A single `pipeline-extracted` field inside an `estimated-ruleset` pack
 *       ships at `estimated-ruleset`. This arm is what notices, and the planted
 *       control below proves it does.
 *
 *   B · NEVER "COMPLETE". Such an envelope must never classify `complete: true`
 *       through `classifyEnvelopeCompleteness` — the single authority the globe,
 *       the plan overlay and the card all read. A machine read nobody checked may
 *       not render in the confident violet a signed determination gets.
 *
 *   C · THE LOUDER CAVEAT. Such an envelope must carry the C58 §1.6
 *       MACHINE-EXTRACTED caveat, in words that say the error would be OURS.
 *
 *   D · THE DERIVE SEAM — where a CLAIM becomes a PACK. For every shipping
 *       declarative rule-pack document: if a zone's rules include a tier-4 /
 *       `AI_EXTRACTED` claim, then the C58 contract derived from it may not label
 *       that zone's fields STRONGER than `pipeline-extracted`, and the pack may
 *       not declare a `defaultConfidence` stronger than
 *       `pipeline-extracted-unverified`. ⛔ LANDS RED — see the ledger.
 *
 *   E · DOWNSTREAM PROOF. The DERIVED contract is then solved through the REAL
 *       engine on a canonical parcel, and the resulting envelope confidence is
 *       checked. This is the arm that turns arm D from a labelling complaint into
 *       a demonstrated envelope defect: it shows the laundered label ARRIVING at
 *       `computeBuildableEnvelope`, which is the sentence spec §20 forbids.
 *       ⛔ LANDS RED — same ledger.
 *
 * ── WHY ZONE-LEVEL AND NOT PER-SEAT (control 2, stated not hidden) ───────────
 * Three spellings exist for the same concept — the declarative `parameter`
 * (`maxCoveragePercent`), the C58 seat (`maxCoverage`, from
 * `DECLARATIVE_PARAMETERS.c58Field`), and the `fieldProvenance` KEY the packs use
 * (`maxCoverage` / `setback.front` / `maxFAR`). Joining rule→field per seat needs
 * a THIRD mapping that does not exist in the tree, and inventing one here is
 * exactly the scope expansion control 2 forbids. So the arms bind at the ZONE and
 * PACK level, which needs no mapping and is where the ceiling actually applies.
 * The per-seat join is recorded as a discovery for whoever owns the seam.
 *
 * ── PROVEN ABLE TO FAIL, ON EVERY RUN ────────────────────────────────────────
 * Four planted-violation CONTROLS run INSIDE every invocation:
 *   1. A REAL registered `estimated-ruleset` pack, copied IN MEMORY with one
 *      zone's `fieldProvenance` flipped to `pipeline-extracted`, solved through
 *      the REAL engine. Arm A's auditor must flag it. ⛔ The `rulepacks/` tree is
 *      E4-owned and is NOT touched — the copy never leaves this process.
 *   2. The same pack UNMODIFIED must read CLEAN (the L-716 satisfiability control:
 *      a gate that cannot be satisfied is not a gate).
 *   3. A planted honest declarative zone (tier-4 rules + `pipeline-extracted`
 *      fields + the pipeline-tier pack default) must read CLEAN through arm D.
 *   4. A planted laundering zone (tier-4 rules + `ordinance-pdf` fields) must be
 *      flagged by arm D.
 * A silent control exits 2 — a checker that cannot see the defect it polices must
 * never print a pass.
 *
 * ── EXIT CODES ───────────────────────────────────────────────────────────────
 *   0 — PASS: every arm walked its subject and the ledger is empty.
 *   1 — FAIL at the DECLARED ledger: findings === the pinned rows, exactly.
 *   2 — UNPROVEN: an honesty floor breached; a control stayed silent.
 *   3 — the ledger SET moved in either direction. Never absorbable
 *       (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7).
 *
 * PURE READ: solves synthetic parcels in memory through pure L2 functions. No
 * network, no writes, no clock dependence. Deterministic.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    FieldProvenanceSchema,
    type DeclarativeRulePackDocument,
    type EnvelopeConfidence,
    type FieldProvenance,
    type JurisdictionZoningContract,
    type ParcelEdgeClassification,
    type Pt,
    type ZoningRecord,
} from '../../packages/schemas/src/index.js';
import {
    BCN_20A_DECL_INSTRUMENT_CONTEXT,
    ES_BARCELONA_20A_DECL_DOC,
    classifyEnvelopeCompleteness,
    computeBuildableEnvelope,
    deriveC58Contract,
    listJurisdictionCoverage,
    registeredPackZoneCodes,
    resolveZoneDisposition,
    type DeclarativeInstrumentContext,
} from '../../packages/site-parcel-data/src/index.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = join(__dir, 'unvalidated-claim-ledger.json');

/** The tier a machine read must never out-rank. */
const PIPELINE_ENVELOPE_TIER: EnvelopeConfidence = 'pipeline-extracted-unverified';
/** The machine-read per-field flag (C58 §1.6). */
const PIPELINE_FIELD_PROVENANCE: FieldProvenance = 'pipeline-extracted';
/**
 * The `FieldProvenance` members STRICTLY STRONGER than `pipeline-extracted`
 * (C58 §1.6 prose, and `complianceReport.ts`'s own PROVENANCE_RANK:
 * published-structured 3 > ordinance-pdf 2 > pipeline-extracted 1 > estimated 0).
 * ⚠ That rank map is module-private in an L2 file and cannot be imported; the set
 * is therefore restated here AND cross-checked against the L0 enum's membership on
 * every run, so it cannot silently drift from the vocabulary it describes.
 */
const FIELD_PROVENANCE_ABOVE_PIPELINE: ReadonlySet<string> = new Set([
    'ordinance-pdf',
    'published-structured',
]);

/** The C58 §1.6 caveat's load-bearing phrase — matched, not the whole sentence. */
const MACHINE_CAVEAT_MARKER = 'MACHINE-EXTRACTED';

/** Honesty floors. "Looked nowhere" and "found nothing wrong" must never print the same. */
const MIN_PACK_JURISDICTIONS = 3;
const MIN_ZONE_SOLVES = 40;
const MIN_MACHINE_ZONES = 10;
const MIN_DECL_DOCS = 1;
const MIN_DECL_ZONES = 5;

/* ─────────────────────────── canonical study parcel ─────────────────────────── */

function rect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}
const PARCEL = rect(0, 0, 30, 24); // 720 m², the same study parcel the never-overstate gate uses
const CLASSIFIED: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];
const UNCLASSIFIED: ParcelEdgeClassification[] = ['unclassified', 'unclassified', 'unclassified', 'unclassified'];

/** A minimal provider record with NO structured fields, so every number resolves from the PACK. */
function packZoneRecord(jurisdictionId: string, zoneCode: string): ZoningRecord {
    return {
        zoneCode,
        zoneLabel: `unvalidated-claim audit: ${zoneCode}`,
        jurisdictionId,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: 'unvalidated-claim-gate',
            label: 'synthetic audit record',
            version: 'gate',
            license: null,
            crs: 'EPSG:4326',
        },
    } as unknown as ZoningRecord;
}

interface Finding {
    readonly arm: 'A' | 'B' | 'C' | 'D' | 'E';
    /** LEDGER KEY — name-based and stable; never a line number (lines drift, L-7060). */
    readonly key: string;
    readonly detail: string;
}

const findings: Finding[] = [];
const blind: string[] = [];
/**
 * What each planted control ACTUALLY did this run. Printed, not merely implied by
 * the absence of a complaint — "the control fired" and "the control was never
 * reached" must never print the same, which is the whole §CONTEXT-DATA-HONESTY
 * lesson applied to a gate's own self-test.
 */
const controlLog: string[] = [];

/* ═══════════ arm A/B/C auditor — factored so a PLANTED pack can drive it ════ */

interface SolveAudit {
    readonly findings: Finding[];
    readonly solvedOk: boolean;
    readonly machineFielded: boolean;
}

/**
 * Solve ONE (pack, zone, edges) through the REAL engine and audit arms A/B/C.
 * `label` prefixes the ledger key so a planted run is never confusable with a real one.
 */
function auditPackZone(
    pack: JurisdictionZoningContract,
    zoneCode: string,
    edges: ParcelEdgeClassification[],
    label: string,
): SolveAudit {
    const out: Finding[] = [];
    const zone = pack.zones.find((z) => z.code === zoneCode);
    const provs = Object.values(zone?.fieldProvenance ?? {}) as string[];
    const machineFielded = provs.includes(PIPELINE_FIELD_PROVENANCE);

    const env = computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: edges,
        zoning: packZoneRecord(pack.jurisdictionId, zoneCode),
        rulePack: pack,
    });
    const solvedOk = env.status === 'ok';
    // A refusal draws nothing and can carry no laundered label — counted, never skipped.
    if (!solvedOk || !machineFielded) return { findings: out, solvedOk, machineFielded };

    const edgeTag = edges === CLASSIFIED ? 'classified' : 'unclassified';
    const conf = env.confidence;

    // ARM A — the field-level ceiling.
    if (conf !== PIPELINE_ENVELOPE_TIER) {
        out.push({
            arm: 'A',
            key: `A|${label}/${zoneCode}/${edgeTag}|confidence-${conf}`,
            detail:
                `zone carries ≥1 '${PIPELINE_FIELD_PROVENANCE}' field yet the solved envelope reads ` +
                `'${conf}' — a machine read nobody has checked is publishing at a tier a curated ` +
                'human estimate occupies. The engine clamps to rulePack.defaultConfidence (the PACK ' +
                'level) and reads no per-field flag (§PACK-CONFIDENCE-CEILING, L-665)',
        });
    }

    // ARM B — never "complete".
    const cls = classifyEnvelopeCompleteness(
        conf,
        env.maxHeight_m !== null,
        env.footprintIsUpperBound === true,
        env.publicationPosture ?? null,
    );
    if (cls.complete) {
        out.push({
            arm: 'B',
            key: `B|${label}/${zoneCode}/${edgeTag}|classified-complete`,
            detail:
                'a machine-extracted envelope classified complete:true — it would render in the ' +
                'confident violet a signed determination gets, on every surface that reads ' +
                'classifyEnvelopeCompleteness (globe, plan overlay, card)',
        });
    }

    // ARM C — the louder caveat.
    const caveats = (env.caveats ?? []) as readonly string[];
    if (!caveats.some((c) => c.includes(MACHINE_CAVEAT_MARKER))) {
        out.push({
            arm: 'C',
            key: `C|${label}/${zoneCode}/${edgeTag}|no-machine-caveat`,
            detail:
                `no caveat contains '${MACHINE_CAVEAT_MARKER}' — C58 §1.6 requires this tier to say ` +
                'that a wrong value here is OUR pipeline\'s error, not the publisher\'s, and that only ' +
                'a recorded sign-off clears it',
        });
    }
    return { findings: out, solvedOk, machineFielded };
}

/* ═════════════════════ arm D/E auditor — the DERIVE SEAM ════════════════════ */

interface DeclDoc {
    readonly name: string;
    readonly doc: DeclarativeRulePackDocument;
    readonly ctx: DeclarativeInstrumentContext;
}

const WALKED_DECL_DOCS: readonly DeclDoc[] = [
    { name: 'esBarcelona20aAillada', doc: ES_BARCELONA_20A_DECL_DOC, ctx: BCN_20A_DECL_INSTRUMENT_CONTEXT },
];

/** Does this declarative zone state at least one AI-interpreted claim? */
function zoneHasAiClaim(zone: DeclarativeRulePackDocument['packs'][number]['zones'][number]): boolean {
    return zone.rules.some(
        (r) => r.provenance.confidence.tier === 4 || r.provenance.derivation === 'AI_EXTRACTED',
    );
}

/**
 * Audit ONE declarative document through the REAL loader and the REAL engine.
 * Factored so a PLANTED document can be driven through the identical path.
 */
function auditDeclarativeDoc(entry: DeclDoc): { readonly findings: Finding[]; readonly zones: number } {
    const out: Finding[] = [];
    let zones = 0;
    entry.doc.packs.forEach((pack, packIndex) => {
        const aiZones = pack.zones.filter(zoneHasAiClaim);
        const derived = deriveC58Contract(entry.doc, entry.ctx, packIndex);

        // D1 — the PACK's declared ceiling, which is the ONLY lever the engine reads.
        if (aiZones.length > 0 && derived.defaultConfidence !== PIPELINE_ENVELOPE_TIER) {
            out.push({
                arm: 'D',
                key: `D|${entry.name}/${pack.meta.jurisdictionId}|pack-default-${derived.defaultConfidence}`,
                detail:
                    `${aiZones.length} zone(s) state tier-4 / AI_EXTRACTED claims, yet the derived C58 ` +
                    `contract declares defaultConfidence '${derived.defaultConfidence}'. That field is ` +
                    'the ONLY input capEnvelopeConfidenceToPackDefault reads, so every envelope solved ' +
                    'from this pack publishes above the claim that produced it (spec §20)',
            });
        }

        // D2 — the ZONE's per-field labels.
        for (const zone of pack.zones) {
            zones++;
            if (!zoneHasAiClaim(zone)) continue;
            const derivedZone = derived.zones.find((z) => z.code === zone.code);
            if (!derivedZone) {
                out.push({
                    arm: 'D',
                    key: `D|${entry.name}/${zone.code}|zone-lost-in-derivation`,
                    detail: 'the derived C58 contract has no zone with this code — the loader dropped it',
                });
                continue;
            }
            const strongerLabels = Object.entries(derivedZone.fieldProvenance ?? {})
                .filter(([, v]) => FIELD_PROVENANCE_ABOVE_PIPELINE.has(String(v)))
                .map(([k, v]) => `${k}=${String(v)}`)
                .sort();
            if (strongerLabels.length > 0) {
                const distinct = [...new Set(strongerLabels.map((s) => s.split('=')[1]!))].sort().join(',');
                out.push({
                    arm: 'D',
                    key: `D|${entry.name}/${zone.code}|field-provenance-${distinct}`,
                    detail:
                        `zone states tier-4 / AI_EXTRACTED claim(s) but the derived C58 zone labels ` +
                        `${strongerLabels.length} field(s) as ${distinct} — STRONGER than ` +
                        `'${PIPELINE_FIELD_PROVENANCE}'. 'ordinance-pdf' means A HUMAN TRANSCRIBED THIS ` +
                        '(C58 §1.6). The value came from a model. Labels: ' + strongerLabels.join(' · '),
                });
            }

            // E — the DOWNSTREAM proof: solve the DERIVED contract, read the label
            //     that actually reaches computeBuildableEnvelope.
            const env = computeBuildableEnvelope({
                parcelRing: PARCEL,
                edgeClassifications: CLASSIFIED,
                zoning: packZoneRecord(derived.jurisdictionId, zone.code),
                rulePack: derived,
            });
            if (env.status === 'ok' && env.confidence !== PIPELINE_ENVELOPE_TIER) {
                out.push({
                    arm: 'E',
                    key: `E|${entry.name}/${zone.code}|envelope-${env.confidence}`,
                    detail:
                        `the derived contract solves to a buildable envelope at '${env.confidence}' from ` +
                        'tier-4 / AI_EXTRACTED claims — this is the sentence spec §20 forbids: an ' +
                        'AI-extracted number reaching a buildable-envelope calculation unlabelled',
                });
            }
        }
    });
    return { findings: out, zones };
}

/* ══════════════════════════════════ main ════════════════════════════════════ */

function main(): number {
    /* ── Vocabulary agreement: the restated set must be REAL enum members. ──── */
    const enumMembers = new Set<string>(FieldProvenanceSchema.options);
    for (const m of FIELD_PROVENANCE_ABOVE_PIPELINE) {
        if (!enumMembers.has(m)) {
            blind.push(
                `'${m}' is named as a stronger FieldProvenance but is not a member of the L0 enum ` +
                    `(${[...enumMembers].join(', ')}) — this gate polices a vocabulary that does not exist (L-664)`,
            );
        }
    }
    if (!enumMembers.has(PIPELINE_FIELD_PROVENANCE)) {
        blind.push(`'${PIPELINE_FIELD_PROVENANCE}' is not a member of the L0 FieldProvenance enum`);
    }

    /* ── ARMS A/B/C — the live registered corpus. ──────────────────────────── */
    let packJurisdictions = 0;
    let zoneSolves = 0;
    let solvedOk = 0;
    let refused = 0;
    let machineZones = 0;
    for (const jur of listJurisdictionCoverage().filter((j) => j.packZoneCodes.length > 0)) {
        packJurisdictions++;
        for (const code of registeredPackZoneCodes(jur.jurisdictionId)) {
            const disp = resolveZoneDisposition(jur.jurisdictionId, code);
            if (disp.kind !== 'pack') continue;
            for (const edges of [CLASSIFIED, UNCLASSIFIED]) {
                zoneSolves++;
                const r = auditPackZone(disp.pack, code, edges, jur.jurisdictionId);
                if (r.solvedOk) solvedOk++;
                else refused++;
                if (r.machineFielded && r.solvedOk) machineZones++;
                findings.push(...r.findings);
            }
        }
    }
    if (packJurisdictions < MIN_PACK_JURISDICTIONS || zoneSolves < MIN_ZONE_SOLVES) {
        blind.push(
            `arms A/B/C walked ${packJurisdictions} pack-bearing jurisdiction(s) and ${zoneSolves} ` +
                `zone-solve(s) (floors ${MIN_PACK_JURISDICTIONS} / ${MIN_ZONE_SOLVES})`,
        );
    }
    if (machineZones < MIN_MACHINE_ZONES) {
        blind.push(
            `arms A/B/C reached only ${machineZones} SOLVED machine-extracted zone-solve(s) ` +
                `(floor ${MIN_MACHINE_ZONES}). The arms' whole subject is machine-extracted values; ` +
                'reaching none and printing OK is the §CONTEXT-DATA-HONESTY failure exactly',
        );
    }

    /* ── ARMS D/E — the derive seam. ───────────────────────────────────────── */
    let declZones = 0;
    for (const entry of WALKED_DECL_DOCS) {
        const r = auditDeclarativeDoc(entry);
        declZones += r.zones;
        findings.push(...r.findings);
    }
    if (WALKED_DECL_DOCS.length < MIN_DECL_DOCS || declZones < MIN_DECL_ZONES) {
        blind.push(
            `arms D/E walked ${WALKED_DECL_DOCS.length} document(s) / ${declZones} zone(s) ` +
                `(floors ${MIN_DECL_DOCS} / ${MIN_DECL_ZONES})`,
        );
    }

    /* ── CONTROLS — planted, IN MEMORY, every run. ─────────────────────────── */
    // 1 + 2: a REAL estimated-ruleset pack, copied in memory with one zone's field
    //        flag flipped. The rulepacks/ tree is E4-owned and is NOT touched.
    {
        let planted: { pack: JurisdictionZoningContract; code: string } | null = null;
        let honest: { pack: JurisdictionZoningContract; code: string } | null = null;
        outer: for (const jur of listJurisdictionCoverage().filter((j) => j.packZoneCodes.length > 0)) {
            for (const code of registeredPackZoneCodes(jur.jurisdictionId)) {
                const disp = resolveZoneDisposition(jur.jurisdictionId, code);
                if (disp.kind !== 'pack' || disp.pack.defaultConfidence !== 'estimated-ruleset') continue;
                const probe = computeBuildableEnvelope({
                    parcelRing: PARCEL,
                    edgeClassifications: CLASSIFIED,
                    zoning: packZoneRecord(jur.jurisdictionId, code),
                    rulePack: disp.pack,
                });
                if (probe.status !== 'ok') continue;
                honest = { pack: disp.pack, code };
                planted = {
                    code,
                    pack: {
                        ...disp.pack,
                        zones: disp.pack.zones.map((z) =>
                            z.code === code
                                ? {
                                      ...z,
                                      fieldProvenance: {
                                          ...z.fieldProvenance,
                                          maxHeight: PIPELINE_FIELD_PROVENANCE,
                                      },
                                  }
                                : z,
                        ),
                    } as JurisdictionZoningContract,
                };
                break outer;
            }
        }
        if (planted === null || honest === null) {
            blind.push(
                'CONTROL 1/2 could not run: no registered estimated-ruleset pack zone solves ok, so ' +
                    'the planted-laundering control had no subject. The gate is UNPROVEN, not clean',
            );
        } else {
            const plantedOut = auditPackZone(planted.pack, planted.code, CLASSIFIED, 'PLANTED');
            const armAFired = plantedOut.findings.filter((x) => x.arm === 'A');
            controlLog.push(
                `1 PLANTED field-laundering (${planted.pack.jurisdictionId}/${planted.code}, ` +
                    `defaultConfidence=${planted.pack.defaultConfidence}, one field flipped to ` +
                    `'${PIPELINE_FIELD_PROVENANCE}', solved through the REAL engine) → ` +
                    `${armAFired.length} arm-A finding(s) — ${armAFired.length > 0 ? 'FIRED' : '⛔ SILENT'}` +
                    (armAFired[0] ? `: ${armAFired[0].key}` : ''),
            );
            if (armAFired.length === 0) {
                blind.push(
                    'CONTROL 1 stayed silent: a real pack with one field flipped to ' +
                        `'${PIPELINE_FIELD_PROVENANCE}' still produced no arm-A finding — the arm cannot ` +
                        'see a field-level laundering',
                );
            }
            const honestOut = auditPackZone(honest.pack, honest.code, CLASSIFIED, 'CONTROL-CLEAN');
            controlLog.push(
                `2 SATISFIABILITY (the same pack UNMODIFIED) → ${honestOut.findings.length} finding(s) — ` +
                    `${honestOut.findings.length === 0 ? 'CLEAN as required (L-716)' : '⛔ OVER-BROAD'}`,
            );
            if (honestOut.findings.length !== 0) {
                blind.push(
                    `CONTROL 2 (L-716 satisfiability) is over-broad: the UNMODIFIED pack produced ` +
                        `${honestOut.findings.length} finding(s) — a gate that cannot read 0 on a clean ` +
                        'corpus is not a gate',
                );
            }
        }
    }
    // 3 + 4: planted DECLARATIVE documents through the real loader.
    {
        const base = ES_BARCELONA_20A_DECL_DOC;
        const firstPack = base.packs[0];
        const firstZone = firstPack?.zones.find(zoneHasAiClaim);
        if (!firstPack || !firstZone) {
            blind.push('CONTROL 3/4 could not run: no declarative zone with an AI claim was found to copy');
        } else {
            const oneZoneDoc = (
                defaultConfidence: string,
                fieldProvenance: Record<string, string>,
            ): DeclarativeRulePackDocument =>
                ({
                    ...base,
                    packs: [
                        {
                            ...firstPack,
                            meta: { ...firstPack.meta, defaultConfidence },
                            zones: [{ ...firstZone, fieldProvenance }],
                        },
                    ],
                }) as unknown as DeclarativeRulePackDocument;

            const honestFields: Record<string, string> = {};
            for (const k of Object.keys(firstZone.fieldProvenance)) honestFields[k] = PIPELINE_FIELD_PROVENANCE;
            const honestOut = auditDeclarativeDoc({
                name: 'CONTROL-HONEST',
                doc: oneZoneDoc(PIPELINE_ENVELOPE_TIER, honestFields),
                ctx: BCN_20A_DECL_INSTRUMENT_CONTEXT,
            });
            controlLog.push(
                `3 SATISFIABILITY (a planted tier-4 zone labelled HONESTLY: fields ` +
                    `'${PIPELINE_FIELD_PROVENANCE}', pack default '${PIPELINE_ENVELOPE_TIER}', driven ` +
                    `through the REAL deriveC58Contract) → ${honestOut.findings.length} finding(s) — ` +
                    `${honestOut.findings.length === 0 ? 'CLEAN as required (L-716)' : '⛔ OVER-BROAD'}`,
            );
            if (honestOut.findings.length !== 0) {
                blind.push(
                    `CONTROL 3 (L-716 satisfiability) is over-broad: an HONESTLY LABELLED tier-4 ` +
                        `declarative zone produced ${honestOut.findings.length} finding(s) ` +
                        `(${honestOut.findings.map((x) => x.key).join(', ')}). A gate that flags correct ` +
                        'labelling teaches people to relabel, which is the defect it exists to stop',
                );
            }

            const launderFields: Record<string, string> = {};
            for (const k of Object.keys(firstZone.fieldProvenance)) launderFields[k] = 'ordinance-pdf';
            const launderOut = auditDeclarativeDoc({
                name: 'CONTROL-LAUNDER',
                doc: oneZoneDoc('estimated-ruleset', launderFields),
                ctx: BCN_20A_DECL_INSTRUMENT_CONTEXT,
            });
            const launderFired = launderOut.findings.filter((x) => x.arm === 'D');
            controlLog.push(
                `4 PLANTED derive-seam laundering (the same zone labelled 'ordinance-pdf' at pack ` +
                    `default 'estimated-ruleset') → ${launderFired.length} arm-D finding(s) — ` +
                    `${launderFired.length > 0 ? 'FIRED' : '⛔ SILENT'}` +
                    (launderFired[0] ? `: ${launderFired[0].key}` : ''),
            );
            if (launderFired.length === 0) {
                blind.push(
                    'CONTROL 4 stayed silent: a planted zone labelling tier-4 claims as ordinance-pdf ' +
                        'produced no arm-D finding — the derive seam is unwatched',
                );
            }
        }
    }

    /* ── Report ────────────────────────────────────────────────────────────── */
    console.log(
        `[unvalidated-claim] arms A/B/C: ${packJurisdictions} pack-bearing jurisdiction(s) · ` +
            `${zoneSolves} zone-solve(s) (${solvedOk} ok · ${refused} refused — a refusal carries no ` +
            `label and is counted, not skipped) · ${machineZones} SOLVED machine-extracted zone-solve(s) ` +
            'audited for tier, completeness class and caveat.',
    );
    console.log(
        `[unvalidated-claim] arms D/E: ${WALKED_DECL_DOCS.length} declarative document(s) · ${declZones} ` +
            'zone(s) driven through the REAL deriveC58Contract and then through the REAL ' +
            'computeBuildableEnvelope — behaviour reached, never files counted.',
    );
    console.log(
        `[unvalidated-claim] controls: ${controlLog.length} planted scenario(s) executed IN MEMORY ` +
            'this run — each OUTCOME printed, never merely implied by silence. The rulepacks/ tree ' +
            'was not touched and no fixture was written anywhere:',
    );
    for (const c of controlLog) console.log(`    · CONTROL ${c}`);
    if (controlLog.length < 4) {
        blind.push(
            `only ${controlLog.length} of 4 planted controls were REACHED this run — an unreached ` +
                'control proves nothing, and a gate whose self-test did not run must not print a pass',
        );
    }
    console.log(
        '[unvalidated-claim] NOT ESTABLISHED by this gate: envelope GEOMETRY (check-envelope-never-' +
            'overstates owns every axis — height/FAR/coverage/setback/volume), whether a number is ' +
            'jurisdiction-correct, or whether a verbatim span is faithful (check-claim-carries-evidence ' +
            'owns evidence PRESENCE; nothing yet measures span FAITHFULNESS). It binds the LABEL\'s ' +
            'survival from claim to constraint.',
    );

    if (blind.length > 0) {
        console.error(`[unvalidated-claim] UNPROVEN: ${blind.length} honesty-floor breach(es):`);
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
            console.error(`[unvalidated-claim] UNPROVEN: ledger unreadable — ${String(err)}`);
            return 2;
        }
    }
    const ledger = new Set(ledgerRows);
    const found = new Set(findings.map((x) => x.key));
    const novel = [...found].filter((k) => !ledger.has(k)).sort();
    const struck = [...ledger].filter((k) => !found.has(k)).sort();

    if (novel.length > 0 || struck.length > 0) {
        console.error(
            `[unvalidated-claim] LEDGER SET MOVED — ${novel.length} new · ${struck.length} no longer ` +
                'found. Compared as NAMES, both ways: a count can be right while the set is wrong.',
        );
        for (const k of novel.slice(0, 30)) {
            console.error(`  + NEW      ${k}\n      ${findings.find((x) => x.key === k)?.detail ?? ''}`);
        }
        if (novel.length > 30) console.error(`  … and ${novel.length - 30} more new`);
        for (const k of struck.slice(0, 30)) console.error(`  - STRUCK   ${k}  (fixed — strike this row)`);
        if (struck.length > 30) console.error(`  … and ${struck.length - 30} more struck`);
        console.error(
            '\n  ⛔ Exit 3 in BOTH directions, never absorbable by any ledger ' +
                '(§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7). ⛔ AND THE FIX IS NEVER A CEILING: raising one ' +
                'here would license publishing an unchecked machine read as a human determination.',
        );
        return 3;
    }

    if (findings.length > 0) {
        console.error(
            `[unvalidated-claim] FAIL at the DECLARED ledger: ${findings.length} laundering finding(s), ` +
                `exactly the ${ledger.size} pinned row(s):`,
        );
        const byArm = new Map<string, number>();
        for (const x of findings) byArm.set(x.arm, (byArm.get(x.arm) ?? 0) + 1);
        for (const [arm, n] of [...byArm].sort()) console.error(`  · arm ${arm}: ${n} finding(s)`);
        for (const x of findings.slice(0, 14)) console.error(`  · ${x.key}\n      ${x.detail}`);
        if (findings.length > 14) console.error(`  … and ${findings.length - 14} more (all pinned by name)`);
        console.error(
            '\n  EXIT CONDITION: make the LABELS agree with the CLAIMS in the declarative pilot — ' +
                'either stamp the migrated rules with the derivation that is actually true, or carry ' +
                "the machine tier through to the pack's defaultConfidence and fieldProvenance. Both " +
                'are honest; the current pair is not, because the two axes contradict each other.',
        );
        return 1;
    }

    console.log(
        '[unvalidated-claim] OK: 0 finding(s). No unvalidated claim reaches a buildable envelope ' +
            'wearing a tier stronger than the claim that produced it.',
    );
    return 0;
}

try {
    process.exit(main());
} catch (err) {
    console.error('[unvalidated-claim] UNPROVEN: gate crashed —', err);
    process.exit(2);
}
