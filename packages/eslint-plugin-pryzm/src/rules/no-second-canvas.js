// pryzm/no-second-canvas
//
// SPRINT: Z.3 of PRYZM2-WIREUP-PLAN-S72 §26.1 — pre-flight verification harness.
//
// CONTRACT: only `packages/renderer/` may call
// `document.createElement('canvas')`. Every other surface that needs a
// canvas must obtain one through `runtime.scene.renderer.canvas` or the
// renderer's `createSurface()` API. This protects against the historical
// PRYZM 1 pattern of multiple canvases racing for WebGL contexts and the
// Phase D BatchCoordinator second-canvas bug.
//
// SCAFFOLD BEHAVIOUR (Z.3): WARN-mode in `src/` and `apps/` per §26.1; the
// rule reports `CallExpression` nodes whose callee is
// `document.createElement` and whose first arg is the literal string
// `'canvas'` (or `"canvas"`). Phase H.3 flips to ERROR after the floor
// number reaches zero.
//
// FALSE-NEGATIVES (acknowledged): dynamic tag names like
// `document.createElement(tagName)` are intentionally not flagged — the
// lint rule is the per-PR ratchet, not the gate. The §26.5 drilldown
// table catches dynamic cases by counting raw matches.

import path from 'node:path';

const RENDERER_FRAGMENT = path.join('packages', 'renderer');

function isInsideRenderer(filename) {
  if (!filename) return false;
  const norm = filename.split(path.sep).join('/');
  return norm.includes('packages/renderer/');
}

function isCanvasLiteral(arg) {
  return (
    arg &&
    arg.type === 'Literal' &&
    typeof arg.value === 'string' &&
    arg.value.toLowerCase() === 'canvas'
  );
}

function isDocumentCreateElement(node) {
  // node = CallExpression
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression') return false;
  const obj = callee.object;
  const prop = callee.property;
  if (!obj || !prop) return false;
  if (obj.type !== 'Identifier' || obj.name !== 'document') return false;
  if (prop.type !== 'Identifier' || prop.name !== 'createElement') return false;
  return true;
}

const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Block `document.createElement("canvas")` outside `packages/renderer/`. Only the L5 renderer may create the WebGL/WebGPU canvas; every other consumer obtains its surface from `runtime.scene.renderer`.',
      category: 'Architecture',
    },
    schema: [],
    messages: {
      forbidden:
        '`document.createElement("canvas")` is forbidden outside `packages/renderer/`. Use `runtime.scene.renderer` (or the renderer\'s typed `createSurface()` API). See ADR-008.',
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (isInsideRenderer(filename)) return {};

    return {
      CallExpression(node) {
        if (!isDocumentCreateElement(node)) return;
        if (!node.arguments || node.arguments.length === 0) return;
        if (!isCanvasLiteral(node.arguments[0])) return;
        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};

export default rule;
export { RENDERER_FRAGMENT };
