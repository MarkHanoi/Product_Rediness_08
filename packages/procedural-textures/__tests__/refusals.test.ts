// §PROCEDURAL-PATTERNS L-1801 — THE REFUSALS.
//
// ⭐ A generator that quietly accepts an unbuildable specification is worse than one
// that refuses: the texture still tiles (the torus always tiles), so nothing fails,
// and the floor is wrong in a way only a joiner notices. Herringbone by L × W blocks
// closes ONLY when L/W is a whole number — which is why parquet blocks are sold at
// 70×280, 70×350, 90×360 — and a basket-weave bundle is square by construction.
//
// ⚠ Every refusal quotes BOTH numbers, per the repo's rule for rule-gates: the
// message has to tell the reader which of the two they meant to change.

import { describe, expect, it } from 'vitest';
import { herringboneLayout } from '../src/layouts/herringbone.js';
import { basketWeaveLayout } from '../src/layouts/basketWeave.js';
import { chevronLayout } from '../src/layouts/chevron.js';
import { runningBondLayout } from '../src/layouts/runningBond.js';
import { hexagonLayout } from '../src/layouts/hexagon.js';
import { versaillesLayout } from '../src/layouts/versailles.js';

describe('herringbone refuses a ratio that cannot be laid', () => {
  it('rejects a non-integer length ratio and says why', () => {
    expect(() => herringboneLayout({ staveWidthMm: 70, lengthRatio: 4.3, jointMm: 0.3 })).toThrow(
      /whole number/,
    );
  });

  it('rejects a ratio below 2 — a square block is not a herringbone', () => {
    expect(() => herringboneLayout({ staveWidthMm: 70, lengthRatio: 1, jointMm: 0.3 })).toThrow();
  });

  it('rejects a stated length that contradicts width x ratio, quoting BOTH numbers', () => {
    let message = '';
    try {
      herringboneLayout({ staveWidthMm: 70, lengthRatio: 5, jointMm: 0.3, staveLengthMm: 300 });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('300');
    expect(message).toContain('350');
  });

  it('accepts the real commercial block sizes', () => {
    expect(() => herringboneLayout({ staveWidthMm: 70, lengthRatio: 5, jointMm: 0.3, staveLengthMm: 350 })).not.toThrow();
    expect(() => herringboneLayout({ staveWidthMm: 90, lengthRatio: 4, jointMm: 0.3, staveLengthMm: 360 })).not.toThrow();
  });

  it('rejects a joint wider than the stave', () => {
    expect(() => herringboneLayout({ staveWidthMm: 70, lengthRatio: 5, jointMm: 40 })).toThrow();
  });
});

describe('basket weave refuses a bundle that is not square', () => {
  it('quotes the derived side against the stated length', () => {
    let message = '';
    try {
      basketWeaveLayout({ staveWidthMm: 70, staveCount: 3, jointMm: 0.3, staveLengthMm: 300 });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('300');
    expect(message).toContain('210');
  });

  it('rejects a single-stave bundle', () => {
    expect(() => basketWeaveLayout({ staveWidthMm: 70, staveCount: 1, jointMm: 0 })).toThrow();
  });
});

describe('the other layouts refuse impossible geometry too', () => {
  it('chevron refuses a feather-edge mitre', () => {
    expect(() => chevronLayout({ staveWidthMm: 90, staveLengthMm: 600, angleDeg: 2, jointMm: 0 })).toThrow();
    expect(() => chevronLayout({ staveWidthMm: 90, staveLengthMm: 600, angleDeg: 89, jointMm: 0 })).toThrow();
  });

  it('running bond refuses a joint that does not fit the module', () => {
    expect(() => runningBondLayout({ lengthMm: 200, widthMm: 100, jointMm: 60, offsetNum: 1, offsetDen: 2, repeatX: 1, repeatY: 1 })).toThrow();
  });

  it('hexagon refuses grout that swallows the tile', () => {
    expect(() => hexagonLayout({ acrossFlatsMm: 100, groutMm: 60 })).toThrow();
  });

  it('versailles refuses a frame with no opening left', () => {
    expect(() => versaillesLayout({ panelSizeMm: 900, frameWidthMm: 500, staveWidthMm: 60, lengthRatio: 4, jointMm: 0.5 })).toThrow();
  });
});
