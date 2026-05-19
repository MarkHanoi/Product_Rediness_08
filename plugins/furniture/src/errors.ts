// Typed errors for the furniture plugin (S27 / ADR-0027).

export class FurnitureSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'FurnitureSystemError'; }
}
export class FurnitureNotFoundError extends FurnitureSystemError {
  constructor(public readonly furnitureId: string) {
    super(`Furniture not found: ${furnitureId}`);
    this.name = 'FurnitureNotFoundError';
  }
}
export class FurnitureSchemaError extends FurnitureSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Furniture schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'FurnitureSchemaError';
  }
}
export class FurnitureLodError extends FurnitureSystemError {
  constructor(public readonly lod: unknown) {
    super(`Furniture LOD must be one of {0,1,2,3,4} (received ${String(lod)})`);
    this.name = 'FurnitureLodError';
  }
}
export class FurnitureCatalogueLookupError extends FurnitureSystemError {
  constructor(public readonly catalogId: string) {
    super(`Furniture catalogue lookup failed: ${catalogId}`);
    this.name = 'FurnitureCatalogueLookupError';
  }
}
export function isFurnitureSystemError(e: unknown): e is FurnitureSystemError {
  return e instanceof FurnitureSystemError;
}
