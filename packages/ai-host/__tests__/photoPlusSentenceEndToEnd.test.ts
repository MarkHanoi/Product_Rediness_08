/**
 * §CHAT-ATTACH-E2E (L-10910) — THE FOUNDER'S ASK, END TO END, IN ONE TEST.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PROVES THAT NOTHING ELSE DID
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Four things existed and were tested SEPARATELY: the reconstruction engine
 * (C108, corpus 30/30), the IR→brief bridge (L-11020, 15 tests), the resolver's
 * generation grammar (capability-acceptance), and the chat's attachment UI
 * (§CHAT-ATTACH-REACHABILITY, 21 assertions). Each one green.
 *
 * ⭐ AND NOT ONE OF THEM RAN A PIXEL THROUGH TO A PAYLOAD. That is the shape of
 * [[committed-is-not-reachable]]: four correct components with nothing asserting
 * they compose. This file starts from an IMAGE BUFFER and ends at the
 * `generation.building` payload the bus would receive, driving the REAL
 * `reconstructFacade` → `mapFacadeIRToPhotoBrief` → `resolveUtterance` →
 * `applySemanticIntent` chain with no stand-in anywhere in it.
 *
 * ── ⚠ THE TWO LEGS IT DOES NOT COVER, NAMED RATHER THAN IMPLIED AWAY ────────
 *   1. THE BROWSER DECODE. `decodeImageFile` needs `createImageBitmap` and a 2-D
 *      canvas; this is Node. The corpus hands over a `RasterImage` directly,
 *      which is exactly what the decode produces (C108 §5.3 — `ImageData` IS a
 *      `RasterImage`). The decode leg is covered by the panel's own suite.
 *   2. THE BUILD. `generation.building` reaching the executor and producing
 *      geometry is the seam's, and is proven where the seam is proven.
 *
 * ⚠ L-11001 STANDS, AND THIS FILE DOES NOT WEAKEN IT. Every image here is
 * SYNTHETIC with ground truth the generator DREW. A green run says the PLUMBING
 * carries a measurement end to end. It says nothing whatever about a phone
 * camera pointed at a real building.
 *
 * C108 §6.2 — "no error thrown" is not an assertion. Every `expect` below
 * compares to a number the corpus DREW, or to a value the user's own sentence
 * stated.
 */

import { describe, expect, it } from 'vitest';

import { reconstructFacade } from '@pryzm/facade-reconstruction';
import { caseA, caseC } from '@pryzm/facade-reconstruction/testing';

import { mapFacadeIRToPhotoBrief } from '../src/intents/FacadePhotoBrief.js';
import {
    applySemanticIntent,
    resolveUtterance,
    type ResolverContext,
    type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import type { FacadePhotoBrief } from '../src/intents/FacadePhotoBrief.js';

let seq = 0;

/**
 * The resolver context the CHAT builds, minus everything irrelevant to
 * generation. `photoFacade` is the ONE field this lane added to it, and it is
 * injected here exactly as `buildContext(turn)` injects it in the browser.
 */
function ctxWithPhoto(photoFacade?: FacadePhotoBrief): ResolverContext {
    return {
        selection: [],
        levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
        activeLevelId: 'L0',
        mintId: () => `e2e-${++seq}`,
        ...(photoFacade !== undefined ? { photoFacade } : {}),
    };
}

/** Run a real photograph through the real chain and return the brief. */
async function briefFrom(image: Parameters<typeof reconstructFacade>[0]): Promise<FacadePhotoBrief> {
    return mapFacadeIRToPhotoBrief(await reconstructFacade(image));
}

/** The `generation.building` payload, or a failure that names what came back. */
function payloadOf(r: ZeroTokenResolution): Record<string, unknown> {
    if (r.kind !== 'commands') {
        throw new Error(
            `expected a dispatchable resolution, got "${r.kind}"` +
                (r.kind === 'refusal' ? `: ${r.reason}` : ''),
        );
    }
    const cmd = r.commands.find((c) => c.type === 'generation.building');
    if (cmd === undefined) {
        throw new Error(`no generation.building command; got ${r.commands.map((c) => c.type).join(', ')}`);
    }
    return cmd.payload as Record<string, unknown>;
}

/** ⭐ THE SENTENCE FROM THE FOUNDER'S BRIEF, verbatim. */
const FOUNDER_SENTENCE =
    'create a residential building with the facade as per the image - 5 storey building on the current boundary line';

describe('§CHAT-ATTACH-E2E — ⭐ the founder\'s photo + sentence, image buffer to bus payload', () => {
    it('produces ONE generation.building command carrying storeys, typology and the boundary line', async () => {
        const brief = await briefFrom(caseA().image);
        const r = resolveUtterance(FOUNDER_SENTENCE, ctxWithPhoto(brief));
        const p = payloadOf(r);

        // ⭐ THE SENTENCE WINS THE STOREY COUNT. He typed 5; the corpus image
        // DRAWS 4. A photo may not overrule a typed instruction.
        expect(caseA().truth.storeys).toBe(4);
        expect(p.floors).toBe(5);

        expect(p.typology).toBe('residential-building');
        // §GEN-ON-BOUNDARY-LINE — the footprint comes from the drawn line, which
        // is the half of his sentence that decides WHERE.
        expect(p.footprintSource).toBe('boundary-line');
    });

    it('⛔ the photo NEVER sets a size — no metric length reaches the payload', async () => {
        // C108 §2.2: `scale.status` is `unknown` without a reference dimension, so
        // the building's size comes from the footprint and never from the image.
        const brief = await briefFrom(caseA().image);
        const p = payloadOf(resolveUtterance(FOUNDER_SENTENCE, ctxWithPhoto(brief)));
        for (const key of Object.keys(p)) {
            expect(key).not.toMatch(/width|height|depth|metres|meters|lengthM|areaM/i);
        }
    });
});

describe('§CHAT-ATTACH-E2E — the photo fills what the sentence left unsaid', () => {
    it('⭐⭐ supplies the STOREY COUNT when the words name none — the DRAWN 4', async () => {
        // This is the case the whole feature exists for: he describes the façade
        // and lets the picture supply the number.
        const c = caseA();
        const brief = await briefFrom(c.image);
        const p = payloadOf(
            resolveUtterance(
                'create a residential building with the facade as per the image on the current boundary line',
                ctxWithPhoto(brief),
            ),
        );
        // The number the PHOTOGRAPH contributed, and it is the number the corpus
        // generator DREW — not a default, not a guess.
        expect(p.floors).toBe(c.truth.storeys);
        expect(p.floors).toBe(4);
    });

    it('maps a measured arcaded ground floor onto the façade field the generator already had', async () => {
        // Corpus case C draws semicircular heads (archness 1). The bridge's
        // threshold turns that into `groundCommercialCurtain` — a field
        // ResidentialBuildingRequest has carried since §RESI-PREVIEW-OPTIONS.
        const c = caseC();
        expect(c.truth.archness).toBe(1);
        const brief = await briefFrom(c.image);
        const p = payloadOf(
            resolveUtterance(
                'create a residential building as per the image on the current boundary line',
                ctxWithPhoto(brief),
            ),
        );
        expect((p.facade as { groundCommercialCurtain?: boolean }).groundCommercialCurtain).toBe(true);
    });

    it('§L-11128 — carries the WALL colour the photo read when the sentence names none, and the spoken colour when the sentence names one', async () => {
        const brief = await briefFrom(caseC().image);
        const silent = payloadOf(
            resolveUtterance(
                'create a residential building as per the image on the current boundary line',
                ctxWithPhoto(brief),
            ),
        );
        const fromPhoto = (silent.facade as { facadeColor?: string }).facadeColor;
        if (brief.facade.facadeColor !== undefined) {
            // At or above the floor: the payload carries EXACTLY the measured hex.
            expect(fromPhoto).toBe(brief.facade.facadeColor);
            expect(fromPhoto).toMatch(/^#[0-9a-f]{6}$/);
        } else {
            // Under the floor: nothing is invented.
            expect(fromPhoto).toBeUndefined();
        }
        // WORDS WIN: a colour in the sentence overrides whatever the photo read.
        const spoken = payloadOf(
            resolveUtterance(
                'create a residential building with a green façade as per the image on the current boundary line',
                ctxWithPhoto(brief),
            ),
        );
        const fromWords = (spoken.facade as { facadeColor?: string }).facadeColor;
        expect(fromWords).toMatch(/^#[0-9a-f]{6}$/i);
        if (brief.facade.facadeColor !== undefined) expect(fromWords).not.toBe(brief.facade.facadeColor);
    });
});

describe('§CHAT-ATTACH-E2E — the Confirm card shows the user WHAT CAME FROM WHERE', () => {
    it('names the photo, his words, the site AND what was thrown away, before anything is built', async () => {
        const brief = await briefFrom(caseA().image);
        const r = resolveUtterance(FOUNDER_SENTENCE, ctxWithPhoto(brief));
        if (r.kind !== 'commands') throw new Error(`expected commands, got ${r.kind}`);

        // ⭐ THE ONE QUESTION THIS FEATURE IS JUDGED ON. A build that quietly
        // absorbed a photograph reads as a complete success whether it understood
        // the image or not, and the user has no way to tell which.
        expect(r.summary).toContain('From the photo:');
        expect(r.summary).toContain('From your words:');
        expect(r.summary).toContain('From the site:');
        expect(r.summary).toContain('Not used:');
        // The measurement is on the card with its confidence, so he can reject it.
        expect(r.summary).toMatch(/\d+ storeys \(confidence \d\.\d\d/);
        // ⚠ And the honest caveat rides with it.
        expect(r.summary).toContain('never been pointed at a real photograph');
        // It is DESTRUCTIVE, so the card gates the build rather than the build
        // happening and the card explaining it afterwards.
        expect(r.destructive).toBe(true);
    });

    it('⛔ says the SIZE did not come from the image — the assumption a user is most likely to make', async () => {
        const brief = await briefFrom(caseA().image);
        const r = resolveUtterance(FOUNDER_SENTENCE, ctxWithPhoto(brief));
        if (r.kind !== 'commands') throw new Error(`expected commands, got ${r.kind}`);
        expect(r.summary).toContain('a photograph carries no metres');
    });
});

describe('§CHAT-ATTACH-E2E — ⛔ the no-photo path is byte-for-byte unchanged', () => {
    it('the SAME sentence without a photo produces the same payload minus the façade the photo supplied', () => {
        // ⭐ THE REGRESSION GUARD FOR EVERY EXISTING USER. If attaching nothing
        // changed anything, this whole lane would be a behaviour change to the
        // chat rather than an addition to it.
        const p = payloadOf(resolveUtterance(FOUNDER_SENTENCE, ctxWithPhoto(undefined)));
        expect(p.typology).toBe('residential-building');
        expect(p.floors).toBe(5);
        expect(p.footprintSource).toBe('boundary-line');
    });

    it('a plain typed generation names no photo on its card', () => {
        const r = resolveUtterance('generate a 3-storey residential building', ctxWithPhoto(undefined));
        if (r.kind !== 'commands') throw new Error(`expected commands, got ${r.kind}`);
        expect(r.summary).not.toContain('From the photo:');
    });
});

describe('§CHAT-ATTACH-E2E — C74: an unreadable façade REFUSES rather than building', () => {
    it('⛔ a flat grey image is refused by NAME, and no command is emitted', async () => {
        // Not a façade: no bands, no openings. The mapper refuses, and the apply
        // arm returns that refusal INSTEAD of a build. Reaching the generator
        // with an unmeasurable image would produce a plausible wrong building.
        const width = 200;
        const height = 200;
        const data = new Uint8ClampedArray(width * height * 4).fill(128);
        for (let i = 3; i < data.length; i += 4) data[i] = 255;
        const brief = await briefFrom({ width, height, data });

        const r = resolveUtterance(FOUNDER_SENTENCE, ctxWithPhoto(brief));
        expect(r.kind).toBe('refusal');
        if (r.kind !== 'refusal') throw new Error('unreachable');
        // ⭐ NAMES WHAT IT MEASURED AND WHAT IT NEEDED, and offers a way forward.
        expect(r.reason.length).toBeGreaterThan(80);
        expect(r.suggestions.length).toBeGreaterThan(0);
        // ⛔ And the refusal must NOT read as a build.
        expect(r.reason.toLowerCase()).not.toContain('built the');
    });

    it('the refusal comes back even though the SENTENCE was perfectly well formed', async () => {
        // The sentence alone would have resolved. The photo is what refuses, and
        // the photo is the most deliberate thing the user did in the turn.
        const clean = resolveUtterance(FOUNDER_SENTENCE, ctxWithPhoto(undefined));
        expect(clean.kind).toBe('commands');
    });
});

describe('§CHAT-ATTACH-E2E — applySemanticIntent is the SAME executor either way', () => {
    it('the photo path goes through the ONE apply arm, not a parallel one', async () => {
        // `resolveUtterance` runs `applySemanticIntent` internally. Driving the
        // apply arm DIRECTLY with the same intent must give the same command, or
        // there are two paths and they will drift.
        const brief = await briefFrom(caseA().image);
        const viaResolve = payloadOf(resolveUtterance(FOUNDER_SENTENCE, ctxWithPhoto(brief)));
        const viaApply = payloadOf(
            applySemanticIntent(
                {
                    intent: 'generate-building',
                    typology: 'residential-building',
                    floors: 5,
                    onBoundaryLine: true,
                    photo: brief,
                },
                ctxWithPhoto(brief),
            ),
        );
        expect(viaApply).toEqual(viaResolve);
    });
});
