import { describe, it, expect } from 'vitest';
import { PLUGIN_ID, PLUGIN_NAME } from '../src/index.js';

describe('@pryzm/plugin-navigate — L8 compliance smoke', () => {
  it('exports a stable PLUGIN_ID', () => {
    expect(PLUGIN_ID).toBe('navigate');
  });

  it('exports a stable PLUGIN_NAME', () => {
    expect(PLUGIN_NAME).toBe('@pryzm/plugin-navigate');
  });
});
