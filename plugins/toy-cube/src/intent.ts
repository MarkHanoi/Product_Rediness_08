// toy-cube intent — command ID constants (S02 / dev-only demo).
//
// Wave 12 recipe completion: toy-cube plugin intent.ts (previously missing).

export const CUBE_COMMANDS = {
  /** Move a cube to a new position (dx, dy, dz applied as offset). */
  MOVE: 'cube.move',
} as const;

export type CubeCommandId = typeof CUBE_COMMANDS[keyof typeof CUBE_COMMANDS];

export function isMoveCubePayload(v: unknown): v is { id: string; dx: number; dy: number; dz: number } {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p['id'] === 'string' && p['id'].length > 0 &&
    typeof p['dx'] === 'number' && Number.isFinite(p['dx']) &&
    typeof p['dy'] === 'number' && Number.isFinite(p['dy']) &&
    typeof p['dz'] === 'number' && Number.isFinite(p['dz'])
  );
}
