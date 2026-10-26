import * as THREE from 'three';
import { COATS, type CoatName, type NumberColor } from '../../shared/horses';
import type { HorseNumber } from '../../shared/types';
import { hex, PALETTE, type ColorToken } from '../palette';

// Geometrías compartidas por los 6 caballos (se crean una sola vez).
const GEO = {
  body: new THREE.CapsuleGeometry(0.45, 1.4, 4, 8),
  neck: new THREE.BoxGeometry(0.35, 0.95, 0.32),
  head: new THREE.BoxGeometry(0.75, 0.34, 0.32),
  mane: new THREE.BoxGeometry(0.14, 0.9, 0.1),
  forelock: new THREE.BoxGeometry(0.16, 0.14, 0.12),
  leg: new THREE.CylinderGeometry(0.09, 0.07, 1.2, 6),
  tail: new THREE.ConeGeometry(0.14, 0.9, 6),
  cloth: new THREE.BoxGeometry(0.8, 0.62, 0.98),
  torso: new THREE.BoxGeometry(0.38, 0.62, 0.42),
  riderHead: new THREE.SphereGeometry(0.18, 6, 4),
  helmet: new THREE.SphereGeometry(0.21, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2),
  arm: new THREE.BoxGeometry(0.42, 0.12, 0.12),
};

const skin = new THREE.MeshLambertMaterial({ color: hex('peach') });
const lambert = (token: ColorToken) => new THREE.MeshLambertMaterial({ color: hex(token) });

// Contorno negro (casco invertido): separa el pelaje de la tierra `brown` de la pista.
const outline = new THREE.MeshBasicMaterial({ color: hex('black'), side: THREE.BackSide });
const OUTLINE = 0.07;

/** Pieza de pelaje con su contorno: copia por detrás algo más grande en cada eje. */
function coatPart(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const shell = new THREE.Mesh(geometry, outline);
  shell.scale.set(1 + (2 * OUTLINE) / size.x, 1 + (2 * OUTLINE) / size.y, 1 + (2 * OUTLINE) / size.z);
  mesh.add(shell);
  return mesh;
}

const LEG_AMPLITUDE = 0.65;
const BOB_HEIGHT = 0.18;
/** Cabeceo máximo del cuello hacia adelante y abajo (radianes). */
const NOD_AMPLITUDE = 0.22;
/** Retardo de la crin respecto del cuello, en fase de zancada. */
const MANE_LAG = 0.9;
const MANE_AMPLITUDE = 0.2;

interface GallopData {
  phase: number;
  rig: THREE.Group;
  neck: THREE.Group;
  mane: THREE.Group;
  legs: { pivot: THREE.Group; offset: number }[];
}

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

/**
 * Número de la manta: fondo del color del caballo, dígito sans-serif de peso normal en su
 * color de número y un contorno fino del color opuesto para leerse sobre cualquier manta.
 */
function numberTexture(color: ColorToken, numberColor: ColorToken, number: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PALETTE[color];
  ctx.fillRect(0, 0, size, size);
  ctx.font = '400 104px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = PALETTE[numberColor === 'white' ? 'black' : 'white'];
  ctx.strokeText(String(number), size / 2, size / 2 + 6);
  ctx.fillStyle = PALETTE[numberColor];
  ctx.fillText(String(number), size / 2, size / 2 + 6);
  return canvasTexture(canvas);
}

/** Generador fijo por caballo: las manchas son iguales en todas las pantallas (no es juego). */
function spotRandom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Pelaje pinto: manchas irregulares (grupos de elipses) sobre el color base. */
function spotsTexture(body: ColorToken, spots: ColorToken, number: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PALETTE[body];
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = PALETTE[spots];
  const rand = spotRandom(number);
  for (let blob = 0; blob < 7; blob++) {
    const cx = rand() * canvas.width;
    const cy = 4 + rand() * (canvas.height - 8);
    for (let part = 0; part < 4; part++) {
      ctx.beginPath();
      ctx.ellipse(cx + (rand() - 0.5) * 12, cy + (rand() - 0.5) * 8, 4 + rand() * 6, 3 + rand() * 4, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // sin antialias: cada pixel queda en uno de los dos colores
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const base = parseInt(PALETTE[body].slice(1), 16);
  const spot = parseInt(PALETTE[spots].slice(1), 16);
  const channels = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const [br, bg, bb] = channels(base);
  const [sr, sg, sb] = channels(spot);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = img.data;
    const toSpot = (d[i] - br) ** 2 + (d[i + 1] - bg) ** 2 + (d[i + 2] - bb) ** 2 > (d[i] - sr) ** 2 + (d[i + 1] - sg) ** 2 + (d[i + 2] - sb) ** 2;
    d.set(toSpot ? [sr, sg, sb, 255] : [br, bg, bb, 255], i);
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(canvas);
}

/**
 * Caballo low-poly con jinete, mirando hacia +x. Pelaje según `coat`; la manta y la camiseta
 * llevan el color del caballo y su número (a ambos lados de la manta y en la espalda del jinete).
 */
export function createHorse({
  color,
  number,
  coat,
  numberColor,
}: {
  color: ColorToken;
  number: HorseNumber;
  coat: CoatName;
  numberColor: NumberColor;
}): THREE.Group {
  const look = COATS[coat];
  const silk = lambert(color);
  const numbered = new THREE.MeshLambertMaterial({ map: numberTexture(color, numberColor, number) });
  const plainCoat = lambert(look.body);
  const patterned = look.spots
    ? new THREE.MeshLambertMaterial({ map: spotsTexture(look.body, look.spots, number) })
    : plainCoat;
  const maneMat = lambert(look.mane);
  const tailMat = lambert(look.tail);

  const horse = new THREE.Group();
  const rig = new THREE.Group();
  horse.add(rig);

  const body = coatPart(GEO.body, patterned);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.55;
  rig.add(body);

  // cuello y cabeza en un pivote sobre la cruz: cabecea con cada zancada
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0.7, 1.75, 0);
  rig.add(neckPivot);

  const neck = coatPart(GEO.neck, patterned);
  neck.position.set(0.25, 0.25, 0);
  neck.rotation.z = -0.6;
  neckPivot.add(neck);

  const head = coatPart(GEO.head, patterned);
  head.position.set(0.65, 0.63, 0);
  head.rotation.z = -0.35;
  neckPivot.add(head);

  // crin: pieza separada sobre el borde trasero del cuello; pivota en la base para ondear
  const mane = new THREE.Group();
  mane.position.set(-0.2, -0.42, 0);
  const maneStrip = coatPart(GEO.mane, maneMat);
  maneStrip.position.set(0, 0.5, 0);
  mane.add(maneStrip);
  const forelock = coatPart(GEO.forelock, maneMat);
  forelock.position.set(0.12, 0.98, 0);
  mane.add(forelock);
  neck.add(mane);

  const tail = coatPart(GEO.tail, tailMat);
  tail.position.set(-1.15, 1.55, 0);
  tail.rotation.z = -2.2;
  rig.add(tail);

  const legs: GallopData['legs'] = [];
  const hips: [number, number, number][] = [
    [0.62, 0.22, 0], // delantera izquierda
    [0.62, -0.22, 0.6],
    [-0.62, 0.22, Math.PI], // traseras en contrafase
    [-0.62, -0.22, Math.PI + 0.6],
  ];
  for (const [x, z, offset] of hips) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.3, z);
    const leg = coatPart(GEO.leg, plainCoat);
    leg.position.y = -0.62;
    pivot.add(leg);
    rig.add(pivot);
    legs.push({ pivot, offset });
  }

  // manta: caras ±z con el número, resto del color del caballo (orden BoxGeometry: +x,-x,+y,-y,+z,-z)
  const cloth = new THREE.Mesh(GEO.cloth, [silk, silk, silk, silk, numbered, numbered]);
  cloth.position.set(-0.05, 1.76, 0);
  rig.add(cloth);

  // jinete: número en la espalda (-x) y en los costados
  const torso = new THREE.Mesh(GEO.torso, [silk, numbered, silk, silk, numbered, numbered]);
  torso.position.set(0.05, 2.45, 0);
  torso.rotation.z = -0.25;
  rig.add(torso);

  const arm = new THREE.Mesh(GEO.arm, silk);
  arm.position.set(0.3, 2.45, 0);
  arm.rotation.z = -0.4;
  rig.add(arm);

  const riderHead = new THREE.Mesh(GEO.riderHead, skin);
  riderHead.position.set(0.15, 2.95, 0);
  rig.add(riderHead);

  const helmet = new THREE.Mesh(GEO.helmet, silk);
  helmet.position.set(0.15, 2.98, 0);
  rig.add(helmet);

  horse.userData.gallop = { phase: number, rig, neck: neckPivot, mane, legs } satisfies GallopData;
  return horse;
}

/**
 * Anima el galope a `rate` zancadas por segundo (0 = detenerse): patas en pares
 * delantero/trasero en contrafase, rebote del cuerpo, cabeceo del cuello hacia adelante y
 * abajo en cada zancada y la crin acompañando con algo de retardo.
 */
export function updateGallop(horse: THREE.Group, dt: number, rate: number): void {
  const g = horse.userData.gallop as GallopData;
  if (rate > 0) {
    g.phase += dt * rate * Math.PI * 2;
    for (const { pivot, offset } of g.legs) pivot.rotation.z = Math.sin(g.phase + offset) * LEG_AMPLITUDE;
    g.rig.position.y = Math.abs(Math.sin(g.phase)) * BOB_HEIGHT;
    // máximo cabeceo cuando las delanteras van hacia atrás (apoyo)
    g.neck.rotation.z = -NOD_AMPLITUDE * (0.5 - 0.5 * Math.sin(g.phase));
    g.mane.rotation.z = MANE_AMPLITUDE * (0.5 - 0.5 * Math.sin(g.phase - MANE_LAG));
  } else {
    const k = 1 - Math.exp(-dt * 8);
    for (const { pivot } of g.legs) pivot.rotation.z += (0 - pivot.rotation.z) * k;
    g.rig.position.y += (0 - g.rig.position.y) * k;
    g.neck.rotation.z += (0 - g.neck.rotation.z) * k;
    g.mane.rotation.z += (0 - g.mane.rotation.z) * k;
  }
}
