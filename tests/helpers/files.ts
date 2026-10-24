import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');

/** Ficheros de código bajo los directorios dados (relativos a la raíz) más los `*.html` de la raíz. */
export function sourceFiles(dirs: string[]): { path: string; text: string }[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|js|css|html)$/.test(name)) out.push(full);
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  for (const name of readdirSync(ROOT)) {
    if (name.endsWith('.html')) out.push(join(ROOT, name));
  }
  return out.map((full) => ({ path: relative(ROOT, full), text: readFileSync(full, 'utf8') }));
}
