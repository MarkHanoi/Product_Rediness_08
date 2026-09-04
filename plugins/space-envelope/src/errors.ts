// Space-envelope error types.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §12.

/** Thrown when a payload cannot become a valid record. `canExecute` should have caught it. */
export class SpaceEnvelopeGeometryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SpaceEnvelopeGeometryError';
    }
}

/**
 * Thrown when a caller asks for `role: 'maximumBuildable'`.
 *
 * ⭐ A SEPARATE CLASS, NOT A GENERIC VALIDATION ERROR, because this refusal is a
 * PRODUCT POSITION rather than a data problem (ADR-0380 D2): the maximum buildable
 * volume is SOLVED from the zoning rules, and PRYZM will not let a study be authored
 * by hand. A caller that wants to distinguish "you typed the wrong thing" from "we
 * will not do that" needs the two to be different types.
 */
export class MaximumBuildableNotAuthorableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MaximumBuildableNotAuthorableError';
    }
}
