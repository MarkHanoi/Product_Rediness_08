// E8-TRIAL — THE MEASURED PRECISION TRIAL, runner.
//
//   npx tsx tools/ordinance-trial/run-trial.ts            # the trial
//   npx tsx tools/ordinance-trial/run-trial.ts --verbose  # + every FP and FN
//   npx tsx tools/ordinance-trial/run-trial.ts --json out.json
//
// WHAT IT RUNS. The spine that EXISTS today, unchanged, through the repo's own
// instruments: acquire (`tools/ordinance-ingest/lib/httpCache.ts`) → read
// (`pdfText.ts` + the geometric item-joiner) → classify → normalize →
// `extractRules(text, GERMAN_GRAMMAR, source)` → `toEnvelopeParameters`.
//
// ⛔ WHAT IT CANNOT RUN, AND SAYS SO. Two of the six spine stages do not exist:
//   - Stage 3 STRUCTURE (`CanonicalDocument` / `CanonicalTable`) — types only, zero
//     producers. So the CH table is fed to the extractor as a FLATTENED stream, which
//     is the whole reason its cells are unattributable.
//   - Stage 4 AI (`DualPassExtractor`) — a port with no implementation anywhere in
//     the repo. So every AI-interpret result in this trial is PENDING, not zero.
// Those two are reported as PENDING with their reason, never as a score.
//
// ⛔ AND THE GOLD SET IS UNCONFIRMED BY HUMAN. Every number this prints is a
// SELF-ASSESSMENT until a named human signs `goldset/e8-gold-set.ts`.

import { writeFile } from 'node:fs/promises';
import { extractRules } from '../../packages/ordinance-extraction/src/textExtract/extractor.js';
import { GERMAN_GRAMMAR } from '../../packages/ordinance-extraction/src/grammars/german.js';
import { toEnvelopeParameters } from '../../packages/ordinance-extraction/src/envelope/mapper.js';
import { rangeSanityGate } from '../../packages/ordinance-extraction/src/gates/rangeSanityGate.js';
import { E8_GOLD_SET } from './goldset/e8-gold-set.js';
import type { Stratum } from './goldset/types.js';
import { loadDocument, selectPages } from './lib/corpus.js';
import {
    oraclePredictions,
    scoreStratum,
    scrambleDigits,
    toPredictions,
    type Prediction,
    type StratumScore,
} from './lib/score.js';

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = (() => {
    const i = process.argv.indexOf('--json');
    return i >= 0 ? process.argv[i + 1] : undefined;
})();

interface ArmCRow {
    readonly field: string;
    readonly goldSays: string;
    readonly extractorSays: string;
    readonly verdict: 'ok' | 'WRONG' | 'no-outcome' | 'not-sought';
}

const pct = (v: number | null): string => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

/**
 * 95% half-width for a proportion with a finite-population correction, N = 10 000
 * claims. The same formula the scout falsified against COMPASS's published ±13.83%
 * at n = 50 — re-asserted here so the control travels with the number it sizes.
 */
function halfWidth(n: number, p = 0.5, N = 10_000): number {
    if (n <= 0) return NaN;
    const se = Math.sqrt((p * (1 - p)) / n);
    const fpc = N > n ? Math.sqrt((N - n) / (N - 1)) : 0;
    return 1.96 * se * fpc;
}

async function runStratum(
    s: Stratum,
): Promise<
    | { score: StratumScore; scrambled: StratumScore; oracle: StratumScore; armC: ArmCRow[]; notes: string[] }
    | { error: string }
> {
    const notes: string[] = [];
    const doc = await loadDocument(s.documentUrl, s.sha256);
    if ('ok' in doc && doc.ok === false) return { error: doc.detail };
    const loaded = doc as Exclude<typeof doc, { ok: false }>;

    if (loaded.digitisation !== s.ingestionPath) {
        notes.push(
            `⚠ ingestion path drifted: gold set recorded '${s.ingestionPath}', the reader now classifies '${loaded.digitisation}'.`,
        );
    }

    const text = selectPages(loaded, s.pages);
    const source = { document: `${s.id} :: ${s.documentUrl}`, page: null };

    const unknownReasons = new Map<string, string>();

    const run = (t: string): Prediction[] => {
        const out = extractRules(t, GERMAN_GRAMMAR, source);
        if (!out.ok) {
            notes.push(`extractor REFUSED: ${out.reason} — ${out.detail}`);
            return [];
        }
        if (t === text) {
            for (const u of out.unknowns) unknownReasons.set(u.field, u.rule ? `${u.reason} (${u.rule})` : u.reason);
        }
        // The envelope mapper is run too, so the trial exercises the shipping path
        // rather than a private one; its three-valued outcome is reported below.
        const env = toEnvelopeParameters(out);
        if (env.ok && t === text) {
            const { resolved, autoAccepted, conflicted, unknown } = env.summary;
            notes.push(
                `envelope mapper: ${resolved} resolved (${autoAccepted} auto-accepted) · ${conflicted} conflicted · ${unknown} unknown · ${env.rejected.length} reject(s) · ${env.coherence.length} coherence check(s).`,
            );
        }
        return toPredictions(out.rules);
    };

    const preds = run(text);
    const scrambledPreds = run(scrambleDigits(text));

    // Which emitted values the RANGE GATE would have caught — reported so the
    // trial says what defence-in-depth actually buys, rather than assuming it.
    const flagged = preds.filter((p) => rangeSanityGate(p.field, p.value).verdict === 'flag');
    notes.push(
        `range gate on emitted values: ${flagged.length} of ${preds.length} flagged` +
            (flagged.length > 0 ? ` (${flagged.map((f) => `${f.field}=${f.value}`).join(', ')})` : ''),
    );

    // ── ARM C — HONEST-UNKNOWN FIDELITY ──
    // Control 9 says UNKNOWN must stay distinct from zero, unlimited and
    // no-restriction. It follows that "the text is silent" must also stay distinct
    // from "the value is on the drawing" and from "the value is in a table we could
    // not read". This arm checks the REASON, not the number.
    const armC: ArmCRow[] = [];
    const goldRows = E8_GOLD_SET.rows.filter((r) => r.stratum === s.id);
    const fields = [...new Set(goldRows.map((r) => r.field))];
    for (const f of fields) {
        const fr = goldRows.filter((r) => r.field === f);
        const hasNumber = fr.some((r) => r.label === 'NUMBER');
        const hasRule = fr.some((r) => r.label === 'RULE-NOT-VALUE');
        const said = unknownReasons.get(f);
        const goldSays = hasNumber
            ? 'the source STATES a value for this field'
            : hasRule
              ? 'the field is regulated but its value lives elsewhere (drawing / annex / discretion)'
              : 'the source is genuinely silent on this field';
        if (said === undefined) {
            // ⚠ TWO DIFFERENT CAUSES, and conflating them is itself the honesty bug.
            //   (a) a value WAS emitted for this field, so no unknown is due; or
            //   (b) the grammar has NO MATCHER for this field, so it was never even
            //       sought — and NOTHING is recorded either way. Silence there is not
            //       an answer, it is an absence of a question.
            const emittedHere = preds.some((p) => p.field === f);
            const sought = GERMAN_GRAMMAR.matchers.some((m) => m.field === f);
            armC.push({
                field: f,
                goldSays,
                extractorSays: emittedHere
                    ? '— (a value was emitted for this field, so no outcome is due)'
                    : sought
                      ? '— (sought, but neither a value nor an outcome was recorded)'
                      : '⛔ NOT SOUGHT — the grammar defines no matcher for this field. No value, no unknown, no trace.',
                verdict: emittedHere ? 'no-outcome' : sought ? 'WRONG' : 'not-sought',
            });
            continue;
        }
        const ok = hasNumber
            ? said !== 'not-stated-in-text'
            : hasRule
              ? said.startsWith('stated-as-rule-not-value')
              : said === 'not-stated-in-text';
        armC.push({ field: f, goldSays, extractorSays: said, verdict: ok ? 'ok' : 'WRONG' });
    }

    return {
        score: scoreStratum(s.id, E8_GOLD_SET.rows, preds),
        scrambled: scoreStratum(s.id, E8_GOLD_SET.rows, scrambledPreds),
        oracle: scoreStratum(s.id, E8_GOLD_SET.rows, oraclePredictions(E8_GOLD_SET.rows, s.id)),
        armC,
        notes,
    };
}

async function main(): Promise<void> {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(' E8-TRIAL — measured precision trial of the EXISTING ordinance spine');
    console.log(` gold set ${E8_GOLD_SET.version} · authored ${E8_GOLD_SET.authoredOn}`);
    console.log(' ⛔ humanConfirmed = false — this is a SELF-ASSESSMENT, not a validated figure');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    const results: Record<string, unknown> = {};
    let anyError = false;

    for (const s of E8_GOLD_SET.strata) {
        console.log(`\n───────────────────────────────────────────────────────────────────────────`);
        console.log(`STRATUM ${s.id} — ${s.label}`);
        console.log(`  document      ${s.documentUrl}`);
        console.log(`  sha256        ${s.sha256}`);
        console.log(`  pages         ${s.pages.join(', ')}`);
        console.log(`  shape         ${s.valueShape} · path ${s.ingestionPath} · ${s.country} · ${s.sample}`);
        console.log(`  selected by   ${s.selectionRule}`);
        for (const b of s.declaredBias) console.log(`  ⚠ bias        ${b}`);

        const r = await runStratum(s);
        if ('error' in r) {
            console.log(`\n  ⛔ COULD NOT RUN: ${r.error}`);
            anyError = true;
            continue;
        }
        const { score, scrambled, oracle, armC, notes } = r;

        console.log(`\n  GOLD SET (the denominators, stated)`);
        for (const [k, v] of Object.entries(score.labelCounts)) console.log(`    ${k.padEnd(20)} ${v} row(s)`);
        console.log(`    distinct gold (field,value) claims: ${score.armA.goldClaimCount}`);

        console.log(`\n  CONTROL 1 — ORACLE (predictions built FROM the gold set; must be 100%/100%)`);
        console.log(`    precision ${pct(oracle.armA.precision)} · recall ${pct(oracle.armA.recall)}`);
        const oracleOk = oracle.armA.precision === 1 && oracle.armA.recall === 1;
        console.log(`    ${oracleOk ? '✓ scorer plumbing verified' : '⛔ SCORER IS BROKEN — do not read the numbers below'}`);

        console.log(`\n  ARM A — CLAIM SET, distinct (field, value) within the stratum`);
        console.log(`    emitted           ${score.armA.emittedCount}`);
        console.log(`    true positives    ${score.armA.truePositives.length}`);
        console.log(`    false positives   ${score.armA.falsePositives.length}` +
            ` (named traps ${score.armA.falsePositives.filter((f) => f.klass === 'named-trap').length},` +
            ` unlisted ${score.armA.falsePositives.filter((f) => f.klass === 'unlisted').length})`);
        console.log(`    false negatives   ${score.armA.falseNegatives.length}`);
        console.log(`    PRECISION         ${pct(score.armA.precision)}   (denominator: ${score.armA.emittedCount} emitted claims)`);
        console.log(`    RECALL            ${pct(score.armA.recall)}   (denominator: ${score.armA.goldClaimCount} gold claims)`);
        console.log(`    OVERSTATEMENT     ${pct(score.armA.overstatementRate)}   (${score.armA.overstatementCount} of ${score.armA.emittedCount} emitted claims exceed the gold ceiling)`);

        console.log(`\n  ARM B — SLOT, (locator, field, value) — the PRODUCT unit`);
        console.log(`    gold NUMBER rows      ${score.armB.matched.length + score.armB.valueOnly.length + score.armB.missed.length + score.armB.unanchorable.length}`);
        console.log(`    anchorable            ${score.armB.slotDenominator}`);
        console.log(`    ⛔ UNANCHORABLE       ${score.armB.unanchorable.length}  (table cells: no sentence exists to cite — Stage 3 CanonicalTable is unbuilt)`);
        console.log(`    matched               ${score.armB.matched.length}`);
        console.log(`    value seen, wrong/no locator ${score.armB.valueOnly.length}`);
        console.log(`    missed                ${score.armB.missed.length}`);
        console.log(`    SLOT RECALL           ${pct(score.armB.slotRecall)}   (denominator: ${score.armB.slotDenominator} anchorable rows)`);

        console.log(`\n  ⭐ SILENT LOSS — gold values dropped by a field that DID emit something else`);
        console.log(`    ${score.silentLosses.length} of ${score.armB.matched.length + score.armB.valueOnly.length + score.armB.missed.length + score.armB.unanchorable.length} gold NUMBER rows`);
        for (const sl of score.silentLosses) {
            console.log(`      ${sl.field} = ${sl.value} LOST; the field emitted ${sl.emittedInstead.join(', ')} instead — and recorded NO unknown, because FieldOutcome is per-FIELD, not per-CLAIM.`);
        }

        console.log(`\n  CONTROL 2 — SCRAMBLE (every digit remapped; the harness must SCORE WORSE)`);
        console.log(`    precision ${pct(scrambled.armA.precision)} · recall ${pct(scrambled.armA.recall)} · emitted ${scrambled.armA.emittedCount}`);
        const dropped =
            (score.armA.precision ?? 0) > (scrambled.armA.precision ?? 0) ||
            (score.armA.recall ?? 0) > (scrambled.armA.recall ?? 0) ||
            score.armA.truePositives.length > scrambled.armA.truePositives.length;
        if (score.armA.emittedCount === 0 && scrambled.armA.emittedCount === 0) {
            console.log(
                `    ⚠ INCONCLUSIVE for this stratum — the extractor emitted nothing on either input, so the control` +
                    ` cannot tell a working harness from a silent one HERE. (It DOES discriminate on the strata where` +
                    ` anything was emitted, which is what establishes the harness itself.)`,
            );
        } else {
            console.log(`    ${dropped ? '✓ the harness can fail — it is measuring the document, not the shape of the text' : '⛔ NO DROP — this harness would score the same on nonsense. Its numbers mean nothing.'}`);
        }

        const n = score.armA.goldClaimCount;
        console.log(`\n  POWER`);
        console.log(`    n = ${n} distinct gold claims → 95% half-width ±${(halfWidth(n) * 100).toFixed(1)}% (worst case p=0.5, N=10 000)`);
        if (n < 50) console.log(`    ⛔ BELOW THE 50-PER-STRATUM FLOOR (E8-SCOUT §4.4). Report the DIRECTION, never the percentage.`);

        console.log(`\n  ARM C — HONEST-UNKNOWN FIDELITY (control 9: is the REASON right, not just the number?)`);
        for (const c of armC) {
            const mark = c.verdict === 'ok' ? '✓      ' : c.verdict === 'WRONG' ? '⛔ WRONG' : c.verdict === 'not-sought' ? '⛔ BLIND ' : '·      ';
            console.log(`    ${mark} ${c.field.padEnd(18)} gold: ${c.goldSays}`);
            console.log(`            ${''.padEnd(18)} said: ${c.extractorSays}`);
        }

        console.log(`\n  NOTES`);
        for (const nt of notes) console.log(`    ${nt}`);

        if (VERBOSE) {
            console.log(`\n  FALSE POSITIVES (every one)`);
            for (const f of score.armA.falsePositives) {
                console.log(`    ${f.overstates ? '⛔ OVERSTATES' : '   wrong     '} ${f.field} = ${f.value}  [${f.klass}${f.namedBy ? ` ${f.namedBy}` : ''}]`);
                for (const s2 of f.sentences.slice(0, 1)) console.log(`        cited: "${s2.slice(0, 170)}${s2.length > 170 ? '…' : ''}"`);
            }
            console.log(`\n  FALSE NEGATIVES (every one)`);
            for (const f of score.armA.falseNegatives) console.log(`    ${f.field} = ${f.value}   gold rows: ${f.rows.join(', ')}`);
        }

        results[s.id] = { stratum: s, score, scrambled, oracle, armC, notes };
    }

    console.log(`\n\n───────────────────────────────────────────────────────────────────────────`);
    console.log(`STAGES THAT COULD NOT BE MEASURED — PENDING, not zero`);
    console.log(`  Stage 3 STRUCTURE  — CanonicalDocument / CanonicalSection / CanonicalTable are`);
    console.log(`                       DECLARED with ZERO producers. The CH table is therefore fed`);
    console.log(`                       to the extractor as a flattened stream. PENDING.`);
    console.log(`  Stage 4 AI         — DualPassExtractor has no implementation anywhere in the repo,`);
    console.log(`                       so no AI-interpreted claim exists to score. PENDING.`);
    console.log(`  Tier-4 producer    — zero producers emit derivation 'AI_EXTRACTED'. Nothing in this`);
    console.log(`                       trial reaches the RuleProvenance ladder at all. PENDING.`);
    console.log(`───────────────────────────────────────────────────────────────────────────`);

    if (JSON_OUT !== undefined) {
        await writeFile(JSON_OUT, JSON.stringify({ goldSet: E8_GOLD_SET.version, results }, null, 2), 'utf8');
        console.log(`\nwrote ${JSON_OUT}`);
    }
    if (anyError) process.exitCode = 1;
}

main().catch((e: unknown) => {
    console.error('trial failed:', e);
    process.exitCode = 1;
});
