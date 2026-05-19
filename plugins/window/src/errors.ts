// Typed errors for the window plugin (S11-T2).

export class WindowSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WindowSystemError';
  }
}

export class WindowNotFoundError extends WindowSystemError {
  constructor(public readonly windowId: string) {
    super(`Window not found: ${windowId}`);
    this.name = 'WindowNotFoundError';
  }
}

export class WindowSchemaError extends WindowSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Window schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'WindowSchemaError';
  }
}

export class WindowDimensionsError extends WindowSystemError {
  constructor(public readonly reason: string) {
    super(`Invalid window dimensions: ${reason}`);
    this.name = 'WindowDimensionsError';
  }
}

export class WindowTypeNotFoundError extends WindowSystemError {
  constructor(public readonly typeId: string) {
    super(`Window type not found: ${typeId}`);
    this.name = 'WindowTypeNotFoundError';
  }
}

export function isWindowSystemError(e: unknown): e is WindowSystemError {
  return e instanceof WindowSystemError;
}
