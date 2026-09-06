// sketchHud — the canvas HUD line and the fillet-radius prompt.
//
// Split out of `SketchCanvas.ts` under the §13 `family-editor-300-loc-cap`
// gate when the Spline tool landed: the canvas was at 298/300 and an eighth
// tool does not fit. These two functions were already pure leaf helpers with
// no closure state, so the split costs nothing and the cap keeps doing its job.
//
// No THREE, no rAF, no `(window as any)`.

import type { SnapHit } from './snap.js';
import type { ToolName, ToolPreview } from './tools/types.js';

export function promptRadius(): number {
  const raw = typeof prompt === 'function' ? prompt('Fillet radius (mm)', '10') : '10';
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid fillet radius.');
  return n;
}

export function paintHud(
  hud: HTMLElement,
  cursor: { x: number; z: number } | null,
  snap: SnapHit | null,
  preview: ToolPreview,
  tool: ToolName,
): void {
  const lines: string[] = [`Tool: ${tool}`];
  if (cursor) lines.push(`X: ${cursor.x.toFixed(1)}   Z: ${cursor.z.toFixed(1)} mm`);
  if (snap && snap.kind !== 'none') lines.push(`Snap: ${snap.kind}`);
  if (preview.hint) lines.push(preview.hint);
  hud.textContent = lines.join('\n');
}
