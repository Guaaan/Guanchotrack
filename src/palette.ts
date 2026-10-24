// Único fichero con literales de color (constitución, principio VII).
export const PALETTE = Object.freeze({
  'black': '#000000',
  'dark-blue': '#1D2B53',
  'dark-purple': '#7E2553',
  'dark-green': '#008751',
  'brown': '#AB5236',
  'dark-grey': '#5F574F',
  'light-grey': '#C2C3C7',
  'white': '#FFF1E8',
  'red': '#FF004D',
  'orange': '#FFA300',
  'yellow': '#FFEC27',
  'green': '#00E436',
  'blue': '#29ADFF',
  'lavender': '#83769C',
  'pink': '#FF77A8',
  'peach': '#FFCCAA',
} as const);

export type ColorToken = keyof typeof PALETTE;

/** Valor numérico para Three.js (p. ej. `new Color(hex('red'))`). */
export function hex(token: ColorToken): number {
  return parseInt(PALETTE[token].slice(1), 16);
}

/** Define `--c-<token>` en `:root` para que el CSS use solo `var(--c-*)`. */
export function applyCssTokens(): void {
  const root = document.documentElement;
  for (const [token, value] of Object.entries(PALETTE)) {
    root.style.setProperty(`--c-${token}`, value);
  }
}
