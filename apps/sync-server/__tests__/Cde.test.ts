// Spec source: PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md S22 exit
// criterion #5 (line 1076) — 3 CDE legacy commands folded into the
// new protocol with parity payload shapes.

import { describe, expect, it } from 'vitest';
import {
  CDE_COMMENT_BODY_MAX_BYTES,
  CDE_EVENT_TYPES,
  CDE_VALIDATORS,
  isCdeEventType,
  validateIssueComment,
  validateLinkDocument,
  validateMarkupCreate,
} from '../src/cde/index.js';

describe('CDE event-type registry', () => {
  it('registers all 3 spec-required commands', () => {
    expect(Object.keys(CDE_VALIDATORS)).toEqual([
      'cde.linkDocument',
      'cde.issueComment',
      'cde.markupCreate',
    ]);
  });

  it('isCdeEventType narrows correctly', () => {
    expect(isCdeEventType(CDE_EVENT_TYPES.linkDocument)).toBe(true);
    expect(isCdeEventType('wall.create')).toBe(false);
  });
});

describe('validateLinkDocument', () => {
  it('accepts a minimal valid payload', () => {
    expect(validateLinkDocument({ entityId: 'wall_x', documentUri: 'https://cde/doc/1' })).toBeNull();
  });

  it('accepts an optional label + attachedAt', () => {
    expect(
      validateLinkDocument({
        entityId: 'wall_x',
        documentUri: 'https://cde/doc/1',
        label: 'Spec sheet',
        attachedAt: '2026-04-27T10:00:00Z',
      }),
    ).toBeNull();
  });

  it.each([
    ['null payload', null],
    ['empty entityId', { entityId: '', documentUri: 'u' }],
    ['empty documentUri', { entityId: 'e', documentUri: '' }],
    ['missing documentUri', { entityId: 'e' }],
    ['non-string label', { entityId: 'e', documentUri: 'u', label: 5 }],
  ])('rejects %s', (_label, payload) => {
    expect(validateLinkDocument(payload)).not.toBeNull();
  });
});

describe('validateIssueComment', () => {
  it('accepts a minimal valid payload', () => {
    expect(validateIssueComment({ issueId: 'i1', commentId: 'c1', body: 'hi' })).toBeNull();
  });

  it('accepts a parentCommentId for replies', () => {
    expect(
      validateIssueComment({ issueId: 'i1', commentId: 'c2', body: 'reply', parentCommentId: 'c1' }),
    ).toBeNull();
  });

  it('rejects bodies above 16 KiB', () => {
    const big = 'x'.repeat(CDE_COMMENT_BODY_MAX_BYTES + 1);
    expect(validateIssueComment({ issueId: 'i', commentId: 'c', body: big })).toMatch(/max/);
  });

  it('rejects empty body', () => {
    expect(validateIssueComment({ issueId: 'i', commentId: 'c', body: '' })).not.toBeNull();
  });
});

describe('validateMarkupCreate', () => {
  it('accepts a circle markup', () => {
    expect(
      validateMarkupCreate({ markupId: 'm1', kind: 'circle', vertices: [0, 0, 0, 5] }),
    ).toBeNull();
  });

  it('accepts a polyline with a colour', () => {
    expect(
      validateMarkupCreate({
        markupId: 'm2',
        kind: 'polyline',
        vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0],
        colour: [0.1, 0.2, 0.3],
      }),
    ).toBeNull();
  });

  it('requires a label for text markups', () => {
    expect(validateMarkupCreate({ markupId: 'm3', kind: 'text', vertices: [0, 0, 0] })).toMatch(
      /label is required/,
    );
    expect(
      validateMarkupCreate({ markupId: 'm3', kind: 'text', vertices: [0, 0, 0], label: 'Note' }),
    ).toBeNull();
  });

  it('rejects non-finite vertex values', () => {
    expect(
      validateMarkupCreate({ markupId: 'm', kind: 'rect', vertices: [0, 0, 0, NaN, 1, 1] }),
    ).toMatch(/finite numbers/);
  });

  it('rejects unknown kind', () => {
    expect(validateMarkupCreate({ markupId: 'm', kind: 'spline', vertices: [0] })).toMatch(/kind/);
  });

  it('rejects out-of-range colour channels', () => {
    expect(
      validateMarkupCreate({ markupId: 'm', kind: 'rect', vertices: [0, 0, 0, 1, 1, 1], colour: [2, 0, 0] }),
    ).toMatch(/\[0,1\]/);
  });
});
