// format-plugin-example — CSV walls importer.
//
// Demonstrates:
//
//   • register:command + FormatProxy.registerImporter integration.
//   • Returning an array of commands from an ImporterHandler so the
//     host wraps the import in a transaction (atomic — partial-import
//     leaves no half-state).
//   • Permission gating — write:project is required to dispatch wall.create.

import { definePlugin } from '../../src/lifecycle';
import type { PluginActivationContext } from '../../src/lifecycle';
import type { FormatImporterRegistration } from '../../src/hosts/format';

let importerReg: FormatImporterRegistration | null = null;

export default definePlugin({
  async onActivate(ctx: PluginActivationContext) {
    importerReg = ctx.hosts.format.registerImporter({
      extension: '.csv',
      menuLabel: 'Import walls from CSV',
      handler: async (input) => {
        const text = new TextDecoder('utf-8').decode(input.bytes);
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !l.startsWith('#'));

        const commands: { kind: string; payload: unknown }[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] as string;
          const parts = line.split(',').map((p) => Number(p.trim()));
          if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) {
            return {
              ok: false,
              error: {
                code: 'csv-row-malformed',
                message: `${input.filename}:${i + 1} — expected 6 numeric columns; got '${line}'`,
              },
            };
          }
          const [x1, y1, x2, y2, height, thickness] = parts as [number, number, number, number, number, number];
          if (height <= 0 || thickness <= 0) {
            return {
              ok: false,
              error: {
                code: 'csv-row-degenerate',
                message: `${input.filename}:${i + 1} — height (${height}) and thickness (${thickness}) must be positive`,
              },
            };
          }
          commands.push({
            kind: 'wall.create',
            payload: { start: [x1, y1], end: [x2, y2], height, thickness },
          });
        }
        return { ok: true, commands };
      },
    });
  },

  async onDeactivate() {
    importerReg?.dispose();
    importerReg = null;
  },
});
