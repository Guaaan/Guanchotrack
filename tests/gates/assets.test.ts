import { describe, expect, it } from 'vitest';
import { sourceFiles } from '../helpers/files';

const FORBIDDEN: [string, RegExp][] = [
  ['fichero de asset', /['"`(][^'"`()\s]*\.(png|jpe?g|gif|svg|webp|glb|gltf|obj|woff2?|ttf|otf)(\?[^'"`)]*)?['"`)]/i],
  ['@font-face', /@font-face/i],
  ['url() a fichero', /url\(\s*['"]?(?!data:)[^)'"\s]/i],
  ['URL externa', /https?:\/\//i],
];

describe('puerta de assets externos (principio VI)', () => {
  it('no hay referencias a assets ni URLs externas', () => {
    const violations: string[] = [];
    for (const { path, text } of sourceFiles(['src', 'shared'])) {
      text.split('\n').forEach((line, i) => {
        for (const [label, re] of FORBIDDEN) {
          if (re.test(line)) violations.push(`${path}:${i + 1} ${label}: ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
