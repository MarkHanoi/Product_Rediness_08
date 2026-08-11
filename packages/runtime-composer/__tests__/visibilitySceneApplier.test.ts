// PROBE — the projection half of visibility intent (W3-2, P7 / C01 §1 P7).
//
// WHAT THIS REFUSES TO ACCEPT AS EVIDENCE
// ─────────────────────────────────────────────────────────────────────────────
// Not "the store recorded a hide" — the store already had tests for that, and it
// had them while the entire subsystem was dead. The claim this file makes is the
// one the old `SpatialTree` eye-toggle could not make: after the user hides an
// element, the SCENE NODE the renderer draws is `visible === false`, AND the
// reason it is false is a record that outlives the DOM button that produced it.
//
// The old path wrote `obj.visible = false` and kept the fact in a `let visible`
// inside a click handler. That value cannot be read, serialised or replayed, so
// no test could ever assert on it — which is precisely how the defect survived.
// Here, the scene node's state is DERIVED from the store, so a reload probe is
// expressible for the first time.

import { describe, expect, it } from 'vitest';

import { createViewVisibilityIntentStore } from '@pryzm/visibility';
import {
  applyVisibilityIntentToScene,
  type VisibilitySceneNode,
} from '../src/visibilitySceneApplier.js';

const VIEW = 'view:level-0-plan';

/** A minimal Object3D-shaped tree: `traverse` visits self then descendants,
 *  exactly as THREE does. No THREE import (P2). */
function node(id: string | null, children: SceneNode[] = []): SceneNode {
  return new SceneNode(id, children);
}

class SceneNode implements VisibilitySceneNode {
  visible = true;
  readonly userData: Record<string, unknown>;
  constructor(id: string | null, readonly children: SceneNode[] = []) {
    this.userData = id === null ? {} : { id };
  }
  traverse(cb: (n: VisibilitySceneNode) => void): void {
    cb(this);
    for (const c of this.children) c.traverse(cb);
  }
}

function fixture() {
  const wall1 = node('wall-1');
  const wall2 = node('wall-2');
  const door1 = node('door-1');
  // A group with no id — instanced aggregates look like this, and the applier
  // must skip them rather than throw or hide them by accident.
  const root = node(null, [wall1, wall2, door1]);
  return { root, wall1, wall2, door1 };
}

const ALL = ['wall-1', 'wall-2', 'door-1'];

describe('applyVisibilityIntentToScene — intent becomes scene state (W3-2, P7)', () => {
  it('THE PROBE — a hide recorded in the store makes the SCENE NODE invisible', () => {
    const store = createViewVisibilityIntentStore();
    const { root, wall1, wall2, door1 } = fixture();

    // BEFORE — genuinely visible, or a later `false` proves nothing.
    expect(wall1.visible).toBe(true);

    store.hide(VIEW, ['wall-1']);
    const res = applyVisibilityIntentToScene(store, root, VIEW, ALL);

    expect(wall1.visible).toBe(false);
    // …and only what was asked for.
    expect(wall2.visible).toBe(true);
    expect(door1.visible).toBe(true);
    expect(res).toEqual({ matched: 3, hidden: 1 });
  });

  it('a hide SURVIVES serialize → new store → deserialize → re-project (save/load)', () => {
    const store = createViewVisibilityIntentStore();
    store.hide(VIEW, ['wall-1']);

    // Round-trip through JSON, as a saved document would.
    const reloaded = createViewVisibilityIntentStore();
    reloaded.deserialize(JSON.parse(JSON.stringify(store.serialize())));

    // A FRESH scene, as a reload would build. Nothing carried over but the wire.
    const { root, wall1, wall2 } = fixture();
    expect(wall1.visible).toBe(true);

    applyVisibilityIntentToScene(reloaded, root, VIEW, ALL);

    expect(wall1.visible).toBe(false);
    expect(wall2.visible).toBe(true);
  });

  it('unhide re-shows the node — the projection is a function of state, not a toggle', () => {
    const store = createViewVisibilityIntentStore();
    const { root, wall1 } = fixture();

    store.hide(VIEW, ['wall-1']);
    applyVisibilityIntentToScene(store, root, VIEW, ALL);
    expect(wall1.visible).toBe(false);

    store.unhide(VIEW, ['wall-1']);
    applyVisibilityIntentToScene(store, root, VIEW, ALL);
    expect(wall1.visible).toBe(true);
  });

  it('an active isolation hides the nodes outside it (wave-8)', () => {
    const store = createViewVisibilityIntentStore();
    const { root, wall1, wall2, door1 } = fixture();

    store.isolate(VIEW, ['door-1']);
    applyVisibilityIntentToScene(store, root, VIEW, ALL);

    expect(door1.visible).toBe(true);
    expect(wall1.visible).toBe(false);
    expect(wall2.visible).toBe(false);
  });

  it('an explicit hide BEATS an isolation that would have shown the element', () => {
    const store = createViewVisibilityIntentStore();
    const { root, door1 } = fixture();

    store.hide(VIEW, ['door-1']);
    store.isolate(VIEW, ['door-1']);
    applyVisibilityIntentToScene(store, root, VIEW, ALL);

    expect(door1.visible).toBe(false);
  });

  it('intent is PER-VIEW — projecting another view leaves the node alone', () => {
    const store = createViewVisibilityIntentStore();
    const { root, wall1 } = fixture();

    store.hide(VIEW, ['wall-1']);
    applyVisibilityIntentToScene(store, root, 'view:section-A', ALL);

    expect(wall1.visible).toBe(true);
  });

  it('touches ONLY the ids it was given — it cannot stomp another system', () => {
    const store = createViewVisibilityIntentStore();
    const { root, wall1, wall2 } = fixture();

    // Some other subsystem (level scoping, a section box) hid wall-2.
    wall2.visible = false;
    store.hide(VIEW, ['wall-1']);

    applyVisibilityIntentToScene(store, root, VIEW, ['wall-1']);

    expect(wall1.visible).toBe(false);
    // wall-2 was not named, so it was not reasserted back to visible.
    expect(wall2.visible).toBe(false);
  });

  it('reports matched:0 when the ids name nothing — not the same as "hid nothing"', () => {
    const store = createViewVisibilityIntentStore();
    const { root } = fixture();

    store.hide(VIEW, ['ghost-1']);
    expect(applyVisibilityIntentToScene(store, root, VIEW, ['ghost-1']))
      .toEqual({ matched: 0, hidden: 0 });
    // vs. matched-but-nothing-hidden, which is a DIFFERENT outcome
    expect(applyVisibilityIntentToScene(store, root, VIEW, ['wall-1']))
      .toEqual({ matched: 1, hidden: 0 });
  });

  it('no active view is a no-op — it does not guess a view to write onto', () => {
    const store = createViewVisibilityIntentStore();
    const { root, wall1 } = fixture();
    store.hide(VIEW, ['wall-1']);

    expect(applyVisibilityIntentToScene(store, root, null, ALL))
      .toEqual({ matched: 0, hidden: 0 });
    expect(wall1.visible).toBe(true);
  });

  it('a null/traverse-less root is a no-op, not a throw', () => {
    const store = createViewVisibilityIntentStore();
    expect(applyVisibilityIntentToScene(store, null, VIEW, ALL)).toEqual({ matched: 0, hidden: 0 });
    expect(applyVisibilityIntentToScene(store, {} as VisibilitySceneNode, VIEW, ALL))
      .toEqual({ matched: 0, hidden: 0 });
  });
});
