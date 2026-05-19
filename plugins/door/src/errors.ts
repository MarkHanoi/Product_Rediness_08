// Typed errors for the door plugin (S11-T1).
//
// Mirrors `plugins/wall/src/errors.ts` shape: a small typed hierarchy
// rooted at `DoorSystemError` so callers can `if (isDoorSystemError(e))`
// without parsing message strings.

export class DoorSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoorSystemError';
  }
}

export class DoorNotFoundError extends DoorSystemError {
  constructor(public readonly doorId: string) {
    super(`Door not found: ${doorId}`);
    this.name = 'DoorNotFoundError';
  }
}

export class HostWallNotFoundError extends DoorSystemError {
  constructor(public readonly wallId: string) {
    super(`Host wall not found: ${wallId}`);
    this.name = 'HostWallNotFoundError';
  }
}

export class DoorSchemaError extends DoorSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Door schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'DoorSchemaError';
  }
}

export class DoorDimensionsError extends DoorSystemError {
  constructor(public readonly reason: string) {
    super(`Invalid door dimensions: ${reason}`);
    this.name = 'DoorDimensionsError';
  }
}

export class DoorTypeNotFoundError extends DoorSystemError {
  constructor(public readonly typeId: string) {
    super(`Door type not found: ${typeId}`);
    this.name = 'DoorTypeNotFoundError';
  }
}

export class DoorOffsetOutOfRangeError extends DoorSystemError {
  constructor(public readonly offset: number, public readonly wallLength: number) {
    super(
      `Door offset ${offset.toFixed(3)} m exceeds host wall length ${wallLength.toFixed(3)} m`,
    );
    this.name = 'DoorOffsetOutOfRangeError';
  }
}

export function isDoorSystemError(e: unknown): e is DoorSystemError {
  return e instanceof DoorSystemError;
}
