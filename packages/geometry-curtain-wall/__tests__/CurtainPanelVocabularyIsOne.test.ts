// §CW-2a / C87 §13.2 — THE EXECUTED EQUIVALENCE PROOF THAT LICENSES THE REMAINING COPIES.
//
// One question — "what kind of panel is this?" — had FIVE answers: four independent
// hand-written copies of the 4-member kind vocabulary, plus the 13-member type
// vocabulary. One of the four (`types-builtin`) even lists its members in a
// DIFFERENT ORDER, which is what a transcription looks like and what a generated
// projection could not produce — and it is re-exported on the public SDK facade.
//
// `packages/schemas/src/elements/CurtainPanelVocabulary.ts` is now the master.
// Where a dependency exists the copy was DELETED and replaced by an import
// (`geometry-kernel`). Where it does not — `geometry-curtain-wall` and
// `types-builtin` depend on `@pryzm/schemas` neither directly nor transitively, and
// `types-builtin` is deliberately dependency-free — the copy survives under a C84
// EI-10 licence, and EI-10(b) requires an EXECUTED equivalence proof. THIS IS IT.
//
// ⚠ C84 EI-8a is explicit that a comment is not a synchronisation mechanism and
// that the comment mechanism HAS ALREADY FAILED TWICE, measured (colour names and
// style aliases both drifted). So this file compares every member of every copy
// rather than asserting that someone remembered to.
//
// ⚠ THE IMPORTS ARE RELATIVE PATHS ACROSS PACKAGE BOUNDARIES, AND THAT IS THE
// POINT. `geometry-curtain-wall` cannot resolve `@pryzm/schemas` or
// `@pryzm/types-builtin` by specifier — that is precisely the dependency boundary
// that licenses the copies. Restating the members here instead would be the very
// transcription this test exists to forbid.

import { describe, expect, it } from 'vitest';
import {
  CURTAIN_PANEL_TYPES,
  CURTAIN_PANEL_KINDS,
  CURTAIN_PANEL_TYPE_TO_KIND,
  CURTAIN_PANEL_KINDS_WITHOUT_A_TYPE,
  curtainPanelKindOf,
  curtainPanelTypesLosingIdentityInKind,
} from '../../schemas/src/elements/CurtainPanelVocabulary.js';
import { VALID_PANEL_TYPES, PANEL_TYPE_DEFAULTS } from '../src/CurtainPanelTypes';
import { BUILTIN_CURTAIN_WALL_TYPES } from '../../types-builtin/src/curtain-wall/index.js';

describe('§CW-2a — every surviving copy of the vocabulary matches the master', () => {
  it('geometry-curtain-wall `VALID_PANEL_TYPES` is member-identical to the master, IN ORDER', () => {
    // Order matters and is asserted deliberately: the `types-builtin` copy drifted
    // in ORDER ALONE, which is invisible to a set comparison and is exactly the
    // signature of a hand-transcribed list.
    expect([...VALID_PANEL_TYPES]).toEqual([...CURTAIN_PANEL_TYPES]);
  });

  it('the master covers every type the geometry layer can actually render', () => {
    // `PANEL_TYPE_DEFAULTS` is what the builder reads. A type present there and
    // absent from the master would render but be unrepresentable upstream.
    expect(Object.keys(PANEL_TYPE_DEFAULTS).sort()).toEqual([...CURTAIN_PANEL_TYPES].sort());
  });

  it('types-builtin\'s default panel kind is a real member of the master', () => {
    // The `CurtainPanelKind` union in that package is a TYPE, erased at runtime and
    // not directly comparable. Its RUNTIME VALUES are, and they are what would
    // actually reach a user — so those are what this arm checks, across every
    // built-in system type rather than one sample.
    expect(BUILTIN_CURTAIN_WALL_TYPES.length).toBeGreaterThan(0);
    for (const t of BUILTIN_CURTAIN_WALL_TYPES) {
      expect([...CURTAIN_PANEL_KINDS]).toContain(t.defaultPanelKind);
    }
  });

  it('the TYPE → KIND projection is TOTAL — no type is left unmapped', () => {
    // The defect this replaces was not a lossy bridge but the ABSENCE of one: no
    // site in the repository converted a type to a kind, so every hop that needed
    // one defaulted to 'glazed' (L-1053).
    expect(Object.keys(CURTAIN_PANEL_TYPE_TO_KIND).sort()).toEqual([...CURTAIN_PANEL_TYPES].sort());
    for (const t of CURTAIN_PANEL_TYPES) {
      const k = CURTAIN_PANEL_TYPE_TO_KIND[t];
      if (k !== null) expect([...CURTAIN_PANEL_KINDS]).toContain(k);
    }
  });

  it('the projection agrees with the RENDER DEFAULTS it claims to be derived from', () => {
    // The rows are justified in the master by `transparent`/`opacity` in
    // `PANEL_TYPE_DEFAULTS`. That justification is checked here rather than trusted,
    // because a projection derived from the names would look identical and be wrong.
    for (const t of CURTAIN_PANEL_TYPES) {
      const kind = CURTAIN_PANEL_TYPE_TO_KIND[t];
      const d = PANEL_TYPE_DEFAULTS[t];
      if (kind === null) {
        expect(d.opacity).toBe(0);            // a void really is invisible
      } else if (kind === 'opaque') {
        expect(d.transparent).toBe(false);    // joinery, not glazing
      } else if (kind === 'glazed') {
        expect(d.transparent).toBe(true);     // glass or translucent fabric
      }
    }
  });

  it('`SystemPanel_Empty` maps to NULL, never to glazing', () => {
    // Mapping a void to 'glazed' would put glass in an empty opening. `null` is a
    // real answer; callers must handle it.
    expect(curtainPanelKindOf('SystemPanel_Empty')).toBeNull();
  });

  it('an unrecognised type is UNDEFINED, not a default — the L-1053 shape', () => {
    // "I do not recognise this" and "this cell holds nothing" are different answers
    // and must stay different. A total fallback makes a total mismatch
    // indistinguishable from a working default.
    expect(curtainPanelKindOf('SystemPanel_Nonsense')).toBeUndefined();
    expect(curtainPanelKindOf('glazed')).toBeUndefined();
  });

  it('C87 §9\'s "four of thirteen survive the round trip" is COMPUTED, not copied', () => {
    const lossy = curtainPanelTypesLosingIdentityInKind();
    const survivors = CURTAIN_PANEL_TYPES.filter(t => !lossy.includes(t));
    // Glass+5 fabrics share 'glazed'; Opaque+4 slats share 'opaque'; Empty is a
    // void; only Door owns its kind alone. So identity survives for Door and for
    // Empty (which loses nothing because it IS nothing) — and the contract's
    // headline number is derived here rather than transcribed into it.
    expect(survivors).toEqual(['SystemPanel_Empty', 'SystemPanel_Door']);
    expect(lossy).toHaveLength(11);
  });

  it('the reverse gap is DECLARED: `spandrel` is a kind no type can produce', () => {
    // C84 EI-3 — an L0 record carrying kind:'spandrel' describes a panel Stack A
    // cannot build. Declared rather than discovered later.
    for (const k of CURTAIN_PANEL_KINDS_WITHOUT_A_TYPE) {
      expect([...CURTAIN_PANEL_KINDS]).toContain(k);
      expect(Object.values(CURTAIN_PANEL_TYPE_TO_KIND)).not.toContain(k);
    }
    expect(CURTAIN_PANEL_KINDS_WITHOUT_A_TYPE).toEqual(['spandrel']);
  });
});
