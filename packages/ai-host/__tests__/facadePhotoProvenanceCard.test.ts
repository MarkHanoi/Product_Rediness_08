// §GEN-PHOTO-BRIEF (L-11020) — ⭐⭐ THE PROVENANCE CARD.
//
// THE ONE QUESTION THIS FEATURE IS JUDGED ON: *before he confirms, can he see
// what came from where?*
//
// A build that quietly absorbed a photograph reads as a complete success whether
// it understood the image or not. These tests pin the four rows that make the
// difference — and, above all, the `Not used:` row, because detected-but-not-built
// is exactly what a hurried implementation drops and exactly what the user cannot
// recover once the geometry appears.
//
// ⛔ THE INPUT IS A REAL RECONSTRUCTION, NOT A HAND-BUILT BRIEF. Every brief here
// comes from `reconstructFacade()` over a C108 corpus image, so a change in the
// engine that empties a row fails HERE rather than shipping a blank card. A fake
// brief assembled from this file's own expectations could not falsify anything
// (see `fake-more-capable-than-real`).
//
// ⚠ L-11001 STANDS. The façade engine has never been pointed at a real
// photograph. The corpus is synthetic with known ground truth, and a green run
// here says nothing whatever about a phone camera.

import { describe, expect, it } from 'vitest';

import { reconstructFacade } from '@pryzm/facade-reconstruction';
import { caseC, caseD } from '@pryzm/facade-reconstruction/testing';

import { mapFacadeIRToPhotoBrief } from '../src/intents/FacadePhotoBrief.js';
import {
    applySemanticIntent,
    parseGenerateBuildingIntent,
    type ResolverContext,
} from '../src/intents/ZeroTokenResolver.js';

let seq = 0;
function ctxOf(overrides: Partial<ResolverContext> = {}): ResolverContext {
    return {
        selection: [],
        levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
        activeLevelId: 'L0',
        mintId: () => `photo-${++seq}`,
        ...overrides,
    } as ResolverContext;
}

/** The founder's flow end to end: a photograph + a sentence -> the Confirm card. */
async function cardFor(
    sentence: string,
    image: Awaited<ReturnType<typeof caseC>>['image'],
): Promise<{ summary: string; payload: Record<string, unknown> }> {
    const photoFacade = mapFacadeIRToPhotoBrief(await reconstructFacade(image));
    const ctx = ctxOf({ photoFacade });
    const si = parseGenerateBuildingIntent(sentence, ctx);
    expect(si, `the grammar did not recognise: ${sentence}`).not.toBeNull();
    const r = applySemanticIntent(si!, ctx);
    expect(r.kind, r.kind === 'refusal' ? r.reason : '').toBe('commands');
    if (r.kind !== 'commands') throw new Error('unreachable');
    return { summary: r.summary, payload: r.commands[0]!.payload };
}

/** The card is rendered `white-space: pre-line` (AIPanel `showZeroTokenConfirm`),
 *  so a row is a real line. Reading rows back is what a user's eye does. */
function rowOf(summary: string, label: string): string {
    const line = summary.split('\n').find((l) => l.startsWith(`${label}:`));
    expect(line, `no "${label}:" row in card:\n${summary}`).toBeDefined();
    return line!.slice(label.length + 1).trim();
}

describe('§GEN-PHOTO-BRIEF — the card is ROWS, and every source is named', () => {
    it('shows all four provenance rows for a photo + sentence', async () => {
        const { summary } = await cardFor('generate a residential building', caseC().image);
        // ⭐ FOUR SOURCES, FOUR ROWS. Not a paragraph — the format IS the feature.
        for (const label of ['From the photo', 'From your words', 'From the site', 'Not used']) {
            expect(summary.split('\n').some((l) => l.startsWith(`${label}:`)), label).toBe(true);
        }
    });

    it('the photo row carries the MEASURED storey count with its confidence', async () => {
        const c = caseC();
        const { summary } = await cardFor('generate a residential building', c.image);
        const row = rowOf(summary, 'From the photo');
        // The number the corpus generator DREW, attributed to the photo and to
        // nothing else — and never bare: a measurement without its confidence is
        // an assertion.
        expect(row).toContain(`${c.truth.storeys} storeys`);
        expect(row).toMatch(/confidence \d\.\d\d/);
    });

    it('the words row carries the typology and the colour — and the photo row never does', async () => {
        const { summary } = await cardFor(
            'generate a residential building with a green façade',
            caseC().image,
        );
        const words = rowOf(summary, 'From your words');
        const photo = rowOf(summary, 'From the photo');
        expect(words).toContain('residential building');
        // ⛔ COLOUR COMES FROM HIS WORDS. There is no colour-extraction stage in
        // C108 and this lane did not add one, so a colour on the photo row would
        // be a lie about where a value came from.
        expect(words.toLowerCase()).toContain('green');
        expect(photo.toLowerCase()).not.toContain('green');
    });

    it('the site row names the footprint as the source of SIZE, never the image', async () => {
        const { summary } = await cardFor('generate a residential building', caseC().image);
        const site = rowOf(summary, 'From the site');
        expect(site).toContain('footprint');
        // ⛔ C108 §2.2 — `scale.status` is `unknown` without a reference dimension.
        expect(site).toContain('no metres');
    });
});

describe('§GEN-PHOTO-BRIEF — ⭐⭐ the "Not used" row, the one that must never go quiet', () => {
    it('names the FALSIFIED tile pattern, and never lets it reach the payload', async () => {
        const { summary, payload } = await cardFor('generate a residential building', caseC().image);
        const notUsed = rowOf(summary, 'Not used');
        // L-11012: the tile-pitch stage returns the OPENING LATTICE at 0.69–0.79
        // confidence and 2–3x the truth on clean input. It is FALSIFIED, not
        // merely unproven, so it must be VISIBLE and INERT — both, not either.
        expect(notUsed).toContain('tile');
        expect(notUsed).toContain('UNVERIFIED');
        // ⛔ THE INERT HALF. Nothing tile-shaped may appear anywhere in what is built.
        expect(JSON.stringify(payload).toLowerCase()).not.toContain('tilepitch');
        expect(JSON.stringify(payload.facade ?? {}).toLowerCase()).not.toContain('tile');
    });

    it('always names SIZE and COLOUR as things the photograph did not supply', async () => {
        const { summary } = await cardFor('generate a residential building', caseC().image);
        const notUsed = rowOf(summary, 'Not used');
        // These two are what a user most naturally assumes a photo carried. Saying
        // so out loud costs one line; discovering it after the build costs trust.
        expect(notUsed).toContain('SIZE');
        expect(notUsed).toContain('COLOUR');
    });

    it('never asks for a colour it has already been given', async () => {
        // ⚠ THE CARD MUST NOT CONTRADICT ITSELF. The mapper sees only the
        // photograph, so its stock colour line ends "say it in words and I will
        // apply it" — which, printed beside a row applying the green façade he DID
        // say in words, reads as a refusal of something already granted.
        const { summary } = await cardFor(
            'generate a residential building with a green façade',
            caseC().image,
        );
        const notUsed = rowOf(summary, 'Not used');
        expect(notUsed).toContain('COLOUR');            // still shown — the PHOTO gave none
        expect(notUsed).toContain('came from your words'); // ...and says where it came from
        expect(notUsed).not.toContain('and I will apply it');
    });

    it('still asks for a colour when the sentence gave none', async () => {
        const { summary } = await cardFor('generate a residential building', caseC().image);
        expect(rowOf(summary, 'Not used')).toContain('and I will apply it');
    });

    it('is never empty on a real reconstruction — a silent row would be the defect', async () => {
        for (const c of [caseC(), caseD()]) {
            const { summary } = await cardFor('generate a residential building', c.image);
            expect(rowOf(summary, 'Not used').length).toBeGreaterThan(0);
            expect(rowOf(summary, 'Not used')).not.toBe('nothing — every reading was used');
        }
    });

    it('states L-11001 on every card: this engine has never seen a real photograph', async () => {
        const { summary } = await cardFor('generate a residential building', caseD().image);
        expect(summary).toContain('L-11001');
        expect(summary).toContain('never been pointed at a real photograph');
    });
});

describe('§GEN-PHOTO-BRIEF — the SENTENCE wins, and the card says which won', () => {
    it('a typed storey count overrules the photograph, and is attributed to his words', async () => {
        const c = caseC();
        const { summary, payload } = await cardFor('generate a 9-storey residential building', c.image);
        // ⭐ The photo measured something else; the typed number is what is BUILT.
        expect(c.truth.storeys).not.toBe(9);
        expect(payload.floors).toBe(9);
        // ...and the attribution follows the value: 9 is on the WORDS row.
        expect(rowOf(summary, 'From your words')).toContain('9 storeys');
    });

    it('with no storey count typed, the photograph fills it and the payload uses it', async () => {
        const c = caseC();
        const { summary, payload } = await cardFor('generate a residential building', c.image);
        expect(payload.floors).toBe(c.truth.storeys);
        // The number appears on the PHOTO row and not on the words row — the whole
        // point of the card is that these two are never confused.
        expect(rowOf(summary, 'From the photo')).toContain(`${c.truth.storeys} storeys`);
        expect(rowOf(summary, 'From your words')).not.toContain(`${c.truth.storeys} storeys`);
    });

    it('the payload carries the provenance forward, so the transcript outlives the card', async () => {
        const { payload } = await cardFor('generate a residential building', caseC().image);
        const prov = payload.photoProvenance as readonly string[] | undefined;
        expect(prov).toBeDefined();
        // The Confirm card is seen once and scrolls away; the report persists.
        expect(prov!.some((p) => p.includes('read from your photo'))).toBe(true);
        expect(prov!.some((p) => p.startsWith('not used:'))).toBe(true);
    });
});
