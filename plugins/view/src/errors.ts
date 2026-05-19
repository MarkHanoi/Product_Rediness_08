// View plugin errors (S17).
//
// Spec: PHASE-1C §S17 — typed error classes parallel to the wall plugin pattern.

export class ViewNotFoundError extends Error {
  constructor(viewId: string) {
    super(`[view.handler] View "${viewId}" not found.`);
    this.name = 'ViewNotFoundError';
  }
}

export class ViewAlreadyExistsError extends Error {
  constructor(viewId: string) {
    super(`[view.handler] View "${viewId}" already exists.`);
    this.name = 'ViewAlreadyExistsError';
  }
}

export class ViewValidationError extends Error {
  constructor(message: string) {
    super(`[view.handler] Validation failed: ${message}`);
    this.name = 'ViewValidationError';
  }
}
