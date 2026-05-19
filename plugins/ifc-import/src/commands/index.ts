/**
 * Command surface for IFC proxies (Phase 3-B Sprint S57).
 *
 * Exit-criteria-relevant: `MoveIFCProxyCommand` per spec §3.1 lines 799-817.
 * The handler is exposed as a pure reducer so this plugin doesn't have to
 * import `@pryzm/command-bus` directly — the editor wires it into the bus
 * via `registerHandler({ kind: 'ifcProxy.move', handle: applyMoveProxy })`.
 */

import type {
  IFCProxyDTO,
  MoveIFCProxyCommand,
  MoveResult,
} from '../types.js';
import { withSpan } from '../otel.js';

export type { MoveIFCProxyCommand, MoveResult } from '../types.js';

/**
 * Pure transform reducer. Returns a fresh proxy — never mutates input.
 *
 * Per spec lines 805-817 the implementation updates columns 12/13/14
 * (the translation column) of the column-major 4×4 matrix.
 */
export function applyMoveProxy(proxy: IFCProxyDTO, cmd: MoveIFCProxyCommand): MoveResult {
  if (cmd.kind !== 'ifcProxy.move') {
    throw new Error(`applyMoveProxy: expected ifcProxy.move, got ${cmd.kind}`);
  }
  if (proxy.id !== cmd.id) {
    throw new Error(`applyMoveProxy: proxy.id ${proxy.id} !== cmd.id ${cmd.id}`);
  }
  const next = new Float32Array(proxy.transform);
  // 4×4 affine matrix is 16 floats — indices 12/13/14 are guaranteed.
  next[12] = (next[12] ?? 0) + cmd.translate[0];
  next[13] = (next[13] ?? 0) + cmd.translate[1];
  next[14] = (next[14] ?? 0) + cmd.translate[2];
  return { transform: next };
}

/**
 * OTel-wrapped variant — emits the `pryzm.ifc.tier2-move` span required by
 * S57 exit criterion (line 1048). Identical semantics to `applyMoveProxy`
 * but with telemetry attached. Async to fit the OTel span pattern.
 */
export async function applyMoveProxyTraced(
  proxy: IFCProxyDTO,
  cmd: MoveIFCProxyCommand,
): Promise<MoveResult> {
  return withSpan(
    'pryzm.ifc.tier2-move',
    {
      'pryzm.ifc.proxy_id': proxy.id,
      'pryzm.ifc.global_id': proxy.globalId,
      'pryzm.ifc.type_name': proxy.ifcTypeName,
      'pryzm.ifc.translate_x': cmd.translate[0],
      'pryzm.ifc.translate_y': cmd.translate[1],
      'pryzm.ifc.translate_z': cmd.translate[2],
    },
    () => applyMoveProxy(proxy, cmd),
  );
}
