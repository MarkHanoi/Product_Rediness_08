// Errors thrown by the sheets plugin (S37 / ADR-0031).
//
// All sheets-plugin errors are typed subclasses of `SheetsPluginError`
// so handler tests can `instanceof`-discriminate without resorting to
// string-matching on the message.

export class SheetsPluginError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Thrown when `SheetSchema.parse(seed)` rejects a CreateSheet seed. */
export class SheetSchemaError extends SheetsPluginError {
  constructor(public override readonly cause: unknown) {
    super(`[sheets] sheet payload failed schema validation: ${String(cause)}`, { cause });
  }
}

/** Thrown when a handler references a sheet id that does not exist. */
export class SheetNotFoundError extends SheetsPluginError {
  constructor(public readonly sheetId: string) {
    super(`[sheets] no sheet with id "${sheetId}"`);
  }
}

/** Thrown when CreateSheet receives an id that already exists. */
export class DuplicateSheetIdError extends SheetsPluginError {
  constructor(public readonly sheetId: string) {
    super(`[sheets] sheet with id "${sheetId}" already exists`);
  }
}

/** Thrown when the chosen sheet number conflicts with an existing one. */
export class DuplicateSheetNumberError extends SheetsPluginError {
  constructor(public readonly number: string) {
    super(`[sheets] sheet number "${number}" is already in use`);
  }
}

/** Thrown when a handler's payload fails an `intent.ts` invariant. */
export class SheetIntentError extends SheetsPluginError {
  constructor(reason: string) {
    super(`[sheets] intent invariant failed: ${reason}`);
  }
}

// ── S38 (Title Blocks + Viewports) errors ──────────────────────────────────

/** Thrown when AddViewport receives a viewport id that already exists on
 *  the target sheet. */
export class DuplicateViewportIdError extends SheetsPluginError {
  constructor(public readonly sheetId: string, public readonly viewportId: string) {
    super(`[sheets] viewport id "${viewportId}" already exists on sheet "${sheetId}"`);
  }
}

/** Thrown when a handler references a viewport id that does not exist on
 *  the target sheet. */
export class ViewportNotFoundError extends SheetsPluginError {
  constructor(public readonly sheetId: string, public readonly viewportId: string) {
    super(`[sheets] no viewport with id "${viewportId}" on sheet "${sheetId}"`);
  }
}

/** Thrown when SetTitleBlock references a template id not registered in
 *  the TitleBlockStore. */
export class TitleBlockTemplateNotFoundError extends SheetsPluginError {
  constructor(public readonly templateId: string) {
    super(`[sheets] no title-block template with id "${templateId}"`);
  }
}

// ── S39 (Sheet Widgets) errors ─────────────────────────────────────────────

/** Thrown when AddWidget receives a widget id that already exists on
 *  the target sheet. */
export class DuplicateWidgetIdError extends SheetsPluginError {
  constructor(public readonly sheetId: string, public readonly widgetId: string) {
    super(`[sheets] widget id "${widgetId}" already exists on sheet "${sheetId}"`);
  }
}

/** Thrown when a handler references a widget id that does not exist on
 *  the target sheet. */
export class WidgetNotFoundError extends SheetsPluginError {
  constructor(public readonly sheetId: string, public readonly widgetId: string) {
    super(`[sheets] no widget with id "${widgetId}" on sheet "${sheetId}"`);
  }
}

/** Thrown when AddWidget receives a `kind` outside the built-in 10
 *  (custom plugin kinds need their own handler). */
export class WidgetKindUnknownError extends SheetsPluginError {
  constructor(public readonly kind: string) {
    super(`[sheets] unknown widget kind "${kind}"`);
  }
}
