// §MANUALENV159 (L-12640) — SOURCE PINS for the `ProjectSnapshot.manualStudyHeight` wiring.
//
// Mirrors `envelopeCardSections.spec.ts`'s own "SOURCE PINS" convention and
// `rateBookSnapshotSync.test.ts`'s own reasoning for why this suite does NOT instantiate a live
// `ProjectLoader`/`ProjectSerializer` (needs a BimManager, CommandManager and scene — see
// `snapshotFamilyRoundTrip.spec.ts`'s header). The pure round-trip of the underlying state module
// is already pinned in `userSuppliedStudyHeightState.spec.ts` (11 tests) and its REACHABILITY
// through `restoreSiteState` is pinned in `userSuppliedStudyHeightWiring.test.ts` (7 tests,
// including a full save → serialize → reset → restore → rehydrate cycle). What remains — and what
// this file exists to prove — is that `ProjectSerializer.ts` and `ProjectLoader.ts` actually CALL
// those functions, at the field name the schema declares, in the right order (memory:
// [[committed-is-not-reachable]]).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SERIALIZER_SRC = readFileSync(resolve(__dirname, '../ProjectSerializer.ts'), 'utf8');
const LOADER_SRC = readFileSync(resolve(__dirname, '../ProjectLoader.ts'), 'utf8');

describe('§MANUALENV159 — ProjectSerializer actually WRITES manualStudyHeight (C47 additive-optional)', () => {
    it('declares the optional field on ProjectSnapshot', () => {
        expect(SERIALIZER_SRC).toMatch(/manualStudyHeight\?:\s*\{/);
    });

    it('populates it from the SAME module the wiring test exercises, never a second store', () => {
        expect(SERIALIZER_SRC).toContain(
            "import { serializeUserSuppliedStudyHeights } from '@app/ui/site/userSuppliedStudyHeightState';",
        );
        expect(SERIALIZER_SRC).toContain('manualStudyHeight: ((): ProjectSnapshot[\'manualStudyHeight\'] =>');
        expect(SERIALIZER_SRC).toContain('serializeUserSuppliedStudyHeights()');
    });

    it('omits the key entirely when nothing was recorded — never an empty stub (mirrors §RATES157\'s own rule)', () => {
        // The ternary must return `undefined`, not `{ version: 1, bySiteId: {} }`, when
        // `serializeUserSuppliedStudyHeights()` itself returned `undefined`.
        const block = SERIALIZER_SRC.slice(SERIALIZER_SRC.indexOf('manualStudyHeight: ((): ProjectSnapshot'));
        const closeIdx = block.indexOf('})(),');
        const body = block.slice(0, closeIdx);
        expect(body).toMatch(/bySiteId \? \{ version: 1, bySiteId \} : undefined/);
    });
});

describe('§MANUALENV159 — ProjectLoader actually RESTORES manualStudyHeight, BEFORE restoreSiteState', () => {
    it('imports restoreUserSuppliedStudyHeights from the SAME module', () => {
        expect(LOADER_SRC).toContain(
            "import { restoreUserSuppliedStudyHeights } from '@app/ui/site/userSuppliedStudyHeightState';",
        );
    });

    it('calls it with the field the serializer writes (`manualStudyHeight.bySiteId`)', () => {
        expect(LOADER_SRC).toContain('restoreUserSuppliedStudyHeights(');
        expect(LOADER_SRC).toMatch(/manualStudyHeight\?\.bySiteId/);
    });

    it('ORDERING: restoreUserSuppliedStudyHeights runs BEFORE restoreSiteState — the rehydrate inside restoreSiteState needs the raw decision already in memory', () => {
        const restoreCallIdx = LOADER_SRC.indexOf('restoreUserSuppliedStudyHeights(');
        const siteStateCallIdx = LOADER_SRC.indexOf('const restored = restoreSiteState(');
        expect(restoreCallIdx).toBeGreaterThan(-1);
        expect(siteStateCallIdx).toBeGreaterThan(-1);
        expect(restoreCallIdx).toBeLessThan(siteStateCallIdx);
    });
});

describe('§MANUALENV159 — restoreSiteState itself REBUILDS the study, never replays a stale one verbatim', () => {
    it('siteDispatch.ts reads the persisted decision and calls buildUserSuppliedStudyEnvelope against the JUST-RESTORED ring', () => {
        const src = readFileSync(resolve(__dirname, '../../../ui/site/siteDispatch.ts'), 'utf8');
        expect(src).toContain('getUserSuppliedStudyHeight(model.id)');
        expect(src).toContain('buildUserSuppliedStudyEnvelope({');
        // Rebuilt against `polygon` (the just-validated, just-restored ring), not against any
        // field lifted verbatim off the old computed study.
        expect(src).toMatch(/parcelRing:\s*polygon,/);
    });
});
