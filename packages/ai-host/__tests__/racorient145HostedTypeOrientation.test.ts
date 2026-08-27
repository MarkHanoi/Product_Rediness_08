// §RACORIENT145 — the compass-facing ADJECTIVE for HOSTED TYPE changes
// (window / door), driven DIRECTLY against `parseWindowTypeIntent` /
// `parseDoorTypeIntent` rather than through the full `resolveUtterance`
// ladder.
//
// ⚠ WHY DIRECT, NOT THE FULL LADDER: at the time this pins, `WallSideFinishIntent.ts`
// / `ChatCapabilityRegistry.ts` / `CapabilityExecutionSpec.ts` / `QualifierAxes.ts`
// are DIRTY from a CONCURRENT lane's in-flight edit (measured via `git status`,
// §RACSIDE144 owns `WallSideFinishIntent.ts`) — `capability-acceptance.test.ts`
// run through the real ladder is CURRENTLY RED on ~12 UNRELATED cases (wall
// dimensions/type/curtain-wall-dimensions all swallowed by `set-wall-side-finish`),
// none of which this lane's diff touches. Driving the parser DIRECTLY isolates
// THIS lane's change from that concurrent contamination; `makeHostedTypeParser`
// is a pure function of its inputs and does not import `WallSideFinishIntent.ts`
// at all, so this file falsifies §RACORIENT145's own claim without depending on
// a sibling lane's WIP settling first.
import { describe, expect, it } from 'vitest';
import { parseWindowTypeIntent, parseDoorTypeIntent } from '../src/intents/ZeroTokenResolver.js';

describe('§RACORIENT145 — "west-facing" windows/doors parse to an orientation scope', () => {
  it('the founder\'s literal sentence: "change all west-facing windows to steel crittal style"', () => {
    const hit = parseWindowTypeIntent('change all west-facing windows to steel crittal style');
    expect(hit).not.toBeNull();
    expect(hit!.scope).toEqual({ kind: 'orientation', orientation: 'W' });
    expect(hit!.typeRef).toBe('steel crittal style');
  });

  it('every cardinal direction resolves to its Compass4 letter', () => {
    const cases: Array<[string, 'N' | 'E' | 'S' | 'W']> = [
      ['change all north-facing windows to timber casement', 'N'],
      ['change all east-facing windows to timber casement', 'E'],
      ['change all south-facing windows to timber casement', 'S'],
      ['change all west-facing windows to timber casement', 'W'],
    ];
    for (const [sentence, compass] of cases) {
      const hit = parseWindowTypeIntent(sentence);
      expect(hit, sentence).not.toBeNull();
      expect(hit!.scope, sentence).toEqual({ kind: 'orientation', orientation: compass });
    }
  });

  it('doors take the same adjective', () => {
    const hit = parseDoorTypeIntent('change all west-facing doors to white primed softwood');
    expect(hit).not.toBeNull();
    expect(hit!.scope).toEqual({ kind: 'orientation', orientation: 'W' });
    expect(hit!.typeRef).toBe('white primed softwood');
  });

  it('composes with the ALL scope only — "these west-facing windows" contradicts the live selection and is NOT claimed', () => {
    expect(parseWindowTypeIntent('change these west-facing windows to timber casement')).toBeNull();
    expect(parseWindowTypeIntent('change selected west-facing windows to timber casement')).toBeNull();
  });

  it('the PREPOSITIONAL spelling ("windows in the west facade") resolves the SCOPE, unaffected by this change', () => {
    // ⚠ Its typeRef is a SEPARATE, pre-existing defect (measured in isolation,
    // reproduced on the UNMODIFIED regex, out of this lane's scope): the lazy
    // tail-phrase capture stops at "west" and leaves "facade to timber
    // casement" as the (wrong) typeRef. The SCOPE this test asserts is
    // unaffected either way — orientation still resolves to 'W'.
    const hit = parseWindowTypeIntent('change all windows in the west facade to timber casement');
    expect(hit).not.toBeNull();
    expect(hit!.scope).toEqual({ kind: 'orientation', orientation: 'W' });
  });

  it('a plain "change all windows to X" sentence (no compass word) is UNCHANGED — orientation is undefined, not a false positive', () => {
    const hit = parseWindowTypeIntent('change all windows to timber casement');
    expect(hit).not.toBeNull();
    expect(hit!.scope).toBe('all');
  });

  it('the singular "change the window type to X" form is untouched by the new capture group', () => {
    const hit = parseWindowTypeIntent('change the window type to timber casement');
    expect(hit).not.toBeNull();
    expect(hit!.scope).toBe('selection');
    expect(hit!.typeRef).toBe('timber casement');
  });

  it('a dimension ask is still declined, not swallowed as a type ref (regression guard on the shifted group indices)', () => {
    expect(parseWindowTypeIntent('change all west-facing windows 1m wide')).toBeNull();
  });
});
