import { Vector3 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PALETTE } from '../palette';

/** Colores de la paleta en sRGB 0..1, en el orden de `PALETTE`. */
function paletteVectors(): Vector3[] {
  return Object.values(PALETTE).map((value) => {
    const n = parseInt(value.slice(1), 16);
    return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  });
}

/**
 * Pasada final que lleva cada pixel al color PICO-8 más cercano (distancia RGB euclídea,
 * sin dithering). La entrada es lineal; se pasa a sRGB antes de comparar y se escribe el
 * valor sRGB de la paleta tal cual, así la pantalla muestra exactamente los 16 colores.
 */
export function createQuantizePass(): ShaderPass {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      palette: { value: paletteVectors() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec3 palette[16];
      varying vec2 vUv;

      vec3 linearToSrgb(vec3 c) {
        c = clamp(c, 0.0, 1.0);
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }

      void main() {
        vec3 color = linearToSrgb(texture2D(tDiffuse, vUv).rgb);
        vec3 best = palette[0];
        float bestDist = 1e9;
        for (int i = 0; i < 16; i++) {
          vec3 d = color - palette[i];
          float dist = dot(d, d);
          if (dist < bestDist) {
            bestDist = dist;
            best = palette[i];
          }
        }
        gl_FragColor = vec4(best, 1.0);
      }
    `,
  });
}
