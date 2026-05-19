// Built-in window type catalogue (S11 — `[strategic ADR-017]` v1 starter).
//
// Spec: 8 starter window types per SPEC-05 §7.3.

export interface WindowGridSpec {
  /** Number of glazing columns (1 = no vertical mullions). */
  readonly columns: number;
  /** Number of glazing rows (1 = no horizontal mullions). */
  readonly rows: number;
  /** Mullion thickness (m). */
  readonly mullionThickness: number;
}

export interface WindowType {
  readonly id: string;
  readonly name: string;
  readonly family: 'fixed' | 'casement' | 'sliding' | 'awning';
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
  readonly frameThickness: number;
  readonly frameWidth: number;
  readonly grid: WindowGridSpec;
  readonly glassOpacity: number;
  readonly frameColor: string;
  readonly fireRating?: string;
}

export const BUILTIN_WINDOW_TYPES: readonly WindowType[] = Object.freeze([
  {
    id: 'window.fixed.single.standard',
    name: 'Fixed — Single Pane',
    family: 'fixed',
    width: 1.2,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.05,
    frameWidth: 0.05,
    grid: { columns: 1, rows: 1, mullionThickness: 0.04 },
    glassOpacity: 0.35,
    frameColor: '#cccccc',
  },
  {
    id: 'window.fixed.large.picture',
    name: 'Fixed — Picture Window',
    family: 'fixed',
    width: 2.4,
    height: 1.5,
    sillHeight: 0.6,
    frameThickness: 0.06,
    frameWidth: 0.06,
    grid: { columns: 1, rows: 1, mullionThickness: 0.04 },
    glassOpacity: 0.3,
    frameColor: '#bcbcbc',
  },
  {
    id: 'window.casement.single.standard',
    name: 'Casement — Single',
    family: 'casement',
    width: 0.9,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.05,
    frameWidth: 0.05,
    grid: { columns: 1, rows: 2, mullionThickness: 0.04 },
    glassOpacity: 0.35,
    frameColor: '#ffffff',
  },
  {
    id: 'window.casement.double.standard',
    name: 'Casement — Double',
    family: 'casement',
    width: 1.6,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.05,
    frameWidth: 0.05,
    grid: { columns: 2, rows: 2, mullionThickness: 0.04 },
    glassOpacity: 0.35,
    frameColor: '#ffffff',
  },
  {
    id: 'window.sliding.double.standard',
    name: 'Sliding — Double',
    family: 'sliding',
    width: 1.8,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.06,
    frameWidth: 0.06,
    grid: { columns: 2, rows: 1, mullionThickness: 0.06 },
    glassOpacity: 0.32,
    frameColor: '#888888',
  },
  {
    id: 'window.sliding.triple.standard',
    name: 'Sliding — Triple',
    family: 'sliding',
    width: 2.7,
    height: 1.2,
    sillHeight: 0.9,
    frameThickness: 0.06,
    frameWidth: 0.06,
    grid: { columns: 3, rows: 1, mullionThickness: 0.06 },
    glassOpacity: 0.32,
    frameColor: '#888888',
  },
  {
    id: 'window.awning.single.standard',
    name: 'Awning — Single',
    family: 'awning',
    width: 0.9,
    height: 0.6,
    sillHeight: 1.6,
    frameThickness: 0.05,
    frameWidth: 0.05,
    grid: { columns: 1, rows: 1, mullionThickness: 0.04 },
    glassOpacity: 0.35,
    frameColor: '#ffffff',
  },
  {
    id: 'window.fixed.fire.fr60',
    name: 'Fire-Rated Fixed — FR60',
    family: 'fixed',
    width: 1.0,
    height: 1.0,
    sillHeight: 1.0,
    frameThickness: 0.07,
    frameWidth: 0.06,
    grid: { columns: 1, rows: 1, mullionThickness: 0.05 },
    glassOpacity: 0.5,
    frameColor: '#444444',
    fireRating: 'FR60',
  },
] satisfies readonly WindowType[]);

export function getWindowType(id: string): WindowType | undefined {
  return BUILTIN_WINDOW_TYPES.find((t) => t.id === id);
}

export const DEFAULT_WINDOW_TYPE_ID = 'window.fixed.single.standard';
