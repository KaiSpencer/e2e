/**
 * Vite: the dev server, locally and in CI, on the `--port` of the `vite`
 * command, else the config's `server.port`, else 5173. Vite reads no `PORT`
 * variable, and `vite preview` serves the build on 4173, so CI runs `dev` too.
 */

import type { Detection, Framework } from '../frameworks.ts';
import { declares, DEV_SCRIPT, fixedPort } from './scripts.ts';

const NAME = 'Vite';
const DOCS = '/reference/cli#vite-apps';
const DEFAULT_PORT = 5173;
/** `vite` subcommands that start no dev server. */
const OTHER_COMMANDS = new Set(['build', 'preview', 'optimize']);
/** The dev server's options that take a value, so the word after one is not the root it serves. */
const VALUE_OPTIONS = new Set(['--host', '--port', '--open', '--base', '-l', '--logLevel', '-m', '--mode', '-d', '--debug', '-f', '--filter', '--configLoader']);
/** Vite plugins of a backend that serves the app, while Vite serves only its assets. */
const BACKEND_PLUGINS = ['laravel-vite-plugin', 'vite-plugin-symfony', 'vite-plugin-ruby', 'vite-plugin-rails'];
/** Root files of Laravel and Django, whose Vite integrations list no plugin in package.json. */
const BACKEND_FILES = ['artisan', 'manage.py'];
const CONFIGS = ['vite.config.ts', 'vite.config.mts', 'vite.config.cts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];
/** Every `port` key in a config, as `port: 3000`, `port: env.PORT`, or the shorthand `{ port }`. */
const CONFIG_PORT = /\bport\b(?:\s*:\s*([^,}\n]*))?/gu;

export const vite: Framework = {
  /** A project with `vite` in `dependencies` or `devDependencies`. */
  claims: (manifest) => declares(manifest, 'vite'),

  /**
   * How to start the app. `unsupported` when init cannot tell where it
   * answers: a backend serves it, the `dev` script starts no Vite dev server,
   * serves another directory or names its own config, or the port is not a
   * fixed number init can read.
   */
  detect({ manifest, readFile }): Detection {
    const unsupported = (reason: string): Detection => ({ kind: 'unsupported', framework: NAME, docs: DOCS, reason });
    const backend = BACKEND_PLUGINS.find((name) => declares(manifest, name)) ?? BACKEND_FILES.find((name) => readFile(name) !== undefined);
    if (backend !== undefined) return unsupported(`${backend} marks a backend that serves the app, and the Vite dev server serves its assets`);
    const dev = manifest.scripts?.[DEV_SCRIPT];
    if (dev === undefined) return unsupported(`package.json has no ${DEV_SCRIPT} script`);
    const commands = commandsOf(dev);
    const server = commands.findIndex((command) => command[0] === 'vite' && !OTHER_COMMANDS.has(command[1] ?? ''));
    const command = commands[server];
    if (command === undefined) return unsupported(`the ${DEV_SCRIPT} script does not start the vite dev server`);
    const args = command[1] === 'dev' || command[1] === 'serve' ? command.slice(2) : command.slice(1);
    if (args.some((word) => word === '-c' || word === '--config' || word.startsWith('--config='))) {
      return unsupported('the dev script names its own Vite config');
    }
    // Vite reads the config of the directory it serves, which init does not.
    const root = args.some((word, index) => !word.startsWith('-') && !VALUE_OPTIONS.has(args[index - 1] ?? ''));
    if (root || commands.slice(0, server).some((earlier) => earlier[0] === 'cd')) return unsupported('the dev script serves another directory');
    const flag = portFlag(args);
    const port = flag === undefined ? DEFAULT_PORT : fixedPort(flag);
    if (port === undefined) return unsupported(`init cannot read a fixed port from the ${DEV_SCRIPT} script`);
    // `--port` wins over the config's port.
    const config = flag === undefined ? CONFIGS.find((name) => configMovesPort(readFile(name) ?? '', port)) : undefined;
    if (config !== undefined) return unsupported(`${config} may set the dev server's port`);
    return { kind: 'app', framework: NAME, docs: DOCS, url: `http://localhost:${port}`, dev: DEV_SCRIPT };
  },
};

/**
 * A script's commands, each as its words from the binary on (see `launched`). A script splits at `&&`, `||`, `;`,
 * `&`, and `|`, and a quoted argument is a command of its own, as
 * `concurrently "vite" "json-server --port 3001"` runs it, unless it is the
 * value of an option before it (`--port "4100"`).
 */
function commandsOf(script: string): string[][] {
  const commands: string[][] = [];
  for (const part of script.split(/&&|\|\||[;&|]/u)) {
    const outer: string[] = [];
    for (const match of part.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)) {
      const quoted = match[1] ?? match[2];
      const previous = outer.at(-1);
      if (quoted === undefined || previous?.startsWith('-') === true) outer.push(quoted ?? match[3] ?? '');
      else commands.push(launched(quoted.split(/\s+/u).filter((word) => word !== '')));
    }
    commands.push(launched(outer));
  }
  return commands.filter((command) => command.length > 0);
}

/** A command from its binary on: `npx vite`, `cross-env NODE_ENV=dev vite`, and `PORT=1 vite` are `vite`. */
function launched(words: string[]): string[] {
  let start = 0;
  for (;;) {
    const word = words[start];
    if (word === 'npx' || word === 'bunx' || word === 'yarn' || word === 'cross-env' || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(word ?? '')) start += 1;
    else if ((word === 'pnpm' || word === 'npm') && words[start + 1] === 'exec') start += 2;
    else return words.slice(start);
  }
}

/** The value of a `--port` option (`--port 4100`, `--port=4100`), the only form Vite's CLI takes, raw. */
function portFlag(args: readonly string[]): string | undefined {
  for (const [index, word] of args.entries()) {
    if (word === '--port') return args[index + 1] ?? '';
    if (word.startsWith('--port=')) return word.slice('--port='.length);
  }
  return undefined;
}

/**
 * Whether a Vite config may move the dev server off `port`: it names a port
 * other than that number, or one init cannot read. Comments don't count, and
 * a config that repeats the port, as `server: { port: 5173, strictPort: true }` does, keeps it.
 */
function configMovesPort(text: string, port: number): boolean {
  const code = text.replace(/\/\*[\s\S]*?\*\//gu, ' ').replace(/(^|\s)\/\/.*$/gmu, '$1');
  return [...code.matchAll(CONFIG_PORT)].some((match) => match[1]?.trim() !== String(port));
}
