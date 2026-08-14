// L-911 (1) DRIFT PIN — the default the CHAT quotes must be the default the
// ENGINE uses.
//
// The resolver (L2, `@pryzm/ai-host`) cannot import the editor's L7
// `DEFAULT_PROGRAM`, so it restates the numbers in order to name the
// substitution out loud ("the DEFAULT programme (2 bedrooms, 1 bathroom)").
// Two copies of a number is exactly how L-911 happened in the first place —
// so this pin fails the moment they disagree, which is the only thing that
// makes the restatement honest.

import { describe, it, expect } from 'vitest';
// Deep import, not the `@pryzm/ai-host` barrel: the barrel reaches
// ConstraintEngine → `window` AT MODULE LOAD (the SCC no-barrel-at-load rule),
// which a node-env editor suite cannot satisfy. The resolver module itself is
// pure.
import { APARTMENT_STATED_DEFAULT } from '../../../packages/ai-host/src/intents/ZeroTokenResolver.js';
import { DEFAULT_PROGRAM } from '../src/ui/apartment-layout/layoutRequestPayload.js';

describe('L-911 — the stated apartment default matches the engine default', () => {
    it('bedrooms + bathrooms agree with DEFAULT_PROGRAM', () => {
        expect(APARTMENT_STATED_DEFAULT.bedrooms).toBe(DEFAULT_PROGRAM.bedrooms);
        expect(APARTMENT_STATED_DEFAULT.bathrooms).toBe(DEFAULT_PROGRAM.bathrooms);
    });
});
