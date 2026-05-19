// View intent — command ID constants and predicates (S17 / ADR-0016).
//
// Wave 12 recipe completion: view plugin intent.ts (previously missing).

export const VIEW_COMMANDS = {
  CREATE: 'view.create',
  DELETE: 'view.delete',
  RENAME: 'view.rename',
  SWITCH: 'view.switch',
  UPDATE_CAMERA: 'view.updateCamera',
} as const;

export type ViewCommandId = typeof VIEW_COMMANDS[keyof typeof VIEW_COMMANDS];

export function isViewId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 128;
}

export function isViewName(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
}

export const VIEW_KINDS = ['3d', 'plan', 'section', 'sheet', 'elevation'] as const;
export type ViewKindLiteral = typeof VIEW_KINDS[number];

export function isViewKind(v: unknown): v is ViewKindLiteral {
  return typeof v === 'string' && (VIEW_KINDS as readonly string[]).includes(v);
}
