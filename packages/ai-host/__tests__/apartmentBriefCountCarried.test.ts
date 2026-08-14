// L-911 defect (1) — THE REQUESTED COUNT MUST REACH THE BRIEF.
//
// The founder typed "CREATE 3 BEDRROM APPARMENT" on the 2026-08-14 deploy and
// the chat replied "Laying out 2 bedrooms, 1 bathroom…" — the DEFAULT brief.
// The noun typo ("apparment") was already tolerated; the COUNT typo
// ("bedrrom") was not, so `APT_BEDROOMS_RE` missed and `bedrooms` arrived null,
// which the editor spread over DEFAULT_PROGRAM (2 bedrooms / 1 bathroom) with
// nothing said about the substitution.
//
// C78 §1.2b — a default PRESENTED AS the user's request is failure-as-emptiness
// in the intent layer. Either the digit is read, or the sentence names the
// default AS a default, with its number, so the two can never be confused.
//
// This suite pins the utterance → brief edge only (pure, no DOM, no engine).

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  parseApartmentLayoutIntent,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { resolveNaturalLanguage } from '../src/intents/LocalNaturalLanguageResolver.js';

let seq = 0;
const ctxOf = (): ResolverContext => ({
  selection: [],
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  activeLevelId: 'L0',
  mintId: () => `l911-${++seq}`,
});

/** The full ladder the chat bridge uses for a single sentence. */
function resolveFull(utterance: string): ZeroTokenResolution {
  const tier01 = resolveUtterance(utterance, ctxOf());
  if (tier01.kind !== 'miss') return tier01;
  const nl = resolveNaturalLanguage(utterance, ctxOf());
  return nl.kind === 'resolved' ? nl.resolution : { kind: 'miss' };
}

/** The `generation.apartment` payload the resolver hands the editor. */
function payloadOf(r: ZeroTokenResolution): Record<string, unknown> | null {
  if (r.kind !== 'commands') return null;
  const c = r.commands[0];
  return c && c.type === 'generation.apartment' ? (c.payload as Record<string, unknown>) : null;
}

describe('L-911 (1) — the requested bedroom count reaches the brief', () => {
  it('"create 3 bedroom apartment" carries 3', () => {
    expect(payloadOf(resolveFull('create 3 bedroom apartment'))).toEqual({ bedrooms: 3 });
  });

  it("THE FOUNDER'S EXACT STRING — \"CREATE 3 BEDRROM APPARMENT\" carries 3", () => {
    // Verbatim from the 2026-08-14 console, caps and all. The chat answered
    // "Laying out 2 bedrooms" — the default — instead of 3.
    expect(payloadOf(resolveFull('CREATE 3 BEDRROM APPARMENT'))).toEqual({ bedrooms: 3 });
  });

  it('the misspelling family around "bedroom" all read the digit', () => {
    // Every one of these is a real keyboard slip on the same word. The parser
    // is the SHARED one (tier-0 grammar + NL classifier), so a hit here is a
    // hit on both paths by construction.
    for (const word of ['bedrrom', 'bedrom', 'bedroms', 'bedrooom', 'bed rooms', 'bedrooms']) {
      const si = parseApartmentLayoutIntent(`create a 3 ${word} apartment`);
      expect(si, word).not.toBeNull();
      expect(si!.bedrooms, word).toBe(3);
    }
  });

  it('a misspelled BATHROOM count is read too', () => {
    const si = parseApartmentLayoutIntent('create a 3 bedrrom apparment with 2 bathroms');
    expect(si).not.toBeNull();
    expect(si!.bedrooms).toBe(3);
    expect(si!.bathrooms).toBe(2);
  });

  it('a word that merely STARTS with "bed" is not a bedroom count', () => {
    // The tolerance must not turn "2 bedside tables" into a 2-bedroom brief.
    expect(parseApartmentLayoutIntent('create an apartment with 2 bedside tables')?.bedrooms)
      .toBeNull();
  });

  it('CONTROL — the sentence the user is shown matches the brief that was built', () => {
    const r = resolveFull('create a 3 bedrrom apparment');
    expect(payloadOf(r)).toEqual({ bedrooms: 3 });
    if (r.kind !== 'commands') throw new Error('expected commands');
    // Three asked ⇒ three announced. The L-911 sighting was 3 asked / 2
    // announced / 5 sized, and the announcement is the half this layer owns.
    expect(r.summary).toContain('3-bedroom');
    expect(r.summary).not.toMatch(/\b2[\s-]bedroom\b/);
  });
});

describe('L-911 (1) — an UNSTATED count is named as a default, never as the ask', () => {
  it('"create an apartment" states the default programme WITH ITS NUMBERS', () => {
    const r = resolveFull('create an apartment');
    const p = payloadOf(r);
    expect(p).toEqual({});          // nothing invented into the brief
    if (r.kind !== 'commands') throw new Error('expected commands');
    // The word "default" alone is not enough — the user must be able to see
    // WHAT it defaulted to before confirming, and to correct it.
    expect(r.summary).toMatch(/default/i);
    expect(r.summary).toContain('2 bedrooms');
    expect(r.summary).toContain('1 bathroom');
    // …and it must invite the correction rather than present the default as
    // though it were the request.
    expect(r.summary).toMatch(/say how many|tell me how many/i);
  });

  it('an explicit count never triggers the default sentence', () => {
    const r = resolveFull('create a 4 bedroom apartment');
    if (r.kind !== 'commands') throw new Error('expected commands');
    expect(r.summary).toContain('4-bedroom');
    expect(r.summary).not.toMatch(/default/i);
  });
});
