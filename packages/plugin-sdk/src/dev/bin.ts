#!/usr/bin/env node
// @pryzm/plugin-sdk — `pryzm` CLI top-level dispatcher (Phase F S62 D4/D9).
//
// Routes `pryzm <subcommand>` to the appropriate command module:
//
//   pryzm dev      — hot-reload dev loop (S62 D4)      → cli.ts
//   pryzm create   — scaffold a new plugin              → create-command.ts
//   pryzm build    — validate manifest + run build      → build-command.ts
//   pryzm publish  — sign manifest + submit to market   → publish-command.ts
//
// Usage:
//   pryzm dev [--manifest <path>] [--build-cmd <cmd>] [--bundle <path>]
//   pryzm create <plugin-name>
//   pryzm build [--manifest <path>] [--bundle <path>]
//   pryzm publish [--manifest <path>] [--bundle <path>] [--key <jwk-path>]
//               [--marketplace <url>] [--token <bearer>]

const [, , subcommand = '', ...rest] = process.argv;

async function run(): Promise<void> {
  switch (subcommand) {
    case 'dev': {
      const { main } = await import('./cli.js');
      await main(rest);
      break;
    }
    case 'create': {
      const { main } = await import('./create-command.js');
      await main(rest);
      break;
    }
    case 'build': {
      const { main } = await import('./build-command.js');
      await main(rest);
      break;
    }
    case 'publish': {
      const { main } = await import('./publish-command.js');
      await main(rest);
      break;
    }
    case '--help':
    case '-h':
    case 'help':
      printHelp();
      process.exit(0);
      break;
    default: {
      if (subcommand) {
        console.error(`pryzm: unknown subcommand '${subcommand}'\n`);
      }
      printHelp();
      process.exit(subcommand ? 4 : 0);
    }
  }
}

function printHelp(): void {
  console.log(
    [
      'Usage: pryzm <subcommand> [options]',
      '',
      'Subcommands:',
      '  dev      Start the hot-reload dev loop for a plugin',
      '  create   Scaffold a new plugin from a template',
      '  build    Validate the plugin manifest and run the build step',
      '  publish  Sign the plugin bundle and submit it to the marketplace',
      '',
      'Run `pryzm <subcommand> --help` for per-command options.',
      '',
      'Examples:',
      '  pryzm create my-wall-plugin',
      '  pryzm dev --build-cmd "tsup" --bundle dist/index.js',
      '  pryzm build --bundle dist/index.js',
      '  pryzm publish --bundle dist/index.js --key ~/.pryzm/publisher.jwk',
    ].join('\n'),
  );
}

run().catch((err: unknown) => {
  console.error(`pryzm: ${(err as Error).message}`);
  process.exit(1);
});
