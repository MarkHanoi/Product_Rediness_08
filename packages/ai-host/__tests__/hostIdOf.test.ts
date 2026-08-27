// §RACORIENT145 — `hostIdOf` generalizes the host-reference field ACROSS hosted
// families instead of enumerating them.
//
// A window/door is hosted in a WALL (`wallId`); a curtain-wall PANEL is hosted
// in a CURTAIN WALL (`curtainWallId`) — a different store, a different id
// space, and the record spells the field differently. `resolveLevelScopeByHost`
// / `resolveOrientationScopeByHost` (HostedOpeningScope.ts) are otherwise 100%
// generic over "the id of whatever hosts this row", so the ONLY thing that
// needed generalising was which field a row's host id lives in — `hostIdOf` is
// that one DERIVATION, so a third hosted family (a future one) needs no edit
// here, only a row shaped like the others.
import { describe, expect, it } from 'vitest';
// Imported from the concrete module, NOT the package barrel — the barrel's
// module-load side effects touch `window` (see memory
// [[scc-no-barrel-access-at-module-load]]) and hang a plain-Node/vitest run
// with no DOM. This module (HostedOpeningScope.ts) is pure and has no such
// side effect, so importing it directly is safe here.
import {
  hostIdOf,
  resolveOrientationScopeByHost,
  resolveLevelScopeByHost,
} from '../src/intents/HostedOpeningScope.js';

describe('hostIdOf — derives the host id regardless of which field carries it', () => {
  it('a window/door row: reads wallId', () => {
    expect(hostIdOf({ wallId: 'wall-1' })).toBe('wall-1');
  });
  it('a curtain-wall panel row: reads curtainWallId', () => {
    expect(hostIdOf({ curtainWallId: 'cw-1' })).toBe('cw-1');
  });
  it('neither field present: undefined — absence of a fact, not a fact of absence', () => {
    expect(hostIdOf({})).toBeUndefined();
    expect(hostIdOf({ wallId: null, curtainWallId: null })).toBeUndefined();
    expect(hostIdOf({ wallId: '  ' })).toBeUndefined();
  });
  it('wallId wins when (irregularly) both are present — arbitrary but total', () => {
    expect(hostIdOf({ wallId: 'wall-1', curtainWallId: 'cw-1' })).toBe('wall-1');
  });
});

describe('resolveOrientationScopeByHost — curtain-wall panels ride the SAME hop as windows/doors', () => {
  it('a panel hosted in a west-facing curtain wall resolves; one in another orientation does not', () => {
    const rows = [
      { id: 'panel-1', wallId: hostIdOf({ curtainWallId: 'cw-west' }) },
      { id: 'panel-2', wallId: hostIdOf({ curtainWallId: 'cw-east' }) },
    ];
    const result = resolveOrientationScopeByHost(
      'curtain panel',
      rows,
      ['cw-west'],
      'west',
      (id) => id === 'cw-west' || id === 'cw-east',
    );
    expect(result.kind).toBe('resolved');
    if (result.kind !== 'resolved') return;
    expect(result.ids).toEqual(['panel-1']);
    expect(result.skipped).toEqual([]);
  });

  it('a panel whose host curtain wall no longer exists is SKIPPED BY NAME, never silently classified', () => {
    const rows = [{ id: 'panel-orphan', wallId: hostIdOf({ curtainWallId: 'cw-deleted' }) }];
    const result = resolveOrientationScopeByHost(
      'curtain panel',
      rows,
      ['cw-west'],
      'west',
      (id) => id === 'cw-west', // cw-deleted is NOT in the model
    );
    expect(result.kind).toBe('resolved');
    if (result.kind !== 'resolved') return;
    expect(result.ids).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.reason).toMatch(/host wall is no longer in the model/);
  });

  it('a panel with no host reference at all is SKIPPED as unplaceable, not classified', () => {
    const rows = [{ id: 'panel-headless' }];
    const result = resolveOrientationScopeByHost('curtain panel', rows, ['cw-west'], 'west', () => true);
    expect(result.kind).toBe('resolved');
    if (result.kind !== 'resolved') return;
    expect(result.ids).toEqual([]);
    expect(result.skipped[0]!.reason).toMatch(/no host wall is recorded/);
  });
});

describe('resolveLevelScopeByHost — curtain-wall panels also ride the level hop', () => {
  it('resolves a panel to its host curtain wall\'s level', () => {
    const rows = [{ id: 'panel-1', wallId: hostIdOf({ curtainWallId: 'cw-1' }) }];
    const result = resolveLevelScopeByHost(
      'curtain panel',
      rows,
      'L2',
      'Level 2',
      (id) => (id === 'cw-1' ? 'L2' : undefined),
    );
    expect(result.kind).toBe('resolved');
    if (result.kind !== 'resolved') return;
    expect(result.ids).toEqual(['panel-1']);
  });
});
