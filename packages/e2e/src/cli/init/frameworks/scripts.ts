/** Reading package.json and its scripts, for the framework modules. */

import type { FrameworkManifest } from '../frameworks.ts';

/** The script that starts a dev server. */
export const DEV_SCRIPT = 'dev';

/** Whether package.json lists `name` in `dependencies` or `devDependencies`. */
export function declares(manifest: FrameworkManifest, name: string): boolean {
  return manifest.dependencies?.[name] !== undefined || manifest.devDependencies?.[name] !== undefined;
}

/** A script's commands, split at `&&`, `||`, `;`, `&`, and `|`, each as its words. */
export function commandsOf(script: string): string[][] {
  return script.split(/&&|\|\||[;&|]/u).map(words);
}

/** The words of one shell command, with the quotes around each stripped. */
function words(command: string): string[] {
  return command.split(/\s+/u).map((word) => word.replace(/^["']|["']$/gu, '')).filter((word) => word !== '');
}

/** A raw port value as a port: a number from 1 to 65535, else undefined (`$PORT`, `0`). */
export function fixedPort(value: string): number | undefined {
  if (!/^\d+$/u.test(value)) return undefined;
  const port = Number(value);
  return port >= 1 && port <= 65_535 ? port : undefined;
}
