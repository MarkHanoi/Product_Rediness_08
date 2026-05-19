// Wall-system typed error hierarchy (S07-T2 — mirrors `src/elements/walls/errors.ts`).
//
// One base class so callers can `instanceof WallSystemError` test the
// entire family.  Each subclass owns a stable `name` for log filtering.
// We DO NOT dispatch a DOM CustomEvent from the constructor (PRYZM 1
// did, but the new error layer is DOM-free per ADR-002 §3 — the L7
// presentation layer subscribes to the bus's emit channel instead).

export class WallSystemError extends Error {
  constructor(message: string, name: string = 'WallSystemError') {
    super(message);
    this.name = name;
  }
}

/** The targeted wall id is absent from the wall store. */
export class WallNotFoundError extends WallSystemError {
  public readonly wallId: string;
  constructor(wallId: string) {
    super(`Wall not found: ${wallId}`, 'WallNotFoundError');
    this.wallId = wallId;
  }
}

/** Wall input failed Zod validation.  Wraps the underlying ZodError so
 *  callers can both display a friendly message and inspect the
 *  structured issues if needed. */
export class WallSchemaError extends WallSystemError {
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message, 'WallSchemaError');
    this.cause = cause;
  }
}

/** Dimension input out of acceptable bounds (height ≤ 0, thickness ≤ 0,
 *  baseLine endpoints too close, etc.). */
export class WallDimensionsError extends WallSystemError {
  constructor(message: string) {
    super(message, 'WallDimensionsError');
  }
}

/** Wall references a `systemTypeId` that the WallSystemTypeStore does
 *  not know about. */
export class WallSystemTypeNotFoundError extends WallSystemError {
  public readonly systemTypeId: string;
  constructor(systemTypeId: string) {
    super(`Wall system-type not found: ${systemTypeId}`, 'WallSystemTypeNotFoundError');
    this.systemTypeId = systemTypeId;
  }
}

/** Predicate — recognises every wall-system error by base class. */
export function isWallSystemError(err: unknown): err is WallSystemError {
  return err instanceof WallSystemError;
}
