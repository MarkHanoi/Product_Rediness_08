// AI tool registry (S54).
//
// Declares the verbs the AI is allowed to invoke on the family editor's
// command bus, with a hand-rolled payload validator per verb.  The
// validator is intentionally tiny (no Zod) so the AI bridge stays
// well under the §13 bundle budget — every byte counts because the
// bridge is on the first-paint path of the AI panel.
//
// Verb coverage matches the 12 commands registered in S52–S53:
//   • constraint.* — addCoincident / addDistance / addFixed
//                    addParallel / addPerpendicular
//   • referencePlane.* — add / update / reorient / remove
//   • solid.* — add / remove / setLodBitmask
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.

import type {
  AiTool,
  AiToolRegistry,
  ToolValidationResult,
  ToolValidator,
} from './types.js';

const PASS: ToolValidationResult = { ok: true };

function fail(...errors: string[]): ToolValidationResult {
  return { ok: false, errors: Object.freeze(errors.slice()) as ReadonlyArray<string> };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isVec3(v: unknown): v is { x: number; y: number; z: number } {
  return isObject(v) && isFiniteNum(v.x) && isFiniteNum(v.y) && isFiniteNum(v.z);
}

function isLodBitmask(v: unknown): v is { coarse: boolean; medium: boolean; fine: boolean } {
  return (
    isObject(v) &&
    typeof v.coarse === 'boolean' &&
    typeof v.medium === 'boolean' &&
    typeof v.fine === 'boolean'
  );
}

function requireKeys(args: unknown, keys: string[]): { errs: string[]; obj?: Record<string, unknown> } {
  if (!isObject(args)) return { errs: ['args must be an object'] };
  const errs: string[] = [];
  for (const k of keys) {
    if (!(k in args)) errs.push(`missing field "${k}"`);
  }
  return { errs, obj: args };
}

function pairValidator(field1: string, field2: string): ToolValidator {
  return (args) => {
    const { errs, obj } = requireKeys(args, [field1, field2]);
    if (!obj) return fail(...errs);
    if (!isNonEmptyString(obj[field1])) errs.push(`"${field1}" must be a non-empty string`);
    if (!isNonEmptyString(obj[field2])) errs.push(`"${field2}" must be a non-empty string`);
    if (errs.length === 0 && obj[field1] === obj[field2]) {
      errs.push(`"${field1}" and "${field2}" must differ`);
    }
    return errs.length === 0 ? PASS : fail(...errs);
  };
}

const validateAddDistance: ToolValidator = (args) => {
  const { errs, obj } = requireKeys(args, ['p1', 'p2', 'value']);
  if (!obj) return fail(...errs);
  if (!isNonEmptyString(obj.p1)) errs.push('"p1" must be a non-empty string');
  if (!isNonEmptyString(obj.p2)) errs.push('"p2" must be a non-empty string');
  if (errs.length === 0 && obj.p1 === obj.p2) errs.push('"p1" and "p2" must differ');
  if (typeof obj.value === 'number') {
    if (!Number.isFinite(obj.value) || obj.value < 0) {
      errs.push('"value" must be a non-negative finite number');
    }
  } else if (!isNonEmptyString(obj.value)) {
    errs.push('"value" must be a number or a non-empty parameter name');
  }
  return errs.length === 0 ? PASS : fail(...errs);
};

const validateAddFixed: ToolValidator = (args) => {
  const { errs, obj } = requireKeys(args, ['p', 'x', 'y']);
  if (!obj) return fail(...errs);
  if (!isNonEmptyString(obj.p)) errs.push('"p" must be a non-empty string');
  if (!isFiniteNum(obj.x)) errs.push('"x" must be a finite number');
  if (!isFiniteNum(obj.y)) errs.push('"y" must be a finite number');
  return errs.length === 0 ? PASS : fail(...errs);
};

const validateAddRefPlane: ToolValidator = (args) => {
  const { errs, obj } = requireKeys(args, ['name', 'origin', 'normal']);
  if (!obj) return fail(...errs);
  if (!isNonEmptyString(obj.name)) errs.push('"name" must be a non-empty string');
  if (!isVec3(obj.origin)) errs.push('"origin" must be a Vec3 of finite numbers');
  if (!isVec3(obj.normal)) errs.push('"normal" must be a Vec3 of finite numbers');
  return errs.length === 0 ? PASS : fail(...errs);
};

const validateUpdateRefPlane: ToolValidator = (args) => {
  const { errs, obj } = requireKeys(args, ['id', 'patch']);
  if (!obj) return fail(...errs);
  if (!isNonEmptyString(obj.id)) errs.push('"id" must be a non-empty string');
  if (!isObject(obj.patch)) errs.push('"patch" must be an object');
  else {
    const p = obj.patch;
    if ('name' in p && !isNonEmptyString(p.name)) errs.push('"patch.name" must be non-empty');
    if ('origin' in p && !isVec3(p.origin)) errs.push('"patch.origin" must be a Vec3');
    if ('normal' in p && !isVec3(p.normal)) errs.push('"patch.normal" must be a Vec3');
  }
  return errs.length === 0 ? PASS : fail(...errs);
};

const validateReorientRefPlane: ToolValidator = (args) => {
  const { errs, obj } = requireKeys(args, ['id', 'origin', 'normal']);
  if (!obj) return fail(...errs);
  if (!isNonEmptyString(obj.id)) errs.push('"id" must be a non-empty string');
  if (!isVec3(obj.origin)) errs.push('"origin" must be a Vec3');
  if (!isVec3(obj.normal)) errs.push('"normal" must be a Vec3');
  return errs.length === 0 ? PASS : fail(...errs);
};

const validateRemoveById: ToolValidator = (args) => {
  const { errs, obj } = requireKeys(args, ['id']);
  if (!obj) return fail(...errs);
  if (!isNonEmptyString(obj.id)) errs.push('"id" must be a non-empty string');
  return errs.length === 0 ? PASS : fail(...errs);
};

const SOLID_KINDS: ReadonlySet<string> = new Set([
  'extrude', 'sweep', 'revolve', 'loft', 'boolean',
]);

const validateAddSolid: ToolValidator = (args) => {
  const { errs, obj } = requireKeys(args, ['name', 'kind']);
  if (!obj) return fail(...errs);
  if (!isNonEmptyString(obj.name)) errs.push('"name" must be a non-empty string');
  if (typeof obj.kind !== 'string' || !SOLID_KINDS.has(obj.kind)) {
    errs.push(`"kind" must be one of: ${[...SOLID_KINDS].join(', ')}`);
  }
  if ('lod' in obj && !isLodBitmask(obj.lod)) {
    errs.push('"lod" must be a LodBitmask {coarse,medium,fine: boolean}');
  }
  if ('materialSlot' in obj && obj.materialSlot !== null && !isNonEmptyString(obj.materialSlot)) {
    errs.push('"materialSlot" must be null or a non-empty string');
  }
  return errs.length === 0 ? PASS : fail(...errs);
};

const validateSetLod: ToolValidator = (args) => {
  const { errs, obj } = requireKeys(args, ['id', 'lod']);
  if (!obj) return fail(...errs);
  if (!isNonEmptyString(obj.id)) errs.push('"id" must be a non-empty string');
  if (!isLodBitmask(obj.lod)) errs.push('"lod" must be a LodBitmask {coarse,medium,fine: boolean}');
  return errs.length === 0 ? PASS : fail(...errs);
};

const TOOLS: ReadonlyArray<AiTool> = Object.freeze([
  { verb: 'constraint.addCoincident',    category: 'constraint',    description: 'Pin two sketch points to share a position.', validate: pairValidator('p1', 'p2') },
  { verb: 'constraint.addDistance',      category: 'constraint',    description: 'Fix the distance between two sketch points.', validate: validateAddDistance },
  { verb: 'constraint.addFixed',         category: 'constraint',    description: 'Pin a sketch point to absolute coordinates.', validate: validateAddFixed },
  { verb: 'constraint.addParallel',      category: 'constraint',    description: 'Make two sketch lines parallel.',            validate: pairValidator('l1', 'l2') },
  { verb: 'constraint.addPerpendicular', category: 'constraint',    description: 'Make two sketch lines perpendicular.',       validate: pairValidator('l1', 'l2') },
  { verb: 'referencePlane.add',          category: 'referencePlane', description: 'Add a named reference plane.',              validate: validateAddRefPlane },
  { verb: 'referencePlane.update',       category: 'referencePlane', description: 'Patch any subset of {name, origin, normal}.', validate: validateUpdateRefPlane },
  { verb: 'referencePlane.reorient',     category: 'referencePlane', description: 'Atomic origin + normal change.',            validate: validateReorientRefPlane },
  { verb: 'referencePlane.remove',       category: 'referencePlane', description: 'Delete a reference plane.',                 validate: validateRemoveById },
  { verb: 'solid.add',                   category: 'solid',          description: 'Add a new solid with default LOD bitmask.', validate: validateAddSolid },
  { verb: 'solid.remove',                category: 'solid',          description: 'Delete a solid.',                            validate: validateRemoveById },
  { verb: 'solid.setLodBitmask',         category: 'solid',          description: 'Change the §12.2 LOD bitmask.',             validate: validateSetLod },
] satisfies ReadonlyArray<AiTool>);

export const ALL_AI_TOOL_VERBS: ReadonlyArray<string> = Object.freeze(TOOLS.map((t) => t.verb));

export function createAiToolRegistry(extra: ReadonlyArray<AiTool> = []): AiToolRegistry {
  const byVerb: Map<string, AiTool> = new Map();
  for (const t of TOOLS) byVerb.set(t.verb, t);
  for (const t of extra) {
    if (byVerb.has(t.verb)) {
      throw new Error(`createAiToolRegistry: verb "${t.verb}" already registered.`);
    }
    byVerb.set(t.verb, t);
  }
  const frozenList = Object.freeze([...byVerb.values()]);
  return {
    list: () => frozenList,
    has: (verb) => byVerb.has(verb),
    get: (verb) => byVerb.get(verb),
    validate(verb, args) {
      const t = byVerb.get(verb);
      if (!t) return { ok: false, errors: Object.freeze([`unknown verb "${verb}"`]) };
      return t.validate(args);
    },
  };
}
