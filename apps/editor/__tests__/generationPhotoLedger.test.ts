// ⭐ §HONESTY65-PHOTO-LEDGER (L-11150) — the photograph's provenance ledger
// reaches the SAME post-build report as the engine's own lines.
//
// THE DEFECT THIS PINS: the resolver has emitted `photoProvenance` on the
// `generation.building` payload since §GEN-PHOTO-BRIEF (L-11020), verbatim "so
// the post-build transcript can repeat what was NOT done" — and the seam DROPPED
// it. `GenerationBuildingPayload` did not even declare the field, so only the
// SENTENCE'S `facadeUnavailable` printed (generationChatSeam.ts:338-340) and the
// photo's not-built legs (the mapper's `notUsed` rows) died with the Confirm
// card. A build that quietly ignored half the image read as a complete success.

import { describe, it, expect } from 'vitest';
import { appendPhotoLedger, type GenerationBuildingPayload } from '../src/ui/generation/generationChatSeam.js';

describe('§HONESTY65-PHOTO-LEDGER — the photo ledger merges into the one report', () => {
    it('BOTH halves print: the sentence line AND the photo ledger, one report', () => {
        // The lines exactly as runResidential builds them: engine report + the
        // sentence's facadeUnavailable line already pushed.
        const lines = [
            'Built the residential building (12 apartments).',
            'Not built, as flagged before you confirmed: timber shutters — shutters are not an element the generator places.',
        ];
        const cmd: GenerationBuildingPayload = {
            typology: 'residential-building',
            photoProvenance: [
                'the storey count (7) — read from your photo, high confidence',
                'not used: the UPPER-floor window rhythm — only the ground band is laid out from the lattice (L-11085)',
            ],
        };
        appendPhotoLedger(lines, cmd);
        expect(lines).toHaveLength(3);
        const ledger = lines[2]!;
        expect(ledger).toContain('From your photo');
        expect(ledger).toContain('storey count (7)');
        expect(ledger).toContain('not used: the UPPER-floor window rhythm');
        // The sentence's own line is untouched beside it — both sources, one report.
        expect(lines[1]).toContain('Not built, as flagged before you confirmed');
    });

    it('no duplicate lines: a row already printed above is not printed again', () => {
        const dup = 'not used: the tile pattern — FALSIFIED on the corpus (L-11012)';
        const lines = [`Built the residential building (8 apartments).`, `From the engine: ${dup}.`];
        const cmd: GenerationBuildingPayload = {
            typology: 'residential-building',
            // The duplicate row plus one genuinely new row — only the new one prints.
            photoProvenance: [dup, dup, 'the ground band arcade — read from your photo, high confidence'],
        };
        appendPhotoLedger(lines, cmd);
        expect(lines).toHaveLength(3);
        expect(lines[2]).toContain('ground band arcade');
        expect(lines[2]).not.toContain('tile pattern');
    });

    it('an all-duplicate or absent ledger adds nothing', () => {
        const row = 'not used: everything — no measurement from this image is usable';
        const lines = [`report line mentioning ${row}`];
        appendPhotoLedger(lines, { typology: 'residential-building', photoProvenance: [row] });
        expect(lines).toHaveLength(1);
        appendPhotoLedger(lines, { typology: 'residential-building' });
        expect(lines).toHaveLength(1);
    });
});
