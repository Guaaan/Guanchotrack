import * as THREE from 'three';
import { TRACK_LENGTH } from '../../shared/horses';
import { hex, PALETTE } from '../palette';

/** Largo de una casilla en unidades de escena. */
export const SQUARE = 2;
/** Ancho de un carril. */
export const LANE_WIDTH = 4.2;
const LANES = 6;
const TRACK_WIDTH = LANES * LANE_WIDTH;

export const squareToX = (square: number) => square * SQUARE;
export const laneZ = (index: number) => (index - (LANES - 1) / 2) * LANE_WIDTH;

const lambert = (token: Parameters<typeof hex>[0]) => new THREE.MeshLambertMaterial({ color: hex(token) });

/** Textura a cuadros negro/blanco para la línea de meta. */
function checkerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? PALETTE.black : PALETTE.white;
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

export function createTrack(): THREE.Group {
  const group = new THREE.Group();
  const length = squareToX(TRACK_LENGTH);

  const grass = new THREE.Mesh(new THREE.PlaneGeometry(length + 200, 140), lambert('dark-green'));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(length / 2, -0.02, 0);
  group.add(grass);

  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(length + 30, TRACK_WIDTH), lambert('brown'));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(length / 2, 0, 0);
  group.add(dirt);

  const white = lambert('white');
  // líneas de carril (bordes incluidos)
  const laneLine = new THREE.BoxGeometry(length + 30, 0.02, 0.12);
  for (let i = 0; i <= LANES; i++) {
    const line = new THREE.Mesh(laneLine, white);
    line.position.set(length / 2, 0.01, laneZ(i) - LANE_WIDTH / 2);
    group.add(line);
  }
  // marcas de casilla en ambos bordes, más largas cada 5
  const tick = new THREE.BoxGeometry(0.12, 0.02, 0.5);
  const tickLong = new THREE.BoxGeometry(0.16, 0.02, 1.1);
  for (let s = 1; s < TRACK_LENGTH; s++) {
    for (const side of [-1, 1]) {
      const mark = new THREE.Mesh(s % 5 === 0 ? tickLong : tick, white);
      mark.position.set(squareToX(s), 0.012, side * (TRACK_WIDTH / 2 + 0.4));
      group.add(mark);
    }
  }

  const start = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, TRACK_WIDTH), white);
  start.position.set(squareToX(0), 0.015, 0);
  group.add(start);

  const finish = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.02, TRACK_WIDTH),
    new THREE.MeshLambertMaterial({ map: checkerTexture() }),
  );
  finish.position.set(length, 0.015, 0);
  group.add(finish);

  // postes de meta
  const post = new THREE.CylinderGeometry(0.15, 0.15, 5, 6);
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(post, white);
    p.position.set(length, 2.5, side * (TRACK_WIDTH / 2 + 0.8));
    group.add(p);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.8, TRACK_WIDTH + 1.6),
    new THREE.MeshLambertMaterial({ map: checkerTexture() }),
  );
  banner.position.set(length, 5, 0);
  group.add(banner);

  return group;
}
