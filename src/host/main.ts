import type { HostState } from '../../shared/types';
import { connect } from '../net';
import { guard } from '../session';
import { mountPanel, renderBetting, renderControls, renderRaceBoard, renderResult } from './panel';
import { createScene } from './scene';

document.body.classList.add('host');
const { main } = await guard('host');
main.className = 'host-layout';
const stage = document.createElement('div');
stage.className = 'stage';
const side = document.createElement('div');
side.className = 'side';
main.append(stage, side);
mountPanel(side);

const scene = createScene(stage);

let prevPhase: HostState['phase'] | null = null;
let latest: HostState | null = null;
/** El panel de resultado espera a que termine el photo finish. */
let resultReady = false;

connect((state) => {
  const s = state as HostState;
  latest = s;
  scene.setRace(s.phase === 'racing' || s.phase === 'finished' ? s.race : null, s.phase);
  renderControls(s);
  renderBetting(s);
  renderRaceBoard(s);

  if (s.phase === 'finished' && prevPhase !== 'finished') {
    resultReady = false;
    // al recargar ya en 'finished' no se repite la animación
    if (prevPhase !== null) scene.finish(s.result?.photoFinish ?? null);
    scene.whenIdle().then(() => {
      resultReady = true;
      if (latest?.phase === 'finished') renderResult(latest);
    });
  }
  if (s.phase !== 'finished' || resultReady) renderResult(s);
  prevPhase = s.phase;
});
