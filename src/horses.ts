import { DEFAULT_HORSES } from '../shared/horses';
import type { HorseDef, HorseNumber } from '../shared/types';

// Caballos vigentes en el cliente: los envía el servidor en cada `state` (research R11).
let defs: readonly HorseDef[] = DEFAULT_HORSES;
let key = JSON.stringify(defs);
const listeners = new Set<(defs: readonly HorseDef[]) => void>();

/** Guarda las definiciones del snapshot; avisa solo si cambiaron. */
export function setHorseDefs(next: readonly HorseDef[]): void {
  const nextKey = JSON.stringify(next);
  if (nextKey === key) return;
  defs = next;
  key = nextKey;
  for (const fn of listeners) fn(defs);
}

export const horseDefs = (): readonly HorseDef[] => defs;

export const horseDef = (n: HorseNumber | number): HorseDef => defs[n - 1];

export function onHorseDefsChange(fn: (defs: readonly HorseDef[]) => void): void {
  listeners.add(fn);
}
