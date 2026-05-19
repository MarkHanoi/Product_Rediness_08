// Typed errors for the curtain-wall plugin (S12-T5; extended in S13).

export class CurtainWallSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'CurtainWallSystemError'; }
}
export class CurtainWallNotFoundError extends CurtainWallSystemError {
  constructor(public readonly curtainWallId: string) {
    super(`CurtainWall not found: ${curtainWallId}`);
    this.name = 'CurtainWallNotFoundError';
  }
}
export class CurtainWallSchemaError extends CurtainWallSystemError {
  constructor(public override readonly cause: unknown) {
    super(`CurtainWall schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'CurtainWallSchemaError';
  }
}
export class CurtainWallGeometryError extends CurtainWallSystemError {
  constructor(reason: string) {
    super(`Invalid curtain-wall geometry: ${reason}`);
    this.name = 'CurtainWallGeometryError';
  }
}
export class CurtainWallPanelNotFoundError extends CurtainWallSystemError {
  constructor(public readonly curtainWallId: string, public readonly panelId: string) {
    super(`Curtain-wall ${curtainWallId} has no panel ${panelId}`);
    this.name = 'CurtainWallPanelNotFoundError';
  }
}

// S13 additions —————————————————————————————————————————————————

export type InvalidGridReason =
  | 'out-of-range'
  | 'overlaps-existing'
  | 'invalid-row'
  | 'invalid-col';

export class InvalidGridCoordinateError extends CurtainWallSystemError {
  constructor(
    public readonly curtainWallId: string,
    public readonly row: number,
    public readonly col: number,
    public readonly reason: InvalidGridReason,
  ) {
    super(`Invalid grid coordinate (${row},${col}) on curtain-wall ${curtainWallId}: ${reason}`);
    this.name = 'InvalidGridCoordinateError';
  }
}

export class CurtainWallPanelOverlapError extends CurtainWallSystemError {
  constructor(public readonly curtainWallId: string, public readonly row: number, public readonly col: number) {
    super(`Curtain-wall ${curtainWallId} already has a panel at cell (${row},${col})`);
    this.name = 'CurtainWallPanelOverlapError';
  }
}

export function isCurtainWallSystemError(e: unknown): e is CurtainWallSystemError {
  return e instanceof CurtainWallSystemError;
}
