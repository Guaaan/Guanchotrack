import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { RACE_SPEEDS, TRACK_LENGTH } from '../../shared/horses';
import type { HorseDef, HorseNumber, HostState, Phase } from '../../shared/types';
import { horseDefs } from '../horses';
import { hex } from '../palette';
import { createHorse, updateGallop } from './horse';
import { advancesInWindow, damp, dampOmega, gallopRate, type DampState } from './motion';
import { createQuantizePass } from './quantize';
import { createTrack, laneZ, squareToX } from './track';

type Race = HostState['race'];
type PhotoFinish = NonNullable<HostState['result']>['photoFinish'];

/** Resolución interna reducida (look retro) sin perder la lectura de los números finos. */
const PIXEL_SCALE = 0.75;
/** Cámara lateral elevada; mira algo por detrás del líder para encuadrar también al pelotón. */
const FOLLOW_OFFSET = new THREE.Vector3(0, 22, 27);
const LEADER_LEAD = 7;
const PHOTO_OFFSET = new THREE.Vector3(4, 9, 20);
/** Caballos ~1,5× más grandes que el modelo base (US4b). */
const HORSE_SCALE = 1.5;
/** Historial de posiciones guardado: algo más que la ventana de 10 ticks del galope. */
const HISTORY_TICKS = 16;
const PHOTO_FREEZE_MS = 1500;

export interface RaceScene {
  /** Posiciones de la carrera en curso o terminada; `null` vuelve a la salida (apuestas, reinicio). */
  setRace(race: Race, phase: Phase): void;
  /** Reproduce el photo finish si lo hubo; `whenIdle` resuelve cuando termina. */
  finish(photoFinish: PhotoFinish): void;
  whenIdle(): Promise<void>;
  /** Redibuja los caballos cuyo color, número o pelaje cambiaron (solo fuera de carrera). */
  setHorses(defs: readonly HorseDef[]): void;
}

/**
 * Rótulo dibujado en un canvas pequeño y binarizado: sin el antialiasing del texto del
 * navegador, solo pixeles `yellow` (sombra) y `black` (letras), escalados con CSS pixelado.
 */
function createPixelLabel(text: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 168;
  canvas.height = 20;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 16px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const draw = (dx: number, dy: number) => {
    const layer = document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const l = layer.getContext('2d')!;
    l.font = ctx.font;
    l.textAlign = 'center';
    l.textBaseline = 'middle';
    l.fillText(text, canvas.width / 2 + dx, canvas.height / 2 + dy);
    return l.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const shadow = draw(1, 1);
  const letters = draw(0, 0);
  const channels = (token: 'black' | 'yellow') => {
    const n = hex(token);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const out = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < out.data.length; i += 4) {
    const color = letters[i + 3] > 110 ? channels('black') : shadow[i + 3] > 110 ? channels('yellow') : null;
    if (color) out.data.set([...color, 255], i);
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

export function createScene(container: HTMLElement): RaceScene {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(PIXEL_SCALE);
  renderer.domElement.className = 'stage-canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(hex('dark-blue'));
  scene.add(new THREE.AmbientLight(hex('white'), 2.2));
  const sun = new THREE.DirectionalLight(hex('white'), 1.1);
  sun.position.set(-10, 20, 15);
  scene.add(sun);
  scene.add(createTrack());

  const lookOf = (h: HorseDef) => `${h.color}|${h.numberColor}|${h.coat}|${h.dorsal}`;
  const buildHorse = (h: HorseDef, i: number) => {
    const mesh = createHorse({ color: h.color, number: h.number, dorsal: h.dorsal, coat: h.coat, numberColor: h.numberColor });
    mesh.scale.setScalar(HORSE_SCALE);
    mesh.position.set(squareToX(0), 0, laneZ(i));
    scene.add(mesh);
    return mesh;
  };
  const horses = horseDefs().map(buildHorse);
  const looks = horseDefs().map(lookOf);
  const targets = [0, 0, 0, 0, 0, 0];
  const motion: DampState[] = horses.map(() => ({ x: squareToX(0), v: 0 }));
  /** tick → posiciones, para la cadencia según la racha de cada caballo. */
  const history = new Map<number, number[]>();
  let racing = false;
  let tick = 0;
  let tickMs: number = RACE_SPEEDS.normal;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
  const lookAt = new THREE.Vector3();
  let camX = 0;

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(PIXEL_SCALE);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(createQuantizePass());

  // capa DOM del photo finish (destello blanco + rótulo)
  const flash = document.createElement('div');
  flash.className = 'photo-flash';
  flash.hidden = true;
  const label = createPixelLabel('PHOTO FINISH');
  label.className = 'photo-label';
  label.hidden = true;
  container.append(flash, label);

  let mode: 'follow' | 'photo' | 'frozen' = 'follow';
  let photoT = 0;
  let idle: Promise<void> = Promise.resolve();
  let resolveIdle: (() => void) | null = null;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();

  const snapToStart = () => {
    horses.forEach((h, i) => {
      motion[i] = { x: squareToX(0), v: 0 };
      h.position.x = squareToX(0);
      updateGallop(h, 10, 0);
    });
    history.clear();
    racing = false;
    tick = 0;
    camX = 0;
  };

  const finishX = squareToX(TRACK_LENGTH);
  let last = performance.now();

  const frame = () => {
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (mode === 'frozen') return; // imagen congelada durante el destello

    let leader = 0;
    const omega = dampOmega(tickMs);
    horses.forEach((h, i) => {
      const tx = squareToX(targets[i]);
      motion[i] = damp(motion[i], tx, dt, omega);
      h.position.x = motion[i].x;
      // en carrera todos galopan siempre; al terminar, cada uno se detiene al llegar a su casilla
      const arrived = Math.abs(tx - motion[i].x) < 0.05 && Math.abs(motion[i].v) < 0.2;
      const rate = racing || !arrived ? gallopRate(advancesInWindow(history, tick, i), tickMs) : 0;
      updateGallop(h, dt, rate);
      leader = Math.max(leader, h.position.x);
    });

    if (mode === 'photo') {
      photoT += dt;
      const p = 1 - Math.exp(-dt * 4);
      camera.position.lerp(new THREE.Vector3(finishX, 0, 0).add(PHOTO_OFFSET), p);
      lookAt.lerp(new THREE.Vector3(finishX, 1.5, 0), p);
      if (photoT > 0.9) {
        mode = 'frozen';
        composer.render();
        label.hidden = false;
        // destello en pasos sólidos (sin transparencias, que mezclarían colores fuera de paleta)
        for (const [at, on] of [[0, true], [90, false], [180, true], [270, false]] as const) {
          setTimeout(() => (flash.hidden = !on), at);
        }
        setTimeout(() => {
          flash.hidden = true;
          label.hidden = true;
          mode = 'follow';
          resolveIdle?.();
          resolveIdle = null;
        }, PHOTO_FREEZE_MS);
        return;
      }
    } else {
      const focus = Math.max(Math.min(leader, finishX) - LEADER_LEAD, 0);
      camX += (focus - camX) * (1 - Math.exp(-dt * 2.5));
      camera.position.set(camX, 0, 0).add(FOLLOW_OFFSET);
      lookAt.set(camX, 1, 0);
    }
    camera.lookAt(lookAt);
    composer.render();
  };
  frame();

  return {
    setRace(race, phase) {
      if (!race || race.tick === 0 || race.tick < tick) {
        targets.fill(0);
        snapToStart();
        if (!race) return;
      }
      // al entrar a mitad de carrera (o con la ronda terminada) no hay historial: se coloca todo en su sitio
      const joining = tick === 0 && race.tick > 0;
      tick = race.tick;
      tickMs = race.tickMs;
      racing = phase === 'racing';
      for (const [horse, square] of Object.entries(race.positions)) {
        targets[Number(horse as unknown as HorseNumber) - 1] = square;
      }
      if (joining) {
        targets.forEach((square, i) => {
          motion[i] = { x: squareToX(square), v: 0 };
          horses[i].position.x = motion[i].x;
        });
        camX = Math.max(Math.min(Math.max(...targets.map(squareToX)), finishX) - LEADER_LEAD, 0);
      }
      history.set(tick, [...targets]);
      for (const t of history.keys()) if (t < tick - HISTORY_TICKS) history.delete(t);
    },
    finish(photoFinish) {
      if (!photoFinish) return;
      mode = 'photo';
      photoT = 0;
      idle = new Promise((resolve) => (resolveIdle = resolve));
    },
    whenIdle: () => idle,
    setHorses(defs) {
      defs.forEach((def, i) => {
        if (looks[i] === lookOf(def)) return;
        const old = horses[i];
        scene.remove(old);
        old.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            // texturas propias del caballo (manta con número, manchas); geometrías y materiales compartidos se conservan
            for (const m of materials) (m as THREE.MeshLambertMaterial).map?.dispose();
          }
        });
        const mesh = buildHorse(def, i);
        mesh.position.x = old.position.x;
        horses[i] = mesh;
        looks[i] = lookOf(def);
      });
    },
  };
}
