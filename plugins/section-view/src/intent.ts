// Section-view intent — command IDs and pure predicates (W-09 recipe).
//
// Wave 12 recipe completion: section-view plugin intent.ts (previously missing).

export const SECTION_COMMANDS = {
  CREATE: 'section.create',
  DELETE: 'section.delete',
  MOVE_LINE: 'section.moveLine',
  SET_DEPTH: 'section.setDepth',
  SET_MARK: 'section.setMark',
  SET_SCALE: 'section.setScale',
} as const;

export type SectionCommandId = typeof SECTION_COMMANDS[keyof typeof SECTION_COMMANDS];

export interface Vec2Like { readonly x: number; readonly y: number }

export function isFiniteVec2(p: Vec2Like | undefined | null): p is Vec2Like {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function isSectionLine(v: unknown): v is { a: Vec2Like; b: Vec2Like; lookDepth: number } {
  if (typeof v !== 'object' || v === null) return false;
  const line = v as { a: unknown; b: unknown; lookDepth: unknown };
  return (
    isFiniteVec2(line.a as Vec2Like) &&
    isFiniteVec2(line.b as Vec2Like) &&
    typeof line.lookDepth === 'number' &&
    Number.isFinite(line.lookDepth) &&
    line.lookDepth > 0
  );
}

export function isSectionMark(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 32;
}

export function isSectionScale(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}
