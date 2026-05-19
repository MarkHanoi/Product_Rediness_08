// Typed errors for the annotations plugin (S34 / ADR-0026).

export class AnnotationSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'AnnotationSystemError'; }
}

export class AnnotationNotFoundError extends AnnotationSystemError {
  constructor(public readonly annotationId: string) {
    super(`Annotation not found: ${annotationId}`);
    this.name = 'AnnotationNotFoundError';
  }
}

export class AnnotationSchemaError extends AnnotationSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Annotation schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'AnnotationSchemaError';
  }
}

export function isAnnotationSystemError(e: unknown): e is AnnotationSystemError {
  return e instanceof AnnotationSystemError;
}
