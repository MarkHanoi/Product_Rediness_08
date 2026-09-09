// Siteworks error types. C116 §12 · ADR-0384 · C16 CA-18.

/** Thrown when a payload cannot become a valid record. `canExecute` should have caught it. */
export class SiteworksGeometryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SiteworksGeometryError';
    }
}

/**
 * Thrown when `siteworks.setWidth` is aimed at an AREAL surface.
 *
 * ⭐ A SEPARATE CLASS, NOT A GENERIC VALIDATION ERROR, and the reason is C16 CA-18.
 * An areal surface — a car park, a plaza — has no single "width"; it has a boundary.
 * The tempting implementations are both wrong:
 *
 *   ⛔ SILENTLY DOING NOTHING is a BARE SUCCESS. The user drags a width field, the
 *      command reports success, and the shape does not move. They conclude the
 *      product is broken and cannot tell you which half.
 *   ⛔ QUIETLY SCALING THE BOUNDARY would invent an interpretation the user never
 *      asked for, and it is not even well defined — scale about what centre, on
 *      which axis?
 *
 * ⭐ AND THE REFUSAL NAMES THE ROUTE BACK TO SUCCESS ([[refusing-half-needs-its-escape-hatch]]):
 * a gate whose "no" branch leaves the user with nowhere to go is a regression with a
 * citation attached. The message says which verb DOES move an areal surface.
 */
export class SiteworksHasNoWidthError extends Error {
    constructor(id: string) {
        super(
            `siteworks.setWidth cannot apply to ${id}: it is an AREAL surface, authored as a `
            + 'boundary ring, and an arbitrary ring has no single width to set. This is a '
            + 'refusal, not a failure — C116 §6b. To change its extent, edit the boundary; to '
            + 'change its build-up depth, use siteworks.setThickness, which applies to both '
            + 'forms. If you meant to author a road, create it with form: "linear" and a '
            + 'centreline, and setWidth will apply.',
        );
        this.name = 'SiteworksHasNoWidthError';
    }
}

/** Thrown when a verb names an id that is not in the store. */
export class SiteworksNotFoundError extends Error {
    constructor(id: string) {
        super(`No siteworks surface with id ${id}.`);
        this.name = 'SiteworksNotFoundError';
    }
}
