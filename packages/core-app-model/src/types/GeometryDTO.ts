// @pryzm/core-app-model — geometry primitive DTOs (Wave 10 T4 W10-A).
//
// Thin plain-object types used at the domain boundary so geometry data
// can be serialised / deserialised without importing THREE.Vector3 etc.

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface EulerDTO {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly order?: string;
}

export function isPoint3D(v: unknown): v is Point3D {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['x'] === 'number' &&
    typeof o['y'] === 'number' &&
    typeof o['z'] === 'number'
  );
}

export function isEulerDTO(v: unknown): v is EulerDTO {
  if (!isPoint3D(v)) return false;
  const o = (v as unknown) as Record<string, unknown>;
  return o['order'] === undefined || typeof o['order'] === 'string';
}
