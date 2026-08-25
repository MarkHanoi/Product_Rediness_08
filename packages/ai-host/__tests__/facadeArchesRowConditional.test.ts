// ⛔ §HONESTY65-ARCHES-ROW (L-11152) — the "not as arches" contradiction, closed.
//
// THE DEFECT: `FACADE_UNAVAILABLE` carried a flat row — "the arcade is built as a
// square-headed shopfront, not as arches" — written before the executor learned to
// cut arches from a photograph (§GEN-FACADE-OPENINGS, L-11080/L-11081). On the
// founder's own arcade scenario (photo attached, ground band measured arched, the
// word "arches" in his sentence) the Confirm card and the persistent transcript
// both DENIED the very arches the build was cutting.
//
// THE FIX IS CONDITIONAL ON WHAT THE EXECUTOR REALLY DOES, and lives in the one
// layer that holds both halves: the resolver removes the row exactly when
// `bandIsArched(photo.openings, 0)` — the SAME verdict the executor uses to choose
// arcade-over-curtain — and says the positive fact instead. Words alone keep the
// row (the words-only build really is square-headed); curtain mode keeps the row
// AND gets the executor's §HONESTY65-CURTAIN-DROP-NAMED (L-11151) lattice line.

import { describe, expect, it } from 'vitest';

import { reconstructFacade } from '@pryzm/facade-reconstruction';
import { caseL } from '@pryzm/facade-reconstruction/testing';

import { mapFacadeIRToPhotoBrief } from '../src/intents/FacadePhotoBrief.js';
import { FACADE_UNAVAILABLE_ARCHES_PREFIX } from '../src/intents/FacadeIntent.js';
import { bandIsArched } from '../src/intents/FacadeOpeningProgram.js';
import { resolveUtterance, type ResolverContext, type ZeroTokenResolution } from '../src/intents/ZeroTokenResolver.js';

let seq = 0;
const ctxOf = (photoFacade?: ReturnType<typeof mapFacadeIRToPhotoBrief>): ResolverContext => ({
    selection: [],
    levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
    activeLevelId: 'L0',
    mintId: () => `arch-${++seq}`,
    ...(photoFacade !== undefined ? { photoFacade } : {}),
});

const resolved = (r: ZeroTokenResolution): { summary: string; payload: Record<string, unknown> } => {
    if (r.kind !== 'commands') throw new Error(`expected commands, got "${r.kind}"`);
    const cmd = r.commands.find((c) => c.type === 'generation.building');
    if (cmd === undefined) throw new Error('no generation.building command');
    return { summary: r.summary ?? '', payload: cmd.payload as Record<string, unknown> };
};

/** The founder's arcade ask: arches in WORDS + the photo attached. */
const ARCHES_SENTENCE =
    'GENERATE 5-STOREY RESIDENTIAL BUILDING WITH AN ARCADE OF ARCHES AS PER THE ATTACHED PHOTO';

describe('§HONESTY65-ARCHES-ROW — the row is conditional on what the executor builds', () => {
    it('⭐ arcade built from the photo ⇒ the row is REMOVED and the positive fact is said', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseL().image));
        // Precondition — this photo genuinely drives the arcade path: the verdict
        // asserted here is the EXECUTOR's own (arcade beats curtain, L-11081).
        expect(brief.openings).not.toBeNull();
        expect(bandIsArched(brief.openings!, 0)).toBe(true);

        const { summary, payload } = resolved(resolveUtterance(ARCHES_SENTENCE, ctxOf(brief)));
        const unavailable = (payload['facadeUnavailable'] as readonly string[] | undefined) ?? [];
        expect(
            unavailable.some((row) => row.startsWith(FACADE_UNAVAILABLE_ARCHES_PREFIX)),
            `facadeUnavailable still carries the arches row: ${JSON.stringify(unavailable)}`,
        ).toBe(false);
        // The card no longer claims a square-headed arcade about an arched build…
        expect(summary).not.toContain('square-headed shopfront');
        // …and says what IS built instead of silently no-longer-refusing.
        expect(summary).toContain('arched openings you asked for');
    });

    it('words alone ⇒ the row STAYS, stating the words-only truth', () => {
        const { payload } = resolved(resolveUtterance(ARCHES_SENTENCE, ctxOf()));
        const unavailable = (payload['facadeUnavailable'] as readonly string[] | undefined) ?? [];
        const row = unavailable.find((r) => r.startsWith(FACADE_UNAVAILABLE_ARCHES_PREFIX));
        expect(row, `facadeUnavailable was: ${JSON.stringify(unavailable)}`).toBeDefined();
        // The rewritten row is TRUE on this path and names the condition under
        // which arches are real — never the flat "not as arches" claim.
        expect(row!).toContain('from words alone');
        expect(row!).toContain('ground band as arched');
    });

    it('only the arches row is removed — every other unavailable row survives the photo', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseL().image));
        const sentence = `${ARCHES_SENTENCE} WITH TIMBER SHUTTERS`;
        const { payload } = resolved(resolveUtterance(sentence, ctxOf(brief)));
        const unavailable = (payload['facadeUnavailable'] as readonly string[] | undefined) ?? [];
        expect(unavailable.some((r) => r.startsWith(FACADE_UNAVAILABLE_ARCHES_PREFIX))).toBe(false);
        expect(unavailable.some((r) => r.includes('shutters'))).toBe(true);
    });
});
