import { describe, expect, it } from 'vitest';
import { PALETTE } from '../../src/palette';
import { sourceFiles } from '../helpers/files';

const CONSTITUTION = {
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
};

const HEX = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])';
const FORBIDDEN: [string, RegExp][] = [
  ['hex entre comillas', new RegExp(`['"\`]\\s*${HEX}`)],
  ['hex como valor', new RegExp(`[:=(,]\\s*${HEX}`)],
  ['rgb()/rgba()', /\brgba?\(/i],
  ['hsl()/hsla()', /\bhsla?\(/i],
  ['0xRRGGBB', /\b0x[0-9a-fA-F]{6}\b/],
  ['color CSS con nombre', /:\s*(red|white|black|blue|green|yellow|orange|pink|gray|grey|purple|brown)\b/i],
];

describe('puerta de paleta PICO-8', () => {
  it('PALETTE tiene exactamente los 16 colores de la constitución', () => {
    expect(Object.keys(PALETTE)).toHaveLength(16);
    expect({ ...PALETTE }).toEqual(CONSTITUTION);
    expect(Object.isFrozen(PALETTE)).toBe(true);
  });

  it('no hay literales de color fuera de src/palette.ts', () => {
    const violations: string[] = [];
    for (const { path, text } of sourceFiles(['src', 'shared', 'server'])) {
      if (path === 'src/palette.ts') continue;
      text.split('\n').forEach((line, i) => {
        const clean = line.replace(/var\(--c-[a-z-]+\)/g, '');
        for (const [label, re] of FORBIDDEN) {
          if (re.test(clean)) violations.push(`${path}:${i + 1} ${label}: ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
