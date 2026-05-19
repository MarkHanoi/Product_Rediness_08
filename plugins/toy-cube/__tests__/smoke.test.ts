import { describe, it, expect } from 'vitest';
import { MoveCubeCommand } from '../src/index.js';

describe('@pryzm/plugin-toy-cube — L8 compliance smoke', () => {
  it('MoveCubeCommand has the expected type string', () => {
    const cmd = new MoveCubeCommand();
    expect(cmd.type).toBe('cube.move');
  });

  it('MoveCubeCommand.canExecute rejects empty id', () => {
    const cmd = new MoveCubeCommand();
    const result = cmd.canExecute({ stores: { cube: {} } } as never, {
      id: '',
      dx: 0,
      dy: 0,
      dz: 0,
    });
    expect(result.valid).toBe(false);
  });
});
