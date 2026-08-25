// §CHAT-OPENING-SHAPE (L-10940) + §CHAT-AXIS-AWARE-REFUSAL (L-10942).
//
// ⭐ THE NON-VACUITY THAT MATTERS: the FIRST assertion here is the founder's
// literal string, "segmental type" — the exact span the product answered with
// "There is no window type called 'segmental type' in this project". If that
// one passes and everything else fails, the lane still moved; if it fails, the
// lane did nothing whatever the rest of the file says.

import { describe, it, expect } from 'vitest';
import {
  OPENING_PROFILE_KINDS,
  OPENING_PROFILE_LABELS,
  openingProfilesFor,
} from '@pryzm/geometry-wall';
import {
  resolveOpeningShapeRef,
  openingShapeNames,
  openingShapeLegalFor,
} from '../src/intents/OpeningShapeVocabulary';
import {
  probeQualifierAxes,
  axesSearched,
  unmatchedQualifierTail,
  QUALIFIER_AXES,
} from '../src/intents/QualifierAxes';
import { resolveCompassRef, compassWords } from '../src/intents/SpatialScopeTail';

describe('§A — the founder\'s literal span', () => {
  it('⭐ "segmental type" resolves to the SEGMENTAL ARCH profile', () => {
    expect(resolveOpeningShapeRef('segmental type')?.kind).toBe('segmental-arch');
  });

  it('⛔ NON-VACUITY — the trailing axis noun really was the problem: it is stripped, not ignored', () => {
    // Both spellings must land on the same kind, or the fix is only half here.
    expect(resolveOpeningShapeRef('segmental')?.kind).toBe('segmental-arch');
    expect(resolveOpeningShapeRef('segmental profile')?.kind).toBe('segmental-arch');
    expect(resolveOpeningShapeRef('segmental arch head')?.kind).toBe('segmental-arch');
  });
});

describe('§B — open language, not a phrase list', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['segmental', 'segmental-arch'],
    ['segmental arch', 'segmental-arch'],
    ['segmental-arch', 'segmental-arch'],
    ['shallow arch', 'segmental-arch'],
    ['shallow arched', 'segmental-arch'],
    ['jack arch', 'segmental-arch'],
    ['cambered arch', 'segmental-arch'],
    ['arched', 'round-arch'],
    ['arch', 'round-arch'],
    ['round arch', 'round-arch'],
    ['round arched', 'round-arch'],
    ['semicircular', 'round-arch'],
    ['semi-circular', 'round-arch'],
    ['semi circular head', 'round-arch'],
    ['half round', 'round-arch'],
    ['roman arch', 'round-arch'],
    ['circular', 'circular'],
    ['circle', 'circular'],
    ['round', 'circular'],
    ['oculus', 'circular'],
    ['porthole', 'circular'],
    ['bullseye', 'circular'],
    ["bull's eye", 'circular'],
    ['rectangular', 'rectangular'],
    ['rectangle', 'rectangular'],
    ['square head', 'rectangular'],
    ['square-headed', 'rectangular'],
    ['flat head', 'rectangular'],
    ['straight', 'rectangular'],
    ['standard', 'rectangular'],
  ];
  for (const [text, kind] of cases) {
    it(`"${text}" → ${kind}`, () => {
      expect(resolveOpeningShapeRef(text)?.kind).toBe(kind);
    });
  }

  it('word ORDER does not matter — the vocabulary is tokens, not phrases', () => {
    expect(resolveOpeningShapeRef('arch segmental')?.kind).toBe('segmental-arch');
    expect(resolveOpeningShapeRef('arch round')?.kind).toBe('round-arch');
  });

  it('⭐ "round arch" is an ARCH, never a circle — the modifier-beats-noun rule', () => {
    expect(resolveOpeningShapeRef('round arch')?.kind).toBe('round-arch');
    expect(resolveOpeningShapeRef('round')?.kind).toBe('circular');
  });
});

describe('§C — ⛔ what it must NOT claim', () => {
  it('a real catalogue name is not a shape', () => {
    expect(resolveOpeningShapeRef('timber casement')).toBeNull();
    expect(resolveOpeningShapeRef('aluminium triple glazed')).toBeNull();
    expect(resolveOpeningShapeRef('single pane (default)')).toBeNull();
  });

  it('⭐ a type name that CONTAINS a shape word stays a type name', () => {
    // A majority of words this axis does not know ⇒ not a shape reference.
    expect(resolveOpeningShapeRef('timber casement round top unit')).toBeNull();
  });

  it('an empty / noise-only phrase claims nothing', () => {
    expect(resolveOpeningShapeRef('')).toBeNull();
    expect(resolveOpeningShapeRef('type')).toBeNull();
    expect(resolveOpeningShapeRef('the profile')).toBeNull();
  });

  it('a phrase that argues two ways equally resolves to NULL, never a coin flip', () => {
    expect(resolveOpeningShapeRef('circular rectangular')).toBeNull();
  });
});

describe('§D — the vocabulary is DERIVED from geometry-wall, never transcribed', () => {
  it('⭐ every OpeningProfileKind is reachable by at least its own UI label', () => {
    for (const kind of OPENING_PROFILE_KINDS) {
      const label = OPENING_PROFILE_LABELS[kind];
      expect(resolveOpeningShapeRef(label)?.kind).toBe(kind);
    }
  });

  it('the names a refusal lists ARE the mode bar\'s labels', () => {
    expect(openingShapeNames('window')).toEqual(
      openingProfilesFor('window').map((k) => OPENING_PROFILE_LABELS[k]),
    );
    expect(openingShapeNames('door')).toEqual(
      openingProfilesFor('door').map((k) => OPENING_PROFILE_LABELS[k]),
    );
  });
});

describe('§E — ⛔ a door may not be circular, and it is refused BY NAME', () => {
  it('the rule is stated, not silently dropped', () => {
    const reason = openingShapeLegalFor('door', 'circular');
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/door/i);
    expect(reason).toMatch(/notch|floor/i);
    expect(reason).toMatch(/Nothing was changed/);
  });

  it('⛔ NON-VACUITY — the three legal door profiles are NOT refused', () => {
    expect(openingShapeLegalFor('door', 'rectangular')).toBeNull();
    expect(openingShapeLegalFor('door', 'round-arch')).toBeNull();
    expect(openingShapeLegalFor('door', 'segmental-arch')).toBeNull();
  });

  it('a window may be circular', () => {
    expect(openingShapeLegalFor('window', 'circular')).toBeNull();
  });

  it('⭐ the vocabulary still RESOLVES "circular" for a door — so the refusal can name it', () => {
    expect(resolveOpeningShapeRef('circular')?.kind).toBe('circular');
  });
});

describe('§F — the compass axis', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['south', 'S'], ['south facade', 'S'], ['south-facing', 'S'],
    ['southern elevation', 'S'], ['the south side', 'S'], ['s facade', 'S'],
    ['north', 'N'], ['northern face', 'N'], ['north facing walls', 'N'],
    ['east', 'E'], ['eastern aspect', 'E'],
    ['west', 'W'], ['westerly frontage', 'W'],
    ['south façade', 'S'],
  ];
  for (const [text, letter] of cases) {
    it(`"${text}" → ${letter}`, () => expect(resolveCompassRef(text)).toBe(letter));
  }

  it('⛔ a phrase with a word this axis does not know is NOT an orientation', () => {
    expect(resolveCompassRef('south wing kitchen')).toBeNull();
    expect(resolveCompassRef('kitchen')).toBeNull();
    expect(resolveCompassRef('00-001')).toBeNull();
  });

  it('⛔ a phrase arguing two directions resolves to NULL', () => {
    expect(resolveCompassRef('north south corridor')).toBeNull();
    expect(resolveCompassRef('north south')).toBeNull();
  });

  it('every compass word resolves', () => {
    for (const w of compassWords()) expect(resolveCompassRef(w)).not.toBeNull();
  });
});

// ── §G — THE AXIS REGISTRY, which is the actual fix ─────────────────────────

const CTX = {
  selection: [],
  levels: [{ id: 'l0', name: 'Level 0', elevation: 0 }],
  rooms: [{ id: 'r1', name: 'Room 00-001', roomNumber: '00-001' }],
  mintId: () => 'x',
} as never;

describe('§G — an unmatched qualifier is tried against EVERY axis', () => {
  it('⭐⭐ "segmental type" fails the TYPE axis and is claimed by the SHAPE axis', () => {
    const hits = probeQualifierAxes('segmental type', 'window', CTX, ['type']);
    expect(hits.map((h) => h.axis)).toContain('shape');
    expect(hits.find((h) => h.axis === 'shape')!.value).toBe('Segmental');
  });

  it('⭐⭐ "south" fails the ROOM axis and is claimed by the ORIENTATION axis', () => {
    const hits = probeQualifierAxes('south', 'window', CTX, ['room']);
    expect(hits.map((h) => h.axis)).toContain('orientation');
  });

  it('the redirect carries a sentence that WOULD work', () => {
    const hits = probeQualifierAxes('segmental', 'window', CTX, ['type']);
    expect(hits[0]!.sayIt('window')).toBe('change all windows to segmental');
  });

  it('⛔ the SHAPE axis is not offered for an element kind that has no openings', () => {
    expect(probeQualifierAxes('segmental', 'wall', CTX, ['type']).map((h) => h.axis))
      .not.toContain('shape');
  });

  it('a room the project really claims is found on the ROOM axis', () => {
    const hits = probeQualifierAxes('00-001', 'window', CTX, ['type']);
    expect(hits.map((h) => h.axis)).toContain('room');
  });
});

describe('§H — the refusal names what it searched', () => {
  it('⭐ a redirect replaces the false denial', () => {
    const { tail, redirects } = unmatchedQualifierTail('segmental type', 'window', CTX, {
      searchedAxis: 'type',
      searchedNoun: 'window type',
    });
    expect(redirects.length).toBeGreaterThan(0);
    expect(tail).toMatch(/IS a/);
    expect(tail).toMatch(/Segmental/);
    expect(tail).toMatch(/change all windows to segmental/);
  });

  it('⭐ with NO axis claiming, the refusal still states which axes were searched', () => {
    const { tail, redirects } = unmatchedQualifierTail('flurble', 'window', CTX, {
      searchedAxis: 'type',
      searchedNoun: 'window type',
    });
    expect(redirects).toHaveLength(0);
    expect(tail).toMatch(/I searched/);
    expect(tail).toMatch(/opening shapes/);
    expect(tail).toMatch(/compass orientations/);
  });

  it('⛔ an axis whose data source is ABSENT is not claimed as searched', () => {
    const noRooms = { selection: [], levels: [], mintId: () => 'x' } as never;
    const searched = axesSearched('window', noRooms);
    expect(searched).not.toContain('rooms');
    expect(searched).not.toContain('levels');
    // The closed enums are always readable, so they ARE claimed.
    expect(searched).toContain('opening shapes');
  });

  it('every axis in the table has a distinct id — the registry is a set, not a list', () => {
    const ids = QUALIFIER_AXES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
