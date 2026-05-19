// Typed errors for the rooms plugin (S25).
//
// Mirrors `plugins/slab/src/errors.ts`.

export class RoomSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomSystemError';
  }
}

export class RoomNotFoundError extends RoomSystemError {
  constructor(public readonly roomId: string) {
    super(`Room not found: ${roomId}`);
    this.name = 'RoomNotFoundError';
  }
}

export class RoomSchemaError extends RoomSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Room schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'RoomSchemaError';
  }
}

export class RoomSeedError extends RoomSystemError {
  constructor(public readonly reason: string) {
    super(`Invalid room seed point: ${reason}`);
    this.name = 'RoomSeedError';
  }
}

export class RoomBoundaryError extends RoomSystemError {
  constructor(public readonly reason: string) {
    super(`Room boundary error: ${reason}`);
    this.name = 'RoomBoundaryError';
  }
}

export class RoomNameError extends RoomSystemError {
  constructor(public override readonly name: string) {
    super(`Invalid room name: "${name}"`);
    this.name = 'RoomNameError';
  }
}

export class RoomHeightError extends RoomSystemError {
  constructor(public readonly heightOffset: number) {
    super(`Room heightOffset out of range: ${heightOffset} (allowed [-10, 10])`);
    this.name = 'RoomHeightError';
  }
}

export function isRoomSystemError(e: unknown): e is RoomSystemError {
  return e instanceof RoomSystemError;
}
