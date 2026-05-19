// @pryzm/plugin-sdk — `pryzm create <name>` command (Phase F S62 D4).
//
// Scaffolds a new plugin package from the canonical template:
//
//   <name>/
//   ├── plugin.manifest.json   — valid PluginManifest skeleton
//   ├── package.json           — pnpm/npm package with build + dev scripts
//   ├── tsconfig.json          — TypeScript config aligned with plugin-sdk
//   ├── src/
//   │   └── index.ts           — activate() / deactivate() stubs
//   └── README.md              — quick-start instructions
//
// Usage:
//   pryzm create my-plugin-name
//   pryzm create my-plugin-name --dir ./plugins
//   pryzm create --help

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

interface CreateArgs {
  name: string;
  outDir: string;
}

function parseArgs(argv: readonly string[]): CreateArgs {
  const args: CreateArgs = { name: '', outDir: process.cwd() };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--dir' && argv[i + 1]) {
      args.outDir = String(argv[i + 1] as string);
      i += 1;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else if (!a.startsWith('-')) {
      args.name = a;
    } else {
      console.error(`pryzm create: unknown argument '${a}'`);
      process.exit(4);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(
    [
      'Usage: pryzm create <plugin-name> [--dir <output-directory>]',
      '',
      'Options:',
      '  --dir <path>   Directory to create the plugin inside (default: cwd)',
      '  -h, --help     Show this help',
      '',
      'Examples:',
      '  pryzm create my-wall-tool',
      '  pryzm create my-schedule-exporter --dir ./plugins',
    ].join('\n'),
  );
}

function validateName(name: string): void {
  // Must match the PluginManifest ID_REGEX: /^[a-z][a-z0-9-]{2,63}$/
  if (!/^[a-z][a-z0-9-]{2,63}$/.test(name)) {
    console.error(
      `pryzm create: invalid plugin name '${name}'.\n` +
      `  Must be lowercase kebab-case, 3–64 chars, starting with a letter.\n` +
      `  Example: my-plugin-name`,
    );
    process.exit(1);
  }
}

function writeFile(filePath: string, content: string): void {
  writeFileSync(filePath, content, 'utf-8');
  console.log(`  created  ${filePath}`);
}

export async function main(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);

  if (!args.name) {
    console.error('pryzm create: plugin name is required.\n');
    printHelp();
    process.exit(1);
  }

  validateName(args.name);

  const pluginDir = resolve(args.outDir, args.name);

  if (existsSync(pluginDir)) {
    console.error(`pryzm create: directory '${pluginDir}' already exists.`);
    process.exit(1);
  }

  console.log(`\nScaffolding plugin '${args.name}' in ${pluginDir}\n`);

  // Create directory structure
  mkdirSync(join(pluginDir, 'src'), { recursive: true });

  // plugin.manifest.json
  writeFile(
    join(pluginDir, 'plugin.manifest.json'),
    JSON.stringify(
      {
        pryzmPlugin: '1.0',
        id: args.name,
        version: '0.1.0',
        displayName: toDisplayName(args.name),
        description: `A PRYZM plugin — ${args.name}.`,
        author: '',
        license: 'MIT',
        main: 'src/index.ts',
        minPRYZMVersion: '3.0.0',
        permissions: ['read:project'],
        allowedOrigins: [],
        contributions: [],
      },
      null,
      2,
    ) + '\n',
  );

  // package.json
  writeFile(
    join(pluginDir, 'package.json'),
    JSON.stringify(
      {
        name: `@pryzm-plugin/${args.name}`,
        version: '0.1.0',
        description: `PRYZM plugin — ${args.name}.`,
        private: false,
        type: 'module',
        main: './src/index.ts',
        exports: { '.': './src/index.ts' },
        scripts: {
          dev: `pryzm dev --build-cmd "tsup src/index.ts --format esm --out-dir dist" --bundle dist/index.js`,
          build: 'tsup src/index.ts --format esm --dts --out-dir dist',
          publish: 'pryzm publish --bundle dist/index.js',
          typecheck: 'tsc -p tsconfig.json --noEmit',
        },
        peerDependencies: {
          '@pryzm/sdk': '^1.0.0',
        },
        devDependencies: {
          '@types/node': '^22.10.5',
          '@pryzm/sdk': '^1.0.0',
          tsup: '^8.3.5',
          typescript: '^5.9.3',
        },
      },
      null,
      2,
    ) + '\n',
  );

  // tsconfig.json
  writeFile(
    join(pluginDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['src'],
      },
      null,
      2,
    ) + '\n',
  );

  // src/index.ts
  writeFile(
    join(pluginDir, 'src', 'index.ts'),
    [
      `/**`,
      ` * ${args.name} — PRYZM plugin entry point.`,
      ` *`,
      ` * Called by the PRYZM runtime after the plugin sandbox initialises.`,
      ` * Register tools, panels, and commands via the \`runtime\` object.`,
      ` */`,
      ``,
      `export const PLUGIN_ID = '${args.name}';`,
      ``,
      `/**`,
      ` * activate — called once when the plugin is loaded into a project.`,
      ` * @param runtime  The PRYZM runtime proxy (typed as PryzmRuntime from @pryzm/sdk).`,
      ` */`,
      `export async function activate(runtime: unknown): Promise<void> {`,
      `  console.info(\`[\${PLUGIN_ID}] activated\`);`,
      `  // TODO: register tools, panels, and commands here.`,
      `  // Example:`,
      `  //   (runtime as PryzmRuntime).tools.register({ ... });`,
      `  void runtime;`,
      `}`,
      ``,
      `/**`,
      ` * deactivate — called when the plugin is unloaded or the project closes.`,
      ` * Clean up any subscriptions, timers, or DOM nodes registered in activate().`,
      ` */`,
      `export async function deactivate(): Promise<void> {`,
      `  console.info(\`[\${PLUGIN_ID}] deactivated\`);`,
      `}`,
      ``,
    ].join('\n'),
  );

  // README.md
  writeFile(
    join(pluginDir, 'README.md'),
    [
      `# ${toDisplayName(args.name)}`,
      ``,
      `A PRYZM 3 plugin scaffolded with \`pryzm create\`.`,
      ``,
      `## Quick start`,
      ``,
      `\`\`\`bash`,
      `# Install dependencies`,
      `npm install`,
      ``,
      `# Start the hot-reload dev loop`,
      `npm run dev`,
      ``,
      `# Build for distribution`,
      `npm run build`,
      ``,
      `# Publish to the PRYZM Marketplace`,
      `npm run publish`,
      `\`\`\``,
      ``,
      `## Plugin manifest`,
      ``,
      `Edit \`plugin.manifest.json\` to:`,
      `- Add your display name, description, and author`,
      `- Declare the permissions your plugin needs (only request what you use)`,
      `- Register your tool, panel, and command contributions`,
      ``,
      `## Permissions reference`,
      ``,
      `| Permission | What it enables |`,
      `|---|---|`,
      `| \`read:project\` | Read element data from stores |`,
      `| \`write:project\` | Execute commands via the command bus |`,
      `| \`read:user\` | Read current user info |`,
      `| \`network:fetch\` | Outbound fetch() (list origins in allowedOrigins) |`,
      `| \`register:tool\` | Register a viewport tool |`,
      `| \`register:panel\` | Register a panel contribution |`,
      `| \`register:command\` | Register a command palette entry |`,
      ``,
      `## Publishing`,
      ``,
      `\`\`\`bash`,
      `# Generate your publisher key pair (one-time)`,
      `npx @pryzm/sdk keygen --out ~/.pryzm/publisher.jwk`,
      ``,
      `# Build and publish`,
      `npm run build`,
      `pryzm publish --bundle dist/index.js --key ~/.pryzm/publisher.jwk`,
      `\`\`\``,
      ``,
    ].join('\n'),
  );

  console.log(`\n✓ Plugin '${args.name}' created at ${pluginDir}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${args.name}`);
  console.log(`  npm install`);
  console.log(`  npm run dev`);
  console.log(``);
}

function toDisplayName(kebab: string): string {
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
