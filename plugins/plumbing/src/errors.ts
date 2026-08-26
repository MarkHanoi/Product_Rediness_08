// Typed errors for the plumbing plugin (S26 / ADR-0026).

export class PlumbingSystemError extends Error {
  constructor(message: string) { super(message); this.name = 'PlumbingSystemError'; }
}
export class PlumbingNotFoundError extends PlumbingSystemError {
  constructor(public readonly plumbingId: string) {
    super(`Plumbing element not found: ${plumbingId}`);
    this.name = 'PlumbingNotFoundError';
  }
}
export class PlumbingSchemaError extends PlumbingSystemError {
  constructor(public override readonly cause: unknown) {
    super(`Plumbing schema validation failed: ${String((cause as Error)?.message ?? cause)}`);
    this.name = 'PlumbingSchemaError';
  }
}
export function isPlumbingSystemError(e: unknown): e is PlumbingSystemError {
  return e instanceof PlumbingSystemError;
}

// ── §BATH102 — the C109 bathroom-pod compound ────────────────────────────────

/**
 * The module does not fit the room it was asked to fit.
 *
 * ⭐ THE MESSAGE IS THE SOLVER'S OWN SENTENCE, PASSED THROUGH UNCHANGED. C109 §5.4 /
 * C16 CA-18 / C74: it names the metres REQUIRED and the metres AVAILABLE and the
 * route back to success — *"This bathroom pod needs 2.27 m of clear wall (shower 1.00
 * + 0.10 + WC 0.42 + 0.10 + basin 0.65, including clearances); this room offers 1.40 m.
 * Widen the room to 2.27 m, or remove the shower from the module."* ⛔ Wrapping it in
 * a generic prefix here would be this class re-stating a message it did not compute
 * and could get wrong; the reason is the whole value of the refusal.
 */
export class BathroomPodFitError extends PlumbingSystemError {
  constructor(reason: string) {
    super(reason);
    this.name = 'BathroomPodFitError';
  }
}

/** A pod record that failed `validateBathroomPod` — a producer defect, not a fit one. */
export class BathroomPodSchemaError extends PlumbingSystemError {
  constructor(reason: string) {
    super(`Bathroom pod validation failed: ${reason}`);
    this.name = 'BathroomPodSchemaError';
  }
}

/** The named pod is not in the store. */
export class BathroomPodNotFoundError extends PlumbingSystemError {
  constructor(public readonly podId: string) {
    super(`Bathroom pod not found: ${podId}`);
    this.name = 'BathroomPodNotFoundError';
  }
}
