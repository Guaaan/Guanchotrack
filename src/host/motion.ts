// Movimiento de los caballos en pantalla: funciones puras, sin `three` ni DOM (plan US4b D4).
import { RACE_SPEEDS } from '../../shared/horses';

/** Zancadas por segundo en velocidad Normal: estancado → racha. */
const MIN_STRIDE_HZ = 1.1;
const MAX_STRIDE_HZ = 2.8;
/** Avances en la ventana a partir de los cuales el galope ya es el máximo. */
const STREAK_CAP = 4;
const WINDOW = 10;

/**
 * Avances del caballo `index` en los últimos `window` ticks hasta `tick`, según el historial
 * de posiciones recibido (tick → posiciones). Si faltan ticks, usa el más antiguo disponible.
 */
export function advancesInWindow(
  history: ReadonlyMap<number, readonly number[]>,
  tick: number,
  index: number,
  window = WINDOW,
): number {
  const current = history.get(tick);
  if (!current) return 0;
  for (let t = tick - window; t < tick; t++) {
    const base = history.get(t);
    if (base) return current[index] - base[index];
  }
  return 0;
}

/** Frecuencia de zancada (Hz): crece con la racha, con tope, y escala con la velocidad del tick. */
export function gallopRate(advances: number, tickMs: number): number {
  const streak = Math.min(Math.max(advances, 0), STREAK_CAP) / STREAK_CAP;
  return (MIN_STRIDE_HZ + (MAX_STRIDE_HZ - MIN_STRIDE_HZ) * streak) * (RACE_SPEEDS.normal / tickMs);
}

export interface DampState {
  x: number;
  v: number;
}

/**
 * Resorte críticamente amortiguado hacia `target`, integrado de forma exacta (estable con
 * cualquier `dt`): posición y velocidad continuas y sin sobrepaso partiendo del reposo.
 */
export function damp({ x, v }: DampState, target: number, dt: number, omega: number): DampState {
  const y = x - target;
  const decay = Math.exp(-omega * dt);
  const k = (v + omega * y) * dt;
  return { x: target + (y + k) * decay, v: (v - omega * k) * decay };
}

/** Rigidez del resorte para una velocidad de carrera: sigue al tick sin quedarse atrás. */
export const dampOmega = (tickMs: number) => 2.5 / (tickMs / 1000);
